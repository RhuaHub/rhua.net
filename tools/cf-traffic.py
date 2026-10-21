#!/usr/bin/env python3
"""
rhua.net 流量 / 运营健康检查脚本（只读）

用法（令牌只走环境变量，绝不入库）：
    export CLOUDFLARE_API_TOKEN='cfut_xxx'
    python tools/cf-traffic.py

按需探测多个数据源，任何一个源因令牌权限不足失败都会明确标注，不会静默略过：
  1. 令牌有效性
  2. Workers 部署状态（最后部署时间，用来判断是否真的重新构建过）
  3. Workers 请求量（GraphQL workersInvocationsAdaptive）—— 需要 Account Analytics 读权限
  4. Cloudflare Web Analytics / RUM 访客数 —— 需要 RUM 读权限
  5. Zone HTTP 分析（请求数 / 独立访客）—— 需要 Zone Analytics 读权限
  6. 留言板 D1 留言统计（真实用户互动的下限指标）
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta

ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "90213dbbd8085e5bbabfe7d1797e1d80")
ZONE_ID = os.environ.get("CLOUDFLARE_ZONE_ID", "475989d6c6b081bfa2e0d1706b28254a")
D1_ID = os.environ.get("CLOUDFLARE_D1_ID", "77249d51-4656-4dc5-a59c-d65e34909549")
WORKER_SERVICE = "rhua-net"

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
if not TOKEN:
    sys.exit("缺少环境变量 CLOUDFLARE_API_TOKEN（Cloudflare API Token，cfut_ 前缀）。\n"
             "示例：export CLOUDFLARE_API_TOKEN='cfut_xxx' && python tools/cf-traffic.py")

BASE = "https://api.cloudflare.com/client/v4"
DAYS = int(os.environ.get("DAYS", "14"))


def req(method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}",
                 "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def ok(label, value):
    print(f"[OK]   {label}: {value}")


def denied(label, endpoint):
    print(f"[无权限] {label} —— 令牌缺少对应读权限（{endpoint}）")


def main():
    print(f"=== rhua.net 运营健康检查 {datetime.now(timezone(timedelta(hours=8))):%Y-%m-%d %H:%M} (UTC+8) ===\n")

    # 1. 令牌
    try:
        v = req("GET", "/user/tokens/verify")
        ok("令牌", f"{v['result']['status']}（id {v['result']['id'][:8]}…）")
    except urllib.error.HTTPError as e:
        sys.exit(f"令牌无效或被吊销：HTTP {e.code}")

    # 2. Workers 部署状态
    try:
        s = req("GET", f"/accounts/{ACCOUNT_ID}/workers/services/{WORKER_SERVICE}")
        env = s["result"]["default_environment"]
        ok("Workers 服务", f"{WORKER_SERVICE}，最后部署 {env['modified_on']}")
        ok("资源形态", f"has_assets={env['script'].get('has_assets')}（True=Workers 静态资源托管）")
    except urllib.error.HTTPError as e:
        denied("Workers 服务", f"HTTP {e.code}")

    # 3. Workers 请求量（GraphQL）
    since = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%dT00:00:00Z")
    gql = """
    query ($tag: String!, $since: Time!) {
      viewer {
        accounts(filter: { accountTag: $tag }) {
          workersInvocationsAdaptive(
            limit: 5000
            filter: { datetime_gt: $since, scriptName: "%s" }
            orderBy: [datetime_ASC]
          ) { sum { requests errors } dimensions { datetime } }
        }
      }
    }
    """ % WORKER_SERVICE
    try:
        r = req("POST", f"/accounts/{ACCOUNT_ID}/analytics/graphql",
                {"query": gql, "variables": {"tag": ACCOUNT_ID, "since": since}}, timeout=45)
        rows = r["result"]["accounts"][0]["workersInvocationsAdaptive"]
        total = sum(x["sum"]["requests"] for x in rows)
        by_day = {}
        for x in rows:
            d = x["dimensions"]["datetime"][:10]
            by_day[d] = by_day.get(d, 0) + x["sum"]["requests"]
        ok(f"Workers 请求数（近 {DAYS} 天）", f"共 {total} 次")
        for d in sorted(by_day):
            print(f"         {d}: {by_day[d]}")
        if not by_day:
            print("         （区间内无数据）")
    except urllib.error.HTTPError:
        denied("Workers 请求数", "/accounts/{a}/analytics/graphql")
    except Exception as e:
        print(f"[?]   Workers 请求数解析失败: {e}")

    # 4. Web Analytics / RUM
    try:
        r = req("GET", f"/accounts/{ACCOUNT_ID}/rum/site_info/list")
        sites = r.get("result", [])
        ok("Web Analytics 站点", ", ".join(s.get("host", "?") for s in sites) or "（无）")
    except urllib.error.HTTPError:
        denied("Web Analytics（真实 UV/PV）", "/accounts/{a}/rum/site_info/list")

    # 5. Zone HTTP 分析
    try:
        r = req("GET", f"/zones/{ZONE_ID}/analytics/dashboard?since=-{DAYS * 24 * 60}&continuous=true")
        t = r["result"]["totals"]
        ok(f"Zone HTTP 请求（近 {DAYS} 天）",
           f"requests={t['requests']['all']}, pageviews={t.get('pageviews', {}).get('all', 'N/A')}, "
           f"uniques={t['uniques']['all']}")
    except urllib.error.HTTPError:
        denied("Zone HTTP 分析（请求/独立访客）", "/zones/{z}/analytics/dashboard")
    except Exception as e:
        print(f"[?]   Zone 分析解析失败: {e}")

    # 6. 留言板 D1
    try:
        r = req("POST", f"/accounts/{ACCOUNT_ID}/d1/database/{D1_ID}/query",
                {"sql": "SELECT COUNT(*) AS n, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM messages"})
        row = r["result"][0]["results"][0]
        ok("留言板留言总数", f"{row['n']} 条（首 {row['first_at']} / 末 {row['last_at']}）")
    except urllib.error.HTTPError:
        denied("留言板 D1", "/accounts/{a}/d1/database/{id}/query")
    except Exception as e:
        print(f"[?]   留言板查询失败: {e}")

    print("\n说明：标 [无权限] 的项需要令牌带对应读权限。"
          "\n创建令牌时按需勾选：Account > Workers Analytics / Account Analytics（读），"
          "Zone > Analytics（读），Account > D1（读），Account > Cloudflare Web Analytics（读）。")


if __name__ == "__main__":
    main()
