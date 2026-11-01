import { it, expect } from "vitest";
import { courseRun } from "../../../tests/helpers/course-run";
import { createPlayer, stepPlayer, FIXED_STEP } from "./physics";
it("completes the entire course with digital inputs and the sweeper enabled", () => {
  const player = createPlayer();
  for (const segment of courseRun) {
    for (let i = 0; i < Math.round(segment.seconds / FIXED_STEP); i++)
      stepPlayer(
        player,
        {
          x:
            Number(segment.keys.includes("KeyD")) -
            Number(segment.keys.includes("KeyA")),
          z: -Number(segment.keys.includes("KeyW")),
          jump: segment.jump && i === 0,
        },
        FIXED_STEP,
      );
    expect(player.falls).toBe(0);
  }
  expect(player.checkpoint).toBe(2);
  expect(player.won).toBe(true);
});
