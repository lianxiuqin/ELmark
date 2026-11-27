export type LineEnding = '\r\n' | '\n';

export interface FrontmatterSplit {
  frontmatter: string | null;
  body: string;
  lineEnding: LineEnding;
}

const FRONTMATTER_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function detectLineEnding(text: string): LineEnding {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function hasNonEmptyLine(block: string): boolean {
  return block.split(/\r?\n/).some((line) => line.trim().length > 0);
}

/**
 * Splits leading YAML frontmatter (`--- ... ---`) from the Markdown body while
 * preserving the exact YAML content and line-ending style.
 */
export function splitFrontmatter(rawMarkdown: string): FrontmatterSplit {
  const lineEnding = detectLineEnding(rawMarkdown);
  const match = FRONTMATTER_REGEX.exec(rawMarkdown);

  if (!match || !hasNonEmptyLine(match[1])) {
    return {
      frontmatter: null,
      body: rawMarkdown,
      lineEnding,
    };
  }

  return {
    frontmatter: match[1],
    body: rawMarkdown.slice(match[0].length),
    lineEnding,
  };
}

/**
 * Reassembles YAML frontmatter and Markdown body losslessly.
 */
export function joinFrontmatter(
  frontmatter: string | null,
  body: string,
  lineEnding?: LineEnding,
): string {
  if (frontmatter === null) {
    return body;
  }

  const eol = lineEnding ?? detectLineEnding(frontmatter.includes('\r\n') ? frontmatter : body);
  return `---${eol}${frontmatter}${eol}---${eol}${body}`;
}
