export function parseWeight(value){
  if(value===null||value===undefined||(typeof value==='string'&&!value.trim()))return null;
  if(!['string','number'].includes(typeof value))throw new Error('重量は0以上の数値で入力してください。');
  const weight=Number(value);
  if(!Number.isFinite(weight)||weight<0)throw new Error('重量は0以上の数値で入力してください。');
  return weight;
}
export const weightLabel=value=>Number.isFinite(value)&&value>=0?`${value} kg`:'重量未入力';
