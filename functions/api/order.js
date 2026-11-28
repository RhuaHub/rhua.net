// Cloudflare Pages Function: POST /api/order
// 把产品页提交的订单写入飞书多维表格「预约记录」
// 凭证在 Cloudflare Pages 环境变量中配置：
//   FEISHU_APP_ID      应用 app_id（cli_ 开头）
//   FEISHU_APP_SECRET  应用 app_secret
// 表格 token 与 table_id 见下方常量，也可改成环境变量。

const BASE_TOKEN = 'L3kVbDxDoaz2VEs9oq9cLrTdnAe';
const TABLE_ID = 'tblffnExr4Frl9lF';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8', ...CORS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    return json({ ok: false, error: '服务端未配置飞书凭证（FEISHU_APP_ID / FEISHU_APP_SECRET）' }, 500);
  }

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ ok: false, error: '请求格式错误' }, 400);
  }

  const orderNo = String(data.orderNo || '').slice(0, 40);
  const configs = Array.isArray(data.items) ? data.items.slice(0, 20) : [];
  const name = String(data.name || '').slice(0, 30);
  const phone = String(data.phone || '').slice(0, 20);
  const addr = String(data.addr || '').slice(0, 120);
  const amount = Number(data.amount) || 0;

  if (!orderNo || !configs.length || !name || !phone || !addr) {
    return json({ ok: false, error: '订单号、配置、收货人、手机号、收货地址均为必填' }, 400);
  }

  try {
    // 1) 换取 tenant_access_token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const tokenJson = await tokenRes.json();
    if (tokenJson.code !== 0 || !tokenJson.tenant_access_token) {
      return json({ ok: false, error: '获取飞书凭证失败', detail: tokenJson.msg || tokenJson.code }, 502);
    }
    const token = tokenJson.tenant_access_token;

    // 2) 写入记录
    const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const createRecords = configs.map(function (it) {
      return {
        '订单号': orderNo,
        '配置': [String(it.name || '').slice(0, 40)],
        '数量': Math.max(1, Math.min(99, Number(it.qty) || 1)),
        '金额': Number(it.amount) || 0,
        '收货人': name,
        '手机号': phone,
        '收货地址': addr,
        '状态': ['待确认'],
        '预约时间': now,
        '备注': '来源：产品页自动提交'
      };
    });

    const recRes = await fetch(
      'https://open.feishu.cn/open-apis/base/v3/bases/' + BASE_TOKEN + '/tables/' + encodeURIComponent(TABLE_ID) + '/records/batch_create',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ create_records: createRecords })
      }
    );
    const recJson = await recRes.json();
    if (recJson.code !== 0) {
      return json({ ok: false, error: '写入飞书表格失败', detail: recJson.msg || recJson.code }, 502);
    }
    return json({ ok: true, orderNo: orderNo, count: createRecords.length });
  } catch (e) {
    return json({ ok: false, error: '服务端异常', detail: String(e && e.message ? e.message : e) }, 500);
  }
}
