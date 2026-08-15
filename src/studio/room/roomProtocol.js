/**
 * Studio Room Protocol
 * Typed messaging constants and payload schemas for WebRTC data connections.
 */

export const PROTOCOL_TYPES = {
  ROOM_STATE_SYNC: 'ROOM_STATE_SYNC',
  IDENTITY: 'IDENTITY',
  PEER_LIST: 'PEER_LIST',
  PARTICIPANT_UPDATE: 'PARTICIPANT_UPDATE',
  SHUTTER: 'SHUTTER',
  FLASH_FIRE: 'FLASH_FIRE',
  LEAVE: 'LEAVE',
};

/**
 * Creates an IDENTITY message payload.
 */
export function createIdentityMessage(peerId, displayName, role = 'guest') {
  return {
    type: PROTOCOL_TYPES.IDENTITY,
    peerId,
    displayName: displayName || (role === 'host' ? 'Host' : 'Guest'),
    role,
    timestamp: Date.now(),
  };
}

/**
 * Creates a PEER_LIST message payload.
 */
export function createPeerListMessage(peers) {
  return {
    type: PROTOCOL_TYPES.PEER_LIST,
    peers: peers.map((p) => ({
      peerId: p.peerId,
      displayName: p.displayName || 'Guest',
    })),
    timestamp: Date.now(),
  };
}

/**
 * Creates a ROOM_STATE_SYNC message payload.
 */
export function createRoomStateSyncMessage(roomState) {
  return {
    type: PROTOCOL_TYPES.ROOM_STATE_SYNC,
    roomState,
    timestamp: Date.now(),
  };
}

/**
 * Creates a PARTICIPANT_UPDATE message payload.
 */
export function createParticipantUpdateMessage(peerId, patch) {
  return {
    type: PROTOCOL_TYPES.PARTICIPANT_UPDATE,
    peerId,
    patch,
    timestamp: Date.now(),
  };
}

/**
 * Creates a SHUTTER message payload.
 */
export function createShutterMessage({ totalShots, timerSec, captureTimestamps }) {
  return {
    type: PROTOCOL_TYPES.SHUTTER,
    totalShots,
    timerSec,
    captureTimestamps,
    timestamp: Date.now(),
  };
}

/**
 * Creates a FLASH_FIRE message payload.
 */
export function createFlashFireMessage() {
  return {
    type: PROTOCOL_TYPES.FLASH_FIRE,
    timestamp: Date.now(),
  };
}

/**
 * Creates a LEAVE message payload.
 */
export function createLeaveMessage(peerId) {
  return {
    type: PROTOCOL_TYPES.LEAVE,
    peerId,
    timestamp: Date.now(),
  };
}
