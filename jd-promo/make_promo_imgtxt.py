# -*- coding: utf-8 -*-
"""京东一分购 图文推广素材：竖版长图(1080x1920) + 方形朋友圈图(1080x1080)
二维码与商品图沿用原图裁剪素材，保证二维码不变。"""
from PIL import Image, ImageDraw, ImageFont
import math

QR = Image.open('qr.png')                      # 362x334 含白边
PH = [Image.open(f'p{i}.png') for i in (1, 2, 3, 4)]
OUT_STORY = 'jd_1fen_story.png'
OUT_SQUARE = 'jd_1fen_square.png'

BG_RED  = (247, 37, 84)
BG_DEEP = (232, 18, 66)
YELLOW  = (255, 228, 22)
CREAM   = (255, 248, 236)
TICKET  = (254, 235, 192)
TITLE_RED = (232, 38, 44)
PRICE_RED = (240, 30, 40)
FP = {'bd': r'C:\Windows\Fonts\msyhbd.ttc', 'hei': r'C:\Windows\Fonts\simhei.ttf',
      'num': r'C:\Windows\Fonts\arialbd.ttf', 'imp': r'C:\Windows\Fonts\impact.ttf'}


def sparkle(d, x, y, r, color, alpha=255):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.32
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d.polygon(pts, fill=color + (alpha,))


def ring(d, x, y, r, color, w, alpha=200):
    d.ellipse([x - r, y - r, x + r, y + r], outline=color + (alpha,), width=w)


def diamonds(img, dx, dy, a=55):
    d = ImageDraw.Draw(img, 'RGBA')
    for row in range(-1, img.height // (dy // 2) + 2):
        for col in range(-1, img.width // (dx // 2) + 2):
            cx = col * dx + (dx // 2 if row % 2 else 0)
            cy = row * (dy // 2)
            pts = [(cx, cy - dy // 2), (cx + dx // 2, cy), (cx, cy + dy // 2), (cx - dx // 2, cy)]
            shade = BG_DEEP if (row + col) % 2 == 0 else (252, 60, 100)
            d.polygon(pts, fill=shade + (a,))


# =====================================================================
# 竖版长图 1080x1920：原版版式等比放大 + 推广文案行
# =====================================================================
def render_story():
    FX, FY, FS = 1.25, 1.2, 1.22
    X = lambda v: int(round(v * FX))
    Y = lambda v: int(round(v * FY))
    Z = lambda v: max(9, int(round(v * FS)))
    F = lambda k, s: ImageFont.truetype(FP[k], Z(s))

    W, H = 1080, 1920
    img = Image.new('RGB', (W, H), BG_RED)
    diamonds(img, X(110), Y(110))
    d = ImageDraw.Draw(img, 'RGBA')

    # 装饰
    sparkle(d, X(120), Y(150), X(26), YELLOW)
    sparkle(d, X(760), Y(110), X(20), YELLOW)
    sparkle(d, X(812), Y(300), X(14), (255, 255, 255), 220)
    sparkle(d, X(58), Y(322), X(13), (255, 255, 255), 200)
    ring(d, X(96), Y(240), X(15), (255, 255, 255), 4)
    ring(d, X(790), Y(210), X(11), YELLOW, 4)
    ring(d, X(58), Y(620), X(10), (255, 255, 255), 3)
    ring(d, X(814), Y(642), X(12), YELLOW, 3)
    ring(d, X(50), Y(962), X(9), (255, 255, 255), 3)
    ring(d, X(820), Y(940), X(10), (255, 255, 255), 3)
    sparkle(d, X(68), Y(1182), X(14), YELLOW)
    sparkle(d, X(800), Y(1200), X(16), YELLOW)
    for cx, cy, r in [(X(800), Y(396), X(30)), (X(66), Y(432), X(24))]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 205, 66))
        d.ellipse([cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5], outline=(255, 232, 140), width=3)
        d.text((cx, cy), '1', font=F('bd', int(r * 0.95)), fill=(214, 120, 20), anchor='mm')

    # 标题
    d.text((X(432), Y(60)), '京东送您', font=F('bd', 118), fill=(255, 255, 255), anchor='ma')
    sparkle(d, X(700), Y(100), X(24), YELLOW)
    fa, fb = F('bd', 172), F('bd', 112)
    wa = d.textlength('1分', font=fa); wb = d.textlength('优惠购物', font=fb)
    x0 = (W - wa - wb) / 2
    base = Y(352)
    d.text((x0 + 5, base + 5), '1分', font=fa, fill=(196, 132, 0, 130), anchor='ls')
    d.text((x0, base), '1分', font=fa, fill=YELLOW, anchor='ls')
    d.text((x0 + wa + 8, base), '优惠购物', font=fb, fill=YELLOW, anchor='ls')
    d.text((X(432), Y(384)), '* 1分购仅京东新用户及365天未下单用户专享',
           font=F('bd', 27), fill=(255, 230, 235), anchor='ma')
    # 推广文案行（图中文字）
    d.text((X(432), Y(412)), '抽纸 / 鸡蛋 / 洗衣液 / 饮料 · 任选一样只要1分钱',
           font=F('bd', 30), fill=(255, 205, 60), anchor='ma')

    # 二维码卡
    qx, qy, qw, qh = X(212), Y(448), X(440), Y(448)
    d.rounded_rectangle([qx, qy, qx + qw, qy + qh], radius=Z(28), fill=(255, 255, 255))
    qr = QR.resize((Z(362), Z(334)), Image.LANCZOS)
    img.paste(qr, (qx + (qw - qr.width) // 2, qy + Y(22)))
    d.text((X(432), qy + qh - Y(30)), '打开京东app扫码', font=F('bd', 46),
           fill=(230, 30, 60), anchor='mb')

    # 优惠券横幅
    bx0, by0, bx1, by1 = X(48), Y(960), X(816), Y(1140)
    bw, bh = bx1 - bx0, by1 - by0
    ban = Image.new('RGB', (bw, bh)); bd = ImageDraw.Draw(ban)
    for x in range(bw):
        t = x / bw
        bd.line([(x, 0), (x, bh)], fill=(int(219 + 28 * t), int(67 - 56 * t), int(45 + 30 * t)))
    m = Image.new('L', (bw, bh), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, bw, bh], radius=Z(32), fill=255)
    img.paste(ban, (bx0, by0), m)
    d = ImageDraw.Draw(img, 'RGBA')
    cy0, cy1 = by0 + Y(14), by1 - Y(14)

    tx0, tx1 = bx0 + X(34), bx0 + X(292)
    d.rounded_rectangle([tx0, cy0, tx1, cy1], radius=Z(20), fill=TICKET)
    for ny in (cy0 + Y(26), cy1 - Y(26)):
        d.ellipse([tx0 - X(12), ny - Y(12), tx0 + X(12), ny + Y(12)], fill=BG_RED)
    f15 = F('num', 96); fw = d.textlength('15', font=f15)
    d.text((tx0 + X(28) + fw / 2, (cy0 + cy1) // 2 - Y(12)), '15', font=f15,
           fill=(228, 32, 44), anchor='mm')
    d.ellipse([tx0 + X(44) + fw, (cy0 + cy1) // 2 - Y(48), tx0 + X(114) + fw, (cy0 + cy1) // 2 + Y(22)],
              outline=(228, 32, 44), width=Z(4))
    d.text((tx0 + X(79) + fw, (cy0 + cy1) // 2 - Y(13)), '元', font=F('bd', 40),
           fill=(228, 32, 44), anchor='mm')
    d.rounded_rectangle([tx0 + X(30), cy1 - Y(62), tx1 - X(30), cy1 - Y(16)],
                        radius=Z(23), outline=(228, 32, 44), width=Z(3))
    d.text((tx0 + (tx1 - tx0) // 2, cy1 - Y(39)), '无门槛立减', font=F('bd', 30),
           fill=(228, 32, 44), anchor='mm')

    mx = bx0 + X(330)
    d.text((mx, by0 + Y(50)), '0.01元', font=F('bd', 76), fill=(255, 246, 205), anchor='la')
    d.text((mx + 4, by0 + Y(128)), '京东新用户专享', font=F('bd', 36), fill=(255, 226, 170), anchor='la')
    ccx, ccy, cr = X(726), (by0 + by1) // 2, X(66)
    d.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=(255, 216, 74))
    d.ellipse([ccx - cr + 8, ccy - cr + 8, ccx + cr - 8, ccy + cr - 8], outline=(255, 240, 170), width=4)
    d.text((ccx, ccy - Y(4)), '抢', font=F('bd', 72), fill=(226, 36, 30), anchor='mm')

    # 丝带（悬在票券上沿）
    rib = Image.new('RGBA', (150, 42), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rib)
    rd.rounded_rectangle([0, 4, 146, 38], radius=9, fill=(255, 215, 60))
    rd.text((73, 21), '京东专享', font=ImageFont.truetype(FP['hei'], 21), fill=(180, 40, 20), anchor='mm')
    rib = rib.rotate(12, expand=True, resample=Image.BICUBIC)
    img.paste(rib, (bx0 + X(14), by0 - Y(54)), rib)
    d = ImageDraw.Draw(img, 'RGBA')

    # 商品卡 2x2
    products = [('加厚原木餐巾纸', '10包【家庭装】'), ('农家散养土鸡蛋', '10 枚'),
                ('蓝月亮深层洁净洗衣液', '500g/瓶'), ('康师傅冰红茶饮料', '330ml*6瓶')]
    CW, CH = X(380), Y(176)
    for i, (t1, t2) in enumerate(products):
        cx0 = X(44 if i % 2 == 0 else 440); cy0 = Y(1140 if i < 2 else 1332)
        d.rounded_rectangle([cx0, cy0, cx0 + CW, cy0 + CH], radius=Z(22), fill=CREAM)
        fx0, fy0 = cx0 + X(10), cy0 + Y(11)
        fw2, fh2 = X(154), Y(154)
        d.rounded_rectangle([fx0, fy0, fx0 + fw2, fy0 + fh2], radius=Z(12), fill=(255, 222, 0))
        ph = PH[i].copy(); ph.thumbnail((fw2 - 10, fh2 - 10), Image.LANCZOS)
        img.paste(ph, (fx0 + (fw2 - ph.width) // 2, fy0 + (fh2 - ph.height) // 2))
        tx = cx0 + fw2 + X(18); tw = CW - fw2 - X(32)
        for txt, dy in ((t1, 20), (t2, 56)):
            s = 29
            while s > 17 and d.textlength(txt, font=F('bd', s)) > tw:
                s -= 1
            d.text((tx, cy0 + Y(dy)), txt, font=F('bd', s), fill=TITLE_RED, anchor='la')
        d.text((tx, cy0 + CH - Y(42)), '惊喜价', font=F('bd', 22), fill=(240, 90, 60), anchor='lm')
        d.text((tx + X(78), cy0 + CH - Y(46)), '¥0.01', font=F('num', 46), fill=PRICE_RED, anchor='lm')

    # 底部 CTA
    d.text((X(432), 1826), '微信长按识别二维码 · 打开京东APP立抢',
           font=F('bd', 38), fill=(255, 255, 255), anchor='ma')
    d.text((X(432), 1892), '1分购仅限京东新用户及365天未下单用户，以活动页面为准',
           font=F('bd', 20), fill=(255, 200, 210), anchor='ma')
    img.save(OUT_STORY)
    print('saved', OUT_STORY, img.size)


# =====================================================================
# 方形朋友圈图 1080x1080：大字报式图文
# =====================================================================
def render_square():
    W = H = 1080
    img = Image.new('RGB', (W, H), BG_RED)
    diamonds(img, 137, 137)
    d = ImageDraw.Draw(img, 'RGBA')
    FB = lambda s: ImageFont.truetype(FP['bd'], s)
    FN = lambda s: ImageFont.truetype(FP['num'], s)

    sparkle(d, 130, 200, 30, YELLOW)
    sparkle(d, 950, 160, 24, YELLOW)
    sparkle(d, 1000, 430, 16, (255, 255, 255), 210)
    sparkle(d, 78, 470, 15, (255, 255, 255), 200)
    ring(d, 962, 690, 13, YELLOW, 4)
    ring(d, 118, 730, 11, (255, 255, 255), 3)
    ring(d, 60, 960, 10, (255, 255, 255), 3)
    sparkle(d, 1010, 950, 16, YELLOW)

    # 顶部标签
    tag = '京东官方活动 · 新人首单专享'
    ft = FB(36)
    tw = d.textlength(tag, font=ft)
    d.rounded_rectangle([540 - tw / 2 - 34, 52, 540 + tw / 2 + 34, 132], radius=40,
                        fill=(255, 255, 255, 38), outline=(255, 228, 22), width=3)
    d.text((540, 92), tag, font=ft, fill=(255, 246, 205), anchor='mm')

    # 主标题
    d.text((540, 210), '1分钱', font=FB(150), fill=YELLOW, anchor='ma')
    d.text((540, 396), '京东好物送到家', font=FB(94), fill=(255, 255, 255), anchor='ma')
    d.text((540, 520), '新人专享 15元无门槛立减 · 全国包邮', font=FB(42),
           fill=(255, 226, 170), anchor='ma')
    sparkle(d, 880, 250, 26, YELLOW)

    # 二维码卡（左）
    qx, qy, qw, qh = 76, 580, 400, 396
    d.rounded_rectangle([qx, qy, qx + qw, qy + qh], radius=30, fill=(255, 255, 255))
    qr = QR.resize((330, 304), Image.LANCZOS)
    img.paste(qr, (qx + (qw - qr.width) // 2, qy + 22))
    d.text((qx + qw / 2, qy + qh - 14), '打开京东APP扫码', font=FB(38),
           fill=(230, 30, 60), anchor='mb')

    # 商品缩略图（右 2x2）
    labels = ['纸巾10包', '鸡蛋10枚', '洗衣液500g', '冰红茶6瓶']
    for i in range(4):
        cx0 = 516 + (i % 2) * 268
        cy0 = 580 + (i // 2) * 204
        d.rounded_rectangle([cx0, cy0, cx0 + 252, cy0 + 188], radius=20, fill=CREAM)
        ph = PH[i].copy()
        ph.thumbnail((232, 124), Image.LANCZOS)
        img.paste(ph, (cx0 + (252 - ph.width) // 2, cy0 + 8))
        d.text((cx0 + 14, cy0 + 164), labels[i], font=FB(23), fill=TITLE_RED, anchor='lm')
        d.rounded_rectangle([cx0 + 148, cy0 + 142, cx0 + 244, cy0 + 182], radius=20, fill=PRICE_RED)
        d.text((cx0 + 196, cy0 + 162), '¥0.01', font=FN(28), fill=(255, 255, 255), anchor='mm')

    # 底部 CTA
    d.text((540, 1006), '微信长按识别二维码 → 打开京东APP立抢', font=FB(42),
           fill=(255, 255, 255), anchor='ma')
    d.text((540, 1054), '1分购仅限京东新用户及365天未下单用户，以活动页面为准',
           font=FB(20), fill=(255, 200, 210), anchor='ma')
    img.save(OUT_SQUARE)
    print('saved', OUT_SQUARE, img.size)


render_story()
render_square()
