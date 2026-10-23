// Adapted from TEdit ClipboardBuffer.Flip/FlipName/FlipFramed and Tile.ClearTile.
// Copyright TEdit contributors. MS-PL; see LICENSE and source.json in this folder.
const replaceName = (name, horizontal) => String(name ?? '').replace(horizontal ? /Right|Left/g : /Bottom|Top|Down|Up/g,
  word => ({ Right:'Left', Left:'Right', Bottom:'Top', Top:'Bottom', Down:'Up', Up:'Down' })[word]);
export function mirrorFurnitureStyle(tile, index, horizontal) {
  const current = tile.styles[index], anchor = current.anchor ?? 'None';
  const matching = frame => (frame.name === current.name || frame.name === replaceName(current.name, horizontal)) &&
    (frame.variety === current.variety || frame.variety === replaceName(current.variety, horizontal));
  let candidates = [];
  if (anchor !== 'None' && anchor !== 'Center') {
    const opposite = horizontal ? {Left:'Right',Right:'Left'}[anchor] : {Top:'Bottom',Bottom:'Top'}[anchor];
    if (opposite) candidates = tile.styles.map((frame, i) => ({frame,i})).filter(({frame,i}) =>
      i !== index && frame.anchor === opposite && matching(frame));
  } else if ((horizontal ? /Left|Right/ : /Top|Bottom|Up|Down/).test((current.name ?? '') + (current.variety ?? ''))) {
    candidates = tile.styles.map((frame,i) => ({frame,i})).filter(({frame,i}) => i !== index && matching(frame) &&
      !(frame.name === current.name && frame.variety === current.variety));
  }
  return candidates.length === 1 ? candidates[0].i : index;
}
export function mirrorFurnitureOrigin(width, height, owner, size, horizontal) {
  return horizontal ? {x:width-owner.x-size.width,y:owner.y} : {x:owner.x,y:height-owner.y-size.height};
}
// Exact desktop style mapping: Rotate applies FlipY, then transposes cells.
// Three Rotate calls provide the left rotation. Half bricks keep their style.
export const DESKTOP_SLOPES = {
  clockwise:[0,1,4,5,2,3], counterclockwise:[0,1,4,5,2,3],
  horizontal:[0,1,3,2,5,4], vertical:[0,1,4,5,2,3],
};
export function clearClipboardTile(tile) {
  const result = [...tile]; result[0]=result[1]=result[2]=result[3]=0;
  result[8] &= ~(1 | 32 | 64 | 128 | 512 | (7 << 11));
  return result;
}
