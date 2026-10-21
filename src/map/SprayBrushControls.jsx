import React from 'react';

export default function SprayBrushControls({ value, onChange, mode, disabled }) {
  const update = (name, minimum, maximum, raw) => onChange({ ...value, [name]: Math.max(minimum, Math.min(maximum, Math.trunc(Number(raw) || minimum))) });
  return <div className="brush-transform" role="group" aria-label="喷枪设置">
    <label><input type="checkbox" checked={value.spray ?? false} disabled={disabled || mode !== 'freehand'}
      onChange={event => onChange({ ...value, spray: event.target.checked })} />喷枪模式</label>
    {mode !== 'freehand' && <p className="card-note">喷枪用于自由绘制，切回自由绘制后生效。</p>}
    {value.spray && mode === 'freehand' && <>
      <label>密度（%）<input aria-label="喷枪密度" type="number" min="1" max="100" step="1" value={value.sprayDensity ?? 15} disabled={disabled}
        onChange={event => update('sprayDensity', 1, 100, event.target.value)} /></label>
      <label>间隔（毫秒）<input aria-label="喷枪间隔" type="number" min="10" max="100" step="1" value={value.sprayTickMs ?? 100} disabled={disabled}
        onChange={event => update('sprayTickMs', 10, 100, event.target.value)} /></label>
      <p className="card-note">按住并移动喷绘；密度决定每次抽取比例，间隔越短喷绘越密。停留后松开也会补喷。松开后整笔提交，Esc 或双指取消。喷枪按实心笔形采样，空心设置保留。</p>
    </>}
  </div>;
}
