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
  PlusIcon
} from '@/components/Icons';
import './VoiceSection.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Icono de Settings
const SettingsIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

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
  
  // Audio states
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [audioDevices, setAudioDevices] = useState({ input: [], output: [] });
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  const localStreamRef = useRef(null);

  // Get audio devices
  useEffect(() => {
    loadAudioDevices();
  }, []);

  const loadAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      
      setAudioDevices({ input: inputs, output: outputs });
      
      if (inputs.length > 0) setSelectedInput(inputs[0].deviceId);
      if (outputs.length > 0) setSelectedOutput(outputs[0].deviceId);
    } catch (err) {
      console.error('Error loading audio devices:', err);
    }
  };

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
      setIsGhostMode(false);
      
      // Auto-join
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
      
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInput ? { exact: selectedInput } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;
      
      // Join on server
      await axios.post(`${API}/voice-channels/${channel.id}/join?user_id=${user.id}`);
      
      setActiveVoiceChannel(channel);
      console.log('✅ Joined channel successfully');
      
    } catch (err) {
      console.error('❌ Error joining channel:', err);
      alert('Error al unirse al canal. Verifica los permisos del micrófono.');
    }
  };

  const leaveChannel = async () => {
    if (!activeVoiceChannel) return;

    try {
      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      // Leave on server
      await axios.post(`${API}/voice-channels/${activeVoiceChannel.id}/leave?user_id=${user.id}`);
      
      setActiveVoiceChannel(null);
      setIsMuted(false);
      setIsDeafened(false);
      onRefresh();
    } catch (err) {
      console.error('Error leaving channel:', err);
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
  };

  const changeInputDevice = async (deviceId) => {
    setSelectedInput(deviceId);
    
    if (localStreamRef.current && activeVoiceChannel) {
      // Restart stream with new device
      localStreamRef.current.getTracks().forEach(track => track.stop());
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        localStreamRef.current = stream;
        console.log('✅ Input device changed');
      } catch (err) {
        console.error('Error changing input device:', err);
      }
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
          className="btn-primary create-channel-btn"
          onClick={() => setShowCreateModal(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          data-testid="create-channel-button"
        >
          <PlusIcon size={18} />
          Crear Canal
        </motion.button>
      </div>

      {/* Channels Grid */}
      <div className="channels-grid">
        <AnimatePresence>
          {voiceChannels.map((channel) => (
            <motion.div
              key={channel.id}
              className={`voice-channel-card glass-light ${activeVoiceChannel?.id === channel.id ? 'active' : ''}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.05, y: -5 }}
              onClick={() => !activeVoiceChannel && joinChannel(channel)}
              style={{ cursor: activeVoiceChannel?.id === channel.id ? 'default' : 'pointer' }}
              data-testid="voice-channel-card"
            >
              <div className="channel-icon" style={{ color: channel.aura_color }}>
                <HeadphonesIcon size={48} />
              </div>
              <h3 className="channel-name" style={{ color: channel.aura_color }}>
                {channel.name}
              </h3>
              <div className="channel-participants">
                {channel.participants?.length || 0} conectados
              </div>
              {activeVoiceChannel?.id === channel.id && (
                <div className="active-badge">• Conectado</div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {voiceChannels.length === 0 && (
          <div className="empty-state">
            <HeadphonesIcon size={80} color="rgba(248, 250, 252, 0.3)" />
            <p>No hay canales activos</p>
            <p className="empty-hint">Crea uno para empezar</p>
          </div>
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
          >
            <div className="controls-info">
              <span className="connected-indicator" style={{ backgroundColor: activeVoiceChannel.aura_color }} />
              <div>
                <p className="controls-label">Conectado a</p>
                <p className="controls-channel" style={{ color: activeVoiceChannel.aura_color }}>
                  {activeVoiceChannel.name}
                </p>
              </div>
            </div>

            <div className="controls-buttons">
              <button
                className={`control-btn ${isMuted ? 'active' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Activar micrófono' : 'Silenciar'}
              >
                {isMuted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
              </button>

              <button
                className={`control-btn ${isDeafened ? 'active' : ''}`}
                onClick={toggleDeafen}
                title={isDeafened ? 'Activar audio' : 'Ensordecer'}
              >
                {isDeafened ? <VolumeOffIcon size={20} /> : <VolumeIcon size={20} />}
              </button>

              <button
                className="control-btn"
                onClick={() => setShowSettings(!showSettings)}
                title="Configuración"
              >
                <SettingsIcon size={20} />
              </button>

              <button
                className="control-btn danger"
                onClick={leaveChannel}
                title="Colgar"
              >
                <XIcon size={20} />
              </button>
            </div>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  className="settings-panel"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="setting-group">
                    <label>Dispositivo de entrada</label>
                    <select
                      value={selectedInput}
                      onChange={(e) => changeInputDevice(e.target.value)}
                      className="device-select"
                    >
                      {audioDevices.input.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Micrófono ${device.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="setting-group">
                    <label>Dispositivo de salida</label>
                    <select
                      value={selectedOutput}
                      onChange={(e) => setSelectedOutput(e.target.value)}
                      className="device-select"
                    >
                      {audioDevices.output.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Altavoz ${device.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Channel Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
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
                  placeholder="Mi canal de voz"
                  className="modal-input"
                  maxLength={30}
                />
              </div>

              <div className="form-group">
                <label>Color del aura</label>
                <div className="color-picker">
                  {AURA_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isGhostMode}
                    onChange={(e) => setIsGhostMode(e.target.checked)}
                  />
                  <span>Modo Fantasma (privado)</span>
                </label>
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={createChannel}
                  disabled={!channelName.trim() || creating}
                >
                  {creating ? 'Creando...' : 'Crear Canal'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default VoiceSection;
