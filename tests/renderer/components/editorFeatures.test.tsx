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

    // Ctrl+Click opens external link; plain click shows LinkBubble
    const anchor = container.querySelector('.ProseMirror a') as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    fireEvent.click(anchor!, { ctrlKey: true });
    expect(onOpenExternalUrl).toHaveBeenCalledWith('https://example.com/docs');

    fireEvent.click(anchor!);
    expect(screen.getByDisplayValue('https://example.com/docs')).toBeTruthy();

    expect(ref.current?.getMarkdown()).toContain('# Title');
    expect(onChange).not.toHaveBeenCalled();

    // External markdown update should sync without triggering onChange
    rerender(
      <WysiwygEditor
        ref={ref}
        markdown="# Updated Heading"
        documentDir="E:\\notes"
        onChange={onChange}
        onOpenExternalUrl={onOpenExternalUrl}
      />,
    );
    await waitFor(() => {
      expect(ref.current?.getMarkdown()).toContain('# Updated Heading');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports Mermaid dual-state NodeView (error fallback, click-to-edit, Escape-to-collapse)', async () => {
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

    const errBanner = container.querySelector('.elmark-mermaid-error') as HTMLElement;
    const textarea = container.querySelector('.elmark-mermaid-source') as HTMLTextAreaElement;
    expect(textarea.style.display).toBe('none');

    fireEvent.click(errBanner);
    expect(textarea.style.display).toBe('block');

    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(textarea.style.display).toBe('none');
  });
});
