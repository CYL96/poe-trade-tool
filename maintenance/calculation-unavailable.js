// 在已加载装备结果的交易页：F12 → Console，粘贴本文件全部内容并执行。
// 只读诊断：不修改页面，不发请求，不读取卖家信息。
(() => {
  'use strict';
  const panel = document.getElementById('poe2-equipment-calculator')?.shadowRoot;
  if (!panel) {
    console.log('未找到装备防御排序浮窗，请确认已启用脚本，并刷新支持的 trade2 页面。');
    return;
  }

  const sourceRows = new Map([...document.querySelectorAll('.resultset .row[data-id], .results .row[data-id], #trade .row[data-id]')]
    .map(row => [row.getAttribute('data-id'), row]));
  const headers = [...panel.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const failures = [];
  for (const tr of panel.querySelectorAll('tbody tr[data-id]')) {
    const cells = [...tr.querySelectorAll('td')];
    const failedCells = cells.filter(td => td.textContent.trim() === '计算不可得');
    if (!failedCells.length) continue;
    const id = tr.getAttribute('data-id');
    const row = sourceRows.get(id);
    failures.push({
      id,
      sourceFound: !!row,
      failures: failedCells.map(td => ({
        column: headers[cells.indexOf(td)] || td.className,
        reason: td.title,
      })),
      fields: [...(row?.querySelectorAll('[data-field]') || [])]
        .filter(element => /^(?:quality|ar|ev|es|ward|ilvl|pdamage|edamage|cdamage|aps|stat\..+)$/.test(element.getAttribute('data-field')))
        .map(element => ({
          field: element.getAttribute('data-field'),
          text: element.textContent.trim(),
          property: !!element.closest('.item-property, .property'),
          augmented: element.querySelector('.colourAugmented, [style*="--colour-augmented"]')?.textContent.trim() || '',
        })),
      sockets: row?.querySelector('.sockets')?.outerHTML || '',
    });
  }

  if (!failures.length) {
    console.log('当前浮窗没有「计算不可得」的装备。请确认出错结果仍已加载；此命令不会刷新或加载结果。');
    return;
  }
  const report = JSON.stringify(failures, null, 2);
  console.log(report);
  return report;
})();
