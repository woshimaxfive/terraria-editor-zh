function equalRange(a, startA, endA, b, startB, endB) {
  if (endA - startA !== endB - startB) return false;
  const first = new Uint8Array(a, startA, endA - startA);
  const second = new Uint8Array(b, startB, endB - startB);
  for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return false;
  return true;
}

// Only the tile section and its following absolute pointers may change.
export function preservesOtherSections(original, output) {
  const a = new DataView(original), b = new DataView(output);
  const count = a.getInt16(24, true);
  const tableEnd = 26 + count * 4;
  const oldTiles = a.getInt32(30, true), newTiles = b.getInt32(30, true);
  const oldEnd = a.getInt32(34, true), newEnd = b.getInt32(34, true);
  if (oldTiles !== newTiles || !equalRange(original, 0, 26, output, 0, 26) ||
      !equalRange(original, tableEnd, oldTiles, output, tableEnd, newTiles) ||
      !equalRange(original, oldEnd, original.byteLength, output, newEnd, output.byteLength)) return false;
  const delta = newEnd - oldEnd;
  for (let i = 0; i < count; i++) {
    const oldPointer = a.getInt32(26 + i * 4, true);
    const newPointer = b.getInt32(26 + i * 4, true);
    if (newPointer !== oldPointer + (i >= 2 && oldPointer ? delta : 0)) return false;
  }
  return true;
}
