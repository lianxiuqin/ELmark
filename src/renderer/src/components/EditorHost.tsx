import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';
import type { FindResult } from '../../../shared/ipc';
import { SourceEditor, type SourceEditorHandle } from './SourceEditor';
import { WysiwygEditor, type WysiwygEditorHandle } from './WysiwygEditor';

export interface EditorHostHandle {
  insertTable: () => void;
  insertMermaid: () => void;
  scrollToHeadingIndex: (index: number) => void;
  findInSource: (query: string, forward?: boolean, findNext?: boolean) => FindResult;
  getMarkdown: () => string;
}

export interface EditorHostProps {
  mode: 'wysiwyg' | 'source';
  body: string;
  fullRawMarkdown: string;
  documentDir: string | null;
  onBodyChange: (nextBody: string) => void;
  onDirtyHint?: () => void;
  onSourceChange: (nextRaw: string) => void;
  onActiveHeadingChange: (index: number) => void;
  onOpenExternalUrl: (url: string) => void;
  headerSlot?: ReactNode;
}

const EMPTY_FIND_RESULT: FindResult = {
  activeMatchOrdinal: 0,
  matches: 0,
  finalUpdate: true,
};

/**
 * Dual-mode editor host coordinating WYSIWYG and Source editors with scroll-ratio preservation.
 */
export const EditorHost = forwardRef<EditorHostHandle, EditorHostProps>(
  function EditorHost(
    {
      mode,
      body,
      fullRawMarkdown,
      documentDir,
      onBodyChange,
      onDirtyHint,
      onSourceChange,
      onActiveHeadingChange,
      onOpenExternalUrl,
      headerSlot,
    },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const wysiwygRef = useRef<WysiwygEditorHandle | null>(null);
    const sourceRef = useRef<SourceEditorHandle | null>(null);

    const modeRef = useRef(mode);
    modeRef.current = mode;

    const bodyRef = useRef(body);
    bodyRef.current = body;

    const fullRawMarkdownRef = useRef(fullRawMarkdown);
    fullRawMarkdownRef.current = fullRawMarkdown;

    const prevModeRef = useRef(mode);
    const lastScrollRatioRef = useRef(0);

    useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return;
      }

      const handleScrollCapture = () => {
        if (modeRef.current === 'wysiwyg') {
          lastScrollRatioRef.current = wysiwygRef.current?.getScrollRatio() ?? 0;
        } else {
          lastScrollRatioRef.current = sourceRef.current?.getScrollRatio() ?? 0;
        }
      };

      wrapper.addEventListener('scroll', handleScrollCapture, {
        capture: true,
        passive: true,
      });
      return () => {
        wrapper.removeEventListener('scroll', handleScrollCapture, {
          capture: true,
        });
      };
    }, []);

    useEffect(() => {
      if (prevModeRef.current === mode) {
        return;
      }
      prevModeRef.current = mode;
      const ratio = lastScrollRatioRef.current;
      const rafId = requestAnimationFrame(() => {
        if (mode === 'source') {
          sourceRef.current?.setScrollRatio(ratio);
        } else {
          wysiwygRef.current?.setScrollRatio(ratio);
        }
      });
      return () => cancelAnimationFrame(rafId);
    }, [mode]);

    useImperativeHandle(
      ref,
      () => ({
        insertTable: () => {
          if (modeRef.current === 'wysiwyg') {
            wysiwygRef.current?.insertTable();
          }
        },
        insertMermaid: () => {
          if (modeRef.current === 'wysiwyg') {
            wysiwygRef.current?.insertMermaid();
          }
        },
        scrollToHeadingIndex: (index: number) => {
          if (modeRef.current === 'wysiwyg') {
            wysiwygRef.current?.scrollToHeadingIndex(index);
          }
        },
        findInSource: (query: string, forward = true, findNext = false) => {
          if (modeRef.current !== 'source' || !sourceRef.current) {
            return EMPTY_FIND_RESULT;
          }
          return sourceRef.current.findText(query, forward, findNext);
        },
        getMarkdown: () => {
          if (modeRef.current === 'wysiwyg') {
            return wysiwygRef.current?.getMarkdown() ?? bodyRef.current;
          }
          return sourceRef.current?.getValue() ?? fullRawMarkdownRef.current;
        },
      }),
      [],
    );

    return (
      <div
        ref={wrapperRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
        }}
      >
        {mode === 'wysiwyg' ? (
          <WysiwygEditor
            ref={wysiwygRef}
            markdown={body}
            documentDir={documentDir}
            onChange={onBodyChange}
            onDirtyHint={onDirtyHint}
            onActiveHeadingChange={onActiveHeadingChange}
            onOpenExternalUrl={onOpenExternalUrl}
            headerSlot={headerSlot}
          />
        ) : (
          <SourceEditor
            ref={sourceRef}
            value={fullRawMarkdown}
            onChange={onSourceChange}
          />
        )}
      </div>
    );
  },
);
