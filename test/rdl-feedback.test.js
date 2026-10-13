import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFeedback,estimateInterval,compareInterval,FEEDBACK_VERSION} from '../src/rdl-feedback.js';
import {partialAnalysis,completeAnalysis} from '../test-support/feedback-fixture.js';
test('synthetic hip61/knee27/lean100 gives eight lean-only estimates and grounded advice, not eight confirmed reps',()=>{
 const a=partialAnalysis(),before=structuredClone(a),report=buildFeedback(a);
 assert.equal(report.cards.length,8);assert.equal(report.summary.kind,'lean-return');assert.ok(report.summary.score>0&&report.summary.score<=100);assert.equal(report.advice.length,2);
 for(const c of report.cards){assert.equal(c.metrics.hip.coverage,.61);assert.equal(c.metrics.knee.coverage,.27);assert.equal(c.metrics.lean.coverage,1);assert.equal(c.kind,'lean-return');assert.equal(c.inputs.hipChange,undefined);assert.equal(c.comparison,null);assert.ok(c.metrics.hip.range>0);}
 assert.deepEqual(a,before);assert.equal(report.referenceMode,'general-qualitative');assert.equal(report.version,FEEDBACK_VERSION);
});
test('full hip/knee phases enable different formula and fixed computed inputs',()=>{
 const a=completeAnalysis(),r=estimateInterval(a,a.motionCandidates[0]);assert.equal(r.kind,'hip-dominance');
 const {hipChange,kneeChange,dominance,amplitude,returnFactor}=r.inputs;assert.ok(hipChange>kneeChange);assert.equal(r.score,Math.round(100*(.5*dominance+.3*amplitude+.2*returnFactor)));
 const sparse=partialAnalysis(1),l=estimateInterval(sparse,sparse.motionCandidates[0]);assert.equal(l.score,Math.round(100*(.6*l.inputs.amplitude+.4*l.inputs.returnFactor)));
});
test('all missing, different camera, malformed/reversed times, gaps, static and missing phases never fabricate score',()=>{
 const original=partialAnalysis(1);
 const variants=[{...original,camera:'front'},{...original,camera:'diagonal'},{...original,rows:original.rows.map(r=>({...r,hip:null,knee:null,lean:null}))},{...original,rows:[...original.rows].reverse()},{...original,rows:original.rows.map((r,i)=>({...r,time:r.time+(i>50?1:0)}))},{...original,rows:original.rows.map(r=>({...r,lean:5}))},{...original,rows:original.rows.slice(20,70)}];
 for(const a of variants){const r=buildFeedback(a);assert.equal(r.summary,null);assert.equal(r.cards[0].score,null);assert.ok(r.cards[0].reason);}
});
test('sparse angle ranges show only sampled evidence; missing values are never interpolated',()=>{
 const a=partialAnalysis(1);a.rows=a.rows.map((r,i)=>({...r,hip:i===10?160:i===50?110:null}));const r=buildFeedback(a).cards[0];assert.equal(r.metrics.hip.range,50);assert.equal(r.metrics.hip.samples,2);assert.equal(r.metrics.hip.phaseReady,false);assert.equal(r.kind,'lean-return');assert.equal(r.metrics.hip.start,null);
});
test('personal strict comparison reports baseline, current, signed degrees and relative range; unstable denominator is held',()=>{
 const a=completeAnalysis();a.reps=[{id:1,start:0,bottom:1.5,end:2.97,hipMin:110,kneeMin:150,leanMax:55,rom:60}];a.motionCandidates=[];
 const reference={...a,reps:[{...a.reps[0],hipMin:100,kneeMin:165,leanMax:60,rom:70}]};
 const r=buildFeedback(a,reference,{referenceName:'お手本'});const d=r.cards[0].comparison[0];assert.equal(d.baseline,100);assert.equal(d.value,110);assert.equal(d.delta,10);assert.equal(d.relativePercent,100*10/70);assert.ok(r.cards[0].advice[0].basis.includes('差 10.0°'));
 for(const rom of [0,.01,4.999])assert.equal(compareInterval(a.reps[0],{...reference,reps:[{...reference.reps[0],rom}]},a)[0].relativePercent,null);
 assert.equal(compareInterval(a.reps[0],{...reference,reps:[{...reference.reps[0],rom:5}]},a)[0].relativePercent,200);
 for(const patch of [{side:'right'},{camera:'front'},{model:'lite'},{version:'old'},{coverage:.79}])assert.ok(compareInterval(a.reps[0],{...reference,...patch},a).every(d=>d.delta===null));
});
test('motion candidates never claim personal angle comparison; old records without rows are not reanalysed',()=>{
 const a=partialAnalysis(),ref=completeAnalysis();ref.reps=[{hipMin:100,kneeMin:160,leanMax:55,rom:70}];assert.ok(buildFeedback(a,ref).cards.every(c=>c.comparison===null));
 const old={...ref,rows:undefined};const before=structuredClone(old);assert.equal(buildFeedback(old).summary,null);assert.deepEqual(old,before);
});
test('percentage remains bounded at engineering scales and tiny movements are held',()=>{
 const a=completeAnalysis();a.rows=a.rows.map(r=>({...r,lean:r.lean*2}));const report=buildFeedback(a);assert.ok(report.cards[0].score<=100);
 const low=partialAnalysis(1);low.rows=low.rows.map(r=>({...r,lean:5+(r.lean-5)/100}));assert.equal(buildFeedback(low).cards[0].score,null);
 const missing=partialAnalysis(1);missing.rows=missing.rows.map(r=>({...r,knee:null}));assert.equal(buildFeedback(missing).cards[0].kind,'lean-return');
 const negative={...a,motionCandidates:[{id:1,start:-1,bottom:0,end:1}]};assert.equal(buildFeedback(negative).cards[0].score,null);
});
test('corrupt old time series and NaN angles return held result rather than throwing',()=>{
 for(const rows of [null,'corrupt',[null],[{time:NaN}],[{time:0,lean:Infinity}]]){const a=partialAnalysis(1);a.rows=rows;assert.equal(buildFeedback(a).cards[0].score,null);}
});
