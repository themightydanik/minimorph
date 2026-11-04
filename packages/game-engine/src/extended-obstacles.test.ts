import { describe,it,expect } from 'vitest';
import { arenas } from '@minimorph/game-content';
import type { ArenaConfig,ArenaObstacle } from '@minimorph/game-content';
import { createPlayer,stepArenaPlayer,FIXED_STEP,idleInput } from './physics';
import { ArenaRuntime,sampleMechanism,mechanismContact } from './obstacles';
function fixture(o:ArenaObstacle,floor=true):ArenaConfig{return {...arenas[0],spawn:{x:0,y:0,z:0},finish:{x:0,y:0,z:-80,radius:1},checkpoints:[],platforms:floor?[{x:0,y:0,z:0,width:30,depth:30}]:[],mechanisms:[o],obstacles:[]};}
function run(a:ArenaConfig,s:ReturnType<typeof createPlayer>,seconds:number,input=idleInput){for(let i=0;i<Math.round(seconds/FIXED_STEP);i++)stepArenaPlayer(s,input,FIXED_STEP,a);}
describe('additional physical obstacles',()=>{
 it('pendulum bob follows its arc and hits only where the actual bob overlaps',()=>{
  const o:ArenaObstacle={id:'bob',kind:'pendulum',x:0,y:0,z:0,radius:.6,length:3.6,swing:.8,period:4};
  const a=fixture(o),s=createPlayer(a);stepArenaPlayer(s,idleInput,FIXED_STEP,a);expect(s.lastHazard).toBe('bob');expect(s.vy).toBeGreaterThan(0);
  const far=sampleMechanism(o,1);expect(far.x).toBeGreaterThan(2);expect(far.y).toBeGreaterThan(.6);expect(mechanismContact(o,1,{x:0,y:0,z:0})).toBe(false);
 });
 it('moving wall gap is passable but solid panels stay solid during hit grace',()=>{
  const o:ArenaObstacle={id:'wall',kind:'moving-wall',x:0,y:0,z:0,width:10,depth:.6,height:2.6,gap:3,amplitude:2,period:6};
  expect(mechanismContact(o,0,{x:0,y:0,z:0})).toBe(false);expect(mechanismContact(o,0,{x:2,y:0,z:0})).toBe(true);
  const a=fixture(o),s=createPlayer(a);s.x=3;s.z=.6;s.protection=1;
  run(a,s,.1,{x:0,z:-1,jump:false});expect(s.z).toBeGreaterThan(.5);expect(s.obstacleHits).toBe(0);
  expect(sampleMechanism(o,1.5).x).toBeCloseTo(2);
 });
 it('conveyor carries grounded players, permits counter-steering, and does not affect airborne players',()=>{
  const a=fixture({id:'belt',kind:'conveyor',x:0,y:0,z:0,width:10,depth:10,velocityX:2,velocityZ:0,period:1}),s=createPlayer(a);
  run(a,s,1);expect(s.supportId).toBe('belt');expect(s.x).toBeCloseTo(2,1);
  const before=s.x;run(a,s,.5,{x:-1,z:0,jump:false});expect(s.x).toBeLessThan(before);
  const air=createPlayer(a);Object.assign(air,{grounded:false,coyote:0,y:2});run(a,air,.1);expect(air.x).toBe(0);
 });
 it('bouncing support moves physically and launches once per landing without a midair double jump',()=>{
  const o:ArenaObstacle={id:'spring',kind:'bounce-platform',x:0,y:0,z:0,width:5,depth:5,amplitude:.22,boost:12,period:2.6};
  const a=fixture(o,false),s=createPlayer(a);stepArenaPlayer(s,idleInput,FIXED_STEP,a);expect(s.lastEvent).toBe('pad');expect(s.vy).toBe(12);
  const serial=s.eventSerial;run(a,s,.1);expect(s.eventSerial).toBe(serial);expect(s.vy).toBeLessThan(12);expect(sampleMechanism(o,.65).y).toBeCloseTo(.22);
 });
 it('timed gate warns, blocks even protected players, and opens predictably',()=>{
  const o:ArenaObstacle={id:'gate',kind:'timed-gate',x:0,y:0,z:0,width:8,depth:.5,height:2.6,period:4,warning:.6,activeFor:1};
  expect(sampleMechanism(o,2.7).phase).toBe('warning');expect(mechanismContact(o,2.7,{x:0,y:0,z:0})).toBe(false);
  const a=fixture(o),s=createPlayer(a);s.elapsed=3.2;s.z=.6;s.protection=2;
  run(a,s,.1,{x:0,z:-1,jump:false});expect(s.z).toBeGreaterThan(.5);
  const open=createPlayer(a);open.z=1;run(a,open,.6,{x:0,z:-1,jump:false});expect(open.z).toBeLessThan(-1);
 });
 it('pusher warning is safe and its active head/shaft impart a directional sideways impulse',()=>{
  const o:ArenaObstacle={id:'piston',kind:'pusher',x:5.5,y:0,z:0,width:1,depth:1.4,height:.85,side:1,reach:5.5,period:4,warning:.7,activeFor:1};
  expect(mechanismContact(o,2.7,{x:0,y:0,z:0})).toBe(false);
  const a=fixture(o),s=createPlayer(a);s.x=2.5;s.elapsed=3.5-FIXED_STEP;
  stepArenaPlayer(s,idleInput,FIXED_STEP,a);expect(s.lastHazard).toBe('piston');expect(s.knockX).toBeLessThan(-7);expect(s.knockZ).toBe(0);
 });
 it('collapsing support triggers on actual contact, warns, falls and resets independently per run',()=>{
  const o:ArenaObstacle={id:'crack',kind:'collapse-platform',x:0,y:0,z:0,width:5,depth:5,delay:.9,warning:.4,resetAfter:3,period:1};
  const a=fixture(o,false),s=createPlayer(a);run(a,s,.65);const trigger=s.collapseTimes.crack;
  expect(trigger).toBeGreaterThan(0);expect(sampleMechanism(o,s.elapsed,undefined,trigger).phase).toBe('warning');
  run(a,s,.4);expect(s.grounded).toBe(false);expect(s.y).toBeLessThan(0);
  expect(sampleMechanism(o,trigger+4,undefined,trigger).phase).toBe('safe');
  const fresh=createPlayer(a);stepArenaPlayer(fresh,idleInput,FIXED_STEP,a);expect(fresh.grounded).toBe(true);
 });
 it('runtime reuses surface arrays, surface objects and pose buffers',()=>{
  const a=fixture({id:'belt',kind:'conveyor',x:0,y:0,z:0,width:5,depth:5,velocityX:1,velocityZ:0,period:1}),world=new ArenaRuntime(a);
  const first=world.surfaces(0),floor=first[0],belt=first[1],pose=world.entries[0].now;
  const second=world.surfaces(.1,0);expect(second).toBe(first);expect(second[0]).toBe(floor);expect(second[1]).toBe(belt);expect(world.entries[0].now).toBe(pose);
 });
 it('full-round air control is tuned without reducing the original run speed or training response',()=>{
  const a=fixture({id:'belt',kind:'conveyor',x:20,y:0,z:0,width:1,depth:1,velocityX:0,velocityZ:0,period:1});
  const s=createPlayer(a);Object.assign(s,{y:2,grounded:false,coyote:0});stepArenaPlayer(s,{x:1,z:0,jump:false},FIXED_STEP,a);expect(s.vx).toBeCloseTo(34*.8*FIXED_STEP);
  const ground=createPlayer(a);run(a,ground,.25,{x:1,z:0,jump:false});expect(ground.vx).toBeCloseTo(6);
 });
});
