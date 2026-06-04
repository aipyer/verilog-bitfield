/**
 * 颜色方案
 */

export type SvgTheme = 'pastel' | 'vivid' | 'mono';

// 主色（顶层字段）— 柔和浅色
const PASTEL_COLORS = [
  '#B3D4F0', // 浅蓝
  '#B8E0B8', // 浅绿
  '#F5D6A8', // 浅橙
  '#D4B8E8', // 浅紫
  '#A8E0D6', // 浅青
  '#F0B8B8', // 浅红
];

// 鲜艳色
const VIVID_COLORS = [
  '#5B9BD5', // 蓝
  '#70AD47', // 绿
  '#ED7D31', // 橙
  '#9B59B6', // 紫
  '#1ABC9C', // 青
  '#E74C3C', // 红
];

// 灰度色
const MONO_COLORS = [
  '#C0C0C0', // 浅灰
  '#A8A8A8', // 中灰
  '#D0D0D0', // 亮灰
  '#B0B0B0', // 银灰
  '#C8C8C8', // 淡灰
  '#B8B8B8', // 暗银
];

const THEME_MAP: Record<SvgTheme, string[]> = {
  pastel: PASTEL_COLORS,
  vivid: VIVID_COLORS,
  mono: MONO_COLORS,
};

// 保留色
const RESERVED_COLOR = '#E8E8E8';

/**
 * 获取字段颜色
 */
export function getFieldColor(index: number, isReserved: boolean, depth: number = 0, theme: SvgTheme = 'pastel'): string {
  if (isReserved) {
    return RESERVED_COLOR;
  }

  const palette = THEME_MAP[theme] || PASTEL_COLORS;
  const baseColor = palette[index % palette.length];

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
