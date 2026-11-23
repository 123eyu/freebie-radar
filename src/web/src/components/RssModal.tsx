import { useState } from "react";
import { Check, Copy, Globe2, Lock, X } from "lucide-react";
import type { Bootstrap } from "../lib/session.ts";
import { t } from "../lib/i18n.ts";
import { Dialog } from "./Dialog.tsx";

function CopyRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <div className="rounded-lg border border-ink-200 bg-surface-hover p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-900">{label}</span>
        <button
          type="button"
          onClick={async () => {
            setCopied(false); setCopyError(false);
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopyError(true);
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-surface px-2 py-1 text-[12px] font-medium text-ink-700 hover:bg-ink-100"
        >
          {copied ? <Check size={12} className="text-deal" /> : <Copy size={12} />}
          {copied ? t("已复制") : t("复制")}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{hint}</p>
      <code className="mt-1.5 block overflow-x-auto rounded border border-ink-200 bg-surface px-2 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink-700">
        {url}
      </code>
      {copyError && <p role="alert" className="mt-2 text-[12px] text-alert">{t("无法自动复制，请选择上方地址手动复制。")}</p>}
    </div>
  );
}

/**
 * RSS 订阅助手：把「当前筛选」直接变成一条订阅地址，
 * 登录用户还能拿到带个人屏蔽规则的专属地址。
 */
export function RssModal({
  boot,
  currentQuery,
  onClose,
}: {
  boot: Bootstrap;
  currentQuery: string;
  onClose: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const qs = currentQuery.replace(/^\?/, "").replace(/&?limit=\d+/, "");
  const publicUrl = origin + "/rss.xml" + (qs ? "?" + qs : "");
  const user = boot.user;

  return (
    <Dialog label={t("RSS 订阅")} onClose={onClose}>
      <div className="sheet-enter panel w-full max-w-[520px] overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Globe2 size={15} className="text-accent" />
            <div>
              <h2 className="text-[17px] font-semibold text-ink-950">{t("RSS 订阅")}</h2>
              <p className="mt-0.5 text-[12px] text-ink-500">{t("丢进任意阅读器即可，公开源不需要登录")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
            title={t("关闭")}
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[62vh] space-y-2.5 overflow-auto px-5 py-4">
          <CopyRow
            label={t("公开订阅（按当前筛选）")}
            hint={t("套用全站屏蔽词与跨源去重，任何人都能订阅")}
            url={publicUrl}
          />
          <CopyRow
            label={t("公开订阅（真福利精选）")}
            hint={t("固定按「真福利」频道输出，不受当前筛选影响")}
            url={origin + "/rss.xml?preset=verified&limit=50"}
          />

          {user ? (
            <>
              <div className="pt-1 text-[12px] font-medium text-ink-500">{t("我的专属订阅")}</div>
              <CopyRow
                label={t("个人订阅（常规）")}
                hint={t("自动排除你点过「不想看」的条目，并套用你的个人屏蔽词")}
                url={origin + "/rss/u/" + user.rssToken + ".xml"}
              />
              <CopyRow
                label={t("个人订阅（按推送规则）")}
                hint={t("完全按你在「我的推送」里设的分数、分类、获取方式过滤")}
                url={origin + "/rss/u/" + user.rssToken + ".xml?mode=push"}
              />
              <CopyRow
                label={t("个人订阅（只看关注词）")}
                hint={t("只输出命中你关注关键词的条目")}
                url={origin + "/rss/u/" + user.rssToken + ".xml?mode=subs"}
              />
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
                <Lock size={11} className="mt-0.5 shrink-0" />
                {t("这条链接本身就是凭据，别贴到公开场合；泄露后请在「账号与通知」重置 Token。")}
              </p>
            </>
          ) : (
            <p className="rounded-md border border-ink-200 bg-surface-hover px-3 py-2 text-[12px] leading-relaxed text-ink-600">
              {t("登录后还能拿到带个人屏蔽规则的专属订阅地址。")}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}