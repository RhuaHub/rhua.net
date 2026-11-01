---
title: Jellyfin 硬解调通：N100 核显转码，4K 不再让 CPU 打满
date: 2026-11-01 22:25:00
cover: /img/cover/cover-jellyfin.jpg
description: 用 N100 小主机跑 Jellyfin，软解 4K 直接 CPU 满载、风扇狂转、手机端一卡一卡。这篇把硬解调通的全过程写清楚：N100 核显能解什么不能解什么、容器怎么放行 /dev/dri、Jellyfin 后台那几个开关怎么勾、怎么用 intel_gpu_top 确认真的在硬解，以及 HDR 发灰、绿屏、字幕触发转码这几个坑。
keywords: Jellyfin硬解,N100转码,Jellyfin VAAPI,核显转码,docker jellyfin,4K转码,Intel QSV,家庭影音
tags:
  - Jellyfin
  - 影音
  - 硬解
  - N100
faq:
  - q: "N100 的核显能硬解 4K 吗？"
    a: "能。N100 是 Alder Lake-N，核显是 UHD Graphics（24EU），支持 H.264、HEVC 8/10bit、VP9 的硬件解码，AV1 也支持解码。编码方面支持 H.264 和 HEVC，不支持 AV1 编码（想要 AV1 编码得上 Arc 独立显卡）。实测同时转 2-3 路 4K→1080p 没问题。"
  - q: "为什么我在 Jellyfin 里开了硬解，CPU 还是 100%？"
    a: "九成是容器没拿到设备权限。Jellyfin 容器需要映射 /dev/dri 目录，并且把容器用户加入宿主机的 render 组（compose 里写 group_add: 加 render 组的 GID）。只映射设备不加入组，日志里会报 Permission denied，Jellyfin 会静默回退到软解，看起来就是「开了硬解但没用」。"
  - q: "硬解之后画质会变差吗？"
    a: "转码本身就会损失画质，硬解和软解的画质差异在正常码率下肉眼很难分辨。真正影响观感的是码率设置：Jellyfin 里转码码率给到 8-10Mbps 以上，1080p 基本看不出区别。只有极低码率（2Mbps 以下）时硬解的编码器会显得更糊一些。"
  - q: "用 PVE 或 LXC 装 Jellyfin，核显怎么给进去？"
    a: "LXC 最简单：在容器的配置里加两行 dev0: /dev/dri/renderD128 和 dev1: /dev/dri/card0，再把 render 组的 GID 映射进容器即可。虚拟机（KVM）要走 PCI 直通，需要开 IOMMU 并把核显从宿主机屏蔽，配置麻烦且容易把宿主显存搞挂，纯跑 Jellyfin 建议直接用 LXC。"
---

相册、外网、备份三块弄完，NAS 的「实用性」其实已经够了。但我还有一堆片子存在盘里，想让家里电视、平板、手机都能直接点开看——这就轮到 **Jellyfin**。

第一次装完是能播的，问题是**一播 4K 就废**：CPU 四核全满、风扇起飞、手机端转圈。原因很简单，转码全压在 CPU 上做软解了。N100 的核显本来就是干这个的，只是默认没启用。

这篇写清楚怎么把它调通，以及怎么确认「真的在硬解」而不是心理安慰。

## 一、先搞清楚 N100 能干什么

N100 是 Intel Alder Lake-N，核显 UHD Graphics（24EU）。它的媒体引擎能力是固定的，买之前先对一下表，别指望它干做不到的事：

| 格式 | 解码 | 编码 |
| --- | --- | --- |
| H.264 | ✅ | ✅ |
| HEVC 8bit | ✅ | ✅ |
| HEVC 10bit | ✅ | ✅ |
| VP9 | ✅ | ❌ |
| AV1 | ✅（仅解码） | ❌ |

结论：**日常片源（H.264/HEVC 的 1080p 和 4K）全部能硬解硬编，AV1 只能看不能转**。现在越来越多新片是 AV1 编码，这类片子在你的机器上只能「直接播放」（客户端支持 AV1 时）或者回退软解——这是硬件限制，不是配置问题。

4K 转码性能实测：同时 2 路 4K HEVC → 1080p H.264 转码，核显占用 60% 左右，CPU 基本空闲；第 3 路开始核显吃满但还能跑。

## 二、宿主机准备：先看设备在不在

SSH 上 NAS（或小主机），确认核显已经暴露出来：

```bash
ls -l /dev/dri
# 应该看到 card0 和 renderD128
```

如果目录不存在，说明核显没被识别——小主机通常是 BIOS 里把 iGPU 关了，或者 PVE 里没给 LXC/VM 配置。

安装验证工具，看一眼硬件到底支持哪些编解码：

```bash
# Debian/Ubuntu
apt install -y vainfo intel-gpu-tools
vainfo
```

`vainfo` 输出的 `VAProfileHEVCMain10`、`VAProfileAV1Profile0` 这些就是要看的。如果这里报错「can't connect to X server」或者驱动缺失，装一下 `intel-media-va-driver-non-free`。

顺手记下 render 组的 GID，下一步要用：

```bash
getent group render
# render:x:989:
```

## 三、容器配置：两个地方必须写对

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    restart: unless-stopped
    user: 1000:1000
    group_add:
      - "989"                      # 上面查到的 render 组 GID
    devices:
      - /dev/dri:/dev/dri          # 整个目录映射，比只映射 renderD128 更稳
    environment:
      - TZ=Asia/Shanghai
    ports:
      - "8096:8096"
    volumes:
      - /volume1/docker/jellyfin/config:/config
      - /volume1/docker/jellyfin/cache:/cache
      - /volume1/media:/media:ro
```

两个关键点：

1. **`devices` 映射 `/dev/dri` 整个目录**，不要只写 `renderD128`——有些版本还会用到 `card0`
2. **`group_add` 必须加 render 组的 GID**，这只是新手最容易漏的一步。漏了的话容器里访问 `/dev/dri/renderD128` 会 `Permission denied`，而 Jellyfin 不会报错，只会**静默回退软解**

起来之后进容器验证一下：

```bash
docker exec -it jellyfin ls -l /dev/dri
docker exec -it jellyfin id    # 确认组里有 989
```

## 四、Jellyfin 后台：这几个开关要勾对

控制台 → 播放 → 转码（Dashboard → Playback → Transcoding）：

| 项 | 填什么 |
| --- | --- |
| 硬件加速 | **VAAPI**（Intel 核显首选；QSV 也可，但 VAAPI 兼容性更好） |
| VA-API 设备 | `/dev/dri/renderD128` |
| 启用硬件解码 | 全部勾上（H.264 / HEVC / VP9 / AV1 / MPEG2） |
| 启用硬件编码 | 勾上 |
| 允许以 HEVC 编码 | 勾上（4K 转 4K 时码率更省；客户端不支持会自动回退 H.264） |
| 启用色调映射 | 勾上，算法选 **BT.2390**，勾 **VPP 色调映射** |
| 低电压解码 | 先**别勾**，见下面踩坑部分 |

色调映射是 HDR 片子在 SDR 屏幕上播放的关键。Intel 核显用 **VPP tone mapping**（硬件做），别用 OpenCL——OpenCL 在容器里经常找不到驱动，出来一片灰。

## 五、怎么确认真的在硬解

开了开关不等于生效。三个办法，任选其一：

**办法 1：看播放时的 CPU**

硬解生效时，转码 4K 的 CPU 占用一般在 10-20%；软解会直接 90-100% 并且持续。

**办法 2：看核显占用**

```bash
intel_gpu_top
```

播放时 Video/VideoEnhance 那一列有明显数值，就是在用核显。这个工具最直观，我一般挂着它看。

**办法 3：看 Jellyfin 日志**

播放时开一个终端跟日志：

```bash
docker logs -f jellyfin | grep -i vaapi
```

看到 `Initializing VAAPI on device '/dev/dri/renderD128'` 就对了。如果看到 `Failed to initialise VAAPI connection` 或 `Permission denied`，就是上面第三步的权限问题。

## 六、五个坑

**坑 1：开了硬解但 CPU 还是满**

99% 是容器权限。按第三节检查 `group_add` 和 `/dev/dri` 映射，然后看日志里的 VAAPI 初始化那一行。

**坑 2：HDR 片发灰、发白、偏色**

色调映射没生效。三个检查点：算法是不是 BT.2390、有没有勾 VPP tone mapping、宿主机有没有装 `intel-media-va-driver-non-free`。用 OpenCL 方案的话容器里还要额外给 `/dev/dri` 加 i915 权限，麻烦且不稳，直接换 VPP 省事。

**坑 3：某些片子绿屏、花屏、马赛克**

把「低电压解码」（low-power decoding）关掉试试。这个选项能省点功耗，但对部分 HEVC 片源兼容性差，社区里绿屏报告基本都和它有关。

**坑 4：字幕一开就转码，画质掉一档**

图形字幕（PGS/SUP，蓝光原盘常见）必须烧进画面，只能转码不能直通；文本字幕（SRT/ASS）可以直通。想让 ASS 特效字幕也直通，在客户端设置里打开「字幕直通」——但要客户端能自己渲染 ASS。

**坑 5：AV1 片源卡成幻灯片**

前面说过，N100 只能解 AV1 不能编。客户端支持 AV1 就直接播放（不转码，完全不耗 CPU）；客户端不支持就回退软解，卡是必然的。解决办法只有两个：换支持 AV1 的客户端，或者等服务端换机器。

## 七、功耗：硬解省的不只是 CPU

我这台 N100（16G 内存、双 2.5G 网口、一块 NVMe + 两块机械盘）实测：

| 状态 | 整机功耗 |
| --- | --- |
| 待机（硬盘休眠） | 7-8W |
| 硬解 4K（机械盘转着） | 13-16W |
| 软解 4K（CPU 满载） | 28-32W |

一部两小时电影，硬解比软解省 0.03 度电左右——省电不是重点，重点是**风扇不转、CPU 不烫、机器不吵**。放在客厅或弱电箱里，这一点比电费重要得多。

## 八、收尾

到现在这台 N100 干的活是：相册（Immich）、外网访问（Tailscale）、异地备份（restic）、影音中心（Jellyfin），待机功耗 7-8W，全年电费不到 ¥30。

下一步想写**硬件监控**——SMART 怎么配、硬盘快坏了怎么提前知道、以及为什么不建议在 NAS 上开 SMART 的自动短测试（会让硬盘一直转，反而费电）。这个坑我踩过，硬盘提前三个月就开始有重映射扇区，但没告警，等发现时已经晚了。
