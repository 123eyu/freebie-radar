import { REVOKED_FREE } from "./evidence.ts";
import { extractPrice } from "./pricing.ts";
import { OBTAIN_HINT, OBTAIN_LABEL, type ObtainMode } from "../../shared/taxonomy.ts";

/**
 * 获取方式：区分「点开就能白拿」和「看着像白嫖其实不完全是」。
 * 价格维度（is_free / price）回答「要不要钱」，这个维度回答「能不能确定拿到」。
 * 枚举与文案统一放在 shared/taxonomy.ts，前端直接复用同一份。
 */
export type { ObtainMode };
export { OBTAIN_HINT, OBTAIN_LABEL };

/** 只有这两种算真正的「完全白嫖」。 */
export const CLEAN_OBTAIN: ObtainMode[] = ["free"];

/**
 * 规则兜底：AI 没结论时用关键词粗分。
 * 顺序有意为之 —— 抽奖优先于条件，推广优先于免费（「免费体验我们的服务」是广告）。
 */
export function guessObtain(title: string, summary = "", priceInfo?: { price: number | null; isFree: boolean }): ObtainMode {
  const t = title + " " + summary;
  if (REVOKED_FREE.test(t)) return "paid";
  // Giveaway 常用于直接送游戏，只有随机获奖证据才算抽奖。
  if (/抽奖|抽\s*\d+\s*(份|个|名|位)|抽取|随机送|开奖|中奖|摇号|锦鲤|抽\s*\d+|名额有限.*抽|抽名额|抽选|抽签|赢取|sweepstakes|\bwinners?\b|\braffle\b/i.test(t)) return "lottery";
  if (/招募|代理|加盟|官方旗舰|我们的服务|自营|软广|推广位|商务合作|招商|诚招|带货|优惠码.*分成/.test(t)) return "promo";
  if (/试用|免费体验\s*\d+\s*天|首月免费|首月\s*\d|体验期|试用期|免费体验卡|7\s*天免费|30\s*天免费|\b(?:free\s+trial|demo\s+(?:is\s+)?(?:now\s+)?available)\b|(?:\bfree\b.*\bdemo\b|\bdemo\b.*\bfree\b)/i.test(t)) return "trial";
  const conditions = t.replace(/(?:无需|无须|不用|不必|不需要)\s*(?:(?:注册(?:账号|账户)?|验证(?:邮箱|手机(?:号)?|短信)|绑定(?:手机(?:号)?|邮箱)|登录|充值|下单|关注)(?:\s*(?:或|和|及|并)\s*)?)+/g, " ");
  if (/回帖|盖楼|转发|关注.*领取|邀请|拉新|实名|绑卡|下单|首单|充值|发帖|评论.*领取|签到.*领|分享.*得|注册(?!版|商标|证|机|码)|验证邮箱|邮箱验证|验证手机|绑定手机|绑定邮箱|需登录|登录后/.test(conditions)) return "conditional";
  const price = priceInfo ?? extractPrice(title, summary);
  const payments = t.replace(/(?:无需|无须|不用|不必|不需要|免)\s*(?:付费|支付|付款|购买)/g, " ");
  if (!price.isFree && ((typeof price.price === "number" && price.price > 0) || /付费|收费套餐|需(?:要)?支付|须付款|paid\s+(?:plan|subscription)/i.test(payments))) return "paid";
  return "free";
}
