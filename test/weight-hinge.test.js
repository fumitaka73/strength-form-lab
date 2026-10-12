import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWeight,weightLabel} from '../src/session-weight.js';
import {estimateHinge} from '../src/hinge-estimate.js';
test('weight handles blank, zero and decimal totals and rejects invalid values',()=>{
  assert.equal(parseWeight(''),null);assert.equal(parseWeight(' '),null);assert.equal(parseWeight('0'),0);assert.equal(parseWeight('42.5'),42.5);
  for(const value of [-1,'bad',Infinity,true])assert.throws(()=>parseWeight(value));
  assert.equal(weightLabel(0),'0 kg');assert.equal(weightLabel(null),'重量未入力');
});
test('partial hip measurements yield a labeled observed range without spinal estimates',()=>{
  const rows=Array.from({length:10},(_,i)=>({time:i/10,hip:i<6?100+i*10:null,lean:i*3}));
  const result=estimateHinge(rows,{start:0,end:.9});
  assert.equal(result.hipCoverage,.6);assert.equal(result.hipRange,40);assert.equal(result.leanRange,24);
  assert.equal(result.spinalFlexion,null);assert.equal(result.lumbarExtension,null);
});
test('insufficient or out-of-window evidence never fills missing angles',()=>{
  const rows=Array.from({length:10},(_,i)=>({time:i/10,hip:i<4?120:null,lean:i<7?20:null}));
  const result=estimateHinge(rows,{start:0,end:.9});assert.equal(result.hipRange,null);assert.equal(result.leanRange,null);
  assert.equal(estimateHinge(rows,{start:2,end:3}).hipRange,null);
  assert.equal(estimateHinge(rows,{start:0,end:.1}).hipRange,null);
});
