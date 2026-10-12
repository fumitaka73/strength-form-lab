import './style.css';
import {analyzeFrames,compareRep} from './rdl.js';
import {drawPose} from './pose-coordinates.js';
import {scanVideo,seekVideo} from './video.js';
import {saveSession,listSessions,getSession,deleteSession,referenceSnapshot} from './storage.js';
import {CoachVoice} from './coach-voice.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={hipMin:'股関節の最小角度',kneeMin:'膝の最小角度',leanMax:'体幹の最大傾き',rom:'股関節の可動域'};
let sessions=[],current=null,blob=null,url=null,controller=null,busy=false,referenceId='',playEnd=null;
const voice=new CoachVoice({onError:message});
$('#app').innerHTML=`<header><span class="eyebrow">MOVE WITH AWARENESS</span><h1>Strength Form Lab<span>RDL / フォームを、見える形に。</span></h1><p>あなたの動きを記録し、自分のGood Formと見比べる。</p></header><nav aria-label="メイン"><button data-tab="practice" aria-pressed="true">分析</button><button data-tab="reference" aria-pressed="false">Good Form</button><button data-tab="history" aria-pressed="false">履歴</button></nav><main><p id="status" role="status" aria-live="polite"></p><section id="practice"><div class="card"><div class="section-title"><span class="number">01</span><h2>動画を準備</h2><span class="badge">RDL · BETA</span></div><p>真横から、肩・股関節・膝・足首が入る固定映像を撮影。2分・100MB以内、1人で行ってください。</p><div class="actions"><label class="button primary">動画を選ぶ<input id="file" type="file" accept="video/*"></label><label class="button">iPhoneで撮影<input id="capture" type="file" accept="video/*" capture="environment"></label></div><div class="fields"><label>撮影角度<select id="camera"><option value="side">真横</option><option value="diagonal">斜め</option><option value="front">正面</option></select></label><label>カメラ側の体<select id="side"><option value="left">左側</option><option value="right">右側</option></select></label><label>登録方法<select id="kind"><option value="session">練習セッション</option><option value="reference">Good Form</option></select></label><label>記録名<input id="name" maxlength="80" placeholder="例：朝のRDL・軽め"></label></div><button id="reconfigure" hidden>撮影条件を変更して再分析</button><p class="hint">重り・セーフティバーで足首が隠れても、肩・股関節・膝が見える区間でヒンジ候補を探します。股関節や膝も隠れる場合は検出を保留します。</p><p class="hint">スクワット・ベンチプレスは今後対応予定です。</p></div><div class="card"><div class="player"><video id="video" controls playsinline preload="metadata"></video><canvas id="overlay" aria-hidden="true"></canvas></div><label class="timeline-label">再生位置 <output id="time">0.0秒</output><input id="timeline" type="range" min="0" max="1" step="0.01" value="0" aria-label="動画タイムライン"></label><div class="actions"><label>速度<select id="speed"><option value="1">1倍</option><option value="0.5">0.5倍</option><option value="0.25">0.25倍</option></select></label><button id="analyze" class="primary" disabled>RDLを分析</button><button id="cancel" hidden>中止</button><button id="save" disabled>端末に保存</button></div><progress id="progress" max="100" value="0" hidden></progress><div id="result"></div></div></section><section id="reference" hidden><h2>自分のGood Form</h2><p>指導者と確認した動画を「登録方法：Good Form」で分析・保存してください。基準は同じ横向き・同じ体の側で比較します。</p><div id="references"></div></section><section id="history" hidden><h2>練習の記録</h2><p>動画とPoseはこのブラウザ内だけに保存。Safariのデータ消去や容量整理で失われる場合があります。</p><div id="records"></div></section><aside><h2>数値の読み方</h2><p>MediaPipeによる2D姿勢推定です。レップ候補・角度・体幹の傾きは撮影条件で変わります。背骨の丸まり、腰の反り、重量の適否、けがのリスクは判定できません。</p><p>外部AIへの送信はありません。MVPのフィードバックは計測ルールに基づく参考情報です。</p></aside></main><footer>ON-DEVICE · PRIVATE BY DESIGN</footer>`;
function message(text){$('#status').textContent=text;}
function setBusy(value){busy=value;for(const id of ['file','capture','camera','side','kind','name','speed','timeline'])$('#'+id).disabled=value;$('#video').controls=!value;$('#analyze').disabled=value||!blob;$('#save').disabled=value||!current;updateConditions();$('#cancel').hidden=!value;$('#progress').hidden=!value;}
function updateConditions(){
  // A saved analysis belongs to its original capture settings. Re-analysis unlocks them.
  for(const id of ['camera','side'])$('#'+id).disabled=busy||!!current;
  $('#reconfigure').hidden=!current;
  $('#reconfigure').disabled=busy;
}
$('#reconfigure').onclick=()=>{
  if(busy)return;current=null;referenceId='';$('#save').disabled=true;renderResult();updateConditions();updateOverlay();
  message('撮影条件を変更してから再分析してください。元の保存済み記録は保持しています。');
};
function renderResult(){
  const target=$('#result');if(!current){target.replaceChildren();return;}
  const a=current.analysis,ref=referenceId==='snapshot'?current.referenceSnapshot:sessions.find(s=>s.id===referenceId);
  target.innerHTML=`<div class="section-title"><span class="number">02</span><h2>${a.reps.length} レップ候補</h2></div><p>計測可能フレーム ${Math.round(a.coverage*100)}% · 採点ではなく観測結果</p>${a.metricCoverage?`<p>股関節 ${Math.round(a.metricCoverage.hip*100)}% / 膝 ${Math.round(a.metricCoverage.knee*100)}% / 体幹 ${Math.round(a.metricCoverage.lean*100)}% のフレームで計測できました。</p>`:''}<label>比較するGood Form<select id="compare"><option value="">比較しない</option>${current.referenceSnapshot?`<option value="snapshot" ${referenceId==='snapshot'?'selected':''}>保存時の基準：${escape(current.referenceSnapshot.name)}</option>`:''}${sessions.filter(s=>s.kind==='reference').map(s=>`<option value="${s.id}" ${s.id===referenceId?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label>${a.warnings.map(w=>`<p class="hint">${escape(w)}</p>`).join('')}${ref && !compareRep(a.reps[0]??{},ref.analysis,a)?'<p class="hint">同じ撮影条件・十分な検出率・完成したレップが必要なため、比較できません。</p>':''}${a.reps.map(r=>{const diff=compareRep(r,ref?.analysis,a);return `<article class="rep"><h3>レップ ${r.id} <small>${r.start.toFixed(1)}–${r.end.toFixed(1)}秒</small></h3><div class="metrics">${Object.entries(labels).map(([k,l])=>`<div><span>${l}</span><strong>${Number.isFinite(r[k])?r[k].toFixed(0)+'°':'計測不可'}</strong>${diff?.some(d=>d.key===k)?`<small>基準との差 ${diff.find(d=>d.key===k).delta.toFixed(0)}°</small>`:''}</div>`).join('')}</div><p>${r.assessment}</p><div class="actions"><button data-rep="${r.id}">このレップを再生</button><button data-bottom="${r.id}">最下点を見る</button></div></article>`;}).join('')}${!a.reps.length?'<p>完成したレップを検出できませんでした。撮影条件と映像を確認してください。未検出でも動画は保存できます。</p>':''}<button id="speak">結果を読み上げる</button><label>レビュー・メモ<textarea id="note" maxlength="2000" placeholder="実際の本数、気づいたこと">${escape(current.note??'')}</textarea></label>`;
  $('#compare').onchange=e=>{referenceId=e.target.value;const selected=sessions.find(s=>s.id===referenceId);if(selected)current.referenceSnapshot=referenceSnapshot(selected);else if(referenceId!=='snapshot')current.referenceSnapshot=null;renderResult();};
  $('#note').oninput=e=>current.note=e.target.value;
  $('#speak').onclick=()=>voice.say(`${a.reps.length}レップ候補です。${a.coverage<.8?'関節の欠測が多いため本数を確認してください。':'動画と角度を見比べてください。'}背骨の姿勢や重量の適否は判定できません。`);
  target.querySelectorAll('[data-rep]').forEach(b=>b.onclick=()=>run(async()=>{const r=a.reps.find(r=>r.id===Number(b.dataset.rep));await seekVideo($('#video'),r.start);playEnd=r.end;await $('#video').play();}));
  target.querySelectorAll('[data-bottom]').forEach(b=>b.onclick=()=>run(async()=>{$('#video').pause();playEnd=null;await seekVideo($('#video'),a.reps.find(r=>r.id===Number(b.dataset.bottom)).bottom);}));
}
async function run(fn){try{await fn();}catch(e){message(e.message);}}
function replaceVideo(value){if(url)URL.revokeObjectURL(url);blob=value;url=URL.createObjectURL(value);$('#video').src=url;playEnd=null;$('#overlay').getContext('2d').clearRect(0,0,$('#overlay').width,$('#overlay').height);}
async function loadFile(file){if(!file)return;if(file.size>100*1024*1024)throw new Error('100MB以内の動画を選んでください。');current=null;referenceId='';replaceVideo(file);$('#name').value=file.name;$('#save').disabled=true;$('#analyze').disabled=true;renderResult();updateConditions();message('動画を読み込み中…');}
for(const id of ['file','capture'])$('#'+id).onchange=e=>run(()=>loadFile(e.target.files[0]));
$('#video').onloadedmetadata=()=>{$('#timeline').max=$('#video').duration||1;$('#analyze').disabled=busy||!blob;message('動画を確認し、撮影角度と体の側を選んでください。');};
$('#video').onerror=()=>message('この動画形式を再生できません。H.264のMP4をお試しください。');
$('#speed').onchange=e=>$('#video').playbackRate=Number(e.target.value);
$('#timeline').oninput=e=>{playEnd=null;$('#video').currentTime=Number(e.target.value);};
function updateOverlay(){const video=$('#video'),frames=current?.frames;$('#time').textContent=video.currentTime.toFixed(1)+'秒';$('#timeline').value=video.currentTime;if(playEnd!==null && video.currentTime>=playEnd){video.pause();playEnd=null;}const f=frames?.[Math.round(video.currentTime*12)];drawPose($('#overlay'),video,f && Math.abs(f.time-video.currentTime)<.15?f.landmarks:null);}
$('#video').ontimeupdate=updateOverlay;$('#video').onseeked=updateOverlay;
new ResizeObserver(updateOverlay).observe($('#video'));
$('#analyze').onclick=()=>run(async()=>{
  controller=new AbortController();setBusy(true);current=null;referenceId='';renderResult();voice.cancel();message('姿勢モデルを準備しています…');
  try{const frames=await scanVideo($('#video'),controller.signal,n=>{$('#progress').value=n;message(`端末で分析中 ${n}%`);});const analysis=analyzeFrames(frames,{aspect:$('#video').videoWidth/$('#video').videoHeight,side:$('#side').value,camera:$('#camera').value});current={id:crypto.randomUUID(),name:$('#name').value.trim()||'RDL',kind:$('#kind').value,createdAt:Date.now(),blob,frames,analysis,note:''};renderResult();updateOverlay();message('分析完了。レップ候補を映像で確認して保存してください。');}finally{setBusy(false);controller=null;}
});
$('#cancel').onclick=()=>controller?.abort();
$('#save').onclick=()=>run(async()=>{if(!current)return;$('#save').disabled=true;try{current.name=$('#name').value.trim()||'RDL';current.kind=$('#kind').value;await saveSession(current);await refresh();message('この端末に保存しました。');}finally{$('#save').disabled=false;}});
function tab(id){if(busy){message('分析を中止または完了してから画面を切り替えてください。');return;}$('#video').pause();voice.cancel();for(const name of ['practice','reference','history'])$('#'+name).hidden=name!==id;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===id)));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
async function refresh(){sessions=(await listSessions()).sort((a,b)=>b.createdAt-a.createdAt);for(const [id,kind]of [['references','reference'],['records','session']]){
  const box=$('#'+id),rows=sessions.filter(s=>s.kind===kind);box.innerHTML=rows.length?rows.map(s=>`<article class="record"><h3>${escape(s.name)}</h3><p>${new Date(s.createdAt).toLocaleString('ja-JP')} · ${s.repCount}レップ候補</p><div class="actions"><button data-open="${s.id}">レビューする</button><button data-export="${s.id}">動画を書き出す</button><button data-delete="${s.id}">削除</button></div></article>`).join(''):'<p class="empty">まだ記録がありません。</p>';
  box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>run(async()=>{
    if(busy)return;
    const row=await getSession(b.dataset.open);
    if(!row)throw new Error('記録が見つかりません。履歴を更新してください。');
    current=row;referenceId=current.referenceSnapshot?'snapshot':'';replaceVideo(current.blob);
    $('#camera').value=current.analysis.camera;$('#side').value=current.analysis.side;
    $('#name').value=current.name;$('#kind').value=current.kind;$('#save').disabled=false;
    renderResult();updateConditions();tab('practice');
  }));
  box.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>run(async()=>{
    const row=await getSession(b.dataset.export);
    if(!row)throw new Error('記録が見つかりません。');
    const link=document.createElement('a'),u=URL.createObjectURL(row.blob);link.href=u;
    link.download=row.name+(row.blob.type.includes('webm')?'.webm':'.mp4');link.click();setTimeout(()=>URL.revokeObjectURL(u),30000);
  }));
  box.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>run(async()=>{if(!confirm('このStrength Form Labの記録を削除しますか？'))return;await deleteSession(b.dataset.delete);if(referenceId===b.dataset.delete)referenceId='';await refresh();message('選択した記録を削除しました。');}));
}}
document.addEventListener('visibilitychange',()=>{if(document.hidden){controller?.abort();$('#video').pause();voice.cancel();}});
window.addEventListener('pagehide',event=>{controller?.abort();$('#video').pause();voice.cancel();if(!event.persisted && url){URL.revokeObjectURL(url);url=null;}});
run(refresh);
