import type { PlayerState } from './physics';
export type PresentationCue = 'jump' | 'land' | 'dive' | 'slide' | 'collision' | 'checkpoint' | 'finish' | 'victory';
export interface PresentationEvent { kind: PresentationCue; playerId: string; remote: boolean; x: number; y: number; z: number; }
interface Cursor { serial: number; checkpoint: number; respawns: number; elapsed: number; action: PlayerState['action']; diveAt: number; slideAt: number; won: boolean; }
/** Session-scoped high-water marks survive reconciliation and visual reconnects. No wire changes. */
export class PresentationEvents {
  private readonly players = new Map<string, Cursor>();
  constructor(private emit: (event: PresentationEvent) => void) {}
  reset() { this.players.clear(); }
  private send(kind: PresentationCue, id: string, state: Readonly<PlayerState>, remote: boolean) {
    this.emit({ kind, playerId: id, remote, x: state.x, y: state.y, z: state.z });
  }
  observe(id: string, state: Readonly<PlayerState>, remote = false) {
    let cursor = this.players.get(id);
    if (!cursor) {
      // Joining/reconnecting mid-action must not replay old sounds or explosions.
      cursor = { serial: state.eventSerial, checkpoint: state.checkpoint, respawns: state.respawns, elapsed: state.elapsed, action: state.action, diveAt: state.action === 'dive' || state.action === 'slide' ? state.elapsed : -Infinity, slideAt: state.action === 'slide' ? state.elapsed : -Infinity, won: state.won };
      if (this.players.size >= 16) this.players.delete(this.players.keys().next().value!);
      this.players.set(id, cursor); return;
    }
    const forward = state.elapsed >= cursor.elapsed - 1 / 120;
    if (state.eventSerial > cursor.serial) {
      cursor.serial = state.eventSerial;
      if (state.lastEvent === 'jump' || state.lastEvent === 'pad') this.send('jump', id, state, remote);
      if (state.lastEvent === 'land') this.send('land', id, state, remote);
      if (state.lastEvent === 'hit') this.send('collision', id, state, remote);
    }
    if (state.checkpoint > cursor.checkpoint) { cursor.checkpoint = state.checkpoint; this.send('checkpoint', id, state, remote); }
    if (forward && state.action !== cursor.action) {
      if ((state.action === 'dive' || state.action === 'slide' && cursor.action === 'normal') && state.elapsed - cursor.diveAt >= 1) { cursor.diveAt = state.elapsed; this.send('dive', id, state, remote); }
      if (state.action === 'slide' && state.elapsed - cursor.slideAt >= 1) { cursor.slideAt = state.elapsed; this.send('slide', id, state, remote); }
    }
    if (state.won && !cursor.won) { cursor.won = true; this.send('finish', id, state, remote); this.send('victory', id, state, remote); }
    cursor.elapsed = Math.max(cursor.elapsed, state.elapsed);
    cursor.respawns = Math.max(cursor.respawns, state.respawns);
    cursor.action = state.action;
  }
}
