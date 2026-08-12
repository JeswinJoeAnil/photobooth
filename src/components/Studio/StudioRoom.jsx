import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BatteryMedium,
  Camera,
  Check,
  Flashlight,
  Grid2X2,
  Image as ImageIcon,
  Palette,
  RefreshCcw,
  Sliders,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { StudioCompositor } from '../../pipeline/studioCompositor.js';
import { segmentationPipeline } from '../../utils/segmentationPipeline.js';
import { STUDIO_BACKGROUNDS } from '../../constants/studioAssets.js';

const RESOLUTION_OPTIONS = [
  { id: '1080p', label: '1080p (Full HD)', desc: 'Highest photo detail & crisp resolution', width: 1920, height: 1080 },
  { id: '720p', label: '720p (HD)', desc: 'Balanced sharpness & smooth motion', width: 1280, height: 720 },
  { id: '480p', label: '480p (SD)', desc: 'Fastest performance & low latency', width: 854, height: 480 },
];

/**
 * StudioRoom — Virtual photo studio room component.
 *
 * Manages:
 * - UI toolbar controls (Flash, Mirror, Quality, Timer, Shots, Backgrounds).
 * - Offscreen DOM video mounting for continuous WebRTC decoding.
 * - Delegation of layer compositing to StudioCompositor.
 * - High-precision HD photo capture on shutter trigger.
 */
function StudioRoomComponent({
  isHost,
  roomCode,
  participants,
  localStream,
  displayName,
  broadcast,
  onData,
  onLeave,
  onCaptureComplete,
  flashOn: propFlashOn,
  setFlashOn: propSetFlashOn,
  mirrorOn: propMirrorOn,
  setMirrorOn: propSetMirrorOn,
}) {
  const [background, setBackground] = useState(STUDIO_BACKGROUNDS[0]);
  const [customBgUrl, setCustomBgUrl] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [flashFire, setFlashFire] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showQualityControls, setShowQualityControls] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState('1080p');
  const [timer, setTimer] = useState(3);
  const [shotCount, setShotCount] = useState(4);
  const [shooting, setShooting] = useState(false);
  const [shotIndex, setShotIndex] = useState(null);

  /* Local mirror/flash state fallback if props not provided */
  const [localFlashOn, setLocalFlashOn] = useState(true);
  const [localMirrorOn, setLocalMirrorOn] = useState(true);

  const flashOn = propFlashOn !== undefined ? propFlashOn : localFlashOn;
  const setFlashOn = propSetFlashOn || setLocalFlashOn;
  const mirrorOn = propMirrorOn !== undefined ? propMirrorOn : localMirrorOn;
  const setMirrorOn = propSetMirrorOn || setLocalMirrorOn;

  const compositorCanvasRef = useRef(null);
  const compositorEngineRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const fileInputRef = useRef(null);
  const controlsRef = useRef(null);
  const shutterBtnRef = useRef(null);
  const animFrameRef = useRef(null);

  /* Initialize MediaPipe Segmentation Pipeline */
  useEffect(() => {
    segmentationPipeline.init();
  }, []);

  /* Auto-center the shutter button in the scrollable toolbar on mount/resize */
  useEffect(() => {
    const centerShutter = () => {
      if (controlsRef.current && shutterBtnRef.current) {
        const container = controlsRef.current;
        const btn = shutterBtnRef.current;
        const scrollTarget = btn.offsetLeft + btn.offsetWidth / 2 - container.clientWidth / 2;
        container.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
      }
    };
    const timerId = setTimeout(centerShutter, 200);
    window.addEventListener('resize', centerShutter);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener('resize', centerShutter);
    };
  }, []);

  /* Initialize StudioCompositor Engine */
  useEffect(() => {
    if (!compositorEngineRef.current) {
      compositorEngineRef.current = new StudioCompositor(compositorCanvasRef.current);
    } else {
      compositorEngineRef.current.setCanvas(compositorCanvasRef.current);
    }
  }, []);

  /* Live Preview 60 FPS Compositing Loop */
  useEffect(() => {
    const activeBg = customBgUrl ? { solidColor: '#000', customImageUrl: customBgUrl } : background;

    const renderLoop = () => {
      if (compositorEngineRef.current) {
        compositorEngineRef.current.renderFrame({
          background: activeBg,
          localVideo: localVideoRef.current,
          remoteVideosMap: remoteVideosRef.current,
          participants,
          mirrorOn,
        });
      }
      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [background, customBgUrl, participants, mirrorOn]);

  /* Cleanup remote video references on disconnect */
  useEffect(() => {
    const activePeerIds = new Set(participants.map((p) => p.peerId));
    remoteVideosRef.current.forEach((video, peerId) => {
      if (!activePeerIds.has(peerId)) {
        if (video) video.srcObject = null;
        remoteVideosRef.current.delete(peerId);
        segmentationPipeline.removeParticipant(peerId);
      }
    });
  }, [participants]);

  const handleResolutionChange = useCallback(
    (opt) => {
      setSelectedResolution(opt.id);
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()?.[0];
        if (videoTrack && videoTrack.applyConstraints) {
          videoTrack
            .applyConstraints({
              width: { ideal: opt.width },
              height: { ideal: opt.height },
            })
            .catch((err) => console.warn('Camera resolution notice:', err));
        }
      }
    },
    [localStream]
  );

  /* Host broadcasts background changes */
  const handleBackgroundChange = useCallback(
    (bg) => {
      setCustomBgUrl(null);
      setBackground(bg);
      setShowBgPicker(false);

      if (isHost) {
        broadcast({ type: 'BACKGROUND_CHANGE', backgroundId: bg.id });
      }
    },
    [isHost, broadcast]
  );

  /* Custom Image Upload */
  const handleCustomImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setCustomBgUrl(url);
    setShowBgPicker(false);
  };

  /* ─── Sequential Multi-Shot High-Precision Capture Routine ─── */
  const runSequentialCapture = useCallback(
    async (totalShots = 4, timerSec = 3) => {
      if (shooting) return;
      setShooting(true);

      if (isHost) {
        broadcast({ type: 'BURST_START', totalShots, timerSec });
      }

      const capturedList = [];
      const activeBg = customBgUrl ? { solidColor: '#000', customImageUrl: customBgUrl } : background;

      for (let shot = 1; shot <= totalShots; shot++) {
        setShotIndex(shot);

        if (timerSec > 0) {
          for (let sec = timerSec; sec > 0; sec--) {
            setCountdown(sec);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCountdown(null);
        }

        if (flashOn) {
          setFlashFire(true);
          setTimeout(() => setFlashFire(false), 480);
          if (isHost) broadcast({ type: 'FLASH_FIRE' });
        }

        /* Execute High-Resolution Snapshot Capture Pass */
        if (compositorEngineRef.current) {
          const hdDataUrl = await compositorEngineRef.current.captureHD({
            background: activeBg,
            localVideo: localVideoRef.current,
            remoteVideosMap: remoteVideosRef.current,
            participants,
            mirrorOn,
          });
          if (hdDataUrl) {
            capturedList.push(hdDataUrl);
          }
        }

        if (shot < totalShots) {
          await new Promise((r) => setTimeout(r, 1600));
        }
      }

      setShooting(false);
      setShotIndex(null);
      onCaptureComplete(capturedList, totalShots);
    },
    [shooting, isHost, broadcast, flashOn, onCaptureComplete, customBgUrl, background, participants, mirrorOn]
  );

  /* Host/Peer synchronized events */
  useEffect(() => {
    const hostId = `memorie-studio-${roomCode}`;

    const unsubscribe = onData((data, fromPeerId) => {
      if (!data?.type) return;
      if (fromPeerId !== hostId) return;

      if (data.type === 'BURST_START') {
        runSequentialCapture(data.totalShots, data.timerSec);
      }
      if (data.type === 'SHOT_COUNT_CHANGE') {
        setShotCount(data.shotCount);
      }
      if (data.type === 'BACKGROUND_CHANGE') {
        const bg = STUDIO_BACKGROUNDS.find((b) => b.id === data.backgroundId);
        if (bg) {
          setCustomBgUrl(null);
          setBackground(bg);
        }
      }
      if (data.type === 'FLASH_FIRE' && flashOn) {
        setFlashFire(true);
        setTimeout(() => setFlashFire(false), 480);
      }
    });

    return unsubscribe;
  }, [roomCode, onData, runSequentialCapture, flashOn]);

  const totalParticipants = 1 + participants.length;

  return (
    <motion.div
      className="studio-room"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Offscreen DOM video elements with valid dimensions to prevent browser stream throttling */}
      <div
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '320px',
          height: '240px',
          opacity: 0.01,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: -9999,
        }}
        aria-hidden="true"
      >
        {localStream && (
          <video
            ref={(el) => {
              if (el) {
                localVideoRef.current = el;
                if (el.srcObject !== localStream) {
                  el.srcObject = localStream;
                }
                if (el.paused) {
                  el.play().catch(() => {});
                }
              }
            }}
            style={{ width: '320px', height: '240px' }}
            autoPlay
            playsInline
            muted
          />
        )}
        {participants.map((p) => (
          <video
            key={p.peerId}
            ref={(el) => {
              if (el) {
                remoteVideosRef.current.set(p.peerId, el);
                if (el.srcObject !== p.stream) {
                  el.srcObject = p.stream;
                }
                if (el.paused) {
                  el.play().catch(() => {});
                }
              }
            }}
            style={{ width: '320px', height: '240px' }}
            autoPlay
            playsInline
            muted
          />
        ))}
      </div>

      {/* Hidden file input for custom background image */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        style={{ display: 'none' }}
        onChange={handleCustomImageUpload}
      />

      {/* Top bar */}
      <div className="studio-room-topbar">
        <button type="button" className="studio-room-back" onClick={onLeave} disabled={shooting}>
          <ArrowLeft size={18} />
          <span>Leave Studio</span>
        </button>
        <div className="studio-room-info">
          <span className="studio-room-code-badge">{roomCode}</span>
          <span className="studio-room-participant-count">
            <Users size={14} /> {totalParticipants}
          </span>
        </div>
      </div>

      {/* Live Shooting Progress Badge */}
      {shooting && shotIndex && (
        <motion.div
          className="studio-shooting-badge"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          ● SHOOTING SHOT {shotIndex} OF {shotCount}
        </motion.div>
      )}

      {/* Main Layer Compositor Viewport */}
      <div className="studio-viewport">
        <canvas
          ref={compositorCanvasRef}
          className="studio-compositor-canvas"
          width={1280}
          height={720}
        />

        {/* Framing guide overlay */}
        <div className="studio-framing-guide">
          <div className="studio-framing-box" />
          <span className="studio-framing-text">Stay in frame</span>
        </div>

        {/* Countdown overlay */}
        <AnimatePresence mode="wait">
          {countdown !== null && (
            <motion.div
              className="studio-countdown-overlay"
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <span className="studio-countdown-number">{countdown}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Flash overlay */}
        <AnimatePresence>
          {flashFire && (
            <motion.div
              className="studio-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Main Studio Toolbar */}
      <div className="studio-controls" ref={controlsRef}>
        {/* Flash Toggle */}
        <motion.button
          type="button"
          className={`studio-bg-btn studio-opt-btn ${flashOn ? 'opt-active' : ''}`}
          onClick={() => setFlashOn((v) => !v)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          aria-pressed={flashOn}
        >
          <Flashlight size={16} /> Flash <span>{flashOn ? 'on' : 'off'}</span>
        </motion.button>

        {/* Mirror Toggle */}
        <motion.button
          type="button"
          className={`studio-bg-btn studio-opt-btn ${mirrorOn ? 'opt-active' : ''}`}
          onClick={() => setMirrorOn((v) => !v)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          aria-pressed={mirrorOn}
        >
          <RefreshCcw size={16} /> Mirror <span>{mirrorOn ? 'on' : 'off'}</span>
        </motion.button>

        {/* Quality / Resolution Selection Toggle */}
        <motion.button
          type="button"
          className={`studio-bg-btn studio-opt-btn ${showQualityControls ? 'opt-active' : ''}`}
          onClick={() => {
            setShowQualityControls(!showQualityControls);
            setShowBgPicker(false);
          }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          title="Select Camera Resolution"
        >
          <Sliders size={16} /> Quality <span>{selectedResolution}</span>
        </motion.button>

        {/* CENTER: Camera Shutter Button (Host) or Guest Hint */}
        {isHost ? (
          <motion.button
            ref={shutterBtnRef}
            type="button"
            className="studio-shutter-btn"
            onClick={() => runSequentialCapture(shotCount, timer)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={shooting || countdown !== null}
            aria-label="Take Photo"
          >
            <Camera size={24} />
          </motion.button>
        ) : (
          <div className="studio-guest-hint" ref={shutterBtnRef}>
            <Sparkles size={14} />
            <span>The host will take the photo</span>
          </div>
        )}

        {/* Right Options (Host controlled) */}
        {isHost && (
          <>
            {/* Timer Button */}
            <motion.button
              type="button"
              className={`studio-bg-btn studio-opt-btn ${timer > 0 ? 'opt-active' : ''}`}
              onClick={() => {
                if (shooting) return;
                const options = [0, 2, 3, 5, 10];
                const next = options[(options.indexOf(timer) + 1) % options.length];
                setTimer(next);
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
              aria-pressed={timer > 0}
            >
              <BatteryMedium size={16} /> Timer <span>{timer === 0 ? 'off' : `${timer}s`}</span>
            </motion.button>

            {/* Shots Selection Button */}
            <motion.button
              type="button"
              className="studio-bg-btn studio-opt-btn opt-active"
              onClick={() => {
                if (shooting) return;
                const options = [1, 2, 3, 4, 6];
                const next = options[(options.indexOf(shotCount) + 1) % options.length];
                setShotCount(next);
                broadcast({ type: 'SHOT_COUNT_CHANGE', shotCount: next });
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
              aria-label="Select Shot Count"
            >
              <Grid2X2 size={16} /> Shots <span>{shotCount}</span>
            </motion.button>

            {/* Scene Picker Toggle */}
            <motion.button
              type="button"
              className={`studio-bg-btn ${showBgPicker ? 'opt-active' : ''}`}
              onClick={() => {
                setShowBgPicker(!showBgPicker);
                setShowQualityControls(false);
              }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
            >
              <ImageIcon size={16} /> Background
            </motion.button>
          </>
        )}
      </div>

      {/* Background / Scene Picker Panel */}
      <AnimatePresence>
        {showBgPicker && (
          <motion.div
            className="studio-bg-picker"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div className="studio-picker-header">
              <span className="studio-bg-picker-label">Studio Backgrounds</span>
              <button
                type="button"
                className="studio-upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> Upload Custom
              </button>
            </div>

            {/* Studio Preset Scenes Grid */}
            <div className="studio-bg-picker-grid">
              {STUDIO_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  className={`studio-bg-option ${!customBgUrl && background.id === bg.id ? 'active' : ''}`}
                  onClick={() => handleBackgroundChange(bg)}
                  title={bg.name}
                >
                  <div
                    className="studio-bg-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${bg.gradient[0]}, ${bg.accent || bg.gradient[bg.gradient.length - 1]})`,
                    }}
                  />
                  <span>{bg.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Quality & Resolution Picker Drawer */}
      <AnimatePresence>
        {showQualityControls && (
          <motion.div
            className="studio-quality-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div className="studio-picker-header">
              <span className="studio-bg-picker-label">Camera Quality</span>
            </div>

            <div className="studio-resolution-list">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`studio-resolution-item ${selectedResolution === opt.id ? 'active' : ''}`}
                  onClick={() => handleResolutionChange(opt)}
                >
                  <div className="studio-res-info">
                    <span className="studio-res-title">{opt.label}</span>
                    <span className="studio-res-desc">{opt.desc}</span>
                  </div>
                  {selectedResolution === opt.id && <Check size={16} className="studio-res-check" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const StudioRoom = memo(StudioRoomComponent);
