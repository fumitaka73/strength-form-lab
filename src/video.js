import {createPoseEngine} from './pose-engine.js';
export function seekVideo(video,time) {
  if(Math.abs(video.currentTime-time)<.001 && video.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('動画を読み込めません。H.264のMP4をお試しください。')),10000);
    const done=()=>finish(),failed=()=>finish(new Error('動画の読み込みに失敗しました。'));
    function finish(e){clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',failed);e?reject(e):resolve();}
    video.addEventListener('seeked',done);video.addEventListener('error',failed);video.currentTime=time;
  });
}
export async function scanVideo(video,signal,progress) {
  if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>120)throw new Error('MVPでは2分以内の動画を選んでください。');
  const check=()=>{if(signal.aborted)throw new DOMException('分析を中止しました。','AbortError');};
  let points=null,pose; const frames=[],original=video.currentTime;
  video.pause();
  try {
    check();pose=await createPoseEngine(r=>{points=r.poseLandmarks?.map(p=>({x:p.x,y:p.y,visibility:p.visibility}))??null;});
    await pose.initialize();check();
    const canvas=document.createElement('canvas'),scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    const ctx=canvas.getContext('2d'),count=Math.ceil(video.duration*12);
    for(let i=0;i<count;i++) {
      check();const time=i/12;await seekVideo(video,time);check();ctx.drawImage(video,0,0,canvas.width,canvas.height);points=null;
      await pose.send({image:canvas},time*1000);check();frames.push({time,landmarks:points});progress(Math.round((i+1)/count*100));await new Promise(r=>setTimeout(r,0));
    }
    return frames;
  } finally {await pose?.close().catch(()=>{});await seekVideo(video,original).catch(()=>{});}
}
