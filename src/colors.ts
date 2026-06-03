/**
 * 颜色方案
 */

// 主色（顶层字段）
const MAIN_COLORS = [
  '#4A90D9', // 蓝
  '#5CB85C', // 绿
  '#F0AD4E', // 橙
  '#9B59B6', // 紫
  '#1ABC9C', // 青
  '#E74C3C', // 红
];

// 保留色
const RESERVED_COLOR = '#E0E0E0';

/**
 * 获取字段颜色
 * @param index 字段索引
 * @param isReserved 是否为 reserved
 * @param depth 嵌套深度（0 = 顶层）
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
  return adjustBrightness(baseColor, depth * 15);
}

/**
 * 调整颜色亮度
 * @param hex 十六进制颜色
 * @param percent 亮度调整百分比（正数变亮，负数变暗）
 */
function adjustBrightness(hex: string, percent: number): string {
  // 移除 # 前缀
  hex = hex.replace('#', '');

  // 解析 RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // 调整亮度
  const adjust = (channel: number) => {
    const adjusted = Math.round(channel + (255 - channel) * (percent / 100));
    return Math.min(255, Math.max(0, adjusted));
  };

  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);

  // 转换回十六进制
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * 获取颜色数组（用于调试）
 */
export function getColorPalette(): string[] {
  return MAIN_COLORS;
}
