import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Image as ImageIcon,
  Layout,
  MousePointer2,
  Sparkles,
  Sticker,
  Type,
  Wand2,
} from 'lucide-react';
import { asset, stickerCategories, BACKGROUNDS } from '../constants/assets.js';
import { Slider } from './Slider.jsx';

function StripEditorComponent(props) {
  const {
    decorations,
    setDecorations,
    activeDecoId,
    setActiveDecoId,
    doodlePaths,
    setDoodlePaths,
    doodleBrush,
    setDoodleBrush,
    accentColor,
    zoom,
    setZoom,
    rotation,
    setRotation,
    stripTab,
    setStripTab,
    fitSettings,
    setFitSettings,
  mode,
  onShuffle,
  onUndoShuffle,
  canUndoShuffle,
  stripBackground,
  setStripBackground,
} = props;

  const tabs = [
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'stickers', icon: Sticker, label: 'Stickers' },
    { id: 'doodle', icon: MousePointer2, label: 'Doodle' },
    { id: 'bg', icon: ImageIcon, label: 'Background' },
    { id: 'layout', icon: Layout, label: 'Layout' },
  ];

  const activeDeco = decorations.find(d => d.id === activeDecoId);

  const handleAddText = useCallback(() => {
    const newId = Date.now().toString();
    setDecorations([...decorations, { id: newId, type: 'text', content: 'New Text', x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1, font: 'Inter', color: '#ffffff', bgColor: 'transparent', showBg: false }]);
    setActiveDecoId(newId);
  }, [decorations, setActiveDecoId, setDecorations]);

  const handleAddSticker = useCallback((stickerContent) => {
    const newId = Date.now().toString();
    const isImg = stickerContent.endsWith('.png');
    const randomBg = ['#ff5aaf', '#00ffcc', '#ffcc00', '#cc00ff', '#111111', '#ff4444', '#44aaff'][Math.floor(Math.random() * 7)];
    setDecorations([...decorations, { id: newId, type: 'sticker', content: stickerContent, isImage: isImg, x: 50, y: 50, rotation: 0, scale: 1, scaleX: 1, scaleY: 1, bgColor: randomBg, showBg: !isImg }]);
    setActiveDecoId(newId);
  }, [decorations, setActiveDecoId, setDecorations]);

  const updateActiveDeco = useCallback((updates) => {
    if (!activeDecoId) return;
    setDecorations(prev => prev.map(d => d.id === activeDecoId ? { ...d, ...updates } : d));
  }, [activeDecoId, setDecorations]);

  const clearDecorations = useCallback(() => {
    setDecorations([]);
    setActiveDecoId(null);
  }, [setActiveDecoId, setDecorations]);

  const deleteActiveDeco = useCallback(() => {
    setDecorations(decorations.filter(d => d.id !== activeDecoId));
    setActiveDecoId(null);
  }, [activeDecoId, decorations, setActiveDecoId, setDecorations]);

  const deselectDeco = useCallback(() => setActiveDecoId(null), [setActiveDecoId]);

  const setCoverForSlot = useCallback((i) => {
    setFitSettings(prev => ({ ...prev, [i]: 'cover' }));
  }, [setFitSettings]);

  const setContainForSlot = useCallback((i) => {
    setFitSettings(prev => ({ ...prev, [i]: 'contain' }));
  }, [setFitSettings]);

  return (
    <div className="strip-editor">
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onShuffle ? (
            <button type="button" className="strip-shuffle-wand" onClick={onShuffle} aria-label="Magic shuffle" title="Magic shuffle">
              <Wand2 size={18} />
            </button>
          ) : (
            <Wand2 size={18} />
          )}
          <span>Edit Your Strip</span>
          {canUndoShuffle && onUndoShuffle && (
            <button type="button" className="strip-undo-btn" onClick={onUndoShuffle} aria-label="Undo shuffle" title="Undo shuffle">
              ↩ Undo
            </button>
          )}
        </div>
        {decorations.length > 0 && (
          <button
            type="button"
            onClick={clearDecorations}
            style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
          >
            Clear Elements
          </button>
        )}
      </div>
      <div className="tool-tabs" role="tablist" aria-label="Strip editing tools">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={stripTab === tab.id}
            className={stripTab === tab.id ? 'active' : ''}
            onClick={() => setStripTab(tab.id)}
          >
            <tab.icon size={20} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="editor-tab-content">
        {stripTab === 'text' && (
          <div className="text-row">
            {activeDeco && activeDeco.type === 'text' ? (
              <div className="text-controls" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <label><span>Caption</span><input value={activeDeco.content} onChange={(e) => updateActiveDeco({ content: e.target.value })} placeholder="Lovely day..." /></label>
                <div className="text-options" style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ flex: 1 }}><span>Font</span>
                    <select value={activeDeco.font} onChange={(e) => updateActiveDeco({ font: e.target.value })} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--muted)', background: 'transparent' }}>
                      <option value="Pacifico">Pacifico (Cute Script)</option>
                      <option value="Caveat">Caveat (Handwritten)</option>
                      <option value="Indie Flower">Indie Flower</option>
                      <option value="Gloria Hallelujah">Gloria (Playful)</option>
                      <option value="Patrick Hand">Patrick Hand</option>
                      <option value="Amatic SC">Amatic (Tall)</option>
                      <option value="Shadows Into Light">Shadows</option>
                      <option value="Satisfy">Satisfy (Elegant)</option>
                      <option value="Gochi Hand">Gochi (Sweet)</option>
                      <option value="Handlee">Handlee</option>
                      <option value="Coming Soon">Coming Soon</option>
                      <option value="Permanent Marker">Marker</option>
                      <option value="Inter">Classic Inter</option>

                    </select>
                  </label>
                  <label><span>Color</span><input type="color" value={activeDeco.color} onChange={(e) => updateActiveDeco({ color: e.target.value })} /></label>
                </div>
              </div>
            ) : (
              <button type="button" className="pill-button add-text-btn" onClick={handleAddText} style={{ width: '100%' }}>Add caption</button>
            )}
          </div>
        )}
        {stripTab === 'stickers' && (
          <div className="sticker-panel">
            <p className="panel-hint">Click a sticker to add it to your strip</p>
            <div className="sticker-category-list">
              {stickerCategories.map((category) => (
                <section className="sticker-category" key={category.id} aria-labelledby={`sticker-category-${category.id}`}>
                  <div className="sticker-category-heading">
                    <h3 id={`sticker-category-${category.id}`}>{category.name}</h3>
                    <span>{category.vibe}</span>
                  </div>
                  <div className="sticker-grid">
                    {category.items.map((s) => (
                      <button key={`${category.id}-${s}`} type="button" className={`sticker-chip ${s.endsWith('.png') ? 'image-sticker-chip' : ''}`} onClick={() => handleAddSticker(s)} aria-label={`Add ${s.endsWith('.png') ? 'image sticker' : s}`}>
                        {s.endsWith('.png') ? <img src={asset(s)} alt="" aria-hidden="true" /> : s}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        {stripTab === 'doodle' && (
          <div className="doodle-panel">
            <p className="panel-hint">Pick a brush and draw directly on the strip</p>
            <div className="sticker-grid">
              <button type="button" className={`sticker-chip ${doodleBrush?.color === '#ff5aaf' ? 'active' : ''}`} onClick={() => setDoodleBrush?.({ color: '#ff5aaf', size: 6, shadow: 0 })}>Pink</button>
              <button type="button" className={`sticker-chip ${doodleBrush?.color === '#00ffcc' ? 'active' : ''}`} onClick={() => setDoodleBrush?.({ color: '#00ffcc', size: 4, shadow: 8 })}>Neon Glow</button>
              <button type="button" className={`sticker-chip ${doodleBrush?.color === '#ffffff' ? 'active' : ''}`} onClick={() => setDoodleBrush?.({ color: '#ffffff', size: 3, shadow: 0 })}>White Pen</button>
              <button type="button" className={`sticker-chip ${doodleBrush?.color === '#000000' ? 'active' : ''}`} onClick={() => setDoodleBrush?.({ color: '#000000', size: 8, shadow: 0 })}>Black Marker</button>
              <button type="button" className="sticker-chip" onClick={() => setDoodlePaths?.([])}>Clear All</button>
            </div>
          </div>
        )}
        {(stripTab === 'text' || stripTab === 'stickers' || stripTab === 'doodle') && (
          <div className="slider-list">
            {activeDeco ? (
              <>
                <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: 'var(--muted)' }}>
                  <span>Adjusting Selected {activeDeco.type}</span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" onClick={deleteActiveDeco} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                    <button type="button" onClick={deselectDeco} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Deselect</button>
                  </div>
                </div>
                <Slider label="Size" value={Math.round((activeDeco.scaleX || 1) * 100)} setValue={(v) => updateActiveDeco({ scaleX: v / 100, scaleY: v / 100 })} min={10} max={300} />
                <Slider label="Rotate" value={activeDeco.rotation} setValue={(v) => updateActiveDeco({ rotation: v })} min={-180} max={180} />
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--fg)' }}>
                    <input type="checkbox" checked={activeDeco.showBg !== false} onChange={(e) => updateActiveDeco({ showBg: e.target.checked })} />
                    Background
                  </label>
                  {activeDeco.showBg !== false && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--fg)' }}>
                      Color: <input type="color" value={activeDeco.bgColor || '#ff5aaf'} onChange={(e) => updateActiveDeco({ bgColor: e.target.value })} style={{ width: '24px', height: '24px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                    </label>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="slider-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: 'var(--muted)' }}><span>Adjusting Photos</span></div>
                <Slider label="Zoom" value={Math.round(zoom * 100)} setValue={(v) => setZoom(v / 100)} min={50} max={200} />
                <Slider label="Rotate" value={rotation} setValue={setRotation} min={-45} max={45} />
              </>
            )}
          </div>
        )}

        {stripTab === 'bg' && (
          <div className="bg-picker">
            <p className="panel-hint">Choose a background for your photostrip</p>
            <div className="bg-grid">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  className={`bg-swatch ${stripBackground?.id === bg.id ? 'active' : ''}`}
                  onClick={() => setStripBackground?.(bg)}
                  aria-pressed={stripBackground?.id === bg.id}
                  aria-label={`Use ${bg.label} background`}
                  title={bg.label}
                  style={{
                    background: bg.type === 'solid' ? bg.value : `linear-gradient(135deg, ${bg.from}, ${bg.to})`,
                  }}
                >
                  <span className="bg-label">{bg.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {stripTab === 'layout' && (
          <motion.div className="layout-editor" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <p className="panel-hint" style={{ marginBottom: '16px' }}>
              Choose how your photos fill the slots. &quot;Uncrop&quot; to show the full image if it doesn&apos;t fit the frame.
            </p>
            <div className="layout-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Array.from({ length: mode }).map((_, i) => (
                <div key={i} className="layout-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '12px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>Slot {i + 1}</span>
                  <div className="toggle-group" style={{ display: 'flex', gap: '4px', background: '#eee', padding: '3px', borderRadius: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setCoverForSlot(i)}
                      aria-pressed={!fitSettings[i] || fitSettings[i] === 'cover'}
                      style={{
                        padding: '6px 10px', borderRadius: '6px', border: 0, fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        background: (!fitSettings[i] || fitSettings[i] === 'cover') ? '#fff' : 'transparent',
                        boxShadow: (!fitSettings[i] || fitSettings[i] === 'cover') ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      Crop to Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => setContainForSlot(i)}
                      aria-pressed={fitSettings[i] === 'contain'}
                      style={{
                        padding: '6px 10px', borderRadius: '6px', border: 0, fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        background: fitSettings[i] === 'contain' ? '#fff' : 'transparent',
                        boxShadow: fitSettings[i] === 'contain' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      Uncrop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export const StripEditor = memo(StripEditorComponent);
