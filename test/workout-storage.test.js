import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {listWorkoutSets,saveWorkoutSets,deleteWorkoutSet,getSession,listSessions} from '../src/storage.js';
const analysis={version:'legacy',exercise:'rdl',camera:'side',side:'left',coverage:1,reps:[],motionCandidates:[{id:1}],rows:[{time:0}]};
const video={id:'video',name:'old',kind:'session',createdAt:1,weightKg:40,blob:new Blob(['original']),frames:[{time:0}],analysis};
const summary={id:'video',name:'old',kind:'session',createdAt:1,weightKg:40,analysis:{...analysis,rows:undefined}};
function open(name,version,upgrade){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const set=(id,patch={})=>({id,date:'2026-10-13',exercise:'rdl',weightKg:40,reps:8,...patch});
test('v2 upgrade adds only workout store, preserves video/Pose/weight/reference summaries and sports DB',async()=>{
 const db=await open('strength-form-lab',2,db=>{db.createObjectStore('sessions',{keyPath:'id'});db.createObjectStore('summaries',{keyPath:'id'});});
 await new Promise(resolve=>{const tx=db.transaction(['sessions','summaries'],'readwrite');tx.objectStore('sessions').put(video);tx.objectStore('sessions').put({...video,id:'good',kind:'reference',referenceSnapshot:{id:'good',name:'good',analysis}});tx.objectStore('summaries').put(summary);tx.oncomplete=resolve;});db.close();
 const sports=await open('sports-form-lab',4,db=>db.createObjectStore('videos',{keyPath:'id'}));await new Promise(resolve=>{const tx=sports.transaction('videos','readwrite');tx.objectStore('videos').put({id:'basketball',keep:true});tx.oncomplete=resolve;});
 assert.deepEqual(await listWorkoutSets(),[]);assert.deepEqual(await listSessions(),[summary]);
 await saveWorkoutSets([set('one'),set('two',{weightKg:0})]);await saveWorkoutSets([set('one',{weightKg:45,reps:6})]);assert.equal((await listWorkoutSets()).find(r=>r.id==='one').weightKg,45);
 await deleteWorkoutSet('one');await deleteWorkoutSet('two');const preserved=await getSession('video');assert.equal(await preserved.blob.text(),'original');assert.equal(preserved.weightKg,40);assert.deepEqual(preserved.frames,video.frames);assert.deepEqual(preserved.analysis,analysis);assert.equal((await getSession('good')).kind,'reference');assert.deepEqual(await listSessions(),[summary]);
 const original=await new Promise(resolve=>{const r=sports.transaction('videos').objectStore('videos').get('basketball');r.onsuccess=()=>resolve(r.result);});assert.equal(original.keep,true);sports.close();
});
test('one video link globally; duplicate batch aborts all writes; edit and detach are allowed',async()=>{
 await saveWorkoutSets([set('linked',{sourceSessionId:'video'})]);
 await assert.rejects(saveWorkoutSets([set('batch'),set('duplicate',{date:'2026-10-14',sourceSessionId:'video'})]),/すでに/);
 assert.deepEqual((await listWorkoutSets()).map(r=>r.id),['linked']);
 await saveWorkoutSets([set('linked',{sourceSessionId:'video',reps:10})]);assert.equal((await listWorkoutSets())[0].reps,10);
 await saveWorkoutSets([set('linked')]);await saveWorkoutSets([set('relinked',{sourceSessionId:'video'})]);
 await deleteWorkoutSet('linked');await deleteWorkoutSet('relinked');assert.deepEqual(await listWorkoutSets(),[]);
});
