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

class VerilogBitfieldPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.blockRegistry = new Map();
        this.pendingRefs = [];
        this.currentNotePath = '';
        this.activeTooltip = null;
        this.currentView = this.getDefaultView();
    }
    getDefaultView() {
        return localStorage.getItem('bf-default-view') || 'svg';
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
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
        applyView(this.getDefaultView());
        btn.onclick = (e) => {
            const target = e.target;
            const view = target.getAttribute('data-view');
            if (view) {
                applyView(view);
                localStorage.setItem('bf-default-view', view);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInNyYy9maWxlOi9FOi9kZXYvdmVyaWxvZy1iaXRmaWVsZC9zcmMvcGFyc2VyLnRzIiwic3JjL2ZpbGU6L0U6L2Rldi92ZXJpbG9nLWJpdGZpZWxkL3NyYy9jb2xvcnMudHMiLCJzcmMvZmlsZTovRTovZGV2L3Zlcmlsb2ctYml0ZmllbGQvc3JjL3N2Z1JlbmRlcmVyLnRzIiwic3JjL2ZpbGU6L0U6L2Rldi92ZXJpbG9nLWJpdGZpZWxkL3NyYy90YWJsZVJlbmRlcmVyLnRzIiwic3JjL2ZpbGU6L0U6L2Rldi92ZXJpbG9nLWJpdGZpZWxkL3NyYy9tYWluLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uXHJcblxyXG5QZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQvb3IgZGlzdHJpYnV0ZSB0aGlzIHNvZnR3YXJlIGZvciBhbnlcclxucHVycG9zZSB3aXRoIG9yIHdpdGhvdXQgZmVlIGlzIGhlcmVieSBncmFudGVkLlxyXG5cclxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiBBTkQgVEhFIEFVVEhPUiBESVNDTEFJTVMgQUxMIFdBUlJBTlRJRVMgV0lUSFxyXG5SRUdBUkQgVE8gVEhJUyBTT0ZUV0FSRSBJTkNMVURJTkcgQUxMIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFlcclxuQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUiBBTlkgU1BFQ0lBTCwgRElSRUNULFxyXG5JTkRJUkVDVCwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIE9SIEFOWSBEQU1BR0VTIFdIQVRTT0VWRVIgUkVTVUxUSU5HIEZST01cclxuTE9TUyBPRiBVU0UsIERBVEEgT1IgUFJPRklUUywgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1JcclxuT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFVTRSBPUlxyXG5QRVJGT1JNQU5DRSBPRiBUSElTIFNPRlRXQVJFLlxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG4vKiBnbG9iYWwgUmVmbGVjdCwgUHJvbWlzZSwgU3VwcHJlc3NlZEVycm9yLCBTeW1ib2wsIEl0ZXJhdG9yICovXHJcblxyXG52YXIgZXh0ZW5kU3RhdGljcyA9IGZ1bmN0aW9uKGQsIGIpIHtcclxuICAgIGV4dGVuZFN0YXRpY3MgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YgfHxcclxuICAgICAgICAoeyBfX3Byb3RvX186IFtdIH0gaW5zdGFuY2VvZiBBcnJheSAmJiBmdW5jdGlvbiAoZCwgYikgeyBkLl9fcHJvdG9fXyA9IGI7IH0pIHx8XHJcbiAgICAgICAgZnVuY3Rpb24gKGQsIGIpIHsgZm9yICh2YXIgcCBpbiBiKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGIsIHApKSBkW3BdID0gYltwXTsgfTtcclxuICAgIHJldHVybiBleHRlbmRTdGF0aWNzKGQsIGIpO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXh0ZW5kcyhkLCBiKSB7XHJcbiAgICBpZiAodHlwZW9mIGIgIT09IFwiZnVuY3Rpb25cIiAmJiBiICE9PSBudWxsKVxyXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDbGFzcyBleHRlbmRzIHZhbHVlIFwiICsgU3RyaW5nKGIpICsgXCIgaXMgbm90IGEgY29uc3RydWN0b3Igb3IgbnVsbFwiKTtcclxuICAgIGV4dGVuZFN0YXRpY3MoZCwgYik7XHJcbiAgICBmdW5jdGlvbiBfXygpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGQ7IH1cclxuICAgIGQucHJvdG90eXBlID0gYiA9PT0gbnVsbCA/IE9iamVjdC5jcmVhdGUoYikgOiAoX18ucHJvdG90eXBlID0gYi5wcm90b3R5cGUsIG5ldyBfXygpKTtcclxufVxyXG5cclxuZXhwb3J0IHZhciBfX2Fzc2lnbiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgX19hc3NpZ24gPSBPYmplY3QuYXNzaWduIHx8IGZ1bmN0aW9uIF9fYXNzaWduKHQpIHtcclxuICAgICAgICBmb3IgKHZhciBzLCBpID0gMSwgbiA9IGFyZ3VtZW50cy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcclxuICAgICAgICAgICAgcyA9IGFyZ3VtZW50c1tpXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgcCBpbiBzKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHMsIHApKSB0W3BdID0gc1twXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHQ7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gX19hc3NpZ24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcmVzdChzLCBlKSB7XHJcbiAgICB2YXIgdCA9IHt9O1xyXG4gICAgZm9yICh2YXIgcCBpbiBzKSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHMsIHApICYmIGUuaW5kZXhPZihwKSA8IDApXHJcbiAgICAgICAgdFtwXSA9IHNbcF07XHJcbiAgICBpZiAocyAhPSBudWxsICYmIHR5cGVvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzID09PSBcImZ1bmN0aW9uXCIpXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIHAgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHMpOyBpIDwgcC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoZS5pbmRleE9mKHBbaV0pIDwgMCAmJiBPYmplY3QucHJvdG90eXBlLnByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwocywgcFtpXSkpXHJcbiAgICAgICAgICAgICAgICB0W3BbaV1dID0gc1twW2ldXTtcclxuICAgICAgICB9XHJcbiAgICByZXR1cm4gdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZGVjb3JhdGUoZGVjb3JhdG9ycywgdGFyZ2V0LCBrZXksIGRlc2MpIHtcclxuICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aCwgciA9IGMgPCAzID8gdGFyZ2V0IDogZGVzYyA9PT0gbnVsbCA/IGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHRhcmdldCwga2V5KSA6IGRlc2MsIGQ7XHJcbiAgICBpZiAodHlwZW9mIFJlZmxlY3QgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIFJlZmxlY3QuZGVjb3JhdGUgPT09IFwiZnVuY3Rpb25cIikgciA9IFJlZmxlY3QuZGVjb3JhdGUoZGVjb3JhdG9ycywgdGFyZ2V0LCBrZXksIGRlc2MpO1xyXG4gICAgZWxzZSBmb3IgKHZhciBpID0gZGVjb3JhdG9ycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkgaWYgKGQgPSBkZWNvcmF0b3JzW2ldKSByID0gKGMgPCAzID8gZChyKSA6IGMgPiAzID8gZCh0YXJnZXQsIGtleSwgcikgOiBkKHRhcmdldCwga2V5KSkgfHwgcjtcclxuICAgIHJldHVybiBjID4gMyAmJiByICYmIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGtleSwgciksIHI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3BhcmFtKHBhcmFtSW5kZXgsIGRlY29yYXRvcikge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQsIGtleSkgeyBkZWNvcmF0b3IodGFyZ2V0LCBrZXksIHBhcmFtSW5kZXgpOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2VzRGVjb3JhdGUoY3RvciwgZGVzY3JpcHRvckluLCBkZWNvcmF0b3JzLCBjb250ZXh0SW4sIGluaXRpYWxpemVycywgZXh0cmFJbml0aWFsaXplcnMpIHtcclxuICAgIGZ1bmN0aW9uIGFjY2VwdChmKSB7IGlmIChmICE9PSB2b2lkIDAgJiYgdHlwZW9mIGYgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZ1bmN0aW9uIGV4cGVjdGVkXCIpOyByZXR1cm4gZjsgfVxyXG4gICAgdmFyIGtpbmQgPSBjb250ZXh0SW4ua2luZCwga2V5ID0ga2luZCA9PT0gXCJnZXR0ZXJcIiA/IFwiZ2V0XCIgOiBraW5kID09PSBcInNldHRlclwiID8gXCJzZXRcIiA6IFwidmFsdWVcIjtcclxuICAgIHZhciB0YXJnZXQgPSAhZGVzY3JpcHRvckluICYmIGN0b3IgPyBjb250ZXh0SW5bXCJzdGF0aWNcIl0gPyBjdG9yIDogY3Rvci5wcm90b3R5cGUgOiBudWxsO1xyXG4gICAgdmFyIGRlc2NyaXB0b3IgPSBkZXNjcmlwdG9ySW4gfHwgKHRhcmdldCA/IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodGFyZ2V0LCBjb250ZXh0SW4ubmFtZSkgOiB7fSk7XHJcbiAgICB2YXIgXywgZG9uZSA9IGZhbHNlO1xyXG4gICAgZm9yICh2YXIgaSA9IGRlY29yYXRvcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICB2YXIgY29udGV4dCA9IHt9O1xyXG4gICAgICAgIGZvciAodmFyIHAgaW4gY29udGV4dEluKSBjb250ZXh0W3BdID0gcCA9PT0gXCJhY2Nlc3NcIiA/IHt9IDogY29udGV4dEluW3BdO1xyXG4gICAgICAgIGZvciAodmFyIHAgaW4gY29udGV4dEluLmFjY2VzcykgY29udGV4dC5hY2Nlc3NbcF0gPSBjb250ZXh0SW4uYWNjZXNzW3BdO1xyXG4gICAgICAgIGNvbnRleHQuYWRkSW5pdGlhbGl6ZXIgPSBmdW5jdGlvbiAoZikgeyBpZiAoZG9uZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCBhZGQgaW5pdGlhbGl6ZXJzIGFmdGVyIGRlY29yYXRpb24gaGFzIGNvbXBsZXRlZFwiKTsgZXh0cmFJbml0aWFsaXplcnMucHVzaChhY2NlcHQoZiB8fCBudWxsKSk7IH07XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9ICgwLCBkZWNvcmF0b3JzW2ldKShraW5kID09PSBcImFjY2Vzc29yXCIgPyB7IGdldDogZGVzY3JpcHRvci5nZXQsIHNldDogZGVzY3JpcHRvci5zZXQgfSA6IGRlc2NyaXB0b3Jba2V5XSwgY29udGV4dCk7XHJcbiAgICAgICAgaWYgKGtpbmQgPT09IFwiYWNjZXNzb3JcIikge1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0ID09PSB2b2lkIDApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0ID09PSBudWxsIHx8IHR5cGVvZiByZXN1bHQgIT09IFwib2JqZWN0XCIpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJPYmplY3QgZXhwZWN0ZWRcIik7XHJcbiAgICAgICAgICAgIGlmIChfID0gYWNjZXB0KHJlc3VsdC5nZXQpKSBkZXNjcmlwdG9yLmdldCA9IF87XHJcbiAgICAgICAgICAgIGlmIChfID0gYWNjZXB0KHJlc3VsdC5zZXQpKSBkZXNjcmlwdG9yLnNldCA9IF87XHJcbiAgICAgICAgICAgIGlmIChfID0gYWNjZXB0KHJlc3VsdC5pbml0KSkgaW5pdGlhbGl6ZXJzLnVuc2hpZnQoXyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKF8gPSBhY2NlcHQocmVzdWx0KSkge1xyXG4gICAgICAgICAgICBpZiAoa2luZCA9PT0gXCJmaWVsZFwiKSBpbml0aWFsaXplcnMudW5zaGlmdChfKTtcclxuICAgICAgICAgICAgZWxzZSBkZXNjcmlwdG9yW2tleV0gPSBfO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmICh0YXJnZXQpIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGNvbnRleHRJbi5uYW1lLCBkZXNjcmlwdG9yKTtcclxuICAgIGRvbmUgPSB0cnVlO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcnVuSW5pdGlhbGl6ZXJzKHRoaXNBcmcsIGluaXRpYWxpemVycywgdmFsdWUpIHtcclxuICAgIHZhciB1c2VWYWx1ZSA9IGFyZ3VtZW50cy5sZW5ndGggPiAyO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbml0aWFsaXplcnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YWx1ZSA9IHVzZVZhbHVlID8gaW5pdGlhbGl6ZXJzW2ldLmNhbGwodGhpc0FyZywgdmFsdWUpIDogaW5pdGlhbGl6ZXJzW2ldLmNhbGwodGhpc0FyZyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdXNlVmFsdWUgPyB2YWx1ZSA6IHZvaWQgMDtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3Byb3BLZXkoeCkge1xyXG4gICAgcmV0dXJuIHR5cGVvZiB4ID09PSBcInN5bWJvbFwiID8geCA6IFwiXCIuY29uY2F0KHgpO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc2V0RnVuY3Rpb25OYW1lKGYsIG5hbWUsIHByZWZpeCkge1xyXG4gICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN5bWJvbFwiKSBuYW1lID0gbmFtZS5kZXNjcmlwdGlvbiA/IFwiW1wiLmNvbmNhdChuYW1lLmRlc2NyaXB0aW9uLCBcIl1cIikgOiBcIlwiO1xyXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShmLCBcIm5hbWVcIiwgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiBwcmVmaXggPyBcIlwiLmNvbmNhdChwcmVmaXgsIFwiIFwiLCBuYW1lKSA6IG5hbWUgfSk7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tZXRhZGF0YShtZXRhZGF0YUtleSwgbWV0YWRhdGFWYWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBSZWZsZWN0ID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiBSZWZsZWN0Lm1ldGFkYXRhID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiBSZWZsZWN0Lm1ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXdhaXRlcih0aGlzQXJnLCBfYXJndW1lbnRzLCBQLCBnZW5lcmF0b3IpIHtcclxuICAgIGZ1bmN0aW9uIGFkb3B0KHZhbHVlKSB7IHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIFAgPyB2YWx1ZSA6IG5ldyBQKGZ1bmN0aW9uIChyZXNvbHZlKSB7IHJlc29sdmUodmFsdWUpOyB9KTsgfVxyXG4gICAgcmV0dXJuIG5ldyAoUCB8fCAoUCA9IFByb21pc2UpKShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgZnVuY3Rpb24gZnVsZmlsbGVkKHZhbHVlKSB7IHRyeSB7IHN0ZXAoZ2VuZXJhdG9yLm5leHQodmFsdWUpKTsgfSBjYXRjaCAoZSkgeyByZWplY3QoZSk7IH0gfVxyXG4gICAgICAgIGZ1bmN0aW9uIHJlamVjdGVkKHZhbHVlKSB7IHRyeSB7IHN0ZXAoZ2VuZXJhdG9yW1widGhyb3dcIl0odmFsdWUpKTsgfSBjYXRjaCAoZSkgeyByZWplY3QoZSk7IH0gfVxyXG4gICAgICAgIGZ1bmN0aW9uIHN0ZXAocmVzdWx0KSB7IHJlc3VsdC5kb25lID8gcmVzb2x2ZShyZXN1bHQudmFsdWUpIDogYWRvcHQocmVzdWx0LnZhbHVlKS50aGVuKGZ1bGZpbGxlZCwgcmVqZWN0ZWQpOyB9XHJcbiAgICAgICAgc3RlcCgoZ2VuZXJhdG9yID0gZ2VuZXJhdG9yLmFwcGx5KHRoaXNBcmcsIF9hcmd1bWVudHMgfHwgW10pKS5uZXh0KCkpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2dlbmVyYXRvcih0aGlzQXJnLCBib2R5KSB7XHJcbiAgICB2YXIgXyA9IHsgbGFiZWw6IDAsIHNlbnQ6IGZ1bmN0aW9uKCkgeyBpZiAodFswXSAmIDEpIHRocm93IHRbMV07IHJldHVybiB0WzFdOyB9LCB0cnlzOiBbXSwgb3BzOiBbXSB9LCBmLCB5LCB0LCBnID0gT2JqZWN0LmNyZWF0ZSgodHlwZW9mIEl0ZXJhdG9yID09PSBcImZ1bmN0aW9uXCIgPyBJdGVyYXRvciA6IE9iamVjdCkucHJvdG90eXBlKTtcclxuICAgIHJldHVybiBnLm5leHQgPSB2ZXJiKDApLCBnW1widGhyb3dcIl0gPSB2ZXJiKDEpLCBnW1wicmV0dXJuXCJdID0gdmVyYigyKSwgdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIChnW1N5bWJvbC5pdGVyYXRvcl0gPSBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXM7IH0pLCBnO1xyXG4gICAgZnVuY3Rpb24gdmVyYihuKSB7IHJldHVybiBmdW5jdGlvbiAodikgeyByZXR1cm4gc3RlcChbbiwgdl0pOyB9OyB9XHJcbiAgICBmdW5jdGlvbiBzdGVwKG9wKSB7XHJcbiAgICAgICAgaWYgKGYpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJHZW5lcmF0b3IgaXMgYWxyZWFkeSBleGVjdXRpbmcuXCIpO1xyXG4gICAgICAgIHdoaWxlIChnICYmIChnID0gMCwgb3BbMF0gJiYgKF8gPSAwKSksIF8pIHRyeSB7XHJcbiAgICAgICAgICAgIGlmIChmID0gMSwgeSAmJiAodCA9IG9wWzBdICYgMiA/IHlbXCJyZXR1cm5cIl0gOiBvcFswXSA/IHlbXCJ0aHJvd1wiXSB8fCAoKHQgPSB5W1wicmV0dXJuXCJdKSAmJiB0LmNhbGwoeSksIDApIDogeS5uZXh0KSAmJiAhKHQgPSB0LmNhbGwoeSwgb3BbMV0pKS5kb25lKSByZXR1cm4gdDtcclxuICAgICAgICAgICAgaWYgKHkgPSAwLCB0KSBvcCA9IFtvcFswXSAmIDIsIHQudmFsdWVdO1xyXG4gICAgICAgICAgICBzd2l0Y2ggKG9wWzBdKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDA6IGNhc2UgMTogdCA9IG9wOyBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgNDogXy5sYWJlbCsrOyByZXR1cm4geyB2YWx1ZTogb3BbMV0sIGRvbmU6IGZhbHNlIH07XHJcbiAgICAgICAgICAgICAgICBjYXNlIDU6IF8ubGFiZWwrKzsgeSA9IG9wWzFdOyBvcCA9IFswXTsgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDc6IG9wID0gXy5vcHMucG9wKCk7IF8udHJ5cy5wb3AoKTsgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghKHQgPSBfLnRyeXMsIHQgPSB0Lmxlbmd0aCA+IDAgJiYgdFt0Lmxlbmd0aCAtIDFdKSAmJiAob3BbMF0gPT09IDYgfHwgb3BbMF0gPT09IDIpKSB7IF8gPSAwOyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcFswXSA9PT0gMyAmJiAoIXQgfHwgKG9wWzFdID4gdFswXSAmJiBvcFsxXSA8IHRbM10pKSkgeyBfLmxhYmVsID0gb3BbMV07IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wWzBdID09PSA2ICYmIF8ubGFiZWwgPCB0WzFdKSB7IF8ubGFiZWwgPSB0WzFdOyB0ID0gb3A7IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHQgJiYgXy5sYWJlbCA8IHRbMl0pIHsgXy5sYWJlbCA9IHRbMl07IF8ub3BzLnB1c2gob3ApOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0WzJdKSBfLm9wcy5wb3AoKTtcclxuICAgICAgICAgICAgICAgICAgICBfLnRyeXMucG9wKCk7IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG9wID0gYm9keS5jYWxsKHRoaXNBcmcsIF8pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHsgb3AgPSBbNiwgZV07IHkgPSAwOyB9IGZpbmFsbHkgeyBmID0gdCA9IDA7IH1cclxuICAgICAgICBpZiAob3BbMF0gJiA1KSB0aHJvdyBvcFsxXTsgcmV0dXJuIHsgdmFsdWU6IG9wWzBdID8gb3BbMV0gOiB2b2lkIDAsIGRvbmU6IHRydWUgfTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IHZhciBfX2NyZWF0ZUJpbmRpbmcgPSBPYmplY3QuY3JlYXRlID8gKGZ1bmN0aW9uKG8sIG0sIGssIGsyKSB7XHJcbiAgICBpZiAoazIgPT09IHVuZGVmaW5lZCkgazIgPSBrO1xyXG4gICAgdmFyIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKG0sIGspO1xyXG4gICAgaWYgKCFkZXNjIHx8IChcImdldFwiIGluIGRlc2MgPyAhbS5fX2VzTW9kdWxlIDogZGVzYy53cml0YWJsZSB8fCBkZXNjLmNvbmZpZ3VyYWJsZSkpIHtcclxuICAgICAgICBkZXNjID0geyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbVtrXTsgfSB9O1xyXG4gICAgfVxyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIGsyLCBkZXNjKTtcclxufSkgOiAoZnVuY3Rpb24obywgbSwgaywgazIpIHtcclxuICAgIGlmIChrMiA9PT0gdW5kZWZpbmVkKSBrMiA9IGs7XHJcbiAgICBvW2syXSA9IG1ba107XHJcbn0pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fZXhwb3J0U3RhcihtLCBvKSB7XHJcbiAgICBmb3IgKHZhciBwIGluIG0pIGlmIChwICE9PSBcImRlZmF1bHRcIiAmJiAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG8sIHApKSBfX2NyZWF0ZUJpbmRpbmcobywgbSwgcCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3ZhbHVlcyhvKSB7XHJcbiAgICB2YXIgcyA9IHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBTeW1ib2wuaXRlcmF0b3IsIG0gPSBzICYmIG9bc10sIGkgPSAwO1xyXG4gICAgaWYgKG0pIHJldHVybiBtLmNhbGwobyk7XHJcbiAgICBpZiAobyAmJiB0eXBlb2Ygby5sZW5ndGggPT09IFwibnVtYmVyXCIpIHJldHVybiB7XHJcbiAgICAgICAgbmV4dDogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBpZiAobyAmJiBpID49IG8ubGVuZ3RoKSBvID0gdm9pZCAwO1xyXG4gICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogbyAmJiBvW2krK10sIGRvbmU6ICFvIH07XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IocyA/IFwiT2JqZWN0IGlzIG5vdCBpdGVyYWJsZS5cIiA6IFwiU3ltYm9sLml0ZXJhdG9yIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fcmVhZChvLCBuKSB7XHJcbiAgICB2YXIgbSA9IHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBvW1N5bWJvbC5pdGVyYXRvcl07XHJcbiAgICBpZiAoIW0pIHJldHVybiBvO1xyXG4gICAgdmFyIGkgPSBtLmNhbGwobyksIHIsIGFyID0gW10sIGU7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIHdoaWxlICgobiA9PT0gdm9pZCAwIHx8IG4tLSA+IDApICYmICEociA9IGkubmV4dCgpKS5kb25lKSBhci5wdXNoKHIudmFsdWUpO1xyXG4gICAgfVxyXG4gICAgY2F0Y2ggKGVycm9yKSB7IGUgPSB7IGVycm9yOiBlcnJvciB9OyB9XHJcbiAgICBmaW5hbGx5IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAociAmJiAhci5kb25lICYmIChtID0gaVtcInJldHVyblwiXSkpIG0uY2FsbChpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZmluYWxseSB7IGlmIChlKSB0aHJvdyBlLmVycm9yOyB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXI7XHJcbn1cclxuXHJcbi8qKiBAZGVwcmVjYXRlZCAqL1xyXG5leHBvcnQgZnVuY3Rpb24gX19zcHJlYWQoKSB7XHJcbiAgICBmb3IgKHZhciBhciA9IFtdLCBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKylcclxuICAgICAgICBhciA9IGFyLmNvbmNhdChfX3JlYWQoYXJndW1lbnRzW2ldKSk7XHJcbiAgICByZXR1cm4gYXI7XHJcbn1cclxuXHJcbi8qKiBAZGVwcmVjYXRlZCAqL1xyXG5leHBvcnQgZnVuY3Rpb24gX19zcHJlYWRBcnJheXMoKSB7XHJcbiAgICBmb3IgKHZhciBzID0gMCwgaSA9IDAsIGlsID0gYXJndW1lbnRzLmxlbmd0aDsgaSA8IGlsOyBpKyspIHMgKz0gYXJndW1lbnRzW2ldLmxlbmd0aDtcclxuICAgIGZvciAodmFyIHIgPSBBcnJheShzKSwgayA9IDAsIGkgPSAwOyBpIDwgaWw7IGkrKylcclxuICAgICAgICBmb3IgKHZhciBhID0gYXJndW1lbnRzW2ldLCBqID0gMCwgamwgPSBhLmxlbmd0aDsgaiA8IGpsOyBqKyssIGsrKylcclxuICAgICAgICAgICAgcltrXSA9IGFbal07XHJcbiAgICByZXR1cm4gcjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fc3ByZWFkQXJyYXkodG8sIGZyb20sIHBhY2spIHtcclxuICAgIGlmIChwYWNrIHx8IGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIGZvciAodmFyIGkgPSAwLCBsID0gZnJvbS5sZW5ndGgsIGFyOyBpIDwgbDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGFyIHx8ICEoaSBpbiBmcm9tKSkge1xyXG4gICAgICAgICAgICBpZiAoIWFyKSBhciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGZyb20sIDAsIGkpO1xyXG4gICAgICAgICAgICBhcltpXSA9IGZyb21baV07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRvLmNvbmNhdChhciB8fCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChmcm9tKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2F3YWl0KHYpIHtcclxuICAgIHJldHVybiB0aGlzIGluc3RhbmNlb2YgX19hd2FpdCA/ICh0aGlzLnYgPSB2LCB0aGlzKSA6IG5ldyBfX2F3YWl0KHYpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY0dlbmVyYXRvcih0aGlzQXJnLCBfYXJndW1lbnRzLCBnZW5lcmF0b3IpIHtcclxuICAgIGlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNJdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICB2YXIgZyA9IGdlbmVyYXRvci5hcHBseSh0aGlzQXJnLCBfYXJndW1lbnRzIHx8IFtdKSwgaSwgcSA9IFtdO1xyXG4gICAgcmV0dXJuIGkgPSBPYmplY3QuY3JlYXRlKCh0eXBlb2YgQXN5bmNJdGVyYXRvciA9PT0gXCJmdW5jdGlvblwiID8gQXN5bmNJdGVyYXRvciA6IE9iamVjdCkucHJvdG90eXBlKSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiKSwgdmVyYihcInJldHVyblwiLCBhd2FpdFJldHVybiksIGlbU3ltYm9sLmFzeW5jSXRlcmF0b3JdID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfSwgaTtcclxuICAgIGZ1bmN0aW9uIGF3YWl0UmV0dXJuKGYpIHsgcmV0dXJuIGZ1bmN0aW9uICh2KSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUodikudGhlbihmLCByZWplY3QpOyB9OyB9XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4sIGYpIHsgaWYgKGdbbl0pIHsgaVtuXSA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAoYSwgYikgeyBxLnB1c2goW24sIHYsIGEsIGJdKSA+IDEgfHwgcmVzdW1lKG4sIHYpOyB9KTsgfTsgaWYgKGYpIGlbbl0gPSBmKGlbbl0pOyB9IH1cclxuICAgIGZ1bmN0aW9uIHJlc3VtZShuLCB2KSB7IHRyeSB7IHN0ZXAoZ1tuXSh2KSk7IH0gY2F0Y2ggKGUpIHsgc2V0dGxlKHFbMF1bM10sIGUpOyB9IH1cclxuICAgIGZ1bmN0aW9uIHN0ZXAocikgeyByLnZhbHVlIGluc3RhbmNlb2YgX19hd2FpdCA/IFByb21pc2UucmVzb2x2ZShyLnZhbHVlLnYpLnRoZW4oZnVsZmlsbCwgcmVqZWN0KSA6IHNldHRsZShxWzBdWzJdLCByKTsgfVxyXG4gICAgZnVuY3Rpb24gZnVsZmlsbCh2YWx1ZSkgeyByZXN1bWUoXCJuZXh0XCIsIHZhbHVlKTsgfVxyXG4gICAgZnVuY3Rpb24gcmVqZWN0KHZhbHVlKSB7IHJlc3VtZShcInRocm93XCIsIHZhbHVlKTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKGYsIHYpIHsgaWYgKGYodiksIHEuc2hpZnQoKSwgcS5sZW5ndGgpIHJlc3VtZShxWzBdWzBdLCBxWzBdWzFdKTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY0RlbGVnYXRvcihvKSB7XHJcbiAgICB2YXIgaSwgcDtcclxuICAgIHJldHVybiBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiwgZnVuY3Rpb24gKGUpIHsgdGhyb3cgZTsgfSksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGk7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4sIGYpIHsgaVtuXSA9IG9bbl0gPyBmdW5jdGlvbiAodikgeyByZXR1cm4gKHAgPSAhcCkgPyB7IHZhbHVlOiBfX2F3YWl0KG9bbl0odikpLCBkb25lOiBmYWxzZSB9IDogZiA/IGYodikgOiB2OyB9IDogZjsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY1ZhbHVlcyhvKSB7XHJcbiAgICBpZiAoIVN5bWJvbC5hc3luY0l0ZXJhdG9yKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiU3ltYm9sLmFzeW5jSXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG4gICAgdmFyIG0gPSBvW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSwgaTtcclxuICAgIHJldHVybiBtID8gbS5jYWxsKG8pIDogKG8gPSB0eXBlb2YgX192YWx1ZXMgPT09IFwiZnVuY3Rpb25cIiA/IF9fdmFsdWVzKG8pIDogb1tTeW1ib2wuaXRlcmF0b3JdKCksIGkgPSB7fSwgdmVyYihcIm5leHRcIiksIHZlcmIoXCJ0aHJvd1wiKSwgdmVyYihcInJldHVyblwiKSwgaVtTeW1ib2wuYXN5bmNJdGVyYXRvcl0gPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzOyB9LCBpKTtcclxuICAgIGZ1bmN0aW9uIHZlcmIobikgeyBpW25dID0gb1tuXSAmJiBmdW5jdGlvbiAodikgeyByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkgeyB2ID0gb1tuXSh2KSwgc2V0dGxlKHJlc29sdmUsIHJlamVjdCwgdi5kb25lLCB2LnZhbHVlKTsgfSk7IH07IH1cclxuICAgIGZ1bmN0aW9uIHNldHRsZShyZXNvbHZlLCByZWplY3QsIGQsIHYpIHsgUHJvbWlzZS5yZXNvbHZlKHYpLnRoZW4oZnVuY3Rpb24odikgeyByZXNvbHZlKHsgdmFsdWU6IHYsIGRvbmU6IGQgfSk7IH0sIHJlamVjdCk7IH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fbWFrZVRlbXBsYXRlT2JqZWN0KGNvb2tlZCwgcmF3KSB7XHJcbiAgICBpZiAoT2JqZWN0LmRlZmluZVByb3BlcnR5KSB7IE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjb29rZWQsIFwicmF3XCIsIHsgdmFsdWU6IHJhdyB9KTsgfSBlbHNlIHsgY29va2VkLnJhdyA9IHJhdzsgfVxyXG4gICAgcmV0dXJuIGNvb2tlZDtcclxufTtcclxuXHJcbnZhciBfX3NldE1vZHVsZURlZmF1bHQgPSBPYmplY3QuY3JlYXRlID8gKGZ1bmN0aW9uKG8sIHYpIHtcclxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvLCBcImRlZmF1bHRcIiwgeyBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogdiB9KTtcclxufSkgOiBmdW5jdGlvbihvLCB2KSB7XHJcbiAgICBvW1wiZGVmYXVsdFwiXSA9IHY7XHJcbn07XHJcblxyXG52YXIgb3duS2V5cyA9IGZ1bmN0aW9uKG8pIHtcclxuICAgIG93bktleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyB8fCBmdW5jdGlvbiAobykge1xyXG4gICAgICAgIHZhciBhciA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGsgaW4gbykgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvLCBrKSkgYXJbYXIubGVuZ3RoXSA9IGs7XHJcbiAgICAgICAgcmV0dXJuIGFyO1xyXG4gICAgfTtcclxuICAgIHJldHVybiBvd25LZXlzKG8pO1xyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9faW1wb3J0U3Rhcihtb2QpIHtcclxuICAgIGlmIChtb2QgJiYgbW9kLl9fZXNNb2R1bGUpIHJldHVybiBtb2Q7XHJcbiAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICBpZiAobW9kICE9IG51bGwpIGZvciAodmFyIGsgPSBvd25LZXlzKG1vZCksIGkgPSAwOyBpIDwgay5sZW5ndGg7IGkrKykgaWYgKGtbaV0gIT09IFwiZGVmYXVsdFwiKSBfX2NyZWF0ZUJpbmRpbmcocmVzdWx0LCBtb2QsIGtbaV0pO1xyXG4gICAgX19zZXRNb2R1bGVEZWZhdWx0KHJlc3VsdCwgbW9kKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydERlZmF1bHQobW9kKSB7XHJcbiAgICByZXR1cm4gKG1vZCAmJiBtb2QuX19lc01vZHVsZSkgPyBtb2QgOiB7IGRlZmF1bHQ6IG1vZCB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEdldChyZWNlaXZlciwgc3RhdGUsIGtpbmQsIGYpIHtcclxuICAgIGlmIChraW5kID09PSBcImFcIiAmJiAhZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlByaXZhdGUgYWNjZXNzb3Igd2FzIGRlZmluZWQgd2l0aG91dCBhIGdldHRlclwiKTtcclxuICAgIGlmICh0eXBlb2Ygc3RhdGUgPT09IFwiZnVuY3Rpb25cIiA/IHJlY2VpdmVyICE9PSBzdGF0ZSB8fCAhZiA6ICFzdGF0ZS5oYXMocmVjZWl2ZXIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHJlYWQgcHJpdmF0ZSBtZW1iZXIgZnJvbSBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIGtpbmQgPT09IFwibVwiID8gZiA6IGtpbmQgPT09IFwiYVwiID8gZi5jYWxsKHJlY2VpdmVyKSA6IGYgPyBmLnZhbHVlIDogc3RhdGUuZ2V0KHJlY2VpdmVyKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fY2xhc3NQcml2YXRlRmllbGRTZXQocmVjZWl2ZXIsIHN0YXRlLCB2YWx1ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwibVwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBtZXRob2QgaXMgbm90IHdyaXRhYmxlXCIpO1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgc2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3Qgd3JpdGUgcHJpdmF0ZSBtZW1iZXIgdG8gYW4gb2JqZWN0IHdob3NlIGNsYXNzIGRpZCBub3QgZGVjbGFyZSBpdFwiKTtcclxuICAgIHJldHVybiAoa2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIsIHZhbHVlKSA6IGYgPyBmLnZhbHVlID0gdmFsdWUgOiBzdGF0ZS5zZXQocmVjZWl2ZXIsIHZhbHVlKSksIHZhbHVlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEluKHN0YXRlLCByZWNlaXZlcikge1xyXG4gICAgaWYgKHJlY2VpdmVyID09PSBudWxsIHx8ICh0eXBlb2YgcmVjZWl2ZXIgIT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHJlY2VpdmVyICE9PSBcImZ1bmN0aW9uXCIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHVzZSAnaW4nIG9wZXJhdG9yIG9uIG5vbi1vYmplY3RcIik7XHJcbiAgICByZXR1cm4gdHlwZW9mIHN0YXRlID09PSBcImZ1bmN0aW9uXCIgPyByZWNlaXZlciA9PT0gc3RhdGUgOiBzdGF0ZS5oYXMocmVjZWl2ZXIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hZGREaXNwb3NhYmxlUmVzb3VyY2UoZW52LCB2YWx1ZSwgYXN5bmMpIHtcclxuICAgIGlmICh2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZSAhPT0gdm9pZCAwKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgdmFsdWUgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBleHBlY3RlZC5cIik7XHJcbiAgICAgICAgdmFyIGRpc3Bvc2UsIGlubmVyO1xyXG4gICAgICAgIGlmIChhc3luYykge1xyXG4gICAgICAgICAgICBpZiAoIVN5bWJvbC5hc3luY0Rpc3Bvc2UpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNEaXNwb3NlIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgICAgICAgICAgZGlzcG9zZSA9IHZhbHVlW1N5bWJvbC5hc3luY0Rpc3Bvc2VdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZGlzcG9zZSA9PT0gdm9pZCAwKSB7XHJcbiAgICAgICAgICAgIGlmICghU3ltYm9sLmRpc3Bvc2UpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuZGlzcG9zZSBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICAgICAgICAgIGRpc3Bvc2UgPSB2YWx1ZVtTeW1ib2wuZGlzcG9zZV07XHJcbiAgICAgICAgICAgIGlmIChhc3luYykgaW5uZXIgPSBkaXNwb3NlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodHlwZW9mIGRpc3Bvc2UgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk9iamVjdCBub3QgZGlzcG9zYWJsZS5cIik7XHJcbiAgICAgICAgaWYgKGlubmVyKSBkaXNwb3NlID0gZnVuY3Rpb24oKSB7IHRyeSB7IGlubmVyLmNhbGwodGhpcyk7IH0gY2F0Y2ggKGUpIHsgcmV0dXJuIFByb21pc2UucmVqZWN0KGUpOyB9IH07XHJcbiAgICAgICAgZW52LnN0YWNrLnB1c2goeyB2YWx1ZTogdmFsdWUsIGRpc3Bvc2U6IGRpc3Bvc2UsIGFzeW5jOiBhc3luYyB9KTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKGFzeW5jKSB7XHJcbiAgICAgICAgZW52LnN0YWNrLnB1c2goeyBhc3luYzogdHJ1ZSB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWx1ZTtcclxuXHJcbn1cclxuXHJcbnZhciBfU3VwcHJlc3NlZEVycm9yID0gdHlwZW9mIFN1cHByZXNzZWRFcnJvciA9PT0gXCJmdW5jdGlvblwiID8gU3VwcHJlc3NlZEVycm9yIDogZnVuY3Rpb24gKGVycm9yLCBzdXBwcmVzc2VkLCBtZXNzYWdlKSB7XHJcbiAgICB2YXIgZSA9IG5ldyBFcnJvcihtZXNzYWdlKTtcclxuICAgIHJldHVybiBlLm5hbWUgPSBcIlN1cHByZXNzZWRFcnJvclwiLCBlLmVycm9yID0gZXJyb3IsIGUuc3VwcHJlc3NlZCA9IHN1cHByZXNzZWQsIGU7XHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19kaXNwb3NlUmVzb3VyY2VzKGVudikge1xyXG4gICAgZnVuY3Rpb24gZmFpbChlKSB7XHJcbiAgICAgICAgZW52LmVycm9yID0gZW52Lmhhc0Vycm9yID8gbmV3IF9TdXBwcmVzc2VkRXJyb3IoZSwgZW52LmVycm9yLCBcIkFuIGVycm9yIHdhcyBzdXBwcmVzc2VkIGR1cmluZyBkaXNwb3NhbC5cIikgOiBlO1xyXG4gICAgICAgIGVudi5oYXNFcnJvciA9IHRydWU7XHJcbiAgICB9XHJcbiAgICB2YXIgciwgcyA9IDA7XHJcbiAgICBmdW5jdGlvbiBuZXh0KCkge1xyXG4gICAgICAgIHdoaWxlIChyID0gZW52LnN0YWNrLnBvcCgpKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXIuYXN5bmMgJiYgcyA9PT0gMSkgcmV0dXJuIHMgPSAwLCBlbnYuc3RhY2sucHVzaChyKSwgUHJvbWlzZS5yZXNvbHZlKCkudGhlbihuZXh0KTtcclxuICAgICAgICAgICAgICAgIGlmIChyLmRpc3Bvc2UpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gci5kaXNwb3NlLmNhbGwoci52YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHIuYXN5bmMpIHJldHVybiBzIHw9IDIsIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLnRoZW4obmV4dCwgZnVuY3Rpb24oZSkgeyBmYWlsKGUpOyByZXR1cm4gbmV4dCgpOyB9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgcyB8PSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICBmYWlsKGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChzID09PSAxKSByZXR1cm4gZW52Lmhhc0Vycm9yID8gUHJvbWlzZS5yZWplY3QoZW52LmVycm9yKSA6IFByb21pc2UucmVzb2x2ZSgpO1xyXG4gICAgICAgIGlmIChlbnYuaGFzRXJyb3IpIHRocm93IGVudi5lcnJvcjtcclxuICAgIH1cclxuICAgIHJldHVybiBuZXh0KCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3Jld3JpdGVSZWxhdGl2ZUltcG9ydEV4dGVuc2lvbihwYXRoLCBwcmVzZXJ2ZUpzeCkge1xyXG4gICAgaWYgKHR5cGVvZiBwYXRoID09PSBcInN0cmluZ1wiICYmIC9eXFwuXFwuP1xcLy8udGVzdChwYXRoKSkge1xyXG4gICAgICAgIHJldHVybiBwYXRoLnJlcGxhY2UoL1xcLih0c3gpJHwoKD86XFwuZCk/KSgoPzpcXC5bXi4vXSs/KT8pXFwuKFtjbV0/KXRzJC9pLCBmdW5jdGlvbiAobSwgdHN4LCBkLCBleHQsIGNtKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0c3ggPyBwcmVzZXJ2ZUpzeCA/IFwiLmpzeFwiIDogXCIuanNcIiA6IGQgJiYgKCFleHQgfHwgIWNtKSA/IG0gOiAoZCArIGV4dCArIFwiLlwiICsgY20udG9Mb3dlckNhc2UoKSArIFwianNcIik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGF0aDtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gICAgX19leHRlbmRzOiBfX2V4dGVuZHMsXHJcbiAgICBfX2Fzc2lnbjogX19hc3NpZ24sXHJcbiAgICBfX3Jlc3Q6IF9fcmVzdCxcclxuICAgIF9fZGVjb3JhdGU6IF9fZGVjb3JhdGUsXHJcbiAgICBfX3BhcmFtOiBfX3BhcmFtLFxyXG4gICAgX19lc0RlY29yYXRlOiBfX2VzRGVjb3JhdGUsXHJcbiAgICBfX3J1bkluaXRpYWxpemVyczogX19ydW5Jbml0aWFsaXplcnMsXHJcbiAgICBfX3Byb3BLZXk6IF9fcHJvcEtleSxcclxuICAgIF9fc2V0RnVuY3Rpb25OYW1lOiBfX3NldEZ1bmN0aW9uTmFtZSxcclxuICAgIF9fbWV0YWRhdGE6IF9fbWV0YWRhdGEsXHJcbiAgICBfX2F3YWl0ZXI6IF9fYXdhaXRlcixcclxuICAgIF9fZ2VuZXJhdG9yOiBfX2dlbmVyYXRvcixcclxuICAgIF9fY3JlYXRlQmluZGluZzogX19jcmVhdGVCaW5kaW5nLFxyXG4gICAgX19leHBvcnRTdGFyOiBfX2V4cG9ydFN0YXIsXHJcbiAgICBfX3ZhbHVlczogX192YWx1ZXMsXHJcbiAgICBfX3JlYWQ6IF9fcmVhZCxcclxuICAgIF9fc3ByZWFkOiBfX3NwcmVhZCxcclxuICAgIF9fc3ByZWFkQXJyYXlzOiBfX3NwcmVhZEFycmF5cyxcclxuICAgIF9fc3ByZWFkQXJyYXk6IF9fc3ByZWFkQXJyYXksXHJcbiAgICBfX2F3YWl0OiBfX2F3YWl0LFxyXG4gICAgX19hc3luY0dlbmVyYXRvcjogX19hc3luY0dlbmVyYXRvcixcclxuICAgIF9fYXN5bmNEZWxlZ2F0b3I6IF9fYXN5bmNEZWxlZ2F0b3IsXHJcbiAgICBfX2FzeW5jVmFsdWVzOiBfX2FzeW5jVmFsdWVzLFxyXG4gICAgX19tYWtlVGVtcGxhdGVPYmplY3Q6IF9fbWFrZVRlbXBsYXRlT2JqZWN0LFxyXG4gICAgX19pbXBvcnRTdGFyOiBfX2ltcG9ydFN0YXIsXHJcbiAgICBfX2ltcG9ydERlZmF1bHQ6IF9faW1wb3J0RGVmYXVsdCxcclxuICAgIF9fY2xhc3NQcml2YXRlRmllbGRHZXQ6IF9fY2xhc3NQcml2YXRlRmllbGRHZXQsXHJcbiAgICBfX2NsYXNzUHJpdmF0ZUZpZWxkU2V0OiBfX2NsYXNzUHJpdmF0ZUZpZWxkU2V0LFxyXG4gICAgX19jbGFzc1ByaXZhdGVGaWVsZEluOiBfX2NsYXNzUHJpdmF0ZUZpZWxkSW4sXHJcbiAgICBfX2FkZERpc3Bvc2FibGVSZXNvdXJjZTogX19hZGREaXNwb3NhYmxlUmVzb3VyY2UsXHJcbiAgICBfX2Rpc3Bvc2VSZXNvdXJjZXM6IF9fZGlzcG9zZVJlc291cmNlcyxcclxuICAgIF9fcmV3cml0ZVJlbGF0aXZlSW1wb3J0RXh0ZW5zaW9uOiBfX3Jld3JpdGVSZWxhdGl2ZUltcG9ydEV4dGVuc2lvbixcclxufTtcclxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2ssIFBhcnNlRXJyb3IsIFBhcnNlUmVzdWx0IH0gZnJvbSAnLi90eXBlcyc7XG5cbmludGVyZmFjZSBSYXdMaW5lIHtcbiAgbGluZU51bTogbnVtYmVyO1xuICBpbmRlbnQ6IG51bWJlcjtcbiAgY29udGVudDogc3RyaW5nO1xufVxuXG4vKipcbiAqIOino+aekCBWZXJpbG9nIOS9jeWfn+WumuS5iVxuICog57uf5LiA6K+t5rOV77ya5q+P5Liq5Luj56CB5Z2X55Sx5LiA5Liq5oiW5aSa5LiqIGRlZmluaXRpb24gYmxvY2sg57uE5oiQXG4gKiDmr4/kuKrlnZfvvJrnrKzkuIDooYwgbmFtZSB3aWR0aCBbZGVzY3JpcHRpb25d77yM5a2Q5a2X5q616YCa6L+H57yp6L+b5bWM5aWXXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShpbnB1dDogc3RyaW5nKTogUGFyc2VSZXN1bHQge1xuICBjb25zdCBsaW5lcyA9IGlucHV0LnNwbGl0KCdcXG4nKTtcbiAgY29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcbiAgY29uc3QgYmxvY2tzID0gbmV3IE1hcDxzdHJpbmcsIEZpZWxkQmxvY2s+KCk7XG4gIGNvbnN0IGJsb2NrTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAvLyDpooTlpITnkIbvvJrov4fmu6TnqbrooYzlkozms6jph4pcbiAgY29uc3QgcmF3TGluZXM6IFJhd0xpbmVbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgbGluZSA9IGxpbmVzW2ldO1xuICAgIGlmICghbGluZS50cmltKCkgfHwgbGluZS50cmltKCkuc3RhcnRzV2l0aCgnLy8nKSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHJhd0xpbmVzLnB1c2goe1xuICAgICAgbGluZU51bTogaSArIDEsXG4gICAgICBpbmRlbnQ6IGxpbmUuc2VhcmNoKC9cXFMvKSxcbiAgICAgIGNvbnRlbnQ6IGxpbmUudHJpbSgpXG4gICAgfSk7XG4gIH1cblxuICBpZiAocmF3TGluZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogW3sgbGluZTogMCwgbWVzc2FnZTogJ+i+k+WFpeS4uuepuicgfV0gfTtcbiAgfVxuXG4gIC8vIOmAkOihjOino+aekO+8jGluZGVudD0wIOeahOihjOS9nOS4uuWdl+WktFxuICBsZXQgaSA9IDA7XG4gIHdoaWxlIChpIDwgcmF3TGluZXMubGVuZ3RoKSB7XG4gICAgY29uc3QgcmwgPSByYXdMaW5lc1tpXTtcblxuICAgIGlmIChybC5pbmRlbnQgIT09IDApIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgbGluZTogcmwubGluZU51bSwgbWVzc2FnZTogYOaEj+WklueahOe8qei/m+ihjDogXCIke3JsLmNvbnRlbnR9XCJgIH0pO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2ggPSBybC5jb250ZW50Lm1hdGNoKC9eKFxcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDml6Dms5Xop6PmnpA6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGkrKztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IFssIG5hbWUsIHdpZHRoU3RyLCBkZXNjXSA9IG1hdGNoO1xuXG4gICAgaWYgKGJsb2NrTmFtZXMuaGFzKG5hbWUpKSB7XG4gICAgICBlcnJvcnMucHVzaCh7XG4gICAgICAgIGxpbmU6IHJsLmxpbmVOdW0sXG4gICAgICAgIG1lc3NhZ2U6IGDph43lpI3lrprkuYk6IFwiJHtuYW1lfVwiYCxcbiAgICAgICAgc3VnZ2VzdGlvbjogJ+WQjOeslOiusOWGheWdl+WQjeW/hemhu+WUr+S4gCdcbiAgICAgIH0pO1xuICAgICAgaSsrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGJsb2NrTmFtZXMuYWRkKG5hbWUpO1xuXG4gICAgY29uc3QgYmxvY2s6IEZpZWxkQmxvY2sgPSB7XG4gICAgICBuYW1lLFxuICAgICAgd2lkdGg6IHBhcnNlSW50KHdpZHRoU3RyLCAxMCksXG4gICAgICBkZXNjcmlwdGlvbjogZGVzYz8udHJpbSgpIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG5cbiAgICAvLyDmlLbpm4blrZDlrZfmrrXvvIjov57nu63nmoTnvKnov5vooYzvvIlcbiAgICBpKys7XG4gICAgY29uc3QgY2hpbGRyZW5TdGFydCA9IGk7XG4gICAgd2hpbGUgKGkgPCByYXdMaW5lcy5sZW5ndGggJiYgcmF3TGluZXNbaV0uaW5kZW50ID4gMCkge1xuICAgICAgaSsrO1xuICAgIH1cbiAgICBjb25zdCBjaGlsZHJlbkxpbmVzID0gcmF3TGluZXMuc2xpY2UoY2hpbGRyZW5TdGFydCwgaSk7XG5cbiAgICBpZiAoY2hpbGRyZW5MaW5lcy5sZW5ndGggPiAwKSB7XG4gICAgICBwYXJzZUNoaWxkcmVuKGNoaWxkcmVuTGluZXMsIGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMsIDAsIG5hbWUpO1xuICAgICAgY2FsY3VsYXRlQml0UmFuZ2VzKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XG4gICAgICBhdXRvRmlsbFJlc2VydmVkKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCk7XG4gICAgfVxuXG4gICAgLy8g6aqM6K+B5L2N5a69XG4gICAgdmFsaWRhdGVCaXRXaWR0aHMoYmxvY2suY2hpbGRyZW4sIGVycm9ycyk7XG5cbiAgICBibG9ja3Muc2V0KG5hbWUsIGJsb2NrKTtcbiAgfVxuXG4gIGlmIChibG9ja3Muc2l6ZSA9PT0gMCkge1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcnM6IFt7IGxpbmU6IDAsIG1lc3NhZ2U6ICfmnKrmib7liLDmnInmlYjnmoTlrprkuYnlnZcnIH1dIH07XG4gIH1cblxuICBpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzIH07XG4gIH1cblxuICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBibG9ja3MgfTtcbn1cblxuLyoqXG4gKiDop6PmnpDlrZDlrZfmrrXliJfooahcbiAqL1xuZnVuY3Rpb24gcGFyc2VDaGlsZHJlbihcbiAgbGluZXM6IFJhd0xpbmVbXSxcbiAgY2hpbGRyZW46IEJpdEZpZWxkW10sXG4gIGVycm9yczogUGFyc2VFcnJvcltdLFxuICBiYXNlSW5kZW50OiBudW1iZXIsXG4gIHBhcmVudE5hbWU6IHN0cmluZ1xuKTogdm9pZCB7XG4gIGNvbnN0IHN0YWNrOiB7IGZpZWxkOiBCaXRGaWVsZDsgaW5kZW50OiBudW1iZXIgfVtdID0gW107XG5cbiAgZm9yIChjb25zdCBybCBvZiBsaW5lcykge1xuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihAP1xcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDml6Dms5Xop6PmnpA6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IFssIG5hbWUsIHdpZHRoU3RyLCBkZXNjXSA9IG1hdGNoO1xuICAgIGNvbnN0IHdpZHRoID0gcGFyc2VJbnQod2lkdGhTdHIsIDEwKTtcbiAgICBjb25zdCBpc1JlZmVyZW5jZSA9IG5hbWUuc3RhcnRzV2l0aCgnQCcpO1xuICAgIGNvbnN0IHJlZk5hbWUgPSBpc1JlZmVyZW5jZSA/IG5hbWUuc2xpY2UoMSkgOiBuYW1lO1xuXG4gICAgLy8g5bWM5aWX5bGC57qn5qOA5p+lXG4gICAgY29uc3QgZGVwdGggPSBNYXRoLmZsb29yKChybC5pbmRlbnQgLSBiYXNlSW5kZW50KSAvIDIpICsgMTtcbiAgICBpZiAoZGVwdGggPiA1KSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDltYzlpZflsYLnuqfov4fmt7EgKCR7ZGVwdGh9IOWxginvvIzmnIDlpJogNSDlsYJgIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGQ6IEJpdEZpZWxkID0ge1xuICAgICAgbmFtZTogcmVmTmFtZSxcbiAgICAgIHdpZHRoLFxuICAgICAgbXNiOiAwLFxuICAgICAgbHNiOiAwLFxuICAgICAgZGVzY3JpcHRpb246IGRlc2M/LnRyaW0oKSB8fCB1bmRlZmluZWQsXG4gICAgICBpc1Jlc2VydmVkOiBuYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdyZXNlcnZlZCcsXG4gICAgICBpc1JlZmVyZW5jZSxcbiAgICAgIHJlZk5hbWU6IGlzUmVmZXJlbmNlID8gcmVmTmFtZSA6IHVuZGVmaW5lZCxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG5cbiAgICAvLyDmib7niLblrZfmrrXvvJrku47moIjkuK3mib7nvKnov5vmr5TlvZPliY3lsI/nmoTmnIDlkI7kuIDkuKpcbiAgICBsZXQgcGFyZW50OiBCaXRGaWVsZCB8IG51bGwgPSBudWxsO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0b3AgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcbiAgICAgIGlmICh0b3AuaW5kZW50IDwgcmwuaW5kZW50KSB7XG4gICAgICAgIHBhcmVudCA9IHRvcC5maWVsZDtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBzdGFjay5wb3AoKTtcbiAgICB9XG5cbiAgICBpZiAocGFyZW50KSB7XG4gICAgICBpZiAoIXBhcmVudC5jaGlsZHJlbikgcGFyZW50LmNoaWxkcmVuID0gW107XG4gICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChmaWVsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNoaWxkcmVuLnB1c2goZmllbGQpO1xuICAgIH1cblxuICAgIHN0YWNrLnB1c2goeyBmaWVsZCwgaW5kZW50OiBybC5pbmRlbnQgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiDorqHnrpcgYml0IOiMg+WbtFxuICog6Z2g5YmN5a6a5LmJ55qE5pivIExTQu+8jOmdoOWQjuWumuS5ieeahOaYryBNU0JcbiAqL1xuZnVuY3Rpb24gY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkczogQml0RmllbGRbXSwgcGFyZW50V2lkdGg6IG51bWJlcik6IHZvaWQge1xuICBsZXQgY3VycmVudExzYiA9IDA7XG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XG4gICAgZmllbGQubHNiID0gY3VycmVudExzYjtcbiAgICBmaWVsZC5tc2IgPSBjdXJyZW50THNiICsgZmllbGQud2lkdGggLSAxO1xuICAgIGN1cnJlbnRMc2IgPSBmaWVsZC5tc2IgKyAxO1xuICAgIGlmICghZmllbGQuaXNSZWZlcmVuY2UgJiYgZmllbGQuY2hpbGRyZW4gJiYgZmllbGQuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgICAgY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkLmNoaWxkcmVuLCBmaWVsZC53aWR0aCk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICog5b2T5a2Q5a2X5q615oC75L2N5a695LiN5aSf5pe277yM5ZyoIE1TQiDnq6/oh6rliqjooaUgcmVzZXJ2ZWRcbiAqL1xuZnVuY3Rpb24gYXV0b0ZpbGxSZXNlcnZlZChmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgdG90YWxDaGlsZFdpZHRoID0gZmllbGRzLnJlZHVjZSgoc3VtLCBmKSA9PiBzdW0gKyBmLndpZHRoLCAwKTtcbiAgY29uc3QgcmVtYWluaW5nID0gcGFyZW50V2lkdGggLSB0b3RhbENoaWxkV2lkdGg7XG4gIGlmIChyZW1haW5pbmcgPiAwKSB7XG4gICAgY29uc3QgcmVzZXJ2ZWQ6IEJpdEZpZWxkID0ge1xuICAgICAgbmFtZTogJ3Jlc2VydmVkJyxcbiAgICAgIHdpZHRoOiByZW1haW5pbmcsXG4gICAgICBtc2I6IDAsXG4gICAgICBsc2I6IDAsXG4gICAgICBpc1Jlc2VydmVkOiB0cnVlLFxuICAgICAgaXNSZWZlcmVuY2U6IGZhbHNlLFxuICAgICAgY2hpbGRyZW46IFtdXG4gICAgfTtcbiAgICBmaWVsZHMucHVzaChyZXNlcnZlZCk7XG4gICAgY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkcywgcGFyZW50V2lkdGgpO1xuICB9XG59XG5cbi8qKlxuICog6aqM6K+B5L2N5a69XG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlQml0V2lkdGhzKGZpZWxkczogQml0RmllbGRbXSwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcbiAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IGZpZWxkLmNoaWxkcmVuIHx8IFtdO1xuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBjaGlsZHJlbldpZHRoID0gY2hpbGRyZW4ucmVkdWNlKChzdW0sIGNoaWxkKSA9PiBzdW0gKyBjaGlsZC53aWR0aCwgMCk7XG4gICAgICBpZiAoY2hpbGRyZW5XaWR0aCA+IGZpZWxkLndpZHRoKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKHtcbiAgICAgICAgICBsaW5lOiAwLFxuICAgICAgICAgIG1lc3NhZ2U6IGDlrZfmrrUgXCIke2ZpZWxkLm5hbWV9XCIg5a2Q5a2X5q615L2N5a696LaF5Ye6YCxcbiAgICAgICAgICBzdWdnZXN0aW9uOiBg54i25a2X5q61OiAke2ZpZWxkLndpZHRofS1iaXQsIOWtkOWtl+auteaAu+WSjDogJHtjaGlsZHJlbldpZHRofS1iaXQsIOWJqeS9meepuumXtDogJHtmaWVsZC53aWR0aCAtIGNoaWxkcmVuV2lkdGh9LWJpdGBcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICB2YWxpZGF0ZUJpdFdpZHRocyhjaGlsZHJlbiwgZXJyb3JzKTtcbiAgICB9XG4gIH1cbn1cbiIsIi8qKlxuICog6aKc6Imy5pa55qGIXG4gKi9cblxuLy8g5Li76Imy77yI6aG25bGC5a2X5q6177yJXG5jb25zdCBNQUlOX0NPTE9SUyA9IFtcbiAgJyM0QTkwRDknLCAvLyDok51cbiAgJyM1Q0I4NUMnLCAvLyDnu79cbiAgJyNGMEFENEUnLCAvLyDmqZlcbiAgJyM5QjU5QjYnLCAvLyDntKtcbiAgJyMxQUJDOUMnLCAvLyDpnZJcbiAgJyNFNzRDM0MnLCAvLyDnuqJcbl07XG5cbi8vIOS/neeVmeiJslxuY29uc3QgUkVTRVJWRURfQ09MT1IgPSAnI0UwRTBFMCc7XG5cbi8qKlxuICog6I635Y+W5a2X5q616aKc6ImyXG4gKiBAcGFyYW0gaW5kZXgg5a2X5q6157Si5byVXG4gKiBAcGFyYW0gaXNSZXNlcnZlZCDmmK/lkKbkuLogcmVzZXJ2ZWRcbiAqIEBwYXJhbSBkZXB0aCDltYzlpZfmt7HluqbvvIgwID0g6aG25bGC77yJXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWVsZENvbG9yKGluZGV4OiBudW1iZXIsIGlzUmVzZXJ2ZWQ6IGJvb2xlYW4sIGRlcHRoOiBudW1iZXIgPSAwKTogc3RyaW5nIHtcbiAgaWYgKGlzUmVzZXJ2ZWQpIHtcbiAgICByZXR1cm4gUkVTRVJWRURfQ09MT1I7XG4gIH1cblxuICBjb25zdCBiYXNlQ29sb3IgPSBNQUlOX0NPTE9SU1tpbmRleCAlIE1BSU5fQ09MT1JTLmxlbmd0aF07XG5cbiAgaWYgKGRlcHRoID09PSAwKSB7XG4gICAgcmV0dXJuIGJhc2VDb2xvcjtcbiAgfVxuXG4gIC8vIOWtkOWtl+aute+8muWfuuS6jueItuiJsuiwg+aVtOS6ruW6plxuICByZXR1cm4gYWRqdXN0QnJpZ2h0bmVzcyhiYXNlQ29sb3IsIGRlcHRoICogMTUpO1xufVxuXG4vKipcbiAqIOiwg+aVtOminOiJsuS6ruW6plxuICogQHBhcmFtIGhleCDljYHlha3ov5vliLbpopzoibJcbiAqIEBwYXJhbSBwZXJjZW50IOS6ruW6puiwg+aVtOeZvuWIhuavlO+8iOato+aVsOWPmOS6ru+8jOi0n+aVsOWPmOaal++8iVxuICovXG5mdW5jdGlvbiBhZGp1c3RCcmlnaHRuZXNzKGhleDogc3RyaW5nLCBwZXJjZW50OiBudW1iZXIpOiBzdHJpbmcge1xuICAvLyDnp7vpmaQgIyDliY3nvIBcbiAgaGV4ID0gaGV4LnJlcGxhY2UoJyMnLCAnJyk7XG5cbiAgLy8g6Kej5p6QIFJHQlxuICBjb25zdCByID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZygwLCAyKSwgMTYpO1xuICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZygyLCA0KSwgMTYpO1xuICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZyg0LCA2KSwgMTYpO1xuXG4gIC8vIOiwg+aVtOS6ruW6plxuICBjb25zdCBhZGp1c3QgPSAoY2hhbm5lbDogbnVtYmVyKSA9PiB7XG4gICAgY29uc3QgYWRqdXN0ZWQgPSBNYXRoLnJvdW5kKGNoYW5uZWwgKyAoMjU1IC0gY2hhbm5lbCkgKiAocGVyY2VudCAvIDEwMCkpO1xuICAgIHJldHVybiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIGFkanVzdGVkKSk7XG4gIH07XG5cbiAgY29uc3QgbmV3UiA9IGFkanVzdChyKTtcbiAgY29uc3QgbmV3RyA9IGFkanVzdChnKTtcbiAgY29uc3QgbmV3QiA9IGFkanVzdChiKTtcblxuICAvLyDovazmjaLlm57ljYHlha3ov5vliLZcbiAgY29uc3QgdG9IZXggPSAobjogbnVtYmVyKSA9PiBuLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpO1xuICByZXR1cm4gYCMke3RvSGV4KG5ld1IpfSR7dG9IZXgobmV3Ryl9JHt0b0hleChuZXdCKX1gO1xufVxuXG4vKipcbiAqIOiOt+WPluminOiJsuaVsOe7hO+8iOeUqOS6juiwg+ivle+8iVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29sb3JQYWxldHRlKCk6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIE1BSU5fQ09MT1JTO1xufVxuIiwiaW1wb3J0IHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGdldEZpZWxkQ29sb3IgfSBmcm9tICcuL2NvbG9ycyc7XG5cbi8qKlxuICogU1ZHIOa4suafk+mFjee9rlxuICovXG5pbnRlcmZhY2UgUmVuZGVyQ29uZmlnIHtcbiAgLyoqIOaAu+S9jeWuvSAqL1xuICB0b3RhbFdpZHRoOiBudW1iZXI7XG4gIC8qKiDmmK/lkKbnurXlkJHmjpLliJcgKi9cbiAgaXNWZXJ0aWNhbDogYm9vbGVhbjtcbiAgLyoqIOWtl+auteahhumrmOW6piAqL1xuICBib3hIZWlnaHQ6IG51bWJlcjtcbiAgLyoqIOWtl+S9k+Wkp+WwjyAqL1xuICBmb250U2l6ZTogbnVtYmVyO1xufVxuXG4vKipcbiAqIOiuoeeul+Wtl+auteagh+etvuaJgOmcgOeahOacgOWwj+WuveW6pu+8iOWDj+e0oO+8iVxuICovXG5mdW5jdGlvbiBjYWxjTWluTGFiZWxXaWR0aChsYWJlbDogc3RyaW5nLCBmb250U2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIGxhYmVsLmxlbmd0aCAqIGZvbnRTaXplICogMC42ICsgMjA7XG59XG5cbi8qKlxuICog5Yik5pat5piv5ZCm5bqU5L2/55So57q15ZCR5biD5bGAXG4gKi9cbmZ1bmN0aW9uIHNob3VsZFVzZVZlcnRpY2FsKGZpZWxkczogQml0RmllbGRbXSwgdG90YWxXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmICh0b3RhbFdpZHRoID4gNjQpIHJldHVybiB0cnVlO1xuXG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3QgYXZhaWxhYmxlV2lkdGggPSBzdmdXaWR0aCAtIDEyMDtcblxuICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgIGNvbnN0IGZpZWxkTmFtZSA9IGZpZWxkLmlzUmVzZXJ2ZWQgPyAncmVzZXJ2ZWQnIDogKGZpZWxkLmlzUmVmZXJlbmNlID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICAgIGNvbnN0IGxhYmVsID0gYCR7ZmllbGROYW1lfVske2ZpZWxkLm1zYn06JHtmaWVsZC5sc2J9XWA7XG4gICAgY29uc3Qgd2lkdGhSYXRpbyA9IGZpZWxkLndpZHRoIC8gdG90YWxXaWR0aDtcbiAgICBjb25zdCBib3hXaWR0aCA9IHdpZHRoUmF0aW8gKiBhdmFpbGFibGVXaWR0aDtcbiAgICBjb25zdCBtaW5XaWR0aCA9IGNhbGNNaW5MYWJlbFdpZHRoKGxhYmVsLCAxNCk7XG4gICAgaWYgKGJveFdpZHRoIDwgbWluV2lkdGgpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiDmuLLmn5PlnZfnmoQgU1ZHIOS9jeWfn+WbvlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tTdmcoYmxvY2s6IEZpZWxkQmxvY2spOiBzdHJpbmcge1xuICBjb25zdCBjb25maWc6IFJlbmRlckNvbmZpZyA9IHtcbiAgICB0b3RhbFdpZHRoOiBibG9jay53aWR0aCxcbiAgICBpc1ZlcnRpY2FsOiBzaG91bGRVc2VWZXJ0aWNhbChibG9jay5jaGlsZHJlbiwgYmxvY2sud2lkdGgpLFxuICAgIGJveEhlaWdodDogNjAsXG4gICAgZm9udFNpemU6IDE0XG4gIH07XG5cbiAgaWYgKGNvbmZpZy5pc1ZlcnRpY2FsKSB7XG4gICAgcmV0dXJuIHJlbmRlclZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZW5kZXJIb3Jpem9udGFsKGJsb2NrLmNoaWxkcmVuLCBjb25maWcpO1xuICB9XG59XG5cbi8qKlxuICog5qiq5ZCR5riy5p+TXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckhvcml6b250YWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgc3ZnSGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodCArIDYwO1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gNDA7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtzdGFydFh9XCIgeT1cIjIwXCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJzdGFydFwiIGZpbGw9XCIjNjY2XCI+TVNCPC90ZXh0PmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7c3ZnV2lkdGggLSA2MH1cIiB5PVwiMjBcIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cImVuZFwiIGZpbGw9XCIjNjY2XCI+TFNCPC90ZXh0PmA7XG5cbiAgbGV0IGN1cnJlbnRYID0gc3RhcnRYO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIGNvbmZpZy50b3RhbFdpZHRoO1xuICAgIGNvbnN0IGJveFdpZHRoID0gd2lkdGhSYXRpbyAqIGF2YWlsYWJsZVdpZHRoO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIGN1cnJlbnRYLCBzdGFydFksIGJveFdpZHRoLCBjb25maWcuYm94SGVpZ2h0LCBjb2xvciwgY29uZmlnLmZvbnRTaXplKTtcbiAgICBjdXJyZW50WCArPSBib3hXaWR0aDtcbiAgfVxuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDnurXlkJHmuLLmn5PvvIh2aWV3Qm94IOWuveW6puS4juaoquWQkeS4gOiHtO+8jOS/neaMgeWtl+S9k+inhuinieWkp+Wwj+S4gOiHtO+8iVxuICovXG5mdW5jdGlvbiByZW5kZXJWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIGNvbmZpZzogUmVuZGVyQ29uZmlnKTogc3RyaW5nIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCByb3dIZWlnaHQgPSBjb25maWcuYm94SGVpZ2h0O1xuICBjb25zdCBzdGFydFggPSA2MDtcbiAgY29uc3Qgc3RhcnRZID0gNDA7XG4gIGNvbnN0IGJveFdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG4gIGNvbnN0IHN2Z0hlaWdodCA9IHN0YXJ0WSArIGZpZWxkcy5sZW5ndGggKiByb3dIZWlnaHQgKyA0MDtcblxuICBsZXQgc3ZnID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgJHtzdmdXaWR0aH0gJHtzdmdIZWlnaHR9XCIgd2lkdGg9XCIxMDAlXCI+YDtcblxuICBzdmcgKz0gYDx0ZXh0IHg9XCIke3N0YXJ0WH1cIiB5PVwiMjBcIiBmb250LXNpemU9XCIke2NvbmZpZy5mb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cInN0YXJ0XCIgZmlsbD1cIiM2NjZcIj5NU0I8L3RleHQ+YDtcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtzdGFydFh9XCIgeT1cIiR7c3ZnSGVpZ2h0IC0gMTB9XCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJzdGFydFwiIGZpbGw9XCIjNjY2XCI+TFNCPC90ZXh0PmA7XG5cbiAgbGV0IGN1cnJlbnRZID0gc3RhcnRZO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwKTtcbiAgICBzdmcgKz0gcmVuZGVyRmllbGRCb3goZmllbGQsIHN0YXJ0WCwgY3VycmVudFksIGJveFdpZHRoLCByb3dIZWlnaHQsIGNvbG9yLCBjb25maWcuZm9udFNpemUpO1xuICAgIGN1cnJlbnRZICs9IHJvd0hlaWdodDtcbiAgfVxuXG4gIHN2ZyArPSAnPC9zdmc+JztcbiAgcmV0dXJuIHN2Zztcbn1cblxuLyoqXG4gKiDmuLLmn5PlrZfmrrXmoYZcbiAqL1xuZnVuY3Rpb24gcmVuZGVyRmllbGRCb3goXG4gIGZpZWxkOiBCaXRGaWVsZCxcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHdpZHRoOiBudW1iZXIsXG4gIGhlaWdodDogbnVtYmVyLFxuICBjb2xvcjogc3RyaW5nLFxuICBmb250U2l6ZTogbnVtYmVyXG4pOiBzdHJpbmcge1xuICBsZXQgc3ZnID0gJyc7XG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XG4gIGNvbnN0IGlzUnN2ID0gZmllbGQuaXNSZXNlcnZlZDtcbiAgY29uc3QgZmllbGROYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuXG4gIGNvbnN0IHN0cm9rZURhc2ggPSBpc1JlZiA/ICcgc3Ryb2tlLWRhc2hhcnJheT1cIjYsM1wiJyA6ICcnO1xuICBjb25zdCBzdHJva2VDb2xvciA9IGlzUmVmID8gJyM0QTkwRDknIDogJyNmZmYnO1xuICBzdmcgKz0gYDxyZWN0IHg9XCIke3h9XCIgeT1cIiR7eX1cIiB3aWR0aD1cIiR7d2lkdGh9XCIgaGVpZ2h0PVwiJHtoZWlnaHR9XCIgZmlsbD1cIiR7Y29sb3J9XCIgc3Ryb2tlPVwiJHtzdHJva2VDb2xvcn1cIiBzdHJva2Utd2lkdGg9XCIyXCIgcng9XCI0XCIgcnk9XCI0XCIgZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCIvPmA7XG5cbiAgY29uc3QgbGFiZWwgPSBgJHtmaWVsZE5hbWV9WyR7ZmllbGQubXNifToke2ZpZWxkLmxzYn1dYDtcbiAgY29uc3QgdGV4dFggPSB4ICsgd2lkdGggLyAyO1xuICBjb25zdCB0ZXh0WSA9IHkgKyBoZWlnaHQgLyAyICsgZm9udFNpemUgKiAwLjM1O1xuICBjb25zdCB0ZXh0V2lkdGggPSB3aWR0aCAtIDE2O1xuICBjb25zdCBtYXhDaGFycyA9IE1hdGguZmxvb3IodGV4dFdpZHRoIC8gKGZvbnRTaXplICogMC42KSk7XG5cbiAgbGV0IGRpc3BsYXlUZXh0ID0gbGFiZWw7XG4gIGlmIChsYWJlbC5sZW5ndGggPiBtYXhDaGFycyAmJiBtYXhDaGFycyA+IDMpIHtcbiAgICBkaXNwbGF5VGV4dCA9IGxhYmVsLnN1YnN0cmluZygwLCBtYXhDaGFycyAtIDIpICsgJy4uJztcbiAgfVxuXG4gIGNvbnN0IHRleHREZWNvcmF0aW9uID0gaXNSZWYgPyAnIHRleHQtZGVjb3JhdGlvbj1cInVuZGVybGluZVwiJyA6ICcnO1xuICBjb25zdCBmaWxsQ29sb3IgPSBpc1JzdiA/ICcjODg4JyA6ICcjZmZmJztcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHt0ZXh0WH1cIiB5PVwiJHt0ZXh0WX1cIiBmb250LXNpemU9XCIke2ZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZG9taW5hbnQtYmFzZWxpbmU9XCJjZW50cmFsXCIgZmlsbD1cIiR7ZmlsbENvbG9yfVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCIke3RleHREZWNvcmF0aW9ufSBkYXRhLWZpZWxkPVwiJHtmaWVsZE5hbWV9XCIke2lzUmVmID8gYCBkYXRhLXJlZj1cIiR7ZmllbGQucmVmTmFtZX1cImAgOiAnJ30gc3R5bGU9XCJjdXJzb3I6JHtpc1JlZiA/ICdwb2ludGVyJyA6ICdkZWZhdWx0J31cIj4ke2Rpc3BsYXlUZXh0fTwvdGV4dD5gO1xuXG4gIHJldHVybiBzdmc7XG59XG4iLCJpbXBvcnQgeyBCaXRGaWVsZCwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIOa4suafk+Wdl+eahCBIVE1MIOihqOagvFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tUYWJsZShibG9jazogRmllbGRCbG9jayk6IHN0cmluZyB7XG4gIGNvbnN0IHJvd3M6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jaGlsZHJlbikge1xuICAgIGNvbGxlY3RSb3dzKGNoaWxkLCAwLCByb3dzKTtcbiAgfVxuXG4gIGxldCBodG1sID0gJzx0YWJsZSBjbGFzcz1cInZlcmlsb2ctYml0ZmllbGQtdGFibGVcIj4nO1xuICBodG1sICs9ICc8dGhlYWQ+PHRyPic7XG4gIGh0bWwgKz0gJzx0aD7lrZfmrrXlkI08L3RoPic7XG4gIGh0bWwgKz0gJzx0aD7kvY3lrr08L3RoPic7XG4gIGh0bWwgKz0gJzx0aD5CaXQg6IyD5Zu0PC90aD4nO1xuICBodG1sICs9ICc8dGg+5o+P6L+wPC90aD4nO1xuICBodG1sICs9ICc8L3RyPjwvdGhlYWQ+JztcbiAgaHRtbCArPSAnPHRib2R5Pic7XG4gIGh0bWwgKz0gcm93cy5qb2luKCcnKTtcbiAgaHRtbCArPSAnPC90Ym9keT48L3RhYmxlPic7XG4gIHJldHVybiBodG1sO1xufVxuXG4vKipcbiAqIOmAkuW9kuaUtumbhuihqOagvOihjFxuICovXG5mdW5jdGlvbiBjb2xsZWN0Um93cyhmaWVsZDogQml0RmllbGQsIGRlcHRoOiBudW1iZXIsIHJvd3M6IHN0cmluZ1tdKTogdm9pZCB7XG4gIGNvbnN0IGluZGVudCA9IGRlcHRoID4gMCA/ICcmbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDsnLnJlcGVhdChkZXB0aCkgOiAnJztcbiAgY29uc3QgaXNSZWYgPSBmaWVsZC5pc1JlZmVyZW5jZTtcbiAgY29uc3QgaXNSc3YgPSBmaWVsZC5pc1Jlc2VydmVkO1xuICBjb25zdCBuYW1lID0gaXNSc3YgPyAncmVzZXJ2ZWQnIDogKGlzUmVmID8gYEAke2ZpZWxkLnJlZk5hbWV9YCA6IGZpZWxkLm5hbWUpO1xuICBjb25zdCBiaXRSYW5nZSA9IGBbJHtmaWVsZC5tc2J9OiR7ZmllbGQubHNifV1gO1xuICBjb25zdCBkZXNjcmlwdGlvbiA9IGZpZWxkLmRlc2NyaXB0aW9uIHx8ICcnO1xuXG4gIGxldCByb3dDbGFzcyA9ICcnO1xuICBpZiAoaXNSc3YpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlc2VydmVkLXJvd1wiJztcbiAgZWxzZSBpZiAoaXNSZWYpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlZi1jaGlsZFwiJztcblxuICBjb25zdCBuYW1lQ2VsbCA9IGlzUmVmXG4gICAgPyBgPGEgaHJlZj1cIiNcIiBjbGFzcz1cImJmLXJlZi1saW5rXCIgZGF0YS10YXJnZXQ9XCIke2ZpZWxkLnJlZk5hbWV9XCI+JHtpbmRlbnR9JHtuYW1lfTwvYT5gXG4gICAgOiBgJHtpbmRlbnR9JHtuYW1lfWA7XG5cbiAgcm93cy5wdXNoKGA8dHIke3Jvd0NsYXNzfT5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtuYW1lQ2VsbH08L3RkPmApO1xuICByb3dzLnB1c2goYDx0ZD4ke2ZpZWxkLndpZHRofTwvdGQ+YCk7XG4gIHJvd3MucHVzaChgPHRkPiR7Yml0UmFuZ2V9PC90ZD5gKTtcbiAgcm93cy5wdXNoKGA8dGQ+JHtkZXNjcmlwdGlvbn08L3RkPmApO1xuICByb3dzLnB1c2goJzwvdHI+Jyk7XG5cbiAgaWYgKGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZpZWxkLmNoaWxkcmVuKSB7XG4gICAgICBjb2xsZWN0Um93cyhjaGlsZCwgZGVwdGggKyAxLCByb3dzKTtcbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IFBsdWdpbiwgTWFya2Rvd25Qb3N0UHJvY2Vzc29yQ29udGV4dCB9IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi9wYXJzZXInO1xuaW1wb3J0IHsgcmVuZGVyQmxvY2tTdmcgfSBmcm9tICcuL3N2Z1JlbmRlcmVyJztcbmltcG9ydCB7IHJlbmRlckJsb2NrVGFibGUgfSBmcm9tICcuL3RhYmxlUmVuZGVyZXInO1xuaW1wb3J0IHsgUmVnaXN0cnlFbnRyeSwgRmllbGRCbG9jayB9IGZyb20gJy4vdHlwZXMnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBWZXJpbG9nQml0ZmllbGRQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcml2YXRlIGJsb2NrUmVnaXN0cnk6IE1hcDxzdHJpbmcsIFJlZ2lzdHJ5RW50cnk+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIHBlbmRpbmdSZWZzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0YXJnZXROYW1lOiBzdHJpbmcgfVtdID0gW107XG4gIHByaXZhdGUgY3VycmVudE5vdGVQYXRoOiBzdHJpbmcgPSAnJztcbiAgcHJpdmF0ZSBhY3RpdmVUb29sdGlwOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZ2V0RGVmYXVsdFZpZXcoKTogJ3N2ZycgfCAndGFibGUnIHtcbiAgICByZXR1cm4gKGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdiZi1kZWZhdWx0LXZpZXcnKSBhcyAnc3ZnJyB8ICd0YWJsZScpIHx8ICdzdmcnO1xuICB9XG5cbiAgcHJpdmF0ZSBjdXJyZW50VmlldzogJ3N2ZycgfCAndGFibGUnID0gdGhpcy5nZXREZWZhdWx0VmlldygpO1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ3Zlcmlsb2ctYml0ZmllbGQnLCB0aGlzLnByb2Nlc3NCaXRmaWVsZC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIG9udW5sb2FkKCkge1xuICAgIHRoaXMuYmxvY2tSZWdpc3RyeS5jbGVhcigpO1xuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBbXTtcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NCaXRmaWVsZChzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcbiAgICB0aGlzLmN1cnJlbnROb3RlUGF0aCA9IGN0eC5zb3VyY2VQYXRoIHx8ICcnO1xuICAgIGNvbnN0IHJlc3VsdCA9IHBhcnNlKHNvdXJjZSk7XG5cbiAgICBpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICB0aGlzLnJlbmRlckVycm9ycyhlbCwgcmVzdWx0LmVycm9ycyB8fCBbXSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8g5q+P5Liq5Z2X54us56uL5riy5p+TXG4gICAgZm9yIChjb25zdCBbbmFtZSwgYmxvY2tdIG9mIHJlc3VsdC5ibG9ja3MhKSB7XG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XG4gICAgfVxuXG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLnJlc29sdmVQZW5kaW5nUmVmcygpLCA1MCk7XG4gIH1cblxuICAvKipcbiAgICog5riy5p+T5Y2V5Liq5Z2X77ya5qCH6aKYICsg5YiH5o2i5oyJ6ZKuICsgU1ZHL+ihqOagvFxuICAgKi9cbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhuYW1lOiBzdHJpbmcsIGJsb2NrOiBGaWVsZEJsb2NrLCBwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBwYXJlbnRFbC5jcmVhdGVFbCgnZGl2Jywge1xuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1jb250YWluZXInLFxuICAgICAgYXR0cjogeyBpZDogYGJmOiR7bmFtZX1gIH1cbiAgICB9KTtcblxuICAgIC8vIOagh+mimOihjFxuICAgIGNvbnN0IGhlYWRlclJvdyA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWhlYWRlci1yb3cnIH0pO1xuICAgIGNvbnN0IGRlc2MgPSBibG9jay5kZXNjcmlwdGlvbiA/IGAg4oCUICR7YmxvY2suZGVzY3JpcHRpb259YCA6ICcnO1xuICAgIGhlYWRlclJvdy5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgIHRleHQ6IGAke25hbWV9JHtkZXNjfSDnmoTlrZfmrrXlrprkuYnlpoLkuIvvvJpgLFxuICAgICAgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1oZWFkZXInXG4gICAgfSk7XG4gICAgY29uc3QgdG9nZ2xlQnRuID0gdGhpcy5jcmVhdGVUb2dnbGVCdXR0b24oaGVhZGVyUm93KTtcblxuICAgIC8vIOWGheWuueWMuuWfn1xuICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtY29udGVudCcgfSk7XG4gICAgY29uc3Qgc3ZnQ29udGFpbmVyID0gY29udGVudFdyYXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1zdmcnIH0pO1xuICAgIHN2Z0NvbnRhaW5lci5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1N2ZyhibG9jayk7XG4gICAgdGhpcy5zZXR1cE5hdmlnYXRpb25IYW5kbGVycyhzdmdDb250YWluZXIpO1xuICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcblxuICAgIGNvbnN0IHRhYmxlQ29udGFpbmVyID0gY29udGVudFdyYXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC10YWJsZS1jb250YWluZXInIH0pO1xuICAgIHRhYmxlQ29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlckJsb2NrVGFibGUoYmxvY2spO1xuICAgIHRoaXMuc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XG4gICAgdGhpcy5zZXR1cFRhYmxlVG9vbHRpcEhhbmRsZXJzKHRhYmxlQ29udGFpbmVyKTtcblxuICAgIHRoaXMuYmluZFRvZ2dsZSh0b2dnbGVCdG4sIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIpO1xuXG4gICAgLy8g5rOo5YaMXG4gICAgdGhpcy5ibG9ja1JlZ2lzdHJ5LnNldChuYW1lLCB7XG4gICAgICBlbGVtZW50OiBjb250YWluZXIsXG4gICAgICBibG9jayxcbiAgICAgIG5vdGVQYXRoOiB0aGlzLmN1cnJlbnROb3RlUGF0aFxuICAgIH0pO1xuXG4gICAgLy8g5pS26ZuG5b6F6Kej5p6Q5byV55SoXG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnMoc3ZnQ29udGFpbmVyKTtcbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyh0YWJsZUNvbnRhaW5lcik7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVRvZ2dsZUJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IGJ0biA9IHBhcmVudC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi12aWV3LXRvZ2dsZScgfSk7XG4gICAgYnRuLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn5L2N5Z+f5Zu+JywgY2xzOiAnYmYtdG9nZ2xlLW9wdGlvbiBiZi10b2dnbGUtc3ZnIGJmLXRvZ2dsZS1hY3RpdmUnLCBhdHRyOiB7ICdkYXRhLXZpZXcnOiAnc3ZnJyB9IH0pO1xuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+ihqOagvCcsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXRhYmxlJywgYXR0cjogeyAnZGF0YS12aWV3JzogJ3RhYmxlJyB9IH0pO1xuICAgIHJldHVybiBidG47XG4gIH1cblxuICBwcml2YXRlIGJpbmRUb2dnbGUoYnRuOiBIVE1MRWxlbWVudCwgc3ZnRWw6IEhUTUxFbGVtZW50LCB0YWJsZUVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGFwcGx5VmlldyA9ICh2aWV3OiAnc3ZnJyB8ICd0YWJsZScpID0+IHtcbiAgICAgIHRoaXMuY3VycmVudFZpZXcgPSB2aWV3O1xuICAgICAgLy8gaW5saW5lIHN0eWxlIOimhuebliBDU1Mg6buY6K6k5YC877yMUERGIOWvvOWHuuaXtuS8muiiq+S/neeVmVxuICAgICAgc3ZnRWwuc3R5bGUuZGlzcGxheSA9IHZpZXcgPT09ICdzdmcnID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICAgIHRhYmxlRWwuc3R5bGUuZGlzcGxheSA9IHZpZXcgPT09ICd0YWJsZScgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgYnRuLnF1ZXJ5U2VsZWN0b3JBbGwoJy5iZi10b2dnbGUtb3B0aW9uJykuZm9yRWFjaChvcHQgPT4ge1xuICAgICAgICBvcHQuY2xhc3NMaXN0LnRvZ2dsZSgnYmYtdG9nZ2xlLWFjdGl2ZScsIG9wdC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpID09PSB2aWV3KTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhcHBseVZpZXcodGhpcy5nZXREZWZhdWx0VmlldygpKTtcblxuICAgIGJ0bi5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgY29uc3QgdmlldyA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IG51bGw7XG4gICAgICBpZiAodmlldykge1xuICAgICAgICBhcHBseVZpZXcodmlldyk7XG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdiZi1kZWZhdWx0LXZpZXcnLCB2aWV3KTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJFcnJvcnMoZWw6IEhUTUxFbGVtZW50LCBlcnJvcnM6IHsgbGluZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IHN1Z2dlc3Rpb24/OiBzdHJpbmcgfVtdKSB7XG4gICAgZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAndmVyaWxvZy1iaXRmaWVsZC1lcnJvcicgfSwgKGVycm9yRWwpID0+IHtcbiAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfop6PmnpDplJnor686JyB9KTtcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XG4gICAgICAgIGVycm9yRWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGDooYwgJHtlcnJvci5saW5lfTogJHtlcnJvci5tZXNzYWdlfWAgfSk7XG4gICAgICAgIGlmIChlcnJvci5zdWdnZXN0aW9uKSB7XG4gICAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOW7uuiurjogJHtlcnJvci5zdWdnZXN0aW9ufWAsIGNsczogJ3N1Z2dlc3Rpb24nIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyDilIDilIDilIAg54K55Ye76Lez6L2sIOKUgOKUgOKUgFxuXG4gIHByaXZhdGUgc2V0dXBOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHtcbiAgICAgICAgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHNldHVwVGFibGVOYXZpZ2F0aW9uSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2JmLXJlZi1saW5rJykpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKTtcbiAgICAgICAgaWYgKHJlZk5hbWUpIHtcbiAgICAgICAgICB0aGlzLnNjcm9sbFRvQmxvY2socmVmTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzY3JvbGxUb0Jsb2NrKGJsb2NrTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XG4gICAgaWYgKCFlbnRyeSkge1xuICAgICAgY29uc29sZS53YXJuKGBbdmVyaWxvZy1iaXRmaWVsZF0g5pyq5om+5Yiw5a6a5LmJ5Z2XOiAke2Jsb2NrTmFtZX1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBlbnRyeS5lbGVtZW50LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ2NlbnRlcicgfSk7XG5cbiAgICBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2JmLWhpZ2hsaWdodCcpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgZW50cnkuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdiZi1oaWdobGlnaHQnKTtcbiAgICB9LCAxNTAwKTtcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCDmgqzmta4gdG9vbHRpcCDilIDilIDilIBcblxuICBwcml2YXRlIHNldHVwVG9vbHRpcEhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIFNWR0VsZW1lbnQ7XG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xuICAgICAgaWYgKHJlZk5hbWUpIHtcbiAgICAgICAgdGhpcy5zaG93VG9vbHRpcChyZWZOYW1lLCBlLmNsaWVudFgsIGUuY2xpZW50WSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcbiAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XG4gICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBpZiAodGhpcy5hY3RpdmVUb29sdGlwICYmICF0aGlzLmFjdGl2ZVRvb2x0aXAubWF0Y2hlcygnOmhvdmVyJykpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgMjAwKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBUYWJsZVRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB7XG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xuICAgICAgICBpZiAocmVmTmFtZSkge1xuICAgICAgICAgIHRoaXMuc2hvd1Rvb2x0aXAocmVmTmFtZSwgZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYmYtcmVmLWxpbmsnKSkge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBpZiAodGhpcy5hY3RpdmVUb29sdGlwICYmICF0aGlzLmFjdGl2ZVRvb2x0aXAubWF0Y2hlcygnOmhvdmVyJykpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgMjAwKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2hvd1Rvb2x0aXAoYmxvY2tOYW1lOiBzdHJpbmcsIG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlcikge1xuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5ibG9ja1JlZ2lzdHJ5LmdldChibG9ja05hbWUpO1xuICAgIGlmICghZW50cnkpIHJldHVybjtcblxuICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuXG4gICAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHRvb2x0aXAuY2xhc3NOYW1lID0gJ2JmLXRvb2x0aXAnO1xuXG4gICAgY29uc3QgZGVzYyA9IGVudHJ5LmJsb2NrLmRlc2NyaXB0aW9uID8gYCDigJQgJHtlbnRyeS5ibG9jay5kZXNjcmlwdGlvbn1gIDogJyc7XG4gICAgdG9vbHRpcC5jcmVhdGVFbCgncCcsIHtcbiAgICAgIHRleHQ6IGAke2Jsb2NrTmFtZX0ke2Rlc2N9YCxcbiAgICAgIGNsczogJ2JmLXRvb2x0aXAtaGVhZGVyJ1xuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuY3VycmVudFZpZXcgPT09ICdzdmcnKSB7XG4gICAgICBjb25zdCBzdmdXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXN2ZycgfSk7XG4gICAgICBzdmdXcmFwLmlubmVySFRNTCA9IHJlbmRlckJsb2NrU3ZnKGVudHJ5LmJsb2NrKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdGFibGVXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXRhYmxlJyB9KTtcbiAgICAgIHRhYmxlV3JhcC5pbm5lckhUTUwgPSByZW5kZXJCbG9ja1RhYmxlKGVudHJ5LmJsb2NrKTtcbiAgICB9XG5cbiAgICB0b29sdGlwLmNyZWF0ZUVsKCdwJywge1xuICAgICAgdGV4dDogJ+WNleWHu+i3s+i9rOafpeeci+WujOaVtOWumuS5iScsXG4gICAgICBjbHM6ICdiZi10b29sdGlwLWhpbnQnXG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRvb2x0aXApO1xuICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IHRvb2x0aXA7XG5cbiAgICBjb25zdCByZWN0ID0gdG9vbHRpcC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBsZXQgbGVmdCA9IG1vdXNlWCArIDEyO1xuICAgIGxldCB0b3AgPSBtb3VzZVkgLSAyMDtcblxuICAgIGlmIChsZWZ0ICsgcmVjdC53aWR0aCA+IHdpbmRvdy5pbm5lcldpZHRoIC0gMTYpIHtcbiAgICAgIGxlZnQgPSBtb3VzZVggLSByZWN0LndpZHRoIC0gMTI7XG4gICAgfVxuICAgIGlmICh0b3AgKyByZWN0LmhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDE2KSB7XG4gICAgICB0b3AgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDE2O1xuICAgIH1cbiAgICBpZiAodG9wIDwgOCkgdG9wID0gODtcblxuICAgIHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRvb2x0aXAuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblxuICAgIHRvb2x0aXAuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcbiAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSByZW1vdmVUb29sdGlwKCkge1xuICAgIGlmICh0aGlzLmFjdGl2ZVRvb2x0aXApIHtcbiAgICAgIHRoaXMuYWN0aXZlVG9vbHRpcC5yZW1vdmUoKTtcbiAgICAgIHRoaXMuYWN0aXZlVG9vbHRpcCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLy8g4pSA4pSA4pSAIOW8leeUqOino+aekCDilIDilIDilIBcblxuICBwcml2YXRlIGNvbGxlY3RQZW5kaW5nUmVmcyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXJlZl0nKS5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgY29uc3QgcmVmTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKSE7XG4gICAgICBpZiAoIXRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocmVmTmFtZSkpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWU6IHJlZk5hbWUgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmJmLXJlZi1saW5rJykuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldE5hbWUgPSBlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGFyZ2V0JykhO1xuICAgICAgaWYgKCF0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHRhcmdldE5hbWUpKSB7XG4gICAgICAgIHRoaXMucGVuZGluZ1JlZnMucHVzaCh7IGVsZW1lbnQ6IGVsIGFzIEhUTUxFbGVtZW50LCB0YXJnZXROYW1lIH0pO1xuICAgICAgICAoZWwgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5hZGQoJ2JmLXJlZi11bnJlc29sdmVkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVQZW5kaW5nUmVmcygpIHtcbiAgICBjb25zdCBzdGlsbFBlbmRpbmc6IHR5cGVvZiB0aGlzLnBlbmRpbmdSZWZzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5wZW5kaW5nUmVmcykge1xuICAgICAgaWYgKHRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocGVuZGluZy50YXJnZXROYW1lKSkge1xuICAgICAgICBwZW5kaW5nLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnYmYtcmVmLXVucmVzb2x2ZWQnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0aWxsUGVuZGluZy5wdXNoKHBlbmRpbmcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMucGVuZGluZ1JlZnMgPSBzdGlsbFBlbmRpbmc7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJQbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWtHQTtBQUNPLFNBQVMsU0FBUyxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRTtBQUM3RCxJQUFJLFNBQVMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLE9BQU8sS0FBSyxZQUFZLENBQUMsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsVUFBVSxPQUFPLEVBQUUsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEgsSUFBSSxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUMsRUFBRSxVQUFVLE9BQU8sRUFBRSxNQUFNLEVBQUU7QUFDL0QsUUFBUSxTQUFTLFNBQVMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ25HLFFBQVEsU0FBUyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3RHLFFBQVEsU0FBUyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdEgsUUFBUSxJQUFJLENBQUMsQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsVUFBVSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFDOUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUE2TUQ7QUFDdUIsT0FBTyxlQUFlLEtBQUssVUFBVSxHQUFHLGVBQWUsR0FBRyxVQUFVLEtBQUssRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFO0FBQ3ZILElBQUksSUFBSSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0IsSUFBSSxPQUFPLENBQUMsQ0FBQyxJQUFJLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxL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
