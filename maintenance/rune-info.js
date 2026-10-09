// 在交易页 F12 → Console 粘贴本文件全部内容并执行，复制完整 JSON 数组。
// 只读 DOM，不发请求、不修改页面；通用孔图标不能还原具体符文名称或逐孔词缀对应关系。
(() => {
  'use strict';
  const itemIds = []; // 可填 ['装备结果的 data-id']；留空收集浮窗全部装备。
  const panel = document.getElementById('poe2-equipment-calculator')?.shadowRoot;
  if (!panel) {
    console.log('未找到装备防御排序浮窗，请启用脚本并加载交易结果。');
    return;
  }
  const sourceRows = new Map([...document.querySelectorAll('.resultset .row[data-id], .results .row[data-id], #trade .row[data-id]')]
    .map(row => [row.getAttribute('data-id'), row]));
  const headers = [...panel.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const attributes = element => Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value]));
  const report = [];
  for (const tr of panel.querySelectorAll('tbody tr[data-id]')) {
    const id = tr.getAttribute('data-id');
    if (itemIds.length && !itemIds.includes(id)) continue;
    const row = sourceRows.get(id);
    const itemContent = row?.querySelector('.item-popup, .itemPopup') || row;
    report.push({
      id,
      sourceFound: !!row,
      panel: [...tr.querySelectorAll('td')].map((td, index) => ({ column: headers[index] || td.className, value: td.textContent.trim(), tooltip: td.title })),
      socketContainer: row?.querySelector('.sockets')?.outerHTML || '',
      sockets: [...(row?.querySelectorAll('.socket') || [])].map((socket, index) => ({
        index: index + 1,
        attributes: attributes(socket),
        text: socket.textContent.trim(),
        html: socket.outerHTML,
        images: [...socket.querySelectorAll('img')].map(image => ({ attributes: attributes(image), currentSrc: image.currentSrc || '' })),
      })),
      modifiers: [...(row?.querySelectorAll('[data-field^="stat."]') || [])].map(element => ({
        field: element.getAttribute('data-field'),
        text: element.textContent.trim(),
        attributes: attributes(element),
        html: element.outerHTML,
        parentAttributes: element.parentElement ? attributes(element.parentElement) : {},
        nestedDuplicate: element.parentElement?.closest('[data-field]')?.getAttribute('data-field') === element.getAttribute('data-field'),
      })),
      properties: [...(row?.querySelectorAll('.item-property, .property') || [])].map(element => ({ text: element.textContent.trim(), html: element.outerHTML })),
      boundLabels: [...(itemContent?.querySelectorAll('*') || [])]
        .filter(element => !element.children.length && !element.closest('.item-popup__header--item, .itemName, .item-name, h1, [data-field^="stat."]') && /socket[-\s]bound|插槽.?綁定|插槽.?绑定|鑲嵌.?綁定|镶嵌.?绑定|綁定插槽|绑定插槽/i.test(element.textContent))
        .map(element => ({ text: element.textContent.trim(), html: element.outerHTML })),
    });
  }
  if (!report.length) {
    console.log('未找到匹配的浮窗装备，请先加载结果并检查 itemIds。');
    return;
  }
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  return json;
})();
