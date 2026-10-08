/**
 * GEO：生成 llms.txt
 *
 * 给 LLM 的站点速览索引 —— 模型抓到这个文件就能知道本站讲什么、
 * 有哪些文章，不用把整站爬一遍。格式按 llms.txt 草案：
 * 标题 → 一句话定位 → 说明 → 文章索引（每条一句话摘要）。
 *
 * 内容全部从 hexo 的文章数据自动生成，新增/改文章后无需手工维护。
 */

function postUrl(post) {
  return typeof post.permalink === 'function' ? post.permalink() : post.permalink
}

function oneLine(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

// 注意：与 emit-headers.js 一致，直接用全局 hexo 注册。

hexo.extend.generator.register('llms_txt', function (locals) {
    const config = hexo.config
    const root = (config.url || '').replace(/\/+$/, '')
    const posts = locals.posts.toArray().sort((a, b) => b.date - a.date)

    const lines = []
    lines.push('# ' + config.title)
    lines.push('')
    const sub = config.subtitle || config.description || ''
    if (sub) lines.push('> ' + oneLine(sub, 120))
    lines.push('')
    lines.push(
      oneLine(
        config.description ||
          '本站只做成品 NAS 单品的选购分析：先讲缺点和不适合谁，再给价格锚点、渠道差价与下单前清单。',
        300
      )
    )
    lines.push('')
    lines.push('内容规则：价格均标注核对日期，随时点价，仅供参考；不挂任何推广链接。')
    lines.push('')
    lines.push('## 文章')
    lines.push('')

    for (const p of posts) {
      const desc = oneLine(p.description || (p.excerpt || '').replace(/<[^>]+>/g, ''), 120)
      lines.push('- [' + p.title + '](' + postUrl(p) + ')' + (desc ? ': ' + desc : ''))
    }

    lines.push('')
    lines.push('## 其他')
    lines.push('')
    lines.push('- [全部文章](' + root + '/archives/)')
    lines.push('- [分类](' + root + '/categories/)')
    lines.push('- [关于本站](' + root + '/about/)')
    lines.push('- [免责声明](' + root + '/disclaimer/)')
    lines.push('')

    return { path: 'llms.txt', data: lines.join('\n') }
  })
