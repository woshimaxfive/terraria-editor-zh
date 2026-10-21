import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WorldSession } from '../world/WorldSession.js';
import { downloadWorld } from '../platform/files/downloadWorld.js';
import { readTemplate } from '../platform/files/templateFile.js';
import { encodeTemplate, TEMPLATE_EXTENSION } from '../editing/template.js';
import { transformClipboard } from '../editing/clipboard.js';
import MapView from '../map/MapView.jsx';
import Icon from './Icon.jsx';
import EditorMenu from './EditorMenu.jsx';
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
  const [clipboard, setClipboard] = useState(null);
  const [menuHost, setMenuHost] = useState(null);
  const unsaved = editState.dirty || drafting || ['paint', 'erase', 'fillSelection', 'eraseSelection', 'paste', 'commitFill'].includes(phase);

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
      } else if (action === 'copy') {
        const result = await session.current.copy(file.selection);
        if (current !== operation.current) return;
        setClipboard({ data: result.clipboard, image: result.image, source: summary.name });
        setNotice(`已复制 ${result.clipboard.width} × ${result.clipboard.height} 格，可预览后确认粘贴。`);
      } else if (action === 'transformClipboard' || action === 'importTemplate') {
        const data = action === 'importTemplate' ? await readTemplate(file) : transformClipboard(clipboard.data, file);
        if (current !== operation.current) return;
        const result = await session.current.prepareClipboard(data);
        if (current !== operation.current) return;
        setClipboard({ data: result.clipboard, image: result.image, source: action === 'importTemplate' ? file.name : clipboard.source });
        setNotice(`${action === 'importTemplate' ? '已导入模板' : '已变换复制内容'}：${data.width} × ${data.height} 格；确认粘贴前不会修改世界。`);
      } else if (action === 'exportTemplate') {
        const bytes = encodeTemplate(clipboard.data);
        downloadWorld(bytes, `建筑模板-${clipboard.data.width}x${clipboard.data.height}${TEMPLATE_EXTENSION}`);
        setNotice('已导出建筑模板；世界的未导出状态保持不变。');
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
        const { changed, skipped, filtered } = result.editState;
        const verb = { undo: '已撤销', redo: '已重做', erase: '已擦除', eraseSelection: '已擦除', fillSelection: '已填充', commitFill: '已填充', paint: '已绘制', paste: '已粘贴' }[action];
        setNotice(`${verb} ${changed} 格。${skipped ? `跳过 ${skipped} 格受保护图格。` : ''}${filtered ? `${filtered} 格不符合匹配条件。` : ''}`);
        return result.editState;
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
  const fileActions = <div className="file-actions" role="group" aria-label="世界文件">
    <input ref={input} className="file-input" type="file" accept=".wld" aria-label="选择世界文件" disabled={Boolean(phase) || drafting} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) run('open', file);
    }} />
    <button className="primary" aria-label={summary ? '选择其他世界' : '打开世界文件'} title={summary ? '选择其他世界' : '打开世界文件'} disabled={Boolean(phase) || drafting} onClick={() => {
      if (!unsaved || window.confirm('当前有尚未导出的修改，打开其他世界后会丢失。仍要继续吗？')) input.current.click();
    }}><Icon name="open" /><span>{summary ? '打开' : '打开世界文件'}</span></button>
    {summary && <button className="export-button" aria-label={editState.revision === 0 ? '导出未修改副本' : '导出世界副本'} title="导出世界副本" disabled={drafting || Boolean(phase)} onClick={() => run('export')}><Icon name="save" /><span>导出副本</span></button>}
    {(summary || phase) && <button className="quiet" aria-label={phase ? '取消操作' : '关闭世界'} title={phase ? '取消操作' : '关闭世界'} onClick={close}><Icon name="close" /><span>{phase ? '取消操作' : '关闭'}</span></button>}
  </div>;
  const worldDetails = summary && <section className="world-card" aria-labelledby="world-name" aria-busy={Boolean(phase)}>
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
      {summary.seed && <div><dt>世界种子</dt><dd>{summary.seed}</dd></div>}
    </dl>
    <p className="card-note">使用副本进行游戏内测试，保留原始存档。</p>
  </section>;
  return (
    <div className={`app-shell${summary ? ' has-world' : ''}`}>
      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="泰拉瑞亚地图编辑器">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Terraria Editor</span>
        </a>
        {summary && <nav className="app-menu-bar" aria-label="编辑器菜单">
          <EditorMenu label="文件" disabled={Boolean(phase) || drafting}>
            <button data-menu-command onClick={() => {
              if (!unsaved || window.confirm('当前有尚未导出的修改，打开其他世界后会丢失。仍要继续吗？')) input.current.click();
            }}><Icon name="open" />打开世界…</button>
            <button data-menu-command onClick={() => run('export')}><Icon name="save" />导出世界副本</button>
            <hr /><button data-menu-command onClick={close}><Icon name="close" />关闭世界</button>
          </EditorMenu>
          <span className="map-menu-host" ref={setMenuHost} />
        </nav>}
        {summary ? <><div className="document-title"><span title={filename}>{summary.name}</span><span className={unsaved ? 'save-state unsaved' : 'save-state'} role="status">{unsaved ? '修改未导出' : editState.revision === 0 ? '未修改' : '修改已导出'}</span></div>{fileActions}</> : <span className="language">简体中文 · 浏览器编辑器</span>}
      </header>
      <main className="welcome" aria-labelledby="page-title">
        {!summary && <div className="welcome-intro">
          <p className="availability">你的世界，在浏览器中编辑</p>
          <h1 id="page-title">泰拉瑞亚<br />地图编辑器</h1>
          <p className="description">打开世界，挑选材料，继续你的建造。支持方块、墙壁、区域编辑和建筑模板。</p>
        </div>}
        {summary && <h1 id="page-title" className="sr-only">泰拉瑞亚地图编辑器</h1>}
        {!summary && fileActions}
        {!summary && <p className="file-hint">选择 .wld 文件 · 在本机处理，存档不会上传。</p>}
        <div className="messages" aria-live="polite" aria-atomic="true">
          {phase && <div className="progress-state" role="status">
            <span>{phase === 'open' ? '正在读取世界' : phase === 'export' ? '正在生成并校验副本' : phase === 'pick' ? '正在读取图格' : phase === 'copy' ? '正在复制选区' : phase === 'transformClipboard' ? '正在变换复制内容' : phase === 'importTemplate' ? '正在检查模板' : phase === 'exportTemplate' ? '正在导出模板' : '正在应用编辑'}{['open', 'export'].includes(phase) ? ` · ${percent}%` : '…'}</span>
            {['open', 'export'].includes(phase) && <progress value={percent} max="100" aria-label={phase === 'open' ? '读取进度' : '导出进度'} />}
          </div>}
          {error && <div className="message error" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><Icon name="close" size={14} /></button></div>}
          {notice && <div className="message notice" role="status"><span>{notice}</span><button aria-label="关闭操作提示" onClick={() => setNotice('')}><Icon name="close" size={14} /></button></div>}
        </div>
        {summary && <MapView session={session.current} world={summary} disabled={Boolean(phase)} onError={handleMapError} editState={editState} onEdit={run} onDraftChange={setDrafting} clipboard={clipboard} worldDetails={worldDetails} menuHost={menuHost} />}
      </main>
      <footer className="app-footer">
        <a href="https://github.com/woshimaxfive/terraria-editor-zh" target="_blank" rel="noreferrer">项目源码</a>
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">开源许可</a>
      </footer>
    </div>
  );
}
