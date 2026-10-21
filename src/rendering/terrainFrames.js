// Terraria texture-layout facts: https://seancode.com/terrafirma/uvs.html
// This independent model covers dirt, stone and forest grass. It does not
// implement the desktop renderer's recursive merge negotiation or other biomes.
// Atlas cells are adjusted for current Terraria textures: several grass rows
// and single-edge blend cells differ from the original layout document.
export const TERRAIN_NEIGHBORS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([0, -1]), Object.freeze([-1, 0]), Object.freeze([0, 1]),
  Object.freeze([-1, -1]), Object.freeze([1, -1]), Object.freeze([-1, 1]), Object.freeze([1, 1]),
]);
const names = ['R', 'T', 'L', 'B', 'TL', 'TR', 'BL', 'BR'];
const SAME = 1, BLEND = 2, EMPTY = 4;
const STATE_COUNT = 3 ** 8;

function constraints(text) {
  return new Set(text.replaceAll('All', 'R T L B').split(' ').filter(Boolean));
}

function rule(zone, frames, matches = '', blends = '') {
  const match = constraints(matches), blend = constraints(blends);
  const allowed = names.map((name, index) => {
    const positive = (match.has(name) ? SAME : 0) | (blend.has(name) ? BLEND : 0);
    let states = positive || (index < 4 ? EMPTY : SAME | BLEND | EMPTY);
    if (match.has('!' + name)) states &= ~SAME;
    if (blend.has('!' + name)) states &= ~BLEND;
    return states;
  });
  const score = allowed.slice(4).reduce((sum, states) => sum + 3 - [SAME, BLEND, EMPTY].filter(bit => states & bit).length, 0);
  const cells = frames.split(' ');
  const variants = cells.map(cell => {
    const [, row, column] = /^([A-W])(\d+)$/.exec(cell);
    return Object.freeze({ sourceX: (Number(column) - 1) * 18, sourceY: (row.charCodeAt(0) - 65) * 18, width: 16, height: 16, zone, rule: frames });
  });
  return { allowed, score, variants };
}

const base = [
  rule('base', 'A1 B1 C1', 'T B R'), rule('base', 'A2 A3 A4', 'L B R'),
  rule('base', 'A5 B5 C5', 'T B L'), rule('base', 'A6 B6 C6', 'T B'),
  rule('base', 'A7 A8 A9', 'B'), rule('base', 'A10 B10 C10', 'R'),
  rule('base', 'A11 B11 C11', 'All !TL !BL'), rule('base', 'A12 B12 C12', 'All !TR !BR'),
  rule('base', 'A13 B13 C13', 'L'), rule('base', 'B2 B3 B4', 'All'),
  rule('base', 'B7 B8 B9', 'All !TL !TR'), rule('base', 'C2 C3 C4', 'L T R'),
  rule('base', 'C7 C8 C9', 'All !BL !BR'), rule('base', 'D1 D3 D5', 'B R'),
  rule('base', 'D2 D4 D6', 'B L'), rule('base', 'D7 D8 D9', 'T'),
  rule('base', 'D10 D11 D12'), rule('base', 'E1 E3 E5', 'T R'),
  rule('base', 'E2 E4 E6', 'T L'), rule('base', 'E7 E8 E9', 'L R'),
].sort((a, b) => b.score - a.score);

const blend = [
  rule('blend', 'A14 A15 A16', 'L R', 'B'), rule('blend', 'B14 B15 B16', 'L R', 'T'),
  rule('blend', 'C14 C15 C16', 'T B', 'R'), rule('blend', 'D14 D15 D16', 'T B', 'L'),
  rule('blend', 'F1 H1 J1', 'All', 'BR'), rule('blend', 'F2 H2 J2', 'All', 'BL'),
  rule('blend', 'F12 G12 H12', 'B', 'L T R'), rule('blend', 'F13 G13 H13', 'R', 'T B L'),
  rule('blend', 'G1 I1 K1', 'All', 'TR'), rule('blend', 'G2 I2 K2', 'All', 'TL'),
  rule('blend', 'I12 J12 K12', 'T', 'L B R'), rule('blend', 'I13 J13 K13', 'L', 'T B R'),
];

const grass = [
  rule('grass', 'M9 M12 M15', 'L B R !BL !BR', '!BL !BR'),
  rule('grass', 'N8 N11 N14', 'T B R !TR !BR', '!TR !BR'),
  rule('grass', 'N9 N12 N15', 'All !TL !TR !BL !BR'),
  rule('grass', 'N10 N13 N16', 'T B L !TL !BL', '!TL !BL'),
  rule('grass', 'O9 O12 O15', 'L T R !TL !TR', '!TL !TR'),
  rule('grass', 'P1 Q1 R1', 'R', 'T B'), rule('grass', 'P2 Q2 R2', 'L', 'T B'),
  rule('grass', 'P3 P4 P5', 'B', 'L R'),
  rule('grass', 'P6 P7 P8', 'B R !BR', '!BR'), rule('grass', 'P9 P10 P11', 'B L !BL', '!BL'),
  rule('grass', 'P12 P13 P14', 'B', 'L T R'), rule('grass', 'Q3 Q4 Q5', 'T', 'L R'),
  rule('grass', 'Q6 Q7 Q8', 'T R !TR', '!TR'), rule('grass', 'Q9 Q10 Q11', 'T L !TL', '!TL'),
  rule('grass', 'Q12 Q13 Q14', 'T', 'L B R'),
  rule('grass', 'R3 R4 R5', 'All !TL !BR'), rule('grass', 'R6 R7 R8', 'All !TR !BL'),
  rule('grass', 'R9 R10 R11', 'R', 'T B L'), rule('grass', 'R12 R13 R14', 'L', 'T B R'),
  rule('grass', 'S1 S2 S3', 'L B R BL !BR', 'BL !BR'),
  rule('grass', 'S4 S5 S6', 'L B R !BL BR', '!BL BR'),
  rule('grass', 'S7 S8 S9', 'All !TL !TR !BL', 'BR'),
  rule('grass', 'T1 T2 T3', 'L T R TL !TR', 'TL !TR'),
  rule('grass', 'T4 T5 T6', 'L T R !TL TR', '!TL TR'),
  rule('grass', 'T7 T8 T9', 'All !TL !BL !BR', 'TR'),
  rule('grass', 'U1 U2 U3', 'T B R !TR BR', '!TR BR'),
  rule('grass', 'U4 U5 U6', 'T B R TR !BR', 'TR !BR'),
  rule('grass', 'U7 U8 U9', 'All !TL !TR !BR', 'BL'),
  rule('grass', 'V1 V2 V3', 'T B L TL !BL', 'TL !BL'),
  rule('grass', 'V4 V5 V6', 'T B L !TL BL', '!TL BL'),
  rule('grass', 'V7 V8 V9', 'All !TR !BL !BR', 'TL'),
];

const shared = [
  rule('shared', 'F3 H3 J3', 'B R', 'T L'), rule('shared', 'F4 H4 J4', 'B L', 'T R'),
  rule('shared', 'F5 G5 H5', 'T R', 'B'), rule('shared', 'F6 G6 H6', 'T L', 'B'),
  rule('shared', 'F7 G7 H7', '', 'B'), rule('shared', 'F8 G8 H8', 'T', 'B'),
  rule('shared', 'F9 F10 F11', 'L T R', 'B'),
  rule('shared', 'G3 I3 K3', 'T R', 'B L'), rule('shared', 'G4 I4 K4', 'T L', 'B R'),
  rule('shared', 'G9 G10 G11', 'L B R', 'T'),
  rule('shared', 'H9 I9 J9', 'T B L', 'R'), rule('shared', 'H10 I10 J10', 'T B R', 'L'),
  rule('shared', 'H11 I11 J11', 'T B', 'L R'),
  rule('shared', 'I5 J5 K5', 'B R', 'T'), rule('shared', 'I6 J6 K6', 'B L', 'T'),
  rule('shared', 'I7 J7 K7', '', 'T'), rule('shared', 'I8 J8 K8', 'B', 'T'),
  rule('shared', 'K9 K10 K11', 'L R', 'T B'),
  rule('shared', 'L1 L2 L3', 'B R', 'L'), rule('shared', 'L4 L5 L6', 'B L', 'R'),
  rule('shared', 'L7 L8 L9', '', 'All'), rule('shared', 'L10 L11 L12', '', 'L R'),
  rule('shared', 'M1 M2 M3', 'T R', 'L'), rule('shared', 'M4 M5 M6', 'T L', 'R'),
  // Current textures have three vertical cells here, despite the old diagram.
  rule('shared', 'M7 N7 O7', '', 'T B'),
  rule('shared', 'N1 N2 N3', '', 'L'), rule('shared', 'N4 N5 N6', '', 'R'),
  rule('shared', 'O1 O2 O3', 'R', 'L'), rule('shared', 'O4 O5 O6', 'L', 'R'),
];

const special = [[], [...blend, ...shared], [...grass, ...shared]].map(rules => rules.sort((a, b) => b.score - a.score));
const choices = special.map(rules => [...rules, ...base]);
const cache = choices.map(() => new Uint8Array(STATE_COUNT).fill(255));
function find(rules, states) {
  return rules.findIndex(candidate => candidate.allowed.every((allowed, index) => allowed & states[index]));
}

/** Neighbors in TERRAIN_NEIGHBORS order; null/undefined means no matching tile.
 * Only IDs 0, 1 and 2 are supported. Dirt joins these three IDs; stone blends
 * with dirt, grass blends with dirt. Foreign IDs remain disconnected. */
export function selectTerrainFrame(blockId, neighbors, variant = 0) {
  if (![0, 1, 2].includes(blockId)) return null;
  if (!Array.isArray(neighbors) || neighbors.length !== 8 ||
      !neighbors.every(id => id == null || (Number.isSafeInteger(id) && id >= 0)) ||
      !Number.isSafeInteger(variant) || variant < 0 || variant > 2) throw new Error('Invalid terrain frame input');
  const states = Array.from(neighbors, id => {
    if (id === blockId || (blockId === 0 && (id === 1 || id === 2))) return SAME;
    return blockId !== 0 && id === 0 ? BLEND : EMPTY;
  });
  const key = states.reduce((sum, state, i) => sum + (state === SAME ? 0 : state === BLEND ? 1 : 2) * 3 ** i, 0);
  let index = cache[blockId][key];
  if (index === 255) {
    index = find(special[blockId], states);
    if (index < 0) {
      const fallback = states.map(state => state === BLEND ? (blockId === 2 ? SAME : EMPTY) : state);
      index = special[blockId].length + find(base, fallback);
    }
    cache[blockId][key] = index;
  }
  return choices[blockId][index].variants[variant];
}

/** Pure, bounded world lookup. A missing halo tile is read from the world,
 * never guessed from the edge of the currently visible region. */
export function terrainFrameAt(source, x, y) {
  if (![source.width, source.height].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= source.width || y >= source.height) {
    throw new Error('Invalid terrain position');
  }
  const tile = source.readTile(x, y);
  if (!tile || ![0, 1, 2].includes(tile.blockId) || tile.slope || tile.actuated || tile.invisibleBlock) return null;
  const neighbors = TERRAIN_NEIGHBORS.map(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) return null;
    const neighbor = source.readTile(nx, ny);
    return neighbor && !neighbor.slope && !neighbor.actuated && !neighbor.invisibleBlock ? neighbor.blockId : null;
  });
  const variant = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 3;
  return selectTerrainFrame(tile.blockId, neighbors, variant);
}
