const LOCAL_PROTOCOL_PREFIX = 'elmark-local://asset?path=';

function collapseSegments(rawSegments: string[]): string[] {
  const stack: string[] = [];
  for (const segment of rawSegments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }
    stack.push(segment);
  }
  return stack;
}

function normalizeAbsolutePath(rawPath: string): string | null {
  const driveMatch = rawPath.match(/^([a-zA-Z]:)(.*)$/);
  if (driveMatch) {
    const drive = driveMatch[1];
    const parts = collapseSegments(driveMatch[2].split(/[\\/]+/));
    return parts.length > 0 ? `${drive}\\${parts.join('\\')}` : null;
  }

  if (rawPath.startsWith('/')) {
    const parts = collapseSegments(rawPath.split(/[\\/]+/));
    return parts.length > 0 ? `/${parts.join('/')}` : null;
  }

  return null;
}

function resolveAbsoluteLocalPath(src: string, documentDir: string | null): string | null {
  if (/^[\\/]{2}/.test(src) || /[\\/]$/.test(src) || src.includes('\0')) {
    return null;
  }

  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')) {
    return normalizeAbsolutePath(src);
  }

  // Reject drive-relative paths such as "C:foo.png".
  if (/^[a-zA-Z]:/.test(src)) {
    return null;
  }

  const baseDir = documentDir?.trim() ?? '';
  if (!baseDir || /^[\\/]{2}/.test(baseDir) || baseDir.includes('\0')) {
    return null;
  }

  if (/^[a-zA-Z]:([\\/]|$)/.test(baseDir)) {
    return normalizeAbsolutePath(`${baseDir}\\${src}`);
  }

  if (baseDir.startsWith('/')) {
    return normalizeAbsolutePath(`${baseDir}/${src}`);
  }

  return null;
}

/**
 * Resolves an image `src` into a safe renderer URL: preserves `http(s)://`,
 * `data:image/`, and `elmark-local://` URLs, blocks unsafe schemes, and maps
 * local paths (relative or absolute) to `elmark-local://asset?path=...`.
 */
export function resolveImageSrc(rawSrc: string, documentDir: string | null): string {
  const trimmed = rawSrc.trim();
  if (!trimmed) {
    return '';
  }

  const compactScheme = trimmed.replace(/[\u0000-\u0020]+/g, '');
  if (/^(javascript|vbscript):/i.test(compactScheme)) {
    return '';
  }

  if (/^data:/i.test(compactScheme)) {
    return /^data:image\//i.test(trimmed) ? trimmed : '';
  }

  if (/^https?:\/\//i.test(trimmed) || /^elmark-local:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Reject other explicit URI schemes (2+ characters before ':') while allowing Windows drive letters (e.g. "C:\").
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(compactScheme)) {
    return '';
  }

  const resolvedPath = resolveAbsoluteLocalPath(trimmed, documentDir);
  if (!resolvedPath) {
    return '';
  }

  return `${LOCAL_PROTOCOL_PREFIX}${encodeURIComponent(resolvedPath)}`;
}
