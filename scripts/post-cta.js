/**
 * 文章末尾的引导组件（站点「出口」）
 *
 * 为什么需要：
 *   全站此前唯一的联系入口是侧栏那几个指向邮箱的图标，而 30 篇文章里一处引导都没有。
 *   读者看完一篇 NAS 选型文章，想问「我家这种情况该买哪台」时，没有任何下一步。
 *   这个组件把出口补到每一篇文章的末尾。
 *
 * 为什么用脚本注入而不是改 md：
 *   1. 一次改动覆盖全部文章，以后新增文章自动带上，不用逐篇维护
 *   2. 文案/二维码/按钮全部由 _config.yml 的 post_cta 驱动，改配置即可，不动代码
 *   3. 关掉 enable 就整站消失，不会留下残影
 *
 * 当前状态：
 *   enable: true，按钮指向邮箱。等拿到公众号二维码后，
 *   把 qr 填成图片路径、button_url 换成公众号链接即可，其余不用动。
 */

hexo.extend.filter.register('after_post_render', function (data) {
  // 只作用于文章，页面（about / disclaimer 等）不加
  if (data.layout !== 'post') return data;

  const cfg = hexo.config.post_cta || {};
  if (!cfg.enable) return data;

  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let html = '<div class="rhua-post-cta">';

  if (cfg.qr) {
    html +=
      '<img class="rhua-post-cta-qr" src="' +
      esc(cfg.qr) +
      '" alt="' +
      esc(cfg.qr_alt || '二维码') +
      '" loading="lazy">';
  }

  html += '<div class="rhua-post-cta-body">';
  html += '<div class="rhua-post-cta-title">' + esc(cfg.title || '') + '</div>';
  html += '<p class="rhua-post-cta-desc">' + esc(cfg.desc || '') + '</p>';

  if (cfg.button_text && cfg.button_url) {
    html +=
      '<a class="rhua-post-cta-btn" href="' +
      esc(cfg.button_url) +
      '" rel="noopener">' +
      esc(cfg.button_text) +
      '</a>';
  }

  html += '</div></div>';
  data.content += html;
  return data;
});
