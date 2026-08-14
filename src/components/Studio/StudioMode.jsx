import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStudioRoom } from '../../hooks/useStudioRoom.js';
import { StudioEntry } from './StudioEntry.jsx';
import { StudioLobby } from './StudioLobby.jsx';
import { StudioRoom } from './StudioRoom.jsx';

/**
 * StudioMode — Top-level orchestrator for the multiplayer Studio feature.
 */
function StudioModeComponent({ isOpen, onClose, onCaptureComplete }) {
  const [phase, setPhase] = useState('entry');
  const [permissionError, setPermissionError] = useState('');
  const localStreamRef = useRef(null);

  const studio = useStudioRoom();

  const requestMedia = useCallback(async () => {
    setPermissionError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.warn('Camera permission denied:', err);
      setPermissionError(
        'Camera permission is required for Studio Mode. Please allow camera access and try again.'
      );
      return null;
    }
  }, []);

  const handleCreateRoom = useCallback(
    async (name) => {
      setPhase('permission');
      const stream = await requestMedia();
      if (!stream) {
        setPhase('entry');
        return;
      }
      studio.setDisplayName(name);
      const code = await studio.createRoom(stream, name);
      if (code) {
        setPhase('lobby');
      } else {
        setPhase('entry');
      }
    },
    [requestMedia, studio]
  );

  const handleJoinRoom = useCallback(
    async (code, name) => {
      setPhase('permission');
      const stream = await requestMedia();
      if (!stream) {
        setPhase('entry');
        return;
      }
      setPhase('connecting');
      studio.setDisplayName(name);
      const success = await studio.joinRoom(code, stream, name);
      if (success) {
        setPhase('room');
      } else {
        setPhase('entry');
      }
    },
    [requestMedia, studio]
  );

  const handleEnterStudio = useCallback(() => {
    setPhase('room');
  }, []);

  const handleLeave = useCallback(() => {
    studio.leaveRoom();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setPhase('entry');
  }, [studio]);

  const handleClose = useCallback(() => {
    handleLeave();
    onClose();
  }, [handleLeave, onClose]);

  const handleCaptureComplete = useCallback(
    (photos, shotCount) => {
      studio.leaveRoom();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      setPhase('entry');
      onCaptureComplete(photos, shotCount);
    },
    [studio, onCaptureComplete]
  );

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const selfMember = studio.roomState?.members?.find((m) => m.peerId === studio.selfPeerId);

  if (!isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      {phase === 'entry' && (
        <StudioEntry
          key="studio-entry"
          isOpen
          onClose={handleClose}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}

      {phase === 'permission' && (
        <motion.div
          key="studio-permission"
          className="studio-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="studio-overlay-backdrop" />
          <motion.div
            className="studio-modal studio-permission-modal"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
          >
            <div className="studio-permission-content">
              {permissionError ? (
                <>
                  <p className="studio-permission-error">{permissionError}</p>
                  <button type="button" className="studio-join-btn" onClick={() => setPhase('entry')}>
                    Go Back
                  </button>
                </>
              ) : (
                <>
                  <motion.div
                    className="studio-loading-spinner"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="studio-permission-text">Preparing your camera...</p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {phase === 'connecting' && (
        <motion.div
          key="studio-connecting"
          className="studio-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="studio-overlay-backdrop" />
          <motion.div
            className="studio-modal studio-permission-modal"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
          >
            <div className="studio-permission-content">
              {studio.errorMessage ? (
                <>
                  <p className="studio-permission-error">{studio.errorMessage}</p>
                  <button
                    type="button"
                    className="studio-join-btn"
                    onClick={() => {
                      studio.leaveRoom();
                      setPhase('entry');
                    }}
                  >
                    Go Back
                  </button>
                </>
              ) : (
                <>
                  <motion.div
                    className="studio-loading-spinner"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="studio-permission-text">Finding your studio...</p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {phase === 'lobby' && (
        <motion.div
          key="studio-lobby"
          className="studio-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <StudioLobby
            roomCode={studio.roomCode}
            roomState={studio.roomState}
            participants={studio.participants}
            localStream={studio.localStream}
            displayName={studio.displayName}
            selfPeerId={studio.selfPeerId}
            onEnterStudio={handleEnterStudio}
            onLeave={handleClose}
            mirrorOn={selfMember?.mirror ?? true}
          />
        </motion.div>
      )}

      {phase === 'room' && (
        <motion.div
          key="studio-room"
          className="studio-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <StudioRoom
            isHost={studio.isHost}
            roomCode={studio.roomCode}
            roomState={studio.roomState}
            selfPeerId={studio.selfPeerId}
            participants={studio.participants}
            localStream={studio.localStream}
            displayName={studio.displayName}
            broadcast={studio.broadcast}
            onData={studio.onData}
            onLeave={handleClose}
            onCaptureComplete={handleCaptureComplete}
            updateSelfParticipant={studio.updateSelfParticipant}
            updateHostSettings={studio.updateHostSettings}
            getStreamForPeer={studio.getStreamForPeer}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const StudioMode = memo(StudioModeComponent);
