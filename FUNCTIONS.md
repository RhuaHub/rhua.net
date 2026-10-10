# 留言板后端（独立 Worker + D1）

**结论先说：本站是 Cloudflare Workers（Workers + 静态资源），不是 Pages。**
所以 `functions/` 不会被自动打包成 Pages Functions —— 2026-10-09 那天 `/api/guestbook`
一直 404 就是这个原因，不是配置没配对。

现在的实现是：把同样的代码作为**独立 Worker** `rhua-guestbook` 部署，域名挂在
**`https://api.rhua.net`**，数据库用 D1 `rhua-guestbook`。前端已指向这个地址。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `https://api.rhua.net/api/guestbook?limit=200` | 取留言列表，倒序 |
| POST | 同上 | 提交留言 |
| DELETE | 同上 + `?id=1&admin=<令牌>` | 删除留言，需要管理员令牌 |

## 一、重新部署（改了后端代码之后）

```bash
export CLOUDFLARE_API_TOKEN=cfut_xxxx   # 账户级令牌，需 Workers Scripts + D1 + Workers Domains 权限
export ADMIN_TOKEN=<删留言用的令牌>
export SALT=<IP 哈希盐，可选>
bash tools/deploy-guestbook.sh
```

脚本做三件事：上传 `functions/api/index.js` + `guestbook.js`、绑 D1 与环境变量、
把 `api.rhua.net` 挂到 Worker 上，最后自己 curl 验证一次。

固定的几个 ID 写在脚本里：账户 `90213dbb…`、Zone `475989d6…`、D1 `77249d51-4656-4dc5-a59c-d65e34909549`。
令牌只走环境变量，**不要写进仓库**。

## 二、验证

```bash
curl -s https://api.rhua.net/api/guestbook
# → {"ok":true,"admin":false,"items":[]}

curl -s -D - -o /dev/null -H "Origin: https://rhua.net" https://api.rhua.net/api/guestbook
# → Access-Control-Allow-Origin: https://rhua.net（跨域来源白名单由 ALLOWED_ORIGIN 控制）
```

表不用手动建：第一次请求时自动 `CREATE TABLE IF NOT EXISTS messages`。

## 三、日常管理

打开 `https://rhua.net/guestbook/?admin=<ADMIN_TOKEN>`，每条留言右下角多一个「删除」按钮。
令牌只存在 sessionStorage，关掉标签页即失效 —— 把带 token 的链接存成书签。

批量处理去 D1 → Console 直接跑 SQL：

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

真被盯上了，下一步是给表单加 Cloudflare Turnstile（免费）：前端多传一个 token、后端校验。

## 五、本地跑测试（可选）

```bash
node tools/guestbook-smoke.mjs
```

零第三方依赖，用 Node 内置的 `node:sqlite` 模拟 D1，跑 21 项断言覆盖 GET / POST / DELETE
与各种防刷分支。改了 `functions/api/guestbook.js` 之后跑一遍，别只靠肉眼。
用到 node:sqlite 时会有一条 ExperimentalWarning，忽略即可。

## 六、文件说明

| 文件 | 作用 |
| --- | --- |
| `functions/api/guestbook.js` | 业务逻辑（GET/POST/DELETE 处理函数 `onRequest`） |
| `functions/api/index.js` | Worker 入口，`export default { fetch }` 包一层 |
| `source/js/guestbook.js` | 前端，默认请求 `https://api.rhua.net/api/guestbook` |
| `tools/deploy-guestbook.sh` | 上传 + 绑 D1 + 挂域名 |

`functions/` 这个名字是历史遗留（当初按 Pages 约定建的），它现在只是**代码存放位置**，
不再有自动部署的含义。别指望 push 之后后端会自动更新 —— 后端要跑一次部署脚本。
