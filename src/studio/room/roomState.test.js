import { describe, it, expect } from 'vitest';
import { bumpRoomState, mergeRoomState, addOrUpdateMember, activeMembers, MAX_STUDIO_PARTICIPANTS } from './roomState.js';

describe('roomState', () => {
  it('bumpRoomState increments version', () => {
    const s = { version: 1, members: [] };
    const n = bumpRoomState(s, { timer: 5 });
    expect(n.version).toBe(2);
    expect(n.timer).toBe(5);
  });
  it('mergeRoomState ignores stale version', () => {
    const local = { version: 5, members: [] };
    const incoming = { version: 3, members: [] };
    expect(mergeRoomState(local, incoming)).toBe(local);
    const newer = { version: 6, members: [{ peerId: 'a', connectionState: 'connected' }] };
    expect(mergeRoomState(local, newer).version).toBe(6);
  });
  it('addOrUpdateMember enforces cap 4', () => {
    let members = [];
    for (let i = 0; i < MAX_STUDIO_PARTICIPANTS; i++) {
      members = addOrUpdateMember(members, { peerId: `p${i}`, displayName: `P${i}`, connectionState: 'connected', joinedAt: i });
    }
    expect(activeMembers(members).length).toBe(4);
    const after = addOrUpdateMember(members, { peerId: 'extra', displayName: 'Extra', connectionState: 'connected', joinedAt: 99 });
    expect(activeMembers(after).length).toBe(4);
    // update existing is allowed even at cap
    const updated = addOrUpdateMember(members, { peerId: 'p0', displayName: 'P0-v2', connectionState: 'connected', joinedAt: 0 });
    expect(activeMembers(updated).length).toBe(4);
    expect(updated.find(m => m.peerId === 'p0').displayName).toBe('P0-v2');
  });
  it('activeMembers excludes left', () => {
    const m = [{ peerId: 'a', connectionState: 'left' }, { peerId: 'b', connectionState: 'connected' }];
    expect(activeMembers(m).length).toBe(1);
  });
});
