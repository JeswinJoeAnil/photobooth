import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { DraggableDeco } from './DraggableDeco.jsx';
import { DraggablePhoto } from './DraggablePhoto.jsx';
import { DoodleCanvas } from './DoodleCanvas.jsx';

function PhotoResultComponent({
  frame,
  photos,
  filter,
  accent,
  decorations,
  setDecorations,
  activeDecoId,
  setActiveDecoId,
  doodlePaths,
  setDoodlePaths,
  doodleBrush,
  stripTab,
  zoom,
  rotation,
  vignette,
  fitSettings,
  timestamp,
  photoScales,
  setPhotoScales,
  stripBackground,
}) {
  const wrapperRef = useRef(null);
  const stripRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [marginBottomVal, setMarginBottomVal] = useState(0);

  useEffect(() => {
    if (!wrapperRef.current || !stripRef.current) return;
    const compute = () => {
      const wW = wrapperRef.current.clientWidth > 0 ? wrapperRef.current.clientWidth - 32 : 340;
      const rawH = wrapperRef.current.clientHeight;
      const wH = (rawH > 100 ? rawH : 550) - 32;
      const sW = stripRef.current.offsetWidth || 380;
      const sH = stripRef.current.offsetHeight || 800;
      if (!sW || !sH || wW <= 0) return;
      const s = Math.min(wW / sW, wH / sH, 1);
      const safeScale = Math.max(s, 0.42);
      setScale(safeScale);
      setMarginBottomVal(safeScale < 1 ? -(stripRef.current.offsetHeight * (1 - safeScale)) : 0);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrapperRef.current);
    ro.observe(stripRef.current);
    return () => ro.disconnect();
  }, [photos.length, frame.id]);

  const onStripBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) setActiveDecoId(null);
  }, [setActiveDecoId]);

  const onPhotoSlotsClick = useCallback(() => {
    setActiveDecoId(null);
  }, [setActiveDecoId]);

  const makeDecoActivate = useCallback((id) => () => setActiveDecoId(id), [setActiveDecoId]);

  return (
    <div ref={wrapperRef} className="strip-scale-wrapper">
      <div
        ref={stripRef}
        className={`photo-result frame-${frame.id}`}
        role="img"
        aria-label={`Photo strip preview using the ${frame.name} template with ${photos.length} photos`}
        style={{
          '--accent': accent,
          '--vignette': `${vignette / 100}`,
          background: stripBackground?.type === 'gradient'
            ? `linear-gradient(180deg, ${stripBackground.from}, ${stripBackground.to})`
            : (stripBackground?.value || ''),
          transform: `scale(${scale}) rotate(-1.5deg)`,
          transformOrigin: 'top center',
          marginBottom: `${marginBottomVal}px`,
        }}
        onClick={onStripBackdropClick}
      >
        <div className="result-meta">{timestamp.time} / {timestamp.date}</div>
           {photos.map((photo, index) => (
            <DraggablePhoto 
              key={`photo-${index}`} 
              photo={photo} 
              filter={filter} 
              index={index} 
              zoom={zoom} 
              rotation={rotation} 
              fitMode={fitSettings?.[index]} 
              scale={photoScales?.[index] || { x: 1, y: 1 }}
              onScale={(newScale) => setPhotoScales?.(prev => ({ ...prev, [index]: newScale }))}
              isActive={activeDecoId === `photo-${index}`}
              onPointerDown={() => setActiveDecoId?.(`photo-${index}`)}
            />
          ))}

        <DoodleCanvas stripTab={stripTab} doodlePaths={doodlePaths} setDoodlePaths={setDoodlePaths} doodleBrush={doodleBrush} />

        <div className="decorations-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}>
          {decorations.map(deco => (
            <DraggableDeco key={`${deco.id}-${deco.dragKey || 0}`} deco={deco} setDecorations={setDecorations} isActive={activeDecoId === deco.id} onPointerDown={makeDecoActivate(deco.id)} />
          ))}
        </div>
        <div className="tape tape-a" />
        <div className="tape tape-b" />
        <div className="result-doodles">✧ ⋆ ˚｡⋆୨୧˚</div>
      </div>
    </div>
  );
}

export const PhotoResult = memo(PhotoResultComponent);
