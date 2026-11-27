// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../../../src/renderer/src/components/TitleBar';
import { FileTree } from '../../../src/renderer/src/components/FileTree';
import { OutlineView } from '../../../src/renderer/src/components/OutlineView';
import { Sidebar } from '../../../src/renderer/src/components/Sidebar';
import { FrontmatterBar } from '../../../src/renderer/src/components/FrontmatterBar';
import { FindBar } from '../../../src/renderer/src/components/FindBar';
import { ExternalChangeBanner } from '../../../src/renderer/src/components/ExternalChangeBanner';

afterEach(() => {
  cleanup();
});

describe('Shell UI components', () => {
  it('TitleBar shows filename with dirty asterisk and triggers menu + sidebar callbacks', () => {
    const onOpenMenu = vi.fn();
    const onToggleSidebar = vi.fn();
    render(
      <TitleBar
        fileName="readme.md"
        isDirty={true}
        isSourceMode={false}
        sidebarVisible={true}
        onOpenMenu={onOpenMenu}
        onToggleSidebar={onToggleSidebar}
      />,
    );
    expect(screen.getByText(/readme\.md \*/)).toBeTruthy();
    fireEvent.click(screen.getByTitle('菜单'));
    fireEvent.click(screen.getByTitle('切换侧边栏'));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('TitleBar passes menu button bottom-left coordinates and shows 源码 badge in source mode', () => {
    const onOpenMenu = vi.fn();
    render(
      <TitleBar
        fileName="notes.md"
        isDirty={false}
        isSourceMode={true}
        sidebarVisible={false}
        onOpenMenu={onOpenMenu}
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText('源码')).toBeTruthy();
    expect(screen.queryByText(/notes\.md \*/)).toBeNull();
    expect(screen.getByText('notes.md')).toBeTruthy();

    const menuBtn = screen.getByTitle('菜单');
    vi.spyOn(menuBtn, 'getBoundingClientRect').mockReturnValue({
      left: 12.4,
      bottom: 33.7,
      top: 7.7,
      right: 60.4,
      width: 48,
      height: 26,
      x: 12.4,
      y: 7.7,
      toJSON: () => ({}),
    });
    fireEvent.click(menuBtn);
    expect(onOpenMenu).toHaveBeenCalledWith(12, 34);
  });

  it('Sidebar switches between 文件 and 大纲 tabs and fires selection callbacks', () => {
    const onTabChange = vi.fn();
    const onSelectFile = vi.fn();
    const onSelectHeading = vi.fn();
    const tree = [{ name: 'guide.md', path: 'E:\\docs\\guide.md', type: 'file' as const }];
    const outline = [{ id: 'heading-0', level: 2 as const, text: '安装步骤', index: 0 }];

    const { rerender } = render(
      <Sidebar
        visible={true}
        activeTab="files"
        onTabChange={onTabChange}
        folderName="docs"
        tree={tree}
        activeFilePath={null}
        outline={outline}
        activeHeadingIndex={0}
        onOpenFolder={vi.fn()}
        onSelectFile={onSelectFile}
        onSelectHeading={onSelectHeading}
      />,
    );
    fireEvent.click(screen.getByText('guide.md'));
    expect(onSelectFile).toHaveBeenCalledWith('E:\\docs\\guide.md');
    fireEvent.click(screen.getByRole('tab', { name: '大纲' }));
    expect(onTabChange).toHaveBeenCalledWith('outline');

    rerender(
      <Sidebar
        visible={true}
        activeTab="outline"
        onTabChange={onTabChange}
        folderName="docs"
        tree={tree}
        activeFilePath={null}
        outline={outline}
        activeHeadingIndex={0}
        onOpenFolder={vi.fn()}
        onSelectFile={onSelectFile}
        onSelectHeading={onSelectHeading}
      />,
    );
    fireEvent.click(screen.getByText('安装步骤'));
    expect(onSelectHeading).toHaveBeenCalledWith(0);

    rerender(
      <Sidebar
        visible={false}
        activeTab="outline"
        onTabChange={onTabChange}
        folderName="docs"
        tree={tree}
        activeFilePath={null}
        outline={outline}
        activeHeadingIndex={0}
        onOpenFolder={vi.fn()}
        onSelectFile={onSelectFile}
        onSelectHeading={onSelectHeading}
      />,
    );
    expect(screen.queryByRole('tab', { name: '大纲' })).toBeNull();
  });

  it('FileTree renders empty CTA when folderName is null and expands/collapses nested directories', () => {
    const onOpenFolder = vi.fn();
    const onSelectFile = vi.fn();
    const { rerender } = render(
      <FileTree
        folderName={null}
        tree={[]}
        activeFilePath={null}
        onOpenFolder={onOpenFolder}
        onSelectFile={onSelectFile}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }));
    expect(onOpenFolder).toHaveBeenCalledTimes(1);

    const tree = [
      {
        name: 'sub',
        path: 'E:\\docs\\sub',
        type: 'directory' as const,
        children: [
          {
            name: 'nested.md',
            path: 'E:\\docs\\sub\\nested.md',
            type: 'file' as const,
          },
        ],
      },
    ];
    rerender(
      <FileTree
        folderName="docs"
        tree={tree}
        activeFilePath={'E:\\docs\\sub\\nested.md'}
        onOpenFolder={onOpenFolder}
        onSelectFile={onSelectFile}
      />,
    );

    const nestedBtn = screen.getByRole('button', { name: /nested\.md/ });
    expect(nestedBtn.className).toContain('is-active');
    fireEvent.click(nestedBtn);
    expect(onSelectFile).toHaveBeenCalledWith('E:\\docs\\sub\\nested.md');

    // Collapse root directory
    fireEvent.click(screen.getByRole('button', { name: /sub/ }));
    expect(screen.queryByRole('button', { name: /nested\.md/ })).toBeNull();

    // Expand again
    fireEvent.click(screen.getByRole('button', { name: /sub/ }));
    expect(screen.getByRole('button', { name: /nested\.md/ })).toBeTruthy();
  });

  it('OutlineView renders empty hint and heading levels with active state', () => {
    const onSelectHeading = vi.fn();
    const { rerender } = render(
      <OutlineView outline={[]} activeHeadingIndex={0} onSelectHeading={onSelectHeading} />,
    );
    expect(screen.getByText('暂无大纲')).toBeTruthy();

    rerender(
      <OutlineView
        outline={[
          { id: 'h-0', level: 1, text: '标题一', index: 0 },
          { id: 'h-1', level: 3, text: '三级标题', index: 1 },
        ]}
        activeHeadingIndex={1}
        onSelectHeading={onSelectHeading}
      />,
    );
    const activeItem = screen.getByRole('button', { name: '三级标题' });
    expect(activeItem.getAttribute('data-level')).toBe('3');
    expect(activeItem.className).toContain('is-active');
    fireEvent.click(screen.getByRole('button', { name: '标题一' }));
    expect(onSelectHeading).toHaveBeenCalledWith(0);
  });

  it('FrontmatterBar stays collapsed by default and reveals YAML on click', () => {
    const onEditInSource = vi.fn();
    const { rerender } = render(
      <FrontmatterBar frontmatter={'title: Demo\nauthor: ELmark'} onEditInSource={onEditInSource} />,
    );
    expect(screen.queryByText(/author: ELmark/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /YAML Frontmatter/ }));
    expect(screen.getByText(/author: ELmark/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '在源码模式编辑' }));
    expect(onEditInSource).toHaveBeenCalledTimes(1);

    rerender(<FrontmatterBar frontmatter={null} onEditInSource={onEditInSource} />);
    expect(screen.queryByRole('button', { name: /YAML Frontmatter/ })).toBeNull();
  });

  it('FindBar renders match ordinal, supports Enter/Shift+Enter, and closes on Escape', () => {
    const onClose = vi.fn();
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onQueryChange = vi.fn();
    const { rerender } = render(
      <FindBar
        visible={true}
        query="typora"
        result={{ activeMatchOrdinal: 2, matches: 5, finalUpdate: true }}
        onQueryChange={onQueryChange}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('2 / 5')).toBeTruthy();
    const input = screen.getByDisplayValue('typora');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: 'elmark' } });
    expect(onQueryChange).toHaveBeenCalledWith('elmark');

    rerender(
      <FindBar
        visible={true}
        query="missing"
        result={null}
        onQueryChange={onQueryChange}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('0 / 0')).toBeTruthy();

    rerender(
      <FindBar
        visible={false}
        query="missing"
        result={null}
        onQueryChange={onQueryChange}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
      />,
    );
    expect(screen.queryByDisplayValue('missing')).toBeNull();
  });

  it('ExternalChangeBanner renders reload/ignore buttons only when visible', () => {
    const onReload = vi.fn();
    const onIgnore = vi.fn();
    const { rerender } = render(
      <ExternalChangeBanner visible={false} onReload={onReload} onIgnore={onIgnore} />,
    );
    expect(screen.queryByText(/重新加载/)).toBeNull();
    rerender(<ExternalChangeBanner visible={true} onReload={onReload} onIgnore={onIgnore} />);
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    fireEvent.click(screen.getByRole('button', { name: '忽略' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });
});
