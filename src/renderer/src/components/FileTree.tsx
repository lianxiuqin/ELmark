import { useState } from 'react';
import type { FileTreeNode } from '../../../shared/ipc';

export interface FileTreeProps {
  folderName: string | null;
  tree: FileTreeNode[];
  activeFilePath: string | null;
  onOpenFolder: () => void;
  onSelectFile: (filePath: string) => void;
}

interface TreeNodeItemProps {
  node: FileTreeNode;
  depth: number;
  activeFilePath: string | null;
  onSelectFile: (filePath: string) => void;
}

function TreeNodeItem({ node, depth, activeFilePath, onSelectFile }: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const indentPx = 14 + depth * 14;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          className="elmark-tree-item"
          aria-expanded={expanded}
          title={node.path}
          style={{ paddingLeft: `${indentPx}px` }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span style={{ marginRight: '6px', color: 'var(--text-muted)' }}>
            {expanded ? '▾' : '▸'}
          </span>
          <span>{node.name}</span>
        </button>
        {expanded && node.children
          ? node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onSelectFile={onSelectFile}
              />
            ))
          : null}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;

  return (
    <button
      type="button"
      className={`elmark-tree-item${isActive ? ' is-active' : ''}`}
      title={node.path}
      style={{ paddingLeft: `${indentPx}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      {node.name}
    </button>
  );
}

/**
 * Recursive collapsible Markdown file tree with empty-folder prompt.
 */
export function FileTree({
  folderName,
  tree,
  activeFilePath,
  onOpenFolder,
  onSelectFile,
}: FileTreeProps) {
  if (folderName === null) {
    return (
      <div className="elmark-sidebar-empty">
        <p style={{ margin: '0 0 10px' }}>尚未打开文件夹</p>
        <button
          type="button"
          className="elmark-banner-btn"
          onClick={onOpenFolder}
        >
          打开文件夹
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px 6px',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-muted)',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={folderName}
        >
          {folderName}
        </span>
        <button
          type="button"
          className="elmark-titlebar-btn"
          title="切换文件夹"
          aria-label="切换文件夹"
          style={{ height: '22px', padding: '0 6px', fontSize: '11.5px' }}
          onClick={onOpenFolder}
        >
          切换
        </button>
      </div>
      {tree.length === 0 ? (
        <div className="elmark-sidebar-empty">当前文件夹暂无 Markdown 文件</div>
      ) : (
        tree.map((node) => (
          <TreeNodeItem
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onSelectFile={onSelectFile}
          />
        ))
      )}
    </div>
  );
}
