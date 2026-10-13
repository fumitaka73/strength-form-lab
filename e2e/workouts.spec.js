import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
async function history(page){await page.goto('/');await page.getByRole('button',{name:'履歴',exact:true}).click();}
async function add(page,{exercise='rdl',weight='40',reps='8',count='1',date='2026-10-13'}={}){await page.locator('#workout-date').fill(date);await page.locator('#workout-exercise').selectOption(exercise);await page.locator('#workout-weight').fill(weight);await page.locator('#workout-reps').fill(reps);await page.locator('#workout-count').fill(count);await page.locator('#workout-submit').click();await expect(page.locator('#status')).toContainText('セット記録を保存しました');}
test('no-video multiple exercises/sets survive reload, per-set editing/deletion and accurate trends',async({page})=>{
 await history(page);await expect(page.locator('.app-version')).toHaveText('v0.5.0');
 await add(page,{count:'2'});await add(page,{exercise:'squat',weight:'0',reps:'10'});await add(page,{exercise:'bench',weight:'',reps:'5'});
 await page.locator('#workout-exercise').selectOption('other');await page.locator('#workout-custom').fill('ラットプル');await page.locator('#workout-weight').fill('20');await page.locator('#workout-reps').fill('12');await page.locator('#workout-submit').click();await expect(page.locator('#status')).toContainText('保存しました');
 await add(page,{date:'2026-10-14',weight:'50',reps:'6'});
 await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#workout-rows .record')).toHaveCount(6);
 await expect(page.locator('#workout-totals')).toContainText('6セット · 49回 · 総負荷量 1,180');
 await page.locator('#workout-filter-date').fill('2026-10-13');await page.locator('#workout-filter-exercise').selectOption('rdl');await expect(page.locator('#workout-rows .record')).toHaveCount(2);
 await page.locator('#workout-rows .record').first().getByRole('button',{name:'セットを編集'}).click();await page.locator('#workout-weight').fill('45');await page.locator('#workout-reps').fill('6');await page.locator('#workout-submit').click();await expect(page.locator('#workout-totals')).toContainText('2セット · 14回 · 総負荷量 590');
 await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#workout-rows')).toContainText('45 kg × 6回');
 page.on('dialog',d=>d.accept());await page.locator('#workout-rows .record').filter({hasText:'45 kg'}).getByRole('button',{name:'セットを削除'}).click();await expect(page.locator('#workout-rows .record')).toHaveCount(5);
 await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#workout-rows .record')).toHaveCount(5);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#workout-form').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/workouts-mobile.png'});
});
test('invalid input creates nothing; missing weight is distinct from zero; no automatic candidate counting',async({page})=>{
 await history(page);await page.locator('#workout-date').fill('2026-10-13');await page.locator('#workout-reps').fill('0');await page.locator('#workout-submit').click();await expect(page.locator('#status')).toContainText('正の整数');await expect(page.locator('#workout-rows .record')).toHaveCount(0);
 await page.locator('#workout-reps').fill('8');await page.locator('#workout-count').fill('1.5');await page.locator('#workout-submit').click();await expect(page.locator('#workout-rows .record')).toHaveCount(0);
 await page.locator('#workout-count').fill('1');await page.locator('#workout-weight').fill('-1');await page.locator('#workout-submit').click();await expect(page.locator('#workout-rows .record')).toHaveCount(0);
 await page.evaluate(async()=>{const {saveSession}=await import('/src/storage.js');await saveSession({id:'source',name:'既存RDL',kind:'session',createdAt:new Date(2026,9,13).getTime(),weightKg:42.5,blob:new Blob(['video']),frames:[{time:0}],analysis:{version:'v1',exercise:'rdl',camera:'side',side:'left',coverage:0,reps:[],motionCandidates:Array(8).fill({id:1}),rows:[]}});});
 await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#workout-totals')).toContainText('0セット · 0回');
 await page.locator('#workout-form details').evaluate(d=>d.open=true);await page.locator('#workout-source').selectOption('source');await expect(page.locator('#workout-weight')).toHaveValue('42.5');await expect(page.locator('#workout-reps')).toHaveValue('');
 await page.locator('#workout-reps').fill('7');await page.locator('#workout-submit').click();await expect(page.locator('#workout-totals')).toContainText('1セット · 7回 · 総負荷量 297.5');
 await page.locator('#workout-source').selectOption('source');await page.locator('#workout-reps').fill('7');await page.locator('#workout-submit').click();await expect(page.locator('#status')).toContainText('すでに');await expect(page.locator('#workout-rows .record')).toHaveCount(1);
 expect(await page.evaluate(async()=>{const {getSession}=await import('/src/storage.js');const s=await getSession('source');return {weight:s.weightKg,frames:s.frames.length,motions:s.analysis.motionCandidates.length};})).toEqual({weight:42.5,frames:1,motions:8});
});

test('existing v2 videos and Good Form still open after non-destructive upgrade',async({page})=>{
 await page.route('**/legacy-bootstrap',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ja"><body>fixture</body></html>'}));await page.goto('/legacy-bootstrap');
 await page.evaluate(async(encoded)=>{
   const db=await new Promise(resolve=>{const r=indexedDB.open('strength-form-lab',2);r.onupgradeneeded=()=>{r.result.createObjectStore('sessions',{keyPath:'id'});r.result.createObjectStore('summaries',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);});
   const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'});
   const analysis={version:'legacy',exercise:'rdl',camera:'side',side:'left',coverage:0,reps:[],warnings:[],rows:[],motionCandidates:[]};
   await new Promise(resolve=>{const tx=db.transaction(['sessions','summaries'],'readwrite');for(const kind of ['session','reference']){const row={id:kind,name:kind==='session'?'旧動画':'旧Good Form',kind,createdAt:1,weightKg:20,blob,frames:[{time:0,landmarks:null}],analysis,note:'以前のメモ'};tx.objectStore('sessions').put(row);tx.objectStore('summaries').put({id:row.id,name:row.name,kind,createdAt:1,weightKg:20,repCount:0,analysis});}tx.oncomplete=resolve;});db.close();
 },readFileSync('e2e/fixtures/blank.mp4').toString('base64'));
 await page.goto('/');await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#workout-totals')).toContainText('0セット · 0回');
 await page.locator('#records').getByRole('button',{name:'レビューする'}).click();await expect(page.locator('#weight')).toHaveValue('20');await expect(page.locator('#note')).toHaveValue('以前のメモ');await expect(page.locator('#video')).toHaveJSProperty('readyState',4);
 await page.getByRole('button',{name:'Good Form',exact:true}).click();await page.locator('#references').getByRole('button',{name:'レビューする'}).click();await expect(page.locator('#name')).toHaveValue('旧Good Form');
 await page.getByRole('button',{name:'履歴',exact:true}).click();await add(page,{weight:'30',reps:'5'});expect(await page.evaluate(async()=>{const {getSession}=await import('/src/storage.js');const row=await getSession('session');return {bytes:row.blob.size,weight:row.weightKg,note:row.note,frames:row.frames.length};})).toEqual({bytes:readFileSync('e2e/fixtures/blank.mp4').length,weight:20,note:'以前のメモ',frames:1});
});
