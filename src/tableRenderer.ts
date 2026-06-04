import { BitField, FieldBlock } from './types';

/**
 * 渲染块的 HTML 表格
 */
export function renderBlockTable(block: FieldBlock): string {
  const rows: string[] = [];

  for (const child of block.children) {
    collectRows(child, 0, rows);
  }

  let html = '<table class="verilog-bitfield-table">';
  html += '<thead><tr>';
  html += '<th>Field</th>';
  html += '<th>Width</th>';
  html += '<th>Bit Range</th>';
  html += '<th>Description</th>';
  html += '</tr></thead>';
  html += '<tbody>';
  html += rows.join('');
  html += '</tbody></table>';
  return html;
}

/**
 * 递归收集表格行
 */
function collectRows(field: BitField, depth: number, rows: string[]): void {
  const indent = depth > 0 ? '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth) : '';
  const isRef = field.isReference;
  const isRsv = field.isReserved;
  const name = isRsv ? 'reserved' : (isRef ? `@${field.refName}` : field.name);
  const bitRange = `[${field.msb}:${field.lsb}]`;
  const description = field.description || '';

  let rowClass = '';
  if (isRsv) rowClass = ' class="reserved-row"';
  else if (isRef) rowClass = ' class="ref-child"';

  const nameCell = isRef
    ? `<a href="#" class="bf-ref-link" data-target="${field.refName}">${indent}${name}</a>`
    : `${indent}${name}`;

  rows.push(`<tr${rowClass}>`);
  rows.push(`<td>${nameCell}</td>`);
  rows.push(`<td>${field.width}</td>`);
  rows.push(`<td>${bitRange}</td>`);
  rows.push(`<td>${description}</td>`);
  rows.push('</tr>');

  if (field.children && field.children.length > 0) {
    for (const child of field.children) {
      collectRows(child, depth + 1, rows);
    }
  }
}
