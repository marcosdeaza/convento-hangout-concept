import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { 
  HeadphonesIcon, 
  MicIcon, 
  MicOffIcon, 
  VolumeIcon, 
  VolumeOffIcon,
  XIcon,
  PlusIcon,
  ScreenShareIcon,
  UserIcon
} from '@/components/Icons';
import './VoiceSection.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AURA_COLORS = [
  '#8B5CF6', '#06B6D4', '#EC4899', '#10B981',
  '#F59E0B', '#EF4444', '#3B82F6', '#A78BFA',
];

function VoiceSection({ user, voiceChannels, activeVoiceChannel, setActiveVoiceChannel, onRefresh }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [selectedColor, setSelectedColor] = useState(AURA_COLORS[0]);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Voice states
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteScreens, setRemoteScreens] = useState({});
  
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const signalingPollingRef = useRef(null);
  const [participants, setParticipants] = useState([]);

  // WebRTC Configuration - Enhanced for high quality
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };

  // Enhanced audio constraints for high quality
  const audioConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 2 },
      sampleSize: { ideal: 16 },
    },
  };

  // Audio device states
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // REST API Signaling Polling - Replace Socket.IO
  useEffect(() => {
    if (activeVoiceChannel && user) {
      console.log('🔄 Starting WebRTC signaling polling for channel:', activeVoiceChannel.id);
      
      // Start polling for signals every 1 second
      signalingPollingRef.current = setInterval(async () => {
        try {
          const response = await axios.get(`${API}/webrtc/signals/${activeVoiceChannel.id}/${user.id}`);
          const signals = response.data;
          
          if (signals && signals.length > 0) {
            console.log(`📨 Received ${signals.length} signals`);
            
            for (const signal of signals) {
              switch (signal.signal_type) {
                case 'offer':
                  await handleReceiveOffer(signal);
                  break;
                case 'answer':
                  await handleReceiveAnswer(signal);
                  break;
                case 'ice-candidate':
                  await handleReceiveIceCandidate(signal);
                  break;
              }
            }
          }
        } catch (err) {
          console.error('Error polling WebRTC signals:', err);
        }
      }, 1000);

      // Load participants and refresh periodically
      loadParticipants();
      const participantsInterval = setInterval(loadParticipants, 3000);

      return () => {
        if (signalingPollingRef.current) {
          console.log('🛑 Stopping WebRTC signaling polling');
          clearInterval(signalingPollingRef.current);
        }
        clearInterval(participantsInterval);
      };
    }
  }, [activeVoiceChannel, user]);

  const loadParticipants = async () => {
    if (!activeVoiceChannel) return;
    
    try {
      const response = await axios.get(`${API}/voice-channels/${activeVoiceChannel.id}/participants`);
      setParticipants(response.data);
    } catch (err) {
      console.error('Error loading participants:', err);
    }
  };

  // Get available audio devices
  const getAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
      
      setAudioInputDevices(audioInputs);
      setAudioOutputDevices(audioOutputs);
      
      // Set default devices if none selected
      if (!selectedInputDevice && audioInputs.length > 0) {
        setSelectedInputDevice(audioInputs[0].deviceId);
      }
      if (!selectedOutputDevice && audioOutputs.length > 0) {
        setSelectedOutputDevice(audioOutputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error getting audio devices:', err);
    }
  };

  // Initialize audio devices on component mount
  useEffect(() => {
    getAudioDevices();
  }, []);

  const createChannel = async () => {
    if (!channelName.trim() || creating) return;

    setCreating(true);
    try {
      const response = await axios.post(`${API}/voice-channels`, {
        name: channelName,
        aura_color: selectedColor,
        creator_id: user.id,
        is_ghost_mode: isGhostMode,
      });

      setShowCreateModal(false);
      setChannelName('');
      
      await joinChannel(response.data);
      onRefresh();
    } catch (err) {
      console.error('Error creating channel:', err);
      alert('Error al crear canal');
    } finally {
      setCreating(false);
    }
  };

  const joinChannel = async (channel) => {
    try {
      console.log('🎤 Joining channel:', channel.name);
      
      // Enhanced audio constraints with device selection
      const constraints = {
        audio: {
          ...audioConstraints.audio,
          deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined
        }
      };
      
      // Get high-quality microphone stream with selected device
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      const audioTrack = stream.getAudioTracks()[0];
      console.log('🎧 Audio stream acquired:', {
        deviceId: audioTrack.getSettings().deviceId,
        sampleRate: audioTrack.getSettings().sampleRate,
        channelCount: audioTrack.getSettings().channelCount,
        label: audioTrack.label
      });
      
      // Join on server
      await axios.post(`${API}/voice-channels/${channel.id}/join?user_id=${user.id}`);
      
      setActiveVoiceChannel(channel);
      onRefresh();
      
      // Start connecting to existing participants
      setTimeout(() => {
        initializePeerConnections();
      }, 2000); // Increased timeout for better connection establishment
      
      console.log('✅ Joined channel successfully');
      
    } catch (err) {
      console.error('❌ Error joining channel:', err);
      let errorMessage = 'Error al unirse al canal';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Permiso de micrófono denegado. Por favor permite el acceso y recarga la página.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No se encontró micrófono. Verifica que tienes uno conectado.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'El dispositivo de audio seleccionado no es compatible. Cambia el dispositivo e intenta de nuevo.';
      }
      
      alert(errorMessage);
    }
  };

  const initializePeerConnections = async () => {
    if (!activeVoiceChannel) return;
    
    try {
      // Load current participants and create offers for each
      await loadParticipants();
      
      const otherParticipants = participants.filter(p => p.id !== user.id);
      
      for (const participant of otherParticipants) {
        if (!peerConnectionsRef.current[participant.id]) {
          console.log('🤝 Creating offer for participant:', participant.username);
          await createOfferForUser(participant.id);
        }
      }
    } catch (err) {
      console.error('Error initializing peer connections:', err);
    }
  };

  const leaveChannel = async () => {
    if (!activeVoiceChannel) return;

    try {
      console.log('👋 Leaving channel:', activeVoiceChannel.name);

      // Stop signaling polling
      if (signalingPollingRef.current) {
        clearInterval(signalingPollingRef.current);
        signalingPollingRef.current = null;
      }

      // Stop all local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('🔇 Stopped local track:', track.kind);
        });
        localStreamRef.current = null;
      }

      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
        setIsScreenSharing(false);
      }

      // Close all peer connections
      Object.keys(peerConnectionsRef.current).forEach(userId => {
        const pc = peerConnectionsRef.current[userId];
        pc.close();
        console.log('🔌 Closed connection with:', userId);
      });
      peerConnectionsRef.current = {};
      remoteStreamsRef.current = {};

      // Leave on server
      await axios.post(`${API}/voice-channels/${activeVoiceChannel.id}/leave?user_id=${user.id}`);
      
      setActiveVoiceChannel(null);
      setIsMuted(false);
      setIsDeafened(false);
      setRemoteScreens({});
      setParticipants([]);
      onRefresh();
      
      console.log('✅ Left channel successfully');
    } catch (err) {
      console.error('Error leaving channel:', err);
    }
  };

  const sendSignal = async (toUserId, signalType, data) => {
    try {
      await axios.post(`${API}/webrtc/signal`, {
        from_user: user.id,
        to_user: toUserId,
        channel_id: activeVoiceChannel.id,
        signal_type: signalType,
        data: data
      });
    } catch (err) {
      console.error('Error sending signal:', err);
    }
  };

  const createPeerConnection = (remoteUserId) => {
    console.log(`🤝 Creating peer connection with ${remoteUserId}`);
    const pc = new RTCPeerConnection(rtcConfig);

    // Add local stream with all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, localStreamRef.current);
        console.log(`➕ Added ${track.kind} track to peer connection`);
      });
    }

    // Handle ICE candidates - Use REST API
    pc.onicecandidate = (event) => {
      if (event.candidate && activeVoiceChannel) {
        console.log('🧊 Sending ICE candidate to:', remoteUserId);
        sendSignal(remoteUserId, 'ice-candidate', {
          candidate: event.candidate
        });
      }
    };

    // Handle incoming remote stream - CRITICAL FIX
    pc.ontrack = (event) => {
      console.log('📥 Received track from:', remoteUserId, event.track.kind);
      const [remoteStream] = event.streams;
      
      if (event.track.kind === 'audio') {
        // Create dedicated audio element for this user
        const audioElement = document.createElement('audio');
        audioElement.srcObject = remoteStream;
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.volume = isDeafened ? 0 : 1;
        
        // Set output device if supported
        if (audioElement.setSinkId && selectedOutputDevice) {
          audioElement.setSinkId(selectedOutputDevice).catch(e => {
            console.warn('Could not set audio output device:', e);
          });
        }
        
        // Add to DOM (hidden)
        audioElement.style.display = 'none';
        audioElement.setAttribute('data-user-id', remoteUserId);
        document.body.appendChild(audioElement);
        
        // Store reference
        remoteStreamsRef.current[remoteUserId] = {
          stream: remoteStream,
          audioElement: audioElement
        };
        
        console.log('🔊 Audio element created and playing for:', remoteUserId);
        
      } else if (event.track.kind === 'video') {
        // Handle video/screen share
        setRemoteScreens(prev => ({
          ...prev,
          [remoteUserId]: remoteStream
        }));
        console.log('📺 Video stream received from:', remoteUserId);
      }
      
      // Update UI to show user is connected
      loadParticipants();
    };

    // Enhanced connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${remoteUserId}:`, pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        console.log(`✅ Successfully connected to ${remoteUserId}`);
      } else if (pc.connectionState === 'disconnected') {
        console.log(`⚠️ Disconnected from ${remoteUserId}`);
        // Clean up audio element
        const audioElement = document.querySelector(`audio[data-user-id="${remoteUserId}"]`);
        if (audioElement) {
          audioElement.remove();
        }
        delete remoteStreamsRef.current[remoteUserId];
      } else if (pc.connectionState === 'failed') {
        console.log(`❌ Connection failed with ${remoteUserId}, attempting reconnect...`);
        // Try to reconnect
        setTimeout(() => {
          if (peerConnectionsRef.current[remoteUserId] === pc) {
            createOfferForUser(remoteUserId);
          }
        }, 3000);
      }
    };

    // ICE connection state monitoring
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${remoteUserId}:`, pc.iceConnectionState);
    };

    peerConnectionsRef.current[remoteUserId] = pc;
    return pc;
  };

  const createOfferForUser = async (remoteUserId) => {
    try {
      const pc = createPeerConnection(remoteUserId);
      
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      
      console.log('📤 Sending offer to:', remoteUserId);
      await sendSignal(remoteUserId, 'offer', {
        offer: pc.localDescription
      });
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  };

  const handleReceiveOffer = async (signal) => {
    const { from_user, data } = signal;
    const { offer } = data;
    
    console.log('📨 Received offer from:', from_user);

    const pc = createPeerConnection(from_user);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('📤 Sending answer to:', from_user);
      await sendSignal(from_user, 'answer', {
        answer: pc.localDescription
      });
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  };

  const handleReceiveAnswer = async (signal) => {
    const { from_user, data } = signal;
    const { answer } = data;
    
    console.log('📨 Received answer from:', from_user);

    const pc = peerConnectionsRef.current[from_user];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Answer processed successfully');
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    }
  };

  const handleReceiveIceCandidate = async (signal) => {
    const { from_user, data } = signal;
    const { candidate } = data;
    
    const pc = peerConnectionsRef.current[from_user];

    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('🧊 ICE candidate added from:', from_user);
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log(audioTrack.enabled ? '🔊 Micrófono activado' : '🔇 Micrófono silenciado');
      }
    }
  };

  const toggleDeafen = () => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    
    // Mute/unmute all remote audio elements
    Object.values(remoteStreamsRef.current).forEach((audioData) => {
      if (audioData.audioElement) {
        audioData.audioElement.volume = newDeafened ? 0 : 1;
      }
    });
    
    console.log(newDeafened ? '🙉 Audio silenciado' : '🔊 Audio activado');
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop sharing
      if (screenStream) {
        screenStream.getTracks().forEach(track => {
          track.stop();
          console.log('🖥️ Stopped screen sharing');
        });
        
        // Remove video tracks from peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const videoSenders = pc.getSenders().filter(s => s.track?.kind === 'video');
          videoSenders.forEach(sender => {
            pc.removeTrack(sender);
          });
        });
        
        setScreenStream(null);
        setIsScreenSharing(false);
        setRemoteScreens({});
      }
    } else {
      // Start sharing
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            cursor: 'always',
            mediaSource: 'screen',
            width: { max: 1920 },
            height: { max: 1080 },
            frameRate: { max: 30 }
          },
          audio: false,
        });
        
        setScreenStream(stream);
        setIsScreenSharing(true);
        console.log('🖥️ Started screen sharing');

        // Add to existing peer connections
        const videoTrack = stream.getVideoTracks()[0];
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack).catch(e => console.error('Error replacing video track:', e));
          } else {
            pc.addTrack(videoTrack, stream);
          }
        });

        // Handle screen share ending
        videoTrack.onended = () => {
          console.log('🖥️ Screen share ended by system');
          toggleScreenShare();
        };
      } catch (err) {
        console.error('Error sharing screen:', err);
        alert('Error al compartir pantalla');
      }
    }
  };

  return (
    <motion.div
      className="voice-section-new"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="voice-header glass">
        <h2 className="voice-title">
          <HeadphonesIcon size={32} />
          <span>Canales de Voz</span>
        </h2>
        <motion.button
          className="create-channel-fab"
          onClick={() => setShowCreateModal(true)}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          title="Crear Canal"
        >
          <PlusIcon size={24} />
        </motion.button>
      </div>

      {/* Channels Bubbles */}
      <div className="channels-container">
        <AnimatePresence>
          {voiceChannels.map((channel) => (
            <ChannelBubble
              key={channel.id}
              channel={channel}
              isActive={activeVoiceChannel?.id === channel.id}
              onJoin={() => joinChannel(channel)}
              user={user}
            />
          ))}
        </AnimatePresence>

        {voiceChannels.length === 0 && (
          <motion.div className="empty-voice-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <HeadphonesIcon size={100} color="rgba(139, 92, 246, 0.3)" />
            <h3>No hay canales activos</h3>
            <p>Crea un canal para comenzar</p>
          </motion.div>
        )}
      </div>

      {/* Active Channel View */}
      <AnimatePresence>
        {activeVoiceChannel && (
          <motion.div
            className="active-channel-view"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
          >
            <div className="channel-view-header" style={{ borderTopColor: activeVoiceChannel.aura_color }}>
              <div className="channel-info">
                <h3 style={{ color: activeVoiceChannel.aura_color }}>{activeVoiceChannel.name}</h3>
                <span>{activeVoiceChannel.participants?.length || 0} participantes</span>
              </div>
              <button className="close-view-btn" onClick={leaveChannel}>
                <XIcon size={24} />
              </button>
            </div>

            <div className="channel-view-content">
              {/* Screen Share Preview */}
              {isScreenSharing && screenStream && (
                <div className="screen-preview">
                  <video
                    ref={(video) => {
                      if (video && screenStream) {
                        video.srcObject = screenStream;
                        video.play();
                      }
                    }}
                    autoPlay
                    muted
                    className="screen-video"
                  />
                  <div className="screen-label">Tu pantalla</div>
                </div>
              )}

              {/* Participants */}
              <div className="participants-grid">
                {participants.map((participant) => (
                  <div key={participant.id} className="participant-card">
                    <div 
                      className="participant-avatar"
                      style={{ borderColor: participant.aura_color }}
                    >
                      {participant.avatar_url ? (
                        <img src={participant.avatar_url} alt={participant.username} />
                      ) : (
                        <UserIcon size={32} />
                      )}
                    </div>
                    <span className="participant-name">
                      {participant.id === user.id ? 'Tú' : participant.username}
                    </span>
                    {/* Audio visualizer placeholder */}
                    <div className="audio-indicator">
                      <div className="audio-bars">
                        <div className="bar" />
                        <div className="bar" />
                        <div className="bar" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls Bar */}
            <div className="channel-controls-bar">
              <button
                className={`channel-control-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Activar' : 'Silenciar'}
              >
                {isMuted ? <MicOffIcon size={24} /> : <MicIcon size={24} />}
              </button>

              <button
                className={`channel-control-btn ${isDeafened ? 'deafened' : ''}`}
                onClick={toggleDeafen}
                title={isDeafened ? 'Escuchar' : 'Ensordecer'}
              >
                {isDeafened ? <VolumeOffIcon size={24} /> : <VolumeIcon size={24} />}
              </button>

              <button
                className={`channel-control-btn ${isScreenSharing ? 'sharing' : ''}`}
                onClick={toggleScreenShare}
                title="Compartir pantalla"
              >
                <ScreenShareIcon size={24} />
              </button>

              <button
                className="channel-control-btn disconnect"
                onClick={leaveChannel}
                title="Desconectar"
              >
                <XIcon size={24} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateChannelModal
            channelName={channelName}
            setChannelName={setChannelName}
            selectedColor={selectedColor}
            setSelectedColor={setSelectedColor}
            isGhostMode={isGhostMode}
            setIsGhostMode={setIsGhostMode}
            onClose={() => setShowCreateModal(false)}
            onCreate={createChannel}
            creating={creating}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChannelBubble({ channel, isActive, onJoin, user }) {
  return (
    <motion.div
      className={`channel-bubble ${isActive ? 'active' : ''}`}
      style={{ '--aura-color': channel.aura_color }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: isActive ? 1 : 1.05 }}
      onClick={!isActive ? onJoin : undefined}
    >
      <div className="bubble-glow" style={{ background: `radial-gradient(circle, ${channel.aura_color}60 0%, transparent 70%)` }} />
      
      <div className="bubble-header">
        <h4 style={{ color: channel.aura_color }}>{channel.name}</h4>
        {isActive && <span className="active-badge">• Conectado</span>}
      </div>

      <div className="bubble-participants">
        {channel.participants && channel.participants.length > 0 ? (
          <>
            {channel.participants.slice(0, 4).map((participantId, index) => (
              <div
                key={participantId}
                className="participant-avatar-mini"
                style={{
                  zIndex: 10 - index,
                  marginLeft: index > 0 ? '-8px' : '0',
                  borderColor: channel.aura_color,
                }}
              >
                <UserIcon size={16} />
              </div>
            ))}
            {channel.participants.length > 4 && (
              <span className="more-participants">+{channel.participants.length - 4}</span>
            )}
            <span className="participant-count">{channel.participants.length}</span>
          </>
        ) : (
          <span className="no-participants">Sin participantes</span>
        )}
      </div>
    </motion.div>
  );
}

function CreateChannelModal({
  channelName,
  setChannelName,
  selectedColor,
  setSelectedColor,
  isGhostMode,
  setIsGhostMode,
  onClose,
  onCreate,
  creating,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="create-channel-modal glass"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Crear Canal de Voz</h2>

        <div className="modal-field">
          <label>Nombre del canal</label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="Mi canal"
            maxLength={30}
            autoFocus
          />
        </div>

        <div className="modal-field">
          <label>Color del aura</label>
          <div className="color-grid">
            {AURA_COLORS.map((color) => (
              <button
                key={color}
                className={`color-btn ${selectedColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isGhostMode}
              onChange={(e) => setIsGhostMode(e.target.checked)}
            />
            <span>Modo Fantasma</span>
          </label>
          <p className="field-hint">El canal será privado</p>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={onCreate}
            disabled={!channelName.trim() || creating}
          >
            {creating ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default VoiceSection;
