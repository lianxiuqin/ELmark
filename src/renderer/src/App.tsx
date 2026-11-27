import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import type { FileTreeNode, FindResult, MenuAction } from '../../shared/ipc';
import { EditorHost, type EditorHostHandle } from './components/EditorHost';
import { ExternalChangeBanner } from './components/ExternalChangeBanner';
import { FindBar } from './components/FindBar';
import { FrontmatterBar } from './components/FrontmatterBar';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { extractOutline } from './core/outline';
import { useDocumentState } from './hooks/useDocumentState';

function getPathBaseName(targetPath: string): string {
  const trimmed = targetPath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

function getPathDirName(targetPath: string): string | null {
  const lastSep = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
  if (lastSep <= 0) {
    return null;
  }
  return targetPath.slice(0, lastSep);
}

function isMarkdownFilename(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

/**
 * Root ELmark application shell integrating titlebar, sidebar, dual-mode editor,
 * find bar, external-change banner, keyboard shortcuts, and drag-and-drop.
 */
export function App() {
  const api = window.elmark;
  const doc = useDocumentState(api);
  const editorHostRef = useRef<EditorHostHandle | null>(null);

  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'outline'>('files');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(0);

  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<FindResult | null>(null);

  const modeRef = useRef(doc.mode);
  modeRef.current = doc.mode;

  const fileNameRef = useRef(doc.fileName);
  fileNameRef.current = doc.fileName;

  const findVisibleRef = useRef(findVisible);
  findVisibleRef.current = findVisible;

  const findQueryRef = useRef(findQuery);
  findQueryRef.current = findQuery;

  const {
    openFilePath,
    openFileDialog,
    openNew,
    saveFile,
    saveFileAs,
    toggleMode,
    markExternalChange,
  } = doc;

  const outline = useMemo(() => extractOutline(doc.body), [doc.body]);

  const loadFolderTree = useCallback(
    async (dirPath: string) => {
      const nodes = await api.readFolderTree(dirPath);
      setFolderName(getPathBaseName(dirPath));
      setTree(nodes);
    },
    [api],
  );

  const handleOpenFolder = useCallback(async () => {
    const result = await api.openFolderDialog();
    if (!result) {
      return;
    }
    setFolderName(getPathBaseName(result.dirPath));
    setTree(result.tree);
    setSidebarVisible(true);
    setSidebarTab('files');
  }, [api]);

  const handleExportPdf = useCallback(async () => {
    const suggested =
      fileNameRef.current.replace(/\.(md|markdown)$/i, '') || 'untitled';
    await api.exportPdf(suggested);
  }, [api]);

  const runFind = useCallback(
    (query: string, forward: boolean, findNext: boolean) => {
      if (!query) {
        api.stopFindInPage();
        setFindResult(null);
        return;
      }
      if (modeRef.current === 'source') {
        const res = editorHostRef.current?.findInSource(query, forward, findNext) ?? {
          activeMatchOrdinal: 0,
          matches: 0,
          finalUpdate: true,
        };
        setFindResult(res);
      } else {
        api.findInPage(query, forward, findNext);
      }
    },
    [api],
  );

  const openFindBar = useCallback(() => {
    setFindVisible(true);
    if (findQueryRef.current) {
      requestAnimationFrame(() => {
        runFind(findQueryRef.current, true, false);
      });
    }
  }, [runFind]);

  const closeFindBar = useCallback(() => {
    setFindVisible(false);
    api.stopFindInPage();
    setFindResult(null);
  }, [api]);

  const handleFindQueryChange = useCallback(
    (nextQuery: string) => {
      setFindQuery(nextQuery);
      runFind(nextQuery, true, false);
    },
    [runFind],
  );

  const handleFindStep = useCallback(
    (forward: boolean) => {
      if (!findQueryRef.current) {
        return;
      }
      runFind(findQueryRef.current, forward, true);
    },
    [runFind],
  );

  // Load initial file passed via CLI / file association on mount.
  useEffect(() => {
    let cancelled = false;
    void api.getInitialFile().then(async (initialPath) => {
      if (cancelled || !initialPath) {
        return;
      }
      const opened = await openFilePath(initialPath);
      if (!opened || cancelled) {
        return;
      }
      const parentDir = getPathDirName(initialPath);
      if (parentDir) {
        await loadFolderTree(parentDir);
      }
    });
    return () => {
      cancelled = true;
    };
    // Run once on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run active search when switching between WYSIWYG and Source modes.
  useEffect(() => {
    if (!findVisibleRef.current || !findQueryRef.current) {
      return;
    }
    if (doc.mode === 'source') {
      api.stopFindInPage();
    }
    const rafId = requestAnimationFrame(() => {
      runFind(findQueryRef.current, true, false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [api, doc.mode, runFind]);

  // Reset active outline heading when switching documents.
  useEffect(() => {
    setActiveHeadingIndex(0);
  }, [doc.filePath]);

  // Sync window title with dirty indicator.
  useEffect(() => {
    document.title = `${doc.fileName}${doc.isDirty ? ' *' : ''} — ELmark`;
  }, [doc.fileName, doc.isDirty]);

  // Guard closing with unsaved changes.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (doc.isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [doc.isDirty]);

  // Subscribe to native menu actions, external file changes, and Chromium find results.
  useEffect(() => {
    const unsubMenu = api.onMenuAction((action: MenuAction) => {
      switch (action) {
        case 'file:new':
          void openNew();
          break;
        case 'file:open':
          void openFileDialog();
          break;
        case 'file:open-folder':
          void handleOpenFolder();
          break;
        case 'file:save':
          void saveFile();
          break;
        case 'file:save-as':
          void saveFileAs();
          break;
        case 'file:new-window':
          api.newWindow();
          break;
        case 'file:export-pdf':
          void handleExportPdf();
          break;
        case 'insert:table':
          editorHostRef.current?.insertTable();
          break;
        case 'insert:mermaid':
          editorHostRef.current?.insertMermaid();
          break;
        case 'view:toggle-sidebar':
          setSidebarVisible((prev) => !prev);
          break;
        case 'view:toggle-source':
          toggleMode();
          break;
        case 'edit:find':
          openFindBar();
          break;
      }
    });

    const unsubExternal = api.onExternalFileChange(() => {
      markExternalChange();
    });

    const unsubFind = api.onFindResult((res) => {
      if (modeRef.current === 'wysiwyg') {
        setFindResult(res);
      }
    });

    return () => {
      unsubMenu();
      unsubExternal();
      unsubFind();
    };
  }, [
    api,
    handleExportPdf,
    handleOpenFolder,
    markExternalChange,
    openFileDialog,
    openFindBar,
    openNew,
    saveFile,
    saveFileAs,
    toggleMode,
  ]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) {
        return;
      }

      if (event.key === 'Escape' && findVisibleRef.current) {
        event.preventDefault();
        closeFindBar();
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          void saveFileAs();
        } else {
          void saveFile();
        }
      } else if (key === 'o') {
        event.preventDefault();
        if (event.shiftKey) {
          void handleOpenFolder();
        } else {
          void openFileDialog();
        }
      } else if (key === 'n') {
        event.preventDefault();
        if (event.shiftKey) {
          api.newWindow();
        } else {
          void openNew();
        }
      } else if (event.key === '/' || event.code === 'Slash') {
        event.preventDefault();
        toggleMode();
      } else if (key === 'l' && event.shiftKey) {
        event.preventDefault();
        setSidebarVisible((prev) => !prev);
      } else if (key === 'f' && !event.shiftKey) {
        event.preventDefault();
        openFindBar();
      } else if (key === 'e' && !event.shiftKey) {
        event.preventDefault();
        void handleExportPdf();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    api,
    closeFindBar,
    handleExportPdf,
    handleOpenFolder,
    openFileDialog,
    openFindBar,
    openNew,
    saveFile,
    saveFileAs,
    toggleMode,
  ]);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (!isMarkdownFilename(file.name)) {
        continue;
      }
      event.preventDefault();
      const droppedPath =
        api.getPathForFile?.(file) ?? (file as File & { path?: string }).path;
      if (droppedPath) {
        void doc.openFilePath(droppedPath);
      }
      break;
    }
  };

  return (
    <div
      className="elmark-app"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TitleBar
        fileName={doc.fileName}
        isDirty={doc.isDirty}
        isSourceMode={doc.mode === 'source'}
        sidebarVisible={sidebarVisible}
        onOpenMenu={(x, y) => api.popupMenu(x, y)}
        onToggleSidebar={() => setSidebarVisible((prev) => !prev)}
      />

      <div className="elmark-workspace">
        <Sidebar
          visible={sidebarVisible}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          folderName={folderName}
          tree={tree}
          activeFilePath={doc.filePath}
          outline={outline}
          activeHeadingIndex={activeHeadingIndex}
          onOpenFolder={() => void handleOpenFolder()}
          onSelectFile={(filePath) => void doc.openFilePath(filePath)}
          onSelectHeading={(index) => {
            setActiveHeadingIndex(index);
            editorHostRef.current?.scrollToHeadingIndex(index);
          }}
        />

        <main className="elmark-main">
          <ExternalChangeBanner
            visible={doc.externalChangePending}
            onReload={() => void doc.reloadFromDisk()}
            onIgnore={doc.ignoreExternalChange}
          />

          <FindBar
            visible={findVisible}
            query={findQuery}
            result={findResult}
            onQueryChange={handleFindQueryChange}
            onNext={() => handleFindStep(true)}
            onPrev={() => handleFindStep(false)}
            onClose={closeFindBar}
          />

          {doc.mode === 'wysiwyg' ? (
            <FrontmatterBar
              key={doc.filePath ?? 'untitled'}
              frontmatter={doc.frontmatter}
              onEditInSource={() => doc.setMode('source')}
            />
          ) : null}

          <EditorHost
            ref={editorHostRef}
            mode={doc.mode}
            body={doc.body}
            fullRawMarkdown={doc.getFullRawMarkdown()}
            documentDir={doc.dirPath}
            onBodyChange={doc.updateBody}
            onSourceChange={doc.updateFromSource}
            onActiveHeadingChange={setActiveHeadingIndex}
            onOpenExternalUrl={(url) => void api.openExternalUrl(url)}
          />
        </main>
      </div>
    </div>
  );
}
