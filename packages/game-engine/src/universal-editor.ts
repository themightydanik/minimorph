import * as pc from "playcanvas";
import { arenas, validateCompiledLevel } from "@minimorph/game-content";
import type { ArenaConfig, ArenaObstacle } from "@minimorph/game-content";
import type { LocalPlaytestStart } from "./playtest-start";
import { editorAssetUrls } from "./editor-assets";
import "./editor.css";

type Launch = (host: HTMLElement, arena: ArenaConfig, urls: Record<string,string>, onExit:()=>void, start?:LocalPlaytestStart)=>{destroy():void};
type Layer = "platforms"|"mechanisms"|"checkpoints"|"visuals"|"environment"|"routes"|"spawn"|"finish";
type Point = {x:number;y:number;z:number};
const clone = <T>(x:T):T=>structuredClone(x);
const storageKey=(id:string)=>`minimorph.editor.3d.${id}.v1`;
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
function validateDraft(input:unknown,base:ArenaConfig):ArenaConfig {
  if(!input||typeof input!=="object")throw Error("Invalid arena JSON");
  const a=input as ArenaConfig;
  if(a.id!==base.id)throw Error("Track ID must not change");
  for(const key of ["platforms","mechanisms","checkpoints","routes"] as const)if(!Array.isArray(a[key])||a[key].length>2000)throw Error("Invalid "+key);
  for(const p of [...a.platforms,...a.mechanisms,...a.checkpoints,a.spawn,a.finish])
    if(![p.x,p.y,p.z].every(finite))throw Error("Non-finite coordinates");
  for(const p of a.platforms)if(!finite(p.width)||!finite(p.depth)||p.width<=0||p.depth<=0)throw Error("Invalid platform size");
  return a;
}
export function mountUniversalEditor(host:HTMLElement,launch:Launch) {
  let base=arenas[0],draft=clone(base),layer:Layer="platforms",selected=0;
  let playSession:ReturnType<Launch>|undefined,drag=false,orbit=false,lastX=0,lastY=0;
  const wrapper=document.createElement("main");
  wrapper.className="level-editor";
  wrapper.innerHTML=`<header><b>Minimorph · Universal 3D Track Editor</b><label>Track <select data-track></select></label><label>Objects <select data-layer><option value="platforms">Platforms</option><option value="mechanisms">Mechanisms</option><option value="checkpoints">Checkpoints</option><option value="spawn">Spawn</option><option value="finish">Finish</option><option value="routes">Routes</option><option value="visuals">Visuals</option><option value="environment">Environment</option></select></label><button data-play>▶ Playtest</button><button data-save>Save draft</button><button data-restore>Restore</button><button data-export>Export JSON</button><button data-import>Import JSON</button><input data-file type="file" accept=".json,application/json" hidden><a href="/">Back</a></header>
  <aside><h3>Scene hierarchy</h3><select data-items size="14" style="width:100%"></select><button data-add>Add object</button><button data-duplicate>Duplicate</button><button data-delete>Delete</button><button data-reset>Reset track</button><p>Click an object to select. Drag with left mouse to move on X/Z. Right drag to orbit, mouse wheel to zoom.</p><p>Draft only. Publishing requires a reviewed PR.</p></aside>
  <section class="editor-viewport"><canvas data-canvas aria-label="3D track editor" tabindex="0" style="width:100%;height:100%"></canvas><output data-status role="status"></output></section>
  <aside><h3>Inspector</h3><div data-fields></div><details><summary>Advanced full arena JSON (routes, colliders, visuals)</summary><textarea data-json style="width:100%;height:280px" spellcheck="false"></textarea><button data-apply>Apply JSON</button></details><p>Movement does not automatically regenerate bot routes. Static checks and local Playtest are not multiplayer certification.</p></aside>`;
  host.replaceChildren(wrapper);
  const q=<T extends HTMLElement>(s:string)=>wrapper.querySelector<T>(s)!;
  const status=q<HTMLOutputElement>("[data-status]"),canvas=q<HTMLCanvasElement>("[data-canvas]");
  const app=new pc.Application(canvas,{graphicsDeviceOptions:{deviceTypes:["webgl2"],antialias:false,powerPreference:"low-power"}});
  app.setCanvasFillMode(pc.FILLMODE_NONE,canvas.parentElement!.clientWidth,canvas.parentElement!.clientHeight);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const camera=new pc.Entity("Editor camera");
  camera.addComponent("camera",{clearColor:new pc.Color().fromString("#101a38"),farClip:8000,nearClip:0.1,fov:55});
  app.root.addChild(camera);
  const light=new pc.Entity("Sun");light.addComponent("light",{type:"directional",intensity:1.4,castShadows:false});light.setEulerAngles(45,30,0);app.root.addChild(light);
  const ambient=new pc.Color(.42,.48,.65);app.scene.ambientLight=ambient;
  let sceneRoot=new pc.Entity("Track"),picks:Array<{entity:pc.Entity;layer:Layer;index:number}>=[];
  app.root.addChild(sceneRoot);
  const material=(color:string)=>{const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(color);m.update();return m;};
  const mats={platform:material("#477fa8"),mechanism:material("#ef9d6c"),checkpoint:material("#b8f582"),selected:material("#ffdd66"),visual:material("#b18ef5"),spawn:material("#67efbe"),finish:material("#f277a0"),route:material("#e6e8f4")};
  let target=new pc.Vec3(0,0,-100),azimuth=.6,elevation=.8,distance=180;
  function positionCamera(){const d=Math.cos(elevation)*distance;camera.setPosition(target.x+Math.sin(azimuth)*d,target.y+Math.sin(elevation)*distance,target.z+Math.cos(azimuth)*d);camera.lookAt(target);}
  function arr(l:Layer):Array<Record<string,unknown>>{
    if(l==="spawn")return [draft.spawn as unknown as Record<string,unknown>];
    if(l==="finish")return [draft.finish as unknown as Record<string,unknown>];
    return (draft[l]??[]) as unknown as Array<Record<string,unknown>>;
  }
  function current(){return arr(layer)[selected];}
  function addBox(l:Layer,i:number,p:Point,size:[number,number,number],mat:pc.StandardMaterial){
    const e=new pc.Entity(`${l}-${i}`);e.addComponent("render",{type:"box",material:mat});e.setLocalScale(...size);e.setPosition(p.x,p.y+(l==="platforms"?-.38:0),p.z);sceneRoot.addChild(e);picks.push({entity:e,layer:l,index:i});
  }
  function rebuild(){
    sceneRoot.destroy();sceneRoot=new pc.Entity("Track");app.root.addChild(sceneRoot);picks=[];
    draft.platforms.forEach((p,i)=>addBox("platforms",i,p,[p.width,.75,p.depth],layer==="platforms"&&selected===i?mats.selected:mats.platform));
    draft.mechanisms.forEach((m,i)=>{const o=m as ArenaObstacle;const w=("width" in o?o.width:"length" in o?o.length:"radius" in o?o.radius*2:2)||2;const d=("depth" in o?o.depth:1.4)||1.4;const h=("height" in o?o.height:.8)||.8;addBox("mechanisms",i,o,[w,h,d],layer==="mechanisms"&&selected===i?mats.selected:mats.mechanism);});
    draft.checkpoints.forEach((p,i)=>addBox("checkpoints",i,p,[1.2,2.5,1.2],layer==="checkpoints"&&selected===i?mats.selected:mats.checkpoint));
    addBox("spawn",0,draft.spawn,[2,2,2],layer==="spawn"?mats.selected:mats.spawn);
    addBox("finish",0,draft.finish,[2,3,2],layer==="finish"?mats.selected:mats.finish);
    for(const l of ["visuals","environment"] as const)(draft[l]??[]).forEach((p,i)=>addBox(l,i,p,[Math.max(.4,p.width||1),.5,Math.max(.4,p.depth||1)],layer===l&&selected===i?mats.selected:mats.visual));
    draft.routes.forEach((r,i)=>r.points.forEach((p,j)=>addBox("routes",i,p,[.35,.35,.35],layer==="routes"&&selected===i?mats.selected:mats.route)));
  }
  const items=q<HTMLSelectElement>("[data-items]");
  function inspector(){
    const o=current();const box=q<HTMLElement>("[data-fields]");box.replaceChildren();
    if(!o)return;
    for(const [name,value] of Object.entries(o)){
      if(typeof value!=="number"&&typeof value!=="string")continue;
      const label=document.createElement("label");label.style.display="block";label.textContent=name+" ";
      const input=document.createElement("input");input.value=String(value);
      if(typeof value==="number"){input.type="number";input.step="0.1";}
      input.addEventListener("change",()=>{const v=typeof value==="number"?Number(input.value):input.value;if(typeof v==="number"&&!finite(v))return;o[name]=v;rebuild();syncJson();});
      label.append(input);box.append(label);
    }
    if(layer==="routes")box.textContent="Edit route points in Advanced JSON; route objects are displayed as markers.";
  }
  function syncJson(){q<HTMLTextAreaElement>("[data-json]").value=JSON.stringify(draft,null,2);}
  function refresh(){items.replaceChildren();arr(layer).forEach((o,i)=>{const opt=document.createElement("option");opt.value=String(i);opt.textContent=String(o.id??o.name??`${layer} #${i+1}`);items.add(opt);});selected=Math.min(selected,Math.max(0,items.length-1));items.value=String(selected);rebuild();inspector();syncJson();}
  const track=q<HTMLSelectElement>("[data-track]");for(const a of arenas){const opt=document.createElement("option");opt.value=a.id;opt.textContent=a.name;track.add(opt);}
  track.addEventListener("change",()=>{base=arenas.find(a=>a.id===track.value)!;draft=clone(base);selected=0;target.set(0,0,-Math.max(50,Math.abs(base.finish.z)/2));distance=Math.max(80,Math.abs(base.finish.z)*.75);positionCamera();refresh();status.textContent="Switched track. Save/export previous edits before switching.";});
  q<HTMLSelectElement>("[data-layer]").addEventListener("change",e=>{layer=(e.target as HTMLSelectElement).value as Layer;selected=0;refresh();});
  items.addEventListener("change",()=>{selected=Number(items.value);rebuild();inspector();});
  q("[data-add]").addEventListener("click",()=>{if(layer==="spawn"||layer==="finish"||layer==="routes"){status.textContent="Use Advanced JSON for this layer.";return;}const list=arr(layer);let o:Record<string,unknown>;
    if(layer==="platforms")o={x:target.x,y:0,z:target.z,width:8,depth:8};
    else if(layer==="mechanisms")o={id:`editor-${crypto.randomUUID()}`,kind:"solid-box",x:target.x,y:0,z:target.z,width:2,depth:2,height:1,period:1};
    else if(layer==="checkpoints")o={x:target.x,y:0,z:target.z,radius:1.5};
    else o={id:`editor-${crypto.randomUUID()}`,asset:"main-floor-tile",x:target.x,y:0,z:target.z,width:4,depth:4};
    list.push(o);selected=list.length-1;refresh();});
  q("[data-duplicate]").addEventListener("click",()=>{if(["spawn","finish","routes"].includes(layer))return;const o=current();if(!o)return;const c=clone(o);c.x=Number(c.x)+3;if(typeof c.id==="string")c.id=`editor-${crypto.randomUUID()}`;arr(layer).push(c);selected=arr(layer).length-1;refresh();});
  q("[data-delete]").addEventListener("click",()=>{if(["spawn","finish","routes"].includes(layer))return;arr(layer).splice(selected,1);selected=Math.max(0,selected-1);refresh();});
  q("[data-reset]").addEventListener("click",()=>{draft=clone(base);refresh();status.textContent="Reset draft to published track.";});
  const pointer=(e:PointerEvent)=>{const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};};
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  canvas.addEventListener("pointerdown",e=>{lastX=e.clientX;lastY=e.clientY;if(e.button===2){orbit=true;canvas.setPointerCapture(e.pointerId);return;}const p=pointer(e);let best=25*25,hit:typeof picks[number]|undefined;
    for(const item of picks){const s=camera.camera!.worldToScreen(item.entity.getPosition());const d=(s.x-p.x)**2+(s.y-p.y)**2;if(s.z>0&&d<best){best=d;hit=item;}}
    if(hit){layer=hit.layer;selected=hit.index;q<HTMLSelectElement>("[data-layer]").value=layer;drag=layer!=="routes";canvas.setPointerCapture(e.pointerId);refresh();}
  });
  canvas.addEventListener("pointermove",e=>{const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
    if(orbit){azimuth-=dx*.007;elevation=Math.max(.15,Math.min(1.5,elevation+dy*.007));positionCamera();}
    else if(drag){const o=current();if(!o||!finite(o.x)||!finite(o.z))return;const speed=distance*.0016;o.x=Math.round((o.x-dx*Math.cos(azimuth)*speed+dy*Math.sin(azimuth)*speed)*4)/4;o.z=Math.round((o.z+dx*Math.sin(azimuth)*speed+dy*Math.cos(azimuth)*speed)*4)/4;rebuild();inspector();syncJson();}
  });
  canvas.addEventListener("pointerup",()=>{drag=false;orbit=false;});canvas.addEventListener("pointercancel",()=>{drag=false;orbit=false;});
  canvas.addEventListener("wheel",e=>{e.preventDefault();distance=Math.max(8,Math.min(3000,distance*Math.exp(e.deltaY*.001)));positionCamera();},{passive:false});
  q("[data-save]").addEventListener("click",()=>{try{localStorage.setItem(storageKey(base.id),JSON.stringify(validateDraft(draft,base)));status.textContent="Saved in this browser only.";}catch(e){status.textContent=String(e);}});
  q("[data-restore]").addEventListener("click",()=>{try{const raw=localStorage.getItem(storageKey(base.id));if(!raw)throw Error("No saved draft");draft=validateDraft(JSON.parse(raw),base);refresh();status.textContent="Draft restored.";}catch(e){status.textContent=String(e);}});
  q("[data-export]").addEventListener("click",()=>{try{const data=JSON.stringify(validateDraft(draft,base),null,2),url=URL.createObjectURL(new Blob([data],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`minimorph-${base.id}-arena-draft.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent="Exported for reviewed PR; production unchanged.";}catch(e){status.textContent=String(e);}});
  q("[data-import]").addEventListener("click",()=>q<HTMLInputElement>("[data-file]").click());
  q<HTMLInputElement>("[data-file]").addEventListener("change",async e=>{try{const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;if(f.size>2*1024*1024)throw Error("File exceeds 2 MiB");draft=validateDraft(JSON.parse(await f.text()),base);refresh();status.textContent="Imported draft.";}catch(err){status.textContent=String(err);}finally{(e.target as HTMLInputElement).value="";}});
  q("[data-apply]").addEventListener("click",()=>{try{draft=validateDraft(JSON.parse(q<HTMLTextAreaElement>("[data-json]").value),base);refresh();status.textContent="Applied JSON draft.";}catch(e){status.textContent=String(e);}});
  const playHost=document.createElement("div");host.append(playHost);playHost.hidden=true;
  q("[data-play]").addEventListener("click",()=>{try{const arena=validateDraft(draft,base),report=validateCompiledLevel(arena);if(report.diagnostics.some(d=>d.severity==="error"))throw Error("Static validation errors; fix before Playtest");wrapper.hidden=true;playHost.hidden=false;app.autoRender=false;playSession=launch(playHost,arena,editorAssetUrls,()=>{playSession?.destroy();playSession=undefined;playHost.hidden=true;wrapper.hidden=false;app.autoRender=true;});}catch(e){wrapper.hidden=false;playHost.hidden=true;app.autoRender=true;status.textContent=String(e);}});
  const resize=new ResizeObserver(()=>app.resizeCanvas(canvas.parentElement!.clientWidth,canvas.parentElement!.clientHeight));resize.observe(canvas.parentElement!);
  target.set(0,0,-Math.max(50,Math.abs(base.finish.z)/2));distance=Math.max(80,Math.abs(base.finish.z)*.75);positionCamera();refresh();app.start();
  return {destroy(){playSession?.destroy();resize.disconnect();sceneRoot.destroy();app.destroy();wrapper.remove();playHost.remove();}};
}
