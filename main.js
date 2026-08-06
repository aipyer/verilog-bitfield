'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var obsidian = require('obsidian');

function parse(input) {
  const lines = input.split("\n");
  const errors = [];
  const blocks = /* @__PURE__ */ new Map();
  const blockNames = /* @__PURE__ */ new Set();
  const rawLines = [];
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line = lines[i2];
    if (!line.trim() || line.trim().startsWith("//")) {
      continue;
    }
    rawLines.push({
      lineNum: i2 + 1,
      indent: line.search(/\S/),
      content: line.trim()
    });
  }
  if (rawLines.length === 0) {
    return { success: false, errors: [{ line: 0, message: "\u8F93\u5165\u4E3A\u7A7A" }] };
  }
  let i = 0;
  while (i < rawLines.length) {
    const rl = rawLines[i];
    if (rl.indent !== 0) {
      errors.push({ line: rl.lineNum, message: `\u610F\u5916\u7684\u7F29\u8FDB\u884C: "${rl.content}"` });
      i++;
      continue;
    }
    const match = rl.content.match(/^(\w+)\s+(\d+)\s*(.*)?$/);
    if (!match) {
      errors.push({ line: rl.lineNum, message: `\u65E0\u6CD5\u89E3\u6790: "${rl.content}"` });
      i++;
      continue;
    }
    const [, name, widthStr, desc] = match;
    if (blockNames.has(name)) {
      errors.push({
        line: rl.lineNum,
        message: `\u91CD\u590D\u5B9A\u4E49: "${name}"`,
        suggestion: "\u540C\u7B14\u8BB0\u5185\u5757\u540D\u5FC5\u987B\u552F\u4E00"
      });
      i++;
      continue;
    }
    blockNames.add(name);
    const block = {
      name,
      width: parseInt(widthStr, 10),
      description: desc?.trim() || void 0,
      children: []
    };
    i++;
    const childrenStart = i;
    while (i < rawLines.length && rawLines[i].indent > 0) {
      i++;
    }
    const childrenLines = rawLines.slice(childrenStart, i);
    if (childrenLines.length > 0) {
      parseChildren(childrenLines, block.children, errors, 0);
      calculateBitRanges(block.children);
      autoFillReserved(block.children, block.width);
    }
    validateBitWidths(block.children, errors);
    blocks.set(name, block);
  }
  if (blocks.size === 0) {
    return { success: false, errors: [{ line: 0, message: "\u672A\u627E\u5230\u6709\u6548\u7684\u5B9A\u4E49\u5757" }] };
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, blocks };
}
function parseChildren(lines, children, errors, baseIndent, _parentName) {
  const stack = [];
  for (const rl of lines) {
    const match = rl.content.match(/^(@?\w+)\s+(\d+)\s*(.*)?$/);
    if (!match) {
      errors.push({ line: rl.lineNum, message: `\u65E0\u6CD5\u89E3\u6790: "${rl.content}"` });
      continue;
    }
    const [, name, widthStr, desc] = match;
    const width = parseInt(widthStr, 10);
    const isReference = name.startsWith("@");
    const refName = isReference ? name.slice(1) : name;
    const depth = Math.floor((rl.indent - baseIndent) / 2) + 1;
    if (depth > 5) {
      errors.push({ line: rl.lineNum, message: `\u5D4C\u5957\u5C42\u7EA7\u8FC7\u6DF1 (${depth} \u5C42)\uFF0C\u6700\u591A 5 \u5C42` });
      continue;
    }
    const field = {
      name: refName,
      width,
      msb: 0,
      lsb: 0,
      description: desc?.trim() || void 0,
      isReserved: name.toLowerCase() === "reserved",
      isReference,
      refName: isReference ? refName : void 0,
      children: []
    };
    let parent = null;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.indent < rl.indent) {
        parent = top.field;
        break;
      }
      stack.pop();
    }
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(field);
    } else {
      children.push(field);
    }
    stack.push({ field, indent: rl.indent });
  }
}
function calculateBitRanges(fields) {
  let currentLsb = 0;
  for (const field of fields) {
    field.lsb = currentLsb;
    field.msb = currentLsb + field.width - 1;
    currentLsb = field.msb + 1;
    if (!field.isReference && field.children && field.children.length > 0) {
      calculateBitRanges(field.children);
    }
  }
}
function autoFillReserved(fields, parentWidth) {
  const totalChildWidth = fields.reduce((sum, f) => sum + f.width, 0);
  const remaining = parentWidth - totalChildWidth;
  if (remaining > 0) {
    const reserved = {
      name: "reserved",
      width: remaining,
      msb: 0,
      lsb: 0,
      isReserved: true,
      isReference: false,
      children: []
    };
    fields.push(reserved);
    calculateBitRanges(fields);
  }
}
function validateBitWidths(fields, errors) {
  for (const field of fields) {
    const children = field.children || [];
    if (children.length > 0) {
      const childrenWidth = children.reduce((sum, child) => sum + child.width, 0);
      if (childrenWidth > field.width) {
        errors.push({
          line: 0,
          message: `\u5B57\u6BB5 "${field.name}" \u5B50\u5B57\u6BB5\u4F4D\u5BBD\u8D85\u51FA`,
          suggestion: `\u7236\u5B57\u6BB5: ${field.width}-bit, \u5B50\u5B57\u6BB5\u603B\u548C: ${childrenWidth}-bit, \u5269\u4F59\u7A7A\u95F4: ${field.width - childrenWidth}-bit`
        });
      }
      validateBitWidths(children, errors);
    }
  }
}

const PASTEL_COLORS = [
  "#B3D4F0",
  // 浅蓝
  "#B8E0B8",
  // 浅绿
  "#F5D6A8",
  // 浅橙
  "#D4B8E8",
  // 浅紫
  "#A8E0D6",
  // 浅青
  "#F0B8B8"
  // 浅红
];
const VIVID_COLORS = [
  "#5B9BD5",
  // 蓝
  "#70AD47",
  // 绿
  "#ED7D31",
  // 橙
  "#9B59B6",
  // 紫
  "#1ABC9C",
  // 青
  "#E74C3C"
  // 红
];
const MONO_COLORS = [
  "#C0C0C0",
  // 浅灰
  "#A8A8A8",
  // 中灰
  "#D0D0D0",
  // 亮灰
  "#B0B0B0",
  // 银灰
  "#C8C8C8",
  // 淡灰
  "#B8B8B8"
  // 暗银
];
const THEME_MAP = {
  pastel: PASTEL_COLORS,
  vivid: VIVID_COLORS,
  mono: MONO_COLORS
};
const RESERVED_COLOR = "#E8E8E8";
function getFieldColor(index, isReserved, depth = 0, theme = "pastel") {
  if (isReserved) {
    return RESERVED_COLOR;
  }
  const palette = THEME_MAP[theme] || PASTEL_COLORS;
  const baseColor = palette[index % palette.length];
  if (depth === 0) {
    return baseColor;
  }
  return adjustBrightness(baseColor, depth * 10);
}
function adjustBrightness(hex, percent) {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const adjust = (channel) => {
    const adjusted = Math.round(channel + (255 - channel) * (percent / 100));
    return Math.min(255, Math.max(0, adjusted));
  };
  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

function shouldUseVertical(fields, totalWidth, fontSize = 22) {
  const svgWidth = 1e3;
  const availableWidth = svgWidth - 120;
  for (const field of fields) {
    const fieldName = field.isReserved ? "reserved" : field.isReference ? `@${field.refName}` : field.name;
    const selfHigh = field.width - 1;
    const selfLabel = selfHigh === 0 ? fieldName : `${fieldName}[${selfHigh}:0]`;
    const widthRatio = field.width / totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const minWidth = selfLabel.length * fontSize * 0.6 + 16 + 8;
    if (boxWidth < minWidth) return true;
  }
  return false;
}
function renderBlockSvg(block, theme = "pastel", boxHeight = 38, fontSize = 22) {
  const config = {
    totalWidth: block.width,
    isVertical: shouldUseVertical(block.children, block.width, fontSize),
    boxHeight,
    fontSize,
    theme
  };
  if (config.isVertical) {
    return renderVertical(block.children, config);
  } else {
    return renderHorizontal(block.children, config);
  }
}
function renderHorizontal(fields, config) {
  const svgWidth = 1e3;
  const svgHeight = config.boxHeight + 60;
  const startX = 60;
  const startY = 25;
  const availableWidth = svgWidth - 120;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;
  let currentX = startX;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const widthRatio = field.width / config.totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const color = getFieldColor(i, field.isReserved, 0, config.theme);
    svg += renderFieldBox(field, currentX, startY, boxWidth, config.boxHeight, color, config.fontSize, "horizontal");
    currentX += boxWidth;
  }
  const arrowY = startY + config.boxHeight + 22;
  const fs = config.fontSize * 0.85;
  const fieldLeft = startX;
  const fieldRight = startX + availableWidth;
  svg += `<text x="${fieldLeft}" y="${arrowY + 5}" font-size="${fs}" text-anchor="end" fill="#999">LSB</text>`;
  const arrowPad = 10;
  svg += `<line x1="${fieldLeft + arrowPad}" y1="${arrowY}" x2="${fieldRight - arrowPad - 8}" y2="${arrowY}" stroke="#999" stroke-width="1.5"/>`;
  svg += `<polygon points="${fieldRight - arrowPad},${arrowY} ${fieldRight - arrowPad - 10},${arrowY - 5} ${fieldRight - arrowPad - 10},${arrowY + 5}" fill="#999"/>`;
  svg += `<text x="${fieldRight}" y="${arrowY + 5}" font-size="${fs}" fill="#999">MSB</text>`;
  svg += "</svg>";
  return svg;
}
function renderVertical(fields, config) {
  const svgWidth = 1e3;
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
  const arrowX = startX - 24;
  const arrowTop = startY;
  const arrowBottom = startY + fields.length * rowHeight;
  svg += `<line x1="${arrowX}" y1="${arrowTop + 8}" x2="${arrowX}" y2="${arrowBottom - 8}" stroke="#999" stroke-width="1.5"/>`;
  svg += `<polygon points="${arrowX},${arrowBottom} ${arrowX - 5},${arrowBottom - 10} ${arrowX + 5},${arrowBottom - 10}" fill="#999"/>`;
  svg += `<text x="${arrowX}" y="${arrowTop - 4}" font-size="${config.fontSize * 0.85}" text-anchor="middle" fill="#999">LSB</text>`;
  svg += `<text x="${arrowX}" y="${arrowBottom + 18}" font-size="${config.fontSize * 0.85}" text-anchor="middle" fill="#999">MSB</text>`;
  svg += "</svg>";
  return svg;
}
function renderFieldBox(field, x, y, width, height, color, fontSize, layoutDirection = "vertical") {
  let svg = "";
  const isRef = field.isReference;
  const isRsv = field.isReserved;
  const fieldName = isRsv ? "reserved" : isRef ? `@${field.refName}` : field.name;
  const strokeColor = isRef ? "#4A90D9" : "#fff";
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="${strokeColor}" stroke-width="2" rx="4" ry="4" data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ""} style="cursor:${isRef ? "pointer" : "default"}"/>`;
  const selfHigh = field.width - 1;
  const selfLabel = selfHigh === 0 ? fieldName : `${fieldName}[${selfHigh}:0]`;
  const textX = x + width / 2;
  const textY = y + height / 2;
  const textWidth = width - 16;
  const maxChars = Math.floor(textWidth / (fontSize * 0.6));
  let displayText = selfLabel;
  if (selfLabel.length > maxChars && maxChars > 3) {
    displayText = selfLabel.substring(0, maxChars - 2) + "..";
  }
  const textDecoration = "";
  const fillColor = isRsv ? "#888" : "#333";
  svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dy="0.35em" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ""} style="cursor:${isRef ? "pointer" : "default"}">${displayText}</text>`;
  const parentHigh = field.msb;
  const parentLow = field.lsb;
  const parentLabel = parentHigh === parentLow ? `[${parentHigh}]` : `[${parentHigh}:${parentLow}]`;
  const annotationFontSize = fontSize * 0.7;
  if (layoutDirection === "vertical") {
    const annotX = x + width + 8;
    const annotY = textY;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="start" dy="0.35em" fill="#999" font-family="monospace">${parentLabel}</text>`;
  } else {
    const annotX = textX;
    const annotY = y - 8;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="middle" fill="#999" font-family="monospace">${parentLabel}</text>`;
  }
  return svg;
}

const TABLE_CLASS = "bf-table";
const ROW_RESERVED = "bf-row-reserved";
const ROW_REF = "bf-row-ref";
const REF_LINK = "bf-ref-link";
function renderBlockTable(block) {
  const rows = [];
  for (const child of block.children) {
    collectRows(child, 0, rows);
  }
  let html = `<table class="${TABLE_CLASS}">`;
  html += "<thead><tr>";
  html += "<th>Field</th>";
  html += "<th>Width</th>";
  html += "<th>Bit Range</th>";
  html += "<th>Description</th>";
  html += "</tr></thead>";
  html += "<tbody>";
  html += rows.join("");
  html += "</tbody></table>";
  return html;
}
function collectRows(field, depth, rows) {
  const indent = depth > 0 ? "&nbsp;&nbsp;&nbsp;&nbsp;".repeat(depth) : "";
  const isRef = field.isReference;
  const isRsv = field.isReserved;
  const name = isRsv ? "reserved" : isRef ? `@${field.refName}` : field.name;
  const bitRange = `[${field.msb}:${field.lsb}]`;
  const description = field.description || "";
  let rowClass = "";
  if (isRsv) rowClass = ` class="${ROW_RESERVED}"`;
  else if (isRef) rowClass = ` class="${ROW_REF}"`;
  const nameCell = isRef ? `<a href="#" class="${REF_LINK}" data-target="${field.refName}">${indent}${name}</a>` : `${indent}${name}`;
  rows.push(`<tr${rowClass}>`);
  rows.push(`<td>${nameCell}</td>`);
  rows.push(`<td>${field.width}</td>`);
  rows.push(`<td>${bitRange}</td>`);
  rows.push(`<td>${description}</td>`);
  rows.push("</tr>");
  if (field.children && field.children.length > 0) {
    for (const child of field.children) {
      collectRows(child, depth + 1, rows);
    }
  }
}

const TABLE_THEME_LABELS = {
  default: "Default \u2014 grid lines, gray header",
  minimal: "Minimal \u2014 horizontal lines only",
  zebra: "Zebra \u2014 alternating row colors",
  clean: "Clean \u2014 no borders, whitespace separation",
  "dark-header": "Dark Header \u2014 dark header, clean body"
};
const SVG_THEME_LABELS = {
  pastel: "Pastel \u2014 soft pastel colors",
  vivid: "Vivid \u2014 bold saturated colors",
  mono: "Mono \u2014 grayscale"
};
class BitfieldSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setHeading();
    new obsidian.Setting(containerEl).setName("SVG theme").setDesc("Color scheme for bitfield diagrams").addDropdown((drop) => {
      for (const [key, label] of Object.entries(SVG_THEME_LABELS)) {
        drop.addOption(key, label);
      }
      drop.setValue(this.plugin.pluginData.svgTheme || "pastel");
      drop.onChange(async (value) => {
        console.log("[bitfield settings] dropdown changed svgTheme:", value);
        this.plugin.pluginData.svgTheme = value;
        await this.plugin.saveData(this.plugin.pluginData);
        window.dispatchEvent(new CustomEvent("bf-settings-changed"));
      });
    });
    new obsidian.Setting(containerEl).setName("SVG row height").setDesc("Height of each field row in bitfield diagrams (px)").addSlider((slider) => {
      slider.setLimits(28, 80, 2);
      slider.setValue(this.plugin.pluginData.svgBoxHeight || 38);
      slider.onChange(async (value) => {
        console.log("[bitfield settings] slider changed svgBoxHeight:", value);
        this.plugin.pluginData.svgBoxHeight = value;
        await this.plugin.saveData(this.plugin.pluginData);
        window.dispatchEvent(new CustomEvent("bf-settings-changed"));
      });
    });
    new obsidian.Setting(containerEl).setName("SVG font size").setDesc("Font size for field labels in bitfield diagrams (px)").addSlider((slider) => {
      slider.setLimits(14, 36, 1);
      slider.setValue(this.plugin.pluginData.svgFontSize || 22);
      slider.onChange(async (value) => {
        console.log("[bitfield settings] slider changed svgFontSize:", value);
        this.plugin.pluginData.svgFontSize = value;
        await this.plugin.saveData(this.plugin.pluginData);
        window.dispatchEvent(new CustomEvent("bf-settings-changed"));
      });
    });
    new obsidian.Setting(containerEl).setName("Table theme").setDesc("Visual style for rendered tables").addDropdown((drop) => {
      for (const [key, label] of Object.entries(TABLE_THEME_LABELS)) {
        drop.addOption(key, label);
      }
      drop.setValue(this.plugin.pluginData.tableTheme || "default");
      drop.onChange(async (value) => {
        console.log("[bitfield settings] dropdown changed tableTheme:", value);
        this.plugin.pluginData.tableTheme = value;
        await this.plugin.saveData(this.plugin.pluginData);
        console.log("[bitfield settings] saveData completed");
        window.dispatchEvent(new CustomEvent("bf-settings-changed"));
      });
    });
    new obsidian.Setting(containerEl).setName("Table row height").setDesc("Row height for rendered tables (px)").addSlider((slider) => {
      slider.setLimits(18, 48, 2);
      slider.setValue(this.plugin.pluginData.tableRowHeight || 28);
      slider.onChange(async (value) => {
        console.log("[bitfield settings] slider changed tableRowHeight:", value);
        this.plugin.pluginData.tableRowHeight = value;
        await this.plugin.saveData(this.plugin.pluginData);
        window.dispatchEvent(new CustomEvent("bf-settings-changed"));
      });
    });
    new obsidian.Setting(containerEl).setName("Table font size").setDesc("Font size for rendered tables (px)").addSlider((slider) => {
      slider.setLimits(10, 24, 1);
      slider.setValue(this.plugin.pluginData.tableFontSize || 14);
      slider.onChange(async (value) => {
        console.log("[bitfield settings] slider changed tableFontSize:", value);
        this.plugin.pluginData.tableFontSize = value;
        await this.plugin.saveData(this.plugin.pluginData);
        window.dispatchEvent(new CustomEvent("bf-settings-changed"));
      });
    });
  }
}

const OLD_PLUGIN_ID = "verilog-bitfield";
const CSS = {
  container: "bf-container",
  headerRow: "bf-header-row",
  header: "bf-header",
  content: "bf-content",
  svg: "bf-svg",
  tableContainer: "bf-table-container",
  error: "bf-error",
  toggleBtn: "bf-view-toggle",
  toggleOption: "bf-toggle-option",
  toggleActive: "bf-toggle-active",
  tooltip: "bf-tooltip",
  tooltipHeader: "bf-tooltip-header",
  tooltipSvg: "bf-tooltip-svg",
  tooltipTable: "bf-tooltip-table",
  tooltipHint: "bf-tooltip-hint",
  refLink: "bf-ref-link",
  refUnresolved: "bf-ref-unresolved",
  highlight: "bf-highlight"};
const DEFAULT_DATA = { defaultView: "svg", tableTheme: "default", svgTheme: "pastel", svgBoxHeight: 38, svgFontSize: 22, tableFontSize: 14, tableRowHeight: 28 };
class BitfieldPlugin extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.blockRegistry = /* @__PURE__ */ new Map();
    this.pendingRefs = [];
    this.currentNotePath = "";
    this.activeTooltip = null;
    this.tooltipRemoveTimer = null;
    this.pluginData = DEFAULT_DATA;
    this.stylesInjected = false;
  }
  // public accessor for SettingTab
  get savedData() {
    return this.pluginData;
  }
  set savedData(v) {
    this.pluginData = v;
  }
  /** Expose as `settings` so Obsidian's PluginSettingTab.getControlValue() doesn't crash */
  get settings() {
    return this.pluginData;
  }
  set settings(v) {
    this.pluginData = v;
  }
  async onload() {
    await this.migrateData();
    this.pluginData = Object.assign({}, DEFAULT_DATA, await this.loadData());
    this.addSettingTab(new BitfieldSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("bitfield", this.processBitfield.bind(this));
    document.documentElement.style.setProperty("--bf-table-row-height", `${this.pluginData.tableRowHeight || 28}px`);
    document.documentElement.style.setProperty("--bf-table-font-size", `${this.pluginData.tableFontSize || 14}px`);
    this.injectTableStyles();
    this.applyTableTheme(this.pluginData.tableTheme || "default");
  }
  /** Apply table theme to all rendered blocks */
  applyTableTheme(theme) {
    document.querySelectorAll(".bf-table-container").forEach((el) => {
      el.setAttribute("data-theme", theme);
    });
  }
  /** 从旧插件名迁移数据到新插件 */
  async migrateData() {
    const pluginData = await this.loadData();
    if (pluginData && Object.keys(pluginData).length > 0) {
      return false;
    }
    const configDir = this.app.vault.configDir;
    const oldDataFile = `${configDir}/plugins/${OLD_PLUGIN_ID}/data.json`;
    try {
      const oldRaw = await this.app.vault.adapter.read(oldDataFile);
      if (oldRaw) {
        const oldData = JSON.parse(oldRaw);
        if (oldData && Object.keys(oldData).length > 0) {
          await this.saveData(oldData);
          console.log("[bitfield] Migrated settings from old plugin");
          return true;
        }
      }
    } catch {
    }
    return false;
  }
  injectTableStyles() {
    if (this.stylesInjected) return;
    this.stylesInjected = true;
    const css = `
      /* \u8868\u683C\u6837\u5F0F \u2014 \u7528 .markdown-preview-view \u9650\u5B9A\u4F5C\u7528\u57DF\uFF0C\u786E\u4FDD\u4F18\u5148\u4E8E Obsidian \u4E3B\u9898\u6837\u5F0F */
      .markdown-preview-view .bf-table-container .bf-table,
      .markdown-source-view .bf-table-container .bf-table {
        width: 100%; border-collapse: collapse; table-layout: auto;
      }
      .markdown-preview-view .bf-table-container .bf-table th,
      .markdown-preview-view .bf-table-container .bf-table td,
      .markdown-source-view .bf-table-container .bf-table th,
      .markdown-source-view .bf-table-container .bf-table td {
        border: 1px solid #ddd; padding: 0 8px; text-align: center;
        line-height: var(--bf-table-row-height, 28px); font-size: var(--bf-table-font-size, 14px);
        height: var(--bf-table-row-height, 28px);
      }
      .markdown-preview-view .bf-table-container .bf-table th:last-child,
      .markdown-preview-view .bf-table-container .bf-table td:last-child,
      .markdown-source-view .bf-table-container .bf-table th:last-child,
      .markdown-source-view .bf-table-container .bf-table td:last-child {
        text-align: left;
      }
      .markdown-preview-view .bf-table-container .bf-table th,
      .markdown-source-view .bf-table-container .bf-table th {
        background-color: #f5f5f5; font-weight: 600;
      }
      .markdown-preview-view .bf-table-container .bf-table tr:hover,
      .markdown-source-view .bf-table-container .bf-table tr:hover {
        background-color: #f9f9f9;
      }
      .markdown-preview-view .bf-table-container .bf-table td:first-child,
      .markdown-source-view .bf-table-container .bf-table td:first-child {
        font-family: monospace; white-space: nowrap;
      }
      /* \u884C\u6837\u5F0F */
      .bf-table tr.bf-row-ref { background-color: #f0f7ff; }
      .bf-table tr.bf-row-ref:hover { background-color: #e0efff; }
      .bf-table tr.bf-row-reserved { background-color: #f5f5f5; }
      .bf-table tr.bf-row-reserved td { font-style: italic; color: #999; }
      .bf-table tr.bf-row-reserved:hover { background-color: #efefef; }

      /* \u2500\u2500 minimal \u2500\u2500 */
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table th,
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table td,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table td {
        border: none; border-bottom: 1px solid #eee;
      }
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table th { border-bottom: 2px solid #ddd; }
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr:last-child td,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table tr:last-child td { border-bottom: none; }
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-ref,
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-ref:hover,
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-reserved,
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-reserved:hover,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-ref,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-ref:hover,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-reserved,
      .markdown-source-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-reserved:hover {
        background-color: transparent !important;
      }
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-ref:hover { background-color: #f0f7ff; }
      .markdown-preview-view .bf-table-container[data-theme="minimal"] .bf-table tr.bf-row-reserved:hover { background-color: #f9f9f9; }

      /* \u2500\u2500 zebra \u2500\u2500 */
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table th,
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table td,
      .markdown-source-view .bf-table-container[data-theme="zebra"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="zebra"] .bf-table td { border: none; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="zebra"] .bf-table th { border-bottom: 2px solid #ddd; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table tbody tr:nth-child(even),
      .markdown-source-view .bf-table-container[data-theme="zebra"] .bf-table tbody tr:nth-child(even) { background-color: #f9f9f9; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table tbody tr:nth-child(even):hover,
      .markdown-source-view .bf-table-container[data-theme="zebra"] .bf-table tbody tr:nth-child(even):hover { background-color: #f0f0f0; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table tr.bf-row-ref { background-color: #f0f7ff !important; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table tr.bf-row-ref:hover { background-color: #e0efff !important; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table tr.bf-row-reserved { background-color: #f5f5f5 !important; }
      .markdown-preview-view .bf-table-container[data-theme="zebra"] .bf-table tr.bf-row-reserved:hover { background-color: #efefef !important; }

      /* \u2500\u2500 clean \u2500\u2500 */
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table th,
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table td,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table td { border: none; }
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table th { border-bottom: 2px solid #333; font-weight: 600; }
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table tr { border-bottom: 1px solid #eee; }
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-ref,
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-ref:hover,
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-reserved,
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-reserved:hover,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-ref,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-ref:hover,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-reserved,
      .markdown-source-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-reserved:hover {
        background-color: transparent !important;
      }
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-ref:hover { background-color: #f0f7ff; }
      .markdown-preview-view .bf-table-container[data-theme="clean"] .bf-table tr.bf-row-reserved:hover { background-color: #f9f9f9; }

      /* \u2500\u2500 dark-header \u2500\u2500 */
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table th,
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table td,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table td { border: none; border-bottom: 1px solid #eee; }
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table th,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table th {
        background-color: #333; color: #fff; border-bottom: none; font-weight: 600;
      }
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr:last-child td,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table tr:last-child td { border-bottom: none; }
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr:hover,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table tr:hover { background-color: #f0f0f0; }
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-ref,
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-ref:hover,
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-reserved,
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-reserved:hover,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-ref,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-ref:hover,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-reserved,
      .markdown-source-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-reserved:hover {
        background-color: transparent !important;
      }
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-ref:hover { background-color: #f0f7ff; }
      .markdown-preview-view .bf-table-container[data-theme="dark-header"] .bf-table tr.bf-row-reserved:hover { background-color: #f0f0f0; }

      /* \u53C2\u8003\u94FE\u63A5 */
      .bf-ref-link { color: #4A90D9; text-decoration: none; cursor: pointer; font-family: monospace; }
      .bf-ref-link:hover { color: #2a6cb8; }
      .bf-ref-unresolved { color: #999; text-decoration: none; cursor: not-allowed; }

      /* \u60AC\u6D6E tooltip \u4E2D\u7684\u8868\u683C */
      .bf-tooltip .bf-table { width: 100%; border-collapse: collapse; }
      .bf-tooltip .bf-table th,
      .bf-tooltip .bf-table td {
        border: 1px solid #ddd; padding: 4px 8px; text-align: center;
      }
      .bf-tooltip .bf-table th:last-child,
      .bf-tooltip .bf-table td:last-child { text-align: left; }
      .bf-tooltip .bf-table th { background-color: #f5f5f5; font-weight: 600; }
      .bf-tooltip .bf-table tr.bf-row-reserved td { color: #999; font-style: italic; }
    `;
    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
  onunload() {
    this.blockRegistry.clear();
    this.pendingRefs = [];
    this.removeTooltip();
  }
  async processBitfield(source, el, ctx) {
    this.currentNotePath = ctx.sourcePath || "";
    const result = parse(source);
    if (!result.success) {
      this.renderErrors(el, result.errors || []);
      return;
    }
    if (!result.blocks) return;
    for (const [name, block] of result.blocks) {
      this.renderBlock(name, block, el);
    }
    window.setTimeout(() => this.resolvePendingRefs(), 50);
  }
  renderBlock(name, block, parentEl) {
    const container = parentEl.createEl("div", {
      cls: CSS.container,
      attr: { id: `bf:${name}` }
    });
    const headerRow = container.createEl("div", { cls: CSS.headerRow });
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.marginBottom = "8px";
    const desc = block.description ? ` \u2014 ${block.description}` : "";
    headerRow.createEl("span", {
      text: `${name}${desc} \u7684 ${block.width} bit \u5B9A\u4E49\u5982\u4E0B\uFF1A`,
      cls: CSS.header
    });
    const toggleBtn = this.createToggleButton(headerRow);
    const contentWrap = container.createEl("div", { cls: CSS.content });
    const svgContainer = contentWrap.createEl("div", { cls: CSS.svg });
    const svgHtml = renderBlockSvg(block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 38, this.pluginData.svgFontSize || 22);
    const svgDocFrag = obsidian.sanitizeHTMLToDom(svgHtml);
    svgContainer.appendChild(svgDocFrag);
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);
    const tableContainer = contentWrap.createEl("div", { cls: CSS.tableContainer });
    tableContainer.setAttribute("data-theme", this.pluginData.tableTheme || "default");
    const tableHtml = renderBlockTable(block);
    const tableDocFrag = obsidian.sanitizeHTMLToDom(tableHtml);
    tableContainer.appendChild(tableDocFrag);
    this.setupTableNavigationHandlers(tableContainer);
    this.setupTableTooltipHandlers(tableContainer);
    const defaultView = this.pluginData.defaultView || "svg";
    svgContainer.style.display = "none";
    tableContainer.style.display = "none";
    this.applyView(defaultView, contentWrap, svgContainer, tableContainer, toggleBtn);
    toggleBtn.onclick = (e) => {
      const target = e.target;
      const view = target.getAttribute("data-view");
      if (view) {
        this.applyView(view, contentWrap, svgContainer, tableContainer, toggleBtn);
        this.pluginData.defaultView = view;
        this.saveData(this.pluginData);
      }
    };
    const settingsHandler = () => {
      this.applyTableTheme(this.pluginData.tableTheme || "default");
      document.documentElement.style.setProperty("--bf-table-row-height", `${this.pluginData.tableRowHeight || 28}px`);
      document.documentElement.style.setProperty("--bf-table-font-size", `${this.pluginData.tableFontSize || 14}px`);
      this.rerenderAll();
    };
    window.addEventListener("bf-settings-changed", settingsHandler);
    this.blockRegistry.set(name, {
      element: container,
      block,
      notePath: this.currentNotePath
    });
    this.collectPendingRefs(svgContainer);
    this.collectPendingRefs(tableContainer);
  }
  applyView(view, contentWrap, svgEl, tableEl, btn) {
    contentWrap.setAttribute("data-view", view);
    if (view === "svg") {
      svgEl.style.display = "block";
      tableEl.style.display = "none";
    } else {
      svgEl.style.display = "none";
      tableEl.style.display = "block";
    }
    btn.querySelectorAll(`.${CSS.toggleOption}`).forEach((opt) => {
      opt.classList.toggle(CSS.toggleActive, opt.getAttribute("data-view") === view);
    });
  }
  createToggleButton(parent) {
    const btn = parent.createEl("div", { cls: CSS.toggleBtn });
    btn.createEl("span", { text: "\u4F4D\u57DF\u56FE", cls: `${CSS.toggleOption} bf-toggle-svg`, attr: { "data-view": "svg" } });
    btn.createEl("span", { text: "\u8868\u683C", cls: `${CSS.toggleOption} bf-toggle-table`, attr: { "data-view": "table" } });
    return btn;
  }
  /** Rerender all SVGs with current theme — public for SettingTab */
  rerenderAllSvg() {
    const theme = this.pluginData.svgTheme || "pastel";
    const boxHeight = this.pluginData.svgBoxHeight || 38;
    const fontSize = this.pluginData.svgFontSize || 22;
    for (const [, entry] of this.blockRegistry) {
      const svgContainer = entry.element.querySelector(`.${CSS.svg}`);
      if (svgContainer) {
        svgContainer.empty();
        const svgHtml = renderBlockSvg(entry.block, theme, boxHeight, fontSize);
        const svgDocFrag = obsidian.sanitizeHTMLToDom(svgHtml);
        svgContainer.appendChild(svgDocFrag);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
    }
  }
  /** Re-render all blocks with updated settings — public for SettingTab */
  rerenderAll() {
    console.log("[bitfield] rerenderAll called, entries:", this.blockRegistry.size);
    this.activeTooltip !== null;
    this.removeTooltip();
    for (const [name, entry] of this.blockRegistry) {
      console.log("[bitfield] rerenderAll entry:", name);
      const container = entry.element;
      const svgContainer = container.querySelector(`.${CSS.svg}`);
      if (svgContainer) {
        const svgHtml = renderBlockSvg(entry.block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 38, this.pluginData.svgFontSize || 22);
        const svgDocFrag = obsidian.sanitizeHTMLToDom(svgHtml);
        svgContainer.empty();
        svgContainer.appendChild(svgDocFrag);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
      const tableContainer = container.querySelector(`.${CSS.tableContainer}`);
      if (tableContainer) {
        tableContainer.setAttribute("data-theme", this.pluginData.tableTheme || "default");
        const tableHtml = renderBlockTable(entry.block);
        const tableDocFrag = obsidian.sanitizeHTMLToDom(tableHtml);
        tableContainer.empty();
        tableContainer.appendChild(tableDocFrag);
        this.setupTableNavigationHandlers(tableContainer);
        this.setupTableTooltipHandlers(tableContainer);
      }
    }
    window.setTimeout(() => this.resolvePendingRefs(), 50);
  }
  renderErrors(el, errors) {
    el.createEl("div", { cls: CSS.error }, (errorEl) => {
      errorEl.createEl("p", { text: "\u89E3\u6790\u9519\u8BEF:" });
      for (const error of errors) {
        errorEl.createEl("p", { text: `\u884C ${error.line}: ${error.message}` });
        if (error.suggestion) {
          errorEl.createEl("p", { text: `\u5EFA\u8BAE: ${error.suggestion}`, cls: "suggestion" });
        }
      }
    });
  }
  // ─── 点击跳转 ───
  setupNavigationHandlers(container) {
    container.onclick = (e) => {
      const target = e.target;
      const refName = target.getAttribute("data-ref") || target.parentElement?.getAttribute("data-ref");
      if (refName) this.scrollToBlock(refName);
    };
  }
  setupTableNavigationHandlers(container) {
    container.onclick = (e) => {
      const target = e.target;
      if (target.classList.contains(CSS.refLink)) {
        e.preventDefault();
        const refName = target.getAttribute("data-target");
        if (refName) this.scrollToBlock(refName);
      }
    };
  }
  scrollToBlock(blockName) {
    const entry = this.blockRegistry.get(blockName);
    if (!entry) return;
    entry.element.scrollIntoView({ behavior: "smooth", block: "center" });
    entry.element.classList.add(CSS.highlight);
    window.setTimeout(() => entry.element.classList.remove(CSS.highlight), 1500);
  }
  // ─── 悬浮 tooltip ───
  setupTooltipHandlers(container) {
    container.addEventListener("mouseover", (e) => {
      const target = e.target;
      const refName = target.getAttribute("data-ref") || target.parentElement?.getAttribute("data-ref");
      if (refName) {
        if (this.tooltipRemoveTimer) {
          window.clearTimeout(this.tooltipRemoveTimer);
          this.tooltipRemoveTimer = null;
        }
        const view = this.getViewForBlock(refName);
        this.showTooltip(refName, e.clientX, e.clientY, view);
      }
    });
    container.addEventListener("mouseout", (e) => {
      const target = e.target;
      const refName = target.getAttribute("data-ref") || target.parentElement?.getAttribute("data-ref");
      if (refName) this.scheduleTooltipRemove();
    });
  }
  setupTableTooltipHandlers(container) {
    container.addEventListener("mouseover", (e) => {
      const target = e.target;
      if (target.classList.contains(CSS.refLink)) {
        if (this.tooltipRemoveTimer) {
          window.clearTimeout(this.tooltipRemoveTimer);
          this.tooltipRemoveTimer = null;
        }
        const refName = target.getAttribute("data-target");
        if (refName) {
          const view = this.getViewForBlock(refName);
          this.showTooltip(refName, e.clientX, e.clientY, view);
        }
      }
    });
    container.addEventListener("mouseout", (e) => {
      const target = e.target;
      if (target.classList.contains(CSS.refLink)) this.scheduleTooltipRemove();
    });
  }
  /** 获取被引用块自身的视图状态，不存在则用默认偏好 */
  getViewForBlock(blockName) {
    const entry = this.blockRegistry.get(blockName);
    if (entry) {
      const contentWrap = entry.element.querySelector(`.${CSS.content}`);
      const view = contentWrap?.getAttribute("data-view");
      if (view) return view;
    }
    return this.pluginData.defaultView || "svg";
  }
  scheduleTooltipRemove() {
    this.tooltipRemoveTimer = window.setTimeout(() => {
      this.removeTooltip();
    }, 200);
  }
  showTooltip(blockName, mouseX, mouseY, view) {
    const entry = this.blockRegistry.get(blockName);
    if (!entry) return;
    this.removeTooltip();
    const tooltip = document.body.createEl("div", { cls: CSS.tooltip });
    tooltip.style.fontSize = `${this.pluginData.tableFontSize || 14}px`;
    const desc = entry.block.description ? ` \u2014 ${entry.block.description}` : "";
    tooltip.createEl("p", { text: `${blockName}${desc}`, cls: CSS.tooltipHeader });
    if (view === "svg") {
      const svgWrap = tooltip.createEl("div", { cls: CSS.tooltipSvg });
      const svgHtml = renderBlockSvg(entry.block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 38, this.pluginData.svgFontSize || 22);
      const svgDocFrag = obsidian.sanitizeHTMLToDom(svgHtml);
      svgWrap.appendChild(svgDocFrag);
    } else {
      const tableWrap = tooltip.createEl("div", { cls: CSS.tooltipTable });
      const tableHtml = renderBlockTable(entry.block);
      const tableDocFrag = obsidian.sanitizeHTMLToDom(tableHtml);
      tableWrap.appendChild(tableDocFrag);
    }
    tooltip.createEl("p", { text: "\u5355\u51FB\u8DF3\u8F6C\u67E5\u770B\u5B8C\u6574\u5B9A\u4E49", cls: CSS.tooltipHint });
    document.body.appendChild(tooltip);
    this.activeTooltip = tooltip;
    const rect = tooltip.getBoundingClientRect();
    let left = mouseX + 12;
    let top = mouseY - 20;
    if (left + rect.width > window.innerWidth - 16) left = mouseX - rect.width - 12;
    if (top + rect.height > window.innerHeight - 16) top = window.innerHeight - rect.height - 16;
    if (top < 8) top = 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.addEventListener("mouseenter", () => {
      if (this.tooltipRemoveTimer) {
        window.clearTimeout(this.tooltipRemoveTimer);
        this.tooltipRemoveTimer = null;
      }
    });
    tooltip.addEventListener("mouseleave", () => {
      this.tooltipRemoveTimer = window.setTimeout(() => {
        this.removeTooltip();
      }, 200);
    });
  }
  removeTooltip() {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }
  // ─── 引用解析 ───
  collectPendingRefs(container) {
    container.querySelectorAll("[data-ref]").forEach((el) => {
      const refName = el.getAttribute("data-ref") ?? "";
      if (!refName) return;
      if (!this.blockRegistry.has(refName)) {
        this.pendingRefs.push({ element: el, targetName: refName });
      }
    });
    container.querySelectorAll(`.${CSS.refLink}`).forEach((el) => {
      const targetName = el.getAttribute("data-target") ?? "";
      if (!targetName) return;
      if (!this.blockRegistry.has(targetName)) {
        this.pendingRefs.push({ element: el, targetName });
        el.classList.add(CSS.refUnresolved);
      }
    });
  }
  resolvePendingRefs() {
    const stillPending = [];
    for (const pending of this.pendingRefs) {
      if (this.blockRegistry.has(pending.targetName)) {
        pending.element.classList.remove(CSS.refUnresolved);
      } else {
        stillPending.push(pending);
      }
    }
    this.pendingRefs = stillPending;
  }
}

exports.DEFAULT_DATA = DEFAULT_DATA;
exports.default = BitfieldPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9zZXR0aW5ncy50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQml0RmllbGQsIEZpZWxkQmxvY2ssIFBhcnNlRXJyb3IsIFBhcnNlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG5pbnRlcmZhY2UgUmF3TGluZSB7XHJcbiAgbGluZU51bTogbnVtYmVyO1xyXG4gIGluZGVudDogbnVtYmVyO1xyXG4gIGNvbnRlbnQ6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIOino+aekOS9jeWfn+WumuS5iVxyXG4gKiDnu5/kuIDor63ms5XvvJrmr4/kuKrku6PnoIHlnZfnlLHkuIDkuKrmiJblpJrkuKogZGVmaW5pdGlvbiBibG9jayDnu4TmiJBcclxuICog5q+P5Liq5Z2X77ya56ys5LiA6KGMIG5hbWUgd2lkdGggW2Rlc2NyaXB0aW9uXe+8jOWtkOWtl+autemAmui/h+e8qei/m+W1jOWll1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGlucHV0OiBzdHJpbmcpOiBQYXJzZVJlc3VsdCB7XHJcbiAgY29uc3QgbGluZXMgPSBpbnB1dC5zcGxpdCgnXFxuJyk7XHJcbiAgY29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcclxuICBjb25zdCBibG9ja3MgPSBuZXcgTWFwPHN0cmluZywgRmllbGRCbG9jaz4oKTtcclxuICBjb25zdCBibG9ja05hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcblxyXG4gIC8vIOmihOWkhOeQhu+8mui/h+a7pOepuuihjOWSjOazqOmHilxyXG4gIGNvbnN0IHJhd0xpbmVzOiBSYXdMaW5lW10gPSBbXTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV07XHJcbiAgICBpZiAoIWxpbmUudHJpbSgpIHx8IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy8vJykpIHtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICByYXdMaW5lcy5wdXNoKHtcclxuICAgICAgbGluZU51bTogaSArIDEsXHJcbiAgICAgIGluZGVudDogbGluZS5zZWFyY2goL1xcUy8pLFxyXG4gICAgICBjb250ZW50OiBsaW5lLnRyaW0oKVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAocmF3TGluZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn6L6T5YWl5Li656m6JyB9XSB9O1xyXG4gIH1cclxuXHJcbiAgLy8g6YCQ6KGM6Kej5p6Q77yMaW5kZW50PTAg55qE6KGM5L2c5Li65Z2X5aS0XHJcbiAgbGV0IGkgPSAwO1xyXG4gIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBybCA9IHJhd0xpbmVzW2ldO1xyXG5cclxuICAgIGlmIChybC5pbmRlbnQgIT09IDApIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5oSP5aSW55qE57yp6L+b6KGMOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWF0Y2ggPSBybC5jb250ZW50Lm1hdGNoKC9eKFxcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgWywgbmFtZSwgd2lkdGhTdHIsIGRlc2NdID0gbWF0Y2g7XHJcblxyXG4gICAgaWYgKGJsb2NrTmFtZXMuaGFzKG5hbWUpKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICBsaW5lOiBybC5saW5lTnVtLFxyXG4gICAgICAgIG1lc3NhZ2U6IGDph43lpI3lrprkuYk6IFwiJHtuYW1lfVwiYCxcclxuICAgICAgICBzdWdnZXN0aW9uOiAn5ZCM56yU6K6w5YaF5Z2X5ZCN5b+F6aG75ZSv5LiAJ1xyXG4gICAgICB9KTtcclxuICAgICAgaSsrO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGJsb2NrTmFtZXMuYWRkKG5hbWUpO1xyXG5cclxuICAgIGNvbnN0IGJsb2NrOiBGaWVsZEJsb2NrID0ge1xyXG4gICAgICBuYW1lLFxyXG4gICAgICB3aWR0aDogcGFyc2VJbnQod2lkdGhTdHIsIDEwKSxcclxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXHJcbiAgICAgIGNoaWxkcmVuOiBbXVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyDmlLbpm4blrZDlrZfmrrXvvIjov57nu63nmoTnvKnov5vooYzvvIlcclxuICAgIGkrKztcclxuICAgIGNvbnN0IGNoaWxkcmVuU3RhcnQgPSBpO1xyXG4gICAgd2hpbGUgKGkgPCByYXdMaW5lcy5sZW5ndGggJiYgcmF3TGluZXNbaV0uaW5kZW50ID4gMCkge1xyXG4gICAgICBpKys7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZHJlbkxpbmVzID0gcmF3TGluZXMuc2xpY2UoY2hpbGRyZW5TdGFydCwgaSk7XHJcblxyXG4gICAgaWYgKGNoaWxkcmVuTGluZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBwYXJzZUNoaWxkcmVuKGNoaWxkcmVuTGluZXMsIGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMsIDAsIG5hbWUpO1xyXG4gICAgICBjYWxjdWxhdGVCaXRSYW5nZXMoYmxvY2suY2hpbGRyZW4pO1xyXG4gICAgICBhdXRvRmlsbFJlc2VydmVkKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g6aqM6K+B5L2N5a69XHJcbiAgICB2YWxpZGF0ZUJpdFdpZHRocyhibG9jay5jaGlsZHJlbiwgZXJyb3JzKTtcclxuXHJcbiAgICBibG9ja3Muc2V0KG5hbWUsIGJsb2NrKTtcclxuICB9XHJcblxyXG4gIGlmIChibG9ja3Muc2l6ZSA9PT0gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogW3sgbGluZTogMCwgbWVzc2FnZTogJ+acquaJvuWIsOacieaViOeahOWumuS5ieWdlycgfV0gfTtcclxuICB9XHJcblxyXG4gIGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmxvY2tzIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDop6PmnpDlrZDlrZfmrrXliJfooahcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlQ2hpbGRyZW4oXHJcbiAgbGluZXM6IFJhd0xpbmVbXSxcclxuICBjaGlsZHJlbjogQml0RmllbGRbXSxcclxuICBlcnJvcnM6IFBhcnNlRXJyb3JbXSxcclxuICBiYXNlSW5kZW50OiBudW1iZXIsXHJcbiAgX3BhcmVudE5hbWU6IHN0cmluZ1xyXG4pOiB2b2lkIHtcclxuICBjb25zdCBzdGFjazogeyBmaWVsZDogQml0RmllbGQ7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xyXG5cclxuICBmb3IgKGNvbnN0IHJsIG9mIGxpbmVzKSB7XHJcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oQD9cXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XHJcbiAgICBpZiAoIW1hdGNoKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaXoOazleino+aekDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcclxuICAgIGNvbnN0IHdpZHRoID0gcGFyc2VJbnQod2lkdGhTdHIsIDEwKTtcclxuICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gbmFtZS5zdGFydHNXaXRoKCdAJyk7XHJcbiAgICBjb25zdCByZWZOYW1lID0gaXNSZWZlcmVuY2UgPyBuYW1lLnNsaWNlKDEpIDogbmFtZTtcclxuXHJcbiAgICAvLyDltYzlpZflsYLnuqfmo4Dmn6VcclxuICAgIGNvbnN0IGRlcHRoID0gTWF0aC5mbG9vcigocmwuaW5kZW50IC0gYmFzZUluZGVudCkgLyAyKSArIDE7XHJcbiAgICBpZiAoZGVwdGggPiA1KSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOW1jOWll+Wxgue6p+i/h+a3sSAoJHtkZXB0aH0g5bGCKe+8jOacgOWkmiA1IOWxgmAgfSk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZpZWxkOiBCaXRGaWVsZCA9IHtcclxuICAgICAgbmFtZTogcmVmTmFtZSxcclxuICAgICAgd2lkdGgsXHJcbiAgICAgIG1zYjogMCxcclxuICAgICAgbHNiOiAwLFxyXG4gICAgICBkZXNjcmlwdGlvbjogZGVzYz8udHJpbSgpIHx8IHVuZGVmaW5lZCxcclxuICAgICAgaXNSZXNlcnZlZDogbmFtZS50b0xvd2VyQ2FzZSgpID09PSAncmVzZXJ2ZWQnLFxyXG4gICAgICBpc1JlZmVyZW5jZSxcclxuICAgICAgcmVmTmFtZTogaXNSZWZlcmVuY2UgPyByZWZOYW1lIDogdW5kZWZpbmVkLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcblxyXG4gICAgLy8g5om+54i25a2X5q6177ya5LuO5qCI5Lit5om+57yp6L+b5q+U5b2T5YmN5bCP55qE5pyA5ZCO5LiA5LiqXHJcbiAgICBsZXQgcGFyZW50OiBCaXRGaWVsZCB8IG51bGwgPSBudWxsO1xyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgdG9wID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XHJcbiAgICAgIGlmICh0b3AuaW5kZW50IDwgcmwuaW5kZW50KSB7XHJcbiAgICAgICAgcGFyZW50ID0gdG9wLmZpZWxkO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgIHN0YWNrLnBvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgaWYgKCFwYXJlbnQuY2hpbGRyZW4pIHBhcmVudC5jaGlsZHJlbiA9IFtdO1xyXG4gICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChmaWVsZCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjaGlsZHJlbi5wdXNoKGZpZWxkKTtcclxuICAgIH1cclxuXHJcbiAgICBzdGFjay5wdXNoKHsgZmllbGQsIGluZGVudDogcmwuaW5kZW50IH0pO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIOiuoeeulyBiaXQg6IyD5Zu0XHJcbiAqIOmdoOWJjeWumuS5ieeahOaYryBMU0LvvIzpnaDlkI7lrprkuYnnmoTmmK8gTVNCXHJcbiAqL1xyXG5mdW5jdGlvbiBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGRzOiBCaXRGaWVsZFtdKTogdm9pZCB7XHJcbiAgbGV0IGN1cnJlbnRMc2IgPSAwO1xyXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XHJcbiAgICBmaWVsZC5sc2IgPSBjdXJyZW50THNiO1xyXG4gICAgZmllbGQubXNiID0gY3VycmVudExzYiArIGZpZWxkLndpZHRoIC0gMTtcclxuICAgIGN1cnJlbnRMc2IgPSBmaWVsZC5tc2IgKyAxO1xyXG4gICAgaWYgKCFmaWVsZC5pc1JlZmVyZW5jZSAmJiBmaWVsZC5jaGlsZHJlbiAmJiBmaWVsZC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZC5jaGlsZHJlbik7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICog5b2T5a2Q5a2X5q615oC75L2N5a695LiN5aSf5pe277yM5ZyoIE1TQiDnq6/oh6rliqjooaUgcmVzZXJ2ZWRcclxuICovXHJcbmZ1bmN0aW9uIGF1dG9GaWxsUmVzZXJ2ZWQoZmllbGRzOiBCaXRGaWVsZFtdLCBwYXJlbnRXaWR0aDogbnVtYmVyKTogdm9pZCB7XHJcbiAgY29uc3QgdG90YWxDaGlsZFdpZHRoID0gZmllbGRzLnJlZHVjZSgoc3VtLCBmKSA9PiBzdW0gKyBmLndpZHRoLCAwKTtcclxuICBjb25zdCByZW1haW5pbmcgPSBwYXJlbnRXaWR0aCAtIHRvdGFsQ2hpbGRXaWR0aDtcclxuICBpZiAocmVtYWluaW5nID4gMCkge1xyXG4gICAgY29uc3QgcmVzZXJ2ZWQ6IEJpdEZpZWxkID0ge1xyXG4gICAgICBuYW1lOiAncmVzZXJ2ZWQnLFxyXG4gICAgICB3aWR0aDogcmVtYWluaW5nLFxyXG4gICAgICBtc2I6IDAsXHJcbiAgICAgIGxzYjogMCxcclxuICAgICAgaXNSZXNlcnZlZDogdHJ1ZSxcclxuICAgICAgaXNSZWZlcmVuY2U6IGZhbHNlLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcbiAgICBmaWVsZHMucHVzaChyZXNlcnZlZCk7XHJcbiAgICBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGRzKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDpqozor4HkvY3lrr1cclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlQml0V2lkdGhzKGZpZWxkczogQml0RmllbGRbXSwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcclxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xyXG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcclxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IGNoaWxkcmVuV2lkdGggPSBjaGlsZHJlbi5yZWR1Y2UoKHN1bSwgY2hpbGQpID0+IHN1bSArIGNoaWxkLndpZHRoLCAwKTtcclxuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xyXG4gICAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICAgIGxpbmU6IDAsXHJcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXHJcbiAgICAgICAgICBzdWdnZXN0aW9uOiBg54i25a2X5q61OiAke2ZpZWxkLndpZHRofS1iaXQsIOWtkOWtl+auteaAu+WSjDogJHtjaGlsZHJlbldpZHRofS1iaXQsIOWJqeS9meepuumXtDogJHtmaWVsZC53aWR0aCAtIGNoaWxkcmVuV2lkdGh9LWJpdGBcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICB2YWxpZGF0ZUJpdFdpZHRocyhjaGlsZHJlbiwgZXJyb3JzKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwiLyoqXHJcbiAqIOminOiJsuaWueahiFxyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFN2Z1RoZW1lID0gJ3Bhc3RlbCcgfCAndml2aWQnIHwgJ21vbm8nO1xyXG5cclxuLy8g5Li76Imy77yI6aG25bGC5a2X5q6177yJ4oCUIOaflOWSjOa1heiJslxyXG5jb25zdCBQQVNURUxfQ09MT1JTID0gW1xyXG4gICcjQjNENEYwJywgLy8g5rWF6JOdXHJcbiAgJyNCOEUwQjgnLCAvLyDmtYXnu79cclxuICAnI0Y1RDZBOCcsIC8vIOa1heapmVxyXG4gICcjRDRCOEU4JywgLy8g5rWF57SrXHJcbiAgJyNBOEUwRDYnLCAvLyDmtYXpnZJcclxuICAnI0YwQjhCOCcsIC8vIOa1hee6olxyXG5dO1xyXG5cclxuLy8g6bKc6Imz6ImyXHJcbmNvbnN0IFZJVklEX0NPTE9SUyA9IFtcclxuICAnIzVCOUJENScsIC8vIOiTnVxyXG4gICcjNzBBRDQ3JywgLy8g57u/XHJcbiAgJyNFRDdEMzEnLCAvLyDmqZlcclxuICAnIzlCNTlCNicsIC8vIOe0q1xyXG4gICcjMUFCQzlDJywgLy8g6Z2SXHJcbiAgJyNFNzRDM0MnLCAvLyDnuqJcclxuXTtcclxuXHJcbi8vIOeBsOW6puiJslxyXG5jb25zdCBNT05PX0NPTE9SUyA9IFtcclxuICAnI0MwQzBDMCcsIC8vIOa1heeBsFxyXG4gICcjQThBOEE4JywgLy8g5Lit54GwXHJcbiAgJyNEMEQwRDAnLCAvLyDkuq7ngbBcclxuICAnI0IwQjBCMCcsIC8vIOmTtueBsFxyXG4gICcjQzhDOEM4JywgLy8g5reh54GwXHJcbiAgJyNCOEI4QjgnLCAvLyDmmpfpk7ZcclxuXTtcclxuXHJcbmNvbnN0IFRIRU1FX01BUDogUmVjb3JkPFN2Z1RoZW1lLCBzdHJpbmdbXT4gPSB7XHJcbiAgcGFzdGVsOiBQQVNURUxfQ09MT1JTLFxyXG4gIHZpdmlkOiBWSVZJRF9DT0xPUlMsXHJcbiAgbW9ubzogTU9OT19DT0xPUlMsXHJcbn07XHJcblxyXG4vLyDkv53nlZnoibJcclxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0U4RThFOCc7XHJcblxyXG4vKipcclxuICog6I635Y+W5a2X5q616aKc6ImyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmllbGRDb2xvcihpbmRleDogbnVtYmVyLCBpc1Jlc2VydmVkOiBib29sZWFuLCBkZXB0aDogbnVtYmVyID0gMCwgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcpOiBzdHJpbmcge1xyXG4gIGlmIChpc1Jlc2VydmVkKSB7XHJcbiAgICByZXR1cm4gUkVTRVJWRURfQ09MT1I7XHJcbiAgfVxyXG5cclxuICBjb25zdCBwYWxldHRlID0gVEhFTUVfTUFQW3RoZW1lXSB8fCBQQVNURUxfQ09MT1JTO1xyXG4gIGNvbnN0IGJhc2VDb2xvciA9IHBhbGV0dGVbaW5kZXggJSBwYWxldHRlLmxlbmd0aF07XHJcblxyXG4gIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIGJhc2VDb2xvcjtcclxuICB9XHJcblxyXG4gIC8vIOWtkOWtl+aute+8muWfuuS6jueItuiJsuiwg+aVtOS6ruW6plxyXG4gIHJldHVybiBhZGp1c3RCcmlnaHRuZXNzKGJhc2VDb2xvciwgZGVwdGggKiAxMCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDosIPmlbTpopzoibLkuq7luqZcclxuICovXHJcbmZ1bmN0aW9uIGFkanVzdEJyaWdodG5lc3MoaGV4OiBzdHJpbmcsIHBlcmNlbnQ6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgaGV4ID0gaGV4LnJlcGxhY2UoJyMnLCAnJyk7XHJcblxyXG4gIGNvbnN0IHIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDAsIDIpLCAxNik7XHJcbiAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMiwgNCksIDE2KTtcclxuICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZyg0LCA2KSwgMTYpO1xyXG5cclxuICBjb25zdCBhZGp1c3QgPSAoY2hhbm5lbDogbnVtYmVyKSA9PiB7XHJcbiAgICBjb25zdCBhZGp1c3RlZCA9IE1hdGgucm91bmQoY2hhbm5lbCArICgyNTUgLSBjaGFubmVsKSAqIChwZXJjZW50IC8gMTAwKSk7XHJcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XHJcbiAgY29uc3QgbmV3RyA9IGFkanVzdChnKTtcclxuICBjb25zdCBuZXdCID0gYWRqdXN0KGIpO1xyXG5cclxuICBjb25zdCB0b0hleCA9IChuOiBudW1iZXIpID0+IG4udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgcmV0dXJuIGAjJHt0b0hleChuZXdSKX0ke3RvSGV4KG5ld0cpfSR7dG9IZXgobmV3Qil9YDtcclxufVxyXG4iLCJpbXBvcnQgdHlwZSB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xuaW1wb3J0IHsgZ2V0RmllbGRDb2xvciB9IGZyb20gJy4vY29sb3JzJztcblxuLyoqXG4gKiBTVkcg5riy5p+T6YWN572uXG4gKi9cbmludGVyZmFjZSBSZW5kZXJDb25maWcge1xuICAvKiog5oC75L2N5a69ICovXG4gIHRvdGFsV2lkdGg6IG51bWJlcjtcbiAgLyoqIOaYr+WQpue6teWQkeaOkuWIlyAqL1xuICBpc1ZlcnRpY2FsOiBib29sZWFuO1xuICAvKiog5a2X5q615qGG6auY5bqmICovXG4gIGJveEhlaWdodDogbnVtYmVyO1xuICAvKiog5a2X5L2T5aSn5bCPICovXG4gIGZvbnRTaXplOiBudW1iZXI7XG4gIC8qKiBTVkcg5Li76aKYICovXG4gIHRoZW1lOiBTdmdUaGVtZTtcbn1cblxuLyoqXG4gKiDorqHnrpflrZfmrrXmoIfnrb7miYDpnIDnmoTmnIDlsI/lrr3luqbvvIjlg4/ntKDvvIlcbiAqL1xuLyoqXG4gKiDliKTmlq3mmK/lkKblupTkvb/nlKjnurXlkJHluIPlsYBcbiAqL1xuZnVuY3Rpb24gc2hvdWxkVXNlVmVydGljYWwoZmllbGRzOiBCaXRGaWVsZFtdLCB0b3RhbFdpZHRoOiBudW1iZXIsIGZvbnRTaXplOiBudW1iZXIgPSAyMik6IGJvb2xlYW4ge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZC5pc1Jlc2VydmVkID8gJ3Jlc2VydmVkJyA6IChmaWVsZC5pc1JlZmVyZW5jZSA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcbiAgICBjb25zdCBzZWxmSGlnaCA9IGZpZWxkLndpZHRoIC0gMTtcbiAgICBjb25zdCBzZWxmTGFiZWwgPSBzZWxmSGlnaCA9PT0gMCA/IGZpZWxkTmFtZSA6IGAke2ZpZWxkTmFtZX1bJHtzZWxmSGlnaH06MF1gO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIHRvdGFsV2lkdGg7XG4gICAgY29uc3QgYm94V2lkdGggPSB3aWR0aFJhdGlvICogYXZhaWxhYmxlV2lkdGg7XG4gICAgLy8gbW9ub3NwYWNlIOWtl+espuWuvSDiiYggZm9udFNpemUgKiAwLjbvvIzpnIDpop3lpJYgKzE2IOWuuee6s+W3puWPs+epuueZvVxuICAgIGNvbnN0IG1pbldpZHRoID0gc2VsZkxhYmVsLmxlbmd0aCAqIGZvbnRTaXplICogMC42ICsgMTYgKyA4O1xuICAgIGlmIChib3hXaWR0aCA8IG1pbldpZHRoKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICog5riy5p+T5Z2X55qEIFNWRyDkvY3ln5/lm75cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrU3ZnKGJsb2NrOiBGaWVsZEJsb2NrLCB0aGVtZTogU3ZnVGhlbWUgPSAncGFzdGVsJywgYm94SGVpZ2h0OiBudW1iZXIgPSAzOCwgZm9udFNpemU6IG51bWJlciA9IDIyKTogc3RyaW5nIHtcbiAgY29uc3QgY29uZmlnOiBSZW5kZXJDb25maWcgPSB7XG4gICAgdG90YWxXaWR0aDogYmxvY2sud2lkdGgsXG4gICAgaXNWZXJ0aWNhbDogc2hvdWxkVXNlVmVydGljYWwoYmxvY2suY2hpbGRyZW4sIGJsb2NrLndpZHRoLCBmb250U2l6ZSksXG4gICAgYm94SGVpZ2h0LFxuICAgIGZvbnRTaXplLFxuICAgIHRoZW1lLFxuICB9O1xuXG4gIGlmIChjb25maWcuaXNWZXJ0aWNhbCkge1xuICAgIHJldHVybiByZW5kZXJWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgY29uZmlnKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcmVuZGVySG9yaXpvbnRhbChibG9jay5jaGlsZHJlbiwgY29uZmlnKTtcbiAgfVxufVxuXG4vKipcbiAqIOaoquWQkea4suafk1xuICovXG5mdW5jdGlvbiByZW5kZXJIb3Jpem9udGFsKGZpZWxkczogQml0RmllbGRbXSwgY29uZmlnOiBSZW5kZXJDb25maWcpOiBzdHJpbmcge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IGNvbmZpZy5ib3hIZWlnaHQgKyA2MDtcbiAgY29uc3Qgc3RhcnRYID0gNjA7XG4gIGNvbnN0IHN0YXJ0WSA9IDI1O1xuICBjb25zdCBhdmFpbGFibGVXaWR0aCA9IHN2Z1dpZHRoIC0gMTIwO1xuXG4gIGxldCBzdmcgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAke3N2Z1dpZHRofSAke3N2Z0hlaWdodH1cIiB3aWR0aD1cIjEwMCVcIj5gO1xuXG4gIGxldCBjdXJyZW50WCA9IHN0YXJ0WDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCB3aWR0aFJhdGlvID0gZmllbGQud2lkdGggLyBjb25maWcudG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCwgY29uZmlnLnRoZW1lKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIGN1cnJlbnRYLCBzdGFydFksIGJveFdpZHRoLCBjb25maWcuYm94SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplLCAnaG9yaXpvbnRhbCcpO1xuICAgIGN1cnJlbnRYICs9IGJveFdpZHRoO1xuICB9XG5cbiAgLy8gTFNCIOKGkiBNU0Ig5pa55ZCR566t5aS0XG4gIGNvbnN0IGFycm93WSA9IHN0YXJ0WSArIGNvbmZpZy5ib3hIZWlnaHQgKyAyMjtcbiAgY29uc3QgZnMgPSBjb25maWcuZm9udFNpemUgKiAwLjg1O1xuICBjb25zdCBmaWVsZExlZnQgPSBzdGFydFg7XG4gIGNvbnN0IGZpZWxkUmlnaHQgPSBzdGFydFggKyBhdmFpbGFibGVXaWR0aDtcbiAgLy8gTFNCIOWPs+Wvuem9kOWIsOWtl+auteahhuW3pui+uee8mFxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2ZpZWxkTGVmdH1cIiB5PVwiJHthcnJvd1kgKyA1fVwiIGZvbnQtc2l6ZT1cIiR7ZnN9XCIgdGV4dC1hbmNob3I9XCJlbmRcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICAvLyDnrq3lpLTmr5TlrZfmrrXmoYbnqoTkuIDngrnvvIzkuKTnq6/nlZnnqbpcbiAgY29uc3QgYXJyb3dQYWQgPSAxMDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7ZmllbGRMZWZ0ICsgYXJyb3dQYWR9XCIgeTE9XCIke2Fycm93WX1cIiB4Mj1cIiR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gOH1cIiB5Mj1cIiR7YXJyb3dZfVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZH0sJHthcnJvd1l9ICR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gMTB9LCR7YXJyb3dZIC0gNX0gJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSAxMH0sJHthcnJvd1kgKyA1fVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIC8vIE1TQiDlt6blr7npvZDliLDlrZfmrrXmoYblj7PovrnnvJhcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtmaWVsZFJpZ2h0fVwiIHk9XCIke2Fycm93WSArIDV9XCIgZm9udC1zaXplPVwiJHtmc31cIiBmaWxsPVwiIzk5OVwiPk1TQjwvdGV4dD5gO1xuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDnurXlkJHmuLLmn5PvvIh2aWV3Qm94IOWuveW6puS4juaoquWQkeS4gOiHtO+8jOS/neaMgeWtl+S9k+inhuinieWkp+Wwj+S4gOiHtO+8iVxuICovXG5mdW5jdGlvbiByZW5kZXJWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIGNvbmZpZzogUmVuZGVyQ29uZmlnKTogc3RyaW5nIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCByb3dIZWlnaHQgPSBjb25maWcuYm94SGVpZ2h0O1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gMjI7XG4gIGNvbnN0IGJveFdpZHRoID0gc3ZnV2lkdGggLSAxNjA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQgKyAyNTtcblxuICBsZXQgc3ZnID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgJHtzdmdXaWR0aH0gJHtzdmdIZWlnaHR9XCIgd2lkdGg9XCIxMDAlXCI+YDtcblxuICBsZXQgY3VycmVudFkgPSBzdGFydFk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZmllbGQgPSBmaWVsZHNbaV07XG4gICAgY29uc3QgY29sb3IgPSBnZXRGaWVsZENvbG9yKGksIGZpZWxkLmlzUmVzZXJ2ZWQsIDAsIGNvbmZpZy50aGVtZSk7XG4gICAgc3ZnICs9IHJlbmRlckZpZWxkQm94KGZpZWxkLCBzdGFydFgsIGN1cnJlbnRZLCBib3hXaWR0aCwgcm93SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplKTtcbiAgICBjdXJyZW50WSArPSByb3dIZWlnaHQ7XG4gIH1cblxuICAvLyBMU0Ig4oaSIE1TQiDmlrnlkJHnrq3lpLTvvIjnurXlkJHvvJrku47kuIrliLDkuIvvvIzmlL7lnKjlt6bkvqfmoYblpJbvvIlcbiAgY29uc3QgYXJyb3dYID0gc3RhcnRYIC0gMjQ7XG4gIGNvbnN0IGFycm93VG9wID0gc3RhcnRZO1xuICBjb25zdCBhcnJvd0JvdHRvbSA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQ7XG4gIHN2ZyArPSBgPGxpbmUgeDE9XCIke2Fycm93WH1cIiB5MT1cIiR7YXJyb3dUb3AgKyA4fVwiIHgyPVwiJHthcnJvd1h9XCIgeTI9XCIke2Fycm93Qm90dG9tIC0gOH1cIiBzdHJva2U9XCIjOTk5XCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIvPmA7XG4gIHN2ZyArPSBgPHBvbHlnb24gcG9pbnRzPVwiJHthcnJvd1h9LCR7YXJyb3dCb3R0b219ICR7YXJyb3dYIC0gNX0sJHthcnJvd0JvdHRvbSAtIDEwfSAke2Fycm93WCArIDV9LCR7YXJyb3dCb3R0b20gLSAxMH1cIiBmaWxsPVwiIzk5OVwiLz5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fycm93WH1cIiB5PVwiJHthcnJvd1RvcCAtIDR9XCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemUgKiAwLjg1fVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIiM5OTlcIj5MU0I8L3RleHQ+YDtcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHthcnJvd1h9XCIgeT1cIiR7YXJyb3dCb3R0b20gKyAxOH1cIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZSAqIDAuODV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiPk1TQjwvdGV4dD5gO1xuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDmuLLmn5PlrZfmrrXmoYZcbiAqIEBwYXJhbSBsYXlvdXREaXJlY3Rpb24g5biD5bGA5pa55ZCR77yM55So5LqO5Yaz5a6a54i25a2X5q6157Si5byV5qCH5rOo5L2N572uXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckZpZWxkQm94KFxuICBmaWVsZDogQml0RmllbGQsXG4gIHg6IG51bWJlcixcbiAgeTogbnVtYmVyLFxuICB3aWR0aDogbnVtYmVyLFxuICBoZWlnaHQ6IG51bWJlcixcbiAgY29sb3I6IHN0cmluZyxcbiAgZm9udFNpemU6IG51bWJlcixcbiAgbGF5b3V0RGlyZWN0aW9uOiAnaG9yaXpvbnRhbCcgfCAndmVydGljYWwnID0gJ3ZlcnRpY2FsJ1xuKTogc3RyaW5nIHtcbiAgbGV0IHN2ZyA9ICcnO1xuICBjb25zdCBpc1JlZiA9IGZpZWxkLmlzUmVmZXJlbmNlO1xuICBjb25zdCBpc1JzdiA9IGZpZWxkLmlzUmVzZXJ2ZWQ7XG4gIGNvbnN0IGZpZWxkTmFtZSA9IGlzUnN2ID8gJ3Jlc2VydmVkJyA6IChpc1JlZiA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcblxuICBjb25zdCBzdHJva2VDb2xvciA9IGlzUmVmID8gJyM0QTkwRDknIDogJyNmZmYnO1xuICBzdmcgKz0gYDxyZWN0IHg9XCIke3h9XCIgeT1cIiR7eX1cIiB3aWR0aD1cIiR7d2lkdGh9XCIgaGVpZ2h0PVwiJHtoZWlnaHR9XCIgZmlsbD1cIiR7Y29sb3J9XCIgc3Ryb2tlPVwiJHtzdHJva2VDb2xvcn1cIiBzdHJva2Utd2lkdGg9XCIyXCIgcng9XCI0XCIgcnk9XCI0XCIgZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCIvPmA7XG5cbiAgLy8g5qGG5YaF77ya5a2X5q616Ieq6Lqr57Si5byVIFt3aWR0aC0xOjBd77yM5Y2VIGJpdCDlrZfmrrXnnIHnlaXntKLlvJVcbiAgY29uc3Qgc2VsZkhpZ2ggPSBmaWVsZC53aWR0aCAtIDE7XG4gIGNvbnN0IHNlbGZMYWJlbCA9IHNlbGZIaWdoID09PSAwID8gZmllbGROYW1lIDogYCR7ZmllbGROYW1lfVske3NlbGZIaWdofTowXWA7XG4gIGNvbnN0IHRleHRYID0geCArIHdpZHRoIC8gMjtcbiAgY29uc3QgdGV4dFkgPSB5ICsgaGVpZ2h0IC8gMjtcbiAgY29uc3QgdGV4dFdpZHRoID0gd2lkdGggLSAxNjtcbiAgY29uc3QgbWF4Q2hhcnMgPSBNYXRoLmZsb29yKHRleHRXaWR0aCAvIChmb250U2l6ZSAqIDAuNikpO1xuXG4gIGxldCBkaXNwbGF5VGV4dCA9IHNlbGZMYWJlbDtcbiAgaWYgKHNlbGZMYWJlbC5sZW5ndGggPiBtYXhDaGFycyAmJiBtYXhDaGFycyA+IDMpIHtcbiAgICBkaXNwbGF5VGV4dCA9IHNlbGZMYWJlbC5zdWJzdHJpbmcoMCwgbWF4Q2hhcnMgLSAyKSArICcuLic7XG4gIH1cblxuICBjb25zdCB0ZXh0RGVjb3JhdGlvbiA9ICcnO1xuICBjb25zdCBmaWxsQ29sb3IgPSBpc1JzdiA/ICcjODg4JyA6ICcjMzMzJztcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHt0ZXh0WH1cIiB5PVwiJHt0ZXh0WX1cIiBmb250LXNpemU9XCIke2ZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZHk9XCIwLjM1ZW1cIiBmaWxsPVwiJHtmaWxsQ29sb3J9XCIgZm9udC1mYW1pbHk9XCJtb25vc3BhY2VcIiR7dGV4dERlY29yYXRpb259IGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiPiR7ZGlzcGxheVRleHR9PC90ZXh0PmA7XG5cbiAgLy8g5qGG5aSW77ya54i25a2X5q6157Si5byVIFttc2I6bHNiXe+8jOeBsOiJsuWwj+Wtl1xuICBjb25zdCBwYXJlbnRIaWdoID0gZmllbGQubXNiO1xuICBjb25zdCBwYXJlbnRMb3cgPSBmaWVsZC5sc2I7XG4gIGNvbnN0IHBhcmVudExhYmVsID0gcGFyZW50SGlnaCA9PT0gcGFyZW50TG93ID8gYFske3BhcmVudEhpZ2h9XWAgOiBgWyR7cGFyZW50SGlnaH06JHtwYXJlbnRMb3d9XWA7XG4gIGNvbnN0IGFubm90YXRpb25Gb250U2l6ZSA9IGZvbnRTaXplICogMC43O1xuXG4gIGlmIChsYXlvdXREaXJlY3Rpb24gPT09ICd2ZXJ0aWNhbCcpIHtcbiAgICAvLyDnurXlkJHvvJrmoIfms6jlnKjlj7PkvqfvvIzlt6blr7npvZDvvIjlt6bkvqfnqbrpl7TkuI3otrPml7YgMyDkvY3mlbDlrZfmoIfms6jkuI3kvJrooqsgdmlld0JveCDoo4HliarvvIlcbiAgICBjb25zdCBhbm5vdFggPSB4ICsgd2lkdGggKyA4O1xuICAgIGNvbnN0IGFubm90WSA9IHRleHRZO1xuICAgIHN2ZyArPSBgPHRleHQgeD1cIiR7YW5ub3RYfVwiIHk9XCIke2Fubm90WX1cIiBmb250LXNpemU9XCIke2Fubm90YXRpb25Gb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cInN0YXJ0XCIgZHk9XCIwLjM1ZW1cIiBmaWxsPVwiIzk5OVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCI+JHtwYXJlbnRMYWJlbH08L3RleHQ+YDtcbiAgfSBlbHNlIHtcbiAgICAvLyDmqKrlkJHvvJrmoIfms6jlnKjkuIrmlrnvvIzlsYXkuK1cbiAgICBjb25zdCBhbm5vdFggPSB0ZXh0WDtcbiAgICBjb25zdCBhbm5vdFkgPSB5IC0gODtcbiAgICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fubm90WH1cIiB5PVwiJHthbm5vdFl9XCIgZm9udC1zaXplPVwiJHthbm5vdGF0aW9uRm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCI+JHtwYXJlbnRMYWJlbH08L3RleHQ+YDtcbiAgfVxuXG4gIHJldHVybiBzdmc7XG59XG4iLCJpbXBvcnQgdHlwZSB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG5jb25zdCBUQUJMRV9DTEFTUyA9ICdiZi10YWJsZSc7XHJcbmNvbnN0IFJPV19SRVNFUlZFRCA9ICdiZi1yb3ctcmVzZXJ2ZWQnO1xyXG5jb25zdCBST1dfUkVGID0gJ2JmLXJvdy1yZWYnO1xyXG5jb25zdCBSRUZfTElOSyA9ICdiZi1yZWYtbGluayc7XHJcblxyXG4vKipcclxuICog5riy5p+T5Z2X55qEIEhUTUwg6KGo5qC8XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tUYWJsZShibG9jazogRmllbGRCbG9jayk6IHN0cmluZyB7XHJcbiAgY29uc3Qgcm93czogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jaGlsZHJlbikge1xyXG4gICAgY29sbGVjdFJvd3MoY2hpbGQsIDAsIHJvd3MpO1xyXG4gIH1cclxuXHJcbiAgbGV0IGh0bWwgPSBgPHRhYmxlIGNsYXNzPVwiJHtUQUJMRV9DTEFTU31cIj5gO1xyXG4gIGh0bWwgKz0gJzx0aGVhZD48dHI+JztcclxuICBodG1sICs9ICc8dGg+RmllbGQ8L3RoPic7XHJcbiAgaHRtbCArPSAnPHRoPldpZHRoPC90aD4nO1xyXG4gIGh0bWwgKz0gJzx0aD5CaXQgUmFuZ2U8L3RoPic7XHJcbiAgaHRtbCArPSAnPHRoPkRlc2NyaXB0aW9uPC90aD4nO1xyXG4gIGh0bWwgKz0gJzwvdHI+PC90aGVhZD4nO1xyXG4gIGh0bWwgKz0gJzx0Ym9keT4nO1xyXG4gIGh0bWwgKz0gcm93cy5qb2luKCcnKTtcclxuICBodG1sICs9ICc8L3Rib2R5PjwvdGFibGU+JztcclxuICByZXR1cm4gaHRtbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIOmAkuW9kuaUtumbhuihqOagvOihjFxyXG4gKi9cclxuZnVuY3Rpb24gY29sbGVjdFJvd3MoZmllbGQ6IEJpdEZpZWxkLCBkZXB0aDogbnVtYmVyLCByb3dzOiBzdHJpbmdbXSk6IHZvaWQge1xyXG4gIGNvbnN0IGluZGVudCA9IGRlcHRoID4gMCA/ICcmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsnLnJlcGVhdChkZXB0aCkgOiAnJztcclxuICBjb25zdCBpc1JlZiA9IGZpZWxkLmlzUmVmZXJlbmNlO1xyXG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcclxuICBjb25zdCBuYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xyXG4gIGNvbnN0IGJpdFJhbmdlID0gYFske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XHJcbiAgY29uc3QgZGVzY3JpcHRpb24gPSBmaWVsZC5kZXNjcmlwdGlvbiB8fCAnJztcclxuXHJcbiAgbGV0IHJvd0NsYXNzID0gJyc7XHJcbiAgaWYgKGlzUnN2KSByb3dDbGFzcyA9IGAgY2xhc3M9XCIke1JPV19SRVNFUlZFRH1cImA7XHJcbiAgZWxzZSBpZiAoaXNSZWYpIHJvd0NsYXNzID0gYCBjbGFzcz1cIiR7Uk9XX1JFRn1cImA7XHJcblxyXG4gIGNvbnN0IG5hbWVDZWxsID0gaXNSZWZcclxuICAgID8gYDxhIGhyZWY9XCIjXCIgY2xhc3M9XCIke1JFRl9MSU5LfVwiIGRhdGEtdGFyZ2V0PVwiJHtmaWVsZC5yZWZOYW1lfVwiPiR7aW5kZW50fSR7bmFtZX08L2E+YFxyXG4gICAgOiBgJHtpbmRlbnR9JHtuYW1lfWA7XHJcblxyXG4gIHJvd3MucHVzaChgPHRyJHtyb3dDbGFzc30+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtuYW1lQ2VsbH08L3RkPmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7ZmllbGQud2lkdGh9PC90ZD5gKTtcclxuICByb3dzLnB1c2goYDx0ZD4ke2JpdFJhbmdlfTwvdGQ+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtkZXNjcmlwdGlvbn08L3RkPmApO1xyXG4gIHJvd3MucHVzaCgnPC90cj4nKTtcclxuXHJcbiAgaWYgKGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZmllbGQuY2hpbGRyZW4pIHtcclxuICAgICAgY29sbGVjdFJvd3MoY2hpbGQsIGRlcHRoICsgMSwgcm93cyk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB0eXBlIHsgQXBwIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB0eXBlIEJpdGZpZWxkUGx1Z2luIGZyb20gJy4vbWFpbic7XG5pbXBvcnQgdHlwZSB7IFRhYmxlVGhlbWUsIFBsdWdpbkRhdGEgYXMgUGx1Z2luRGF0YVR5cGVzIH0gZnJvbSAnLi9tYWluJztcbmltcG9ydCB7IERFRkFVTFRfREFUQSB9IGZyb20gJy4vbWFpbic7XG5pbXBvcnQgdHlwZSB7IFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xuXG5jb25zdCBUQUJMRV9USEVNRV9MQUJFTFM6IFJlY29yZDxUYWJsZVRoZW1lLCBzdHJpbmc+ID0ge1xuICBkZWZhdWx0OiAnRGVmYXVsdCDigJQgZ3JpZCBsaW5lcywgZ3JheSBoZWFkZXInLFxuICBtaW5pbWFsOiAnTWluaW1hbCDigJQgaG9yaXpvbnRhbCBsaW5lcyBvbmx5JyxcbiAgemVicmE6ICdaZWJyYSDigJQgYWx0ZXJuYXRpbmcgcm93IGNvbG9ycycsXG4gIGNsZWFuOiAnQ2xlYW4g4oCUIG5vIGJvcmRlcnMsIHdoaXRlc3BhY2Ugc2VwYXJhdGlvbicsXG4gICdkYXJrLWhlYWRlcic6ICdEYXJrIEhlYWRlciDigJQgZGFyayBoZWFkZXIsIGNsZWFuIGJvZHknLFxufTtcblxuY29uc3QgU1ZHX1RIRU1FX0xBQkVMUzogUmVjb3JkPFN2Z1RoZW1lLCBzdHJpbmc+ID0ge1xuICBwYXN0ZWw6ICdQYXN0ZWwg4oCUIHNvZnQgcGFzdGVsIGNvbG9ycycsXG4gIHZpdmlkOiAnVml2aWQg4oCUIGJvbGQgc2F0dXJhdGVkIGNvbG9ycycsXG4gIG1vbm86ICdNb25vIOKAlCBncmF5c2NhbGUnLFxufTtcblxuZXhwb3J0IGNsYXNzIEJpdGZpZWxkU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IEJpdGZpZWxkUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IEJpdGZpZWxkUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0SGVhZGluZygpO1xuXG4gICAgLy8gU1ZHIOS4u+mimFxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1NWRyB0aGVtZScpXG4gICAgICAuc2V0RGVzYygnQ29sb3Igc2NoZW1lIGZvciBiaXRmaWVsZCBkaWFncmFtcycpXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcCA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgbGFiZWxdIG9mIE9iamVjdC5lbnRyaWVzKFNWR19USEVNRV9MQUJFTFMpKSB7XG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgICAgZHJvcC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnKTtcbiAgICAgICAgZHJvcC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnW2JpdGZpZWxkIHNldHRpbmdzXSBkcm9wZG93biBjaGFuZ2VkIHN2Z1RoZW1lOicsIHZhbHVlKTtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z1RoZW1lID0gdmFsdWUgYXMgU3ZnVGhlbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4ucGx1Z2luRGF0YSk7XG4gICAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdiZi1zZXR0aW5ncy1jaGFuZ2VkJykpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8gU1ZHIOihjOmrmFxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1NWRyByb3cgaGVpZ2h0JylcbiAgICAgIC5zZXREZXNjKCdIZWlnaHQgb2YgZWFjaCBmaWVsZCByb3cgaW4gYml0ZmllbGQgZGlhZ3JhbXMgKHB4KScpXG4gICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiB7XG4gICAgICAgIHNsaWRlci5zZXRMaW1pdHMoMjgsIDgwLCAyKTtcbiAgICAgICAgc2xpZGVyLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDM4KTtcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdbYml0ZmllbGQgc2V0dGluZ3NdIHNsaWRlciBjaGFuZ2VkIHN2Z0JveEhlaWdodDonLCB2YWx1ZSk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhKTtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ2JmLXNldHRpbmdzLWNoYW5nZWQnKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAvLyBTVkcg5a2X5L2T5aSn5bCPXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnU1ZHIGZvbnQgc2l6ZScpXG4gICAgICAuc2V0RGVzYygnRm9udCBzaXplIGZvciBmaWVsZCBsYWJlbHMgaW4gYml0ZmllbGQgZGlhZ3JhbXMgKHB4KScpXG4gICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiB7XG4gICAgICAgIHNsaWRlci5zZXRMaW1pdHMoMTQsIDM2LCAxKTtcbiAgICAgICAgc2xpZGVyLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEuc3ZnRm9udFNpemUgfHwgMjIpO1xuICAgICAgICBzbGlkZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1tiaXRmaWVsZCBzZXR0aW5nc10gc2xpZGVyIGNoYW5nZWQgc3ZnRm9udFNpemU6JywgdmFsdWUpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpbkRhdGEuc3ZnRm9udFNpemUgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhKTtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ2JmLXNldHRpbmdzLWNoYW5nZWQnKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAvLyDooajmoLzkuLvpophcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdUYWJsZSB0aGVtZScpXG4gICAgICAuc2V0RGVzYygnVmlzdWFsIHN0eWxlIGZvciByZW5kZXJlZCB0YWJsZXMnKVxuICAgICAgLmFkZERyb3Bkb3duKGRyb3AgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIGxhYmVsXSBvZiBPYmplY3QuZW50cmllcyhUQUJMRV9USEVNRV9MQUJFTFMpKSB7XG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgICAgZHJvcC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnRhYmxlVGhlbWUgfHwgJ2RlZmF1bHQnKTtcbiAgICAgICAgZHJvcC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnW2JpdGZpZWxkIHNldHRpbmdzXSBkcm9wZG93biBjaGFuZ2VkIHRhYmxlVGhlbWU6JywgdmFsdWUpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpbkRhdGEudGFibGVUaGVtZSA9IHZhbHVlIGFzIFRhYmxlVGhlbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4ucGx1Z2luRGF0YSk7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1tiaXRmaWVsZCBzZXR0aW5nc10gc2F2ZURhdGEgY29tcGxldGVkJyk7XG4gICAgICAgICAgLy8g6Kem5Y+R5YWo5bGA5LqL5Lu277yM6K6p5o+S5Lu26YeN57uY5omA5pyJ5Z2XXG4gICAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdiZi1zZXR0aW5ncy1jaGFuZ2VkJykpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8g6KGo5qC86KGM6auYXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnVGFibGUgcm93IGhlaWdodCcpXG4gICAgICAuc2V0RGVzYygnUm93IGhlaWdodCBmb3IgcmVuZGVyZWQgdGFibGVzIChweCknKVxuICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4ge1xuICAgICAgICBzbGlkZXIuc2V0TGltaXRzKDE4LCA0OCwgMik7XG4gICAgICAgIHNsaWRlci5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0IHx8IDI4KTtcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdbYml0ZmllbGQgc2V0dGluZ3NdIHNsaWRlciBjaGFuZ2VkIHRhYmxlUm93SGVpZ2h0OicsIHZhbHVlKTtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0ID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4ucGx1Z2luRGF0YSk7XG4gICAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdiZi1zZXR0aW5ncy1jaGFuZ2VkJykpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8g6KGo5qC85a2X5L2T5aSn5bCPXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnVGFibGUgZm9udCBzaXplJylcbiAgICAgIC5zZXREZXNjKCdGb250IHNpemUgZm9yIHJlbmRlcmVkIHRhYmxlcyAocHgpJylcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHtcbiAgICAgICAgc2xpZGVyLnNldExpbWl0cygxMCwgMjQsIDEpO1xuICAgICAgICBzbGlkZXIuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luRGF0YS50YWJsZUZvbnRTaXplIHx8IDE0KTtcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdbYml0ZmllbGQgc2V0dGluZ3NdIHNsaWRlciBjaGFuZ2VkIHRhYmxlRm9udFNpemU6JywgdmFsdWUpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpbkRhdGEudGFibGVGb250U2l6ZSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEpO1xuICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnYmYtc2V0dGluZ3MtY2hhbmdlZCcpKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxufVxuIiwiaW1wb3J0IHR5cGUgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0IH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgUGx1Z2luLCBzYW5pdGl6ZUhUTUxUb0RvbSB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi9wYXJzZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tTdmcgfSBmcm9tICcuL3N2Z1JlbmRlcmVyJztcbmltcG9ydCB7IHJlbmRlckJsb2NrVGFibGUgfSBmcm9tICcuL3RhYmxlUmVuZGVyZXInO1xuaW1wb3J0IHR5cGUgeyBSZWdpc3RyeUVudHJ5LCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBCaXRmaWVsZFNldHRpbmdUYWIgfSBmcm9tICcuL3NldHRpbmdzJztcbmltcG9ydCB0eXBlIHsgU3ZnVGhlbWUgfSBmcm9tICcuL2NvbG9ycyc7XG5cbmNvbnN0IE9MRF9QTFVHSU5fSUQgPSAndmVyaWxvZy1iaXRmaWVsZCc7XG5cbmNvbnN0IENTUyA9IHtcbiAgY29udGFpbmVyOiAnYmYtY29udGFpbmVyJyxcbiAgaGVhZGVyUm93OiAnYmYtaGVhZGVyLXJvdycsXG4gIGhlYWRlcjogJ2JmLWhlYWRlcicsXG4gIGNvbnRlbnQ6ICdiZi1jb250ZW50JyxcbiAgc3ZnOiAnYmYtc3ZnJyxcbiAgdGFibGVDb250YWluZXI6ICdiZi10YWJsZS1jb250YWluZXInLFxuICB0YWJsZTogJ2JmLXRhYmxlJyxcbiAgZXJyb3I6ICdiZi1lcnJvcicsXG4gIHRvZ2dsZUJ0bjogJ2JmLXZpZXctdG9nZ2xlJyxcbiAgdG9nZ2xlT3B0aW9uOiAnYmYtdG9nZ2xlLW9wdGlvbicsXG4gIHRvZ2dsZUFjdGl2ZTogJ2JmLXRvZ2dsZS1hY3RpdmUnLFxuICB0b29sdGlwOiAnYmYtdG9vbHRpcCcsXG4gIHRvb2x0aXBIZWFkZXI6ICdiZi10b29sdGlwLWhlYWRlcicsXG4gIHRvb2x0aXBTdmc6ICdiZi10b29sdGlwLXN2ZycsXG4gIHRvb2x0aXBUYWJsZTogJ2JmLXRvb2x0aXAtdGFibGUnLFxuICB0b29sdGlwSGludDogJ2JmLXRvb2x0aXAtaGludCcsXG4gIHJlZkxpbms6ICdiZi1yZWYtbGluaycsXG4gIHJlZlVucmVzb2x2ZWQ6ICdiZi1yZWYtdW5yZXNvbHZlZCcsXG4gIGhpZ2hsaWdodDogJ2JmLWhpZ2hsaWdodCcsXG4gIHJvd1JlZjogJ2JmLXJvdy1yZWYnLFxuICByb3dSZXNlcnZlZDogJ2JmLXJvdy1yZXNlcnZlZCcsXG59O1xuXG5leHBvcnQgdHlwZSBUYWJsZVRoZW1lID0gJ2RlZmF1bHQnIHwgJ21pbmltYWwnIHwgJ3plYnJhJyB8ICdjbGVhbicgfCAnZGFyay1oZWFkZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIFBsdWdpbkRhdGEge1xuICBkZWZhdWx0Vmlldz86ICdzdmcnIHwgJ3RhYmxlJztcbiAgdGFibGVUaGVtZT86IFRhYmxlVGhlbWU7XG4gIHN2Z1RoZW1lPzogU3ZnVGhlbWU7XG4gIHN2Z0JveEhlaWdodD86IG51bWJlcjtcbiAgc3ZnRm9udFNpemU/OiBudW1iZXI7XG4gIHRhYmxlRm9udFNpemU/OiBudW1iZXI7XG4gIHRhYmxlUm93SGVpZ2h0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9EQVRBOiBQbHVnaW5EYXRhID0geyBkZWZhdWx0VmlldzogJ3N2ZycsIHRhYmxlVGhlbWU6ICdkZWZhdWx0Jywgc3ZnVGhlbWU6ICdwYXN0ZWwnLCBzdmdCb3hIZWlnaHQ6IDM4LCBzdmdGb250U2l6ZTogMjIsIHRhYmxlRm9udFNpemU6IDE0LCB0YWJsZVJvd0hlaWdodDogMjggfTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQml0ZmllbGRQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcml2YXRlIGJsb2NrUmVnaXN0cnk6IE1hcDxzdHJpbmcsIFJlZ2lzdHJ5RW50cnk+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIHBlbmRpbmdSZWZzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0YXJnZXROYW1lOiBzdHJpbmcgfVtdID0gW107XG4gIHByaXZhdGUgY3VycmVudE5vdGVQYXRoOiBzdHJpbmcgPSAnJztcbiAgcHJpdmF0ZSBhY3RpdmVUb29sdGlwOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHRvb2x0aXBSZW1vdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBwbHVnaW5EYXRhOiBQbHVnaW5EYXRhID0gREVGQVVMVF9EQVRBO1xuICBwcml2YXRlIHN0eWxlc0luamVjdGVkID0gZmFsc2U7XG5cbiAgLy8gcHVibGljIGFjY2Vzc29yIGZvciBTZXR0aW5nVGFiXG4gIGdldCBzYXZlZERhdGEoKTogUGx1Z2luRGF0YSB7IHJldHVybiB0aGlzLnBsdWdpbkRhdGE7IH1cbiAgc2V0IHNhdmVkRGF0YSh2OiBQbHVnaW5EYXRhKSB7IHRoaXMucGx1Z2luRGF0YSA9IHY7IH1cblxuICAvKiogRXhwb3NlIGFzIGBzZXR0aW5nc2Agc28gT2JzaWRpYW4ncyBQbHVnaW5TZXR0aW5nVGFiLmdldENvbnRyb2xWYWx1ZSgpIGRvZXNuJ3QgY3Jhc2ggKi9cbiAgZ2V0IHNldHRpbmdzKCk6IFBsdWdpbkRhdGEgeyByZXR1cm4gdGhpcy5wbHVnaW5EYXRhOyB9XG4gIHNldCBzZXR0aW5ncyh2OiBQbHVnaW5EYXRhKSB7IHRoaXMucGx1Z2luRGF0YSA9IHY7IH1cblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgLy8g6L+B56e75pen5o+S5Lu255qE5pWw5o2uXG4gICAgY29uc3QgbWlncmF0ZWQgPSBhd2FpdCB0aGlzLm1pZ3JhdGVEYXRhKCk7XG4gICAgdGhpcy5wbHVnaW5EYXRhID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9EQVRBLCAoYXdhaXQgdGhpcy5sb2FkRGF0YSgpKSBhcyBQbHVnaW5EYXRhKTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IEJpdGZpZWxkU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcignYml0ZmllbGQnLCB0aGlzLnByb2Nlc3NCaXRmaWVsZC5iaW5kKHRoaXMpKTtcbiAgICAvLyDlupTnlKjkv53lrZjnmoTooajmoLzooYzpq5jjgIHlrZfkvZPlkozkuLvpophcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYmYtdGFibGUtcm93LWhlaWdodCcsIGAke3RoaXMucGx1Z2luRGF0YS50YWJsZVJvd0hlaWdodCB8fCAyOH1weGApO1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1iZi10YWJsZS1mb250LXNpemUnLCBgJHt0aGlzLnBsdWdpbkRhdGEudGFibGVGb250U2l6ZSB8fCAxNH1weGApO1xuICAgIHRoaXMuaW5qZWN0VGFibGVTdHlsZXMoKTtcbiAgICAvLyBBcHBseSBzYXZlZCB0aGVtZSB0byBleGlzdGluZyBibG9ja3MgKGlmIGFueSByZS1yZW5kZXJlZClcbiAgICB0aGlzLmFwcGx5VGFibGVUaGVtZSh0aGlzLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xuICB9XG5cbiAgLyoqIEFwcGx5IHRhYmxlIHRoZW1lIHRvIGFsbCByZW5kZXJlZCBibG9ja3MgKi9cbiAgcHJpdmF0ZSBhcHBseVRhYmxlVGhlbWUodGhlbWU6IFRhYmxlVGhlbWUpOiB2b2lkIHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYmYtdGFibGUtY29udGFpbmVyJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGVtZSk7XG4gICAgfSk7XG4gIH1cblxuICAvKiog5LuO5pen5o+S5Lu25ZCN6L+B56e75pWw5o2u5Yiw5paw5o+S5Lu2ICovXG4gIHByaXZhdGUgYXN5bmMgbWlncmF0ZURhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcGx1Z2luRGF0YSA9IGF3YWl0IHRoaXMubG9hZERhdGEoKSBhcyBQbHVnaW5EYXRhIHwgbnVsbDtcbiAgICBpZiAocGx1Z2luRGF0YSAmJiBPYmplY3Qua2V5cyhwbHVnaW5EYXRhKS5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZ0RpciA9IHRoaXMuYXBwLnZhdWx0LmNvbmZpZ0RpcjtcbiAgICBjb25zdCBvbGREYXRhRmlsZSA9IGAke2NvbmZpZ0Rpcn0vcGx1Z2lucy8ke09MRF9QTFVHSU5fSUR9L2RhdGEuanNvbmA7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9sZFJhdyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIucmVhZChvbGREYXRhRmlsZSk7XG4gICAgICBpZiAob2xkUmF3KSB7XG4gICAgICAgIGNvbnN0IG9sZERhdGEgPSBKU09OLnBhcnNlKG9sZFJhdykgYXMgUGx1Z2luRGF0YTtcbiAgICAgICAgaWYgKG9sZERhdGEgJiYgT2JqZWN0LmtleXMob2xkRGF0YSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEob2xkRGF0YSk7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1tiaXRmaWVsZF0gTWlncmF0ZWQgc2V0dGluZ3MgZnJvbSBvbGQgcGx1Z2luJyk7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIOaXp+aPkuS7tuebruW9leS4jeWtmOWcqOaIluivu+WPluWksei0pe+8jOW/veeVpVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIGluamVjdFRhYmxlU3R5bGVzKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnN0eWxlc0luamVjdGVkKSByZXR1cm47XG4gICAgdGhpcy5zdHlsZXNJbmplY3RlZCA9IHRydWU7XG5cbiAgICBjb25zdCBjc3MgPSBgXG4gICAgICAvKiDooajmoLzmoLflvI8g4oCUIOeUqCAubWFya2Rvd24tcHJldmlldy12aWV3IOmZkOWumuS9nOeUqOWfn++8jOehruS/neS8mOWFiOS6jiBPYnNpZGlhbiDkuLvpopjmoLflvI8gKi9cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUge1xuICAgICAgICB3aWR0aDogMTAwJTsgYm9yZGVyLWNvbGxhcHNlOiBjb2xsYXBzZTsgdGFibGUtbGF5b3V0OiBhdXRvO1xuICAgICAgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGQsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGgsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGQge1xuICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjZGRkOyBwYWRkaW5nOiAwIDhweDsgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgICAgICBsaW5lLWhlaWdodDogdmFyKC0tYmYtdGFibGUtcm93LWhlaWdodCwgMjhweCk7IGZvbnQtc2l6ZTogdmFyKC0tYmYtdGFibGUtZm9udC1zaXplLCAxNHB4KTtcbiAgICAgICAgaGVpZ2h0OiB2YXIoLS1iZi10YWJsZS1yb3ctaGVpZ2h0LCAyOHB4KTtcbiAgICAgIH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGg6bGFzdC1jaGlsZCxcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGQ6bGFzdC1jaGlsZCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyIC5iZi10YWJsZSB0aDpsYXN0LWNoaWxkLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXIgLmJmLXRhYmxlIHRkOmxhc3QtY2hpbGQge1xuICAgICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyIC5iZi10YWJsZSB0aCB7XG4gICAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNWY1ZjU7IGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXIgLmJmLXRhYmxlIHRyOmhvdmVyLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXIgLmJmLXRhYmxlIHRyOmhvdmVyIHtcbiAgICAgICAgYmFja2dyb3VuZC1jb2xvcjogI2Y5ZjlmOTtcbiAgICAgIH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGQ6Zmlyc3QtY2hpbGQsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lciAuYmYtdGFibGUgdGQ6Zmlyc3QtY2hpbGQge1xuICAgICAgICBmb250LWZhbWlseTogbW9ub3NwYWNlOyB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgfVxuICAgICAgLyog6KGM5qC35byPICovXG4gICAgICAuYmYtdGFibGUgdHIuYmYtcm93LXJlZiB7IGJhY2tncm91bmQtY29sb3I6ICNmMGY3ZmY7IH1cbiAgICAgIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVmOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogI2UwZWZmZjsgfVxuICAgICAgLmJmLXRhYmxlIHRyLmJmLXJvdy1yZXNlcnZlZCB7IGJhY2tncm91bmQtY29sb3I6ICNmNWY1ZjU7IH1cbiAgICAgIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVzZXJ2ZWQgdGQgeyBmb250LXN0eWxlOiBpdGFsaWM7IGNvbG9yOiAjOTk5OyB9XG4gICAgICAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogI2VmZWZlZjsgfVxuXG4gICAgICAvKiDilIDilIAgbWluaW1hbCDilIDilIAgKi9cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdGgsXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRkLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRoLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRkIHtcbiAgICAgICAgYm9yZGVyOiBub25lOyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcbiAgICAgIH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdGgsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdGggeyBib3JkZXItYm90dG9tOiAycHggc29saWQgI2RkZDsgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJtaW5pbWFsXCJdIC5iZi10YWJsZSB0cjpsYXN0LWNoaWxkIHRkLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRyOmxhc3QtY2hpbGQgdGQgeyBib3JkZXItYm90dG9tOiBub25lOyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZWYsXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZWY6aG92ZXIsXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZXNlcnZlZCxcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkOmhvdmVyLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cIm1pbmltYWxcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZWYsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZjpob3ZlcixcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJtaW5pbWFsXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVzZXJ2ZWQsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkOmhvdmVyIHtcbiAgICAgICAgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQgIWltcG9ydGFudDtcbiAgICAgIH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZjpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICNmMGY3ZmY7IH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwibWluaW1hbFwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogI2Y5ZjlmOTsgfVxuXG4gICAgICAvKiDilIDilIAgemVicmEg4pSA4pSAICovXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cInplYnJhXCJdIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiemVicmFcIl0gLmJmLXRhYmxlIHRkLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cInplYnJhXCJdIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJ6ZWJyYVwiXSAuYmYtdGFibGUgdGQgeyBib3JkZXI6IG5vbmU7IH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiemVicmFcIl0gLmJmLXRhYmxlIHRoLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cInplYnJhXCJdIC5iZi10YWJsZSB0aCB7IGJvcmRlci1ib3R0b206IDJweCBzb2xpZCAjZGRkOyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cInplYnJhXCJdIC5iZi10YWJsZSB0Ym9keSB0cjpudGgtY2hpbGQoZXZlbiksXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiemVicmFcIl0gLmJmLXRhYmxlIHRib2R5IHRyOm50aC1jaGlsZChldmVuKSB7IGJhY2tncm91bmQtY29sb3I6ICNmOWY5Zjk7IH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiemVicmFcIl0gLmJmLXRhYmxlIHRib2R5IHRyOm50aC1jaGlsZChldmVuKTpob3ZlcixcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJ6ZWJyYVwiXSAuYmYtdGFibGUgdGJvZHkgdHI6bnRoLWNoaWxkKGV2ZW4pOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogI2YwZjBmMDsgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJ6ZWJyYVwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZiB7IGJhY2tncm91bmQtY29sb3I6ICNmMGY3ZmYgIWltcG9ydGFudDsgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJ6ZWJyYVwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZjpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICNlMGVmZmYgIWltcG9ydGFudDsgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJ6ZWJyYVwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkIHsgYmFja2dyb3VuZC1jb2xvcjogI2Y1ZjVmNSAhaW1wb3J0YW50OyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cInplYnJhXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVzZXJ2ZWQ6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAjZWZlZmVmICFpbXBvcnRhbnQ7IH1cblxuICAgICAgLyog4pSA4pSAIGNsZWFuIOKUgOKUgCAqL1xuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdGgsXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0ZCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdGgsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiY2xlYW5cIl0gLmJmLXRhYmxlIHRkIHsgYm9yZGVyOiBub25lOyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdGggeyBib3JkZXItYm90dG9tOiAycHggc29saWQgIzMzMzsgZm9udC13ZWlnaHQ6IDYwMDsgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdHIsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiY2xlYW5cIl0gLmJmLXRhYmxlIHRyIHsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7IH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiY2xlYW5cIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZWYsXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVmOmhvdmVyLFxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkLFxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkOmhvdmVyLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVmLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVmOmhvdmVyLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVzZXJ2ZWQsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiY2xlYW5cIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZXNlcnZlZDpob3ZlciB7XG4gICAgICAgIGJhY2tncm91bmQtY29sb3I6IHRyYW5zcGFyZW50ICFpbXBvcnRhbnQ7XG4gICAgICB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImNsZWFuXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVmOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogI2YwZjdmZjsgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJjbGVhblwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogI2Y5ZjlmOTsgfVxuXG4gICAgICAvKiDilIDilIAgZGFyay1oZWFkZXIg4pSA4pSAICovXG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImRhcmstaGVhZGVyXCJdIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiZGFyay1oZWFkZXJcIl0gLmJmLXRhYmxlIHRkLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImRhcmstaGVhZGVyXCJdIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdGQgeyBib3JkZXI6IG5vbmU7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImRhcmstaGVhZGVyXCJdIC5iZi10YWJsZSB0aCxcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdGgge1xuICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMzMzOyBjb2xvcjogI2ZmZjsgYm9yZGVyLWJvdHRvbTogbm9uZTsgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgIH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiZGFyay1oZWFkZXJcIl0gLmJmLXRhYmxlIHRyOmxhc3QtY2hpbGQgdGQsXG4gICAgICAubWFya2Rvd24tc291cmNlLXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiZGFyay1oZWFkZXJcIl0gLmJmLXRhYmxlIHRyOmxhc3QtY2hpbGQgdGQgeyBib3JkZXItYm90dG9tOiBub25lOyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImRhcmstaGVhZGVyXCJdIC5iZi10YWJsZSB0cjpob3ZlcixcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdHI6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjBmMGYwOyB9XG4gICAgICAubWFya2Rvd24tcHJldmlldy12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImRhcmstaGVhZGVyXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVmLFxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZjpob3ZlcixcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiZGFyay1oZWFkZXJcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZXNlcnZlZCxcbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiZGFyay1oZWFkZXJcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZXNlcnZlZDpob3ZlcixcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZixcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZjpob3ZlcixcbiAgICAgIC5tYXJrZG93bi1zb3VyY2UtdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkLFxuICAgICAgLm1hcmtkb3duLXNvdXJjZS12aWV3IC5iZi10YWJsZS1jb250YWluZXJbZGF0YS10aGVtZT1cImRhcmstaGVhZGVyXCJdIC5iZi10YWJsZSB0ci5iZi1yb3ctcmVzZXJ2ZWQ6aG92ZXIge1xuICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiB0cmFuc3BhcmVudCAhaW1wb3J0YW50O1xuICAgICAgfVxuICAgICAgLm1hcmtkb3duLXByZXZpZXctdmlldyAuYmYtdGFibGUtY29udGFpbmVyW2RhdGEtdGhlbWU9XCJkYXJrLWhlYWRlclwiXSAuYmYtdGFibGUgdHIuYmYtcm93LXJlZjpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICNmMGY3ZmY7IH1cbiAgICAgIC5tYXJrZG93bi1wcmV2aWV3LXZpZXcgLmJmLXRhYmxlLWNvbnRhaW5lcltkYXRhLXRoZW1lPVwiZGFyay1oZWFkZXJcIl0gLmJmLXRhYmxlIHRyLmJmLXJvdy1yZXNlcnZlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICNmMGYwZjA7IH1cblxuICAgICAgLyog5Y+C6ICD6ZO+5o6lICovXG4gICAgICAuYmYtcmVmLWxpbmsgeyBjb2xvcjogIzRBOTBEOTsgdGV4dC1kZWNvcmF0aW9uOiBub25lOyBjdXJzb3I6IHBvaW50ZXI7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IH1cbiAgICAgIC5iZi1yZWYtbGluazpob3ZlciB7IGNvbG9yOiAjMmE2Y2I4OyB9XG4gICAgICAuYmYtcmVmLXVucmVzb2x2ZWQgeyBjb2xvcjogIzk5OTsgdGV4dC1kZWNvcmF0aW9uOiBub25lOyBjdXJzb3I6IG5vdC1hbGxvd2VkOyB9XG5cbiAgICAgIC8qIOaCrOa1riB0b29sdGlwIOS4reeahOihqOagvCAqL1xuICAgICAgLmJmLXRvb2x0aXAgLmJmLXRhYmxlIHsgd2lkdGg6IDEwMCU7IGJvcmRlci1jb2xsYXBzZTogY29sbGFwc2U7IH1cbiAgICAgIC5iZi10b29sdGlwIC5iZi10YWJsZSB0aCxcbiAgICAgIC5iZi10b29sdGlwIC5iZi10YWJsZSB0ZCB7XG4gICAgICAgIGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IHBhZGRpbmc6IDRweCA4cHg7IHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICAgIH1cbiAgICAgIC5iZi10b29sdGlwIC5iZi10YWJsZSB0aDpsYXN0LWNoaWxkLFxuICAgICAgLmJmLXRvb2x0aXAgLmJmLXRhYmxlIHRkOmxhc3QtY2hpbGQgeyB0ZXh0LWFsaWduOiBsZWZ0OyB9XG4gICAgICAuYmYtdG9vbHRpcCAuYmYtdGFibGUgdGggeyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjVmNWY1OyBmb250LXdlaWdodDogNjAwOyB9XG4gICAgICAuYmYtdG9vbHRpcCAuYmYtdGFibGUgdHIuYmYtcm93LXJlc2VydmVkIHRkIHsgY29sb3I6ICM5OTk7IGZvbnQtc3R5bGU6IGl0YWxpYzsgfVxuICAgIGA7XG5cbiAgICBjb25zdCBzdHlsZUVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZUVsLnRleHRDb250ZW50ID0gY3NzO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGVFbCk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuY2xlYXIoKTtcbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gW107XG4gICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzQml0ZmllbGQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgdGhpcy5jdXJyZW50Tm90ZVBhdGggPSBjdHguc291cmNlUGF0aCB8fCAnJztcbiAgICBjb25zdCByZXN1bHQgPSBwYXJzZShzb3VyY2UpO1xuXG4gICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgdGhpcy5yZW5kZXJFcnJvcnMoZWwsIHJlc3VsdC5lcnJvcnMgfHwgW10pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghcmVzdWx0LmJsb2NrcykgcmV0dXJuO1xuICAgIGZvciAoY29uc3QgW25hbWUsIGJsb2NrXSBvZiByZXN1bHQuYmxvY2tzKSB7XG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XG4gICAgfVxuXG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5yZXNvbHZlUGVuZGluZ1JlZnMoKSwgNTApO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhuYW1lOiBzdHJpbmcsIGJsb2NrOiBGaWVsZEJsb2NrLCBwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBwYXJlbnRFbC5jcmVhdGVFbCgnZGl2Jywge1xuICAgICAgY2xzOiBDU1MuY29udGFpbmVyLFxuICAgICAgYXR0cjogeyBpZDogYGJmOiR7bmFtZX1gIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGhlYWRlclJvdyA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6IENTUy5oZWFkZXJSb3cgfSk7XG4gICAgaGVhZGVyUm93LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgaGVhZGVyUm93LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcbiAgICBoZWFkZXJSb3cuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnc3BhY2UtYmV0d2Vlbic7XG4gICAgaGVhZGVyUm93LnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc4cHgnO1xuICAgIGNvbnN0IGRlc2MgPSBibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7YmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIGhlYWRlclJvdy5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgIHRleHQ6IGAke25hbWV9JHtkZXNjfSDnmoQgJHtibG9jay53aWR0aH0gYml0IOWumuS5ieWmguS4i++8mmAsXG4gICAgICBjbHM6IENTUy5oZWFkZXJcbiAgICB9KTtcbiAgICBjb25zdCB0b2dnbGVCdG4gPSB0aGlzLmNyZWF0ZVRvZ2dsZUJ1dHRvbihoZWFkZXJSb3cpO1xuXG4gICAgY29uc3QgY29udGVudFdyYXAgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiBDU1MuY29udGVudCB9KTtcbiAgICBjb25zdCBzdmdDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6IENTUy5zdmcgfSk7XG4gICAgY29uc3Qgc3ZnSHRtbCA9IHJlbmRlckJsb2NrU3ZnKGJsb2NrLCB0aGlzLnBsdWdpbkRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCcsIHRoaXMucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgfHwgMzgsIHRoaXMucGx1Z2luRGF0YS5zdmdGb250U2l6ZSB8fCAyMik7XG4gICAgY29uc3Qgc3ZnRG9jRnJhZyA9IHNhbml0aXplSFRNTFRvRG9tKHN2Z0h0bWwpO1xuICAgIHN2Z0NvbnRhaW5lci5hcHBlbmRDaGlsZChzdmdEb2NGcmFnKTtcbiAgICB0aGlzLnNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRvb2x0aXBIYW5kbGVycyhzdmdDb250YWluZXIpO1xuXG4gICAgY29uc3QgdGFibGVDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6IENTUy50YWJsZUNvbnRhaW5lciB9KTtcbiAgICB0YWJsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGlzLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xuICAgIGNvbnN0IHRhYmxlSHRtbCA9IHJlbmRlckJsb2NrVGFibGUoYmxvY2spO1xuICAgIGNvbnN0IHRhYmxlRG9jRnJhZyA9IHNhbml0aXplSFRNTFRvRG9tKHRhYmxlSHRtbCk7XG4gICAgdGFibGVDb250YWluZXIuYXBwZW5kQ2hpbGQodGFibGVEb2NGcmFnKTtcbiAgICB0aGlzLnNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnModGFibGVDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG5cbiAgICAvLyDliJ3lp4vljJbop4blm77vvJror7vlj5bkv53lrZjnmoTlgY/lpb1cbiAgICBjb25zdCBkZWZhdWx0VmlldyA9IHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgICAvLyDliJ3lp4vpmpDol4/miYDmnInlrrnlmajvvIxhcHBseVZpZXcg5qC55o2u6buY6K6k6KeG5Zu+5pi+56S65LiA5LiqXG4gICAgc3ZnQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgdGFibGVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB0aGlzLmFwcGx5VmlldyhkZWZhdWx0VmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XG5cbiAgICAvLyDnu5HlrprliIfmjaLkuovku7ZcbiAgICB0b2dnbGVCdG4ub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGNvbnN0IHZpZXcgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScgfCBudWxsO1xuICAgICAgaWYgKHZpZXcpIHtcbiAgICAgICAgdGhpcy5hcHBseVZpZXcodmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XG4gICAgICAgIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyA9IHZpZXc7XG4gICAgICAgIHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5EYXRhKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8g55uR5ZCs6K6+572u5Y+Y5pu05LqL5Lu2IOKAlCDnlLEgU2V0dGluZ3MgVGFiIGRpc3BhdGNoIOinpuWPkVxuICAgIGNvbnN0IHNldHRpbmdzSGFuZGxlciA9ICgpID0+IHtcbiAgICAgIHRoaXMuYXBwbHlUYWJsZVRoZW1lKHRoaXMucGx1Z2luRGF0YS50YWJsZVRoZW1lIHx8ICdkZWZhdWx0Jyk7XG4gICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYmYtdGFibGUtcm93LWhlaWdodCcsIGAke3RoaXMucGx1Z2luRGF0YS50YWJsZVJvd0hlaWdodCB8fCAyOH1weGApO1xuICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWJmLXRhYmxlLWZvbnQtc2l6ZScsIGAke3RoaXMucGx1Z2luRGF0YS50YWJsZUZvbnRTaXplIHx8IDE0fXB4YCk7XG4gICAgICB0aGlzLnJlcmVuZGVyQWxsKCk7XG4gICAgfTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmYtc2V0dGluZ3MtY2hhbmdlZCcsIHNldHRpbmdzSGFuZGxlcik7XG5cbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuc2V0KG5hbWUsIHtcbiAgICAgIGVsZW1lbnQ6IGNvbnRhaW5lcixcbiAgICAgIGJsb2NrLFxuICAgICAgbm90ZVBhdGg6IHRoaXMuY3VycmVudE5vdGVQYXRoXG4gICAgfSk7XG5cbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyhzdmdDb250YWluZXIpO1xuICAgIHRoaXMuY29sbGVjdFBlbmRpbmdSZWZzKHRhYmxlQ29udGFpbmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlWaWV3KHZpZXc6ICdzdmcnIHwgJ3RhYmxlJywgY29udGVudFdyYXA6IEhUTUxFbGVtZW50LCBzdmdFbDogSFRNTEVsZW1lbnQsIHRhYmxlRWw6IEhUTUxFbGVtZW50LCBidG46IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGVudFdyYXAuc2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnLCB2aWV3KTtcbiAgICBpZiAodmlldyA9PT0gJ3N2ZycpIHtcbiAgICAgIHN2Z0VsLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgdGFibGVFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdmdFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgdGFibGVFbC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICB9XG4gICAgYnRuLnF1ZXJ5U2VsZWN0b3JBbGwoYC4ke0NTUy50b2dnbGVPcHRpb259YCkuZm9yRWFjaChvcHQgPT4ge1xuICAgICAgb3B0LmNsYXNzTGlzdC50b2dnbGUoQ1NTLnRvZ2dsZUFjdGl2ZSwgb3B0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgPT09IHZpZXcpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVUb2dnbGVCdXR0b24ocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBidG4gPSBwYXJlbnQuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiBDU1MudG9nZ2xlQnRuIH0pO1xuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+S9jeWfn+WbvicsIGNsczogYCR7Q1NTLnRvZ2dsZU9wdGlvbn0gYmYtdG9nZ2xlLXN2Z2AsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICdzdmcnIH0gfSk7XG4gICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn6KGo5qC8JywgY2xzOiBgJHtDU1MudG9nZ2xlT3B0aW9ufSBiZi10b2dnbGUtdGFibGVgLCBhdHRyOiB7ICdkYXRhLXZpZXcnOiAndGFibGUnIH0gfSk7XG4gICAgcmV0dXJuIGJ0bjtcbiAgfVxuXG4gIC8qKiBSZXJlbmRlciBhbGwgU1ZHcyB3aXRoIGN1cnJlbnQgdGhlbWUg4oCUIHB1YmxpYyBmb3IgU2V0dGluZ1RhYiAqL1xuICBwdWJsaWMgcmVyZW5kZXJBbGxTdmcoKTogdm9pZCB7XG4gICAgY29uc3QgdGhlbWUgPSB0aGlzLnBsdWdpbkRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCc7XG4gICAgY29uc3QgYm94SGVpZ2h0ID0gdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCAzODtcbiAgICBjb25zdCBmb250U2l6ZSA9IHRoaXMucGx1Z2luRGF0YS5zdmdGb250U2l6ZSB8fCAyMjtcbiAgICBmb3IgKGNvbnN0IFssIGVudHJ5XSBvZiB0aGlzLmJsb2NrUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHN2Z0NvbnRhaW5lciA9IGVudHJ5LmVsZW1lbnQucXVlcnlTZWxlY3RvcihgLiR7Q1NTLnN2Z31gKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoc3ZnQ29udGFpbmVyKSB7XG4gICAgICAgIHN2Z0NvbnRhaW5lci5lbXB0eSgpOyAvLyDlhYjmuIXnqbrml6cgU1ZHXG4gICAgICAgIGNvbnN0IHN2Z0h0bWwgPSByZW5kZXJCbG9ja1N2ZyhlbnRyeS5ibG9jaywgdGhlbWUsIGJveEhlaWdodCwgZm9udFNpemUpO1xuICAgICAgICBjb25zdCBzdmdEb2NGcmFnID0gc2FuaXRpemVIVE1MVG9Eb20oc3ZnSHRtbCk7XG4gICAgICAgIHN2Z0NvbnRhaW5lci5hcHBlbmRDaGlsZChzdmdEb2NGcmFnKTtcbiAgICAgICAgdGhpcy5zZXR1cE5hdmlnYXRpb25IYW5kbGVycyhzdmdDb250YWluZXIpO1xuICAgICAgICB0aGlzLnNldHVwVG9vbHRpcEhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIFJlLXJlbmRlciBhbGwgYmxvY2tzIHdpdGggdXBkYXRlZCBzZXR0aW5ncyDigJQgcHVibGljIGZvciBTZXR0aW5nVGFiICovXG4gIHB1YmxpYyByZXJlbmRlckFsbCgpOiB2b2lkIHtcbiAgICBjb25zb2xlLmxvZygnW2JpdGZpZWxkXSByZXJlbmRlckFsbCBjYWxsZWQsIGVudHJpZXM6JywgdGhpcy5ibG9ja1JlZ2lzdHJ5LnNpemUpO1xuICAgIC8vIOmHjeW7uiBET00g5Lya5Lii5aSx5LqL5Lu255uR5ZCs5Zmo77yM5YWI5YWz6ZetIHRvb2x0aXBcbiAgICBjb25zdCB3YXNUb29sdGlwVmlzaWJsZSA9IHRoaXMuYWN0aXZlVG9vbHRpcCAhPT0gbnVsbDtcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBlbnRyeV0gb2YgdGhpcy5ibG9ja1JlZ2lzdHJ5KSB7XG4gICAgICBjb25zb2xlLmxvZygnW2JpdGZpZWxkXSByZXJlbmRlckFsbCBlbnRyeTonLCBuYW1lKTtcbiAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGVudHJ5LmVsZW1lbnQ7XG4gICAgICBjb25zdCBzdmdDb250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihgLiR7Q1NTLnN2Z31gKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoc3ZnQ29udGFpbmVyKSB7XG4gICAgICAgIGNvbnN0IHN2Z0h0bWwgPSByZW5kZXJCbG9ja1N2ZyhlbnRyeS5ibG9jaywgdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDM4LCB0aGlzLnBsdWdpbkRhdGEuc3ZnRm9udFNpemUgfHwgMjIpO1xuICAgICAgICBjb25zdCBzdmdEb2NGcmFnID0gc2FuaXRpemVIVE1MVG9Eb20oc3ZnSHRtbCk7XG4gICAgICAgIHN2Z0NvbnRhaW5lci5lbXB0eSgpO1xuICAgICAgICBzdmdDb250YWluZXIuYXBwZW5kQ2hpbGQoc3ZnRG9jRnJhZyk7XG4gICAgICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICAgICAgdGhpcy5zZXR1cFRvb2x0aXBIYW5kbGVycyhzdmdDb250YWluZXIpO1xuICAgICAgfVxuICAgICAgY29uc3QgdGFibGVDb250YWluZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihgLiR7Q1NTLnRhYmxlQ29udGFpbmVyfWApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgIGlmICh0YWJsZUNvbnRhaW5lcikge1xuICAgICAgICB0YWJsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGlzLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xuICAgICAgICBjb25zdCB0YWJsZUh0bWwgPSByZW5kZXJCbG9ja1RhYmxlKGVudHJ5LmJsb2NrKTtcbiAgICAgICAgY29uc3QgdGFibGVEb2NGcmFnID0gc2FuaXRpemVIVE1MVG9Eb20odGFibGVIdG1sKTtcbiAgICAgICAgdGFibGVDb250YWluZXIuZW1wdHkoKTtcbiAgICAgICAgdGFibGVDb250YWluZXIuYXBwZW5kQ2hpbGQodGFibGVEb2NGcmFnKTtcbiAgICAgICAgdGhpcy5zZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcbiAgICAgICAgdGhpcy5zZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcbiAgICAgIH1cbiAgICB9XG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5yZXNvbHZlUGVuZGluZ1JlZnMoKSwgNTApO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJFcnJvcnMoZWw6IEhUTUxFbGVtZW50LCBlcnJvcnM6IHsgbGluZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IHN1Z2dlc3Rpb24/OiBzdHJpbmcgfVtdKSB7XG4gICAgZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiBDU1MuZXJyb3IgfSwgKGVycm9yRWwpID0+IHtcbiAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfop6PmnpDplJnor686JyB9KTtcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XG4gICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDooYwgJHtlcnJvci5saW5lfTogJHtlcnJvci5tZXNzYWdlfWAgfSk7XG4gICAgICAgIGlmIChlcnJvci5zdWdnZXN0aW9uKSB7XG4gICAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOW7uuiurjogJHtlcnJvci5zdWdnZXN0aW9ufWAsIGNsczogJ3N1Z2dlc3Rpb24nIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyDilIDilIDilIAg54K55Ye76Lez6L2sIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKENTUy5yZWZMaW5rKSkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xuICAgICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHNjcm9sbFRvQmxvY2soYmxvY2tOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcbiAgICBpZiAoIWVudHJ5KSByZXR1cm47XG4gICAgZW50cnkuZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgIGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LmFkZChDU1MuaGlnaGxpZ2h0KTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoQ1NTLmhpZ2hsaWdodCksIDE1MDApO1xuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOaCrOa1riB0b29sdGlwIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAvLyDpvKDmoIflm57liLDmupDlhYPntKDkuIrvvIzlj5bmtojlvoXliKDpmaTlrprml7blmahcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcbiAgICAgICAgdGhpcy5zaG93VG9vbHRpcChyZWZOYW1lLCBlLmNsaWVudFgsIGUuY2xpZW50WSwgdmlldyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwVGFibGVUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhDU1MucmVmTGluaykpIHtcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xuICAgICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcbiAgICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKENTUy5yZWZMaW5rKSkgdGhpcy5zY2hlZHVsZVRvb2x0aXBSZW1vdmUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKiDojrflj5booqvlvJXnlKjlnZfoh6rouqvnmoTop4blm77nirbmgIHvvIzkuI3lrZjlnKjliJnnlKjpu5jorqTlgY/lpb0gKi9cbiAgcHJpdmF0ZSBnZXRWaWV3Rm9yQmxvY2soYmxvY2tOYW1lOiBzdHJpbmcpOiAnc3ZnJyB8ICd0YWJsZScge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmIChlbnRyeSkge1xuICAgICAgY29uc3QgY29udGVudFdyYXAgPSBlbnRyeS5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoYC4ke0NTUy5jb250ZW50fWApO1xuICAgICAgY29uc3QgdmlldyA9IGNvbnRlbnRXcmFwPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmICh2aWV3KSByZXR1cm4gdmlldztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCkge1xuICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG4gICAgfSwgMjAwKTtcbiAgfVxuXG4gIHByaXZhdGUgc2hvd1Rvb2x0aXAoYmxvY2tOYW1lOiBzdHJpbmcsIG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlciwgdmlldzogJ3N2ZycgfCAndGFibGUnKSB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xuXG4gICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG5cbiAgICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuYm9keS5jcmVhdGVFbCgnZGl2JywgeyBjbHM6IENTUy50b29sdGlwIH0pO1xuICAgIHRvb2x0aXAuc3R5bGUuZm9udFNpemUgPSBgJHt0aGlzLnBsdWdpbkRhdGEudGFibGVGb250U2l6ZSB8fCAxNH1weGA7XG5cbiAgICBjb25zdCBkZXNjID0gZW50cnkuYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2VudHJ5LmJsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcbiAgICB0b29sdGlwLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgJHtibG9ja05hbWV9JHtkZXNjfWAsIGNsczogQ1NTLnRvb2x0aXBIZWFkZXIgfSk7XG5cbiAgICBpZiAodmlldyA9PT0gJ3N2ZycpIHtcbiAgICAgIGNvbnN0IHN2Z1dyYXAgPSB0b29sdGlwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogQ1NTLnRvb2x0aXBTdmcgfSk7XG4gICAgICBjb25zdCBzdmdIdG1sID0gcmVuZGVyQmxvY2tTdmcoZW50cnkuYmxvY2ssIHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJywgdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCAzOCwgdGhpcy5wbHVnaW5EYXRhLnN2Z0ZvbnRTaXplIHx8IDIyKTtcbiAgICAgIGNvbnN0IHN2Z0RvY0ZyYWcgPSBzYW5pdGl6ZUhUTUxUb0RvbShzdmdIdG1sKTtcbiAgICAgIHN2Z1dyYXAuYXBwZW5kQ2hpbGQoc3ZnRG9jRnJhZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiBDU1MudG9vbHRpcFRhYmxlIH0pO1xuICAgICAgY29uc3QgdGFibGVIdG1sID0gcmVuZGVyQmxvY2tUYWJsZShlbnRyeS5ibG9jayk7XG4gICAgICBjb25zdCB0YWJsZURvY0ZyYWcgPSBzYW5pdGl6ZUhUTUxUb0RvbSh0YWJsZUh0bWwpO1xuICAgICAgdGFibGVXcmFwLmFwcGVuZENoaWxkKHRhYmxlRG9jRnJhZyk7XG4gICAgfVxuXG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+WNleWHu+i3s+i9rOafpeeci+WujOaVtOWumuS5iScsIGNsczogQ1NTLnRvb2x0aXBIaW50IH0pO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0b29sdGlwKTtcbiAgICB0aGlzLmFjdGl2ZVRvb2x0aXAgPSB0b29sdGlwO1xuXG4gICAgY29uc3QgcmVjdCA9IHRvb2x0aXAuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgbGV0IGxlZnQgPSBtb3VzZVggKyAxMjtcbiAgICBsZXQgdG9wID0gbW91c2VZIC0gMjA7XG4gICAgaWYgKGxlZnQgKyByZWN0LndpZHRoID4gd2luZG93LmlubmVyV2lkdGggLSAxNikgbGVmdCA9IG1vdXNlWCAtIHJlY3Qud2lkdGggLSAxMjtcbiAgICBpZiAodG9wICsgcmVjdC5oZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAxNikgdG9wID0gd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSAxNjtcbiAgICBpZiAodG9wIDwgOCkgdG9wID0gODtcblxuICAgIHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRvb2x0aXAuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICAvLyDpvKDmoIfov5vlhaUgdG9vbHRpcCDml7blj5bmtojlvoXliKDpmaTlrprml7blmahcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG4gICAgICBpZiAodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpIHtcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAvLyDpvKDmoIfnprvlvIAgdG9vbHRpcCDmnKzouqvml7blu7bov5/lhbPpl63vvIzpgb/lhY0gdG9vbHRpcCDlhoXlhYPntKDvvIjooajmoLwvU1ZH77yJXG4gICAgICAvLyDkuIrnmoQgbW91c2VvdXQg56uL5Yi76Kem5Y+R5YWz6ZetIOKAlCDnlKjmiLfnp7vliLAgdG9vbHRpcCDlhoXpg6jnmoTooajmoLzph4zkuI3kvJrlhbPpl61cbiAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICAgIH0sIDIwMCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlbW92ZVRvb2x0aXAoKSB7XG4gICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCkge1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwLnJlbW92ZSgpO1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIDilIAg5byV55So6Kej5p6QIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgY29sbGVjdFBlbmRpbmdSZWZzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcmVmXScpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCByZWZOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpID8/ICcnO1xuICAgICAgaWYgKCFyZWZOYW1lKSByZXR1cm47XG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocmVmTmFtZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWU6IHJlZk5hbWUgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoYC4ke0NTUy5yZWZMaW5rfWApLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXROYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpID8/ICcnO1xuICAgICAgaWYgKCF0YXJnZXROYW1lKSByZXR1cm47XG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXModGFyZ2V0TmFtZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWUgfSk7XG4gICAgICAgIChlbCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmFkZChDU1MucmVmVW5yZXNvbHZlZCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVQZW5kaW5nUmVmcygpIHtcbiAgICBjb25zdCBzdGlsbFBlbmRpbmc6IHR5cGVvZiB0aGlzLnBlbmRpbmdSZWZzID0gW107XG4gICAgZm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMucGVuZGluZ1JlZnMpIHtcbiAgICAgIGlmICh0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHBlbmRpbmcudGFyZ2V0TmFtZSkpIHtcbiAgICAgICAgcGVuZGluZy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoQ1NTLnJlZlVucmVzb2x2ZWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RpbGxQZW5kaW5nLnB1c2gocGVuZGluZyk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBzdGlsbFBlbmRpbmc7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJpIiwiUGx1Z2luU2V0dGluZ1RhYiIsIlNldHRpbmciLCJQbHVnaW4iLCJzYW5pdGl6ZUhUTUxUb0RvbSJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBYU8sU0FBUyxNQUFNLEtBQUEsRUFBNEI7QUFDaEQsRUFBQSxNQUFNLEtBQUEsR0FBUSxLQUFBLENBQU0sS0FBQSxDQUFNLElBQUksQ0FBQTtBQUM5QixFQUFBLE1BQU0sU0FBdUIsRUFBQztBQUM5QixFQUFBLE1BQU0sTUFBQSx1QkFBYSxHQUFB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
