import React, { useMemo, useState } from 'react';
import { materialsFor, searchMaterials } from '../editing/materials.js';

export default function MaterialPicker({ layer, version, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const materials = useMemo(() => materialsFor(layer, version), [layer, version]);
  const groups = [...new Set(materials.map(item => item.group))];
  const matches = searchMaterials(materials, query, group);
  const selected = materials.find(item => item.id === value);
  const outside = selected && !matches.includes(selected);
  const label = layer === 'wall' ? '墙壁' : '方块';
  return <div className="material-picker">
    <label>搜索<input type="search" aria-label="搜索材料" placeholder="中文 / English / ID" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} /></label>
    <label>分类<select aria-label="材料分类" value={group} disabled={disabled} onChange={event => setGroup(event.target.value)}>
      <option value="">全部分类</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}
    </select></label>
    <label>{label}<select aria-label={`画笔${label}`} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>
      {outside && <optgroup label="当前材料（不在搜索结果中）"><option value={selected.id}>{selected.name}</option></optgroup>}
      {groups.map(name => <optgroup key={name} label={name}>{matches.filter(item => item.group === name).map(item =>
        <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}
    </select></label>
    <output className="material-count" aria-label="材料搜索结果">{matches.length} / {materials.length} 种{label} · 当前 ID {value}</output>
  </div>;
}
