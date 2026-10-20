export function selectionFromPoints(start, end, world) {
  const clampX = x => Math.max(0, Math.min(world.width - 1, x));
  const clampY = y => Math.max(0, Math.min(world.height - 1, y));
  const left = clampX(Math.min(start.x, end.x)), right = clampX(Math.max(start.x, end.x));
  const top = clampY(Math.min(start.y, end.y)), bottom = clampY(Math.max(start.y, end.y));
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function validSelection(selection, world) {
  if (!selection) return false;
  const { x, y, width, height } = selection;
  return [x, y, width, height].every(Number.isSafeInteger) && x >= 0 && y >= 0 &&
    width > 0 && height > 0 && x + width <= world.width && y + height <= world.height;
}

export function containsCell(selection, x, y) {
  return !selection || (x >= selection.x && y >= selection.y &&
    x < selection.x + selection.width && y < selection.y + selection.height);
}
