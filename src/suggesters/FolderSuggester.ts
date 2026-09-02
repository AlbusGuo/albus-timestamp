import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.limit = 0;
  }

  protected getSuggestions(query: string): TFolder[] {
    const normalizedQuery = query.toLocaleLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((folder) =>
        folder.path.toLocaleLowerCase().includes(normalizedQuery),
      );
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path);
    this.close();
  }
}
