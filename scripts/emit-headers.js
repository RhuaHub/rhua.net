/**
 * 把 source/_headers 输出到站点根目录
 *
 * 为什么要绕这一层：Hexo 会跳过 source/ 下**下划线开头**的文件（_posts、_data 之外的一律不复制），
 * 所以直接放 source/_headers 不会出现在 public/ 里。而 Cloudflare Pages 要求 _headers
 * 必须在发布根目录才会生效（用于补 Cloudflare 默认不加的安全响应头）。
 *
 * 改安全头：直接编辑 source/_headers，不用动这个文件。
 */

const fs = require('fs')
const path = require('path')

hexo.extend.generator.register('_headers', function () {
  const file = path.join(hexo.source_dir, '_headers')

  if (!fs.existsSync(file)) {
    hexo.log.warn('[emit-headers] 找不到 source/_headers，本次构建不输出安全响应头')
    return
  }

  return { path: '_headers', data: fs.readFileSync(file, 'utf8') }
})
