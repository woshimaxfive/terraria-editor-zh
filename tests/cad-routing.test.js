import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fixtures, fixtureRoot } from './worldFixtures.js';
import { wirePath, wireBus, detectVerticalFirst, cadWireCells } from '../src/editing/wireRouting.js';

// Golden outputs from the pinned desktop WireRouter and CommitCadPath methods.
// Full source references and license are retained in vendor/tedit-editing-rules/.
const sourceRoutes = [{"mode":"elbow90","direction":null,"points":[[49,49],[50,49],[51,49],[52,49],[53,49],[54,49],[55,49],[56,49],[57,49],[58,49],[59,49],[59,50],[59,51],[59,52],[59,53],[49,51],[50,51],[51,51],[52,51],[53,51],[54,51],[55,51],[56,51],[57,51],[57,52],[57,53]]},{"mode":"elbow90","direction":false,"points":[[49,49],[50,49],[51,49],[52,49],[53,49],[54,49],[55,49],[56,49],[57,49],[58,49],[59,49],[59,50],[59,51],[59,52],[59,53],[49,51],[50,51],[51,51],[52,51],[53,51],[54,51],[55,51],[56,51],[57,51],[57,52],[57,53]]},{"mode":"elbow90","direction":true,"points":[[49,48],[49,49],[49,50],[49,51],[49,52],[49,53],[49,54],[50,54],[51,54],[52,54],[53,54],[54,54],[55,54],[56,54],[57,54],[58,54],[51,48],[51,49],[51,50],[51,51],[51,52],[52,52],[53,52],[54,52],[55,52],[56,52],[57,52],[58,52]]},{"mode":"miter45","direction":null,"points":[[49,49],[50,49],[51,49],[52,49],[53,49],[54,49],[55,49],[56,49],[56,50],[57,50],[57,51],[58,51],[58,52],[59,52],[59,53],[49,51],[50,51],[51,51],[52,51],[53,51],[54,51],[55,51],[56,51],[56,52],[57,52],[57,53]]},{"mode":"miter45","direction":false,"points":[[49,49],[50,49],[51,49],[52,49],[53,49],[54,49],[55,49],[56,49],[56,50],[57,50],[57,51],[58,51],[58,52],[59,52],[59,53],[49,51],[50,51],[51,51],[52,51],[53,51],[54,51],[55,51],[56,51],[56,52],[57,52],[57,53]]},{"mode":"miter45","direction":true,"points":[[49,48],[49,49],[50,49],[50,50],[51,50],[51,51],[52,51],[52,52],[53,52],[53,53],[54,53],[54,54],[55,54],[56,54],[57,54],[58,54],[51,48],[51,49],[52,49],[52,50],[53,50],[53,51],[54,51],[54,52],[55,52],[56,52],[57,52],[58,52]]}];
const singleRoutes = [{"mode":"elbow90","vertical":false,"points":[[50,50],[51,50],[52,50],[53,50],[54,50],[55,50],[56,50],[57,50],[58,50],[58,51],[58,52],[58,53]]},{"mode":"elbow90","vertical":true,"points":[[50,50],[50,51],[50,52],[50,53],[51,53],[52,53],[53,53],[54,53],[55,53],[56,53],[57,53],[58,53]]},{"mode":"miter45","vertical":false,"points":[[50,50],[51,50],[52,50],[53,50],[54,50],[55,50],[56,50],[56,51],[57,51],[57,52],[58,52],[58,53]]},{"mode":"miter45","vertical":true,"points":[[50,50],[50,51],[51,51],[51,52],[52,52],[52,53],[53,53],[54,53],[55,53],[56,53],[57,53],[58,53]]}];
const clippedRoutes = [{"start":[0,0],"end":[3,12],"width":6,"height":8,"mode":"elbow90","direction":false,"clipped":true,"cells":[481,482,483,484,485,486,487,488,489,490,491,492,289,290,291,292,293,294,295,296,297,298,299,300,98,99,100,101,102,103,104,105,106,107,108],"saves":35,"steps":1},{"start":[0,0],"end":[3,12],"width":6,"height":8,"mode":"miter45","direction":true,"clipped":false,"cells":[11,12,108,109,205,206,302,0,1,2,3,4,5,6,7,8,9,10,106,107,203,204,300,192,193,194,195,196,197,198,199,200,201,202,298],"saves":35,"steps":1}];

const start = { x: 50, y: 50 }, end = { x: 58, y: 53 };
test('90-degree and staircase paths retain source order, endpoints and four-connectivity', () => {
  for (const c of singleRoutes) {
    const path = [...wirePath(start, end, c.mode, c.vertical)];
    assert.deepEqual(path.map(p => [p.x, p.y]), c.points);
    assert.equal(path.length, 12); assert.deepEqual(path[0], start); assert.deepEqual(path.at(-1), end);
    for (let i = 1; i < path.length; i++) assert.equal(Math.abs(path[i].x - path[i-1].x) + Math.abs(path[i].y - path[i-1].y), 1);
  }
  assert.equal(detectVerticalFirst(start, { x: 58, y: 58 }), false);
  assert.equal(detectVerticalFirst(start, { x: 53, y: 58 }), true);
});
test('bus lanes use source spacing, direction-dependent edge starts and exact ordered turns', () => {
  for (const c of sourceRoutes) {
    const vertical = c.direction ?? detectVerticalFirst(start, end);
    assert.deepEqual([...wireBus(start, end, 3, 5, c.mode, vertical)].map(p => [p.x,p.y]), c.points);
  }
  // Source single-axis buses can converge at the cursor.
  const straight = [...wireBus(start, { x: 58, y: 50 }, 3, 5, 'elbow90', false)];
  assert.equal(straight.length, 22);
  assert.equal(straight.filter(p => p.x === 58 && p.y === 50).length, 2);
});
test('world clipping, selection and first-visit deduplication match actual desktop commits', () => {
  for (const c of clippedRoutes) {
    const cells = cadWireCells({ width: 128, height: 96 }, { x: 0, y: 0 }, { x: 3, y: 12 }, {
      width: 6, height: 8, routingMode: c.mode, routingDirection: c.direction ? 'vertical' : 'horizontal',
    }, c.clipped ? { x: 1, y: 1, width: 60, height: 70 } : null);
    assert.deepEqual([...cells], c.cells); assert.equal(c.saves, cells.size);
  }
});
test('CAD keeps source dimension rules independently of stamp shape, transforms, hollow and spray', () => {
  const base = { width: 3, height: 5, routingMode: 'miter45', routingDirection: 'auto' };
  const expected = cadWireCells({ width: 128, height: 96 }, start, end, base);
  const actual = cadWireCells({ width: 128, height: 96 }, start, end, { ...base, shape: 'crescent', rotation: 45, flipHorizontal: true, hollow: true, spray: true });
  assert.deepEqual(actual, expected);
});
test('oversized paths and excessive off-selection work reject the entire uncommitted segment', () => {
  assert.throws(() => cadWireCells({ width: 128, height: 96 }, { x: 0, y: 0 }, { x: 127, y: 95 }, { width: 400, height: 400, routingMode: 'miter45' }), /10000/);
  assert.throws(() => cadWireCells({ width: 8400, height: 2400 }, { x: 0, y: 1200 }, { x: 8399, y: 1200 }, { width: 400, height: 400 }, { x: 0, y: 0, width: 1, height: 1 }), /计算量过大/);
});
test('malformed CAD dimensions, modes, directions and endpoints are rejected before drafting', () => {
  for (const extra of [{ width: 0 }, { width: 401 }, { height: 1.5 }, { routingMode: 'other' }, { routingDirection: 'other' }]) assert.throws(() => cadWireCells({ width: 128, height: 96 }, start, end, { width: 3, height: 5, ...extra }), /参数无效/);
  for (const point of [null, { x: -1, y: 0 }, { x: 128, y: 0 }, { x: 1.1, y: 0 }, { x: NaN, y: 0 }]) assert.throws(() => cadWireCells({ width: 128, height: 96 }, point, end, { width: 3, height: 5 }), /端点/);
});

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const {preservesOtherSections}=await server.ssrLoadModule('/src/adapters/verifyExport.js');
const parse=async b=>(await new FileReader().loadBuffer(b)).parse();
after(() => server.close());
const routes = sourceRoutes;
for (const fixture of fixtures) test(fixture.name + ': six CAD buses edit only selected wires with independent history and lossless export', async () => {
  const input=await readFile(new URL(fixture.name+'.wld',fixtureRoot)),bytes=input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),document=await openWorld(bytes);
 const seed=[];for(let i=0;i<6;i++)for(let x=90+i*40;x<126+i*40;x++)for(let y=5;y<40;y++)seed.push(x*document.summary.height+y);
 document.paint({cells:seed,blockId:30});document.paint({cells:seed,layer:'wall',wallId:1});document.paint({cells:seed,layer:'liquid',liquidAmount:77,liquidType:1});document.paint({cells:seed,layer:'wire',wireMask:8});
 document.paint({cells:seed,layer:'paint',appearance:{target:'block',mode:'color',color:8}});document.paint({cells:seed,layer:'paint',appearance:{target:'wall',mode:'color',color:9}});
 const baseline=document.serialize(),original=(await parse(baseline)).worldTiles.tiles,expected=Object.fromEntries(TILE_FIELDS.map(f=>[f,original[f].slice()])),history=document.editState.undoCount,all=new Set();
 for(const[i,r]of routes.entries()){const start={x:100+i*40,y:20},end={x:start.x+8,y:23},settings={width:3,height:5,routingMode:r.mode,routingDirection:r.direction===null?'auto':r.direction?'vertical':'horizontal'};
 const cells=cadWireCells(document.summary,start,end,settings),golden=new Set(r.points.map(([x,y])=>(x+start.x-50)*document.summary.height+y-30));assert.deepEqual([...cells],[...golden]);
 assert.equal(document.paint({layer:'wire',wireMask:5,cells:[...cells]}).changed,cells.size);for(const index of golden){expected.flags[index]|=10;all.add(index);}}
 assert.equal(document.editState.undoCount,history+6);const output=document.serialize(),actual=(await parse(output)).worldTiles.tiles;
 for(const field of TILE_FIELDS)assert.deepEqual(actual[field],expected[field],fixture.name+' '+field);assert.equal(preservesOtherSections(bytes,output),true);
 document.erase({layer:'wire',wireMask:5,cells:[...all]});const erased=(await parse(document.serialize())).worldTiles.tiles;for(const i of all)assert.equal(erased.flags[i],expected.flags[i]&~10);document.undo();assert.deepEqual(new Uint8Array(document.serialize()),new Uint8Array(output));
 document.undo();document.redo();assert.deepEqual(new Uint8Array(document.serialize()),new Uint8Array(output));for(let i=0;i<6;i++)document.undo();assert.deepEqual(new Uint8Array(document.serialize()),new Uint8Array(baseline));
});
