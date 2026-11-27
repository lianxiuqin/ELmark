// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isHtmlCommentOnly, sanitizeReadingHtml } from '../../../src/renderer/src/core/htmlSanitizer';

describe('sanitizeReadingHtml (Review Focus #2)', () => {
  it('preserves reading tags (<details>, <summary>, <img width>, <div align>, <br>, <sub>/<sup>/<kbd>)', () => {
    const html = '<details open><summary>展开</summary><div align="center"><img src="./图 片/a.png" width="400" alt="demo" /></div><br/><kbd>Ctrl</kbd><sub>2</sub><sup>3</sup></details>';
    const out = sanitizeReadingHtml(html, 'E:\\notes');
    expect(out).toContain('<details');
    expect(out).toContain('<summary>展开</summary>');
    expect(out).toContain('width="400"');
    expect(out).toContain('align="center"');
    expect(out).toContain(`elmark-local://asset?path=${encodeURIComponent('E:\\notes\\图 片\\a.png')}`);
    expect(out).toContain('<kbd>Ctrl</kbd>');
    expect(out).toContain('<sub>2</sub>');
    expect(out).toContain('<sup>3</sup>');
  });

  it('strips <script>, <iframe>, onerror handlers, and javascript: hrefs', () => {
    const xss = '<script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="./a.png" onerror="alert(2)"><a href="javascript:alert(3)">click</a>';
    const out = sanitizeReadingHtml(xss, 'E:\\notes');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('javascript:');
  });

  it('strips <object>, <embed>, <style>, and vbscript:/data:html vectors', () => {
    const xss = '<style>body{display:none}</style><object data="x"></object><embed src="y"><div onclick="alert(1)"><a href="vbscript:msgbox(1)">vb</a><a href="elmark-local://asset?path=x">local</a><a href="C:\\secret.txt">win</a><img src="data:text/html,<script>1</script>" alt="bad"></div>';
    const out = sanitizeReadingHtml(xss, 'E:\\notes');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('vbscript:');
    expect(out).not.toContain('elmark-local:');
    expect(out).not.toContain('C:\\secret.txt');
    expect(out).not.toContain('data:text/html');
    expect(out).toContain('alt="bad"');
  });

  it('rewrites Windows absolute and relative image paths and removes src when unresolved', () => {
    const withWinAbs = sanitizeReadingHtml('<img src="C:\\assets\\pic.png" alt="abs">', 'E:\\notes');
    expect(withWinAbs).toContain(`elmark-local://asset?path=${encodeURIComponent('C:\\assets\\pic.png')}`);

    const withLocalScheme = sanitizeReadingHtml('<img src="elmark-local://asset?path=E%3A%5Cnotes%5Ca.png" alt="local">', null);
    expect(withLocalScheme).toContain('elmark-local://asset?path=E%3A%5Cnotes%5Ca.png');

    const withHttpAndData = sanitizeReadingHtml('<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA">', null);
    expect(withHttpAndData).toContain('https://example.com/a.png');
    expect(withHttpAndData).toContain('data:image/png;base64,AAAA');

    const unresolved = sanitizeReadingHtml('<img src="./missing-dir.png" alt="unresolved">', null);
    expect(unresolved).toContain('<img');
    expect(unresolved).toContain('alt="unresolved"');
    expect(unresolved).not.toContain('src=');
  });

  it('identifies pure HTML comments so they stay invisible while preserving raw markdown', () => {
    expect(isHtmlCommentOnly('<!-- todo: check later -->')).toBe(true);
    expect(isHtmlCommentOnly('  <!-- a -->\n<!-- b -->  ')).toBe(true);
    expect(isHtmlCommentOnly('<!-- c --><p>hi</p>')).toBe(false);
    expect(isHtmlCommentOnly('')).toBe(false);
    expect(isHtmlCommentOnly('   \n  ')).toBe(false);
  });
});
