# Docker 部署指南

把本地工作台（TanStack Start + SQLite + 扩展 API）跑在 Docker 容器里，
同时保持与 Chrome 插件通信、读写宿主机本地资源。

## 快速开始

```bash
docker compose build
docker compose up -d
open http://localhost:3888
```

不使用 compose 也可以：

```bash
# macOS / Linux
docker build -t gengxin20/aiworkstation:latest .
docker run -d --name aiworkstation \
  -p 127.0.0.1:3888:3888 \
  --env-file .env \
  -v "$PWD/.aiworkstation:/app/.aiworkstation" \
  -v "$HOME/Downloads:$HOME/Downloads" \
  -e "HOME=$HOME" \
  gengxin20/aiworkstation:latest
```

```powershell
# Windows PowerShell
docker build -t gengxin20/aiworkstation:latest .
docker run -d --name aiworkstation `
  -p 127.0.0.1:3888:3888 `
  --env-file .env `
  -v "${PWD}\.aiworkstation:/app/.aiworkstation" `
  -v "C:\Users\$env:USERNAME\Downloads:/home/user/Downloads" `
  -e "HOME=/home/user" `
  gengxin20/aiworkstation:latest
```

## Windows 使用说明

在 `.env` 文件末尾追加以下两行，`docker compose up -d` 即可正常使用：

```dotenv
# Windows 专用：容器内 HOME 路径（Linux 格式）
CONTAINER_HOME=/home/user
# Windows 专用：宿主机下载目录（Windows 路径，Docker Desktop 会自动转换）
HOST_DOWNLOADS=C:\Users\你的用户名\Downloads
```

> **原理**：代码里所有 `homedir()` 均读取容器内的 `HOME` 环境变量。
> 把宿主机 `C:\Users\xxx\Downloads` 挂载到容器 `/home/user/Downloads`，
> 并令容器 `HOME=/home/user`，则 `homedir() + '/Downloads'` 与挂载点吻合，
> 下载路径在容器内外保持可寻址（宿主机通过 Docker Desktop 文件共享访问）。

**macOS / Linux 用户无需改动 `.env`**，默认值自动取宿主机 `$HOME`，行为与原来完全一致。

不用 Docker 时也可以直接在宿主机跑生产构建：

```bash
pnpm build:node      # DEPLOY_TARGET=node vite build → .output/
pnpm start:node      # node .output/server/index.mjs（监听 3888）
```

## 与插件的通信为什么不受影响

| 通道 | 机制 | Docker 下的表现 |
|---|---|---|
| 数据通道：插件 `fetch localhost:3888/api/*` | 端口映射 `127.0.0.1:3888:3888` 把宿主机回环流量转发进容器 | ✅ 无需改插件 |
| side panel iframe `localhost:3888` | 同上，页面由容器内 SSR 服务提供 | ✅ |
| 控制通道：工作台页面 ↔ 插件（`chrome.runtime.connect`） | 发生在浏览器进程内部，与后端在哪里运行无关 | ✅ |

端口只在宿主机绑定 `127.0.0.1`（compose 里显式声明），符合 PROJECT.md
决策#6：本机以外的设备无法访问工作台。

## 本地资源的读写与监控

- **SQLite 数据**：`./.aiworkstation` 挂载到容器 `/app/.aiworkstation`，
  数据库、爬取快照、备份都落在项目目录，可直接备份迁移。
- **下载目录**：宿主机 `$HOME/Downloads` 按**相同绝对路径**挂入容器，
  并设置容器 `HOME=$HOME`，因此视频下载产物直接出现在宿主机下载目录，
  数据库里记录的路径在容器内外一致。
- **ffmpeg**：运行镜像已安装，视频下载/转码可用。
- **监控宿主机其他容器**：取消 compose 中 `docker.sock` 挂载的注释，
  即可通过 Docker API 观察/管理本机容器。
- **监控宿主机系统指标**（CPU/内存/磁盘）：Linux 宿主机取消 `/proc`、`/sys`
  挂载注释即可读取真实主机指标。**macOS 上 Docker Desktop 运行在 Linux VM
  里，容器只能看到 VM 的指标，无法直接看到 macOS 本身的指标**——这是
  Docker 的固有边界，如需精确监控 macOS 宿主机，工作台应直接跑在宿主机
  （`pnpm dev` / `pnpm start:node`）。
- **其他本地目录**：在 compose 里追加同路径挂载即可（建议 `:ro` 只读）。

## 已知边界

- **`/api/open-file` 无法唤起宿主机 GUI 程序**：容器是 Linux 环境，没有
  macOS 的 `open` 命令，点击 `localfile://` 链接不会弹出访达/预览。
  文件本身仍在宿主机挂载目录里，可手动打开。需要此能力请在宿主机直接运行。
- **环境变量**：生产 Node 服务器不会自动加载 `.env`，必须通过 compose 的
  `env_file`（或 `docker run --env-file`）注入 `DEEPSEEK_API_KEY` 等密钥。
- **不要容器与宿主机 dev server 同时占用 3888**：先停掉 `pnpm dev` 再
  `docker compose up`。
- **Windows：数据库里记录的路径与宿主机路径不同**：容器内 `HOME=/home/user`，
  SQLite 里存储的下载路径形如 `/home/user/Downloads/video.mp4`。
  这与宿主机 `C:\Users\xxx\Downloads\video.mp4` 不同，但文件实际通过
  Docker Desktop 的文件共享可双向访问，不影响使用，仅影响路径展示。
- **Windows：需要开启 Docker Desktop 文件共享**：确保
  `C:\Users\你的用户名` 在 Docker Desktop → Settings → Resources → File Sharing
  中已被允许，否则 volume 挂载会失败。

## 构建原理

- `DEPLOY_TARGET=node` 时 `vite.config.ts` 用 `nitro()` 替换
  `@cloudflare/vite-plugin`，产出自包含 Node 服务器（`.output/`）。
- 扩展 API（`/api/collect`、`/api/chat/stream`、`/api/crawler/*`、
  `/api/video-tasks/*`、`/api/open-file`）的路由表抽在
  `src/server/api/router.ts`，dev 走 Vite 中间件、生产走 Nitro
  `format: "node"` 处理器（`src/server/api/extensionApi.nitro.ts`），
  两端共用同一套 handler。
- `better-sqlite3` 的各平台预编译二进制已被 Nitro 追踪进产物，
  镜像内无需编译。
