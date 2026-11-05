import type { RoomSnapshot } from "@minimorph/multiplayer-protocol";
import type { SoundCue } from "./audio";
/** A reconnect seeds existing decisions silently. Repeated snapshots never replay a decision. */
export class TournamentFeedback {
  private scope = "";
  private seen = new Set<string>();
  private entries(s: RoomSnapshot, id: string): [string, SoundCue][] {
    const t = s.tournament;
    if (!t) return [];
    const entries: [string, SoundCue][] = [];
    const me = s.participants.find((p) => p.id === id);
    if (
      me?.finishTime !== null &&
      me?.finishTime !== undefined &&
      t.activeIds.includes(id)
    )
      entries.push([`finish:${t.round}`, "finish"]);
    for (const r of t.history) {
      const own = r.rows.find((p) => p.id === id);
      if (own?.status === "finished")
        entries.push([`finish:${r.round}`, "finish"]);
      if (r.round < 3 && own)
        entries.push([
          `qualification:${r.round}`,
          r.qualifiedIds.includes(id) ? "checkpoint" : "collision",
        ]);
    }
    if (t.round === 3) entries.push(["final-round", "start"]);
    if (t.championId) entries.push(["champion", "victory"]);
    return entries;
  }
  private reset(s: RoomSnapshot) {
    const scope = `${s.roomId}:${s.tournament?.edition ?? 0}`;
    if (scope !== this.scope) {
      this.scope = scope;
      this.seen.clear();
    }
  }
  seed(s: RoomSnapshot, id: string) {
    this.reset(s);
    for (const [key] of this.entries(s, id)) this.seen.add(key);
  }
  observe(s: RoomSnapshot, id: string): SoundCue[] {
    this.reset(s);
    const cues: SoundCue[] = [];
    for (const [key, cue] of this.entries(s, id))
      if (!this.seen.has(key)) {
        this.seen.add(key);
        cues.push(cue);
      }
    return cues;
  }
}
