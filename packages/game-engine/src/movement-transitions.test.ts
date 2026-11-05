import { describe, expect, it } from 'vitest';
import { arenas } from '@minimorph/game-content';
import type { ArenaConfig, ArenaObstacle } from '@minimorph/game-content';
import { beginRecovery, createPlayer, stepPlayer, stepArenaPlayer, FIXED_STEP, DIVE_COOLDOWN, DIVE_SPEED } from './physics';
import type { Input, PlayerState } from './physics';
const idle: Input = { x: 0, z: 0, jump: false, dive: false };
const floor = [{ x: 0, y: 0, z: 0, width: 1000, depth: 1000 }];
const isNormal = (state: Readonly<PlayerState>) => state.action === "normal";
const tick = (state: PlayerState, dive = false) => stepPlayer(state, { ...idle, dive }, FIXED_STEP, floor, [], undefined, false);
const fixture = (obstacle: ArenaObstacle): ArenaConfig => ({
  ...arenas[0], spawn: { x: 0, y: 0, z: 0 }, finish: { x: 0, y: 0, z: -500, radius: 1 },
  checkpoints: [], platforms: floor, mechanisms: [obstacle], obstacles: [],
});
describe('Dive transition boundaries and rearming rules', () => {
  it.each(['slide', 'recover'] as const)('consumes a Dive edge on the exact %s expiry tick, including with no token/cooldown lock', action => {
    const state = createPlayer();
    Object.assign(state, { action, actionTime: FIXED_STEP, diveUsed: false, diveCooldown: 0 });
    tick(state, true);
    expect(state.action).toBe(action === 'slide' ? 'recover' : 'normal');
    expect(state.diveCooldown).toBe(0);
    expect(state.diveHeld).toBe(true);
    for (let i = 0; i < 180; i++) {
      tick(state, true);
      expect(state.diveCooldown).toBe(0);
      expect(['dive', 'slide']).not.toContain(state.action);
    }
    tick(state, false); tick(state, true);
    expect(state.action).toBe('slide'); expect(state.diveCooldown).toBe(DIVE_COOLDOWN);
  });
  it('rapid repeated Dive edges cannot restart a locked action or stack speed', () => {
    const state = createPlayer();
    let starts = 0;
    for (let i = 0; i < 600; i++) {
      const previous = { ...state }, dive = i % 2 === 0;
      tick(state, dive);
      const started = state.diveCooldown > previous.diveCooldown;
      if (previous.action !== 'normal') expect(started).toBe(false);
      if (started) {
        starts++;
        expect(previous.action).toBe('normal'); expect(previous.diveHeld).toBe(false);
        expect(previous.diveUsed).toBe(false); expect(previous.diveCooldown).toBeLessThanOrEqual(FIXED_STEP);
      }
      expect(Math.hypot(state.vx, state.vz)).toBeLessThanOrEqual(DIVE_SPEED);
    }
    expect(starts).toBeGreaterThan(1); expect(starts).toBeLessThanOrEqual(5);
  });
  it('landing retains the spent token through Slide/Recovery and rearms only on normal ground without resetting cooldown', () => {
    const state = createPlayer();
    Object.assign(state, { y: .001, vy: -2, grounded: false, coyote: 0, action: 'dive', diveUsed: true, diveCooldown: .9 });
    tick(state);
    expect(state.action).toBe('slide'); expect(state.diveUsed).toBe(true);
    expect(state.diveCooldown).toBeCloseTo(.9 - FIXED_STEP);
    for (let i = 0; i < 120 && !isNormal(state); i++) {
      tick(state);
      expect(state.diveUsed).toBe(!isNormal(state));
    }
    expect(state.action).toBe('normal'); expect(state.diveCooldown).toBeGreaterThan(0);
    tick(state, true); expect(state.action).toBe('normal');
    for (let i = 0; i < 150; i++) tick(state, true);
    expect(state.action).toBe('normal'); expect(state.diveCooldown).toBe(0);
    tick(state, false); tick(state, true); expect(state.action).toBe('slide');
  });
  it('airborne knockback cancels the action but preserves the spent token and remaining cooldown until landing', () => {
    const arena = fixture({ id: 'bob', kind: 'pendulum', x: 0, y: 0, z: 0, radius: .6, length: 3.6, swing: .8, period: 4 });
    const state = createPlayer(arena);
    Object.assign(state, { action: 'dive', diveUsed: true, diveCooldown: .8, grounded: false, coyote: 0, y: .2, vy: -1 });
    stepArenaPlayer(state, idle, FIXED_STEP, arena);
    expect(state.lastEvent).toBe('hit'); expect(state.action).toBe('normal');
    expect(state.diveUsed).toBe(true); expect(state.diveCooldown).toBeCloseTo(.8 - FIXED_STEP);
    // Even after hit lock/cooldown expire, a midair interruption must not grant another dive.
    Object.assign(state, { knockTime: 0, diveCooldown: 0 });
    tick(state, true); expect(state.diveUsed).toBe(true); expect(state.action).toBe('normal');
    Object.assign(state, { y: .001, vy: -2 }); tick(state);
    expect(state.grounded).toBe(true); expect(state.diveUsed).toBe(false);
  });
  it('finishing Recovery in midair does not rearm a spent Dive', () => {
    const state = createPlayer();
    Object.assign(state, { action: 'recover', actionTime: FIXED_STEP, diveUsed: true, diveCooldown: 0, y: 3, grounded: false, coyote: 0 });
    tick(state, true); expect(state.action).toBe('normal'); expect(state.diveUsed).toBe(true);
    tick(state, false); tick(state, true);
    expect(state.action).toBe('normal'); expect(state.diveCooldown).toBe(0);
    Object.assign(state, { y: .001, vy: -2 }); tick(state);
    expect(state.diveUsed).toBe(false);
  });
  it('checkpoint entry preserves the token, restoration rearms it, and a held Dive cannot fire after respawn/cooldown expiry', () => {
    const state = createPlayer();
    Object.assign(state, { action: 'dive', diveUsed: true, diveCooldown: .9, diveHeld: true });
    beginRecovery(state, 'fall');
    expect(state.diveUsed).toBe(true); expect(state.diveCooldown).toBe(.9);
    for (let i = 0; i < 60 && state.recovery; i++) tick(state, true);
    expect(state.recovery).toBeNull(); expect(state.diveUsed).toBe(false);
    expect(state.diveCooldown).toBeGreaterThan(.4); expect(state.diveCooldown).toBeLessThan(.51);
    for (let i = 0; i < 180; i++) tick(state, true);
    expect(state.diveCooldown).toBe(0); expect(state.action).toBe('normal');
    tick(state, false); tick(state, true); expect(state.action).toBe('slide');
  });
  for (const kind of ['jump-pad', 'bounce-platform'] as const) {
    it.each(['normal', 'slide', 'recover'] as const)(`${kind} interrupts %s without bypassing rearming/cooldown or clearing held Dive`, action => {
      const arena = fixture({ id: 'pad', kind, x: 0, y: 0, z: 0, width: 10, depth: 10, boost: 14, period: 2, amplitude: 0 });
      const state = createPlayer(arena);
      Object.assign(state, { action, actionTime: 1, diveUsed: true, diveCooldown: .8 });
      stepArenaPlayer(state, { ...idle, dive: true }, FIXED_STEP, arena);
      expect(state.lastEvent).toBe('pad'); expect(state.action).toBe('normal'); expect(state.actionTime).toBe(0);
      expect(state.grounded).toBe(false); expect(state.vy).toBe(14);
      // Only the normal grounded phase before launch can rearm; a pad cannot bypass a locked chain.
      expect(state.diveUsed).toBe(action !== 'normal'); expect(state.diveCooldown).toBeCloseTo(.8 - FIXED_STEP);
      for (let i = 0; i < 120; i++) stepArenaPlayer(state, { ...idle, dive: true }, FIXED_STEP, arena);
      expect(state.grounded).toBe(false); expect(state.action).toBe('normal'); expect(state.diveCooldown).toBe(0);
      stepArenaPlayer(state, idle, FIXED_STEP, arena);
      stepArenaPlayer(state, { ...idle, dive: true }, FIXED_STEP, arena);
      expect(state.action).toBe(action === 'normal' ? 'dive' : 'normal');
    });
  }
});
