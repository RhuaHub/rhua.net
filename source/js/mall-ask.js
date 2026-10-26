/* 商城 · 30 秒问诊表单 —— 零后端：组装邮件内容，mailto 唤起 + 可复制兜底 */
(function () {
  'use strict';

  var EMAIL = 'parit@sina.com';

  // 使用事件委托绑定在 document 上：pjax 软跳转、脚本重复执行都不会丢事件
  function onClick(e) {
    var btn = e.target.closest ? e.target.closest('#ra-send') : null;
    if (!btn) return;
    e.preventDefault();

    var budgetEl = document.getElementById('ra-budget');
    var useEl = document.getElementById('ra-use');
    var noteEl = document.getElementById('ra-note');
    var budget = budgetEl ? budgetEl.value : '';
    var use = useEl ? useEl.value : '';
    var note = noteEl ? noteEl.value : '';

    if (!budget && !use && !note) {
      btn.textContent = '先选一下预算或用途 ↑';
      setTimeout(function () { btn.textContent = '生成邮件发给我 →'; }, 2000);
      return;
    }

    var subject = 'NAS 选型咨询' + (budget ? '（' + budget + '）' : '');
    var body =
      '预算：' + (budget || '未填') + '\n' +
      '主要用途：' + (use || '未填') + '\n' +
      '补充说明：' + (note || '无') + '\n\n' +
      '（来自 rhua.net/mall 问诊表单）';

    // 1. 先把结果展示在页面上，点击一定有可见反馈
    var out = document.getElementById('ra-out');
    if (!out) {
      out = document.createElement('div');
      out.id = 'ra-out';
      out.className = 'ra-out';
      out.innerHTML =
        '<div class="ra-out-head">内容已生成，复制后发到 ' +
        '<a href="mailto:' + EMAIL + '">' + EMAIL + '</a></div>' +
        '<textarea class="ra-out-text" id="ra-out-text" rows="5" readonly></textarea>' +
        '<div class="ra-out-actions">' +
        '<button type="button" class="ra-copy" id="ra-copy">复制内容</button>' +
        '<a class="ra-mail" id="ra-mail" href="#">用邮件客户端打开</a>' +
        '</div>';
      var actions = document.querySelector('.ra-actions');
      if (actions && actions.parentNode) actions.parentNode.insertBefore(out, actions.nextSibling);
      else document.getElementById('rhua-ask').appendChild(out);
    }
    var text = '收件人：' + EMAIL + '\n主题：' + subject + '\n\n' + body;
    var ta = document.getElementById('ra-out-text');
    if (ta) ta.value = text;
    var mailLink = document.getElementById('ra-mail');
    var mailHref = 'mailto:' + EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
    if (mailLink) mailLink.href = mailHref;

    // 2. 顺手尝试唤起邮件客户端（没有默认客户端时浏览器会静默失败，不影响上面的兜底）
    try { window.location.href = mailHref; } catch (err) {}

    out.style.display = 'block';
  }

  // 复制按钮
  function onCopy(e) {
    var btn = e.target.closest ? e.target.closest('#ra-copy') : null;
    if (!btn) return;
    e.preventDefault();
    var ta = document.getElementById('ra-out-text');
    if (!ta) return;
    var done = function () {
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = '复制内容'; }, 1800);
    };
    // 微信等内置浏览器不支持 clipboard API，用 execCommand 兜底
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done, function () { fallbackCopy(ta, done); });
    } else {
      fallbackCopy(ta, done);
    }
  }

  function fallbackCopy(ta, done) {
    try {
      ta.removeAttribute('readonly');
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      document.execCommand('copy');
      ta.setAttribute('readonly', 'readonly');
      done();
    } catch (err) {
      ta.focus();
      ta.select();
    }
  }

  if (!window.__rhuaAskBound) {
    window.__rhuaAskBound = true;
    document.addEventListener('click', onClick, false);
    document.addEventListener('click', onCopy, false);
  }
})();
