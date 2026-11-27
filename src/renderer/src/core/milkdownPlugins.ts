import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import {
  codeBlockSchema,
  htmlSchema,
  imageSchema,
} from '@milkdown/kit/preset/commonmark';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose, $view } from '@milkdown/kit/utils';
import { common, createLowlight } from 'lowlight';
import { isHtmlCommentOnly, sanitizeReadingHtml } from './htmlSanitizer';
import { resolveImageSrc } from './localImageUrl';
import { renderMermaidDiagram } from './mermaidRenderer';

const lowlight = createLowlight(common);
const CODE_HIGHLIGHT_PLUGIN_KEY = new PluginKey('ELMARK_CODE_HIGHLIGHT');
const MERMAID_DEBOUNCE_MS = 300;

interface HastChild {
  type: string;
  value?: string;
  properties?: {
    className?: unknown;
  };
  children?: HastChild[];
}

function walkHastNodes(
  children: HastChild[],
  offset: number,
  decorations: Decoration[],
): number {
  let cursor = offset;

  for (const child of children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      cursor += child.value.length;
      continue;
    }

    if (child.type === 'element' && Array.isArray(child.children)) {
      const start = cursor;
      cursor = walkHastNodes(child.children, cursor, decorations);
      const classNames = Array.isArray(child.properties?.className)
        ? child.properties.className.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];

      if (classNames.length > 0 && cursor > start) {
        decorations.push(
          Decoration.inline(start, cursor, {
            class: classNames.join(' '),
          }),
        );
      }
    }
  }

  return cursor;
}

function buildCodeDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') {
      return;
    }

    const language = String(node.attrs.language ?? '')
      .trim()
      .toLowerCase();
    if (!language || language === 'mermaid' || !lowlight.registered(language)) {
      return;
    }

    const text = node.textContent;
    if (!text) {
      return;
    }

    try {
      const tree = lowlight.highlight(language, text);
      walkHastNodes(tree.children as HastChild[], pos + 1, decorations);
    } catch {
      // Skip decoration if lowlight encounters an unexpected grammar error.
    }
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * ProseMirror decoration plugin for lightweight syntax highlighting in code blocks.
 */
export const codeHighlightPlugin = $prose(() => {
  return new Plugin({
    key: CODE_HIGHLIGHT_PLUGIN_KEY,
    state: {
      init: (_, state) => buildCodeDecorations(state.doc),
      apply: (tr, prevSet) =>
        tr.docChanged ? buildCodeDecorations(tr.doc) : prevSet,
    },
    props: {
      decorations(state) {
        return CODE_HIGHLIGHT_PLUGIN_KEY.getState(state);
      },
    },
  });
});

function updateCodeBlockLanguage(
  view: EditorView,
  getPos: () => number | undefined,
  nextLanguage: string,
): void {
  const pos = getPos();
  if (typeof pos !== 'number') {
    return;
  }
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'code_block') {
    return;
  }
  const normalized = nextLanguage.trim();
  if (String(node.attrs.language ?? '') === normalized) {
    return;
  }
  view.dispatch(
    view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      language: normalized,
    }),
  );
}

function updateCodeBlockText(
  view: EditorView,
  getPos: () => number | undefined,
  nextText: string,
): void {
  const pos = getPos();
  if (typeof pos !== 'number') {
    return;
  }
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'code_block') {
    return;
  }
  if (node.textContent === nextText) {
    return;
  }

  const from = pos + 1;
  const to = from + node.content.size;
  const tr = view.state.tr;
  if (nextText.length > 0) {
    tr.replaceWith(from, to, view.state.schema.text(nextText));
  } else {
    tr.delete(from, to);
  }
  view.dispatch(tr);
}

function createStandardCodeBlockView(
  initialNode: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = initialNode;

  const dom = document.createElement('div');
  dom.className = 'elmark-code-block';
  dom.style.position = 'relative';

  const langInput = document.createElement('input');
  langInput.type = 'text';
  langInput.value = String(initialNode.attrs.language ?? '');
  langInput.placeholder = '语言';
  langInput.setAttribute('aria-label', '代码块语言');
  Object.assign(langInput.style, {
    position: 'absolute',
    top: '6px',
    right: '8px',
    width: '92px',
    height: '22px',
    padding: '0 6px',
    border: '1px solid var(--border-subtle)',
    borderRadius: '3px',
    background: 'var(--bg-canvas)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    textAlign: 'right',
    opacity: '0.65',
    outline: 'none',
  });

  const pre = document.createElement('pre');
  pre.style.margin = '0';
  pre.style.padding = '0';
  pre.style.border = 'none';
  pre.style.background = 'transparent';

  const code = document.createElement('code');
  const syncLanguageAttr = (lang: string): void => {
    const clean = lang.trim();
    dom.dataset.language = clean;
    code.className = clean ? `language-${clean} hljs` : 'hljs';
    if (document.activeElement !== langInput) {
      langInput.value = clean;
    }
  };
  syncLanguageAttr(String(initialNode.attrs.language ?? ''));

  pre.appendChild(code);
  dom.appendChild(langInput);
  dom.appendChild(pre);

  langInput.addEventListener('focus', () => {
    langInput.style.opacity = '1';
  });
  langInput.addEventListener('blur', () => {
    langInput.style.opacity = '0.65';
    updateCodeBlockLanguage(view, getPos, langInput.value);
  });
  langInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      updateCodeBlockLanguage(view, getPos, langInput.value);
      view.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      langInput.value = String(currentNode.attrs.language ?? '');
      view.focus();
    }
  });

  return {
    dom,
    contentDOM: code,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) {
        return false;
      }
      const nextLang = String(nextNode.attrs.language ?? '');
      if (nextLang.toLowerCase() === 'mermaid') {
        return false;
      }
      currentNode = nextNode;
      syncLanguageAttr(nextLang);
      return true;
    },
    stopEvent(event) {
      return event.target === langInput;
    },
    ignoreMutation(record) {
      return record.target === langInput || langInput.contains(record.target);
    },
  };
}

function createMermaidCodeBlockView(
  initialNode: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = initialNode;
  let isEditing = false;
  let destroyed = false;
  let renderSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const seed = `${Math.random().toString(36).slice(2, 8)}`;

  const dom = document.createElement('div');
  dom.className = 'elmark-mermaid';
  dom.contentEditable = 'false';

  const header = document.createElement('div');
  header.style.display = 'none';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.marginBottom = '8px';
  header.style.fontSize = '12px';
  header.style.color = 'var(--text-muted)';

  const langInput = document.createElement('input');
  langInput.type = 'text';
  langInput.value = String(initialNode.attrs.language ?? 'mermaid');
  langInput.setAttribute('aria-label', '代码块语言');
  Object.assign(langInput.style, {
    width: '100px',
    height: '22px',
    padding: '0 6px',
    border: '1px solid var(--border-strong)',
    borderRadius: '3px',
    background: 'var(--bg-canvas)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11.5px',
  });

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.textContent = '完成 (Esc)';
  Object.assign(doneBtn.style, {
    height: '22px',
    padding: '0 8px',
    border: '1px solid var(--border-strong)',
    borderRadius: '3px',
    background: 'var(--bg-canvas)',
    color: 'var(--text-secondary)',
    fontSize: '11.5px',
    cursor: 'pointer',
  });

  header.appendChild(langInput);
  header.appendChild(doneBtn);

  const textarea = document.createElement('textarea');
  textarea.className = 'elmark-mermaid-source';
  textarea.value = initialNode.textContent;
  textarea.rows = Math.max(3, initialNode.textContent.split('\n').length);
  Object.assign(textarea.style, {
    display: 'none',
    width: '100%',
    minHeight: '84px',
    marginBottom: '10px',
    padding: '10px 12px',
    border: '1px solid var(--border-strong)',
    borderRadius: '4px',
    background: 'var(--bg-code)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    lineHeight: '1.5',
    resize: 'vertical',
    outline: 'none',
  });

  const previewContainer = document.createElement('div');
  previewContainer.className = 'elmark-mermaid-preview';
  previewContainer.style.cursor = 'pointer';

  const errorBanner = document.createElement('div');
  errorBanner.className = 'elmark-mermaid-error';
  errorBanner.style.display = 'none';
  errorBanner.style.cursor = 'pointer';

  dom.appendChild(header);
  dom.appendChild(textarea);
  dom.appendChild(previewContainer);
  dom.appendChild(errorBanner);

  const renderCode = async (source: string): Promise<void> => {
    const seq = ++renderSeq;
    const result = await renderMermaidDiagram(source, seed);
    if (destroyed || seq !== renderSeq) {
      return;
    }

    if (result.ok) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
      previewContainer.style.display = 'block';
      previewContainer.innerHTML = result.svg;
    } else {
      previewContainer.style.display = 'none';
      previewContainer.innerHTML = '';
      errorBanner.style.display = 'block';
      errorBanner.textContent = result.error;
    }
  };

  const scheduleRender = (source: string): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void renderCode(source);
    }, MERMAID_DEBOUNCE_MS);
  };

  const setEditingMode = (editing: boolean, focusTextarea = false): void => {
    isEditing = editing;
    header.style.display = editing ? 'flex' : 'none';
    textarea.style.display = editing ? 'block' : 'none';
    dom.style.textAlign = editing ? 'left' : 'center';
    if (editing && focusTextarea) {
      textarea.focus();
    }
  };

  previewContainer.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!isEditing) {
      setEditingMode(true, true);
    }
  });

  errorBanner.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!isEditing) {
      setEditingMode(true, true);
    }
  });

  doneBtn.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  doneBtn.addEventListener('click', () => {
    setEditingMode(false);
    view.focus();
  });

  langInput.addEventListener('blur', () => {
    updateCodeBlockLanguage(view, getPos, langInput.value);
  });
  langInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      updateCodeBlockLanguage(view, getPos, langInput.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditingMode(false);
      view.focus();
    }
  });

  textarea.addEventListener('input', () => {
    const nextText = textarea.value;
    textarea.rows = Math.max(3, nextText.split('\n').length);
    updateCodeBlockText(view, getPos, nextText);
    scheduleRender(nextText);
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditingMode(false);
      view.focus();
    }
  });

  dom.addEventListener('focusout', (event) => {
    if (!isEditing) {
      return;
    }
    const related = event.relatedTarget as Node | null;
    if (related && dom.contains(related)) {
      return;
    }
    setEditingMode(false);
  });

  void renderCode(initialNode.textContent);

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) {
        return false;
      }
      const nextLang = String(nextNode.attrs.language ?? '');
      if (nextLang.toLowerCase() !== 'mermaid') {
        return false;
      }
      const textChanged = nextNode.textContent !== currentNode.textContent;
      currentNode = nextNode;

      if (textChanged) {
        if (textarea.value !== nextNode.textContent) {
          textarea.value = nextNode.textContent;
          textarea.rows = Math.max(3, nextNode.textContent.split('\n').length);
        }
        scheduleRender(nextNode.textContent);
      }
      return true;
    },
    stopEvent() {
      return true;
    },
    ignoreMutation() {
      return true;
    },
    destroy() {
      destroyed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}

/**
 * Custom `code_block` NodeView routing `mermaid` blocks to a dual-state
 * SVG preview/source editor and all other blocks to a clean `.elmark-code-block`.
 */
export const codeBlockViewPlugin = $view(
  codeBlockSchema.node,
  () => (node, view, getPos) => {
    const language = String(node.attrs.language ?? '')
      .trim()
      .toLowerCase();
    if (language === 'mermaid') {
      return createMermaidCodeBlockView(node, view, getPos);
    }
    return createStandardCodeBlockView(node, view, getPos);
  },
);

/**
 * Creates the custom `html` NodeView plugin that hides comment-only HTML
 * and safely renders sanitized reading HTML via DOMPurify.
 */
export function createHtmlViewPlugin(
  getDocumentDir: () => string | null,
  onOpenExternalUrl: (url: string) => void,
): MilkdownPlugin {
  return $view(htmlSchema.node, () => (initialNode) => {
    let currentNode = initialNode;
    const dom = document.createElement('span');
    dom.dataset.type = 'html';
    dom.contentEditable = 'false';

    const syncHtmlDom = (raw: string): void => {
      dom.dataset.value = raw;
      if (isHtmlCommentOnly(raw)) {
        dom.className = 'elmark-html-comment';
        dom.setAttribute('aria-hidden', 'true');
        dom.style.display = 'none';
        dom.innerHTML = '';
        return;
      }

      dom.className = 'elmark-html-block';
      dom.removeAttribute('aria-hidden');
      dom.style.display = 'block';
      dom.innerHTML = sanitizeReadingHtml(raw, getDocumentDir());
    };

    dom.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (anchor instanceof HTMLAnchorElement) {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const href = anchor.getAttribute('href');
          if (href) {
            onOpenExternalUrl(href);
          }
        }
      }
    });

    syncHtmlDom(String(initialNode.attrs.value ?? ''));

    return {
      dom,
      update(nextNode) {
        if (nextNode.type !== currentNode.type) {
          return false;
        }
        currentNode = nextNode;
        syncHtmlDom(String(nextNode.attrs.value ?? ''));
        return true;
      },
      stopEvent(event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return false;
        }
        return Boolean(target.closest('details, summary, a[href]'));
      },
      ignoreMutation() {
        return true;
      },
    };
  });
}

/**
 * Creates the custom `image` NodeView plugin that resolves local paths
 * dynamically via `resolveImageSrc`.
 */
export function createImageViewPlugin(
  getDocumentDir: () => string | null,
): MilkdownPlugin {
  return $view(imageSchema.node, () => (initialNode) => {
    let currentNode = initialNode;
    const img = document.createElement('img');

    const syncImageAttrs = (node: ProseNode): void => {
      const rawSrc = String(node.attrs.src ?? '');
      const resolved = resolveImageSrc(rawSrc, getDocumentDir());
      if (resolved) {
        img.setAttribute('src', resolved);
      } else {
        img.removeAttribute('src');
      }
      img.alt = String(node.attrs.alt ?? '');
      const title = String(node.attrs.title ?? '');
      if (title) {
        img.title = title;
      } else {
        img.removeAttribute('title');
      }
    };

    syncImageAttrs(initialNode);

    return {
      dom: img,
      update(nextNode) {
        if (nextNode.type !== currentNode.type) {
          return false;
        }
        currentNode = nextNode;
        syncImageAttrs(nextNode);
        return true;
      },
    };
  });
}
