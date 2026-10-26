/* 商城 · 30 秒问诊表单 —— 零后端：组装 mailto 预填邮件 */
(function () {
  'use strict';
  var btn = document.getElementById('ra-send');
  if (!btn) return;

  btn.addEventListener('click', function () {
    var budget = (document.getElementById('ra-budget') || {}).value || '';
    var use = (document.getElementById('ra-use') || {}).value || '';
    var note = (document.getElementById('ra-note') || {}).value || '';

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

    window.location.href = 'mailto:parit@sina.com' +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  });
})();
