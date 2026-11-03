import { describe, expect, it } from 'vitest';
import { characterClip } from './character';
import { createPlayer } from './physics';
describe('gameplay animation selection', () => {
  it('maps physics, landing, recovery, victory and restart without moving the player', () => {
    const state = createPlayer();
    expect(characterClip(state)).toBe('Idle');
    state.vx = 6;
    expect(characterClip(state)).toBe('Run');
    state.grounded = false; state.vy = 8;
    expect(characterClip(state)).toBe('Jump');
    state.vy = -1;
    expect(characterClip(state)).toBe('Fall');
    state.grounded = true; state.landingTime = 0.2;
    expect(characterClip(state)).toBe('Land');
    state.landingTime = 0;
    expect(characterClip(state)).toBe('Run');
    state.recovery = 'obstacle';
    expect(characterClip(state)).toBe('Idle');
    state.won = true;
    expect(characterClip(state)).toBe('Victory');
    expect(characterClip(createPlayer())).toBe('Idle');
  });
});
