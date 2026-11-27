import { useState } from 'react';

export interface FrontmatterBarProps {
  frontmatter: string | null;
  onEditInSource: () => void;
}

/**
 * Collapsible YAML frontmatter drawer shown above the editor canvas when frontmatter exists.
 */
export function FrontmatterBar({ frontmatter, onEditInSource }: FrontmatterBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (frontmatter === null) {
    return null;
  }

  return (
    <div className="elmark-frontmatter">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            cursor: 'pointer',
          }}
        >
          {expanded ? '▾' : '▸'} YAML Frontmatter
        </button>
        {expanded ? (
          <button
            type="button"
            className="elmark-banner-btn"
            onClick={onEditInSource}
          >
            在源码模式编辑
          </button>
        ) : null}
      </div>
      {expanded ? <pre>{frontmatter}</pre> : null}
    </div>
  );
}
