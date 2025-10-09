from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect, Body
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import socketio
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import secrets
import string
import json
import zlib
import base64
import aiofiles
from PIL import Image
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / 'uploads'
UPLOADS_DIR.mkdir(exist_ok=True)

# Create Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    logger=True,
    engineio_logger=True
)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# WebRTC signaling storage (in-memory for MVP)  
webrtc_signals: Dict[str, List[Dict]] = {}
active_connections: Dict[str, Dict[str, Any]] = {}
voice_channel_rooms: Dict[str, set] = {}  # Track users in voice channels

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============= MODELS =============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    access_code: str
    username: str = "Usuario"
    description: str = ""
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    aura_color: str = "#8B5CF6"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    access_code: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    description: Optional[str] = None
    aura_color: Optional[str] = None

class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    avatar_url: Optional[str]
    aura_color: str
    content: str
    message_type: str = "text"
    file_url: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageCreate(BaseModel):
    user_id: str
    content: str
    message_type: str = "text"
    file_url: Optional[str] = None

class VoiceChannel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    aura_color: str
    creator_id: str
    is_ghost_mode: bool = False
    participants: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VoiceChannelCreate(BaseModel):
    name: str
    aura_color: str
    creator_id: str
    is_ghost_mode: bool = False

class SignalData(BaseModel):
    from_user: str
    to_user: str
    channel_id: str
    signal_type: str  # offer, answer, ice-candidate
    data: Dict[str, Any]

# ============= HELPER FUNCTIONS =============

def generate_access_code() -> str:
    characters = string.ascii_letters + string.digits
    return ''.join(secrets.choice(characters) for _ in range(16))

def compress_message(text: str) -> str:
    compressed = zlib.compress(text.encode('utf-8'))
    return base64.b64encode(compressed).decode('utf-8')

def decompress_message(compressed_text: str) -> str:
    try:
        compressed = base64.b64decode(compressed_text.encode('utf-8'))
        return zlib.decompress(compressed).decode('utf-8')
    except:
        return compressed_text

async def prepare_for_mongo(data: dict) -> dict:
    if isinstance(data.get('created_at'), datetime):
        data['created_at'] = data['created_at'].isoformat()
    if isinstance(data.get('last_seen'), datetime):
        data['last_seen'] = data['last_seen'].isoformat()
    if isinstance(data.get('timestamp'), datetime):
        data['timestamp'] = data['timestamp'].isoformat()
    return data

async def parse_from_mongo(item: dict) -> dict:
    if isinstance(item.get('created_at'), str):
        item['created_at'] = datetime.fromisoformat(item['created_at'])
    if isinstance(item.get('last_seen'), str):
        item['last_seen'] = datetime.fromisoformat(item['last_seen'])
    if isinstance(item.get('timestamp'), str):
        item['timestamp'] = datetime.fromisoformat(item['timestamp'])
    return item

# ============= SOCKET.IO EVENT HANDLERS =============

@sio.event
async def connect(sid, environ):
    logger.info(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    logger.info(f"Client {sid} disconnected")
    
    # Clean up user from all voice channel rooms
    for channel_id, users in voice_channel_rooms.items():
        if sid in users:
            users.remove(sid)
            # Notify other users in the channel
            await sio.emit('user_left_voice', {
                'user_id': sid,  # We'll improve this with actual user mapping
                'username': 'User'
            }, room=f'voice_{channel_id}')

@sio.event
async def join_voice_channel(sid, data):
    channel_id = data.get('channel_id')
    user_id = data.get('user_id')
    
    logger.info(f"User {user_id} joining voice channel {channel_id}")
    
    # Join Socket.IO room
    await sio.enter_room(sid, f'voice_{channel_id}')
    
    # Track in voice channel rooms
    if channel_id not in voice_channel_rooms:
        voice_channel_rooms[channel_id] = set()
    voice_channel_rooms[channel_id].add(sid)
    
    # Notify other users in the channel
    await sio.emit('user_joined_voice', {
        'user_id': user_id,
        'username': f'User_{user_id[:8]}'  # Simplified for now
    }, room=f'voice_{channel_id}', skip_sid=sid)

@sio.event
async def leave_voice_channel(sid, data):
    channel_id = data.get('channel_id')
    user_id = data.get('user_id')
    
    logger.info(f"User {user_id} leaving voice channel {channel_id}")
    
    # Leave Socket.IO room
    await sio.leave_room(sid, f'voice_{channel_id}')
    
    # Remove from tracking
    if channel_id in voice_channel_rooms:
        voice_channel_rooms[channel_id].discard(sid)
    
    # Notify other users
    await sio.emit('user_left_voice', {
        'user_id': user_id,
        'username': f'User_{user_id[:8]}'
    }, room=f'voice_{channel_id}')

@sio.event
async def webrtc_signal(sid, data):
    """Handle WebRTC signaling between users"""
    signal_type = data.get('signal_type')
    from_user = data.get('from_user')
    to_user = data.get('to_user')
    channel_id = data.get('channel_id')
    signal_data = data.get('data')
    
    logger.info(f"WebRTC signal: {signal_type} from {from_user} to {to_user} in channel {channel_id}")
    
    # Find the target user's socket ID (simplified - in production you'd maintain user->sid mapping)
    target_room = f'voice_{channel_id}'
    
    # Emit to specific user in the channel (Socket.IO will handle delivery)
    await sio.emit(f'webrtc_{signal_type}', {
        'from_user': from_user,
        'to_user': to_user,
        'channel_id': channel_id,
        **signal_data
    }, room=target_room)

# ============= API ENDPOINTS =============

@api_router.post("/auth/register")
async def register_user():
    access_code = generate_access_code()
    
    existing = await db.users.find_one({"access_code": access_code})
    while existing:
        access_code = generate_access_code()
        existing = await db.users.find_one({"access_code": access_code})
    
    user = User(access_code=access_code)
    user_dict = await prepare_for_mongo(user.model_dump())
    await db.users.insert_one(user_dict)
    
    return {"access_code": access_code, "user": user}

@api_router.post("/auth/login")
async def login_user(user_create: UserCreate):
    user_data = await db.users.find_one({"access_code": user_create.access_code}, {"_id": 0})
    
    if not user_data:
        raise HTTPException(status_code=404, detail="Código de acceso inválido")
    
    user_data = await parse_from_mongo(user_data)
    
    await db.users.update_one(
        {"access_code": user_create.access_code},
        {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    return user_data

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    user_data = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return await parse_from_mongo(user_data)

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user_update: UserUpdate):
    update_data = {k: v for k, v in user_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No hay datos para actualizar")
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    return {"message": "Perfil actualizado"}

@api_router.post("/upload/{user_id}/{upload_type}")
async def upload_file(user_id: str, upload_type: str, file: UploadFile = File(...)):
    try:
        ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
        filename = f"{user_id}_{upload_type}_{uuid.uuid4()}.{ext}"
        file_path = UPLOADS_DIR / filename
        
        contents = await file.read()
        
        # Don't compress GIFs or WEBP
        if upload_type in ['avatar', 'banner'] and ext.lower() not in ['gif', 'webp']:
            try:
                img = Image.open(io.BytesIO(contents))
                if not getattr(img, 'is_animated', False):
                    if upload_type == 'avatar':
                        img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                    elif upload_type == 'banner':
                        img.thumbnail((1200, 400), Image.Resampling.LANCZOS)
                    
                    output = io.BytesIO()
                    img.save(output, format='PNG', optimize=True)
                    contents = output.getvalue()
            except Exception as e:
                logger.error(f"Image processing error: {e}")
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(contents)
        
        file_url = f"/api/files/{filename}"
        
        if upload_type == 'avatar':
            await db.users.update_one({"id": user_id}, {"$set": {"avatar_url": file_url}})
        elif upload_type == 'banner':
            await db.users.update_one({"id": user_id}, {"$set": {"banner_url": file_url}})
        
        return {"file_url": file_url}
    
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/files/{filename}")
async def get_file(filename: str):
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(file_path)

@api_router.post("/messages", response_model=Message)
async def create_message(message: MessageCreate):
    user_data = await db.users.find_one({"id": message.user_id}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    compressed_content = compress_message(message.content)
    
    msg = Message(
        user_id=message.user_id,
        username=user_data.get('username', 'Usuario'),
        avatar_url=user_data.get('avatar_url'),
        aura_color=user_data.get('aura_color', '#8B5CF6'),
        content=compressed_content,
        message_type=message.message_type,
        file_url=message.file_url
    )
    
    msg_dict = await prepare_for_mongo(msg.model_dump())
    await db.messages.insert_one(msg_dict)
    
    return msg

@api_router.get("/messages", response_model=List[Message])
async def get_messages(limit: int = 100):
    messages = await db.messages.find({}, {"_id": 0}).sort("timestamp", 1).to_list(limit)
    
    for msg in messages:
        msg = await parse_from_mongo(msg)
        msg['content'] = decompress_message(msg['content'])
    
    return messages

@api_router.post("/voice-channels", response_model=VoiceChannel)
async def create_voice_channel(channel: VoiceChannelCreate):
    vc = VoiceChannel(**channel.model_dump())
    vc.participants = [channel.creator_id]
    
    vc_dict = await prepare_for_mongo(vc.model_dump())
    await db.voice_channels.insert_one(vc_dict)
    
    # Initialize signaling queue
    webrtc_signals[vc.id] = []
    active_connections[vc.id] = {}
    
    return vc

@api_router.get("/voice-channels", response_model=List[VoiceChannel])
async def get_voice_channels():
    channels = await db.voice_channels.find({}, {"_id": 0}).to_list(100)
    for ch in channels:
        ch = await parse_from_mongo(ch)
    return channels

@api_router.delete("/voice-channels/{channel_id}")
async def delete_voice_channel(channel_id: str):
    result = await db.voice_channels.delete_one({"id": channel_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    if channel_id in webrtc_signals:
        del webrtc_signals[channel_id]
    if channel_id in active_connections:
        del active_connections[channel_id]
    
    return {"message": "Canal eliminado"}

@api_router.post("/voice-channels/{channel_id}/join")
async def join_voice_channel(channel_id: str, user_id: str):
    result = await db.voice_channels.update_one(
        {"id": channel_id},
        {"$addToSet": {"participants": user_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    # Initialize user's connection
    if channel_id not in active_connections:
        active_connections[channel_id] = {}
    active_connections[channel_id][user_id] = {"joined_at": datetime.now(timezone.utc).isoformat()}
    
    channel = await db.voice_channels.find_one({"id": channel_id}, {"_id": 0})
    return channel

@api_router.post("/voice-channels/{channel_id}/leave")
async def leave_voice_channel(channel_id: str, user_id: str):
    result = await db.voice_channels.update_one(
        {"id": channel_id},
        {"$pull": {"participants": user_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    # Remove user's connection
    if channel_id in active_connections and user_id in active_connections[channel_id]:
        del active_connections[channel_id][user_id]
    
    # Check if channel is empty
    channel = await db.voice_channels.find_one({"id": channel_id})
    if channel and len(channel.get('participants', [])) == 0:
        await delete_voice_channel(channel_id)
        return {"message": "Canal eliminado (vacío)"}
    
    return {"message": "Saliste del canal"}

@api_router.put("/voice-channels/{channel_id}/ghost-mode")
async def toggle_ghost_mode(channel_id: str, is_ghost: bool):
    result = await db.voice_channels.update_one(
        {"id": channel_id},
        {"$set": {"is_ghost_mode": is_ghost}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    channel = await db.voice_channels.find_one({"id": channel_id}, {"_id": 0})
    return channel

# ============= WEBRTC SIGNALING ENDPOINTS =============

@api_router.post("/webrtc/signal")
async def send_signal(signal: SignalData):
    """Send WebRTC signal to another user"""
    channel_id = signal.channel_id
    
    if channel_id not in webrtc_signals:
        webrtc_signals[channel_id] = []
    
    webrtc_signals[channel_id].append(signal.model_dump())
    
    # Keep only last 100 signals per channel
    if len(webrtc_signals[channel_id]) > 100:
        webrtc_signals[channel_id] = webrtc_signals[channel_id][-100:]
    
    return {"message": "Signal sent"}

@api_router.get("/webrtc/signals/{channel_id}/{user_id}")
async def get_signals(channel_id: str, user_id: str):
    """Get WebRTC signals for a user"""
    if channel_id not in webrtc_signals:
        return []
    
    # Get signals meant for this user
    user_signals = [
        signal for signal in webrtc_signals[channel_id]
        if signal['to_user'] == user_id
    ]
    
    # Remove retrieved signals
    webrtc_signals[channel_id] = [
        signal for signal in webrtc_signals[channel_id]
        if signal['to_user'] != user_id
    ]
    
    return user_signals

@api_router.get("/voice-channels/{channel_id}/participants")
async def get_channel_participants(channel_id: str):
    """Get detailed participants info"""
    channel = await db.voice_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    participants = []
    for user_id in channel.get('participants', []):
        user_data = await db.users.find_one({"id": user_id}, {"_id": 0, "username": 1, "avatar_url": 1, "aura_color": 1, "id": 1})
        if user_data:
            participants.append(user_data)
    
    return participants

# ============= APP SETUP =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Export socket_app instead of app for Socket.IO support
app = socket_app
