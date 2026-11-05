import { expect,it,vi } from 'vitest';
import * as pc from 'playcanvas';
import { createPolishEffects, POLISH_EFFECT_LIMITS } from './polish-effects';
import { createPlayer } from './physics';
import { arenas } from '@minimorph/game-content';
import type { ShapeFactory } from './character';
vi.mock('playcanvas',()=>{
 class Entity { enabled=true;render?:{meshInstances:{material:unknown}[]};constructor(public name:string){}addComponent(){this.render={meshInstances:[{material:undefined}]};}children:Entity[]=[];addChild(child:Entity){this.children.push(child);}position={x:0,y:0,z:0};setLocalPosition(x:number,y:number,z:number){this.position={x,y,z};}getLocalPosition(){return this.position;}setLocalScale(){}destroy=vi.fn(); }
 class Color { fromString(){return this;}copy(){return this;} }
 class Material { diffuse=new Color();emissive=new Color();update(){}destroy=vi.fn(); }
 class Texture { lock(){return new Uint8Array(64*64*4);}unlock(){}destroy=vi.fn(); }
 return { Entity,Color,StandardMaterial:Material,Texture,PIXELFORMAT_RGBA8:1,FILTER_LINEAR:1,BLEND_NORMAL:1 };
});
it('reuses a bounded shared pool for eight-player feedback, expires and destroys all resources',()=>{
 const root=new pc.Entity('Effects'), created:pc.Entity[]=[];
 const shape:ShapeFactory=(name,_type,parent,_position,_scale,material)=>{const e=new pc.Entity(name);e.addComponent('render',{type:'box'});e.render!.meshInstances[0].material=material;parent.addChild(e);created.push(e);return e;};
 const effects=createPolishEffects({graphicsDevice:{}} as pc.Application,root,shape), initial=created.length;
 for(let i=0;i<100;i++)effects.emit({kind:'jump',playerId:String(i%8),remote:i>0,x:0,y:0,z:0});
 expect(created).toHaveLength(initial);expect(effects.active).toBe(POLISH_EFFECT_LIMITS.sparks);
 effects.begin(arenas[0],1);expect(effects.active).toBe(0);
 const state=createPlayer(arenas[0]);state.action='slide';effects.track('local',state,false,.2);expect(effects.active).toBeGreaterThan(0);
 effects.end();effects.reset();expect(effects.active).toBe(0);expect(created.every(e=>!e.enabled)).toBe(true);
 effects.emit({kind:'land',playerId:'local',remote:false,x:20,y:3,z:2});
 expect(created.filter(e=>e.enabled).every(e=>e.getLocalPosition().x===20)).toBe(true);
 effects.destroy();effects.destroy();expect(created.every(e=>vi.mocked(e.destroy).mock.calls.length===1)).toBe(true);
 effects.emit({kind:'victory',playerId:'late',remote:true,x:0,y:0,z:0});expect(effects.active).toBe(0);
});

it('refreshes contact supports when Race and Training share an arena id',()=>{
 const root=new pc.Entity('Effects');
 const shape:ShapeFactory=(name,_type,parent,_position,_scale,material)=>{const e=new pc.Entity(name);e.addComponent('render',{type:'box'});e.render!.meshInstances[0].material=material;parent.addChild(e);return e;};
 const first={...arenas[0],platforms:[{x:0,y:0,z:0,width:20,depth:20}],mechanisms:[],obstacles:[]};
 const second={...first,platforms:[{x:0,y:.6,z:0,width:20,depth:20}]};
 const effects=createPolishEffects({graphicsDevice:{}} as pc.Application,root,shape), state=createPlayer(first);
 state.grounded=false;state.y=1;
 effects.begin(first,0);effects.track('local',state,false,0);
 const shadow=root.children.find(node=>node.name==='Soft character contact shadow')!;
 expect(shadow.getLocalPosition().y).toBeCloseTo(.018);
 effects.begin(second,0);effects.track('local',state,false,0);
 expect(shadow.getLocalPosition().y).toBeCloseTo(.618);effects.destroy();
});
