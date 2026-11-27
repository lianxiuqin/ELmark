// @vitest-environment jsdom
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElmarkApi, FindResult, MenuAction } from '../../../src/shared/ipc';
import { SourceEditor, type SourceEditorHandle } from '../../../src/renderer/src/components/SourceEditor';
import { useDocumentState } from '../../../src/renderer/src/hooks/useDocumentState';

vi.mock('../../../src/renderer/src/components/WysiwygEditor', async () => {
  const React = await import('react');
  const WysiwygEditor = React.forwardRef(function MockWysiwygEditor(
    props: {
      markdown: string;
      onChange: (nextMarkdown: string) => void;
    },
    ref: React.ForwardedRef<any>,
  ) {
    React.useImperativeHandle(ref, () => ({
      insertTable: vi.fn(),
      insertMermaid: vi.fn(),
      scrollToHeadingIndex: vi.fn(),
      getMarkdown: () => props.markdown,
      getScrollRatio: () => 0,
      setScrollRatio: vi.fn(),
    }));
    return (
      <div
        data-testid="mock-wysiwyg"
        onClick={() => props.onChange(`${props.markdown}\n# Edited`)}
      >
        {props.markdown}
      </div>
    );
  });
  return { WysiwygEditor };
});

import { App } from '../../../src/renderer/src/App';

afterEach(() => {
  cleanup();
});

function createMockApi(overrides: Partial<ElmarkApi> = {}): ElmarkApi {
  return {
    readFile: vi.fn().mockResolvedValue({
      filePath: 'E:\\docs\\a.md',
      fileName: 'a.md',
      dirPath: 'E:\\docs',
      content: '---\ntitle: KeepMe\n---\n# Hello\n\n```mermaid\ngraph TD\n  A-->B\n```\n',
    }),
    openFileDialog: vi.fn().mockResolvedValue(null),
    saveFile: vi.fn().mockResolvedValue(true),
    saveFileAs: vi.fn().mockResolvedValue('E:\\docs\\saved.md'),
    openFolderDialog: vi.fn().mockResolvedValue(null),
    readFolderTree: vi.fn().mockResolvedValue([]),
    confirmDiscard: vi.fn().mockResolvedValue('cancel'),
    watchFile: vi.fn(),
    stopWatchFile: vi.fn(),
    onExternalFileChange: vi.fn().mockReturnValue(() => {}),
    popupMenu: vi.fn(),
    onMenuAction: vi.fn().mockReturnValue(() => {}),
    findInPage: vi.fn(),
    stopFindInPage: vi.fn(),
    onFindResult: vi.fn().mockReturnValue(() => {}),
    exportPdf: vi.fn().mockResolvedValue(null),
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    getInitialFile: vi.fn().mockResolvedValue(null),
    newWindow: vi.fn(),
    ...overrides,
  };
}

describe('useDocumentState (Review Focus #4 & #5)', () => {
  it('preserves YAML frontmatter and Mermaid across WYSIWYG -> Source -> WYSIWYG toggle and save', async () => {
    const api = createMockApi();
    const { result } = renderHook(() => useDocumentState(api));

    await act(async () => { await result.current.openFilePath('E:\\docs\\a.md'); });
    expect(result.current.frontmatter).toBe('title: KeepMe');
    expect(result.current.isDirty).toBe(false);

    act(() => { result.current.toggleMode(); });
    expect(result.current.mode).toBe('source');
    expect(result.current.getFullRawMarkdown()).toContain('---\ntitle: KeepMe\n---');

    act(() => { result.current.updateFromSource('---\ntitle: KeepMe\n---\n# Updated\n\n```mermaid\ngraph TD\n  A-->B\n```\n'); });
    expect(result.current.isDirty).toBe(true);

    act(() => { result.current.toggleMode(); });
    expect(result.current.mode).toBe('wysiwyg');
    expect(result.current.frontmatter).toBe('title: KeepMe');
    expect(result.current.body).toContain('# Updated');

    await act(async () => { await result.current.saveFile(); });
    expect(api.saveFile).toHaveBeenCalledWith('E:\\docs\\a.md', expect.stringContaining('title: KeepMe'));
    expect(result.current.isDirty).toBe(false);
  });

  it('blocks switching files when dirty and user clicks cancel on discard dialog', async () => {
    const api = createMockApi({ confirmDiscard: vi.fn().mockResolvedValue('cancel') });
    const { result } = renderHook(() => useDocumentState(api));

    await act(async () => { await result.current.openFilePath('E:\\docs\\a.md'); });
    act(() => { result.current.updateBody('# Unsaved edit'); });
    expect(result.current.isDirty).toBe(true);

    await act(async () => { await result.current.openFilePath('E:\\docs\\b.md'); });
    expect(api.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(result.current.filePath).toBe('E:\\docs\\a.md');
  });

  it('saves before switching when user clicks save, and aborts if untitled save-as cancels', async () => {
    const api = createMockApi({
      confirmDiscard: vi.fn().mockResolvedValue('save'),
      saveFileAs: vi.fn().mockResolvedValue(null),
    });
    const { result } = renderHook(() => useDocumentState(api));

    act(() => { result.current.updateBody('# Untitled draft'); });
    await act(async () => {
      const ok = await result.current.openFilePath('E:\\docs\\a.md');
      expect(ok).toBe(false);
    });
    expect(result.current.filePath).toBeNull();

    (api.saveFileAs as ReturnType<typeof vi.fn>).mockResolvedValueOnce('E:\\docs\\draft.md');
    await act(async () => {
      const ok = await result.current.openFilePath('E:\\docs\\a.md');
      expect(ok).toBe(true);
    });
    expect(api.saveFileAs).toHaveBeenCalledWith('# Untitled draft', '无标题.md');
    expect(result.current.filePath).toBe('E:\\docs\\a.md');
  });

  it('handles external change banner reload and ignore cleanly', async () => {
    const api = createMockApi();
    const { result } = renderHook(() => useDocumentState(api));

    await act(async () => { await result.current.openFilePath('E:\\docs\\a.md'); });
    act(() => { result.current.markExternalChange(); });
    expect(result.current.externalChangePending).toBe(true);

    act(() => { result.current.ignoreExternalChange(); });
    expect(result.current.externalChangePending).toBe(false);

    (api.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      filePath: 'E:\\docs\\a.md',
      fileName: 'a.md',
      dirPath: 'E:\\docs',
      content: '# Externally Updated',
    });
    act(() => { result.current.markExternalChange(); });
    await act(async () => { await result.current.reloadFromDisk(); });
    expect(result.current.body).toBe('# Externally Updated');
    expect(result.current.externalChangePending).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });
});

describe('SourceEditor', () => {
  it('supports case-insensitive findText navigation across matches', () => {
    const ref = createRef<SourceEditorHandle>();
    render(<SourceEditor ref={ref} value={'Alpha beta\nalpha gamma\nALPHA'} onChange={vi.fn()} />);

    const first = ref.current!.findText('alpha', true, false);
    expect(first).toEqual({ activeMatchOrdinal: 1, matches: 3, finalUpdate: true });

    const second = ref.current!.findText('alpha', true, true);
    expect(second).toEqual({ activeMatchOrdinal: 2, matches: 3, finalUpdate: true });

    const prevWrapped = ref.current!.findText('alpha', false, true);
    expect(prevWrapped).toEqual({ activeMatchOrdinal: 1, matches: 3, finalUpdate: true });

    const none = ref.current!.findText('missing', true, false);
    expect(none).toEqual({ activeMatchOrdinal: 0, matches: 0, finalUpdate: true });
  });
});

describe('App integration', () => {
  it('loads initial file + parent folder tree, toggles source mode, finds in source, and guards unload', async () => {
    let menuCallback: ((action: MenuAction) => void) | null = null;
    let findCallback: ((res: FindResult) => void) | null = null;

    const api = createMockApi({
      getInitialFile: vi.fn().mockResolvedValue('E:\\docs\\a.md'),
      readFolderTree: vi.fn().mockResolvedValue([
        { name: 'a.md', path: 'E:\\docs\\a.md', type: 'file' },
      ]),
      onMenuAction: vi.fn((cb) => {
        menuCallback = cb;
        return () => {};
      }),
      onFindResult: vi.fn((cb) => {
        findCallback = cb;
        return () => {};
      }),
      getPathForFile: vi.fn((file: File) => `E:\\dropped\\${file.name}`),
    });
    window.elmark = api;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('a.md')).toBeTruthy();
    });
    expect(api.readFolderTree).toHaveBeenCalledWith('E:\\docs');
    expect(document.title).toBe('a.md — ELmark');

    // Toggle sidebar via Ctrl+Shift+L
    fireEvent.keyDown(window, { key: 'L', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('tab', { name: '文件' })).toBeTruthy();

    // Toggle source mode via Ctrl+/
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.getByText('源码')).toBeTruthy();
    const textarea = screen.getByLabelText('Markdown 源码编辑器') as HTMLTextAreaElement;
    expect(textarea.value).toContain('title: KeepMe');

    // Open FindBar in Source Mode via Ctrl+F and search
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    const searchInput = screen.getByLabelText('查找关键词');
    fireEvent.change(searchInput, { target: { value: 'KeepMe' } });
    expect(screen.getByText('1 / 1')).toBeTruthy();

    // Edit in source mode -> dirty title + beforeunload preventDefault
    fireEvent.change(textarea, { target: { value: '---\ntitle: KeepMe\n---\n# Changed' } });
    expect(document.title).toBe('a.md * — ELmark');
    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);

    // Save via menu action
    await act(async () => {
      menuCallback?.('file:save');
    });
    expect(api.saveFile).toHaveBeenCalledWith('E:\\docs\\a.md', '---\ntitle: KeepMe\n---\n# Changed');
    expect(document.title).toBe('a.md — ELmark');

    // Switch back to WYSIWYG and test findInPage + result callback
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    await waitFor(() => {
      expect(api.findInPage).toHaveBeenCalledWith('KeepMe', true, false);
    });
    act(() => {
      findCallback?.({ activeMatchOrdinal: 1, matches: 2, finalUpdate: true });
    });
    expect(screen.getByText('1 / 2')).toBeTruthy();

    // Drag and drop a .md file
    const appShell = document.querySelector('.elmark-app')!;
    const droppedFile = new File(['# Dropped'], 'dropped.md', { type: 'text/markdown' });
    fireEvent.drop(appShell, {
      dataTransfer: {
        files: [droppedFile],
        types: ['Files'],
      },
    });
    await waitFor(() => {
      expect(api.readFile).toHaveBeenCalledWith('E:\\dropped\\dropped.md');
    });
  });
});
