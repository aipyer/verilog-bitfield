import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import type VerilogBitfieldPlugin from './main';
import type { TableTheme, PluginData as PluginDataTypes } from './main';
import type { SvgTheme } from './colors';

const TABLE_THEME_LABELS: Record<TableTheme, string> = {
  default: 'Default — grid lines, gray header',
  minimal: 'Minimal — horizontal lines only',
  zebra: 'Zebra — alternating row colors',
  clean: 'Clean — no borders, whitespace separation',
  'dark-header': 'Dark Header — dark header, clean body',
};

const SVG_THEME_LABELS: Record<SvgTheme, string> = {
  pastel: 'Pastel — soft pastel colors',
  vivid: 'Vivid — bold saturated colors',
  mono: 'Mono — grayscale',
};

export class VerilogBitfieldSettingTab extends PluginSettingTab {
  plugin: VerilogBitfieldPlugin;

  constructor(app: App, plugin: VerilogBitfieldPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  get data(): PluginDataTypes { return this.plugin.savedData; }
  set data(v: PluginDataTypes) { this.plugin.savedData = v; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Bitfield').setHeading();

    // SVG 主题
    new Setting(containerEl)
      .setName('SVG theme')
      .setDesc('Color scheme for bitfield diagrams')
      .addDropdown(drop => {
        for (const [key, label] of Object.entries(SVG_THEME_LABELS)) {
          drop.addOption(key, label);
        }
        drop.setValue(this.data.svgTheme || 'pastel');
        drop.onChange(async (value) => {
          this.data.svgTheme = value as SvgTheme;
          await this.plugin.saveData(this.data);
          this.plugin.rerenderAllSvg();
        });
      });

    // SVG 行高
    new Setting(containerEl)
      .setName('SVG row height')
      .setDesc('Height of each field row in bitfield diagrams (px)')
      .addSlider(slider => {
        slider.setLimits(28, 80, 2);
        slider.setValue(this.data.svgBoxHeight || 38);
        slider.onChange(async (value) => {
          this.data.svgBoxHeight = value;
          await this.plugin.saveData(this.data);
          this.plugin.rerenderAllSvg();
        });
      });

    // 表格主题
    new Setting(containerEl)
      .setName('Table theme')
      .setDesc('Visual style for rendered tables')
      .addDropdown(drop => {
        for (const [key, label] of Object.entries(TABLE_THEME_LABELS)) {
          drop.addOption(key, label);
        }
        drop.setValue(this.data.tableTheme || 'default');
        drop.onChange(async (value) => {
          this.data.tableTheme = value as TableTheme;
          await this.plugin.saveData(this.data);
          this.applyTableTheme(value as TableTheme);
        });
      });

    // 表格行高
    new Setting(containerEl)
      .setName('Table row height')
      .setDesc('Row height for rendered tables (px)')
      .addSlider(slider => {
        slider.setLimits(18, 48, 2);
        slider.setValue(this.data.tableRowHeight || 28);
        slider.onChange(async (value) => {
          this.data.tableRowHeight = value;
          await this.plugin.saveData(this.data);
          this.applyTableRowHeight(value);
        });
      });
  }

  private applyTableTheme(theme: TableTheme): void {
    document.querySelectorAll('.verilog-bitfield-table-container').forEach(el => {
      el.setAttribute('data-theme', theme);
    });
  }

  private applyTableRowHeight(height: number): void {
    document.documentElement.style.setProperty('--bf-table-row-height', `${height}px`);
  }
}
