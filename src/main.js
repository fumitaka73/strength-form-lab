import {buildFeedback} from './rdl-feedback.js';
import {renderFeedback} from './feedback-ui.js';
import {mountWorkouts} from './workout-ui.js';
import './style.css';
import {version as APP_VERSION} from '../package.json';
import {analyzeFrames,compareRep} from './rdl.js';
import {drawPose} from './pose-coordinates.js';
import {scanVideo,seekVideo} from './video.js';
import {saveSession,listSessions,getSession,deleteSession,referenceSnapshot} from './storage.js';
import {CoachVoice} from './coach-voice.js';
import {parseWeight,weightLabel} from './session-weight.js';
import {estimateHinge} from './hinge-estimate.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={hipMin:'股関節の最小角度',kneeMin:'膝の最小角度',leanMax:'体幹の最大傾き',rom:'股関節の可動域'};
let sessions=[],current=null,blob=null,url=null,controller=null,busy=false,referenceId='',playEnd=null,feedbackPreview=null;
const voice=new CoachVoice({onError:message});
$('#app').innerHTML=`<header class="app-header"><div><span class="app-kicker">TRAINING · RDL</span><h1>Strength Form Lab</h1></div><span class="app-version" aria-label="アプリのバージョン">v${APP_VERSION}</span></header><nav class="tab-bar" aria-label="メイン"><button data-tab="practice" aria-pressed="true"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16v13H4zM8 7l2-3h4l2 3"/><circle cx="12" cy="13" r="3"/></svg><span>分析</span></button><button data-tab="reference" aria-pressed="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Good Form</span></button><button data-tab="history" aria-pressed="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6H1V3M2 6a9 9 0 1 1 0 12M12 7v5l3 2"/></svg><span>履歴</span></button></nav><main><p id="status" role="status" aria-live="polite"></p><section id="practice"><div class="page-heading"><span class="eyebrow">TRAINING REVIEW</span><h2>RDLの動きを確認</h2><p>動画を読み込み、動作ごとに振り返る。</p></div><div class="card"><div class="section-title"><span class="number">01</span><h2>動画を読み込む</h2><span class="badge">RDL · BETA</span></div><p>真横から、肩・股関節・膝・足首が入る固定映像を撮影。2分・100MB以内、1人で行ってください。</p><div class="actions"><label class="button primary">動画を選ぶ<input id="file" type="file" accept="video/*"></label><label class="button">iPhoneで撮影<input id="capture" type="file" accept="video/*" capture="environment"></label></div><label class="weight-field">重量（kg・バーを含む合計）<input id="weight" type="number" min="0" step="any" inputmode="decimal" placeholder="例：40"></label><details class="capture-settings"><summary>撮影・解析設定</summary><div class="fields"><label>撮影角度<select id="camera"><option value="side">真横</option><option value="diagonal">斜め</option><option value="front">正面</option></select></label><label>カメラ側の体<select id="side"><option value="left">左側</option><option value="right">右側</option></select></label><label>解析モデル<select id="model"><option value="full">Full（詳細モデル・処理は長め）</option><option value="lite">Lite（軽量）</option></select></label><label>登録方法<select id="kind"><option value="session">練習セッション</option><option value="reference">Good Form</option></select></label><label>記録名<input id="name" maxlength="80" placeholder="例：朝のRDL・軽め"></label></div></details><button id="reconfigure" hidden>撮影条件を変更して再分析</button><p class="hint">重り・セーフティバーで足首が隠れても、肩・股関節・膝が見える区間でヒンジ候補を探します。股関節や膝も隠れる場合は検出を保留します。</p><p class="hint">スクワット・ベンチプレスは今後対応予定です。</p></div><div class="card" id="review-card" hidden><div class="player"><video id="video" controls playsinline preload="metadata"></video><canvas id="overlay" aria-hidden="true"></canvas></div><label class="timeline-label">再生位置 <output id="time">0.0秒</output><input id="timeline" type="range" min="0" max="1" step="0.01" value="0" aria-label="動画タイムライン"></label><div class="actions"><label>速度<select id="speed"><option value="1">1倍</option><option value="0.5">0.5倍</option><option value="0.25">0.25倍</option></select></label><button id="analyze" class="primary" disabled>RDLを分析</button><button id="cancel" hidden>中止</button><button id="save" disabled>端末に保存</button></div><progress id="progress" max="100" value="0" hidden></progress><div id="result"></div></div></section><section id="reference" hidden><h2>自分のGood Form</h2><p>指導者と確認した動画を「登録方法：Good Form」で分析・保存してください。基準は同じ横向き・同じ体の側で比較します。</p><div id="references"></div></section><section id="history" hidden><h2>トレーニング記録</h2><div id="workouts"></div><h3>保存済み動画</h3><p>動画とPoseはこのブラウザ内だけに保存。Safariのデータ消去や容量整理で失われる場合があります。</p><div id="records"></div></section><aside><details class="reading-guide"><summary>数値の読み方・計測の限界</summary><p>MediaPipeによる2D姿勢推定です。レップ候補・角度・体幹の傾きは撮影条件で変わります。体幹傾斜は背骨の形状ではありません。腰背部と重量の適否は別の評価が必要です。</p><p>外部AIへの送信はありません。MVPのフィードバックは計測ルールに基づく参考情報です。</p></details></aside></main>`;
const workouts=mountWorkouts($('#workouts'),{message});
function message(text){$('#status').textContent=text;}
function readWeight(){const input=$('#weight');if(!input.checkValidity())throw new Error('重量は0以上の数値で入力してください。');return parseWeight(input.value);}
$('#weight').onchange=()=>run(()=>{if(current){current.weightKg=readWeight();renderResult();}});
function renderHinge(interval){const e=estimateHinge(current.analysis.rows??[],interval);const format=v=>Number.isFinite(v)?'約'+v.toFixed(0)+'°':'保留';return `<div class="hinge-estimate"><h4>ヒンジの参考値 <small>2D推定・部分データ</small></h4><div class="metrics"><div><span>股関節角度の変化幅</span><strong>${format(e.hipRange)}</strong><small>区間の${Math.round(e.hipCoverage*100)}%で計測</small></div><div><span>体幹傾斜の変化幅</span><strong>${format(e.leanRange)}</strong><small>区間の${Math.round(e.leanCoverage*100)}%で計測</small></div></div><p class="hint">取得できた角度の範囲です。良いフォームの点数や背骨の曲がりではありません。</p></div>`;}
function setBusy(value){busy=value;for(const id of ['file','capture','camera','side','model','kind','name','weight','speed','timeline'])$('#'+id).disabled=value;$('#video').controls=!value;$('#analyze').disabled=value||!blob;$('#save').disabled=value||!current;updateConditions();$('#cancel').hidden=!value;$('#progress').hidden=!value;}
function updateConditions(){
  // A saved analysis belongs to its original capture settings. Re-analysis unlocks them.
  for(const id of ['camera','side','model'])$('#'+id).disabled=busy||!!current;
  $('#reconfigure').hidden=!current;
  $('#reconfigure').disabled=busy;
}
$('#reconfigure').onclick=()=>{
  if(busy)return;current=null;referenceId='auto';feedbackPreview=null;$('#save').disabled=true;renderResult();updateConditions();updateOverlay();
  message('撮影条件を変更してから再分析してください。元の保存済み記録は保持しています。');
};
function feedbackReference(){
  const row=referenceId==='snapshot'?current?.referenceSnapshot:sessions.find(s=>s.id===referenceId);
  return row??null;
}
function generateFeedback(){
  const ref=feedbackReference();
  feedbackPreview=buildFeedback(current.analysis,ref?.analysis??null,{referenceId:ref?.id,referenceName:ref?.name});
  renderResult();
}
function renderResult(){
  const target=$('#result');if(!current){target.replaceChildren();return;}
  if(referenceId==='auto')referenceId=sessions.find(s=>s.kind==='reference')?.id??'';
  const a=current.analysis,playbackReps=[...a.reps,...(a.motionCandidates??[])],ref=referenceId==='snapshot'?current.referenceSnapshot:sessions.find(s=>s.id===referenceId);
  target.innerHTML=`<div class="section-title"><span class="number">02</span><h2>${a.reps.length?a.reps.length+' レップ候補':a.motionCandidates?.length?a.motionCandidates.length+' 往復候補':'0 レップ候補'}</h2></div><p class="result-weight">${weightLabel(current.weightKg)}</p><p class="result-state">${a.reps.length?'角度から検出した候補を映像で確認してください。':a.motionCandidates?.length?'体幹の動きは検出。角度によるフォーム評価は保留です。':'候補を検出できませんでした。'}</p><p class="hint">角度によるレップ候補：${a.reps.length}件 · 計測可能フレーム ${Math.round(a.coverage*100)}%</p>${a.metricCoverage?`<p>股関節 ${Math.round(a.metricCoverage.hip*100)}% / 膝 ${Math.round(a.metricCoverage.knee*100)}% / 体幹 ${Math.round(a.metricCoverage.lean*100)}% のフレームで計測できました。</p>`:''}<label>比較するGood Form<select id="compare"><option value="">一般的なRDLの確認ポイント</option>${current.referenceSnapshot?`<option value="snapshot" ${referenceId==='snapshot'?'selected':''}>保存時の基準：${escape(current.referenceSnapshot.name)}</option>`:''}${sessions.filter(s=>s.kind==='reference').map(s=>`<option value="${s.id}" ${s.id===referenceId?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label><details class="analysis-details"><summary>計測の詳細と限界</summary>${a.warnings.map(w=>`<p class="hint">${escape(w)}</p>`).join('')}<p class="hint">股関節角度は区間の半分以上、体幹傾斜は8割以上かつ4点以上取得できた場合に参考幅を表示します。欠測は埋めません。</p></details><p class="back-status">背中の丸まり・腰の反り：未評価。体幹の傾きだけでは区別できません。</p>${renderFeedback(feedbackPreview)}${ref && !compareRep(a.reps[0]??{},ref.analysis,a)?'<p class="hint">同じ撮影条件・十分な検出率・完成したレップが必要なため、比較できません。</p>':''}${a.reps.map(r=>{const diff=compareRep(r,ref?.analysis,a);return `<article class="rep"><h3>レップ ${r.id} <small>${r.start.toFixed(1)}–${r.end.toFixed(1)}秒</small></h3><div class="metrics">${Object.entries(labels).map(([k,l])=>`<div><span>${l}</span><strong>${Number.isFinite(r[k])?r[k].toFixed(0)+'°':'計測不可'}</strong>${diff?.some(d=>d.key===k)?`<small>基準との差 ${diff.find(d=>d.key===k).delta.toFixed(0)}°</small>`:''}</div>`).join('')}</div><p>${r.assessment}</p><div class="actions"><button data-rep="${r.id}">このレップを再生</button><button data-bottom="${r.id}">最下点を見る</button></div></article>`;}).join('')}${a.motionCandidates?.length?`<h3>体幹の往復候補 ${a.motionCandidates.length}区間（フォーム判定保留）</h3><p>股関節角度で確定したレップとは別の確認用候補です。各区間を映像で確認してください。</p>${a.motionCandidates.map((r,i)=>`<article class="rep"><h3>確認用候補 ${i+1} <small>${r.start.toFixed(1)}–${r.end.toFixed(1)}秒</small></h3>${renderHinge(r)}<div class="actions"><button data-rep="${r.id}">候補区間を再生</button><button data-bottom="${r.id}">最大前傾点を見る</button></div></article>`).join('')}`:''}${!a.reps.length?'<p>股関節角度によるレップ確定は保留です。体幹候補がある場合は候補区間を映像で確認してください。動画とメモは保存できます。</p>':''}<button id="speak">結果を読み上げる</button><label>レビュー・メモ<textarea id="note" maxlength="2000" placeholder="実際の本数、気づいたこと">${escape(current.note??'')}</textarea></label>`;
  $('#compare').onchange=e=>{referenceId=e.target.value;const selected=sessions.find(s=>s.id===referenceId);if(selected&&!current.referenceSnapshot)current.referenceSnapshot=referenceSnapshot(selected);generateFeedback();};
  $('#generate-feedback').onclick=()=>run(generateFeedback);
  $('#note').oninput=e=>current.note=e.target.value;
  $('#speak').onclick=()=>voice.say(`${a.reps.length}レップ候補です。${a.motionCandidates?.length?'別に体幹の往復候補が'+a.motionCandidates.length+'区間あります。映像で確認してください。':''}${a.coverage<.8?'関節の欠測が多いため本数を確認してください。':'動画と角度を見比べてください。'}背骨の姿勢や重量の適否は判定できません。`);
  target.querySelectorAll('[data-rep]').forEach(b=>b.onclick=()=>run(async()=>{const r=playbackReps.find(r=>r.id===Number(b.dataset.rep));await seekVideo($('#video'),r.start);playEnd=r.end;await $('#video').play();}));
  target.querySelectorAll('[data-bottom]').forEach(b=>b.onclick=()=>run(async()=>{$('#video').pause();playEnd=null;await seekVideo($('#video'),playbackReps.find(r=>r.id===Number(b.dataset.bottom)).bottom);}));
}
async function run(fn){try{await fn();}catch(e){message(e.message);}}
function replaceVideo(value){$('#review-card').hidden=false;if(url)URL.revokeObjectURL(url);blob=value;url=URL.createObjectURL(value);$('#video').src=url;playEnd=null;$('#overlay').getContext('2d').clearRect(0,0,$('#overlay').width,$('#overlay').height);}
async function loadFile(file){if(!file)return;if(file.size>100*1024*1024)throw new Error('100MB以内の動画を選んでください。');current=null;referenceId='auto';feedbackPreview=null;replaceVideo(file);$('#name').value=file.name;$('#save').disabled=true;$('#analyze').disabled=true;renderResult();updateConditions();message('動画を読み込み中…');}
for(const id of ['file','capture'])$('#'+id).onchange=e=>run(()=>loadFile(e.target.files[0]));
$('#video').onloadedmetadata=()=>{$('#timeline').max=$('#video').duration||1;$('#analyze').disabled=busy||!blob;message('動画を確認し、撮影角度と体の側を選んでください。');};
$('#video').onerror=()=>message('この動画形式を再生できません。H.264のMP4をお試しください。');
$('#speed').onchange=e=>$('#video').playbackRate=Number(e.target.value);
$('#timeline').oninput=e=>{playEnd=null;$('#video').currentTime=Number(e.target.value);};
function updateOverlay(){const video=$('#video'),frames=current?.frames;$('#time').textContent=video.currentTime.toFixed(1)+'秒';$('#timeline').value=video.currentTime;if(playEnd!==null && video.currentTime>=playEnd){video.pause();playEnd=null;}const f=frames?.[Math.round(video.currentTime*12)];drawPose($('#overlay'),video,f && Math.abs(f.time-video.currentTime)<.15?f.landmarks:null);}
$('#video').ontimeupdate=updateOverlay;$('#video').onseeked=updateOverlay;
new ResizeObserver(updateOverlay).observe($('#video'));
$('#analyze').onclick=()=>run(async()=>{
  const weightKg=readWeight();controller=new AbortController();setBusy(true);current=null;referenceId='auto';feedbackPreview=null;renderResult();voice.cancel();message('姿勢モデルを準備しています…');
  try{const frames=await scanVideo($('#video'),controller.signal,n=>{$('#progress').value=n;message(`端末で分析中 ${n}%`);},{model:$('#model').value});const analysis=analyzeFrames(frames,{aspect:$('#video').videoWidth/$('#video').videoHeight,side:$('#side').value,camera:$('#camera').value,model:$('#model').value});current={id:crypto.randomUUID(),name:$('#name').value.trim()||'RDL',kind:$('#kind').value,createdAt:Date.now(),weightKg,blob,frames,analysis,note:''};renderResult();generateFeedback();updateOverlay();message('分析完了。レップ候補を映像で確認して保存してください。');}finally{setBusy(false);controller=null;}
});
$('#cancel').onclick=()=>controller?.abort();
$('#save').onclick=()=>run(async()=>{if(!current)return;$('#save').disabled=true;try{current.name=$('#name').value.trim()||'RDL';current.kind=$('#kind').value;current.weightKg=readWeight();if(feedbackPreview&&current.feedbackReports?.at(-1)!==feedbackPreview)current.feedbackReports=[...(current.feedbackReports??[]),feedbackPreview];await saveSession(current);await refresh();message('この端末に保存しました。');}finally{$('#save').disabled=false;}});
function tab(id){if(busy){message('分析を中止または完了してから画面を切り替えてください。');return;}$('#video').pause();voice.cancel();for(const name of ['practice','reference','history'])$('#'+name).hidden=name!==id;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===id)));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
async function refresh(){sessions=(await listSessions()).sort((a,b)=>b.createdAt-a.createdAt);workouts.updateSources(sessions);for(const [id,kind]of [['references','reference'],['records','session']]){
  const box=$('#'+id),rows=sessions.filter(s=>s.kind===kind);box.innerHTML=rows.length?rows.map(s=>`<article class="record"><h3>${escape(s.name)}</h3><p>${new Date(s.createdAt).toLocaleString('ja-JP')} · ${weightLabel(s.weightKg)} · ${s.repCount?'角度から '+s.repCount+'レップ候補':s.motionCount?'体幹から '+s.motionCount+'往復候補 · 角度評価は保留':s.motionCount===undefined?'往復候補はレビューで確認':'候補なし'}</p><div class="actions"><button data-open="${s.id}">レビューする</button><button data-export="${s.id}">動画を書き出す</button><button data-delete="${s.id}">削除</button></div></article>`).join(''):'<p class="empty">まだ記録がありません。</p>';
  box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>run(async()=>{
    if(busy)return;
    const row=await getSession(b.dataset.open);
    if(!row)throw new Error('記録が見つかりません。履歴を更新してください。');
    current=row;feedbackPreview=current.feedbackReports?.at(-1)??null;referenceId=current.referenceSnapshot?'snapshot':'auto';replaceVideo(current.blob);
    $('#camera').value=current.analysis.camera;$('#side').value=current.analysis.side;$('#model').value=current.analysis.model??'lite';
    $('#weight').value=current.weightKg??'';$('#name').value=current.name;$('#kind').value=current.kind;$('#save').disabled=false;
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
