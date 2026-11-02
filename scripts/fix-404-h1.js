/**
 * 修正 404 页的重复 h1
 *
 * 背景：
 *   Butterfly 在 header/index.pug 里会给所有非文章页注入一个隐藏的
 *   <h1 class="title-seo">（用于 SEO）。而 404 模板本身又输出
 *   <h1 class="error_title">404</h1>，结果 404 页出现两个 h1。
 *
 * 处理：
 *   只在 404.html 上把那个隐藏的 title-seo h1 降级成 div（保留 class 与
 *   隐藏样式），让「404」成为页面唯一的 h1。其余页面不动。
 */
hexo.extend.filter.register('after_render:html', function (str, data) {
  if (!data || data.path !== '404.html') return str;
  return str.replace(
    /<h1([^>]*class="[^"]*title-seo[^"]*"[^>]*)>([\s\S]*?)<\/h1>/,
    '<div$1 style="display:none">$2</div>'
  );
});
