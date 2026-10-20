import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WorldSession } from '../world/WorldSession.js';
import { downloadWorld } from '../platform/files/downloadWorld.js';
import MapView from '../map/MapView.jsx';
import './App.css';

const modes = ['经典', '专家', '大师', '旅行'];
const emptyEditState = { revision: 0, dirty: false, undoCount: 0, redoCount: 0 };

export default function App() {
  const session = useRef(null);
  if (!session.current) session.current = new WorldSession();
  const input = useRef(null);
  const operation = useRef(0);
  const [summary, setSummary] = useState(null);
  const [filename, setFilename] = useState('');
  const [phase, setPhase] = useState(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editState, setEditState] = useState(emptyEditState);
  const [drafting, setDrafting] = useState(false);
  const unsaved = editState.dirty || drafting || ['paint', 'erase', 'fillSelection', 'eraseSelection'].includes(phase);

  useEffect(() => {
    if (!unsaved) return;
    const warn = event => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  useEffect(() => () => {
    operation.current++;
    session.current.close();
  }, []);

  async function run(action, file) {
    const current = ++operation.current;
    setError('');
    setNotice('');
    setPercent(0);
    setPhase(action);
    if (action === 'open') {
      setSummary(null);
      setFilename('');
      setEditState(emptyEditState);
      setDrafting(false);
    }
    const onProgress = value => {
      if (current === operation.current) setPercent(value);
    };
    try {
      if (action === 'open') {
        const result = await session.current.open(file, onProgress);
        if (current !== operation.current) return;
        setSummary(result.summary);
        setFilename(file.name);
        setEditState(result.editState);
      } else if (action === 'pick') {
        const result = await session.current.pick(file);
        if (current !== operation.current) return;
        return result.tile;
      } else if (action === 'export') {
        const result = await session.current.export(onProgress);
        if (current !== operation.current) return;
        downloadWorld(result.buffer, result.filename);
        setEditState(result.editState);
        setNotice('已生成世界副本，原文件未被覆盖。');
      } else {
        const result = await session.current.edit(action, file);
        if (current !== operation.current) return;
        setEditState(result.editState);
        const { changed, skipped } = result.editState;
        const verb = { undo: '已撤销', redo: '已重做', erase: '已擦除', eraseSelection: '已擦除', fillSelection: '已填充', paint: '已绘制' }[action];
        setNotice(`${verb} ${changed} 格。${skipped ? `跳过 ${skipped} 格受保护图格。` : ''}`);
      }
    } catch (failure) {
      if (current !== operation.current) return;
      if (!session.current.loaded) {
        setSummary(null);
        setFilename('');
        setEditState(emptyEditState);
      }
      setError(failure.message);
    } finally {
      if (current === operation.current) setPhase(null);
    }
  }

  function close() {
    if (unsaved && !window.confirm('当前有尚未导出的修改，关闭后会丢失。仍要关闭吗？')) return;
    const wasBusy = Boolean(phase);
    operation.current++;
    session.current.close();
    setSummary(null);
    setFilename('');
    setPhase(null);
    setEditState(emptyEditState);
    setDrafting(false);
    setError('');
    setNotice(wasBusy ? '操作已取消，可以重新选择世界。' : '世界已关闭。');
  }

  const handleMapError = useCallback(failure => {
    operation.current++;
    session.current.close();
    setSummary(null);
    setFilename('');
    setPhase(null);
    setEditState(emptyEditState);
    setDrafting(false);
    setError(failure.message);
  }, []);
  return (
    <div className={`app-shell${summary ? ' has-world' : ''}`}>
      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Terraria Editor</span>
        </a>
        <span className="language">简体中文</span>
      </header>
      <main className="welcome" aria-labelledby="page-title">
        <p className="availability">世界文件 · 方块与墙壁编辑</p>
        <h1 id="page-title">泰拉瑞亚地图编辑器</h1>
        <p className="description">在浏览器中查看地图，搜索中文材料、绘制方块与墙壁，框选填充或擦除区域，再导出世界副本。</p>
        <div className="file-actions">
          <input ref={input} className="file-input" type="file" accept=".wld" aria-label="选择世界文件" disabled={Boolean(phase) || drafting} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) run('open', file);
          }} />
          <button className="primary" disabled={Boolean(phase) || drafting} onClick={() => {
            if (!unsaved || window.confirm('当前有尚未导出的修改，打开其他世界后会丢失。仍要继续吗？')) input.current.click();
          }}>{summary ? '选择其他世界' : '打开世界文件'}</button>
          {summary && !phase && <button disabled={drafting} onClick={() => run('export')}>{editState.revision === 0 ? '导出未修改副本' : '导出世界副本'}</button>}
          {(summary || phase) && <button className="quiet" onClick={close}>{phase ? '取消操作' : '关闭世界'}</button>}
        </div>
        <p className="file-hint">选择 .wld 文件 · 存档仅在本机浏览器中处理，不会上传。</p>
        {summary && <p className={unsaved ? 'save-state unsaved' : 'save-state'} role="status">{unsaved ? '有尚未导出的修改' : '当前没有待导出的修改'}</p>}
        <div className="messages" aria-live="polite" aria-atomic="true">
          {phase && <div className="progress-state" role="status">
            <span>{phase === 'open' ? '正在读取世界' : phase === 'export' ? '正在生成并校验副本' : phase === 'pick' ? '正在读取图格' : '正在应用编辑'}{['open', 'export'].includes(phase) ? ` · ${percent}%` : '…'}</span>
            {['open', 'export'].includes(phase) && <progress value={percent} max="100" aria-label={phase === 'open' ? '读取进度' : '导出进度'} />}
          </div>}
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
        </div>
        {summary && <MapView session={session.current} world={summary} disabled={Boolean(phase)} onError={handleMapError} editState={editState} onEdit={run} onDraftChange={setDrafting} />}
        {summary && <section className="world-card" aria-labelledby="world-name" aria-busy={Boolean(phase)}>
          <p className="filename">{filename}</p>
          <h2 id="world-name">{summary.name}</h2>
          <dl className="world-details">
            <div><dt>世界尺寸</dt><dd>{summary.width} × {summary.height} 格</dd></div>
            <div><dt>难度</dt><dd>{modes[summary.gameMode] ?? '未知'}</dd></div>
            <div><dt>出生点</dt><dd>X {summary.spawn.x} · Y {summary.spawn.y}</dd></div>
            <div><dt>文件格式版本</dt><dd>{summary.formatVersion}</dd></div>
            <div><dt>世界 ID</dt><dd>{summary.worldId}</dd></div>
            <div><dt>箱子 / 告示牌</dt><dd>{summary.counts.chests} / {summary.counts.signs}</dd></div>
            <div><dt>城镇 NPC / 图格实体</dt><dd>{summary.counts.npcs} / {summary.counts.tileEntities}</dd></div>
            {summary.seed && <div className="wide"><dt>世界种子</dt><dd>{summary.seed}</dd></div>}
          </dl>
          <p className="card-note">请保留原始存档。首次编辑前检查读写保真，修改后导出时核对未编辑的存档区段。请使用副本进行游戏内测试。</p>
        </section>}
      </main>
      <footer className="app-footer">
        <a href="https://github.com/woshimaxfive/terraria-editor-zh" target="_blank" rel="noreferrer">项目源码</a>
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">开源许可</a>
      </footer>
    </div>
  );
}
