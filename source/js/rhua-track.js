/**
 * 渠道识别脚本（无后端、无 cookie）
 *
 * 解决的问题：同一份内容会从朋友圈、微信群、小红书、抖音等多个渠道分发，
 * 想知道「流量从哪来」，靠的就是落地页路径不同：
 *
 *   /g/pyq/    朋友圈
 *   /g/group/  微信群
 *   /g/xhs/    小红书
 *   /g/dy/     抖音
 *   /g/jd/     京东站内或其它渠道
 *   /goods/    自然流量（公域/搜索）
 *
 * 在 Cloudflare Web Analytics 的「路径」报表里，直接就能看到各渠道的访问量对比，
 * 不需要埋点、不需要后端、不依赖 cookie。
 *
 * 另外也支持 ?ch=xxx 的形式，会写进 sessionStorage（rhua_ch），
 * 方便以后接入任何统计服务时把渠道串到后续行为上。
 */
(function () {
    'use strict';

    var CHANNELS = {
        pyq: '朋友圈',
        group: '微信群',
        xhs: '小红书',
        dy: '抖音',
        jd: '京东入口',
        zhihu: '知乎',
        bili: 'B站'
    };

    function detect() {
        var qs = new URLSearchParams(window.location.search);
        if (qs.get('ch')) return qs.get('ch').toLowerCase();

        var m = window.location.pathname.match(/^\/g\/([a-z0-9_-]+)\/?$/i);
        if (m) return m[1].toLowerCase();

        if (/^\/goods\/?$/.test(window.location.pathname)) return 'direct';
        return null;
    }

    var ch = detect();
    if (!ch) return;

    try {
        window.sessionStorage.setItem('rhua_ch', ch);
    } catch (e) { /* 隐私模式下忽略 */ }

    document.documentElement.setAttribute('data-ch', ch);
    document.addEventListener('DOMContentLoaded', function () {
        document.body.setAttribute('data-ch', ch);
    });

    // 调试用：URL 加 ?debug=1 时在控制台打印渠道与点击记录
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
        console.info('[rhua] 当前渠道:', ch, CHANNELS[ch] || '自定义');
        document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a[data-cta]');
            if (a) console.info('[rhua] 点击商品:', a.getAttribute('data-sku'), a.href);
        });
    }
})();
