/* rhua.net 留言板 —— 原生 JS，零依赖，配合 functions/api/guestbook.js 使用
 * 服务端是 Cloudflare Pages Functions（同源 /api/guestbook），数据库是 D1。
 * 未绑定数据库时接口返回 not_configured，这里会显示维护提示而不是报错。
 */
(function () {
  'use strict'

  const CONFIG = window.RHUA_GB || {}
  const ENDPOINT = CONFIG.endpoint || '/api/guestbook'
  const STORE_KEY = 'rhua-gb-admin'

  function el(tag, cls, text) {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  function fmtTime(iso) {
    if (!iso) return ''
    const d = new Date(/[Zz]$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z')
    if (isNaN(d.getTime())) return String(iso).slice(0, 10)
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  function boot() {
    const root = document.getElementById('rhua-guestbook')
    if (!root || root.dataset.ready === '1') return
    root.dataset.ready = '1'

    let adminToken = ''
    try {
      const m = new URLSearchParams(location.search).get('admin')
      if (m) {
        adminToken = m
        sessionStorage.setItem(STORE_KEY, m)
      } else {
        adminToken = sessionStorage.getItem(STORE_KEY) || ''
      }
    } catch (e) {
      adminToken = ''
    }

    root.innerHTML = ''
    root.appendChild(buildForm())
    root.appendChild(el('div', 'rhua-gb-list', ''))
    const list = root.querySelector('.rhua-gb-list')
    list.appendChild(el('div', 'rhua-gb-empty', '留言加载中…'))
    load()
  }

  /* ------------------------------- 表单 ------------------------------- */

  function buildForm() {
    const form = el('form', 'rhua-gb-form')
    form.setAttribute('autocomplete', 'off')

    const row = el('div', 'rhua-gb-row')
    const nameWrap = el('label', 'rhua-gb-field')
    nameWrap.appendChild(el('span', 'rhua-gb-label', '昵称'))
    const name = el('input', 'rhua-gb-input')
    name.type = 'text'
    name.maxLength = 24
    name.placeholder = '怎么称呼你'
    name.autocomplete = 'off'
    nameWrap.appendChild(name)
    row.appendChild(nameWrap)

    const contactWrap = el('label', 'rhua-gb-field')
    contactWrap.appendChild(el('span', 'rhua-gb-label', '联系方式（选填）'))
    const contact = el('input', 'rhua-gb-input')
    contact.type = 'text'
    contact.maxLength = 64
    contact.placeholder = '邮箱或微信，方便的话回复你'
    contact.autocomplete = 'off'
    contactWrap.appendChild(contact)
    row.appendChild(contactWrap)
    form.appendChild(row)
    form.appendChild(el('p', 'rhua-gb-hint', '联系方式只有站长能看到，不会公开展示。'))

    const contentWrap = el('label', 'rhua-gb-field rhua-gb-field--block')
    contentWrap.appendChild(el('span', 'rhua-gb-label', '留言'))
    const content = el('textarea', 'rhua-gb-textarea')
    content.rows = 4
    content.maxLength = 500
    content.placeholder = '想问什么、想聊什么，直接写。（最多 500 字，不支持链接）'
    contentWrap.appendChild(content)
    form.appendChild(contentWrap)

    // 蜜罐字段：CSS 里藏起来，只有自动填表的机器人会填
    const hp = el('input', 'rhua-gb-hp')
    hp.type = 'text'
    hp.tabIndex = -1
    hp.setAttribute('aria-hidden', 'true')
    hp.autocomplete = 'off'
    form.appendChild(hp)

    const counter = el('div', 'rhua-gb-counter', '0 / 500')
    form.appendChild(counter)

    const foot = el('div', 'rhua-gb-foot')
    const submit = el('button', 'rhua-gb-btn', '发布留言')
    submit.type = 'submit'
    foot.appendChild(submit)
    const tip = el('span', 'rhua-gb-tip', '')
    foot.appendChild(tip)
    form.appendChild(foot)

    const ts = Date.now()

    content.addEventListener('input', function () {
      counter.textContent = content.value.length + ' / 500'
    })

    form.addEventListener('submit', function (e) {
      e.preventDefault()
      submitForm({ form, name, contact, content, hp, submit, tip, ts })
    })

    return form
  }

  function submitForm(refs) {
    const { form, name, contact, content, hp, submit, tip, ts } = refs
    if (submit.disabled) return
    tip.className = 'rhua-gb-tip'
    tip.textContent = ''

    if (!name.value.trim()) return warn('请填写昵称。')
    if (content.value.trim().length < 4) return warn('至少写 4 个字。')

    submit.disabled = true
    submit.textContent = '发送中…'
    tip.className = 'rhua-gb-tip'
    tip.textContent = '正在发送…'

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value,
        contact: contact.value,
        content: content.value,
        hp: hp.value,
        ts: ts,
      }),
    })
      .then(function (r) {
        return readBody(r, '留言服务尚未启用，留言没能发出去。')
      })
      .then(function (data) {
        submit.disabled = false
        submit.textContent = '发布留言'
        if (data && data.ok) {
          tip.className = 'rhua-gb-tip is-ok'
          tip.textContent = '已发布，谢谢你。'
          content.value = ''
          contact.value = ''
          form.querySelector('.rhua-gb-counter').textContent = '0 / 500'
          load()
        } else {
          tip.className = 'rhua-gb-tip is-bad'
          tip.textContent = (data && data.message) || '没发出去，稍后再试。'
        }
      })
      .catch(function () {
        submit.disabled = false
        submit.textContent = '发布留言'
        tip.className = 'rhua-gb-tip is-bad'
        tip.textContent = '网络异常，留言没发出去。'
      })

    function warn(msg) {
      tip.className = 'rhua-gb-tip is-bad'
      tip.textContent = msg
    }
  }

  /* ------------------------------- 列表 ------------------------------- */

  function load() {
    const root = document.getElementById('rhua-guestbook')
    const list = root && root.querySelector('.rhua-gb-list')
    if (!list) return
    const url = ENDPOINT + '?limit=200'
    return fetch(url, { headers: adminHeader() })
      .then(function (r) {
        return readBody(r, '留言服务尚未启用，稍后再来看看。')
      })
      .then(function (data) {
        if (!list.isConnected) return
        list.innerHTML = ''
        if (!data || !data.ok) {
          list.appendChild(
            el(
              'div',
              'rhua-gb-empty',
              (data && data.message) || '留言暂时读不出来，刷新试试。',
            ),
          )
          if (data && data.error === 'not_configured') {
            const form = root.querySelector('.rhua-gb-form')
            if (form) form.classList.add('is-disabled')
          }
          return
        }
        const items = data.items || []
        if (!items.length) {
          list.appendChild(el('div', 'rhua-gb-empty', '还没有人留言。你可以是第一个。'))
          return
        }
        items.forEach(function (m) {
          list.appendChild(buildItem(m, !!data.admin))
        })
      })
      .catch(function () {
        if (!list.isConnected) return
        list.innerHTML = ''
        list.appendChild(el('div', 'rhua-gb-empty', '留言暂时读不出来，刷新试试。'))
      })
  }

  // Functions 还没部署时，Cloudflare 会返回 HTML 的 404 页而不是 JSON，
  // 这时要给出"未启用"的提示，而不是把页面报错甩给读者
  function readBody(res, fallbackMessage) {
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (ct.indexOf('json') === -1) {
      return Promise.resolve({ ok: false, error: 'unavailable', message: fallbackMessage })
    }
    return res.json().catch(function () {
      return { ok: false, error: 'bad_response', message: fallbackMessage }
    })
  }

  function adminHeader() {
    return window.__RHUA_GB_TOKEN ? { 'x-admin-token': window.__RHUA_GB_TOKEN } : undefined
  }

  function buildItem(m, isAdmin) {
    const item = el('div', 'rhua-gb-item')
    item.setAttribute('data-id', m.id)

    const avatar = el('div', 'rhua-gb-avatar', (m.name || '?').trim().slice(0, 1).toUpperCase())
    item.appendChild(avatar)

    const body = el('div', 'rhua-gb-body')
    const head = el('div', 'rhua-gb-head')
    head.appendChild(el('span', 'rhua-gb-name', m.name || '匿名'))
    head.appendChild(el('time', 'rhua-gb-time', fmtTime(m.created_at)))
    if (isAdmin && m.contact) {
      head.appendChild(el('span', 'rhua-gb-contact', '联系：' + m.contact))
    }
    if (isAdmin) {
      const del = el('button', 'rhua-gb-del', '删除')
      del.type = 'button'
      del.addEventListener('click', function () {
        remove(m.id, item)
      })
      head.appendChild(del)
    }
    body.appendChild(head)
    body.appendChild(el('div', 'rhua-gb-text', m.content || ''))
    item.appendChild(body)
    return item
  }

  function remove(id, item) {
    if (!confirm('删除这条留言？')) return
    fetch(ENDPOINT + '?id=' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'x-admin-token': window.__RHUA_GB_TOKEN || '' },
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false }
        })
      })
      .then(function (data) {
        if (data && data.ok) {
          item.remove()
        } else {
          alert('删除失败，检查管理员令牌。')
        }
      })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }

  // 把 admin token 暴露给 fetch header 使用（不落盘，只在本标签页会话内）
  Object.defineProperty(window, '__RHUA_GB_TOKEN', {
    get: function () {
      try {
        return sessionStorage.getItem('rhua-gb-admin') || ''
      } catch (e) {
        return ''
      }
    },
  })
})()
