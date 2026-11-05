import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, DEFAULT_AUDIO, AUDIO_STORAGE_KEY, readAudio, sanitizeAudio } from './audio';
const storage = () => { const values = new Map<string,string>(); return { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => { values.set(k,v); } }; };
class Param { value=1; setTargetAtTime(v:number){this.value=v;} setValueAtTime(v:number){this.value=v;} linearRampToValueAtTime(v:number){this.value=v;} cancelScheduledValues(){} }
class Gain { gain=new Param(); connect(){} disconnect(){} }
class Source { buffer?:AudioBuffer;loop=false;onended?:()=>void;stops=0;connect(){}disconnect(){}start(){}stop(){this.stops++;this.onended?.();} }
class Context {
  state='suspended';currentTime=0;resumeCalls=0;destination={};sources:Source[]=[];blocked=false;
  createGain(){return new Gain();} createBufferSource(){const s=new Source();this.sources.push(s);return s;}
  createDynamicsCompressor(){return {...new Gain(),threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param(),connect(){}};}
  async resume(){this.resumeCalls++;if(this.blocked)throw Error('gesture required');this.state='running';}
  async suspend(){this.state='suspended';} async close(){this.state='closed';}
  async decodeAudioData(){return {} as AudioBuffer;}
}
function setup(){const context=new Context(), factory=vi.fn(()=>context as unknown as AudioContext);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));const manager=new AudioManager(storage(),factory);return {context,factory,manager};}
afterEach(()=>vi.unstubAllGlobals());
describe('audio preferences and browser playback boundary',()=>{
 it('sanitizes malformed values and persists all four preferences across reloads',()=>{
  const disk=storage(), first=new AudioManager(disk);
  first.setPreferences({master:.2,music:.6,effects:.4,muted:true});
  expect(new AudioManager(disk).preferences).toEqual({master:.2,music:.6,effects:.4,muted:true});
  expect(sanitizeAudio({master:9,music:-2,effects:NaN,muted:'true'})).toEqual({master:1,music:0,effects:DEFAULT_AUDIO.effects,muted:false});
  disk.setItem(AUDIO_STORAGE_KEY,'{broken');expect(readAudio(disk)).toEqual(DEFAULT_AUDIO);
  const unavailable={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  const safe=new AudioManager(unavailable);expect(()=>safe.setPreferences({master:.5})).not.toThrow();first.destroy();safe.destroy();
 });
 it('creates no context, requests or cue backlog before a gesture and honors a rejected resume',async()=>{
  const {manager,factory,context}=setup();manager.scene('racing');manager.play('jump');expect(factory).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  context.blocked=true;await manager.unlock();expect(manager.isUnlocked).toBe(false);expect(fetch).not.toHaveBeenCalled();
  context.blocked=false;await manager.unlock();await vi.waitFor(()=>expect(manager.currentMusic).toBe('race'));
  expect(manager.played.jump).toBeUndefined();expect(factory).toHaveBeenCalledTimes(1);manager.destroy();expect(context.state).toBe('closed');
 });
 it('caches assets, suppresses repeated countdown snapshots and prioritizes bounded effect voices',async()=>{
  const {manager,context}=setup();await manager.unlock();await vi.waitFor(()=>expect(manager.currentMusic).toBe('menu'));
  await manager.unlock();expect(context.resumeCalls).toBe(1);
  for(const count of [3,2,1,2,1]){context.currentTime++;manager.scene('countdown',count);}
  expect(manager.played.countdown).toBe(3);
  context.currentTime++;manager.scene('racing');manager.scene('racing');expect(manager.played.start).toBe(1);
  manager.scene('finished');await vi.waitFor(()=>expect(manager.currentMusic).toBe('results'));
  manager.scene('selection');await vi.waitFor(()=>expect(manager.currentMusic).toBe('menu'));
  expect(context.sources.filter(source=>source.loop&&!source.stops).length).toBeLessThanOrEqual(2);
  const requests=vi.mocked(fetch).mock.calls.length;
  for(let i=0;i<20;i++){context.currentTime+=.2;manager.play('jump',true,2);}
  context.currentTime++;manager.play('victory');expect(manager.played.victory).toBe(1);
  expect(vi.mocked(fetch).mock.calls.length).toBe(requests);
  manager.setPreferences({muted:true});context.currentTime++;manager.play('collision');expect(manager.played.collision).toBeUndefined();
  manager.suspend();manager.setPreferences({muted:false});manager.play('collision');expect(manager.played.collision).toBeUndefined();manager.destroy();
 });
});
