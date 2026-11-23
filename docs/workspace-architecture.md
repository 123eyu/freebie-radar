# 工作台结构与数据边界

记录当前前端工作台的页面组织、URL 状态、请求作用域与组件归属，供后续改动判断「该改哪一层」。视觉规则见根目录 `DESIGN.md`，产品定位见 `PRODUCT.md`。

## 页面与 URL

页面由 hash 决定，筛选条件与作用域由 search 决定，两者互不覆盖。

- 页面：`src/web/src/lib/navigation.ts` 的 `TABS` 是唯一清单（`feed`/`hot`/`digest`/`me`/`rules`/`push`/`ai`/`ops`/`site`/`admin`）。`readTab(hash)` 非法值回落 `feed`；`tabUrl(pathname, search, tab)` 让 `feed` 不带 hash，其余带 `#tab`。
- 筛选：`src/web/src/lib/feedQuery.ts`。`readFeedState` 逐字段校验并回落默认值，`writeFeedSearch` 只增删自己拥有的键（`preset`、`q`、`source`、`category`、`filterLang`、`sort`、`range`、`price`、`score`、`obtain`、`kind`、`unread`），保留 `login_*`、语言和 `workspace` 等外部参数。界面语言（`lang`）与标题语言（`filterLang`）是两个字段。
- 作用域：`?workspace=site` 表示站级设置，缺省为个人。
- 筛选状态与 URL 双向同步：`App` 用 `history.replaceState` 写入，在 `popstate`/`hashchange` 时由 `applyFeedState` 回读全部筛选（包括频道）。`localStorage` 保存语言、视图模式（`radar_view_mode`）、摘要密度（`radar_row_summary`）与访客本地状态等偏好，不替代可分享的筛选参数。
- 显式导航（切页面、切作用域）走 `pushState`，产生可回退的历史；同步筛选走 `replaceState`，不堆历史。

## 查询构建与频道默认

`buildFeedQuery(state)` 生成 `/api/items` 的查询串，最后由 `src/shared/channel-query.ts` 的 `applyChannelQuery` 收口：

- 频道默认：`verified` 补 `unexpired=1`、`aiOnly=1`、`kind=freebie`、`obtain=free,conditional`、`maxAgeDays=7`；`codes`/`urgent`/`starred`/`hidden` 等各自补条件。
- 频道排除：`channelExcluded(preset)` 追加 `excludeCategory`，显式选择可以收窄频道，但不能绕开排除项。
- 服务端同一函数：`src/server/routes.ts` 的 `buildItemsQuery` 也调用 `applyChannelQuery`，所以网页、导出与 RSS 共用一套频道口径，前端不另抄一份默认值。
- 时效：`range=all` 写成 `maxAgeDays=all`，服务端在该值下只判断 `expires_at`、不加保鲜期；其余档位按天数换算并夹在 1–365 天。
- 界面说明：`feedPolicyLabels(query)` 按实际生效的参数生成「审核保留 / 隐藏审核拒绝 / 未过期 / 近 7 天 / 直接或有条件领取」，不把「审核保留」说成「免费」。

## 请求作用域

设置类接口按身份分两条基线，由 `navigation.ts` 决定，`App` 不自行拼接：

- `configurationScope(requested, publicSite, signedIn)`：只有「公开站且已登录」才允许个人作用域，其余一律站级。
- `configurationBase(...)`：站级返回 `/api`（需管理员就绪，否则 `null`，即不发请求），个人返回 `/api/me`（需已登录，否则 `null`）。

实际路径因此是两套：`/api/block-rules`、`/api/subscriptions`、`/api/push` 属站级；`/api/me/block-rules`、`/api/me/subscriptions`、`/api/me/push` 属个人。条目状态同样分叉：自部署 `/api/items/:id`，公开站 `/api/me/items/:id`。管理员登录不会顶替已登录用户的个人作用域，切换作用域或身份会关闭所有浮层并丢弃详情与规则预览缓存。

公开站未登录时走访客模式：收藏、已读、关闭条目与屏蔽词只写本机，不发请求。

## 组件归属

- `App.tsx`：负责启动、身份/作用域、查询装配、全局提示及页面操作回调；尚不是完全拆分后的纯容器。大型管理面板按需 `lazy` 加载，查询与导航的纯逻辑已经抽出。
- `lib/feedQuery.ts`：筛选状态的读写与查询构建（纯函数，有测试）。
- `lib/navigation.ts`：页面与作用域的读写、接口基线选择（纯函数）。
- `shared/taxonomy.ts`：前后端共用分类、形态、获取方式与频道定义；`lib/sources.ts` 转发这些定义，并维护前端来源分组和显示辅助函数。
- `components/FeedViewSwitch.tsx`：列表 / 双列 / 三列的唯一视图控件，桌面与移动端共用同一份标记，不再各写一套。
- `components/FeedToolbar.tsx`：频道条件（可展开核对完整规则）、结果计数与视图切换合一的一行；滚动列表时固定在顶部。
- `components/ActiveFilters.tsx`：把生效的筛选渲染成可逐个移除的胶囊，每个 × 是真正的按钮，支持键盘与读屏；「全部清除」是 Feed 内唯一的清除入口。
- `components/SourcePanel.tsx`：快捷视图与数据源树，桌面侧栏和移动筛选面板共用同一份实现。
- `components/WorkspaceScope.tsx`：把「仅当前账号 / 作用全站」和该页影响范围说清，仅在有权限时给出切换，推送页另给「配置通知渠道」入口。
- `components/Dialog.tsx`：站点说明、登录和 RSS 三类居中弹层复用原生 `dialog.showModal()`，限制焦点、支持 Escape 和返回原焦点。CSS 显式居中并保留遮罩；背景滚动由 `body:has(.site-dialog[open])` 锁定。详情与快捷屏蔽仍由 `ItemView.tsx` 的既有浮层逻辑管理。
- `components/ItemView.tsx`：列表行、卡片与详情抽屉；详情正文按需请求，不随列表下发。
- 清除动作只保留一处：Feed 内由筛选胶囊的「全部清除」承担；筛选面板折叠时，移动端摘要条提供「清除」。
- 设置分层：`site` 管访问权限、用户、公告与版本；`ops` 管采集开关、间隔与数据清理；`rules` 与 `push` 按作用域呈现为「我的…」或「全站…」。

## 已知边界

- 人工分类覆盖只锁定 `category` / `kind`，不锁 `obtain`，也不取消 `ai_keep=false`。获取方式、保留结论与个人收藏/已读分别处理，不能用「人工改分类」冒充审核改判。
- 个人设置与站级设置是两条数据路径，不存在「个人设置回落站级」的隐式继承。
- 本轮只调整查询参数的时效枚举与校验，未改后端评分、规则或推送判定。
