(function () {
  var GOODS = [
    { id: 'bare', name: '准系统 8G+0', desc: '无内存 / 无硬盘', price: 1319 },
    { id: 'c256', name: '8G + 256G', desc: '8G 内存 + 256G 硬盘', price: 1969 },
    { id: 'c512', name: '8G + 512G', desc: '8G 内存 + 512G 硬盘', price: 2249 },
    { id: 'c1t', name: '8G + 1TB', desc: '8G 内存 + 1TB 硬盘', price: 2529 },
    { id: 'm256', name: '16G + 256G', desc: '16G 内存 + 256G 硬盘', price: 2119 },
    { id: 'm512', name: '16G + 512G', desc: '16G 内存 + 512G 硬盘', price: 2329 },
    { id: 'm1t', name: '16G + 1TB', desc: '16G 内存 + 1TB 硬盘', price: 2729 },
    { id: 'm2t', name: '16G + 2TB', desc: '16G 内存 + 2TB 硬盘', price: 3249 }
  ];

  var KEY = 'n100_cart_v1';
  var QRMAP = { 'bare': '/img/product/n100-mini-pc.jpg' };
  var root = document.getElementById('n100-shop');
  if (!root) return;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function yuan(n) { return '¥' + Number(n).toLocaleString('zh-CN'); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function find(id) {
    for (var i = 0; i < GOODS.length; i++) if (GOODS[i].id === id) return GOODS[i];
    return null;
  }

  var cart = load();
  var orderNo = '';

  function totalQty() {
    var n = 0;
    for (var k in cart) if (cart.hasOwnProperty(k)) n += cart[k];
    return n;
  }
  function totalPrice() {
    var s = 0;
    for (var k in cart) if (cart.hasOwnProperty(k)) {
      var g = find(k);
      if (g) s += g.price * cart[k];
    }
    return s;
  }

  function render() {
    var cards = GOODS.map(function (g) {
      return '<div class="np-card">' +
        '<div class="np-card-name">' + esc(g.name) + '</div>' +
        '<div class="np-card-desc">' + esc(g.desc) + '</div>' +
        '<div class="np-card-foot">' +
          '<span class="np-price">' + yuan(g.price) + '</span>' +
          '<button class="np-add" data-add="' + g.id + '">加入购物车</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var items = Object.keys(cart).map(function (k) {
      var g = find(k);
      if (!g || !cart[k]) return '';
      return '<div class="np-item">' +
        '<div class="np-item-main">' +
          '<div class="np-item-name">' + esc(g.name) + '</div>' +
          '<div class="np-item-price">' + yuan(g.price) + '</div>' +
        '</div>' +
        '<div class="np-item-ops">' +
          '<div class="np-stepper">' +
            '<button data-minus="' + k + '" aria-label="减少">−</button>' +
            '<span>' + cart[k] + '</span>' +
            '<button data-plus="' + k + '" aria-label="增加">+</button>' +
          '</div>' +
          '<button class="np-del" data-del="' + k + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
    if (!items) items = '<div class="np-empty">购物车还是空的，选一个配置吧</div>';

    root.innerHTML =
      '<div class="np-wrap">' +
        '<div class="np-head">' +
          '<img class="np-hero-img" src="/img/product/n100-mini-pc.jpg" alt="N100 迷你主机">' +
          '<div class="np-hero-text">' +
            '<h1 class="np-title">N100 迷你主机</h1>' +
            '<p class="np-sub">BSLAY MINIPC-12 · 赛扬 N100 · 8 档配置可选</p>' +
            '<div class="np-from">售价 <strong>' + yuan(GOODS[0].price) + '</strong> 起</div>' +
            '<button class="np-primary" data-open="cart">去购物车 <span class="np-count" id="np-count">' + totalQty() + '</span></button>' +
          '</div>' +
        '</div>' +
        '<h2 class="np-section-title">选择配置</h2>' +
        '<div class="np-grid">' + cards + '</div>' +
        '<div class="np-tip">价格含税，默认发顺丰。下单后请通过微信付款，付款后把订单号发给卖家确认发货。</div>' +
      '</div>' +

      '<div class="np-mask" id="np-mask" data-close="1"></div>' +

      '<aside class="np-drawer" id="np-drawer" aria-label="购物车">' +
        '<div class="np-drawer-head">' +
          '<span>购物车</span>' +
          '<button class="np-x" data-close="1">×</button>' +
        '</div>' +
        '<div class="np-drawer-body">' + items + '</div>' +
        '<div class="np-drawer-foot">' +
          '<div class="np-total"><span>合计</span><strong>' + yuan(totalPrice()) + '</strong></div>' +
          '<button class="np-primary np-checkout" data-open="pay" ' + (totalQty() ? '' : 'disabled') + '>去结算 · 微信支付</button>' +
          '<button class="np-clear" data-clear="1">清空购物车</button>' +
        '</div>' +
      '</aside>' +

      '<div class="np-modal" id="np-modal" role="dialog" aria-modal="true" aria-label="微信支付">' +
        '<div class="np-modal-inner">' +
          '<button class="np-x np-modal-x" data-close="1">×</button>' +
          '<h3>微信支付</h3>' +
          '<div class="np-pay-amount">' + yuan(totalPrice()) + '</div>' +
          '<div class="np-qr"><img src="/img/wechat-pay-qr.svg" alt="微信收款码"></div>' +
          '<p class="np-pay-hint">请用微信扫一扫付款</p>' +
          '<div class="np-order"><span>订单号</span><code id="np-order-no">' + esc(orderNo) + '</code>' +
            '<button data-copy="1" id="np-copy">复制</button></div>' +
          '<p class="np-pay-note">付款后请把订单号发给卖家，确认后发货。</p>' +
        '</div>' +
      '</div>';
  }

  function open(which) {
    document.getElementById('np-mask').classList.add('on');
    if (which === 'cart') document.getElementById('np-drawer').classList.add('on');
    if (which === 'pay') {
      if (!orderNo) {
        orderNo = 'NS' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 900 + 100);
      }
      document.getElementById('np-modal').classList.add('on');
    }
  }
  function closeAll() {
    document.getElementById('np-mask').classList.remove('on');
    document.getElementById('np-drawer').classList.remove('on');
    document.getElementById('np-modal').classList.remove('on');
  }

  root.addEventListener('click', function (e) {
    var t = e.target;
    var add = t.getAttribute('data-add');
    if (add) {
      cart[add] = (cart[add] || 0) + 1;
      save(); render(); open('cart'); return;
    }
    var minus = t.getAttribute('data-minus');
    if (minus) {
      cart[minus] = (cart[minus] || 0) - 1;
      if (cart[minus] <= 0) delete cart[minus];
      orderNo = ''; save(); render(); return;
    }
    var plus = t.getAttribute('data-plus');
    if (plus) {
      cart[plus] = (cart[plus] || 0) + 1;
      orderNo = ''; save(); render(); return;
    }
    var del = t.getAttribute('data-del');
    if (del) {
      delete cart[del]; orderNo = ''; save(); render(); return;
    }
    if (t.getAttribute('data-clear')) {
      cart = {}; orderNo = ''; save(); render(); return;
    }
    var op = t.getAttribute('data-open');
    if (op) { open(op); return; }
    if (t.getAttribute('data-close')) { closeAll(); return; }
    if (t.getAttribute('data-copy')) {
      var code = document.getElementById('np-order-no');
      if (code && navigator.clipboard) {
        navigator.clipboard.writeText(code.textContent).then(function () {
          t.textContent = '已复制';
          setTimeout(function () { t.textContent = '复制'; }, 1800);
        });
      }
      return;
    }
  });

  render();
})();
