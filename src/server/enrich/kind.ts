import { DEAL_HINT, isNoiseTitle, OPENSOURCE_HINT, PROMO_HINT } from "./noise.ts";
import { KIND_LABEL, KIND_SET, isContentKind, type ContentKind } from "../../shared/taxonomy.ts";
import { contentSignals } from "./evidence.ts";

export type { ContentKind };
export { KIND_LABEL, isContentKind };
/** 兼容旧名：可被识别的全部形态（含 noise）。 */
export { KIND_SET as VALID_KINDS };

const OPENSOURCE_SOURCES = new Set([
  "github-free-for-dev",
  "github-public-apis",
  "github-awesome-ai",
  "github-selfhosted",
]);

const DEAL_SOURCES = new Set([
  "rss-lowendbox",
  "rss-lowendtalk",
  "rss-lowendspirit",
  "rss-vpsgo",
  "rss-vpsxb",
  "rss-reddit-gamedeals",
  "rss-reddit-googleplay",
  "rss-9to5toys",
  "rss-slickdeals",
  "rss-hip2save",
  "rss-ozbargain",
  "rss-smzdm",
]);

export const NEWS_SOURCES = new Set([
  "cctv-news",
  "rss-chinanews-scroll",
  "rss-chinanews-china",
  "rss-chinanews-world",
  "rss-bbc-zh",
  "rss-dw-cn",
  "rss-rfi-cn",
  "rss-gnews-cn",
  "rss-gnews-world",
  "rss-nikkei-cn",
  "rss-voa-cn",
]);

export function isAuthoritativeNewsSource(
  sourceId: string | null | undefined,
  kindHint?: string | null,
): boolean {
  return kindHint === "news" || Boolean(sourceId && NEWS_SOURCES.has(sourceId));
}

const INFO_SOURCES = new Set([
  "cctv-economy",
  "cctv-tech",
  "rss-wallstreetcn",
  "rss-chinanews-finance",
  "rss-chinanews-it",
  "rss-ruanyifeng",
  "rss-sspai",
  "rss-appinn",
  "rss-producthunt",
  "rss-hnrss",
  "rss-ithome",
  "rss-v2ex-tech",
  "rss-solidot",
]);

/**
 * 规则兜底推断内容形态（AI 未审或未返回 kind 时使用）。
 * 原则：硬噪音判 noise；明确开源且无纯白嫖词判 opensource；付费/黑五/特价促销判 deal；
 * 权威时政/国际要闻判 news；经济/股票/科技/深度指南判 info；其余按免费信号落位。
 */
export function guessKind(input: {
  title: string;
  summary?: string;
  sourceId?: string;
  category?: string | null;
  obtain?: string | null;
  isFree?: boolean;
  price?: number | null;
  freebieOnlySource?: boolean;
  kindHint?: string | null;
  guardEnabled?: boolean;
}): ContentKind {
  const title = input.title ?? "";
  const text = `${title} ${input.summary ?? ""}`;
  const guard = input.guardEnabled !== false;
  const signals = contentSignals(title, input.summary);
  if (isNoiseTitle(title)) return "noise";
  if (input.freebieOnlySource) return "freebie";
  if (input.kindHint && isContentKind(input.kindHint) && input.kindHint !== "noise") {
    if (!guard || !["freebie", "deal", "opensource"].includes(input.kindHint) ||
        (input.kindHint === "freebie" && signals.claim) || (input.kindHint === "deal" && signals.promotion) ||
        (input.kindHint === "opensource" && signals.repository)) return input.kindHint;
  }
  if (guard && signals.editorial) return isAuthoritativeNewsSource(input.sourceId, input.kindHint) ? "news" : "info";

  const hasDealWord = guard ? signals.claim : DEAL_HINT.test(title);
  const hasPromoWord = guard ? signals.promotion : PROMO_HINT.test(text);
  const hasOpenSource = guard ? signals.repository : input.category === "opensource" || OPENSOURCE_HINT.test(text);

  if (hasOpenSource && !hasDealWord && input.obtain !== "paid") {
    return "opensource";
  }
  if (input.sourceId && OPENSOURCE_SOURCES.has(input.sourceId) && !hasDealWord && (!guard || signals.repository)) {
    return "opensource";
  }

  const hasPaidPrice = !input.isFree && typeof input.price === "number" && input.price > 0;
  if ((input.obtain === "paid" || hasPaidPrice) && (!guard || signals.promotion)) {
    return "deal";
  }
  if (hasPromoWord && !hasDealWord && !input.isFree) {
    return "deal";
  }
  if ((input.category === "carpool" || input.category === "trade") && !input.isFree && !hasDealWord && (!guard || signals.promotion)) {
    return "deal";
  }
  if (input.sourceId && DEAL_SOURCES.has(input.sourceId) && !input.isFree && !hasDealWord && (!guard || signals.promotion)) {
    return "deal";
  }

  if (input.sourceId && NEWS_SOURCES.has(input.sourceId)) return "news";
  if ((!guard && input.isFree) || hasDealWord) return "freebie";
  if (input.sourceId && INFO_SOURCES.has(input.sourceId)) return "info";
  if (input.category === "opensource" && (!guard || signals.repository)) return "opensource";
  if (
    input.category === "headline" ||
    input.category === "world" ||
    input.category === "stock" ||
    input.category === "finance" ||
    input.category === "tech" ||
    input.category === "news" ||
    input.category === "edu"
  ) {
    // 非权威新闻源（如什么值得买/IT之家/社区）不得落入 news，统一归为 info（导购站由上方 DEAL_SOURCES 先拦）
    return "info";
  }
  return guard ? "info" : "freebie";
}

function coerceNonNewsKind(fallbackInput: Parameters<typeof guessKind>[0]): ContentKind {
  if (
    fallbackInput.sourceId &&
    DEAL_SOURCES.has(fallbackInput.sourceId) &&
    !fallbackInput.isFree &&
    !DEAL_HINT.test(fallbackInput.title ?? "") && fallbackInput.guardEnabled === false
  ) {
    return "deal";
  }
  const guessed = guessKind(fallbackInput);
  return guessed === "noise" || (guessed === "news" && !isAuthoritativeNewsSource(fallbackInput.sourceId, fallbackInput.kindHint)) ? "info" : guessed;
}

/** 结合 AI 输出与规则上下文归一化最终 kind。 */
export function resolveKind(
  aiKind: unknown,
  aiKeep: boolean | null | undefined,
  fallbackInput: Parameters<typeof guessKind>[0],
): ContentKind {
  if (aiKeep === false) return "noise";
  if (isContentKind(aiKind)) {
    if (fallbackInput.guardEnabled !== false) {
      const signals = contentSignals(fallbackInput.title, fallbackInput.summary);
      if ((aiKind === "deal" && !signals.promotion) ||
          (aiKind === "freebie" && !signals.claim && !fallbackInput.freebieOnlySource) ||
          (aiKind === "opensource" && !signals.repository)) return coerceNonNewsKind(fallbackInput);
    }
    if (fallbackInput.guardEnabled !== false && aiKind === "noise" && aiKeep === true) return coerceNonNewsKind(fallbackInput);
    if (aiKind === "noise" && aiKeep === true) return guessKind(fallbackInput);
    if (aiKind === "opensource" && (fallbackInput.category === "headline" || fallbackInput.category === "world" || fallbackInput.category === "stock")) {
      return guessKind(fallbackInput);
    }
    // 重要新闻严格限定于权威新闻源，禁止导购/购物/普通社区（如什么值得买、IT之家等）混入「重要新闻」
    if (aiKind === "news" && !isAuthoritativeNewsSource(fallbackInput.sourceId, fallbackInput.kindHint)) {
      return coerceNonNewsKind(fallbackInput);
    }
    return aiKind;
  }
  if (aiKeep === true) {
    if (fallbackInput.guardEnabled !== false) return coerceNonNewsKind(fallbackInput);
    if (fallbackInput.category === "opensource") return "opensource";
    if (fallbackInput.obtain === "paid" || (!fallbackInput.isFree && typeof fallbackInput.price === "number" && fallbackInput.price > 0)) {
      return "deal";
    }
    const guessed = guessKind(fallbackInput);
    return guessed === "noise" ? "freebie" : guessed;
  }
  return guessKind(fallbackInput);
}
