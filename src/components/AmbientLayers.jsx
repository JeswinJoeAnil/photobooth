import React, { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

function AmbientLayersComponent() {
  const prefersReduced = useReducedMotion();

  return (
    <>
      <div className="grain-layer" />
      <div className="vhs-layer" />
      <div className="glow glow-a" />
      <div className="glow glow-b" />
      {prefersReduced ? (
        <>
          <div className="floating-star star-a" aria-hidden="true">✧</div>
          <div className="floating-star star-b" aria-hidden="true">✦</div>
          <div className="floating-star star-c" aria-hidden="true">☆</div>
        </>
      ) : (
        <>
          <motion.div className="floating-star star-a" animate={{ y: [0, -24, 0], rotate: [0, 12, 0] }} transition={{ duration: 6, repeat: Infinity }}>✧</motion.div>
          <motion.div className="floating-star star-b" animate={{ y: [0, 18, 0], rotate: [0, -14, 0] }} transition={{ duration: 5, repeat: Infinity }}>✦</motion.div>
          <motion.div className="floating-star star-c" animate={{ y: [0, -16, 0], rotate: [0, 8, 0] }} transition={{ duration: 7, repeat: Infinity }}>☆</motion.div>
        </>
      )}
    </>
  );
}

export const AmbientLayers = memo(AmbientLayersComponent);
