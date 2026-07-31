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
    new obsidian.Setting(containerEl).setName("Bitfield").setHeading();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9zZXR0aW5ncy50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQml0RmllbGQsIEZpZWxkQmxvY2ssIFBhcnNlRXJyb3IsIFBhcnNlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG5pbnRlcmZhY2UgUmF3TGluZSB7XHJcbiAgbGluZU51bTogbnVtYmVyO1xyXG4gIGluZGVudDogbnVtYmVyO1xyXG4gIGNvbnRlbnQ6IHN0cmluZztcclxufVxyXG5cclxuLyoqXHJcbiAqIOino+aekOS9jeWfn+WumuS5iVxyXG4gKiDnu5/kuIDor63ms5XvvJrmr4/kuKrku6PnoIHlnZfnlLHkuIDkuKrmiJblpJrkuKogZGVmaW5pdGlvbiBibG9jayDnu4TmiJBcclxuICog5q+P5Liq5Z2X77ya56ys5LiA6KGMIG5hbWUgd2lkdGggW2Rlc2NyaXB0aW9uXe+8jOWtkOWtl+autemAmui/h+e8qei/m+W1jOWll1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGlucHV0OiBzdHJpbmcpOiBQYXJzZVJlc3VsdCB7XHJcbiAgY29uc3QgbGluZXMgPSBpbnB1dC5zcGxpdCgnXFxuJyk7XHJcbiAgY29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcclxuICBjb25zdCBibG9ja3MgPSBuZXcgTWFwPHN0cmluZywgRmllbGRCbG9jaz4oKTtcclxuICBjb25zdCBibG9ja05hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcblxyXG4gIC8vIOmihOWkhOeQhu+8mui/h+a7pOepuuihjOWSjOazqOmHilxyXG4gIGNvbnN0IHJhd0xpbmVzOiBSYXdMaW5lW10gPSBbXTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaV07XHJcbiAgICBpZiAoIWxpbmUudHJpbSgpIHx8IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy8vJykpIHtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICByYXdMaW5lcy5wdXNoKHtcclxuICAgICAgbGluZU51bTogaSArIDEsXHJcbiAgICAgIGluZGVudDogbGluZS5zZWFyY2goL1xcUy8pLFxyXG4gICAgICBjb250ZW50OiBsaW5lLnRyaW0oKVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAocmF3TGluZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn6L6T5YWl5Li656m6JyB9XSB9O1xyXG4gIH1cclxuXHJcbiAgLy8g6YCQ6KGM6Kej5p6Q77yMaW5kZW50PTAg55qE6KGM5L2c5Li65Z2X5aS0XHJcbiAgbGV0IGkgPSAwO1xyXG4gIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBybCA9IHJhd0xpbmVzW2ldO1xyXG5cclxuICAgIGlmIChybC5pbmRlbnQgIT09IDApIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5oSP5aSW55qE57yp6L+b6KGMOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWF0Y2ggPSBybC5jb250ZW50Lm1hdGNoKC9eKFxcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGkrKztcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgWywgbmFtZSwgd2lkdGhTdHIsIGRlc2NdID0gbWF0Y2g7XHJcblxyXG4gICAgaWYgKGJsb2NrTmFtZXMuaGFzKG5hbWUpKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICBsaW5lOiBybC5saW5lTnVtLFxyXG4gICAgICAgIG1lc3NhZ2U6IGDph43lpI3lrprkuYk6IFwiJHtuYW1lfVwiYCxcclxuICAgICAgICBzdWdnZXN0aW9uOiAn5ZCM56yU6K6w5YaF5Z2X5ZCN5b+F6aG75ZSv5LiAJ1xyXG4gICAgICB9KTtcclxuICAgICAgaSsrO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGJsb2NrTmFtZXMuYWRkKG5hbWUpO1xyXG5cclxuICAgIGNvbnN0IGJsb2NrOiBGaWVsZEJsb2NrID0ge1xyXG4gICAgICBuYW1lLFxyXG4gICAgICB3aWR0aDogcGFyc2VJbnQod2lkdGhTdHIsIDEwKSxcclxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXHJcbiAgICAgIGNoaWxkcmVuOiBbXVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyDmlLbpm4blrZDlrZfmrrXvvIjov57nu63nmoTnvKnov5vooYzvvIlcclxuICAgIGkrKztcclxuICAgIGNvbnN0IGNoaWxkcmVuU3RhcnQgPSBpO1xyXG4gICAgd2hpbGUgKGkgPCByYXdMaW5lcy5sZW5ndGggJiYgcmF3TGluZXNbaV0uaW5kZW50ID4gMCkge1xyXG4gICAgICBpKys7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZHJlbkxpbmVzID0gcmF3TGluZXMuc2xpY2UoY2hpbGRyZW5TdGFydCwgaSk7XHJcblxyXG4gICAgaWYgKGNoaWxkcmVuTGluZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBwYXJzZUNoaWxkcmVuKGNoaWxkcmVuTGluZXMsIGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMsIDAsIG5hbWUpO1xyXG4gICAgICBjYWxjdWxhdGVCaXRSYW5nZXMoYmxvY2suY2hpbGRyZW4pO1xyXG4gICAgICBhdXRvRmlsbFJlc2VydmVkKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g6aqM6K+B5L2N5a69XHJcbiAgICB2YWxpZGF0ZUJpdFdpZHRocyhibG9jay5jaGlsZHJlbiwgZXJyb3JzKTtcclxuXHJcbiAgICBibG9ja3Muc2V0KG5hbWUsIGJsb2NrKTtcclxuICB9XHJcblxyXG4gIGlmIChibG9ja3Muc2l6ZSA9PT0gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogW3sgbGluZTogMCwgbWVzc2FnZTogJ+acquaJvuWIsOacieaViOeahOWumuS5ieWdlycgfV0gfTtcclxuICB9XHJcblxyXG4gIGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmxvY2tzIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDop6PmnpDlrZDlrZfmrrXliJfooahcclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlQ2hpbGRyZW4oXHJcbiAgbGluZXM6IFJhd0xpbmVbXSxcclxuICBjaGlsZHJlbjogQml0RmllbGRbXSxcclxuICBlcnJvcnM6IFBhcnNlRXJyb3JbXSxcclxuICBiYXNlSW5kZW50OiBudW1iZXIsXHJcbiAgX3BhcmVudE5hbWU6IHN0cmluZ1xyXG4pOiB2b2lkIHtcclxuICBjb25zdCBzdGFjazogeyBmaWVsZDogQml0RmllbGQ7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xyXG5cclxuICBmb3IgKGNvbnN0IHJsIG9mIGxpbmVzKSB7XHJcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oQD9cXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XHJcbiAgICBpZiAoIW1hdGNoKSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaXoOazleino+aekDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcclxuICAgIGNvbnN0IHdpZHRoID0gcGFyc2VJbnQod2lkdGhTdHIsIDEwKTtcclxuICAgIGNvbnN0IGlzUmVmZXJlbmNlID0gbmFtZS5zdGFydHNXaXRoKCdAJyk7XHJcbiAgICBjb25zdCByZWZOYW1lID0gaXNSZWZlcmVuY2UgPyBuYW1lLnNsaWNlKDEpIDogbmFtZTtcclxuXHJcbiAgICAvLyDltYzlpZflsYLnuqfmo4Dmn6VcclxuICAgIGNvbnN0IGRlcHRoID0gTWF0aC5mbG9vcigocmwuaW5kZW50IC0gYmFzZUluZGVudCkgLyAyKSArIDE7XHJcbiAgICBpZiAoZGVwdGggPiA1KSB7XHJcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOW1jOWll+Wxgue6p+i/h+a3sSAoJHtkZXB0aH0g5bGCKe+8jOacgOWkmiA1IOWxgmAgfSk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZpZWxkOiBCaXRGaWVsZCA9IHtcclxuICAgICAgbmFtZTogcmVmTmFtZSxcclxuICAgICAgd2lkdGgsXHJcbiAgICAgIG1zYjogMCxcclxuICAgICAgbHNiOiAwLFxyXG4gICAgICBkZXNjcmlwdGlvbjogZGVzYz8udHJpbSgpIHx8IHVuZGVmaW5lZCxcclxuICAgICAgaXNSZXNlcnZlZDogbmFtZS50b0xvd2VyQ2FzZSgpID09PSAncmVzZXJ2ZWQnLFxyXG4gICAgICBpc1JlZmVyZW5jZSxcclxuICAgICAgcmVmTmFtZTogaXNSZWZlcmVuY2UgPyByZWZOYW1lIDogdW5kZWZpbmVkLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcblxyXG4gICAgLy8g5om+54i25a2X5q6177ya5LuO5qCI5Lit5om+57yp6L+b5q+U5b2T5YmN5bCP55qE5pyA5ZCO5LiA5LiqXHJcbiAgICBsZXQgcGFyZW50OiBCaXRGaWVsZCB8IG51bGwgPSBudWxsO1xyXG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgdG9wID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XHJcbiAgICAgIGlmICh0b3AuaW5kZW50IDwgcmwuaW5kZW50KSB7XHJcbiAgICAgICAgcGFyZW50ID0gdG9wLmZpZWxkO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgIHN0YWNrLnBvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwYXJlbnQpIHtcclxuICAgICAgaWYgKCFwYXJlbnQuY2hpbGRyZW4pIHBhcmVudC5jaGlsZHJlbiA9IFtdO1xyXG4gICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChmaWVsZCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjaGlsZHJlbi5wdXNoKGZpZWxkKTtcclxuICAgIH1cclxuXHJcbiAgICBzdGFjay5wdXNoKHsgZmllbGQsIGluZGVudDogcmwuaW5kZW50IH0pO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIOiuoeeulyBiaXQg6IyD5Zu0XHJcbiAqIOmdoOWJjeWumuS5ieeahOaYryBMU0LvvIzpnaDlkI7lrprkuYnnmoTmmK8gTVNCXHJcbiAqL1xyXG5mdW5jdGlvbiBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGRzOiBCaXRGaWVsZFtdKTogdm9pZCB7XHJcbiAgbGV0IGN1cnJlbnRMc2IgPSAwO1xyXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XHJcbiAgICBmaWVsZC5sc2IgPSBjdXJyZW50THNiO1xyXG4gICAgZmllbGQubXNiID0gY3VycmVudExzYiArIGZpZWxkLndpZHRoIC0gMTtcclxuICAgIGN1cnJlbnRMc2IgPSBmaWVsZC5tc2IgKyAxO1xyXG4gICAgaWYgKCFmaWVsZC5pc1JlZmVyZW5jZSAmJiBmaWVsZC5jaGlsZHJlbiAmJiBmaWVsZC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZC5jaGlsZHJlbik7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICog5b2T5a2Q5a2X5q615oC75L2N5a695LiN5aSf5pe277yM5ZyoIE1TQiDnq6/oh6rliqjooaUgcmVzZXJ2ZWRcclxuICovXHJcbmZ1bmN0aW9uIGF1dG9GaWxsUmVzZXJ2ZWQoZmllbGRzOiBCaXRGaWVsZFtdLCBwYXJlbnRXaWR0aDogbnVtYmVyKTogdm9pZCB7XHJcbiAgY29uc3QgdG90YWxDaGlsZFdpZHRoID0gZmllbGRzLnJlZHVjZSgoc3VtLCBmKSA9PiBzdW0gKyBmLndpZHRoLCAwKTtcclxuICBjb25zdCByZW1haW5pbmcgPSBwYXJlbnRXaWR0aCAtIHRvdGFsQ2hpbGRXaWR0aDtcclxuICBpZiAocmVtYWluaW5nID4gMCkge1xyXG4gICAgY29uc3QgcmVzZXJ2ZWQ6IEJpdEZpZWxkID0ge1xyXG4gICAgICBuYW1lOiAncmVzZXJ2ZWQnLFxyXG4gICAgICB3aWR0aDogcmVtYWluaW5nLFxyXG4gICAgICBtc2I6IDAsXHJcbiAgICAgIGxzYjogMCxcclxuICAgICAgaXNSZXNlcnZlZDogdHJ1ZSxcclxuICAgICAgaXNSZWZlcmVuY2U6IGZhbHNlLFxyXG4gICAgICBjaGlsZHJlbjogW11cclxuICAgIH07XHJcbiAgICBmaWVsZHMucHVzaChyZXNlcnZlZCk7XHJcbiAgICBjYWxjdWxhdGVCaXRSYW5nZXMoZmllbGRzKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDpqozor4HkvY3lrr1cclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlQml0V2lkdGhzKGZpZWxkczogQml0RmllbGRbXSwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcclxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xyXG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcclxuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IGNoaWxkcmVuV2lkdGggPSBjaGlsZHJlbi5yZWR1Y2UoKHN1bSwgY2hpbGQpID0+IHN1bSArIGNoaWxkLndpZHRoLCAwKTtcclxuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xyXG4gICAgICAgIGVycm9ycy5wdXNoKHtcclxuICAgICAgICAgIGxpbmU6IDAsXHJcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXHJcbiAgICAgICAgICBzdWdnZXN0aW9uOiBg54i25a2X5q61OiAke2ZpZWxkLndpZHRofS1iaXQsIOWtkOWtl+auteaAu+WSjDogJHtjaGlsZHJlbldpZHRofS1iaXQsIOWJqeS9meepuumXtDogJHtmaWVsZC53aWR0aCAtIGNoaWxkcmVuV2lkdGh9LWJpdGBcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICB2YWxpZGF0ZUJpdFdpZHRocyhjaGlsZHJlbiwgZXJyb3JzKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwiLyoqXHJcbiAqIOminOiJsuaWueahiFxyXG4gKi9cclxuXHJcbmV4cG9ydCB0eXBlIFN2Z1RoZW1lID0gJ3Bhc3RlbCcgfCAndml2aWQnIHwgJ21vbm8nO1xyXG5cclxuLy8g5Li76Imy77yI6aG25bGC5a2X5q6177yJ4oCUIOaflOWSjOa1heiJslxyXG5jb25zdCBQQVNURUxfQ09MT1JTID0gW1xyXG4gICcjQjNENEYwJywgLy8g5rWF6JOdXHJcbiAgJyNCOEUwQjgnLCAvLyDmtYXnu79cclxuICAnI0Y1RDZBOCcsIC8vIOa1heapmVxyXG4gICcjRDRCOEU4JywgLy8g5rWF57SrXHJcbiAgJyNBOEUwRDYnLCAvLyDmtYXpnZJcclxuICAnI0YwQjhCOCcsIC8vIOa1hee6olxyXG5dO1xyXG5cclxuLy8g6bKc6Imz6ImyXHJcbmNvbnN0IFZJVklEX0NPTE9SUyA9IFtcclxuICAnIzVCOUJENScsIC8vIOiTnVxyXG4gICcjNzBBRDQ3JywgLy8g57u/XHJcbiAgJyNFRDdEMzEnLCAvLyDmqZlcclxuICAnIzlCNTlCNicsIC8vIOe0q1xyXG4gICcjMUFCQzlDJywgLy8g6Z2SXHJcbiAgJyNFNzRDM0MnLCAvLyDnuqJcclxuXTtcclxuXHJcbi8vIOeBsOW6puiJslxyXG5jb25zdCBNT05PX0NPTE9SUyA9IFtcclxuICAnI0MwQzBDMCcsIC8vIOa1heeBsFxyXG4gICcjQThBOEE4JywgLy8g5Lit54GwXHJcbiAgJyNEMEQwRDAnLCAvLyDkuq7ngbBcclxuICAnI0IwQjBCMCcsIC8vIOmTtueBsFxyXG4gICcjQzhDOEM4JywgLy8g5reh54GwXHJcbiAgJyNCOEI4QjgnLCAvLyDmmpfpk7ZcclxuXTtcclxuXHJcbmNvbnN0IFRIRU1FX01BUDogUmVjb3JkPFN2Z1RoZW1lLCBzdHJpbmdbXT4gPSB7XHJcbiAgcGFzdGVsOiBQQVNURUxfQ09MT1JTLFxyXG4gIHZpdmlkOiBWSVZJRF9DT0xPUlMsXHJcbiAgbW9ubzogTU9OT19DT0xPUlMsXHJcbn07XHJcblxyXG4vLyDkv53nlZnoibJcclxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0U4RThFOCc7XHJcblxyXG4vKipcclxuICog6I635Y+W5a2X5q616aKc6ImyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmllbGRDb2xvcihpbmRleDogbnVtYmVyLCBpc1Jlc2VydmVkOiBib29sZWFuLCBkZXB0aDogbnVtYmVyID0gMCwgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcpOiBzdHJpbmcge1xyXG4gIGlmIChpc1Jlc2VydmVkKSB7XHJcbiAgICByZXR1cm4gUkVTRVJWRURfQ09MT1I7XHJcbiAgfVxyXG5cclxuICBjb25zdCBwYWxldHRlID0gVEhFTUVfTUFQW3RoZW1lXSB8fCBQQVNURUxfQ09MT1JTO1xyXG4gIGNvbnN0IGJhc2VDb2xvciA9IHBhbGV0dGVbaW5kZXggJSBwYWxldHRlLmxlbmd0aF07XHJcblxyXG4gIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIGJhc2VDb2xvcjtcclxuICB9XHJcblxyXG4gIC8vIOWtkOWtl+aute+8muWfuuS6jueItuiJsuiwg+aVtOS6ruW6plxyXG4gIHJldHVybiBhZGp1c3RCcmlnaHRuZXNzKGJhc2VDb2xvciwgZGVwdGggKiAxMCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDosIPmlbTpopzoibLkuq7luqZcclxuICovXHJcbmZ1bmN0aW9uIGFkanVzdEJyaWdodG5lc3MoaGV4OiBzdHJpbmcsIHBlcmNlbnQ6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgaGV4ID0gaGV4LnJlcGxhY2UoJyMnLCAnJyk7XHJcblxyXG4gIGNvbnN0IHIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDAsIDIpLCAxNik7XHJcbiAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMiwgNCksIDE2KTtcclxuICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZyg0LCA2KSwgMTYpO1xyXG5cclxuICBjb25zdCBhZGp1c3QgPSAoY2hhbm5lbDogbnVtYmVyKSA9PiB7XHJcbiAgICBjb25zdCBhZGp1c3RlZCA9IE1hdGgucm91bmQoY2hhbm5lbCArICgyNTUgLSBjaGFubmVsKSAqIChwZXJjZW50IC8gMTAwKSk7XHJcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XHJcbiAgY29uc3QgbmV3RyA9IGFkanVzdChnKTtcclxuICBjb25zdCBuZXdCID0gYWRqdXN0KGIpO1xyXG5cclxuICBjb25zdCB0b0hleCA9IChuOiBudW1iZXIpID0+IG4udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyk7XHJcbiAgcmV0dXJuIGAjJHt0b0hleChuZXdSKX0ke3RvSGV4KG5ld0cpfSR7dG9IZXgobmV3Qil9YDtcclxufVxyXG4iLCJpbXBvcnQgdHlwZSB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgdHlwZSB7IFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xuaW1wb3J0IHsgZ2V0RmllbGRDb2xvciB9IGZyb20gJy4vY29sb3JzJztcblxuLyoqXG4gKiBTVkcg5riy5p+T6YWN572uXG4gKi9cbmludGVyZmFjZSBSZW5kZXJDb25maWcge1xuICAvKiog5oC75L2N5a69ICovXG4gIHRvdGFsV2lkdGg6IG51bWJlcjtcbiAgLyoqIOaYr+WQpue6teWQkeaOkuWIlyAqL1xuICBpc1ZlcnRpY2FsOiBib29sZWFuO1xuICAvKiog5a2X5q615qGG6auY5bqmICovXG4gIGJveEhlaWdodDogbnVtYmVyO1xuICAvKiog5a2X5L2T5aSn5bCPICovXG4gIGZvbnRTaXplOiBudW1iZXI7XG4gIC8qKiBTVkcg5Li76aKYICovXG4gIHRoZW1lOiBTdmdUaGVtZTtcbn1cblxuLyoqXG4gKiDorqHnrpflrZfmrrXmoIfnrb7miYDpnIDnmoTmnIDlsI/lrr3luqbvvIjlg4/ntKDvvIlcbiAqL1xuLyoqXG4gKiDliKTmlq3mmK/lkKblupTkvb/nlKjnurXlkJHluIPlsYBcbiAqL1xuZnVuY3Rpb24gc2hvdWxkVXNlVmVydGljYWwoZmllbGRzOiBCaXRGaWVsZFtdLCB0b3RhbFdpZHRoOiBudW1iZXIpOiBib29sZWFuIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCBhdmFpbGFibGVXaWR0aCA9IHN2Z1dpZHRoIC0gMTIwO1xuICBjb25zdCBmb250U2l6ZSA9IDIyO1xuXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgY29uc3QgZmllbGROYW1lID0gZmllbGQuaXNSZXNlcnZlZCA/ICdyZXNlcnZlZCcgOiAoZmllbGQuaXNSZWZlcmVuY2UgPyBgQCR7ZmllbGQucmVmTmFtZX1gIDogZmllbGQubmFtZSk7XG4gICAgY29uc3Qgc2VsZkhpZ2ggPSBmaWVsZC53aWR0aCAtIDE7XG4gICAgY29uc3Qgc2VsZkxhYmVsID0gc2VsZkhpZ2ggPT09IDAgPyBmaWVsZE5hbWUgOiBgJHtmaWVsZE5hbWV9WyR7c2VsZkhpZ2h9OjBdYDtcbiAgICBjb25zdCB3aWR0aFJhdGlvID0gZmllbGQud2lkdGggLyB0b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIC8vIG1vbm9zcGFjZSDlrZfnrKblrr0g4omIIGZvbnRTaXplICogMC4277yM6ZyA6aKd5aSWICsxNiDlrrnnurPlt6blj7Pnqbrnmb1cbiAgICBjb25zdCBtaW5XaWR0aCA9IHNlbGZMYWJlbC5sZW5ndGggKiBmb250U2l6ZSAqIDAuNiArIDE2ICsgODtcbiAgICBpZiAoYm94V2lkdGggPCBtaW5XaWR0aCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIOa4suafk+Wdl+eahCBTVkcg5L2N5Z+f5Zu+XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJCbG9ja1N2ZyhibG9jazogRmllbGRCbG9jaywgdGhlbWU6IFN2Z1RoZW1lID0gJ3Bhc3RlbCcsIGJveEhlaWdodDogbnVtYmVyID0gNDQpOiBzdHJpbmcge1xuICBjb25zdCBjb25maWc6IFJlbmRlckNvbmZpZyA9IHtcbiAgICB0b3RhbFdpZHRoOiBibG9jay53aWR0aCxcbiAgICBpc1ZlcnRpY2FsOiBzaG91bGRVc2VWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpLFxuICAgIGJveEhlaWdodCxcbiAgICBmb250U2l6ZTogMjIsXG4gICAgdGhlbWUsXG4gIH07XG5cbiAgaWYgKGNvbmZpZy5pc1ZlcnRpY2FsKSB7XG4gICAgcmV0dXJuIHJlbmRlclZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZW5kZXJIb3Jpem9udGFsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9XG59XG5cbi8qKlxuICog5qiq5ZCR5riy5p+TXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckhvcml6b250YWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodCArIDYwO1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gMjU7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgbGV0IGN1cnJlbnRYID0gc3RhcnRYO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIGNvbmZpZy50b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwLCBjb25maWcudGhlbWUpO1xuICAgIHN2ZyArPSByZW5kZXJGaWVsZEJveChmaWVsZCwgY3VycmVudFgsIHN0YXJ0WSwgYm94V2lkdGgsIGNvbmZpZy5ib3hIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUsICdob3Jpem9udGFsJyk7XG4gICAgY3VycmVudFggKz0gYm94V2lkdGg7XG4gIH1cblxuICAvLyBMU0Ig4oaSIE1TQiDmlrnlkJHnrq3lpLRcbiAgY29uc3QgYXJyb3dZID0gc3RhcnRZICsgY29uZmlnLmJveEhlaWdodCArIDIyO1xuICBjb25zdCBmcyA9IGNvbmZpZy5mb250U2l6ZSAqIDAuODU7XG4gIGNvbnN0IGZpZWxkTGVmdCA9IHN0YXJ0WDtcbiAgY29uc3QgZmllbGRSaWdodCA9IHN0YXJ0WCArIGF2YWlsYWJsZVdpZHRoO1xuICAvLyBMU0Ig5Y+z5a+56b2Q5Yiw5a2X5q615qGG5bem6L6557yYXG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7ZmllbGRMZWZ0fVwiIHk9XCIke2Fycm93WSArIDV9XCIgZm9udC1zaXplPVwiJHtmc31cIiB0ZXh0LWFuY2hvcj1cImVuZFwiIGZpbGw9XCIjOTk5XCI+TFNCPC90ZXh0PmA7XG4gIC8vIOeureWktOavlOWtl+auteahhueqhOS4gOeCue+8jOS4pOerr+eVmeepulxuICBjb25zdCBhcnJvd1BhZCA9IDEwO1xuICBzdmcgKz0gYDxsaW5lIHgxPVwiJHtmaWVsZExlZnQgKyBhcnJvd1BhZH1cIiB5MT1cIiR7YXJyb3dZfVwiIHgyPVwiJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSA4fVwiIHkyPVwiJHthcnJvd1l9XCIgc3Ryb2tlPVwiIzk5OVwiIHN0cm9rZS13aWR0aD1cIjEuNVwiLz5gO1xuICBzdmcgKz0gYDxwb2x5Z29uIHBvaW50cz1cIiR7ZmllbGRSaWdodCAtIGFycm93UGFkfSwke2Fycm93WX0gJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSAxMH0sJHthcnJvd1kgLSA1fSAke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZCAtIDEwfSwke2Fycm93WSArIDV9XCIgZmlsbD1cIiM5OTlcIi8+YDtcbiAgLy8gTVNCIOW3puWvuem9kOWIsOWtl+auteahhuWPs+i+uee8mFxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2ZpZWxkUmlnaHR9XCIgeT1cIiR7YXJyb3dZICsgNX1cIiBmb250LXNpemU9XCIke2ZzfVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOe6teWQkea4suafk++8iHZpZXdCb3gg5a695bqm5LiO5qiq5ZCR5LiA6Ie077yM5L+d5oyB5a2X5L2T6KeG6KeJ5aSn5bCP5LiA6Ie077yJXG4gKi9cbmZ1bmN0aW9uIHJlbmRlclZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgY29uZmlnOiBSZW5kZXJDb25maWcpOiBzdHJpbmcge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IHJvd0hlaWdodCA9IGNvbmZpZy5ib3hIZWlnaHQ7XG4gIGNvbnN0IHN0YXJ0WCA9IDYwO1xuICBjb25zdCBzdGFydFkgPSAyMjtcbiAgY29uc3QgYm94V2lkdGggPSBzdmdXaWR0aCAtIDE2MDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodCArIDI1O1xuXG4gIGxldCBzdmcgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAke3N2Z1dpZHRofSAke3N2Z0hlaWdodH1cIiB3aWR0aD1cIjEwMCVcIj5gO1xuXG4gIGxldCBjdXJyZW50WSA9IHN0YXJ0WTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCwgY29uZmlnLnRoZW1lKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIHN0YXJ0WCwgY3VycmVudFksIGJveFdpZHRoLCByb3dIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUpO1xuICAgIGN1cnJlbnRZICs9IHJvd0hlaWdodDtcbiAgfVxuXG4gIC8vIExTQiDihpIgTVNCIOaWueWQkeeureWktO+8iOe6teWQke+8muS7juS4iuWIsOS4i++8jOaUvuWcqOW3puS+p+ahhuWklu+8iVxuICBjb25zdCBhcnJvd1ggPSBzdGFydFggLSAyNDtcbiAgY29uc3QgYXJyb3dUb3AgPSBzdGFydFk7XG4gIGNvbnN0IGFycm93Qm90dG9tID0gc3RhcnRZICsgZmllbGRzLmxlbmd0aCAqIHJvd0hlaWdodDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7YXJyb3dYfVwiIHkxPVwiJHthcnJvd1RvcCArIDh9XCIgeDI9XCIke2Fycm93WH1cIiB5Mj1cIiR7YXJyb3dCb3R0b20gLSA4fVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2Fycm93WH0sJHthcnJvd0JvdHRvbX0gJHthcnJvd1ggLSA1fSwke2Fycm93Qm90dG9tIC0gMTB9ICR7YXJyb3dYICsgNX0sJHthcnJvd0JvdHRvbSAtIDEwfVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7YXJyb3dYfVwiIHk9XCIke2Fycm93VG9wIC0gNH1cIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZSAqIDAuODV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fycm93WH1cIiB5PVwiJHthcnJvd0JvdHRvbSArIDE4fVwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplICogMC44NX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCIjOTk5XCI+TVNCPC90ZXh0PmA7XG5cbiAgc3ZnICs9ICc8L3N2Zz4nO1xuICByZXR1cm4gc3ZnO1xufVxuXG4vKipcbiAqIOa4suafk+Wtl+auteahhlxuICogQHBhcmFtIGxheW91dERpcmVjdGlvbiDluIPlsYDmlrnlkJHvvIznlKjkuo7lhrPlrprniLblrZfmrrXntKLlvJXmoIfms6jkvY3nva5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyRmllbGRCb3goXG4gIGZpZWxkOiBCaXRGaWVsZCxcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHdpZHRoOiBudW1iZXIsXG4gIGhlaWdodDogbnVtYmVyLFxuICBjb2xvcjogc3RyaW5nLFxuICBmb250U2l6ZTogbnVtYmVyLFxuICBsYXlvdXREaXJlY3Rpb246ICdob3Jpem9udGFsJyB8ICd2ZXJ0aWNhbCcgPSAndmVydGljYWwnXG4pOiBzdHJpbmcge1xuICBsZXQgc3ZnID0gJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgZmllbGROYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuXG4gIGNvbnN0IHN0cm9rZUNvbG9yID0gaXNSZWYgPyAnIzRBOTBEOScgOiAnI2ZmZic7XG4gIHN2ZyArPSBgPHJlY3QgeD1cIiR7eH1cIiB5PVwiJHt5fVwiIHdpZHRoPVwiJHt3aWR0aH1cIiBoZWlnaHQ9XCIke2hlaWdodH1cIiBmaWxsPVwiJHtjb2xvcn1cIiBzdHJva2U9XCIke3N0cm9rZUNvbG9yfVwiIHN0cm9rZS13aWR0aD1cIjJcIiByeD1cIjRcIiByeT1cIjRcIiBkYXRhLWZpZWxkPVwiJHtmaWVsZE5hbWV9XCIke2lzUmVmID8gYCBkYXRhLXJlZj1cIiR7ZmllbGQucmVmTmFtZX1cImAgOiAnJ30gc3R5bGU9XCJjdXJzb3I6JHtpc1JlZiA/ICdwb2ludGVyJyA6ICdkZWZhdWx0J31cIi8+YDtcblxuICAvLyDmoYblhoXvvJrlrZfmrrXoh6rouqvntKLlvJUgW3dpZHRoLTE6MF3vvIzljZUgYml0IOWtl+auteecgeeVpee0ouW8lVxuICBjb25zdCBzZWxmSGlnaCA9IGZpZWxkLndpZHRoIC0gMTtcbiAgY29uc3Qgc2VsZkxhYmVsID0gc2VsZkhpZ2ggPT09IDAgPyBmaWVsZE5hbWUgOiBgJHtmaWVsZE5hbWV9WyR7c2VsZkhpZ2h9OjBdYDtcbiAgY29uc3QgdGV4dFggPSB4ICsgd2lkdGggLyAyO1xuICBjb25zdCB0ZXh0WSA9IHkgKyBoZWlnaHQgLyAyO1xuICBjb25zdCB0ZXh0V2lkdGggPSB3aWR0aCAtIDE2O1xuICBjb25zdCBtYXhDaGFycyA9IE1hdGguZmxvb3IodGV4dFdpZHRoIC8gKGZvbnRTaXplICogMC42KSk7XG5cbiAgbGV0IGRpc3BsYXlUZXh0ID0gc2VsZkxhYmVsO1xuICBpZiAoc2VsZkxhYmVsLmxlbmd0aCA+IG1heENoYXJzICYmIG1heENoYXJzID4gMykge1xuICAgIGRpc3BsYXlUZXh0ID0gc2VsZkxhYmVsLnN1YnN0cmluZygwLCBtYXhDaGFycyAtIDIpICsgJy4uJztcbiAgfVxuXG4gIGNvbnN0IHRleHREZWNvcmF0aW9uID0gJyc7XG4gIGNvbnN0IGZpbGxDb2xvciA9IGlzUnN2ID8gJyM4ODgnIDogJyMzMzMnO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke3RleHRYfVwiIHk9XCIke3RleHRZfVwiIGZvbnQtc2l6ZT1cIiR7Zm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBkb21pbmFudC1iYXNlbGluZT1cImNlbnRyYWxcIiBmaWxsPVwiJHtmaWxsQ29sb3J9XCIgZm9udC1mYW1pbHk9XCJtb25vc3BhY2VcIiR7dGV4dERlY29yYXRpb259IGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiPiR7ZGlzcGxheVRleHR9PC90ZXh0PmA7XG5cbiAgLy8g5qGG5aSW77ya54i25a2X5q6157Si5byVIFttc2I6bHNiXe+8jOeBsOiJsuWwj+Wtl1xuICBjb25zdCBwYXJlbnRIaWdoID0gZmllbGQubXNiO1xuICBjb25zdCBwYXJlbnRMb3cgPSBmaWVsZC5sc2I7XG4gIGNvbnN0IHBhcmVudExhYmVsID0gcGFyZW50SGlnaCA9PT0gcGFyZW50TG93ID8gYFske3BhcmVudEhpZ2h9XWAgOiBgWyR7cGFyZW50SGlnaH06JHtwYXJlbnRMb3d9XWA7XG4gIGNvbnN0IGFubm90YXRpb25Gb250U2l6ZSA9IGZvbnRTaXplICogMC43O1xuXG4gIGlmIChsYXlvdXREaXJlY3Rpb24gPT09ICd2ZXJ0aWNhbCcpIHtcbiAgICAvLyDnurXlkJHvvJrmoIfms6jlnKjlj7PkvqfvvIzlt6blr7npvZDvvIjlt6bkvqfnqbrpl7TkuI3otrPml7YgMyDkvY3mlbDlrZfmoIfms6jkuI3kvJrooqsgdmlld0JveCDoo4HliarvvIlcbiAgICBjb25zdCBhbm5vdFggPSB4ICsgd2lkdGggKyA4O1xuICAgIGNvbnN0IGFubm90WSA9IHRleHRZO1xuICAgIHN2ZyArPSBgPHRleHQgeD1cIiR7YW5ub3RYfVwiIHk9XCIke2Fubm90WX1cIiBmb250LXNpemU9XCIke2Fubm90YXRpb25Gb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cInN0YXJ0XCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiM5OTlcIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiPiR7cGFyZW50TGFiZWx9PC90ZXh0PmA7XG4gIH0gZWxzZSB7XG4gICAgLy8g5qiq5ZCR77ya5qCH5rOo5Zyo5LiK5pa577yM5bGF5LitXG4gICAgY29uc3QgYW5ub3RYID0gdGV4dFg7XG4gICAgY29uc3QgYW5ub3RZID0geSAtIDg7XG4gICAgc3ZnICs9IGA8dGV4dCB4PVwiJHthbm5vdFh9XCIgeT1cIiR7YW5ub3RZfVwiIGZvbnQtc2l6ZT1cIiR7YW5ub3RhdGlvbkZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIiM5OTlcIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiPiR7cGFyZW50TGFiZWx9PC90ZXh0PmA7XG4gIH1cblxuICByZXR1cm4gc3ZnO1xufVxuIiwiaW1wb3J0IHR5cGUgeyBCaXRGaWVsZCwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xyXG5cclxuLyoqXHJcbiAqIOa4suafk+Wdl+eahCBIVE1MIOihqOagvFxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrVGFibGUoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xyXG4gIGNvbnN0IHJvd3M6IHN0cmluZ1tdID0gW107XHJcblxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY2hpbGRyZW4pIHtcclxuICAgIGNvbGxlY3RSb3dzKGNoaWxkLCAwLCByb3dzKTtcclxuICB9XHJcblxyXG4gIGxldCBodG1sID0gJzx0YWJsZSBjbGFzcz1cImJpdGZpZWxkLXRhYmxlXCI+JztcclxuICBodG1sICs9ICc8dGhlYWQ+PHRyPic7XHJcbiAgaHRtbCArPSAnPHRoPkZpZWxkPC90aD4nO1xyXG4gIGh0bWwgKz0gJzx0aD5XaWR0aDwvdGg+JztcclxuICBodG1sICs9ICc8dGg+Qml0IFJhbmdlPC90aD4nO1xyXG4gIGh0bWwgKz0gJzx0aD5EZXNjcmlwdGlvbjwvdGg+JztcclxuICBodG1sICs9ICc8L3RyPjwvdGhlYWQ+JztcclxuICBodG1sICs9ICc8dGJvZHk+JztcclxuICBodG1sICs9IHJvd3Muam9pbignJyk7XHJcbiAgaHRtbCArPSAnPC90Ym9keT48L3RhYmxlPic7XHJcbiAgcmV0dXJuIGh0bWw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDpgJLlvZLmlLbpm4booajmoLzooYxcclxuICovXHJcbmZ1bmN0aW9uIGNvbGxlY3RSb3dzKGZpZWxkOiBCaXRGaWVsZCwgZGVwdGg6IG51bWJlciwgcm93czogc3RyaW5nW10pOiB2b2lkIHtcclxuICBjb25zdCBpbmRlbnQgPSBkZXB0aCA+IDAgPyAnJm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jy5yZXBlYXQoZGVwdGgpIDogJyc7XHJcbiAgY29uc3QgaXNSZWYgPSBmaWVsZC5pc1JlZmVyZW5jZTtcclxuICBjb25zdCBpc1JzdiA9IGZpZWxkLmlzUmVzZXJ2ZWQ7XHJcbiAgY29uc3QgbmFtZSA9IGlzUnN2ID8gJ3Jlc2VydmVkJyA6IChpc1JlZiA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcclxuICBjb25zdCBiaXRSYW5nZSA9IGBbJHtmaWVsZC5tc2J9OiR7ZmllbGQubHNifV1gO1xyXG4gIGNvbnN0IGRlc2NyaXB0aW9uID0gZmllbGQuZGVzY3JpcHRpb24gfHwgJyc7XHJcblxyXG4gIGxldCByb3dDbGFzcyA9ICcnO1xyXG4gIGlmIChpc1Jzdikgcm93Q2xhc3MgPSAnIGNsYXNzPVwicmVzZXJ2ZWQtcm93XCInO1xyXG4gIGVsc2UgaWYgKGlzUmVmKSByb3dDbGFzcyA9ICcgY2xhc3M9XCJyZWYtY2hpbGRcIic7XHJcblxyXG4gIGNvbnN0IG5hbWVDZWxsID0gaXNSZWZcclxuICAgID8gYDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJiZi1yZWYtbGlua1wiIGRhdGEtdGFyZ2V0PVwiJHtmaWVsZC5yZWZOYW1lfVwiPiR7aW5kZW50fSR7bmFtZX08L2E+YFxyXG4gICAgOiBgJHtpbmRlbnR9JHtuYW1lfWA7XHJcblxyXG4gIHJvd3MucHVzaChgPHRyJHtyb3dDbGFzc30+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtuYW1lQ2VsbH08L3RkPmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7ZmllbGQud2lkdGh9PC90ZD5gKTtcclxuICByb3dzLnB1c2goYDx0ZD4ke2JpdFJhbmdlfTwvdGQ+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtkZXNjcmlwdGlvbn08L3RkPmApO1xyXG4gIHJvd3MucHVzaCgnPC90cj4nKTtcclxuXHJcbiAgaWYgKGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZmllbGQuY2hpbGRyZW4pIHtcclxuICAgICAgY29sbGVjdFJvd3MoY2hpbGQsIGRlcHRoICsgMSwgcm93cyk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB0eXBlIHsgQXBwLCBTZXR0aW5nRGVmaW5pdGlvbkl0ZW0gfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHR5cGUgQml0ZmllbGRQbHVnaW4gZnJvbSAnLi9tYWluJztcbmltcG9ydCB0eXBlIHsgVGFibGVUaGVtZSwgUGx1Z2luRGF0YSBhcyBQbHVnaW5EYXRhVHlwZXMgfSBmcm9tICcuL21haW4nO1xuaW1wb3J0IHR5cGUgeyBTdmdUaGVtZSB9IGZyb20gJy4vY29sb3JzJztcblxuY29uc3QgVEFCTEVfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8VGFibGVUaGVtZSwgc3RyaW5nPiA9IHtcbiAgZGVmYXVsdDogJ0RlZmF1bHQg4oCUIGdyaWQgbGluZXMsIGdyYXkgaGVhZGVyJyxcbiAgbWluaW1hbDogJ01pbmltYWwg4oCUIGhvcml6b250YWwgbGluZXMgb25seScsXG4gIHplYnJhOiAnWmVicmEg4oCUIGFsdGVybmF0aW5nIHJvdyBjb2xvcnMnLFxuICBjbGVhbjogJ0NsZWFuIOKAlCBubyBib3JkZXJzLCB3aGl0ZXNwYWNlIHNlcGFyYXRpb24nLFxuICAnZGFyay1oZWFkZXInOiAnRGFyayBIZWFkZXIg4oCUIGRhcmsgaGVhZGVyLCBjbGVhbiBib2R5Jyxcbn07XG5cbmNvbnN0IFNWR19USEVNRV9MQUJFTFM6IFJlY29yZDxTdmdUaGVtZSwgc3RyaW5nPiA9IHtcbiAgcGFzdGVsOiAnUGFzdGVsIOKAlCBzb2Z0IHBhc3RlbCBjb2xvcnMnLFxuICB2aXZpZDogJ1ZpdmlkIOKAlCBib2xkIHNhdHVyYXRlZCBjb2xvcnMnLFxuICBtb25vOiAnTW9ubyDigJQgZ3JheXNjYWxlJyxcbn07XG5cbmV4cG9ydCBjbGFzcyBCaXRmaWVsZFNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcGx1Z2luOiBCaXRmaWVsZFBsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBCaXRmaWVsZFBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGdldCBkYXRhKCk6IFBsdWdpbkRhdGFUeXBlcyB7IHJldHVybiB0aGlzLnBsdWdpbi5zYXZlZERhdGE7IH1cbiAgc2V0IGRhdGEodjogUGx1Z2luRGF0YVR5cGVzKSB7IHRoaXMucGx1Z2luLnNhdmVkRGF0YSA9IHY7IH1cblxuICAvKiogRGVjbGFyYXRpdmUgc2V0dGluZ3MgZGVmaW5pdGlvbnMgZm9yIE9ic2lkaWFuIDEuMTMuMCsgc2VhcmNoICovXG4gIGdldFNldHRpbmdEZWZpbml0aW9ucygpOiBTZXR0aW5nRGVmaW5pdGlvbkl0ZW1bXSB7XG4gICAgcmV0dXJuIFt7XG4gICAgICB0eXBlOiAnZ3JvdXAnLFxuICAgICAgaXRlbXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdTVkcgdGhlbWUnLFxuICAgICAgICAgIGRlc2M6ICdDb2xvciBzY2hlbWUgZm9yIGJpdGZpZWxkIGRpYWdyYW1zJyxcbiAgICAgICAgICBjb250cm9sOiB7XG4gICAgICAgICAgICBrZXk6ICdzdmdUaGVtZScsXG4gICAgICAgICAgICB0eXBlOiAnZHJvcGRvd24nLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAncGFzdGVsJyxcbiAgICAgICAgICAgIG9wdGlvbnM6IFNWR19USEVNRV9MQUJFTFMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdTVkcgcm93IGhlaWdodCcsXG4gICAgICAgICAgZGVzYzogJ0hlaWdodCBvZiBlYWNoIGZpZWxkIHJvdyBpbiBiaXRmaWVsZCBkaWFncmFtcyAocHgpJyxcbiAgICAgICAgICBjb250cm9sOiB7XG4gICAgICAgICAgICBrZXk6ICdzdmdCb3hIZWlnaHQnLFxuICAgICAgICAgICAgdHlwZTogJ3NsaWRlcicsXG4gICAgICAgICAgICBkZWZhdWx0VmFsdWU6IDM4LFxuICAgICAgICAgICAgbWluOiAyOCxcbiAgICAgICAgICAgIG1heDogODAsXG4gICAgICAgICAgICBzdGVwOiAyLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnVGFibGUgdGhlbWUnLFxuICAgICAgICAgIGRlc2M6ICdWaXN1YWwgc3R5bGUgZm9yIHJlbmRlcmVkIHRhYmxlcycsXG4gICAgICAgICAgY29udHJvbDoge1xuICAgICAgICAgICAga2V5OiAndGFibGVUaGVtZScsXG4gICAgICAgICAgICB0eXBlOiAnZHJvcGRvd24nLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAnZGVmYXVsdCcsXG4gICAgICAgICAgICBvcHRpb25zOiBUQUJMRV9USEVNRV9MQUJFTFMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdUYWJsZSByb3cgaGVpZ2h0JyxcbiAgICAgICAgICBkZXNjOiAnUm93IGhlaWdodCBmb3IgcmVuZGVyZWQgdGFibGVzIChweCknLFxuICAgICAgICAgIGNvbnRyb2w6IHtcbiAgICAgICAgICAgIGtleTogJ3RhYmxlUm93SGVpZ2h0JyxcbiAgICAgICAgICAgIHR5cGU6ICdzbGlkZXInLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAyOCxcbiAgICAgICAgICAgIG1pbjogMTgsXG4gICAgICAgICAgICBtYXg6IDQ4LFxuICAgICAgICAgICAgc3RlcDogMixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9XTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoJ0JpdGZpZWxkJykuc2V0SGVhZGluZygpO1xuXG4gICAgLy8gU1ZHIOS4u+mimFxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1NWRyB0aGVtZScpXG4gICAgICAuc2V0RGVzYygnQ29sb3Igc2NoZW1lIGZvciBiaXRmaWVsZCBkaWFncmFtcycpXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcCA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgbGFiZWxdIG9mIE9iamVjdC5lbnRyaWVzKFNWR19USEVNRV9MQUJFTFMpKSB7XG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgICAgZHJvcC5zZXRWYWx1ZSh0aGlzLmRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCcpO1xuICAgICAgICBkcm9wLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5zdmdUaGVtZSA9IHZhbHVlIGFzIFN2Z1RoZW1lO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMuZGF0YSk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVyZW5kZXJBbGxTdmcoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIC8vIFNWRyDooYzpq5hcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdTVkcgcm93IGhlaWdodCcpXG4gICAgICAuc2V0RGVzYygnSGVpZ2h0IG9mIGVhY2ggZmllbGQgcm93IGluIGJpdGZpZWxkIGRpYWdyYW1zIChweCknKVxuICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4ge1xuICAgICAgICBzbGlkZXIuc2V0TGltaXRzKDI4LCA4MCwgMik7XG4gICAgICAgIHNsaWRlci5zZXRWYWx1ZSh0aGlzLmRhdGEuc3ZnQm94SGVpZ2h0IHx8IDM4KTtcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5zdmdCb3hIZWlnaHQgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnJlcmVuZGVyQWxsU3ZnKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAvLyDooajmoLzkuLvpophcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdUYWJsZSB0aGVtZScpXG4gICAgICAuc2V0RGVzYygnVmlzdWFsIHN0eWxlIGZvciByZW5kZXJlZCB0YWJsZXMnKVxuICAgICAgLmFkZERyb3Bkb3duKGRyb3AgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIGxhYmVsXSBvZiBPYmplY3QuZW50cmllcyhUQUJMRV9USEVNRV9MQUJFTFMpKSB7XG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XG4gICAgICAgIH1cbiAgICAgICAgZHJvcC5zZXRWYWx1ZSh0aGlzLmRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xuICAgICAgICBkcm9wLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS50YWJsZVRoZW1lID0gdmFsdWUgYXMgVGFibGVUaGVtZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMuYXBwbHlUYWJsZVRoZW1lKHZhbHVlIGFzIFRhYmxlVGhlbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgLy8g6KGo5qC86KGM6auYXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnVGFibGUgcm93IGhlaWdodCcpXG4gICAgICAuc2V0RGVzYygnUm93IGhlaWdodCBmb3IgcmVuZGVyZWQgdGFibGVzIChweCknKVxuICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4ge1xuICAgICAgICBzbGlkZXIuc2V0TGltaXRzKDE4LCA0OCwgMik7XG4gICAgICAgIHNsaWRlci5zZXRWYWx1ZSh0aGlzLmRhdGEudGFibGVSb3dIZWlnaHQgfHwgMjgpO1xuICAgICAgICBzbGlkZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLnRhYmxlUm93SGVpZ2h0ID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLmFwcGx5VGFibGVSb3dIZWlnaHQodmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVRhYmxlVGhlbWUodGhlbWU6IFRhYmxlVGhlbWUpOiB2b2lkIHtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYml0ZmllbGQtdGFibGUtY29udGFpbmVyJykuZm9yRWFjaChlbCA9PiB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGVtZSk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5VGFibGVSb3dIZWlnaHQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYmYtdGFibGUtcm93LWhlaWdodCcsIGAke2hlaWdodH1weGApO1xuICB9XG59XG4iLCJpbXBvcnQgdHlwZSB7IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBjcmVhdGVGcmFnbWVudCwgUGx1Z2luIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuL3BhcnNlcic7XG5pbXBvcnQgeyByZW5kZXJCbG9ja1N2ZyB9IGZyb20gJy4vc3ZnUmVuZGVyZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tUYWJsZSB9IGZyb20gJy4vdGFibGVSZW5kZXJlcic7XG5pbXBvcnQgdHlwZSB7IFJlZ2lzdHJ5RW50cnksIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IEJpdGZpZWxkU2V0dGluZ1RhYiB9IGZyb20gJy4vc2V0dGluZ3MnO1xuaW1wb3J0IHR5cGUgeyBTdmdUaGVtZSB9IGZyb20gJy4vY29sb3JzJztcblxuZXhwb3J0IHR5cGUgVGFibGVUaGVtZSA9ICdkZWZhdWx0JyB8ICdtaW5pbWFsJyB8ICd6ZWJyYScgfCAnY2xlYW4nIHwgJ2RhcmstaGVhZGVyJztcblxuZXhwb3J0IGludGVyZmFjZSBQbHVnaW5EYXRhIHtcbiAgZGVmYXVsdFZpZXc/OiAnc3ZnJyB8ICd0YWJsZSc7XG4gIHRhYmxlVGhlbWU/OiBUYWJsZVRoZW1lO1xuICBzdmdUaGVtZT86IFN2Z1RoZW1lO1xuICBzdmdCb3hIZWlnaHQ/OiBudW1iZXI7XG4gIHRhYmxlUm93SGVpZ2h0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9EQVRBOiBQbHVnaW5EYXRhID0geyBkZWZhdWx0VmlldzogJ3N2ZycsIHRhYmxlVGhlbWU6ICdkZWZhdWx0Jywgc3ZnVGhlbWU6ICdwYXN0ZWwnLCBzdmdCb3hIZWlnaHQ6IDM4LCB0YWJsZVJvd0hlaWdodDogMjggfTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQml0ZmllbGRQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcml2YXRlIGJsb2NrUmVnaXN0cnk6IE1hcDxzdHJpbmcsIFJlZ2lzdHJ5RW50cnk+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIHBlbmRpbmdSZWZzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0YXJnZXROYW1lOiBzdHJpbmcgfVtdID0gW107XG4gIHByaXZhdGUgY3VycmVudE5vdGVQYXRoOiBzdHJpbmcgPSAnJztcbiAgcHJpdmF0ZSBhY3RpdmVUb29sdGlwOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHRvb2x0aXBSZW1vdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBwbHVnaW5EYXRhOiBQbHVnaW5EYXRhID0gREVGQVVMVF9EQVRBO1xuXG4gIC8vIHB1YmxpYyBhY2Nlc3NvciBmb3IgU2V0dGluZ1RhYlxuICBnZXQgc2F2ZWREYXRhKCk6IFBsdWdpbkRhdGEgeyByZXR1cm4gdGhpcy5wbHVnaW5EYXRhOyB9XG4gIHNldCBzYXZlZERhdGEodjogUGx1Z2luRGF0YSkgeyB0aGlzLnBsdWdpbkRhdGEgPSB2OyB9XG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIHRoaXMucGx1Z2luRGF0YSA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfREFUQSwgKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgYXMgUGx1Z2luRGF0YSk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBCaXRmaWVsZFNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ2JpdGZpZWxkJywgdGhpcy5wcm9jZXNzQml0ZmllbGQuYmluZCh0aGlzKSk7XG4gICAgLy8g5bqU55So5L+d5a2Y55qE6KGo5qC86KGM6auYXG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWJmLXRhYmxlLXJvdy1oZWlnaHQnLCBgJHt0aGlzLnBsdWdpbkRhdGEudGFibGVSb3dIZWlnaHQgfHwgMjh9cHhgKTtcbiAgfVxuXG4gIG9udW5sb2FkKCkge1xuICAgIHRoaXMuYmxvY2tSZWdpc3RyeS5jbGVhcigpO1xuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBbXTtcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NCaXRmaWVsZChzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICB0aGlzLmN1cnJlbnROb3RlUGF0aCA9IGN0eC5zb3VyY2VQYXRoIHx8ICcnO1xuICAgIGNvbnN0IHJlc3VsdCA9IHBhcnNlKHNvdXJjZSk7XG5cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICB0aGlzLnJlbmRlckVycm9ycyhlbCwgcmVzdWx0LmVycm9ycyB8fCBbXSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCFyZXN1bHQuYmxvY2tzKSByZXR1cm47XG4gICAgZm9yIChjb25zdCBbbmFtZSwgYmxvY2tdIG9mIHJlc3VsdC5ibG9ja3MpIHtcbiAgICAgIHRoaXMucmVuZGVyQmxvY2sobmFtZSwgYmxvY2ssIGVsKTtcbiAgICB9XG5cbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLnJlc29sdmVQZW5kaW5nUmVmcygpLCA1MCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckJsb2NrKG5hbWU6IHN0cmluZywgYmxvY2s6IEZpZWxkQmxvY2ssIHBhcmVudEVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHBhcmVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7XG4gICAgICBjbHM6ICdiaXRmaWVsZC1jb250YWluZXInLFxuICAgICAgYXR0cjogeyBpZDogYGJmOiR7bmFtZX1gIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGhlYWRlclJvdyA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiaXRmaWVsZC1oZWFkZXItcm93JyB9KTtcbiAgICBjb25zdCBkZXNjID0gYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2Jsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcbiAgICBoZWFkZXJSb3cuY3JlYXRlRWwoJ3NwYW4nLCB7XG4gICAgICB0ZXh0OiBgJHtuYW1lfSR7ZGVzY30g55qEICR7YmxvY2sud2lkdGh9IGJpdCDlrprkuYnlpoLkuIvvvJpgLFxuICAgICAgY2xzOiAnYml0ZmllbGQtaGVhZGVyJ1xuICAgIH0pO1xuICAgIGNvbnN0IHRvZ2dsZUJ0biA9IHRoaXMuY3JlYXRlVG9nZ2xlQnV0dG9uKGhlYWRlclJvdyk7XG5cbiAgICBjb25zdCBjb250ZW50V3JhcCA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiaXRmaWVsZC1jb250ZW50JyB9KTtcbiAgICBjb25zdCBzdmdDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiaXRmaWVsZC1zdmcnIH0pO1xuICAgIGNyZWF0ZUZyYWdtZW50KChmcmFnbWVudCkgPT4ge1xuICAgICAgZnJhZ21lbnQuc2V0SFRNTChyZW5kZXJCbG9ja1N2ZyhibG9jaywgdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDQ0KSk7XG4gICAgfSkuYXBwZW5kVG8oc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLnNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRvb2x0aXBIYW5kbGVycyhzdmdDb250YWluZXIpO1xuXG4gICAgY29uc3QgdGFibGVDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiaXRmaWVsZC10YWJsZS1jb250YWluZXInIH0pO1xuICAgIHRhYmxlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnZGF0YS10aGVtZScsIHRoaXMucGx1Z2luRGF0YS50YWJsZVRoZW1lIHx8ICdkZWZhdWx0Jyk7XG4gICAgY3JlYXRlRnJhZ21lbnQoKGZyYWdtZW50KSA9PiB7XG4gICAgICBmcmFnbWVudC5zZXRIVE1MKHJlbmRlckJsb2NrVGFibGUoYmxvY2spKTtcbiAgICB9KS5hcHBlbmRUbyh0YWJsZUNvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcbiAgICB0aGlzLnNldHVwVGFibGVUb29sdGlwSGFuZGxlcnModGFibGVDb250YWluZXIpO1xuXG4gICAgLy8g5Yid5aeL5YyW6KeG5Zu+77ya6K+75Y+W5L+d5a2Y55qE5YGP5aW9XG4gICAgY29uc3QgZGVmYXVsdFZpZXcgPSB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgfHwgJ3N2Zyc7XG4gICAgdGhpcy5hcHBseVZpZXcoZGVmYXVsdFZpZXcsIGNvbnRlbnRXcmFwLCBzdmdDb250YWluZXIsIHRhYmxlQ29udGFpbmVyLCB0b2dnbGVCdG4pO1xuXG4gICAgLy8g57uR5a6a5YiH5o2i5LqL5Lu2XG4gICAgdG9nZ2xlQnRuLm9uY2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBjb25zdCB2aWV3ID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgYXMgJ3N2ZycgfCAndGFibGUnIHwgbnVsbDtcbiAgICAgIGlmICh2aWV3KSB7XG4gICAgICAgIHRoaXMuYXBwbHlWaWV3KHZpZXcsIGNvbnRlbnRXcmFwLCBzdmdDb250YWluZXIsIHRhYmxlQ29udGFpbmVyLCB0b2dnbGVCdG4pO1xuICAgICAgICB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgPSB2aWV3O1xuICAgICAgICB0aGlzLnNhdmVEYXRhKHRoaXMucGx1Z2luRGF0YSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMuYmxvY2tSZWdpc3RyeS5zZXQobmFtZSwge1xuICAgICAgZWxlbWVudDogY29udGFpbmVyLFxuICAgICAgYmxvY2ssXG4gICAgICBub3RlUGF0aDogdGhpcy5jdXJyZW50Tm90ZVBhdGhcbiAgICB9KTtcblxuICAgIHRoaXMuY29sbGVjdFBlbmRpbmdSZWZzKHN2Z0NvbnRhaW5lcik7XG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnModGFibGVDb250YWluZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVZpZXcodmlldzogJ3N2ZycgfCAndGFibGUnLCBjb250ZW50V3JhcDogSFRNTEVsZW1lbnQsIHN2Z0VsOiBIVE1MRWxlbWVudCwgdGFibGVFbDogSFRNTEVsZW1lbnQsIGJ0bjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250ZW50V3JhcC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycsIHZpZXcpO1xuICAgIGJ0bi5xdWVyeVNlbGVjdG9yQWxsKCcuYmYtdG9nZ2xlLW9wdGlvbicpLmZvckVhY2gob3B0ID0+IHtcbiAgICAgIG9wdC5jbGFzc0xpc3QudG9nZ2xlKCdiZi10b2dnbGUtYWN0aXZlJywgb3B0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgPT09IHZpZXcpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVUb2dnbGVCdXR0b24ocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBidG4gPSBwYXJlbnQuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdmlldy10b2dnbGUnIH0pO1xuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+S9jeWfn+WbvicsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXN2ZycsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICdzdmcnIH0gfSk7XG4gICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn6KGo5qC8JywgY2xzOiAnYmYtdG9nZ2xlLW9wdGlvbiBiZi10b2dnbGUtdGFibGUnLCBhdHRyOiB7ICdkYXRhLXZpZXcnOiAndGFibGUnIH0gfSk7XG4gICAgcmV0dXJuIGJ0bjtcbiAgfVxuXG4gIC8qKiBSZXJlbmRlciBhbGwgU1ZHcyB3aXRoIGN1cnJlbnQgdGhlbWUg4oCUIHB1YmxpYyBmb3IgU2V0dGluZ1RhYiAqL1xuICBwdWJsaWMgcmVyZW5kZXJBbGxTdmcoKTogdm9pZCB7XG4gICAgY29uc3QgdGhlbWUgPSB0aGlzLnBsdWdpbkRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCc7XG4gICAgZm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5ibG9ja1JlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBzdmdDb250YWluZXIgPSBlbnRyeS5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5iaXRmaWVsZC1zdmcnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoc3ZnQ29udGFpbmVyKSB7XG4gICAgICAgIGNyZWF0ZUZyYWdtZW50KChmcmFnbWVudCkgPT4ge1xuICAgICAgICAgIGZyYWdtZW50LnNldEhUTUwocmVuZGVyQmxvY2tTdmcoZW50cnkuYmxvY2ssIHRoZW1lLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDQ0KSk7XG4gICAgICAgIH0pLmFwcGVuZFRvKHN2Z0NvbnRhaW5lcik7XG4gICAgICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICAgICAgdGhpcy5zZXR1cFRvb2x0aXBIYW5kbGVycyhzdmdDb250YWluZXIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyRXJyb3JzKGVsOiBIVE1MRWxlbWVudCwgZXJyb3JzOiB7IGxpbmU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nOyBzdWdnZXN0aW9uPzogc3RyaW5nIH1bXSkge1xuICAgIGVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JpdGZpZWxkLWVycm9yJyB9LCAoZXJyb3JFbCkgPT4ge1xuICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+ino+aekOmUmeivrzonIH0pO1xuICAgICAgZm9yIChjb25zdCBlcnJvciBvZiBlcnJvcnMpIHtcbiAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOihjCAke2Vycm9yLmxpbmV9OiAke2Vycm9yLm1lc3NhZ2V9YCB9KTtcbiAgICAgICAgaWYgKGVycm9yLnN1Z2dlc3Rpb24pIHtcbiAgICAgICAgICBlcnJvckVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBg5bu66K6uOiAke2Vycm9yLnN1Z2dlc3Rpb259YCwgY2xzOiAnc3VnZ2VzdGlvbicgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCDngrnlh7vot7Povawg4pSA4pSA4pSAXG5cbiAgcHJpdmF0ZSBzZXR1cE5hdmlnYXRpb25IYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLm9uY2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKTtcbiAgICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzY3JvbGxUb0Jsb2NrKGJsb2NrTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xuICAgIGVudHJ5LmVsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2JmLWhpZ2hsaWdodCcpO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtaGlnaGxpZ2h0JyksIDE1MDApO1xuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOaCrOa1riB0b29sdGlwIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAvLyDpvKDmoIflm57liLDmupDlhYPntKDkuIrvvIzlj5bmtojlvoXliKDpmaTlrprml7blmahcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcbiAgICAgICAgdGhpcy5zaG93VG9vbHRpcChyZWZOYW1lLCBlLmNsaWVudFgsIGUuY2xpZW50WSwgdmlldyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwVGFibGVUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYmYtcmVmLWxpbmsnKSkge1xuICAgICAgICBpZiAodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpIHtcbiAgICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcbiAgICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XG4gICAgICAgIGlmIChyZWZOYW1lKSB7XG4gICAgICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Vmlld0ZvckJsb2NrKHJlZk5hbWUpO1xuICAgICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFksIHZpZXcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHRoaXMuc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCk7XG4gICAgfSk7XG4gIH1cblxuICAvKiog6I635Y+W6KKr5byV55So5Z2X6Ieq6Lqr55qE6KeG5Zu+54q25oCB77yM5LiN5a2Y5Zyo5YiZ55So6buY6K6k5YGP5aW9ICovXG4gIHByaXZhdGUgZ2V0Vmlld0ZvckJsb2NrKGJsb2NrTmFtZTogc3RyaW5nKTogJ3N2ZycgfCAndGFibGUnIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcbiAgICBpZiAoZW50cnkpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gZW50cnkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYml0ZmllbGQtY29udGVudCcpO1xuICAgICAgY29uc3QgdmlldyA9IGNvbnRlbnRXcmFwPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmICh2aWV3KSByZXR1cm4gdmlldztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCkge1xuICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG4gICAgfSwgMjAwKTtcbiAgfVxuXG4gIHByaXZhdGUgc2hvd1Rvb2x0aXAoYmxvY2tOYW1lOiBzdHJpbmcsIG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlciwgdmlldzogJ3N2ZycgfCAndGFibGUnKSB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKCFlbnRyeSkgcmV0dXJuO1xuXG4gICAgdGhpcy5yZW1vdmVUb29sdGlwKCk7XG5cbiAgICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuYm9keS5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwJyB9KTtcblxuICAgIGNvbnN0IGRlc2MgPSBlbnRyeS5ibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7ZW50cnkuYmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGAke2Jsb2NrTmFtZX0ke2Rlc2N9YCwgY2xzOiAnYmYtdG9vbHRpcC1oZWFkZXInIH0pO1xuXG4gICAgaWYgKHZpZXcgPT09ICdzdmcnKSB7XG4gICAgICBjb25zdCBzdmdXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXN2ZycgfSk7XG4gICAgICBjcmVhdGVGcmFnbWVudCgoZnJhZ21lbnQpID0+IHtcbiAgICAgICAgZnJhZ21lbnQuc2V0SFRNTChyZW5kZXJCbG9ja1N2ZyhlbnRyeS5ibG9jaywgdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDQ0KSk7XG4gICAgICB9KS5hcHBlbmRUbyhzdmdXcmFwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdGFibGVXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXRhYmxlJyB9KTtcbiAgICAgIGNyZWF0ZUZyYWdtZW50KChmcmFnbWVudCkgPT4ge1xuICAgICAgICBmcmFnbWVudC5zZXRIVE1MKHJlbmRlckJsb2NrVGFibGUoZW50cnkuYmxvY2spKTtcbiAgICAgIH0pLmFwcGVuZFRvKHRhYmxlV3JhcCk7XG4gICAgfVxuXG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ+WNleWHu+i3s+i9rOafpeeci+WujOaVtOWumuS5iScsIGNsczogJ2JmLXRvb2x0aXAtaGludCcgfSk7XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRvb2x0aXApO1xuICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IHRvb2x0aXA7XG5cbiAgICBjb25zdCByZWN0ID0gdG9vbHRpcC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBsZXQgbGVmdCA9IG1vdXNlWCArIDEyO1xuICAgIGxldCB0b3AgPSBtb3VzZVkgLSAyMDtcbiAgICBpZiAobGVmdCArIHJlY3Qud2lkdGggPiB3aW5kb3cuaW5uZXJXaWR0aCAtIDE2KSBsZWZ0ID0gbW91c2VYIC0gcmVjdC53aWR0aCAtIDEyO1xuICAgIGlmICh0b3AgKyByZWN0LmhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDE2KSB0b3AgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDE2O1xuICAgIGlmICh0b3AgPCA4KSB0b3AgPSA4O1xuXG4gICAgdG9vbHRpcC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdG9vbHRpcC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIC8vIOm8oOagh+i/m+WFpSB0b29sdGlwIOaXtuWPlua2iOW+heWIoOmZpOWumuaXtuWZqFxuICAgIHRvb2x0aXAuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcbiAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRvb2x0aXAuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHRoaXMucmVtb3ZlVG9vbHRpcCgpKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3ZlVG9vbHRpcCgpIHtcbiAgICBpZiAodGhpcy5hY3RpdmVUb29sdGlwKSB7XG4gICAgICB0aGlzLmFjdGl2ZVRvb2x0aXAucmVtb3ZlKCk7XG4gICAgICB0aGlzLmFjdGl2ZVRvb2x0aXAgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCDlvJXnlKjop6PmnpAg4pSA4pSA4pSAXG5cbiAgcHJpdmF0ZSBjb2xsZWN0UGVuZGluZ1JlZnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1yZWZdJykuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJykgPz8gJyc7XG4gICAgICBpZiAoIXJlZk5hbWUpIHJldHVybjtcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5LmhhcyhyZWZOYW1lKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZTogcmVmTmFtZSB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmJmLXJlZi1saW5rJykuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0JykgPz8gJyc7XG4gICAgICBpZiAoIXRhcmdldE5hbWUpIHJldHVybjtcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5Lmhhcyh0YXJnZXROYW1lKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZSB9KTtcbiAgICAgICAgKGVsIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNvbHZlUGVuZGluZ1JlZnMoKSB7XG4gICAgY29uc3Qgc3RpbGxQZW5kaW5nOiB0eXBlb2YgdGhpcy5wZW5kaW5nUmVmcyA9IFtdO1xuICAgIGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLnBlbmRpbmdSZWZzKSB7XG4gICAgICBpZiAodGhpcy5ibG9ja1JlZ2lzdHJ5LmhhcyhwZW5kaW5nLnRhcmdldE5hbWUpKSB7XG4gICAgICAgIHBlbmRpbmcuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RpbGxQZW5kaW5nLnB1c2gocGVuZGluZyk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBzdGlsbFBlbmRpbmc7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJpIiwiUGx1Z2luU2V0dGluZ1RhYiIsIlNldHRpbmciLCJQbHVnaW4iLCJjcmVhdGVGcmFnbWVudCJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBYU8sU0FBUyxNQUFNLEtBQUEsRUFBNEI7QUFDaEQsRUFBQSxNQUFNLEtBQUEsR0FBUSxLQUFBLENBQU0sS0FBQSxDQUFNLElBQUksQ0FBQTtBQUM5QixFQUFBLE1BQU0sU0FBdUIsRUFBQztBQUM5QixFQUFBLE1BQU0sTUFBQSx1QkFBYSxHQUFBLEVBQXdCO0FBQzNDLEVBQUEsTUFBTSxVQUFBLHVCQUFpQixHQUFBLEVBQVk7QUFHbkMsRUFBQSxNQUFNLFdBQXNCLEVBQUM7QUFDN0IsRUFBQSxLQUFBLElBQVNBLEVBQUFBLEdBQUksQ0FBQSxFQUFHQSxFQUFBQSxHQUFJLEtBQUEsQ0FBTSxRQUFRQSxFQUFBQSxFQUFBQSxFQUFLO0FBQ3JDLElBQUEsTUFBTSxJQUFBLEdBQU8sTUFBTUEsRUFBQyxDQUFBO0FBQ3BCLElBQUEsSUFBSSxDQUFDLEtBQUssSUFBQSxFQUFLLElBQUssS0FBSyxJQUFBLEVBQUssQ0FBRSxVQUFBLENBQVcsSUFBSSxDQUFBLEVBQUc7QUFDaEQsTUFBQTtBQUFBLElBQ0Y7QUFDQSxJQUFBLFFBQUEsQ0FBUyxJQUFBLENBQUs7QUFB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
