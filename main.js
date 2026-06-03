'use strict';

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

const MAIN_COLORS = [
  "#4A90D9",
  // 蓝
  "#5CB85C",
  // 绿
  "#F0AD4E",
  // 橙
  "#9B59B6",
  // 紫
  "#1ABC9C",
  // 青
  "#E74C3C"
  // 红
];
const RESERVED_COLOR = "#E0E0E0";
function getFieldColor(index, isReserved, depth = 0) {
  if (isReserved) {
    return RESERVED_COLOR;
  }
  const baseColor = MAIN_COLORS[index % MAIN_COLORS.length];
  if (depth === 0) {
    return baseColor;
  }
  return adjustBrightness(baseColor, depth * 15);
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
function renderBlockSvg(block) {
  const config = {
    totalWidth: block.width,
    isVertical: shouldUseVertical(block.children, block.width),
    boxHeight: 60,
    fontSize: 14
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
  const startY = 40;
  const availableWidth = svgWidth - 120;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;
  svg += `<text x="${startX}" y="20" font-size="${config.fontSize}" text-anchor="start" fill="#666">MSB</text>`;
  svg += `<text x="${svgWidth - 60}" y="20" font-size="${config.fontSize}" text-anchor="end" fill="#666">LSB</text>`;
  let currentX = startX;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const widthRatio = field.width / config.totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const color = getFieldColor(i, field.isReserved, 0);
    svg += renderFieldBox(field, currentX, startY, boxWidth, config.boxHeight, color, config.fontSize);
    currentX += boxWidth;
  }
  svg += "</svg>";
  return svg;
}
function renderVertical(fields, config) {
  const svgWidth = 1e3;
  const rowHeight = config.boxHeight;
  const startX = 60;
  const startY = 40;
  const boxWidth = svgWidth - 120;
  const svgHeight = startY + fields.length * rowHeight + 40;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;
  svg += `<text x="${startX}" y="20" font-size="${config.fontSize}" text-anchor="start" fill="#666">MSB</text>`;
  svg += `<text x="${startX}" y="${svgHeight - 10}" font-size="${config.fontSize}" text-anchor="start" fill="#666">LSB</text>`;
  let currentY = startY;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const color = getFieldColor(i, field.isReserved, 0);
    svg += renderFieldBox(field, startX, currentY, boxWidth, rowHeight, color, config.fontSize);
    currentY += rowHeight;
  }
  svg += "</svg>";
  return svg;
}
function renderFieldBox(field, x, y, width, height, color, fontSize) {
  let svg = "";
  const isRef = field.isReference;
  const isRsv = field.isReserved;
  const fieldName = isRsv ? "reserved" : isRef ? `@${field.refName}` : field.name;
  const strokeColor = isRef ? "#4A90D9" : "#fff";
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="${strokeColor}" stroke-width="2" rx="4" ry="4" data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ""} style="cursor:${isRef ? "pointer" : "default"}"/>`;
  const label = `${fieldName}[${field.msb}:${field.lsb}]`;
  const textX = x + width / 2;
  const textY = y + height / 2 + fontSize * 0.35;
  const textWidth = width - 16;
  const maxChars = Math.floor(textWidth / (fontSize * 0.6));
  let displayText = label;
  if (label.length > maxChars && maxChars > 3) {
    displayText = label.substring(0, maxChars - 2) + "..";
  }
  const textDecoration = isRef ? ' text-decoration="underline"' : "";
  const fillColor = isRsv ? "#888" : "#fff";
  svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ""} style="cursor:${isRef ? "pointer" : "default"}">${displayText}</text>`;
  return svg;
}

function renderBlockTable(block) {
  const rows = [];
  for (const child of block.children) {
    collectRows(child, 0, rows);
  }
  let html = '<table class="verilog-bitfield-table">';
  html += "<thead><tr>";
  html += "<th>\u5B57\u6BB5\u540D</th>";
  html += "<th>\u4F4D\u5BBD</th>";
  html += "<th>Bit \u8303\u56F4</th>";
  html += "<th>\u63CF\u8FF0</th>";
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

const DEFAULT_DATA = { defaultView: "svg" };
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
    this.registerMarkdownCodeBlockProcessor("verilog-bitfield", this.processBitfield.bind(this));
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
      text: `${name}${desc} \u7684\u5B57\u6BB5\u5B9A\u4E49\u5982\u4E0B\uFF1A`,
      cls: "verilog-bitfield-header"
    });
    const toggleBtn = this.createToggleButton(headerRow);
    const contentWrap = container.createEl("div", { cls: "verilog-bitfield-content" });
    const svgContainer = contentWrap.createEl("div", { cls: "verilog-bitfield-svg" });
    svgContainer.innerHTML = renderBlockSvg(block);
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);
    const tableContainer = contentWrap.createEl("div", { cls: "verilog-bitfield-table-container" });
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
      svgWrap.innerHTML = renderBlockSvg(entry.block);
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

module.exports = VerilogBitfieldPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrLCBQYXJzZUVycm9yLCBQYXJzZVJlc3VsdCB9IGZyb20gJy4vdHlwZXMnO1xuXG5pbnRlcmZhY2UgUmF3TGluZSB7XG4gIGxpbmVOdW06IG51bWJlcjtcbiAgaW5kZW50OiBudW1iZXI7XG4gIGNvbnRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiDop6PmnpAgVmVyaWxvZyDkvY3ln5/lrprkuYlcbiAqIOe7n+S4gOivreazle+8muavj+S4quS7o+eggeWdl+eUseS4gOS4quaIluWkmuS4qiBkZWZpbml0aW9uIGJsb2NrIOe7hOaIkFxuICog5q+P5Liq5Z2X77ya56ys5LiA6KGMIG5hbWUgd2lkdGggW2Rlc2NyaXB0aW9uXe+8jOWtkOWtl+autemAmui/h+e8qei/m+W1jOWll1xuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoaW5wdXQ6IHN0cmluZyk6IFBhcnNlUmVzdWx0IHtcbiAgY29uc3QgbGluZXMgPSBpbnB1dC5zcGxpdCgnXFxuJyk7XG4gIGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG4gIGNvbnN0IGJsb2NrcyA9IG5ldyBNYXA8c3RyaW5nLCBGaWVsZEJsb2NrPigpO1xuICBjb25zdCBibG9ja05hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgLy8g6aKE5aSE55CG77ya6L+H5ruk56m66KGM5ZKM5rOo6YeKXG4gIGNvbnN0IHJhd0xpbmVzOiBSYXdMaW5lW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcbiAgICBpZiAoIWxpbmUudHJpbSgpIHx8IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy8vJykpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICByYXdMaW5lcy5wdXNoKHtcbiAgICAgIGxpbmVOdW06IGkgKyAxLFxuICAgICAgaW5kZW50OiBsaW5lLnNlYXJjaCgvXFxTLyksXG4gICAgICBjb250ZW50OiBsaW5lLnRyaW0oKVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHJhd0xpbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcnM6IFt7IGxpbmU6IDAsIG1lc3NhZ2U6ICfovpPlhaXkuLrnqbonIH1dIH07XG4gIH1cblxuICAvLyDpgJDooYzop6PmnpDvvIxpbmRlbnQ9MCDnmoTooYzkvZzkuLrlnZflpLRcbiAgbGV0IGkgPSAwO1xuICB3aGlsZSAoaSA8IHJhd0xpbmVzLmxlbmd0aCkge1xuICAgIGNvbnN0IHJsID0gcmF3TGluZXNbaV07XG5cbiAgICBpZiAocmwuaW5kZW50ICE9PSAwKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDmhI/lpJbnmoTnvKnov5vooYw6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihcXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcblxuICAgIGlmIChibG9ja05hbWVzLmhhcyhuYW1lKSkge1xuICAgICAgZXJyb3JzLnB1c2goe1xuICAgICAgICBsaW5lOiBybC5saW5lTnVtLFxuICAgICAgICBtZXNzYWdlOiBg6YeN5aSN5a6a5LmJOiBcIiR7bmFtZX1cImAsXG4gICAgICAgIHN1Z2dlc3Rpb246ICflkIznrJTorrDlhoXlnZflkI3lv4XpobvllK/kuIAnXG4gICAgICB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBibG9ja05hbWVzLmFkZChuYW1lKTtcblxuICAgIGNvbnN0IGJsb2NrOiBGaWVsZEJsb2NrID0ge1xuICAgICAgbmFtZSxcbiAgICAgIHdpZHRoOiBwYXJzZUludCh3aWR0aFN0ciwgMTApLFxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuXG4gICAgLy8g5pS26ZuG5a2Q5a2X5q6177yI6L+e57ut55qE57yp6L+b6KGM77yJXG4gICAgaSsrO1xuICAgIGNvbnN0IGNoaWxkcmVuU3RhcnQgPSBpO1xuICAgIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoICYmIHJhd0xpbmVzW2ldLmluZGVudCA+IDApIHtcbiAgICAgIGkrKztcbiAgICB9XG4gICAgY29uc3QgY2hpbGRyZW5MaW5lcyA9IHJhd0xpbmVzLnNsaWNlKGNoaWxkcmVuU3RhcnQsIGkpO1xuXG4gICAgaWYgKGNoaWxkcmVuTGluZXMubGVuZ3RoID4gMCkge1xuICAgICAgcGFyc2VDaGlsZHJlbihjaGlsZHJlbkxpbmVzLCBibG9jay5jaGlsZHJlbiwgZXJyb3JzLCAwLCBuYW1lKTtcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpO1xuICAgICAgYXV0b0ZpbGxSZXNlcnZlZChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpO1xuICAgIH1cblxuICAgIC8vIOmqjOivgeS9jeWuvVxuICAgIHZhbGlkYXRlQml0V2lkdGhzKGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMpO1xuXG4gICAgYmxvY2tzLnNldChuYW1lLCBibG9jayk7XG4gIH1cblxuICBpZiAoYmxvY2tzLnNpemUgPT09IDApIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn5pyq5om+5Yiw5pyJ5pWI55qE5a6a5LmJ5Z2XJyB9XSB9O1xuICB9XG5cbiAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xuICB9XG5cbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmxvY2tzIH07XG59XG5cbi8qKlxuICog6Kej5p6Q5a2Q5a2X5q615YiX6KGoXG4gKi9cbmZ1bmN0aW9uIHBhcnNlQ2hpbGRyZW4oXG4gIGxpbmVzOiBSYXdMaW5lW10sXG4gIGNoaWxkcmVuOiBCaXRGaWVsZFtdLFxuICBlcnJvcnM6IFBhcnNlRXJyb3JbXSxcbiAgYmFzZUluZGVudDogbnVtYmVyLFxuICBwYXJlbnROYW1lOiBzdHJpbmdcbik6IHZvaWQge1xuICBjb25zdCBzdGFjazogeyBmaWVsZDogQml0RmllbGQ7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qgcmwgb2YgbGluZXMpIHtcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oQD9cXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcbiAgICBjb25zdCB3aWR0aCA9IHBhcnNlSW50KHdpZHRoU3RyLCAxMCk7XG4gICAgY29uc3QgaXNSZWZlcmVuY2UgPSBuYW1lLnN0YXJ0c1dpdGgoJ0AnKTtcbiAgICBjb25zdCByZWZOYW1lID0gaXNSZWZlcmVuY2UgPyBuYW1lLnNsaWNlKDEpIDogbmFtZTtcblxuICAgIC8vIOW1jOWll+Wxgue6p+ajgOafpVxuICAgIGNvbnN0IGRlcHRoID0gTWF0aC5mbG9vcigocmwuaW5kZW50IC0gYmFzZUluZGVudCkgLyAyKSArIDE7XG4gICAgaWYgKGRlcHRoID4gNSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5bWM5aWX5bGC57qn6L+H5rexICgke2RlcHRofSDlsYIp77yM5pyA5aSaIDUg5bGCYCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkOiBCaXRGaWVsZCA9IHtcbiAgICAgIG5hbWU6IHJlZk5hbWUsXG4gICAgICB3aWR0aCxcbiAgICAgIG1zYjogMCxcbiAgICAgIGxzYjogMCxcbiAgICAgIGRlc2NyaXB0aW9uOiBkZXNjPy50cmltKCkgfHwgdW5kZWZpbmVkLFxuICAgICAgaXNSZXNlcnZlZDogbmFtZS50b0xvd2VyQ2FzZSgpID09PSAncmVzZXJ2ZWQnLFxuICAgICAgaXNSZWZlcmVuY2UsXG4gICAgICByZWZOYW1lOiBpc1JlZmVyZW5jZSA/IHJlZk5hbWUgOiB1bmRlZmluZWQsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuXG4gICAgLy8g5om+54i25a2X5q6177ya5LuO5qCI5Lit5om+57yp6L+b5q+U5b2T5YmN5bCP55qE5pyA5ZCO5LiA5LiqXG4gICAgbGV0IHBhcmVudDogQml0RmllbGQgfCBudWxsID0gbnVsbDtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdG9wID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XG4gICAgICBpZiAodG9wLmluZGVudCA8IHJsLmluZGVudCkge1xuICAgICAgICBwYXJlbnQgPSB0b3AuZmllbGQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgc3RhY2sucG9wKCk7XG4gICAgfVxuXG4gICAgaWYgKHBhcmVudCkge1xuICAgICAgaWYgKCFwYXJlbnQuY2hpbGRyZW4pIHBhcmVudC5jaGlsZHJlbiA9IFtdO1xuICAgICAgcGFyZW50LmNoaWxkcmVuLnB1c2goZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGlsZHJlbi5wdXNoKGZpZWxkKTtcbiAgICB9XG5cbiAgICBzdGFjay5wdXNoKHsgZmllbGQsIGluZGVudDogcmwuaW5kZW50IH0pO1xuICB9XG59XG5cbi8qKlxuICog6K6h566XIGJpdCDojIPlm7RcbiAqIOmdoOWJjeWumuS5ieeahOaYryBMU0LvvIzpnaDlkI7lrprkuYnnmoTmmK8gTVNCXG4gKi9cbmZ1bmN0aW9uIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IGN1cnJlbnRMc2IgPSAwO1xuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGZpZWxkLmxzYiA9IGN1cnJlbnRMc2I7XG4gICAgZmllbGQubXNiID0gY3VycmVudExzYiArIGZpZWxkLndpZHRoIC0gMTtcbiAgICBjdXJyZW50THNiID0gZmllbGQubXNiICsgMTtcbiAgICBpZiAoIWZpZWxkLmlzUmVmZXJlbmNlICYmIGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZC5jaGlsZHJlbiwgZmllbGQud2lkdGgpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIOW9k+WtkOWtl+auteaAu+S9jeWuveS4jeWkn+aXtu+8jOWcqCBNU0Ig56uv6Ieq5Yqo6KGlIHJlc2VydmVkXG4gKi9cbmZ1bmN0aW9uIGF1dG9GaWxsUmVzZXJ2ZWQoZmllbGRzOiBCaXRGaWVsZFtdLCBwYXJlbnRXaWR0aDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHRvdGFsQ2hpbGRXaWR0aCA9IGZpZWxkcy5yZWR1Y2UoKHN1bSwgZikgPT4gc3VtICsgZi53aWR0aCwgMCk7XG4gIGNvbnN0IHJlbWFpbmluZyA9IHBhcmVudFdpZHRoIC0gdG90YWxDaGlsZFdpZHRoO1xuICBpZiAocmVtYWluaW5nID4gMCkge1xuICAgIGNvbnN0IHJlc2VydmVkOiBCaXRGaWVsZCA9IHtcbiAgICAgIG5hbWU6ICdyZXNlcnZlZCcsXG4gICAgICB3aWR0aDogcmVtYWluaW5nLFxuICAgICAgbXNiOiAwLFxuICAgICAgbHNiOiAwLFxuICAgICAgaXNSZXNlcnZlZDogdHJ1ZSxcbiAgICAgIGlzUmVmZXJlbmNlOiBmYWxzZSxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG4gICAgZmllbGRzLnB1c2gocmVzZXJ2ZWQpO1xuICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHMsIHBhcmVudFdpZHRoKTtcbiAgfVxufVxuXG4vKipcbiAqIOmqjOivgeS9jeWuvVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZUJpdFdpZHRocyhmaWVsZHM6IEJpdEZpZWxkW10sIGVycm9yczogUGFyc2VFcnJvcltdKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcbiAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY2hpbGRyZW5XaWR0aCA9IGNoaWxkcmVuLnJlZHVjZSgoc3VtLCBjaGlsZCkgPT4gc3VtICsgY2hpbGQud2lkdGgsIDApO1xuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xuICAgICAgICBlcnJvcnMucHVzaCh7XG4gICAgICAgICAgbGluZTogMCxcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXG4gICAgICAgICAgc3VnZ2VzdGlvbjogYOeItuWtl+autTogJHtmaWVsZC53aWR0aH0tYml0LCDlrZDlrZfmrrXmgLvlkow6ICR7Y2hpbGRyZW5XaWR0aH0tYml0LCDliankvZnnqbrpl7Q6ICR7ZmllbGQud2lkdGggLSBjaGlsZHJlbldpZHRofS1iaXRgXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdmFsaWRhdGVCaXRXaWR0aHMoY2hpbGRyZW4sIGVycm9ycyk7XG4gICAgfVxuICB9XG59XG4iLCIvKipcbiAqIOminOiJsuaWueahiFxuICovXG5cbi8vIOS4u+iJsu+8iOmhtuWxguWtl+aute+8iVxuY29uc3QgTUFJTl9DT0xPUlMgPSBbXG4gICcjNEE5MEQ5JywgLy8g6JOdXG4gICcjNUNCODVDJywgLy8g57u/XG4gICcjRjBBRDRFJywgLy8g5qmZXG4gICcjOUI1OUI2JywgLy8g57SrXG4gICcjMUFCQzlDJywgLy8g6Z2SXG4gICcjRTc0QzNDJywgLy8g57qiXG5dO1xuXG4vLyDkv53nlZnoibJcbmNvbnN0IFJFU0VSVkVEX0NPTE9SID0gJyNFMEUwRTAnO1xuXG4vKipcbiAqIOiOt+WPluWtl+auteminOiJslxuICogQHBhcmFtIGluZGV4IOWtl+autee0ouW8lVxuICogQHBhcmFtIGlzUmVzZXJ2ZWQg5piv5ZCm5Li6IHJlc2VydmVkXG4gKiBAcGFyYW0gZGVwdGgg5bWM5aWX5rex5bqm77yIMCA9IOmhtuWxgu+8iVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmllbGRDb2xvcihpbmRleDogbnVtYmVyLCBpc1Jlc2VydmVkOiBib29sZWFuLCBkZXB0aDogbnVtYmVyID0gMCk6IHN0cmluZyB7XG4gIGlmIChpc1Jlc2VydmVkKSB7XG4gICAgcmV0dXJuIFJFU0VSVkVEX0NPTE9SO1xuICB9XG5cbiAgY29uc3QgYmFzZUNvbG9yID0gTUFJTl9DT0xPUlNbaW5kZXggJSBNQUlOX0NPTE9SUy5sZW5ndGhdO1xuXG4gIGlmIChkZXB0aCA9PT0gMCkge1xuICAgIHJldHVybiBiYXNlQ29sb3I7XG4gIH1cblxuICAvLyDlrZDlrZfmrrXvvJrln7rkuo7niLboibLosIPmlbTkuq7luqZcbiAgcmV0dXJuIGFkanVzdEJyaWdodG5lc3MoYmFzZUNvbG9yLCBkZXB0aCAqIDE1KTtcbn1cblxuLyoqXG4gKiDosIPmlbTpopzoibLkuq7luqZcbiAqIEBwYXJhbSBoZXgg5Y2B5YWt6L+b5Yi26aKc6ImyXG4gKiBAcGFyYW0gcGVyY2VudCDkuq7luqbosIPmlbTnmb7liIbmr5TvvIjmraPmlbDlj5jkuq7vvIzotJ/mlbDlj5jmmpfvvIlcbiAqL1xuZnVuY3Rpb24gYWRqdXN0QnJpZ2h0bmVzcyhoZXg6IHN0cmluZywgcGVyY2VudDogbnVtYmVyKTogc3RyaW5nIHtcbiAgLy8g56e76ZmkICMg5YmN57yAXG4gIGhleCA9IGhleC5yZXBsYWNlKCcjJywgJycpO1xuXG4gIC8vIOino+aekCBSR0JcbiAgY29uc3QgciA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMCwgMiksIDE2KTtcbiAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMiwgNCksIDE2KTtcbiAgY29uc3QgYiA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoNCwgNiksIDE2KTtcblxuICAvLyDosIPmlbTkuq7luqZcbiAgY29uc3QgYWRqdXN0ID0gKGNoYW5uZWw6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IGFkanVzdGVkID0gTWF0aC5yb3VuZChjaGFubmVsICsgKDI1NSAtIGNoYW5uZWwpICogKHBlcmNlbnQgLyAxMDApKTtcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xuICB9O1xuXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XG4gIGNvbnN0IG5ld0cgPSBhZGp1c3QoZyk7XG4gIGNvbnN0IG5ld0IgPSBhZGp1c3QoYik7XG5cbiAgLy8g6L2s5o2i5Zue5Y2B5YWt6L+b5Yi2XG4gIGNvbnN0IHRvSGV4ID0gKG46IG51bWJlcikgPT4gbi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKTtcbiAgcmV0dXJuIGAjJHt0b0hleChuZXdSKX0ke3RvSGV4KG5ld0cpfSR7dG9IZXgobmV3Qil9YDtcbn1cblxuLyoqXG4gKiDojrflj5bpopzoibLmlbDnu4TvvIjnlKjkuo7osIPor5XvvIlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvbG9yUGFsZXR0ZSgpOiBzdHJpbmdbXSB7XG4gIHJldHVybiBNQUlOX0NPTE9SUztcbn1cbiIsImltcG9ydCB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBnZXRGaWVsZENvbG9yIH0gZnJvbSAnLi9jb2xvcnMnO1xuXG4vKipcbiAqIFNWRyDmuLLmn5PphY3nva5cbiAqL1xuaW50ZXJmYWNlIFJlbmRlckNvbmZpZyB7XG4gIC8qKiDmgLvkvY3lrr0gKi9cbiAgdG90YWxXaWR0aDogbnVtYmVyO1xuICAvKiog5piv5ZCm57q15ZCR5o6S5YiXICovXG4gIGlzVmVydGljYWw6IGJvb2xlYW47XG4gIC8qKiDlrZfmrrXmoYbpq5jluqYgKi9cbiAgYm94SGVpZ2h0OiBudW1iZXI7XG4gIC8qKiDlrZfkvZPlpKflsI8gKi9cbiAgZm9udFNpemU6IG51bWJlcjtcbn1cblxuLyoqXG4gKiDorqHnrpflrZfmrrXmoIfnrb7miYDpnIDnmoTmnIDlsI/lrr3luqbvvIjlg4/ntKDvvIlcbiAqL1xuZnVuY3Rpb24gY2FsY01pbkxhYmVsV2lkdGgobGFiZWw6IHN0cmluZywgZm9udFNpemU6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBsYWJlbC5sZW5ndGggKiBmb250U2l6ZSAqIDAuNiArIDIwO1xufVxuXG4vKipcbiAqIOWIpOaWreaYr+WQpuW6lOS9v+eUqOe6teWQkeW4g+WxgFxuICovXG5mdW5jdGlvbiBzaG91bGRVc2VWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIHRvdGFsV2lkdGg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAodG90YWxXaWR0aCA+IDY0KSByZXR1cm4gdHJ1ZTtcblxuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZC5pc1Jlc2VydmVkID8gJ3Jlc2VydmVkJyA6IChmaWVsZC5pc1JlZmVyZW5jZSA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcbiAgICBjb25zdCBsYWJlbCA9IGAke2ZpZWxkTmFtZX1bJHtmaWVsZC5tc2J9OiR7ZmllbGQubHNifV1gO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIHRvdGFsV2lkdGg7XG4gICAgY29uc3QgYm94V2lkdGggPSB3aWR0aFJhdGlvICogYXZhaWxhYmxlV2lkdGg7XG4gICAgY29uc3QgbWluV2lkdGggPSBjYWxjTWluTGFiZWxXaWR0aChsYWJlbCwgMTQpO1xuICAgIGlmIChib3hXaWR0aCA8IG1pbldpZHRoKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICog5riy5p+T5Z2X55qEIFNWRyDkvY3ln5/lm75cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrU3ZnKGJsb2NrOiBGaWVsZEJsb2NrKTogc3RyaW5nIHtcbiAgY29uc3QgY29uZmlnOiBSZW5kZXJDb25maWcgPSB7XG4gICAgdG90YWxXaWR0aDogYmxvY2sud2lkdGgsXG4gICAgaXNWZXJ0aWNhbDogc2hvdWxkVXNlVmVydGljYWwoYmxvY2suY2hpbGRyZW4sIGJsb2NrLndpZHRoKSxcbiAgICBib3hIZWlnaHQ6IDYwLFxuICAgIGZvbnRTaXplOiAxNFxuICB9O1xuXG4gIGlmIChjb25maWcuaXNWZXJ0aWNhbCkge1xuICAgIHJldHVybiByZW5kZXJWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgY29uZmlnKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcmVuZGVySG9yaXpvbnRhbChibG9jay5jaGlsZHJlbiwgY29uZmlnKTtcbiAgfVxufVxuXG4vKipcbiAqIOaoquWQkea4suafk1xuICovXG5mdW5jdGlvbiByZW5kZXJIb3Jpem9udGFsKGZpZWxkczogQml0RmllbGRbXSwgY29uZmlnOiBSZW5kZXJDb25maWcpOiBzdHJpbmcge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IGNvbmZpZy5ib3hIZWlnaHQgKyA2MDtcbiAgY29uc3Qgc3RhcnRYID0gNjA7XG4gIGNvbnN0IHN0YXJ0WSA9IDQwO1xuICBjb25zdCBhdmFpbGFibGVXaWR0aCA9IHN2Z1dpZHRoIC0gMTIwO1xuXG4gIGxldCBzdmcgPSBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgdmlld0JveD1cIjAgMCAke3N2Z1dpZHRofSAke3N2Z0hlaWdodH1cIiB3aWR0aD1cIjEwMCVcIj5gO1xuXG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7c3RhcnRYfVwiIHk9XCIyMFwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwic3RhcnRcIiBmaWxsPVwiIzY2NlwiPk1TQjwvdGV4dD5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke3N2Z1dpZHRoIC0gNjB9XCIgeT1cIjIwXCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJlbmRcIiBmaWxsPVwiIzY2NlwiPkxTQjwvdGV4dD5gO1xuXG4gIGxldCBjdXJyZW50WCA9IHN0YXJ0WDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCB3aWR0aFJhdGlvID0gZmllbGQud2lkdGggLyBjb25maWcudG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCk7XG4gICAgc3ZnICs9IHJlbmRlckZpZWxkQm94KGZpZWxkLCBjdXJyZW50WCwgc3RhcnRZLCBib3hXaWR0aCwgY29uZmlnLmJveEhlaWdodCwgY29sb3IsIGNvbmZpZy5mb250U2l6ZSk7XG4gICAgY3VycmVudFggKz0gYm94V2lkdGg7XG4gIH1cblxuICBzdmcgKz0gJzwvc3ZnPic7XG4gIHJldHVybiBzdmc7XG59XG5cbi8qKlxuICog57q15ZCR5riy5p+T77yIdmlld0JveCDlrr3luqbkuI7mqKrlkJHkuIDoh7TvvIzkv53mjIHlrZfkvZPop4bop4nlpKflsI/kuIDoh7TvvIlcbiAqL1xuZnVuY3Rpb24gcmVuZGVyVmVydGljYWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgcm93SGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodDtcbiAgY29uc3Qgc3RhcnRYID0gNjA7XG4gIGNvbnN0IHN0YXJ0WSA9IDQwO1xuICBjb25zdCBib3hXaWR0aCA9IHN2Z1dpZHRoIC0gMTIwO1xuICBjb25zdCBzdmdIZWlnaHQgPSBzdGFydFkgKyBmaWVsZHMubGVuZ3RoICogcm93SGVpZ2h0ICsgNDA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtzdGFydFh9XCIgeT1cIjIwXCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJzdGFydFwiIGZpbGw9XCIjNjY2XCI+TVNCPC90ZXh0PmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7c3RhcnRYfVwiIHk9XCIke3N2Z0hlaWdodCAtIDEwfVwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwic3RhcnRcIiBmaWxsPVwiIzY2NlwiPkxTQjwvdGV4dD5gO1xuXG4gIGxldCBjdXJyZW50WSA9IHN0YXJ0WTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICBjb25zdCBjb2xvciA9IGdldEZpZWxkQ29sb3IoaSwgZmllbGQuaXNSZXNlcnZlZCwgMCk7XG4gICAgc3ZnICs9IHJlbmRlckZpZWxkQm94KGZpZWxkLCBzdGFydFgsIGN1cnJlbnRZLCBib3hXaWR0aCwgcm93SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplKTtcbiAgICBjdXJyZW50WSArPSByb3dIZWlnaHQ7XG4gIH1cblxuICBzdmcgKz0gJzwvc3ZnPic7XG4gIHJldHVybiBzdmc7XG59XG5cbi8qKlxuICog5riy5p+T5a2X5q615qGGXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckZpZWxkQm94KFxuICBmaWVsZDogQml0RmllbGQsXG4gIHg6IG51bWJlcixcbiAgeTogbnVtYmVyLFxuICB3aWR0aDogbnVtYmVyLFxuICBoZWlnaHQ6IG51bWJlcixcbiAgY29sb3I6IHN0cmluZyxcbiAgZm9udFNpemU6IG51bWJlclxuKTogc3RyaW5nIHtcbiAgbGV0IHN2ZyA9ICcnO1xuICBjb25zdCBpc1JlZiA9IGZpZWxkLmlzUmVmZXJlbmNlO1xuICBjb25zdCBpc1JzdiA9IGZpZWxkLmlzUmVzZXJ2ZWQ7XG4gIGNvbnN0IGZpZWxkTmFtZSA9IGlzUnN2ID8gJ3Jlc2VydmVkJyA6IChpc1JlZiA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcblxuICBjb25zdCBzdHJva2VEYXNoID0gaXNSZWYgPyAnIHN0cm9rZS1kYXNoYXJyYXk9XCI2LDNcIicgOiAnJztcbiAgY29uc3Qgc3Ryb2tlQ29sb3IgPSBpc1JlZiA/ICcjNEE5MEQ5JyA6ICcjZmZmJztcbiAgc3ZnICs9IGA8cmVjdCB4PVwiJHt4fVwiIHk9XCIke3l9XCIgd2lkdGg9XCIke3dpZHRofVwiIGhlaWdodD1cIiR7aGVpZ2h0fVwiIGZpbGw9XCIke2NvbG9yfVwiIHN0cm9rZT1cIiR7c3Ryb2tlQ29sb3J9XCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHJ4PVwiNFwiIHJ5PVwiNFwiIGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiLz5gO1xuXG4gIGNvbnN0IGxhYmVsID0gYCR7ZmllbGROYW1lfVske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XG4gIGNvbnN0IHRleHRYID0geCArIHdpZHRoIC8gMjtcbiAgY29uc3QgdGV4dFkgPSB5ICsgaGVpZ2h0IC8gMiArIGZvbnRTaXplICogMC4zNTtcbiAgY29uc3QgdGV4dFdpZHRoID0gd2lkdGggLSAxNjtcbiAgY29uc3QgbWF4Q2hhcnMgPSBNYXRoLmZsb29yKHRleHRXaWR0aCAvIChmb250U2l6ZSAqIDAuNikpO1xuXG4gIGxldCBkaXNwbGF5VGV4dCA9IGxhYmVsO1xuICBpZiAobGFiZWwubGVuZ3RoID4gbWF4Q2hhcnMgJiYgbWF4Q2hhcnMgPiAzKSB7XG4gICAgZGlzcGxheVRleHQgPSBsYWJlbC5zdWJzdHJpbmcoMCwgbWF4Q2hhcnMgLSAyKSArICcuLic7XG4gIH1cblxuICBjb25zdCB0ZXh0RGVjb3JhdGlvbiA9IGlzUmVmID8gJyB0ZXh0LWRlY29yYXRpb249XCJ1bmRlcmxpbmVcIicgOiAnJztcbiAgY29uc3QgZmlsbENvbG9yID0gaXNSc3YgPyAnIzg4OCcgOiAnI2ZmZic7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7dGV4dFh9XCIgeT1cIiR7dGV4dFl9XCIgZm9udC1zaXplPVwiJHtmb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGRvbWluYW50LWJhc2VsaW5lPVwiY2VudHJhbFwiIGZpbGw9XCIke2ZpbGxDb2xvcn1cIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiJHt0ZXh0RGVjb3JhdGlvbn0gZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCI+JHtkaXNwbGF5VGV4dH08L3RleHQ+YDtcblxuICByZXR1cm4gc3ZnO1xufVxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiDmuLLmn5PlnZfnmoQgSFRNTCDooajmoLxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrVGFibGUoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xuICBjb25zdCByb3dzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY2hpbGRyZW4pIHtcbiAgICBjb2xsZWN0Um93cyhjaGlsZCwgMCwgcm93cyk7XG4gIH1cblxuICBsZXQgaHRtbCA9ICc8dGFibGUgY2xhc3M9XCJ2ZXJpbG9nLWJpdGZpZWxkLXRhYmxlXCI+JztcbiAgaHRtbCArPSAnPHRoZWFkPjx0cj4nO1xuICBodG1sICs9ICc8dGg+5a2X5q615ZCNPC90aD4nO1xuICBodG1sICs9ICc8dGg+5L2N5a69PC90aD4nO1xuICBodG1sICs9ICc8dGg+Qml0IOiMg+WbtDwvdGg+JztcbiAgaHRtbCArPSAnPHRoPuaPj+i/sDwvdGg+JztcbiAgaHRtbCArPSAnPC90cj48L3RoZWFkPic7XG4gIGh0bWwgKz0gJzx0Ym9keT4nO1xuICBodG1sICs9IHJvd3Muam9pbignJyk7XG4gIGh0bWwgKz0gJzwvdGJvZHk+PC90YWJsZT4nO1xuICByZXR1cm4gaHRtbDtcbn1cblxuLyoqXG4gKiDpgJLlvZLmlLbpm4booajmoLzooYxcbiAqL1xuZnVuY3Rpb24gY29sbGVjdFJvd3MoZmllbGQ6IEJpdEZpZWxkLCBkZXB0aDogbnVtYmVyLCByb3dzOiBzdHJpbmdbXSk6IHZvaWQge1xuICBjb25zdCBpbmRlbnQgPSBkZXB0aCA+IDAgPyAnJm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Jy5yZXBlYXQoZGVwdGgpIDogJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgbmFtZSA9IGlzUnN2ID8gJ3Jlc2VydmVkJyA6IChpc1JlZiA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcbiAgY29uc3QgYml0UmFuZ2UgPSBgWyR7ZmllbGQubXNifToke2ZpZWxkLmxzYn1dYDtcbiAgY29uc3QgZGVzY3JpcHRpb24gPSBmaWVsZC5kZXNjcmlwdGlvbiB8fCAnJztcblxuICBsZXQgcm93Q2xhc3MgPSAnJztcbiAgaWYgKGlzUnN2KSByb3dDbGFzcyA9ICcgY2xhc3M9XCJyZXNlcnZlZC1yb3dcIic7XG4gIGVsc2UgaWYgKGlzUmVmKSByb3dDbGFzcyA9ICcgY2xhc3M9XCJyZWYtY2hpbGRcIic7XG5cbiAgY29uc3QgbmFtZUNlbGwgPSBpc1JlZlxuICAgID8gYDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJiZi1yZWYtbGlua1wiIGRhdGEtdGFyZ2V0PVwiJHtmaWVsZC5yZWZOYW1lfVwiPiR7aW5kZW50fSR7bmFtZX08L2E+YFxuICAgIDogYCR7aW5kZW50fSR7bmFtZX1gO1xuXG4gIHJvd3MucHVzaChgPHRyJHtyb3dDbGFzc30+YCk7XG4gIHJvd3MucHVzaChgPHRkPiR7bmFtZUNlbGx9PC90ZD5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtmaWVsZC53aWR0aH08L3RkPmApO1xuICByb3dzLnB1c2goYDx0ZD4ke2JpdFJhbmdlfTwvdGQ+YCk7XG4gIHJvd3MucHVzaChgPHRkPiR7ZGVzY3JpcHRpb259PC90ZD5gKTtcbiAgcm93cy5wdXNoKCc8L3RyPicpO1xuXG4gIGlmIChmaWVsZC5jaGlsZHJlbiAmJiBmaWVsZC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBmaWVsZC5jaGlsZHJlbikge1xuICAgICAgY29sbGVjdFJvd3MoY2hpbGQsIGRlcHRoICsgMSwgcm93cyk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW4sIE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4vcGFyc2VyJztcbmltcG9ydCB7IHJlbmRlckJsb2NrU3ZnIH0gZnJvbSAnLi9zdmdSZW5kZXJlcic7XG5pbXBvcnQgeyByZW5kZXJCbG9ja1RhYmxlIH0gZnJvbSAnLi90YWJsZVJlbmRlcmVyJztcbmltcG9ydCB7IFJlZ2lzdHJ5RW50cnksIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcblxuaW50ZXJmYWNlIFBsdWdpbkRhdGEge1xuICBkZWZhdWx0Vmlldz86ICdzdmcnIHwgJ3RhYmxlJztcbn1cblxuY29uc3QgREVGQVVMVF9EQVRBOiBQbHVnaW5EYXRhID0geyBkZWZhdWx0VmlldzogJ3N2ZycgfTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVmVyaWxvZ0JpdGZpZWxkUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcHJpdmF0ZSBibG9ja1JlZ2lzdHJ5OiBNYXA8c3RyaW5nLCBSZWdpc3RyeUVudHJ5PiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSBwZW5kaW5nUmVmczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgdGFyZ2V0TmFtZTogc3RyaW5nIH1bXSA9IFtdO1xuICBwcml2YXRlIGN1cnJlbnROb3RlUGF0aDogc3RyaW5nID0gJyc7XG4gIHByaXZhdGUgYWN0aXZlVG9vbHRpcDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB0b29sdGlwUmVtb3ZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcGx1Z2luRGF0YTogUGx1Z2luRGF0YSA9IERFRkFVTFRfREFUQTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW5EYXRhID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9EQVRBLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcigndmVyaWxvZy1iaXRmaWVsZCcsIHRoaXMucHJvY2Vzc0JpdGZpZWxkLmJpbmQodGhpcykpO1xuICB9XG5cbiAgb251bmxvYWQoKSB7XG4gICAgdGhpcy5ibG9ja1JlZ2lzdHJ5LmNsZWFyKCk7XG4gICAgdGhpcy5wZW5kaW5nUmVmcyA9IFtdO1xuICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuICB9XG5cbiAgYXN5bmMgcHJvY2Vzc0JpdGZpZWxkKHNvdXJjZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQsIGN0eDogTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCkge1xuICAgIHRoaXMuY3VycmVudE5vdGVQYXRoID0gY3R4LnNvdXJjZVBhdGggfHwgJyc7XG4gICAgY29uc3QgcmVzdWx0ID0gcGFyc2Uoc291cmNlKTtcblxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgIHRoaXMucmVuZGVyRXJyb3JzKGVsLCByZXN1bHQuZXJyb3JzIHx8IFtdKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBibG9ja10gb2YgcmVzdWx0LmJsb2NrcyEpIHtcbiAgICAgIHRoaXMucmVuZGVyQmxvY2sobmFtZSwgYmxvY2ssIGVsKTtcbiAgICB9XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMucmVzb2x2ZVBlbmRpbmdSZWZzKCksIDUwKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyQmxvY2sobmFtZTogc3RyaW5nLCBibG9jazogRmllbGRCbG9jaywgcGFyZW50RWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgY29udGFpbmVyID0gcGFyZW50RWwuY3JlYXRlRWwoJ2RpdicsIHtcbiAgICAgIGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtY29udGFpbmVyJyxcbiAgICAgIGF0dHI6IHsgaWQ6IGBiZjoke25hbWV9YCB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBoZWFkZXJSb3cgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1oZWFkZXItcm93JyB9KTtcbiAgICBjb25zdCBkZXNjID0gYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2Jsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcbiAgICBoZWFkZXJSb3cuY3JlYXRlRWwoJ3NwYW4nLCB7XG4gICAgICB0ZXh0OiBgJHtuYW1lfSR7ZGVzY30g55qE5a2X5q615a6a5LmJ5aaC5LiL77yaYCxcbiAgICAgIGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtaGVhZGVyJ1xuICAgIH0pO1xuICAgIGNvbnN0IHRvZ2dsZUJ0biA9IHRoaXMuY3JlYXRlVG9nZ2xlQnV0dG9uKGhlYWRlclJvdyk7XG5cbiAgICBjb25zdCBjb250ZW50V3JhcCA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWNvbnRlbnQnIH0pO1xuICAgIGNvbnN0IHN2Z0NvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtc3ZnJyB9KTtcbiAgICBzdmdDb250YWluZXIuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tTdmcoYmxvY2spO1xuICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLnNldHVwVG9vbHRpcEhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG5cbiAgICBjb25zdCB0YWJsZUNvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtdGFibGUtY29udGFpbmVyJyB9KTtcbiAgICB0YWJsZUNvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1RhYmxlKGJsb2NrKTtcbiAgICB0aGlzLnNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnModGFibGVDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG5cbiAgICAvLyDliJ3lp4vljJbop4blm77vvJror7vlj5bkv53lrZjnmoTlgY/lpb1cbiAgICBjb25zdCBkZWZhdWx0VmlldyA9IHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgICB0aGlzLmFwcGx5VmlldyhkZWZhdWx0VmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XG5cbiAgICAvLyDnu5HlrprliIfmjaLkuovku7ZcbiAgICB0b2dnbGVCdG4ub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGNvbnN0IHZpZXcgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScgfCBudWxsO1xuICAgICAgaWYgKHZpZXcpIHtcbiAgICAgICAgdGhpcy5hcHBseVZpZXcodmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XG4gICAgICAgIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyA9IHZpZXc7XG4gICAgICAgIHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5EYXRhKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdGhpcy5ibG9ja1JlZ2lzdHJ5LnNldChuYW1lLCB7XG4gICAgICBlbGVtZW50OiBjb250YWluZXIsXG4gICAgICBibG9jayxcbiAgICAgIG5vdGVQYXRoOiB0aGlzLmN1cnJlbnROb3RlUGF0aFxuICAgIH0pO1xuXG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyh0YWJsZUNvbnRhaW5lcik7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5Vmlldyh2aWV3OiAnc3ZnJyB8ICd0YWJsZScsIGNvbnRlbnRXcmFwOiBIVE1MRWxlbWVudCwgc3ZnRWw6IEhUTUxFbGVtZW50LCB0YWJsZUVsOiBIVE1MRWxlbWVudCwgYnRuOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRlbnRXcmFwLnNldEF0dHJpYnV0ZSgnZGF0YS12aWV3Jywgdmlldyk7XG4gICAgYnRuLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi10b2dnbGUtb3B0aW9uJykuZm9yRWFjaChvcHQgPT4ge1xuICAgICAgb3B0LmNsYXNzTGlzdC50b2dnbGUoJ2JmLXRvZ2dsZS1hY3RpdmUnLCBvcHQuZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSA9PT0gdmlldyk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVRvZ2dsZUJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IGJ0biA9IHBhcmVudC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi12aWV3LXRvZ2dsZScgfSk7XG4gICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn5L2N5Z+f5Zu+JywgY2xzOiAnYmYtdG9nZ2xlLW9wdGlvbiBiZi10b2dnbGUtc3ZnJywgYXR0cjogeyAnZGF0YS12aWV3JzogJ3N2ZycgfSB9KTtcbiAgICBidG4uY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfooajmoLwnLCBjbHM6ICdiZi10b2dnbGUtb3B0aW9uIGJmLXRvZ2dsZS10YWJsZScsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICd0YWJsZScgfSB9KTtcbiAgICByZXR1cm4gYnRuO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJFcnJvcnMoZWw6IEhUTUxFbGVtZW50LCBlcnJvcnM6IHsgbGluZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IHN1Z2dlc3Rpb24/OiBzdHJpbmcgfVtdKSB7XG4gICAgZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1lcnJvcicgfSwgKGVycm9yRWwpID0+IHtcbiAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfop6PmnpDplJnor686JyB9KTtcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XG4gICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDooYwgJHtlcnJvci5saW5lfTogJHtlcnJvci5tZXNzYWdlfWAgfSk7XG4gICAgICAgIGlmIChlcnJvci5zdWdnZXN0aW9uKSB7XG4gICAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOW7uuiurjogJHtlcnJvci5zdWdnZXN0aW9ufWAsIGNsczogJ3N1Z2dlc3Rpb24nIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyDilIDilIDilIAg54K55Ye76Lez6L2sIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XG4gICAgICAgIGlmIChyZWZOYW1lKSB0aGlzLnNjcm9sbFRvQmxvY2socmVmTmFtZSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2Nyb2xsVG9CbG9jayhibG9ja05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHJldHVybjtcbiAgICBlbnRyeS5lbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgZW50cnkuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdiZi1oaWdobGlnaHQnKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtaGlnaGxpZ2h0JyksIDE1MDApO1xuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOaCrOa1riB0b29sdGlwIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAvLyDpvKDmoIflm57liLDmupDlhYPntKDkuIrvvIzlj5bmtojlvoXliKDpmaTlrprml7blmahcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcbiAgICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Vmlld0ZvckJsb2NrKHJlZk5hbWUpO1xuICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY2hlZHVsZVRvb2x0aXBSZW1vdmUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xuICAgICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcbiAgICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqIOiOt+WPluiiq+W8leeUqOWdl+iHqui6q+eahOinhuWbvueKtuaAge+8jOS4jeWtmOWcqOWImeeUqOm7mOiupOWBj+WlvSAqL1xuICBwcml2YXRlIGdldFZpZXdGb3JCbG9jayhibG9ja05hbWU6IHN0cmluZyk6ICdzdmcnIHwgJ3RhYmxlJyB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKGVudHJ5KSB7XG4gICAgICBjb25zdCBjb250ZW50V3JhcCA9IGVudHJ5LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLnZlcmlsb2ctYml0ZmllbGQtY29udGVudCcpO1xuICAgICAgY29uc3QgdmlldyA9IGNvbnRlbnRXcmFwPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmICh2aWV3KSByZXR1cm4gdmlldztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCkge1xuICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICB9LCAyMDApO1xuICB9XG5cbiAgcHJpdmF0ZSBzaG93VG9vbHRpcChibG9ja05hbWU6IHN0cmluZywgbW91c2VYOiBudW1iZXIsIG1vdXNlWTogbnVtYmVyLCB2aWV3OiAnc3ZnJyB8ICd0YWJsZScpIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcbiAgICBpZiAoIWVudHJ5KSByZXR1cm47XG5cbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcblxuICAgIGNvbnN0IHRvb2x0aXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0b29sdGlwLmNsYXNzTmFtZSA9ICdiZi10b29sdGlwJztcblxuICAgIGNvbnN0IGRlc2MgPSBlbnRyeS5ibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7ZW50cnkuYmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGAke2Jsb2NrTmFtZX0ke2Rlc2N9YCwgY2xzOiAnYmYtdG9vbHRpcC1oZWFkZXInIH0pO1xuXG4gICAgaWYgKHZpZXcgPT09ICdzdmcnKSB7XG4gICAgICBjb25zdCBzdmdXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXN2ZycgfSk7XG4gICAgICBzdmdXcmFwLmlubmVySFRNTCA9IHJlbmRlckJsb2NrU3ZnKGVudHJ5LmJsb2NrKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdGFibGVXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXRhYmxlJyB9KTtcbiAgICAgIHRhYmxlV3JhcC5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1RhYmxlKGVudHJ5LmJsb2NrKTtcbiAgICB9XG5cbiAgICB0b29sdGlwLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAn5Y2V5Ye76Lez6L2s5p+l55yL5a6M5pW05a6a5LmJJywgY2xzOiAnYmYtdG9vbHRpcC1oaW50JyB9KTtcblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodG9vbHRpcCk7XG4gICAgdGhpcy5hY3RpdmVUb29sdGlwID0gdG9vbHRpcDtcblxuICAgIGNvbnN0IHJlY3QgPSB0b29sdGlwLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGxldCBsZWZ0ID0gbW91c2VYICsgMTI7XG4gICAgbGV0IHRvcCA9IG1vdXNlWSAtIDIwO1xuICAgIGlmIChsZWZ0ICsgcmVjdC53aWR0aCA+IHdpbmRvdy5pbm5lcldpZHRoIC0gMTYpIGxlZnQgPSBtb3VzZVggLSByZWN0LndpZHRoIC0gMTI7XG4gICAgaWYgKHRvcCArIHJlY3QuaGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0IC0gMTYpIHRvcCA9IHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gMTY7XG4gICAgaWYgKHRvcCA8IDgpIHRvcCA9IDg7XG5cbiAgICB0b29sdGlwLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICB0b29sdGlwLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG4gICAgLy8g6byg5qCH6L+b5YWlIHRvb2x0aXAg5pe25Y+W5raI5b6F5Yig6Zmk5a6a5pe25ZmoXG4gICAgdG9vbHRpcC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB0aGlzLnJlbW92ZVRvb2x0aXAoKSk7XG4gIH1cblxuICBwcml2YXRlIHJlbW92ZVRvb2x0aXAoKSB7XG4gICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCkge1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwLnJlbW92ZSgpO1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIDilIAg5byV55So6Kej5p6QIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgY29sbGVjdFBlbmRpbmdSZWZzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcmVmXScpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCByZWZOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpITtcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5LmhhcyhyZWZOYW1lKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZTogcmVmTmFtZSB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmJmLXJlZi1saW5rJykuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0JykhO1xuICAgICAgaWYgKCF0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHRhcmdldE5hbWUpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1JlZnMucHVzaCh7IGVsZW1lbnQ6IGVsIGFzIEhUTUxFbGVtZW50LCB0YXJnZXROYW1lIH0pO1xuICAgICAgICAoZWwgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5hZGQoJ2JmLXJlZi11bnJlc29sdmVkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVQZW5kaW5nUmVmcygpIHtcbiAgICBjb25zdCBzdGlsbFBlbmRpbmc6IHR5cGVvZiB0aGlzLnBlbmRpbmdSZWZzID0gW107XG4gICAgZm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMucGVuZGluZ1JlZnMpIHtcbiAgICAgIGlmICh0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHBlbmRpbmcudGFyZ2V0TmFtZSkpIHtcbiAgICAgICAgcGVuZGluZy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JmLXJlZi11bnJlc29sdmVkJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGlsbFBlbmRpbmcucHVzaChwZW5kaW5nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5wZW5kaW5nUmVmcyA9IHN0aWxsUGVuZGluZztcbiAgfVxufVxuIl0sIm5hbWVzIjpbImkiLCJQbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7QUFhTyxTQUFTLE1BQU0sS0FBQSxFQUE0QjtBQUNoRCxFQUFBLE1BQU0sS0FBQSxHQUFRLEtBQUEsQ0FBTSxLQUFBLENBQU0sSUFBSSxDQUFBO0FBQzlCLEVBQUEsTUFBTSxTQUF1QixFQUFDO0FBQzlCLEVBQUEsTUFBTSxNQUFBLHVCQUFhLEdBQUEsRUFBd0I7QUFDM0MsRUFBQSxNQUFNLFVBQUEsdUJBQWlCLEdBQUEsRUFBWTtBQUduQyxFQUFBLE1BQU0sV0FBc0IsRUFBQztBQUM3QixFQUFBLEtBQUEsSUFBU0EsRUFBQUEsR0FBSSxDQUFBLEVBQUdBLEVBQUFBLEdBQUksS0FBQSxDQUFNLFFBQVFBLEVBQUFBLEVB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
