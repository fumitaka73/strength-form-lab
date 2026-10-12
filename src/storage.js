export const DB_NAME='strength-form-lab';
let pending;
function database() {
  return pending??=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'id'});
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();pending=null;};resolve(request.result);};
    request.onerror=()=>{pending=null;reject(request.error);};
    request.onblocked=()=>{pending=null;reject(new Error('別のタブを閉じて再試行してください。'));};
  });
}
async function transact(mode,action) {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction('sessions',mode),r=action(tx.objectStore('sessions'));tx.oncomplete=()=>resolve(r.result);tx.onabort=tx.onerror=()=>reject(tx.error??new Error('保存に失敗しました。容量を確認してください。'));});
}
export const saveSession=row=>transact('readwrite',s=>s.put(row));
export const listSessions=()=>transact('readonly',s=>s.getAll());
export const deleteSession=id=>transact('readwrite',s=>s.delete(id));
