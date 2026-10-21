import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { constrainCamera, fitCamera, screenToWorld, visibleRegion, zoomCamera } from '../rendering/viewport.js';
import { BRUSH_SIZES, BrushStroke } from '../editing/brush.js';
import { selectionFromPoints } from '../editing/selection.js';
import MaterialPicker from './MaterialPicker.jsx';
import LiquidPicker from './LiquidPicker.jsx';
import { sampledLiquidAmount } from '../editing/liquids.js';
import { pasteFits } from '../editing/clipboard.js';
import Icon from '../app/Icon.jsx';
import TextureControls from './TextureControls.jsx';
import { TextureResources } from '../platform/files/TextureResources.js';
import EditorMenu from '../app/EditorMenu.jsx';

const MAX_CANVAS_PIXELS = 4 * 1024 * 1024;

export default function MapView({ session, world, disabled, onError, editState, onEdit, onDraftChange, clipboard, worldDetails, menuHost }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const resourcesRef = useRef(null);
  if (!resourcesRef.current) resourcesRef.current = new TextureResources();
  const [displayMode, setDisplayMode] = useState('color');
  const [resourceRevision, setResourceRevision] = useState(0);
  const [textureStats, setTextureStats] = useState(null);
  const pointers = useRef(new Map());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [drawing, setDrawing] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [tool, setTool] = useState('pan');
  const [blockId, setBlockId] = useState(1);
  const [wallId, setWallId] = useState(1);
  const [liquidType, setLiquidType] = useState(1);
  const [liquidAmount, setLiquidAmount] = useState(255);
  const [layer, setLayer] = useState('block');
  const [layers, setLayers] = useState({ block: true, wall: true, liquid: true });
  const [sample, setSample] = useState(null);
  const [brushSize, setBrushSize] = useState(1);
  const [drafting, setDrafting] = useState(false);
  const [selection, setSelection] = useState(null);
  const [selectionPreview, setSelectionPreview] = useState(null);
  const [hint, setHint] = useState('');
  const [pastePosition, setPastePosition] = useState(null);
  const [placing, setPlacing] = useState(false);
  const pasteRef = useRef(null);
  const pasteDragRef = useRef(null);
  const clipboardImageRef = useRef(null);
  const templateInputRef = useRef(null);
  const thumbnailRef = useRef(null);
  const [panel, setPanel] = useState('materials');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 900);
  const panelToggleRef = useRef(null);
  pasteRef.current = tool === 'paste' ? pastePosition : null;
  const strokeRef = useRef(null);
  const pickRef = useRef(null);
  const selectionRef = useRef(null);
  const selectionDraftRef = useRef(null);
  const mountedRef = useRef(false);
  const hoverRef = useRef(null);
  const frameRef = useRef(0);
  const brush = useRef({ tool, blockId, brushSize });
  brush.current = { tool, blockId, brushSize };
  const current = useRef({ size, camera });
  current.current = { size, camera };

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 900px)');
    const collapse = event => { if (event.matches) setPanelOpen(false); };
    narrow.addEventListener('change', collapse);
    return () => narrow.removeEventListener('change', collapse);
  }, []);

  const changeCamera = useCallback(next => {
    current.current.camera = next;
    setDrawing(true);
    setCamera(next);
  }, []);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) };
      if (next.width < 1 || next.height < 1) return;
      pickRef.current = null;
      pasteDragRef.current = null;
      setPlacing(false);
      if (pasteRef.current) { pasteRef.current = null; setPastePosition(null); setTool('pan'); }
      selectionDraftRef.current = null;
      setSelectionPreview(null);
      if (strokeRef.current) {
        strokeRef.current = null;
        setDrafting(false);
        onDraftChange(false);
      }
      setSize(next);
      changeCamera(current.current.camera ? constrainCamera(current.current.camera, next, world) : fitCamera(next, world));
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [world, changeCamera, onDraftChange]);

  const draw = useCallback(() => {
    if (!camera || !size.width) return;
    const canvas = canvasRef.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height)));
    const width = Math.max(1, Math.floor(size.width * ratio)), height = Math.max(1, Math.floor(size.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    context.setTransform(width / size.width, 0, 0, height / size.height, 0, 0);
    context.fillStyle = '#0d1511';
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingEnabled = false;
    const image = imageRef.current;
    if (image) {
      const x = (image.x - camera.x) * camera.zoom + size.width / 2;
      const y = (image.y - camera.y) * camera.zoom + size.height / 2;
      context.save();
      context.beginPath();
      context.rect(x, y, image.width * camera.zoom, image.height * camera.zoom);
      context.clip();
      context.drawImage(image.canvas, x, y, image.imageWidth * image.step * camera.zoom, image.imageHeight * image.step * camera.zoom);
      if (image.sprites) {
        const commands = image.sprites;
        for (let i = 0; i < commands.length; i += 8) {
          const atlas = resourcesRef.current.images.get(commands[i]);
          if (!atlas) continue;
          context.drawImage(atlas, commands[i + 1], commands[i + 2], commands[i + 3], commands[i + 4],
            x + commands[i + 5] * camera.zoom, y + (commands[i + 6] + commands[i + 7] / 16) * camera.zoom,
            commands[i + 3] / 16 * camera.zoom, commands[i + 4] / 16 * camera.zoom);
        }
      }
      context.restore();
    }
    const spawnX = (world.spawn.x + .5 - camera.x) * camera.zoom + size.width / 2;
    const spawnY = (world.spawn.y + .5 - camera.y) * camera.zoom + size.height / 2;
    if (spawnX >= 0 && spawnX <= size.width && spawnY >= 0 && spawnY <= size.height) {
      context.strokeStyle = '#17221b';
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(spawnX - 7, spawnY); context.lineTo(spawnX + 7, spawnY);
      context.moveTo(spawnX, spawnY - 7); context.lineTo(spawnX, spawnY + 7);
      context.stroke();
      context.strokeStyle = '#ffe199';
      context.lineWidth = 2;
      context.stroke();
    }
    const toX = x => (x - camera.x) * camera.zoom + size.width / 2;
    const toY = y => (y - camera.y) * camera.zoom + size.height / 2;
    const selected = selectionDraftRef.current?.rectangle || selectionRef.current;
    if (selected) {
      context.fillStyle = '#79c9ff20';
      context.fillRect(toX(selected.x), toY(selected.y), selected.width * camera.zoom, selected.height * camera.zoom);
      context.strokeStyle = '#9ed7ff';
      context.lineWidth = 1.5;
      context.setLineDash([6, 4]);
      context.strokeRect(toX(selected.x), toY(selected.y), selected.width * camera.zoom, selected.height * camera.zoom);
      context.setLineDash([]);
    }
    if (strokeRef.current) {
      context.fillStyle = strokeRef.current.tool === 'erase' ? '#ff927980' : '#ffe19980';
      for (const index of strokeRef.current.stroke.cells) {
        context.fillRect(toX(Math.floor(index / world.height)), toY(index % world.height), camera.zoom, camera.zoom);
      }
    }
    const position = pasteRef.current;
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && clipboardImageRef.current) {
      const preview = clipboardImageRef.current;
      context.save();
      context.globalAlpha = .65;
      context.drawImage(preview, toX(position.x), toY(position.y), preview.width * camera.zoom, preview.height * camera.zoom);
      context.restore();
      context.strokeStyle = pasteFits({ width: preview.width, height: preview.height }, position, world) ? '#ffe199' : '#ff9279';
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.strokeRect(toX(position.x), toY(position.y), preview.width * camera.zoom, preview.height * camera.zoom);
      context.setLineDash([]);
    }
    if (hoverRef.current && !['pan', 'paste'].includes(brush.current.tool) && camera.zoom >= 2) {
      const size = ['pick', 'select'].includes(brush.current.tool) ? 1 : brush.current.brushSize;
      const radius = (size - 1) / 2;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1;
      context.strokeRect(toX(hoverRef.current.x - radius), toY(hoverRef.current.y - radius), size * camera.zoom, size * camera.zoom);
    }
  }, [camera, size, world]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  useEffect(() => { draw(); }, [tool, brushSize, draw]);
  useEffect(() => { draw(); }, [pastePosition, draw]);

  useEffect(() => {
    if (!clipboard) return;
    const image = clipboard.image, canvas = document.createElement('canvas');
    canvas.width = image.imageWidth; canvas.height = image.imageHeight;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.buffer), image.imageWidth, image.imageHeight), 0, 0);
    clipboardImageRef.current = canvas;
    if (thumbnailRef.current) {
      thumbnailRef.current.width = canvas.width;
      thumbnailRef.current.height = canvas.height;
      thumbnailRef.current.getContext('2d').drawImage(canvas, 0, 0);
    }
    draw();
    return () => { canvas.width = 0; clipboardImageRef.current = null; };
  }, [clipboard, draw]);

  useLayoutEffect(() => {
    if (!camera || !size.width || disabled) return;
    let active = true;
    setDrawing(true);
    const timer = setTimeout(async () => {
      try {
        const { image } = await session.render({ ...visibleRegion(camera, size, world), layers,
          ...(displayMode === 'texture' && camera.zoom >= 4 ? { atlases: resourcesRef.current.atlases } : {}) });
        if (!active) return;
        const canvas = document.createElement('canvas');
        canvas.width = image.imageWidth;
        canvas.height = image.imageHeight;
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.buffer), image.imageWidth, image.imageHeight), 0, 0);
        const previous = imageRef.current;
        imageRef.current = { ...image, buffer: undefined, sprites: image.sprites ? new Int32Array(image.sprites) : null, canvas };
        setTextureStats(image.textureStats ?? null);
        if (previous) previous.canvas.width = 0;
        draw();
        setDrawing(false);
      } catch (error) {
        if (active && error.name !== 'AbortError') onError(error);
      }
    }, 50);
    return () => { active = false; clearTimeout(timer); };
  }, [camera, size, disabled, session, world, draw, onError, editState.revision, layers, displayMode, resourceRevision]);

  useEffect(() => { setSample(null); }, [editState.revision]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resourcesRef.current.clear();
      if (imageRef.current) imageRef.current.canvas.width = 0;
      imageRef.current = null;
      pointers.current.clear();
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const redraw = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(draw);
  };

  const pointOf = event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const showCoordinates = (point, view = current.current.camera) => {
    if (!view) return;
    const position = screenToWorld(point, view, current.current.size);
    const x = Math.floor(position.x), y = Math.floor(position.y);
    const cell = x >= 0 && y >= 0 && x < world.width && y < world.height ? { x, y } : null;
    hoverRef.current = cell;
    setCoordinates(cell);
    redraw();
    return cell;
  };
  const cancelStroke = () => {
    strokeRef.current = null;
    pickRef.current = null;
    selectionDraftRef.current = null;
    setSelectionPreview(null);
    setDrafting(false);
    onDraftChange(false);
    redraw();
  };
  const cancelPaste = () => {
    pasteRef.current = null;
    pasteDragRef.current = null;
    setPastePosition(null);
    setPlacing(false);
    setTool('pan');
    setHint('');
    redraw();
  };
  const startPaste = () => {
    if (!clipboard || clipboard.data.formatVersion !== world.formatVersion) return;
    setLayers({ block: true, wall: true, liquid: true });
    const position = { x: Math.floor(current.current.camera.x), y: Math.floor(current.current.camera.y) };
    pasteRef.current = position;
    setPastePosition(position);
    setTool('paste');
    setPanel('templates');
    setHint('');
    if (window.matchMedia('(max-width: 900px)').matches) setPanelOpen(false);
  };
  const confirmPaste = async () => {
    if (disabled || placing || tool !== 'paste' || !pasteFits(clipboard?.data, pastePosition, world) || !Object.values(layers).every(Boolean)) return;
    const result = await onEdit('paste', { clipboard: clipboard.data, position: pastePosition });
    if (result && mountedRef.current) cancelPaste();
  };
  const clearSelection = () => {
    selectionRef.current = null;
    setSelection(null);
    setHint('');
    redraw();
  };
  const extendSelection = point => {
    const position = screenToWorld(point, current.current.camera, current.current.size);
    const draft = selectionDraftRef.current;
    draft.rectangle = selectionFromPoints(draft.start, { x: Math.floor(position.x), y: Math.floor(position.y) }, world);
    setSelectionPreview(draft.rectangle);
    showCoordinates(point);
    redraw();
  };
  const extendStroke = point => {
    const cell = showCoordinates(point);
    if (!cell) { strokeRef.current.stroke.previous = null; return; }
    try { strokeRef.current.stroke.add(cell); }
    catch (error) { setHint(error.message); cancelStroke(); }
    redraw();
  };
  const zoomAt = (factor, point) => {
    const { camera: view, size: dimensions } = current.current;
    if (!view || disabled) return;
    changeCamera(zoomCamera(view, factor, point || { x: dimensions.width / 2, y: dimensions.height / 2 }, dimensions, world));
    hoverRef.current = null;
    setCoordinates(null);
  };

  const pickBlock = async point => {
    const tile = await onEdit('pick', point);
    if (!tile || !mountedRef.current) return;
    setSample(tile);
    const label = tile.layer === 'liquid' ? '液体' : tile.layer === 'wall' ? '墙壁' : '方块';
    if (tile.materialId === null) setHint(`此处没有${label}，未更改画笔材料。`);
    else if (!tile.paintable) setHint(`${tile.name}${tile.special ? ' 是特殊图格' : ''}，当前画笔暂不支持，未更改材料。`);
    else {
      if (tile.layer === 'liquid') { setLiquidType(tile.materialId); setLiquidAmount(sampledLiquidAmount(tile.properties.liquidAmount)); }
      else if (tile.layer === 'wall') setWallId(tile.materialId);
      else setBlockId(tile.materialId);
      setTool('paint');
      setHint(`已选取${tile.name}（ID ${tile.materialId}），已切换到画笔。`);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wheel = event => {
      if (disabled) return;
      event.preventDefault();
      if (strokeRef.current || selectionDraftRef.current) return;
      pickRef.current = null;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? current.current.size.height : 1);
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const view = current.current;
      if (view.camera) {
        const next = zoomCamera(view.camera, Math.exp(-Math.max(-300, Math.min(300, delta)) * .003), point, view.size, world);
        changeCamera(next);
        const position = screenToWorld(point, next, view.size);
        const x = Math.floor(position.x), y = Math.floor(position.y);
        const cell = x >= 0 && y >= 0 && x < world.width && y < world.height ? { x, y } : null;
        hoverRef.current = cell;
        setCoordinates(cell);
      }
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [disabled, world, changeCamera]);

  function move(event) {
    const point = pointOf(event);
    const previous = pointers.current.get(event.pointerId);
    const { camera: view, size: dimensions } = current.current;
    if (!view) return;
    if (pasteDragRef.current?.pointerId === event.pointerId && !disabled) {
      pointers.current.set(event.pointerId, point);
      const position = screenToWorld(point, view, dimensions);
      pasteRef.current = { x: Math.floor(position.x), y: Math.floor(position.y) };
      setPastePosition(pasteRef.current);
      showCoordinates(point);
      return;
    }
    if (selectionDraftRef.current?.pointerId === event.pointerId && !disabled) {
      pointers.current.set(event.pointerId, point);
      extendSelection(point);
      return;
    }
    if (pickRef.current?.pointerId === event.pointerId) {
      if (Math.hypot(point.x - pickRef.current.start.x, point.y - pickRef.current.start.y) <= 6) {
        pointers.current.set(event.pointerId, point);
        showCoordinates(point);
        return;
      }
      pickRef.current = null;
    }
    if (strokeRef.current && strokeRef.current.pointerId === event.pointerId && !disabled) {
      pointers.current.set(event.pointerId, point);
      extendStroke(point);
      return;
    }
    let next = view;
    if (previous && !disabled) {
      const oldPoints = [...pointers.current.values()];
      pointers.current.set(event.pointerId, point);
      const newPoints = [...pointers.current.values()];
      if (oldPoints.length === 2) {
        const middle = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
        const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const before = middle(oldPoints), after = middle(newPoints);
        const moved = { ...view, x: view.x - (after.x - before.x) / view.zoom, y: view.y - (after.y - before.y) / view.zoom };
        next = zoomCamera(moved, distance(newPoints) / Math.max(1, distance(oldPoints)), after, dimensions, world);
      } else {
        next = constrainCamera({ ...view, x: view.x - (point.x - previous.x) / view.zoom, y: view.y - (point.y - previous.y) / view.zoom }, dimensions, world);
      }
      changeCamera(next);
    }
    showCoordinates(point, next);
  }

  function release(event) {
    if (pasteDragRef.current?.pointerId === event.pointerId) {
      if (event.type === 'pointerup' && !disabled) move(event);
      else { pasteRef.current = pasteDragRef.current.before; setPastePosition(pasteRef.current); }
      pasteDragRef.current = null;
      setPlacing(false);
    }
    if (event.type === 'pointerup' && (strokeRef.current || pickRef.current || selectionDraftRef.current)) setHint('');
    if (selectionDraftRef.current?.pointerId === event.pointerId) {
      if (event.type === 'pointerup' && !disabled) {
        extendSelection(pointOf(event));
        selectionRef.current = selectionDraftRef.current.rectangle;
        setSelection(selectionRef.current);
      }
      cancelStroke();
    }
    const pick = pickRef.current;
    pickRef.current = null;
    if (pick?.pointerId === event.pointerId && event.type === 'pointerup' && !disabled) {
      const point = pointOf(event);
      if (Math.hypot(point.x - pick.start.x, point.y - pick.start.y) <= 6) pickBlock({ ...pick.cell, layer: pick.layer });
    }
    const draft = strokeRef.current;
    if (draft?.pointerId === event.pointerId) {
      if (event.type === 'pointerup' && !disabled) extendStroke(pointOf(event));
      const commit = strokeRef.current;
      cancelStroke();
      if (event.type === 'pointerup' && commit?.stroke.cells.size && !disabled) {
        onEdit(commit.tool, { cells: [...commit.stroke.cells], blockId: commit.blockId, wallId: commit.wallId, liquidType: commit.liquidType, liquidAmount: commit.liquidAmount, layer: commit.layer });
      }
    }
    pointers.current.delete(event.pointerId);
    setDragging(pointers.current.size > 0);
    if (canvasRef.current.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  }

  const interacting = drafting || Boolean(selectionPreview) || placing;
  const panelLocked = interacting || (tool === 'paste' && window.innerWidth > 900);
  const displayedSelection = selectionPreview || selection;
  const showPanel = name => { setPanel(name); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); panelToggleRef.current?.focus({ preventScroll: true }); };
  const toolName = { pan: '平移', paint: '画笔', erase: '橡皮', pick: '吸管', select: '框选', paste: '粘贴' }[tool];
  const usesBrush = tool === 'paint' || tool === 'erase';
  const usesLayer = usesBrush || tool === 'pick' || tool === 'select' || (selection && tool !== 'paste');
  return <section className={`map-view${panelOpen ? ' panel-open' : ''}`} aria-labelledby="map-title">
    {menuHost && createPortal(<>
      <EditorMenu label="编辑" disabled={disabled || interacting}>
        <button data-menu-command disabled={!editState.undoCount} onClick={() => onEdit('undo')}><Icon name="undo" />撤销<kbd>Ctrl Z</kbd></button>
        <button data-menu-command disabled={!editState.redoCount} onClick={() => onEdit('redo')}><Icon name="redo" />重做<kbd>Ctrl Y</kbd></button>
        <hr />
        <button data-menu-command disabled={!selection || tool === 'paste'} onClick={() => { onEdit('copy', { selection }); showPanel('templates'); }}><Icon name="copy" />复制选区<kbd>Ctrl C</kbd></button>
        <button data-menu-command disabled={!clipboard || tool === 'paste' || clipboard.data.formatVersion !== world.formatVersion} onClick={startPaste}><Icon name="paste" />粘贴预览<kbd>Ctrl V</kbd></button>
        <button data-menu-command disabled={!selection} onClick={clearSelection}>清除选区<kbd>Esc</kbd></button>
      </EditorMenu>
      <EditorMenu label="图层" disabled={disabled || interacting}>
        {[['block', '方块'], ['wall', '墙壁'], ['liquid', '液体']].map(([id, name]) => <button key={id} aria-pressed={layers[id]} onClick={() => setLayers(previous => ({ ...previous, [id]: !previous[id] }))}><span className="menu-check" aria-hidden="true">{layers[id] ? '✓' : ''}</span>{name}</button>)}
        <hr /><button data-menu-command onClick={() => showPanel('view')}><Icon name="layers" />贴图与显示设置…</button>
      </EditorMenu>
      <EditorMenu label="帮助" disabled={interacting || panelLocked}>
        <button data-menu-command onClick={() => showPanel('help')}><Icon name="help" />操作与快捷键</button>
        <a data-menu-command href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">开源许可</a>
      </EditorMenu>
    </>, menuHost)}
    <h2 id="map-title" className="sr-only">地图工作区</h2>
    <div className="action-bar" aria-label="编辑参数">
      <div className="tool-context"><span className="current-tool">{toolName}</span>
      <label hidden={!usesLayer}><span className="context-label">图层</span><select aria-label="编辑图层" value={layer} disabled={disabled || interacting} onChange={event => { setLayer(event.target.value); setHint(''); }}>
        <option value="block">方块</option><option value="wall">墙壁</option><option value="liquid">液体</option>
      </select></label>
      <label hidden={!usesBrush}><span className="context-label">尺寸</span><select aria-label="画笔尺寸" value={brushSize} disabled={disabled || interacting} onChange={event => setBrushSize(Number(event.target.value))}>{BRUSH_SIZES.map(value => <option key={value} value={value}>{value} × {value}</option>)}</select></label>
      {!usesLayer && <span className="context-description">{tool === 'paste' ? '定位后确认 · Esc 取消' : '拖动浏览 · 滚轮缩放'}</span>}</div>
      <div className="tool-buttons" role="group" aria-label="编辑历史">
        <button aria-label={`撤销 (${editState.undoCount})`} title="撤销 · Ctrl Z" disabled={disabled || interacting || !editState.undoCount} onClick={() => onEdit('undo')}><Icon name="undo" size={16} /><span className="history-label">撤销 </span><span className="history-count">({editState.undoCount})</span></button>
        <button aria-label={`重做 (${editState.redoCount})`} title="重做 · Ctrl Y" disabled={disabled || interacting || !editState.redoCount} onClick={() => onEdit('redo')}><Icon name="redo" size={16} /><span className="history-label">重做 </span><span className="history-count">({editState.redoCount})</span></button>
      </div>
      <div className="map-controls" role="group" aria-label="地图视图控制">
        <button disabled={disabled || interacting || !camera} aria-label="缩小地图" onClick={() => zoomAt(1 / 1.5)}>−</button>
        <output className="map-zoom" aria-label="地图缩放比例">{camera ? Math.round(camera.zoom * 100) : 0}%</output>
        <button disabled={disabled || interacting || !camera} aria-label="放大地图" onClick={() => zoomAt(1.5)}>＋</button>
        <button disabled={disabled || interacting || !camera} onClick={() => { changeCamera(fitCamera(size, world)); hoverRef.current = null; setCoordinates(null); }}>全图</button>
        <button disabled={disabled || interacting || !camera} onClick={() => { changeCamera(constrainCamera({ x: world.spawn.x + .5, y: world.spawn.y + .5, zoom: Math.max(4, camera.zoom) }, size, world)); hoverRef.current = null; setCoordinates(null); }}>出生点</button>
      </div>
      <button ref={panelToggleRef} className="panel-toggle" disabled={panelLocked} aria-label={panelOpen ? '收起侧边面板' : '展开侧边面板'} aria-expanded={panelOpen} aria-controls="editor-sidebar" onClick={() => setPanelOpen(value => !value)}><Icon name="panel" /><span>面板</span></button>
    </div>
    <div className="tool-rail" role="group" aria-label="工具模式">
      <button disabled={disabled || interacting || !clipboard || tool === 'paste' || clipboard.data.formatVersion !== world.formatVersion} aria-label="粘贴工具" aria-pressed={tool === 'paste'} title="粘贴预览 · Ctrl V" onClick={startPaste}><Icon name="paste" size={21} /><span>粘贴</span></button>
      {[['pan', '平移'], ['select', '框选'], ['pick', '吸管'], ['paint', '画笔'], ['erase', '橡皮']].map(([id, label]) =>
        <button key={id} disabled={disabled || interacting} aria-label={label} title={label} aria-pressed={tool === id} onClick={() => { setTool(id); setHint(''); if (window.innerWidth <= 900) setPanelOpen(false); }}><Icon name={id} size={21} /><span>{label}</span></button>)}
      <div className="rail-divider" />
      <button disabled={interacting || (!panelOpen && panelLocked)} aria-label="建筑模板面板" title="建筑模板" onClick={() => showPanel('templates')}><Icon name="template" size={21} /><span>建筑</span></button>
      <button disabled={interacting || (!panelOpen && panelLocked)} aria-label="世界信息面板" title="世界信息" onClick={() => showPanel('world')}><Icon name="world" size={21} /><span>世界</span></button>
      <button className="help-button" disabled={interacting || (!panelOpen && panelLocked)} aria-label="操作帮助面板" title="操作帮助" onClick={() => showPanel('help')}><Icon name="help" size={21} /><span>帮助</span></button>
    </div>
    <div className="canvas-stage">
      <div className="selection-strip" aria-label="选区与区域编辑" hidden={!displayedSelection && tool !== 'select' && tool !== 'paste'}>
    <div className="selection-controls" role="group" aria-label="选区操作" hidden={tool === 'paste'}>
      <output aria-label="选区范围">{displayedSelection ? `X ${displayedSelection.x} · Y ${displayedSelection.y} · ${displayedSelection.width} × ${displayedSelection.height}（${displayedSelection.width * displayedSelection.height} 格）` : '未选择区域'}</output>
      <button disabled={disabled || interacting || !selection || !layers[layer]} onClick={() => onEdit('fillSelection', { selection, blockId, wallId, liquidType, liquidAmount, layer })}>填充选区</button>
      <button disabled={disabled || interacting || !selection || !layers[layer]} onClick={() => onEdit('eraseSelection', { selection, layer })}>擦除选区</button>
      <button disabled={disabled || interacting || !selection} onClick={clearSelection}>清除选区</button>
      <button disabled={disabled || interacting || !selection || tool === 'paste'} onClick={() => { onEdit('copy', { selection }); setPanel('templates'); setPanelOpen(true); }}>复制选区</button>
    </div>
        <div className="paste-confirmation" hidden={tool !== 'paste'}>
          <span>{clipboard?.data.width} × {clipboard?.data.height} 格 · 粘贴预览</span>
          <button disabled={disabled || interacting || !pasteFits(clipboard?.data, pastePosition, world) || !Object.values(layers).every(Boolean)} onClick={confirmPaste}>确认粘贴</button>
          <button disabled={disabled || interacting} onClick={cancelPaste}>取消粘贴</button>
        </div>
      </div>
      <div className="canvas-surface">
    <canvas ref={canvasRef} className={`map-canvas${dragging ? ' dragging' : ''}${tool !== 'pan' ? ' painting' : ''}`} tabIndex="0" role="img" aria-label={`${world.name}的世界地图`} aria-describedby="map-help" aria-busy={drawing}
      onPointerDown={event => {
        if (disabled || !camera || pointers.current.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
        canvasRef.current.focus({ preventScroll: true });
        pointers.current.set(event.pointerId, pointOf(event));
        canvasRef.current.setPointerCapture(event.pointerId);
        setDragging(true);
        const cell = showCoordinates(pointOf(event));
        if (pointers.current.size === 2) { cancelStroke(); if (tool === 'paste') cancelPaste(); return; }
        if (tool !== 'pan' && cell) {
          if (camera.zoom < 2) { setHint('请先放大到 200% 以上，或点击“出生点”后操作。'); return; }
          if (tool === 'paste') {
            pasteDragRef.current = { pointerId: event.pointerId, before: pasteRef.current };
            pasteRef.current = cell;
            setPastePosition(cell);
            setPlacing(true);
            return;
          }
          if (tool === 'pick') {
            pickRef.current = { pointerId: event.pointerId, cell, layer, start: pointOf(event) };
            return;
          }
          if (tool === 'select') {
            const rectangle = selectionFromPoints(cell, cell, world);
            selectionDraftRef.current = { pointerId: event.pointerId, start: cell, rectangle };
            setSelectionPreview(rectangle);
            redraw();
            return;
          }
          if (!layers[layer]) { setHint('当前编辑图层已隐藏，请先勾选对应的显示开关。'); return; }
          strokeRef.current = { pointerId: event.pointerId, blockId, wallId, liquidType, liquidAmount, layer, tool, stroke: new BrushStroke(world, brushSize, selectionRef.current) };
          strokeRef.current.stroke.add(cell);
          setDrafting(true);
          onDraftChange(true);
          redraw();
        }
      }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onPointerLeave={() => { if (!pointers.current.size) { hoverRef.current = null; setCoordinates(null); redraw(); } }}
      onKeyDown={event => {
        if (!camera || disabled) return;
        if (event.key === 'Escape') {
          if (tool === 'paste') cancelPaste();
          else if (strokeRef.current || selectionDraftRef.current || pickRef.current) cancelStroke();
          else clearSelection();
          return;
        }
        if (strokeRef.current || selectionDraftRef.current || pasteDragRef.current) return;
        pickRef.current = null;
        if (tool === 'paste' && event.key === 'Enter') { event.preventDefault(); confirmPaste(); return; }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selection && tool !== 'paste') {
          event.preventDefault(); onEdit('copy', { selection }); return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && clipboard) {
          event.preventDefault(); startPaste(); return;
        }
        if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          const action = event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo';
          if (editState[`${action}Count`]) onEdit(action);
          return;
        }
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) {
          event.preventDefault();
          const [x, y] = directions[event.key];
          if (tool === 'paste') {
            setPastePosition(previous => ({ x: previous.x + x * (event.shiftKey ? 10 : 1), y: previous.y + y * (event.shiftKey ? 10 : 1) }));
            return;
          }
          changeCamera(constrainCamera({ ...camera, x: camera.x + x * 80 / camera.zoom, y: camera.y + y * 80 / camera.zoom }, size, world));
          hoverRef.current = null;
          setCoordinates(null);
        } else if (['+', '=', '-', 'Home'].includes(event.key)) {
          event.preventDefault();
          if (event.key === 'Home') changeCamera(fitCamera(size, world));
          else zoomAt(event.key === '-' ? 1 / 1.5 : 1.5);
          hoverRef.current = null;
          setCoordinates(null);
        }
      }}>此地图需要浏览器支持 Canvas。</canvas>

      </div>
    <p className={`tool-hint${hint ? ' has-hint' : ''}`} role="status">{hint || {
      paint: `画笔模式：放大到 200% 以上绘制${layer === 'liquid' ? '液体' : layer === 'wall' ? '墙壁' : '方块'}。每次拖动为一步，双指可平移缩放。`,
      erase: `橡皮模式：放大到 200% 以上擦除${layer === 'liquid' ? '液体' : layer === 'wall' ? '墙壁' : '方块'}，跳过受保护图格；保留其他图层。`,
      pick: `吸管模式：放大到 200% 以上点击，读取${layer === 'liquid' ? '液体种类、液量' : layer === 'wall' ? '墙壁' : '方块'}和图格属性。`,
      select: '框选模式：放大到 200% 以上拖动选择矩形。填充和擦除每次最多 10000 格；选区内才会应用画笔和橡皮。',
      paste: '粘贴预览：点击或拖动定位左上角，也可输入 X/Y；方向键微调，Enter 确认，Esc 取消。家具与实体暂不支持。',
      pan: '平移模式：拖动浏览地图。选择画笔后可绘制基础方块。',
    }[tool]}</p>

    </div>
    <aside id="editor-sidebar" className="editor-sidebar" aria-label="编辑面板" hidden={!panelOpen} onKeyDown={event => {
      if (event.key === 'Escape' && !panelLocked) { event.stopPropagation(); closePanel(); }
    }}>
      <div className="sidebar-heading"><strong>{ { materials: '材料与属性', templates: '建筑与模板', world: '世界信息', view: '图层与贴图', help: '操作帮助' }[panel]}</strong><button disabled={panelLocked} aria-label="关闭侧边面板" onClick={closePanel}><Icon name="close" size={16} /></button></div>
      <div className="panel-nav" role="group" aria-label="面板分类">
        {[['materials', '材料'], ['templates', '建筑'], ['world', '世界'], ['view', '显示'], ['help', '帮助']].map(([id, label]) => <button key={id} title={label} aria-label={label} aria-pressed={panel === id} aria-controls={`panel-${id}`} disabled={interacting} onClick={() => setPanel(id)}><Icon name={{ materials: 'paint', templates: 'template', world: 'world', view: 'layers', help: 'help' }[id]} /><span>{label}</span></button>)}
      </div>
      <div className="panel-scroll">
        <section id="panel-materials" hidden={panel !== 'materials'}>
          <div className="material-layers" role="group" aria-label="材料图层">
            {[['block', '方块'], ['wall', '墙壁'], ['liquid', '液体']].map(([id, name]) => <button key={id} aria-label={`${name}材料`} aria-pressed={layer === id} disabled={disabled || interacting} onClick={() => { setLayer(id); setHint(''); }}>{name}</button>)}
          </div>
    {layer === 'liquid' ? <LiquidPicker version={world.formatVersion} type={liquidType} amount={liquidAmount} onType={setLiquidType} onAmount={setLiquidAmount} disabled={disabled || interacting} /> : <MaterialPicker key={layer} layer={layer} version={world.formatVersion} value={layer === 'wall' ? wallId : blockId} onChange={layer === 'wall' ? setWallId : setBlockId} disabled={disabled || interacting} />}
          <details className="inspector-details" open={sample ? true : undefined}><summary>图格属性</summary>
    <div className="tile-inspector" aria-label="图格属性" aria-live="polite">
      <strong>取样属性</strong>{sample ? <>
        <dl className="inspector-properties">
          <div><dt>坐标</dt><dd>X {sample.x} · Y {sample.y}</dd></div>
          <div><dt>材料</dt><dd>方块 ID {sample.blockId ?? '无'} · 墙壁 ID {sample.wallId ?? '无'}</dd></div>
          <div><dt>方块 / 墙壁涂料</dt><dd>{sample.properties.blockColor} / {sample.properties.wallColor}</dd></div>
          <div><dt>坡面</dt><dd>{sample.properties.slope}</dd></div>
          <div><dt>制动器</dt><dd>{sample.properties.actuator ? '有' : '无'}{sample.properties.actuated ? '（已虚化）' : ''}</dd></div>
          <div><dt>液体</dt><dd>{sample.properties.liquidAmount ? `${['无', '水', '熔岩', '蜂蜜', '微光'][sample.properties.liquidType] ?? sample.properties.liquidType} ${sample.properties.liquidAmount}/255` : '无'}</dd></div>
          <div><dt>电线</dt><dd>{sample.properties.wires.map(color => ({ Red: '红', Blue: '蓝', Green: '绿', Yellow: '黄' })[color]).join('、') || '无'}</dd></div>
          <div><dt>方块隐形 / 全亮</dt><dd>{sample.properties.invisibleBlock ? '是' : '否'} / {sample.properties.fullBrightBlock ? '是' : '否'}</dd></div>
          <div><dt>墙壁隐形 / 全亮</dt><dd>{sample.properties.invisibleWall ? '是' : '否'} / {sample.properties.fullBrightWall ? '是' : '否'}</dd></div>
        </dl>
      </> : <p>使用吸管点击图格后查看；编辑后需重新取样。</p>}</div>

          </details>
        </section>
        <section id="panel-view" hidden={panel !== 'view'}>
          <h3>地图显示</h3>
          <div className="layer-controls" role="group" aria-label="图层显示">
            <span>可见图层</span>{[['block', '方块'], ['wall', '墙壁'], ['liquid', '液体']].map(([key, name]) => <label key={key}>
              <input type="checkbox" aria-label={`显示${name}`} checked={layers[key]} disabled={disabled || interacting} onChange={event => setLayers(previous => ({ ...previous, [key]: event.target.checked }))} />{name}
            </label>)}<span>隐藏图层不参与绘制或擦除</span>
          </div>
          <h3 className="resource-heading">本地贴图</h3>
          <TextureControls resources={resourcesRef.current} mode={displayMode} onModeChange={setDisplayMode} disabled={disabled || interacting} onResourcesChange={() => {
            if (imageRef.current) imageRef.current.canvas.width = 0;
            imageRef.current = null;
            setDrawing(true);
            setResourceRevision(value => value + 1);
          }} />
        </section>
        <section id="panel-templates" hidden={panel !== 'templates'}>
          <p className="panel-description">框选区域后复制，或导入已有的建筑模板。</p>
    <div className="clipboard-controls" role="group" aria-label="复制粘贴">
      <canvas ref={thumbnailRef} className="clipboard-thumbnail" role="img" aria-label="建筑模板色块预览" hidden={!clipboard} />
      <output aria-label="复制内容">{clipboard ? `${clipboard.data.width} × ${clipboard.data.height} 格 · ${clipboard.source} · 格式 ${clipboard.data.formatVersion}${clipboard.data.formatVersion !== world.formatVersion ? '（与当前世界不同，不能粘贴）' : ''}` : '尚未复制；先框选普通图格区域'}</output>
      <button disabled={disabled || interacting || !clipboard || tool === 'paste' || clipboard.data.formatVersion !== world.formatVersion} onClick={startPaste}>粘贴预览</button>
      <label>X<input type="number" aria-label="粘贴 X" value={Number.isFinite(pastePosition?.x) ? pastePosition.x : ''} disabled={disabled || interacting || tool !== 'paste'} onChange={event => setPastePosition(previous => ({ ...previous, x: event.target.valueAsNumber }))} /></label>
      <label>Y<input type="number" aria-label="粘贴 Y" value={Number.isFinite(pastePosition?.y) ? pastePosition.y : ''} disabled={disabled || interacting || tool !== 'paste'} onChange={event => setPastePosition(previous => ({ ...previous, y: event.target.valueAsNumber }))} /></label>
      <div className="clipboard-actions">
        {[['counterclockwise', '左转 90°'], ['clockwise', '右转 90°'], ['horizontal', '左右翻转'], ['vertical', '上下翻转']].map(([operation, label]) =>
          <button key={operation} disabled={disabled || interacting || !clipboard || clipboard.data.formatVersion !== world.formatVersion} onClick={() => onEdit('transformClipboard', operation)}>{label}</button>)}
        <input ref={templateInputRef} className="file-input" type="file" accept=".tedit-template.json,.json" aria-label="选择建筑模板文件" disabled={disabled || interacting} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) onEdit('importTemplate', file);
        }} />
        <button disabled={disabled || interacting} onClick={() => templateInputRef.current.click()}>导入模板</button>
        <button disabled={disabled || interacting || !clipboard} onClick={() => onEdit('exportTemplate')}>导出模板</button>
      </div>
      <details className="panel-help"><summary>模板格式与粘贴规则</summary><p>完整替换目标矩形的所有图层，含空格；不受旧选区限制。确认前仅预览，最多 10000 格。</p>
      <p>半砖仅支持左右翻转。模板为本项目的 JSON 格式（最多 2 MiB），导入需与当前世界格式相同，不支持桌面 .TEditSch。</p></details>
      <output className="paste-state" aria-label="粘贴目标状态">{tool !== 'paste' ? '未开始粘贴' : !pasteFits(clipboard?.data, pastePosition, world) ? '目标超出地图或坐标无效。' : !Object.values(layers).every(Boolean) ? '请显示方块、墙壁和液体后确认。' : '预览中，确认后写入世界；家具及实体检查在确认时执行。'}</output>
    </div>

        </section>
        <section id="panel-world" hidden={panel !== 'world'}>{worldDetails}</section>
        <section id="panel-help" hidden={panel !== 'help'}>
          <h3>地图操作</h3><dl className="shortcut-list"><div><dt>平移地图</dt><dd>拖动 / 方向键</dd></div><div><dt>缩放地图</dt><dd>滚轮 / 双指 / ＋ −</dd></div><div><dt>撤销 / 重做</dt><dd>Ctrl Z / Ctrl Y</dd></div><div><dt>复制 / 粘贴</dt><dd>Ctrl C / Ctrl V</dd></div><div><dt>确认 / 取消粘贴</dt><dd>Enter / Esc</dd></div></dl>
    <p id="map-help" className="file-hint">滚轮或双指缩放；聚焦地图后可用方向键、+ / −、Ctrl+Z / Ctrl+Y、Ctrl+C / Ctrl+V。Esc 取消草稿或粘贴预览，无草稿时清除选区。有选区时，画笔和橡皮仅作用于选区内，且只修改选中的编辑图层；粘贴完整替换所有图层，含空格。区域操作最多 10000 格。特殊图格受保护。显示面板可选择本机资源并切换贴图，未支持的外观使用色块。</p>

          <p className="panel-description">液体在材料面板选择种类和液量；0% 或橡皮清除液体，旧格式不支持微光。液体显示为基础色彩，不模拟流动或反应。</p>
          <p className="panel-description">存档仅在本机处理。导出世界副本后，保留原文件并在游戏中测试。建筑模板下载不会保存世界修改。</p>
          <a href="https://github.com/woshimaxfive/terraria-editor-zh" target="_blank" rel="noreferrer">项目源码</a> · <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">开源许可</a>
        </section>
      </div>
    </aside>
    <div className="map-status">
      <span className="render-status" aria-label="地图渲染状态"><span className="status-dot" />{drawing ? '正在绘制地图…' : displayMode === 'texture' ? textureStats?.detailed ? `贴图 ${textureStats.drawn} 格 · 色块 ${textureStats.fallback} 格` : '色块概览 · 放大查看贴图' : '色块地图'}<span className="status-detail"> · 黄色十字为出生点</span></span>
      <output className="map-coordinates">{coordinates ? `X ${coordinates.x} · Y ${coordinates.y}` : '移到地图上查看坐标'}</output>
      <span className="world-size">{world.width} × {world.height}</span>
      <span className="selection-size" aria-label="状态栏选区">{displayedSelection ? `选区 ${displayedSelection.width} × ${displayedSelection.height}` : '无选区'}</span>
    </div>
  </section>;
}
