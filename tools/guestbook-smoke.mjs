/* 留言板后端冒烟测试 —— 零第三方依赖，只需要 Node 22+（用到内置的 node:sqlite）
 *
 *   node tools/guestbook-smoke.mjs
 *
 * 原理：把 functions/api/guestbook.js 拷成 .mjs 临时文件（根目录 package.json 不是
 * type: module，直接 import .js 会被当成 CommonJS），再用 node:sqlite 模拟 D1 的
 * prepare / bind / first / all / run 接口，逐条打 GET / POST / DELETE。
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IMPL = path.join(HERE, '..', 'functions', 'api', 'guestbook.js')
const tmpCopy = path.join(os.tmpdir(), 'rhua-guestbook-' + Date.now() + '.mjs')
await fs.copyFile(IMPL, tmpCopy)
const { onRequest } = await import('file://' + tmpCopy)
process.on('exit', () => { try { require('node:fs').unlinkSync(tmpCopy) } catch (e) {} })

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const db = new DatabaseSync(':memory:')

class Stmt {
  constructor(sql) {
    this.sql = sql
    this.args = []
  }
  bind(...args) {
    this.args = args
    return this
  }
  _rows() {
    return db.prepare(this.sql).all(...this.args)
  }
  async first() {
    const r = this._rows()
    return r.length ? r[0] : null
  }
  async all() {
    return { success: true, results: this._rows() }
  }
  async run() {
    const prepared = db.prepare(this.sql)
    const info = prepared.run(...this.args)
    return {
      success: true,
      meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) },
    }
  }
}

const env = {
  DB: { prepare: (sql) => new Stmt(sql) },
  ADMIN_TOKEN: 'secret-token',
  SALT: 'test-salt',
}

const URL_BASE = 'https://rhua.net/api/guestbook'
let pass = 0
let fail = 0

function check(name, fn) {
  try {
    fn()
    pass++
    console.log('  PASS  ' + name)
  } catch (e) {
    fail++
    console.log('  FAIL  ' + name + '  →  ' + e.message)
  }
}

function call(path, opts = {}, customEnv = env) {
  return onRequest({ request: new Request(URL_BASE + path, opts), env: customEnv })
}

function post(payload, opts = {}) {
  return call('', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': opts.ip || '1.2.3.4',
    },
    body: JSON.stringify(payload),
  })
}

async function body(res) {
  const t = await res.text()
  return { status: res.status, json: t ? JSON.parse(t) : null }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('\n== 1. 未绑定数据库 ==')
{
  const r = await call('', {}, {})
  const b = await body(r)
  check('返回 503 + not_configured', () =>
    assert.equal(b.status === 503 && b.json.error === 'not_configured', true),
  )
}

console.log('\n== 2. OPTIONS 预检 ==')
{
  const r = await call('', { method: 'OPTIONS' })
  check('204 + Allow 头', () => {
    assert.equal(r.status, 204)
    assert.match(r.headers.get('Allow'), /GET, POST, DELETE, OPTIONS/)
  })
}

console.log('\n== 3. 空列表 ==')
{
  const b = await body(await call('?limit=200'))
  check('ok + items 为空数组 + admin=false', () => {
    assert.equal(b.json.ok, true)
    assert.deepEqual(b.json.items, [])
    assert.equal(b.json.admin, false)
  })
}

console.log('\n== 4. 校验分支 ==')
{
  const noName = await body(await post({ name: '', content: '想问问四盘位怎么选', ts: Date.now() - 10000 }))
  check('缺昵称 → 400', () => assert.equal(noName.status, 400))

  const short = await body(await post({ name: '小明', content: '好', ts: Date.now() - 10000 }))
  check('内容过短 → 400', () => assert.equal(short.status, 400))

  const tooFast = await body(await post({ name: '机器人', content: '我要问问 NAS 怎么选', ts: Date.now() }))
  check('提交过快 → 429', () => assert.equal(tooFast.status, 429))

  const withUrl = await body(
    await post({ name: '广告哥', content: '看看这里 https://spam.example.com 便宜', ts: Date.now() - 10000, hp: '' }),
  )
  check('含链接 → 400', () => assert.equal(withUrl.status, 400))
}

console.log('\n== 5. 蜜罐 ==')
{
  const b = await body(
    await post({ name: 'bot', content: '这是一条机器人留言内容', hp: 'i am a bot', ts: Date.now() - 10000 }),
  )
  check('返回成功假象', () => assert.equal(b.json.ok, true))
  const list = await body(await call('?limit=200'))
  check('实际没有入库', () => assert.equal(list.json.items.length, 0))
}

console.log('\n== 6. 正常提交 ==')
{
  const b = await body(
    await post({
      name: '老王',
      contact: 'laowang@example.com',
      content: '预算三千，主要存照片和备份手机，两个孩子，用什么合适？',
      hp: '',
      ts: Date.now() - 8000,
    }),
  )
  check('提交成功返回 id', () => assert.equal(b.json.ok && b.json.id > 0, true))

  const list = await body(await call('?limit=200'))
  check('列表出现该条', () => assert.equal(list.json.items.length, 1))
  const item = list.json.items[0]
  check('字段正确且有时间', () => {
    assert.equal(item.name, '老王')
    assert.match(item.content, /预算三千/)
    assert.match(item.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
  check('非管理员看不到联系方式', () => assert.equal(item.contact, undefined))
}

console.log('\n== 7. 冷却限制 ==')
{
  const b = await body(
    await post({ name: '老王', content: '再补一句，预算能到四千', hp: '', ts: Date.now() - 8000 }),
  )
  check('同一 IP 一分钟内二次发布 → 429', () => assert.equal(b.status, 429))

  const other = await body(
    await post(
      { name: '小李', content: '我也想问问四盘位', hp: '', ts: Date.now() - 8000 },
      { ip: '5.6.7.8' },
    ),
  )
  check('换 IP 不受影响 → 200', () => assert.equal(other.status, 200))
}

console.log('\n== 8. 管理员 ==')
{
  const list = await body(await call('?limit=200&admin=secret-token'))
  check('管理员能看到联系方式', () => {
    assert.equal(list.json.admin, true)
    assert.equal(list.json.items.some((i) => i.contact === 'laowang@example.com'), true)
  })

  const wrong = await body(await call('?limit=200&admin=bad'))
  check('错误 token → admin=false', () => assert.equal(wrong.json.admin, false))

  const noToken = await body(await call('?id=1', { method: 'DELETE' }))
  check('无 token 删除 → 401', () => assert.equal(noToken.status, 401))

  const del = await body(
    await call('?id=1', { method: 'DELETE', headers: { 'x-admin-token': 'secret-token' } }),
  )
  check('有 token 删除 → 200', () => assert.equal(del.json.ok, true))

  const after = await body(await call('?limit=200'))
  check('删除后列表减少', () => assert.equal(after.json.items.some((i) => i.id === 1), false))
}

console.log('\n== 9. 未配置 ADMIN_TOKEN 时管理端不可用 ==')
{
  const list = await body(await call('?limit=200&admin=anything', {}, { DB: env.DB }))
  check('没有 ADMIN_TOKEN → admin=false', () => assert.equal(list.json.admin, false))
}

console.log('\n---- ' + pass + ' passed, ' + fail + ' failed ----\n')
process.exit(fail ? 1 : 0)
