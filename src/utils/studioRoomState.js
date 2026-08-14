import { PARTICIPANT_LAYOUTS } from '../constants/studioAssets.js';

export const MAX_STUDIO_PARTICIPANTS = 4;

/**
 * Default transform for a participant slot based on join order (0-based index).
 */
export function getDefaultTransform(joinIndex, totalCount) {
  const count = Math.min(MAX_STUDIO_PARTICIPANTS, Math.max(1, totalCount));
  const layouts = PARTICIPANT_LAYOUTS[count] || PARTICIPANT_LAYOUTS[1];
  const layout = layouts[joinIndex] || layouts[0];
  return {
    x: layout.x,
    y: layout.y,
    scale: layout.scale,
    rotation: 0,
    zIndex: layout.zIndex ?? joinIndex + 1,
  };
}

export function createMember({
  peerId,
  displayName,
  role,
  joinedAt = Date.now(),
  mirror = true,
  flash = true,
  transform = null,
}) {
  return {
    peerId,
    displayName: displayName || (role === 'host' ? 'Host' : 'Guest'),
    role,
    joinedAt,
    connectionState: 'connected',
    mediaState: 'loading',
    mirror,
    flash,
    transform,
  };
}

export function createInitialRoomState({ hostPeerId, hostName, backgroundId = 'y2k-chrome', timer = 3, shots = 4 }) {
  return {
    version: 1,
    backgroundId,
    customBgUrl: null,
    timer,
    shots,
    capturePhase: 'idle',
    members: [
      createMember({
        peerId: hostPeerId,
        displayName: hostName,
        role: 'host',
        joinedAt: Date.now(),
      }),
    ],
  };
}

/**
 * Sort members by join order (stable left-to-right layout).
 */
export function sortMembersByJoinOrder(members) {
  return [...members].sort((a, b) => a.joinedAt - b.joinedAt);
}

/**
 * Active members still in the room (not explicitly left).
 */
export function activeMembers(members) {
  return sortMembersByJoinOrder(members.filter((m) => m.connectionState !== 'left'));
}

/**
 * Assign default transforms to members missing explicit transforms.
 */
export function applyDefaultTransforms(members) {
  const active = activeMembers(members);
  const total = active.length;
  return members.map((m) => {
    if (m.connectionState === 'left') return m;
    const joinIndex = active.findIndex((a) => a.peerId === m.peerId);
    if (joinIndex < 0) return m;
    return {
      ...m,
      transform: m.transform ?? getDefaultTransform(joinIndex, total),
    };
  });
}

export function bumpRoomState(state, patch) {
  const next = {
    ...state,
    ...patch,
    version: (state.version || 0) + 1,
  };
  if (patch.members) {
    next.members = applyDefaultTransforms(patch.members);
  } else if (state.members) {
    next.members = applyDefaultTransforms(state.members);
  }
  return next;
}

export function mergeRoomState(local, incoming) {
  if (!incoming || (incoming.version ?? 0) <= (local?.version ?? 0)) {
    return local;
  }
  return {
    ...incoming,
    members: applyDefaultTransforms(incoming.members || []),
  };
}

export function updateMember(members, peerId, patch) {
  return members.map((m) => (m.peerId === peerId ? { ...m, ...patch } : m));
}

export function removeMember(members, peerId) {
  return members.map((m) =>
    m.peerId === peerId ? { ...m, connectionState: 'left', mediaState: 'unavailable' } : m
  );
}

export function addOrUpdateMember(members, member) {
  const idx = members.findIndex((m) => m.peerId === member.peerId);
  if (idx >= 0) {
    const updated = [...members];
    updated[idx] = { ...updated[idx], ...member, connectionState: 'connected' };
    return applyDefaultTransforms(updated);
  }
  if (activeMembers(members).length >= MAX_STUDIO_PARTICIPANTS) {
    return members;
  }
  return applyDefaultTransforms([...members, member]);
}
