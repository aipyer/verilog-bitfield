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

function shouldUseVertical(fields, totalWidth) {
  const svgWidth = 1e3;
  const availableWidth = svgWidth - 120;
  const fontSize = 22;
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
  svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ""} style="cursor:${isRef ? "pointer" : "default"}">${displayText}</text>`;
  const parentHigh = field.msb;
  const parentLow = field.lsb;
  const parentLabel = parentHigh === parentLow ? `[${parentHigh}]` : `[${parentHigh}:${parentLow}]`;
  const annotationFontSize = fontSize * 0.7;
  if (layoutDirection === "vertical") {
    const annotX = x + width + 8;
    const annotY = textY;
    svg += `<text x="${annotX}" y="${annotY}" font-size="${annotationFontSize}" text-anchor="start" dominant-baseline="central" fill="#999" font-family="monospace">${parentLabel}</text>`;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9zZXR0aW5ncy50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrLCBQYXJzZUVycm9yLCBQYXJzZVJlc3VsdCB9IGZyb20gJy4vdHlwZXMnO1xyXG5cclxuaW50ZXJmYWNlIFJhd0xpbmUge1xyXG4gIGxpbmVOdW06IG51bWJlcjtcclxuICBpbmRlbnQ6IG51bWJlcjtcclxuICBjb250ZW50OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDop6PmnpAgVmVyaWxvZyDkvY3ln5/lrprkuYlcclxuICog57uf5LiA6K+t5rOV77ya5q+P5Liq5Luj56CB5Z2X55Sx5LiA5Liq5oiW5aSa5LiqIGRlZmluaXRpb24gYmxvY2sg57uE5oiQXHJcbiAqIOavj+S4quWdl++8muesrOS4gOihjCBuYW1lIHdpZHRoIFtkZXNjcmlwdGlvbl3vvIzlrZDlrZfmrrXpgJrov4fnvKnov5vltYzlpZdcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShpbnB1dDogc3RyaW5nKTogUGFyc2VSZXN1bHQge1xyXG4gIGNvbnN0IGxpbmVzID0gaW5wdXQuc3BsaXQoJ1xcbicpO1xyXG4gIGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XHJcbiAgY29uc3QgYmxvY2tzID0gbmV3IE1hcDxzdHJpbmcsIEZpZWxkQmxvY2s+KCk7XHJcbiAgY29uc3QgYmxvY2tOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cclxuICAvLyDpooTlpITnkIbvvJrov4fmu6TnqbrooYzlkozms6jph4pcclxuICBjb25zdCByYXdMaW5lczogUmF3TGluZVtdID0gW107XHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3QgbGluZSA9IGxpbmVzW2ldO1xyXG4gICAgaWYgKCFsaW5lLnRyaW0oKSB8fCBsaW5lLnRyaW0oKS5zdGFydHNXaXRoKCcvLycpKSB7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgcmF3TGluZXMucHVzaCh7XHJcbiAgICAgIGxpbmVOdW06IGkgKyAxLFxyXG4gICAgICBpbmRlbnQ6IGxpbmUuc2VhcmNoKC9cXFMvKSxcclxuICAgICAgY29udGVudDogbGluZS50cmltKClcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgaWYgKHJhd0xpbmVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogW3sgbGluZTogMCwgbWVzc2FnZTogJ+i+k+WFpeS4uuepuicgfV0gfTtcclxuICB9XHJcblxyXG4gIC8vIOmAkOihjOino+aekO+8jGluZGVudD0wIOeahOihjOS9nOS4uuWdl+WktFxyXG4gIGxldCBpID0gMDtcclxuICB3aGlsZSAoaSA8IHJhd0xpbmVzLmxlbmd0aCkge1xyXG4gICAgY29uc3QgcmwgPSByYXdMaW5lc1tpXTtcclxuXHJcbiAgICBpZiAocmwuaW5kZW50ICE9PSAwKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaEj+WklueahOe8qei/m+ihjDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xyXG4gICAgICBpKys7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihcXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XHJcbiAgICBpZiAoIW1hdGNoKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaXoOazleino+aekDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xyXG4gICAgICBpKys7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IFssIG5hbWUsIHdpZHRoU3RyLCBkZXNjXSA9IG1hdGNoO1xyXG5cclxuICAgIGlmIChibG9ja05hbWVzLmhhcyhuYW1lKSkge1xyXG4gICAgICBlcnJvcnMucHVzaCh7XHJcbiAgICAgICAgbGluZTogcmwubGluZU51bSxcclxuICAgICAgICBtZXNzYWdlOiBg6YeN5aSN5a6a5LmJOiBcIiR7bmFtZX1cImAsXHJcbiAgICAgICAgc3VnZ2VzdGlvbjogJ+WQjOeslOiusOWGheWdl+WQjeW/hemhu+WUr+S4gCdcclxuICAgICAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICBibG9ja05hbWVzLmFkZChuYW1lKTtcclxuXHJcbiAgICBjb25zdCBibG9jazogRmllbGRCbG9jayA9IHtcclxuICAgICAgbmFtZSxcclxuICAgICAgd2lkdGg6IHBhcnNlSW50KHdpZHRoU3RyLCAxMCksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBkZXNjPy50cmltKCkgfHwgdW5kZWZpbmVkLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcblxyXG4gICAgLy8g5pS26ZuG5a2Q5a2X5q6177yI6L+e57ut55qE57yp6L+b6KGM77yJXHJcbiAgICBpKys7XHJcbiAgICBjb25zdCBjaGlsZHJlblN0YXJ0ID0gaTtcclxuICAgIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoICYmIHJhd0xpbmVzW2ldLmluZGVudCA+IDApIHtcclxuICAgICAgaSsrO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY2hpbGRyZW5MaW5lcyA9IHJhd0xpbmVzLnNsaWNlKGNoaWxkcmVuU3RhcnQsIGkpO1xyXG5cclxuICAgIGlmIChjaGlsZHJlbkxpbmVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgcGFyc2VDaGlsZHJlbihjaGlsZHJlbkxpbmVzLCBibG9jay5jaGlsZHJlbiwgZXJyb3JzLCAwLCBuYW1lKTtcclxuICAgICAgY2FsY3VsYXRlQml0UmFuZ2VzKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XHJcbiAgICAgIGF1dG9GaWxsUmVzZXJ2ZWQoYmxvY2suY2hpbGRyZW4sIGJsb2NrLndpZHRoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyDpqozor4HkvY3lrr1cclxuICAgIHZhbGlkYXRlQml0V2lkdGhzKGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMpO1xyXG5cclxuICAgIGJsb2Nrcy5zZXQobmFtZSwgYmxvY2spO1xyXG4gIH1cclxuXHJcbiAgaWYgKGJsb2Nrcy5zaXplID09PSAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn5pyq5om+5Yiw5pyJ5pWI55qE5a6a5LmJ5Z2XJyB9XSB9O1xyXG4gIH1cclxuXHJcbiAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzIH07XHJcbiAgfVxyXG5cclxuICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBibG9ja3MgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOino+aekOWtkOWtl+auteWIl+ihqFxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VDaGlsZHJlbihcclxuICBsaW5lczogUmF3TGluZVtdLFxyXG4gIGNoaWxkcmVuOiBCaXRGaWVsZFtdLFxyXG4gIGVycm9yczogUGFyc2VFcnJvcltdLFxyXG4gIGJhc2VJbmRlbnQ6IG51bWJlcixcclxuICBwYXJlbnROYW1lOiBzdHJpbmdcclxuKTogdm9pZCB7XHJcbiAgY29uc3Qgc3RhY2s6IHsgZmllbGQ6IEJpdEZpZWxkOyBpbmRlbnQ6IG51bWJlciB9W10gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBybCBvZiBsaW5lcykge1xyXG4gICAgY29uc3QgbWF0Y2ggPSBybC5jb250ZW50Lm1hdGNoKC9eKEA/XFx3KylcXHMrKFxcZCspXFxzKiguKik/JC8pO1xyXG4gICAgaWYgKCFtYXRjaCkge1xyXG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDml6Dms5Xop6PmnpA6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgWywgbmFtZSwgd2lkdGhTdHIsIGRlc2NdID0gbWF0Y2g7XHJcbiAgICBjb25zdCB3aWR0aCA9IHBhcnNlSW50KHdpZHRoU3RyLCAxMCk7XHJcbiAgICBjb25zdCBpc1JlZmVyZW5jZSA9IG5hbWUuc3RhcnRzV2l0aCgnQCcpO1xyXG4gICAgY29uc3QgcmVmTmFtZSA9IGlzUmVmZXJlbmNlID8gbmFtZS5zbGljZSgxKSA6IG5hbWU7XHJcblxyXG4gICAgLy8g5bWM5aWX5bGC57qn5qOA5p+lXHJcbiAgICBjb25zdCBkZXB0aCA9IE1hdGguZmxvb3IoKHJsLmluZGVudCAtIGJhc2VJbmRlbnQpIC8gMikgKyAxO1xyXG4gICAgaWYgKGRlcHRoID4gNSkge1xyXG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDltYzlpZflsYLnuqfov4fmt7EgKCR7ZGVwdGh9IOWxginvvIzmnIDlpJogNSDlsYJgIH0pO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmaWVsZDogQml0RmllbGQgPSB7XHJcbiAgICAgIG5hbWU6IHJlZk5hbWUsXHJcbiAgICAgIHdpZHRoLFxyXG4gICAgICBtc2I6IDAsXHJcbiAgICAgIGxzYjogMCxcclxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXHJcbiAgICAgIGlzUmVzZXJ2ZWQ6IG5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3Jlc2VydmVkJyxcclxuICAgICAgaXNSZWZlcmVuY2UsXHJcbiAgICAgIHJlZk5hbWU6IGlzUmVmZXJlbmNlID8gcmVmTmFtZSA6IHVuZGVmaW5lZCxcclxuICAgICAgY2hpbGRyZW46IFtdXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIOaJvueItuWtl+aute+8muS7juagiOS4reaJvue8qei/m+avlOW9k+WJjeWwj+eahOacgOWQjuS4gOS4qlxyXG4gICAgbGV0IHBhcmVudDogQml0RmllbGQgfCBudWxsID0gbnVsbDtcclxuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IHRvcCA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xyXG4gICAgICBpZiAodG9wLmluZGVudCA8IHJsLmluZGVudCkge1xyXG4gICAgICAgIHBhcmVudCA9IHRvcC5maWVsZDtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgICBzdGFjay5wb3AoKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAocGFyZW50KSB7XHJcbiAgICAgIGlmICghcGFyZW50LmNoaWxkcmVuKSBwYXJlbnQuY2hpbGRyZW4gPSBbXTtcclxuICAgICAgcGFyZW50LmNoaWxkcmVuLnB1c2goZmllbGQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2hpbGRyZW4ucHVzaChmaWVsZCk7XHJcbiAgICB9XHJcblxyXG4gICAgc3RhY2sucHVzaCh7IGZpZWxkLCBpbmRlbnQ6IHJsLmluZGVudCB9KTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDorqHnrpcgYml0IOiMg+WbtFxyXG4gKiDpnaDliY3lrprkuYnnmoTmmK8gTFNC77yM6Z2g5ZCO5a6a5LmJ55qE5pivIE1TQlxyXG4gKi9cclxuZnVuY3Rpb24gY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkczogQml0RmllbGRbXSwgcGFyZW50V2lkdGg6IG51bWJlcik6IHZvaWQge1xyXG4gIGxldCBjdXJyZW50THNiID0gMDtcclxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xyXG4gICAgZmllbGQubHNiID0gY3VycmVudExzYjtcclxuICAgIGZpZWxkLm1zYiA9IGN1cnJlbnRMc2IgKyBmaWVsZC53aWR0aCAtIDE7XHJcbiAgICBjdXJyZW50THNiID0gZmllbGQubXNiICsgMTtcclxuICAgIGlmICghZmllbGQuaXNSZWZlcmVuY2UgJiYgZmllbGQuY2hpbGRyZW4gJiYgZmllbGQuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xyXG4gICAgICBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGQuY2hpbGRyZW4sIGZpZWxkLndpZHRoKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDlvZPlrZDlrZfmrrXmgLvkvY3lrr3kuI3lpJ/ml7bvvIzlnKggTVNCIOerr+iHquWKqOihpSByZXNlcnZlZFxyXG4gKi9cclxuZnVuY3Rpb24gYXV0b0ZpbGxSZXNlcnZlZChmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcclxuICBjb25zdCB0b3RhbENoaWxkV2lkdGggPSBmaWVsZHMucmVkdWNlKChzdW0sIGYpID0+IHN1bSArIGYud2lkdGgsIDApO1xyXG4gIGNvbnN0IHJlbWFpbmluZyA9IHBhcmVudFdpZHRoIC0gdG90YWxDaGlsZFdpZHRoO1xyXG4gIGlmIChyZW1haW5pbmcgPiAwKSB7XHJcbiAgICBjb25zdCByZXNlcnZlZDogQml0RmllbGQgPSB7XHJcbiAgICAgIG5hbWU6ICdyZXNlcnZlZCcsXHJcbiAgICAgIHdpZHRoOiByZW1haW5pbmcsXHJcbiAgICAgIG1zYjogMCxcclxuICAgICAgbHNiOiAwLFxyXG4gICAgICBpc1Jlc2VydmVkOiB0cnVlLFxyXG4gICAgICBpc1JlZmVyZW5jZTogZmFsc2UsXHJcbiAgICAgIGNoaWxkcmVuOiBbXVxyXG4gICAgfTtcclxuICAgIGZpZWxkcy5wdXNoKHJlc2VydmVkKTtcclxuICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHMsIHBhcmVudFdpZHRoKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDpqozor4HkvY3lrr1cclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlQml0V2lkdGhzKGZpZWxkczogQml0RmllbGRbXSwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcclxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xyXG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcclxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IGNoaWxkcmVuV2lkdGggPSBjaGlsZHJlbi5yZWR1Y2UoKHN1bSwgY2hpbGQpID0+IHN1bSArIGNoaWxkLndpZHRoLCAwKTtcclxuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xyXG4gICAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICAgIGxpbmU6IDAsXHJcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXHJcbiAgICAgICAgICBzdWdnZXN0aW9uOiBg54i25a2X5q61OiAke2ZpZWxkLndpZHRofS1iaXQsIOWtkOWtl+auteaAu+WSjDogJHtjaGlsZHJlbldpZHRofS1iaXQsIOWJqeS9meepuumXtDogJHtmaWVsZC53aWR0aCAtIGNoaWxkcmVuV2lkdGh9LWJpdGBcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICB2YWxpZGF0ZUJpdFdpZHRocyhjaGlsZHJlbiwgZXJyb3JzKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwiLyoqXHJcbiAqIOminOiJsuaWueahiFxyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFN2Z1RoZW1lID0gJ3Bhc3RlbCcgfCAndml2aWQnIHwgJ21vbm8nO1xyXG5cclxuLy8g5Li76Imy77yI6aG25bGC5a2X5q6177yJ4oCUIOaflOWSjOa1heiJslxyXG5jb25zdCBQQVNURUxfQ09MT1JTID0gW1xyXG4gICcjQjNENEYwJywgLy8g5rWF6JOdXHJcbiAgJyNCOEUwQjgnLCAvLyDmtYXnu79cclxuICAnI0Y1RDZBOCcsIC8vIOa1heapmVxyXG4gICcjRDRCOEU4JywgLy8g5rWF57SrXHJcbiAgJyNBOEUwRDYnLCAvLyDmtYXpnZJcclxuICAnI0YwQjhCOCcsIC8vIOa1hee6olxyXG5dO1xyXG5cclxuLy8g6bKc6Imz6ImyXHJcbmNvbnN0IFZJVklEX0NPTE9SUyA9IFtcclxuICAnIzVCOUJENScsIC8vIOiTnVxyXG4gICcjNzBBRDQ3JywgLy8g57u/XHJcbiAgJyNFRDdEMzEnLCAvLyDmqZlcclxuICAnIzlCNTlCNicsIC8vIOe0q1xyXG4gICcjMUFCQzlDJywgLy8g6Z2SXHJcbiAgJyNFNzRDM0MnLCAvLyDnuqJcclxuXTtcclxuXHJcbi8vIOeBsOW6puiJslxyXG5jb25zdCBNT05PX0NPTE9SUyA9IFtcclxuICAnI0MwQzBDMCcsIC8vIOa1heeBsFxyXG4gICcjQThBOEE4JywgLy8g5Lit54GwXHJcbiAgJyNEMEQwRDAnLCAvLyDkuq7ngbBcclxuICAnI0IwQjBCMCcsIC8vIOmTtueBsFxyXG4gICcjQzhDOEM4JywgLy8g5reh54GwXHJcbiAgJyNCOEI4QjgnLCAvLyDmmpfpk7ZcclxuXTtcclxuXHJcbmNvbnN0IFRIRU1FX01BUDogUmVjb3JkPFN2Z1RoZW1lLCBzdHJpbmdbXT4gPSB7XHJcbiAgcGFzdGVsOiBQQVNURUxfQ09MT1JTLFxyXG4gIHZpdmlkOiBWSVZJRF9DT0xPUlMsXHJcbiAgbW9ubzogTU9OT19DT0xPUlMsXHJcbn07XHJcblxyXG4vLyDkv53nlZnoibJcclxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0U4RThFOCc7XHJcblxyXG4vKipcclxuICog6I635Y+W5a2X5q616aKc6ImyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmllbGRDb2xvcihpbmRleDogbnVtYmVyLCBpc1Jlc2VydmVkOiBib29sZWFuLCBkZXB0aDogbnVtYmVyID0gMCwgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcpOiBzdHJpbmcge1xyXG4gIGlmIChpc1Jlc2VydmVkKSB7XHJcbiAgICByZXR1cm4gUkVTRVJWRURfQ09MT1I7XHJcbiAgfVxyXG5cclxuICBjb25zdCBwYWxldHRlID0gVEhFTUVfTUFQW3RoZW1lXSB8fCBQQVNURUxfQ09MT1JTO1xyXG4gIGNvbnN0IGJhc2VDb2xvciA9IHBhbGV0dGVbaW5kZXggJSBwYWxldHRlLmxlbmd0aF07XHJcblxyXG4gIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIGJhc2VDb2xvcjtcclxuICB9XHJcblxyXG4gIC8vIOWtkOWtl+aute+8muWfuuS6jueItuiJsuiwg+aVtOS6ruW6plxyXG4gIHJldHVybiBhZGp1c3RCcmlnaHRuZXNzKGJhc2VDb2xvciwgZGVwdGggKiAxMCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDosIPmlbTpopzoibLkuq7luqZcclxuICovXHJcbmZ1bmN0aW9uIGFkanVzdEJyaWdodG5lc3MoaGV4OiBzdHJpbmcsIHBlcmNlbnQ6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgaGV4ID0gaGV4LnJlcGxhY2UoJyMnLCAnJyk7XHJcblxyXG4gIGNvbnN0IHIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDAsIDIpLCAxNik7XHJcbiAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMiwgNCksIDE2KTtcclxuICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZyg0LCA2KSwgMTYpO1xyXG5cclxuICBjb25zdCBhZGp1c3QgPSAoY2hhbm5lbDogbnVtYmVyKSA9PiB7XHJcbiAgICBjb25zdCBhZGp1c3RlZCA9IE1hdGgucm91bmQoY2hhbm5lbCArICgyNTUgLSBjaGFubmVsKSAqIChwZXJjZW50IC8gMTAwKSk7XHJcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XHJcbiAgY29uc3QgbmV3RyA9IGFkanVzdChnKTtcclxuICBjb25zdCBuZXdCID0gYWRqdXN0KGIpO1xyXG5cclxuICBjb25zdCB0b0hleCA9IChuOiBudW1iZXIpID0+IG4udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgcmV0dXJuIGAjJHt0b0hleChuZXdSKX0ke3RvSGV4KG5ld0cpfSR7dG9IZXgobmV3Qil9YDtcclxufVxyXG4iLCJpbXBvcnQgeyBCaXRGaWVsZCwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgZ2V0RmllbGRDb2xvciwgU3ZnVGhlbWUgfSBmcm9tICcuL2NvbG9ycyc7XG5cbi8qKlxuICogU1ZHIOa4suafk+mFjee9rlxuICovXG5pbnRlcmZhY2UgUmVuZGVyQ29uZmlnIHtcbiAgLyoqIOaAu+S9jeWuvSAqL1xuICB0b3RhbFdpZHRoOiBudW1iZXI7XG4gIC8qKiDmmK/lkKbnurXlkJHmjpLliJcgKi9cbiAgaXNWZXJ0aWNhbDogYm9vbGVhbjtcbiAgLyoqIOWtl+auteahhumrmOW6piAqL1xuICBib3hIZWlnaHQ6IG51bWJlcjtcbiAgLyoqIOWtl+S9k+Wkp+WwjyAqL1xuICBmb250U2l6ZTogbnVtYmVyO1xuICAvKiogU1ZHIOS4u+mimCAqL1xuICB0aGVtZTogU3ZnVGhlbWU7XG59XG5cbi8qKlxuICog6K6h566X5a2X5q615qCH562+5omA6ZyA55qE5pyA5bCP5a695bqm77yI5YOP57Sg77yJXG4gKi9cbi8qKlxuICog5Yik5pat5piv5ZCm5bqU5L2/55So57q15ZCR5biD5bGAXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVzZVZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgdG90YWxXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3QgYXZhaWxhYmxlV2lkdGggPSBzdmdXaWR0aCAtIDEyMDtcbiAgY29uc3QgZm9udFNpemUgPSAyMjtcblxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkLmlzUmVzZXJ2ZWQgPyAncmVzZXJ2ZWQnIDogKGZpZWxkLmlzUmVmZXJlbmNlID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICAgIGNvbnN0IHNlbGZIaWdoID0gZmllbGQud2lkdGggLSAxO1xuICAgIGNvbnN0IHNlbGZMYWJlbCA9IHNlbGZIaWdoID09PSAwID8gZmllbGROYW1lIDogYCR7ZmllbGROYW1lfVske3NlbGZIaWdofTowXWA7XG4gICAgY29uc3Qgd2lkdGhSYXRpbyA9IGZpZWxkLndpZHRoIC8gdG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICAvLyDmqKHmi5/muLLmn5Pml7YgdGV4dFdpZHRoID0gYm94V2lkdGggLSAxNiDnmoTlrp7pmYXnqbrnmb1cbiAgICBjb25zdCB0ZXh0V2lkdGggPSBib3hXaWR0aCAtIDE2O1xuICAgIC8vIG1vbm9zcGFjZSDlrZfnrKblrr0g4omIIGZvbnRTaXplICogMC4277yM6ZyA6aKd5aSWICsxNiDlrrnnurPlt6blj7Pnqbrnmb1cbiAgICBjb25zdCBtaW5XaWR0aCA9IHNlbGZMYWJlbC5sZW5ndGggKiBmb250U2l6ZSAqIDAuNiArIDE2ICsgODtcbiAgICBpZiAoYm94V2lkdGggPCBtaW5XaWR0aCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIOa4suafk+Wdl+eahCBTVkcg5L2N5Z+f5Zu+XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJCbG9ja1N2ZyhibG9jazogRmllbGRCbG9jaywgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcsIGJveEhlaWdodDogbnVtYmVyID0gNDQpOiBzdHJpbmcge1xuICBjb25zdCBjb25maWc6IFJlbmRlckNvbmZpZyA9IHtcbiAgICB0b3RhbFdpZHRoOiBibG9jay53aWR0aCxcbiAgICBpc1ZlcnRpY2FsOiBzaG91bGRVc2VWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpLFxuICAgIGJveEhlaWdodCxcbiAgICBmb250U2l6ZTogMjIsXG4gICAgdGhlbWUsXG4gIH07XG5cbiAgaWYgKGNvbmZpZy5pc1ZlcnRpY2FsKSB7XG4gICAgcmV0dXJuIHJlbmRlclZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZW5kZXJIb3Jpem9udGFsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9XG59XG5cbi8qKlxuICog5qiq5ZCR5riy5p+TXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckhvcml6b250YWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodCArIDYwO1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gMjU7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgbGV0IGN1cnJlbnRYID0gc3RhcnRYO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIGNvbmZpZy50b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwLCBjb25maWcudGhlbWUpO1xuICAgIHN2ZyArPSByZW5kZXJGaWVsZEJveChmaWVsZCwgY3VycmVudFgsIHN0YXJ0WSwgYm94V2lkdGgsIGNvbmZpZy5ib3hIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUsICdob3Jpem9udGFsJyk7XG4gICAgY3VycmVudFggKz0gYm94V2lkdGg7XG4gIH1cblxuICAvLyBMU0Ig4oaSIE1TQiDmlrnlkJHnrq3lpLRcbiAgY29uc3QgYXJyb3dZID0gc3RhcnRZICsgY29uZmlnLmJveEhlaWdodCArIDIyO1xuICBjb25zdCBmcyA9IGNvbmZpZy5mb250U2l6ZSAqIDAuODU7XG4gIGNvbnN0IGZpZWxkTGVmdCA9IHN0YXJ0WDtcbiAgY29uc3QgZmllbGRSaWdodCA9IHN0YXJ0WCArIGF2YWlsYWJsZVdpZHRoO1xuICAvLyBMU0Ig5Y+z5a+56b2Q5Yiw5a2X5q615qGG5bem6L6557yYXG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7ZmllbGRMZWZ0fVwiIHk9XCIke2Fycm93WSArIDV9XCIgZm9udC1zaXplPVwiJHtmc31cIiB0ZXh0LWFuY2hvcj1cImVuZFwiIGZpbGw9XCIjOTk5XCI+TFNCPC90ZXh0PmA7XG4gIC8vIOeureWktOavlOWtl+auteahhueqhOS4gOeCue+8jOS4pOerr+eVmeepulxuICBjb25zdCBhcnJvd1BhZCA9IDEwO1xuICBzdmcgKz0gYDxsaW5lIHgxPVwiJHtmaWVsZExlZnQgKyBhcnJvd1BhZH1cIiB5MT1cIiR7YXJyb3dZfVwiIHgyPVwiJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSA4fVwiIHkyPVwiJHthcnJvd1l9XCIgc3Ryb2tlPVwiIzk5OVwiIHN0cm9rZS13aWR0aD1cIjEuNVwiLz5gO1xuICBzdmcgKz0gYDxwb2x5Z29uIHBvaW50cz1cIiR7ZmllbGRSaWdodCAtIGFycm93UGFkfSwke2Fycm93WX0gJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSAxMH0sJHthcnJvd1kgLSA1fSAke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZCAtIDEwfSwke2Fycm93WSArIDV9XCIgZmlsbD1cIiM5OTlcIi8+YDtcbiAgLy8gTVNCIOW3puWvuem9kOWIsOWtl+auteahhuWPs+i+uee8mFxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2ZpZWxkUmlnaHR9XCIgeT1cIiR7YXJyb3dZICsgNX1cIiBmb250LXNpemU9XCIke2ZzfVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOe6teWQkea4suafk++8iHZpZXdCb3gg5a695bqm5LiO5qiq5ZCR5LiA6Ie077yM5L+d5oyB5a2X5L2T6KeG6KeJ5aSn5bCP5LiA6Ie077yJXG4gKi9cbmZ1bmN0aW9uIHJlbmRlclZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgY29uZmlnOiBSZW5kZXJDb25maWcpOiBzdHJpbmcge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IHJvd0hlaWdodCA9IGNvbmZpZy5ib3hIZWlnaHQ7XG4gIGNvbnN0IHN0YXJ0WCA9IDYwO1xuICBjb25zdCBzdGFydFkgPSAyMjtcbiAgY29uc3QgYm94V2lkdGggPSBzdmdXaWR0aCAtIDE2MDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodCArIDI1O1xuXG4gIGxldCBzdmcgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAke3N2Z1dpZHRofSAke3N2Z0hlaWdodH1cIiB3aWR0aD1cIjEwMCVcIj5gO1xuXG4gIGxldCBjdXJyZW50WSA9IHN0YXJ0WTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCwgY29uZmlnLnRoZW1lKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIHN0YXJ0WCwgY3VycmVudFksIGJveFdpZHRoLCByb3dIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUpO1xuICAgIGN1cnJlbnRZICs9IHJvd0hlaWdodDtcbiAgfVxuXG4gIC8vIExTQiDihpIgTVNCIOaWueWQkeeureWktO+8iOe6teWQke+8muS7juS4iuWIsOS4i++8jOaUvuWcqOW3puS+p+ahhuWklu+8iVxuICBjb25zdCBhcnJvd1ggPSBzdGFydFggLSAyNDtcbiAgY29uc3QgYXJyb3dUb3AgPSBzdGFydFk7XG4gIGNvbnN0IGFycm93Qm90dG9tID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7YXJyb3dYfVwiIHkxPVwiJHthcnJvd1RvcCArIDh9XCIgeDI9XCIke2Fycm93WH1cIiB5Mj1cIiR7YXJyb3dCb3R0b20gLSA4fVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2Fycm93WH0sJHthcnJvd0JvdHRvbX0gJHthcnJvd1ggLSA1fSwke2Fycm93Qm90dG9tIC0gMTB9ICR7YXJyb3dYICsgNX0sJHthcnJvd0JvdHRvbSAtIDEwfVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7YXJyb3dYfVwiIHk9XCIke2Fycm93VG9wIC0gNH1cIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZSAqIDAuODV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fycm93WH1cIiB5PVwiJHthcnJvd0JvdHRvbSArIDE4fVwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplICogMC44NX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOa4suafk+Wtl+auteahhlxuICogQHBhcmFtIGxheW91dERpcmVjdGlvbiDluIPlsYDmlrnlkJHvvIznlKjkuo7lhrPlrprniLblrZfmrrXntKLlvJXmoIfms6jkvY3nva5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyRmllbGRCb3goXG4gIGZpZWxkOiBCaXRGaWVsZCxcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHdpZHRoOiBudW1iZXIsXG4gIGhlaWdodDogbnVtYmVyLFxuICBjb2xvcjogc3RyaW5nLFxuICBmb250U2l6ZTogbnVtYmVyLFxuICBsYXlvdXREaXJlY3Rpb246ICdob3Jpem9udGFsJyB8ICd2ZXJ0aWNhbCcgPSAndmVydGljYWwnXG4pOiBzdHJpbmcge1xuICBsZXQgc3ZnID0gJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgZmllbGROYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuXG4gIGNvbnN0IHN0cm9rZURhc2ggPSBpc1JlZiA/ICcgc3Ryb2tlLWRhc2hhcnJheT1cIjYsM1wiJyA6ICcnO1xuICBjb25zdCBzdHJva2VDb2xvciA9IGlzUmVmID8gJyM0QTkwRDknIDogJyNmZmYnO1xuICBzdmcgKz0gYDxyZWN0IHg9XCIke3h9XCIgeT1cIiR7eX1cIiB3aWR0aD1cIiR7d2lkdGh9XCIgaGVpZ2h0PVwiJHtoZWlnaHR9XCIgZmlsbD1cIiR7Y29sb3J9XCIgc3Ryb2tlPVwiJHtzdHJva2VDb2xvcn1cIiBzdHJva2Utd2lkdGg9XCIyXCIgcng9XCI0XCIgcnk9XCI0XCIgZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCIvPmA7XG5cbiAgLy8g5qGG5YaF77ya5a2X5q616Ieq6Lqr57Si5byVIFt3aWR0aC0xOjBd77yM5Y2VIGJpdCDlrZfmrrXnnIHnlaXntKLlvJVcbiAgY29uc3Qgc2VsZkhpZ2ggPSBmaWVsZC53aWR0aCAtIDE7XG4gIGNvbnN0IHNlbGZMYWJlbCA9IHNlbGZIaWdoID09PSAwID8gZmllbGROYW1lIDogYCR7ZmllbGROYW1lfVske3NlbGZIaWdofTowXWA7XG4gIGNvbnN0IHRleHRYID0geCArIHdpZHRoIC8gMjtcbiAgY29uc3QgdGV4dFkgPSB5ICsgaGVpZ2h0IC8gMjtcbiAgY29uc3QgdGV4dFdpZHRoID0gd2lkdGggLSAxNjtcbiAgY29uc3QgbWF4Q2hhcnMgPSBNYXRoLmZsb29yKHRleHRXaWR0aCAvIChmb250U2l6ZSAqIDAuNikpO1xuXG4gIGxldCBkaXNwbGF5VGV4dCA9IHNlbGZMYWJlbDtcbiAgaWYgKHNlbGZMYWJlbC5sZW5ndGggPiBtYXhDaGFycyAmJiBtYXhDaGFycyA+IDMpIHtcbiAgICBkaXNwbGF5VGV4dCA9IHNlbGZMYWJlbC5zdWJzdHJpbmcoMCwgbWF4Q2hhcnMgLSAyKSArICcuLic7XG4gIH1cblxuICBjb25zdCB0ZXh0RGVjb3JhdGlvbiA9ICcnO1xuICBjb25zdCBmaWxsQ29sb3IgPSBpc1JzdiA/ICcjODg4JyA6ICcjMzMzJztcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHt0ZXh0WH1cIiB5PVwiJHt0ZXh0WX1cIiBmb250LXNpemU9XCIke2ZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiR7ZmlsbENvbG9yfVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCIke3RleHREZWNvcmF0aW9ufSBkYXRhLWZpZWxkPVwiJHtmaWVsZE5hbWV9XCIke2lzUmVmID8gYCBkYXRhLXJlZj1cIiR7ZmllbGQucmVmTmFtZX1cImAgOiAnJ30gc3R5bGU9XCJjdXJzb3I6JHtpc1JlZiA/ICdwb2ludGVyJyA6ICdkZWZhdWx0J31cIj4ke2Rpc3BsYXlUZXh0fTwvdGV4dD5gO1xuXG4gIC8vIOahhuWklu+8mueItuWtl+autee0ouW8lSBbbXNiOmxzYl3vvIzngbDoibLlsI/lrZdcbiAgY29uc3QgcGFyZW50SGlnaCA9IGZpZWxkLm1zYjtcbiAgY29uc3QgcGFyZW50TG93ID0gZmllbGQubHNiO1xuICBjb25zdCBwYXJlbnRMYWJlbCA9IHBhcmVudEhpZ2ggPT09IHBhcmVudExvdyA/IGBbJHtwYXJlbnRIaWdofV1gIDogYFske3BhcmVudEhpZ2h9OiR7cGFyZW50TG93fV1gO1xuICBjb25zdCBhbm5vdGF0aW9uRm9udFNpemUgPSBmb250U2l6ZSAqIDAuNztcblxuICBpZiAobGF5b3V0RGlyZWN0aW9uID09PSAndmVydGljYWwnKSB7XG4gICAgLy8g57q15ZCR77ya5qCH5rOo5Zyo5Y+z5L6n77yM5bem5a+56b2Q77yI5bem5L6n56m66Ze05LiN6Laz5pe2IDMg5L2N5pWw5a2X5qCH5rOo5LiN5Lya6KKrIHZpZXdCb3gg6KOB5Ymq77yJXG4gICAgY29uc3QgYW5ub3RYID0geCArIHdpZHRoICsgODtcbiAgICBjb25zdCBhbm5vdFkgPSB0ZXh0WTtcbiAgICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fubm90WH1cIiB5PVwiJHthbm5vdFl9XCIgZm9udC1zaXplPVwiJHthbm5vdGF0aW9uRm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJzdGFydFwiIGRvbWluYW50LWJhc2VsaW5lPVwiY2VudHJhbFwiIGZpbGw9XCIjOTk5XCIgZm9udC1mYW1pbHk9XCJtb25vc3BhY2VcIj4ke3BhcmVudExhYmVsfTwvdGV4dD5gO1xuICB9IGVsc2Uge1xuICAgIC8vIOaoquWQke+8muagh+azqOWcqOS4iuaWue+8jOWxheS4rVxuICAgIGNvbnN0IGFubm90WCA9IHRleHRYO1xuICAgIGNvbnN0IGFubm90WSA9IHkgLSA4O1xuICAgIHN2ZyArPSBgPHRleHQgeD1cIiR7YW5ub3RYfVwiIHk9XCIke2Fubm90WX1cIiBmb250LXNpemU9XCIke2Fubm90YXRpb25Gb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCIjOTk5XCIgZm9udC1mYW1pbHk9XCJtb25vc3BhY2VcIj4ke3BhcmVudExhYmVsfTwvdGV4dD5gO1xuICB9XG5cbiAgcmV0dXJuIHN2Zztcbn1cbiIsImltcG9ydCB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG4vKipcclxuICog5riy5p+T5Z2X55qEIEhUTUwg6KGo5qC8XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tUYWJsZShibG9jazogRmllbGRCbG9jayk6IHN0cmluZyB7XHJcbiAgY29uc3Qgcm93czogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jaGlsZHJlbikge1xyXG4gICAgY29sbGVjdFJvd3MoY2hpbGQsIDAsIHJvd3MpO1xyXG4gIH1cclxuXHJcbiAgbGV0IGh0bWwgPSAnPHRhYmxlIGNsYXNzPVwidmVyaWxvZy1iaXRmaWVsZC10YWJsZVwiPic7XHJcbiAgaHRtbCArPSAnPHRoZWFkPjx0cj4nO1xyXG4gIGh0bWwgKz0gJzx0aD5GaWVsZDwvdGg+JztcclxuICBodG1sICs9ICc8dGg+V2lkdGg8L3RoPic7XHJcbiAgaHRtbCArPSAnPHRoPkJpdCBSYW5nZTwvdGg+JztcclxuICBodG1sICs9ICc8dGg+RGVzY3JpcHRpb248L3RoPic7XHJcbiAgaHRtbCArPSAnPC90cj48L3RoZWFkPic7XHJcbiAgaHRtbCArPSAnPHRib2R5Pic7XHJcbiAgaHRtbCArPSByb3dzLmpvaW4oJycpO1xyXG4gIGh0bWwgKz0gJzwvdGJvZHk+PC90YWJsZT4nO1xyXG4gIHJldHVybiBodG1sO1xyXG59XHJcblxyXG4vKipcclxuICog6YCS5b2S5pS26ZuG6KGo5qC86KGMXHJcbiAqL1xyXG5mdW5jdGlvbiBjb2xsZWN0Um93cyhmaWVsZDogQml0RmllbGQsIGRlcHRoOiBudW1iZXIsIHJvd3M6IHN0cmluZ1tdKTogdm9pZCB7XHJcbiAgY29uc3QgaW5kZW50ID0gZGVwdGggPiAwID8gJyZuYnNwOyZuYnNwOyZuYnNwOyZuYnNwOycucmVwZWF0KGRlcHRoKSA6ICcnO1xyXG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XHJcbiAgY29uc3QgaXNSc3YgPSBmaWVsZC5pc1Jlc2VydmVkO1xyXG4gIGNvbnN0IG5hbWUgPSBpc1JzdiA/ICdyZXNlcnZlZCcgOiAoaXNSZWYgPyBgQCR7ZmllbGQucmVmTmFtZX1gIDogZmllbGQubmFtZSk7XHJcbiAgY29uc3QgYml0UmFuZ2UgPSBgWyR7ZmllbGQubXNifToke2ZpZWxkLmxzYn1dYDtcclxuICBjb25zdCBkZXNjcmlwdGlvbiA9IGZpZWxkLmRlc2NyaXB0aW9uIHx8ICcnO1xyXG5cclxuICBsZXQgcm93Q2xhc3MgPSAnJztcclxuICBpZiAoaXNSc3YpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlc2VydmVkLXJvd1wiJztcclxuICBlbHNlIGlmIChpc1JlZikgcm93Q2xhc3MgPSAnIGNsYXNzPVwicmVmLWNoaWxkXCInO1xyXG5cclxuICBjb25zdCBuYW1lQ2VsbCA9IGlzUmVmXHJcbiAgICA/IGA8YSBocmVmPVwiI1wiIGNsYXNzPVwiYmYtcmVmLWxpbmtcIiBkYXRhLXRhcmdldD1cIiR7ZmllbGQucmVmTmFtZX1cIj4ke2luZGVudH0ke25hbWV9PC9hPmBcclxuICAgIDogYCR7aW5kZW50fSR7bmFtZX1gO1xyXG5cclxuICByb3dzLnB1c2goYDx0ciR7cm93Q2xhc3N9PmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7bmFtZUNlbGx9PC90ZD5gKTtcclxuICByb3dzLnB1c2goYDx0ZD4ke2ZpZWxkLndpZHRofTwvdGQ+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtiaXRSYW5nZX08L3RkPmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7ZGVzY3JpcHRpb259PC90ZD5gKTtcclxuICByb3dzLnB1c2goJzwvdHI+Jyk7XHJcblxyXG4gIGlmIChmaWVsZC5jaGlsZHJlbiAmJiBmaWVsZC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZpZWxkLmNoaWxkcmVuKSB7XHJcbiAgICAgIGNvbGxlY3RSb3dzKGNoaWxkLCBkZXB0aCArIDEsIHJvd3MpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyBBcHAsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcgfSBmcm9tICdvYnNpZGlhbic7XHJcbmltcG9ydCB0eXBlIFZlcmlsb2dCaXRmaWVsZFBsdWdpbiBmcm9tICcuL21haW4nO1xyXG5pbXBvcnQgdHlwZSB7IFRhYmxlVGhlbWUgfSBmcm9tICcuL21haW4nO1xyXG5pbXBvcnQgdHlwZSB7IFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xyXG5cclxuY29uc3QgVEFCTEVfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8VGFibGVUaGVtZSwgc3RyaW5nPiA9IHtcclxuICBkZWZhdWx0OiAnRGVmYXVsdCDigJQgZ3JpZCBsaW5lcywgZ3JheSBoZWFkZXInLFxyXG4gIG1pbmltYWw6ICdNaW5pbWFsIOKAlCBob3Jpem9udGFsIGxpbmVzIG9ubHknLFxyXG4gIHplYnJhOiAnWmVicmEg4oCUIGFsdGVybmF0aW5nIHJvdyBjb2xvcnMnLFxyXG4gIGNsZWFuOiAnQ2xlYW4g4oCUIG5vIGJvcmRlcnMsIHdoaXRlc3BhY2Ugc2VwYXJhdGlvbicsXHJcbiAgJ2RhcmstaGVhZGVyJzogJ0RhcmsgSGVhZGVyIOKAlCBkYXJrIGhlYWRlciwgY2xlYW4gYm9keScsXHJcbn07XHJcblxyXG5jb25zdCBTVkdfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8U3ZnVGhlbWUsIHN0cmluZz4gPSB7XHJcbiAgcGFzdGVsOiAnUGFzdGVsIOKAlCBzb2Z0IHBhc3RlbCBjb2xvcnMnLFxyXG4gIHZpdmlkOiAnVml2aWQg4oCUIGJvbGQgc2F0dXJhdGVkIGNvbG9ycycsXHJcbiAgbW9ubzogJ01vbm8g4oCUIGdyYXlzY2FsZScsXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgVmVyaWxvZ0JpdGZpZWxkU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogVmVyaWxvZ0JpdGZpZWxkUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBWZXJpbG9nQml0ZmllbGRQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ1Zlcmlsb2cgQml0ZmllbGQnIH0pO1xyXG5cclxuICAgIC8vIFNWRyDkuLvpophcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnU1ZHIHRoZW1lJylcclxuICAgICAgLnNldERlc2MoJ0NvbG9yIHNjaGVtZSBmb3IgYml0ZmllbGQgZGlhZ3JhbXMnKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcCA9PiB7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBsYWJlbF0gb2YgT2JqZWN0LmVudHJpZXMoU1ZHX1RIRU1FX0xBQkVMUykpIHtcclxuICAgICAgICAgIGRyb3AuYWRkT3B0aW9uKGtleSwgbGFiZWwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkcm9wLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCcpO1xyXG4gICAgICAgIGRyb3Aub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z1RoZW1lID0gdmFsdWUgYXMgU3ZnVGhlbWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhKTtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnJlcmVuZGVyQWxsU3ZnKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIC8vIFNWRyDooYzpq5hcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnU1ZHIHJvdyBoZWlnaHQnKVxyXG4gICAgICAuc2V0RGVzYygnSGVpZ2h0IG9mIGVhY2ggZmllbGQgcm93IGluIGJpdGZpZWxkIGRpYWdyYW1zIChweCknKVxyXG4gICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiB7XHJcbiAgICAgICAgc2xpZGVyLnNldExpbWl0cygyOCwgODAsIDIpO1xyXG4gICAgICAgIHNsaWRlci5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCAzOCk7XHJcbiAgICAgICAgc2xpZGVyLnNldER5bmFtaWNUb29sdGlwKCk7XHJcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVyZW5kZXJBbGxTdmcoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgLy8g6KGo5qC85Li76aKYXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ1RhYmxlIHRoZW1lJylcclxuICAgICAgLnNldERlc2MoJ1Zpc3VhbCBzdHlsZSBmb3IgcmVuZGVyZWQgdGFibGVzJylcclxuICAgICAgLmFkZERyb3Bkb3duKGRyb3AgPT4ge1xyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgbGFiZWxdIG9mIE9iamVjdC5lbnRyaWVzKFRBQkxFX1RIRU1FX0xBQkVMUykpIHtcclxuICAgICAgICAgIGRyb3AuYWRkT3B0aW9uKGtleSwgbGFiZWwpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkcm9wLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xyXG4gICAgICAgIGRyb3Aub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnRhYmxlVGhlbWUgPSB2YWx1ZSBhcyBUYWJsZVRoZW1lO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5wbHVnaW4ucGx1Z2luRGF0YSk7XHJcbiAgICAgICAgICB0aGlzLmFwcGx5VGFibGVUaGVtZSh2YWx1ZSBhcyBUYWJsZVRoZW1lKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgLy8g6KGo5qC86KGM6auYXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoJ1RhYmxlIHJvdyBoZWlnaHQnKVxyXG4gICAgICAuc2V0RGVzYygnUm93IGhlaWdodCBmb3IgcmVuZGVyZWQgdGFibGVzIChweCknKVxyXG4gICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiB7XHJcbiAgICAgICAgc2xpZGVyLnNldExpbWl0cygxOCwgNDgsIDIpO1xyXG4gICAgICAgIHNsaWRlci5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0IHx8IDI4KTtcclxuICAgICAgICBzbGlkZXIuc2V0RHluYW1pY1Rvb2x0aXAoKTtcclxuICAgICAgICBzbGlkZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0ID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLnBsdWdpbi5wbHVnaW5EYXRhKTtcclxuICAgICAgICAgIHRoaXMuYXBwbHlUYWJsZVJvd0hlaWdodCh2YWx1ZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhcHBseVRhYmxlVGhlbWUodGhlbWU6IFRhYmxlVGhlbWUpOiB2b2lkIHtcclxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy52ZXJpbG9nLWJpdGZpZWxkLXRhYmxlLWNvbnRhaW5lcicpLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICBlbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGVtZSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXBwbHlUYWJsZVJvd0hlaWdodChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWJmLXRhYmxlLXJvdy1oZWlnaHQnLCBgJHtoZWlnaHR9cHhgKTtcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgUGx1Z2luLCBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0IH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4vcGFyc2VyJztcclxuaW1wb3J0IHsgcmVuZGVyQmxvY2tTdmcgfSBmcm9tICcuL3N2Z1JlbmRlcmVyJztcclxuaW1wb3J0IHsgcmVuZGVyQmxvY2tUYWJsZSB9IGZyb20gJy4vdGFibGVSZW5kZXJlcic7XHJcbmltcG9ydCB7IFJlZ2lzdHJ5RW50cnksIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcclxuaW1wb3J0IHsgVmVyaWxvZ0JpdGZpZWxkU2V0dGluZ1RhYiB9IGZyb20gJy4vc2V0dGluZ3MnO1xyXG5pbXBvcnQgeyBTdmdUaGVtZSB9IGZyb20gJy4vY29sb3JzJztcclxuXHJcbmV4cG9ydCB0eXBlIFRhYmxlVGhlbWUgPSAnZGVmYXVsdCcgfCAnbWluaW1hbCcgfCAnemVicmEnIHwgJ2NsZWFuJyB8ICdkYXJrLWhlYWRlcic7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFBsdWdpbkRhdGEge1xyXG4gIGRlZmF1bHRWaWV3PzogJ3N2ZycgfCAndGFibGUnO1xyXG4gIHRhYmxlVGhlbWU/OiBUYWJsZVRoZW1lO1xyXG4gIHN2Z1RoZW1lPzogU3ZnVGhlbWU7XHJcbiAgc3ZnQm94SGVpZ2h0PzogbnVtYmVyO1xyXG4gIHRhYmxlUm93SGVpZ2h0PzogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9EQVRBOiBQbHVnaW5EYXRhID0geyBkZWZhdWx0VmlldzogJ3N2ZycsIHRhYmxlVGhlbWU6ICdkZWZhdWx0Jywgc3ZnVGhlbWU6ICdwYXN0ZWwnLCBzdmdCb3hIZWlnaHQ6IDM4LCB0YWJsZVJvd0hlaWdodDogMjggfTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFZlcmlsb2dCaXRmaWVsZFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcbiAgcHJpdmF0ZSBibG9ja1JlZ2lzdHJ5OiBNYXA8c3RyaW5nLCBSZWdpc3RyeUVudHJ5PiA9IG5ldyBNYXAoKTtcclxuICBwcml2YXRlIHBlbmRpbmdSZWZzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0YXJnZXROYW1lOiBzdHJpbmcgfVtdID0gW107XHJcbiAgcHJpdmF0ZSBjdXJyZW50Tm90ZVBhdGg6IHN0cmluZyA9ICcnO1xyXG4gIHByaXZhdGUgYWN0aXZlVG9vbHRpcDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHRvb2x0aXBSZW1vdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHBsdWdpbkRhdGE6IFBsdWdpbkRhdGEgPSBERUZBVUxUX0RBVEE7XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuICAgIHRoaXMucGx1Z2luRGF0YSA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfREFUQSwgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgVmVyaWxvZ0JpdGZpZWxkU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKCd2ZXJpbG9nLWJpdGZpZWxkJywgdGhpcy5wcm9jZXNzQml0ZmllbGQuYmluZCh0aGlzKSk7XHJcbiAgICAvLyDlupTnlKjkv53lrZjnmoTooajmoLzooYzpq5hcclxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1iZi10YWJsZS1yb3ctaGVpZ2h0JywgYCR7dGhpcy5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0IHx8IDI4fXB4YCk7XHJcbiAgfVxyXG5cclxuICBvbnVubG9hZCgpIHtcclxuICAgIHRoaXMuYmxvY2tSZWdpc3RyeS5jbGVhcigpO1xyXG4gICAgdGhpcy5wZW5kaW5nUmVmcyA9IFtdO1xyXG4gICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBwcm9jZXNzQml0ZmllbGQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XHJcbiAgICB0aGlzLmN1cnJlbnROb3RlUGF0aCA9IGN0eC5zb3VyY2VQYXRoIHx8ICcnO1xyXG4gICAgY29uc3QgcmVzdWx0ID0gcGFyc2Uoc291cmNlKTtcclxuXHJcbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XHJcbiAgICAgIHRoaXMucmVuZGVyRXJyb3JzKGVsLCByZXN1bHQuZXJyb3JzIHx8IFtdKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3QgW25hbWUsIGJsb2NrXSBvZiByZXN1bHQuYmxvY2tzISkge1xyXG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XHJcbiAgICB9XHJcblxyXG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnJlc29sdmVQZW5kaW5nUmVmcygpLCA1MCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlckJsb2NrKG5hbWU6IHN0cmluZywgYmxvY2s6IEZpZWxkQmxvY2ssIHBhcmVudEVsOiBIVE1MRWxlbWVudCkge1xyXG4gICAgY29uc3QgY29udGFpbmVyID0gcGFyZW50RWwuY3JlYXRlRWwoJ2RpdicsIHtcclxuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1jb250YWluZXInLFxyXG4gICAgICBhdHRyOiB7IGlkOiBgYmY6JHtuYW1lfWAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgaGVhZGVyUm93ID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtaGVhZGVyLXJvdycgfSk7XHJcbiAgICBjb25zdCBkZXNjID0gYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2Jsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcclxuICAgIGhlYWRlclJvdy5jcmVhdGVFbCgnc3BhbicsIHtcclxuICAgICAgdGV4dDogYCR7bmFtZX0ke2Rlc2N9IOeahCAke2Jsb2NrLndpZHRofSBiaXQg5a6a5LmJ5aaC5LiL77yaYCxcclxuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1oZWFkZXInXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IHRvZ2dsZUJ0biA9IHRoaXMuY3JlYXRlVG9nZ2xlQnV0dG9uKGhlYWRlclJvdyk7XHJcblxyXG4gICAgY29uc3QgY29udGVudFdyYXAgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1jb250ZW50JyB9KTtcclxuICAgIGNvbnN0IHN2Z0NvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtc3ZnJyB9KTtcclxuICAgIHN2Z0NvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1N2ZyhibG9jaywgdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDQ0KTtcclxuICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcclxuICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcclxuXHJcbiAgICBjb25zdCB0YWJsZUNvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtdGFibGUtY29udGFpbmVyJyB9KTtcclxuICAgIHRhYmxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnZGF0YS10aGVtZScsIHRoaXMucGx1Z2luRGF0YS50YWJsZVRoZW1lIHx8ICdkZWZhdWx0Jyk7XHJcbiAgICB0YWJsZUNvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1RhYmxlKGJsb2NrKTtcclxuICAgIHRoaXMuc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XHJcbiAgICB0aGlzLnNldHVwVGFibGVUb29sdGlwSGFuZGxlcnModGFibGVDb250YWluZXIpO1xyXG5cclxuICAgIC8vIOWIneWni+WMluinhuWbvu+8muivu+WPluS/neWtmOeahOWBj+WlvVxyXG4gICAgY29uc3QgZGVmYXVsdFZpZXcgPSB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgfHwgJ3N2Zyc7XHJcbiAgICB0aGlzLmFwcGx5VmlldyhkZWZhdWx0VmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XHJcblxyXG4gICAgLy8g57uR5a6a5YiH5o2i5LqL5Lu2XHJcbiAgICB0b2dnbGVCdG4ub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICBjb25zdCB2aWV3ID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgYXMgJ3N2ZycgfCAndGFibGUnIHwgbnVsbDtcclxuICAgICAgaWYgKHZpZXcpIHtcclxuICAgICAgICB0aGlzLmFwcGx5Vmlldyh2aWV3LCBjb250ZW50V3JhcCwgc3ZnQ29udGFpbmVyLCB0YWJsZUNvbnRhaW5lciwgdG9nZ2xlQnRuKTtcclxuICAgICAgICB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgPSB2aWV3O1xyXG4gICAgICAgIHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5EYXRhKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuc2V0KG5hbWUsIHtcclxuICAgICAgZWxlbWVudDogY29udGFpbmVyLFxyXG4gICAgICBibG9jayxcclxuICAgICAgbm90ZVBhdGg6IHRoaXMuY3VycmVudE5vdGVQYXRoXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyhzdmdDb250YWluZXIpO1xyXG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnModGFibGVDb250YWluZXIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhcHBseVZpZXcodmlldzogJ3N2ZycgfCAndGFibGUnLCBjb250ZW50V3JhcDogSFRNTEVsZW1lbnQsIHN2Z0VsOiBIVE1MRWxlbWVudCwgdGFibGVFbDogSFRNTEVsZW1lbnQsIGJ0bjogSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnRlbnRXcmFwLnNldEF0dHJpYnV0ZSgnZGF0YS12aWV3Jywgdmlldyk7XHJcbiAgICBidG4ucXVlcnlTZWxlY3RvckFsbCgnLmJmLXRvZ2dsZS1vcHRpb24nKS5mb3JFYWNoKG9wdCA9PiB7XHJcbiAgICAgIG9wdC5jbGFzc0xpc3QudG9nZ2xlKCdiZi10b2dnbGUtYWN0aXZlJywgb3B0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgPT09IHZpZXcpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZVRvZ2dsZUJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xyXG4gICAgY29uc3QgYnRuID0gcGFyZW50LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JmLXZpZXctdG9nZ2xlJyB9KTtcclxuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+S9jeWfn+WbvicsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXN2ZycsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICdzdmcnIH0gfSk7XHJcbiAgICBidG4uY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfooajmoLwnLCBjbHM6ICdiZi10b2dnbGUtb3B0aW9uIGJmLXRvZ2dsZS10YWJsZScsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICd0YWJsZScgfSB9KTtcclxuICAgIHJldHVybiBidG47XHJcbiAgfVxyXG5cclxuICAvKiog6YeN5paw5riy5p+T5omA5pyJIFNWRyDkvY3ln5/lm77vvIjkuLvpopjlj5jmm7Tml7bosIPnlKjvvIkgKi9cclxuICBwdWJsaWMgcmVyZW5kZXJBbGxTdmcoKTogdm9pZCB7XHJcbiAgICBjb25zdCB0aGVtZSA9IHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJztcclxuICAgIGZvciAoY29uc3QgWywgZW50cnldIG9mIHRoaXMuYmxvY2tSZWdpc3RyeSkge1xyXG4gICAgICBjb25zdCBzdmdDb250YWluZXIgPSBlbnRyeS5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy52ZXJpbG9nLWJpdGZpZWxkLXN2ZycpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAgICAgaWYgKHN2Z0NvbnRhaW5lcikge1xyXG4gICAgICAgIHN2Z0NvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1N2ZyhlbnRyeS5ibG9jaywgdGhlbWUsIHRoaXMucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgfHwgNDQpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcclxuICAgICAgICB0aGlzLnNldHVwVG9vbHRpcEhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVuZGVyRXJyb3JzKGVsOiBIVE1MRWxlbWVudCwgZXJyb3JzOiB7IGxpbmU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nOyBzdWdnZXN0aW9uPzogc3RyaW5nIH1bXSkge1xyXG4gICAgZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1lcnJvcicgfSwgKGVycm9yRWwpID0+IHtcclxuICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+ino+aekOmUmeivrzonIH0pO1xyXG4gICAgICBmb3IgKGNvbnN0IGVycm9yIG9mIGVycm9ycykge1xyXG4gICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDooYwgJHtlcnJvci5saW5lfTogJHtlcnJvci5tZXNzYWdlfWAgfSk7XHJcbiAgICAgICAgaWYgKGVycm9yLnN1Z2dlc3Rpb24pIHtcclxuICAgICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDlu7rorq46ICR7ZXJyb3Iuc3VnZ2VzdGlvbn1gLCBjbHM6ICdzdWdnZXN0aW9uJyB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLy8g4pSA4pSA4pSAIOeCueWHu+i3s+i9rCDilIDilIDilIBcclxuXHJcbiAgcHJpdmF0ZSBzZXR1cE5hdmlnYXRpb25IYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XHJcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXHJcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcclxuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgY29udGFpbmVyLm9uY2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XHJcbiAgICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2Nyb2xsVG9CbG9jayhibG9ja05hbWU6IHN0cmluZykge1xyXG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XHJcbiAgICBpZiAoIWVudHJ5KSByZXR1cm47XHJcbiAgICBlbnRyeS5lbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XHJcbiAgICBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2JmLWhpZ2hsaWdodCcpO1xyXG4gICAgc2V0VGltZW91dCgoKSA9PiBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JmLWhpZ2hsaWdodCcpLCAxNTAwKTtcclxuICB9XHJcblxyXG4gIC8vIOKUgOKUgOKUgCDmgqzmta4gdG9vbHRpcCDilIDilIDilIBcclxuXHJcbiAgcHJpdmF0ZSBzZXR1cFRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcclxuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcclxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xyXG4gICAgICBpZiAocmVmTmFtZSkge1xyXG4gICAgICAgIC8vIOm8oOagh+WbnuWIsOa6kOWFg+e0oOS4iu+8jOWPlua2iOW+heWIoOmZpOWumuaXtuWZqFxyXG4gICAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xyXG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcclxuICAgICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Vmlld0ZvckJsb2NrKHJlZk5hbWUpO1xyXG4gICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFksIHZpZXcpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XHJcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXHJcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcclxuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XHJcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XHJcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpO1xyXG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKTtcclxuICAgICAgICBpZiAocmVmTmFtZSkge1xyXG4gICAgICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Vmlld0ZvckJsb2NrKHJlZk5hbWUpO1xyXG4gICAgICAgICAgdGhpcy5zaG93VG9vbHRpcChyZWZOYW1lLCBlLmNsaWVudFgsIGUuY2xpZW50WSwgdmlldyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYmYtcmVmLWxpbmsnKSkgdGhpcy5zY2hlZHVsZVRvb2x0aXBSZW1vdmUoKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqIOiOt+WPluiiq+W8leeUqOWdl+iHqui6q+eahOinhuWbvueKtuaAge+8jOS4jeWtmOWcqOWImeeUqOm7mOiupOWBj+WlvSAqL1xyXG4gIHByaXZhdGUgZ2V0Vmlld0ZvckJsb2NrKGJsb2NrTmFtZTogc3RyaW5nKTogJ3N2ZycgfCAndGFibGUnIHtcclxuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xyXG4gICAgaWYgKGVudHJ5KSB7XHJcbiAgICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gZW50cnkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcudmVyaWxvZy1iaXRmaWVsZC1jb250ZW50Jyk7XHJcbiAgICAgIGNvbnN0IHZpZXcgPSBjb250ZW50V3JhcD8uZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScgfCB1bmRlZmluZWQ7XHJcbiAgICAgIGlmICh2aWV3KSByZXR1cm4gdmlldztcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgfHwgJ3N2Zyc7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpIHtcclxuICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xyXG4gICAgfSwgMjAwKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2hvd1Rvb2x0aXAoYmxvY2tOYW1lOiBzdHJpbmcsIG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlciwgdmlldzogJ3N2ZycgfCAndGFibGUnKSB7XHJcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcclxuICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcclxuXHJcbiAgICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICB0b29sdGlwLmNsYXNzTmFtZSA9ICdiZi10b29sdGlwJztcclxuXHJcbiAgICBjb25zdCBkZXNjID0gZW50cnkuYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2VudHJ5LmJsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcclxuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGAke2Jsb2NrTmFtZX0ke2Rlc2N9YCwgY2xzOiAnYmYtdG9vbHRpcC1oZWFkZXInIH0pO1xyXG5cclxuICAgIGlmICh2aWV3ID09PSAnc3ZnJykge1xyXG4gICAgICBjb25zdCBzdmdXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXN2ZycgfSk7XHJcbiAgICAgIHN2Z1dyYXAuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tTdmcoZW50cnkuYmxvY2ssIHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJywgdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCA0NCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCB0YWJsZVdyYXAgPSB0b29sdGlwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JmLXRvb2x0aXAtdGFibGUnIH0pO1xyXG4gICAgICB0YWJsZVdyYXAuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tUYWJsZShlbnRyeS5ibG9jayk7XHJcbiAgICB9XHJcblxyXG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+WNleWHu+i3s+i9rOafpeeci+WujOaVtOWumuS5iScsIGNsczogJ2JmLXRvb2x0aXAtaGludCcgfSk7XHJcblxyXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0b29sdGlwKTtcclxuICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IHRvb2x0aXA7XHJcblxyXG4gICAgY29uc3QgcmVjdCA9IHRvb2x0aXAuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBsZXQgbGVmdCA9IG1vdXNlWCArIDEyO1xyXG4gICAgbGV0IHRvcCA9IG1vdXNlWSAtIDIwO1xyXG4gICAgaWYgKGxlZnQgKyByZWN0LndpZHRoID4gd2luZG93LmlubmVyV2lkdGggLSAxNikgbGVmdCA9IG1vdXNlWCAtIHJlY3Qud2lkdGggLSAxMjtcclxuICAgIGlmICh0b3AgKyByZWN0LmhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDE2KSB0b3AgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDE2O1xyXG4gICAgaWYgKHRvcCA8IDgpIHRvcCA9IDg7XHJcblxyXG4gICAgdG9vbHRpcC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XHJcbiAgICB0b29sdGlwLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XHJcbiAgICAvLyDpvKDmoIfov5vlhaUgdG9vbHRpcCDml7blj5bmtojlvoXliKDpmaTlrprml7blmahcclxuICAgIHRvb2x0aXAuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcclxuICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcclxuICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgdG9vbHRpcC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4gdGhpcy5yZW1vdmVUb29sdGlwKCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZW1vdmVUb29sdGlwKCkge1xyXG4gICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCkge1xyXG4gICAgICB0aGlzLmFjdGl2ZVRvb2x0aXAucmVtb3ZlKCk7XHJcbiAgICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyDilIDilIDilIAg5byV55So6Kej5p6QIOKUgOKUgOKUgFxyXG5cclxuICBwcml2YXRlIGNvbGxlY3RQZW5kaW5nUmVmcyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcmVmXScpLmZvckVhY2goKGVsKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJykhO1xyXG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocmVmTmFtZSkpIHtcclxuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZTogcmVmTmFtZSB9KTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmJmLXJlZi1saW5rJykuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0TmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKSE7XHJcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5Lmhhcyh0YXJnZXROYW1lKSkge1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlZnMucHVzaCh7IGVsZW1lbnQ6IGVsIGFzIEhUTUxFbGVtZW50LCB0YXJnZXROYW1lIH0pO1xyXG4gICAgICAgIChlbCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmFkZCgnYmYtcmVmLXVucmVzb2x2ZWQnKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlc29sdmVQZW5kaW5nUmVmcygpIHtcclxuICAgIGNvbnN0IHN0aWxsUGVuZGluZzogdHlwZW9mIHRoaXMucGVuZGluZ1JlZnMgPSBbXTtcclxuICAgIGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLnBlbmRpbmdSZWZzKSB7XHJcbiAgICAgIGlmICh0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHBlbmRpbmcudGFyZ2V0TmFtZSkpIHtcclxuICAgICAgICBwZW5kaW5nLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtcmVmLXVucmVzb2x2ZWQnKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBzdGlsbFBlbmRpbmcucHVzaChwZW5kaW5nKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgdGhpcy5wZW5kaW5nUmVmcyA9IHN0aWxsUGVuZGluZztcclxuICB9XHJcbn1cclxuIl0sIm5hbWVzIjpbImkiLCJQbHVnaW5TZXR0aW5nVGFiIiwiU2V0dGluZyIsIlBsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBYU8sU0FBUyxNQUFNLEtBQUEsRUFBNEI7QUFDaEQsRUFBQSxNQUFNLEtBQUEsR0FBUSxLQUFBLENBQU0sS0FBQSxDQUFNLElBQUksQ0FBQTtBQUM5QixFQUFBLE1BQU0sU0FBdUIsRUFBQztBQUM5QixFQUFBLE1BQU0sTUFBQSx1QkFBYSxHQUFBLEVBQXdCO0FBQzNDLEVBQUEsTUFBTSxVQUFBLHVCQUFpQixHQUFBLEVBQVk7QUFHbkMsRUFBQSxNQUFNLFdBQXNCLEVBQUM7QUFDN0IsRUFBQSxLQUFBLElBQVNBLEVBQUFBLEdBQUksQ0FBQSxFQUFHQSxFQUFBQSxHQUFJLEtBQUEsQ0FBTSxRQUFRQSxFQUFBQSxFQUFBQSxFQUFLO0FBQ3JDLElBQUEsTUFBTSxJQUFBLEdBQU8sTUFBTUEsRUFBQyxDQUFBO0FBQ3BCLElBQUEsSUFBSSxDQUFDLEtBQUssSUFBQSxFQUFLLElBQUssS0FBSyxJQUFBLEVBQUssQ0FBRSxVQUFBLENBQVcsSUFBSSxDQUFBLEVBQUc7QUFDaEQsTUFBQTtBQUFBLElBQ0Y7QUFDQSxJQUFBLFFBQUEsQ0FBUyxJQUFBLENBQUs7QUFBQSxNQUNaLFNBQVNBLEVBQUFBLEdB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
