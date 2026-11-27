import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

export interface LinkBubbleProps {
  visible: boolean;
  top: number;
  left: number;
  href: string;
  onApply: (nextHref: string) => void;
  onOpenExternal: (href: string) => void;
  onClose: () => void;
}

/**
 * Floating micro-popover for inspecting, editing, or externally opening links.
 */
export function LinkBubble({
  visible,
  top,
  left,
  href,
  onApply,
  onOpenExternal,
  onClose,
}: LinkBubbleProps) {
  const [draftHref, setDraftHref] = useState(href);

  useEffect(() => {
    setDraftHref(href);
  }, [href, visible]);

  if (!visible) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(draftHref.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="elmark-link-bubble"
      role="dialog"
      aria-label="链接编辑气泡"
      style={{ top, left }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <input
          type="text"
          value={draftHref}
          onChange={(event) => setDraftHref(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入链接地址..."
          aria-label="链接地址"
          style={{
            width: '210px',
            height: '24px',
            padding: '0 6px',
            border: '1px solid var(--border-strong)',
            borderRadius: '4px',
            background: 'var(--bg-canvas)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button type="submit" title="应用链接">
          应用
        </button>
        <button
          type="button"
          title="打开链接"
          onClick={() => onOpenExternal(draftHref.trim())}
        >
          打开
        </button>
        <button type="button" title="关闭" onClick={onClose}>
          ×
        </button>
      </form>
    </div>
  );
}
