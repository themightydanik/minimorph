import { expect,it } from 'vitest';
import { createPlayer } from './physics';
import { PresentationEvents } from './presentation-events';
import type { PresentationEvent } from './presentation-events';
it('suppresses serial/checkpoint/win replays and action rewinds during prediction reconciliation',()=>{
 const output:PresentationEvent[]=[],events=new PresentationEvents(e=>output.push(e)),s=createPlayer();events.observe('local',s);
 Object.assign(s,{elapsed:.1,eventSerial:1,lastEvent:'jump'});events.observe('local',s);events.observe('local',s);
 Object.assign(s,{elapsed:.2,action:'dive'});events.observe('local',s);
 Object.assign(s,{elapsed:.1,action:'normal',eventSerial:0});events.observe('local',s);
 Object.assign(s,{elapsed:.25,action:'dive',eventSerial:1});events.observe('local',s);
 Object.assign(s,{elapsed:.3,action:'slide'});events.observe('local',s);
 Object.assign(s,{elapsed:.5,checkpoint:1,checkpointSerial:1});events.observe('local',s);
 Object.assign(s,{elapsed:.4,checkpoint:0});events.observe('local',s);
 Object.assign(s,{elapsed:.6,checkpoint:1,won:true});events.observe('local',s);
 s.won=false;events.observe('local',s);s.won=true;events.observe('local',s);
 expect(output.map(e=>e.kind)).toEqual(['jump','dive','slide','checkpoint','finish','victory']);
});
it('seeds remote joins without replay and emits a later authoritative action once per participant',()=>{
 const output:PresentationEvent[]=[],events=new PresentationEvents(e=>output.push(e)),s=createPlayer();
 Object.assign(s,{elapsed:2,action:'dive',eventSerial:3});events.observe('remote',s,true);expect(output).toHaveLength(0);
 Object.assign(s,{elapsed:2.2,action:'slide'});events.observe('remote',s,true);events.observe('remote',s,true);
 expect(output).toHaveLength(1);expect(output[0]).toMatchObject({playerId:'remote',remote:true,kind:'slide'});
 s.action='normal';s.elapsed=3.2;events.observe('remote',s,true);s.action='dive';s.elapsed=3.4;events.observe('remote',s,true);
 expect(output.map(e=>e.kind)).toEqual(['slide','dive']);
 events.reset();s.eventSerial=0;s.action='normal';events.observe('remote',s,true);s.eventSerial=1;s.lastEvent='land';events.observe('remote',s,true);expect(output.at(-1)!.kind).toBe('land');
});
