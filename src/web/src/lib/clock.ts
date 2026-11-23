import { useSyncExternalStore } from "react";

/**
 * 相对时间需要一个会走的时钟，否则「刚刚」会一直停在页面打开的那一刻。
 *
 * 这里把时钟做成模块级外部 store + `useSyncExternalStore`：只有订阅它的
 * `<RelativeTime>` 重渲染，431 行的列表不会每 30 秒整体重画一遍。
 */

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  for (const notify of listeners) notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // 标签页切回来时先补一次，避免显示停留在后台时的旧值
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }
  if (!timer) timer = setInterval(tick, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
    if (typeof document !== "undefined" && listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

function onVisible() {
  if (document.visibilityState === "visible") tick();
}

function getSnapshot(): number {
  return now;
}

/** 会走的当前时间（毫秒），每 30 秒跳一次。 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
