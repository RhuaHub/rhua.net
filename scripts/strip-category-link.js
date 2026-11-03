/**
 * 侧栏作者卡的「分类 : 0」条目指向已取消的 /categories/。
 * 主题模板（card_author.pug）没有开关，这里在渲染后整体摘掉这个 <a>，
 * 连带省掉每页一次 301 跳转；原 CSS 隐藏规则保留作为兜底。
 * after_render:html
 */
hexo.extend.filter.register('after_render:html', (data) => {
  if (!data.includes('/categories/')) return data;
  return data.replace(
    /<a href="\/categories\/"[^>]*>\s*<div class="headline">[^<]*<\/div>\s*<div class="length-num">\d+<\/div>\s*<\/a>/g,
    ''
  );
});
