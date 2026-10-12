import test from 'node:test';
import assert from 'node:assert/strict';
import {angle,measure,detectReps,analyzeFrames,compareRep} from '../src/rdl.js';
import {videoTransform} from '../src/pose-coordinates.js';
const rows=()=>[170,170,170,150,125,100,90,100,125,150,170,170,170].map((hip,i)=>({time:i*.15,hip,knee:160,lean:180-hip}));
test('counts one complete hinge and repeated sets, never standing jitter',()=>{assert.equal(detectReps(rows()).length,1);assert.equal(detectReps([...rows(),...rows().map(r=>({...r,time:r.time+2}))]).length,2);assert.equal(detectReps(rows().map(r=>({...r,hip:160}))).length,0);});
test('does not bridge missing joints or tracking gaps',()=>{const r=rows();r[6].hip=null;assert.equal(detectReps(r).length,0);assert.equal(detectReps(rows().map((r,i)=>({...r,time:r.time+(i>5?1:0)}))).length,0);});
test('partial start/end and short movements do not invent completed reps',()=>{assert.equal(detectReps(rows().slice(4)).length,0);assert.equal(detectReps(rows().slice(0,9)).length,0);assert.equal(detectReps(rows().map(r=>({...r,time:r.time/10}))).length,0);});
test('geometry handles aspect ratio and refuses weak/cropped/degenerate joints',()=>{assert.equal(angle({x:0,y:0},{x:0,y:0},{x:1,y:0}),null);const landmarks=Array(33).fill(null);[11,23,25,27].forEach((id,i)=>landmarks[id]={x:[.2,.4,.4,.4][i],y:[.2,.4,.6,.8][i],visibility:.9});assert.notEqual(measure({time:0,landmarks},1).hip,measure({time:0,landmarks},2).hip);landmarks[27].visibility=.1;assert.ok(Number.isFinite(measure({time:0,landmarks}).hip));assert.equal(measure({time:0,landmarks}).knee,null);landmarks[27].visibility=.9;landmarks[11].x=-.1;assert.equal(measure({time:0,landmarks}).hip,null);});
test('front angle and no pose are explicitly unassessable',()=>{assert.deepEqual(analyzeFrames([{time:0,landmarks:null}],{camera:'front'}).reps,[]);assert.equal(analyzeFrames([]).coverage,0);});
test('reference comparison requires matching exercise, side, angle, version and quality',()=>{const rep=detectReps(rows())[0],a={exercise:'rdl',camera:'side',side:'left',version:'v1',coverage:1,reps:[rep]};assert.equal(compareRep(rep,a,a)[0].delta,0);for(const patch of [{exercise:'squat'},{side:'right'},{camera:'front'},{version:'v2'},{coverage:.3},{reps:[]}])assert.equal(compareRep(rep,{...a,...patch},a),null);});
test('reused overlay mapping aligns portrait letterboxing and mirror',()=>{const t=videoTransform(720,1280,400,300);assert.equal(t.x({x:.5}),200);assert.equal(t.y({y:1}),300);const mirror=videoTransform(1280,720,400,300,true);assert.equal(mirror.x({x:0}),400);});
test('long intermediate stance expires ready and cannot attach to an old start',()=>{
  const intermediate=Array.from({length:12},(_,i)=>({time:.45+i*.15,hip:145,knee:160,lean:35}));
  const lateHinge=rows().slice(4).map((r,i)=>({...r,time:2.25+i*.15}));
  assert.equal(detectReps([...rows().slice(0,3),...intermediate,...lateHinge]).length,0);
});
test('after readiness expiry a fresh upright stance can start a fresh rep',()=>{
  const waiting=Array.from({length:12},(_,i)=>({time:.45+i*.15,hip:145,knee:160,lean:35}));
  const fresh=rows().map(r=>({...r,time:r.time+2.25}));
  const reps=detectReps([...rows().slice(0,3),...waiting,...fresh]);assert.equal(reps.length,1);assert.equal(reps[0].start,2.55);
});

test('ankle occlusion retains hip and torso while withholding knee angle',()=>{
  const landmarks=Array(33).fill(null);
  for(const [id,x,y] of [[11,.2,.2],[23,.4,.4],[25,.4,.6],[27,.4,.8]])landmarks[id]={x,y,visibility:.9};
  landmarks[27].visibility=.1;
  const frame={time:0,landmarks},m=measure(frame);
  assert.ok(Number.isFinite(m.hip));assert.ok(Number.isFinite(m.lean));assert.equal(m.knee,null);
  const a=analyzeFrames([frame]);assert.deepEqual(a.metricCoverage,{hip:1,knee:0,lean:1});
  landmarks[25].visibility=.1;
  assert.equal(measure(frame).hip,null);assert.ok(Number.isFinite(measure(frame).lean));
  landmarks[23].visibility=.1;assert.equal(measure(frame).lean,null);
});
test('completed hinge with hidden ankle is counted without inventing knee minima',()=>{
  const input=rows().map(r=>({...r,knee:null}));
  const reps=detectReps(input);assert.equal(reps.length,1);assert.equal(reps[0].kneeMin,null);
  const mixed=rows();mixed[6].knee=null;assert.equal(detectReps(mixed)[0].kneeMin,null);
  const a={exercise:'rdl',camera:'side',side:'left',version:'v3',coverage:1,reps};
  assert.deepEqual(compareRep(reps[0],a,a).map(d=>d.key),['hipMin','leanMax','rom']);
  assert.equal(compareRep({},a,a),null);
});
test('hip or torso occlusion still stops detection, and invalid visibility is rejected',()=>{
  for(const key of ['hip','lean']){const input=rows();input[6][key]=null;assert.equal(detectReps(input).length,0);}
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:NaN}));
  assert.deepEqual(measure({time:0,landmarks}),{time:0,hip:null,knee:null,lean:null});
});
