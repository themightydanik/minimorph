import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const phase=process.argv[2]??'after',port=process.argv[3]??'5175';
if(!['before','after'].includes(phase))throw Error('before or after required');
const out='docs/evidence/advanced-levels';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const scenes=[['cosmic-sprint',0],['cosmic-sprint',4],['orbit-chaos',0],['orbit-chaos',2],['gravity-mayhem',2],['gravity-mayhem',7]];
try{for(const [arena,section] of scenes){
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 await page.clock.install();await page.goto(`http://127.0.0.1:${port}/level-review.html?arena=${arena}&section=${section}`);
 await page.waitForFunction(()=>window.levelReviewReady&&document.querySelector('canvas').dataset.character==='minimorph-optimized-v1',undefined,{timeout:90000});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await page.clock.runFor(1800);
 await page.evaluate(()=>window.levelReviewFreeze());await page.clock.resume();
 await page.screenshot({path:`${out}/${phase}-${arena}-${section}.png`,timeout:90000});await page.close();console.log(phase,arena,section);
}}finally{await browser.close();}
await writeFile(`${out}/${phase}.json`,JSON.stringify({phase,source:phase==='before'?'615b14a (merged PR #10)':execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTreeModified:phase==='after'&&!!execFileSync('git',['diff','--name-only','--','packages'],{encoding:'utf8'}).trim(),viewport:[1280,720],dpr:1,simulationTime:1.2,camera:[18,23,'18-section.start'],lookAt:[0,1.8,'-section.start-24'],scenes},null,2)+'\n');
