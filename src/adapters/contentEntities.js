// Adapter DTOs contain only the fields actually consumed by desktop rendering.
// No vendor world objects or mutable slot arrays cross the Worker boundary.
export function contentEntity(record) {
  const {x,y}=record.position??{};
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))return null;
  const slot=entry=>entry?{id:entry.id,stack:entry.stack}:null;
  return {type:record.type,x,y,item:record.item?.id??record.itemId??0,pose:record.pose??0,
    ...([3,5].includes(record.type)?{items:record.items?.slice(0,record.type===3?3:2).map(slot),misc:record.misc?.slice(0,1).map(slot)}:{})};
}

export function contentEntityIndex(records) {
  const list=records.map(contentEntity).filter(Boolean),byPosition=new Map();
  for(const record of list){const key=`${record.x},${record.y}`;if(!byPosition.has(key))byPosition.set(key,record);}
  return {at:(x,y)=>byPosition.get(`${x},${y}`)??null,
    within:(region,padding)=>list.filter(e=>e.x>=region.x-padding && e.x<region.x+region.width+padding &&
      e.y>=region.y-padding && e.y<region.y+region.height+padding)};
}
