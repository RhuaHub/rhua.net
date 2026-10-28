---
title: 把 NAS 变成私人相册：Immich 部署实录（含手机自动备份）
date: 2026-10-28 21:40:00
cover: /img/cover/cover-immich.png
description: 用 Docker Compose 在 NAS 上跑 Immich，替代 iCloud / 谷歌相册：四个容器各管什么、照片目录怎么放、手机自动备份怎么开、人脸识别为什么吃 CPU，以及我踩到的三个坑（数据库版本、权限、缩略图缓存）。
keywords: Immich部署,NAS相册,Docker私有相册,Immich docker-compose,手机照片自动备份,自建相册,pvеctorch,immich坑
tags:
  - Immich
  - Docker
  - 相册
  - 自托管
faq:
  - q: "Immich 和群晖 Photos / 极空间相册比，值得折腾吗？"
    a: "看你想要什么。成品相册开箱即用、和厂商 App 绑定；Immich 的好处是数据完全在自己手上、支持多端（iOS/Android/网页）、人脸识别和地图都在本地跑，并且可以随时迁走。代价是要自己维护容器和数据库，升级前要读 release notes。如果你只想备份照片不想管运维，用厂商自带相册更省事。"
  - q: "Immich 需要多强的机器？"
    a: "跑起来不难：4 核 CPU + 4GB 内存就能用，但人脸识别和缩略图生成很吃 CPU，第一次全量扫描时机器会长时间满载。有 Intel 核显（7 代以上）的机器建议开启硬件转码，缩略图生成会快很多。照片库超过 5 万张时，建议内存 8GB 起，数据库单独放 SSD 上会明显更顺。"
  - q: "照片原始文件存在哪？可以直接用文件管理器看吗？"
    a: "可以。Immich 把上传的原始文件按 用户ID/年/月 存在 UPLOAD_LOCATION 目录下，文件名会保留原始名字，用 SMB 或文件管理器能直接看到。但不要手动改这些文件——数据库里记录了路径和哈希，手动移动会导致相册里出现「文件缺失」。要整理照片，走 Immich 自己的相册和标签功能。"
  - q: "升级 Immich 会不会丢数据？"
    a: "正常升级不会，但有两件事必须做：一是升级前备份 PostgreSQL 数据库（docker exec 导出 dump），二是注意版本跨度——跨大版本升级要按官方 release notes 逐个大版本走，不能跳过。我踩的坑就是直接从旧版跳到新版，数据库迁移脚本要求中间版本，容器起不来。"
---

用手机拍了十年照片，最后都会面临同一个选择：继续交云存储月费，还是自己存。我选了后者，工具是 **Immich**——一个开源的自托管相册，功能上已经能顶替 iCloud 照片和谷歌相册，人脸识别、地图、共享相册全在本地跑。

这篇记录我在 NAS 上把它跑起来的完整过程，包括目录怎么规划、四个容器各管什么、手机怎么自动备份，以及我踩到的三个坑。

## 它能替代什么，不能替代什么

先说清楚边界，免得白折腾：

**能替代的**：照片/视频自动备份、按时间线浏览、人脸和物体识别、地图视图、相册分享链接、多用户。

**替代不了的**：它没有"释放手机空间"那种和系统深度绑定的功能（iOS 上只能靠 App 自己删）、也没有云端的容灾——你的 NAS 挂了照片就没了，所以**异地备份必须另外做**（后面会写一篇）。

## 一、先定目录，再动手

装之前先想清楚照片放哪。我的约定是三条：

```
/volume1/docker/immich/          # 容器配置、数据库
  ├── library/                   # 照片原始文件（重要，独立备份）
  └── postgres/                  # 数据库数据（重要，独立备份）

/volume1/photos/immich-upload/   # 上传暂存（大，可以不备份）
```

关键点：**library 和 postgres 必须分开备份**，并且 library 最好单独挂一块盘或一个存储池——将来迁移机器，把这块盘拔下来插到新机器就能接着用。

> 别把 library 放在 Docker 的默认数据目录里。Docker 目录一旦损坏或被误删（我干过一次），照片和配置一起没。

## 二、docker-compose.yml

Immich 需要四个容器：`immich-server`（主服务）、`immich-machine-learning`（识别模型）、`postgres`（数据库）、`redis`（缓存）。官方 compose 文件很长，这里是我精简后的版本，只保留必须项：

```yaml
services:
  immich-server:
    container_name: immich_server
    image: ghcr.io/immich-app/immich-server:release
    volumes:
      - /volume1/photos/immich-upload:/usr/src/app/upload
      - /etc/localtime:/etc/localtime:ro
    env_file:
      - .env
    ports:
      - "2283:2283"
    depends_on:
      - redis
      - database
    restart: always

  immich-machine-learning:
    container_name: immich_machine_learning
    image: ghcr.io/immich-app/immich-machine-learning:release
    volumes:
      - model-cache:/cache
    env_file:
      - .env
    restart: always

  redis:
    container_name: immich_redis
    image: docker.io/redis:6.2-alpine
    healthcheck:
      test: redis-cli ping || exit 1
    restart: always

  database:
    container_name: immich_postgres
    image: ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_DB: ${DB_DATABASE_NAME}
      POSTGRES_INITDB_ARGS: '--data-checksums'
    volumes:
      - /volume1/docker/immich/postgres:/var/lib/postgresql/data
    restart: always

volumes:
  model-cache:
```

`.env` 里至少要改这三个：

```bash
UPLOAD_LOCATION=/volume1/photos/immich-upload
DB_PASSWORD=换成一个长密码
DB_DATA_LOCATION=/volume1/docker/immich/postgres
```

然后 `docker compose up -d`，等两分钟，浏览器开 `http://NAS的IP:2283` 就能看到注册页——**第一个注册的账号自动成为管理员**，所以装完立刻注册，别放着。

## 三、手机自动备份

这是整个方案的核心价值，配置只要三步：

1. 手机装 Immich App，服务器地址填 `http://内网IP:2283`（外网访问后面用 Tailscale 解决，别直接把 2283 映射到公网）
2. 登录后进「备份」→ 选择要备份的相册 → 打开「自动备份」
3. **重要**：打开「仅在前台备份」和「充电时备份」，否则夜间会一直占用手机资源

备份走的策略是「增量 + 去重」：同一张照片重复上传只存一份（按文件哈希判断）。我 3 万多张照片全量传完用了两个晚上，之后每天新增几十张，几乎无感。

## 四、三个我踩过的坑

**坑 1：跳过版本升级，容器起不来**

看到新版本就直接 `docker compose pull` 拉到最新，结果数据库迁移失败，日志里写着要求先升到某个中间版本。教训：**跨大版本必须逐个走**。升级前先 dump 数据库：

```bash
docker exec -t immich_postgres pg_dumpall --clean --if-exists \
  --username=postgres > backup-$(date +%F).sql
```

**坑 2：权限不对，上传报错**

NAS 上 Docker 容器的运行用户和共享文件夹权限经常对不上，表现是上传到一半报 `EACCES`。解决：确认 `UPLOAD_LOCATION` 目录对容器内用户（默认 1000:1000）可写。群晖上可以在「控制面板 → 共享文件夹 → 权限」里给 Docker 用户组读写，或者直接：

```bash
chown -R 1000:1000 /volume1/photos/immich-upload
```

**坑 3：人脸识别把机器跑满**

第一次全量扫描时，`immich-machine-learning` 会把人脸检测、CLIP 向量全跑一遍，四核机器能满载好几个小时。这不是卡死，是正常现象。缓解办法：

- 限制这个容器的 CPU（compose 里加 `cpus: 2`），别让它抢走相册服务本身
- 把扫描安排到夜里，扫完就歇
- 有 Intel 核显的话，在 `.env` 里打开硬件加速（`IMMICH_MACHINE_LEARNING_*` 相关变量按官方文档配），快不止一倍

## 五、装完之后

这套东西跑起来以后，我实际用了一周，感受是：**它不像"自建网盘"，更像一个正常的相册 App**。时间线滚动流畅，人脸分组准确率不低，分享链接发给家人能直接在浏览器里看。

但有两个前提必须提醒：**一是异地备份要另做**（NAS 单点故障等于把所有照片押在一块盘上），**二是外网访问别用端口映射**——用 Tailscale 之类组网，既不用暴露端口也不用备案。

下一篇写外网访问这部分。如果你在自己机器上装的时候卡在某一步，邮件告诉我，我把具体报错补进这篇文章。
