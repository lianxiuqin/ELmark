import type { OutlineItem } from '@shared/ipc';

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX_HEADING_RE = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

interface FenceState {
  char: '`' | '~';
  length: number;
}

function stripInlineMarkdown(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]+?)`+/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*]+?)\*/g, '$1')
    .replace(/(?<![a-zA-Z0-9])_([^_]+?)_(?![a-zA-Z0-9])/g, '$1')
    .trim();
}

function isClosingFence(line: string, fence: FenceState): boolean {
  const trimmedStart = line.replace(/^ {0,3}/, '');
  if (!trimmedStart.startsWith(fence.char)) {
    return false;
  }

  let runLength = 0;
  while (runLength < trimmedStart.length && trimmedStart[runLength] === fence.char) {
    runLength += 1;
  }

  if (runLength < fence.length) {
    return false;
  }

  return /^[ \t]*$/.test(trimmedStart.slice(runLength));
}

/**
 * Extracts H1–H6 ATX headings from a Markdown body in document order,
 * ignoring lines inside fenced code blocks and stripping inline formatting.
 */
export function extractOutline(markdownBody: string): OutlineItem[] {
  if (!markdownBody) {
    return [];
  }

  const items: OutlineItem[] = [];
  const lines = markdownBody.split(/\r?\n/);
  let activeFence: FenceState | null = null;

  for (const line of lines) {
    if (activeFence) {
      if (isClosingFence(line, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    const fenceMatch = FENCE_OPEN_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const info = fenceMatch[2];
      const char = marker[0] as '`' | '~';
      // CommonMark: backtick fence info strings cannot contain backticks.
      if (char === '`' && info.includes('`')) {
        // Not a valid opening fence; fall through to heading check.
      } else {
        activeFence = { char, length: marker.length };
        continue;
      }
    }

    const headingMatch = ATX_HEADING_RE.exec(line);
    if (!headingMatch) {
      continue;
    }

    const text = stripInlineMarkdown(headingMatch[2]);
    if (!text) {
      continue;
    }

    const index = items.length;
    items.push({
      id: `heading-${index}`,
      level: headingMatch[1].length as OutlineItem['level'],
      text,
      index,
    });
  }

  return items;
}
