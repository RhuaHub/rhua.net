/**
 * 商城商品数据校验（构建期守卫）
 *
 * 为什么需要：
 *   /mall/ 的商品全在 source/mall/products.json 里手写，一旦少个逗号、字段拼错、
 *   或者 article 指向的文章 URL 改过名，mall.js 会静默渲染出空列表或死链——
 *   页面上看不出来，只有访客点不动才发现。这个脚本把这类错误提前到构建阶段，
 *   有错就让构建失败，坏数据永远上不了线。
 *
 * 检查内容：
 *   1. JSON 语法（报错带行列位置）
 *   2. 顶层字段：updated / note / products / cats
 *   3. 每个商品的必填字段、类型、id 格式与唯一性、cat 是否在 cats 内、未知字段（防拼错）
 *   4. article 指向的文章是否真实存在（构建后按实际生成的路由校验）
 *   5. 价格核对时效：updated 距今超过 30 天提醒该重新核价
 *
 * 用法：
 *   - 自动：hexo generate 时由本文件注册的 filter 触发，失败即中断构建
 *   - 手动：node scripts/validate-products.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var DATA_FILE = path.join(ROOT, 'source/mall/products.json');
var POSTS_DIR = path.join(ROOT, 'source/_posts');
var PUBLIC_DIR = path.join(ROOT, 'public');

var ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var REQUIRED = ['id', 'cat', 'name', 'spec', 'price', 'reason', 'article', 'link'];
var OPTIONAL = ['tag'];
var STALE_DAYS = 30;

/* ---------- 工具 ---------- */

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// 从 JSON 解析错误里提取位置，转换成行列号，方便定位
function describeJsonError(err, raw) {
  var msg = String(err && err.message ? err.message : err);
  var m = /position\s+(\d+)/i.exec(msg);
  if (!m) return msg;
  var pos = parseInt(m[1], 10);
  var before = raw.slice(0, pos);
  var line = before.split('\n').length;
  var col = pos - before.lastIndexOf('\n');
  var lines = raw.split('\n');

  function truncate(s) {
    s = String(s).trim();
    return s.length > 70 ? s.slice(0, 70) + '…' : s;
  }

  var out = msg + '\n      报错位置：第 ' + line + ' 行第 ' + col + ' 列 → ' + truncate(lines[line - 1]);

  // 少逗号是最常见的手误，但解析器会在「下一行」才报错，导致提示位置误导。
  // 这里往上找最近的非空行，若它不以 , { [ 收尾，基本就是漏了逗号。
  if (/Expected ',' or/i.test(msg)) {
    var i = line - 2;
    while (i >= 0 && !String(lines[i] || '').trim()) i--;
    var prev = String(lines[i] || '').trim();
    if (prev && !/[,{[]$/.test(prev)) {
      out += '\n      ↳ 很可能是第 ' + (i + 1) + ' 行末尾漏了一个逗号：' + truncate(prev);
    }
  }
  return out;
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/* ---------- 读取文章真实 URL ---------- */

// 解析 front-matter 里能影响 URL 的字段（date / permalink / published）
function readPostMeta(file) {
  var raw = fs.readFileSync(file, 'utf8');
  var meta = { file: file };
  var fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (fm) {
    var block = fm[1];
    var dateM = /^date:\s*(.+)$/m.exec(block);
    if (dateM) meta.date = dateM[1].trim().replace(/^['"]|['"]$/g, '');
    var pm = /^permalink:\s*(.+)$/m.exec(block);
    if (pm) meta.permalink = pm[1].trim().replace(/^['"]|['"]$/g, '');
    var pubM = /^published:\s*(false|true)$/m.exec(block);
    if (pubM) meta.published = pubM[1] !== 'false';
  }
  return meta;
}

// 按 permalink 规则 :year/:month/:title/ 推导；有 permalink 字段则直接用
function deriveArticleUrls() {
  var urls = {};
  if (!fs.existsSync(POSTS_DIR)) return urls;
  fs.readdirSync(POSTS_DIR).forEach(function (name) {
    if (!/\.md$/.test(name)) return;
    var file = path.join(POSTS_DIR, name);
    var meta = readPostMeta(file);
    if (meta.published === false) return;
    if (meta.permalink) {
      urls[normalizeUrl(meta.permalink)] = name;
      return;
    }
    var slug = name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    var d = meta.date ? new Date(meta.date.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return;
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    urls[normalizeUrl('/' + y + '/' + mo + '/' + slug + '/')] = name;
  });
  return urls;
}

function normalizeUrl(u) {
  var s = String(u).trim();
  if (s.charAt(0) !== '/') s = '/' + s;
  if (s.charAt(s.length - 1) !== '/') s += '/';
  return s;
}

/* ---------- 校验主体 ---------- */

/**
 * @param {Object} opts
 * @param {Array<string>} [opts.routeList] hexo 生成后实际的路由列表（最准确）
 * @returns {{errors: Array<string>, warnings: Array<string>}}
 */
function validate(opts) {
  opts = opts || {};
  var errors = [];
  var warnings = [];

  if (!fs.existsSync(DATA_FILE)) {
    errors.push('找不到商品数据文件：' + path.relative(ROOT, DATA_FILE));
    return { errors: errors, warnings: warnings };
  }

  var raw = fs.readFileSync(DATA_FILE, 'utf8');

  // 1. JSON 语法
  var data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    errors.push('products.json 不是合法 JSON —— ' + describeJsonError(err, raw));
    return { errors: errors, warnings: warnings };
  }

  // 2. 顶层字段
  if (!isNonEmptyString(data.note)) errors.push('顶层 note 缺失或为空，应写一句价格说明');
  if (!isNonEmptyString(data.updated) || !DATE_RE.test(data.updated)) {
    errors.push('顶层 updated 必须是 YYYY-MM-DD 格式的字符串，当前是 ' + JSON.stringify(data.updated));
  } else {
    var upd = new Date(data.updated + 'T00:00:00');
    if (isNaN(upd.getTime())) {
      errors.push('顶层 updated 不是有效日期：' + data.updated);
    } else {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var age = daysBetween(upd, today);
      if (age < 0) {
        warnings.push('顶层 updated（' + data.updated + '）是未来日期');
      } else if (age > STALE_DAYS) {
        warnings.push('价格已 ' + age + ' 天未核对（updated: ' + data.updated + '）——该去电商页核一遍价再改 updated');
      }
    }
  }

  var cats = data.cats;
  if (!cats || typeof cats !== 'object' || Array.isArray(cats)) {
    errors.push('顶层 cats 必须是对象，形如 { "host": "NAS 主机" }');
    cats = {};
  } else {
    Object.keys(cats).forEach(function (k) {
      if (!isNonEmptyString(k) || !isNonEmptyString(cats[k])) {
        errors.push('cats["' + k + '"] 的分类名不能为空');
      }
    });
    if (Object.keys(cats).length === 0) errors.push('顶层 cats 至少需要一个分类');
  }

  if (!Array.isArray(data.products)) {
    errors.push('顶层 products 必须是数组');
    return { errors: errors, warnings: warnings };
  }
  if (data.products.length === 0) errors.push('products 数组为空，商城会渲染成空白页');

  // 3. 逐件校验
  var seenIds = {};
  var usedCats = {};

  data.products.forEach(function (p, i) {
    var at = 'products[' + i + ']';
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errors.push(at + ' 必须是对象');
      return;
    }
    var label = isNonEmptyString(p.name) ? p.name : at;

    // 必填字段
    REQUIRED.forEach(function (k) {
      if (!(k in p)) errors.push(label + '：缺少必填字段 ' + k);
    });

    // 未知字段（防拼错，如 proce / tags）
    Object.keys(p).forEach(function (k) {
      if (REQUIRED.indexOf(k) === -1 && OPTIONAL.indexOf(k) === -1) {
        warnings.push(label + '：出现未知字段 "' + k + '"，是拼错了吗？（不会被前端渲染）');
      }
    });

    // id
    if ('id' in p) {
      if (!isNonEmptyString(p.id)) {
        errors.push(label + '：id 必须是非空字符串');
      } else {
        if (p.id !== p.id.trim()) {
          errors.push(label + '：id 首尾有空格 ' + JSON.stringify(p.id) + '——会导致分类筛选和内链匹配失效');
        }
        if (!ID_RE.test(p.id.trim())) {
          errors.push(label + '：id 必须是小写字母数字加连字符（kebab-case），当前 ' + JSON.stringify(p.id));
        }
        var key = p.id.trim();
        if (seenIds[key]) {
          errors.push('id 重复："' + key + '" 同时出现在 ' + seenIds[key] + ' 和 ' + at);
        } else {
          seenIds[key] = at;
        }
      }
    }

    // cat
    if ('cat' in p) {
      if (!isNonEmptyString(p.cat)) {
        errors.push(label + '：cat 不能为空');
      } else if (cats && Object.keys(cats).length && !(p.cat in cats)) {
        errors.push(label + '：cat "' + p.cat + '" 不在 cats 里（可选：' + Object.keys(cats).join(' / ') + '）');
      }
      usedCats[p.cat] = true;
    }

    // 文本字段
    ['name', 'spec', 'reason'].forEach(function (k) {
      if (k in p && !isNonEmptyString(p[k])) errors.push(label + '：' + k + ' 不能为空');
    });
    if ('tag' in p && p.tag !== null && typeof p.tag !== 'string') {
      errors.push(label + '：tag 必须是字符串');
    }

    // price
    if ('price' in p) {
      if (typeof p.price !== 'number') {
        errors.push(label + '：price 必须是数字（不带引号、不带 ¥），当前是 ' + typeof p.price + ' ' + JSON.stringify(p.price));
      } else if (!isFinite(p.price) || p.price <= 0) {
        errors.push(label + '：price 必须是大于 0 的数字，当前 ' + p.price);
      } else if (Math.floor(p.price) !== p.price) {
        errors.push(label + '：price 应该是整数（元），当前 ' + p.price);
      }
    }

    // article
    if ('article' in p) {
      if (!isNonEmptyString(p.article)) {
        errors.push(label + '：article 不能为空');
      } else if (p.article.charAt(0) !== '/') {
        errors.push(label + '：article 必须以 / 开头（站内绝对路径），当前 ' + JSON.stringify(p.article));
      } else if (p.article.indexOf(' ') !== -1) {
        errors.push(label + '：article 里不能有空格，当前 ' + JSON.stringify(p.article));
      }
    }

    // link
    if ('link' in p) {
      if (!isNonEmptyString(p.link)) {
        errors.push(label + '：link 不能为空');
      } else if (!/^https?:\/\//i.test(p.link)) {
        errors.push(label + '：link 必须以 http:// 或 https:// 开头，当前 ' + JSON.stringify(p.link));
      }
    }
  });

  // 分类是否都有商品
  Object.keys(cats).forEach(function (k) {
    if (data.products.length && !usedCats[k]) {
      warnings.push('分类 "' + k + '"（' + cats[k] + '）下没有商品，前端会出现一个点开为空的标签');
    }
  });

  // 4. article 指向的文章是否存在
  //    默认在生成后跑（用真实路由最准确）；生成前用 skipArticleCheck 跳过，
  //    因为那时只能靠文件名推导 URL，时区/permalink 规则一变就可能误报。
  if (!opts.skipArticleCheck) {
    var routeList = opts.routeList || null;
    var articleMap = deriveArticleUrls();
    var usingPublic = false;

    if (!routeList && fs.existsSync(PUBLIC_DIR)) usingPublic = true;

    data.products.forEach(function (p, i) {
      if (!p || !isNonEmptyString(p.article)) return;
      var label = isNonEmptyString(p.name) ? p.name : 'products[' + i + ']';
      var url = normalizeUrl(p.article);
      var ok = null;

      if (routeList) {
        var candidate = url.replace(/^\//, '') + 'index.html';
        ok = routeList.indexOf(candidate) !== -1;
      } else if (usingPublic) {
        ok = fs.existsSync(path.join(PUBLIC_DIR, url.replace(/^\//, ''), 'index.html'));
      } else {
        ok = Object.prototype.hasOwnProperty.call(articleMap, url);
      }

      if (ok === false) {
        // 给个近似建议：同 slug 不同月份是最常见的手误
        var slug = url.replace(/^\/\d{4}\/\d{2}\//, '').replace(/\/$/, '');
        var near = Object.keys(articleMap).filter(function (u) {
          return u.indexOf(slug) !== -1 && u !== url;
        });
        var hint = near.length
          ? '——是不是 ' + near.slice(0, 3).join(' 或 ') + ' ?'
          : '（站内没有同名文章，检查文件名或有没有忘记发布）';
        errors.push(label + '：article 指向的文章不存在 ' + p.article + hint);
      }
    });
  }

  return { errors: errors, warnings: warnings };
}

/* ---------- 输出 ---------- */

function report(result, opts) {
  opts = opts || {};
  var lines = [];
  result.warnings.forEach(function (w) { lines.push('  ⚠ ' + w); });
  result.errors.forEach(function (e) { lines.push('  ✗ ' + e); });
  return lines.join('\n');
}

function runCli() {
  var result = validate({});
  var out = report(result);

  if (result.errors.length) {
    console.error('\n商城商品数据校验未通过（' + result.errors.length + ' 个错误，' + result.warnings.length + ' 个提醒）：');
    console.error(out);
    console.error('\n修复 source/mall/products.json 后重跑。\n');
    process.exit(1);
  }

  if (result.warnings.length) {
    console.log('\n商城商品数据校验通过，但有提醒：');
    console.log(out);
  } else {
    console.log('\n✓ 商城商品数据校验全部通过\n');
  }
}

/* ---------- Hexo 集成 ---------- */

// 构建阶段失败：打印干净的中文错误，然后让构建真的失败。
// 不用裸 throw —— Hexo 会把整个 bluebird 堆栈刷出来，中文错误反而被淹没。
function failBuild(headline, result) {
  hexo.log.error('');
  hexo.log.error(headline);
  result.errors.forEach(function (e) { hexo.log.error('  ✗ ' + e); });
  if (result.warnings.length) {
    result.warnings.forEach(function (w) { hexo.log.warn('  ⚠ ' + w); });
  }
  hexo.log.error('');
  hexo.log.error('文件：source/mall/products.json　修好后重新构建；本地可先跑 npm run validate:products 自查。');
  hexo.log.error('');

  var cmd = hexo.env && hexo.env.cmd;
  if (cmd === 'generate') {
    // 构建失败就必须是非零退出码，CI 才不会把坏数据发上线
    process.exit(1);
  }
  // server / deploy 等模式不杀进程，只抛错让调用方知道
  throw new Error('source/mall/products.json 校验失败，见上方错误列表');
}

if (typeof hexo !== 'undefined' && hexo && hexo.extend) {
  // 生成前：只做结构与字段校验（最早失败，省得白跑一遍构建）。
  // 链接校验留到 after_generate —— 那时才有权威的真实路由。
  hexo.extend.filter.register('before_generate', function () {
    var result = validate({ skipArticleCheck: true });
    if (result.errors.length) {
      failBuild('商城商品数据校验未通过，构建已中止：', result);
      return;
    }
    result.warnings.forEach(function (w) { hexo.log.warn('商城数据提醒：' + w); });
    hexo.log.info('商城商品数据校验通过（' + countProducts() + ' 件）');
  });

  // 生成后：用真实生成的路由再核对一遍 article 链接
  hexo.extend.filter.register('after_generate', function () {
    var list = [];
    try { list = hexo.route.list(); } catch (err) { list = []; }
    if (!list.length) return;
    var result = validate({ routeList: list });
    if (result.errors.length) {
      failBuild('商城商品数据校验未通过（文章链接），构建已中止：', result);
    }
  });
}

function countProducts() {
  try {
    var d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(d.products) ? d.products.length : 0;
  } catch (err) {
    return 0;
  }
}

if (require.main === module) runCli();

module.exports = { validate: validate };
