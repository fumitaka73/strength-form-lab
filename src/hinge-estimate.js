// Observed angle ranges, not a judgment of spinal shape or exercise correctness.
function observedRange(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(sorted.length<4)return null;
  const quantile=p=>sorted[Math.floor((sorted.length-1)*p)];
  return quantile(.9)-quantile(.1);
}
export function estimateHinge(rows,interval){
  const window=rows.filter(r=>Number.isFinite(r.time)&&r.time>=interval.start&&r.time<=interval.end);
  const coverage=key=>window.length?window.filter(r=>Number.isFinite(r[key])).length/window.length:0;
  const hipCoverage=coverage('hip'),leanCoverage=coverage('lean');
  return {basis:'observed-2d-range',hipCoverage,leanCoverage,
    hipRange:hipCoverage>=.5?observedRange(window.map(r=>r.hip)):null,
    leanRange:leanCoverage>=.8?observedRange(window.map(r=>r.lean)):null,
    spinalFlexion:null,lumbarExtension:null};
}
