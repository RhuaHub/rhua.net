/**
 * 分页页标题去重
 *
 * 问题：主题给所有分页页输出的 title 与第一页完全一样——
 * 首页和 /page/2/ 都叫「NAS 折腾笔记 - 不教你怎么买，只教你怎么玩」，
 * /archives/page/2/ 和 /archives/ 都叫「归档 | NAS 折腾笔记」。
 * 搜索引擎会当成重复页面，抓了也只会留一个。
 *
 * 做法：在 after_render:html 阶段，若当前页有 page.current > 1，
 * 就把「- 第 N 页」插到站点名前（title 形如「A | 站点名」）。
 * 只改标题，不改导航与 canonical —— 分页页指向自身是对的。
 */

hexo.extend.filter.register('after_render:html', function (html, data) {
  try {
    const page = data && data.page
    const current = page && page.current
    if (!current || current <= 1) return html

    return html.replace(/<title>([\s\S]*?)<\/title>/, function (whole, inner) {
      const title = inner.trim()
      // 已经带页码就跳过，避免重复渲染时叠加
      if (/第\s*\d+\s*页/.test(title)) return whole

      const suffix = ' - 第 ' + current + ' 页'
      // 形如「归档 | NAS 折腾笔记」：页码插在「| 站点名」之前
      const sep = title.lastIndexOf(' | ')
      if (sep > 0) {
        return '<title>' + title.slice(0, sep) + suffix + title.slice(sep) + '</title>'
      }
      return '<title>' + title + suffix + '</title>'
    })
  } catch (e) {
    return html
  }
})
