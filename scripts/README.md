# 一键脚本 / One-click scripts

| 场景 | Windows (PowerShell) | Windows (cmd) | Linux / macOS |
| --- | --- | --- | --- |
| 生产启动（安装 + 构建 + 起服务） | `scripts\start.ps1` | `scripts\start.bat` | `scripts/start.sh` |
| 开发模式（vite + server 热重载） | `scripts\dev.ps1` | `scripts\dev.bat` | `scripts/dev.sh` |

脚本默认行为：
1. 切到仓库根目录。
2. 若 `node_modules/` 不存在则跑 `npm install`。
3. 生产脚本会跑 `npm run build` 生成 `dist/`，然后 `node server/server.js`。
4. 开发脚本会跑 `npm run dev`（vite 在 `:3000`，server 在 `:3001`）。

> 不再使用上游 `npm run setup`（它会 `git checkout 2.3.2`，在本 fork 里没意义且会失败）。

## 备注

- 在 Windows 上首次运行 `.ps1` 若被执行策略拦截，可：`powershell -ExecutionPolicy Bypass -File scripts\start.ps1`。
- 默认监听 `0.0.0.0:3001`。设置 `UPTIME_KUMA_PORT=xxxx` 环境变量可改端口。
- 数据持久化在仓库根目录的 `data/`（已被 `.gitignore` 忽略）。
- 生产部署建议外面再套一层 PM2 / systemd 做守护，参考上游 wiki。
