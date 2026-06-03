import { Plugin, MarkdownPostProcessorContext } from 'obsidian';
import { parse } from './parser';
import { renderBlockSvg } from './svgRenderer';
import { renderBlockTable } from './tableRenderer';
import { RegistryEntry, FieldBlock } from './types';

export default class VerilogBitfieldPlugin extends Plugin {
  private blockRegistry: Map<string, RegistryEntry> = new Map();
  private pendingRefs: { element: HTMLElement; targetName: string }[] = [];
  private currentNotePath: string = '';
  private activeTooltip: HTMLElement | null = null;

  private getDefaultView(): 'svg' | 'table' {
    return (localStorage.getItem('bf-default-view') as 'svg' | 'table') || 'svg';
  }

  private currentView: 'svg' | 'table' = this.getDefaultView();

  async onload() {
    this.registerMarkdownCodeBlockProcessor('verilog-bitfield', this.processBitfield.bind(this));
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

    // 每个块独立渲染
    for (const [name, block] of result.blocks!) {
      this.renderBlock(name, block, el);
    }

    setTimeout(() => this.resolvePendingRefs(), 50);
  }

  /**
   * 渲染单个块：标题 + 切换按钮 + SVG/表格
   */
  private renderBlock(name: string, block: FieldBlock, parentEl: HTMLElement) {
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

  private createToggleButton(parent: HTMLElement): HTMLElement {
    const btn = parent.createEl('div', { cls: 'bf-view-toggle' });
    btn.createEl('span', { text: '位域图', cls: 'bf-toggle-option bf-toggle-svg bf-toggle-active', attr: { 'data-view': 'svg' } });
    btn.createEl('span', { text: '表格', cls: 'bf-toggle-option bf-toggle-table', attr: { 'data-view': 'table' } });
    return btn;
  }

  private bindToggle(btn: HTMLElement, svgEl: HTMLElement, tableEl: HTMLElement) {
    const applyView = (view: 'svg' | 'table') => {
      this.currentView = view;
      // inline style 覆盖 CSS 默认值，PDF 导出时会被保留
      svgEl.style.display = view === 'svg' ? 'block' : 'none';
      tableEl.style.display = view === 'table' ? 'block' : 'none';
      btn.querySelectorAll('.bf-toggle-option').forEach(opt => {
        opt.classList.toggle('bf-toggle-active', opt.getAttribute('data-view') === view);
      });
    };

    applyView(this.getDefaultView());

    btn.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const view = target.getAttribute('data-view') as 'svg' | 'table' | null;
      if (view) {
        applyView(view);
        localStorage.setItem('bf-default-view', view);
      }
    };
  }

  private renderErrors(el: HTMLElement, errors: { line: number; message: string; suggestion?: string }[]) {
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

  private setupNavigationHandlers(container: HTMLElement) {
    container.onclick = (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const refName = target.getAttribute('data-ref')
        || target.parentElement?.getAttribute('data-ref');
      if (refName) {
        this.scrollToBlock(refName);
      }
    };
  }

  private setupTableNavigationHandlers(container: HTMLElement) {
    container.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('bf-ref-link')) {
        e.preventDefault();
        const refName = target.getAttribute('data-target');
        if (refName) {
          this.scrollToBlock(refName);
        }
      }
    };
  }

  private scrollToBlock(blockName: string) {
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

  private setupTooltipHandlers(container: HTMLElement) {
    container.addEventListener('mouseover', (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const refName = target.getAttribute('data-ref')
        || target.parentElement?.getAttribute('data-ref');
      if (refName) {
        this.showTooltip(refName, e.clientX, e.clientY);
      }
    });

    container.addEventListener('mouseout', (e: MouseEvent) => {
      const target = e.target as SVGElement;
      const refName = target.getAttribute('data-ref')
        || target.parentElement?.getAttribute('data-ref');
      if (refName) {
        setTimeout(() => {
          if (this.activeTooltip && !this.activeTooltip.matches(':hover')) {
            this.removeTooltip();
          }
        }, 200);
      }
    });
  }

  private setupTableTooltipHandlers(container: HTMLElement) {
    container.addEventListener('mouseover', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('bf-ref-link')) {
        const refName = target.getAttribute('data-target');
        if (refName) {
          this.showTooltip(refName, e.clientX, e.clientY);
        }
      }
    });

    container.addEventListener('mouseout', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('bf-ref-link')) {
        setTimeout(() => {
          if (this.activeTooltip && !this.activeTooltip.matches(':hover')) {
            this.removeTooltip();
          }
        }, 200);
      }
    });
  }

  private showTooltip(blockName: string, mouseX: number, mouseY: number) {
    const entry = this.blockRegistry.get(blockName);
    if (!entry) return;

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
    } else {
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
    if (top < 8) top = 8;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    tooltip.addEventListener('mouseleave', () => {
      this.removeTooltip();
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
      const refName = el.getAttribute('data-ref')!;
      if (!this.blockRegistry.has(refName)) {
        this.pendingRefs.push({ element: el as HTMLElement, targetName: refName });
      }
    });

    container.querySelectorAll('.bf-ref-link').forEach((el) => {
      const targetName = el.getAttribute('data-target')!;
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
