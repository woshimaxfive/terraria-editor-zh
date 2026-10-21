import React from 'react';
import { BRUSH_SHAPES, MAX_BRUSH_DIMENSION } from '../editing/brushShape.js';

export default function BrushShapeControls({ value, onChange, disabled }) {
  const resize = (axis, input) => {
    const size = Math.max(1, Math.min(MAX_BRUSH_DIMENSION, Math.trunc(Number(input) || 1)));
    onChange({ ...value, [axis]: size, ...(value.locked ? { width: size, height: size } : {}) });
  };
  return <>
    <label>画笔形状<select aria-label="画笔形状" value={value.shape} disabled={disabled}
      onChange={event => onChange({ ...value, shape: event.target.value })}>
      {BRUSH_SHAPES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <div className="brush-dimensions" role="group" aria-label="画笔宽高">
      {['width', 'height'].map(axis => <label key={axis}>{axis === 'width' ? '宽' : '高'}
        <input type="number" min="1" max={MAX_BRUSH_DIMENSION} step="1" inputMode="numeric"
          aria-label={axis === 'width' ? '画笔宽度' : '画笔高度'} value={value[axis]} disabled={disabled}
          onChange={event => resize(axis, event.target.value)} />
      </label>)}
    </div>
    <label><input type="checkbox" checked={value.locked} disabled={disabled}
      onChange={event => onChange({ ...value, locked: event.target.checked,
        ...(event.target.checked ? { height: value.width } : {}) })} />锁定宽高</label>
    <p className="card-note">宽高 1–400 格，偶数尺寸按原版向左上定位。每笔最多 10000 格，超限整笔取消。</p>
  </>;
}
