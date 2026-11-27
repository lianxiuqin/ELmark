import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  type ElmarkApi,
  type FindResult,
  type MenuAction,
} from '../shared/ipc';

function subscribeChannel<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => {
    cb(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const elmarkApi: ElmarkApi = {
  openFileDialog: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG),
  readFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE, filePath, content),
  saveFileAs: (content: string, defaultName?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_AS, content, defaultName),
  openFolderDialog: () => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_OPEN_DIALOG),
  readFolderTree: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_READ_TREE, dirPath),
  watchFile: (filePath: string) => ipcRenderer.send(IPC_CHANNELS.FILE_WATCH_START, filePath),
  stopWatchFile: () => ipcRenderer.send(IPC_CHANNELS.FILE_WATCH_STOP),
  onExternalFileChange: (cb: (filePath: string) => void) =>
    subscribeChannel<string>(IPC_CHANNELS.FILE_EXTERNAL_CHANGE, cb),
  popupMenu: (x: number, y: number) => ipcRenderer.send(IPC_CHANNELS.MENU_POPUP, x, y),
  onMenuAction: (cb: (action: MenuAction) => void) =>
    subscribeChannel<MenuAction>(IPC_CHANNELS.MENU_ACTION, cb),
  findInPage: (query: string, forward?: boolean, findNext?: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.FIND_IN_PAGE, query, forward, findNext),
  stopFindInPage: () => ipcRenderer.send(IPC_CHANNELS.FIND_STOP),
  onFindResult: (cb: (res: FindResult) => void) =>
    subscribeChannel<FindResult>(IPC_CHANNELS.FIND_RESULT, cb),
  exportPdf: (suggestedBaseName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PDF, suggestedBaseName),
  openExternalUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, url),
  confirmDiscard: (fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CONFIRM_DISCARD, fileName),
  setWindowDirty: (isDirty: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.WINDOW_SET_DIRTY, isDirty),
  onCloseRequest: (cb: () => void) => {
    const listener = (): void => {
      cb();
    };
    ipcRenderer.on(IPC_CHANNELS.WINDOW_CLOSE_REQUEST, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_CLOSE_REQUEST, listener);
    };
  },
  confirmClose: (allowClose: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE_CONFIRM, allowClose),
  getInitialFile: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INITIAL_FILE),
  newWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_NEW),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('elmark', elmarkApi);
