---
outline: deep
---

# 交给 AI 一键部署

这一页把「部署资源雷达」压缩成**一段可以直接粘给 AI 的指令**：Claude Code / Codex / Cursor / ChatGPT（带终端）都能照着跑完，最后自己验收。

适用前提：一台能联网的 Linux 服务器（2 核 1G 起，Docker 可用）。Windows / macOS 本机同理，把 `docker compose` 换成同样的命令即可。

## 复制这段给 AI（中文）

```text
请在这台服务器上部署 freebie-radar（自托管的资源聚合雷达），按以下步骤执行，不要跳步。

目标：服务跑在 127.0.0.1:8788，`curl http://127.0.0.1:8788/health` 返回 {"ok":true,...}。

1) 环境检查：确认 docker 与 docker compose v2 可用、内存 ≥ 1GB、磁盘剩余 ≥ 2GB、8788 端口未被占用。
   缺 docker 就用官方脚本安装；装完 `docker compose version` 必须能打印版本。
2) 取代码：git clone https://github.com/ZiChuanLan/freebie-radar.git /opt/freebie-radar
   cd /opt/freebie-radar
3) 配置：cp .env.example .env，然后只改这几项，其余保持默认——
   - ADMIN_TOKEN=<生成一个 24 位随机串，告诉我结果>
   - TZ=Asia/Shanghai（或服务器本地时区）
   - BIND_ADDRESS=127.0.0.1（本机跑；确需直连再改成 0.0.0.0）
   - 若要采集 linux.do 这类 Cloudflare 站点：用 `docker compose --profile cf up -d --build`
     启动 FlareSolverr，并在 .env 里设 FLARESOLVERR_URL=http://flaresolverr:8191
4) 构建启动：docker compose up -d --build
5) 验收，全部通过才算完成：
   - `docker compose ps` 里 radar 是 running / healthy
   - `curl -fsS http://127.0.0.1:8788/health` 返回 ok:true
   - `curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/` 返回 200
   - `docker compose logs --tail 100 radar` 没有反复报错（ECONNREFUSED / EACCES / ENOSPC / SQLITE_BUSY）
   - 打开网页管理区「数据源运维」手动采集一次，确认有条目入库
6) 汇报：①访问地址 ②ADMIN_TOKEN ③首次采集入库条数 ④日志里仍未消除的告警及原因

硬性约束：
- 不要 git commit / git push，不要把 .env 内容打进日志或提交记录
- 不要改 pnpm-lock.yaml、不要升级依赖、不要改 compose 的端口以外的结构
- 没有设置 ADMIN_TOKEN 时，禁止把端口暴露到公网
- 不要执行 git reset --hard / git clean -fd，不要删除 ./data（那是数据库目录）
```

## Copy this to the AI (English)

```text
Deploy freebie-radar (a self-hosted resource radar) on this server, following the steps below exactly.

Goal: the service listens on 127.0.0.1:8788 and `curl http://127.0.0.1:8788/health` returns {"ok":true,...}.

1) Preflight: check docker + docker compose v2, ≥ 1GB RAM, ≥ 2GB free disk, and that port 8788 is free.
   Install docker if missing; `docker compose version` must print a version afterwards.
2) Get the code: git clone https://github.com/ZiChuanLan/freebie-radar.git /opt/freebie-radar
   cd /opt/freebie-radar
3) Configure: cp .env.example .env, then change only these (leave everything else at defaults) —
   - ADMIN_TOKEN=<generate a 24-char random string and report it>
   - TZ=Asia/Shanghai (or the server's timezone)
   - BIND_ADDRESS=127.0.0.1 (local only; use 0.0.0.0 only if you really need direct access)
   - To collect Cloudflare-protected sources such as linux.do: start FlareSolverr with
     `docker compose --profile cf up -d --build` and set FLARESOLVERR_URL=http://flaresolverr:8191
4) Build and start: docker compose up -d --build
5) Verify — all of these must pass:
   - `docker compose ps` shows radar as running / healthy
   - `curl -fsS http://127.0.0.1:8788/health` returns ok:true
   - `curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/` returns 200
   - `docker compose logs --tail 100 radar` shows no error loop (ECONNREFUSED / EACCES / ENOSPC / SQLITE_BUSY)
   - Trigger one manual collection under Admin → Data sources and confirm items were ingested
6) Report: (1) URL (2) ADMIN_TOKEN (3) item count from the first collection (4) remaining log warnings and why

Hard constraints:
- No git commit / git push, and never let .env contents reach logs or commits
- Do not touch pnpm-lock.yaml, do not upgrade dependencies, do not restructure the compose file beyond ports
- Never expose the port publicly while ADMIN_TOKEN is unset
- No git reset --hard / git clean -fd, and never delete ./data (it holds the database)
```

## AI 该做到什么程度才算部署成功

| 检查项 | 命令 | 期望 |
|---|---|---|
| 容器在跑 | `docker compose ps` | `radar` 状态 `running`（健康检查通过后为 `healthy`） |
| 健康接口 | `curl -s http://127.0.0.1:8788/health` | `{"ok":true,...}` |
| 首页可访问 | `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/` | `200` |
| 数据库落盘 | `ls -l data/radar.db` | 文件存在且持续增长 |
| 采集链路 | 管理区 →「数据源运维」→ 手动采集 | 有新增条目，日志无持续报错 |
| 管理区鉴权 | 打开 `/` → 管理 Tab | 要求输入 `ADMIN_TOKEN` |

::: tip 为什么强调验收
AI 很容易在「容器起来了」就宣布完成，而实际上数据库迁移失败、端口被占、内存不足导致 OOM 重启循环都会让服务起来又挂。上面 6 条是**可自动验证**的最小集合，让它逐条贴输出，比一句「部署好了」可靠得多。
:::

## 需要你本人决定的三件事

1. **要不要公网访问**：只想自己在本机看，保持 `BIND_ADDRESS=127.0.0.1` + 反向代理（Caddy/Nginx）即可；不想装反代就临时改 `0.0.0.0`，但必须配合 `ADMIN_TOKEN` 与防火墙。
2. **`ADMIN_TOKEN` 强度**：它就是管理区唯一密码，建议 24 位随机串，交给密码管理器，不要用弱口令。
3. **要不要 AI 审核**：`.env` 里的 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 只是首次启动的默认值，之后一律在网页「AI 引擎」里热配置；不填也能跑，只是分类靠规则。

## 常见失败与对策

| 现象 | 根因 | 最小解法 |
|---|---|---|
| `port is already allocated` | 8788 被占用 | 改 `.env` 的 `PORT`，或停掉占用进程 |
| 容器反复重启、日志里 `SQLITE_BUSY` | 多实例共用一个 db 文件 | 确保只有一个容器挂载 `./data` |
| 容器 OOM 被杀 | 服务器内存太小或并发太高 | compose 已限 `mem_limit: 256m`；降到 1 个采集源、调高间隔 |
| linux.do / CF 站点全 403 | Cloudflare 挑战 | 启用 `--profile cf` 并设 `FLARESOLVERR_URL` |
| 外网打不开但本机正常 | 只绑了回环 | 加反向代理，或把 `BIND_ADDRESS` 改成 `0.0.0.0` 并配防火墙 |
| 推送没反应 | `PUSH_CHANNEL=none` | 设 `PUSH_CHANNEL=telegram` 并填 Bot Token / Chat ID |
| 时间戳差 8 小时 | 容器时区 | `.env` 里设 `TZ=Asia/Shanghai` 后重启 |

## 部署之后

- 升级：`git pull && docker compose up -d --build`（SQLite 迁移自动完成，`./data` 不动）
- 备份：整目录拷 `./data`（单文件 SQLite，WAL 模式，建议 `sqlite3 data/radar.db '.backup data/backup.db'` 做热备）
- 反向代理要记得转发 `Host` 与 `X-Forwarded-For`，并在 `.env` 里把 `TRUST_PROXY=true` 打开（仅当反代会覆盖该头时）
- 完整变量清单见 [`.env.example`](https://github.com/ZiChuanLan/freebie-radar/blob/main/.env.example)，公网安全边界见 [公网部署与安全边界](./security.md)
