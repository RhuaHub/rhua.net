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
 *           添加 CF_ANALYTICS_TOKEN = <32 位十六进制 beacon 令牌>，重新部署即生效
 *   - 本地：CF_ANALYTICS_TOKEN=xxx npx hexo generate
 *   - 不设置也不影响构建，只是不加载统计脚本（构建日志会明确说明原因）
 *
 * 变量名的备选（任一命中即可，方便在别处已经配过）：
 *   CF_ANALYTICS_TOKEN / CLOUDFLARE_ANALYTICS_TOKEN / CF_BEACON_TOKEN
 */

const CANDIDATE_KEYS = [
  'CF_ANALYTICS_TOKEN',
  'CLOUDFLARE_ANALYTICS_TOKEN',
  'CF_BEACON_TOKEN',
];

// 只显示前 4 位，够用来确认「配的是不是我想要的那一个」，又不泄露整串
function mask(token) {
  if (!token) return '(空)';
  const t = String(token).trim();
  return t.length <= 8 ? `${t.slice(0, 2)}***(${t.length} 位)` : `${t.slice(0, 4)}***(${t.length} 位)`;
}

hexo.extend.filter.register('before_generate', function () {
  const onPages = Boolean(process.env.CF_PAGES); // Cloudflare Pages 构建时自动置 1
  let usedKey = '';
  let token = '';

  for (const key of CANDIDATE_KEYS) {
    const v = process.env[key];
    if (v && String(v).trim()) {
      usedKey = key;
      token = String(v).trim();
      break;
    }
  }

  if (token) {
    hexo.theme.config.cloudflare_analytics = token;
    hexo.log.info(
      `[cf-analytics] 已注入访问统计令牌：来源 ${usedKey} = ${mask(token)}` +
      `${onPages ? '（Cloudflare Pages 构建）' : '（本地构建）'}`
    );
    return;
  }

  // 置空，避免误用仓库里遗留的占位值
  hexo.theme.config.cloudflare_analytics = '';

  const msg =
    '[cf-analytics] 未取到令牌，本次构建不加载访问统计。\n' +
    '  已检查的环境变量：' + CANDIDATE_KEYS.join('、') + '\n' +
    '  处理步骤：Cloudflare Pages → 项目 → Settings → Environment variables →\n' +
    '  添加 CF_ANALYTICS_TOKEN（32 位十六进制，不要带 cfut_ 前缀），Environment 选\n' +
    '  Production（和 Preview 各配一次），保存后必须对最新一次部署点 Retry deployment，\n' +
    '  仅重新 push 代码不会重跑旧部署。改完用下面这条命令验证（结果 >0 即生效）：\n' +
    '    curl -s https://rhua.net | grep -c cloudflareinsights';

  if (onPages) {
    // 在 Pages 上属于「配了却没生效」，值得用 error 级刷到构建日志顶部
    hexo.log.error(msg);
  } else {
    hexo.log.warn(msg);
  }
});
