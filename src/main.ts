import type { MarkdownPostProcessorContext } from 'obsidian';
import { Plugin, sanitizeHTMLToDom } from 'obsidian';
import { parse } from './parser';
import { renderBlockSvg } from './svgRenderer';
import { renderBlockTable } from './tableRenderer';
import type { RegistryEntry, FieldBlock } from './types';
import { BitfieldSettingTab } from './settings';
import type { SvgTheme } from './colors';

const OLD_PLUGIN_ID = 'verilog-bitfield';

const CSS = {
  container: 'bf-container',
  headerRow: 'bf-header-row',
  header: 'bf-header',
  content: 'bf-content',
  svg: 'bf-svg',
  tableContainer: 'bf-table-container',
  table: 'bf-table',
  error: 'bf-error',
  toggleBtn: 'bf-view-toggle',
  toggleOption: 'bf-toggle-option',
  toggleActive: 'bf-toggle-active',
  tooltip: 'bf-tooltip',
  tooltipHeader: 'bf-tooltip-header',
  tooltipSvg: 'bf-tooltip-svg',
  tooltipTable: 'bf-tooltip-table',
  tooltipHint: 'bf-tooltip-hint',
  refLink: 'bf-ref-link',
  refUnresolved: 'bf-ref-unresolved',
  highlight: 'bf-highlight',
  rowRef: 'bf-row-ref',
  rowReserved: 'bf-row-reserved',
};

export type TableTheme = 'default' | 'minimal' | 'zebra' | 'clean' | 'dark-header';

export interface PluginData {
  defaultView?: 'svg' | 'table';
  tableTheme?: TableTheme;
  svgTheme?: SvgTheme;
  svgBoxHeight?: number;
  svgFontSize?: number;
  tableFontSize?: number;
  tableRowHeight?: number;
}

export const DEFAULT_DATA: PluginData = { defaultView: 'svg', tableTheme: 'default', svgTheme: 'pastel', svgBoxHeight: 38, svgFontSize: 22, tableFontSize: 14, tableRowHeight: 28 };

export default class BitfieldPlugin extends Plugin {
  private blockRegistry: Map<string, RegistryEntry> = new Map();
  private pendingRefs: { element: HTMLElement; targetName: string }[] = [];
  private currentNotePath: string = '';
  private activeTooltip: HTMLElement | null = null;
  private tooltipRemoveTimer: ReturnType<typeof setTimeout> | null = null;
  private pluginData: PluginData = DEFAULT_DATA;
  private stylesInjected = false; // suppress unused-var lint

  // public accessor for SettingTab
  get savedData(): PluginData { return this.pluginData; }
  set savedData(v: PluginData) { this.pluginData = v; }

  /** Expose as `settings` so Obsidian's PluginSettingTab.getControlValue() doesn't crash */
  get settings(): PluginData { return this.pluginData; }
  set settings(v: PluginData) { this.pluginData = v; }

  async onload() {
    // 迁移旧插件的数据
    const migrated = await this.migrateData();
    this.pluginData = Object.assign({}, DEFAULT_DATA, (await this.loadData()) as PluginData);
    this.addSettingTab(new BitfieldSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('bitfield', this.processBitfield.bind(this));
    // 应用保存的表格行高、字体和主题
    document.documentElement.style.setProperty('--bf-table-row-height', `${this.pluginData.tableRowHeight || 28}px`);
    document.documentElement.style.setProperty('--bf-table-font-size', `${this.pluginData.tableFontSize || 14}px`);
    // Apply saved theme to existing blocks (if any re-rendered)
    this.applyTableTheme(this.pluginData.tableTheme || 'default');
  }

  /** Apply table theme to all rendered blocks */
  private applyTableTheme(theme: TableTheme): void {
    document.querySelectorAll('.bf-table-container').forEach(el => {
      el.setAttribute('data-theme', theme);
    });
  }

  /** 从旧插件名迁移数据到新插件 */
  private async migrateData(): Promise<boolean> {
    const pluginData = await this.loadData() as PluginData | null;
    if (pluginData && Object.keys(pluginData).length > 0) {
      return false;
    }
    const configDir = this.app.vault.configDir;
    const oldDataFile = `${configDir}/plugins/${OLD_PLUGIN_ID}/data.json`;
    try {
      const oldRaw = await this.app.vault.adapter.read(oldDataFile);
      if (oldRaw) {
        const oldData = JSON.parse(oldRaw) as PluginData;
        if (oldData && Object.keys(oldData).length > 0) {
          await this.saveData(oldData);
          console.log('[bitfield] Migrated settings from old plugin');
          return true;
        }
      }
    } catch {
      // 旧插件目录不存在或读取失败，忽略
    }
    return false;
  }

  onunload() {
    this.blockRegistry.clear();
    this.pendingRefs = [];
    this.removeTooltip();
  }

  async processBitfield(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    this.currentNotePath = ctx.sourcePath || '';
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

  private renderBlock(name: string, block: FieldBlock, parentEl: HTMLElement) {
    const container = parentEl.createEl('div', {
      cls: CSS.container,
      attr: { id: `bf:${name}` }
    });

    const headerRow = container.createEl('div', { cls: CSS.headerRow });
    headerRow.setCssStyles({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '8px'
    });
    const desc = block.description ? ` — ${block.description}` : '';
    headerRow.createEl('span', {
      text: `${name}${desc} 的 ${block.width} bit 定义如下：`,
      cls: CSS.header
    });
    const toggleBtn = this.createToggleButton(headerRow);

    const contentWrap = container.createEl('div', { cls: CSS.content });
    const svgContainer = contentWrap.createEl('div', { cls: CSS.svg });
    const svgHtml = renderBlockSvg(block, this.pluginData.svgTheme || 'pastel', this.pluginData.svgBoxHeight || 38, this.pluginData.svgFontSize || 22);
    const svgDocFrag = sanitizeHTMLToDom(svgHtml);
    svgContainer.appendChild(svgDocFrag);
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);

    const tableContainer = contentWrap.createEl('div', { cls: CSS.tableContainer });
    tableContainer.setAttribute('data-theme', this.pluginData.tableTheme || 'default');
    const tableHtml = renderBlockTable(block);
    const tableDocFrag = sanitizeHTMLToDom(tableHtml);
    tableContainer.appendChild(tableDocFrag);
    this.setupTableNavigationHandlers(tableContainer);
    this.setupTableTooltipHandlers(tableContainer);

    // 初始化视图：读取保存的偏好
    const defaultView = this.pluginData.defaultView || 'svg';
    svgContainer.style.display = 'none';
    tableContainer.style.display = 'none';
    this.applyView(defaultView, contentWrap, svgContainer, tableContainer, toggleBtn);

    // 绑定切换事件
    toggleBtn.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const view = target.getAttribute('data-view') as 'svg' | 'table' | null;
      if (view) {
        this.applyView(view, contentWrap, svgContainer, tableContainer, toggleBtn);
        this.pluginData.defaultView = view;
        this.saveData(this.pluginData);
      }
    };

    // 监听设置变更事件 — 由 Settings Tab dispatch 触发
    const settingsHandler = () => {
      this.applyTableTheme(this.pluginData.tableTheme || 'default');
      document.documentElement.style.setProperty('--bf-table-row-height', `${this.pluginData.tableRowHeight || 28}px`);
      document.documentElement.style.setProperty('--bf-table-font-size', `${this.pluginData.tableFontSize || 14}px`);
      this.rerenderAll();
    };
    window.addEventListener('bf-settings-changed', settingsHandler);

    this.blockRegistry.set(name, {
      element: container,
      block,
      notePath: this.currentNotePath
    });

    this.collectPendingRefs(svgContainer);
    this.collectPendingRefs(tableContainer);
  }

  private applyView(view: 'svg' | 'table', contentWrap: HTMLElement, svgEl: HTMLElement, tableEl: HTMLElement, btn: HTMLElement) {
    contentWrap.setAttribute('data-view', view);
    if (view === 'svg') {
      svgEl.setCssStyles({ display: 'block' });
      tableEl.setCssStyles({ display: 'none' });
    } else {
      svgEl.setCssStyles({ display: 'none' });
      tableEl.setCssStyles({ display: 'block' });
    }
    btn.querySelectorAll(`.${CSS.toggleOption}`).forEach(opt => {
      opt.classList.toggle(CSS.toggleActive, opt.getAttribute('data-view') === view);
    });
  }

  private createToggleButton(parent: HTMLElement): HTMLElement {
    const btn = parent.createEl('div', { cls: CSS.toggleBtn });
    btn.createEl('span', { text: '位域图', cls: `${CSS.toggleOption} bf-toggle-svg`, attr: { 'data-view': 'svg' } });
    btn.createEl('span', { text: '表格', cls: `${CSS.toggleOption} bf-toggle-table`, attr: { 'data-view': 'table' } });
    return btn;
  }

  /** Rerender all SVGs with current theme — public for SettingTab */
  public rerenderAllSvg(): void {
    const theme = this.pluginData.svgTheme || 'pastel';
    const boxHeight = this.pluginData.svgBoxHeight || 38;
    const fontSize = this.pluginData.svgFontSize || 22;
    for (const [, entry] of this.blockRegistry) {
      const svgContainer = entry.element.querySelector(`.${CSS.svg}`) as HTMLElement | null;
      if (svgContainer) {
        svgContainer.empty(); // 先清空旧 SVG
        const svgHtml = renderBlockSvg(entry.block, theme, boxHeight, fontSize);
        const svgDocFrag = sanitizeHTMLToDom(svgHtml);
        svgContainer.appendChild(svgDocFrag);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
    }
  }

  /** Re-render all blocks with updated settings — public for SettingTab */
  public rerenderAll(): void {
    console.log('[bitfield] rerenderAll called, entries:', this.blockRegistry.size);
    // 重建 DOM 会丢失事件监听器，先关闭 tooltip
    const wasTooltipVisible = this.activeTooltip !== null;
    this.removeTooltip();
    for (const [name, entry] of this.blockRegistry) {
      console.log('[bitfield] rerenderAll entry:', name);
      const container = entry.element;
      const svgContainer = container.querySelector(`.${CSS.svg}`) as HTMLElement | null;
      if (svgContainer) {
        const svgHtml = renderBlockSvg(entry.block, this.pluginData.svgTheme || 'pastel', this.pluginData.svgBoxHeight || 38, this.pluginData.svgFontSize || 22);
        const svgDocFrag = sanitizeHTMLToDom(svgHtml);
        svgContainer.empty();
        svgContainer.appendChild(svgDocFrag);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
      const tableContainer = container.querySelector(`.${CSS.tableContainer}`) as HTMLElement | null;
      if (tableContainer) {
        tableContainer.setAttribute('data-theme', this.pluginData.tableTheme || 'default');
        const tableHtml = renderBlockTable(entry.block);
        const tableDocFrag = sanitizeHTMLToDom(tableHtml);
        tableContainer.empty();
        tableContainer.appendChild(tableDocFrag);
        this.setupTableNavigationHandlers(tableContainer);
        this.setupTableTooltipHandlers(tableContainer);
      }
    }
    window.setTimeout(() => this.resolvePendingRefs(), 50);
  }

  private renderErrors(el: HTMLElement, errors: { line: number; message: string; suggestion?: string }[]) {
    el.createEl('div', { cls: CSS.error }, (errorEl) => {
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

  private setupNavigationHandlers(container: HTMLElement) {
    container.onclick = (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const refName = target.getAttribute('data-ref')
        || target.parentElement?.getAttribute('data-ref');
      if (refName) this.scrollToBlock(refName);
    };
  }

  private setupTableNavigationHandlers(container: HTMLElement) {
    container.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains(CSS.refLink)) {
        e.preventDefault();
        const refName = target.getAttribute('data-target');
        if (refName) this.scrollToBlock(refName);
      }
    };
  }

  private scrollToBlock(blockName: string) {
    const entry = this.blockRegistry.get(blockName);
    if (!entry) return;
    entry.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    entry.element.classList.add(CSS.highlight);
    window.setTimeout(() => entry.element.classList.remove(CSS.highlight), 1500);
  }

  // ─── 悬浮 tooltip ───

  private setupTooltipHandlers(container: HTMLElement) {
    container.addEventListener('mouseover', (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const refName = target.getAttribute('data-ref')
        || target.parentElement?.getAttribute('data-ref');
      if (refName) {
        // 鼠标回到源元素上，取消待删除定时器
        if (this.tooltipRemoveTimer) {
          window.clearTimeout(this.tooltipRemoveTimer);
          this.tooltipRemoveTimer = null;
        }
        const view = this.getViewForBlock(refName);
        this.showTooltip(refName, e.clientX, e.clientY, view);
      }
    });
    container.addEventListener('mouseout', (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const refName = target.getAttribute('data-ref')
        || target.parentElement?.getAttribute('data-ref');
      if (refName) this.scheduleTooltipRemove();
    });
  }

  private setupTableTooltipHandlers(container: HTMLElement) {
    container.addEventListener('mouseover', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains(CSS.refLink)) {
        if (this.tooltipRemoveTimer) {
          window.clearTimeout(this.tooltipRemoveTimer);
          this.tooltipRemoveTimer = null;
        }
        const refName = target.getAttribute('data-target');
        if (refName) {
          const view = this.getViewForBlock(refName);
          this.showTooltip(refName, e.clientX, e.clientY, view);
        }
      }
    });
    container.addEventListener('mouseout', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains(CSS.refLink)) this.scheduleTooltipRemove();
    });
  }

  /** 获取被引用块自身的视图状态，不存在则用默认偏好 */
  private getViewForBlock(blockName: string): 'svg' | 'table' {
    const entry = this.blockRegistry.get(blockName);
    if (entry) {
      const contentWrap = entry.element.querySelector(`.${CSS.content}`);
      const view = contentWrap?.getAttribute('data-view') as 'svg' | 'table' | undefined;
      if (view) return view;
    }
    return this.pluginData.defaultView || 'svg';
  }

  private scheduleTooltipRemove() {
    this.tooltipRemoveTimer = window.setTimeout(() => {
      this.removeTooltip();
    }, 200);
  }

  private showTooltip(blockName: string, mouseX: number, mouseY: number, view: 'svg' | 'table') {
    const entry = this.blockRegistry.get(blockName);
    if (!entry) return;

    this.removeTooltip();

    const tooltip = document.body.createEl('div', { cls: CSS.tooltip });
    tooltip.setCssStyles({ fontSize: `${this.pluginData.tableFontSize || 14}px` });

    const desc = entry.block.description ? ` — ${entry.block.description}` : '';
    tooltip.createEl('p', { text: `${blockName}${desc}`, cls: CSS.tooltipHeader });

    if (view === 'svg') {
      const svgWrap = tooltip.createEl('div', { cls: CSS.tooltipSvg });
      const svgHtml = renderBlockSvg(entry.block, this.pluginData.svgTheme || 'pastel', this.pluginData.svgBoxHeight || 38, this.pluginData.svgFontSize || 22);
      const svgDocFrag = sanitizeHTMLToDom(svgHtml);
      svgWrap.appendChild(svgDocFrag);
    } else {
      const tableWrap = tooltip.createEl('div', { cls: CSS.tooltipTable });
      const tableHtml = renderBlockTable(entry.block);
      const tableDocFrag = sanitizeHTMLToDom(tableHtml);
      tableWrap.appendChild(tableDocFrag);
    }

    tooltip.createEl('p', { text: '单击跳转查看完整定义', cls: CSS.tooltipHint });

    document.body.appendChild(tooltip);
    this.activeTooltip = tooltip;

    const rect = tooltip.getBoundingClientRect();
    let left = mouseX + 12;
    let top = mouseY - 20;
    if (left + rect.width > window.innerWidth - 16) left = mouseX - rect.width - 12;
    if (top + rect.height > window.innerHeight - 16) top = window.innerHeight - rect.height - 16;
    if (top < 8) top = 8;

    tooltip.setCssStyles({ left: `${left}px`, top: `${top}px` });
    // 鼠标进入 tooltip 时取消待删除定时器
    tooltip.addEventListener('mouseenter', () => {
      if (this.tooltipRemoveTimer) {
        window.clearTimeout(this.tooltipRemoveTimer);
        this.tooltipRemoveTimer = null;
      }
    });
    tooltip.addEventListener('mouseleave', () => {
      // 鼠标离开 tooltip 本身时延迟关闭，避免 tooltip 内元素（表格/SVG）
      // 上的 mouseout 立刻触发关闭 — 用户移到 tooltip 内部的表格里不会关闭
      this.tooltipRemoveTimer = window.setTimeout(() => {
        this.removeTooltip();
      }, 200);
    });
  }

  private removeTooltip() {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  // ─── 引用解析 ───

  private collectPendingRefs(container: HTMLElement) {
    container.querySelectorAll('[data-ref]').forEach((el) => {
      const refName = el.getAttribute('data-ref') ?? '';
      if (!refName) return;
      if (!this.blockRegistry.has(refName)) {
        this.pendingRefs.push({ element: el as HTMLElement, targetName: refName });
      }
    });
    container.querySelectorAll(`.${CSS.refLink}`).forEach((el) => {
      const targetName = el.getAttribute('data-target') ?? '';
      if (!targetName) return;
      if (!this.blockRegistry.has(targetName)) {
        this.pendingRefs.push({ element: el as HTMLElement, targetName });
        (el as HTMLElement).classList.add(CSS.refUnresolved);
      }
    });
  }

  private resolvePendingRefs() {
    const stillPending: typeof this.pendingRefs = [];
    for (const pending of this.pendingRefs) {
      if (this.blockRegistry.has(pending.targetName)) {
        pending.element.classList.remove(CSS.refUnresolved);
      } else {
        stillPending.push(pending);
      }
    }
    this.pendingRefs = stillPending;
  }
}
