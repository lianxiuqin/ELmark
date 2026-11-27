import type { OutlineItem } from '../../../shared/ipc';

export interface OutlineViewProps {
  outline: OutlineItem[];
  activeHeadingIndex: number;
  onSelectHeading: (index: number) => void;
}

/**
 * Document heading outline list with H1-H6 indentation and active highlight.
 */
export function OutlineView({
  outline,
  activeHeadingIndex,
  onSelectHeading,
}: OutlineViewProps) {
  if (outline.length === 0) {
    return <div className="elmark-sidebar-empty">暂无大纲</div>;
  }

  return (
    <nav aria-label="文档大纲">
      {outline.map((item) => {
        const isActive = item.index === activeHeadingIndex;
        return (
          <button
            key={item.id}
            type="button"
            className={`elmark-outline-item${isActive ? ' is-active' : ''}`}
            data-level={item.level}
            title={item.text}
            onClick={() => onSelectHeading(item.index)}
          >
            {item.text}
          </button>
        );
      })}
    </nav>
  );
}
