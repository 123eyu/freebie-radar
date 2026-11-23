/**
 * 主题：跟随系统 / 浅色 / 深色三态，落到 `<html data-theme>` 上。
 *
 * 不用 Tailwind 的 `dark:` 变体，也不用 prefers-color-scheme 直接出样式：
 * 深色是同一套语义 token 的另一组取值（styles.css 的 `html[data-theme="dark"]`），
 * 组件代码不用写两遍。选 `data-theme` 而不是媒体查询，是因为要支持手动指定
 * 「永远浅色」——顺带绕开安卓 Chrome 自动深色反相把整站糊成黑底灰框的问题。
 */

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "radar_theme";
const MEDIA = "(prefers-color-scheme: dark)";

export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // 隐私模式下 localStorage 可能抛错，按跟随系统处理
  }
  return "system";
}

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia(MEDIA).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(mode: ThemeMode = getThemeMode()): ResolvedTheme {
  return mode === "system" ? systemTheme() : mode;
}

/** 把主题写到 `<html data-theme>`，并同步 `<meta name="color-scheme">`。 */
export function applyTheme(mode: ThemeMode = getThemeMode()): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved === "dark" ? "only dark" : "only light";
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "only dark" : "only light");
  return resolved;
}

export function setThemeMode(mode: ThemeMode): ResolvedTheme {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 存不下就只在本次会话生效
  }
  current = applyTheme(mode);
  notify();
  return current;
}
/**
 * 模块级主题 store：同一页面里侧栏和移动端顶栏各有一个切换按钮，
 * 用外部 store + useSyncExternalStore 让它们始终同步，而不是各持一份 useState。
 */
const listeners = new Set<() => void>();
let current: ResolvedTheme = "light";

function notify() {
  for (const listener of listeners) listener();
}

export function getCurrentTheme(): ResolvedTheme {
  return current;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 页面加载即调用：先按当前设定刷一次，避免深色用户看到白屏闪一下。 */
export function initTheme(): void {
  current = applyTheme();
  try {
    window.matchMedia(MEDIA).addEventListener("change", () => {
      if (getThemeMode() === "system") {
        current = applyTheme("system");
        notify();
      }
    });
  } catch {
    // 老浏览器没有 addEventListener，忽略
  }
}
