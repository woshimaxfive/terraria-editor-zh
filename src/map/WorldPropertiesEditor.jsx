import React, { useEffect, useRef, useState } from 'react';
import { worldLayerLimits, editWorldPropertyDraft, constrainWorldLayers, fixWorldLayerGap } from '../editing/worldPropertyRules.js';

const copy = value => structuredClone(value);
const clockText = value => Number.isFinite(value) ? [Math.floor(value / 3600), Math.floor(value / 60) % 60, Math.floor(value) % 60].map(part => String(part).padStart(2, '0')).join(':') : '';
const clockValue = text => /^\d{2}:\d{2}(:\d{2})?$/.test(text) ? text.split(':').reduce((seconds, part, index) => seconds + Number(part) * [3600, 60, 1][index], 0) : '';

export default function WorldPropertiesEditor({ session, revision, disabled, onSave, onDraftChange, onFailure }) {
  const [baseline, setBaseline] = useState(null), [draft, setDraft] = useState(null), [group, setGroup] = useState('基本');
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [safeLayers, setSafeLayers] = useState(true);
  const mounted = useRef(true), generation = useRef(0);
  const changes = draft && baseline ? Object.fromEntries(Object.entries(draft).filter(([id, value]) => !Object.is(value, baseline.values[id]))) : {};
  const dirty = Object.keys(changes).length > 0, dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => { onDraftChange(dirty); }, [dirty, onDraftChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; onDraftChange(false); }; }, [onDraftChange]);
  const failure = value => { if (!mounted.current) return; setError(value.message); if (!session.loaded) onFailure(value); };
  async function load() {
    const token = ++generation.current; setBusy(true); setError('');
    try {
      const { properties } = await session.readWorldProperties();
      if (!mounted.current || generation.current !== token) return;
      setBaseline(properties); setDraft(copy(properties.values));
    } catch (value) { failure(value); }
    finally { if (mounted.current && generation.current === token) setBusy(false); }
  }
  useEffect(() => { if (!dirtyRef.current) load(); }, [session, revision]);
  const locked = disabled || busy;
  const limits = baseline ? worldLayerLimits(baseline.constraints, safeLayers) : null;
  const update = (id, value) => setDraft(previous => editWorldPropertyDraft(
    safeLayers && ['surfaceLevel', 'rockLevel'].includes(id) ? constrainWorldLayers(previous, limits) : previous, id, value, limits));
  function cancel() { setDraft(copy(baseline.values)); setError(''); }
  async function save(event) {
    event.preventDefault(); if (!dirty || locked) return;
    setBusy(true); setError('');
    try {
      const result = await onSave('editWorldProperties', { revision: baseline.revision, changes: {
        ...changes, ...(Object.hasOwn(changes, 'orbCount') ? { orbSmashed: draft.orbSmashed } : {}),
      }, options: { safeLayers } });
      if (result && mounted.current) await load();
    } catch (value) { failure(value); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="object-editor world-properties-editor" onKeyDown={event => { if (event.key === 'Escape' && dirty && !locked) { event.stopPropagation(); cancel(); } }}>
    <h3>编辑世界属性</h3>
    {busy && !baseline && <p role="status">正在读取世界属性…</p>}
    {error && <p role="alert">{error}</p>}
    {baseline && <form noValidate onSubmit={save}>
      <div className="object-actions world-property-actions"><button type="submit" disabled={locked || !dirty}>保存世界属性</button><button type="button" disabled={locked || !dirty} onClick={cancel}>取消属性修改</button></div>
      <p className="object-caption" role="status">{dirty ? `${Object.keys(changes).length} 项属性待保存；保存后可整体撤销。` : '更改后保存，或取消恢复。'}</p>
      <label>属性分类<select aria-label="世界属性分类" value={group} disabled={locked} onChange={event => setGroup(event.target.value)}>{[...new Set(baseline.fields.map(field => field.group))].map(name => <option key={name}>{name}</option>)}</select></label>
      {group === '地层' && <>
        <label className="world-property-toggle"><input type="checkbox" aria-label="安全地层范围" disabled={locked} checked={safeLayers} onChange={event => {
          const enabled = event.target.checked; setSafeLayers(enabled);
          if (enabled) setDraft(previous => constrainWorldLayers(previous, worldLayerLimits(baseline.constraints, true)));
        }} /><span>安全地层范围</span></label>
        <button type="button" disabled={locked} onClick={() => setDraft(previous => fixWorldLayerGap(previous, limits))}>修复背景间距</button>
      </>}
      <fieldset disabled={locked}><legend>{group}</legend>
        {baseline.fields.filter(field => field.group === group).map(field => <label key={field.id} className={field.type === 'boolean' ? 'world-property-toggle' : undefined}>
          {field.type === 'boolean' ? <><input type="checkbox" aria-label={field.label} checked={draft[field.id]} onChange={event => update(field.id, event.target.checked)} /><span>{field.label}</span></> : <><span>{field.label}</span>{field.type === 'select' ? <select aria-label={field.label} value={draft[field.id]} onChange={event => update(field.id, Number(event.target.value))}>
            {!field.options.some(([id]) => id === draft[field.id]) && <option value={draft[field.id]}>原值 {draft[field.id]}（保持不变）</option>}
            {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input aria-label={field.label} type={field.type === 'text' ? 'text' : field.type === 'clock' ? 'time' : 'number'} value={field.type === 'clock' ? clockText(draft[field.id]) : draft[field.id]} min={field.min} max={field.layer ? limits[field.layer] : field.max} step={field.type === 'clock' ? 1 : field.step ?? (field.integer ? 1 : 'any')} maxLength={field.type === 'text' ? 1024 : undefined}
              onChange={event => update(field.id, field.type === 'text' ? event.target.value : field.type === 'clock' ? clockValue(event.target.value) : event.target.value === '' ? '' : Number(event.target.value))} />}</>}
        </label>)}
      </fieldset>
      {['群系背景', '树木与洞穴'].includes(group) && <p className="object-caption">背景与样式设置在游戏中生效；当前地图使用已有的图格预览。</p>}
      {group === '地层' && <p className="object-caption">两层相碰时联动调整 6 格；修复背景间距会将层间距调整为 6 的倍数。</p>}
      <p className="object-caption">修改进度标记不会重新生成地形或移动居民。世界种子、出生点与地牢位置见上方信息。</p>
    </form>}
  </div>;
}
