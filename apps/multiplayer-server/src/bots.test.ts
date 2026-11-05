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
it('hard bots dive only on descent into a long safe deck and respect action locks', async () => {
  const { botInput } = await import('./bots');
  const { createPlayer, ArenaRuntime } = await import('@minimorph/game-simulation');
  const arena = { ...arenas[0], mechanisms: [], obstacles: [], platforms: [{ id: 'safe', x: 0, y: 0, z: 0, width: 10, depth: 40 }] };
  const world = new ArenaRuntime(arena), state = createPlayer(arena);
  Object.assign(state, { x: 0, z: 0, y: .5, grounded: false, vy: -2, coyote: 0 });
  expect(botInput(state, arena, world, 'hard').dive).toBe(true);
  state.vy = 2; expect(botInput(state, arena, world, 'hard').dive).toBe(false);
  state.action = 'recover'; expect(botInput(state, arena, world, 'hard')).toMatchObject({ jump: false, dive: false, x: 0, z: 0 });
});
