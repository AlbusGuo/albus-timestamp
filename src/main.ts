import { normalizePath, Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import add from 'date-fns/add';
import format from 'date-fns/format';
import isAfter from 'date-fns/isAfter';
import parse from 'date-fns/parse';
import {
  DEFAULT_SETTINGS,
  TIMESTAMP_DATE_FORMAT,
  TimestampSettings,
  TimestampSettingsTab,
} from './Settings';

declare const ExcalidrawAutomate:
  | { isExcalidrawFile: (file: TFile) => boolean }
  | undefined;

const LEGACY_PLUGIN_ID = 'update-time-on-edit';
const SETTINGS_SCHEMA_VERSION = 1;

type StoredSettings = Partial<TimestampSettings> & {
  settingsVersion?: number;
  ignoreGlobalFolder?: string | string[];
  ignoreCreatedFolder?: string[];
};

export default class TimestampPlugin extends Plugin {
  settings: TimestampSettings = { ...DEFAULT_SETTINGS };

  private saveQueue: Promise<void> = Promise.resolve();
  private processingFiles = new Set<string>();

  parseDate(input: number | string): Date | undefined {
    if (typeof input === 'string') {
      try {
        const parsedDate = parse(input, TIMESTAMP_DATE_FORMAT, new Date());

        if (isNaN(parsedDate.getTime())) {
          return undefined;
        }

        return parsedDate;
      } catch (error) {
        console.error('Timestamp 日期解析失败', error);
        return undefined;
      }
    }
    return new Date(input);
  }

  formatDate(input: Date): string {
    return format(input, TIMESTAMP_DATE_FORMAT);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.setupOnEditHandler();
    this.addSettingTab(new TimestampSettingsTab(this.app, this));
  }

  async shouldFileBeIgnored(file: TFile): Promise<boolean> {
    if (!file.path || file.extension !== 'md' || file.name === 'Canvas.md') {
      return true;
    }

    const fileContent = (await this.app.vault.read(file)).trim();
    if (fileContent.length === 0 || this.isExcalidrawFile(file)) {
      return true;
    }

    return this.settings.excludedFolders.some(
      (folder) => file.path === folder || file.path.startsWith(`${folder}/`),
    );
  }

  shouldUpdateValue(currentMtime: Date, updateHeader: Date): boolean {
    const nextUpdate = add(updateHeader, {
      minutes: this.settings.minMinutesBetweenSaves,
    });
    return isAfter(currentMtime, nextUpdate);
  }

  isExcalidrawFile(file: TFile): boolean {
    const excalidrawAutomate =
      typeof ExcalidrawAutomate === 'undefined'
        ? undefined
        : ExcalidrawAutomate;
    return excalidrawAutomate?.isExcalidrawFile(file) ?? false;
  }

  async getAllFilesPossiblyAffected(): Promise<TFile[]> {
    const result: TFile[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!(await this.shouldFileBeIgnored(file))) {
        result.push(file);
      }
    }

    return result;
  }

  async handleFileChange(
    file: TAbstractFile,
  ): Promise<
    | { status: 'ok' }
    | { status: 'error'; error: unknown }
    | { status: 'ignored' }
  > {
    if (
      !(file instanceof TFile) ||
      this.processingFiles.has(file.path) ||
      (await this.shouldFileBeIgnored(file))
    ) {
      return { status: 'ignored' };
    }

    this.processingFiles.add(file.path);
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter) => {
          const updatedKey = this.settings.headerUpdated;
          const createdKey = this.settings.headerCreated;
          const mTime = this.parseDate(file.stat.mtime);
          const cTime = this.parseDate(file.stat.ctime);

          if (!mTime || !cTime) {
            return;
          }

          if (!frontmatter[createdKey]) {
            frontmatter[createdKey] = this.formatDate(cTime);
          }

          const currentMTimeOnFile = this.parseDate(frontmatter[updatedKey]);
          if (
            !frontmatter[updatedKey] ||
            !currentMTimeOnFile ||
            this.shouldUpdateValue(mTime, currentMTimeOnFile)
          ) {
            frontmatter[updatedKey] = this.formatDate(mTime);
          }
        },
        { ctime: file.stat.ctime, mtime: file.stat.mtime },
      );
    } catch (error) {
      if (this.isYamlParseError(error)) {
        const errorMessage = `更新时间属性失败: 文件的 YAML 属性格式错误 (${file.path})`;
        new Notice(errorMessage, 4000);
        console.error(errorMessage, error);
      } else {
        console.error(`Timestamp 处理文件失败: ${file.path}`, error);
      }
      return { status: 'error', error };
    } finally {
      this.processingFiles.delete(file.path);
    }

    return { status: 'ok' };
  }

  setupOnEditHandler(): void {
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        void this.handleFileChange(file);
      }),
    );
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.saveQueue.catch(() => undefined);
    try {
      const stored = await this.loadData();
      this.settings = this.sanitizeSettings(stored);
    } catch (error) {
      console.error('Timestamp 重新加载外部设置失败', error);
      new Notice('Timestamp 无法重新加载外部设置, 已保留当前设置', 6000);
    }
  }

  async loadSettings(): Promise<void> {
    let currentData: unknown;
    try {
      currentData = await this.loadData();
    } catch (error) {
      console.error('Timestamp 读取设置失败', error);
      new Notice('Timestamp 无法读取设置, 未覆盖现有设置文件', 6000);
      return;
    }
    const isCurrentSchema =
      this.isRecord(currentData) &&
      currentData.settingsVersion === SETTINGS_SCHEMA_VERSION;
    const legacyData = isCurrentSchema
      ? undefined
      : await this.loadLegacySettings();
    const { sourceData, usedLegacyData } = this.selectSettingsSource(
      currentData,
      legacyData,
    );

    this.settings = this.sanitizeSettings(sourceData);

    if (!this.settingsAreClean(currentData)) {
      await this.saveSettings();
      if (usedLegacyData) {
        new Notice('Timestamp 已迁移旧版插件设置', 4000);
      }
    }
  }

  async saveSettings(): Promise<void> {
    const snapshot = this.sanitizeSettings(this.settings);
    this.settings = snapshot;

    const saveOperation = this.saveQueue
      .catch(() => undefined)
      .then(() => this.saveData(this.toStoredSettings(snapshot)));
    this.saveQueue = saveOperation;
    await saveOperation;
  }

  private sanitizeSettings(data: unknown): TimestampSettings {
    const stored = this.isRecord(data) ? (data as StoredSettings) : {};
    const excludedFolders = this.normalizeFolderList([
      ...this.toStringArray(stored.excludedFolders),
      ...this.toStringArray(stored.ignoreGlobalFolder),
      ...this.toStringArray(stored.ignoreCreatedFolder),
    ]);

    return {
      headerUpdated: this.validPropertyName(
        stored.headerUpdated,
        DEFAULT_SETTINGS.headerUpdated,
      ),
      headerCreated: this.validPropertyName(
        stored.headerCreated,
        DEFAULT_SETTINGS.headerCreated,
      ),
      minMinutesBetweenSaves: this.validUpdateInterval(
        stored.minMinutesBetweenSaves,
      ),
      excludedFolders,
    };
  }

  private async loadLegacySettings(): Promise<unknown> {
    const legacyDataPath = normalizePath(
      `${this.app.vault.configDir}/plugins/${LEGACY_PLUGIN_ID}/data.json`,
    );

    try {
      if (!(await this.app.vault.adapter.exists(legacyDataPath))) {
        return undefined;
      }
      return JSON.parse(await this.app.vault.adapter.read(legacyDataPath));
    } catch (error) {
      console.error('Timestamp 读取旧版插件设置失败', error);
      new Notice('Timestamp 无法读取旧版插件设置, 请检查控制台', 6000);
      return undefined;
    }
  }

  private settingsAreClean(data: unknown): boolean {
    if (!this.isRecord(data)) {
      return false;
    }
    return (
      JSON.stringify(data) ===
      JSON.stringify(this.toStoredSettings(this.sanitizeSettings(data)))
    );
  }

  private selectSettingsSource(
    currentData: unknown,
    legacyData: unknown,
  ): { sourceData: unknown; usedLegacyData: boolean } {
    if (
      this.isRecord(currentData) &&
      currentData.settingsVersion === SETTINGS_SCHEMA_VERSION
    ) {
      return { sourceData: currentData, usedLegacyData: false };
    }
    if (!this.isRecord(legacyData)) {
      return { sourceData: currentData, usedLegacyData: false };
    }
    if (!this.isRecord(currentData)) {
      return { sourceData: legacyData, usedLegacyData: true };
    }

    const current = this.sanitizeSettings(currentData);
    const legacy = this.sanitizeSettings(legacyData);
    return {
      sourceData: {
        headerUpdated:
          current.headerUpdated !== DEFAULT_SETTINGS.headerUpdated
            ? current.headerUpdated
            : legacy.headerUpdated,
        headerCreated:
          current.headerCreated !== DEFAULT_SETTINGS.headerCreated
            ? current.headerCreated
            : legacy.headerCreated,
        minMinutesBetweenSaves:
          current.minMinutesBetweenSaves !==
          DEFAULT_SETTINGS.minMinutesBetweenSaves
            ? current.minMinutesBetweenSaves
            : legacy.minMinutesBetweenSaves,
        excludedFolders: [
          ...current.excludedFolders,
          ...legacy.excludedFolders,
        ],
      },
      usedLegacyData: true,
    };
  }

  private toStoredSettings(settings: TimestampSettings): StoredSettings {
    return {
      settingsVersion: SETTINGS_SCHEMA_VERSION,
      headerUpdated: settings.headerUpdated,
      headerCreated: settings.headerCreated,
      minMinutesBetweenSaves: settings.minMinutesBetweenSaves,
      excludedFolders: [...settings.excludedFolders],
    };
  }

  private normalizeFolderList(values: string[]): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => normalizePath(value.trim()))
          .filter((value) => value.length > 0),
      ),
    );
  }

  private toStringArray(value: unknown): string[] {
    if (typeof value === 'string') {
      return [value];
    }
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return [];
  }

  private validPropertyName(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private validUpdateInterval(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_SETTINGS.minMinutesBetweenSaves;
    }
    return Math.min(30, Math.max(1, Math.round(value)));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isYamlParseError(error: unknown): boolean {
    return this.isRecord(error) && error.name === 'YAMLParseError';
  }
}
