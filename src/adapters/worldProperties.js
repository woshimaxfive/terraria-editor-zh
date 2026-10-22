import BinarySaver from '../../vendor/terraria-world-file/src/BinarySaver.ts';
import HeaderIO from '../../vendor/terraria-world-file/src/section/Header.ts';
import FooterIO from '../../vendor/terraria-world-file/src/section/Footer.ts';
import { EditError } from '../editing/brush.js';

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

const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = () => { throw new EditError('世界属性参数无效，未修改世界。'); };
function encode(io, data, properties) {
  const saver = new BinarySaver(); io.save(saver, data, properties); saver.trimBuffer(); return saver.getBuffer();
}

export function createWorldProperties(world) {
  const version = world.fileFormatHeader.version;
  let expected = clone(world.header);
  const fields = definitions.filter(definition => definition.since <= version).map(definition => ({ ...definition,
    ...(definition.id === 'difficulty' && version < 225 ? { options: definition.options.slice(0, 2) } : {}) }));
  const byId = new Map(fields.map(definition => [definition.id, definition]));
  function value(definition) {
    if (definition.id === 'difficulty') return version < 225 ? Number(expected.expertMode) : expected.gameMode;
    if (definition.id === 'clock') return ((expected.tempTime + (expected.tempDayTime ? 0 : 54000) + 16200) % 86400 + 86400) % 86400;
    return expected[definition.storage];
  }
  return {
    read() {
      return { fields: fields.map(({ storage, float32, since, ...definition }) => clone(definition)),
        values: Object.fromEntries(fields.map(definition => [definition.id, value(definition)])) };
    },
    prepare(payload, revision) {
      if (!plain(payload) || Object.keys(payload).some(key => !['revision', 'changes'].includes(key)) || payload.revision !== revision) {
        throw new EditError('世界属性或版本已变化，请重新读取后再保存。');
      }
      if (!plain(payload.changes) || !Object.keys(payload.changes).length) fail();
      // History stores validated field patches, never a caller-supplied header.
      const before = {}, after = {};
      const set = (key, next) => { if (!Object.is(expected[key], next)) { before[key] = clone(expected[key]); after[key] = clone(next); } };
      for (const [id, next] of Object.entries(payload.changes)) {
        const definition = byId.get(id); if (!definition) fail();
        if (definition.type === 'boolean') { if (typeof next !== 'boolean') fail(); }
        else if (definition.type === 'text') {
          if (typeof next !== 'string' || !next.trim() || /[\r\n\x00]/.test(next) || next.length > 1024 ||
              [...next].some(char => char.codePointAt(0) >= 0xd800 && char.codePointAt(0) <= 0xdfff) || new TextEncoder().encode(next).byteLength > 1024) fail();
        } else if (definition.type === 'select') { if (!definition.options.some(([option]) => option === next)) fail(); }
        else if (definition.type === 'clock') { if (!Number.isInteger(next) || next < 0 || next >= 86400) fail(); }
        else if (!Number.isFinite(next) || next < definition.min || next > definition.max || (definition.integer && !Number.isInteger(next))) fail();
        if (id === 'difficulty') set(version < 225 ? 'expertMode' : 'gameMode', version < 225 ? Boolean(next) : next);
        else if (id === 'clock') {
          const continuous = (next - 16200 + 86400) % 86400;
          set('tempDayTime', continuous < 54000); set('tempTime', continuous < 54000 ? continuous : continuous - 54000);
        } else set(definition.storage, definition.float32 ? Math.fround(next) : next);
      }
      if (['destroyer', 'twins', 'prime'].some(id => Object.hasOwn(payload.changes, id))) {
        const combined = { ...expected, ...after };
        set('downedMechBossAny', combined.downedMechBoss1 || combined.downedMechBoss2 || combined.downedMechBoss3);
      }
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
