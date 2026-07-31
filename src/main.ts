import type { MarkdownPostProcessorContext } from 'obsidian';
import { createFragment, Plugin } from 'obsidian';
import { parse } from './parser';
import { renderBlockSvg } from './svgRenderer';
import { renderBlockTable } from './tableRenderer';
import type { RegistryEntry, FieldBlock } from './types';
import { BitfieldSettingTab } from './settings';
import type { SvgTheme } from './colors';

export type TableTheme = 'default' | 'minimal' | 'zebra' | 'clean' | 'dark-header';

export interface PluginData {
  defaultView?: 'svg' | 'table';
  tableTheme?: TableTheme;
  svgTheme?: SvgTheme;
  svgBoxHeight?: number;
  tableRowHeight?: number;
}

export const DEFAULT_DATA: PluginData = { defaultView: 'svg', tableTheme: 'default', svgTheme: 'pastel', svgBoxHeight: 38, tableRowHeight: 28 };

export default class BitfieldPlugin extends Plugin {
  private blockRegistry: Map<string, RegistryEntry> = new Map();
  private pendingRefs: { element: HTMLElement; targetName: string }[] = [];
  private currentNotePath: string = '';
  private activeTooltip: HTMLElement | null = null;
  private tooltipRemoveTimer: ReturnType<typeof setTimeout> | null = null;
  private pluginData: PluginData = DEFAULT_DATA;

  // public accessor for SettingTab
  get savedData(): PluginData { return this.pluginData; }
  set savedData(v: PluginData) { this.pluginData = v; }

  async onload() {
    this.pluginData = Object.assign({}, DEFAULT_DATA, (await this.loadData()) as PluginData);
    this.addSettingTab(new BitfieldSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor('bitfield', this.processBitfield.bind(this));
    // 应用保存的表格行高
    document.documentElement.style.setProperty('--bf-table-row-height', `${this.pluginData.tableRowHeight || 28}px`);
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
      cls: 'bitfield-container',
      attr: { id: `bf:${name}` }
    });

    const headerRow = container.createEl('div', { cls: 'bitfield-header-row' });
    const desc = block.description ? ` — ${block.description}` : '';
    headerRow.createEl('span', {
      text: `${name}${desc} 的 ${block.width} bit 定义如下：`,
      cls: 'bitfield-header'
    });
    const toggleBtn = this.createToggleButton(headerRow);

    const contentWrap = container.createEl('div', { cls: 'bitfield-content' });
    const svgContainer = contentWrap.createEl('div', { cls: 'bitfield-svg' });
    createFragment((fragment) => {
      fragment.setHTML(renderBlockSvg(block, this.pluginData.svgTheme || 'pastel', this.pluginData.svgBoxHeight || 44));
    }).appendTo(svgContainer);
    this.setupNavigationHandlers(svgContainer);
    this.setupTooltipHandlers(svgContainer);

    const tableContainer = contentWrap.createEl('div', { cls: 'bitfield-table-container' });
    tableContainer.setAttribute('data-theme', this.pluginData.tableTheme || 'default');
    createFragment((fragment) => {
      fragment.setHTML(renderBlockTable(block));
    }).appendTo(tableContainer);
    this.setupTableNavigationHandlers(tableContainer);
    this.setupTableTooltipHandlers(tableContainer);

    // 初始化视图：读取保存的偏好
    const defaultView = this.pluginData.defaultView || 'svg';
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
    btn.querySelectorAll('.bf-toggle-option').forEach(opt => {
      opt.classList.toggle('bf-toggle-active', opt.getAttribute('data-view') === view);
    });
  }

  private createToggleButton(parent: HTMLElement): HTMLElement {
    const btn = parent.createEl('div', { cls: 'bf-view-toggle' });
    btn.createEl('span', { text: '位域图', cls: 'bf-toggle-option bf-toggle-svg', attr: { 'data-view': 'svg' } });
    btn.createEl('span', { text: '表格', cls: 'bf-toggle-option bf-toggle-table', attr: { 'data-view': 'table' } });
    return btn;
  }

  /** Rerender all SVGs with current theme — public for SettingTab */
  public rerenderAllSvg(): void {
    const theme = this.pluginData.svgTheme || 'pastel';
    for (const [, entry] of this.blockRegistry) {
      const svgContainer = entry.element.querySelector('.bitfield-svg') as HTMLElement | null;
      if (svgContainer) {
        createFragment((fragment) => {
          fragment.setHTML(renderBlockSvg(entry.block, theme, this.pluginData.svgBoxHeight || 44));
        }).appendTo(svgContainer);
        this.setupNavigationHandlers(svgContainer);
        this.setupTooltipHandlers(svgContainer);
      }
    }
  }

  private renderErrors(el: HTMLElement, errors: { line: number; message: string; suggestion?: string }[]) {
    el.createEl('div', { cls: 'bitfield-error' }, (errorEl) => {
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
      if (target.classList.contains('bf-ref-link')) {
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
    entry.element.classList.add('bf-highlight');
    window.setTimeout(() => entry.element.classList.remove('bf-highlight'), 1500);
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
      if (target.classList.contains('bf-ref-link')) {
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
      if (target.classList.contains('bf-ref-link')) this.scheduleTooltipRemove();
    });
  }

  /** 获取被引用块自身的视图状态，不存在则用默认偏好 */
  private getViewForBlock(blockName: string): 'svg' | 'table' {
    const entry = this.blockRegistry.get(blockName);
    if (entry) {
      const contentWrap = entry.element.querySelector('.bitfield-content');
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

    const tooltip = document.body.createEl('div', { cls: 'bf-tooltip' });

    const desc = entry.block.description ? ` — ${entry.block.description}` : '';
    tooltip.createEl('p', { text: `${blockName}${desc}`, cls: 'bf-tooltip-header' });

    if (view === 'svg') {
      const svgWrap = tooltip.createEl('div', { cls: 'bf-tooltip-svg' });
      createFragment((fragment) => {
        fragment.setHTML(renderBlockSvg(entry.block, this.pluginData.svgTheme || 'pastel', this.pluginData.svgBoxHeight || 44));
      }).appendTo(svgWrap);
    } else {
      const tableWrap = tooltip.createEl('div', { cls: 'bf-tooltip-table' });
      createFragment((fragment) => {
        fragment.setHTML(renderBlockTable(entry.block));
      }).appendTo(tableWrap);
    }

    tooltip.createEl('p', { text: '单击跳转查看完整定义', cls: 'bf-tooltip-hint' });

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
    // 鼠标进入 tooltip 时取消待删除定时器
    tooltip.addEventListener('mouseenter', () => {
      if (this.tooltipRemoveTimer) {
        window.clearTimeout(this.tooltipRemoveTimer);
        this.tooltipRemoveTimer = null;
      }
    });
    tooltip.addEventListener('mouseleave', () => this.removeTooltip());
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
    container.querySelectorAll('.bf-ref-link').forEach((el) => {
      const targetName = el.getAttribute('data-target') ?? '';
      if (!targetName) return;
      if (!this.blockRegistry.has(targetName)) {
        this.pendingRefs.push({ element: el as HTMLElement, targetName });
        (el as HTMLElement).classList.add('bf-ref-unresolved');
      }
    });
  }

  private resolvePendingRefs() {
    const stillPending: typeof this.pendingRefs = [];
    for (const pending of this.pendingRefs) {
      if (this.blockRegistry.has(pending.targetName)) {
        pending.element.classList.remove('bf-ref-unresolved');
      } else {
        stillPending.push(pending);
      }
    }
    this.pendingRefs = stillPending;
  }
}
