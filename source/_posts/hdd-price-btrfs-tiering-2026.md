---
title: 硬盘涨价先别买：用 btrfs 压缩 + 冷数据分层，把现有 NAS 空间榨出来
date: 2026-11-09 21:10:00
cover: /img/cover/cover-btrfs.jpg
description: 涨价周期里先别急着加盘：用 compsize 量一下现有数据到底能压多少，再把半年没动过的冷数据挪到外接盘。附 fstab 压缩参数、defrag 与快照共享块冲突的风险、rsync 先 dry-run 的分层流程，以及哪些数据压了也是白费电。
keywords: 硬盘涨价,btrfs 压缩,zstd,compsize,NAS 扩容,冷数据分层,rsync,存储涨价
tags:
  - 存储涨价
  - 硬盘
  - 扩容
  - 备份
faq:
  - q: "btrfs 压缩对电影和已压缩文件有用吗？"
    a: "基本没用。4K 原盘、FLAC、zip、已编码的监控录像本身已经压过，再压只会白耗 CPU 和 IO。真正有收益的是文档、日志、代码、RAW 照片、未压缩的镜像。动手前先用 compsize 看占比，别凭感觉全卷跑一遍。"
  - q: "挂载参数加了 compress=zstd:3，老文件会自动变小吗？"
    a: "不会。挂载压缩只对新写入的数据生效，已有文件需要单独做 defrag 重压缩；而 defrag 会打断快照和重删之间的共享块，快照多的卷可能反而更占空间，必须先确认有足够空闲容量再按目录分批做。"
  - q: "把冷数据挪到外接盘算备份吗？"
    a: "不算。外接盘和 NAS 在同一个屋里、同一个电源上，断电、误删、被盗会一起没。它只是把主盘空间腾出来的分层手段，重要数据的异地副本仍要单独做，例如用 restic 加密送出。"
---

> 环境说明：以下以 Debian/OMV + btrfs 挂载点 `/mnt/data` 为例。压缩收益和快照影响因盘上数据类型而异，动手前先备份、用 `compsize` 量一遍；`defrag` 与快照共享块的处理请按自己卷的空闲容量分批做。

## 先说结论

硬盘涨价周期里，第一反应不该是「再买一块」，而是先确认现有盘还有多少空间是被浪费的：

- **btrfs 透明压缩**对文档、日志、代码、RAW 照片、未压缩的镜像有收益；对电影、音乐、压缩包、已编码的监控录像基本没用。
- **冷数据分层**把半年没动过的东西挪到便宜的外接盘或旧盘上，比扩容更快、也更省现金。
- 两件事都不需要新盘，但**都要先备份**。压缩和搬移不是备份，异地副本仍然要有。

一句话：先量，再压，最后分层。别凭感觉。

## 环境边界

| 项目 | 本文前提 |
| --- | --- |
| 文件系统 | btrfs（ext4 / ZFS / 群晖 btrfs 的 UI 路径不同，命令不通用） |
| 系统 | Debian 12 / OMV 一类可直接改 fstab 的 Linux |
| 挂载点 | `/mnt/data`，下文全部按此写 |
| 不动的目录 | 数据库、虚拟机镜像、Docker overlay2、已有大量快照的卷 |
| 记录日期 | 2026-11，工具参数随内核版本变化，以本机 `man` 为准 |

群晖、飞牛、Unraid 请在自己的图形界面里找对应的「压缩 / 共享文件夹压缩」开关，别照抄 fstab。

## 步骤

### 0. 备份 + 摸清现状

```bash
df -hT /mnt/data
lsblk -f
sudo btrfs filesystem df /mnt/data
sudo btrfs subvolume list /mnt/data | head
```

最后一条如果输出一大堆快照，说明这个卷的共享块很多——第 3 步的 defrag 要谨慎，先读完下面的风险提示。

### 1. 先量收益，不要先动手

```bash
sudo apt install btrfs-compsize   # 部分发行版包名是 compsize，用 apt search compsize 确认
sudo compsize /mnt/data
```

`compsize` 会给出各压缩类型的占比和整体节省比例。**如果结果显示绝大部分数据已是「none / 不可压缩」，就别折腾压缩了**，直接跳到第 4 步做分层——这一步能省下几个小时的无用 defrag。

### 2. 打开挂载压缩，并持久化

先临时生效：

```bash
sudo mount -o remount,compress=zstd:3 /mnt/data
findmnt -no OPTIONS /mnt/data | tr ',' '\n' | grep compress
```

确认生效后写进 `/etc/fstab`，否则重启就丢：

```text
UUID=你的UUID  /mnt/data  btrfs  defaults,compress=zstd:3  0  2
```

`zstd:3` 是压缩率与 CPU 的折中；N100 这类低功耗 U 上别往 `zstd:9` 调，写入会被 CPU 卡住。改完用 `sudo mount -o remount /mnt/data` 或重启验证，别只改文件不生效。

> 注意：挂载压缩**只对之后写入的数据生效**，已有的老文件不会自动变小。

### 3. 老数据重压缩（风险最高的一步）

```bash
sudo btrfs filesystem defrag -r -czstd /mnt/data/文档 /mnt/data/照片
```

按目录分批做，别一上来对整个卷跑。三个必须知道的风险：

- defrag 会**打断快照和重删之间的共享块**，快照多的卷可能反而更占空间；
- 重压缩期间需要额外的临时空间，空闲容量太低时不要跑；
- 只对「可压缩」的目录做，电影、音乐、备份归档目录跳过。

跑完再用 `compsize` 对比一次，把真实节省比例记下来，再决定要不要把压缩范围扩到别的目录。

### 4. 冷数据分层到外接盘

先手动分出冷目录（按你的实际习惯，例如一年没动过的归档），再用 rsync 定期同步到外接 USB 盘或旧盘：

```bash
sudo mkdir -p /mnt/usb-archive/cold
sudo rsync -a --dry-run --info=stats /mnt/data/cold/ /mnt/usb-archive/cold/
```

**先跑 `--dry-run`**，确认源和目标没写反、没有意外的 `--delete`，再去掉 `--dry-run` 正式执行。稳定后挂定时任务：

```bash
0 3 * * 1 /usr/bin/rsync -a --info=stats /mnt/data/cold/ /mnt/usb-archive/cold/ >> /var/log/cold-tier.log 2>&1
```

我倾向于**不加 `--delete`**：外接盘上保留一份历史，误删时还有得救。分层只是把冷数据挪出主盘，主盘腾出来之后，请确认重要数据在别处仍有副本，再删主盘原件。

### 5. 验证

```bash
df -h /mnt/data
sudo compsize /mnt/data
sudo btrfs filesystem df /mnt/data
cat /var/log/cold-tier.log | tail -20
```

对比第 1 步的基线，写出「压了多少、挪了多少、主盘多出多少可用空间」三个数，再决定要不要买新盘。

## 踩过的坑

1. **把压缩当去重**：btrfs 压缩不解决重复文件；同一份电影存三份，压缩后还是三份。
2. **对已压缩媒体白费电**：4K 原盘、FLAC、zip 基本零收益，defrag 只会白耗 IO 并打散共享块。
3. **快照卷上跑 defrag**：空间不降反升，先看第 0 步的 subvolume 列表。
4. **fstab 改了没 remount**：以为开了压缩，实际只有新挂载后才生效。
5. **外接盘当备份**：USB 盘和主盘在同一个屋里、同一个电源上，断电、被盗一起没。它只是分层，异地副本另算。

## 关联阅读

- [NAS 价格档位怎么分：钱花在哪一档才不亏](/2026/10/nas-price-tiers-2026/)
- [存储涨价：现在该不该囤盘](/2026/10/nas-storage-price-surge-2026/)
- [硬盘怎么选：CMR、SMR 与容量节奏](/2026/10/nas-hdd-2026/)
- [NAS 异地备份：restic 那套怎么接](/2026/11/nas-offsite-backup-restic-2026/)

## 边界

以上只适用于能直接改 fstab 的 Linux + btrfs 场景，不含群晖/飞牛图形界面、ZFS、Unraid 阵列，也不含快照与增量备份策略设计。`compsize` 输出、defrag 对快照的影响都与内核版本和数据构成相关，请在你自己的盘上量过再下结论。本文记录于 2026-11 的价格环境，价格结论会过期，方法不会。
