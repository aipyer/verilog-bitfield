# Changelog

## [1.1.5] - 2026-08-06

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
- 纵向布局索引标注被裁剪
- 纵向方向箭头与标签重叠
- 短结构体强制纵向布局

### Changed
- 横向布局 viewBox 高度调整
- 纵向布局判断策略重写
