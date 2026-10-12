import {detectMotionCandidates} from './motion-candidates.js';
export const ANALYSIS_VERSION = 'rdl-2d-v4';
// Last upright frame must lead into the hinge within one second of continuous tracking.
export const READY_MAX_SECONDS = 1;
export const exercises = Object.freeze({rdl: {name: 'ルーマニアンデッドリフト', supported: true}, squat: {name: 'スクワット', supported: false}, bench: {name: 'ベンチプレス', supported: false}});
const finite = Number.isFinite;
export function angle(a, b, c) {
  const ux=a.x-b.x, uy=a.y-b.y, vx=c.x-b.x, vy=c.y-b.y;
  const d=Math.hypot(ux,uy)*Math.hypot(vx,vy);
  return d>1e-8 ? Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/d)))*180/Math.PI : null;
}
export function measure(frame, aspect=1, side='left') {
  const ids=side==='left'?[11,23,25,27]:[12,24,26,28];
  const p=ids.map(i=>frame.landmarks?.[i]);
  const valid=v=>aspect>0 && finite(aspect) && v && finite(v.x) && finite(v.y) && finite(v.visibility) && v.visibility>=.65 && v.x>=0 && v.x<=1 && v.y>=0 && v.y<=1;
  // Occluded ankles must not invalidate visible hip/torso measurements.
  const [s,h,k,a]=p.map(v=>valid(v)?{x:v.x*aspect,y:v.y}:null);
  const hip=s&&h&&k?angle(s,h,k):null, knee=h&&k&&a?angle(h,k,a):null;
  const lean=s&&h&&Math.hypot(s.x-h.x,s.y-h.y)>.01 ? Math.abs(Math.atan2(s.x-h.x,h.y-s.y)*180/Math.PI) : null;
  return {time:frame.time,hip,knee,lean};
}
export function detectReps(rows) {
  // Upright -> hinge -> upright. Missing evidence resets, never bridges gaps.
  let ready=null, active=null, last=-Infinity, up=0;
  const reps=[];
  for (const r of rows) {
    if (!finite(r.time) || r.time<=last) continue;
    if (r.time-last>.3 || !finite(r.hip) || !finite(r.lean)) {ready=null;active=null;up=0;}
    last=r.time;
    if (!finite(r.hip) || !finite(r.lean)) continue;
    if (!active) {
      if(ready && r.time-ready.time>READY_MAX_SECONDS)ready=null;
      if (r.hip>=155) {up++; if(up>=3) ready=r;}
      else if (r.hip<135 && ready) {active={start:ready.time, rows:[ready,r], bottom:r};up=0;}
      else up=0;
    } else {
      active.rows.push(r);
      if(r.hip<active.bottom.hip) active.bottom=r;
      up=r.hip>=155?up+1:0;
      if(up>=3) {
        const duration=r.time-active.start, rom=Math.max(...active.rows.map(x=>x.hip))-active.bottom.hip;
        const knees=active.rows.map(x=>x.knee), completeKnee=knees.every(finite);
        if(duration>=.8 && duration<=15 && rom>=30) reps.push({id:reps.length+1,start:active.start,end:r.time,bottom:active.bottom.time,hipMin:active.bottom.hip,kneeMin:completeKnee?Math.min(...knees):null,leanMax:Math.max(...active.rows.map(x=>x.lean)),rom,duration,assessment:completeKnee?'2Dのヒンジ候補。映像で本数と膝の動きを確認してください。':'2Dのヒンジ候補。足首などが見えない区間があるため、膝の最小角度は判定保留です。'});
        active=null;ready=r;up=3;
      }
      if(active && r.time-active.start>15) {active=null;ready=null;up=0;}
    }
  }
  return reps;
}
export function analyzeFrames(frames, {aspect=1, side='left', camera='side', model='lite'}={}) {
  const rows=frames.map(f=>measure(f,aspect,side));
  const coverage=rows.length?rows.filter(r=>finite(r.hip)).length/rows.length:0;
  const metricCoverage=Object.fromEntries(['hip','knee','lean'].map(key=>[key,rows.length?rows.filter(r=>finite(r[key])).length/rows.length:0]));
  const warnings=['背骨の丸まり・腰の反り・筋肉の緊張・重量の適否は、このPoseから判定できません。','レップ数と角度は暫定の2D推定です。実際の動画で確認してください。'];
  if(coverage<.8) warnings.push('関節の欠測が多いため、レップの見逃しがあり得ます。');
  if(metricCoverage.knee<.8) warnings.push('足首・膝・股関節の一部が見えにくく、膝角度の計測が不足しています。足首だけの欠測ではヒンジ候補の検出を止めません。');
  if(camera!=='side') warnings.push('横以外の映像ではRDLの角度とレップを判定しません。');
  const reps=camera==='side'?detectReps(rows):[];
  const motionCandidates=camera==='side'&&!reps.length?detectMotionCandidates(rows):[];
  if(motionCandidates.length)warnings.push('股関節角度でレップを確定できないため、体幹の往復を確認用候補として表示します。RDLの確定本数やフォーム採点ではありません。');
  return {model,motionCandidates,version:ANALYSIS_VERSION,exercise:'rdl',camera,side,aspect,rows,coverage,metricCoverage,reps,warnings};
}
export function compareRep(rep, reference, current) {
  if(!reference || (reference.model??'lite')!==(current.model??'lite') || reference.exercise!==current.exercise || reference.version!==current.version || reference.camera!=='side' || current.camera!=='side' || reference.side!==current.side || reference.coverage<.8 || current.coverage<.8 || !reference.reps.length) return null;
  const baseline=reference.reps[0];
  const differences=['hipMin','kneeMin','leanMax','rom'].filter(key=>finite(rep[key])&&finite(baseline[key])).map(key=>({key,delta:rep[key]-baseline[key],baseline:baseline[key]}));
  return differences.length?differences:null;
}
