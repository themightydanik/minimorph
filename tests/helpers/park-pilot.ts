import type { ArenaConfig } from "@minimorph/game-content";
import {
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
  ArenaRuntime,
  navigatePark,
} from "@minimorph/game-simulation";
import type { RunSegment } from "./arena-runs";
/** Test recording from ordinary digital controls, with no writes to player state. */
export function recordPark(
  arena: ArenaConfig,
  choice: "easy" | "hard" = "hard",
) {
  const state = createPlayer(arena),
    world = new ArenaRuntime(arena),
    segments: RunSegment[] = [],
    supports = new Set<string>(),
    events = new Set<string>();
  let maxY = 0,
    lastSupport: string | null = null;
  for (let block = 0; block < 2400 && !state.won; block++) {
    const input = navigatePark(state, arena, world, choice),
      keys = [
        ...(input.z < 0 ? ["KeyW"] : input.z > 0 ? ["KeyS"] : []),
        ...(input.x < 0 ? ["KeyA"] : input.x > 0 ? ["KeyD"] : []),
      ];
    const last = segments.at(-1);
    if (last && !input.jump && last.keys.join() === keys.join())
      last.seconds = Math.round((last.seconds + 0.1) * 10) / 10;
    else segments.push({ seconds: 0.1, keys, jump: input.jump });
    for (let tick = 0; tick < 12; tick++) {
      stepArenaPlayer(
        state,
        { ...input, jump: input.jump && tick === 0 },
        FIXED_STEP,
        arena,
        world,
      );
      if (state.supportId) {
        supports.add(state.supportId);
        lastSupport = state.supportId;
      }
      if (state.lastEvent) events.add(state.lastEvent);
      maxY = Math.max(maxY, state.y);
    }
  }
  return {
    segments,
    state,
    maxY,
    supports: [...supports],
    events: [...events],
    lastSupport,
    branches: [choice === "easy" ? "bounce-garden" : "turbo-lane"],
  };
}
