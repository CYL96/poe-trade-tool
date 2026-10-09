// ==UserScript==
// @name         POE2 装备防御与武器伤害排序浮窗
// @namespace    poe-trade-tool
// @version      2.4.4
// @description  自动列出已加载装备，支持护甲防御、武器处理后总伤（可选按攻速）与孔内增幅点伤估算。
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
  const MAXIMUM_DEFENSE_PER_SOCKET = [0.18, 0.20];
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
  const LOCAL_DAMAGE_RUNES = new Map([
    ['stat_1940865751', 'physical'], ['stat_1888719480', 'physical'],
    ['stat_709508406', 'elemental'], ['stat_1037193709', 'elemental'],
    ['stat_3336890334', 'elemental'], ['stat_2223678961', 'chaos'],
  ]);
  // trade2/data/stats（2026-10-09 核对）：'…increased effect of Socketed Augment Items'（stat_2081918629）
  // 与 '…of Socketed Runes'（stat_704409219）会放大孔内符文数值；'…of Socketed Soul Cores'
  // （stat_4065505214）只作用于灵魂核心，不影响符文，因此不参与符文反推与新增符文估算。
  const RUNE_EFFECT_IDS = new Set(['stat_2081918629', 'stat_704409219']);
  // 用户页面诊断（750fab88…、d501c4e1…）：带 RUNE_EFFECT_IDS 时，孔内闪电增幅的显示范围与面板
  // 点伤两端精确相加（12+2=14、352+102=454；13+1=14、303+49=352），因此该组合按显示范围扣除一次、
  // 不重复乘倍率；被倍率放大的其他局部增幅类型仍拒绝反推。新增增幅倍率按用户确认的默认向下取整计算。
  const VERIFIED_EFFECT_RUNE_IDS = new Set(['stat_3336890334']);
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—';
  const fmtDefense = value => Number.isFinite(value) ? fmt(Math.floor(value)) : '—';
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
  function socketFreeDamage(row, mods, ranges) {
    const labels = { physical: '物理', elemental: '元素', chaos: '混沌' };
    const values = {};
    const titles = {};
    const fail = reason => ({ values: { physical: null, elemental: null, chaos: null }, titles: { physical: reason, elemental: reason, chaos: reason }, reason, equipmentPercent: null });
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
    const flat = { physical: [0, 0], elemental: [0, 0], chaos: [0, 0] };
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
      const added = (flat[key][0] + flat[key][1]) / 2;
      const ratio = key === 'physical' && percentRunes.length ? factor / denominator : 1;
      const flatFactor = key === 'physical' && hasPhysicalFlat ? factor * (1 + quality / 100) : 1;
      const value = (observed * ratio - added * flatFactor) * (key === 'physical' ? physicalQualityRatio : 1);
      if (!Number.isFinite(value) || value < 0) return fail(`${labels[key]}点伤反推结果无效或为负，面板与孔内增幅数据不一致`);
      values[key] = value;
      titles[key] = `${labels[key]}点伤：[当前面板平均 ${fmt(observed)}${ratio !== 1 ? ` × (1 + ${fmt(equipmentPercent * 100)}/100) ÷ (1 + ${fmt(equipmentPercent * 100)}/100 + ${fmt(runePercent * 100)}/100)` : ''}${added ? ` − 孔内附加平均 ${fmt(added)}${key === 'physical' ? ` × (1 + ${fmt(equipmentPercent * 100)}/100) × (1 + ${fmt(quality)}/100)` : ''}` : ''}]${key === 'physical' && ranges.physical.length ? ` × (1 + ${fmt(targetQuality)}/100) ÷ (1 + ${fmt(quality)}/100)（品质 ${fmt(quality)}% → ${fmt(targetQuality)}%）` : ''} = ${fmt(value)}（不乘攻速）${note}`;
    }
    return { values, titles, reason: '', equipmentPercent };
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
    return { ...result, values: { physical: physicalDamage, elemental: elementalDamage, chaos, total }, formula };
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
  function readWeapon(row, index) {
    const physical = damageRanges(damageProperty(row, 'pdamage'), /^(?:Physical Damage|物理[傷伤]害)\s*[:：]?$/i);
    const elementalProperty = damageProperty(row, 'edamage');
    // 原生元素范围可能通过旧 colour 类或新 CSS 变量着色；只去掉嵌套重复节点。
    const elementalSelector = '.colourFireDamage, .colourColdDamage, .colourLightningDamage, [style*="--colour-fire-damage"], [style*="--colour-cold-damage"], [style*="--colour-lightning-damage"]';
    const elementalParts = [...(elementalProperty?.querySelectorAll(elementalSelector) || [])].filter(element => !element.parentElement?.closest(elementalSelector));
    const elementalGroups = elementalParts.map(element => damageRanges(element, /^(?:Fire|Cold|Lightning) Damage\s*[:：]?$/i));
    const elemental = elementalParts.length ? elementalGroups.some(ranges => ranges === null || !ranges.length) ? null : elementalGroups.flat() : damageRanges(elementalProperty, /^(?:Elemental Damage|元素[傷伤]害)\s*[:：]?$/i);
    const chaos = damageRanges(damageProperty(row, 'cdamage'), /^(?:Chaos Damage|混沌[傷伤]害)\s*[:：]?$/i);
    const attacksPerSecond = number(text(damageProperty(row, 'aps')));
    const validSpeed = Number.isFinite(attacksPerSecond) && attacksPerSecond > 0;
    const sockets = row.querySelector('.sockets');
    const classCount = sockets?.className.match(/numSockets(\d+)/);
    const socketCount = Math.max(classCount ? Number(classCount[1]) : 0, row.querySelectorAll('.socket').length);
    const mods = readModifiers(row);
    const damage = socketFreeDamage(row, mods, { physical, elemental, chaos });
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
      price: readPrice(row),
      weaponTitles,
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
    if (jewelSocket) return { total: socketCount, count: 0, title: `总孔 ${socketCount}，可用孔 0；卡迪根的顿悟已将增幅孔转为珠宝孔（不追加18%/20%防御，不假定补孔）` };
    if (socketCount > 0 || boundSocketCount > 0) {
      const count = Math.max(0, socketCount - boundSocketCount);
      return { total: socketCount, count, title: `总孔 ${socketCount}，可用孔 ${count}（可替换增幅，普通已填符文仍可用）${boundSocketCount ? `；绑定增幅孔 ${boundSocketCount}，绑定孔不可用` : ''}` };
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
    if (!slot) return { total: socketCount, count: socketCount, title: `总孔 ${socketCount}，可用孔 ${socketCount}` };
    // 腐化/圣化复用共享状态判定，不假定补孔；复制是否禁止补孔未验证，不改变孔规则。
    const blocked = states.some(state => state.key === 'corrupted' || state.key === 'sanctified');
    const supplemented = socketCount === 0 && slot && !blocked;
    const count = supplemented ? slot.count : socketCount;
    return { total: count, count, title: supplemented ? `总孔 ${count}，可用孔 ${count}；原孔 0，按${slot.label}补 ${slot.count}（假定补孔${weapon ? '，不影响点伤或总伤' : ''}）` : `总孔 ${socketCount}，可用孔 ${socketCount}${blocked ? '；腐化或圣化，不假定补孔' : ''}` };
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
      normalized: null, components: [], formulas: [], reason: '',
      maximums: MAXIMUM_DEFENSE_PER_SOCKET.map(perSocket => ({ perSocket, value: null, total: 0, components: [], formulas: [], reason: '' })),
    };
    calculate(item);
    return item;
  }
  function calculate(item) {
    if (item.current === null) { item.reason = '未读取到防御面板字段'; return; }
    if (item.unreadableDefense) { item.current = null; item.reason = '防御字段存在但无法解析'; return; }
    if (item.quality === null || item.quality < 0) { item.reason = '品质字段无法解析'; return; }
    // 与参考脚本一样，只处理已收录的防御 ID；其他符文不参与反推，也不阻止计算。
    const invalidDefenseRune = item.mods.find(mod => mod.type === 'rune' && [DEFENSE_RUNE, WARD_RUNE].includes(mod.id) && mod.percent === null);
    if (invalidDefenseRune) { item.reason = `已收录防御符文百分比无法解析：${invalidDefenseRune.text}`; return; }
    const targetQuality = Math.max(item.quality, 20);
    let total = 0;
    for (const [index, attribute] of ATTRIBUTES.entries()) {
      const observed = item.values[index];
      if (observed === null) { item.components.push(0); for (const maximum of item.maximums) maximum.components.push(0); continue; }
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
          item.components.push(normalized);
          total += normalized;
          item.formulas.push(`保护：无保护百分比符文，装备增幅在分子/分母抵消；基础防御 = ${fmt(observed)} × (1 + ${fmt(targetQuality)}/100) ÷ (1 + ${fmt(item.quality)}/100) = ${fmt(normalized)}。不臆测裸基础或局部词缀归类。`);
          for (const maximum of item.maximums) {
            const targetRunePercent = item.socketDisplay.count * maximum.perSocket;
            if (uncertainPercent && targetRunePercent > 0) {
              maximum.reason = '保护装备百分比的局部/全局归类未验证，无法估算增加孔内防御增幅后的保护';
            } else {
              const value = normalized * (1 + targetRunePercent);
              maximum.components.push(value);
              maximum.total += value;
              maximum.formulas.push(`保护：最高防御 = ${fmt(normalized)} × (1 + ${item.socketDisplay.count} × ${fmt(maximum.perSocket * 100)}/100) = ${fmt(value)}（按指定品质/孔增幅模型估算）`);
            }
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
      item.components.push(normalized);
      total += normalized;
      item.formulas.push(`${attribute.label}：裸基础 = ${fmt(observed)} ÷ (1 + ${fmt(item.quality)}/100) ÷ (1 + ${fmt(equipmentPercent * 100)}/100 + ${fmt(runePercent * 100)}/100) = ${fmt(rawBase)}；基础防御 = 裸基础 × (1 + ${fmt(equipmentPercent * 100)}/100) × (1 + ${fmt(targetQuality)}/100) = ${fmt(normalized)}`);
      for (const maximum of item.maximums) {
        const targetRunePercent = item.socketDisplay.count * maximum.perSocket;
        const value = observed * (((1 + equipmentPercent + targetRunePercent) * (1 + targetQuality / 100)) / denominator);
        if (!Number.isFinite(value)) {
          maximum.reason = '最高防御计算结果无效';
        } else {
          maximum.components.push(value);
          maximum.total += value;
          maximum.formulas.push(`${attribute.label}：最高防御 = 裸基础 × (1 + ${fmt(equipmentPercent * 100)}/100 + ${item.socketDisplay.count} × ${fmt(maximum.perSocket * 100)}/100) × (1 + ${fmt(targetQuality)}/100) = ${fmt(value)}`);
        }
      }
    }
    item.normalized = total;
    for (const maximum of item.maximums) if (!maximum.reason) maximum.value = maximum.total;
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
      /* 分三行固定分组：计算攻速 / 特殊孔＋档位 / 增幅类型；避免单行过宽把面板撑开。 */
      .weapon-options { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
      .option-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
      .weapon-options select { font:inherit; color:inherit; background:#282f3a; border:1px solid #515a68; border-radius:5px; padding:2px 4px; cursor:pointer; }
      .mode-switch { display:flex; flex-shrink:0; gap:4px; padding:8px; border-bottom:1px solid #343c48; }
      .mode-switch button { flex:1; }
      .mode-switch button[aria-pressed="true"] { color:#e7c889; border-color:#e7c889; background:#353020; }
      .muted { color:#aeb7c5; font-size:12px; }
      .warning { color:#f5c786; }
      table { width:max-content; min-width:100%; table-layout:auto; border-collapse:collapse; font-variant-numeric:tabular-nums; color:inherit; }
      th, td { padding:6px 3px; border-bottom:1px solid #343c48; text-align:right; vertical-align:middle; white-space:nowrap; }
      th { color:#c0c7d2; font-size:12px; }
      td.maximum { font-size:12px; }
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
      .normalized, .maximum, .totalDamage { color:#b6dfaa; }
      .normalized.warning, .maximum.warning, td.warning { color:#f5c786; }
      tr.has-details td { border-bottom:0; }
      tr.defense-details td { width:auto; padding-top:0; text-align:center; color:#aeb7c5; font-size:12px; }
      tr.source-hovered td { background:#403721; box-shadow:inset 0 1px #75613e,inset 0 -1px #75613e; }
      .detail-ar { color:#ff9292; }
      .detail-ev { color:#91db91; }
      .detail-es { color:#85baff; }
      @media (max-width:450px) { .panel-controls { padding:6px; } .table-scroll { padding:0 6px 6px; } th,td { padding:6px 2px; font-size:12px; } }
    </style>
    <button id="launcher" type="button" aria-label="展开装备排序浮窗" aria-expanded="false" aria-controls="panel" title="点击展开装备排序，拖动移动">POE</button>
    <section id="panel" class="panel" aria-label="装备防御与武器伤害排序浮窗" hidden>
      <header><strong>装备防御 · 高阶/完美降序</strong><button id="collapse" type="button" aria-expanded="false" aria-controls="panel">收起</button></header>
      <nav class="mode-switch" aria-label="装备类型"><button type="button" data-mode="armour" aria-pressed="true">护甲</button><button type="button" data-mode="weapon" aria-pressed="false">武器</button></nav>
      <div id="body" class="body">
        <div class="panel-controls">
        <div class="toolbar"><span id="status" class="muted" role="status"></span><div class="toolbar-actions"><button id="back-top" type="button" title="回到交易页面顶部">回顶部</button><button id="locate-more" type="button" title="滚动并聚焦交易页原生加载按钮，不自动加载">定位加载更多</button><button id="refresh" type="button">刷新</button></div></div>
        <div id="locate-status" class="muted" role="status" hidden></div>
        <label class="detail-option"><input id="show-details" type="checkbox">显示详细属性</label>
        <div id="weapon-options" class="weapon-options" hidden>
        <div class="option-row">
        <label class="detail-option" title="勾选后总伤 = 处理后的总点伤 × 每秒攻击次数（含已选增幅估算）；不勾选时总伤为平均单次伤害。攻速缺失或无效时总伤显示计算不可得。"><input id="count-aps" type="checkbox">计算攻速</label>
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
  let firstResultId = null;
  let manualMode = false;
  let sortKey = 'maximum';
  let sortDirection = 'descending';
  const modeSorting = {
    armour: { key: 'maximum', direction: 'descending' },
    weapon: { key: 'totalDamage', direction: 'descending' },
  };
  const ARMOUR_COLUMNS = [['current', '当前防御'], ['normalized', '基础防御'], ['maximum', '高阶/完美'], ['sockets', '孔'], ['price', '价格']];
  const WEAPON_COLUMNS = [['totalDamage', '总伤'], ['physicalDamage', '物理'], ['elementalDamage', '元素'], ['chaosDamage', '混沌'], ['sockets', '孔'], ['price', '价格']];
  // 增幅不单独成列：勾选后数值直接并入对应点伤列与总伤（见 readWeapon）。
  const activeColumns = () => mode === 'weapon' ? WEAPON_COLUMNS : ARMOUR_COLUMNS;
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
      if (tr.nextElementSibling?.classList.contains('defense-details')) tr.nextElementSibling.classList.toggle('source-hovered', active);
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
    if (sortKey === 'maximum') return item.maximums[0].value;
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
      button.title = `${label}排序，点击按${nextDirection}${key === 'price' ? '（仅按金额，不换算货币）' : key === 'maximum' ? '（按左侧18%未取整值）' : key === 'totalDamage' ? `（${countAttacksPerSecond ? '处理后总点伤 × 攻速' : '平均单次总伤'}，按未取整值）` : ''}`;
      button.setAttribute('aria-label', button.title);
      if (active) root.querySelector('header strong').textContent = `${mode === 'weapon' ? '武器伤害' : '装备防御'} · ${label}${sortDirection === 'descending' ? '降序' : '升序'}`;
    }
  }
  function breakdown(values) {
    return ATTRIBUTES.map((attribute, index) => `${attribute.label} ${fmt(values[index] ?? 0)}`).join(' + ');
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
    get('show-details').parentElement.hidden = mode === 'weapon';
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
        current: item.current, normalized: item.normalized, maximum: item.maximums?.[0]?.value ?? null,
        totalDamage: item.totalDamage,
        physicalDamage: item.physicalDamage, elementalDamage: item.elementalDamage, chaosDamage: item.chaosDamage,
        sockets: item.socketDisplay.count, price: item.price,
      };
      const cells = activeColumns().map(([key]) => [key, cellValues[key]]);
      for (const [key, value] of cells) {
        const td = document.createElement('td');
        td.className = key;
        td.textContent = key === 'price' ? value : key === 'normalized' || key === 'maximum' ? value === null ? '计算不可得' : fmtDefense(value) : fmt(value);
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
        if (key === 'sockets') {
          td.textContent = `${fmt(item.socketDisplay.count)}/${fmt(item.socketDisplay.total)}`;
          td.title = `可用/总共：左侧为可用孔，右侧为总孔\n${item.socketDisplay.title}`;
        }
        if (key === 'current') td.title = breakdown(item.values);
        if (key === 'normalized') {
          td.title = item.reason || `${breakdown(item.components)}\n品质 ${fmt(item.quality)}% → ${fmt(Math.max(item.quality, 20))}%\n${item.formulas.join('\n')}\n合计 ${fmt(item.normalized)}，向下取整显示 ${fmtDefense(item.normalized)}；排序使用未取整值。\n裸基础是中间反推量；列表“基础防御”保留装备增幅，不含符文。`;
          if (item.reason) td.classList.add('warning');
        }
        if (key === 'maximum') {
          td.textContent = item.maximums.every(maximum => maximum.value === null) ? '计算不可得' : item.maximums.map(maximum => maximum.value === null ? '计算不可得' : fmtDefense(maximum.value)).join('/');
          td.title = item.reason || `${item.socketDisplay.title}\n左侧高阶每孔18%，右侧完美每孔20%；与装备自身增幅相加，先移除原符文再重算。\n${item.maximums.map(maximum => `每孔${fmt(maximum.perSocket * 100)}%：\n${maximum.reason || `${breakdown(maximum.components)}\n${maximum.formulas.join('\n')}\n合计 ${fmt(maximum.value)}，向下取整显示 ${fmtDefense(maximum.value)}`}`).join('\n\n')}\n高阶/完美排序使用左侧18%的未取整值。`;
          if (item.reason || item.maximums.some(maximum => maximum.reason)) td.classList.add('warning');
        }
        tr.append(td);
      }
      fragment.append(tr);
      if (mode === 'armour' && get('show-details').checked && item.values.slice(0, 3).some(Number.isFinite)) {
        tr.classList.add('has-details');
        const detailRow = document.createElement('tr');
        detailRow.className = 'defense-details';
        detailRow.addEventListener('click', () => locateSourceRow(item.row));
        const detailCell = document.createElement('td');
        detailCell.colSpan = tr.children.length;
        for (const [key, label, index] of [['ar', 'AR', 1], ['ev', 'EV', 2], ['es', 'ES', 0]]) {
          if (!Number.isFinite(item.values[index])) continue;
          if (detailCell.childNodes.length) detailCell.append(' · ');
          const value = document.createElement('span');
          value.className = `detail-${key}`;
          value.textContent = `${label} ${fmt(item.values[index])}`;
          detailCell.append(value);
        }
        detailCell.title = '当前装备面板的护甲 / 闪避 / 护盾；未读取到数值的类型隐藏。';
        detailRow.append(detailCell);
        fragment.append(detailRow);
      }
    }
    tbody.replaceChildren(fragment);
    highlightSourceRow(hoveredSourceRow?.isConnected ? hoveredSourceRow : null);
    get('status').textContent = items.length ? `已加载 ${items.length} 件 · 可计算 ${items.filter(item => Number.isFinite(mode === 'weapon' ? item.totalDamage : item.normalized)).length} 件` : `尚未找到${mode === 'weapon' ? '武器' : '装备'}，请先搜索并加载交易结果。`;
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
  get('show-details').addEventListener('change', refresh);
  get('count-aps').addEventListener('change', event => {
    countAttacksPerSecond = event.target.checked;
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
  const specialSocketsSelect = get('special-sockets');
  for (let count = 0; count <= 9; count++) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    specialSocketsSelect.append(option);
  }
  specialSocketsSelect.addEventListener('change', () => {
    specialSockets = Math.min(9, Math.max(0, Math.trunc(Number(specialSocketsSelect.value)) || 0));
    specialSocketsSelect.value = String(specialSockets);
    refresh();
  });
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
