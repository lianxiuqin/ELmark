import { useCallback, useRef, useState } from 'react';
import type { ElmarkApi, OpenedFile } from '../../../shared/ipc';
import {
  joinFrontmatter,
  splitFrontmatter,
  type LineEnding,
} from '../core/frontmatter';

export type EditorMode = 'wysiwyg' | 'source';

interface InternalDocumentState {
  filePath: string | null;
  fileName: string;
  dirPath: string | null;
  frontmatter: string | null;
  body: string;
  lineEnding: LineEnding;
  sourceRaw: string;
  isDirty: boolean;
  mode: EditorMode;
  externalChangePending: boolean;
}

export interface DocumentStateHook {
  filePath: string | null;
  fileName: string;
  dirPath: string | null;
  frontmatter: string | null;
  body: string;
  lineEnding: LineEnding;
  isDirty: boolean;
  mode: EditorMode;
  externalChangePending: boolean;
  openFilePath: (targetPath: string) => Promise<boolean>;
  openFileDialog: () => Promise<boolean>;
  openNew: () => Promise<boolean>;
  updateBody: (nextBody: string) => void;
  updateFromSource: (nextRaw: string) => void;
  getFullRawMarkdown: () => string;
  saveFile: () => Promise<boolean>;
  saveFileAs: () => Promise<boolean>;
  toggleMode: () => void;
  setMode: (nextMode: EditorMode) => void;
  reloadFromDisk: () => Promise<void>;
  ignoreExternalChange: () => void;
  markExternalChange: () => void;
}

const DEFAULT_UNTITLED_NAME = '无标题.md';

function getBaseName(targetPath: string): string {
  const parts = targetPath.split(/[\\/]/);
  return parts[parts.length - 1] || DEFAULT_UNTITLED_NAME;
}

function getDirName(targetPath: string): string | null {
  const lastSep = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
  if (lastSep <= 0) {
    return null;
  }
  return targetPath.slice(0, lastSep);
}

function createInitialState(): InternalDocumentState {
  return {
    filePath: null,
    fileName: DEFAULT_UNTITLED_NAME,
    dirPath: null,
    frontmatter: null,
    body: '',
    lineEnding: '\n',
    sourceRaw: '',
    isDirty: false,
    mode: 'wysiwyg',
    externalChangePending: false,
  };
}

/**
 * Manages the active Markdown document lifecycle, frontmatter round-tripping, dirty guards,
 * mode switching, and external file change reconciliation.
 */
export function useDocumentState(api: ElmarkApi): DocumentStateHook {
  const [state, setState] = useState<InternalDocumentState>(createInitialState);
  const stateRef = useRef<InternalDocumentState>(state);
  stateRef.current = state;

  const commitState = useCallback(
    (updater: (prev: InternalDocumentState) => InternalDocumentState) => {
      setState((prev) => {
        const next = updater(prev);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const getFullRawMarkdown = useCallback((): string => {
    const current = stateRef.current;
    if (current.mode === 'source') {
      return current.sourceRaw;
    }
    return joinFrontmatter(current.frontmatter, current.body, current.lineEnding);
  }, []);

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    const raw =
      current.mode === 'source'
        ? current.sourceRaw
        : joinFrontmatter(current.frontmatter, current.body, current.lineEnding);

    const savedPath = await api.saveFileAs(raw, current.fileName);
    if (!savedPath) {
      return false;
    }

    const nextName = getBaseName(savedPath);
    const nextDir = getDirName(savedPath);
    commitState((prev) => ({
      ...prev,
      filePath: savedPath,
      fileName: nextName,
      dirPath: nextDir,
      isDirty: false,
      externalChangePending: false,
    }));
    api.watchFile(savedPath);
    return true;
  }, [api, commitState]);

  const saveFile = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.filePath) {
      return saveFileAs();
    }

    const raw =
      current.mode === 'source'
        ? current.sourceRaw
        : joinFrontmatter(current.frontmatter, current.body, current.lineEnding);

    const ok = await api.saveFile(current.filePath, raw);
    if (!ok) {
      return false;
    }

    commitState((prev) => ({
      ...prev,
      isDirty: false,
      externalChangePending: false,
    }));
    return true;
  }, [api, commitState, saveFileAs]);

  const confirmDiscardIfDirty = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.isDirty) {
      return true;
    }
    const choice = await api.confirmDiscard(current.fileName);
    if (choice === 'cancel') {
      return false;
    }
    if (choice === 'discard') {
      return true;
    }
    return saveFile();
  }, [api, saveFile]);

  const applyOpenedFile = useCallback(
    (opened: OpenedFile) => {
      const split = splitFrontmatter(opened.content);
      commitState((prev) => ({
        ...prev,
        filePath: opened.filePath,
        fileName: opened.fileName,
        dirPath: opened.dirPath,
        frontmatter: split.frontmatter,
        body: split.body,
        lineEnding: split.lineEnding,
        sourceRaw: opened.content,
        isDirty: false,
        externalChangePending: false,
      }));
      api.watchFile(opened.filePath);
    },
    [api, commitState],
  );

  const openFilePath = useCallback(
    async (targetPath: string): Promise<boolean> => {
      const allowed = await confirmDiscardIfDirty();
      if (!allowed) {
        return false;
      }
      const opened = await api.readFile(targetPath);
      applyOpenedFile(opened);
      return true;
    },
    [api, applyOpenedFile, confirmDiscardIfDirty],
  );

  const openFileDialog = useCallback(async (): Promise<boolean> => {
    const allowed = await confirmDiscardIfDirty();
    if (!allowed) {
      return false;
    }
    const opened = await api.openFileDialog();
    if (!opened) {
      return false;
    }
    applyOpenedFile(opened);
    return true;
  }, [api, applyOpenedFile, confirmDiscardIfDirty]);

  const openNew = useCallback(async (): Promise<boolean> => {
    const allowed = await confirmDiscardIfDirty();
    if (!allowed) {
      return false;
    }
    api.stopWatchFile();
    commitState((prev) => ({
      ...createInitialState(),
      mode: prev.mode,
    }));
    return true;
  }, [api, commitState, confirmDiscardIfDirty]);

  const updateBody = useCallback(
    (nextBody: string) => {
      commitState((prev) => {
        if (prev.body === nextBody) {
          return prev;
        }
        return {
          ...prev,
          body: nextBody,
          isDirty: true,
        };
      });
    },
    [commitState],
  );

  const updateFromSource = useCallback(
    (nextRaw: string) => {
      commitState((prev) => {
        if (prev.sourceRaw === nextRaw) {
          return prev;
        }
        return {
          ...prev,
          sourceRaw: nextRaw,
          isDirty: true,
        };
      });
    },
    [commitState],
  );

  const setMode = useCallback(
    (nextMode: EditorMode) => {
      commitState((prev) => {
        if (prev.mode === nextMode) {
          return prev;
        }
        if (nextMode === 'source') {
          const sourceRaw = joinFrontmatter(
            prev.frontmatter,
            prev.body,
            prev.lineEnding,
          );
          return {
            ...prev,
            mode: 'source',
            sourceRaw,
          };
        }
        const split = splitFrontmatter(prev.sourceRaw);
        return {
          ...prev,
          mode: 'wysiwyg',
          frontmatter: split.frontmatter,
          body: split.body,
          lineEnding: split.lineEnding,
        };
      });
    },
    [commitState],
  );

  const toggleMode = useCallback(() => {
    setMode(stateRef.current.mode === 'wysiwyg' ? 'source' : 'wysiwyg');
  }, [setMode]);

  const reloadFromDisk = useCallback(async (): Promise<void> => {
    const currentPath = stateRef.current.filePath;
    if (!currentPath) {
      return;
    }
    const opened = await api.readFile(currentPath);
    applyOpenedFile(opened);
  }, [api, applyOpenedFile]);

  const ignoreExternalChange = useCallback(() => {
    commitState((prev) =>
      prev.externalChangePending ? { ...prev, externalChangePending: false } : prev,
    );
  }, [commitState]);

  const markExternalChange = useCallback(() => {
    commitState((prev) =>
      prev.externalChangePending ? prev : { ...prev, externalChangePending: true },
    );
  }, [commitState]);

  return {
    filePath: state.filePath,
    fileName: state.fileName,
    dirPath: state.dirPath,
    frontmatter: state.frontmatter,
    body: state.body,
    lineEnding: state.lineEnding,
    isDirty: state.isDirty,
    mode: state.mode,
    externalChangePending: state.externalChangePending,
    openFilePath,
    openFileDialog,
    openNew,
    updateBody,
    updateFromSource,
    getFullRawMarkdown,
    saveFile,
    saveFileAs,
    toggleMode,
    setMode,
    reloadFromDisk,
    ignoreExternalChange,
    markExternalChange,
  };
}
