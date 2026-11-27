import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractOutline } from '../../../src/renderer/src/core/outline';

describe('extractOutline (Review Focus #3)', () => {
  it('extracts H1-H6 headings in order and strips inline markdown emphasis', () => {
    const md = '# 一级 **标题**\n正文\n## 二级 `code`\n### 三级 [link](https://example.com)\n###### 六级';
    const items = extractOutline(md);
    expect(items.map((i) => [i.level, i.text, i.index])).toEqual([
      [1, '一级 标题', 0],
      [2, '二级 code', 1],
      [3, '三级 link', 2],
      [6, '六级', 3],
    ]);
  });

  it('ignores # lines inside fenced ``` and ~~~ code blocks', () => {
    const md = '# Real Heading\n```python\n# not a heading\n## also not\n```\n~~~\n# tilde fence\n~~~\n## Second Real';
    expect(extractOutline(md).map((i) => i.text)).toEqual(['Real Heading', 'Second Real']);
  });

  it('respects fence character and minimum closing fence length and handles CRLF', () => {
    const md = [
      '````markdown',
      '```',
      '# Still inside 4-backtick fence',
      '~~~',
      '# Still inside',
      '````',
      '### After Fence ###  ',
      '# __Bold__ *Em* _It_ ~~Strike~~ ![Alt](img.png)',
    ].join('\r\n');

    expect(extractOutline(md)).toEqual([
      { id: 'heading-0', level: 3, text: 'After Fence', index: 0 },
      { id: 'heading-1', level: 1, text: 'Bold Em It Strike Alt', index: 1 },
    ]);
  });

  it('assigns unique sequential ids and ignores lines without space after # or >6 hashes', () => {
    const md = '#hashtag\n####### Seven\n# First\n## Second\n# First';
    expect(extractOutline(md)).toEqual([
      { id: 'heading-0', level: 1, text: 'First', index: 0 },
      { id: 'heading-1', level: 2, text: 'Second', index: 1 },
      { id: 'heading-2', level: 1, text: 'First', index: 2 },
    ]);
  });
});

describe('typora-light.css spec tokens', () => {
  it('includes spec palette tokens, H1-H3 bottom borders, and @media print rules', () => {
    const css = fs.readFileSync(path.resolve('src/renderer/src/styles/typora-light.css'), 'utf-8');
    for (const token of [
      '#ffffff',
      '#f7f7f7',
      '#333333',
      '#eaecef',
      '#f6f8fa',
      '@media print',
      'break-after: avoid',
      'break-inside: avoid',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('defines required ELmark component selectors and A4 print page rules', () => {
    const css = fs.readFileSync(path.resolve('src/renderer/src/styles/typora-light.css'), 'utf-8');
    const requiredSelectors = [
      '--bg-canvas: #ffffff',
      '--bg-sidebar: #f7f7f7',
      '--text-primary: #333333',
      '--border-subtle: #eaecef',
      '--bg-code: #f6f8fa',
      '.elmark-app',
      '.elmark-titlebar',
      '.elmark-sidebar',
      '.elmark-frontmatter',
      '.elmark-banner',
      '.elmark-findbar',
      '.elmark-editor-scroll',
      '.elmark-prose',
      '.ProseMirror',
      '.elmark-source-editor',
      '.elmark-code-block',
      '.elmark-mermaid',
      '.elmark-mermaid-error',
      '.elmark-table-toolbar',
      '.elmark-link-bubble',
      '.elmark-html-block',
      '.elmark-html-comment',
      '@page',
      'size: A4',
      'max-width: 820px',
    ];
    for (const selector of requiredSelectors) {
      expect(css).toContain(selector);
    }
  });
});
