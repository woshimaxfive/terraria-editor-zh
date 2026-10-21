import React from 'react';
import { BRUSH_SHAPES, MAX_BRUSH_DIMENSION, isLineBrush, maxLineThickness } from '../editing/brushShape.js';

export default function BrushShapeControls({ value, onChange, disabled }) {
  const change = next => onChange({ ...next, thickness: Math.min(next.thickness ?? 1, maxLineThickness(next)) });
  const resize = (axis, input) => {
    const size = Math.max(1, Math.min(MAX_BRUSH_DIMENSION, Math.trunc(Number(input) || 1)));
    change({ ...value, [axis]: size, ...(value.locked ? { width: size, height: size } : {}) });
  };
  return <>
    <label>画笔形状<select aria-label="画笔形状" value={value.shape} disabled={disabled}
      onChange={event => change({ ...value, shape: event.target.value })}>
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
      onChange={event => change({ ...value, locked: event.target.checked,
        ...(event.target.checked ? { height: value.width } : {}) })} />锁定宽高</label>
    {isLineBrush(value.shape) && <>
      <label className="line-thickness">线形粗细<input type="number" min="1" max={maxLineThickness(value)} step="1"
        aria-label="线形粗细" inputMode="numeric" value={value.thickness ?? 1} disabled={disabled}
        onChange={event => change({ ...value, thickness: Math.max(1, Math.trunc(Number(event.target.value) || 1)) })} /></label>
      <p className="card-note">1 为细线；大于 1 时按原版作为圆形扩展半径，最多为短边的一半。</p>
    </>}
    <p className="card-note">宽高 1–400 格，偶数尺寸按原版向左上定位。每笔最多 10000 格，超限整笔取消。</p>
  </>;
}
