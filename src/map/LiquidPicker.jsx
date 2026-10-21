import React from 'react';
import { LIQUIDS, LIQUID_AMOUNTS } from '../editing/liquids.js';
import palette from '../../vendor/tedit-map-colors/palette.json' with { type: 'json' };

export default function LiquidPicker({ version, type, amount, onType, onAmount, disabled }) {
  const selected = LIQUIDS.find(item => item.id === type);
  const color = id => `rgb(${palette.liquids[id].join(',')})`;
  return <div className="material-picker">
    <div className="current-material" aria-label="当前液体">
      <span className="material-swatch" style={{ backgroundColor: color(type) }} aria-hidden="true" />
      <div><span className="material-caption">当前液体</span><strong>{selected.name}</strong><small>{Math.round(amount / 255 * 100)}% · {amount}/255</small></div>
    </div>
    <label>液量<select aria-label="液体量" value={amount} disabled={disabled} onChange={event => onAmount(Number(event.target.value))}>
      {LIQUID_AMOUNTS.map((value, index) => <option key={value} value={value}>{index * 10}% · {value}/255</option>)}
    </select></label>
    <div className="material-grid" role="group" aria-label="液体材料列表">
      {LIQUIDS.map(item => <button key={item.id} className="material-item" aria-label={item.name} aria-pressed={type === item.id} disabled={disabled || version < item.minVersion} title={version < item.minVersion ? '此世界格式不支持微光' : item.name} onClick={() => onType(item.id)}>
        <span className="material-swatch" style={{ backgroundColor: color(item.id) }} aria-hidden="true" /><span>{item.name}</span>
      </button>)}
    </div>
    <p className="card-note">使用画笔或填充选区设置液量；橡皮、擦除选区或 0% 清除液体。</p>
  </div>;
}
