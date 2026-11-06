import { recordPark } from './park-pilot';
/** Test-only driver: emits ordinary digital controls, never writes player state or changes hazards. */
import type { ArenaConfig } from '@minimorph/game-content';
import { createPlayer, stepArenaPlayer, FIXED_STEP } from '../../packages/game-engine/src/physics';
import { ArenaRuntime, sampleMechanism, surfaceContains } from '../../packages/game-engine/src/obstacles';
import type { RunSegment } from './arena-runs';
export function recordRound(arena:ArenaConfig, strategy:'main'|'boost'|'outer'|'safe'='main') {
 if(arena.navigation)return recordPark(arena,strategy==='safe'?'easy':'hard');
 const state=createPlayer(arena), world=new ArenaRuntime(arena), segments:RunSegment[]=[], events=new Set<string>();
 let lastSupport:string|null=null, maxY=state.y;
 const supports=new Set<string>(), branches=new Set<string>();
 for(let block=0;block<1500&&!state.won;block++) {
  const distance=-state.z, surfaces=world.surfaces(state.elapsed,state.elapsed,state.collapseTimes,state.z);
  const support=surfaces.find(s=>s.id===state.supportId)??surfaces.find(s=>surfaceContains(s,state.x,state.z)&&Math.abs(s.y-state.y)<.02);
  if(support){lastSupport=support.id??null;if(support.id)supports.add(support.id);}
  maxY=Math.max(maxY,state.y);
  for(const b of arena.branches??[])if(distance>b.start&&distance<b.end&&Math.abs(state.x-b.x)<.7&&state.grounded)branches.add(b.id);
  let target=0,z=-1;
  const rotor=arena.mechanisms.find(o=>o.kind==='sweeper'&&-o.z-distance>-3&&-o.z-distance<8);
  if(rotor)target=-1.8;
  const wall=arena.mechanisms.find(o=>o.kind==='moving-wall'&&-o.z-distance>-.9&&-o.z-distance<10);
  if(wall?.kind==='moving-wall')target=sampleMechanism(wall,state.elapsed+Math.max(0,-wall.z-distance)/5.2).x;
  const section=arena.sections?.find(s=>distance>=s.start&&distance<s.end);
  if(strategy==='boost'&&section?.hint.includes('outer boost')&&distance-section.start>2&&distance-section.start<section.end-section.start-8)target=arena.id==='gravity-mayhem'?1.9:arena.id==='orbit-chaos'?2.9:3.9;
  if(strategy==='outer'&&section?.hint.includes('central shuttles')&&distance-section.start>2&&distance-section.start<33)target=7;
  const safe=arena.branches?.find(b=>b.skill==='easy'&&distance>b.start&&distance<b.end);
  if(strategy==='safe'&&safe)target=safe.x;
  const belt=arena.mechanisms.find(o=>o.id===state.supportId&&o.kind==='conveyor');
  const flow=belt?.kind==='conveyor'?belt.velocityX:0;
  const error=target-state.x-state.vx*.12-flow*.2;
  const x=Math.abs(error)>.2?Math.sign(error):0;
  for(const o of arena.mechanisms)if(o.kind==='timed-gate') {
   const dz=-o.z-distance;
   if(dz>0&&dz<2.2&&(sampleMechanism(o,state.elapsed).phase==='active'||sampleMechanism(o,state.elapsed+dz/5+.12).phase==='active'))z=0;
  }
  let jump=false;
  if(state.grounded||state.coyote>0) {
   if(!state.grounded&&state.coyote>0)jump=true;
   if(support){
    const boundary=support.z-(support.radius?Math.sqrt(Math.max(0,support.radius**2-(state.x-support.x)**2)):support.depth/2);
    const contiguous=surfaces.some(s=>s.id!==support.id&&surfaceContains(s,state.x,boundary-.08)&&Math.abs(s.y-state.y)<.5);
    if(!contiguous&&state.z-boundary<1.0)jump=true;
   }
   for(const o of arena.mechanisms) {
    const dz=-o.z-distance;
    if((['pendulum','sliding-block','pusher'].includes(o.kind)||o.kind==='sweeper'&&Math.abs(state.x-o.x)<o.length/2+.45)&&dz>0&&dz<(o.kind==='pendulum'?3:2.7)&&z!==0)jump=true;
    if(o.kind==='collapse-platform'&&state.supportId===o.id&&state.elapsed-(state.collapseTimes[o.id]??state.elapsed)>o.delay-.35)jump=true;
   }
  }
  const keys=[...(z<0?['KeyW']:[]),...(x<0?['KeyA']:x>0?['KeyD']:[])];
  const last=segments[segments.length-1];
  if(last&&!jump&&last.keys.join()===keys.join())last.seconds=Math.round((last.seconds+.1)*10)/10;
  else segments.push({seconds:.1,keys,jump});
  for(let tick=0;tick<12;tick++)stepArenaPlayer(state,{x,z,jump:jump&&tick===0},FIXED_STEP,arena,world);
  if(state.lastEvent)events.add(state.lastEvent);
  if(state.falls>0)return {segments,state,events:[...events],lastSupport,maxY,supports:[...supports],branches:[...branches]};
 }
 return {segments,state,events:[...events],lastSupport,maxY,supports:[...supports],branches:[...branches]};
}
