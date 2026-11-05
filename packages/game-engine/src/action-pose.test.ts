import { expect,it } from 'vitest';
import { createPlayer, ACTION_RECOVERY_TIME } from './physics';
import { ACTION_BONES, sampleActionPose } from './action-pose';
it('samples dedicated multi-bone action poses with continuous recovery and no physics mutation',()=>{
 const state=createPlayer(), output=new Float32Array(ACTION_BONES.length);
 state.action='dive';const before=structuredClone(state);expect(sampleActionPose(state,output)).toBe(true);expect(state).toEqual(before);expect(output[0]).toBe(-48);expect(output[6]).toBeGreaterThan(90);
 state.action='slide';sampleActionPose(state,output);const slide=Array.from(output);expect(output[0]).toBe(-76);
 state.action='recover';state.actionTime=ACTION_RECOVERY_TIME;sampleActionPose(state,output);expect(Array.from(output)).toEqual(slide);
 state.actionTime=ACTION_RECOVERY_TIME/2;sampleActionPose(state,output);expect(output[0]).toBeCloseTo(-38);expect(output.every(Number.isFinite)).toBe(true);
 state.actionTime=0;sampleActionPose(state,output);expect(Math.abs(output[0])).toBe(0);
 state.action='normal';output.fill(7);expect(sampleActionPose(state,output)).toBe(false);expect(output.every(v=>v===7)).toBe(true);
});
