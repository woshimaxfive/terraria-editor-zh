import React, { useEffect, useMemo, useState } from 'react';
import metadata from '../../vendor/tedit-objects/catalogue.json' with { type: 'json' };
import equipment from '../../vendor/tedit-furniture/legacy-equipment.json' with { type: 'json' };

const copy=value=>structuredClone(value),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const names=new Map(metadata.items.map(([id,name,,zh])=>[id,zh||name]));
const fields={head:'头部',body:'身体',legs:'腿部'};
export default function LegacyEquipmentEditor({target,disabled,selection,onSave,onDraftChange,onFailure}) {
  const [draft,setDraft]=useState(()=>copy(target.furniture.legacy)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
  const original=target.furniture.legacy,dirty=!equal(draft,original),rack=target.furniture.tileId===334;
  useEffect(()=>{onDraftChange(dirty);},[dirty,onDraftChange]);
  useEffect(()=>()=>onDraftChange(false),[onDraftChange]);
  const maxItem=metadata.versions.findLast(entry=>entry.version<=target.version)?.maxItemId??0;
  const rackItems=useMemo(()=>equipment.rackable.filter(id=>id<=Math.min(4899,maxItem)),[maxItem]);
  const found=query.trim()?rackItems.filter(id=>`${id} ${names.get(id)}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,30):[];
  const locked=disabled||busy;
  function cancel(){setDraft(copy(original));setError('');}
  async function save(event) {
    event.preventDefault();if(locked||!dirty)return;
    const changes=Object.fromEntries(Object.keys(draft).filter(field=>!equal(draft[field],original[field])).map(field=>[field,copy(draft[field])]));
    setBusy(true);setError('');
    try {await onSave('editFurniture',{action:'content',revision:target.revision,x:target.furniture.x,y:target.furniture.y,changes,selection});}
    catch(value){setError(value.message);onFailure(value);}
    finally{setBusy(false);}
  }
  function changeItem(field,value){setDraft(previous=>({item:{...(previous.item??{id:0,prefix:0}),[field]:value}}));}
  return <form className="object-editor legacy-equipment-editor" noValidate onSubmit={save} onKeyDown={event=>{if(event.key==='Escape'&&dirty&&!locked){event.stopPropagation();cancel();}}}>
    <h3>旧式装备内容</h3>
    <p className="object-caption">X {target.furniture.x} · Y {target.furniture.y} · {rack?'武器架':'人体模型'}</p>
    {error&&<p role="alert">{error}</p>}
    <fieldset disabled={locked}><legend>{rack?'展示物品':'展示装备'}</legend>
      {!rack&&Object.entries(fields).map(([field,label])=>{
        const options=equipment.armor[field].filter(([id])=>id<=maxItem);
        return <label key={field}>{label}<select aria-label={'旧式'+label+'装备'} value={draft[field]} onChange={event=>setDraft(previous=>({...previous,[field]:Number(event.target.value)}))}>
          <option value="0">空格</option>
          {draft[field]!==0&&!options.some(([,index])=>index===draft[field])&&<option value={draft[field]}>纹理编号 {draft[field]}（原值保留）</option>}
          {options.map(([id,index])=><option key={id} value={index}>{id} · {names.get(id)??'未知物品'}</option>)}
        </select></label>;
      })}
      {rack&&<>
        <p className="object-caption">{draft.item?`${draft.item.id} · ${names.get(draft.item.id)??'未知物品'}`:'当前为空格'}</p>
        <label>物品 ID<input aria-label="旧式武器物品 ID" type="number" min="1" max={Math.min(4899,maxItem)} value={Number.isFinite(draft.item?.id)?draft.item.id:''} onChange={event=>changeItem('id',event.target.valueAsNumber)} /></label>
        <label>物品前缀<select aria-label="旧式武器前缀" value={draft.item?.prefix??0} onChange={event=>changeItem('prefix',Number(event.target.value))}>
          {draft.item&&!metadata.prefixes.some(prefix=>prefix.id===draft.item.prefix)&&<option value={draft.item.prefix}>{draft.item.prefix}（原值保留）</option>}
          {metadata.prefixes.filter(prefix=>prefix.id<=84||target.version>=315).map(prefix=><option key={prefix.id} value={prefix.id}>{prefix.id} · {prefix.zh||prefix.name.trim()||'无前缀'}</option>)}
        </select></label>
        <button type="button" disabled={!draft.item} onClick={()=>setDraft({item:null})}>清空旧式武器</button>
        <label>查找可展示物品<input aria-label="查找旧式武器" value={query} onChange={event=>setQuery(event.target.value)} placeholder="中文或物品 ID" /></label>
        {query&&<div className="object-item-results" aria-label="旧式武器搜索结果">{found.map(id=><button type="button" key={id} onClick={()=>{setDraft({item:{id,prefix:0}});setQuery('');}}>{id} · {names.get(id)}</button>)}</div>}
      </>}
    </fieldset>
    <div className="object-actions"><button type="submit" disabled={locked||!dirty}>保存旧式装备</button><button type="button" disabled={locked||!dirty} onClick={cancel}>取消旧式装备草稿</button></div>
    <output aria-label="旧式装备草稿状态">{dirty?'旧式装备草稿尚未保存。':'当前旧式装备没有未保存草稿。'}</output>
    <p className="card-note">内容随图格保存；同位置换方向保留装备，确认保存后可整步撤销。</p>
  </form>;
}
