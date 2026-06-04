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
const RESERVED_COLOR = "#E8E8E8";
function getFieldColor(index, isReserved, depth = 0) {
  if (isReserved) {
    return RESERVED_COLOR;
  }
  const baseColor = MAIN_COLORS[index % MAIN_COLORS.length];
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
function renderBlockSvg(block) {
  const config = {
    totalWidth: block.width,
    isVertical: shouldUseVertical(block.children, block.width),
    boxHeight: 60,
    fontSize: 22
  };
  if (config.isVertical) {
    return renderVertical(block.children, config);
  } else {
    return renderHorizontal(block.children, config);
  }
}
function renderHorizontal(fields, config) {
  const svgWidth = 1e3;
  const svgHeight = config.boxHeight + 80;
  const startX = 60;
  const startY = 40;
  const availableWidth = svgWidth - 120;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;
  let currentX = startX;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const widthRatio = field.width / config.totalWidth;
    const boxWidth = widthRatio * availableWidth;
    const color = getFieldColor(i, field.isReserved, 0);
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
  const startY = 40;
  const boxWidth = svgWidth - 160;
  const svgHeight = startY + fields.length * rowHeight + 50;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%">`;
  let currentY = startY;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const color = getFieldColor(i, field.isReserved, 0);
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
  const textY = y + height / 2 + fontSize * 0.35;
  const textWidth = width - 16;
  const maxChars = Math.floor(textWidth / (fontSize * 0.6));
  let displayText = selfLabel;
  if (selfLabel.length > maxChars && maxChars > 3) {
    displayText = selfLabel.substring(0, maxChars - 2) + "..";
  }
  const textDecoration = isRef ? ' text-decoration="underline"' : "";
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
      text: `${name}${desc} \u7684 ${block.width} bit \u5B9A\u4E49\u5982\u4E0B\uFF1A`,
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsInNyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrLCBQYXJzZUVycm9yLCBQYXJzZVJlc3VsdCB9IGZyb20gJy4vdHlwZXMnO1xuXG5pbnRlcmZhY2UgUmF3TGluZSB7XG4gIGxpbmVOdW06IG51bWJlcjtcbiAgaW5kZW50OiBudW1iZXI7XG4gIGNvbnRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiDop6PmnpAgVmVyaWxvZyDkvY3ln5/lrprkuYlcbiAqIOe7n+S4gOivreazle+8muavj+S4quS7o+eggeWdl+eUseS4gOS4quaIluWkmuS4qiBkZWZpbml0aW9uIGJsb2NrIOe7hOaIkFxuICog5q+P5Liq5Z2X77ya56ys5LiA6KGMIG5hbWUgd2lkdGggW2Rlc2NyaXB0aW9uXe+8jOWtkOWtl+autemAmui/h+e8qei/m+W1jOWll1xuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoaW5wdXQ6IHN0cmluZyk6IFBhcnNlUmVzdWx0IHtcbiAgY29uc3QgbGluZXMgPSBpbnB1dC5zcGxpdCgnXFxuJyk7XG4gIGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG4gIGNvbnN0IGJsb2NrcyA9IG5ldyBNYXA8c3RyaW5nLCBGaWVsZEJsb2NrPigpO1xuICBjb25zdCBibG9ja05hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgLy8g6aKE5aSE55CG77ya6L+H5ruk56m66KGM5ZKM5rOo6YeKXG4gIGNvbnN0IHJhd0xpbmVzOiBSYXdMaW5lW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcbiAgICBpZiAoIWxpbmUudHJpbSgpIHx8IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy8vJykpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICByYXdMaW5lcy5wdXNoKHtcbiAgICAgIGxpbmVOdW06IGkgKyAxLFxuICAgICAgaW5kZW50OiBsaW5lLnNlYXJjaCgvXFxTLyksXG4gICAgICBjb250ZW50OiBsaW5lLnRyaW0oKVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHJhd0xpbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcnM6IFt7IGxpbmU6IDAsIG1lc3NhZ2U6ICfovpPlhaXkuLrnqbonIH1dIH07XG4gIH1cblxuICAvLyDpgJDooYzop6PmnpDvvIxpbmRlbnQ9MCDnmoTooYzkvZzkuLrlnZflpLRcbiAgbGV0IGkgPSAwO1xuICB3aGlsZSAoaSA8IHJhd0xpbmVzLmxlbmd0aCkge1xuICAgIGNvbnN0IHJsID0gcmF3TGluZXNbaV07XG5cbiAgICBpZiAocmwuaW5kZW50ICE9PSAwKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDmhI/lpJbnmoTnvKnov5vooYw6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihcXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XG4gICAgICBpKys7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcblxuICAgIGlmIChibG9ja05hbWVzLmhhcyhuYW1lKSkge1xuICAgICAgZXJyb3JzLnB1c2goe1xuICAgICAgICBsaW5lOiBybC5saW5lTnVtLFxuICAgICAgICBtZXNzYWdlOiBg6YeN5aSN5a6a5LmJOiBcIiR7bmFtZX1cImAsXG4gICAgICAgIHN1Z2dlc3Rpb246ICflkIznrJTorrDlhoXlnZflkI3lv4XpobvllK/kuIAnXG4gICAgICB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBibG9ja05hbWVzLmFkZChuYW1lKTtcblxuICAgIGNvbnN0IGJsb2NrOiBGaWVsZEJsb2NrID0ge1xuICAgICAgbmFtZSxcbiAgICAgIHdpZHRoOiBwYXJzZUludCh3aWR0aFN0ciwgMTApLFxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuXG4gICAgLy8g5pS26ZuG5a2Q5a2X5q6177yI6L+e57ut55qE57yp6L+b6KGM77yJXG4gICAgaSsrO1xuICAgIGNvbnN0IGNoaWxkcmVuU3RhcnQgPSBpO1xuICAgIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoICYmIHJhd0xpbmVzW2ldLmluZGVudCA+IDApIHtcbiAgICAgIGkrKztcbiAgICB9XG4gICAgY29uc3QgY2hpbGRyZW5MaW5lcyA9IHJhd0xpbmVzLnNsaWNlKGNoaWxkcmVuU3RhcnQsIGkpO1xuXG4gICAgaWYgKGNoaWxkcmVuTGluZXMubGVuZ3RoID4gMCkge1xuICAgICAgcGFyc2VDaGlsZHJlbihjaGlsZHJlbkxpbmVzLCBibG9jay5jaGlsZHJlbiwgZXJyb3JzLCAwLCBuYW1lKTtcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpO1xuICAgICAgYXV0b0ZpbGxSZXNlcnZlZChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpO1xuICAgIH1cblxuICAgIC8vIOmqjOivgeS9jeWuvVxuICAgIHZhbGlkYXRlQml0V2lkdGhzKGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMpO1xuXG4gICAgYmxvY2tzLnNldChuYW1lLCBibG9jayk7XG4gIH1cblxuICBpZiAoYmxvY2tzLnNpemUgPT09IDApIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn5pyq5om+5Yiw5pyJ5pWI55qE5a6a5LmJ5Z2XJyB9XSB9O1xuICB9XG5cbiAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xuICB9XG5cbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmxvY2tzIH07XG59XG5cbi8qKlxuICog6Kej5p6Q5a2Q5a2X5q615YiX6KGoXG4gKi9cbmZ1bmN0aW9uIHBhcnNlQ2hpbGRyZW4oXG4gIGxpbmVzOiBSYXdMaW5lW10sXG4gIGNoaWxkcmVuOiBCaXRGaWVsZFtdLFxuICBlcnJvcnM6IFBhcnNlRXJyb3JbXSxcbiAgYmFzZUluZGVudDogbnVtYmVyLFxuICBwYXJlbnROYW1lOiBzdHJpbmdcbik6IHZvaWQge1xuICBjb25zdCBzdGFjazogeyBmaWVsZDogQml0RmllbGQ7IGluZGVudDogbnVtYmVyIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qgcmwgb2YgbGluZXMpIHtcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oQD9cXHcrKVxccysoXFxkKylcXHMqKC4qKT8kLyk7XG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcbiAgICBjb25zdCB3aWR0aCA9IHBhcnNlSW50KHdpZHRoU3RyLCAxMCk7XG4gICAgY29uc3QgaXNSZWZlcmVuY2UgPSBuYW1lLnN0YXJ0c1dpdGgoJ0AnKTtcbiAgICBjb25zdCByZWZOYW1lID0gaXNSZWZlcmVuY2UgPyBuYW1lLnNsaWNlKDEpIDogbmFtZTtcblxuICAgIC8vIOW1jOWll+Wxgue6p+ajgOafpVxuICAgIGNvbnN0IGRlcHRoID0gTWF0aC5mbG9vcigocmwuaW5kZW50IC0gYmFzZUluZGVudCkgLyAyKSArIDE7XG4gICAgaWYgKGRlcHRoID4gNSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5bWM5aWX5bGC57qn6L+H5rexICgke2RlcHRofSDlsYIp77yM5pyA5aSaIDUg5bGCYCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkOiBCaXRGaWVsZCA9IHtcbiAgICAgIG5hbWU6IHJlZk5hbWUsXG4gICAgICB3aWR0aCxcbiAgICAgIG1zYjogMCxcbiAgICAgIGxzYjogMCxcbiAgICAgIGRlc2NyaXB0aW9uOiBkZXNjPy50cmltKCkgfHwgdW5kZWZpbmVkLFxuICAgICAgaXNSZXNlcnZlZDogbmFtZS50b0xvd2VyQ2FzZSgpID09PSAncmVzZXJ2ZWQnLFxuICAgICAgaXNSZWZlcmVuY2UsXG4gICAgICByZWZOYW1lOiBpc1JlZmVyZW5jZSA/IHJlZk5hbWUgOiB1bmRlZmluZWQsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuXG4gICAgLy8g5om+54i25a2X5q6177ya5LuO5qCI5Lit5om+57yp6L+b5q+U5b2T5YmN5bCP55qE5pyA5ZCO5LiA5LiqXG4gICAgbGV0IHBhcmVudDogQml0RmllbGQgfCBudWxsID0gbnVsbDtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdG9wID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XG4gICAgICBpZiAodG9wLmluZGVudCA8IHJsLmluZGVudCkge1xuICAgICAgICBwYXJlbnQgPSB0b3AuZmllbGQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgc3RhY2sucG9wKCk7XG4gICAgfVxuXG4gICAgaWYgKHBhcmVudCkge1xuICAgICAgaWYgKCFwYXJlbnQuY2hpbGRyZW4pIHBhcmVudC5jaGlsZHJlbiA9IFtdO1xuICAgICAgcGFyZW50LmNoaWxkcmVuLnB1c2goZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGlsZHJlbi5wdXNoKGZpZWxkKTtcbiAgICB9XG5cbiAgICBzdGFjay5wdXNoKHsgZmllbGQsIGluZGVudDogcmwuaW5kZW50IH0pO1xuICB9XG59XG5cbi8qKlxuICog6K6h566XIGJpdCDojIPlm7RcbiAqIOmdoOWJjeWumuS5ieeahOaYryBMU0LvvIzpnaDlkI7lrprkuYnnmoTmmK8gTVNCXG4gKi9cbmZ1bmN0aW9uIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgbGV0IGN1cnJlbnRMc2IgPSAwO1xuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGZpZWxkLmxzYiA9IGN1cnJlbnRMc2I7XG4gICAgZmllbGQubXNiID0gY3VycmVudExzYiArIGZpZWxkLndpZHRoIC0gMTtcbiAgICBjdXJyZW50THNiID0gZmllbGQubXNiICsgMTtcbiAgICBpZiAoIWZpZWxkLmlzUmVmZXJlbmNlICYmIGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZC5jaGlsZHJlbiwgZmllbGQud2lkdGgpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIOW9k+WtkOWtl+auteaAu+S9jeWuveS4jeWkn+aXtu+8jOWcqCBNU0Ig56uv6Ieq5Yqo6KGlIHJlc2VydmVkXG4gKi9cbmZ1bmN0aW9uIGF1dG9GaWxsUmVzZXJ2ZWQoZmllbGRzOiBCaXRGaWVsZFtdLCBwYXJlbnRXaWR0aDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IHRvdGFsQ2hpbGRXaWR0aCA9IGZpZWxkcy5yZWR1Y2UoKHN1bSwgZikgPT4gc3VtICsgZi53aWR0aCwgMCk7XG4gIGNvbnN0IHJlbWFpbmluZyA9IHBhcmVudFdpZHRoIC0gdG90YWxDaGlsZFdpZHRoO1xuICBpZiAocmVtYWluaW5nID4gMCkge1xuICAgIGNvbnN0IHJlc2VydmVkOiBCaXRGaWVsZCA9IHtcbiAgICAgIG5hbWU6ICdyZXNlcnZlZCcsXG4gICAgICB3aWR0aDogcmVtYWluaW5nLFxuICAgICAgbXNiOiAwLFxuICAgICAgbHNiOiAwLFxuICAgICAgaXNSZXNlcnZlZDogdHJ1ZSxcbiAgICAgIGlzUmVmZXJlbmNlOiBmYWxzZSxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG4gICAgZmllbGRzLnB1c2gocmVzZXJ2ZWQpO1xuICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHMsIHBhcmVudFdpZHRoKTtcbiAgfVxufVxuXG4vKipcbiAqIOmqjOivgeS9jeWuvVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZUJpdFdpZHRocyhmaWVsZHM6IEJpdEZpZWxkW10sIGVycm9yczogUGFyc2VFcnJvcltdKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBmaWVsZC5jaGlsZHJlbiB8fCBbXTtcbiAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgY2hpbGRyZW5XaWR0aCA9IGNoaWxkcmVuLnJlZHVjZSgoc3VtLCBjaGlsZCkgPT4gc3VtICsgY2hpbGQud2lkdGgsIDApO1xuICAgICAgaWYgKGNoaWxkcmVuV2lkdGggPiBmaWVsZC53aWR0aCkge1xuICAgICAgICBlcnJvcnMucHVzaCh7XG4gICAgICAgICAgbGluZTogMCxcbiAgICAgICAgICBtZXNzYWdlOiBg5a2X5q61IFwiJHtmaWVsZC5uYW1lfVwiIOWtkOWtl+auteS9jeWuvei2heWHumAsXG4gICAgICAgICAgc3VnZ2VzdGlvbjogYOeItuWtl+autTogJHtmaWVsZC53aWR0aH0tYml0LCDlrZDlrZfmrrXmgLvlkow6ICR7Y2hpbGRyZW5XaWR0aH0tYml0LCDliankvZnnqbrpl7Q6ICR7ZmllbGQud2lkdGggLSBjaGlsZHJlbldpZHRofS1iaXRgXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdmFsaWRhdGVCaXRXaWR0aHMoY2hpbGRyZW4sIGVycm9ycyk7XG4gICAgfVxuICB9XG59XG4iLCIvKipcbiAqIOminOiJsuaWueahiO+8iOa1heiJsuiwg++8iVxuICovXG5cbi8vIOS4u+iJsu+8iOmhtuWxguWtl+aute+8ieKAlCDmn5TlkozmtYXoibJcbmNvbnN0IE1BSU5fQ09MT1JTID0gW1xuICAnI0IzRDRGMCcsIC8vIOa1heiTnVxuICAnI0I4RTBCOCcsIC8vIOa1hee7v1xuICAnI0Y1RDZBOCcsIC8vIOa1heapmVxuICAnI0Q0QjhFOCcsIC8vIOa1hee0q1xuICAnI0E4RTBENicsIC8vIOa1hemdklxuICAnI0YwQjhCOCcsIC8vIOa1hee6olxuXTtcblxuLy8g5L+d55WZ6ImyXG5jb25zdCBSRVNFUlZFRF9DT0xPUiA9ICcjRThFOEU4JztcblxuLyoqXG4gKiDojrflj5blrZfmrrXpopzoibJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEZpZWxkQ29sb3IoaW5kZXg6IG51bWJlciwgaXNSZXNlcnZlZDogYm9vbGVhbiwgZGVwdGg6IG51bWJlciA9IDApOiBzdHJpbmcge1xuICBpZiAoaXNSZXNlcnZlZCkge1xuICAgIHJldHVybiBSRVNFUlZFRF9DT0xPUjtcbiAgfVxuXG4gIGNvbnN0IGJhc2VDb2xvciA9IE1BSU5fQ09MT1JTW2luZGV4ICUgTUFJTl9DT0xPUlMubGVuZ3RoXTtcblxuICBpZiAoZGVwdGggPT09IDApIHtcbiAgICByZXR1cm4gYmFzZUNvbG9yO1xuICB9XG5cbiAgLy8g5a2Q5a2X5q6177ya5Z+65LqO54i26Imy6LCD5pW05Lqu5bqmXG4gIHJldHVybiBhZGp1c3RCcmlnaHRuZXNzKGJhc2VDb2xvciwgZGVwdGggKiAxMCk7XG59XG5cbi8qKlxuICog6LCD5pW06aKc6Imy5Lqu5bqmXG4gKi9cbmZ1bmN0aW9uIGFkanVzdEJyaWdodG5lc3MoaGV4OiBzdHJpbmcsIHBlcmNlbnQ6IG51bWJlcik6IHN0cmluZyB7XG4gIGhleCA9IGhleC5yZXBsYWNlKCcjJywgJycpO1xuXG4gIGNvbnN0IHIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDAsIDIpLCAxNik7XG4gIGNvbnN0IGcgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDIsIDQpLCAxNik7XG4gIGNvbnN0IGIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDQsIDYpLCAxNik7XG5cbiAgY29uc3QgYWRqdXN0ID0gKGNoYW5uZWw6IG51bWJlcikgPT4ge1xuICAgIGNvbnN0IGFkanVzdGVkID0gTWF0aC5yb3VuZChjaGFubmVsICsgKDI1NSAtIGNoYW5uZWwpICogKHBlcmNlbnQgLyAxMDApKTtcbiAgICByZXR1cm4gTWF0aC5taW4oMjU1LCBNYXRoLm1heCgwLCBhZGp1c3RlZCkpO1xuICB9O1xuXG4gIGNvbnN0IG5ld1IgPSBhZGp1c3Qocik7XG4gIGNvbnN0IG5ld0cgPSBhZGp1c3QoZyk7XG4gIGNvbnN0IG5ld0IgPSBhZGp1c3QoYik7XG5cbiAgY29uc3QgdG9IZXggPSAobjogbnVtYmVyKSA9PiBuLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpO1xuICByZXR1cm4gYCMke3RvSGV4KG5ld1IpfSR7dG9IZXgobmV3Ryl9JHt0b0hleChuZXdCKX1gO1xufVxuXG4vKipcbiAqIOiOt+WPluminOiJsuaVsOe7hO+8iOeUqOS6juiwg+ivle+8iVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29sb3JQYWxldHRlKCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIE1BSU5fQ09MT1JTO1xufVxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGdldEZpZWxkQ29sb3IgfSBmcm9tICcuL2NvbG9ycyc7XG5cbi8qKlxuICogU1ZHIOa4suafk+mFjee9rlxuICovXG5pbnRlcmZhY2UgUmVuZGVyQ29uZmlnIHtcbiAgLyoqIOaAu+S9jeWuvSAqL1xuICB0b3RhbFdpZHRoOiBudW1iZXI7XG4gIC8qKiDmmK/lkKbnurXlkJHmjpLliJcgKi9cbiAgaXNWZXJ0aWNhbDogYm9vbGVhbjtcbiAgLyoqIOWtl+auteahhumrmOW6piAqL1xuICBib3hIZWlnaHQ6IG51bWJlcjtcbiAgLyoqIOWtl+S9k+Wkp+WwjyAqL1xuICBmb250U2l6ZTogbnVtYmVyO1xufVxuXG4vKipcbiAqIOiuoeeul+Wtl+auteagh+etvuaJgOmcgOeahOacgOWwj+WuveW6pu+8iOWDj+e0oO+8iVxuICovXG5mdW5jdGlvbiBjYWxjTWluTGFiZWxXaWR0aChsYWJlbDogc3RyaW5nLCBmb250U2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIGxhYmVsLmxlbmd0aCAqIGZvbnRTaXplICogMC42ICsgMjA7XG59XG5cbi8qKlxuICog5Yik5pat5piv5ZCm5bqU5L2/55So57q15ZCR5biD5bGAXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVzZVZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgdG90YWxXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0b3RhbFdpZHRoID4gNjQpIHJldHVybiB0cnVlO1xuXG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3QgYXZhaWxhYmxlV2lkdGggPSBzdmdXaWR0aCAtIDEyMDtcblxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkLmlzUmVzZXJ2ZWQgPyAncmVzZXJ2ZWQnIDogKGZpZWxkLmlzUmVmZXJlbmNlID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICAgIGNvbnN0IGxhYmVsID0gYCR7ZmllbGROYW1lfVske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XG4gICAgY29uc3Qgd2lkdGhSYXRpbyA9IGZpZWxkLndpZHRoIC8gdG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBtaW5XaWR0aCA9IGNhbGNNaW5MYWJlbFdpZHRoKGxhYmVsLCAxNCk7XG4gICAgaWYgKGJveFdpZHRoIDwgbWluV2lkdGgpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiDmuLLmn5PlnZfnmoQgU1ZHIOS9jeWfn+WbvlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tTdmcoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xuICBjb25zdCBjb25maWc6IFJlbmRlckNvbmZpZyA9IHtcbiAgICB0b3RhbFdpZHRoOiBibG9jay53aWR0aCxcbiAgICBpc1ZlcnRpY2FsOiBzaG91bGRVc2VWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpLFxuICAgIGJveEhlaWdodDogNjAsXG4gICAgZm9udFNpemU6IDIyXG4gIH07XG5cbiAgaWYgKGNvbmZpZy5pc1ZlcnRpY2FsKSB7XG4gICAgcmV0dXJuIHJlbmRlclZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZW5kZXJIb3Jpem9udGFsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9XG59XG5cbi8qKlxuICog5qiq5ZCR5riy5p+TXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckhvcml6b250YWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodCArIDgwO1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gNDA7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgbGV0IGN1cnJlbnRYID0gc3RhcnRYO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIGNvbmZpZy50b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIGN1cnJlbnRYLCBzdGFydFksIGJveFdpZHRoLCBjb25maWcuYm94SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplLCAnaG9yaXpvbnRhbCcpO1xuICAgIGN1cnJlbnRYICs9IGJveFdpZHRoO1xuICB9XG5cbiAgLy8gTFNCIOKGkiBNU0Ig5pa55ZCR566t5aS0XG4gIGNvbnN0IGFycm93WSA9IHN0YXJ0WSArIGNvbmZpZy5ib3hIZWlnaHQgKyAyMjtcbiAgY29uc3QgZnMgPSBjb25maWcuZm9udFNpemUgKiAwLjg1O1xuICBjb25zdCBmaWVsZExlZnQgPSBzdGFydFg7XG4gIGNvbnN0IGZpZWxkUmlnaHQgPSBzdGFydFggKyBhdmFpbGFibGVXaWR0aDtcbiAgLy8gTFNCIOWPs+Wvuem9kOWIsOWtl+auteahhuW3pui+uee8mFxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2ZpZWxkTGVmdH1cIiB5PVwiJHthcnJvd1kgKyA1fVwiIGZvbnQtc2l6ZT1cIiR7ZnN9XCIgdGV4dC1hbmNob3I9XCJlbmRcIiBmaWxsPVwiIzk5OVwiPkxTQjwvdGV4dD5gO1xuICAvLyDnrq3lpLTmr5TlrZfmrrXmoYbnqoTkuIDngrnvvIzkuKTnq6/nlZnnqbpcbiAgY29uc3QgYXJyb3dQYWQgPSAxMDtcbiAgc3ZnICs9IGA8bGluZSB4MT1cIiR7ZmllbGRMZWZ0ICsgYXJyb3dQYWR9XCIgeTE9XCIke2Fycm93WX1cIiB4Mj1cIiR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gOH1cIiB5Mj1cIiR7YXJyb3dZfVwiIHN0cm9rZT1cIiM5OTlcIiBzdHJva2Utd2lkdGg9XCIxLjVcIi8+YDtcbiAgc3ZnICs9IGA8cG9seWdvbiBwb2ludHM9XCIke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZH0sJHthcnJvd1l9ICR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gMTB9LCR7YXJyb3dZIC0gNX0gJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWQgLSAxMH0sJHthcnJvd1kgKyA1fVwiIGZpbGw9XCIjOTk5XCIvPmA7XG4gIC8vIE1TQiDlt6blr7npvZDliLDlrZfmrrXmoYblj7PovrnnvJhcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtmaWVsZFJpZ2h0fVwiIHk9XCIke2Fycm93WSArIDV9XCIgZm9udC1zaXplPVwiJHtmc31cIiBmaWxsPVwiIzk5OVwiPk1TQjwvdGV4dD5gO1xuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDnurXlkJHmuLLmn5PvvIh2aWV3Qm94IOWuveW6puS4juaoquWQkeS4gOiHtO+8jOS/neaMgeWtl+S9k+inhuinieWkp+Wwj+S4gOiHtO+8iVxuICovXG5mdW5jdGlvbiByZW5kZXJWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIGNvbmZpZzogUmVuZGVyQ29uZmlnKTogc3RyaW5nIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCByb3dIZWlnaHQgPSBjb25maWcuYm94SGVpZ2h0O1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gNDA7XG4gIGNvbnN0IGJveFdpZHRoID0gc3ZnV2lkdGggLSAxNjA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQgKyA1MDtcblxuICBsZXQgc3ZnID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgJHtzdmdXaWR0aH0gJHtzdmdIZWlnaHR9XCIgd2lkdGg9XCIxMDAlXCI+YDtcblxuICBsZXQgY3VycmVudFkgPSBzdGFydFk7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZmllbGQgPSBmaWVsZHNbaV07XG4gICAgY29uc3QgY29sb3IgPSBnZXRGaWVsZENvbG9yKGksIGZpZWxkLmlzUmVzZXJ2ZWQsIDApO1xuICAgIHN2ZyArPSByZW5kZXJGaWVsZEJveChmaWVsZCwgc3RhcnRYLCBjdXJyZW50WSwgYm94V2lkdGgsIHJvd0hlaWdodCwgY29sb3IsIGNvbmZpZy5mb250U2l6ZSk7XG4gICAgY3VycmVudFkgKz0gcm93SGVpZ2h0O1xuICB9XG5cbiAgLy8gTFNCIOKGkiBNU0Ig5pa55ZCR566t5aS077yI57q15ZCR77ya5LuO5LiK5Yiw5LiL77yJXG4gIGNvbnN0IGFycm93WCA9IHN0YXJ0WCArIGJveFdpZHRoICsgMjQ7XG4gIGNvbnN0IGFycm93VG9wID0gc3RhcnRZO1xuICBjb25zdCBhcnJvd0JvdHRvbSA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQ7XG4gIHN2ZyArPSBgPGxpbmUgeDE9XCIke2Fycm93WH1cIiB5MT1cIiR7YXJyb3dUb3AgKyA4fVwiIHgyPVwiJHthcnJvd1h9XCIgeTI9XCIke2Fycm93Qm90dG9tIC0gOH1cIiBzdHJva2U9XCIjOTk5XCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIvPmA7XG4gIHN2ZyArPSBgPHBvbHlnb24gcG9pbnRzPVwiJHthcnJvd1h9LCR7YXJyb3dCb3R0b219ICR7YXJyb3dYIC0gNX0sJHthcnJvd0JvdHRvbSAtIDEwfSAke2Fycm93WCArIDV9LCR7YXJyb3dCb3R0b20gLSAxMH1cIiBmaWxsPVwiIzk5OVwiLz5gO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fycm93WH1cIiB5PVwiJHthcnJvd1RvcCAtIDR9XCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemUgKiAwLjg1fVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIiM5OTlcIj5MU0I8L3RleHQ+YDtcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHthcnJvd1h9XCIgeT1cIiR7YXJyb3dCb3R0b20gKyAxOH1cIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZSAqIDAuODV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiPk1TQjwvdGV4dD5gO1xuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDmuLLmn5PlrZfmrrXmoYZcbiAqIEBwYXJhbSBsYXlvdXREaXJlY3Rpb24g5biD5bGA5pa55ZCR77yM55So5LqO5Yaz5a6a54i25a2X5q6157Si5byV5qCH5rOo5L2N572uXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckZpZWxkQm94KFxuICBmaWVsZDogQml0RmllbGQsXG4gIHg6IG51bWJlcixcbiAgeTogbnVtYmVyLFxuICB3aWR0aDogbnVtYmVyLFxuICBoZWlnaHQ6IG51bWJlcixcbiAgY29sb3I6IHN0cmluZyxcbiAgZm9udFNpemU6IG51bWJlcixcbiAgbGF5b3V0RGlyZWN0aW9uOiAnaG9yaXpvbnRhbCcgfCAndmVydGljYWwnID0gJ3ZlcnRpY2FsJ1xuKTogc3RyaW5nIHtcbiAgbGV0IHN2ZyA9ICcnO1xuICBjb25zdCBpc1JlZiA9IGZpZWxkLmlzUmVmZXJlbmNlO1xuICBjb25zdCBpc1JzdiA9IGZpZWxkLmlzUmVzZXJ2ZWQ7XG4gIGNvbnN0IGZpZWxkTmFtZSA9IGlzUnN2ID8gJ3Jlc2VydmVkJyA6IChpc1JlZiA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcblxuICBjb25zdCBzdHJva2VEYXNoID0gaXNSZWYgPyAnIHN0cm9rZS1kYXNoYXJyYXk9XCI2LDNcIicgOiAnJztcbiAgY29uc3Qgc3Ryb2tlQ29sb3IgPSBpc1JlZiA/ICcjNEE5MEQ5JyA6ICcjZmZmJztcbiAgc3ZnICs9IGA8cmVjdCB4PVwiJHt4fVwiIHk9XCIke3l9XCIgd2lkdGg9XCIke3dpZHRofVwiIGhlaWdodD1cIiR7aGVpZ2h0fVwiIGZpbGw9XCIke2NvbG9yfVwiIHN0cm9rZT1cIiR7c3Ryb2tlQ29sb3J9XCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHJ4PVwiNFwiIHJ5PVwiNFwiIGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiLz5gO1xuXG4gIC8vIOahhuWGhe+8muWtl+auteiHqui6q+e0ouW8lSBbd2lkdGgtMTowXe+8jOWNlSBiaXQg5a2X5q6155yB55Wl57Si5byVXG4gIGNvbnN0IHNlbGZIaWdoID0gZmllbGQud2lkdGggLSAxO1xuICBjb25zdCBzZWxmTGFiZWwgPSBzZWxmSGlnaCA9PT0gMCA/IGZpZWxkTmFtZSA6IGAke2ZpZWxkTmFtZX1bJHtzZWxmSGlnaH06MF1gO1xuICBjb25zdCB0ZXh0WCA9IHggKyB3aWR0aCAvIDI7XG4gIGNvbnN0IHRleHRZID0geSArIGhlaWdodCAvIDIgKyBmb250U2l6ZSAqIDAuMzU7XG4gIGNvbnN0IHRleHRXaWR0aCA9IHdpZHRoIC0gMTY7XG4gIGNvbnN0IG1heENoYXJzID0gTWF0aC5mbG9vcih0ZXh0V2lkdGggLyAoZm9udFNpemUgKiAwLjYpKTtcblxuICBsZXQgZGlzcGxheVRleHQgPSBzZWxmTGFiZWw7XG4gIGlmIChzZWxmTGFiZWwubGVuZ3RoID4gbWF4Q2hhcnMgJiYgbWF4Q2hhcnMgPiAzKSB7XG4gICAgZGlzcGxheVRleHQgPSBzZWxmTGFiZWwuc3Vic3RyaW5nKDAsIG1heENoYXJzIC0gMikgKyAnLi4nO1xuICB9XG5cbiAgY29uc3QgdGV4dERlY29yYXRpb24gPSBpc1JlZiA/ICcgdGV4dC1kZWNvcmF0aW9uPVwidW5kZXJsaW5lXCInIDogJyc7XG4gIGNvbnN0IGZpbGxDb2xvciA9IGlzUnN2ID8gJyM4ODgnIDogJyMzMzMnO1xuICBzdmcgKz0gYDx0ZXh0IHg9XCIke3RleHRYfVwiIHk9XCIke3RleHRZfVwiIGZvbnQtc2l6ZT1cIiR7Zm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBkb21pbmFudC1iYXNlbGluZT1cImNlbnRyYWxcIiBmaWxsPVwiJHtmaWxsQ29sb3J9XCIgZm9udC1mYW1pbHk9XCJtb25vc3BhY2VcIiR7dGV4dERlY29yYXRpb259IGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiPiR7ZGlzcGxheVRleHR9PC90ZXh0PmA7XG5cbiAgLy8g5qGG5aSW77ya54i25a2X5q6157Si5byVIFttc2I6bHNiXe+8jOeBsOiJsuWwj+Wtl1xuICBjb25zdCBwYXJlbnRIaWdoID0gZmllbGQubXNiO1xuICBjb25zdCBwYXJlbnRMb3cgPSBmaWVsZC5sc2I7XG4gIGNvbnN0IHBhcmVudExhYmVsID0gcGFyZW50SGlnaCA9PT0gcGFyZW50TG93ID8gYFske3BhcmVudEhpZ2h9XWAgOiBgWyR7cGFyZW50SGlnaH06JHtwYXJlbnRMb3d9XWA7XG4gIGNvbnN0IGFubm90YXRpb25Gb250U2l6ZSA9IGZvbnRTaXplICogMC43O1xuXG4gIGlmIChsYXlvdXREaXJlY3Rpb24gPT09ICd2ZXJ0aWNhbCcpIHtcbiAgICAvLyDnurXlkJHvvJrmoIfms6jlnKjlt6bkvqfvvIzlj7Plr7npvZBcbiAgICBjb25zdCBhbm5vdFggPSB4IC0gODtcbiAgICBjb25zdCBhbm5vdFkgPSB0ZXh0WTtcbiAgICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fubm90WH1cIiB5PVwiJHthbm5vdFl9XCIgZm9udC1zaXplPVwiJHthbm5vdGF0aW9uRm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJlbmRcIiBkb21pbmFudC1iYXNlbGluZT1cImNlbnRyYWxcIiBmaWxsPVwiIzk5OVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCI+JHtwYXJlbnRMYWJlbH08L3RleHQ+YDtcbiAgfSBlbHNlIHtcbiAgICAvLyDmqKrlkJHvvJrmoIfms6jlnKjkuIrmlrnvvIzlsYXkuK1cbiAgICBjb25zdCBhbm5vdFggPSB0ZXh0WDtcbiAgICBjb25zdCBhbm5vdFkgPSB5IC0gODtcbiAgICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fubm90WH1cIiB5PVwiJHthbm5vdFl9XCIgZm9udC1zaXplPVwiJHthbm5vdGF0aW9uRm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCI+JHtwYXJlbnRMYWJlbH08L3RleHQ+YDtcbiAgfVxuXG4gIHJldHVybiBzdmc7XG59XG4iLCJpbXBvcnQgeyBCaXRGaWVsZCwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIOa4suafk+Wdl+eahCBIVE1MIOihqOagvFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tUYWJsZShibG9jazogRmllbGRCbG9jayk6IHN0cmluZyB7XG4gIGNvbnN0IHJvd3M6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jaGlsZHJlbikge1xuICAgIGNvbGxlY3RSb3dzKGNoaWxkLCAwLCByb3dzKTtcbiAgfVxuXG4gIGxldCBodG1sID0gJzx0YWJsZSBjbGFzcz1cInZlcmlsb2ctYml0ZmllbGQtdGFibGVcIj4nO1xuICBodG1sICs9ICc8dGhlYWQ+PHRyPic7XG4gIGh0bWwgKz0gJzx0aD5GaWVsZDwvdGg+JztcbiAgaHRtbCArPSAnPHRoPldpZHRoPC90aD4nO1xuICBodG1sICs9ICc8dGg+Qml0IFJhbmdlPC90aD4nO1xuICBodG1sICs9ICc8dGg+RGVzY3JpcHRpb248L3RoPic7XG4gIGh0bWwgKz0gJzwvdHI+PC90aGVhZD4nO1xuICBodG1sICs9ICc8dGJvZHk+JztcbiAgaHRtbCArPSByb3dzLmpvaW4oJycpO1xuICBodG1sICs9ICc8L3Rib2R5PjwvdGFibGU+JztcbiAgcmV0dXJuIGh0bWw7XG59XG5cbi8qKlxuICog6YCS5b2S5pS26ZuG6KGo5qC86KGMXG4gKi9cbmZ1bmN0aW9uIGNvbGxlY3RSb3dzKGZpZWxkOiBCaXRGaWVsZCwgZGVwdGg6IG51bWJlciwgcm93czogc3RyaW5nW10pOiB2b2lkIHtcbiAgY29uc3QgaW5kZW50ID0gZGVwdGggPiAwID8gJyZuYnNwOyZuYnNwOyZuYnNwOyZuYnNwOycucmVwZWF0KGRlcHRoKSA6ICcnO1xuICBjb25zdCBpc1JlZiA9IGZpZWxkLmlzUmVmZXJlbmNlO1xuICBjb25zdCBpc1JzdiA9IGZpZWxkLmlzUmVzZXJ2ZWQ7XG4gIGNvbnN0IG5hbWUgPSBpc1JzdiA/ICdyZXNlcnZlZCcgOiAoaXNSZWYgPyBgQCR7ZmllbGQucmVmTmFtZX1gIDogZmllbGQubmFtZSk7XG4gIGNvbnN0IGJpdFJhbmdlID0gYFske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XG4gIGNvbnN0IGRlc2NyaXB0aW9uID0gZmllbGQuZGVzY3JpcHRpb24gfHwgJyc7XG5cbiAgbGV0IHJvd0NsYXNzID0gJyc7XG4gIGlmIChpc1Jzdikgcm93Q2xhc3MgPSAnIGNsYXNzPVwicmVzZXJ2ZWQtcm93XCInO1xuICBlbHNlIGlmIChpc1JlZikgcm93Q2xhc3MgPSAnIGNsYXNzPVwicmVmLWNoaWxkXCInO1xuXG4gIGNvbnN0IG5hbWVDZWxsID0gaXNSZWZcbiAgICA/IGA8YSBocmVmPVwiI1wiIGNsYXNzPVwiYmYtcmVmLWxpbmtcIiBkYXRhLXRhcmdldD1cIiR7ZmllbGQucmVmTmFtZX1cIj4ke2luZGVudH0ke25hbWV9PC9hPmBcbiAgICA6IGAke2luZGVudH0ke25hbWV9YDtcblxuICByb3dzLnB1c2goYDx0ciR7cm93Q2xhc3N9PmApO1xuICByb3dzLnB1c2goYDx0ZD4ke25hbWVDZWxsfTwvdGQ+YCk7XG4gIHJvd3MucHVzaChgPHRkPiR7ZmllbGQud2lkdGh9PC90ZD5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtiaXRSYW5nZX08L3RkPmApO1xuICByb3dzLnB1c2goYDx0ZD4ke2Rlc2NyaXB0aW9ufTwvdGQ+YCk7XG4gIHJvd3MucHVzaCgnPC90cj4nKTtcblxuICBpZiAoZmllbGQuY2hpbGRyZW4gJiYgZmllbGQuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZmllbGQuY2hpbGRyZW4pIHtcbiAgICAgIGNvbGxlY3RSb3dzKGNoaWxkLCBkZXB0aCArIDEsIHJvd3MpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luLCBNYXJrZG93blBvc3RQcm9jZXNzb3JDb250ZXh0IH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuL3BhcnNlcic7XG5pbXBvcnQgeyByZW5kZXJCbG9ja1N2ZyB9IGZyb20gJy4vc3ZnUmVuZGVyZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tUYWJsZSB9IGZyb20gJy4vdGFibGVSZW5kZXJlcic7XG5pbXBvcnQgeyBSZWdpc3RyeUVudHJ5LCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XG5cbmludGVyZmFjZSBQbHVnaW5EYXRhIHtcbiAgZGVmYXVsdFZpZXc/OiAnc3ZnJyB8ICd0YWJsZSc7XG59XG5cbmNvbnN0IERFRkFVTFRfREFUQTogUGx1Z2luRGF0YSA9IHsgZGVmYXVsdFZpZXc6ICdzdmcnIH07XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFZlcmlsb2dCaXRmaWVsZFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHByaXZhdGUgYmxvY2tSZWdpc3RyeTogTWFwPHN0cmluZywgUmVnaXN0cnlFbnRyeT4gPSBuZXcgTWFwKCk7XG4gIHByaXZhdGUgcGVuZGluZ1JlZnM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IHRhcmdldE5hbWU6IHN0cmluZyB9W10gPSBbXTtcbiAgcHJpdmF0ZSBjdXJyZW50Tm90ZVBhdGg6IHN0cmluZyA9ICcnO1xuICBwcml2YXRlIGFjdGl2ZVRvb2x0aXA6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgdG9vbHRpcFJlbW92ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHBsdWdpbkRhdGE6IFBsdWdpbkRhdGEgPSBERUZBVUxUX0RBVEE7XG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIHRoaXMucGx1Z2luRGF0YSA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfREFUQSwgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ3Zlcmlsb2ctYml0ZmllbGQnLCB0aGlzLnByb2Nlc3NCaXRmaWVsZC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIG9udW5sb2FkKCkge1xuICAgIHRoaXMuYmxvY2tSZWdpc3RyeS5jbGVhcigpO1xuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBbXTtcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NCaXRmaWVsZChzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICB0aGlzLmN1cnJlbnROb3RlUGF0aCA9IGN0eC5zb3VyY2VQYXRoIHx8ICcnO1xuICAgIGNvbnN0IHJlc3VsdCA9IHBhcnNlKHNvdXJjZSk7XG5cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICB0aGlzLnJlbmRlckVycm9ycyhlbCwgcmVzdWx0LmVycm9ycyB8fCBbXSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbbmFtZSwgYmxvY2tdIG9mIHJlc3VsdC5ibG9ja3MhKSB7XG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XG4gICAgfVxuXG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnJlc29sdmVQZW5kaW5nUmVmcygpLCA1MCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckJsb2NrKG5hbWU6IHN0cmluZywgYmxvY2s6IEZpZWxkQmxvY2ssIHBhcmVudEVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHBhcmVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7XG4gICAgICBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWNvbnRhaW5lcicsXG4gICAgICBhdHRyOiB7IGlkOiBgYmY6JHtuYW1lfWAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgaGVhZGVyUm93ID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtaGVhZGVyLXJvdycgfSk7XG4gICAgY29uc3QgZGVzYyA9IGJsb2NrLmRlc2NyaXB0aW9uID8gYCDigJQgJHtibG9jay5kZXNjcmlwdGlvbn1gIDogJyc7XG4gICAgaGVhZGVyUm93LmNyZWF0ZUVsKCdzcGFuJywge1xuICAgICAgdGV4dDogYCR7bmFtZX0ke2Rlc2N9IOeahCAke2Jsb2NrLndpZHRofSBiaXQg5a6a5LmJ5aaC5LiL77yaYCxcbiAgICAgIGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtaGVhZGVyJ1xuICAgIH0pO1xuICAgIGNvbnN0IHRvZ2dsZUJ0biA9IHRoaXMuY3JlYXRlVG9nZ2xlQnV0dG9uKGhlYWRlclJvdyk7XG5cbiAgICBjb25zdCBjb250ZW50V3JhcCA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWNvbnRlbnQnIH0pO1xuICAgIGNvbnN0IHN2Z0NvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtc3ZnJyB9KTtcbiAgICBzdmdDb250YWluZXIuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tTdmcoYmxvY2spO1xuICAgIHRoaXMuc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLnNldHVwVG9vbHRpcEhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XG5cbiAgICBjb25zdCB0YWJsZUNvbnRhaW5lciA9IGNvbnRlbnRXcmFwLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtdGFibGUtY29udGFpbmVyJyB9KTtcbiAgICB0YWJsZUNvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1RhYmxlKGJsb2NrKTtcbiAgICB0aGlzLnNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnModGFibGVDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG5cbiAgICAvLyDliJ3lp4vljJbop4blm77vvJror7vlj5bkv53lrZjnmoTlgY/lpb1cbiAgICBjb25zdCBkZWZhdWx0VmlldyA9IHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgICB0aGlzLmFwcGx5VmlldyhkZWZhdWx0VmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XG5cbiAgICAvLyDnu5HlrprliIfmjaLkuovku7ZcbiAgICB0b2dnbGVCdG4ub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGNvbnN0IHZpZXcgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScgfCBudWxsO1xuICAgICAgaWYgKHZpZXcpIHtcbiAgICAgICAgdGhpcy5hcHBseVZpZXcodmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XG4gICAgICAgIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyA9IHZpZXc7XG4gICAgICAgIHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5EYXRhKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdGhpcy5ibG9ja1JlZ2lzdHJ5LnNldChuYW1lLCB7XG4gICAgICBlbGVtZW50OiBjb250YWluZXIsXG4gICAgICBibG9jayxcbiAgICAgIG5vdGVQYXRoOiB0aGlzLmN1cnJlbnROb3RlUGF0aFxuICAgIH0pO1xuXG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyh0YWJsZUNvbnRhaW5lcik7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5Vmlldyh2aWV3OiAnc3ZnJyB8ICd0YWJsZScsIGNvbnRlbnRXcmFwOiBIVE1MRWxlbWVudCwgc3ZnRWw6IEhUTUxFbGVtZW50LCB0YWJsZUVsOiBIVE1MRWxlbWVudCwgYnRuOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRlbnRXcmFwLnNldEF0dHJpYnV0ZSgnZGF0YS12aWV3Jywgdmlldyk7XG4gICAgYnRuLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi10b2dnbGUtb3B0aW9uJykuZm9yRWFjaChvcHQgPT4ge1xuICAgICAgb3B0LmNsYXNzTGlzdC50b2dnbGUoJ2JmLXRvZ2dsZS1hY3RpdmUnLCBvcHQuZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSA9PT0gdmlldyk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVRvZ2dsZUJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IGJ0biA9IHBhcmVudC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi12aWV3LXRvZ2dsZScgfSk7XG4gICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn5L2N5Z+f5Zu+JywgY2xzOiAnYmYtdG9nZ2xlLW9wdGlvbiBiZi10b2dnbGUtc3ZnJywgYXR0cjogeyAnZGF0YS12aWV3JzogJ3N2ZycgfSB9KTtcbiAgICBidG4uY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfooajmoLwnLCBjbHM6ICdiZi10b2dnbGUtb3B0aW9uIGJmLXRvZ2dsZS10YWJsZScsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICd0YWJsZScgfSB9KTtcbiAgICByZXR1cm4gYnRuO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJFcnJvcnMoZWw6IEhUTUxFbGVtZW50LCBlcnJvcnM6IHsgbGluZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IHN1Z2dlc3Rpb24/OiBzdHJpbmcgfVtdKSB7XG4gICAgZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1lcnJvcicgfSwgKGVycm9yRWwpID0+IHtcbiAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfop6PmnpDplJnor686JyB9KTtcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XG4gICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDooYwgJHtlcnJvci5saW5lfTogJHtlcnJvci5tZXNzYWdlfWAgfSk7XG4gICAgICAgIGlmIChlcnJvci5zdWdnZXN0aW9uKSB7XG4gICAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOW7uuiurjogJHtlcnJvci5zdWdnZXN0aW9ufWAsIGNsczogJ3N1Z2dlc3Rpb24nIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyDilIDilIDilIAg54K55Ye76Lez6L2sIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XG4gICAgICAgIGlmIChyZWZOYW1lKSB0aGlzLnNjcm9sbFRvQmxvY2socmVmTmFtZSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2Nyb2xsVG9CbG9jayhibG9ja05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHJldHVybjtcbiAgICBlbnRyeS5lbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG4gICAgZW50cnkuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdiZi1oaWdobGlnaHQnKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtaGlnaGxpZ2h0JyksIDE1MDApO1xuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOaCrOa1riB0b29sdGlwIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAvLyDpvKDmoIflm57liLDmupDlhYPntKDkuIrvvIzlj5bmtojlvoXliKDpmaTlrprml7blmahcbiAgICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKTtcbiAgICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0Vmlld0ZvckJsb2NrKHJlZk5hbWUpO1xuICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY2hlZHVsZVRvb2x0aXBSZW1vdmUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xuICAgICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcbiAgICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW91dCcsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqIOiOt+WPluiiq+W8leeUqOWdl+iHqui6q+eahOinhuWbvueKtuaAge+8jOS4jeWtmOWcqOWImeeUqOm7mOiupOWBj+WlvSAqL1xuICBwcml2YXRlIGdldFZpZXdGb3JCbG9jayhibG9ja05hbWU6IHN0cmluZyk6ICdzdmcnIHwgJ3RhYmxlJyB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKGVudHJ5KSB7XG4gICAgICBjb25zdCBjb250ZW50V3JhcCA9IGVudHJ5LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLnZlcmlsb2ctYml0ZmllbGQtY29udGVudCcpO1xuICAgICAgY29uc3QgdmlldyA9IGNvbnRlbnRXcmFwPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmICh2aWV3KSByZXR1cm4gdmlldztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCkge1xuICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICB9LCAyMDApO1xuICB9XG5cbiAgcHJpdmF0ZSBzaG93VG9vbHRpcChibG9ja05hbWU6IHN0cmluZywgbW91c2VYOiBudW1iZXIsIG1vdXNlWTogbnVtYmVyLCB2aWV3OiAnc3ZnJyB8ICd0YWJsZScpIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcbiAgICBpZiAoIWVudHJ5KSByZXR1cm47XG5cbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcblxuICAgIGNvbnN0IHRvb2x0aXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0b29sdGlwLmNsYXNzTmFtZSA9ICdiZi10b29sdGlwJztcblxuICAgIGNvbnN0IGRlc2MgPSBlbnRyeS5ibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7ZW50cnkuYmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGAke2Jsb2NrTmFtZX0ke2Rlc2N9YCwgY2xzOiAnYmYtdG9vbHRpcC1oZWFkZXInIH0pO1xuXG4gICAgaWYgKHZpZXcgPT09ICdzdmcnKSB7XG4gICAgICBjb25zdCBzdmdXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXN2ZycgfSk7XG4gICAgICBzdmdXcmFwLmlubmVySFRNTCA9IHJlbmRlckJsb2NrU3ZnKGVudHJ5LmJsb2NrKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdGFibGVXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXRhYmxlJyB9KTtcbiAgICAgIHRhYmxlV3JhcC5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1RhYmxlKGVudHJ5LmJsb2NrKTtcbiAgICB9XG5cbiAgICB0b29sdGlwLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAn5Y2V5Ye76Lez6L2s5p+l55yL5a6M5pW05a6a5LmJJywgY2xzOiAnYmYtdG9vbHRpcC1oaW50JyB9KTtcblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodG9vbHRpcCk7XG4gICAgdGhpcy5hY3RpdmVUb29sdGlwID0gdG9vbHRpcDtcblxuICAgIGNvbnN0IHJlY3QgPSB0b29sdGlwLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGxldCBsZWZ0ID0gbW91c2VYICsgMTI7XG4gICAgbGV0IHRvcCA9IG1vdXNlWSAtIDIwO1xuICAgIGlmIChsZWZ0ICsgcmVjdC53aWR0aCA+IHdpbmRvdy5pbm5lcldpZHRoIC0gMTYpIGxlZnQgPSBtb3VzZVggLSByZWN0LndpZHRoIC0gMTI7XG4gICAgaWYgKHRvcCArIHJlY3QuaGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0IC0gMTYpIHRvcCA9IHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gMTY7XG4gICAgaWYgKHRvcCA8IDgpIHRvcCA9IDg7XG5cbiAgICB0b29sdGlwLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICB0b29sdGlwLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG4gICAgLy8g6byg5qCH6L+b5YWlIHRvb2x0aXAg5pe25Y+W5raI5b6F5Yig6Zmk5a6a5pe25ZmoXG4gICAgdG9vbHRpcC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XG4gICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB0aGlzLnJlbW92ZVRvb2x0aXAoKSk7XG4gIH1cblxuICBwcml2YXRlIHJlbW92ZVRvb2x0aXAoKSB7XG4gICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCkge1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwLnJlbW92ZSgpO1xuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyDilIDilIDilIAg5byV55So6Kej5p6QIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgY29sbGVjdFBlbmRpbmdSZWZzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtcmVmXScpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCByZWZOYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpITtcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5LmhhcyhyZWZOYW1lKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZTogcmVmTmFtZSB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmJmLXJlZi1saW5rJykuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0JykhO1xuICAgICAgaWYgKCF0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHRhcmdldE5hbWUpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1JlZnMucHVzaCh7IGVsZW1lbnQ6IGVsIGFzIEhUTUxFbGVtZW50LCB0YXJnZXROYW1lIH0pO1xuICAgICAgICAoZWwgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5hZGQoJ2JmLXJlZi11bnJlc29sdmVkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVQZW5kaW5nUmVmcygpIHtcbiAgICBjb25zdCBzdGlsbFBlbmRpbmc6IHR5cGVvZiB0aGlzLnBlbmRpbmdSZWZzID0gW107XG4gICAgZm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMucGVuZGluZ1JlZnMpIHtcbiAgICAgIGlmICh0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHBlbmRpbmcudGFyZ2V0TmFtZSkpIHtcbiAgICAgICAgcGVuZGluZy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JmLXJlZi11bnJlc29sdmVkJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGlsbFBlbmRpbmcucHVzaChwZW5kaW5nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5wZW5kaW5nUmVmcyA9IHN0aWxsUGVuZGluZztcbiAgfVxufVxuIl0sIm5hbWVzIjpbImkiLCJQbHVnaW4i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
