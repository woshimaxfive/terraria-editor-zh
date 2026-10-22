import React, { useEffect, useRef, useState } from 'react';
import metadata from '../../vendor/tedit-objects/catalogue.json' with { type: 'json' };
import rules from '../../vendor/tedit-furniture/entity-rules.json' with { type: 'json' };

const names=['训练假人','物品框','逻辑感应器','人体模型','武器架','帽架','食物盘','晶塔','物品瓶','风筝锚点','小动物锚点'];
const poses=['站立','坐下','跳跃','行走','使用姿势 1','使用姿势 2','使用姿势 3','使用姿势 4','使用姿势 5'];
const items=metadata.items.map(([id,name,key,zh])=>({id,name,key,zh})),byId=new Map(items.map(item=>[item.id,item]));
const itemName=id=>byId.get(id)?.zh||byId.get(id)?.name||`未知 ID ${id}`;
const copy=value=>structuredClone(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function groups(type,version) {return type===5?{items:2,dyes:2}:type===3?{items:version>=308?9:8,dyes:version>=308?9:8,...(version>=308?{misc:1}:{})}:{};}

export default function TileEntityEditor({session,revision,disabled,onSave,onDraftChange,onFailure,onLocate}) {
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[baseline,setBaseline]=useState(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[slot,setSlot]=useState('items:0');
  const mounted=useRef(true),generation=useRef(0),selected=useRef(null);
  const dirty=Boolean(draft&&!equal(draft,baseline)),dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  useEffect(()=>{onDraftChange(dirty);},[dirty,onDraftChange]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;onDraftChange(false);};},[onDraftChange]);
  const failure=value=>{if(mounted.current){setError(value.message);if(!session.loaded) onFailure(value);}};
  function choose(record) {selected.current=record?.index??null;setBaseline(copy(record??null));setDraft(copy(record??null));setSlot('items:0');}
  async function load() {
    const token=++generation.current;setBusy(true);setError('');
    try {
      const {entities}=await session.readEntities();if(!mounted.current||token!==generation.current) return;
      setData(entities);choose(entities.records.find(record=>record.index===selected.current)??entities.records[0]);
    } catch(value) {failure(value);} finally {if(mounted.current&&token===generation.current) setBusy(false);}
  }
  useEffect(()=>{if(!dirtyRef.current) load();},[session,revision]);
  const locked=disabled||busy,version=data?.version??0,type=draft?.type,slotGroups=groups(type,version);
  const multi=Object.keys(slotGroups).length>0,[group,number]=slot.split(':'),slotIndex=Number(number);
  const current=multi?draft?.[group]?.[slotIndex]:draft?.item,displayItem=current?.stack>0||current?.id>0?current:null;
  const maxItem=metadata.versions.findLast(entry=>entry.version<=version)?.maxItemId??0;
  const found=query?items.filter(item=>item.id<=maxItem&&`${item.id} ${item.zh} ${item.name} ${item.key}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,30):[];
  function setItem(item) {
    setDraft(previous=>multi?{...previous,[group]:previous[group].map((value,index)=>index===slotIndex?copy(item):value)}:{...previous,item:copy(item)});
  }
  const changeItem=(field,value)=>setItem({...(displayItem??{id:0,stack:1,prefix:0}),[field]:value});
  const update=(field,value)=>setDraft(previous=>({...previous,[field]:value}));
  async function save(event) {
    event.preventDefault();if(locked||!dirty) return;
    const changes={};
    for(const field of ['npc','logicCheck','on','pose','itemId','item']) if(Object.hasOwn(draft,field)&&!equal(draft[field],baseline[field])) changes[field]=copy(draft[field]);
    const slots=Object.entries(slotGroups).flatMap(([group,size])=>Array.from({length:size},(_,slot)=>({group,slot,item:draft[group][slot]})).filter(entry=>!equal(entry.item,baseline[group][entry.slot])));
    if(slots.length) changes.slots=slots;
    setBusy(true);setError('');
    try {const result=await onSave('editEntity',{index:draft.index,revision:data.revision,changes});if(result&&mounted.current) await load();}
    catch(value) {failure(value);} finally {if(mounted.current) setBusy(false);}
  }
  return <div className="object-editor entity-editor" onKeyDown={event=>{if(event.key==='Escape'&&dirty&&!locked){event.stopPropagation();setDraft(copy(baseline));setError('');}}}>
    <h3>图格实体内容</h3>
    {error&&<p role="alert">{error}</p>}
    <label>已有图格实体<select aria-label="已有图格实体" value={draft?.index??''} disabled={locked||dirty} onChange={event=>choose(data.records.find(record=>record.index===Number(event.target.value)))}>
      {!draft&&<option value="">{busy?'正在读取…':'世界中没有图格实体'}</option>}
      {data?.records.map(record=><option key={record.index} value={record.index}>#{record.index+1} · {names[record.type]??'未知实体'} · ID {record.id} · {record.position.x},{record.position.y}</option>)}
    </select></label>
    {draft&&<form onSubmit={save} noValidate>
      <div className="object-location"><output aria-label="实体位置">X {draft.position.x} · Y {draft.position.y}</output><button type="button" disabled={locked} onClick={()=>onLocate(draft.position)}>定位图格实体</button></div>
      <fieldset disabled={locked}><legend>{names[type]}</legend>
        {type===0&&<label>关联 NPC 编号<input aria-label="假人 NPC 编号" type="number" min="-1" max="32767" value={Number.isFinite(draft.npc)?draft.npc:''} onChange={event=>update('npc',event.target.valueAsNumber)} /></label>}
        {type===2&&<><label>检测类型<input aria-label="实体检测类型" type="number" min="0" max="255" value={Number.isFinite(draft.logicCheck)?draft.logicCheck:''} onChange={event=>update('logicCheck',event.target.valueAsNumber)} /></label><label className="world-property-toggle"><input aria-label="实体触发状态" type="checkbox" checked={draft.on} onChange={event=>update('on',event.target.checked)} /><span>触发状态</span></label></>}
        {type===3&&version>=307&&<label>人体模型姿势<select aria-label="人体模型姿势" value={draft.pose??0} onChange={event=>update('pose',Number(event.target.value))}>
          {!rules.poses.includes(draft.pose??0)&&<option value={draft.pose}>{draft.pose}（原值保留）</option>}{rules.poses.map(value=><option key={value} value={value}>{value} · {poses[value]}</option>)}
        </select></label>}
        {[9,10].includes(type)&&<label>锚定物品<select aria-label="锚定物品" value={draft.itemId} onChange={event=>update('itemId',Number(event.target.value))}>
          {!(type===9?rules.kites:rules.critters).includes(draft.itemId)&&<option value={draft.itemId}>{draft.itemId}（原值保留）</option>}
          {(type===9?rules.kites:rules.critters).map(id=><option key={id} value={id}>{id} · {itemName(id)}</option>)}
        </select></label>}
        {type===7&&<p className="object-caption">晶塔没有额外内容字段，可用上方家具工具更换样式或删除。</p>}
        {(multi||[1,4,6,8].includes(type))&&<>
          {multi&&<label>实体物品格<select aria-label="实体物品格" value={slot} onChange={event=>setSlot(event.target.value)}>
            {Object.entries(slotGroups).flatMap(([group,size])=>Array.from({length:size},(_,index)=><option key={group+index} value={group+':'+index}>{group==='items'?'装备':group==='dyes'?'染料':'手持'} {index+1} · {draft[group][index]?itemName(draft[group][index].id):'空格'}</option>))}
          </select></label>}
          <p className="object-caption">{displayItem?itemName(displayItem.id):'当前为空格'}</p>
          <label>物品 ID<input aria-label="实体物品 ID" type="number" min="1" max={maxItem} value={displayItem?.id??''} onChange={event=>changeItem('id',event.target.valueAsNumber)} /></label>
          <label>物品数量<input aria-label="实体物品数量" type="number" min="1" max="32767" value={displayItem?.stack??''} onChange={event=>changeItem('stack',event.target.valueAsNumber)} /></label>
          <label>物品前缀<select aria-label="实体物品前缀" value={displayItem?.prefix??0} onChange={event=>changeItem('prefix',Number(event.target.value))}>
            {displayItem&&!metadata.prefixes.some(prefix=>prefix.id===displayItem.prefix)&&<option value={displayItem.prefix}>{displayItem.prefix}（原值保留）</option>}
            {metadata.prefixes.filter(prefix=>prefix.id<=84||version>=315).map(prefix=><option key={prefix.id} value={prefix.id}>{prefix.id} · {prefix.zh||prefix.name.trim()||'无前缀'}</option>)}
          </select></label>
          <button type="button" disabled={!displayItem} onClick={()=>setItem(null)}>清空实体物品格</button>
          <label>查找实体物品<input aria-label="查找实体物品" placeholder="中文、英文或 ID" value={query} onChange={event=>setQuery(event.target.value)} /></label>
          {query&&<div className="object-item-results" aria-label="实体物品搜索结果">{found.map(item=><button type="button" key={item.id} onClick={()=>{setItem({id:item.id,stack:1,prefix:0});setQuery('');}}>{item.id} · {item.zh||item.name}</button>)}</div>}
        </>}
      </fieldset>
      <div className="object-actions"><button disabled={locked||!dirty} type="submit">保存实体内容</button><button disabled={locked||!dirty} type="button" onClick={()=>{setDraft(copy(baseline));setError('');}}>取消实体草稿</button></div>
      <output aria-label="实体草稿状态">{dirty?'实体草稿尚未保存。':'当前实体没有未保存草稿。'}</output>
    </form>}
  </div>;
}
