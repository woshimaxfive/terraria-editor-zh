import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { furnitureFrames, furnitureType, searchFurniture } from '../editing/furniture.js';
import TileEntityEditor from './TileEntityEditor.jsx';
import LegacyEquipmentEditor from './LegacyEquipmentEditor.jsx';

const label = tile => `${tile.id} · ${tile.zh || tile.name}`;
const anchors={Top:'顶部',Bottom:'底部',Left:'左侧',Right:'右侧',None:'无'};
const styleLabel = (style,index) => `${index} · ${style.zh || (style.name==='Default'?'默认':style.name)}${style.variety ? ' · '+style.variety : ''}${style.anchor ? ' ['+(anchors[style.anchor]??style.anchor)+']' : ''}`;
export default function FurnitureEditor({ session, world, revision, disabled, point, reset, selection, onPreview, onMapPick, onLocate, onSave, onFailure, onDraftChange }) {
  const [query,setQuery]=useState(''),[tileId,setTileId]=useState(21),[style,setStyle]=useState(0),[mode,setMode]=useState('place');
  const [position,setPosition]=useState({...world.spawn}),[preview,setPreview]=useState(null),[payload,setPayload]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[acknowledged,setAcknowledged]=useState(false);
  const [entityDirty,setEntityDirty]=useState(false),[legacyDirty,setLegacyDirty]=useState(false),[legacyTarget,setLegacyTarget]=useState(null);
  const draftFlags=useRef({entity:false,legacy:false});
  const entityDraftChange=useCallback(value=>{draftFlags.current.entity=value;setEntityDirty(value);onDraftChange(value||draftFlags.current.legacy);},[onDraftChange]);
  const legacyDraftChange=useCallback(value=>{draftFlags.current.legacy=value;setLegacyDirty(value);onDraftChange(value||draftFlags.current.entity);},[onDraftChange]);
  useEffect(()=>()=>onDraftChange(false),[onDraftChange]);
  const mounted=useRef(true),generation=useRef(0),lastPoint=useRef(point);
  const tile=furnitureType(tileId), results=useMemo(()=>searchFurniture(query,world.formatVersion),[query,world.formatVersion]);
  const pattern=tile ? furnitureFrames(tileId,style) : null;
  const locked=disabled||busy||entityDirty||legacyDirty;
  function clear() {generation.current++;setPreview(null);setPayload(null);setAcknowledged(false);setBusy(false);onPreview(null);}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;onPreview(null);};},[onPreview]);
  useEffect(()=>{clear();setLegacyTarget(null);setError('');},[revision,selection]);
  useEffect(()=>{clear();},[reset]);
  const failure=value=>{if(mounted.current){setError(value.message);if(!session.loaded) onFailure(value);}};
  function change(callback) {clear();setLegacyTarget(null);setError('');callback();}
  async function prepare(at=position) {
    if(disabled||entityDirty||legacyDirty) return;
    clear();setLegacyTarget(null);const token=++generation.current;setBusy(true);setError('');
    try {
      if(mode==='inspect'||mode==='content') {
        const {furniture}=await session.inspectFurniture(at);
        if(!mounted.current||generation.current!==token) return;
        if(!furniture) {setError('此处没有可识别的完整家具。');return;}
        if(mode==='content'&&!furniture.legacy) {setError('此处不是旧式装备家具；现代家具请使用下方图格实体内容。');return;}
        setTileId(furniture.tileId);setStyle(furniture.styleIndex);setPosition({x:furniture.x,y:furniture.y});
        if(mode==='content') setLegacyTarget({furniture,revision,version:world.formatVersion});
        else setError(`已选中 ${furnitureType(furniture.tileId)?.zh || furnitureType(furniture.tileId)?.name}，可切换到放置换样式或删除。`);
      } else {
        const request={revision,action:mode,...at,...(mode==='place'?{tileId,styleIndex:style}:{}),selection};
        const {preview:result}=await session.previewFurniture(request);
        if(!mounted.current||generation.current!==token) return;
        setPreview(result);setPayload(request);onPreview({...result,color:tile?.color});
      }
    } catch(value) {if(generation.current===token) failure(value);}
    finally {if(mounted.current&&generation.current===token) setBusy(false);}
  }
  useEffect(()=>{
    if(!point||point===lastPoint.current) return;lastPoint.current=point;
    if(point.revision!==revision) {clear();setError('选点时世界已变化，请重新点选。');return;}
    const at={x:point.x,y:point.y};setPosition(at);prepare(at);
  },[point]);
  async function commit() {
    if(locked||!payload||!preview?.changes) return;
    setBusy(true);setError('');
    try {const result=await onSave('editFurniture',payload);if(result&&mounted.current) clear();}
    catch(value) {failure(value);}
    finally {if(mounted.current) setBusy(false);}
  }
  const loss=preview && preview.removed.chests+preview.removed.signs+preview.removed.entities+(preview.removed.pressurePlates??0)+(preview.removed.legacyItems??0)>0;
  return <div className="object-editor furniture-editor" onKeyDown={event=>{if(event.key==='Escape'&&preview&&!locked){event.stopPropagation();clear();}}}>
    <h3>家具与图格实体</h3>
    <label>家具操作<select aria-label="家具操作" value={mode} disabled={locked} onChange={event=>change(()=>setMode(event.target.value))}>
      <option value="place">放置 / 更换样式</option><option value="inspect">检查 / 取样完整家具</option><option value="remove">删除完整家具</option><option value="content">编辑旧式装备内容</option>
    </select></label>
    <label>查找家具<input aria-label="查找家具" placeholder="中文、英文、ID 或样式名称" value={query} disabled={locked} onChange={event=>setQuery(event.target.value)} /></label>
    <label>家具类别<select aria-label="家具类别" value={tileId} disabled={locked} onChange={event=>change(()=>{setTileId(Number(event.target.value));setStyle(0);})}>
      {tile&&!results.some(result=>result.id===tileId)&&<option value={tileId}>{label(tile)}（当前）</option>}
      {results.map(result=><option key={result.id} value={result.id}>{label(result)}</option>)}
    </select></label>
    <p className="object-caption">找到 {results.length} 类家具。{tile?.name}</p>
    {tile&&<label>家具样式<select aria-label="家具样式" value={style} disabled={locked} onChange={event=>change(()=>setStyle(Number(event.target.value)))}>
      {tile.styles.map((value,index)=><option key={index} value={index}>{styleLabel(value,index)}</option>)}
    </select></label>}
    {pattern&&<p className="object-caption" aria-label="家具尺寸">{pattern.width} × {pattern.height} 格 · 左上角定位</p>}
    <div className="furniture-coordinates"><label>X<input aria-label="家具 X" type="number" step="1" value={Number.isFinite(position.x)?position.x:''} disabled={locked} onChange={event=>change(()=>setPosition(previous=>({...previous,x:event.target.valueAsNumber})))} /></label>
      <label>Y<input aria-label="家具 Y" type="number" step="1" value={Number.isFinite(position.y)?position.y:''} disabled={locked} onChange={event=>change(()=>setPosition(previous=>({...previous,y:event.target.valueAsNumber})))} /></label></div>
    <div className="object-actions"><button disabled={locked} onClick={onMapPick}>在地图上选位置</button><button disabled={locked||!Number.isFinite(position.x)||!Number.isFinite(position.y)} onClick={()=>onLocate(position)}>定位家具坐标</button></div>
    <button disabled={locked} onClick={()=>prepare()}>{mode==='inspect'?'读取当前位置家具':mode==='content'?'读取旧式装备':'生成家具预览'}</button>
    {busy&&<p role="status">正在处理家具…</p>}
    {error&&<p role="alert">{error}</p>}
    {preview&&<div className="furniture-confirmation">
      <output aria-label="家具预览状态">预览影响 {preview.affected.length} 格；{preview.changes?'尚未写入世界。':'目标没有变化。'}</output>
      {loss&&<>{preview.removed.chests+preview.removed.signs+preview.removed.entities+(preview.removed.legacyItems??0)>0&&<p role="alert">将移除 {preview.removed.chests} 个箱子、{preview.removed.signs} 个告示牌、{preview.removed.entities} 个实体，其中有 {preview.removed.items} 格物品、{preview.removed.texts} 份文字。</p>}
        {preview.removed.legacyItems>0&&<p role="alert">其中包含 {preview.removed.legacyItems} 件旧式帧内装备。</p>}
        {preview.removed.pressurePlates>0&&<p role="alert">将一并移除 {preview.removed.pressurePlates} 条加重压力板按压记录。</p>}
        <label className="world-property-toggle"><input aria-label="确认家具内容删除" type="checkbox" checked={acknowledged} disabled={locked} onChange={event=>setAcknowledged(event.target.checked)} /><span>确认删除这些配套记录及内容</span></label></>}
      <div className="object-actions"><button disabled={locked||!preview.changes||(loss&&!acknowledged)} onClick={commit}>确认家具修改</button><button disabled={locked} onClick={clear}>取消家具预览</button></div>
    </div>}
    <p className="card-note">橙红色显示完整清理范围，绿色显示新家具。确认后整步撤销；同起点的箱子换样式保留物品。此工具不模拟游戏支撑物理。</p>
    {legacyTarget&&<LegacyEquipmentEditor key={`${revision}:${legacyTarget.furniture.x},${legacyTarget.furniture.y}`} target={legacyTarget} disabled={disabled||busy} selection={selection} onSave={onSave} onDraftChange={legacyDraftChange} onFailure={error=>{if(!session.loaded)onFailure(error);}} />}
    <TileEntityEditor session={session} revision={revision} disabled={disabled||busy||Boolean(preview)||legacyDirty} onSave={onSave} onDraftChange={entityDraftChange} onFailure={onFailure} onLocate={onLocate} />
  </div>;
}
