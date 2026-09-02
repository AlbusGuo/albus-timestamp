import { App, Modal, normalizePath, Notice, Setting } from 'obsidian';
import { FolderSuggest } from '../suggesters/FolderSuggester';

interface ExcludedFolderModalOptions {
  initialFolder: string;
  onSave: (folder: string) => Promise<void>;
}

export class ExcludedFolderModal extends Modal {
  private inputEl: HTMLInputElement | null = null;
  private suggest: FolderSuggest | null = null;

  constructor(app: App, private readonly options: ExcludedFolderModalOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass('timestamp-folder-editor-modal');
    contentEl.addClass('timestamp-folder-editor');
    contentEl.empty();

    new Setting(contentEl)
      .setName('文件夹')
      .setDesc('选择或输入要排除的文件夹')
      .addText((text) => {
        this.inputEl = text.inputEl;
        text
          .setPlaceholder('例如: 文件夹 1/文件夹 2')
          .setValue(this.options.initialFolder);
        this.suggest = new FolderSuggest(this.app, text.inputEl);
      });

    const inputEl = this.inputEl;
    inputEl?.win.requestAnimationFrame(() => {
      inputEl.win.requestAnimationFrame(() => {
        if (inputEl.ownerDocument.activeElement === inputEl) {
          inputEl.blur();
        }
      });
    });
  }

  onClose(): void {
    const folder = normalizeFolder(this.inputEl?.value ?? '');
    const initialFolder = normalizeFolder(this.options.initialFolder);

    this.suggest?.close();
    this.suggest = null;
    this.inputEl = null;
    this.contentEl.empty();
    this.modalEl.removeClass('timestamp-folder-editor-modal');
    this.contentEl.removeClass('timestamp-folder-editor');

    if (!folder) {
      new Notice('文件夹路径不能为空, 未保存更改', 3000);
      return;
    }
    if (folder === initialFolder) {
      return;
    }

    void this.options.onSave(folder).catch((error) => {
      console.error('Timestamp 保存排除文件夹失败', error);
      new Notice('Timestamp 无法保存排除文件夹, 未保存更改', 4000);
    });
  }
}

function normalizeFolder(folder: string): string {
  const trimmedFolder = folder.trim();
  if (!trimmedFolder) {
    return '';
  }
  return trimmedFolder === '/' ? '/' : normalizePath(trimmedFolder);
}
