import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
import {partialAnalysis,completeAnalysis} from '../test-support/feedback-fixture.js';
const mp4=readFileSync('e2e/fixtures/blank.mp4').toString('base64');
async function seed(page,analysis,{reference=false,snapshot=null}={}){
 await page.goto('/');await page.evaluate(async({encoded,analysis,reference,snapshot})=>{const {saveSession}=await import('/src/storage.js');const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'});await saveSession({id:'case',name:'合成の動作テスト',kind:'session',createdAt:1,blob,frames:[],analysis,referenceSnapshot:snapshot,note:'元メモ'});if(reference)await saveSession({id:'good',name:'合成のお手本',kind:'reference',createdAt:2,blob,frames:[],analysis:reference});},{encoded:mp4,analysis,reference,snapshot});
 await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await page.locator('#records').getByRole('button',{name:'レビューする'}).click();
}
test('eight partial movement intervals produce estimated percent and advice without rewriting original analysis',async({page})=>{
 const original=partialAnalysis();await seed(page,original);
 await expect(page.locator('.pattern-score')).toHaveCount(0);
 await page.locator('.feedback-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/feedback-before.png'});
 await page.locator('#generate-feedback').click();await expect(page.locator('.feedback-card')).toHaveCount(8);await expect(page.locator('.pattern-score')).toContainText('前傾から戻る動きの目安');await expect(page.locator('.pattern-score')).toContainText('%');await expect(page.locator('.feedback-advice')).toHaveCount(2);
 await expect(page.locator('.feedback-panel')).toContainText('一般的なRDL');await expect(page.locator('.feedback-panel')).toContainText('股関節から折りたたむ');
 await page.locator('.feedback-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/feedback-after.png'});
 await page.locator('.feedback-card').first().getByRole('button',{name:'この動きを再生'}).click();await expect(page.locator('#video')).toHaveJSProperty('paused',false);await page.locator('#video').evaluate(v=>v.pause());
 await page.locator('#save').click();await expect(page.locator('#status')).toContainText('保存しました');
 const saved=await page.evaluate(async()=>{const {getSession}=await import('/src/storage.js');return getSession('case');});expect(saved.analysis).toEqual(original);expect(saved.note).toBe('元メモ');expect(saved.feedbackReports).toHaveLength(1);expect(saved.feedbackReports[0].version).toBe('rdl-observed-feedback-v1');
 await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await page.locator('#records').getByRole('button',{name:'レビューする'}).click();await expect(page.locator('.feedback-card')).toHaveCount(8);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('motion-only reference holds angle comparison, while strict reference exposes signed relative differences',async({page})=>{
 const a=completeAnalysis();a.reps=[{id:1,start:0,bottom:1.5,end:2.97,hipMin:110,kneeMin:155,leanMax:55,rom:60}];a.motionCandidates=[];
 const reference={...a,reps:[{...a.reps[0],hipMin:100,rom:70}]};
 await seed(page,a,{reference});await expect(page.locator('#compare')).toHaveValue('good');await page.locator('#generate-feedback').click();await expect(page.locator('.feedback-basis')).toContainText('自分のお手本フォーム');
 await page.locator('.feedback-card details').evaluate(d=>d.open=true);await expect(page.locator('.feedback-card')).toContainText('差 +10.0°');await expect(page.locator('.feedback-card')).toContainText('相対差 +14.3%');
 await page.locator('#compare').selectOption('');await expect(page.locator('.feedback-basis')).toContainText('一般的なRDL');
});
test('all missing and front angle hold scores; explicit new feedback preserves existing snapshot and earlier report',async({page})=>{
 const a=partialAnalysis(1);a.camera='front';const snapshot={id:'original',name:'元のお手本',analysis:{...completeAnalysis(),reps:[{hipMin:100,kneeMin:160,leanMax:55,rom:60}]}};
 await seed(page,a,{reference:completeAnalysis(),snapshot});await page.locator('#generate-feedback').click();await expect(page.locator('.pattern-score')).toHaveCount(0);await expect(page.locator('.feedback-card')).toContainText('評価保留');
 await page.locator('#save').click();await expect(page.locator('#status')).toContainText('保存しました');await page.locator('#compare').selectOption('good');await page.locator('#save').click();await expect(page.locator('#status')).toContainText('保存しました');
 const record=await page.evaluate(async()=>{const {getSession}=await import('/src/storage.js');return getSession('case');});expect(record.referenceSnapshot.id).toBe('original');expect(record.feedbackReports).toHaveLength(2);expect(record.feedbackReports[0].reference.id).toBe('original');expect(record.feedbackReports[1].reference.id).toBe('good');
});
