import type { ArenaConfig, ArenaObstacle, Platform } from '@minimorph/game-content';
export interface CollisionSurface extends Platform { previousY?: number; priority?: number }
export type MechanismPhase = 'safe' | 'warning' | 'active' | 'hidden';
export interface MechanismPose { x:number; y:number; z:number; angle:number; phase:MechanismPhase }
export function cycle(o:ArenaObstacle,time:number):number {
 const t=((time+(o.phase??0))%o.period+o.period)%o.period;
 // Decimal periods can wrap to period-epsilon at an exact cycle boundary.
 // Canonicalize only sub-nanosecond roundoff, equally on server and renderer.
 return t<1e-10||o.period-t<1e-10?0:t;
}
/** A caller-supplied output keeps the fixed-step and renderer paths allocation-free. */
export function sampleMechanism(o:ArenaObstacle,time:number,out:MechanismPose={x:0,y:0,z:0,angle:0,phase:'safe'},triggerTime?:number):MechanismPose {
 const p=out;p.x=o.x;p.y=o.y;p.z=o.z;p.angle=0;p.phase='safe';
 const t=cycle(o,time);
 if(o.kind==='moving-platform'||o.kind==='sliding-block')p[o.axis]+=Math.sin(t/o.period*Math.PI*2)*o.amplitude;
 if(o.kind==='moving-wall')p.x+=Math.sin(t/o.period*Math.PI*2)*o.amplitude;
 if(o.kind==='sweeper'||o.kind==='rotating-disc')p.angle=t/o.period*Math.PI*2;
 if(o.kind==='pendulum'){p.angle=Math.sin(t/o.period*Math.PI*2)*o.swing;p.x+=Math.sin(p.angle)*o.length;p.y+=o.radius+o.length*(1-Math.cos(p.angle));}
 if(o.kind==='bounce-platform')p.y+=Math.sin(t/o.period*Math.PI*2)*o.amplitude;
 if(o.kind==='disappearing-platform')p.phase=t>=o.onFor?'hidden':t>=o.onFor-o.warning?'warning':'safe';
 if(o.kind==='laser'||o.kind==='timed-gate'||o.kind==='pusher')p.phase=t>=o.period-o.activeFor?'active':t>=o.period-o.activeFor-o.warning?'warning':'safe';
 if(o.kind==='pusher'&&p.phase==='active'){const u=(t-(o.period-o.activeFor))/o.activeFor;p.x-=o.side*o.reach*Math.max(0,Math.min(1,u*4,(1-u)*4));}
 if(o.kind==='collapse-platform'&&triggerTime!==undefined){const age=time-triggerTime;if(age<o.delay)p.phase=age>=o.delay-o.warning?'warning':'safe';else if(age<o.delay+o.resetAfter){p.phase='hidden';p.y-=Math.min(8,(age-o.delay)*5);}}
 return p;
}
function hasSurface(o:ArenaObstacle){return ['moving-platform','disappearing-platform','rotating-disc','conveyor','bounce-platform','collapse-platform'].includes(o.kind);}
export function surfaceContains(p:Platform,x:number,z:number):boolean{return p.radius!==undefined?Math.hypot(x-p.x,z-p.z)<=p.radius:Math.abs(x-p.x)<=p.width/2&&Math.abs(z-p.z)<=p.depth/2;}
/** Owned by a player/run; surfaces, sample outputs and active lists are reused every tick. */
export class ArenaRuntime {
 readonly active:CollisionSurface[]=[];
 readonly staticSurfaces:CollisionSurface[];
 readonly entries: {o:ArenaObstacle;now:MechanismPose;before:MechanismPose;surface?:CollisionSurface}[];
 readonly byId:Map<string,typeof this.entries[number]>;
 readonly delta={x:0,y:0,z:0};
 constructor(readonly arena:ArenaConfig){
  this.staticSurfaces=arena.platforms.map((p,i)=>({...p,id:`deck-${i}`}));
  this.entries=arena.mechanisms.map(o=>({o,now:{x:0,y:0,z:0,angle:0,phase:'safe'},before:{x:0,y:0,z:0,angle:0,phase:'safe'},surface:hasSurface(o)?{id:o.id,x:o.x,y:o.y,z:o.z,width:o.kind==='rotating-disc'?o.radius*2:'width'in o?o.width:0,depth:o.kind==='rotating-disc'?o.radius*2:'depth'in o?o.depth:0,radius:o.kind==='rotating-disc'?o.radius:undefined,priority:o.kind==='conveyor'?2:1}:undefined}));
  this.byId=new Map(this.entries.map(e=>[e.o.id,e]));
 }
 surfaces(time:number,previousTime=time,collapseTimes:Record<string,number>={},nearZ?:number):CollisionSurface[]{
  const result=this.active;result.length=0;
  for(const s of this.staticSurfaces)if(nearZ===undefined||Math.abs(s.z-nearZ)<s.depth/2+20)result.push(s);
  for(const e of this.entries){
   if(!e.surface||(nearZ!==undefined&&Math.abs(e.o.z-nearZ)>32))continue;
   const p=sampleMechanism(e.o,time,e.now,collapseTimes[e.o.id]);if(p.phase==='hidden')continue;
   const b=sampleMechanism(e.o,previousTime,e.before,collapseTimes[e.o.id]),s=e.surface;
   s.x=p.x;s.y=p.y;s.z=p.z;s.previousY=b.y;result.push(s);
  }
  return result;
 }
 displacement(id:string,time:number,dt:number,x:number,z:number){const e=this.byId.get(id);if(!e)return this.zero();return supportDisplacement(e.o,time,dt,x,z,this.delta,e.before,e.now);}
 private zero(){this.delta.x=this.delta.y=this.delta.z=0;return this.delta;}
}
export function arenaSurfaces(arena:ArenaConfig,time:number,previousTime=time):CollisionSurface[]{return new ArenaRuntime(arena).surfaces(time,previousTime);}
export function supportDisplacement(o:ArenaObstacle,time:number,dt:number,x:number,z:number,out={x:0,y:0,z:0},before?:MechanismPose,after?:MechanismPose){
 if(o.kind==='conveyor'){out.x=o.velocityX*dt;out.y=0;out.z=o.velocityZ*dt;return out;}
 const a=sampleMechanism(o,time,before),b=sampleMechanism(o,time+dt,after);
 if(o.kind==='rotating-disc'){const angle=dt/o.period*Math.PI*2,dx=x-o.x,dz=z-o.z;out.x=dx*Math.cos(angle)-dz*Math.sin(angle)-dx;out.y=0;out.z=dx*Math.sin(angle)+dz*Math.cos(angle)-dz;}
 else{out.x=b.x-a.x;out.y=b.y-a.y;out.z=b.z-a.z;}return out;
}
export function mechanismContact(o:ArenaObstacle,time:number,player:{x:number;y:number;z:number},radius=.25,pose?:MechanismPose):boolean{
 const p=pose??sampleMechanism(o,time);
 if(o.kind==='pendulum')return Math.hypot(player.x-p.x,player.z-p.z)<radius+o.radius&&player.y<p.y+o.radius&&player.y+1.7>p.y-o.radius;
 if(o.kind!=='sweeper'&&o.kind!=='sliding-block'&&o.kind!=='laser'&&o.kind!=='moving-wall'&&o.kind!=='timed-gate'&&o.kind!=='pusher')return false;
 if((o.kind==='laser'||o.kind==='timed-gate'||o.kind==='pusher')&&p.phase!=='active')return false;
 if(player.y>=p.y+o.height||player.y+1.7<=p.y)return false;
 const dx=player.x-p.x,dz=player.z-p.z;
 if(o.kind==='sweeper'){const along=dx*Math.cos(p.angle)+dz*Math.sin(p.angle),across=-dx*Math.sin(p.angle)+dz*Math.cos(p.angle);return Math.hypot(Math.max(0,Math.abs(along)-o.length/2),across)<o.width/2+radius;}
 if(o.kind==='pusher'&&Math.abs(dz)<.25+radius&&player.x>=Math.min(p.x,o.x)-radius&&player.x<=Math.max(p.x,o.x)+radius)return true;
 if(o.kind==='moving-wall'&&Math.abs(dx)<o.gap/2-radius)return false;
 return Math.abs(dx)<o.width/2+radius&&Math.abs(dz)<o.depth/2+radius;
}
