import * as pc from 'playcanvas';
import { createCosmicScene } from './cosmic-scene';
import type { ArenaLoadStatus } from './cosmic-scene';
import type { ArenaConfig, ArenaObstacle } from '@minimorph/game-content';
import type { ShapeFactory } from './character';
import type { PlayerState } from './physics';
import { obstaclePosition } from './physics';
import type { MechanismPhase } from './obstacles';
import { sampleMechanism } from './obstacles';
type MaterialFactory = (hex: string, glow?: boolean) => pc.StandardMaterial;
export function createArenaScene(app: pc.Application, arena: ArenaConfig, shape: ShapeFactory, material: MaterialFactory, onLoad?:(status:ArenaLoadStatus)=>void) {
  if(arena.visuals)return createCosmicScene(app,arena,onLoad);
  onLoad?.({ready:true,loaded:0,total:0,error:null});
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
    for (let z = -depth / 2 + 1; z < depth / 2; z += arena.sections ? 3.2 : 1.6) {
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
    let deckEntity: pc.Entity | undefined, beam: pc.Entity | undefined, strip: pc.Entity | undefined, rod: pc.Entity | undefined, arm: pc.Entity | undefined;
    const treads: pc.Entity[] = [], wallPanels: pc.Entity[] = [];
    const indicators: pc.Entity[] = [];
    if (o.kind === 'moving-platform' || o.kind === 'disappearing-platform' || o.kind === 'bounce-platform' || o.kind === 'collapse-platform') {
      deckEntity = new pc.Entity('Mechanism deck'); entity.addChild(deckEntity); deckShape(deckEntity, o.width, o.depth, alternate);
      if (o.kind === 'bounce-platform') for (const side of [-1,1]) shape('Spring', 'cylinder', entity, [side*o.width*.3,-1,0],[.28,1.4,.28],accent);
      if (o.kind === 'disappearing-platform' || o.kind === 'collapse-platform') for (const side of [-1, 1]) shape('Vanishing deck outline', 'box', entity, [side * o.width / 2, -0.04, 0], [0.06, 0.06, o.depth], hazard);
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
    if (o.kind === 'laser' || o.kind === 'timed-gate') {
      for (const side of [-1, 1]) {
        shape('Laser emitter', 'box', entity, [side * (o.width / 2 + 0.1), o.height / 2, 0], [0.22, o.height, 0.4], dark);
        indicators.push(shape('Laser signal', 'sphere', entity, [side * (o.width / 2 + 0.1), o.height + 0.15, 0], [0.28, 0.28, 0.28], accent));
      }
      strip = shape('Laser warning strip', 'box', entity, [0, 0.02, 0], [o.width, 0.03, 0.45], dark);
      beam = shape(o.kind === 'laser' ? 'Laser field' : 'Timed solid gate', 'box', entity, [0, o.height / 2, 0], [o.width, o.height, o.depth], ghost);
    }
    if (o.kind === 'pendulum') {
      shape('Pendulum bob', 'sphere', entity, [0,0,0], [o.radius*2,o.radius*2,o.radius*2], hazard);
      rod = shape('Pendulum arm','cylinder',entity,[0,o.length/2,0],[.09,o.length,.09],white);
      shape('Swing crossing warning','box',fixed,[o.x,o.y+.02,o.z],[o.length*1.7,.03,.3],warning);
    }
    if (o.kind === 'moving-wall') {
      const half=(o.width-o.gap)/2;
      for(const side of [-1,1]) {
        wallPanels.push(shape('Moving wall panel','box',entity,[side*(o.gap/2+half/2),o.height/2,0],[half,o.height,o.depth],alternate));
        shape('Safe opening marker','box',entity,[side*(o.gap/2+.06),o.height/2,o.depth/2+.03],[.12,o.height,.08],accent);
      }
      shape('Opening guide','box',entity,[0,.03,1],[o.gap,.04,.18],accent);
    }
    if (o.kind === 'conveyor') {
      shape('Conveyor bed','box',entity,[0,.015,0],[o.width,.025,o.depth],dark);
      for(let i=0;i<6;i++)treads.push(shape('Moving belt tread','box',entity,[0,.04,0],o.velocityX!==0?[.16,.035,o.depth]:[o.width,.035,.16],accent));
    }
    if (o.kind === 'pusher') {
      shape('Pusher head','box',entity,[0,o.height/2,0],[o.width,o.height,o.depth],hazard);
      arm=shape('Piston shaft','box',entity,[0,o.height/2,0],[.01,.18,.22],white);
      shape('Pusher housing','box',fixed,[o.x,o.y+o.height/2,o.z],[1.2,o.height+.3,o.depth+.3],dark);
      indicators.push(shape('Pusher signal','sphere',entity,[0,o.height+.2,0],[.25,.25,.25],accent));
      shape('Pusher warning lane','box',fixed,[0,o.y+.02,o.z],[Math.abs(o.x)*2,.03,.18],warning);
    }
    const deckMeshes = deckEntity ? (deckEntity.findComponents('render') as pc.RenderComponent[]).flatMap(r=>r.meshInstances.map(mesh=>({mesh, original:mesh.material}))) : [];
    return { o, entity, deckEntity, beam, strip, indicators, rod, arm, treads, wallPanels, deckMeshes, lastPhase:'', pose:{x:0,y:0,z:0,angle:0,phase:'safe' as MechanismPhase} };
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
  for (let i = 0; i < (arena.sections ? 180 : 90); i++) shape('Star', 'box', fixed, [Math.sin(i * 127.1) * 65, -16 + ((i * 17) % 28), arena.sections ? -((i*29)%100)/100*(-arena.finish.z) : -80 + ((i * 29) % 120)], [0.14, 0.14, 0.14], white);
  if (arena.sections) {
    for(const section of arena.sections)for(const side of [-1,1])shape('Sector entry marker','box',fixed,[side*4.6,(section.elevation??0)+1.2,-section.start-2],[.16,2.4,.16],accent);
    for(const factor of [.5,.9])shape('Distant sector planet','sphere',fixed,[factor===.5?20:-22,-3,arena.finish.z*factor],[14,14,14],planet);
  }
  for (const route of arena.routes) for (const point of route.points) {
    shape(`Route beacon ${route.name}`, 'box', fixed, [point.x + 1.1, point.y + 0.15, point.z], [0.08, 0.3, 0.08], accent);
  }
  // Scene-specific materials are released on arena switch, not accumulated.
  const ownedMaterials = [deck, alternate, accent, hazard, white, warning, dark, ghost, planet];
  return {
    root,
    ready:true,
    setOverview(value:boolean) {void value;},
    update(state: Readonly<PlayerState>, active=true) {
      void active;
      legacy.forEach((entity, i) => { const o = arena.obstacles[i], at = obstaclePosition(o, state.elapsed); entity.setLocalPosition(at.x, at.y + o.height / 2, at.z); });
      mechanisms.forEach(entry => {
        const {o,entity,deckEntity,beam,strip,indicators,rod,arm,treads,wallPanels,deckMeshes,pose}=entry;
        entity.enabled=Math.abs(o.z-state.z)<80;
        if(!entity.enabled)return;
        const at=sampleMechanism(o,state.elapsed,pose,state.collapseTimes[o.id]);
        entity.setLocalPosition(at.x,at.y,at.z);
        entity.setLocalEulerAngles(0,o.kind==='pendulum'?0:-at.angle*180/Math.PI,0);
        const behind=o.z-state.z>0&&o.z-state.z<4;
        for(const panel of wallPanels){const mesh=panel.render!.meshInstances[0],mat=behind?ghost:alternate;if(mesh.material!==mat)mesh.material=mat;}
        if(rod&&o.kind==='pendulum'){rod.setLocalPosition(-Math.sin(at.angle)*o.length/2,Math.cos(at.angle)*o.length/2,0);rod.setLocalEulerAngles(0,0,at.angle*180/Math.PI);}
        if(deckEntity){
          const falling=o.kind==='collapse-platform'&&at.phase==='hidden'&&state.elapsed-(state.collapseTimes[o.id]??0)<o.delay+1.2;
          deckEntity.enabled=at.phase!=='hidden'||falling;
          if(entry.lastPhase!==at.phase)for(const {mesh,original} of deckMeshes)mesh.material=at.phase==='warning'?warning:original;
        }
        if(o.kind==='conveyor')for(const [i,tread] of treads.entries()){
          const span=o.velocityX!==0?o.width:o.depth, velocity=o.velocityX!==0?o.velocityX:o.velocityZ;
          const offset=((i/6*span+state.elapsed*velocity)%span+span)%span-span/2;
          tread.setLocalPosition(o.velocityX!==0?offset:0,.04,o.velocityX!==0?0:offset);
        }
        if(arm&&o.kind==='pusher'){
          arm.setLocalPosition((o.x-at.x)/2,o.height/2,0);arm.setLocalScale(Math.max(.01,Math.abs(o.x-at.x)),.18,.22);
        }
        if(indicators.length)for(const signal of indicators){
          signal.render!.meshInstances[0].material=at.phase==='safe'?accent:at.phase==='warning'?warning:hazard;
          const size=at.phase==='warning'?.3+Math.sin(state.elapsed*18)*.09:.28;signal.setLocalScale(size,size,size);
        }
        if(beam&&(o.kind==='laser'||o.kind==='timed-gate')){
          beam.enabled=o.kind==='timed-gate'||at.phase!=='safe';
          beam.render!.meshInstances[0].material=o.kind==='timed-gate'?(at.phase==='active'?(behind?ghost:alternate):accent):at.phase==='warning'?warning:ghost;
          strip!.render!.meshInstances[0].material=at.phase==='safe'?dark:at.phase==='warning'?warning:hazard;
          beam.setLocalScale(o.width,at.phase==='active'?o.height:.08,o.depth);
          beam.setLocalPosition(0,at.phase==='active'?o.height/2:o.kind==='timed-gate'?4.1:.04,0);
        }
        entry.lastPhase=at.phase;
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
