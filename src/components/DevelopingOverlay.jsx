import React, { memo } from 'react';
import { motion } from 'framer-motion';

function DevelopingOverlayComponent({ type }) {
  const label = type === 'png' ? 'polaroid developing' : type === 'jpg' ? 'film rolling' : type === 'gif' ? 'VHS rewinding' : 'cassette loading';
  return (
    <motion.div className="developing" role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="developing-card">
        <div className="film-roll"><span /></div>
        <strong>{label}</strong>
        <p>Burning soft bloom into the memory...</p>
      </div>
    </motion.div>
  );
}

export const DevelopingOverlay = memo(DevelopingOverlayComponent);
