import { describe, it, expect } from 'vitest';
import { Progression, PROGRESS_KEY } from './progression';
function store(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
describe('local progression without host authentication',()=>{
 it('unlocks in order, persists fastest result and restores across sessions',()=>{
  const storage=store(), p=new Progression(storage);
  expect(p.isUnlocked('orbit-chaos')).toBe(false); expect(p.complete('orbit-chaos',20)).toBe(false);
  expect(p.complete('cosmic-sprint',12.5)).toBe(true); expect(p.isUnlocked('orbit-chaos')).toBe(true);
  expect(p.complete('cosmic-sprint',20)).toBe(false); expect(p.value.best['cosmic-sprint']).toBe(12.5);
  const restored=new Progression(storage); expect(restored.value).toEqual(p.value);
  restored.complete('orbit-chaos',18); expect(new Progression(storage).isUnlocked('gravity-mayhem')).toBe(true);
 });
 it('rejects malformed state, invalid unlock counts and non-finite results',()=>{
  const storage=store();storage.setItem(PROGRESS_KEY,'{"version":1,"unlocked":99,"best":{}}');expect(new Progression(storage).value.unlocked).toBe(1);
  storage.setItem(PROGRESS_KEY,'bad JSON');expect(new Progression(storage).value.unlocked).toBe(1);
  const p=new Progression(storage);expect(p.complete('cosmic-sprint',NaN)).toBe(false);expect(p.complete('cosmic-sprint',-1)).toBe(false);
 });
 it('continues in memory when reading or writing storage throws',()=>{
  const p=new Progression({getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}});
  expect(p.persistent).toBe(false);expect(p.complete('cosmic-sprint',10)).toBe(true);expect(p.isUnlocked('orbit-chaos')).toBe(true);
 });
});
