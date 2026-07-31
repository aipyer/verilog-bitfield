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
  let html = '<table class="bitfield-table">';
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
class BitfieldSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  get data() {
    return this.plugin.savedData;
  }
  set data(v) {
    this.plugin.savedData = v;
  }
  /** Declarative settings definitions for Obsidian 1.13.0+ search */
  getSettingDefinitions() {
    return [{
      type: "group",
      items: [
        {
          name: "SVG theme",
          desc: "Color scheme for bitfield diagrams",
          control: {
            key: "svgTheme",
            type: "dropdown",
            defaultValue: "pastel",
            options: SVG_THEME_LABELS
          }
        },
        {
          name: "SVG row height",
          desc: "Height of each field row in bitfield diagrams (px)",
          control: {
            key: "svgBoxHeight",
            type: "slider",
            defaultValue: 38,
            min: 28,
            max: 80,
            step: 2
          }
        },
        {
          name: "Table theme",
          desc: "Visual style for rendered tables",
          control: {
            key: "tableTheme",
            type: "dropdown",
            defaultValue: "default",
            options: TABLE_THEME_LABELS
          }
        },
        {
          name: "Table row height",
          desc: "Row height for rendered tables (px)",
          control: {
            key: "tableRowHeight",
            type: "slider",
            defaultValue: 28,
            min: 18,
            max: 48,
            step: 2
          }
        }
      ]
    }];
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setHeading();
    new obsidian.Setting(containerEl).setName("SVG theme").setDesc("Color scheme for bitfield diagrams").addDropdown((drop) => {
      for (const [key, label] of Object.entries(SVG_THEME_LABELS)) {
        drop.addOption(key, label);
      }
      drop.setValue(this.data.svgTheme || "pastel");
      drop.onChange(async (value) => {
        this.data.svgTheme = value;
        await this.plugin.saveData(this.data);
        this.plugin.rerenderAllSvg();
      });
    });
    new obsidian.Setting(containerEl).setName("SVG row height").setDesc("Height of each field row in bitfield diagrams (px)").addSlider((slider) => {
      slider.setLimits(28, 80, 2);
      slider.setValue(this.data.svgBoxHeight || 38);
      slider.onChange(async (value) => {
        this.data.svgBoxHeight = value;
        await this.plugin.saveData(this.data);
        this.plugin.rerenderAllSvg();
      });
    });
    new obsidian.Setting(containerEl).setName("Table theme").setDesc("Visual style for rendered tables").addDropdown((drop) => {
      for (const [key, label] of Object.entries(TABLE_THEME_LABELS)) {
        drop.addOption(key, label);
      }
      drop.setValue(this.data.tableTheme || "default");
      drop.onChange(async (value) => {
        this.data.tableTheme = value;
        await this.plugin.saveData(this.data);
        this.applyTableTheme(value);
      });
    });
    new obsidian.Setting(containerEl).setName("Table row height").setDesc("Row height for rendered tables (px)").addSlider((slider) => {
      slider.setLimits(18, 48, 2);
      slider.setValue(this.data.tableRowHeight || 28);
      slider.onChange(async (value) => {
        this.data.tableRowHeight = value;
        await this.plugin.saveData(this.data);
        this.applyTableRowHeight(value);
      });
    });
  }
  applyTableTheme(theme) {
    document.querySelectorAll(".bitfield-table-container").forEach((el) => {
      el.setAttribute("data-theme", theme);
    });
  }
  applyTableRowHeight(height) {
    document.documentElement.style.setProperty("--bf-table-row-height", `${height}px`);
  }
}

const DEFAULT_DATA = { defaultView: "svg", tableTheme: "default", svgTheme: "pastel", svgBoxHeight: 38, tableRowHeight: 28 };
class BitfieldPlugin extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.blockRegistry = /* @__PURE__ */ new Map();
    this.pendingRefs = [];
    this.currentNotePath = "";
    this.activeTooltip = null;
    this.tooltipRemoveTimer = null;
    this.pluginData = DEFAULT_DATA;
  }
  // public accessor for SettingTab
  get savedData() {
    return this.pluginData;
  }
  set savedData(v) {
    this.pluginData = v;
  }
  async onload() {
    this.pluginData = Object.assign({}, DEFAULT_DATA, await this.loadData());
    this.addSettingTab(new BitfieldSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("bitfield", this.processBitfield.bind(this));
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
    if (!result.blocks) return;
    for (const [name, block] of result.blocks) {
      this.renderBlock(name, block, el);
    }
    window.setTimeout(() => this.resolvePendingRefs(), 50);
  }
  renderBlock(name, block, parentEl) {
    const container = parentEl.createEl("div", {
      cls: "bitfield-container",
      attr: { id: `bf:${name}` }
    });
    const headerRow = container.createEl("div", { cls: "bitfield-header-row" });
    const desc = block.description ? ` \u2014 ${block.description}` : "";
    headerRow.createEl("span", {
      text: `${name}${desc} \u7684 ${block.width} bit \u5B9A\u4E49\u5982\u4E0B\uFF1A`,
      cls: "bitfield-header"
    });
    const toggleBtn = this.createToggleButton(headerRow);
    const contentWrap = container.createEl("div", { cls: "bitfield-content" });
    const svgContainer = contentWrap.createEl("div", { cls: "bitfield-svg" });
    obsidian.createFragment((fragment) => {
      fragment.setHTML(renderBlockSvg(block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 44));
    }).appendTo(svgContainer);
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);
    const tableContainer = contentWrap.createEl("div", { cls: "bitfield-table-container" });
    tableContainer.setAttribute("data-theme", this.pluginData.tableTheme || "default");
    obsidian.createFragment((fragment) => {
      fragment.setHTML(renderBlockTable(block));
    }).appendTo(tableContainer);
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
  /** Rerender all SVGs with current theme — public for SettingTab */
  rerenderAllSvg() {
    const theme = this.pluginData.svgTheme || "pastel";
    for (const [, entry] of this.blockRegistry) {
      const svgContainer = entry.element.querySelector(".bitfield-svg");
      if (svgContainer) {
        obsidian.createFragment((fragment) => {
          fragment.setHTML(renderBlockSvg(entry.block, theme, this.pluginData.svgBoxHeight || 44));
        }).appendTo(svgContainer);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
    }
  }
  renderErrors(el, errors) {
    el.createEl("div", { cls: "bitfield-error" }, (errorEl) => {
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
    window.setTimeout(() => entry.element.classList.remove("bf-highlight"), 1500);
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
      if (target.classList.contains("bf-ref-link")) {
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
      if (target.classList.contains("bf-ref-link")) this.scheduleTooltipRemove();
    });
  }
  /** 获取被引用块自身的视图状态，不存在则用默认偏好 */
  getViewForBlock(blockName) {
    const entry = this.blockRegistry.get(blockName);
    if (entry) {
      const contentWrap = entry.element.querySelector(".bitfield-content");
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
    const tooltip = document.body.createEl("div", { cls: "bf-tooltip" });
    const desc = entry.block.description ? ` \u2014 ${entry.block.description}` : "";
    tooltip.createEl("p", { text: `${blockName}${desc}`, cls: "bf-tooltip-header" });
    if (view === "svg") {
      const svgWrap = tooltip.createEl("div", { cls: "bf-tooltip-svg" });
      obsidian.createFragment((fragment) => {
        fragment.setHTML(renderBlockSvg(entry.block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 44));
      }).appendTo(svgWrap);
    } else {
      const tableWrap = tooltip.createEl("div", { cls: "bf-tooltip-table" });
      obsidian.createFragment((fragment) => {
        fragment.setHTML(renderBlockTable(entry.block));
      }).appendTo(tableWrap);
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
        window.clearTimeout(this.tooltipRemoveTimer);
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
      const refName = el.getAttribute("data-ref") ?? "";
      if (!refName) return;
      if (!this.blockRegistry.has(refName)) {
        this.pendingRefs.push({ element: el, targetName: refName });
      }
    });
    container.querySelectorAll(".bf-ref-link").forEach((el) => {
      const targetName = el.getAttribute("data-target") ?? "";
      if (!targetName) return;
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
exports.default = BitfieldPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9zZXR0aW5ncy50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQml0RmllbGQsIEZpZWxkQmxvY2ssIFBhcnNlRXJyb3IsIFBhcnNlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG5pbnRlcmZhY2UgUmF3TGluZSB7XHJcbiAgbGluZU51bTogbnVtYmVyO1xyXG4gIGluZGVudDogbnVtYmVyO1xyXG4gIGNvbnRlbnQ6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIOino+aekOS9jeWfn+WumuS5iVxyXG4gKiDnu5/kuIDor63ms5XvvJrmr4/kuKrku6PnoIHlnZfnlLHkuIDkuKrmiJblpJrkuKogZGVmaW5pdGlvbiBibG9jayDnu4TmiJBcclxuICog5q+P5Liq5Z2X77ya56ys5LiA6KGMIG5hbWUgd2lkdGggW2Rlc2NyaXB0aW9uXe+8jOWtkOWtl+autemAmui/h+e8qei/m+W1jOWll1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGlucHV0OiBzdHJpbmcpOiBQYXJzZVJlc3VsdCB7XHJcbiAgY29uc3QgbGluZXMgPSBpbnB1dC5zcGxpdCgnXFxuJyk7XHJcbiAgY29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcclxuICBjb25zdCBibG9ja3MgPSBuZXcgTWFwPHN0cmluZywgRmllbGRCbG9jaz4oKTtcclxuICBjb25zdCBibG9ja05hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcblxyXG4gIC8vIOmihOWkhOeQhu+8mui/h+a7pOepuuihjOWSjOazqOmHilxyXG4gIGNvbnN0IHJhd0xpbmVzOiBSYXdMaW5lW10gPSBbXTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV07XHJcbiAgICBpZiAoIWxpbmUudHJpbSgpIHx8IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy8vJykpIHtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICByYXdMaW5lcy5wdXNoKHtcclxuICAgICAgbGluZU51bTogaSArIDEsXHJcbiAgICAgIGluZGVudDogbGluZS5zZWFyY2goL1xcUy8pLFxyXG4gICAgICBjb250ZW50OiBsaW5lLnRyaW0oKVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAocmF3TGluZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn6L6T5YWl5Li656m6JyB9XSB9O1xyXG4gIH1cclxuXHJcbiAgLy8g6YCQ6KGM6Kej5p6Q77yMaW5kZW50PTAg55qE6KGM5L2c5Li65Z2X5aS0XHJcbiAgbGV0IGkgPSAwO1xyXG4gIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBybCA9IHJhd0xpbmVzW2ldO1xyXG5cclxuICAgIGlmIChybC5pbmRlbnQgIT09IDApIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5oSP5aSW55qE57yp6L+b6KGMOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWF0Y2ggPSBybC5jb250ZW50Lm1hdGNoKC9eKFxcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgWywgbmFtZSwgd2lkdGhTdHIsIGRlc2NdID0gbWF0Y2g7XHJcblxyXG4gICAgaWYgKGJsb2NrTmFtZXMuaGFzKG5hbWUpKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICBsaW5lOiBybC5saW5lTnVtLFxyXG4gICAgICAgIG1lc3NhZ2U6IGDph43lpI3lrprkuYk6IFwiJHtuYW1lfVwiYCxcclxuICAgICAgICBzdWdnZXN0aW9uOiAn5ZCM56yU6K6w5YaF5Z2X5ZCN5b+F6aG75ZSv5LiAJ1xyXG4gICAgICB9KTtcclxuICAgICAgaSsrO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGJsb2NrTmFtZXMuYWRkKG5hbWUpO1xyXG5cclxuICAgIGNvbnN0IGJsb2NrOiBGaWVsZEJsb2NrID0ge1xyXG4gICAgICBuYW1lLFxyXG4gICAgICB3aWR0aDogcGFyc2VJbnQod2lkdGhTdHIsIDEwKSxcclxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXHJcbiAgICAgIGNoaWxkcmVuOiBbXVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyDmlLbpm4blrZDlrZfmrrXvvIjov57nu63nmoTnvKnov5vooYzvvIlcclxuICAgIGkrKztcclxuICAgIGNvbnN0IGNoaWxkcmVuU3RhcnQgPSBpO1xyXG4gICAgd2hpbGUgKGkgPCByYXdMaW5lcy5sZW5ndGggJiYgcmF3TGluZXNbaV0uaW5kZW50ID4gMCkge1xyXG4gICAgICBpKys7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZHJlbkxpbmVzID0gcmF3TGluZXMuc2xpY2UoY2hpbGRyZW5TdGFydCwgaSk7XHJcblxyXG4gICAgaWYgKGNoaWxkcmVuTGluZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBwYXJzZUNoaWxkcmVuKGNoaWxkcmVuTGluZXMsIGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMsIDAsIG5hbWUpO1xyXG4gICAgICBjYWxjdWxhdGVCaXRSYW5nZXMoYmxvY2suY2hpbGRyZW4pO1xyXG4gICAgICBhdXRvRmlsbFJlc2VydmVkKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g6aqM6K+B5L2N5a69XHJcbiAgICB2YWxpZGF0ZUJpdFdpZHRocyhibG9jay5jaGlsZHJlbiwgZXJyb3JzKTtcclxuXHJcbiAgICBibG9ja3Muc2V0KG5hbWUsIGJsb2NrKTtcclxuICB9XHJcblxyXG4gIGlmIChibG9ja3Muc2l6ZSA9PT0gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogW3sgbGluZTogMCwgbWVzc2FnZTogJ+acquaJvuWIsOacieaViOeahOWumuS5ieWdlycgfV0gfTtcclxuICB9XHJcblxyXG4gIGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmxvY2tzIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDop6PmnpDlrZDlrZfmrrXliJfooahcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlQ2hpbGRyZW4oXHJcbiAgbGluZXM6IFJhd0xpbmVbXSxcclxuICBjaGlsZHJlbjogQml0RmllbGRbXSxcclxuICBlcnJvcnM6IFBhcnNlRXJyb3JbXSxcclxuICBiYXNlSW5kZW50OiBudW1iZXIsXHJcbiAgX3BhcmVudE5hbWU6IHN0cmluZ1xyXG4pOiB2b2lkIHtcclxuICBjb25zdCBzdGFjazogeyBmaWVsZDogQml0RmllbGQ7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xyXG5cclxuICBmb3IgKGNvbnN0IHJsIG9mIGxpbmVzKSB7XHJcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oQD9cXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XHJcbiAgICBpZiAoIW1hdGNoKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaXoOazleino+aekDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcclxuICAgIGNvbnN0IHdpZHRoID0gcGFyc2VJbnQod2lkdGhTdHIsIDEwKTtcclxuICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gbmFtZS5zdGFydHNXaXRoKCdAJyk7XHJcbiAgICBjb25zdCByZWZOYW1lID0gaXNSZWZlcmVuY2UgPyBuYW1lLnNsaWNlKDEpIDogbmFtZTtcclxuXHJcbiAgICAvLyDltYzlpZflsYLnuqfmo4Dmn6VcclxuICAgIGNvbnN0IGRlcHRoID0gTWF0aC5mbG9vcigocmwuaW5kZW50IC0gYmFzZUluZGVudCkgLyAyKSArIDE7XHJcbiAgICBpZiAoZGVwdGggPiA1KSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOW1jOWll+Wxgue6p+i/h+a3sSAoJHtkZXB0aH0g5bGCKe+8jOacgOWkmiA1IOWxgmAgfSk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZpZWxkOiBCaXRGaWVsZCA9IHtcclxuICAgICAgbmFtZTogcmVmTmFtZSxcclxuICAgICAgd2lkdGgsXHJcbiAgICAgIG1zYjogMCxcclxuICAgICAgbHNiOiAwLFxyXG4gICAgICBkZXNjcmlwdGlvbjogZGVzYz8udHJpbSgpIHx8IHVuZGVmaW5lZCxcclxuICAgICAgaXNSZXNlcnZlZDogbmFtZS50b0xvd2VyQ2FzZSgpID09PSAncmVzZXJ2ZWQnLFxyXG4gICAgICBpc1JlZmVyZW5jZSxcclxuICAgICAgcmVmTmFtZTogaXNSZWZlcmVuY2UgPyByZWZOYW1lIDogdW5kZWZpbmVkLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcblxyXG4gICAgLy8g5om+54i25a2X5q6177ya5LuO5qCI5Lit5om+57yp6L+b5q+U5b2T5YmN5bCP55qE5pyA5ZCO5LiA5LiqXHJcbiAgICBsZXQgcGFyZW50OiBCaXRGaWVsZCB8IG51bGwgPSBudWxsO1xyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgdG9wID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XHJcbiAgICAgIGlmICh0b3AuaW5kZW50IDwgcmwuaW5kZW50KSB7XHJcbiAgICAgICAgcGFyZW50ID0gdG9wLmZpZWxkO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgIHN0YWNrLnBvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgaWYgKCFwYXJlbnQuY2hpbGRyZW4pIHBhcmVudC5jaGlsZHJlbiA9IFtdO1xyXG4gICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChmaWVsZCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjaGlsZHJlbi5wdXNoKGZpZWxkKTtcclxuICAgIH1cclxuXHJcbiAgICBzdGFjay5wdXNoKHsgZmllbGQsIGluZGVudDogcmwuaW5kZW50IH0pO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIOiuoeeulyBiaXQg6IyD5Zu0XHJcbiAqIOmdoOWJjeWumuS5ieeahOaYryBMU0LvvIzpnaDlkI7lrprkuYnnmoTmmK8gTVNCXHJcbiAqL1xyXG5mdW5jdGlvbiBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGRzOiBCaXRGaWVsZFtdKTogdm9pZCB7XHJcbiAgbGV0IGN1cnJlbnRMc2IgPSAwO1xyXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XHJcbiAgICBmaWVsZC5sc2IgPSBjdXJyZW50THNiO1xyXG4gICAgZmllbGQubXNiID0gY3VycmVudExzYiArIGZpZWxkLndpZHRoIC0gMTtcclxuICAgIGN1cnJlbnRMc2IgPSBmaWVsZC5tc2IgKyAxO1xyXG4gICAgaWYgKCFmaWVsZC5pc1JlZmVyZW5jZSAmJiBmaWVsZC5jaGlsZHJlbiAmJiBmaWVsZC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZC5jaGlsZHJlbik7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICog5b2T5a2Q5a2X5q615oC75L2N5a695LiN5aSf5pe277yM5ZyoIE1TQiDnq6/oh6rliqjooaUgcmVzZXJ2ZWRcclxuICovXHJcbmZ1bmN0aW9uIGF1dG9GaWxsUmVzZXJ2ZWQoZmllbGRzOiBCaXRGaWVsZFtdLCBwYXJlbnRXaWR0aDogbnVtYmVyKTogdm9pZCB7XHJcbiAgY29uc3QgdG90YWxDaGlsZFdpZHRoID0gZmllbGRzLnJlZHVjZSgoc3VtLCBmKSA9PiBzdW0gKyBmLndpZHRoLCAwKTtcclxuICBjb25zdCByZW1haW5pbmcgPSBwYXJlbnRXaWR0aCAtIHRvdGFsQ2hpbGRXaWR0aDtcclxuICBpZiAocmVtYWluaW5nID4gMCkge1xyXG4gICAgY29uc3QgcmVzZXJ2ZWQ6IEJpdEZpZWxkID0ge1xyXG4gICAgICBuYW1lOiAncmVzZXJ2ZWQnLFxyXG4gICAgICB3aWR0aDogcmVtYWluaW5nLFxyXG4gICAgICBtc2I6IDAsXHJcbiAgICAgIGxzYjogMCxcclxuICAgICAgaXNSZXNlcnZlZDogdHJ1ZSxcclxuICAgICAgaXNSZWZlcmVuY2U6IGZhbHNlLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcbiAgICBmaWVsZHMucHVzaChyZXNlcnZlZCk7XHJcbiAgICBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGRzKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDpqozor4HkvY3lrr1cclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlQml0V2lkdGhzKGZpZWxkczogQml0RmllbGRbXSwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcclxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xyXG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcclxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IGNoaWxkcmVuV2lkdGggPSBjaGlsZHJlbi5yZWR1Y2UoKHN1bSwgY2hpbGQpID0+IHN1bSArIGNoaWxkLndpZHRoLCAwKTtcclxuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xyXG4gICAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICAgIGxpbmU6IDAsXHJcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXHJcbiAgICAgICAgICBzdWdnZXN0aW9uOiBg54i25a2X5q61OiAke2ZpZWxkLndpZHRofS1iaXQsIOWtkOWtl+auteaAu+WSjDogJHtjaGlsZHJlbldpZHRofS1iaXQsIOWJqeS9meepuumXtDogJHtmaWVsZC53aWR0aCAtIGNoaWxkcmVuV2lkdGh9LWJpdGBcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICB2YWxpZGF0ZUJpdFdpZHRocyhjaGlsZHJlbiwgZXJyb3JzKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwiLyoqXHJcbiAqIOminOiJsuaWueahiFxyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFN2Z1RoZW1lID0gJ3Bhc3RlbCcgfCAndml2aWQnIHwgJ21vbm8nO1xyXG5cclxuLy8g5Li76Imy77yI6aG25bGC5a2X5q6177yJ4oCUIOaflOWSjOa1heiJslxyXG5jb25zdCBQQVNURUxfQ09MT1JTID0gW1xyXG4gICcjQjNENEYwJywgLy8g5rWF6JOdXHJcbiAgJyNCOEUwQjgnLCAvLyDmtYXnu79cclxuICAnI0Y1RDZBOCcsIC8vIOa1heapmVxyXG4gICcjRDRCOEU4JywgLy8g5rWF57SrXHJcbiAgJyNBOEUwRDYnLCAvLyDmtYXpnZJcclxuICAnI0YwQjhCOCcsIC8vIOa1hee6olxyXG5dO1xyXG5cclxuLy8g6bKc6Imz6ImyXHJcbmNvbnN0IFZJVklEX0NPTE9SUyA9IFtcclxuICAnIzVCOUJENScsIC8vIOiTnVxyXG4gICcjNzBBRDQ3JywgLy8g57u/XHJcbiAgJyNFRDdEMzEnLCAvLyDmqZlcclxuICAnIzlCNTlCNicsIC8vIOe0q1xyXG4gICcjMUFCQzlDJywgLy8g6Z2SXHJcbiAgJyNFNzRDM0MnLCAvLyDnuqJcclxuXTtcclxuXHJcbi8vIOeBsOW6puiJslxyXG5jb25zdCBNT05PX0NPTE9SUyA9IFtcclxuICAnI0MwQzBDMCcsIC8vIOa1heeBsFxyXG4gICcjQThBOEE4JywgLy8g5Lit54GwXHJcbiAgJyNEMEQwRDAnLCAvLyDkuq7ngbBcclxuICAnI0IwQjBCMCcsIC8vIOmTtueBsFxyXG4gICcjQzhDOEM4JywgLy8g5reh54GwXHJcbiAgJyNCOEI4QjgnLCAvLyDmmpfpk7ZcclxuXTtcclxuXHJcbmNvbnN0IFRIRU1FX01BUDogUmVjb3JkPFN2Z1RoZW1lLCBzdHJpbmdbXT4gPSB7XHJcbiAgcGFzdGVsOiBQQVNURUxfQ09MT1JTLFxyXG4gIHZpdmlkOiBWSVZJRF9DT0xPUlMsXHJcbiAgbW9ubzogTU9OT19DT0xPUlMsXHJcbn07XHJcblxyXG4vLyDkv53nlZnoibJcclxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0U4RThFOCc7XHJcblxyXG4vKipcclxuICog6I635Y+W5a2X5q616aKc6ImyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmllbGRDb2xvcihpbmRleDogbnVtYmVyLCBpc1Jlc2VydmVkOiBib29sZWFuLCBkZXB0aDogbnVtYmVyID0gMCwgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcpOiBzdHJpbmcge1xyXG4gIGlmIChpc1Jlc2VydmVkKSB7XHJcbiAgICByZXR1cm4gUkVTRVJWRURfQ09MT1I7XHJcbiAgfVxyXG5cclxuICBjb25zdCBwYWxldHRlID0gVEhFTUVfTUFQW3RoZW1lXSB8fCBQQVNURUxfQ09MT1JTO1xyXG4gIGNvbnN0IGJhc2VDb2xvciA9IHBhbGV0dGVbaW5kZXggJSBwYWxldHRlLmxlbmd0aF07XHJcblxyXG4gIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIGJhc2VDb2xvcjtcclxuICB9XHJcblxyXG4gIC8vIOWtkOWtl+aute+8muWfuuS6jueItuiJsuiwg+aVtOS6ruW6plxyXG4gIHJldHVybiBhZGp1c3RCcmlnaHRuZXNzKGJhc2VDb2xvciwgZGVwdGggKiAxMCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDosIPmlbTpopzoibLkuq7luqZcclxuICovXHJcbmZ1bmN0aW9uIGFkanVzdEJyaWdodG5lc3MoaGV4OiBzdHJpbmcsIHBlcmNlbnQ6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgaGV4ID0gaGV4LnJlcGxhY2UoJyMnLCAnJyk7XHJcblxyXG4gIGNvbnN0IHIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDAsIDIpLCAxNik7XHJcbiAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMiwgNCksIDE2KTtcclxuICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZyg0LCA2KSwgMTYpO1xyXG5cclxuICBjb25zdCBhZGp1c3QgPSAoY2hhbm5lbDogbnVtYmVyKSA9PiB7XHJcbiAgICBjb25zdCBhZGp1c3RlZCA9IE1hdGgucm91bmQoY2hhbm5lbCArICgyNTUgLSBjaGFubmVsKSAqIChwZXJjZW50IC8gMTAwKSk7XHJcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XHJcbiAgY29uc3QgbmV3RyA9IGFkanVzdChnKTtcclxuICBjb25zdCBuZXdCID0gYWRqdXN0KGIpO1xyXG5cclxuICBjb25zdCB0b0hleCA9IChuOiBudW1iZXIpID0+IG4udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgcmV0dXJuIGAjJHt0b0hleChuZXdSKX0ke3RvSGV4KG5ld0cpfSR7dG9IZXgobmV3Qil9YDtcclxufVxyXG4iLCJpbXBvcnQgdHlwZSB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xuaW1wb3J0IHsgZ2V0RmllbGRDb2xvciB9IGZyb20gJy4vY29sb3JzJztcblxuLyoqXG4gKiBTVkcg5riy5p+T6YWN572uXG4gKi9cbmludGVyZmFjZSBSZW5kZXJDb25maWcge1xuICAvKiog5oC75L2N5a69ICovXG4gIHRvdGFsV2lkdGg6IG51bWJlcjtcbiAgLyoqIOaYr+WQpue6teWQkeaOkuWIlyAqL1xuICBpc1ZlcnRpY2FsOiBib29sZWFuO1xuICAvKiog5a2X5q615qGG6auY5bqmICovXG4gIGJveEhlaWdodDogbnVtYmVyO1xuICAvKiog5a2X5L2T5aSn5bCPICovXG4gIGZvbnRTaXplOiBudW1iZXI7XG4gIC8qKiBTVkcg5Li76aKYICovXG4gIHRoZW1lOiBTdmdUaGVtZTtcbn1cblxuLyoqXG4gKiDorqHnrpflrZfmrrXmoIfnrb7miYDpnIDnmoTmnIDlsI/lrr3luqbvvIjlg4/ntKDvvIlcbiAqL1xuLyoqXG4gKiDliKTmlq3mmK/lkKblupTkvb/nlKjnurXlkJHluIPlsYBcbiAqL1xuZnVuY3Rpb24gc2hvdWxkVXNlVmVydGljYWwoZmllbGRzOiBCaXRGaWVsZFtdLCB0b3RhbFdpZHRoOiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCBhdmFpbGFibGVXaWR0aCA9IHN2Z1dpZHRoIC0gMTIwO1xuICBjb25zdCBmb250U2l6ZSA9IDIyO1xuXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgY29uc3QgZmllbGROYW1lID0gZmllbGQuaXNSZXNlcnZlZCA/ICdyZXNlcnZlZCcgOiAoZmllbGQuaXNSZWZlcmVuY2UgPyBgQCR7ZmllbGQucmVmTmFtZX1gIDogZmllbGQubmFtZSk7XG4gICAgY29uc3Qgc2VsZkhpZ2ggPSBmaWVsZC53aWR0aCAtIDE7XG4gICAgY29uc3Qgc2VsZkxhYmVsID0gc2VsZkhpZ2ggPT09IDAgPyBmaWVsZE5hbWUgOiBgJHtmaWVsZE5hbWV9WyR7c2VsZkhpZ2h9OjBdYDtcbiAgICBjb25zdCB3aWR0aFJhdGlvID0gZmllbGQud2lkdGggLyB0b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIC8vIG1vbm9zcGFjZSDlrZfnrKblrr0g4omIIGZvbnRTaXplICogMC4277yM6ZyA6aKd5aSWICsxNiDlrrnnurPlt6blj7Pnqbrnmb1cbiAgICBjb25zdCBtaW5XaWR0aCA9IHNlbGZMYWJlbC5sZW5ndGggKiBmb250U2l6ZSAqIDAuNiArIDE2ICsgODtcbiAgICBpZiAoYm94V2lkdGggPCBtaW5XaWR0aCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIOa4suafk+Wdl+eahCBTVkcg5L2N5Z+f5Zu+XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJCbG9ja1N2ZyhibG9jazogRmllbGRCbG9jaywgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcsIGJveEhlaWdodDogbnVtYmVyID0gNDQpOiBzdHJpbmcge1xuICBjb25zdCBjb25maWc6IFJlbmRlckNvbmZpZyA9IHtcbiAgICB0b3RhbFdpZHRoOiBibG9jay53aWR0aCxcbiAgICBpc1ZlcnRpY2FsOiBzaG91bGRVc2VWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpLFxuICAgIGJveEhlaWdodCxcbiAgICBmb250U2l6ZTogMjIsXG4gICAgdGhlbWUsXG4gIH07XG5cbiAgaWYgKGNvbmZpZy5pc1ZlcnRpY2FsKSB7XG4gICAgcmV0dXJuIHJlbmRlclZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZW5kZXJIb3Jpem9udGFsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9XG59XG5cbi8qKlxuICog5qiq5ZCR5riy5p+TXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckhvcml6b250YWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodCArIDYwO1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gMjU7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgbGV0IGN1cnJlbnRYID0gc3RhcnRYO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIGNvbmZpZy50b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwLCBjb25maWcudGhlbWUpO1xuICAgIHN2ZyArPSByZW5kZXJGaWVsZEJveChmaWVsZCwgY3VycmVudFgsIHN0YXJ0WSwgYm94V2lkdGgsIGNvbmZpZy5ib3hIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUsICdob3Jpem9udGFsJyk7XG4gICAgY3VycmVudFggKz0gYm94V2lkdGg7XG4gIH1cblxuICAvLyBMU0Ig4oaSIE1TQiDmlrnlkJHnrq3lpLRcbiAgY29uc3QgYXJyb3dZID0gc3RhcnRZICsgY29uZmlnLmJveEhlaWdodCArIDIyO1xuICBjb25zdCBmcyA9IGNvbmZpZy5mb250U2l6ZSAqIDAuODU7XG4gIGNvbnN0IGZpZWxkTGVmdCA9IHN0YXJ0WDtcbiAgY29uc3QgZmllbGRSaWdodCA9IHN0YXJ0WCArIGF2YWlsYWJsZVdpZHRoO1xuICAvLyBMU0Ig5Y+z5a+56b2Q5Yiw5a2X5q615qGG5bem6L6557yYXG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7ZmllbGRMZWZ0fVwiIHk9XCIke2Fycm93WSArIDV9XCIgZm9udC1zaXplPVwiJHtmc31cIiB0ZXh0LWFuY2hvcj1cImVuZFwiIGZpbGw9XCIjOTk5XCI+TFNCPC90ZXh0PmA7XG4gIC8vIOeureWktOavlOWtl+auteahhueqhOS4gOeCue+8jOS4pOerr+eVmeepulxuICBjb25zdCBhcnJvd1BhZCA9IDEwO1xuICBzdmcgKz0gYDxsaW5lIHgxPVwiJHtmaWVsZExlZnQgKyBhcnJvd1BhZH1cIiB5MT1cIiR7YXJyb3dZfVwiIHgyPVwiJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSA4fVwiIHkyPVwiJHthcnJvd1l9XCIgc3Ryb2tlPVwiIzk5OVwiIHN0cm9rZS13aWR0aD1cIjEuNVwiLz5gO1xuICBzdmcgKz0gYDxwb2x5Z29uIHBvaW50cz1cIiR7ZmllbGRSaWdodCAtIGFycm93UGFkfSwke2Fycm93WX0gJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSAxMH0sJHthcnJvd1kgLSA1fSAke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZCAtIDEwfSwke2Fycm93WSArIDV9XCIgZmlsbD1cIiM5OTlcIi8+YDtcbiAgLy8gTVNCIOW3puWvuem9kOWIsOWtl+auteahhuWPs+i+uee8mFxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2ZpZWxkUmlnaHR9XCIgeT1cIiR7YXJyb3dZICsgNX1cIiBmb250LXNpemU9XCIke2ZzfVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOe6teWQkea4suafk++8iHZpZXdCb3gg5a695bqm5LiO5qiq5ZCR5LiA6Ie077yM5L+d5oyB5a2X5L2T6KeG6KeJ5aSn5bCP5LiA6Ie077yJXG4gKi9cbmZ1bmN0aW9uIHJlbmRlclZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgY29uZmlnOiBSZW5kZXJDb25maWcpOiBzdHJpbmcge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IHJvd0hlaWdodCA9IGNvbmZpZy5ib3hIZWlnaHQ7XG4gIGNvbnN0IHN0YXJ0WCA9IDYwO1xuICBjb25zdCBzdGFydFkgPSAyMjtcbiAgY29uc3QgYm94V2lkdGggPSBzdmdXaWR0aCAtIDE2MDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodCArIDI1O1xuXG4gIGxldCBzdmcgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAke3N2Z1dpZHRofSAke3N2Z0hlaWdodH1cIiB3aWR0aD1cIjEwMCVcIj5gO1xuXG4gIGxldCBjdXJyZW50WSA9IHN0YXJ0WTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCwgY29uZmlnLnRoZW1lKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIHN0YXJ0WCwgY3VycmVudFksIGJveFdpZHRoLCByb3dIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUpO1xuICAgIGN1cnJlbnRZICs9IHJvd0hlaWdodDtcbiAgfVxuXG4gIC8vIExTQiDihpIgTVNCIOaWueWQkeeureWktO+8iOe6teWQke+8muS7juS4iuWIsOS4i++8jOaUvuWcqOW3puS+p+ahhuWklu+8iVxuICBjb25zdCBhcnJvd1ggPSBzdGFydFggLSAyNDtcbiAgY29uc3QgYXJyb3dUb3AgPSBzdGFydFk7XG4gIGNvbnN0IGFycm93Qm90dG9tID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7YXJyb3dYfVwiIHkxPVwiJHthcnJvd1RvcCArIDh9XCIgeDI9XCIke2Fycm93WH1cIiB5Mj1cIiR7YXJyb3dCb3R0b20gLSA4fVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2Fycm93WH0sJHthcnJvd0JvdHRvbX0gJHthcnJvd1ggLSA1fSwke2Fycm93Qm90dG9tIC0gMTB9ICR7YXJyb3dYICsgNX0sJHthcnJvd0JvdHRvbSAtIDEwfVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7YXJyb3dYfVwiIHk9XCIke2Fycm93VG9wIC0gNH1cIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZSAqIDAuODV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fycm93WH1cIiB5PVwiJHthcnJvd0JvdHRvbSArIDE4fVwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplICogMC44NX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOa4suafk+Wtl+auteahhlxuICogQHBhcmFtIGxheW91dERpcmVjdGlvbiDluIPlsYDmlrnlkJHvvIznlKjkuo7lhrPlrprniLblrZfmrrXntKLlvJXmoIfms6jkvY3nva5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyRmllbGRCb3goXG4gIGZpZWxkOiBCaXRGaWVsZCxcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHdpZHRoOiBudW1iZXIsXG4gIGhlaWdodDogbnVtYmVyLFxuICBjb2xvcjogc3RyaW5nLFxuICBmb250U2l6ZTogbnVtYmVyLFxuICBsYXlvdXREaXJlY3Rpb246ICdob3Jpem9udGFsJyB8ICd2ZXJ0aWNhbCcgPSAndmVydGljYWwnXG4pOiBzdHJpbmcge1xuICBsZXQgc3ZnID0gJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgZmllbGROYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuXG4gIGNvbnN0IHN0cm9rZUNvbG9yID0gaXNSZWYgPyAnIzRBOTBEOScgOiAnI2ZmZic7XG4gIHN2ZyArPSBgPHJlY3QgeD1cIiR7eH1cIiB5PVwiJHt5fVwiIHdpZHRoPVwiJHt3aWR0aH1cIiBoZWlnaHQ9XCIke2hlaWdodH1cIiBmaWxsPVwiJHtjb2xvcn1cIiBzdHJva2U9XCIke3N0cm9rZUNvbG9yfVwiIHN0cm9rZS13aWR0aD1cIjJcIiByeD1cIjRcIiByeT1cIjRcIiBkYXRhLWZpZWxkPVwiJHtmaWVsZE5hbWV9XCIke2lzUmVmID8gYCBkYXRhLXJlZj1cIiR7ZmllbGQucmVmTmFtZX1cImAgOiAnJ30gc3R5bGU9XCJjdXJzb3I6JHtpc1JlZiA/ICdwb2ludGVyJyA6ICdkZWZhdWx0J31cIi8+YDtcblxuICAvLyDmoYblhoXvvJrlrZfmrrXoh6rouqvntKLlvJUgW3dpZHRoLTE6MF3vvIzljZUgYml0IOWtl+auteecgeeVpee0ouW8lVxuICBjb25zdCBzZWxmSGlnaCA9IGZpZWxkLndpZHRoIC0gMTtcbiAgY29uc3Qgc2VsZkxhYmVsID0gc2VsZkhpZ2ggPT09IDAgPyBmaWVsZE5hbWUgOiBgJHtmaWVsZE5hbWV9WyR7c2VsZkhpZ2h9OjBdYDtcbiAgY29uc3QgdGV4dFggPSB4ICsgd2lkdGggLyAyO1xuICBjb25zdCB0ZXh0WSA9IHkgKyBoZWlnaHQgLyAyO1xuICBjb25zdCB0ZXh0V2lkdGggPSB3aWR0aCAtIDE2O1xuICBjb25zdCBtYXhDaGFycyA9IE1hdGguZmxvb3IodGV4dFdpZHRoIC8gKGZvbnRTaXplICogMC42KSk7XG5cbiAgbGV0IGRpc3BsYXlUZXh0ID0gc2VsZkxhYmVsO1xuICBpZiAoc2VsZkxhYmVsLmxlbmd0aCA+IG1heENoYXJzICYmIG1heENoYXJzID4gMykge1xuICAgIGRpc3BsYXlUZXh0ID0gc2VsZkxhYmVsLnN1YnN0cmluZygwLCBtYXhDaGFycyAtIDIpICsgJy4uJztcbiAgfVxuXG4gIGNvbnN0IHRleHREZWNvcmF0aW9uID0gJyc7XG4gIGNvbnN0IGZpbGxDb2xvciA9IGlzUnN2ID8gJyM4ODgnIDogJyMzMzMnO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke3RleHRYfVwiIHk9XCIke3RleHRZfVwiIGZvbnQtc2l6ZT1cIiR7Zm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBkb21pbmFudC1iYXNlbGluZT1cImNlbnRyYWxcIiBmaWxsPVwiJHtmaWxsQ29sb3J9XCIgZm9udC1mYW1pbHk9XCJtb25vc3BhY2VcIiR7dGV4dERlY29yYXRpb259IGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiPiR7ZGlzcGxheVRleHR9PC90ZXh0PmA7XG5cbiAgLy8g5qGG5aSW77ya54i25a2X5q6157Si5byVIFttc2I6bHNiXe+8jOeBsOiJsuWwj+Wtl1xuICBjb25zdCBwYXJlbnRIaWdoID0gZmllbGQubXNiO1xuICBjb25zdCBwYXJlbnRMb3cgPSBmaWVsZC5sc2I7XG4gIGNvbnN0IHBhcmVudExhYmVsID0gcGFyZW50SGlnaCA9PT0gcGFyZW50TG93ID8gYFske3BhcmVudEhpZ2h9XWAgOiBgWyR7cGFyZW50SGlnaH06JHtwYXJlbnRMb3d9XWA7XG4gIGNvbnN0IGFubm90YXRpb25Gb250U2l6ZSA9IGZvbnRTaXplICogMC43O1xuXG4gIGlmIChsYXlvdXREaXJlY3Rpb24gPT09ICd2ZXJ0aWNhbCcpIHtcbiAgICAvLyDnurXlkJHvvJrmoIfms6jlnKjlj7PkvqfvvIzlt6blr7npvZDvvIjlt6bkvqfnqbrpl7TkuI3otrPml7YgMyDkvY3mlbDlrZfmoIfms6jkuI3kvJrooqsgdmlld0JveCDoo4HliarvvIlcbiAgICBjb25zdCBhbm5vdFggPSB4ICsgd2lkdGggKyA4O1xuICAgIGNvbnN0IGFubm90WSA9IHRleHRZO1xuICAgIHN2ZyArPSBgPHRleHQgeD1cIiR7YW5ub3RYfVwiIHk9XCIke2Fubm90WX1cIiBmb250LXNpemU9XCIke2Fubm90YXRpb25Gb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cInN0YXJ0XCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiM5OTlcIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiPiR7cGFyZW50TGFiZWx9PC90ZXh0PmA7XG4gIH0gZWxzZSB7XG4gICAgLy8g5qiq5ZCR77ya5qCH5rOo5Zyo5LiK5pa577yM5bGF5LitXG4gICAgY29uc3QgYW5ub3RYID0gdGV4dFg7XG4gICAgY29uc3QgYW5ub3RZID0geSAtIDg7XG4gICAgc3ZnICs9IGA8dGV4dCB4PVwiJHthbm5vdFh9XCIgeT1cIiR7YW5ub3RZfVwiIGZvbnQtc2l6ZT1cIiR7YW5ub3RhdGlvbkZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIiM5OTlcIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiPiR7cGFyZW50TGFiZWx9PC90ZXh0PmA7XG4gIH1cblxuICByZXR1cm4gc3ZnO1xufVxuIiwiaW1wb3J0IHR5cGUgeyBCaXRGaWVsZCwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xyXG5cclxuLyoqXHJcbiAqIOa4suafk+Wdl+eahCBIVE1MIOihqOagvFxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrVGFibGUoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xyXG4gIGNvbnN0IHJvd3M6IHN0cmluZ1tdID0gW107XHJcblxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY2hpbGRyZW4pIHtcclxuICAgIGNvbGxlY3RSb3dzKGNoaWxkLCAwLCByb3dzKTtcclxuICB9XHJcblxyXG4gIGxldCBodG1sID0gJzx0YWJsZSBjbGFzcz1cImJpdGZpZWxkLXRhYmxlXCI+JztcclxuICBodG1sICs9ICc8dGhlYWQ+PHRyPic7XHJcbiAgaHRtbCArPSAnPHRoPkZpZWxkPC90aD4nO1xyXG4gIGh0bWwgKz0gJzx0aD5XaWR0aDwvdGg+JztcclxuICBodG1sICs9ICc8dGg+Qml0IFJhbmdlPC90aD4nO1xyXG4gIGh0bWwgKz0gJzx0aD5EZXNjcmlwdGlvbjwvdGg+JztcclxuICBodG1sICs9ICc8L3RyPjwvdGhlYWQ+JztcclxuICBodG1sICs9ICc8dGJvZHk+JztcclxuICBodG1sICs9IHJvd3Muam9pbignJyk7XHJcbiAgaHRtbCArPSAnPC90Ym9keT48L3RhYmxlPic7XHJcbiAgcmV0dXJuIGh0bWw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDpgJLlvZLmlLbpm4booajmoLzooYxcclxuICovXHJcbmZ1bmN0aW9uIGNvbGxlY3RSb3dzKGZpZWxkOiBCaXRGaWVsZCwgZGVwdGg6IG51bWJlciwgcm93czogc3RyaW5nW10pOiB2b2lkIHtcclxuICBjb25zdCBpbmRlbnQgPSBkZXB0aCA+IDAgPyAnJm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jy5yZXBlYXQoZGVwdGgpIDogJyc7XHJcbiAgY29uc3QgaXNSZWYgPSBmaWVsZC5pc1JlZmVyZW5jZTtcclxuICBjb25zdCBpc1JzdiA9IGZpZWxkLmlzUmVzZXJ2ZWQ7XHJcbiAgY29uc3QgbmFtZSA9IGlzUnN2ID8gJ3Jlc2VydmVkJyA6IChpc1JlZiA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcclxuICBjb25zdCBiaXRSYW5nZSA9IGBbJHtmaWVsZC5tc2J9OiR7ZmllbGQubHNifV1gO1xyXG4gIGNvbnN0IGRlc2NyaXB0aW9uID0gZmllbGQuZGVzY3JpcHRpb24gfHwgJyc7XHJcblxyXG4gIGxldCByb3dDbGFzcyA9ICcnO1xyXG4gIGlmIChpc1Jzdikgcm93Q2xhc3MgPSAnIGNsYXNzPVwicmVzZXJ2ZWQtcm93XCInO1xyXG4gIGVsc2UgaWYgKGlzUmVmKSByb3dDbGFzcyA9ICcgY2xhc3M9XCJyZWYtY2hpbGRcIic7XHJcblxyXG4gIGNvbnN0IG5hbWVDZWxsID0gaXNSZWZcclxuICAgID8gYDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJiZi1yZWYtbGlua1wiIGRhdGEtdGFyZ2V0PVwiJHtmaWVsZC5yZWZOYW1lfVwiPiR7aW5kZW50fSR7bmFtZX08L2E+YFxyXG4gICAgOiBgJHtpbmRlbnR9JHtuYW1lfWA7XHJcblxyXG4gIHJvd3MucHVzaChgPHRyJHtyb3dDbGFzc30+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtuYW1lQ2VsbH08L3RkPmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7ZmllbGQud2lkdGh9PC90ZD5gKTtcclxuICByb3dzLnB1c2goYDx0ZD4ke2JpdFJhbmdlfTwvdGQ+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtkZXNjcmlwdGlvbn08L3RkPmApO1xyXG4gIHJvd3MucHVzaCgnPC90cj4nKTtcclxuXHJcbiAgaWYgKGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZmllbGQuY2hpbGRyZW4pIHtcclxuICAgICAgY29sbGVjdFJvd3MoY2hpbGQsIGRlcHRoICsgMSwgcm93cyk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB0eXBlIHsgQXBwLCBTZXR0aW5nRGVmaW5pdGlvbkl0ZW0gfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHR5cGUgQml0ZmllbGRQbHVnaW4gZnJvbSAnLi9tYWluJztcbmltcG9ydCB0eXBlIHsgVGFibGVUaGVtZSwgUGx1Z2luRGF0YSBhcyBQbHVnaW5EYXRhVHlwZXMgfSBmcm9tICcuL21haW4nO1xuaW1wb3J0IHR5cGUgeyBTdmdUaGVtZSB9IGZyb20gJy4vY29sb3JzJztcblxuY29uc3QgVEFCTEVfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8VGFibGVUaGVtZSwgc3RyaW5nPiA9IHtcbiAgZGVmYXVsdDogJ0RlZmF1bHQg4oCUIGdyaWQgbGluZXMsIGdyYXkgaGVhZGVyJyxcbiAgbWluaW1hbDogJ01pbmltYWwg4oCUIGhvcml6b250YWwgbGluZXMgb25seScsXG4gIHplYnJhOiAnWmVicmEg4oCUIGFsdGVybmF0aW5nIHJvdyBjb2xvcnMnLFxuICBjbGVhbjogJ0NsZWFuIOKAlCBubyBib3JkZXJzLCB3aGl0ZXNwYWNlIHNlcGFyYXRpb24nLFxuICAnZGFyay1oZWFkZXInOiAnRGFyayBIZWFkZXIg4oCUIGRhcmsgaGVhZGVyLCBjbGVhbiBib2R5Jyxcbn07XG5cbmNvbnN0IFNWR19USEVNRV9MQUJFTFM6IFJlY29yZDxTdmdUaGVtZSwgc3RyaW5nPiA9IHtcbiAgcGFzdGVsOiAnUGFzdGVsIOKAlCBzb2Z0IHBhc3RlbCBjb2xvcnMnLFxuICB2aXZpZDogJ1ZpdmlkIOKAlCBib2xkIHNhdHVyYXRlZCBjb2xvcnMnLFxuICBtb25vOiAnTW9ubyDigJQgZ3JheXNjYWxlJyxcbn07XG5cbmV4cG9ydCBjbGFzcyBCaXRmaWVsZFNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcGx1Z2luOiBCaXRmaWVsZFBsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBCaXRmaWVsZFBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGdldCBkYXRhKCk6IFBsdWdpbkRhdGFUeXBlcyB7IHJldHVybiB0aGlzLnBsdWdpbi5zYXZlZERhdGE7IH1cbiAgc2V0IGRhdGEodjogUGx1Z2luRGF0YVR5cGVzKSB7IHRoaXMucGx1Z2luLnNhdmVkRGF0YSA9IHY7IH1cblxuICAvKiogRGVjbGFyYXRpdmUgc2V0dGluZ3MgZGVmaW5pdGlvbnMgZm9yIE9ic2lkaWFuIDEuMTMuMCsgc2VhcmNoICovXG4gIGdldFNldHRpbmdEZWZpbml0aW9ucygpOiBTZXR0aW5nRGVmaW5pdGlvbkl0ZW1bXSB7XG4gICAgcmV0dXJuIFt7XG4gICAgICB0eXBlOiAnZ3JvdXAnLFxuICAgICAgaXRlbXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdTVkcgdGhlbWUnLFxuICAgICAgICAgIGRlc2M6ICdDb2xvciBzY2hlbWUgZm9yIGJpdGZpZWxkIGRpYWdyYW1zJyxcbiAgICAgICAgICBjb250cm9sOiB7XG4gICAgICAgICAgICBrZXk6ICdzdmdUaGVtZScsXG4gICAgICAgICAgICB0eXBlOiAnZHJvcGRvd24nLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAncGFzdGVsJyxcbiAgICAgICAgICAgIG9wdGlvbnM6IFNWR19USEVNRV9MQUJFTFMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdTVkcgcm93IGhlaWdodCcsXG4gICAgICAgICAgZGVzYzogJ0hlaWdodCBvZiBlYWNoIGZpZWxkIHJvdyBpbiBiaXRmaWVsZCBkaWFncmFtcyAocHgpJyxcbiAgICAgICAgICBjb250cm9sOiB7XG4gICAgICAgICAgICBrZXk6ICdzdmdCb3hIZWlnaHQnLFxuICAgICAgICAgICAgdHlwZTogJ3NsaWRlcicsXG4gICAgICAgICAgICBkZWZhdWx0VmFsdWU6IDM4LFxuICAgICAgICAgICAgbWluOiAyOCxcbiAgICAgICAgICAgIG1heDogODAsXG4gICAgICAgICAgICBzdGVwOiAyLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnVGFibGUgdGhlbWUnLFxuICAgICAgICAgIGRlc2M6ICdWaXN1YWwgc3R5bGUgZm9yIHJlbmRlcmVkIHRhYmxlcycsXG4gICAgICAgICAgY29udHJvbDoge1xuICAgICAgICAgICAga2V5OiAndGFibGVUaGVtZScsXG4gICAgICAgICAgICB0eXBlOiAnZHJvcGRvd24nLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAnZGVmYXVsdCcsXG4gICAgICAgICAgICBvcHRpb25zOiBUQUJMRV9USEVNRV9MQUJFTFMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdUYWJsZSByb3cgaGVpZ2h0JyxcbiAgICAgICAgICBkZXNjOiAnUm93IGhlaWdodCBmb3IgcmVuZGVyZWQgdGFibGVzIChweCknLFxuICAgICAgICAgIGNvbnRyb2w6IHtcbiAgICAgICAgICAgIGtleTogJ3RhYmxlUm93SGVpZ2h0JyxcbiAgICAgICAgICAgIHR5cGU6ICdzbGlkZXInLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAyOCxcbiAgICAgICAgICAgIG1pbjogMTgsXG4gICAgICAgICAgICBtYXg6IDQ4LFxuICAgICAgICAgICAgc3RlcDogMixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9XTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldEhlYWRpbmcoKTtcblxuICAgIC8vIFNWRyDkuLvpophcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdTVkcgdGhlbWUnKVxuICAgICAgLnNldERlc2MoJ0NvbG9yIHNjaGVtZSBmb3IgYml0ZmllbGQgZGlhZ3JhbXMnKVxuICAgICAgLmFkZERyb3Bkb3duKGRyb3AgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIGxhYmVsXSBvZiBPYmplY3QuZW50cmllcyhTVkdfVEhFTUVfTEFCRUxTKSkge1xuICAgICAgICAgIGRyb3AuYWRkT3B0aW9uKGtleSwgbGFiZWwpO1xuICAgICAgICB9XG4gICAgICAgIGRyb3Auc2V0VmFsdWUodGhpcy5kYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnKTtcbiAgICAgICAgZHJvcC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuc3ZnVGhlbWUgPSB2YWx1ZSBhcyBTdmdUaGVtZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnJlcmVuZGVyQWxsU3ZnKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAvLyBTVkcg6KGM6auYXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnU1ZHIHJvdyBoZWlnaHQnKVxuICAgICAgLnNldERlc2MoJ0hlaWdodCBvZiBlYWNoIGZpZWxkIHJvdyBpbiBiaXRmaWVsZCBkaWFncmFtcyAocHgpJylcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHtcbiAgICAgICAgc2xpZGVyLnNldExpbWl0cygyOCwgODAsIDIpO1xuICAgICAgICBzbGlkZXIuc2V0VmFsdWUodGhpcy5kYXRhLnN2Z0JveEhlaWdodCB8fCAzOCk7XG4gICAgICAgIHNsaWRlci5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuc3ZnQm94SGVpZ2h0ID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZXJlbmRlckFsbFN2ZygpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8g6KGo5qC85Li76aKYXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnVGFibGUgdGhlbWUnKVxuICAgICAgLnNldERlc2MoJ1Zpc3VhbCBzdHlsZSBmb3IgcmVuZGVyZWQgdGFibGVzJylcbiAgICAgIC5hZGREcm9wZG93bihkcm9wID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBsYWJlbF0gb2YgT2JqZWN0LmVudHJpZXMoVEFCTEVfVEhFTUVfTEFCRUxTKSkge1xuICAgICAgICAgIGRyb3AuYWRkT3B0aW9uKGtleSwgbGFiZWwpO1xuICAgICAgICB9XG4gICAgICAgIGRyb3Auc2V0VmFsdWUodGhpcy5kYXRhLnRhYmxlVGhlbWUgfHwgJ2RlZmF1bHQnKTtcbiAgICAgICAgZHJvcC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEudGFibGVUaGVtZSA9IHZhbHVlIGFzIFRhYmxlVGhlbWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLmFwcGx5VGFibGVUaGVtZSh2YWx1ZSBhcyBUYWJsZVRoZW1lKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIC8vIOihqOagvOihjOmrmFxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1RhYmxlIHJvdyBoZWlnaHQnKVxuICAgICAgLnNldERlc2MoJ1JvdyBoZWlnaHQgZm9yIHJlbmRlcmVkIHRhYmxlcyAocHgpJylcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHtcbiAgICAgICAgc2xpZGVyLnNldExpbWl0cygxOCwgNDgsIDIpO1xuICAgICAgICBzbGlkZXIuc2V0VmFsdWUodGhpcy5kYXRhLnRhYmxlUm93SGVpZ2h0IHx8IDI4KTtcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS50YWJsZVJvd0hlaWdodCA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMuZGF0YSk7XG4gICAgICAgICAgdGhpcy5hcHBseVRhYmxlUm93SGVpZ2h0KHZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlUYWJsZVRoZW1lKHRoZW1lOiBUYWJsZVRoZW1lKTogdm9pZCB7XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmJpdGZpZWxkLXRhYmxlLWNvbnRhaW5lcicpLmZvckVhY2goZWwgPT4ge1xuICAgICAgZWwuc2V0QXR0cmlidXRlKCdkYXRhLXRoZW1lJywgdGhlbWUpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVRhYmxlUm93SGVpZ2h0KGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWJmLXRhYmxlLXJvdy1oZWlnaHQnLCBgJHtoZWlnaHR9cHhgKTtcbiAgfVxufVxuIiwiaW1wb3J0IHR5cGUgeyBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0IH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgY3JlYXRlRnJhZ21lbnQsIFBsdWdpbiB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi9wYXJzZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tTdmcgfSBmcm9tICcuL3N2Z1JlbmRlcmVyJztcbmltcG9ydCB7IHJlbmRlckJsb2NrVGFibGUgfSBmcm9tICcuL3RhYmxlUmVuZGVyZXInO1xuaW1wb3J0IHR5cGUgeyBSZWdpc3RyeUVudHJ5LCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBCaXRmaWVsZFNldHRpbmdUYWIgfSBmcm9tICcuL3NldHRpbmdzJztcbmltcG9ydCB0eXBlIHsgU3ZnVGhlbWUgfSBmcm9tICcuL2NvbG9ycyc7XG5cbmV4cG9ydCB0eXBlIFRhYmxlVGhlbWUgPSAnZGVmYXVsdCcgfCAnbWluaW1hbCcgfCAnemVicmEnIHwgJ2NsZWFuJyB8ICdkYXJrLWhlYWRlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGx1Z2luRGF0YSB7XG4gIGRlZmF1bHRWaWV3PzogJ3N2ZycgfCAndGFibGUnO1xuICB0YWJsZVRoZW1lPzogVGFibGVUaGVtZTtcbiAgc3ZnVGhlbWU/OiBTdmdUaGVtZTtcbiAgc3ZnQm94SGVpZ2h0PzogbnVtYmVyO1xuICB0YWJsZVJvd0hlaWdodD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfREFUQTogUGx1Z2luRGF0YSA9IHsgZGVmYXVsdFZpZXc6ICdzdmcnLCB0YWJsZVRoZW1lOiAnZGVmYXVsdCcsIHN2Z1RoZW1lOiAncGFzdGVsJywgc3ZnQm94SGVpZ2h0OiAzOCwgdGFibGVSb3dIZWlnaHQ6IDI4IH07XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJpdGZpZWxkUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcHJpdmF0ZSBibG9ja1JlZ2lzdHJ5OiBNYXA8c3RyaW5nLCBSZWdpc3RyeUVudHJ5PiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSBwZW5kaW5nUmVmczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgdGFyZ2V0TmFtZTogc3RyaW5nIH1bXSA9IFtdO1xuICBwcml2YXRlIGN1cnJlbnROb3RlUGF0aDogc3RyaW5nID0gJyc7XG4gIHByaXZhdGUgYWN0aXZlVG9vbHRpcDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB0b29sdGlwUmVtb3ZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcGx1Z2luRGF0YTogUGx1Z2luRGF0YSA9IERFRkFVTFRfREFUQTtcblxuICAvLyBwdWJsaWMgYWNjZXNzb3IgZm9yIFNldHRpbmdUYWJcbiAgZ2V0IHNhdmVkRGF0YSgpOiBQbHVnaW5EYXRhIHsgcmV0dXJuIHRoaXMucGx1Z2luRGF0YTsgfVxuICBzZXQgc2F2ZWREYXRhKHY6IFBsdWdpbkRhdGEpIHsgdGhpcy5wbHVnaW5EYXRhID0gdjsgfVxuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbkRhdGEgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX0RBVEEsIChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIFBsdWdpbkRhdGEpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgQml0ZmllbGRTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKCdiaXRmaWVsZCcsIHRoaXMucHJvY2Vzc0JpdGZpZWxkLmJpbmQodGhpcykpO1xuICAgIC8vIOW6lOeUqOS/neWtmOeahOihqOagvOihjOmrmFxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1iZi10YWJsZS1yb3ctaGVpZ2h0JywgYCR7dGhpcy5wbHVnaW5EYXRhLnRhYmxlUm93SGVpZ2h0IHx8IDI4fXB4YCk7XG4gIH1cblxuICBvbnVubG9hZCgpIHtcbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuY2xlYXIoKTtcbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gW107XG4gICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG4gIH1cblxuICBhc3luYyBwcm9jZXNzQml0ZmllbGQoc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCwgY3R4OiBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0KSB7XG4gICAgdGhpcy5jdXJyZW50Tm90ZVBhdGggPSBjdHguc291cmNlUGF0aCB8fCAnJztcbiAgICBjb25zdCByZXN1bHQgPSBwYXJzZShzb3VyY2UpO1xuXG4gICAgaWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuICAgICAgdGhpcy5yZW5kZXJFcnJvcnMoZWwsIHJlc3VsdC5lcnJvcnMgfHwgW10pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghcmVzdWx0LmJsb2NrcykgcmV0dXJuO1xuICAgIGZvciAoY29uc3QgW25hbWUsIGJsb2NrXSBvZiByZXN1bHQuYmxvY2tzKSB7XG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XG4gICAgfVxuXG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5yZXNvbHZlUGVuZGluZ1JlZnMoKSwgNTApO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhuYW1lOiBzdHJpbmcsIGJsb2NrOiBGaWVsZEJsb2NrLCBwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBwYXJlbnRFbC5jcmVhdGVFbCgnZGl2Jywge1xuICAgICAgY2xzOiAnYml0ZmllbGQtY29udGFpbmVyJyxcbiAgICAgIGF0dHI6IHsgaWQ6IGBiZjoke25hbWV9YCB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBoZWFkZXJSb3cgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYml0ZmllbGQtaGVhZGVyLXJvdycgfSk7XG4gICAgY29uc3QgZGVzYyA9IGJsb2NrLmRlc2NyaXB0aW9uID8gYCDigJQgJHtibG9jay5kZXNjcmlwdGlvbn1gIDogJyc7XG4gICAgaGVhZGVyUm93LmNyZWF0ZUVsKCdzcGFuJywge1xuICAgICAgdGV4dDogYCR7bmFtZX0ke2Rlc2N9IOeahCAke2Jsb2NrLndpZHRofSBiaXQg5a6a5LmJ5aaC5LiL77yaYCxcbiAgICAgIGNsczogJ2JpdGZpZWxkLWhlYWRlcidcbiAgICB9KTtcbiAgICBjb25zdCB0b2dnbGVCdG4gPSB0aGlzLmNyZWF0ZVRvZ2dsZUJ1dHRvbihoZWFkZXJSb3cpO1xuXG4gICAgY29uc3QgY29udGVudFdyYXAgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYml0ZmllbGQtY29udGVudCcgfSk7XG4gICAgY29uc3Qgc3ZnQ29udGFpbmVyID0gY29udGVudFdyYXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYml0ZmllbGQtc3ZnJyB9KTtcbiAgICBjcmVhdGVGcmFnbWVudCgoZnJhZ21lbnQpID0+IHtcbiAgICAgIGZyYWdtZW50LnNldEhUTUwocmVuZGVyQmxvY2tTdmcoYmxvY2ssIHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJywgdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCA0NCkpO1xuICAgIH0pLmFwcGVuZFRvKHN2Z0NvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cE5hdmlnYXRpb25IYW5kbGVycyhzdmdDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcblxuICAgIGNvbnN0IHRhYmxlQ29udGFpbmVyID0gY29udGVudFdyYXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYml0ZmllbGQtdGFibGUtY29udGFpbmVyJyB9KTtcbiAgICB0YWJsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGlzLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xuICAgIGNyZWF0ZUZyYWdtZW50KChmcmFnbWVudCkgPT4ge1xuICAgICAgZnJhZ21lbnQuc2V0SFRNTChyZW5kZXJCbG9ja1RhYmxlKGJsb2NrKSk7XG4gICAgfSkuYXBwZW5kVG8odGFibGVDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcblxuICAgIC8vIOWIneWni+WMluinhuWbvu+8muivu+WPluS/neWtmOeahOWBj+WlvVxuICAgIGNvbnN0IGRlZmF1bHRWaWV3ID0gdGhpcy5wbHVnaW5EYXRhLmRlZmF1bHRWaWV3IHx8ICdzdmcnO1xuICAgIHRoaXMuYXBwbHlWaWV3KGRlZmF1bHRWaWV3LCBjb250ZW50V3JhcCwgc3ZnQ29udGFpbmVyLCB0YWJsZUNvbnRhaW5lciwgdG9nZ2xlQnRuKTtcblxuICAgIC8vIOe7keWumuWIh+aNouS6i+S7tlxuICAgIHRvZ2dsZUJ0bi5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgY29uc3QgdmlldyA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IG51bGw7XG4gICAgICBpZiAodmlldykge1xuICAgICAgICB0aGlzLmFwcGx5Vmlldyh2aWV3LCBjb250ZW50V3JhcCwgc3ZnQ29udGFpbmVyLCB0YWJsZUNvbnRhaW5lciwgdG9nZ2xlQnRuKTtcbiAgICAgICAgdGhpcy5wbHVnaW5EYXRhLmRlZmF1bHRWaWV3ID0gdmlldztcbiAgICAgICAgdGhpcy5zYXZlRGF0YSh0aGlzLnBsdWdpbkRhdGEpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuc2V0KG5hbWUsIHtcbiAgICAgIGVsZW1lbnQ6IGNvbnRhaW5lcixcbiAgICAgIGJsb2NrLFxuICAgICAgbm90ZVBhdGg6IHRoaXMuY3VycmVudE5vdGVQYXRoXG4gICAgfSk7XG5cbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyhzdmdDb250YWluZXIpO1xuICAgIHRoaXMuY29sbGVjdFBlbmRpbmdSZWZzKHRhYmxlQ29udGFpbmVyKTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlWaWV3KHZpZXc6ICdzdmcnIHwgJ3RhYmxlJywgY29udGVudFdyYXA6IEhUTUxFbGVtZW50LCBzdmdFbDogSFRNTEVsZW1lbnQsIHRhYmxlRWw6IEhUTUxFbGVtZW50LCBidG46IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGVudFdyYXAuc2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnLCB2aWV3KTtcbiAgICBidG4ucXVlcnlTZWxlY3RvckFsbCgnLmJmLXRvZ2dsZS1vcHRpb24nKS5mb3JFYWNoKG9wdCA9PiB7XG4gICAgICBvcHQuY2xhc3NMaXN0LnRvZ2dsZSgnYmYtdG9nZ2xlLWFjdGl2ZScsIG9wdC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpID09PSB2aWV3KTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlVG9nZ2xlQnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgYnRuID0gcGFyZW50LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JmLXZpZXctdG9nZ2xlJyB9KTtcbiAgICBidG4uY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfkvY3ln5/lm74nLCBjbHM6ICdiZi10b2dnbGUtb3B0aW9uIGJmLXRvZ2dsZS1zdmcnLCBhdHRyOiB7ICdkYXRhLXZpZXcnOiAnc3ZnJyB9IH0pO1xuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+ihqOagvCcsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXRhYmxlJywgYXR0cjogeyAnZGF0YS12aWV3JzogJ3RhYmxlJyB9IH0pO1xuICAgIHJldHVybiBidG47XG4gIH1cblxuICAvKiogUmVyZW5kZXIgYWxsIFNWR3Mgd2l0aCBjdXJyZW50IHRoZW1lIOKAlCBwdWJsaWMgZm9yIFNldHRpbmdUYWIgKi9cbiAgcHVibGljIHJlcmVuZGVyQWxsU3ZnKCk6IHZvaWQge1xuICAgIGNvbnN0IHRoZW1lID0gdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnO1xuICAgIGZvciAoY29uc3QgWywgZW50cnldIG9mIHRoaXMuYmxvY2tSZWdpc3RyeSkge1xuICAgICAgY29uc3Qgc3ZnQ29udGFpbmVyID0gZW50cnkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYml0ZmllbGQtc3ZnJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgaWYgKHN2Z0NvbnRhaW5lcikge1xuICAgICAgICBjcmVhdGVGcmFnbWVudCgoZnJhZ21lbnQpID0+IHtcbiAgICAgICAgICBmcmFnbWVudC5zZXRIVE1MKHJlbmRlckJsb2NrU3ZnKGVudHJ5LmJsb2NrLCB0aGVtZSwgdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCA0NCkpO1xuICAgICAgICB9KS5hcHBlbmRUbyhzdmdDb250YWluZXIpO1xuICAgICAgICB0aGlzLnNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG4gICAgICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckVycm9ycyhlbDogSFRNTEVsZW1lbnQsIGVycm9yczogeyBsaW5lOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZzsgc3VnZ2VzdGlvbj86IHN0cmluZyB9W10pIHtcbiAgICBlbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiaXRmaWVsZC1lcnJvcicgfSwgKGVycm9yRWwpID0+IHtcbiAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfop6PmnpDplJnor686JyB9KTtcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XG4gICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDooYwgJHtlcnJvci5saW5lfTogJHtlcnJvci5tZXNzYWdlfWAgfSk7XG4gICAgICAgIGlmIChlcnJvci5zdWdnZXN0aW9uKSB7XG4gICAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOW7uuiurjogJHtlcnJvci5zdWdnZXN0aW9ufWAsIGNsczogJ3N1Z2dlc3Rpb24nIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyDilIDilIDilIAg54K55Ye76Lez6L2sIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XG4gICAgICAgIGlmIChyZWZOYW1lKSB0aGlzLnNjcm9sbFRvQmxvY2socmVmTmFtZSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2Nyb2xsVG9CbG9jayhibG9ja05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHJldHVybjtcbiAgICBlbnRyeS5lbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgZW50cnkuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdiZi1oaWdobGlnaHQnKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JmLWhpZ2hsaWdodCcpLCAxNTAwKTtcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCDmgqzmta4gdG9vbHRpcCDilIDilIDilIBcblxuICBwcml2YXRlIHNldHVwVG9vbHRpcEhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHtcbiAgICAgICAgLy8g6byg5qCH5Zue5Yiw5rqQ5YWD57Sg5LiK77yM5Y+W5raI5b6F5Yig6Zmk5a6a5pe25ZmoXG4gICAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xuICAgICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpO1xuICAgICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB2aWV3ID0gdGhpcy5nZXRWaWV3Rm9yQmxvY2socmVmTmFtZSk7XG4gICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFksIHZpZXcpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBTVkdFbGVtZW50O1xuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcbiAgICAgIGlmIChyZWZOYW1lKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xuICAgICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcbiAgICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqIOiOt+WPluiiq+W8leeUqOWdl+iHqui6q+eahOinhuWbvueKtuaAge+8jOS4jeWtmOWcqOWImeeUqOm7mOiupOWBj+WlvSAqL1xuICBwcml2YXRlIGdldFZpZXdGb3JCbG9jayhibG9ja05hbWU6IHN0cmluZyk6ICdzdmcnIHwgJ3RhYmxlJyB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKGVudHJ5KSB7XG4gICAgICBjb25zdCBjb250ZW50V3JhcCA9IGVudHJ5LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmJpdGZpZWxkLWNvbnRlbnQnKTtcbiAgICAgIGNvbnN0IHZpZXcgPSBjb250ZW50V3JhcD8uZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAodmlldykgcmV0dXJuIHZpZXc7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgfHwgJ3N2Zyc7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpIHtcbiAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuICAgIH0sIDIwMCk7XG4gIH1cblxuICBwcml2YXRlIHNob3dUb29sdGlwKGJsb2NrTmFtZTogc3RyaW5nLCBtb3VzZVg6IG51bWJlciwgbW91c2VZOiBudW1iZXIsIHZpZXc6ICdzdmcnIHwgJ3RhYmxlJykge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHJldHVybjtcblxuICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuXG4gICAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmJvZHkuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcCcgfSk7XG5cbiAgICBjb25zdCBkZXNjID0gZW50cnkuYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2VudHJ5LmJsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcbiAgICB0b29sdGlwLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgJHtibG9ja05hbWV9JHtkZXNjfWAsIGNsczogJ2JmLXRvb2x0aXAtaGVhZGVyJyB9KTtcblxuICAgIGlmICh2aWV3ID09PSAnc3ZnJykge1xuICAgICAgY29uc3Qgc3ZnV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcC1zdmcnIH0pO1xuICAgICAgY3JlYXRlRnJhZ21lbnQoKGZyYWdtZW50KSA9PiB7XG4gICAgICAgIGZyYWdtZW50LnNldEhUTUwocmVuZGVyQmxvY2tTdmcoZW50cnkuYmxvY2ssIHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJywgdGhpcy5wbHVnaW5EYXRhLnN2Z0JveEhlaWdodCB8fCA0NCkpO1xuICAgICAgfSkuYXBwZW5kVG8oc3ZnV3JhcCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcC10YWJsZScgfSk7XG4gICAgICBjcmVhdGVGcmFnbWVudCgoZnJhZ21lbnQpID0+IHtcbiAgICAgICAgZnJhZ21lbnQuc2V0SFRNTChyZW5kZXJCbG9ja1RhYmxlKGVudHJ5LmJsb2NrKSk7XG4gICAgICB9KS5hcHBlbmRUbyh0YWJsZVdyYXApO1xuICAgIH1cblxuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfljZXlh7vot7Povazmn6XnnIvlrozmlbTlrprkuYknLCBjbHM6ICdiZi10b29sdGlwLWhpbnQnIH0pO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0b29sdGlwKTtcbiAgICB0aGlzLmFjdGl2ZVRvb2x0aXAgPSB0b29sdGlwO1xuXG4gICAgY29uc3QgcmVjdCA9IHRvb2x0aXAuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgbGV0IGxlZnQgPSBtb3VzZVggKyAxMjtcbiAgICBsZXQgdG9wID0gbW91c2VZIC0gMjA7XG4gICAgaWYgKGxlZnQgKyByZWN0LndpZHRoID4gd2luZG93LmlubmVyV2lkdGggLSAxNikgbGVmdCA9IG1vdXNlWCAtIHJlY3Qud2lkdGggLSAxMjtcbiAgICBpZiAodG9wICsgcmVjdC5oZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAxNikgdG9wID0gd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSAxNjtcbiAgICBpZiAodG9wIDwgOCkgdG9wID0gODtcblxuICAgIHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRvb2x0aXAuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICAvLyDpvKDmoIfov5vlhaUgdG9vbHRpcCDml7blj5bmtojlvoXliKDpmaTlrprml7blmahcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG4gICAgICBpZiAodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpIHtcbiAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB0aGlzLnJlbW92ZVRvb2x0aXAoKSk7XG4gIH1cblxuICBwcml2YXRlIHJlbW92ZVRvb2x0aXAoKSB7XG4gICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCkge1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwLnJlbW92ZSgpO1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIDilIAg5byV55So6Kej5p6QIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgY29sbGVjdFBlbmRpbmdSZWZzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcmVmXScpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCByZWZOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpID8/ICcnO1xuICAgICAgaWYgKCFyZWZOYW1lKSByZXR1cm47XG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocmVmTmFtZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWU6IHJlZk5hbWUgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi1yZWYtbGluaycpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXROYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpID8/ICcnO1xuICAgICAgaWYgKCF0YXJnZXROYW1lKSByZXR1cm47XG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXModGFyZ2V0TmFtZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWUgfSk7XG4gICAgICAgIChlbCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmFkZCgnYmYtcmVmLXVucmVzb2x2ZWQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZVBlbmRpbmdSZWZzKCkge1xuICAgIGNvbnN0IHN0aWxsUGVuZGluZzogdHlwZW9mIHRoaXMucGVuZGluZ1JlZnMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5wZW5kaW5nUmVmcykge1xuICAgICAgaWYgKHRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocGVuZGluZy50YXJnZXROYW1lKSkge1xuICAgICAgICBwZW5kaW5nLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtcmVmLXVucmVzb2x2ZWQnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0aWxsUGVuZGluZy5wdXNoKHBlbmRpbmcpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gc3RpbGxQZW5kaW5nO1xuICB9XG59XG4iXSwibmFtZXMiOlsiaSIsIlBsdWdpblNldHRpbmdUYWIiLCJTZXR0aW5nIiwiUGx1Z2luIiwiY3JlYXRlRnJhZ21lbnQiXSwibWFwcGluZ3MiOiI7Ozs7OztBQWFPLFNBQVMsTUFBTSxLQUFBLEVBQTRCO0FBQ2hELEVBQUEsTUFBTSxLQUFBLEdBQVEsS0FBQSxDQUFNLEtBQUEsQ0FBTSxJQUFJLENBQUE7QUFDOUIsRUFBQSxNQUFNLFNBQXVCLEVBQUM7QUFDOUIsRUFBQSxNQUFNLE1BQUEsdUJBQWEsR0FBQSxFQUF3QjtBQUMzQyxFQUFBLE1BQU0sVUFBQSx1QkFBaUIsR0FBQSxFQUFZO0FBR25DLEVBQUEsTUFBTSxXQUFzQixFQUFDO0FBQzdCLEVBQUEsS0FBQSxJQUFTQSxFQUFBQSxHQUFJLENBQUEsRUFBR0EsRUFBQUEsR0FBSSxLQUFBLENBQU0sUUFBUUEsRUFBQUEsRUFBQUEsRUFBSztBQUNyQyxJQUFBLE1BQU0sSUFBQSxHQUFPLE1BQU1BLEVBQUMsQ0FBQTtBQUNwQixJQUFBLElBQUksQ0FBQyxLQUFLLElBQUEsRUFBSyxJQUFLLEtBQUssSUFBQSxFQUFLLENBQUUsVUFBQSxDQUFXLElBQUksQ0FBQSxFQUFHO0FBQ2hELE1BQUE7QUFBQSxJQUNGO0FBQ0EsSUFBQSxRQUFBLENBQVMsSUFBQSxDQUFLO0FBQUEsTUFDWixTQUFTQSxFQUFBQSxH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
