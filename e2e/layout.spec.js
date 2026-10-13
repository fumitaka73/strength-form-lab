import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {partialAnalysis} from '../test-support/feedback-fixture.js';
test.use({isMobile:true,hasTouch:true,deviceScaleFactor:3});
for(const width of [320,375,390,430]){
 test(`layout ${width}px long names, settings, records and expanded advice`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.goto('/');
  await page.locator('.capture-settings').evaluate(d=>d.open=true);
  const check=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await check();
  const name='LongReferenceName'.repeat(5).slice(0,80);
  await page.evaluate(async({name,encoded,analysis})=>{const {saveSession,saveWorkoutSets}=await import('/src/storage.js');const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'});await saveSession({id:'long',name,kind:'session',createdAt:1,blob,frames:[],analysis});await saveSession({id:'ref',name,kind:'reference',createdAt:1,blob,frames:[],analysis});await saveWorkoutSets([{id:'set',date:'2026-10-13',exercise:'other',customName:'A'.repeat(80),weightKg:80,reps:9}]);},{name,encoded:readFileSync('e2e/fixtures/blank.mp4').toString('base64'),analysis:partialAnalysis(1)});
  await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();
  await page.locator('#workout-form details').evaluate(d=>d.open=true);await check();if(width===375)await page.screenshot({path:'test-results/issue13-after.png'});
  await page.locator('#records').getByRole('button',{name:'レビューする'}).click();await page.locator('#generate-feedback').click();await page.locator('#result details').evaluateAll(ds=>ds.forEach(d=>d.open=true));await check();
  await page.screenshot({path:`test-results/layout-${width}.png`,fullPage:true});
  const targets=await page.locator('button, .button, summary, input:not([type=file]), select, textarea').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({id:e.id,height:e.getBoundingClientRect().height,font:parseFloat(getComputedStyle(e).fontSize),input:e.matches('input,select,textarea')})));
  for(const target of targets){expect(target.height,JSON.stringify(target)).toBeGreaterThanOrEqual(44);if(target.input)expect(target.font).toBeGreaterThanOrEqual(16);}
  for(const group of await page.locator('.actions, .tab-bar').all()){
    const overlap=await group.evaluate(e=>{const rs=[...e.children].map(c=>c.getBoundingClientRect()).filter(r=>r.width&&r.height);return rs.some((r,i)=>rs.slice(i+1).some(s=>Math.min(r.right,s.right)-Math.max(r.left,s.left)>1&&Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)>1));});expect(overlap).toBe(false);
  }
  await page.locator('#video').evaluate(v=>v.play());await expect(page.locator('#video')).toHaveJSProperty('paused',false);await page.locator('#video').evaluate(v=>v.pause());
  for(const viewport of [{width:844,height:width},{width,height:360}]){
    await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const alignment=await page.evaluate(()=>{const a=document.querySelector('#video').getBoundingClientRect(),b=document.querySelector('#overlay').getBoundingClientRect();return Math.abs(a.width-b.width)+Math.abs(a.height-b.height);});expect(alignment).toBeLessThan(1);await expect.poll(()=>page.locator('#overlay').evaluate(c=>c.width===Math.round(c.getBoundingClientRect().width*Math.min(devicePixelRatio,2)))).toBe(true);
    await page.locator('#save').evaluate(e=>e.scrollIntoView({block:'center'}));
    const visible=await page.evaluate(()=>{const b=document.querySelector('#save').getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect(),n=document.querySelector('.tab-bar').getBoundingClientRect();return b.top>=h.bottom&&b.bottom<=n.top;});expect(visible).toBe(true);
  }
  const safeCSS=readFileSync('src/style.css','utf8').replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g,(_,edge)=>({top:20,bottom:34,left:44,right:44}[edge]+'px'));await page.addStyleTag({content:safeCSS});
  await page.setViewportSize({width,height:360});await page.getByRole('button',{name:'履歴',exact:true}).click();await page.locator('#workout-date').focus();await page.locator('#workout-date').evaluate(e=>e.scrollIntoView({block:'center'}));
  const inputClear=await page.evaluate(()=>{const b=document.querySelector('#workout-date').getBoundingClientRect(),h=document.querySelector('.app-header').getBoundingClientRect(),n=document.querySelector('.tab-bar').getBoundingClientRect();return b.top>=h.bottom&&b.bottom<=n.top;});expect(inputClear).toBe(true);await check();
  await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'履歴',exact:true}).click();await page.locator('#workout-weight').focus();await page.locator('#workout-weight').fill('80');await page.locator('#workout-reps').fill('9');
  await page.getByRole('button',{name:'Good Form',exact:true}).click();await expect(page.locator('#history')).toBeHidden();await expect(page.locator('#reference')).toBeVisible();await check();
 });
}
