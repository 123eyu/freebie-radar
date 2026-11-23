import { getLang, LANGS, setLang, t } from "../lib/i18n.ts";

/**
 * 界面语言切换：单按钮在「中 / EN」之间互切。
 * 切换走 setLang（写 localStorage + 整页重载），因此这里不需要任何订阅状态。
 */
export function LangSwitch({ className }: { className?: string }) {
  const current = getLang();
  const target = LANGS.find((l) => l.key !== current) ?? LANGS[0]!;
  const label = t("切换界面语言：{lang}", { lang: target.label });

  return (
    <button
      type="button"
      onClick={() => setLang(target.key)}
      className={
        className ??
        "inline-flex h-7 items-center gap-1 rounded-md border border-ink-200 bg-surface px-2 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950"
      }
      title={label}
      aria-label={label}
    >
      <span className="font-mono text-[11px] font-semibold tracking-tight">{target.short}</span>
    </button>
  );
}
