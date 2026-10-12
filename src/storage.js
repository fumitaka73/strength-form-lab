export const DB_NAME='strength-form-lab';
export const DB_VERSION=2;
let pending;
// Only the first completed rep is used as a comparison baseline. No Pose or rows.
export function referenceSnapshot(row) {
  const a=row.analysis;
  return {id:row.id,name:row.name,analysis:{version:a.version,exercise:a.exercise,camera:a.camera,side:a.side,coverage:a.coverage,reps:a.reps.slice(0,1).map(r=>({hipMin:r.hipMin,kneeMin:r.kneeMin,leanMax:r.leanMax,rom:r.rom}))}};
}
export function sessionSummary(row) {
  return {...referenceSnapshot(row),kind:row.kind,createdAt:row.createdAt,repCount:row.analysis.reps.length};
}
function database() {
  return pending??=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'id'});
      if(!db.objectStoreNames.contains('summaries')){
        const summaries=db.createObjectStore('summaries',{keyPath:'id'});
        // Upgrade existing records one at a time; do not materialize all video/Pose data.
        const cursor=request.transaction.objectStore('sessions').openCursor();
        cursor.onsuccess=()=>{const entry=cursor.result;if(entry){summaries.put(sessionSummary(entry.value));entry.continue();}};
      }
    };
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();pending=null;};resolve(request.result);};
    request.onerror=()=>{pending=null;reject(request.error);};
    request.onblocked=()=>{pending=null;reject(new Error('別のタブを閉じて再試行してください。'));};
  });
}
async function transact(stores,mode,action) {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode),r=action(tx);tx.oncomplete=()=>resolve(r?.result);tx.onabort=tx.onerror=()=>reject(tx.error??new Error('保存に失敗しました。容量を確認してください。'));});
}
export const saveSession=row=>{
  const saved={...row,referenceSnapshot:row.referenceSnapshot?referenceSnapshot(row.referenceSnapshot):null};
  return transact(['sessions','summaries'],'readwrite',tx=>{tx.objectStore('summaries').put(sessionSummary(saved));return tx.objectStore('sessions').put(saved);});
};
export const listSessions=()=>transact(['summaries'],'readonly',tx=>tx.objectStore('summaries').getAll());
export const getSession=async id=>{
  const row=await transact(['sessions'],'readonly',tx=>tx.objectStore('sessions').get(id));
  if(row?.referenceSnapshot)row.referenceSnapshot=referenceSnapshot(row.referenceSnapshot);
  return row;
};
export const deleteSession=id=>transact(['sessions','summaries'],'readwrite',tx=>{tx.objectStore('summaries').delete(id);return tx.objectStore('sessions').delete(id);});
