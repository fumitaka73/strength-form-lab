import {parseWeight} from './session-weight.js';
export const EXERCISES={rdl:'RDL',squat:'スクワット',bench:'ベンチプレス',other:'その他'};
export function localDate(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function validateDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('日付を入力してください。');
  const [y,m,d]=value.split('-').map(Number),date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0);
  if(y<1900||y>9999||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('有効な日付を入力してください。');return value;
}
export function integer(value,label,max=10000){
  if(!['string','number'].includes(typeof value))throw new Error(`${label}は数値で入力してください。`);
  if(String(value??'').trim()==='')throw new Error(`${label}は未入力です。`);
  const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error(`${label}は1〜${max}の整数で入力してください。`);return n;
}
export function validateSet(row){
  const date=validateDate(row.date),exercise=row.exercise;
  if(!Object.hasOwn(EXERCISES,exercise))throw new Error('種目を選んでください。');
  const customName=exercise==='other'?String(row.customName??'').trim().normalize('NFKC'):'';
  if(exercise==='other'&&(!customName||customName.length>80))throw new Error('その他の種目名を1〜80文字で入力してください。');
  const reps=integer(row.reps,'回数'),weightKg=parseWeight(row.weightKg);
  if(weightKg!==null&&!Number.isFinite(weightKg*reps))throw new Error('総負荷量を計算できる重量・回数を入力してください。');
  return {...row,date,exercise,customName,reps,weightKg};
}
export function exerciseKey(row){return row.exercise==='other'?`other:${row.customName}`:row.exercise;}
export function exerciseName(row){return row.exercise==='other'?row.customName:EXERCISES[row.exercise];}
export function aggregateSets(rows){
  const groups=new Map();
  for(const row of rows){const key=`${row.date}|${exerciseKey(row)}`;if(!groups.has(key))groups.set(key,{date:row.date,exerciseKey:exerciseKey(row),name:exerciseName(row),sets:0,reps:0,maxWeight:null,volume:0,unweighted:0});const g=groups.get(key);g.sets++;g.reps+=row.reps;if(row.weightKg===null){g.unweighted++;}else{g.maxWeight=Math.max(g.maxWeight??0,row.weightKg);g.volume+=row.weightKg*row.reps;}}
  return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ja'));
}
