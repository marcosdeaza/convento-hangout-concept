import React from 'react';
import { motion } from 'framer-motion';
import './Sidebar.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function Sidebar({ user, activeSection, onSectionChange, onLogout, activeVoiceChannel }) {
  const menuItems = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'voice', icon: '🎧', label: 'Canales de Voz' },
    { id: 'profile', icon: '✨', label: 'Perfil' },
  ];

  return (
    <motion.div
      className="sidebar glass"
      initial={{ x: -300 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.5, type: 'spring' }}
      data-testid="sidebar"
    >
      {/* Header */}
      <div className="sidebar-header">
        <motion.h1
          className="sidebar-title text-gradient"
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{ duration: 5, repeat: Infinity }}
        >
          Convento
        </motion.h1>
      </div>

      {/* User Info */}
      <motion.div
        className="sidebar-user aura-glow"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          '--aura-color': user.aura_color || '#8B5CF6',
        }}
      >
        <div
          className="user-avatar"
          style={{
            backgroundImage: user.avatar_url
              ? `url(${BACKEND_URL}${user.avatar_url})`
              : 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
            boxShadow: `0 0 20px ${user.aura_color}40`,
          }}
        />
        <div className="user-info">
          <h3 className="user-name">{user.username}</h3>
          <span className="user-status">● En línea</span>
        </div>
      </motion.div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {menuItems.map((item, index) => (
          <motion.button
            key={item.id}
            className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => onSectionChange(item.id)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            whileHover={{ scale: 1.05, x: 5 }}
            whileTap={{ scale: 0.95 }}
            data-testid={`nav-${item.id}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {activeSection === item.id && (
              <motion.div
                className="nav-indicator"
                layoutId="activeSection"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </nav>

      {/* Active Voice Channel Indicator */}
      {activeVoiceChannel && (
        <motion.div
          className="voice-status glass-light"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <div className="voice-status-header">
            <span className="voice-icon">🎧</span>
            <span className="voice-label">Conectado</span>
          </div>
          <div
            className="voice-channel-name"
            style={{
              color: activeVoiceChannel.aura_color,
            }}
          >
            {activeVoiceChannel.name}
          </div>
          <div className="voice-ping">
            <motion.span
              className="ping-dot"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.5, 1],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span>28 ms</span>
          </div>
        </motion.div>
      )}

      {/* Logout Button */}
      <motion.button
        className="logout-btn"
        onClick={onLogout}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        data-testid="logout-button"
      >
        <span>🚪</span>
        Salir
      </motion.button>
    </motion.div>
  );
}

export default Sidebar;
