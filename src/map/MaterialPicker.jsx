import React, { useMemo, useState } from 'react';
import { materialsFor, searchMaterials } from '../editing/materials.js';
import palette from '../../vendor/tedit-map-colors/palette.json' with { type: 'json' };

export default function MaterialPicker({ layer, version, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const materials = useMemo(() => materialsFor(layer, version), [layer, version]);
  const groups = [...new Set(materials.map(item => item.group))];
  const matches = searchMaterials(materials, query, group);
  const selected = materials.find(item => item.id === value);
  const label = layer === 'wall' ? '墙壁' : '方块';
  const color = id => `rgb(${(layer === 'wall' ? palette.walls : palette.blocks)[id]?.join(',') || '255,0,255'})`;
  return <div className="material-picker">
    <div className="current-material" aria-label={`当前${label}`}>
      <span className="material-swatch" style={{ backgroundColor: color(value) }} aria-hidden="true" />
      <div><span className="material-caption">当前{label}</span><strong>{selected?.name || `ID ${value}`}</strong><small>{selected?.english ? `${selected.english} · ` : ''}ID {value}</small></div>
    </div>
    <label className="material-search"><span className="sr-only">搜索材料</span><input type="search" aria-label="搜索材料" placeholder="搜索名称 / English / ID" value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} /></label>
    <div className="material-filter"><label>分类<select aria-label="材料分类" value={group} disabled={disabled} onChange={event => setGroup(event.target.value)}>
      <option value="">全部分类</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}
    </select></label><output className="material-count" aria-label="材料搜索结果">{matches.length} / {materials.length}</output></div>
    <div className="material-grid" role="group" aria-label={`${label}材料列表`}>
      {matches.map(item => <button key={item.id} className="material-item" aria-label={`${item.name} · ID ${item.id}`} aria-pressed={value === item.id} disabled={disabled} title={`${item.english} · ID ${item.id}`} onClick={() => onChange(item.id)}>
        <span className="material-swatch" style={{ backgroundColor: color(item.id) }} aria-hidden="true" />
        <span>{item.name}</span>
        <small aria-hidden="true">{item.id}</small>
      </button>)}
      {!matches.length && <p className="empty-materials">没有匹配的材料，试试中文名称、英文或 ID。</p>}
    </div>
  </div>;
}
