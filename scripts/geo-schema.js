/**
 * GEO（生成式引擎优化）：结构化数据注入
 *
 * 目的：让 ChatGPT / Perplexity / Claude 这类生成式引擎在回答时能
 * 准确抓到「这篇文章说什么、谁写的、能回答哪几个问题」。
 *
 * 三件事：
 *   1. 增强主题已有的 BlogPosting / WebSite —— 主题只输出了最基础的几个字段
 *      （文章没有 publisher 和摘要，首页 WebSite 没有 publisher 和语言）
 *   2. 给带 faq 的文章追加 FAQPage（问答型提问靠这个被引用）
 *   3. 每篇文章补 BreadcrumbList
 *
 * ⚠️ 增强而不是新增：主题自己已经输出了一份 BlogPosting / WebSite，
 *    再插一份同类型的会让搜索引擎看到两个互相矛盾的主体。
 *
 * FAQ 内容来自文章 front-matter 的 faq: 字段，不在这里硬编码 ——
 * 改内容只动 markdown，不动脚本。
 *
 * 注意：本项目的 Hexo 8 不会把 module.exports 当初始化函数调用，
 * scripts/ 下的脚本必须直接用全局 hexo（与 emit-headers.js 一致）。
 */

const LANG = 'zh-CN'

/** 从 HTML 里取一个 meta 标签的 content */
function meta(html, prop) {
  const re = new RegExp('<meta (?:property|name)="' + prop + '" content="([^"]*)"')
  const m = html.match(re)
  return m ? m[1] : ''
}

/** 序列化 JSON-LD：转义 </ 防止提前闭合 script */
function ld(obj) {
  return (
    '<script type="application/ld+json">' +
    JSON.stringify(obj).replace(/<\//g, '<\\/') +
    '</script>'
  )
}

/**
 * 找到第一个指定 @type 的 JSON-LD 块并改写它。
 * @returns {{html: string, ok: boolean}} ok=false 表示没找到或解析失败，html 原样返回
 */
function patchFirst(html, type, fn) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  const m = html.match(re)
  if (!m) return { html: html, ok: false }

  let obj
  try {
    obj = JSON.parse(m[1])
  } catch (e) {
    return { html: html, ok: false }
  }
  if (!obj || obj['@type'] !== type) return { html: html, ok: false }

  fn(obj)
  return { html: html.replace(re, ld(obj)), ok: true }
}

function postUrl(post) {
  return typeof post.permalink === 'function' ? post.permalink() : post.permalink
}

/**
 * post.categories / post.tags 在 Hexo 里是 Warehouse 的 Query 对象，不是数组
 * （Array.isArray 为 false），必须先调 toArray() 再取 name，否则会把整个
 * Query 当成一个元素，最后拼出 "[object Object]"。
 */
function toArray(v) {
  if (!v) return []
  if (typeof v.toArray === 'function') return v.toArray()
  if (Array.isArray(v)) return v
  return [v]
}

const config = hexo.config
const root = (config.url || '').replace(/\/+$/, '')
const siteName = config.title
const logo = root + (config.avatar || '/img/avatar-hua.webp')

const publisher = {
  '@type': 'Organization',
  name: siteName,
  url: root + '/',
  logo: logo
}

hexo.extend.filter.register('after_render:html', function (html) {
  if (!html || html.indexOf('</head>') === -1) return html

  const url = meta(html, 'og:url')
  const inject = []

  // ---------- 首页：增强已有的 WebSite ----------
  if (url === root || url === root + '/') {
    const r = patchFirst(html, 'WebSite', function (obj) {
      obj.description = config.description || obj.description || ''
      obj.inLanguage = LANG
      obj.publisher = publisher
    })
    if (r.ok) return r.html

    // 主题没输出 WebSite 的情况下才自己插一个
    inject.push(
      ld({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteName,
        url: root + '/',
        description: config.description || '',
        inLanguage: LANG,
        publisher: publisher
      })
    )
    return html.replace('</head>', inject.join('\n') + '\n</head>')
  }

  // ---------- 文章页 ----------
  const posts = hexo.locals.get('posts').toArray()
  const post = posts.find(function (p) {
    const u = postUrl(p)
    return u && u.replace(/\/+$/, '') === url.replace(/\/+$/, '')
  })

  if (post) {
    const desc =
      post.description || (post.excerpt || '').replace(/<[^>]+>/g, '').slice(0, 160)
    // 分类对象自带 permalink，必须用它拼面包屑：自己用 encodeURIComponent 拼会
    // 把「NAS 选型」编码成 NAS%20%E9%80%89%E5%9E%8B，而真实路径是 NAS-%E9%80%89%E5%9E%8B
    // （空格被换成连字符），拼错就是死链。
    const catObjs = toArray(post.categories)
    const cats = catObjs
      .map(function (c) {
        return c.name || String(c)
      })
      .filter(Boolean)
    const tags = toArray(post.tags)
      .map(function (t) {
        return t.name || String(t)
      })
      .filter(Boolean)
    const kws = post.keywords
      ? String(post.keywords)
          .split(/[,，]/)
          .map(function (s) {
            return s.trim()
          })
          .filter(Boolean)
      : tags

    // 1) 增强已有的 BlogPosting
    const r = patchFirst(html, 'BlogPosting', function (obj) {
      obj.description = desc
      obj.inLanguage = LANG
      obj.publisher = publisher
      obj.mainEntityOfPage = { '@type': 'WebPage', '@id': obj.url }
      if (kws.length) obj.keywords = kws.join(', ')
      if (cats.length) {
        obj.articleSection = cats[0]
        obj.about = cats.map(function (c) {
          return { '@type': 'Thing', name: c }
        })
      }
    })
    html = r.html

    // 2) FAQPage（只有 front-matter 写了 faq 才输出）
    const faq = post.faq
    if (Array.isArray(faq) && faq.length) {
      inject.push(
        ld({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq
            .filter(function (x) {
              return x && x.q && x.a
            })
            .map(function (x) {
              return {
                '@type': 'Question',
                name: String(x.q),
                acceptedAnswer: { '@type': 'Answer', text: String(x.a) }
              }
            })
        })
      )
    }

    // 3) BreadcrumbList
    const catName = cats[0] || '文章'
    const catUrl =
      (catObjs[0] && catObjs[0].permalink) ||
      root + '/categories/' + encodeURIComponent(catName) + '/'
    const crumbs = [
      { name: '首页', url: root + '/' },
      { name: catName, url: catUrl },
      { name: post.title, url: postUrl(post) }
    ]
    inject.push(
      ld({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map(function (c, i) {
          return {
            '@type': 'ListItem',
            position: i + 1,
            name: c.name,
            item: c.url
          }
        })
      })
    )
  }

  if (!inject.length) return html
  return html.replace('</head>', inject.join('\n') + '\n</head>')
})
