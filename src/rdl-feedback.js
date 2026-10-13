import {compareRep} from './rdl.js';
export const FEEDBACK_VERSION='rdl-observed-feedback-v1';
export const CONFIG=Object.freeze({leanScale:45,hipScale:60,minChange:5,phaseFraction:.2,maxGap:.35,minPhaseSamples:2,minLeanCoverage:.6,minReferenceRange:5});
const finite=Number.isFinite;
const clamp=n=>Math.max(0,Math.min(1,n));
const mean=a=>a.reduce((s,n)=>s+n,0)/a.length;
const labels={hipMin:'いちばん曲げたときの股関節角度',kneeMin:'動作中の膝の最小角度',leanMax:'上体をいちばん倒した角度',rom:'股関節を曲げた幅'};
function validWindow(rows,interval){
  if(![interval.start,interval.bottom,interval.end].every(finite)||interval.start<0||!(interval.start<interval.bottom&&interval.bottom<interval.end))return {error:'動作の時刻が不足しています。動画で区間を確認してください。',rows:[]};
  if(!Array.isArray(rows)||rows.some((r,i)=>!r||!finite(r.time)||(i&&r.time<=rows[i-1].time)))return {error:'時刻の順序を確認できないため、評価を保留しています。',rows:[]};
  const window=rows.filter(r=>r.time>=interval.start&&r.time<=interval.end);
  if(window.length<6||window[0].time-interval.start>CONFIG.maxGap||interval.end-window.at(-1).time>CONFIG.maxGap||window.some((r,i)=>i&&r.time-window[i-1].time>CONFIG.maxGap))return {error:'動作の途中が読み取れません。途切れのない区間で確認してください。',rows:window};
  return {rows:window};
}
function observe(rows,interval,key){
  const duration=interval.end-interval.start,f=duration*CONFIG.phaseFraction;
  const observed=rows.filter(r=>finite(r[key])&&r[key]>=0&&r[key]<=180);
  const phases={start:observed.filter(r=>r.time<=interval.start+f),bottom:observed.filter(r=>Math.abs(r.time-interval.bottom)<=f),end:observed.filter(r=>r.time>=interval.end-f)};
  const counts=Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,v.length]));
  const phaseReady=Object.values(counts).every(n=>n>=CONFIG.minPhaseSamples);
  const values=observed.map(r=>r[key]),range=values.length>=2?Math.max(...values)-Math.min(...values):null;
  return {samples:values.length,total:rows.length,coverage:rows.length?values.length/rows.length:0,range,firstTime:observed[0]?.time??null,lastTime:observed.at(-1)?.time??null,phaseCounts:counts,phaseReady,
    start:phaseReady?mean(phases.start.map(r=>r[key])):null,bottom:phaseReady?mean(phases.bottom.map(r=>r[key])):null,end:phaseReady?mean(phases.end.map(r=>r[key])):null};
}
export function estimateInterval(analysis,interval){
  const window=validWindow(analysis.rows??[],interval),metrics=Object.fromEntries(['hip','knee','lean'].map(k=>[k,observe(window.rows,interval,k)]));
  const base={id:interval.id,start:interval.start,bottom:interval.bottom,end:interval.end,metrics,score:null,kind:null,inputs:null,advice:[],reason:null};
  if(analysis.exercise!=='rdl'||analysis.camera!=='side'||!['left','right'].includes(analysis.side))return {...base,reason:'真横から撮ったRDLの映像で確認してください。'};
  if(window.error)return {...base,reason:window.error};
  const l=metrics.lean,h=metrics.hip,k=metrics.knee;
  const leanRows=window.rows.filter(r=>finite(r.lean));
  if(!l.phaseReady||l.coverage<CONFIG.minLeanCoverage||leanRows.some((r,i)=>i&&r.time-leanRows[i-1].time>CONFIG.maxGap))return {...base,reason:'上体の前傾と戻りを十分に読み取れません。肩と股関節が見える位置で撮影してください。安全器具は外さないでください。'};
  const leanChange=l.bottom-(l.start+l.end)/2;
  if(leanChange<CONFIG.minChange)return {...base,reason:'前傾から戻る動きの幅が小さいため、目安を計算できません。動画で動作を確認してください。'};
  const returnFactor=clamp(1-Math.abs(l.end-l.start)/Math.max(l.range,10));
  const hipChange=h.phaseReady?Math.max(0,(h.start+h.end)/2-h.bottom):null;
  const kneeChange=k.phaseReady?Math.abs((k.start+k.end)/2-k.bottom):null;
  if(h.phaseReady&&k.phaseReady&&hipChange>=CONFIG.minChange){
    const dominance=hipChange/(hipChange+kneeChange),amplitude=clamp(hipChange/CONFIG.hipScale);
    base.kind='hip-dominance';base.score=Math.round(100*(.5*dominance+.3*amplitude+.2*returnFactor));base.inputs={hipChange,kneeChange,dominance,amplitude,returnFactor};
    base.advice=kneeChange>hipChange*.5?[{text:'膝を深く曲げるより、股関節から折りたたむ意識を試してみましょう。',basis:`観測できた股関節の曲げ幅 ${hipChange.toFixed(1)}°に対し、膝の変化 ${kneeChange.toFixed(1)}°。骨盤の後方移動は測っていません。`}]:[{text:'股関節を曲げてから戻る動きが見えています。次のセットも同じ撮影位置で、動作の幅を見比べてみましょう。',basis:`動作の上部・深く倒した場面・戻った場面で股関節と膝を読み取りました。股関節 ${hipChange.toFixed(1)}°、膝 ${kneeChange.toFixed(1)}°。`}];
  }else{
    const amplitude=clamp(leanChange/CONFIG.leanScale);
    base.kind='lean-return';base.score=Math.round(100*(.6*amplitude+.4*returnFactor));base.inputs={leanChange,amplitude,returnFactor};
    base.advice=[{text:'前傾から起き上がる動きは確認できました。次のセットは、股関節から折りたたむ意識で動きを見比べてみましょう。',basis:`上体の前傾変化 ${leanChange.toFixed(1)}°と開始・終了の傾き差 ${Math.abs(l.end-l.start).toFixed(1)}°。股関節主体かどうかは未評価です。`}];
    if(!h.phaseReady||!k.phaseReady)base.advice.push({text:'肩・股関節・膝・足首が見える撮影位置を試すと、さらに詳しく確認できます。安全器具はそのままで撮影してください。',basis:`股関節と膝のいずれかで、動作の上部・深く倒した場面・戻った場面の観測が不足しています。`});
  }
  return base;
}
export function compareInterval(rep,reference,current){
  const differences=compareRep(rep,reference,current);
  return Object.entries(labels).map(([key,label])=>{
    const d=differences?.find(d=>d.key===key),range=reference?.reps?.[0]?.rom;
    return {key,label,value:finite(rep[key])?rep[key]:null,baseline:d?.baseline??null,delta:d?.delta??null,relativePercent:d&&finite(range)&&range>=CONFIG.minReferenceRange?100*d.delta/range:null,denominator:d&&finite(range)?range:null,reason:d?null:'撮影条件・読み取れた割合・観測角度がそろわないため比較保留'};
  });
}
export function buildFeedback(analysis,reference=null,{referenceId=null,referenceName=null}={}){
  const intervals=analysis.reps?.length?analysis.reps:analysis.motionCandidates??[];
  const cards=intervals.map(interval=>{
    const result=estimateInterval(analysis,interval);
    result.comparison=analysis.reps?.length&&reference?compareInterval(interval,reference,analysis):null;
    const comparable=result.comparison?.filter(d=>d.delta!==null)??[];
    if(comparable.length){
      const hip=comparable.find(d=>d.key==='hipMin'&&d.delta>5),knee=comparable.find(d=>d.key==='kneeMin'&&d.delta< -5),lean=comparable.find(d=>d.key==='leanMax'&&d.delta< -5);
      const chosen=hip??knee??lean;
      if(chosen)result.advice=[{text:knee===chosen?'お手本より膝の曲がりが大きめです。膝を深く曲げるより、股関節から折りたたむ意識を試しましょう。':'お手本より折りたたむ動きが小さめです。無理に深くせず、股関節から折りたたむ意識で動画を見比べましょう。',basis:`${chosen.label}：お手本 ${chosen.baseline.toFixed(1)}°、今回 ${chosen.value.toFixed(1)}°、差 ${chosen.delta.toFixed(1)}°。`}];
    }
    return result;
  });
  const scored=cards.filter(c=>c.score!==null),kinds=[...new Set(scored.map(c=>c.kind))];
  const summary=kinds.length===1?{kind:kinds[0],score:Math.round(mean(scored.map(c=>c.score))),count:scored.length}:null;
  const advice=[];for(const card of cards)for(const a of card.advice){if(advice.length<2&&!advice.some(x=>x.text===a.text))advice.push({...a,intervalId:card.id});}
  return {version:FEEDBACK_VERSION,createdAt:Date.now(),analysisVersion:analysis.version,model:analysis.model??'lite',camera:analysis.camera,side:analysis.side,reference:reference?{id:referenceId,name:referenceName,analysis:{version:reference.version,model:reference.model??'lite',exercise:reference.exercise,camera:reference.camera,side:reference.side,coverage:reference.coverage,reps:(reference.reps??[]).slice(0,1).map(r=>({hipMin:r.hipMin,kneeMin:r.kneeMin,leanMax:r.leanMax,rom:r.rom}))}}:null,config:{...CONFIG},cards,summary,advice,
    referenceMode:reference?'personal':'general-qualitative',referenceNote:reference?'お手本との角度比較は、角度から検出した動作と条件がそろう項目だけで行います。':'一般的な確認ポイント：股関節から折りたたみ、膝は軽く曲げる意識。万人共通の理想角度は設定していません。',
    limitations:'割合は観測した動きから作る参考指標です。フォームの正しさ・一致率・精度の確率ではありません。背中の丸まり・腰の反り・骨盤の後方移動・重量の適否は未評価です。'};
}
