import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Sparkles,
} from 'lucide-react';
import { CameraEditor } from './CameraEditor.jsx';
import { TemplateRail } from './TemplateRail.jsx';
import { MemoryLab } from './MemoryLab.jsx';
import { Footer } from './Footer.jsx';

function EditorPageComponent(props) {
  const {
    goToCapture,
    frame,
    setFrame,
    photos,
    filter,
    activeFilter,
    setActiveFilter,
    accent,
    decorations,
    setDecorations,
    activeDecoId,
    setActiveDecoId,
    doodlePaths,
    setDoodlePaths,
    doodleBrush,
    setDoodleBrush,
    developing,
    setDeveloping,
    zoom,
    setZoom,
    rotation,
    setRotation,
    vignette,
    stripTab,
    setStripTab,
    accentColor,
    captured,
    fitSettings,
    setFitSettings,
    photoScales,
    setPhotoScales,
    timestamp,
    mode,
    onShuffle,
    grain,
    setGrain,
    lightLeak,
    setLightLeak,
    editorTab,
    setEditorTab,
    stripBackground,
    setStripBackground,
  } = props;

  return (
    <div className="editor-page">
      {/* ── Editor page header ── */}
      <motion.header
        className="editor-page-header"
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 100, damping: 16 }}
      >
        <button type="button" className="back-to-booth-btn" onClick={goToCapture}>
          <ArrowLeft size={18} />
          <span>Back to Booth</span>
        </button>
        <div className="editor-page-title">
          <Sparkles size={16} />
          <span>Edit & Download</span>
        </div>
        <button type="button" className="retake-btn" onClick={goToCapture}>
          <Camera size={16} />
          <span>Retake</span>
        </button>
      </motion.header>

      {/* ── Template selection rail ── */}
      <TemplateRail
        frame={frame}
        setFrame={setFrame}
        photos={photos}
        filter={filter}
        accent={accent}
      />

      {/* ── Filter / Adjust controls ── */}
      <section className="editor-page-filters">
        <CameraEditor
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          grain={grain}
          setGrain={setGrain}
          lightLeak={lightLeak}
          setLightLeak={setLightLeak}
          vignette={vignette}
          setVignette={setVignette}
          editorTab={editorTab}
          setEditorTab={setEditorTab}
        />
      </section>

      {/* ── Main editing area: strip preview + stickers/text/doodle + export ── */}
      <section id="memory" className="memory-lab-section">
        <MemoryLab
          frame={frame}
          photos={photos}
          filter={filter}
          accent={accent}
          decorations={decorations}
          setDecorations={setDecorations}
          activeDecoId={activeDecoId}
          setActiveDecoId={setActiveDecoId}
          doodlePaths={doodlePaths}
          setDoodlePaths={setDoodlePaths}
          doodleBrush={doodleBrush}
          setDoodleBrush={setDoodleBrush}
          developing={developing}
          setDeveloping={setDeveloping}
          zoom={zoom}
          setZoom={setZoom}
          rotation={rotation}
          setRotation={setRotation}
          vignette={vignette}
          stripTab={stripTab}
          setStripTab={setStripTab}
          accentColor={accentColor}
          captured={captured}
          fitSettings={fitSettings}
          setFitSettings={setFitSettings}
          photoScales={photoScales}
          setPhotoScales={setPhotoScales}
          timestamp={timestamp}
          mode={mode}
          onShuffle={onShuffle}
          stripBackground={stripBackground}
          setStripBackground={setStripBackground}
        />
      </section>
      <Footer />
    </div>
  );
}

export const EditorPage = memo(EditorPageComponent);
