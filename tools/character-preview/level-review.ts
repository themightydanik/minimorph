import * as pc from 'playcanvas';
import { arenas } from '@minimorph/game-content';
import { createGame, animatedCharacterSource, createPlayer } from '@minimorph/game-engine';
import { characterConfig } from '../../packages/game-ui/src/character-config';
const query=new URLSearchParams(location.search), arena=arenas.find(a=>a.id===query.get('arena'))??arenas[0];
const section=arena.sections![Number(query.get('section')??0)], distance=section.start;
const state=createPlayer(arena);Object.assign(state,{z:-(distance+4),y:section.elevation??0,elapsed:1.2});
let app:pc.Application;
const source={async load(application:pc.Application,signal:AbortSignal){app=application;return animatedCharacterSource(characterConfig).load(application,signal);}};
const game=createGame(document.querySelector('canvas')!,()=>({x:0,z:0,jump:false}),()=>{},{character:source});
game.setOnline({frame:()=>({local:state,remotes:[],elapsed:state.elapsed,phase:'racing',yaw:0})},arena.id);
const timer=setInterval(()=>{
 if(!app)return;clearInterval(timer);
 app.on('prerender',()=>{const camera=app.root.findByName('Follow camera') as pc.Entity;camera.setPosition(18,23,18-distance);camera.lookAt(0,1.8,-distance-24);camera.camera!.fov=62;});
 (window as unknown as {levelReviewReady:boolean}).levelReviewReady=true;
},10);
document.querySelector('#label')!.textContent=`${arena.name} · sector ${Number(query.get('section')??0)+1} · fixed camera / simulation phase 1.2s`;
(window as unknown as {levelReviewFreeze:()=>void}).levelReviewFreeze=()=>{app.timeScale=0;};
window.addEventListener('pagehide',()=>{clearInterval(timer);game.destroy();});
