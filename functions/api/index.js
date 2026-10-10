/**
 * 留言板 Worker 的入口。
 *
 * 站点（rhua-net）是 Workers + 静态资源，不会打包 Pages 风格的 functions/，
 * 所以这份代码是作为**独立 Worker**（部署名 rhua-guestbook）上传的，
 * 由 tools/deploy-guestbook.sh 负责上传与挂域名。
 */

import { onRequest } from './guestbook.js'

export default {
  async fetch(request, env, ctx) {
    return onRequest({ request, env, ctx })
  },
}
