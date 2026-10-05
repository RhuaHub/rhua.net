# -*- coding: utf-8 -*-
"""京东一分购推广海报生成：复刻原版布局，二维码与商品图取自原图"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import os

# 海报原图不在仓库内：可用环境变量 RHUA_POSTER_SRC 指定，默认取本机剪贴板缓存
SRC = os.environ.get(
    'RHUA_POSTER_SRC',
    r'C:\Users\parit\.workbuddy\clipboard-images\clipboard-2026-10-03T07-06-24-216Z-e07ff126.jpg',
)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jd_1fen_poster.png')

if not os.path.exists(SRC):
    raise SystemExit('找不到海报原图：%s\n请设置环境变量 RHUA_POSTER_SRC 指向原图后再运行。' % SRC)
W, H = 864, 1600

# ---------- 颜色 ----------
BG_RED    = (247, 37, 84)
BG_DEEP   = (232, 18, 66)     # 菱形暗纹
YELLOW    = (255, 228, 22)
CREAM     = (255, 248, 236)
TICKET    = (254, 235, 192)
TITLE_RED = (232, 38, 44)
PRICE_RED = (240, 30, 40)

F_PATH = {
    'bd':  r'C:\Windows\Fonts\msyhbd.ttc',
    'hei': r'C:\Windows\Fonts\simhei.ttf',
    'num': r'C:\Windows\Fonts\arialbd.ttf',
}
def F(kind, size):
    return ImageFont.truetype(F_PATH[kind], size)

src = Image.open(SRC)
qr_img = src.crop((250, 596, 612, 930))       # 二维码（含白边）362x334
photos = [src.crop(b) for b in [
    (96, 1262, 244, 1418), (440, 1262, 588, 1418),
    (96, 1444, 244, 1596), (440, 1444, 588, 1596)]]

img = Image.new('RGB', (W, H), BG_RED)
d = ImageDraw.Draw(img, 'RGBA')

# ---------- 背景：菱形暗纹 ----------
dia = 110
for row in range(-1, H // (dia // 2) + 2):
    for col in range(-1, W // (dia // 2) + 2):
        cx = col * dia + (dia // 2 if row % 2 else 0)
        cy = row * (dia // 2)
        pts = [(cx, cy - dia // 2), (cx + dia // 2, cy), (cx, cy + dia // 2), (cx - dia // 2, cy)]
        shade = BG_DEEP if (row + col) % 2 == 0 else (252, 60, 100)
        d.polygon(pts, fill=shade + (55,))

# ---------- 装饰元素 ----------
def sparkle(x, y, r, color, alpha=255):
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.32
        pts.append((x + rr * math.cos(ang), y + rr * math.sin(ang)))
    d.polygon(pts, fill=color + (alpha,))

def ring(x, y, r, color, width):
    d.ellipse([x - r, y - r, x + r, y + r], outline=color + (200,), width=width)

sparkle(120, 150, 26, YELLOW)
sparkle(760, 110, 20, YELLOW)
sparkle(810, 300, 14, (255, 255, 255), 220)
sparkle(60, 320, 13, (255, 255, 255), 200)
ring(96, 240, 15, (255, 255, 255), 4)
ring(790, 210, 11, YELLOW, 4)
ring(60, 620, 10, (255, 255, 255), 3)
ring(812, 640, 12, YELLOW, 3)
ring(52, 960, 9, (255, 255, 255), 3)
ring(818, 940, 10, (255, 255, 255), 3)
sparkle(70, 1180, 14, YELLOW)
sparkle(800, 1200, 16, YELLOW)
# 金币
for cx, cy, r in [(800, 395, 30), (66, 430, 24)]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 205, 66))
    d.ellipse([cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5], outline=(255, 232, 140), width=3)
    f = F('bd', int(r * 0.9))
    d.text((cx, cy), '1', font=f, fill=(214, 120, 20), anchor='mm')

# ---------- 标题 ----------
f1 = F('bd', 118)
d.text((432, 60), '京东送您', font=f1, fill=(255, 255, 255), anchor='ma')
sparkle(700, 100, 24, YELLOW)

# "1分优惠购物" 基线对齐
fa = F('bd', 172)   # 1分
fb = F('bd', 112)   # 优惠购物
wa = d.textlength('1分', font=fa)
wb = d.textlength('优惠购物', font=fb)
x0 = (W - wa - wb) / 2
base = 352
d.text((x0, base), '1分', font=fa, fill=YELLOW, anchor='ls')
d.text((x0 + wa + 6, base), '优惠购物', font=fb, fill=YELLOW, anchor='ls')
# 1分 描边效果
d.text((x0 + 4, base + 4), '1分', font=fa, fill=(200, 140, 0, 120), anchor='ls')

f_sub = F('bd', 27)
d.text((432, 382), '* 1分购仅京东新用户及365天未下单用户专享', font=f_sub, fill=(255, 230, 235), anchor='ma')

# ---------- 二维码卡片 ----------
qx, qy, qw, qh = 212, 428, 440, 468
d.rounded_rectangle([qx, qy, qx + qw, qy + qh], radius=28, fill=(255, 255, 255))
# 卡片内二维码（保持原比例居中）
qw2, qh2 = qr_img.size
img.paste(qr_img, (qx + (qw - qw2) // 2, qy + 22))
f_scan = F('bd', 46)
d.text((432, qy + qh - 42), '打开京东app扫码', font=f_scan, fill=(230, 30, 60), anchor='mb')

# ---------- 优惠券横幅 ----------
bx0, by0, bx1, by1 = 48, 948, 816, 1128
banner = Image.new('RGB', (bx1 - bx0, by1 - by0))
bd2 = ImageDraw.Draw(banner)
gw = bx1 - bx0
for x in range(gw):
    t = x / gw
    r = int(219 + (247 - 219) * t); g = int(67 + (11 - 67) * t); b = int(45 + (75 - 45) * t)
    bd2.line([(x, 0), (x, by1 - by0)], fill=(r, g, b))
mask = Image.new('L', banner.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, gw, by1 - by0], radius=32, fill=255)
img.paste(banner, (bx0, by0), mask)
# 顶部高光
hl = Image.new('RGBA', banner.size, (0, 0, 0, 0))
ImageDraw.Draw(hl).rounded_rectangle([6, 6, gw - 6, (by1 - by0) // 2], radius=26, fill=(255, 255, 255, 36))
img.paste(Image.alpha_composite(banner.convert('RGBA'), hl).convert('RGB'), (bx0, by0),
          Image.new('L', banner.size, 0))  # 占位，避免复杂度
img.paste(banner, (bx0, by0), mask)
d = ImageDraw.Draw(img, 'RGBA')

cy0, cy1 = by0 + 14, by1 - 14
# 奶油票券（15元 无门槛立减）
tx0, tx1 = bx0 + 34, bx0 + 292
d.rounded_rectangle([tx0, cy0, tx1, cy1], radius=20, fill=TICKET)
for ny in (cy0 + 26, cy1 - 26):   # 左侧打孔
    d.ellipse([tx0 - 12, ny - 12, tx0 + 12, ny + 12], fill=BG_RED)
f15 = F('num', 96)
x15 = tx0 + 28 + d.textlength('15', font=f15) / 2
d.text((x15, (cy0 + cy1) // 2 - 12), '15', font=f15, fill=(228, 32, 44), anchor='mm')
fw15 = d.textlength('15', font=f15)
d.ellipse([tx0 + 44 + fw15, (cy0 + cy1) // 2 - 48, tx0 + 114 + fw15, (cy0 + cy1) // 2 + 22],
          outline=(228, 32, 44), width=4)
d.text((tx0 + 79 + fw15, (cy0 + cy1) // 2 - 13), '元', font=F('bd', 40), fill=(228, 32, 44), anchor='mm')
d.rounded_rectangle([tx0 + 30, cy1 - 62, tx1 - 30, cy1 - 16], radius=23, outline=(228, 32, 44), width=3)
d.text((tx0 + (tx1 - tx0) // 2, cy1 - 39), '无门槛立减', font=F('bd', 30), fill=(228, 32, 44), anchor='mm')

# 中间 0.01元
mx = bx0 + 330
d.text((mx, by0 + 52), '0.01元', font=F('bd', 76), fill=(255, 246, 205), anchor='la')
d.text((mx + 4, by0 + 128), '京东新用户专享', font=F('bd', 36), fill=(255, 226, 170), anchor='la')

# 右侧 抢 金币
ccx, ccy, cr = 726, (by0 + by1) // 2, 66
d.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=(255, 216, 74))
d.ellipse([ccx - cr + 8, ccy - cr + 8, ccx + cr - 8, ccy + cr - 8], outline=(255, 240, 170), width=4)
d.text((ccx, ccy - 4), '抢', font=F('bd', 72), fill=(226, 36, 30), anchor='mm')

# 左上角丝带（最后画，悬在票券上沿）
rib = Image.new('RGBA', (150, 42), (0, 0, 0, 0))
rd = ImageDraw.Draw(rib)
rd.rounded_rectangle([0, 4, 146, 38], radius=9, fill=(255, 215, 60))
rd.text((73, 21), '京东专享', font=F('hei', 21), fill=(180, 40, 20), anchor='mm')
rib = rib.rotate(12, expand=True, resample=Image.BICUBIC)
img.paste(rib, (bx0 + 14, by0 - 54), rib)
d = ImageDraw.Draw(img, 'RGBA')

# ---------- 商品卡（2x2） ----------
products = [
    ('加厚原木餐巾纸', '10包【家庭装】'),
    ('农家散养土鸡蛋', '10 枚'),
    ('蓝月亮深层洁净洗衣液', '500g/瓶'),
    ('康师傅冰红茶饮料', '330ml*6瓶'),
]
CW, CH = 380, 176
cols = [44, 440]
rows = [1168, 1360]

def fit_font(text, kind, size_max, size_min, max_w):
    for s in range(size_max, size_min - 1, -1):
        if d.textlength(text, font=F(kind, s)) <= max_w:
            return F(kind, s)
    return F(kind, size_min)

for i, (t1, t2) in enumerate(products):
    cx0 = cols[i % 2]; cy0 = rows[i // 2]
    d.rounded_rectangle([cx0, cy0, cx0 + CW, cy0 + CH], radius=22, fill=CREAM)
    # 黄框 + 照片
    fx0, fy0 = cx0 + 10, cy0 + 11
    fw, fh = 154, 154
    d.rounded_rectangle([fx0, fy0, fx0 + fw, fy0 + fh], radius=12, fill=(255, 222, 0))
    ph = photos[i].copy()
    ph.thumbnail((fw - 10, fh - 10), Image.LANCZOS)
    img.paste(ph, (fx0 + (fw - ph.width) // 2, fy0 + (fh - ph.height) // 2))
    tx = cx0 + fw + 18
    tw = CW - fw - 32
    d.text((tx, cy0 + 20), t1, font=fit_font(t1, 'bd', 29, 18, tw), fill=TITLE_RED, anchor='la')
    d.text((tx, cy0 + 56), t2, font=fit_font(t2, 'bd', 29, 18, tw), fill=TITLE_RED, anchor='la')
    d.text((tx, cy0 + CH - 42), '惊喜价', font=F('bd', 22), fill=(240, 90, 60), anchor='lm')
    d.text((tx + 78, cy0 + CH - 46), '¥0.01', font=F('num', 46), fill=PRICE_RED, anchor='lm')

# ---------- 底部 CTA ----------
d.rounded_rectangle([200, 1552, 664, 1560], radius=4, fill=(255, 255, 255, 90))
d.text((432, 1576), '微信长按识别二维码 · 打开京东APP立抢', font=F('bd', 38), fill=(255, 255, 255), anchor='mb')

img.save(OUT, quality=95)
print('saved', OUT, img.size)
