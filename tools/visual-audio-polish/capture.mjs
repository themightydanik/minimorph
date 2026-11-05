import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const phase=process.argv[2]??'after', out='docs/evidence/visual-audio-polish';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['diff','--name-only','--','packages'],{encoding:'utf8'}).trim();
if(phase==='before'&&(!revision.startsWith('ae0008d')||dirty))throw Error('Before captures require clean PR #9 packages at ae0008d; copy only the review harness into that checkout.');
await mkdir(out,{recursive:true});
if(!['before','after'].includes(phase))throw Error('Use before or after');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const scenarios=[['cosmic-sprint','arena'],['orbit-chaos','arena'],['gravity-mayhem','arena'],...['dive','slide','recover','vfx'].map(a=>['cosmic-sprint',a])];
if(phase==='after')scenarios.push(['cosmic-sprint','vfx','checkpoint'],['cosmic-sprint','vfx','victory']);
for(const [arena,action,cue] of scenarios){
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 await page.clock.install();await page.goto(`http://127.0.0.1:5175/polish-review.html?arena=${arena}&action=${action}${cue?'&cue='+cue:''}`);
 await page.waitForFunction(()=>window.reviewReady&&document.querySelector('canvas').dataset.character==='minimorph-optimized-v1',undefined,{timeout:60000});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await page.clock.runFor(1800);
 if(action==='vfx'){await page.evaluate(kind=>kind?window.reviewCue(kind):window.reviewEvent('land'),cue);await page.clock.runFor(220);}
 await page.evaluate(()=>window.reviewFreeze()); await page.clock.resume();
 await page.screenshot({timeout:90000,path:`${out}/${phase}-${arena}-${action}${cue?'-'+cue:''}.png`});await page.close(); console.log(phase,arena,action,cue??'');
}
await browser.close();await writeFile(`${out}/${phase}-capture.json`,JSON.stringify({phase,revision,workingTreeModified:!!dirty,viewport:[1280,720],dpr:1,method:'actual PlayCanvas fixed-camera scene, 1.8 s settle, original full arena',actions:['arena','dive','slide','recover','vfx']},null,2)+'\n');
