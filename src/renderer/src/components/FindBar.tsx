import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { FindResult } from '../../../shared/ipc';

export interface FindBarProps {
  visible: boolean;
  query: string;
  result: FindResult | null;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/**
 * Floating in-page search bar supporting Enter/Shift+Enter navigation and Escape to dismiss.
 */
export function FindBar({
  visible,
  query,
  result,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const countText =
    query.length > 0
      ? result
        ? `${result.activeMatchOrdinal} / ${result.matches}`
        : '0 / 0'
      : '';

  return (
    <div className="elmark-findbar" role="search" aria-label="页面内查找">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="查找..."
        aria-label="查找关键词"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="elmark-findbar-count" aria-live="polite">
        {countText}
      </span>
      <button type="button" title="上一个" aria-label="上一个" onClick={onPrev}>
        ↑
      </button>
      <button type="button" title="下一个" aria-label="下一个" onClick={onNext}>
        ↓
      </button>
      <button type="button" title="关闭" aria-label="关闭" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
