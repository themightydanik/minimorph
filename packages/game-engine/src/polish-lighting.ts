import * as pc from 'playcanvas';
/** Fixed artistic lighting rig shared by every arena; no device/performance-driven quality changes. */
export function createPolishLighting(app: pc.Application) {
  app.scene.ambientLight = new pc.Color(.34, .42, .57);
  const lights: pc.Entity[] = [];
  for (const [name, color, intensity, pitch, yaw] of [
    ['Warm orbital key', [1, .93, .84], 1.45, 42, -32],
    ['Cool sky fill', [.42, .68, 1], .55, 24, 148],
    ['Cyan rim', [.45, .93, 1], .42, 48, -142],
  ] as const) {
    const light = new pc.Entity(name);
    light.addComponent('light', { type: 'directional', color: new pc.Color(...color), intensity, castShadows: false });
    light.setEulerAngles(pitch, yaw, 0); app.root.addChild(light); lights.push(light);
  }
  return { destroy() { for (const light of lights) light.destroy(); } };
}
