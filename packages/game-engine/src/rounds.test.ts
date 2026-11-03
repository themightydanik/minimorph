import { it,expect } from 'vitest';
import { arenas } from '@minimorph/game-content';
import { recordRound } from '../../../tests/helpers/round-pilot';
import { createPlayer,stepArenaPlayer,FIXED_STEP } from './physics';
import recordings from '../../../tests/fixtures/full-round-runs.json';
import { writeFileSync } from 'node:fs';
it('all three full rounds complete cleanly in 60–90 seconds without slowing movement or long waits',()=>{
 const output:Record<string,unknown>={};
 for(const arena of arenas){
  const r=recordRound(arena);expect(r.state.won,JSON.stringify(r.state)).toBe(true);
  expect(r.state.falls).toBe(0);expect(r.state.obstacleHits).toBe(0);expect(r.state.checkpoint).toBe(arena.checkpoints.length);
  expect(r.state.elapsed).toBeGreaterThanOrEqual(60);expect(r.state.elapsed).toBeLessThanOrEqual(90);
  const idle=r.segments.filter(s=>s.keys.length===0).reduce((total,s)=>total+s.seconds,0);expect(idle).toBeLessThan(4);
  const segments=r.segments.map(s=>({...s,keys:[...s.keys]}));segments[segments.length-1].seconds+=.5;
  output[arena.id]={segments,seconds:r.state.elapsed,checkpoints:r.state.checkpoint,idleSeconds:idle};
 }
 if(process.env.RECORD_ROUNDS==='1')writeFileSync('tests/fixtures/full-round-runs.json',JSON.stringify(output,null,2)+'\n');
});
it('risky boost lane and longer outer bridges are playable alternatives, not decorative routes',()=>{
 for(const arena of arenas)for(const strategy of ['boost','outer'] as const){const r=recordRound(arena,strategy);expect(r.state.won).toBe(true);expect(r.state.falls).toBe(0);expect(r.state.obstacleHits).toBe(0);}
 const orbit=arenas[1];expect(recordRound(orbit,'main').state.elapsed-recordRound(orbit,'boost').state.elapsed).toBeGreaterThan(2);
});
it('recorded ordinary controls complete each full round',()=>{
 for(const arena of arenas){
  const state=createPlayer(arena),run=recordings[arena.id as keyof typeof recordings];
  for(const segment of run.segments)for(let tick=0,n=Math.round(segment.seconds/FIXED_STEP);tick<n;tick++)
   stepArenaPlayer(state,{x:Number(segment.keys.includes('KeyD'))-Number(segment.keys.includes('KeyA')),z:-Number(segment.keys.includes('KeyW')),jump:segment.jump&&tick===0},FIXED_STEP,arena);
  expect(state.won,`${arena.id} replay, ${JSON.stringify(state)}`).toBe(true);expect(state.falls).toBe(0);
 }
});
