import { REVOKED_FREE } from "./evidence.ts";
/** 从标题/摘要里判定「要花多少钱」，用于「最高 willing to pay」筛选。 */

export type PriceInfo = {
  /** 归一化到人民币的金额；null 表示未知（不是 0） */
  price: number | null;
  /** 原始币种，便于展示 */
  currency: "CNY" | "USD" | null;
  /** 明确免费/白嫖 */
  isFree: boolean;
};

const USD_TO_CNY = 7.2;

const FREE = /免费|白嫖|(?:^|[^\d.])0(?:\.0+)?\s*元|零元|[$¥￥]\s*0(?:\.0+)?(?![\d.])|限免|白送|白给|免单|不要钱|免费领|报名领|免费送|每天送|每日送|\bfree(?:bie)?\b/i;
const FAKE_FREE = /\bfree\s+(?:shipping|delivery|returns?|pickup|update|cancellation)\b|免运费|免邮|包邮|免费更新|免费升级|免费取消|免费退改/gi;

/** 只有这几种表达才是「你要付的钱」，避免把「省 30 块」「200 元耳机怎么选」当成价格。 */
const PATTERNS: { re: RegExp; currency: "CNY" | "USD" }[] = [
  { re: /[¥￥]\s*(\d+(?:\.\d+)?)/g, currency: "CNY" },
  { re: /(?:最低|仅需|只需|只要|低至|原价\s*)?\s*(\d+(?:\.\d+)?)\s*元\s*(?:起|购|入手|到手|拿下|带走)/g, currency: "CNY" },
  { re: /(?:最低|仅需|只需|只要|低至)\s*(\d+(?:\.\d+)?)\s*元/g, currency: "CNY" },
  { re: /(\d+(?:\.\d+)?)\s*元\s*[/每]\s*(?:月|年|季)/g, currency: "CNY" },
  { re: /(\d+(?:\.\d+)?)\s*(?:美元|USD\b)/gi, currency: "USD" },
  { re: /\$\s*(\d+(?:\.\d+)?)/g, currency: "USD" },
];

/** 命中位置前面出现这些词，说明这个数字不是售价。 */
const NEGATIVE = /省|贵|涨|降|价值|原价|满|返|抵|券|优惠|股价|市值|卖掉|售价为|售价约|收入|亏|送|赠|抽|奖|赢|领取|获得|累计|最高/;

function contextIsNegative(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 8), index);
  if (NEGATIVE.test(before)) return true;
  const beforeEnglish = text.slice(Math.max(0, index - 36), index);
  return /(?:original(?:\s+price)?|normally|worth|valued\s+at|(?:retail|regular)(?:\s+price)?|value\s*(?:of|:)?)\s*$/i.test(beforeEnglish) ||
    /^(?:[$￥¥]\s*)?\d+(?:\.\d+)?\s*(?:美元|USD)?\s*(?:价值|\bvalue\b|\bworth\b)/i.test(text.slice(index, index + 60));
}

export function extractPrice(title: string, summary?: string | null): PriceInfo {
  const text = title + " " + (summary ?? "");
  // 免费只从标题确认；撤销通知可来自摘要，不能继续存成零元。
  const strippedTitle = title.replace(FAKE_FREE, " ");
  const revoked = REVOKED_FREE.test(text);
  const isFree = !revoked && FREE.test(strippedTitle);
  // 恢复原价是当前价；仍保留对赠品价值、历史原价和优惠额的排除。
  const priceText = revoked ? text.replace(/恢复\s*(?:原价|正常价)/g, "现价") : text;
  const freeTrial = isFree && /免费试用|免费体验|首月免费|free\s+trial/i.test(title) && /到期|之后|试用后|次月|\b(?:then|thereafter|after)\b/i.test(text);
  let best: { value: number; currency: "CNY" | "USD" } | null = null;
  for (const { re, currency } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(priceText))) {
      const raw = Number(m[1]);
      if (!Number.isFinite(raw) || raw <= 0 || raw > 1_000_000) continue;
      if (contextIsNegative(priceText, m.index)) continue;
      const cny = currency === "USD" ? raw * USD_TO_CNY : raw;
      if (!best || cny < best.value) best = { value: cny, currency };
    }
  }

  // 实付价格优先于附赠免费；明确在试用之后才收费的仍按当前零元。
  if (isFree && (!best || freeTrial)) return { price: 0, currency: best?.currency ?? "CNY", isFree: true };
  if (!best) return { price: null, currency: null, isFree: false };
  return { price: Math.round(best.value * 100) / 100, currency: best.currency, isFree: false };
}
