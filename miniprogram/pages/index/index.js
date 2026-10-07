// NAS 选型计算器 —— 纯本地计算，不联网、不收集任何数据
const USAGE = [
  { key: 'backup', label: '照片 / 文件备份', hint: '最基础的用途' },
  { key: 'video',  label: '影音库（含 4K）', hint: '要看转码能力' },
  { key: 'docker', label: 'Docker / 虚拟机', hint: '必须 x86' },
  { key: 'ai',     label: '本地 AI 模型',    hint: '吃内存' },
  { key: 'remote', label: '远程访问 / 私有云', hint: '看外网穿透与 App' },
  { key: 'pt',     label: 'PT / 长时间下载',  hint: '看功耗与稳定性' }
]

const DATA_OPTS = [
  { v: 2,  label: '不到 2TB' },
  { v: 6,  label: '2–8TB' },
  { v: 14, label: '8–20TB' },
  { v: 24, label: '20TB 以上' }
]

const GROWTH_OPTS = [
  { v: 1, label: '每年 1TB 以内' },
  { v: 2, label: '每年约 2TB' },
  { v: 4, label: '每年 4TB 以上' }
]

const BUDGET_OPTS = [
  { v: 1500,  label: '1500 元以内' },
  { v: 2800,  label: '1500–2800 元' },
  { v: 5000,  label: '2800–5000 元' },
  { v: 99999, label: '5000 元以上' }
]

// 价格均为 2026-10-07 核对的公开渠道参考价，会随促销与国补变动
const TIERS = {
  1500: {
    name: '入门档',
    range: '¥999–1799',
    models: ['华强北 N355 准系统 ¥999', '极空间 Z2Pro ¥1099', '绿联 DXP2800 ¥1199–1799'],
    note: '这一档要么是 ARM 芯片，要么是自己装系统的准系统。'
  },
  2800: {
    name: '主流档（大多数人到这里就够了）',
    range: '¥1664–2799',
    models: ['极空间 Q4 ¥1664–1819', '绿联 DXP4800 ¥2199', '极空间 Z4Pro ¥2499–2799'],
    note: 'x86 + 4 盘位 + 双 2.5G 网口是这一档的标准配置。'
  },
  5000: {
    name: '进阶档',
    range: '¥3299–4699',
    models: ['群晖 DS423+ ¥3299', '群晖 DS425+ ¥4149', '威联通 TS-464 ¥3899'],
    note: '多出来的钱主要买系统生态、售后与长期安全更新。'
  },
  99999: {
    name: '高端 / AI 档',
    range: '¥6000–15999',
    models: ['绿联 iDX6011 Pro ¥15999（史低 ¥14999）', '万兆全闪方案'],
    note: '万兆网口只在全闪或多人高并发时才有意义。'
  }
}

Page({
  data: {
    // checked 预计算：WXML 里不做 indexOf 之类的方法调用，保证各版本基础库都兼容
    usageList: USAGE.map(function (u, i) {
      return Object.assign({}, u, { checked: i === 0 })
    }),
    dataOpts: DATA_OPTS,
    growthOpts: GROWTH_OPTS,
    budgetOpts: BUDGET_OPTS,
    dataIdx: 1,
    growthIdx: 1,
    budgetIdx: 1,
    result: null
  },

  selectedKeys() {
    return this.data.usageList.filter(function (u) { return u.checked }).map(function (u) { return u.key })
  },

  toggleUsage(e) {
    const key = e.currentTarget.dataset.key
    const list = this.data.usageList
    let checkedCount = 0
    const next = list.map(function (u) {
      if (u.key === key) u.checked = !u.checked
      if (u.checked) checkedCount++
      return u
    })
    if (checkedCount === 0) {
      wx.showToast({ title: '至少选一个用途', icon: 'none' })
      return
    }
    this.setData({ usageList: next, result: null })
  },

  pick(e) {
    const { field, idx } = e.currentTarget.dataset
    const d = {}
    d[field] = Number(idx)
    d.result = null
    this.setData(d)
  },

  reset() {
    const list = USAGE.map(function (u, i) {
      return Object.assign({}, u, { checked: i === 0 })
    })
    this.setData({
      usageList: list,
      dataIdx: 1,
      growthIdx: 1,
      budgetIdx: 1,
      result: null
    })
  },

  compute() {
    const usage = this.selectedKeys()
    const dataNow = DATA_OPTS[this.data.dataIdx].v
    const growth = GROWTH_OPTS[this.data.growthIdx].v
    const budget = BUDGET_OPTS[this.data.budgetIdx].v
    const has = (k) => usage.indexOf(k) >= 0

    // 三年后的裸容量需求
    const need = dataNow + growth * 3

    // 是否吃 CPU / 内存
    const needsX86 = has('docker') || has('ai') || has('video')
    const needsRam = has('ai') || has('docker')

    // 盘位：2026 年的立场是至少 4 盘位
    let bays = 4
    let usablePerDisk = 0
    if (need <= 8) {
      bays = 4
      usablePerDisk = Math.ceil(need / 3 * 10) / 10 // RAID5 四盘用三块
    } else if (need <= 24) {
      bays = 4
    } else {
      bays = 6
    }

    // 硬盘方案（RAID 5：n 块盘可用 n-1 块）
    const perDisk = this.pickDiskSize(need, bays)
    const usable = Math.round(perDisk * (bays - 1))
    const hddBudget = this.estimateHddBudget(perDisk, bays)

    const tier = TIERS[budget]
    const warnings = []

    if (needsX86 && budget <= 1500) {
      warnings.push('你选的用途需要 x86 芯片，但 1500 元以内基本是 ARM 或准系统 —— 4K 转码、Docker、本地 AI 都会明显吃力。建议把预算提到 2000 元以上，宁可硬盘少买一块。')
    }
    if (has('ai')) {
      warnings.push('本地 AI 先看内存：7B 量化模型需要约 16G，13B 需要 32G 以上。很多时候「加内存」比「换机器」划算得多。')
    }
    if (has('video')) {
      warnings.push('影音转码认准 Intel 核显（如 N100 的 QuickSync），ARM 机型软转码基本跑不动 4K。')
    }
    if (bays === 6) {
      warnings.push('你的容量需求已经超出 4 盘位的舒适区，直接看 6 盘位，别买 4 盘位再换整机。')
    }
    warnings.push('进 RAID 的硬盘一律选 CMR，SMR 再便宜都不要 —— 它在重建阵列时可能掉到 10MB/s，甚至被踢出阵列。')
    warnings.push('硬盘要单独算预算：机器价的 1–1.5 倍是常见区间，别把钱全花在机器上。')

    this.setData({
      result: {
        need,
        bays,
        perDisk,
        usable,
        hddBudget,
        tier,
        warnings,
        needsX86,
        needsRam,
        priceDate: '2026-10-07'
      }
    })
    wx.pageScrollTo({ selector: '#result', duration: 300 })
  },

  // 选一个够用且常见的单盘容量：4 / 8 / 12 / 16 TB
  pickDiskSize(need, bays) {
    const sizes = [4, 6, 8, 12, 16, 20]
    for (const s of sizes) {
      if (s * (bays - 1) >= need) return s
    }
    return 20
  },

  // 硬盘预算粗估：4TB≈600，8TB≈1400，12TB≈2200（2026-10-07）
  estimateHddBudget(perDisk, bays) {
    const unit = perDisk <= 4 ? 600 : perDisk <= 6 ? 900 : perDisk <= 8 ? 1400 : perDisk <= 12 ? 2200 : 3200
    return unit * bays
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  }
})
