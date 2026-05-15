<div align="center" width="100%">
    <img src="./public/icon.svg" width="128" alt="Uptime Kuma Logo" />
</div>

# Uptime Kuma · 人间地狱定制版 / HLL Custom Build

> 基于 [Uptime Kuma](https://github.com/louislam/uptime-kuma) 的私有 fork，为《人间地狱》(Hell Let Loose, HLL) 服务器运维场景新增了一个自定义监控类型 **HLL RCON**。除以下增量内容外，其余功能与上游一致，请参考上游文档。
>
> A private fork of [Uptime Kuma](https://github.com/louislam/uptime-kuma) with one extra monitor type — **HLL RCON** — for Hell Let Loose game-server operations. Everything else behaves like upstream; refer to upstream docs for non-HLL features.

[English](#english) · [简体中文](#简体中文)

---

<a id="简体中文"></a>

## 简体中文

### 与上游的差异 / 增量

仅新增了一个监控类型，其它部分均未改动：

- **HLL RCON 监控**：通过 RCONv2 协议直接连接 HLL 服务器，读取在线玩家数，并在「人数过低」或「短时间大量退出」时触发 DOWN 告警。
- 配套改动：
  - 后端：`server/monitor-types/hll-rcon.js`（自实现 RCONv2 客户端 + 监控逻辑）、注册到 `server/uptime-kuma-server.js`、在 `server/model/monitor.js` 与 `server/server.js` 中暴露/持久化字段。
  - 数据库：`db/knex_migrations/2026-05-15-0000-add-hll-rcon-monitor.js`（新增 6 列）。
  - 前端：`src/pages/EditMonitor.vue` 新增类型选项与表单、`src/util.{js,ts}` 新增 URL 字段映射。
  - 多语言：`src/lang/en.json`、`src/lang/zh-CN.json` 新增字符串。

### HLL RCON 监控配置项

新建监控时，在 **「监控项类型 → Game Server」** 中选择 **Hell Let Loose RCON**。

| 字段 | 说明 |
| --- | --- |
| Hostname | HLL 服务器 IP / 域名 |
| Port | RCONv2 TCP 端口 |
| RCON Password | RCONv2 密码（敏感字段） |
| 启用「人数过低」告警 | 开关。开启后下方「最低在线人数」生效 |
| 最低在线人数 | 当前在线人数 < 此阈值即触发 DOWN |
| 启用「短时间大量退出」告警 | 开关。开启后下方两项生效 |
| 下降阈值（玩家数） | 在时间窗口内累计下降 ≥ 此阈值即触发 DOWN |
| 时间窗口（秒） | 滑动窗口长度 |

判定规则：每次心跳通过 RCONv2 拉取 `players` 列表，得到当前 `playerCount`；维护一个滑动窗口，窗口内**最大值 − 当前值**视为本窗口内的累计下降量。两个开关独立判定，**任一命中即 DOWN**。

> ⚠️ 滑动窗口状态仅保存在内存中（监控实例 `_hllPlayerHistory`），重启 Uptime Kuma 或编辑保存监控会清空，与其他有状态监控类型行为一致。

### 协议说明

RCONv2 实现完全自包含，没有引入额外依赖：

- 12 字节小端报头：`magic(0xDE450508) | requestId | contentLength`
- `ServerConnect` 取得 Base64 编码的 XOR 密钥；后续所有请求体都使用该密钥按字节循环 XOR
- `Login` 使用密码作为 `contentBody` 取得 `authToken`
- `GetServerInformation` 携带 `{"Name":"players","Value":""}` 取得在线玩家数组

详见 `server/monitor-types/hll-rcon.js`。协议规范来源于本仓库外的 [`doc/rconv2.md`](../doc/rconv2.md) 与 [`doc/connection.py`](../doc/connection.py)（HLL 项目根目录）。

### 安装与运行

与上游 Uptime Kuma 完全一致，仅需注意首次启动时会自动执行新加的数据库迁移。

```bash
git clone https://github.com/cn-maomao/uptime-kuma.git
cd uptime-kuma
npm run setup
node server/server.js
# 或使用 PM2：pm2 start server/server.js --name uptime-kuma
```

Docker 部署、反向代理、升级流程等均参考上游文档：<https://github.com/louislam/uptime-kuma/wiki>。

### 注意事项

- 本仓库**不**应当作为 PR 提交回上游 louislam/uptime-kuma；上游 `AGENTS.md` 明确禁止此类带有 AI 辅助生成代码的功能性 PR。
- 仅供 HLL RCON 学习交流部署使用。

---

<a id="english"></a>

## English

### Diff vs Upstream

Only one monitor type is added; nothing else is changed:

- **HLL RCON monitor**: connects to a Hell Let Loose server over RCONv2, reads the live player list, and raises DOWN when player count is too low or when too many players leave within a time window.
- Touched files:
  - Backend: `server/monitor-types/hll-rcon.js` (self-contained RCONv2 client + monitor), registration in `server/uptime-kuma-server.js`, persistence in `server/model/monitor.js` and `server/server.js`.
  - Database: `db/knex_migrations/2026-05-15-0000-add-hll-rcon-monitor.js` (6 new columns).
  - Frontend: `src/pages/EditMonitor.vue` (option + form), `src/util.{js,ts}` (URL field mapping).
  - i18n: strings added to `src/lang/en.json` and `src/lang/zh-CN.json`.

### HLL RCON monitor settings

When creating a monitor, pick **Monitor Type → Game Server → Hell Let Loose RCON**.

| Field | Description |
| --- | --- |
| Hostname | HLL server IP / domain |
| Port | RCONv2 TCP port |
| RCON Password | RCONv2 password (sensitive) |
| Alert on low player count | Enables the threshold below |
| Minimum players | DOWN when current player count is below this value |
| Alert on rapid player exits | Enables the two settings below |
| Drop threshold (players) | DOWN when cumulative drop within the window meets this |
| Time window (seconds) | Sliding-window length |

Algorithm: each heartbeat fetches the `players` list via RCONv2 and records the count in a per-monitor sliding window. The drop is computed as **max(window) − current**. The two switches are evaluated independently; **either match triggers DOWN**.

> ⚠️ The sliding-window history lives in memory on the monitor instance (`_hllPlayerHistory`). It resets on restart or when the monitor is saved, matching the behaviour of other stateful monitor types.

### Protocol notes

The RCONv2 implementation is fully self-contained, no extra runtime dependencies:

- 12-byte little-endian header: `magic(0xDE450508) | requestId | contentLength`
- `ServerConnect` returns a Base64-encoded XOR key; all subsequent payloads are XOR-encrypted byte-by-byte against it
- `Login` sends the password as `contentBody` and returns an `authToken`
- `GetServerInformation` with `{"Name":"players","Value":""}` returns the live roster

See `server/monitor-types/hll-rcon.js`. Protocol reference lives in the parent project at `doc/rconv2.md` and `doc/connection.py`.

### Install & run

Same as upstream Uptime Kuma. The new DB migration runs automatically on first start.

```bash
git clone <this-repo>
cd uptime-kuma
npm run setup
node server/server.js
# or with PM2: pm2 start server/server.js --name uptime-kuma
```

Docker, reverse-proxy, and upgrade instructions: <https://github.com/louislam/uptime-kuma/wiki>.

### Caveats

- **Do not submit this fork as a PR to upstream `louislam/uptime-kuma`.** Upstream `AGENTS.md` explicitly forbids feature PRs containing AI-assisted code; doing so puts your GitHub account at risk.
- Intended strictly for internal HLL ops deployment.

---

## Upstream Uptime Kuma — Reference

Below is the unmodified upstream description, kept for reference.

Uptime Kuma is an easy-to-use self-hosted monitoring tool.

<a target="_blank" href="https://github.com/louislam/uptime-kuma"><img src="https://img.shields.io/github/stars/louislam/uptime-kuma?style=flat" /></a> <a target="_blank" href="https://hub.docker.com/r/louislam/uptime-kuma"><img src="https://img.shields.io/docker/pulls/louislam/uptime-kuma" /></a> <a target="_blank" href="https://hub.docker.com/r/louislam/uptime-kuma"><img src="https://img.shields.io/docker/v/louislam/uptime-kuma/2?label=docker%20image%20ver." /></a> <a target="_blank" href="https://github.com/louislam/uptime-kuma"><img src="https://img.shields.io/github/last-commit/louislam/uptime-kuma" /></a> <a target="_blank" href="https://opencollective.com/uptime-kuma"><img src="https://opencollective.com/uptime-kuma/total/badge.svg?label=Open%20Collective%20Backers&color=brightgreen" /></a>
[![GitHub Sponsors](https://img.shields.io/github/sponsors/louislam?label=GitHub%20Sponsors)](https://github.com/sponsors/louislam) <a href="https://weblate.kuma.pet/projects/uptime-kuma/uptime-kuma/">
<img src="https://weblate.kuma.pet/widgets/uptime-kuma/-/svg-badge.svg" alt="Translation status" />
</a>

<img src="https://user-images.githubusercontent.com/1336778/212262296-e6205815-ad62-488c-83ec-a5b0d0689f7c.jpg" width="700" alt="Uptime Kuma Dashboard Screenshot" />

## 🥔 Live Demo

Try it!

Demo Server (Location: Frankfurt - Germany): <https://demo.kuma.pet/start-demo>

It is a temporary live demo, all data will be deleted after 10 minutes. Sponsored by [Uptime Kuma Sponsors](https://github.com/louislam/uptime-kuma#%EF%B8%8F-sponsors).

## ⭐ Features

- Monitoring uptime for HTTP(s) / TCP / HTTP(s) Keyword / HTTP(s) Json Query / Websocket / Ping / DNS Record / Push / Steam Game Server / **Hell Let Loose RCON (this fork)** / Docker Containers
- Fancy, Reactive, Fast UI/UX
- Notifications via Telegram, Discord, Gotify, Slack, Pushover, Email (SMTP), and [90+ notification services, click here for the full list](https://github.com/louislam/uptime-kuma/tree/master/src/components/notifications)
- 20-second intervals
- [Multi Languages](https://github.com/louislam/uptime-kuma/tree/master/src/lang)
- Multiple status pages
- Map status pages to specific domains
- Ping chart
- Certificate info
- Proxy support
- 2FA support

## 🔧 How to Install

### 🐳 Docker Compose

```bash
mkdir uptime-kuma
cd uptime-kuma
curl -o compose.yaml https://raw.githubusercontent.com/louislam/uptime-kuma/master/compose.yaml
docker compose up -d
```

Uptime Kuma is now running on all network interfaces (e.g. http://localhost:3001 or http://your-ip:3001).

> [!WARNING]
> File Systems like **NFS** (Network File System) are **NOT** supported. Please map to a local directory or volume.

### 🐳 Docker Command

```bash
docker run -d --restart=always -p 3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:2
```

Uptime Kuma is now running on all network interfaces (e.g. http://localhost:3001 or http://your-ip:3001).

If you want to limit exposure to localhost only:

```bash
docker run ... -p 127.0.0.1:3001:3001 ...
```

### 💪🏻 Non-Docker

Requirements:

- Platform
  - ✅ Major Linux distros such as Debian, Ubuntu, Fedora and ArchLinux etc.
  - ✅ Windows 10 (x64), Windows Server 2012 R2 (x64) or higher
  - ❌ FreeBSD / OpenBSD / NetBSD
  - ❌ Replit / Heroku
- [Node.js](https://nodejs.org/en/download/) >= 20.4
- [Git](https://git-scm.com/downloads)
- [pm2](https://pm2.keymetrics.io/) - For running Uptime Kuma in the background

```bash
git clone https://github.com/louislam/uptime-kuma.git
cd uptime-kuma
npm run setup

# Option 1. Try it
node server/server.js

# (Recommended) Option 2. Run in the background using PM2
# Install PM2 if you don't have it:
npm install pm2 -g && pm2 install pm2-logrotate

# Start Server
pm2 start server/server.js --name uptime-kuma
```

Uptime Kuma is now running on all network interfaces (e.g. http://localhost:3001 or http://your-ip:3001).

More useful PM2 Commands

```bash
# If you want to see the current console output
pm2 monit

# If you want to add it to startup
pm2 startup && pm2 save
```

### Advanced Installation

If you need more options or need to browse via a reverse proxy, please read:

<https://github.com/louislam/uptime-kuma/wiki/%F0%9F%94%A7-How-to-Install>

## 🆙 How to Update

Please read:

<https://github.com/louislam/uptime-kuma/wiki/%F0%9F%86%99-How-to-Update>

## 🆕 What's Next?

I will assign requests/issues to the next milestone.

<https://github.com/louislam/uptime-kuma/milestones>

## ❤️ Sponsors

Thank you so much! (GitHub Sponsors will be updated manually. OpenCollective sponsors will be updated automatically, the list will be cached by GitHub though. It may need some time to be updated)

<img src="https://uptime.kuma.pet/sponsors?v=6" alt="Uptime Kuma Sponsors" />

## 🖼 More Screenshots

Light Mode:

<img src="https://uptime.kuma.pet/img/light.jpg" width="512" alt="Uptime Kuma Light Mode Screenshot of how the Dashboard looks" />

Status Page:

<img src="https://user-images.githubusercontent.com/1336778/134628766-a3fe0981-0926-4285-ab46-891a21c3e4cb.png" width="512" alt="Uptime Kuma Status Page Screenshot" />

Settings Page:

<img src="https://louislam.net/uptimekuma/2.jpg" width="400" alt="Uptime Kuma Settings Page Screenshot" />

Telegram Notification Sample:

<img src="https://louislam.net/uptimekuma/3.jpg" width="400" alt="Uptime Kuma Telegram Notification Sample Screenshot" />

## Motivation

- I was looking for a self-hosted monitoring tool like "Uptime Robot", but it is hard to find a suitable one. One of the closest ones is statping. Unfortunately, it is not stable and no longer maintained.
- Wanted to build a fancy UI.
- Learn Vue 3 and vite.js.
- Show the power of Bootstrap 5.
- Try to use WebSocket with SPA instead of a REST API.
- Deploy my first Docker image to Docker Hub.

If you love this project, please consider giving it a ⭐.

## 🗣️ Discussion / Ask for Help

⚠️ For any general or technical questions, please don't send me an email, as I am unable to provide support in that manner. I will not respond if you ask questions there.

I recommend using Google, GitHub Issues, or Uptime Kuma's subreddit for finding answers to your question. If you cannot find the information you need, feel free to ask:

- [GitHub Issues](https://github.com/louislam/uptime-kuma/issues)
- [Subreddit (r/UptimeKuma)](https://www.reddit.com/r/UptimeKuma/)

My Reddit account: [u/louislamlam](https://reddit.com/u/louislamlam)
You can mention me if you ask a question on the subreddit.

## Contributions

### Create Pull Requests

Pull requests are awesome.
To keep reviews fast and effective, please make sure you’ve [read our pull request guidelines](https://github.com/louislam/uptime-kuma/blob/master/CONTRIBUTING.md#can-i-create-a-pull-request-for-uptime-kuma).

### Test Pull Requests

There are a lot of pull requests right now, but I don't have time to test them all.

If you want to help, you can check this:
<https://github.com/louislam/uptime-kuma/wiki/Test-Pull-Requests>

### Test Beta Version

Check out the latest beta release here: <https://github.com/louislam/uptime-kuma/releases>

### Bug Reports / Feature Requests

If you want to report a bug or request a new feature, feel free to open a [new issue](https://github.com/louislam/uptime-kuma/issues).

### Translations

If you want to translate Uptime Kuma into your language, please visit [Weblate Readme](https://github.com/louislam/uptime-kuma/blob/master/src/lang/README.md).

### Spelling & Grammar

Feel free to correct the grammar in the documentation or code.
My mother language is not English and my grammar is not that great.
