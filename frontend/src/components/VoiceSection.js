import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { SimpleWebRTC } from '@/components/SimpleWebRTC';
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
  
  const webrtcRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const [webrtcConnected, setWebrtcConnected] = useState(false);

  // WebRTC Configuration - Production-ready with multiple STUN servers
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },  
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  // PRODUCTION-READY audio constraints
  const audioConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 44100 }, // More compatible than 48000
      channelCount: { ideal: 1 },    // Mono for better compatibility
      sampleSize: { ideal: 16 },
    },
  };

  // Audio device states
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Robust WebRTC Signaling - Works in Kubernetes
  useEffect(() => {
    if (activeVoiceChannel && user) {
      console.log('🔄 Starting robust WebRTC signaling for channel:', activeVoiceChannel.id);
      
      let connectionAttempts = 0;
      const MAX_ATTEMPTS = 3;
      
      const startSignaling = () => {
        console.log('🚀 Starting aggressive WebRTC signaling...');
        
        // AGGRESSIVE polling for production
        signalingPollingRef.current = setInterval(async () => {
          try {
            const response = await axios.get(
              `${API}/webrtc/signals/${activeVoiceChannel.id}/${user.id}`,
              { 
                timeout: 3000,
                headers: {
                  'Cache-Control': 'no-cache',
                  'Pragma': 'no-cache'
                }
              }
            );
            
            const signals = response.data;
            if (signals && signals.length > 0) {
              console.log(`🔥 PROCESSING ${signals.length} CRITICAL WebRTC signals`);
              
              // Process signals in parallel for speed
              const signalPromises = signals.map(async (signal) => {
                try {
                  switch (signal.signal_type) {
                    case 'offer':
                      return handleReceiveOffer(signal);
                    case 'answer':
                      return handleReceiveAnswer(signal);
                    case 'ice-candidate':
                      return handleReceiveIceCandidate(signal);
                  }
                } catch (signalError) {
                  console.error(`❌ Signal ${signal.signal_type} failed:`, signalError);
                }
              });
              
              await Promise.allSettled(signalPromises);
            }
            
            // Connection is alive
            connectionAttempts = 0;
            setSocketConnected(true);
            
          } catch (err) {
            connectionAttempts++;
            console.error(`🚨 SIGNALING FAILED (${connectionAttempts}/${MAX_ATTEMPTS}):`, err.message);
            
            if (connectionAttempts >= MAX_ATTEMPTS) {
              console.log('🔄 RESTARTING signaling - max attempts reached');
              connectionAttempts = 0;
              
              // Brief pause before retry
              setTimeout(() => {
                if (activeVoiceChannel) { // Only restart if still in channel
                  startSignaling();
                }
              }, 2000);
              
              return; // Exit this interval, new one will start
            }
            
            setSocketConnected(false);
          }
        }, 500); // ULTRA FAST polling for production
      };

      // Start signaling
      startSignaling();
      
      // Load and monitor participants
      loadParticipants();
      const participantsInterval = setInterval(loadParticipants, 2500);

      return () => {
        if (signalingPollingRef.current) {
          clearInterval(signalingPollingRef.current);
          signalingPollingRef.current = null;
        }
        clearInterval(participantsInterval);
        setSocketConnected(false);
        console.log('🛑 WebRTC signaling completely stopped');
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
      console.log('🎤 Joining voice channel:', channel.name);
      
      // STEP 1: FORCE microphone access with aggressive fallbacks
      console.log('🎧 FORCING microphone access...');
      
      let stream;
      const attempts = [
        // Attempt 1: High quality with device
        {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 2,
            ...(selectedInputDevice && { deviceId: { exact: selectedInputDevice } })
          }
        },
        // Attempt 2: Default device high quality
        {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000
          }
        },
        // Attempt 3: Basic high quality
        {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        },
        // Attempt 4: Minimal constraints
        { audio: true },
        // Attempt 5: Force any audio device
        { audio: { deviceId: undefined } }
      ];

      let lastError;
      for (let i = 0; i < attempts.length; i++) {
        try {
          console.log(`🎧 Microphone attempt ${i + 1}/${attempts.length}`);
          stream = await navigator.mediaDevices.getUserMedia(attempts[i]);
          console.log(`✅ Microphone success on attempt ${i + 1}`);
          break;
        } catch (error) {
          console.warn(`❌ Attempt ${i + 1} failed:`, error.name);
          lastError = error;
          
          // Wait between attempts
          if (i < attempts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (!stream) {
        throw lastError || new Error('All microphone attempts failed');
      }
      localStreamRef.current = stream;
      
      const audioTrack = stream.getAudioTracks()[0];
      console.log('✅ Microphone access granted:', {
        label: audioTrack.label,
        enabled: audioTrack.enabled,
        muted: audioTrack.muted,
        settings: audioTrack.getSettings()
      });
      
      // STEP 2: Join channel on server
      console.log('🌐 Joining channel on server...');
      await axios.post(`${API}/voice-channels/${channel.id}/join?user_id=${user.id}`);
      
      // STEP 3: Update UI state
      setActiveVoiceChannel(channel);
      setIsMuted(false);
      setIsDeafened(false);
      onRefresh();
      
      console.log('✅ Successfully joined channel on server');
      
      // STEP 4: Initialize WebRTC connections after a delay
      console.log('🔄 Initializing WebRTC connections...');
      setTimeout(() => {
        initializePeerConnections();
      }, 1500);
      
      console.log('🎉 Channel join process completed!');
      
    } catch (err) {
      console.error('❌ Failed to join channel:', err);
      
      // Clean up on error
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      let errorMessage = '';
      let allowDemoMode = false;
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Permiso de micrófono denegado. Haz clic en "Permitir" cuando el navegador lo solicite.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No se encontró micrófono disponible.';
        allowDemoMode = true;
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Problema con el dispositivo de audio seleccionado.';
        // Try with default device
        setSelectedInputDevice('');
      } else if (err.response?.status === 404) {
        errorMessage = 'Canal no encontrado.';
      } else {
        errorMessage = err.message || 'Error desconocido.';
      }
      
      // Offer demo mode for testing environments
      if (allowDemoMode) {
        const demoMode = confirm(
          `${errorMessage}\n\n¿Quieres unirte en MODO DEMO (sin audio)?\n\nEsto es útil para probar la interfaz cuando no hay micrófono disponible.`
        );
        
        if (demoMode) {
          console.log('🎭 Entering DEMO MODE - no audio');
          // Join without audio for UI testing
          try {
            await axios.post(`${API}/voice-channels/${channel.id}/join?user_id=${user.id}`);
            setActiveVoiceChannel(channel);
            setIsMuted(true); // Start muted in demo mode
            onRefresh();
            
            // Show demo warning
            setTimeout(() => {
              alert('🎭 MODO DEMO ACTIVADO\n\nEstás en el canal sin audio. Perfecto para probar la interfaz.\n\nEn producción con micrófono real, el audio funcionará correctamente.');
            }, 1000);
            
            return; // Exit successfully
          } catch (demoErr) {
            console.error('Demo mode failed:', demoErr);
            alert('Error en modo demo: ' + demoErr.message);
          }
        }
      } else {
        alert('Error al unirse al canal: ' + errorMessage);
      }
    }
  };

  const initializePeerConnections = async () => {
    if (!activeVoiceChannel || !localStreamRef.current) {
      console.log('⚠️ Cannot initialize peer connections: missing channel or local stream');
      return;
    }
    
    console.log('🔄 Initializing peer connections for channel:', activeVoiceChannel.id);
    
    try {
      // Load current participants
      await loadParticipants();
      
      // Wait for participants to be loaded
      setTimeout(async () => {
        const currentParticipants = await axios.get(`${API}/voice-channels/${activeVoiceChannel.id}/participants`);
        const otherParticipants = currentParticipants.data.filter(p => p.id !== user.id);
        
        console.log(`👥 Found ${otherParticipants.length} other participants to connect to:`, 
          otherParticipants.map(p => p.username));
        
        for (const participant of otherParticipants) {
          if (!peerConnectionsRef.current[participant.id]) {
            console.log('🤝 Initiating connection with:', participant.username);
            // Add delay between connections to avoid overwhelming
            setTimeout(() => {
              createOfferForUser(participant.id);
            }, Math.random() * 1000);
          } else {
            console.log('✅ Connection already exists with:', participant.username);
          }
        }
      }, 1000);
      
    } catch (err) {
      console.error('❌ Error initializing peer connections:', err);
    }
  };

  const leaveChannel = async () => {
    if (!activeVoiceChannel) {
      console.log('⚠️ No active channel to leave');
      return;
    }

    try {
      console.log('👋 FORCE LEAVING CHANNEL:', activeVoiceChannel.name);

      // STEP 1: Stop all polling/signaling immediately
      if (signalingPollingRef.current) {
        clearInterval(signalingPollingRef.current);
        signalingPollingRef.current = null;
        console.log('✅ Stopped signaling polling');
      }

      // STEP 2: Stop ALL media tracks immediately
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track, index) => {
          track.stop();
          console.log(`🔇 Stopped local ${track.kind} track ${index}`);
        });
        localStreamRef.current = null;
      }

      // STEP 3: Stop screen sharing immediately
      if (screenStream) {
        screenStream.getTracks().forEach((track, index) => {
          track.stop();
          console.log(`🖥️ Stopped screen track ${index}`);
        });
        setScreenStream(null);
        setIsScreenSharing(false);
      }

      // STEP 4: Force close ALL peer connections
      const connectionIds = Object.keys(peerConnectionsRef.current);
      console.log(`🔌 Force closing ${connectionIds.length} peer connections`);
      
      connectionIds.forEach(userId => {
        try {
          const pc = peerConnectionsRef.current[userId];
          if (pc) {
            pc.close();
            console.log(`✅ Closed peer connection with ${userId}`);
          }
          
          // Force cleanup audio elements
          cleanupUserConnection(userId);
          
        } catch (err) {
          console.error(`❌ Error closing connection with ${userId}:`, err);
        }
      });
      
      // STEP 5: Clear ALL references immediately
      peerConnectionsRef.current = {};
      remoteStreamsRef.current = {};
      pendingIceCandidates.current = {};

      // STEP 6: Force UI reset FIRST (so user sees immediate response)
      setActiveVoiceChannel(null);
      setIsMuted(false);
      setIsDeafened(false);
      setRemoteScreens({});
      setParticipants([]);
      setShowDeviceSettings(false);
      setSocketConnected(false);
      
      console.log('✅ UI state reset - user should see they left');

      // STEP 7: Leave on server (async, don't wait)
      try {
        await axios.post(`${API}/voice-channels/${activeVoiceChannel.id}/leave?user_id=${user.id}`, {}, {
          timeout: 3000
        });
        console.log('✅ Successfully left on server');
      } catch (serverErr) {
        console.warn('⚠️ Server leave failed but continuing:', serverErr.message);
      }

      // STEP 8: Refresh channels list
      setTimeout(() => {
        onRefresh();
      }, 500);
      
      console.log('🎉 SUCCESSFULLY LEFT CHANNEL - USER IS FREE!');
      
    } catch (err) {
      console.error('❌ Error in leave process:', err);
      
      // FORCE UI reset even if something fails
      setActiveVoiceChannel(null);
      setIsMuted(false);
      setIsDeafened(false);
      setRemoteScreens({});
      setParticipants([]);
      setShowDeviceSettings(false);
      
      console.log('🚨 EMERGENCY EXIT - UI reset to free user');
    }
  };

  const sendSignal = async (toUserId, signalType, data) => {
    try {
      console.log(`📤 Sending ${signalType} to ${toUserId}`);
      
      await axios.post(`${API}/webrtc/signal`, {
        from_user: user.id,
        to_user: toUserId,
        channel_id: activeVoiceChannel.id,
        signal_type: signalType,
        data: data
      }, { timeout: 8000 });
      
      console.log(`✅ Signal ${signalType} sent successfully`);
    } catch (err) {
      console.error(`❌ Failed to send ${signalType} signal:`, err);
      throw err; // Re-throw to handle in calling function
    }
  };

  // Removed Socket.IO event handlers - using REST API polling

  const createPeerConnection = (remoteUserId) => {
    console.log(`🤝 Creating peer connection with ${remoteUserId}`);
    const pc = new RTCPeerConnection(rtcConfig);

    // Add local stream with all tracks - CRITICAL FIX
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStreamRef.current);
          console.log(`✅ Successfully added ${track.kind} track to peer connection with ${remoteUserId}`);
          console.log(`Track settings:`, track.getSettings());
        } catch (error) {
          console.error(`❌ Failed to add ${track.kind} track:`, error);
        }
      });
    } else {
      console.error('❌ No local stream available when creating peer connection');
    }

    // Handle ICE candidates - AGGRESSIVE sending
    pc.onicecandidate = async (event) => {
      if (event.candidate && activeVoiceChannel) {
        console.log('🧊 SENDING ICE candidate to:', remoteUserId);
        
        try {
          await sendSignal(remoteUserId, 'ice-candidate', {
            candidate: {
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
              usernameFragment: event.candidate.usernameFragment
            }
          });
          console.log('✅ ICE candidate sent successfully');
        } catch (err) {
          console.error('❌ Failed to send ICE candidate:', err);
          // Retry once after delay
          setTimeout(async () => {
            try {
              await sendSignal(remoteUserId, 'ice-candidate', {
                candidate: {
                  candidate: event.candidate.candidate,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  sdpMid: event.candidate.sdpMid
                }
              });
              console.log('✅ ICE candidate retry successful');
            } catch (retryErr) {
              console.error('❌ ICE candidate retry failed:', retryErr);
            }
          }, 1000);
        }
      } else if (!event.candidate) {
        console.log('🧊 ICE gathering COMPLETED for:', remoteUserId);
      }
    };

    // Handle incoming remote stream - COMPLETELY FIXED
    pc.ontrack = (event) => {
      console.log('📥 Received track from:', remoteUserId, 'Kind:', event.track.kind, 'Enabled:', event.track.enabled);
      const [remoteStream] = event.streams;
      
      if (event.track.kind === 'audio') {
        // Force remove any existing audio element for this user
        const existingAudio = document.querySelector(`audio[data-user-id="${remoteUserId}"]`);
        if (existingAudio) {
          existingAudio.remove();
        }
        
        // Create new dedicated audio element
        const audioElement = document.createElement('audio');
        audioElement.srcObject = remoteStream;
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.volume = isDeafened ? 0 : 1;
        audioElement.setAttribute('data-user-id', remoteUserId);
        audioElement.style.display = 'none';
        
        // CRITICAL: Handle audio autoplay policy
        const playAudio = () => {
          audioElement.play().then(() => {
            console.log('🔊 Audio playing successfully for:', remoteUserId);
          }).catch(error => {
            console.warn('⚠️ Autoplay blocked for:', remoteUserId, 'Waiting for user interaction');
            
            // Show user notification for audio permission
            if (!document.querySelector('.audio-permission-notice')) {
              const notice = document.createElement('div');
              notice.className = 'audio-permission-notice';
              notice.innerHTML = `
                <div style="position: fixed; top: 20px; right: 20px; background: rgba(139, 92, 246, 0.9); color: white; padding: 15px 20px; border-radius: 10px; z-index: 9999; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                  🔊 Haz clic para activar audio de otros usuarios
                </div>
              `;
              document.body.appendChild(notice);
              
              // Remove notice and enable audio on click
              notice.onclick = () => {
                audioElement.play().catch(console.error);
                notice.remove();
              };
              
              // Auto-remove after 10 seconds
              setTimeout(() => {
                if (notice.parentNode) notice.remove();
              }, 10000);
            }
          });
        };
        
        // Try to play immediately
        playAudio();
        
        // Set output device if supported
        if (audioElement.setSinkId && selectedOutputDevice) {
          audioElement.setSinkId(selectedOutputDevice).catch(e => {
            console.warn('Could not set audio output device:', e);
          });
        }
        
        // Add to DOM
        document.body.appendChild(audioElement);
        
        // Store reference
        remoteStreamsRef.current[remoteUserId] = {
          stream: remoteStream,
          audioElement: audioElement,
          track: event.track
        };
        
        console.log('✅ Audio setup completed for:', remoteUserId);
        
      } else if (event.track.kind === 'video') {
        // Handle video/screen share
        console.log('📺 Setting up video stream from:', remoteUserId);
        setRemoteScreens(prev => ({
          ...prev,
          [remoteUserId]: remoteStream
        }));
      }
      
      // Update participants
      loadParticipants();
    };

    // Enhanced connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`🔗 Connection state with ${remoteUserId}: ${state}`);
      
      if (state === 'connected') {
        console.log(`✅ Audio connection established with ${remoteUserId}`);
      } else if (state === 'disconnected' || state === 'closed') {
        console.log(`⚠️ Cleaning up connection with ${remoteUserId}`);
        cleanupUserConnection(remoteUserId);
      } else if (state === 'failed') {
        console.log(`❌ Connection failed with ${remoteUserId}, attempting reconnect...`);
        setTimeout(() => {
          if (peerConnectionsRef.current[remoteUserId] === pc && activeVoiceChannel) {
            createOfferForUser(remoteUserId);
          }
        }, 2000);
      }
    };

    // ICE connection state monitoring
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE state with ${remoteUserId}: ${pc.iceConnectionState}`);
    };

    peerConnectionsRef.current[remoteUserId] = pc;
    return pc;
  };

  // Helper function to clean up user connections
  const cleanupUserConnection = (userId) => {
    // Remove audio element
    const audioElement = document.querySelector(`audio[data-user-id="${userId}"]`);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.remove();
      console.log('🗑️ Removed audio element for:', userId);
    }
    
    // Clean up references
    delete remoteStreamsRef.current[userId];
    
    // Remove from remote screens
    setRemoteScreens(prev => {
      const newScreens = { ...prev };
      delete newScreens[userId];
      return newScreens;
    });
  };

  const createOfferForUser = async (remoteUserId) => {
    console.log('🤝 Creating offer for user:', remoteUserId);
    
    try {
      // Don't create duplicate connections
      if (peerConnectionsRef.current[remoteUserId]) {
        console.log('⚠️ Connection already exists for:', remoteUserId);
        return;
      }
      
      // Ensure we have local stream
      if (!localStreamRef.current) {
        console.error('❌ No local stream available for offer creation');
        return;
      }
      
      const pc = createPeerConnection(remoteUserId);
      
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      console.log('✅ Local description set for offer to:', remoteUserId);
      
      console.log('📤 Sending offer to:', remoteUserId);
      
      try {
        await sendSignal(remoteUserId, 'offer', {
          offer: offer
        });
        console.log('✅ Offer sent successfully to:', remoteUserId);
      } catch (signalErr) {
        console.error('❌ Failed to send offer signal:', signalErr);
        // Retry once after a delay
        setTimeout(async () => {
          try {
            await sendSignal(remoteUserId, 'offer', { offer: offer });
            console.log('✅ Offer retry successful to:', remoteUserId);
          } catch (retryErr) {
            console.error('❌ Offer retry also failed:', retryErr);
          }
        }, 2000);
      }
      
    } catch (err) {
      console.error('❌ Error creating offer for', remoteUserId, ':', err);
      // Clean up failed connection
      if (peerConnectionsRef.current[remoteUserId]) {
        peerConnectionsRef.current[remoteUserId].close();
        delete peerConnectionsRef.current[remoteUserId];
      }
    }
  };

  const handleReceiveOffer = async (signal) => {
    const { from_user, data } = signal;
    const { offer } = data;
    
    console.log('📨 Processing offer from:', from_user);

    try {
      const pc = createPeerConnection(from_user);
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('✅ Remote description set for offer');
      
      // Process any queued ICE candidates
      await processQueuedIceCandidates(from_user);
      
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(answer);
      console.log('✅ Local description set for answer');

      console.log('📤 Sending answer to:', from_user);
      await sendSignal(from_user, 'answer', {
        answer: answer
      });
      
      console.log('✅ Answer sent successfully');
    } catch (err) {
      console.error('❌ Error handling offer from', from_user, ':', err);
    }
  };

  const handleReceiveAnswer = async (signal) => {
    const { from_user, data } = signal;
    const { answer } = data;
    
    console.log('📨 Processing answer from:', from_user);

    const pc = peerConnectionsRef.current[from_user];
    if (pc && pc.signalingState === 'have-local-offer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Answer processed successfully for:', from_user);
        
        // Process any queued ICE candidates
        await processQueuedIceCandidates(from_user);
        
      } catch (err) {
        console.error('❌ Error handling answer from', from_user, ':', err);
      }
    } else if (!pc) {
      console.warn('⚠️ No peer connection found for answer from:', from_user);
    } else {
      console.warn('⚠️ Peer connection not in correct state for answer. State:', pc.signalingState);
    }
  };

  // Queue for pending ICE candidates
  const pendingIceCandidates = useRef({});

  const handleReceiveIceCandidate = async (signal) => {
    const { from_user, data } = signal;
    const { candidate } = data;
    
    console.log('📨 Processing ICE candidate from:', from_user);
    
    const pc = peerConnectionsRef.current[from_user];
    if (pc && pc.remoteDescription) {
      try {
        const iceCandidate = new RTCIceCandidate(candidate);
        await pc.addIceCandidate(iceCandidate);
        console.log('✅ ICE candidate added from:', from_user);
      } catch (err) {
        console.error('❌ Error adding ICE candidate from', from_user, ':', err);
      }
    } else {
      // Queue candidate if remote description not set yet
      console.log('📦 Queuing ICE candidate from:', from_user);
      if (!pendingIceCandidates.current[from_user]) {
        pendingIceCandidates.current[from_user] = [];
      }
      pendingIceCandidates.current[from_user].push(candidate);
    }
  };

  // Process queued ICE candidates after setting remote description
  const processQueuedIceCandidates = async (userId) => {
    const pc = peerConnectionsRef.current[userId];
    const queuedCandidates = pendingIceCandidates.current[userId];
    
    if (pc && queuedCandidates && queuedCandidates.length > 0) {
      console.log(`📦 Processing ${queuedCandidates.length} queued ICE candidates for:`, userId);
      
      for (const candidate of queuedCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ Queued ICE candidate processed for:', userId);
        } catch (err) {
          console.error('❌ Error processing queued ICE candidate:', err);
        }
      }
      
      // Clear the queue
      pendingIceCandidates.current[userId] = [];
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

  const toggleGhostMode = async () => {
    if (!activeVoiceChannel || activeVoiceChannel.creator_id !== user.id) return;
    
    try {
      const newGhostMode = !activeVoiceChannel.is_ghost_mode;
      
      const response = await axios.put(
        `${API}/voice-channels/${activeVoiceChannel.id}/ghost-mode?is_ghost=${newGhostMode}`
      );
      
      setActiveVoiceChannel(response.data);
      onRefresh();
      
      console.log(`🔄 Ghost mode ${newGhostMode ? 'enabled' : 'disabled'} for channel:`, activeVoiceChannel.name);
    } catch (err) {
      console.error('Error toggling ghost mode:', err);
      alert('Error al cambiar modo fantasma');
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      console.log('🛑 Stopping screen share');
      
      if (screenStream) {
        screenStream.getTracks().forEach(track => {
          track.stop();
          console.log('🖥️ Stopped screen track');
        });
        
        // Remove video tracks from all peer connections
        Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
          const videoSenders = pc.getSenders().filter(s => s.track?.kind === 'video');
          videoSenders.forEach(async (sender) => {
            try {
              await sender.replaceTrack(null);
              console.log(`✅ Removed video track for user ${userId}`);
            } catch (err) {
              console.error(`❌ Error removing video track for user ${userId}:`, err);
            }
          });
        });
        
        setScreenStream(null);
        setIsScreenSharing(false);
        console.log('✅ Screen sharing stopped');
      }
    } else {
      // Start screen sharing
      try {
        console.log('🖥️ Starting screen share...');
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            cursor: 'always',
            displaySurface: 'monitor',
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        
        console.log('✅ Screen capture stream acquired');
        
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Add video track to all existing peer connections
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0]; // System audio if available
        
        Object.entries(peerConnectionsRef.current).forEach(([userId, pc]) => {
          try {
            // Add or replace video track
            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) {
              videoSender.replaceTrack(videoTrack);
              console.log(`✅ Replaced video track for user ${userId}`);
            } else {
              pc.addTrack(videoTrack, stream);
              console.log(`✅ Added video track for user ${userId}`);
            }
            
            // Add system audio if available
            if (audioTrack) {
              const audioSender = pc.getSenders().find(s => 
                s.track?.kind === 'audio' && s.track?.label?.includes('system')
              );
              if (!audioSender) {
                pc.addTrack(audioTrack, stream);
                console.log(`✅ Added system audio track for user ${userId}`);
              }
            }
          } catch (err) {
            console.error(`❌ Error adding video track for user ${userId}:`, err);
          }
        });

        // Handle when user stops sharing from browser UI
        videoTrack.onended = () => {
          console.log('🖥️ Screen share ended by user');
          setScreenStream(null);
          setIsScreenSharing(false);
          
          // Clean up video tracks
          Object.values(peerConnectionsRef.current).forEach(pc => {
            const videoSenders = pc.getSenders().filter(s => s.track?.kind === 'video');
            videoSenders.forEach(sender => {
              sender.replaceTrack(null).catch(console.error);
            });
          });
        };
        
        console.log('🎉 Screen sharing started successfully');
        
      } catch (err) {
        console.error('❌ Error starting screen share:', err);
        
        if (err.name === 'NotAllowedError') {
          alert('Permiso para compartir pantalla denegado. Por favor permite el acceso.');
        } else if (err.name === 'NotSupportedError') {
          alert('Tu navegador no soporta compartir pantalla.');
        } else {
          alert('Error al compartir pantalla: ' + err.message);
        }
        
        setIsScreenSharing(false);
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
                <div className="channel-meta">
                  <span>{participants.length} participantes</span>
                  {activeVoiceChannel.creator_id === user.id && (
                    <button
                      className={`ghost-mode-btn ${activeVoiceChannel.is_ghost_mode ? 'active' : ''}`}
                      onClick={toggleGhostMode}
                      title={activeVoiceChannel.is_ghost_mode ? 'Hacer visible' : 'Modo fantasma'}
                    >
                      👻 {activeVoiceChannel.is_ghost_mode ? 'Fantasma' : 'Visible'}
                    </button>
                  )}
                </div>
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
                      if (video && screenStream && video.srcObject !== screenStream) {
                        video.srcObject = screenStream;
                        video.play().catch(e => {
                          console.warn('Video play prevented, but this is normal for screen sharing:', e);
                        });
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="screen-video"
                  />
                  <div className="screen-label">Tu pantalla</div>
                </div>
              )}

              {/* Remote Screen Shares */}
              {Object.entries(remoteScreens).map(([userId, stream]) => (
                <div key={userId} className="remote-screen-preview">
                  <video
                    ref={(video) => {
                      if (video && stream && video.srcObject !== stream) {
                        video.srcObject = stream;
                        video.play().catch(e => {
                          console.warn('Remote video play prevented:', e);
                        });
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="screen-video"
                  />
                  <div className="screen-label">Pantalla de {participants.find(p => p.id === userId)?.username || 'Usuario'}</div>
                </div>
              ))}

              {/* Participants */}
              <div className="participants-grid">
                {participants.map((participant) => {
                  const isCurrentUser = participant.id === user.id;
                  const userMuted = isCurrentUser ? isMuted : false; // TODO: Get other users' mute status
                  const userDeafened = isCurrentUser ? isDeafened : false;
                  
                  return (
                    <div key={participant.id} className="participant-card">
                      <div className="participant-avatar-container">
                        <div 
                          className="participant-avatar"
                          style={{ 
                            borderColor: participant.aura_color,
                            boxShadow: `0 0 15px ${participant.aura_color}40`
                          }}
                        >
                          {participant.avatar_url ? (
                            <img 
                              src={participant.avatar_url} 
                              alt={participant.username}
                              className="avatar-image"
                            />
                          ) : (
                            <UserIcon size={32} />
                          )}
                        </div>
                        
                        {/* Status indicators */}
                        <div className="status-indicators">
                          {userMuted && (
                            <div className="status-indicator muted" title="Silenciado">
                              <MicOffIcon size={12} />
                            </div>
                          )}
                          {userDeafened && (
                            <div className="status-indicator deafened" title="Ensordecido">
                              <VolumeOffIcon size={12} />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <span className="participant-name">
                        {isCurrentUser ? 'Tú' : participant.username}
                      </span>
                      
                      {/* Speaking indicator */}
                      <div className={`audio-indicator ${isCurrentUser && !isMuted ? 'speaking' : ''}`}>
                        <div className="audio-bars">
                          <div className="bar" />
                          <div className="bar" />
                          <div className="bar" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controls Bar */}
            <div className="channel-controls-bar">
              <button
                className={`channel-control-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
              >
                {isMuted ? <MicOffIcon size={24} /> : <MicIcon size={24} />}
              </button>

              <button
                className={`channel-control-btn ${isDeafened ? 'deafened' : ''}`}
                onClick={toggleDeafen}
                title={isDeafened ? 'Activar audio' : 'Silenciar audio'}
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
                className="channel-control-btn settings"
                onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                title="Configuración de audio"
              >
                ⚙️
              </button>

              <button
                className="channel-control-btn disconnect"
                onClick={leaveChannel}
                title="Desconectar"
              >
                <XIcon size={24} />
              </button>
            </div>

            {/* Audio Device Settings */}
            <AnimatePresence>
              {showDeviceSettings && (
                <motion.div
                  className="device-settings"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <h4>Configuración de Audio</h4>
                  
                  <div className="device-setting">
                    <label>Micrófono:</label>
                    <select 
                      value={selectedInputDevice} 
                      onChange={(e) => setSelectedInputDevice(e.target.value)}
                    >
                      {audioInputDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Micrófono ${device.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="device-setting">
                    <label>Altavoces:</label>
                    <select 
                      value={selectedOutputDevice} 
                      onChange={(e) => setSelectedOutputDevice(e.target.value)}
                    >
                      {audioOutputDevices.map(device => (
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
