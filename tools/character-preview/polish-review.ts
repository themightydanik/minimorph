import * as pc from 'playcanvas';
import { arenas } from '@minimorph/game-content';
import { createGame, animatedCharacterSource, createPlayer } from '@minimorph/game-engine';
import { characterConfig } from '../../packages/game-ui/src/character-config';
import type { PlayerState } from '@minimorph/game-engine';
const query = new URLSearchParams(location.search), arena = arenas.find(a => a.id === query.get('arena')) ?? arenas[0];
const action = query.get('action') ?? 'arena', canvas = document.querySelector('canvas')!;
const state = createPlayer(arena);
Object.assign(state, { elapsed: 1.2 });
if (action === 'dive') Object.assign(state, { action: 'dive', grounded: false, y: 1.1, vy: -1, vz: -7 });
if (action === 'slide') Object.assign(state, { action: 'slide', actionTime: .3, vz: -6 });
if (action === 'recover') Object.assign(state, { action: 'recover', actionTime: .11, vz: -.5 });
const remoteState = createPlayer(arena); remoteState.x = 2;
const remotes = query.has('crowd') ? [{ id:'review-remote', name:'Review remote', bot:false, color:1, connected:true, ack:0, status:'racing' as const, finishTime:null, state:remoteState }] : [];
let app: pc.Application;
const source = { async load(application: pc.Application, signal: AbortSignal) { app = application; return animatedCharacterSource(characterConfig).load(application, signal); } };
const game = createGame(canvas, () => ({ x: 0, z: 0, jump: false }), () => {}, { character: source, remoteCharacter: animatedCharacterSource({ ...characterConfig, reportOnCanvas:false }) });
game.setOnline({ frame: () => ({ local: state, remotes, elapsed: state.elapsed, phase: 'racing', yaw: 0 }) }, arena.id);
const cameraPosition = action === 'arena' || action === 'vfx' ? [0, 5.7, 9.5] : [3.2, 2.1, 5.2];
const timer = setInterval(() => {
  if (!app) return;
  clearInterval(timer);
  app.on('prerender', () => {
    const camera = app.root.findByName('Follow camera') as pc.Entity;
    camera.setPosition(cameraPosition[0], cameraPosition[1], cameraPosition[2]); camera.lookAt(0, action === 'arena' || action === 'vfx' ? 1 : .65, 1.8); camera.camera!.fov = 58;
  });
  (window as unknown as { reviewReady: boolean }).reviewReady = true;
}, 10);
(window as unknown as { reviewEvent: (event: PlayerState['lastEvent']) => void }).reviewEvent = event => { state.eventSerial++; state.lastEvent = event; };
document.querySelector('#label')!.textContent = `${arena.name} · ${action} · production character · fixed review camera`;
window.addEventListener('pagehide', () => { clearInterval(timer); game.destroy(); });
(window as unknown as { reviewFreeze: () => void }).reviewFreeze = () => { app.timeScale = 0; };

(window as unknown as { reviewRemoteEvent: (event: PlayerState['lastEvent']) => void }).reviewRemoteEvent = event => { remoteState.eventSerial++; remoteState.lastEvent = event; };
(window as unknown as { reviewInfo: () => unknown }).reviewInfo = () => {
  const root = app.root.findByName('Character action presentation')!;
  const bone = root.findByName('Root')!;
  return { wholeCharacterPitch:root.getLocalEulerAngles().x, bonePitch:bone.getLocalEulerAngles().x, bufferWidth:app.graphicsDevice.width, cssWidth:canvas.clientWidth, dpr:devicePixelRatio };
};

(window as unknown as { reviewStopAction: () => void }).reviewStopAction = () => { state.action = 'normal'; state.vx = state.vz = 0; };

(window as unknown as { reviewCue:(kind:string)=>void }).reviewCue = kind => {
  if(kind==='checkpoint') state.checkpoint++;
  else if(kind==='victory') state.won=true;
  else if(kind==='dive') {state.action='dive';state.grounded=false;state.y=.7;state.vy=-1;}
  else if(kind==='slide') {state.action='slide';state.actionTime=.4;state.vz=-6;}
  else {state.eventSerial++;state.lastEvent=kind==='collision'?'hit':kind==='jump'?'jump':'land';}
};
