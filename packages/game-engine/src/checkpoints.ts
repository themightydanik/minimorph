import type { CourseDefinition } from '@minimorph/game-content';
import type { PlayerState } from './physics';
export function respawnPoint(state: Readonly<PlayerState>, course: CourseDefinition) {
  return course.checkpoints[state.checkpoint - 1] ?? course.spawn;
}
export function advanceCheckpoints(state: PlayerState, course: CourseDefinition): void {
  if (!state.grounded) return;
  const checkpoint = course.checkpoints[state.checkpoint];
  if (checkpoint && Math.abs(state.y - checkpoint.y) < 0.01 && Math.hypot(state.x - checkpoint.x, state.z - checkpoint.z) < checkpoint.radius) {
    state.checkpoint++;
    state.checkpointFlash = 1.2;
  }
  const finish = course.finish;
  if (state.checkpoint === course.checkpoints.length && Math.abs(state.y - finish.y) < 0.01 && Math.hypot(state.x - finish.x, state.z - finish.z) < finish.radius) {
    state.won = true;
    state.vx = state.vy = state.vz = 0;
  }
}
