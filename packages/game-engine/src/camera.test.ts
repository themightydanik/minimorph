import { it, expect } from "vitest";
import { createCameraPose, updateCamera } from "./camera";
import { createPlayer, FIXED_STEP } from "./physics";
it("widens portrait framing and follows jumps without descending into the void", () => {
  const portrait = createCameraPose(),
    landscape = createCameraPose(),
    player = createPlayer();
  for (let i = 0; i < 240; i++) {
    updateCamera(portrait, player, 0, 0.5, FIXED_STEP);
    updateCamera(landscape, player, 0, 2, FIXED_STEP);
  }
  expect(portrait.fov).toBeGreaterThan(landscape.fov);
  expect(portrait.y).toBeGreaterThan(landscape.y);
  player.y = 2;
  const before = landscape.lookY;
  updateCamera(landscape, player, 0, 2, FIXED_STEP);
  expect(landscape.lookY).toBeGreaterThan(before);
  expect(landscape.lookY).toBeLessThan(3);
  player.y = -10;
  for (let i = 0; i < 240; i++)
    updateCamera(landscape, player, 0, 2, FIXED_STEP);
  expect(landscape.y).toBeGreaterThan(3);
});
it("damps both eye and look target across recovery/restart instead of snapping", () => {
  const pose = createCameraPose(),
    player = createPlayer();
  Object.assign(player, { x: -1, z: -23, y: 0.5, checkpoint: 2 });
  for (let i = 0; i < 400; i++) updateCamera(pose, player, 0, 1.8, FIXED_STEP);
  const before = { ...pose };
  const fresh = createPlayer();
  updateCamera(pose, fresh, 0, 1.8, FIXED_STEP);
  expect(Math.abs(pose.z - before.z)).toBeLessThan(0.2);
  expect(Math.abs(pose.lookZ - before.lookZ)).toBeLessThan(1.5);
  for (let i = 0; i < 600; i++) updateCamera(pose, fresh, 0, 1.8, FIXED_STEP);
  expect(pose.lookZ).toBeCloseTo(1);
  expect(pose.z).toBeCloseTo(7.5, 1);
});

it("keeps the initial zero-duration render finite", () => {
  const pose = createCameraPose(),
    before = { ...pose };
  updateCamera(pose, createPlayer(), 0, 1, 0);
  expect(pose).toEqual(before);
  updateCamera(pose, createPlayer(), 0, 1, FIXED_STEP);
  expect(Object.values(pose).every(Number.isFinite)).toBe(true);
});
it('long recovery immediately reframes the avatar while retaining camera yaw',async()=>{
 const {reframeRecovery}=await import('./camera');const pose=createCameraPose(),player=createPlayer();
 player.z=-320;pose.z=-400;reframeRecovery(pose,player,Math.PI/2,.5);
 expect(pose.lookZ).toBe(-321);expect(pose.x).toBeCloseTo(player.x+8.5);expect(pose.z).toBeCloseTo(-321);expect(pose.y).toBe(player.y+6.5);
});
