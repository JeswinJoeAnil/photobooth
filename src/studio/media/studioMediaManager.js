/**
 * Studio Media Manager
 * Full Mesh WebRTC manager using PeerJS for 1–4 participants.
 * Handles reliable peer discovery, deterministic call initiation,
 * stream lifecycle, and data channels.
 */

import Peer from 'peerjs';

function buildIceServers() {
  const stun = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];
  // Optional TURN for NAT-restricted networks (configure via env):
  // VITE_TURN_URLS=turn:turn.example.com:3478  VITE_TURN_USERNAME=user  VITE_TURN_CREDENTIAL=pass
  const turnUrls = import.meta.env.VITE_TURN_URLS;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnUrls && turnUser && turnCred) {
    return [...stun, { urls: turnUrls.split(','), username: turnUser, credential: turnCred }];
  }
  if (import.meta.env.DEV) {
    console.warn('WebRTC: TURN not configured — symmetric NAT will fail. Set VITE_TURN_URLS/USERNAME/CREDENTIAL.');
  }
  return stun;
}

const PEER_CONFIG = {
  config: {
    iceServers: buildIceServers(),
  },
};

const MAX_PEERS_HARD_CAP = 4;

const MESH_RETRY_DELAYS_MS = [0, 500, 1200, 3000];
const MESH_FALLBACK_MS = 3000;
const MEDIA_RECONNECT_GRACE_MS = 8000;

export function hostPeerIdForCode(code) {
  return `memorie-studio-${(code || '').trim().toUpperCase()}`;
}

export class StudioMediaManager {
  constructor({
    onMessage = () => {},
    onStreamAdded = () => {},
    onStreamRemoved = () => {},
    onDataChannelOpened = () => {},
    onConnectionStateChange = () => {},
    onError = () => {},
  } = {}) {
    this.onMessage = onMessage;
    this.onStreamAdded = onStreamAdded;
    this.onStreamRemoved = onStreamRemoved;
    this.onDataChannelOpened = onDataChannelOpened;
    this.onConnectionStateChange = onConnectionStateChange;
    this.onError = onError;

    this.peer = null;
    this.selfPeerId = null;
    this.localStream = null;
    this.isHost = false;
    this.roomCode = null;

    this.connections = new Map(); // peerId -> { mediaConn, dataConn, name, stream }
    this.streams = new Map(); // peerId -> MediaStream
    this.meshRetryTimers = new Map();
    this.meshFallbackTimers = new Map();
    this.mediaGraceTimers = new Map();

    this.destroyed = false;
  }

  getStream(peerId) {
    if (peerId === this.selfPeerId) return this.localStream;
    return this.streams.get(peerId) || null;
  }

  getAllStreams() {
    return new Map(this.streams);
  }

  async createHost(roomCode, localStream, displayName = 'Host') {
    this.isHost = true;
    this.roomCode = (roomCode || '').trim().toUpperCase();
    this.localStream = localStream;
    const hostId = hostPeerIdForCode(this.roomCode);
    this.selfPeerId = hostId;

    this.onConnectionStateChange('creating');

    try {
      this.peer = new Peer(hostId, PEER_CONFIG);
      await this._waitForOpen(15000);

      this._setupIncomingCallHandler();
      this._setupIncomingDataHandler();

      let reconnectAttempts = 0;
      this.peer.on('disconnected', () => {
        if (this.destroyed || !this.peer || this.peer.destroyed) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        console.warn(`Peer disconnected — reconnect attempt ${reconnectAttempts} in ${delay}ms`);
        setTimeout(() => {
          if (!this.destroyed && this.peer && !this.peer.destroyed) {
            try { this.peer.reconnect(); } catch {}
          }
        }, delay);
      });
      this.peer.on('open', () => { reconnectAttempts = 0; });

      this.peer.on('error', (err) => {
        console.warn('Peer error (host):', err);
        if (err.type === 'unavailable-id') {
          this.onError('A studio with this code is already active. Please generate a new code.');
        } else {
          this.onError(err.message || 'Network connection error');
        }
      });

      this.onConnectionStateChange('waiting');
      return hostId;
    } catch (err) {
      console.error('Failed to create host:', err);
      this.onConnectionStateChange('error');
      this.onError('Could not create studio session. Please try again.');
      throw err;
    }
  }

  async joinGuest(roomCode, localStream, displayName = 'Guest') {
    this.isHost = false;
    this.roomCode = (roomCode || '').trim().toUpperCase();
    this.localStream = localStream;
    const hostId = hostPeerIdForCode(this.roomCode);

    this.onConnectionStateChange('connecting');

    try {
      this.peer = new Peer(undefined, PEER_CONFIG);
      await this._waitForOpen(15000);

      this.selfPeerId = this.peer.id;
      this._setupIncomingCallHandler();
      this._setupIncomingDataHandler();

      let guestReconnectAttempts = 0;
      this.peer.on('disconnected', () => {
        if (this.destroyed || !this.peer || this.peer.destroyed) return;
        const delay = Math.min(1000 * Math.pow(2, guestReconnectAttempts), 30000);
        guestReconnectAttempts++;
        console.warn(`Peer disconnected — reconnect attempt ${guestReconnectAttempts} in ${delay}ms`);
        setTimeout(() => {
          if (!this.destroyed && this.peer && !this.peer.destroyed) {
            try { this.peer.reconnect(); } catch {}
          }
        }, delay);
      });
      this.peer.on('open', () => { guestReconnectAttempts = 0; });

      this.peer.on('error', (err) => {
        console.warn('Peer error (guest):', err);
        this.onError(err.message || 'Connection error');
      });

      // Call and connect to host
      await this._connectToHost(hostId, displayName);
      this.onConnectionStateChange('connected');
      return this.selfPeerId;
    } catch (err) {
      console.error('Failed to join guest:', err);
      this.onConnectionStateChange('error');
      this.onError(
        err.message?.includes('not found') || err.message?.includes('timed out')
          ? 'Studio not found or session ended. Check the code and try again.'
          : 'Could not connect to studio. Please try again.'
      );
      throw err;
    }
  }

  _waitForOpen(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('Peer not initialized'));
      if (this.peer.open) return resolve(this.peer.id);

      let timer = null;
      const onOpen = (id) => {
        clearTimeout(timer);
        this.peer.off('open', onOpen);
        this.peer.off('error', onError);
        resolve(id);
      };
      const onError = (err) => {
        clearTimeout(timer);
        this.peer.off('open', onOpen);
        this.peer.off('error', onError);
        reject(err);
      };

      timer = setTimeout(() => {
        this.peer.off('open', onOpen);
        this.peer.off('error', onError);
        reject(new Error('Connection timed out'));
      }, timeoutMs);

      this.peer.once('open', onOpen);
      this.peer.once('error', onError);
    });
  }

  _setupIncomingCallHandler() {
    if (!this.peer || this.peer._incomingCallHandlerSet) return;
    this.peer._incomingCallHandlerSet = true;

    this.peer.on('call', (incomingCall) => {
      const remotePeerId = incomingCall.peer;
      if (remotePeerId === this.selfPeerId) {
        try { incomingCall.close(); } catch {}
        return;
      }
      // Hard cap: reject if already at MAX_PEERS_HARD_CAP (client-side, until TURN/validate)
      const activeCount = (this.connections.size + 1); // +1 self
      if (activeCount >= MAX_PEERS_HARD_CAP + 1 || this.connections.size >= MAX_PEERS_HARD_CAP) {
        console.warn(`Rejecting call from ${remotePeerId}: room full (${activeCount})`);
        try { incomingCall.close(); } catch {}
        return;
      }

      // Answer with our local camera stream
      incomingCall.answer(this.localStream);

      const entry = this.connections.get(remotePeerId) || {};
      entry.mediaConn = incomingCall;
      this.connections.set(remotePeerId, entry);

      incomingCall.on('stream', (remoteStream) => {
        this._handleStreamArrived(remotePeerId, remoteStream);
      });

      incomingCall.on('close', () => {
        this._handleMediaClosed(remotePeerId);
      });

      incomingCall.on('error', (err) => {
        console.warn(`MediaCall error from ${remotePeerId}:`, err);
      });
    });
  }

  _setupIncomingDataHandler() {
    if (!this.peer || this.peer._incomingDataHandlerSet) return;
    this.peer._incomingDataHandlerSet = true;

    this.peer.on('connection', (dataConn) => {
      const remotePeerId = dataConn.peer;
      if (remotePeerId === this.selfPeerId) return;
      // Cap data channels too
      if (this.connections.size >= MAX_PEERS_HARD_CAP && !this.connections.has(remotePeerId)) {
        console.warn(`Rejecting data channel from ${remotePeerId}: room full`);
        try { dataConn.close(); } catch {}
        return;
      }

      const entry = this.connections.get(remotePeerId) || {};
      entry.dataConn = dataConn;
      this.connections.set(remotePeerId, entry);

      this._wireDataConnection(dataConn, remotePeerId);
    });
  }

  _wireDataConnection(dataConn, remotePeerId) {
    dataConn.on('data', (data) => {
      if (this.destroyed) return;
      this.onMessage(data, remotePeerId);
    });

    dataConn.on('open', () => {
      if (this.destroyed) return;
      const entry = this.connections.get(remotePeerId) || {};
      entry.dataConn = dataConn;
      this.connections.set(remotePeerId, entry);

      this.onDataChannelOpened(remotePeerId, dataConn);
    });

    dataConn.on('close', () => {
      // Data channel closed
    });

    dataConn.on('error', (err) => {
      console.warn(`DataConn error with ${remotePeerId}:`, err);
    });
  }

  async _connectToHost(hostId, displayName) {
    if (!this.peer || !this.localStream) return;

    const mediaConn = this.peer.call(hostId, this.localStream);
    const dataConn = this.peer.connect(hostId, { reliable: true });

    this.connections.set(hostId, {
      mediaConn,
      dataConn,
      name: 'Host',
      stream: null,
    });

    this._wireDataConnection(dataConn, hostId);

    mediaConn.on('close', () => {
      this._handleMediaClosed(hostId);
      this.onConnectionStateChange('error');
      this.onError('The studio session has ended.');
    });

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          reject(new Error('Connection to host timed out'));
        }
      }, 15000);

      mediaConn.on('stream', (remoteStream) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this._handleStreamArrived(hostId, remoteStream);
          resolve();
        }
      });

      mediaConn.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  connectToPeer(targetPeerId, name = 'Guest', force = false) {
    if (!this.peer || !this.localStream || !targetPeerId || targetPeerId === this.selfPeerId) {
      return;
    }

    const existing = this.connections.get(targetPeerId);
    if (existing?.stream) return;

    // Tie-breaker: Alphabetically smaller ID initiates
    if (!force && this.selfPeerId > targetPeerId) {
      if (!this.meshFallbackTimers.has(targetPeerId)) {
        this.meshFallbackTimers.set(
          targetPeerId,
          setTimeout(() => {
            this.meshFallbackTimers.delete(targetPeerId);
            if (!this.connections.get(targetPeerId)?.stream) {
              this.connectToPeer(targetPeerId, name, true);
            }
          }, MESH_FALLBACK_MS)
        );
      }
      return;
    }

    if (existing?.mediaConn && !existing.stream) {
      try { existing.mediaConn.close(); } catch {}
    }

    const mediaConn = this.peer.call(targetPeerId, this.localStream);
    if (!mediaConn) return;

    let dataConn = existing?.dataConn;
    if (!dataConn || !dataConn.open) {
      dataConn = this.peer.connect(targetPeerId, { reliable: true });
      this._wireDataConnection(dataConn, targetPeerId);
    }

    this.connections.set(targetPeerId, {
      mediaConn,
      dataConn,
      name,
      stream: existing?.stream || null,
    });

    mediaConn.on('stream', (remoteStream) => {
      this._handleStreamArrived(targetPeerId, remoteStream);
    });

    mediaConn.on('close', () => {
      this._handleMediaClosed(targetPeerId);
    });

    mediaConn.on('error', (err) => {
      console.warn(`Mesh call error to ${targetPeerId}:`, err);
    });
  }

  scheduleMeshConnect(targetPeerId, name = 'Guest', attempt = 0) {
    if (!targetPeerId || targetPeerId === this.selfPeerId) return;
    if (this.connections.get(targetPeerId)?.stream) return;

    this.connectToPeer(targetPeerId, name);

    if (attempt < MESH_RETRY_DELAYS_MS.length - 1) {
      const existing = this.meshRetryTimers.get(targetPeerId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.scheduleMeshConnect(targetPeerId, name, attempt + 1);
      }, MESH_RETRY_DELAYS_MS[attempt + 1]);

      this.meshRetryTimers.set(targetPeerId, timer);
    }
  }

  _handleStreamArrived(peerId, remoteStream) {
    const graceTimer = this.mediaGraceTimers.get(peerId);
    if (graceTimer) {
      clearTimeout(graceTimer);
      this.mediaGraceTimers.delete(peerId);
    }

    const retryTimer = this.meshRetryTimers.get(peerId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.meshRetryTimers.delete(peerId);
    }

    const fallbackTimer = this.meshFallbackTimers.get(peerId);
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      this.meshFallbackTimers.delete(peerId);
    }

    const entry = this.connections.get(peerId) || {};
    entry.stream = remoteStream;
    this.connections.set(peerId, entry);

    this.streams.set(peerId, remoteStream);
    this.onStreamAdded(peerId, remoteStream);
  }

  _handleMediaClosed(peerId) {
    if (this.mediaGraceTimers.has(peerId)) {
      clearTimeout(this.mediaGraceTimers.get(peerId));
    }

    this.streams.delete(peerId);
    const entry = this.connections.get(peerId);
    if (entry) entry.stream = null;

    this.onStreamRemoved(peerId);

    this.mediaGraceTimers.set(
      peerId,
      setTimeout(() => {
        this.mediaGraceTimers.delete(peerId);
        if (!this.streams.has(peerId)) {
          const conn = this.connections.get(peerId);
          if (conn) {
            try { conn.mediaConn?.close(); } catch {}
            try { conn.dataConn?.close(); } catch {}
            this.connections.delete(peerId);
          }
        }
      }, MEDIA_RECONNECT_GRACE_MS)
    );
  }

  broadcast(message) {
    this.connections.forEach(({ dataConn }) => {
      if (dataConn?.open) {
        try {
          dataConn.send(message);
        } catch {
          /* closed */
        }
      }
    });
  }

  sendTo(peerId, message) {
    const entry = this.connections.get(peerId);
    if (entry?.dataConn?.open) {
      try {
        entry.dataConn.send(message);
      } catch {
        /* closed */
      }
    }
  }

  destroy() {
    this.destroyed = true;

    this.meshRetryTimers.forEach((t) => clearTimeout(t));
    this.meshRetryTimers.clear();
    this.meshFallbackTimers.forEach((t) => clearTimeout(t));
    this.meshFallbackTimers.clear();
    this.mediaGraceTimers.forEach((t) => clearTimeout(t));
    this.mediaGraceTimers.clear();

    this.connections.forEach(({ mediaConn, dataConn }) => {
      try { mediaConn?.close(); } catch {}
      try { dataConn?.close(); } catch {}
    });
    this.connections.clear();
    this.streams.clear();

    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }

    this.localStream = null;
    this.selfPeerId = null;
    this.roomCode = null;
    this.isHost = false;
  }
}
