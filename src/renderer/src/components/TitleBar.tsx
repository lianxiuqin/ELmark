import type { MouseEvent } from 'react';

export interface TitleBarProps {
  fileName: string;
  isDirty: boolean;
  isSourceMode: boolean;
  sidebarVisible: boolean;
  onOpenMenu: (x: number, y: number) => void;
  onToggleSidebar: () => void;
}

/**
 * Unified top titlebar integrating application menu, sidebar toggle, document title, and source badge.
 */
export function TitleBar({
  fileName,
  isDirty,
  isSourceMode,
  sidebarVisible,
  onOpenMenu,
  onToggleSidebar,
}: TitleBarProps) {
  const handleOpenMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(Math.round(rect.left), Math.round(rect.bottom));
  };

  return (
    <header className="elmark-titlebar">
      <div className="elmark-titlebar-left">
        <button
          type="button"
          className="elmark-titlebar-btn"
          title="菜单"
          aria-label="菜单"
          onClick={handleOpenMenu}
        >
          ≡
        </button>
        <button
          type="button"
          className={`elmark-titlebar-btn${sidebarVisible ? ' is-active' : ''}`}
          title="切换侧边栏"
          aria-label="切换侧边栏"
          aria-pressed={sidebarVisible}
          onClick={onToggleSidebar}
        >
          侧边栏
        </button>
        <span className="elmark-titlebar-title" title={fileName}>
          {isDirty ? `${fileName} *` : fileName}
        </span>
      </div>
      <div className="elmark-titlebar-right">
        {isSourceMode ? (
          <span
            className="elmark-titlebar-no-drag"
            style={{
              padding: '1px 6px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-code)',
              color: 'var(--text-secondary)',
              fontSize: '11.5px',
              lineHeight: 1.5,
            }}
          >
            源码
          </span>
        ) : null}
      </div>
    </header>
  );
}
