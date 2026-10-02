---
title: 站点重建：从手写静态站切到 Hexo
date: 2026-10-02 21:50:00
tags:
  - 建站
  - Hexo
categories:
  - 建站笔记
---

本站从纯手写 HTML/CSS/JS 的静态站，切换为 **Hexo + Butterfly 主题**。

## 为什么换

手写静态站的优点是可控，缺点是每加一篇文章都要手工维护列表、归档、标签页。
文章一多，维护成本就超过了它节省的那点构建复杂度。

Hexo 把「文章 → 列表 / 归档 / 标签 / 分类 / 搜索索引 / Sitemap」这条链路全部自动化，
产物依然是纯静态文件，可以直接交给 Cloudflare Pages，不增加任何运维负担。

## 部署链路

| 环节 | 方案 |
| --- | --- |
| 源码仓库 | GitHub |
| 构建 | Cloudflare Pages：`npm install && npx hexo generate` |
| 产物目录 | `public` |
| 域名 | rhua.net（Cloudflare 托管 DNS） |

> 注意：换成 Hexo 之后，Pages 上的构建命令必须同步改掉，
> 否则会因为找不到原来的 HTML 源文件而构建失败。

## 后续计划

- 补齐历史文章
- 接入评论系统
- 按分类整理硬件选型系列
