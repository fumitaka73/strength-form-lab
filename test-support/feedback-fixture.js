// Entirely generated angles, not derived from a person's video or Pose data.
export function partialAnalysis(count=8){
 const rows=[],motionCandidates=[];
 for(let n=0;n<count;n++){
  const start=n*3,end=start+2.97,bottom=start+1.5;
  motionCandidates.push({id:-(n+1),start,end,bottom,basis:'torso-motion'});
  for(let i=0;i<100;i++){
   const triangle=1-Math.abs(i-50)/50;
   rows.push({time:start+i*.03,lean:5+55*triangle,hip:i<61?170-65*triangle:null,knee:i<27?170-8*triangle:null});
  }
 }
 return {version:'rdl-2d-v4',exercise:'rdl',model:'full',camera:'side',side:'left',coverage:.61,metricCoverage:{hip:.61,knee:.27,lean:1},reps:[],motionCandidates,rows,warnings:[]};
}
export function completeAnalysis(){const a=partialAnalysis(1);a.rows=a.rows.map((r,i)=>({...r,hip:170-65*(1-Math.abs(i-50)/50),knee:170-8*(1-Math.abs(i-50)/50)}));a.coverage=1;a.metricCoverage={hip:1,knee:1,lean:1};return a;}
