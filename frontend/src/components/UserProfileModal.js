import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from '@/components/Icons';
import './UserProfileModal.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function UserProfileModal({ user, isOpen, onClose }) {
  if (!isOpen || !user) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="profile-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="profile-modal"
          initial={{ scale: 0.7, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.7, opacity: 0, y: 50 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button className="profile-modal-close" onClick={onClose}>
            <XIcon size={20} />
          </button>

          {/* Banner */}
          <div 
            className="profile-banner"
            style={{
              backgroundImage: user.banner_url 
                ? `url(${BACKEND_URL}${user.banner_url})` 
                : `linear-gradient(135deg, ${user.aura_color}, #1a1a2e)`,
              '--aura-color': user.aura_color
            }}
          />

          {/* Avatar */}
          <div className="profile-avatar-container">
            <div 
              className="profile-avatar"
              style={{
                backgroundImage: user.avatar_url 
                  ? `url(${BACKEND_URL}${user.avatar_url})` 
                  : `linear-gradient(135deg, ${user.aura_color}, #06B6D4)`,
                borderColor: user.aura_color,
                boxShadow: `0 0 30px ${user.aura_color}60`
              }}
            >
              {!user.avatar_url && (
                <span className="profile-avatar-initial">
                  {user.username?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="profile-info">
            <h2 
              className="profile-username"
              style={{ color: user.aura_color }}
            >
              {user.username}
            </h2>
            
            {user.description && (
              <p className="profile-description">
                {user.description}
              </p>
            )}

            <div className="profile-stats">
              <div className="profile-stat">
                <span className="stat-label">Miembro desde</span>
                <span className="stat-value">
                  {new Date(user.created_at).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>

              <div className="profile-stat">
                <span className="stat-label">Última vez visto</span>
                <span className="stat-value">
                  {new Date(user.last_seen).toLocaleString('es-ES', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            <div className="profile-aura">
              <span className="aura-label">Color de aura</span>
              <div 
                className="aura-color-display"
                style={{ 
                  backgroundColor: user.aura_color,
                  boxShadow: `0 0 20px ${user.aura_color}80`
                }}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default UserProfileModal;