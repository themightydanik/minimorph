import { arenas, getArena, trainingArenas } from '@minimorph/game-content';
import type { ArenaConfig, RaceMode } from '@minimorph/game-content';
export class LevelManager {
 current:ArenaConfig;
 constructor(id=arenas[0].id,public mode:RaceMode='race'){this.current=getArena(id,mode);}
 load(id:string,mode=this.mode){const next=getArena(id,mode);this.mode=mode;this.current=next;return next;}
 next(){const list=this.mode==='training'?trainingArenas:arenas;return list[list.indexOf(this.current)+1];}
}
