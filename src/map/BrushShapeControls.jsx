import React from 'react';
import { BRUSH_SHAPES, MAX_BRUSH_DIMENSION, isLineBrush, maxLineThickness } from '../editing/brushShape.js';

export default function BrushShapeControls({ value, geometry, onChange, disabled }) {
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
    <div className="brush-transform" role="group" aria-label="画笔变换">
      <label>旋转角度<input type="number" min="0" max="360" step="1" inputMode="decimal"
        aria-label="画笔旋转角度" value={value.rotation ?? 0} disabled={disabled}
        onChange={event => change({ ...value, rotation: Math.max(0, Math.min(360, Number(event.target.value) || 0)) })} /></label>
      <label><input type="checkbox" checked={value.flipHorizontal ?? false} disabled={disabled}
        onChange={event => change({ ...value, flipHorizontal: event.target.checked })} />左右翻转笔形</label>
      <label><input type="checkbox" checked={value.flipVertical ?? false} disabled={disabled}
        onChange={event => change({ ...value, flipVertical: event.target.checked })} />上下翻转笔形</label>
      <button type="button" disabled={disabled} onClick={() => change({ ...value, rotation: 0, flipHorizontal: false, flipVertical: false })}>重置笔形变换</button>
    </div>
    <p className="card-note">先翻转，再绕落笔中心旋转。角度 0–360°；原版在大于 0.01° 时启用旋转，360° 仍按变换路径生成。实际范围与空洞以光标为准。</p>
    {geometry.issue && <p className="card-note" role="status" aria-label="画笔形状提示">{geometry.issue}</p>}
    {value.shape === 'crescent' && <p className="card-note">月牙：高决定外径，宽控制丰满程度，宽越大越饱满。</p>}
    {value.shape === 'donut' && <p className="card-note">圆环：高决定外径，宽控制环厚，按原版半径取整，保留中心空格。</p>}
    <p className="card-note">尺寸参数 1–400 格，按原版定位，实际落笔范围以光标为准。每笔最多 10000 格，超限整笔取消。</p>
  </>;
}
