#!/usr/bin/env python3
"""
Freebie Radar VPS 按需无头 Cookie 执行器（平时 0 MB 浏览器内存）：
- 监听内网/网桥地址（默认 172.17.0.1:18790），不对外暴露
- 收到 /collect 请求时加锁串行拉起无头 Chrome，注入前端托管的 Cookie（小红书可选走国内代理）
- 抓取完成后在 finally 里立即关闭 browser 释放全部内存
"""

import json
import os
import re
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

HOST = os.environ.get("RUNNER_HOST", "172.17.0.1")
PORT = int(os.environ.get("RUNNER_PORT", "18790"))
TOKEN = os.environ.get("INGEST_TOKEN", "").strip()
CHROME_PATH = os.environ.get("CHROME_EXECUTABLE", "/usr/bin/google-chrome")

LOCK = threading.Lock()


def launch_browser(pw, proxy_url: str = ""):
    kwargs = {
        "headless": True,
        "args": [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--blink-settings=imagesEnabled=false",
        ],
    }
    if CHROME_PATH and os.path.exists(CHROME_PATH):
        kwargs["executable_path"] = CHROME_PATH
    if proxy_url:
        kwargs["proxy"] = {"server": proxy_url}
    return pw.chromium.launch(**kwargs)


def normalize_cookies(raw_cookies, default_domain: str):
    out = []
    for c in raw_cookies or []:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name", "")).strip()
        value = str(c.get("value", ""))
        domain = str(c.get("domain", default_domain) or default_domain).strip()
        path = str(c.get("path", "/") or "/").strip()
        if not name or not value:
            continue
        out.append({"name": name, "value": value, "domain": domain, "path": path})
    return out


CHATTER_RE = re.compile(
    r"^(?:怎么看待|如何评价|怎样做才|为什么|为何|男生|女生|请问|有人知道)|被白嫖|白嫖怪|相亲|考研|骑手|求推荐|求一个|求个|求购"
)


def _clean_text(text: str, limit: int = 3500) -> str:
    return re.sub(r"\s+", " ", text or "").strip()[:limit]


def collect_zhihu(page, keywords):
    seen = {}
    for kw in keywords:
        if len(seen) >= 45:
            break
        url = "https://www.zhihu.com/search?type=content&q=" + urllib.parse.quote(str(kw))
        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        page.wait_for_timeout(2000)
        state = page.evaluate(
            """() => {
              const text = document.body?.innerText || '';
              const needLogin = /登录\\/注册|扫码登录|安全验证/.test(text) && location.pathname.includes('/signin');
              const cards = Array.from(document.querySelectorAll('.SearchResult-Card, .List-item'));
              const items = cards.map((c) => {
                const a = c.querySelector('h2 a, .ContentItem-title a');
                const t = c.querySelector('.RichText');
                return {
                  title: ((a && a.textContent) || '').trim(),
                  url: (a && a.href) || '',
                  summary: ((t && t.textContent) || '').trim().slice(0, 300),
                };
              }).filter((x) => x.title && x.url);
              return { needLogin, items };
            }"""
        )
        if state.get("needLogin") and not state.get("items"):
            raise PermissionError("知乎登录态已失效或触发安全验证")
        for it in state.get("items", []):
            seen.setdefault(it["url"], it)

    candidates = [u for u, it in seen.items() if not CHATTER_RE.search(it["title"])][:18]
    if candidates:
        try:
            details = page.evaluate(
                """async (urls) => {
                  const out = {};
                  for (const u of urls) {
                    const mAns = u.match(/answer\\/(\\d+)/);
                    const mArt = u.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)/);
                    const api = mAns
                      ? `https://www.zhihu.com/api/v4/answers/${mAns[1]}?include=content`
                      : (mArt ? `https://zhuanlan.zhihu.com/api/articles/${mArt[1]}` : '');
                    if (!api) continue;
                    try {
                      const r = await fetch(api, { credentials: 'include' });
                      if (!r.ok) continue;
                      const j = await r.json();
                      const txt = String(j.content || '')
                        .replace(/<br\\s*\\/?>/gi, '\\n')
                        .replace(/<\\/p>/gi, '\\n')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\\s+/g, ' ')
                        .trim();
                      const ts = Number(j.updated_time || j.created_time || 0);
                      if (txt) out[u] = { content: txt.slice(0, 3500), ts: Number.isFinite(ts) && ts > 0 ? ts : 0 };
                    } catch {}
                  }
                  return out;
                }""",
                candidates,
            )
            for u, d in (details or {}).items():
                if u in seen and d.get("content"):
                    seen[u]["content"] = d["content"]
                    seen[u]["summary"] = _clean_text(d["content"], 380)
                    if d.get("ts"):
                        seen[u]["publishedAt"] = datetime.fromtimestamp(d["ts"], tz=timezone.utc).isoformat()
        except Exception:
            pass

    return [
        {
            "externalId": it["url"],
            "url": it["url"],
            "title": it["title"],
            "summary": it.get("summary", ""),
            "content": it.get("content") or None,
            "publishedAt": it.get("publishedAt") or None,
            "tags": ["zhihu", "cookie-vps"],
        }
        for it in seen.values()
    ]


def collect_xhs(page, keywords):
    seen = {}
    feed_notes = {}
    detail_budget = 10

    def on_xhs_response(resp):
        if "/api/sns/web/v1/feed" not in resp.url:
            return
        try:
            data = json.loads(resp.text())
            for row in (data.get("data") or {}).get("items") or []:
                nid = str(row.get("id") or "").strip()
                nc = row.get("note_card") or {}
                desc = str(nc.get("desc") or "").strip()
                if nid and desc:
                    tags = [t.get("name") for t in (nc.get("tag_list") or []) if isinstance(t, dict) and t.get("name")]
                    ts = nc.get("time")
                    feed_notes[nid] = {"desc": desc, "tags": tags, "time": ts}
        except Exception:
            pass

    page.on("response", on_xhs_response)
    try:
        for kw in keywords:
            if len(seen) >= 45:
                break
            url = (
                "https://www.xiaohongshu.com/search_result?keyword="
                + urllib.parse.quote(str(kw))
                + "&source=web_search_result_notes"
            )
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2400)
            try:
                page.locator("text=最新").first.click(timeout=1500)
                page.wait_for_timeout(900)
            except Exception:
                pass
            page.mouse.wheel(0, 1600)
            page.wait_for_timeout(800)
            state = page.evaluate(
                """() => {
                  const text = document.body?.innerText || '';
                  const needLogin = /登录后查看搜索结果|扫码登录|手机号登录/.test(text);
                  const items = Array.from(document.querySelectorAll('section.note-item')).map((c, idx) => {
                    const a = c.querySelector('a.cover, a[href*="/explore/"], a[href*="/search_result/"]');
                    const t = c.querySelector('.title span, .footer .title, .title');
                    const au = c.querySelector('.author .name, .name');
                    const img = c.querySelector('img');
                    return {
                      idx,
                      title: ((t && t.textContent) || '').trim(),
                      url: (a && a.href) || '',
                      author: ((au && au.textContent) || '').trim(),
                      imageUrl: img ? (img.getAttribute('src') || '') : '',
                    };
                  }).filter((x) => x.title && x.url);
                  return { needLogin, items };
                }"""
            )
            if state.get("needLogin") and not state.get("items"):
                raise PermissionError("小红书 Cookie 已失效或被跳转国际版/验证")

            for it in state.get("items", []):
                seen.setdefault(it["url"], it)

            # 按精确 note_id 点开若干有潜力的笔记弹窗抓正文（校验 URL/feed ID 严格对齐，防止错位）
            if detail_budget > 0:
                for it in state.get("items", []):
                    if detail_budget <= 0:
                        break
                    u = it["url"]
                    if seen[u].get("content") or CHATTER_RE.search(it["title"]):
                        continue
                    nid_m = re.search(r"/(?:explore|search_result)/([0-9a-zA-Z]+)", u)
                    nid = nid_m.group(1) if nid_m else ""
                    if not nid:
                        continue
                    detail_budget -= 1
                    try:
                        link = page.locator(f'section.note-item a[href*="{nid}"]').first
                        link.scroll_into_view_if_needed(timeout=1500)
                        link.click(timeout=2500)
                        for _ in range(10):
                            if nid in feed_notes:
                                break
                            page.wait_for_timeout(200)
                        modal_info = page.evaluate(
                            """(nid) => {
                              if (!location.href.includes(nid)) return '';
                              const el = document.querySelector('#detail-desc, .note-content .desc, .note-text');
                              return el ? el.innerText.trim() : '';
                            }""",
                            nid,
                        )
                        fn = feed_notes.get(nid)
                        full_desc = (fn.get("desc") if fn else "") or modal_info or ""
                        if full_desc:
                            if fn and fn.get("tags"):
                                tag_str = " ".join(f"#{t}" for t in fn["tags"][:8])
                                full_body = f"{full_desc}\n{tag_str}".strip()
                            else:
                                full_body = full_desc
                            seen[u]["content"] = full_body[:3500]
                            seen[u]["summary"] = _clean_text(full_desc, 380)
                            ts = fn.get("time") if fn else None
                            if isinstance(ts, (int, float)) and ts > 0:
                                sec = ts / 1000.0 if ts > 1e12 else float(ts)
                                seen[u]["publishedAt"] = datetime.fromtimestamp(sec, tz=timezone.utc).isoformat()
                        page.keyboard.press("Escape")
                        page.wait_for_timeout(300)
                    except Exception:
                        try:
                            page.keyboard.press("Escape")
                        except Exception:
                            pass
    finally:
        try:
            page.remove_listener("response", on_xhs_response)
        except Exception:
            pass

    return [
        {
            "externalId": it["url"],
            "url": it["url"],
            "title": it["title"],
            "summary": it.get("summary", ""),
            "content": it.get("content") or None,
            "author": it.get("author") or None,
            "publishedAt": it.get("publishedAt") or None,
            "imageUrl": it.get("imageUrl") or None,
            "tags": ["xiaohongshu", "cookie-vps"],
        }
        for it in seen.values()
    ]


def collect_xiaoheihe(page, keywords):
    seen = {}
    captured = []

    def on_response(resp):
        if "general/search" in resp.url:
            try:
                captured.append(resp.text())
            except Exception:
                pass

    page.on("response", on_response)
    try:
        for kw in keywords:
            if len(seen) >= 40:
                break
            captured.clear()
            page.goto(f"https://www.xiaoheihe.cn/app/bbs/home?t={int(time.time())}", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2400)
            try:
                page.fill(".el-input__inner", str(kw), timeout=8000)
                page.press(".el-input__inner", "Enter")
            except Exception:
                continue
            for _ in range(12):
                if captured:
                    break
                page.wait_for_timeout(1000)
            for txt in captured:
                try:
                    parsed = json.loads(txt)
                    for it in (parsed.get("result") or {}).get("items") or []:
                        if it.get("type") != "link" or not isinstance(it.get("info"), dict):
                            continue
                        n = it["info"]
                        linkid = str(n.get("linkid") or "").strip()
                        if not linkid:
                            continue
                        title = re.sub(r"<[^>]+>", "", str(n.get("title") or "")).strip()
                        summary = re.sub(r"<[^>]+>", "", str(n.get("description") or "")).strip()[:300]
                        created_at = n.get("create_at")
                        published_at = None
                        if isinstance(created_at, (int, float)) and created_at > 0:
                            published_at = datetime.fromtimestamp(created_at, tz=timezone.utc).isoformat()
                        topics = [t.get("name") for t in (n.get("topics") or []) if isinstance(t, dict) and t.get("name")]
                        seen.setdefault(
                            linkid,
                            {
                                "externalId": linkid,
                                "url": f"https://www.xiaoheihe.cn/app/bbs/link/{linkid}",
                                "title": title,
                                "summary": summary,
                                "content": None,
                                "publishedAt": published_at,
                                "tags": ["xiaoheihe", *topics[:2]],
                            },
                        )
                except Exception:
                    pass
    finally:
        try:
            page.remove_listener("response", on_response)
        except Exception:
            pass

    if not seen:
        need_login = page.evaluate("() => /登录\\/注册/.test(document.body?.innerText || '') && !document.querySelector('.user-info, .avatar, .el-avatar')")
        if need_login:
            raise PermissionError("小黑盒 Cookie 已失效或未抓取到搜索响应")
    items = list(seen.values())
    detail_targets = [it for it in items if not CHATTER_RE.search(it.get("title", ""))][:8]
    for it in detail_targets:
        try:
            page.goto(it["url"], wait_until="domcontentloaded", timeout=18000)
            page.wait_for_timeout(1600)
            body = page.evaluate(
                """() => {
                  const el = document.querySelector('.article-content, .link-content, .post-content, article, main');
                  return el ? el.innerText.trim() : '';
                }"""
            )
            trimmed = re.sub(r"^返回[\s\S]*?Lv\.\d+[\s\S]*?关注\s*", "", body or "")
            trimmed = re.sub(r"^返回\s+.*?关注\s+", "", trimmed)
            cleaned = _clean_text(trimmed, 3500)
            if len(cleaned) > len(it.get("summary") or ""):
                it["content"] = cleaned
                it["summary"] = cleaned[:380]
        except Exception:
            pass
    return items


def run_collect(site: str, raw_cookies, keywords, proxy_url: str):
    domain_map = {"zhihu": ".zhihu.com", "xhs": ".xiaohongshu.com", "xiaoheihe": ".xiaoheihe.cn"}
    cookies = normalize_cookies(raw_cookies, domain_map[site])
    if not cookies:
        raise ValueError("Cookie 为空")

    with LOCK:
        with sync_playwright() as pw:
            browser = launch_browser(pw, proxy_url if site == "xhs" else "")
            try:
                ctx = browser.new_context(
                    viewport={"width": 1280, "height": 860},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                )
                ctx.add_cookies(cookies)
                page = ctx.new_page()
                page.set_default_timeout(35000)
                if site == "zhihu":
                    return collect_zhihu(page, keywords)
                if site == "xhs":
                    return collect_xhs(page, keywords)
                if site == "xiaoheihe":
                    return collect_xiaoheihe(page, keywords)
                raise ValueError(f"Unsupported site: {site}")
            finally:
                try:
                    browser.close()
                except Exception:
                    pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[cookie-runner] {self.address_string()} - {fmt % args}", flush=True)

    def _send_json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"ok": True, "busy": LOCK.locked(), "chrome": os.path.exists(CHROME_PATH)})
            return
        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path != "/collect":
            self._send_json(404, {"ok": False, "error": "not found"})
            return
        if TOKEN:
            auth = self.headers.get("Authorization", "")
            given = auth[7:].strip() if auth.startswith("Bearer ") else ""
            if given != TOKEN:
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid json"})
            return
        site = str(body.get("site", "")).strip()
        if site not in ("zhihu", "xhs", "xiaoheihe"):
            self._send_json(400, {"ok": False, "error": f"unsupported site: {site}"})
            return
        keywords = body.get("keywords") or ["免费领取"]
        cookies = body.get("cookies") or []
        proxy = str(body.get("proxy", "") or "").strip()
        try:
            items = run_collect(site, cookies, keywords, proxy)
            self._send_json(200, {"ok": True, "items": items})
        except PermissionError as err:
            self._send_json(200, {"ok": False, "needLogin": True, "error": str(err)})
        except Exception as err:
            self._send_json(500, {"ok": False, "error": str(err)[:300]})


if __name__ == "__main__":
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[cookie-runner] listening on http://{HOST}:{PORT} chrome={CHROME_PATH}", flush=True)
    srv.serve_forever()
