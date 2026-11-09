---
title: 打洞失败别忍：给 Tailscale 自建 DERP 中继，把远程速度拉回来
date: 2026-11-09 21:00:00
description: Tailscale 直连失败时会回落到官方 DERP 中继，跨运营商、出国、对称 NAT 下延迟和带宽会明显掉一档。这篇只解决这一件事：自建一个 DERP 节点，写清前置条件、derper 启动参数、ACL 的 derpMap 写法、netcheck 验证，以及证书、UDP 3478、verify-clients 三个最常见的坑。基础组网和子网路由见旧文，本文不重复。
keywords: Tailscale DERP,自建DERP,derper,Tailscale 中继,打洞失败,netcheck,WireGuard,NAS 远程访问
tags:
  - Tailscale
  - 内网穿透
  - 远程访问
  - 自建
faq:
  - q: "自建 DERP 能给 Tailscale 提速吗？"
    a: "只在打洞失败、流量已经走中继时才有意义。直连成功的情况下 DERP 完全不参与转发，自建了也不会更快。先用 tailscale netcheck 和 tailscale status 确认是否长期 via DERP，再决定要不要动手。"
  - q: "必须有公网服务器和域名吗？"
    a: "是。DERP 节点需要一个能被所有客户端访问到的地址：一个解析到 VPS 的域名、可用的 443 端口和有效 TLS 证书，另加 3478/UDP 给 STUN。只有内网、没有公网 IP 的环境做不了自建中继。"
  - q: "为什么加了 verify-clients 之后节点不工作？"
    a: "这个参数会让 derper 去校验每个连接方是否属于同一个 tailnet，因此跑 derper 的那台机器本身必须安装并登录 tailscaled。本机没登录时，它会把包括你自己设备在内的所有连接拒掉。不开这个参数则任何人都可能白嫖你的中继带宽。"
---

> 草稿说明（发布前删掉本段）：以下按「一台有公网的 Debian VPS + 自有域名 + Tailscale 官方 derper」写成可抄骨架，尚未在目标环境跑通核对。derper 参数名和 ACL 字段随版本变化，发布前请以本机 `derper -h` 与 Tailscale 当前 ACL 文档核对，并补齐你自己的域名、region 编号和 netcheck 实测数值。

## 先说结论

Tailscale 打洞成功时是 WireGuard 直连，速度取决于两端带宽；打洞失败才回落到官方 DERP 中继，跨运营商或出国时这一档会明显变慢。**自建 DERP 只解决「回落之后的那一档」**，不解决直连失败本身。

所以它值得动手的前提只有三个，缺一个都别折腾：

1. `tailscale netcheck` / `tailscale status` 显示长期 `via DERP`，不是偶尔一次；
2. 你手上有可长期开机的公网 VPS、一个域名和证书；
3. 官方中继到你两端设备的延迟，明显高于这台 VPS。

如果直连本来就通，自建 DERP 的收益是零，只多一份服务器账单和维护。

## 与旧文的分工

[外网访问 NAS 不用端口映射：Tailscale 组网实录](/2026/10/tailscale-nas-remote-2026/) 已经写了装客户端、子网路由、MagicDNS、直连与中继的实测对比，也留了「中继卡顿」这个坑。本文是那个坑的续篇，基础配置不再重复，建议先读旧文再回来。

## 环境边界

| 项目 | 本文前提 |
| --- | --- |
| 中继服务器 | 一台有公网 IPv4 的 VPS，Debian 12，可长期开机 |
| 域名 | `derp.example.com` 已解析到该 VPS（下文全部按此写，换成你自己的） |
| 端口 | 80/TCP（ACME 校验）、443/TCP（DERP）、3478/UDP（STUN） |
| 客户端 | Tailscale 官方客户端，已登录同一 tailnet |
| 记录日期 | 2026-11，derper 参数与 ACL 字段以当前版本为准 |

## 步骤

### 0. 先确认确实需要

在**两端的设备上**分别跑：

```bash
tailscale netcheck          # 看各 DERP region 的延迟，找出离你最近的官方节点
tailscale status            # 连接里是否出现 via DERP(xxx)
tailscale ping 对端100.x地址 # 首包之后是否转成 direct
```

把「官方中继延迟」和「VPS 到两端的往返延迟」记下来。如果官方节点本来就只有几十毫秒，自建大概率没意义——这一步能省掉后面所有事。

### 1. 放行端口并准备域名

- 云厂商安全组和系统防火墙都要放：**80/TCP、443/TCP、3478/UDP**。UDP 3478 最容易漏，漏了的表现是 STUN 不通、打洞更差。
- 域名 A/AAAA 记录指向 VPS，先确认解析生效：`dig +short derp.example.com`。
- 证书走 Let's Encrypt 最省事（derper 的 `letsencrypt` 模式会自动申请），前提是 80/443 能从公网访问。自签证书需要把 CA 装进每个客户端，家用场景不划算。

### 2. 装 derper 并启动

用 Go 安装官方二进制（或选一个你信得过的容器镜像，参数以镜像文档为准）：

```bash
go install tailscale.com/cmd/derper@latest
derper -h                    # 先核对本机版本的参数名，别照抄旧教程
```

常见形式的启动参数（**先用 `-h` 核对**）：

```bash
sudo derper \
  -hostname derp.example.com \
  -certmode letsencrypt \
  -a :443 \
  -stun-port 3478 \
  -verify-clients
```

`-verify-clients` 建议一定开，否则你的中继会被别人白嫖；但它要求**这台 VPS 自己也装了 tailscaled 并登录同一个 tailnet**，否则连你自己的设备都会被拒。

长期运行交给 systemd：写一个 unit 包住上面的命令，`Restart=always`，别用 `nohup` 裸跑。证书目录要有持久化的写权限，续期失败是运行一段时间后才暴露的问题。

### 3. 在 ACL 里声明自定义 DERP 区域

Tailscale Admin console → Access Controls，加入 `derpMap`（结构如下，**粘贴前按控制台当前文档校验**）：

```json
"derpMap": {
  "Regions": {
    "900": {
      "RegionID": 900,
      "RegionCode": "myderp",
      "RegionName": "My DERP",
      "Nodes": [
        {
          "Name": "1",
          "RegionID": 900,
          "HostName": "derp.example.com",
          "DERPPort": 443,
          "STUNPort": 3478
        }
      ]
    }
  }
}
```

两个别踩的点：

- region 编号用 900 以上，避开官方保留编号；
- **不要**设 `"OmitDefaultRegions": true`。保留官方节点做兜底，自建节点挂了还能回落；关掉之后自建节点一挂，全网中继就断了。

保存 ACL 后，各客户端可能需要重连（`tailscale down && tailscale up`）才会拉到新 derpMap。

### 4. 验证

```bash
tailscale netcheck     # 应能看到 myderp / 900 这个 region 及其延迟
tailscale status       # 中继连接是否指向自定义 region
tailscale ping 对端    # 对比第 0 步记下的延迟
```

把「自建前官方 DERP 延迟」和「自建后 myderp 延迟」两个实测数字写进文章，才算跑通；只看到节点出现、没测速度，不算。

## 踩过的坑

1. **UDP 3478 没放**：云安全组、系统防火墙两层都要放，只开 TCP 443 时 DERP 能用但 STUN 不工作，反而更不容易打洞。
2. **证书申请失败**：域名没解析到位、80 端口被占、或 VPS 出站被挡，ACME 都会失败；`letsencrypt` 模式下看 derper 日志比猜快。
3. **verify-clients 把自家设备拒了**：VPS 上的 tailscaled 没登录，或登录的是另一个 tailnet。
4. **关掉了官方兜底**：`OmitDefaultRegions` 设 true 后，自建节点一挂，所有中继连接一起断。
5. **成本被忽略**：一台 VPS 是长期月费。若只是为了偶尔在外面看一眼 NAS Web 界面，先用旧文里的子网路由 + MagicDNS 就够了。

## 关联阅读

- [外网访问 NAS 不用端口映射：Tailscale 组网实录](/2026/10/tailscale-nas-remote-2026/)
- [N100 上 PVE 直通核显：从 BIOS 到硬解验证](/2026/11/pve-passthrough-n100-2026/)

## 边界

本文只覆盖「单节点自建 DERP + 保留官方兜底」，不涉及多节点高可用、DERP 与出口节点组合、企业级 tailnet 策略，也不含家里无公网 IP 的场景。derper 参数、ACL 字段名、region 编号规则都可能随版本变化，请以本机 `-h` 和控制台文档为准；文中未写具体速度数字，是因为这部分必须按你自己的链路实测补上。
