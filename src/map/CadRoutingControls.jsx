import React from 'react';

export default function CadRoutingControls({ mode, direction, chain, onMode, onDirection, onChain, status, disabled }) {
  return <div className="brush-transform" role="group" aria-label="CAD路由设置">
    <label>CAD路由<select aria-label="CAD路由模式" value={mode} disabled={disabled} onChange={e => onMode(e.target.value)}>
      <option value="off">关闭</option><option value="elbow90">90° 转弯</option><option value="miter45">45° 阶梯</option>
    </select></label>
    {mode !== 'off' && <>
      <label>优先方向<select aria-label="CAD优先方向" value={direction} disabled={disabled} onChange={e => onDirection(e.target.value)}>
        <option value="auto">自动</option><option value="horizontal">先水平</option><option value="vertical">先竖直</option>
      </select></label>
      <label><input aria-label="CAD连续接线" type="checkbox" checked={chain} disabled={disabled} onChange={e => onChain(e.target.checked)} />连续接线</label>
      <p className="card-note">点按先写一格并设锚点，再点按提交预览路径。宽高决定总线根数，起始线距两格；纯水平或竖直路径可能合流。笔形、旋转、空心和喷枪设置暂不参与。每段一步历史。</p>
      <p className="card-note">Shift+W 切换关闭、90°、45°；Shift+Q 切换方向。Esc 或右键清锚点，再按 Esc 退出。切换模式保留锚点。触屏松手确认，双指取消本次点按；已提交的首格保留。</p>
      <output className="card-note" aria-label="CAD路由状态">{status?.issue || (status?.anchor ? `锚点 X ${status.anchor.x} · Y ${status.anchor.y}；预览 ${status.count} 格` : '点按地图设置起点。')}</output>
    </>}
  </div>;
}
