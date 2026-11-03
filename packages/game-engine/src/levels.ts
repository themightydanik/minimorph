import { arenas, getArena } from '@minimorph/game-content';
import type { ArenaConfig } from '@minimorph/game-content';
/** Configuration ownership; scene/physics consume the same selected object. */
export class LevelManager {
  current: ArenaConfig;
  constructor(id = arenas[0].id) { this.current = getArena(id); }
  load(id: string): ArenaConfig { this.current = getArena(id); return this.current; }
  next(): ArenaConfig | undefined { return arenas[arenas.indexOf(this.current) + 1]; }
}
