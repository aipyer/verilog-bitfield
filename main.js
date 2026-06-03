'use strict';

var obsidian = require('obsidian');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/**
 * 解析 Verilog 位域定义
 * 统一语法：每个代码块由一个或多个 definition block 组成
 * 每个块：第一行 name width [description]，子字段通过缩进嵌套
 */
function parse(input) {
    const lines = input.split('\n');
    const errors = [];
    const blocks = new Map();
    const blockNames = new Set();
    // 预处理：过滤空行和注释
    const rawLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('//')) {
            continue;
        }
        rawLines.push({
            lineNum: i + 1,
            indent: line.search(/\S/),
            content: line.trim()
        });
    }
    if (rawLines.length === 0) {
        return { success: false, errors: [{ line: 0, message: '输入为空' }] };
    }
    // 逐行解析，indent=0 的行作为块头
    let i = 0;
    while (i < rawLines.length) {
        const rl = rawLines[i];
        if (rl.indent !== 0) {
            errors.push({ line: rl.lineNum, message: `意外的缩进行: "${rl.content}"` });
            i++;
            continue;
        }
        const match = rl.content.match(/^(\w+)\s+(\d+)\s*(.*)?$/);
        if (!match) {
            errors.push({ line: rl.lineNum, message: `无法解析: "${rl.content}"` });
            i++;
            continue;
        }
        const [, name, widthStr, desc] = match;
        if (blockNames.has(name)) {
            errors.push({
                line: rl.lineNum,
                message: `重复定义: "${name}"`,
                suggestion: '同笔记内块名必须唯一'
            });
            i++;
            continue;
        }
        blockNames.add(name);
        const block = {
            name,
            width: parseInt(widthStr, 10),
            description: (desc === null || desc === void 0 ? void 0 : desc.trim()) || undefined,
            children: []
        };
        // 收集子字段（连续的缩进行）
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
        // 验证位宽
        validateBitWidths(block.children, errors);
        blocks.set(name, block);
    }
    if (blocks.size === 0) {
        return { success: false, errors: [{ line: 0, message: '未找到有效的定义块' }] };
    }
    if (errors.length > 0) {
        return { success: false, errors };
    }
    return { success: true, blocks };
}
/**
 * 解析子字段列表
 */
function parseChildren(lines, children, errors, baseIndent, parentName) {
    const stack = [];
    for (const rl of lines) {
        const match = rl.content.match(/^(@?\w+)\s+(\d+)\s*(.*)?$/);
        if (!match) {
            errors.push({ line: rl.lineNum, message: `无法解析: "${rl.content}"` });
            continue;
        }
        const [, name, widthStr, desc] = match;
        const width = parseInt(widthStr, 10);
        const isReference = name.startsWith('@');
        const refName = isReference ? name.slice(1) : name;
        // 嵌套层级检查
        const depth = Math.floor((rl.indent - baseIndent) / 2) + 1;
        if (depth > 5) {
            errors.push({ line: rl.lineNum, message: `嵌套层级过深 (${depth} 层)，最多 5 层` });
            continue;
        }
        const field = {
            name: refName,
            width,
            msb: 0,
            lsb: 0,
            description: (desc === null || desc === void 0 ? void 0 : desc.trim()) || undefined,
            isReserved: name.toLowerCase() === 'reserved',
            isReference,
            refName: isReference ? refName : undefined,
            children: []
        };
        // 找父字段：从栈中找缩进比当前小的最后一个
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
            if (!parent.children)
                parent.children = [];
            parent.children.push(field);
        }
        else {
            children.push(field);
        }
        stack.push({ field, indent: rl.indent });
    }
}
/**
 * 计算 bit 范围
 * 靠前定义的是 LSB，靠后定义的是 MSB
 */
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
/**
 * 当子字段总位宽不够时，在 MSB 端自动补 reserved
 */
function autoFillReserved(fields, parentWidth) {
    const totalChildWidth = fields.reduce((sum, f) => sum + f.width, 0);
    const remaining = parentWidth - totalChildWidth;
    if (remaining > 0) {
        const reserved = {
            name: 'reserved',
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
/**
 * 验证位宽
 */
function validateBitWidths(fields, errors) {
    for (const field of fields) {
        const children = field.children || [];
        if (children.length > 0) {
            const childrenWidth = children.reduce((sum, child) => sum + child.width, 0);
            if (childrenWidth > field.width) {
                errors.push({
                    line: 0,
                    message: `字段 "${field.name}" 子字段位宽超出`,
                    suggestion: `父字段: ${field.width}-bit, 子字段总和: ${childrenWidth}-bit, 剩余空间: ${field.width - childrenWidth}-bit`
                });
            }
            validateBitWidths(children, errors);
        }
    }
}

/**
 * 颜色方案
 */
// 主色（顶层字段）
const MAIN_COLORS = [
    '#4A90D9', // 蓝
    '#5CB85C', // 绿
    '#F0AD4E', // 橙
    '#9B59B6', // 紫
    '#1ABC9C', // 青
    '#E74C3C', // 红
];
// 保留色
const RESERVED_COLOR = '#E0E0E0';
/**
 * 获取字段颜色
 * @param index 字段索引
 * @param isReserved 是否为 reserved
 * @param depth 嵌套深度（0 = 顶层）
 */
function getFieldColor(index, isReserved, depth = 0) {
    if (isReserved) {
        return RESERVED_COLOR;
    }
    const baseColor = MAIN_COLORS[index % MAIN_COLORS.length];
    if (depth === 0) {
        return baseColor;
    }
    // 子字段：基于父色调整亮度
    return adjustBrightness(baseColor, depth * 15);
}
/**
 * 调整颜色亮度
 * @param hex 十六进制颜色
 * @param percent 亮度调整百分比（正数变亮，负数变暗）
 */
function adjustBrightness(hex, percent) {
    // 移除 # 前缀
    hex = hex.replace('#', '');
    // 解析 RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // 调整亮度
    const adjust = (channel) => {
        const adjusted = Math.round(channel + (255 - channel) * (percent / 100));
        return Math.min(255, Math.max(0, adjusted));
    };
    const newR = adjust(r);
    const newG = adjust(g);
    const newB = adjust(b);
    // 转换回十六进制
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

/**
 * 计算字段标签所需的最小宽度（像素）
 */
function calcMinLabelWidth(label, fontSize) {
    return label.length * fontSize * 0.6 + 20;
}
/**
 * 判断是否应使用纵向布局
 */
function shouldUseVertical(fields, totalWidth) {
    if (totalWidth > 64)
        return true;
    const svgWidth = 1000;
    const availableWidth = svgWidth - 120;
    for (const field of fields) {
        const fieldName = field.isReserved ? 'reserved' : (field.isReference ? `@${field.refName}` : field.name);
        const label = `${fieldName}[${field.msb}:${field.lsb}]`;
        const widthRatio = field.width / totalWidth;
        const boxWidth = widthRatio * availableWidth;
        const minWidth = calcMinLabelWidth(label, 14);
        if (boxWidth < minWidth)
            return true;
    }
    return false;
}
/**
 * 渲染块的 SVG 位域图
 */
function renderBlockSvg(block) {
    const config = {
        totalWidth: block.width,
        isVertical: shouldUseVertical(block.children, block.width),
        boxHeight: 60,
        fontSize: 14
    };
    if (config.isVertical) {
        return renderVertical(block.children, config);
    }
    else {
        return renderHorizontal(block.children, config);
    }
}
/**
 * 横向渲染
 */
function renderHorizontal(fields, config) {
    const svgWidth = 1000;
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
    svg += '</svg>';
    return svg;
}
/**
 * 纵向渲染（viewBox 宽度与横向一致，保持字体视觉大小一致）
 */
function renderVertical(fields, config) {
    const svgWidth = 1000;
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
    svg += '</svg>';
    return svg;
}
/**
 * 渲染字段框
 */
function renderFieldBox(field, x, y, width, height, color, fontSize) {
    let svg = '';
    const isRef = field.isReference;
    const isRsv = field.isReserved;
    const fieldName = isRsv ? 'reserved' : (isRef ? `@${field.refName}` : field.name);
    const strokeColor = isRef ? '#4A90D9' : '#fff';
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="${strokeColor}" stroke-width="2" rx="4" ry="4" data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ''} style="cursor:${isRef ? 'pointer' : 'default'}"/>`;
    const label = `${fieldName}[${field.msb}:${field.lsb}]`;
    const textX = x + width / 2;
    const textY = y + height / 2 + fontSize * 0.35;
    const textWidth = width - 16;
    const maxChars = Math.floor(textWidth / (fontSize * 0.6));
    let displayText = label;
    if (label.length > maxChars && maxChars > 3) {
        displayText = label.substring(0, maxChars - 2) + '..';
    }
    const textDecoration = isRef ? ' text-decoration="underline"' : '';
    const fillColor = isRsv ? '#888' : '#fff';
    svg += `<text x="${textX}" y="${textY}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="${fillColor}" font-family="monospace"${textDecoration} data-field="${fieldName}"${isRef ? ` data-ref="${field.refName}"` : ''} style="cursor:${isRef ? 'pointer' : 'default'}">${displayText}</text>`;
    return svg;
}

/**
 * 渲染块的 HTML 表格
 */
function renderBlockTable(block) {
    const rows = [];
    for (const child of block.children) {
        collectRows(child, 0, rows);
    }
    let html = '<table class="verilog-bitfield-table">';
    html += '<thead><tr>';
    html += '<th>字段名</th>';
    html += '<th>位宽</th>';
    html += '<th>Bit 范围</th>';
    html += '<th>描述</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    html += rows.join('');
    html += '</tbody></table>';
    return html;
}
/**
 * 递归收集表格行
 */
function collectRows(field, depth, rows) {
    const indent = depth > 0 ? '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth) : '';
    const isRef = field.isReference;
    const isRsv = field.isReserved;
    const name = isRsv ? 'reserved' : (isRef ? `@${field.refName}` : field.name);
    const bitRange = `[${field.msb}:${field.lsb}]`;
    const description = field.description || '';
    let rowClass = '';
    if (isRsv)
        rowClass = ' class="reserved-row"';
    else if (isRef)
        rowClass = ' class="ref-child"';
    const nameCell = isRef
        ? `<a href="#" class="bf-ref-link" data-target="${field.refName}">${indent}${name}</a>`
        : `${indent}${name}`;
    rows.push(`<tr${rowClass}>`);
    rows.push(`<td>${nameCell}</td>`);
    rows.push(`<td>${field.width}</td>`);
    rows.push(`<td>${bitRange}</td>`);
    rows.push(`<td>${description}</td>`);
    rows.push('</tr>');
    if (field.children && field.children.length > 0) {
        for (const child of field.children) {
            collectRows(child, depth + 1, rows);
        }
    }
}

const DEFAULT_DATA = { defaultView: 'svg' };
class VerilogBitfieldPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.blockRegistry = new Map();
        this.pendingRefs = [];
        this.currentNotePath = '';
        this.activeTooltip = null;
        this.currentView = 'svg';
        this.pluginData = DEFAULT_DATA;
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.pluginData = Object.assign({}, DEFAULT_DATA, yield this.loadData());
            this.currentView = this.pluginData.defaultView || 'svg';
            this.registerMarkdownCodeBlockProcessor('verilog-bitfield', this.processBitfield.bind(this));
        });
    }
    onunload() {
        this.blockRegistry.clear();
        this.pendingRefs = [];
        this.removeTooltip();
    }
    processBitfield(source, el, ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            this.currentNotePath = ctx.sourcePath || '';
            const result = parse(source);
            if (!result.success) {
                this.renderErrors(el, result.errors || []);
                return;
            }
            // 每个块独立渲染
            for (const [name, block] of result.blocks) {
                this.renderBlock(name, block, el);
            }
            setTimeout(() => this.resolvePendingRefs(), 50);
        });
    }
    /**
     * 渲染单个块：标题 + 切换按钮 + SVG/表格
     */
    renderBlock(name, block, parentEl) {
        const container = parentEl.createEl('div', {
            cls: 'verilog-bitfield-container',
            attr: { id: `bf:${name}` }
        });
        // 标题行
        const headerRow = container.createEl('div', { cls: 'verilog-bitfield-header-row' });
        const desc = block.description ? ` — ${block.description}` : '';
        headerRow.createEl('span', {
            text: `${name}${desc} 的字段定义如下：`,
            cls: 'verilog-bitfield-header'
        });
        const toggleBtn = this.createToggleButton(headerRow);
        // 内容区域
        const contentWrap = container.createEl('div', { cls: 'verilog-bitfield-content' });
        const svgContainer = contentWrap.createEl('div', { cls: 'verilog-bitfield-svg' });
        svgContainer.innerHTML = renderBlockSvg(block);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
        const tableContainer = contentWrap.createEl('div', { cls: 'verilog-bitfield-table-container' });
        tableContainer.innerHTML = renderBlockTable(block);
        this.setupTableNavigationHandlers(tableContainer);
        this.setupTableTooltipHandlers(tableContainer);
        this.bindToggle(toggleBtn, svgContainer, tableContainer);
        // 注册
        this.blockRegistry.set(name, {
            element: container,
            block,
            notePath: this.currentNotePath
        });
        // 收集待解析引用
        this.collectPendingRefs(svgContainer);
        this.collectPendingRefs(tableContainer);
    }
    createToggleButton(parent) {
        const btn = parent.createEl('div', { cls: 'bf-view-toggle' });
        btn.createEl('span', { text: '位域图', cls: 'bf-toggle-option bf-toggle-svg bf-toggle-active', attr: { 'data-view': 'svg' } });
        btn.createEl('span', { text: '表格', cls: 'bf-toggle-option bf-toggle-table', attr: { 'data-view': 'table' } });
        return btn;
    }
    bindToggle(btn, svgEl, tableEl) {
        const applyView = (view) => {
            this.currentView = view;
            // inline style 覆盖 CSS 默认值，PDF 导出时会被保留
            svgEl.style.display = view === 'svg' ? 'block' : 'none';
            tableEl.style.display = view === 'table' ? 'block' : 'none';
            btn.querySelectorAll('.bf-toggle-option').forEach(opt => {
                opt.classList.toggle('bf-toggle-active', opt.getAttribute('data-view') === view);
            });
        };
        applyView(this.currentView);
        btn.onclick = (e) => {
            const target = e.target;
            const view = target.getAttribute('data-view');
            if (view) {
                applyView(view);
                this.pluginData.defaultView = view;
                this.saveData(this.pluginData);
            }
        };
    }
    renderErrors(el, errors) {
        el.createEl('div', { cls: 'verilog-bitfield-error' }, (errorEl) => {
            errorEl.createEl('p', { text: '解析错误:' });
            for (const error of errors) {
                errorEl.createEl('p', { text: `行 ${error.line}: ${error.message}` });
                if (error.suggestion) {
                    errorEl.createEl('p', { text: `建议: ${error.suggestion}`, cls: 'suggestion' });
                }
            }
        });
    }
    // ─── 点击跳转 ───
    setupNavigationHandlers(container) {
        container.onclick = (e) => {
            var _a;
            const target = e.target;
            const refName = target.getAttribute('data-ref')
                || ((_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.getAttribute('data-ref'));
            if (refName) {
                this.scrollToBlock(refName);
            }
        };
    }
    setupTableNavigationHandlers(container) {
        container.onclick = (e) => {
            const target = e.target;
            if (target.classList.contains('bf-ref-link')) {
                e.preventDefault();
                const refName = target.getAttribute('data-target');
                if (refName) {
                    this.scrollToBlock(refName);
                }
            }
        };
    }
    scrollToBlock(blockName) {
        const entry = this.blockRegistry.get(blockName);
        if (!entry) {
            console.warn(`[verilog-bitfield] 未找到定义块: ${blockName}`);
            return;
        }
        entry.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        entry.element.classList.add('bf-highlight');
        setTimeout(() => {
            entry.element.classList.remove('bf-highlight');
        }, 1500);
    }
    // ─── 悬浮 tooltip ───
    setupTooltipHandlers(container) {
        container.addEventListener('mouseover', (e) => {
            var _a;
            const target = e.target;
            const refName = target.getAttribute('data-ref')
                || ((_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.getAttribute('data-ref'));
            if (refName) {
                this.showTooltip(refName, e.clientX, e.clientY);
            }
        });
        container.addEventListener('mouseout', (e) => {
            var _a;
            const target = e.target;
            const refName = target.getAttribute('data-ref')
                || ((_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.getAttribute('data-ref'));
            if (refName) {
                setTimeout(() => {
                    if (this.activeTooltip && !this.activeTooltip.matches(':hover')) {
                        this.removeTooltip();
                    }
                }, 200);
            }
        });
    }
    setupTableTooltipHandlers(container) {
        container.addEventListener('mouseover', (e) => {
            const target = e.target;
            if (target.classList.contains('bf-ref-link')) {
                const refName = target.getAttribute('data-target');
                if (refName) {
                    this.showTooltip(refName, e.clientX, e.clientY);
                }
            }
        });
        container.addEventListener('mouseout', (e) => {
            const target = e.target;
            if (target.classList.contains('bf-ref-link')) {
                setTimeout(() => {
                    if (this.activeTooltip && !this.activeTooltip.matches(':hover')) {
                        this.removeTooltip();
                    }
                }, 200);
            }
        });
    }
    showTooltip(blockName, mouseX, mouseY) {
        const entry = this.blockRegistry.get(blockName);
        if (!entry)
            return;
        this.removeTooltip();
        const tooltip = document.createElement('div');
        tooltip.className = 'bf-tooltip';
        const desc = entry.block.description ? ` — ${entry.block.description}` : '';
        tooltip.createEl('p', {
            text: `${blockName}${desc}`,
            cls: 'bf-tooltip-header'
        });
        if (this.currentView === 'svg') {
            const svgWrap = tooltip.createEl('div', { cls: 'bf-tooltip-svg' });
            svgWrap.innerHTML = renderBlockSvg(entry.block);
        }
        else {
            const tableWrap = tooltip.createEl('div', { cls: 'bf-tooltip-table' });
            tableWrap.innerHTML = renderBlockTable(entry.block);
        }
        tooltip.createEl('p', {
            text: '单击跳转查看完整定义',
            cls: 'bf-tooltip-hint'
        });
        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;
        const rect = tooltip.getBoundingClientRect();
        let left = mouseX + 12;
        let top = mouseY - 20;
        if (left + rect.width > window.innerWidth - 16) {
            left = mouseX - rect.width - 12;
        }
        if (top + rect.height > window.innerHeight - 16) {
            top = window.innerHeight - rect.height - 16;
        }
        if (top < 8)
            top = 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.addEventListener('mouseleave', () => {
            this.removeTooltip();
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
        container.querySelectorAll('[data-ref]').forEach((el) => {
            const refName = el.getAttribute('data-ref');
            if (!this.blockRegistry.has(refName)) {
                this.pendingRefs.push({ element: el, targetName: refName });
            }
        });
        container.querySelectorAll('.bf-ref-link').forEach((el) => {
            const targetName = el.getAttribute('data-target');
            if (!this.blockRegistry.has(targetName)) {
                this.pendingRefs.push({ element: el, targetName });
                el.classList.add('bf-ref-unresolved');
            }
        });
    }
    resolvePendingRefs() {
        const stillPending = [];
        for (const pending of this.pendingRefs) {
            if (this.blockRegistry.has(pending.targetName)) {
                pending.element.classList.remove('bf-ref-unresolved');
            }
            else {
                stillPending.push(pending);
            }
        }
        this.pendingRefs = stillPending;
    }
}

module.exports = VerilogBitfieldPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInNyYy9maWxlOi9FOi9kZXYvdmVyaWxvZy1iaXRmaWVsZC9zcmMvcGFyc2VyLnRzIiwic3JjL2ZpbGU6L0U6L2Rldi92ZXJpbG9nLWJpdGZpZWxkL3NyYy9jb2xvcnMudHMiLCJzcmMvZmlsZTovRTovZGV2L3Zlcmlsb2ctYml0ZmllbGQvc3JjL3N2Z1JlbmRlcmVyLnRzIiwic3JjL2ZpbGU6L0U6L2Rldi92ZXJpbG9nLWJpdGZpZWxkL3NyYy90YWJsZVJlbmRlcmVyLnRzIiwic3JjL2ZpbGU6L0U6L2Rldi92ZXJpbG9nLWJpdGZpZWxkL3NyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uXHJcblxyXG5QZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQvb3IgZGlzdHJpYnV0ZSB0aGlzIHNvZnR3YXJlIGZvciBhbnlcclxucHVycG9zZSB3aXRoIG9yIHdpdGhvdXQgZmVlIGlzIGhlcmVieSBncmFudGVkLlxyXG5cclxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiBBTkQgVEhFIEFVVEhPUiBESVNDTEFJTVMgQUxMIFdBUlJBTlRJRVMgV0lUSFxyXG5SRUdBUkQgVE8gVEhJUyBTT0ZUV0FSRSBJTkNMVURJTkcgQUxMIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFlcclxuQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUiBBTlkgU1BFQ0lBTCwgRElSRUNULFxyXG5JTkRJUkVDVCwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIE9SIEFOWSBEQU1BR0VTIFdIQVRTT0VWRVIgUkVTVUxUSU5HIEZST01cclxuTE9TUyBPRiBVU0UsIERBVEEgT1IgUFJPRklUUywgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1JcclxuT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFVTRSBPUlxyXG5QRVJGT1JNQU5DRSBPRiBUSElTIFNPRlRXQVJFLlxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG4vKiBnbG9iYWwgUmVmbGVjdCwgUHJvbWlzZSwgU3VwcHJlc3NlZEVycm9yLCBTeW1ib2wsIEl0ZXJhdG9yICovXHJcblxyXG52YXIgZXh0ZW5kU3RhdGljcyA9IGZ1bmN0aW9uKGQsIGIpIHtcclxuICAgIGV4dGVuZFN0YXRpY3MgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YgfHxcclxuICAgICAgICAoeyBfX3Byb3RvX186IFtdIH0gaW5zdGFuY2VvZiBBcnJheSAmJiBmdW5jdGlvbiAoZCwgYikgeyBkLl9fcHJvdG9fXyA9IGI7IH0pIHx8XHJcbiAgICAgICAgZnVuY3Rpb24gKGQsIGIpIHsgZm9yICh2YXIgcCBpbiBiKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGIsIHApKSBkW3BdID0gYltwXTsgfTtcclxuICAgIHJldHVybiBleHRlbmRTdGF0aWNzKGQsIGIpO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXh0ZW5kcyhkLCBiKSB7XHJcbiAgICBpZiAodHlwZW9mIGIgIT09IFwiZnVuY3Rpb25cIiAmJiBiICE9PSBudWxsKVxyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDbGFzcyBleHRlbmRzIHZhbHVlIFwiICsgU3RyaW5nKGIpICsgXCIgaXMgbm90IGEgY29uc3RydWN0b3Igb3IgbnVsbFwiKTtcclxuICAgIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbiAgICBmdW5jdGlvbiBfXygpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGQ7IH1cclxuICAgIGQucHJvdG90eXBlID0gYiA9PT0gbnVsbCA/IE9iamVjdC5jcmVhdGUoYikgOiAoX18ucHJvdG90eXBlID0gYi5wcm90b3R5cGUsIG5ldyBfXygpKTtcclxufVxyXG5cclxuZXhwb3J0IHZhciBfX2Fzc2lnbiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgX19hc3NpZ24gPSBPYmplY3QuYXNzaWduIHx8IGZ1bmN0aW9uIF9fYXNzaWduKHQpIHtcclxuICAgICAgICBmb3IgKHZhciBzLCBpID0gMSwgbiA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcclxuICAgICAgICAgICAgcyA9IGFyZ3VtZW50c1tpXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgcCBpbiBzKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHMsIHApKSB0W3BdID0gc1twXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHQ7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gX19hc3NpZ24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcmVzdChzLCBlKSB7XHJcbiAgICB2YXIgdCA9IHt9O1xyXG4gICAgZm9yICh2YXIgcCBpbiBzKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHMsIHApICYmIGUuaW5kZXhPZihwKSA8IDApXHJcbiAgICAgICAgdFtwXSA9IHNbcF07XHJcbiAgICBpZiAocyAhPSBudWxsICYmIHR5cGVvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzID09PSBcImZ1bmN0aW9uXCIpXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIHAgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHMpOyBpIDwgcC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoZS5pbmRleE9mKHBbaV0pIDwgMCAmJiBPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwocywgcFtpXSkpXHJcbiAgICAgICAgICAgICAgICB0W3BbaV1dID0gc1twW2ldXTtcclxuICAgICAgICB9XHJcbiAgICByZXR1cm4gdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZGVjb3JhdGUoZGVjb3JhdG9ycywgdGFyZ2V0LCBrZXksIGRlc2MpIHtcclxuICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aCwgciA9IGMgPCAzID8gdGFyZ2V0IDogZGVzYyA9PT0gbnVsbCA/IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwga2V5KSA6IGRlc2MsIGQ7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QuZGVjb3JhdGUgPT09IFwiZnVuY3Rpb25cIikgciA9IFJlZmxlY3QuZGVjb3JhdGUoZGVjb3JhdG9ycywgdGFyZ2V0LCBrZXksIGRlc2MpO1xyXG4gICAgZWxzZSBmb3IgKHZhciBpID0gZGVjb3JhdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkgaWYgKGQgPSBkZWNvcmF0b3JzW2ldKSByID0gKGMgPCAzID8gZChyKSA6IGMgPiAzID8gZCh0YXJnZXQsIGtleSwgcikgOiBkKHRhcmdldCwga2V5KSkgfHwgcjtcclxuICAgIHJldHVybiBjID4gMyAmJiByICYmIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGtleSwgciksIHI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3BhcmFtKHBhcmFtSW5kZXgsIGRlY29yYXRvcikge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQsIGtleSkgeyBkZWNvcmF0b3IodGFyZ2V0LCBrZXksIHBhcmFtSW5kZXgpOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2VzRGVjb3JhdGUoY3RvciwgZGVzY3JpcHRvckluLCBkZWNvcmF0b3JzLCBjb250ZXh0SW4sIGluaXRpYWxpemVycywgZXh0cmFJbml0aWFsaXplcnMpIHtcclxuICAgIGZ1bmN0aW9uIGFjY2VwdChmKSB7IGlmIChmICE9PSB2b2lkIDAgJiYgdHlwZW9mIGYgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZ1bmN0aW9uIGV4cGVjdGVkXCIpOyByZXR1cm4gZjsgfVxyXG4gICAgdmFyIGtpbmQgPSBjb250ZXh0SW4ua2luZCwga2V5ID0ga2luZCA9PT0gXCJnZXR0ZXJcIiA/IFwiZ2V0XCIgOiBraW5kID09PSBcInNldHRlclwiID8gXCJzZXRcIiA6IFwidmFsdWVcIjtcclxuICAgIHZhciB0YXJnZXQgPSAhZGVzY3JpcHRvckluICYmIGN0b3IgPyBjb250ZXh0SW5bXCJzdGF0aWNcIl0gPyBjdG9yIDogY3Rvci5wcm90b3R5cGUgOiBudWxsO1xyXG4gICAgdmFyIGRlc2NyaXB0b3IgPSBkZXNjcmlwdG9ySW4gfHwgKHRhcmdldCA/IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBjb250ZXh0SW4ubmFtZSkgOiB7fSk7XHJcbiAgICB2YXIgXywgZG9uZSA9IGZhbHNlO1xyXG4gICAgZm9yICh2YXIgaSA9IGRlY29yYXRvcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICB2YXIgY29udGV4dCA9IHt9O1xyXG4gICAgICAgIGZvciAodmFyIHAgaW4gY29udGV4dEluKSBjb250ZXh0W3BdID0gcCA9PT0gXCJhY2Nlc3NcIiA/IHt9IDogY29udGV4dEluW3BdO1xyXG4gICAgICAgIGZvciAodmFyIHAgaW4gY29udGV4dEluLmFjY2VzcykgY29udGV4dC5hY2Nlc3NbcF0gPSBjb250ZXh0SW4uYWNjZXNzW3BdO1xyXG4gICAgICAgIGNvbnRleHQuYWRkSW5pdGlhbGl6ZXIgPSBmdW5jdGlvbiAoZikgeyBpZiAoZG9uZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCBhZGQgaW5pdGlhbGl6ZXJzIGFmdGVyIGRlY29yYXRpb24gaGFzIGNvbXBsZXRlZFwiKTsgZXh0cmFJbml0aWFsaXplcnMucHVzaChhY2NlcHQoZiB8fCBudWxsKSk7IH07XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9ICgwLCBkZWNvcmF0b3JzW2ldKShraW5kID09PSBcImFjY2Vzc29yXCIgPyB7IGdldDogZGVzY3JpcHRvci5nZXQsIHNldDogZGVzY3JpcHRvci5zZXQgfSA6IGRlc2NyaXB0b3Jba2V5XSwgY29udGV4dCk7XHJcbiAgICAgICAgaWYgKGtpbmQgPT09IFwiYWNjZXNzb3JcIikge1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0ID09PSB2b2lkIDApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0ID09PSBudWxsIHx8IHR5cGVvZiByZXN1bHQgIT09IFwib2JqZWN0XCIpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJPYmplY3QgZXhwZWN0ZWRcIik7XHJcbiAgICAgICAgICAgIGlmIChfID0gYWNjZXB0KHJlc3VsdC5nZXQpKSBkZXNjcmlwdG9yLmdldCA9IF87XHJcbiAgICAgICAgICAgIGlmIChfID0gYWNjZXB0KHJlc3VsdC5zZXQpKSBkZXNjcmlwdG9yLnNldCA9IF87XHJcbiAgICAgICAgICAgIGlmIChfID0gYWNjZXB0KHJlc3VsdC5pbml0KSkgaW5pdGlhbGl6ZXJzLnVuc2hpZnQoXyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKF8gPSBhY2NlcHQocmVzdWx0KSkge1xyXG4gICAgICAgICAgICBpZiAoa2luZCA9PT0gXCJmaWVsZFwiKSBpbml0aWFsaXplcnMudW5zaGlmdChfKTtcclxuICAgICAgICAgICAgZWxzZSBkZXNjcmlwdG9yW2tleV0gPSBfO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmICh0YXJnZXQpIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGNvbnRleHRJbi5uYW1lLCBkZXNjcmlwdG9yKTtcclxuICAgIGRvbmUgPSB0cnVlO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcnVuSW5pdGlhbGl6ZXJzKHRoaXNBcmcsIGluaXRpYWxpemVycywgdmFsdWUpIHtcclxuICAgIHZhciB1c2VWYWx1ZSA9IGFyZ3VtZW50cy5sZW5ndGggPiAyO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbml0aWFsaXplcnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YWx1ZSA9IHVzZVZhbHVlID8gaW5pdGlhbGl6ZXJzW2ldLmNhbGwodGhpc0FyZywgdmFsdWUpIDogaW5pdGlhbGl6ZXJzW2ldLmNhbGwodGhpc0FyZyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdXNlVmFsdWUgPyB2YWx1ZSA6IHZvaWQgMDtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3Byb3BLZXkoeCkge1xyXG4gICAgcmV0dXJuIHR5cGVvZiB4ID09PSBcInN5bWJvbFwiID8geCA6IFwiXCIuY29uY2F0KHgpO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc2V0RnVuY3Rpb25OYW1lKGYsIG5hbWUsIHByZWZpeCkge1xyXG4gICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN5bWJvbFwiKSBuYW1lID0gbmFtZS5kZXNjcmlwdGlvbiA/IFwiW1wiLmNvbmNhdChuYW1lLmRlc2NyaXB0aW9uLCBcIl1cIikgOiBcIlwiO1xyXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShmLCBcIm5hbWVcIiwgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiBwcmVmaXggPyBcIlwiLmNvbmNhdChwcmVmaXgsIFwiIFwiLCBuYW1lKSA6IG5hbWUgfSk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tZXRhZGF0YShtZXRhZGF0YUtleSwgbWV0YWRhdGFWYWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBSZWZsZWN0ID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiBSZWZsZWN0Lm1ldGFkYXRhID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiBSZWZsZWN0Lm1ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXdhaXRlcih0aGlzQXJnLCBfYXJndW1lbnRzLCBQLCBnZW5lcmF0b3IpIHtcclxuICAgIGZ1bmN0aW9uIGFkb3B0KHZhbHVlKSB7IHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIFAgPyB2YWx1ZSA6IG5ldyBQKGZ1bmN0aW9uIChyZXNvbHZlKSB7IHJlc29sdmUodmFsdWUpOyB9KTsgfVxyXG4gICAgcmV0dXJuIG5ldyAoUCB8fCAoUCA9IFByb21pc2UpKShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgZnVuY3Rpb24gZnVsZmlsbGVkKHZhbHVlKSB7IHRyeSB7IHN0ZXAoZ2VuZXJhdG9yLm5leHQodmFsdWUpKTsgfSBjYXRjaCAoZSkgeyByZWplY3QoZSk7IH0gfVxyXG4gICAgICAgIGZ1bmN0aW9uIHJlamVjdGVkKHZhbHVlKSB7IHRyeSB7IHN0ZXAoZ2VuZXJhdG9yW1widGhyb3dcIl0odmFsdWUpKTsgfSBjYXRjaCAoZSkgeyByZWplY3QoZSk7IH0gfVxyXG4gICAgICAgIGZ1bmN0aW9uIHN0ZXAocmVzdWx0KSB7IHJlc3VsdC5kb25lID8gcmVzb2x2ZShyZXN1bHQudmFsdWUpIDogYWRvcHQocmVzdWx0LnZhbHVlKS50aGVuKGZ1bGZpbGxlZCwgcmVqZWN0ZWQpOyB9XHJcbiAgICAgICAgc3RlcCgoZ2VuZXJhdG9yID0gZ2VuZXJhdG9yLmFwcGx5KHRoaXNBcmcsIF9hcmd1bWVudHMgfHwgW10pKS5uZXh0KCkpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2dlbmVyYXRvcih0aGlzQXJnLCBib2R5KSB7XHJcbiAgICB2YXIgXyA9IHsgbGFiZWw6IDAsIHNlbnQ6IGZ1bmN0aW9uKCkgeyBpZiAodFswXSAmIDEpIHRocm93IHRbMV07IHJldHVybiB0WzFdOyB9LCB0cnlzOiBbXSwgb3BzOiBbXSB9LCBmLCB5LCB0LCBnID0gT2JqZWN0LmNyZWF0ZSgodHlwZW9mIEl0ZXJhdG9yID09PSBcImZ1bmN0aW9uXCIgPyBJdGVyYXRvciA6IE9iamVjdCkucHJvdG90eXBlKTtcclxuICAgIHJldHVybiBnLm5leHQgPSB2ZXJiKDApLCBnW1widGhyb3dcIl0gPSB2ZXJiKDEpLCBnW1wicmV0dXJuXCJdID0gdmVyYigyKSwgdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIChnW1N5bWJvbC5pdGVyYXRvcl0gPSBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXM7IH0pLCBnO1xyXG4gICAgZnVuY3Rpb24gdmVyYihuKSB7IHJldHVybiBmdW5jdGlvbiAodikgeyByZXR1cm4gc3RlcChbbiwgdl0pOyB9OyB9XHJcbiAgICBmdW5jdGlvbiBzdGVwKG9wKSB7XHJcbiAgICAgICAgaWYgKGYpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJHZW5lcmF0b3IgaXMgYWxyZWFkeSBleGVjdXRpbmcuXCIpO1xyXG4gICAgICAgIHdoaWxlIChnICYmIChnID0gMCwgb3BbMF0gJiYgKF8gPSAwKSksIF8pIHRyeSB7XHJcbiAgICAgICAgICAgIGlmIChmID0gMSwgeSAmJiAodCA9IG9wWzBdICYgMiA/IHlbXCJyZXR1cm5cIl0gOiBvcFswXSA/IHlbXCJ0aHJvd1wiXSB8fCAoKHQgPSB5W1wicmV0dXJuXCJdKSAmJiB0LmNhbGwoeSksIDApIDogeS5uZXh0KSAmJiAhKHQgPSB0LmNhbGwoeSwgb3BbMV0pKS5kb25lKSByZXR1cm4gdDtcclxuICAgICAgICAgICAgaWYgKHkgPSAwLCB0KSBvcCA9IFtvcFswXSAmIDIsIHQudmFsdWVdO1xyXG4gICAgICAgICAgICBzd2l0Y2ggKG9wWzBdKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDA6IGNhc2UgMTogdCA9IG9wOyBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgNDogXy5sYWJlbCsrOyByZXR1cm4geyB2YWx1ZTogb3BbMV0sIGRvbmU6IGZhbHNlIH07XHJcbiAgICAgICAgICAgICAgICBjYXNlIDU6IF8ubGFiZWwrKzsgeSA9IG9wWzFdOyBvcCA9IFswXTsgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDc6IG9wID0gXy5vcHMucG9wKCk7IF8udHJ5cy5wb3AoKTsgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghKHQgPSBfLnRyeXMsIHQgPSB0Lmxlbmd0aCA+IDAgJiYgdFt0Lmxlbmd0aCAtIDFdKSAmJiAob3BbMF0gPT09IDYgfHwgb3BbMF0gPT09IDIpKSB7IF8gPSAwOyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcFswXSA9PT0gMyAmJiAoIXQgfHwgKG9wWzFdID4gdFswXSAmJiBvcFsxXSA8IHRbM10pKSkgeyBfLmxhYmVsID0gb3BbMV07IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wWzBdID09PSA2ICYmIF8ubGFiZWwgPCB0WzFdKSB7IF8ubGFiZWwgPSB0WzFdOyB0ID0gb3A7IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHQgJiYgXy5sYWJlbCA8IHRbMl0pIHsgXy5sYWJlbCA9IHRbMl07IF8ub3BzLnB1c2gob3ApOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0WzJdKSBfLm9wcy5wb3AoKTtcclxuICAgICAgICAgICAgICAgICAgICBfLnRyeXMucG9wKCk7IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG9wID0gYm9keS5jYWxsKHRoaXNBcmcsIF8pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHsgb3AgPSBbNiwgZV07IHkgPSAwOyB9IGZpbmFsbHkgeyBmID0gdCA9IDA7IH1cclxuICAgICAgICBpZiAob3BbMF0gJiA1KSB0aHJvdyBvcFsxXTsgcmV0dXJuIHsgdmFsdWU6IG9wWzBdID8gb3BbMV0gOiB2b2lkIDAsIGRvbmU6IHRydWUgfTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IHZhciBfX2NyZWF0ZUJpbmRpbmcgPSBPYmplY3QuY3JlYXRlID8gKGZ1bmN0aW9uKG8sIG0sIGssIGsyKSB7XHJcbiAgICBpZiAoazIgPT09IHVuZGVmaW5lZCkgazIgPSBrO1xyXG4gICAgdmFyIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKG0sIGspO1xyXG4gICAgaWYgKCFkZXNjIHx8IChcImdldFwiIGluIGRlc2MgPyAhbS5fX2VzTW9kdWxlIDogZGVzYy53cml0YWJsZSB8fCBkZXNjLmNvbmZpZ3VyYWJsZSkpIHtcclxuICAgICAgICBkZXNjID0geyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbVtrXTsgfSB9O1xyXG4gICAgfVxyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIGsyLCBkZXNjKTtcclxufSkgOiAoZnVuY3Rpb24obywgbSwgaywgazIpIHtcclxuICAgIGlmIChrMiA9PT0gdW5kZWZpbmVkKSBrMiA9IGs7XHJcbiAgICBvW2syXSA9IG1ba107XHJcbn0pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXhwb3J0U3RhcihtLCBvKSB7XHJcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmIChwICE9PSBcImRlZmF1bHRcIiAmJiAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG8sIHApKSBfX2NyZWF0ZUJpbmRpbmcobywgbSwgcCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3ZhbHVlcyhvKSB7XHJcbiAgICB2YXIgcyA9IHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBTeW1ib2wuaXRlcmF0b3IsIG0gPSBzICYmIG9bc10sIGkgPSAwO1xyXG4gICAgaWYgKG0pIHJldHVybiBtLmNhbGwobyk7XHJcbiAgICBpZiAobyAmJiB0eXBlb2Ygby5sZW5ndGggPT09IFwibnVtYmVyXCIpIHJldHVybiB7XHJcbiAgICAgICAgbmV4dDogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBpZiAobyAmJiBpID49IG8ubGVuZ3RoKSBvID0gdm9pZCAwO1xyXG4gICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogbyAmJiBvW2krK10sIGRvbmU6ICFvIH07XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IocyA/IFwiT2JqZWN0IGlzIG5vdCBpdGVyYWJsZS5cIiA6IFwiU3ltYm9sLml0ZXJhdG9yIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcmVhZChvLCBuKSB7XHJcbiAgICB2YXIgbSA9IHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBvW1N5bWJvbC5pdGVyYXRvcl07XHJcbiAgICBpZiAoIW0pIHJldHVybiBvO1xyXG4gICAgdmFyIGkgPSBtLmNhbGwobyksIHIsIGFyID0gW10sIGU7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIHdoaWxlICgobiA9PT0gdm9pZCAwIHx8IG4tLSA+IDApICYmICEociA9IGkubmV4dCgpKS5kb25lKSBhci5wdXNoKHIudmFsdWUpO1xyXG4gICAgfVxyXG4gICAgY2F0Y2ggKGVycm9yKSB7IGUgPSB7IGVycm9yOiBlcnJvciB9OyB9XHJcbiAgICBmaW5hbGx5IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAociAmJiAhci5kb25lICYmIChtID0gaVtcInJldHVyblwiXSkpIG0uY2FsbChpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZmluYWxseSB7IGlmIChlKSB0aHJvdyBlLmVycm9yOyB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXI7XHJcbn1cclxuXHJcbi8qKiBAZGVwcmVjYXRlZCAqL1xyXG5leHBvcnQgZnVuY3Rpb24gX19zcHJlYWQoKSB7XHJcbiAgICBmb3IgKHZhciBhciA9IFtdLCBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKylcclxuICAgICAgICBhciA9IGFyLmNvbmNhdChfX3JlYWQoYXJndW1lbnRzW2ldKSk7XHJcbiAgICByZXR1cm4gYXI7XHJcbn1cclxuXHJcbi8qKiBAZGVwcmVjYXRlZCAqL1xyXG5leHBvcnQgZnVuY3Rpb24gX19zcHJlYWRBcnJheXMoKSB7XHJcbiAgICBmb3IgKHZhciBzID0gMCwgaSA9IDAsIGlsID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHMgKz0gYXJndW1lbnRzW2ldLmxlbmd0aDtcclxuICAgIGZvciAodmFyIHIgPSBBcnJheShzKSwgayA9IDAsIGkgPSAwOyBpIDwgaWw7IGkrKylcclxuICAgICAgICBmb3IgKHZhciBhID0gYXJndW1lbnRzW2ldLCBqID0gMCwgamwgPSBhLmxlbmd0aDsgaiA8IGpsOyBqKyssIGsrKylcclxuICAgICAgICAgICAgcltrXSA9IGFbal07XHJcbiAgICByZXR1cm4gcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkQXJyYXkodG8sIGZyb20sIHBhY2spIHtcclxuICAgIGlmIChwYWNrIHx8IGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIGZvciAodmFyIGkgPSAwLCBsID0gZnJvbS5sZW5ndGgsIGFyOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGFyIHx8ICEoaSBpbiBmcm9tKSkge1xyXG4gICAgICAgICAgICBpZiAoIWFyKSBhciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGZyb20sIDAsIGkpO1xyXG4gICAgICAgICAgICBhcltpXSA9IGZyb21baV07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRvLmNvbmNhdChhciB8fCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChmcm9tKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2F3YWl0KHYpIHtcclxuICAgIHJldHVybiB0aGlzIGluc3RhbmNlb2YgX19hd2FpdCA/ICh0aGlzLnYgPSB2LCB0aGlzKSA6IG5ldyBfX2F3YWl0KHYpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY0dlbmVyYXRvcih0aGlzQXJnLCBfYXJndW1lbnRzLCBnZW5lcmF0b3IpIHtcclxuICAgIGlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNJdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICB2YXIgZyA9IGdlbmVyYXRvci5hcHBseSh0aGlzQXJnLCBfYXJndW1lbnRzIHx8IFtdKSwgaSwgcSA9IFtdO1xyXG4gICAgcmV0dXJuIGkgPSBPYmplY3QuY3JlYXRlKCh0eXBlb2YgQXN5bmNJdGVyYXRvciA9PT0gXCJmdW5jdGlvblwiID8gQXN5bmNJdGVyYXRvciA6IE9iamVjdCkucHJvdG90eXBlKSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiKSwgdmVyYihcInJldHVyblwiLCBhd2FpdFJldHVybiksIGlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIGF3YWl0UmV0dXJuKGYpIHsgcmV0dXJuIGZ1bmN0aW9uICh2KSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUodikudGhlbihmLCByZWplY3QpOyB9OyB9XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4sIGYpIHsgaWYgKGdbbl0pIHsgaVtuXSA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAoYSwgYikgeyBxLnB1c2goW24sIHYsIGEsIGJdKSA+IDEgfHwgcmVzdW1lKG4sIHYpOyB9KTsgfTsgaWYgKGYpIGlbbl0gPSBmKGlbbl0pOyB9IH1cclxuICAgIGZ1bmN0aW9uIHJlc3VtZShuLCB2KSB7IHRyeSB7IHN0ZXAoZ1tuXSh2KSk7IH0gY2F0Y2ggKGUpIHsgc2V0dGxlKHFbMF1bM10sIGUpOyB9IH1cclxuICAgIGZ1bmN0aW9uIHN0ZXAocikgeyByLnZhbHVlIGluc3RhbmNlb2YgX19hd2FpdCA/IFByb21pc2UucmVzb2x2ZShyLnZhbHVlLnYpLnRoZW4oZnVsZmlsbCwgcmVqZWN0KSA6IHNldHRsZShxWzBdWzJdLCByKTsgfVxyXG4gICAgZnVuY3Rpb24gZnVsZmlsbCh2YWx1ZSkgeyByZXN1bWUoXCJuZXh0XCIsIHZhbHVlKTsgfVxyXG4gICAgZnVuY3Rpb24gcmVqZWN0KHZhbHVlKSB7IHJlc3VtZShcInRocm93XCIsIHZhbHVlKTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKGYsIHYpIHsgaWYgKGYodiksIHEuc2hpZnQoKSwgcS5sZW5ndGgpIHJlc3VtZShxWzBdWzBdLCBxWzBdWzFdKTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY0RlbGVnYXRvcihvKSB7XHJcbiAgICB2YXIgaSwgcDtcclxuICAgIHJldHVybiBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiwgZnVuY3Rpb24gKGUpIHsgdGhyb3cgZTsgfSksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGk7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4sIGYpIHsgaVtuXSA9IG9bbl0gPyBmdW5jdGlvbiAodikgeyByZXR1cm4gKHAgPSAhcCkgPyB7IHZhbHVlOiBfX2F3YWl0KG9bbl0odikpLCBkb25lOiBmYWxzZSB9IDogZiA/IGYodikgOiB2OyB9IDogZjsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY1ZhbHVlcyhvKSB7XHJcbiAgICBpZiAoIVN5bWJvbC5hc3luY0l0ZXJhdG9yKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiU3ltYm9sLmFzeW5jSXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgdmFyIG0gPSBvW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSwgaTtcclxuICAgIHJldHVybiBtID8gbS5jYWxsKG8pIDogKG8gPSB0eXBlb2YgX192YWx1ZXMgPT09IFwiZnVuY3Rpb25cIiA/IF9fdmFsdWVzKG8pIDogb1tTeW1ib2wuaXRlcmF0b3JdKCksIGkgPSB7fSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiKSwgdmVyYihcInJldHVyblwiKSwgaVtTeW1ib2wuYXN5bmNJdGVyYXRvcl0gPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzOyB9LCBpKTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyBpW25dID0gb1tuXSAmJiBmdW5jdGlvbiAodikgeyByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkgeyB2ID0gb1tuXSh2KSwgc2V0dGxlKHJlc29sdmUsIHJlamVjdCwgdi5kb25lLCB2LnZhbHVlKTsgfSk7IH07IH1cclxuICAgIGZ1bmN0aW9uIHNldHRsZShyZXNvbHZlLCByZWplY3QsIGQsIHYpIHsgUHJvbWlzZS5yZXNvbHZlKHYpLnRoZW4oZnVuY3Rpb24odikgeyByZXNvbHZlKHsgdmFsdWU6IHYsIGRvbmU6IGQgfSk7IH0sIHJlamVjdCk7IH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fbWFrZVRlbXBsYXRlT2JqZWN0KGNvb2tlZCwgcmF3KSB7XHJcbiAgICBpZiAoT2JqZWN0LmRlZmluZVByb3BlcnR5KSB7IE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjb29rZWQsIFwicmF3XCIsIHsgdmFsdWU6IHJhdyB9KTsgfSBlbHNlIHsgY29va2VkLnJhdyA9IHJhdzsgfVxyXG4gICAgcmV0dXJuIGNvb2tlZDtcclxufTtcclxuXHJcbnZhciBfX3NldE1vZHVsZURlZmF1bHQgPSBPYmplY3QuY3JlYXRlID8gKGZ1bmN0aW9uKG8sIHYpIHtcclxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvLCBcImRlZmF1bHRcIiwgeyBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogdiB9KTtcclxufSkgOiBmdW5jdGlvbihvLCB2KSB7XHJcbiAgICBvW1wiZGVmYXVsdFwiXSA9IHY7XHJcbn07XHJcblxyXG52YXIgb3duS2V5cyA9IGZ1bmN0aW9uKG8pIHtcclxuICAgIG93bktleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyB8fCBmdW5jdGlvbiAobykge1xyXG4gICAgICAgIHZhciBhciA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGsgaW4gbykgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvLCBrKSkgYXJbYXIubGVuZ3RoXSA9IGs7XHJcbiAgICAgICAgcmV0dXJuIGFyO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBvd25LZXlzKG8pO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9faW1wb3J0U3Rhcihtb2QpIHtcclxuICAgIGlmIChtb2QgJiYgbW9kLl9fZXNNb2R1bGUpIHJldHVybiBtb2Q7XHJcbiAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICBpZiAobW9kICE9IG51bGwpIGZvciAodmFyIGsgPSBvd25LZXlzKG1vZCksIGkgPSAwOyBpIDwgay5sZW5ndGg7IGkrKykgaWYgKGtbaV0gIT09IFwiZGVmYXVsdFwiKSBfX2NyZWF0ZUJpbmRpbmcocmVzdWx0LCBtb2QsIGtbaV0pO1xyXG4gICAgX19zZXRNb2R1bGVEZWZhdWx0KHJlc3VsdCwgbW9kKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydERlZmF1bHQobW9kKSB7XHJcbiAgICByZXR1cm4gKG1vZCAmJiBtb2QuX19lc01vZHVsZSkgPyBtb2QgOiB7IGRlZmF1bHQ6IG1vZCB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEdldChyZWNlaXZlciwgc3RhdGUsIGtpbmQsIGYpIHtcclxuICAgIGlmIChraW5kID09PSBcImFcIiAmJiAhZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlByaXZhdGUgYWNjZXNzb3Igd2FzIGRlZmluZWQgd2l0aG91dCBhIGdldHRlclwiKTtcclxuICAgIGlmICh0eXBlb2Ygc3RhdGUgPT09IFwiZnVuY3Rpb25cIiA/IHJlY2VpdmVyICE9PSBzdGF0ZSB8fCAhZiA6ICFzdGF0ZS5oYXMocmVjZWl2ZXIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHJlYWQgcHJpdmF0ZSBtZW1iZXIgZnJvbSBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIGtpbmQgPT09IFwibVwiID8gZiA6IGtpbmQgPT09IFwiYVwiID8gZi5jYWxsKHJlY2VpdmVyKSA6IGYgPyBmLnZhbHVlIDogc3RhdGUuZ2V0KHJlY2VpdmVyKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fY2xhc3NQcml2YXRlRmllbGRTZXQocmVjZWl2ZXIsIHN0YXRlLCB2YWx1ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwibVwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBtZXRob2QgaXMgbm90IHdyaXRhYmxlXCIpO1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgc2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3Qgd3JpdGUgcHJpdmF0ZSBtZW1iZXIgdG8gYW4gb2JqZWN0IHdob3NlIGNsYXNzIGRpZCBub3QgZGVjbGFyZSBpdFwiKTtcclxuICAgIHJldHVybiAoa2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIsIHZhbHVlKSA6IGYgPyBmLnZhbHVlID0gdmFsdWUgOiBzdGF0ZS5zZXQocmVjZWl2ZXIsIHZhbHVlKSksIHZhbHVlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEluKHN0YXRlLCByZWNlaXZlcikge1xyXG4gICAgaWYgKHJlY2VpdmVyID09PSBudWxsIHx8ICh0eXBlb2YgcmVjZWl2ZXIgIT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHJlY2VpdmVyICE9PSBcImZ1bmN0aW9uXCIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHVzZSAnaW4nIG9wZXJhdG9yIG9uIG5vbi1vYmplY3RcIik7XHJcbiAgICByZXR1cm4gdHlwZW9mIHN0YXRlID09PSBcImZ1bmN0aW9uXCIgPyByZWNlaXZlciA9PT0gc3RhdGUgOiBzdGF0ZS5oYXMocmVjZWl2ZXIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hZGREaXNwb3NhYmxlUmVzb3VyY2UoZW52LCB2YWx1ZSwgYXN5bmMpIHtcclxuICAgIGlmICh2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZSAhPT0gdm9pZCAwKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgdmFsdWUgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBleHBlY3RlZC5cIik7XHJcbiAgICAgICAgdmFyIGRpc3Bvc2UsIGlubmVyO1xyXG4gICAgICAgIGlmIChhc3luYykge1xyXG4gICAgICAgICAgICBpZiAoIVN5bWJvbC5hc3luY0Rpc3Bvc2UpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNEaXNwb3NlIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgICAgICAgICAgZGlzcG9zZSA9IHZhbHVlW1N5bWJvbC5hc3luY0Rpc3Bvc2VdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZGlzcG9zZSA9PT0gdm9pZCAwKSB7XHJcbiAgICAgICAgICAgIGlmICghU3ltYm9sLmRpc3Bvc2UpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuZGlzcG9zZSBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICAgICAgICAgIGRpc3Bvc2UgPSB2YWx1ZVtTeW1ib2wuZGlzcG9zZV07XHJcbiAgICAgICAgICAgIGlmIChhc3luYykgaW5uZXIgPSBkaXNwb3NlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodHlwZW9mIGRpc3Bvc2UgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBub3QgZGlzcG9zYWJsZS5cIik7XHJcbiAgICAgICAgaWYgKGlubmVyKSBkaXNwb3NlID0gZnVuY3Rpb24oKSB7IHRyeSB7IGlubmVyLmNhbGwodGhpcyk7IH0gY2F0Y2ggKGUpIHsgcmV0dXJuIFByb21pc2UucmVqZWN0KGUpOyB9IH07XHJcbiAgICAgICAgZW52LnN0YWNrLnB1c2goeyB2YWx1ZTogdmFsdWUsIGRpc3Bvc2U6IGRpc3Bvc2UsIGFzeW5jOiBhc3luYyB9KTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKGFzeW5jKSB7XHJcbiAgICAgICAgZW52LnN0YWNrLnB1c2goeyBhc3luYzogdHJ1ZSB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWx1ZTtcclxuXHJcbn1cclxuXHJcbnZhciBfU3VwcHJlc3NlZEVycm9yID0gdHlwZW9mIFN1cHByZXNzZWRFcnJvciA9PT0gXCJmdW5jdGlvblwiID8gU3VwcHJlc3NlZEVycm9yIDogZnVuY3Rpb24gKGVycm9yLCBzdXBwcmVzc2VkLCBtZXNzYWdlKSB7XHJcbiAgICB2YXIgZSA9IG5ldyBFcnJvcihtZXNzYWdlKTtcclxuICAgIHJldHVybiBlLm5hbWUgPSBcIlN1cHByZXNzZWRFcnJvclwiLCBlLmVycm9yID0gZXJyb3IsIGUuc3VwcHJlc3NlZCA9IHN1cHByZXNzZWQsIGU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19kaXNwb3NlUmVzb3VyY2VzKGVudikge1xyXG4gICAgZnVuY3Rpb24gZmFpbChlKSB7XHJcbiAgICAgICAgZW52LmVycm9yID0gZW52Lmhhc0Vycm9yID8gbmV3IF9TdXBwcmVzc2VkRXJyb3IoZSwgZW52LmVycm9yLCBcIkFuIGVycm9yIHdhcyBzdXBwcmVzc2VkIGR1cmluZyBkaXNwb3NhbC5cIikgOiBlO1xyXG4gICAgICAgIGVudi5oYXNFcnJvciA9IHRydWU7XHJcbiAgICB9XHJcbiAgICB2YXIgciwgcyA9IDA7XHJcbiAgICBmdW5jdGlvbiBuZXh0KCkge1xyXG4gICAgICAgIHdoaWxlIChyID0gZW52LnN0YWNrLnBvcCgpKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXIuYXN5bmMgJiYgcyA9PT0gMSkgcmV0dXJuIHMgPSAwLCBlbnYuc3RhY2sucHVzaChyKSwgUHJvbWlzZS5yZXNvbHZlKCkudGhlbihuZXh0KTtcclxuICAgICAgICAgICAgICAgIGlmIChyLmRpc3Bvc2UpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gci5kaXNwb3NlLmNhbGwoci52YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHIuYXN5bmMpIHJldHVybiBzIHw9IDIsIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLnRoZW4obmV4dCwgZnVuY3Rpb24oZSkgeyBmYWlsKGUpOyByZXR1cm4gbmV4dCgpOyB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgcyB8PSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICBmYWlsKGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChzID09PSAxKSByZXR1cm4gZW52Lmhhc0Vycm9yID8gUHJvbWlzZS5yZWplY3QoZW52LmVycm9yKSA6IFByb21pc2UucmVzb2x2ZSgpO1xyXG4gICAgICAgIGlmIChlbnYuaGFzRXJyb3IpIHRocm93IGVudi5lcnJvcjtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXh0KCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3Jld3JpdGVSZWxhdGl2ZUltcG9ydEV4dGVuc2lvbihwYXRoLCBwcmVzZXJ2ZUpzeCkge1xyXG4gICAgaWYgKHR5cGVvZiBwYXRoID09PSBcInN0cmluZ1wiICYmIC9eXFwuXFwuP1xcLy8udGVzdChwYXRoKSkge1xyXG4gICAgICAgIHJldHVybiBwYXRoLnJlcGxhY2UoL1xcLih0c3gpJHwoKD86XFwuZCk/KSgoPzpcXC5bXi4vXSs/KT8pXFwuKFtjbV0/KXRzJC9pLCBmdW5jdGlvbiAobSwgdHN4LCBkLCBleHQsIGNtKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0c3ggPyBwcmVzZXJ2ZUpzeCA/IFwiLmpzeFwiIDogXCIuanNcIiA6IGQgJiYgKCFleHQgfHwgIWNtKSA/IG0gOiAoZCArIGV4dCArIFwiLlwiICsgY20udG9Mb3dlckNhc2UoKSArIFwianNcIik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGF0aDtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gICAgX19leHRlbmRzOiBfX2V4dGVuZHMsXHJcbiAgICBfX2Fzc2lnbjogX19hc3NpZ24sXHJcbiAgICBfX3Jlc3Q6IF9fcmVzdCxcclxuICAgIF9fZGVjb3JhdGU6IF9fZGVjb3JhdGUsXHJcbiAgICBfX3BhcmFtOiBfX3BhcmFtLFxyXG4gICAgX19lc0RlY29yYXRlOiBfX2VzRGVjb3JhdGUsXHJcbiAgICBfX3J1bkluaXRpYWxpemVyczogX19ydW5Jbml0aWFsaXplcnMsXHJcbiAgICBfX3Byb3BLZXk6IF9fcHJvcEtleSxcclxuICAgIF9fc2V0RnVuY3Rpb25OYW1lOiBfX3NldEZ1bmN0aW9uTmFtZSxcclxuICAgIF9fbWV0YWRhdGE6IF9fbWV0YWRhdGEsXHJcbiAgICBfX2F3YWl0ZXI6IF9fYXdhaXRlcixcclxuICAgIF9fZ2VuZXJhdG9yOiBfX2dlbmVyYXRvcixcclxuICAgIF9fY3JlYXRlQmluZGluZzogX19jcmVhdGVCaW5kaW5nLFxyXG4gICAgX19leHBvcnRTdGFyOiBfX2V4cG9ydFN0YXIsXHJcbiAgICBfX3ZhbHVlczogX192YWx1ZXMsXHJcbiAgICBfX3JlYWQ6IF9fcmVhZCxcclxuICAgIF9fc3ByZWFkOiBfX3NwcmVhZCxcclxuICAgIF9fc3ByZWFkQXJyYXlzOiBfX3NwcmVhZEFycmF5cyxcclxuICAgIF9fc3ByZWFkQXJyYXk6IF9fc3ByZWFkQXJyYXksXHJcbiAgICBfX2F3YWl0OiBfX2F3YWl0LFxyXG4gICAgX19hc3luY0dlbmVyYXRvcjogX19hc3luY0dlbmVyYXRvcixcclxuICAgIF9fYXN5bmNEZWxlZ2F0b3I6IF9fYXN5bmNEZWxlZ2F0b3IsXHJcbiAgICBfX2FzeW5jVmFsdWVzOiBfX2FzeW5jVmFsdWVzLFxyXG4gICAgX19tYWtlVGVtcGxhdGVPYmplY3Q6IF9fbWFrZVRlbXBsYXRlT2JqZWN0LFxyXG4gICAgX19pbXBvcnRTdGFyOiBfX2ltcG9ydFN0YXIsXHJcbiAgICBfX2ltcG9ydERlZmF1bHQ6IF9faW1wb3J0RGVmYXVsdCxcclxuICAgIF9fY2xhc3NQcml2YXRlRmllbGRHZXQ6IF9fY2xhc3NQcml2YXRlRmllbGRHZXQsXHJcbiAgICBfX2NsYXNzUHJpdmF0ZUZpZWxkU2V0OiBfX2NsYXNzUHJpdmF0ZUZpZWxkU2V0LFxyXG4gICAgX19jbGFzc1ByaXZhdGVGaWVsZEluOiBfX2NsYXNzUHJpdmF0ZUZpZWxkSW4sXHJcbiAgICBfX2FkZERpc3Bvc2FibGVSZXNvdXJjZTogX19hZGREaXNwb3NhYmxlUmVzb3VyY2UsXHJcbiAgICBfX2Rpc3Bvc2VSZXNvdXJjZXM6IF9fZGlzcG9zZVJlc291cmNlcyxcclxuICAgIF9fcmV3cml0ZVJlbGF0aXZlSW1wb3J0RXh0ZW5zaW9uOiBfX3Jld3JpdGVSZWxhdGl2ZUltcG9ydEV4dGVuc2lvbixcclxufTtcclxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2ssIFBhcnNlRXJyb3IsIFBhcnNlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XG5cbmludGVyZmFjZSBSYXdMaW5lIHtcbiAgbGluZU51bTogbnVtYmVyO1xuICBpbmRlbnQ6IG51bWJlcjtcbiAgY29udGVudDogc3RyaW5nO1xufVxuXG4vKipcbiAqIOino+aekCBWZXJpbG9nIOS9jeWfn+WumuS5iVxuICog57uf5LiA6K+t5rOV77ya5q+P5Liq5Luj56CB5Z2X55Sx5LiA5Liq5oiW5aSa5LiqIGRlZmluaXRpb24gYmxvY2sg57uE5oiQXG4gKiDmr4/kuKrlnZfvvJrnrKzkuIDooYwgbmFtZSB3aWR0aCBbZGVzY3JpcHRpb25d77yM5a2Q5a2X5q616YCa6L+H57yp6L+b5bWM5aWXXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShpbnB1dDogc3RyaW5nKTogUGFyc2VSZXN1bHQge1xuICBjb25zdCBsaW5lcyA9IGlucHV0LnNwbGl0KCdcXG4nKTtcbiAgY29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcbiAgY29uc3QgYmxvY2tzID0gbmV3IE1hcDxzdHJpbmcsIEZpZWxkQmxvY2s+KCk7XG4gIGNvbnN0IGJsb2NrTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAvLyDpooTlpITnkIbvvJrov4fmu6TnqbrooYzlkozms6jph4pcbiAgY29uc3QgcmF3TGluZXM6IFJhd0xpbmVbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgbGluZSA9IGxpbmVzW2ldO1xuICAgIGlmICghbGluZS50cmltKCkgfHwgbGluZS50cmltKCkuc3RhcnRzV2l0aCgnLy8nKSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHJhd0xpbmVzLnB1c2goe1xuICAgICAgbGluZU51bTogaSArIDEsXG4gICAgICBpbmRlbnQ6IGxpbmUuc2VhcmNoKC9cXFMvKSxcbiAgICAgIGNvbnRlbnQ6IGxpbmUudHJpbSgpXG4gICAgfSk7XG4gIH1cblxuICBpZiAocmF3TGluZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogW3sgbGluZTogMCwgbWVzc2FnZTogJ+i+k+WFpeS4uuepuicgfV0gfTtcbiAgfVxuXG4gIC8vIOmAkOihjOino+aekO+8jGluZGVudD0wIOeahOihjOS9nOS4uuWdl+WktFxuICBsZXQgaSA9IDA7XG4gIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoKSB7XG4gICAgY29uc3QgcmwgPSByYXdMaW5lc1tpXTtcblxuICAgIGlmIChybC5pbmRlbnQgIT09IDApIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaEj+WklueahOe8qei/m+ihjDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2ggPSBybC5jb250ZW50Lm1hdGNoKC9eKFxcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDml6Dms5Xop6PmnpA6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IFssIG5hbWUsIHdpZHRoU3RyLCBkZXNjXSA9IG1hdGNoO1xuXG4gICAgaWYgKGJsb2NrTmFtZXMuaGFzKG5hbWUpKSB7XG4gICAgICBlcnJvcnMucHVzaCh7XG4gICAgICAgIGxpbmU6IHJsLmxpbmVOdW0sXG4gICAgICAgIG1lc3NhZ2U6IGDph43lpI3lrprkuYk6IFwiJHtuYW1lfVwiYCxcbiAgICAgICAgc3VnZ2VzdGlvbjogJ+WQjOeslOiusOWGheWdl+WQjeW/hemhu+WUr+S4gCdcbiAgICAgIH0pO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGJsb2NrTmFtZXMuYWRkKG5hbWUpO1xuXG4gICAgY29uc3QgYmxvY2s6IEZpZWxkQmxvY2sgPSB7XG4gICAgICBuYW1lLFxuICAgICAgd2lkdGg6IHBhcnNlSW50KHdpZHRoU3RyLCAxMCksXG4gICAgICBkZXNjcmlwdGlvbjogZGVzYz8udHJpbSgpIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG5cbiAgICAvLyDmlLbpm4blrZDlrZfmrrXvvIjov57nu63nmoTnvKnov5vooYzvvIlcbiAgICBpKys7XG4gICAgY29uc3QgY2hpbGRyZW5TdGFydCA9IGk7XG4gICAgd2hpbGUgKGkgPCByYXdMaW5lcy5sZW5ndGggJiYgcmF3TGluZXNbaV0uaW5kZW50ID4gMCkge1xuICAgICAgaSsrO1xuICAgIH1cbiAgICBjb25zdCBjaGlsZHJlbkxpbmVzID0gcmF3TGluZXMuc2xpY2UoY2hpbGRyZW5TdGFydCwgaSk7XG5cbiAgICBpZiAoY2hpbGRyZW5MaW5lcy5sZW5ndGggPiAwKSB7XG4gICAgICBwYXJzZUNoaWxkcmVuKGNoaWxkcmVuTGluZXMsIGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMsIDAsIG5hbWUpO1xuICAgICAgY2FsY3VsYXRlQml0UmFuZ2VzKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XG4gICAgICBhdXRvRmlsbFJlc2VydmVkKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XG4gICAgfVxuXG4gICAgLy8g6aqM6K+B5L2N5a69XG4gICAgdmFsaWRhdGVCaXRXaWR0aHMoYmxvY2suY2hpbGRyZW4sIGVycm9ycyk7XG5cbiAgICBibG9ja3Muc2V0KG5hbWUsIGJsb2NrKTtcbiAgfVxuXG4gIGlmIChibG9ja3Muc2l6ZSA9PT0gMCkge1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcnM6IFt7IGxpbmU6IDAsIG1lc3NhZ2U6ICfmnKrmib7liLDmnInmlYjnmoTlrprkuYnlnZcnIH1dIH07XG4gIH1cblxuICBpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzIH07XG4gIH1cblxuICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBibG9ja3MgfTtcbn1cblxuLyoqXG4gKiDop6PmnpDlrZDlrZfmrrXliJfooahcbiAqL1xuZnVuY3Rpb24gcGFyc2VDaGlsZHJlbihcbiAgbGluZXM6IFJhd0xpbmVbXSxcbiAgY2hpbGRyZW46IEJpdEZpZWxkW10sXG4gIGVycm9yczogUGFyc2VFcnJvcltdLFxuICBiYXNlSW5kZW50OiBudW1iZXIsXG4gIHBhcmVudE5hbWU6IHN0cmluZ1xuKTogdm9pZCB7XG4gIGNvbnN0IHN0YWNrOiB7IGZpZWxkOiBCaXRGaWVsZDsgaW5kZW50OiBudW1iZXIgfVtdID0gW107XG5cbiAgZm9yIChjb25zdCBybCBvZiBsaW5lcykge1xuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihAP1xcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDml6Dms5Xop6PmnpA6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IFssIG5hbWUsIHdpZHRoU3RyLCBkZXNjXSA9IG1hdGNoO1xuICAgIGNvbnN0IHdpZHRoID0gcGFyc2VJbnQod2lkdGhTdHIsIDEwKTtcbiAgICBjb25zdCBpc1JlZmVyZW5jZSA9IG5hbWUuc3RhcnRzV2l0aCgnQCcpO1xuICAgIGNvbnN0IHJlZk5hbWUgPSBpc1JlZmVyZW5jZSA/IG5hbWUuc2xpY2UoMSkgOiBuYW1lO1xuXG4gICAgLy8g5bWM5aWX5bGC57qn5qOA5p+lXG4gICAgY29uc3QgZGVwdGggPSBNYXRoLmZsb29yKChybC5pbmRlbnQgLSBiYXNlSW5kZW50KSAvIDIpICsgMTtcbiAgICBpZiAoZGVwdGggPiA1KSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDltYzlpZflsYLnuqfov4fmt7EgKCR7ZGVwdGh9IOWxginvvIzmnIDlpJogNSDlsYJgIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGQ6IEJpdEZpZWxkID0ge1xuICAgICAgbmFtZTogcmVmTmFtZSxcbiAgICAgIHdpZHRoLFxuICAgICAgbXNiOiAwLFxuICAgICAgbHNiOiAwLFxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXG4gICAgICBpc1Jlc2VydmVkOiBuYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdyZXNlcnZlZCcsXG4gICAgICBpc1JlZmVyZW5jZSxcbiAgICAgIHJlZk5hbWU6IGlzUmVmZXJlbmNlID8gcmVmTmFtZSA6IHVuZGVmaW5lZCxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG5cbiAgICAvLyDmib7niLblrZfmrrXvvJrku47moIjkuK3mib7nvKnov5vmr5TlvZPliY3lsI/nmoTmnIDlkI7kuIDkuKpcbiAgICBsZXQgcGFyZW50OiBCaXRGaWVsZCB8IG51bGwgPSBudWxsO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0b3AgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcbiAgICAgIGlmICh0b3AuaW5kZW50IDwgcmwuaW5kZW50KSB7XG4gICAgICAgIHBhcmVudCA9IHRvcC5maWVsZDtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBzdGFjay5wb3AoKTtcbiAgICB9XG5cbiAgICBpZiAocGFyZW50KSB7XG4gICAgICBpZiAoIXBhcmVudC5jaGlsZHJlbikgcGFyZW50LmNoaWxkcmVuID0gW107XG4gICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChmaWVsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNoaWxkcmVuLnB1c2goZmllbGQpO1xuICAgIH1cblxuICAgIHN0YWNrLnB1c2goeyBmaWVsZCwgaW5kZW50OiBybC5pbmRlbnQgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiDorqHnrpcgYml0IOiMg+WbtFxuICog6Z2g5YmN5a6a5LmJ55qE5pivIExTQu+8jOmdoOWQjuWumuS5ieeahOaYryBNU0JcbiAqL1xuZnVuY3Rpb24gY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkczogQml0RmllbGRbXSwgcGFyZW50V2lkdGg6IG51bWJlcik6IHZvaWQge1xuICBsZXQgY3VycmVudExzYiA9IDA7XG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgZmllbGQubHNiID0gY3VycmVudExzYjtcbiAgICBmaWVsZC5tc2IgPSBjdXJyZW50THNiICsgZmllbGQud2lkdGggLSAxO1xuICAgIGN1cnJlbnRMc2IgPSBmaWVsZC5tc2IgKyAxO1xuICAgIGlmICghZmllbGQuaXNSZWZlcmVuY2UgJiYgZmllbGQuY2hpbGRyZW4gJiYgZmllbGQuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkLmNoaWxkcmVuLCBmaWVsZC53aWR0aCk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICog5b2T5a2Q5a2X5q615oC75L2N5a695LiN5aSf5pe277yM5ZyoIE1TQiDnq6/oh6rliqjooaUgcmVzZXJ2ZWRcbiAqL1xuZnVuY3Rpb24gYXV0b0ZpbGxSZXNlcnZlZChmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgdG90YWxDaGlsZFdpZHRoID0gZmllbGRzLnJlZHVjZSgoc3VtLCBmKSA9PiBzdW0gKyBmLndpZHRoLCAwKTtcbiAgY29uc3QgcmVtYWluaW5nID0gcGFyZW50V2lkdGggLSB0b3RhbENoaWxkV2lkdGg7XG4gIGlmIChyZW1haW5pbmcgPiAwKSB7XG4gICAgY29uc3QgcmVzZXJ2ZWQ6IEJpdEZpZWxkID0ge1xuICAgICAgbmFtZTogJ3Jlc2VydmVkJyxcbiAgICAgIHdpZHRoOiByZW1haW5pbmcsXG4gICAgICBtc2I6IDAsXG4gICAgICBsc2I6IDAsXG4gICAgICBpc1Jlc2VydmVkOiB0cnVlLFxuICAgICAgaXNSZWZlcmVuY2U6IGZhbHNlLFxuICAgICAgY2hpbGRyZW46IFtdXG4gICAgfTtcbiAgICBmaWVsZHMucHVzaChyZXNlcnZlZCk7XG4gICAgY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkcywgcGFyZW50V2lkdGgpO1xuICB9XG59XG5cbi8qKlxuICog6aqM6K+B5L2N5a69XG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlQml0V2lkdGhzKGZpZWxkczogQml0RmllbGRbXSwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcbiAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IGZpZWxkLmNoaWxkcmVuIHx8IFtdO1xuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjaGlsZHJlbldpZHRoID0gY2hpbGRyZW4ucmVkdWNlKChzdW0sIGNoaWxkKSA9PiBzdW0gKyBjaGlsZC53aWR0aCwgMCk7XG4gICAgICBpZiAoY2hpbGRyZW5XaWR0aCA+IGZpZWxkLndpZHRoKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKHtcbiAgICAgICAgICBsaW5lOiAwLFxuICAgICAgICAgIG1lc3NhZ2U6IGDlrZfmrrUgXCIke2ZpZWxkLm5hbWV9XCIg5a2Q5a2X5q615L2N5a696LaF5Ye6YCxcbiAgICAgICAgICBzdWdnZXN0aW9uOiBg54i25a2X5q61OiAke2ZpZWxkLndpZHRofS1iaXQsIOWtkOWtl+auteaAu+WSjDogJHtjaGlsZHJlbldpZHRofS1iaXQsIOWJqeS9meepuumXtDogJHtmaWVsZC53aWR0aCAtIGNoaWxkcmVuV2lkdGh9LWJpdGBcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICB2YWxpZGF0ZUJpdFdpZHRocyhjaGlsZHJlbiwgZXJyb3JzKTtcbiAgICB9XG4gIH1cbn1cbiIsIi8qKlxuICog6aKc6Imy5pa55qGIXG4gKi9cblxuLy8g5Li76Imy77yI6aG25bGC5a2X5q6177yJXG5jb25zdCBNQUlOX0NPTE9SUyA9IFtcbiAgJyM0QTkwRDknLCAvLyDok51cbiAgJyM1Q0I4NUMnLCAvLyDnu79cbiAgJyNGMEFENEUnLCAvLyDmqZlcbiAgJyM5QjU5QjYnLCAvLyDntKtcbiAgJyMxQUJDOUMnLCAvLyDpnZJcbiAgJyNFNzRDM0MnLCAvLyDnuqJcbl07XG5cbi8vIOS/neeVmeiJslxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0UwRTBFMCc7XG5cbi8qKlxuICog6I635Y+W5a2X5q616aKc6ImyXG4gKiBAcGFyYW0gaW5kZXgg5a2X5q6157Si5byVXG4gKiBAcGFyYW0gaXNSZXNlcnZlZCDmmK/lkKbkuLogcmVzZXJ2ZWRcbiAqIEBwYXJhbSBkZXB0aCDltYzlpZfmt7HluqbvvIgwID0g6aG25bGC77yJXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWVsZENvbG9yKGluZGV4OiBudW1iZXIsIGlzUmVzZXJ2ZWQ6IGJvb2xlYW4sIGRlcHRoOiBudW1iZXIgPSAwKTogc3RyaW5nIHtcbiAgaWYgKGlzUmVzZXJ2ZWQpIHtcbiAgICByZXR1cm4gUkVTRVJWRURfQ09MT1I7XG4gIH1cblxuICBjb25zdCBiYXNlQ29sb3IgPSBNQUlOX0NPTE9SU1tpbmRleCAlIE1BSU5fQ09MT1JTLmxlbmd0aF07XG5cbiAgaWYgKGRlcHRoID09PSAwKSB7XG4gICAgcmV0dXJuIGJhc2VDb2xvcjtcbiAgfVxuXG4gIC8vIOWtkOWtl+aute+8muWfuuS6jueItuiJsuiwg+aVtOS6ruW6plxuICByZXR1cm4gYWRqdXN0QnJpZ2h0bmVzcyhiYXNlQ29sb3IsIGRlcHRoICogMTUpO1xufVxuXG4vKipcbiAqIOiwg+aVtOminOiJsuS6ruW6plxuICogQHBhcmFtIGhleCDljYHlha3ov5vliLbpopzoibJcbiAqIEBwYXJhbSBwZXJjZW50IOS6ruW6puiwg+aVtOeZvuWIhuavlO+8iOato+aVsOWPmOS6ru+8jOi0n+aVsOWPmOaal++8iVxuICovXG5mdW5jdGlvbiBhZGp1c3RCcmlnaHRuZXNzKGhleDogc3RyaW5nLCBwZXJjZW50OiBudW1iZXIpOiBzdHJpbmcge1xuICAvLyDnp7vpmaQgIyDliY3nvIBcbiAgaGV4ID0gaGV4LnJlcGxhY2UoJyMnLCAnJyk7XG5cbiAgLy8g6Kej5p6QIFJHQlxuICBjb25zdCByID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZygwLCAyKSwgMTYpO1xuICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZygyLCA0KSwgMTYpO1xuICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZyg0LCA2KSwgMTYpO1xuXG4gIC8vIOiwg+aVtOS6ruW6plxuICBjb25zdCBhZGp1c3QgPSAoY2hhbm5lbDogbnVtYmVyKSA9PiB7XG4gICAgY29uc3QgYWRqdXN0ZWQgPSBNYXRoLnJvdW5kKGNoYW5uZWwgKyAoMjU1IC0gY2hhbm5lbCkgKiAocGVyY2VudCAvIDEwMCkpO1xuICAgIHJldHVybiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIGFkanVzdGVkKSk7XG4gIH07XG5cbiAgY29uc3QgbmV3UiA9IGFkanVzdChyKTtcbiAgY29uc3QgbmV3RyA9IGFkanVzdChnKTtcbiAgY29uc3QgbmV3QiA9IGFkanVzdChiKTtcblxuICAvLyDovazmjaLlm57ljYHlha3ov5vliLZcbiAgY29uc3QgdG9IZXggPSAobjogbnVtYmVyKSA9PiBuLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpO1xuICByZXR1cm4gYCMke3RvSGV4KG5ld1IpfSR7dG9IZXgobmV3Ryl9JHt0b0hleChuZXdCKX1gO1xufVxuXG4vKipcbiAqIOiOt+WPluminOiJsuaVsOe7hO+8iOeUqOS6juiwg+ivle+8iVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29sb3JQYWxldHRlKCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIE1BSU5fQ09MT1JTO1xufVxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGdldEZpZWxkQ29sb3IgfSBmcm9tICcuL2NvbG9ycyc7XG5cbi8qKlxuICogU1ZHIOa4suafk+mFjee9rlxuICovXG5pbnRlcmZhY2UgUmVuZGVyQ29uZmlnIHtcbiAgLyoqIOaAu+S9jeWuvSAqL1xuICB0b3RhbFdpZHRoOiBudW1iZXI7XG4gIC8qKiDmmK/lkKbnurXlkJHmjpLliJcgKi9cbiAgaXNWZXJ0aWNhbDogYm9vbGVhbjtcbiAgLyoqIOWtl+auteahhumrmOW6piAqL1xuICBib3hIZWlnaHQ6IG51bWJlcjtcbiAgLyoqIOWtl+S9k+Wkp+WwjyAqL1xuICBmb250U2l6ZTogbnVtYmVyO1xufVxuXG4vKipcbiAqIOiuoeeul+Wtl+auteagh+etvuaJgOmcgOeahOacgOWwj+WuveW6pu+8iOWDj+e0oO+8iVxuICovXG5mdW5jdGlvbiBjYWxjTWluTGFiZWxXaWR0aChsYWJlbDogc3RyaW5nLCBmb250U2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIGxhYmVsLmxlbmd0aCAqIGZvbnRTaXplICogMC42ICsgMjA7XG59XG5cbi8qKlxuICog5Yik5pat5piv5ZCm5bqU5L2/55So57q15ZCR5biD5bGAXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVzZVZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgdG90YWxXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0b3RhbFdpZHRoID4gNjQpIHJldHVybiB0cnVlO1xuXG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3QgYXZhaWxhYmxlV2lkdGggPSBzdmdXaWR0aCAtIDEyMDtcblxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkLmlzUmVzZXJ2ZWQgPyAncmVzZXJ2ZWQnIDogKGZpZWxkLmlzUmVmZXJlbmNlID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICAgIGNvbnN0IGxhYmVsID0gYCR7ZmllbGROYW1lfVske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XG4gICAgY29uc3Qgd2lkdGhSYXRpbyA9IGZpZWxkLndpZHRoIC8gdG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBtaW5XaWR0aCA9IGNhbGNNaW5MYWJlbFdpZHRoKGxhYmVsLCAxNCk7XG4gICAgaWYgKGJveFdpZHRoIDwgbWluV2lkdGgpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiDmuLLmn5PlnZfnmoQgU1ZHIOS9jeWfn+WbvlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tTdmcoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xuICBjb25zdCBjb25maWc6IFJlbmRlckNvbmZpZyA9IHtcbiAgICB0b3RhbFdpZHRoOiBibG9jay53aWR0aCxcbiAgICBpc1ZlcnRpY2FsOiBzaG91bGRVc2VWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpLFxuICAgIGJveEhlaWdodDogNjAsXG4gICAgZm9udFNpemU6IDE0XG4gIH07XG5cbiAgaWYgKGNvbmZpZy5pc1ZlcnRpY2FsKSB7XG4gICAgcmV0dXJuIHJlbmRlclZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZW5kZXJIb3Jpem9udGFsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9XG59XG5cbi8qKlxuICog5qiq5ZCR5riy5p+TXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckhvcml6b250YWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodCArIDYwO1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gNDA7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtzdGFydFh9XCIgeT1cIjIwXCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJzdGFydFwiIGZpbGw9XCIjNjY2XCI+TVNCPC90ZXh0PmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7c3ZnV2lkdGggLSA2MH1cIiB5PVwiMjBcIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cImVuZFwiIGZpbGw9XCIjNjY2XCI+TFNCPC90ZXh0PmA7XG5cbiAgbGV0IGN1cnJlbnRYID0gc3RhcnRYO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIGNvbmZpZy50b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIGN1cnJlbnRYLCBzdGFydFksIGJveFdpZHRoLCBjb25maWcuYm94SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplKTtcbiAgICBjdXJyZW50WCArPSBib3hXaWR0aDtcbiAgfVxuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDnurXlkJHmuLLmn5PvvIh2aWV3Qm94IOWuveW6puS4juaoquWQkeS4gOiHtO+8jOS/neaMgeWtl+S9k+inhuinieWkp+Wwj+S4gOiHtO+8iVxuICovXG5mdW5jdGlvbiByZW5kZXJWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIGNvbmZpZzogUmVuZGVyQ29uZmlnKTogc3RyaW5nIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCByb3dIZWlnaHQgPSBjb25maWcuYm94SGVpZ2h0O1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gNDA7XG4gIGNvbnN0IGJveFdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQgKyA0MDtcblxuICBsZXQgc3ZnID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgJHtzdmdXaWR0aH0gJHtzdmdIZWlnaHR9XCIgd2lkdGg9XCIxMDAlXCI+YDtcblxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke3N0YXJ0WH1cIiB5PVwiMjBcIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cInN0YXJ0XCIgZmlsbD1cIiM2NjZcIj5NU0I8L3RleHQ+YDtcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtzdGFydFh9XCIgeT1cIiR7c3ZnSGVpZ2h0IC0gMTB9XCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJzdGFydFwiIGZpbGw9XCIjNjY2XCI+TFNCPC90ZXh0PmA7XG5cbiAgbGV0IGN1cnJlbnRZID0gc3RhcnRZO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIHN0YXJ0WCwgY3VycmVudFksIGJveFdpZHRoLCByb3dIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUpO1xuICAgIGN1cnJlbnRZICs9IHJvd0hlaWdodDtcbiAgfVxuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDmuLLmn5PlrZfmrrXmoYZcbiAqL1xuZnVuY3Rpb24gcmVuZGVyRmllbGRCb3goXG4gIGZpZWxkOiBCaXRGaWVsZCxcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHdpZHRoOiBudW1iZXIsXG4gIGhlaWdodDogbnVtYmVyLFxuICBjb2xvcjogc3RyaW5nLFxuICBmb250U2l6ZTogbnVtYmVyXG4pOiBzdHJpbmcge1xuICBsZXQgc3ZnID0gJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgZmllbGROYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuXG4gIGNvbnN0IHN0cm9rZURhc2ggPSBpc1JlZiA/ICcgc3Ryb2tlLWRhc2hhcnJheT1cIjYsM1wiJyA6ICcnO1xuICBjb25zdCBzdHJva2VDb2xvciA9IGlzUmVmID8gJyM0QTkwRDknIDogJyNmZmYnO1xuICBzdmcgKz0gYDxyZWN0IHg9XCIke3h9XCIgeT1cIiR7eX1cIiB3aWR0aD1cIiR7d2lkdGh9XCIgaGVpZ2h0PVwiJHtoZWlnaHR9XCIgZmlsbD1cIiR7Y29sb3J9XCIgc3Ryb2tlPVwiJHtzdHJva2VDb2xvcn1cIiBzdHJva2Utd2lkdGg9XCIyXCIgcng9XCI0XCIgcnk9XCI0XCIgZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCIvPmA7XG5cbiAgY29uc3QgbGFiZWwgPSBgJHtmaWVsZE5hbWV9WyR7ZmllbGQubXNifToke2ZpZWxkLmxzYn1dYDtcbiAgY29uc3QgdGV4dFggPSB4ICsgd2lkdGggLyAyO1xuICBjb25zdCB0ZXh0WSA9IHkgKyBoZWlnaHQgLyAyICsgZm9udFNpemUgKiAwLjM1O1xuICBjb25zdCB0ZXh0V2lkdGggPSB3aWR0aCAtIDE2O1xuICBjb25zdCBtYXhDaGFycyA9IE1hdGguZmxvb3IodGV4dFdpZHRoIC8gKGZvbnRTaXplICogMC42KSk7XG5cbiAgbGV0IGRpc3BsYXlUZXh0ID0gbGFiZWw7XG4gIGlmIChsYWJlbC5sZW5ndGggPiBtYXhDaGFycyAmJiBtYXhDaGFycyA+IDMpIHtcbiAgICBkaXNwbGF5VGV4dCA9IGxhYmVsLnN1YnN0cmluZygwLCBtYXhDaGFycyAtIDIpICsgJy4uJztcbiAgfVxuXG4gIGNvbnN0IHRleHREZWNvcmF0aW9uID0gaXNSZWYgPyAnIHRleHQtZGVjb3JhdGlvbj1cInVuZGVybGluZVwiJyA6ICcnO1xuICBjb25zdCBmaWxsQ29sb3IgPSBpc1JzdiA/ICcjODg4JyA6ICcjZmZmJztcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHt0ZXh0WH1cIiB5PVwiJHt0ZXh0WX1cIiBmb250LXNpemU9XCIke2ZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiR7ZmlsbENvbG9yfVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCIke3RleHREZWNvcmF0aW9ufSBkYXRhLWZpZWxkPVwiJHtmaWVsZE5hbWV9XCIke2lzUmVmID8gYCBkYXRhLXJlZj1cIiR7ZmllbGQucmVmTmFtZX1cImAgOiAnJ30gc3R5bGU9XCJjdXJzb3I6JHtpc1JlZiA/ICdwb2ludGVyJyA6ICdkZWZhdWx0J31cIj4ke2Rpc3BsYXlUZXh0fTwvdGV4dD5gO1xuXG4gIHJldHVybiBzdmc7XG59XG4iLCJpbXBvcnQgeyBCaXRGaWVsZCwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIOa4suafk+Wdl+eahCBIVE1MIOihqOagvFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tUYWJsZShibG9jazogRmllbGRCbG9jayk6IHN0cmluZyB7XG4gIGNvbnN0IHJvd3M6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jaGlsZHJlbikge1xuICAgIGNvbGxlY3RSb3dzKGNoaWxkLCAwLCByb3dzKTtcbiAgfVxuXG4gIGxldCBodG1sID0gJzx0YWJsZSBjbGFzcz1cInZlcmlsb2ctYml0ZmllbGQtdGFibGVcIj4nO1xuICBodG1sICs9ICc8dGhlYWQ+PHRyPic7XG4gIGh0bWwgKz0gJzx0aD7lrZfmrrXlkI08L3RoPic7XG4gIGh0bWwgKz0gJzx0aD7kvY3lrr08L3RoPic7XG4gIGh0bWwgKz0gJzx0aD5CaXQg6IyD5Zu0PC90aD4nO1xuICBodG1sICs9ICc8dGg+5o+P6L+wPC90aD4nO1xuICBodG1sICs9ICc8L3RyPjwvdGhlYWQ+JztcbiAgaHRtbCArPSAnPHRib2R5Pic7XG4gIGh0bWwgKz0gcm93cy5qb2luKCcnKTtcbiAgaHRtbCArPSAnPC90Ym9keT48L3RhYmxlPic7XG4gIHJldHVybiBodG1sO1xufVxuXG4vKipcbiAqIOmAkuW9kuaUtumbhuihqOagvOihjFxuICovXG5mdW5jdGlvbiBjb2xsZWN0Um93cyhmaWVsZDogQml0RmllbGQsIGRlcHRoOiBudW1iZXIsIHJvd3M6IHN0cmluZ1tdKTogdm9pZCB7XG4gIGNvbnN0IGluZGVudCA9IGRlcHRoID4gMCA/ICcmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsnLnJlcGVhdChkZXB0aCkgOiAnJztcbiAgY29uc3QgaXNSZWYgPSBmaWVsZC5pc1JlZmVyZW5jZTtcbiAgY29uc3QgaXNSc3YgPSBmaWVsZC5pc1Jlc2VydmVkO1xuICBjb25zdCBuYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICBjb25zdCBiaXRSYW5nZSA9IGBbJHtmaWVsZC5tc2J9OiR7ZmllbGQubHNifV1gO1xuICBjb25zdCBkZXNjcmlwdGlvbiA9IGZpZWxkLmRlc2NyaXB0aW9uIHx8ICcnO1xuXG4gIGxldCByb3dDbGFzcyA9ICcnO1xuICBpZiAoaXNSc3YpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlc2VydmVkLXJvd1wiJztcbiAgZWxzZSBpZiAoaXNSZWYpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlZi1jaGlsZFwiJztcblxuICBjb25zdCBuYW1lQ2VsbCA9IGlzUmVmXG4gICAgPyBgPGEgaHJlZj1cIiNcIiBjbGFzcz1cImJmLXJlZi1saW5rXCIgZGF0YS10YXJnZXQ9XCIke2ZpZWxkLnJlZk5hbWV9XCI+JHtpbmRlbnR9JHtuYW1lfTwvYT5gXG4gICAgOiBgJHtpbmRlbnR9JHtuYW1lfWA7XG5cbiAgcm93cy5wdXNoKGA8dHIke3Jvd0NsYXNzfT5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtuYW1lQ2VsbH08L3RkPmApO1xuICByb3dzLnB1c2goYDx0ZD4ke2ZpZWxkLndpZHRofTwvdGQ+YCk7XG4gIHJvd3MucHVzaChgPHRkPiR7Yml0UmFuZ2V9PC90ZD5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtkZXNjcmlwdGlvbn08L3RkPmApO1xuICByb3dzLnB1c2goJzwvdHI+Jyk7XG5cbiAgaWYgKGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZpZWxkLmNoaWxkcmVuKSB7XG4gICAgICBjb2xsZWN0Um93cyhjaGlsZCwgZGVwdGggKyAxLCByb3dzKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IFBsdWdpbiwgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi9wYXJzZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tTdmcgfSBmcm9tICcuL3N2Z1JlbmRlcmVyJztcbmltcG9ydCB7IHJlbmRlckJsb2NrVGFibGUgfSBmcm9tICcuL3RhYmxlUmVuZGVyZXInO1xuaW1wb3J0IHsgUmVnaXN0cnlFbnRyeSwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xuXG5pbnRlcmZhY2UgUGx1Z2luRGF0YSB7XG4gIGRlZmF1bHRWaWV3PzogJ3N2ZycgfCAndGFibGUnO1xufVxuXG5jb25zdCBERUZBVUxUX0RBVEE6IFBsdWdpbkRhdGEgPSB7IGRlZmF1bHRWaWV3OiAnc3ZnJyB9O1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWZXJpbG9nQml0ZmllbGRQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcml2YXRlIGJsb2NrUmVnaXN0cnk6IE1hcDxzdHJpbmcsIFJlZ2lzdHJ5RW50cnk+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIHBlbmRpbmdSZWZzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0YXJnZXROYW1lOiBzdHJpbmcgfVtdID0gW107XG4gIHByaXZhdGUgY3VycmVudE5vdGVQYXRoOiBzdHJpbmcgPSAnJztcbiAgcHJpdmF0ZSBhY3RpdmVUb29sdGlwOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGN1cnJlbnRWaWV3OiAnc3ZnJyB8ICd0YWJsZScgPSAnc3ZnJztcbiAgcHJpdmF0ZSBwbHVnaW5EYXRhOiBQbHVnaW5EYXRhID0gREVGQVVMVF9EQVRBO1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbkRhdGEgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX0RBVEEsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG4gICAgdGhpcy5jdXJyZW50VmlldyA9IHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ3Zlcmlsb2ctYml0ZmllbGQnLCB0aGlzLnByb2Nlc3NCaXRmaWVsZC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIG9udW5sb2FkKCkge1xuICAgIHRoaXMuYmxvY2tSZWdpc3RyeS5jbGVhcigpO1xuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBbXTtcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NCaXRmaWVsZChzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICB0aGlzLmN1cnJlbnROb3RlUGF0aCA9IGN0eC5zb3VyY2VQYXRoIHx8ICcnO1xuICAgIGNvbnN0IHJlc3VsdCA9IHBhcnNlKHNvdXJjZSk7XG5cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICB0aGlzLnJlbmRlckVycm9ycyhlbCwgcmVzdWx0LmVycm9ycyB8fCBbXSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8g5q+P5Liq5Z2X54us56uL5riy5p+TXG4gICAgZm9yIChjb25zdCBbbmFtZSwgYmxvY2tdIG9mIHJlc3VsdC5ibG9ja3MhKSB7XG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XG4gICAgfVxuXG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnJlc29sdmVQZW5kaW5nUmVmcygpLCA1MCk7XG4gIH1cblxuICAvKipcbiAgICog5riy5p+T5Y2V5Liq5Z2X77ya5qCH6aKYICsg5YiH5o2i5oyJ6ZKuICsgU1ZHL+ihqOagvFxuICAgKi9cbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhuYW1lOiBzdHJpbmcsIGJsb2NrOiBGaWVsZEJsb2NrLCBwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBwYXJlbnRFbC5jcmVhdGVFbCgnZGl2Jywge1xuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1jb250YWluZXInLFxuICAgICAgYXR0cjogeyBpZDogYGJmOiR7bmFtZX1gIH1cbiAgICB9KTtcblxuICAgIC8vIOagh+mimOihjFxuICAgIGNvbnN0IGhlYWRlclJvdyA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWhlYWRlci1yb3cnIH0pO1xuICAgIGNvbnN0IGRlc2MgPSBibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7YmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIGhlYWRlclJvdy5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgIHRleHQ6IGAke25hbWV9JHtkZXNjfSDnmoTlrZfmrrXlrprkuYnlpoLkuIvvvJpgLFxuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1oZWFkZXInXG4gICAgfSk7XG4gICAgY29uc3QgdG9nZ2xlQnRuID0gdGhpcy5jcmVhdGVUb2dnbGVCdXR0b24oaGVhZGVyUm93KTtcblxuICAgIC8vIOWGheWuueWMuuWfn1xuICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtY29udGVudCcgfSk7XG4gICAgY29uc3Qgc3ZnQ29udGFpbmVyID0gY29udGVudFdyYXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1zdmcnIH0pO1xuICAgIHN2Z0NvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1N2ZyhibG9jayk7XG4gICAgdGhpcy5zZXR1cE5hdmlnYXRpb25IYW5kbGVycyhzdmdDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcblxuICAgIGNvbnN0IHRhYmxlQ29udGFpbmVyID0gY29udGVudFdyYXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC10YWJsZS1jb250YWluZXInIH0pO1xuICAgIHRhYmxlQ29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlckJsb2NrVGFibGUoYmxvY2spO1xuICAgIHRoaXMuc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcblxuICAgIHRoaXMuYmluZFRvZ2dsZSh0b2dnbGVCdG4sIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIpO1xuXG4gICAgLy8g5rOo5YaMXG4gICAgdGhpcy5ibG9ja1JlZ2lzdHJ5LnNldChuYW1lLCB7XG4gICAgICBlbGVtZW50OiBjb250YWluZXIsXG4gICAgICBibG9jayxcbiAgICAgIG5vdGVQYXRoOiB0aGlzLmN1cnJlbnROb3RlUGF0aFxuICAgIH0pO1xuXG4gICAgLy8g5pS26ZuG5b6F6Kej5p6Q5byV55SoXG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyh0YWJsZUNvbnRhaW5lcik7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVRvZ2dsZUJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IGJ0biA9IHBhcmVudC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi12aWV3LXRvZ2dsZScgfSk7XG4gICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn5L2N5Z+f5Zu+JywgY2xzOiAnYmYtdG9nZ2xlLW9wdGlvbiBiZi10b2dnbGUtc3ZnIGJmLXRvZ2dsZS1hY3RpdmUnLCBhdHRyOiB7ICdkYXRhLXZpZXcnOiAnc3ZnJyB9IH0pO1xuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+ihqOagvCcsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXRhYmxlJywgYXR0cjogeyAnZGF0YS12aWV3JzogJ3RhYmxlJyB9IH0pO1xuICAgIHJldHVybiBidG47XG4gIH1cblxuICBwcml2YXRlIGJpbmRUb2dnbGUoYnRuOiBIVE1MRWxlbWVudCwgc3ZnRWw6IEhUTUxFbGVtZW50LCB0YWJsZUVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGFwcGx5VmlldyA9ICh2aWV3OiAnc3ZnJyB8ICd0YWJsZScpID0+IHtcbiAgICAgIHRoaXMuY3VycmVudFZpZXcgPSB2aWV3O1xuICAgICAgLy8gaW5saW5lIHN0eWxlIOimhuebliBDU1Mg6buY6K6k5YC877yMUERGIOWvvOWHuuaXtuS8muiiq+S/neeVmVxuICAgICAgc3ZnRWwuc3R5bGUuZGlzcGxheSA9IHZpZXcgPT09ICdzdmcnID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICAgIHRhYmxlRWwuc3R5bGUuZGlzcGxheSA9IHZpZXcgPT09ICd0YWJsZScgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgYnRuLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi10b2dnbGUtb3B0aW9uJykuZm9yRWFjaChvcHQgPT4ge1xuICAgICAgICBvcHQuY2xhc3NMaXN0LnRvZ2dsZSgnYmYtdG9nZ2xlLWFjdGl2ZScsIG9wdC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpID09PSB2aWV3KTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhcHBseVZpZXcodGhpcy5jdXJyZW50Vmlldyk7XG5cbiAgICBidG4ub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGNvbnN0IHZpZXcgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScgfCBudWxsO1xuICAgICAgaWYgKHZpZXcpIHtcbiAgICAgICAgYXBwbHlWaWV3KHZpZXcpO1xuICAgICAgICB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgPSB2aWV3O1xuICAgICAgICB0aGlzLnNhdmVEYXRhKHRoaXMucGx1Z2luRGF0YSk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyRXJyb3JzKGVsOiBIVE1MRWxlbWVudCwgZXJyb3JzOiB7IGxpbmU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nOyBzdWdnZXN0aW9uPzogc3RyaW5nIH1bXSkge1xuICAgIGVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtZXJyb3InIH0sIChlcnJvckVsKSA9PiB7XG4gICAgICBlcnJvckVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAn6Kej5p6Q6ZSZ6K+vOicgfSk7XG4gICAgICBmb3IgKGNvbnN0IGVycm9yIG9mIGVycm9ycykge1xuICAgICAgICBlcnJvckVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBg6KGMICR7ZXJyb3IubGluZX06ICR7ZXJyb3IubWVzc2FnZX1gIH0pO1xuICAgICAgICBpZiAoZXJyb3Iuc3VnZ2VzdGlvbikge1xuICAgICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDlu7rorq46ICR7ZXJyb3Iuc3VnZ2VzdGlvbn1gLCBjbHM6ICdzdWdnZXN0aW9uJyB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOeCueWHu+i3s+i9rCDilIDilIDilIBcblxuICBwcml2YXRlIHNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBTVkdFbGVtZW50O1xuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcbiAgICAgIGlmIChyZWZOYW1lKSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsVG9CbG9jayhyZWZOYW1lKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFRhYmxlTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0Jyk7XG4gICAgICAgIGlmIChyZWZOYW1lKSB7XG4gICAgICAgICAgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2Nyb2xsVG9CbG9jayhibG9ja05hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHtcbiAgICAgIGNvbnNvbGUud2FybihgW3Zlcmlsb2ctYml0ZmllbGRdIOacquaJvuWIsOWumuS5ieWdlzogJHtibG9ja05hbWV9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZW50cnkuZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuXG4gICAgZW50cnkuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdiZi1oaWdobGlnaHQnKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtaGlnaGxpZ2h0Jyk7XG4gICAgfSwgMTUwMCk7XG4gIH1cblxuICAvLyDilIDilIDilIAg5oKs5rWuIHRvb2x0aXAg4pSA4pSA4pSAXG5cbiAgcHJpdmF0ZSBzZXR1cFRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBTVkdFbGVtZW50O1xuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcbiAgICAgICAgfHwgdGFyZ2V0LnBhcmVudEVsZW1lbnQ/LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKTtcbiAgICAgIGlmIChyZWZOYW1lKSB7XG4gICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCAmJiAhdGhpcy5hY3RpdmVUb29sdGlwLm1hdGNoZXMoJzpob3ZlcicpKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDIwMCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwVGFibGVUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW92ZXInLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYmYtcmVmLWxpbmsnKSkge1xuICAgICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKTtcbiAgICAgICAgaWYgKHJlZk5hbWUpIHtcbiAgICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZlVG9vbHRpcCAmJiAhdGhpcy5hY3RpdmVUb29sdGlwLm1hdGNoZXMoJzpob3ZlcicpKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDIwMCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNob3dUb29sdGlwKGJsb2NrTmFtZTogc3RyaW5nLCBtb3VzZVg6IG51bWJlciwgbW91c2VZOiBudW1iZXIpIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcbiAgICBpZiAoIWVudHJ5KSByZXR1cm47XG5cbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcblxuICAgIGNvbnN0IHRvb2x0aXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0b29sdGlwLmNsYXNzTmFtZSA9ICdiZi10b29sdGlwJztcblxuICAgIGNvbnN0IGRlc2MgPSBlbnRyeS5ibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7ZW50cnkuYmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICB0ZXh0OiBgJHtibG9ja05hbWV9JHtkZXNjfWAsXG4gICAgICBjbHM6ICdiZi10b29sdGlwLWhlYWRlcidcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmN1cnJlbnRWaWV3ID09PSAnc3ZnJykge1xuICAgICAgY29uc3Qgc3ZnV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcC1zdmcnIH0pO1xuICAgICAgc3ZnV3JhcC5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1N2ZyhlbnRyeS5ibG9jayk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcC10YWJsZScgfSk7XG4gICAgICB0YWJsZVdyYXAuaW5uZXJIVE1MID0gcmVuZGVyQmxvY2tUYWJsZShlbnRyeS5ibG9jayk7XG4gICAgfVxuXG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHtcbiAgICAgIHRleHQ6ICfljZXlh7vot7Povazmn6XnnIvlrozmlbTlrprkuYknLFxuICAgICAgY2xzOiAnYmYtdG9vbHRpcC1oaW50J1xuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0b29sdGlwKTtcbiAgICB0aGlzLmFjdGl2ZVRvb2x0aXAgPSB0b29sdGlwO1xuXG4gICAgY29uc3QgcmVjdCA9IHRvb2x0aXAuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgbGV0IGxlZnQgPSBtb3VzZVggKyAxMjtcbiAgICBsZXQgdG9wID0gbW91c2VZIC0gMjA7XG5cbiAgICBpZiAobGVmdCArIHJlY3Qud2lkdGggPiB3aW5kb3cuaW5uZXJXaWR0aCAtIDE2KSB7XG4gICAgICBsZWZ0ID0gbW91c2VYIC0gcmVjdC53aWR0aCAtIDEyO1xuICAgIH1cbiAgICBpZiAodG9wICsgcmVjdC5oZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAxNikge1xuICAgICAgdG9wID0gd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSAxNjtcbiAgICB9XG4gICAgaWYgKHRvcCA8IDgpIHRvcCA9IDg7XG5cbiAgICB0b29sdGlwLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICB0b29sdGlwLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcmVtb3ZlVG9vbHRpcCgpIHtcbiAgICBpZiAodGhpcy5hY3RpdmVUb29sdGlwKSB7XG4gICAgICB0aGlzLmFjdGl2ZVRvb2x0aXAucmVtb3ZlKCk7XG4gICAgICB0aGlzLmFjdGl2ZVRvb2x0aXAgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCDlvJXnlKjop6PmnpAg4pSA4pSA4pSAXG5cbiAgcHJpdmF0ZSBjb2xsZWN0UGVuZGluZ1JlZnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1yZWZdJykuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJykhO1xuICAgICAgaWYgKCF0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHJlZk5hbWUpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1JlZnMucHVzaCh7IGVsZW1lbnQ6IGVsIGFzIEhUTUxFbGVtZW50LCB0YXJnZXROYW1lOiByZWZOYW1lIH0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi1yZWYtbGluaycpLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXROYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpITtcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5Lmhhcyh0YXJnZXROYW1lKSkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWZzLnB1c2goeyBlbGVtZW50OiBlbCBhcyBIVE1MRWxlbWVudCwgdGFyZ2V0TmFtZSB9KTtcbiAgICAgICAgKGVsIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNvbHZlUGVuZGluZ1JlZnMoKSB7XG4gICAgY29uc3Qgc3RpbGxQZW5kaW5nOiB0eXBlb2YgdGhpcy5wZW5kaW5nUmVmcyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMucGVuZGluZ1JlZnMpIHtcbiAgICAgIGlmICh0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHBlbmRpbmcudGFyZ2V0TmFtZSkpIHtcbiAgICAgICAgcGVuZGluZy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JmLXJlZi11bnJlc29sdmVkJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGlsbFBlbmRpbmcucHVzaChwZW5kaW5nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gc3RpbGxQZW5kaW5nO1xuICB9XG59XG4iXSwibmFtZXMiOlsiUGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFrR0E7QUFDTyxTQUFTLFNBQVMsQ0FBQyxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUU7QUFDN0QsSUFBSSxTQUFTLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEtBQUssWUFBWSxDQUFDLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLFVBQVUsT0FBTyxFQUFFLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hILElBQUksT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsVUFBVSxPQUFPLEVBQUUsTUFBTSxFQUFFO0FBQy9ELFFBQVEsU0FBUyxTQUFTLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNuRyxRQUFRLFNBQVMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN0RyxRQUFRLFNBQVMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3RILFFBQVEsSUFBSSxDQUFDLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLFVBQVUsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzlFLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDO0FBNk1EO0FBQ3VCLE9BQU8sZUFBZSxL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
