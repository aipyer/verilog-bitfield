import { BitField, FieldBlock, ParseError, ParseResult } from './types';

interface RawLine {
  lineNum: number;
  indent: number;
  content: string;
}

/**
 * 解析 Verilog 位域定义
 * 统一语法：每个代码块由一个或多个 definition block 组成
 * 每个块：第一行 name width [description]，子字段通过缩进嵌套
 */
export function parse(input: string): ParseResult {
  const lines = input.split('\n');
  const errors: ParseError[] = [];
  const blocks = new Map<string, FieldBlock>();
  const blockNames = new Set<string>();

  // 预处理：过滤空行和注释
  const rawLines: RawLine[] = [];
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

    const block: FieldBlock = {
      name,
      width: parseInt(widthStr, 10),
      description: desc?.trim() || undefined,
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
      parseChildren(childrenLines, block.children, errors, 0, name);
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
function parseChildren(
  lines: RawLine[],
  children: BitField[],
  errors: ParseError[],
  baseIndent: number,
  parentName: string
): void {
  const stack: { field: BitField; indent: number }[] = [];

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

    const field: BitField = {
      name: refName,
      width,
      msb: 0,
      lsb: 0,
      description: desc?.trim() || undefined,
      isReserved: name.toLowerCase() === 'reserved',
      isReference,
      refName: isReference ? refName : undefined,
      children: []
    };

    // 找父字段：从栈中找缩进比当前小的最后一个
    let parent: BitField | null = null;
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

/**
 * 计算 bit 范围
 * 靠前定义的是 LSB，靠后定义的是 MSB
 */
function calculateBitRanges(fields: BitField[], parentWidth: number): void {
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
function autoFillReserved(fields: BitField[], parentWidth: number): void {
  const totalChildWidth = fields.reduce((sum, f) => sum + f.width, 0);
  const remaining = parentWidth - totalChildWidth;
  if (remaining > 0) {
    const reserved: BitField = {
      name: 'reserved',
      width: remaining,
      msb: 0,
      lsb: 0,
      isReserved: true,
      isReference: false,
      children: []
    };
    fields.push(reserved);
    calculateBitRanges(fields, parentWidth);
  }
}

/**
 * 验证位宽
 */
function validateBitWidths(fields: BitField[], errors: ParseError[]): void {
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
