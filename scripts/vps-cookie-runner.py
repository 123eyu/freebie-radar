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


def collect_zhihu(page, keywords):
    seen = {}
    for kw in keywords:
        url = "https://www.zhihu.com/search?type=content&q=" + urllib.parse.quote(str(kw))
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3200)
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
    return [
        {
            "externalId": it["url"],
            "url": it["url"],
            "title": it["title"],
            "summary": it.get("summary", ""),
            "tags": ["zhihu", "cookie-vps"],
        }
        for it in seen.values()
    ]


def collect_xhs(page, keywords):
    seen = {}
    for kw in keywords:
        url = (
            "https://www.xiaohongshu.com/search_result?keyword="
            + urllib.parse.quote(str(kw))
            + "&source=web_search_result_notes"
        )
        page.goto(url, wait_until="domcontentloaded", timeout=35000)
        page.wait_for_timeout(3500)
        try:
            page.locator("text=最新").first.click(timeout=2000)
            page.wait_for_timeout(1500)
        except Exception:
            pass
        for _ in range(2):
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(1100)
        state = page.evaluate(
            """() => {
              const text = document.body?.innerText || '';
              const needLogin = /登录后查看搜索结果|扫码登录|手机号登录/.test(text);
              const items = Array.from(document.querySelectorAll('section.note-item')).map((c) => {
                const a = c.querySelector('a.cover, a[href*="/explore/"], a[href*="/search_result/"]');
                const t = c.querySelector('.title span, .footer .title, .title');
                const au = c.querySelector('.author .name, .name');
                const img = c.querySelector('img');
                return {
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
    return [
        {
            "externalId": it["url"],
            "url": it["url"],
            "title": it["title"],
            "summary": "",
            "author": it.get("author") or None,
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
            captured.clear()
            page.goto(f"https://www.xiaoheihe.cn/app/bbs/home?t={int(time.time())}", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_timeout(3200)
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
    return list(seen.values())


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
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
