import type { FileTreeNode, OutlineItem } from '../../../shared/ipc';
import { FileTree } from './FileTree';
import { OutlineView } from './OutlineView';

export interface SidebarProps {
  visible: boolean;
  activeTab: 'files' | 'outline';
  onTabChange: (tab: 'files' | 'outline') => void;
  folderName: string | null;
  tree: FileTreeNode[];
  activeFilePath: string | null;
  outline: OutlineItem[];
  activeHeadingIndex: number;
  onOpenFolder: () => void;
  onSelectFile: (filePath: string) => void;
  onSelectHeading: (index: number) => void;
}

/**
 * Collapsible left sidebar switching between the FileTree and OutlineView tabs.
 */
export function Sidebar({
  visible,
  activeTab,
  onTabChange,
  folderName,
  tree,
  activeFilePath,
  outline,
  activeHeadingIndex,
  onOpenFolder,
  onSelectFile,
  onSelectHeading,
}: SidebarProps) {
  if (!visible) {
    return null;
  }

  return (
    <aside className="elmark-sidebar" aria-label="侧边栏">
      <div className="elmark-sidebar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'files'}
          className={`elmark-sidebar-tab${activeTab === 'files' ? ' is-active' : ''}`}
          onClick={() => onTabChange('files')}
        >
          文件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'outline'}
          className={`elmark-sidebar-tab${activeTab === 'outline' ? ' is-active' : ''}`}
          onClick={() => onTabChange('outline')}
        >
          大纲
        </button>
      </div>
      <div className="elmark-sidebar-content" role="tabpanel">
        {activeTab === 'files' ? (
          <FileTree
            folderName={folderName}
            tree={tree}
            activeFilePath={activeFilePath}
            onOpenFolder={onOpenFolder}
            onSelectFile={onSelectFile}
          />
        ) : (
          <OutlineView
            outline={outline}
            activeHeadingIndex={activeHeadingIndex}
            onSelectHeading={onSelectHeading}
          />
        )}
      </div>
    </aside>
  );
}
