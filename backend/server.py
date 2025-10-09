from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
import secrets
import string
import json
import zlib
import base64
import socketio
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

# Socket.IO setup
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# WebRTC signaling storage
webrtc_rooms: Dict[str, Dict] = {}

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
    content: str  # Compressed base64
    message_type: str = "text"  # text, image, audio, file, link
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

# ============= HELPER FUNCTIONS =============

def generate_access_code() -> str:
    """Generate a unique 16-character access code"""
    characters = string.ascii_letters + string.digits
    return ''.join(secrets.choice(characters) for _ in range(16))

def compress_message(text: str) -> str:
    """Compress text message to save storage"""
    compressed = zlib.compress(text.encode('utf-8'))
    return base64.b64encode(compressed).decode('utf-8')

def decompress_message(compressed_text: str) -> str:
    """Decompress message"""
    try:
        compressed = base64.b64decode(compressed_text.encode('utf-8'))
        return zlib.decompress(compressed).decode('utf-8')
    except:
        return compressed_text  # Return as-is if decompression fails

async def prepare_for_mongo(data: dict) -> dict:
    """Prepare data for MongoDB storage"""
    if isinstance(data.get('created_at'), datetime):
        data['created_at'] = data['created_at'].isoformat()
    if isinstance(data.get('last_seen'), datetime):
        data['last_seen'] = data['last_seen'].isoformat()
    if isinstance(data.get('timestamp'), datetime):
        data['timestamp'] = data['timestamp'].isoformat()
    return data

async def parse_from_mongo(item: dict) -> dict:
    """Parse data from MongoDB"""
    if isinstance(item.get('created_at'), str):
        item['created_at'] = datetime.fromisoformat(item['created_at'])
    if isinstance(item.get('last_seen'), str):
        item['last_seen'] = datetime.fromisoformat(item['last_seen'])
    if isinstance(item.get('timestamp'), str):
        item['timestamp'] = datetime.fromisoformat(item['timestamp'])
    return item

# ============= API ENDPOINTS =============

@api_router.post("/auth/register")
async def register_user():
    """Generate a new access code and create user"""
    access_code = generate_access_code()
    
    # Check if code already exists (very unlikely but possible)
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
    """Login with access code"""
    user_data = await db.users.find_one({"access_code": user_create.access_code}, {"_id": 0})
    
    if not user_data:
        raise HTTPException(status_code=404, detail="Código de acceso inválido")
    
    user_data = await parse_from_mongo(user_data)
    
    # Update last seen
    await db.users.update_one(
        {"access_code": user_create.access_code},
        {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    return user_data

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user by ID"""
    user_data = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return await parse_from_mongo(user_data)

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, user_update: UserUpdate):
    """Update user profile"""
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
    """Upload avatar, banner, or other files"""
    try:
        # Generate unique filename
        ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
        filename = f"{user_id}_{upload_type}_{uuid.uuid4()}.{ext}"
        file_path = UPLOADS_DIR / filename
        
        # Read and process file
        contents = await file.read()
        
        # If it's an image (not GIF), compress it
        if upload_type in ['avatar', 'banner'] and ext.lower() not in ['gif']:
            try:
                img = Image.open(io.BytesIO(contents))
                # Resize based on type
                if upload_type == 'avatar':
                    img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                elif upload_type == 'banner':
                    img.thumbnail((1200, 400), Image.Resampling.LANCZOS)
                
                # Save compressed
                output = io.BytesIO()
                img.save(output, format='PNG', optimize=True)
                contents = output.getvalue()
            except Exception as e:
                logger.error(f"Image processing error: {e}")
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(contents)
        
        file_url = f"/api/files/{filename}"
        
        # Update user profile if avatar or banner
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
    """Serve uploaded files"""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(file_path)

@api_router.post("/messages", response_model=Message)
async def create_message(message: MessageCreate):
    """Create a new message (with compression)"""
    # Get user info
    user_data = await db.users.find_one({"id": message.user_id}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Compress message content
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
    
    # Emit via Socket.IO
    decompressed_msg = msg.model_dump()
    decompressed_msg['content'] = decompress_message(compressed_content)
    await sio.emit('new_message', decompressed_msg)
    
    return msg

@api_router.get("/messages", response_model=List[Message])
async def get_messages(limit: int = 100):
    """Get recent messages"""
    messages = await db.messages.find({}, {"_id": 0}).sort("timestamp", 1).to_list(limit)
    
    # Decompress and parse messages
    for msg in messages:
        msg = await parse_from_mongo(msg)
        msg['content'] = decompress_message(msg['content'])
    
    return messages

@api_router.post("/voice-channels", response_model=VoiceChannel)
async def create_voice_channel(channel: VoiceChannelCreate):
    """Create a new voice channel"""
    vc = VoiceChannel(**channel.model_dump())
    vc.participants = [channel.creator_id]
    
    vc_dict = await prepare_for_mongo(vc.model_dump())
    await db.voice_channels.insert_one(vc_dict)
    
    # Initialize WebRTC room
    webrtc_rooms[vc.id] = {"participants": {}, "offers": {}}
    
    # Emit to all clients
    await sio.emit('voice_channel_created', vc.model_dump())
    
    return vc

@api_router.get("/voice-channels", response_model=List[VoiceChannel])
async def get_voice_channels():
    """Get all active voice channels (excluding ghost mode)"""
    channels = await db.voice_channels.find({}, {"_id": 0}).to_list(100)
    
    for ch in channels:
        ch = await parse_from_mongo(ch)
    
    return channels

@api_router.delete("/voice-channels/{channel_id}")
async def delete_voice_channel(channel_id: str):
    """Delete a voice channel"""
    result = await db.voice_channels.delete_one({"id": channel_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    # Clean up WebRTC room
    if channel_id in webrtc_rooms:
        del webrtc_rooms[channel_id]
    
    # Emit deletion
    await sio.emit('voice_channel_deleted', {"channel_id": channel_id})
    
    return {"message": "Canal eliminado"}

@api_router.post("/voice-channels/{channel_id}/join")
async def join_voice_channel(channel_id: str, user_id: str):
    """Join a voice channel"""
    result = await db.voice_channels.update_one(
        {"id": channel_id},
        {"$addToSet": {"participants": user_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    # Emit update
    channel = await db.voice_channels.find_one({"id": channel_id}, {"_id": 0})
    await sio.emit('voice_channel_updated', channel)
    
    return {"message": "Unido al canal"}

@api_router.post("/voice-channels/{channel_id}/leave")
async def leave_voice_channel(channel_id: str, user_id: str):
    """Leave a voice channel"""
    result = await db.voice_channels.update_one(
        {"id": channel_id},
        {"$pull": {"participants": user_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    # Check if channel is empty
    channel = await db.voice_channels.find_one({"id": channel_id})
    if channel and len(channel.get('participants', [])) == 0:
        await delete_voice_channel(channel_id)
    else:
        await sio.emit('voice_channel_updated', channel)
    
    return {"message": "Saliste del canal"}

@api_router.put("/voice-channels/{channel_id}/ghost-mode")
async def toggle_ghost_mode(channel_id: str, is_ghost: bool):
    """Toggle ghost mode for a voice channel"""
    result = await db.voice_channels.update_one(
        {"id": channel_id},
        {"$set": {"is_ghost_mode": is_ghost}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    channel = await db.voice_channels.find_one({"id": channel_id}, {"_id": 0})
    await sio.emit('voice_channel_updated', channel)
    
    return {"message": "Modo fantasma actualizado"}

# ============= SOCKET.IO EVENTS =============

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    room = data.get('room')
    await sio.enter_room(sid, room)
    logger.info(f"Client {sid} joined room {room}")

@sio.event
async def leave_room(sid, data):
    room = data.get('room')
    await sio.leave_room(sid, room)
    logger.info(f"Client {sid} left room {room}")

# WebRTC Signaling
@sio.event
async def webrtc_offer(sid, data):
    """Handle WebRTC offer"""
    channel_id = data.get('channel_id')
    offer = data.get('offer')
    from_user = data.get('from_user')
    to_user = data.get('to_user')
    
    # Forward offer to specific user
    await sio.emit('webrtc_offer', {
        'from_user': from_user,
        'offer': offer,
        'channel_id': channel_id
    }, room=to_user)

@sio.event
async def webrtc_answer(sid, data):
    """Handle WebRTC answer"""
    channel_id = data.get('channel_id')
    answer = data.get('answer')
    from_user = data.get('from_user')
    to_user = data.get('to_user')
    
    # Forward answer to specific user
    await sio.emit('webrtc_answer', {
        'from_user': from_user,
        'answer': answer,
        'channel_id': channel_id
    }, room=to_user)

@sio.event
async def webrtc_ice_candidate(sid, data):
    """Handle ICE candidate"""
    channel_id = data.get('channel_id')
    candidate = data.get('candidate')
    from_user = data.get('from_user')
    to_user = data.get('to_user')
    
    # Forward ICE candidate
    await sio.emit('webrtc_ice_candidate', {
        'from_user': from_user,
        'candidate': candidate,
        'channel_id': channel_id
    }, room=to_user)

# ============= APP SETUP =============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, app)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Export socket_app as the main ASGI application
app = socket_app