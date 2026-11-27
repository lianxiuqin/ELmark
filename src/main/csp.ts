/**
 * Builds the Content-Security-Policy header for production vs Vite dev server.
 */
export function buildCspHeader(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' elmark-local: https: http: data: blob:",
    "font-src 'self' data:",
  ];

  if (isDev) {
    directives.push("connect-src 'self' ws: http:");
  }

  return directives.join('; ');
}
