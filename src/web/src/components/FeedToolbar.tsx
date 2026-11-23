import { CheckCheck, ChevronDown, MoreHorizontal } from "lucide-react";
import { FeedViewSwitch, type FeedView } from "./FeedViewSwitch.tsx";
import { t } from "../lib/i18n.ts";

/** One calm row: what this channel enforces, how many items, how to view them, and the rare actions. */
export function FeedToolbar({ policyLabels, loading, total, view, onView, showSummary, canToggleSummary, onToggleSummary, canMarkRead, onMarkRead }: {
  policyLabels: string[];
  loading: boolean;
  total: number;
  view: FeedView;
  onView: (view: FeedView) => void;
  showSummary: boolean;
  canToggleSummary: boolean;
  onToggleSummary: () => void;
  canMarkRead: boolean;
  onMarkRead: () => void;
}) {
  const full = policyLabels.length ? policyLabels.map((label) => t(label)).join(" · ") : t("按当前视图浏览");
  return <div className="feed-toolbar">
    <details className="feed-rule-note">
      <summary aria-label={t("查看频道条件")}>
        <span className="hidden sm:inline">{full}</span>
        <span className="truncate sm:hidden">{t(policyLabels[0] ?? "按当前视图浏览")}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </summary>
      <p>{full}</p>
    </details>
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <span className="text-[12px] whitespace-nowrap text-ink-500" aria-live="polite">{loading ? t("加载中…") : t("共 {count} 条", { count: total })}</span>
      <FeedViewSwitch value={view} onChange={onView} />
      <details className="feed-more">
        <summary aria-label={t("更多操作")} title={t("更多操作")}><MoreHorizontal size={16} aria-hidden="true" /></summary>
        <div className="feed-more-menu">
          {canToggleSummary && <button type="button" aria-pressed={showSummary} onClick={onToggleSummary}>{t("显示摘要")}</button>}
          <button type="button" disabled={!canMarkRead} onClick={onMarkRead}>{t("标已读")}</button>
        </div>
      </details>
    </div>
  </div>;
}
