import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MicIcon, XIcon, SendIcon } from '@/components/Icons';
import './AudioRecorder.css';

function AudioRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [duration, setDuration] = useState(0);
  const [frequencies, setFrequencies] = useState(Array(20).fill(0));
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    startRecording();
    return () => {
      stopAllTracks();
    };
  }, []);

  const stopAllTracks = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const startRecording = async () => {
    try {
      console.log('🎤 AudioRecorder: Starting recording...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });
      
      console.log('✅ AudioRecorder: Got media stream');
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Audio context for visualization
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Start visualization
      visualize();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('No se pudo acceder al micrófono');
      onCancel();
    }
  };

  const visualize = () => {
    if (!analyserRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Map to 20 bars
      const bars = 20;
      const step = Math.floor(bufferLength / bars);
      const newFreqs = [];
      
      for (let i = 0; i < bars; i++) {
        const start = i * step;
        const end = start + step;
        const slice = dataArray.slice(start, end);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        newFreqs.push(Math.min(100, (avg / 255) * 100));
      }
      
      setFrequencies(newFreqs);
    };
    
    draw();
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      clearInterval(timerRef.current);
    }
    setIsPaused(!isPaused);
  };

  const handleSend = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('🎤 AudioRecorder: Stopping recording to send...');
      
      // Set up a promise to wait for the blob
      const sendPromise = new Promise((resolve) => {
        mediaRecorderRef.current.onstop = () => {
          console.log('🎤 AudioRecorder: Recording stopped, blob ready');
          resolve();
        };
      });
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      
      // Wait for recording to fully stop and blob to be ready
      sendPromise.then(() => {
        setTimeout(() => {
          if (audioBlob) {
            console.log('🎤 AudioRecorder: Sending audio blob:', audioBlob.size, 'bytes');
            onSend(audioBlob);
          } else {
            console.error('❌ AudioRecorder: No audio blob available to send');
            alert('Error: No se pudo procesar el audio grabado');
          }
        }, 200);
      });
    } else if (audioBlob) {
      // If already stopped but have blob, send it
      console.log('🎤 AudioRecorder: Sending existing audio blob');
      onSend(audioBlob);
    }
  };

  const handleCancel = () => {
    stopAllTracks();
    onCancel();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      className="audio-recorder"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      <div className="recorder-header">
        <div className="recorder-status">
          <motion.div
            className="recording-dot"
            animate={isRecording && !isPaused ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1],
            } : {}}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="recording-text">
            {isPaused ? 'Pausado' : 'Grabando...'}
          </span>
        </div>
        <span className="recording-time">{formatTime(duration)}</span>
      </div>

      {/* Frequency Visualizer */}
      <div className="frequency-visualizer">
        {frequencies.map((height, index) => (
          <motion.div
            key={index}
            className="frequency-bar"
            animate={{
              height: `${Math.max(5, height)}%`,
            }}
            transition={{ duration: 0.1 }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="recorder-controls">
        <motion.button
          className="recorder-btn cancel-btn"
          onClick={handleCancel}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Cancelar"
        >
          <XIcon size={24} />
        </motion.button>

        <motion.button
          className="recorder-btn pause-btn"
          onClick={handlePauseResume}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title={isPaused ? 'Continuar' : 'Pausar'}
        >
          {isPaused ? '▶' : '⏸'}
        </motion.button>

        <motion.button
          className="recorder-btn send-btn"
          onClick={handleSend}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          disabled={duration < 1}
          title="Enviar"
        >
          <SendIcon size={24} />
        </motion.button>
      </div>
    </motion.div>
  );
}

export default AudioRecorder;
