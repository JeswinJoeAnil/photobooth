import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BatteryMedium, Camera, Flashlight, Grid2X2, Image, RefreshCcw, Sparkles, Users } from 'lucide-react';
import { useSegmentation } from '../../hooks/useSegmentation.js';
import { STUDIO_BACKGROUNDS, PARTICIPANT_LAYOUTS } from '../../constants/studioAssets.js';

/**
 * StudioRoom — The main multiplayer photo studio experience.
 *
 * Composites segmented participant video onto a shared virtual background,
 * handles synchronized multi-shot countdown/capture, and outputs group photos
 * for the existing Memorie editor pipeline.
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
  const [countdown, setCountdown] = useState(null);
  const [flashFire, setFlashFire] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [segStatus, setSegStatus] = useState('loading');
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
  const localVideoRef = useRef(null);
  const rafRef = useRef(null);

  /* Set up local video element (hidden, used for segmentation input) */
  useEffect(() => {
    if (!localStream) return;
    if (!localVideoRef.current) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      localVideoRef.current = video;
    }
    localVideoRef.current.srcObject = localStream;
    localVideoRef.current.play().catch(() => {});
  }, [localStream]);

  /* Segmentation */
  const { ready: segReady, loading: segLoading, error: segError, segmentFrame } =
    useSegmentation(localVideoRef.current, !!localStream);

  useEffect(() => {
    if (segLoading) setSegStatus('loading');
    else if (segError) setSegStatus('unavailable');
    else if (segReady) setSegStatus('ready');
  }, [segReady, segLoading, segError]);

  /* Create participant video elements for remote streams */
  const remoteVideosRef = useRef(new Map());

  useEffect(() => {
    participants.forEach((p) => {
      if (!remoteVideosRef.current.has(p.peerId)) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        remoteVideosRef.current.set(p.peerId, video);
      }
      const video = remoteVideosRef.current.get(p.peerId);
      if (video.srcObject !== p.stream) {
        video.srcObject = p.stream;
        video.play().catch(() => {});
      }
    });

    /* Clean up videos for departed participants */
    const activePeerIds = new Set(participants.map((p) => p.peerId));
    remoteVideosRef.current.forEach((video, peerId) => {
      if (!activePeerIds.has(peerId)) {
        video.srcObject = null;
        remoteVideosRef.current.delete(peerId);
      }
    });
  }, [participants]);

  const bgCanvasRef = useRef(null);
  const cachedBgKeyRef = useRef('');

  /* Cache background gradient offscreen so it isn't recreated every frame */
  const renderCachedBackground = useCallback((w, h, bg) => {
    const bgKey = `${bg.id}_${w}_${h}`;
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement('canvas');
    }
    const bgCanvas = bgCanvasRef.current;
    if (cachedBgKeyRef.current === bgKey && bgCanvas.width === w && bgCanvas.height === h) {
      return bgCanvas;
    }

    bgCanvas.width = w;
    bgCanvas.height = h;
    const bgCtx = bgCanvas.getContext('2d');

    /* Draw background gradient */
    const grad = bgCtx.createLinearGradient(0, 0, 0, h);
    bg.gradient.forEach((color, i) => {
      grad.addColorStop(i / (bg.gradient.length - 1), color);
    });
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, w, h);

    /* Draw ambient glow effects */
    if (bg.ambientGlow) {
      bg.ambientGlow.forEach((glow) => {
        const gx = glow.x * w;
        const gy = glow.y * h;
        const gRad = bgCtx.createRadialGradient(gx, gy, 0, gx, gy, glow.radius);
        gRad.addColorStop(0, glow.color);
        gRad.addColorStop(1, 'transparent');
        bgCtx.fillStyle = gRad;
        bgCtx.fillRect(0, 0, w, h);
      });
    }

    /* Draw floor reflection */
    if (bg.floorColor) {
      const floorGrad = bgCtx.createLinearGradient(0, h * 0.7, 0, h);
      floorGrad.addColorStop(0, 'transparent');
      floorGrad.addColorStop(1, bg.floorColor);
      bgCtx.fillStyle = floorGrad;
      bgCtx.fillRect(0, 0, w, h);
    }

    cachedBgKeyRef.current = bgKey;
    return bgCanvas;
  }, []);

  /* ─── Compositor: Live rendering loop ─── */
  const drawComposite = useCallback(() => {
    const canvas = compositorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    /* Draw cached background */
    const bgCanvas = renderCachedBackground(w, h, background);
    ctx.drawImage(bgCanvas, 0, 0);

    /* Determine participant count and layout */
    const totalParticipants = 1 + participants.length;
    const layout = PARTICIPANT_LAYOUTS[Math.min(totalParticipants, 4)] || PARTICIPANT_LAYOUTS[4];

    /* Draw each participant */
    const allParticipants = [
      { video: localVideoRef.current, isLocal: true, name: displayName },
      ...participants.map((p) => ({
        video: remoteVideosRef.current.get(p.peerId),
        isLocal: false,
        name: p.name,
      })),
    ].slice(0, 4);

    allParticipants.forEach((participant, index) => {
      const pos = layout[index];
      if (!pos || !participant.video || participant.video.readyState < 2) return;

      const video = participant.video;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      /* Calculate destination dimensions — full-body floor-anchored cutout */
      const baseHeight = h * 0.78 * pos.scale;
      const aspectRatio = vw / vh;
      const destW = baseHeight * aspectRatio;
      const destH = baseHeight;
      const destX = pos.x * w - destW / 2;
      /* Anchor feet to the studio floor line (88% down the canvas) */
      const floorY = h * 0.88;
      const destY = floorY - destH;

      ctx.save();

      /* Mirror local participant if mirrorOn is enabled */
      if (participant.isLocal && mirrorOn) {
        ctx.translate(pos.x * w, 0);
        ctx.scale(-1, 1);
        ctx.translate(-pos.x * w, 0);
      }

      /* Apply background removal for local and remote participants */
      const segCanvas = segReady ? segmentFrame(video) : null;
      if (segCanvas) {
        ctx.drawImage(segCanvas, destX, destY, destW, destH);
      } else {
        /* Fallback: draw video frame with soft rounded corner clip */
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(destX, destY, destW, destH, 16);
        } else {
          ctx.rect(destX, destY, destW, destH);
        }
        ctx.clip();
        ctx.drawImage(video, destX, destY, destW, destH);
        ctx.restore();
      }

      ctx.restore();

      /* Draw name tag below participant */
      ctx.save();
      ctx.font = '600 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillText(
        (participant.name || (participant.isLocal ? 'YOU' : 'Guest')).toUpperCase(),
        pos.x * w,
        Math.min(h - 14, destY + destH + 18)
      );
      ctx.restore();
    });

    /* Draw branding watermark */
    ctx.save();
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'center';
    ctx.fillText('MEMORIE STUDIO', w / 2, h - 16);
    ctx.restore();

    rafRef.current = requestAnimationFrame(drawComposite);
  }, [background, participants, displayName, segReady, segmentFrame, mirrorOn, renderCachedBackground]);

  /* Start/stop compositor loop */
  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawComposite);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [drawComposite]);

  /* ─── Sequential Multi-Shot Capture Routine ─── */
  const runSequentialCapture = useCallback(async (totalShots = 4, timerSec = 3) => {
    if (shooting) return;
    setShooting(true);

    if (isHost) {
      broadcast({ type: 'BURST_START', totalShots, timerSec });
    }

    const capturedList = [];

    for (let shot = 1; shot <= totalShots; shot++) {
      setShotIndex(shot);

      /* Run countdown */
      if (timerSec > 0) {
        for (let sec = timerSec; sec > 0; sec--) {
          setCountdown(sec);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCountdown(null);
      }

      /* Flash effect */
      if (flashOn) {
        setFlashFire(true);
        setTimeout(() => setFlashFire(false), 480);
        if (isHost) broadcast({ type: 'FLASH_FIRE' });
      }

      /* Capture current compositor frame */
      const canvas = compositorCanvasRef.current;
      if (canvas) {
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = 1200;
        captureCanvas.height = 900;
        const ctx = captureCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);
        capturedList.push(captureCanvas.toDataURL('image/png'));
      }

      /* Pause between shots so friends can pose for the next frame */
      if (shot < totalShots) {
        await new Promise((r) => setTimeout(r, 1600));
      }
    }

    setShooting(false);
    setShotIndex(null);
    onCaptureComplete(capturedList, totalShots);
  }, [shooting, isHost, broadcast, flashOn, onCaptureComplete]);

  /* Listen for synchronized events from host */
  useEffect(() => {
    if (isHost) return;

    const unsubscribe = onData((data) => {
      if (data?.type === 'BURST_START') {
        runSequentialCapture(data.totalShots, data.timerSec);
      }
      if (data?.type === 'SHOT_COUNT_CHANGE') {
        setShotCount(data.shotCount);
      }
      if (data?.type === 'BACKGROUND_CHANGE') {
        const bg = STUDIO_BACKGROUNDS.find((b) => b.id === data.backgroundId);
        if (bg) setBackground(bg);
      }
      if (data?.type === 'FLASH_FIRE' && flashOn) {
        setFlashFire(true);
        setTimeout(() => setFlashFire(false), 480);
      }
    });

    return unsubscribe;
  }, [isHost, onData, runSequentialCapture, flashOn]);

  /* Host broadcasts background changes */
  const handleBackgroundChange = useCallback((bg) => {
    setBackground(bg);
    setShowBgPicker(false);
    if (isHost) {
      broadcast({ type: 'BACKGROUND_CHANGE', backgroundId: bg.id });
    }
  }, [isHost, broadcast]);

  /* Cleanup */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const totalParticipants = 1 + participants.length;

  return (
    <motion.div
      className="studio-room"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
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

      {/* Segmentation status */}
      {segStatus === 'loading' && (
        <motion.div
          className="studio-seg-status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Sparkles size={14} /> Preparing your camera...
        </motion.div>
      )}
      {segStatus === 'unavailable' && (
        <div className="studio-seg-status studio-seg-unavailable">
          Background removal isn't available on this device. Your original background will be shown.
        </div>
      )}

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

      {/* Main compositor viewport */}
      <div className="studio-viewport">
        <canvas
          ref={compositorCanvasRef}
          className="studio-compositor-canvas"
          width={800}
          height={600}
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

        {/* Flash */}
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

      {/* Controls */}
      <div className="studio-controls">
        {/* Flash Toggle Button */}
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

        {/* Mirror Toggle Button */}
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

        {/* Timer Button (Host controlled) */}
        {isHost && (
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
        )}

        {/* Shots Selection Button (Host controlled) */}
        {isHost && (
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
        )}

        {isHost && (
          <>
            <motion.button
              type="button"
              className="studio-bg-btn"
              onClick={() => setShowBgPicker(!showBgPicker)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              disabled={shooting}
            >
              <Image size={16} /> Scene
            </motion.button>

            <motion.button
              type="button"
              className="studio-shutter-btn"
              onClick={() => runSequentialCapture(shotCount, timer)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={shooting || countdown !== null}
            >
              <Camera size={24} />
            </motion.button>
          </>
        )}

        {!isHost && (
          <div className="studio-guest-hint">
            <Sparkles size={14} />
            <span>The host will take the photo</span>
          </div>
        )}
      </div>

      {/* Background picker */}
      <AnimatePresence>
        {showBgPicker && (
          <motion.div
            className="studio-bg-picker"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <span className="studio-bg-picker-label">Studio Scene</span>
            <div className="studio-bg-picker-grid">
              {STUDIO_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  className={`studio-bg-option ${background.id === bg.id ? 'active' : ''}`}
                  onClick={() => handleBackgroundChange(bg)}
                  title={bg.name}
                >
                  <div
                    className="studio-bg-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${bg.gradient[0]}, ${bg.gradient[bg.gradient.length - 1]})`,
                    }}
                  />
                  <span>{bg.name}</span>
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
