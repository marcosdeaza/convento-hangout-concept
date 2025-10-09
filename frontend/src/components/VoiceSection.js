import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { 
  HeadphonesIcon, 
  MicIcon, 
  MicOffIcon, 
  VolumeIcon, 
  VolumeOffIcon, 
  ScreenShareIcon, 
  GhostIcon, 
  EyeIcon, 
  XIcon,
  PlusIcon,
  CheckIcon 
} from '@/components/Icons';
import './VoiceSection.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Colores predefinidos para auras
const AURA_COLORS = [
  '#8B5CF6', // Violeta
  '#06B6D4', // Cyan
  '#EC4899', // Rosa
  '#10B981', // Verde
  '#F59E0B', // Naranja
  '#EF4444', // Rojo
  '#3B82F6', // Azul
  '#A78BFA', // Morado claro
];

function VoiceSection({
  user,
  voiceChannels,
  activeVoiceChannel,
  setActiveVoiceChannel,
  socket,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [selectedColor, setSelectedColor] = useState(AURA_COLORS[0]);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // WebRTC states
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peerConnections, setPeerConnections] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  // WebRTC Configuration
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    if (!socket) return;

    // WebRTC Signaling handlers
    socket.on('webrtc_offer', handleReceiveOffer);
    socket.on('webrtc_answer', handleReceiveAnswer);
    socket.on('webrtc_ice_candidate', handleReceiveIceCandidate);

    return () => {
      socket.off('webrtc_offer', handleReceiveOffer);
      socket.off('webrtc_answer', handleReceiveAnswer);
      socket.off('webrtc_ice_candidate', handleReceiveIceCandidate);
    };
  }, [socket]);

  const handleCreateChannel = async () => {
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
      setIsGhostMode(false);
      
      // Auto-join the created channel
      await joinChannel(response.data);
    } catch (err) {
      console.error('Error creating channel:', err);
      alert('Error al crear canal');
    } finally {
      setCreating(false);
    }
  };

  const joinChannel = async (channel) => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Join channel on server
      await axios.post(`${API}/voice-channels/${channel.id}/join?user_id=${user.id}`);
      
      setActiveVoiceChannel(channel);

      // Create peer connections for existing participants
      if (channel.participants && channel.participants.length > 1) {
        channel.participants.forEach((participantId) => {
          if (participantId !== user.id) {
            createPeerConnection(participantId, channel.id, true);
          }
        });
      }
    } catch (err) {
      console.error('Error joining channel:', err);
      alert('Error al unirse al canal. Verifica los permisos del micrófono.');
    }
  };

  const leaveChannel = async () => {
    if (!activeVoiceChannel) return;

    try {
      // Stop all tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
      }

      // Close all peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
      setPeerConnections({});

      // Leave channel on server
      await axios.post(
        `${API}/voice-channels/${activeVoiceChannel.id}/leave?user_id=${user.id}`
      );

      setActiveVoiceChannel(null);
      setIsMuted(false);
      setIsDeafened(false);
    } catch (err) {
      console.error('Error leaving channel:', err);
    }
  };

  const createPeerConnection = (remoteUserId, channelId, isInitiator) => {
    const peerConnection = new RTCPeerConnection(configuration);

    // Add local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc_ice_candidate', {
          from_user: user.id,
          to_user: remoteUserId,
          candidate: event.candidate,
          channel_id: channelId,
        });
      }
    };

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      // Play remote audio
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play();
    };

    peerConnectionsRef.current[remoteUserId] = peerConnection;
    setPeerConnections({ ...peerConnectionsRef.current });

    // Create and send offer if initiator
    if (isInitiator) {
      peerConnection
        .createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc_offer', {
            from_user: user.id,
            to_user: remoteUserId,
            offer: peerConnection.localDescription,
            channel_id: channelId,
          });
        })
        .catch((err) => console.error('Error creating offer:', err));
    }

    return peerConnection;
  };

  const handleReceiveOffer = async (data) => {
    const { from_user, offer, channel_id } = data;

    if (!activeVoiceChannel || channel_id !== activeVoiceChannel.id) return;

    const peerConnection = createPeerConnection(from_user, channel_id, false);

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('webrtc_answer', {
        from_user: user.id,
        to_user: from_user,
        answer: peerConnection.localDescription,
        channel_id: channel_id,
      });
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  };

  const handleReceiveAnswer = async (data) => {
    const { from_user, answer } = data;
    const peerConnection = peerConnectionsRef.current[from_user];

    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    }
  };

  const handleReceiveIceCandidate = async (data) => {
    const { from_user, candidate } = data;
    const peerConnection = peerConnectionsRef.current[from_user];

    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
      }
    }
  };

  const toggleDeafen = () => {
    setIsDeafened(!isDeafened);
    // In a real implementation, you'd mute all remote audio elements
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
      }
    } else {
      // Start screen sharing
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenStreamRef.current = stream;
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Replace video track in all peer connections
        const videoTrack = stream.getVideoTracks()[0];
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, stream);
          }
        });

        videoTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.error('Error sharing screen:', err);
        alert('Error al compartir pantalla');
      }
    }
  };

  const toggleGhostMode = async () => {
    if (!activeVoiceChannel) return;

    try {
      const newGhostMode = !activeVoiceChannel.is_ghost_mode;
      await axios.put(
        `${API}/voice-channels/${activeVoiceChannel.id}/ghost-mode?is_ghost=${newGhostMode}`
      );
      setActiveVoiceChannel({
        ...activeVoiceChannel,
        is_ghost_mode: newGhostMode,
      });
    } catch (err) {
      console.error('Error toggling ghost mode:', err);
    }
  };

  return (
    <motion.div
      className="voice-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      data-testid="voice-section"
    >
      {/* Header */}
      <div className="section-header glass">
        <h2 className="section-title">
          <span className="section-icon"><HeadphonesIcon size={28} /></span>
          Canales de Voz
        </h2>
        <motion.button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          data-testid="create-channel-button"
        >
          + Crear Canal
        </motion.button>
      </div>

      {/* Channels Grid */}
      <div className="channels-grid">
        <AnimatePresence>
          {voiceChannels.map((channel) => (
            <VoiceChannelCard
              key={channel.id}
              channel={channel}
              onJoin={() => joinChannel(channel)}
              isActive={activeVoiceChannel?.id === channel.id}
            />
          ))}
        </AnimatePresence>

        {voiceChannels.length === 0 && (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <GhostIcon size={80} color="rgba(248, 250, 252, 0.3)" />
            <p>No hay canales activos</p>
            <p className="empty-hint">Crea uno para empezar</p>
          </motion.div>
        )}
      </div>

      {/* Active Voice Controls */}
      <AnimatePresence>
        {activeVoiceChannel && (
          <motion.div
            className="voice-controls glass"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            data-testid="voice-controls"
          >
            <div className="controls-info">
              <span
                className="connected-indicator"
                style={{ backgroundColor: activeVoiceChannel.aura_color }}
              />
              <div>
                <p className="controls-label">Conectado a</p>
                <p
                  className="controls-channel"
                  style={{ color: activeVoiceChannel.aura_color }}
                >
                  {activeVoiceChannel.name}
                </p>
              </div>
            </div>

            <div className="controls-buttons">
              {activeVoiceChannel.creator_id === user.id && (
                <ControlButton
                  icon={activeVoiceChannel.is_ghost_mode ? <EyeIcon size={20} /> : <GhostIcon size={20} />}
                  label={activeVoiceChannel.is_ghost_mode ? 'Visible' : 'Ocultar'}
                  onClick={toggleGhostMode}
                  active={activeVoiceChannel.is_ghost_mode}
                />
              )}
              <ControlButton
                icon={isMuted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
                label={isMuted ? 'Activar' : 'Silenciar'}
                onClick={toggleMute}
                active={isMuted}
              />
              <ControlButton
                icon={isDeafened ? <VolumeIcon size={20} /> : <VolumeOffIcon size={20} />}
                label={isDeafened ? 'Escuchar' : 'Ensordecer'}
                onClick={toggleDeafen}
                active={isDeafened}
              />
              <ControlButton
                icon={<ScreenShareIcon size={20} />}
                label={isScreenSharing ? 'Detener' : 'Compartir'}
                onClick={toggleScreenShare}
                active={isScreenSharing}
              />
              <ControlButton
                icon={<XIcon size={20} />}
                label="Colgar"
                onClick={leaveChannel}
                danger
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Channel Modal */}
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
            onCreate={handleCreateChannel}
            creating={creating}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function VoiceChannelCard({ channel, onJoin, isActive }) {
  return (
    <motion.div
      className={`voice-channel-card glass-light ${isActive ? 'active' : ''}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.05, y: -5 }}
      onClick={!isActive ? onJoin : undefined}
      style={{
        '--channel-color': channel.aura_color,
        cursor: isActive ? 'default' : 'pointer',
      }}
      data-testid="voice-channel-card"
    >
      <div
        className="channel-aura"
        style={{
          background: `radial-gradient(circle, ${channel.aura_color}40 0%, transparent 70%)`,
        }}
      />
      <div className="channel-icon" style={{ color: channel.aura_color }}>
        🎧
      </div>
      <h3 className="channel-name" style={{ color: channel.aura_color }}>
        {channel.name}
      </h3>
      <div className="channel-participants">
        {channel.participants?.length || 0} conectados
      </div>
      {isActive && <div className="active-badge">● Conectado</div>}
    </motion.div>
  );
}

function ControlButton({ icon, label, onClick, active, danger }) {
  return (
    <motion.button
      className={`control-btn ${active ? 'active' : ''} ${danger ? 'danger' : ''}`}
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      data-testid={`control-${label.toLowerCase()}`}
    >
      <span className="control-icon">{icon}</span>
      <span className="control-label">{label}</span>
    </motion.button>
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
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      data-testid="create-channel-modal"
    >
      <motion.div
        className="modal-content glass"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Crear Canal de Voz</h2>

        <div className="form-group">
          <label>Nombre del canal</label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="Sala de estudios, Gaming, Chill..."
            className="modal-input"
            maxLength={30}
            data-testid="channel-name-input"
          />
        </div>

        <div className="form-group">
          <label>Color del aura</label>
          <div className="color-picker">
            {AURA_COLORS.map((color) => (
              <motion.button
                key={color}
                className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                data-testid={`color-${color}`}
              >
                {selectedColor === color && '✓'}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isGhostMode}
              onChange={(e) => setIsGhostMode(e.target.checked)}
              data-testid="ghost-mode-checkbox"
            />
            <span>Modo Fantasma (privado)</span>
          </label>
          <p className="form-hint">
            El canal no será visible para otros usuarios
          </p>
        </div>

        <div className="modal-actions">
          <motion.button
            className="btn-secondary"
            onClick={onClose}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Cancelar
          </motion.button>
          <motion.button
            className="btn-primary"
            onClick={onCreate}
            disabled={!channelName.trim() || creating}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            data-testid="confirm-create-channel"
          >
            {creating ? 'Creando...' : 'Crear Canal'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default VoiceSection;
