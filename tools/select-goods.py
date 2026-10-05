#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
联盟选品脚本 —— 把联盟后台导出的商品表，筛成 rhua.net 的 goods.yml

为什么需要它：
  联盟后台导出的表动辄几百上千行，人工挑商品又慢又容易漏高佣爆款。
  这个脚本按「佣金率 + 月销 + 评分」三个硬指标筛一遍，只留下值得推的，
  直接写成 source/_data/goods.yml，页面上的商品卡就自动更新了。

用法：
  # 1. 在京东联盟 / 多多进宝 / 淘宝联盟后台导出商品表为 CSV
  # 2. 跑脚本（默认输出到 source/_data/goods.yml）
  python tools/select-goods.py 导出的商品表.csv --group "京东好物"

  # 只看筛选结果，不写文件
  python tools/select-goods.py 商品表.csv --dry-run

  # 自定义阈值（佣金率 %、月销、评分）
  python tools/select-goods.py 商品表.csv --min-commission 20 --min-sales 2000 --min-rating 4.9

  # 追加到已有 goods.yml 的某个分组，而不是整组覆盖
  python tools/select-goods.py 商品表.csv --group "京东好物" --merge

阈值参考（行业惯例，来自平台侧公开规则）：
  日用快消：佣金率 10%~20% 属正常，≥15% 值得主推
  服饰美妆：15%~30%
  家电 3C：3%~8%，靠客单价赚钱，别用同一个阈值去卡

佣金列的写法兼容三种：
  '20%'  → 20%
  '20'   → 20%
  '0.2'  → 20%（联盟开放平台导出的多是小数形式）
"""
import argparse
import csv
import io
import os
import re
import sys
from datetime import date

try:
    import yaml
except ImportError:
    print("需要 pyyaml：pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, 'source', '_data', 'goods.yml')

# 列名别名：联盟后台的列名各平台不一样，这里做一层归一化
ALIASES = {
    'name':      ['商品名称', '商品名', '名称', '商品标题', 'title', 'name', '商品'],
    'price':     ['价格', '售价', '券后价', '到手价', 'price', '促销价'],
    'price_from': ['原价', '划线价', '市场价', 'price_from', 'orig_price'],
    'commission': ['佣金比例', '佣金率', '佣金', 'commission', 'commission_rate'],
    'sales':     ['月销', '30天销量', '销量', '月销量', 'sales', 'volume'],
    'rating':    ['评分', '好评率', 'rating', 'score', '商品评分'],
    'url':       ['链接', '推广链接', '商品链接', 'url', 'link', '短链'],
    'img':       ['图片', '主图', '图片链接', 'img', 'image', '主图链接'],
    'platform':  ['平台', 'platform', '来源'],
    'shop':      ['店铺', '店铺名称', 'shop'],
}


def pick(row, key):
    for alias in ALIASES[key]:
        for col in row:
            if col and col.strip().lower() == alias.lower():
                v = (row[col] or '').strip()
                if v:
                    return v
    # 退一步：模糊包含匹配
    for alias in ALIASES[key]:
        for col in row:
            if col and alias.lower() in col.strip().lower():
                v = (row[col] or '').strip()
                if v:
                    return v
    return ''


def num(s, default=0.0):
    if not s:
        return default
    m = re.search(r'-?\d+(?:\.\d+)?', str(s).replace(',', ''))
    return float(m.group()) if m else default


def commission_pct(raw, price=0.0):
    """佣金归一化为百分比数字：'20%' / '20' / '0.2' / '3.5元'"""
    if not raw:
        return 0.0
    s = str(raw).strip()
    if '元' in s and '%' not in s:
        amt = num(s)
        return round(amt / price * 100, 1) if price else 0.0
    v = num(s)
    if '%' in s:
        return v
    return round(v * 100 if v <= 1 else v, 1)


def read_rows(path):
    raw = open(path, 'r', encoding='utf-8-sig', errors='replace').read()
    sample = raw[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',\t;')
    except csv.Error:
        dialect = csv.excel
    return list(csv.DictReader(io.StringIO(raw), dialect=dialect))


def main():
    ap = argparse.ArgumentParser(description='联盟商品表 → 站点商品卡数据')
    ap.add_argument('csv', help='联盟后台导出的商品表（CSV/TSV）')
    ap.add_argument('--group', default='好物清单', help='写入的分组名（默认：好物清单）')
    ap.add_argument('--note', default='', help='分组说明，会显示在分组标题下')
    ap.add_argument('--min-commission', type=float, default=15.0, help='最低佣金率 %（默认 15）')
    ap.add_argument('--min-sales', type=float, default=500, help='最低月销（默认 500）')
    ap.add_argument('--min-rating', type=float, default=4.7, help='最低评分（默认 4.7）')
    ap.add_argument('--limit', type=int, default=20, help='最多输出几件（默认 20）')
    ap.add_argument('--out', default=DEFAULT_OUT, help='输出 goods.yml 路径')
    ap.add_argument('--merge', action='store_true', help='合并进已有分组（按商品名去重）')
    ap.add_argument('--dry-run', action='store_true', help='只打印结果，不写文件')
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        print(f'找不到文件：{args.csv}', file=sys.stderr)
        return 1

    rows = read_rows(args.csv)
    print(f'读入 {len(rows)} 行')

    kept, dropped = [], {'no_name': 0, 'commission': 0, 'sales': 0, 'rating': 0}
    for row in rows:
        name = pick(row, 'name')
        if not name:
            dropped['no_name'] += 1
            continue
        price = num(pick(row, 'price'))
        comm = commission_pct(pick(row, 'commission'), price)
        sales = num(pick(row, 'sales'))
        rating = num(pick(row, 'rating'), 5.0)
        if rating > 5:            # 好评率 98% 这类，换算成 5 分制
            rating = round(rating / 20, 1)
        if comm < args.min_commission:
            dropped['commission'] += 1
            continue
        if sales < args.min_sales:
            dropped['sales'] += 1
            continue
        if rating < args.min_rating:
            dropped['rating'] += 1
            continue
        kept.append({
            'name': name,
            'img': pick(row, 'img'),
            'platform': pick(row, 'platform') or '京东',
            'price': ('%.2f' % price).rstrip('0').rstrip('.') if price else '',
            'price_from': ('%.2f' % num(pick(row, 'price_from'))).rstrip('0').rstrip('.')
                          if pick(row, 'price_from') else '',
            'url': pick(row, 'url'),
            'commission': f'{comm:g}%',
            'updated': date.today().isoformat(),
            'note': '',
            'tags': [],
            '_sales': sales,
        })

    # 排序：佣金率优先，月销做次级排序（避免只看高佣、结果根本卖不动）
    kept.sort(key=lambda i: (float(i['commission'].rstrip('%')), min(i['_sales'], 10000)), reverse=True)
    kept = kept[:args.limit]
    for it in kept:
        it.pop('_sales', None)

    print(f'筛掉：无名称 {dropped["no_name"]} · 佣金不达标 {dropped["commission"]} · '
          f'月销不达标 {dropped["sales"]} · 评分不达标 {dropped["rating"]}')
    print(f'入选 {len(kept)} 件（阈值：佣金≥{args.min_commission:g}% 月销≥{args.min_sales:g} 评分≥{args.min_rating:g}）')
    for i, it in enumerate(kept, 1):
        print(f'  {i:>2}. [{it["commission"]:>5}] ¥{it["price"]:<7} {it["name"][:34]}')

    if args.dry_run or not kept:
        if not kept:
            print('没有商品入选，放宽阈值再试。')
        return 0

    group = {'name': args.group, 'note': args.note, 'items': kept}
    data = {'groups': []}
    if args.merge and os.path.exists(args.out):
        data = yaml.safe_load(open(args.out, encoding='utf-8')) or {'groups': []}
        for g in data.get('groups', []):
            if g.get('name') == args.group:
                old = {i['name']: i for i in g.get('items', [])}
                for it in kept:
                    old[it['name']] = it          # 新数据覆盖同名商品
                g['items'] = list(old.values())
                g['note'] = args.note or g.get('note', '')
                group = None
                break
    if group is not None:
        data.setdefault('groups', []).insert(0, group)

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write('# 由 tools/select-goods.py 生成 / 更新\n')
        f.write('# url 字段请确认是「你自己的」联盟推广链接，note 字段建议手写缺点\n')
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False, width=1000)
    print(f'已写入 {args.out}')
    print('提醒：note（缺点）和 url（自己的推广链接）还需要人工过一遍，别直接上线。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
