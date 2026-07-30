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

/*! @license DOMPurify 3.4.12 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.12/LICENSE */

function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function _arrayWithHoles(r) {
  if (Array.isArray(r)) return r;
}
function _iterableToArrayLimit(r, l) {
  var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (null != t) {
    var e,
      n,
      i,
      u,
      a = [],
      f = true,
      o = false;
    try {
      if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
    } catch (r) {
      o = true, n = r;
    } finally {
      try {
        if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
      } finally {
        if (o) throw n;
      }
    }
    return a;
  }
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _slicedToArray(r, e) {
  return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}

const entries = Object.entries,
  setPrototypeOf = Object.setPrototypeOf,
  isFrozen = Object.isFrozen,
  getPrototypeOf = Object.getPrototypeOf,
  getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
let freeze = Object.freeze,
  seal = Object.seal,
  create = Object.create; // eslint-disable-line import/no-mutable-exports
let _ref = typeof Reflect !== 'undefined' && Reflect,
  apply = _ref.apply,
  construct = _ref.construct;
if (!freeze) {
  freeze = function freeze(x) {
    return x;
  };
}
if (!seal) {
  seal = function seal(x) {
    return x;
  };
}
if (!apply) {
  apply = function apply(func, thisArg) {
    for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }
    return func.apply(thisArg, args);
  };
}
if (!construct) {
  construct = function construct(Func) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    return new Func(...args);
  };
}
const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const arrayIsArray = Array.isArray;
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const numberToString = unapply(Number.prototype.toString);
const booleanToString = unapply(Boolean.prototype.toString);
const bigintToString = typeof BigInt === 'undefined' ? null : unapply(BigInt.prototype.toString);
const symbolToString = typeof Symbol === 'undefined' ? null : unapply(Symbol.prototype.toString);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const objectToString = unapply(Object.prototype.toString);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
/**
 * Creates a new function that calls the given function with a specified thisArg and arguments.
 *
 * @param func - The function to be wrapped and called.
 * @returns A new function that calls the given function with a specified thisArg and arguments.
 */
function unapply(func) {
  return function (thisArg) {
    if (thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }
    for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }
    return apply(func, thisArg, args);
  };
}
/**
 * Creates a new function that constructs an instance of the given constructor function with the provided arguments.
 *
 * @param func - The constructor function to be wrapped and called.
 * @returns A new function that constructs an instance of the given constructor function with the provided arguments.
 */
function unconstruct(Func) {
  return function () {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }
    return construct(Func, args);
  };
}
/**
 * Add properties to a lookup table
 *
 * @param set - The set to which elements will be added.
 * @param array - The array containing elements to be added to the set.
 * @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
 * @returns The modified set with added elements.
 */
function addToSet(set, array) {
  let transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
  if (setPrototypeOf) {
    // Make 'in' and truthy checks like Boolean(set.constructor)
    // independent of any properties defined on Object.prototype.
    // Prevent prototype setters from intercepting set as a this value.
    setPrototypeOf(set, null);
  }
  if (!arrayIsArray(array)) {
    return set;
  }
  let l = array.length;
  while (l--) {
    let element = array[l];
    if (typeof element === 'string') {
      const lcElement = transformCaseFunc(element);
      if (lcElement !== element) {
        // Config presets (e.g. tags.js, attrs.js) are immutable.
        if (!isFrozen(array)) {
          array[l] = lcElement;
        }
        element = lcElement;
      }
    }
    set[element] = true;
  }
  return set;
}
/**
 * Clean up an array to harden against CSPP
 *
 * @param array - The array to be cleaned.
 * @returns The cleaned version of the array
 */
function cleanArray(array) {
  for (let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if (!isPropertyExist) {
      array[index] = null;
    }
  }
  return array;
}
/**
 * Shallow clone an object
 *
 * @param object - The object to be cloned.
 * @returns A new object that copies the original.
 */
function clone(object) {
  const newObject = create(null);
  for (const _ref2 of entries(object)) {
    var _ref3 = _slicedToArray(_ref2, 2);
    const property = _ref3[0];
    const value = _ref3[1];
    const isPropertyExist = objectHasOwnProperty(object, property);
    if (isPropertyExist) {
      if (arrayIsArray(value)) {
        newObject[property] = cleanArray(value);
      } else if (value && typeof value === 'object' && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }
  return newObject;
}
/**
 * Convert non-node values into strings without depending on direct property access.
 *
 * @param value - The value to stringify.
 * @returns A string representation of the provided value.
 */
function stringifyValue(value) {
  switch (typeof value) {
    case 'string':
      {
        return value;
      }
    case 'number':
      {
        return numberToString(value);
      }
    case 'boolean':
      {
        return booleanToString(value);
      }
    case 'bigint':
      {
        return bigintToString ? bigintToString(value) : '0';
      }
    case 'symbol':
      {
        return symbolToString ? symbolToString(value) : 'Symbol()';
      }
    case 'undefined':
      {
        return objectToString(value);
      }
    case 'function':
    case 'object':
      {
        if (value === null) {
          return objectToString(value);
        }
        const valueAsRecord = value;
        const valueToString = lookupGetter(valueAsRecord, 'toString');
        if (typeof valueToString === 'function') {
          const stringified = valueToString(valueAsRecord);
          return typeof stringified === 'string' ? stringified : objectToString(stringified);
        }
        return objectToString(value);
      }
    default:
      {
        return objectToString(value);
      }
  }
}
/**
 * This method automatically checks if the prop is function or getter and behaves accordingly.
 *
 * @param object - The object to look up the getter function in its prototype chain.
 * @param prop - The property name for which to find the getter function.
 * @returns The getter function found in the prototype chain or a fallback function.
 */
function lookupGetter(object, prop) {
  while (object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if (desc) {
      if (desc.get) {
        return unapply(desc.get);
      }
      if (typeof desc.value === 'function') {
        return unapply(desc.value);
      }
    }
    object = getPrototypeOf(object);
  }
  function fallbackValue() {
    return null;
  }
  return fallbackValue;
}
function isRegex(value) {
  try {
    regExpTest(value, '');
    return true;
  } catch (_unused) {
    return false;
  }
}

const html$1 = freeze(['a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'content', 'data', 'datalist', 'dd', 'decorator', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meter', 'nav', 'nobr', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'search', 'section', 'select', 'shadow', 'slot', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr']);
const svg$1 = freeze(['svg', 'a', 'altglyph', 'altglyphdef', 'altglyphitem', 'animatecolor', 'animatemotion', 'animatetransform', 'circle', 'clippath', 'defs', 'desc', 'ellipse', 'enterkeyhint', 'exportparts', 'filter', 'font', 'g', 'glyph', 'glyphref', 'hkern', 'image', 'inputmode', 'line', 'lineargradient', 'marker', 'mask', 'metadata', 'mpath', 'part', 'path', 'pattern', 'polygon', 'polyline', 'radialgradient', 'rect', 'stop', 'style', 'switch', 'symbol', 'text', 'textpath', 'title', 'tref', 'tspan', 'view', 'vkern']);
const svgFilters = freeze(['feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence']);
// List of SVG elements that are disallowed by default.
// We still need to know them so that we can do namespace
// checks properly in case one wants to add them to
// allow-list.
const svgDisallowed = freeze(['animate', 'color-profile', 'cursor', 'discard', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'foreignobject', 'hatch', 'hatchpath', 'mesh', 'meshgradient', 'meshpatch', 'meshrow', 'missing-glyph', 'script', 'set', 'solidcolor', 'unknown', 'use']);
const mathMl$1 = freeze(['math', 'menclose', 'merror', 'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mspace', 'msqrt', 'mstyle', 'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'mprescripts']);
// Similarly to SVG, we want to know all MathML elements,
// even those that we disallow by default.
const mathMlDisallowed = freeze(['maction', 'maligngroup', 'malignmark', 'mlongdiv', 'mscarries', 'mscarry', 'msgroup', 'mstack', 'msline', 'msrow', 'semantics', 'annotation', 'annotation-xml', 'mprescripts', 'none']);
const text = freeze(['#text']);

const html = freeze(['accept', 'action', 'align', 'alt', 'autocapitalize', 'autocomplete', 'autopictureinpicture', 'autoplay', 'background', 'bgcolor', 'border', 'capture', 'cellpadding', 'cellspacing', 'checked', 'cite', 'class', 'clear', 'color', 'cols', 'colspan', 'command', 'commandfor', 'controls', 'controlslist', 'coords', 'crossorigin', 'datetime', 'decoding', 'default', 'dir', 'disabled', 'disablepictureinpicture', 'disableremoteplayback', 'download', 'draggable', 'enctype', 'enterkeyhint', 'exportparts', 'face', 'for', 'headers', 'height', 'hidden', 'high', 'href', 'hreflang', 'id', 'inert', 'inputmode', 'integrity', 'ismap', 'kind', 'label', 'lang', 'list', 'loading', 'loop', 'low', 'max', 'maxlength', 'media', 'method', 'min', 'minlength', 'multiple', 'muted', 'name', 'nonce', 'noshade', 'novalidate', 'nowrap', 'open', 'optimum', 'part', 'pattern', 'placeholder', 'playsinline', 'popover', 'popovertarget', 'popovertargetaction', 'poster', 'preload', 'pubdate', 'radiogroup', 'readonly', 'rel', 'required', 'rev', 'reversed', 'role', 'rows', 'rowspan', 'spellcheck', 'scope', 'selected', 'shape', 'size', 'sizes', 'slot', 'span', 'srclang', 'start', 'src', 'srcset', 'step', 'style', 'summary', 'tabindex', 'title', 'translate', 'type', 'usemap', 'valign', 'value', 'width', 'wrap', 'xmlns']);
const svg = freeze(['accent-height', 'accumulate', 'additive', 'alignment-baseline', 'amplitude', 'ascent', 'attributename', 'attributetype', 'azimuth', 'basefrequency', 'baseline-shift', 'begin', 'bias', 'by', 'class', 'clip', 'clippathunits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'cx', 'cy', 'd', 'dx', 'dy', 'diffuseconstant', 'direction', 'display', 'divisor', 'dominant-baseline', 'dur', 'edgemode', 'elevation', 'end', 'exponent', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterunits', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyphref', 'gradientunits', 'gradienttransform', 'height', 'href', 'id', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4', 'kerning', 'keypoints', 'keysplines', 'keytimes', 'lang', 'lengthadjust', 'letter-spacing', 'kernelmatrix', 'kernelunitlength', 'lighting-color', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'maskcontentunits', 'maskunits', 'max', 'mask', 'mask-type', 'media', 'method', 'mode', 'min', 'name', 'numoctaves', 'offset', 'operator', 'opacity', 'order', 'orient', 'orientation', 'origin', 'overflow', 'paint-order', 'path', 'pathlength', 'patterncontentunits', 'patterntransform', 'patternunits', 'points', 'preservealpha', 'preserveaspectratio', 'primitiveunits', 'r', 'rx', 'ry', 'radius', 'refx', 'refy', 'repeatcount', 'repeatdur', 'restart', 'result', 'rotate', 'scale', 'seed', 'shape-rendering', 'slope', 'specularconstant', 'specularexponent', 'spreadmethod', 'startoffset', 'stddeviation', 'stitchtiles', 'stop-color', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke', 'stroke-width', 'style', 'surfacescale', 'systemlanguage', 'tabindex', 'tablevalues', 'targetx', 'targety', 'transform', 'transform-origin', 'text-anchor', 'text-decoration', 'text-orientation', 'text-rendering', 'textlength', 'type', 'u1', 'u2', 'unicode', 'values', 'viewbox', 'visibility', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'width', 'word-spacing', 'wrap', 'writing-mode', 'xchannelselector', 'ychannelselector', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2', 'z', 'zoomandpan']);
const mathMl = freeze(['accent', 'accentunder', 'align', 'bevelled', 'close', 'columnalign', 'columnlines', 'columnspacing', 'columnspan', 'denomalign', 'depth', 'dir', 'display', 'displaystyle', 'encoding', 'fence', 'frame', 'height', 'href', 'id', 'largeop', 'length', 'linethickness', 'lquote', 'lspace', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'numalign', 'open', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'rquote', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier', 'selection', 'separator', 'separators', 'stretchy', 'subscriptshift', 'supscriptshift', 'symmetric', 'voffset', 'width', 'xmlns']);
const xml = freeze(['xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink']);

const MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
const ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
const TMPLIT_EXPR = seal(/\${[\w\W]*/g);
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/); // eslint-disable-line no-useless-escape
const ARIA_ATTR = seal(/^aria-[\-\w]+$/); // eslint-disable-line no-useless-escape
const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eslint-disable-line no-useless-escape
);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g // eslint-disable-line no-control-regex
);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
// Markup-significant character probes used by _sanitizeElements.
// Shared module-level instances are safe despite the sticky /g flags:
// unapply() resets lastIndex for RegExp receivers before every call.
const ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
const COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
const FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
const SELF_CLOSING_TAG = seal(/\/>/i);

// https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
const NODE_TYPE = {
  element: 1,
  attribute: 2,
  text: 3,
  cdataSection: 4,
  entityReference: 5,
  // Deprecated
  entityNode: 6,
  // Deprecated
  processingInstruction: 7,
  comment: 8,
  document: 9,
  documentType: 10,
  documentFragment: 11,
  notation: 12 // Deprecated
};
const getGlobal = function getGlobal() {
  return typeof window === 'undefined' ? null : window;
};
/**
 * Creates a no-op policy for internal use only.
 * Don't export this function outside this module!
 * @param trustedTypes The policy factory.
 * @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
 * @return The policy created (or null, if Trusted Types
 * are not supported or creating the policy failed).
 */
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
  if (typeof trustedTypes !== 'object' || typeof trustedTypes.createPolicy !== 'function') {
    return null;
  }
  // Allow the callers to control the unique policy name
  // by adding a data-tt-policy-suffix to the script element with the DOMPurify.
  // Policy creation with duplicate names throws in Trusted Types.
  let suffix = null;
  const ATTR_NAME = 'data-tt-policy-suffix';
  if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }
  const policyName = 'dompurify' + (suffix ? '#' + suffix : '');
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html) {
        return html;
      },
      createScriptURL(scriptUrl) {
        return scriptUrl;
      }
    });
  } catch (_) {
    // Policy creation failed (most likely another DOMPurify script has
    // already run). Skip creating the policy, as this will only cause errors
    // if TT are enforced.
    console.warn('TrustedTypes policy ' + policyName + ' could not be created.');
    return null;
  }
};
const _createHooksMap = function _createHooksMap() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
};
/**
 * Resolve a set-valued configuration option: a fresh set built from
 * cfg[key] when it is an own array property (seeded with a clone of
 * options.base when given, case-normalized via options.transform),
 * the fallback set otherwise.
 *
 * @param cfg the cloned, prototype-free configuration object
 * @param key the configuration property to read
 * @param fallback the set to use when the option is absent or not an array
 * @param options transform and optional base set to merge into
 * @returns the resolved set
 */
const _resolveSetOption = function _resolveSetOption(cfg, key, fallback, options) {
  return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
};
function createDOMPurify() {
  let window = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
  const DOMPurify = root => createDOMPurify(root);
  DOMPurify.version = '3.4.12';
  DOMPurify.removed = [];
  if (!window || !window.document || window.document.nodeType !== NODE_TYPE.document || !window.Element) {
    // Not running in a browser, provide a factory function
    // so that you can pass your own Window
    DOMPurify.isSupported = false;
    return DOMPurify;
  }
  let document = window.document;
  const originalDocument = document;
  const currentScript = originalDocument.currentScript;
  window.DocumentFragment;
    const HTMLTemplateElement = window.HTMLTemplateElement,
    Node = window.Node,
    Element = window.Element,
    NodeFilter = window.NodeFilter,
    _window$NamedNodeMap = window.NamedNodeMap;
    _window$NamedNodeMap === void 0 ? window.NamedNodeMap || window.MozNamedAttrMap : _window$NamedNodeMap;
    window.HTMLFormElement;
    const DOMParser = window.DOMParser,
    trustedTypes = window.trustedTypes;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, 'cloneNode');
  const remove = lookupGetter(ElementPrototype, 'remove');
  const getNextSibling = lookupGetter(ElementPrototype, 'nextSibling');
  const getChildNodes = lookupGetter(ElementPrototype, 'childNodes');
  const getParentNode = lookupGetter(ElementPrototype, 'parentNode');
  const getShadowRoot = lookupGetter(ElementPrototype, 'shadowRoot');
  const getAttributes = lookupGetter(ElementPrototype, 'attributes');
  const getNodeType = Node && Node.prototype ? lookupGetter(Node.prototype, 'nodeType') : null;
  const getNodeName = Node && Node.prototype ? lookupGetter(Node.prototype, 'nodeName') : null;
  // As per issue #47, the web-components registry is inherited by a
  // new document created via createHTMLDocument. As per the spec
  // (http://w3c.github.io/webcomponents/spec/custom/#creating-and-passing-registries)
  // a new empty registry is used when creating a template contents owner
  // document, so we use that as our parent document to ensure nothing
  // is inherited.
  if (typeof HTMLTemplateElement === 'function') {
    const template = document.createElement('template');
    if (template.content && template.content.ownerDocument) {
      document = template.content.ownerDocument;
    }
  }
  let trustedTypesPolicy;
  let emptyHTML = '';
  // The instance's own internal Trusted Types policy. Unlike a caller-supplied
  // `TRUSTED_TYPES_POLICY`, this is created at most once — Trusted Types throws
  // on duplicate policy names — and is the only policy allowed to persist
  // across configurations and survive `clearConfig()`.
  let defaultTrustedTypesPolicy;
  let defaultTrustedTypesPolicyResolved = false;
  // Tracks whether we are already inside a call to the configured Trusted Types
  // policy (`createHTML` or `createScriptURL`). If a supplied policy callback
  // itself calls `DOMPurify.sanitize` (the cause of #1422), `sanitize` would
  // re-enter the policy and recurse until the stack overflows. We detect that
  // re-entry and throw a clear, actionable error instead. The guard is shared
  // across both callbacks, because either one re-entering `sanitize` triggers
  // the same unbounded recursion.
  let IN_TRUSTED_TYPES_POLICY = 0;
  const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy() {
    if (IN_TRUSTED_TYPES_POLICY > 0) {
      throw typeErrorCreate('A configured TRUSTED_TYPES_POLICY callback (createHTML or ' + 'createScriptURL) must not call DOMPurify.sanitize, as that causes ' + 'infinite recursion. Do not pass a policy whose callbacks wrap ' + 'DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted ' + 'Types" section of the README.');
    }
  };
  const _createTrustedHTML = function _createTrustedHTML(html) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createHTML(html);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  const _createTrustedScriptURL = function _createTrustedScriptURL(scriptUrl) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createScriptURL(scriptUrl);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  // Lazily resolve (and cache) the instance's internal default policy.
  // Resolution is attempted at most once: a successful `createPolicy` cannot be
  // repeated (Trusted Types throws on duplicate names), and a failed or
  // unsupported attempt must not be retried on every parse.
  const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy() {
    if (!defaultTrustedTypesPolicyResolved) {
      defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      defaultTrustedTypesPolicyResolved = true;
    }
    return defaultTrustedTypesPolicy;
  };
  const _document = document,
    implementation = _document.implementation,
    createNodeIterator = _document.createNodeIterator,
    createDocumentFragment = _document.createDocumentFragment,
    getElementsByTagName = _document.getElementsByTagName;
  const importNode = originalDocument.importNode;
  let hooks = _createHooksMap();
  /**
   * Expose whether this browser supports running the full DOMPurify.
   */
  DOMPurify.isSupported = typeof entries === 'function' && typeof getParentNode === 'function' && implementation && implementation.createHTMLDocument !== undefined;
  const MUSTACHE_EXPR$1 = MUSTACHE_EXPR,
    ERB_EXPR$1 = ERB_EXPR,
    TMPLIT_EXPR$1 = TMPLIT_EXPR,
    DATA_ATTR$1 = DATA_ATTR,
    ARIA_ATTR$1 = ARIA_ATTR,
    IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA,
    ATTR_WHITESPACE$1 = ATTR_WHITESPACE,
    CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
  let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
  /**
   * We consider the elements and attributes below to be safe. Ideally
   * don't add any new ones but feel free to remove unwanted ones.
   */
  /* allowed element names */
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
  /* Allowed attribute names */
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  /*
   * Configure how DOMPurify should handle custom elements and their attributes as well as customized built-in elements.
   * @property {RegExp|Function|null} tagNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any custom elements)
   * @property {RegExp|Function|null} attributeNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any attributes not on the allow list)
   * @property {boolean} allowCustomizedBuiltInElements allow custom elements derived from built-ins if they pass CUSTOM_ELEMENT_HANDLING.tagNameCheck. Default: `false`.
   */
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  /* Explicitly forbidden tags (overrides ALLOWED_TAGS/ADD_TAGS) */
  let FORBID_TAGS = null;
  /* Explicitly forbidden attributes (overrides ALLOWED_ATTR/ADD_ATTR) */
  let FORBID_ATTR = null;
  /* Config object to store ADD_TAGS/ADD_ATTR functions (when used as functions) */
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  /* Decide if ARIA attributes are okay */
  let ALLOW_ARIA_ATTR = true;
  /* Decide if custom data attributes are okay */
  let ALLOW_DATA_ATTR = true;
  /* Decide if unknown protocols are okay */
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  /* Decide if self-closing tags in attributes are allowed.
   * Usually removed due to a mXSS issue in jQuery 3.0 */
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  /* Output should be safe for common template engines.
   * This means, DOMPurify removes data attributes, mustaches and ERB
   */
  let SAFE_FOR_TEMPLATES = false;
  /* Output should be safe even for XML used within HTML and alike.
   * This means, DOMPurify removes comments when containing risky content.
   */
  let SAFE_FOR_XML = true;
  /* Decide if document with <html>... should be returned */
  let WHOLE_DOCUMENT = false;
  /* Track whether config is already set on this instance of DOMPurify. */
  let SET_CONFIG = false;
  /* Pristine allowlist bindings captured at setConfig() time. On the
   * persistent-config path sanitize() restores the sets from these before
   * the per-walk hook clone-guard, so a hook's in-call widening cannot
   * carry across calls. Null until setConfig() is called; reset by
   * clearConfig(). */
  let SET_CONFIG_ALLOWED_TAGS = null;
  let SET_CONFIG_ALLOWED_ATTR = null;
  /* Decide if all elements (e.g. style, script) must be children of
   * document.body. By default, browsers might move them to document.head */
  let FORCE_BODY = false;
  /* Decide if a DOM `HTMLBodyElement` should be returned, instead of a html
   * string (or a TrustedHTML object if Trusted Types are supported).
   * If `WHOLE_DOCUMENT` is enabled a `HTMLHtmlElement` will be returned instead
   */
  let RETURN_DOM = false;
  /* Decide if a DOM `DocumentFragment` should be returned, instead of a html
   * string  (or a TrustedHTML object if Trusted Types are supported) */
  let RETURN_DOM_FRAGMENT = false;
  /* Try to return a Trusted Type object instead of a string, return a string in
   * case Trusted Types are not supported  */
  let RETURN_TRUSTED_TYPE = false;
  /* Output should be free from DOM clobbering attacks?
   * This sanitizes markups named with colliding, clobberable built-in DOM APIs.
   */
  let SANITIZE_DOM = true;
  /* Achieve full DOM Clobbering protection by isolating the namespace of named
   * properties and JS variables, mitigating attacks that abuse the HTML/DOM spec rules.
   *
   * HTML/DOM spec rules that enable DOM Clobbering:
   *   - Named Access on Window (§7.3.3)
   *   - DOM Tree Accessors (§3.1.5)
   *   - Form Element Parent-Child Relations (§4.10.3)
   *   - Iframe srcdoc / Nested WindowProxies (§4.8.5)
   *   - HTMLCollection (§4.2.10.2)
   *
   * Namespace isolation is implemented by prefixing `id` and `name` attributes
   * with a constant string, i.e., `user-content-`
   */
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = 'user-content-';
  /* Keep element content when removing element? */
  let KEEP_CONTENT = true;
  /* If a `Node` is passed to sanitize(), then performs sanitization in-place instead
   * of importing it into a new Document and returning a sanitized copy */
  let IN_PLACE = false;
  /* Allow usage of profiles like html, svg and mathMl */
  let USE_PROFILES = {};
  /* Tags to ignore content of when KEEP_CONTENT is true */
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, ['annotation-xml', 'audio', 'colgroup', 'desc', 'foreignobject', 'head', 'iframe', 'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed', 'noframes', 'noscript', 'plaintext', 'script',
  // <selectedcontent> mirrors the selected <option>'s subtree, cloned by
  // the UA (customizable <select>) — including any on* handlers — and the
  // engine re-mirrors synchronously whenever a removal changes which
  // option/selectedcontent is current, even inside DOMPurify's inert
  // DOMParser document. Hoisting its children on removal re-inserts a fresh
  // mirror target ahead of the walk, which the engine refills, looping
  // forever (DoS) and amplifying output. Dropping its content on removal
  // (rather than hoisting) breaks that cascade; the content is a duplicate
  // of the option, which is sanitized on its own. See campaign-3 F1/F6.
  'selectedcontent', 'style', 'svg', 'template', 'thead', 'title', 'video', 'xmp']);
  /* Tags that are safe for data: URIs */
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ['audio', 'video', 'img', 'source', 'image', 'track']);
  /* Attributes safe for values like "javascript:" */
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ['alt', 'class', 'for', 'id', 'label', 'name', 'pattern', 'placeholder', 'role', 'summary', 'title', 'value', 'style', 'xmlns']);
  const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
  /* Document namespace */
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  /* Allowed XHTML+XML namespaces */
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze(['mi', 'mo', 'mn', 'ms', 'mtext']);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
  const DEFAULT_HTML_INTEGRATION_POINTS = freeze(['annotation-xml']);
  let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
  // Certain elements are allowed in both SVG and HTML
  // namespace. We need to specify them explicitly
  // so that they don't get erroneously deleted from
  // HTML namespace.
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ['title', 'style', 'font', 'a', 'script']);
  /* Parsing of strict XHTML documents */
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ['application/xhtml+xml', 'text/html'];
  const DEFAULT_PARSER_MEDIA_TYPE = 'text/html';
  let transformCaseFunc = null;
  /* Keep a reference to config to pass to hooks */
  let CONFIG = null;
  /* Ideally, do not touch anything below this line */
  /* ______________________________________________ */
  const formElement = document.createElement('form');
  const isRegexOrFunction = function isRegexOrFunction(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function;
  };
  /**
   * _parseConfig
   *
   * @param cfg optional config literal
   */
  // eslint-disable-next-line complexity
  const _parseConfig = function _parseConfig() {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    if (CONFIG && CONFIG === cfg) {
      return;
    }
    /* Shield configuration object from tampering */
    if (!cfg || typeof cfg !== 'object') {
      cfg = {};
    }
    /* Shield configuration object from prototype pollution */
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE =
    // eslint-disable-next-line unicorn/prefer-includes
    SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    // HTML tags and attributes are not case-sensitive, converting to lowercase. Keeping XHTML as is.
    transformCaseFunc = PARSER_MEDIA_TYPE === 'application/xhtml+xml' ? stringToString : stringToLowerCase;
    /* Set configuration parameters */
    ALLOWED_TAGS = _resolveSetOption(cfg, 'ALLOWED_TAGS', DEFAULT_ALLOWED_TAGS, {
      transform: transformCaseFunc
    });
    ALLOWED_ATTR = _resolveSetOption(cfg, 'ALLOWED_ATTR', DEFAULT_ALLOWED_ATTR, {
      transform: transformCaseFunc
    });
    ALLOWED_NAMESPACES = _resolveSetOption(cfg, 'ALLOWED_NAMESPACES', DEFAULT_ALLOWED_NAMESPACES, {
      transform: stringToString
    });
    URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, 'ADD_URI_SAFE_ATTR', DEFAULT_URI_SAFE_ATTRIBUTES, {
      transform: transformCaseFunc,
      base: DEFAULT_URI_SAFE_ATTRIBUTES
    });
    DATA_URI_TAGS = _resolveSetOption(cfg, 'ADD_DATA_URI_TAGS', DEFAULT_DATA_URI_TAGS, {
      transform: transformCaseFunc,
      base: DEFAULT_DATA_URI_TAGS
    });
    FORBID_CONTENTS = _resolveSetOption(cfg, 'FORBID_CONTENTS', DEFAULT_FORBID_CONTENTS, {
      transform: transformCaseFunc
    });
    FORBID_TAGS = _resolveSetOption(cfg, 'FORBID_TAGS', clone({}), {
      transform: transformCaseFunc
    });
    FORBID_ATTR = _resolveSetOption(cfg, 'FORBID_ATTR', clone({}), {
      transform: transformCaseFunc
    });
    USE_PROFILES = objectHasOwnProperty(cfg, 'USE_PROFILES') ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === 'object' ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false; // Default true
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false; // Default true
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false; // Default false
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false; // Default true
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false; // Default false
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false; // Default true
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false; // Default false
    RETURN_DOM = cfg.RETURN_DOM || false; // Default false
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false; // Default false
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false; // Default false
    FORCE_BODY = cfg.FORCE_BODY || false; // Default false
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false; // Default true
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false; // Default false
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false; // Default true
    IN_PLACE = cfg.IN_PLACE || false; // Default false
    IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI; // Default regexp
    NAMESPACE = typeof cfg.NAMESPACE === 'string' ? cfg.NAMESPACE : HTML_NAMESPACE; // Default HTML namespace
    MATHML_TEXT_INTEGRATION_POINTS = objectHasOwnProperty(cfg, 'MATHML_TEXT_INTEGRATION_POINTS') && cfg.MATHML_TEXT_INTEGRATION_POINTS && typeof cfg.MATHML_TEXT_INTEGRATION_POINTS === 'object' ? clone(cfg.MATHML_TEXT_INTEGRATION_POINTS) : addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS); // Default built-in map
    HTML_INTEGRATION_POINTS = objectHasOwnProperty(cfg, 'HTML_INTEGRATION_POINTS') && cfg.HTML_INTEGRATION_POINTS && typeof cfg.HTML_INTEGRATION_POINTS === 'object' ? clone(cfg.HTML_INTEGRATION_POINTS) : addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS); // Default built-in map
    const customElementHandling = objectHasOwnProperty(cfg, 'CUSTOM_ELEMENT_HANDLING') && cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING === 'object' ? clone(cfg.CUSTOM_ELEMENT_HANDLING) : create(null);
    CUSTOM_ELEMENT_HANDLING = create(null);
    if (objectHasOwnProperty(customElementHandling, 'tagNameCheck') && isRegexOrFunction(customElementHandling.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck; // Default undefined
    }
    if (objectHasOwnProperty(customElementHandling, 'attributeNameCheck') && isRegexOrFunction(customElementHandling.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck; // Default undefined
    }
    if (objectHasOwnProperty(customElementHandling, 'allowCustomizedBuiltInElements') && typeof customElementHandling.allowCustomizedBuiltInElements === 'boolean') {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements; // Default undefined
    }
    seal(CUSTOM_ELEMENT_HANDLING);
    if (SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }
    if (RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }
    /* Parse profile info */
    if (USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, text);
      ALLOWED_ATTR = create(null);
      if (USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }
      if (USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }
    /* Always reset function-based ADD_TAGS / ADD_ATTR checks to prevent
     * leaking across calls when switching from function to array config */
    EXTRA_ELEMENT_HANDLING.tagCheck = null;
    EXTRA_ELEMENT_HANDLING.attributeCheck = null;
    /* Merge configuration parameters */
    if (objectHasOwnProperty(cfg, 'ADD_TAGS')) {
      if (typeof cfg.ADD_TAGS === 'function') {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else if (arrayIsArray(cfg.ADD_TAGS)) {
        if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }
        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, 'ADD_ATTR')) {
      if (typeof cfg.ADD_ATTR === 'function') {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else if (arrayIsArray(cfg.ADD_ATTR)) {
        if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }
        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, 'ADD_URI_SAFE_ATTR') && arrayIsArray(cfg.ADD_URI_SAFE_ATTR)) {
      addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, 'FORBID_CONTENTS') && arrayIsArray(cfg.FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, 'ADD_FORBID_CONTENTS') && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
    }
    /* Add #text in case KEEP_CONTENT is set to true */
    if (KEEP_CONTENT) {
      ALLOWED_TAGS['#text'] = true;
    }
    /* Add html, head and body to ALLOWED_TAGS in case WHOLE_DOCUMENT is true */
    if (WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ['html', 'head', 'body']);
    }
    /* Add tbody to ALLOWED_TAGS in case tables are permitted, see #286, #365 */
    if (ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ['tbody']);
      delete FORBID_TAGS.tbody;
    }
    // Re-derive the active Trusted Types policy from this configuration on
    // every parse. The active policy must never be sticky closure state that
    // outlives the config that set it: a caller-supplied policy left in place
    // after `clearConfig()` — or after a later call that supplied none, or
    // `TRUSTED_TYPES_POLICY: null` — could sign a subsequent "default"
    // `RETURN_TRUSTED_TYPE` result with a foreign, possibly unsafe policy.
    // See GHSA-vxr8-fq34-vvx9.
    if (cfg.TRUSTED_TYPES_POLICY) {
      if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== 'function') {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      }
      if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== 'function') {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      }
      // A caller-supplied policy applies to this configuration only.
      const previousTrustedTypesPolicy = trustedTypesPolicy;
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      // Sign local variables required by `sanitize`. If the supplied policy's
      // `createHTML` is circular (i.e. it calls `DOMPurify.sanitize`), this
      // throws via the re-entrancy guard. Restore the previous policy first so
      // the instance is not left in a poisoned state. See #1422.
      try {
        emptyHTML = _createTrustedHTML('');
      } catch (error) {
        trustedTypesPolicy = previousTrustedTypesPolicy;
        throw error;
      }
    } else if (cfg.TRUSTED_TYPES_POLICY === null) {
      // Explicit opt-out for this call: perform no Trusted Types signing and
      // create nothing (so a strict `trusted-types` CSP that disallows a
      // `dompurify` policy can still call `sanitize` from inside its own
      // policy — see #1422). Resetting to `undefined` rather than a sticky
      // `null` also drops any previously retained caller policy, so it cannot
      // resurface on a later call, while still allowing the next config-less
      // call to restore the internal default policy. See GHSA-vxr8-fq34-vvx9.
      trustedTypesPolicy = undefined;
      emptyHTML = '';
    } else {
      // No policy supplied: keep the currently active policy if one is set — a
      // previously supplied policy is intentionally sticky across config-less
      // calls — otherwise fall back to the instance's own internal policy,
      // created at most once. (A policy supplied for a *single* call still
      // lingers by design; what must not linger is a policy whose configuration
      // has been torn down via `clearConfig()`, which restores the default.)
      if (trustedTypesPolicy === undefined) {
        trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
      }
      // Sign internal variables only when a policy is active. A falsy policy
      // (Trusted Types unsupported, creation failed, or an explicit opt-out)
      // leaves `emptyHTML` as a plain string, so we never call `.createHTML` on
      // a non-policy and throw. See #1422.
      if (trustedTypesPolicy && typeof emptyHTML === 'string') {
        emptyHTML = _createTrustedHTML('');
      }
    }
    // Prevent further manipulation of configuration.
    // Not available in IE8, Safari 5, etc.
    if (freeze) {
      freeze(cfg);
    }
    CONFIG = cfg;
  };
  /* Keep track of all possible SVG and MathML tags
   * so that we can perform the namespace checks
   * correctly. */
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  /**
   * Namespace rules for an element in the SVG namespace.
   *
   * @param tagName the element's lowercase tag name
   * @param parent the (possibly simulated) parent node
   * @param parentTagName the parent's lowercase tag name
   * @returns true if a spec-compliant parser could produce this element
   */
  const _checkSvgNamespace = function _checkSvgNamespace(tagName, parent, parentTagName) {
    // The only way to switch from HTML namespace to SVG
    // is via <svg>. If it happens via any other tag, then
    // it should be killed.
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === 'svg';
    }
    // The only way to switch from MathML to SVG is via <svg>
    // if the parent is either <annotation-xml> or a MathML
    // text integration point.
    if (parent.namespaceURI === MATHML_NAMESPACE) {
      return tagName === 'svg' && (parentTagName === 'annotation-xml' || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
    }
    // We only allow elements that are defined in SVG
    // spec. All others are disallowed in SVG namespace.
    return Boolean(ALL_SVG_TAGS[tagName]);
  };
  /**
   * Namespace rules for an element in the MathML namespace.
   *
   * @param tagName the element's lowercase tag name
   * @param parent the (possibly simulated) parent node
   * @param parentTagName the parent's lowercase tag name
   * @returns true if a spec-compliant parser could produce this element
   */
  const _checkMathMlNamespace = function _checkMathMlNamespace(tagName, parent, parentTagName) {
    // The only way to switch from HTML namespace to MathML
    // is via <math>. If it happens via any other tag, then
    // it should be killed.
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === 'math';
    }
    // The only way to switch from SVG to MathML is via
    // <math> and HTML integration points
    if (parent.namespaceURI === SVG_NAMESPACE) {
      return tagName === 'math' && HTML_INTEGRATION_POINTS[parentTagName];
    }
    // We only allow elements that are defined in MathML
    // spec. All others are disallowed in MathML namespace.
    return Boolean(ALL_MATHML_TAGS[tagName]);
  };
  /**
   * Namespace rules for an element in the HTML namespace.
   *
   * @param tagName the element's lowercase tag name
   * @param parent the (possibly simulated) parent node
   * @param parentTagName the parent's lowercase tag name
   * @returns true if a spec-compliant parser could produce this element
   */
  const _checkHtmlNamespace = function _checkHtmlNamespace(tagName, parent, parentTagName) {
    // The only way to switch from SVG to HTML is via
    // HTML integration points, and from MathML to HTML
    // is via MathML text integration points
    if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    // We disallow tags that are specific for MathML
    // or SVG and should never appear in HTML namespace
    return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
  };
  /**
   * @param element a DOM element whose namespace is being checked
   * @returns Return false if the element has a
   *  namespace that a spec-compliant parser would never
   *  return. Return true otherwise.
   */
  const _checkValidNamespace = function _checkValidNamespace(element) {
    let parent = getParentNode(element);
    // In JSDOM, if we're inside shadow DOM, then parentNode
    // can be null. We just simulate parent in this case.
    if (!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: 'template'
      };
    }
    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false;
    }
    if (element.namespaceURI === SVG_NAMESPACE) {
      return _checkSvgNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === MATHML_NAMESPACE) {
      return _checkMathMlNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === HTML_NAMESPACE) {
      return _checkHtmlNamespace(tagName, parent, parentTagName);
    }
    // For XHTML and XML documents that support custom namespaces
    if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true;
    }
    // The code should never reach this place (this means
    // that the element somehow got namespace that is not
    // HTML, SVG, MathML or allowed via ALLOWED_NAMESPACES).
    // Return false just in case.
    return false;
  };
  /**
   * _forceRemove
   *
   * @param node a DOM node
   */
  const _forceRemove = function _forceRemove(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      // eslint-disable-next-line unicorn/prefer-dom-node-remove
      getParentNode(node).removeChild(node);
    } catch (_) {
      /* The normal detach failed — this is reached for a parentless node
         (getParentNode() is null, so .removeChild throws). Element.prototype
         .remove() is itself a spec no-op on a parentless node, so a recorded
         "removal" would otherwise hand the caller back an intact,
         payload-bearing node (e.g. a detached IN_PLACE root the mXSS canary or
         the style-with-element-child rule decided to kill). Fail closed by
         throwing — exactly as a clobbered root does at the IN_PLACE entry —
         rather than trying to "neutralize" the node via its own methods.
         Neutralizing would mean calling getAttributeNames()/removeAttribute()
         on the node, both of which a <form> root can clobber via a named child
         (and _isClobbered does not even probe getAttributeNames), so the
         neutralize step could itself be silently defeated, leaving the payload
         intact. A throw touches only the cached, clobber-safe remove() and
         getParentNode(). Generalizes GHSA-r47g-fvhr-h676 (clobbered-form root)
         to every root-kill reason. REPORT-3.
                This lives inside the catch, so it never fires for a normally-removed
         in-tree node: those have a parent, removeChild() succeeds, and the
         catch is not entered. Only a kept (parentless) root reaches here. */
      remove(node);
      if (!getParentNode(node)) {
        throw typeErrorCreate('a node selected for removal could not be detached from its tree ' + 'and cannot be safely returned; refusing to sanitize in place');
      }
    }
  };
  /**
   * _neutralizeRoot
   *
   * Fail-closed teardown of an in-place root after the sanitize walk aborts
   * (campaign-3 F2). An internal throw mid-walk — e.g. a page-registered
   * custom element's reaction detaches a node so `_forceRemove`'s deliberate
   * parentless guard throws, or any other re-entrant engine mutation — would
   * otherwise leave the caller's *live* tree half-sanitized, with everything
   * after the abort point still carrying its handlers. There is no safe way
   * to resume the walk (the tree mutated under us), so we strip the root bare:
   * remove every child and every attribute, then let the caller's catch see
   * the original error. Clobber-safe (cached `remove`/`childNodes`/`attributes`
   * getters; the root was already clobber-pre-flighted at the IN_PLACE entry).
   *
   * @param root the in-place root to empty
   */
  const _neutralizeRoot = function _neutralizeRoot(root) {
    /* Strip every disallowed attribute (on* handlers included) off the whole
       subtree BEFORE detaching anything. Detaching first would hand back
       handler-bearing originals (e.g. an already-loading `<img onerror>`)
       whose queued resource event still fires in page scope after we throw.
       Clobber-safe reads; a doomed clobbered node's own attributes are
       irrelevant while its non-clobbered descendants are reached and scrubbed. */
    _neutralizeSubtree(root);
    const childNodes = getChildNodes(root);
    if (childNodes) {
      const snapshot = [];
      arrayForEach(childNodes, child => {
        arrayPush(snapshot, child);
      });
      arrayForEach(snapshot, child => {
        try {
          remove(child);
        } catch (_) {
          /* Best-effort teardown; a still-attached child is handled below */
        }
      });
    }
    const attributes = getAttributes(root);
    if (attributes) {
      for (let i = attributes.length - 1; i >= 0; --i) {
        const attribute = attributes[i];
        const name = attribute && attribute.name;
        if (typeof name === 'string') {
          try {
            root.removeAttribute(name);
          } catch (_) {
            /* Clobbered removeAttribute — ignore (fail-closed best effort) */
          }
        }
      }
    }
  };
  /**
   * _removeAttribute
   *
   * @param name an Attribute name
   * @param element a DOM node
   */
  const _removeAttribute = function _removeAttribute(name, element) {
    try {
      arrayPush(DOMPurify.removed, {
        attribute: element.getAttributeNode(name),
        from: element
      });
    } catch (_) {
      arrayPush(DOMPurify.removed, {
        attribute: null,
        from: element
      });
    }
    element.removeAttribute(name);
    // We void attribute values for unremovable "is" attributes
    if (name === 'is') {
      if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch (_) {}
      } else {
        try {
          element.setAttribute(name, '');
        } catch (_) {}
      }
    }
  };
  /**
   * _stripDisallowedAttributes
   *
   * Removes every attribute the active configuration does not allow from a
   * single element, using the same allowlist as the main attribute pass (so
   * `on*` handlers go, but no `/^on/` blocklist is introduced). Used only to
   * neutralise nodes that are being discarded from an in-place tree.
   *
   * @param element the element to strip
   */
  const _stripDisallowedAttributes = function _stripDisallowedAttributes(element) {
    const attributes = getAttributes(element);
    if (!attributes) {
      return;
    }
    for (let i = attributes.length - 1; i >= 0; --i) {
      const attribute = attributes[i];
      const name = attribute && attribute.name;
      if (typeof name !== 'string' || ALLOWED_ATTR[transformCaseFunc(name)]) {
        continue;
      }
      try {
        element.removeAttribute(name);
      } catch (_) {
        /* Clobbered removeAttribute on a doomed node — ignore */
      }
    }
  };
  /**
   * _neutralizeSubtree
   *
   * Completes the audit-5 F1 fix across every removal path. The KEEP_CONTENT
   * move-hoist neutralises only disallowed-tag removals; clobber, mXSS-canary,
   * namespace, comment, processing-instruction and KEEP_CONTENT:false removals
   * all drop their subtree wholesale via `_forceRemove`. On the IN_PLACE path
   * those dropped nodes are detached from the caller's LIVE tree but a
   * handler-bearing original among them (an `<img onerror>`/`<video>` that was
   * loading) keeps its queued resource event, which fires in page scope after
   * sanitize returns. This walks a removed subtree and strips every attribute
   * the active configuration does not allow — so `on*` handlers are cancelled
   * through the SAME allowlist that governs kept nodes, not a separate `/^on/`
   * blocklist. Run synchronously before sanitize returns, i.e. before any
   * queued event can fire. Hook-free by design: these nodes leave the output,
   * so firing attribute hooks for them would be surprising. Clobber-safe reads;
   * a doomed clobbered node may shadow `removeAttribute` (its own attributes are
   * irrelevant — it is discarded — while its non-clobbered descendants, e.g.
   * the `<img>`, are reached and scrubbed).
   *
   * @param root the root of a removed subtree to neutralise
   */
  const _neutralizeSubtree = function _neutralizeSubtree(root) {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      if (nodeType === NODE_TYPE.element) {
        _stripDisallowedAttributes(node);
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push(childNodes[i]);
        }
      }
    }
  };
  /**
   * _neutralizePatchLinkage
   *
   * IN_PLACE entry pre-pass (declarative-partial-updates / streaming
   * hardening, https://github.com/WICG/declarative-partial-updates).
   *
   * The main walk strips patch linkage (`for`/`patchsrc`) and removes range
   * markers (PIs / markup comments) node-by-node, in document order, AS it
   * reaches each node. On a live in-place root that leaves a window: from the
   * moment the root is connected until the walk arrives at a given node, that
   * node's linkage is live. A patch applied on connection/stream can fire as
   * a microtask during the walk and inject or teleport an unsanitized DOM
   * range into a region the iterator has already passed and will not revisit,
   * so the post-return "tree is sanitized" contract is violated. Sweep the
   * whole tree once up front and sever every linkage before the walk begins,
   * closing that window.
   *
   * This CANNOT undo a patch that already fired before sanitize ran — that is
   * the irreducible "do not IN_PLACE a live-connected attacker tree" caveat —
   * but it closes everything from sanitize-start onward. Gated on SAFE_FOR_XML
   * to group with the rest of the declarative-partial-updates handling and
   * stay overridable, consistent with the codebase.
   *
   * Clobber-safe traversal (cached childNodes getter); per-node try/catch so a
   * clobbered root cannot defeat the sweep of its non-clobbered descendants.
   *
   * NOTE (pending real-Chrome confirmation, see test/declarative-patch-probe
   * .html Q1): this mirrors the existing policy of keeping `for` on
   * <label>/<output>. If the shipping feature can drive a patch through a
   * surviving `for`-on-label/output + `id` pair, this pre-pass and the
   * attribute check at _isBasicCustomElement's caller must additionally drop
   * that pair on the IN_PLACE path. Left as-is until the taxonomy is verified.
   *
   * @param root the in-place root to sweep
   */
  const _neutralizePatchLinkage = function _neutralizePatchLinkage(root) {
    if (!SAFE_FOR_XML) {
      return;
    }
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      /* Remove range markers (the target side of a patch linkage): every
         processing instruction, and any markup-bearing comment. */
      if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
        try {
          remove(node);
        } catch (_) {
          /* Best-effort */
        }
        continue;
      }
      /* Strip patch-source attributes (the source side) off elements. */
      if (nodeType === NODE_TYPE.element) {
        const element = node;
        const lcTag = transformCaseFunc(getNodeName ? getNodeName(node) : node.nodeName);
        try {
          if (element.hasAttribute && element.hasAttribute('patchsrc')) {
            element.removeAttribute('patchsrc');
          }
          if (element.hasAttribute && element.hasAttribute('for') && lcTag !== 'label' && lcTag !== 'output') {
            element.removeAttribute('for');
          }
        } catch (_) {
          /* Clobbered removeAttribute/hasAttribute on a doomed node — ignore */
        }
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push(childNodes[i]);
        }
      }
    }
  };
  /**
   * _initDocument
   *
   * @param dirty - a string of dirty markup
   * @return a DOM, filled with the dirty markup
   */
  const _initDocument = function _initDocument(dirty) {
    /* Create a HTML document */
    let doc = null;
    let leadingWhitespace = null;
    if (FORCE_BODY) {
      dirty = '<remove></remove>' + dirty;
    } else {
      /* If FORCE_BODY isn't used, leading whitespace needs to be preserved manually */
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }
    if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && NAMESPACE === HTML_NAMESPACE) {
      // Root of XHTML doc must contain xmlns declaration (see https://www.w3.org/TR/xhtml1/normative.html#strict)
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + '</body></html>';
    }
    const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
    /*
     * Use the DOMParser API by default, fallback later if needs be
     * DOMParser not work for svg when has multiple root element.
     */
    if (NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch (_) {}
    }
    /* Use createHTMLDocument in case DOMParser is not available */
    if (!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, 'template', null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch (_) {
        // Syntax error if dirtyPayload is invalid xml
      }
    }
    const body = doc.body || doc.documentElement;
    if (dirty && leadingWhitespace) {
      body.insertBefore(document.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }
    /* Work on whole document or just its body */
    if (NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? 'html' : 'body')[0];
    }
    return WHOLE_DOCUMENT ? doc.documentElement : body;
  };
  /**
   * Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
   *
   * @param root The root element or node to start traversing on.
   * @return The created NodeIterator
   */
  const _createNodeIterator = function _createNodeIterator(root) {
    return createNodeIterator.call(root.ownerDocument || root, root,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null);
  };
  /**
   * Replace template expression syntax (mustache, ERB, template
   * literal) with a space; shared by all SAFE_FOR_TEMPLATES scrub
   * sites. Order matters: mustache, then ERB, then template literal.
   *
   * @param value the string to scrub
   * @returns the scrubbed string
   */
  const _stripTemplateExpressions = function _stripTemplateExpressions(value) {
    value = stringReplace(value, MUSTACHE_EXPR$1, ' ');
    value = stringReplace(value, ERB_EXPR$1, ' ');
    value = stringReplace(value, TMPLIT_EXPR$1, ' ');
    return value;
  };
  /**
   * Strip template-engine expressions ({{...}}, ${...}, <%...%>) from the
   * character data of an element subtree. Used as the final safety net for
   * SAFE_FOR_TEMPLATES on every DOM-returning code path so that expressions
   * which only form after text-node normalization (e.g. fragments split across
   * stripped elements) cannot survive into a template-evaluating framework.
   *
   * Walks text/comment/CDATA/processing-instruction nodes and mutates `.data`
   * in place rather than round-tripping through innerHTML. This preserves
   * descendant node references (important for IN_PLACE callers), avoids a
   * serialize/reparse cycle, and reads literal character data — which means
   * `<%...%>` in text content matches the ERB regex against its real bytes
   * instead of the HTML-entity-escaped form innerHTML would produce.
   *
   * Attribute values are not visited here; SAFE_FOR_TEMPLATES handling for
   * attributes is performed during the per-node `_sanitizeAttributes` pass.
   *
   * @param node The root element whose character data should be scrubbed.
   */
  const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
    var _node$querySelectorAl;
    node.normalize();
    const walker = createNodeIterator.call(node.ownerDocument || node, node,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION, null);
    let currentNode = walker.nextNode();
    while (currentNode) {
      currentNode.data = _stripTemplateExpressions(currentNode.data);
      currentNode = walker.nextNode();
    }
    // NodeIterator does not descend into <template>.content per the DOM spec,
    // so we must explicitly recurse into each template's content fragment,
    // mirroring the approach used by _sanitizeShadowDOM.
    const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === void 0 ? void 0 : _node$querySelectorAl.call(node, 'template');
    if (templates) {
      arrayForEach(templates, tmpl => {
        if (_isDocumentFragment(tmpl.content)) {
          _scrubTemplateExpressions2(tmpl.content);
        }
      });
    }
  };
  /**
   * _isClobbered
   *
   * Detect DOM-clobbering on HTMLFormElement nodes. Form is the only HTML
   * interface with [LegacyOverrideBuiltIns]; a descendant element with a
   * `name` attribute matching a prototype property shadows that property
   * on direct reads. We use this check at the IN_PLACE entry-point and
   * during attribute sanitization to refuse clobbered forms.
   *
   * @param element element to check for clobbering attacks
   * @return true if clobbered, false if safe
   */
  const _isClobbered = function _isClobbered(element) {
    // Realm-independent tag-name probe. If we can't determine the tag
    // name at all, we can't reason about clobbering — return false
    // (the caller's other defences still apply).
    const realTagName = getNodeName ? getNodeName(element) : null;
    if (typeof realTagName !== 'string') {
      return false;
    }
    if (transformCaseFunc(realTagName) !== 'form') {
      return false;
    }
    return typeof element.nodeName !== 'string' || typeof element.textContent !== 'string' || typeof element.removeChild !== 'function' ||
    // Realm-safe NamedNodeMap detection: equality against the cached
    // prototype getter. Clobbered .attributes (e.g. <input name="attributes">)
    // makes the direct read diverge from the cached read; a clean form
    // (same-realm OR foreign-realm) has both reads pointing at the same
    // canonical NamedNodeMap.
    element.attributes !== getAttributes(element) || typeof element.removeAttribute !== 'function' || typeof element.setAttribute !== 'function' || typeof element.namespaceURI !== 'string' || typeof element.insertBefore !== 'function' || typeof element.hasChildNodes !== 'function' ||
    // NodeType clobbering probe. Cached Node.prototype.nodeType getter
    // returns the integer 1 for any Element regardless of realm; direct
    // read on a clobbered form (e.g. <input name="nodeType">) returns
    // the named child element. Cheap addition — nodeType is read from
    // an internal slot, no serialization cost — and removes a residual
    // clobbering surface used by several mXSS / PI / comment branches
    // in _sanitizeElements that compare currentNode.nodeType directly.
    element.nodeType !== getNodeType(element) ||
    // HTMLFormElement has [LegacyOverrideBuiltIns]: a descendant named
    // "childNodes" shadows the prototype getter. Direct reads of
    // form.childNodes from a clobbered form return the named child
    // instead of the real NodeList, so any walk that reads it directly
    // skips the form's real children. Compare the direct read to the
    // cached Node.prototype getter — when the form's named-property
    // getter intercepts the read, the two values differ and we flag
    // the form. This catches every clobbering child type (input,
    // select, etc.) regardless of whether the named child happens to
    // carry a numeric .length, which a typeof-based probe would miss
    // (e.g. HTMLSelectElement.length is a defined unsigned-long).
    element.childNodes !== getChildNodes(element);
  };
  /**
   * Checks whether the given value is a DocumentFragment from any realm.
   *
   * The realm-independent replacement reads `nodeType` through the cached
   * Node.prototype getter and compares to the DOCUMENT_FRAGMENT_NODE
   * constant (11). nodeType is a numeric value resolved from the node's
   * internal slot, identical across realms for the same kind of node.
   *
   * @param value object to check
   * @return true if value is a DocumentFragment-shaped node from any realm
   */
  const _isDocumentFragment = function _isDocumentFragment(value) {
    if (!getNodeType || typeof value !== 'object' || value === null) {
      return false;
    }
    try {
      return getNodeType(value) === NODE_TYPE.documentFragment;
    } catch (_) {
      return false;
    }
  };
  /**
   * Checks whether the given object is a DOM node, including nodes that
   * originate from a different window/realm (e.g. an iframe's
   * contentDocument). The previous `value instanceof Node` check was
   * realm-bound: nodes from a different window failed it, causing
   * sanitize() to silently stringify them and reset IN_PLACE to false,
   * returning the original node unsanitized. See GHSA-4w3q-35jp-p934.
   *
   * @param value object to check whether it's a DOM node
   * @return true if value is a DOM node from any realm
   */
  const _isNode = function _isNode(value) {
    if (!getNodeType || typeof value !== 'object' || value === null) {
      return false;
    }
    try {
      return typeof getNodeType(value) === 'number';
    } catch (_) {
      return false;
    }
  };
  function _executeHooks(hooks, currentNode, data) {
    if (hooks.length === 0) {
      return;
    }
    arrayForEach(hooks, hook => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  /**
   * Structural-threat checks that condemn a node regardless of the
   * allowlists: mXSS via namespace confusion, risky CSS construction,
   * processing instructions, markup-bearing comments. Pure predicate;
   * the caller removes. Check order is load-bearing.
   *
   * @param currentNode the node to inspect
   * @param tagName the node's transformCaseFunc'd tag name
   * @return true if the node must be removed
   */
  const _isUnsafeNode = function _isUnsafeNode(currentNode, tagName) {
    /* Detect mXSS attempts abusing namespace confusion */
    if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML)) {
      return true;
    }
    /* Remove risky CSS construction leading to mXSS */
    if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && tagName === 'style' && _isNode(currentNode.firstElementChild)) {
      return true;
    }
    /* Remove any occurrence of processing instructions */
    if (currentNode.nodeType === NODE_TYPE.processingInstruction) {
      return true;
    }
    /* Remove any kind of possibly harmful comments */
    if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data)) {
      return true;
    }
    return false;
  };
  /**
   * Handle a node whose tag is forbidden or not allowlisted: keep
   * allowed custom elements (false return exits _sanitizeElements
   * early - the namespace and fallback-tag removal checks are
   * intentionally skipped for kept custom elements), else hoist
   * content per KEEP_CONTENT and remove.
   *
   * A kept custom element is the ONLY case in which this function
   * returns false, so the caller uses that return value to run the
   * afterSanitizeElements hook on the kept element and keep the
   * element-hook lifecycle consistent with normal allowlisted
   * elements (GHSA-c2j3-45gr-mqc4).
   *
   * @param currentNode the disallowed node
   * @param tagName the node's transformCaseFunc'd tag name
   * @return true if the node was removed, false if kept
   */
  const _sanitizeDisallowedNode = function _sanitizeDisallowedNode(currentNode, tagName) {
    /* Check if we have a custom element to handle */
    if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
      if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
        return false;
      }
      if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
        return false;
      }
    }
    /* Keep content except for bad-listed elements.
         Use the cached prototype getters exclusively — the previous code
         had `|| currentNode.parentNode` / `|| currentNode.childNodes`
         fallbacks, but the cached getters always return the canonical
         value (or null for a real parent-less node), so the fallback
         path was dead in safe cases and a clobbering surface in unsafe
         ones. Falsy cached results stay falsy; the `if (childNodes &&
         parentNode)` check already gates correctly. */
    if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
      const parentNode = getParentNode(currentNode);
      const childNodes = getChildNodes(currentNode);
      if (childNodes && parentNode) {
        const childCount = childNodes.length;
        /* In-place: hoist the *original* children so the iterator visits
             and sanitises them through the same allowlist pass as every other
             node. The caller built the tree in the live document, so the
             originals carry already-queued resource events (`<img onerror>`,
             `<video>`/`<audio>` error, lazy/`onload`, …); cloning would leave
             those originals detached but still armed, firing in page scope
             while the returned tree looked clean. Moving is safe in-place: the
             root is pre-validated as an allowed tag and so is never the node
             being removed, which keeps `parentNode` inside the iterator root
             and the relocated child inside the serialised tree.
                      Otherwise (string / DOM-copy paths): clone. The iterator is rooted
             at — and the result serialised from — `body`, so a restrictive
             ALLOWED_TAGS that removes `body` itself must leave its content in
             place, which only cloning does; and those paths parse into an
             inert document, so their discarded originals never had a queued
             event to neutralise.
                      `childNodes` is live; a tail-to-head walk keeps `childNodes[i]`
             valid whether we move (drops the trailing entry) or clone (leaves
             the list intact). */
        for (let i = childCount - 1; i >= 0; --i) {
          const hoisted = IN_PLACE ? childNodes[i] : cloneNode(childNodes[i], true);
          parentNode.insertBefore(hoisted, getNextSibling(currentNode));
        }
      }
    }
    _forceRemove(currentNode);
    return true;
  };
  /**
   * _sanitizeElements
   *
   * @protect nodeName
   * @protect textContent
   * @protect removeChild
   * @param currentNode to check for permission to exist
   * @return true if node was killed, false if left alive
   */
  // eslint-disable-next-line complexity
  const _sanitizeElements = function _sanitizeElements(currentNode, root) {
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    /* A hook may have detached the node — treat it as removed (see the
       detached-node comment after the uponSanitizeElement hook below). */
    if (currentNode !== root && getParentNode(currentNode) === null) {
      return true;
    }
    /* Check if element is clobbered or can clobber */
    if (_isClobbered(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Now let's check the element's type and name */
    const tagName = transformCaseFunc(getNodeName ? getNodeName(currentNode) : currentNode.nodeName);
    /* Execute a hook if present */
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    /* A hook may have detached the node from the tree — a long-standing
       user pattern (issue #469; draw.io-style foreignObject filtering).
       Per the cached, unclobberable parentNode getter the node is
       genuinely out of the tree, so it can reach neither the serialized
       output nor an IN_PLACE live tree; treat it as removed and stop
       processing it. Without this guard, the unsafe-node / namespace
       checks below would call _forceRemove on a parentless node and hit
       the REPORT-3 fail-closed throw — which exists for nodes DOMPurify
       wants gone but *cannot* detach (clobbered / parentless roots), the
       opposite of a node that is already safely gone. The walk root is
       exempt: a detached IN_PLACE root is legitimate input and must still
       be fully sanitized, and a kill-decision on it must keep hitting the
       REPORT-3 throw. Nodes detached by hooks are the hook's
       responsibility: they are not recorded in DOMPurify.removed and are
       not neutralized by the post-walk IN_PLACE pass. */
    if (currentNode !== root && getParentNode(currentNode) === null) {
      return true;
    }
    /* Remove mXSS vectors, processing instructions and risky comments */
    if (_isUnsafeNode(currentNode, tagName)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Remove element if anything forbids its presence */
    if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
      const removed = _sanitizeDisallowedNode(currentNode, tagName);
      /* A false return means the node is a custom element kept via
         CUSTOM_ELEMENT_HANDLING - the only keep path through
         _sanitizeDisallowedNode. Run afterSanitizeElements on it so the
         element-hook lifecycle matches normal allowlisted elements: a
         security policy applied in this hook (e.g. stripping an attribute
         from every surviving element) must not silently skip kept custom
         elements (GHSA-c2j3-45gr-mqc4). This mirrors the normal-element
         tail below - the hook runs, then the walker's subsequent
         _sanitizeAttributes pass sanitizes the element's attributes. The
         deliberately skipped namespace and fallback-tag removal checks stay
         skipped; they are removal decisions, not the hook contract. */
      if (removed === false) {
        _executeHooks(hooks.afterSanitizeElements, currentNode, null);
      }
      return removed;
    }
    /* Check whether element has a valid namespace.
       Realm-safe check (GHSA-hpcv-96wg-7vj8): use the cached Node.prototype
       nodeType getter rather than `instanceof Element`, which is realm-
       bound and short-circuits to false for any node minted in a different
       realm — letting a foreign-realm element with a forbidden namespace
       slip past the namespace check entirely. */
    const nt = getNodeType ? getNodeType(currentNode) : currentNode.nodeType;
    if (nt === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Make sure that older browsers don't get fallback-tag mXSS */
    if ((tagName === 'noscript' || tagName === 'noembed' || tagName === 'noframes') && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Sanitize element content to be template-safe */
    if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      /* Get the element's text content */
      const content = _stripTemplateExpressions(currentNode.textContent);
      if (currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);
    return false;
  };
  /**
   * _isValidAttribute
   *
   * @param lcTag Lowercase tag name of containing element.
   * @param lcName Lowercase attribute name.
   * @param value Attribute value.
   * @return Returns true if `value` is valid, otherwise false.
   */
  // eslint-disable-next-line complexity
  const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
    /* FORBID_ATTR must always win, even if ADD_ATTR predicate would allow it */
    if (FORBID_ATTR[lcName]) {
      return false;
    }
    /* Reject declarative-partial-updates patch-linkage attributes
       (https://github.com/WICG/declarative-partial-updates).
            Empirical note (Chrome 150, verified — see
       test/declarative-patch-probe-v3.html): expansion is NOT applied after
       sanitization. For the string path it fires during sanitize()'s own
       parse, so the walk sees and sanitizes the fully materialized expanded
       tree — teleports into MathML/SVG integration points included; a
       weaponized `<template for>`->`<img onerror>` comes back with the handler
       stripped. For the IN_PLACE path it fires on connection, before the walk.
       Either way DOMPurify is NOT blind to the patch.
            This removal is therefore defense-in-depth rather than the sole barrier:
       it prevents live linkage from surviving into the OUTPUT and re-expanding
       in the caller's context, and keeps behaviour deterministic if a future
       engine defers expansion. `for` is legitimate only on <label>/<output>;
       anywhere else (notably <template for>) it links the element to a patch
       target and teleports or removes an arbitrary DOM range by id/marker name.
       `patchsrc` fetches remote markup and is treated as a script-loading
       mechanism (CSP). Gated on SAFE_FOR_XML so the removal groups with the
       other structural-threat checks and stays overridable, consistent with
       the rest of the codebase. PI range markers are already removed by
       _isUnsafeNode. */
    if (SAFE_FOR_XML && lcName === 'patchsrc') {
      return false;
    }
    if (SAFE_FOR_XML && lcName === 'for' && lcTag !== 'label' && lcTag !== 'output') {
      return false;
    }
    /* Make sure attribute cannot clobber */
    if (SANITIZE_DOM && (lcName === 'id' || lcName === 'name') && (value in document || value in formElement)) {
      return false;
    }
    const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
    /* Allow valid data-* attributes: At least one character after "-"
        (https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes)
        XML-compatible (https://html.spec.whatwg.org/multipage/infrastructure.html#xml-compatible and http://www.w3.org/TR/xml/#d0e804)
        We don't need to check the value; it's always URI safe. */
    if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName)) ; else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName)) ; else if (!nameIsPermitted) {
      if (
      // First condition does a very basic check if a) it's basically a valid custom element tagname AND
      // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
      // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
      _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) ||
      // Alternative, second condition checks if it's an `is`-attribute, AND
      // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
      lcName === 'is' && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))) ; else {
        return false;
      }
      /* Check value is safe. First, is attr inert? If so, is safe */
    } else if (URI_SAFE_ATTRIBUTES[lcName]) ; else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, ''))) ; else if ((lcName === 'src' || lcName === 'xlink:href' || lcName === 'href') && lcTag !== 'script' && stringIndexOf(value, 'data:') === 0 && DATA_URI_TAGS[lcTag]) ; else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, ''))) ; else if (value) {
      return false;
    } else ;
    return true;
  };
  /* Names the HTML spec reserves from valid-custom-element-name; these must
   * never be treated as basic custom elements even when a permissive
   * CUSTOM_ELEMENT_HANDLING.tagNameCheck is configured. */
  const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, ['annotation-xml', 'color-profile', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'missing-glyph']);
  /**
   * _isBasicCustomElement
   * checks if at least one dash is included in tagName, and it's not the first char
   * for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
   *
   * @param tagName name of the tag of the node to sanitize
   * @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
   */
  const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
    return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
  };
  /**
   * Wrap an attribute value in the matching Trusted Types object when
   * the active policy requires it. Namespaced attributes pass through
   * unchanged (no TT support yet, see
   * https://bugs.chromium.org/p/chromium/issues/detail?id=1305293).
   *
   * @param lcTag lowercase tag name of the containing element
   * @param lcName lowercase attribute name
   * @param namespaceURI the attribute's namespace, if any
   * @param value the attribute value to wrap
   * @return the value, wrapped when Trusted Types demand it
   */
  const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value) {
    if (trustedTypesPolicy && typeof trustedTypes === 'object' && typeof trustedTypes.getAttributeType === 'function' && !namespaceURI) {
      switch (trustedTypes.getAttributeType(lcTag, lcName)) {
        case 'TrustedHTML':
          {
            return _createTrustedHTML(value);
          }
        case 'TrustedScriptURL':
          {
            return _createTrustedScriptURL(value);
          }
      }
    }
    return value;
  };
  /**
   * Write a modified attribute value back onto the element. On
   * success, re-probe for clobbering introduced by the new value and
   * remove the element when found; otherwise pop the removal entry
   * recorded by the earlier _removeAttribute (long-standing pairing
   * with the SANITIZE_NAMED_PROPS path - do not "fix" casually). On
   * failure, remove the attribute instead.
   *
   * @param currentNode the element carrying the attribute
   * @param name the attribute name as present on the element
   * @param namespaceURI the attribute's namespace, if any
   * @param value the new attribute value
   */
  const _setAttributeValue = function _setAttributeValue(currentNode, name, namespaceURI, value) {
    try {
      if (namespaceURI) {
        currentNode.setAttributeNS(namespaceURI, name, value);
      } else {
        /* Fallback to setAttribute() for browser-unrecognized namespaces e.g. "x-schema". */
        currentNode.setAttribute(name, value);
      }
      if (_isClobbered(currentNode)) {
        _forceRemove(currentNode);
      } else {
        arrayPop(DOMPurify.removed);
      }
    } catch (_) {
      _removeAttribute(name, currentNode);
    }
  };
  /**
   * _sanitizeAttributes
   *
   * @protect attributes
   * @protect nodeName
   * @protect removeAttribute
   * @protect setAttribute
   *
   * @param currentNode to sanitize
   */
  const _sanitizeAttributes = function _sanitizeAttributes(currentNode) {
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const attributes = currentNode.attributes;
    /* Check if we have attributes; if not we might have a text node */
    if (!attributes || _isClobbered(currentNode)) {
      return;
    }
    const hookEvent = {
      attrName: '',
      attrValue: '',
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: undefined
    };
    let l = attributes.length;
    const lcTag = transformCaseFunc(currentNode.nodeName);
    /* Go backwards over all attributes; safely remove bad ones */
    while (l--) {
      const attr = attributes[l];
      const name = attr.name,
        namespaceURI = attr.namespaceURI,
        attrValue = attr.value;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === 'value' ? initValue : stringTrim(initValue);
      /* Execute a hook if present */
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = undefined; // Allows developers to see this is a property they can set
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      /* Full DOM Clobbering protection via namespace isolation,
       * Prefix id and name attributes with `user-content-`
       */
      if (SANITIZE_NAMED_PROPS && (lcName === 'id' || lcName === 'name') && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
        // Remove the attribute with this value
        _removeAttribute(name, currentNode);
        // Prefix the value and later re-create the attribute with the sanitized value
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
      }
      // Else: already prefixed, leave the attribute alone — the prefix is
      // itself the clobbering protection, and re-applying it is incorrect.
      /* Work around a security issue with comments inside attributes */
      if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Make sure we cannot easily use animated hrefs, even if animations are allowed */
      if (lcName === 'attributename' && stringMatch(value, 'href')) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Did the hooks force-keep the attribute? */
      if (hookEvent.forceKeepAttr) {
        continue;
      }
      /* Did the hooks approve of the attribute? */
      if (!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Work around a security issue in jQuery 3.0 */
      if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Sanitize attribute content to be template-safe */
      if (SAFE_FOR_TEMPLATES) {
        value = _stripTemplateExpressions(value);
      }
      /* Is `value` valid for this attribute? */
      if (!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Handle attributes that require Trusted Types */
      value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
      /* Handle invalid data-* attribute set by try-catching it */
      if (value !== initValue) {
        _setAttributeValue(currentNode, name, namespaceURI, value);
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  /**
   * _sanitizeShadowDOM
   *
   * @param fragment to iterate over recursively
   */
  const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while (shadowNode = shadowIterator.nextNode()) {
      /* Execute a hook if present */
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      /* Sanitize tags and elements */
      _sanitizeElements(shadowNode, fragment);
      /* Check attributes next */
      _sanitizeAttributes(shadowNode);
      /* Deep shadow DOM detected.
         Realm-safe check (GHSA-hpcv-96wg-7vj8): use nodeType against the
         DOCUMENT_FRAGMENT_NODE constant rather than instanceof, so we
         recurse into <template>.content from foreign realms too. */
      if (_isDocumentFragment(shadowNode.content)) {
        _sanitizeShadowDOM2(shadowNode.content);
      }
      /* An element iterated here may itself host an attached
         shadow root. The default NodeIterator does not enter shadow
         trees, so a shadow root nested inside template.content was
         previously reached by no walk at all (the pre-pass at
         _sanitizeAttachedShadowRoots descends via childNodes, which
         doesn't enter template.content; the template-content recursion
         above iterates the content but never inspected shadowRoot).
         Walk it explicitly. The nodeType guard avoids reading
         shadowRoot off text / comment / CDATA / PI nodes that the
         iterator also surfaces. */
      const shadowNodeType = getNodeType ? getNodeType(shadowNode) : shadowNode.nodeType;
      if (shadowNodeType === NODE_TYPE.element) {
        const innerSr = getShadowRoot(shadowNode);
        if (_isDocumentFragment(innerSr)) {
          _sanitizeAttachedShadowRoots(innerSr);
          _sanitizeShadowDOM2(innerSr);
        }
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };
  /**
   * _sanitizeAttachedShadowRoots
   *
   * Walks `root` and feeds every attached shadow root we encounter into
   * the existing _sanitizeShadowDOM pipeline. The default node iterator
   * does not descend into shadow trees, so nodes inside an attached
   * shadow root would otherwise be skipped entirely.
   *
   * Two real input paths put attached shadow roots in front of us:
   *   1. IN_PLACE on a DOM node that already has shadow roots attached.
   *   2. DOM-node input where importNode(dirty, true) deep-clones the
   *      shadow root because it was created with `clonable: true`.
   *
   * This pass runs once, up front, so the main iteration loop (and the
   * existing _sanitizeShadowDOM template-content recursion) stay
   * untouched — string-input paths are not affected.
   *
   * @param root the subtree root to walk for attached shadow roots
   */
  const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots(root) {
    /* Iterative (explicit stack) rather than per-child recursion. DOM APIs
       impose no depth cap, so an attacker-shaped tree (JSON/CRDT/editor data
       built straight into the DOM — the IN_PLACE surface) deeper than the JS
       call-stack budget would otherwise overflow native recursion here and
       throw at the IN_PLACE entry pre-pass, before a single node is
       sanitized, leaving the caller's live tree untouched (fail-open). See
       campaign-3 F4. A heap stack keeps depth off the call stack.
            Each work item is either a node to descend into, or a deferred
       `_sanitizeShadowDOM` for an already-walked shadow root. The deferred
       form preserves the original post-order discipline: a shadow root's
       nested shadow roots are discovered before the outer shadow is
       sanitized (which may remove hosts). Pushes are in reverse of the
       desired processing order (LIFO): template content, then children, then
       the shadow-sanitize, then the shadow walk — so the order matches the
       previous recursion exactly. */
    const stack = [{
      node: root,
      shadow: null
    }];
    while (stack.length > 0) {
      const item = stack.pop();
      /* Deferred shadow-DOM sanitisation: runs after its subtree was walked. */
      if (item.shadow) {
        _sanitizeShadowDOM2(item.shadow);
        continue;
      }
      const node = item.node;
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      const isElement = nodeType === NODE_TYPE.element;
      /* (pushed last → processed first) Children, snapshotted in reverse so
         the first child is processed first. Snapshotting matters because a
         hook may detach siblings mid-walk. */
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push({
            node: childNodes[i],
            shadow: null
          });
        }
      }
      /* (pushed before children → processed after them, matching the old
         "template content last" order) When the node is a <template>,
         descend into its content. */
      if (isElement) {
        const rootName = getNodeName ? getNodeName(node) : null;
        if (typeof rootName === 'string' && transformCaseFunc(rootName) === 'template') {
          const content = node.content;
          if (_isDocumentFragment(content)) {
            stack.push({
              node: content,
              shadow: null
            });
          }
        }
      }
      /* Shadow root (processed first): walk its subtree, then sanitise it.
         Realm-safe check (GHSA-hpcv-96wg-7vj8): nodeType-based detection
         rather than `instanceof DocumentFragment`, which is realm-bound and
         silently skipped foreign-realm shadow roots (e.g.
         iframe.contentDocument attachShadow). */
      if (isElement) {
        const sr = getShadowRoot(node);
        if (_isDocumentFragment(sr)) {
          /* Push the deferred sanitise first so it pops after the shadow
             walk we push next, i.e. nested shadow roots are discovered
             before this one is sanitised. */
          stack.push({
            node: null,
            shadow: sr
          }, {
            node: sr,
            shadow: null
          });
        }
      }
    }
  };
  // eslint-disable-next-line complexity
  DOMPurify.sanitize = function (dirty) {
    let cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    /* Make sure we have a string to sanitize.
      DO NOT return early, as this will return the wrong type if
      the user has requested a DOM object rather than a string */
    IS_EMPTY_INPUT = !dirty;
    if (IS_EMPTY_INPUT) {
      dirty = '<!-->';
    }
    /* Stringify, in case dirty is an object */
    if (typeof dirty !== 'string' && !_isNode(dirty)) {
      dirty = stringifyValue(dirty);
      if (typeof dirty !== 'string') {
        throw typeErrorCreate('dirty is not a string, aborting');
      }
    }
    /* Return dirty HTML if DOMPurify cannot run */
    if (!DOMPurify.isSupported) {
      return dirty;
    }
    /* Assign config vars */
    if (SET_CONFIG) {
      /* Persistent setConfig() path: _parseConfig is skipped, so the sets are
       * not re-derived per call. Restore them from the pristine bindings
       * captured at setConfig() time so a previous call's hook clone (mutated
       * below) does not carry over. */
      ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
      ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
    } else {
      _parseConfig(cfg);
    }
    /* Clone the hook-mutable allowlists before the walk whenever an
     * uponSanitize* hook is registered. The hook event exposes ALLOWED_TAGS
     * and ALLOWED_ATTR by reference (as allowedTags / allowedAttributes), so
     * a hook that widens them would otherwise mutate the shared set
     * permanently: across later calls and across every element. Cloning per
     * walk keeps documented in-call widening working while scoping it to the
     * call. A single guard for both config paths - the per-call path rebinds
     * the sets in _parseConfig each call, the persistent path restores them
     * from the captured bindings just above - so the two cannot diverge. */
    if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_TAGS = clone(ALLOWED_TAGS);
    }
    if (hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_ATTR = clone(ALLOWED_ATTR);
    }
    /* Clean up removed elements */
    DOMPurify.removed = [];
    /* Resolve IN_PLACE for this call without mutating persistent config.
       Writing the IN_PLACE closure variable here leaks under setConfig(),
       where _parseConfig is skipped on later calls: a single string call would
       disable in-place mode for every subsequent node call, returning a
       sanitized copy while leaving the caller's node — which in-place callers
       keep using and whose return value they ignore — unsanitized. REPORT-2. */
    const inPlace = IN_PLACE && typeof dirty !== 'string' && _isNode(dirty);
    if (inPlace) {
      /* Declarative-partial-updates / streaming pre-pass: sever every patch
         linkage across the live tree BEFORE the walk, so no patch can fire
         mid-walk and inject into an already-processed region. Runs first, so
         it also covers the forbidden/clobbered roots that throw below. */
      _neutralizePatchLinkage(dirty);
      /* Do some early pre-sanitization to avoid unsafe root nodes.
         Read nodeName through the cached prototype getter — a clobbering
         child named "nodeName" on the form root would otherwise shadow
         the property and let this check skip the root-allowlist
         validation entirely. */
      const nn = getNodeName ? getNodeName(dirty) : dirty.nodeName;
      if (typeof nn === 'string') {
        const tagName = transformCaseFunc(nn);
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          /* Fail closed on a live root: neutralize handlers/children before
             throwing, exactly as the mid-walk abort path does. */
          _neutralizeRoot(dirty);
          throw typeErrorCreate('root node is forbidden and cannot be sanitized in-place');
        }
      }
      /* Pre-flight the root through _isClobbered. The iterator-driven
         removal path can not detach a parent-less root: _forceRemove
         falls through to Element.prototype.remove(), which per spec
         is a no-op on a node with no parent. A clobbered root would
         then survive the main loop with its attributes uninspected,
         because _sanitizeAttributes early-returns on _isClobbered. The
         result would be an attacker-controlled form, complete with any
         event-handler attributes the caller passed in, handed back to
         the application unsanitized. Refuse to sanitize such a root
         the same way we refuse a forbidden tag. GHSA-r47g-fvhr-h676. */
      if (_isClobbered(dirty)) {
        /* Fail closed on a live clobbered root before throwing.
           _neutralizeRoot's reads are clobber-safe (cached getters); the
           form's non-clobbered descendants, e.g. an armed <img>, are scrubbed. */
        _neutralizeRoot(dirty);
        throw typeErrorCreate('root node is clobbered and cannot be sanitized in-place');
      }
      /* Sanitize attached shadow roots before the main iterator runs.
         The iterator does not descend into shadow trees. Same fail-closed
         barrier as the main walk (campaign-3 F2): a custom-element reaction
         inside a shadow root could abort this pre-pass before the walk runs,
         which would otherwise leave the entire live tree unsanitized. */
      try {
        _sanitizeAttachedShadowRoots(dirty);
      } catch (error) {
        _neutralizeRoot(dirty);
        throw error;
      }
    } else if (_isNode(dirty)) {
      /* If dirty is a DOM element, append to an empty document to avoid
         elements being stripped by the parser */
      body = _initDocument('<!---->');
      importedNode = body.ownerDocument.importNode(dirty, true);
      if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === 'BODY') {
        /* Node is already a body, use as is */
        body = importedNode;
      } else if (importedNode.nodeName === 'HTML') {
        body = importedNode;
      } else {
        // eslint-disable-next-line unicorn/prefer-dom-node-append
        body.appendChild(importedNode);
      }
      /* Clonable shadow roots are deep-cloned by importNode(); sanitize
         them before the main iterator runs, since the iterator does not
         descend into shadow trees. The walk routes every read through a
         cached prototype getter so clobbering descendants on a form root
         cannot hide a shadow host from this pass. */
      _sanitizeAttachedShadowRoots(importedNode);
    } else {
      /* Exit directly if we have nothing to do */
      if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT &&
      // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf('<') === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
      }
      /* Initialize the document to work on */
      body = _initDocument(dirty);
      /* Check we have a DOM node from the data */
      if (!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : '';
      }
    }
    /* Remove first element node (ours) if FORCE_BODY is set */
    if (body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }
    /* Get node iterator */
    const walkRoot = inPlace ? dirty : body;
    const nodeIterator = _createNodeIterator(walkRoot);
    /* Now start iterating over the created document.
       The walk runs inside an exception barrier (campaign-3 F2): a re-entrant
       engine/custom-element mutation can detach a node mid-walk so
       `_forceRemove`'s parentless guard throws, aborting the loop. Without the
       barrier the caller's in-place tree would be left half-sanitized with the
       unvisited tail still armed. On any throw we fail closed — strip the
       in-place root bare — then rethrow so the existing throw contract is
       preserved. (String/DOM-copy paths never return the partial body, so the
       propagating throw is already fail-closed there.) */
    try {
      while (currentNode = nodeIterator.nextNode()) {
        /* Sanitize tags and elements */
        _sanitizeElements(currentNode, walkRoot);
        /* Check attributes next */
        _sanitizeAttributes(currentNode);
        /* Shadow DOM detected, sanitize it.
           Realm-safe check (GHSA-hpcv-96wg-7vj8): nodeType-based detection
           instead of instanceof, so foreign-realm <template>.content is
           walked correctly. */
        if (_isDocumentFragment(currentNode.content)) {
          _sanitizeShadowDOM2(currentNode.content);
        }
      }
    } catch (error) {
      if (inPlace) {
        _neutralizeRoot(dirty);
        /* Nodes _forceRemove'd earlier in the aborted walk are already
           detached from the root, so _neutralizeRoot's subtree pass does not
           reach them. Defuse them too, mirroring the success-path loop below. */
        arrayForEach(DOMPurify.removed, entry => {
          if (entry.element) {
            _neutralizeSubtree(entry.element);
          }
        });
      }
      throw error;
    }
    /* If we sanitized `dirty` in-place, return it. */
    if (inPlace) {
      /* Fail-closed completion of the audit-5 F1 fix: every node removed from
         the caller's live tree is detached but may still hold a queued
         resource-event handler that fires in page scope after we return. The
         move-hoist covers only disallowed-tag KEEP_CONTENT removals; strip the
         non-allow-listed attributes off every other removed subtree (clobber,
         mXSS, namespace, comments, KEEP_CONTENT:false, …) so those handlers are
         cancelled before any event can fire. Runs synchronously, pre-return. */
      arrayForEach(DOMPurify.removed, entry => {
        if (entry.element) {
          _neutralizeSubtree(entry.element);
        }
      });
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(dirty);
      }
      return dirty;
    }
    /* Return sanitized string or DOM */
    if (RETURN_DOM) {
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(body);
      }
      if (RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while (body.firstChild) {
          // eslint-disable-next-line unicorn/prefer-dom-node-append
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }
      if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        /*
          AdoptNode() is not used because internal state is not reset
          (e.g. the past names map of a HTMLFormElement), this is safe
          in theory but we would rather not risk another attack vector.
          The state that is cloned by importNode() is explicitly defined
          by the specs.
        */
        returnNode = importNode.call(originalDocument, returnNode, true);
      }
      return returnNode;
    }
    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    /* Serialize doctype if allowed */
    if (WHOLE_DOCUMENT && ALLOWED_TAGS['!doctype'] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = '<!DOCTYPE ' + body.ownerDocument.doctype.name + '>\n' + serializedHTML;
    }
    /* Sanitize final string template-safe */
    if (SAFE_FOR_TEMPLATES) {
      serializedHTML = _stripTemplateExpressions(serializedHTML);
    }
    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
  };
  DOMPurify.setConfig = function () {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
    SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
    SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
  };
  DOMPurify.clearConfig = function () {
    CONFIG = null;
    SET_CONFIG = false;
    SET_CONFIG_ALLOWED_TAGS = null;
    SET_CONFIG_ALLOWED_ATTR = null;
    // Drop any caller-supplied Trusted Types policy so it cannot poison later
    // `RETURN_TRUSTED_TYPE` output. The internal default policy (cached, and
    // never recreated — Trusted Types throws on duplicate names) is restored by
    // the next `_parseConfig`. See GHSA-vxr8-fq34-vvx9.
    trustedTypesPolicy = defaultTrustedTypesPolicy;
    emptyHTML = '';
  };
  DOMPurify.isValidAttribute = function (tag, attr, value) {
    /* Initialize shared config vars if necessary. */
    if (!CONFIG) {
      _parseConfig({});
    }
    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);
    return _isValidAttribute(lcTag, lcName, value);
  };
  DOMPurify.addHook = function (entryPoint, hookFunction) {
    if (typeof hookFunction !== 'function') {
      return;
    }
    /* Reject unknown entry points. Without this, a non-hook key (e.g.
     * '__proto__') indexes off the prototype chain rather than a real
     * hook array, and arrayPush then writes to Object.prototype. Guard
     * with an own-property check against the known hook names. */
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function (entryPoint, hookFunction) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return undefined;
    }
    if (hookFunction !== undefined) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
      return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0];
    }
    return arrayPop(hooks[entryPoint]);
  };
  DOMPurify.removeHooks = function (entryPoint) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function () {
    hooks = _createHooksMap();
  };
  return DOMPurify;
}
var purify = createDOMPurify();

function sanitizeHtml(html) {
  const purify$1 = purify(window);
  const sanitized = purify$1.sanitize(html, {
    FORBID_TAGS: ["style", "script", "link"],
    FORBID_ATTR: ["onerror", "onload", "formaction"]
  });
  return String(sanitized);
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
  get data() {
    return this.plugin.savedData;
  }
  set data(v) {
    this.plugin.savedData = v;
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
  // public accessor for SettingTab
  get savedData() {
    return this.pluginData;
  }
  set savedData(v) {
    this.pluginData = v;
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
    if (!result.blocks) return;
    for (const [name, block] of result.blocks) {
      this.renderBlock(name, block, el);
    }
    window.setTimeout(() => this.resolvePendingRefs(), 50);
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
    svgContainer.innerHTML = sanitizeHtml(
      renderBlockSvg(block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 44)
    );
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);
    const tableContainer = contentWrap.createEl("div", { cls: "verilog-bitfield-table-container" });
    tableContainer.setAttribute("data-theme", this.pluginData.tableTheme || "default");
    tableContainer.innerHTML = sanitizeHtml(renderBlockTable(block));
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
      const svgContainer = entry.element.querySelector(".verilog-bitfield-svg");
      if (svgContainer) {
        svgContainer.innerHTML = sanitizeHtml(renderBlockSvg(entry.block, theme, this.pluginData.svgBoxHeight || 44));
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
      const contentWrap = entry.element.querySelector(".verilog-bitfield-content");
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
      svgWrap.innerHTML = sanitizeHtml(renderBlockSvg(entry.block, this.pluginData.svgTheme || "pastel", this.pluginData.svgBoxHeight || 44));
    } else {
      const tableWrap = tooltip.createEl("div", { cls: "bf-tooltip-table" });
      tableWrap.innerHTML = sanitizeHtml(renderBlockTable(entry.block));
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
exports.default = VerilogBitfieldPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsic3JjL3BhcnNlci50cyIsInNyYy9jb2xvcnMudHMiLCJzcmMvc3ZnUmVuZGVyZXIudHMiLCJzcmMvdGFibGVSZW5kZXJlci50cyIsIm5vZGVfbW9kdWxlcy9kb21wdXJpZnkvZGlzdC9wdXJpZnkuZXMubWpzIiwic3JjL3V0aWxzL3Nhbml0aXplLnRzIiwic3JjL3NldHRpbmdzLnRzIiwic3JjL21haW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBCaXRGaWVsZCwgRmllbGRCbG9jaywgUGFyc2VFcnJvciwgUGFyc2VSZXN1bHQgfSBmcm9tICcuL3R5cGVzJztcclxuXHJcbmludGVyZmFjZSBSYXdMaW5lIHtcclxuICBsaW5lTnVtOiBudW1iZXI7XHJcbiAgaW5kZW50OiBudW1iZXI7XHJcbiAgY29udGVudDogc3RyaW5nO1xyXG59XHJcblxyXG4vKipcclxuICog6Kej5p6QIFZlcmlsb2cg5L2N5Z+f5a6a5LmJXHJcbiAqIOe7n+S4gOivreazle+8muavj+S4quS7o+eggeWdl+eUseS4gOS4quaIluWkmuS4qiBkZWZpbml0aW9uIGJsb2NrIOe7hOaIkFxyXG4gKiDmr4/kuKrlnZfvvJrnrKzkuIDooYwgbmFtZSB3aWR0aCBbZGVzY3JpcHRpb25d77yM5a2Q5a2X5q616YCa6L+H57yp6L+b5bWM5aWXXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoaW5wdXQ6IHN0cmluZyk6IFBhcnNlUmVzdWx0IHtcclxuICBjb25zdCBsaW5lcyA9IGlucHV0LnNwbGl0KCdcXG4nKTtcclxuICBjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xyXG4gIGNvbnN0IGJsb2NrcyA9IG5ldyBNYXA8c3RyaW5nLCBGaWVsZEJsb2NrPigpO1xyXG4gIGNvbnN0IGJsb2NrTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgLy8g6aKE5aSE55CG77ya6L+H5ruk56m66KGM5ZKM5rOo6YeKXHJcbiAgY29uc3QgcmF3TGluZXM6IFJhd0xpbmVbXSA9IFtdO1xyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcclxuICAgIGlmICghbGluZS50cmltKCkgfHwgbGluZS50cmltKCkuc3RhcnRzV2l0aCgnLy8nKSkge1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIHJhd0xpbmVzLnB1c2goe1xyXG4gICAgICBsaW5lTnVtOiBpICsgMSxcclxuICAgICAgaW5kZW50OiBsaW5lLnNlYXJjaCgvXFxTLyksXHJcbiAgICAgIGNvbnRlbnQ6IGxpbmUudHJpbSgpXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGlmIChyYXdMaW5lcy5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcnM6IFt7IGxpbmU6IDAsIG1lc3NhZ2U6ICfovpPlhaXkuLrnqbonIH1dIH07XHJcbiAgfVxyXG5cclxuICAvLyDpgJDooYzop6PmnpDvvIxpbmRlbnQ9MCDnmoTooYzkvZzkuLrlnZflpLRcclxuICBsZXQgaSA9IDA7XHJcbiAgd2hpbGUgKGkgPCByYXdMaW5lcy5sZW5ndGgpIHtcclxuICAgIGNvbnN0IHJsID0gcmF3TGluZXNbaV07XHJcblxyXG4gICAgaWYgKHJsLmluZGVudCAhPT0gMCkge1xyXG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDmhI/lpJbnmoTnvKnov5vooYw6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcclxuICAgICAgaSsrO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtYXRjaCA9IHJsLmNvbnRlbnQubWF0Y2goL14oXFx3KylcXHMrKFxcZCspXFxzKiguKik/JC8pO1xyXG4gICAgaWYgKCFtYXRjaCkge1xyXG4gICAgICBlcnJvcnMucHVzaCh7IGxpbmU6IHJsLmxpbmVOdW0sIG1lc3NhZ2U6IGDml6Dms5Xop6PmnpA6IFwiJHtybC5jb250ZW50fVwiYCB9KTtcclxuICAgICAgaSsrO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBbLCBuYW1lLCB3aWR0aFN0ciwgZGVzY10gPSBtYXRjaDtcclxuXHJcbiAgICBpZiAoYmxvY2tOYW1lcy5oYXMobmFtZSkpIHtcclxuICAgICAgZXJyb3JzLnB1c2goe1xyXG4gICAgICAgIGxpbmU6IHJsLmxpbmVOdW0sXHJcbiAgICAgICAgbWVzc2FnZTogYOmHjeWkjeWumuS5iTogXCIke25hbWV9XCJgLFxyXG4gICAgICAgIHN1Z2dlc3Rpb246ICflkIznrJTorrDlhoXlnZflkI3lv4XpobvllK/kuIAnXHJcbiAgICAgIH0pO1xyXG4gICAgICBpKys7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgYmxvY2tOYW1lcy5hZGQobmFtZSk7XHJcblxyXG4gICAgY29uc3QgYmxvY2s6IEZpZWxkQmxvY2sgPSB7XHJcbiAgICAgIG5hbWUsXHJcbiAgICAgIHdpZHRoOiBwYXJzZUludCh3aWR0aFN0ciwgMTApLFxyXG4gICAgICBkZXNjcmlwdGlvbjogZGVzYz8udHJpbSgpIHx8IHVuZGVmaW5lZCxcclxuICAgICAgY2hpbGRyZW46IFtdXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIOaUtumbhuWtkOWtl+aute+8iOi/nue7reeahOe8qei/m+ihjO+8iVxyXG4gICAgaSsrO1xyXG4gICAgY29uc3QgY2hpbGRyZW5TdGFydCA9IGk7XHJcbiAgICB3aGlsZSAoaSA8IHJhd0xpbmVzLmxlbmd0aCAmJiByYXdMaW5lc1tpXS5pbmRlbnQgPiAwKSB7XHJcbiAgICAgIGkrKztcclxuICAgIH1cclxuICAgIGNvbnN0IGNoaWxkcmVuTGluZXMgPSByYXdMaW5lcy5zbGljZShjaGlsZHJlblN0YXJ0LCBpKTtcclxuXHJcbiAgICBpZiAoY2hpbGRyZW5MaW5lcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHBhcnNlQ2hpbGRyZW4oY2hpbGRyZW5MaW5lcywgYmxvY2suY2hpbGRyZW4sIGVycm9ycywgMCwgbmFtZSk7XHJcbiAgICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhibG9jay5jaGlsZHJlbik7XHJcbiAgICAgIGF1dG9GaWxsUmVzZXJ2ZWQoYmxvY2suY2hpbGRyZW4sIGJsb2NrLndpZHRoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyDpqozor4HkvY3lrr1cclxuICAgIHZhbGlkYXRlQml0V2lkdGhzKGJsb2NrLmNoaWxkcmVuLCBlcnJvcnMpO1xyXG5cclxuICAgIGJsb2Nrcy5zZXQobmFtZSwgYmxvY2spO1xyXG4gIH1cclxuXHJcbiAgaWYgKGJsb2Nrcy5zaXplID09PSAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzOiBbeyBsaW5lOiAwLCBtZXNzYWdlOiAn5pyq5om+5Yiw5pyJ5pWI55qE5a6a5LmJ5Z2XJyB9XSB9O1xyXG4gIH1cclxuXHJcbiAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzIH07XHJcbiAgfVxyXG5cclxuICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBibG9ja3MgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOino+aekOWtkOWtl+auteWIl+ihqFxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VDaGlsZHJlbihcclxuICBsaW5lczogUmF3TGluZVtdLFxyXG4gIGNoaWxkcmVuOiBCaXRGaWVsZFtdLFxyXG4gIGVycm9yczogUGFyc2VFcnJvcltdLFxyXG4gIGJhc2VJbmRlbnQ6IG51bWJlcixcclxuICBfcGFyZW50TmFtZTogc3RyaW5nXHJcbik6IHZvaWQge1xyXG4gIGNvbnN0IHN0YWNrOiB7IGZpZWxkOiBCaXRGaWVsZDsgaW5kZW50OiBudW1iZXIgfVtdID0gW107XHJcblxyXG4gIGZvciAoY29uc3Qgcmwgb2YgbGluZXMpIHtcclxuICAgIGNvbnN0IG1hdGNoID0gcmwuY29udGVudC5tYXRjaCgvXihAP1xcdyspXFxzKyhcXGQrKVxccyooLiopPyQvKTtcclxuICAgIGlmICghbWF0Y2gpIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5peg5rOV6Kej5p6QOiBcIiR7cmwuY29udGVudH1cImAgfSk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IFssIG5hbWUsIHdpZHRoU3RyLCBkZXNjXSA9IG1hdGNoO1xyXG4gICAgY29uc3Qgd2lkdGggPSBwYXJzZUludCh3aWR0aFN0ciwgMTApO1xyXG4gICAgY29uc3QgaXNSZWZlcmVuY2UgPSBuYW1lLnN0YXJ0c1dpdGgoJ0AnKTtcclxuICAgIGNvbnN0IHJlZk5hbWUgPSBpc1JlZmVyZW5jZSA/IG5hbWUuc2xpY2UoMSkgOiBuYW1lO1xyXG5cclxuICAgIC8vIOW1jOWll+Wxgue6p+ajgOafpVxyXG4gICAgY29uc3QgZGVwdGggPSBNYXRoLmZsb29yKChybC5pbmRlbnQgLSBiYXNlSW5kZW50KSAvIDIpICsgMTtcclxuICAgIGlmIChkZXB0aCA+IDUpIHtcclxuICAgICAgZXJyb3JzLnB1c2goeyBsaW5lOiBybC5saW5lTnVtLCBtZXNzYWdlOiBg5bWM5aWX5bGC57qn6L+H5rexICgke2RlcHRofSDlsYIp77yM5pyA5aSaIDUg5bGCYCB9KTtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZmllbGQ6IEJpdEZpZWxkID0ge1xyXG4gICAgICBuYW1lOiByZWZOYW1lLFxyXG4gICAgICB3aWR0aCxcclxuICAgICAgbXNiOiAwLFxyXG4gICAgICBsc2I6IDAsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBkZXNjPy50cmltKCkgfHwgdW5kZWZpbmVkLFxyXG4gICAgICBpc1Jlc2VydmVkOiBuYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdyZXNlcnZlZCcsXHJcbiAgICAgIGlzUmVmZXJlbmNlLFxyXG4gICAgICByZWZOYW1lOiBpc1JlZmVyZW5jZSA/IHJlZk5hbWUgOiB1bmRlZmluZWQsXHJcbiAgICAgIGNoaWxkcmVuOiBbXVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyDmib7niLblrZfmrrXvvJrku47moIjkuK3mib7nvKnov5vmr5TlvZPliY3lsI/nmoTmnIDlkI7kuIDkuKpcclxuICAgIGxldCBwYXJlbnQ6IEJpdEZpZWxkIHwgbnVsbCA9IG51bGw7XHJcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zdCB0b3AgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcclxuICAgICAgaWYgKHRvcC5pbmRlbnQgPCBybC5pbmRlbnQpIHtcclxuICAgICAgICBwYXJlbnQgPSB0b3AuZmllbGQ7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICAgc3RhY2sucG9wKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHBhcmVudCkge1xyXG4gICAgICBpZiAoIXBhcmVudC5jaGlsZHJlbikgcGFyZW50LmNoaWxkcmVuID0gW107XHJcbiAgICAgIHBhcmVudC5jaGlsZHJlbi5wdXNoKGZpZWxkKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNoaWxkcmVuLnB1c2goZmllbGQpO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YWNrLnB1c2goeyBmaWVsZCwgaW5kZW50OiBybC5pbmRlbnQgfSk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICog6K6h566XIGJpdCDojIPlm7RcclxuICog6Z2g5YmN5a6a5LmJ55qE5pivIExTQu+8jOmdoOWQjuWumuS5ieeahOaYryBNU0JcclxuICovXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHM6IEJpdEZpZWxkW10pOiB2b2lkIHtcclxuICBsZXQgY3VycmVudExzYiA9IDA7XHJcbiAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcclxuICAgIGZpZWxkLmxzYiA9IGN1cnJlbnRMc2I7XHJcbiAgICBmaWVsZC5tc2IgPSBjdXJyZW50THNiICsgZmllbGQud2lkdGggLSAxO1xyXG4gICAgY3VycmVudExzYiA9IGZpZWxkLm1zYiArIDE7XHJcbiAgICBpZiAoIWZpZWxkLmlzUmVmZXJlbmNlICYmIGZpZWxkLmNoaWxkcmVuICYmIGZpZWxkLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgICAgY2FsY3VsYXRlQml0UmFuZ2VzKGZpZWxkLmNoaWxkcmVuKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDlvZPlrZDlrZfmrrXmgLvkvY3lrr3kuI3lpJ/ml7bvvIzlnKggTVNCIOerr+iHquWKqOihpSByZXNlcnZlZFxyXG4gKi9cclxuZnVuY3Rpb24gYXV0b0ZpbGxSZXNlcnZlZChmaWVsZHM6IEJpdEZpZWxkW10sIHBhcmVudFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcclxuICBjb25zdCB0b3RhbENoaWxkV2lkdGggPSBmaWVsZHMucmVkdWNlKChzdW0sIGYpID0+IHN1bSArIGYud2lkdGgsIDApO1xyXG4gIGNvbnN0IHJlbWFpbmluZyA9IHBhcmVudFdpZHRoIC0gdG90YWxDaGlsZFdpZHRoO1xyXG4gIGlmIChyZW1haW5pbmcgPiAwKSB7XHJcbiAgICBjb25zdCByZXNlcnZlZDogQml0RmllbGQgPSB7XHJcbiAgICAgIG5hbWU6ICdyZXNlcnZlZCcsXHJcbiAgICAgIHdpZHRoOiByZW1haW5pbmcsXHJcbiAgICAgIG1zYjogMCxcclxuICAgICAgbHNiOiAwLFxyXG4gICAgICBpc1Jlc2VydmVkOiB0cnVlLFxyXG4gICAgICBpc1JlZmVyZW5jZTogZmFsc2UsXHJcbiAgICAgIGNoaWxkcmVuOiBbXVxyXG4gICAgfTtcclxuICAgIGZpZWxkcy5wdXNoKHJlc2VydmVkKTtcclxuICAgIGNhbGN1bGF0ZUJpdFJhbmdlcyhmaWVsZHMpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIOmqjOivgeS9jeWuvVxyXG4gKi9cclxuZnVuY3Rpb24gdmFsaWRhdGVCaXRXaWR0aHMoZmllbGRzOiBCaXRGaWVsZFtdLCBlcnJvcnM6IFBhcnNlRXJyb3JbXSk6IHZvaWQge1xyXG4gIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XHJcbiAgICBjb25zdCBjaGlsZHJlbiA9IGZpZWxkLmNoaWxkcmVuIHx8IFtdO1xyXG4gICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgY2hpbGRyZW5XaWR0aCA9IGNoaWxkcmVuLnJlZHVjZSgoc3VtLCBjaGlsZCkgPT4gc3VtICsgY2hpbGQud2lkdGgsIDApO1xyXG4gICAgICBpZiAoY2hpbGRyZW5XaWR0aCA+IGZpZWxkLndpZHRoKSB7XHJcbiAgICAgICAgZXJyb3JzLnB1c2goe1xyXG4gICAgICAgICAgbGluZTogMCxcclxuICAgICAgICAgIG1lc3NhZ2U6IGDlrZfmrrUgXCIke2ZpZWxkLm5hbWV9XCIg5a2Q5a2X5q615L2N5a696LaF5Ye6YCxcclxuICAgICAgICAgIHN1Z2dlc3Rpb246IGDniLblrZfmrrU6ICR7ZmllbGQud2lkdGh9LWJpdCwg5a2Q5a2X5q615oC75ZKMOiAke2NoaWxkcmVuV2lkdGh9LWJpdCwg5Ymp5L2Z56m66Ze0OiAke2ZpZWxkLndpZHRoIC0gY2hpbGRyZW5XaWR0aH0tYml0YFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHZhbGlkYXRlQml0V2lkdGhzKGNoaWxkcmVuLCBlcnJvcnMpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCIvKipcclxuICog6aKc6Imy5pa55qGIXHJcbiAqL1xyXG5cclxuZXhwb3J0IHR5cGUgU3ZnVGhlbWUgPSAncGFzdGVsJyB8ICd2aXZpZCcgfCAnbW9ubyc7XHJcblxyXG4vLyDkuLvoibLvvIjpobblsYLlrZfmrrXvvInigJQg5p+U5ZKM5rWF6ImyXHJcbmNvbnN0IFBBU1RFTF9DT0xPUlMgPSBbXHJcbiAgJyNCM0Q0RjAnLCAvLyDmtYXok51cclxuICAnI0I4RTBCOCcsIC8vIOa1hee7v1xyXG4gICcjRjVENkE4JywgLy8g5rWF5qmZXHJcbiAgJyNENEI4RTgnLCAvLyDmtYXntKtcclxuICAnI0E4RTBENicsIC8vIOa1hemdklxyXG4gICcjRjBCOEI4JywgLy8g5rWF57qiXHJcbl07XHJcblxyXG4vLyDpspzoibPoibJcclxuY29uc3QgVklWSURfQ09MT1JTID0gW1xyXG4gICcjNUI5QkQ1JywgLy8g6JOdXHJcbiAgJyM3MEFENDcnLCAvLyDnu79cclxuICAnI0VEN0QzMScsIC8vIOapmVxyXG4gICcjOUI1OUI2JywgLy8g57SrXHJcbiAgJyMxQUJDOUMnLCAvLyDpnZJcclxuICAnI0U3NEMzQycsIC8vIOe6olxyXG5dO1xyXG5cclxuLy8g54Gw5bqm6ImyXHJcbmNvbnN0IE1PTk9fQ09MT1JTID0gW1xyXG4gICcjQzBDMEMwJywgLy8g5rWF54GwXHJcbiAgJyNBOEE4QTgnLCAvLyDkuK3ngbBcclxuICAnI0QwRDBEMCcsIC8vIOS6rueBsFxyXG4gICcjQjBCMEIwJywgLy8g6ZO254GwXHJcbiAgJyNDOEM4QzgnLCAvLyDmt6HngbBcclxuICAnI0I4QjhCOCcsIC8vIOaal+mTtlxyXG5dO1xyXG5cclxuY29uc3QgVEhFTUVfTUFQOiBSZWNvcmQ8U3ZnVGhlbWUsIHN0cmluZ1tdPiA9IHtcclxuICBwYXN0ZWw6IFBBU1RFTF9DT0xPUlMsXHJcbiAgdml2aWQ6IFZJVklEX0NPTE9SUyxcclxuICBtb25vOiBNT05PX0NPTE9SUyxcclxufTtcclxuXHJcbi8vIOS/neeVmeiJslxyXG5jb25zdCBSRVNFUlZFRF9DT0xPUiA9ICcjRThFOEU4JztcclxuXHJcbi8qKlxyXG4gKiDojrflj5blrZfmrrXpopzoibJcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWVsZENvbG9yKGluZGV4OiBudW1iZXIsIGlzUmVzZXJ2ZWQ6IGJvb2xlYW4sIGRlcHRoOiBudW1iZXIgPSAwLCB0aGVtZTogU3ZnVGhlbWUgPSAncGFzdGVsJyk6IHN0cmluZyB7XHJcbiAgaWYgKGlzUmVzZXJ2ZWQpIHtcclxuICAgIHJldHVybiBSRVNFUlZFRF9DT0xPUjtcclxuICB9XHJcblxyXG4gIGNvbnN0IHBhbGV0dGUgPSBUSEVNRV9NQVBbdGhlbWVdIHx8IFBBU1RFTF9DT0xPUlM7XHJcbiAgY29uc3QgYmFzZUNvbG9yID0gcGFsZXR0ZVtpbmRleCAlIHBhbGV0dGUubGVuZ3RoXTtcclxuXHJcbiAgaWYgKGRlcHRoID09PSAwKSB7XHJcbiAgICByZXR1cm4gYmFzZUNvbG9yO1xyXG4gIH1cclxuXHJcbiAgLy8g5a2Q5a2X5q6177ya5Z+65LqO54i26Imy6LCD5pW05Lqu5bqmXHJcbiAgcmV0dXJuIGFkanVzdEJyaWdodG5lc3MoYmFzZUNvbG9yLCBkZXB0aCAqIDEwKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOiwg+aVtOminOiJsuS6ruW6plxyXG4gKi9cclxuZnVuY3Rpb24gYWRqdXN0QnJpZ2h0bmVzcyhoZXg6IHN0cmluZywgcGVyY2VudDogbnVtYmVyKTogc3RyaW5nIHtcclxuICBoZXggPSBoZXgucmVwbGFjZSgnIycsICcnKTtcclxuXHJcbiAgY29uc3QgciA9IHBhcnNlSW50KGhleC5zdWJzdHJpbmcoMCwgMiksIDE2KTtcclxuICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnN1YnN0cmluZygyLCA0KSwgMTYpO1xyXG4gIGNvbnN0IGIgPSBwYXJzZUludChoZXguc3Vic3RyaW5nKDQsIDYpLCAxNik7XHJcblxyXG4gIGNvbnN0IGFkanVzdCA9IChjaGFubmVsOiBudW1iZXIpID0+IHtcclxuICAgIGNvbnN0IGFkanVzdGVkID0gTWF0aC5yb3VuZChjaGFubmVsICsgKDI1NSAtIGNoYW5uZWwpICogKHBlcmNlbnQgLyAxMDApKTtcclxuICAgIHJldHVybiBNYXRoLm1pbigyNTUsIE1hdGgubWF4KDAsIGFkanVzdGVkKSk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgbmV3UiA9IGFkanVzdChyKTtcclxuICBjb25zdCBuZXdHID0gYWRqdXN0KGcpO1xyXG4gIGNvbnN0IG5ld0IgPSBhZGp1c3QoYik7XHJcblxyXG4gIGNvbnN0IHRvSGV4ID0gKG46IG51bWJlcikgPT4gbi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKTtcclxuICByZXR1cm4gYCMke3RvSGV4KG5ld1IpfSR7dG9IZXgobmV3Ryl9JHt0b0hleChuZXdCKX1gO1xyXG59XHJcbiIsImltcG9ydCB0eXBlIHsgQml0RmllbGQsIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB0eXBlIHsgU3ZnVGhlbWUgfSBmcm9tICcuL2NvbG9ycyc7XG5pbXBvcnQgeyBnZXRGaWVsZENvbG9yIH0gZnJvbSAnLi9jb2xvcnMnO1xuXG4vKipcbiAqIFNWRyDmuLLmn5PphY3nva5cbiAqL1xuaW50ZXJmYWNlIFJlbmRlckNvbmZpZyB7XG4gIC8qKiDmgLvkvY3lrr0gKi9cbiAgdG90YWxXaWR0aDogbnVtYmVyO1xuICAvKiog5piv5ZCm57q15ZCR5o6S5YiXICovXG4gIGlzVmVydGljYWw6IGJvb2xlYW47XG4gIC8qKiDlrZfmrrXmoYbpq5jluqYgKi9cbiAgYm94SGVpZ2h0OiBudW1iZXI7XG4gIC8qKiDlrZfkvZPlpKflsI8gKi9cbiAgZm9udFNpemU6IG51bWJlcjtcbiAgLyoqIFNWRyDkuLvpopggKi9cbiAgdGhlbWU6IFN2Z1RoZW1lO1xufVxuXG4vKipcbiAqIOiuoeeul+Wtl+auteagh+etvuaJgOmcgOeahOacgOWwj+WuveW6pu+8iOWDj+e0oO+8iVxuICovXG4vKipcbiAqIOWIpOaWreaYr+WQpuW6lOS9v+eUqOe6teWQkeW4g+WxgFxuICovXG5mdW5jdGlvbiBzaG91bGRVc2VWZXJ0aWNhbChmaWVsZHM6IEJpdEZpZWxkW10sIHRvdGFsV2lkdGg6IG51bWJlcik6IGJvb2xlYW4ge1xuICBjb25zdCBzdmdXaWR0aCA9IDEwMDA7XG4gIGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gc3ZnV2lkdGggLSAxMjA7XG4gIGNvbnN0IGZvbnRTaXplID0gMjI7XG5cbiAgZm9yIChjb25zdCBmaWVsZCBvZiBmaWVsZHMpIHtcbiAgICBjb25zdCBmaWVsZE5hbWUgPSBmaWVsZC5pc1Jlc2VydmVkID8gJ3Jlc2VydmVkJyA6IChmaWVsZC5pc1JlZmVyZW5jZSA/IGBAJHtmaWVsZC5yZWZOYW1lfWAgOiBmaWVsZC5uYW1lKTtcbiAgICBjb25zdCBzZWxmSGlnaCA9IGZpZWxkLndpZHRoIC0gMTtcbiAgICBjb25zdCBzZWxmTGFiZWwgPSBzZWxmSGlnaCA9PT0gMCA/IGZpZWxkTmFtZSA6IGAke2ZpZWxkTmFtZX1bJHtzZWxmSGlnaH06MF1gO1xuICAgIGNvbnN0IHdpZHRoUmF0aW8gPSBmaWVsZC53aWR0aCAvIHRvdGFsV2lkdGg7XG4gICAgY29uc3QgYm94V2lkdGggPSB3aWR0aFJhdGlvICogYXZhaWxhYmxlV2lkdGg7XG4gICAgLy8gbW9ub3NwYWNlIOWtl+espuWuvSDiiYggZm9udFNpemUgKiAwLjbvvIzpnIDpop3lpJYgKzE2IOWuuee6s+W3puWPs+epuueZvVxuICAgIGNvbnN0IG1pbldpZHRoID0gc2VsZkxhYmVsLmxlbmd0aCAqIGZvbnRTaXplICogMC42ICsgMTYgKyA4O1xuICAgIGlmIChib3hXaWR0aCA8IG1pbldpZHRoKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICog5riy5p+T5Z2X55qEIFNWRyDkvY3ln5/lm75cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckJsb2NrU3ZnKGJsb2NrOiBGaWVsZEJsb2NrLCB0aGVtZTogU3ZnVGhlbWUgPSAncGFzdGVsJywgYm94SGVpZ2h0OiBudW1iZXIgPSA0NCk6IHN0cmluZyB7XG4gIGNvbnN0IGNvbmZpZzogUmVuZGVyQ29uZmlnID0ge1xuICAgIHRvdGFsV2lkdGg6IGJsb2NrLndpZHRoLFxuICAgIGlzVmVydGljYWw6IHNob3VsZFVzZVZlcnRpY2FsKGJsb2NrLmNoaWxkcmVuLCBibG9jay53aWR0aCksXG4gICAgYm94SGVpZ2h0LFxuICAgIGZvbnRTaXplOiAyMixcbiAgICB0aGVtZSxcbiAgfTtcblxuICBpZiAoY29uZmlnLmlzVmVydGljYWwpIHtcbiAgICByZXR1cm4gcmVuZGVyVmVydGljYWwoYmxvY2suY2hpbGRyZW4sIGNvbmZpZyk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHJlbmRlckhvcml6b250YWwoYmxvY2suY2hpbGRyZW4sIGNvbmZpZyk7XG4gIH1cbn1cblxuLyoqXG4gKiDmqKrlkJHmuLLmn5NcbiAqL1xuZnVuY3Rpb24gcmVuZGVySG9yaXpvbnRhbChmaWVsZHM6IEJpdEZpZWxkW10sIGNvbmZpZzogUmVuZGVyQ29uZmlnKTogc3RyaW5nIHtcbiAgY29uc3Qgc3ZnV2lkdGggPSAxMDAwO1xuICBjb25zdCBzdmdIZWlnaHQgPSBjb25maWcuYm94SGVpZ2h0ICsgNjA7XG4gIGNvbnN0IHN0YXJ0WCA9IDYwO1xuICBjb25zdCBzdGFydFkgPSAyNTtcbiAgY29uc3QgYXZhaWxhYmxlV2lkdGggPSBzdmdXaWR0aCAtIDEyMDtcblxuICBsZXQgc3ZnID0gYDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHZpZXdCb3g9XCIwIDAgJHtzdmdXaWR0aH0gJHtzdmdIZWlnaHR9XCIgd2lkdGg9XCIxMDAlXCI+YDtcblxuICBsZXQgY3VycmVudFggPSBzdGFydFg7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZmllbGQgPSBmaWVsZHNbaV07XG4gICAgY29uc3Qgd2lkdGhSYXRpbyA9IGZpZWxkLndpZHRoIC8gY29uZmlnLnRvdGFsV2lkdGg7XG4gICAgY29uc3QgYm94V2lkdGggPSB3aWR0aFJhdGlvICogYXZhaWxhYmxlV2lkdGg7XG4gICAgY29uc3QgY29sb3IgPSBnZXRGaWVsZENvbG9yKGksIGZpZWxkLmlzUmVzZXJ2ZWQsIDAsIGNvbmZpZy50aGVtZSk7XG4gICAgc3ZnICs9IHJlbmRlckZpZWxkQm94KGZpZWxkLCBjdXJyZW50WCwgc3RhcnRZLCBib3hXaWR0aCwgY29uZmlnLmJveEhlaWdodCwgY29sb3IsIGNvbmZpZy5mb250U2l6ZSwgJ2hvcml6b250YWwnKTtcbiAgICBjdXJyZW50WCArPSBib3hXaWR0aDtcbiAgfVxuXG4gIC8vIExTQiDihpIgTVNCIOaWueWQkeeureWktFxuICBjb25zdCBhcnJvd1kgPSBzdGFydFkgKyBjb25maWcuYm94SGVpZ2h0ICsgMjI7XG4gIGNvbnN0IGZzID0gY29uZmlnLmZvbnRTaXplICogMC44NTtcbiAgY29uc3QgZmllbGRMZWZ0ID0gc3RhcnRYO1xuICBjb25zdCBmaWVsZFJpZ2h0ID0gc3RhcnRYICsgYXZhaWxhYmxlV2lkdGg7XG4gIC8vIExTQiDlj7Plr7npvZDliLDlrZfmrrXmoYblt6bovrnnvJhcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHtmaWVsZExlZnR9XCIgeT1cIiR7YXJyb3dZICsgNX1cIiBmb250LXNpemU9XCIke2ZzfVwiIHRleHQtYW5jaG9yPVwiZW5kXCIgZmlsbD1cIiM5OTlcIj5MU0I8L3RleHQ+YDtcbiAgLy8g566t5aS05q+U5a2X5q615qGG56qE5LiA54K577yM5Lik56uv55WZ56m6XG4gIGNvbnN0IGFycm93UGFkID0gMTA7XG4gIHN2ZyArPSBgPGxpbmUgeDE9XCIke2ZpZWxkTGVmdCArIGFycm93UGFkfVwiIHkxPVwiJHthcnJvd1l9XCIgeDI9XCIke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZCAtIDh9XCIgeTI9XCIke2Fycm93WX1cIiBzdHJva2U9XCIjOTk5XCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIvPmA7XG4gIHN2ZyArPSBgPHBvbHlnb24gcG9pbnRzPVwiJHtmaWVsZFJpZ2h0IC0gYXJyb3dQYWR9LCR7YXJyb3dZfSAke2ZpZWxkUmlnaHQgLSBhcnJvd1BhZCAtIDEwfSwke2Fycm93WSAtIDV9ICR7ZmllbGRSaWdodCAtIGFycm93UGFkIC0gMTB9LCR7YXJyb3dZICsgNX1cIiBmaWxsPVwiIzk5OVwiLz5gO1xuICAvLyBNU0Ig5bem5a+56b2Q5Yiw5a2X5q615qGG5Y+z6L6557yYXG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7ZmllbGRSaWdodH1cIiB5PVwiJHthcnJvd1kgKyA1fVwiIGZvbnQtc2l6ZT1cIiR7ZnN9XCIgZmlsbD1cIiM5OTlcIj5NU0I8L3RleHQ+YDtcblxuICBzdmcgKz0gJzwvc3ZnPic7XG4gIHJldHVybiBzdmc7XG59XG5cbi8qKlxuICog57q15ZCR5riy5p+T77yIdmlld0JveCDlrr3luqbkuI7mqKrlkJHkuIDoh7TvvIzkv53mjIHlrZfkvZPop4bop4nlpKflsI/kuIDoh7TvvIlcbiAqL1xuZnVuY3Rpb24gcmVuZGVyVmVydGljYWwoZmllbGRzOiBCaXRGaWVsZFtdLCBjb25maWc6IFJlbmRlckNvbmZpZyk6IHN0cmluZyB7XG4gIGNvbnN0IHN2Z1dpZHRoID0gMTAwMDtcbiAgY29uc3Qgcm93SGVpZ2h0ID0gY29uZmlnLmJveEhlaWdodDtcbiAgY29uc3Qgc3RhcnRYID0gNjA7XG4gIGNvbnN0IHN0YXJ0WSA9IDIyO1xuICBjb25zdCBib3hXaWR0aCA9IHN2Z1dpZHRoIC0gMTYwO1xuICBjb25zdCBzdmdIZWlnaHQgPSBzdGFydFkgKyBmaWVsZHMubGVuZ3RoICogcm93SGVpZ2h0ICsgMjU7XG5cbiAgbGV0IHN2ZyA9IGA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwICR7c3ZnV2lkdGh9ICR7c3ZnSGVpZ2h0fVwiIHdpZHRoPVwiMTAwJVwiPmA7XG5cbiAgbGV0IGN1cnJlbnRZID0gc3RhcnRZO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGZpZWxkID0gZmllbGRzW2ldO1xuICAgIGNvbnN0IGNvbG9yID0gZ2V0RmllbGRDb2xvcihpLCBmaWVsZC5pc1Jlc2VydmVkLCAwLCBjb25maWcudGhlbWUpO1xuICAgIHN2ZyArPSByZW5kZXJGaWVsZEJveChmaWVsZCwgc3RhcnRYLCBjdXJyZW50WSwgYm94V2lkdGgsIHJvd0hlaWdodCwgY29sb3IsIGNvbmZpZy5mb250U2l6ZSk7XG4gICAgY3VycmVudFkgKz0gcm93SGVpZ2h0O1xuICB9XG5cbiAgLy8gTFNCIOKGkiBNU0Ig5pa55ZCR566t5aS077yI57q15ZCR77ya5LuO5LiK5Yiw5LiL77yM5pS+5Zyo5bem5L6n5qGG5aSW77yJXG4gIGNvbnN0IGFycm93WCA9IHN0YXJ0WCAtIDI0O1xuICBjb25zdCBhcnJvd1RvcCA9IHN0YXJ0WTtcbiAgY29uc3QgYXJyb3dCb3R0b20gPSBzdGFydFkgKyBmaWVsZHMubGVuZ3RoICogcm93SGVpZ2h0O1xuICBzdmcgKz0gYDxsaW5lIHgxPVwiJHthcnJvd1h9XCIgeTE9XCIke2Fycm93VG9wICsgOH1cIiB4Mj1cIiR7YXJyb3dYfVwiIHkyPVwiJHthcnJvd0JvdHRvbSAtIDh9XCIgc3Ryb2tlPVwiIzk5OVwiIHN0cm9rZS13aWR0aD1cIjEuNVwiLz5gO1xuICBzdmcgKz0gYDxwb2x5Z29uIHBvaW50cz1cIiR7YXJyb3dYfSwke2Fycm93Qm90dG9tfSAke2Fycm93WCAtIDV9LCR7YXJyb3dCb3R0b20gLSAxMH0gJHthcnJvd1ggKyA1fSwke2Fycm93Qm90dG9tIC0gMTB9XCIgZmlsbD1cIiM5OTlcIi8+YDtcbiAgc3ZnICs9IGA8dGV4dCB4PVwiJHthcnJvd1h9XCIgeT1cIiR7YXJyb3dUb3AgLSA0fVwiIGZvbnQtc2l6ZT1cIiR7Y29uZmlnLmZvbnRTaXplICogMC44NX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGZpbGw9XCIjOTk5XCI+TFNCPC90ZXh0PmA7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7YXJyb3dYfVwiIHk9XCIke2Fycm93Qm90dG9tICsgMTh9XCIgZm9udC1zaXplPVwiJHtjb25maWcuZm9udFNpemUgKiAwLjg1fVwiIHRleHQtYW5jaG9yPVwibWlkZGxlXCIgZmlsbD1cIiM5OTlcIj5NU0I8L3RleHQ+YDtcblxuICBzdmcgKz0gJzwvc3ZnPic7XG4gIHJldHVybiBzdmc7XG59XG5cbi8qKlxuICog5riy5p+T5a2X5q615qGGXG4gKiBAcGFyYW0gbGF5b3V0RGlyZWN0aW9uIOW4g+WxgOaWueWQke+8jOeUqOS6juWGs+WumueItuWtl+autee0ouW8leagh+azqOS9jee9rlxuICovXG5mdW5jdGlvbiByZW5kZXJGaWVsZEJveChcbiAgZmllbGQ6IEJpdEZpZWxkLFxuICB4OiBudW1iZXIsXG4gIHk6IG51bWJlcixcbiAgd2lkdGg6IG51bWJlcixcbiAgaGVpZ2h0OiBudW1iZXIsXG4gIGNvbG9yOiBzdHJpbmcsXG4gIGZvbnRTaXplOiBudW1iZXIsXG4gIGxheW91dERpcmVjdGlvbjogJ2hvcml6b250YWwnIHwgJ3ZlcnRpY2FsJyA9ICd2ZXJ0aWNhbCdcbik6IHN0cmluZyB7XG4gIGxldCBzdmcgPSAnJztcbiAgY29uc3QgaXNSZWYgPSBmaWVsZC5pc1JlZmVyZW5jZTtcbiAgY29uc3QgaXNSc3YgPSBmaWVsZC5pc1Jlc2VydmVkO1xuICBjb25zdCBmaWVsZE5hbWUgPSBpc1JzdiA/ICdyZXNlcnZlZCcgOiAoaXNSZWYgPyBgQCR7ZmllbGQucmVmTmFtZX1gIDogZmllbGQubmFtZSk7XG5cbiAgY29uc3Qgc3Ryb2tlQ29sb3IgPSBpc1JlZiA/ICcjNEE5MEQ5JyA6ICcjZmZmJztcbiAgc3ZnICs9IGA8cmVjdCB4PVwiJHt4fVwiIHk9XCIke3l9XCIgd2lkdGg9XCIke3dpZHRofVwiIGhlaWdodD1cIiR7aGVpZ2h0fVwiIGZpbGw9XCIke2NvbG9yfVwiIHN0cm9rZT1cIiR7c3Ryb2tlQ29sb3J9XCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHJ4PVwiNFwiIHJ5PVwiNFwiIGRhdGEtZmllbGQ9XCIke2ZpZWxkTmFtZX1cIiR7aXNSZWYgPyBgIGRhdGEtcmVmPVwiJHtmaWVsZC5yZWZOYW1lfVwiYCA6ICcnfSBzdHlsZT1cImN1cnNvcjoke2lzUmVmID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnfVwiLz5gO1xuXG4gIC8vIOahhuWGhe+8muWtl+auteiHqui6q+e0ouW8lSBbd2lkdGgtMTowXe+8jOWNlSBiaXQg5a2X5q6155yB55Wl57Si5byVXG4gIGNvbnN0IHNlbGZIaWdoID0gZmllbGQud2lkdGggLSAxO1xuICBjb25zdCBzZWxmTGFiZWwgPSBzZWxmSGlnaCA9PT0gMCA/IGZpZWxkTmFtZSA6IGAke2ZpZWxkTmFtZX1bJHtzZWxmSGlnaH06MF1gO1xuICBjb25zdCB0ZXh0WCA9IHggKyB3aWR0aCAvIDI7XG4gIGNvbnN0IHRleHRZID0geSArIGhlaWdodCAvIDI7XG4gIGNvbnN0IHRleHRXaWR0aCA9IHdpZHRoIC0gMTY7XG4gIGNvbnN0IG1heENoYXJzID0gTWF0aC5mbG9vcih0ZXh0V2lkdGggLyAoZm9udFNpemUgKiAwLjYpKTtcblxuICBsZXQgZGlzcGxheVRleHQgPSBzZWxmTGFiZWw7XG4gIGlmIChzZWxmTGFiZWwubGVuZ3RoID4gbWF4Q2hhcnMgJiYgbWF4Q2hhcnMgPiAzKSB7XG4gICAgZGlzcGxheVRleHQgPSBzZWxmTGFiZWwuc3Vic3RyaW5nKDAsIG1heENoYXJzIC0gMikgKyAnLi4nO1xuICB9XG5cbiAgY29uc3QgdGV4dERlY29yYXRpb24gPSAnJztcbiAgY29uc3QgZmlsbENvbG9yID0gaXNSc3YgPyAnIzg4OCcgOiAnIzMzMyc7XG4gIHN2ZyArPSBgPHRleHQgeD1cIiR7dGV4dFh9XCIgeT1cIiR7dGV4dFl9XCIgZm9udC1zaXplPVwiJHtmb250U2l6ZX1cIiB0ZXh0LWFuY2hvcj1cIm1pZGRsZVwiIGRvbWluYW50LWJhc2VsaW5lPVwiY2VudHJhbFwiIGZpbGw9XCIke2ZpbGxDb2xvcn1cIiBmb250LWZhbWlseT1cIm1vbm9zcGFjZVwiJHt0ZXh0RGVjb3JhdGlvbn0gZGF0YS1maWVsZD1cIiR7ZmllbGROYW1lfVwiJHtpc1JlZiA/IGAgZGF0YS1yZWY9XCIke2ZpZWxkLnJlZk5hbWV9XCJgIDogJyd9IHN0eWxlPVwiY3Vyc29yOiR7aXNSZWYgPyAncG9pbnRlcicgOiAnZGVmYXVsdCd9XCI+JHtkaXNwbGF5VGV4dH08L3RleHQ+YDtcblxuICAvLyDmoYblpJbvvJrniLblrZfmrrXntKLlvJUgW21zYjpsc2Jd77yM54Gw6Imy5bCP5a2XXG4gIGNvbnN0IHBhcmVudEhpZ2ggPSBmaWVsZC5tc2I7XG4gIGNvbnN0IHBhcmVudExvdyA9IGZpZWxkLmxzYjtcbiAgY29uc3QgcGFyZW50TGFiZWwgPSBwYXJlbnRIaWdoID09PSBwYXJlbnRMb3cgPyBgWyR7cGFyZW50SGlnaH1dYCA6IGBbJHtwYXJlbnRIaWdofToke3BhcmVudExvd31dYDtcbiAgY29uc3QgYW5ub3RhdGlvbkZvbnRTaXplID0gZm9udFNpemUgKiAwLjc7XG5cbiAgaWYgKGxheW91dERpcmVjdGlvbiA9PT0gJ3ZlcnRpY2FsJykge1xuICAgIC8vIOe6teWQke+8muagh+azqOWcqOWPs+S+p++8jOW3puWvuem9kO+8iOW3puS+p+epuumXtOS4jei2s+aXtiAzIOS9jeaVsOWtl+agh+azqOS4jeS8muiiqyB2aWV3Qm94IOijgeWJqu+8iVxuICAgIGNvbnN0IGFubm90WCA9IHggKyB3aWR0aCArIDg7XG4gICAgY29uc3QgYW5ub3RZID0gdGV4dFk7XG4gICAgc3ZnICs9IGA8dGV4dCB4PVwiJHthbm5vdFh9XCIgeT1cIiR7YW5ub3RZfVwiIGZvbnQtc2l6ZT1cIiR7YW5ub3RhdGlvbkZvbnRTaXplfVwiIHRleHQtYW5jaG9yPVwic3RhcnRcIiBkb21pbmFudC1iYXNlbGluZT1cImNlbnRyYWxcIiBmaWxsPVwiIzk5OVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCI+JHtwYXJlbnRMYWJlbH08L3RleHQ+YDtcbiAgfSBlbHNlIHtcbiAgICAvLyDmqKrlkJHvvJrmoIfms6jlnKjkuIrmlrnvvIzlsYXkuK1cbiAgICBjb25zdCBhbm5vdFggPSB0ZXh0WDtcbiAgICBjb25zdCBhbm5vdFkgPSB5IC0gODtcbiAgICBzdmcgKz0gYDx0ZXh0IHg9XCIke2Fubm90WH1cIiB5PVwiJHthbm5vdFl9XCIgZm9udC1zaXplPVwiJHthbm5vdGF0aW9uRm9udFNpemV9XCIgdGV4dC1hbmNob3I9XCJtaWRkbGVcIiBmaWxsPVwiIzk5OVwiIGZvbnQtZmFtaWx5PVwibW9ub3NwYWNlXCI+JHtwYXJlbnRMYWJlbH08L3RleHQ+YDtcbiAgfVxuXG4gIHJldHVybiBzdmc7XG59XG4iLCJpbXBvcnQgdHlwZSB7IEJpdEZpZWxkLCBGaWVsZEJsb2NrIH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG4vKipcclxuICog5riy5p+T5Z2X55qEIEhUTUwg6KGo5qC8XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQmxvY2tUYWJsZShibG9jazogRmllbGRCbG9jayk6IHN0cmluZyB7XHJcbiAgY29uc3Qgcm93czogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jaGlsZHJlbikge1xyXG4gICAgY29sbGVjdFJvd3MoY2hpbGQsIDAsIHJvd3MpO1xyXG4gIH1cclxuXHJcbiAgbGV0IGh0bWwgPSAnPHRhYmxlIGNsYXNzPVwidmVyaWxvZy1iaXRmaWVsZC10YWJsZVwiPic7XHJcbiAgaHRtbCArPSAnPHRoZWFkPjx0cj4nO1xyXG4gIGh0bWwgKz0gJzx0aD5GaWVsZDwvdGg+JztcclxuICBodG1sICs9ICc8dGg+V2lkdGg8L3RoPic7XHJcbiAgaHRtbCArPSAnPHRoPkJpdCBSYW5nZTwvdGg+JztcclxuICBodG1sICs9ICc8dGg+RGVzY3JpcHRpb248L3RoPic7XHJcbiAgaHRtbCArPSAnPC90cj48L3RoZWFkPic7XHJcbiAgaHRtbCArPSAnPHRib2R5Pic7XHJcbiAgaHRtbCArPSByb3dzLmpvaW4oJycpO1xyXG4gIGh0bWwgKz0gJzwvdGJvZHk+PC90YWJsZT4nO1xyXG4gIHJldHVybiBodG1sO1xyXG59XHJcblxyXG4vKipcclxuICog6YCS5b2S5pS26ZuG6KGo5qC86KGMXHJcbiAqL1xyXG5mdW5jdGlvbiBjb2xsZWN0Um93cyhmaWVsZDogQml0RmllbGQsIGRlcHRoOiBudW1iZXIsIHJvd3M6IHN0cmluZ1tdKTogdm9pZCB7XHJcbiAgY29uc3QgaW5kZW50ID0gZGVwdGggPiAwID8gJyZuYnNwOyZuYnNwOyZuYnNwOyZuYnNwOycucmVwZWF0KGRlcHRoKSA6ICcnO1xyXG4gIGNvbnN0IGlzUmVmID0gZmllbGQuaXNSZWZlcmVuY2U7XHJcbiAgY29uc3QgaXNSc3YgPSBmaWVsZC5pc1Jlc2VydmVkO1xyXG4gIGNvbnN0IG5hbWUgPSBpc1JzdiA/ICdyZXNlcnZlZCcgOiAoaXNSZWYgPyBgQCR7ZmllbGQucmVmTmFtZX1gIDogZmllbGQubmFtZSk7XHJcbiAgY29uc3QgYml0UmFuZ2UgPSBgWyR7ZmllbGQubXNifToke2ZpZWxkLmxzYn1dYDtcclxuICBjb25zdCBkZXNjcmlwdGlvbiA9IGZpZWxkLmRlc2NyaXB0aW9uIHx8ICcnO1xyXG5cclxuICBsZXQgcm93Q2xhc3MgPSAnJztcclxuICBpZiAoaXNSc3YpIHJvd0NsYXNzID0gJyBjbGFzcz1cInJlc2VydmVkLXJvd1wiJztcclxuICBlbHNlIGlmIChpc1JlZikgcm93Q2xhc3MgPSAnIGNsYXNzPVwicmVmLWNoaWxkXCInO1xyXG5cclxuICBjb25zdCBuYW1lQ2VsbCA9IGlzUmVmXHJcbiAgICA/IGA8YSBocmVmPVwiI1wiIGNsYXNzPVwiYmYtcmVmLWxpbmtcIiBkYXRhLXRhcmdldD1cIiR7ZmllbGQucmVmTmFtZX1cIj4ke2luZGVudH0ke25hbWV9PC9hPmBcclxuICAgIDogYCR7aW5kZW50fSR7bmFtZX1gO1xyXG5cclxuICByb3dzLnB1c2goYDx0ciR7cm93Q2xhc3N9PmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7bmFtZUNlbGx9PC90ZD5gKTtcclxuICByb3dzLnB1c2goYDx0ZD4ke2ZpZWxkLndpZHRofTwvdGQ+YCk7XHJcbiAgcm93cy5wdXNoKGA8dGQ+JHtiaXRSYW5nZX08L3RkPmApO1xyXG4gIHJvd3MucHVzaChgPHRkPiR7ZGVzY3JpcHRpb259PC90ZD5gKTtcclxuICByb3dzLnB1c2goJzwvdHI+Jyk7XHJcblxyXG4gIGlmIChmaWVsZC5jaGlsZHJlbiAmJiBmaWVsZC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZpZWxkLmNoaWxkcmVuKSB7XHJcbiAgICAgIGNvbGxlY3RSb3dzKGNoaWxkLCBkZXB0aCArIDEsIHJvd3MpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCIvKiEgQGxpY2Vuc2UgRE9NUHVyaWZ5IDMuNC4xMiB8IChjKSBDdXJlNTMgYW5kIG90aGVyIGNvbnRyaWJ1dG9ycyB8IFJlbGVhc2VkIHVuZGVyIHRoZSBBcGFjaGUgbGljZW5zZSAyLjAgYW5kIE1vemlsbGEgUHVibGljIExpY2Vuc2UgMi4wIHwgZ2l0aHViLmNvbS9jdXJlNTMvRE9NUHVyaWZ5L2Jsb2IvMy40LjEyL0xJQ0VOU0UgKi9cblxuZnVuY3Rpb24gX2FycmF5TGlrZVRvQXJyYXkociwgYSkge1xuICAobnVsbCA9PSBhIHx8IGEgPiByLmxlbmd0aCkgJiYgKGEgPSByLmxlbmd0aCk7XG4gIGZvciAodmFyIGUgPSAwLCBuID0gQXJyYXkoYSk7IGUgPCBhOyBlKyspIG5bZV0gPSByW2VdO1xuICByZXR1cm4gbjtcbn1cbmZ1bmN0aW9uIF9hcnJheVdpdGhIb2xlcyhyKSB7XG4gIGlmIChBcnJheS5pc0FycmF5KHIpKSByZXR1cm4gcjtcbn1cbmZ1bmN0aW9uIF9pdGVyYWJsZVRvQXJyYXlMaW1pdChyLCBsKSB7XG4gIHZhciB0ID0gbnVsbCA9PSByID8gbnVsbCA6IFwidW5kZWZpbmVkXCIgIT0gdHlwZW9mIFN5bWJvbCAmJiByW1N5bWJvbC5pdGVyYXRvcl0gfHwgcltcIkBAaXRlcmF0b3JcIl07XG4gIGlmIChudWxsICE9IHQpIHtcbiAgICB2YXIgZSxcbiAgICAgIG4sXG4gICAgICBpLFxuICAgICAgdSxcbiAgICAgIGEgPSBbXSxcbiAgICAgIGYgPSB0cnVlLFxuICAgICAgbyA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBpZiAoaSA9ICh0ID0gdC5jYWxsKHIpKS5uZXh0LCAwID09PSBsKSA7IGVsc2UgZm9yICg7ICEoZiA9IChlID0gaS5jYWxsKHQpKS5kb25lKSAmJiAoYS5wdXNoKGUudmFsdWUpLCBhLmxlbmd0aCAhPT0gbCk7IGYgPSAhMCk7XG4gICAgfSBjYXRjaCAocikge1xuICAgICAgbyA9IHRydWUsIG4gPSByO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIWYgJiYgbnVsbCAhPSB0LnJldHVybiAmJiAodSA9IHQucmV0dXJuKCksIE9iamVjdCh1KSAhPT0gdSkpIHJldHVybjtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIGlmIChvKSB0aHJvdyBuO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYTtcbiAgfVxufVxuZnVuY3Rpb24gX25vbkl0ZXJhYmxlUmVzdCgpIHtcbiAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkludmFsaWQgYXR0ZW1wdCB0byBkZXN0cnVjdHVyZSBub24taXRlcmFibGUgaW5zdGFuY2UuXFxuSW4gb3JkZXIgdG8gYmUgaXRlcmFibGUsIG5vbi1hcnJheSBvYmplY3RzIG11c3QgaGF2ZSBhIFtTeW1ib2wuaXRlcmF0b3JdKCkgbWV0aG9kLlwiKTtcbn1cbmZ1bmN0aW9uIF9zbGljZWRUb0FycmF5KHIsIGUpIHtcbiAgcmV0dXJuIF9hcnJheVdpdGhIb2xlcyhyKSB8fCBfaXRlcmFibGVUb0FycmF5TGltaXQociwgZSkgfHwgX3Vuc3VwcG9ydGVkSXRlcmFibGVUb0FycmF5KHIsIGUpIHx8IF9ub25JdGVyYWJsZVJlc3QoKTtcbn1cbmZ1bmN0aW9uIF91bnN1cHBvcnRlZEl0ZXJhYmxlVG9BcnJheShyLCBhKSB7XG4gIGlmIChyKSB7XG4gICAgaWYgKFwic3RyaW5nXCIgPT0gdHlwZW9mIHIpIHJldHVybiBfYXJyYXlMaWtlVG9BcnJheShyLCBhKTtcbiAgICB2YXIgdCA9IHt9LnRvU3RyaW5nLmNhbGwocikuc2xpY2UoOCwgLTEpO1xuICAgIHJldHVybiBcIk9iamVjdFwiID09PSB0ICYmIHIuY29uc3RydWN0b3IgJiYgKHQgPSByLmNvbnN0cnVjdG9yLm5hbWUpLCBcIk1hcFwiID09PSB0IHx8IFwiU2V0XCIgPT09IHQgPyBBcnJheS5mcm9tKHIpIDogXCJBcmd1bWVudHNcIiA9PT0gdCB8fCAvXig/OlVpfEkpbnQoPzo4fDE2fDMyKSg/OkNsYW1wZWQpP0FycmF5JC8udGVzdCh0KSA/IF9hcnJheUxpa2VUb0FycmF5KHIsIGEpIDogdm9pZCAwO1xuICB9XG59XG5cbmNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyxcbiAgc2V0UHJvdG90eXBlT2YgPSBPYmplY3Quc2V0UHJvdG90eXBlT2YsXG4gIGlzRnJvemVuID0gT2JqZWN0LmlzRnJvemVuLFxuICBnZXRQcm90b3R5cGVPZiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZixcbiAgZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbmxldCBmcmVlemUgPSBPYmplY3QuZnJlZXplLFxuICBzZWFsID0gT2JqZWN0LnNlYWwsXG4gIGNyZWF0ZSA9IE9iamVjdC5jcmVhdGU7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgaW1wb3J0L25vLW11dGFibGUtZXhwb3J0c1xubGV0IF9yZWYgPSB0eXBlb2YgUmVmbGVjdCAhPT0gJ3VuZGVmaW5lZCcgJiYgUmVmbGVjdCxcbiAgYXBwbHkgPSBfcmVmLmFwcGx5LFxuICBjb25zdHJ1Y3QgPSBfcmVmLmNvbnN0cnVjdDtcbmlmICghZnJlZXplKSB7XG4gIGZyZWV6ZSA9IGZ1bmN0aW9uIGZyZWV6ZSh4KSB7XG4gICAgcmV0dXJuIHg7XG4gIH07XG59XG5pZiAoIXNlYWwpIHtcbiAgc2VhbCA9IGZ1bmN0aW9uIHNlYWwoeCkge1xuICAgIHJldHVybiB4O1xuICB9O1xufVxuaWYgKCFhcHBseSkge1xuICBhcHBseSA9IGZ1bmN0aW9uIGFwcGx5KGZ1bmMsIHRoaXNBcmcpIHtcbiAgICBmb3IgKHZhciBfbGVuID0gYXJndW1lbnRzLmxlbmd0aCwgYXJncyA9IG5ldyBBcnJheShfbGVuID4gMiA/IF9sZW4gLSAyIDogMCksIF9rZXkgPSAyOyBfa2V5IDwgX2xlbjsgX2tleSsrKSB7XG4gICAgICBhcmdzW19rZXkgLSAyXSA9IGFyZ3VtZW50c1tfa2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gIH07XG59XG5pZiAoIWNvbnN0cnVjdCkge1xuICBjb25zdHJ1Y3QgPSBmdW5jdGlvbiBjb25zdHJ1Y3QoRnVuYykge1xuICAgIGZvciAodmFyIF9sZW4yID0gYXJndW1lbnRzLmxlbmd0aCwgYXJncyA9IG5ldyBBcnJheShfbGVuMiA+IDEgPyBfbGVuMiAtIDEgOiAwKSwgX2tleTIgPSAxOyBfa2V5MiA8IF9sZW4yOyBfa2V5MisrKSB7XG4gICAgICBhcmdzW19rZXkyIC0gMV0gPSBhcmd1bWVudHNbX2tleTJdO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEZ1bmMoLi4uYXJncyk7XG4gIH07XG59XG5jb25zdCBhcnJheUZvckVhY2ggPSB1bmFwcGx5KEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKTtcbmNvbnN0IGFycmF5TGFzdEluZGV4T2YgPSB1bmFwcGx5KEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZik7XG5jb25zdCBhcnJheVBvcCA9IHVuYXBwbHkoQXJyYXkucHJvdG90eXBlLnBvcCk7XG5jb25zdCBhcnJheVB1c2ggPSB1bmFwcGx5KEFycmF5LnByb3RvdHlwZS5wdXNoKTtcbmNvbnN0IGFycmF5U3BsaWNlID0gdW5hcHBseShBcnJheS5wcm90b3R5cGUuc3BsaWNlKTtcbmNvbnN0IGFycmF5SXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5jb25zdCBzdHJpbmdUb0xvd2VyQ2FzZSA9IHVuYXBwbHkoU3RyaW5nLnByb3RvdHlwZS50b0xvd2VyQ2FzZSk7XG5jb25zdCBzdHJpbmdUb1N0cmluZyA9IHVuYXBwbHkoU3RyaW5nLnByb3RvdHlwZS50b1N0cmluZyk7XG5jb25zdCBzdHJpbmdNYXRjaCA9IHVuYXBwbHkoU3RyaW5nLnByb3RvdHlwZS5tYXRjaCk7XG5jb25zdCBzdHJpbmdSZXBsYWNlID0gdW5hcHBseShTdHJpbmcucHJvdG90eXBlLnJlcGxhY2UpO1xuY29uc3Qgc3RyaW5nSW5kZXhPZiA9IHVuYXBwbHkoU3RyaW5nLnByb3RvdHlwZS5pbmRleE9mKTtcbmNvbnN0IHN0cmluZ1RyaW0gPSB1bmFwcGx5KFN0cmluZy5wcm90b3R5cGUudHJpbSk7XG5jb25zdCBudW1iZXJUb1N0cmluZyA9IHVuYXBwbHkoTnVtYmVyLnByb3RvdHlwZS50b1N0cmluZyk7XG5jb25zdCBib29sZWFuVG9TdHJpbmcgPSB1bmFwcGx5KEJvb2xlYW4ucHJvdG90eXBlLnRvU3RyaW5nKTtcbmNvbnN0IGJpZ2ludFRvU3RyaW5nID0gdHlwZW9mIEJpZ0ludCA9PT0gJ3VuZGVmaW5lZCcgPyBudWxsIDogdW5hcHBseShCaWdJbnQucHJvdG90eXBlLnRvU3RyaW5nKTtcbmNvbnN0IHN5bWJvbFRvU3RyaW5nID0gdHlwZW9mIFN5bWJvbCA9PT0gJ3VuZGVmaW5lZCcgPyBudWxsIDogdW5hcHBseShTeW1ib2wucHJvdG90eXBlLnRvU3RyaW5nKTtcbmNvbnN0IG9iamVjdEhhc093blByb3BlcnR5ID0gdW5hcHBseShPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5KTtcbmNvbnN0IG9iamVjdFRvU3RyaW5nID0gdW5hcHBseShPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nKTtcbmNvbnN0IHJlZ0V4cFRlc3QgPSB1bmFwcGx5KFJlZ0V4cC5wcm90b3R5cGUudGVzdCk7XG5jb25zdCB0eXBlRXJyb3JDcmVhdGUgPSB1bmNvbnN0cnVjdChUeXBlRXJyb3IpO1xuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGZ1bmN0aW9uIHRoYXQgY2FsbHMgdGhlIGdpdmVuIGZ1bmN0aW9uIHdpdGggYSBzcGVjaWZpZWQgdGhpc0FyZyBhbmQgYXJndW1lbnRzLlxuICpcbiAqIEBwYXJhbSBmdW5jIC0gVGhlIGZ1bmN0aW9uIHRvIGJlIHdyYXBwZWQgYW5kIGNhbGxlZC5cbiAqIEByZXR1cm5zIEEgbmV3IGZ1bmN0aW9uIHRoYXQgY2FsbHMgdGhlIGdpdmVuIGZ1bmN0aW9uIHdpdGggYSBzcGVjaWZpZWQgdGhpc0FyZyBhbmQgYXJndW1lbnRzLlxuICovXG5mdW5jdGlvbiB1bmFwcGx5KGZ1bmMpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uICh0aGlzQXJnKSB7XG4gICAgaWYgKHRoaXNBcmcgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgIHRoaXNBcmcubGFzdEluZGV4ID0gMDtcbiAgICB9XG4gICAgZm9yICh2YXIgX2xlbjMgPSBhcmd1bWVudHMubGVuZ3RoLCBhcmdzID0gbmV3IEFycmF5KF9sZW4zID4gMSA/IF9sZW4zIC0gMSA6IDApLCBfa2V5MyA9IDE7IF9rZXkzIDwgX2xlbjM7IF9rZXkzKyspIHtcbiAgICAgIGFyZ3NbX2tleTMgLSAxXSA9IGFyZ3VtZW50c1tfa2V5M107XG4gICAgfVxuICAgIHJldHVybiBhcHBseShmdW5jLCB0aGlzQXJnLCBhcmdzKTtcbiAgfTtcbn1cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBmdW5jdGlvbiB0aGF0IGNvbnN0cnVjdHMgYW4gaW5zdGFuY2Ugb2YgdGhlIGdpdmVuIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIHdpdGggdGhlIHByb3ZpZGVkIGFyZ3VtZW50cy5cbiAqXG4gKiBAcGFyYW0gZnVuYyAtIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBiZSB3cmFwcGVkIGFuZCBjYWxsZWQuXG4gKiBAcmV0dXJucyBBIG5ldyBmdW5jdGlvbiB0aGF0IGNvbnN0cnVjdHMgYW4gaW5zdGFuY2Ugb2YgdGhlIGdpdmVuIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIHdpdGggdGhlIHByb3ZpZGVkIGFyZ3VtZW50cy5cbiAqL1xuZnVuY3Rpb24gdW5jb25zdHJ1Y3QoRnVuYykge1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIGZvciAodmFyIF9sZW40ID0gYXJndW1lbnRzLmxlbmd0aCwgYXJncyA9IG5ldyBBcnJheShfbGVuNCksIF9rZXk0ID0gMDsgX2tleTQgPCBfbGVuNDsgX2tleTQrKykge1xuICAgICAgYXJnc1tfa2V5NF0gPSBhcmd1bWVudHNbX2tleTRdO1xuICAgIH1cbiAgICByZXR1cm4gY29uc3RydWN0KEZ1bmMsIGFyZ3MpO1xuICB9O1xufVxuLyoqXG4gKiBBZGQgcHJvcGVydGllcyB0byBhIGxvb2t1cCB0YWJsZVxuICpcbiAqIEBwYXJhbSBzZXQgLSBUaGUgc2V0IHRvIHdoaWNoIGVsZW1lbnRzIHdpbGwgYmUgYWRkZWQuXG4gKiBAcGFyYW0gYXJyYXkgLSBUaGUgYXJyYXkgY29udGFpbmluZyBlbGVtZW50cyB0byBiZSBhZGRlZCB0byB0aGUgc2V0LlxuICogQHBhcmFtIHRyYW5zZm9ybUNhc2VGdW5jIC0gQW4gb3B0aW9uYWwgZnVuY3Rpb24gdG8gdHJhbnNmb3JtIHRoZSBjYXNlIG9mIGVhY2ggZWxlbWVudCBiZWZvcmUgYWRkaW5nIHRvIHRoZSBzZXQuXG4gKiBAcmV0dXJucyBUaGUgbW9kaWZpZWQgc2V0IHdpdGggYWRkZWQgZWxlbWVudHMuXG4gKi9cbmZ1bmN0aW9uIGFkZFRvU2V0KHNldCwgYXJyYXkpIHtcbiAgbGV0IHRyYW5zZm9ybUNhc2VGdW5jID0gYXJndW1lbnRzLmxlbmd0aCA+IDIgJiYgYXJndW1lbnRzWzJdICE9PSB1bmRlZmluZWQgPyBhcmd1bWVudHNbMl0gOiBzdHJpbmdUb0xvd2VyQ2FzZTtcbiAgaWYgKHNldFByb3RvdHlwZU9mKSB7XG4gICAgLy8gTWFrZSAnaW4nIGFuZCB0cnV0aHkgY2hlY2tzIGxpa2UgQm9vbGVhbihzZXQuY29uc3RydWN0b3IpXG4gICAgLy8gaW5kZXBlbmRlbnQgb2YgYW55IHByb3BlcnRpZXMgZGVmaW5lZCBvbiBPYmplY3QucHJvdG90eXBlLlxuICAgIC8vIFByZXZlbnQgcHJvdG90eXBlIHNldHRlcnMgZnJvbSBpbnRlcmNlcHRpbmcgc2V0IGFzIGEgdGhpcyB2YWx1ZS5cbiAgICBzZXRQcm90b3R5cGVPZihzZXQsIG51bGwpO1xuICB9XG4gIGlmICghYXJyYXlJc0FycmF5KGFycmF5KSkge1xuICAgIHJldHVybiBzZXQ7XG4gIH1cbiAgbGV0IGwgPSBhcnJheS5sZW5ndGg7XG4gIHdoaWxlIChsLS0pIHtcbiAgICBsZXQgZWxlbWVudCA9IGFycmF5W2xdO1xuICAgIGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGxjRWxlbWVudCA9IHRyYW5zZm9ybUNhc2VGdW5jKGVsZW1lbnQpO1xuICAgICAgaWYgKGxjRWxlbWVudCAhPT0gZWxlbWVudCkge1xuICAgICAgICAvLyBDb25maWcgcHJlc2V0cyAoZS5nLiB0YWdzLmpzLCBhdHRycy5qcykgYXJlIGltbXV0YWJsZS5cbiAgICAgICAgaWYgKCFpc0Zyb3plbihhcnJheSkpIHtcbiAgICAgICAgICBhcnJheVtsXSA9IGxjRWxlbWVudDtcbiAgICAgICAgfVxuICAgICAgICBlbGVtZW50ID0gbGNFbGVtZW50O1xuICAgICAgfVxuICAgIH1cbiAgICBzZXRbZWxlbWVudF0gPSB0cnVlO1xuICB9XG4gIHJldHVybiBzZXQ7XG59XG4vKipcbiAqIENsZWFuIHVwIGFuIGFycmF5IHRvIGhhcmRlbiBhZ2FpbnN0IENTUFBcbiAqXG4gKiBAcGFyYW0gYXJyYXkgLSBUaGUgYXJyYXkgdG8gYmUgY2xlYW5lZC5cbiAqIEByZXR1cm5zIFRoZSBjbGVhbmVkIHZlcnNpb24gb2YgdGhlIGFycmF5XG4gKi9cbmZ1bmN0aW9uIGNsZWFuQXJyYXkoYXJyYXkpIHtcbiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGFycmF5Lmxlbmd0aDsgaW5kZXgrKykge1xuICAgIGNvbnN0IGlzUHJvcGVydHlFeGlzdCA9IG9iamVjdEhhc093blByb3BlcnR5KGFycmF5LCBpbmRleCk7XG4gICAgaWYgKCFpc1Byb3BlcnR5RXhpc3QpIHtcbiAgICAgIGFycmF5W2luZGV4XSA9IG51bGw7XG4gICAgfVxuICB9XG4gIHJldHVybiBhcnJheTtcbn1cbi8qKlxuICogU2hhbGxvdyBjbG9uZSBhbiBvYmplY3RcbiAqXG4gKiBAcGFyYW0gb2JqZWN0IC0gVGhlIG9iamVjdCB0byBiZSBjbG9uZWQuXG4gKiBAcmV0dXJucyBBIG5ldyBvYmplY3QgdGhhdCBjb3BpZXMgdGhlIG9yaWdpbmFsLlxuICovXG5mdW5jdGlvbiBjbG9uZShvYmplY3QpIHtcbiAgY29uc3QgbmV3T2JqZWN0ID0gY3JlYXRlKG51bGwpO1xuICBmb3IgKGNvbnN0IF9yZWYyIG9mIGVudHJpZXMob2JqZWN0KSkge1xuICAgIHZhciBfcmVmMyA9IF9zbGljZWRUb0FycmF5KF9yZWYyLCAyKTtcbiAgICBjb25zdCBwcm9wZXJ0eSA9IF9yZWYzWzBdO1xuICAgIGNvbnN0IHZhbHVlID0gX3JlZjNbMV07XG4gICAgY29uc3QgaXNQcm9wZXJ0eUV4aXN0ID0gb2JqZWN0SGFzT3duUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eSk7XG4gICAgaWYgKGlzUHJvcGVydHlFeGlzdCkge1xuICAgICAgaWYgKGFycmF5SXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgbmV3T2JqZWN0W3Byb3BlcnR5XSA9IGNsZWFuQXJyYXkodmFsdWUpO1xuICAgICAgfSBlbHNlIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcbiAgICAgICAgbmV3T2JqZWN0W3Byb3BlcnR5XSA9IGNsb25lKHZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ld09iamVjdFtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ld09iamVjdDtcbn1cbi8qKlxuICogQ29udmVydCBub24tbm9kZSB2YWx1ZXMgaW50byBzdHJpbmdzIHdpdGhvdXQgZGVwZW5kaW5nIG9uIGRpcmVjdCBwcm9wZXJ0eSBhY2Nlc3MuXG4gKlxuICogQHBhcmFtIHZhbHVlIC0gVGhlIHZhbHVlIHRvIHN0cmluZ2lmeS5cbiAqIEByZXR1cm5zIEEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBwcm92aWRlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gc3RyaW5naWZ5VmFsdWUodmFsdWUpIHtcbiAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICB9XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHtcbiAgICAgICAgcmV0dXJuIG51bWJlclRvU3RyaW5nKHZhbHVlKTtcbiAgICAgIH1cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHtcbiAgICAgICAgcmV0dXJuIGJvb2xlYW5Ub1N0cmluZyh2YWx1ZSk7XG4gICAgICB9XG4gICAgY2FzZSAnYmlnaW50JzpcbiAgICAgIHtcbiAgICAgICAgcmV0dXJuIGJpZ2ludFRvU3RyaW5nID8gYmlnaW50VG9TdHJpbmcodmFsdWUpIDogJzAnO1xuICAgICAgfVxuICAgIGNhc2UgJ3N5bWJvbCc6XG4gICAgICB7XG4gICAgICAgIHJldHVybiBzeW1ib2xUb1N0cmluZyA/IHN5bWJvbFRvU3RyaW5nKHZhbHVlKSA6ICdTeW1ib2woKSc7XG4gICAgICB9XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdFRvU3RyaW5nKHZhbHVlKTtcbiAgICAgIH1cbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHtcbiAgICAgICAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdFRvU3RyaW5nKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB2YWx1ZUFzUmVjb3JkID0gdmFsdWU7XG4gICAgICAgIGNvbnN0IHZhbHVlVG9TdHJpbmcgPSBsb29rdXBHZXR0ZXIodmFsdWVBc1JlY29yZCwgJ3RvU3RyaW5nJyk7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWVUb1N0cmluZyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHN0cmluZ2lmaWVkID0gdmFsdWVUb1N0cmluZyh2YWx1ZUFzUmVjb3JkKTtcbiAgICAgICAgICByZXR1cm4gdHlwZW9mIHN0cmluZ2lmaWVkID09PSAnc3RyaW5nJyA/IHN0cmluZ2lmaWVkIDogb2JqZWN0VG9TdHJpbmcoc3RyaW5naWZpZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvYmplY3RUb1N0cmluZyh2YWx1ZSk7XG4gICAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdFRvU3RyaW5nKHZhbHVlKTtcbiAgICAgIH1cbiAgfVxufVxuLyoqXG4gKiBUaGlzIG1ldGhvZCBhdXRvbWF0aWNhbGx5IGNoZWNrcyBpZiB0aGUgcHJvcCBpcyBmdW5jdGlvbiBvciBnZXR0ZXIgYW5kIGJlaGF2ZXMgYWNjb3JkaW5nbHkuXG4gKlxuICogQHBhcmFtIG9iamVjdCAtIFRoZSBvYmplY3QgdG8gbG9vayB1cCB0aGUgZ2V0dGVyIGZ1bmN0aW9uIGluIGl0cyBwcm90b3R5cGUgY2hhaW4uXG4gKiBAcGFyYW0gcHJvcCAtIFRoZSBwcm9wZXJ0eSBuYW1lIGZvciB3aGljaCB0byBmaW5kIHRoZSBnZXR0ZXIgZnVuY3Rpb24uXG4gKiBAcmV0dXJucyBUaGUgZ2V0dGVyIGZ1bmN0aW9uIGZvdW5kIGluIHRoZSBwcm90b3R5cGUgY2hhaW4gb3IgYSBmYWxsYmFjayBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gbG9va3VwR2V0dGVyKG9iamVjdCwgcHJvcCkge1xuICB3aGlsZSAob2JqZWN0ICE9PSBudWxsKSB7XG4gICAgY29uc3QgZGVzYyA9IGdldE93blByb3BlcnR5RGVzY3JpcHRvcihvYmplY3QsIHByb3ApO1xuICAgIGlmIChkZXNjKSB7XG4gICAgICBpZiAoZGVzYy5nZXQpIHtcbiAgICAgICAgcmV0dXJuIHVuYXBwbHkoZGVzYy5nZXQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBkZXNjLnZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiB1bmFwcGx5KGRlc2MudmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBvYmplY3QgPSBnZXRQcm90b3R5cGVPZihvYmplY3QpO1xuICB9XG4gIGZ1bmN0aW9uIGZhbGxiYWNrVmFsdWUoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIGZhbGxiYWNrVmFsdWU7XG59XG5mdW5jdGlvbiBpc1JlZ2V4KHZhbHVlKSB7XG4gIHRyeSB7XG4gICAgcmVnRXhwVGVzdCh2YWx1ZSwgJycpO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIChfdW51c2VkKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmNvbnN0IGh0bWwkMSA9IGZyZWV6ZShbJ2EnLCAnYWJicicsICdhY3JvbnltJywgJ2FkZHJlc3MnLCAnYXJlYScsICdhcnRpY2xlJywgJ2FzaWRlJywgJ2F1ZGlvJywgJ2InLCAnYmRpJywgJ2JkbycsICdiaWcnLCAnYmxpbmsnLCAnYmxvY2txdW90ZScsICdib2R5JywgJ2JyJywgJ2J1dHRvbicsICdjYW52YXMnLCAnY2FwdGlvbicsICdjZW50ZXInLCAnY2l0ZScsICdjb2RlJywgJ2NvbCcsICdjb2xncm91cCcsICdjb250ZW50JywgJ2RhdGEnLCAnZGF0YWxpc3QnLCAnZGQnLCAnZGVjb3JhdG9yJywgJ2RlbCcsICdkZXRhaWxzJywgJ2RmbicsICdkaWFsb2cnLCAnZGlyJywgJ2RpdicsICdkbCcsICdkdCcsICdlbGVtZW50JywgJ2VtJywgJ2ZpZWxkc2V0JywgJ2ZpZ2NhcHRpb24nLCAnZmlndXJlJywgJ2ZvbnQnLCAnZm9vdGVyJywgJ2Zvcm0nLCAnaDEnLCAnaDInLCAnaDMnLCAnaDQnLCAnaDUnLCAnaDYnLCAnaGVhZCcsICdoZWFkZXInLCAnaGdyb3VwJywgJ2hyJywgJ2h0bWwnLCAnaScsICdpbWcnLCAnaW5wdXQnLCAnaW5zJywgJ2tiZCcsICdsYWJlbCcsICdsZWdlbmQnLCAnbGknLCAnbWFpbicsICdtYXAnLCAnbWFyaycsICdtYXJxdWVlJywgJ21lbnUnLCAnbWVudWl0ZW0nLCAnbWV0ZXInLCAnbmF2JywgJ25vYnInLCAnb2wnLCAnb3B0Z3JvdXAnLCAnb3B0aW9uJywgJ291dHB1dCcsICdwJywgJ3BpY3R1cmUnLCAncHJlJywgJ3Byb2dyZXNzJywgJ3EnLCAncnAnLCAncnQnLCAncnVieScsICdzJywgJ3NhbXAnLCAnc2VhcmNoJywgJ3NlY3Rpb24nLCAnc2VsZWN0JywgJ3NoYWRvdycsICdzbG90JywgJ3NtYWxsJywgJ3NvdXJjZScsICdzcGFjZXInLCAnc3BhbicsICdzdHJpa2UnLCAnc3Ryb25nJywgJ3N0eWxlJywgJ3N1YicsICdzdW1tYXJ5JywgJ3N1cCcsICd0YWJsZScsICd0Ym9keScsICd0ZCcsICd0ZW1wbGF0ZScsICd0ZXh0YXJlYScsICd0Zm9vdCcsICd0aCcsICd0aGVhZCcsICd0aW1lJywgJ3RyJywgJ3RyYWNrJywgJ3R0JywgJ3UnLCAndWwnLCAndmFyJywgJ3ZpZGVvJywgJ3diciddKTtcbmNvbnN0IHN2ZyQxID0gZnJlZXplKFsnc3ZnJywgJ2EnLCAnYWx0Z2x5cGgnLCAnYWx0Z2x5cGhkZWYnLCAnYWx0Z2x5cGhpdGVtJywgJ2FuaW1hdGVjb2xvcicsICdhbmltYXRlbW90aW9uJywgJ2FuaW1hdGV0cmFuc2Zvcm0nLCAnY2lyY2xlJywgJ2NsaXBwYXRoJywgJ2RlZnMnLCAnZGVzYycsICdlbGxpcHNlJywgJ2VudGVya2V5aGludCcsICdleHBvcnRwYXJ0cycsICdmaWx0ZXInLCAnZm9udCcsICdnJywgJ2dseXBoJywgJ2dseXBocmVmJywgJ2hrZXJuJywgJ2ltYWdlJywgJ2lucHV0bW9kZScsICdsaW5lJywgJ2xpbmVhcmdyYWRpZW50JywgJ21hcmtlcicsICdtYXNrJywgJ21ldGFkYXRhJywgJ21wYXRoJywgJ3BhcnQnLCAncGF0aCcsICdwYXR0ZXJuJywgJ3BvbHlnb24nLCAncG9seWxpbmUnLCAncmFkaWFsZ3JhZGllbnQnLCAncmVjdCcsICdzdG9wJywgJ3N0eWxlJywgJ3N3aXRjaCcsICdzeW1ib2wnLCAndGV4dCcsICd0ZXh0cGF0aCcsICd0aXRsZScsICd0cmVmJywgJ3RzcGFuJywgJ3ZpZXcnLCAndmtlcm4nXSk7XG5jb25zdCBzdmdGaWx0ZXJzID0gZnJlZXplKFsnZmVCbGVuZCcsICdmZUNvbG9yTWF0cml4JywgJ2ZlQ29tcG9uZW50VHJhbnNmZXInLCAnZmVDb21wb3NpdGUnLCAnZmVDb252b2x2ZU1hdHJpeCcsICdmZURpZmZ1c2VMaWdodGluZycsICdmZURpc3BsYWNlbWVudE1hcCcsICdmZURpc3RhbnRMaWdodCcsICdmZURyb3BTaGFkb3cnLCAnZmVGbG9vZCcsICdmZUZ1bmNBJywgJ2ZlRnVuY0InLCAnZmVGdW5jRycsICdmZUZ1bmNSJywgJ2ZlR2F1c3NpYW5CbHVyJywgJ2ZlSW1hZ2UnLCAnZmVNZXJnZScsICdmZU1lcmdlTm9kZScsICdmZU1vcnBob2xvZ3knLCAnZmVPZmZzZXQnLCAnZmVQb2ludExpZ2h0JywgJ2ZlU3BlY3VsYXJMaWdodGluZycsICdmZVNwb3RMaWdodCcsICdmZVRpbGUnLCAnZmVUdXJidWxlbmNlJ10pO1xuLy8gTGlzdCBvZiBTVkcgZWxlbWVudHMgdGhhdCBhcmUgZGlzYWxsb3dlZCBieSBkZWZhdWx0LlxuLy8gV2Ugc3RpbGwgbmVlZCB0byBrbm93IHRoZW0gc28gdGhhdCB3ZSBjYW4gZG8gbmFtZXNwYWNlXG4vLyBjaGVja3MgcHJvcGVybHkgaW4gY2FzZSBvbmUgd2FudHMgdG8gYWRkIHRoZW0gdG9cbi8vIGFsbG93LWxpc3QuXG5jb25zdCBzdmdEaXNhbGxvd2VkID0gZnJlZXplKFsnYW5pbWF0ZScsICdjb2xvci1wcm9maWxlJywgJ2N1cnNvcicsICdkaXNjYXJkJywgJ2ZvbnQtZmFjZScsICdmb250LWZhY2UtZm9ybWF0JywgJ2ZvbnQtZmFjZS1uYW1lJywgJ2ZvbnQtZmFjZS1zcmMnLCAnZm9udC1mYWNlLXVyaScsICdmb3JlaWdub2JqZWN0JywgJ2hhdGNoJywgJ2hhdGNocGF0aCcsICdtZXNoJywgJ21lc2hncmFkaWVudCcsICdtZXNocGF0Y2gnLCAnbWVzaHJvdycsICdtaXNzaW5nLWdseXBoJywgJ3NjcmlwdCcsICdzZXQnLCAnc29saWRjb2xvcicsICd1bmtub3duJywgJ3VzZSddKTtcbmNvbnN0IG1hdGhNbCQxID0gZnJlZXplKFsnbWF0aCcsICdtZW5jbG9zZScsICdtZXJyb3InLCAnbWZlbmNlZCcsICdtZnJhYycsICdtZ2x5cGgnLCAnbWknLCAnbWxhYmVsZWR0cicsICdtbXVsdGlzY3JpcHRzJywgJ21uJywgJ21vJywgJ21vdmVyJywgJ21wYWRkZWQnLCAnbXBoYW50b20nLCAnbXJvb3QnLCAnbXJvdycsICdtcycsICdtc3BhY2UnLCAnbXNxcnQnLCAnbXN0eWxlJywgJ21zdWInLCAnbXN1cCcsICdtc3Vic3VwJywgJ210YWJsZScsICdtdGQnLCAnbXRleHQnLCAnbXRyJywgJ211bmRlcicsICdtdW5kZXJvdmVyJywgJ21wcmVzY3JpcHRzJ10pO1xuLy8gU2ltaWxhcmx5IHRvIFNWRywgd2Ugd2FudCB0byBrbm93IGFsbCBNYXRoTUwgZWxlbWVudHMsXG4vLyBldmVuIHRob3NlIHRoYXQgd2UgZGlzYWxsb3cgYnkgZGVmYXVsdC5cbmNvbnN0IG1hdGhNbERpc2FsbG93ZWQgPSBmcmVlemUoWydtYWN0aW9uJywgJ21hbGlnbmdyb3VwJywgJ21hbGlnbm1hcmsnLCAnbWxvbmdkaXYnLCAnbXNjYXJyaWVzJywgJ21zY2FycnknLCAnbXNncm91cCcsICdtc3RhY2snLCAnbXNsaW5lJywgJ21zcm93JywgJ3NlbWFudGljcycsICdhbm5vdGF0aW9uJywgJ2Fubm90YXRpb24teG1sJywgJ21wcmVzY3JpcHRzJywgJ25vbmUnXSk7XG5jb25zdCB0ZXh0ID0gZnJlZXplKFsnI3RleHQnXSk7XG5cbmNvbnN0IGh0bWwgPSBmcmVlemUoWydhY2NlcHQnLCAnYWN0aW9uJywgJ2FsaWduJywgJ2FsdCcsICdhdXRvY2FwaXRhbGl6ZScsICdhdXRvY29tcGxldGUnLCAnYXV0b3BpY3R1cmVpbnBpY3R1cmUnLCAnYXV0b3BsYXknLCAnYmFja2dyb3VuZCcsICdiZ2NvbG9yJywgJ2JvcmRlcicsICdjYXB0dXJlJywgJ2NlbGxwYWRkaW5nJywgJ2NlbGxzcGFjaW5nJywgJ2NoZWNrZWQnLCAnY2l0ZScsICdjbGFzcycsICdjbGVhcicsICdjb2xvcicsICdjb2xzJywgJ2NvbHNwYW4nLCAnY29tbWFuZCcsICdjb21tYW5kZm9yJywgJ2NvbnRyb2xzJywgJ2NvbnRyb2xzbGlzdCcsICdjb29yZHMnLCAnY3Jvc3NvcmlnaW4nLCAnZGF0ZXRpbWUnLCAnZGVjb2RpbmcnLCAnZGVmYXVsdCcsICdkaXInLCAnZGlzYWJsZWQnLCAnZGlzYWJsZXBpY3R1cmVpbnBpY3R1cmUnLCAnZGlzYWJsZXJlbW90ZXBsYXliYWNrJywgJ2Rvd25sb2FkJywgJ2RyYWdnYWJsZScsICdlbmN0eXBlJywgJ2VudGVya2V5aGludCcsICdleHBvcnRwYXJ0cycsICdmYWNlJywgJ2ZvcicsICdoZWFkZXJzJywgJ2hlaWdodCcsICdoaWRkZW4nLCAnaGlnaCcsICdocmVmJywgJ2hyZWZsYW5nJywgJ2lkJywgJ2luZXJ0JywgJ2lucHV0bW9kZScsICdpbnRlZ3JpdHknLCAnaXNtYXAnLCAna2luZCcsICdsYWJlbCcsICdsYW5nJywgJ2xpc3QnLCAnbG9hZGluZycsICdsb29wJywgJ2xvdycsICdtYXgnLCAnbWF4bGVuZ3RoJywgJ21lZGlhJywgJ21ldGhvZCcsICdtaW4nLCAnbWlubGVuZ3RoJywgJ211bHRpcGxlJywgJ211dGVkJywgJ25hbWUnLCAnbm9uY2UnLCAnbm9zaGFkZScsICdub3ZhbGlkYXRlJywgJ25vd3JhcCcsICdvcGVuJywgJ29wdGltdW0nLCAncGFydCcsICdwYXR0ZXJuJywgJ3BsYWNlaG9sZGVyJywgJ3BsYXlzaW5saW5lJywgJ3BvcG92ZXInLCAncG9wb3ZlcnRhcmdldCcsICdwb3BvdmVydGFyZ2V0YWN0aW9uJywgJ3Bvc3RlcicsICdwcmVsb2FkJywgJ3B1YmRhdGUnLCAncmFkaW9ncm91cCcsICdyZWFkb25seScsICdyZWwnLCAncmVxdWlyZWQnLCAncmV2JywgJ3JldmVyc2VkJywgJ3JvbGUnLCAncm93cycsICdyb3dzcGFuJywgJ3NwZWxsY2hlY2snLCAnc2NvcGUnLCAnc2VsZWN0ZWQnLCAnc2hhcGUnLCAnc2l6ZScsICdzaXplcycsICdzbG90JywgJ3NwYW4nLCAnc3JjbGFuZycsICdzdGFydCcsICdzcmMnLCAnc3Jjc2V0JywgJ3N0ZXAnLCAnc3R5bGUnLCAnc3VtbWFyeScsICd0YWJpbmRleCcsICd0aXRsZScsICd0cmFuc2xhdGUnLCAndHlwZScsICd1c2VtYXAnLCAndmFsaWduJywgJ3ZhbHVlJywgJ3dpZHRoJywgJ3dyYXAnLCAneG1sbnMnXSk7XG5jb25zdCBzdmcgPSBmcmVlemUoWydhY2NlbnQtaGVpZ2h0JywgJ2FjY3VtdWxhdGUnLCAnYWRkaXRpdmUnLCAnYWxpZ25tZW50LWJhc2VsaW5lJywgJ2FtcGxpdHVkZScsICdhc2NlbnQnLCAnYXR0cmlidXRlbmFtZScsICdhdHRyaWJ1dGV0eXBlJywgJ2F6aW11dGgnLCAnYmFzZWZyZXF1ZW5jeScsICdiYXNlbGluZS1zaGlmdCcsICdiZWdpbicsICdiaWFzJywgJ2J5JywgJ2NsYXNzJywgJ2NsaXAnLCAnY2xpcHBhdGh1bml0cycsICdjbGlwLXBhdGgnLCAnY2xpcC1ydWxlJywgJ2NvbG9yJywgJ2NvbG9yLWludGVycG9sYXRpb24nLCAnY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzJywgJ2NvbG9yLXByb2ZpbGUnLCAnY29sb3ItcmVuZGVyaW5nJywgJ2N4JywgJ2N5JywgJ2QnLCAnZHgnLCAnZHknLCAnZGlmZnVzZWNvbnN0YW50JywgJ2RpcmVjdGlvbicsICdkaXNwbGF5JywgJ2Rpdmlzb3InLCAnZG9taW5hbnQtYmFzZWxpbmUnLCAnZHVyJywgJ2VkZ2Vtb2RlJywgJ2VsZXZhdGlvbicsICdlbmQnLCAnZXhwb25lbnQnLCAnZmlsbCcsICdmaWxsLW9wYWNpdHknLCAnZmlsbC1ydWxlJywgJ2ZpbHRlcicsICdmaWx0ZXJ1bml0cycsICdmbG9vZC1jb2xvcicsICdmbG9vZC1vcGFjaXR5JywgJ2ZvbnQtZmFtaWx5JywgJ2ZvbnQtc2l6ZScsICdmb250LXNpemUtYWRqdXN0JywgJ2ZvbnQtc3RyZXRjaCcsICdmb250LXN0eWxlJywgJ2ZvbnQtdmFyaWFudCcsICdmb250LXdlaWdodCcsICdmeCcsICdmeScsICdnMScsICdnMicsICdnbHlwaC1uYW1lJywgJ2dseXBocmVmJywgJ2dyYWRpZW50dW5pdHMnLCAnZ3JhZGllbnR0cmFuc2Zvcm0nLCAnaGVpZ2h0JywgJ2hyZWYnLCAnaWQnLCAnaW1hZ2UtcmVuZGVyaW5nJywgJ2luJywgJ2luMicsICdpbnRlcmNlcHQnLCAnaycsICdrMScsICdrMicsICdrMycsICdrNCcsICdrZXJuaW5nJywgJ2tleXBvaW50cycsICdrZXlzcGxpbmVzJywgJ2tleXRpbWVzJywgJ2xhbmcnLCAnbGVuZ3RoYWRqdXN0JywgJ2xldHRlci1zcGFjaW5nJywgJ2tlcm5lbG1hdHJpeCcsICdrZXJuZWx1bml0bGVuZ3RoJywgJ2xpZ2h0aW5nLWNvbG9yJywgJ2xvY2FsJywgJ21hcmtlci1lbmQnLCAnbWFya2VyLW1pZCcsICdtYXJrZXItc3RhcnQnLCAnbWFya2VyaGVpZ2h0JywgJ21hcmtlcnVuaXRzJywgJ21hcmtlcndpZHRoJywgJ21hc2tjb250ZW50dW5pdHMnLCAnbWFza3VuaXRzJywgJ21heCcsICdtYXNrJywgJ21hc2stdHlwZScsICdtZWRpYScsICdtZXRob2QnLCAnbW9kZScsICdtaW4nLCAnbmFtZScsICdudW1vY3RhdmVzJywgJ29mZnNldCcsICdvcGVyYXRvcicsICdvcGFjaXR5JywgJ29yZGVyJywgJ29yaWVudCcsICdvcmllbnRhdGlvbicsICdvcmlnaW4nLCAnb3ZlcmZsb3cnLCAncGFpbnQtb3JkZXInLCAncGF0aCcsICdwYXRobGVuZ3RoJywgJ3BhdHRlcm5jb250ZW50dW5pdHMnLCAncGF0dGVybnRyYW5zZm9ybScsICdwYXR0ZXJudW5pdHMnLCAncG9pbnRzJywgJ3ByZXNlcnZlYWxwaGEnLCAncHJlc2VydmVhc3BlY3RyYXRpbycsICdwcmltaXRpdmV1bml0cycsICdyJywgJ3J4JywgJ3J5JywgJ3JhZGl1cycsICdyZWZ4JywgJ3JlZnknLCAncmVwZWF0Y291bnQnLCAncmVwZWF0ZHVyJywgJ3Jlc3RhcnQnLCAncmVzdWx0JywgJ3JvdGF0ZScsICdzY2FsZScsICdzZWVkJywgJ3NoYXBlLXJlbmRlcmluZycsICdzbG9wZScsICdzcGVjdWxhcmNvbnN0YW50JywgJ3NwZWN1bGFyZXhwb25lbnQnLCAnc3ByZWFkbWV0aG9kJywgJ3N0YXJ0b2Zmc2V0JywgJ3N0ZGRldmlhdGlvbicsICdzdGl0Y2h0aWxlcycsICdzdG9wLWNvbG9yJywgJ3N0b3Atb3BhY2l0eScsICdzdHJva2UtZGFzaGFycmF5JywgJ3N0cm9rZS1kYXNob2Zmc2V0JywgJ3N0cm9rZS1saW5lY2FwJywgJ3N0cm9rZS1saW5lam9pbicsICdzdHJva2UtbWl0ZXJsaW1pdCcsICdzdHJva2Utb3BhY2l0eScsICdzdHJva2UnLCAnc3Ryb2tlLXdpZHRoJywgJ3N0eWxlJywgJ3N1cmZhY2VzY2FsZScsICdzeXN0ZW1sYW5ndWFnZScsICd0YWJpbmRleCcsICd0YWJsZXZhbHVlcycsICd0YXJnZXR4JywgJ3RhcmdldHknLCAndHJhbnNmb3JtJywgJ3RyYW5zZm9ybS1vcmlnaW4nLCAndGV4dC1hbmNob3InLCAndGV4dC1kZWNvcmF0aW9uJywgJ3RleHQtb3JpZW50YXRpb24nLCAndGV4dC1yZW5kZXJpbmcnLCAndGV4dGxlbmd0aCcsICd0eXBlJywgJ3UxJywgJ3UyJywgJ3VuaWNvZGUnLCAndmFsdWVzJywgJ3ZpZXdib3gnLCAndmlzaWJpbGl0eScsICd2ZXJzaW9uJywgJ3ZlcnQtYWR2LXknLCAndmVydC1vcmlnaW4teCcsICd2ZXJ0LW9yaWdpbi15JywgJ3dpZHRoJywgJ3dvcmQtc3BhY2luZycsICd3cmFwJywgJ3dyaXRpbmctbW9kZScsICd4Y2hhbm5lbHNlbGVjdG9yJywgJ3ljaGFubmVsc2VsZWN0b3InLCAneCcsICd4MScsICd4MicsICd4bWxucycsICd5JywgJ3kxJywgJ3kyJywgJ3onLCAnem9vbWFuZHBhbiddKTtcbmNvbnN0IG1hdGhNbCA9IGZyZWV6ZShbJ2FjY2VudCcsICdhY2NlbnR1bmRlcicsICdhbGlnbicsICdiZXZlbGxlZCcsICdjbG9zZScsICdjb2x1bW5hbGlnbicsICdjb2x1bW5saW5lcycsICdjb2x1bW5zcGFjaW5nJywgJ2NvbHVtbnNwYW4nLCAnZGVub21hbGlnbicsICdkZXB0aCcsICdkaXInLCAnZGlzcGxheScsICdkaXNwbGF5c3R5bGUnLCAnZW5jb2RpbmcnLCAnZmVuY2UnLCAnZnJhbWUnLCAnaGVpZ2h0JywgJ2hyZWYnLCAnaWQnLCAnbGFyZ2VvcCcsICdsZW5ndGgnLCAnbGluZXRoaWNrbmVzcycsICdscXVvdGUnLCAnbHNwYWNlJywgJ21hdGhiYWNrZ3JvdW5kJywgJ21hdGhjb2xvcicsICdtYXRoc2l6ZScsICdtYXRodmFyaWFudCcsICdtYXhzaXplJywgJ21pbnNpemUnLCAnbW92YWJsZWxpbWl0cycsICdub3RhdGlvbicsICdudW1hbGlnbicsICdvcGVuJywgJ3Jvd2FsaWduJywgJ3Jvd2xpbmVzJywgJ3Jvd3NwYWNpbmcnLCAncm93c3BhbicsICdyc3BhY2UnLCAncnF1b3RlJywgJ3NjcmlwdGxldmVsJywgJ3NjcmlwdG1pbnNpemUnLCAnc2NyaXB0c2l6ZW11bHRpcGxpZXInLCAnc2VsZWN0aW9uJywgJ3NlcGFyYXRvcicsICdzZXBhcmF0b3JzJywgJ3N0cmV0Y2h5JywgJ3N1YnNjcmlwdHNoaWZ0JywgJ3N1cHNjcmlwdHNoaWZ0JywgJ3N5bW1ldHJpYycsICd2b2Zmc2V0JywgJ3dpZHRoJywgJ3htbG5zJ10pO1xuY29uc3QgeG1sID0gZnJlZXplKFsneGxpbms6aHJlZicsICd4bWw6aWQnLCAneGxpbms6dGl0bGUnLCAneG1sOnNwYWNlJywgJ3htbG5zOnhsaW5rJ10pO1xuXG5jb25zdCBNVVNUQUNIRV9FWFBSID0gc2VhbCgve3tbXFx3XFxXXSp8XltcXHdcXFddKn19L2cpO1xuY29uc3QgRVJCX0VYUFIgPSBzZWFsKC88JVtcXHdcXFddKnxeW1xcd1xcV10qJT4vZyk7XG5jb25zdCBUTVBMSVRfRVhQUiA9IHNlYWwoL1xcJHtbXFx3XFxXXSovZyk7XG5jb25zdCBEQVRBX0FUVFIgPSBzZWFsKC9eZGF0YS1bXFwtXFx3LlxcdTAwQjctXFx1RkZGRl0rJC8pOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVzZWxlc3MtZXNjYXBlXG5jb25zdCBBUklBX0FUVFIgPSBzZWFsKC9eYXJpYS1bXFwtXFx3XSskLyk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdXNlbGVzcy1lc2NhcGVcbmNvbnN0IElTX0FMTE9XRURfVVJJID0gc2VhbCgvXig/Oig/Oig/OmZ8aHQpdHBzP3xtYWlsdG98dGVsfGNhbGx0b3xzbXN8Y2lkfHhtcHB8bWF0cml4KTp8W15hLXpdfFthLXorLlxcLV0rKD86W15hLXorLlxcLTpdfCQpKS9pIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdXNlbGVzcy1lc2NhcGVcbik7XG5jb25zdCBJU19TQ1JJUFRfT1JfREFUQSA9IHNlYWwoL14oPzpcXHcrc2NyaXB0fGRhdGEpOi9pKTtcbmNvbnN0IEFUVFJfV0hJVEVTUEFDRSA9IHNlYWwoL1tcXHUwMDAwLVxcdTAwMjBcXHUwMEEwXFx1MTY4MFxcdTE4MEVcXHUyMDAwLVxcdTIwMjlcXHUyMDVGXFx1MzAwMF0vZyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLWNvbnRyb2wtcmVnZXhcbik7XG5jb25zdCBET0NUWVBFX05BTUUgPSBzZWFsKC9eaHRtbCQvaSk7XG5jb25zdCBDVVNUT01fRUxFTUVOVCA9IHNlYWwoL15bYS16XVsuXFx3XSooLVsuXFx3XSspKyQvaSk7XG4vLyBNYXJrdXAtc2lnbmlmaWNhbnQgY2hhcmFjdGVyIHByb2JlcyB1c2VkIGJ5IF9zYW5pdGl6ZUVsZW1lbnRzLlxuLy8gU2hhcmVkIG1vZHVsZS1sZXZlbCBpbnN0YW5jZXMgYXJlIHNhZmUgZGVzcGl0ZSB0aGUgc3RpY2t5IC9nIGZsYWdzOlxuLy8gdW5hcHBseSgpIHJlc2V0cyBsYXN0SW5kZXggZm9yIFJlZ0V4cCByZWNlaXZlcnMgYmVmb3JlIGV2ZXJ5IGNhbGwuXG5jb25zdCBFTEVNRU5UX01BUktVUF9QUk9CRSA9IHNlYWwoLzxbL1xcdyFdL2cpO1xuY29uc3QgQ09NTUVOVF9NQVJLVVBfUFJPQkUgPSBzZWFsKC88Wy9cXHddL2cpO1xuY29uc3QgRkFMTEJBQ0tfVEFHX0NMT1NFID0gc2VhbCgvPFxcL25vKHNjcmlwdHxlbWJlZHxmcmFtZXMpL2kpO1xuY29uc3QgU0VMRl9DTE9TSU5HX1RBRyA9IHNlYWwoL1xcLz4vaSk7XG5cbi8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9Ob2RlL25vZGVUeXBlXG5jb25zdCBOT0RFX1RZUEUgPSB7XG4gIGVsZW1lbnQ6IDEsXG4gIGF0dHJpYnV0ZTogMixcbiAgdGV4dDogMyxcbiAgY2RhdGFTZWN0aW9uOiA0LFxuICBlbnRpdHlSZWZlcmVuY2U6IDUsXG4gIC8vIERlcHJlY2F0ZWRcbiAgZW50aXR5Tm9kZTogNixcbiAgLy8gRGVwcmVjYXRlZFxuICBwcm9jZXNzaW5nSW5zdHJ1Y3Rpb246IDcsXG4gIGNvbW1lbnQ6IDgsXG4gIGRvY3VtZW50OiA5LFxuICBkb2N1bWVudFR5cGU6IDEwLFxuICBkb2N1bWVudEZyYWdtZW50OiAxMSxcbiAgbm90YXRpb246IDEyIC8vIERlcHJlY2F0ZWRcbn07XG5jb25zdCBnZXRHbG9iYWwgPSBmdW5jdGlvbiBnZXRHbG9iYWwoKSB7XG4gIHJldHVybiB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IG51bGwgOiB3aW5kb3c7XG59O1xuLyoqXG4gKiBDcmVhdGVzIGEgbm8tb3AgcG9saWN5IGZvciBpbnRlcm5hbCB1c2Ugb25seS5cbiAqIERvbid0IGV4cG9ydCB0aGlzIGZ1bmN0aW9uIG91dHNpZGUgdGhpcyBtb2R1bGUhXG4gKiBAcGFyYW0gdHJ1c3RlZFR5cGVzIFRoZSBwb2xpY3kgZmFjdG9yeS5cbiAqIEBwYXJhbSBwdXJpZnlIb3N0RWxlbWVudCBUaGUgU2NyaXB0IGVsZW1lbnQgdXNlZCB0byBsb2FkIERPTVB1cmlmeSAodG8gZGV0ZXJtaW5lIHBvbGljeSBuYW1lIHN1ZmZpeCkuXG4gKiBAcmV0dXJuIFRoZSBwb2xpY3kgY3JlYXRlZCAob3IgbnVsbCwgaWYgVHJ1c3RlZCBUeXBlc1xuICogYXJlIG5vdCBzdXBwb3J0ZWQgb3IgY3JlYXRpbmcgdGhlIHBvbGljeSBmYWlsZWQpLlxuICovXG5jb25zdCBfY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5ID0gZnVuY3Rpb24gX2NyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSh0cnVzdGVkVHlwZXMsIHB1cmlmeUhvc3RFbGVtZW50KSB7XG4gIGlmICh0eXBlb2YgdHJ1c3RlZFR5cGVzICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgdHJ1c3RlZFR5cGVzLmNyZWF0ZVBvbGljeSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIC8vIEFsbG93IHRoZSBjYWxsZXJzIHRvIGNvbnRyb2wgdGhlIHVuaXF1ZSBwb2xpY3kgbmFtZVxuICAvLyBieSBhZGRpbmcgYSBkYXRhLXR0LXBvbGljeS1zdWZmaXggdG8gdGhlIHNjcmlwdCBlbGVtZW50IHdpdGggdGhlIERPTVB1cmlmeS5cbiAgLy8gUG9saWN5IGNyZWF0aW9uIHdpdGggZHVwbGljYXRlIG5hbWVzIHRocm93cyBpbiBUcnVzdGVkIFR5cGVzLlxuICBsZXQgc3VmZml4ID0gbnVsbDtcbiAgY29uc3QgQVRUUl9OQU1FID0gJ2RhdGEtdHQtcG9saWN5LXN1ZmZpeCc7XG4gIGlmIChwdXJpZnlIb3N0RWxlbWVudCAmJiBwdXJpZnlIb3N0RWxlbWVudC5oYXNBdHRyaWJ1dGUoQVRUUl9OQU1FKSkge1xuICAgIHN1ZmZpeCA9IHB1cmlmeUhvc3RFbGVtZW50LmdldEF0dHJpYnV0ZShBVFRSX05BTUUpO1xuICB9XG4gIGNvbnN0IHBvbGljeU5hbWUgPSAnZG9tcHVyaWZ5JyArIChzdWZmaXggPyAnIycgKyBzdWZmaXggOiAnJyk7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHRydXN0ZWRUeXBlcy5jcmVhdGVQb2xpY3kocG9saWN5TmFtZSwge1xuICAgICAgY3JlYXRlSFRNTChodG1sKSB7XG4gICAgICAgIHJldHVybiBodG1sO1xuICAgICAgfSxcbiAgICAgIGNyZWF0ZVNjcmlwdFVSTChzY3JpcHRVcmwpIHtcbiAgICAgICAgcmV0dXJuIHNjcmlwdFVybDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSBjYXRjaCAoXykge1xuICAgIC8vIFBvbGljeSBjcmVhdGlvbiBmYWlsZWQgKG1vc3QgbGlrZWx5IGFub3RoZXIgRE9NUHVyaWZ5IHNjcmlwdCBoYXNcbiAgICAvLyBhbHJlYWR5IHJ1bikuIFNraXAgY3JlYXRpbmcgdGhlIHBvbGljeSwgYXMgdGhpcyB3aWxsIG9ubHkgY2F1c2UgZXJyb3JzXG4gICAgLy8gaWYgVFQgYXJlIGVuZm9yY2VkLlxuICAgIGNvbnNvbGUud2FybignVHJ1c3RlZFR5cGVzIHBvbGljeSAnICsgcG9saWN5TmFtZSArICcgY291bGQgbm90IGJlIGNyZWF0ZWQuJyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn07XG5jb25zdCBfY3JlYXRlSG9va3NNYXAgPSBmdW5jdGlvbiBfY3JlYXRlSG9va3NNYXAoKSB7XG4gIHJldHVybiB7XG4gICAgYWZ0ZXJTYW5pdGl6ZUF0dHJpYnV0ZXM6IFtdLFxuICAgIGFmdGVyU2FuaXRpemVFbGVtZW50czogW10sXG4gICAgYWZ0ZXJTYW5pdGl6ZVNoYWRvd0RPTTogW10sXG4gICAgYmVmb3JlU2FuaXRpemVBdHRyaWJ1dGVzOiBbXSxcbiAgICBiZWZvcmVTYW5pdGl6ZUVsZW1lbnRzOiBbXSxcbiAgICBiZWZvcmVTYW5pdGl6ZVNoYWRvd0RPTTogW10sXG4gICAgdXBvblNhbml0aXplQXR0cmlidXRlOiBbXSxcbiAgICB1cG9uU2FuaXRpemVFbGVtZW50OiBbXSxcbiAgICB1cG9uU2FuaXRpemVTaGFkb3dOb2RlOiBbXVxuICB9O1xufTtcbi8qKlxuICogUmVzb2x2ZSBhIHNldC12YWx1ZWQgY29uZmlndXJhdGlvbiBvcHRpb246IGEgZnJlc2ggc2V0IGJ1aWx0IGZyb21cbiAqIGNmZ1trZXldIHdoZW4gaXQgaXMgYW4gb3duIGFycmF5IHByb3BlcnR5IChzZWVkZWQgd2l0aCBhIGNsb25lIG9mXG4gKiBvcHRpb25zLmJhc2Ugd2hlbiBnaXZlbiwgY2FzZS1ub3JtYWxpemVkIHZpYSBvcHRpb25zLnRyYW5zZm9ybSksXG4gKiB0aGUgZmFsbGJhY2sgc2V0IG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0gY2ZnIHRoZSBjbG9uZWQsIHByb3RvdHlwZS1mcmVlIGNvbmZpZ3VyYXRpb24gb2JqZWN0XG4gKiBAcGFyYW0ga2V5IHRoZSBjb25maWd1cmF0aW9uIHByb3BlcnR5IHRvIHJlYWRcbiAqIEBwYXJhbSBmYWxsYmFjayB0aGUgc2V0IHRvIHVzZSB3aGVuIHRoZSBvcHRpb24gaXMgYWJzZW50IG9yIG5vdCBhbiBhcnJheVxuICogQHBhcmFtIG9wdGlvbnMgdHJhbnNmb3JtIGFuZCBvcHRpb25hbCBiYXNlIHNldCB0byBtZXJnZSBpbnRvXG4gKiBAcmV0dXJucyB0aGUgcmVzb2x2ZWQgc2V0XG4gKi9cbmNvbnN0IF9yZXNvbHZlU2V0T3B0aW9uID0gZnVuY3Rpb24gX3Jlc29sdmVTZXRPcHRpb24oY2ZnLCBrZXksIGZhbGxiYWNrLCBvcHRpb25zKSB7XG4gIHJldHVybiBvYmplY3RIYXNPd25Qcm9wZXJ0eShjZmcsIGtleSkgJiYgYXJyYXlJc0FycmF5KGNmZ1trZXldKSA/IGFkZFRvU2V0KG9wdGlvbnMuYmFzZSA/IGNsb25lKG9wdGlvbnMuYmFzZSkgOiB7fSwgY2ZnW2tleV0sIG9wdGlvbnMudHJhbnNmb3JtKSA6IGZhbGxiYWNrO1xufTtcbmZ1bmN0aW9uIGNyZWF0ZURPTVB1cmlmeSgpIHtcbiAgbGV0IHdpbmRvdyA9IGFyZ3VtZW50cy5sZW5ndGggPiAwICYmIGFyZ3VtZW50c1swXSAhPT0gdW5kZWZpbmVkID8gYXJndW1lbnRzWzBdIDogZ2V0R2xvYmFsKCk7XG4gIGNvbnN0IERPTVB1cmlmeSA9IHJvb3QgPT4gY3JlYXRlRE9NUHVyaWZ5KHJvb3QpO1xuICBET01QdXJpZnkudmVyc2lvbiA9ICczLjQuMTInO1xuICBET01QdXJpZnkucmVtb3ZlZCA9IFtdO1xuICBpZiAoIXdpbmRvdyB8fCAhd2luZG93LmRvY3VtZW50IHx8IHdpbmRvdy5kb2N1bWVudC5ub2RlVHlwZSAhPT0gTk9ERV9UWVBFLmRvY3VtZW50IHx8ICF3aW5kb3cuRWxlbWVudCkge1xuICAgIC8vIE5vdCBydW5uaW5nIGluIGEgYnJvd3NlciwgcHJvdmlkZSBhIGZhY3RvcnkgZnVuY3Rpb25cbiAgICAvLyBzbyB0aGF0IHlvdSBjYW4gcGFzcyB5b3VyIG93biBXaW5kb3dcbiAgICBET01QdXJpZnkuaXNTdXBwb3J0ZWQgPSBmYWxzZTtcbiAgICByZXR1cm4gRE9NUHVyaWZ5O1xuICB9XG4gIGxldCBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcbiAgY29uc3Qgb3JpZ2luYWxEb2N1bWVudCA9IGRvY3VtZW50O1xuICBjb25zdCBjdXJyZW50U2NyaXB0ID0gb3JpZ2luYWxEb2N1bWVudC5jdXJyZW50U2NyaXB0O1xuICB3aW5kb3cuRG9jdW1lbnRGcmFnbWVudDtcbiAgICBjb25zdCBIVE1MVGVtcGxhdGVFbGVtZW50ID0gd2luZG93LkhUTUxUZW1wbGF0ZUVsZW1lbnQsXG4gICAgTm9kZSA9IHdpbmRvdy5Ob2RlLFxuICAgIEVsZW1lbnQgPSB3aW5kb3cuRWxlbWVudCxcbiAgICBOb2RlRmlsdGVyID0gd2luZG93Lk5vZGVGaWx0ZXIsXG4gICAgX3dpbmRvdyROYW1lZE5vZGVNYXAgPSB3aW5kb3cuTmFtZWROb2RlTWFwO1xuICAgIF93aW5kb3ckTmFtZWROb2RlTWFwID09PSB2b2lkIDAgPyB3aW5kb3cuTmFtZWROb2RlTWFwIHx8IHdpbmRvdy5Nb3pOYW1lZEF0dHJNYXAgOiBfd2luZG93JE5hbWVkTm9kZU1hcDtcbiAgICB3aW5kb3cuSFRNTEZvcm1FbGVtZW50O1xuICAgIGNvbnN0IERPTVBhcnNlciA9IHdpbmRvdy5ET01QYXJzZXIsXG4gICAgdHJ1c3RlZFR5cGVzID0gd2luZG93LnRydXN0ZWRUeXBlcztcbiAgY29uc3QgRWxlbWVudFByb3RvdHlwZSA9IEVsZW1lbnQucHJvdG90eXBlO1xuICBjb25zdCBjbG9uZU5vZGUgPSBsb29rdXBHZXR0ZXIoRWxlbWVudFByb3RvdHlwZSwgJ2Nsb25lTm9kZScpO1xuICBjb25zdCByZW1vdmUgPSBsb29rdXBHZXR0ZXIoRWxlbWVudFByb3RvdHlwZSwgJ3JlbW92ZScpO1xuICBjb25zdCBnZXROZXh0U2libGluZyA9IGxvb2t1cEdldHRlcihFbGVtZW50UHJvdG90eXBlLCAnbmV4dFNpYmxpbmcnKTtcbiAgY29uc3QgZ2V0Q2hpbGROb2RlcyA9IGxvb2t1cEdldHRlcihFbGVtZW50UHJvdG90eXBlLCAnY2hpbGROb2RlcycpO1xuICBjb25zdCBnZXRQYXJlbnROb2RlID0gbG9va3VwR2V0dGVyKEVsZW1lbnRQcm90b3R5cGUsICdwYXJlbnROb2RlJyk7XG4gIGNvbnN0IGdldFNoYWRvd1Jvb3QgPSBsb29rdXBHZXR0ZXIoRWxlbWVudFByb3RvdHlwZSwgJ3NoYWRvd1Jvb3QnKTtcbiAgY29uc3QgZ2V0QXR0cmlidXRlcyA9IGxvb2t1cEdldHRlcihFbGVtZW50UHJvdG90eXBlLCAnYXR0cmlidXRlcycpO1xuICBjb25zdCBnZXROb2RlVHlwZSA9IE5vZGUgJiYgTm9kZS5wcm90b3R5cGUgPyBsb29rdXBHZXR0ZXIoTm9kZS5wcm90b3R5cGUsICdub2RlVHlwZScpIDogbnVsbDtcbiAgY29uc3QgZ2V0Tm9kZU5hbWUgPSBOb2RlICYmIE5vZGUucHJvdG90eXBlID8gbG9va3VwR2V0dGVyKE5vZGUucHJvdG90eXBlLCAnbm9kZU5hbWUnKSA6IG51bGw7XG4gIC8vIEFzIHBlciBpc3N1ZSAjNDcsIHRoZSB3ZWItY29tcG9uZW50cyByZWdpc3RyeSBpcyBpbmhlcml0ZWQgYnkgYVxuICAvLyBuZXcgZG9jdW1lbnQgY3JlYXRlZCB2aWEgY3JlYXRlSFRNTERvY3VtZW50LiBBcyBwZXIgdGhlIHNwZWNcbiAgLy8gKGh0dHA6Ly93M2MuZ2l0aHViLmlvL3dlYmNvbXBvbmVudHMvc3BlYy9jdXN0b20vI2NyZWF0aW5nLWFuZC1wYXNzaW5nLXJlZ2lzdHJpZXMpXG4gIC8vIGEgbmV3IGVtcHR5IHJlZ2lzdHJ5IGlzIHVzZWQgd2hlbiBjcmVhdGluZyBhIHRlbXBsYXRlIGNvbnRlbnRzIG93bmVyXG4gIC8vIGRvY3VtZW50LCBzbyB3ZSB1c2UgdGhhdCBhcyBvdXIgcGFyZW50IGRvY3VtZW50IHRvIGVuc3VyZSBub3RoaW5nXG4gIC8vIGlzIGluaGVyaXRlZC5cbiAgaWYgKHR5cGVvZiBIVE1MVGVtcGxhdGVFbGVtZW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY29uc3QgdGVtcGxhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZW1wbGF0ZScpO1xuICAgIGlmICh0ZW1wbGF0ZS5jb250ZW50ICYmIHRlbXBsYXRlLmNvbnRlbnQub3duZXJEb2N1bWVudCkge1xuICAgICAgZG9jdW1lbnQgPSB0ZW1wbGF0ZS5jb250ZW50Lm93bmVyRG9jdW1lbnQ7XG4gICAgfVxuICB9XG4gIGxldCB0cnVzdGVkVHlwZXNQb2xpY3k7XG4gIGxldCBlbXB0eUhUTUwgPSAnJztcbiAgLy8gVGhlIGluc3RhbmNlJ3Mgb3duIGludGVybmFsIFRydXN0ZWQgVHlwZXMgcG9saWN5LiBVbmxpa2UgYSBjYWxsZXItc3VwcGxpZWRcbiAgLy8gYFRSVVNURURfVFlQRVNfUE9MSUNZYCwgdGhpcyBpcyBjcmVhdGVkIGF0IG1vc3Qgb25jZSDigJQgVHJ1c3RlZCBUeXBlcyB0aHJvd3NcbiAgLy8gb24gZHVwbGljYXRlIHBvbGljeSBuYW1lcyDigJQgYW5kIGlzIHRoZSBvbmx5IHBvbGljeSBhbGxvd2VkIHRvIHBlcnNpc3RcbiAgLy8gYWNyb3NzIGNvbmZpZ3VyYXRpb25zIGFuZCBzdXJ2aXZlIGBjbGVhckNvbmZpZygpYC5cbiAgbGV0IGRlZmF1bHRUcnVzdGVkVHlwZXNQb2xpY3k7XG4gIGxldCBkZWZhdWx0VHJ1c3RlZFR5cGVzUG9saWN5UmVzb2x2ZWQgPSBmYWxzZTtcbiAgLy8gVHJhY2tzIHdoZXRoZXIgd2UgYXJlIGFscmVhZHkgaW5zaWRlIGEgY2FsbCB0byB0aGUgY29uZmlndXJlZCBUcnVzdGVkIFR5cGVzXG4gIC8vIHBvbGljeSAoYGNyZWF0ZUhUTUxgIG9yIGBjcmVhdGVTY3JpcHRVUkxgKS4gSWYgYSBzdXBwbGllZCBwb2xpY3kgY2FsbGJhY2tcbiAgLy8gaXRzZWxmIGNhbGxzIGBET01QdXJpZnkuc2FuaXRpemVgICh0aGUgY2F1c2Ugb2YgIzE0MjIpLCBgc2FuaXRpemVgIHdvdWxkXG4gIC8vIHJlLWVudGVyIHRoZSBwb2xpY3kgYW5kIHJlY3Vyc2UgdW50aWwgdGhlIHN0YWNrIG92ZXJmbG93cy4gV2UgZGV0ZWN0IHRoYXRcbiAgLy8gcmUtZW50cnkgYW5kIHRocm93IGEgY2xlYXIsIGFjdGlvbmFibGUgZXJyb3IgaW5zdGVhZC4gVGhlIGd1YXJkIGlzIHNoYXJlZFxuICAvLyBhY3Jvc3MgYm90aCBjYWxsYmFja3MsIGJlY2F1c2UgZWl0aGVyIG9uZSByZS1lbnRlcmluZyBgc2FuaXRpemVgIHRyaWdnZXJzXG4gIC8vIHRoZSBzYW1lIHVuYm91bmRlZCByZWN1cnNpb24uXG4gIGxldCBJTl9UUlVTVEVEX1RZUEVTX1BPTElDWSA9IDA7XG4gIGNvbnN0IF9hc3NlcnROb3RJblRydXN0ZWRUeXBlc1BvbGljeSA9IGZ1bmN0aW9uIF9hc3NlcnROb3RJblRydXN0ZWRUeXBlc1BvbGljeSgpIHtcbiAgICBpZiAoSU5fVFJVU1RFRF9UWVBFU19QT0xJQ1kgPiAwKSB7XG4gICAgICB0aHJvdyB0eXBlRXJyb3JDcmVhdGUoJ0EgY29uZmlndXJlZCBUUlVTVEVEX1RZUEVTX1BPTElDWSBjYWxsYmFjayAoY3JlYXRlSFRNTCBvciAnICsgJ2NyZWF0ZVNjcmlwdFVSTCkgbXVzdCBub3QgY2FsbCBET01QdXJpZnkuc2FuaXRpemUsIGFzIHRoYXQgY2F1c2VzICcgKyAnaW5maW5pdGUgcmVjdXJzaW9uLiBEbyBub3QgcGFzcyBhIHBvbGljeSB3aG9zZSBjYWxsYmFja3Mgd3JhcCAnICsgJ0RPTVB1cmlmeSBhcyBUUlVTVEVEX1RZUEVTX1BPTElDWTsgc2VlIHRoZSBcIkRPTVB1cmlmeSBhbmQgVHJ1c3RlZCAnICsgJ1R5cGVzXCIgc2VjdGlvbiBvZiB0aGUgUkVBRE1FLicpO1xuICAgIH1cbiAgfTtcbiAgY29uc3QgX2NyZWF0ZVRydXN0ZWRIVE1MID0gZnVuY3Rpb24gX2NyZWF0ZVRydXN0ZWRIVE1MKGh0bWwpIHtcbiAgICBfYXNzZXJ0Tm90SW5UcnVzdGVkVHlwZXNQb2xpY3koKTtcbiAgICBJTl9UUlVTVEVEX1RZUEVTX1BPTElDWSsrO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gdHJ1c3RlZFR5cGVzUG9saWN5LmNyZWF0ZUhUTUwoaHRtbCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIElOX1RSVVNURURfVFlQRVNfUE9MSUNZLS07XG4gICAgfVxuICB9O1xuICBjb25zdCBfY3JlYXRlVHJ1c3RlZFNjcmlwdFVSTCA9IGZ1bmN0aW9uIF9jcmVhdGVUcnVzdGVkU2NyaXB0VVJMKHNjcmlwdFVybCkge1xuICAgIF9hc3NlcnROb3RJblRydXN0ZWRUeXBlc1BvbGljeSgpO1xuICAgIElOX1RSVVNURURfVFlQRVNfUE9MSUNZKys7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiB0cnVzdGVkVHlwZXNQb2xpY3kuY3JlYXRlU2NyaXB0VVJMKHNjcmlwdFVybCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIElOX1RSVVNURURfVFlQRVNfUE9MSUNZLS07XG4gICAgfVxuICB9O1xuICAvLyBMYXppbHkgcmVzb2x2ZSAoYW5kIGNhY2hlKSB0aGUgaW5zdGFuY2UncyBpbnRlcm5hbCBkZWZhdWx0IHBvbGljeS5cbiAgLy8gUmVzb2x1dGlvbiBpcyBhdHRlbXB0ZWQgYXQgbW9zdCBvbmNlOiBhIHN1Y2Nlc3NmdWwgYGNyZWF0ZVBvbGljeWAgY2Fubm90IGJlXG4gIC8vIHJlcGVhdGVkIChUcnVzdGVkIFR5cGVzIHRocm93cyBvbiBkdXBsaWNhdGUgbmFtZXMpLCBhbmQgYSBmYWlsZWQgb3JcbiAgLy8gdW5zdXBwb3J0ZWQgYXR0ZW1wdCBtdXN0IG5vdCBiZSByZXRyaWVkIG9uIGV2ZXJ5IHBhcnNlLlxuICBjb25zdCBfZ2V0RGVmYXVsdFRydXN0ZWRUeXBlc1BvbGljeSA9IGZ1bmN0aW9uIF9nZXREZWZhdWx0VHJ1c3RlZFR5cGVzUG9saWN5KCkge1xuICAgIGlmICghZGVmYXVsdFRydXN0ZWRUeXBlc1BvbGljeVJlc29sdmVkKSB7XG4gICAgICBkZWZhdWx0VHJ1c3RlZFR5cGVzUG9saWN5ID0gX2NyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSh0cnVzdGVkVHlwZXMsIGN1cnJlbnRTY3JpcHQpO1xuICAgICAgZGVmYXVsdFRydXN0ZWRUeXBlc1BvbGljeVJlc29sdmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGRlZmF1bHRUcnVzdGVkVHlwZXNQb2xpY3k7XG4gIH07XG4gIGNvbnN0IF9kb2N1bWVudCA9IGRvY3VtZW50LFxuICAgIGltcGxlbWVudGF0aW9uID0gX2RvY3VtZW50LmltcGxlbWVudGF0aW9uLFxuICAgIGNyZWF0ZU5vZGVJdGVyYXRvciA9IF9kb2N1bWVudC5jcmVhdGVOb2RlSXRlcmF0b3IsXG4gICAgY3JlYXRlRG9jdW1lbnRGcmFnbWVudCA9IF9kb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50LFxuICAgIGdldEVsZW1lbnRzQnlUYWdOYW1lID0gX2RvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lO1xuICBjb25zdCBpbXBvcnROb2RlID0gb3JpZ2luYWxEb2N1bWVudC5pbXBvcnROb2RlO1xuICBsZXQgaG9va3MgPSBfY3JlYXRlSG9va3NNYXAoKTtcbiAgLyoqXG4gICAqIEV4cG9zZSB3aGV0aGVyIHRoaXMgYnJvd3NlciBzdXBwb3J0cyBydW5uaW5nIHRoZSBmdWxsIERPTVB1cmlmeS5cbiAgICovXG4gIERPTVB1cmlmeS5pc1N1cHBvcnRlZCA9IHR5cGVvZiBlbnRyaWVzID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBnZXRQYXJlbnROb2RlID09PSAnZnVuY3Rpb24nICYmIGltcGxlbWVudGF0aW9uICYmIGltcGxlbWVudGF0aW9uLmNyZWF0ZUhUTUxEb2N1bWVudCAhPT0gdW5kZWZpbmVkO1xuICBjb25zdCBNVVNUQUNIRV9FWFBSJDEgPSBNVVNUQUNIRV9FWFBSLFxuICAgIEVSQl9FWFBSJDEgPSBFUkJfRVhQUixcbiAgICBUTVBMSVRfRVhQUiQxID0gVE1QTElUX0VYUFIsXG4gICAgREFUQV9BVFRSJDEgPSBEQVRBX0FUVFIsXG4gICAgQVJJQV9BVFRSJDEgPSBBUklBX0FUVFIsXG4gICAgSVNfU0NSSVBUX09SX0RBVEEkMSA9IElTX1NDUklQVF9PUl9EQVRBLFxuICAgIEFUVFJfV0hJVEVTUEFDRSQxID0gQVRUUl9XSElURVNQQUNFLFxuICAgIENVU1RPTV9FTEVNRU5UJDEgPSBDVVNUT01fRUxFTUVOVDtcbiAgbGV0IElTX0FMTE9XRURfVVJJJDEgPSBJU19BTExPV0VEX1VSSTtcbiAgLyoqXG4gICAqIFdlIGNvbnNpZGVyIHRoZSBlbGVtZW50cyBhbmQgYXR0cmlidXRlcyBiZWxvdyB0byBiZSBzYWZlLiBJZGVhbGx5XG4gICAqIGRvbid0IGFkZCBhbnkgbmV3IG9uZXMgYnV0IGZlZWwgZnJlZSB0byByZW1vdmUgdW53YW50ZWQgb25lcy5cbiAgICovXG4gIC8qIGFsbG93ZWQgZWxlbWVudCBuYW1lcyAqL1xuICBsZXQgQUxMT1dFRF9UQUdTID0gbnVsbDtcbiAgY29uc3QgREVGQVVMVF9BTExPV0VEX1RBR1MgPSBhZGRUb1NldCh7fSwgWy4uLmh0bWwkMSwgLi4uc3ZnJDEsIC4uLnN2Z0ZpbHRlcnMsIC4uLm1hdGhNbCQxLCAuLi50ZXh0XSk7XG4gIC8qIEFsbG93ZWQgYXR0cmlidXRlIG5hbWVzICovXG4gIGxldCBBTExPV0VEX0FUVFIgPSBudWxsO1xuICBjb25zdCBERUZBVUxUX0FMTE9XRURfQVRUUiA9IGFkZFRvU2V0KHt9LCBbLi4uaHRtbCwgLi4uc3ZnLCAuLi5tYXRoTWwsIC4uLnhtbF0pO1xuICAvKlxuICAgKiBDb25maWd1cmUgaG93IERPTVB1cmlmeSBzaG91bGQgaGFuZGxlIGN1c3RvbSBlbGVtZW50cyBhbmQgdGhlaXIgYXR0cmlidXRlcyBhcyB3ZWxsIGFzIGN1c3RvbWl6ZWQgYnVpbHQtaW4gZWxlbWVudHMuXG4gICAqIEBwcm9wZXJ0eSB7UmVnRXhwfEZ1bmN0aW9ufG51bGx9IHRhZ05hbWVDaGVjayBvbmUgb2YgW251bGwsIHJlZ2V4UGF0dGVybiwgcHJlZGljYXRlXS4gRGVmYXVsdDogYG51bGxgIChkaXNhbGxvdyBhbnkgY3VzdG9tIGVsZW1lbnRzKVxuICAgKiBAcHJvcGVydHkge1JlZ0V4cHxGdW5jdGlvbnxudWxsfSBhdHRyaWJ1dGVOYW1lQ2hlY2sgb25lIG9mIFtudWxsLCByZWdleFBhdHRlcm4sIHByZWRpY2F0ZV0uIERlZmF1bHQ6IGBudWxsYCAoZGlzYWxsb3cgYW55IGF0dHJpYnV0ZXMgbm90IG9uIHRoZSBhbGxvdyBsaXN0KVxuICAgKiBAcHJvcGVydHkge2Jvb2xlYW59IGFsbG93Q3VzdG9taXplZEJ1aWx0SW5FbGVtZW50cyBhbGxvdyBjdXN0b20gZWxlbWVudHMgZGVyaXZlZCBmcm9tIGJ1aWx0LWlucyBpZiB0aGV5IHBhc3MgQ1VTVE9NX0VMRU1FTlRfSEFORExJTkcudGFnTmFtZUNoZWNrLiBEZWZhdWx0OiBgZmFsc2VgLlxuICAgKi9cbiAgbGV0IENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HID0gT2JqZWN0LnNlYWwoY3JlYXRlKG51bGwsIHtcbiAgICB0YWdOYW1lQ2hlY2s6IHtcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICB2YWx1ZTogbnVsbFxuICAgIH0sXG4gICAgYXR0cmlidXRlTmFtZUNoZWNrOiB7XG4gICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgdmFsdWU6IG51bGxcbiAgICB9LFxuICAgIGFsbG93Q3VzdG9taXplZEJ1aWx0SW5FbGVtZW50czoge1xuICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgIHZhbHVlOiBmYWxzZVxuICAgIH1cbiAgfSkpO1xuICAvKiBFeHBsaWNpdGx5IGZvcmJpZGRlbiB0YWdzIChvdmVycmlkZXMgQUxMT1dFRF9UQUdTL0FERF9UQUdTKSAqL1xuICBsZXQgRk9SQklEX1RBR1MgPSBudWxsO1xuICAvKiBFeHBsaWNpdGx5IGZvcmJpZGRlbiBhdHRyaWJ1dGVzIChvdmVycmlkZXMgQUxMT1dFRF9BVFRSL0FERF9BVFRSKSAqL1xuICBsZXQgRk9SQklEX0FUVFIgPSBudWxsO1xuICAvKiBDb25maWcgb2JqZWN0IHRvIHN0b3JlIEFERF9UQUdTL0FERF9BVFRSIGZ1bmN0aW9ucyAod2hlbiB1c2VkIGFzIGZ1bmN0aW9ucykgKi9cbiAgY29uc3QgRVhUUkFfRUxFTUVOVF9IQU5ETElORyA9IE9iamVjdC5zZWFsKGNyZWF0ZShudWxsLCB7XG4gICAgdGFnQ2hlY2s6IHtcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICB2YWx1ZTogbnVsbFxuICAgIH0sXG4gICAgYXR0cmlidXRlQ2hlY2s6IHtcbiAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICB2YWx1ZTogbnVsbFxuICAgIH1cbiAgfSkpO1xuICAvKiBEZWNpZGUgaWYgQVJJQSBhdHRyaWJ1dGVzIGFyZSBva2F5ICovXG4gIGxldCBBTExPV19BUklBX0FUVFIgPSB0cnVlO1xuICAvKiBEZWNpZGUgaWYgY3VzdG9tIGRhdGEgYXR0cmlidXRlcyBhcmUgb2theSAqL1xuICBsZXQgQUxMT1dfREFUQV9BVFRSID0gdHJ1ZTtcbiAgLyogRGVjaWRlIGlmIHVua25vd24gcHJvdG9jb2xzIGFyZSBva2F5ICovXG4gIGxldCBBTExPV19VTktOT1dOX1BST1RPQ09MUyA9IGZhbHNlO1xuICAvKiBEZWNpZGUgaWYgc2VsZi1jbG9zaW5nIHRhZ3MgaW4gYXR0cmlidXRlcyBhcmUgYWxsb3dlZC5cbiAgICogVXN1YWxseSByZW1vdmVkIGR1ZSB0byBhIG1YU1MgaXNzdWUgaW4galF1ZXJ5IDMuMCAqL1xuICBsZXQgQUxMT1dfU0VMRl9DTE9TRV9JTl9BVFRSID0gdHJ1ZTtcbiAgLyogT3V0cHV0IHNob3VsZCBiZSBzYWZlIGZvciBjb21tb24gdGVtcGxhdGUgZW5naW5lcy5cbiAgICogVGhpcyBtZWFucywgRE9NUHVyaWZ5IHJlbW92ZXMgZGF0YSBhdHRyaWJ1dGVzLCBtdXN0YWNoZXMgYW5kIEVSQlxuICAgKi9cbiAgbGV0IFNBRkVfRk9SX1RFTVBMQVRFUyA9IGZhbHNlO1xuICAvKiBPdXRwdXQgc2hvdWxkIGJlIHNhZmUgZXZlbiBmb3IgWE1MIHVzZWQgd2l0aGluIEhUTUwgYW5kIGFsaWtlLlxuICAgKiBUaGlzIG1lYW5zLCBET01QdXJpZnkgcmVtb3ZlcyBjb21tZW50cyB3aGVuIGNvbnRhaW5pbmcgcmlza3kgY29udGVudC5cbiAgICovXG4gIGxldCBTQUZFX0ZPUl9YTUwgPSB0cnVlO1xuICAvKiBEZWNpZGUgaWYgZG9jdW1lbnQgd2l0aCA8aHRtbD4uLi4gc2hvdWxkIGJlIHJldHVybmVkICovXG4gIGxldCBXSE9MRV9ET0NVTUVOVCA9IGZhbHNlO1xuICAvKiBUcmFjayB3aGV0aGVyIGNvbmZpZyBpcyBhbHJlYWR5IHNldCBvbiB0aGlzIGluc3RhbmNlIG9mIERPTVB1cmlmeS4gKi9cbiAgbGV0IFNFVF9DT05GSUcgPSBmYWxzZTtcbiAgLyogUHJpc3RpbmUgYWxsb3dsaXN0IGJpbmRpbmdzIGNhcHR1cmVkIGF0IHNldENvbmZpZygpIHRpbWUuIE9uIHRoZVxuICAgKiBwZXJzaXN0ZW50LWNvbmZpZyBwYXRoIHNhbml0aXplKCkgcmVzdG9yZXMgdGhlIHNldHMgZnJvbSB0aGVzZSBiZWZvcmVcbiAgICogdGhlIHBlci13YWxrIGhvb2sgY2xvbmUtZ3VhcmQsIHNvIGEgaG9vaydzIGluLWNhbGwgd2lkZW5pbmcgY2Fubm90XG4gICAqIGNhcnJ5IGFjcm9zcyBjYWxscy4gTnVsbCB1bnRpbCBzZXRDb25maWcoKSBpcyBjYWxsZWQ7IHJlc2V0IGJ5XG4gICAqIGNsZWFyQ29uZmlnKCkuICovXG4gIGxldCBTRVRfQ09ORklHX0FMTE9XRURfVEFHUyA9IG51bGw7XG4gIGxldCBTRVRfQ09ORklHX0FMTE9XRURfQVRUUiA9IG51bGw7XG4gIC8qIERlY2lkZSBpZiBhbGwgZWxlbWVudHMgKGUuZy4gc3R5bGUsIHNjcmlwdCkgbXVzdCBiZSBjaGlsZHJlbiBvZlxuICAgKiBkb2N1bWVudC5ib2R5LiBCeSBkZWZhdWx0LCBicm93c2VycyBtaWdodCBtb3ZlIHRoZW0gdG8gZG9jdW1lbnQuaGVhZCAqL1xuICBsZXQgRk9SQ0VfQk9EWSA9IGZhbHNlO1xuICAvKiBEZWNpZGUgaWYgYSBET00gYEhUTUxCb2R5RWxlbWVudGAgc2hvdWxkIGJlIHJldHVybmVkLCBpbnN0ZWFkIG9mIGEgaHRtbFxuICAgKiBzdHJpbmcgKG9yIGEgVHJ1c3RlZEhUTUwgb2JqZWN0IGlmIFRydXN0ZWQgVHlwZXMgYXJlIHN1cHBvcnRlZCkuXG4gICAqIElmIGBXSE9MRV9ET0NVTUVOVGAgaXMgZW5hYmxlZCBhIGBIVE1MSHRtbEVsZW1lbnRgIHdpbGwgYmUgcmV0dXJuZWQgaW5zdGVhZFxuICAgKi9cbiAgbGV0IFJFVFVSTl9ET00gPSBmYWxzZTtcbiAgLyogRGVjaWRlIGlmIGEgRE9NIGBEb2N1bWVudEZyYWdtZW50YCBzaG91bGQgYmUgcmV0dXJuZWQsIGluc3RlYWQgb2YgYSBodG1sXG4gICAqIHN0cmluZyAgKG9yIGEgVHJ1c3RlZEhUTUwgb2JqZWN0IGlmIFRydXN0ZWQgVHlwZXMgYXJlIHN1cHBvcnRlZCkgKi9cbiAgbGV0IFJFVFVSTl9ET01fRlJBR01FTlQgPSBmYWxzZTtcbiAgLyogVHJ5IHRvIHJldHVybiBhIFRydXN0ZWQgVHlwZSBvYmplY3QgaW5zdGVhZCBvZiBhIHN0cmluZywgcmV0dXJuIGEgc3RyaW5nIGluXG4gICAqIGNhc2UgVHJ1c3RlZCBUeXBlcyBhcmUgbm90IHN1cHBvcnRlZCAgKi9cbiAgbGV0IFJFVFVSTl9UUlVTVEVEX1RZUEUgPSBmYWxzZTtcbiAgLyogT3V0cHV0IHNob3VsZCBiZSBmcmVlIGZyb20gRE9NIGNsb2JiZXJpbmcgYXR0YWNrcz9cbiAgICogVGhpcyBzYW5pdGl6ZXMgbWFya3VwcyBuYW1lZCB3aXRoIGNvbGxpZGluZywgY2xvYmJlcmFibGUgYnVpbHQtaW4gRE9NIEFQSXMuXG4gICAqL1xuICBsZXQgU0FOSVRJWkVfRE9NID0gdHJ1ZTtcbiAgLyogQWNoaWV2ZSBmdWxsIERPTSBDbG9iYmVyaW5nIHByb3RlY3Rpb24gYnkgaXNvbGF0aW5nIHRoZSBuYW1lc3BhY2Ugb2YgbmFtZWRcbiAgICogcHJvcGVydGllcyBhbmQgSlMgdmFyaWFibGVzLCBtaXRpZ2F0aW5nIGF0dGFja3MgdGhhdCBhYnVzZSB0aGUgSFRNTC9ET00gc3BlYyBydWxlcy5cbiAgICpcbiAgICogSFRNTC9ET00gc3BlYyBydWxlcyB0aGF0IGVuYWJsZSBET00gQ2xvYmJlcmluZzpcbiAgICogICAtIE5hbWVkIEFjY2VzcyBvbiBXaW5kb3cgKMKnNy4zLjMpXG4gICAqICAgLSBET00gVHJlZSBBY2Nlc3NvcnMgKMKnMy4xLjUpXG4gICAqICAgLSBGb3JtIEVsZW1lbnQgUGFyZW50LUNoaWxkIFJlbGF0aW9ucyAowqc0LjEwLjMpXG4gICAqICAgLSBJZnJhbWUgc3JjZG9jIC8gTmVzdGVkIFdpbmRvd1Byb3hpZXMgKMKnNC44LjUpXG4gICAqICAgLSBIVE1MQ29sbGVjdGlvbiAowqc0LjIuMTAuMilcbiAgICpcbiAgICogTmFtZXNwYWNlIGlzb2xhdGlvbiBpcyBpbXBsZW1lbnRlZCBieSBwcmVmaXhpbmcgYGlkYCBhbmQgYG5hbWVgIGF0dHJpYnV0ZXNcbiAgICogd2l0aCBhIGNvbnN0YW50IHN0cmluZywgaS5lLiwgYHVzZXItY29udGVudC1gXG4gICAqL1xuICBsZXQgU0FOSVRJWkVfTkFNRURfUFJPUFMgPSBmYWxzZTtcbiAgY29uc3QgU0FOSVRJWkVfTkFNRURfUFJPUFNfUFJFRklYID0gJ3VzZXItY29udGVudC0nO1xuICAvKiBLZWVwIGVsZW1lbnQgY29udGVudCB3aGVuIHJlbW92aW5nIGVsZW1lbnQ/ICovXG4gIGxldCBLRUVQX0NPTlRFTlQgPSB0cnVlO1xuICAvKiBJZiBhIGBOb2RlYCBpcyBwYXNzZWQgdG8gc2FuaXRpemUoKSwgdGhlbiBwZXJmb3JtcyBzYW5pdGl6YXRpb24gaW4tcGxhY2UgaW5zdGVhZFxuICAgKiBvZiBpbXBvcnRpbmcgaXQgaW50byBhIG5ldyBEb2N1bWVudCBhbmQgcmV0dXJuaW5nIGEgc2FuaXRpemVkIGNvcHkgKi9cbiAgbGV0IElOX1BMQUNFID0gZmFsc2U7XG4gIC8qIEFsbG93IHVzYWdlIG9mIHByb2ZpbGVzIGxpa2UgaHRtbCwgc3ZnIGFuZCBtYXRoTWwgKi9cbiAgbGV0IFVTRV9QUk9GSUxFUyA9IHt9O1xuICAvKiBUYWdzIHRvIGlnbm9yZSBjb250ZW50IG9mIHdoZW4gS0VFUF9DT05URU5UIGlzIHRydWUgKi9cbiAgbGV0IEZPUkJJRF9DT05URU5UUyA9IG51bGw7XG4gIGNvbnN0IERFRkFVTFRfRk9SQklEX0NPTlRFTlRTID0gYWRkVG9TZXQoe30sIFsnYW5ub3RhdGlvbi14bWwnLCAnYXVkaW8nLCAnY29sZ3JvdXAnLCAnZGVzYycsICdmb3JlaWdub2JqZWN0JywgJ2hlYWQnLCAnaWZyYW1lJywgJ21hdGgnLCAnbWknLCAnbW4nLCAnbW8nLCAnbXMnLCAnbXRleHQnLCAnbm9lbWJlZCcsICdub2ZyYW1lcycsICdub3NjcmlwdCcsICdwbGFpbnRleHQnLCAnc2NyaXB0JyxcbiAgLy8gPHNlbGVjdGVkY29udGVudD4gbWlycm9ycyB0aGUgc2VsZWN0ZWQgPG9wdGlvbj4ncyBzdWJ0cmVlLCBjbG9uZWQgYnlcbiAgLy8gdGhlIFVBIChjdXN0b21pemFibGUgPHNlbGVjdD4pIOKAlCBpbmNsdWRpbmcgYW55IG9uKiBoYW5kbGVycyDigJQgYW5kIHRoZVxuICAvLyBlbmdpbmUgcmUtbWlycm9ycyBzeW5jaHJvbm91c2x5IHdoZW5ldmVyIGEgcmVtb3ZhbCBjaGFuZ2VzIHdoaWNoXG4gIC8vIG9wdGlvbi9zZWxlY3RlZGNvbnRlbnQgaXMgY3VycmVudCwgZXZlbiBpbnNpZGUgRE9NUHVyaWZ5J3MgaW5lcnRcbiAgLy8gRE9NUGFyc2VyIGRvY3VtZW50LiBIb2lzdGluZyBpdHMgY2hpbGRyZW4gb24gcmVtb3ZhbCByZS1pbnNlcnRzIGEgZnJlc2hcbiAgLy8gbWlycm9yIHRhcmdldCBhaGVhZCBvZiB0aGUgd2Fsaywgd2hpY2ggdGhlIGVuZ2luZSByZWZpbGxzLCBsb29waW5nXG4gIC8vIGZvcmV2ZXIgKERvUykgYW5kIGFtcGxpZnlpbmcgb3V0cHV0LiBEcm9wcGluZyBpdHMgY29udGVudCBvbiByZW1vdmFsXG4gIC8vIChyYXRoZXIgdGhhbiBob2lzdGluZykgYnJlYWtzIHRoYXQgY2FzY2FkZTsgdGhlIGNvbnRlbnQgaXMgYSBkdXBsaWNhdGVcbiAgLy8gb2YgdGhlIG9wdGlvbiwgd2hpY2ggaXMgc2FuaXRpemVkIG9uIGl0cyBvd24uIFNlZSBjYW1wYWlnbi0zIEYxL0Y2LlxuICAnc2VsZWN0ZWRjb250ZW50JywgJ3N0eWxlJywgJ3N2ZycsICd0ZW1wbGF0ZScsICd0aGVhZCcsICd0aXRsZScsICd2aWRlbycsICd4bXAnXSk7XG4gIC8qIFRhZ3MgdGhhdCBhcmUgc2FmZSBmb3IgZGF0YTogVVJJcyAqL1xuICBsZXQgREFUQV9VUklfVEFHUyA9IG51bGw7XG4gIGNvbnN0IERFRkFVTFRfREFUQV9VUklfVEFHUyA9IGFkZFRvU2V0KHt9LCBbJ2F1ZGlvJywgJ3ZpZGVvJywgJ2ltZycsICdzb3VyY2UnLCAnaW1hZ2UnLCAndHJhY2snXSk7XG4gIC8qIEF0dHJpYnV0ZXMgc2FmZSBmb3IgdmFsdWVzIGxpa2UgXCJqYXZhc2NyaXB0OlwiICovXG4gIGxldCBVUklfU0FGRV9BVFRSSUJVVEVTID0gbnVsbDtcbiAgY29uc3QgREVGQVVMVF9VUklfU0FGRV9BVFRSSUJVVEVTID0gYWRkVG9TZXQoe30sIFsnYWx0JywgJ2NsYXNzJywgJ2ZvcicsICdpZCcsICdsYWJlbCcsICduYW1lJywgJ3BhdHRlcm4nLCAncGxhY2Vob2xkZXInLCAncm9sZScsICdzdW1tYXJ5JywgJ3RpdGxlJywgJ3ZhbHVlJywgJ3N0eWxlJywgJ3htbG5zJ10pO1xuICBjb25zdCBNQVRITUxfTkFNRVNQQUNFID0gJ2h0dHA6Ly93d3cudzMub3JnLzE5OTgvTWF0aC9NYXRoTUwnO1xuICBjb25zdCBTVkdfTkFNRVNQQUNFID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcbiAgY29uc3QgSFRNTF9OQU1FU1BBQ0UgPSAnaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbCc7XG4gIC8qIERvY3VtZW50IG5hbWVzcGFjZSAqL1xuICBsZXQgTkFNRVNQQUNFID0gSFRNTF9OQU1FU1BBQ0U7XG4gIGxldCBJU19FTVBUWV9JTlBVVCA9IGZhbHNlO1xuICAvKiBBbGxvd2VkIFhIVE1MK1hNTCBuYW1lc3BhY2VzICovXG4gIGxldCBBTExPV0VEX05BTUVTUEFDRVMgPSBudWxsO1xuICBjb25zdCBERUZBVUxUX0FMTE9XRURfTkFNRVNQQUNFUyA9IGFkZFRvU2V0KHt9LCBbTUFUSE1MX05BTUVTUEFDRSwgU1ZHX05BTUVTUEFDRSwgSFRNTF9OQU1FU1BBQ0VdLCBzdHJpbmdUb1N0cmluZyk7XG4gIGNvbnN0IERFRkFVTFRfTUFUSE1MX1RFWFRfSU5URUdSQVRJT05fUE9JTlRTID0gZnJlZXplKFsnbWknLCAnbW8nLCAnbW4nLCAnbXMnLCAnbXRleHQnXSk7XG4gIGxldCBNQVRITUxfVEVYVF9JTlRFR1JBVElPTl9QT0lOVFMgPSBhZGRUb1NldCh7fSwgREVGQVVMVF9NQVRITUxfVEVYVF9JTlRFR1JBVElPTl9QT0lOVFMpO1xuICBjb25zdCBERUZBVUxUX0hUTUxfSU5URUdSQVRJT05fUE9JTlRTID0gZnJlZXplKFsnYW5ub3RhdGlvbi14bWwnXSk7XG4gIGxldCBIVE1MX0lOVEVHUkFUSU9OX1BPSU5UUyA9IGFkZFRvU2V0KHt9LCBERUZBVUxUX0hUTUxfSU5URUdSQVRJT05fUE9JTlRTKTtcbiAgLy8gQ2VydGFpbiBlbGVtZW50cyBhcmUgYWxsb3dlZCBpbiBib3RoIFNWRyBhbmQgSFRNTFxuICAvLyBuYW1lc3BhY2UuIFdlIG5lZWQgdG8gc3BlY2lmeSB0aGVtIGV4cGxpY2l0bHlcbiAgLy8gc28gdGhhdCB0aGV5IGRvbid0IGdldCBlcnJvbmVvdXNseSBkZWxldGVkIGZyb21cbiAgLy8gSFRNTCBuYW1lc3BhY2UuXG4gIGNvbnN0IENPTU1PTl9TVkdfQU5EX0hUTUxfRUxFTUVOVFMgPSBhZGRUb1NldCh7fSwgWyd0aXRsZScsICdzdHlsZScsICdmb250JywgJ2EnLCAnc2NyaXB0J10pO1xuICAvKiBQYXJzaW5nIG9mIHN0cmljdCBYSFRNTCBkb2N1bWVudHMgKi9cbiAgbGV0IFBBUlNFUl9NRURJQV9UWVBFID0gbnVsbDtcbiAgY29uc3QgU1VQUE9SVEVEX1BBUlNFUl9NRURJQV9UWVBFUyA9IFsnYXBwbGljYXRpb24veGh0bWwreG1sJywgJ3RleHQvaHRtbCddO1xuICBjb25zdCBERUZBVUxUX1BBUlNFUl9NRURJQV9UWVBFID0gJ3RleHQvaHRtbCc7XG4gIGxldCB0cmFuc2Zvcm1DYXNlRnVuYyA9IG51bGw7XG4gIC8qIEtlZXAgYSByZWZlcmVuY2UgdG8gY29uZmlnIHRvIHBhc3MgdG8gaG9va3MgKi9cbiAgbGV0IENPTkZJRyA9IG51bGw7XG4gIC8qIElkZWFsbHksIGRvIG5vdCB0b3VjaCBhbnl0aGluZyBiZWxvdyB0aGlzIGxpbmUgKi9cbiAgLyogX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fXyAqL1xuICBjb25zdCBmb3JtRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zvcm0nKTtcbiAgY29uc3QgaXNSZWdleE9yRnVuY3Rpb24gPSBmdW5jdGlvbiBpc1JlZ2V4T3JGdW5jdGlvbih0ZXN0VmFsdWUpIHtcbiAgICByZXR1cm4gdGVzdFZhbHVlIGluc3RhbmNlb2YgUmVnRXhwIHx8IHRlc3RWYWx1ZSBpbnN0YW5jZW9mIEZ1bmN0aW9uO1xuICB9O1xuICAvKipcbiAgICogX3BhcnNlQ29uZmlnXG4gICAqXG4gICAqIEBwYXJhbSBjZmcgb3B0aW9uYWwgY29uZmlnIGxpdGVyYWxcbiAgICovXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjb21wbGV4aXR5XG4gIGNvbnN0IF9wYXJzZUNvbmZpZyA9IGZ1bmN0aW9uIF9wYXJzZUNvbmZpZygpIHtcbiAgICBsZXQgY2ZnID0gYXJndW1lbnRzLmxlbmd0aCA+IDAgJiYgYXJndW1lbnRzWzBdICE9PSB1bmRlZmluZWQgPyBhcmd1bWVudHNbMF0gOiB7fTtcbiAgICBpZiAoQ09ORklHICYmIENPTkZJRyA9PT0gY2ZnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8qIFNoaWVsZCBjb25maWd1cmF0aW9uIG9iamVjdCBmcm9tIHRhbXBlcmluZyAqL1xuICAgIGlmICghY2ZnIHx8IHR5cGVvZiBjZmcgIT09ICdvYmplY3QnKSB7XG4gICAgICBjZmcgPSB7fTtcbiAgICB9XG4gICAgLyogU2hpZWxkIGNvbmZpZ3VyYXRpb24gb2JqZWN0IGZyb20gcHJvdG90eXBlIHBvbGx1dGlvbiAqL1xuICAgIGNmZyA9IGNsb25lKGNmZyk7XG4gICAgUEFSU0VSX01FRElBX1RZUEUgPVxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSB1bmljb3JuL3ByZWZlci1pbmNsdWRlc1xuICAgIFNVUFBPUlRFRF9QQVJTRVJfTUVESUFfVFlQRVMuaW5kZXhPZihjZmcuUEFSU0VSX01FRElBX1RZUEUpID09PSAtMSA/IERFRkFVTFRfUEFSU0VSX01FRElBX1RZUEUgOiBjZmcuUEFSU0VSX01FRElBX1RZUEU7XG4gICAgLy8gSFRNTCB0YWdzIGFuZCBhdHRyaWJ1dGVzIGFyZSBub3QgY2FzZS1zZW5zaXRpdmUsIGNvbnZlcnRpbmcgdG8gbG93ZXJjYXNlLiBLZWVwaW5nIFhIVE1MIGFzIGlzLlxuICAgIHRyYW5zZm9ybUNhc2VGdW5jID0gUEFSU0VSX01FRElBX1RZUEUgPT09ICdhcHBsaWNhdGlvbi94aHRtbCt4bWwnID8gc3RyaW5nVG9TdHJpbmcgOiBzdHJpbmdUb0xvd2VyQ2FzZTtcbiAgICAvKiBTZXQgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzICovXG4gICAgQUxMT1dFRF9UQUdTID0gX3Jlc29sdmVTZXRPcHRpb24oY2ZnLCAnQUxMT1dFRF9UQUdTJywgREVGQVVMVF9BTExPV0VEX1RBR1MsIHtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNmb3JtQ2FzZUZ1bmNcbiAgICB9KTtcbiAgICBBTExPV0VEX0FUVFIgPSBfcmVzb2x2ZVNldE9wdGlvbihjZmcsICdBTExPV0VEX0FUVFInLCBERUZBVUxUX0FMTE9XRURfQVRUUiwge1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2Zvcm1DYXNlRnVuY1xuICAgIH0pO1xuICAgIEFMTE9XRURfTkFNRVNQQUNFUyA9IF9yZXNvbHZlU2V0T3B0aW9uKGNmZywgJ0FMTE9XRURfTkFNRVNQQUNFUycsIERFRkFVTFRfQUxMT1dFRF9OQU1FU1BBQ0VTLCB7XG4gICAgICB0cmFuc2Zvcm06IHN0cmluZ1RvU3RyaW5nXG4gICAgfSk7XG4gICAgVVJJX1NBRkVfQVRUUklCVVRFUyA9IF9yZXNvbHZlU2V0T3B0aW9uKGNmZywgJ0FERF9VUklfU0FGRV9BVFRSJywgREVGQVVMVF9VUklfU0FGRV9BVFRSSUJVVEVTLCB7XG4gICAgICB0cmFuc2Zvcm06IHRyYW5zZm9ybUNhc2VGdW5jLFxuICAgICAgYmFzZTogREVGQVVMVF9VUklfU0FGRV9BVFRSSUJVVEVTXG4gICAgfSk7XG4gICAgREFUQV9VUklfVEFHUyA9IF9yZXNvbHZlU2V0T3B0aW9uKGNmZywgJ0FERF9EQVRBX1VSSV9UQUdTJywgREVGQVVMVF9EQVRBX1VSSV9UQUdTLCB7XG4gICAgICB0cmFuc2Zvcm06IHRyYW5zZm9ybUNhc2VGdW5jLFxuICAgICAgYmFzZTogREVGQVVMVF9EQVRBX1VSSV9UQUdTXG4gICAgfSk7XG4gICAgRk9SQklEX0NPTlRFTlRTID0gX3Jlc29sdmVTZXRPcHRpb24oY2ZnLCAnRk9SQklEX0NPTlRFTlRTJywgREVGQVVMVF9GT1JCSURfQ09OVEVOVFMsIHtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNmb3JtQ2FzZUZ1bmNcbiAgICB9KTtcbiAgICBGT1JCSURfVEFHUyA9IF9yZXNvbHZlU2V0T3B0aW9uKGNmZywgJ0ZPUkJJRF9UQUdTJywgY2xvbmUoe30pLCB7XG4gICAgICB0cmFuc2Zvcm06IHRyYW5zZm9ybUNhc2VGdW5jXG4gICAgfSk7XG4gICAgRk9SQklEX0FUVFIgPSBfcmVzb2x2ZVNldE9wdGlvbihjZmcsICdGT1JCSURfQVRUUicsIGNsb25lKHt9KSwge1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2Zvcm1DYXNlRnVuY1xuICAgIH0pO1xuICAgIFVTRV9QUk9GSUxFUyA9IG9iamVjdEhhc093blByb3BlcnR5KGNmZywgJ1VTRV9QUk9GSUxFUycpID8gY2ZnLlVTRV9QUk9GSUxFUyAmJiB0eXBlb2YgY2ZnLlVTRV9QUk9GSUxFUyA9PT0gJ29iamVjdCcgPyBjbG9uZShjZmcuVVNFX1BST0ZJTEVTKSA6IGNmZy5VU0VfUFJPRklMRVMgOiBmYWxzZTtcbiAgICBBTExPV19BUklBX0FUVFIgPSBjZmcuQUxMT1dfQVJJQV9BVFRSICE9PSBmYWxzZTsgLy8gRGVmYXVsdCB0cnVlXG4gICAgQUxMT1dfREFUQV9BVFRSID0gY2ZnLkFMTE9XX0RBVEFfQVRUUiAhPT0gZmFsc2U7IC8vIERlZmF1bHQgdHJ1ZVxuICAgIEFMTE9XX1VOS05PV05fUFJPVE9DT0xTID0gY2ZnLkFMTE9XX1VOS05PV05fUFJPVE9DT0xTIHx8IGZhbHNlOyAvLyBEZWZhdWx0IGZhbHNlXG4gICAgQUxMT1dfU0VMRl9DTE9TRV9JTl9BVFRSID0gY2ZnLkFMTE9XX1NFTEZfQ0xPU0VfSU5fQVRUUiAhPT0gZmFsc2U7IC8vIERlZmF1bHQgdHJ1ZVxuICAgIFNBRkVfRk9SX1RFTVBMQVRFUyA9IGNmZy5TQUZFX0ZPUl9URU1QTEFURVMgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBTQUZFX0ZPUl9YTUwgPSBjZmcuU0FGRV9GT1JfWE1MICE9PSBmYWxzZTsgLy8gRGVmYXVsdCB0cnVlXG4gICAgV0hPTEVfRE9DVU1FTlQgPSBjZmcuV0hPTEVfRE9DVU1FTlQgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBSRVRVUk5fRE9NID0gY2ZnLlJFVFVSTl9ET00gfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBSRVRVUk5fRE9NX0ZSQUdNRU5UID0gY2ZnLlJFVFVSTl9ET01fRlJBR01FTlQgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBSRVRVUk5fVFJVU1RFRF9UWVBFID0gY2ZnLlJFVFVSTl9UUlVTVEVEX1RZUEUgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBGT1JDRV9CT0RZID0gY2ZnLkZPUkNFX0JPRFkgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBTQU5JVElaRV9ET00gPSBjZmcuU0FOSVRJWkVfRE9NICE9PSBmYWxzZTsgLy8gRGVmYXVsdCB0cnVlXG4gICAgU0FOSVRJWkVfTkFNRURfUFJPUFMgPSBjZmcuU0FOSVRJWkVfTkFNRURfUFJPUFMgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBLRUVQX0NPTlRFTlQgPSBjZmcuS0VFUF9DT05URU5UICE9PSBmYWxzZTsgLy8gRGVmYXVsdCB0cnVlXG4gICAgSU5fUExBQ0UgPSBjZmcuSU5fUExBQ0UgfHwgZmFsc2U7IC8vIERlZmF1bHQgZmFsc2VcbiAgICBJU19BTExPV0VEX1VSSSQxID0gaXNSZWdleChjZmcuQUxMT1dFRF9VUklfUkVHRVhQKSA/IGNmZy5BTExPV0VEX1VSSV9SRUdFWFAgOiBJU19BTExPV0VEX1VSSTsgLy8gRGVmYXVsdCByZWdleHBcbiAgICBOQU1FU1BBQ0UgPSB0eXBlb2YgY2ZnLk5BTUVTUEFDRSA9PT0gJ3N0cmluZycgPyBjZmcuTkFNRVNQQUNFIDogSFRNTF9OQU1FU1BBQ0U7IC8vIERlZmF1bHQgSFRNTCBuYW1lc3BhY2VcbiAgICBNQVRITUxfVEVYVF9JTlRFR1JBVElPTl9QT0lOVFMgPSBvYmplY3RIYXNPd25Qcm9wZXJ0eShjZmcsICdNQVRITUxfVEVYVF9JTlRFR1JBVElPTl9QT0lOVFMnKSAmJiBjZmcuTUFUSE1MX1RFWFRfSU5URUdSQVRJT05fUE9JTlRTICYmIHR5cGVvZiBjZmcuTUFUSE1MX1RFWFRfSU5URUdSQVRJT05fUE9JTlRTID09PSAnb2JqZWN0JyA/IGNsb25lKGNmZy5NQVRITUxfVEVYVF9JTlRFR1JBVElPTl9QT0lOVFMpIDogYWRkVG9TZXQoe30sIERFRkFVTFRfTUFUSE1MX1RFWFRfSU5URUdSQVRJT05fUE9JTlRTKTsgLy8gRGVmYXVsdCBidWlsdC1pbiBtYXBcbiAgICBIVE1MX0lOVEVHUkFUSU9OX1BPSU5UUyA9IG9iamVjdEhhc093blByb3BlcnR5KGNmZywgJ0hUTUxfSU5URUdSQVRJT05fUE9JTlRTJykgJiYgY2ZnLkhUTUxfSU5URUdSQVRJT05fUE9JTlRTICYmIHR5cGVvZiBjZmcuSFRNTF9JTlRFR1JBVElPTl9QT0lOVFMgPT09ICdvYmplY3QnID8gY2xvbmUoY2ZnLkhUTUxfSU5URUdSQVRJT05fUE9JTlRTKSA6IGFkZFRvU2V0KHt9LCBERUZBVUxUX0hUTUxfSU5URUdSQVRJT05fUE9JTlRTKTsgLy8gRGVmYXVsdCBidWlsdC1pbiBtYXBcbiAgICBjb25zdCBjdXN0b21FbGVtZW50SGFuZGxpbmcgPSBvYmplY3RIYXNPd25Qcm9wZXJ0eShjZmcsICdDVVNUT01fRUxFTUVOVF9IQU5ETElORycpICYmIGNmZy5DVVNUT01fRUxFTUVOVF9IQU5ETElORyAmJiB0eXBlb2YgY2ZnLkNVU1RPTV9FTEVNRU5UX0hBTkRMSU5HID09PSAnb2JqZWN0JyA/IGNsb25lKGNmZy5DVVNUT01fRUxFTUVOVF9IQU5ETElORykgOiBjcmVhdGUobnVsbCk7XG4gICAgQ1VTVE9NX0VMRU1FTlRfSEFORExJTkcgPSBjcmVhdGUobnVsbCk7XG4gICAgaWYgKG9iamVjdEhhc093blByb3BlcnR5KGN1c3RvbUVsZW1lbnRIYW5kbGluZywgJ3RhZ05hbWVDaGVjaycpICYmIGlzUmVnZXhPckZ1bmN0aW9uKGN1c3RvbUVsZW1lbnRIYW5kbGluZy50YWdOYW1lQ2hlY2spKSB7XG4gICAgICBDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sgPSBjdXN0b21FbGVtZW50SGFuZGxpbmcudGFnTmFtZUNoZWNrOyAvLyBEZWZhdWx0IHVuZGVmaW5lZFxuICAgIH1cbiAgICBpZiAob2JqZWN0SGFzT3duUHJvcGVydHkoY3VzdG9tRWxlbWVudEhhbmRsaW5nLCAnYXR0cmlidXRlTmFtZUNoZWNrJykgJiYgaXNSZWdleE9yRnVuY3Rpb24oY3VzdG9tRWxlbWVudEhhbmRsaW5nLmF0dHJpYnV0ZU5hbWVDaGVjaykpIHtcbiAgICAgIENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HLmF0dHJpYnV0ZU5hbWVDaGVjayA9IGN1c3RvbUVsZW1lbnRIYW5kbGluZy5hdHRyaWJ1dGVOYW1lQ2hlY2s7IC8vIERlZmF1bHQgdW5kZWZpbmVkXG4gICAgfVxuICAgIGlmIChvYmplY3RIYXNPd25Qcm9wZXJ0eShjdXN0b21FbGVtZW50SGFuZGxpbmcsICdhbGxvd0N1c3RvbWl6ZWRCdWlsdEluRWxlbWVudHMnKSAmJiB0eXBlb2YgY3VzdG9tRWxlbWVudEhhbmRsaW5nLmFsbG93Q3VzdG9taXplZEJ1aWx0SW5FbGVtZW50cyA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBDVVNUT01fRUxFTUVOVF9IQU5ETElORy5hbGxvd0N1c3RvbWl6ZWRCdWlsdEluRWxlbWVudHMgPSBjdXN0b21FbGVtZW50SGFuZGxpbmcuYWxsb3dDdXN0b21pemVkQnVpbHRJbkVsZW1lbnRzOyAvLyBEZWZhdWx0IHVuZGVmaW5lZFxuICAgIH1cbiAgICBzZWFsKENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HKTtcbiAgICBpZiAoU0FGRV9GT1JfVEVNUExBVEVTKSB7XG4gICAgICBBTExPV19EQVRBX0FUVFIgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKFJFVFVSTl9ET01fRlJBR01FTlQpIHtcbiAgICAgIFJFVFVSTl9ET00gPSB0cnVlO1xuICAgIH1cbiAgICAvKiBQYXJzZSBwcm9maWxlIGluZm8gKi9cbiAgICBpZiAoVVNFX1BST0ZJTEVTKSB7XG4gICAgICBBTExPV0VEX1RBR1MgPSBhZGRUb1NldCh7fSwgdGV4dCk7XG4gICAgICBBTExPV0VEX0FUVFIgPSBjcmVhdGUobnVsbCk7XG4gICAgICBpZiAoVVNFX1BST0ZJTEVTLmh0bWwgPT09IHRydWUpIHtcbiAgICAgICAgYWRkVG9TZXQoQUxMT1dFRF9UQUdTLCBodG1sJDEpO1xuICAgICAgICBhZGRUb1NldChBTExPV0VEX0FUVFIsIGh0bWwpO1xuICAgICAgfVxuICAgICAgaWYgKFVTRV9QUk9GSUxFUy5zdmcgPT09IHRydWUpIHtcbiAgICAgICAgYWRkVG9TZXQoQUxMT1dFRF9UQUdTLCBzdmckMSk7XG4gICAgICAgIGFkZFRvU2V0KEFMTE9XRURfQVRUUiwgc3ZnKTtcbiAgICAgICAgYWRkVG9TZXQoQUxMT1dFRF9BVFRSLCB4bWwpO1xuICAgICAgfVxuICAgICAgaWYgKFVTRV9QUk9GSUxFUy5zdmdGaWx0ZXJzID09PSB0cnVlKSB7XG4gICAgICAgIGFkZFRvU2V0KEFMTE9XRURfVEFHUywgc3ZnRmlsdGVycyk7XG4gICAgICAgIGFkZFRvU2V0KEFMTE9XRURfQVRUUiwgc3ZnKTtcbiAgICAgICAgYWRkVG9TZXQoQUxMT1dFRF9BVFRSLCB4bWwpO1xuICAgICAgfVxuICAgICAgaWYgKFVTRV9QUk9GSUxFUy5tYXRoTWwgPT09IHRydWUpIHtcbiAgICAgICAgYWRkVG9TZXQoQUxMT1dFRF9UQUdTLCBtYXRoTWwkMSk7XG4gICAgICAgIGFkZFRvU2V0KEFMTE9XRURfQVRUUiwgbWF0aE1sKTtcbiAgICAgICAgYWRkVG9TZXQoQUxMT1dFRF9BVFRSLCB4bWwpO1xuICAgICAgfVxuICAgIH1cbiAgICAvKiBBbHdheXMgcmVzZXQgZnVuY3Rpb24tYmFzZWQgQUREX1RBR1MgLyBBRERfQVRUUiBjaGVja3MgdG8gcHJldmVudFxuICAgICAqIGxlYWtpbmcgYWNyb3NzIGNhbGxzIHdoZW4gc3dpdGNoaW5nIGZyb20gZnVuY3Rpb24gdG8gYXJyYXkgY29uZmlnICovXG4gICAgRVhUUkFfRUxFTUVOVF9IQU5ETElORy50YWdDaGVjayA9IG51bGw7XG4gICAgRVhUUkFfRUxFTUVOVF9IQU5ETElORy5hdHRyaWJ1dGVDaGVjayA9IG51bGw7XG4gICAgLyogTWVyZ2UgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzICovXG4gICAgaWYgKG9iamVjdEhhc093blByb3BlcnR5KGNmZywgJ0FERF9UQUdTJykpIHtcbiAgICAgIGlmICh0eXBlb2YgY2ZnLkFERF9UQUdTID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIEVYVFJBX0VMRU1FTlRfSEFORExJTkcudGFnQ2hlY2sgPSBjZmcuQUREX1RBR1M7XG4gICAgICB9IGVsc2UgaWYgKGFycmF5SXNBcnJheShjZmcuQUREX1RBR1MpKSB7XG4gICAgICAgIGlmIChBTExPV0VEX1RBR1MgPT09IERFRkFVTFRfQUxMT1dFRF9UQUdTKSB7XG4gICAgICAgICAgQUxMT1dFRF9UQUdTID0gY2xvbmUoQUxMT1dFRF9UQUdTKTtcbiAgICAgICAgfVxuICAgICAgICBhZGRUb1NldChBTExPV0VEX1RBR1MsIGNmZy5BRERfVEFHUywgdHJhbnNmb3JtQ2FzZUZ1bmMpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAob2JqZWN0SGFzT3duUHJvcGVydHkoY2ZnLCAnQUREX0FUVFInKSkge1xuICAgICAgaWYgKHR5cGVvZiBjZmcuQUREX0FUVFIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgRVhUUkFfRUxFTUVOVF9IQU5ETElORy5hdHRyaWJ1dGVDaGVjayA9IGNmZy5BRERfQVRUUjtcbiAgICAgIH0gZWxzZSBpZiAoYXJyYXlJc0FycmF5KGNmZy5BRERfQVRUUikpIHtcbiAgICAgICAgaWYgKEFMTE9XRURfQVRUUiA9PT0gREVGQVVMVF9BTExPV0VEX0FUVFIpIHtcbiAgICAgICAgICBBTExPV0VEX0FUVFIgPSBjbG9uZShBTExPV0VEX0FUVFIpO1xuICAgICAgICB9XG4gICAgICAgIGFkZFRvU2V0KEFMTE9XRURfQVRUUiwgY2ZnLkFERF9BVFRSLCB0cmFuc2Zvcm1DYXNlRnVuYyk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvYmplY3RIYXNPd25Qcm9wZXJ0eShjZmcsICdBRERfVVJJX1NBRkVfQVRUUicpICYmIGFycmF5SXNBcnJheShjZmcuQUREX1VSSV9TQUZFX0FUVFIpKSB7XG4gICAgICBhZGRUb1NldChVUklfU0FGRV9BVFRSSUJVVEVTLCBjZmcuQUREX1VSSV9TQUZFX0FUVFIsIHRyYW5zZm9ybUNhc2VGdW5jKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdEhhc093blByb3BlcnR5KGNmZywgJ0ZPUkJJRF9DT05URU5UUycpICYmIGFycmF5SXNBcnJheShjZmcuRk9SQklEX0NPTlRFTlRTKSkge1xuICAgICAgaWYgKEZPUkJJRF9DT05URU5UUyA9PT0gREVGQVVMVF9GT1JCSURfQ09OVEVOVFMpIHtcbiAgICAgICAgRk9SQklEX0NPTlRFTlRTID0gY2xvbmUoRk9SQklEX0NPTlRFTlRTKTtcbiAgICAgIH1cbiAgICAgIGFkZFRvU2V0KEZPUkJJRF9DT05URU5UUywgY2ZnLkZPUkJJRF9DT05URU5UUywgdHJhbnNmb3JtQ2FzZUZ1bmMpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0SGFzT3duUHJvcGVydHkoY2ZnLCAnQUREX0ZPUkJJRF9DT05URU5UUycpICYmIGFycmF5SXNBcnJheShjZmcuQUREX0ZPUkJJRF9DT05URU5UUykpIHtcbiAgICAgIGlmIChGT1JCSURfQ09OVEVOVFMgPT09IERFRkFVTFRfRk9SQklEX0NPTlRFTlRTKSB7XG4gICAgICAgIEZPUkJJRF9DT05URU5UUyA9IGNsb25lKEZPUkJJRF9DT05URU5UUyk7XG4gICAgICB9XG4gICAgICBhZGRUb1NldChGT1JCSURfQ09OVEVOVFMsIGNmZy5BRERfRk9SQklEX0NPTlRFTlRTLCB0cmFuc2Zvcm1DYXNlRnVuYyk7XG4gICAgfVxuICAgIC8qIEFkZCAjdGV4dCBpbiBjYXNlIEtFRVBfQ09OVEVOVCBpcyBzZXQgdG8gdHJ1ZSAqL1xuICAgIGlmIChLRUVQX0NPTlRFTlQpIHtcbiAgICAgIEFMTE9XRURfVEFHU1snI3RleHQnXSA9IHRydWU7XG4gICAgfVxuICAgIC8qIEFkZCBodG1sLCBoZWFkIGFuZCBib2R5IHRvIEFMTE9XRURfVEFHUyBpbiBjYXNlIFdIT0xFX0RPQ1VNRU5UIGlzIHRydWUgKi9cbiAgICBpZiAoV0hPTEVfRE9DVU1FTlQpIHtcbiAgICAgIGFkZFRvU2V0KEFMTE9XRURfVEFHUywgWydodG1sJywgJ2hlYWQnLCAnYm9keSddKTtcbiAgICB9XG4gICAgLyogQWRkIHRib2R5IHRvIEFMTE9XRURfVEFHUyBpbiBjYXNlIHRhYmxlcyBhcmUgcGVybWl0dGVkLCBzZWUgIzI4NiwgIzM2NSAqL1xuICAgIGlmIChBTExPV0VEX1RBR1MudGFibGUpIHtcbiAgICAgIGFkZFRvU2V0KEFMTE9XRURfVEFHUywgWyd0Ym9keSddKTtcbiAgICAgIGRlbGV0ZSBGT1JCSURfVEFHUy50Ym9keTtcbiAgICB9XG4gICAgLy8gUmUtZGVyaXZlIHRoZSBhY3RpdmUgVHJ1c3RlZCBUeXBlcyBwb2xpY3kgZnJvbSB0aGlzIGNvbmZpZ3VyYXRpb24gb25cbiAgICAvLyBldmVyeSBwYXJzZS4gVGhlIGFjdGl2ZSBwb2xpY3kgbXVzdCBuZXZlciBiZSBzdGlja3kgY2xvc3VyZSBzdGF0ZSB0aGF0XG4gICAgLy8gb3V0bGl2ZXMgdGhlIGNvbmZpZyB0aGF0IHNldCBpdDogYSBjYWxsZXItc3VwcGxpZWQgcG9saWN5IGxlZnQgaW4gcGxhY2VcbiAgICAvLyBhZnRlciBgY2xlYXJDb25maWcoKWAg4oCUIG9yIGFmdGVyIGEgbGF0ZXIgY2FsbCB0aGF0IHN1cHBsaWVkIG5vbmUsIG9yXG4gICAgLy8gYFRSVVNURURfVFlQRVNfUE9MSUNZOiBudWxsYCDigJQgY291bGQgc2lnbiBhIHN1YnNlcXVlbnQgXCJkZWZhdWx0XCJcbiAgICAvLyBgUkVUVVJOX1RSVVNURURfVFlQRWAgcmVzdWx0IHdpdGggYSBmb3JlaWduLCBwb3NzaWJseSB1bnNhZmUgcG9saWN5LlxuICAgIC8vIFNlZSBHSFNBLXZ4cjgtZnEzNC12dng5LlxuICAgIGlmIChjZmcuVFJVU1RFRF9UWVBFU19QT0xJQ1kpIHtcbiAgICAgIGlmICh0eXBlb2YgY2ZnLlRSVVNURURfVFlQRVNfUE9MSUNZLmNyZWF0ZUhUTUwgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhyb3cgdHlwZUVycm9yQ3JlYXRlKCdUUlVTVEVEX1RZUEVTX1BPTElDWSBjb25maWd1cmF0aW9uIG9wdGlvbiBtdXN0IHByb3ZpZGUgYSBcImNyZWF0ZUhUTUxcIiBob29rLicpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBjZmcuVFJVU1RFRF9UWVBFU19QT0xJQ1kuY3JlYXRlU2NyaXB0VVJMICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IHR5cGVFcnJvckNyZWF0ZSgnVFJVU1RFRF9UWVBFU19QT0xJQ1kgY29uZmlndXJhdGlvbiBvcHRpb24gbXVzdCBwcm92aWRlIGEgXCJjcmVhdGVTY3JpcHRVUkxcIiBob29rLicpO1xuICAgICAgfVxuICAgICAgLy8gQSBjYWxsZXItc3VwcGxpZWQgcG9saWN5IGFwcGxpZXMgdG8gdGhpcyBjb25maWd1cmF0aW9uIG9ubHkuXG4gICAgICBjb25zdCBwcmV2aW91c1RydXN0ZWRUeXBlc1BvbGljeSA9IHRydXN0ZWRUeXBlc1BvbGljeTtcbiAgICAgIHRydXN0ZWRUeXBlc1BvbGljeSA9IGNmZy5UUlVTVEVEX1RZUEVTX1BPTElDWTtcbiAgICAgIC8vIFNpZ24gbG9jYWwgdmFyaWFibGVzIHJlcXVpcmVkIGJ5IGBzYW5pdGl6ZWAuIElmIHRoZSBzdXBwbGllZCBwb2xpY3knc1xuICAgICAgLy8gYGNyZWF0ZUhUTUxgIGlzIGNpcmN1bGFyIChpLmUuIGl0IGNhbGxzIGBET01QdXJpZnkuc2FuaXRpemVgKSwgdGhpc1xuICAgICAgLy8gdGhyb3dzIHZpYSB0aGUgcmUtZW50cmFuY3kgZ3VhcmQuIFJlc3RvcmUgdGhlIHByZXZpb3VzIHBvbGljeSBmaXJzdCBzb1xuICAgICAgLy8gdGhlIGluc3RhbmNlIGlzIG5vdCBsZWZ0IGluIGEgcG9pc29uZWQgc3RhdGUuIFNlZSAjMTQyMi5cbiAgICAgIHRyeSB7XG4gICAgICAgIGVtcHR5SFRNTCA9IF9jcmVhdGVUcnVzdGVkSFRNTCgnJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0cnVzdGVkVHlwZXNQb2xpY3kgPSBwcmV2aW91c1RydXN0ZWRUeXBlc1BvbGljeTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChjZmcuVFJVU1RFRF9UWVBFU19QT0xJQ1kgPT09IG51bGwpIHtcbiAgICAgIC8vIEV4cGxpY2l0IG9wdC1vdXQgZm9yIHRoaXMgY2FsbDogcGVyZm9ybSBubyBUcnVzdGVkIFR5cGVzIHNpZ25pbmcgYW5kXG4gICAgICAvLyBjcmVhdGUgbm90aGluZyAoc28gYSBzdHJpY3QgYHRydXN0ZWQtdHlwZXNgIENTUCB0aGF0IGRpc2FsbG93cyBhXG4gICAgICAvLyBgZG9tcHVyaWZ5YCBwb2xpY3kgY2FuIHN0aWxsIGNhbGwgYHNhbml0aXplYCBmcm9tIGluc2lkZSBpdHMgb3duXG4gICAgICAvLyBwb2xpY3kg4oCUIHNlZSAjMTQyMikuIFJlc2V0dGluZyB0byBgdW5kZWZpbmVkYCByYXRoZXIgdGhhbiBhIHN0aWNreVxuICAgICAgLy8gYG51bGxgIGFsc28gZHJvcHMgYW55IHByZXZpb3VzbHkgcmV0YWluZWQgY2FsbGVyIHBvbGljeSwgc28gaXQgY2Fubm90XG4gICAgICAvLyByZXN1cmZhY2Ugb24gYSBsYXRlciBjYWxsLCB3aGlsZSBzdGlsbCBhbGxvd2luZyB0aGUgbmV4dCBjb25maWctbGVzc1xuICAgICAgLy8gY2FsbCB0byByZXN0b3JlIHRoZSBpbnRlcm5hbCBkZWZhdWx0IHBvbGljeS4gU2VlIEdIU0EtdnhyOC1mcTM0LXZ2eDkuXG4gICAgICB0cnVzdGVkVHlwZXNQb2xpY3kgPSB1bmRlZmluZWQ7XG4gICAgICBlbXB0eUhUTUwgPSAnJztcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTm8gcG9saWN5IHN1cHBsaWVkOiBrZWVwIHRoZSBjdXJyZW50bHkgYWN0aXZlIHBvbGljeSBpZiBvbmUgaXMgc2V0IOKAlCBhXG4gICAgICAvLyBwcmV2aW91c2x5IHN1cHBsaWVkIHBvbGljeSBpcyBpbnRlbnRpb25hbGx5IHN0aWNreSBhY3Jvc3MgY29uZmlnLWxlc3NcbiAgICAgIC8vIGNhbGxzIOKAlCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIHRoZSBpbnN0YW5jZSdzIG93biBpbnRlcm5hbCBwb2xpY3ksXG4gICAgICAvLyBjcmVhdGVkIGF0IG1vc3Qgb25jZS4gKEEgcG9saWN5IHN1cHBsaWVkIGZvciBhICpzaW5nbGUqIGNhbGwgc3RpbGxcbiAgICAgIC8vIGxpbmdlcnMgYnkgZGVzaWduOyB3aGF0IG11c3Qgbm90IGxpbmdlciBpcyBhIHBvbGljeSB3aG9zZSBjb25maWd1cmF0aW9uXG4gICAgICAvLyBoYXMgYmVlbiB0b3JuIGRvd24gdmlhIGBjbGVhckNvbmZpZygpYCwgd2hpY2ggcmVzdG9yZXMgdGhlIGRlZmF1bHQuKVxuICAgICAgaWYgKHRydXN0ZWRUeXBlc1BvbGljeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRydXN0ZWRUeXBlc1BvbGljeSA9IF9nZXREZWZhdWx0VHJ1c3RlZFR5cGVzUG9saWN5KCk7XG4gICAgICB9XG4gICAgICAvLyBTaWduIGludGVybmFsIHZhcmlhYmxlcyBvbmx5IHdoZW4gYSBwb2xpY3kgaXMgYWN0aXZlLiBBIGZhbHN5IHBvbGljeVxuICAgICAgLy8gKFRydXN0ZWQgVHlwZXMgdW5zdXBwb3J0ZWQsIGNyZWF0aW9uIGZhaWxlZCwgb3IgYW4gZXhwbGljaXQgb3B0LW91dClcbiAgICAgIC8vIGxlYXZlcyBgZW1wdHlIVE1MYCBhcyBhIHBsYWluIHN0cmluZywgc28gd2UgbmV2ZXIgY2FsbCBgLmNyZWF0ZUhUTUxgIG9uXG4gICAgICAvLyBhIG5vbi1wb2xpY3kgYW5kIHRocm93LiBTZWUgIzE0MjIuXG4gICAgICBpZiAodHJ1c3RlZFR5cGVzUG9saWN5ICYmIHR5cGVvZiBlbXB0eUhUTUwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGVtcHR5SFRNTCA9IF9jcmVhdGVUcnVzdGVkSFRNTCgnJyk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIFByZXZlbnQgZnVydGhlciBtYW5pcHVsYXRpb24gb2YgY29uZmlndXJhdGlvbi5cbiAgICAvLyBOb3QgYXZhaWxhYmxlIGluIElFOCwgU2FmYXJpIDUsIGV0Yy5cbiAgICBpZiAoZnJlZXplKSB7XG4gICAgICBmcmVlemUoY2ZnKTtcbiAgICB9XG4gICAgQ09ORklHID0gY2ZnO1xuICB9O1xuICAvKiBLZWVwIHRyYWNrIG9mIGFsbCBwb3NzaWJsZSBTVkcgYW5kIE1hdGhNTCB0YWdzXG4gICAqIHNvIHRoYXQgd2UgY2FuIHBlcmZvcm0gdGhlIG5hbWVzcGFjZSBjaGVja3NcbiAgICogY29ycmVjdGx5LiAqL1xuICBjb25zdCBBTExfU1ZHX1RBR1MgPSBhZGRUb1NldCh7fSwgWy4uLnN2ZyQxLCAuLi5zdmdGaWx0ZXJzLCAuLi5zdmdEaXNhbGxvd2VkXSk7XG4gIGNvbnN0IEFMTF9NQVRITUxfVEFHUyA9IGFkZFRvU2V0KHt9LCBbLi4ubWF0aE1sJDEsIC4uLm1hdGhNbERpc2FsbG93ZWRdKTtcbiAgLyoqXG4gICAqIE5hbWVzcGFjZSBydWxlcyBmb3IgYW4gZWxlbWVudCBpbiB0aGUgU1ZHIG5hbWVzcGFjZS5cbiAgICpcbiAgICogQHBhcmFtIHRhZ05hbWUgdGhlIGVsZW1lbnQncyBsb3dlcmNhc2UgdGFnIG5hbWVcbiAgICogQHBhcmFtIHBhcmVudCB0aGUgKHBvc3NpYmx5IHNpbXVsYXRlZCkgcGFyZW50IG5vZGVcbiAgICogQHBhcmFtIHBhcmVudFRhZ05hbWUgdGhlIHBhcmVudCdzIGxvd2VyY2FzZSB0YWcgbmFtZVxuICAgKiBAcmV0dXJucyB0cnVlIGlmIGEgc3BlYy1jb21wbGlhbnQgcGFyc2VyIGNvdWxkIHByb2R1Y2UgdGhpcyBlbGVtZW50XG4gICAqL1xuICBjb25zdCBfY2hlY2tTdmdOYW1lc3BhY2UgPSBmdW5jdGlvbiBfY2hlY2tTdmdOYW1lc3BhY2UodGFnTmFtZSwgcGFyZW50LCBwYXJlbnRUYWdOYW1lKSB7XG4gICAgLy8gVGhlIG9ubHkgd2F5IHRvIHN3aXRjaCBmcm9tIEhUTUwgbmFtZXNwYWNlIHRvIFNWR1xuICAgIC8vIGlzIHZpYSA8c3ZnPi4gSWYgaXQgaGFwcGVucyB2aWEgYW55IG90aGVyIHRhZywgdGhlblxuICAgIC8vIGl0IHNob3VsZCBiZSBraWxsZWQuXG4gICAgaWYgKHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IEhUTUxfTkFNRVNQQUNFKSB7XG4gICAgICByZXR1cm4gdGFnTmFtZSA9PT0gJ3N2Zyc7XG4gICAgfVxuICAgIC8vIFRoZSBvbmx5IHdheSB0byBzd2l0Y2ggZnJvbSBNYXRoTUwgdG8gU1ZHIGlzIHZpYSA8c3ZnPlxuICAgIC8vIGlmIHRoZSBwYXJlbnQgaXMgZWl0aGVyIDxhbm5vdGF0aW9uLXhtbD4gb3IgYSBNYXRoTUxcbiAgICAvLyB0ZXh0IGludGVncmF0aW9uIHBvaW50LlxuICAgIGlmIChwYXJlbnQubmFtZXNwYWNlVVJJID09PSBNQVRITUxfTkFNRVNQQUNFKSB7XG4gICAgICByZXR1cm4gdGFnTmFtZSA9PT0gJ3N2ZycgJiYgKHBhcmVudFRhZ05hbWUgPT09ICdhbm5vdGF0aW9uLXhtbCcgfHwgTUFUSE1MX1RFWFRfSU5URUdSQVRJT05fUE9JTlRTW3BhcmVudFRhZ05hbWVdKTtcbiAgICB9XG4gICAgLy8gV2Ugb25seSBhbGxvdyBlbGVtZW50cyB0aGF0IGFyZSBkZWZpbmVkIGluIFNWR1xuICAgIC8vIHNwZWMuIEFsbCBvdGhlcnMgYXJlIGRpc2FsbG93ZWQgaW4gU1ZHIG5hbWVzcGFjZS5cbiAgICByZXR1cm4gQm9vbGVhbihBTExfU1ZHX1RBR1NbdGFnTmFtZV0pO1xuICB9O1xuICAvKipcbiAgICogTmFtZXNwYWNlIHJ1bGVzIGZvciBhbiBlbGVtZW50IGluIHRoZSBNYXRoTUwgbmFtZXNwYWNlLlxuICAgKlxuICAgKiBAcGFyYW0gdGFnTmFtZSB0aGUgZWxlbWVudCdzIGxvd2VyY2FzZSB0YWcgbmFtZVxuICAgKiBAcGFyYW0gcGFyZW50IHRoZSAocG9zc2libHkgc2ltdWxhdGVkKSBwYXJlbnQgbm9kZVxuICAgKiBAcGFyYW0gcGFyZW50VGFnTmFtZSB0aGUgcGFyZW50J3MgbG93ZXJjYXNlIHRhZyBuYW1lXG4gICAqIEByZXR1cm5zIHRydWUgaWYgYSBzcGVjLWNvbXBsaWFudCBwYXJzZXIgY291bGQgcHJvZHVjZSB0aGlzIGVsZW1lbnRcbiAgICovXG4gIGNvbnN0IF9jaGVja01hdGhNbE5hbWVzcGFjZSA9IGZ1bmN0aW9uIF9jaGVja01hdGhNbE5hbWVzcGFjZSh0YWdOYW1lLCBwYXJlbnQsIHBhcmVudFRhZ05hbWUpIHtcbiAgICAvLyBUaGUgb25seSB3YXkgdG8gc3dpdGNoIGZyb20gSFRNTCBuYW1lc3BhY2UgdG8gTWF0aE1MXG4gICAgLy8gaXMgdmlhIDxtYXRoPi4gSWYgaXQgaGFwcGVucyB2aWEgYW55IG90aGVyIHRhZywgdGhlblxuICAgIC8vIGl0IHNob3VsZCBiZSBraWxsZWQuXG4gICAgaWYgKHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IEhUTUxfTkFNRVNQQUNFKSB7XG4gICAgICByZXR1cm4gdGFnTmFtZSA9PT0gJ21hdGgnO1xuICAgIH1cbiAgICAvLyBUaGUgb25seSB3YXkgdG8gc3dpdGNoIGZyb20gU1ZHIHRvIE1hdGhNTCBpcyB2aWFcbiAgICAvLyA8bWF0aD4gYW5kIEhUTUwgaW50ZWdyYXRpb24gcG9pbnRzXG4gICAgaWYgKHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IFNWR19OQU1FU1BBQ0UpIHtcbiAgICAgIHJldHVybiB0YWdOYW1lID09PSAnbWF0aCcgJiYgSFRNTF9JTlRFR1JBVElPTl9QT0lOVFNbcGFyZW50VGFnTmFtZV07XG4gICAgfVxuICAgIC8vIFdlIG9ubHkgYWxsb3cgZWxlbWVudHMgdGhhdCBhcmUgZGVmaW5lZCBpbiBNYXRoTUxcbiAgICAvLyBzcGVjLiBBbGwgb3RoZXJzIGFyZSBkaXNhbGxvd2VkIGluIE1hdGhNTCBuYW1lc3BhY2UuXG4gICAgcmV0dXJuIEJvb2xlYW4oQUxMX01BVEhNTF9UQUdTW3RhZ05hbWVdKTtcbiAgfTtcbiAgLyoqXG4gICAqIE5hbWVzcGFjZSBydWxlcyBmb3IgYW4gZWxlbWVudCBpbiB0aGUgSFRNTCBuYW1lc3BhY2UuXG4gICAqXG4gICAqIEBwYXJhbSB0YWdOYW1lIHRoZSBlbGVtZW50J3MgbG93ZXJjYXNlIHRhZyBuYW1lXG4gICAqIEBwYXJhbSBwYXJlbnQgdGhlIChwb3NzaWJseSBzaW11bGF0ZWQpIHBhcmVudCBub2RlXG4gICAqIEBwYXJhbSBwYXJlbnRUYWdOYW1lIHRoZSBwYXJlbnQncyBsb3dlcmNhc2UgdGFnIG5hbWVcbiAgICogQHJldHVybnMgdHJ1ZSBpZiBhIHNwZWMtY29tcGxpYW50IHBhcnNlciBjb3VsZCBwcm9kdWNlIHRoaXMgZWxlbWVudFxuICAgKi9cbiAgY29uc3QgX2NoZWNrSHRtbE5hbWVzcGFjZSA9IGZ1bmN0aW9uIF9jaGVja0h0bWxOYW1lc3BhY2UodGFnTmFtZSwgcGFyZW50LCBwYXJlbnRUYWdOYW1lKSB7XG4gICAgLy8gVGhlIG9ubHkgd2F5IHRvIHN3aXRjaCBmcm9tIFNWRyB0byBIVE1MIGlzIHZpYVxuICAgIC8vIEhUTUwgaW50ZWdyYXRpb24gcG9pbnRzLCBhbmQgZnJvbSBNYXRoTUwgdG8gSFRNTFxuICAgIC8vIGlzIHZpYSBNYXRoTUwgdGV4dCBpbnRlZ3JhdGlvbiBwb2ludHNcbiAgICBpZiAocGFyZW50Lm5hbWVzcGFjZVVSSSA9PT0gU1ZHX05BTUVTUEFDRSAmJiAhSFRNTF9JTlRFR1JBVElPTl9QT0lOVFNbcGFyZW50VGFnTmFtZV0pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKHBhcmVudC5uYW1lc3BhY2VVUkkgPT09IE1BVEhNTF9OQU1FU1BBQ0UgJiYgIU1BVEhNTF9URVhUX0lOVEVHUkFUSU9OX1BPSU5UU1twYXJlbnRUYWdOYW1lXSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBXZSBkaXNhbGxvdyB0YWdzIHRoYXQgYXJlIHNwZWNpZmljIGZvciBNYXRoTUxcbiAgICAvLyBvciBTVkcgYW5kIHNob3VsZCBuZXZlciBhcHBlYXIgaW4gSFRNTCBuYW1lc3BhY2VcbiAgICByZXR1cm4gIUFMTF9NQVRITUxfVEFHU1t0YWdOYW1lXSAmJiAoQ09NTU9OX1NWR19BTkRfSFRNTF9FTEVNRU5UU1t0YWdOYW1lXSB8fCAhQUxMX1NWR19UQUdTW3RhZ05hbWVdKTtcbiAgfTtcbiAgLyoqXG4gICAqIEBwYXJhbSBlbGVtZW50IGEgRE9NIGVsZW1lbnQgd2hvc2UgbmFtZXNwYWNlIGlzIGJlaW5nIGNoZWNrZWRcbiAgICogQHJldHVybnMgUmV0dXJuIGZhbHNlIGlmIHRoZSBlbGVtZW50IGhhcyBhXG4gICAqICBuYW1lc3BhY2UgdGhhdCBhIHNwZWMtY29tcGxpYW50IHBhcnNlciB3b3VsZCBuZXZlclxuICAgKiAgcmV0dXJuLiBSZXR1cm4gdHJ1ZSBvdGhlcndpc2UuXG4gICAqL1xuICBjb25zdCBfY2hlY2tWYWxpZE5hbWVzcGFjZSA9IGZ1bmN0aW9uIF9jaGVja1ZhbGlkTmFtZXNwYWNlKGVsZW1lbnQpIHtcbiAgICBsZXQgcGFyZW50ID0gZ2V0UGFyZW50Tm9kZShlbGVtZW50KTtcbiAgICAvLyBJbiBKU0RPTSwgaWYgd2UncmUgaW5zaWRlIHNoYWRvdyBET00sIHRoZW4gcGFyZW50Tm9kZVxuICAgIC8vIGNhbiBiZSBudWxsLiBXZSBqdXN0IHNpbXVsYXRlIHBhcmVudCBpbiB0aGlzIGNhc2UuXG4gICAgaWYgKCFwYXJlbnQgfHwgIXBhcmVudC50YWdOYW1lKSB7XG4gICAgICBwYXJlbnQgPSB7XG4gICAgICAgIG5hbWVzcGFjZVVSSTogTkFNRVNQQUNFLFxuICAgICAgICB0YWdOYW1lOiAndGVtcGxhdGUnXG4gICAgICB9O1xuICAgIH1cbiAgICBjb25zdCB0YWdOYW1lID0gc3RyaW5nVG9Mb3dlckNhc2UoZWxlbWVudC50YWdOYW1lKTtcbiAgICBjb25zdCBwYXJlbnRUYWdOYW1lID0gc3RyaW5nVG9Mb3dlckNhc2UocGFyZW50LnRhZ05hbWUpO1xuICAgIGlmICghQUxMT1dFRF9OQU1FU1BBQ0VTW2VsZW1lbnQubmFtZXNwYWNlVVJJXSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoZWxlbWVudC5uYW1lc3BhY2VVUkkgPT09IFNWR19OQU1FU1BBQ0UpIHtcbiAgICAgIHJldHVybiBfY2hlY2tTdmdOYW1lc3BhY2UodGFnTmFtZSwgcGFyZW50LCBwYXJlbnRUYWdOYW1lKTtcbiAgICB9XG4gICAgaWYgKGVsZW1lbnQubmFtZXNwYWNlVVJJID09PSBNQVRITUxfTkFNRVNQQUNFKSB7XG4gICAgICByZXR1cm4gX2NoZWNrTWF0aE1sTmFtZXNwYWNlKHRhZ05hbWUsIHBhcmVudCwgcGFyZW50VGFnTmFtZSk7XG4gICAgfVxuICAgIGlmIChlbGVtZW50Lm5hbWVzcGFjZVVSSSA9PT0gSFRNTF9OQU1FU1BBQ0UpIHtcbiAgICAgIHJldHVybiBfY2hlY2tIdG1sTmFtZXNwYWNlKHRhZ05hbWUsIHBhcmVudCwgcGFyZW50VGFnTmFtZSk7XG4gICAgfVxuICAgIC8vIEZvciBYSFRNTCBhbmQgWE1MIGRvY3VtZW50cyB0aGF0IHN1cHBvcnQgY3VzdG9tIG5hbWVzcGFjZXNcbiAgICBpZiAoUEFSU0VSX01FRElBX1RZUEUgPT09ICdhcHBsaWNhdGlvbi94aHRtbCt4bWwnICYmIEFMTE9XRURfTkFNRVNQQUNFU1tlbGVtZW50Lm5hbWVzcGFjZVVSSV0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBUaGUgY29kZSBzaG91bGQgbmV2ZXIgcmVhY2ggdGhpcyBwbGFjZSAodGhpcyBtZWFuc1xuICAgIC8vIHRoYXQgdGhlIGVsZW1lbnQgc29tZWhvdyBnb3QgbmFtZXNwYWNlIHRoYXQgaXMgbm90XG4gICAgLy8gSFRNTCwgU1ZHLCBNYXRoTUwgb3IgYWxsb3dlZCB2aWEgQUxMT1dFRF9OQU1FU1BBQ0VTKS5cbiAgICAvLyBSZXR1cm4gZmFsc2UganVzdCBpbiBjYXNlLlxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbiAgLyoqXG4gICAqIF9mb3JjZVJlbW92ZVxuICAgKlxuICAgKiBAcGFyYW0gbm9kZSBhIERPTSBub2RlXG4gICAqL1xuICBjb25zdCBfZm9yY2VSZW1vdmUgPSBmdW5jdGlvbiBfZm9yY2VSZW1vdmUobm9kZSkge1xuICAgIGFycmF5UHVzaChET01QdXJpZnkucmVtb3ZlZCwge1xuICAgICAgZWxlbWVudDogbm9kZVxuICAgIH0pO1xuICAgIHRyeSB7XG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgdW5pY29ybi9wcmVmZXItZG9tLW5vZGUtcmVtb3ZlXG4gICAgICBnZXRQYXJlbnROb2RlKG5vZGUpLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgIC8qIFRoZSBub3JtYWwgZGV0YWNoIGZhaWxlZCDigJQgdGhpcyBpcyByZWFjaGVkIGZvciBhIHBhcmVudGxlc3Mgbm9kZVxuICAgICAgICAgKGdldFBhcmVudE5vZGUoKSBpcyBudWxsLCBzbyAucmVtb3ZlQ2hpbGQgdGhyb3dzKS4gRWxlbWVudC5wcm90b3R5cGVcbiAgICAgICAgIC5yZW1vdmUoKSBpcyBpdHNlbGYgYSBzcGVjIG5vLW9wIG9uIGEgcGFyZW50bGVzcyBub2RlLCBzbyBhIHJlY29yZGVkXG4gICAgICAgICBcInJlbW92YWxcIiB3b3VsZCBvdGhlcndpc2UgaGFuZCB0aGUgY2FsbGVyIGJhY2sgYW4gaW50YWN0LFxuICAgICAgICAgcGF5bG9hZC1iZWFyaW5nIG5vZGUgKGUuZy4gYSBkZXRhY2hlZCBJTl9QTEFDRSByb290IHRoZSBtWFNTIGNhbmFyeSBvclxuICAgICAgICAgdGhlIHN0eWxlLXdpdGgtZWxlbWVudC1jaGlsZCBydWxlIGRlY2lkZWQgdG8ga2lsbCkuIEZhaWwgY2xvc2VkIGJ5XG4gICAgICAgICB0aHJvd2luZyDigJQgZXhhY3RseSBhcyBhIGNsb2JiZXJlZCByb290IGRvZXMgYXQgdGhlIElOX1BMQUNFIGVudHJ5IOKAlFxuICAgICAgICAgcmF0aGVyIHRoYW4gdHJ5aW5nIHRvIFwibmV1dHJhbGl6ZVwiIHRoZSBub2RlIHZpYSBpdHMgb3duIG1ldGhvZHMuXG4gICAgICAgICBOZXV0cmFsaXppbmcgd291bGQgbWVhbiBjYWxsaW5nIGdldEF0dHJpYnV0ZU5hbWVzKCkvcmVtb3ZlQXR0cmlidXRlKClcbiAgICAgICAgIG9uIHRoZSBub2RlLCBib3RoIG9mIHdoaWNoIGEgPGZvcm0+IHJvb3QgY2FuIGNsb2JiZXIgdmlhIGEgbmFtZWQgY2hpbGRcbiAgICAgICAgIChhbmQgX2lzQ2xvYmJlcmVkIGRvZXMgbm90IGV2ZW4gcHJvYmUgZ2V0QXR0cmlidXRlTmFtZXMpLCBzbyB0aGVcbiAgICAgICAgIG5ldXRyYWxpemUgc3RlcCBjb3VsZCBpdHNlbGYgYmUgc2lsZW50bHkgZGVmZWF0ZWQsIGxlYXZpbmcgdGhlIHBheWxvYWRcbiAgICAgICAgIGludGFjdC4gQSB0aHJvdyB0b3VjaGVzIG9ubHkgdGhlIGNhY2hlZCwgY2xvYmJlci1zYWZlIHJlbW92ZSgpIGFuZFxuICAgICAgICAgZ2V0UGFyZW50Tm9kZSgpLiBHZW5lcmFsaXplcyBHSFNBLXI0N2ctZnZoci1oNjc2IChjbG9iYmVyZWQtZm9ybSByb290KVxuICAgICAgICAgdG8gZXZlcnkgcm9vdC1raWxsIHJlYXNvbi4gUkVQT1JULTMuXG4gICAgICAgICAgICAgICAgVGhpcyBsaXZlcyBpbnNpZGUgdGhlIGNhdGNoLCBzbyBpdCBuZXZlciBmaXJlcyBmb3IgYSBub3JtYWxseS1yZW1vdmVkXG4gICAgICAgICBpbi10cmVlIG5vZGU6IHRob3NlIGhhdmUgYSBwYXJlbnQsIHJlbW92ZUNoaWxkKCkgc3VjY2VlZHMsIGFuZCB0aGVcbiAgICAgICAgIGNhdGNoIGlzIG5vdCBlbnRlcmVkLiBPbmx5IGEga2VwdCAocGFyZW50bGVzcykgcm9vdCByZWFjaGVzIGhlcmUuICovXG4gICAgICByZW1vdmUobm9kZSk7XG4gICAgICBpZiAoIWdldFBhcmVudE5vZGUobm9kZSkpIHtcbiAgICAgICAgdGhyb3cgdHlwZUVycm9yQ3JlYXRlKCdhIG5vZGUgc2VsZWN0ZWQgZm9yIHJlbW92YWwgY291bGQgbm90IGJlIGRldGFjaGVkIGZyb20gaXRzIHRyZWUgJyArICdhbmQgY2Fubm90IGJlIHNhZmVseSByZXR1cm5lZDsgcmVmdXNpbmcgdG8gc2FuaXRpemUgaW4gcGxhY2UnKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIC8qKlxuICAgKiBfbmV1dHJhbGl6ZVJvb3RcbiAgICpcbiAgICogRmFpbC1jbG9zZWQgdGVhcmRvd24gb2YgYW4gaW4tcGxhY2Ugcm9vdCBhZnRlciB0aGUgc2FuaXRpemUgd2FsayBhYm9ydHNcbiAgICogKGNhbXBhaWduLTMgRjIpLiBBbiBpbnRlcm5hbCB0aHJvdyBtaWQtd2FsayDigJQgZS5nLiBhIHBhZ2UtcmVnaXN0ZXJlZFxuICAgKiBjdXN0b20gZWxlbWVudCdzIHJlYWN0aW9uIGRldGFjaGVzIGEgbm9kZSBzbyBgX2ZvcmNlUmVtb3ZlYCdzIGRlbGliZXJhdGVcbiAgICogcGFyZW50bGVzcyBndWFyZCB0aHJvd3MsIG9yIGFueSBvdGhlciByZS1lbnRyYW50IGVuZ2luZSBtdXRhdGlvbiDigJQgd291bGRcbiAgICogb3RoZXJ3aXNlIGxlYXZlIHRoZSBjYWxsZXIncyAqbGl2ZSogdHJlZSBoYWxmLXNhbml0aXplZCwgd2l0aCBldmVyeXRoaW5nXG4gICAqIGFmdGVyIHRoZSBhYm9ydCBwb2ludCBzdGlsbCBjYXJyeWluZyBpdHMgaGFuZGxlcnMuIFRoZXJlIGlzIG5vIHNhZmUgd2F5XG4gICAqIHRvIHJlc3VtZSB0aGUgd2FsayAodGhlIHRyZWUgbXV0YXRlZCB1bmRlciB1cyksIHNvIHdlIHN0cmlwIHRoZSByb290IGJhcmU6XG4gICAqIHJlbW92ZSBldmVyeSBjaGlsZCBhbmQgZXZlcnkgYXR0cmlidXRlLCB0aGVuIGxldCB0aGUgY2FsbGVyJ3MgY2F0Y2ggc2VlXG4gICAqIHRoZSBvcmlnaW5hbCBlcnJvci4gQ2xvYmJlci1zYWZlIChjYWNoZWQgYHJlbW92ZWAvYGNoaWxkTm9kZXNgL2BhdHRyaWJ1dGVzYFxuICAgKiBnZXR0ZXJzOyB0aGUgcm9vdCB3YXMgYWxyZWFkeSBjbG9iYmVyLXByZS1mbGlnaHRlZCBhdCB0aGUgSU5fUExBQ0UgZW50cnkpLlxuICAgKlxuICAgKiBAcGFyYW0gcm9vdCB0aGUgaW4tcGxhY2Ugcm9vdCB0byBlbXB0eVxuICAgKi9cbiAgY29uc3QgX25ldXRyYWxpemVSb290ID0gZnVuY3Rpb24gX25ldXRyYWxpemVSb290KHJvb3QpIHtcbiAgICAvKiBTdHJpcCBldmVyeSBkaXNhbGxvd2VkIGF0dHJpYnV0ZSAob24qIGhhbmRsZXJzIGluY2x1ZGVkKSBvZmYgdGhlIHdob2xlXG4gICAgICAgc3VidHJlZSBCRUZPUkUgZGV0YWNoaW5nIGFueXRoaW5nLiBEZXRhY2hpbmcgZmlyc3Qgd291bGQgaGFuZCBiYWNrXG4gICAgICAgaGFuZGxlci1iZWFyaW5nIG9yaWdpbmFscyAoZS5nLiBhbiBhbHJlYWR5LWxvYWRpbmcgYDxpbWcgb25lcnJvcj5gKVxuICAgICAgIHdob3NlIHF1ZXVlZCByZXNvdXJjZSBldmVudCBzdGlsbCBmaXJlcyBpbiBwYWdlIHNjb3BlIGFmdGVyIHdlIHRocm93LlxuICAgICAgIENsb2JiZXItc2FmZSByZWFkczsgYSBkb29tZWQgY2xvYmJlcmVkIG5vZGUncyBvd24gYXR0cmlidXRlcyBhcmVcbiAgICAgICBpcnJlbGV2YW50IHdoaWxlIGl0cyBub24tY2xvYmJlcmVkIGRlc2NlbmRhbnRzIGFyZSByZWFjaGVkIGFuZCBzY3J1YmJlZC4gKi9cbiAgICBfbmV1dHJhbGl6ZVN1YnRyZWUocm9vdCk7XG4gICAgY29uc3QgY2hpbGROb2RlcyA9IGdldENoaWxkTm9kZXMocm9vdCk7XG4gICAgaWYgKGNoaWxkTm9kZXMpIHtcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gW107XG4gICAgICBhcnJheUZvckVhY2goY2hpbGROb2RlcywgY2hpbGQgPT4ge1xuICAgICAgICBhcnJheVB1c2goc25hcHNob3QsIGNoaWxkKTtcbiAgICAgIH0pO1xuICAgICAgYXJyYXlGb3JFYWNoKHNuYXBzaG90LCBjaGlsZCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVtb3ZlKGNoaWxkKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIC8qIEJlc3QtZWZmb3J0IHRlYXJkb3duOyBhIHN0aWxsLWF0dGFjaGVkIGNoaWxkIGlzIGhhbmRsZWQgYmVsb3cgKi9cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGF0dHJpYnV0ZXMgPSBnZXRBdHRyaWJ1dGVzKHJvb3QpO1xuICAgIGlmIChhdHRyaWJ1dGVzKSB7XG4gICAgICBmb3IgKGxldCBpID0gYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICBjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2ldO1xuICAgICAgICBjb25zdCBuYW1lID0gYXR0cmlidXRlICYmIGF0dHJpYnV0ZS5uYW1lO1xuICAgICAgICBpZiAodHlwZW9mIG5hbWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJvb3QucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuICAgICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgIC8qIENsb2JiZXJlZCByZW1vdmVBdHRyaWJ1dGUg4oCUIGlnbm9yZSAoZmFpbC1jbG9zZWQgYmVzdCBlZmZvcnQpICovXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xuICAvKipcbiAgICogX3JlbW92ZUF0dHJpYnV0ZVxuICAgKlxuICAgKiBAcGFyYW0gbmFtZSBhbiBBdHRyaWJ1dGUgbmFtZVxuICAgKiBAcGFyYW0gZWxlbWVudCBhIERPTSBub2RlXG4gICAqL1xuICBjb25zdCBfcmVtb3ZlQXR0cmlidXRlID0gZnVuY3Rpb24gX3JlbW92ZUF0dHJpYnV0ZShuYW1lLCBlbGVtZW50KSB7XG4gICAgdHJ5IHtcbiAgICAgIGFycmF5UHVzaChET01QdXJpZnkucmVtb3ZlZCwge1xuICAgICAgICBhdHRyaWJ1dGU6IGVsZW1lbnQuZ2V0QXR0cmlidXRlTm9kZShuYW1lKSxcbiAgICAgICAgZnJvbTogZWxlbWVudFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoXykge1xuICAgICAgYXJyYXlQdXNoKERPTVB1cmlmeS5yZW1vdmVkLCB7XG4gICAgICAgIGF0dHJpYnV0ZTogbnVsbCxcbiAgICAgICAgZnJvbTogZWxlbWVudFxuICAgICAgfSk7XG4gICAgfVxuICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuICAgIC8vIFdlIHZvaWQgYXR0cmlidXRlIHZhbHVlcyBmb3IgdW5yZW1vdmFibGUgXCJpc1wiIGF0dHJpYnV0ZXNcbiAgICBpZiAobmFtZSA9PT0gJ2lzJykge1xuICAgICAgaWYgKFJFVFVSTl9ET00gfHwgUkVUVVJOX0RPTV9GUkFHTUVOVCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIF9mb3JjZVJlbW92ZShlbGVtZW50KTtcbiAgICAgICAgfSBjYXRjaCAoXykge31cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUobmFtZSwgJycpO1xuICAgICAgICB9IGNhdGNoIChfKSB7fVxuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgLyoqXG4gICAqIF9zdHJpcERpc2FsbG93ZWRBdHRyaWJ1dGVzXG4gICAqXG4gICAqIFJlbW92ZXMgZXZlcnkgYXR0cmlidXRlIHRoZSBhY3RpdmUgY29uZmlndXJhdGlvbiBkb2VzIG5vdCBhbGxvdyBmcm9tIGFcbiAgICogc2luZ2xlIGVsZW1lbnQsIHVzaW5nIHRoZSBzYW1lIGFsbG93bGlzdCBhcyB0aGUgbWFpbiBhdHRyaWJ1dGUgcGFzcyAoc29cbiAgICogYG9uKmAgaGFuZGxlcnMgZ28sIGJ1dCBubyBgL15vbi9gIGJsb2NrbGlzdCBpcyBpbnRyb2R1Y2VkKS4gVXNlZCBvbmx5IHRvXG4gICAqIG5ldXRyYWxpc2Ugbm9kZXMgdGhhdCBhcmUgYmVpbmcgZGlzY2FyZGVkIGZyb20gYW4gaW4tcGxhY2UgdHJlZS5cbiAgICpcbiAgICogQHBhcmFtIGVsZW1lbnQgdGhlIGVsZW1lbnQgdG8gc3RyaXBcbiAgICovXG4gIGNvbnN0IF9zdHJpcERpc2FsbG93ZWRBdHRyaWJ1dGVzID0gZnVuY3Rpb24gX3N0cmlwRGlzYWxsb3dlZEF0dHJpYnV0ZXMoZWxlbWVudCkge1xuICAgIGNvbnN0IGF0dHJpYnV0ZXMgPSBnZXRBdHRyaWJ1dGVzKGVsZW1lbnQpO1xuICAgIGlmICghYXR0cmlidXRlcykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgY29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlc1tpXTtcbiAgICAgIGNvbnN0IG5hbWUgPSBhdHRyaWJ1dGUgJiYgYXR0cmlidXRlLm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgIT09ICdzdHJpbmcnIHx8IEFMTE9XRURfQVRUUlt0cmFuc2Zvcm1DYXNlRnVuYyhuYW1lKV0pIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcbiAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgLyogQ2xvYmJlcmVkIHJlbW92ZUF0dHJpYnV0ZSBvbiBhIGRvb21lZCBub2RlIOKAlCBpZ25vcmUgKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIC8qKlxuICAgKiBfbmV1dHJhbGl6ZVN1YnRyZWVcbiAgICpcbiAgICogQ29tcGxldGVzIHRoZSBhdWRpdC01IEYxIGZpeCBhY3Jvc3MgZXZlcnkgcmVtb3ZhbCBwYXRoLiBUaGUgS0VFUF9DT05URU5UXG4gICAqIG1vdmUtaG9pc3QgbmV1dHJhbGlzZXMgb25seSBkaXNhbGxvd2VkLXRhZyByZW1vdmFsczsgY2xvYmJlciwgbVhTUy1jYW5hcnksXG4gICAqIG5hbWVzcGFjZSwgY29tbWVudCwgcHJvY2Vzc2luZy1pbnN0cnVjdGlvbiBhbmQgS0VFUF9DT05URU5UOmZhbHNlIHJlbW92YWxzXG4gICAqIGFsbCBkcm9wIHRoZWlyIHN1YnRyZWUgd2hvbGVzYWxlIHZpYSBgX2ZvcmNlUmVtb3ZlYC4gT24gdGhlIElOX1BMQUNFIHBhdGhcbiAgICogdGhvc2UgZHJvcHBlZCBub2RlcyBhcmUgZGV0YWNoZWQgZnJvbSB0aGUgY2FsbGVyJ3MgTElWRSB0cmVlIGJ1dCBhXG4gICAqIGhhbmRsZXItYmVhcmluZyBvcmlnaW5hbCBhbW9uZyB0aGVtIChhbiBgPGltZyBvbmVycm9yPmAvYDx2aWRlbz5gIHRoYXQgd2FzXG4gICAqIGxvYWRpbmcpIGtlZXBzIGl0cyBxdWV1ZWQgcmVzb3VyY2UgZXZlbnQsIHdoaWNoIGZpcmVzIGluIHBhZ2Ugc2NvcGUgYWZ0ZXJcbiAgICogc2FuaXRpemUgcmV0dXJucy4gVGhpcyB3YWxrcyBhIHJlbW92ZWQgc3VidHJlZSBhbmQgc3RyaXBzIGV2ZXJ5IGF0dHJpYnV0ZVxuICAgKiB0aGUgYWN0aXZlIGNvbmZpZ3VyYXRpb24gZG9lcyBub3QgYWxsb3cg4oCUIHNvIGBvbipgIGhhbmRsZXJzIGFyZSBjYW5jZWxsZWRcbiAgICogdGhyb3VnaCB0aGUgU0FNRSBhbGxvd2xpc3QgdGhhdCBnb3Zlcm5zIGtlcHQgbm9kZXMsIG5vdCBhIHNlcGFyYXRlIGAvXm9uL2BcbiAgICogYmxvY2tsaXN0LiBSdW4gc3luY2hyb25vdXNseSBiZWZvcmUgc2FuaXRpemUgcmV0dXJucywgaS5lLiBiZWZvcmUgYW55XG4gICAqIHF1ZXVlZCBldmVudCBjYW4gZmlyZS4gSG9vay1mcmVlIGJ5IGRlc2lnbjogdGhlc2Ugbm9kZXMgbGVhdmUgdGhlIG91dHB1dCxcbiAgICogc28gZmlyaW5nIGF0dHJpYnV0ZSBob29rcyBmb3IgdGhlbSB3b3VsZCBiZSBzdXJwcmlzaW5nLiBDbG9iYmVyLXNhZmUgcmVhZHM7XG4gICAqIGEgZG9vbWVkIGNsb2JiZXJlZCBub2RlIG1heSBzaGFkb3cgYHJlbW92ZUF0dHJpYnV0ZWAgKGl0cyBvd24gYXR0cmlidXRlcyBhcmVcbiAgICogaXJyZWxldmFudCDigJQgaXQgaXMgZGlzY2FyZGVkIOKAlCB3aGlsZSBpdHMgbm9uLWNsb2JiZXJlZCBkZXNjZW5kYW50cywgZS5nLlxuICAgKiB0aGUgYDxpbWc+YCwgYXJlIHJlYWNoZWQgYW5kIHNjcnViYmVkKS5cbiAgICpcbiAgICogQHBhcmFtIHJvb3QgdGhlIHJvb3Qgb2YgYSByZW1vdmVkIHN1YnRyZWUgdG8gbmV1dHJhbGlzZVxuICAgKi9cbiAgY29uc3QgX25ldXRyYWxpemVTdWJ0cmVlID0gZnVuY3Rpb24gX25ldXRyYWxpemVTdWJ0cmVlKHJvb3QpIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgY29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpO1xuICAgICAgY29uc3Qgbm9kZVR5cGUgPSBnZXROb2RlVHlwZSA/IGdldE5vZGVUeXBlKG5vZGUpIDogbm9kZS5ub2RlVHlwZTtcbiAgICAgIGlmIChub2RlVHlwZSA9PT0gTk9ERV9UWVBFLmVsZW1lbnQpIHtcbiAgICAgICAgX3N0cmlwRGlzYWxsb3dlZEF0dHJpYnV0ZXMobm9kZSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjaGlsZE5vZGVzID0gZ2V0Q2hpbGROb2Rlcyhub2RlKTtcbiAgICAgIGlmIChjaGlsZE5vZGVzKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSBjaGlsZE5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgc3RhY2sucHVzaChjaGlsZE5vZGVzW2ldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgLyoqXG4gICAqIF9uZXV0cmFsaXplUGF0Y2hMaW5rYWdlXG4gICAqXG4gICAqIElOX1BMQUNFIGVudHJ5IHByZS1wYXNzIChkZWNsYXJhdGl2ZS1wYXJ0aWFsLXVwZGF0ZXMgLyBzdHJlYW1pbmdcbiAgICogaGFyZGVuaW5nLCBodHRwczovL2dpdGh1Yi5jb20vV0lDRy9kZWNsYXJhdGl2ZS1wYXJ0aWFsLXVwZGF0ZXMpLlxuICAgKlxuICAgKiBUaGUgbWFpbiB3YWxrIHN0cmlwcyBwYXRjaCBsaW5rYWdlIChgZm9yYC9gcGF0Y2hzcmNgKSBhbmQgcmVtb3ZlcyByYW5nZVxuICAgKiBtYXJrZXJzIChQSXMgLyBtYXJrdXAgY29tbWVudHMpIG5vZGUtYnktbm9kZSwgaW4gZG9jdW1lbnQgb3JkZXIsIEFTIGl0XG4gICAqIHJlYWNoZXMgZWFjaCBub2RlLiBPbiBhIGxpdmUgaW4tcGxhY2Ugcm9vdCB0aGF0IGxlYXZlcyBhIHdpbmRvdzogZnJvbSB0aGVcbiAgICogbW9tZW50IHRoZSByb290IGlzIGNvbm5lY3RlZCB1bnRpbCB0aGUgd2FsayBhcnJpdmVzIGF0IGEgZ2l2ZW4gbm9kZSwgdGhhdFxuICAgKiBub2RlJ3MgbGlua2FnZSBpcyBsaXZlLiBBIHBhdGNoIGFwcGxpZWQgb24gY29ubmVjdGlvbi9zdHJlYW0gY2FuIGZpcmUgYXNcbiAgICogYSBtaWNyb3Rhc2sgZHVyaW5nIHRoZSB3YWxrIGFuZCBpbmplY3Qgb3IgdGVsZXBvcnQgYW4gdW5zYW5pdGl6ZWQgRE9NXG4gICAqIHJhbmdlIGludG8gYSByZWdpb24gdGhlIGl0ZXJhdG9yIGhhcyBhbHJlYWR5IHBhc3NlZCBhbmQgd2lsbCBub3QgcmV2aXNpdCxcbiAgICogc28gdGhlIHBvc3QtcmV0dXJuIFwidHJlZSBpcyBzYW5pdGl6ZWRcIiBjb250cmFjdCBpcyB2aW9sYXRlZC4gU3dlZXAgdGhlXG4gICAqIHdob2xlIHRyZWUgb25jZSB1cCBmcm9udCBhbmQgc2V2ZXIgZXZlcnkgbGlua2FnZSBiZWZvcmUgdGhlIHdhbGsgYmVnaW5zLFxuICAgKiBjbG9zaW5nIHRoYXQgd2luZG93LlxuICAgKlxuICAgKiBUaGlzIENBTk5PVCB1bmRvIGEgcGF0Y2ggdGhhdCBhbHJlYWR5IGZpcmVkIGJlZm9yZSBzYW5pdGl6ZSByYW4g4oCUIHRoYXQgaXNcbiAgICogdGhlIGlycmVkdWNpYmxlIFwiZG8gbm90IElOX1BMQUNFIGEgbGl2ZS1jb25uZWN0ZWQgYXR0YWNrZXIgdHJlZVwiIGNhdmVhdCDigJRcbiAgICogYnV0IGl0IGNsb3NlcyBldmVyeXRoaW5nIGZyb20gc2FuaXRpemUtc3RhcnQgb253YXJkLiBHYXRlZCBvbiBTQUZFX0ZPUl9YTUxcbiAgICogdG8gZ3JvdXAgd2l0aCB0aGUgcmVzdCBvZiB0aGUgZGVjbGFyYXRpdmUtcGFydGlhbC11cGRhdGVzIGhhbmRsaW5nIGFuZFxuICAgKiBzdGF5IG92ZXJyaWRhYmxlLCBjb25zaXN0ZW50IHdpdGggdGhlIGNvZGViYXNlLlxuICAgKlxuICAgKiBDbG9iYmVyLXNhZmUgdHJhdmVyc2FsIChjYWNoZWQgY2hpbGROb2RlcyBnZXR0ZXIpOyBwZXItbm9kZSB0cnkvY2F0Y2ggc28gYVxuICAgKiBjbG9iYmVyZWQgcm9vdCBjYW5ub3QgZGVmZWF0IHRoZSBzd2VlcCBvZiBpdHMgbm9uLWNsb2JiZXJlZCBkZXNjZW5kYW50cy5cbiAgICpcbiAgICogTk9URSAocGVuZGluZyByZWFsLUNocm9tZSBjb25maXJtYXRpb24sIHNlZSB0ZXN0L2RlY2xhcmF0aXZlLXBhdGNoLXByb2JlXG4gICAqIC5odG1sIFExKTogdGhpcyBtaXJyb3JzIHRoZSBleGlzdGluZyBwb2xpY3kgb2Yga2VlcGluZyBgZm9yYCBvblxuICAgKiA8bGFiZWw+LzxvdXRwdXQ+LiBJZiB0aGUgc2hpcHBpbmcgZmVhdHVyZSBjYW4gZHJpdmUgYSBwYXRjaCB0aHJvdWdoIGFcbiAgICogc3Vydml2aW5nIGBmb3JgLW9uLWxhYmVsL291dHB1dCArIGBpZGAgcGFpciwgdGhpcyBwcmUtcGFzcyBhbmQgdGhlXG4gICAqIGF0dHJpYnV0ZSBjaGVjayBhdCBfaXNCYXNpY0N1c3RvbUVsZW1lbnQncyBjYWxsZXIgbXVzdCBhZGRpdGlvbmFsbHkgZHJvcFxuICAgKiB0aGF0IHBhaXIgb24gdGhlIElOX1BMQUNFIHBhdGguIExlZnQgYXMtaXMgdW50aWwgdGhlIHRheG9ub215IGlzIHZlcmlmaWVkLlxuICAgKlxuICAgKiBAcGFyYW0gcm9vdCB0aGUgaW4tcGxhY2Ugcm9vdCB0byBzd2VlcFxuICAgKi9cbiAgY29uc3QgX25ldXRyYWxpemVQYXRjaExpbmthZ2UgPSBmdW5jdGlvbiBfbmV1dHJhbGl6ZVBhdGNoTGlua2FnZShyb290KSB7XG4gICAgaWYgKCFTQUZFX0ZPUl9YTUwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IG5vZGUgPSBzdGFjay5wb3AoKTtcbiAgICAgIGNvbnN0IG5vZGVUeXBlID0gZ2V0Tm9kZVR5cGUgPyBnZXROb2RlVHlwZShub2RlKSA6IG5vZGUubm9kZVR5cGU7XG4gICAgICAvKiBSZW1vdmUgcmFuZ2UgbWFya2VycyAodGhlIHRhcmdldCBzaWRlIG9mIGEgcGF0Y2ggbGlua2FnZSk6IGV2ZXJ5XG4gICAgICAgICBwcm9jZXNzaW5nIGluc3RydWN0aW9uLCBhbmQgYW55IG1hcmt1cC1iZWFyaW5nIGNvbW1lbnQuICovXG4gICAgICBpZiAobm9kZVR5cGUgPT09IE5PREVfVFlQRS5wcm9jZXNzaW5nSW5zdHJ1Y3Rpb24gfHwgbm9kZVR5cGUgPT09IE5PREVfVFlQRS5jb21tZW50ICYmIHJlZ0V4cFRlc3QoQ09NTUVOVF9NQVJLVVBfUFJPQkUsIG5vZGUuZGF0YSkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZW1vdmUobm9kZSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICAvKiBCZXN0LWVmZm9ydCAqL1xuICAgICAgICB9XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLyogU3RyaXAgcGF0Y2gtc291cmNlIGF0dHJpYnV0ZXMgKHRoZSBzb3VyY2Ugc2lkZSkgb2ZmIGVsZW1lbnRzLiAqL1xuICAgICAgaWYgKG5vZGVUeXBlID09PSBOT0RFX1RZUEUuZWxlbWVudCkge1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gbm9kZTtcbiAgICAgICAgY29uc3QgbGNUYWcgPSB0cmFuc2Zvcm1DYXNlRnVuYyhnZXROb2RlTmFtZSA/IGdldE5vZGVOYW1lKG5vZGUpIDogbm9kZS5ub2RlTmFtZSk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgaWYgKGVsZW1lbnQuaGFzQXR0cmlidXRlICYmIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdwYXRjaHNyYycpKSB7XG4gICAgICAgICAgICBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgncGF0Y2hzcmMnKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVsZW1lbnQuaGFzQXR0cmlidXRlICYmIGVsZW1lbnQuaGFzQXR0cmlidXRlKCdmb3InKSAmJiBsY1RhZyAhPT0gJ2xhYmVsJyAmJiBsY1RhZyAhPT0gJ291dHB1dCcpIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdmb3InKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICAvKiBDbG9iYmVyZWQgcmVtb3ZlQXR0cmlidXRlL2hhc0F0dHJpYnV0ZSBvbiBhIGRvb21lZCBub2RlIOKAlCBpZ25vcmUgKi9cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgY2hpbGROb2RlcyA9IGdldENoaWxkTm9kZXMobm9kZSk7XG4gICAgICBpZiAoY2hpbGROb2Rlcykge1xuICAgICAgICBmb3IgKGxldCBpID0gY2hpbGROb2Rlcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICAgIHN0YWNrLnB1c2goY2hpbGROb2Rlc1tpXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH07XG4gIC8qKlxuICAgKiBfaW5pdERvY3VtZW50XG4gICAqXG4gICAqIEBwYXJhbSBkaXJ0eSAtIGEgc3RyaW5nIG9mIGRpcnR5IG1hcmt1cFxuICAgKiBAcmV0dXJuIGEgRE9NLCBmaWxsZWQgd2l0aCB0aGUgZGlydHkgbWFya3VwXG4gICAqL1xuICBjb25zdCBfaW5pdERvY3VtZW50ID0gZnVuY3Rpb24gX2luaXREb2N1bWVudChkaXJ0eSkge1xuICAgIC8qIENyZWF0ZSBhIEhUTUwgZG9jdW1lbnQgKi9cbiAgICBsZXQgZG9jID0gbnVsbDtcbiAgICBsZXQgbGVhZGluZ1doaXRlc3BhY2UgPSBudWxsO1xuICAgIGlmIChGT1JDRV9CT0RZKSB7XG4gICAgICBkaXJ0eSA9ICc8cmVtb3ZlPjwvcmVtb3ZlPicgKyBkaXJ0eTtcbiAgICB9IGVsc2Uge1xuICAgICAgLyogSWYgRk9SQ0VfQk9EWSBpc24ndCB1c2VkLCBsZWFkaW5nIHdoaXRlc3BhY2UgbmVlZHMgdG8gYmUgcHJlc2VydmVkIG1hbnVhbGx5ICovXG4gICAgICBjb25zdCBtYXRjaGVzID0gc3RyaW5nTWF0Y2goZGlydHksIC9eW1xcclxcblxcdCBdKy8pO1xuICAgICAgbGVhZGluZ1doaXRlc3BhY2UgPSBtYXRjaGVzICYmIG1hdGNoZXNbMF07XG4gICAgfVxuICAgIGlmIChQQVJTRVJfTUVESUFfVFlQRSA9PT0gJ2FwcGxpY2F0aW9uL3hodG1sK3htbCcgJiYgTkFNRVNQQUNFID09PSBIVE1MX05BTUVTUEFDRSkge1xuICAgICAgLy8gUm9vdCBvZiBYSFRNTCBkb2MgbXVzdCBjb250YWluIHhtbG5zIGRlY2xhcmF0aW9uIChzZWUgaHR0cHM6Ly93d3cudzMub3JnL1RSL3hodG1sMS9ub3JtYXRpdmUuaHRtbCNzdHJpY3QpXG4gICAgICBkaXJ0eSA9ICc8aHRtbCB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWxcIj48aGVhZD48L2hlYWQ+PGJvZHk+JyArIGRpcnR5ICsgJzwvYm9keT48L2h0bWw+JztcbiAgICB9XG4gICAgY29uc3QgZGlydHlQYXlsb2FkID0gdHJ1c3RlZFR5cGVzUG9saWN5ID8gX2NyZWF0ZVRydXN0ZWRIVE1MKGRpcnR5KSA6IGRpcnR5O1xuICAgIC8qXG4gICAgICogVXNlIHRoZSBET01QYXJzZXIgQVBJIGJ5IGRlZmF1bHQsIGZhbGxiYWNrIGxhdGVyIGlmIG5lZWRzIGJlXG4gICAgICogRE9NUGFyc2VyIG5vdCB3b3JrIGZvciBzdmcgd2hlbiBoYXMgbXVsdGlwbGUgcm9vdCBlbGVtZW50LlxuICAgICAqL1xuICAgIGlmIChOQU1FU1BBQ0UgPT09IEhUTUxfTkFNRVNQQUNFKSB7XG4gICAgICB0cnkge1xuICAgICAgICBkb2MgPSBuZXcgRE9NUGFyc2VyKCkucGFyc2VGcm9tU3RyaW5nKGRpcnR5UGF5bG9hZCwgUEFSU0VSX01FRElBX1RZUEUpO1xuICAgICAgfSBjYXRjaCAoXykge31cbiAgICB9XG4gICAgLyogVXNlIGNyZWF0ZUhUTUxEb2N1bWVudCBpbiBjYXNlIERPTVBhcnNlciBpcyBub3QgYXZhaWxhYmxlICovXG4gICAgaWYgKCFkb2MgfHwgIWRvYy5kb2N1bWVudEVsZW1lbnQpIHtcbiAgICAgIGRvYyA9IGltcGxlbWVudGF0aW9uLmNyZWF0ZURvY3VtZW50KE5BTUVTUEFDRSwgJ3RlbXBsYXRlJywgbnVsbCk7XG4gICAgICB0cnkge1xuICAgICAgICBkb2MuZG9jdW1lbnRFbGVtZW50LmlubmVySFRNTCA9IElTX0VNUFRZX0lOUFVUID8gZW1wdHlIVE1MIDogZGlydHlQYXlsb2FkO1xuICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAvLyBTeW50YXggZXJyb3IgaWYgZGlydHlQYXlsb2FkIGlzIGludmFsaWQgeG1sXG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGJvZHkgPSBkb2MuYm9keSB8fCBkb2MuZG9jdW1lbnRFbGVtZW50O1xuICAgIGlmIChkaXJ0eSAmJiBsZWFkaW5nV2hpdGVzcGFjZSkge1xuICAgICAgYm9keS5pbnNlcnRCZWZvcmUoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobGVhZGluZ1doaXRlc3BhY2UpLCBib2R5LmNoaWxkTm9kZXNbMF0gfHwgbnVsbCk7XG4gICAgfVxuICAgIC8qIFdvcmsgb24gd2hvbGUgZG9jdW1lbnQgb3IganVzdCBpdHMgYm9keSAqL1xuICAgIGlmIChOQU1FU1BBQ0UgPT09IEhUTUxfTkFNRVNQQUNFKSB7XG4gICAgICByZXR1cm4gZ2V0RWxlbWVudHNCeVRhZ05hbWUuY2FsbChkb2MsIFdIT0xFX0RPQ1VNRU5UID8gJ2h0bWwnIDogJ2JvZHknKVswXTtcbiAgICB9XG4gICAgcmV0dXJuIFdIT0xFX0RPQ1VNRU5UID8gZG9jLmRvY3VtZW50RWxlbWVudCA6IGJvZHk7XG4gIH07XG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgTm9kZUl0ZXJhdG9yIG9iamVjdCB0aGF0IHlvdSBjYW4gdXNlIHRvIHRyYXZlcnNlIGZpbHRlcmVkIGxpc3RzIG9mIG5vZGVzIG9yIGVsZW1lbnRzIGluIGEgZG9jdW1lbnQuXG4gICAqXG4gICAqIEBwYXJhbSByb290IFRoZSByb290IGVsZW1lbnQgb3Igbm9kZSB0byBzdGFydCB0cmF2ZXJzaW5nIG9uLlxuICAgKiBAcmV0dXJuIFRoZSBjcmVhdGVkIE5vZGVJdGVyYXRvclxuICAgKi9cbiAgY29uc3QgX2NyZWF0ZU5vZGVJdGVyYXRvciA9IGZ1bmN0aW9uIF9jcmVhdGVOb2RlSXRlcmF0b3Iocm9vdCkge1xuICAgIHJldHVybiBjcmVhdGVOb2RlSXRlcmF0b3IuY2FsbChyb290Lm93bmVyRG9jdW1lbnQgfHwgcm9vdCwgcm9vdCxcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tYml0d2lzZVxuICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UIHwgTm9kZUZpbHRlci5TSE9XX0NPTU1FTlQgfCBOb2RlRmlsdGVyLlNIT1dfVEVYVCB8IE5vZGVGaWx0ZXIuU0hPV19QUk9DRVNTSU5HX0lOU1RSVUNUSU9OIHwgTm9kZUZpbHRlci5TSE9XX0NEQVRBX1NFQ1RJT04sIG51bGwpO1xuICB9O1xuICAvKipcbiAgICogUmVwbGFjZSB0ZW1wbGF0ZSBleHByZXNzaW9uIHN5bnRheCAobXVzdGFjaGUsIEVSQiwgdGVtcGxhdGVcbiAgICogbGl0ZXJhbCkgd2l0aCBhIHNwYWNlOyBzaGFyZWQgYnkgYWxsIFNBRkVfRk9SX1RFTVBMQVRFUyBzY3J1YlxuICAgKiBzaXRlcy4gT3JkZXIgbWF0dGVyczogbXVzdGFjaGUsIHRoZW4gRVJCLCB0aGVuIHRlbXBsYXRlIGxpdGVyYWwuXG4gICAqXG4gICAqIEBwYXJhbSB2YWx1ZSB0aGUgc3RyaW5nIHRvIHNjcnViXG4gICAqIEByZXR1cm5zIHRoZSBzY3J1YmJlZCBzdHJpbmdcbiAgICovXG4gIGNvbnN0IF9zdHJpcFRlbXBsYXRlRXhwcmVzc2lvbnMgPSBmdW5jdGlvbiBfc3RyaXBUZW1wbGF0ZUV4cHJlc3Npb25zKHZhbHVlKSB7XG4gICAgdmFsdWUgPSBzdHJpbmdSZXBsYWNlKHZhbHVlLCBNVVNUQUNIRV9FWFBSJDEsICcgJyk7XG4gICAgdmFsdWUgPSBzdHJpbmdSZXBsYWNlKHZhbHVlLCBFUkJfRVhQUiQxLCAnICcpO1xuICAgIHZhbHVlID0gc3RyaW5nUmVwbGFjZSh2YWx1ZSwgVE1QTElUX0VYUFIkMSwgJyAnKTtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH07XG4gIC8qKlxuICAgKiBTdHJpcCB0ZW1wbGF0ZS1lbmdpbmUgZXhwcmVzc2lvbnMgKHt7Li4ufX0sICR7Li4ufSwgPCUuLi4lPikgZnJvbSB0aGVcbiAgICogY2hhcmFjdGVyIGRhdGEgb2YgYW4gZWxlbWVudCBzdWJ0cmVlLiBVc2VkIGFzIHRoZSBmaW5hbCBzYWZldHkgbmV0IGZvclxuICAgKiBTQUZFX0ZPUl9URU1QTEFURVMgb24gZXZlcnkgRE9NLXJldHVybmluZyBjb2RlIHBhdGggc28gdGhhdCBleHByZXNzaW9uc1xuICAgKiB3aGljaCBvbmx5IGZvcm0gYWZ0ZXIgdGV4dC1ub2RlIG5vcm1hbGl6YXRpb24gKGUuZy4gZnJhZ21lbnRzIHNwbGl0IGFjcm9zc1xuICAgKiBzdHJpcHBlZCBlbGVtZW50cykgY2Fubm90IHN1cnZpdmUgaW50byBhIHRlbXBsYXRlLWV2YWx1YXRpbmcgZnJhbWV3b3JrLlxuICAgKlxuICAgKiBXYWxrcyB0ZXh0L2NvbW1lbnQvQ0RBVEEvcHJvY2Vzc2luZy1pbnN0cnVjdGlvbiBub2RlcyBhbmQgbXV0YXRlcyBgLmRhdGFgXG4gICAqIGluIHBsYWNlIHJhdGhlciB0aGFuIHJvdW5kLXRyaXBwaW5nIHRocm91Z2ggaW5uZXJIVE1MLiBUaGlzIHByZXNlcnZlc1xuICAgKiBkZXNjZW5kYW50IG5vZGUgcmVmZXJlbmNlcyAoaW1wb3J0YW50IGZvciBJTl9QTEFDRSBjYWxsZXJzKSwgYXZvaWRzIGFcbiAgICogc2VyaWFsaXplL3JlcGFyc2UgY3ljbGUsIGFuZCByZWFkcyBsaXRlcmFsIGNoYXJhY3RlciBkYXRhIOKAlCB3aGljaCBtZWFuc1xuICAgKiBgPCUuLi4lPmAgaW4gdGV4dCBjb250ZW50IG1hdGNoZXMgdGhlIEVSQiByZWdleCBhZ2FpbnN0IGl0cyByZWFsIGJ5dGVzXG4gICAqIGluc3RlYWQgb2YgdGhlIEhUTUwtZW50aXR5LWVzY2FwZWQgZm9ybSBpbm5lckhUTUwgd291bGQgcHJvZHVjZS5cbiAgICpcbiAgICogQXR0cmlidXRlIHZhbHVlcyBhcmUgbm90IHZpc2l0ZWQgaGVyZTsgU0FGRV9GT1JfVEVNUExBVEVTIGhhbmRsaW5nIGZvclxuICAgKiBhdHRyaWJ1dGVzIGlzIHBlcmZvcm1lZCBkdXJpbmcgdGhlIHBlci1ub2RlIGBfc2FuaXRpemVBdHRyaWJ1dGVzYCBwYXNzLlxuICAgKlxuICAgKiBAcGFyYW0gbm9kZSBUaGUgcm9vdCBlbGVtZW50IHdob3NlIGNoYXJhY3RlciBkYXRhIHNob3VsZCBiZSBzY3J1YmJlZC5cbiAgICovXG4gIGNvbnN0IF9zY3J1YlRlbXBsYXRlRXhwcmVzc2lvbnMyID0gZnVuY3Rpb24gX3NjcnViVGVtcGxhdGVFeHByZXNzaW9ucyhub2RlKSB7XG4gICAgdmFyIF9ub2RlJHF1ZXJ5U2VsZWN0b3JBbDtcbiAgICBub2RlLm5vcm1hbGl6ZSgpO1xuICAgIGNvbnN0IHdhbGtlciA9IGNyZWF0ZU5vZGVJdGVyYXRvci5jYWxsKG5vZGUub3duZXJEb2N1bWVudCB8fCBub2RlLCBub2RlLFxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1iaXR3aXNlXG4gICAgTm9kZUZpbHRlci5TSE9XX1RFWFQgfCBOb2RlRmlsdGVyLlNIT1dfQ09NTUVOVCB8IE5vZGVGaWx0ZXIuU0hPV19DREFUQV9TRUNUSU9OIHwgTm9kZUZpbHRlci5TSE9XX1BST0NFU1NJTkdfSU5TVFJVQ1RJT04sIG51bGwpO1xuICAgIGxldCBjdXJyZW50Tm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpO1xuICAgIHdoaWxlIChjdXJyZW50Tm9kZSkge1xuICAgICAgY3VycmVudE5vZGUuZGF0YSA9IF9zdHJpcFRlbXBsYXRlRXhwcmVzc2lvbnMoY3VycmVudE5vZGUuZGF0YSk7XG4gICAgICBjdXJyZW50Tm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpO1xuICAgIH1cbiAgICAvLyBOb2RlSXRlcmF0b3IgZG9lcyBub3QgZGVzY2VuZCBpbnRvIDx0ZW1wbGF0ZT4uY29udGVudCBwZXIgdGhlIERPTSBzcGVjLFxuICAgIC8vIHNvIHdlIG11c3QgZXhwbGljaXRseSByZWN1cnNlIGludG8gZWFjaCB0ZW1wbGF0ZSdzIGNvbnRlbnQgZnJhZ21lbnQsXG4gICAgLy8gbWlycm9yaW5nIHRoZSBhcHByb2FjaCB1c2VkIGJ5IF9zYW5pdGl6ZVNoYWRvd0RPTS5cbiAgICBjb25zdCB0ZW1wbGF0ZXMgPSAoX25vZGUkcXVlcnlTZWxlY3RvckFsID0gbm9kZS5xdWVyeVNlbGVjdG9yQWxsKSA9PT0gbnVsbCB8fCBfbm9kZSRxdWVyeVNlbGVjdG9yQWwgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9ub2RlJHF1ZXJ5U2VsZWN0b3JBbC5jYWxsKG5vZGUsICd0ZW1wbGF0ZScpO1xuICAgIGlmICh0ZW1wbGF0ZXMpIHtcbiAgICAgIGFycmF5Rm9yRWFjaCh0ZW1wbGF0ZXMsIHRtcGwgPT4ge1xuICAgICAgICBpZiAoX2lzRG9jdW1lbnRGcmFnbWVudCh0bXBsLmNvbnRlbnQpKSB7XG4gICAgICAgICAgX3NjcnViVGVtcGxhdGVFeHByZXNzaW9uczIodG1wbC5jb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9O1xuICAvKipcbiAgICogX2lzQ2xvYmJlcmVkXG4gICAqXG4gICAqIERldGVjdCBET00tY2xvYmJlcmluZyBvbiBIVE1MRm9ybUVsZW1lbnQgbm9kZXMuIEZvcm0gaXMgdGhlIG9ubHkgSFRNTFxuICAgKiBpbnRlcmZhY2Ugd2l0aCBbTGVnYWN5T3ZlcnJpZGVCdWlsdEluc107IGEgZGVzY2VuZGFudCBlbGVtZW50IHdpdGggYVxuICAgKiBgbmFtZWAgYXR0cmlidXRlIG1hdGNoaW5nIGEgcHJvdG90eXBlIHByb3BlcnR5IHNoYWRvd3MgdGhhdCBwcm9wZXJ0eVxuICAgKiBvbiBkaXJlY3QgcmVhZHMuIFdlIHVzZSB0aGlzIGNoZWNrIGF0IHRoZSBJTl9QTEFDRSBlbnRyeS1wb2ludCBhbmRcbiAgICogZHVyaW5nIGF0dHJpYnV0ZSBzYW5pdGl6YXRpb24gdG8gcmVmdXNlIGNsb2JiZXJlZCBmb3Jtcy5cbiAgICpcbiAgICogQHBhcmFtIGVsZW1lbnQgZWxlbWVudCB0byBjaGVjayBmb3IgY2xvYmJlcmluZyBhdHRhY2tzXG4gICAqIEByZXR1cm4gdHJ1ZSBpZiBjbG9iYmVyZWQsIGZhbHNlIGlmIHNhZmVcbiAgICovXG4gIGNvbnN0IF9pc0Nsb2JiZXJlZCA9IGZ1bmN0aW9uIF9pc0Nsb2JiZXJlZChlbGVtZW50KSB7XG4gICAgLy8gUmVhbG0taW5kZXBlbmRlbnQgdGFnLW5hbWUgcHJvYmUuIElmIHdlIGNhbid0IGRldGVybWluZSB0aGUgdGFnXG4gICAgLy8gbmFtZSBhdCBhbGwsIHdlIGNhbid0IHJlYXNvbiBhYm91dCBjbG9iYmVyaW5nIOKAlCByZXR1cm4gZmFsc2VcbiAgICAvLyAodGhlIGNhbGxlcidzIG90aGVyIGRlZmVuY2VzIHN0aWxsIGFwcGx5KS5cbiAgICBjb25zdCByZWFsVGFnTmFtZSA9IGdldE5vZGVOYW1lID8gZ2V0Tm9kZU5hbWUoZWxlbWVudCkgOiBudWxsO1xuICAgIGlmICh0eXBlb2YgcmVhbFRhZ05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0cmFuc2Zvcm1DYXNlRnVuYyhyZWFsVGFnTmFtZSkgIT09ICdmb3JtJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZW9mIGVsZW1lbnQubm9kZU5hbWUgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBlbGVtZW50LnRleHRDb250ZW50ICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgZWxlbWVudC5yZW1vdmVDaGlsZCAhPT0gJ2Z1bmN0aW9uJyB8fFxuICAgIC8vIFJlYWxtLXNhZmUgTmFtZWROb2RlTWFwIGRldGVjdGlvbjogZXF1YWxpdHkgYWdhaW5zdCB0aGUgY2FjaGVkXG4gICAgLy8gcHJvdG90eXBlIGdldHRlci4gQ2xvYmJlcmVkIC5hdHRyaWJ1dGVzIChlLmcuIDxpbnB1dCBuYW1lPVwiYXR0cmlidXRlc1wiPilcbiAgICAvLyBtYWtlcyB0aGUgZGlyZWN0IHJlYWQgZGl2ZXJnZSBmcm9tIHRoZSBjYWNoZWQgcmVhZDsgYSBjbGVhbiBmb3JtXG4gICAgLy8gKHNhbWUtcmVhbG0gT1IgZm9yZWlnbi1yZWFsbSkgaGFzIGJvdGggcmVhZHMgcG9pbnRpbmcgYXQgdGhlIHNhbWVcbiAgICAvLyBjYW5vbmljYWwgTmFtZWROb2RlTWFwLlxuICAgIGVsZW1lbnQuYXR0cmlidXRlcyAhPT0gZ2V0QXR0cmlidXRlcyhlbGVtZW50KSB8fCB0eXBlb2YgZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUgIT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIGVsZW1lbnQuc2V0QXR0cmlidXRlICE9PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBlbGVtZW50Lm5hbWVzcGFjZVVSSSAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIGVsZW1lbnQuaW5zZXJ0QmVmb3JlICE9PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiBlbGVtZW50Lmhhc0NoaWxkTm9kZXMgIT09ICdmdW5jdGlvbicgfHxcbiAgICAvLyBOb2RlVHlwZSBjbG9iYmVyaW5nIHByb2JlLiBDYWNoZWQgTm9kZS5wcm90b3R5cGUubm9kZVR5cGUgZ2V0dGVyXG4gICAgLy8gcmV0dXJucyB0aGUgaW50ZWdlciAxIGZvciBhbnkgRWxlbWVudCByZWdhcmRsZXNzIG9mIHJlYWxtOyBkaXJlY3RcbiAgICAvLyByZWFkIG9uIGEgY2xvYmJlcmVkIGZvcm0gKGUuZy4gPGlucHV0IG5hbWU9XCJub2RlVHlwZVwiPikgcmV0dXJuc1xuICAgIC8vIHRoZSBuYW1lZCBjaGlsZCBlbGVtZW50LiBDaGVhcCBhZGRpdGlvbiDigJQgbm9kZVR5cGUgaXMgcmVhZCBmcm9tXG4gICAgLy8gYW4gaW50ZXJuYWwgc2xvdCwgbm8gc2VyaWFsaXphdGlvbiBjb3N0IOKAlCBhbmQgcmVtb3ZlcyBhIHJlc2lkdWFsXG4gICAgLy8gY2xvYmJlcmluZyBzdXJmYWNlIHVzZWQgYnkgc2V2ZXJhbCBtWFNTIC8gUEkgLyBjb21tZW50IGJyYW5jaGVzXG4gICAgLy8gaW4gX3Nhbml0aXplRWxlbWVudHMgdGhhdCBjb21wYXJlIGN1cnJlbnROb2RlLm5vZGVUeXBlIGRpcmVjdGx5LlxuICAgIGVsZW1lbnQubm9kZVR5cGUgIT09IGdldE5vZGVUeXBlKGVsZW1lbnQpIHx8XG4gICAgLy8gSFRNTEZvcm1FbGVtZW50IGhhcyBbTGVnYWN5T3ZlcnJpZGVCdWlsdEluc106IGEgZGVzY2VuZGFudCBuYW1lZFxuICAgIC8vIFwiY2hpbGROb2Rlc1wiIHNoYWRvd3MgdGhlIHByb3RvdHlwZSBnZXR0ZXIuIERpcmVjdCByZWFkcyBvZlxuICAgIC8vIGZvcm0uY2hpbGROb2RlcyBmcm9tIGEgY2xvYmJlcmVkIGZvcm0gcmV0dXJuIHRoZSBuYW1lZCBjaGlsZFxuICAgIC8vIGluc3RlYWQgb2YgdGhlIHJlYWwgTm9kZUxpc3QsIHNvIGFueSB3YWxrIHRoYXQgcmVhZHMgaXQgZGlyZWN0bHlcbiAgICAvLyBza2lwcyB0aGUgZm9ybSdzIHJlYWwgY2hpbGRyZW4uIENvbXBhcmUgdGhlIGRpcmVjdCByZWFkIHRvIHRoZVxuICAgIC8vIGNhY2hlZCBOb2RlLnByb3RvdHlwZSBnZXR0ZXIg4oCUIHdoZW4gdGhlIGZvcm0ncyBuYW1lZC1wcm9wZXJ0eVxuICAgIC8vIGdldHRlciBpbnRlcmNlcHRzIHRoZSByZWFkLCB0aGUgdHdvIHZhbHVlcyBkaWZmZXIgYW5kIHdlIGZsYWdcbiAgICAvLyB0aGUgZm9ybS4gVGhpcyBjYXRjaGVzIGV2ZXJ5IGNsb2JiZXJpbmcgY2hpbGQgdHlwZSAoaW5wdXQsXG4gICAgLy8gc2VsZWN0LCBldGMuKSByZWdhcmRsZXNzIG9mIHdoZXRoZXIgdGhlIG5hbWVkIGNoaWxkIGhhcHBlbnMgdG9cbiAgICAvLyBjYXJyeSBhIG51bWVyaWMgLmxlbmd0aCwgd2hpY2ggYSB0eXBlb2YtYmFzZWQgcHJvYmUgd291bGQgbWlzc1xuICAgIC8vIChlLmcuIEhUTUxTZWxlY3RFbGVtZW50Lmxlbmd0aCBpcyBhIGRlZmluZWQgdW5zaWduZWQtbG9uZykuXG4gICAgZWxlbWVudC5jaGlsZE5vZGVzICE9PSBnZXRDaGlsZE5vZGVzKGVsZW1lbnQpO1xuICB9O1xuICAvKipcbiAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIHZhbHVlIGlzIGEgRG9jdW1lbnRGcmFnbWVudCBmcm9tIGFueSByZWFsbS5cbiAgICpcbiAgICogVGhlIHJlYWxtLWluZGVwZW5kZW50IHJlcGxhY2VtZW50IHJlYWRzIGBub2RlVHlwZWAgdGhyb3VnaCB0aGUgY2FjaGVkXG4gICAqIE5vZGUucHJvdG90eXBlIGdldHRlciBhbmQgY29tcGFyZXMgdG8gdGhlIERPQ1VNRU5UX0ZSQUdNRU5UX05PREVcbiAgICogY29uc3RhbnQgKDExKS4gbm9kZVR5cGUgaXMgYSBudW1lcmljIHZhbHVlIHJlc29sdmVkIGZyb20gdGhlIG5vZGUnc1xuICAgKiBpbnRlcm5hbCBzbG90LCBpZGVudGljYWwgYWNyb3NzIHJlYWxtcyBmb3IgdGhlIHNhbWUga2luZCBvZiBub2RlLlxuICAgKlxuICAgKiBAcGFyYW0gdmFsdWUgb2JqZWN0IHRvIGNoZWNrXG4gICAqIEByZXR1cm4gdHJ1ZSBpZiB2YWx1ZSBpcyBhIERvY3VtZW50RnJhZ21lbnQtc2hhcGVkIG5vZGUgZnJvbSBhbnkgcmVhbG1cbiAgICovXG4gIGNvbnN0IF9pc0RvY3VtZW50RnJhZ21lbnQgPSBmdW5jdGlvbiBfaXNEb2N1bWVudEZyYWdtZW50KHZhbHVlKSB7XG4gICAgaWYgKCFnZXROb2RlVHlwZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICByZXR1cm4gZ2V0Tm9kZVR5cGUodmFsdWUpID09PSBOT0RFX1RZUEUuZG9jdW1lbnRGcmFnbWVudDtcbiAgICB9IGNhdGNoIChfKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9O1xuICAvKipcbiAgICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIG9iamVjdCBpcyBhIERPTSBub2RlLCBpbmNsdWRpbmcgbm9kZXMgdGhhdFxuICAgKiBvcmlnaW5hdGUgZnJvbSBhIGRpZmZlcmVudCB3aW5kb3cvcmVhbG0gKGUuZy4gYW4gaWZyYW1lJ3NcbiAgICogY29udGVudERvY3VtZW50KS4gVGhlIHByZXZpb3VzIGB2YWx1ZSBpbnN0YW5jZW9mIE5vZGVgIGNoZWNrIHdhc1xuICAgKiByZWFsbS1ib3VuZDogbm9kZXMgZnJvbSBhIGRpZmZlcmVudCB3aW5kb3cgZmFpbGVkIGl0LCBjYXVzaW5nXG4gICAqIHNhbml0aXplKCkgdG8gc2lsZW50bHkgc3RyaW5naWZ5IHRoZW0gYW5kIHJlc2V0IElOX1BMQUNFIHRvIGZhbHNlLFxuICAgKiByZXR1cm5pbmcgdGhlIG9yaWdpbmFsIG5vZGUgdW5zYW5pdGl6ZWQuIFNlZSBHSFNBLTR3M3EtMzVqcC1wOTM0LlxuICAgKlxuICAgKiBAcGFyYW0gdmFsdWUgb2JqZWN0IHRvIGNoZWNrIHdoZXRoZXIgaXQncyBhIERPTSBub2RlXG4gICAqIEByZXR1cm4gdHJ1ZSBpZiB2YWx1ZSBpcyBhIERPTSBub2RlIGZyb20gYW55IHJlYWxtXG4gICAqL1xuICBjb25zdCBfaXNOb2RlID0gZnVuY3Rpb24gX2lzTm9kZSh2YWx1ZSkge1xuICAgIGlmICghZ2V0Tm9kZVR5cGUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHR5cGVvZiBnZXROb2RlVHlwZSh2YWx1ZSkgPT09ICdudW1iZXInO1xuICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH07XG4gIGZ1bmN0aW9uIF9leGVjdXRlSG9va3MoaG9va3MsIGN1cnJlbnROb2RlLCBkYXRhKSB7XG4gICAgaWYgKGhvb2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhcnJheUZvckVhY2goaG9va3MsIGhvb2sgPT4ge1xuICAgICAgaG9vay5jYWxsKERPTVB1cmlmeSwgY3VycmVudE5vZGUsIGRhdGEsIENPTkZJRyk7XG4gICAgfSk7XG4gIH1cbiAgLyoqXG4gICAqIFN0cnVjdHVyYWwtdGhyZWF0IGNoZWNrcyB0aGF0IGNvbmRlbW4gYSBub2RlIHJlZ2FyZGxlc3Mgb2YgdGhlXG4gICAqIGFsbG93bGlzdHM6IG1YU1MgdmlhIG5hbWVzcGFjZSBjb25mdXNpb24sIHJpc2t5IENTUyBjb25zdHJ1Y3Rpb24sXG4gICAqIHByb2Nlc3NpbmcgaW5zdHJ1Y3Rpb25zLCBtYXJrdXAtYmVhcmluZyBjb21tZW50cy4gUHVyZSBwcmVkaWNhdGU7XG4gICAqIHRoZSBjYWxsZXIgcmVtb3Zlcy4gQ2hlY2sgb3JkZXIgaXMgbG9hZC1iZWFyaW5nLlxuICAgKlxuICAgKiBAcGFyYW0gY3VycmVudE5vZGUgdGhlIG5vZGUgdG8gaW5zcGVjdFxuICAgKiBAcGFyYW0gdGFnTmFtZSB0aGUgbm9kZSdzIHRyYW5zZm9ybUNhc2VGdW5jJ2QgdGFnIG5hbWVcbiAgICogQHJldHVybiB0cnVlIGlmIHRoZSBub2RlIG11c3QgYmUgcmVtb3ZlZFxuICAgKi9cbiAgY29uc3QgX2lzVW5zYWZlTm9kZSA9IGZ1bmN0aW9uIF9pc1Vuc2FmZU5vZGUoY3VycmVudE5vZGUsIHRhZ05hbWUpIHtcbiAgICAvKiBEZXRlY3QgbVhTUyBhdHRlbXB0cyBhYnVzaW5nIG5hbWVzcGFjZSBjb25mdXNpb24gKi9cbiAgICBpZiAoU0FGRV9GT1JfWE1MICYmIGN1cnJlbnROb2RlLmhhc0NoaWxkTm9kZXMoKSAmJiAhX2lzTm9kZShjdXJyZW50Tm9kZS5maXJzdEVsZW1lbnRDaGlsZCkgJiYgcmVnRXhwVGVzdChFTEVNRU5UX01BUktVUF9QUk9CRSwgY3VycmVudE5vZGUudGV4dENvbnRlbnQpICYmIHJlZ0V4cFRlc3QoRUxFTUVOVF9NQVJLVVBfUFJPQkUsIGN1cnJlbnROb2RlLmlubmVySFRNTCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvKiBSZW1vdmUgcmlza3kgQ1NTIGNvbnN0cnVjdGlvbiBsZWFkaW5nIHRvIG1YU1MgKi9cbiAgICBpZiAoU0FGRV9GT1JfWE1MICYmIGN1cnJlbnROb2RlLm5hbWVzcGFjZVVSSSA9PT0gSFRNTF9OQU1FU1BBQ0UgJiYgdGFnTmFtZSA9PT0gJ3N0eWxlJyAmJiBfaXNOb2RlKGN1cnJlbnROb2RlLmZpcnN0RWxlbWVudENoaWxkKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8qIFJlbW92ZSBhbnkgb2NjdXJyZW5jZSBvZiBwcm9jZXNzaW5nIGluc3RydWN0aW9ucyAqL1xuICAgIGlmIChjdXJyZW50Tm9kZS5ub2RlVHlwZSA9PT0gTk9ERV9UWVBFLnByb2Nlc3NpbmdJbnN0cnVjdGlvbikge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8qIFJlbW92ZSBhbnkga2luZCBvZiBwb3NzaWJseSBoYXJtZnVsIGNvbW1lbnRzICovXG4gICAgaWYgKFNBRkVfRk9SX1hNTCAmJiBjdXJyZW50Tm9kZS5ub2RlVHlwZSA9PT0gTk9ERV9UWVBFLmNvbW1lbnQgJiYgcmVnRXhwVGVzdChDT01NRU5UX01BUktVUF9QUk9CRSwgY3VycmVudE5vZGUuZGF0YSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG4gIC8qKlxuICAgKiBIYW5kbGUgYSBub2RlIHdob3NlIHRhZyBpcyBmb3JiaWRkZW4gb3Igbm90IGFsbG93bGlzdGVkOiBrZWVwXG4gICAqIGFsbG93ZWQgY3VzdG9tIGVsZW1lbnRzIChmYWxzZSByZXR1cm4gZXhpdHMgX3Nhbml0aXplRWxlbWVudHNcbiAgICogZWFybHkgLSB0aGUgbmFtZXNwYWNlIGFuZCBmYWxsYmFjay10YWcgcmVtb3ZhbCBjaGVja3MgYXJlXG4gICAqIGludGVudGlvbmFsbHkgc2tpcHBlZCBmb3Iga2VwdCBjdXN0b20gZWxlbWVudHMpLCBlbHNlIGhvaXN0XG4gICAqIGNvbnRlbnQgcGVyIEtFRVBfQ09OVEVOVCBhbmQgcmVtb3ZlLlxuICAgKlxuICAgKiBBIGtlcHQgY3VzdG9tIGVsZW1lbnQgaXMgdGhlIE9OTFkgY2FzZSBpbiB3aGljaCB0aGlzIGZ1bmN0aW9uXG4gICAqIHJldHVybnMgZmFsc2UsIHNvIHRoZSBjYWxsZXIgdXNlcyB0aGF0IHJldHVybiB2YWx1ZSB0byBydW4gdGhlXG4gICAqIGFmdGVyU2FuaXRpemVFbGVtZW50cyBob29rIG9uIHRoZSBrZXB0IGVsZW1lbnQgYW5kIGtlZXAgdGhlXG4gICAqIGVsZW1lbnQtaG9vayBsaWZlY3ljbGUgY29uc2lzdGVudCB3aXRoIG5vcm1hbCBhbGxvd2xpc3RlZFxuICAgKiBlbGVtZW50cyAoR0hTQS1jMmozLTQ1Z3ItbXFjNCkuXG4gICAqXG4gICAqIEBwYXJhbSBjdXJyZW50Tm9kZSB0aGUgZGlzYWxsb3dlZCBub2RlXG4gICAqIEBwYXJhbSB0YWdOYW1lIHRoZSBub2RlJ3MgdHJhbnNmb3JtQ2FzZUZ1bmMnZCB0YWcgbmFtZVxuICAgKiBAcmV0dXJuIHRydWUgaWYgdGhlIG5vZGUgd2FzIHJlbW92ZWQsIGZhbHNlIGlmIGtlcHRcbiAgICovXG4gIGNvbnN0IF9zYW5pdGl6ZURpc2FsbG93ZWROb2RlID0gZnVuY3Rpb24gX3Nhbml0aXplRGlzYWxsb3dlZE5vZGUoY3VycmVudE5vZGUsIHRhZ05hbWUpIHtcbiAgICAvKiBDaGVjayBpZiB3ZSBoYXZlIGEgY3VzdG9tIGVsZW1lbnQgdG8gaGFuZGxlICovXG4gICAgaWYgKCFGT1JCSURfVEFHU1t0YWdOYW1lXSAmJiBfaXNCYXNpY0N1c3RvbUVsZW1lbnQodGFnTmFtZSkpIHtcbiAgICAgIGlmIChDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sgaW5zdGFuY2VvZiBSZWdFeHAgJiYgcmVnRXhwVGVzdChDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2ssIHRhZ05hbWUpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sgaW5zdGFuY2VvZiBGdW5jdGlvbiAmJiBDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sodGFnTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICAvKiBLZWVwIGNvbnRlbnQgZXhjZXB0IGZvciBiYWQtbGlzdGVkIGVsZW1lbnRzLlxuICAgICAgICAgVXNlIHRoZSBjYWNoZWQgcHJvdG90eXBlIGdldHRlcnMgZXhjbHVzaXZlbHkg4oCUIHRoZSBwcmV2aW91cyBjb2RlXG4gICAgICAgICBoYWQgYHx8IGN1cnJlbnROb2RlLnBhcmVudE5vZGVgIC8gYHx8IGN1cnJlbnROb2RlLmNoaWxkTm9kZXNgXG4gICAgICAgICBmYWxsYmFja3MsIGJ1dCB0aGUgY2FjaGVkIGdldHRlcnMgYWx3YXlzIHJldHVybiB0aGUgY2Fub25pY2FsXG4gICAgICAgICB2YWx1ZSAob3IgbnVsbCBmb3IgYSByZWFsIHBhcmVudC1sZXNzIG5vZGUpLCBzbyB0aGUgZmFsbGJhY2tcbiAgICAgICAgIHBhdGggd2FzIGRlYWQgaW4gc2FmZSBjYXNlcyBhbmQgYSBjbG9iYmVyaW5nIHN1cmZhY2UgaW4gdW5zYWZlXG4gICAgICAgICBvbmVzLiBGYWxzeSBjYWNoZWQgcmVzdWx0cyBzdGF5IGZhbHN5OyB0aGUgYGlmIChjaGlsZE5vZGVzICYmXG4gICAgICAgICBwYXJlbnROb2RlKWAgY2hlY2sgYWxyZWFkeSBnYXRlcyBjb3JyZWN0bHkuICovXG4gICAgaWYgKEtFRVBfQ09OVEVOVCAmJiAhRk9SQklEX0NPTlRFTlRTW3RhZ05hbWVdKSB7XG4gICAgICBjb25zdCBwYXJlbnROb2RlID0gZ2V0UGFyZW50Tm9kZShjdXJyZW50Tm9kZSk7XG4gICAgICBjb25zdCBjaGlsZE5vZGVzID0gZ2V0Q2hpbGROb2RlcyhjdXJyZW50Tm9kZSk7XG4gICAgICBpZiAoY2hpbGROb2RlcyAmJiBwYXJlbnROb2RlKSB7XG4gICAgICAgIGNvbnN0IGNoaWxkQ291bnQgPSBjaGlsZE5vZGVzLmxlbmd0aDtcbiAgICAgICAgLyogSW4tcGxhY2U6IGhvaXN0IHRoZSAqb3JpZ2luYWwqIGNoaWxkcmVuIHNvIHRoZSBpdGVyYXRvciB2aXNpdHNcbiAgICAgICAgICAgICBhbmQgc2FuaXRpc2VzIHRoZW0gdGhyb3VnaCB0aGUgc2FtZSBhbGxvd2xpc3QgcGFzcyBhcyBldmVyeSBvdGhlclxuICAgICAgICAgICAgIG5vZGUuIFRoZSBjYWxsZXIgYnVpbHQgdGhlIHRyZWUgaW4gdGhlIGxpdmUgZG9jdW1lbnQsIHNvIHRoZVxuICAgICAgICAgICAgIG9yaWdpbmFscyBjYXJyeSBhbHJlYWR5LXF1ZXVlZCByZXNvdXJjZSBldmVudHMgKGA8aW1nIG9uZXJyb3I+YCxcbiAgICAgICAgICAgICBgPHZpZGVvPmAvYDxhdWRpbz5gIGVycm9yLCBsYXp5L2BvbmxvYWRgLCDigKYpOyBjbG9uaW5nIHdvdWxkIGxlYXZlXG4gICAgICAgICAgICAgdGhvc2Ugb3JpZ2luYWxzIGRldGFjaGVkIGJ1dCBzdGlsbCBhcm1lZCwgZmlyaW5nIGluIHBhZ2Ugc2NvcGVcbiAgICAgICAgICAgICB3aGlsZSB0aGUgcmV0dXJuZWQgdHJlZSBsb29rZWQgY2xlYW4uIE1vdmluZyBpcyBzYWZlIGluLXBsYWNlOiB0aGVcbiAgICAgICAgICAgICByb290IGlzIHByZS12YWxpZGF0ZWQgYXMgYW4gYWxsb3dlZCB0YWcgYW5kIHNvIGlzIG5ldmVyIHRoZSBub2RlXG4gICAgICAgICAgICAgYmVpbmcgcmVtb3ZlZCwgd2hpY2gga2VlcHMgYHBhcmVudE5vZGVgIGluc2lkZSB0aGUgaXRlcmF0b3Igcm9vdFxuICAgICAgICAgICAgIGFuZCB0aGUgcmVsb2NhdGVkIGNoaWxkIGluc2lkZSB0aGUgc2VyaWFsaXNlZCB0cmVlLlxuICAgICAgICAgICAgICAgICAgICAgIE90aGVyd2lzZSAoc3RyaW5nIC8gRE9NLWNvcHkgcGF0aHMpOiBjbG9uZS4gVGhlIGl0ZXJhdG9yIGlzIHJvb3RlZFxuICAgICAgICAgICAgIGF0IOKAlCBhbmQgdGhlIHJlc3VsdCBzZXJpYWxpc2VkIGZyb20g4oCUIGBib2R5YCwgc28gYSByZXN0cmljdGl2ZVxuICAgICAgICAgICAgIEFMTE9XRURfVEFHUyB0aGF0IHJlbW92ZXMgYGJvZHlgIGl0c2VsZiBtdXN0IGxlYXZlIGl0cyBjb250ZW50IGluXG4gICAgICAgICAgICAgcGxhY2UsIHdoaWNoIG9ubHkgY2xvbmluZyBkb2VzOyBhbmQgdGhvc2UgcGF0aHMgcGFyc2UgaW50byBhblxuICAgICAgICAgICAgIGluZXJ0IGRvY3VtZW50LCBzbyB0aGVpciBkaXNjYXJkZWQgb3JpZ2luYWxzIG5ldmVyIGhhZCBhIHF1ZXVlZFxuICAgICAgICAgICAgIGV2ZW50IHRvIG5ldXRyYWxpc2UuXG4gICAgICAgICAgICAgICAgICAgICAgYGNoaWxkTm9kZXNgIGlzIGxpdmU7IGEgdGFpbC10by1oZWFkIHdhbGsga2VlcHMgYGNoaWxkTm9kZXNbaV1gXG4gICAgICAgICAgICAgdmFsaWQgd2hldGhlciB3ZSBtb3ZlIChkcm9wcyB0aGUgdHJhaWxpbmcgZW50cnkpIG9yIGNsb25lIChsZWF2ZXNcbiAgICAgICAgICAgICB0aGUgbGlzdCBpbnRhY3QpLiAqL1xuICAgICAgICBmb3IgKGxldCBpID0gY2hpbGRDb3VudCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgY29uc3QgaG9pc3RlZCA9IElOX1BMQUNFID8gY2hpbGROb2Rlc1tpXSA6IGNsb25lTm9kZShjaGlsZE5vZGVzW2ldLCB0cnVlKTtcbiAgICAgICAgICBwYXJlbnROb2RlLmluc2VydEJlZm9yZShob2lzdGVkLCBnZXROZXh0U2libGluZyhjdXJyZW50Tm9kZSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIF9mb3JjZVJlbW92ZShjdXJyZW50Tm9kZSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG4gIC8qKlxuICAgKiBfc2FuaXRpemVFbGVtZW50c1xuICAgKlxuICAgKiBAcHJvdGVjdCBub2RlTmFtZVxuICAgKiBAcHJvdGVjdCB0ZXh0Q29udGVudFxuICAgKiBAcHJvdGVjdCByZW1vdmVDaGlsZFxuICAgKiBAcGFyYW0gY3VycmVudE5vZGUgdG8gY2hlY2sgZm9yIHBlcm1pc3Npb24gdG8gZXhpc3RcbiAgICogQHJldHVybiB0cnVlIGlmIG5vZGUgd2FzIGtpbGxlZCwgZmFsc2UgaWYgbGVmdCBhbGl2ZVxuICAgKi9cbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGNvbXBsZXhpdHlcbiAgY29uc3QgX3Nhbml0aXplRWxlbWVudHMgPSBmdW5jdGlvbiBfc2FuaXRpemVFbGVtZW50cyhjdXJyZW50Tm9kZSwgcm9vdCkge1xuICAgIC8qIEV4ZWN1dGUgYSBob29rIGlmIHByZXNlbnQgKi9cbiAgICBfZXhlY3V0ZUhvb2tzKGhvb2tzLmJlZm9yZVNhbml0aXplRWxlbWVudHMsIGN1cnJlbnROb2RlLCBudWxsKTtcbiAgICAvKiBBIGhvb2sgbWF5IGhhdmUgZGV0YWNoZWQgdGhlIG5vZGUg4oCUIHRyZWF0IGl0IGFzIHJlbW92ZWQgKHNlZSB0aGVcbiAgICAgICBkZXRhY2hlZC1ub2RlIGNvbW1lbnQgYWZ0ZXIgdGhlIHVwb25TYW5pdGl6ZUVsZW1lbnQgaG9vayBiZWxvdykuICovXG4gICAgaWYgKGN1cnJlbnROb2RlICE9PSByb290ICYmIGdldFBhcmVudE5vZGUoY3VycmVudE5vZGUpID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLyogQ2hlY2sgaWYgZWxlbWVudCBpcyBjbG9iYmVyZWQgb3IgY2FuIGNsb2JiZXIgKi9cbiAgICBpZiAoX2lzQ2xvYmJlcmVkKGN1cnJlbnROb2RlKSkge1xuICAgICAgX2ZvcmNlUmVtb3ZlKGN1cnJlbnROb2RlKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvKiBOb3cgbGV0J3MgY2hlY2sgdGhlIGVsZW1lbnQncyB0eXBlIGFuZCBuYW1lICovXG4gICAgY29uc3QgdGFnTmFtZSA9IHRyYW5zZm9ybUNhc2VGdW5jKGdldE5vZGVOYW1lID8gZ2V0Tm9kZU5hbWUoY3VycmVudE5vZGUpIDogY3VycmVudE5vZGUubm9kZU5hbWUpO1xuICAgIC8qIEV4ZWN1dGUgYSBob29rIGlmIHByZXNlbnQgKi9cbiAgICBfZXhlY3V0ZUhvb2tzKGhvb2tzLnVwb25TYW5pdGl6ZUVsZW1lbnQsIGN1cnJlbnROb2RlLCB7XG4gICAgICB0YWdOYW1lLFxuICAgICAgYWxsb3dlZFRhZ3M6IEFMTE9XRURfVEFHU1xuICAgIH0pO1xuICAgIC8qIEEgaG9vayBtYXkgaGF2ZSBkZXRhY2hlZCB0aGUgbm9kZSBmcm9tIHRoZSB0cmVlIOKAlCBhIGxvbmctc3RhbmRpbmdcbiAgICAgICB1c2VyIHBhdHRlcm4gKGlzc3VlICM0Njk7IGRyYXcuaW8tc3R5bGUgZm9yZWlnbk9iamVjdCBmaWx0ZXJpbmcpLlxuICAgICAgIFBlciB0aGUgY2FjaGVkLCB1bmNsb2JiZXJhYmxlIHBhcmVudE5vZGUgZ2V0dGVyIHRoZSBub2RlIGlzXG4gICAgICAgZ2VudWluZWx5IG91dCBvZiB0aGUgdHJlZSwgc28gaXQgY2FuIHJlYWNoIG5laXRoZXIgdGhlIHNlcmlhbGl6ZWRcbiAgICAgICBvdXRwdXQgbm9yIGFuIElOX1BMQUNFIGxpdmUgdHJlZTsgdHJlYXQgaXQgYXMgcmVtb3ZlZCBhbmQgc3RvcFxuICAgICAgIHByb2Nlc3NpbmcgaXQuIFdpdGhvdXQgdGhpcyBndWFyZCwgdGhlIHVuc2FmZS1ub2RlIC8gbmFtZXNwYWNlXG4gICAgICAgY2hlY2tzIGJlbG93IHdvdWxkIGNhbGwgX2ZvcmNlUmVtb3ZlIG9uIGEgcGFyZW50bGVzcyBub2RlIGFuZCBoaXRcbiAgICAgICB0aGUgUkVQT1JULTMgZmFpbC1jbG9zZWQgdGhyb3cg4oCUIHdoaWNoIGV4aXN0cyBmb3Igbm9kZXMgRE9NUHVyaWZ5XG4gICAgICAgd2FudHMgZ29uZSBidXQgKmNhbm5vdCogZGV0YWNoIChjbG9iYmVyZWQgLyBwYXJlbnRsZXNzIHJvb3RzKSwgdGhlXG4gICAgICAgb3Bwb3NpdGUgb2YgYSBub2RlIHRoYXQgaXMgYWxyZWFkeSBzYWZlbHkgZ29uZS4gVGhlIHdhbGsgcm9vdCBpc1xuICAgICAgIGV4ZW1wdDogYSBkZXRhY2hlZCBJTl9QTEFDRSByb290IGlzIGxlZ2l0aW1hdGUgaW5wdXQgYW5kIG11c3Qgc3RpbGxcbiAgICAgICBiZSBmdWxseSBzYW5pdGl6ZWQsIGFuZCBhIGtpbGwtZGVjaXNpb24gb24gaXQgbXVzdCBrZWVwIGhpdHRpbmcgdGhlXG4gICAgICAgUkVQT1JULTMgdGhyb3cuIE5vZGVzIGRldGFjaGVkIGJ5IGhvb2tzIGFyZSB0aGUgaG9vaydzXG4gICAgICAgcmVzcG9uc2liaWxpdHk6IHRoZXkgYXJlIG5vdCByZWNvcmRlZCBpbiBET01QdXJpZnkucmVtb3ZlZCBhbmQgYXJlXG4gICAgICAgbm90IG5ldXRyYWxpemVkIGJ5IHRoZSBwb3N0LXdhbGsgSU5fUExBQ0UgcGFzcy4gKi9cbiAgICBpZiAoY3VycmVudE5vZGUgIT09IHJvb3QgJiYgZ2V0UGFyZW50Tm9kZShjdXJyZW50Tm9kZSkgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvKiBSZW1vdmUgbVhTUyB2ZWN0b3JzLCBwcm9jZXNzaW5nIGluc3RydWN0aW9ucyBhbmQgcmlza3kgY29tbWVudHMgKi9cbiAgICBpZiAoX2lzVW5zYWZlTm9kZShjdXJyZW50Tm9kZSwgdGFnTmFtZSkpIHtcbiAgICAgIF9mb3JjZVJlbW92ZShjdXJyZW50Tm9kZSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLyogUmVtb3ZlIGVsZW1lbnQgaWYgYW55dGhpbmcgZm9yYmlkcyBpdHMgcHJlc2VuY2UgKi9cbiAgICBpZiAoRk9SQklEX1RBR1NbdGFnTmFtZV0gfHwgIShFWFRSQV9FTEVNRU5UX0hBTkRMSU5HLnRhZ0NoZWNrIGluc3RhbmNlb2YgRnVuY3Rpb24gJiYgRVhUUkFfRUxFTUVOVF9IQU5ETElORy50YWdDaGVjayh0YWdOYW1lKSkgJiYgIUFMTE9XRURfVEFHU1t0YWdOYW1lXSkge1xuICAgICAgY29uc3QgcmVtb3ZlZCA9IF9zYW5pdGl6ZURpc2FsbG93ZWROb2RlKGN1cnJlbnROb2RlLCB0YWdOYW1lKTtcbiAgICAgIC8qIEEgZmFsc2UgcmV0dXJuIG1lYW5zIHRoZSBub2RlIGlzIGEgY3VzdG9tIGVsZW1lbnQga2VwdCB2aWFcbiAgICAgICAgIENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HIC0gdGhlIG9ubHkga2VlcCBwYXRoIHRocm91Z2hcbiAgICAgICAgIF9zYW5pdGl6ZURpc2FsbG93ZWROb2RlLiBSdW4gYWZ0ZXJTYW5pdGl6ZUVsZW1lbnRzIG9uIGl0IHNvIHRoZVxuICAgICAgICAgZWxlbWVudC1ob29rIGxpZmVjeWNsZSBtYXRjaGVzIG5vcm1hbCBhbGxvd2xpc3RlZCBlbGVtZW50czogYVxuICAgICAgICAgc2VjdXJpdHkgcG9saWN5IGFwcGxpZWQgaW4gdGhpcyBob29rIChlLmcuIHN0cmlwcGluZyBhbiBhdHRyaWJ1dGVcbiAgICAgICAgIGZyb20gZXZlcnkgc3Vydml2aW5nIGVsZW1lbnQpIG11c3Qgbm90IHNpbGVudGx5IHNraXAga2VwdCBjdXN0b21cbiAgICAgICAgIGVsZW1lbnRzIChHSFNBLWMyajMtNDVnci1tcWM0KS4gVGhpcyBtaXJyb3JzIHRoZSBub3JtYWwtZWxlbWVudFxuICAgICAgICAgdGFpbCBiZWxvdyAtIHRoZSBob29rIHJ1bnMsIHRoZW4gdGhlIHdhbGtlcidzIHN1YnNlcXVlbnRcbiAgICAgICAgIF9zYW5pdGl6ZUF0dHJpYnV0ZXMgcGFzcyBzYW5pdGl6ZXMgdGhlIGVsZW1lbnQncyBhdHRyaWJ1dGVzLiBUaGVcbiAgICAgICAgIGRlbGliZXJhdGVseSBza2lwcGVkIG5hbWVzcGFjZSBhbmQgZmFsbGJhY2stdGFnIHJlbW92YWwgY2hlY2tzIHN0YXlcbiAgICAgICAgIHNraXBwZWQ7IHRoZXkgYXJlIHJlbW92YWwgZGVjaXNpb25zLCBub3QgdGhlIGhvb2sgY29udHJhY3QuICovXG4gICAgICBpZiAocmVtb3ZlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgX2V4ZWN1dGVIb29rcyhob29rcy5hZnRlclNhbml0aXplRWxlbWVudHMsIGN1cnJlbnROb2RlLCBudWxsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZW1vdmVkO1xuICAgIH1cbiAgICAvKiBDaGVjayB3aGV0aGVyIGVsZW1lbnQgaGFzIGEgdmFsaWQgbmFtZXNwYWNlLlxuICAgICAgIFJlYWxtLXNhZmUgY2hlY2sgKEdIU0EtaHBjdi05NndnLTd2ajgpOiB1c2UgdGhlIGNhY2hlZCBOb2RlLnByb3RvdHlwZVxuICAgICAgIG5vZGVUeXBlIGdldHRlciByYXRoZXIgdGhhbiBgaW5zdGFuY2VvZiBFbGVtZW50YCwgd2hpY2ggaXMgcmVhbG0tXG4gICAgICAgYm91bmQgYW5kIHNob3J0LWNpcmN1aXRzIHRvIGZhbHNlIGZvciBhbnkgbm9kZSBtaW50ZWQgaW4gYSBkaWZmZXJlbnRcbiAgICAgICByZWFsbSDigJQgbGV0dGluZyBhIGZvcmVpZ24tcmVhbG0gZWxlbWVudCB3aXRoIGEgZm9yYmlkZGVuIG5hbWVzcGFjZVxuICAgICAgIHNsaXAgcGFzdCB0aGUgbmFtZXNwYWNlIGNoZWNrIGVudGlyZWx5LiAqL1xuICAgIGNvbnN0IG50ID0gZ2V0Tm9kZVR5cGUgPyBnZXROb2RlVHlwZShjdXJyZW50Tm9kZSkgOiBjdXJyZW50Tm9kZS5ub2RlVHlwZTtcbiAgICBpZiAobnQgPT09IE5PREVfVFlQRS5lbGVtZW50ICYmICFfY2hlY2tWYWxpZE5hbWVzcGFjZShjdXJyZW50Tm9kZSkpIHtcbiAgICAgIF9mb3JjZVJlbW92ZShjdXJyZW50Tm9kZSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLyogTWFrZSBzdXJlIHRoYXQgb2xkZXIgYnJvd3NlcnMgZG9uJ3QgZ2V0IGZhbGxiYWNrLXRhZyBtWFNTICovXG4gICAgaWYgKCh0YWdOYW1lID09PSAnbm9zY3JpcHQnIHx8IHRhZ05hbWUgPT09ICdub2VtYmVkJyB8fCB0YWdOYW1lID09PSAnbm9mcmFtZXMnKSAmJiByZWdFeHBUZXN0KEZBTExCQUNLX1RBR19DTE9TRSwgY3VycmVudE5vZGUuaW5uZXJIVE1MKSkge1xuICAgICAgX2ZvcmNlUmVtb3ZlKGN1cnJlbnROb2RlKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvKiBTYW5pdGl6ZSBlbGVtZW50IGNvbnRlbnQgdG8gYmUgdGVtcGxhdGUtc2FmZSAqL1xuICAgIGlmIChTQUZFX0ZPUl9URU1QTEFURVMgJiYgY3VycmVudE5vZGUubm9kZVR5cGUgPT09IE5PREVfVFlQRS50ZXh0KSB7XG4gICAgICAvKiBHZXQgdGhlIGVsZW1lbnQncyB0ZXh0IGNvbnRlbnQgKi9cbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBfc3RyaXBUZW1wbGF0ZUV4cHJlc3Npb25zKGN1cnJlbnROb2RlLnRleHRDb250ZW50KTtcbiAgICAgIGlmIChjdXJyZW50Tm9kZS50ZXh0Q29udGVudCAhPT0gY29udGVudCkge1xuICAgICAgICBhcnJheVB1c2goRE9NUHVyaWZ5LnJlbW92ZWQsIHtcbiAgICAgICAgICBlbGVtZW50OiBjdXJyZW50Tm9kZS5jbG9uZU5vZGUoKVxuICAgICAgICB9KTtcbiAgICAgICAgY3VycmVudE5vZGUudGV4dENvbnRlbnQgPSBjb250ZW50O1xuICAgICAgfVxuICAgIH1cbiAgICAvKiBFeGVjdXRlIGEgaG9vayBpZiBwcmVzZW50ICovXG4gICAgX2V4ZWN1dGVIb29rcyhob29rcy5hZnRlclNhbml0aXplRWxlbWVudHMsIGN1cnJlbnROb2RlLCBudWxsKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG4gIC8qKlxuICAgKiBfaXNWYWxpZEF0dHJpYnV0ZVxuICAgKlxuICAgKiBAcGFyYW0gbGNUYWcgTG93ZXJjYXNlIHRhZyBuYW1lIG9mIGNvbnRhaW5pbmcgZWxlbWVudC5cbiAgICogQHBhcmFtIGxjTmFtZSBMb3dlcmNhc2UgYXR0cmlidXRlIG5hbWUuXG4gICAqIEBwYXJhbSB2YWx1ZSBBdHRyaWJ1dGUgdmFsdWUuXG4gICAqIEByZXR1cm4gUmV0dXJucyB0cnVlIGlmIGB2YWx1ZWAgaXMgdmFsaWQsIG90aGVyd2lzZSBmYWxzZS5cbiAgICovXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjb21wbGV4aXR5XG4gIGNvbnN0IF9pc1ZhbGlkQXR0cmlidXRlID0gZnVuY3Rpb24gX2lzVmFsaWRBdHRyaWJ1dGUobGNUYWcsIGxjTmFtZSwgdmFsdWUpIHtcbiAgICAvKiBGT1JCSURfQVRUUiBtdXN0IGFsd2F5cyB3aW4sIGV2ZW4gaWYgQUREX0FUVFIgcHJlZGljYXRlIHdvdWxkIGFsbG93IGl0ICovXG4gICAgaWYgKEZPUkJJRF9BVFRSW2xjTmFtZV0pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLyogUmVqZWN0IGRlY2xhcmF0aXZlLXBhcnRpYWwtdXBkYXRlcyBwYXRjaC1saW5rYWdlIGF0dHJpYnV0ZXNcbiAgICAgICAoaHR0cHM6Ly9naXRodWIuY29tL1dJQ0cvZGVjbGFyYXRpdmUtcGFydGlhbC11cGRhdGVzKS5cbiAgICAgICAgICAgIEVtcGlyaWNhbCBub3RlIChDaHJvbWUgMTUwLCB2ZXJpZmllZCDigJQgc2VlXG4gICAgICAgdGVzdC9kZWNsYXJhdGl2ZS1wYXRjaC1wcm9iZS12My5odG1sKTogZXhwYW5zaW9uIGlzIE5PVCBhcHBsaWVkIGFmdGVyXG4gICAgICAgc2FuaXRpemF0aW9uLiBGb3IgdGhlIHN0cmluZyBwYXRoIGl0IGZpcmVzIGR1cmluZyBzYW5pdGl6ZSgpJ3Mgb3duXG4gICAgICAgcGFyc2UsIHNvIHRoZSB3YWxrIHNlZXMgYW5kIHNhbml0aXplcyB0aGUgZnVsbHkgbWF0ZXJpYWxpemVkIGV4cGFuZGVkXG4gICAgICAgdHJlZSDigJQgdGVsZXBvcnRzIGludG8gTWF0aE1ML1NWRyBpbnRlZ3JhdGlvbiBwb2ludHMgaW5jbHVkZWQ7IGFcbiAgICAgICB3ZWFwb25pemVkIGA8dGVtcGxhdGUgZm9yPmAtPmA8aW1nIG9uZXJyb3I+YCBjb21lcyBiYWNrIHdpdGggdGhlIGhhbmRsZXJcbiAgICAgICBzdHJpcHBlZC4gRm9yIHRoZSBJTl9QTEFDRSBwYXRoIGl0IGZpcmVzIG9uIGNvbm5lY3Rpb24sIGJlZm9yZSB0aGUgd2Fsay5cbiAgICAgICBFaXRoZXIgd2F5IERPTVB1cmlmeSBpcyBOT1QgYmxpbmQgdG8gdGhlIHBhdGNoLlxuICAgICAgICAgICAgVGhpcyByZW1vdmFsIGlzIHRoZXJlZm9yZSBkZWZlbnNlLWluLWRlcHRoIHJhdGhlciB0aGFuIHRoZSBzb2xlIGJhcnJpZXI6XG4gICAgICAgaXQgcHJldmVudHMgbGl2ZSBsaW5rYWdlIGZyb20gc3Vydml2aW5nIGludG8gdGhlIE9VVFBVVCBhbmQgcmUtZXhwYW5kaW5nXG4gICAgICAgaW4gdGhlIGNhbGxlcidzIGNvbnRleHQsIGFuZCBrZWVwcyBiZWhhdmlvdXIgZGV0ZXJtaW5pc3RpYyBpZiBhIGZ1dHVyZVxuICAgICAgIGVuZ2luZSBkZWZlcnMgZXhwYW5zaW9uLiBgZm9yYCBpcyBsZWdpdGltYXRlIG9ubHkgb24gPGxhYmVsPi88b3V0cHV0PjtcbiAgICAgICBhbnl3aGVyZSBlbHNlIChub3RhYmx5IDx0ZW1wbGF0ZSBmb3I+KSBpdCBsaW5rcyB0aGUgZWxlbWVudCB0byBhIHBhdGNoXG4gICAgICAgdGFyZ2V0IGFuZCB0ZWxlcG9ydHMgb3IgcmVtb3ZlcyBhbiBhcmJpdHJhcnkgRE9NIHJhbmdlIGJ5IGlkL21hcmtlciBuYW1lLlxuICAgICAgIGBwYXRjaHNyY2AgZmV0Y2hlcyByZW1vdGUgbWFya3VwIGFuZCBpcyB0cmVhdGVkIGFzIGEgc2NyaXB0LWxvYWRpbmdcbiAgICAgICBtZWNoYW5pc20gKENTUCkuIEdhdGVkIG9uIFNBRkVfRk9SX1hNTCBzbyB0aGUgcmVtb3ZhbCBncm91cHMgd2l0aCB0aGVcbiAgICAgICBvdGhlciBzdHJ1Y3R1cmFsLXRocmVhdCBjaGVja3MgYW5kIHN0YXlzIG92ZXJyaWRhYmxlLCBjb25zaXN0ZW50IHdpdGhcbiAgICAgICB0aGUgcmVzdCBvZiB0aGUgY29kZWJhc2UuIFBJIHJhbmdlIG1hcmtlcnMgYXJlIGFscmVhZHkgcmVtb3ZlZCBieVxuICAgICAgIF9pc1Vuc2FmZU5vZGUuICovXG4gICAgaWYgKFNBRkVfRk9SX1hNTCAmJiBsY05hbWUgPT09ICdwYXRjaHNyYycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKFNBRkVfRk9SX1hNTCAmJiBsY05hbWUgPT09ICdmb3InICYmIGxjVGFnICE9PSAnbGFiZWwnICYmIGxjVGFnICE9PSAnb3V0cHV0Jykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvKiBNYWtlIHN1cmUgYXR0cmlidXRlIGNhbm5vdCBjbG9iYmVyICovXG4gICAgaWYgKFNBTklUSVpFX0RPTSAmJiAobGNOYW1lID09PSAnaWQnIHx8IGxjTmFtZSA9PT0gJ25hbWUnKSAmJiAodmFsdWUgaW4gZG9jdW1lbnQgfHwgdmFsdWUgaW4gZm9ybUVsZW1lbnQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG5hbWVJc1Blcm1pdHRlZCA9IEFMTE9XRURfQVRUUltsY05hbWVdIHx8IEVYVFJBX0VMRU1FTlRfSEFORExJTkcuYXR0cmlidXRlQ2hlY2sgaW5zdGFuY2VvZiBGdW5jdGlvbiAmJiBFWFRSQV9FTEVNRU5UX0hBTkRMSU5HLmF0dHJpYnV0ZUNoZWNrKGxjTmFtZSwgbGNUYWcpO1xuICAgIC8qIEFsbG93IHZhbGlkIGRhdGEtKiBhdHRyaWJ1dGVzOiBBdCBsZWFzdCBvbmUgY2hhcmFjdGVyIGFmdGVyIFwiLVwiXG4gICAgICAgIChodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9kb20uaHRtbCNlbWJlZGRpbmctY3VzdG9tLW5vbi12aXNpYmxlLWRhdGEtd2l0aC10aGUtZGF0YS0qLWF0dHJpYnV0ZXMpXG4gICAgICAgIFhNTC1jb21wYXRpYmxlIChodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9pbmZyYXN0cnVjdHVyZS5odG1sI3htbC1jb21wYXRpYmxlIGFuZCBodHRwOi8vd3d3LnczLm9yZy9UUi94bWwvI2QwZTgwNClcbiAgICAgICAgV2UgZG9uJ3QgbmVlZCB0byBjaGVjayB0aGUgdmFsdWU7IGl0J3MgYWx3YXlzIFVSSSBzYWZlLiAqL1xuICAgIGlmIChBTExPV19EQVRBX0FUVFIgJiYgcmVnRXhwVGVzdChEQVRBX0FUVFIkMSwgbGNOYW1lKSkgOyBlbHNlIGlmIChBTExPV19BUklBX0FUVFIgJiYgcmVnRXhwVGVzdChBUklBX0FUVFIkMSwgbGNOYW1lKSkgOyBlbHNlIGlmICghbmFtZUlzUGVybWl0dGVkKSB7XG4gICAgICBpZiAoXG4gICAgICAvLyBGaXJzdCBjb25kaXRpb24gZG9lcyBhIHZlcnkgYmFzaWMgY2hlY2sgaWYgYSkgaXQncyBiYXNpY2FsbHkgYSB2YWxpZCBjdXN0b20gZWxlbWVudCB0YWduYW1lIEFORFxuICAgICAgLy8gYikgaWYgdGhlIHRhZ05hbWUgcGFzc2VzIHdoYXRldmVyIHRoZSB1c2VyIGhhcyBjb25maWd1cmVkIGZvciBDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2tcbiAgICAgIC8vIGFuZCBjKSBpZiB0aGUgYXR0cmlidXRlIG5hbWUgcGFzc2VzIHdoYXRldmVyIHRoZSB1c2VyIGhhcyBjb25maWd1cmVkIGZvciBDVVNUT01fRUxFTUVOVF9IQU5ETElORy5hdHRyaWJ1dGVOYW1lQ2hlY2tcbiAgICAgIF9pc0Jhc2ljQ3VzdG9tRWxlbWVudChsY1RhZykgJiYgKENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HLnRhZ05hbWVDaGVjayBpbnN0YW5jZW9mIFJlZ0V4cCAmJiByZWdFeHBUZXN0KENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HLnRhZ05hbWVDaGVjaywgbGNUYWcpIHx8IENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HLnRhZ05hbWVDaGVjayBpbnN0YW5jZW9mIEZ1bmN0aW9uICYmIENVU1RPTV9FTEVNRU5UX0hBTkRMSU5HLnRhZ05hbWVDaGVjayhsY1RhZykpICYmIChDVVNUT01fRUxFTUVOVF9IQU5ETElORy5hdHRyaWJ1dGVOYW1lQ2hlY2sgaW5zdGFuY2VvZiBSZWdFeHAgJiYgcmVnRXhwVGVzdChDVVNUT01fRUxFTUVOVF9IQU5ETElORy5hdHRyaWJ1dGVOYW1lQ2hlY2ssIGxjTmFtZSkgfHwgQ1VTVE9NX0VMRU1FTlRfSEFORExJTkcuYXR0cmlidXRlTmFtZUNoZWNrIGluc3RhbmNlb2YgRnVuY3Rpb24gJiYgQ1VTVE9NX0VMRU1FTlRfSEFORExJTkcuYXR0cmlidXRlTmFtZUNoZWNrKGxjTmFtZSwgbGNUYWcpKSB8fFxuICAgICAgLy8gQWx0ZXJuYXRpdmUsIHNlY29uZCBjb25kaXRpb24gY2hlY2tzIGlmIGl0J3MgYW4gYGlzYC1hdHRyaWJ1dGUsIEFORFxuICAgICAgLy8gdGhlIHZhbHVlIHBhc3NlcyB3aGF0ZXZlciB0aGUgdXNlciBoYXMgY29uZmlndXJlZCBmb3IgQ1VTVE9NX0VMRU1FTlRfSEFORExJTkcudGFnTmFtZUNoZWNrXG4gICAgICBsY05hbWUgPT09ICdpcycgJiYgQ1VTVE9NX0VMRU1FTlRfSEFORExJTkcuYWxsb3dDdXN0b21pemVkQnVpbHRJbkVsZW1lbnRzICYmIChDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sgaW5zdGFuY2VvZiBSZWdFeHAgJiYgcmVnRXhwVGVzdChDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2ssIHZhbHVlKSB8fCBDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sgaW5zdGFuY2VvZiBGdW5jdGlvbiAmJiBDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sodmFsdWUpKSkgOyBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgLyogQ2hlY2sgdmFsdWUgaXMgc2FmZS4gRmlyc3QsIGlzIGF0dHIgaW5lcnQ/IElmIHNvLCBpcyBzYWZlICovXG4gICAgfSBlbHNlIGlmIChVUklfU0FGRV9BVFRSSUJVVEVTW2xjTmFtZV0pIDsgZWxzZSBpZiAocmVnRXhwVGVzdChJU19BTExPV0VEX1VSSSQxLCBzdHJpbmdSZXBsYWNlKHZhbHVlLCBBVFRSX1dISVRFU1BBQ0UkMSwgJycpKSkgOyBlbHNlIGlmICgobGNOYW1lID09PSAnc3JjJyB8fCBsY05hbWUgPT09ICd4bGluazpocmVmJyB8fCBsY05hbWUgPT09ICdocmVmJykgJiYgbGNUYWcgIT09ICdzY3JpcHQnICYmIHN0cmluZ0luZGV4T2YodmFsdWUsICdkYXRhOicpID09PSAwICYmIERBVEFfVVJJX1RBR1NbbGNUYWddKSA7IGVsc2UgaWYgKEFMTE9XX1VOS05PV05fUFJPVE9DT0xTICYmICFyZWdFeHBUZXN0KElTX1NDUklQVF9PUl9EQVRBJDEsIHN0cmluZ1JlcGxhY2UodmFsdWUsIEFUVFJfV0hJVEVTUEFDRSQxLCAnJykpKSA7IGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIDtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcbiAgLyogTmFtZXMgdGhlIEhUTUwgc3BlYyByZXNlcnZlcyBmcm9tIHZhbGlkLWN1c3RvbS1lbGVtZW50LW5hbWU7IHRoZXNlIG11c3RcbiAgICogbmV2ZXIgYmUgdHJlYXRlZCBhcyBiYXNpYyBjdXN0b20gZWxlbWVudHMgZXZlbiB3aGVuIGEgcGVybWlzc2l2ZVxuICAgKiBDVVNUT01fRUxFTUVOVF9IQU5ETElORy50YWdOYW1lQ2hlY2sgaXMgY29uZmlndXJlZC4gKi9cbiAgY29uc3QgUkVTRVJWRURfQ1VTVE9NX0VMRU1FTlRfTkFNRVMgPSBhZGRUb1NldCh7fSwgWydhbm5vdGF0aW9uLXhtbCcsICdjb2xvci1wcm9maWxlJywgJ2ZvbnQtZmFjZScsICdmb250LWZhY2UtZm9ybWF0JywgJ2ZvbnQtZmFjZS1uYW1lJywgJ2ZvbnQtZmFjZS1zcmMnLCAnZm9udC1mYWNlLXVyaScsICdtaXNzaW5nLWdseXBoJ10pO1xuICAvKipcbiAgICogX2lzQmFzaWNDdXN0b21FbGVtZW50XG4gICAqIGNoZWNrcyBpZiBhdCBsZWFzdCBvbmUgZGFzaCBpcyBpbmNsdWRlZCBpbiB0YWdOYW1lLCBhbmQgaXQncyBub3QgdGhlIGZpcnN0IGNoYXJcbiAgICogZm9yIG1vcmUgc29waGlzdGljYXRlZCBjaGVja2luZyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL3NpbmRyZXNvcmh1cy92YWxpZGF0ZS1lbGVtZW50LW5hbWVcbiAgICpcbiAgICogQHBhcmFtIHRhZ05hbWUgbmFtZSBvZiB0aGUgdGFnIG9mIHRoZSBub2RlIHRvIHNhbml0aXplXG4gICAqIEByZXR1cm5zIFJldHVybnMgdHJ1ZSBpZiB0aGUgdGFnIG5hbWUgbWVldHMgdGhlIGJhc2ljIGNyaXRlcmlhIGZvciBhIGN1c3RvbSBlbGVtZW50LCBvdGhlcndpc2UgZmFsc2UuXG4gICAqL1xuICBjb25zdCBfaXNCYXNpY0N1c3RvbUVsZW1lbnQgPSBmdW5jdGlvbiBfaXNCYXNpY0N1c3RvbUVsZW1lbnQodGFnTmFtZSkge1xuICAgIHJldHVybiAhUkVTRVJWRURfQ1VTVE9NX0VMRU1FTlRfTkFNRVNbc3RyaW5nVG9Mb3dlckNhc2UodGFnTmFtZSldICYmIHJlZ0V4cFRlc3QoQ1VTVE9NX0VMRU1FTlQkMSwgdGFnTmFtZSk7XG4gIH07XG4gIC8qKlxuICAgKiBXcmFwIGFuIGF0dHJpYnV0ZSB2YWx1ZSBpbiB0aGUgbWF0Y2hpbmcgVHJ1c3RlZCBUeXBlcyBvYmplY3Qgd2hlblxuICAgKiB0aGUgYWN0aXZlIHBvbGljeSByZXF1aXJlcyBpdC4gTmFtZXNwYWNlZCBhdHRyaWJ1dGVzIHBhc3MgdGhyb3VnaFxuICAgKiB1bmNoYW5nZWQgKG5vIFRUIHN1cHBvcnQgeWV0LCBzZWVcbiAgICogaHR0cHM6Ly9idWdzLmNocm9taXVtLm9yZy9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MTMwNTI5MykuXG4gICAqXG4gICAqIEBwYXJhbSBsY1RhZyBsb3dlcmNhc2UgdGFnIG5hbWUgb2YgdGhlIGNvbnRhaW5pbmcgZWxlbWVudFxuICAgKiBAcGFyYW0gbGNOYW1lIGxvd2VyY2FzZSBhdHRyaWJ1dGUgbmFtZVxuICAgKiBAcGFyYW0gbmFtZXNwYWNlVVJJIHRoZSBhdHRyaWJ1dGUncyBuYW1lc3BhY2UsIGlmIGFueVxuICAgKiBAcGFyYW0gdmFsdWUgdGhlIGF0dHJpYnV0ZSB2YWx1ZSB0byB3cmFwXG4gICAqIEByZXR1cm4gdGhlIHZhbHVlLCB3cmFwcGVkIHdoZW4gVHJ1c3RlZCBUeXBlcyBkZW1hbmQgaXRcbiAgICovXG4gIGNvbnN0IF9hcHBseVRydXN0ZWRUeXBlc1RvQXR0cmlidXRlID0gZnVuY3Rpb24gX2FwcGx5VHJ1c3RlZFR5cGVzVG9BdHRyaWJ1dGUobGNUYWcsIGxjTmFtZSwgbmFtZXNwYWNlVVJJLCB2YWx1ZSkge1xuICAgIGlmICh0cnVzdGVkVHlwZXNQb2xpY3kgJiYgdHlwZW9mIHRydXN0ZWRUeXBlcyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIHRydXN0ZWRUeXBlcy5nZXRBdHRyaWJ1dGVUeXBlID09PSAnZnVuY3Rpb24nICYmICFuYW1lc3BhY2VVUkkpIHtcbiAgICAgIHN3aXRjaCAodHJ1c3RlZFR5cGVzLmdldEF0dHJpYnV0ZVR5cGUobGNUYWcsIGxjTmFtZSkpIHtcbiAgICAgICAgY2FzZSAnVHJ1c3RlZEhUTUwnOlxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHJldHVybiBfY3JlYXRlVHJ1c3RlZEhUTUwodmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAnVHJ1c3RlZFNjcmlwdFVSTCc6XG4gICAgICAgICAge1xuICAgICAgICAgICAgcmV0dXJuIF9jcmVhdGVUcnVzdGVkU2NyaXB0VVJMKHZhbHVlKTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcbiAgLyoqXG4gICAqIFdyaXRlIGEgbW9kaWZpZWQgYXR0cmlidXRlIHZhbHVlIGJhY2sgb250byB0aGUgZWxlbWVudC4gT25cbiAgICogc3VjY2VzcywgcmUtcHJvYmUgZm9yIGNsb2JiZXJpbmcgaW50cm9kdWNlZCBieSB0aGUgbmV3IHZhbHVlIGFuZFxuICAgKiByZW1vdmUgdGhlIGVsZW1lbnQgd2hlbiBmb3VuZDsgb3RoZXJ3aXNlIHBvcCB0aGUgcmVtb3ZhbCBlbnRyeVxuICAgKiByZWNvcmRlZCBieSB0aGUgZWFybGllciBfcmVtb3ZlQXR0cmlidXRlIChsb25nLXN0YW5kaW5nIHBhaXJpbmdcbiAgICogd2l0aCB0aGUgU0FOSVRJWkVfTkFNRURfUFJPUFMgcGF0aCAtIGRvIG5vdCBcImZpeFwiIGNhc3VhbGx5KS4gT25cbiAgICogZmFpbHVyZSwgcmVtb3ZlIHRoZSBhdHRyaWJ1dGUgaW5zdGVhZC5cbiAgICpcbiAgICogQHBhcmFtIGN1cnJlbnROb2RlIHRoZSBlbGVtZW50IGNhcnJ5aW5nIHRoZSBhdHRyaWJ1dGVcbiAgICogQHBhcmFtIG5hbWUgdGhlIGF0dHJpYnV0ZSBuYW1lIGFzIHByZXNlbnQgb24gdGhlIGVsZW1lbnRcbiAgICogQHBhcmFtIG5hbWVzcGFjZVVSSSB0aGUgYXR0cmlidXRlJ3MgbmFtZXNwYWNlLCBpZiBhbnlcbiAgICogQHBhcmFtIHZhbHVlIHRoZSBuZXcgYXR0cmlidXRlIHZhbHVlXG4gICAqL1xuICBjb25zdCBfc2V0QXR0cmlidXRlVmFsdWUgPSBmdW5jdGlvbiBfc2V0QXR0cmlidXRlVmFsdWUoY3VycmVudE5vZGUsIG5hbWUsIG5hbWVzcGFjZVVSSSwgdmFsdWUpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKG5hbWVzcGFjZVVSSSkge1xuICAgICAgICBjdXJyZW50Tm9kZS5zZXRBdHRyaWJ1dGVOUyhuYW1lc3BhY2VVUkksIG5hbWUsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIEZhbGxiYWNrIHRvIHNldEF0dHJpYnV0ZSgpIGZvciBicm93c2VyLXVucmVjb2duaXplZCBuYW1lc3BhY2VzIGUuZy4gXCJ4LXNjaGVtYVwiLiAqL1xuICAgICAgICBjdXJyZW50Tm9kZS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgICAgaWYgKF9pc0Nsb2JiZXJlZChjdXJyZW50Tm9kZSkpIHtcbiAgICAgICAgX2ZvcmNlUmVtb3ZlKGN1cnJlbnROb2RlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFycmF5UG9wKERPTVB1cmlmeS5yZW1vdmVkKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChfKSB7XG4gICAgICBfcmVtb3ZlQXR0cmlidXRlKG5hbWUsIGN1cnJlbnROb2RlKTtcbiAgICB9XG4gIH07XG4gIC8qKlxuICAgKiBfc2FuaXRpemVBdHRyaWJ1dGVzXG4gICAqXG4gICAqIEBwcm90ZWN0IGF0dHJpYnV0ZXNcbiAgICogQHByb3RlY3Qgbm9kZU5hbWVcbiAgICogQHByb3RlY3QgcmVtb3ZlQXR0cmlidXRlXG4gICAqIEBwcm90ZWN0IHNldEF0dHJpYnV0ZVxuICAgKlxuICAgKiBAcGFyYW0gY3VycmVudE5vZGUgdG8gc2FuaXRpemVcbiAgICovXG4gIGNvbnN0IF9zYW5pdGl6ZUF0dHJpYnV0ZXMgPSBmdW5jdGlvbiBfc2FuaXRpemVBdHRyaWJ1dGVzKGN1cnJlbnROb2RlKSB7XG4gICAgLyogRXhlY3V0ZSBhIGhvb2sgaWYgcHJlc2VudCAqL1xuICAgIF9leGVjdXRlSG9va3MoaG9va3MuYmVmb3JlU2FuaXRpemVBdHRyaWJ1dGVzLCBjdXJyZW50Tm9kZSwgbnVsbCk7XG4gICAgY29uc3QgYXR0cmlidXRlcyA9IGN1cnJlbnROb2RlLmF0dHJpYnV0ZXM7XG4gICAgLyogQ2hlY2sgaWYgd2UgaGF2ZSBhdHRyaWJ1dGVzOyBpZiBub3Qgd2UgbWlnaHQgaGF2ZSBhIHRleHQgbm9kZSAqL1xuICAgIGlmICghYXR0cmlidXRlcyB8fCBfaXNDbG9iYmVyZWQoY3VycmVudE5vZGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGhvb2tFdmVudCA9IHtcbiAgICAgIGF0dHJOYW1lOiAnJyxcbiAgICAgIGF0dHJWYWx1ZTogJycsXG4gICAgICBrZWVwQXR0cjogdHJ1ZSxcbiAgICAgIGFsbG93ZWRBdHRyaWJ1dGVzOiBBTExPV0VEX0FUVFIsXG4gICAgICBmb3JjZUtlZXBBdHRyOiB1bmRlZmluZWRcbiAgICB9O1xuICAgIGxldCBsID0gYXR0cmlidXRlcy5sZW5ndGg7XG4gICAgY29uc3QgbGNUYWcgPSB0cmFuc2Zvcm1DYXNlRnVuYyhjdXJyZW50Tm9kZS5ub2RlTmFtZSk7XG4gICAgLyogR28gYmFja3dhcmRzIG92ZXIgYWxsIGF0dHJpYnV0ZXM7IHNhZmVseSByZW1vdmUgYmFkIG9uZXMgKi9cbiAgICB3aGlsZSAobC0tKSB7XG4gICAgICBjb25zdCBhdHRyID0gYXR0cmlidXRlc1tsXTtcbiAgICAgIGNvbnN0IG5hbWUgPSBhdHRyLm5hbWUsXG4gICAgICAgIG5hbWVzcGFjZVVSSSA9IGF0dHIubmFtZXNwYWNlVVJJLFxuICAgICAgICBhdHRyVmFsdWUgPSBhdHRyLnZhbHVlO1xuICAgICAgY29uc3QgbGNOYW1lID0gdHJhbnNmb3JtQ2FzZUZ1bmMobmFtZSk7XG4gICAgICBjb25zdCBpbml0VmFsdWUgPSBhdHRyVmFsdWU7XG4gICAgICBsZXQgdmFsdWUgPSBuYW1lID09PSAndmFsdWUnID8gaW5pdFZhbHVlIDogc3RyaW5nVHJpbShpbml0VmFsdWUpO1xuICAgICAgLyogRXhlY3V0ZSBhIGhvb2sgaWYgcHJlc2VudCAqL1xuICAgICAgaG9va0V2ZW50LmF0dHJOYW1lID0gbGNOYW1lO1xuICAgICAgaG9va0V2ZW50LmF0dHJWYWx1ZSA9IHZhbHVlO1xuICAgICAgaG9va0V2ZW50LmtlZXBBdHRyID0gdHJ1ZTtcbiAgICAgIGhvb2tFdmVudC5mb3JjZUtlZXBBdHRyID0gdW5kZWZpbmVkOyAvLyBBbGxvd3MgZGV2ZWxvcGVycyB0byBzZWUgdGhpcyBpcyBhIHByb3BlcnR5IHRoZXkgY2FuIHNldFxuICAgICAgX2V4ZWN1dGVIb29rcyhob29rcy51cG9uU2FuaXRpemVBdHRyaWJ1dGUsIGN1cnJlbnROb2RlLCBob29rRXZlbnQpO1xuICAgICAgdmFsdWUgPSBob29rRXZlbnQuYXR0clZhbHVlO1xuICAgICAgLyogRnVsbCBET00gQ2xvYmJlcmluZyBwcm90ZWN0aW9uIHZpYSBuYW1lc3BhY2UgaXNvbGF0aW9uLFxuICAgICAgICogUHJlZml4IGlkIGFuZCBuYW1lIGF0dHJpYnV0ZXMgd2l0aCBgdXNlci1jb250ZW50LWBcbiAgICAgICAqL1xuICAgICAgaWYgKFNBTklUSVpFX05BTUVEX1BST1BTICYmIChsY05hbWUgPT09ICdpZCcgfHwgbGNOYW1lID09PSAnbmFtZScpICYmIHN0cmluZ0luZGV4T2YodmFsdWUsIFNBTklUSVpFX05BTUVEX1BST1BTX1BSRUZJWCkgIT09IDApIHtcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBhdHRyaWJ1dGUgd2l0aCB0aGlzIHZhbHVlXG4gICAgICAgIF9yZW1vdmVBdHRyaWJ1dGUobmFtZSwgY3VycmVudE5vZGUpO1xuICAgICAgICAvLyBQcmVmaXggdGhlIHZhbHVlIGFuZCBsYXRlciByZS1jcmVhdGUgdGhlIGF0dHJpYnV0ZSB3aXRoIHRoZSBzYW5pdGl6ZWQgdmFsdWVcbiAgICAgICAgdmFsdWUgPSBTQU5JVElaRV9OQU1FRF9QUk9QU19QUkVGSVggKyB2YWx1ZTtcbiAgICAgIH1cbiAgICAgIC8vIEVsc2U6IGFscmVhZHkgcHJlZml4ZWQsIGxlYXZlIHRoZSBhdHRyaWJ1dGUgYWxvbmUg4oCUIHRoZSBwcmVmaXggaXNcbiAgICAgIC8vIGl0c2VsZiB0aGUgY2xvYmJlcmluZyBwcm90ZWN0aW9uLCBhbmQgcmUtYXBwbHlpbmcgaXQgaXMgaW5jb3JyZWN0LlxuICAgICAgLyogV29yayBhcm91bmQgYSBzZWN1cml0eSBpc3N1ZSB3aXRoIGNvbW1lbnRzIGluc2lkZSBhdHRyaWJ1dGVzICovXG4gICAgICBpZiAoU0FGRV9GT1JfWE1MICYmIHJlZ0V4cFRlc3QoLygoLS0hP3xdKT4pfDxcXC8oc3R5bGV8c2NyaXB0fHRpdGxlfHhtcHx0ZXh0YXJlYXxub3NjcmlwdHxpZnJhbWV8bm9lbWJlZHxub2ZyYW1lcykvaSwgdmFsdWUpKSB7XG4gICAgICAgIF9yZW1vdmVBdHRyaWJ1dGUobmFtZSwgY3VycmVudE5vZGUpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIC8qIE1ha2Ugc3VyZSB3ZSBjYW5ub3QgZWFzaWx5IHVzZSBhbmltYXRlZCBocmVmcywgZXZlbiBpZiBhbmltYXRpb25zIGFyZSBhbGxvd2VkICovXG4gICAgICBpZiAobGNOYW1lID09PSAnYXR0cmlidXRlbmFtZScgJiYgc3RyaW5nTWF0Y2godmFsdWUsICdocmVmJykpIHtcbiAgICAgICAgX3JlbW92ZUF0dHJpYnV0ZShuYW1lLCBjdXJyZW50Tm9kZSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLyogRGlkIHRoZSBob29rcyBmb3JjZS1rZWVwIHRoZSBhdHRyaWJ1dGU/ICovXG4gICAgICBpZiAoaG9va0V2ZW50LmZvcmNlS2VlcEF0dHIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvKiBEaWQgdGhlIGhvb2tzIGFwcHJvdmUgb2YgdGhlIGF0dHJpYnV0ZT8gKi9cbiAgICAgIGlmICghaG9va0V2ZW50LmtlZXBBdHRyKSB7XG4gICAgICAgIF9yZW1vdmVBdHRyaWJ1dGUobmFtZSwgY3VycmVudE5vZGUpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIC8qIFdvcmsgYXJvdW5kIGEgc2VjdXJpdHkgaXNzdWUgaW4galF1ZXJ5IDMuMCAqL1xuICAgICAgaWYgKCFBTExPV19TRUxGX0NMT1NFX0lOX0FUVFIgJiYgcmVnRXhwVGVzdChTRUxGX0NMT1NJTkdfVEFHLCB2YWx1ZSkpIHtcbiAgICAgICAgX3JlbW92ZUF0dHJpYnV0ZShuYW1lLCBjdXJyZW50Tm9kZSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLyogU2FuaXRpemUgYXR0cmlidXRlIGNvbnRlbnQgdG8gYmUgdGVtcGxhdGUtc2FmZSAqL1xuICAgICAgaWYgKFNBRkVfRk9SX1RFTVBMQVRFUykge1xuICAgICAgICB2YWx1ZSA9IF9zdHJpcFRlbXBsYXRlRXhwcmVzc2lvbnModmFsdWUpO1xuICAgICAgfVxuICAgICAgLyogSXMgYHZhbHVlYCB2YWxpZCBmb3IgdGhpcyBhdHRyaWJ1dGU/ICovXG4gICAgICBpZiAoIV9pc1ZhbGlkQXR0cmlidXRlKGxjVGFnLCBsY05hbWUsIHZhbHVlKSkge1xuICAgICAgICBfcmVtb3ZlQXR0cmlidXRlKG5hbWUsIGN1cnJlbnROb2RlKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvKiBIYW5kbGUgYXR0cmlidXRlcyB0aGF0IHJlcXVpcmUgVHJ1c3RlZCBUeXBlcyAqL1xuICAgICAgdmFsdWUgPSBfYXBwbHlUcnVzdGVkVHlwZXNUb0F0dHJpYnV0ZShsY1RhZywgbGNOYW1lLCBuYW1lc3BhY2VVUkksIHZhbHVlKTtcbiAgICAgIC8qIEhhbmRsZSBpbnZhbGlkIGRhdGEtKiBhdHRyaWJ1dGUgc2V0IGJ5IHRyeS1jYXRjaGluZyBpdCAqL1xuICAgICAgaWYgKHZhbHVlICE9PSBpbml0VmFsdWUpIHtcbiAgICAgICAgX3NldEF0dHJpYnV0ZVZhbHVlKGN1cnJlbnROb2RlLCBuYW1lLCBuYW1lc3BhY2VVUkksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgLyogRXhlY3V0ZSBhIGhvb2sgaWYgcHJlc2VudCAqL1xuICAgIF9leGVjdXRlSG9va3MoaG9va3MuYWZ0ZXJTYW5pdGl6ZUF0dHJpYnV0ZXMsIGN1cnJlbnROb2RlLCBudWxsKTtcbiAgfTtcbiAgLyoqXG4gICAqIF9zYW5pdGl6ZVNoYWRvd0RPTVxuICAgKlxuICAgKiBAcGFyYW0gZnJhZ21lbnQgdG8gaXRlcmF0ZSBvdmVyIHJlY3Vyc2l2ZWx5XG4gICAqL1xuICBjb25zdCBfc2FuaXRpemVTaGFkb3dET00yID0gZnVuY3Rpb24gX3Nhbml0aXplU2hhZG93RE9NKGZyYWdtZW50KSB7XG4gICAgbGV0IHNoYWRvd05vZGUgPSBudWxsO1xuICAgIGNvbnN0IHNoYWRvd0l0ZXJhdG9yID0gX2NyZWF0ZU5vZGVJdGVyYXRvcihmcmFnbWVudCk7XG4gICAgLyogRXhlY3V0ZSBhIGhvb2sgaWYgcHJlc2VudCAqL1xuICAgIF9leGVjdXRlSG9va3MoaG9va3MuYmVmb3JlU2FuaXRpemVTaGFkb3dET00sIGZyYWdtZW50LCBudWxsKTtcbiAgICB3aGlsZSAoc2hhZG93Tm9kZSA9IHNoYWRvd0l0ZXJhdG9yLm5leHROb2RlKCkpIHtcbiAgICAgIC8qIEV4ZWN1dGUgYSBob29rIGlmIHByZXNlbnQgKi9cbiAgICAgIF9leGVjdXRlSG9va3MoaG9va3MudXBvblNhbml0aXplU2hhZG93Tm9kZSwgc2hhZG93Tm9kZSwgbnVsbCk7XG4gICAgICAvKiBTYW5pdGl6ZSB0YWdzIGFuZCBlbGVtZW50cyAqL1xuICAgICAgX3Nhbml0aXplRWxlbWVudHMoc2hhZG93Tm9kZSwgZnJhZ21lbnQpO1xuICAgICAgLyogQ2hlY2sgYXR0cmlidXRlcyBuZXh0ICovXG4gICAgICBfc2FuaXRpemVBdHRyaWJ1dGVzKHNoYWRvd05vZGUpO1xuICAgICAgLyogRGVlcCBzaGFkb3cgRE9NIGRldGVjdGVkLlxuICAgICAgICAgUmVhbG0tc2FmZSBjaGVjayAoR0hTQS1ocGN2LTk2d2ctN3ZqOCk6IHVzZSBub2RlVHlwZSBhZ2FpbnN0IHRoZVxuICAgICAgICAgRE9DVU1FTlRfRlJBR01FTlRfTk9ERSBjb25zdGFudCByYXRoZXIgdGhhbiBpbnN0YW5jZW9mLCBzbyB3ZVxuICAgICAgICAgcmVjdXJzZSBpbnRvIDx0ZW1wbGF0ZT4uY29udGVudCBmcm9tIGZvcmVpZ24gcmVhbG1zIHRvby4gKi9cbiAgICAgIGlmIChfaXNEb2N1bWVudEZyYWdtZW50KHNoYWRvd05vZGUuY29udGVudCkpIHtcbiAgICAgICAgX3Nhbml0aXplU2hhZG93RE9NMihzaGFkb3dOb2RlLmNvbnRlbnQpO1xuICAgICAgfVxuICAgICAgLyogQW4gZWxlbWVudCBpdGVyYXRlZCBoZXJlIG1heSBpdHNlbGYgaG9zdCBhbiBhdHRhY2hlZFxuICAgICAgICAgc2hhZG93IHJvb3QuIFRoZSBkZWZhdWx0IE5vZGVJdGVyYXRvciBkb2VzIG5vdCBlbnRlciBzaGFkb3dcbiAgICAgICAgIHRyZWVzLCBzbyBhIHNoYWRvdyByb290IG5lc3RlZCBpbnNpZGUgdGVtcGxhdGUuY29udGVudCB3YXNcbiAgICAgICAgIHByZXZpb3VzbHkgcmVhY2hlZCBieSBubyB3YWxrIGF0IGFsbCAodGhlIHByZS1wYXNzIGF0XG4gICAgICAgICBfc2FuaXRpemVBdHRhY2hlZFNoYWRvd1Jvb3RzIGRlc2NlbmRzIHZpYSBjaGlsZE5vZGVzLCB3aGljaFxuICAgICAgICAgZG9lc24ndCBlbnRlciB0ZW1wbGF0ZS5jb250ZW50OyB0aGUgdGVtcGxhdGUtY29udGVudCByZWN1cnNpb25cbiAgICAgICAgIGFib3ZlIGl0ZXJhdGVzIHRoZSBjb250ZW50IGJ1dCBuZXZlciBpbnNwZWN0ZWQgc2hhZG93Um9vdCkuXG4gICAgICAgICBXYWxrIGl0IGV4cGxpY2l0bHkuIFRoZSBub2RlVHlwZSBndWFyZCBhdm9pZHMgcmVhZGluZ1xuICAgICAgICAgc2hhZG93Um9vdCBvZmYgdGV4dCAvIGNvbW1lbnQgLyBDREFUQSAvIFBJIG5vZGVzIHRoYXQgdGhlXG4gICAgICAgICBpdGVyYXRvciBhbHNvIHN1cmZhY2VzLiAqL1xuICAgICAgY29uc3Qgc2hhZG93Tm9kZVR5cGUgPSBnZXROb2RlVHlwZSA/IGdldE5vZGVUeXBlKHNoYWRvd05vZGUpIDogc2hhZG93Tm9kZS5ub2RlVHlwZTtcbiAgICAgIGlmIChzaGFkb3dOb2RlVHlwZSA9PT0gTk9ERV9UWVBFLmVsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgaW5uZXJTciA9IGdldFNoYWRvd1Jvb3Qoc2hhZG93Tm9kZSk7XG4gICAgICAgIGlmIChfaXNEb2N1bWVudEZyYWdtZW50KGlubmVyU3IpKSB7XG4gICAgICAgICAgX3Nhbml0aXplQXR0YWNoZWRTaGFkb3dSb290cyhpbm5lclNyKTtcbiAgICAgICAgICBfc2FuaXRpemVTaGFkb3dET00yKGlubmVyU3IpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8qIEV4ZWN1dGUgYSBob29rIGlmIHByZXNlbnQgKi9cbiAgICBfZXhlY3V0ZUhvb2tzKGhvb2tzLmFmdGVyU2FuaXRpemVTaGFkb3dET00sIGZyYWdtZW50LCBudWxsKTtcbiAgfTtcbiAgLyoqXG4gICAqIF9zYW5pdGl6ZUF0dGFjaGVkU2hhZG93Um9vdHNcbiAgICpcbiAgICogV2Fsa3MgYHJvb3RgIGFuZCBmZWVkcyBldmVyeSBhdHRhY2hlZCBzaGFkb3cgcm9vdCB3ZSBlbmNvdW50ZXIgaW50b1xuICAgKiB0aGUgZXhpc3RpbmcgX3Nhbml0aXplU2hhZG93RE9NIHBpcGVsaW5lLiBUaGUgZGVmYXVsdCBub2RlIGl0ZXJhdG9yXG4gICAqIGRvZXMgbm90IGRlc2NlbmQgaW50byBzaGFkb3cgdHJlZXMsIHNvIG5vZGVzIGluc2lkZSBhbiBhdHRhY2hlZFxuICAgKiBzaGFkb3cgcm9vdCB3b3VsZCBvdGhlcndpc2UgYmUgc2tpcHBlZCBlbnRpcmVseS5cbiAgICpcbiAgICogVHdvIHJlYWwgaW5wdXQgcGF0aHMgcHV0IGF0dGFjaGVkIHNoYWRvdyByb290cyBpbiBmcm9udCBvZiB1czpcbiAgICogICAxLiBJTl9QTEFDRSBvbiBhIERPTSBub2RlIHRoYXQgYWxyZWFkeSBoYXMgc2hhZG93IHJvb3RzIGF0dGFjaGVkLlxuICAgKiAgIDIuIERPTS1ub2RlIGlucHV0IHdoZXJlIGltcG9ydE5vZGUoZGlydHksIHRydWUpIGRlZXAtY2xvbmVzIHRoZVxuICAgKiAgICAgIHNoYWRvdyByb290IGJlY2F1c2UgaXQgd2FzIGNyZWF0ZWQgd2l0aCBgY2xvbmFibGU6IHRydWVgLlxuICAgKlxuICAgKiBUaGlzIHBhc3MgcnVucyBvbmNlLCB1cCBmcm9udCwgc28gdGhlIG1haW4gaXRlcmF0aW9uIGxvb3AgKGFuZCB0aGVcbiAgICogZXhpc3RpbmcgX3Nhbml0aXplU2hhZG93RE9NIHRlbXBsYXRlLWNvbnRlbnQgcmVjdXJzaW9uKSBzdGF5XG4gICAqIHVudG91Y2hlZCDigJQgc3RyaW5nLWlucHV0IHBhdGhzIGFyZSBub3QgYWZmZWN0ZWQuXG4gICAqXG4gICAqIEBwYXJhbSByb290IHRoZSBzdWJ0cmVlIHJvb3QgdG8gd2FsayBmb3IgYXR0YWNoZWQgc2hhZG93IHJvb3RzXG4gICAqL1xuICBjb25zdCBfc2FuaXRpemVBdHRhY2hlZFNoYWRvd1Jvb3RzID0gZnVuY3Rpb24gX3Nhbml0aXplQXR0YWNoZWRTaGFkb3dSb290cyhyb290KSB7XG4gICAgLyogSXRlcmF0aXZlIChleHBsaWNpdCBzdGFjaykgcmF0aGVyIHRoYW4gcGVyLWNoaWxkIHJlY3Vyc2lvbi4gRE9NIEFQSXNcbiAgICAgICBpbXBvc2Ugbm8gZGVwdGggY2FwLCBzbyBhbiBhdHRhY2tlci1zaGFwZWQgdHJlZSAoSlNPTi9DUkRUL2VkaXRvciBkYXRhXG4gICAgICAgYnVpbHQgc3RyYWlnaHQgaW50byB0aGUgRE9NIOKAlCB0aGUgSU5fUExBQ0Ugc3VyZmFjZSkgZGVlcGVyIHRoYW4gdGhlIEpTXG4gICAgICAgY2FsbC1zdGFjayBidWRnZXQgd291bGQgb3RoZXJ3aXNlIG92ZXJmbG93IG5hdGl2ZSByZWN1cnNpb24gaGVyZSBhbmRcbiAgICAgICB0aHJvdyBhdCB0aGUgSU5fUExBQ0UgZW50cnkgcHJlLXBhc3MsIGJlZm9yZSBhIHNpbmdsZSBub2RlIGlzXG4gICAgICAgc2FuaXRpemVkLCBsZWF2aW5nIHRoZSBjYWxsZXIncyBsaXZlIHRyZWUgdW50b3VjaGVkIChmYWlsLW9wZW4pLiBTZWVcbiAgICAgICBjYW1wYWlnbi0zIEY0LiBBIGhlYXAgc3RhY2sga2VlcHMgZGVwdGggb2ZmIHRoZSBjYWxsIHN0YWNrLlxuICAgICAgICAgICAgRWFjaCB3b3JrIGl0ZW0gaXMgZWl0aGVyIGEgbm9kZSB0byBkZXNjZW5kIGludG8sIG9yIGEgZGVmZXJyZWRcbiAgICAgICBgX3Nhbml0aXplU2hhZG93RE9NYCBmb3IgYW4gYWxyZWFkeS13YWxrZWQgc2hhZG93IHJvb3QuIFRoZSBkZWZlcnJlZFxuICAgICAgIGZvcm0gcHJlc2VydmVzIHRoZSBvcmlnaW5hbCBwb3N0LW9yZGVyIGRpc2NpcGxpbmU6IGEgc2hhZG93IHJvb3Qnc1xuICAgICAgIG5lc3RlZCBzaGFkb3cgcm9vdHMgYXJlIGRpc2NvdmVyZWQgYmVmb3JlIHRoZSBvdXRlciBzaGFkb3cgaXNcbiAgICAgICBzYW5pdGl6ZWQgKHdoaWNoIG1heSByZW1vdmUgaG9zdHMpLiBQdXNoZXMgYXJlIGluIHJldmVyc2Ugb2YgdGhlXG4gICAgICAgZGVzaXJlZCBwcm9jZXNzaW5nIG9yZGVyIChMSUZPKTogdGVtcGxhdGUgY29udGVudCwgdGhlbiBjaGlsZHJlbiwgdGhlblxuICAgICAgIHRoZSBzaGFkb3ctc2FuaXRpemUsIHRoZW4gdGhlIHNoYWRvdyB3YWxrIOKAlCBzbyB0aGUgb3JkZXIgbWF0Y2hlcyB0aGVcbiAgICAgICBwcmV2aW91cyByZWN1cnNpb24gZXhhY3RseS4gKi9cbiAgICBjb25zdCBzdGFjayA9IFt7XG4gICAgICBub2RlOiByb290LFxuICAgICAgc2hhZG93OiBudWxsXG4gICAgfV07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGl0ZW0gPSBzdGFjay5wb3AoKTtcbiAgICAgIC8qIERlZmVycmVkIHNoYWRvdy1ET00gc2FuaXRpc2F0aW9uOiBydW5zIGFmdGVyIGl0cyBzdWJ0cmVlIHdhcyB3YWxrZWQuICovXG4gICAgICBpZiAoaXRlbS5zaGFkb3cpIHtcbiAgICAgICAgX3Nhbml0aXplU2hhZG93RE9NMihpdGVtLnNoYWRvdyk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3Qgbm9kZSA9IGl0ZW0ubm9kZTtcbiAgICAgIGNvbnN0IG5vZGVUeXBlID0gZ2V0Tm9kZVR5cGUgPyBnZXROb2RlVHlwZShub2RlKSA6IG5vZGUubm9kZVR5cGU7XG4gICAgICBjb25zdCBpc0VsZW1lbnQgPSBub2RlVHlwZSA9PT0gTk9ERV9UWVBFLmVsZW1lbnQ7XG4gICAgICAvKiAocHVzaGVkIGxhc3Qg4oaSIHByb2Nlc3NlZCBmaXJzdCkgQ2hpbGRyZW4sIHNuYXBzaG90dGVkIGluIHJldmVyc2Ugc29cbiAgICAgICAgIHRoZSBmaXJzdCBjaGlsZCBpcyBwcm9jZXNzZWQgZmlyc3QuIFNuYXBzaG90dGluZyBtYXR0ZXJzIGJlY2F1c2UgYVxuICAgICAgICAgaG9vayBtYXkgZGV0YWNoIHNpYmxpbmdzIG1pZC13YWxrLiAqL1xuICAgICAgY29uc3QgY2hpbGROb2RlcyA9IGdldENoaWxkTm9kZXMobm9kZSk7XG4gICAgICBpZiAoY2hpbGROb2Rlcykge1xuICAgICAgICBmb3IgKGxldCBpID0gY2hpbGROb2Rlcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICAgIHN0YWNrLnB1c2goe1xuICAgICAgICAgICAgbm9kZTogY2hpbGROb2Rlc1tpXSxcbiAgICAgICAgICAgIHNoYWRvdzogbnVsbFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvKiAocHVzaGVkIGJlZm9yZSBjaGlsZHJlbiDihpIgcHJvY2Vzc2VkIGFmdGVyIHRoZW0sIG1hdGNoaW5nIHRoZSBvbGRcbiAgICAgICAgIFwidGVtcGxhdGUgY29udGVudCBsYXN0XCIgb3JkZXIpIFdoZW4gdGhlIG5vZGUgaXMgYSA8dGVtcGxhdGU+LFxuICAgICAgICAgZGVzY2VuZCBpbnRvIGl0cyBjb250ZW50LiAqL1xuICAgICAgaWYgKGlzRWxlbWVudCkge1xuICAgICAgICBjb25zdCByb290TmFtZSA9IGdldE5vZGVOYW1lID8gZ2V0Tm9kZU5hbWUobm9kZSkgOiBudWxsO1xuICAgICAgICBpZiAodHlwZW9mIHJvb3ROYW1lID09PSAnc3RyaW5nJyAmJiB0cmFuc2Zvcm1DYXNlRnVuYyhyb290TmFtZSkgPT09ICd0ZW1wbGF0ZScpIHtcbiAgICAgICAgICBjb25zdCBjb250ZW50ID0gbm9kZS5jb250ZW50O1xuICAgICAgICAgIGlmIChfaXNEb2N1bWVudEZyYWdtZW50KGNvbnRlbnQpKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKHtcbiAgICAgICAgICAgICAgbm9kZTogY29udGVudCxcbiAgICAgICAgICAgICAgc2hhZG93OiBudWxsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8qIFNoYWRvdyByb290IChwcm9jZXNzZWQgZmlyc3QpOiB3YWxrIGl0cyBzdWJ0cmVlLCB0aGVuIHNhbml0aXNlIGl0LlxuICAgICAgICAgUmVhbG0tc2FmZSBjaGVjayAoR0hTQS1ocGN2LTk2d2ctN3ZqOCk6IG5vZGVUeXBlLWJhc2VkIGRldGVjdGlvblxuICAgICAgICAgcmF0aGVyIHRoYW4gYGluc3RhbmNlb2YgRG9jdW1lbnRGcmFnbWVudGAsIHdoaWNoIGlzIHJlYWxtLWJvdW5kIGFuZFxuICAgICAgICAgc2lsZW50bHkgc2tpcHBlZCBmb3JlaWduLXJlYWxtIHNoYWRvdyByb290cyAoZS5nLlxuICAgICAgICAgaWZyYW1lLmNvbnRlbnREb2N1bWVudCBhdHRhY2hTaGFkb3cpLiAqL1xuICAgICAgaWYgKGlzRWxlbWVudCkge1xuICAgICAgICBjb25zdCBzciA9IGdldFNoYWRvd1Jvb3Qobm9kZSk7XG4gICAgICAgIGlmIChfaXNEb2N1bWVudEZyYWdtZW50KHNyKSkge1xuICAgICAgICAgIC8qIFB1c2ggdGhlIGRlZmVycmVkIHNhbml0aXNlIGZpcnN0IHNvIGl0IHBvcHMgYWZ0ZXIgdGhlIHNoYWRvd1xuICAgICAgICAgICAgIHdhbGsgd2UgcHVzaCBuZXh0LCBpLmUuIG5lc3RlZCBzaGFkb3cgcm9vdHMgYXJlIGRpc2NvdmVyZWRcbiAgICAgICAgICAgICBiZWZvcmUgdGhpcyBvbmUgaXMgc2FuaXRpc2VkLiAqL1xuICAgICAgICAgIHN0YWNrLnB1c2goe1xuICAgICAgICAgICAgbm9kZTogbnVsbCxcbiAgICAgICAgICAgIHNoYWRvdzogc3JcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICBub2RlOiBzcixcbiAgICAgICAgICAgIHNoYWRvdzogbnVsbFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgY29tcGxleGl0eVxuICBET01QdXJpZnkuc2FuaXRpemUgPSBmdW5jdGlvbiAoZGlydHkpIHtcbiAgICBsZXQgY2ZnID0gYXJndW1lbnRzLmxlbmd0aCA+IDEgJiYgYXJndW1lbnRzWzFdICE9PSB1bmRlZmluZWQgPyBhcmd1bWVudHNbMV0gOiB7fTtcbiAgICBsZXQgYm9keSA9IG51bGw7XG4gICAgbGV0IGltcG9ydGVkTm9kZSA9IG51bGw7XG4gICAgbGV0IGN1cnJlbnROb2RlID0gbnVsbDtcbiAgICBsZXQgcmV0dXJuTm9kZSA9IG51bGw7XG4gICAgLyogTWFrZSBzdXJlIHdlIGhhdmUgYSBzdHJpbmcgdG8gc2FuaXRpemUuXG4gICAgICBETyBOT1QgcmV0dXJuIGVhcmx5LCBhcyB0aGlzIHdpbGwgcmV0dXJuIHRoZSB3cm9uZyB0eXBlIGlmXG4gICAgICB0aGUgdXNlciBoYXMgcmVxdWVzdGVkIGEgRE9NIG9iamVjdCByYXRoZXIgdGhhbiBhIHN0cmluZyAqL1xuICAgIElTX0VNUFRZX0lOUFVUID0gIWRpcnR5O1xuICAgIGlmIChJU19FTVBUWV9JTlBVVCkge1xuICAgICAgZGlydHkgPSAnPCEtLT4nO1xuICAgIH1cbiAgICAvKiBTdHJpbmdpZnksIGluIGNhc2UgZGlydHkgaXMgYW4gb2JqZWN0ICovXG4gICAgaWYgKHR5cGVvZiBkaXJ0eSAhPT0gJ3N0cmluZycgJiYgIV9pc05vZGUoZGlydHkpKSB7XG4gICAgICBkaXJ0eSA9IHN0cmluZ2lmeVZhbHVlKGRpcnR5KTtcbiAgICAgIGlmICh0eXBlb2YgZGlydHkgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IHR5cGVFcnJvckNyZWF0ZSgnZGlydHkgaXMgbm90IGEgc3RyaW5nLCBhYm9ydGluZycpO1xuICAgICAgfVxuICAgIH1cbiAgICAvKiBSZXR1cm4gZGlydHkgSFRNTCBpZiBET01QdXJpZnkgY2Fubm90IHJ1biAqL1xuICAgIGlmICghRE9NUHVyaWZ5LmlzU3VwcG9ydGVkKSB7XG4gICAgICByZXR1cm4gZGlydHk7XG4gICAgfVxuICAgIC8qIEFzc2lnbiBjb25maWcgdmFycyAqL1xuICAgIGlmIChTRVRfQ09ORklHKSB7XG4gICAgICAvKiBQZXJzaXN0ZW50IHNldENvbmZpZygpIHBhdGg6IF9wYXJzZUNvbmZpZyBpcyBza2lwcGVkLCBzbyB0aGUgc2V0cyBhcmVcbiAgICAgICAqIG5vdCByZS1kZXJpdmVkIHBlciBjYWxsLiBSZXN0b3JlIHRoZW0gZnJvbSB0aGUgcHJpc3RpbmUgYmluZGluZ3NcbiAgICAgICAqIGNhcHR1cmVkIGF0IHNldENvbmZpZygpIHRpbWUgc28gYSBwcmV2aW91cyBjYWxsJ3MgaG9vayBjbG9uZSAobXV0YXRlZFxuICAgICAgICogYmVsb3cpIGRvZXMgbm90IGNhcnJ5IG92ZXIuICovXG4gICAgICBBTExPV0VEX1RBR1MgPSBTRVRfQ09ORklHX0FMTE9XRURfVEFHUztcbiAgICAgIEFMTE9XRURfQVRUUiA9IFNFVF9DT05GSUdfQUxMT1dFRF9BVFRSO1xuICAgIH0gZWxzZSB7XG4gICAgICBfcGFyc2VDb25maWcoY2ZnKTtcbiAgICB9XG4gICAgLyogQ2xvbmUgdGhlIGhvb2stbXV0YWJsZSBhbGxvd2xpc3RzIGJlZm9yZSB0aGUgd2FsayB3aGVuZXZlciBhblxuICAgICAqIHVwb25TYW5pdGl6ZSogaG9vayBpcyByZWdpc3RlcmVkLiBUaGUgaG9vayBldmVudCBleHBvc2VzIEFMTE9XRURfVEFHU1xuICAgICAqIGFuZCBBTExPV0VEX0FUVFIgYnkgcmVmZXJlbmNlIChhcyBhbGxvd2VkVGFncyAvIGFsbG93ZWRBdHRyaWJ1dGVzKSwgc29cbiAgICAgKiBhIGhvb2sgdGhhdCB3aWRlbnMgdGhlbSB3b3VsZCBvdGhlcndpc2UgbXV0YXRlIHRoZSBzaGFyZWQgc2V0XG4gICAgICogcGVybWFuZW50bHk6IGFjcm9zcyBsYXRlciBjYWxscyBhbmQgYWNyb3NzIGV2ZXJ5IGVsZW1lbnQuIENsb25pbmcgcGVyXG4gICAgICogd2FsayBrZWVwcyBkb2N1bWVudGVkIGluLWNhbGwgd2lkZW5pbmcgd29ya2luZyB3aGlsZSBzY29waW5nIGl0IHRvIHRoZVxuICAgICAqIGNhbGwuIEEgc2luZ2xlIGd1YXJkIGZvciBib3RoIGNvbmZpZyBwYXRocyAtIHRoZSBwZXItY2FsbCBwYXRoIHJlYmluZHNcbiAgICAgKiB0aGUgc2V0cyBpbiBfcGFyc2VDb25maWcgZWFjaCBjYWxsLCB0aGUgcGVyc2lzdGVudCBwYXRoIHJlc3RvcmVzIHRoZW1cbiAgICAgKiBmcm9tIHRoZSBjYXB0dXJlZCBiaW5kaW5ncyBqdXN0IGFib3ZlIC0gc28gdGhlIHR3byBjYW5ub3QgZGl2ZXJnZS4gKi9cbiAgICBpZiAoaG9va3MudXBvblNhbml0aXplRWxlbWVudC5sZW5ndGggPiAwIHx8IGhvb2tzLnVwb25TYW5pdGl6ZUF0dHJpYnV0ZS5sZW5ndGggPiAwKSB7XG4gICAgICBBTExPV0VEX1RBR1MgPSBjbG9uZShBTExPV0VEX1RBR1MpO1xuICAgIH1cbiAgICBpZiAoaG9va3MudXBvblNhbml0aXplQXR0cmlidXRlLmxlbmd0aCA+IDApIHtcbiAgICAgIEFMTE9XRURfQVRUUiA9IGNsb25lKEFMTE9XRURfQVRUUik7XG4gICAgfVxuICAgIC8qIENsZWFuIHVwIHJlbW92ZWQgZWxlbWVudHMgKi9cbiAgICBET01QdXJpZnkucmVtb3ZlZCA9IFtdO1xuICAgIC8qIFJlc29sdmUgSU5fUExBQ0UgZm9yIHRoaXMgY2FsbCB3aXRob3V0IG11dGF0aW5nIHBlcnNpc3RlbnQgY29uZmlnLlxuICAgICAgIFdyaXRpbmcgdGhlIElOX1BMQUNFIGNsb3N1cmUgdmFyaWFibGUgaGVyZSBsZWFrcyB1bmRlciBzZXRDb25maWcoKSxcbiAgICAgICB3aGVyZSBfcGFyc2VDb25maWcgaXMgc2tpcHBlZCBvbiBsYXRlciBjYWxsczogYSBzaW5nbGUgc3RyaW5nIGNhbGwgd291bGRcbiAgICAgICBkaXNhYmxlIGluLXBsYWNlIG1vZGUgZm9yIGV2ZXJ5IHN1YnNlcXVlbnQgbm9kZSBjYWxsLCByZXR1cm5pbmcgYVxuICAgICAgIHNhbml0aXplZCBjb3B5IHdoaWxlIGxlYXZpbmcgdGhlIGNhbGxlcidzIG5vZGUg4oCUIHdoaWNoIGluLXBsYWNlIGNhbGxlcnNcbiAgICAgICBrZWVwIHVzaW5nIGFuZCB3aG9zZSByZXR1cm4gdmFsdWUgdGhleSBpZ25vcmUg4oCUIHVuc2FuaXRpemVkLiBSRVBPUlQtMi4gKi9cbiAgICBjb25zdCBpblBsYWNlID0gSU5fUExBQ0UgJiYgdHlwZW9mIGRpcnR5ICE9PSAnc3RyaW5nJyAmJiBfaXNOb2RlKGRpcnR5KTtcbiAgICBpZiAoaW5QbGFjZSkge1xuICAgICAgLyogRGVjbGFyYXRpdmUtcGFydGlhbC11cGRhdGVzIC8gc3RyZWFtaW5nIHByZS1wYXNzOiBzZXZlciBldmVyeSBwYXRjaFxuICAgICAgICAgbGlua2FnZSBhY3Jvc3MgdGhlIGxpdmUgdHJlZSBCRUZPUkUgdGhlIHdhbGssIHNvIG5vIHBhdGNoIGNhbiBmaXJlXG4gICAgICAgICBtaWQtd2FsayBhbmQgaW5qZWN0IGludG8gYW4gYWxyZWFkeS1wcm9jZXNzZWQgcmVnaW9uLiBSdW5zIGZpcnN0LCBzb1xuICAgICAgICAgaXQgYWxzbyBjb3ZlcnMgdGhlIGZvcmJpZGRlbi9jbG9iYmVyZWQgcm9vdHMgdGhhdCB0aHJvdyBiZWxvdy4gKi9cbiAgICAgIF9uZXV0cmFsaXplUGF0Y2hMaW5rYWdlKGRpcnR5KTtcbiAgICAgIC8qIERvIHNvbWUgZWFybHkgcHJlLXNhbml0aXphdGlvbiB0byBhdm9pZCB1bnNhZmUgcm9vdCBub2Rlcy5cbiAgICAgICAgIFJlYWQgbm9kZU5hbWUgdGhyb3VnaCB0aGUgY2FjaGVkIHByb3RvdHlwZSBnZXR0ZXIg4oCUIGEgY2xvYmJlcmluZ1xuICAgICAgICAgY2hpbGQgbmFtZWQgXCJub2RlTmFtZVwiIG9uIHRoZSBmb3JtIHJvb3Qgd291bGQgb3RoZXJ3aXNlIHNoYWRvd1xuICAgICAgICAgdGhlIHByb3BlcnR5IGFuZCBsZXQgdGhpcyBjaGVjayBza2lwIHRoZSByb290LWFsbG93bGlzdFxuICAgICAgICAgdmFsaWRhdGlvbiBlbnRpcmVseS4gKi9cbiAgICAgIGNvbnN0IG5uID0gZ2V0Tm9kZU5hbWUgPyBnZXROb2RlTmFtZShkaXJ0eSkgOiBkaXJ0eS5ub2RlTmFtZTtcbiAgICAgIGlmICh0eXBlb2Ygbm4gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IHRhZ05hbWUgPSB0cmFuc2Zvcm1DYXNlRnVuYyhubik7XG4gICAgICAgIGlmICghQUxMT1dFRF9UQUdTW3RhZ05hbWVdIHx8IEZPUkJJRF9UQUdTW3RhZ05hbWVdKSB7XG4gICAgICAgICAgLyogRmFpbCBjbG9zZWQgb24gYSBsaXZlIHJvb3Q6IG5ldXRyYWxpemUgaGFuZGxlcnMvY2hpbGRyZW4gYmVmb3JlXG4gICAgICAgICAgICAgdGhyb3dpbmcsIGV4YWN0bHkgYXMgdGhlIG1pZC13YWxrIGFib3J0IHBhdGggZG9lcy4gKi9cbiAgICAgICAgICBfbmV1dHJhbGl6ZVJvb3QoZGlydHkpO1xuICAgICAgICAgIHRocm93IHR5cGVFcnJvckNyZWF0ZSgncm9vdCBub2RlIGlzIGZvcmJpZGRlbiBhbmQgY2Fubm90IGJlIHNhbml0aXplZCBpbi1wbGFjZScpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvKiBQcmUtZmxpZ2h0IHRoZSByb290IHRocm91Z2ggX2lzQ2xvYmJlcmVkLiBUaGUgaXRlcmF0b3ItZHJpdmVuXG4gICAgICAgICByZW1vdmFsIHBhdGggY2FuIG5vdCBkZXRhY2ggYSBwYXJlbnQtbGVzcyByb290OiBfZm9yY2VSZW1vdmVcbiAgICAgICAgIGZhbGxzIHRocm91Z2ggdG8gRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlKCksIHdoaWNoIHBlciBzcGVjXG4gICAgICAgICBpcyBhIG5vLW9wIG9uIGEgbm9kZSB3aXRoIG5vIHBhcmVudC4gQSBjbG9iYmVyZWQgcm9vdCB3b3VsZFxuICAgICAgICAgdGhlbiBzdXJ2aXZlIHRoZSBtYWluIGxvb3Agd2l0aCBpdHMgYXR0cmlidXRlcyB1bmluc3BlY3RlZCxcbiAgICAgICAgIGJlY2F1c2UgX3Nhbml0aXplQXR0cmlidXRlcyBlYXJseS1yZXR1cm5zIG9uIF9pc0Nsb2JiZXJlZC4gVGhlXG4gICAgICAgICByZXN1bHQgd291bGQgYmUgYW4gYXR0YWNrZXItY29udHJvbGxlZCBmb3JtLCBjb21wbGV0ZSB3aXRoIGFueVxuICAgICAgICAgZXZlbnQtaGFuZGxlciBhdHRyaWJ1dGVzIHRoZSBjYWxsZXIgcGFzc2VkIGluLCBoYW5kZWQgYmFjayB0b1xuICAgICAgICAgdGhlIGFwcGxpY2F0aW9uIHVuc2FuaXRpemVkLiBSZWZ1c2UgdG8gc2FuaXRpemUgc3VjaCBhIHJvb3RcbiAgICAgICAgIHRoZSBzYW1lIHdheSB3ZSByZWZ1c2UgYSBmb3JiaWRkZW4gdGFnLiBHSFNBLXI0N2ctZnZoci1oNjc2LiAqL1xuICAgICAgaWYgKF9pc0Nsb2JiZXJlZChkaXJ0eSkpIHtcbiAgICAgICAgLyogRmFpbCBjbG9zZWQgb24gYSBsaXZlIGNsb2JiZXJlZCByb290IGJlZm9yZSB0aHJvd2luZy5cbiAgICAgICAgICAgX25ldXRyYWxpemVSb290J3MgcmVhZHMgYXJlIGNsb2JiZXItc2FmZSAoY2FjaGVkIGdldHRlcnMpOyB0aGVcbiAgICAgICAgICAgZm9ybSdzIG5vbi1jbG9iYmVyZWQgZGVzY2VuZGFudHMsIGUuZy4gYW4gYXJtZWQgPGltZz4sIGFyZSBzY3J1YmJlZC4gKi9cbiAgICAgICAgX25ldXRyYWxpemVSb290KGRpcnR5KTtcbiAgICAgICAgdGhyb3cgdHlwZUVycm9yQ3JlYXRlKCdyb290IG5vZGUgaXMgY2xvYmJlcmVkIGFuZCBjYW5ub3QgYmUgc2FuaXRpemVkIGluLXBsYWNlJyk7XG4gICAgICB9XG4gICAgICAvKiBTYW5pdGl6ZSBhdHRhY2hlZCBzaGFkb3cgcm9vdHMgYmVmb3JlIHRoZSBtYWluIGl0ZXJhdG9yIHJ1bnMuXG4gICAgICAgICBUaGUgaXRlcmF0b3IgZG9lcyBub3QgZGVzY2VuZCBpbnRvIHNoYWRvdyB0cmVlcy4gU2FtZSBmYWlsLWNsb3NlZFxuICAgICAgICAgYmFycmllciBhcyB0aGUgbWFpbiB3YWxrIChjYW1wYWlnbi0zIEYyKTogYSBjdXN0b20tZWxlbWVudCByZWFjdGlvblxuICAgICAgICAgaW5zaWRlIGEgc2hhZG93IHJvb3QgY291bGQgYWJvcnQgdGhpcyBwcmUtcGFzcyBiZWZvcmUgdGhlIHdhbGsgcnVucyxcbiAgICAgICAgIHdoaWNoIHdvdWxkIG90aGVyd2lzZSBsZWF2ZSB0aGUgZW50aXJlIGxpdmUgdHJlZSB1bnNhbml0aXplZC4gKi9cbiAgICAgIHRyeSB7XG4gICAgICAgIF9zYW5pdGl6ZUF0dGFjaGVkU2hhZG93Um9vdHMoZGlydHkpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgX25ldXRyYWxpemVSb290KGRpcnR5KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChfaXNOb2RlKGRpcnR5KSkge1xuICAgICAgLyogSWYgZGlydHkgaXMgYSBET00gZWxlbWVudCwgYXBwZW5kIHRvIGFuIGVtcHR5IGRvY3VtZW50IHRvIGF2b2lkXG4gICAgICAgICBlbGVtZW50cyBiZWluZyBzdHJpcHBlZCBieSB0aGUgcGFyc2VyICovXG4gICAgICBib2R5ID0gX2luaXREb2N1bWVudCgnPCEtLS0tPicpO1xuICAgICAgaW1wb3J0ZWROb2RlID0gYm9keS5vd25lckRvY3VtZW50LmltcG9ydE5vZGUoZGlydHksIHRydWUpO1xuICAgICAgaWYgKGltcG9ydGVkTm9kZS5ub2RlVHlwZSA9PT0gTk9ERV9UWVBFLmVsZW1lbnQgJiYgaW1wb3J0ZWROb2RlLm5vZGVOYW1lID09PSAnQk9EWScpIHtcbiAgICAgICAgLyogTm9kZSBpcyBhbHJlYWR5IGEgYm9keSwgdXNlIGFzIGlzICovXG4gICAgICAgIGJvZHkgPSBpbXBvcnRlZE5vZGU7XG4gICAgICB9IGVsc2UgaWYgKGltcG9ydGVkTm9kZS5ub2RlTmFtZSA9PT0gJ0hUTUwnKSB7XG4gICAgICAgIGJvZHkgPSBpbXBvcnRlZE5vZGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgdW5pY29ybi9wcmVmZXItZG9tLW5vZGUtYXBwZW5kXG4gICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQoaW1wb3J0ZWROb2RlKTtcbiAgICAgIH1cbiAgICAgIC8qIENsb25hYmxlIHNoYWRvdyByb290cyBhcmUgZGVlcC1jbG9uZWQgYnkgaW1wb3J0Tm9kZSgpOyBzYW5pdGl6ZVxuICAgICAgICAgdGhlbSBiZWZvcmUgdGhlIG1haW4gaXRlcmF0b3IgcnVucywgc2luY2UgdGhlIGl0ZXJhdG9yIGRvZXMgbm90XG4gICAgICAgICBkZXNjZW5kIGludG8gc2hhZG93IHRyZWVzLiBUaGUgd2FsayByb3V0ZXMgZXZlcnkgcmVhZCB0aHJvdWdoIGFcbiAgICAgICAgIGNhY2hlZCBwcm90b3R5cGUgZ2V0dGVyIHNvIGNsb2JiZXJpbmcgZGVzY2VuZGFudHMgb24gYSBmb3JtIHJvb3RcbiAgICAgICAgIGNhbm5vdCBoaWRlIGEgc2hhZG93IGhvc3QgZnJvbSB0aGlzIHBhc3MuICovXG4gICAgICBfc2FuaXRpemVBdHRhY2hlZFNoYWRvd1Jvb3RzKGltcG9ydGVkTm9kZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8qIEV4aXQgZGlyZWN0bHkgaWYgd2UgaGF2ZSBub3RoaW5nIHRvIGRvICovXG4gICAgICBpZiAoIVJFVFVSTl9ET00gJiYgIVNBRkVfRk9SX1RFTVBMQVRFUyAmJiAhV0hPTEVfRE9DVU1FTlQgJiZcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSB1bmljb3JuL3ByZWZlci1pbmNsdWRlc1xuICAgICAgZGlydHkuaW5kZXhPZignPCcpID09PSAtMSkge1xuICAgICAgICByZXR1cm4gdHJ1c3RlZFR5cGVzUG9saWN5ICYmIFJFVFVSTl9UUlVTVEVEX1RZUEUgPyBfY3JlYXRlVHJ1c3RlZEhUTUwoZGlydHkpIDogZGlydHk7XG4gICAgICB9XG4gICAgICAvKiBJbml0aWFsaXplIHRoZSBkb2N1bWVudCB0byB3b3JrIG9uICovXG4gICAgICBib2R5ID0gX2luaXREb2N1bWVudChkaXJ0eSk7XG4gICAgICAvKiBDaGVjayB3ZSBoYXZlIGEgRE9NIG5vZGUgZnJvbSB0aGUgZGF0YSAqL1xuICAgICAgaWYgKCFib2R5KSB7XG4gICAgICAgIHJldHVybiBSRVRVUk5fRE9NID8gbnVsbCA6IFJFVFVSTl9UUlVTVEVEX1RZUEUgPyBlbXB0eUhUTUwgOiAnJztcbiAgICAgIH1cbiAgICB9XG4gICAgLyogUmVtb3ZlIGZpcnN0IGVsZW1lbnQgbm9kZSAob3VycykgaWYgRk9SQ0VfQk9EWSBpcyBzZXQgKi9cbiAgICBpZiAoYm9keSAmJiBGT1JDRV9CT0RZKSB7XG4gICAgICBfZm9yY2VSZW1vdmUoYm9keS5maXJzdENoaWxkKTtcbiAgICB9XG4gICAgLyogR2V0IG5vZGUgaXRlcmF0b3IgKi9cbiAgICBjb25zdCB3YWxrUm9vdCA9IGluUGxhY2UgPyBkaXJ0eSA6IGJvZHk7XG4gICAgY29uc3Qgbm9kZUl0ZXJhdG9yID0gX2NyZWF0ZU5vZGVJdGVyYXRvcih3YWxrUm9vdCk7XG4gICAgLyogTm93IHN0YXJ0IGl0ZXJhdGluZyBvdmVyIHRoZSBjcmVhdGVkIGRvY3VtZW50LlxuICAgICAgIFRoZSB3YWxrIHJ1bnMgaW5zaWRlIGFuIGV4Y2VwdGlvbiBiYXJyaWVyIChjYW1wYWlnbi0zIEYyKTogYSByZS1lbnRyYW50XG4gICAgICAgZW5naW5lL2N1c3RvbS1lbGVtZW50IG11dGF0aW9uIGNhbiBkZXRhY2ggYSBub2RlIG1pZC13YWxrIHNvXG4gICAgICAgYF9mb3JjZVJlbW92ZWAncyBwYXJlbnRsZXNzIGd1YXJkIHRocm93cywgYWJvcnRpbmcgdGhlIGxvb3AuIFdpdGhvdXQgdGhlXG4gICAgICAgYmFycmllciB0aGUgY2FsbGVyJ3MgaW4tcGxhY2UgdHJlZSB3b3VsZCBiZSBsZWZ0IGhhbGYtc2FuaXRpemVkIHdpdGggdGhlXG4gICAgICAgdW52aXNpdGVkIHRhaWwgc3RpbGwgYXJtZWQuIE9uIGFueSB0aHJvdyB3ZSBmYWlsIGNsb3NlZCDigJQgc3RyaXAgdGhlXG4gICAgICAgaW4tcGxhY2Ugcm9vdCBiYXJlIOKAlCB0aGVuIHJldGhyb3cgc28gdGhlIGV4aXN0aW5nIHRocm93IGNvbnRyYWN0IGlzXG4gICAgICAgcHJlc2VydmVkLiAoU3RyaW5nL0RPTS1jb3B5IHBhdGhzIG5ldmVyIHJldHVybiB0aGUgcGFydGlhbCBib2R5LCBzbyB0aGVcbiAgICAgICBwcm9wYWdhdGluZyB0aHJvdyBpcyBhbHJlYWR5IGZhaWwtY2xvc2VkIHRoZXJlLikgKi9cbiAgICB0cnkge1xuICAgICAgd2hpbGUgKGN1cnJlbnROb2RlID0gbm9kZUl0ZXJhdG9yLm5leHROb2RlKCkpIHtcbiAgICAgICAgLyogU2FuaXRpemUgdGFncyBhbmQgZWxlbWVudHMgKi9cbiAgICAgICAgX3Nhbml0aXplRWxlbWVudHMoY3VycmVudE5vZGUsIHdhbGtSb290KTtcbiAgICAgICAgLyogQ2hlY2sgYXR0cmlidXRlcyBuZXh0ICovXG4gICAgICAgIF9zYW5pdGl6ZUF0dHJpYnV0ZXMoY3VycmVudE5vZGUpO1xuICAgICAgICAvKiBTaGFkb3cgRE9NIGRldGVjdGVkLCBzYW5pdGl6ZSBpdC5cbiAgICAgICAgICAgUmVhbG0tc2FmZSBjaGVjayAoR0hTQS1ocGN2LTk2d2ctN3ZqOCk6IG5vZGVUeXBlLWJhc2VkIGRldGVjdGlvblxuICAgICAgICAgICBpbnN0ZWFkIG9mIGluc3RhbmNlb2YsIHNvIGZvcmVpZ24tcmVhbG0gPHRlbXBsYXRlPi5jb250ZW50IGlzXG4gICAgICAgICAgIHdhbGtlZCBjb3JyZWN0bHkuICovXG4gICAgICAgIGlmIChfaXNEb2N1bWVudEZyYWdtZW50KGN1cnJlbnROb2RlLmNvbnRlbnQpKSB7XG4gICAgICAgICAgX3Nhbml0aXplU2hhZG93RE9NMihjdXJyZW50Tm9kZS5jb250ZW50KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoaW5QbGFjZSkge1xuICAgICAgICBfbmV1dHJhbGl6ZVJvb3QoZGlydHkpO1xuICAgICAgICAvKiBOb2RlcyBfZm9yY2VSZW1vdmUnZCBlYXJsaWVyIGluIHRoZSBhYm9ydGVkIHdhbGsgYXJlIGFscmVhZHlcbiAgICAgICAgICAgZGV0YWNoZWQgZnJvbSB0aGUgcm9vdCwgc28gX25ldXRyYWxpemVSb290J3Mgc3VidHJlZSBwYXNzIGRvZXMgbm90XG4gICAgICAgICAgIHJlYWNoIHRoZW0uIERlZnVzZSB0aGVtIHRvbywgbWlycm9yaW5nIHRoZSBzdWNjZXNzLXBhdGggbG9vcCBiZWxvdy4gKi9cbiAgICAgICAgYXJyYXlGb3JFYWNoKERPTVB1cmlmeS5yZW1vdmVkLCBlbnRyeSA9PiB7XG4gICAgICAgICAgaWYgKGVudHJ5LmVsZW1lbnQpIHtcbiAgICAgICAgICAgIF9uZXV0cmFsaXplU3VidHJlZShlbnRyeS5lbGVtZW50KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICAgIC8qIElmIHdlIHNhbml0aXplZCBgZGlydHlgIGluLXBsYWNlLCByZXR1cm4gaXQuICovXG4gICAgaWYgKGluUGxhY2UpIHtcbiAgICAgIC8qIEZhaWwtY2xvc2VkIGNvbXBsZXRpb24gb2YgdGhlIGF1ZGl0LTUgRjEgZml4OiBldmVyeSBub2RlIHJlbW92ZWQgZnJvbVxuICAgICAgICAgdGhlIGNhbGxlcidzIGxpdmUgdHJlZSBpcyBkZXRhY2hlZCBidXQgbWF5IHN0aWxsIGhvbGQgYSBxdWV1ZWRcbiAgICAgICAgIHJlc291cmNlLWV2ZW50IGhhbmRsZXIgdGhhdCBmaXJlcyBpbiBwYWdlIHNjb3BlIGFmdGVyIHdlIHJldHVybi4gVGhlXG4gICAgICAgICBtb3ZlLWhvaXN0IGNvdmVycyBvbmx5IGRpc2FsbG93ZWQtdGFnIEtFRVBfQ09OVEVOVCByZW1vdmFsczsgc3RyaXAgdGhlXG4gICAgICAgICBub24tYWxsb3ctbGlzdGVkIGF0dHJpYnV0ZXMgb2ZmIGV2ZXJ5IG90aGVyIHJlbW92ZWQgc3VidHJlZSAoY2xvYmJlcixcbiAgICAgICAgIG1YU1MsIG5hbWVzcGFjZSwgY29tbWVudHMsIEtFRVBfQ09OVEVOVDpmYWxzZSwg4oCmKSBzbyB0aG9zZSBoYW5kbGVycyBhcmVcbiAgICAgICAgIGNhbmNlbGxlZCBiZWZvcmUgYW55IGV2ZW50IGNhbiBmaXJlLiBSdW5zIHN5bmNocm9ub3VzbHksIHByZS1yZXR1cm4uICovXG4gICAgICBhcnJheUZvckVhY2goRE9NUHVyaWZ5LnJlbW92ZWQsIGVudHJ5ID0+IHtcbiAgICAgICAgaWYgKGVudHJ5LmVsZW1lbnQpIHtcbiAgICAgICAgICBfbmV1dHJhbGl6ZVN1YnRyZWUoZW50cnkuZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKFNBRkVfRk9SX1RFTVBMQVRFUykge1xuICAgICAgICBfc2NydWJUZW1wbGF0ZUV4cHJlc3Npb25zMihkaXJ0eSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZGlydHk7XG4gICAgfVxuICAgIC8qIFJldHVybiBzYW5pdGl6ZWQgc3RyaW5nIG9yIERPTSAqL1xuICAgIGlmIChSRVRVUk5fRE9NKSB7XG4gICAgICBpZiAoU0FGRV9GT1JfVEVNUExBVEVTKSB7XG4gICAgICAgIF9zY3J1YlRlbXBsYXRlRXhwcmVzc2lvbnMyKGJvZHkpO1xuICAgICAgfVxuICAgICAgaWYgKFJFVFVSTl9ET01fRlJBR01FTlQpIHtcbiAgICAgICAgcmV0dXJuTm9kZSA9IGNyZWF0ZURvY3VtZW50RnJhZ21lbnQuY2FsbChib2R5Lm93bmVyRG9jdW1lbnQpO1xuICAgICAgICB3aGlsZSAoYm9keS5maXJzdENoaWxkKSB7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIHVuaWNvcm4vcHJlZmVyLWRvbS1ub2RlLWFwcGVuZFxuICAgICAgICAgIHJldHVybk5vZGUuYXBwZW5kQ2hpbGQoYm9keS5maXJzdENoaWxkKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuTm9kZSA9IGJvZHk7XG4gICAgICB9XG4gICAgICBpZiAoQUxMT1dFRF9BVFRSLnNoYWRvd3Jvb3QgfHwgQUxMT1dFRF9BVFRSLnNoYWRvd3Jvb3Rtb2RlKSB7XG4gICAgICAgIC8qXG4gICAgICAgICAgQWRvcHROb2RlKCkgaXMgbm90IHVzZWQgYmVjYXVzZSBpbnRlcm5hbCBzdGF0ZSBpcyBub3QgcmVzZXRcbiAgICAgICAgICAoZS5nLiB0aGUgcGFzdCBuYW1lcyBtYXAgb2YgYSBIVE1MRm9ybUVsZW1lbnQpLCB0aGlzIGlzIHNhZmVcbiAgICAgICAgICBpbiB0aGVvcnkgYnV0IHdlIHdvdWxkIHJhdGhlciBub3QgcmlzayBhbm90aGVyIGF0dGFjayB2ZWN0b3IuXG4gICAgICAgICAgVGhlIHN0YXRlIHRoYXQgaXMgY2xvbmVkIGJ5IGltcG9ydE5vZGUoKSBpcyBleHBsaWNpdGx5IGRlZmluZWRcbiAgICAgICAgICBieSB0aGUgc3BlY3MuXG4gICAgICAgICovXG4gICAgICAgIHJldHVybk5vZGUgPSBpbXBvcnROb2RlLmNhbGwob3JpZ2luYWxEb2N1bWVudCwgcmV0dXJuTm9kZSwgdHJ1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuTm9kZTtcbiAgICB9XG4gICAgbGV0IHNlcmlhbGl6ZWRIVE1MID0gV0hPTEVfRE9DVU1FTlQgPyBib2R5Lm91dGVySFRNTCA6IGJvZHkuaW5uZXJIVE1MO1xuICAgIC8qIFNlcmlhbGl6ZSBkb2N0eXBlIGlmIGFsbG93ZWQgKi9cbiAgICBpZiAoV0hPTEVfRE9DVU1FTlQgJiYgQUxMT1dFRF9UQUdTWychZG9jdHlwZSddICYmIGJvZHkub3duZXJEb2N1bWVudCAmJiBib2R5Lm93bmVyRG9jdW1lbnQuZG9jdHlwZSAmJiBib2R5Lm93bmVyRG9jdW1lbnQuZG9jdHlwZS5uYW1lICYmIHJlZ0V4cFRlc3QoRE9DVFlQRV9OQU1FLCBib2R5Lm93bmVyRG9jdW1lbnQuZG9jdHlwZS5uYW1lKSkge1xuICAgICAgc2VyaWFsaXplZEhUTUwgPSAnPCFET0NUWVBFICcgKyBib2R5Lm93bmVyRG9jdW1lbnQuZG9jdHlwZS5uYW1lICsgJz5cXG4nICsgc2VyaWFsaXplZEhUTUw7XG4gICAgfVxuICAgIC8qIFNhbml0aXplIGZpbmFsIHN0cmluZyB0ZW1wbGF0ZS1zYWZlICovXG4gICAgaWYgKFNBRkVfRk9SX1RFTVBMQVRFUykge1xuICAgICAgc2VyaWFsaXplZEhUTUwgPSBfc3RyaXBUZW1wbGF0ZUV4cHJlc3Npb25zKHNlcmlhbGl6ZWRIVE1MKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydXN0ZWRUeXBlc1BvbGljeSAmJiBSRVRVUk5fVFJVU1RFRF9UWVBFID8gX2NyZWF0ZVRydXN0ZWRIVE1MKHNlcmlhbGl6ZWRIVE1MKSA6IHNlcmlhbGl6ZWRIVE1MO1xuICB9O1xuICBET01QdXJpZnkuc2V0Q29uZmlnID0gZnVuY3Rpb24gKCkge1xuICAgIGxldCBjZmcgPSBhcmd1bWVudHMubGVuZ3RoID4gMCAmJiBhcmd1bWVudHNbMF0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1swXSA6IHt9O1xuICAgIF9wYXJzZUNvbmZpZyhjZmcpO1xuICAgIFNFVF9DT05GSUcgPSB0cnVlO1xuICAgIFNFVF9DT05GSUdfQUxMT1dFRF9UQUdTID0gQUxMT1dFRF9UQUdTO1xuICAgIFNFVF9DT05GSUdfQUxMT1dFRF9BVFRSID0gQUxMT1dFRF9BVFRSO1xuICB9O1xuICBET01QdXJpZnkuY2xlYXJDb25maWcgPSBmdW5jdGlvbiAoKSB7XG4gICAgQ09ORklHID0gbnVsbDtcbiAgICBTRVRfQ09ORklHID0gZmFsc2U7XG4gICAgU0VUX0NPTkZJR19BTExPV0VEX1RBR1MgPSBudWxsO1xuICAgIFNFVF9DT05GSUdfQUxMT1dFRF9BVFRSID0gbnVsbDtcbiAgICAvLyBEcm9wIGFueSBjYWxsZXItc3VwcGxpZWQgVHJ1c3RlZCBUeXBlcyBwb2xpY3kgc28gaXQgY2Fubm90IHBvaXNvbiBsYXRlclxuICAgIC8vIGBSRVRVUk5fVFJVU1RFRF9UWVBFYCBvdXRwdXQuIFRoZSBpbnRlcm5hbCBkZWZhdWx0IHBvbGljeSAoY2FjaGVkLCBhbmRcbiAgICAvLyBuZXZlciByZWNyZWF0ZWQg4oCUIFRydXN0ZWQgVHlwZXMgdGhyb3dzIG9uIGR1cGxpY2F0ZSBuYW1lcykgaXMgcmVzdG9yZWQgYnlcbiAgICAvLyB0aGUgbmV4dCBgX3BhcnNlQ29uZmlnYC4gU2VlIEdIU0EtdnhyOC1mcTM0LXZ2eDkuXG4gICAgdHJ1c3RlZFR5cGVzUG9saWN5ID0gZGVmYXVsdFRydXN0ZWRUeXBlc1BvbGljeTtcbiAgICBlbXB0eUhUTUwgPSAnJztcbiAgfTtcbiAgRE9NUHVyaWZ5LmlzVmFsaWRBdHRyaWJ1dGUgPSBmdW5jdGlvbiAodGFnLCBhdHRyLCB2YWx1ZSkge1xuICAgIC8qIEluaXRpYWxpemUgc2hhcmVkIGNvbmZpZyB2YXJzIGlmIG5lY2Vzc2FyeS4gKi9cbiAgICBpZiAoIUNPTkZJRykge1xuICAgICAgX3BhcnNlQ29uZmlnKHt9KTtcbiAgICB9XG4gICAgY29uc3QgbGNUYWcgPSB0cmFuc2Zvcm1DYXNlRnVuYyh0YWcpO1xuICAgIGNvbnN0IGxjTmFtZSA9IHRyYW5zZm9ybUNhc2VGdW5jKGF0dHIpO1xuICAgIHJldHVybiBfaXNWYWxpZEF0dHJpYnV0ZShsY1RhZywgbGNOYW1lLCB2YWx1ZSk7XG4gIH07XG4gIERPTVB1cmlmeS5hZGRIb29rID0gZnVuY3Rpb24gKGVudHJ5UG9pbnQsIGhvb2tGdW5jdGlvbikge1xuICAgIGlmICh0eXBlb2YgaG9va0Z1bmN0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8qIFJlamVjdCB1bmtub3duIGVudHJ5IHBvaW50cy4gV2l0aG91dCB0aGlzLCBhIG5vbi1ob29rIGtleSAoZS5nLlxuICAgICAqICdfX3Byb3RvX18nKSBpbmRleGVzIG9mZiB0aGUgcHJvdG90eXBlIGNoYWluIHJhdGhlciB0aGFuIGEgcmVhbFxuICAgICAqIGhvb2sgYXJyYXksIGFuZCBhcnJheVB1c2ggdGhlbiB3cml0ZXMgdG8gT2JqZWN0LnByb3RvdHlwZS4gR3VhcmRcbiAgICAgKiB3aXRoIGFuIG93bi1wcm9wZXJ0eSBjaGVjayBhZ2FpbnN0IHRoZSBrbm93biBob29rIG5hbWVzLiAqL1xuICAgIGlmICghb2JqZWN0SGFzT3duUHJvcGVydHkoaG9va3MsIGVudHJ5UG9pbnQpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGFycmF5UHVzaChob29rc1tlbnRyeVBvaW50XSwgaG9va0Z1bmN0aW9uKTtcbiAgfTtcbiAgRE9NUHVyaWZ5LnJlbW92ZUhvb2sgPSBmdW5jdGlvbiAoZW50cnlQb2ludCwgaG9va0Z1bmN0aW9uKSB7XG4gICAgaWYgKCFvYmplY3RIYXNPd25Qcm9wZXJ0eShob29rcywgZW50cnlQb2ludCkpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGlmIChob29rRnVuY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgaW5kZXggPSBhcnJheUxhc3RJbmRleE9mKGhvb2tzW2VudHJ5UG9pbnRdLCBob29rRnVuY3Rpb24pO1xuICAgICAgcmV0dXJuIGluZGV4ID09PSAtMSA/IHVuZGVmaW5lZCA6IGFycmF5U3BsaWNlKGhvb2tzW2VudHJ5UG9pbnRdLCBpbmRleCwgMSlbMF07XG4gICAgfVxuICAgIHJldHVybiBhcnJheVBvcChob29rc1tlbnRyeVBvaW50XSk7XG4gIH07XG4gIERPTVB1cmlmeS5yZW1vdmVIb29rcyA9IGZ1bmN0aW9uIChlbnRyeVBvaW50KSB7XG4gICAgaWYgKCFvYmplY3RIYXNPd25Qcm9wZXJ0eShob29rcywgZW50cnlQb2ludCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaG9va3NbZW50cnlQb2ludF0gPSBbXTtcbiAgfTtcbiAgRE9NUHVyaWZ5LnJlbW92ZUFsbEhvb2tzID0gZnVuY3Rpb24gKCkge1xuICAgIGhvb2tzID0gX2NyZWF0ZUhvb2tzTWFwKCk7XG4gIH07XG4gIHJldHVybiBET01QdXJpZnk7XG59XG52YXIgcHVyaWZ5ID0gY3JlYXRlRE9NUHVyaWZ5KCk7XG5cbmV4cG9ydCB7IHB1cmlmeSBhcyBkZWZhdWx0IH07XG4vLyMgc291cmNlTWFwcGluZ1VSTD1wdXJpZnkuZXMubWpzLm1hcFxuIiwiaW1wb3J0IERPTVB1cmlmeSBmcm9tICdkb21wdXJpZnknO1xuXG4vKipcbiAqIFNhbml0aXplIGFuIEhUTUwgc3RyaW5nIGZvciBzYWZlIGFzc2lnbm1lbnQgdG8gYGlubmVySFRNTGAuXG4gKlxuICogRE9NUHVyaWZ5IHJldHVybnMgYHN0cmluZ2AgKG9yIGBUcnVzdGVkSFRNTGAgd2hlbiB0aGUgYnJvd3NlciBzdXBwb3J0c1xuICogdHJ1c3RlZC10eXBlcykuIEluIGVpdGhlciBjYXNlIHRoZSBIVE1MIGhhcyBiZWVuIGZpbHRlcmVkIGFuZCBpcyBzYWZlLlxuICpcbiAqIFdlIGNhc3QgdGhyb3VnaCBgdW5rbm93bmAgYmVjYXVzZSBgSFRNTEVsZW1lbnQuaW5uZXJIVE1MYCBpcyB0eXBlZCBhc1xuICogYHN0cmluZ2AgaW4gdGhlIHByb2plY3QncyBgbGliLmRvbS5kLnRzYCDigJQgRE9NUHVyaWZ5J3MgcmV0dXJuIHR5cGVcbiAqIChgc3RyaW5nIHwgVHJ1c3RlZEhUTUxgKSBkb2Vzbid0IG1hdGNoLCBidXQgdGhlIHZhbHVlIElTIHNhZmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgcHVyaWZ5ID0gRE9NUHVyaWZ5KHdpbmRvdyk7XG4gIGNvbnN0IHNhbml0aXplZCA9IHB1cmlmeS5zYW5pdGl6ZShodG1sLCB7XG4gICAgRk9SQklEX1RBR1M6IFsnc3R5bGUnLCAnc2NyaXB0JywgJ2xpbmsnXSxcbiAgICBGT1JCSURfQVRUUjogWydvbmVycm9yJywgJ29ubG9hZCcsICdmb3JtYWN0aW9uJ10sXG4gIH0pO1xuICByZXR1cm4gU3RyaW5nKHNhbml0aXplZCk7XG59XG4iLCJpbXBvcnQgdHlwZSB7IEFwcCB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHR5cGUgVmVyaWxvZ0JpdGZpZWxkUGx1Z2luIGZyb20gJy4vbWFpbic7XHJcbmltcG9ydCB0eXBlIHsgVGFibGVUaGVtZSwgUGx1Z2luRGF0YSBhcyBQbHVnaW5EYXRhVHlwZXMgfSBmcm9tICcuL21haW4nO1xyXG5pbXBvcnQgdHlwZSB7IFN2Z1RoZW1lIH0gZnJvbSAnLi9jb2xvcnMnO1xyXG5cclxuY29uc3QgVEFCTEVfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8VGFibGVUaGVtZSwgc3RyaW5nPiA9IHtcclxuICBkZWZhdWx0OiAnRGVmYXVsdCDigJQgZ3JpZCBsaW5lcywgZ3JheSBoZWFkZXInLFxyXG4gIG1pbmltYWw6ICdNaW5pbWFsIOKAlCBob3Jpem9udGFsIGxpbmVzIG9ubHknLFxyXG4gIHplYnJhOiAnWmVicmEg4oCUIGFsdGVybmF0aW5nIHJvdyBjb2xvcnMnLFxyXG4gIGNsZWFuOiAnQ2xlYW4g4oCUIG5vIGJvcmRlcnMsIHdoaXRlc3BhY2Ugc2VwYXJhdGlvbicsXHJcbiAgJ2RhcmstaGVhZGVyJzogJ0RhcmsgSGVhZGVyIOKAlCBkYXJrIGhlYWRlciwgY2xlYW4gYm9keScsXHJcbn07XHJcblxyXG5jb25zdCBTVkdfVEhFTUVfTEFCRUxTOiBSZWNvcmQ8U3ZnVGhlbWUsIHN0cmluZz4gPSB7XHJcbiAgcGFzdGVsOiAnUGFzdGVsIOKAlCBzb2Z0IHBhc3RlbCBjb2xvcnMnLFxyXG4gIHZpdmlkOiAnVml2aWQg4oCUIGJvbGQgc2F0dXJhdGVkIGNvbG9ycycsXHJcbiAgbW9ubzogJ01vbm8g4oCUIGdyYXlzY2FsZScsXHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgVmVyaWxvZ0JpdGZpZWxkU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogVmVyaWxvZ0JpdGZpZWxkUGx1Z2luO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBWZXJpbG9nQml0ZmllbGRQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZ2V0IGRhdGEoKTogUGx1Z2luRGF0YVR5cGVzIHsgcmV0dXJuIHRoaXMucGx1Z2luLnNhdmVkRGF0YTsgfVxyXG4gIHNldCBkYXRhKHY6IFBsdWdpbkRhdGFUeXBlcykgeyB0aGlzLnBsdWdpbi5zYXZlZERhdGEgPSB2OyB9XHJcblxyXG4gIGRpc3BsYXkoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xyXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnQml0ZmllbGQnKS5zZXRIZWFkaW5nKCk7XHJcblxyXG4gICAgLy8gU1ZHIOS4u+mimFxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdTVkcgdGhlbWUnKVxyXG4gICAgICAuc2V0RGVzYygnQ29sb3Igc2NoZW1lIGZvciBiaXRmaWVsZCBkaWFncmFtcycpXHJcbiAgICAgIC5hZGREcm9wZG93bihkcm9wID0+IHtcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIGxhYmVsXSBvZiBPYmplY3QuZW50cmllcyhTVkdfVEhFTUVfTEFCRUxTKSkge1xyXG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGRyb3Auc2V0VmFsdWUodGhpcy5kYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnKTtcclxuICAgICAgICBkcm9wLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5kYXRhLnN2Z1RoZW1lID0gdmFsdWUgYXMgU3ZnVGhlbWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLmRhdGEpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVyZW5kZXJBbGxTdmcoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgLy8gU1ZHIOihjOmrmFxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKCdTVkcgcm93IGhlaWdodCcpXHJcbiAgICAgIC5zZXREZXNjKCdIZWlnaHQgb2YgZWFjaCBmaWVsZCByb3cgaW4gYml0ZmllbGQgZGlhZ3JhbXMgKHB4KScpXHJcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHtcclxuICAgICAgICBzbGlkZXIuc2V0TGltaXRzKDI4LCA4MCwgMik7XHJcbiAgICAgICAgc2xpZGVyLnNldFZhbHVlKHRoaXMuZGF0YS5zdmdCb3hIZWlnaHQgfHwgMzgpO1xyXG4gICAgICAgIHNsaWRlci5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHRoaXMuZGF0YS5zdmdCb3hIZWlnaHQgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVEYXRhKHRoaXMuZGF0YSk7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZXJlbmRlckFsbFN2ZygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAvLyDooajmoLzkuLvpophcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnVGFibGUgdGhlbWUnKVxyXG4gICAgICAuc2V0RGVzYygnVmlzdWFsIHN0eWxlIGZvciByZW5kZXJlZCB0YWJsZXMnKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcCA9PiB7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBsYWJlbF0gb2YgT2JqZWN0LmVudHJpZXMoVEFCTEVfVEhFTUVfTEFCRUxTKSkge1xyXG4gICAgICAgICAgZHJvcC5hZGRPcHRpb24oa2V5LCBsYWJlbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGRyb3Auc2V0VmFsdWUodGhpcy5kYXRhLnRhYmxlVGhlbWUgfHwgJ2RlZmF1bHQnKTtcclxuICAgICAgICBkcm9wLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5kYXRhLnRhYmxlVGhlbWUgPSB2YWx1ZSBhcyBUYWJsZVRoZW1lO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZURhdGEodGhpcy5kYXRhKTtcclxuICAgICAgICAgIHRoaXMuYXBwbHlUYWJsZVRoZW1lKHZhbHVlIGFzIFRhYmxlVGhlbWUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAvLyDooajmoLzooYzpq5hcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZSgnVGFibGUgcm93IGhlaWdodCcpXHJcbiAgICAgIC5zZXREZXNjKCdSb3cgaGVpZ2h0IGZvciByZW5kZXJlZCB0YWJsZXMgKHB4KScpXHJcbiAgICAgIC5hZGRTbGlkZXIoc2xpZGVyID0+IHtcclxuICAgICAgICBzbGlkZXIuc2V0TGltaXRzKDE4LCA0OCwgMik7XHJcbiAgICAgICAgc2xpZGVyLnNldFZhbHVlKHRoaXMuZGF0YS50YWJsZVJvd0hlaWdodCB8fCAyOCk7XHJcbiAgICAgICAgc2xpZGVyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5kYXRhLnRhYmxlUm93SGVpZ2h0ID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlRGF0YSh0aGlzLmRhdGEpO1xyXG4gICAgICAgICAgdGhpcy5hcHBseVRhYmxlUm93SGVpZ2h0KHZhbHVlKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFwcGx5VGFibGVUaGVtZSh0aGVtZTogVGFibGVUaGVtZSk6IHZvaWQge1xyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnZlcmlsb2ctYml0ZmllbGQtdGFibGUtY29udGFpbmVyJykuZm9yRWFjaChlbCA9PiB7XHJcbiAgICAgIGVsLnNldEF0dHJpYnV0ZSgnZGF0YS10aGVtZScsIHRoZW1lKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhcHBseVRhYmxlUm93SGVpZ2h0KGhlaWdodDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYmYtdGFibGUtcm93LWhlaWdodCcsIGAke2hlaWdodH1weGApO1xyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgdHlwZSB7IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQgfSBmcm9tICdvYnNpZGlhbic7XHJcbmltcG9ydCB7IFBsdWdpbiB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuL3BhcnNlcic7XHJcbmltcG9ydCB7IHJlbmRlckJsb2NrU3ZnIH0gZnJvbSAnLi9zdmdSZW5kZXJlcic7XHJcbmltcG9ydCB7IHJlbmRlckJsb2NrVGFibGUgfSBmcm9tICcuL3RhYmxlUmVuZGVyZXInO1xyXG5pbXBvcnQgdHlwZSB7IFJlZ2lzdHJ5RW50cnksIEZpZWxkQmxvY2sgfSBmcm9tICcuL3R5cGVzJztcclxuaW1wb3J0IHsgc2FuaXRpemVIdG1sIH0gZnJvbSAnLi91dGlscy9zYW5pdGl6ZSc7XHJcbmltcG9ydCB7IFZlcmlsb2dCaXRmaWVsZFNldHRpbmdUYWIgfSBmcm9tICcuL3NldHRpbmdzJztcclxuaW1wb3J0IHR5cGUgeyBTdmdUaGVtZSB9IGZyb20gJy4vY29sb3JzJztcclxuXHJcbmV4cG9ydCB0eXBlIFRhYmxlVGhlbWUgPSAnZGVmYXVsdCcgfCAnbWluaW1hbCcgfCAnemVicmEnIHwgJ2NsZWFuJyB8ICdkYXJrLWhlYWRlcic7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFBsdWdpbkRhdGEge1xyXG4gIGRlZmF1bHRWaWV3PzogJ3N2ZycgfCAndGFibGUnO1xyXG4gIHRhYmxlVGhlbWU/OiBUYWJsZVRoZW1lO1xyXG4gIHN2Z1RoZW1lPzogU3ZnVGhlbWU7XHJcbiAgc3ZnQm94SGVpZ2h0PzogbnVtYmVyO1xyXG4gIHRhYmxlUm93SGVpZ2h0PzogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9EQVRBOiBQbHVnaW5EYXRhID0geyBkZWZhdWx0VmlldzogJ3N2ZycsIHRhYmxlVGhlbWU6ICdkZWZhdWx0Jywgc3ZnVGhlbWU6ICdwYXN0ZWwnLCBzdmdCb3hIZWlnaHQ6IDM4LCB0YWJsZVJvd0hlaWdodDogMjggfTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFZlcmlsb2dCaXRmaWVsZFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcbiAgcHJpdmF0ZSBibG9ja1JlZ2lzdHJ5OiBNYXA8c3RyaW5nLCBSZWdpc3RyeUVudHJ5PiA9IG5ldyBNYXAoKTtcclxuICBwcml2YXRlIHBlbmRpbmdSZWZzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0YXJnZXROYW1lOiBzdHJpbmcgfVtdID0gW107XHJcbiAgcHJpdmF0ZSBjdXJyZW50Tm90ZVBhdGg6IHN0cmluZyA9ICcnO1xyXG4gIHByaXZhdGUgYWN0aXZlVG9vbHRpcDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHRvb2x0aXBSZW1vdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcclxuICBwcml2YXRlIHBsdWdpbkRhdGE6IFBsdWdpbkRhdGEgPSBERUZBVUxUX0RBVEE7XHJcblxyXG4gIC8vIHB1YmxpYyBhY2Nlc3NvciBmb3IgU2V0dGluZ1RhYlxyXG4gIGdldCBzYXZlZERhdGEoKTogUGx1Z2luRGF0YSB7IHJldHVybiB0aGlzLnBsdWdpbkRhdGE7IH1cclxuICBzZXQgc2F2ZWREYXRhKHY6IFBsdWdpbkRhdGEpIHsgdGhpcy5wbHVnaW5EYXRhID0gdjsgfVxyXG5cclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICB0aGlzLnBsdWdpbkRhdGEgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX0RBVEEsIChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIFBsdWdpbkRhdGEpO1xyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBWZXJpbG9nQml0ZmllbGRTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ3Zlcmlsb2ctYml0ZmllbGQnLCB0aGlzLnByb2Nlc3NCaXRmaWVsZC5iaW5kKHRoaXMpKTtcclxuICAgIC8vIOW6lOeUqOS/neWtmOeahOihqOagvOihjOmrmFxyXG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWJmLXRhYmxlLXJvdy1oZWlnaHQnLCBgJHt0aGlzLnBsdWdpbkRhdGEudGFibGVSb3dIZWlnaHQgfHwgMjh9cHhgKTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge1xyXG4gICAgdGhpcy5ibG9ja1JlZ2lzdHJ5LmNsZWFyKCk7XHJcbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gW107XHJcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIHByb2Nlc3NCaXRmaWVsZChzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50LCBjdHg6IE1hcmtkb3duUG9zdFByb2Nlc3NvckNvbnRleHQpIHtcclxuICAgIHRoaXMuY3VycmVudE5vdGVQYXRoID0gY3R4LnNvdXJjZVBhdGggfHwgJyc7XHJcbiAgICBjb25zdCByZXN1bHQgPSBwYXJzZShzb3VyY2UpO1xyXG5cclxuICAgIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgdGhpcy5yZW5kZXJFcnJvcnMoZWwsIHJlc3VsdC5lcnJvcnMgfHwgW10pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFyZXN1bHQuYmxvY2tzKSByZXR1cm47XHJcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBibG9ja10gb2YgcmVzdWx0LmJsb2Nrcykge1xyXG4gICAgICB0aGlzLnJlbmRlckJsb2NrKG5hbWUsIGJsb2NrLCBlbCk7XHJcbiAgICB9XHJcblxyXG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5yZXNvbHZlUGVuZGluZ1JlZnMoKSwgNTApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhuYW1lOiBzdHJpbmcsIGJsb2NrOiBGaWVsZEJsb2NrLCBwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHBhcmVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7XHJcbiAgICAgIGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtY29udGFpbmVyJyxcclxuICAgICAgYXR0cjogeyBpZDogYGJmOiR7bmFtZX1gIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGhlYWRlclJvdyA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWhlYWRlci1yb3cnIH0pO1xyXG4gICAgY29uc3QgZGVzYyA9IGJsb2NrLmRlc2NyaXB0aW9uID8gYCDigJQgJHtibG9jay5kZXNjcmlwdGlvbn1gIDogJyc7XHJcbiAgICBoZWFkZXJSb3cuY3JlYXRlRWwoJ3NwYW4nLCB7XHJcbiAgICAgIHRleHQ6IGAke25hbWV9JHtkZXNjfSDnmoQgJHtibG9jay53aWR0aH0gYml0IOWumuS5ieWmguS4i++8mmAsXHJcbiAgICAgIGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtaGVhZGVyJ1xyXG4gICAgfSk7XHJcbiAgICBjb25zdCB0b2dnbGVCdG4gPSB0aGlzLmNyZWF0ZVRvZ2dsZUJ1dHRvbihoZWFkZXJSb3cpO1xyXG5cclxuICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3Zlcmlsb2ctYml0ZmllbGQtY29udGVudCcgfSk7XHJcbiAgICBjb25zdCBzdmdDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLXN2ZycgfSk7XHJcbiAgICBzdmdDb250YWluZXIuaW5uZXJIVE1MID0gc2FuaXRpemVIdG1sKFxyXG4gICAgICByZW5kZXJCbG9ja1N2ZyhibG9jaywgdGhpcy5wbHVnaW5EYXRhLnN2Z1RoZW1lIHx8ICdwYXN0ZWwnLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDQ0KSxcclxuICAgICk7XHJcbiAgICB0aGlzLnNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XHJcbiAgICB0aGlzLnNldHVwVG9vbHRpcEhhbmRsZXJzKHN2Z0NvbnRhaW5lcik7XHJcblxyXG4gICAgY29uc3QgdGFibGVDb250YWluZXIgPSBjb250ZW50V3JhcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLXRhYmxlLWNvbnRhaW5lcicgfSk7XHJcbiAgICB0YWJsZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnLCB0aGlzLnBsdWdpbkRhdGEudGFibGVUaGVtZSB8fCAnZGVmYXVsdCcpO1xyXG4gICAgdGFibGVDb250YWluZXIuaW5uZXJIVE1MID0gc2FuaXRpemVIdG1sKHJlbmRlckJsb2NrVGFibGUoYmxvY2spKTtcclxuICAgIHRoaXMuc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyh0YWJsZUNvbnRhaW5lcik7XHJcbiAgICB0aGlzLnNldHVwVGFibGVUb29sdGlwSGFuZGxlcnModGFibGVDb250YWluZXIpO1xyXG5cclxuICAgIC8vIOWIneWni+WMluinhuWbvu+8muivu+WPluS/neWtmOeahOWBj+WlvVxyXG4gICAgY29uc3QgZGVmYXVsdFZpZXcgPSB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgfHwgJ3N2Zyc7XHJcbiAgICB0aGlzLmFwcGx5VmlldyhkZWZhdWx0VmlldywgY29udGVudFdyYXAsIHN2Z0NvbnRhaW5lciwgdGFibGVDb250YWluZXIsIHRvZ2dsZUJ0bik7XHJcblxyXG4gICAgLy8g57uR5a6a5YiH5o2i5LqL5Lu2XHJcbiAgICB0b2dnbGVCdG4ub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICBjb25zdCB2aWV3ID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgYXMgJ3N2ZycgfCAndGFibGUnIHwgbnVsbDtcclxuICAgICAgaWYgKHZpZXcpIHtcclxuICAgICAgICB0aGlzLmFwcGx5Vmlldyh2aWV3LCBjb250ZW50V3JhcCwgc3ZnQ29udGFpbmVyLCB0YWJsZUNvbnRhaW5lciwgdG9nZ2xlQnRuKTtcclxuICAgICAgICB0aGlzLnBsdWdpbkRhdGEuZGVmYXVsdFZpZXcgPSB2aWV3O1xyXG4gICAgICAgIHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5EYXRhKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmJsb2NrUmVnaXN0cnkuc2V0KG5hbWUsIHtcclxuICAgICAgZWxlbWVudDogY29udGFpbmVyLFxyXG4gICAgICBibG9jayxcclxuICAgICAgbm90ZVBhdGg6IHRoaXMuY3VycmVudE5vdGVQYXRoXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmNvbGxlY3RQZW5kaW5nUmVmcyhzdmdDb250YWluZXIpO1xyXG4gICAgdGhpcy5jb2xsZWN0UGVuZGluZ1JlZnModGFibGVDb250YWluZXIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhcHBseVZpZXcodmlldzogJ3N2ZycgfCAndGFibGUnLCBjb250ZW50V3JhcDogSFRNTEVsZW1lbnQsIHN2Z0VsOiBIVE1MRWxlbWVudCwgdGFibGVFbDogSFRNTEVsZW1lbnQsIGJ0bjogSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnRlbnRXcmFwLnNldEF0dHJpYnV0ZSgnZGF0YS12aWV3Jywgdmlldyk7XHJcbiAgICBidG4ucXVlcnlTZWxlY3RvckFsbCgnLmJmLXRvZ2dsZS1vcHRpb24nKS5mb3JFYWNoKG9wdCA9PiB7XHJcbiAgICAgIG9wdC5jbGFzc0xpc3QudG9nZ2xlKCdiZi10b2dnbGUtYWN0aXZlJywgb3B0LmdldEF0dHJpYnV0ZSgnZGF0YS12aWV3JykgPT09IHZpZXcpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNyZWF0ZVRvZ2dsZUJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xyXG4gICAgY29uc3QgYnRuID0gcGFyZW50LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2JmLXZpZXctdG9nZ2xlJyB9KTtcclxuICAgIGJ0bi5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogJ+S9jeWfn+WbvicsIGNsczogJ2JmLXRvZ2dsZS1vcHRpb24gYmYtdG9nZ2xlLXN2ZycsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICdzdmcnIH0gfSk7XHJcbiAgICBidG4uY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfooajmoLwnLCBjbHM6ICdiZi10b2dnbGUtb3B0aW9uIGJmLXRvZ2dsZS10YWJsZScsIGF0dHI6IHsgJ2RhdGEtdmlldyc6ICd0YWJsZScgfSB9KTtcclxuICAgIHJldHVybiBidG47XHJcbiAgfVxyXG5cclxuICAvKiogUmVyZW5kZXIgYWxsIFNWR3Mgd2l0aCBjdXJyZW50IHRoZW1lIOKAlCBwdWJsaWMgZm9yIFNldHRpbmdUYWIgKi9cclxuICBwdWJsaWMgcmVyZW5kZXJBbGxTdmcoKTogdm9pZCB7XHJcbiAgICBjb25zdCB0aGVtZSA9IHRoaXMucGx1Z2luRGF0YS5zdmdUaGVtZSB8fCAncGFzdGVsJztcclxuICAgIGZvciAoY29uc3QgWywgZW50cnldIG9mIHRoaXMuYmxvY2tSZWdpc3RyeSkge1xyXG4gICAgICBjb25zdCBzdmdDb250YWluZXIgPSBlbnRyeS5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy52ZXJpbG9nLWJpdGZpZWxkLXN2ZycpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAgICAgaWYgKHN2Z0NvbnRhaW5lcikge1xyXG4gICAgICAgIHN2Z0NvbnRhaW5lci5pbm5lckhUTUwgPSBzYW5pdGl6ZUh0bWwocmVuZGVyQmxvY2tTdmcoZW50cnkuYmxvY2ssIHRoZW1lLCB0aGlzLnBsdWdpbkRhdGEuc3ZnQm94SGVpZ2h0IHx8IDQ0KSk7XHJcbiAgICAgICAgdGhpcy5zZXR1cE5hdmlnYXRpb25IYW5kbGVycyhzdmdDb250YWluZXIpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBUb29sdGlwSGFuZGxlcnMoc3ZnQ29udGFpbmVyKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZW5kZXJFcnJvcnMoZWw6IEhUTUxFbGVtZW50LCBlcnJvcnM6IHsgbGluZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IHN1Z2dlc3Rpb24/OiBzdHJpbmcgfVtdKSB7XHJcbiAgICBlbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICd2ZXJpbG9nLWJpdGZpZWxkLWVycm9yJyB9LCAoZXJyb3JFbCkgPT4ge1xyXG4gICAgICBlcnJvckVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAn6Kej5p6Q6ZSZ6K+vOicgfSk7XHJcbiAgICAgIGZvciAoY29uc3QgZXJyb3Igb2YgZXJyb3JzKSB7XHJcbiAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOihjCAke2Vycm9yLmxpbmV9OiAke2Vycm9yLm1lc3NhZ2V9YCB9KTtcclxuICAgICAgICBpZiAoZXJyb3Iuc3VnZ2VzdGlvbikge1xyXG4gICAgICAgICAgZXJyb3JFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYOW7uuiurjogJHtlcnJvci5zdWdnZXN0aW9ufWAsIGNsczogJ3N1Z2dlc3Rpb24nIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyDilIDilIDilIAg54K55Ye76Lez6L2sIOKUgOKUgOKUgFxyXG5cclxuICBwcml2YXRlIHNldHVwTmF2aWdhdGlvbkhhbmRsZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcclxuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcclxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xyXG4gICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2V0dXBUYWJsZU5hdmlnYXRpb25IYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYmYtcmVmLWxpbmsnKSkge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS10YXJnZXQnKTtcclxuICAgICAgICBpZiAocmVmTmFtZSkgdGhpcy5zY3JvbGxUb0Jsb2NrKHJlZk5hbWUpO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzY3JvbGxUb0Jsb2NrKGJsb2NrTmFtZTogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcclxuICAgIGlmICghZW50cnkpIHJldHVybjtcclxuICAgIGVudHJ5LmVsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnY2VudGVyJyB9KTtcclxuICAgIGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYmYtaGlnaGxpZ2h0Jyk7XHJcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiBlbnRyeS5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2JmLWhpZ2hsaWdodCcpLCAxNTAwKTtcclxuICB9XHJcblxyXG4gIC8vIOKUgOKUgOKUgCDmgqzmta4gdG9vbHRpcCDilIDilIDilIBcclxuXHJcbiAgcHJpdmF0ZSBzZXR1cFRvb2x0aXBIYW5kbGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdmVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgU1ZHRWxlbWVudDtcclxuICAgICAgY29uc3QgcmVmTmFtZSA9IHRhcmdldC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJylcclxuICAgICAgICB8fCB0YXJnZXQucGFyZW50RWxlbWVudD8uZ2V0QXR0cmlidXRlKCdkYXRhLXJlZicpO1xyXG4gICAgICBpZiAocmVmTmFtZSkge1xyXG4gICAgICAgIC8vIOm8oOagh+WbnuWIsOa6kOWFg+e0oOS4iu+8jOWPlua2iOW+heWIoOmZpOWumuaXtuWZqFxyXG4gICAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xyXG4gICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XHJcbiAgICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldFZpZXdGb3JCbG9jayhyZWZOYW1lKTtcclxuICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VvdXQnLCAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBTVkdFbGVtZW50O1xyXG4gICAgICBjb25zdCByZWZOYW1lID0gdGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKVxyXG4gICAgICAgIHx8IHRhcmdldC5wYXJlbnRFbGVtZW50Py5nZXRBdHRyaWJ1dGUoJ2RhdGEtcmVmJyk7XHJcbiAgICAgIGlmIChyZWZOYW1lKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwVGFibGVUb29sdGlwSGFuZGxlcnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICBpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYmYtcmVmLWxpbmsnKSkge1xyXG4gICAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xyXG4gICAgICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcik7XHJcbiAgICAgICAgICB0aGlzLnRvb2x0aXBSZW1vdmVUaW1lciA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHJlZk5hbWUgPSB0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpO1xyXG4gICAgICAgIGlmIChyZWZOYW1lKSB7XHJcbiAgICAgICAgICBjb25zdCB2aWV3ID0gdGhpcy5nZXRWaWV3Rm9yQmxvY2socmVmTmFtZSk7XHJcbiAgICAgICAgICB0aGlzLnNob3dUb29sdGlwKHJlZk5hbWUsIGUuY2xpZW50WCwgZS5jbGllbnRZLCB2aWV3KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlb3V0JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgIGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdiZi1yZWYtbGluaycpKSB0aGlzLnNjaGVkdWxlVG9vbHRpcFJlbW92ZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKiog6I635Y+W6KKr5byV55So5Z2X6Ieq6Lqr55qE6KeG5Zu+54q25oCB77yM5LiN5a2Y5Zyo5YiZ55So6buY6K6k5YGP5aW9ICovXHJcbiAgcHJpdmF0ZSBnZXRWaWV3Rm9yQmxvY2soYmxvY2tOYW1lOiBzdHJpbmcpOiAnc3ZnJyB8ICd0YWJsZScge1xyXG4gICAgY29uc3QgZW50cnkgPSB0aGlzLmJsb2NrUmVnaXN0cnkuZ2V0KGJsb2NrTmFtZSk7XHJcbiAgICBpZiAoZW50cnkpIHtcclxuICAgICAgY29uc3QgY29udGVudFdyYXAgPSBlbnRyeS5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy52ZXJpbG9nLWJpdGZpZWxkLWNvbnRlbnQnKTtcclxuICAgICAgY29uc3QgdmlldyA9IGNvbnRlbnRXcmFwPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdmlldycpIGFzICdzdmcnIHwgJ3RhYmxlJyB8IHVuZGVmaW5lZDtcclxuICAgICAgaWYgKHZpZXcpIHJldHVybiB2aWV3O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMucGx1Z2luRGF0YS5kZWZhdWx0VmlldyB8fCAnc3ZnJztcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2NoZWR1bGVUb29sdGlwUmVtb3ZlKCkge1xyXG4gICAgdGhpcy50b29sdGlwUmVtb3ZlVGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIHRoaXMucmVtb3ZlVG9vbHRpcCgpO1xyXG4gICAgfSwgMjAwKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2hvd1Rvb2x0aXAoYmxvY2tOYW1lOiBzdHJpbmcsIG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlciwgdmlldzogJ3N2ZycgfCAndGFibGUnKSB7XHJcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuYmxvY2tSZWdpc3RyeS5nZXQoYmxvY2tOYW1lKTtcclxuICAgIGlmICghZW50cnkpIHJldHVybjtcclxuXHJcbiAgICB0aGlzLnJlbW92ZVRvb2x0aXAoKTtcclxuXHJcbiAgICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuYm9keS5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwJyB9KTtcclxuXHJcbiAgICBjb25zdCBkZXNjID0gZW50cnkuYmxvY2suZGVzY3JpcHRpb24gPyBgIOKAlCAke2VudHJ5LmJsb2NrLmRlc2NyaXB0aW9ufWAgOiAnJztcclxuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGAke2Jsb2NrTmFtZX0ke2Rlc2N9YCwgY2xzOiAnYmYtdG9vbHRpcC1oZWFkZXInIH0pO1xyXG5cclxuICAgIGlmICh2aWV3ID09PSAnc3ZnJykge1xyXG4gICAgICBjb25zdCBzdmdXcmFwID0gdG9vbHRpcC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdiZi10b29sdGlwLXN2ZycgfSk7XHJcbiAgICAgIHN2Z1dyYXAuaW5uZXJIVE1MID0gc2FuaXRpemVIdG1sKHJlbmRlckJsb2NrU3ZnKGVudHJ5LmJsb2NrLCB0aGlzLnBsdWdpbkRhdGEuc3ZnVGhlbWUgfHwgJ3Bhc3RlbCcsIHRoaXMucGx1Z2luRGF0YS5zdmdCb3hIZWlnaHQgfHwgNDQpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IHRhYmxlV3JhcCA9IHRvb2x0aXAuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnYmYtdG9vbHRpcC10YWJsZScgfSk7XHJcbiAgICAgIHRhYmxlV3JhcC5pbm5lckhUTUwgPSBzYW5pdGl6ZUh0bWwocmVuZGVyQmxvY2tUYWJsZShlbnRyeS5ibG9jaykpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvb2x0aXAuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICfljZXlh7vot7Povazmn6XnnIvlrozmlbTlrprkuYknLCBjbHM6ICdiZi10b29sdGlwLWhpbnQnIH0pO1xyXG5cclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodG9vbHRpcCk7XHJcbiAgICB0aGlzLmFjdGl2ZVRvb2x0aXAgPSB0b29sdGlwO1xyXG5cclxuICAgIGNvbnN0IHJlY3QgPSB0b29sdGlwLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgbGV0IGxlZnQgPSBtb3VzZVggKyAxMjtcclxuICAgIGxldCB0b3AgPSBtb3VzZVkgLSAyMDtcclxuICAgIGlmIChsZWZ0ICsgcmVjdC53aWR0aCA+IHdpbmRvdy5pbm5lcldpZHRoIC0gMTYpIGxlZnQgPSBtb3VzZVggLSByZWN0LndpZHRoIC0gMTI7XHJcbiAgICBpZiAodG9wICsgcmVjdC5oZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQgLSAxNikgdG9wID0gd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSAxNjtcclxuICAgIGlmICh0b3AgPCA4KSB0b3AgPSA4O1xyXG5cclxuICAgIHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xyXG4gICAgdG9vbHRpcC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xyXG4gICAgLy8g6byg5qCH6L+b5YWlIHRvb2x0aXAg5pe25Y+W5raI5b6F5Yig6Zmk5a6a5pe25ZmoXHJcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLnRvb2x0aXBSZW1vdmVUaW1lcikge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy50b29sdGlwUmVtb3ZlVGltZXIpO1xyXG4gICAgICAgIHRoaXMudG9vbHRpcFJlbW92ZVRpbWVyID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICB0b29sdGlwLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB0aGlzLnJlbW92ZVRvb2x0aXAoKSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbW92ZVRvb2x0aXAoKSB7XHJcbiAgICBpZiAodGhpcy5hY3RpdmVUb29sdGlwKSB7XHJcbiAgICAgIHRoaXMuYWN0aXZlVG9vbHRpcC5yZW1vdmUoKTtcclxuICAgICAgdGhpcy5hY3RpdmVUb29sdGlwID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIOKUgOKUgOKUgCDlvJXnlKjop6PmnpAg4pSA4pSA4pSAXHJcblxyXG4gIHByaXZhdGUgY29sbGVjdFBlbmRpbmdSZWZzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1yZWZdJykuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgY29uc3QgcmVmTmFtZSA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1yZWYnKSA/PyAnJztcclxuICAgICAgaWYgKCFyZWZOYW1lKSByZXR1cm47XHJcbiAgICAgIGlmICghdGhpcy5ibG9ja1JlZ2lzdHJ5LmhhcyhyZWZOYW1lKSkge1xyXG4gICAgICAgIHRoaXMucGVuZGluZ1JlZnMucHVzaCh7IGVsZW1lbnQ6IGVsIGFzIEhUTUxFbGVtZW50LCB0YXJnZXROYW1lOiByZWZOYW1lIH0pO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuYmYtcmVmLWxpbmsnKS5mb3JFYWNoKChlbCkgPT4ge1xyXG4gICAgICBjb25zdCB0YXJnZXROYW1lID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXRhcmdldCcpID8/ICcnO1xyXG4gICAgICBpZiAoIXRhcmdldE5hbWUpIHJldHVybjtcclxuICAgICAgaWYgKCF0aGlzLmJsb2NrUmVnaXN0cnkuaGFzKHRhcmdldE5hbWUpKSB7XHJcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVmcy5wdXNoKHsgZWxlbWVudDogZWwgYXMgSFRNTEVsZW1lbnQsIHRhcmdldE5hbWUgfSk7XHJcbiAgICAgICAgKGVsIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVzb2x2ZVBlbmRpbmdSZWZzKCkge1xyXG4gICAgY29uc3Qgc3RpbGxQZW5kaW5nOiB0eXBlb2YgdGhpcy5wZW5kaW5nUmVmcyA9IFtdO1xyXG4gICAgZm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMucGVuZGluZ1JlZnMpIHtcclxuICAgICAgaWYgKHRoaXMuYmxvY2tSZWdpc3RyeS5oYXMocGVuZGluZy50YXJnZXROYW1lKSkge1xyXG4gICAgICAgIHBlbmRpbmcuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdiZi1yZWYtdW5yZXNvbHZlZCcpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHN0aWxsUGVuZGluZy5wdXNoKHBlbmRpbmcpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICB0aGlzLnBlbmRpbmdSZWZzID0gc3RpbGxQZW5kaW5nO1xyXG4gIH1cclxufVxyXG4iXSwibmFtZXMiOlsiaSIsInB1cmlmeSIsIkRPTVB1cmlmeSIsIlBsdWdpblNldHRpbmdUYWIiLCJTZXR0aW5nIiwiUGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFhTyxTQUFTLE1BQU0sS0FBQSxFQUE0QjtBQUNoRCxFQUFBLE1BQU0sS0FBQSxHQUFRLEtBQUEsQ0FBTSxLQUFBLENBQU0sSUFBSSxDQUFBO0FBQzlCLEVBQUEsTUFBTSxTQUF1QixFQUFDO0FBQzlCLEVBQUEsTUFBTSxNQUFBLHVCQUFhLEdBQUEsRUFBd0I7QUFDM0MsRUFBQSxNQUFNLFVBQUEsdUJBQWlCLEdBQUEsRUFBWTtBQUduQyxFQUFBLE1BQU0sV0FBc0IsRUFBQztBQUM3QixFQUFBLEtBQUEsSUFBU0EsRUFBQUEsR0FBSSxDQUFBLEVBQUdBLEVBQUFBLEdBQUksS0FBQSxDQUFNLFFBQVFBLEVBQUFBLEVBQUFBLEVBQUs7QUFDckMsSUFBQSxNQUFNLElBQUEsR0FBTyxNQUFNQSxFQUFDLENBQUE7QUFDcEIsSUFBQSxJQUFJLENBQUMsS0FBSyxJQUFBLEVBQUssSUFBSyxLQUFLLElBQUEsRUFBSyxDQUFFLFVBQUEsQ0FBVyxJQUFJLENBQUEsRUFBRztBQUNoRCxNQUFBO0FBQUEsSUFDRjtBQUNBLElBQUEs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SUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUs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
