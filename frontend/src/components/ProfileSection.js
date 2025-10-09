import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { CameraIcon, CheckIcon, EyeIcon } from '@/components/Icons';
import './ProfileSection.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Iconos locales
const EyeOffIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const CopyIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

function ProfileSection({ user, onUpdate }) {
  const [username, setUsername] = useState(user.username);
  const [description, setDescription] = useState(user.description);
  const [auraColor, setAuraColor] = useState(user.aura_color);
  const [saving, setSaving] = useState(false);
  
  // Code visibility
  const [showCodeOptions, setShowCodeOptions] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Avatar cropper
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [avatarCrop, setAvatarCrop] = useState({
    unit: '%',
    width: 100,
    aspect: 1,
  });
  const [avatarImage, setAvatarImage] = useState(null);
  
  // Banner cropper
  const [showBannerCropper, setShowBannerCropper] = useState(false);
  const [bannerSrc, setBannerSrc] = useState(null);
  const [bannerCrop, setBannerCrop] = useState({
    unit: '%',
    width: 100,
    aspect: 3,
  });
  const [bannerImage, setBannerImage] = useState(null);

  const AURA_COLORS = [
    '#8B5CF6', '#06B6D4', '#EC4899', '#10B981',
    '#F59E0B', '#EF4444', '#3B82F6', '#A78BFA',
  ];

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/users/${user.id}`, {
        username,
        description,
        aura_color: auraColor,
      });
      await onUpdate();
      alert('¡Perfil actualizado!');
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(user.access_code);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShowCodeOptions(false);
    }, 2000);
  };

  const onSelectAvatar = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setAvatarSrc(reader.result);
        setShowAvatarCropper(true);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onSelectBanner = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setBannerSrc(reader.result);
        setShowBannerCropper(true);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const getCroppedImg = async (image, crop, fileName) => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width,
      crop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Canvas is empty');
          return;
        }
        blob.name = fileName;
        resolve(blob);
      }, 'image/png');
    });
  };

  const handleCropAvatar = async () => {
    if (avatarImage && avatarCrop.width && avatarCrop.height) {
      const croppedImageBlob = await getCroppedImg(
        avatarImage,
        avatarCrop,
        'avatar.png'
      );
      
      const formData = new FormData();
      formData.append('file', croppedImageBlob, 'avatar.png');
      
      setSaving(true);
      try {
        await axios.post(
          `${API}/upload/${user.id}/avatar`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setShowAvatarCropper(false);
        await onUpdate();
        alert('¡Avatar actualizado!');
      } catch (err) {
        console.error('Error uploading avatar:', err);
        alert('Error al subir avatar');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleCropBanner = async () => {
    if (bannerImage && bannerCrop.width && bannerCrop.height) {
      const croppedImageBlob = await getCroppedImg(
        bannerImage,
        bannerCrop,
        'banner.png'
      );
      
      const formData = new FormData();
      formData.append('file', croppedImageBlob, 'banner.png');
      
      setSaving(true);
      try {
        await axios.post(
          `${API}/upload/${user.id}/banner`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setShowBannerCropper(false);
        await onUpdate();
        alert('¡Banner actualizado!');
      } catch (err) {
        console.error('Error uploading banner:', err);
        alert('Error al subir banner');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <motion.div
      className="profile-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      data-testid="profile-section"
    >
      {/* Profile Card */}
      <div className="profile-card glass">
        {/* Banner */}
        <div className="profile-banner">
          {user.banner_url ? (
            <img 
              src={`${BACKEND_URL}${user.banner_url}`} 
              alt="Banner" 
              className="banner-image"
            />
          ) : (
            <div className="banner-gradient" />
          )}
          <motion.button
            className="edit-banner-btn"
            onClick={() => document.getElementById('banner-input').click()}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            data-testid="edit-banner-button"
          >
            <CameraIcon size={18} />
          </motion.button>
          <input
            id="banner-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onSelectBanner}
          />
        </div>

        {/* Avatar */}
        <div className="profile-avatar-container">
          <div
            className="profile-avatar aura-glow"
            style={{
              '--aura-color': auraColor,
              boxShadow: `0 0 30px ${auraColor}60`,
            }}
          >
            {user.avatar_url ? (
              <img 
                src={`${BACKEND_URL}${user.avatar_url}`} 
                alt="Avatar" 
                className="avatar-image"
              />
            ) : (
              <div className="avatar-gradient" />
            )}
            <motion.button
              className="edit-avatar-btn"
              onClick={() => document.getElementById('avatar-input').click()}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              data-testid="edit-avatar-button"
            >
              <CameraIcon size={18} />
            </motion.button>
            <input
              id="avatar-input"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onSelectAvatar}
            />
          </div>
        </div>

        {/* Profile Info */}
        <div className="profile-info">
          <h2 className="profile-name">{user.username}</h2>
          
          {/* Access Code with censorship */}
          <div className="profile-code-container">
            <p className="profile-code-label">Código de acceso:</p>
            <div className="profile-code-wrapper">
              <motion.div
                className="profile-code"
                onClick={() => setShowCodeOptions(!showCodeOptions)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {codeVisible ? user.access_code : '••••••••••••••••'}
              </motion.div>
              
              <AnimatePresence>
                {showCodeOptions && (
                  <motion.div
                    className="code-options"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <motion.button
                      className="code-option-btn"
                      onClick={() => setCodeVisible(!codeVisible)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {codeVisible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      {codeVisible ? 'Ocultar' : 'Ver'}
                    </motion.button>
                    <motion.button
                      className="code-option-btn"
                      onClick={handleCopyCode}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <CopyIcon size={16} />
                      {copied ? '¡Copiado!' : 'Copiar'}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="profile-form">
          <div className="form-group">
            <label>Nombre de usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="profile-input"
              maxLength={30}
              data-testid="username-input"
            />
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="profile-textarea"
              rows={4}
              maxLength={200}
              placeholder="Cuéntanos algo sobre ti..."
              data-testid="description-input"
            />
          </div>

          <div className="form-group">
            <label>Color del aura</label>
            <div className="color-picker">
              {AURA_COLORS.map((color) => (
                <motion.button
                  key={color}
                  className={`color-option ${auraColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAuraColor(color)}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  data-testid={`aura-color-${color}`}
                >
                  {auraColor === color && <CheckIcon size={24} />}
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button
            className="btn-primary"
            onClick={handleSaveProfile}
            disabled={saving}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ width: '100%' }}
            data-testid="save-profile-button"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </motion.button>
        </div>
      </div>

      {/* Avatar Cropper Modal */}
      {showAvatarCropper && (
        <div className="cropper-modal" data-testid="avatar-cropper-modal">
          <div className="cropper-content glass">
            <h3>Ajusta tu avatar</h3>
            <ReactCrop
              crop={avatarCrop}
              onChange={(c) => setAvatarCrop(c)}
              aspect={1}
              circularCrop
            >
              <img
                src={avatarSrc}
                alt="Avatar"
                onLoad={(e) => setAvatarImage(e.target)}
              />
            </ReactCrop>
            <div className="cropper-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowAvatarCropper(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCropAvatar}
                disabled={saving}
                data-testid="confirm-crop-avatar"
              >
                {saving ? 'Subiendo...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner Cropper Modal */}
      {showBannerCropper && (
        <div className="cropper-modal" data-testid="banner-cropper-modal">
          <div className="cropper-content glass">
            <h3>Ajusta tu banner</h3>
            <ReactCrop
              crop={bannerCrop}
              onChange={(c) => setBannerCrop(c)}
              aspect={3}
            >
              <img
                src={bannerSrc}
                alt="Banner"
                onLoad={(e) => setBannerImage(e.target)}
              />
            </ReactCrop>
            <div className="cropper-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowBannerCropper(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCropBanner}
                disabled={saving}
                data-testid="confirm-crop-banner"
              >
                {saving ? 'Subiendo...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default ProfileSection;
