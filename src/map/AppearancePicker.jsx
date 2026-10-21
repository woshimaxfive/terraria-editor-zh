import React from 'react';
import { PAINTS, SHAPES } from '../editing/appearance.js';

export default function AppearancePicker({ layer, version, slope, onSlope, value, onChange, disabled }) {
  const update = change => onChange({ ...value, ...change });
  if (layer === 'slope') return <div className="material-picker">
    <div className="current-material" aria-label="当前坡形"><strong>{SHAPES[slope].symbol} {SHAPES[slope].name}</strong></div>
    <div className="material-grid" role="group" aria-label="坡形选择">
      {SHAPES.map(shape => <button key={shape.id} className="material-item" aria-label={shape.name} aria-pressed={slope === shape.id} disabled={disabled} onClick={() => onSlope(shape.id)}><span className="shape-symbol" aria-hidden="true">{shape.symbol}</span><span>{shape.name}</span></button>)}
    </div>
    <p className="card-note">只改变支持坡面的已有方块。橡皮恢复完整方块；平台保留原有样式，空格和不支持的家具跳过。</p>
  </div>;
  return <div className="material-picker">
    <label>作用对象<select aria-label="涂料作用对象" value={value.target} disabled={disabled} onChange={event => update({ target: event.target.value })}><option value="block">方块</option><option value="wall">墙壁</option></select></label>
    <label>外观类型<select aria-label="外观类型" value={value.mode} disabled={disabled} onChange={event => update({ mode: event.target.value })}><option value="color">油漆</option><option value="coating" disabled={version < 269}>涂层{version < 269 ? '（此格式不支持）' : ''}</option></select></label>
    {value.mode === 'color' ? <>
      <div className="current-material" aria-label="当前涂料"><span className="material-swatch" style={{ backgroundColor: PAINTS[value.color].color.slice(0, 7) }} aria-hidden="true" /><strong>{PAINTS[value.color].name} · ID {value.color}</strong></div>
      <label>油漆颜色<select aria-label="油漆颜色" value={value.color} disabled={disabled} onChange={event => update({ color: Number(event.target.value) })}>
        {PAINTS.map(paint => <option key={paint.id} value={paint.id}>{paint.name} · {paint.id}{paint.id === 31 && version >= 269 ? '（转为全亮涂层）' : ''}</option>)}
      </select></label>
    </> : <>
      <label><input type="checkbox" aria-label="隐形涂层" checked={value.invisible} disabled={disabled} onChange={event => update({ invisible: event.target.checked })} />隐形涂层</label>
      <label><input type="checkbox" aria-label="全亮涂层" checked={value.fullBright} disabled={disabled} onChange={event => update({ fullBright: event.target.checked })} />全亮涂层</label>
    </>}
    <p className="card-note">只修改选定对象的颜色或涂层，可作用于家具。橡皮清除当前类型，另一类型保持。旧格式夜明为油漆，新格式夜明转为全亮涂层。</p>
    <p className="card-note">坡面使用简化色块轮廓，油漆和涂层使用色块预览；隐形对象以暗色显示以便编辑，完整游戏贴图效果尚未支持。</p>
  </div>;
}
