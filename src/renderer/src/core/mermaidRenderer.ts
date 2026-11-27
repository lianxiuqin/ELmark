import mermaid from 'mermaid';

export type MermaidRenderResult =
  | { ok: true; svg: string }
  | { ok: false; error: string };

let mermaidInitialized = false;
let renderSequence = 0;

function ensureMermaidInitialized(): void {
  if (mermaidInitialized) {
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
  });
  mermaidInitialized = true;
}

function sanitizeIdSeed(idSeed: string): string {
  const cleaned = idSeed.replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'diagram';
}

function formatMermaidError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  const text = String(error ?? '').trim();
  return text.length > 0 ? text : 'Mermaid 语法解析失败';
}

/**
 * Parses and renders a Mermaid diagram source string in strict security mode.
 * Never throws; syntax or runtime rendering errors return `{ ok: false, error }`.
 */
export async function renderMermaidDiagram(
  code: string,
  idSeed: string,
): Promise<MermaidRenderResult> {
  if (!code || code.trim().length === 0) {
    return { ok: false, error: 'Mermaid 代码不能为空' };
  }

  ensureMermaidInitialized();
  renderSequence += 1;
  const renderId = `elmark-mermaid-${sanitizeIdSeed(idSeed)}-${renderSequence}`;

  try {
    await mermaid.parse(code);
    const { svg } = await mermaid.render(renderId, code);
    return { ok: true, svg };
  } catch (error) {
    if (typeof document !== 'undefined') {
      document.getElementById(renderId)?.remove();
    }
    return { ok: false, error: formatMermaidError(error) };
  }
}
