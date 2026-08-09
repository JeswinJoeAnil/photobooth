import React, { memo, useCallback, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { DecoHandles } from './DecoHandles.jsx';

function DraggablePhotoComponent({ 
  photo, 
  filter, 
  index, 
  zoom, 
  rotation, 
  fitMode, 
  scale = { x: 1, y: 1 }, 
  onScale, 
  isActive, 
  onPointerDown 
}) {
  const elementRef = useRef(null);
  const dragControls = useDragControls();

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('.deco-handle')) return;
    onPointerDown(e);
    dragControls.start(e);
  }, [dragControls, onPointerDown]);
  
  return (
    <motion.div
      ref={elementRef}
      className={`photo-slot ${isActive ? 'active-deco' : ''}`}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onPointerDown={handlePointerDown}
      whileDrag={{ scale: 1.035, zIndex: 5 }}
      whileHover={{ outline: '2px dashed var(--accent)', outlineOffset: '2px' }}
      style={{
        rotate: rotation + (index % 2 ? 1.5 : -1.2),
        scaleX: scale.x,
        scaleY: scale.y,
        zIndex: isActive ? 10 : 1,
        cursor: 'grab',
        borderRadius: '4px',
      }}
    >
      <img
        src={photo}
        style={{
          filter: filter.css,
          transform: `scale(${zoom})`,
          objectFit: fitMode === 'contain' ? 'contain' : 'cover',
          background: '#000',
          pointerEvents: 'none'
        }}
        alt={`Photo ${index + 1} in the strip`}
      />
      <span>{String(index + 1).padStart(2, '0')}</span>
      {isActive && (
        <DecoHandles
          deco={{ id: `photo-${index}`, scaleX: scale.x, scaleY: scale.y, rotation: 0 }}
          setDecorations={(updater) => {
            // Mock deco array update for photo scaling
            const mockPrev = [{ id: `photo-${index}`, scaleX: scale.x, scaleY: scale.y, rotation: 0 }];
            const result = typeof updater === 'function' ? updater(mockPrev) : updater;
            const updated = result.find(d => d.id === `photo-${index}`);
            if (updated) onScale?.({ x: updated.scaleX, y: updated.scaleY });
          }}
          elementRef={elementRef}
          hideDelete
        />
      )}
    </motion.div>
  );
}

export const DraggablePhoto = memo(DraggablePhotoComponent);
