#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 DISCLAIMER.md（唯一编辑入口）同步到两处消费方。

只改一个文件，跑一条命令：

    python tools/sync-disclaimer.py

它会写入 / 刷新：

    1. _config.butterfly.yml      → 全站每个页面的页脚
                                    （Butterfly footer.custom_text，BEGIN / END 之间）
    2. source/disclaimer/index.md → /disclaimer/ 完整声明页（BEGIN / END 之间）

改完记得再跑一次 `npx hexo generate`（Cloudflare Pages 上会自动构建）。

用法：
    python tools/sync-disclaimer.py            # 同步（幂等，可反复运行）
    python tools/sync-disclaimer.py --check    # 只检查是否一致，不写文件（不一致时退出码 1）
"""
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "DISCLAIMER.md"
THEME_CFG = ROOT / "_config.butterfly.yml"
PAGE_MD = ROOT / "source" / "disclaimer" / "index.md"

# YAML 里的注释标记（缩进必须与 footer 的子键一致：2 个空格）
FOOTER_BEGIN = "# DISCLAIMER:BEGIN 由 tools/sync-disclaimer.py 从 DISCLAIMER.md 生成，请勿手改"
FOOTER_END = "# DISCLAIMER:END"
# Markdown 里的 HTML 注释标记
PAGE_BEGIN = "<!-- DISCLAIMER:BEGIN 由 tools/sync-disclaimer.py 从 DISCLAIMER.md 生成，请勿手改 -->"
PAGE_END = "<!-- DISCLAIMER:END -->"

DEFAULT_PREFIX = "免责声明："
DEFAULT_LINK = "/disclaimer/"
DEFAULT_CONTACT = "GitHub @RhuaHub"
DEFAULT_CONTACT_URL = "https://github.com/RhuaHub"
DEFAULT_SINCE = "2026 年 10 月 2 日"

PAGE_TEMPLATE = """---
title: 免责声明
date: {date}
description: 华聚联盟免责声明：本站只提供商品促销折扣信息，销售及售后与本站无关。
---

{before}
{after}
"""


def parse_source(text):
    """解析 DISCLAIMER.md：`#` 开头为说明/配置，其余按空行切段。"""
    cfg = {}
    body_lines = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            m = re.match(r"^#\s*([a-z_]+)\s*:\s*(.+?)\s*$", line)
            if m:
                cfg[m.group(1)] = m.group(2)
            continue
        body_lines.append(line.rstrip())

    paragraphs, cur = [], []
    for line in body_lines:
        if line.strip():
            cur.append(line.strip())
        elif cur:
            paragraphs.append("".join(cur))
            cur = []
    if cur:
        paragraphs.append("".join(cur))
    return cfg, paragraphs


def footer_html(cfg, paras):
    """页脚用的一段式声明：加粗前缀（即链接）+ 正文连续排版。

    Butterfly 的 footer.custom_text 直接以 innerHTML 渲染，
    因此用 display:block 的 <span> 实现居中与限宽，避免出现块级元素嵌套问题。
    """
    prefix = cfg.get("prefix", DEFAULT_PREFIX)
    link = cfg.get("link", DEFAULT_LINK)
    body = "".join(paras)
    style = ("display:block;text-align:center;max-width:900px;margin:0 auto;"
             "padding:0 12px;font-size:13px;line-height:1.7")
    return (f'<span class="disclaimer-inline" style="{style}">'
            f'<b><a href="{link}">{prefix}</a></b>{body}</span>')


def page_block(cfg, paras):
    """完整声明页的正文块：段落 + 联系 + 生效日期。"""
    lines = []
    for p in paras:
        lines.append(p)
        lines.append("")
    contact = cfg.get("contact", DEFAULT_CONTACT)
    contact_url = cfg.get("contact_url", DEFAULT_CONTACT_URL)
    since = cfg.get("since", DEFAULT_SINCE)
    lines.append("---")
    lines.append("")
    if contact:
        if contact_url:
            lines.append(f'**联系站长**：[{contact}]({contact_url})')
        else:
            lines.append(f"**联系站长**：{contact}")
        lines.append("")
    if since:
        lines.append(f"**生效日期**：{since}")
        lines.append("")
    return "\n".join(lines).rstrip("\n")


def replace_between(text, begin, end, new_content):
    """替换 begin / end 两行之间的内容（不含这两行本身）。

    比对时忽略首尾空白：YAML 里的标记行带缩进（必须是 footer 子键的 2 空格），
    写入时再把该缩进补回到每一行。
    """
    lines = text.splitlines()
    bi = ei = None
    for idx, line in enumerate(lines):
        if bi is None and line.strip() == begin.strip():
            bi = idx
        elif bi is not None and line.strip() == end.strip():
            ei = idx
            break
    if bi is None or ei is None:
        raise SystemExit(f"找不到标记对：\n  {begin}\n  {end}")
    indent = re.match(r"^\s*", lines[bi]).group(0)
    block = [indent + l if l.strip() else l for l in new_content.splitlines()]
    return "\n".join(lines[:bi + 1] + block + lines[ei:]) + ("\n" if text.endswith("\n") else "")


def yaml_scalar(value):
    """生成安全的 YAML 单引号标量（单引号需双写转义）。"""
    return "'" + value.replace("'", "''") + "'"


def build_footer(theme_text, cfg, paras):
    # 不写缩进：由 replace_between 统一补上标记行自身的缩进（保持与同级键一致）
    block = "custom_text: " + yaml_scalar(footer_html(cfg, paras))
    return replace_between(theme_text, FOOTER_BEGIN, FOOTER_END, block)


def build_page(page_text, cfg, paras):
    block = PAGE_BEGIN + "\n\n" + page_block(cfg, paras) + "\n\n" + PAGE_END
    if PAGE_BEGIN in page_text and PAGE_END in page_text:
        return replace_between(page_text, PAGE_BEGIN, PAGE_END, "\n" + page_block(cfg, paras) + "\n")
    # 首次生成：保留原 front-matter，把标记块插到正文位置
    return page_text.rstrip("\n") + "\n\n" + block + "\n"


def main():
    check = "--check" in sys.argv[1:]
    cfg, paras = parse_source(SRC.read_text(encoding="utf-8"))
    if not paras:
        raise SystemExit("DISCLAIMER.md 里没有正文段落")

    theme_text = THEME_CFG.read_text(encoding="utf-8")
    if PAGE_MD.exists():
        page_text = PAGE_MD.read_text(encoding="utf-8")
    else:
        PAGE_MD.parent.mkdir(parents=True, exist_ok=True)
        page_text = PAGE_TEMPLATE.format(date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                         before=PAGE_BEGIN, after=PAGE_END)

    new_theme = build_footer(theme_text, cfg, paras)
    new_page = build_page(page_text, cfg, paras)

    targets = [
        ("_config.butterfly.yml（全站页脚）", THEME_CFG, theme_text, new_theme),
        ("source/disclaimer/index.md（完整声明页）", PAGE_MD, page_text, new_page),
    ]

    stale = []
    for label, path, old, new in targets:
        if old == new:
            print(f"  ✓ {label}")
        else:
            stale.append(label)
            if check:
                print(f"  ✗ {label} 与 DISCLAIMER.md 不一致")
            else:
                path.write_text(new, encoding="utf-8")
                print(f"  → 已更新 {label}")

    print()
    if check:
        if stale:
            print(f"{len(stale)} 处需要同步，请运行 python tools/sync-disclaimer.py")
            return 1
        print("两处均与 DISCLAIMER.md 一致 ✓")
        return 0

    print("同步完成，记得接着跑 npx hexo generate" if stale else "已是最新，无需改动")
    return 0


if __name__ == "__main__":
    sys.exit(main())
