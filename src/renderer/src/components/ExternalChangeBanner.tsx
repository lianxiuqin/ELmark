export interface ExternalChangeBannerProps {
  visible: boolean;
  onReload: () => void;
  onIgnore: () => void;
}

/**
 * Non-intrusive banner notifying the user when the active file changed externally on disk.
 */
export function ExternalChangeBanner({
  visible,
  onReload,
  onIgnore,
}: ExternalChangeBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="elmark-banner" role="status">
      <span>当前文件已在外部被修改，是否重新加载？</span>
      <div className="elmark-banner-actions">
        <button type="button" className="elmark-banner-btn" onClick={onReload}>
          重新加载
        </button>
        <button type="button" className="elmark-banner-btn" onClick={onIgnore}>
          忽略
        </button>
      </div>
    </div>
  );
}
