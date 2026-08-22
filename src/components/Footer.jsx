import React, { memo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { asset } from '../constants/assets.js';

function FooterComponent() {
  const [email, setEmail] = useState('');
  const [submitStatus, setSubmitStatus] = useState('');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setSubmitStatus('Please enter a valid email.');
      setTimeout(() => setSubmitStatus(''), 3000);
      return;
    }
    setSubmitStatus('Thanks! You\'re on the list.');
    setEmail('');
    setTimeout(() => setSubmitStatus(''), 3000);
  }, [email]);

  return (
    <footer className="site-footer">

      <img src={asset('sticker2_34.png')} alt="" className="f-sticker corner-l" />
      <img src={asset('stickers3_35.png')} alt="" className="f-sticker corner-r" />

      <div className="footer-marquee">
        <div className="marquee-content">
          <span>✦ CAPTURE THE CHAOS ✦ NOSTALGIA FOREVER ✦ PRINT YOUR VIBE ✦ Y2K AESTHETIC </span>
          <span>✦ CAPTURE THE CHAOS ✦ NOSTALGIA FOREVER ✦ PRINT YOUR VIBE ✦ Y2K AESTHETIC </span>
        </div>
      </div>

      <div className="footer-left" style={{ position: 'relative', zIndex: 2 }} />

      <div className="footer-center" style={{ position: 'relative', zIndex: 2, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transform: 'rotate(-3deg)', pointerEvents: 'none' }}>
          <span className="f-typo">Sweetest Memories</span>
          <span className="f-tagline">keeping moments a little longer, one flash at a time ✦</span>
        </div>
      </div>

      <form style={{ position: 'relative', zIndex: 2 }} onSubmit={handleSubmit}>
        <label htmlFor="email">Stay in the loop</label>
        <div>
          <input
            id="email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Join</button>
        </div>
        {submitStatus && <span className="footer-form-status" role="status">{submitStatus}</span>}
      </form>

      <p className="footer-copyright">© 2026 Jeswin Joe Anil</p>
    </footer>
  );
}

export const Footer = memo(FooterComponent);
