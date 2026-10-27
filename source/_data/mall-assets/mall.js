/* NAS 选型笔记 · 商城渲染 */
(function () {
  'use strict';
  var grid = document.getElementById('rm-grid');
  var tabs = document.getElementById('rm-tabs');
  var status = document.getElementById('rm-status');
  if (!grid || !tabs || !status) return;

  var currentCat = 'all';

  function money(n) { return '¥' + n.toLocaleString('zh-CN'); }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderTabs(cats) {
    var html = '<button class="rm-tab rm-active" data-cat="all">全部</button>';
    Object.keys(cats).forEach(function (k) {
      html += '<button class="rm-tab" data-cat="' + esc(k) + '">' + esc(cats[k]) + '</button>';
    });
    tabs.innerHTML = html;
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.rm-tab');
      if (!btn) return;
      currentCat = btn.dataset.cat;
      tabs.querySelectorAll('.rm-tab').forEach(function (b) {
        b.classList.toggle('rm-active', b === btn);
      });
      apply();
    });
  }

  function card(p) {
    return '<article class="rm-card" data-cat="' + esc(p.cat) + '">' +
      '<div class="rm-card-head"><h3 class="rm-name">' + esc(p.name) + '</h3>' +
      (p.tag ? '<span class="rm-tag">' + esc(p.tag) + '</span>' : '') + '</div>' +
      '<p class="rm-spec">' + esc(p.spec) + '</p>' +
      '<p class="rm-reason">' + esc(p.reason) + '</p>' +
      '<p class="rm-article">选型理由 → <a href="' + esc(p.article) + '">看文章分析</a></p>' +
      '<div class="rm-foot"><span class="rm-price">' + money(p.price) +
      '<small>参考价</small></span>' +
      '<a class="rm-buy" href="' + esc(p.link) + '" target="_blank" rel="nofollow noopener noreferrer sponsored">看实时价 ↗</a>' +
      '</div></article>';
  }

  function apply() {
    var cards = grid.querySelectorAll('.rm-card');
    var shown = 0;
    cards.forEach(function (c) {
      var show = currentCat === 'all' || c.dataset.cat === currentCat;
      c.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    status.textContent = shown ? '共 ' + shown + ' 件 · 参考价更新于 2026-10-26' : '该分类暂无商品';
  }

  fetch('/mall/products.json', { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data || !data.products || !data.products.length) throw new Error('empty');
      renderTabs(data.cats || {});
      grid.innerHTML = data.products.map(card).join('');
      apply();
    })
    .catch(function () {
      status.textContent = '清单加载失败，可刷新重试，或直接阅读推荐文章。';
    });
})();
