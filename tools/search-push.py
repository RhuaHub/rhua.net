#!/usr/bin/env python3
"""
搜索引擎主动推送脚本（rhua.net）

用法：
    export BAIDU_TOKEN='百度站长平台的推送 token'   # 可选
    python tools/search-push.py https://rhua.net/2026/10/nas-double11-config-2026/

不传参数则默认推送 sitemap 里的全部页面（IndexNow 上限 10000 条/次）。

数据源与通道：
  1. IndexNow（api.indexnow.org）—— 覆盖 Bing / Naver / Seznam / Yandex，无需账号，
     只需在站点根目录放置密钥文件（已部署 source/<key>.txt，key 存 .indexnow-key）
  2. 百度主动推送（zz.bdstatic.com）—— 需要在 https://ziyuan.baidu.com/linksubmit
     获取站点的推送 token，然后 export BAIDU_TOKEN。未设置时跳过并提示。
  3. Google —— sitemap ping 已于 2023 年废弃，普通站点靠 sitemap.xml 自动发现；
     加速收录请到 Google Search Console 手动「请求编入索引」（需要账号，脚本做不了）。
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

HOST = "rhua.net"
SITEMAP = "public/sitemap.xml"
KEY_FILE = Path(__file__).resolve().parent.parent / ".indexnow-key"

BAIDU_TOKEN = os.environ.get("BAIDU_TOKEN", "")
BAIDU_ENDPOINT = f"http://data.zz.baidu.com/urls?site=https%3A%2F%2F{HOST}&token={BAIDU_TOKEN}"


def urls_from_sitemap():
    xml = Path(SITEMAP).read_text(encoding="utf-8") if Path(SITEMAP).exists() else ""
    return [u.strip() for u in re.findall(r"<loc>([^<]+)</loc>", xml) if u.strip()]


def indexnow_submit(urls):
    key = KEY_FILE.read_text().strip() if KEY_FILE.exists() else ""
    if not key:
        return "[跳过] IndexNow：找不到 .indexnow-key"
    body = json.dumps({"host": HOST, "key": key, "urlList": urls}).encode()
    req = urllib.request.Request(
        "https://api.indexnow.org/IndexNow",
        data=body, method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            code = resp.status
        return f"[OK]   IndexNow：提交 {len(urls)} 条，HTTP {code}" if code == 200 else \
               f"[?]    IndexNow：HTTP {code}（202=已受理，422=key 未验证）"
    except urllib.error.HTTPError as e:
        return f"[失败] IndexNow：HTTP {e.code} {e.read()[:120]}"


def baidu_submit(urls):
    if not BAIDU_TOKEN:
        return ("[跳过] 百度：未设置 BAIDU_TOKEN。"
                "去 https://ziyuan.baidu.com/linksubmit 取 token 后 "
                "export BAIDU_TOKEN=xxx 再跑一次")
    # 百度普通收录每次上限 2000 条，这里只推最近的文章与核心页
    body = "\n".join(urls[:2000]).encode()
    req = urllib.request.Request(BAIDU_ENDPOINT, data=body, method="POST",
                                 headers={"Content-Type": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            r = json.loads(resp.read().decode())
        if r.get("success"):
            return f"[OK]   百度：成功 {r['success']} 条，剩余配额 {r.get('remain')}"
        return f"[失败] 百度：{r}"
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "ignore")[:200]
        return f"[失败] 百度：HTTP {e.code} {msg}"


def main():
    if len(sys.argv) > 1:
        urls = [u if u.startswith("http") else f"https://{HOST}/{u.lstrip('/')}" for u in sys.argv[1:]]
    else:
        urls = urls_from_sitemap()
        # 新文章排最前，保证限额内优先提交
        urls.sort(key=lambda u: 0 if "2026/10" in u else 1)
    if not urls:
        sys.exit("没有可提交的 URL（先跑 hexo generate）")
    print(f"待提交 {len(urls)} 条\n")
    print(indexnow_submit(urls))
    print(baidu_submit(urls))


if __name__ == "__main__":
    main()
