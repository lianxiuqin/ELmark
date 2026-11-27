export const IPC_CHANNELS = {
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_READ: 'file:read',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',
  FOLDER_OPEN_DIALOG: 'folder:open-dialog',
  FOLDER_READ_TREE: 'folder:read-tree',
  FILE_WATCH_START: 'file:watch-start',
  FILE_WATCH_STOP: 'file:watch-stop',
  FILE_EXTERNAL_CHANGE: 'file:external-change',
  MENU_POPUP: 'menu:popup',
  MENU_ACTION: 'menu:action',
  FIND_IN_PAGE: 'find:in-page',
  FIND_STOP: 'find:stop',
  FIND_RESULT: 'find:result',
  EXPORT_PDF: 'export:pdf',
  OPEN_EXTERNAL_URL: 'app:open-external-url',
  WINDOW_CONFIRM_DISCARD: 'window:confirm-discard',
  APP_GET_INITIAL_FILE: 'app:get-initial-file',
  WINDOW_NEW: 'window:new',
} as const;

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export interface OpenedFile {
  filePath: string;
  content: string;
  fileName: string;
  dirPath: string;
}

export interface OutlineItem {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  index: number;
}

export interface FindResult {
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
}

export type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:open-folder'
  | 'file:save'
  | 'file:save-as'
  | 'file:new-window'
  | 'file:export-pdf'
  | 'insert:table'
  | 'insert:mermaid'
  | 'view:toggle-sidebar'
  | 'view:toggle-source'
  | 'edit:find';

export type DiscardChoice = 'save' | 'discard' | 'cancel';

export interface ElmarkApi {
  openFileDialog(): Promise<OpenedFile | null>;
  readFile(filePath: string): Promise<OpenedFile>;
  saveFile(filePath: string, content: string): Promise<boolean>;
  saveFileAs(content: string, defaultName?: string): Promise<string | null>;
  openFolderDialog(): Promise<{ dirPath: string; tree: FileTreeNode[] } | null>;
  readFolderTree(dirPath: string): Promise<FileTreeNode[]>;
  watchFile(filePath: string): void;
  stopWatchFile(): void;
  onExternalFileChange(cb: (filePath: string) => void): () => void;
  popupMenu(x: number, y: number): void;
  onMenuAction(cb: (action: MenuAction) => void): () => void;
  findInPage(query: string, forward?: boolean, findNext?: boolean): void;
  stopFindInPage(): void;
  onFindResult(cb: (res: FindResult) => void): () => void;
  exportPdf(suggestedBaseName: string): Promise<string | null>;
  openExternalUrl(url: string): Promise<void>;
  confirmDiscard(fileName: string): Promise<DiscardChoice>;
  getInitialFile(): Promise<string | null>;
  newWindow(): void;
  getPathForFile?: (file: File) => string;
}

declare global {
  interface Window {
    elmark: ElmarkApi;
  }
}
