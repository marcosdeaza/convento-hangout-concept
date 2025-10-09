import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import io from 'socket.io-client';
import ChatSection from '@/components/ChatSection';
import VoiceSection from '@/components/VoiceSection';
import ProfileSection from '@/components/ProfileSection';
import Sidebar from '@/components/Sidebar';
import './Dashboard.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Dashboard({ user, onLogout, onUserUpdate }) {
  const [activeSection, setActiveSection] = useState('chat');
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [currentUser, setCurrentUser] = useState(user);

  // Socket.IO connection with proper configuration
  useEffect(() => {
    console.log('🔌 Initializing Socket.IO connection...');
    console.log('Backend URL:', BACKEND_URL);
    
    // Connect to backend - Socket.IO is at root /socket.io
    // Since backend is wrapped with socketio.ASGIApp, Socket.IO handles root path
    const socketConnection = io(`${BACKEND_URL}/api`, {
      path: '/socket.io',  // Socket.IO path relative to /api
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
      autoConnect: true,
    });

    socketConnection.on('connect', () => {
      console.log('✅ Socket.IO CONNECTED! ID:', socketConnection.id);
      console.log('Transport:', socketConnection.io.engine.transport.name);
    });

    socketConnection.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected. Reason:', reason);
    });

    socketConnection.on('connect_error', (error) => {
      console.error('🔥 Socket connection error:', error.message);
    });

    socketConnection.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Reconnection attempt:', attemptNumber);
    });

    socketConnection.on('reconnect', () => {
      console.log('✅ Socket RECONNECTED!');
    });

    // Message events
    socketConnection.on('new_message', (message) => {
      console.log('📨 NEW MESSAGE RECEIVED:', message);
      setMessages((prev) => {
        // Check for duplicates
        const exists = prev.some(m => m.id === message.id);
        if (exists) {
          console.log('⚠️ Duplicate message, ignoring');
          return prev;
        }
        console.log('✅ Adding message to list');
        return [...prev, message];
      });
    });

    // Voice channel events
    socketConnection.on('voice_channel_created', (channel) => {
      console.log('🎤 Voice channel created:', channel);
      if (!channel.is_ghost_mode) {
        setVoiceChannels((prev) => {
          const exists = prev.some(ch => ch.id === channel.id);
          if (exists) return prev;
          return [...prev, channel];
        });
      }
    });

    socketConnection.on('voice_channel_updated', (channel) => {
      console.log('🔄 Voice channel updated:', channel);
      setVoiceChannels((prev) =>
        prev.map((ch) => (ch.id === channel.id ? channel : ch))
      );
    });

    socketConnection.on('voice_channel_deleted', (data) => {
      console.log('🗑️ Voice channel deleted:', data.channel_id);
      setVoiceChannels((prev) => prev.filter((ch) => ch.id !== data.channel_id));
      if (activeVoiceChannel?.id === data.channel_id) {
        setActiveVoiceChannel(null);
      }
    });

    setSocket(socketConnection);

    return () => {
      console.log('🔌 Cleaning up socket connection...');
      socketConnection.off('connect');
      socketConnection.off('disconnect');
      socketConnection.off('new_message');
      socketConnection.off('voice_channel_created');
      socketConnection.off('voice_channel_updated');
      socketConnection.off('voice_channel_deleted');
      socketConnection.disconnect();
    };
  }, []);

  // Load initial data
  useEffect(() => {
    loadMessages();
    loadVoiceChannels();
    loadUserData();
  }, []);

  const loadMessages = async () => {
    try {
      console.log('📥 Loading messages...');
      const response = await axios.get(`${API}/messages`);
      console.log('✅ Loaded', response.data.length, 'messages');
      setMessages(response.data);
    } catch (err) {
      console.error('❌ Error loading messages:', err);
    }
  };

  const loadVoiceChannels = async () => {
    try {
      console.log('📥 Loading voice channels...');
      const response = await axios.get(`${API}/voice-channels`);
      console.log('✅ Loaded', response.data.length, 'channels');
      setVoiceChannels(response.data.filter((ch) => !ch.is_ghost_mode));
    } catch (err) {
      console.error('❌ Error loading voice channels:', err);
    }
  };

  const loadUserData = async () => {
    try {
      const response = await axios.get(`${API}/users/${user.id}`);
      setCurrentUser(response.data);
      onUserUpdate(response.data);
    } catch (err) {
      console.error('❌ Error loading user data:', err);
    }
  };

  return (
    <div className="dashboard" data-testid="dashboard">
      <div className="aurora-bg" />

      <Sidebar
        user={currentUser}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onLogout={onLogout}
        activeVoiceChannel={activeVoiceChannel}
      />

      <div className="dashboard-content">
        <AnimatePresence mode="wait">
          {activeSection === 'chat' && (
            <ChatSection
              key="chat"
              user={currentUser}
              messages={messages}
              socket={socket}
              onRefresh={loadUserData}
            />
          )}
          {activeSection === 'voice' && (
            <VoiceSection
              key="voice"
              user={currentUser}
              voiceChannels={voiceChannels}
              activeVoiceChannel={activeVoiceChannel}
              setActiveVoiceChannel={setActiveVoiceChannel}
              socket={socket}
            />
          )}
          {activeSection === 'profile' && (
            <ProfileSection
              key="profile"
              user={currentUser}
              onUpdate={loadUserData}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default Dashboard;
