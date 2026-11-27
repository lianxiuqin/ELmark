import path from 'node:path';

export const LOCAL_PROTOCOL_SCHEME = 'elmark-local';

const ALLOWED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
]);

export function decodeLocalAssetUrl(requestUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${LOCAL_PROTOCOL_SCHEME}:` || parsed.hostname !== 'asset') {
    return null;
  }

  const rawPath = parsed.searchParams.get('path');
  if (!rawPath || rawPath.trim().length === 0 || rawPath.includes('\0')) {
    return null;
  }

  // Reject UNC/network prefixes (e.g. \\host\share, //host/share) and trailing-separator directory paths.
  if (/^[\\/]{2}/.test(rawPath) || /[\\/]$/.test(rawPath)) {
    return null;
  }

  const segments = rawPath.split(/[\\/]+/);
  if (segments.includes('..')) {
    return null;
  }

  if (!path.isAbsolute(rawPath)) {
    return null;
  }

  const ext = path.extname(rawPath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return null;
  }

  return path.normalize(rawPath);
}
