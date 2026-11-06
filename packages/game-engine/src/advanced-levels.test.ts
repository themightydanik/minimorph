import { it, expect } from 'vitest';
import { arenas } from '@minimorph/game-content';
import { createPlayer, stepArenaPlayer, FIXED_STEP, idleInput, JUMP_SPEED, GRAVITY } from './physics';
import { ArenaRuntime, sampleMechanism, surfaceContains } from './obstacles';
import { recordRound } from '../../../tests/helpers/round-pilot';

it('new route choices are physical, reconnect before checkpoints, and remain reachable with unchanged physics', () => {
 for(const arena of arenas){
  expect(arena.branches!.length).toBeGreaterThanOrEqual(2);
  for(const branch of arena.branches!){
   expect(branch.tradeoff.length).toBeGreaterThan(20);
   const next=arena.checkpoints.find(p=>-p.z>branch.end)??arena.finish;
   expect(-next.z).toBeGreaterThan(branch.end);
  }
  const main=recordRound(arena), safe=recordRound(arena,'safe'), fast=recordRound(arena,'boost');
  for(const run of [main,safe,fast]){expect(run.state.won,JSON.stringify(run.state)).toBe(true);expect(run.state.falls).toBe(0);expect(run.state.obstacleHits).toBe(0);}
  for(const b of arena.branches!.filter(b=>b.skill==='easy'))expect(safe.branches).toContain(b.id);
  expect(main.supports.some(id=>id.includes(arena.navigation?'carousel':'shuttle'))).toBe(true);
 }
 const gravity=arenas[2], run=recordRound(gravity);
 expect(gravity.finish.y).toBeCloseTo(3.6);expect(run.maxY).toBeGreaterThan(gravity.finish.y);
 expect(run.supports.filter(id=>id.includes('sky-lift'))).toHaveLength(2);
 // Highest lift-to-landing rise is 0.82m, below the unchanged 2.007m ballistic apex.
 expect(.6+.22).toBeLessThan(JUMP_SPEED**2/(2*GRAVITY));
});
it('authored moving supports carry through a whole cycle without drift, release on jumping, and allow landing again', () => {
 for(const source of arenas)for(const mechanism of source.mechanisms.filter(o=>o.kind==='moving-platform')){
  const pose=sampleMechanism(mechanism,.73);
  const arena={...source,spawn:{x:pose.x,y:pose.y,z:pose.z},finish:{x:0,y:0,z:-10000,radius:1},checkpoints:[],platforms:[],mechanisms:[mechanism],obstacles:[]};
  const state=createPlayer(arena);state.elapsed=.73;
  for(let tick=0;tick<Math.round(mechanism.period/FIXED_STEP);tick++){
   stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
   const at=sampleMechanism(mechanism,state.elapsed);
   expect(state.grounded).toBe(true);expect(state.supportId).toBe(mechanism.id);
   expect(state.x).toBeCloseTo(at.x,8);expect(state.y).toBeCloseTo(at.y,8);expect(state.z).toBeCloseTo(at.z,8);
  }
  const x=state.x,z=state.z;
  stepArenaPlayer(state,{x:0,z:0,jump:true},FIXED_STEP,arena);
  expect(state.grounded).toBe(false);expect(state.supportId).toBeNull();
  for(let tick=0;tick<12;tick++)stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
  expect(state.x).toBeCloseTo(x,1);expect(state.z).toBeCloseTo(z,1);expect(state.y).toBeGreaterThan(pose.y+.5);
  for(let tick=0;tick<160&&!state.grounded;tick++)stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
  expect(state.grounded).toBe(true);expect(state.supportId).toBe(mechanism.id);
 }
});
it('authoritative sampling repeats across cycles and all sector respawns stand on static safe decks at every phase', () => {
 for(const arena of arenas){
  for(const o of arena.mechanisms)for(const time of [0,.137,1.99,17.3]){
   const a=sampleMechanism(o,time), b=sampleMechanism(o,time+o.period*20);
   expect(b.x).toBeCloseTo(a.x,9);expect(b.y).toBeCloseTo(a.y,9);expect(b.z).toBeCloseTo(a.z,9);expect(b.phase,`${o.id} at ${time}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`).toBe(a.phase);
  }
  for(const [i,p] of arena.checkpoints.entries())for(const time of [0,.7,2.2,4.9]){
   const world=new ArenaRuntime(arena);
   expect(world.staticSurfaces.some(s=>surfaceContains(s,p.x,p.z)&&Math.abs(s.y-p.y)<.001)).toBe(true);
   const state=createPlayer(arena);Object.assign(state,{checkpoint:i+1,elapsed:time,recovery:'fall',respawnTimer:FIXED_STEP});
   for(let tick=0;tick<120;tick++)stepArenaPlayer(state,idleInput,FIXED_STEP,arena,world);
   expect(state.recovery).toBeNull();expect(state.grounded).toBe(true);expect(state.obstacleHits).toBe(0);expect(state.y).toBe(p.y);
  }
 }
});
it('branch arrival cannot skip ordered progression or claim an elevated finish from below', () => {
 for(const arena of arenas){
  const state=createPlayer(arena);Object.assign(state,arena.finish);
  stepArenaPlayer(state,idleInput,FIXED_STEP,arena);
  expect(state.won).toBe(false);expect(state.checkpoint).toBe(0);
 }
 const arena=arenas[2], state=createPlayer(arena);
 Object.assign(state,{x:arena.finish.x,z:arena.finish.z,y:0,checkpoint:arena.checkpoints.length});
 stepArenaPlayer(state,{...idleInput,dive:true},FIXED_STEP,arena);
 expect(state.won).toBe(false);
});
