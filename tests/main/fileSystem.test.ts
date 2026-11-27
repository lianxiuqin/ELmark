import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readMarkdownFile, scanMarkdownTree, writeMarkdownFile } from '../../src/main/fileTree';
import { decodeLocalAssetUrl } from '../../src/main/localProtocol';
import { DocumentFileWatcher } from '../../src/main/fileWatcher';

describe('scanMarkdownTree', () => {
  it('filters .git/node_modules, non-md files, and empty dirs, sorting dirs before files', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'elmark-tree-'));
    await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'empty'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'docs'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.git', 'a.md'), '# ignored');
    await fs.writeFile(path.join(tmp, 'node_modules', 'b.md'), '# ignored');
    await fs.writeFile(path.join(tmp, 'notes.txt'), 'plain');
    await fs.writeFile(path.join(tmp, 'docs', 'guide.md'), '# guide');
    await fs.writeFile(path.join(tmp, 'readme.md'), '# readme');

    const tree = await scanMarkdownTree(tmp);
    expect(tree.map((n) => [n.type, n.name])).toEqual([['directory', 'docs'], ['file', 'readme.md']]);
    expect(tree[0].children?.map((n) => n.name)).toEqual(['guide.md']);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('skips inaccessible subdirectories (EACCES/EPERM) cleanly without throwing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'elmark-perm-'));
    const lockedDir = path.join(tmp, 'locked');
    const goodDir = path.join(tmp, 'good');
    await fs.mkdir(lockedDir, { recursive: true });
    await fs.mkdir(goodDir, { recursive: true });
    await fs.writeFile(path.join(goodDir, 'ok.md'), '# ok');
    await fs.writeFile(path.join(tmp, 'top.md'), '# top');

    const origReaddir = fs.readdir.bind(fs);
    const spy = vi.spyOn(fs, 'readdir').mockImplementation((async (dirPath: any, options?: any) => {
      if (path.resolve(String(dirPath)) === path.resolve(lockedDir)) {
        const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
        throw err;
      }
      return origReaddir(dirPath, options);
    }) as typeof fs.readdir);

    try {
      const tree = await scanMarkdownTree(tmp);
      expect(tree.map((n) => [n.type, n.name])).toEqual([
        ['directory', 'good'],
        ['file', 'top.md'],
      ]);
      expect(tree[0].children?.map((n) => n.name)).toEqual(['ok.md']);
    } finally {
      spy.mockRestore();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('readMarkdownFile', () => {
  it('reads UTF-8 content and populates filePath, fileName, and dirPath', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'elmark-read-'));
    const file = path.join(tmp, 'sample.md');
    await writeMarkdownFile(file, '# 标题\n内容');
    const opened = await readMarkdownFile(file);
    expect(opened).toEqual({
      filePath: path.resolve(file),
      fileName: 'sample.md',
      dirPath: path.resolve(tmp),
      content: '# 标题\n内容',
    });
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe('decodeLocalAssetUrl', () => {
  it('decodes Windows paths with Chinese characters and spaces for allowed image extensions', () => {
    const raw = 'E:\\文档\\图 片\\demo.png';
    const url = `elmark-local://asset?path=${encodeURIComponent(raw)}`;
    expect(decodeLocalAssetUrl(url)).toBe(path.normalize(raw));
  });

  it('rejects non-image files, traversal segments, and malformed URLs', () => {
    const url = `elmark-local://asset?path=${encodeURIComponent('C:\\Windows\\System32\\cmd.exe')}`;
    expect(decodeLocalAssetUrl(url)).toBeNull();
    expect(decodeLocalAssetUrl(`elmark-local://asset?path=${encodeURIComponent('E:\\docs\\..\\secret.png')}`)).toBeNull();
    expect(decodeLocalAssetUrl('http://example.com/a.png')).toBeNull();
  });

  it('rejects Windows UNC/network paths and trailing-separator directory paths', () => {
    expect(
      decodeLocalAssetUrl(`elmark-local://asset?path=${encodeURIComponent('\\\\attacker\\share\\a.png')}`),
    ).toBeNull();
    expect(
      decodeLocalAssetUrl(`elmark-local://asset?path=${encodeURIComponent('//attacker/share/a.png')}`),
    ).toBeNull();
    expect(
      decodeLocalAssetUrl(`elmark-local://asset?path=${encodeURIComponent('E:\\folder.png\\')}`),
    ).toBeNull();
    expect(
      decodeLocalAssetUrl(`elmark-local://asset?path=${encodeURIComponent('E:/folder.png/')}`),
    ).toBeNull();
  });
});

describe('DocumentFileWatcher (Review Focus #4)', () => {
  it('suppresses external change notifications triggered by markSelfWrite', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'elmark-watch-'));
    const file = path.join(tmp, 'test.md');
    await writeMarkdownFile(file, '# init');
    const onExternal = vi.fn();
    const watcher = new DocumentFileWatcher();
    watcher.watch(file, onExternal);

    watcher.markSelfWrite(file, 400);
    await writeMarkdownFile(file, '# self save');
    await new Promise((r) => setTimeout(r, 220));
    expect(onExternal).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 260));
    await writeMarkdownFile(file, '# external edit');
    await new Promise((r) => setTimeout(r, 300));
    expect(onExternal).toHaveBeenCalledTimes(1);

    watcher.stop();
    await fs.rm(tmp, { recursive: true, force: true });
  });
});
