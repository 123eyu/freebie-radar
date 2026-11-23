import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { getCurrentTheme, setThemeMode, subscribeTheme } from "../lib/theme.ts";
import { t } from "../lib/i18n.ts";

/**
 * 主题切换：单按钮在浅色 / 深色之间互切，首次点击后不再跟随系统。
 * 状态来自 lib/theme.ts 的模块级 store——侧栏与移动端顶栏各有一个按钮，
 * 两处必须同时翻，所以不能用各自的 useState。
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getCurrentTheme, getCurrentTheme);
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? t("切换到深色模式") : t("切换到浅色模式");

  return (
    <button
      type="button"
      onClick={() => setThemeMode(next)}
      className={
        className ??
        "inline-flex h-7 items-center justify-center rounded-md border border-ink-200 bg-surface px-2 text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950"
      }
      title={label}
      aria-label={label}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
