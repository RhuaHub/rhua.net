# 留言板后端（Cloudflare Pages Functions）

`/guestbook/` 页面的后端就在 `api/guestbook.js`，部署时由 Cloudflare Pages 自动接管
`/api/guestbook` 这个路由，跟站点同域名、同源、同一条部署流水线。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/guestbook?limit=200` | 取留言列表，倒序 |
| POST | `/api/guestbook` | 提交留言 |
| DELETE | `/api/guestbook?id=1` | 删除留言，需要管理员令牌 |

## 一、上线要做的三步（Cloudflare Dashboard）

> 这三步是一次性的。绑定后每次 push 都会自动带上，不用再配。

**1. 建一个 D1 数据库**

Workers & Pages → D1 → Create database，名字随意（建议 `rhua-guestbook`）。

**2. 绑到 Pages 项目**

Workers & Pages → `rhua-net`（Pages 项目）→ Settings → Functions：

- **D1 database bindings** → Add binding
  - Variable name：`DB`（**必须叫 DB**，代码里读的是 `env.DB`）
  - D1 database：选刚才建的那个
- **Environment variables** → Add
  - `ADMIN_TOKEN`：一串随机长字符串（删留言用，别写进仓库）
  - `SALT`（可选）：IP 哈希的盐值

⚠️ Production 和 Preview 是两套独立配置，两边都要设，否则预览环境会 503。

**3. 重新部署一次**

绑定不会回溯到已有部署：Deployments → 最新一条 → Retry deployment。

## 二、验证

```bash
curl -s https://rhua.net/api/guestbook
# → {"ok":true,"admin":false,"items":[]}      正常
# → {"ok":false,"error":"not_configured",...} 还没绑 DB，或绑完没重新部署
```

表不用手动建：第一次请求时会自动 `CREATE TABLE IF NOT EXISTS messages`。

## 三、日常管理

打开 `https://rhua.net/guestbook/?admin=<ADMIN_TOKEN>`，每条留言右下角多一个「删除」按钮。
令牌只存在 sessionStorage 里，关掉标签页就失效 —— 把带 token 的链接存成书签即可。

要批量处理就去 D1 → Console 直接执行 SQL：

```sql
DELETE FROM messages WHERE id = 123;
UPDATE messages SET status = 'hidden' WHERE id = 123;  -- 表里留了 status 字段备用
SELECT * FROM messages ORDER BY id DESC LIMIT 50;
```

## 四、防刷做了什么

- 蜜罐字段：表单里有个真人看不见的输入框，被填了就静默丢弃
- 时间校验：打开页面到提交不足 3 秒，判定为脚本
- 同 IP 冷却：60 秒一条（只存 IP 的哈希，不存明文 IP）
- 留言禁链：昵称、正文带网址一律拒掉，联系方式只查 `http://` / `www.`
- 长度上限：昵称 24 字、联系方式 64 字、正文 500 字
- 联系方式默认不对外返回，只有管理员视图看得到

真要被盯上了，下一步是给表单加 Cloudflare Turnstile（免费），在 `guestbook.js` 里多传一个 token、后端校验即可。

## 五、本地跑测试（可选）

```bash
node tools/guestbook-smoke.mjs
```

零第三方依赖，用 Node 内置的 `node:sqlite` 模拟 D1，跑 21 项断言 GET / POST / DELETE
与各种防刷分支。改了 `api/guestbook.js` 之后跑一遍，别只靠肉眼。

用到 node:sqlite 时会有一条 ExperimentalWarning，忽略即可。
