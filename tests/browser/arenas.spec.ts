import { test, expect } from '@playwright/test';
import { arenaRuns } from '../helpers/arena-runs';
import { chooseAndStart, playRun } from '../helpers/race-ui';
const circuit = [ ['cosmic-sprint','Cosmic Sprint'], ['orbit-chaos','Orbit Chaos'], ['gravity-mayhem','Gravity Mayhem'] ] as const;
test('whole circuit: countdown, all arenas, physical routes, records, unlocks and reload', async ({ page }, info) => {
 test.setTimeout(600000);
 const errors:string[]=[]; let modelLoads=0;
 page.on('pageerror',e=>errors.push(e.message)); page.on('request',r=>{if(r.url().includes('minimorph_animated_v1')&&r.url().endsWith('.glb'))modelLoads++;});
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.route('https://telegram.org/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173');
 const canvas=page.locator('canvas');
 await expect(canvas).toHaveAttribute('data-character','minimorph-animated-v1-temporary',{timeout:30000});
 await page.getByRole('button',{name:'Training tracks',exact:true}).click();
 await expect(page.getByRole('button',{name:'Locked Orbit Chaos',exact:true})).toBeDisabled();
 await page.screenshot({path:`test-results/pr5-selection-${info.project.name}.png`});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 for(const [index,[id,name]] of circuit.entries()) {
  if(index===0) {
   await page.getByRole('button',{name:`Play ${name}`,exact:true}).click();
   await expect(page.getByRole('region',{name:'Race preparation',exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'Start race',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-phase','countdown');
  await expect(page.locator('.countdown strong')).toHaveText('3');
  await page.clock.fastForward(1000); await expect(page.locator('.countdown strong')).toHaveText('2');
  await expect(page.locator('[data-time]')).toHaveText('00:00.00');
  await page.clock.fastForward(1000); await expect(page.locator('.countdown strong')).toHaveText('1');
  await page.clock.fastForward(1100); await expect(canvas).toHaveAttribute('data-phase','racing');
  await expect(canvas).toHaveAttribute('data-arena',id);
  await expect(page.getByRole('status')).toHaveText('Reach the finish beacon');
  await canvas.focus();
  await playRun(page,arenaRuns[id],async segment=>{
   if(segment===4)await page.screenshot({path:`test-results/pr5-${id}-${info.project.name}.png`});
  });
  await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute('data-phase','finished');
  await expect(canvas).toHaveAttribute('data-character-active','Victory');
  await expect(page.getByRole('region',{name:'Race results',exact:true})).toBeVisible();
  await expect(page.locator('[data-falls]')).toHaveText('0');
  await expect(page.locator('[data-checkpoints]')).toHaveText('2 / 2');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('minimorph.progress.v1')!));
  expect(saved.unlocked).toBe(Math.min(3,index+2)); expect(saved.best[id]).toBeGreaterThan(0);
  await page.screenshot({path:`test-results/pr5-${id}-results-${info.project.name}.png`});
  if(index<2) {
   await page.getByRole('button',{name:`Next: ${circuit[index+1][1]}`,exact:true}).click();
   await expect(canvas).toHaveAttribute('data-phase','prepare');
  }
 }
 expect(modelLoads).toBe(1); // One loaded character survives all three arena switches.
 await page.reload();
 await expect(page.getByRole('region',{name:'Arena selection',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Training tracks',exact:true}).click();
 for(const [,name] of circuit) await expect(page.getByRole('button',{name:`Play ${name}`,exact:true})).toBeEnabled();
 await expect(page.locator('.level-record').first()).toContainText('BEST');
 expect(errors).toEqual([]);
});
for(const port of [5173,5174]) test(`arena switching and safe focus recovery on ${port}`,async({page},info)=>{
 test.setTimeout(120000);
 await page.addInitScript(()=>localStorage.setItem('minimorph.progress.v1',JSON.stringify({version:1,unlocked:3,best:{}})));
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.goto(`http://127.0.0.1:${port}`);
 const canvas=page.locator('canvas');
 await expect(canvas).toHaveAttribute('data-character','minimorph-animated-v1-temporary',{timeout:30000});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 for(const [id,name] of circuit) {
  await chooseAndStart(page,name,true); await expect(canvas).toHaveAttribute('data-arena',id);
  await expect(page.getByRole('status')).toHaveText('Reach the finish beacon');
  await page.keyboard.down('KeyW'); await page.clock.runFor(200);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(canvas).toHaveAttribute('data-phase','paused');
  const time=await page.locator('[data-time]').textContent();
  const poseTime=await canvas.getAttribute('data-character-time');
  await page.clock.fastForward(5000); await expect(page.locator('[data-time]')).toHaveText(time!);
  await expect(canvas).toHaveAttribute('data-character-time',poseTime!);
  await page.getByRole('button',{name:'Resume race',exact:true}).click(); await page.clock.fastForward(3100);
  await expect(canvas).toHaveAttribute('data-phase','racing');
  await page.getByRole('button',{name:'Arenas',exact:true}).click();
  await expect(page.getByRole('region',{name:'Arena selection',exact:true})).toBeVisible();
 }
 await page.setViewportSize({width:900,height:450});
 for(const [,name] of circuit) await expect(page.getByRole('button',{name:`Play ${name}`,exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/pr5-unlocked-${port}-${info.project.name}.png`});
});
test('blocked local storage leaves the first arena fully playable',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked');}}));
 await page.goto('http://127.0.0.1:5173');
 await expect(page.locator('.selection .storage-status')).toContainText('Storage unavailable');
 await chooseAndStart(page);
 await page.locator('canvas').focus(); await page.keyboard.press('Space');
 await expect(page.locator('canvas')).toHaveAttribute('aria-description','Airborne');
 await expect(page.locator('canvas')).toHaveAttribute('aria-description','On platform');
});
test('authored rotor physically knocks the animated character and shows hit feedback',async({page},info)=>{
 test.setTimeout(90000);
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.goto('http://127.0.0.1:5173');
 const canvas=page.locator('canvas');
 await expect(canvas).toHaveAttribute('data-character','minimorph-animated-v1-temporary',{timeout:30000});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await chooseAndStart(page,'Cosmic Sprint',true);
 await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.clock.runFor(440);
 await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
 await expect(canvas).toHaveAttribute('data-event','hit');
 await expect(canvas).toHaveAttribute('aria-description','Airborne');
 await expect(page.locator('[data-falls]')).toHaveText('0');
 await expect(page.getByRole('status')).toContainText('Bumped!');
 await page.screenshot({path:`test-results/pr5-rotor-hit-${info.project.name}.png`});
});
