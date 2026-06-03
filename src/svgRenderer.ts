import { BitField, FieldBlock } from './types';
import { getFieldColor } from './colors';

/**
 * SVG 渲染配置
 */
interface RenderConfig {
  /** 总位宽 */
  totalWidth: number;
  /** 是否纵向排列 */
  isVertical: boolean;
  /** 字段框高度 */
  boxHeight: number;
  /** 字体大小 */
  fontSize: number;
}

/**
 * 计算字段标签所需的最小宽度（像素）
 */
function calcMinLabelWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.6 + 20;
}

/**
 * 判断是否应使用纵向布局
 */
function shouldUseVertical(fields: BitField[], totalWidth: number): boolean {
  if (totalWidth > 64) return true;

  const svgWidth = 1000;
  const availableWidth = svgWidth - 120;

  for (const field of fields) {
    const fieldName = field.isReserved ? 'reserved' : (field.isReference ? `@${field.refName}` : field.name);
    const label = `${fieldName}[${field.msb}:${field.lsb}]`;
    const widthRatio = field.width / totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const minWidth = calcMinLabelWidth(label, 14);
    if (boxWidth < minWidth) return true;
  }
  return false;
}

/**
 * 渲染块的 SVG 位域图
 */
export function renderBlockSvg(block: FieldBlock): string {
  const config: RenderConfig = {
    totalWidth: block.width,
    isVertical: shouldUseVertical(block.children, block.width),
    boxHeight: 60,
    fontSize: 14
  };

  if (config.isVertical) {
    return renderVertical(block.children, config);
  } else {
    return renderHorizontal(block.children, config);
  }
}

/**
 * 横向渲染
 */
function renderHorizontal(fields: BitField[], config: RenderConfig): string {
  const svgWidth = 1000;
  const svgHeight = config.boxHeight + 60;
  const startX = 60;
  const startY = 40;
  const availableWidth = svgWidth - 120;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;

  svg += `<text x="${startX}" y="20" font-size="${config.fontSize}" text-anchor="start" fill="#666">MSB</text>`;
  svg += `<text x="${svgWidth - 60}" y="20" font-size="${config.fontSize}" text-anchor="end" fill="#666">LSB</text>`;

  let currentX = startX;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const widthRatio = field.width / config.totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const color = getFieldColor(i, field.isReserved, 0);
    svg += renderFieldBox(field, currentX, startY, boxWidth, config.boxHeight, color, config.fontSize);
    currentX += boxWidth;
  }

  svg += '</svg>';
  return svg;
}

/**
 * 纵向渲染（viewBox 宽度与横向一致，保持字体视觉大小一致）
 */
function renderVertical(fields: BitField[], config: RenderConfig): string {
  const svgWidth = 1000;
  const rowHeight = config.boxHeight;
  const startX = 60;
  const startY = 40;
  const boxWidth = svgWidth - 120;
  const svgHeight = startY + fields.length * rowHeight + 40;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;

  svg += `<text x="${startX}" y="20" font-size="${config.fontSize}" text-anchor="start" fill="#666">MSB</text>`;
  svg += `<text x="${startX}" y="${svgHeight - 10}" font-size="${config.fontSize}" text-anchor="start" fill="#666">LSB</text>`;

  let currentY = startY;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const color = getFieldColor(i, field.isReserved, 0);
    svg += renderFieldBox(field, startX, currentY, boxWidth, rowHeight, color, config.fontSize);
    currentY += rowHeight;
  }

  svg += '</svg>';
  return svg;
}

/**
 * 渲染字段框
 */
function renderFieldBox(
  field: BitField,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  fontSize: number
): string {
  let svg = '';
  const isRef = field.isReference;
  const isRsv = field.isReserved;
  const fieldName = isRsv ? 'reserved' : (isRef ? `@${field.refName}` : field.name);

  const strokeDash = isRef ? ' stroke-dasharray="6,3"' : '';
  const strokeColor = isRef ? '#4A90D9' : '#fff';
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="${strokeColor}" stroke-width="2" rx="4" ry="4" data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ''} style="cursor:${isRef ? 'pointer' : 'default'}"/>`;

  const label = `${fieldName}[${field.msb}:${field.lsb}]`;
  const textX = x + width / 2;
  const textY = y + height / 2 + fontSize * 0.35;
  const textWidth = width - 16;
  const maxChars = Math.floor(textWidth / (fontSize * 0.6));

  let displayText = label;
  if (label.length > maxChars && maxChars > 3) {
    displayText = label.substring(0, maxChars - 2) + '..';
  }

  const textDecoration = isRef ? ' text-decoration="underline"' : '';
  const fillColor = isRsv ? '#888' : '#fff';
  svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ''} style="cursor:${isRef ? 'pointer' : 'default'}">${displayText}</text>`;

  return svg;
}
