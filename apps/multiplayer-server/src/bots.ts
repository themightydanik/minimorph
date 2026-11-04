import type { ArenaConfig } from "@minimorph/game-content";
import {
  ArenaRuntime,
  sampleMechanism,
  surfaceContains,
} from "@minimorph/game-simulation";
import type { PlayerState, Input } from "@minimorph/game-simulation";
import type { Skill } from "@minimorph/multiplayer-protocol";
/** Reactive navigation: reads geometry/phases, emits only ordinary inputs; never mutates a participant. */
export function botInput(
  state: Readonly<PlayerState>,
  arena: ArenaConfig,
  world: ArenaRuntime,
  skill: Skill,
): Input {
  const distance = -state.z,
    surfaces = world.surfaces(
      state.elapsed,
      state.elapsed,
      state.collapseTimes,
      state.z,
    );
  const support =
    surfaces.find((s) => s.id === state.supportId) ??
    surfaces.find(
      (s) =>
        surfaceContains(s, state.x, state.z) && Math.abs(s.y - state.y) < 0.02,
    );
  let target = 0,
    z = -1;
  const rotor = arena.mechanisms.find(
    (o) => o.kind === "sweeper" && -o.z - distance > -3 && -o.z - distance < 8,
  );
  if (rotor) target = -1.8;
  const wall = arena.mechanisms.find(
    (o) =>
      o.kind === "moving-wall" &&
      -o.z - distance > -0.9 &&
      -o.z - distance < 10,
  );
  if (wall?.kind === "moving-wall")
    target = sampleMechanism(
      wall,
      state.elapsed + Math.max(0, -wall.z - distance) / 5.2,
    ).x;
  const fast = arena.mechanisms.find(
    (o) =>
      o.kind === "conveyor" &&
      o.velocityZ < 0 &&
      distance > -o.z - o.depth / 2 &&
      distance < -o.z + o.depth / 2 - 6,
  );
  if (skill === "hard" && fast) target = fast.x;
  // Hard players aim precisely, easy players use a wider deadband and occasionally hesitate on safe ground.
  const belt = arena.mechanisms.find(
      (o) => o.id === state.supportId && o.kind === "conveyor",
    ),
    flow = belt?.kind === "conveyor" ? belt.velocityX : 0;
  const error = target - state.x - state.vx * 0.12 - flow * 0.2;
  const x =
    Math.abs(error) > (skill === "easy" ? 0.26 : skill === "hard" ? 0.16 : 0.2)
      ? Math.sign(error)
      : 0;
  for (const o of arena.mechanisms)
    if (o.kind === "timed-gate") {
      const dz = -o.z - distance;
      if (
        dz > 0 &&
        dz < 2.2 &&
        (sampleMechanism(o, state.elapsed).phase === "active" ||
          sampleMechanism(o, state.elapsed + dz / 5 + 0.12).phase === "active")
      )
        z = 0;
    }
  let jump = false;
  if (state.grounded || state.coyote > 0) {
    if (!state.grounded && state.coyote > 0) jump = true;
    if (support) {
      const boundary =
        support.z -
        (support.radius
          ? Math.sqrt(
              Math.max(0, support.radius ** 2 - (state.x - support.x) ** 2),
            )
          : support.depth / 2);
      const contiguous = surfaces.some(
        (s) =>
          s.id !== support.id &&
          surfaceContains(s, state.x, boundary - 0.08) &&
          Math.abs(s.y - state.y) < 0.5,
      );
      if (!contiguous && state.z - boundary < 1) jump = true;
    }
    for (const o of arena.mechanisms) {
      const dz = -o.z - distance;
      if (
        (["pendulum", "sliding-block", "pusher"].includes(o.kind) ||
          (o.kind === "sweeper" &&
            Math.abs(state.x - o.x) < o.length / 2 + 0.45)) &&
        dz > 0 &&
        dz < (o.kind === "pendulum" ? 3 : 2.7) &&
        z !== 0
      )
        jump = true;
      if (
        o.kind === "collapse-platform" &&
        state.supportId === o.id &&
        state.elapsed - (state.collapseTimes[o.id] ?? state.elapsed) >
          o.delay - 0.35
      )
        jump = true;
    }
  }
  if (
    skill === "easy" &&
    state.grounded &&
    support?.id?.startsWith("deck-") &&
    Math.sin(state.elapsed * 0.7) > 0.995 &&
    !jump
  )
    z = 0;
  return { x, z, jump };
}
