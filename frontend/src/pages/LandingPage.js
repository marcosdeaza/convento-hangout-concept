import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import './LandingPage.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function LandingPage({ onLogin }) {
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [particles, setParticles] = useState([]);
  const [showRegister, setShowRegister] = useState(false);
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    // Generate particles
    const particleArray = [];
    for (let i = 0; i < 50; i++) {
      particleArray.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 10 + 10,
        delay: Math.random() * 5,
      });
    }
    setParticles(particleArray);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, {
        access_code: accessCode,
      });
      onLogin(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Código de acceso inválido');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`);
      setNewCode(response.data.access_code);
    } catch (err) {
      setError('Error al generar código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-page" data-testid="landing-page">
      {/* Aurora Background */}
      <div className="aurora-bg" />

      {/* Floating Particles */}
      <div className="particles-container">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
            }}
            animate={{
              y: [0, -100, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="landing-content">
        <motion.div
          className="landing-header"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.h1
            className="title text-gradient glow-text"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{ duration: 5, repeat: Infinity }}
          >
            Convento
          </motion.h1>
          <motion.p
            className="subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Tu espacio para hablar, reír y desaparecer por un rato.
          </motion.p>
          <motion.p
            className="credits"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            Creado por <span className="creator-name">Marcos de Aza</span>
          </motion.p>
        </motion.div>

        {/* Login Form */}
        {!showRegister && !newCode && (
          <motion.div
            className="login-card glass aura-glow"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            data-testid="login-form"
          >
            <form onSubmit={handleLogin}>
              <motion.div
                className="input-group"
                whileFocus={{ scale: 1.02 }}
              >
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Introduce tu código de acceso"
                  className="access-input"
                  maxLength={16}
                  data-testid="access-code-input"
                />
                <div className="input-glow" />
              </motion.div>

              {error && (
                <motion.div
                  className="error-message"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  data-testid="error-message"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                className="btn-primary"
                disabled={loading || accessCode.length !== 16}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                data-testid="login-button"
              >
                {loading ? (
                  <span className="spinner-small" />
                ) : (
                  'Entrar al Convento'
                )}
              </motion.button>
            </form>

            <div className="divider">
              <span>o</span>
            </div>

            <motion.button
              className="btn-secondary"
              onClick={() => setShowRegister(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              data-testid="register-button"
            >
              Generar nuevo código
            </motion.button>
          </motion.div>
        )}

        {/* Register Confirmation */}
        {showRegister && !newCode && (
          <motion.div
            className="register-card glass aura-glow"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            data-testid="register-confirmation"
          >
            <h2>¿Quieres generar un nuevo código?</h2>
            <p>Este código será tu llave de acceso única al Convento.</p>
            <div className="button-group">
              <motion.button
                className="btn-primary"
                onClick={handleRegister}
                disabled={loading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                data-testid="confirm-register-button"
              >
                {loading ? 'Generando...' : 'Sí, generar código'}
              </motion.button>
              <motion.button
                className="btn-secondary"
                onClick={() => setShowRegister(false)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Cancelar
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* New Code Display */}
        {newCode && (
          <motion.div
            className="code-display glass aura-glow"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            data-testid="new-code-display"
          >
            <motion.div
              className="success-icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
            >
              ✓
            </motion.div>
            <h2>¡Tu código ha sido generado!</h2>
            <motion.div
              className="code-box"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(139, 92, 246, 0.3)',
                  '0 0 40px rgba(139, 92, 246, 0.6)',
                  '0 0 20px rgba(139, 92, 246, 0.3)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <code className="access-code" data-testid="generated-code">{newCode}</code>
            </motion.div>
            <p className="code-warning">
              ⚠️ Guarda este código en un lugar seguro. Lo necesitarás para acceder.
            </p>
            <motion.button
              className="btn-primary"
              onClick={() => {
                setAccessCode(newCode);
                setNewCode('');
                setShowRegister(false);
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              data-testid="use-code-button"
            >
              Usar este código ahora
            </motion.button>
          </motion.div>
        )}

        {/* Feature Cards */}
        <motion.div
          className="features"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          <FeatureCard
            icon="💬"
            title="Chat General"
            description="Comparte mensajes, fotos, GIFs y audios con tu comunidad"
            delay={1.2}
          />
          <FeatureCard
            icon="🎧"
            title="Canales de Voz"
            description="Crea salas de voz dinámicas con modo fantasma"
            delay={1.4}
          />
          <FeatureCard
            icon="✨"
            title="Perfil Único"
            description="Personaliza tu avatar, banner y aura de color"
            delay={1.6}
          />
        </motion.div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }) {
  return (
    <motion.div
      className="feature-card glass-light card-hover"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6 }}
      whileHover={{
        scale: 1.05,
        rotateY: 5,
      }}
    >
      <motion.div
        className="feature-icon"
        whileHover={{ scale: 1.2, rotate: 360 }}
        transition={{ duration: 0.5 }}
      >
        {icon}
      </motion.div>
      <h3>{title}</h3>
      <p>{description}</p>
    </motion.div>
  );
}

export default LandingPage;
