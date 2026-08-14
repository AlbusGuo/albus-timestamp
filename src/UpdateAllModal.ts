import { App, Modal, Notice, Setting } from 'obsidian';
import TimestampPlugin from './main';

const createTextSpan = (text: string): HTMLSpanElement => {
  const textSpan = document.createElement('span');
  textSpan.setText(text);
  return textSpan;
};

const createBr = () => document.createElement('br');

export class UpdateAllModal extends Modal {
  private readonly plugin: TimestampPlugin;

  private divContainer?: HTMLDivElement;
  private settingsSection?: Setting;
  private isOpened = false;

  constructor(app: App, plugin: TimestampPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onRun(): Promise<void> {
    if (!this.divContainer) {
      this.close();
      return;
    }
    const allMdFiles = await this.plugin.getAllFilesPossiblyAffected();
    const progress = document.createElement('progress');
    progress.setAttr('max', allMdFiles.length);

    const fileCounter = document.createElement('span');

    const updateCount = (count: number) => {
      progress.setAttr('value', count);
      fileCounter.setText(`${count}/${allMdFiles.length}`);
    };
    updateCount(0);

    const wrapperBar = document.createElement('div');
    wrapperBar.append(progress, fileCounter);
    wrapperBar.addClass('progress-section');

    const header = createTextSpan('正在更新文件');

    this.divContainer.replaceChildren(header, wrapperBar);

    if (this.settingsSection) {
      this.contentEl.removeChild(this.settingsSection.settingEl);
    }
    for (let i = 0; i < allMdFiles.length; i++) {
      if (!this.isOpened) {
        new Notice('批量更新时间属性的操作已停止', 2000);
        return;
      }
      updateCount(i + 1);
      await this.plugin.handleFileChange(allMdFiles[i]);
    }

    const doneMessage = createTextSpan('更新完成, 可以关闭此窗口');
    const el = new Setting(this.containerEl).addButton((btn) => {
      btn.setButtonText('关闭').onClick(() => {
        this.close();
      });
    }).settingEl;
    this.divContainer.replaceChildren(doneMessage, createBr(), createBr(), el);
  }

  async onOpen(): Promise<void> {
    this.isOpened = true;
    const { contentEl } = this;
    contentEl.addClass('timestamp-bulk-modal');
    const header = contentEl.createEl('h2', {
      text: '正在查找仓库中符合条件的文件',
    });

    const allMdFiles = await this.plugin.getAllFilesPossiblyAffected();

    header.setText(`更新仓库中的 ${allMdFiles.length} 个文件`);

    const div = contentEl.createDiv();
    this.divContainer = div;

    div.append(
      div.createSpan({
        text: '此操作将批量更新所有符合条件文件的创建时间和更新时间属性',
      }),
      createBr(),
      createBr(),
      div.createSpan({
        text: `警告: 此操作将修改仓库中的 ${allMdFiles.length} 个文件, 请确认设置正确, 并提前备份仓库`,
        cls: 'timestamp-bulk-modal__warning',
      }),
      createBr(),
      createBr(),
    );

    this.settingsSection = new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText('开始')
          .setCta()
          .onClick(() => {
            void this.onRun();
          });
      })
      .addButton((btn) => {
        btn.setButtonText('取消').onClick(() => {
          this.close();
        });
      });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.isOpened = false;
  }
}
