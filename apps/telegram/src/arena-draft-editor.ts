import { arenas, validateCompiledLevel } from "@minimorph/game-content";
import type { ArenaConfig } from "@minimorph/game-content";
import { editorAssetUrls } from "@minimorph/game-engine/editor";
import type { LocalPlaytestStart } from "@minimorph/game-engine";

type Launch = (host: HTMLElement, arena: ArenaConfig, urls: Record<string,string>, onExit: () => void, start?: LocalPlaytestStart) => { destroy(): void };
const copy = <T>(v: T): T => structuredClone(v);
const key = (id: string) => `minimorph.editor.arena.${id}.v1`;
type Editable = "platforms" | "mechanisms" | "checkpoints";
function checkArena(value: unknown, original: ArenaConfig): ArenaConfig {
  if (!value || typeof value !== "object") throw Error("Expected arena object");
  const a = value as ArenaConfig;
  if (a.id !== original.id) throw Error("Arena ID cannot change");
  if (!Array.isArray(a.platforms) || !Array.isArray(a.mechanisms) || !Array.isArray(a.checkpoints)) throw Error("Missing gameplay arrays");
  if (a.platforms.length > 1000 || a.mechanisms.length > 1000 || a.checkpoints.length > 200) throw Error("Too many objects");
  const numbers = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
  for (const p of a.platforms) if (![p.x,p.y,p.z,p.width,p.depth].every(numbers) || p.width <= 0 || p.depth <= 0) throw Error("Invalid platform geometry");
  for (const o of a.mechanisms) if (!o || typeof o !== "object" || ![o.x,o.y,o.z].every(numbers) || typeof o.kind !== "string") throw Error("Invalid mechanism");
  for (const c of a.checkpoints) if (![c.x,c.y,c.z,c.radius].every(numbers) || c.radius <= 0) throw Error("Invalid checkpoint");
  // This authoring surface does not certify collision, route traversal or publication.
  return a;
}
export function mountArenaDraftEditor(host: HTMLElement, launch: Launch) {
  const originals = arenas;
  let base = originals[0], draft = copy(base), kind: Editable = "platforms", selected = 0;
  let session: ReturnType<Launch> | undefined;
  const root = document.createElement("div");
  root.style.cssText = "min-height:100vh;background:#10172d;color:#eef3ff;font:14px system-ui;padding:18px;box-sizing:border-box";
  root.innerHTML = `<h2>Minimorph · Multi-level draft editor</h2><p>Browser drafts only. Publishing requires a reviewed code PR. Top-down editing is available for platforms, mechanisms and checkpoints; other properties can be edited in JSON.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <label>Track <select data-level></select></label><label>Layer <select data-layer><option value="platforms">Platforms</option><option value="mechanisms">Mechanisms</option><option value="checkpoints">Checkpoints</option></select></label>
      <button data-save>Save browser draft</button><button data-restore>Restore</button><button data-export>Export JSON</button><button data-import>Import JSON</button><input data-file type="file" accept=".json,application/json" hidden>
      <button data-reset>Reset draft</button><button data-play>▶ Playtest</button><a style="color:#8fe6ff" href="/">Back to game</a>
    </div>
    <div style="display:flex;gap:18px;flex-wrap:wrap">
      <canvas data-map width="780" height="620" style="width:min(100%,780px);background:#18233c;border:1px solid #506184;touch-action:none"></canvas>
      <section style="flex:1;min-width:270px"><p data-info></p><p>Drag a selected marker to reposition it on X/Z. Use fields for exact coordinates. JSON editing is advanced and may produce an unplayable draft.</p>
        <div data-fields></div><details><summary>Advanced: full ArenaConfig JSON</summary><textarea data-json spellcheck="false" style="width:100%;height:260px;background:#0a1121;color:white"></textarea><button data-apply>Apply JSON</button></details>
        <p data-status role="status"></p>
      </section>
    </div>`;
  host.replaceChildren(root);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const level = q<HTMLSelectElement>("[data-level]");
  for (const a of originals) { const o = document.createElement("option");o.value=a.id;o.textContent=a.name;level.add(o); }
  const canvas=q<HTMLCanvasElement>("[data-map]"), ctx=canvas.getContext("2d")!;
  const status=q<HTMLElement>("[data-status]");
  let bounds={minX:-15,maxX:15,minZ:-200,maxZ:10};
  const entries=()=>draft[kind] as Array<{x:number;y:number;z:number}>;
  const updateBounds=()=>{
    const ps=draft.platforms, xs=ps.map(p=>p.x), zs=ps.map(p=>p.z);
    bounds={minX:Math.min(-15,...xs)-20,maxX:Math.max(15,...xs)+20,minZ:Math.min(-30,...zs)-30,maxZ:Math.max(10,...zs)+30};
  };
  const xy=(x:number,z:number)=>({x:24+(x-bounds.minX)/(bounds.maxX-bounds.minX)*732,y:24+(z-bounds.minZ)/(bounds.maxZ-bounds.minZ)*572});
  const world=(x:number,y:number)=>({x:bounds.minX+(x-24)/732*(bounds.maxX-bounds.minX),z:bounds.minZ+(y-24)/572*(bounds.maxZ-bounds.minZ)});
  function draw(){
    updateBounds();ctx.clearRect(0,0,780,620);ctx.strokeStyle="#354663";
    for(let i=0;i<=10;i++){ctx.beginPath();ctx.moveTo(24+i*73.2,24);ctx.lineTo(24+i*73.2,596);ctx.stroke();}
    for(const p of draft.platforms){const a=xy(p.x-p.width/2,p.z-p.depth/2),b=xy(p.x+p.width/2,p.z+p.depth/2);ctx.fillStyle="#376c85";ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);}
    for(const [i,o] of entries().entries()){const p=xy(o.x,o.z);ctx.beginPath();ctx.arc(p.x,p.y,i===selected?8:5,0,Math.PI*2);ctx.fillStyle=i===selected?"#ffce66":"#f38fc5";ctx.fill();if(i===selected){ctx.fillStyle="#fff";ctx.fillText(String(i),p.x+12,p.y-10);}}
    const spawn=xy(draft.spawn.x,draft.spawn.z),finish=xy(draft.finish.x,draft.finish.z);
    ctx.fillStyle="#8bffac";ctx.fillText("START",spawn.x+4,spawn.y);ctx.fillStyle="#ff8d8d";ctx.fillText("FINISH",finish.x+4,finish.y);
  }
  function fields(){
    const arr=entries();selected=Math.min(Math.max(0,selected),Math.max(0,arr.length-1));
    q<HTMLElement>("[data-info]").textContent=`${draft.name} · ${kind}: ${arr.length} · selected: ${selected}`;
    const target=arr[selected];const box=q<HTMLElement>("[data-fields]");box.replaceChildren();
    if(!target)return;
    for(const prop of Object.keys(target)){
      const value=(target as unknown as Record<string,unknown>)[prop];
      if(typeof value!=="number")continue;
      const label=document.createElement("label");label.textContent=prop+" ";label.style.display="block";
      const input=document.createElement("input");input.type="number";input.step="0.1";input.value=String(value);
      input.addEventListener("change",()=>{const n=Number(input.value);if(!Number.isFinite(n))return;(target as unknown as Record<string,number>)[prop]=n;draw();syncJson();});
      label.append(input);box.append(label);
    }
  }
  function syncJson(){q<HTMLTextAreaElement>("[data-json]").value=JSON.stringify(draft,null,2);}
  function refresh(){draw();fields();syncJson();}
  level.addEventListener("change",()=>{base=originals.find(a=>a.id===level.value)!;draft=copy(base);selected=0;refresh();status.textContent="Switched level; unsaved in-memory changes to previous level are not retained. Save/export before switching.";});
  q<HTMLSelectElement>("[data-layer]").addEventListener("change",e=>{kind=(e.target as HTMLSelectElement).value as Editable;selected=0;refresh();});
  let dragging=false;
  canvas.addEventListener("pointerdown",e=>{const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*780/rect.width,y=(e.clientY-rect.top)*620/rect.height;let best=18*18,idx=-1;entries().forEach((o,i)=>{const p=xy(o.x,o.z),d=(p.x-x)**2+(p.y-y)**2;if(d<best){best=d;idx=i;}});if(idx>=0){selected=idx;dragging=true;canvas.setPointerCapture(e.pointerId);fields();draw();}});
  canvas.addEventListener("pointermove",e=>{if(!dragging)return;const rect=canvas.getBoundingClientRect(),p=world((e.clientX-rect.left)*780/rect.width,(e.clientY-rect.top)*620/rect.height),o=entries()[selected];if(!o)return;o.x=Math.round(p.x*4)/4;o.z=Math.round(p.z*4)/4;draw();fields();syncJson();});
  canvas.addEventListener("pointerup",()=>dragging=false);canvas.addEventListener("pointercancel",()=>dragging=false);
  q("[data-save]").addEventListener("click",()=>{try{localStorage.setItem(key(base.id),JSON.stringify(checkArena(draft,base)));status.textContent="Saved to this browser, not published.";}catch(e){status.textContent=String(e);}});
  q("[data-restore]").addEventListener("click",()=>{try{const raw=localStorage.getItem(key(base.id));if(!raw)throw Error("No saved draft");draft=checkArena(JSON.parse(raw),base);refresh();status.textContent="Restored browser draft.";}catch(e){status.textContent=String(e);}});
  q("[data-reset]").addEventListener("click",()=>{draft=copy(base);selected=0;refresh();status.textContent="Restored published baseline in editor only.";});
  q("[data-export]").addEventListener("click",()=>{try{const data=JSON.stringify(checkArena(draft,base),null,2),url=URL.createObjectURL(new Blob([data],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=`minimorph-${base.id}-arena-draft.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent="Exported draft. Send to coding agent for reviewed publication PR.";}catch(e){status.textContent=String(e);}});
  q("[data-import]").addEventListener("click",()=>q<HTMLInputElement>("[data-file]").click());
  q<HTMLInputElement>("[data-file]").addEventListener("change",async e=>{try{const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;if(f.size>2*1024*1024)throw Error("File too large");draft=checkArena(JSON.parse(await f.text()),base);refresh();status.textContent="Imported draft. Not published.";}catch(err){status.textContent=String(err);}finally{(e.target as HTMLInputElement).value="";}});
  q("[data-apply]").addEventListener("click",()=>{try{draft=checkArena(JSON.parse(q<HTMLTextAreaElement>("[data-json]").value),base);refresh();status.textContent="Applied JSON; inspect and playtest before export.";}catch(e){status.textContent=String(e);}});
  const playHost=document.createElement("div");host.append(playHost);playHost.hidden=true;
  q("[data-play]").addEventListener("click",()=>{try{const arena=checkArena(draft,base),report=validateCompiledLevel(arena);if(report.diagnostics.some(d=>d.severity==="error"))throw Error("Static validation errors; fix before playtest.");root.hidden=true;playHost.hidden=false;session=launch(playHost,arena,editorAssetUrls,()=>{session?.destroy();session=undefined;playHost.hidden=true;root.hidden=false;});}catch(e){root.hidden=false;playHost.hidden=true;status.textContent=`Playtest unavailable: ${String(e)}`;}});
  refresh();
  return {destroy(){session?.destroy();root.remove();playHost.remove();}};
}
