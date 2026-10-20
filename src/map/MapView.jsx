import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { constrainCamera, fitCamera, screenToWorld, visibleRegion, zoomCamera } from '../rendering/viewport.js';

const MAX_CANVAS_PIXELS = 4 * 1024 * 1024;

export default function MapView({ session, world, disabled, onError }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const pointers = useRef(new Map());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [drawing, setDrawing] = useState(true);
  const [dragging, setDragging] = useState(false);
  const current = useRef({ size, camera });
  current.current = { size, camera };

  const changeCamera = useCallback(next => {
    current.current.camera = next;
    setCamera(next);
  }, []);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) };
      if (next.width < 1 || next.height < 1) return;
      setSize(next);
      changeCamera(current.current.camera ? constrainCamera(current.current.camera, next, world) : fitCamera(next, world));
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [world, changeCamera]);

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
  }, [camera, size, world]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  useEffect(() => {
    if (!camera || !size.width || disabled) return;
    let active = true;
    setDrawing(true);
    const timer = setTimeout(async () => {
      try {
        const { image } = await session.render(visibleRegion(camera, size, world));
        if (!active) return;
        const canvas = document.createElement('canvas');
        canvas.width = image.imageWidth;
        canvas.height = image.imageHeight;
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.buffer), image.imageWidth, image.imageHeight), 0, 0);
        const previous = imageRef.current;
        imageRef.current = { ...image, buffer: undefined, canvas };
        if (previous) previous.canvas.width = 0;
        draw();
        setDrawing(false);
      } catch (error) {
        if (active && error.name !== 'AbortError') onError(error);
      }
    }, 50);
    return () => { active = false; clearTimeout(timer); };
  }, [camera, size, disabled, session, world, draw, onError]);

  useEffect(() => () => {
    if (imageRef.current) imageRef.current.canvas.width = 0;
    imageRef.current = null;
    pointers.current.clear();
  }, []);

  const pointOf = event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const showCoordinates = (point, view = current.current.camera) => {
    if (!view) return;
    const position = screenToWorld(point, view, current.current.size);
    const x = Math.floor(position.x), y = Math.floor(position.y);
    setCoordinates(x >= 0 && y >= 0 && x < world.width && y < world.height ? { x, y } : null);
  };
  const zoomAt = (factor, point) => {
    const { camera: view, size: dimensions } = current.current;
    if (!view || disabled) return;
    changeCamera(zoomCamera(view, factor, point || { x: dimensions.width / 2, y: dimensions.height / 2 }, dimensions, world));
    setCoordinates(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wheel = event => {
      if (disabled) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? current.current.size.height : 1);
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const view = current.current;
      if (view.camera) {
        const next = zoomCamera(view.camera, Math.exp(-Math.max(-300, Math.min(300, delta)) * .003), point, view.size, world);
        changeCamera(next);
        const position = screenToWorld(point, next, view.size);
        const x = Math.floor(position.x), y = Math.floor(position.y);
        setCoordinates(x >= 0 && y >= 0 && x < world.width && y < world.height ? { x, y } : null);
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
    pointers.current.delete(event.pointerId);
    setDragging(pointers.current.size > 0);
    if (canvasRef.current.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  }

  return <section className="map-view" aria-labelledby="map-title">
    <div className="map-toolbar">
      <h2 id="map-title">地图预览</h2>
      <div className="map-controls" role="group" aria-label="地图视图控制">
        <button disabled={disabled || !camera} aria-label="缩小地图" onClick={() => zoomAt(1 / 1.5)}>−</button>
        <output className="map-zoom" aria-label="地图缩放比例">{camera ? Math.round(camera.zoom * 100) : 0}%</output>
        <button disabled={disabled || !camera} aria-label="放大地图" onClick={() => zoomAt(1.5)}>＋</button>
        <button disabled={disabled || !camera} onClick={() => { changeCamera(fitCamera(size, world)); setCoordinates(null); }}>全图</button>
        <button disabled={disabled || !camera} onClick={() => { changeCamera(constrainCamera({ x: world.spawn.x + .5, y: world.spawn.y + .5, zoom: Math.max(4, camera.zoom) }, size, world)); setCoordinates(null); }}>出生点</button>
      </div>
    </div>
    <canvas ref={canvasRef} className={dragging ? 'map-canvas dragging' : 'map-canvas'} tabIndex="0" role="img" aria-label={`${world.name}的世界地图`} aria-describedby="map-help" aria-busy={drawing}
      onPointerDown={event => {
        if (disabled || !camera || pointers.current.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
        canvasRef.current.focus({ preventScroll: true });
        pointers.current.set(event.pointerId, pointOf(event));
        canvasRef.current.setPointerCapture(event.pointerId);
        setDragging(true);
        showCoordinates(pointOf(event));
      }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onPointerLeave={() => { if (!pointers.current.size) setCoordinates(null); }}
      onKeyDown={event => {
        if (!camera || disabled) return;
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) {
          event.preventDefault();
          const [x, y] = directions[event.key];
          changeCamera(constrainCamera({ ...camera, x: camera.x + x * 80 / camera.zoom, y: camera.y + y * 80 / camera.zoom }, size, world));
          setCoordinates(null);
        } else if (['+', '=', '-', 'Home'].includes(event.key)) {
          event.preventDefault();
          if (event.key === 'Home') changeCamera(fitCamera(size, world));
          else zoomAt(event.key === '-' ? 1 / 1.5 : 1.5);
          setCoordinates(null);
        }
      }}>此地图需要浏览器支持 Canvas。</canvas>
    <div className="map-status">
      <span>{drawing ? '正在绘制地图…' : '色块地图'} · 黄色十字为出生点</span>
      <output className="map-coordinates">{coordinates ? `X ${coordinates.x} · Y ${coordinates.y}` : '移到地图上查看坐标'}</output>
    </div>
    <p id="map-help" className="file-hint">拖动平移，滚轮或双指缩放；也可聚焦地图后使用方向键和 + / −。当前不显示贴图、油漆与电线，放大可查看单格色块。</p>
  </section>;
}
