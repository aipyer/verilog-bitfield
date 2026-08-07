import type { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import type BitfieldPlugin from './main';
import type { TableTheme } from './main';
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

export class BitfieldSettingTab extends PluginSettingTab {
  plugin: BitfieldPlugin;

  constructor(app: App, plugin: BitfieldPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setHeading();

    // SVG 主题
    new Setting(containerEl)
      .setName('SVG theme')
      .setDesc('Color scheme for bitfield diagrams')
      .addDropdown(drop => {
        for (const [key, label] of Object.entries(SVG_THEME_LABELS)) {
          drop.addOption(key, label);
        }
        drop.setValue(this.plugin.pluginData.svgTheme || 'pastel');
        drop.onChange(async (value) => {
          console.log('[bitfield settings] dropdown changed svgTheme:', value);
          this.plugin.pluginData.svgTheme = value as SvgTheme;
          await this.plugin.saveData(this.plugin.pluginData);
          window.dispatchEvent(new CustomEvent('bf-settings-changed'));
        });
      });

    // SVG 行高
    new Setting(containerEl)
      .setName('SVG row height')
      .setDesc('Height of each field row in bitfield diagrams (px)')
      .addSlider(slider => {
        slider.setLimits(28, 80, 2);
        slider.setValue(this.plugin.pluginData.svgBoxHeight || 38);
        slider.onChange(async (value) => {
          console.log('[bitfield settings] slider changed svgBoxHeight:', value);
          this.plugin.pluginData.svgBoxHeight = value;
          await this.plugin.saveData(this.plugin.pluginData);
          window.dispatchEvent(new CustomEvent('bf-settings-changed'));
        });
      });

    // SVG 字体大小
    new Setting(containerEl)
      .setName('SVG font size')
      .setDesc('Font size for field labels in bitfield diagrams (px)')
      .addSlider(slider => {
        slider.setLimits(14, 36, 1);
        slider.setValue(this.plugin.pluginData.svgFontSize || 22);
        slider.onChange(async (value) => {
          console.log('[bitfield settings] slider changed svgFontSize:', value);
          this.plugin.pluginData.svgFontSize = value;
          await this.plugin.saveData(this.plugin.pluginData);
          window.dispatchEvent(new CustomEvent('bf-settings-changed'));
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
        drop.setValue(this.plugin.pluginData.tableTheme || 'default');
        drop.onChange(async (value) => {
          console.log('[bitfield settings] dropdown changed tableTheme:', value);
          this.plugin.pluginData.tableTheme = value as TableTheme;
          await this.plugin.saveData(this.plugin.pluginData);
          console.log('[bitfield settings] saveData completed');
          // 触发全局事件，让插件重绘所有块
          window.dispatchEvent(new CustomEvent('bf-settings-changed'));
        });
      });

    // 表格行高
    new Setting(containerEl)
      .setName('Table row height')
      .setDesc('Row height for rendered tables (px)')
      .addSlider(slider => {
        slider.setLimits(18, 48, 2);
        slider.setValue(this.plugin.pluginData.tableRowHeight || 28);
        slider.onChange(async (value) => {
          console.log('[bitfield settings] slider changed tableRowHeight:', value);
          this.plugin.pluginData.tableRowHeight = value;
          await this.plugin.saveData(this.plugin.pluginData);
          window.dispatchEvent(new CustomEvent('bf-settings-changed'));
        });
      });

    // 表格字体大小
    new Setting(containerEl)
      .setName('Table font size')
      .setDesc('Font size for rendered tables (px)')
      .addSlider(slider => {
        slider.setLimits(10, 24, 1);
        slider.setValue(this.plugin.pluginData.tableFontSize || 14);
        slider.onChange(async (value) => {
          console.log('[bitfield settings] slider changed tableFontSize:', value);
          this.plugin.pluginData.tableFontSize = value;
          await this.plugin.saveData(this.plugin.pluginData);
          window.dispatchEvent(new CustomEvent('bf-settings-changed'));
        });
      });
  }
}
