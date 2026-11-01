import * as pc from 'playcanvas';
import { platforms, finish } from '@minimorph/game-content';
import { createPlayer, stepPlayer, FIXED_STEP } from './physics';
import type { Input, PlayerState } from './physics';
export { createPlayer, stepPlayer } from './physics';
export type { PlayerState } from './physics';
export interface Game { restart(): void; destroy(): void }
export function createGame(canvas: HTMLCanvasElement, readInput: () => Input, onState: (state: Readonly<PlayerState>) => void): Game {
  let app: pc.Application;
  try { app = new pc.Application(canvas, { graphicsDeviceOptions: { deviceTypes: ['webgl2'], antialias: false, alpha: false, powerPreference: 'low-power' } }); }
  catch { throw new Error('WebGL 2 is unavailable. Please use a recent browser with hardware acceleration.'); }
  app.setCanvasFillMode(pc.FILLMODE_NONE, canvas.parentElement!.clientWidth, canvas.parentElement!.clientHeight);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const materials: pc.StandardMaterial[] = [];
  const sceneryGroup = app.batcher!.addGroup('Static scenery', false, 100).id;
  const material = (hex: string, glow = false) => {
    const m = new pc.StandardMaterial(); m.diffuse = new pc.Color().fromString(hex);
    if (glow) { m.emissive = m.diffuse.clone(); m.emissiveIntensity = 0.8; }
    m.shininess = 40; m.update(); materials.push(m); return m;
  };
  const silver = material('#b9cbe2'), cyan = material('#38edec', true), navy = material('#141d3c'), purple = material('#6756ac'), white = material('#f1f7ff', true);
  const shape = (name: string, type: 'box' | 'capsule' | 'cone' | 'cylinder' | 'sphere', parent: pc.Entity, position: number[], scale: number[], mat: pc.StandardMaterial) => {
    const e = new pc.Entity(name); e.addComponent('render', { type });
    if (parent === app.root || parent.name === 'Finish beacon') e.render!.batchGroupId = sceneryGroup;
    e.render!.meshInstances.forEach(mesh => { mesh.material = mat; });
    e.setLocalPosition(position[0], position[1], position[2]); e.setLocalScale(scale[0], scale[1], scale[2]); parent.addChild(e); return e;
  };
  app.scene.ambientLight = new pc.Color(0.55, 0.62, 0.8);
  const sun = new pc.Entity('Starlight'); sun.addComponent('light', { type: 'directional', color: new pc.Color(0.8, 0.9, 1), intensity: 1.4, castShadows: false }); sun.setEulerAngles(45, 30, 0); app.root.addChild(sun);
  const camera = new pc.Entity('Follow camera'); camera.addComponent('camera', { clearColor: new pc.Color(0.025, 0.035, 0.09), farClip: 180, fov: 58 }); app.root.addChild(camera);
  platforms.forEach((p, i) => {
    shape('Orbit platform '+i, 'box', app.root, [p.x, p.y - 0.45, p.z], [p.width, 0.9, p.depth], i % 2 ? purple : navy);
    shape('Runway light '+i, 'box', app.root, [p.x, p.y + 0.015, p.z - p.depth / 2 + 0.12], [p.width, 0.03, 0.12], cyan);
  });
  // Static low-poly scenery, shared materials, no downloaded assets or dynamic shadows.
  for (let i = 0; i < 60; i++) {
    const x = Math.sin(i * 127.1) * 55, y = 6 + ((i * 17) % 35), z = -70 + ((i * 29) % 100);
    shape('Star', 'sphere', app.root, [x, y, z], [0.1, 0.1, 0.1], white);
  }
  shape('Distant planet', 'sphere', app.root, [-24, 15, -65], [15, 15, 15], purple);
  const goal = new pc.Entity('Finish beacon'); goal.setPosition(finish.x, finish.y, finish.z); app.root.addChild(goal);
  shape('Finish pad', 'cylinder', goal, [0, 0.04, 0], [3.6, 0.08, 3.6], cyan);
  for (const side of [-1, 1]) shape('Finish pillar', 'box', goal, [side * 2, 1.8, 0], [0.18, 3.6, 0.18], cyan);
  shape('Finish arch', 'box', goal, [0, 3.6, 0], [4.2, 0.2, 0.2], white);
  const cat = new pc.Entity('Space cat'); app.root.addChild(cat);
  shape('Suit', 'capsule', cat, [0, 0.65, 0], [0.65, 0.85, 0.55], silver);
  shape('Helmet', 'sphere', cat, [0, 1.3, 0], [0.95, 0.8, 0.85], silver);
  shape('Visor', 'sphere', cat, [0, 1.32, -0.3], [0.75, 0.53, 0.4], navy);
  for (const side of [-1, 1]) {
    const ear = shape('Cat ear', 'cone', cat, [side * 0.32, 1.77, 0], [0.28, 0.4, 0.28], silver); ear.setLocalEulerAngles(0, 0, side * -15);
    shape('Glowing eye', 'sphere', cat, [side * 0.19, 1.35, -0.49], [0.18, 0.24, 0.09], cyan);
    shape('Boot', 'box', cat, [side * 0.22, 0.15, 0], [0.28, 0.3, 0.4], navy);
    shape('Arm', 'capsule', cat, [side * 0.48, 0.7, 0], [0.2, 0.5, 0.2], silver);
  }
  shape('Chest core', 'sphere', cat, [0, 0.8, -0.29], [0.2, 0.2, 0.06], cyan);
  let player = createPlayer(), accumulator = 0, destroyed = false, pendingJump = false;
  const cameraPosition = new pc.Vec3(0, 6, 11), targetPosition = new pc.Vec3(), lookTarget = new pc.Vec3();
  const resize = () => { if (!destroyed) { app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5); app.resizeCanvas(Math.max(1, canvas.parentElement!.clientWidth), Math.max(1, canvas.parentElement!.clientHeight)); } };
  const observer = new ResizeObserver(resize); observer.observe(canvas.parentElement!); window.addEventListener('resize', resize);
  const visibility = () => { accumulator = 0; app.timeScale = document.hidden ? 0 : 1; }; document.addEventListener('visibilitychange', visibility);
  const update = (delta: number) => {
    accumulator += Math.min(delta, 0.1);
    const input = readInput(); pendingJump ||= input.jump;
    while (accumulator >= FIXED_STEP) { stepPlayer(player, { ...input, jump: pendingJump }, FIXED_STEP); pendingJump = false; accumulator -= FIXED_STEP; }
    cat.setPosition(player.x, player.y, player.z);
    if (Math.hypot(input.x, input.z) > 0.1 && !player.won) cat.setEulerAngles(0, Math.atan2(-input.x, -input.z) * 180 / Math.PI, 0);
    targetPosition.set(player.x, player.y + 5, player.z + 8);
    cameraPosition.lerp(cameraPosition, targetPosition, 1 - Math.exp(-8 * delta)); camera.setPosition(cameraPosition);
    lookTarget.set(player.x, player.y + 0.9, player.z - 2); camera.lookAt(lookTarget); onState(player);
  };
  const destroy = () => {
    if (destroyed) return; destroyed = true; observer.disconnect(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
    app.off('update', update); app.destroy(); materials.forEach(m => m.destroy());
  };
  try { app.batcher!.generate(); resize(); app.on('update', update); app.start(); }
  catch (error) { destroy(); throw error; }
  return { restart() { player = createPlayer(); accumulator = 0; pendingJump = false; cat.setEulerAngles(0, 0, 0); cameraPosition.set(0, 6, 11); onState(player); }, destroy };
}
