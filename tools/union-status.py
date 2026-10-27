#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
京东联盟 · 待接链清单

用途：
  拿到 PID 之后，要逐个到联盟后台「领链接」再粘回 products.json。
  12 件商品来回翻很容易漏，这个脚本把「谁还没接、该搜什么词」直接列出来。

用法：
  python3 tools/union-status.py          # 看清单
  python3 tools/union-status.py --csv    # 导出 union-todo.csv（可用表格打开边做边勾）

判定规则：
  u.jd.com / union-click.jd.com / 3.cn  →  已接联盟链接（有佣金）
  search.jd.com / item.jd.com           →  普通直链（跳转能到，但下单不计佣）
  其他                                   →  待人工确认
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'source', '_data', 'mall-products.json')

UNION_HOSTS = ('u.jd.com', 'union-click.jd.com', '3.cn', 'item.m.jd.com')
PLAIN_HOSTS = ('search.jd.com', 'item.jd.com', 'so.m.jd.com')


def host_of(url):
    m = re.match(r'^https?://([^/?#]+)', url or '', re.I)
    return (m.group(1) if m else '').lower()


def classify(url):
    h = host_of(url)
    if any(h == x or h.endswith('.' + x) for x in UNION_HOSTS):
        return 'union'
    if any(h == x or h.endswith('.' + x) for x in PLAIN_HOSTS):
        return 'plain'
    if not h:
        return 'bad'
    return 'other'


def keyword_for(p):
    """从商品名推导联盟后台的搜索词：去掉空格/斜杠，保留品牌+型号。"""
    name = (p.get('name') or '').strip()
    name = re.sub(r'[（(].*?[)）]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def load():
    with open(DATA, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    as_csv = '--csv' in sys.argv
    data = load()
    products = data.get('products', [])
    union_cfg = data.get('union') or {}
    pid = (union_cfg.get('pid') or '').strip()

    rows = []
    for p in products:
        url = p.get('link', '')
        state = classify(url)
        rows.append({
            'id': p.get('id', ''),
            'name': p.get('name', ''),
            'cat': p.get('cat', ''),
            'price': p.get('price', ''),
            'sku': p.get('sku', ''),
            'keyword': keyword_for(p),
            'state': state,
            'link': url,
        })

    todo = [r for r in rows if r['state'] != 'union']
    done = [r for r in rows if r['state'] == 'union']

    if as_csv:
        out = os.path.join(ROOT, 'union-todo.csv')
        with open(out, 'w', encoding='utf-8-sig', newline='') as f:
            f.write('已完成,id,商品,分类,参考价,京东SKU,后台搜索词,当前链接\n')
            for r in rows:
                mark = '是' if r['state'] == 'union' else ''
                f.write('%s,%s,%s,%s,%s,%s,%s,%s\n' % (
                    mark, r['id'], r['name'], r['cat'], r['price'],
                    r['sku'], r['keyword'], r['link']))
        print('已导出 %s（%d 行，Excel/Numbers 直接打开）' % (out, len(rows)))
        return

    print('')
    print('京东联盟 · 推广位 PID 接链状态')
    print('  数据文件：source/_data/mall-products.json')
    print('  当前 PID：%s' % (pid or '（未填写）'))
    print('  已接联盟链接：%d / %d' % (len(done), len(rows)))
    print('')

    if todo:
        print('待处理（%d 件）：' % len(todo))
        print('  %-26s %-22s %-8s %s' % ('商品', '后台搜索词', '参考价', '当前状态'))
        print('  ' + '-' * 78)
        for r in todo:
            state_txt = {'plain': '普通直链·无佣', 'bad': '链接无效', 'other': '待确认'}[r['state']]
            print('  %-26s %-22s %-8s %s' % (
                r['name'][:24], r['keyword'][:20], '¥%s' % r['price'], state_txt))
        print('')
        print('  做法：联盟后台「商品推广」搜上面的搜索词 → 领链接（优先短链 u.jd.com）')
        print('        粘回该商品的 "link" 字段，然后 npm run validate:products 复查。')
    else:
        print('全部商品都已接联盟链接。')

    if done:
        print('')
        print('已完成（%d 件）：' % len(done))
        for r in done:
            print('  ✓ %s' % r['name'])

    if not pid:
        print('')
        print('提醒：顶层 union.pid 还没填。PID 到手后写进 products.json 的 union 段，')
        print('      校验脚本会顺带核对格式（联盟ID_网站ID_推广位ID，三段数字）。')
    print('')


if __name__ == '__main__':
    main()
