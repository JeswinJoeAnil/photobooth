import React, { useRef, useState } from 'react';

export function DoodleCanvas({ stripTab, doodlePaths, setDoodlePaths, doodleBrush, previewWidth = 900 }) {
  const [currentPath, setCurrentPath] = useState(null);
  const containerRef = useRef(null);

  const handlePointerDown = (e) => {
    if (stripTab !== 'doodle') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = previewWidth / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    setCurrentPath({ points: [{ x, y }], ...doodleBrush });
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (stripTab !== 'doodle' || !currentPath) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = previewWidth / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    setCurrentPath(prev => ({ ...prev, points: [...prev.points, { x, y }] }));
  };

  const handlePointerUp = (e) => {
    if (!currentPath) return;
    setDoodlePaths(prev => [...prev, currentPath]);
    setCurrentPath(null);
    e.target.releasePointerCapture(e.pointerId);
  };

  const viewHeight = containerRef.current ? (containerRef.current.offsetHeight * (previewWidth / containerRef.current.offsetWidth)) : previewWidth * 2;

  return (
    <div
      ref={containerRef}
      className={`doodle-overlay ${stripTab === 'doodle' ? 'active' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        /* Below stickers when not doodling so PNG/text decos stay visible; above when drawing */
        zIndex: stripTab === 'doodle' ? 26 : 4,
        pointerEvents: stripTab === 'doodle' ? 'auto' : 'none',
        touchAction: 'none',
        cursor: stripTab === 'doodle' ? 'var(--cursor-crosshair)' : 'inherit',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${previewWidth} ${viewHeight}`} style={{ overflow: 'visible' }}>
        {doodlePaths.map((path, i) => (
          <polyline key={i} points={path.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={path.color} strokeWidth={path.size} strokeLinecap="round" strokeLinejoin="round" filter={path.shadow ? `drop-shadow(0px 0px ${path.shadow}px ${path.color})` : 'none'} />
        ))}
        {currentPath && (
          <polyline points={currentPath.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={currentPath.color} strokeWidth={currentPath.size} strokeLinecap="round" strokeLinejoin="round" filter={currentPath.shadow ? `drop-shadow(0px 0px ${currentPath.shadow}px ${currentPath.color})` : 'none'} />
        )}
      </svg>
    </div>
  );
}
