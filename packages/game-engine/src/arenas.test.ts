import { describe, it, expect } from 'vitest';
import { trainingArenas as arenas, getTrainingArena as getArena } from '@minimorph/game-content';
import { createPlayer, stepArenaPlayer, FIXED_STEP } from './physics';
import { arenaRuns, orbitShuttleRun } from '../../../tests/helpers/arena-runs';
describe('Arena routes with ordinary digital controls', () => {
  for (const arena of arenas) it(`completes ${arena.name}`, () => {
    const state = createPlayer(arena);
    for (const [segmentIndex, segment] of arenaRuns[arena.id].entries()) {
      for (let tick = 0; tick < Math.round(segment.seconds / FIXED_STEP); tick++) {
        stepArenaPlayer(state, { x: Number(segment.keys.includes('KeyD')) - Number(segment.keys.includes('KeyA')), z: -Number(segment.keys.includes('KeyW')), jump: segment.jump && tick === 0 }, FIXED_STEP, arena);
      }
      expect(state.falls, `segment ${segmentIndex}, position ${state.x},${state.y},${state.z}, hit ${state.lastHazard}`).toBe(0);
    }
    expect(state.falls).toBe(0);
    expect(state.checkpoint).toBe(arena.checkpoints.length);
    expect(state.won).toBe(true);
  });
});

it('can choose the shuttle route and actually uses its jump pad and moving deck', () => {
 const arena=getArena('orbit-chaos'), state=createPlayer(arena), events=new Set<string>(), supports=new Set<string>();
 for(const segment of orbitShuttleRun) for(let tick=0;tick<Math.round(segment.seconds/FIXED_STEP);tick++) {
  stepArenaPlayer(state,{x:Number(segment.keys.includes('KeyD'))-Number(segment.keys.includes('KeyA')),z:-Number(segment.keys.includes('KeyW')),jump:segment.jump&&tick===0},FIXED_STEP,arena);
  if(state.lastEvent) events.add(state.lastEvent); if(state.supportId) supports.add(state.supportId);
 }
 expect(events.has('pad')).toBe(true); expect(supports.has('orbit-shuttle')).toBe(true);
 expect(state.won, JSON.stringify(state)).toBe(true); expect(state.falls).toBe(0);
});
it('keeps all routes playable around render-frame input boundaries', () => {
 for(const arena of arenas) for(const direction of [-1,1]) {
  for(let boundary=0;boundary<arenaRuns[arena.id].length;boundary++) {
   const state=createPlayer(arena);
   for(const [i,segment] of arenaRuns[arena.id].entries()) {
    const ticks=Math.round(segment.seconds/FIXED_STEP)+(i===boundary?direction*2:0);
    for(let tick=0;tick<ticks;tick++)stepArenaPlayer(state,{x:Number(segment.keys.includes('KeyD'))-Number(segment.keys.includes('KeyA')),z:-Number(segment.keys.includes('KeyW')),jump:segment.jump&&tick===0},FIXED_STEP,arena);
   }
   expect(state.won,`${arena.id}, input edge ${boundary}, jitter ${direction}`).toBe(true);
   expect(state.falls).toBe(0);
  }
 }
});
it('recovers at the selected arena checkpoint after an actual walk-off fall', () => {
 for(const arena of arenas) {
  const state=createPlayer(arena);
  outer:for(const segment of arenaRuns[arena.id]) for(let tick=0;tick<Math.round(segment.seconds/FIXED_STEP);tick++) {
   stepArenaPlayer(state,{x:Number(segment.keys.includes('KeyD'))-Number(segment.keys.includes('KeyA')),z:-Number(segment.keys.includes('KeyW')),jump:segment.jump&&tick===0},FIXED_STEP,arena);
   if(state.checkpoint===1)break outer;
  }
  expect(state.checkpoint).toBe(1);
  const elapsed=state.elapsed;
  for(let tick=0;tick<1200 && state.falls===0;tick++)stepArenaPlayer(state,{x:1,z:0,jump:false},FIXED_STEP,arena);
  expect(state.falls,arena.id).toBe(1);
  for(let tick=0;tick<60;tick++)stepArenaPlayer(state,{x:0,z:0,jump:false},FIXED_STEP,arena);
  expect(state.checkpoint).toBe(1); expect(state.elapsed).toBeGreaterThan(elapsed);
  expect(state.x).toBeCloseTo(arena.checkpoints[0].x,1); expect(state.z).toBeCloseTo(arena.checkpoints[0].z,1);
  expect(state.recovery).toBeNull(); expect(state.grounded).toBe(true);
 }
});
