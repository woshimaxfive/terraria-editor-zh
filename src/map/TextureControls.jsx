import React, { useEffect, useRef, useState } from 'react';

export default function TextureControls({ resources, cache, mode, onModeChange, onResourcesChange, disabled }) {
  const input = useRef(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('选择本机游戏资源后，可放大查看地形贴图。');
  const [errors, setErrors] = useState([]);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function load(files) {
    const current = ++sequence.current;
    setLoading(true); setErrors([]);
    try {
      const pending = resources.load(files, text => { if (current === sequence.current) setStatus(text); }, { defer:true, append:true });
      onResourcesChange();
      const result = await pending;
      if (current !== sequence.current) return;
      onResourcesChange();
      if (result.selected) onModeChange('texture');
      setStatus(result.selected ? `已选择 ${result.selected} 张资源，放大后按可见区域加载。` : '没有可用贴图，继续使用色块显示。');
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
      <button disabled={disabled || (!loading && !resources.files.size)} onClick={() => { sequence.current++; resources.clear(); onResourcesChange(); setLoading(false); setErrors([]); setStatus('资源已释放，继续使用色块显示。'); }}>{loading || cache?.loading ? '取消加载' : '清除资源'}</button>
    </div>
    <p role="status" aria-label="贴图加载状态">{status}</p>
    {cache && <p aria-label="贴图缓存状态">{cache.loading ? cache.message || '正在加载可见贴图…' : `已缓存 ${resources.images.size} 张 · ${(resources.bytes / 1024 / 1024).toFixed(2)} / 12 MiB`}</p>}
    {[...errors,...(cache?.failures || [])].length > 0 && <p className="texture-errors" role="alert">{[...errors,...(cache?.failures || [])].join('；')}</p>}
    <details><summary>资源与显示范围</summary><p>从 Terraria 的 Content/Images 目录多选图格、树木、物品及装备的 XNB 文件，也接受同名 PNG。可再次选择以追加资源；同名贴图会替换。身体装备位于 Images/Armor 子目录，可分次选择。圣物、滴管和圣诞树还需对应的 Extra、Gore 和 Xmas 资源；仙人掌变种需 Good_Cactus、Evil_Cactus 和 Crimson_Cactus。文件保留在本机，关闭世界后释放。</p><p>当前覆盖 341 种普通地形、376 种通用家具和植物、13 类树木，以及 20 类专用家具与内容，并支持普通平台、轨道、仙人掌和训练假人。物品框、人体模型、武器架、帽架、食物盘和物品瓶可显示物品或装备，修改内容及撤销重做后同步刷新。树木随土壤及世界背景变化，仙人掌按整株邻接和根部沙地选图；按可见区域加载，贴图缓存最多 12 MiB。缩小、缺图、未收敛接缝、坡面和涂料等使用色块；装备染料与饰品尚未显示。</p></details>
  </section>;
}
