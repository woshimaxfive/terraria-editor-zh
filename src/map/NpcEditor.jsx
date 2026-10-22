import React, { useEffect, useRef, useState } from 'react';
import { npcType, searchNpcs } from '../editing/npcs.js';

const fields = ['name', 'variant', 'shimmered', 'partying', 'homeless', 'homelessDespawn'];
const label = npc => `${npcType(npc.id)?.zh ?? '未知 NPC'} · ${npc.name} · ID ${npc.id} (#${npc.key})`;

export default function NpcEditor({ session, revision, disabled, onSave, onDraftChange, onFailure, onPointTarget, onLocate }) {
  const [baseline, setBaseline] = useState(null), [draft, setDraft] = useState(null), [data, setData] = useState(null);
  const [query, setQuery] = useState(''), [typeQuery, setTypeQuery] = useState(''), [addId, setAddId] = useState('');
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const mounted = useRef(true), generation = useRef(0), selected = useRef(null), addedSelection = useRef(null);
  const changes = draft && baseline ? Object.fromEntries(fields.filter(key => !Object.is(draft[key], baseline[key])).map(key => [key, draft[key]])) : {};
  const dirty = Object.keys(changes).length > 0, dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => { onDraftChange(dirty); }, [dirty, onDraftChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; onDraftChange(false); }; }, [onDraftChange]);
  const failure = value => { if (!mounted.current) return; setError(value.message); if (!session.loaded) onFailure(value); };
  function choose(record) { selected.current = record?.key ?? null; addedSelection.current = null; setBaseline(record ?? null); setDraft(record ? { ...record } : null); }
  async function load() {
    const token = ++generation.current; setBusy(true); setError('');
    try {
      const { npcs } = await session.readNpcs();
      if (!mounted.current || generation.current !== token) return;
      // Revision refresh and save completion can overlap. Resolve selection only
      // when the newest read arrives, so it cannot restore a previous resident.
      setData(npcs); choose(npcs.records.find(record => addedSelection.current !== null ? record.id === addedSelection.current : record.key === selected.current) ?? npcs.records[0]);
    } catch (value) { failure(value); }
    finally { if (mounted.current && generation.current === token) setBusy(false); }
  }
  useEffect(() => { if (!dirtyRef.current) load(); }, [session, revision]);
  const locked = disabled || busy, type = draft && npcType(draft.id);
  const results = data?.records.filter(npc => (label(npc) + ' ' + npcType(npc.id)?.name + ' ' + npcType(npc.id)?.key).toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const available = data ? searchNpcs(typeQuery, data.version) : [];
  const addType = available.find(value => String(value.id) === addId) ?? available[0];
  const occupied = data?.records.some(npc => npc.id === addType?.id);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  function cancel() { setDraft({ ...baseline }); setError(''); }
  async function commit(action, extra = {}) {
    if (locked || !data) return;
    setBusy(true); setError('');
    if (action === 'add') addedSelection.current = extra.id;
    try {
      const result = await onSave('editNpc', { revision: data.revision, action, ...extra });
      if (result && mounted.current) await load();
      else addedSelection.current = null;
    } catch (value) { failure(value); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="object-editor npc-editor" onKeyDown={event => { if (event.key === 'Escape' && dirty && !locked) { event.stopPropagation(); cancel(); } }}>
    <h3>NPC 编辑</h3>
    {error && <p role="alert">{error}</p>}
    {!data && busy && <p role="status">正在读取 NPC…</p>}
    {data && <>
      <label>查找居民<input aria-label="查找居民" placeholder="中文、英文、ID 或个人名称" value={query} disabled={locked || dirty} onChange={event => setQuery(event.target.value)} /></label>
      <label>已有 NPC<select aria-label="已有 NPC" value={draft?.key ?? ''} disabled={locked || dirty} onChange={event => choose(data.records.find(npc => npc.key === event.target.value))}>
        {!draft && <option value="">世界中没有城镇 NPC</option>}
        {draft && !results.some(npc => npc.key === draft.key) && <option value={draft.key}>{label(baseline)}</option>}
        {results.map(npc => <option key={npc.key} value={npc.key}>{label(npc)}</option>)}
      </select></label>
      <p className="object-caption" aria-label="居民数量">共 {data.records.length} 位居民，找到 {results.length} 位。</p>
      {draft && <form noValidate onSubmit={event => { event.preventDefault(); if (dirty) commit('update', { key: draft.key, changes }); }}>
        <fieldset disabled={locked}>
          <legend>{type?.zh ?? '未知 NPC'} · ID {draft.id}</legend>
          <label>个人名称<input aria-label="NPC 个人名称" maxLength={1024} value={draft.name} onChange={event => update('name', event.target.value)} /></label>
          {data.version >= 213 && Boolean(type?.variants.length) && <label>外观变体<select aria-label="NPC 外观变体" value={draft.variant ?? ''} onChange={event => update('variant', Number(event.target.value))}>
            {(draft.variant === null || !type.variants[draft.variant]) && <option value={draft.variant ?? ''}>原值 {draft.variant ?? '未指定'}（保留）</option>}
            {type.variants.map((value, index) => <option key={index} value={index}>{type.variantLabels[index] ?? value}</option>)}
          </select></label>}
          {data.version >= 268 && type?.canShimmer && <label className="world-property-toggle"><input aria-label="NPC 微光外观" type="checkbox" checked={draft.shimmered} onChange={event => update('shimmered', event.target.checked)} /><span>微光外观</span></label>}
          <label className="world-property-toggle"><input aria-label="NPC 参加派对" type="checkbox" checked={draft.partying} disabled={!Number.isInteger(draft.id) || draft.id < 0} onChange={event => update('partying', event.target.checked)} /><span>参加派对</span></label>
          <label className="world-property-toggle"><input aria-label="NPC 无家可归" type="checkbox" checked={draft.homeless} onChange={event => update('homeless', event.target.checked)} /><span>无家可归</span></label>
          {data.version >= 315 && <label className="world-property-toggle"><input aria-label="NPC 无家时消失" type="checkbox" checked={Boolean(draft.homelessDespawn)} onChange={event => update('homelessDespawn', event.target.checked)} /><span>无家时消失</span></label>}
        </fieldset>
        <div className="object-actions"><button type="submit" disabled={locked || !dirty}>保存 NPC 修改</button><button type="button" disabled={locked || !dirty} onClick={cancel}>取消 NPC 修改</button></div>
        <output className="object-caption" aria-label="NPC 草稿状态">{dirty ? '草稿尚未保存；保存后可整体撤销。' : '当前 NPC 没有未保存草稿。'}</output>
        <p className="object-caption">位置 X {draft.x} · Y {draft.y}<br />住所 X {draft.homeX} · Y {draft.homeY}</p>
        <div className="object-actions"><button type="button" disabled={locked || dirty || !Number.isFinite(draft.x) || !Number.isFinite(draft.y)} onClick={() => onLocate(draft)}>定位 NPC</button><button type="button" disabled={locked || dirty} onClick={() => onPointTarget('npc:' + draft.key)}>在地图上移动 NPC</button></div>
        <button type="button" disabled={locked || dirty} onClick={() => commit('remove', { key: draft.key })}>删除当前 NPC</button>
      </form>}
      <fieldset disabled={locked || dirty}><legend>添加 NPC</legend>
        <label>查找 NPC 种类<input aria-label="查找 NPC 种类" placeholder="中文、英文或 ID" value={typeQuery} onChange={event => setTypeQuery(event.target.value)} /></label>
        <label>NPC 种类<select aria-label="NPC 种类" value={addType?.id ?? ''} onChange={event => setAddId(event.target.value)}>
          {!available.length && <option value="">当前存档版本没有匹配的种类</option>}
          {available.map(npc => <option key={npc.id} value={npc.id}>{npc.id} · {npc.zh} · {npc.name}{data.records.some(record => record.id === npc.id) ? '（已存在）' : ''}</option>)}
        </select></label>
        <button type="button" disabled={!addType || occupied} onClick={() => commit('add', { id: addType.id })}>在出生点添加 NPC</button>
        {occupied && <p className="object-caption">这个种类已存在，请在上方选择具体居民。</p>}
      </fieldset>
      <p className="card-note">地图移动同步当前位置和住所。微光与派对按种类生效；已有重复居民仍可分别改名、移动或删除。保存后请导出副本。</p>
    </>}
  </div>;
}
