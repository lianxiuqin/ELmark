// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMermaidDiagram } from '../../../src/renderer/src/core/mermaidRenderer';
import { TableToolbar } from '../../../src/renderer/src/components/TableToolbar';
import { LinkBubble } from '../../../src/renderer/src/components/LinkBubble';
import {
  WysiwygEditor,
  type WysiwygEditorHandle,
} from '../../../src/renderer/src/components/WysiwygEditor';

afterEach(() => {
  cleanup();
});

describe('renderMermaidDiagram (Review Focus #5)', () => {
  it('returns graceful error object instead of throwing when mermaid syntax is invalid', async () => {
    const res = await renderMermaidDiagram('graph TD\n A ---> ???', 'test-bad');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
  });

  it('returns graceful error for empty mermaid source', async () => {
    const res = await renderMermaidDiagram('   ', 'test-empty');
    expect(res.ok).toBe(false);
  });
});

describe('TableToolbar & LinkBubble micro-controls', () => {
  it('stays hidden when visible=false and invokes row/col/align callbacks when visible', () => {
    const onAddRow = vi.fn();
    const onDeleteRow = vi.fn();
    const onAddCol = vi.fn();
    const onDeleteCol = vi.fn();
    const onAlign = vi.fn();
    const { rerender } = render(
      <TableToolbar
        visible={false}
        top={0}
        left={0}
        onAddRow={onAddRow}
        onDeleteRow={onDeleteRow}
        onAddCol={onAddCol}
        onDeleteCol={onDeleteCol}
        onAlign={onAlign}
      />,
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    rerender(
      <TableToolbar
        visible={true}
        top={20}
        left={10}
        onAddRow={onAddRow}
        onDeleteRow={onDeleteRow}
        onAddCol={onAddCol}
        onDeleteCol={onDeleteCol}
        onAlign={onAlign}
      />,
    );
    fireEvent.click(screen.getByTitle('添加行'));
    fireEvent.click(screen.getByTitle('删除行'));
    fireEvent.click(screen.getByTitle('添加列'));
    fireEvent.click(screen.getByTitle('删除列'));
    fireEvent.click(screen.getByTitle('左对齐'));
    fireEvent.click(screen.getByTitle('居中对齐'));
    fireEvent.click(screen.getByTitle('右对齐'));
    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledTimes(1);
    expect(onAddCol).toHaveBeenCalledTimes(1);
    expect(onDeleteCol).toHaveBeenCalledTimes(1);
    expect(onAlign).toHaveBeenNthCalledWith(1, 'left');
    expect(onAlign).toHaveBeenNthCalledWith(2, 'center');
    expect(onAlign).toHaveBeenNthCalledWith(3, 'right');
  });

  it('edits link URL, opens external link, and applies on submit', () => {
    const onApply = vi.fn();
    const onOpenExternal = vi.fn();
    const onClose = vi.fn();
    render(
      <LinkBubble
        visible={true}
        top={10}
        left={10}
        href="https://old.test"
        onApply={onApply}
        onOpenExternal={onOpenExternal}
        onClose={onClose}
      />,
    );
    const input = screen.getByDisplayValue('https://old.test');
    fireEvent.change(input, { target: { value: 'https://new.test' } });
    fireEvent.click(screen.getByTitle('打开链接'));
    expect(onOpenExternal).toHaveBeenCalledWith('https://new.test');
    fireEvent.submit(input.closest('form')!);
    expect(onApply).toHaveBeenCalledWith('https://new.test');
  });
});

describe('WysiwygEditor integration', () => {
  it('mounts Milkdown editor, resolves local images, sanitizes HTML blocks, hides comments, and syncs external markdown without onChange loops', async () => {
    const onChange = vi.fn();
    const onOpenExternalUrl = vi.fn();
    const ref = createRef<WysiwygEditorHandle>();
    const md = [
      '# Title',
      '',
      '![pic](./assets/demo.png)',
      '',
      '<!-- hidden comment -->',
      '',
      '<details><summary>More</summary><script>alert(1)</script><p>Safe</p></details>',
      '',
      '[Docs](https://example.com/docs)',
      '',
      '```ts',
      'const x = 42;',
      '```',
    ].join('\n');

    const { container, rerender } = render(
      <WysiwygEditor
        ref={ref}
        markdown={md}
        documentDir="E:\\notes"
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull();
    });

    const img = container.querySelector(
      '.ProseMirror img:not(.ProseMirror-separator)',
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(
      `elmark-local://asset?path=${encodeURIComponent('E:\\notes\\assets\\demo.png')}`,
    );

    const htmlComment = container.querySelector('.elmark-html-comment') as HTMLElement | null;
    expect(htmlComment).not.toBeNull();
    expect(htmlComment?.style.display).toBe('none');

    const htmlBlock = container.querySelector('.elmark-html-block');
    expect(htmlBlock).not.toBeNull();
    expect(htmlBlock?.innerHTML).toContain('<details');
    expect(htmlBlock?.innerHTML).not.toContain('<script');

    // Syntax highlighting decoration applied inside standard code block
    expect(container.querySelector('.elmark-code-block .hljs-keyword')).not.toBeNull();

    // Standard code block language input is hidden by default and reveals on hover/focus
    const codeBlockEl = container.querySelector('.elmark-code-block') as HTMLElement;
    const langInput = codeBlockEl.querySelector('input[aria-label="代码块语言"]') as HTMLInputElement;
    expect(langInput.style.opacity).toBe('0');
    fireEvent.mouseEnter(codeBlockEl);
    expect(langInput.style.opacity).toBe('1');
    fireEvent.mouseLeave(codeBlockEl);
    expect(langInput.style.opacity).toBe('0');

    // Ctrl+Click opens external link; plain click shows LinkBubble; clicking outside closes it
    const anchor = container.querySelector('.ProseMirror a') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    fireEvent.click(anchor!, { ctrlKey: true });
    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://example.com/docs');

    fireEvent.click(anchor!);
    expect(screen.getByDisplayValue('https://example.com/docs')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();

    // Ctrl+K at the very end of the document does not throw RangeError
    const proseMirror = container.querySelector('.ProseMirror') as HTMLElement;
    fireEvent.keyDown(proseMirror, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('链接地址'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    expect(ref.current?.getMarkdown()).toContain('# Title');
    expect(onChange).not.toHaveBeenCalled();

    // External CRLF/normalized markdown update should sync without triggering onChange after debounce
    rerender(
      <WysiwygEditor
        ref={ref}
        markdown={'# Updated Heading\r\n\r\n* item one\r\n* item two\r\n'}
        documentDir="E:\\notes"
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );
    await waitFor(() => {
      expect(ref.current?.getMarkdown()).toContain('# Updated Heading');
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles async mount race when markdown prop changes before editor.create() resolves', async () => {
    const onChange = vi.fn();
    const onOpenExternalUrl = vi.fn();
    const ref = createRef<WysiwygEditorHandle>();

    const { container, rerender } = render(
      <WysiwygEditor
        ref={ref}
        markdown="# Initial Stale"
        documentDir={null}
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );

    // Immediately update markdown before async Milkdown creation settles
    rerender(
      <WysiwygEditor
        ref={ref}
        markdown="# Latest After Race"
        documentDir={null}
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')?.textContent).toContain(
        'Latest After Race',
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(ref.current?.getMarkdown()).toContain('Latest After Race');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps inline HTML inline while rendering block HTML as block, and refreshes images when documentDir changes', async () => {
    const onChange = vi.fn();
    const onOpenExternalUrl = vi.fn();
    const md = [
      'Press <kbd>Ctrl</kbd> now.',
      '',
      '<details><summary>Open</summary><img src="./sub/pic.png" alt="sub"></details>',
      '',
      '![hero](./hero.png)',
    ].join('\n');

    const { container, rerender } = render(
      <WysiwygEditor
        markdown={md}
        documentDir={null}
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull();
    });

    const htmlBlocks = Array.from(
      container.querySelectorAll('.elmark-html-block'),
    ) as HTMLElement[];
    const inlineHtml = htmlBlocks.find((el) => el.innerHTML.includes('<kbd>'));
    const blockHtml = htmlBlocks.find((el) => el.innerHTML.includes('<details'));
    expect(inlineHtml?.style.display).toBe('inline');
    expect(blockHtml?.style.display).toBe('block');

    const mdImg = container.querySelector(
      '.ProseMirror img:not(.ProseMirror-separator):not([alt="sub"])',
    ) as HTMLImageElement | null;
    expect(mdImg?.getAttribute('src')).toBeNull();

    // Update documentDir without changing markdown
    rerender(
      <WysiwygEditor
        markdown={md}
        documentDir="D:\\docs"
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );

    await waitFor(() => {
      expect(mdImg?.getAttribute('src')).toBe(
        `elmark-local://asset?path=${encodeURIComponent('D:\\docs\\hero.png')}`,
      );
    });
    const htmlImg = blockHtml?.querySelector('img') as HTMLImageElement | null;
    expect(htmlImg?.getAttribute('src')).toBe(
      `elmark-local://asset?path=${encodeURIComponent('D:\\docs\\sub\\pic.png')}`,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports Mermaid dual-state NodeView (error fallback, click-to-edit, internal click stability, Escape-to-collapse)', async () => {
    const onChange = vi.fn();
    const onOpenExternalUrl = vi.fn();
    const md = ['```mermaid', 'graph TD', ' A ---> ???', '```'].join('\n');

    const { container } = render(
      <WysiwygEditor
        markdown={md}
        documentDir={null}
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );

    await waitFor(() => {
      const errEl = container.querySelector('.elmark-mermaid-error') as HTMLElement | null;
      expect(errEl).not.toBeNull();
      expect(errEl?.style.display).not.toBe('none');
      expect((errEl?.textContent ?? '').length).toBeGreaterThan(0);
    });

    const mermaidBox = container.querySelector('.elmark-mermaid') as HTMLElement;
    const errBanner = container.querySelector('.elmark-mermaid-error') as HTMLElement;
    const textarea = container.querySelector('.elmark-mermaid-source') as HTMLTextAreaElement;
    expect(textarea.style.display).toBe('none');

    fireEvent.click(errBanner);
    expect(textarea.style.display).toBe('block');

    // Internal focus movement inside .elmark-mermaid should not collapse edit mode
    const langInput = mermaidBox.querySelector('input[aria-label="代码块语言"]') as HTMLInputElement;
    fireEvent.focusOut(textarea, { relatedTarget: langInput });
    expect(textarea.style.display).toBe('block');

    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(textarea.style.display).toBe('none');
  });
});
