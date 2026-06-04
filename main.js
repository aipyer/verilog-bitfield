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
      calculateBitRanges(block.children, block.width);
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
function parseChildren(lines, children, errors, baseIndent, parentName) {
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
function calculateBitRanges(fields, parentWidth) {
  let currentLsb = 0;
  for (const field of fields) {
    field.lsb = currentLsb;
    field.msb = currentLsb + field.width - 1;
    currentLsb = field.msb + 1;
    if (!field.isReference && field.children && field.children.length > 0) {
      calculateBitRanges(field.children, field.width);
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

function calcMinLabelWidth(label, fontSize) {
  return label.length * fontSize * 0.6 + 20;
}
function shouldUseVertical(fields, totalWidth) {
  if (totalWidth > 64) return true;
  const svgWidth = 1e3;
  const availableWidth = svgWidth - 120;
  for (const field of fields) {
    const fieldName = field.isReserved ? "reserved" : field.isReference ? `@${field.refName}` : field.name;
    const label = `${fieldName}[${field.msb}:${field.lsb}]`;
    const widthRatio = field.width / totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const minWidth = calcMinLabelWidth(label, 14);
    if (boxWidth < minWidth) return true;
  }
  return false;
}
function renderBlockSvg(block, theme = "pastel", boxHeight = 44) {
  const config = {
    totalWidth: block.width,
    isVertical: shouldUseVertical(block.children, block.width),
    boxHeight,
    fontSize: 22,
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
  const arrowX = startX + boxWidth + 24;
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
  svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ""} style="cursor:${isRef ? "pointer" : "default"}">${displayText}</text>`;
  const parentHigh = field.msb;
  const parentLow = field.lsb;
  const parentLabel = parentHigh === parentLow ? `[${parentHigh}]` : `[${parentHigh}:${parentLow}]`;
  const annotationFontSize = fontSize * 0.7;
  if (layoutDirection === "vertical") {
    const annotX = x - 8;
    const annotY = textY;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="end" dominant-baseline="central" fill="#999" font-family="monospace">${parentLabel}</text>`;
  } else {
    const annotX = textX;
    const annotY = y - 8;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="middle" fill="#999" font-family="monospace">${parentLabel}</text>`;
  }
  return svg;
}

function renderBlockTable(block) {
  const rows = [];
  for (const child of block.children) {
    collectRows(child, 0, rows);
  }
  let html = '<table class="verilog-bitfield-table">';
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
  if (isRsv) rowClass = ' class="reserved-row"';
  else if (isRef) rowClass = ' class="ref-child"';
  const nameCell = isRef ? `<a href="#" class="bf-ref-link" data-target="${field.refName}">${indent}${name}</a>` : `${indent}${name}`;
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
class VerilogBitfieldSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Verilog Bitfield" });
    new obsidian.Setting(containerEl).setName("SVG theme").setDesc("Color scheme for bitfield diagrams").addDropdown((drop) => {
      for (const [key, label] of Object.entries(SVG_THEME_LABELS)) {
        drop.addOption(key, label);
      }
      drop.setValue(this.plugin.pluginData.svgTheme || "pastel");
      drop.onChange(async (value) => {
        this.plugin.pluginData.svgTheme = value;
        await this.plugin.saveData(this.plugin.pluginData);
        this.plugin.rerenderAllSvg();
      });
    });
    new obsidian.Setting(containerEl).setName("SVG row height").setDesc("Height of each field row in bitfield diagrams (px)").addSlider((slider) => {
      slider.setLimits(28, 80, 2);
      slider.setValue(this.plugin.pluginData.svgBoxHeight || 38);
      slider.setDynamicTooltip();
      slider.onChange(async (value) => {
        this.plugin.pluginData.svgBoxHeight = value;
        await this.plugin.saveData(this.plugin.pluginData);
        this.plugin.rerenderAllSvg();
      });
    });
    new obsidian.Setting(containerEl).setName("Table theme").setDesc("Visual style for rendered tables").addDropdown((drop) => {
      for (const [key, label] of Object.entries(TABLE_THEME_LABELS)) {
        drop.addOption(key, label);
      }
      drop.setValue(this.plugin.pluginData.tableTheme || "default");
      drop.onChange(async (value) => {
        this.plugin.pluginData.tableTheme = value;
        await this.plugin.saveData(this.plugin.pluginData);
        this.applyTableTheme(value);
      });
    });
    new obsidian.Setting(containerEl).setName("Table row height").setDesc("Row height for rendered tables (px)").addSlider((slider) => {
      slider.setLimits(18, 48, 2);
      slider.setValue(this.plugin.pluginData.tableRowHeight || 28);
      slider.setDynamicTooltip();
      slider.onChange(async (value) => {
        this.plugin.pluginData.tableRowHeight = value;
        await this.plugin.saveData(this.plugin.pluginData);
        this.applyTableRowHeight(value);
      });
    });
  }
  applyTableTheme(theme) {
    document.querySelectorAll(".verilog-bitfield-table-container").forEach((el) => {
      el.setAttribute("data-theme", theme);
    });
  }
  applyTableRowHeight(height) {
    document.documentElement.style.setProperty("--bf-table-row-height", `${height}px`);
  }
}

const DEFAULT_DATA = { defaultView: "svg", tableTheme: "default", svgTheme: "pastel", svgBoxHeight: 38, tableRowHeight: 28 };
class VerilogBitfieldPlugin extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.blockRegistry = /* @__PURE__ */ new Map();
    this.pendingRefs = [];
    this.currentNotePath = "";
    this.activeTooltip = null;
    this.tooltipRemoveTimer = null;
    this.pluginData = DEFAULT_DATA;
  }
  async onload() {
    this.pluginData = Object.assign({}, DEFAULT_DATA, await this.loadData());
    this.addSettingTab(new VerilogBitfieldSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("verilog-bitfield", this.processBitfield.bind(this));
    document.documentElement.style.setProperty("--bf-table-row-height", `${this.pluginData.tableRowHeight || 28}px`);
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
    for (const [name, block] of result.blocks) {
      this.renderBlock(name, block, el);
    }
    setTimeout(() => this.resolvePendingRefs(), 50);
  }
  renderBlock(name, block, parentEl) {
    const container = parentEl.createEl("div", {
      cls: "verilog-bitfield-container",
      attr: { id: `bf:${name}` }
    });
    const headerRow = container.createEl("div", { cls: "verilog-bitfield-header-row" });
    const desc = block.description ? ` \u2014 ${block.description}` : "";
    headerRow.createEl("span", {
      text: `${name}${desc} \u7684 ${block.width} bit \u5B9A\u4E49\u5982\u4E0B\uFF1A`,
      cls: "verilog-bitfield-header"
    });
    const toggleBtn = this.createToggleButton(headerRow);
    const contentWrap = container.createEl("div", { cls: "verilog-bitfield-content" });
    const svgContainer = contentWrap.createEl("div", { cls: "verilog-bitfield-svg" });
    svgContainer.innerHTML = renderBlockSvg(block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 44);
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);
    const tableContainer = contentWrap.createEl("div", { cls: "verilog-bitfield-table-container" });
    tableContainer.setAttribute("data-theme", this.pluginData.tableTheme || "default");
    tableContainer.innerHTML = renderBlockTable(block);
    this.setupTableNavigationHandlers(tableContainer);
    this.setupTableTooltipHandlers(tableContainer);
    const defaultView = this.pluginData.defaultView || "svg";
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
    btn.querySelectorAll(".bf-toggle-option").forEach((opt) => {
      opt.classList.toggle("bf-toggle-active", opt.getAttribute("data-view") === view);
    });
  }
  createToggleButton(parent) {
    const btn = parent.createEl("div", { cls: "bf-view-toggle" });
    btn.createEl("span", { text: "\u4F4D\u57DF\u56FE", cls: "bf-toggle-option bf-toggle-svg", attr: { "data-view": "svg" } });
    btn.createEl("span", { text: "\u8868\u683C", cls: "bf-toggle-option bf-toggle-table", attr: { "data-view": "table" } });
    return btn;
  }
  /** 重新渲染所有 SVG 位域图（主题变更时调用） */
  rerenderAllSvg() {
    const theme = this.pluginData.svgTheme || "pastel";
    for (const [, entry] of this.blockRegistry) {
      const svgContainer = entry.element.querySelector(".verilog-bitfield-svg");
      if (svgContainer) {
        svgContainer.innerHTML = renderBlockSvg(entry.block, theme, this.pluginData.svgBoxHeight || 44);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
    }
  }
  renderErrors(el, errors) {
    el.createEl("div", { cls: "verilog-bitfield-error" }, (errorEl) => {
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
      if (target.classList.contains("bf-ref-link")) {
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
    entry.element.classList.add("bf-highlight");
    setTimeout(() => entry.element.classList.remove("bf-highlight"), 1500);
  }
  // ─── 悬浮 tooltip ───
  setupTooltipHandlers(container) {
    container.addEventListener("mouseover", (e) => {
      const target = e.target;
      const refName = target.getAttribute("data-ref") || target.parentElement?.getAttribute("data-ref");
      if (refName) {
        if (this.tooltipRemoveTimer) {
          clearTimeout(this.tooltipRemoveTimer);
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
      if (target.classList.contains("bf-ref-link")) {
        if (this.tooltipRemoveTimer) {
          clearTimeout(this.tooltipRemoveTimer);
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
      if (target.classList.contains("bf-ref-link")) this.scheduleTooltipRemove();
    });
  }
  /** 获取被引用块自身的视图状态，不存在则用默认偏好 */
  getViewForBlock(blockName) {
    const entry = this.blockRegistry.get(blockName);
    if (entry) {
      const contentWrap = entry.element.querySelector(".verilog-bitfield-content");
      const view = contentWrap?.getAttribute("data-view");
      if (view) return view;
    }
    return this.pluginData.defaultView || "svg";
  }
  scheduleTooltipRemove() {
    this.tooltipRemoveTimer = setTimeout(() => {
      this.removeTooltip();
    }, 200);
  }
  showTooltip(blockName, mouseX, mouseY, view) {
    const entry = this.blockRegistry.get(blockName);
    if (!entry) return;
    this.removeTooltip();
    const tooltip = document.createElement("div");
    tooltip.className = "bf-tooltip";
    const desc = entry.block.description ? ` \u2014 ${entry.block.description}` : "";
    tooltip.createEl("p", { text: `${blockName}${desc}`, cls: "bf-tooltip-header" });
    if (view === "svg") {
      const svgWrap = tooltip.createEl("div", { cls: "bf-tooltip-svg" });
      svgWrap.innerHTML = renderBlockSvg(entry.block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 44);
    } else {
      const tableWrap = tooltip.createEl("div", { cls: "bf-tooltip-table" });
      tableWrap.innerHTML = renderBlockTable(entry.block);
    }
    tooltip.createEl("p", { text: "\u5355\u51FB\u8DF3\u8F6C\u67E5\u770B\u5B8C\u6574\u5B9A\u4E49", cls: "bf-tooltip-hint" });
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
        clearTimeout(this.tooltipRemoveTimer);
        this.tooltipRemoveTimer = null;
      }
    });
    tooltip.addEventListener("mouseleave", () => this.removeTooltip());
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
      const refName = el.getAttribute("data-ref");
      if (!this.blockRegistry.has(refName)) {
        this.pendingRefs.push({ element: el, targetName: refName });
      }
    });
    container.querySelectorAll(".bf-ref-link").forEach((el) => {
      const targetName = el.getAttribute("data-target");
      if (!this.blockRegistry.has(targetName)) {
        this.pendingRefs.push({ element: el, targetName });
        el.classList.add("bf-ref-unresolved");
      }
    });
  }
  resolvePendingRefs() {
    const stillPending = [];
    for (const pending of this.pendingRefs) {
      if (this.blockRegistry.has(pending.targetName)) {
        pending.element.classList.remove("bf-ref-unresolved");
      } else {
        stillPending.push(pending);
      }
    }
    this.pendingRefs = stillPending;
  }
}

exports.DEFAULT_DATA = DEFAULT_DATA;
exports.default = VerilogBitfieldPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9zZXR0aW5ncy50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrLCBQYXJzZUVycm9yLCBQYXJzZVJlc3VsdCB9IGZyb20gJy4vdHlwZXMnO1xuXG5pbnRlcmZhY2UgUmF3TGluZSB7XG4gIGxpbmVOdW06IG51bWJlcjtcbiAgaW5kZW50OiBudW1iZXI7XG4gIGNvbnRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiDop6PmnpAgVmVyaWxvZyDkvY3ln5/lrprkuYlcbiAqIOe7n+S4gOivreazle+8muavj+S4quS7o+eggeWdl+eUseS4gOS4quaIluWkmuS4qiBkZWZpbml0aW9uIGJsb2NrIOe7hOaIkFxuICog5q+P5Liq5Z2X77ya56ys5LiA6KGMIG5hbWUgd2lkdGggW2Rlc2NyaXB0aW9uXe+8jOWtkOWtl+autemAmui/h+e8qei/m+W1jOWll1xuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoaW5wdXQ6IHN0cmluZyk6IFBhcnNlUmVzdWx0IHtcbiAgY29uc3QgbGluZXMgPSBpbnB1dC5zcGxpdCgnXFxuJyk7XG4gIGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG4gIGNvbnN0IGJsb2NrcyA9IG5ldyBNYXA8c3RyaW5nLCBGaWVsZEJsb2NrPigpO1xuICBjb25zdCBibG9ja05hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgLy8g6aKE5aSE55CG77ya6L+H5ruk56m66KGM5ZKM5rOo6YeKXG4gIGNvbnN0IHJhd0xpbmVzOiBSYXdMaW5lW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcbiAgICBpZiAoIWxpbmUudHJpbSgpIHx8IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy8vJykpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICByYXdMaW5lcy5wdXNoKHtcbiAgICAgIGxpbmVOdW06IGkgKyAxLFxuICAgICAgaW5kZW50OiBsaW5lLnNlYXJjaCgvXFxTLyksXG4gICAgICBjb250ZW50OiBsaW5lLnRyaW0oKVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHJhd0xpbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcnM6IFt7IGxpbmU6IDAsIG1lc3NhZ2U6ICfovpPlhaXkuLrnqbonIH1dIH07XG4gIH1cblxuICAvLyDpgJDooYzop6PmnpDvvIxpbmRlbnQ9MCDnmoTooYzkvZzkuLrlnZflpLRcbiAgbGV0IGkgPSAwO1xuICB3aGlsZSAoaSA8IHJhd0xpbmVzLmxlbmd0aCkge1xuICAgIGNvbnN0IHJsID0gcmF3TGluZXNbaV07XG5cbiAgICBpZiAocmwuaW5kZW50ICE9PSAwKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDmhI/lpJbnmoTnvKnov5vooYw6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihcXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcblxuICAgIGlmIChibG9ja05hbWVzLmhhcyhuYW1lKSkge1xuICAgICAgZXJyb3JzLnB1c2goe1xuICAgICAgICBsaW5lOiBybC5saW5lTnVtLFxuICAgICAgICBtZXNzYWdlOiBg6YeN5aSN5a6a5LmJOiBcIiR7bmFtZX1cImAsXG4gICAgICAgIHN1Z2dlc3Rpb246ICflkIznrJTorrDlhoXlnZflkI3lv4XpobvllK/kuIAnXG4gICAgICB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBibG9ja05hbWVzLmFkZChuYW1lKTtcblxuICAgIGNvbnN0IGJsb2NrOiBGaWVsZEJsb2NrID0ge1xuICAgICAgbmFtZSxcbiAgICAgIHdpZHRoOiBwYXJzZUludCh3aWR0aFN0ciwgMTApLFxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuXG4gICAgLy8g5pS26ZuG5a2Q5a2X5q6177yI6L+e57ut55qE57yp6L+b6KGM77yJXG4gICAgaSsrO1xuICAgIGNvbnN0IGNoaWxkcmVuU3RhcnQgPSBpO1xuICAgIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoICYmIHJhd0xpbmVzW2ldLmluZGVudCA+IDApIHtcbiAgICAgIGkrKztcbiAgICB9XG4gICAgY29uc3QgY2hpbGRyZW5MaW5lcyA9IHJhd0xpbmVzLnNsaWNlKGNoaWxkcmVuU3RhcnQsIGkpO1xuXG4gICAgaWYgKGNoaWxkcmVuTGluZXMubGVuZ3RoID4gMCkge1xuICAgICAgcGFyc2VDaGlsZHJlbihjaGlsZHJlbkxpbmVzLCBibG9jay5jaGlsZHJlbiwgZXJyb3JzLCAwLCBuYW1lKTtcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpO1xuICAgICAgYXV0b0ZpbGxSZXNlcnZlZChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpO1xuICAgIH1cblxuICAgIC8vIOmqjOivgeS9jeWuvVxuICAgIHZhbGlkYXRlQml0V2lkdGhzKGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMpO1xuXG4gICAgYmxvY2tzLnNldChuYW1lLCBibG9jayk7XG4gIH1cblxuICBpZiAoYmxvY2tzLnNpemUgPT09IDApIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn5pyq5om+5Yiw5pyJ5pWI55qE5a6a5LmJ5Z2XJyB9XSB9O1xuICB9XG5cbiAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xuICB9XG5cbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmxvY2tzIH07XG59XG5cbi8qKlxuICog6Kej5p6Q5a2Q5a2X5q615YiX6KGoXG4gKi9cbmZ1bmN0aW9uIHBhcnNlQ2hpbGRyZW4oXG4gIGxpbmVzOiBSYXdMaW5lW10sXG4gIGNoaWxkcmVuOiBCaXRGaWVsZFtdLFxuICBlcnJvcnM6IFBhcnNlRXJyb3JbXSxcbiAgYmFzZUluZGVudDogbnVtYmVyLFxuICBwYXJlbnROYW1lOiBzdHJpbmdcbik6IHZvaWQge1xuICBjb25zdCBzdGFjazogeyBmaWVsZDogQml0RmllbGQ7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qgcmwgb2YgbGluZXMpIHtcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oQD9cXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcbiAgICBjb25zdCB3aWR0aCA9IHBhcnNlSW50KHdpZHRoU3RyLCAxMCk7XG4gICAgY29uc3QgaXNSZWZlcmVuY2UgPSBuYW1lLnN0YXJ0c1dpdGgoJ0AnKTtcbiAgICBjb25zdCByZWZOYW1lID0gaXNSZWZlcmVuY2UgPyBuYW1lLnNsaWNlKDEpIDogbmFtZTtcblxuICAgIC8vIOW1jOWll+Wxgue6p+ajgOafpVxuICAgIGNvbnN0IGRlcHRoID0gTWF0aC5mbG9vcigocmwuaW5kZW50IC0gYmFzZUluZGVudCkgLyAyKSArIDE7XG4gICAgaWYgKGRlcHRoID4gNSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5bWM5aWX5bGC57qn6L+H5rexICgke2RlcHRofSDlsYIp77yM5pyA5aSaIDUg5bGCYCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkOiBCaXRGaWVsZCA9IHtcbiAgICAgIG5hbWU6IHJlZk5hbWUsXG4gICAgICB3aWR0aCxcbiAgICAgIG1zYjogMCxcbiAgICAgIGxzYjogMCxcbiAgICAgIGRlc2NyaXB0aW9uOiBkZXNjPy50cmltKCkgfHwgdW5kZWZpbmVkLFxuICAgICAgaXNSZXNlcnZlZDogbmFtZS50b0xvd2VyQ2FzZSgpID09PSAncmVzZXJ2ZWQnLFxuICAgICAgaXNSZWZlcmVuY2UsXG4gICAgICByZWZOYW1lOiBpc1JlZmVyZW5jZSA/IHJlZk5hbWUgOiB1bmRlZmluZWQsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuXG4gICAgLy8g5om+54i25a2X5q6177ya5LuO5qCI5Lit5om+57yp6L+b5q+U5b2T5YmN5bCP55qE5pyA5ZCO5LiA5LiqXG4gICAgbGV0IHBhcmVudDogQml0RmllbGQgfCBudWxsID0gbnVsbDtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdG9wID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XG4gICAgICBpZiAodG9wLmluZGVudCA8IHJsLmluZGVudCkge1xuICAgICAgICBwYXJlbnQgPSB0b3AuZmllbGQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgc3RhY2sucG9wKCk7XG4gICAgfVxuXG4gICAgaWYgKHBhcmVudCkge1xuICAgICAgaWYgKCFwYXJlbnQuY2hpbGRyZW4pIHBhcmVudC5jaGlsZHJlbiA9IFtdO1xuICAgICAgcGFyZW50LmNoaWxkcmVuLnB1c2goZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGlsZHJlbi5wdXNoKGZpZWxkKTtcbiAgICB9XG5cbiAgICBzdGFjay5wdXNoKHsgZmllbGQsIGluZGVudDogcmwuaW5kZW50IH0pO1xuICB9XG59XG5cbi8qKlxuICog6K6h566XIGJpdCDojIPlm7RcbiAqIOmdoOWJjeWumuS5ieeahOaYryBMU0LvvIzpnaDlkI7lrprkuYnnmoTmmK8gTVNCXG4gKi9cbmZ1bmN0aW9uIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IGN1cnJlbnRMc2IgPSAwO1xuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGZpZWxkLmxzYiA9IGN1cnJlbnRMc2I7XG4gICAgZmllbGQubXNiID0gY3VycmVudExzYiArIGZpZWxkLndpZHRoIC0gMTtcbiAgICBjdXJyZW50THNiID0gZmllbGQubXNiICsgMTtcbiAgICBpZiAoIWZpZWxkLmlzUmVmZXJlbmNlICYmIGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZC5jaGlsZHJlbiwgZmllbGQud2lkdGgpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIOW9k+WtkOWtl+auteaAu+S9jeWuveS4jeWkn+aXtu+8jOWcqCBNU0Ig56uv6Ieq5Yqo6KGlIHJlc2VydmVkXG4gKi9cbmZ1bmN0aW9uIGF1dG9GaWxsUmVzZXJ2ZWQoZmllbGRzOiBCaXRGaWVsZFtdLCBwYXJlbnRXaWR0aDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHRvdGFsQ2hpbGRXaWR0aCA9IGZpZWxkcy5yZWR1Y2UoKHN1bSwgZikgPT4gc3VtICsgZi53aWR0aCwgMCk7XG4gIGNvbnN0IHJlbWFpbmluZyA9IHBhcmVudFdpZHRoIC0gdG90YWxDaGlsZFdpZHRoO1xuICBpZiAocmVtYWluaW5nID4gMCkge1xuICAgIGNvbnN0IHJlc2VydmVkOiBCaXRGaWVsZCA9IHtcbiAgICAgIG5hbWU6ICdyZXNlcnZlZCcsXG4gICAgICB3aWR0aDogcmVtYWluaW5nLFxuICAgICAgbXNiOiAwLFxuICAgICAgbHNiOiAwLFxuICAgICAgaXNSZXNlcnZlZDogdHJ1ZSxcbiAgICAgIGlzUmVmZXJlbmNlOiBmYWxzZSxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG4gICAgZmllbGRzLnB1c2gocmVzZXJ2ZWQpO1xuICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHMsIHBhcmVudFdpZHRoKTtcbiAgfVxufVxuXG4vKipcbiAqIOmqjOivgeS9jeWuvVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZUJpdFdpZHRocyhmaWVsZHM6IEJpdEZpZWxkW10sIGVycm9yczogUGFyc2VFcnJvcltdKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcbiAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY2hpbGRyZW5XaWR0aCA9IGNoaWxkcmVuLnJlZHVjZSgoc3VtLCBjaGlsZCkgPT4gc3VtICsgY2hpbGQud2lkdGgsIDApO1xuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xuICAgICAgICBlcnJvcnMucHVzaCh7XG4gICAgICAgICAgbGluZTogMCxcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXG4gICAgICAgICAgc3VnZ2VzdGlvbjogYOeItuWtl+autTogJHtmaWVsZC53aWR0aH0tYml0LCDlrZDlrZfmrrXmgLvlkow6ICR7Y2hpbGRyZW5XaWR0aH0tYml0LCDliankvZnnqbrpl7Q6ICR7ZmllbGQud2lkdGggLSBjaGlsZHJlbldpZHRofS1iaXRgXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdmFsaWRhdGVCaXRXaWR0aHMoY2hpbGRyZW4sIGVycm9ycyk7XG4gICAgfVxuICB9XG59XG4iLCIvKipcbiAqIOminOiJsuaWueahiFxuICovXG5cbmV4cG9ydCB0eXBlIFN2Z1RoZW1lID0gJ3Bhc3RlbCcgfCAndml2aWQnIHwgJ21vbm8nO1xuXG4vLyDkuLvoibLvvIjpobblsYLlrZfmrrXvvInigJQg5p+U5ZKM5rWF6ImyXG5jb25zdCBQQVNURUxfQ09MT1JTID0gW1xuICAnI0IzRDRGMCcsIC8vIOa1heiTnVxuICAnI0I4RTBCOCcsIC8vIOa1hee7v1xuICAnI0Y1RDZBOCcsIC8vIOa1heapmVxuICAnI0Q0QjhFOCcsIC8vIOa1hee0q1xuICAnI0E4RTBENicsIC8vIOa1hemdklxuICAnI0YwQjhCOCcsIC8vIOa1hee6olxuXTtcblxuLy8g6bKc6Imz6ImyXG5jb25zdCBWSVZJRF9DT0xPUlMgPSBbXG4gICcjNUI5QkQ1JywgLy8g6JOdXG4gICcjNzBBRDQ3JywgLy8g57u/XG4gICcjRUQ3RDMxJywgLy8g5qmZXG4gICcjOUI1OUI2JywgLy8g57SrXG4gICcjMUFCQzlDJywgLy8g6Z2SXG4gICcjRTc0QzNDJywgLy8g57qiXG5dO1xuXG4vLyDngbDluqboibJcbmNvbnN0IE1PTk9fQ09MT1JTID0gW1xuICAnI0MwQzBDMCcsIC8vIOa1heeBsFxuICAnI0E4QThBOCcsIC8vIOS4reeBsFxuICAnI0QwRDBEMCcsIC8vIOS6rueBsFxuICAnI0IwQjBCMCcsIC8vIOmTtueBsFxuICAnI0M4QzhDOCcsIC8vIOa3oeeBsFxuICAnI0I4QjhCOCcsIC8vIOaal+mTtlxuXTtcblxuY29uc3QgVEhFTUVfTUFQOiBSZWNvcmQ8U3ZnVGhlbWUsIHN0cmluZ1tdPiA9IHtcbiAgcGFzdGVsOiBQQVNURUxfQ09MT1JTLFxuICB2aXZpZDogVklWSURfQ09MT1JTLFxuICBtb25vOiBNT05PX0NPTE9SUyxcbn07XG5cbi8vIOS/neeVmeiJslxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0U4RThFOCc7XG5cbi8qKlxuICog6I635Y+W5a2X5q616aKc6ImyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWVsZENvbG9yKGluZGV4OiBudW1iZXIsIGlzUmVzZXJ2ZWQ6IGJvb2xlYW4sIGRlcHRoOiBudW1iZXIgPSAwLCB0aGVtZTogU3ZnVGhlbWUgPSAncGFzdGVsJyk6IHN0cmluZyB7XG4gIGlmIChpc1Jlc2VydmVkKSB7XG4gICAgcmV0dXJuIFJFU0VSVkVEX0NPTE9SO1xuICB9XG5cbiAgY29uc3QgcGFsZXR0ZSA9IFRIRU1FX01BUFt0aGVtZV0gfHwgUEFTVEVMX0NPTE9SUztcbiAgY29uc3QgYmFzZUNvbG9yID0gcGFsZXR0ZVtpbmRleCAlIHBhbGV0dGUubGVuZ3RoXTtcblxuICBpZiAoZGVwdGggPT09IDApIHtcbiAgICByZXR1cm4gYmFzZUNvbG9yO1xuICB9XG5cbiAgLy8g5a2Q5a2X5q6177ya5Z+65LqO54i26Imy6LCD5pW05Lqu5bqmXG4gIHJldHVybiBhZGp1c3RCcmlnaHRuZXNzKGJhc2VDb2xvciwgZGVwdGggKiAxMCk7XG59XG5cbi8qKlxuICog6LCD5pW06aKc6Imy5Lqu5bqmXG4gKi9cbmZ1bmN0aW9uIGFkanVzdEJyaWdodG5lc3MoaGV4OiBzdHJpbmcsIHBlcmNlbnQ6IG51bWJlcik6IHN0cmluZyB7XG4gIGhleCA9IGhleC5yZXBsYWNlKCcjJywgJycpO1xuXG4gIGNvbnN0IHIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDAsIDIpLCAxNik7XG4gIGNvbnN0IGcgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDIsIDQpLCAxNik7XG4gIGNvbnN0IGIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDQsIDYpLCAxNik7XG5cbiAgY29uc3QgYWRqdXN0ID0gKGNoYW5uZWw6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IGFkanVzdGVkID0gTWF0aC5yb3VuZChjaGFubmVsICsgKDI1NSAtIGNoYW5uZWwpICogKHBlcmNlbnQgLyAxMDApKTtcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xuICB9O1xuXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XG4gIGNvbnN0IG5ld0cgPSBhZGp1c3QoZyk7XG4gIGNvbnN0IG5ld0IgPSBhZGp1c3QoYik7XG5cbiAgY29uc3QgdG9IZXggPSAobjogbnVtYmVyKSA9PiBuLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpO1xuICByZXR1cm4gYCMke3RvSGV4KG5ld1IpfSR7dG9IZXgobmV3Ryl9JHt0b0hleChuZXdCKX1gO1xufVxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGdldEZpZWxkQ29sb3IsIFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xuXG4vKipcbiAqIFNWRyDmuLLmn5PphY3nva5cbiAqL1xuaW50ZXJmYWNlIFJlbmRlckNvbmZpZyB7XG4gIC8qKiDmgLvkvY3lrr0gKi9cbiAgdG90YWxXaWR0aDogbnVtYmVyO1xuICAvKiog5piv5ZCm57q15ZCR5o6S5YiXICovXG4gIGlzVmVydGljYWw6IGJvb2xlYW47XG4gIC8qKiDlrZfmrrXmoYbpq5jluqYgKi9cbiAgYm94SGVpZ2h0OiBudW1iZXI7XG4gIC8qKiDlrZfkvZPlpKflsI8gKi9cbiAgZm9udFNpemU6IG51bWJlcjtcbiAgLyoqIFNWRyDkuLvpopggKi9cbiAgdGhlbWU6IFN2Z1RoZW1lO1xufVxuXG4vKipcbiAqIOiuoeeul+Wtl+auteagh+etvuaJgOmcgOeahOacgOWwj+WuveW6pu+8iOWDj+e0oO+8iVxuICovXG5mdW5jdGlvbiBjYWxjTWluTGFiZWxXaWR0aChsYWJlbDogc3RyaW5nLCBmb250U2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIGxhYmVsLmxlbmd0aCAqIGZvbnRTaXplICogMC42ICsgMjA7XG59XG5cbi8qKlxuICog5Yik5pat5piv5ZCm5bqU5L2/55So57q15ZCR5biD5bGAXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVzZVZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgdG90YWxXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0b3RhbFdpZHRoID4gNjQpIHJldHVybiB0cnVlO1xuXG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3QgYXZhaWxhYmxlV2lkdGggPSBzdmdXaWR0aCAtIDEyMDtcblxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkLmlzUmVzZXJ2ZWQgPyAncmVzZXJ2ZWQnIDogKGZpZWxkLmlzUmVmZXJlbmNlID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICAgIGNvbnN0IGxhYmVsID0gYCR7ZmllbGROYW1lfVske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XG4gICAgY29uc3Qgd2lkdGhSYXRpbyA9IGZpZWxkLndpZHRoIC8gdG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBtaW5XaWR0aCA9IGNhbGNNaW5MYWJlbFdpZHRoKGxhYmVsLCAxNCk7XG4gICAgaWYgKGJveFdpZHRoIDwgbWluV2lkdGgpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiDmuLLmn5PlnZfnmoQgU1ZHIOS9jeWfn+WbvlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tTdmcoYmxvY2s6IEZpZWxkQmxvY2ssIHRoZW1lOiBTdmdUaGVtZSA9ICdwYXN0ZWwnLCBib3hIZWlnaHQ6IG51bWJlciA9IDQ0KTogc3RyaW5nIHtcbiAgY29uc3QgY29uZmlnOiBSZW5kZXJDb25maWcgPSB7XG4gICAgdG90YWxXaWR0aDogYmxvY2sud2lkdGgsXG4gICAgaXNWZXJ0aWNhbDogc2hvdWxkVXNlVmVydGljYWwoYmxvY2suY2hpbGRyZW4sIGJsb2NrLndpZHRoKSxcbiAgICBib3hIZWlnaHQsXG4gICAgZm9udFNpemU6IDIyLFxuICAgIHRoZW1lLFxuICB9O1xuXG4gIGlmIChjb25maWcuaXNWZXJ0aWNhbCkge1xuICAgIHJldHVybiByZW5kZXJWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgY29uZmlnKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcmVuZGVySG9yaXpvbnRhbChibG9jay5jaGlsZHJlbiwgY29uZmlnKTtcbiAgfVxufVxuXG4vKipcbiAqIOaoquWQkea4suafk1xuICovXG5mdW5jdGlvbiByZW5kZXJIb3Jpem9udGFsKGZpZWxkczogQml0RmllbGRbXSwgY29uZmlnOiBSZW5kZXJDb25maWcpOiBzdHJpbmcge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IGNvbmZpZy5ib3hIZWlnaHQgKyA1MDtcbiAgY29uc3Qgc3RhcnRYID0gNjA7XG4gIGNvbnN0IHN0YXJ0WSA9IDE1O1xuICBjb25zdCBhdmFpbGFibGVXaWR0aCA9IHN2Z1dpZHRoIC0gMTIwO1xuXG4gIGxldCBzdmcgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAke3N2Z1dpZHRofSAke3N2Z0hlaWdodH1cIiB3aWR0aD1cIjEwMCVcIj5gO1xuXG4gIGxldCBjdXJyZW50WCA9IHN0YXJ0WDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCB3aWR0aFJhdGlvID0gZmllbGQud2lkdGggLyBjb25maWcudG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCwgY29uZmlnLnRoZW1lKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIGN1cnJlbnRYLCBzdGFydFksIGJveFdpZHRoLCBjb25maWcuYm94SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplLCAnaG9yaXpvbnRhbCcpO1xuICAgIGN1cnJlbnRYICs9IGJveFdpZHRoO1xuICB9XG5cbiAgLy8gTFNCIOKGkiBNU0Ig5pa55ZCR566t5aS0XG4gIGNvbnN0IGFycm93WSA9IHN0YXJ0WSArIGNvbmZpZy5ib3hIZWlnaHQgKyAyMjtcbiAgY29uc3QgZnMgPSBjb25maWcuZm9udFNpemUgKiAwLjg1O1xuICBjb25zdCBmaWVsZExlZnQgPSBzdGFydFg7XG4gIGNvbnN0IGZpZWxkUmlnaHQgPSBzdGFydFggKyBhdmFpbGFibGVXaWR0aDtcbiAgLy8gTFNCIOWPs+Wvuem9kOWIsOWtl+auteahhuW3pui+uee8mFxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2ZpZWxkTGVmdH1cIiB5PVwiJHthcnJvd1kgKyA1fVwiIGZvbnQtc2l6ZT1cIiR7ZnN9XCIgdGV4dC1hbmNob3I9XCJlbmRcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICAvLyDnrq3lpLTmr5TlrZfmrrXmoYbnqoTkuIDngrnvvIzkuKTnq6/nlZnnqbpcbiAgY29uc3QgYXJyb3dQYWQgPSAxMDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7ZmllbGRMZWZ0ICsgYXJyb3dQYWR9XCIgeTE9XCIke2Fycm93WX1cIiB4Mj1cIiR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gOH1cIiB5Mj1cIiR7YXJyb3dZfVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZH0sJHthcnJvd1l9ICR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gMTB9LCR7YXJyb3dZIC0gNX0gJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSAxMH0sJHthcnJvd1kgKyA1fVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIC8vIE1TQiDlt6blr7npvZDliLDlrZfmrrXmoYblj7PovrnnvJhcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtmaWVsZFJpZ2h0fVwiIHk9XCIke2Fycm93WSArIDV9XCIgZm9udC1zaXplPVwiJHtmc31cIiBmaWxsPVwiIzk5OVwiPk1TQjwvdGV4dD5gO1xuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDnurXlkJHmuLLmn5PvvIh2aWV3Qm94IOWuveW6puS4juaoquWQkeS4gOiHtO+8jOS/neaMgeWtl+S9k+inhuinieWkp+Wwj+S4gOiHtO+8iVxuICovXG5mdW5jdGlvbiByZW5kZXJWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIGNvbmZpZzogUmVuZGVyQ29uZmlnKTogc3RyaW5nIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCByb3dIZWlnaHQgPSBjb25maWcuYm94SGVpZ2h0O1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gMjI7XG4gIGNvbnN0IGJveFdpZHRoID0gc3ZnV2lkdGggLSAxNjA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQgKyAyNTtcblxuICBsZXQgc3ZnID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgJHtzdmdXaWR0aH0gJHtzdmdIZWlnaHR9XCIgd2lkdGg9XCIxMDAlXCI+YDtcblxuICBsZXQgY3VycmVudFkgPSBzdGFydFk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZmllbGQgPSBmaWVsZHNbaV07XG4gICAgY29uc3QgY29sb3IgPSBnZXRGaWVsZENvbG9yKGksIGZpZWxkLmlzUmVzZXJ2ZWQsIDAsIGNvbmZpZy50aGVtZSk7XG4gICAgc3ZnICs9IHJlbmRlckZpZWxkQm94KGZpZWxkLCBzdGFydFgsIGN1cnJlbnRZLCBib3hXaWR0aCwgcm93SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplKTtcbiAgICBjdXJyZW50WSArPSByb3dIZWlnaHQ7XG4gIH1cblxuICAvLyBMU0Ig4oaSIE1TQiDmlrnlkJHnrq3lpLTvvIjnurXlkJHvvJrku47kuIrliLDkuIvvvIlcbiAgY29uc3QgYXJyb3dYID0gc3RhcnRYICsgYm94V2lkdGggKyAyNDtcbiAgY29uc3QgYXJyb3dUb3AgPSBzdGFydFk7XG4gIGNvbnN0IGFycm93Qm90dG9tID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7YXJyb3dYfVwiIHkxPVwiJHthcnJvd1RvcCArIDh9XCIgeDI9XCIke2Fycm93WH1cIiB5Mj1cIiR7YXJyb3dCb3R0b20gLSA4fVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2Fycm93WH0sJHthcnJvd0JvdHRvbX0gJHthcnJvd1ggLSA1fSwke2Fycm93Qm90dG9tIC0gMTB9ICR7YXJyb3dYICsgNX0sJHthcnJvd0JvdHRvbSAtIDEwfVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7YXJyb3dYfVwiIHk9XCIke2Fycm93VG9wIC0gNH1cIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZSAqIDAuODV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fycm93WH1cIiB5PVwiJHthcnJvd0JvdHRvbSArIDE4fVwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplICogMC44NX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOa4suafk+Wtl+auteahhlxuICogQHBhcmFtIGxheW91dERpcmVjdGlvbiDluIPlsYDmlrnlkJHvvIznlKjkuo7lhrPlrprniLblrZfmrrXntKLlvJXmoIfms6jkvY3nva5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyRmllbGRCb3goXG4gIGZpZWxkOiBCaXRGaWVsZCxcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHdpZHRoOiBudW1iZXIsXG4gIGhlaWdodDogbnVtYmVyLFxuICBjb2xvcjogc3RyaW5nLFxuICBmb250U2l6ZTogbnVtYmVyLFxuICBsYXlvdXREaXJlY3Rpb246ICdob3Jpem9udGFsJyB8ICd2ZXJ0aWNhbCcgPSAndmVydGljYWwnXG4pOiBzdHJpbmcge1xuICBsZXQgc3ZnID0gJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgZmllbGROYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuXG4gIGNvbnN0IHN0cm9rZURhc2ggPSBpc1JlZiA/ICcgc3Ryb2tlLWRhc2hhcnJheT1cIjYsM1wiJyA6ICcnO1xuICBjb25zdCBzdHJva2VDb2xvciA9IGlzUmVmID8gJyM0QTkwRDknIDogJyNmZmYnO1xuICBzdmcgKz0gYDxyZWN0IHg9XCIke3h9XCIgeT1cIiR7eX1cIiB3aWR0aD1cIiR7d2lkdGh9XCIgaGVpZ2h0PVwiJHtoZWlnaHR9XCIgZmlsbD1cIiR7Y29sb3J9XCIgc3Ryb2tlPVwiJHtzdHJva2VDb2xvcn1cIiBzdHJva2Utd2lkdGg9XCIyXCIgcng9XCI0XCIgcnk9XCI0XCIgZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCIvPmA7XG5cbiAgLy8g5qGG5YaF77ya5a2X5q616Ieq6Lqr57Si5byVIFt3aWR0aC0xOjBd77yM5Y2VIGJpdCDlrZfmrrXnnIHnlaXntKLlvJVcbiAgY29uc3Qgc2VsZkhpZ2ggPSBmaWVsZC53aWR0aCAtIDE7XG4gIGNvbnN0IHNlbGZMYWJlbCA9IHNlbGZIaWdoID09PSAwID8gZmllbGROYW1lIDogYCR7ZmllbGROYW1lfVske3NlbGZIaWdofTowXWA7XG4gIGNvbnN0IHRleHRYID0geCArIHdpZHRoIC8gMjtcbiAgY29uc3QgdGV4dFkgPSB5ICsgaGVpZ2h0IC8gMjtcbiAgY29uc3QgdGV4dFdpZHRoID0gd2lkdGggLSAxNjtcbiAgY29uc3QgbWF4Q2hhcnMgPSBNYXRoLmZsb29yKHRleHRXaWR0aCAvIChmb250U2l6ZSAqIDAuNikpO1xuXG4gIGxldCBkaXNwbGF5VGV4dCA9IHNlbGZMYWJlbDtcbiAgaWYgKHNlbGZMYWJlbC5sZW5ndGggPiBtYXhDaGFycyAmJiBtYXhDaGFycyA+IDMpIHtcbiAgICBkaXNwbGF5VGV4dCA9IHNlbGZMYWJlbC5zdWJzdHJpbmcoMCwgbWF4Q2hhcnMgLSAyKSArICcuLic7XG4gIH1cblxuICBjb25zdCB0ZXh0RGVjb3JhdGlvbiA9ICcnO1xuICBjb25zdCBmaWxsQ29sb3IgPSBpc1JzdiA/ICcjODg4JyA6ICcjMzMzJztcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHt0ZXh0WH1cIiB5PVwiJHt0ZXh0WX1cIiBmb250LXNpemU9XCIke2ZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiR7ZmlsbENvbG9yfVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCIke3RleHREZWNvcmF0aW9ufSBkYXRhLWZpZWxkPVwiJHtmaWVsZE5hbWV9XCIke2lzUmVmID8gYCBkYXRhLXJlZj1cIiR7ZmllbGQucmVmTmFtZX1cImAgOiAnJ30gc3R5bGU9XCJjdXJzb3I6JHtpc1JlZiA/ICdwb2ludGVyJyA6ICdkZWZhdWx0J31cIj4ke2Rpc3BsYXlUZXh0fTwvdGV4dD5gO1xuXG4gIC8vIOahhuWklu+8mueItuWtl+autee0ouW8lSBbbXNiOmxzYl3vvIzngbDoibLlsI/lrZdcbiAgY29uc3QgcGFyZW50SGlnaCA9IGZpZWxkLm1zYjtcbiAgY29uc3QgcGFyZW50TG93ID0gZmllbGQubHNiO1xuICBjb25zdCBwYXJlbnRMYWJlbCA9IHBhcmVudEhpZ2ggPT09IHBhcmVudExvdyA/IGBbJHtwYXJlbnRIaWdofV1gIDogYFske3BhcmVudEhpZ2h9OiR7cGFyZW50TG93fV1gO1xuICBjb25zdCBhbm5vdGF0aW9uRm9udFNpemUgPSBmb250U2l6ZSAqIDAuNztcblxuICBpZiAobGF5b3V0RGlyZWN0aW9uID09PSAndmVydGljYWwnKSB7XG4gICAgLy8g57q15ZCR77ya5qCH5rOo5Zyo5bem5L6n77yM5Y+z5a+56b2QXG4gICAgY29uc3QgYW5ub3RYID0geCAtIDg7XG4gICAgY29uc3QgYW5ub3RZID0gdGV4dFk7XG4gICAgc3ZnICs9IGA8dGV4dCB4PVwiJHthbm5vdFh9XCIgeT1cIiR7YW5ub3RZfVwiIGZvbnQtc2l6ZT1cIiR7YW5ub3RhdGlvbkZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwiZW5kXCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiM5OTlcIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiPiR7cGFyZW50TGFiZWx9PC90ZXh0PmA7XG4gIH0gZWxzZSB7XG4gICAgLy8g5qiq5ZCR77ya5qCH5rOo5Zyo5LiK5pa577yM5bGF5LitXG4gICAgY29uc3QgYW5ub3RYID0gdGV4dFg7XG4gICAgY29uc3QgYW5ub3RZID0geSAtIDg7XG4gICAgc3ZnICs9IGA8dGV4dCB4PVwiJHthbm5vdFh9XCIgeT1cIiR7YW5ub3RZfVwiIGZvbnQtc2l6ZT1cIiR7YW5ub3RhdGlvbkZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIiM5OTlcIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiPiR7cGFyZW50TGFiZWx9PC90ZXh0PmA7XG4gIH1cblxuICByZXR1cm4gc3ZnO1xufVxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiDmuLLmn5PlnZfnmoQgSFRNTCDooajmoLxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrVGFibGUoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xuICBjb25zdCByb3dzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY2hpbGRyZW4pIHtcbiAgICBjb2xsZWN0Um93cyhjaGlsZCwgMCwgcm93cyk7XG4gIH1cblxuICBsZXQgaHRtbCA9ICc8dGFibGUgY2xhc3M9XCJ2ZXJpbG9nLWJpdGZpZWxkLXRhYmxlXCI+JztcbiAgaHRtbCArPSAnPHRoZWFkPjx0cj4nO1xuICBodG1sICs9ICc8dGg+RmllbGQ8L3RoPic7XG4gIGh0bWwgKz0gJzx0aD5XaWR0aDwvdGg+JztcbiAgaHRtbCArPSAnPHRoPkJpdCBSYW5nZTwvdGg+JztcbiAgaHRtbCArPSAnPHRoPkRlc2NyaXB0aW9uPC90aD4nO1xuICBodG1sICs9ICc8L3RyPjwvdGhlYWQ+JztcbiAgaHRtbCArPSAnPHRib2R5Pic7XG4gIGh0bWwgKz0gcm93cy5qb2luKCcnKTtcbiAgaHRtbCArPSAnPC90Ym9keT48L3RhYmxlPic7XG4gIHJldHVybiBodG1sO1xufVxuXG4vKipcbiAqIOmAkuW9kuaUtumbhuihqOagvOihjFxuICovXG5mdW5jdGlvbiBjb2xsZWN0Um93cyhmaWVsZDogQml0RmllbGQsIGRlcHRoOiBudW1iZXIsIHJvd3M6IHN0cmluZ1tdKTogdm9pZCB7XG4gIGNvbnN0IGluZGVudCA9IGRlcHRoID4gMCA/ICcmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsnLnJlcGVhdChkZXB0aCkgOiAnJztcbiAgY29uc3QgaXNSZWYgPSBmaWVsZC5pc1JlZmVyZW5jZTtcbiAgY29uc3QgaXNSc3YgPSBmaWVsZC5pc1Jlc2VydmVkO1xuICBjb25zdCBuYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICBjb25zdCBiaXRSYW5nZSA9IGBbJHtmaWVsZC5tc2J9OiR7ZmllbGQubHNifV1gO1xuICBjb25zdCBkZXNjcmlwdGlvbiA9IGZpZWxkLmRlc2NyaXB0aW9uIHx8ICcnO1xuXG4gIGxldCByb3dDbGFzcyA9ICcnO1xuICBpZiAoaXNSc3YpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlc2VydmVkLXJvd1wiJztcbiAgZWxzZSBpZiAoaXNSZWYpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlZi1jaGlsZFwiJztcblxuICBjb25zdCBuYW1lQ2VsbCA9IGlzUmVmXG4gICAgPyBgPGEgaHJlZj1cIiNcIiBjbGFzcz1cImJmLXJlZi1saW5rXCIgZGF0YS10YXJnZXQ9XCIke2ZpZWxkLnJlZk5hbWV9XCI+JHtpbmRlbnR9JHtuYW1lfTwvYT5gXG4gICAgOiBgJHtpbmRlbnR9JHtuYW1lfWA7XG5cbiAgcm93cy5wdXNoKGA8dHIke3Jvd0NsYXNzfT5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtuYW1lQ2VsbH08L3RkPmApO1xuICByb3dzLnB1c2goYDx0ZD4ke2ZpZWxkLndpZHRofTwvdGQ+YCk7XG4gIHJvd3MucHVzaChgPHRkPiR7Yml0UmFuZ2V9PC90ZD5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtkZXNjcmlwdGlvbn08L3RkPmApO1xuICByb3dzLnB1c2goJzwvdHI+Jyk7XG5cbiAgaWYgKGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZpZWxkLmNoaWxkcmVuKSB7XG4gICAgICBjb2xsZWN0Um93cyhjaGlsZCwgZGVwdGggKyAxLCByb3dzKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IEFwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB0eXBlIFZlcmlsb2dCaXRmaWVsZFBsdWdpbiBmcm9tICcuL21haW4nO1xuaW1wb3J0IHR5cGUgeyBUYWJsZVRoZW1lIH0gZnJvbSAnLi9tYWluJztcbmltcG9ydCB0eXBlIHsgU3ZnVGhlbWUgfSBmcm9tICcuL2NvbG9ycyc7XG5cbmNvbnN0IFRBQkxFX1RIRU1FX0xBQkVMUzogUmVjb3JkPFRhYmxlVGhlbWUsIHN0cmluZz4gPSB7XG4gIGRlZmF1bHQ6ICdEZWZhdWx0IOKAlCBncmlkIGxpbmVzLCBncmF5IGhlYWRlcicsXG4gIG1pbmltYWw6ICdNaW5pbWFsIOKAlCBob3Jpem9udGFsIGxpbmVzIG9ubHknLFxuICB6ZWJyYTogJ1plYnJhIOKAlCBhbHRlcm5hdGluZyByb3cgY29sb3JzJyxcbiAgY2xlYW46ICdDbGVhbiDigJQgbm8gYm9yZGVycywgd2hpdGVzcGFjZSBzZXBhcmF0aW9uJyxcbiAgJ2RhcmstaGVhZGVyJzogJ0RhcmsgSGVhZGVyIOKAlCBkYXJrIGhlYWRlciwgY2xlYW4gYm9keScsXG59O1xuXG5jb25zdCBTVkdfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8U3ZnVGhlbWUsIHN0cmluZz4gPSB7XG4gIHBhc3RlbDogJ1Bhc3RlbCDigJQgc29mdCBwYXN0ZWwgY29sb3JzJyxcbiAgdml2aWQ6ICdWaXZpZCDigJQgYm9sZCBzYXR1cmF0ZWQgY29sb3JzJyxcbiAgbW9ubzogJ01vbm8g4oCUIGdyYXlzY2FsZScsXG59O1xuXG5leHBvcnQgY2xhc3MgVmVyaWxvZ0JpdGZpZWxkU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IFZlcmlsb2dCaXRmaWVsZFBsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBWZXJpbG9nQml0ZmllbGRQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ1Zlcmlsb2cgQml0ZmllbGQnIH0pO1xuXG4gICAgLy8gU1ZHIOS4u+mimFxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1NWRyB0aGVtZScpXG4gICAgICAuc2V0RGVzYygnQ29sb3Igc2NoZW1lIGZvciBiaXRmaWVsZCBkaWFncmFtcycpXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcCA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgbGFiZWxdIG9mIE9iamVjdC5lbnRyaWVzKFNWR19USEVNRV9MQUJFTFMpKSB7XG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgICAgZHJvcC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnKTtcbiAgICAgICAgZHJvcC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z1RoZW1lID0gdmFsdWUgYXMgU3ZnVGhlbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4ucGx1Z2luRGF0YSk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVyZW5kZXJBbGxTdmcoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIC8vIFNWRyDooYzpq5hcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdTVkcgcm93IGhlaWdodCcpXG4gICAgICAuc2V0RGVzYygnSGVpZ2h0IG9mIGVhY2ggZmllbGQgcm93IGluIGJpdGZpZWxkIGRpYWdyYW1zIChweCknKVxuICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4ge1xuICAgICAgICBzbGlkZXIuc2V0TGltaXRzKDI4LCA4MCwgMik7XG4gICAgICAgIHNsaWRlci5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCAzOCk7XG4gICAgICAgIHNsaWRlci5zZXREeW5hbWljVG9vbHRpcCgpO1xuICAgICAgICBzbGlkZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhKTtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZXJlbmRlckFsbFN2ZygpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8g6KGo5qC85Li76aKYXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnVGFibGUgdGhlbWUnKVxuICAgICAgLnNldERlc2MoJ1Zpc3VhbCBzdHlsZSBmb3IgcmVuZGVyZWQgdGFibGVzJylcbiAgICAgIC5hZGREcm9wZG93bihkcm9wID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBsYWJlbF0gb2YgT2JqZWN0LmVudHJpZXMoVEFCTEVfVEhFTUVfTEFCRUxTKSkge1xuICAgICAgICAgIGRyb3AuYWRkT3B0aW9uKGtleSwgbGFiZWwpO1xuICAgICAgICB9XG4gICAgICAgIGRyb3Auc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luRGF0YS50YWJsZVRoZW1lIHx8ICdkZWZhdWx0Jyk7XG4gICAgICAgIGRyb3Aub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luRGF0YS50YWJsZVRoZW1lID0gdmFsdWUgYXMgVGFibGVUaGVtZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhKTtcbiAgICAgICAgICB0aGlzLmFwcGx5VGFibGVUaGVtZSh2YWx1ZSBhcyBUYWJsZVRoZW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIC8vIOihqOagvOihjOmrmFxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1RhYmxlIHJvdyBoZWlnaHQnKVxuICAgICAgLnNldERlc2MoJ1JvdyBoZWlnaHQgZm9yIHJlbmRlcmVkIHRhYmxlcyAocHgpJylcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHtcbiAgICAgICAgc2xpZGVyLnNldExpbWl0cygxOCwgNDgsIDIpO1xuICAgICAgICBzbGlkZXIuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luRGF0YS50YWJsZVJvd0hlaWdodCB8fCAyOCk7XG4gICAgICAgIHNsaWRlci5zZXREeW5hbWljVG9vbHRpcCgpO1xuICAgICAgICBzbGlkZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luRGF0YS50YWJsZVJvd0hlaWdodCA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEpO1xuICAgICAgICAgIHRoaXMuYXBwbHlUYWJsZVJvd0hlaWdodCh2YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5VGFibGVUaGVtZSh0aGVtZTogVGFibGVUaGVtZSk6IHZvaWQge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy52ZXJpbG9nLWJpdGZpZWxkLXRhYmxlLWNvbnRhaW5lcicpLmZvckVhY2goZWwgPT4ge1xuICAgICAgZWwuc2V0QXR0cmlidXRlKCdkYXRhLXRoZW1lJywgdGhlbWUpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVRhYmxlUm93SGVpZ2h0KGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWJmLXRhYmxlLXJvdy1oZWlnaHQnLCBgJHtoZWlnaHR9cHhgKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luLCBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0IH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuL3BhcnNlcic7XG5pbXBvcnQgeyByZW5kZXJCbG9ja1N2ZyB9IGZyb20gJy4vc3ZnUmVuZGVyZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tUYWJsZSB9IGZyb20gJy4vdGFibGVSZW5kZXJlcic7XG5pbXBvcnQgeyBSZWdpc3RyeUVudHJ5LCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBWZXJpbG9nQml0ZmllbGRTZXR0aW5nVGFiIH0gZnJvbSAnLi9zZXR0aW5ncyc7XG5pbXBvcnQgeyBTdmdUaGVtZSB9IGZyb20gJy4vY29sb3JzJztcblxuZXhwb3J0IHR5cGUgVGFibGVUaGVtZSA9ICdkZWZhdWx0JyB8ICdtaW5pbWFsJyB8ICd6ZWJyYScgfCAnY2xlYW4nIHwgJ2RhcmstaGVhZGVyJztcblxuZXhwb3J0IGludGVyZmFjZSBQbHVnaW5EYXRhIHtcbiAgZGVmYXVsdFZpZXc/OiAnc3ZnJyB8ICd0YWJsZSc7XG4gIHRhYmxlVGhlbWU/OiBUYWJsZVRoZW1lO1xuICBzdmdUaGVtZT86IFN2Z1RoZW1lO1xuICBzdmdCb3hIZWlnaHQ/OiBudW1iZXI7XG4gIHRhYmxlUm93SGVpZ2h0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9EQVRBOiBQbHVnaW5EYXRhID0geyBkZWZhdWx0VmlldzogJ3N2ZycsIHRhYmxlVGhlbWU6ICdkZWZhdWx0Jywgc3ZnVGhlbWU6ICdwYXN0ZWwnLCBzdmdCb3hIZWlnaHQ6IDM4LCB0YWJsZVJvd0hlaWdodDogMjggfTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmVyaWxvZ0JpdGZpZWxkUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcHJpdmF0ZSBibG9ja1JlZ2lzdHJ5OiBNYXA8c3RyaW5nLCBSZWdpc3RyeUVudHJ5PiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSBwZW5kaW5nUmVmczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgdGFyZ2V0TmFtZTogc3RyaW5nIH1bXSA9IFtdO1xuICBwcml2YXRlIGN1cnJlbnROb3RlUGF0aDogc3RyaW5nID0gJyc7XG4gIHByaXZhdGUgYWN0aXZlVG9vbHRpcDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB0b29sdGlwUmVtb3ZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcGx1Z2luRGF0YTogUGx1Z2luRGF0YSA9IERFRkFVTFRfREFUQTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW5EYXRhID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9EQVRBLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgVmVyaWxvZ0JpdGZpZWxkU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcigndmVyaWxvZy1iaXRmaWVsZCcsIHRoaXMucHJvY2Vzc0JpdGZpZWxkLmJpbmQodGhpcykpO1xuICAgIC8vIOW6lOeUqOS/neWtmOeahOihqOagvOihjOmrmFxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1iZi10YWJsZS1yb3ctaGVpZ2h0JywgYCR7dGhpcy5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0IHx8IDI4fXB4YCk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuY2xlYXIoKTtcbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gW107XG4gICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzQml0ZmllbGQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgdGhpcy5jdXJyZW50Tm90ZVBhdGggPSBjdHguc291cmNlUGF0aCB8fCAnJztcbiAgICBjb25zdCByZXN1bHQgPSBwYXJzZShzb3VyY2UpO1xuXG4gICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgdGhpcy5yZW5kZXJFcnJvcnMoZWwsIHJlc3VsdC5lcnJvcnMgfHwgW10pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgW25hbWUsIGJsb2NrXSBvZiByZXN1bHQuYmxvY2tzISkge1xuICAgICAgdGhpcy5yZW5kZXJCbG9jayhuYW1lLCBibG9jaywgZWwpO1xuICAgIH1cblxuICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5yZXNvbHZlUGVuZGluZ1JlZnMoKSwgNTApO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhuYW1lOiBzdHJpbmcsIGJsb2NrOiBGaWVsZEJsb2NrLCBwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBwYXJlbnRFbC5jcmVhdGVFbCgnZGl2Jywge1xuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1jb250YWluZXInLFxuICAgICAgYXR0cjogeyBpZDogYGJmOiR7bmFtZX1gIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGhlYWRlclJvdyA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWhlYWRlci1yb3cnIH0pO1xuICAgIGNvbnN0IGRlc2MgPSBibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7YmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIGhlYWRlclJvdy5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgIHRleHQ6IGAke25hbWV9JHtkZXNjfSDnmoQgJHtibG9jay53aWR0aH0gYml0IOWumuS5ieWmguS4i++8mmAsXG4gICAgICBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWhlYWRlcidcbiAgICB9KTtcbiAgICBjb25zdCB0b2dnbGVCdG4gPSB0aGlzLmNyZWF0ZVRvZ2dsZUJ1dHRvbihoZWFkZXJSb3cpO1xuXG4gICAgY29uc3QgY29udGVudFdyYXAgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1jb250ZW50JyB9KTtcbiAgICBjb25zdCBzdmdDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLXN2ZycgfSk7XG4gICAgc3ZnQ29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlckJsb2NrU3ZnKGJsb2NrLCB0aGlzLnBsdWdpbkRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCcsIHRoaXMucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgfHwgNDQpO1xuICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLnNldHVwVG9vbHRpcEhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG5cbiAgICBjb25zdCB0YWJsZUNvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtdGFibGUtY29udGFpbmVyJyB9KTtcbiAgICB0YWJsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGlzLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xuICAgIHRhYmxlQ29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlckJsb2NrVGFibGUoYmxvY2spO1xuICAgIHRoaXMuc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcblxuICAgIC8vIOWIneWni+WMluinhuWbvu+8muivu+WPluS/neWtmOeahOWBj+WlvVxuICAgIGNvbnN0IGRlZmF1bHRWaWV3ID0gdGhpcy5wbHVnaW5EYXRhLmRlZmF1bHRWaWV3IHx8ICdzdmcnO1xuICAgIHRoaXMuYXBwbHlWaWV3KGRlZmF1bHRWaWV3LCBjb250ZW50V3JhcCwgc3ZnQ29udGFpbmVyLCB0YWJsZUNvbnRhaW5lciwgdG9nZ2xlQnRuKTtcblxuICAgIC8vIOe7keWumuWIh+aNouS6i+S7tlxuICAgIHRvZ2dsZUJ0bi5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgY29uc3QgdmlldyA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IG51bGw7XG4gICAgICBpZiAodmlldykge1xuICAgICAgICB0aGlzLmFwcGx5Vmlldyh2aWV3LCBjb250ZW50V3JhcCwgc3ZnQ29udGFpbmVyLCB0YWJsZUNvbnRhaW5lciwgdG9nZ2xlQnRuKTtcbiAgICAgICAgdGhpcy5wbHVnaW5EYXRhLmRlZmF1bHRWaWV3ID0gdmlldztcbiAgICAgICAgdGhpcy5zYXZlRGF0YSh0aGlzLnBsdWdpbkRhdGEpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuc2V0KG5hbWUsIHtcbiAgICAgIGVsZW1lbnQ6IGNvbnRhaW5lcixcbiAgICAgIGJsb2NrLFxuICAgICAgbm90ZVBhdGg6IHRoaXMuY3VycmVudE5vdGVQYXRoXG4gICAgfSk7XG5cbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyhzdmdDb250YWluZXIpO1xuICAgIHRoaXMuY29sbGVjdFBlbmRpbmdSZWZzKHRhYmxlQ29udGFpbmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlWaWV3KHZpZXc6ICdzdmcnIHwgJ3RhYmxlJywgY29udGVudFdyYXA6IEhUTUxFbGVtZW50LCBzdmdFbDogSFRNTEVsZW1lbnQsIHRhYmxlRWw6IEhUTUxFbGVtZW50LCBidG46IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGVudFdyYXAuc2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnLCB2aWV3KTtcbiAgICBidG4ucXVlcnlTZWxlY3RvckFsbCgnLmJmLXRvZ2dsZS1vcHRpb24nKS5mb3JFYWNoKG9wdCA9PiB7XG4gICAgICBvcHQuY2xhc3NMaXN0LnRvZ2dsZSgnYmYtdG9nZ2xlLWFjdGl2ZScsIG9wdC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpID09PSB2aWV3KTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlVG9nZ2xlQnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgYnRuID0gcGFyZW50LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JmLXZpZXctdG9nZ2xlJyB9KTtcbiAgICBidG4uY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfkvY3ln5/lm74nLCBjbHM6ICdiZi10b2dnbGUtb3B0aW9uIGJmLXRvZ2dsZS1zdmcnLCBhdHRyOiB7ICdkYXRhLXZpZXcnOiAnc3ZnJyB9IH0pO1xuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+ihqOagvCcsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXRhYmxlJywgYXR0cjogeyAnZGF0YS12aWV3JzogJ3RhYmxlJyB9IH0pO1xuICAgIHJldHVybiBidG47XG4gIH1cblxuICAvKiog6YeN5paw5riy5p+T5omA5pyJIFNWRyDkvY3ln5/lm77vvIjkuLvpopjlj5jmm7Tml7bosIPnlKjvvIkgKi9cbiAgcHVibGljIHJlcmVuZGVyQWxsU3ZnKCk6IHZvaWQge1xuICAgIGNvbnN0IHRoZW1lID0gdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnO1xuICAgIGZvciAoY29uc3QgWywgZW50cnldIG9mIHRoaXMuYmxvY2tSZWdpc3RyeSkge1xuICAgICAgY29uc3Qgc3ZnQ29udGFpbmVyID0gZW50cnkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcudmVyaWxvZy1iaXRmaWVsZC1zdmcnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoc3ZnQ29udGFpbmVyKSB7XG4gICAgICAgIHN2Z0NvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1N2ZyhlbnRyeS5ibG9jaywgdGhlbWUsIHRoaXMucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgfHwgNDQpO1xuICAgICAgICB0aGlzLnNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG4gICAgICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckVycm9ycyhlbDogSFRNTEVsZW1lbnQsIGVycm9yczogeyBsaW5lOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZzsgc3VnZ2VzdGlvbj86IHN0cmluZyB9W10pIHtcbiAgICBlbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWVycm9yJyB9LCAoZXJyb3JFbCkgPT4ge1xuICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+ino+aekOmUmeivrzonIH0pO1xuICAgICAgZm9yIChjb25zdCBlcnJvciBvZiBlcnJvcnMpIHtcbiAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOihjCAke2Vycm9yLmxpbmV9OiAke2Vycm9yLm1lc3NhZ2V9YCB9KTtcbiAgICAgICAgaWYgKGVycm9yLnN1Z2dlc3Rpb24pIHtcbiAgICAgICAgICBlcnJvckVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBg5bu66K6uOiAke2Vycm9yLnN1Z2dlc3Rpb259YCwgY2xzOiAnc3VnZ2VzdGlvbicgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCDngrnlh7vot7Povawg4pSA4pSA4pSAXG5cbiAgcHJpdmF0ZSBzZXR1cE5hdmlnYXRpb25IYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLm9uY2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKTtcbiAgICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzY3JvbGxUb0Jsb2NrKGJsb2NrTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xuICAgIGVudHJ5LmVsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2JmLWhpZ2hsaWdodCcpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4gZW50cnkuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdiZi1oaWdobGlnaHQnKSwgMTUwMCk7XG4gIH1cblxuICAvLyDilIDilIDilIAg5oKs5rWuIHRvb2x0aXAg4pSA4pSA4pSAXG5cbiAgcHJpdmF0ZSBzZXR1cFRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBTVkdFbGVtZW50O1xuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcbiAgICAgIGlmIChyZWZOYW1lKSB7XG4gICAgICAgIC8vIOm8oOagh+WbnuWIsOa6kOWFg+e0oOS4iu+8jOWPlua2iOW+heWIoOmZpOWumuaXtuWZqFxuICAgICAgICBpZiAodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpO1xuICAgICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB2aWV3ID0gdGhpcy5nZXRWaWV3Rm9yQmxvY2socmVmTmFtZSk7XG4gICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFksIHZpZXcpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBTVkdFbGVtZW50O1xuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcbiAgICAgIGlmIChyZWZOYW1lKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcbiAgICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XG4gICAgICAgIGlmIChyZWZOYW1lKSB7XG4gICAgICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Vmlld0ZvckJsb2NrKHJlZk5hbWUpO1xuICAgICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFksIHZpZXcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHRoaXMuc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCk7XG4gICAgfSk7XG4gIH1cblxuICAvKiog6I635Y+W6KKr5byV55So5Z2X6Ieq6Lqr55qE6KeG5Zu+54q25oCB77yM5LiN5a2Y5Zyo5YiZ55So6buY6K6k5YGP5aW9ICovXG4gIHByaXZhdGUgZ2V0Vmlld0ZvckJsb2NrKGJsb2NrTmFtZTogc3RyaW5nKTogJ3N2ZycgfCAndGFibGUnIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcbiAgICBpZiAoZW50cnkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gZW50cnkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcudmVyaWxvZy1iaXRmaWVsZC1jb250ZW50Jyk7XG4gICAgICBjb25zdCB2aWV3ID0gY29udGVudFdyYXA/LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgYXMgJ3N2ZycgfCAndGFibGUnIHwgdW5kZWZpbmVkO1xuICAgICAgaWYgKHZpZXcpIHJldHVybiB2aWV3O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5wbHVnaW5EYXRhLmRlZmF1bHRWaWV3IHx8ICdzdmcnO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVRvb2x0aXBSZW1vdmUoKSB7XG4gICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuICAgIH0sIDIwMCk7XG4gIH1cblxuICBwcml2YXRlIHNob3dUb29sdGlwKGJsb2NrTmFtZTogc3RyaW5nLCBtb3VzZVg6IG51bWJlciwgbW91c2VZOiBudW1iZXIsIHZpZXc6ICdzdmcnIHwgJ3RhYmxlJykge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHJldHVybjtcblxuICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuXG4gICAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHRvb2x0aXAuY2xhc3NOYW1lID0gJ2JmLXRvb2x0aXAnO1xuXG4gICAgY29uc3QgZGVzYyA9IGVudHJ5LmJsb2NrLmRlc2NyaXB0aW9uID8gYCDigJQgJHtlbnRyeS5ibG9jay5kZXNjcmlwdGlvbn1gIDogJyc7XG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYCR7YmxvY2tOYW1lfSR7ZGVzY31gLCBjbHM6ICdiZi10b29sdGlwLWhlYWRlcicgfSk7XG5cbiAgICBpZiAodmlldyA9PT0gJ3N2ZycpIHtcbiAgICAgIGNvbnN0IHN2Z1dyYXAgPSB0b29sdGlwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JmLXRvb2x0aXAtc3ZnJyB9KTtcbiAgICAgIHN2Z1dyYXAuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tTdmcoZW50cnkuYmxvY2ssIHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJywgdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCA0NCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcC10YWJsZScgfSk7XG4gICAgICB0YWJsZVdyYXAuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tUYWJsZShlbnRyeS5ibG9jayk7XG4gICAgfVxuXG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+WNleWHu+i3s+i9rOafpeeci+WujOaVtOWumuS5iScsIGNsczogJ2JmLXRvb2x0aXAtaGludCcgfSk7XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRvb2x0aXApO1xuICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IHRvb2x0aXA7XG5cbiAgICBjb25zdCByZWN0ID0gdG9vbHRpcC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBsZXQgbGVmdCA9IG1vdXNlWCArIDEyO1xuICAgIGxldCB0b3AgPSBtb3VzZVkgLSAyMDtcbiAgICBpZiAobGVmdCArIHJlY3Qud2lkdGggPiB3aW5kb3cuaW5uZXJXaWR0aCAtIDE2KSBsZWZ0ID0gbW91c2VYIC0gcmVjdC53aWR0aCAtIDEyO1xuICAgIGlmICh0b3AgKyByZWN0LmhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDE2KSB0b3AgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDE2O1xuICAgIGlmICh0b3AgPCA4KSB0b3AgPSA4O1xuXG4gICAgdG9vbHRpcC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdG9vbHRpcC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIC8vIOm8oOagh+i/m+WFpSB0b29sdGlwIOaXtuWPlua2iOW+heWIoOmZpOWumuaXtuWZqFxuICAgIHRvb2x0aXAuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpO1xuICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdG9vbHRpcC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4gdGhpcy5yZW1vdmVUb29sdGlwKCkpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdmVUb29sdGlwKCkge1xuICAgIGlmICh0aGlzLmFjdGl2ZVRvb2x0aXApIHtcbiAgICAgIHRoaXMuYWN0aXZlVG9vbHRpcC5yZW1vdmUoKTtcbiAgICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOW8leeUqOino+aekCDilIDilIDilIBcblxuICBwcml2YXRlIGNvbGxlY3RQZW5kaW5nUmVmcyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXJlZl0nKS5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgY29uc3QgcmVmTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKSE7XG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocmVmTmFtZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWU6IHJlZk5hbWUgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi1yZWYtbGluaycpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXROYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpITtcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5Lmhhcyh0YXJnZXROYW1lKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZSB9KTtcbiAgICAgICAgKGVsIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNvbHZlUGVuZGluZ1JlZnMoKSB7XG4gICAgY29uc3Qgc3RpbGxQZW5kaW5nOiB0eXBlb2YgdGhpcy5wZW5kaW5nUmVmcyA9IFtdO1xuICAgIGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLnBlbmRpbmdSZWZzKSB7XG4gICAgICBpZiAodGhpcy5ibG9ja1JlZ2lzdHJ5LmhhcyhwZW5kaW5nLnRhcmdldE5hbWUpKSB7XG4gICAgICAgIHBlbmRpbmcuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RpbGxQZW5kaW5nLnB1c2gocGVuZGluZyk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBzdGlsbFBlbmRpbmc7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJpIiwiUGx1Z2luU2V0dGluZ1RhYiIsIlNldHRpbmciLCJQbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQWFPLFNBQVMsTUFBTSxLQUFBLEVBQTRCO0FBQ2hELEVBQUEsTUFBTSxLQUFBLEdBQVEsS0FBQSxDQUFNLEtBQUEsQ0FBTSxJQUFJLENBQUE7QUFDOUIsRUFBQSxNQUFNLFNBQXVCLEVBQUM7QUFDOUIsRUFBQSxNQUFNLE1BQUEsdUJBQWEsR0FBQSxFQUF3QjtBQUMzQyxFQUFBLE1BQU0sVUFBQSx1QkFBaUIsR0FBQSxFQUFZO0FBR25DLEVBQUEsTUFBTSxXQUFzQixFQUFDO0FBQzdCLEVBQUEsS0FBQSxJQUFTQSxFQUFBQSxHQUFJLENBQUEsRUFBR0EsRUFBQUEsR0FBSSxLQUFBLENBQU0sUUFBUUEsRUFBQUEsRUFBQUEsRUFBSztBQUNyQyxJQUFBLE1BQU0sSUFBQSxHQUFPLE1BQU1BLEVBQUMsQ0FBQTtBQUNwQixJQUFBLElBQUksQ0FBQyxLQUFLLElBQUEsRUFBSyxJQUFLLEtBQUssSUFBQSxFQUFLLENBQUUsVUFBQSxDQUFXLElBQUksQ0FBQSxFQUFHO0FBQ2hELE1BQUE7QUFBQSxJQUNGO0FBQ0EsSUFBQSxRQUFBLENBQVMsSUFBQSxDQUFLO0FBQUEsTUFDWixTQUFTQSxFQUFBQSxHQUFJLENBQUE7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
