import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
async function openSettings(page){if(!(await page.locator('.capture-settings').evaluate(el=>el.open)))await page.locator('.capture-settings summary').click();}
test('mobile navigation, safe empty state, same-origin model and MediaPipe inference',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.getByRole('heading',{name:'Strength Form Lab',exact:true})).toBeVisible();
  await expect(page.locator('.app-version')).toHaveText('v'+JSON.parse(readFileSync('package.json','utf8')).version);
  await expect(page.locator('#analyze')).toBeDisabled();
  await page.getByRole('button',{name:'Good Form',exact:true}).click();await expect(page.locator('#references')).toContainText('まだ記録がありません');
  await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#records')).toContainText('まだ記録がありません');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Run the actual shipped model on a blank image: no invented landmarks.
  const pose=await page.evaluate(async()=>{const {createPoseEngine}=await import('/src/pose-engine.js');let received=false,count=null;const p=await createPoseEngine(r=>{received=true;count=r.poseLandmarks?.length??0;});try{await p.initialize();const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,320,240);await p.send({image:c},0);return {received,count};}finally{await p.close();}});
  expect(pose).toEqual({received:true,count:0});expect(errors).toEqual([]);
});
test('real video playback, persisted history, comparison snapshot, note and isolated deletion',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(encoded)=>{
    const {saveSession}=await import('/src/storage.js');
    // H.264 fixture for real playback; the saved pose/metrics below are synthetic.
    const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'}),rep={id:1,start:0,end:.9,bottom:.4,hipMin:90,kneeMin:null,leanMax:70,rom:80,duration:.9,assessment:'synthetic fixture'};
    const analysis={version:'rdl-2d-v1',exercise:'rdl',camera:'side',side:'left',aspect:4/3,coverage:1,reps:[rep],warnings:['fixture'],rows:[]};
    const landmarks=Array.from({length:33},(_,i)=>({x:.3+(i%2)*.2,y:.1+(i/33)*.7,visibility:.9}));
    await saveSession({id:'baseline',kind:'reference',name:'基準',createdAt:1,blob,frames:[],analysis});
    await saveSession({id:'practice',kind:'session',name:'<img src=x onerror=alert(1)>',createdAt:2,blob,frames:Array.from({length:15},(_,i)=>({time:i/12,landmarks})),analysis,note:''});
  },readFileSync('e2e/fixtures/blank.mp4').toString('base64'));
  await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await page.getByRole('button',{name:'レビューする'}).click();
  await expect(page.locator('#video')).toHaveJSProperty('readyState',4);
  await expect(page.locator('#result')).toContainText('計測不可');
  await expect(page.locator('#name')).toHaveValue('<img src=x onerror=alert(1)>');expect(await page.locator('#records img').count()).toBe(0);
  await page.locator('#compare').selectOption('baseline');await expect(page.locator('#result')).toContainText('基準との差 0°');
  await expect(page.locator('#camera')).toBeDisabled();await expect(page.locator('#side')).toBeDisabled();
  await openSettings(page);await page.locator('#name').fill('保存後に変更した名前');await openSettings(page);await page.locator('#kind').selectOption('reference');
  await page.locator('#note').fill('実際は1回でした');await page.locator('#save').click();await expect(page.locator('#status')).toContainText('保存しました');
  await page.getByRole('button',{name:'最下点を見る'}).click();await expect(page.locator('#video')).toHaveJSProperty('currentTime',.4);
  await page.locator('#speed').selectOption('0.25');await expect(page.locator('#video')).toHaveJSProperty('playbackRate',.25);
  await expect(page.locator('#overlay')).toHaveJSProperty('width',await page.locator('#overlay').evaluate(c=>Math.round(c.getBoundingClientRect().width*devicePixelRatio)));
  await page.reload();await page.getByRole('button',{name:'Good Form',exact:true}).click();await page.locator('#references .record').filter({hasText:'保存後に変更した名前'}).getByRole('button',{name:'レビューする'}).click();await expect(page.locator('#name')).toHaveValue('保存後に変更した名前');await expect(page.locator('#kind')).toHaveValue('reference');await expect(page.locator('#note')).toHaveValue('実際は1回でした');await expect(page.locator('#compare')).toHaveValue('snapshot');
  page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Good Form',exact:true}).click();await page.locator('#references .record').filter({has:page.getByRole('heading',{name:'基準',exact:true})}).getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('#references .record')).toHaveCount(1);
  await page.locator('#references .record').getByRole('button',{name:'レビューする'}).click();await expect(page.locator('#result')).toContainText('基準との差 0°');
  await openSettings(page);await page.locator('#kind').selectOption('session');await page.locator('#save').click();await expect(page.locator('#status')).toContainText('保存しました');await page.reload();
  await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#records')).toContainText('保存後に変更した名前');await page.getByRole('button',{name:'レビューする'}).click();
  await openSettings(page);await page.locator('#reconfigure').click();await expect(page.locator('#camera')).toBeEnabled();await expect(page.locator('#side')).toBeEnabled();await expect(page.locator('#save')).toBeDisabled();await expect(page.locator('#result')).toBeEmpty();
});

test('fresh analysis saves edited metadata and preserves playback across BFCache lifecycle',async({page})=>{
  await page.goto('/');await page.locator('#file').setInputFiles('e2e/fixtures/blank.mp4');
  await expect(page.locator('#analyze')).toBeEnabled();await page.locator('#analyze').click();
  await expect(page.locator('#status')).toContainText('分析完了',{timeout:60000});
  await expect(page.locator('#result')).toContainText('0 レップ候補');
  await expect(page.locator('#result')).toContainText('計測可能フレーム 0%');
  await expect(page.locator('#camera')).toBeDisabled();await expect(page.locator('#side')).toBeDisabled();
  await openSettings(page);await page.locator('#name').fill('解析後のGood Form');await openSettings(page);await page.locator('#kind').selectOption('reference');
  await page.locator('#save').click();await expect(page.locator('#status')).toContainText('保存しました');
  // Dispatch the BFCache lifecycle contract. This is not physical Safari navigation.
  await page.locator('#video').evaluate(v=>v.play());
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await expect(page.locator('#video')).toHaveJSProperty('paused',true);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  expect(await page.locator('#video').evaluate(async v=>(await fetch(v.src)).ok)).toBe(true);
  await page.locator('#video').evaluate(v=>v.play());await expect(page.locator('#video')).toHaveJSProperty('paused',false);
  await page.screenshot({path:'test-results/mvp-mobile.png',fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Good Form',exact:true}).click();await expect(page.locator('#references')).toContainText('解析後のGood Form');await page.getByRole('button',{name:'レビューする'}).click();await expect(page.locator('#name')).toHaveValue('解析後のGood Form');await expect(page.locator('#kind')).toHaveValue('reference');
});


test('history and reference selection read summaries, fetching only the chosen video/Pose',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(encoded)=>{
    const {saveSession}=await import('/src/storage.js');
    const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'});
    const analysis={version:'rdl-2d-v2',exercise:'rdl',camera:'side',side:'left',coverage:1,reps:[{id:1,start:0,end:1,bottom:.5,hipMin:90,kneeMin:160,leanMax:70,rom:80,assessment:'fixture'}],warnings:[],rows:Array(1000).fill({time:0})};
    for(const [id,kind] of [['chosen','session'],['other','session'],['good','reference']])await saveSession({id,name:id,kind,createdAt:1,blob,frames:Array(1000).fill({time:0,landmarks:null}),analysis});
  },readFileSync('e2e/fixtures/blank.mp4').toString('base64'));
  await page.addInitScript(()=>{
    window.dbReads=[];
    for(const method of ['get','getAll']){
      const original=IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method]=function(...args){window.dbReads.push({store:this.name,method,id:args[0]});return original.apply(this,args);};
    }
  });
  await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await expect(page.locator('#records .record')).toHaveCount(2);
  expect(await page.evaluate(()=>window.dbReads.filter(r=>r.store==='sessions'))).toEqual([]);
  await page.locator('#records .record').filter({has:page.getByRole('heading',{name:'chosen',exact:true})}).getByRole('button',{name:'レビューする'}).click();
  await expect(page.locator('#name')).toHaveValue('chosen');await page.locator('#compare').selectOption('good');await expect(page.locator('#result')).toContainText('基準との差 0°');
  expect(await page.evaluate(()=>window.dbReads.filter(r=>r.store==='sessions'))).toEqual([{store:'sessions',method:'get',id:'chosen'}]);
});


test('torso-only candidates can be reviewed without producing angle comparison',async({page})=>{
  await page.goto('/');
  await page.evaluate(async(encoded)=>{
    const {saveSession}=await import('/src/storage.js');
    const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'video/mp4'});
    const candidate={id:-1,start:0,end:.9,bottom:.4,basis:'torso-motion',assessment:'体幹の往復候補。確認用です。'};
    await saveSession({id:'torso-only',kind:'session',name:'体幹のみ',createdAt:1,blob,frames:[],analysis:{version:'rdl-2d-v4',model:'full',exercise:'rdl',camera:'side',side:'left',coverage:0,metricCoverage:{hip:0,knee:0,lean:1},reps:[],motionCandidates:[candidate],warnings:[],rows:[]}});
  },readFileSync('e2e/fixtures/blank.mp4').toString('base64'));
  await page.reload();await page.getByRole('button',{name:'履歴',exact:true}).click();await page.getByRole('button',{name:'レビューする'}).click();
  await expect(page.locator('#result')).toContainText('1 往復候補');
  await expect(page.locator('#result')).toContainText('角度によるレップ候補：0件');
  await expect(page.locator('#result')).toContainText('体幹の往復候補 1区間');
  await expect(page.locator('#result')).not.toContainText('基準との差');
  await expect(page.locator('#model')).toHaveValue('full');await expect(page.locator('#model')).toBeDisabled();
  await page.getByRole('button',{name:'最大前傾点を見る'}).click();await expect(page.locator('#video')).toHaveJSProperty('currentTime',.4);
  await page.getByRole('button',{name:'候補区間を再生'}).click();await expect(page.locator('#video')).toHaveJSProperty('paused',false);
});
