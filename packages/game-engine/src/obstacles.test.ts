import { describe, it, expect } from 'vitest';
import { arenas } from '@minimorph/game-content';
import type { ArenaConfig, ArenaObstacle } from '@minimorph/game-content';
import { createPlayer, stepArenaPlayer, FIXED_STEP, idleInput } from './physics';
import { arenaSurfaces, sampleMechanism, mechanismContact } from './obstacles';
function fixture(o: ArenaObstacle, floor = true): ArenaConfig {
  return { ...arenas[0], spawn: {x:0,y:0,z:0}, finish:{x:0,y:0,z:-60,radius:1}, checkpoints:[], platforms:floor?[{x:0,y:0,z:0,width:40,depth:40}]:[], obstacles:[], mechanisms:[o] };
}
function run(arena: ArenaConfig, seconds: number, state = createPlayer(arena)) {
  for(let i=0;i<Math.round(seconds/FIXED_STEP);i++) stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
  return state;
}
describe('physical mechanisms and shared predictable sampling', () => {
  it('rotating sweeper imparts a recoverable impulse; jumping above it avoids contact', () => {
    const o: ArenaObstacle={id:'rotor',kind:'sweeper',x:0,y:0,z:0,period:4,length:4,width:.3,height:.5};
    const arena=fixture(o), state=createPlayer(arena); state.x=1;
    stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
    expect(state.lastEvent).toBe('hit'); expect(state.recovery).toBeNull(); expect(state.vy).toBeGreaterThan(4); expect(Math.hypot(state.knockX,state.knockZ)).toBeCloseTo(8);
    expect(mechanismContact(o,0,{x:1,y:1,z:0})).toBe(false);
    expect(mechanismContact(o,1,{x:0,y:0,z:1})).toBe(true);
    expect(mechanismContact(o,1,{x:1,y:0,z:0})).toBe(false);
  });
  it.each(['x','y','z'] as const)('moving platform carries a standing player on axis %s', axis => {
    const arena=fixture({id:'shuttle',kind:'moving-platform',x:0,y:0,z:0,width:4,depth:4,axis,amplitude:2,period:4},false);
    const state=run(arena,1);
    expect(state.grounded).toBe(true); expect(state.supportId).toBe('shuttle'); expect(state[axis]).toBeCloseTo(2,1);
    run(arena,2,state); expect(state.grounded).toBe(true); expect(state[axis]).toBeCloseTo(-2,1);
  });
  it('rotating disc carries the player tangentially and has a circular collision boundary', () => {
    const arena=fixture({id:'disc',kind:'rotating-disc',x:0,y:0,z:0,radius:2,period:4},false);
    const state=createPlayer(arena); state.x=1;
    run(arena,1,state); expect(state.x).toBeCloseTo(0,1); expect(state.z).toBeCloseTo(1,1); expect(state.grounded).toBe(true);
    const corner=createPlayer(arena); corner.x=corner.z=1.8;
    run(arena,.1,corner); expect(corner.grounded).toBe(false);
  });
  it('disappearing support warns, loses collision and returns without teleporting a falling player', () => {
    const o: ArenaObstacle={id:'fade',kind:'disappearing-platform',x:0,y:0,z:0,width:4,depth:4,period:2,onFor:1,warning:.3};
    const arena=fixture(o,false), state=createPlayer(arena);
    expect(sampleMechanism(o,.8).phase).toBe('warning');
    run(arena,1.2,state); expect(state.grounded).toBe(false); expect(state.y).toBeLessThan(0); expect(arenaSurfaces(arena,1.2)).toHaveLength(0);
    expect(arenaSurfaces(arena,2.1)).toHaveLength(1);
  });
  it('jump pad launches on real contact and cannot grant a midair double jump', () => {
    const arena=fixture({id:'pad',kind:'jump-pad',x:0,y:0,z:0,width:2,depth:2,boost:12,period:1}), state=createPlayer(arena);
    stepArenaPlayer(state,idleInput,FIXED_STEP,arena); expect(state.vy).toBe(12); expect(state.grounded).toBe(false); expect(state.lastEvent).toBe('pad');
    stepArenaPlayer(state,{...idleInput,jump:true},FIXED_STEP,arena); expect(state.vy).toBeLessThan(12); expect(state.coyote).toBe(0);
  });
  it('laser warning is non-damaging, active field collides, grace prevents repeated impulses', () => {
    const o: ArenaObstacle={id:'laser',kind:'laser',x:0,y:0,z:0,width:4,depth:.3,height:2,period:4,warning:1,activeFor:1};
    const arena=fixture(o), state=createPlayer(arena); state.elapsed=2.5;
    stepArenaPlayer(state,idleInput,FIXED_STEP,arena); expect(state.obstacleHits).toBe(0); expect(sampleMechanism(o,state.elapsed).phase).toBe('warning');
    state.elapsed=3.1; stepArenaPlayer(state,idleInput,FIXED_STEP,arena); expect(state.obstacleHits).toBe(1);
    run(arena,.1,state); expect(state.obstacleHits).toBe(1);
    expect(sampleMechanism(o,4.1).phase).toBe('safe');
  });
  it('sliding block samples its path and physically displaces the player on impact', () => {
    const o: ArenaObstacle={id:'block',kind:'sliding-block',x:0,y:0,z:0,width:1,depth:1,height:1,axis:'x',amplitude:2,period:4};
    const arena=fixture(o), state=createPlayer(arena); state.x=2.3; state.elapsed=1-FIXED_STEP;
    expect(sampleMechanism(o,1).x).toBeCloseTo(2);
    stepArenaPlayer(state,idleInput,FIXED_STEP,arena); expect(state.lastHazard).toBe('block');
    run(arena,.1,state); expect(state.x).toBeGreaterThan(2.6); expect(state.y).toBeGreaterThan(0);
  });
});

it('catches an airborne foot when an upward platform crosses it between ticks', () => {
 const arena=fixture({id:'lift',kind:'moving-platform',x:0,y:0,z:0,width:4,depth:4,axis:'y',amplitude:2,period:4},false);
 const state=createPlayer(arena);Object.assign(state,{grounded:false,coyote:0,y:.005,vy:-.2});
 stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
 expect(state.grounded).toBe(true);expect(state.supportId).toBe('lift');expect(state.y).toBeGreaterThan(.02);
});

it('resolves active hazards before awarding a coincident finish', () => {
 const arena=fixture({id:'finish-laser',kind:'laser',x:0,y:0,z:0,width:4,depth:.3,height:2,period:4,warning:1,activeFor:1});
 arena.finish={x:0,y:0,z:0,radius:1};
 const state=createPlayer(arena);state.elapsed=3.1;
 stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
 expect(state.obstacleHits).toBe(1);expect(state.won).toBe(false);expect(state.grounded).toBe(false);
});
