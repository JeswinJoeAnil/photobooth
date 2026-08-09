import React, { useCallback, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { asset } from '../constants/assets.js';
import { DecoHandles } from './DecoHandles.jsx';

export function DraggableDeco({ deco, setDecorations, isActive, onPointerDown }) {
  const elementRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragControls = useDragControls();

  const handleDrag = useCallback((event, info) => {
    const parent = elementRef.current?.closest('.decorations-layer');
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const dxPct = (info.delta.x / parentRect.width) * 100;
    const dyPct = (info.delta.y / parentRect.height) * 100;
    setDecorations(prev => prev.map(d => d.id === deco.id ? { ...d, x: d.x + dxPct, y: d.y + dyPct } : d));
  }, [deco.id, setDecorations]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('.deco-handle')) return;
    onPointerDown(e);
    dragControls.start(e);
  }, [dragControls, onPointerDown]);

  const style = {
    position: 'absolute',
    top: `${deco.y}%`,
    left: `${deco.x}%`,
    x: '-50%',
    y: '-50%',
    scaleX: deco.scaleX ?? 1,
    scaleY: deco.scaleY ?? 1,
    rotate: deco.rotation,
    zIndex: isActive ? 24 : 12,
    cursor: isDragging ? 'grabbing' : 'grab',
    pointerEvents: 'auto',
    touchAction: 'none',
  };

  const className = `drag-sticker ${isActive ? 'active-deco' : ''} ${deco.isSmall ? 'small' : ''} ${deco.isChrome ? 'chrome' : ''}`;

  if (deco.type === 'text') {
    const bgStyle = deco.showBg !== false ? { background: deco.bgColor || '#ff5aaf', padding: '8px 16px', borderRadius: '99px' } : { background: 'transparent', padding: 0 };
    return (
      <motion.div
        className={className}
        ref={elementRef}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ ...style, color: deco.color, fontFamily: deco.font, boxShadow: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.1)', ...bgStyle }}
        onPointerDown={handlePointerDown}
        whileTap={{ scale: 1.05 }}
        transition={{ type: 'tween', duration: 0 }}
      >
        {deco.content}
        {isActive && <DecoHandles deco={deco} setDecorations={setDecorations} elementRef={elementRef} />}
      </motion.div>
    );
  }
  const bgStyle = deco.showBg !== false ? { background: deco.bgColor || '#ff5aaf', padding: deco.isImage ? '8px' : '8px 16px', borderRadius: deco.isImage ? '12px' : '99px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { background: 'transparent', padding: 0 };
  return (
    <motion.div
      className={className}
      ref={elementRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      style={{ ...style, ...bgStyle, color: deco.showBg !== false ? '#fff' : 'inherit' }}
      onPointerDown={handlePointerDown}
      whileTap={{ scale: (deco.scale ?? 1) * 1.05 }}
      transition={{ type: 'tween', duration: 0 }}
    >
      {deco.isImage ? <img src={asset(deco.content)} alt="" onError={(e) => { e.target.style.display = 'none'; }} style={{ width: 100, display: 'block', pointerEvents: 'none' }} draggable="false" /> : deco.content}
      {isActive && <DecoHandles deco={deco} setDecorations={setDecorations} elementRef={elementRef} />}
    </motion.div>
  );
}
