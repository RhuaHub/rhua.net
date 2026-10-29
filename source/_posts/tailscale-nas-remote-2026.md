---
title: 外网访问 NAS 不用端口映射：Tailscale 组网实录
date: 2026-10-28 21:55:00
cover: /img/cover/cover-tailscale.jpg
description: 出差在外想访问家里的 NAS，别再折腾公网 IP 和端口映射。用 Tailscale 把手机、笔记本、NAS 组成一个虚拟内网：装 Docker 容器、开子网路由、配 MagicDNS，实测直连和走中继分别是什么速度，以及密钥过期、中继卡顿两个坑。
keywords: Tailscale NAS,外网访问NAS,内网穿透,NAS远程访问,WireGuard组网,子网路由,不用端口映射,Tailscale docker
tags:
  - Tailscale
  - 内网穿透
  - 远程访问
  - Docker
faq:
  - q: "不开放端口，手机在外网怎么连上家里的 NAS？"
    a: "Tailscale 给每台设备分配一个 100.x 开头的虚拟 IP，设备之间用 WireGuard 加密直连。手机装了 Tailscale 客户端并登录同一账号后，就能像在家里局域网一样访问 NAS 的内网 IP 和端口，全程不需要公网 IP、不需要端口映射、不需要 DDNS。打洞失败时会自动走官方中继（DERP），速度会慢一些但能连上。"
  - q: "Tailscale 免费版够用吗？"
    a: "个人用基本够。免费版限 3 个用户、100 台设备，个人设备（手机、笔记本、NAS、平板）远不到上限。区别主要在团队功能和并发连接数上，家用场景感知不到。"
  - q: "Tailscale 和 frp、ZeroTier 有什么区别？"
    a: "frp 需要一个有公网 IP 的中转服务器，带宽和稳定性取决于你自己买的服务器；ZeroTier 和 Tailscale 思路接近，都是组虚拟内网，但 Tailscale 基于 WireGuard、客户端体验和直连成功率更好一些，而且有 MagicDNS 可以直接用域名访问。缺点都是依赖第三方控制面，账号被封或服务停服就用不了。"
---

上次写 Immich 的时候留了个尾巴：相册装好了，但**只在家里能用**。出门在外想看一眼孩子的照片、或者出差要取一份文件，就得解决外网访问。

传统做法有三种，我都试过，各有各的麻烦：公网 IP（家宽基本不给）、DDNS + 端口映射（等于把 NAS 挂到公网上，被扫、被爆破是迟早的事）、frp（得自己买中转服务器，带宽贵）。

现在我用的是 **Tailscale**：把设备组成一个虚拟内网，不用公网 IP、不开端口、不备案。这篇写清楚它是怎么工作的，以及具体怎么在 NAS 上配。

## 一、它凭什么不用开端口

Tailscale 基于 **WireGuard**。你在每台设备上装客户端、登录同一个账号，Tailscale 的协调服务器（控制面）只负责告诉设备彼此的地址和公钥，**真正的数据是设备之间点对点加密传输的**，不经过它的服务器。

它给每台设备分配一个固定的 `100.x.y.z` 地址。手机连上 Tailscale 后，这个 100 开头的地址就等同于"你家里局域网里的一个 IP"，访问 `http://100.x.y.z:2283` 就是访问 NAS。

打洞失败的场景（比如两边都是对称 NAT）会自动走官方中继 DERP，能连但慢。我在酒店 Wi-Fi 下测过：直连能跑满家宽上行，走中继大概 2–5 MB/s，看照片、取文件都够。

## 二、NAS 上装 Tailscale

**方式 A：套件（群晖 / 威联通）**

群晖在「套件中心 → 设置 → 套件来源」添加 `https://packages.pkgs.org` 之类的第三方源比较折腾，我更推荐直接用 Docker，所有平台一致。

**方式 B：Docker（推荐）**

```yaml
services:
  tailscale:
    container_name: tailscale
    image: tailscale/tailscale:latest
    hostname: nas
    environment:
      - TS_AUTHKEY=tskey-auth-xxxxxxxxxxxx   # 在管理后台生成
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false                    # 用内核态，性能更好
      - TS_EXTRA_ARGS=--advertise-routes=192.168.1.0/24 --accept-dns=false
    volumes:
      - /volume1/docker/tailscale:/var/lib/tailscale
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - NET_ADMIN
      - NET_RAW
    network_mode: host
    restart: unless-stopped
```

几个参数值得单独说：

- `TS_USERSPACE=false` + `cap_add: NET_ADMIN`：走内核态而非用户态转发，吞吐明显更好。群晖/威联通的内核都支持。
- `--advertise-routes=192.168.1.0/24`：把 NAS 变成**子网路由**，这样你手机在外网不仅能访问 NAS，还能访问家里整个局域网（路由器管理页、打印机、摄像头）。记住把网段换成你自己的。
- `--accept-dns=false`：不让 Tailscale 接管 DNS。开了会让解析走它的 MagicDNS，家用有时会出现内网域名解析不出的问题。

`TS_AUTHKEY` 在 [Tailscale 管理后台](https://login.tailscale.com/admin/settings/keys) 生成，建议勾选 **Reusable**，否则容器重建后要重新授权。

启动后回到后台，NAS 会出现在设备列表里。第一次用子网路由还需要在后台点一下 **Approve**（Machines → 该设备 → Edit route settings），**不点的话这个网段是不生效的**——这是我第一次配的时候卡了半小时的地方。

## 三、手机和笔记本

装官方客户端，登录同一账号，打开开关就行。手机上建议开启「按需连接」（iOS）或「始终开启 VPN」（Android），这样出门自动连上，回家自动断开。

有个细节：iOS 上 Tailscale 是作为 VPN 配置运行的，和 Clash 之类的代理工具**会冲突**，只能二选一。我的做法是代理里给 `100.64.0.0/10` 加一条直连规则，这样两个能共存。

## 四、访问体验

配好之后，你在外面的访问方式就是：

- 相册：`http://100.x.y.z:2283`
- 路由器：`http://192.168.1.1`（走子网路由，和在家一样）
- 文件：SMB 挂载 `\\100.x.y.z\photos`

如果嫌 IP 难记，打开 **MagicDNS**（后台 DNS 页开启），之后可以直接用 `http://nas:2283`、`http://nas.your-tailnet.ts.net:2283` 访问。

## 五、两个坑

**坑 1：密钥过期，某天突然连不上**

默认的设备密钥有有效期（180 天）。到期后设备会掉线，需要重新登录。家用设备不想被踢的话，在后台设备的菜单里点 **Disable key expiry**。手机和笔记本建议保留过期（丢了能自动失效），NAS 和常开设备可以关掉。

**坑 2：一直是中继，速度只有几 MB/s**

先看是不是真的中继：客户端里点设备名，会显示 `direct` 还是 `relay`。如果长期 relay，通常是 NAT 类型问题：

- 路由器上开 **UPnP** 或手动给 NAS 做 UDP 41641 端口映射，直连成功率会明显提高
- 双栈网络下优先走 IPv6，打洞成功率比 IPv4 高很多
- 公司/酒店网络做了严格限制时，中继是唯一出路，忍一下

## 六、安全上要注意的

- **不要把 Tailscale 当成"公网暴露"**：它只是给你自己的设备开了条加密隧道，没有账号的人访问不到，这点比端口映射安全得多。
- **给朋友分享用 Share 功能**，别把自己的账号密码给出去。Share 可以只分享单台设备，还能设到期时间。
- **NAS 上的服务该有的密码还得有**。Tailscale 挡住的是"陌生人能不能连上"，不是"连上之后能干什么"。

写到这里，相册和外网访问这两块就闭环了：照片存在自己盘上，人在哪都能看。下一步我打算写备份——**没有异地备份的 NAS，本质上只是一个更贵的单点故障**。
