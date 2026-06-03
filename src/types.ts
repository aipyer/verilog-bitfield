/**
 * 单个字段
 */
export interface BitField {
  /** 字段名 */
  name: string;
  /** 位宽 */
  width: number;
  /** 相对于父字段的 MSB */
  msb: number;
  /** 相对于父字段的 LSB */
  lsb: number;
  /** 中文描述 */
  description?: string;
  /** 是否为 reserved */
  isReserved: boolean;
  /** 是否为 @引用 */
  isReference: boolean;
  /** 引用的块名（去掉 @ 前缀） */
  refName?: string;
  /** 子字段（嵌套时） */
  children?: BitField[];
}

/**
 * 独立定义块
 */
export interface FieldBlock {
  /** 块名（全局唯一） */
  name: string;
  /** 总位宽 */
  width: number;
  /** 描述 */
  description?: string;
  /** 子字段 */
  children: BitField[];
}

/**
 * 解析错误
 */
export interface ParseError {
  /** 行号 */
  line: number;
  /** 错误消息 */
  message: string;
  /** 建议 */
  suggestion?: string;
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 解析成功 */
  success: boolean;
  /** 解析出的块 */
  blocks?: Map<string, FieldBlock>;
  /** 错误列表 */
  errors?: ParseError[];
}

/**
 * 注册表条目
 */
export interface RegistryEntry {
  /** 渲染的容器 DOM */
  element: HTMLElement;
  /** 块数据 */
  block: FieldBlock;
  /** 所在笔记路径（跨笔记预留） */
  notePath: string;
}
