import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

export function FeedbackOverlay({ onClose, ownerEmail }) {
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState('');
  const [hp, setHp] = useState('');
  const closeButtonRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = cardRef.current?.querySelectorAll(
          'button, [href], input:not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!msg.trim() || hp) return; /* honeypot filled = bot */

    setStatus('sending');

    try {
      const response = await fetch('https://formspree.io/f/mpqbybgq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: msg,
          _subject: 'New Feedback from Memory Lab',
          email: 'feedback-bot@memorie.lab',
        }),
      });

      if (response.ok) {
        setStatus('success');
        setTimeout(onClose, 2500);
      } else {
        throw new Error('Failed to send');
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <motion.div className="feedback-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="feedback-backdrop" onClick={onClose} role="presentation" />
      <motion.div
        ref={cardRef}
        className="feedback-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        aria-describedby="feedback-description"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
      >
        <button type="button" className="close-feedback" onClick={onClose} aria-label="Close feedback form" ref={closeButtonRef}>&times;</button>

        {status === 'success' ? (
          <div className="feedback-success">
            <div className="success-icon">✦</div>
            <h3>Feedback Sent!</h3>
            <p>Thanks for your feedback!</p>
          </div>
        ) : (
          <>
            <div className="feedback-header">
              <MessageSquare size={24} />
              <h2 id="feedback-title">Share Your Thoughts</h2>
            </div>
            <p id="feedback-description">Your feedback helps us make the <strong>Memory Lab</strong> even better.</p>

            <form onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="feedback-message">Feedback message</label>
              <textarea
                id="feedback-message"
                placeholder="Type your feedback here..."
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                disabled={status === 'sending'}
              />
              {/* Honeypot — hidden from humans, catches bots (Formspree `_gotcha`) */}
              <div
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
              >
                <label htmlFor="feedback-hp">Leave this field empty</label>
                <input
                  id="feedback-hp"
                  type="text"
                  name="_gotcha"
                  tabIndex={-1}
                  autoComplete="off"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                />
              </div>
              {status === 'error' && (
                <p className="form-status" role="alert">Something went wrong. Please try again.</p>
              )}
              <button type="submit" className="submit-btn" disabled={status === 'sending' || !msg.trim()}>
                {status === 'sending' ? 'Sending...' : 'Send Feedback'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
