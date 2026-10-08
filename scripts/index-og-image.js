/**
 * 首页 og:image 修正
 *
 * 为什么需要这一层：
 *   主题的 Open_Graph.pug 是 `page.cover_type === 'img' ? page.cover : theme.avatar.img`。
 *   首页由 hexo-generator-index 生成、没有 cover，于是 og:image 退回到头像图标
 *   （36KB 的透明书法字），分享到微信/朋友圈时缩略图很难看。
 *
 *   ⚠️ 不能用主题的 Open_Graph_meta.option 设 image —— 它的合并顺序是
 *      Object.assign({ 默认 }, option)，option 在后面，会把 7 篇文章各自的封面
 *      一起覆盖掉，比现在更糟。所以这里只针对首页这一个 URL 做替换。
 *
 * 用法：在 _config.yml 里配 `index_og_image`，留空则不启用。
 *   index_og_image: /img/cover/cover-price-tiers.jpg
 */

const root = (hexo.config.url || '').replace(/\/+$/, '') + '/'
const img = (hexo.config.index_og_image || '').trim()

if (img) {
  const abs = root + img.replace(/^\//, '')
  const marker = '<meta property="og:url" content="' + root + '">'

  hexo.extend.filter.register('after_render:html', function (html) {
    // 只认首页：og:url 等于站点根地址的那一个页面
    if (html.indexOf(marker) === -1) return html

    return html
      .replace(/(<meta property="og:image" content=")[^"]*(">)/, '$1' + abs + '$2')
      .replace(/(<meta name="twitter:image" content=")[^"]*(">)/, '$1' + abs + '$2')
  })
}
