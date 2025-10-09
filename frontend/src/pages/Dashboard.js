import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import ChatSection from '@/components/ChatSection';
import VoiceSection from '@/components/VoiceSection';
import ProfileSection from '@/components/ProfileSection';
import Sidebar from '@/components/Sidebar';
import './Dashboard.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Dashboard({ user, onLogout, onUserUpdate }) {
  const [activeSection, setActiveSection] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [currentUser, setCurrentUser] = useState(user);
  const pollingIntervalRef = useRef(null);

  // AUTO-REFRESH MESSAGES - Polling every 2 seconds
  useEffect(() => {
    console.log('🔄 Starting auto-refresh for messages...');
    
    // Initial load
    loadMessages();
    loadVoiceChannels();
    loadUserData();
    
    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      loadMessages();
      loadVoiceChannels();
    }, 2000); // Refresh every 2 seconds
    
    return () => {
      if (pollingIntervalRef.current) {
        console.log('🛑 Stopping auto-refresh');
        clearInterval(pollingIntervalRef.current);
      }
    };
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
              onRefresh={loadUserData}
              onMessageSent={loadMessages}
            />
          )}
          {activeSection === 'voice' && (
            <VoiceSection
              key="voice"
              user={currentUser}
              voiceChannels={voiceChannels}
              activeVoiceChannel={activeVoiceChannel}
              setActiveVoiceChannel={setActiveVoiceChannel}
              onRefresh={loadVoiceChannels}
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
