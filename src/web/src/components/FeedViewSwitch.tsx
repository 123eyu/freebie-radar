import { AlignJustify, LayoutGrid } from "lucide-react";
import { t } from "../lib/i18n.ts";

export type FeedView = "compact" | "grid2" | "grid3";
const VIEWS = [
  { value: "compact" as const, text: "列表", label: "紧凑列表", icon: AlignJustify },
  { value: "grid2" as const, text: "2列", label: "双列卡片", icon: LayoutGrid },
  { value: "grid3" as const, text: "3列", label: "三列卡片", icon: LayoutGrid },
];

export function FeedViewSwitch({ value, onChange }: { value: FeedView; onChange: (value: FeedView) => void }) {
  return <div className="feed-view-switch" role="group" aria-label={t("资源视图")}>
    {VIEWS.map((view) => <button key={view.value} type="button" data-view={view.value} aria-label={t(view.label)} aria-pressed={value === view.value}
      onClick={() => onChange(view.value)} title={t(view.label)}>
      <view.icon size={13} />
      {view.value === "grid2" ? <><span className="md:hidden">{t("卡片")}</span><span className="hidden md:inline">{t(view.text)}</span></> : <span>{t(view.text)}</span>}
    </button>)}
  </div>;
}
