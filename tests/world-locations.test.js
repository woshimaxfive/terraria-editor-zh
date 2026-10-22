import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {fixtures, fixtureRoot} from './worldFixtures.js';
import {guidBytes, guidText, pointChanges, initializeTeamDraft} from '../src/editing/worldIdentity.js';

const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
after(()=>server.close());
const {openWorld}=await server.ssrLoadModule('/src/adapters/worldFile.js');
const {FileReader,FileSaver}=await server.ssrLoadModule('/vendor/terraria-world-file/src/index.ts');
const {TILE_FIELDS}=await server.ssrLoadModule('/src/adapters/blockEditing.js');
const input=async name=>{const b=await readFile(new URL(name+'.wld',fixtureRoot));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const parse=async bytes=>(await new FileReader().loadBuffer(bytes)).parse();
const payload=(doc,changes)=>({revision:doc.editState.revision,changes});
const equalBytes=(a,b)=>assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
function untouched(a,b){
 for(const field of TILE_FIELDS)assert.deepEqual(b.worldTiles.tiles[field],a.worldTiles.tiles[field],field);
 for(const key of ['chests','signs','NPCs','tileEntities','weightedPressurePlates','townManager','bestiary','creativePowers'])assert.deepEqual(b[key],a[key],key);
}
const canonical='00112233-4455-6677-8899-aabbccddeeff';
const nativeBytes=new Uint8Array([0x33,0x22,0x11,0,0x55,0x44,0x77,0x66,0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff]);

test('identity GUIDs use native mixed-endian bytes, accept uppercase and reject noncanonical or malformed text',()=>{
 assert.deepEqual(guidBytes(canonical),nativeBytes);assert.deepEqual(guidBytes(canonical.toUpperCase()),nativeBytes);assert.equal(guidText(nativeBytes),canonical);
 for(const text of ['00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff'])assert.equal(guidText(guidBytes(text)),text);
 for(const value of ['',null,0,'00112233445566778899aabbccddeeff',canonical+' ',canonical.replace('a','g'),'{'+canonical+'}'])assert.equal(guidBytes(value),null);
 assert.deepEqual(pointChanges('team5',{x:100,y:200}),{team5X:100,team5Y:200});assert.equal(pointChanges('team6',{x:1,y:2}),null);
});

test('initial team drafts capture the spawn at enable time independently of subsequent spawn edits',()=>{
 const original={spawnX:100,spawnY:200};const initialized=initializeTeamDraft(original);original.spawnX=300;
 assert.deepEqual(initialized,{team0X:100,team0Y:200,team1X:100,team1Y:200,team2X:100,team2Y:200,team3X:100,team3Y:200,team4X:100,team4Y:200,team5X:100,team5Y:200});
});

for(const fixture of fixtures)test(fixture.name+': native identity and bounded locations preserve every other field, object and tile and restore exact original bytes',async()=>{
 const bytes=await input(fixture.name),before=await parse(bytes),doc=await openWorld(bytes),w=doc.summary.width,h=doc.summary.height;
 const changes={identityId:-2147483648,identityGuid:canonical.toUpperCase(),spawnX:0,spawnY:h-1,dungeonX:w-1,dungeonY:0};
 assert.equal(doc.editWorldProperties(payload(doc,changes)).changed,1);const out=doc.serialize(),actual=await parse(out);
 assert.deepEqual({...actual.header},{...before.header,worldId:-2147483648,guid:nativeBytes,spawnTileX:0,spawnTileY:h-1,dungeonX:w-1,dungeonY:0});
 assert.deepEqual({...actual.footer},{...before.footer,signoff3:-2147483648});untouched(before,actual);
 assert.equal(doc.summary.worldId,-2147483648);assert.equal(doc.summary.guid,canonical);assert.deepEqual(doc.summary.spawn,{x:0,y:h-1});assert.deepEqual(doc.summary.dungeon,{x:w-1,y:0});
 assert.deepEqual(doc.summary.points.slice(0,2),[{id:'spawn',label:'出生点',x:0,y:h-1},{id:'dungeon',label:'地牢入口',x:w-1,y:0}]);
 assert.equal(doc.readWorldProperties().values.identityGuid,canonical);assert.equal(doc.editWorldProperties(payload(doc,{identityGuid:canonical.toUpperCase(),identityId:-2147483648})).changed,0);
 assert.equal(doc.editState.dirty,false);doc.undo();equalBytes(doc.serialize(),bytes);assert.deepEqual(doc.summary.spawn,{x:before.header.spawnTileX,y:before.header.spawnTileY});
 doc.redo();equalBytes(doc.serialize(),out);
});

test('empty modern team lists initialize all six points as one transaction and respect explicit per-team draft positions',async()=>{
 const before=await parse(await input('v1.4.5.5'));before.header.teamSpawns=[];before.header.teamBasedSpawnsSeed=false;
 const bytes=new FileSaver().save(before),doc=await openWorld(bytes);
 doc.editWorldProperties(payload(doc,{teamSpawnsEnabled:true,spawnX:100,spawnY:200,team2X:300,team2Y:400}));const out=doc.serialize(),actual=await parse(out);
 assert.deepEqual(actual.header.teamSpawns,[{x:100,y:200},{x:100,y:200},{x:300,y:400},{x:100,y:200},{x:100,y:200},{x:100,y:200}]);
 assert.deepEqual({...actual.header},{...before.header,spawnTileX:100,spawnTileY:200,teamBasedSpawnsSeed:true,teamSpawns:actual.header.teamSpawns});untouched(before,actual);
 assert.equal(doc.summary.points.filter(point=>!point.id.startsWith('npc:')).length,8);assert.equal(doc.readWorldProperties().constraints.teamSpawnCount,6);doc.undo();equalBytes(doc.serialize(),bytes);doc.redo();equalBytes(doc.serialize(),out);
 doc.undo();const captured=initializeTeamDraft({spawnX:before.header.spawnTileX,spawnY:before.header.spawnTileY});
 doc.editWorldProperties(payload(doc,{teamSpawnsEnabled:true,spawnX:101,spawnY:201,...captured}));
 assert.deepEqual((await parse(doc.serialize())).header.teamSpawns,Array.from({length:6},()=>({x:before.header.spawnTileX,y:before.header.spawnTileY})));
});

test('nonempty team lists retain their count, disabled state, unknown coordinates and extra entries across unrelated and targeted edits',async()=>{
 const world=await parse(await input('v1.4.5.5'));world.header.teamBasedSpawnsSeed=false;
 world.header.teamSpawns=[{x:10,y:20},{x:-1,y:-2},{x:30,y:40},{x:50,y:60},{x:70,y:80},{x:90,y:100},{x:-32768,y:32767},{x:123,y:456}];
 const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
 doc.editWorldProperties(payload(doc,{identityId:2147483647,team0X:42}));const actual=await parse(doc.serialize());
 assert.deepEqual({...actual.header},{...world.header,worldId:2147483647,teamSpawns:[{x:42,y:20},...world.header.teamSpawns.slice(1)]});
 assert.equal(doc.summary.points.filter(point=>!point.id.startsWith('npc:')).length,8);assert.equal(doc.readWorldProperties().values.team1X,-1);untouched(world,actual);doc.undo();equalBytes(doc.serialize(),bytes);
 world.header.teamSpawns=[{x:1,y:2},{x:3,y:4}];const shortBytes=new FileSaver().save(world),short=await openWorld(shortBytes);
 short.editWorldProperties(payload(short,{teamSpawnsEnabled:true}));assert.deepEqual((await parse(short.serialize())).header.teamSpawns,world.header.teamSpawns);
 assert.throws(()=>short.editWorldProperties(payload(short,{team2X:10})),/参数无效/);assert.equal(short.readWorldProperties().fields.some(field=>field.id==='team2X'),false);
});

test('invalid identities, coordinates, raw fields, unavailable teams and stale revisions reject the entire transaction',async()=>{
 const bytes=await input('v1.3.5.3'),doc=await openWorld(bytes);
 for(const change of [{identityId:2147483648},{identityId:-2147483649},{identityId:1.5},{identityId:'1'},{identityGuid:'invalid'},
  {spawnX:-1},{spawnX:doc.summary.width},{spawnY:doc.summary.height},{dungeonX:0.5},{dungeonY:Infinity},{worldId:1},{guid:[...nativeBytes]},
  {spawnTileX:5},{teamSpawnsEnabled:true},{team0X:5},{teamSpawns:[{x:1,y:2}]}])assert.throws(()=>doc.editWorldProperties(payload(doc,{name:'不得部分写入',...change})),/参数无效/);
 assert.throws(()=>doc.editWorldProperties({revision:99,changes:{identityId:1}}),/版本已变化/);assert.equal(doc.editState.undoCount,0);equalBytes(doc.serialize(),bytes);
 const modern=await parse(await input('v1.4.5.5'));modern.header.teamSpawns=[];modern.header.teamBasedSpawnsSeed=false;const original=new FileSaver().save(modern),noTeams=await openWorld(original);
 assert.throws(()=>noTeams.editWorldProperties(payload(noTeams,{name:'仍不写入',team0X:5})),/参数无效/);equalBytes(noTeams.serialize(),original);
});

test('already enabled empty team data remains raw on unrelated edits and initializes only on explicit location edits',async()=>{
 const world=await parse(await input('v1.4.5.5'));world.header.teamBasedSpawnsSeed=true;world.header.teamSpawns=[];
 const bytes=new FileSaver().save(world),doc=await openWorld(bytes);
 doc.editWorldProperties(payload(doc,{identityId:-7}));const identity=doc.serialize();assert.deepEqual((await parse(identity)).header.teamSpawns,[]);
 doc.editWorldProperties(payload(doc,{team0X:12,team0Y:34}));const actual=await parse(doc.serialize());
 assert.deepEqual(actual.header.teamSpawns,[{x:12,y:34},...Array.from({length:5},()=>({x:world.header.spawnTileX,y:world.header.spawnTileY}))]);
 doc.undo();equalBytes(doc.serialize(),identity);doc.undo();equalBytes(doc.serialize(),bytes);
 world.header.spawnTileX=-1;const bad=new FileSaver().save(world),invalid=await openWorld(bad);
 assert.throws(()=>invalid.editWorldProperties(payload(invalid,{team0X:10})),/参数无效/);equalBytes(invalid.serialize(),bad);
});

test('identity, team points, existing chest and tile edits share chronological undo and redo including footer and live summary',async()=>{
 const bytes=await input('v1.4.5.5'),doc=await openWorld(bytes);
 doc.editWorldProperties(payload(doc,{identityId:-42,identityGuid:canonical,spawnX:100,spawnY:200}));const identity=doc.serialize();
 const chest=doc.readObject({kind:'chest',index:0});doc.editObject({revision:doc.editState.revision,kind:'chest',index:0,changes:{name:'位置混合历史箱子'}});const object=doc.serialize();
 const x=10,y=10;doc.paint({layer:'wire',wireMask:1,cells:[x*doc.summary.height+y]});const tile=doc.serialize();
 assert.equal(doc.editState.undoCount,3);doc.undo();equalBytes(doc.serialize(),object);doc.undo();equalBytes(doc.serialize(),identity);doc.undo();equalBytes(doc.serialize(),bytes);
 doc.redo();doc.redo();doc.redo();equalBytes(doc.serialize(),tile);assert.equal(doc.summary.worldId,-42);assert.deepEqual(doc.summary.spawn,{x:100,y:200});
 assert.ok(chest);
});
