import BinarySaver from '../../vendor/terraria-world-file/src/BinarySaver.ts';
import HeaderIO from '../../vendor/terraria-world-file/src/section/Header.ts';
import FooterIO from '../../vendor/terraria-world-file/src/section/Footer.ts';
import { EditError } from '../editing/brush.js';
import catalogue from '../../vendor/tedit-world-properties/catalogue.json' with { type: 'json' };
import { worldLayerLimits } from '../editing/worldPropertyRules.js';

// Field semantics and limits follow the pinned desktop WorldPropertiesView.
// Storage fields and third-party section objects stay inside this adapter.
const definitions = [];
function field(id, storage, label, group, type, options = {}) {
  definitions.push({ id, storage, label, group, type, since: 194, ...options });
}
const boolean = (id, storage, label, group, since = 194) => field(id, storage, label, group, 'boolean', { since });
const number = (id, storage, label, group, min, max, options = {}) => field(id, storage, label, group, 'number', { min, max, integer: true, ...options });
field('name', 'mapName', '世界名称', '基本', 'text');
field('difficulty', 'gameMode', '世界难度', '基本', 'select', { options: [[0, '经典'], [1, '专家'], [2, '大师'], [3, '旅行']] });
boolean('hardmode', 'hardMode', '困难模式（已击败血肉墙）', '基本');
field('clock', null, '世界时间', '时间与天气', 'clock');
field('moonPhase', 'tempMoonPhase', '月相', '时间与天气', 'select', { options: ['满月', '亏凸月', '下弦月', '残月', '新月', '娥眉月', '上弦月', '盈凸月'].map((label, id) => [id, label]) });
boolean('bloodMoon', 'tempBloodMoon', '血月', '时间与天气');
boolean('eclipse', 'tempEclipse', '日食', '时间与天气');
boolean('raining', 'tempRaining', '正在下雨', '时间与天气');
number('rainTime', 'tempRainTime', '剩余降雨时间', '时间与天气', 0, 999999);
number('rainIntensity', 'tempMaxRain', '降雨强度', '时间与天气', 0, 1, { integer: false, float32: true, step: 0.01 });
number('slimeRainTime', 'slimeRainTime', '史莱姆雨剩余时间', '时间与天气', 0, 65534, { integer: false });
field('cloudBackground', 'cloudBGActive', '云层背景', '时间与天气', 'select', { options: [[0, '关闭'], [1, '开启']] });
number('clouds', 'numClouds', '云朵数量', '时间与天气', 0, 128);
number('wind', 'windSpeed', '风速（负值向左）', '时间与天气', -1.2, 1.2, { integer: false, float32: true, step: 0.01 });
boolean('sandstorm', 'Temp_Sandstorm_Happening', '沙尘暴', '时间与天气');
number('sandstormTime', 'Temp_Sandstorm_TimeLeft', '沙尘暴剩余时间', '时间与天气', 0, 86400);
number('sandstormIntensity', 'Temp_Sandstorm_Severity', '沙尘暴强度', '时间与天气', 0, 1, { integer: false, float32: true, step: 0.1 });
number('sandstormTarget', 'Temp_Sandstorm_IntendedSeverity', '沙尘暴目标强度', '时间与天气', 0, 1, { integer: false, float32: true, step: 0.1 });
boolean('sundialActive', 'fastForwardTimeToDawn', '日晷加速至黎明', '时间与天气');
number('sundialCooldown', 'sundialCooldown', '日晷冷却天数', '时间与天气', 0, 127);
boolean('moondialActive', 'fastForwardTimeToDusk', '月晷加速至黄昏', '时间与天气', 269);
number('moondialCooldown', 'moondialCooldown', '月晷冷却天数', '时间与天气', 0, 127, { since: 269 });

for (const [id, storage, label, since] of [
  ['kingSlime', 'downedSlimeKing', '史莱姆王'], ['eye', 'downedBoss1', '克苏鲁之眼'],
  ['evilBoss', 'downedBoss2', '世界吞噬怪 / 克苏鲁之脑'], ['queenBee', 'downedQueenBee', '蜂王'],
  ['skeletron', 'downedBoss3', '骷髅王'], ['destroyer', 'downedMechBoss1', '毁灭者'],
  ['twins', 'downedMechBoss2', '双子魔眼'], ['prime', 'downedMechBoss3', '机械骷髅王'],
  ['plantera', 'downedPlantBoss', '世纪之花'], ['golem', 'downedGolemBoss', '石巨人'],
  ['fishron', 'downedFishron', '猪龙鱼公爵'], ['cultist', 'downedAncientCultist', '拜月教邪教徒'],
  ['moonlord', 'downedMoonlord', '月亮领主'], ['queenSlime', 'downedQueenSlime', '史莱姆皇后', 225],
  ['empress', 'downedEmpressOfLight', '光之女皇', 225], ['deerclops', 'downedDeerclops', '独眼巨鹿', 240],
  ['pumpking', 'downedHalloweenKing', '南瓜王'], ['mourningWood', 'downedHalloweenTree', '哀木'],
  ['iceQueen', 'downedChristmasIceQueen', '冰雪女王'], ['santank', 'downedChristmasSantank', '圣诞坦克'],
  ['everscream', 'downedChristmasTree', '常绿尖叫怪'],
]) boolean(id, storage, '已击败' + label, 'Boss 进度', since);

for (const [id, storage, label, since] of [
  ['goblins', 'downedGoblins', '已击败哥布林军队'], ['clown', 'downedClown', '已击败小丑'],
  ['frostLegion', 'downedFrost', '已击败雪人军团'], ['pirates', 'downedPirates', '已击败海盗入侵'],
  ['martians', 'downedMartians', '已击败火星暴乱'],
  ['army1', 'DD2Event_DownedInvasionT1', '已完成撒旦军队第一级'], ['army2', 'DD2Event_DownedInvasionT2', '已完成撒旦军队第二级'],
  ['army3', 'DD2Event_DownedInvasionT3', '已完成撒旦军队第三级'],
  ['solarDown', 'downedTowerSolar', '已击败日耀柱'], ['vortexDown', 'downedTowerVortex', '已击败星旋柱'],
  ['nebulaDown', 'downedTowerNebula', '已击败星云柱'], ['stardustDown', 'downedTowerStardust', '已击败星尘柱'],
  ['solarActive', 'TowerActiveSolar', '日耀柱激活'], ['vortexActive', 'TowerActiveVortex', '星旋柱激活'],
  ['nebulaActive', 'TowerActiveNebula', '星云柱激活'], ['stardustActive', 'TowerActiveStardust', '星尘柱激活'],
  ['lunarEvent', 'LunarApocalypseIsUp', '月亮事件进行中'],
  ['manualParty', 'tempPartyManual', '手动派对'], ['naturalParty', 'tempPartyGenuine', '自然派对'],
  ['lanternNatural', 'lanternNightGenuine', '自然灯笼夜', 225], ['lanternManual', 'lanternNightManual', '手动灯笼夜', 225],
  ['lanternNext', 'lanternNightNextNightIsGenuine', '下个夜晚为灯笼夜', 225],
  ['halloween', 'forceHalloweenForToday', '今日万圣节', 225], ['christmas', 'forceXMasForToday', '今日圣诞节', 225],
  ['halloweenAlways', 'forceHalloweenForever', '永久万圣节', 287], ['christmasAlways', 'forceXMasForever', '永久圣诞节', 287],
]) boolean(id, storage, label, '事件进度', since);

for (const [id, storage, label, since] of [
  ['goblinSaved', 'savedGoblin', '已救出哥布林工匠'], ['wizardSaved', 'savedWizard', '已救出巫师'],
  ['mechanicSaved', 'savedMech', '已救出机械师'], ['anglerSaved', 'savedAngler', '已找到渔夫'],
  ['stylistSaved', 'savedStylist', '已救出发型师'], ['taxCollectorSaved', 'savedTaxCollector', '已救出税收官'],
  ['bartenderSaved', 'savedBartender', '已找到酒馆老板'], ['golferSaved', 'savedGolfer', '已救出高尔夫球手', 225],
  ['cat', 'boughtCat', '已购买猫咪', 225], ['dog', 'boughtDog', '已购买狗狗', 225], ['bunny', 'boughtBunny', '已购买兔兔', 225],
  ['merchant', 'unlockedMerchantSpawn', '已解锁商人', 269], ['demolitionist', 'unlockedDemolitionistSpawn', '已解锁爆破专家', 269],
  ['partyGirl', 'unlockedPartyGirlSpawn', '已解锁派对女孩', 269], ['dyeTrader', 'unlockedDyeTraderSpawn', '已解锁染料商', 269],
  ['truffle', 'unlockedTruffleSpawn', '已解锁松露人', 269], ['armsDealer', 'unlockedArmsDealerSpawn', '已解锁军火商', 269],
  ['nurse', 'unlockedNurseSpawn', '已解锁护士', 269], ['princess', 'unlockedPrincessSpawn', '已解锁公主', 269],
  ['slimeBlue', 'unlockedSlimeBlueSpawn', '已解锁城镇史莱姆：呆瓜', 269],
  ['slimeGreen', 'unlockedSlimeGreenSpawn', '已解锁城镇史莱姆：粗暴', 269],
  ['slimeOld', 'unlockedSlimeOldSpawn', '已解锁城镇史莱姆：长者', 269],
  ['slimePurple', 'unlockedSlimePurpleSpawn', '已解锁城镇史莱姆：笨拙', 269],
  ['slimeRainbow', 'unlockedSlimeRainbowSpawn', '已解锁城镇史莱姆：天后', 269],
  ['slimeRed', 'unlockedSlimeRedSpawn', '已解锁城镇史莱姆：酷酷', 269],
  ['slimeYellow', 'unlockedSlimeYellowSpawn', '已解锁城镇史莱姆：神秘', 269],
  ['slimeCopper', 'unlockedSlimeCopperSpawn', '已解锁城镇史莱姆：侍卫', 269],
  ['combatBook', 'combatBookWasUsed', '已使用战斗手册', 225], ['combatBook2', 'combatBookVolumeTwoWasUsed', '已使用战斗手册第二卷', 269],
  ['satchel', 'peddlersSatchelWasUsed', '已使用商贩背包', 269],
]) boolean(id, storage, label, '居民与增益', since);

field('moonType', 'moonType', '月亮外观', '时间与天气', 'select', { options: ['灰色', '棕色', '星环', '蓝色大理石', '白色冰月', '绿色气态', '粉色', '橙色金星', '三重紫月'].map((label, id) => [id, label]) });
boolean('crimson', 'crimson', '猩红世界', '矿物与邪恶');
boolean('meteor', 'spawnMeteor', '生成陨石标记', '矿物与邪恶');
boolean('orbSmashed', 'shadowOrbSmashed', '已破坏暗影珠或猩红之心', '矿物与邪恶');
number('orbCount', 'shadowOrbCount', '暗影珠 / 猩红之心计数', '矿物与邪恶', 0, 3);
number('altars', 'altarCount', '祭坛计数', '矿物与邪恶', 0, 3);
for (const [id, storage, label, options, since] of [
  ['copperOre', 'savedOreTierCopper', '铜 / 锡矿', [[7, '铜矿'], [166, '锡矿']], 225],
  ['ironOre', 'savedOreTierIron', '铁 / 铅矿', [[6, '铁矿'], [167, '铅矿']], 225],
  ['silverOre', 'savedOreTierSilver', '银 / 钨矿', [[9, '银矿'], [168, '钨矿']], 225],
  ['goldOre', 'savedOreTierGold', '金 / 铂金矿', [[8, '金矿'], [169, '铂金矿']], 225],
  ['cobaltOre', 'oreTier1', '钴 / 钯金矿', [[107, '钴矿'], [221, '钯金矿']], 194],
  ['mythrilOre', 'oreTier2', '秘银 / 山铜矿', [[108, '秘银矿'], [222, '山铜矿']], 194],
  ['adamantiteOre', 'oreTier3', '精金 / 钛金矿', [[111, '精金矿'], [223, '钛金矿']], 194],
]) field(id, storage, label, '矿物与邪恶', 'select', { since, options: [[-1, '尚未确定'], ...options] });
field('invasion', 'invasionType', '当前入侵类型', '事件参数', 'select', { options: [[0, '无入侵'], [1, '哥布林军队'], [2, '雪人军团'], [3, '海盗入侵'], [4, '火星暴乱']] });
number('invasionSize', 'invasionSize', '入侵剩余数量', '事件参数', 0, 1000);
number('invasionX', 'invasionX', '入侵位置 X', '事件参数', 0, null, { widthBound: true, integer: false });
number('cultistDelay', 'tempCultistDelay', '邪教徒生成延迟', '事件参数', 0, 86400);
number('lanternCooldown', 'lanternNightCooldown', '灯笼夜冷却计数', '事件参数', 0, 2147483647, { since: 225 });
field('anglerQuest', 'anglerQuest', '当前渔夫任务', '居民与增益', 'select', { options: catalogue.quests.map(([id, name, label]) => [id, label]) });
boolean('partyOfDoom', 'afterPartyOfDoom', '派对后的世界标记', '事件参数', 257);

for (let index = 0; index < 3; index++) {
  number('treeSplit' + index, 'treeX', `树木分界 ${index + 1} X`, '树木与洞穴', 0, null, { component: index, widthBound: true });
  number('caveSplit' + index, 'caveBackX', `洞穴分界 ${index + 1} X`, '树木与洞穴', 0, null, { component: index, widthBound: true });
}
function style(id, storage, label, group, key, options = {}) {
  field(id, storage, label, group, 'select', { options: catalogue.backgrounds[key].map(([id, name, label]) => [id, `${label} · ${id}`]), ...options });
}
for (let index = 0; index < 4; index++) {
  style('treeStyle' + index, 'treeStyle', `树木区域 ${index + 1} 样式`, '树木与洞穴', 'treeStyles', { component: index });
  style('caveStyle' + index, 'caveBackStyle', `洞穴区域 ${index + 1} 样式`, '树木与洞穴', 'caveBackgrounds', { component: index });
}
style('iceCave', 'iceBackStyle', '地下雪原样式', '树木与洞穴', 'iceBackgrounds');
style('jungleCave', 'jungleBackStyle', '地下丛林样式', '树木与洞穴', 'jungleUndergroundBackgrounds');
style('hellCave', 'hellBackStyle', '洞穴底部样式', '树木与洞穴', 'hellBackgrounds');
for (const [id, storage, label, key, since] of [
  ['forestBackground', 'setBG0', '森林背景 1', 'forestBackgrounds', 194],
  ['corruptBackground', 'setBG1', '腐化背景', 'corruptionBackgrounds', 194],
  ['jungleBackground', 'setBG2', '丛林背景', 'jungleBackgrounds', 194],
  ['snowBackground', 'setBG3', '雪原背景', 'snowBackgrounds', 194],
  ['hallowBackground', 'setBG4', '神圣背景', 'hallowBackgrounds', 194],
  ['crimsonBackground', 'setBG5', '猩红背景', 'crimsonBackgrounds', 194],
  ['desertBackground', 'setBG6', '沙漠背景', 'desertBackgrounds', 194],
  ['oceanBackground', 'setBG7', '海洋背景', 'oceanBackgrounds', 194],
  ['mushroomBackground', 'setBG8', '蘑菇背景', 'mushroomBackgrounds', 225],
  ['underworldBackground', 'setBG9', '地狱背景', 'underworldBackgrounds', 225],
  ['forestBackground2', 'setBG10', '森林背景 2', 'forestBackgrounds', 225],
  ['forestBackground3', 'setBG11', '森林背景 3', 'forestBackgrounds', 225],
  ['forestBackground4', 'setBG12', '森林背景 4', 'forestBackgrounds', 225],
]) style(id, storage, label, '群系背景', key, { since });
number('surfaceLevel', 'worldSurface', '地表层深度', '地层', 0, null, { integer: false, layer: 'surface' });
number('rockLevel', 'rockLayer', '洞穴层深度', '地层', 0, null, { integer: false, layer: 'rock' });
for (const [id, storage, label, since] of [
  ['drunkSeed', 'drunkWorld', '醉酒世界', 225], ['worthySeed', 'getGoodWorld', '受尽折磨（for the worthy）', 227],
  ['anniversarySeed', 'getTenthAnniversaryWorld', '十周年庆典', 238], ['starveSeed', 'dontStarveWorld', '永恒领域（饥荒联动）', 239],
  ['beesSeed', 'notTheBeesWorld', '蜂蜜世界', 241], ['remixSeed', 'remixWorld', '颠倒世界', 249],
  ['trapsSeed', 'noTrapsWorld', '机关世界（no traps）', 266], ['zenithSeed', 'zenithWorld', '天顶世界', 267],
  ['skyblockSeed', 'skyblockWorld', '空岛世界', 302], ['vampireSeed', 'vampireSeed', '吸血鬼种子标记', 288],
  ['infectedSeed', 'infectedSeed', '感染种子标记', 296], ['dualDungeonsSeed', 'dualDungeonsSeed', '双地牢种子标记', 304],
  ['moreLightningSeed', 'moreLightningSeed', '更多闪电种子标记', 323], ['noLightningSeed', 'noLightningSeed', '无闪电种子标记', 323],
]) boolean(id, storage, label, '特殊种子', since);

const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = () => { throw new EditError('世界属性参数无效，未修改世界。'); };
// World.FileV2 reverse-syncs these entries on load and syncs them on save.
// Newer worlds use the tree-top array as the authoritative style values.
const treeTopSlots = { setBG1: 4, jungleBackStyle: 5, setBG3: 6, setBG4: 7,
  setBG5: 8, setBG6: 9, setBG7: 10, setBG8: 11, setBG9: 12 };
const treeTopSlot = definition => definition.storage === 'treeStyle' ? definition.component : treeTopSlots[definition.storage];
function encode(io, data, properties) {
  const saver = new BinarySaver(); io.save(saver, data, properties); saver.trimBuffer(); return saver.getBuffer();
}

export function createWorldProperties(world) {
  const version = world.fileFormatHeader.version;
  const expected = clone(world.header);
  const constraints = { width: expected.maxTilesX, height: expected.maxTilesY, layerMargin: catalogue.layerMargin };
  const fields = definitions.filter(definition => definition.since <= version).map(definition => ({ ...definition,
    ...(definition.widthBound ? { max: constraints.width } : {}),
    ...(definition.layer ? { max: worldLayerLimits(constraints, false)[definition.layer] } : {}),
    ...(definition.id === 'difficulty' && version < 225 ? { options: definition.options.slice(0, 2) } : {}) }));
  const byId = new Map(fields.map(definition => [definition.id, definition]));
  function value(definition) {
    if (definition.id === 'difficulty') return version < 225 ? Number(expected.expertMode) : expected.gameMode;
    if (definition.id === 'clock') return ((expected.tempTime + (expected.tempDayTime ? 0 : 54000) + 16200) % 86400 + 86400) % 86400;
    const slot = treeTopSlot(definition);
    if (version >= 225 && slot !== undefined) return expected.treeTopsVariations[slot] ?? 0;
    return definition.component === undefined ? expected[definition.storage] : expected[definition.storage][definition.component];
  }
  return {
    read() {
      return { constraints: clone(constraints), fields: fields.map(({ storage, component, float32, since, widthBound, ...definition }) => clone(definition)),
        values: Object.fromEntries(fields.map(definition => [definition.id, value(definition)])) };
    },
    prepare(payload, revision) {
      if (!plain(payload) || Object.keys(payload).some(key => !['revision', 'changes', 'options'].includes(key)) || payload.revision !== revision) {
        throw new EditError('世界属性或版本已变化，请重新读取后再保存。');
      }
      if (!plain(payload.changes) || !Object.keys(payload.changes).length) fail();
      if (payload.options !== undefined && (!plain(payload.options) || Object.keys(payload.options).some(key => key !== 'safeLayers') || typeof payload.options.safeLayers !== 'boolean')) fail();
      const layerLimits = worldLayerLimits(constraints, payload.options?.safeLayers ?? true);
      // History stores validated field patches, never a caller-supplied header.
      const before = {}, after = {};
      const set = (key, next) => {
        if (Object.is(expected[key], next) || (Array.isArray(next) && JSON.stringify(expected[key]) === JSON.stringify(next))) { delete before[key]; delete after[key]; }
        else { before[key] = clone(expected[key]); after[key] = clone(next); }
      };
      for (const [id, next] of Object.entries(payload.changes)) {
        const definition = byId.get(id); if (!definition) fail();
        if (definition.type === 'boolean') { if (typeof next !== 'boolean') fail(); }
        else if (definition.type === 'text') {
          if (typeof next !== 'string' || !next.trim() || /[\r\n\x00]/.test(next) || next.length > 1024 ||
              [...next].some(char => char.codePointAt(0) >= 0xd800 && char.codePointAt(0) <= 0xdfff) || new TextEncoder().encode(next).byteLength > 1024) fail();
        } else if (definition.type === 'select') { if (!definition.options.some(([option]) => option === next)) fail(); }
        else if (definition.type === 'clock') { if (!Number.isInteger(next) || next < 0 || next >= 86400) fail(); }
        else if (!Number.isFinite(next) || next < definition.min || next > (definition.layer ? layerLimits[definition.layer] : definition.max) || (definition.integer && !Number.isInteger(next))) fail();
        if (id === 'difficulty') set(version < 225 ? 'expertMode' : 'gameMode', version < 225 ? Boolean(next) : next);
        else if (id === 'clock') {
          const continuous = (next - 16200 + 86400) % 86400;
          set('tempDayTime', continuous < 54000); set('tempTime', continuous < 54000 ? continuous : continuous - 54000);
        } else if (definition.component !== undefined) {
          const array = clone(after[definition.storage] ?? expected[definition.storage]); array[definition.component] = next; set(definition.storage, array);
        } else set(definition.storage, definition.float32 ? Math.fround(next) : next);
        const slot = treeTopSlot(definition);
        if (version >= 225 && slot !== undefined) {
          const array = clone(after.treeTopsVariations ?? expected.treeTopsVariations);
          while (array.length < 13) array.push(0);
          array[slot] = next; set('treeTopsVariations', array);
        }
      }
      if (['destroyer', 'twins', 'prime'].some(id => Object.hasOwn(payload.changes, id))) {
        const combined = { ...expected, ...after };
        set('downedMechBossAny', combined.downedMechBoss1 || combined.downedMechBoss2 || combined.downedMechBoss3);
      }
      if (Object.hasOwn(payload.changes, 'orbCount') && !Object.hasOwn(payload.changes, 'orbSmashed')) set('shadowOrbSmashed', payload.changes.orbCount > 0);
      for (const key of ['treeX', 'caveBackX']) if (Object.hasOwn(after, key) && after[key].some((value, index, array) => index > 0 && value < array[index - 1])) fail();
      if ((Object.hasOwn(after, 'worldSurface') || Object.hasOwn(after, 'rockLayer')) &&
          ((after.worldSurface ?? expected.worldSurface) >= (after.rockLayer ?? expected.rockLayer) ||
           (after.worldSurface ?? expected.worldSurface) > layerLimits.surface || (after.rockLayer ?? expected.rockLayer) > layerLimits.rock)) fail();
      if (!Object.keys(after).length) return null;
      return { kind: 'world', index: 0, before, after, cost: Math.max(1, Math.ceil(new TextEncoder().encode(JSON.stringify(before) + JSON.stringify(after)).byteLength / 64)) };
    },
    write(snapshot) {
      Object.assign(world.header, clone(snapshot)); Object.assign(expected, clone(snapshot));
      world.footer.signoff2 = expected.mapName;
    },
    expectedSections() {
      const footerIndex = world.fileFormatHeader.pointers.filter(pointer => pointer > 0).length - 1;
      return new Map([[0, encode(new HeaderIO(), expected, { version })],
        [footerIndex, encode(new FooterIO(), {}, { mapName: expected.mapName, worldId: expected.worldId })]]);
    },
  };
}
