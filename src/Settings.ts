import {
  App,
  normalizePath,
  PluginSettingTab,
  SearchComponent,
  SettingGroup,
} from 'obsidian';
import TimestampPlugin from './main';
import { FolderSuggest } from './suggesters/FolderSuggester';
import { UpdateAllModal } from './UpdateAllModal';

export const TIMESTAMP_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm";

export interface TimestampSettings {
  headerUpdated: string;
  headerCreated: string;
  minMinutesBetweenSaves: number;
  excludedFolders: string[];
}

export const DEFAULT_SETTINGS: TimestampSettings = {
  headerUpdated: 'updated',
  headerCreated: 'created',
  minMinutesBetweenSaves: 1,
  excludedFolders: [],
};

export class TimestampSettingsTab extends PluginSettingTab {
  private readonly plugin: TimestampPlugin;

  constructor(app: App, plugin: TimestampPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const propertiesGroup = new SettingGroup(containerEl).setHeading('属性');
    propertiesGroup.addSetting((setting) => {
      setting
        .setName('更新时间属性名')
        .setDesc('在 YAML 属性中用于记录更新时间的属性名称')
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.headerUpdated)
            .setValue(this.plugin.settings.headerUpdated)
            .onChange(async (value) => {
              this.plugin.settings.headerUpdated =
                value.trim() || DEFAULT_SETTINGS.headerUpdated;
              await this.plugin.saveSettings();
            }),
        );
    });
    propertiesGroup.addSetting((setting) => {
      setting
        .setName('创建时间属性名')
        .setDesc('在 YAML 属性中用于记录创建时间的属性名称')
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.headerCreated)
            .setValue(this.plugin.settings.headerCreated)
            .onChange(async (value) => {
              this.plugin.settings.headerCreated =
                value.trim() || DEFAULT_SETTINGS.headerCreated;
              await this.plugin.saveSettings();
            }),
        );
    });

    const updateRulesGroup = new SettingGroup(containerEl).setHeading(
      '更新规则',
    );
    updateRulesGroup.addSetting((setting) => {
      setting
        .setName('最短更新间隔')
        .setDesc('两次更新时间属性之间至少间隔的分钟数')
        .addSlider((slider) =>
          slider
            .setLimits(1, 30, 1)
            .setValue(this.plugin.settings.minMinutesBetweenSaves)
            .onChange(async (value) => {
              this.plugin.settings.minMinutesBetweenSaves = value;
              await this.plugin.saveSettings();
            })
            .setDynamicTooltip(),
        );
    });
    this.addExcludedFoldersSetting(updateRulesGroup);

    const bulkActionsGroup = new SettingGroup(containerEl).setHeading(
      '批量操作',
    );
    bulkActionsGroup.addSetting((setting) => {
      setting
        .setName('更新所有文件')
        .setDesc('立即更新仓库中所有符合条件文件的创建时间和更新时间属性')
        .addButton((button) => {
          button.setButtonText('更新所有文件').onClick(() => {
            new UpdateAllModal(this.app, this.plugin).open();
          });
        });
    });
  }

  private addExcludedFoldersSetting(group: SettingGroup): void {
    let searchInput: SearchComponent | undefined;
    group.addSetting((setting) => {
      setting
        .setName('排除文件夹')
        .setDesc('这些文件夹及其子文件夹中的文件不会写入创建时间或更新时间属性')
        .addSearch((search) => {
          searchInput = search;
          new FolderSuggest(this.app, search.inputEl);
          search.setPlaceholder('示例: folder1/folder2');
          search.inputEl.addClass('timestamp-folder-search');
        })
        .addExtraButton((button) => {
          button
            .setIcon('plus-circle')
            .setTooltip('添加文件夹')
            .onClick(async () => {
              const folder = normalizePath(
                searchInput?.getValue().trim() ?? '',
              );
              if (!folder) {
                return;
              }

              this.plugin.settings.excludedFolders = Array.from(
                new Set([...this.plugin.settings.excludedFolders, folder]),
              );
              await this.plugin.saveSettings();
              this.display();
            });
        });
    });

    this.plugin.settings.excludedFolders.forEach((excludedFolder) => {
      group.addSetting((setting) => {
        setting.setName(excludedFolder).addExtraButton((button) =>
          button
            .setIcon('trash')
            .setTooltip('移除文件夹')
            .onClick(async () => {
              this.plugin.settings.excludedFolders = this.plugin.settings.excludedFolders.filter(
                (folder) => folder !== excludedFolder,
              );
              await this.plugin.saveSettings();
              this.display();
            }),
        );
      });
    });
  }
}
