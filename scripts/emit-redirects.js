/**
 * 把 source/_redirects 输出到站点根目录
 *
 * 与 emit-headers.js 同理：Hexo 会跳过 source/ 下下划线开头的文件，
 * 而 Cloudflare 要求 _redirects 必须出现在发布根目录才生效。
 * 改跳转规则只动 source/_redirects，不用碰这个文件。
 */

const fs = require('fs')
const path = require('path')

hexo.extend.generator.register('_redirects', function () {
  const file = path.join(hexo.source_dir, '_redirects')

  if (!fs.existsSync(file)) {
    hexo.log.warn('[emit-redirects] 找不到 source/_redirects，本次构建不输出跳转规则')
    return
  }

  return { path: '_redirects', data: fs.readFileSync(file, 'utf8') }
})
