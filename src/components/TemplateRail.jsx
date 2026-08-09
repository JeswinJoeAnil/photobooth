import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { frames } from '../constants/assets.js';

const MiniTemplate = memo(function MiniTemplateComponent({ frame, photos, filter, accent }) {
  return (
    <div className={`mini-template frame-${frame.id}`} style={{ '--accent': accent }}>
      {photos.slice(0, frame.id === 'magazine' ? 3 : 4).map((photo, index) => (
        <img key={index} src={photo} style={{ filter: filter.css }} alt="" aria-hidden="true" />
      ))}
      <span>{frame.name}</span>
    </div>
  );
});

function TemplateRailComponent({ frame, setFrame, photos, filter, accent, compact = false }) {
  return (
    <section id="templates" className={`template-section ${compact ? 'template-section-compact' : ''}`}>
      {!compact && (
        <div className="section-heading">
          <div className="section-title"><Sparkles size={18} /><span>Choose Your Vibe</span></div>
        </div>
      )}
      <div className="template-rail" aria-label="Template choices">
        {frames.map((item, index) => (
          <motion.button
            key={item.id}
            type="button"
            className={`template-card ${frame.id === item.id ? 'active' : ''}`}
            onClick={() => setFrame(item)}
            aria-pressed={frame.id === item.id}
            aria-label={`Use ${item.name} template`}
            whileHover={{ y: -8, rotate: index % 2 ? 1.4 : -1.4 }}
            whileTap={{ scale: 0.98 }}
          >
            <MiniTemplate frame={item} photos={photos} filter={filter} accent={accent} />
            <span>{item.name}</span>
          </motion.button>
        ))}
      </div>
    </section>
  );
}

export const TemplateRail = memo(TemplateRailComponent);
