import * as pc from 'playcanvas';
import type { ArenaConfig, ArenaObstacle } from '@minimorph/game-content';
import type { ShapeFactory } from './character';
import type { PlayerState } from './physics';
import { obstaclePosition } from './physics';
import { sampleMechanism } from './obstacles';
type MaterialFactory = (hex: string, glow?: boolean) => pc.StandardMaterial;
export function createArenaScene(app: pc.Application, arena: ArenaConfig, shape: ShapeFactory, material: MaterialFactory) {
  const root = new pc.Entity(`Arena ${arena.id}`), fixed = new pc.Entity('Arena static'), dynamic = new pc.Entity('Arena mechanisms');
  app.root.addChild(root); root.addChild(fixed); root.addChild(dynamic);
  const p = arena.palette;
  const deck = material(p.deck), alternate = material(p.alternate), accent = material(p.accent, true), hazard = material(p.hazard, true), white = material('#efffff', true), warning = material('#ffc75b', true), dark = material('#101c32');
  const ghost = material(p.hazard); ghost.opacity = 0.35; ghost.blendType = pc.BLEND_NORMAL; ghost.depthWrite = false; ghost.update();
  function deckShape(parent: pc.Entity, width: number, depth: number, mat: pc.StandardMaterial) {
    shape('Floating deck', 'box', parent, [0, -0.42, 0], [width, 0.84, depth], mat);
    for (const side of [-1, 1]) {
      shape('Luminous rim', 'box', parent, [side * (width / 2 - 0.065), 0.018, 0], [0.13, 0.035, depth], accent);
      shape('Luminous rim', 'box', parent, [0, 0.018, side * (depth / 2 - 0.065)], [width, 0.035, 0.13], accent);
      shape('Thruster housing', 'cylinder', parent, [side * width * 0.3, -0.65, 0], [0.6, 0.7, 0.6], dark);
      shape('Thruster light', 'cylinder', parent, [side * width * 0.3, -1.02, 0], [0.4, 0.04, 0.4], accent);
    }
    for (let z = -depth / 2 + 1; z < depth / 2; z += 1.6) {
      for (const side of [-1, 1]) {
        const arrow = shape('Direction chevron', 'box', parent, [side * 0.19, 0.025, z], [0.12, 0.025, 0.52], white);
        arrow.setLocalEulerAngles(0, side * 40, 0);
      }
    }
  }
  arena.platforms.forEach((platform, i) => {
    const entity = new pc.Entity(`Deck ${i}`); fixed.addChild(entity); entity.setLocalPosition(platform.x, platform.y, platform.z);
    deckShape(entity, platform.width, platform.depth, i % 2 ? alternate : deck);
  });
  const checkpointPads = arena.checkpoints.map((point, i) => {
    const pad = shape(`Checkpoint ${i + 1}`, 'cylinder', dynamic, [point.x, point.y + 0.05, point.z], [2.3, 0.08, 2.3], hazard);
    for (const side of [-1, 1]) {
      shape('Checkpoint post', 'cylinder', fixed, [point.x + side * 1.6, point.y + 0.6, point.z], [0.14, 1.2, 0.14], accent);
      shape('Checkpoint crown', 'sphere', fixed, [point.x + side * 1.6, point.y + 1.25, point.z], [0.26, 0.26, 0.26], white);
    }
    return pad;
  });
  const f = arena.finish;
  shape('Finish landing ring', 'cylinder', fixed, [f.x, f.y + 0.025, f.z], [3.3, 0.05, 3.3], accent);
  shape('Finish inset', 'cylinder', fixed, [f.x, f.y + 0.055, f.z], [2.6, 0.04, 2.6], dark);
  for (const side of [-1, 1]) {
    shape('Finish arch pillar', 'box', fixed, [f.x + side * 2.1, f.y + 2, f.z], [0.26, 4, 0.32], accent);
    shape('Finish arch foot', 'box', fixed, [f.x + side * 2.1, f.y + 0.15, f.z], [0.8, 0.3, 0.9], alternate);
  }
  shape('Finish arch crown', 'box', fixed, [f.x, f.y + 4, f.z], [4.5, 0.3, 0.32], white);
  for (let i = 0; i < 8; i++) shape('Finish checker', 'box', fixed, [f.x - 1.75 + i * 0.5, f.y + 3.7, f.z], [0.48, 0.25, 0.3], i % 2 ? accent : dark);
  const legacy = arena.obstacles.map(o => shape('Moving sweeper', 'box', dynamic, [o.x, o.y + o.height / 2, o.z], [o.width, o.height, o.depth], hazard));
  const mechanisms = arena.mechanisms.map(o => {
    const entity = new pc.Entity(o.id); dynamic.addChild(entity);
    let deckEntity: pc.Entity | undefined, beam: pc.Entity | undefined, strip: pc.Entity | undefined;
    const indicators: pc.Entity[] = [];
    if (o.kind === 'moving-platform' || o.kind === 'disappearing-platform') {
      deckEntity = new pc.Entity('Mechanism deck'); entity.addChild(deckEntity); deckShape(deckEntity, o.width, o.depth, alternate);
      if (o.kind === 'disappearing-platform') for (const side of [-1, 1]) shape('Vanishing deck outline', 'box', entity, [side * o.width / 2, -0.04, 0], [0.06, 0.06, o.depth], hazard);
    }
    if (o.kind === 'rotating-disc') {
      shape('Rotating disc', 'cylinder', entity, [0, -0.3, 0], [o.radius * 2, 0.6, o.radius * 2], alternate);
      shape('Disc hub', 'cylinder', entity, [0, 0.02, 0], [1, 0.04, 1], accent);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const spoke = shape('Disc spoke', 'box', entity, [Math.cos(a) * o.radius * 0.5, 0.015, Math.sin(a) * o.radius * 0.5], [o.radius * 0.85, 0.025, 0.13], accent);
        spoke.setLocalEulerAngles(0, -a * 180 / Math.PI, 0);
      }
    }
    if (o.kind === 'sweeper') {
      shape('Rotor hub', 'cylinder', entity, [0, o.height / 2, 0], [0.4, o.height, 0.4], dark);
      shape('Sweeper beam', 'box', entity, [0, o.height / 2, 0], [o.length, o.height, o.width], hazard);
      for (const side of [-1, 1]) shape('Rotor end cap', 'sphere', entity, [side * o.length / 2, o.height / 2, 0], [o.width, o.height, o.width], white);
    }
    if (o.kind === 'sliding-block') {
      shape('Sliding block', 'box', entity, [0, o.height / 2, 0], [o.width, o.height, o.depth], hazard);
      shape('Sliding block stripe', 'box', entity, [0, o.height + 0.01, 0], [o.width * 0.65, 0.03, o.depth], white);
    }
    if (o.kind === 'jump-pad') {
      shape('Jump pad base', 'box', entity, [0, 0.06, 0], [o.width, 0.12, o.depth], hazard);
      for (const side of [-1, 1]) { const arrow = shape('Launch arrow', 'box', entity, [side * 0.17, 0.13, 0], [0.12, 0.035, 0.55], white); arrow.setLocalEulerAngles(0, side * 40, 0); }
    }
    if (o.kind === 'laser') {
      for (const side of [-1, 1]) {
        shape('Laser emitter', 'box', entity, [side * (o.width / 2 + 0.1), o.height / 2, 0], [0.22, o.height, 0.4], dark);
        indicators.push(shape('Laser signal', 'sphere', entity, [side * (o.width / 2 + 0.1), o.height + 0.15, 0], [0.28, 0.28, 0.28], accent));
      }
      strip = shape('Laser warning strip', 'box', entity, [0, 0.02, 0], [o.width, 0.03, 0.45], dark);
      beam = shape('Laser field', 'box', entity, [0, o.height / 2, 0], [o.width, o.height, o.depth], ghost);
    }
    return { o, entity, deckEntity, beam, strip, indicators };
  });
  // Original geometry only: low-poly stars, orbital ring and planets, all shared/batched.
  const planet = material(p.planet);
  shape('Ringed planet', 'sphere', fixed, [-20, -3, -45], [15, 15, 15], planet);
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    const ring = shape('Planet orbital ring', 'box', fixed, [-20 + Math.cos(a) * 12, -3 + Math.sin(a) * 2, -45 + Math.sin(a) * 9], [2.3, 0.16, 0.65], accent);
    ring.setLocalEulerAngles(0, -a * 180 / Math.PI - 90, 0);
  }
  shape('Moon', 'sphere', fixed, [17, -1, -34], [6, 6, 6], alternate);
  for (let i = 0; i < 90; i++) shape('Star', 'box', fixed, [Math.sin(i * 127.1) * 65, -16 + ((i * 17) % 28), -80 + ((i * 29) % 120)], [0.14, 0.14, 0.14], white);
  for (const route of arena.routes) for (const point of route.points) {
    shape(`Route beacon ${route.name}`, 'box', fixed, [point.x + 1.1, point.y + 0.15, point.z], [0.08, 0.3, 0.08], accent);
  }
  // Scene-specific materials are released on arena switch, not accumulated.
  const ownedMaterials = [deck, alternate, accent, hazard, white, warning, dark, ghost, planet];
  return {
    root,
    update(state: Readonly<PlayerState>) {
      legacy.forEach((entity, i) => { const o = arena.obstacles[i], at = obstaclePosition(o, state.elapsed); entity.setLocalPosition(at.x, at.y + o.height / 2, at.z); });
      mechanisms.forEach(({ o, entity, deckEntity, beam, strip, indicators }) => {
        const at = sampleMechanism(o, state.elapsed);
        entity.setLocalPosition(at.x, at.y, at.z); entity.setLocalEulerAngles(0, -at.angle * 180 / Math.PI, 0);
        if (deckEntity) deckEntity.enabled = at.phase !== 'hidden';
        if (deckEntity && o.kind === 'disappearing-platform') {
          for (const render of deckEntity.findComponents('render') as pc.RenderComponent[]) for (const mesh of render.meshInstances) mesh.material = at.phase === 'warning' ? warning : alternate;
        }
        if (beam && o.kind === 'laser') {
          beam.enabled = at.phase !== 'safe';
          beam.render!.meshInstances[0].material = at.phase === 'warning' ? warning : ghost;
          strip!.render!.meshInstances[0].material = at.phase === 'safe' ? dark : at.phase === 'warning' ? warning : hazard;
          indicators.forEach(signal => {
            signal.render!.meshInstances[0].material = at.phase === 'safe' ? accent : at.phase === 'warning' ? warning : hazard;
            const size = at.phase === 'warning' ? 0.3 + Math.sin(state.elapsed * 18) * 0.09 : 0.28;
            signal.setLocalScale(size, size, size);
          });
          beam.setLocalScale(o.width, at.phase === 'active' ? o.height : 0.04, o.depth);
          beam.setLocalPosition(0, at.phase === 'active' ? o.height / 2 : 0.04, 0);
        }
      });
      checkpointPads.forEach((pad, i) => {
        pad.render!.meshInstances[0].material = state.checkpoint > i ? accent : hazard;
        const pulse = state.checkpoint === i + 1 ? 1 + Math.sin(state.checkpointFlash * Math.PI * 5) * state.checkpointFlash * 0.12 : 1;
        pad.setLocalScale(2.3 * pulse, 0.08, 2.3 * pulse);
      });
    },
    destroy() { root.destroy(); ownedMaterials.forEach(m => m.destroy()); },
  };
}
export function mechanismLabel(o: ArenaObstacle): string { return o.kind.replaceAll('-', ' '); }
