import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { generateRoomCode } from '../utils/roomCode.js';
import {
  activeMembers,
  addOrUpdateMember,
  bumpRoomState,
  createInitialRoomState,
  createMember,
  MAX_STUDIO_PARTICIPANTS,
  mergeRoomState,
  removeMember,
  updateMember,
} from '../utils/studioRoomState.js';

/**
 * useStudioRoom — WebRTC P2P room manager with canonical room state.
 *
 * Architecture:
 * - Host maintains authoritative ROOM_STATE_SYNC (versioned).
 * - Media streams are keyed by stable peerId (separate from room membership).
 * - Guest-to-guest mesh with retry + fallback initiation.
 * - Room membership persists through temporary media disconnects.
 */

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};

const MESH_RETRY_DELAYS_MS = [0, 400, 1000, 2500, 5000];
const MESH_FALLBACK_MS = 3500;
const MEDIA_RECONNECT_GRACE_MS = 8000;

function hostPeerIdForCode(code) {
  return `memorie-studio-${code}`;
}

export function useStudioRoom() {
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [connectionState, setConnectionState] = useState('idle');
  const [roomState, setRoomState] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selfPeerId, setSelfPeerId] = useState(null);
  const [streamVersion, setStreamVersion] = useState(0);

  const peerRef = useRef(null);
  const connectionsRef = useRef(new Map());
  const streamsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const roomCodeRef = useRef(null);
  const dataHandlersRef = useRef([]);
  const isHostRef = useRef(false);
  const selfPeerIdRef = useRef(null);
  const roomStateRef = useRef(null);
  const meshRetryTimersRef = useRef(new Map());
  const meshFallbackTimersRef = useRef(new Map());
  const mediaGraceTimersRef = useRef(new Map());
  const connectToPeerRef = useRef(null);
  const scheduleMeshRef = useRef(null);
  const broadcastRoomStateRef = useRef(null);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  const onData = useCallback((handler) => {
    dataHandlersRef.current.push(handler);
    return () => {
      dataHandlersRef.current = dataHandlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  const broadcast = useCallback((message) => {
    connectionsRef.current.forEach(({ dataConn }) => {
      if (dataConn?.open) {
        try {
          dataConn.send(message);
        } catch {
          /* closed */
        }
      }
    });
  }, []);

  const broadcastRoomState = useCallback(
    (nextState) => {
      if (!nextState) return;
      roomStateRef.current = nextState;
      setRoomState(nextState);
      broadcast({ type: 'ROOM_STATE_SYNC', roomState: nextState });
    },
    [broadcast]
  );

  useEffect(() => {
    broadcastRoomStateRef.current = broadcastRoomState;
  }, [broadcastRoomState]);

  const sendPeerList = useCallback(
    (targetConn = null) => {
      const peers = Array.from(connectionsRef.current.entries())
        .filter(([peerId]) => peerId !== selfPeerIdRef.current)
        .map(([peerId, entry]) => ({
          peerId,
          name: entry.name || 'Guest',
        }));
      const message = { type: 'PEER_LIST', peers };

      if (targetConn?.open) {
        try {
          targetConn.send(message);
        } catch {
          /* closed */
        }
        return;
      }

      connectionsRef.current.forEach(({ dataConn }) => {
        if (dataConn?.open) {
          try {
            dataConn.send(message);
          } catch {
            /* closed */
          }
        }
      });
    },
    []
  );

  const setStreamForPeer = useCallback((peerId, stream) => {
    if (stream) {
      streamsRef.current.set(peerId, stream);
    } else {
      streamsRef.current.delete(peerId);
    }
    setStreamVersion((v) => v + 1);
    setRoomState((prev) => {
      if (!prev) return prev;
      const members = updateMember(prev.members, peerId, {
        mediaState: stream ? 'ready' : 'loading',
        connectionState: 'connected',
      });
      const next = { ...prev, members };
      roomStateRef.current = next;
      return next;
    });
  }, []);

  const hostAddMember = useCallback(
    (peerId, name = 'Guest') => {
      if (!isHostRef.current || !roomStateRef.current) return;
      const member = createMember({
        peerId,
        displayName: name,
        role: 'guest',
        joinedAt: Date.now(),
      });
      const next = bumpRoomState(roomStateRef.current, {
        members: addOrUpdateMember(roomStateRef.current.members, member),
      });
      broadcastRoomState(next);
    },
    [broadcastRoomState]
  );

  const hostRemoveMember = useCallback(
    (peerId) => {
      if (!isHostRef.current || !roomStateRef.current) return;
      if (peerId === selfPeerIdRef.current) return;
      const next = bumpRoomState(roomStateRef.current, {
        members: removeMember(roomStateRef.current.members, peerId),
      });
      broadcastRoomState(next);
    },
    [broadcastRoomState]
  );

  const hostUpdateMemberMedia = useCallback(
    (peerId, mediaState, connectionState = 'connected') => {
      if (!isHostRef.current || !roomStateRef.current) return;
      const exists = roomStateRef.current.members.some((m) => m.peerId === peerId);
      if (!exists) return;
      const next = bumpRoomState(roomStateRef.current, {
        members: updateMember(roomStateRef.current.members, peerId, {
          mediaState,
          connectionState,
        }),
      });
      broadcastRoomState(next);
    },
    [broadcastRoomState]
  );

  const applyRemoteRoomState = useCallback((incoming) => {
    setRoomState((prev) => mergeRoomState(prev, incoming));
  }, []);

  const updateSelfParticipant = useCallback(
    (patch) => {
      const peerId = selfPeerIdRef.current;
      if (!peerId || !roomStateRef.current) return;

      if (isHostRef.current) {
        const next = bumpRoomState(roomStateRef.current, {
          members: updateMember(roomStateRef.current.members, peerId, patch),
        });
        broadcastRoomState(next);
      } else {
        broadcast({ type: 'PARTICIPANT_UPDATE', peerId, patch });
        setRoomState((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            members: updateMember(prev.members, peerId, patch),
          };
          roomStateRef.current = next;
          return next;
        });
      }
    },
    [broadcast, broadcastRoomState]
  );

  const updateHostSettings = useCallback(
    (patch) => {
      if (!isHostRef.current || !roomStateRef.current) return;
      const next = bumpRoomState(roomStateRef.current, patch);
      broadcastRoomState(next);
    },
    [broadcastRoomState]
  );

  const clearMeshTimers = useCallback((peerId) => {
    const retry = meshRetryTimersRef.current.get(peerId);
    if (retry) {
      clearTimeout(retry);
      meshRetryTimersRef.current.delete(peerId);
    }
    const fallback = meshFallbackTimersRef.current.get(peerId);
    if (fallback) {
      clearTimeout(fallback);
      meshFallbackTimersRef.current.delete(peerId);
    }
  }, []);

  const clearMediaGraceTimer = useCallback((peerId) => {
    const t = mediaGraceTimersRef.current.get(peerId);
    if (t) {
      clearTimeout(t);
      mediaGraceTimersRef.current.delete(peerId);
    }
  }, []);

  const markMediaReconnecting = useCallback(
    (peerId) => {
      clearMediaGraceTimer(peerId);
      setStreamForPeer(peerId, null);

      setRoomState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          members: updateMember(prev.members, peerId, {
            connectionState: 'reconnecting',
            mediaState: 'loading',
          }),
        };
        roomStateRef.current = next;
        return next;
      });

      if (isHostRef.current) {
        hostUpdateMemberMedia(peerId, 'loading', 'reconnecting');
      }

      mediaGraceTimersRef.current.set(
        peerId,
        setTimeout(() => {
          mediaGraceTimersRef.current.delete(peerId);
          if (!streamsRef.current.has(peerId)) {
            if (isHostRef.current) {
              hostRemoveMember(peerId);
            }
            const entry = connectionsRef.current.get(peerId);
            if (entry) {
              entry.mediaConn?.close();
              entry.dataConn?.close();
              connectionsRef.current.delete(peerId);
            }
          }
        }, MEDIA_RECONNECT_GRACE_MS)
      );
    },
    [clearMediaGraceTimer, hostRemoveMember, hostUpdateMemberMedia, setStreamForPeer]
  );

  const handleIncomingStream = useCallback(
    (peerId, remoteStream, name = 'Guest') => {
      clearMediaGraceTimer(peerId);
      clearMeshTimers(peerId);

      const entry = connectionsRef.current.get(peerId) || {};
      entry.stream = remoteStream;
      entry.name = name || entry.name;
      connectionsRef.current.set(peerId, entry);

      setStreamForPeer(peerId, remoteStream);

      if (isHostRef.current) {
        const existing = roomStateRef.current?.members.some((m) => m.peerId === peerId);
        if (!existing) {
          hostAddMember(peerId, name);
        } else {
          hostUpdateMemberMedia(peerId, 'ready', 'connected');
        }
        sendPeerList();
      }
    },
    [
      clearMediaGraceTimer,
      clearMeshTimers,
      hostAddMember,
      hostUpdateMemberMedia,
      sendPeerList,
      setStreamForPeer,
    ]
  );

  const setupIncomingCallHandler = useCallback(
    (stream) => {
      const peer = peerRef.current;
      if (!peer || peer._studioCallHandlerRegistered) return;
      peer._studioCallHandlerRegistered = true;

      peer.on('call', (incomingCall) => {
        const remotePeerId = incomingCall.peer;
        if (remotePeerId === selfPeerIdRef.current) {
          try {
            incomingCall.close();
          } catch {
            /* noop */
          }
          return;
        }

        const remoteCount = Array.from(connectionsRef.current.keys()).filter(
          (id) => id !== selfPeerIdRef.current
        ).length;
        if (!connectionsRef.current.has(remotePeerId) && remoteCount >= MAX_STUDIO_PARTICIPANTS - 1) {
          try {
            incomingCall.close();
          } catch {
            /* noop */
          }
          return;
        }

        incomingCall.answer(stream);
        const entry = connectionsRef.current.get(remotePeerId) || {};
        entry.mediaConn = incomingCall;
        connectionsRef.current.set(remotePeerId, entry);

        incomingCall.on('stream', (remoteStream) => {
          handleIncomingStream(remotePeerId, remoteStream, entry.name);
          setConnectionState('connected');
        });

        incomingCall.on('close', () => {
          markMediaReconnecting(remotePeerId);
        });
      });
    },
    [handleIncomingStream, markMediaReconnecting]
  );

  const setupDataConnection = useCallback(
    (dataConn, peerId) => {
      dataConn.on('data', (data) => {
        dataHandlersRef.current.forEach((handler) => handler(data, peerId));

        if (data?.type === 'IDENTITY') {
          const entry = connectionsRef.current.get(peerId) || {};
          entry.name = data.name;
          connectionsRef.current.set(peerId, entry);
          if (isHostRef.current) {
            hostAddMember(peerId, data.name);
            sendPeerList();
          }
        }

        if (data?.type === 'PEER_LIST' && Array.isArray(data.peers)) {
          data.peers.forEach((peerInfo) => {
            scheduleMeshRef.current?.(peerInfo.peerId, peerInfo.name);
          });
        }

        if (data?.type === 'ROOM_STATE_SYNC' && data.roomState) {
          applyRemoteRoomState(data.roomState);
        }

        if (data?.type === 'PARTICIPANT_UPDATE' && isHostRef.current) {
          const { peerId: senderId, patch } = data;
          if (!senderId || senderId !== peerId || !roomStateRef.current) return;
          const next = bumpRoomState(roomStateRef.current, {
            members: updateMember(roomStateRef.current.members, senderId, patch),
          });
          broadcastRoomStateRef.current?.(next);
        }

        if (data?.type === 'LEAVE' && isHostRef.current) {
          hostRemoveMember(data.peerId || peerId);
          const entry = connectionsRef.current.get(peerId);
          entry?.mediaConn?.close();
          entry?.dataConn?.close();
          connectionsRef.current.delete(peerId);
          streamsRef.current.delete(peerId);
        }
      });

      dataConn.on('open', () => {
        const entry = connectionsRef.current.get(peerId) || {};
        entry.dataConn = dataConn;
        connectionsRef.current.set(peerId, entry);

        dataConn.send({
          type: 'IDENTITY',
          name: displayName || (isHostRef.current ? 'Host' : 'Guest'),
          peerId: selfPeerIdRef.current,
        });

        if (isHostRef.current) {
          sendPeerList(dataConn);
          if (roomStateRef.current) {
            dataConn.send({ type: 'ROOM_STATE_SYNC', roomState: roomStateRef.current });
          }
        }
      });
    },
    [
      applyRemoteRoomState,
      displayName,
      hostAddMember,
      hostRemoveMember,
      sendPeerList,
    ]
  );

  const connectToPeer = useCallback(
    (targetPeerId, name = 'Guest', force = false) => {
      const peer = peerRef.current;
      const stream = localStreamRef.current;
      if (!peer || !stream || !targetPeerId || targetPeerId === peer.id) return;

      const existing = connectionsRef.current.get(targetPeerId);
      if (existing?.stream) return;

      if (!force && peer.id > targetPeerId) {
        if (!meshFallbackTimersRef.current.has(targetPeerId)) {
          meshFallbackTimersRef.current.set(
            targetPeerId,
            setTimeout(() => {
              meshFallbackTimersRef.current.delete(targetPeerId);
              if (!connectionsRef.current.get(targetPeerId)?.stream) {
                connectToPeerRef.current?.(targetPeerId, name, true);
              }
            }, MESH_FALLBACK_MS)
          );
        }
        return;
      }

      if (existing?.mediaConn && !existing.stream) {
        try {
          existing.mediaConn.close();
        } catch {
          /* noop */
        }
      }

      const mediaConn = peer.call(targetPeerId, stream);
      if (!mediaConn) return;

      let dataConn = existing?.dataConn;
      if (!dataConn || !dataConn.open) {
        dataConn = peer.connect(targetPeerId, { reliable: true });
        setupDataConnection(dataConn, targetPeerId);
      }

      connectionsRef.current.set(targetPeerId, {
        mediaConn,
        dataConn,
        name,
        stream: existing?.stream || null,
      });

      mediaConn.on('stream', (remoteStream) => {
        handleIncomingStream(targetPeerId, remoteStream, name);
      });

      mediaConn.on('close', () => {
        markMediaReconnecting(targetPeerId);
      });
    },
    [handleIncomingStream, markMediaReconnecting, setupDataConnection]
  );

  const scheduleMeshConnect = useCallback(
    (targetPeerId, name = 'Guest', attempt = 0) => {
      if (!targetPeerId || targetPeerId === selfPeerIdRef.current) return;
      if (connectionsRef.current.get(targetPeerId)?.stream) return;

      connectToPeerRef.current?.(targetPeerId, name);

      if (attempt < MESH_RETRY_DELAYS_MS.length - 1) {
        const existing = meshRetryTimersRef.current.get(targetPeerId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          scheduleMeshConnect(targetPeerId, name, attempt + 1);
        }, MESH_RETRY_DELAYS_MS[attempt + 1]);
        meshRetryTimersRef.current.set(targetPeerId, timer);
      }
    },
    []
  );

  useEffect(() => {
    connectToPeerRef.current = connectToPeer;
    scheduleMeshRef.current = scheduleMeshConnect;
  }, [connectToPeer, scheduleMeshConnect]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const createRoom = useCallback(
    async (stream, name) => {
      setConnectionState('creating');
      setErrorMessage('');
      const code = generateRoomCode();
      const hostId = hostPeerIdForCode(code);

      setRoomCode(code);
      roomCodeRef.current = code;
      setIsHost(true);
      isHostRef.current = true;
      setDisplayName(name || 'Host');
      setSelfPeerId(hostId);
      selfPeerIdRef.current = hostId;
      localStreamRef.current = stream;
      setLocalStream(stream);

      const initialState = createInitialRoomState({
        hostPeerId: hostId,
        hostName: name || 'Host',
      });
      initialState.members[0].mediaState = 'ready';
      roomStateRef.current = initialState;
      setRoomState(initialState);

      try {
        const peer = new Peer(hostId, PEER_CONFIG);
        peerRef.current = peer;

        await new Promise((resolve, reject) => {
          peer.on('open', () => resolve());
          peer.on('error', (err) => reject(err));
          setTimeout(() => reject(new Error('Connection timed out')), 15000);
        });

        setupIncomingCallHandler(stream);

        setConnectionState('waiting');

        peer.on('connection', (dataConn) => {
          const remoteCount = Array.from(connectionsRef.current.keys()).filter(
            (id) => id !== selfPeerIdRef.current
          ).length;
          if (!connectionsRef.current.has(dataConn.peer) && remoteCount >= MAX_STUDIO_PARTICIPANTS - 1) {
            try {
              dataConn.close();
            } catch {
              /* noop */
            }
            return;
          }
          const entry = connectionsRef.current.get(dataConn.peer) || {};
          entry.dataConn = dataConn;
          connectionsRef.current.set(dataConn.peer, entry);
          setupDataConnection(dataConn, dataConn.peer);
        });

        peer.on('disconnected', () => {
          if (!peer.destroyed) peer.reconnect();
        });

        return code;
      } catch (err) {
        console.error('Failed to create studio room:', err);
        setConnectionState('error');
        setErrorMessage('Could not create studio. Please try again.');
        return null;
      }
    },
    [setupDataConnection, setupIncomingCallHandler]
  );

  const joinRoom = useCallback(
    async (code, stream, name) => {
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

        setSelfPeerId(peer.id);
        selfPeerIdRef.current = peer.id;

        setupIncomingCallHandler(stream);

        const hostId = hostPeerIdForCode(code);
        setRoomState({
          version: 0,
          backgroundId: 'y2k-chrome',
          timer: 3,
          shots: 4,
          capturePhase: 'idle',
          members: [],
        });

        const mediaConn = peer.call(hostId, stream);
        if (!mediaConn) throw new Error('Could not connect to studio');

        const dataConn = peer.connect(hostId, { reliable: true });
        connectionsRef.current.set(hostId, { mediaConn, dataConn, name: 'Host' });
        setupDataConnection(dataConn, hostId);

        mediaConn.on('close', () => {
          markMediaReconnecting(hostId);
          setConnectionState('error');
          setErrorMessage('The studio session has ended or is full.');
        });

        await new Promise((resolve, reject) => {
          mediaConn.on('stream', (remoteStream) => {
            handleIncomingStream(hostId, remoteStream, 'Host');
            setConnectionState('connected');
            resolve();
          });
          mediaConn.on('error', (err) => reject(err));
          setTimeout(() => reject(new Error('Studio not found or connection timed out')), 20000);
        });

        peer.on('connection', (inDataConn) => {
          const entry = connectionsRef.current.get(inDataConn.peer) || {};
          entry.dataConn = inDataConn;
          connectionsRef.current.set(inDataConn.peer, entry);
          setupDataConnection(inDataConn, inDataConn.peer);
        });

        peer.on('disconnected', () => {
          if (!peer.destroyed) peer.reconnect();
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
    },
    [handleIncomingStream, markMediaReconnecting, setupDataConnection, setupIncomingCallHandler]
  );

  const leaveRoom = useCallback(() => {
    broadcast({ type: 'LEAVE', peerId: selfPeerIdRef.current });

    meshRetryTimersRef.current.forEach((t) => clearTimeout(t));
    meshRetryTimersRef.current.clear();
    meshFallbackTimersRef.current.forEach((t) => clearTimeout(t));
    meshFallbackTimersRef.current.clear();
    mediaGraceTimersRef.current.forEach((t) => clearTimeout(t));
    mediaGraceTimersRef.current.clear();

    connectionsRef.current.forEach(({ mediaConn, dataConn }) => {
      mediaConn?.close();
      dataConn?.close();
    });
    connectionsRef.current.clear();
    streamsRef.current.clear();

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
    setSelfPeerId(null);
    selfPeerIdRef.current = null;
    setConnectionState('idle');
    setRoomState(null);
    roomStateRef.current = null;
    setLocalStream(null);
    setErrorMessage('');
    dataHandlersRef.current = [];
  }, [broadcast]);

  useEffect(() => {
    return () => {
      meshRetryTimersRef.current.forEach((t) => clearTimeout(t));
      meshFallbackTimersRef.current.forEach((t) => clearTimeout(t));
      mediaGraceTimersRef.current.forEach((t) => clearTimeout(t));
      connectionsRef.current.forEach(({ mediaConn, dataConn }) => {
        mediaConn?.close();
        dataConn?.close();
      });
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
    };
  }, []);

  const participants = (roomState?.members ? activeMembers(roomState.members) : [])
    .filter((m) => m.peerId !== selfPeerIdRef.current)
    .map((m) => ({
      peerId: m.peerId,
      name: m.displayName,
      stream: streamsRef.current.get(m.peerId) || null,
      isHost: m.role === 'host',
      mirror: m.mirror,
      flash: m.flash,
      transform: m.transform,
      connectionState: m.connectionState,
      mediaState: m.mediaState,
      joinedAt: m.joinedAt,
    }));
  /* streamVersion keeps participants in sync when streams arrive */
  void streamVersion;

  const getStreamForPeer = useCallback((peerId) => {
    if (peerId === selfPeerIdRef.current) return localStreamRef.current;
    return streamsRef.current.get(peerId) || null;
  }, []);

  return {
    roomCode,
    isHost,
    connectionState,
    roomState,
    participants,
    selfPeerId,
    localStream,
    displayName,
    errorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcast,
    onData,
    setDisplayName,
    updateSelfParticipant,
    updateHostSettings,
    getStreamForPeer,
    streamsRef,
  };
}
