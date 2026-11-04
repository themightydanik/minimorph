import { it, expect } from "vitest";
import { arenas } from "@minimorph/game-content";
import { Room } from "./matches";
for (const arena of arenas)
  it(`server bots navigate ${arena.id} through real physics from eight safe slots`, () => {
    const room = new Room(arena.id, undefined, 0, 0);
    for (let i = 0; i < 8; i++)
      room.add(`Bot ${i}`, true, (["easy", "normal", "hard"] as const)[i % 3]);
    for (
      let tick = 0;
      tick < 30 * 240 && room.participants.some((p) => p.status === "racing");
      tick++
    )
      room.simulate();
    expect(
      new Set(room.participants.map((p) => p.state.collapseTimes)).size,
    ).toBe(1);
    expect(Object.keys(room.collapseTimes).length).toBeGreaterThan(0);
    for (const p of room.participants)
      expect(
        p.state.won,
        JSON.stringify({ name: p.name, state: p.state }),
      ).toBe(true);
  });
