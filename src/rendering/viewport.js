import { MAX_RASTER_PIXELS } from './worldRaster.js';

export function fitZoom(size, world) {
  return Math.min(16, Math.max(.001, Math.min((size.width - 24) / world.width, (size.height - 24) / world.height)));
}

export function constrainCamera(camera, size, world) {
  const zoom = Math.max(fitZoom(size, world), Math.min(16, camera.zoom));
  const limit = (value, length, pixels) => {
    const half = pixels / zoom / 2;
    return half >= length / 2 ? length / 2 : Math.max(half, Math.min(length - half, value));
  };
  return { x: limit(camera.x, world.width, size.width), y: limit(camera.y, world.height, size.height), zoom };
}

export function fitCamera(size, world) {
  return { x: world.width / 2, y: world.height / 2, zoom: fitZoom(size, world) };
}

export function screenToWorld(point, camera, size) {
  return { x: camera.x + (point.x - size.width / 2) / camera.zoom, y: camera.y + (point.y - size.height / 2) / camera.zoom };
}

export function zoomCamera(camera, factor, point, size, world) {
  const anchor = screenToWorld(point, camera, size);
  const zoom = Math.max(fitZoom(size, world), Math.min(16, camera.zoom * factor));
  return constrainCamera({
    zoom,
    x: anchor.x - (point.x - size.width / 2) / zoom,
    y: anchor.y - (point.y - size.height / 2) / zoom,
  }, size, world);
}

export function visibleRegion(camera, size, world) {
  const x = Math.max(0, Math.floor(camera.x - size.width / camera.zoom / 2));
  const y = Math.max(0, Math.floor(camera.y - size.height / camera.zoom / 2));
  const width = Math.min(world.width, Math.ceil(camera.x + size.width / camera.zoom / 2)) - x;
  const height = Math.min(world.height, Math.ceil(camera.y + size.height / camera.zoom / 2)) - y;
  let step = 2 ** Math.max(0, Math.floor(Math.log2(1 / camera.zoom)));
  while (Math.ceil(width / step) * Math.ceil(height / step) > MAX_RASTER_PIXELS) step *= 2;
  return { x, y, width, height, step };
}
