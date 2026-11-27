import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Editor,
  EditorStatus,
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { indent } from '@milkdown/kit/plugin/indent';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import {
  codeBlockSchema,
  commonmark,
  linkSchema,
  toggleLinkCommand,
  updateLinkCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  addColAfterCommand,
  addRowAfterCommand,
  gfm,
  insertTableCommand,
  setAlignCommand,
} from '@milkdown/kit/preset/gfm';
import { Selection } from '@milkdown/kit/prose/state';
import {
  deleteColumn,
  deleteRow,
  findTable,
  isInTable,
} from '@milkdown/kit/prose/tables';
import { getMarkdown, replaceAll } from '@milkdown/kit/utils';
import 'highlight.js/styles/github.css';
import {
  codeBlockViewPlugin,
  codeHighlightPlugin,
  createHtmlViewPlugin,
  createImageViewPlugin,
} from '../core/milkdownPlugins';
import { LinkBubble } from './LinkBubble';
import { TableToolbar } from './TableToolbar';

export interface WysiwygEditorHandle {
  insertTable: () => void;
  insertMermaid: () => void;
  scrollToHeadingIndex: (index: number) => void;
  getMarkdown: () => string;
  getScrollRatio: () => number;
  setScrollRatio: (ratio: number) => void;
}

export interface WysiwygEditorProps {
  markdown: string;
  documentDir: string | null;
  onChange: (nextMarkdown: string) => void;
  onActiveHeadingChange?: (index: number) => void;
  onOpenExternalUrl: (url: string) => void;
}

interface FloatingPosition {
  visible: boolean;
  top: number;
  left: number;
}

interface LinkBubbleState extends FloatingPosition {
  href: string;
}

const DEFAULT_MERMAID_CODE = 'graph TD\n  A[开始] --> B[结束]';

/**
 * Milkdown WYSIWYG editor component with Typora Light styling, dual-state Mermaid blocks,
 * safe sanitized HTML rendering, dynamic local images, contextual table controls, and link bubble.
 */
export const WysiwygEditor = forwardRef<WysiwygEditorHandle, WysiwygEditorProps>(
  function WysiwygEditor(
    { markdown, documentDir, onChange, onActiveHeadingChange, onOpenExternalUrl },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const editorHostRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<Editor | null>(null);

    const documentDirRef = useRef<string | null>(documentDir);
    documentDirRef.current = documentDir;

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const onActiveHeadingChangeRef = useRef(onActiveHeadingChange);
    onActiveHeadingChangeRef.current = onActiveHeadingChange;

    const onOpenExternalUrlRef = useRef(onOpenExternalUrl);
    onOpenExternalUrlRef.current = onOpenExternalUrl;

    const lastPropMarkdownRef = useRef(markdown);
    const lastSerializedMarkdownRef = useRef(markdown);
    const isSyncingExternalRef = useRef(false);
    const lastActiveHeadingIndexRef = useRef<number>(-1);
    const linkTargetRangeRef = useRef<{ from: number; to: number } | null>(null);
    const documentDirRefreshCallbacksRef = useRef<Set<() => void>>(new Set());
    const isFirstDocumentDirRenderRef = useRef(true);

    const [tableToolbar, setTableToolbar] = useState<FloatingPosition>({
      visible: false,
      top: 0,
      left: 0,
    });

    const [linkBubble, setLinkBubble] = useState<LinkBubbleState>({
      visible: false,
      top: 0,
      left: 0,
      href: '',
    });

    const computeRelativePosition = useCallback(
      (targetRect: DOMRect, fallbackTop = 12, fallbackLeft = 12) => {
        const wrapper = wrapperRef.current;
        if (!wrapper) {
          return { top: fallbackTop, left: fallbackLeft };
        }
        const wrapperRect = wrapper.getBoundingClientRect();
        const top = Math.max(8, targetRect.top - wrapperRect.top - 36);
        const left = Math.max(
          8,
          Math.min(
            wrapperRect.width - 280,
            targetRect.left - wrapperRect.left,
          ),
        );
        return { top, left };
      },
      [],
    );

    const updateTableToolbarFromEditor = useCallback(
      (editor: Editor) => {
        if (editor.status !== EditorStatus.Created) {
          return;
        }
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;
        if (!isInTable(state)) {
          setTableToolbar((prev) =>
            prev.visible ? { ...prev, visible: false } : prev,
          );
          return;
        }

        const table = findTable(state.selection.$from);
        if (!table) {
          setTableToolbar((prev) =>
            prev.visible ? { ...prev, visible: false } : prev,
          );
          return;
        }

        const domAt = view.domAtPos(table.start);
        const anchorEl =
          domAt.node instanceof Element ? domAt.node : domAt.node.parentElement;
        const tableEl = anchorEl?.closest('table');
        if (!tableEl) {
          setTableToolbar({ visible: true, top: 12, left: 16 });
          return;
        }

        const pos = computeRelativePosition(tableEl.getBoundingClientRect());
        setTableToolbar({ visible: true, top: pos.top, left: pos.left });
      },
      [computeRelativePosition],
    );

    const openLinkBubbleAtSelection = useCallback(
      (editor: Editor, anchorElement?: HTMLAnchorElement | null) => {
        if (editor.status !== EditorStatus.Created) {
          return;
        }
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;
        const linkType = linkSchema.type(editor.ctx);

        let href = '';
        let targetRange: { from: number; to: number } | null = null;
        const { from, to } = state.selection;
        const maxPos = state.doc.content.size;
        const clampedFrom = Math.max(0, Math.min(from, maxPos));
        const clampedTo = Math.min(maxPos, from === to ? to + 1 : to);
        if (clampedFrom <= clampedTo) {
          state.doc.nodesBetween(clampedFrom, clampedTo, (node, pos) => {
            const mark = node.marks.find((item) => item.type === linkType);
            if (mark) {
              href = String(mark.attrs.href ?? '');
              targetRange = { from: pos, to: pos + node.nodeSize };
              return false;
            }
            return true;
          });
        }

        if (!href && anchorElement) {
          href = anchorElement.getAttribute('href') ?? '';
          try {
            const domPos = view.posAtDOM(anchorElement, 0);
            state.doc.nodesBetween(
              Math.max(0, domPos - 1),
              Math.min(state.doc.content.size, domPos + 1),
              (node, pos) => {
                const mark = node.marks.find((item) => item.type === linkType);
                if (mark) {
                  targetRange = { from: pos, to: pos + node.nodeSize };
                  return false;
                }
                return true;
              },
            );
          } catch {
            // Fallback to href from anchor element when DOM position lookup is unavailable.
          }
        }

        linkTargetRangeRef.current = targetRange;

        let rect: DOMRect | null = anchorElement
          ? anchorElement.getBoundingClientRect()
          : null;
        if (!rect) {
          try {
            const coords = view.coordsAtPos(from);
            rect = new DOMRect(
              coords.left,
              coords.top,
              Math.max(1, coords.right - coords.left),
              Math.max(1, coords.bottom - coords.top),
            );
          } catch {
            rect = null;
          }
        }

        const pos = rect
          ? computeRelativePosition(rect)
          : { top: 16, left: 16 };
        setLinkBubble({
          visible: true,
          top: pos.top,
          left: pos.left,
          href,
        });
      },
      [computeRelativePosition],
    );

    useEffect(() => {
      const host = editorHostRef.current;
      if (!host) {
        return;
      }

      let cancelled = false;
      let createdEditor: Editor | null = null;
      const initialMarkdown = lastPropMarkdownRef.current;

      const registerRefresh = (cb: () => void) => {
        documentDirRefreshCallbacksRef.current.add(cb);
        return () => {
          documentDirRefreshCallbacksRef.current.delete(cb);
        };
      };

      const htmlPlugin = createHtmlViewPlugin(
        () => documentDirRef.current,
        (url) => onOpenExternalUrlRef.current(url),
        registerRefresh,
      );
      const imagePlugin = createImageViewPlugin(
        () => documentDirRef.current,
        registerRefresh,
      );

      const dismissLinkBubble = () => {
        linkTargetRangeRef.current = null;
        setLinkBubble((prev) =>
          prev.visible ? { ...prev, visible: false } : prev,
        );
      };

      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, host);
          ctx.set(defaultValueCtx, initialMarkdown);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            handleDOMEvents: {
              ...(prev.handleDOMEvents ?? {}),
              click: (_view, event) => {
                const target = event.target;
                const anchor =
                  target instanceof Element ? target.closest('a') : null;
                if (!(anchor instanceof HTMLAnchorElement)) {
                  dismissLinkBubble();
                  return false;
                }
                event.preventDefault();
                const href = anchor.getAttribute('href') ?? '';
                if (event.ctrlKey || event.metaKey) {
                  dismissLinkBubble();
                  if (href) {
                    onOpenExternalUrlRef.current(href);
                  }
                  return true;
                }
                if (createdEditor) {
                  openLinkBubbleAtSelection(createdEditor, anchor);
                }
                return false;
              },
              keydown: (_view, event) => {
                if (
                  (event.ctrlKey || event.metaKey) &&
                  event.key.toLowerCase() === 'k'
                ) {
                  event.preventDefault();
                  if (createdEditor) {
                    openLinkBubbleAtSelection(createdEditor);
                  }
                  return true;
                }
                return false;
              },
            },
          }));
          ctx.get(listenerCtx)
            .markdownUpdated((lCtx, nextMarkdown) => {
              if (isSyncingExternalRef.current) {
                return;
              }
              // Ignore stale debounced emissions after an external replaceAll(flush=true).
              const currentDocMarkdown = lCtx.get(serializerCtx)(
                lCtx.get(editorViewCtx).state.doc,
              );
              if (nextMarkdown !== currentDocMarkdown) {
                return;
              }
              if (nextMarkdown === lastSerializedMarkdownRef.current) {
                return;
              }
              lastSerializedMarkdownRef.current = nextMarkdown;
              lastPropMarkdownRef.current = nextMarkdown;
              onChangeRef.current(nextMarkdown);
            })
            .updated(() => {
              dismissLinkBubble();
            })
            .selectionUpdated((sCtx) => {
              if (createdEditor) {
                updateTableToolbarFromEditor(createdEditor);
              }
              const targetRange = linkTargetRangeRef.current;
              if (targetRange) {
                const { from, to } = sCtx.get(editorViewCtx).state.selection;
                if (from < targetRange.from || to > targetRange.to) {
                  dismissLinkBubble();
                }
              }
            });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(indent)
        .use(listener)
        .use(codeHighlightPlugin)
        .use(codeBlockViewPlugin)
        .use(htmlPlugin)
        .use(imagePlugin);

      const createPromise = editor
        .create()
        .then((instance) => {
          if (cancelled) {
            return instance.destroy().then(() => undefined);
          }
          createdEditor = instance;
          editorRef.current = instance;
          if (lastPropMarkdownRef.current !== initialMarkdown) {
            isSyncingExternalRef.current = true;
            try {
              instance.action(replaceAll(lastPropMarkdownRef.current, true));
            } finally {
              isSyncingExternalRef.current = false;
            }
          }
          lastSerializedMarkdownRef.current = instance.action(getMarkdown());
          return undefined;
        })
        .catch(() => {
          // Swallow teardown races in StrictMode / fast unmounts.
        });

      return () => {
        cancelled = true;
        editorRef.current = null;
        void createPromise.then(() => {
          if (createdEditor) {
            return createdEditor.destroy().catch(() => undefined);
          }
          return editor.destroy().catch(() => undefined);
        });
      };
    }, [openLinkBubbleAtSelection, updateTableToolbarFromEditor]);

    useEffect(() => {
      const prevProp = lastPropMarkdownRef.current;
      lastPropMarkdownRef.current = markdown;

      const editor = editorRef.current;
      if (!editor || editor.status !== EditorStatus.Created) {
        return;
      }
      if (
        markdown === prevProp ||
        markdown === lastSerializedMarkdownRef.current
      ) {
        return;
      }

      isSyncingExternalRef.current = true;
      try {
        editor.action(replaceAll(markdown, true));
        lastSerializedMarkdownRef.current = editor.action(getMarkdown());
      } finally {
        isSyncingExternalRef.current = false;
      }
      linkTargetRangeRef.current = null;
      setTableToolbar((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      setLinkBubble((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
    }, [markdown]);

    useEffect(() => {
      if (isFirstDocumentDirRenderRef.current) {
        isFirstDocumentDirRenderRef.current = false;
        return;
      }
      documentDirRef.current = documentDir;
      for (const refresh of documentDirRefreshCallbacksRef.current) {
        refresh();
      }
    }, [documentDir]);

    useEffect(() => {
      if (!linkBubble.visible) {
        return;
      }
      const handleDocumentMouseDown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest('.elmark-link-bubble')) {
          return;
        }
        if (target.closest('.ProseMirror a')) {
          return;
        }
        linkTargetRangeRef.current = null;
        setLinkBubble((prev) =>
          prev.visible ? { ...prev, visible: false } : prev,
        );
      };
      document.addEventListener('mousedown', handleDocumentMouseDown);
      return () => {
        document.removeEventListener('mousedown', handleDocumentMouseDown);
      };
    }, [linkBubble.visible]);

    useEffect(() => {
      const scrollEl = scrollContainerRef.current;
      if (!scrollEl) {
        return;
      }

      let rafId: number | null = null;
      const updateActiveHeading = () => {
        rafId = null;
        const proseEl = scrollEl.querySelector('.ProseMirror');
        if (!proseEl) {
          return;
        }
        const headings = Array.from(
          proseEl.querySelectorAll('h1, h2, h3, h4, h5, h6'),
        );
        if (headings.length === 0) {
          return;
        }

        const scrollRect = scrollEl.getBoundingClientRect();
        let activeIndex = 0;
        for (let i = 0; i < headings.length; i += 1) {
          const rect = headings[i].getBoundingClientRect();
          if (rect.top - scrollRect.top <= 48) {
            activeIndex = i;
          } else {
            break;
          }
        }

        if (activeIndex !== lastActiveHeadingIndexRef.current) {
          lastActiveHeadingIndexRef.current = activeIndex;
          onActiveHeadingChangeRef.current?.(activeIndex);
        }
      };

      const handleScroll = () => {
        if (rafId !== null) {
          return;
        }
        rafId = requestAnimationFrame(updateActiveHeading);
      };

      scrollEl.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        scrollEl.removeEventListener('scroll', handleScroll);
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }, []);

    const runProseCommand = useCallback(
      (fn: (editor: Editor) => void) => {
        const editor = editorRef.current;
        if (!editor || editor.status !== EditorStatus.Created) {
          return;
        }
        fn(editor);
        updateTableToolbarFromEditor(editor);
      },
      [updateTableToolbarFromEditor],
    );

    useImperativeHandle(
      ref,
      () => ({
        insertTable: () => {
          runProseCommand((editor) => {
            editor.action((ctx) => {
              ctx.get(commandsCtx).call(insertTableCommand.key, {
                row: 3,
                col: 3,
              });
              ctx.get(editorViewCtx).focus();
            });
          });
        },
        insertMermaid: () => {
          runProseCommand((editor) => {
            editor.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const { state } = view;
              const codeBlock = codeBlockSchema.type(ctx).create(
                { language: 'mermaid' },
                state.schema.text(DEFAULT_MERMAID_CODE),
              );
              const tr = state.tr.replaceSelectionWith(codeBlock);
              const resolved = Selection.near(
                tr.doc.resolve(Math.min(tr.selection.to, tr.doc.content.size)),
              );
              tr.setSelection(resolved).scrollIntoView();
              view.dispatch(tr);
              view.focus();
            });
          });
        },
        scrollToHeadingIndex: (index: number) => {
          const scrollEl = scrollContainerRef.current;
          if (!scrollEl || index < 0) {
            return;
          }
          const headings = scrollEl.querySelectorAll(
            '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6',
          );
          const target = headings.item(index);
          if (target instanceof HTMLElement) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        },
        getMarkdown: () => {
          const editor = editorRef.current;
          if (!editor || editor.status !== EditorStatus.Created) {
            return lastPropMarkdownRef.current;
          }
          return editor.action(getMarkdown());
        },
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
      }),
      [runProseCommand],
    );

    const handleApplyLink = useCallback(
      (nextHref: string) => {
        runProseCommand((editor) => {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const commands = ctx.get(commandsCtx);
            const targetRange = linkTargetRangeRef.current;

            if (targetRange) {
              const linkType = linkSchema.type(ctx);
              const { from, to } = targetRange;
              if (from >= 0 && to <= view.state.doc.content.size && from < to) {
                const tr = view.state.tr.removeMark(from, to, linkType);
                if (nextHref) {
                  tr.addMark(from, to, linkType.create({ href: nextHref }));
                }
                view.dispatch(tr);
                view.focus();
                return;
              }
            }

            const updated = commands.call(updateLinkCommand.key, {
              href: nextHref,
            });
            if (!updated && nextHref) {
              commands.call(toggleLinkCommand.key, { href: nextHref });
            }
            view.focus();
          });
        });
        linkTargetRangeRef.current = null;
        setLinkBubble((prev) => ({ ...prev, visible: false }));
      },
      [runProseCommand],
    );

    return (
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
        }}
      >
        <TableToolbar
          visible={tableToolbar.visible}
          top={tableToolbar.top}
          left={tableToolbar.left}
          onAddRow={() =>
            runProseCommand((editor) => {
              editor.action((ctx) => {
                ctx.get(commandsCtx).call(addRowAfterCommand.key);
              });
            })
          }
          onDeleteRow={() =>
            runProseCommand((editor) => {
              editor.action((ctx) => {
                ctx.get(commandsCtx).inline(deleteRow);
              });
            })
          }
          onAddCol={() =>
            runProseCommand((editor) => {
              editor.action((ctx) => {
                ctx.get(commandsCtx).call(addColAfterCommand.key);
              });
            })
          }
          onDeleteCol={() =>
            runProseCommand((editor) => {
              editor.action((ctx) => {
                ctx.get(commandsCtx).inline(deleteColumn);
              });
            })
          }
          onAlign={(align) =>
            runProseCommand((editor) => {
              editor.action((ctx) => {
                ctx.get(commandsCtx).call(setAlignCommand.key, align);
              });
            })
          }
        />

        <LinkBubble
          visible={linkBubble.visible}
          top={linkBubble.top}
          left={linkBubble.left}
          href={linkBubble.href}
          onApply={handleApplyLink}
          onOpenExternal={(href) => {
            if (href) {
              onOpenExternalUrlRef.current(href);
            }
          }}
          onClose={() => {
            linkTargetRangeRef.current = null;
            setLinkBubble((prev) => ({ ...prev, visible: false }));
          }}
        />

        <div ref={scrollContainerRef} className="elmark-editor-scroll">
          <div ref={editorHostRef} className="elmark-prose" />
        </div>
      </div>
    );
  },
);
