---
title: NAS 备份的最后一环：用 restic 把数据加密送到异地
date: 2026-11-01 22:10:00
cover: /img/cover/cover-restic.jpg
description: RAID 只能防硬盘坏，防不了误删、勒索和整机失火。这篇写我怎么用 restic + 对象存储做异地备份：为什么选它而不是 rsync、腾讯云/Backblaze/R2 三家成本算清楚、初始化与保留策略、恢复演练怎么做，以及 prune 烧钱、密码丢失这两个真会要命的坑。
keywords: restic备份,NAS异地备份,restic rclone,S3备份,3-2-1备份原则,restic prune,对象存储备份,数据备份方案
tags:
  - restic
  - 备份
  - 异地备份
  - 对象存储
faq:
  - q: "我已经做了 RAID，还需要异地备份吗？"
    a: "需要。RAID 解决的是「某块硬盘坏了数据还在」，但它防不了三件事：误删（RAID 会忠实地把删除同步到所有盘）、勒索病毒（加密后的文件会覆盖原件）、以及整机损坏或失火被盗。行业里的 3-2-1 原则是：3 份数据、2 种介质、1 份异地。NAS 上的 RAID 算第 1 份，异地对象存储算最后那份保险。"
  - q: "restic 和 rsync、Syncthing 有什么区别？"
    a: "rsync 和 Syncthing 做的是「镜像同步」：源文件被删掉或被加密，目标端也会跟着删掉/加密，本质上只是多了一个实时副本，不是备份。restic 做的是「快照」：每次备份生成一个不可变的时间点，内容去重压缩加密，任何一次误删或勒索都能回滚到出事前的那个快照。"
  - q: "备份到对象存储一个月要花多少钱？"
    a: "以 500GB 数据为例：Backblaze B2 约 $3/月（约 ¥21），Cloudflare R2 约 $7.5/月（约 ¥53，但下行流量免费），阿里云 OSS 低频型约 ¥40/月。restic 有去重和压缩，实际占用通常比原始数据小 10-30%，增量备份只上传变化的块。"
  - q: "restic 的密码丢了会怎样？"
    a: "数据就永久打不开了，没有后门也没有找回途径——这是端到端加密的代价。密码必须存在至少两个与 NAS 物理隔离的地方，比如密码管理器 + 打印一份放抽屉。千万别只写在 NAS 上的某个 txt 里，那是把钥匙和保险柜放在一起。"
---

上一篇写外网访问时留了句话：**没有异地备份的 NAS，本质上只是一个更贵的单点故障**。这篇把它补上。

先说清楚一件事：RAID 不是备份。硬盘坏了数据还在，这确实解决了，但误删、勒索病毒、整机失火这三件事 RAID 一件都挡不住——删文件它同步删除，加密文件它同步加密，机器烧了盘也跟着烧。真正的备份要满足 3-2-1：三份数据、两种介质、一份在异地。

我这套是这么分的：

| 层 | 位置 | 防什么 |
| --- | --- | --- |
| 第 1 份 | NAS 上的 RAID 阵列 | 单盘故障 |
| 第 2 份 | NAS 上的 Btrfs 快照 | 误删、误改（本地回滚，秒级） |
| 第 3 份 | 异地对象存储（restic 加密快照） | 整机损毁、勒索、火灾盗窃 |

三层里最容易偷懒的是第 3 层，也是最不能省的。下面写怎么落地。

## 一、为什么选 restic

能备份到云端的工具不少，我最后选 restic，是因为它同时满足四件事：

- **快照而不是镜像**：每次备份是一个不可变时间点，回滚到什么时间由你挑
- **内容去重**：同一份文件在 30 个快照里只存一次，改了一个大文件也只传变化的块
- **端到端加密**：上传前就在本地加密，云端服务商看到的是一堆乱码
- **后端无关**：S3、B2、R2、SFTP、WebDAV 都行，想换存储商不用重做备份

对照一下常见的替代方案：

| 工具 | 本质 | 能不能防勒索/误删 |
| --- | --- | --- |
| rsync 定时同步 | 镜像 | ❌ 源删目标也删 |
| Syncthing | 实时镜像 | ❌ 同上，还会把一个盘的损坏扩散到所有设备 |
| 云盘同步（坚果云/OneDrive） | 镜像 + 服务商版本历史 | ⚠️ 有限，版本历史通常只保留 30 天 |
| **restic** | 加密快照 | ✅ 快照不可变，可任意回滚 |

## 二、存储选哪家：先把成本算清

restic 支持 S3 协议，所以能直接连的对象存储都能用。以 500GB 数据算（restic 去重压缩后实际占用通常 350-450GB）：

| 服务 | 单价 | 500GB/月 | 下行流量 | 备注 |
| --- | --- | --- | --- | --- |
| Backblaze B2 | $6/TB/月 | ≈ $3（¥21） | 免费（≤3×存储量） | 最便宜，恢复时下载不花钱 |
| Cloudflare R2 | $0.015/GB/月 | ≈ $7.5（¥53） | 免费 | 无出网费，和 CF 生态一致 |
| 阿里云 OSS 低频 | ¥0.08/GB/月 | ≈ ¥40 | ¥0.5/GB | 国内速度快，恢复时要付流量费 |
| 腾讯云 COS 低频 | ¥0.08/GB/月 | ≈ ¥40 | ¥0.5/GB | 同上 |

我选的是 **B2**：单纯因为便宜，而且恢复时下行免费——出事那天你不想还要先充一笔流量费才能把数据拿回来。国内数据量大的话 OSS/COS 速度更好，但记得把「恢复成本」算进去：500GB 拉回来要 ¥250 流量费。

**别用网盘（115、百度）当 restic 后端**，那些不是标准 S3，只能用 rclone 中转，prune 时的海量小请求会让同步慢到不可用。

## 三、初始化仓库

在 NAS 上用 Docker 跑 restic，比在宿主机装省事：

```yaml
services:
  restic:
    image: restic/restic:latest
    container_name: restic
    environment:
      - RESTIC_REPOSITORY=s3:https://s3.us-west-002.backblazeb2.com/your-bucket/restic
      - RESTIC_PASSWORD_FILE=/run/secrets/restic-pass
      - AWS_ACCESS_KEY_ID=xxxxxxxx
      - AWS_SECRET_ACCESS_KEY=xxxxxxxx
      # R2 用下面这行替代上面的 endpoint
      # - AWS_DEFAULT_REGION=auto
    volumes:
      - /run/secrets/restic-pass:/run/secrets/restic-pass:ro
      - /volume1/photos:/data/photos:ro
      - /volume1/docker/restic-cache:/root/.cache/restic
    entrypoint: ["/bin/sh", "-c"]
    command: ["restic snapshots || restic init"]
```

密钥别写进 compose，用 Docker secret 或者 `.env` 文件加权限 600。初始化只要成功一次，之后仓库就存在云端了。

```bash
docker compose run --rm restic init   # 第一次执行
docker compose run --rm restic snapshots  # 验证能连上
```

## 四、第一次备份：排除规则比速度重要

第一次全量传 500GB，家宽上行 30Mbps 的话大概要 1-2 天。别急着跑，先把不该备份的东西排掉：

```bash
restic backup /data/photos \
  --exclude-caches \
  --exclude='*.tmp' \
  --exclude='@eaDir' \
  --exclude='#recycle' \
  --exclude='*.iso' \
  --limit-upload 25000 \
  --verbose
```

几个细节：

- `@eaDir`、`#recycle` 是群晖的缩略图缓存和回收站，占了相册目录的大量空间，备份它们纯属浪费流量
- `--limit-upload 25000` 限速 25Mbps，避免把家里上行打满导致视频会议卡住
- 第一次跑建议挂 `screen` 或 `tmux`，断开 SSH 也不会中断

## 五、保留策略：留多少、什么时候清

restic 不会自动删旧快照，要自己定策略。我用的是：

```bash
restic forget \
  --keep-daily 7 --keep-weekly 4 \
  --keep-monthly 12 --keep-yearly 3 \
  --prune
```

意思是：保留最近 7 天每天一份、最近 4 周每周一份、最近 12 个月每月一份、每年一份。实际下来大概 30-40 个快照，占用不会失控。

**`--prune` 是重点也是坑**：它会重写云端数据包，请求量很大，B2/R2 按请求计费，一次 prune 可能产生几十万次小请求。我的做法是**每天 forget 但不 prune，每月 1 号才 prune 一次**：

```bash
# 每天
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12
# 每月 1 号
restic prune --max-unused 5%
```

## 六、自动化：定时 + 失败告警

用 systemd timer 或者 NAS 自带的任务计划都行。关键是**失败必须有人知道**——静默失败的备份等于没备份。

```bash
#!/bin/bash
set -euo pipefail
restic backup /data/photos --exclude-caches --exclude='@eaDir' --limit-upload 25000
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12
curl -fsS -m 10 --retry 3 "https://hc-ping.com/your-uuid"
```

最后那行是 healthchecks.io 的心跳：备份成功才 ping 一次，超过设定时间没收到就发邮件告警。免费额度够个人用，比自建监控省事。

## 七、恢复演练：不演练的备份不算备份

**这一步 90% 的人都跳过，然后真出事那天才发现备份是空的。** 每季度做一次：

```bash
# 1. 看有哪些快照
restic snapshots

# 2. 恢复到临时目录（别恢复回原目录！）
restic restore latest --target /tmp/restore-test --include /data/photos/2026

# 3. 抽查文件能不能打开
ls -lh /tmp/restore-test/data/photos/2026 | head
```

还可以直接挂载浏览，像看网盘一样翻快照里的文件：

```bash
restic mount /mnt/restic
ls /mnt/restic/snapshots/2026-11-01T14:00:00Z/data/photos
fusermount -u /mnt/restic
```

恢复速度要有心理准备：从 B2 拉回 500GB，家宽下行 300Mbps 大约 4-5 小时，别指望像本地复制一样快。

## 八、四个真会要命的坑

**坑 1：密码丢了，数据永久报废**

restic 没有后门、没有找回途径。密码必须在**与 NAS 物理隔离**的两个地方：密码管理器里一份，打印一张纸放抽屉里一份。写在 NAS 上的 txt 里等于把钥匙和保险箱放一起。

**坑 2：`stale lock` 卡住后续备份**

备份进程被 kill 或机器断电后，仓库里会留下锁文件，后续操作全报 `repository is already locked`。确认没有进程在跑之后解锁：

```bash
restic unlock          # 清掉残留锁
restic unlock --remove-all   # 锁特别顽固时
```

**坑 3：大文件导致内存爆掉**

restic 读大文件时会占内存，4GB 内存的小机器备份几十 GB 的虚拟机镜像可能 OOM。给容器加限制没用，得开 `--read-concurrency 1`，或者把大镜像单独排除、用别的工具处理。

**坑 4：以为备份了，其实只备份了空目录**

挂载点没挂上、路径写错、权限不足（容器里 root 读不到 SMB 挂载的目录），restic 都会「成功」备份一个空快照。所以**第一次跑完一定要 `restic stats` 看一眼实际大小**：

```bash
restic stats --mode raw-data
```

数字和你的目录对不上就是没备份上，别等出事。

## 九、这套方案的账单

500GB 数据，B2 存储约 ¥21/月，prune 请求费忽略不计，一年 ¥250 左右。

一年 ¥250 买的是：硬盘烧了、房子漏水、笔记本丢了、手贱删了相册，这四种情况都能一键回到昨天的状态。我实在想不出还有什么地方能花 ¥250 买到这个。

下一步想写 **Jellyfin 硬解**——相册、外网、备份三块齐了，剩下就是把这台机器当影音中心用起来，顺便看看 N100 的核显到底能省多少电。
