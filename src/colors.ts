/**
 * 颜色方案（浅色调）
 */

// 主色（顶层字段）— 柔和浅色
const MAIN_COLORS = [
  '#B3D4F0', // 浅蓝
  '#B8E0B8', // 浅绿
  '#F5D6A8', // 浅橙
  '#D4B8E8', // 浅紫
  '#A8E0D6', // 浅青
  '#F0B8B8', // 浅红
];

// 保留色
const RESERVED_COLOR = '#E8E8E8';

/**
 * 获取字段颜色
 */
export function getFieldColor(index: number, isReserved: boolean, depth: number = 0): string {
  if (isReserved) {
    return RESERVED_COLOR;
  }

  const baseColor = MAIN_COLORS[index % MAIN_COLORS.length];

  if (depth === 0) {
    return baseColor;
  }

  // 子字段：基于父色调整亮度
  return adjustBrightness(baseColor, depth * 10);
}

/**
 * 调整颜色亮度
 */
function adjustBrightness(hex: string, percent: number): string {
  hex = hex.replace('#', '');

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const adjust = (channel: number) => {
    const adjusted = Math.round(channel + (255 - channel) * (percent / 100));
    return Math.min(255, Math.max(0, adjusted));
  };

  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * 获取颜色数组（用于调试）
 */
export function getColorPalette(): string[] {
  return MAIN_COLORS;
}
