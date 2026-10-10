#!/usr/bin/env bash
# 部署留言板 Worker：把 functions/api/ 下的代码传到独立 Worker（rhua-guestbook），
# 绑定 D1，并把 api.rhua.net 挂上去。
#
# 用法（令牌只走环境变量，不进仓库）：
#   export CLOUDFLARE_API_TOKEN=cfut_xxxx
#   export ADMIN_TOKEN=xxxxxxxx        # 删留言用的令牌
#   export SALT=xxxxxxxx               # 可选，IP 哈希盐
#   bash tools/deploy-guestbook.sh
#
# 站点本身是 Workers + 静态资源（不是 Pages），所以 functions/ 不会被自动打包，
# 必须走这条路。

set -euo pipefail

ACCOUNT_ID="90213dbbd8085e5bbabfe7d1797e1d80"
ZONE_ID="475989d6c6b081bfa2e0d1706b28254a"
DB_ID="77249d51-4656-4dc5-a59c-d65e34909549" # D1 数据库 rhua-guestbook
SCRIPT="rhua-guestbook"
HOSTNAME="api.rhua.net"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-https://rhua.net}"
SALT="${SALT:-rhua}"

: "${CLOUDFLARE_API_TOKEN:?需要 CLOUDFLARE_API_TOKEN}"
: "${ADMIN_TOKEN:?需要 ADMIN_TOKEN}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"          # Windows 版 curl 读不了 /c/... 绝对路径，统一用相对路径
META=".tmp-guestbook-metadata.json"

cat >"${META}" <<JSON
{
  "main_module": "index.js",
  "compatibility_date": "2026-10-06",
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "bindings": [
    { "type": "d1", "name": "DB", "id": "${DB_ID}" },
    { "type": "plain_text", "name": "ADMIN_TOKEN", "text": "${ADMIN_TOKEN}" },
    { "type": "plain_text", "name": "SALT", "text": "${SALT}" },
    { "type": "plain_text", "name": "ALLOWED_ORIGIN", "text": "${ALLOWED_ORIGIN}" }
  ]
}
JSON

echo "==> 上传 Worker ${SCRIPT}"
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -F "metadata=@./${META};type=application/json" \
  -F "index.js=@./functions/api/index.js;type=application/javascript+module" \
  -F "guestbook.js=@./functions/api/guestbook.js;type=application/javascript+module" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('   success:', d.get('success')); print('   errors:', json.dumps(d.get('errors'), ensure_ascii=False)[:300] if d.get('errors') else 'none')"

echo "==> 挂自定义域名 ${HOSTNAME}"
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/domains" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"hostname\":\"${HOSTNAME}\",\"service\":\"${SCRIPT}\",\"environment\":\"production\",\"zone_id\":\"${ZONE_ID}\"}" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('   success:', d.get('success')); print('   errors:', json.dumps(d.get('errors'), ensure_ascii=False)[:300] if d.get('errors') else 'none')"

echo "==> 验证（可能要等十几秒生效）"
sleep 12
curl -sS -w "\n   HTTP %{http_code}\n" "https://${HOSTNAME}/api/guestbook"

rm -f "${META}"
