import {listWorkoutSets,saveWorkoutSets,deleteWorkoutSet} from './storage.js';
import {localDate,integer,validateSet,aggregateSets,exerciseKey,exerciseName,EXERCISES} from './workouts.js';
import {weightLabel} from './session-weight.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountWorkouts(container,{message}){
  let rows=[],sources=[],editing=null,saving=false;
  const $=s=>container.querySelector(s);
  container.innerHTML=`<div class="card"><h3>動画なしでセットを記録</h3><p>同じ内容のセットをまとめて追加できます。重量・回数はセットごとに後から編集できます。</p><form id="workout-form" novalidate><div class="fields"><label class="date-field">日付<input id="workout-date" type="date" required></label><label>種目<select id="workout-exercise">${Object.entries(EXERCISES).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></label><label id="custom-field" hidden>その他の種目名<input id="workout-custom" maxlength="80"></label><label>重量 kg（空欄は未入力）<input id="workout-weight" type="number" min="0" step="any" inputmode="decimal"></label><label>回数<input id="workout-reps" type="number" min="1" step="1" inputmode="numeric" required></label><label>セット数<input id="workout-count" type="number" min="1" max="100" step="1" value="1" inputmode="numeric" required></label></div><details><summary>動画セッションを関連付ける（任意）</summary><label>保存済みの練習動画<select id="workout-source"><option value="">関連付けなし</option></select></label><p class="hint">関連付けは1動画につき1セットです。重量は引き継ぎますが、回数は映像を確認して入力してください。自動検出候補は集計しません。関連付けを解除しても元動画は保持します。</p></details><div class="actions"><button class="primary" id="workout-submit" type="submit">セットを追加</button><button id="workout-reset" type="button">入力をリセット</button></div></form></div><div class="card"><h3>ワークアウト履歴・推移</h3><div class="fields"><label class="date-field">日付で絞る（空欄は全日）<input id="workout-filter-date" type="date"></label><label>種目で絞る<select id="workout-filter-exercise"><option value="">全種目</option></select></label></div><div id="workout-totals" role="status"></div><p class="hint">最大重量・合計回数・総負荷量は記録の推移です。総負荷量＝重量×回数の合計で、トレーニング効果を保証しません。重量未入力のセットは負荷量から除外します。動画履歴は自動加算しません。</p><div class="table-scroll"><table><caption>日付・種目別の重量／回数推移</caption><thead><tr><th>日付・種目</th><th>最大重量</th><th>回数／セット</th><th>総負荷量</th></tr></thead><tbody id="workout-trends"></tbody></table></div><div id="workout-rows"></div></div>`;
  function reset(){editing=null;$('#workout-form').reset();$('#workout-date').value=localDate();$('#custom-field').hidden=true;$('#workout-count').disabled=false;$('#workout-submit').textContent='セットを追加';}
  function sourceOptions(){const select=$('#workout-source'),value=select.value;select.innerHTML='<option value="">関連付けなし</option>'+sources.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${esc(weightLabel(s.weightKg))}</option>`).join('');if(editing?.sourceSessionId&&!sources.some(s=>s.id===editing.sourceSessionId)){select.insertAdjacentHTML('beforeend',`<option value="${esc(editing.sourceSessionId)}">${esc(editing.sourceName)}（元動画なし）</option>`);}select.value=value;}
  function draw(){
    const filter=$('#workout-filter-exercise'),selected=filter.value,keys=new Map(rows.map(r=>[exerciseKey(r),exerciseName(r)]));filter.innerHTML='<option value="">全種目</option>'+[...keys].map(([k,n])=>`<option value="${esc(k)}">${esc(n)}</option>`).join('');filter.value=keys.has(selected)?selected:'';
    const visible=rows.filter(r=>(!$('#workout-filter-date').value||r.date===$('#workout-filter-date').value)&&(!filter.value||exerciseKey(r)===filter.value)).sort((a,b)=>b.date.localeCompare(a.date)||a.createdAt-b.createdAt);
    const groups=aggregateSets(visible),volume=groups.reduce((n,g)=>n+g.volume,0),reps=groups.reduce((n,g)=>n+g.reps,0);
    $('#workout-totals').textContent=`${visible.length}セット · ${reps}回 · 総負荷量 ${volume.toLocaleString('ja-JP')} kg（未入力除外）`;
    $('#workout-trends').innerHTML=groups.map(g=>`<tr><td>${g.date}<br>${esc(g.name)}</td><td>${g.maxWeight===null?'未入力':g.maxWeight+' kg'}</td><td>${g.reps}回／${g.sets}セット</td><td>${g.volume.toLocaleString('ja-JP')} kg${g.unweighted?`<br>未入力 ${g.unweighted}セット除外`:''}</td></tr>`).join('');
    $('#workout-rows').innerHTML=visible.length?visible.map(r=>`<article class="record" data-set="${esc(r.id)}"><h4>${r.date} · ${esc(exerciseName(r))}</h4><p>${weightLabel(r.weightKg)} × ${r.reps}回${r.sourceSessionId?` · 動画：${esc(r.sourceName)}`:''}</p><div class="actions"><button data-edit="${esc(r.id)}">セットを編集</button><button data-remove="${esc(r.id)}">セットを削除</button></div></article>`).join(''):'<p class="empty">まだセット記録がありません。</p>';
    container.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{if(saving)return;editing=rows.find(r=>r.id===b.dataset.edit);$('#workout-date').value=editing.date;$('#workout-exercise').value=editing.exercise;$('#workout-custom').value=editing.customName;$('#custom-field').hidden=editing.exercise!=='other';$('#workout-weight').value=editing.weightKg??'';$('#workout-reps').value=editing.reps;$('#workout-count').value=1;$('#workout-count').disabled=true;sourceOptions();$('#workout-source').value=editing.sourceSessionId??'';$('#workout-submit').textContent='セットを更新';$('#workout-form').scrollIntoView({block:'start'});});
    container.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>run(async()=>{if(saving||!confirm('このセット記録を削除しますか？元動画は削除しません。'))return;await deleteWorkoutSet(b.dataset.remove);if(editing?.id===b.dataset.remove)reset();await refresh();message('セット記録を削除しました。');}));
  }
  async function run(fn){try{await fn();}catch(error){message(error.message);}}
  async function refresh(){rows=await listWorkoutSets();draw();}
  $('#workout-exercise').onchange=()=>$('#custom-field').hidden=$('#workout-exercise').value!=='other';
  $('#workout-source').onchange=()=>{const source=sources.find(s=>s.id===$('#workout-source').value);if(source){$('#workout-weight').value=source.weightKg??'';$('#workout-date').value=localDate(new Date(source.createdAt));$('#workout-exercise').value='rdl';$('#custom-field').hidden=true;$('#workout-count').value=1;$('#workout-reps').value='';message('回数は動画を確認して入力してください。自動候補は計上しません。');}};
  $('#workout-form').onsubmit=event=>{event.preventDefault();void run(async()=>{
    if(saving)return;
    const count=integer($('#workout-count').value,'セット数',100),sourceId=$('#workout-source').value;
    if(sourceId&&count!==1)throw new Error('動画の関連付けは1セットずつ行ってください。');
    for(const id of ['workout-weight','workout-reps','workout-count'])if(!$('#'+id).checkValidity())throw new Error('重量は0以上、回数・セット数は正の整数で入力してください。');
    const row=validateSet({date:$('#workout-date').value,exercise:$('#workout-exercise').value,customName:$('#workout-custom').value,weightKg:$('#workout-weight').value,reps:$('#workout-reps').value});
    if(sourceId){row.sourceSessionId=sourceId;row.sourceName=sources.find(s=>s.id===sourceId)?.name??editing?.sourceName??'保存済み動画';}
    saving=true;$('#workout-submit').disabled=true;message('セット記録を保存中…');
    try{await saveWorkoutSets(Array.from({length:count},()=>({...row,id:editing?.id??crypto.randomUUID(),createdAt:editing?.createdAt??Date.now()})));reset();await refresh();message('セット記録を保存しました。');}finally{saving=false;$('#workout-submit').disabled=false;}
  });};
  $('#workout-reset').onclick=()=>{if(!saving)reset();};
  $('#workout-filter-date').onchange=draw;$('#workout-filter-exercise').onchange=draw;
  reset();void run(refresh);
  return {updateSources(value){sources=value.filter(s=>s.kind==='session');sourceOptions();}};
}
