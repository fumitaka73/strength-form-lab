// Counts torso excursions only. These are review candidates, not confirmed RDLs.
export function detectMotionCandidates(rows) {
  const values=rows.map(r=>r.lean).filter(Number.isFinite).sort((a,b)=>a-b);
  if(values.length<12)return [];
  const q=p=>values[Math.floor((values.length-1)*p)];
  if(q(.9)-q(.1)<10)return [];
  const upright=Math.min(10,q(.2)+3),hinge=Math.max(15,q(.8)-2);
  const smooth=rows.map((r,i)=>{
    if(!Number.isFinite(r.lean))return {...r,value:null};
    const w=rows.slice(Math.max(0,i-2),i+3).filter(x=>Number.isFinite(x.lean)&&Math.abs(x.time-r.time)<=.25).map(x=>x.lean).sort((a,b)=>a-b);
    return {...r,value:w[Math.floor(w.length/2)]};
  });
  const candidates=[];let ready=null,active=null,up=0,last=-Infinity;
  for(const r of smooth){
    if(!Number.isFinite(r.time)||r.time<=last)continue;
    if(r.time-last>.3||!Number.isFinite(r.value)){ready=null;active=null;up=0;}
    last=r.time;if(!Number.isFinite(r.value))continue;
    if(active&&r.time-active.start>10){ready=null;active=null;up=0;}
    if(!active&&ready&&r.time-ready.time>2.5)ready=null;
    if(r.value<=upright){
      up++;
      if(up>=3){
        if(active){
          const duration=r.time-active.start;
          if(duration>=.8&&duration<=10&&active.peak.value-active.initial>=10)candidates.push({id:-(candidates.length+1),start:active.start,end:r.time,bottom:active.peak.time,basis:'torso-motion',assessment:'体幹の往復候補。股関節角度で確定できないため、本数と動作区間を映像で確認してください。'});
          active=null;
        }
        ready=r;
      }
    }else{
      up=0;
      if(!active&&ready&&r.value>=hinge)active={start:ready.time,initial:ready.value,peak:r};
      if(active&&r.value>active.peak.value)active.peak=r;
    }
  }
  return candidates;
}
