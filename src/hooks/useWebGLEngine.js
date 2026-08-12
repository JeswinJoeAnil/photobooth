import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGLEngine } from '../pipeline/webglEngine.js';

export function useWebGLEngine(canvasRef, videoRef, initialSettings = {}) {
  const engineRef = useRef(null);
  const [stats, setStats] = useState({
    fps: 0,
    inferenceMs: 0,
    temporalFilterMs: 0,
    compositeMs: 0,
    totalFrameMs: 0,
    currentInferenceRes: '256x144',
    isGpuAccelerated: true,
    droppedFrames: 0,
    adaptiveLevel: 'High (256x144)',
  });
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  const [settings, setSettings] = useState({
    mode: 'image',
    customImageUrl: '',
    solidColor: '#ff5aaf',
    blurRadius: 12,
    edgeFeather: 0.08,
    colorDecontamination: 0.6,
    temporalAlpha: 0.18,
    autoQuality: true,
    mirrorVideo: true,
    showDevOverlay: false,
    ...initialSettings,
  });

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (engineRef.current) {
        engineRef.current.updateSettings(updated);
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (!engineRef.current) {
        engineRef.current = new WebGLEngine(canvas, settings, {
          onStatsUpdate: (newStats) => setStats(newStats),
          onError: (err) => setError(err),
        });
        setIsReady(true);
      }
    } catch (err) {
      console.error('Failed to create WebGLEngine:', err);
      setError(String(err));
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
        setIsReady(false);
      }
    };
  }, [canvasRef]);

  useEffect(() => {
    const video = videoRef.current;
    const engine = engineRef.current;

    if (engine && video && video.readyState >= 2) {
      engine.setVideoSource(video);
      engine.start();
    } else if (engine && video) {
      const handleLoaded = () => {
        engine.setVideoSource(video);
        engine.start();
      };
      video.addEventListener('loadeddata', handleLoaded);
      return () => {
        video.removeEventListener('loadeddata', handleLoaded);
      };
    }
  }, [videoRef, isReady]);

  return {
    engine: engineRef.current,
    settings,
    updateSettings,
    stats,
    error,
    isReady,
  };
}
