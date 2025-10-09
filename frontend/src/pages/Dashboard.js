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
  const [messages, setMessages] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [currentUser, setCurrentUser] = useState(user);

  // Socket.IO connection
  useEffect(() => {
    const socketConnection = io(BACKEND_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketConnection.on('connect', () => {
      console.log('Socket connected:', socketConnection.id);
    });

    socketConnection.on('new_message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketConnection.on('voice_channel_created', (channel) => {
      if (!channel.is_ghost_mode) {
        setVoiceChannels((prev) => [...prev, channel]);
      }
    });

    socketConnection.on('voice_channel_updated', (channel) => {
      setVoiceChannels((prev) =>
        prev.map((ch) => (ch.id === channel.id ? channel : ch))
      );
    });

    socketConnection.on('voice_channel_deleted', (data) => {
      setVoiceChannels((prev) => prev.filter((ch) => ch.id !== data.channel_id));
      if (activeVoiceChannel?.id === data.channel_id) {
        setActiveVoiceChannel(null);
      }
    });

    setSocket(socketConnection);

    return () => {
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
      setMessages(response.data);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const loadVoiceChannels = async () => {
    try {
      const response = await axios.get(`${API}/voice-channels`);
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
