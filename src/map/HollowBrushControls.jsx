import React from 'react';
import { materialsFor } from '../editing/materials.js';
import { isLineBrush, maxLineThickness } from '../editing/brushShape.js';

export default function HollowBrushControls({ value, onChange, layer, version, wallId, onWallChange, disabled }) {
  const available = ['block', 'wall'].includes(layer);
  return <div className="brush-transform" role="group" aria-label="空心画笔设置">
    <label><input type="checkbox" checked={value.hollow ?? false} disabled={disabled || !available}
      onChange={event => onChange({ ...value, hollow: event.target.checked })} />空心画笔</label>
    {!available && <p className="card-note">空心用于方块和墙壁图层，切回对应图层后生效。</p>}
    {available && value.hollow && <>
      {!isLineBrush(value.shape) && <label>边框厚度<input type="number" min="1" max={maxLineThickness(value)} step="1"
        aria-label="空心边框厚度" value={value.thickness} disabled={disabled}
        onChange={event => onChange({ ...value, thickness: Math.max(1, Math.min(maxLineThickness(value), Math.trunc(Number(event.target.value) || 1))) })} /></label>}
      {isLineBrush(value.shape) && <p className="card-note">线形粗细同时作为空心边框厚度。</p>}
      {layer === 'block' && <label><input type="checkbox" checked={value.fillWall ?? false} disabled={disabled}
        onChange={event => onChange({ ...value, fillWall: event.target.checked })} />内部填墙</label>}
      {layer === 'block' && value.fillWall && <label>内墙材料<select aria-label="空心内墙材料" value={wallId} disabled={disabled}
        onChange={event => onWallChange(Number(event.target.value))}>
        {materialsFor('wall', version).map(item => <option key={item.id} value={item.id}>{item.name} · ID {item.id}</option>)}
      </select></label>}
      <p className="card-note">方块层绘制边框并清除内部方块，可同时填墙；墙壁层只处理内部。先清除，再按条件填墙，合为一步撤销。原版未变换的矩形拖动后续按实心区域延伸。预览：黄色为绘制，蓝色为内部处理；受保护图格和条件在提交时检查。</p>
    </>}
  </div>;
}
