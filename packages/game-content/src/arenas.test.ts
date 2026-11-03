import { it, expect } from 'vitest';
import { trainingArenas as arenas, getTrainingArena as getArena } from './arenas';
it('has three independently named, finite, valid configurations and all seven mechanisms',()=>{
 expect(new Set(arenas.map(a=>a.id)).size).toBe(3);
 const kinds=new Set<string>();
 for(const a of arenas){
  expect(getArena(a.id)).toBe(a); expect(a.routes.length).toBeGreaterThan(0);
  expect(new Set(a.mechanisms.map(o=>o.id)).size).toBe(a.mechanisms.length);
  for(const point of [a.spawn,a.finish,...a.checkpoints,...a.platforms,...a.mechanisms]) for(const axis of ['x','y','z'] as const)expect(Number.isFinite(point[axis])).toBe(true);
  for(const p of a.platforms){expect(p.width).toBeGreaterThan(0);expect(p.depth).toBeGreaterThan(0);}
  for(const o of a.mechanisms){
   kinds.add(o.kind);expect(o.period).toBeGreaterThan(0);
   if(o.kind==='disappearing-platform'){expect(o.onFor).toBeLessThan(o.period);expect(o.warning).toBeLessThan(o.onFor);}
   if(o.kind==='laser'){expect(o.activeFor+o.warning).toBeLessThan(o.period);}
  }
 }
 expect([...kinds].sort()).toEqual(['sweeper','moving-platform','sliding-block','disappearing-platform','jump-pad','laser','rotating-disc'].sort());
});
