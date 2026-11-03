import { trainingArenas, getTrainingArena } from './arenas';
import type { ArenaConfig, ArenaObstacle, ArenaSection, RaceMode } from './arenas';
import type { Platform } from './legacy';
type Theme = 'rotors' | 'pendulums' | 'walls' | 'belts' | 'shuttles' | 'bounce' | 'pulse' | 'collapse';
const sectionNames: Record<Theme, [string,string]> = {
 rotors:['Rotor runway','Jump the low bars or take the wider outside line.'],
 pendulums:['Pendulum crossing','Watch the swing; the glowing floor marks its crossing.'],
 walls:['Sliding windows','Follow the bright openings. Solid walls cannot be rushed through.'],
 belts:['Cross-current belts','Counter-steer across the belts. The outer boost lane is faster but exposed.'],
 shuttles:['Shuttle junction','Jump aboard the central shuttles, or use the longer outside bridge.'],
 bounce:['Bounce gardens','Land on the spring decks, then steer your next landing.'],
 pulse:['Pulse gauntlet','Read the gate signals. Green is open; amber warns before closing.'],
 collapse:['Crumbling causeway','Keep moving on cracked decks. Amber warns before they fall.'],
};
/** Each section is authored in metres; no speed reductions, fixed delays or repeated short-course copies. */
function buildRound(base: ArenaConfig, length: number, themes: Theme[]): ArenaConfig {
 const platforms: Platform[]=[], mechanisms: ArenaObstacle[]=[], sections: ArenaSection[]=[], checkpoints=[];
 const routes: ArenaConfig['routes'][number][]=[];
 const addDeck=(a:number,b:number,width:number,x=0)=>platforms.push({x,y:0,z:-(a+b)/2,width,depth:b-a});
 const add=(o:ArenaObstacle)=>mechanisms.push(o);
 addDeck(-6,0,10);
 for(const [i,theme] of themes.entries()) {
  const start=i*length, end=start+length, id=`${base.id}-${i}`, width=base.id==='gravity-mayhem'?6:base.id==='orbit-chaos'?8:10;
  sections.push({id,name:`${String(i+1).padStart(2,'0')} · ${sectionNames[theme][0]}`,start,end,hint:sectionNames[theme][1],cameraDistance:theme==='walls'||theme==='pendulums'?1.8:0.5,cameraLift:theme==='bounce'?1.1:.25});
  const common=(tag:string,d:number)=>({id:`${id}-${tag}`,x:0,y:0,z:-(start+d),period:4,phase:i*.37});
  if(theme==='shuttles') {
   addDeck(start,start+12,width); addDeck(start+24,start+38,width); addDeck(start+40,end,width);
   add({...common('shuttle',18),kind:'moving-platform',width:5,depth:8.5,axis:'z',amplitude:2,period:4.5});
   // An actual longer safe branch around the mandatory central gap.
   addDeck(start+6,start+12,width+8,3); addDeck(start+12,start+34,3,7); addDeck(start+32,start+38,width+8,3);
   routes.push({name:`${i+1}: Outer bridge / central shortcut`,points:[{x:7,y:0,z:-(start+9)},{x:7,y:0,z:-(start+33)},{x:0,y:0,z:-(start+30)}]});
   add({...common('rotor',32),kind:'sweeper',x:1.8,length:5,width:.28,height:.45,period:4.8});
  } else if(theme==='bounce') {
   addDeck(start,start+10,width); addDeck(start+22,start+28,width); addDeck(start+40,end,width);
   for(const d of [16,34]) add({...common(`spring-${d}`,d),kind:'bounce-platform',width:6,depth:5,amplitude:.22,boost:12,period:2.6});
   add({...common('pusher',46),kind:'pusher',x:-6,side:-1,reach:6,width:1,depth:1.4,height:.8,period:4.2,warning:.7,activeFor:.9});
  } else {
   addDeck(start,start+12,width);
   if(theme!=='collapse'&&theme!=='pulse') addDeck(start+14,start+24,width);
   else for(const d of [16.5,21.5]) add({...common(`crack-${d}`,d),kind:'collapse-platform',width:width-1,depth:5,period:1,delay:.9,warning:.4,resetAfter:3});
   addDeck(start+26,start+38,width); addDeck(start+40,end,width);
   if(theme==='rotors') for(const d of [6,20,32,46]) add({...common(`bar-${d}`,d),kind:'sweeper',x:2.2,length:i>3?6:4.8,width:.28,height:.48,period:4.8-i*.15});
   if(theme==='pendulums') for(const d of [7,32,46]) add({...common(`swing-${d}`,d),kind:'pendulum',length:3.6,radius:.6,swing:.8,period:3.8+(d%3)*.35});
   if(theme==='walls') for(const d of [8,30,46]) add({...common(`window-${d}`,d),kind:'moving-wall',width:width+2,depth:.65,height:2.6,gap:3,amplitude:1.8,period:5.5});
   if(theme==='belts') {
    for(const [j,d] of [6,20,32,46].entries()) add({...common(`belt-${d}`,d),kind:'conveyor',width,depth:7,velocityX:j%2?-1.7:1.7,velocityZ:0});
    // Risk/reward fast lane: real forward surface velocity, no hidden speed changes.
    add({...common('fast-belt',length/2),kind:'conveyor',x:width/2-1.1,width:1.7,depth:length-4,velocityX:0,velocityZ:-2});
    routes.push({name:`${i+1}: Exposed boost lane`,points:[{x:width/2-1.1,y:0,z:-(start+41)},{x:width/2-1.1,y:0,z:-(end-2)}]});
   }
   if(theme==='pulse'||theme==='collapse') {
    for(const d of [7,45]) add({...common(`gate-${d}`,d),kind:'timed-gate',width:width+.5,depth:.5,height:2.6,period:3.6,warning:.6,activeFor:.65});
    add({...common('pusher',32),kind:'pusher',x:5.5,side:1,reach:5.5,width:1,depth:1.5,height:.85,period:3.9,warning:.7,activeFor:1});
    if(theme==='collapse') add({...common('rotor',47),kind:'sweeper',x:1.8,length:5,width:.25,height:.45,period:4});
   }
  }
  if(i<themes.length-1) checkpoints.push({x:0,y:0,z:-(end-2),radius:1.75});
 }
 const distance=length*themes.length;
 addDeck(distance,distance+10,10);
 routes.unshift({name:'Main racing line',points:[{x:0,y:0,z:2},...checkpoints,{x:0,y:0,z:-(distance+5)}]});
 return {...base,airControl:.8,spawn:{x:0,y:0,z:2},finish:{x:0,y:0,z:-(distance+5),radius:1.7},checkpoints,platforms,obstacles:[],mechanisms,sections,routes,expectedSeconds:[60,90],description:`${base.name}: ${themes.length} obstacle sections, safe sector checkpoints and a 60–90 second racing round. Follow sector signals, choose your route and keep momentum.`};
}
export const arenas: readonly ArenaConfig[] = [
 buildRound(trainingArenas[0],54,['rotors','belts','pendulums','walls','shuttles','bounce','pulse']),
 buildRound(trainingArenas[1],58,['belts','pendulums','walls','shuttles','rotors','bounce','pulse']),
 buildRound(trainingArenas[2],54,['collapse','pendulums','walls','belts','shuttles','bounce','pulse','collapse']),
];
export function getArena(id:string, mode:RaceMode='race'):ArenaConfig {
 if(mode==='training')return getTrainingArena(id);
 const arena=arenas.find(a=>a.id===id);if(!arena)throw new Error(`Unknown arena: ${id}`);return arena;
}
