import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { RunSegment } from '../helpers/arena-runs';
const recordings:Record<string,{segments:RunSegment[]}>=JSON.parse(readFileSync('tests/fixtures/full-round-runs.json','utf8')); 
const circuit=[['cosmic-sprint','Cosmic Sprint',6],['orbit-chaos','Orbit Chaos',6],['gravity-mayhem','Gravity Mayhem',7]] as const;
test('full racing circuit with ordinary keys, checkpoints, Victory and persistent records',async({page},info)=>{
 test.setTimeout(1200000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.route('https://telegram.org/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173');
 const canvas=page.locator('canvas');
 await expect(canvas).toHaveAttribute('data-character','minimorph-optimized-v1',{timeout:60000});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await page.getByRole('button',{name:'Play Cosmic Sprint',exact:true}).click();
 for(const [id,,checkpoints] of circuit){
  await page.getByRole('button',{name:'Start race',exact:true}).click();await page.clock.fastForward(3100);
  await expect(canvas).toHaveAttribute('data-phase','racing');await canvas.focus();
  const held=new Set<string>();let elapsed=0,shot=0;
  for(const segment of recordings[id].segments){
   for(const key of held)if(!segment.keys.includes(key)){await page.keyboard.up(key);held.delete(key);}
   for(const key of segment.keys)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
   if(segment.jump)await page.keyboard.press('Space');
   for(let i=0;i<Math.round(segment.seconds*10);i++)await page.clock.fastForward(100);
   elapsed+=segment.seconds;
   if(elapsed>(shot+1)*9&&shot<7){await page.screenshot({path:`test-results/pr6-${id}-${shot++}-${info.project.name}.png`});}
  }
  for(const key of held)await page.keyboard.up(key);
  await expect(canvas).toHaveAttribute('data-phase','finished');await expect(canvas).toHaveAttribute('data-character-active','Victory');await expect(canvas).toHaveAttribute('data-hits','0');
  await expect(page.locator('[data-falls]')).toHaveText('0');await expect(page.locator('[data-checkpoints]')).toHaveText(`${checkpoints} / ${checkpoints}`);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('minimorph.progress.v2')!));expect(saved.best[id]).toBeGreaterThanOrEqual(60);expect(saved.best[id]).toBeLessThanOrEqual(90);
  await page.screenshot({path:`test-results/pr6-${id}-finish-${info.project.name}.png`});
  const next=circuit.findIndex(c=>c[0]===id)+1;if(next<3)await page.getByRole('button',{name:`Next: ${circuit[next][1]}`,exact:true}).click();
 }
 await page.reload();for(const [,name] of circuit)await expect(page.getByRole('button',{name:`Play ${name}`,exact:true})).toBeEnabled();expect(errors).toEqual([]);
});
test('training records remain separate from full racing progression',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('minimorph.progress.v1',JSON.stringify({version:1,unlocked:3,best:{'cosmic-sprint':6}})));
 await page.goto('http://127.0.0.1:5173');await expect(page.getByRole('button',{name:'Locked Orbit Chaos',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Training tracks',exact:true}).click();await expect(page.getByRole('button',{name:'Play Gravity Mayhem',exact:true})).toBeEnabled();await expect(page.locator('.level-record').first()).toContainText('BEST');
 await page.getByRole('button',{name:'Racing rounds',exact:true}).click();await expect(page.getByRole('button',{name:'Locked Orbit Chaos',exact:true})).toBeDisabled();
});
test('two-touch diagonal movement and jump release safely in portrait and landscape',async({page},info)=>{
 test.skip(info.project.name!=='mobile','Actual multi-touch emulation uses the mobile project');
 test.setTimeout(120000);
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.goto('http://127.0.0.1:5173');
 const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-character','minimorph-optimized-v1',{timeout:60000});
 await page.getByRole('button',{name:'Training tracks',exact:true}).click();await page.getByRole('button',{name:'Play Cosmic Sprint',exact:true}).click();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 const cdp=await page.context().newCDPSession(page);
 for(const [width,height] of [[393,851],[900,450]]){
  await page.setViewportSize({width,height});
  if(width===393)await page.getByRole('button',{name:'Start race',exact:true}).click();else await page.getByRole('button',{name:'Restart',exact:false}).click();
  await page.clock.fastForward(3100);await expect(canvas).toHaveAttribute('data-phase','racing');
  const direction=(await page.getByRole('group',{name:'Movement joystick'}).boundingBox())!,jump=(await page.getByRole('button',{name:'Jump',exact:true}).boundingBox())!;
  expect(direction.width).toBeGreaterThanOrEqual(48);expect(direction.height).toBeGreaterThanOrEqual(48);
  const first={x:direction.x+direction.width*.73,y:direction.y+direction.height*.27,id:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first]});await page.clock.runFor(200);
  expect(Number(await canvas.getAttribute('data-heading'))).toBeLessThan(-.3);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first,{x:jump.x+jump.width/2,y:jump.y+jump.height/2,id:2}]});await page.clock.runFor(100);await expect(canvas).toHaveAttribute('aria-description','Airborne');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.clock.runFor(100);
  await expect(page.locator('.touch-controls .pressed')).toHaveCount(0);
  await page.screenshot({path:`test-results/pr6-two-touch-${width}.png`});
 }
 await cdp.detach();
});
