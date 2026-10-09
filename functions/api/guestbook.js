/**
 * rhua.net 留言板 API —— Cloudflare Pages Functions
 *
 * 路由：
 *   GET    /api/guestbook           取留言列表
 *   POST   /api/guestbook           提交留言
 *   DELETE /api/guestbook?id=123    删除留言（需要管理员令牌）
 *
 * 依赖绑定（在 Cloudflare Pages → Settings → Functions 里配置，不写进仓库）：
 *   DB          D1 数据库绑定（变量名必须叫 DB）
 *   ADMIN_TOKEN 管理员令牌，删除留言时校验
 *   SALT        可选，IP 哈希盐值
 *
 * 未绑定 DB 时接口返回 503 + error: 'not_configured'，前端会显示维护提示，
 * 而不是把报错甩给读者。
 */

const NAME_MAX = 24
const CONTACT_MAX = 64
const CONTENT_MAX = 500
const COOLDOWN_SEC = 60
const LIST_MAX = 200

// D1 的 prepare() 一次只能执行一条语句，必须拆开
const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  ua_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  status TEXT NOT NULL DEFAULT 'approved'
)`

const INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(id DESC)`

// 每个 isolate 只建一次表，避免每次请求都跑 DDL
let tableReady = null

function ensureTable(env) {
  if (!tableReady) {
    tableReady = env.DB.prepare(TABLE_SQL)
      .run()
      .then(() => env.DB.prepare(INDEX_SQL).run())
      .catch((e) => {
        tableReady = null
        throw e
      })
  }
  return tableReady
}

export async function onRequest(ctx) {
  const { request, env } = ctx

  const cors = {
    'Access-Control-Allow-Origin': new URL(request.url).origin,
    Vary: 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...cors, Allow: 'GET, POST, DELETE, OPTIONS' },
    })
  }

  if (!env.DB) {
    return json(
      {
        ok: false,
        error: 'not_configured',
        message: '留言服务尚未启用：站点还没绑定数据库。',
      },
      503,
      cors,
    )
  }

  try {
    if (request.method === 'GET') return await handleGet(request, env, cors)
    if (request.method === 'POST') return await handlePost(request, env, cors)
    if (request.method === 'DELETE') return await handleDelete(request, env, cors)
    return json({ ok: false, error: 'method_not_allowed' }, 405, cors)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[guestbook]', e && e.message)
    return json(
      { ok: false, error: 'server_error', message: '留言服务暂时不可用，稍后再试。' },
      500,
      cors,
    )
  }
}

/* ---------------------------------- GET ---------------------------------- */

async function handleGet(request, env, cors) {
  await ensureTable(env)

  const admin = await isAdmin(request, env)
  const raw = parseInt(new URL(request.url).searchParams.get('limit') || '', 10)
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, LIST_MAX) : LIST_MAX

  const sql = admin
    ? `SELECT id, name, contact, content, created_at FROM messages
       WHERE status = 'approved' ORDER BY id DESC LIMIT ?`
    : `SELECT id, name, content, created_at FROM messages
       WHERE status = 'approved' ORDER BY id DESC LIMIT ?`

  const { results } = await env.DB.prepare(sql).bind(limit).all()

  return json({ ok: true, admin, items: results || [] }, 200, cors)
}

/* --------------------------------- POST ---------------------------------- */

async function handlePost(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400, cors)
  }

  // 蜜罐：真人看不见这个字段，填了就是机器人。静默返回成功，不入库。
  if (body.hp) return json({ ok: true, id: 0 }, 200, cors)

  // 打开页面到提交之间至少要过 3 秒，太快说明是脚本
  const openedAt = Number(body.ts)
  if (!Number.isFinite(openedAt)) return fail('请求不完整，请刷新页面重试。', 400, cors)
  const elapsed = Date.now() - openedAt
  if (elapsed < 3000) return fail('提交太快了，稍等一下再发。', 429, cors)
  if (elapsed > 6 * 3600 * 1000) return fail('页面停留过久，请刷新后重试。', 400, cors)

  const name = clean(body.name, NAME_MAX)
  const contact = clean(body.contact, CONTACT_MAX)
  const content = clean(body.content, CONTENT_MAX)

  if (!name) return fail('请填写昵称（最多 ' + NAME_MAX + ' 字）。', 400, cors)
  if (!content) return fail('写点什么再提交吧（最多 ' + CONTENT_MAX + ' 字）。', 400, cors)
  if (content.length < 4) return fail('内容太短了，至少写 4 个字。', 400, cors)
  if (contact && contact.length < 3) return fail('联系方式看起来不对，可以留空。', 400, cors)

  // 留言板不放链接：既防广告，也避免被人拿去做引流
  // 联系方式允许邮箱（形如 a@b.com），所以只对它查协议头
  if (hasUrl(content) || hasUrl(name) || /https?:\/\/|www\./i.test(contact)) {
    return fail('留言不支持网址链接，去掉后再提交。', 400, cors)
  }
  if (contact && contact.includes('@') && !/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(contact)) {
    return fail('邮箱格式看起来不对，可以留空。', 400, cors)
  }
  if (/(.)\1{19,}/.test(content.replace(/\s/g, ''))) {
    return fail('内容异常，请正常书写。', 400, cors)
  }

  await ensureTable(env)

  const ipHash = await shortHash((env.SALT || 'rhua') + clientIp(request))
  const uaHash = await shortHash(request.headers.get('User-Agent') || '')

  // 同一个 IP 一分钟一条，挡住最基本的刷屏
  const last = await env.DB.prepare(
    `SELECT created_at FROM messages WHERE ip_hash = ? ORDER BY id DESC LIMIT 1`,
  )
    .bind(ipHash)
    .first()

  if (last && last.created_at) {
    // created_at 形如 2026-10-09T13:00:00Z（SQLite 存的是 UTC 字符串）
    const raw = String(last.created_at)
    const ts = Date.parse(/([Zz]|[+-]\d{2}:\d{2})$/.test(raw) ? raw : raw + 'Z')
    if (Number.isFinite(ts)) {
      const secs = (Date.now() - ts) / 1000
      if (secs < COOLDOWN_SEC) {
        return fail('发得太快了，同一 IP 一分钟只能留一条，请稍后再发。', 429, cors)
      }
    }
  }

  const res = await env.DB.prepare(
    `INSERT INTO messages (name, contact, content, ip_hash, ua_hash)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(name, contact, content, ipHash, uaHash)
    .run()

  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 200, cors)
}

/* -------------------------------- DELETE --------------------------------- */

async function handleDelete(request, env, cors) {
  if (!(await isAdmin(request, env))) {
    return json({ ok: false, error: 'unauthorized' }, 401, cors)
  }
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10)
  if (!Number.isInteger(id) || id <= 0) {
    return json({ ok: false, error: 'bad_id' }, 400, cors)
  }
  await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run()
  return json({ ok: true, id }, 200, cors)
}

/* -------------------------------- 工具函数 ------------------------------- */

function fail(message, status, cors) {
  return json({ ok: false, error: 'invalid', message }, status, cors)
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: cors })
}

function clean(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function hasUrl(text) {
  if (!text) return false
  return /(https?:\/\/|www\.|\[url|\[link|\b[\w-]+\.(com|cn|net|org|io|xyz|top|me|co|tv|shop|club)\b)/i.test(
    text,
  )
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}

async function isAdmin(request, env) {
  const token = env.ADMIN_TOKEN
  if (!token) return false
  const given =
    request.headers.get('x-admin-token') ||
    new URL(request.url).searchParams.get('admin') ||
    ''
  // 空字符串不能进 crypto.subtle（"Zero-length key is not supported"）
  if (!given) return false
  if (given.length !== token.length) return false
  const [a, b] = await Promise.all([shortHash('rhua:' + token), shortHash('rhua:' + given)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function shortHash(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
