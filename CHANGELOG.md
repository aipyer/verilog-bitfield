# Changelog

## [Unreleased]

### Added
- SVG / 表格字体大小可配置
- 旧插件数据自动迁移
- 设置变更实时生效（广播重绘）

### Changed
- DOM 创建改为 `sanitizeHTMLToDom`
- CSS class 集中管理为常量
- SVG 文本基线对齐跨浏览器兼容
- Tooltip 延迟关闭避免误触

### Fixed
- 安全：innerHTML 替换为 sanitizeHTMLToDom

## [1.1.1] - 2026-07-24

### Fixed
- **纵向布局索引标注被裁剪**：纵向位域图中左侧 `[msb:lsb]` 标注使用 `text-anchor="end"` 右对齐，3 位数字位宽（如 256）时标注左侧超出 `viewBox` 左边界被裁剪。改为标注置于框右侧，`text-anchor="start"` 左对齐。
- **纵向方向箭头与标签重叠**：方向箭头原在框右侧（`startX + boxWidth + 24`），与字段标签重叠。改为置于左侧框外（`startX - 24`）。
- **短结构体强制纵向布局**：`shouldUseVertical` 中存在 `totalWidth > 64` 硬编码阈值，导致短位宽结构体（如 32 位）也走纵向。移除该条件。

### Changed
- **横向布局 viewBox 高度**：`startY` 从 15 改为 25，`svgHeight` 从 `boxHeight + 50` 改为 `boxHeight + 60`，使上方标注不被顶部裁剪。
- **纵向布局判断策略重写**：移除旧的 `calcMinLabelWidth(label, fontSize: 14)` 估算逻辑，改为直接用渲染时的 `fontSize: 22` 和 `textWidth = boxWidth - 16` 对齐计算，消除判断与渲染不一致导致的标签截断。
