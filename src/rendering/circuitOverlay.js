import { WIRES, wireMaskOf } from '../editing/circuits.js';

// Low 4 bits: present colors; next 16: left/right/up/down per color; 20/21: actuator/inactive.
export function circuitFlags(tile, neighbors, layers) {
  const mask = layers.wire ? wireMaskOf(tile) : 0;
  let flags = mask;
  if (mask) {
    const nearby = neighbors.map(wireMaskOf);
    WIRES.forEach((wire, i) => {
      if (mask & wire.bit) nearby.forEach((neighbor, direction) => {
        if (neighbor & wire.bit) flags |= 1 << (4 + i * 4 + direction);
      });
    });
  }
  if (layers.actuator) {
    if (tile.actuator) flags |= 1 << 20;
    if (tile.actuated) flags |= 1 << 21;
  }
  return flags;
}

export function drawCircuitOverlay(context, commands, originX, originY, zoom) {
  context.save();
  for (let offset = 0; offset < commands.length; offset += 3) {
    const x = originX + commands[offset] * zoom, y = originY + commands[offset + 1] * zoom, flags = commands[offset + 2];
    WIRES.forEach((wire, i) => {
      if (!(flags & wire.bit)) return;
      const shift = (i - 1.5) * .12 * zoom;
      const cx = x + zoom / 2 + shift, cy = y + zoom / 2 + shift;
      const links = (flags >> (4 + i * 4)) & 15;
      context.strokeStyle = wire.color;
      context.lineWidth = Math.max(1, zoom * .12);
      context.beginPath();
      if (links & 1) { context.moveTo(x, cy); context.lineTo(cx, cy); }
      if (links & 2) { context.moveTo(cx, cy); context.lineTo(x + zoom, cy); }
      if (links & 4) { context.moveTo(cx, y); context.lineTo(cx, cy); }
      if (links & 8) { context.moveTo(cx, cy); context.lineTo(cx, y + zoom); }
      if (!links) { context.moveTo(cx - zoom * .18, cy); context.lineTo(cx + zoom * .18, cy); }
      context.stroke();
    });
    if (flags & ((1 << 20) | (1 << 21))) {
      context.lineWidth = Math.max(1, zoom * .1);
      context.strokeStyle = flags & (1 << 21) ? '#ff9279' : '#eeeeee';
      context.strokeRect(x + zoom * .18, y + zoom * .18, zoom * .64, zoom * .64);
      if (flags & (1 << 21)) { context.beginPath(); context.moveTo(x + zoom * .18, y + zoom * .18); context.lineTo(x + zoom * .82, y + zoom * .82); context.stroke(); }
    }
  }
  context.restore();
}
