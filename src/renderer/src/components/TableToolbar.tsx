import type { MouseEvent } from 'react';

export interface TableToolbarProps {
  visible: boolean;
  top: number;
  left: number;
  onAddRow: () => void;
  onDeleteRow: () => void;
  onAddCol: () => void;
  onDeleteCol: () => void;
  onAlign: (align: 'left' | 'center' | 'right') => void;
}

function preventFocusLoss(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

/**
 * Floating contextual micro-toolbar displayed when the editor selection is inside a table.
 */
export function TableToolbar({
  visible,
  top,
  left,
  onAddRow,
  onDeleteRow,
  onAddCol,
  onDeleteCol,
  onAlign,
}: TableToolbarProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="elmark-table-toolbar"
      role="toolbar"
      aria-label="表格操作工具栏"
      style={{ top, left }}
    >
      <button
        type="button"
        title="添加行"
        onMouseDown={preventFocusLoss}
        onClick={onAddRow}
      >
        +行
      </button>
      <button
        type="button"
        title="删除行"
        onMouseDown={preventFocusLoss}
        onClick={onDeleteRow}
      >
        -行
      </button>
      <button
        type="button"
        title="添加列"
        onMouseDown={preventFocusLoss}
        onClick={onAddCol}
      >
        +列
      </button>
      <button
        type="button"
        title="删除列"
        onMouseDown={preventFocusLoss}
        onClick={onDeleteCol}
      >
        -列
      </button>
      <button
        type="button"
        title="左对齐"
        onMouseDown={preventFocusLoss}
        onClick={() => onAlign('left')}
      >
        左
      </button>
      <button
        type="button"
        title="居中对齐"
        onMouseDown={preventFocusLoss}
        onClick={() => onAlign('center')}
      >
        中
      </button>
      <button
        type="button"
        title="右对齐"
        onMouseDown={preventFocusLoss}
        onClick={() => onAlign('right')}
      >
        右
      </button>
    </div>
  );
}
