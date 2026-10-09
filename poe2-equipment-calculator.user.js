// ==UserScript==
// @name         POE2 装备防御与武器伤害排序浮窗
// @namespace    poe-trade-tool
// @version      2.9.2
// @description  自动列出已加载装备，支持护甲防御（孔内增幅默认不计入，勾选「防御百分比」/「魔力」后才估算，另有魔力换盾、特殊孔、性价比与防御占比条）与武器处理后总伤（可选按攻速、显示性价比与五类伤害明细）、孔内增幅点伤估算与行内伤害占比条。
// @match        https://www.pathofexile.com/trade2*
// @match        https://poe.game.qq.com/trade2*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  const HOST_ID = 'poe2-equipment-calculator';
  if (document.getElementById(HOST_ID)) return;

  // ar/ev/es 及局部增幅 ID 参考 stomtian 的 POE2交易助手3.0.6（MIT），
  // debug/8b9e2ac2-5696-4f81-875d-d63295fa0f3b.txt，class jf。
  // 用户页面诊断确认重复防御字段还包含标签和计算摘要。
  // 优先读取装备属性行，不读取其他插件的计算摘要。
  const DEFENSE_RUNE = 'stat_3523867985';
  // https://poe2db.tw/Socket-bound_Augments 及 /tw/ 同页；ID 核对官方 trade2/data/stats 的 rune 组。
  // 这些类型每件限 1 个；阿茲里四种核心共用腐化标记，但各自限定不同装备部位。
  const BOUND_RUNE_MARKERS = new Set([
    'stat_201332984', 'stat_3132681620', 'stat_718638445', 'stat_3198163869', 'stat_2547063279',
    'stat_1927467683', 'stat_1770091046', 'stat_1676950499', 'stat_2139847597',
  ]);
  // 阿德爾四种转化符文没有「限 1」；保留独立词缀的次数，不合并等值符文。
  const BOUND_CONVERSION_RUNES = new Set(['stat_602344904', 'stat_2390027291', 'stat_1433896639', 'stat_1624833382']);
  const JEWEL_SOCKET_RUNE = 'stat_1933674044';
  // https://www.pathofexile.com/api/trade2/data/stats：Runic Ward 百分比 ID。
  // 按用户指定模型估算，不将品质或局部/全局归类视为已验证游戏机制。
  const WARD_RUNE = 'stat_830161081';
  // 防御符文每孔增幅（高阶 / 完美）沿用既有用户指定模型，档位顺序与武器 AUGMENT_TIERS 对齐。
  // 仅在勾选「防御百分比」或「魔力」（魔力换盾）时并入估算；假定补孔只用于显示，不进入防御计算与排序。
  const DEFENSE_AUGMENT_PER_SOCKET = [0.18, 0.20];
  // 魔力增幅每孔数值（高阶 / 完美）核对 https://poe2db.tw/us/Greater_Mind_Rune 与 /Perfect_Mind_Rune
  // （2026-10-09）：Armour 行每孔 +40 / +50 最大魔力；不采用 Wand or Staff 行，也不采用 Bonded 效果。
  const MANA_AUGMENT_PER_SOCKET = [40, 50];
  // 「魔力换盾」按用户指定模型估算，不将 1 魔力 = 1 护盾或属性折算视为已验证游戏机制：
  // 装备自身魔力 = 非孔内最大魔力词缀 + 2 × (非孔内智慧 + 全能力)，1 全能力按其中 1 智慧计（同样折 2 魔力，不乘三）。
  // 用户确认口径：孔内增幅默认不计入，只有勾选「防御百分比」/「魔力」才按所选档位加入估算；
  // 因此孔内符文提供的最大魔力、智慧与全能力都不进默认结果，勾选后也不与所选增幅叠加。
  // 命定 Bonded 使用独立 ID（stat_2926029365）且不计入；pseudo 汇总不在 stat 词缀列表内；角色与天赋魔力不计。
  const MANA_PER_INTELLIGENCE = 2;
  const MANA_SHIELD_PER_MANA = 1;
  // 最大魔力与属性 ID 核对官方 https://www.pathofexile.com/api/trade2/data/stats（2026-10-09）：
  // 「# to maximum Mana」「# to Intelligence」与两条「# to all Attributes」（普通与特殊来源）。
  const EQUIPMENT_MANA_IDS = new Set(['stat_1050105434']);
  const INTELLIGENCE_IDS = new Set(['stat_328541901']);
  const ALL_ATTRIBUTES_IDS = new Set(['stat_1379411836', 'stat_2897413282']);
  // 增幅数值按 https://poe2db.tw/us/Rune（2026-10-09 核对）Martial Weapon 行：
  // 铁符文高阶 18%/完美 20% 物理；沙漠 13–16/17–20 火；冰河 9–15/16–20 冰；风暴 1–30/1–40 电。
  // Wand/Staff 行是法术相关词缀，不适用于攻击武器面板；高阶在前，完美在后。
  // 特殊孔默认 0，只预留位置，不猜测其中特殊符文的数值。
  const AUGMENT_TIERS = ['高阶', '完美'];
  const AUGMENTS = [
    { key: 'physical', label: '物理百分比', type: 'percent', tiers: [0.18, 0.20] },
    { key: 'lightning', label: '电点', type: 'flat', tiers: [[1, 30], [1, 40]] },
    { key: 'cold', label: '冰点', type: 'flat', tiers: [[9, 15], [16, 20]] },
    { key: 'fire', label: '火点', type: 'flat', tiers: [[13, 16], [17, 20]] },
  ];
  const ATTRIBUTES = [
    { key: 'es', label: '护盾', ids: ['stat_4052037485', 'stat_3489782002', 'stat_2482852589', 'stat_1999113824', 'stat_3321629045', 'stat_4015621042'] },
    { key: 'ar', label: '护甲', ids: ['stat_3321629045', 'stat_3484657501', 'stat_2866361420', 'stat_1062208444', 'stat_2451402625', 'stat_809229260'] },
    { key: 'ev', label: '闪避', ids: ['stat_2106365538', 'stat_124859000', 'stat_53045048', 'stat_2144192055', 'stat_1999113824', 'stat_2451402625'] },
    { key: 'ward', label: '保护', ids: [WARD_RUNE, 'stat_4273473110'] },
  ];
  const LOCAL_TYPES = new Set(['explicit', 'implicit', 'enchant', 'desecrated', 'fractured', 'crafted']);
  const ROW_SELECTOR = '.resultset .row[data-id], .results .row[data-id], #trade .row[data-id]';
  // 武器面板字段参考 POE2交易助手；不从伤害词缀或插件 DPS 摘要反推。
  const WEAPON_SELECTOR = '[data-field="pdamage"], [data-field="edamage"], [data-field="cdamage"], [data-field="aps"]';
  // 官方 trade2/data/stats（2026-10-09）与 https://www.poe2wiki.net/wiki/Modifier。
  // “… to Attacks”、Bonded 全局伤害、额外伤害和攻速不计入武器面板点伤。
  const PHYSICAL_DAMAGE_PERCENT = 'stat_1509134228';
  // 孔内局部附加伤害按类型扣除；类型经官方 trade2/data/stats 文本核对（2026-10-09）：
  // 火 stat_709508406、冰 stat_1037193709、电 stat_3336890334、混沌 stat_2223678961。
  const LOCAL_DAMAGE_RUNES = new Map([
    ['stat_1940865751', 'physical'], ['stat_1888719480', 'physical'],
    ['stat_709508406', 'fire'], ['stat_1037193709', 'cold'],
    ['stat_3336890334', 'lightning'], ['stat_2223678961', 'chaos'],
  ]);
  // 伤害占比条：固定顺序物理 → 闪电 → 火焰 → 冰冷 → 混沌与用户确认的配色。
  const DAMAGE_BREAKDOWN = [
    { key: 'physical', label: '物理', color: '#65B96E' },
    { key: 'lightning', label: '闪电', color: '#F2D34F' },
    { key: 'fire', label: '火焰', color: '#EF6548' },
    { key: 'cold', label: '冰冷', color: '#70C8F2' },
    { key: 'chaos', label: '混沌', color: '#AE78DB' },
  ];
  // 防御占比条：固定顺序护甲 → 闪避 → 护盾 → 保护；颜色沿用详细行配色，保护为紫色。
  const DEFENSE_BREAKDOWN = [
    { key: 'ar', label: '护甲', color: '#ff9292' },
    { key: 'ev', label: '闪避', color: '#91db91' },
    { key: 'es', label: '护盾', color: '#85baff' },
    { key: 'ward', label: '保护', color: '#c9a0ff' },
  ];
  // 元素伤害面板按页面自身标记区分类型：旧 colour 类或新 CSS 变量；仅按标记唯一判定，不按出现顺序猜类型。
  const ELEMENTAL_TYPES = [
    { key: 'fire', selector: '.colourFireDamage, [style*="--colour-fire-damage"]' },
    { key: 'cold', selector: '.colourColdDamage, [style*="--colour-cold-damage"]' },
    { key: 'lightning', selector: '.colourLightningDamage, [style*="--colour-lightning-damage"]' },
  ];
  const ELEMENTAL_SELECTOR = ELEMENTAL_TYPES.map(type => type.selector).join(', ');
  // trade2/data/stats（2026-10-09 核对）：'…increased effect of Socketed Augment Items'（stat_2081918629）
  // 与 '…of Socketed Runes'（stat_704409219）会放大孔内符文数值；'…of Socketed Soul Cores'
  // （stat_4065505214）只作用于灵魂核心，不影响符文，因此不参与符文反推与新增符文估算。
  const RUNE_EFFECT_IDS = new Set(['stat_2081918629', 'stat_704409219']);
  // 用户页面诊断（750fab88…、d501c4e1…）：带 RUNE_EFFECT_IDS 时，孔内闪电增幅的显示范围与面板
  // 点伤两端精确相加（12+2=14、352+102=454；13+1=14、303+49=352），因此该组合按显示范围扣除一次、
  // 不重复乘倍率；被倍率放大的其他局部增幅类型仍拒绝反推。新增增幅倍率按用户确认的默认向下取整计算。
  const VERIFIED_EFFECT_RUNE_IDS = new Set(['stat_3336890334']);
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—';
  const fmtRatio = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  // 防御数值向下取整显示；容忍二进制浮点表示误差（如 679.9999999999999 视为 680），
  // 防御面板数量级下 1e-6 远低于有效精度，不掩盖真实小数。
  const fmtDefense = value => Number.isFinite(value) ? fmt(Math.floor(value + 1e-6)) : '—';
  const text = element => (element?.textContent || '').replace(/\u00a0/g, ' ').trim();
  const number = value => {
    const match = value.replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };
  function field(row, key) {
    const elements = [...row.querySelectorAll(`[data-field="${key}"]`)];
    const readValue = element => text(element.querySelector('.colourAugmented, [style*="--colour-augmented"]')) || text(element);
    // 装备属性行优先；没有属性行时优先带冒号的原始面板值，避免读取计算摘要。
    const properties = elements.filter(element => element.closest('.item-property, .property'));
    const candidates = properties.length ? properties : elements.filter(element => /[:：]/.test(text(element)));
    for (const element of candidates.length ? candidates : elements) {
      const value = readValue(element);
      if (number(value) !== null) return value;
    }
    // Armour / Evasion / Ward 等纯标签不是损坏的数值字段。
    const labelOnly = /^(?:Armou?r|Evasion(?: Rating)?|Energy Shield|(?:Runic )?Ward|護甲(?:值)?|护甲(?:值)?|閃避(?:值)?|闪避(?:值)?|能量護盾|能量护盾|護盾|护盾|符文保護|符文结界|保护|保護)\s*[:：]?$/i;
    const invalid = (candidates.length ? candidates : elements).map(readValue).find(value => value && !labelOnly.test(value));
    return invalid || '';
  }
  function readPrice(row) {
    const price = row.querySelector('.price');
    if (!price) return '—';
    // 只读标价区域；货币图片使用文字标签，单位取首个单词前三个字符。
    const content = price.cloneNode(true);
    for (const image of content.querySelectorAll('img')) {
      image.replaceWith(` ${image.getAttribute('alt') || image.getAttribute('title') || ''} `);
    }
    const match = text(content).match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:[x×]\s*)?([\p{L}]+)?/u);
    return match ? `${match[1]}${match[2] ? ` ${match[2].slice(0, 3).toUpperCase()}` : ''}` : '—';
  }
  function damageProperty(row, key) {
    const elements = [...row.querySelectorAll(`[data-field="${key}"]`)];
    return elements.find(element => element.closest('.item-property, .property')) || elements.find(element => /[:：]/.test(text(element))) || elements[0];
  }
  function damageRanges(element, labelOnly) {
    const value = text(element).replace(/,/g, '');
    if (!value || labelOnly.test(value)) return [];
    const ranges = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(?:[-–—~～至到]|to)\s*(\d+(?:\.\d+)?)/gi)].map(match => [Number(match[1]), Number(match[2])]);
    return ranges.length && ranges.every(([min, max]) => Number.isFinite(min) && Number.isFinite(max) && min <= max) ? ranges : null;
  }
  // elementalRanges 为火 / 冰 / 电各自的已解析范围（元素全部可由页面标记分类时传入，否则 null）；
  // 合并的「元素」列口径不变，拆分仅用于伤害占比条。
  function socketFreeDamage(row, mods, ranges, elementalRanges) {
    const labels = { physical: '物理', elemental: '元素', chaos: '混沌' };
    const values = {};
    const titles = {};
    const fail = reason => ({ values: { physical: null, elemental: null, chaos: null }, titles: { physical: reason, elemental: reason, chaos: reason }, types: null, reason, equipmentPercent: null });
    if (Object.values(ranges).some(value => value === null)) return fail('武器伤害面板范围无法解析');
    if (!Object.values(ranges).some(value => value.length)) return fail('未读取到武器伤害面板范围');
    const runes = mods.filter(mod => mod.type === 'rune');
    if (row.querySelector('.socket[class*="rune"]') && !runes.length) return fail('孔内存在增幅，但未读取到增幅词缀，无法反推点伤');
    if (runes.some(mod => BOUND_CONVERSION_RUNES.has(mod.id))) return fail('孔内增幅转化了装备词缀，无法还原转化前的点伤');
    const localRunes = runes.filter(mod => mod.id === PHYSICAL_DAMAGE_PERCENT || LOCAL_DAMAGE_RUNES.has(mod.id));
    // 未收录但文字疑似局部点伤的增幅不得被当作零；明确全局/条件词缀不扣面板。
    const unknown = runes.find(mod => !localRunes.includes(mod) && !/Bonded|羁绊|羈絆|绑定|綁定|to Attacks|to Spells|against|攻击附加|攻擊附加|法术|法術|敵人|敌人|Global|全局/i.test(mod.text) && /^(?:Adds?\s+\d+\s+(?:to|[-–])\s+\d+\s+(?:Physical|Fire|Cold|Lightning|Chaos) Damage|附加\s*\d+\s*[-–至到]\s*\d+\s*(?:物理|火焰|冰冷|闪电|閃電|混沌)[傷伤]害)|(?:increased Physical Damage|(?:增加|提高|提升|降低|減少|减少).*物理[傷伤]害)/i.test(mod.text));
    if (unknown) return fail(`孔内局部伤害增幅未收录：${unknown.text}`);
    const runeEffectMods = mods.filter(mod => RUNE_EFFECT_IDS.has(mod.id));
    // 只放行有面板数值证据的局部增幅类型；被倍率放大的其他类型仍拒绝反推。
    const reversibleEffect = localRunes.every(mod => VERIFIED_EFFECT_RUNE_IDS.has(mod.id));
    if (localRunes.length && runeEffectMods.length && !reversibleEffect) return fail('存在孔内增幅效果倍率，面板词缀是否已应用倍率未验证，无法反推点伤');
    const equipmentConversion = mods.some(mod => {
      if (!LOCAL_TYPES.has(mod.type)) return false;
      // 技能转化不改变武器面板；只移除明确的技能转化语句，不能忽略同词缀其他转化。
      const panelText = mod.text.replace(/\b(?:[A-Za-z]+\s+)*Skills?\s+Convert\s+\d+(?:\.\d+)?%\s+of\s+Physical Damage\s+to\s+(?:Fire|Cold|Lightning|Chaos) Damage|[\u3400-\u9fff]*技能(?:會|会)?(?:將|将)?\s*\d+(?:\.\d+)?%\s*物理[傷伤]害(?:轉換|转换|轉化|转化)(?:為|为)(?:火焰|冰冷|閃電|闪电|混沌)[傷伤]害/gi, '');
      return /(?:Physical Damage.*converted|Convert\s+\d+(?:\.\d+)?%\s+of\s+Physical Damage|(?:转换|轉換|转化|轉化).*物理[傷伤]害|物理[傷伤]害.*(?:转换|轉換|转化|轉化))/i.test(panelText);
    });
    if (localRunes.length && equipmentConversion) return fail('装备存在物理伤害转化，无法可靠还原孔内增幅对各类型面板的影响');
    const equipment = mods.filter(mod => LOCAL_TYPES.has(mod.type) && mod.id === PHYSICAL_DAMAGE_PERCENT);
    const percentRunes = localRunes.filter(mod => mod.id === PHYSICAL_DAMAGE_PERCENT);
    if (percentRunes.length && equipment.concat(percentRunes).some(mod => mod.percent === null)) return fail('物理伤害增幅百分比无法解析');
    const equipmentPercent = equipment.reduce((sum, mod) => sum + (mod.percent ?? 0), 0);
    const runePercent = percentRunes.reduce((sum, mod) => sum + mod.percent, 0);
    // 孔内附加按火 / 冰 / 电 / 物理 / 混沌分别累计；元素组是其三类之和。
    const flat = { physical: [0, 0], fire: [0, 0], cold: [0, 0], lightning: [0, 0], chaos: [0, 0] };
    for (const mod of localRunes) {
      const key = LOCAL_DAMAGE_RUNES.get(mod.id);
      if (!key) continue;
      const added = damageRanges({ textContent: mod.text }, /$^/);
      // 双语插件会在同一词缀内重复中英文范围；数值必须一致，只扣一次。
      // 不跨词缀去重，独立等值增幅仍逐条累加；冲突范围不能猜取首个。
      if (!added?.length || !added.every(([min, max]) => min === added[0][0] && max === added[0][1])) return fail(`孔内附加伤害范围无法解析或数值不一致：${mod.text}`);
      flat[key][0] += added[0][0];
      flat[key][1] += added[0][1];
    }
    const flatAverage = key => key === 'elemental'
      ? ['fire', 'cold', 'lightning'].reduce((sum, type) => sum + (flat[type][0] + flat[type][1]) / 2, 0)
      : (flat[key][0] + flat[key][1]) / 2;
    const hasPhysicalFlat = localRunes.some(mod => LOCAL_DAMAGE_RUNES.get(mod.id) === 'physical');
    const qualityText = field(row, 'quality');
    const quality = qualityText ? number(qualityText) : 0;
    if ((ranges.physical.length || hasPhysicalFlat) && (quality === null || quality < 0)) return fail('物理点伤补品质所需的品质字段无法解析');
    if (hasPhysicalFlat && equipment.some(mod => mod.percent === null)) return fail('物理附加伤害反推所需装备增幅无法解析');
    const targetQuality = Math.max(quality ?? 0, 20);
    const physicalQualityRatio = ranges.physical.length ? (1 + targetQuality / 100) / (1 + quality / 100) : 1;
    const factor = 1 + equipmentPercent;
    const denominator = factor + runePercent;
    if ((percentRunes.length || hasPhysicalFlat) && (factor <= 0 || denominator <= 0)) return fail('物理伤害百分比系数无效');
    // 倍率已含在显示范围的证据只覆盖已放行的组合；悬停说明按显示范围各扣一次。
    const effectNote = localRunes.length && runeEffectMods.length ? '孔内增幅效果倍率已反映在增幅显示范围中，按显示范围各扣一次，不重复乘倍率。' : '';
    const note = `\n移除已识别的孔内局部伤害增幅，保留装备词缀；仅物理品质不足20%补至20%，更高品质保留，元素与混沌不受品质影响。${effectNote}不反推裸基础，不计全局/条件伤害、暴击、技能或角色加成。面板取整可能造成反推偏差；排序使用未取整值。`;
    for (const key of Object.keys(labels)) {
      const observed = ranges[key].reduce((sum, [min, max]) => sum + (min + max) / 2, 0);
      const added = flatAverage(key);
      const ratio = key === 'physical' && percentRunes.length ? factor / denominator : 1;
      const flatFactor = key === 'physical' && hasPhysicalFlat ? factor * (1 + quality / 100) : 1;
      const value = (observed * ratio - added * flatFactor) * (key === 'physical' ? physicalQualityRatio : 1);
      if (!Number.isFinite(value) || value < 0) return fail(`${labels[key]}点伤反推结果无效或为负，面板与孔内增幅数据不一致`);
      values[key] = value;
      titles[key] = `${labels[key]}点伤：[当前面板平均 ${fmt(observed)}${ratio !== 1 ? ` × (1 + ${fmt(equipmentPercent * 100)}/100) ÷ (1 + ${fmt(equipmentPercent * 100)}/100 + ${fmt(runePercent * 100)}/100)` : ''}${added ? ` − 孔内附加平均 ${fmt(added)}${key === 'physical' ? ` × (1 + ${fmt(equipmentPercent * 100)}/100) × (1 + ${fmt(quality)}/100)` : ''}` : ''}]${key === 'physical' && ranges.physical.length ? ` × (1 + ${fmt(targetQuality)}/100) ÷ (1 + ${fmt(quality)}/100)（品质 ${fmt(quality)}% → ${fmt(targetQuality)}%）` : ''} = ${fmt(value)}（不乘攻速）${note}`;
    }
    // 五类处理后点伤：元素全部可按标记分类时才提供拆分；某类反推为负说明面板与增幅数据不一致，不拆分。
    let types = null;
    if (elementalRanges) {
      const split = { fire: null, cold: null, lightning: null };
      for (const key of Object.keys(split)) {
        const observed = elementalRanges[key].reduce((sum, [min, max]) => sum + (min + max) / 2, 0);
        const value = observed - flatAverage(key);
        if (Number.isFinite(value) && value >= 0) split[key] = value;
      }
      if (Object.keys(split).every(key => Number.isFinite(split[key]))) types = { physical: values.physical, chaos: values.chaos, ...split };
    }
    return { values, titles, types, reason: '', equipmentPercent };
  }
  // 按「可用孔 − 特殊孔」插满所选增幅估算点伤；基数已移除原有孔内局部增幅，故本次新增的增幅只加一次。
  // 估算值不单独成列：由 readWeapon 并入对应点伤列与总伤；失败时 values 为 null，受影响列显示计算不可得。
  // 增幅效果倍率按 RUNE_EFFECT_IDS 相加后只乘一次：档位原始值 × (1 + 效果增加)；用户确认默认向下取整，
  // 区间逐端取整、百分比取整到整数百分点。倍率无法解析或系数非正时拒绝估算。
  function augmentEstimate(damage, socketCount, mods) {
    const augment = AUGMENTS.find(candidate => candidate.key === augmentKey);
    if (!augment) return null;
    const sockets = Math.max(0, socketCount - specialSockets);
    const { physical, elemental, chaos } = damage.values;
    const tierName = AUGMENT_TIERS[augmentTierIndex];
    const tier = augment.tiers[augmentTierIndex];
    const runeEffectMods = mods.filter(mod => RUNE_EFFECT_IDS.has(mod.id));
    const multiplier = 1 + runeEffectMods.reduce((sum, mod) => sum + (mod.percent ?? 0), 0);
    const tierText = augment.type === 'percent' ? `${fmt(tier * 100)}%` : `${tier[0]}–${tier[1]}`;
    // 区间逐端向下取整；百分比按整数百分点取整，与页面显示范围口径一致。
    const effective = augment.type === 'percent'
      ? Math.floor(tier * multiplier * 100) / 100
      : [Math.floor(tier[0] * multiplier), Math.floor(tier[1] * multiplier)];
    const perSocket = augment.type === 'percent' ? effective : (effective[0] + effective[1]) / 2;
    const result = { key: augment.key, label: augment.label, tierName, available: socketCount, specialSockets, sockets, values: null, formula: '', reason: '' };
    let reason = damage.reason
      || (runeEffectMods.some(mod => mod.percent === null) ? '装备的增幅效果倍率无法解析，无法估算新增增幅' : '')
      || (runeEffectMods.length && !(multiplier > 0) ? '装备的增幅效果倍率系数无效，无法估算新增增幅' : '');
    if (!reason && augment.type === 'percent' && !((damage.equipmentPercent ?? -1) + 1 > 0)) reason = '装备物理百分比增幅系数无效，无法估算新增物理增幅';
    if (reason) return { ...result, reason };
    const added = sockets * perSocket;
    const physicalDamage = augment.type === 'percent' ? physical * ((1 + damage.equipmentPercent + added) / (1 + damage.equipmentPercent)) : physical;
    const elementalDamage = augment.type === 'flat' ? elemental + added : elemental;
    const total = physicalDamage + elementalDamage + chaos;
    if (![physicalDamage, elementalDamage, total].every(Number.isFinite)) return { ...result, reason: '增幅点伤计算结果无效' };
    const formula = augment.type === 'percent'
      ? `每孔 ${fmt(perSocket * 100)}% 物理${runeEffectMods.length ? `（档位 ${tierText} × ${fmt(multiplier)} 向下取整）` : ''}；物理 = 去增幅物理 ${fmt(physical)} × (1 + ${fmt(damage.equipmentPercent * 100)}/100 + ${sockets} × ${fmt(perSocket * 100)}/100) ÷ (1 + ${fmt(damage.equipmentPercent * 100)}/100) = ${fmt(physicalDamage)}；总点伤 = 物理 ${fmt(physicalDamage)} + 元素 ${fmt(elemental)} + 混沌 ${fmt(chaos)} = ${fmt(total)}`
      : `每孔附加 ${effective[0]}–${effective[1]}（平均 ${fmt(perSocket)}${runeEffectMods.length ? `；档位 ${tierText} × ${fmt(multiplier)} 向下取整` : ''}）；元素 = 去增幅元素 ${fmt(elemental)} + ${sockets} × ${fmt(perSocket)} = ${fmt(elementalDamage)}；总点伤 = 物理 ${fmt(physical)} + 元素 ${fmt(elementalDamage)} + 混沌 ${fmt(chaos)} = ${fmt(total)}`;
    // 五类点伤同步并入本次增幅，供伤害占比条使用；基数不可拆分时保持 null。
    const types = damage.types ? {
      physical: physicalDamage,
      fire: augment.key === 'fire' ? damage.types.fire + added : damage.types.fire,
      cold: augment.key === 'cold' ? damage.types.cold + added : damage.types.cold,
      lightning: augment.key === 'lightning' ? damage.types.lightning + added : damage.types.lightning,
      chaos: damage.types.chaos,
    } : null;
    return { ...result, values: { physical: physicalDamage, elemental: elementalDamage, chaos, total }, types, formula };
  }
  // 增幅说明：附加到受影响点伤列与总伤的悬停文案；只有估算成功才声明「已并入」，
  // 失败写明「未能估算」且不重复列标题里已有的同一原因。
  function augmentNote(augment, baseTitle = '') {
    const socketText = augment.available < augment.specialSockets
      ? `可用孔 ${augment.available} − 特殊孔 ${augment.specialSockets} 不足，按 0 孔计算`
      : `可用孔 ${augment.available} − 特殊孔 ${augment.specialSockets} = ${augment.sockets} 孔`;
    const limitation = '基数是去增幅点伤：已移除原有孔内局部伤害增幅，物理品质不足20%补至20%，保留装备词缀与更高品质。特殊孔按插特殊符文预留，数值未知。只计算所选档位，切换高阶/完美或增幅类型立即重算；勾选「计算攻速」时新增点伤随总伤一并乘攻速，是否受装备局部百分比增幅影响未验证，不计暴击、技能与角色加成；排序使用未取整值。';
    if (!augment.values) {
      const lines = [`${augment.label} · ${augment.tierName}：${socketText}，未能估算新增增幅，本列显示计算不可得。`];
      if (augment.reason && !baseTitle.includes(augment.reason)) lines.push(augment.reason);
      lines.push(limitation);
      return lines.join('\n');
    }
    return [
      `${augment.label} · ${augment.tierName}：${socketText}，按插满所选增幅估算，本列显示值已并入此增幅。`,
      augment.formula,
      limitation,
    ].join('\n');
  }
  // 伤害占比条只使用处理后的五类平均单次点伤：无法可靠拆分元素、或所选增幅估算失败时，
  // 返回原因而不绘制部分比例，避免用面板比例冒充处理后的构成。
  function damageBreakdown(damage, augment) {
    if (damage.reason) return { reason: damage.reason };
    if (augment && !augment.values) return { reason: augment.reason || '增幅估算失败，无法确认处理后的伤害构成' };
    const types = augment ? augment.types : damage.types;
    if (!types) return { reason: '元素伤害面板未按火焰 / 冰冷 / 闪电分类或类型标记不唯一，无法拆分伤害占比' };
    // 占比不乘攻速；增幅说明只在估算并入时声明。
    const note = augment
      ? `已计入当前选择的增幅估算（${augment.label} · ${augment.tierName}）；不含技能、暴击与角色加成。`
      : '未选择增幅估算；不含技能、暴击与角色加成。';
    return { types, note };
  }
  function readWeapon(row, index) {
    const physical = damageRanges(damageProperty(row, 'pdamage'), /^(?:Physical Damage|物理[傷伤]害)\s*[:：]?$/i);
    const elementalProperty = damageProperty(row, 'edamage');
    // 原生元素范围可能通过旧 colour 类或新 CSS 变量着色；只去掉嵌套重复节点。
    const elementalParts = [...(elementalProperty?.querySelectorAll(ELEMENTAL_SELECTOR) || [])].filter(element => !element.parentElement?.closest(ELEMENTAL_SELECTOR));
    const elementalGroups = elementalParts.map(element => damageRanges(element, /^(?:Fire|Cold|Lightning) Damage\s*[:：]?$/i));
    const elemental = elementalParts.length ? elementalGroups.some(ranges => ranges === null || !ranges.length) ? null : elementalGroups.flat() : damageRanges(elementalProperty, /^(?:Elemental Damage|元素[傷伤]害)\s*[:：]?$/i);
    // 火 / 冰 / 电拆分：每段必须由页面标记唯一确定类型；无元素范围时三类均按零处理，供占比条使用。
    const elementalRanges = { fire: [], cold: [], lightning: [] };
    let elementalSplit = elementalParts.length > 0;
    for (const [partIndex, part] of elementalParts.entries()) {
      const matched = ELEMENTAL_TYPES.filter(type => part.matches(type.selector));
      const ranges = elementalGroups[partIndex];
      if (matched.length !== 1 || !Array.isArray(ranges) || !ranges.length) { elementalSplit = false; break; }
      elementalRanges[matched[0].key].push(...ranges);
    }
    if (!elementalParts.length) elementalSplit = Array.isArray(elemental) && elemental.length === 0;
    const chaos = damageRanges(damageProperty(row, 'cdamage'), /^(?:Chaos Damage|混沌[傷伤]害)\s*[:：]?$/i);
    const attacksPerSecond = number(text(damageProperty(row, 'aps')));
    const validSpeed = Number.isFinite(attacksPerSecond) && attacksPerSecond > 0;
    const sockets = row.querySelector('.sockets');
    const classCount = sockets?.className.match(/numSockets(\d+)/);
    const socketCount = Math.max(classCount ? Number(classCount[1]) : 0, row.querySelectorAll('.socket').length);
    const mods = readModifiers(row);
    const damage = socketFreeDamage(row, mods, { physical, elemental, chaos }, elementalSplit ? elementalRanges : null);
    const socketFreeTotal = damage.reason ? null : damage.values.physical + damage.values.elemental + damage.values.chaos;
    const states = readItemStates(row);
    const display = socketDisplay(row, socketCount, mods, true, states);
    const augment = augmentEstimate(damage, display.count, mods);
    // 增幅不单独成列：估算成功时并入对应点伤列与总伤；失败时受影响列为 null（渲染计算不可得），未受影响列保留基数。
    const affected = augment ? augment.key === 'physical' ? ['physicalDamage', 'totalDamage'] : ['elementalDamage', 'totalDamage'] : [];
    const damageValues = {
      physicalDamage: damage.values.physical, elementalDamage: damage.values.elemental, chaosDamage: damage.values.chaos,
      totalDamage: socketFreeTotal,
    };
    if (augment) {
      damageValues.totalDamage = augment.values?.total ?? null;
      if (augment.key === 'physical') damageValues.physicalDamage = augment.values?.physical ?? null;
      else damageValues.elementalDamage = augment.values?.elemental ?? null;
    }
    // 总伤：勾选「计算攻速」时按处理后的总点伤乘每秒攻击次数；处理或攻速失败时保持不可得，不回落面板值。
    const processedTotal = damageValues.totalDamage;
    const totalDamage = countAttacksPerSecond
      ? Number.isFinite(processedTotal) && validSpeed ? processedTotal * attacksPerSecond : null
      : processedTotal;
    damageValues.totalDamage = totalDamage;
    // 性价比：除以标价金额（沿用「仅按金额，不换算货币」口径）；总伤、金额或攻速不可得时不计算。
    const price = readPrice(row);
    const priceAmount = number(price);
    const damagePerPrice = Number.isFinite(totalDamage) && Number.isFinite(priceAmount) && priceAmount > 0 ? totalDamage / priceAmount : null;
    const apsReason = countAttacksPerSecond && Number.isFinite(processedTotal) && !validSpeed ? '未读取到有效的每秒攻击次数' : '';
    const damagePerPriceTitle = Number.isFinite(damagePerPrice)
      ? `性价比 = 总伤 ${fmt(totalDamage)} ÷ 价格金额 ${fmt(priceAmount)} = ${fmtRatio(damagePerPrice)}（保留2位小数，排序使用未取整值）\n仅按标价金额，不换算货币；${countAttacksPerSecond ? '总伤已乘攻速' : '总伤为平均单次伤害'}，随增幅估算变化。`
      : !Number.isFinite(priceAmount) || priceAmount <= 0
        ? '未读取到有效的价格金额，无法计算性价比。'
        : `总伤不可得${damage.reason || apsReason ? `（${damage.reason || apsReason}）` : ''}，无法计算性价比。`;
    const apsSuffix = countAttacksPerSecond
      ? Number.isFinite(processedTotal)
        ? validSpeed ? `\n计算攻速：总伤 = ${fmt(processedTotal)} × ${fmt(attacksPerSecond)} = ${fmt(totalDamage)}（每秒伤害）` : '\n计算攻速：未读取到有效的每秒攻击次数，总伤不可得'
        : ''
      : Number.isFinite(processedTotal) ? '\n未计攻速：总伤为平均单次伤害' : '';
    const weaponTitles = {
      physicalDamage: damage.titles.physical,
      elementalDamage: damage.titles.elemental + '\n火焰、冰冷、闪电平均点伤之和，不含混沌。',
      chaosDamage: damage.titles.chaos,
      totalDamage: damage.reason || `去除孔内局部增幅后的总点伤 = 补品质物理 ${fmt(damage.values.physical)} + 元素 ${fmt(damage.values.elemental)} + 混沌 ${fmt(damage.values.chaos)} = ${fmt(socketFreeTotal)}（保留装备词缀，仅物理品质不足20%补至20%，更高品质保留）${apsSuffix}`,
    };
    for (const key of affected) weaponTitles[key] += `\n${augmentNote(augment, weaponTitles[key])}`;
    return {
      row, index, ...damageValues,
      socketDisplay: display,
      states,
      price,
      damagePerPrice,
      damagePerPriceTitle,
      weaponTitles,
      breakdown: damageBreakdown(damage, augment),
    };
  }
  // 交易结果的状态标志：腐化/圣化/复制。官方 trade2 以标签文字表示状态，
  // 装备名称与词缀正文排除，避免描述里的关键词被当成状态。
  // 复制（Mirrored）的页面类名尚未核对，仅使用明确的文字标签与同名类。
  const ITEM_STATES = [
    { key: 'corrupted', flag: '腐', label: '已腐化', pattern: /^(?:Corrupted|Twice\s+Corrupted|雙重腐化|双倍腐化|(?:已)?(?:腐化|汙染|污染))$/i },
    { key: 'sanctified', flag: '圣', label: '已圣化', pattern: /^(?:Sanctified|(?:已)?(?:圣化|聖化))$/i },
    { key: 'mirrored', flag: '复', label: '已复制', pattern: /^(?:Mirrored|(?:已)?(?:复制|複製))$/i },
  ];
  function readItemStates(row) {
    const itemContent = row.querySelector('.item-popup, .itemPopup') || row;
    const found = new Set();
    for (const state of ITEM_STATES) {
      if (row.classList.contains(state.key) || itemContent.classList.contains(state.key) || row.querySelector(`.item-popup.${state.key}, .itemPopup.${state.key}`)) found.add(state.key);
    }
    for (const element of itemContent.querySelectorAll('*')) {
      if (element.children.length || element.closest('.item-popup__header--item, .itemName, .item-name, h1, [data-field^="stat."]')) continue;
      const value = text(element);
      if (value) for (const state of ITEM_STATES) if (state.pattern.test(value)) found.add(state.key);
    }
    return ITEM_STATES.filter(state => found.has(state.key));
  }
  function socketDisplay(row, socketCount, mods, weapon = false, states = readItemStates(row)) {
    // 按符文 stat ID 判定，不按通用 Soul 图片或装备名称猜测；同一限 1 标记只扣一次。
    const boundMarkers = new Set();
    let boundConversions = 0;
    let jewelSocket = false;
    for (const mod of mods) {
      if (mod.type !== 'rune') continue;
      if (BOUND_RUNE_MARKERS.has(mod.id)) boundMarkers.add(mod.id);
      if (BOUND_CONVERSION_RUNES.has(mod.id)) boundConversions++;
      if (mod.id === JEWEL_SOCKET_RUNE) jewelSocket = true;
    }
    const boundSocketCount = boundMarkers.size + boundConversions;
    if (jewelSocket) return { total: socketCount, count: 0, supplemented: false, title: `总孔 ${socketCount}，可用孔 0；卡迪根的顿悟已将增幅孔转为珠宝孔（不追加18%/20%防御，不假定补孔）` };
    if (socketCount > 0 || boundSocketCount > 0) {
      const count = Math.max(0, socketCount - boundSocketCount);
      return { total: socketCount, count, supplemented: false, title: `总孔 ${socketCount}，可用孔 ${count}（可替换增幅，普通已填符文仍可用）${boundSocketCount ? `；绑定增幅孔 ${boundSocketCount}，绑定孔不可用` : ''}` };
    }
    // Reuse the reference helper's type-property convention, never names/mods
    // or the numeric Armour panel as evidence that an item is body armour.
    const property = row.querySelector('.item-property[index="0"], .property[index="0"]');
    const type = property?.matches('.propertyArmor, [data-field="ar"]') || property?.querySelector('.propertyArmor, [data-field="ar"]') ? '' : text(property);
    // 普通孔上限参考 https://www.poe2wiki.net/wiki/Augment_socket；仅按属性行类型补 0 孔。
    const slot = (weapon ? [
      { pattern: /^(?:Two[ -]Hand(?:ed)?(?:\s+\w+)*|Bows?|Crossbows?|Quartersta(?:ff|ves)|Sta(?:ff|ves)|Talismans?)$|^(?:雙手|双手).+|^(?:弓|弩|十字弩|長杖|长杖|細杖|细杖|法杖|戰杖|战杖|護符|护符)\s*$/i, label: '双手武器', count: 2 },
      { pattern: /^(?:One[ -]Hand(?:ed)?(?:\s+\w+)*|Wands?|Sceptres?|Scepters?|Daggers?|Claws?|Spears?|Flails?)$|^(?:單手|单手).+|^(?:魔杖|權杖|权杖|短杖|匕首|爪|長矛|长矛|矛|連枷|连枷)\s*$/i, label: '单手武器', count: 1 },
    ] : [
      { pattern: /\b(?:Body Armou?r|Chest)\b|胸甲|護甲|护甲/i, label: '胸甲', count: 2 },
      { pattern: /\bHelmets?\b|頭盔|头盔/i, label: '头盔', count: 1 },
      { pattern: /\bGloves\b|手套/i, label: '手套', count: 1 },
      { pattern: /\bBoots\b|靴子|靴|鞋子/i, label: '鞋子', count: 1 },
    ]).find(slot => slot.pattern.test(type));
    if (!slot) return { total: socketCount, count: socketCount, supplemented: false, title: `总孔 ${socketCount}，可用孔 ${socketCount}` };
    // 腐化/圣化复用共享状态判定，不假定补孔；复制是否禁止补孔未验证，不改变孔规则。
    const blocked = states.some(state => state.key === 'corrupted' || state.key === 'sanctified');
    const supplemented = socketCount === 0 && slot && !blocked;
    const count = supplemented ? slot.count : socketCount;
    return { total: count, count, supplemented, title: supplemented ? `总孔 ${count}，可用孔 ${count}；原孔 0，按${slot.label}补 ${slot.count}（假定补孔${weapon ? '，不影响点伤或总伤' : '，不参与计算'}）` : `总孔 ${socketCount}，可用孔 ${socketCount}${blocked ? '；腐化或圣化，不假定补孔' : ''}` };
  }
  function readModifiers(row) {
    const mods = [];
    // Only discard nested duplicate markup, not separate equal-valued modifiers.
    for (const element of row.querySelectorAll('[data-field^="stat."]')) {
      const name = element.getAttribute('data-field');
      if (element.parentElement?.closest('[data-field]')?.getAttribute('data-field') === name) continue;
      const value = text(element);
      const match = name.match(/^stat\.([^.]+)\.(stat_\d+)$/);
      if (!match || !value) continue;
      const percent = value.replace(/,/g, '').match(/([+-]?\d+(?:\.\d+)?)\s*%/);
      let amount = percent ? Number(percent[1]) / 100 : null;
      if (amount !== null && /reduced|less|降低|減少|减少/i.test(value)) amount = -Math.abs(amount);
      mods.push({ id: match[2], type: match[1], text: value, percent: amount });
    }
    return mods;
  }
  // 固定词缀数值（如「+100 to maximum Mana」）。已收录的魔力与属性 ID 都是平坦值，
  // 出现百分比说明不是预期词缀，按无法解析处理，不猜数值。
  function flatValue(mod) {
    if (mod.percent !== null) return null;
    const match = mod.text.replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }
  // 装备自身魔力 = 最大魔力词缀合计 + 2 × (智慧 + 全能力)，跳过 rune 类型词缀：孔内增幅默认不计入，
  // 只有勾选增幅时才按所选档位加入，避免与所选估算重复累计。跳过的符文也不参与解析失败判定。
  function readEquipmentMana(mods) {
    const totals = { affix: 0, intelligence: 0, attributes: 0 };
    let invalid = '';
    for (const mod of mods) {
      if (mod.type === 'rune') continue;
      const group = EQUIPMENT_MANA_IDS.has(mod.id) ? 'mana' : INTELLIGENCE_IDS.has(mod.id) ? 'intelligence' : ALL_ATTRIBUTES_IDS.has(mod.id) ? 'attributes' : null;
      if (!group) continue;
      const value = flatValue(mod);
      if (value === null) { if (!invalid) invalid = mod.text; continue; }
      if (group === 'mana') totals.affix += value;
      else totals[group] += value;
    }
    return { totals, affix: totals.affix, equipment: totals.affix + MANA_PER_INTELLIGENCE * (totals.intelligence + totals.attributes), invalid };
  }
  function augmentPerSocketText(augment) {
    const value = augment.unit === 'flat' ? `${fmt(augment.perSocket)} 魔力` : `${fmt(augment.perSocket * 100)}%`;
    if (augment.multiplier === 1) return value;
    const base = augment.unit === 'flat' ? fmt(augment.base) : `${fmt(augment.base * 100)}%`;
    return `${value}（档位 ${base} × ${fmt(augment.multiplier)} 向下取整）`;
  }
  // 「总防御」悬停：最终分量、公式与增幅口径；失败时给出原因，并说明增幅的孔数扣除口径。
  function armourTotalTitle(item) {
    if (item.reason) return item.reason;
    const augment = item.augment;
    const augmentText = `增幅：${augment.label} · ${augment.tierName}，每孔 ${augmentPerSocketText(augment)}；可用孔 ${augment.available} − 特殊孔 ${augment.specialSockets} = ${augment.sockets} 孔${item.socketDisplay.supplemented ? '（假定补孔不参与计算）' : ''}`;
    const manaText = item.mana
      ? `魔力换盾：装备自身魔力 = 词缀 ${fmt(item.mana.affix)} + 智慧 ${fmt(item.mana.totals.intelligence)} × ${MANA_PER_INTELLIGENCE} + 全能力 ${fmt(item.mana.totals.attributes)} × ${MANA_PER_INTELLIGENCE} = ${fmt(item.mana.equipment)}${item.mana.augmentSockets > 0 ? `；增幅魔力 = ${item.mana.augmentSockets} 孔 × ${fmt(item.mana.perSocket)} = ${fmt(item.mana.augmentMana)}` : ''}；转换护盾 = ${fmt(item.mana.converted)}（1 魔力 = 1 护盾，按指定模型估算，不计品质与防御增幅${item.mana.augmentSockets > 0 ? '' : '；孔内魔力符文不计入'}）`
      : '';
    if (item.totalReason) return `${item.totalReason}\n${augmentText}${manaText ? `\n${manaText}` : ''}`;
    return `${breakdown(item.totalComponents)}\n品质 ${fmt(item.quality)}% → ${fmt(Math.max(item.quality, 20))}%\n${item.socketDisplay.title}\n${item.formulas.join('\n')}${manaText ? `\n${manaText}` : ''}\n合计 ${fmt(item.total)}，向下取整显示 ${fmtDefense(item.total)}；排序使用未取整值。\n裸基础是中间反推量；${augment.enabled ? `「总防御」已并入所选增幅估算（${augmentText}）` : '「总防御」不含孔内增幅（未选增幅估算）'}${item.mana ? '，护盾另含魔力换盾估算' : ''}；不计角色加成与其他词缀。`;
  }
  function readEquipment(row, index) {
    const mods = readModifiers(row);
    const sockets = row.querySelector('.sockets');
    const socketClassCount = sockets?.className.match(/numSockets(\d+)/);
    const socketCount = Math.max(socketClassCount ? Number(socketClassCount[1]) : 0, row.querySelectorAll('.socket').length);
    const qualityText = field(row, 'quality');
    const states = readItemStates(row);
    const values = ATTRIBUTES.map(attribute => number(field(row, attribute.key)));
    const item = {
      row, index, mods, socketCount, socketDisplay: socketDisplay(row, socketCount, mods, false, states), states, values,
      unreadableDefense: ATTRIBUTES.some(attribute => field(row, attribute.key) !== '' && number(field(row, attribute.key)) === null),
      price: readPrice(row),
      quality: qualityText ? number(qualityText) : 0,
      current: values.some(value => value !== null) ? values.reduce((sum, value) => sum + (value ?? 0), 0) : null,
      formulas: [], reason: '',
      total: null, totalComponents: [], totalReason: '', augment: null, mana: null, totalTitle: '',
      defensePerPrice: null, defensePerPriceTitle: '', defenseBreakdown: null,
    };
    calculate(item);
    // 性价比：除以标价金额（沿用「仅按金额，不换算货币」口径）；总防御或金额不可得时不计算。
    const priceAmount = number(item.price);
    item.defensePerPrice = Number.isFinite(item.total) && Number.isFinite(priceAmount) && priceAmount > 0 ? item.total / priceAmount : null;
    item.defensePerPriceTitle = Number.isFinite(item.defensePerPrice)
      ? `性价比 = 总防御 ${fmt(item.total)} ÷ 价格金额 ${fmt(priceAmount)} = ${fmtRatio(item.defensePerPrice)}（保留2位小数，排序使用未取整值）\n仅按标价金额，不换算货币；总防御${item.augment.enabled ? `含所选增幅估算（${item.augment.label} · ${item.augment.tierName}）` : '为去除孔内增幅的基础值，未选增幅估算'}${item.mana ? '，护盾含魔力换盾估算' : ''}。`
      : !Number.isFinite(priceAmount) || priceAmount <= 0
        ? '未读取到有效的价格金额，无法计算性价比。'
        : `总防御不可得（${item.totalReason || item.reason}），无法计算性价比。`;
    item.totalTitle = armourTotalTitle(item);
    item.defenseBreakdown = item.reason || item.totalReason
      ? { reason: item.totalReason || item.reason }
      : {
        heading: `防御构成 · ${item.augment.enabled ? '已并入所选增幅估算' : '去符文基础值'}${item.mana ? '；护盾含魔力换盾' : ''}`,
        values: Object.fromEntries(ATTRIBUTES.map((attribute, index) => [attribute.key, item.totalComponents[index]])),
        note: `${item.augment.enabled ? `已计入增幅估算（${item.augment.label} · ${item.augment.tierName}，${item.augment.sockets} 孔，每孔 ${augmentPerSocketText(item.augment)}）；` : '未选择增幅估算，孔内增幅不计入；'}${item.mana ? `护盾另含魔力换盾估算（装备自身魔力 ${fmt(item.mana.equipment)}${item.mana.augmentSockets > 0 ? ` + 增幅魔力 ${fmt(item.mana.augmentMana)} = ${fmt(item.mana.equipment + item.mana.augmentMana)}` : '，孔内魔力符文不计入'} = 转换护盾 ${fmt(item.mana.converted)}，1 魔力 = 1 护盾，不计品质与防御增幅）；` : ''}不含角色加成与其他词缀。`,
      };
    return item;
  }
  function calculate(item) {
    if (item.current === null) { item.reason = '未读取到防御面板字段'; return; }
    if (item.unreadableDefense) { item.current = null; item.reason = '防御字段存在但无法解析'; return; }
    if (item.quality === null || item.quality < 0) { item.reason = '品质字段无法解析'; return; }
    // 与参考脚本一样，只处理已收录的防御 ID；其他符文不参与反推，也不阻止计算。
    const invalidDefenseRune = item.mods.find(mod => mod.type === 'rune' && [DEFENSE_RUNE, WARD_RUNE].includes(mod.id) && mod.percent === null);
    if (invalidDefenseRune) { item.reason = `已收录防御符文百分比无法解析：${invalidDefenseRune.text}`; return; }
    // 增幅：防御百分比与魔力互斥，可全部取消；假定补孔只用于显示，特殊孔从可用孔中扣除。
    const availableSockets = item.socketDisplay.supplemented ? 0 : item.socketDisplay.count;
    const augmentSockets = armourAugmentKey ? Math.max(0, availableSockets - armourSpecialSockets) : 0;
    const defenseAugmentSockets = armourAugmentKey === 'defense' ? augmentSockets : 0;
    const manaAugmentSockets = armourAugmentKey === 'mana' ? augmentSockets : 0;
    const manaAugment = armourAugmentKey === 'mana';
    // 增幅效果倍率：与武器同口径，RUNE_EFFECT_IDS 相加后每孔数值只乘一次，默认向下取整。
    // 用户页面诊断（8ca0437a…）：装备「增加60%镶嵌的物品效果」下，完美防御符文显示 32%（20% × 1.6）、
    // 完美魔力符文显示 +80（50 × 1.6），与交易页词缀数值一致。
    const runeEffectMods = item.mods.filter(mod => RUNE_EFFECT_IDS.has(mod.id));
    const runeEffectMultiplier = 1 + runeEffectMods.reduce((sum, mod) => sum + (mod.percent ?? 0), 0);
    const runeEffectValid = !runeEffectMods.some(mod => mod.percent === null) && runeEffectMultiplier > 0;
    if (armourAugmentKey && !runeEffectValid) {
      item.totalReason = runeEffectMods.some(mod => mod.percent === null) ? '装备的增幅效果倍率无法解析，无法估算新增增幅' : '装备的增幅效果倍率系数无效，无法估算新增增幅';
    }
    const defensePerSocket = Math.floor(DEFENSE_AUGMENT_PER_SOCKET[armourTierIndex] * runeEffectMultiplier * 100) / 100;
    const manaPerSocket = Math.floor(MANA_AUGMENT_PER_SOCKET[armourTierIndex] * runeEffectMultiplier);
    item.augment = {
      key: armourAugmentKey, label: manaAugment ? '魔力' : '防御百分比', tierName: AUGMENT_TIERS[armourTierIndex],
      base: manaAugment ? MANA_AUGMENT_PER_SOCKET[armourTierIndex] : DEFENSE_AUGMENT_PER_SOCKET[armourTierIndex],
      perSocket: manaAugment ? manaPerSocket : defensePerSocket,
      multiplier: runeEffectMultiplier, unit: manaAugment ? 'flat' : 'percent',
      available: availableSockets, specialSockets: armourSpecialSockets, sockets: augmentSockets, enabled: Boolean(armourAugmentKey),
    };
    const targetQuality = Math.max(item.quality, 20);
    let totalWithAugment = 0;
    let augmentValid = !item.totalReason;
    if (armourAugmentKey) item.formulas.push(`增幅每孔数值：${augmentPerSocketText(item.augment)}；可用孔 ${availableSockets} − 特殊孔 ${armourSpecialSockets} = ${augmentSockets} 孔`);
    for (const [index, attribute] of ATTRIBUTES.entries()) {
      const observed = item.values[index];
      if (observed === null) { item.totalComponents.push(0); continue; }
      const relevant = item.mods.filter(mod => attribute.ids.includes(mod.id) && LOCAL_TYPES.has(mod.type));
      const equipmentPercent = relevant.reduce((sum, mod) => sum + (mod.percent ?? 0), 0);
      const runeId = attribute.key === 'ward' ? WARD_RUNE : DEFENSE_RUNE;
      const runePercent = item.mods.filter(mod => mod.type === 'rune' && mod.id === runeId).reduce((sum, mod) => sum + mod.percent, 0);
      if (attribute.key === 'ward') {
        const uncertainPercent = item.mods.some(mod => LOCAL_TYPES.has(mod.type) && mod.percent !== null && (attribute.ids.includes(mod.id) || /ward|保护|保護|结界|結界/i.test(mod.text)));
        if (uncertainPercent && runePercent !== 0) {
          item.reason = '保护装备百分比的局部/全局归类未验证，无法结合保护百分比符文反推'; return;
        }
        if (runePercent === 0) {
          const normalized = observed * ((1 + targetQuality / 100) / (1 + item.quality / 100));
          item.formulas.push(`保护：无保护百分比符文，装备增幅在分子/分母抵消；基础防御 = ${fmt(observed)} × (1 + ${fmt(targetQuality)}/100) ÷ (1 + ${fmt(item.quality)}/100) = ${fmt(normalized)}。不臆测裸基础或局部词缀归类。`);
          if (defenseAugmentSockets > 0 && uncertainPercent) {
            augmentValid = false;
            item.totalReason = '保护装备百分比的局部/全局归类未验证，无法估算增加孔内防御增幅后的保护';
            item.totalComponents.push(0);
          } else {
            const value = normalized * (1 + defenseAugmentSockets * defensePerSocket);
            item.totalComponents.push(value);
            totalWithAugment += value;
            if (defenseAugmentSockets > 0) item.formulas.push(`保护：含防御增幅估算 = ${fmt(normalized)} × (1 + ${defenseAugmentSockets} × ${fmt(defensePerSocket * 100)}/100) = ${fmt(value)}（按指定品质/孔增幅模型估算）`);
          }
          continue;
        }
      }
      const denominator = (1 + item.quality / 100) * (1 + equipmentPercent + runePercent);
      if (denominator <= 0 || 1 + equipmentPercent < 0) { item.reason = '百分比系数无效'; return; }
      const rawBase = observed / denominator;
      // Equivalent to rawBase × equipment factor × target quality; cancel the
      // shared factors before multiplying so unchanged values retain exact ties.
      const normalized = observed * (((1 + equipmentPercent) * (1 + targetQuality / 100)) / denominator);
      if (!Number.isFinite(normalized)) { item.reason = '防御计算结果无效'; return; }
      item.formulas.push(`${attribute.label}：裸基础 = ${fmt(observed)} ÷ (1 + ${fmt(item.quality)}/100) ÷ (1 + ${fmt(equipmentPercent * 100)}/100 + ${fmt(runePercent * 100)}/100) = ${fmt(rawBase)}；基础防御 = 裸基础 × (1 + ${fmt(equipmentPercent * 100)}/100) × (1 + ${fmt(targetQuality)}/100) = ${fmt(normalized)}`);
      // 未选增幅时 defenseAugmentSockets 为 0，结果与基础值逐位相同，保持原数值并列关系不变。
      const augmented = observed * (((1 + equipmentPercent + defenseAugmentSockets * defensePerSocket) * (1 + targetQuality / 100)) / denominator);
      if (!Number.isFinite(augmented)) {
        augmentValid = false;
        item.totalReason = '防御增幅计算结果无效';
        item.totalComponents.push(0);
      } else {
        item.totalComponents.push(augmented);
        totalWithAugment += augmented;
        if (defenseAugmentSockets > 0) item.formulas.push(`${attribute.label}：含防御增幅估算 = 裸基础 × (1 + ${fmt(equipmentPercent * 100)}/100 + ${defenseAugmentSockets} × ${fmt(defensePerSocket * 100)}/100) × (1 + ${fmt(targetQuality)}/100) = ${fmt(augmented)}`);
      }
    }
    // 魔力换盾：装备自身魔力（不含孔内符文）加所选魔力增幅，在防御计算完成后按 1 魔力 = 1 护盾并入护盾分量。
    // 孔内增幅默认不计入；选择「魔力」增幅只加入所选档位的估算，不与原有孔内魔力叠加。
    // 转换护盾不参与品质、装备百分比与孔内防御增幅，假定补孔同样不提供增幅魔力。
    if (armourManaShield) {
      const mana = readEquipmentMana(item.mods);
      if (mana.invalid) {
        augmentValid = false;
        if (!item.totalReason) item.totalReason = `已收录魔力/属性词缀数值无法解析：${mana.invalid}`;
      } else {
        const augmentMana = manaAugmentSockets * manaPerSocket;
        const converted = (mana.equipment + augmentMana) * MANA_SHIELD_PER_MANA;
        const esIndex = ATTRIBUTES.findIndex(attribute => attribute.key === 'es');
        item.totalComponents[esIndex] += converted;
        totalWithAugment += converted;
        item.mana = { totals: mana.totals, affix: mana.affix, equipment: mana.equipment, augmentSockets: manaAugmentSockets, perSocket: manaPerSocket, augmentMana, converted };
      }
    }
    item.total = augmentValid ? totalWithAugment : null;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;right:16px;top:100px;z-index:2147483646;color-scheme:dark;';
  host.setAttribute('data-collapsed', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      /* 固定展开宽度，内容只撑开表格滚动区，不再撑开面板；窄视口退让到视口宽度。 */
      :host { width:min(420px,calc(100vw - 24px)); font:13px/1.5 system-ui,-apple-system,"Microsoft YaHei",sans-serif; color:#e8e3db; }
      :host([data-collapsed]) { width:48px; min-width:48px; }
      * { box-sizing:border-box; }
      .panel { display:flex; flex-direction:column; max-height:max(48px,calc(100vh - var(--panel-top,100px) - 12px)); background:#171b22; border:1px solid #75613e; border-radius:10px; box-shadow:0 8px 30px #0008; overflow:hidden; }
      header { display:flex; flex-shrink:0; align-items:center; justify-content:space-between; gap:8px; min-height:48px; padding:8px 56px 8px 10px; background:#252b35; cursor:move; touch-action:none; }
      header strong { color:#e7c889; white-space:nowrap; }
      button { font:inherit; color:inherit; background:#282f3a; border:1px solid #515a68; border-radius:5px; padding:3px 6px; cursor:pointer; }
      button:hover { border-color:#e7c889; }
      button:focus-visible { outline:2px solid #e7c889; outline-offset:2px; }
      #launcher, #collapse { width:48px; height:48px; padding:0; }
      #collapse { position:absolute; top:0; right:0; }
      #launcher { display:block; border-radius:50%; border-color:#75613e; background:#171b22; color:#e7c889; font-weight:700; box-shadow:0 8px 30px #0008; touch-action:none; }
      .body { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
      .panel-controls { flex-shrink:0; padding:8px; }
      .table-scroll { min-height:0; overflow:auto; padding:0 8px 8px; }
      [hidden] { display:none !important; }
      .toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; }
      .toolbar-actions { display:flex; gap:4px; }
      .detail-option { display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; }
      /* 分三行固定分组：显示项 / 特殊孔＋档位 / 增幅类型；避免单行过宽把面板撑开。 */
      .mode-options { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
      .option-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
      .mode-options select { font:inherit; color:inherit; background:#282f3a; border:1px solid #515a68; border-radius:5px; padding:2px 4px; cursor:pointer; }
      .mode-switch { display:flex; flex-shrink:0; gap:4px; padding:8px; border-bottom:1px solid #343c48; }
      .mode-switch button { flex:1; }
      .mode-switch button[aria-pressed="true"] { color:#e7c889; border-color:#e7c889; background:#353020; }
      .muted { color:#aeb7c5; font-size:12px; }
      .warning { color:#f5c786; }
      table { width:max-content; min-width:100%; table-layout:auto; border-collapse:collapse; font-variant-numeric:tabular-nums; color:inherit; }
      th, td { padding:6px 3px; border-bottom:1px solid #343c48; text-align:right; vertical-align:middle; white-space:nowrap; }
      th { color:#c0c7d2; font-size:12px; }
      .sort { border:0; background:none; padding:0; width:100%; text-align:inherit; color:inherit; }
      .locate { border:0; background:none; padding:0; text-align:right; white-space:nowrap; color:#e7c889; text-decoration:underline dotted; text-underline-offset:3px; }
      /* 整行可点击定位交易页条目。 */
      tbody tr { cursor:pointer; }
      .states { width:1px; text-align:left; }
      .state { padding:0 3px; border:1px solid currentColor; border-radius:4px; font-size:11px; }
      .state + .state { margin-left:4px; }
      .state-corrupted { color:#ff6b6b; }
      .state-sanctified { color:#ffe066; }
      .state-mirrored { color:#c084fc; }
      .total, .totalDamage, .damagePerPrice, .defensePerPrice { color:#b6dfaa; }
      tr.has-details td { border-bottom:0; }
      tr.defense-details td { width:auto; padding-top:0; text-align:center; color:#aeb7c5; font-size:12px; }
      tr.source-hovered td { background:#403721; box-shadow:inset 0 1px #75613e,inset 0 -1px #75613e; }
      /* 高亮同一件装备时主行与详情行看成一整块：内部不画线，只在区域最上/最下保留高亮边线。 */
      tr.source-hovered.has-details td { box-shadow:inset 0 1px #75613e; }
      tr.weapon-details.source-hovered td, tr.defense-details.source-hovered td { box-shadow:inset 0 -1px #75613e; }
      .detail-ar { color:#ff9292; }
      .detail-ev { color:#91db91; }
      .detail-es { color:#85baff; }
      .detail-ward { color:#c9a0ff; }
      tr.weapon-details td { width:auto; padding-top:0; text-align:center; color:#aeb7c5; font-size:12px; }
      /* 构成占比条：固定 160px、居中；各段按未取整数值比例分配，颜色见 DAMAGE_BREAKDOWN / DEFENSE_BREAKDOWN。 */
      .damage-bar { display:flex; width:160px; max-width:100%; height:6px; margin:0 auto; background:#0f1217; border:1px solid #515a68; border-radius:3px; overflow:hidden; }
      .damage-bar:focus-visible { outline:2px solid #e7c889; outline-offset:2px; }
      .damage-segment { flex:1 1 0; min-width:0; }
      .damage-note { display:inline-block; width:160px; white-space:normal; }
      /* 明细数值：按 DAMAGE_BREAKDOWN / DEFENSE_BREAKDOWN 颜色显示正数项，位于占比条上方；允许换行。 */
      .damage-values { margin:0 0 4px; white-space:normal; }
      @media (max-width:450px) { .panel-controls { padding:6px; } .table-scroll { padding:0 6px 6px; } th,td { padding:6px 2px; font-size:12px; } }
    </style>
    <button id="launcher" type="button" aria-label="展开装备排序浮窗" aria-expanded="false" aria-controls="panel" title="点击展开装备排序，拖动移动">POE</button>
    <section id="panel" class="panel" aria-label="装备防御与武器伤害排序浮窗" hidden>
      <header><strong>装备防御 · 总防御降序</strong><button id="collapse" type="button" aria-expanded="false" aria-controls="panel">收起</button></header>
      <nav class="mode-switch" aria-label="装备类型"><button type="button" data-mode="armour" aria-pressed="true">护甲</button><button type="button" data-mode="weapon" aria-pressed="false">武器</button></nav>
      <div id="body" class="body">
        <div class="panel-controls">
        <div class="toolbar"><span id="status" class="muted" role="status"></span><div class="toolbar-actions"><button id="back-top" type="button" title="回到交易页面顶部">回顶部</button><button id="locate-more" type="button" title="滚动并聚焦交易页原生加载按钮，不自动加载">定位加载更多</button><button id="refresh" type="button">刷新</button></div></div>
        <div id="locate-status" class="muted" role="status" hidden></div>
        <div id="armour-options" class="mode-options">
        <div class="option-row">
        <label class="detail-option" title="在护甲表格显示「性价比」列（位于「总防御」右侧）：当前总防御 ÷ 标价金额，保留2位小数；仅按金额，不换算货币。总防御随增幅与魔力换盾估算变化。"><input id="armour-per-price" type="checkbox">显示性价比</label>
        <label class="detail-option" title="勾选后在每行护甲下方列出护甲 / 闪避 / 护盾 / 保护 的处理后数值（与占比条同源，含已选增幅与魔力换盾估算，未选增幅时不含孔内增幅）；为 0 或未读取到的类型不显示。"><input id="armour-show-details" type="checkbox">显示详细数值</label>
        </div>
        <div class="option-row">
        <label class="detail-option" title="预留给特殊符文的孔数；估算增幅时从可用孔中扣除，默认 0">特殊孔<select id="armour-special-sockets" aria-label="特殊孔数量"></select></label>
        <span class="muted">增幅：</span>
        <label class="detail-option" title="增幅估算档位：高阶符文每孔 18%（防御）或 +40 魔力；仅在勾选「防御百分比」或「魔力」后影响结果"><input type="radio" name="armour-augment-tier" data-armour-tier="high" checked>高阶</label>
        <label class="detail-option" title="增幅估算档位：完美符文每孔 20%（防御）或 +50 魔力；仅在勾选「防御百分比」或「魔力」后影响结果"><input type="radio" name="armour-augment-tier" data-armour-tier="perfect">完美</label>
        </div>
        <div class="option-row">
        <label class="detail-option" title="勾选后估算孔内防御增幅：增加护甲、闪避、护盾与保护；与装备自身增幅相加，先移除原有防御符文再重算，直接并入「总防御」及各类型明细；每孔数值按装备的镶嵌增幅效果倍率向下取整。未勾选时「总防御」不含任何孔内增幅。保护存在局部/全局归类疑义时拒绝估算。假定补孔不参与计算。"><input id="armour-augment" type="checkbox">防御百分比</label>
        <label class="detail-option" title="勾选后按孔插魔力符文估算：高阶每孔 +40、完美每孔 +50 最大魔力（护甲行数值），再乘装备的镶嵌增幅效果倍率向下取整。孔内原有魔力默认不计入，勾选后按可用孔加入所选档位，不叠加原有孔内魔力。与「防御百分比」互斥，两者可都不选；需先开启「魔力换盾」才生效。"><input id="armour-mana-augment" type="checkbox" disabled>魔力</label>
        </div>
        <div class="option-row">
        <label class="detail-option" title="把装备自身魔力与所选魔力增幅按 1 魔力 = 1 护盾并入护盾与总防御：装备自身魔力 = 非孔内最大魔力词缀 + 2 × (非孔内智慧 + 全能力)，不含孔内符文，勾选「魔力」后才按所选档位加入；命定 Bonded、pseudo 汇总与角色/天赋魔力不计，也不计品质与防御增幅。按指定模型估算，不视为已验证游戏机制。"><input id="armour-mana-shield" type="checkbox">魔力换盾</label>
        </div>
        </div>
        <div id="weapon-options" class="mode-options" hidden>
        <div class="option-row">
        <label class="detail-option" title="勾选后总伤 = 处理后的总点伤 × 每秒攻击次数（含已选增幅估算）；不勾选时总伤为平均单次伤害。攻速缺失或无效时总伤显示计算不可得。"><input id="count-aps" type="checkbox">计算攻速</label>
        <label class="detail-option" title="在武器表格显示「性价比」列（位于「总伤」右侧）：当前总伤 ÷ 标价金额，保留2位小数；仅按金额，不换算货币。总伤随「计算攻速」与增幅估算变化。"><input id="show-damage-per-price" type="checkbox">显示性价比</label>
        <label class="detail-option" title="勾选后在每行武器下方列出物理 / 闪电 / 火焰 / 冰冷 / 混沌的处理后平均单次点伤（与占比条同源，含增幅估算，不乘攻速）；某类型为 0 时不显示该项。"><input id="show-weapon-details" type="checkbox">显示详细数值</label>
        </div>
        <div class="option-row">
        <label class="detail-option" title="预留给特殊符文的孔数；估算增幅时从可用孔中扣除，默认 0">特殊孔<select id="special-sockets" aria-label="特殊孔数量"></select></label>
        <span class="muted">增幅：</span>
        <label class="detail-option" title="按高阶符文数值计算"><input type="radio" name="augment-tier" data-augment-tier="high" checked>高阶</label>
        <label class="detail-option" title="按完美符文数值计算"><input type="radio" name="augment-tier" data-augment-tier="perfect">完美</label>
        </div>
        <div class="option-row">
        <label class="detail-option" title="增加物理伤害，与装备自身物理增幅相加"><input type="checkbox" data-augment="physical">物理百分比</label>
        <label class="detail-option" title="附加闪电伤害，取平均：高阶 15.5 / 完美 20.5"><input type="checkbox" data-augment="lightning">电点</label>
        <label class="detail-option" title="附加冰冷伤害，取平均：高阶 12 / 完美 18"><input type="checkbox" data-augment="cold">冰点</label>
        <label class="detail-option" title="附加火焰伤害，取平均：高阶 14.5 / 完美 18.5"><input type="checkbox" data-augment="fire">火点</label>
        </div>
        </div>
        </div>
        <div class="table-scroll" tabindex="0" role="region" aria-label="装备排序列表">
        <table><thead><tr></tr></thead><tbody></tbody></table>
        </div>
      </div>
    </section>`;
  document.body.append(host);
  const get = id => root.getElementById(id);
  let timer = null;
  let mode = 'armour';
  let augmentKey = null;
  let augmentTierIndex = 0;
  let specialSockets = 0;
  let countAttacksPerSecond = false;
  let showDamagePerPrice = false;
  let armourTierIndex = 0;
  let armourSpecialSockets = 0;
  let armourAugmentKey = null;
  let armourManaShield = false;
  let armourShowPerPrice = false;
  let firstResultId = null;
  let manualMode = false;
  let sortKey = 'total';
  let sortDirection = 'descending';
  const modeSorting = {
    armour: { key: 'total', direction: 'descending' },
    weapon: { key: 'totalDamage', direction: 'descending' },
  };
  const ARMOUR_COLUMNS = [['current', '当前防御'], ['total', '总防御'], ['sockets', '孔'], ['price', '价格']];
  const WEAPON_COLUMNS = [['totalDamage', '总伤'], ['physicalDamage', '物理'], ['elementalDamage', '元素'], ['chaosDamage', '混沌'], ['sockets', '孔'], ['price', '价格']];
  // 性价比：勾选后插在「总伤」/「总防御」右侧；值为当前总伤（或总防御）÷ 标价金额（沿用仅按金额、不换算货币口径）。
  const DAMAGE_PER_PRICE_COLUMN = ['damagePerPrice', '性价比'];
  const DEFENSE_PER_PRICE_COLUMN = ['defensePerPrice', '性价比'];
  // 增幅不单独成列：勾选后数值直接并入对应点伤列与总伤（见 readWeapon）或总防御（见 calculate）。
  const activeColumns = () => mode !== 'weapon'
    ? armourShowPerPrice ? [ARMOUR_COLUMNS[0], ARMOUR_COLUMNS[1], DEFENSE_PER_PRICE_COLUMN, ...ARMOUR_COLUMNS.slice(2)] : ARMOUR_COLUMNS
    : showDamagePerPrice ? [WEAPON_COLUMNS[0], DAMAGE_PER_PRICE_COLUMN, ...WEAPON_COLUMNS.slice(1)] : WEAPON_COLUMNS;
  const headerRow = root.querySelector('thead tr');
  const panelRows = new Map();
  let hoveredSourceRow = null;
  let highlightedPanelRow = null;
  function highlightSourceRow(row) {
    hoveredSourceRow = row;
    const next = panelRows.get(row) || null;
    if (next === highlightedPanelRow) return;
    for (const [tr, active] of [[highlightedPanelRow, false], [next, true]]) {
      if (!tr) continue;
      tr.classList.toggle('source-hovered', active);
      const details = tr.nextElementSibling;
      if (details?.matches('.defense-details, .weapon-details')) details.classList.toggle('source-hovered', active);
    }
    highlightedPanelRow = next;
  }
  function locateSourceRow(row) {
    // 整行点击定位；选中文本时不跳转，避免复制数值被强制滚动打断。
    if (window.getSelection()?.isCollapsed === false) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const sourceRowAt = target => target instanceof Element && target !== host && !host.contains(target) ? target.closest(ROW_SELECTOR) : null;
  document.addEventListener('mouseover', event => highlightSourceRow(sourceRowAt(event.target)));
  document.addEventListener('mouseout', event => {
    if (sourceRowAt(event.target) === hoveredSourceRow) highlightSourceRow(sourceRowAt(event.relatedTarget));
  });
  function setMode(nextMode) {
    if (nextMode === mode) return;
    modeSorting[mode] = { key: sortKey, direction: sortDirection };
    mode = nextMode;
    sortKey = modeSorting[mode].key;
    sortDirection = modeSorting[mode].direction;
    for (const control of root.querySelectorAll('[data-mode]')) control.setAttribute('aria-pressed', String(control.dataset.mode === mode));
  }
  function sortValue(item) {
    if (sortKey === 'sockets') return item.socketDisplay.count;
    if (sortKey === 'price') return number(item.price);
    if (sortKey === 'damagePerPrice') return item.damagePerPrice;
    if (sortKey === 'defensePerPrice') return item.defensePerPrice;
    return item[sortKey];
  }
  function updateSortHeaders() {
    const columns = activeColumns();
    if (headerRow.children.length !== columns.length + 1) {
      const fragment = document.createDocumentFragment();
      const statesHeader = document.createElement('th');
      statesHeader.className = 'states';
      statesHeader.scope = 'col';
      statesHeader.setAttribute('aria-label', '装备状态');
      fragment.append(statesHeader);
      for (const [key] of columns) {
        const th = document.createElement('th');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sort';
        button.dataset.sort = key;
        th.append(button);
        fragment.append(th);
      }
      headerRow.replaceChildren(fragment);
    }
    const sortButtons = headerRow.querySelectorAll('button[data-sort]');
    for (const [index, [key, label]] of activeColumns().entries()) {
      const button = sortButtons[index];
      button.dataset.sort = key;
      const active = key === sortKey;
      const nextDirection = active && sortDirection === 'descending' || !active && key === 'price' ? '升序' : '降序';
      button.textContent = `${label}${active ? sortDirection === 'descending' ? ' ↓' : ' ↑' : ''}`;
      button.parentElement.setAttribute('aria-sort', active ? sortDirection : 'none');
      const armourEstimate = [armourAugmentKey ? '已选增幅' : '', armourManaShield ? '魔力换盾' : ''].filter(Boolean).join('与');
      button.title = `${label}排序，点击按${nextDirection}${key === 'price' ? '（仅按金额，不换算货币）' : key === 'total' ? `（${armourEstimate ? `含${armourEstimate}估算，` : ''}按未取整值）` : key === 'totalDamage' ? `（${countAttacksPerSecond ? '处理后总点伤 × 攻速' : '平均单次总伤'}，按未取整值）` : key === 'damagePerPrice' ? '（总伤 ÷ 价格金额，仅按金额不换算货币，按未取整值）' : key === 'defensePerPrice' ? '（总防御 ÷ 价格金额，仅按金额不换算货币，按未取整值）' : ''}`;
      button.setAttribute('aria-label', button.title);
      if (active) root.querySelector('header strong').textContent = `${mode === 'weapon' ? '武器伤害' : '装备防御'} · ${label}${sortDirection === 'descending' ? '降序' : '升序'}`;
    }
  }
  function breakdown(values) {
    return ATTRIBUTES.map((attribute, index) => `${attribute.label} ${fmt(values[index] ?? 0)}`).join(' + ');
  }
  // 占比条：武器伤害与护甲防御共用同一渲染。values 为空时显示失败原因、全零时显示空说明，
  // 不用部分比例冒充构成；各段按未取整数值比例分配。
  function breakdownBar(entries, values, { heading, note, empty, failure }) {
    const total = values ? entries.reduce((sum, entry) => sum + (values[entry.key] ?? 0), 0) : 0;
    if (!(total > 0)) {
      const span = document.createElement('span');
      span.className = 'damage-note';
      span.textContent = values ? empty : failure;
      return span;
    }
    const lines = [heading];
    const bar = document.createElement('div');
    bar.className = 'damage-bar';
    bar.tabIndex = 0;
    bar.setAttribute('role', 'img');
    for (const entry of entries) {
      const value = values[entry.key];
      if (!(value > 0)) continue;
      lines.push(`${entry.label}：${fmt(value)}（${Math.round(value / total * 100)}%）`);
      const segment = document.createElement('span');
      segment.className = 'damage-segment';
      segment.style.backgroundColor = entry.color;
      segment.style.flexGrow = String(value);
      bar.append(segment);
    }
    lines.push(note);
    bar.title = lines.join('\n');
    bar.setAttribute('aria-label', lines.join('；'));
    return bar;
  }
  function refresh() {
    const sourceRows = [...document.querySelectorAll(ROW_SELECTOR)].filter(row => row.querySelector(`${WEAPON_SELECTOR}, [data-field="ar"], [data-field="ev"], [data-field="es"], [data-field="ward"], .item-popup, .itemPopup, .item-popup__header--item`));
    const firstRow = sourceRows[0];
    const nextFirstId = firstRow?.getAttribute('data-id') ?? null;
    if (nextFirstId !== firstResultId) {
      firstResultId = nextFirstId;
      manualMode = false;
    }
    if (!manualMode && firstRow) {
      if (firstRow.querySelector(WEAPON_SELECTOR)) setMode('weapon');
      else if (firstRow.querySelector('[data-field="ar"], [data-field="ev"], [data-field="es"], [data-field="ward"]')) setMode('armour');
    }
    const rows = sourceRows.filter(row => mode === 'weapon' ? row.querySelector(WEAPON_SELECTOR) : !row.querySelector(WEAPON_SELECTOR));
    const items = rows.map(mode === 'weapon' ? readWeapon : readEquipment);
    root.querySelector('table').classList.toggle('weapon', mode === 'weapon');
    get('armour-options').hidden = mode !== 'armour';
    get('weapon-options').hidden = mode !== 'weapon';
    items.sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      const leftValid = Number.isFinite(left);
      const rightValid = Number.isFinite(right);
      if (!leftValid || !rightValid) return leftValid ? -1 : rightValid ? 1 : a.index - b.index;
      return (sortDirection === 'descending' ? right - left : left - right) || a.index - b.index;
    });
    updateSortHeaders();
    const tbody = root.querySelector('tbody');
    const fragment = document.createDocumentFragment();
    panelRows.clear();
    for (const item of items) {
      const tr = document.createElement('tr');
      tr.dataset.id = item.row.getAttribute('data-id');
      tr.addEventListener('click', () => locateSourceRow(item.row));
      panelRows.set(item.row, tr);
      const statesCell = document.createElement('td');
      statesCell.className = 'states';
      for (const state of item.states) {
        const badge = document.createElement('span');
        badge.className = `state state-${state.key}`;
        badge.textContent = state.flag;
        badge.title = state.label;
        statesCell.append(badge);
      }
      tr.append(statesCell);
      const cellValues = {
        current: item.current, total: item.total, defensePerPrice: item.defensePerPrice,
        totalDamage: item.totalDamage,
        damagePerPrice: item.damagePerPrice,
        physicalDamage: item.physicalDamage, elementalDamage: item.elementalDamage, chaosDamage: item.chaosDamage,
        sockets: item.socketDisplay.count, price: item.price,
      };
      const cells = activeColumns().map(([key]) => [key, cellValues[key]]);
      for (const [key, value] of cells) {
        const td = document.createElement('td');
        td.className = key;
        td.textContent = key === 'price' ? value : key === 'total' ? Number.isFinite(value) ? fmtDefense(value) : '计算不可得' : fmt(value);
        if (key === 'price') {
          const stateText = item.states.map(state => state.label).join('、');
          const button = document.createElement('button');
          button.className = 'locate';
          button.type = 'button';
          button.textContent = value;
          button.title = `${value}\n定位交易页中的装备${stateText ? `\n${stateText}` : ''}`;
          // 定位统一由整行点击处理（见 locateSourceRow）；按钮保留键盘焦点与定位样式。
          button.setAttribute('aria-label', `定位交易页中的装备（价格 ${value}${stateText ? `，${stateText}` : ''}）`);
          td.replaceChildren(button);
        }
        if (mode === 'weapon' && Object.hasOwn(item.weaponTitles, key)) {
          td.textContent = Number.isFinite(value) ? fmt(value) : '计算不可得';
          td.title = item.weaponTitles[key];
          if (!Number.isFinite(value)) td.classList.add('warning');
        }
        if (key === 'damagePerPrice') {
          td.textContent = Number.isFinite(value) ? fmtRatio(value) : '计算不可得';
          td.title = item.damagePerPriceTitle;
          if (!Number.isFinite(value)) td.classList.add('warning');
        }
        if (key === 'sockets') {
          td.textContent = `${fmt(item.socketDisplay.count)}/${fmt(item.socketDisplay.total)}`;
          td.title = `可用/总共：左侧为可用孔，右侧为总孔\n${item.socketDisplay.title}`;
        }
        if (key === 'current') td.title = breakdown(item.values);
        if (key === 'total') {
          td.title = item.totalTitle;
          if (!Number.isFinite(value)) td.classList.add('warning');
        }
        if (key === 'defensePerPrice') {
          td.textContent = Number.isFinite(value) ? fmtRatio(value) : '计算不可得';
          td.title = item.defensePerPriceTitle;
          if (!Number.isFinite(value)) td.classList.add('warning');
        }
        tr.append(td);
      }
      fragment.append(tr);
      if (mode === 'weapon' && item.breakdown) {
        tr.classList.add('has-details');
        const detailRow = document.createElement('tr');
        detailRow.className = 'weapon-details';
        detailRow.addEventListener('click', () => locateSourceRow(item.row));
        const detailCell = document.createElement('td');
        detailCell.colSpan = tr.children.length;
        const types = item.breakdown.types;
        // 可选明细：按固定顺序与配色列出正数项；为 0 或不可得的类型不显示。
        if (types && get('show-weapon-details').checked) {
          const line = document.createElement('div');
          line.className = 'damage-values';
          line.title = '处理后平均单次点伤，含已选增幅估算（若有）；不乘攻速，与伤害占比条同源。';
          for (const entry of DAMAGE_BREAKDOWN) {
            const value = types[entry.key];
            if (!(value > 0)) continue;
            if (line.childNodes.length) line.append(' · ');
            const valueElement = document.createElement('span');
            valueElement.style.color = entry.color;
            valueElement.textContent = `${entry.label} ${fmt(value)}`;
            line.append(valueElement);
          }
          if (line.childNodes.length) detailCell.append(line);
        }
        detailCell.append(breakdownBar(DAMAGE_BREAKDOWN, types, {
          heading: '武器伤害构成 · 处理后平均单次点伤，不乘攻速',
          note: types ? item.breakdown.note : '',
          empty: '无伤害占比',
          failure: `占比不可得：${item.breakdown.reason}`,
        }));
        detailRow.append(detailCell);
        fragment.append(detailRow);
      }
      if (mode === 'armour' && item.defenseBreakdown) {
        tr.classList.add('has-details');
        const detailRow = document.createElement('tr');
        detailRow.className = 'defense-details';
        detailRow.addEventListener('click', () => locateSourceRow(item.row));
        const detailCell = document.createElement('td');
        detailCell.colSpan = tr.children.length;
        const values = item.defenseBreakdown.values;
        // 可选明细：按固定顺序与配色列出正数项；为 0 或未读取到的类型不显示。
        if (values && get('armour-show-details').checked) {
          const line = document.createElement('div');
          line.className = 'damage-values';
          line.title = '各类型防御最终值，与占比条同源；选增幅或魔力换盾时含对应估算，未选增幅时不含孔内增幅。';
          for (const entry of DEFENSE_BREAKDOWN) {
            const value = values[entry.key];
            if (!(value > 0)) continue;
            if (line.childNodes.length) line.append(' · ');
            const valueElement = document.createElement('span');
            valueElement.className = `detail-${entry.key}`;
            valueElement.textContent = `${entry.label} ${fmt(value)}`;
            line.append(valueElement);
          }
          if (line.childNodes.length) detailCell.append(line);
        }
        detailCell.append(breakdownBar(DEFENSE_BREAKDOWN, values, {
          heading: item.defenseBreakdown.heading || '',
          note: values ? item.defenseBreakdown.note : '',
          empty: '无防御占比',
          failure: `占比不可得：${item.defenseBreakdown.reason}`,
        }));
        detailRow.append(detailCell);
        fragment.append(detailRow);
      }
    }
    tbody.replaceChildren(fragment);
    highlightSourceRow(hoveredSourceRow?.isConnected ? hoveredSourceRow : null);
    get('status').textContent = items.length ? `已加载 ${items.length} 件 · 可计算 ${items.filter(item => Number.isFinite(mode === 'weapon' ? item.totalDamage : item.total)).length} 件` : `尚未找到${mode === 'weapon' ? '武器' : '装备'}，请先搜索并加载交易结果。`;
  }
  headerRow.addEventListener('click', event => {
    const button = event.target.closest('button[data-sort]');
    if (!button || !headerRow.contains(button)) return;
    const key = button.dataset.sort;
    sortDirection = key === sortKey ? sortDirection === 'descending' ? 'ascending' : 'descending' : key === 'price' ? 'ascending' : 'descending';
    sortKey = key;
    refresh();
  });
  for (const button of root.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => {
      manualMode = true;
      setMode(button.dataset.mode);
      refresh();
    });
  }
  get('refresh').addEventListener('click', refresh);
  get('back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  get('show-weapon-details').addEventListener('change', refresh);
  get('armour-show-details').addEventListener('change', refresh);
  get('armour-per-price').addEventListener('change', event => {
    armourShowPerPrice = event.target.checked;
    // 取消勾选后该列不再存在；若正按它排序，回落到护甲默认总防御降序，避免不可见排序键。
    if (!armourShowPerPrice && sortKey === 'defensePerPrice') {
      sortKey = 'total';
      sortDirection = 'descending';
      modeSorting.armour = { key: sortKey, direction: sortDirection };
    }
    refresh();
  });
  get('count-aps').addEventListener('change', event => {
    countAttacksPerSecond = event.target.checked;
    refresh();
  });
  get('show-damage-per-price').addEventListener('change', event => {
    showDamagePerPrice = event.target.checked;
    // 取消勾选后该列不再存在；若正按它排序，回落到武器默认总伤降序，避免不可见排序键。
    if (!showDamagePerPrice && sortKey === 'damagePerPrice') {
      sortKey = 'totalDamage';
      sortDirection = 'descending';
      modeSorting.weapon = { key: sortKey, direction: sortDirection };
    }
    refresh();
  });
  const tierControls = [...root.querySelectorAll('[data-augment-tier]')];
  for (const control of tierControls) {
    control.addEventListener('change', () => {
      // 高阶/完美单选，始终保留一项；只重算所选档位。
      if (!control.checked) return;
      augmentTierIndex = control.dataset.augmentTier === 'perfect' ? 1 : 0;
      refresh();
    });
  }
  const augmentControls = [...root.querySelectorAll('[data-augment]')];
  for (const control of augmentControls) {
    control.addEventListener('change', () => {
      // 每次只选一种：勾选一项时取消其他项；全部取消则回到无增幅基数状态，估算值并入对应点伤列与总伤。
      if (control.checked) for (const other of augmentControls) if (other !== control) other.checked = false;
      augmentKey = control.checked ? control.dataset.augment : null;
      refresh();
    });
  }
  // 护甲增幅：「防御百分比」与「魔力」互斥，可全部取消；取消即回到去符文基础值。
  const armourAugmentControls = { defense: get('armour-augment'), mana: get('armour-mana-augment') };
  function setArmourAugment(key) {
    armourAugmentKey = key;
    for (const [name, control] of Object.entries(armourAugmentControls)) control.checked = name === key;
    refresh();
  }
  for (const [key, control] of Object.entries(armourAugmentControls)) {
    control.addEventListener('change', () => setArmourAugment(control.checked ? key : null));
  }
  // 「魔力换盾」：未开启时不提供魔力增幅；关闭时一并取消已选的魔力增幅，不偷偷切到防御百分比。
  get('armour-mana-shield').addEventListener('change', event => {
    armourManaShield = event.target.checked;
    get('armour-mana-augment').disabled = !armourManaShield;
    if (!armourManaShield && armourAugmentKey === 'mana') armourAugmentKey = null;
    get('armour-mana-augment').checked = armourAugmentKey === 'mana';
    refresh();
  });
  for (const control of root.querySelectorAll('[data-armour-tier]')) {
    control.addEventListener('change', () => {
      // 高阶/完美单选，始终保留一项；只重算所选档位。
      if (!control.checked) return;
      armourTierIndex = control.dataset.armourTier === 'perfect' ? 1 : 0;
      refresh();
    });
  }
  // 特殊孔下拉：武器与护甲各自独立，0–9；变更后立即重算。
  function setupSpecialSockets(id, apply) {
    const select = get(id);
    for (let count = 0; count <= 9; count++) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = String(count);
      select.append(option);
    }
    select.addEventListener('change', () => {
      const value = Math.min(9, Math.max(0, Math.trunc(Number(select.value)) || 0));
      apply(value);
      select.value = String(value);
      refresh();
    });
  }
  setupSpecialSockets('special-sockets', value => { specialSockets = value; });
  setupSpecialSockets('armour-special-sockets', value => { armourSpecialSockets = value; });
  get('locate-more').addEventListener('click', () => {
    // 原生加载按钮类名参考 POE2交易助手；只定位，不调用 click 或发送请求。
    const visible = button => !button.closest('[hidden], [aria-hidden="true"]') && button.getClientRects().length > 0 && !['hidden', 'collapse'].includes(window.getComputedStyle(button).visibility) && !button.closest(ROW_SELECTOR);
    const available = button => !button.matches(':disabled, .disabled, [aria-disabled="true"]');
    const candidates = [...document.querySelectorAll('button.load-more-btn')].filter(visible);
    const loadMoreLabel = /^(?:load more(?: results)?|加载更多(?:结果)?|載入更多(?:結果)?|加载下一页|載入下一頁|显示更多(?:结果)?|顯示更多(?:結果)?)\s*(?:[.…]+)?$/i;
    for (const button of document.querySelectorAll('#trade button, .resultset button, .results button, .row.controls button')) {
      if (visible(button) && loadMoreLabel.test(text(button)) && !candidates.includes(button)) candidates.push(button);
    }
    const target = candidates.find(available) || candidates[0];
    const status = get('locate-status');
    status.hidden = false;
    if (!target) {
      status.textContent = '未找到可见的加载更多按钮；请确认已搜索，且还有更多结果。';
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!available(target)) {
      status.textContent = '已定位加载按钮，但当前不可用；请等待加载完成或检查是否已无更多结果。';
      return;
    }
    target.focus({ preventScroll: true });
    status.textContent = '已定位加载更多按钮，请在交易页手动点击加载。';
  });
  function setCollapsed(collapsed) {
    const anchor = host.getBoundingClientRect();
    host.toggleAttribute('data-collapsed', collapsed);
    get('panel').hidden = collapsed;
    get('launcher').hidden = !collapsed;
    for (const id of ['launcher', 'collapse']) get(id).setAttribute('aria-expanded', String(!collapsed));
    const box = host.getBoundingClientRect();
    // 保留右上角锚点，让同尺寸的收起/展开按钮留在同一位置；仅越界时钳制。
    position(anchor.right - box.width, anchor.top);
    get(collapsed ? 'launcher' : 'collapse').focus({ preventScroll: true });
  }
  let suppressLauncherClick = false;
  get('launcher').addEventListener('click', event => {
    if (suppressLauncherClick && event.detail !== 0) {
      suppressLauncherClick = false;
      return;
    }
    suppressLauncherClick = false;
    setCollapsed(false);
  });
  get('collapse').addEventListener('click', () => setCollapsed(true));
  const header = root.querySelector('header');
  let drag = null;
  function position(left, top) {
    const box = host.getBoundingClientRect();
    host.style.right = 'auto';
    host.style.left = `${Math.max(0, Math.min(left, window.innerWidth - box.width))}px`;
    const topValue = Math.max(0, Math.min(top, window.innerHeight - 48));
    host.style.top = `${topValue}px`;
    host.style.setProperty('--panel-top', `${topValue}px`);
  }
  for (const handle of [header, get('launcher')]) {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || handle === header && event.target.closest('button')) return;
      suppressLauncherClick = false;
      const box = host.getBoundingClientRect();
      drag = { x: event.clientX - box.left, y: event.clientY - box.top, startX: event.clientX, startY: event.clientY, moved: false, handle };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.handle !== handle) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
      if (drag.moved) position(event.clientX - drag.x, event.clientY - drag.y);
    });
    const stopDrag = event => {
      if (!drag || drag.handle !== handle) return;
      if (event.type === 'pointerup' && handle === get('launcher')) suppressLauncherClick = drag.moved;
      drag = null;
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
    handle.addEventListener('lostpointercapture', stopDrag);
  }
  window.addEventListener('resize', () => { const box = host.getBoundingClientRect(); position(box.left, box.top); });
  const panelResizeObserver = new ResizeObserver(() => {
    if (!host.style.left) return;
    const box = host.getBoundingClientRect();
    position(box.left, box.top);
  });
  panelResizeObserver.observe(host);
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (record.target === host || host.contains(record.target)) return false;
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      if (element?.closest(ROW_SELECTOR)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('.row[data-id], .resultset, .results') || node.querySelector('.row[data-id]')));
    });
    if (!relevant) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-id', 'data-field', 'class', 'alt', 'title'] });
  refresh();
})();
