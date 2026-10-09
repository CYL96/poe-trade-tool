// 在交易页 F12 → Console 粘贴本文件全部内容并执行，复制输出的 JSON 数组。
// 默认收集浮窗中的全部装备；只收集指定装备时，将其结果 ID 填入 itemIds。
// 只读：不修改页面、不加载结果、不发请求，不读取卖家信息。
(() => {
  'use strict';
  const itemIds = []; // 示例：['交易结果的 data-id']；留空表示全部装备。
  const panel = document.getElementById('poe2-equipment-calculator')?.shadowRoot;
  if (!panel) {
    console.log('未找到装备防御排序浮窗，请确认已启用脚本，并刷新支持的 trade2 页面。');
    return;
  }

  const sourceRows = new Map([...document.querySelectorAll('.resultset .row[data-id], .results .row[data-id], #trade .row[data-id]')]
    .map(row => [row.getAttribute('data-id'), row]));
  const headers = [...panel.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const statusPattern = /^(?:Corrupted|Twice\s+Corrupted|Sanctified|(?:已)?(?:腐化|汙染|污染|圣化|聖化)|雙重腐化|双倍腐化)$/i;
  const equipment = [];
  for (const tr of panel.querySelectorAll('tbody tr[data-id]')) {
    const id = tr.getAttribute('data-id');
    if (itemIds.length && !itemIds.includes(id)) continue;
    const row = sourceRows.get(id);
    const itemContent = row?.querySelector('.item-popup, .itemPopup') || row;
    equipment.push({
      id,
      sourceFound: !!row,
      panel: [...tr.querySelectorAll('td')].map((td, index) => ({
        column: headers[index] || td.className,
        value: td.textContent.trim(),
        tooltip: td.title,
      })),
      fields: [...(row?.querySelectorAll('[data-field]') || [])]
        .filter(element => /^(?:quality|ar|ev|es|ward|ilvl|pdamage|edamage|cdamage|aps|stat\..+)$/.test(element.getAttribute('data-field')))
        .map(element => ({
          field: element.getAttribute('data-field'),
          text: element.textContent.trim(),
          property: !!element.closest('.item-property, .property'),
          augmented: element.querySelector('.colourAugmented, [style*="--colour-augmented"]')?.textContent.trim() || '',
          nestedDuplicate: element.parentElement?.closest('[data-field]')?.getAttribute('data-field') === element.getAttribute('data-field'),
        })),
      properties: [...(row?.querySelectorAll('.item-property, .property') || [])].map(element => ({
        index: element.getAttribute('index'),
        className: element.className,
        text: element.textContent.trim(),
      })),
      status: {
        rowClasses: row?.className || '',
        itemClasses: itemContent?.className || '',
        labels: [...(itemContent?.querySelectorAll('*') || [])]
          .filter(element => !element.children.length && !element.closest('.item-popup__header--item, .itemName, .item-name, h1, [data-field^="stat."]') && statusPattern.test(element.textContent.trim()))
          .map(element => element.textContent.trim()),
      },
      sockets: row?.querySelector('.sockets')?.outerHTML || '',
    });
  }

  if (!equipment.length) {
    console.log('未找到匹配的浮窗装备，请先加载结果；如填写了 itemIds，请检查结果 ID。');
    return;
  }
  const report = JSON.stringify(equipment, null, 2);
  console.log(report);
  return report;
})();
