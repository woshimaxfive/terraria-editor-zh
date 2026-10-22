import React from 'react';

const paths = {
  open: 'M3 7h6l2 2h10l-3 11H3V7Zm0 0V4h7l2 3h7v2',
  save: 'M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5',
  close: 'm6 6 12 12M18 6 6 18',
  copy: 'M8 8h13v13H8V8ZM16 5V2H2v14h3',
  paste: 'M8 4H4v18h16V4h-4M8 2h8v5H8V2Zm0 10h8m-8 5h8',
  pan: 'm8 12-2-2a2 2 0 0 0-3 2l4 7h9l4-8a2 2 0 0 0-3-2V6a2 2 0 0 0-3 0V4a2 2 0 0 0-3 0v2a2 2 0 0 0-3 0v6Z',
  paint: 'm14 4 6 6M4 20l5-1L21 7l-4-4L5 15l-1 5Z',
  erase: 'm4 13 9-10 8 8-9 10H9l-5-5v-3Zm4-4 8 8M12 21h9',
  fill: 'm8 3 10 10-8 8L2 13 12 3m-8 8h12m4 3s-3 3-3 5a3 3 0 0 0 6 0c0-2-3-5-3-5Z',
  pick: 'm14 3 7 7m-5-5-4 4 3 3 4-4M12 9 4 17v3h3l8-8',
  select: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M8 8h8v8H8Z',
  point: 'M12 22s8-8 8-14a8 8 0 1 0-16 0c0 6 8 14 8 14ZM15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  undo: 'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14',
  redo: 'm16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14',
  layers: 'm12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5',
  template: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  panel: 'M3 4h18v16H3V4Zm12 0v16m3-12v1m0 3v1',
  help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  world: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c6 6 6 14 0 20-6-6-6-14 0-20Z',
};

export default function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.world} /></svg>;
}
