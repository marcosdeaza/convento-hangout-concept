import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { ChatIcon, MicIcon, PaperclipIcon, SendIcon, FileIcon } from '@/components/Icons';
import AudioRecorder from '@/components/AudioRecorder';
import './ChatSection.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ChatSection({ user, messages, onRefresh, onMessageSent }) {
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (content, type = 'text', fileUrl = null) => {
    if ((!content.trim() && !fileUrl) || sending) {
      console.log('Cannot send: empty or already sending');
      return;
    }

    console.log('🚀 Sending message:', { content, type, fileUrl, userId: user.id });
    setSending(true);
    try {
      const response = await axios.post(`${API}/messages`, {
        user_id: user.id,
        content: content || 'Archivo adjunto',
        message_type: type,
        file_url: fileUrl,
      });
      console.log('✅ Message sent successfully:', response.data);
      setMessageText('');
      
      // Trigger immediate refresh
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (err) {
      console.error('❌ Error sending message:', err);
      console.error('Error details:', err.response?.data);
      alert(`Error al enviar mensaje: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    
    // Check if it's a link
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(messageText)) {
      sendMessage(messageText, 'link');
    } else {
      sendMessage(messageText, 'text');
    }
  };

  const handleStartRecording = () => {
    setShowAudioRecorder(true);
  };

  const handleAudioSend = async (audioBlob) => {
    setShowAudioRecorder(false);
    await uploadAudio(audioBlob);
  };

  const handleAudioCancel = () => {
    setShowAudioRecorder(false);
  };

  const uploadAudio = async (audioBlob) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');

      console.log('📤 Uploading audio file...');
      const uploadResponse = await axios.post(
        `${API}/upload/${user.id}/audio`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      console.log('✅ Audio uploaded successfully:', uploadResponse.data);
      await sendMessage('Mensaje de voz', 'audio', uploadResponse.data.file_url);
    } catch (err) {
      console.error('❌ Error uploading audio:', err);
      alert('Error al subir el audio');
    } finally {
      setUploading(false);
    }
  };

  const uploadAudio = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    
    setSending(true);
    try {
      const uploadResponse = await axios.post(
        `${API}/upload/${user.id}/audio`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      await sendMessage('Audio', 'audio', uploadResponse.data.file_url);
    } catch (err) {
      console.error('Error uploading audio:', err);
      alert('Error al subir audio');
    } finally {
      setSending(false);
    }
  };

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    let messageType = 'file';
    if (file.type.startsWith('image/')) {
      messageType = 'image';
    }

    setSending(true);
    try {
      const uploadResponse = await axios.post(
        `${API}/upload/${user.id}/${messageType}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      await sendMessage(file.name, messageType, uploadResponse.data.file_url);
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Error al subir archivo');
    } finally {
      setSending(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <motion.div
      className="chat-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      data-testid="chat-section"
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      
      {/* Header */}
      <div className="section-header glass">
        <h2 className="section-title">
          <span className="section-icon"><ChatIcon size={28} /></span>
          Chat General
        </h2>
        <div className="header-info">
          <div className="online-users">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="users-icon">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span className="user-count">1</span>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="messages-container glass">
        {isDragActive && (
          <motion.div
            className="drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="drop-content">
              <FileIcon size={80} color="white" />
              <p>Suelta el archivo aquí</p>
            </div>
          </motion.div>
        )}

        <div className="messages-list">
          <AnimatePresence>
            {messages.map((message, index) => (
              <Message key={message.id || index} message={message} />
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="input-area glass">
        <form onSubmit={handleSendMessage} className="message-form">
          <button
            type="button"
            className="action-btn"
            onClick={() => document.getElementById('file-input').click()}
            disabled={sending}
            data-testid="attach-file-button"
            title="Adjuntar archivo"
          >
            <PaperclipIcon size={20} />
          </button>
          <input
            id="file-input"
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files[0]) {
                onDrop([e.target.files[0]]);
              }
            }}
          />

          <motion.button
            type="button"
            className={`action-btn ${recording ? 'recording' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            whileTap={{ scale: 0.9 }}
            disabled={sending}
            data-testid="voice-record-button"
            title="Mantén presionado para grabar"
          >
            <MicIcon size={20} />
          </motion.button>

          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Escribe algo bonito..."
            className="message-input"
            disabled={sending}
            data-testid="message-input"
          />

          <motion.button
            type="submit"
            className="send-btn"
            disabled={!messageText.trim() || sending}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            data-testid="send-message-button"
            title="Enviar mensaje"
          >
            <SendIcon size={20} />
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
}

function Message({ message }) {
  const renderContent = () => {
    switch (message.message_type) {
      case 'image':
        return (
          <div className="message-image">
            <img src={`${BACKEND_URL}${message.file_url}`} alt="Imagen" />
          </div>
        );
      
      case 'audio':
        return (
          <div className="message-audio">
            <audio controls src={`${BACKEND_URL}${message.file_url}`} />
          </div>
        );
      
      case 'link':
        return (
          <div className="message-link">
            <a href={message.content} target="_blank" rel="noopener noreferrer">
              {message.content}
            </a>
          </div>
        );
      
      case 'file':
        return (
          <div className="message-file">
            <a href={`${BACKEND_URL}${message.file_url}`} target="_blank" rel="noopener noreferrer">
              <FileIcon size={16} /> {message.content}
            </a>
          </div>
        );
      
      default:
        return <p className="message-text">{message.content}</p>;
    }
  };

  return (
    <motion.div
      className="message"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      data-testid="chat-message"
    >
      <div
        className="message-avatar aura-glow"
        style={{
          backgroundImage: message.avatar_url
            ? `url(${BACKEND_URL}${message.avatar_url})`
            : 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
          '--aura-color': message.aura_color,
          boxShadow: `0 0 15px ${message.aura_color}40`,
        }}
      />
      <div className="message-content">
        <div className="message-header">
          <span
            className="message-author"
            style={{ color: message.aura_color }}
          >
            {message.username}
          </span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        {renderContent()}
      </div>
    </motion.div>
  );
}

export default ChatSection;
