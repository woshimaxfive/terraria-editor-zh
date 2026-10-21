// SPDX-License-Identifier: MS-PL
// Adapted from TEdit BlendRules.cs, TEdit contributors.
// https://github.com/TEdit/Terraria-Map-Editor/blob/84e3fc3466d405675a09da763169774b82c22d4d/src/TEdit/Render/BlendRules.cs
// Changes: JavaScript arrays replace LinkedList; deterministic selection only;
// no World/WPF cache invalidation. This file remains under MS-PL (see LICENSE).
const OPERATIONS = [
  ["baseRules",0,"AddFirst",[0],"D10","D12"],
  ["baseRules",1,"AddFirst",[0],"A10","C10"],
  ["baseRules",2,"AddFirst",[0],"D7","D9"],
  ["baseRules",3,"AddFirst",[0],"E1","E5"],
  ["baseRules",4,"AddFirst",[0],"A13","C13"],
  ["baseRules",5,"AddFirst",[0],"E7","E9"],
  ["baseRules",6,"AddFirst",[0],"E2","E6"],
  ["baseRules",7,"AddFirst",[0],"C2","C4"],
  ["baseRules",8,"AddFirst",[0],"A7","A9"],
  ["baseRules",9,"AddFirst",[0],"D1","D5"],
  ["baseRules",10,"AddFirst",[0],"A6","C6"],
  ["baseRules",11,"AddFirst",[0],"A1","C1"],
  ["baseRules",12,"AddFirst",[0],"D2","D6"],
  ["baseRules",13,"AddFirst",[0],"A2","A4"],
  ["baseRules",14,"AddFirst",[0],"A5","C5"],
  ["baseRules",15,"AddFirst",[0],"B2","B4"],
  ["baseRules",15,"AddFirst",[272],"A11","C11"],
  ["baseRules",15,"AddFirst",[4097],"A12","C12"],
  ["baseRules",15,"AddFirst",[17],"B7","B9"],
  ["baseRules",15,"AddFirst",[4352],"C7","C9"],
  ["blendRules",0,"AddFirst",[0,1,0],"N4","N6"],
  ["blendRules",0,"AddFirst",[0,16,0],"I7","K7"],
  ["blendRules",0,"AddFirst",[0,256,0],"N1","N3"],
  ["blendRules",0,"AddFirst",[0,4096,0],"F7","H7"],
  ["blendRules",0,"AddFirst",[0,257,0],"L10","L12"],
  ["blendRules",0,"AddFirst",[0,4112,0],"M7","O7"],
  ["blendRules",0,"AddFirst",[0,4369,0],"L7","L9"],
  ["blendRules",1,"AddFirst",[0,256,0],"O1","O3"],
  ["blendRules",2,"AddFirst",[0,4096,0],"F8","H8"],
  ["blendRules",3,"AddFirst",[0,256,0],"M1","M3"],
  ["blendRules",3,"AddFirst",[0,4096,0],"F5","H5"],
  ["blendRules",3,"AddFirst",[0,4352,0],"G3","K3"],
  ["blendRules",4,"AddFirst",[0,1,0],"O4","O6"],
  ["blendRules",5,"AddFirst",[0,4112,0],"K9","K11"],
  ["blendRules",6,"AddFirst",[0,1,0],"M4","M6"],
  ["blendRules",6,"AddFirst",[0,4096,0],"F6","H6"],
  ["blendRules",6,"AddFirst",[0,4097,0],"G4","K4"],
  ["blendRules",7,"AddFirst",[0,4096,0],"F9","F11"],
  ["blendRules",8,"AddFirst",[0,16,0],"I8","K8"],
  ["blendRules",9,"AddFirst",[0,16,0],"I5","K5"],
  ["blendRules",9,"AddFirst",[0,256,0],"L1","L3"],
  ["blendRules",9,"AddFirst",[0,272,0],"F3","J3"],
  ["blendRules",10,"AddFirst",[0,257,0],"H11","J11"],
  ["blendRules",11,"AddFirst",[0,256,0],"H10","J10"],
  ["blendRules",12,"AddFirst",[0,1,0],"L4","L6"],
  ["blendRules",12,"AddFirst",[0,16,0],"I6","K6"],
  ["blendRules",12,"AddFirst",[0,17,0],"F4","J4"],
  ["blendRules",13,"AddFirst",[0,16,0],"G9","G11"],
  ["blendRules",14,"AddFirst",[0,1,0],"H9","J9"],
  ["copyGrassAndAppendBase"],
  ["grassRules",7,"RemoveFirst",[]],
  ["grassRules",11,"RemoveFirst",[]],
  ["grassRules",13,"RemoveFirst",[]],
  ["grassRules",14,"RemoveFirst",[]],
  ["grassRules",3,"RemoveFirst",[]],
  ["grassRules",6,"RemoveFirst",[]],
  ["grassRules",9,"RemoveFirst",[]],
  ["grassRules",12,"RemoveFirst",[]],
  ["blendRules",1,"AddFirst",[0,4368,0],"F13","H13"],
  ["blendRules",2,"AddFirst",[0,4353,0],"I12","K12"],
  ["blendRules",4,"AddFirst",[0,4113,0],"I13","K13"],
  ["blendRules",5,"AddFirst",[0,16,0],"B14","B16"],
  ["blendRules",5,"AddFirst",[0,4096,0],"A14","A16"],
  ["blendRules",8,"AddFirst",[0,273,0],"F12","H12"],
  ["blendRules",10,"AddFirst",[0,1,0],"C14","C16"],
  ["blendRules",10,"AddFirst",[0,256,0],"D14","D16"],
  ["blendRules",15,"AddFirst",[0,65536,0],"G1","K1"],
  ["blendRules",15,"AddFirst",[0,1048576,0],"G2","K2"],
  ["blendRules",15,"AddFirst",[0,16777216,0],"F2","J2"],
  ["blendRules",15,"AddFirst",[0,268435456,0],"F1","J1"],
  ["grassRules",1,"AddLast",[0,0,4112,0],"P1","R1"],
  ["grassRules",1,"AddLast",[0,0,4368,0],"R9","R11"],
  ["grassRules",2,"AddLast",[0,0,257,0],"Q3","Q5"],
  ["grassRules",2,"AddLast",[0,0,4353,0],"Q12","Q14"],
  ["grassRules",3,"AddLast",[0,1,0,65536],"Q6","Q8"],
  ["grassRules",4,"AddLast",[0,0,4112,0],"P2","R2"],
  ["grassRules",4,"AddLast",[0,0,4113,0],"R12","R14"],
  ["grassRules",6,"AddLast",[0,16,0,1048576],"Q9","Q11"],
  ["grassRules",7,"AddLast",[0,17,0,1118208],"O9","O15"],
  ["grassRules",7,"AddLast",[16,1,1048576,69632],"T1","T3"],
  ["grassRules",7,"AddLast",[1,16,65536,1052672],"T4","T6"],
  ["grassRules",8,"AddLast",[0,0,257,0],"P3","P5"],
  ["grassRules",8,"AddLast",[0,0,273,0],"P12","P14"],
  ["grassRules",9,"AddLast",[0,4096,0,268435456],"P6","P8"],
  ["grassRules",11,"AddLast",[0,4097,0,268501248],"N8","N14"],
  ["grassRules",11,"AddLast",[4096,1,268435456,65792],"U1","U3"],
  ["grassRules",11,"AddLast",[1,4096,65536,268435712],"U4","U6"],
  ["grassRules",12,"AddLast",[0,256,0,16777216],"P9","P11"],
  ["grassRules",13,"AddLast",[0,4352,0,285212688],"M9","M15"],
  ["grassRules",13,"AddLast",[256,4096,16777216,268435472],"S1","S3"],
  ["grassRules",13,"AddLast",[4096,256,268435456,16777232],"S4","S6"],
  ["grassRules",14,"AddLast",[0,272,0,17825793],"N10","N16"],
  ["grassRules",14,"AddLast",[16,256,1048576,16777217],"V1","V3"],
  ["grassRules",14,"AddLast",[256,16,16777216,1048577],"V4","V6"],
  ["grassRules",15,"AddLast",[0,4369,0,286326784],"N9","N15"],
  ["grassRules",15,"AddLast",[0,273,268435456,17891328],"S7","S9"],
  ["grassRules",15,"AddLast",[0,4368,65536,286261248],"T7","T9"],
  ["grassRules",15,"AddLast",[0,4113,16777216,269549568],"U7","U9"],
  ["grassRules",15,"AddLast",[0,4353,1048576,285278208],"V7","V9"],
  ["grassRules",15,"AddLast",[0,4112,0,269484032],"R3","R5"],
  ["grassRules",15,"AddLast",[0,257,0,16842752],"R6","R8"],
  ["grassRules",0,"AddFirst",[0,0,4368,1],"P2","R2"],
  ["grassRules",0,"AddFirst",[0,0,4353,16],"P3","P5"],
  ["grassRules",0,"AddFirst",[0,0,4113,256],"P1","R1"],
  ["grassRules",0,"AddFirst",[0,0,273,4096],"Q3","Q5"],
  ["grassRules",1,"AddFirst",[0,0,272,4097],"M1","M3"],
  ["grassRules",1,"AddFirst",[0,0,4352,17],"L1","L3"],
  ["grassRules",2,"AddFirst",[0,0,4097,272],"F5","H5"],
  ["grassRules",2,"AddFirst",[0,0,4352,17],"F6","H6"],
  ["grassRules",3,"AddFirst",[0,1,4352,65536],"G3","K3"],
  ["grassRules",4,"AddFirst",[0,0,17,4352],"M4","M6"],
  ["grassRules",4,"AddFirst",[0,0,4097,272],"L4","L6"],
  ["grassRules",6,"AddFirst",[0,16,4097,1048576],"G4","K4"],
  ["grassRules",7,"AddLast",[0,17,4096,1114112],"B7","B9"],
  ["grassRules",7,"AddLast",[0,1,4096,65536],"G3","K3"],
  ["grassRules",7,"AddLast",[0,16,4096,1048576],"G4","K4"],
  ["grassRules",8,"AddFirst",[0,0,17,4352],"I5","K5"],
  ["grassRules",8,"AddFirst",[0,0,272,4097],"I6","K6"],
  ["grassRules",9,"AddFirst",[0,4096,272,268435456],"F3","J3"],
  ["grassRules",11,"AddLast",[0,4097,256,268500992],"A12","C12"],
  ["grassRules",11,"AddLast",[0,1,256,65536],"G3","K3"],
  ["grassRules",11,"AddLast",[0,4096,256,268435456],"F3","J3"],
  ["grassRules",12,"AddFirst",[0,256,17,16777216],"F4","J4"],
  ["grassRules",13,"AddLast",[0,4352,16,285212672],"C7","C9"],
  ["grassRules",13,"AddLast",[0,256,16,16777216],"F4","J4"],
  ["grassRules",13,"AddLast",[0,4096,16,268435456],"F3","J3"],
  ["grassRules",14,"AddLast",[0,272,1,17825792],"A11","C11"],
  ["grassRules",14,"AddLast",[0,16,1,1048576],"G4","K4"],
  ["grassRules",14,"AddLast",[0,256,1,16777216],"F4","J4"],
  ["grassRules",15,"AddLast",[0,17,0,1114112],"B7","B9"],
  ["grassRules",15,"AddLast",[0,4352,0,285212672],"C7","C9"],
  ["grassRules",15,"AddLast",[0,272,0,17825792],"A11","C11"],
  ["grassRules",15,"AddLast",[0,4097,0,268500992],"A12","C12"],
  ["grassRules",15,"AddLast",[0,1,0,65536],"G3","K3"],
  ["grassRules",15,"AddLast",[0,16,0,1048576],"G4","K4"],
  ["grassRules",15,"AddLast",[0,256,0,16777216],"F4","J4"],
  ["grassRules",15,"AddLast",[0,4096,0,268435456],"F3","J3"]
];

const baseRules = Array.from({ length: 16 }, () => []);
const blendRules = Array.from({ length: 16 }, () => []);
const grassRules = Array.from({ length: 16 }, () => []);
const tables = { baseRules, blendRules, grassRules };
const cell = value => [Number(value.slice(1)) - 1, value.charCodeAt(0) - 65];
function makeRule(masks, start, end) {
  const [a, b] = [cell(start), cell(end)];
  const uv = [a, b.map((n, i) => n - Math.trunc((n - a[i]) / 2)), b].map(Object.freeze);
  const [ci, ce, bi, be] = masks.length === 1 ? [0, masks[0], 0, 0]
    : masks.length === 3 ? [0, masks[0], masks[1], masks[2] << 16] : masks;
  return { ci: ci << 16, ce: ce << 16, bi, be, uv };
}
for (const [table, bucket, operation, masks, start, end] of OPERATIONS) {
  if (table === 'copyGrassAndAppendBase') {
    for (let i = 0; i < 16; i++) {
      grassRules[i] = blendRules[i].slice();
      blendRules[i].push(...baseRules[i]);
    }
  } else if (operation === 'RemoveFirst') tables[table][bucket].shift();
  else tables[table][bucket][operation === 'AddFirst' ? 'unshift' : 'push'](makeRule(masks, start, end));
}
function matches(rule, neighbor, blend, relaxed) {
  if (relaxed) {
    for (let bit = 0x10000; bit <= 0x10000000; bit *= 16) {
      const a = rule.ci & bit, b = rule.bi & bit;
      if (a && b ? !(neighbor & a) && !(blend & b) : (a && !(neighbor & a)) || (b && !(blend & b))) return false;
    }
  } else if ((rule.ci & neighbor) !== rule.ci || (rule.bi & 0x11110000 & blend) !== (rule.bi & 0x11110000)) return false;
  if (rule.ce & neighbor) return false;
  const cardinal = rule.bi & 0x1111;
  if (cardinal && (cardinal ^ (blend & 0x1111))) return false;
  return !(rule.be & blend);
}
const bucketOf = mask => ((mask & 0x1000) >> 9) + ((mask & 0x100) >> 6) + ((mask & 0x10) >> 3) + (mask & 1);
export function getUVForMasks(neighbor, blend, strictness, variant = 0) {
  let bucket = bucketOf(neighbor);
  const rules = [baseRules, blendRules, grassRules][strictness][bucket];
  const found = rules.find(rule => matches(rule, neighbor, blend, strictness === 2));
  if (found) return found.uv[Math.min(variant, 2)];
  if (strictness === 2) {
    neighbor |= blend;
    bucket = bucketOf(neighbor);
    const fallback = baseRules[bucket].find(rule => matches(rule, neighbor, blend, false));
    if (fallback) return fallback.uv[Math.min(variant, 2)];
  }
  return [0, 0];
}

// Desktop lazy-merge reciprocal edge flags and tile merge metadata.
export const lazyMergeValidation = [[11,13,13,13,14,10,8,8,8,1,15,15,4,13,13,13],[11,15,15,15,14,10,15,15,15,1,15,15,4,7,7,7],[11,7,7,7,14,10,15,15,15,1,15,15,4,11,11,11],[9,12,9,12,9,12,2,2,2,0,0,0,0,14,14,14],[3,6,3,6,3,6,5,5,5,0,0,0,0,0,0,0],[15,15,15,15,11,14,8,10,15,15,15,15,15,0,0,0],[15,15,15,15,11,14,8,10,15,15,15,15,15,0,0,0],[15,15,15,15,11,14,8,10,15,15,15,15,15,0,0,0],[15,15,15,15,11,14,2,10,15,15,15,15,15,0,0,0],[15,15,15,15,11,14,2,10,15,15,15,15,15,0,0,0],[15,15,15,15,11,14,2,10,15,15,15,15,15,0,0,0],[13,13,13,13,13,13,15,15,15,5,5,5,0,0,0,0],[7,7,7,7,7,7,10,9,13,12,9,13,12,9,13,12],[4,4,4,1,1,1,10,11,15,14,11,15,14,11,15,14],[5,5,5,5,5,5,10,3,7,6,3,7,6,3,7,6],[11,14,13,13,13,9,9,9,12,12,12,15,15,15,0,0],[11,14,7,7,7,3,3,3,6,6,6,15,15,15,0,0],[11,14,15,15,15,15,15,15,15,15,15,15,15,15,0,0],[13,13,13,13,13,13,15,15,15,0,0,0,0,0,0,0],[7,7,7,7,7,7,15,15,15,0,0,0,0,0,0,0],[11,11,11,11,11,11,15,15,15,0,0,0,0,0,0,0],[14,14,14,14,14,14,15,15,15,0,0,0,0,0,0,0]];
