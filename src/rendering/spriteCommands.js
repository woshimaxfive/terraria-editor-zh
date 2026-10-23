// SPDX-License-Identifier: MS-PL
// Desktop offset quantization adapted from TEdit WorldRenderXna, TEdit contributors.
// Fixed sources and full license: vendor/tedit-blend-rules/.
// One bounded, transferable record per sprite. Offsets use half-pixels so the
// anchor and render shift can retain the desktop's separate zoom truncation.
export const SPRITE_STRIDE = 14;

export function spriteCommand(id, frame, column, row) {
  return [id,frame.sourceX,frame.sourceY,frame.width,frame.height,column,row,
    frame.destWidth ?? frame.width,frame.destHeight ?? frame.height,
    (frame.anchorX ?? 0)*2,(frame.anchorY ?? 0)*2,frame.shiftX ?? 0,frame.shiftY ?? frame.offsetY ?? 0,
    Number(frame.flip ?? false) | (frame.destWidth !== undefined ? 2 : 0)];
}

export function drawSprites(context, commands, images, x, y, zoom) {
  for (let i = 0; i < commands.length; i += SPRITE_STRIDE) {
    const atlas = images.get(commands[i]);
    if (!atlas) continue;
    const dx = x+commands[i+5]*zoom+Math.trunc(commands[i+9]*zoom/32)+Math.trunc(commands[i+11]*zoom/16);
    const dy = y+commands[i+6]*zoom+Math.trunc(commands[i+10]*zoom/32)+Math.trunc(commands[i+12]*zoom/16);
    const quantize = commands[i+13]&2 ? Math.trunc : value => value;
    const width = quantize(commands[i+7]*zoom/16), height = quantize(commands[i+8]*zoom/16);
    const args = [atlas,commands[i+1],commands[i+2],commands[i+3],commands[i+4]];
    if (!(commands[i+13]&1)) context.drawImage(...args,dx,dy,width,height);
    else {
      context.save();
      try { context.translate(dx+width,dy); context.scale(-1,1); context.drawImage(...args,0,0,width,height); }
      finally { context.restore(); }
    }
  }
}
