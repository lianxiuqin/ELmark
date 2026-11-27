import DOMPurify from 'dompurify';
import { resolveImageSrc } from './localImageUrl';

const ALLOWED_TAGS = [
  'img',
  'details',
  'summary',
  'br',
  'div',
  'p',
  'span',
  'a',
  'sub',
  'sup',
  'kbd',
  'b',
  'i',
  'em',
  'strong',
  'code',
  'pre',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'ul',
  'ol',
  'li',
];

const ALLOWED_ATTR = [
  'src',
  'alt',
  'title',
  'width',
  'height',
  'align',
  'href',
  'open',
  'colspan',
  'rowspan',
];

const FORBID_TAGS = ['script', 'iframe', 'object', 'embed', 'style'];

// Allow DOMPurify's safe schemes plus elmark-local:// and Windows drive paths so img[src]
// survives initial sanitization and is then validated/rewritten via resolveImageSrc.
const SANITIZE_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|elmark-local):|[a-z]:[\\/]|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

// Standard safe URI check for <a href> so elmark-local: and raw drive paths are not exposed on anchors.
const SAFE_HREF_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const ATTR_WHITESPACE_RE = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g;
const HTML_COMMENTS_ONLY_RE = /^\s*(?:<!--[\s\S]*?-->\s*)+$/;

/**
 * Returns true when `rawHtml` consists solely of one or more HTML comments
 * (with optional surrounding/intervening whitespace).
 */
export function isHtmlCommentOnly(rawHtml: string): boolean {
  return HTML_COMMENTS_ONLY_RE.test(rawHtml);
}

/**
 * Sanitizes native HTML for reading mode with DOMPurify and rewrites `<img>`
 * `src` attributes through `resolveImageSrc`.
 */
export function sanitizeReadingHtml(rawHtml: string, documentDir: string | null): string {
  const fragment = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: SANITIZE_URI_REGEXP,
    RETURN_DOM_FRAGMENT: true,
  });

  for (const img of fragment.querySelectorAll('img')) {
    const rawSrc = img.getAttribute('src');
    if (rawSrc === null) {
      continue;
    }
    const resolved = resolveImageSrc(rawSrc, documentDir);
    if (resolved) {
      img.setAttribute('src', resolved);
    } else {
      img.removeAttribute('src');
    }
  }

  for (const anchor of fragment.querySelectorAll('a[href]')) {
    const rawHref = anchor.getAttribute('href') ?? '';
    const compactHref = rawHref.replace(ATTR_WHITESPACE_RE, '');
    if (!SAFE_HREF_REGEXP.test(compactHref)) {
      anchor.removeAttribute('href');
    }
  }

  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}
