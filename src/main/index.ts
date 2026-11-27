import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path, { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  IPC_CHANNELS,
  type DiscardChoice,
  type FindResult,
  type MenuAction,
} from '../shared/ipc';
import {
  isMarkdownFile,
  readMarkdownFile,
  scanMarkdownTree,
  writeMarkdownFile,
} from './fileTree';
import { DocumentFileWatcher } from './fileWatcher';
import { decodeLocalAssetUrl, LOCAL_PROTOCOL_SCHEME } from './localProtocol';
import { buildCspHeader } from './csp';
import { buildAppMenuTemplate } from './menu';
import { exportWindowToPdf } from './pdfExport';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1200,
  height: 800,
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_PROTOCOL_SCHEME,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
]);

function extractInitialMarkdownArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) {
      continue;
    }
    if (!isMarkdownFile(arg)) {
      continue;
    }
    const resolved = path.resolve(arg);
    try {
      if (fsSync.statSync(resolved).isFile()) {
        return resolved;
      }
    } catch {
      // Ignore nonexistent CLI file arguments.
    }
  }
  return null;
}

let pendingInitialFile: string | null = extractInitialMarkdownArg(process.argv);
const windowWatchers = new Map<number, DocumentFileWatcher>();

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const raw = fsSync.readFileSync(getWindowStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    const width = typeof parsed.width === 'number' && parsed.width >= 640 ? parsed.width : DEFAULT_WINDOW_STATE.width;
    const height = typeof parsed.height === 'number' && parsed.height >= 480 ? parsed.height : DEFAULT_WINDOW_STATE.height;

    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      const displays = screen.getAllDisplays();
      const visibleOnAnyDisplay = displays.some(({ workArea }) => {
        return (
          parsed.x! < workArea.x + workArea.width &&
          parsed.x! + width > workArea.x &&
          parsed.y! < workArea.y + workArea.height &&
          parsed.y! + height > workArea.y
        );
      });
      if (visibleOnAnyDisplay) {
        return {
          width,
          height,
          x: parsed.x,
          y: parsed.y,
          isMaximized: Boolean(parsed.isMaximized),
        };
      }
    }

    return {
      width,
      height,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }
  const bounds = win.getNormalBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  };
  try {
    fsSync.mkdirSync(path.dirname(getWindowStatePath()), { recursive: true });
    fsSync.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Non-fatal if window state persistence fails.
  }
}

async function openExternalIfSafe(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    await shell.openExternal(parsed.toString());
  }
}

function getOrCreateWatcher(webContentsId: number): DocumentFileWatcher {
  let watcher = windowWatchers.get(webContentsId);
  if (!watcher) {
    watcher = new DocumentFileWatcher();
    windowWatchers.set(webContentsId, watcher);
  }
  return watcher;
}

function dispatchMenuAction(win: BrowserWindow | null, action: MenuAction): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.MENU_ACTION, action);
    return;
  }
  if (action === 'file:new-window') {
    createMainWindow();
  }
}

function createMainWindow(): BrowserWindow {
  const savedState = loadWindowState();
  const win = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#333333',
      height: 38,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const webContentsId = win.webContents.id;
  getOrCreateWatcher(webContentsId);

  win.once('ready-to-show', () => {
    if (savedState.isMaximized) {
      win.maximize();
    }
    win.show();
  });

  let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSaveState = (): void => {
    if (saveBoundsTimer !== null) {
      clearTimeout(saveBoundsTimer);
    }
    saveBoundsTimer = setTimeout(() => {
      saveBoundsTimer = null;
      saveWindowState(win);
    }, 200);
  };

  win.on('resize', scheduleSaveState);
  win.on('move', scheduleSaveState);
  win.on('close', () => {
    if (saveBoundsTimer !== null) {
      clearTimeout(saveBoundsTimer);
      saveBoundsTimer = null;
    }
    saveWindowState(win);
  });

  win.on('closed', () => {
    const watcher = windowWatchers.get(webContentsId);
    if (watcher) {
      watcher.stop();
      windowWatchers.delete(webContentsId);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalIfSafe(url);
    return { action: 'deny' };
  });

  const rendererHtmlUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).toString();

  win.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    const isDevRenderer = Boolean(rendererUrl && url.startsWith(rendererUrl));
    const isLocalAppHtml =
      url === rendererHtmlUrl ||
      url.startsWith(`${rendererHtmlUrl}#`) ||
      url.startsWith(`${rendererHtmlUrl}?`);
    if (!isDevRenderer && !isLocalAppHtml) {
      event.preventDefault();
      void openExternalIfSafe(url);
    }
  });

  win.webContents.on('found-in-page', (_event, result) => {
    if (win.isDestroyed()) {
      return;
    }
    const payload: FindResult = {
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate,
    };
    win.webContents.send(IPC_CHANNELS.FIND_RESULT, payload);
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function getWindowFromEvent(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerProtocolHandlers(): void {
  protocol.handle(LOCAL_PROTOCOL_SCHEME, async (request) => {
    const decodedPath = decodeLocalAssetUrl(request.url);
    if (!decodedPath) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const stat = await fs.stat(decodedPath);
      if (!stat.isFile()) {
        return new Response('Not Found', { status: 404 });
      }
      return await net.fetch(pathToFileURL(decodedPath).toString());
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function registerCspHeaders(): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const csp = buildCspHeader(Boolean(rendererUrl));

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isAppDocument =
      details.resourceType === 'mainFrame' ||
      details.url.startsWith('file://') ||
      Boolean(rendererUrl && details.url.startsWith(rendererUrl));

    if (!isAppDocument) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders: Record<string, string | string[]> = {
      ...(details.responseHeaders ?? {}),
    };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN_DIALOG, async (event) => {
    const win = getWindowFromEvent(event);
    const options: Electron.OpenDialogOptions = {
      title: '打开 Markdown 文件',
      properties: ['openFile'],
      filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown'] }],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return readMarkdownFile(result.filePaths[0]);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, filePath: string) => {
    return readMarkdownFile(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_SAVE, async (event, filePath: string, content: string) => {
    const watcher = getOrCreateWatcher(event.sender.id);
    watcher.markSelfWrite(filePath);
    await writeMarkdownFile(filePath, content);
    return true;
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_AS,
    async (event, content: string, defaultName?: string) => {
      const win = getWindowFromEvent(event);
      const options: Electron.SaveDialogOptions = {
        title: '另存为',
        defaultPath: defaultName,
        filters: [{ name: 'Markdown 文件', extensions: ['md', 'markdown'] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return null;
      }
      const watcher = getOrCreateWatcher(event.sender.id);
      watcher.markSelfWrite(result.filePath);
      await writeMarkdownFile(result.filePath, content);
      return result.filePath;
    },
  );

  ipcMain.handle(IPC_CHANNELS.FOLDER_OPEN_DIALOG, async (event) => {
    const win = getWindowFromEvent(event);
    const options: Electron.OpenDialogOptions = {
      title: '打开文件夹',
      properties: ['openDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const dirPath = result.filePaths[0];
    const tree = await scanMarkdownTree(dirPath);
    return { dirPath, tree };
  });

  ipcMain.handle(IPC_CHANNELS.FOLDER_READ_TREE, async (_event, dirPath: string) => {
    return scanMarkdownTree(dirPath);
  });

  ipcMain.on(IPC_CHANNELS.FILE_WATCH_START, (event, filePath: string) => {
    const watcher = getOrCreateWatcher(event.sender.id);
    watcher.watch(filePath, (changedPath) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.FILE_EXTERNAL_CHANGE, changedPath);
      }
    });
  });

  ipcMain.on(IPC_CHANNELS.FILE_WATCH_STOP, (event) => {
    windowWatchers.get(event.sender.id)?.stop();
  });

  ipcMain.on(IPC_CHANNELS.MENU_POPUP, (event, x: number, y: number) => {
    const win = getWindowFromEvent(event);
    if (!win || win.isDestroyed()) {
      return;
    }
    const menu = Menu.buildFromTemplate(
      buildAppMenuTemplate((action) => dispatchMenuAction(win, action)),
    );
    menu.popup({
      window: win,
      x: Math.round(x),
      y: Math.round(y),
    });
  });

  ipcMain.on(
    IPC_CHANNELS.FIND_IN_PAGE,
    (event, query: string, forward = true, findNext = false) => {
      if (event.sender.isDestroyed()) {
        return;
      }
      if (!query) {
        event.sender.stopFindInPage('clearSelection');
        return;
      }
      event.sender.findInPage(query, { forward, findNext });
    },
  );

  ipcMain.on(IPC_CHANNELS.FIND_STOP, (event) => {
    if (!event.sender.isDestroyed()) {
      event.sender.stopFindInPage('clearSelection');
    }
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_PDF, async (event, suggestedBaseName: string) => {
    const win = getWindowFromEvent(event);
    if (!win || win.isDestroyed()) {
      return null;
    }
    return exportWindowToPdf(win, suggestedBaseName, dialog);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL_URL, async (_event, url: string) => {
    await openExternalIfSafe(url);
  });

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_CONFIRM_DISCARD,
    async (event, fileName: string): Promise<DiscardChoice> => {
      const win = getWindowFromEvent(event);
      const options: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: ['保存', '不保存', '取消'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: '未保存的更改',
        message: `是否保存对“${fileName}”的更改？`,
      };
      const { response } = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options);
      if (response === 0) {
        return 'save';
      }
      if (response === 1) {
        return 'discard';
      }
      return 'cancel';
    },
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_INITIAL_FILE, () => {
    const initialFile = pendingInitialFile;
    pendingInitialFile = null;
    return initialFile;
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_NEW, () => {
    createMainWindow();
  });
}

app.whenReady().then(() => {
  registerProtocolHandlers();
  registerCspHeaders();
  registerIpcHandlers();

  const appMenu = Menu.buildFromTemplate(
    buildAppMenuTemplate((action) =>
      dispatchMenuAction(BrowserWindow.getFocusedWindow(), action),
    ),
  );
  Menu.setApplicationMenu(appMenu);

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
