import { BitField, FieldBlock } from './types';
import { getFieldColor, SvgTheme } from './colors';

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
  /** SVG 主题 */
  theme: SvgTheme;
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
export function renderBlockSvg(block: FieldBlock, theme: SvgTheme = 'pastel', boxHeight: number = 44): string {
  const config: RenderConfig = {
    totalWidth: block.width,
    isVertical: shouldUseVertical(block.children, block.width),
    boxHeight,
    fontSize: 22,
    theme,
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
  const svgHeight = config.boxHeight + 50;
  const startX = 60;
  const startY = 15;
  const availableWidth = svgWidth - 120;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;

  let currentX = startX;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const widthRatio = field.width / config.totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const color = getFieldColor(i, field.isReserved, 0, config.theme);
    svg += renderFieldBox(field, currentX, startY, boxWidth, config.boxHeight, color, config.fontSize, 'horizontal');
    currentX += boxWidth;
  }

  // LSB → MSB 方向箭头
  const arrowY = startY + config.boxHeight + 22;
  const fs = config.fontSize * 0.85;
  const fieldLeft = startX;
  const fieldRight = startX + availableWidth;
  // LSB 右对齐到字段框左边缘
  svg += `<text x="${fieldLeft}" y="${arrowY + 5}" font-size="${fs}" text-anchor="end" fill="#999">LSB</text>`;
  // 箭头比字段框窄一点，两端留空
  const arrowPad = 10;
  svg += `<line x1="${fieldLeft + arrowPad}" y1="${arrowY}" x2="${fieldRight - arrowPad - 8}" y2="${arrowY}" stroke="#999" stroke-width="1.5"/>`;
  svg += `<polygon points="${fieldRight - arrowPad},${arrowY} ${fieldRight - arrowPad - 10},${arrowY - 5} ${fieldRight - arrowPad - 10},${arrowY + 5}" fill="#999"/>`;
  // MSB 左对齐到字段框右边缘
  svg += `<text x="${fieldRight}" y="${arrowY + 5}" font-size="${fs}" fill="#999">MSB</text>`;

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
  const startY = 22;
  const boxWidth = svgWidth - 160;
  const svgHeight = startY + fields.length * rowHeight + 25;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;

  let currentY = startY;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const color = getFieldColor(i, field.isReserved, 0, config.theme);
    svg += renderFieldBox(field, startX, currentY, boxWidth, rowHeight, color, config.fontSize);
    currentY += rowHeight;
  }

  // LSB → MSB 方向箭头（纵向：从上到下）
  const arrowX = startX + boxWidth + 24;
  const arrowTop = startY;
  const arrowBottom = startY + fields.length * rowHeight;
  svg += `<line x1="${arrowX}" y1="${arrowTop + 8}" x2="${arrowX}" y2="${arrowBottom - 8}" stroke="#999" stroke-width="1.5"/>`;
  svg += `<polygon points="${arrowX},${arrowBottom} ${arrowX - 5},${arrowBottom - 10} ${arrowX + 5},${arrowBottom - 10}" fill="#999"/>`;
  svg += `<text x="${arrowX}" y="${arrowTop - 4}" font-size="${config.fontSize * 0.85}" text-anchor="middle" fill="#999">LSB</text>`;
  svg += `<text x="${arrowX}" y="${arrowBottom + 18}" font-size="${config.fontSize * 0.85}" text-anchor="middle" fill="#999">MSB</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * 渲染字段框
 * @param layoutDirection 布局方向，用于决定父字段索引标注位置
 */
function renderFieldBox(
  field: BitField,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  fontSize: number,
  layoutDirection: 'horizontal' | 'vertical' = 'vertical'
): string {
  let svg = '';
  const isRef = field.isReference;
  const isRsv = field.isReserved;
  const fieldName = isRsv ? 'reserved' : (isRef ? `@${field.refName}` : field.name);

  const strokeDash = isRef ? ' stroke-dasharray="6,3"' : '';
  const strokeColor = isRef ? '#4A90D9' : '#fff';
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="${strokeColor}" stroke-width="2" rx="4" ry="4" data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ''} style="cursor:${isRef ? 'pointer' : 'default'}"/>`;

  // 框内：字段自身索引 [width-1:0]，单 bit 字段省略索引
  const selfHigh = field.width - 1;
  const selfLabel = selfHigh === 0 ? fieldName : `${fieldName}[${selfHigh}:0]`;
  const textX = x + width / 2;
  const textY = y + height / 2;
  const textWidth = width - 16;
  const maxChars = Math.floor(textWidth / (fontSize * 0.6));

  let displayText = selfLabel;
  if (selfLabel.length > maxChars && maxChars > 3) {
    displayText = selfLabel.substring(0, maxChars - 2) + '..';
  }

  const textDecoration = '';
  const fillColor = isRsv ? '#888' : '#333';
  svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ''} style="cursor:${isRef ? 'pointer' : 'default'}">${displayText}</text>`;

  // 框外：父字段索引 [msb:lsb]，灰色小字
  const parentHigh = field.msb;
  const parentLow = field.lsb;
  const parentLabel = parentHigh === parentLow ? `[${parentHigh}]` : `[${parentHigh}:${parentLow}]`;
  const annotationFontSize = fontSize * 0.7;

  if (layoutDirection === 'vertical') {
    // 纵向：标注在左侧，右对齐
    const annotX = x - 8;
    const annotY = textY;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="end" dominant-baseline="central" fill="#999" font-family="monospace">${parentLabel}</text>`;
  } else {
    // 横向：标注在上方，居中
    const annotX = textX;
    const annotY = y - 8;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="middle" fill="#999" font-family="monospace">${parentLabel}</text>`;
  }

  return svg;
}
