export type RacePhase = 'selection' | 'prepare' | 'countdown' | 'racing' | 'paused' | 'finished';
export interface RaceSnapshot { phase: RacePhase; arenaId: string; countdown: number; go: boolean }
/** Shared by both hosts. Only racing advances player physics and the race timer. */
export class RaceSession {
  phase: RacePhase;
  arenaId: string;
  remaining = 0;
  goTime = 0;
  constructor(arenaId: string, menu = true) { this.arenaId = arenaId; this.phase = menu ? 'selection' : 'racing'; }
  select(id: string) { this.arenaId = id; this.phase = 'prepare'; this.remaining = this.goTime = 0; }
  start() { if (this.phase === 'prepare' || this.phase === 'paused') { this.phase = 'countdown'; this.remaining = 3; } }
  tick(dt: number) {
    if (this.phase === 'countdown') {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining <= 1e-8) { this.phase = 'racing'; this.goTime = 0.5; }
    } else if (this.phase === 'racing') this.goTime = Math.max(0, this.goTime - dt);
  }
  finish() { if (this.phase === 'racing') this.phase = 'finished'; }
  pause() { if (this.phase === 'racing' || this.phase === 'countdown') { this.phase = 'paused'; this.goTime = 0; } }
  choose() { this.phase = 'selection'; this.remaining = this.goTime = 0; }
  snapshot(): RaceSnapshot { return { phase: this.phase, arenaId: this.arenaId, countdown: Math.ceil(Math.max(0, this.remaining - 1e-6)), go: this.goTime > 0 }; }
}
