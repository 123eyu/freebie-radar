# 多路由推送系统

资源雷达的推送系统由 **全局策略** 与 **多专题路由（`routes`）** 组成，全部保存在 `settings.push`（公开站登录用户的个人推送存在 `user_push_settings`），在网页 **「全站推送规则 / 我的推送规则」** 修改后实时热生效，无需重启服务。

## 1. 推送时机与 AI 协同策略

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 推送总开关（关闭后即时与攒批均停发，日报仍可单独预览/触发） |
| `pushTiming` | `wait_ai` | `wait_ai`（先过 AI 审核再推，防新闻/更新公告误推）或 `instant_first`（高分/含码极速直推，后台异步补审） |
| `syncPrePushLimit` | `20` | `wait_ai` 模式下每轮同步等待 AI 审核的最大条数（5–60），超出部分进入后台队列 |
| `pushAfterBackfill` | `true` | 后台 AI 补审判定为真福利后，自动补进推送管道 |
| `aiFallbackMode` | `strict` | `strict`（必须 AI 验真）/ `rule_fallback`（AI 超时或未审到时按强福利信号放行）/ `ignore_ai`（仅用规则） |

## 2. 全局筛选与频控设置

| 设置 | 默认 | 说明 |
|---|---|---|
| `instantScore` / `batchScore` | `75` / `60` | 立即推送阈值 / 进入攒批队列阈值 |
| `instantOnCodes` / `instantOnUrgent` | `true` / `true` | 含兑换码或标题命中限量/先到先得时直走即时推送 |
| `maxPerHour` / `maxPerInstant` | `24` / `5` | 每小时总上限 / 单轮即时推送条数上限 |
| `batchIntervalMin` / `maxPerBatch` | `30` / `8` | 攒批间隔分钟（`0` 为关闭攒批）/ 单批合并最多条数 |
| `quietEnabled` / `quietHours` / `quietAction` | `true` / `23:30-08:00` / `batch` | 夜间静默开关、时段与策略（`batch` 延后早间发出 / `drop` 直接跳过） |
| `timezone` | `Asia/Shanghai` | 静默时段判定时区（通过 `Intl.DateTimeFormat` 计算，不受容器 UTC 影响） |
| `maxAgeHours` | `72` | 条目保鲜窗口（小时，`0` 不限） |
| `langMode` | `all` | `all`（全部）/ `zh`（仅中文）/ `en`（仅英文） |
| `sourceMode` / `sourceIds` | `all` / `[]` | 按数据源范围过滤：`all` / `include`（仅推指定源）/ `exclude`（排除指定源） |
| `kinds` / `categories` / `obtainModes` | — | 内容形态、28 类领域白名单与获取方式（默认偏重 `free` / `conditional`） |
| `maxPrice` | `null` | 价格上限（`0` 仅完全免费，正数为人民币折算上限，`null` 不限） |
| `dedupeByTitle` | `true` | 跨源标题聚类去重（若开启 AI 语义去重，推送前还会再做一次同事件防重） |
| `includePrice` / `includeDeadline` / `includeScore` / `includeObtain` / `includeAiReason` | 均 `true` | 控制推送卡片附带的信息字段 |
| `deliverVia` / `webhookUrl` / `webhookSecret` | `telegram` | 个人或扩展投递支持 Telegram Bot 或自定义 Webhook（POST JSON + `X-Radar-Secret`） |

## 3. 多专题路由（`routes`）

除默认全局条件外，可配置多条互不干扰的专题路由（`PushRoute`）。每条路由独立设置：

- **过滤维度**：`kinds`（形态）、`categories`（分类）、`obtainModes`（获取方式）、`keywords`（主题关键词）、`maxPrice`（最高价）、`minScore`（最低分）；
- **发送形态**：`instant: true`（满足高分/急迫条件可即时直推）或 `false`（仅进攒批汇总）；
- **消息头前缀**：`header`（如 `🎁 真福利精选`、`🖥 黑五/VPS 快报`、`📦 开源汇总`），方便在一个群组/频道里一眼区分来源专题。

## 4. 三级分流与二次校验

```text
新条目入库
  ├─ 命中统一屏蔽词（block_rules） / 硬噪音（NOISE_TITLE） ──→ 跳过推送与 AI
  ├─ 语言 / 时效 / 数据源 / 获取方式 / 价格 / 路由匹配
  │    ├─ 命中路由或全局且（含码 / 限量急迫 / ≥ instantScore）──→ ⚡ 即时单发（静默期按 quietAction 处理）
  │    ├─ 满足路由或 ≥ batchScore ──→ 📦 攒批队列（定时合并一条）
  │    └─ 其余 ──→ 仅留网页工作台，不打扰
```

攒批队列真正发出前，会**再次回查数据库最新状态**（是否已被管理员屏蔽、人工改分类、过期或命中新增屏蔽词），避免「入队时合格、发出前已失效」的误推。

## 5. 试算预览、诊断与个人推送

- **试算预览与记录**：网页「试算预览与记录」页签可按当前未保存草稿或已保存规则模拟命中条数与拦截分布（不真发消息），底部展示最近投递记录与失败原因；
- **个人推送（公开站模式）**：登录用户可在个人推送页绑定自己的 Telegram Bot 或 Webhook（如 QQ 桥接 NapCat/Lagrange、Bark、飞书、钉钉、Slack），与全站规则共用去重与调度引擎，但限流、投递记录与阈值完全隔离。详见 [公开站：登录与个人隔离](accounts.md)。

## 6. 常用 API

```bash
curl .../api/push                          # 当前推送设置 + 统计 + 静默状态
curl -X PATCH .../api/push -H 'content-type: application/json' -d '{"instantScore":80,"langMode":"zh"}'
curl '.../api/push/preview?limit=6'        # 试算预览命中与拦截分布
curl '.../api/push/log?limit=30'           # 最近推送记录
curl -X POST .../api/push/flush            # 立即发送攒批队列
curl -X POST .../api/push/test             # 发送一条测试消息
```

## 7. 历史教训：时区与噪音过滤

早期上线时曾暴露两个典型问题，目前已固化在公共规则中：

1. **容器 UTC 时区导致静默反转**：容器默认 UTC，直接比对 `23:30-08:00` 会把北京时间白天静音。现统一由 `inQuietHoursZoned()` 结合 `Intl.DateTimeFormat(..., { timeZone })` 按配置的 `timezone` 判定；
2. **裸关键词误触发即时推送**：早期 `URGENT` 正则含裸「送」字，导致体育新闻「球迷受伤送医」命中即时推送。现抽取共享模块 `src/server/enrich/noise.ts`（`NOISE_TITLE` / `DEAL_HINT` / `URGENT`），收紧为 `送\s*\d+\s*(个|份|张|枚|次)` / `送码` / `送体验金`，并要求所有推送路径均先过 `NOISE_TITLE`。
