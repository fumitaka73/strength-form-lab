import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DB_NAME,DB_VERSION,saveSession,listSessions,getSession,deleteSession,referenceSnapshot} from '../src/storage.js';
const analysis={version:'v1',exercise:'rdl',camera:'side',side:'left',coverage:1,reps:[{hipMin:90,kneeMin:160,leanMax:70,rom:80,start:0,end:2},{hipMin:95}],rows:[{time:0}]};
const record=id=>({id,name:id,kind:'session',createdAt:1,blob:new Blob(['video']),frames:[{time:0,landmarks:null}],note:'review',analysis});
function open(name,version,upgrade){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function put(db,store,row){return new Promise(resolve=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(row);tx.oncomplete=resolve;});}
test('v1 upgrade preserves original video/Pose/review and creates lightweight metadata',async()=>{
  const db=await open(DB_NAME,1,db=>db.createObjectStore('sessions',{keyPath:'id'}));await put(db,'sessions',record('legacy'));db.close();
  const [summary]=await listSessions();assert.equal(summary.id,'legacy');assert.equal(summary.repCount,2);
  for(const key of ['blob','frames','note','referenceSnapshot'])assert.equal(key in summary,false);
  assert.equal('rows' in summary.analysis,false);
  const row=await getSession('legacy');assert.equal(await row.blob.text(),'video');assert.equal(row.note,'review');assert.deepEqual(row.frames,record('legacy').frames);
  const upgraded=await open(DB_NAME,DB_VERSION);assert.equal(upgraded.version,DB_VERSION);upgraded.close();await deleteSession('legacy');
});
test('lists metadata only, loads chosen detail by ID, updates both stores and compacts comparison snapshot',async()=>{
  const largeReference={...record('ref'),analysis:{...analysis,rows:Array(1000).fill({time:0})}};
  await saveSession({...record('a'),referenceSnapshot:largeReference});await saveSession(record('b'));
  const calls=[],original=IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll=function(...args){calls.push(this.name);return original.apply(this,args);};
  let summaries;try{summaries=await listSessions();}finally{IDBObjectStore.prototype.getAll=original;}
  assert.deepEqual(calls,['summaries']);assert.equal(summaries.length,2);assert.ok(summaries.every(s=>!s.blob&&!s.frames&&!s.analysis.rows));
  const row=await getSession('a');assert.equal(await row.blob.text(),'video');assert.deepEqual(row.referenceSnapshot,referenceSnapshot(largeReference));assert.equal(row.referenceSnapshot.analysis.reps.length,1);assert.equal('rows' in row.referenceSnapshot.analysis,false);
  await saveSession({...row,name:'updated',kind:'reference'});assert.equal((await listSessions()).find(s=>s.id==='a').kind,'reference');assert.equal((await getSession('a')).name,'updated');
  await deleteSession('a');await deleteSession('b');assert.deepEqual(await listSessions(),[]);assert.equal(await getSession('a'),undefined);
});
test('new-app deletion leaves sports database and original practice data untouched',async()=>{
  const source=await open('sports-form-lab',4,db=>db.createObjectStore('videos',{keyPath:'id'}));await put(source,'videos',{id:'original',value:'preserve'});
  await saveSession(record('new'));await deleteSession('new');
  const original=await new Promise(resolve=>{const r=source.transaction('videos').objectStore('videos').get('original');r.onsuccess=()=>resolve(r.result);});assert.equal(original.value,'preserve');source.close();
});
