import { App, PluginSettingTab, Setting, SettingGroup } from 'obsidian';
import TimestampPlugin from './main';
import { ExcludedFolderModal } from './modals/ExcludedFolderModal';
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
  private savedScrollTop = 0;
  private hasRendered = false;

  constructor(app: App, plugin: TimestampPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    if (this.hasRendered) {
      this.savedScrollTop = containerEl.scrollTop;
    }
    this.hasRendered = false;
    containerEl.empty();

    new Setting(containerEl).setName('通用').setHeading();
    const generalGroup = new SettingGroup(containerEl);
    generalGroup.addSetting((setting) => {
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
    generalGroup.addSetting((setting) => {
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
    generalGroup.addSetting((setting) => {
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

    this.addExcludedFoldersSection(containerEl);

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

    containerEl.scrollTop = this.savedScrollTop;
    this.hasRendered = true;
  }

  hide(): void {
    if (this.hasRendered) {
      this.savedScrollTop = this.containerEl.scrollTop;
    }
    this.hasRendered = false;
    super.hide();
  }

  private addExcludedFoldersSection(containerEl: HTMLElement): void {
    const heading = new Setting(containerEl).setName('排除文件夹').setHeading();
    heading.addExtraButton((button) =>
      button
        .setIcon('plus')
        .setTooltip('添加文件夹')
        .onClick(() => {
          this.openExcludedFolderModal();
        }),
    );

    const foldersGroup = new SettingGroup(containerEl);
    if (this.plugin.settings.excludedFolders.length === 0) {
      foldersGroup.addSetting((setting) => {
        setting
          .setName('还没有添加排除文件夹')
          .setDesc('点击标题右侧按钮添加文件夹');
      });
      return;
    }

    this.plugin.settings.excludedFolders.forEach((excludedFolder) => {
      foldersGroup.addSetting((setting) => {
        setting.settingEl.addClass('timestamp-folder-setting');
        setting
          .setName(excludedFolder)
          .setDesc('该文件夹及其子文件夹不会写入创建时间或更新时间属性')
          .addExtraButton((button) =>
            button
              .setIcon('pencil')
              .setTooltip('编辑文件夹')
              .onClick(() => {
                this.openExcludedFolderModal(excludedFolder);
              }),
          )
          .addExtraButton((button) =>
            button
              .setIcon('trash')
              .setTooltip('删除文件夹')
              .onClick(() => {
                void this.removeExcludedFolder(excludedFolder);
              }),
          );
      });
    });
  }

  private openExcludedFolderModal(originalFolder?: string): void {
    new ExcludedFolderModal(this.app, {
      initialFolder: originalFolder ?? '',
      onSave: async (folder) => {
        const folders = this.plugin.settings.excludedFolders;
        if (originalFolder === undefined) {
          this.plugin.settings.excludedFolders = [
            ...folders.filter((existingFolder) => existingFolder !== folder),
            folder,
          ];
        } else {
          let originalIndex = folders.indexOf(originalFolder);
          if (originalIndex < 0) {
            throw new Error('要编辑的排除文件夹已不存在');
          }

          const duplicateIndex = folders.indexOf(folder);
          if (duplicateIndex >= 0 && duplicateIndex !== originalIndex) {
            folders.splice(duplicateIndex, 1);
            if (duplicateIndex < originalIndex) {
              originalIndex--;
            }
          }
          folders[originalIndex] = folder;
        }
        await this.plugin.saveSettings();
        this.display();
      },
    }).open();
  }

  private async removeExcludedFolder(folderToRemove: string): Promise<void> {
    this.plugin.settings.excludedFolders = this.plugin.settings.excludedFolders.filter(
      (folder) => folder !== folderToRemove,
    );
    await this.plugin.saveSettings();
    this.display();
  }
}
