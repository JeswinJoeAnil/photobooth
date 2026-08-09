import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Camera, Sparkles } from 'lucide-react';
import { ASSETS, BACKGROUNDS, PRELOAD_IMAGE_URLS, assetPhotos, filters, frames, stickers } from './constants/assets.js';
import { generateShuffleDecorations, triggerMagicFlashOnStrip } from './utils/shuffleDecorations.js';
import { getFormattedTimestamp } from './utils/timestamp.js';
import { AmbientLayers } from './components/AmbientLayers.jsx';
import { SiteChrome } from './components/SiteChrome.jsx';
import { Hero } from './components/Hero.jsx';
import { CameraBooth } from './components/CameraBooth.jsx';
import { CameraEditor } from './components/CameraEditor.jsx';
import { TemplateRail } from './components/TemplateRail.jsx';
import { PhotoResult } from './components/PhotoResult.jsx';
import { StripEditor } from './components/StripEditor.jsx';
import { MemoryLab } from './components/MemoryLab.jsx';
import { Footer } from './components/Footer.jsx';

export default function App() {
  const [mode, setMode] = useState(4);
  const [timer, setTimer] = useState(3);
  const [captured, setCaptured] = useState([]);
  const [timestamp, setTimestamp] = useState(getFormattedTimestamp());
  const [fitSettings, setFitSettings] = useState({});
  const [photoScales, setPhotoScales] = useState({});
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const [frame, setFrame] = useState(frames[0]);
  const [audioOn, setAudioOn] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const audioRef = useRef(null);
  const shutterRef = useRef(null);

  const [developing, setDeveloping] = useState(null);
  const [flashOn, setFlashOn] = useState(true);
  const [isBoothOpen, setBoothOpen] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [decorations, setDecorations] = useState([]);
  const [activeDecoId, setActiveDecoId] = useState(null);
  const [doodlePaths, setDoodlePaths] = useState([]);
  const [doodleBrush, setDoodleBrush] = useState({ color: '#ff5aaf', size: 6, shadow: 0 });
  const [accent, setAccent] = useState('#ff5aaf');
  const [stripBackground, setStripBackground] = useState(BACKGROUNDS[0]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [grain, setGrain] = useState(36);
  const [lightLeak, setLightLeak] = useState(28);
  const [vignette, setVignette] = useState(16);
  const [editorTab, setEditorTab] = useState('filters');
  const [stripTab, setStripTab] = useState('text');
  const [mirrorOn, setMirrorOn] = useState(true);
  const [currentPage, setCurrentPage] = useState('capture');
  const [cameraStream, setCameraStream] = useState(null);

  /* Request camera permission immediately on page load */
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        setCameraStream(stream);
      })
      .catch(() => {
        /* Permission denied or no camera — CameraBooth will handle fallback */
      });
    return () => {
      /* Cleanup is handled by CameraBooth when unmounting */
    };
  }, []);

  useEffect(() => {
    PRELOAD_IMAGE_URLS.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    if (audioOn) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [audioOn, trackIndex]);

  useEffect(() => {
    const s = new Audio(ASSETS.shutter);
    s.volume = 0.6;
    shutterRef.current = s;
  }, []);

  const selectedFilter = useMemo(() => ({
    ...activeFilter,
    css: activeFilter.css === 'none' ? '' : `${activeFilter.css} contrast(${1 + grain / 420}) brightness(${1 + lightLeak / 600})`,
  }), [activeFilter, grain, lightLeak]);

  const stripPhotos = useMemo(() => Array.from({ length: mode }, (_, index) => {
    if (captured[index]) return captured[index];
    return assetPhotos[index % assetPhotos.length];
  }), [captured, mode]);

  const nextTrack = useCallback(() => {
    setTrackIndex((prev) => (prev + 1) % ASSETS.playlist.length);
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioOn((v) => !v);
  }, []);

  const playShutter = useCallback(() => {
    if (!audioOn || !shutterRef.current) return;
    const s = shutterRef.current.cloneNode();
    s.volume = 0.6;
    s.play().catch(() => {});
  }, [audioOn]);

  const onStartBooth = useCallback(() => {
    setBoothOpen(true);
    document.querySelector('#booth')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleShuffle = useCallback(() => {
    const randomFrame = frames[Math.floor(Math.random() * frames.length)];
    setFrame(randomFrame);

    const randomFilter = filters[Math.floor(Math.random() * filters.length)];
    setActiveFilter(randomFilter);

    const accents = ['#ff5aaf', '#5ac8ff', '#b45aff', '#5aff8c', '#ffea5a', '#111111'];
    setAccent(accents[Math.floor(Math.random() * accents.length)]);

    setDecorations(generateShuffleDecorations(stickers));
    setActiveDecoId(null);
    triggerMagicFlashOnStrip();
  }, []);

  const prevCapturedLength = useRef(0);
  useEffect(() => {
    const wasGrowing = captured.length > prevCapturedLength.current;
    const isFull = captured.length >= mode && captured.length > 0;
    prevCapturedLength.current = captured.length;

    if (isFull && wasGrowing && currentPage === 'capture') {
      const t = setTimeout(() => {
        setCurrentPage('editor');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 600);
      return () => clearTimeout(t);
    }
  }, [captured.length, mode, currentPage]);

  const goToEditor = useCallback(() => {
    setCurrentPage('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToCapture = useCallback(() => {
    setCurrentPage('capture');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <main>
      <AmbientLayers />
      <SiteChrome
        audioOn={audioOn}
        toggleAudio={toggleAudio}
        nextTrack={nextTrack}
        currentPage={currentPage}
        capturedCount={captured.length}
        onGoToEditor={goToEditor}
      />
      <audio
        ref={audioRef}
        src={ASSETS.playlist[trackIndex]}
        onEnded={nextTrack}
        crossOrigin="anonymous"
      />

      <AnimatePresence mode="wait">
        {currentPage === 'capture' ? (
          <motion.div
            key="capture-page"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          >
            <Hero
              onStart={onStartBooth}
              photos={stripPhotos}
              filter={selectedFilter}
              timestamp={timestamp}
            />
            <section id="booth" className="studio-grid">
              <CameraBooth
                isOpen={isBoothOpen}
                setOpen={setBoothOpen}
                mode={mode}
                setMode={setMode}
                timer={timer}
                setTimer={setTimer}
                activeFilter={selectedFilter}
                captured={captured}
                setCaptured={setCaptured}
                timestamp={timestamp}
                setTimestamp={setTimestamp}
                flashOn={flashOn}
                setFlashOn={setFlashOn}
                mirrorOn={mirrorOn}
                setMirrorOn={setMirrorOn}
                onCapture={playShutter}
                cameraStream={cameraStream}
              />
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
            <TemplateRail frame={frame} setFrame={setFrame} photos={stripPhotos} filter={selectedFilter} accent={accent} />

            {captured.length > 0 && (
              <motion.div
                className="go-to-editor-bar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="editor-bar-inner">
                  <div className="editor-bar-info">
                    <span className="editor-bar-count">{captured.length}/{mode}</span>
                    <span>photos captured</span>
                  </div>
                  <button type="button" className="editor-bar-btn" onClick={goToEditor}>
                    Edit & Download →
                  </button>
                </div>
              </motion.div>
            )}
            <Footer />
          </motion.div>
        ) : (
          <div key="editor-page" className="editor-page">
            <header className="editor-page-header">
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
            </header>

            <div className="editor-split">
              <div className="editor-strip-col">
                <div className="editor-strip-canvas">
                  <PhotoResult
                    frame={frame}
                    photos={stripPhotos}
                    filter={selectedFilter}
                    accent={accent}
                    decorations={decorations}
                    setDecorations={setDecorations}
                    activeDecoId={activeDecoId}
                    setActiveDecoId={setActiveDecoId}
                    doodlePaths={doodlePaths}
                    setDoodlePaths={setDoodlePaths}
                    doodleBrush={doodleBrush}
                    stripTab={stripTab}
                    zoom={zoom}
                    rotation={rotation}
                    vignette={vignette}
                    fitSettings={fitSettings}
                    photoScales={photoScales}
                    setPhotoScales={setPhotoScales}
                    timestamp={timestamp}
                    stripBackground={stripBackground}
                  />
                </div>
              </div>

              <div className="editor-controls-col">
                <div className="editor-controls-card">
                  <button className="magic-btn" onClick={handleShuffle}>
                    <span className="sparkle-icon">✦</span>
                    MAGIC SHUFFLE
                  </button>
                </div>

                <div className="editor-controls-card">
                  <TemplateRail frame={frame} setFrame={setFrame} photos={stripPhotos} filter={selectedFilter} accent={accent} />
                </div>

                <div className="editor-controls-card">
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
                </div>

                <div className="editor-controls-card">
                  <StripEditor
                    decorations={decorations}
                    setDecorations={setDecorations}
                    activeDecoId={activeDecoId}
                    setActiveDecoId={setActiveDecoId}
                    doodlePaths={doodlePaths}
                    setDoodlePaths={setDoodlePaths}
                    doodleBrush={doodleBrush}
                    setDoodleBrush={setDoodleBrush}
                    accentColor={accent}
                    zoom={zoom}
                    setZoom={setZoom}
                    rotation={rotation}
                    setRotation={setRotation}
                    stripTab={stripTab}
                    setStripTab={setStripTab}
                    fitSettings={fitSettings}
                    setFitSettings={setFitSettings}
                    mode={mode}
                    onShuffle={handleShuffle}
                    stripBackground={stripBackground}
                    setStripBackground={setStripBackground}
                  />
                </div>

                <div className="editor-controls-card editor-export-card">
                  <div className="paper-note">All set! <Sparkles size={16} /></div>
                  <p>Export your memory</p>
                  <MemoryLab
                    frame={frame}
                    photos={stripPhotos}
                    filter={selectedFilter}
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
                    accentColor={accent}
                    captured={captured}
                    fitSettings={fitSettings}
                    setFitSettings={setFitSettings}
                    photoScales={photoScales}
                    setPhotoScales={setPhotoScales}
                    timestamp={timestamp}
                    mode={mode}
                    onShuffle={handleShuffle}
                    resultImage={resultImage}
                    setResultImage={setResultImage}
                    stripBackground={stripBackground}
                    exportOnly
                  />
                </div>
              </div>
            </div>

            <Footer />
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
