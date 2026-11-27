import { describe, expect, it } from 'vitest';
import { joinFrontmatter, splitFrontmatter } from '../../../src/renderer/src/core/frontmatter';
import { resolveImageSrc } from '../../../src/renderer/src/core/localImageUrl';

describe('frontmatter (Review Focus #1)', () => {
  it('extracts YAML frontmatter and round-trips losslessly with LF and CRLF', () => {
    const crlf = '---\r\ntitle: 测试\r\ntags: [a, b]\r\n---\r\n# 标题\r\n正文';
    const split = splitFrontmatter(crlf);
    expect(split.frontmatter).toBe('title: 测试\r\ntags: [a, b]');
    expect(split.body).toBe('# 标题\r\n正文');
    expect(split.lineEnding).toBe('\r\n');
    expect(joinFrontmatter(split.frontmatter, split.body, split.lineEnding)).toBe(crlf);

    const lf = '---\ntitle: Hello\ndraft: true\n---\n# Heading\nBody\n';
    const splitLf = splitFrontmatter(lf);
    expect(splitLf.frontmatter).toBe('title: Hello\ndraft: true');
    expect(splitLf.body).toBe('# Heading\nBody\n');
    expect(splitLf.lineEnding).toBe('\n');
    expect(joinFrontmatter(splitLf.frontmatter, splitLf.body, splitLf.lineEnding)).toBe(lf);
  });

  it('does NOT treat a horizontal rule or unclosed --- as frontmatter', () => {
    const hrDoc = '---\n\n# Heading after rule\n';
    expect(splitFrontmatter(hrDoc).frontmatter).toBeNull();
    expect(splitFrontmatter(hrDoc).body).toBe(hrDoc);

    const midHr = '# Title\n\n---\n\nText\n';
    expect(splitFrontmatter(midHr).frontmatter).toBeNull();

    const emptyBetweenRules = '---\n   \n---\n# Heading\n';
    expect(splitFrontmatter(emptyBetweenRules).frontmatter).toBeNull();
    expect(splitFrontmatter(emptyBetweenRules).body).toBe(emptyBetweenRules);

    const twoRulesInBody = '# Title\n---\nkey: val\n---\nBody\n';
    expect(splitFrontmatter(twoRulesInBody).frontmatter).toBeNull();
  });

  it('returns body unchanged from joinFrontmatter when frontmatter is null', () => {
    const body = '# Plain document\r\nHello';
    expect(joinFrontmatter(null, body, '\r\n')).toBe(body);
  });
});

describe('resolveImageSrc (Review Focus #2)', () => {
  it('resolves relative Windows paths with spaces and Chinese chars to elmark-local://', () => {
    const res = resolveImageSrc('./图 片/demo 1.png', 'E:\\docs\\notes');
    expect(res).toBe(`elmark-local://asset?path=${encodeURIComponent('E:\\docs\\notes\\图 片\\demo 1.png')}`);
  });

  it('resolves parent directory traversal (../) relative to documentDir cleanly', () => {
    const res = resolveImageSrc('../assets/pic.jpg', 'E:\\docs\\notes');
    expect(res).toBe(`elmark-local://asset?path=${encodeURIComponent('E:\\docs\\assets\\pic.jpg')}`);
  });

  it('preserves http/https/data:image URLs and blocks javascript: URLs', () => {
    expect(resolveImageSrc('https://example.com/a.png', 'E:\\docs')).toBe('https://example.com/a.png');
    expect(resolveImageSrc('http://example.com/b.png', null)).toBe('http://example.com/b.png');
    expect(resolveImageSrc('data:image/png;base64,abc', null)).toBe('data:image/png;base64,abc');
    expect(resolveImageSrc('elmark-local://asset?path=E%3A%5Ca.png', null)).toBe(
      'elmark-local://asset?path=E%3A%5Ca.png',
    );
    expect(resolveImageSrc('javascript:alert(1)', 'E:\\docs')).toBe('');
    expect(resolveImageSrc('vbscript:msgbox(1)', 'E:\\docs')).toBe('');
    expect(resolveImageSrc('data:text/html,<script>alert(1)</script>', 'E:\\docs')).toBe('');
  });

  it('handles absolute Windows paths, null documentDir, and rejects UNC or directory paths', () => {
    expect(resolveImageSrc('C:/images/sub/../pic.webp', null)).toBe(
      `elmark-local://asset?path=${encodeURIComponent('C:\\images\\pic.webp')}`,
    );
    expect(resolveImageSrc('./local.png', null)).toBe('');
    expect(resolveImageSrc('\\\\server\\share\\pic.png', 'E:\\docs')).toBe('');
    expect(resolveImageSrc('./folder/', 'E:\\docs')).toBe('');
  });
});
