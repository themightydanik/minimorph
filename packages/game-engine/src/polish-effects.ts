import * as pc from 'playcanvas';
import type { ShapeFactory } from './character';
import type { PlayerState } from './physics';
import type { ArenaConfig } from '@minimorph/game-content';
import { ArenaRuntime, surfaceContains } from './obstacles';
import type { PresentationEvent } from './presentation-events';
export const POLISH_EFFECT_LIMITS = { sparks: 48, rings: 8, participantSlots: 9, contactShadows: true, localTrailInterval: .12, remoteTrailInterval: .22 };
/** Bounded scene-wide pools, including all eight participants. No entity/texture allocation per burst. */
export function createPolishEffects(app: pc.Application, root: pc.Entity, shape: ShapeFactory) {
  const materials = ['#79f7e6', '#ffcc83', '#ff659c'].map(hex => {
    const m = new pc.StandardMaterial(); m.diffuse = new pc.Color().fromString(hex); m.emissive.copy(m.diffuse); m.emissiveIntensity = .45; m.useLighting = false; m.update(); return m;
  });
  const particles = Array.from({ length: POLISH_EFFECT_LIMITS.sparks }, (_, i) => {
    const entity = shape('Pooled feedback spark', i % 4 ? 'box' : 'sphere', root, [0,0,0], [.04,.04,.04], materials[i % 3]); entity.enabled = false;
    return { entity, life: 0, duration: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: .05 };
  });
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot((x-31.5)/31.5, (y-31.5)/31.5), i = (y*64+x)*4;
    pixels[i] = 16; pixels[i+1] = 23; pixels[i+2] = 43; pixels[i+3] = Math.round(Math.max(0, 1-radius) ** 1.7 * 115);
  }
  const texture = new pc.Texture(app.graphicsDevice, { width:64, height:64, format:pc.PIXELFORMAT_RGBA8, mipmaps:false, minFilter:pc.FILTER_LINEAR, magFilter:pc.FILTER_LINEAR });
  (texture.lock() as Uint8Array).set(pixels); texture.unlock();
  const shadowMaterial = new pc.StandardMaterial(); shadowMaterial.diffuseMap = texture; shadowMaterial.opacityMap = texture; shadowMaterial.opacityMapChannel = 'a'; shadowMaterial.useLighting = false; shadowMaterial.blendType = pc.BLEND_NORMAL; shadowMaterial.depthWrite = false; shadowMaterial.update();
  const slots = Array.from({ length:POLISH_EFFECT_LIMITS.participantSlots }, () => {
    const entity = new pc.Entity('Soft character contact shadow'); entity.addComponent('render', { type:'plane', castShadows:false }); entity.render!.meshInstances[0].material = shadowMaterial; root.addChild(entity); entity.enabled = false;
    return { id:'', entity, trail:0, seen:false };
  });
  const ringPixels = new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const distance=Math.abs(Math.hypot((x-31.5)/31.5,(y-31.5)/31.5)-.72),i=(y*64+x)*4;
    ringPixels[i]=ringPixels[i+1]=ringPixels[i+2]=255;ringPixels[i+3]=Math.round(Math.exp(-distance*distance/.006)*220);
  }
  const ringTexture=new pc.Texture(app.graphicsDevice,{width:64,height:64,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR});
  (ringTexture.lock() as Uint8Array).set(ringPixels);ringTexture.unlock();
  const rings=Array.from({length:POLISH_EFFECT_LIMITS.rings},()=>{
    const material=new pc.StandardMaterial();material.useLighting=false;material.diffuse=new pc.Color().fromString('#8bffe8');material.emissive.copy(material.diffuse);material.emissiveIntensity=.7;material.opacityMap=ringTexture;material.opacityMapChannel='a';material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.update();
    const entity=new pc.Entity('Pooled impact pulse');entity.addComponent('render',{type:'plane',castShadows:false});entity.render!.meshInstances[0].material=material;root.addChild(entity);entity.enabled=false;
    return {entity,material,life:0};
  });
  let ringCursor=0;
  let cursor = 0, arenaId = '', world: ArenaRuntime | undefined, disposed = false;
  function burst(x:number,y:number,z:number,count:number,kind:string,heading=0) {
    for (let i=0;i<count;i++) {
      const p = particles[cursor++ % particles.length], angle = i * 2.399 + cursor * .31;
      p.life = p.duration = kind === 'victory' || kind === 'finish' ? .9 : kind === 'slide' ? .24 : .42;
      p.x=x; p.y=y+.055; p.z=z; p.size=kind==='slide'?.035:.075;
      p.vx=Math.cos(angle)*(kind==='checkpoint'?1.6:1.1); p.vz=Math.sin(angle)*1.1;
      if(kind==='slide'){p.vx=-Math.sin(heading)*.5+Math.cos(angle)*.3;p.vz=-Math.cos(heading)*.5+Math.sin(angle)*.3;}
      p.vy=kind==='slide'?.3:kind==='victory'?3:1.4;
      p.entity.render!.meshInstances[0].material=materials[kind==='collision'?2:kind==='land'||kind==='slide'?1:0]; p.entity.setLocalPosition(p.x,p.y,p.z);p.entity.setLocalScale(p.size,p.size,p.size);p.entity.enabled=true;
    }
  }
  return {
    emit(event: PresentationEvent) {
      if(disposed)return;
      burst(event.x,event.y,event.z,event.remote?3:event.kind==='checkpoint'||event.kind==='victory'?9:6,event.kind);
      if(['jump','land','checkpoint','finish'].includes(event.kind)){
        const ring=rings[ringCursor++%rings.length];ring.life=.32;ring.material.opacity=.45;ring.material.update();ring.entity.enabled=true;ring.entity.setLocalPosition(event.x,event.y+.03,event.z);ring.entity.setLocalScale(.3,1,.3);
      }
    },
    begin(arena:ArenaConfig,dt:number) {
      if(disposed)return;
      if(arena.id!==arenaId){arenaId=arena.id;world=new ArenaRuntime(arena);}
      for(const slot of slots)slot.seen=false;
      for(const ring of rings)if(ring.life>0){
        ring.life=Math.max(0,ring.life-dt);ring.entity.enabled=ring.life>0;
        const progress=1-ring.life/.32,size=.3+progress*1.5;ring.entity.setLocalScale(size,1,size);
        ring.material.opacity=.45*(1-progress);ring.material.update();
      }
      for(const p of particles)if(p.life>0){
        p.life=Math.max(0,p.life-dt);p.entity.enabled=p.life>0;
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=5*dt;
        p.entity.setLocalPosition(p.x,p.y,p.z);const scale=p.size*Math.min(1,p.life/.12);p.entity.setLocalScale(scale,scale,scale);
      }
    },
    track(id:string,state:Readonly<PlayerState>,remote:boolean,dt:number) {
      if(disposed)return;
      let slot: typeof slots[number] | undefined;
      for(const candidate of slots)if(candidate.id===id){slot=candidate;break;}
      if(!slot)for(const candidate of slots)if(!candidate.id){slot=candidate;break;}
      if(!slot)return;
      slot.id=id;slot.seen=true;
      let ground=-Infinity;
      if(state.grounded&&!state.recovery)ground=state.y;
      else if(world)for(const surface of world.surfaces(state.elapsed,state.elapsed,state.collapseTimes,state.z))if(surface.y<=state.y&&surface.y>ground&&surfaceContains(surface,state.x,state.z))ground=surface.y;
      const height=state.y-ground;
      slot.entity.enabled=POLISH_EFFECT_LIMITS.contactShadows&&!state.recovery&&Number.isFinite(ground)&&height<4;
      if(slot.entity.enabled){slot.entity.setLocalPosition(state.x,ground+.018,state.z);const size=1.05+Math.max(0,height)*.12;slot.entity.setLocalScale(size,1,size*.78);}
      slot.trail+=dt;
      if(state.action==='slide'&&!state.recovery&&slot.trail>(remote?POLISH_EFFECT_LIMITS.remoteTrailInterval:POLISH_EFFECT_LIMITS.localTrailInterval)){slot.trail=0;burst(state.x,state.y,state.z,remote?1:2,'slide',state.heading);}
    },
    end(){if(disposed)return;for(const slot of slots)if(!slot.seen){slot.id='';slot.trail=0;slot.entity.enabled=false;}},
    reset(){if(disposed)return;for(const ring of rings){ring.life=0;ring.entity.enabled=false;}for(const p of particles){p.life=0;p.entity.enabled=false;}for(const s of slots){s.id='';s.entity.enabled=false;s.trail=0;}},
    get active(){let count=0;for(const p of particles)if(p.life>0)count++;return count;},
    destroy(){if(disposed)return;disposed=true;for(const p of particles){p.life=0;p.entity.enabled=false;p.entity.destroy();}for(const s of slots){s.entity.enabled=false;s.entity.destroy();}for(const m of materials)m.destroy();for(const ring of rings){ring.entity.destroy();ring.material.destroy();}ringTexture.destroy();shadowMaterial.destroy();texture.destroy();},
  };
}
