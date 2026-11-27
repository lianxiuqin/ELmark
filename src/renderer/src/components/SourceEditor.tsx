import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { FindResult } from '../../../shared/ipc';

export interface SourceEditorHandle {
  getScrollRatio: () => number;
  setScrollRatio: (ratio: number) => void;
  findText: (query: string, forward?: boolean, findNext?: boolean) => FindResult;
}

export interface SourceEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
}

function collectMatchIndices(haystack: string, needle: string): number[] {
  if (!needle) {
    return [];
  }
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const indices: number[] = [];
  let fromIndex = 0;

  while (fromIndex <= lowerHaystack.length - lowerNeedle.length) {
    const idx = lowerHaystack.indexOf(lowerNeedle, fromIndex);
    if (idx === -1) {
      break;
    }
    indices.push(idx);
    fromIndex = idx + Math.max(1, lowerNeedle.length);
  }

  return indices;
}

/**
 * Lightweight monospace Markdown source editor with isolated native textarea undo stack.
 */
export const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(
  function SourceEditor({ value, onChange }, ref) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const lastQueryRef = useRef('');
    const lastMatchIdxRef = useRef(-1);

    useEffect(() => {
      const el = textareaRef.current;
      if (!el || el.scrollHeight <= 0) {
        return;
      }
      el.style.height = 'auto';
      if (el.scrollHeight > 0) {
        el.style.height = `${el.scrollHeight}px`;
      }
    }, [value]);

    useImperativeHandle(
      ref,
      () => ({
        getScrollRatio: () => {
          const el = scrollContainerRef.current;
          if (!el || el.scrollHeight <= el.clientHeight) {
            return 0;
          }
          return el.scrollTop / (el.scrollHeight - el.clientHeight);
        },
        setScrollRatio: (ratio: number) => {
          const el = scrollContainerRef.current;
          if (!el) {
            return;
          }
          const clamped = Math.max(0, Math.min(1, ratio));
          const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = clamped * maxScroll;
        },
        findText: (query: string, forward = true, findNext = false): FindResult => {
          if (!query) {
            lastQueryRef.current = '';
            lastMatchIdxRef.current = -1;
            return { activeMatchOrdinal: 0, matches: 0, finalUpdate: true };
          }

          const text = valueRef.current;
          const indices = collectMatchIndices(text, query);
          if (indices.length === 0) {
            lastQueryRef.current = query;
            lastMatchIdxRef.current = -1;
            return { activeMatchOrdinal: 0, matches: 0, finalUpdate: true };
          }

          let targetIdx: number;
          if (!findNext || lastQueryRef.current !== query || lastMatchIdxRef.current < 0) {
            targetIdx = forward ? 0 : indices.length - 1;
          } else {
            const step = forward ? 1 : -1;
            targetIdx =
              (lastMatchIdxRef.current + step + indices.length) % indices.length;
          }

          lastQueryRef.current = query;
          lastMatchIdxRef.current = targetIdx;

          const startOffset = indices[targetIdx];
          const endOffset = startOffset + query.length;
          const textarea = textareaRef.current;
          if (textarea) {
            textarea.setSelectionRange(startOffset, endOffset);
            const scrollEl = scrollContainerRef.current;
            if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
              const linesBefore = text.slice(0, startOffset).split(/\r?\n/).length - 1;
              const totalLines = Math.max(1, text.split(/\r?\n/).length);
              const lineRatio = linesBefore / totalLines;
              const targetTop =
                lineRatio * scrollEl.scrollHeight - scrollEl.clientHeight * 0.35;
              const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
              scrollEl.scrollTop = Math.max(0, Math.min(maxScroll, targetTop));
            }
          }

          return {
            activeMatchOrdinal: targetIdx + 1,
            matches: indices.length,
            finalUpdate: true,
          };
        },
      }),
      [],
    );

    return (
      <div ref={scrollContainerRef} className="elmark-editor-scroll">
        <textarea
          ref={textareaRef}
          className="elmark-source-editor"
          aria-label="Markdown 源码编辑器"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  },
);
