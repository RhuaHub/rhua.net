/**
 * 华聚联盟 · RhuaHub —— 联盟商品卡组件
 *
 * 用法（在任意 .md 页面里）：
 *   {% goodslist %}              渲染 source/_data/goods.yml 里的全部分组
 *   {% goodslist 京东一分购 %}    只渲染指定分组
 *
 * 组件设计要点（也是合规要点）：
 *   1. 外链一律 rel="sponsored nofollow noopener"，符合搜索引擎对联盟链接的要求
 *   2. 展示「价格核对于 YYYY-MM-DD」，避免过期价格引起的投诉
 *   3. 输出 Product / Offer 结构化数据，有机会吃到搜索的商品富摘要
 *   4. 页面底部自动生成「广告声明」，标注含推广链接
 *   5. 数据里的 url 若仍是占位符，卡片不渲染按钮（不留死链、不在页面上暴露开发提示），
 *      仅在构建日志里 warn 提醒站长去 goods.yml 配置联盟链接
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const PLACEHOLDER = /REPLACE_ME|your-affiliate|^#$/i;

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function loadGoods() {
    const file = path.join(hexo.base_dir, 'source', '_data', 'goods.yml');
    if (!fs.existsSync(file)) return { groups: [] };
    try {
        return yaml.load(fs.readFileSync(file, 'utf8')) || { groups: [] };
    } catch (e) {
        hexo.log.error('[goods-card] goods.yml 解析失败：' + e.message);
        return { groups: [] };
    }
}

function isConfigured(url) {
    return !!url && !PLACEHOLDER.test(String(url).trim());
}

function renderCard(item) {
    const ok = isConfigured(item.url);
    const tags = (item.tags || []).slice(0, 3)
        .map(t => `<span class="goods-badge goods-badge--tag">${esc(t)}</span>`).join('');
    const platform = item.platform
        ? `<span class="goods-badge goods-badge--platform">${esc(item.platform)}</span>` : '';
    const priceFrom = item.price_from
        ? `<s class="goods-card__was">¥${esc(item.price_from)}</s>` : '';
    const note = item.note
        ? `<p class="goods-card__note">${esc(item.note)}</p>` : '';
    const updated = item.updated
        ? `价格核对于 ${esc(item.updated)}` : '价格以商品页为准';
    const cta = ok
        ? `<a class="goods-card__cta" href="${esc(item.url)}" target="_blank"
              rel="sponsored nofollow noopener" data-cta="1"
              data-sku="${esc(item.name)}">去看看 →</a>`
        : '';

    return `
<article class="goods-card" data-sku="${esc(item.name)}">
  <div class="goods-card__thumb">
    <img src="${esc(item.img || '/img/goods/placeholder.png')}" alt="${esc(item.name)}"
         loading="lazy" decoding="async">
  </div>
  <div class="goods-card__body">
    <div class="goods-card__badges">${platform}${tags}</div>
    <h3 class="goods-card__name">${esc(item.name)}</h3>
    <div class="goods-card__price"><span class="goods-card__cur">¥</span>${esc(item.price)}${priceFrom}</div>
    <div class="goods-card__meta">${updated}</div>
    ${note}
    ${cta}
  </div>
</article>`.trim();
}

function renderJsonLd(items) {
    // 注意：filter 回调收到的是商品对象，必须取 .url 再判断，否则占位链接也会进结构化数据
    const list = items.filter(it => isConfigured(it.url)).map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
            '@type': 'Product',
            name: it.name,
            image: it.img,
            description: it.note || it.name,
            offers: {
                '@type': 'Offer',
                price: String(it.price).replace(/[^\d.]/g, '') || '0',
                priceCurrency: 'CNY',
                availability: 'https://schema.org/InStock',
                url: it.url,
                priceValidUntil: it.updated || ''
            }
        }
    }));
    if (!list.length) return '';
    const data = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list };
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

hexo.extend.tag.register('goodslist', function (args) {
    const filter = (args || []).join(' ').trim();
    const data = loadGoods();
    let groups = data.groups || [];
    if (filter) groups = groups.filter(g => String(g.name).indexOf(filter) >= 0);

    const pending = [];
    const blocks = groups.map(group => {
        const items = group.items || [];
        items.forEach(it => { if (!isConfigured(it.url)) pending.push(it.name); });
        const cards = items.map(renderCard).join('\n');
        const note = group.note ? `<p class="goods-group__note">${esc(group.note)}</p>` : '';
        return `<section class="goods-group">
  <h2 class="goods-group__title">${esc(group.name)}</h2>
  ${note}
  <div class="goods-grid">
${cards}
  </div>
</section>`;
    });

    const all = groups.reduce((a, g) => a.concat(g.items || []), []);
    // 未配置链接的商品只在构建日志里提醒，不渲染到公开页面
    if (pending.length) {
        hexo.log.warn('[goods-card] 有 %d 件商品的推广链接还是占位符（REPLACE_ME）：%s\n' +
            '  请到 source/_data/goods.yml 里换成你的联盟链接，否则不会产生佣金。',
            pending.length, pending.join('、'));
    }
    const ad = `<p class="goods-ad">广告声明：本页部分链接为推广链接，你通过链接下单，本站可能获得佣金，
        不影响你的实际支付价格，也不影响我们的推荐结论。</p>`;

    return `${blocks.join('\n')}${renderJsonLd(all)}${ad}`;
});

/* ---------------- 样式：只在含商品卡的页面注入 ---------------- */
const CSS = `
.goods-group{margin:28px 0}
.goods-group__title{font-size:20px;margin:0 0 6px}
.goods-group__note{font-size:13px;color:#8a8a8a;margin:0 0 16px}
.goods-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.goods-card{border:1px solid rgba(0,0,0,.08);border-radius:12px;background:#fff;overflow:hidden;display:flex;flex-direction:column;transition:border-color .15s}
.goods-card:hover{border-color:rgba(0,0,0,.2)}
.goods-card__thumb{background:#faf8f5;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;padding:10px}
.goods-card__thumb img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
.goods-card__body{padding:12px 14px 14px;display:flex;flex-direction:column;flex:1}
.goods-card__badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.goods-badge{font-size:12px;line-height:1;padding:4px 7px;border-radius:4px;background:#f1efec;color:#6b6b6b}
.goods-badge--platform{background:#fdeceb;color:#c0392b}
.goods-badge--tag{background:#f1efec;color:#6b6b6b}
.goods-card__name{font-size:15px;font-weight:500;line-height:1.45;margin:0 0 8px;color:#2b2b2b}
.goods-card__price{font-size:22px;font-weight:700;color:#e1251b;line-height:1.2}
.goods-card__cur{font-size:14px;font-weight:500;margin-right:1px}
.goods-card__was{font-size:13px;font-weight:400;color:#a8a8a8;margin-left:8px}
.goods-card__meta{font-size:12px;color:#9a9a9a;margin-top:4px}
.goods-card__note{font-size:13px;color:#6b6b6b;line-height:1.6;margin:10px 0 0}
.goods-card__cta{display:block;text-align:center;margin-top:auto;padding:9px 12px;border-radius:8px;background:#e1251b;color:#fff !important;font-size:14px;font-weight:500;text-decoration:none !important}
.goods-card__cta:hover{background:#c4201a}
.goods-ad{font-size:12px;color:#9a9a9a;line-height:1.6;margin:26px 0 0;padding-top:14px;border-top:1px solid rgba(0,0,0,.06)}
@media screen and (max-width:640px){.goods-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}.goods-card__price{font-size:19px}}
`;

hexo.extend.filter.register('after_render:html', function (str, data) {
    const head = [];
    const page = (data && data.page) || {};

    if (str.indexOf('goods-grid') >= 0) {
        head.push('<style id="rhua-goods-style">' + CSS + '</style>');
    }
    // 渠道落地页（/g/xxx/）内容与 /goods/ 相同，标 noindex 避免重复内容
    if (page.channel) {
        head.push('<meta name="robots" content="noindex,follow">');
    }
    // Cloudflare Web Analytics（在 _config.yml 的 affiliate.cf_analytics_token 填令牌后自动生效）
    const aff = hexo.config.affiliate || {};
    if (aff.cf_analytics_token) {
        head.push('<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"' +
            String(aff.cf_analytics_token).replace(/"/g, '') + '"}\'></script>');
    }
    // 渠道识别脚本（读取 /g/xxx 或 ?ch=xxx，写入 sessionStorage，供后续统计串联）
    head.push('<script defer src="/js/rhua-track.js"></script>');

    if (!head.length) return str;
    if (str.indexOf('</head>') < 0) return str;
    return str.replace('</head>', head.join('') + '</head>');
});
