import React, { useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, Camera, Film, Sparkles } from 'lucide-react';

export function NotFound({ onGoHome, onOpenLab }) {
  const handleGoHome = useCallback(() => {
    if (onGoHome) { onGoHome(); return; }
    const base = import.meta.env.BASE_URL || '/Memorie/';
    window.history.pushState(null, '', base);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onGoHome]);

  const handleLab = useCallback(() => {
    if (onOpenLab) { onOpenLab(); return; }
    const base = import.meta.env.BASE_URL || '/Memorie/';
    window.history.pushState(null, '', `${base}#editor`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onOpenLab]);

  // subtle pointer tilt — desktop only, reduced-motion respected via CSS
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [2.2, -2.2]), { stiffness: 90, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-3.2, 3.2]), { stiffness: 90, damping: 18 });

  const onPointerMove = useCallback((e) => {
    if (window.matchMedia('(max-width: 760px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [mx, my]);

  const onPointerLeave = useCallback(() => { mx.set(0); my.set(0); }, [mx, my]);

  return (
    <motion.section
      className="lost-wrap"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      aria-labelledby="lost-title"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* background */}
      <div className="lost-bg" aria-hidden="true" />
      <div className="lost-grain" aria-hidden="true" />

      {/* top brand — reuses header brand style */}
      <motion.a
        className="lost-brand"
        href="#top"
        onClick={(e) => { e.preventDefault(); handleGoHome(); }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        aria-label="Memorie home"
      >
        memorie<span>+</span>
      </motion.a>

      {/* editorial oversized watermark */}
      <div className="lost-watermark" aria-hidden="true">404</div>

      <div className="lost-stage">
        {/* ── missing frame ── */}
        <motion.div
          className="lost-frame-outer"
          initial={{ opacity: 0, y: 28, rotate: -1.4 }}
          animate={{ opacity: 1, y: 0, rotate: -1.4 }}
          transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.12 }}
          style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
        >
          <motion.div className="lost-frame" style={{ rotateX: rx, rotateY: ry }} transition={{ type: 'spring' }}>
            <div className="tape tape-a" aria-hidden="true" />
            <div className="tape tape-b lost-tape-b" aria-hidden="true" />

            {/* top meta bar — like CameraOverlay */}
            <div className="lost-frame-top">
              <span className="lost-rec"><i className="lost-rec-dot" aria-hidden="true" /> REC</span>
              <span className="lost-frame-id"><Film size={12} /> FRAME 00404</span>
              <span className="lost-iso">ISO 400</span>
            </div>

            {/* body — undeveloped / no-signal */}
            <div className="lost-frame-body">
              <div className="lost-body-grain" aria-hidden="true" />
              <div className="lost-scanline" aria-hidden="true" />
              <div className="lost-body-ghost" aria-hidden="true">404</div>

              <div className="lost-center">
                <motion.div
                  className="lost-404-num"
                  initial={{ opacity: 0, y: 10, letterSpacing: '0.22em' }}
                  animate={{ opacity: 1, y: 0, letterSpacing: '0.08em' }}
                  transition={{ delay: 0.45, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  aria-hidden="true"
                >
                  404
                </motion.div>
                <motion.div
                  className="lost-404-sep"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  aria-hidden="true"
                />
                <motion.p
                  className="lost-404-label"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.68 }}
                >
                  LOST FRAME
                </motion.p>
                <motion.p
                  className="lost-404-sub"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  NO IMAGE DATA — EXPOSED
                </motion.p>
              </div>

              {/* corner brackets — like focus-corner */}
              <span className="lost-corner tl" aria-hidden="true" />
              <span className="lost-corner tr" aria-hidden="true" />
              <span className="lost-corner bl" aria-hidden="true" />
              <span className="lost-corner br" aria-hidden="true" />
            </div>

            {/* bottom meta */}
            <div className="lost-frame-bottom">
              <span>NO SIGNAL</span>
              <span className="lost-memorie-mark">MEMORIE+</span>
              <span>00:00:04</span>
            </div>
          </motion.div>

          {/* soft shadow */}
          <div className="lost-frame-shadow" aria-hidden="true" />
        </motion.div>

        {/* ── copy ── */}
        <div className="lost-copy">
          <motion.p
            className="lost-kicker"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Sparkles size={13} /> 404 — Memory not found
          </motion.p>

          <motion.h1
            id="lost-title"
            className="lost-title"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, type: 'spring', stiffness: 90, damping: 18 }}
          >
            Looks like this memory
            <em> never developed.</em>
          </motion.h1>

          <motion.p
            className="lost-desc"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
          >
            The frame you&apos;re looking for isn&apos;t here. It was never exposed — let&apos;s get you back to the booth.
          </motion.p>

          <motion.div
            className="lost-actions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.52 }}
          >
            <motion.button
              type="button"
              className="lost-primary"
              onClick={handleGoHome}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              aria-label="Back to booth"
            >
              <Camera size={16} /> Back to Booth
            </motion.button>
            <button type="button" className="lost-ghost-btn" onClick={handleLab}>
              Memory Lab <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </motion.div>

          <motion.p
            className="lost-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            Check the URL or start a new strip — the booth is still warm.
          </motion.p>
        </div>
      </div>

      {/* bottom accent — editorial */}
      <motion.p
        className="lost-foot"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        aria-hidden="true"
      >
        <span>MEM-404</span> · <span>FRAME LOST</span> · <span>Y2K SYSTEM</span>
      </motion.p>
    </motion.section>
  );
}
