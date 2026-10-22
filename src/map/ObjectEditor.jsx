import React, { useEffect, useMemo, useRef, useState } from 'react';
import metadata from '../../vendor/tedit-objects/catalogue.json' with { type: 'json' };

const items = metadata.items.map(([id, name, key, zh]) => ({ id, name, key, zh }));
const itemById = new Map(items.map(item => [item.id, item]));
const nameOf = item => item ? (itemById.get(item.id)?.zh || itemById.get(item.id)?.name) ?? '未知物品 ID ' + item.id : '空格';
const copy = value => structuredClone(value);

export default function ObjectEditor({ session, revision, version, disabled, onSave, onDraftChange, onLocate, onFailure }) {
  const [kind, setKind] = useState('chest'), [objects, setObjects] = useState([]), [query, setQuery] = useState('');
  const [baseline, setBaseline] = useState(null), [draft, setDraft] = useState(null), [slot, setSlot] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [itemQuery, setItemQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), selected = useRef(null), mounted = useRef(true);
  const dirty = Boolean(draft && JSON.stringify(draft) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => { onDraftChange(dirty); }, [dirty, onDraftChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; onDraftChange(false); }; }, [onDraftChange]);
  const failure = value => { if (!mounted.current) return; setError(value.message); if (!session.loaded) onFailure(value); };
  async function load(index) {
    const token = ++generation.current; setBusy(true); setError('');
    try {
      const { object } = await session.readObject({ kind, index });
      if (!mounted.current || token !== generation.current) return;
      selected.current = index; setBaseline(object); setDraft(copy(object)); setSlot(0); setItemQuery('');
    } catch (value) { failure(value); }
    finally { if (mounted.current && token === generation.current) setBusy(false); }
  }
  useEffect(() => {
    let current = true;
    setListLoading(true);
    session.listObjects(kind).then(({ objects: values }) => { if (current) { setObjects(values); setListLoading(false); } }).catch(value => { if (current) { setListLoading(false); failure(value); } });
    if (selected.current !== null && !dirtyRef.current) load(selected.current);
    return () => { current = false; };
  }, [session, kind, revision]);
  const maxItem = metadata.versions.findLast(entry => entry.version <= version)?.maxItemId ?? 0;
  const found = useMemo(() => {
    const q = itemQuery.trim().toLowerCase(); if (!q) return [];
    return items.filter(item => item.id <= maxItem && (String(item.id) === q || item.name.toLowerCase().includes(q) || item.key?.toLowerCase().includes(q) || item.zh.includes(q))).slice(0, 20);
  }, [itemQuery, maxItem]);
  const results = objects.filter(object => (object.index + 1 + ' ' + object.x + ',' + object.y + ' ' + (object.name ?? object.text ?? '')).toLowerCase().includes(query.toLowerCase()));
  const locked = disabled || busy || listLoading, currentItem = draft?.slots?.[slot];
  function setItem(item) { setDraft(previous => ({ ...previous, slots: previous.slots.map((value, index) => index === slot ? item : value) })); }
  function changeItem(field, value) { setItem({ ...(currentItem ?? { id: 0, stack: 1, prefix: 0 }), [field]: Number(value) }); }
  async function save(event) {
    event.preventDefault(); if (!dirty || locked) return;
    const changes = draft.kind === 'sign' ? { text: draft.text } : {
      ...(draft.name !== baseline.name ? { name: draft.name } : {}),
      slots: draft.slots.flatMap((item, index) => JSON.stringify(item) === JSON.stringify(baseline.slots[index]) ? [] : [{ slot: index, item }]),
    };
    setBusy(true); setError('');
    try { const result = await onSave('editObject', { kind, index: draft.index, revision: baseline.revision, changes }); if (result && mounted.current) await load(draft.index); }
    catch (value) { failure(value); }
    finally { if (mounted.current) setBusy(false); }
  }
  function cancel() { setDraft(copy(baseline)); setError(''); }
  return <div className="object-editor" onKeyDown={event => { if (event.key === 'Escape' && dirty && !locked) { event.stopPropagation(); cancel(); } }}>
    <h3>箱子与告示牌</h3>
    <label>对象类型<select aria-label="对象类型" value={kind} disabled={locked || dirty} onChange={event => { if (event.target.value === kind) return; generation.current++; selected.current = null; setBaseline(null); setDraft(null); setObjects([]); setKind(event.target.value); setQuery(''); }}><option value="chest">箱子</option><option value="sign">告示牌</option></select></label>
    <label>查找对象<input aria-label="查找对象" placeholder="名称、文字、序号或 X,Y" value={query} disabled={locked || dirty} onChange={event => setQuery(event.target.value)} /></label>
    <label>已有对象<select aria-label="已有对象" value={draft?.index ?? ''} disabled={locked || dirty} onChange={event => { if (event.target.value !== '') load(Number(event.target.value)); }}>
      <option value="">选择对象（共 {objects.length} 个）</option>{results.map(object => <option key={object.index} value={object.index}>#{object.index + 1} · {object.x},{object.y} · {object.name || object.text || '未命名'}</option>)}
    </select></label>
    {listLoading && <p role="status">正在读取对象清单…</p>}
    {!listLoading && !objects.length && <p className="card-note">这份世界没有{kind === 'chest' ? '箱子' : '告示牌'}。</p>}
    {error && <p role="alert">{error}</p>}
    {draft && <form onSubmit={save} noValidate>
      <div className="object-location"><output aria-label="对象位置">X {draft.x} · Y {draft.y}</output><button type="button" disabled={locked} onClick={() => onLocate(draft)}>地图定位</button></div>
      {kind === 'sign' ? <label>告示牌文字<textarea aria-label="告示牌文字" value={draft.text} disabled={locked} rows={7} onChange={event => setDraft(previous => ({ ...previous, text: event.target.value }))} /></label> : <>
        <label>箱子名称<input aria-label="箱子名称" value={draft.name} disabled={locked} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} /></label>
        <p className="object-caption">{draft.slotCount} 格物品 · 点击一格编辑</p>
        <div className="object-slots" role="group" aria-label="箱子物品格">{draft.slots.map((item, index) => <button key={index} type="button" aria-label={'物品格 ' + (index + 1)} aria-pressed={slot === index} disabled={locked} title={'第 ' + (index + 1) + ' 格 · ' + nameOf(item) + (item ? ' × ' + item.stack : '')} onClick={() => setSlot(index)}><span>{index + 1}</span><strong>{item?.id ?? '—'}</strong>{item && <small>×{item.stack}</small>}</button>)}</div>
        <fieldset disabled={locked}><legend>第 {slot + 1} 格 · {nameOf(currentItem)}</legend>
          <label>物品 ID<input aria-label="箱内物品ID" type="number" min="1" max={maxItem} step="1" value={currentItem?.id ?? ''} onChange={event => changeItem('id', event.target.value)} /></label>
          <label>数量<input aria-label="箱内物品数量" type="number" min="1" max="32767" step="1" value={currentItem?.stack ?? ''} onChange={event => changeItem('stack', event.target.value)} /></label>
          <label>前缀<select aria-label="箱内物品前缀" value={currentItem?.prefix ?? 0} onChange={event => changeItem('prefix', event.target.value)}>{currentItem && !metadata.prefixes.some(p => p.id === currentItem.prefix && (p.id <= 84 || version >= 315)) && <option value={currentItem.prefix}>未知前缀 {currentItem.prefix}（保留）</option>}{metadata.prefixes.filter(p => p.id <= 84 || version >= 315).map(prefix => <option key={prefix.id} value={prefix.id}>{prefix.id} · {prefix.zh || prefix.name.trim() || '无前缀'}</option>)}</select></label>
          <button type="button" disabled={!currentItem} onClick={() => setItem(null)}>清空当前格</button>
          <label>查找物品<input aria-label="查找箱内物品" placeholder="中文、英文或 ID" value={itemQuery} onChange={event => setItemQuery(event.target.value)} /></label>
          {itemQuery && <div className="object-item-results" role="group" aria-label="箱内物品搜索结果">{found.map(item => <button key={item.id} type="button" onClick={() => { setItem({ id: item.id, stack: 1, prefix: 0 }); setItemQuery(''); }}>{item.id} · {item.zh || item.name}</button>)}{!found.length && <span>没有符合当前存档版本的物品</span>}</div>}
        </fieldset>
      </>}
      <div className="object-actions"><button type="button" disabled={locked || !dirty} onClick={cancel}>取消对象修改</button><button type="submit" disabled={locked || !dirty}>保存对象修改</button></div>
      <output className="object-caption" aria-label="对象草稿状态">{dirty ? '草稿尚未写入世界；保存后一步撤销，取消可还原。' : '当前对象没有未保存草稿。'}</output>
    </form>}
    <p className="card-note">只编辑已有对象的内容；位置和物品格数保留。保存后请导出世界副本。</p>
  </div>;
}
