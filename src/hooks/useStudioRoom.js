import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { generateRoomCode } from '../utils/roomCode.js';

/**
 * useStudioRoom — WebRTC P2P room manager using PeerJS.
 *
 * Handles:
 * - Room creation (host) with short room code
 * - Room joining (guest) via room code
 * - Stream sharing between participants
 * - Data channel for synchronized events (countdown, background changes, etc.)
 * - Participant presence tracking
 * - Host authority
 * - Graceful disconnection & cleanup
 */

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};

/* Hard cap on simultaneous remote participants (matches PARTICIPANT_LAYOUTS[4]) */
const MAX_PARTICIPANTS = 4;

export function useStudioRoom() {
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [connectionState, setConnectionState] = useState('idle'); /* idle | creating | waiting | connecting | connected | error */
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const peerRef = useRef(null);
  const connectionsRef = useRef(new Map()); /* peerId -> { mediaConn, dataConn, stream, name } */
  const localStreamRef = useRef(null);
  const roomCodeRef = useRef(null);
  const dataHandlersRef = useRef([]);
  const connectToPeerRef = useRef(null);
  const isHostRef = useRef(false);

  /**
   * Registers a handler for data channel messages.
   */
  const onData = useCallback((handler) => {
    dataHandlersRef.current.push(handler);
    return () => {
      dataHandlersRef.current = dataHandlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  /**
   * Broadcasts a message to all connected peers via data channels.
   */
  const broadcast = useCallback((message) => {
    connectionsRef.current.forEach(({ dataConn }) => {
      if (dataConn?.open) {
        try {
          dataConn.send(message);
        } catch {
          /* Connection may have closed */
        }
      }
    });
  }, []);

  const sendPeerList = useCallback((targetConn = null) => {
    const peers = Array.from(connectionsRef.current.entries()).map(([peerId, entry]) => ({
      peerId,
      name: entry.name || 'Guest',
    }));
    const message = { type: 'PEER_LIST', peers };

    if (targetConn) {
      if (targetConn.open) {
        try { targetConn.send(message); } catch { /* Connection may have closed */ }
      }
      return;
    }

    connectionsRef.current.forEach(({ dataConn }) => {
      if (dataConn?.open) {
        try { dataConn.send(message); } catch { /* Connection may have closed */ }
      }
    });
  }, []);

  /* Internal: Handle incoming data from a peer */
  const handlePeerData = useCallback((data, fromPeerId) => {
    dataHandlersRef.current.forEach((handler) => handler(data, fromPeerId));

    /* Handle built-in messages */
    if (data?.type === 'IDENTITY') {
      const entry = connectionsRef.current.get(fromPeerId);
      if (entry) {
        entry.name = data.name;
        connectionsRef.current.set(fromPeerId, entry);
      }
      setParticipants((prev) =>
        prev.map((p) =>
          p.peerId === fromPeerId ? { ...p, name: data.name } : p
        )
      );
      if (isHostRef.current) {
        sendPeerList();
      }
    }

    if (data?.type === 'PEER_LIST' && Array.isArray(data.peers)) {
      data.peers.forEach((peerInfo) => {
        connectToPeerRef.current?.(peerInfo.peerId, peerInfo.name);
      });
    }
  }, [sendPeerList]);

  /* Internal: Set up a data connection with a peer */
  const setupDataConnection = useCallback((dataConn, peerId) => {
    dataConn.on('data', (data) => handlePeerData(data, peerId));
    dataConn.on('open', () => {
      const entry = connectionsRef.current.get(peerId);
      if (entry) {
        entry.dataConn = dataConn;
      }
      /* Send our identity */
      dataConn.send({ type: 'IDENTITY', name: displayName || 'Guest' });
      if (isHostRef.current) {
        sendPeerList(dataConn);
        sendPeerList();
      }
    });
    dataConn.on('close', () => {
      /* Peer disconnected */
    });
  }, [displayName, handlePeerData, sendPeerList]);

  /* Internal: Add a participant with their stream */
  const addParticipant = useCallback((peerId, stream, name = 'Guest') => {
    setParticipants((prev) => {
      const entry = connectionsRef.current.get(peerId);
      const resolvedName = entry?.name || name;
      const exists = prev.find((p) => p.peerId === peerId);
      if (exists) {
        return prev.map((p) =>
          p.peerId === peerId ? { ...p, stream, name: resolvedName || p.name } : p
        );
      }
      return [...prev, { peerId, stream, name: resolvedName, isHost: false }];
    });
  }, []);

  /* Internal: Remove a participant */
  const removeParticipant = useCallback((peerId) => {
    setParticipants((prev) => prev.filter((p) => p.peerId !== peerId));
    const entry = connectionsRef.current.get(peerId);
    if (entry) {
      entry.mediaConn?.close();
      entry.dataConn?.close();
      connectionsRef.current.delete(peerId);
    }
  }, []);

  const connectToPeer = useCallback((targetPeerId, name = 'Guest') => {
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || !stream || !targetPeerId || targetPeerId === peer.id) return;
    if (connectionsRef.current.has(targetPeerId)) return;

    /* Avoid duplicate guest-to-guest calls: only one side initiates. */
    if (peer.id > targetPeerId) return;

    const mediaConn = peer.call(targetPeerId, stream);
    if (!mediaConn) return;

    const dataConn = peer.connect(targetPeerId, { reliable: true });
    connectionsRef.current.set(targetPeerId, { mediaConn, dataConn, name });
    setupDataConnection(dataConn, targetPeerId);

    mediaConn.on('stream', (remoteStream) => {
      const entry = connectionsRef.current.get(targetPeerId) || {};
      entry.mediaConn = mediaConn;
      entry.dataConn = dataConn;
      entry.stream = remoteStream;
      entry.name = name || entry.name;
      connectionsRef.current.set(targetPeerId, entry);
      addParticipant(targetPeerId, remoteStream, name);
    });
    mediaConn.on('close', () => removeParticipant(targetPeerId));
  }, [addParticipant, removeParticipant, setupDataConnection]);

  useEffect(() => {
    connectToPeerRef.current = connectToPeer;
  }, [connectToPeer]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  /**
   * Creates a new studio room as host.
   */
  const createRoom = useCallback(async (stream, name) => {
    setConnectionState('creating');
    setErrorMessage('');
    const code = generateRoomCode();
    setRoomCode(code);
    roomCodeRef.current = code;
    setIsHost(true);
    isHostRef.current = true;
    setDisplayName(name || 'Host');
    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      /* The host's peerId IS the room code for easy joining */
      const peer = new Peer(`memorie-studio-${code}`, PEER_CONFIG);
      peerRef.current = peer;

      await new Promise((resolve, reject) => {
        peer.on('open', () => resolve());
        peer.on('error', (err) => reject(err));
        /* Timeout after 15 seconds */
        setTimeout(() => reject(new Error('Connection timed out')), 15000);
      });

      setConnectionState('waiting');

      /* Listen for incoming connections (reject when the room is full) */
      peer.on('call', (mediaConn) => {
        if (!connectionsRef.current.has(mediaConn.peer) && connectionsRef.current.size >= MAX_PARTICIPANTS - 1) {
          try { mediaConn.close(); } catch { /* already closed */ }
          return;
        }
        /* Answer immediately and reserve a slot so the cap is enforced
           before the remote stream arrives */
        mediaConn.answer(stream);
        const entry = connectionsRef.current.get(mediaConn.peer) || {};
        entry.mediaConn = mediaConn;
        connectionsRef.current.set(mediaConn.peer, entry);
        mediaConn.on('stream', (remoteStream) => {
          const current = connectionsRef.current.get(mediaConn.peer) || {};
          current.stream = remoteStream;
          connectionsRef.current.set(mediaConn.peer, current);
          addParticipant(mediaConn.peer, remoteStream);
          sendPeerList();
          setConnectionState('connected');
        });
        mediaConn.on('close', () => {
          removeParticipant(mediaConn.peer);
          if (connectionsRef.current.size === 0) {
            setConnectionState('waiting');
          }
        });
      });

      peer.on('connection', (dataConn) => {
        if (!connectionsRef.current.has(dataConn.peer) && connectionsRef.current.size >= MAX_PARTICIPANTS - 1) {
          try { dataConn.close(); } catch { /* already closed */ }
          return;
        }
        const entry = connectionsRef.current.get(dataConn.peer) || {};
        entry.dataConn = dataConn;
        connectionsRef.current.set(dataConn.peer, entry);
        setupDataConnection(dataConn, dataConn.peer);
      });

      peer.on('disconnected', () => {
        /* Try to reconnect */
        if (!peer.destroyed) {
          peer.reconnect();
        }
      });

      return code;
    } catch (err) {
      console.error('Failed to create studio room:', err);
      setConnectionState('error');
      setErrorMessage('Could not create studio. Please try again.');
      return null;
    }
  }, [addParticipant, removeParticipant, setupDataConnection]);

  /**
   * Joins an existing studio room as a guest.
   */
  const joinRoom = useCallback(async (code, stream, name) => {
    setConnectionState('connecting');
    setErrorMessage('');
    setRoomCode(code);
    roomCodeRef.current = code;
    setIsHost(false);
    isHostRef.current = false;
    setDisplayName(name || 'Guest');
    localStreamRef.current = stream;
    setLocalStream(stream);

    try {
      const peer = new Peer(undefined, PEER_CONFIG);
      peerRef.current = peer;

      await new Promise((resolve, reject) => {
        peer.on('open', () => resolve());
        peer.on('error', (err) => reject(err));
        setTimeout(() => reject(new Error('Connection timed out')), 15000);
      });

      const hostPeerId = `memorie-studio-${code}`;

      /* Establish media connection */
      const mediaConn = peer.call(hostPeerId, stream);
      if (!mediaConn) {
        throw new Error('Could not connect to studio');
      }

      /* Establish data channel */
      const dataConn = peer.connect(hostPeerId, { reliable: true });
      setupDataConnection(dataConn, hostPeerId);

      await new Promise((resolve, reject) => {
        mediaConn.on('stream', (remoteStream) => {
          const entry = connectionsRef.current.get(hostPeerId) || {};
          entry.mediaConn = mediaConn;
          entry.dataConn = dataConn;
          entry.stream = remoteStream;
          connectionsRef.current.set(hostPeerId, entry);
          addParticipant(hostPeerId, remoteStream, 'Host');
          setConnectionState('connected');
          resolve();
        });
        mediaConn.on('error', (err) => reject(err));
        mediaConn.on('close', () => {
          removeParticipant(hostPeerId);
          setConnectionState('error');
          setErrorMessage('The studio session has ended or is full.');
        });
        setTimeout(() => reject(new Error('Studio not found or connection timed out')), 20000);
      });

      /* Listen for additional peers connecting (from host) */
      peer.on('call', (incomingCall) => {
        if (!connectionsRef.current.has(incomingCall.peer) && connectionsRef.current.size >= MAX_PARTICIPANTS - 1) {
          try { incomingCall.close(); } catch { /* already closed */ }
          return;
        }
        incomingCall.answer(stream);
        const entry = connectionsRef.current.get(incomingCall.peer) || {};
        entry.mediaConn = incomingCall;
        connectionsRef.current.set(incomingCall.peer, entry);
        incomingCall.on('stream', (remoteStream) => {
          const current = connectionsRef.current.get(incomingCall.peer) || {};
          current.stream = remoteStream;
          connectionsRef.current.set(incomingCall.peer, current);
          addParticipant(incomingCall.peer, remoteStream);
        });
      });

      peer.on('connection', (inDataConn) => {
        const entry = connectionsRef.current.get(inDataConn.peer) || {};
        entry.dataConn = inDataConn;
        connectionsRef.current.set(inDataConn.peer, entry);
        setupDataConnection(inDataConn, inDataConn.peer);
      });

      return true;
    } catch (err) {
      console.error('Failed to join studio:', err);
      setConnectionState('error');
      setErrorMessage(
        err.message?.includes('not found') || err.message?.includes('timed out')
          ? 'Studio not found. Check the code and try again.'
          : 'Could not connect to studio. Please try again.'
      );
      return false;
    }
  }, [addParticipant, removeParticipant, setupDataConnection]);

  /**
   * Leaves the current room and cleans up all connections.
   */
  const leaveRoom = useCallback(() => {
    connectionsRef.current.forEach(({ mediaConn, dataConn }) => {
      mediaConn?.close();
      dataConn?.close();
    });
    connectionsRef.current.clear();

    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setRoomCode(null);
    setIsHost(false);
    setConnectionState('idle');
    setParticipants([]);
    setLocalStream(null);
    setErrorMessage('');
    dataHandlersRef.current = [];
  }, []);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(({ mediaConn, dataConn }) => {
        mediaConn?.close();
        dataConn?.close();
      });
      connectionsRef.current.clear();
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
    };
  }, []);

  return {
    roomCode,
    isHost,
    connectionState,
    participants,
    localStream,
    displayName,
    errorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcast,
    onData,
    setDisplayName,
  };
}
