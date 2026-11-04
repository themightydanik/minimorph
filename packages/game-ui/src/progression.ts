import type { RaceMode } from "@minimorph/game-content";
import { arenas } from '@minimorph/game-content';
export const PROGRESS_KEY = 'minimorph.progress.v2';
export const TRAINING_PROGRESS_KEY = 'minimorph.progress.v1';
interface Progress { version: 1 | 2; unlocked: number; best: Record<string, number> }
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export class Progression {
  value: Progress;
  private key: string;
  persistent: boolean;
  constructor(private store?: Store, mode: RaceMode = "race") {
    this.key = mode === "training" ? TRAINING_PROGRESS_KEY : PROGRESS_KEY;
    this.value = { version: mode === "training" ? 1 : 2, unlocked: 1, best: {} };
    this.persistent = !!store;
    let raw: string | null | undefined;
    try { raw = store?.getItem(this.key); } catch { this.persistent = false; return; }
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as Partial<Progress>;
      if (p.version !== this.value.version || !Number.isInteger(p.unlocked) || typeof p.unlocked !== 'number' || p.unlocked < 1 || p.unlocked > arenas.length) return;
      this.value.unlocked = p.unlocked;
      for (const arena of arenas) {
        const time = p.best?.[arena.id];
        if (typeof time === 'number' && Number.isFinite(time) && time > 0 && time < 86400) this.value.best[arena.id] = time;
      }
    } catch { /* Corrupt saved JSON resets progress; storage may still be writable. */ }
  }
  isUnlocked(id: string) { return arenas.slice(0, this.value.unlocked).some(a => a.id === id); }
  complete(id: string, seconds: number): boolean {
    const index = arenas.findIndex(a => a.id === id);
    if (index < 0 || !this.isUnlocked(id) || !Number.isFinite(seconds) || seconds <= 0 || seconds >= 86400) return false;
    const previous = this.value.best[id];
    const improved = previous === undefined || seconds < previous;
    this.value.best[id] = Math.min(previous ?? Infinity, seconds);
    this.value.unlocked = Math.max(this.value.unlocked, Math.min(arenas.length, index + 2));
    try { this.store?.setItem(this.key, JSON.stringify(this.value)); } catch { this.persistent = false; }
    return improved;
  }
}
export function localProgression(mode: RaceMode = "race") {
  try { return new Progression(window.localStorage, mode); } catch { return new Progression(undefined, mode); }
}
export function formatTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6000);
  return `${String(minutes).padStart(2, '0')}:${((centiseconds % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}
