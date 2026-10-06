/**
 * Cloudflare Web Analytics 令牌：从环境变量注入，不写入仓库
 *
 * 为什么要绕这一层：
 *   1. 仓库 RhuaHub/rhua.net 是公开的，而 GitHub 的 secret scanning 会按格式把
 *      Cloudflare 令牌识别为「Cloudflare User API Token」，直接拒绝推送
 *      （GH013 / Push cannot contain secrets）。
 *   2. 令牌放到 Cloudflare Pages 的环境变量里，换令牌不用改代码、不用重新提交。
 *
 * 用法：
 *   - 线上：Cloudflare Pages → 项目 Settings → Environment variables
 *           添加 CF_ANALYTICS_TOKEN = <你的 beacon 令牌>，重新部署即生效
 *   - 本地：CF_ANALYTICS_TOKEN=xxx npx hexo generate
 *   - 不设置也不影响构建，只是不加载统计脚本（构建日志会给一条 warn）
 */

hexo.extend.filter.register('before_generate', function () {
  const token = process.env.CF_ANALYTICS_TOKEN;

  if (token) {
    hexo.theme.config.cloudflare_analytics = token;
  } else {
    // 置空，避免误用仓库里遗留的占位值
    hexo.theme.config.cloudflare_analytics = '';
    hexo.log.warn(
      '[cf-analytics] 未设置环境变量 CF_ANALYTICS_TOKEN，本次构建不加载访问统计。\n' +
      '  线上请在 Cloudflare Pages 的环境变量里配置它。'
    );
  }
});
