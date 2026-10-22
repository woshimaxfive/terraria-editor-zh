function equalRange(a, startA, endA, b, startB, endB) {
  if (endA - startA !== endB - startB) return false;
  const first = new Uint8Array(a, startA, endA - startA);
  const second = new Uint8Array(b, startB, endB - startB);
  for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return false;
  return true;
}

function sectionLayout(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 66) return null;
  const view = new DataView(buffer), count = view.getInt16(24, true);
  if (![10, 11].includes(count) || 26 + count * 4 >= buffer.byteLength) return null;
  const tableEnd = 26 + count * 4, pointers = [];
  let previous = tableEnd;
  for (let i = 0; i < count; i++) {
    const pointer = view.getInt32(26 + i * 4, true);
    if (!pointer && count === 10 && i === 9) continue;
    if (pointer < previous || pointer >= buffer.byteLength) return null;
    pointers.push(pointer); previous = pointer;
  }
  return { count, tableEnd, pointers };
}

// Only tiles may vary freely. Edited sections must match independently tracked,
// field-validated snapshots; every other section remains byte-identical.
export function preservesEditedSections(original, output, expectedSections = new Map()) {
  const a = sectionLayout(original), b = sectionLayout(output);
  if (!a || !b || a.count !== b.count || a.pointers.length !== b.pointers.length ||
      !(expectedSections instanceof Map) || [...expectedSections].some(([index, bytes]) => ![0, 2, 3, 4, 5, 6, a.pointers.length - 1].includes(index) || !(bytes instanceof ArrayBuffer)) ||
      expectedSections.has(0) !== expectedSections.has(a.pointers.length - 1)) return false;
  if (!equalRange(original, 0, 26, output, 0, 26) ||
      !equalRange(original, a.tableEnd, a.pointers[0], output, b.tableEnd, b.pointers[0])) return false;
  for (let i = 0; i < a.pointers.length; i++) {
    if (i === 1) continue;
    const start = b.pointers[i], end = b.pointers[i + 1] ?? output.byteLength;
    const expected = expectedSections.get(i);
    if (expected ? !equalRange(expected, 0, expected.byteLength, output, start, end) :
      !equalRange(original, a.pointers[i], a.pointers[i + 1] ?? original.byteLength, output, start, end)) return false;
  }
  return true;
}

export function preservesOtherSections(original, output) {
  return preservesEditedSections(original, output);
}
