import React from 'react';
import { WIRES } from '../editing/circuits.js';

export default function CircuitPicker({ layer, mask, onMask, actuator, actuated, onActuator, onActuated, disabled }) {
  return <div className="material-picker">
    {layer === 'wire' ? <>
      <div className="current-material" aria-label="当前电线"><div><span className="material-caption">电线颜色 · 可多选</span><strong>{WIRES.filter(wire => mask & wire.bit).map(wire => wire.name).join('、') || '未选择颜色'}</strong></div></div>
      <div className="material-grid" role="group" aria-label="电线颜色">
        {WIRES.map(wire => <button key={wire.bit} className="material-item" aria-label={`${wire.name}电线`} aria-pressed={Boolean(mask & wire.bit)} disabled={disabled} onClick={() => onMask(mask ^ wire.bit)}>
          <span className="material-swatch" style={{ backgroundColor: wire.color }} aria-hidden="true" /><span>{wire.name}电线</span>
        </button>)}
      </div>
      <p className="card-note">画笔添加选中颜色，橡皮只移除选中颜色；未选颜色不改变。电线可以连接家具和机关。</p>
    </> : <>
      <div className="current-material" aria-label="当前制动器"><div><span className="material-caption">方块状态</span><strong>{actuator ? '放置制动器' : '移除制动器'} · {actuated ? '虚化' : '实化'}</strong></div></div>
      <label><input type="checkbox" aria-label="放置制动器" checked={actuator} disabled={disabled} onChange={event => onActuator(event.target.checked)} />放置制动器</label>
      <label><input type="checkbox" aria-label="虚化方块" checked={actuated} disabled={disabled} onChange={event => onActuated(event.target.checked)} />虚化方块</label>
      <p className="card-note">画笔或填充选区将已有方块设为所选状态；橡皮同时移除制动器并实化。空格保持不变。</p>
    </>}
  </div>;
}
