import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  CassetteTape,
  Menu,
  MessageSquare,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

function HeaderComponent({
  audioOn,
  toggleAudio,
  nextTrack,
  onFeedbackOpen,
  onMenuOpen,
  currentPage = 'capture',
  capturedCount = 0,
  onGoToEditor,
}) {
  const links = currentPage === 'editor'
    ? [
      { label: 'Templates', href: '#templates' },
      { label: 'Editor', href: '#memory-lab' },
      { label: 'Export', href: '#export' },
    ]
    : [
      { label: 'Booth', href: '#booth' },
      { label: 'Templates', href: '#templates' },
    ];

  return (
    <motion.header className="site-header" initial={{ y: -36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 14 }}>
      <a className="brand" href="#top">memorie<span>+</span></a>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {links.map((link) => (
          <a key={link.href} href={link.href}>{link.label}</a>
        ))}
        {currentPage === 'capture' && capturedCount > 0 && (
          <button type="button" className="nav-action-btn" onClick={onGoToEditor}>
            Edit strip
          </button>
        )}
        <button type="button" className="feedback-link-btn" onClick={onFeedbackOpen}>
          <MessageSquare size={14} /> Feedback
        </button>
      </nav>
      <div className="header-actions">
        <div className="audio-controls-group">
          <button type="button" className="pill-button audio-toggle" onClick={toggleAudio} aria-pressed={audioOn}>
            <CassetteTape size={16} />
            <span className="audio-label">{audioOn ? 'Sound On' : 'Sound Off'}</span>
            <Sparkles size={14} />
          </button>
          {audioOn && (
            <button type="button" className="icon-button skip-button" onClick={nextTrack} aria-label="Play next track" title="Next track">
              <RefreshCcw size={16} />
            </button>
          )}
        </div>
        <button type="button" className="icon-button feedback-mobile-btn" onClick={onFeedbackOpen} aria-label="Feedback">
          <MessageSquare size={20} />
        </button>
        <button type="button" className="icon-button menu-btn" onClick={onMenuOpen} aria-label="Open menu"><Menu size={20} /></button>
      </div>
    </motion.header>
  );
}

export const Header = memo(HeaderComponent);
