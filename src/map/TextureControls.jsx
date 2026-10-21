import React, { useEffect, useRef, useState } from 'react';

export default function TextureControls({ resources, mode, onModeChange, onResourcesChange, disabled }) {
  const input = useRef(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('选择本机游戏资源后，可放大查看基础地形贴图。');
  const [errors, setErrors] = useState([]);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function load(files) {
    const current = ++sequence.current;
    setLoading(true); setErrors([]);
    try {
      const pending = resources.load(files, text => { if (current === sequence.current) setStatus(text); });
      onResourcesChange();
      const result = await pending;
      if (current !== sequence.current) return;
      onResourcesChange();
      if (result.loaded) onModeChange('texture');
      setStatus(result.loaded ? `已加载 ${result.loaded}/4 张 · ${(result.bytes / 1024 / 1024).toFixed(2)} MiB` : '没有可用贴图，继续使用色块显示。');
      setErrors(result.failures);
    } catch (error) {
      if (error.name !== 'AbortError' && current === sequence.current) { setStatus(error.message); onResourcesChange(); }
    } finally { if (current === sequence.current) setLoading(false); }
  }
  return <section className="texture-controls" aria-label="地图贴图资源">
    <div className="texture-actions">
      <label>显示模式 <select aria-label="地图显示模式" value={mode} disabled={disabled || loading} onChange={event => onModeChange(event.target.value)}>
        <option value="color">色块</option><option value="texture">贴图</option>
      </select></label>
      <input ref={input} className="file-input" type="file" multiple accept=".xnb,.png" aria-label="选择游戏贴图文件" disabled={disabled || loading} onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) load(files); }} />
      <button disabled={disabled || loading} onClick={() => input.current.click()}>选择游戏资源</button>
      <button disabled={disabled || (!loading && !resources.images.size)} onClick={() => { sequence.current++; resources.clear(); onResourcesChange(); setLoading(false); setErrors([]); setStatus('资源已释放，继续使用色块显示。'); }}>{loading ? '取消加载' : '清除资源'}</button>
    </div>
    <p role="status" aria-label="贴图加载状态">{status}</p>
    {errors.length > 0 && <p className="texture-errors" role="alert">{errors.join('；')}</p>}
    <details><summary>资源与显示范围</summary><p>从 Terraria 的 Content/Images 目录选择 Tiles_0、Tiles_1、Tiles_2、Tiles_3.xnb（可多选），也接受同名 PNG。文件仅在本机读取，关闭世界后释放。</p><p>当前覆盖泥土、石块、森林草地和短植物；缩小、缺图和未支持的接缝、坡面、涂料、家具等使用色块。</p></details>
  </section>;
}
