import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './ProfileSection.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ProfileSection({ user, onUpdate }) {
  const [username, setUsername] = useState(user.username);
  const [description, setDescription] = useState(user.description);
  const [auraColor, setAuraColor] = useState(user.aura_color);
  const [saving, setSaving] = useState(false);
  
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
        <div
          className="profile-banner"
          style={{
            backgroundImage: user.banner_url
              ? `url(${BACKEND_URL}${user.banner_url})`
              : 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
          }}
        >
          <motion.button
            className="edit-banner-btn"
            onClick={() => document.getElementById('banner-input').click()}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            data-testid="edit-banner-button"
          >
            📷
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
              backgroundImage: user.avatar_url
                ? `url(${BACKEND_URL}${user.avatar_url})`
                : 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              '--aura-color': auraColor,
              boxShadow: `0 0 30px ${auraColor}60`,
            }}
          >
            <motion.button
              className="edit-avatar-btn"
              onClick={() => document.getElementById('avatar-input').click()}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              data-testid="edit-avatar-button"
            >
              📷
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
          <p className="profile-code">Código: {user.access_code}</p>
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
                  {auraColor === color && '✓'}
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
