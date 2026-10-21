// SPDX-License-Identifier: MS-PL
// TEdit contributors. Adapted from ConstrainHelper; see vendor/tedit-editing-rules/.
export function detectDirection(dx, dy) {
  if (dy * 5 > dx * 2 && dx * 5 > dy * 2) return 2;
  return dx < dy ? 1 : 0;
}

export function snapDirection(point, anchor, direction) {
  if (direction === 1) return { x: anchor.x, y: point.y };
  if (direction === 2) {
    const dx = point.x - anchor.x, dy = point.y - anchor.y;
    const distance = Math.floor((Math.abs(dx) + Math.abs(dy)) / 2);
    return { x: anchor.x + distance * (dx >= 0 ? 1 : -1), y: anchor.y + distance * (dy >= 0 ? 1 : -1) };
  }
  return { x: point.x, y: anchor.y };
}

export const continuesLine = (start, end) => Math.abs(start.x - end.x) <= 2 && Math.abs(start.y - end.y) <= 2;
