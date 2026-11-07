import { arenas, getArena, trainingArenas } from '@minimorph/game-content';
import type { ArenaConfig, RaceMode } from '@minimorph/game-content';
export class LevelManager {
 current:ArenaConfig;
 constructor(id=arenas[0].id,public mode:RaceMode='race',private readonly localArena?:ArenaConfig){this.current=localArena?structuredClone(localArena):getArena(id,mode);}
 load(id:string,mode=this.mode){if(this.localArena){if(id!==this.localArena.id)throw new Error("Local Playtest cannot change arenas");this.current=structuredClone(this.localArena);return this.current;}const next=getArena(id,mode);this.mode=mode;this.current=next;return next;}
 next(){if(this.localArena)return undefined;const list=this.mode==='training'?trainingArenas:arenas;return list[list.indexOf(this.current)+1];}
}
