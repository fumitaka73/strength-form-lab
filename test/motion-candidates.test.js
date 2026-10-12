import test from 'node:test';
import assert from 'node:assert/strict';
import {detectMotionCandidates} from '../src/motion-candidates.js';
import {analyzeFrames,compareRep} from '../src/rdl.js';
const cycle=()=>[2,2,2,8,14,20,25,20,14,8,2,2,2].map((lean,i)=>({time:i*.15,lean,hip:null,knee:null}));
test('torso excursions are separate candidates without invented joint angles',()=>{
  const candidates=detectMotionCandidates(cycle());assert.equal(candidates.length,1);assert.equal(candidates[0].basis,'torso-motion');assert.equal(candidates[0].hipMin,undefined);assert.ok(candidates[0].id<0);
  const doubled=[...cycle(),...cycle().map(r=>({...r,time:r.time+2}))];assert.equal(detectMotionCandidates(doubled).length,2);
});
test('standing jitter, shallow excursions and incomplete cycles are not candidates',()=>{
  assert.deepEqual(detectMotionCandidates(cycle().map(r=>({...r,lean:3}))),[]);
  assert.deepEqual(detectMotionCandidates(cycle().map(r=>({...r,lean:r.lean/4}))),[]);
  assert.deepEqual(detectMotionCandidates(cycle().slice(3)),[]);
  assert.deepEqual(detectMotionCandidates(cycle().slice(0,10)),[]);
});
test('missing torso evidence and time gaps reset the candidate',()=>{
  const missing=cycle();missing[6].lean=null;assert.deepEqual(detectMotionCandidates(missing),[]);
  const gap=cycle().map((r,i)=>({...r,time:r.time+(i>5?2:0)}));assert.deepEqual(detectMotionCandidates(gap),[]);
});
test('reference comparison refuses different pose models',()=>{
  const rep={hipMin:90,kneeMin:150,leanMax:30,rom:40};const a={exercise:'rdl',camera:'side',side:'left',version:'v4',coverage:1,reps:[rep],model:'full'};
  assert.equal(compareRep(rep,{...a,model:'lite'},a),null);assert.equal(compareRep(rep,a,a).length,4);
  assert.deepEqual(analyzeFrames([],{camera:'front',model:'full'}).motionCandidates,[]);
});
