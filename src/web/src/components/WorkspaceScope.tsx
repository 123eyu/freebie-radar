import { t } from "../lib/i18n.ts";
import type { WorkspaceScope } from "../lib/navigation.ts";

export function WorkspaceScopeBar({ scope, subject, canSwitch = false, siteAllowed = false, onChange, onOpenProfile }: {
  scope: WorkspaceScope;
  subject: "rules" | "push" | "admin";
  canSwitch?: boolean;
  siteAllowed?: boolean;
  onChange: (scope: WorkspaceScope) => void;
  onOpenProfile?: () => void;
}) {
  const descriptions = {
    rules: scope === "personal" ? t("订阅与屏蔽只影响当前账号。") : t("全站规则影响公开内容与统一推送，请谨慎修改。"),
    push: scope === "personal" ? t("这里设置你的通知规则，通知渠道在账号与通知中配置。") : t("这里管理站点统一推送，不修改个人通知规则。"),
    admin: t("此页面为站点级配置，仅管理员可修改。"),
  };
  return (
    <section className="workspace-scope" aria-label={t("设置作用范围")}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink-900">{scope === "personal" ? t("仅当前账号") : t("作用全站")}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{descriptions[subject]}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {subject === "push" && scope === "personal" && onOpenProfile && <button type="button" className="scope-link" onClick={onOpenProfile}>{t("配置通知渠道")}</button>}
        {canSwitch && <div role="group" aria-label={t("切换设置范围")} className="scope-switch" title={t("切换范围会清空未保存输入，已保存设置不变")}>
          <button type="button" aria-pressed={scope === "personal"} onClick={() => onChange("personal")}>{t("我的账号")}</button>
          <button type="button" aria-pressed={scope === "site"} disabled={!siteAllowed} onClick={() => onChange("site")}>{t("全站设置")}</button>
        </div>}
      </div>
    </section>
  );
}
