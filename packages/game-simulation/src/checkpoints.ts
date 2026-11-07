import type { CourseDefinition } from "@minimorph/game-content";
import type { PlayerState } from "./physics";
export function respawnPoint(
  state: Readonly<PlayerState>,
  course: CourseDefinition,
) {
  return course.checkpoints[state.checkpoint - 1] ?? course.spawn;
}
export function advanceCheckpoints(
  state: PlayerState,
  course: CourseDefinition,
): void {
  if (!state.grounded) return;
  const index = course.checkpoints.findIndex(
    (checkpoint) =>
      checkpoint.enabled!==false && Math.abs(state.y - checkpoint.y) < 0.01 &&
      Math.hypot(state.x - checkpoint.x, state.z - checkpoint.z) <
        checkpoint.radius,
  );
  if (index >= 0 && state.checkpoint !== index + 1) {
    state.checkpoint = index + 1;
    // Bounded activation log, not a mandatory sequence or fabricated skipped split times.
    if (state.splits.length < course.checkpoints.length)
      state.splits.push(state.elapsed);
    state.checkpointFlash = 1.2;
    state.checkpointSerial=(state.checkpointSerial??0)+1;
  }
  const finish = course.finish;
  if (
    Math.abs(state.y - finish.y) < 0.01 &&
    Math.hypot(state.x - finish.x, state.z - finish.z) < finish.radius
  ) {
    state.won = true;
    state.vx = state.vy = state.vz = 0;
  }
}
