import React, { useState, useEffect, useRef } from 'react';
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [currentUser, setCurrentUser] = useState(user);

  // Socket.IO connection
  useEffect(() => {
    console.log('Connecting to Socket.IO at:', BACKEND_URL);
    
    const socketConnection = io(BACKEND_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      withCredentials: false,
    });

    socketConnection.on('connect', () => {
      console.log('✅ Socket connected:', socketConnection.id);
      setSocketConnected(true);
    });

    socketConnection.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setSocketConnected(false);
    });

    socketConnection.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    socketConnection.on('new_message', (message) => {
      console.log('📨 New message received:', message);
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.find(m => m.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
    });

    socketConnection.on('voice_channel_created', (channel) => {
      console.log('🎙️ Voice channel created:', channel);
      if (!channel.is_ghost_mode) {
        setVoiceChannels((prev) => {
          // Avoid duplicates
          if (prev.find(ch => ch.id === channel.id)) {
            return prev;
          }
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
      console.log('Disconnecting socket...');
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
      const response = await axios.get(`${API}/messages`);
      console.log('💬 Loaded messages:', response.data.length);
      setMessages(response.data);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const loadVoiceChannels = async () => {
    try {
      const response = await axios.get(`${API}/voice-channels`);
      console.log('🎙️ Loaded voice channels:', response.data.length);
      setVoiceChannels(response.data.filter((ch) => !ch.is_ghost_mode));
    } catch (err) {
      console.error('Error loading voice channels:', err);
    }
  };

  const loadUserData = async () => {
    try {
      const response = await axios.get(`${API}/users/${user.id}`);
      setCurrentUser(response.data);
      onUserUpdate(response.data);
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  };

  return (
    <div className="dashboard" data-testid="dashboard">
      <div className="aurora-bg" />

      {/* Socket Connection Indicator */}
      {!socketConnected && (
        <div className="socket-indicator">
          <span>Reconectando...</span>
        </div>
      )}

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
              socketConnected={socketConnected}
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
