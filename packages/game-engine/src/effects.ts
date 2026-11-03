import * as pc from 'playcanvas';
import type { ShapeFactory } from './character';
import type { PlayerState } from './physics';
import type { ArenaConfig } from '@minimorph/game-content';
/** Fixed-size pool: no per-event entities, textures, lights or physics bodies. */
export function createEffects(root: pc.Entity, shape: ShapeFactory, material: pc.StandardMaterial) {
  const pool = Array.from({ length: 24 }, (_, i) => ({ entity: shape('Orbit spark', 'box', root, [0, 0, 0], [0.08, 0.08, 0.08], material), angle: i * 2.399, life: 0 }));
  pool.forEach(p => p.entity.enabled = false);
  let serial = -1, checkpoint = 0, origin = { x: 0, y: 0, z: 0 }, clock = 0;
  return {
    reset() { serial = -1; checkpoint = 0; pool.forEach(p => { p.life = 0; p.entity.enabled = false; }); },
    update(state: Readonly<PlayerState>, arena: ArenaConfig, dt: number) {
      clock += dt;
      if (serial !== state.eventSerial || checkpoint !== state.checkpoint) {
        serial = state.eventSerial; checkpoint = state.checkpoint;
        origin = { x: state.x, y: state.y + 0.12, z: state.z };
        if (serial > 0 || checkpoint > 0) pool.forEach(p => p.life = 0.65);
      }
      pool.forEach((p, i) => {
        p.life = Math.max(0, p.life - dt);
        p.entity.enabled = state.won || p.life > 0;
        if (state.won) p.entity.setLocalPosition(arena.finish.x + Math.cos(p.angle + clock) * 2, arena.finish.y + 0.4 + ((clock * 1.4 + i * 0.2) % 4), arena.finish.z + Math.sin(p.angle + clock) * 2);
        else if (p.life > 0) {
          const t = 0.65 - p.life;
          p.entity.setLocalPosition(origin.x + Math.cos(p.angle) * t * 2, origin.y + t * 3 - t * t * 5, origin.z + Math.sin(p.angle) * t * 2);
        }
        p.entity.setLocalEulerAngles(clock * 90, i * 31, clock * 70);
      });
    },
    destroy() { pool.forEach(p => p.entity.destroy()); },
  };
}
