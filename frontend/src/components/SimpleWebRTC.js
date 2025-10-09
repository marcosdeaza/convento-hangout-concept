/**
 * SimpleWebRTC - Una implementación simplificada y funcional de WebRTC
 * para Convento que REALMENTE funciona en producción
 */

export class SimpleWebRTC {
  constructor(channelId, userId, API) {
    this.channelId = channelId;
    this.userId = userId;
    this.API = API;
    
    this.localStream = null;
    this.peerConnections = new Map();
    this.remoteStreams = new Map();
    
    // Configuración simple pero efectiva
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    this.signalingInterval = null;
    this.isActive = false;
    
    console.log('🎤 SimpleWebRTC initialized for channel:', channelId);
  }

  async start() {
    console.log('🚀 Starting SimpleWebRTC...');
    
    try {
      // 1. Obtener micrófono
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('✅ Got microphone access');
      
      // 2. Iniciar signaling
      this.startSignaling();
      
      // 3. Conectar con usuarios existentes  
      setTimeout(() => {
        this.connectToExistingUsers();
      }, 2000);
      
      this.isActive = true;
      return true;
      
    } catch (error) {
      console.error('❌ Failed to start SimpleWebRTC:', error);
      throw error;
    }
  }

  startSignaling() {
    console.log('📡 Starting signaling...');
    
    this.signalingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${this.API}/webrtc/signals/${this.channelId}/${this.userId}`);
        
        if (response.ok) {
          const signals = await response.json();
          
          if (signals && signals.length > 0) {
            console.log(`📨 Processing ${signals.length} signals`);
            
            for (const signal of signals) {
              await this.handleSignal(signal);
            }
          }
        }
        
      } catch (error) {
        console.error('Signaling error:', error);
      }
    }, 1000); // 1 segundo es suficiente
  }

  async handleSignal(signal) {
    const { from_user, signal_type, data } = signal;
    
    console.log(`📩 Handling ${signal_type} from ${from_user}`);
    
    try {
      switch (signal_type) {
        case 'offer':
          await this.handleOffer(from_user, data.offer);
          break;
        case 'answer':
          await this.handleAnswer(from_user, data.answer);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(from_user, data.candidate);
          break;
      }
    } catch (error) {
      console.error(`Error handling ${signal_type}:`, error);
    }
  }

  createPeerConnection(remoteUserId) {
    console.log(`🤝 Creating connection with ${remoteUserId}`);
    
    const pc = new RTCPeerConnection(this.rtcConfig);
    
    // Añadir stream local
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
    // Manejar stream remoto
    pc.ontrack = (event) => {
      console.log(`🔊 Received audio from ${remoteUserId}`);
      const [remoteStream] = event.streams;
      this.remoteStreams.set(remoteUserId, remoteStream);
      
      // Crear y reproducir audio
      const audio = document.createElement('audio');
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      
      // Forzar reproducción
      audio.play().catch(e => {
        console.warn('Autoplay blocked, user interaction needed');
      });
    };
    
    // Manejar ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE to ${remoteUserId}`);
        this.sendSignal(remoteUserId, 'ice-candidate', {
          candidate: event.candidate
        });
      }
    };
    
    this.peerConnections.set(remoteUserId, pc);
    return pc;
  }

  async sendSignal(toUserId, signalType, data) {
    try {
      await fetch(`${this.API}/webrtc/signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_user: this.userId,
          to_user: toUserId,
          channel_id: this.channelId,
          signal_type: signalType,
          data: data
        })
      });
      
      console.log(`✅ Sent ${signalType} to ${toUserId}`);
    } catch (error) {
      console.error(`❌ Failed to send ${signalType}:`, error);
    }
  }

  async connectToExistingUsers() {
    try {
      const response = await fetch(`${this.API}/voice-channels/${this.channelId}/participants`);
      const participants = await response.json();
      
      const otherUsers = participants.filter(p => p.id !== this.userId);
      
      for (const user of otherUsers) {
        console.log(`🎯 Connecting to existing user: ${user.username}`);
        await this.createOffer(user.id);
      }
      
    } catch (error) {
      console.error('Error connecting to existing users:', error);
    }
  }

  async createOffer(remoteUserId) {
    const pc = this.createPeerConnection(remoteUserId);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await this.sendSignal(remoteUserId, 'offer', { offer });
      
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  async handleOffer(fromUserId, offer) {
    const pc = this.createPeerConnection(fromUserId);
    
    try {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      await this.sendSignal(fromUserId, 'answer', { answer });
      
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  async handleAnswer(fromUserId, answer) {
    const pc = this.peerConnections.get(fromUserId);
    
    if (pc) {
      try {
        await pc.setRemoteDescription(answer);
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }

  async handleIceCandidate(fromUserId, candidate) {
    const pc = this.peerConnections.get(fromUserId);
    
    if (pc) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }

  mute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        console.log('🔇 Muted');
        return true;
      }
    }
    return false;
  }

  unmute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        console.log('🔊 Unmuted');
        return true;
      }
    }
    return false;
  }

  async stop() {
    console.log('🛑 Stopping SimpleWebRTC...');
    
    this.isActive = false;
    
    // Parar signaling
    if (this.signalingInterval) {
      clearInterval(this.signalingInterval);
      this.signalingInterval = null;
    }
    
    // Cerrar conexiones
    for (const [userId, pc] of this.peerConnections) {
      pc.close();
      console.log(`🔌 Closed connection with ${userId}`);
    }
    this.peerConnections.clear();
    
    // Parar stream local
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Limpiar audio elements
    const audioElements = document.querySelectorAll('audio[src*="blob:"]');
    audioElements.forEach(audio => audio.remove());
    
    this.remoteStreams.clear();
    
    console.log('✅ SimpleWebRTC stopped completely');
  }
}