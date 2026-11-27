import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileTreeNode, OpenedFile } from '../shared/ipc';

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  '.idea',
  '.vscode',
  'dist',
  'out',
]);

export function isMarkdownFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

export async function scanMarkdownTree(rootDir: string): Promise<FileTreeNode[]> {
  const resolvedRoot = path.resolve(rootDir);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(resolvedRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(resolvedRoot, entry.name);
    if (entry.isDirectory()) {
      let children: FileTreeNode[] = [];
      try {
        children = await scanMarkdownTree(fullPath);
      } catch {
        children = [];
      }
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
        });
      }
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: 'file',
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function readMarkdownFile(filePath: string): Promise<OpenedFile> {
  const resolvedPath = path.resolve(filePath);
  const content = await fs.readFile(resolvedPath, 'utf8');
  return {
    filePath: resolvedPath,
    content,
    fileName: path.basename(resolvedPath),
    dirPath: path.dirname(resolvedPath),
  };
}

export async function writeMarkdownFile(filePath: string, content: string): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  await fs.writeFile(resolvedPath, content, 'utf8');
}
