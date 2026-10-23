import React, { useEffect, useRef, useState } from 'react';
import { worldLayerLimits, editWorldPropertyDraft, constrainWorldLayers, fixWorldLayerGap } from '../editing/worldPropertyRules.js';
import { initializeTeamDraft, TEAM_NAMES } from '../editing/worldIdentity.js';

const copy = value => structuredClone(value);
const clockText = value => Number.isFinite(value) ? [Math.floor(value / 3600), Math.floor(value / 60) % 60, Math.floor(value) % 60].map(part => String(part).padStart(2, '0')).join(':') : '';
const clockValue = text => /^\d{2}:\d{2}(:\d{2})?$/.test(text) ? text.split(':').reduce((seconds, part, index) => seconds + Number(part) * [3600, 60, 1][index], 0) : '';

export default function WorldPropertiesEditor({ session, revision, disabled, onSave, onDraftChange, onFailure, onPointTarget, onLocate }) {
  const [baseline, setBaseline] = useState(null), [draft, setDraft] = useState(null), [group, setGroup] = useState('基本');
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [safeLayers, setSafeLayers] = useState(true);
  const [pointId, setPointId] = useState('spawn');
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
  const update = (id, value) => setDraft(previous => ({ ...editWorldPropertyDraft(
    safeLayers && ['surfaceLevel', 'rockLevel'].includes(id) ? constrainWorldLayers(previous, limits) : previous, id, value, limits),
    ...(id === 'teamSpawnsEnabled' && value && !baseline.constraints.teamSpawnCount ? initializeTeamDraft(previous) : {}),
  }));
  const points = baseline ? [{ id: 'spawn', label: '出生点' }, { id: 'dungeon', label: '地牢入口' },
    ...TEAM_NAMES.flatMap((name, index) => Object.hasOwn(baseline.values, 'team' + index + 'X') && (baseline.constraints.teamSpawnCount || draft.teamSpawnsEnabled)
      ? [{ id: 'team' + index, label: name + '出生点' }] : [])] : [];
  const point = points.find(value => value.id === pointId) ?? points[0];
  const position = point && { id: point.id, label: point.label, x: draft[point.id + 'X'], y: draft[point.id + 'Y'] };
  const validPoint = position && Number.isInteger(position.x) && Number.isInteger(position.y) && position.x >= 0 && position.x < baseline.constraints.width && position.y >= 0 && position.y < baseline.constraints.height;
  function cancel() { setDraft(copy(baseline.values)); setError(''); }
  async function save(event) {
    event.preventDefault(); if (!dirty || locked) return;
    setBusy(true); setError('');
    try {
      const result = await onSave('editWorldProperties', { revision: baseline.revision, changes: {
        ...changes, ...(Object.hasOwn(changes, 'orbCount') ? { orbSmashed: draft.orbSmashed } : {}),
        ...(!baseline.constraints.teamSpawnCount && draft.teamSpawnsEnabled && (Object.hasOwn(changes, 'teamSpawnsEnabled') || Object.keys(changes).some(id => /^team[0-5][XY]$/.test(id)))
          ? Object.fromEntries(TEAM_NAMES.flatMap((_, index) => ['X', 'Y'].map(axis => ['team' + index + axis, draft['team' + index + axis]]))) : {}),
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
      {group === '位置' && <>
        <label>位置目标<select aria-label="位置目标" value={point.id} disabled={locked || dirty} onChange={event => setPointId(event.target.value)}>{points.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
        <div className="object-actions"><button type="button" disabled={locked || dirty} onClick={() => onPointTarget(point.id)}>在地图上移动</button><button type="button" disabled={locked || dirty || !validPoint} onClick={() => onLocate(position)}>定位到此位置</button></div>
        <p className="object-caption">坐标以格为单位。保存或取消草稿后可切换到地图位置工具；点按确认，拖动浏览，Esc 退出。</p>
      </>}
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
            {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input aria-label={field.label} disabled={field.teamPoint && !baseline.constraints.teamSpawnCount && !draft.teamSpawnsEnabled} type={['text', 'guid'].includes(field.type) ? 'text' : field.type === 'clock' ? 'time' : 'number'} value={field.type === 'clock' ? clockText(draft[field.id]) : draft[field.id]} min={field.min} max={field.layer ? limits[field.layer] : field.max} step={field.type === 'clock' ? 1 : field.step ?? (field.integer ? 1 : 'any')} maxLength={field.type === 'guid' ? 36 : field.type === 'text' ? 1024 : undefined}
              onChange={event => update(field.id, ['text', 'guid'].includes(field.type) ? event.target.value : field.type === 'clock' ? clockValue(event.target.value) : event.target.value === '' ? '' : Number(event.target.value))} />}</>}
        </label>)}
      </fieldset>
      {['群系背景', '树木与洞穴'].includes(group) && <p className="object-caption">树木贴图会随树木样式及相关背景设置更新；群系背景画面以游戏内效果为准。</p>}
      {group === '地层' && <p className="object-caption">两层相碰时联动调整 6 格；修复背景间距会将层间距调整为 6 的倍数。</p>}
      <p className="object-caption">修改进度或出生点不会重新生成地形、移动建筑或居民。世界种子见上方信息。</p>
    </form>}
  </div>;
}
