---
title: 推广物料台
date: 2026-10-05 20:30:00
noindex: true
sitemap: false
description: 自用：渠道链接与推广海报的分发台，不对外推广。
---

自用的**分发台**：每天发群、发朋友圈、发笔记时，从这里取链接和图，不用再手工敲。

## 一分购海报

长按保存到相册。扫码打开京东 APP，一分购仅限**京东新用户，或 3 个月未下单的用户**，每人一次机会。

<div class="goods-promo">
  <img src="/img/goods/promo-1fen-square.png" alt="京东一分购推广海报，长按识别二维码打开京东APP" loading="lazy" decoding="async">
  <p class="goods-promo__hint">1080×1080，朋友圈 / 群里发图直接用这张</p>
</div>

## 渠道链接

每个渠道一条独立链接，发之前认准对应那一条——**站内统计靠它区分流量来源**。

<div class="goods-share">
  <h3>朋友圈 · pyq</h3>
  <p class="goods-share__desc">适合配九宫格或单图发，文案走「自己用过、说缺点」的路子。</p>
  <textarea readonly id="rhua-share-url">https://rhua.net/g/pyq/</textarea>
  <div class="goods-share__row">
    <button class="goods-share__btn" data-copy="#rhua-share-url">复制链接</button>
    <span class="goods-share__ok" id="rhua-share-ok"></span>
  </div>
</div>

<div class="goods-share">
  <h3>微信群 · group</h3>
  <p class="goods-share__desc">群内每天固定推 3 条（早/午/晚），只推高佣高评分品。</p>
  <textarea readonly id="rhua-share-url-2">https://rhua.net/g/group/</textarea>
  <div class="goods-share__row">
    <button class="goods-share__btn" data-copy="#rhua-share-url-2">复制链接</button>
    <span class="goods-share__ok" id="rhua-share-ok-2"></span>
  </div>
</div>

<div class="goods-share">
  <h3>小红书 · xhs</h3>
  <p class="goods-share__desc">笔记正文放不下完整清单，评论区或简介挂这条。</p>
  <textarea readonly id="rhua-share-url-3">https://rhua.net/g/xhs/</textarea>
  <div class="goods-share__row">
    <button class="goods-share__btn" data-copy="#rhua-share-url-3">复制链接</button>
    <span class="goods-share__ok" id="rhua-share-ok-3"></span>
  </div>
</div>

<div class="goods-share">
  <h3>抖音 · dy</h3>
  <p class="goods-share__desc">视频口播引导「主页/评论区」，简介挂这条。</p>
  <textarea readonly id="rhua-share-url-4">https://rhua.net/g/dy/</textarea>
  <div class="goods-share__row">
    <button class="goods-share__btn" data-copy="#rhua-share-url-4">复制链接</button>
    <span class="goods-share__ok" id="rhua-share-ok-4"></span>
  </div>
</div>

## 还差一步（每次发之前确认）

链接已经备好，但**商品卡里的联盟链接还没配**——现在 `source/_data/goods.yml` 的 4 个网址还是占位符，别人点「去看看」不会产生佣金。配好之后这一页才算真正能用。
