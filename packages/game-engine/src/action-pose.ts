import * as pc from 'playcanvas';
import type { PlayerState } from './physics';
import { ACTION_RECOVERY_TIME } from './physics';
export const ACTION_BONES = ['Root', 'Pelvis', 'Spine', 'Chest', 'Neck', 'Head', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R'] as const;
/** Model-space bone offsets, not a whole-character entity tilt. Output buffer is reused. */
export function sampleActionPose(state: Readonly<PlayerState>, output: Float32Array): boolean {
  if (state.recovery || state.won || state.action === 'normal') return false;
  output.fill(0);
  const recovery = state.action === 'recover' ? Math.max(0, Math.min(1, 1 - state.actionTime / ACTION_RECOVERY_TIME)) : 0;
  const ease = recovery * recovery * (3 - 2 * recovery), slide = state.action !== 'dive';
  const upright = state.action === 'recover' ? 1 - ease : 1;
  output[0] = (slide ? -76 : -48) * upright; // skeletal root carries prone orientation
  output[1] = (slide ? .18 : .12) * upright; // contact clearance, visual only
  output[2] = -4 * upright; output[3] = -5 * upright;
  output[4] = 8 * upright; output[5] = (slide ? 48 : 30) * upright; // look toward route
  output[6] = output[7] = (slide ? 125 : 112) * upright; // reaching / bracing arms
  output[8] = output[9] = -24 * upright;
  const crouch = state.action === 'recover' ? Math.sin(Math.PI * recovery) * 24 : 0;
  output[10] = output[11] = 8 * upright + crouch;
  output[12] = output[13] = -18 * upright - crouch * 1.4;
  return true;
}
export function createActionPose(app: pc.Application, root: pc.Entity) {
  const modelInverse = root.getRotation().clone().invert();
  const entries = ACTION_BONES.map(name => {
    const node = root.findByName(name) as pc.Entity | null;
    if (!node) throw new Error(`Action pose needs existing bone ${name}`);
    const parent = node.parent!.getRotation();
    const parentModel = new pc.Quat().mul2(modelInverse, parent);
    return { node, rest: node.getLocalRotation().clone(), position: node.getLocalPosition().clone(), parent: parentModel, inverse: parentModel.clone().invert(), base: node.getLocalRotation().clone(), basePosition: node.getLocalPosition().clone(), target: new pc.Quat(), delta: new pc.Quat(), mixed: new pc.Quat() };
  });
  const pose = new Float32Array(ACTION_BONES.length), smooth = new Float32Array(ACTION_BONES.length);
  let weight = 0, applied = false, disposed = false;
  // Remove last frame's overlay before PlayCanvas evaluates its untouched GLB clips.
  const restore = () => {
    if (!applied || disposed) return;
    for (const e of entries) { e.node.setLocalRotation(e.base); e.node.setLocalPosition(e.basePosition); }
    applied = false;
  };
  app.systems.on('update', restore);
  return {
    update(state: Readonly<PlayerState>, dt: number) {
      const active = sampleActionPose(state, pose);
      weight += ((active ? 1 : 0) - weight) * (1 - Math.exp(-24 * dt));
      if (weight < .001 && !active) return;
      for (let i = 0; i < pose.length; i++) smooth[i] += (pose[i] - smooth[i]) * (1 - Math.exp(-30 * dt));
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        e.base.copy(e.node.getLocalRotation()); e.basePosition.copy(e.node.getLocalPosition());
        // Pelvis entry uses a small translation, not rotation; every limb uses its bind axes.
        e.delta.setFromEulerAngles(i === 1 ? 0 : smooth[i], 0, 0);
        e.target.mul2(e.inverse, e.delta).mul(e.parent).mul(e.rest);
        e.mixed.slerp(e.base, e.target, weight); e.node.setLocalRotation(e.mixed);
        if (i === 0) e.node.setLocalPosition(e.basePosition.x, e.basePosition.y + smooth[1] * weight, e.basePosition.z);
      }
      applied = true;
    },
    get weight() { return weight; },
    destroy() { restore(); disposed = true; app.systems.off('update', restore); },
  };
}
