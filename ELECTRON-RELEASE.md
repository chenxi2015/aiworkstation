# Electron 打包与发布指南

> 本文档说明桌面端的本地构建命令、GitHub Actions 自动发布流程，以及两者的关系。
> 配置源头：`electron/builder.config.ts`（electron-builder）+ `.github/workflows/build-electron.yml`（CI）。

## TL;DR

**正式发布只需一条命令（推荐）：**

```bash
pnpm run release:patch   # 小版本（0.1.0 -> 0.1.1）
# 或 pnpm run release:minor（次版本）/ pnpm run release:major（主版本）
```

该命令会自动：
1. 校验 Git 工作区干净度
2. 递增根目录及 `extensions/aicollector` 的 `package.json` 版本号
3. 生成 `chore(release): vX.Y.Z` 提交并打 Git Tag
4. 自动推送到 GitHub (`git push origin main --tags`)

Tag 推送后 GitHub Actions 会自动构建 macOS + Windows 双平台安装包并发布到同一个 GitHub Release。**本地不需要跑任何打包命令。**

## 命令速查

| 命令 | 产物 | 用途 |
|---|---|---|
| `pnpm run release:patch` | 自动提交 + Tag + Push | **一键标准发版**（小版本，如 0.1.0 -> 0.1.1），自动触发 CI |
| `pnpm run release:minor` | 自动提交 + Tag + Push | **一键标准发版**（次版本，如 0.1.0 -> 0.2.0），自动触发 CI |
| `pnpm run release:major` | 自动提交 + Tag + Push | **一键标准发版**（主版本，如 0.1.0 -> 1.0.0），自动触发 CI |
| `pnpm electron:dev` | 无 | 本地开发调试（Vite + Electron 联调） |
| `pnpm electron:pack` | `dist/mac-arm64/*.app`（未压缩目录） | 快速验证打包配置，不出安装包，最快 |
| `pnpm electron:dist:mac` | `dist/*.dmg` | 本地出 Mac 安装包（自己装着测） |
| `pnpm electron:dist:win` | `dist/*.exe` | 本地出 Windows 安装包（Mac 上也能打，NSIS 交叉构建） |
| `pnpm electron:release` | 同上 + **直接发布到 GitHub Releases** | 应急手动发布渠道（见下文对比） |

## 本地 `electron:release` vs GitHub Actions

两者上传机制不同：本地 `electron:release` 用 electron-builder 自带的 `--publish always` 直传；CI 则是 electron-builder 只负责构建（`--publish never`），由最后的 `softprops/action-gh-release` 步骤统一上传（electron-builder 的 GitHub 发布器多次调用会创建重复同名 Release，不可靠）。两者区别在运行环境和适用场景：

| | 本地 `pnpm electron:release` | GitHub Actions（tag 触发） |
|---|---|---|
| 触发方式 | 手动执行，需 `GH_TOKEN` 环境变量 | push `v*` tag 自动触发 |
| 构建环境 | 你自己的 Mac（产物带本机状态风险） | 干净的 CI runner，可复现 |
| 版本号 | 读当前 `package.json`，**需自己手动改** | 自动把 tag 版本同步进 `package.json` |
| 双平台 | 一次 `-mw` 串行出 mac+win | 同一 job 串行出 mac+win |
| 适用场景 | CI 挂了的应急兜底、测试发布流程 | **正式发布的标准渠道** |

**结论：日常只用 GitHub Actions；`electron:release` 留着应急，不要混用**（同一个版本号两边各发一次会产生重复/冲突的 Release 资产）。

## 标准发布流程（GitHub Actions）

### 方式一：一键发版（推荐）

```bash
# 1. 确保本地改动已提交或清理，工作区保持干净（否则脚本会安全退出）
git status

# 2. 执行对应级别的发版命令（自动更新 package.json、提交、打 tag 并 push）
pnpm run release:patch    # 补丁更新（如 0.1.0 -> 0.1.1）
# 或 pnpm run release:minor（特性更新，如 0.1.0 -> 0.2.0）
# 或 pnpm run release:major（重大版本，如 0.1.0 -> 1.0.0）
# 亦可指定具体版本：node scripts/release.mjs 0.2.5 && git push origin main --tags

# 3. 等 15-25 分钟，到 GitHub Actions 页面确认 Build & Release 成功
# 4. 检查 Release 页面资产是否齐全（共 6 个文件）：
#    AI-Workstation-x.y.z-arm64.dmg          Mac 安装包
#    AI-Workstation-Setup-x.y.z.exe          Windows 安装包
#    latest-mac.yml / latest.yml             自动更新元数据（electron-updater 读取）
#    *.blockmap × 2                          差量更新用
```

### 方式二：手动打 Tag（备用）

如果不希望自动更新项目内 `package.json`，仅快速打 tag 触发 CI：

```bash
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

也可以去 Actions 页面手动触发 `Build Electron Apps`（可选只构建某个平台）——手动触发**不会发布**，产物在 workflow 的 Artifacts 里，用于发布前验证。

## 自动更新机制

- app 启动时 `electron/main.ts` 的 `setupAutoUpdater()` 检查 GitHub Releases 上的 `latest*.yml`
- 发现新版本 → 后台静默下载 → 下载完弹窗「立即重启 / 稍后」
- 更新失败（断网、无 Release）只记日志，不打扰用户
- **Windows 未签名也能正常自更新**；**macOS 必须 Apple Developer ID 签名**，否则能检测但装不上（当前状态：未签名，Mac 自更新不可用，Windows 正常）

## 常见问题

**Q: 发了 tag 但 Release 里版本号不对？**
CI 会自动执行 `npm version <tag>` 同步，正常不会发生。本地 `electron:release` 则需要自己先改 `package.json` 的 `version`。

**Q: 想撤回一个有问题的 Release？**
GitHub Release 页面删除即可。已更新的用户不受影响（已装的就是新包）；没更新的用户下次检查会找不到该版本，保持现状。

**Q: 安装包为什么还有 120-130MB？**
约 100MB 是 Electron 运行时（Chromium+Node）的固定成本。2026-09 已做过一轮瘦身（1.1GB → 373MB 解压后），详见 `electron/builder.config.ts` 注释。

**Q: Mac 自更新怎么打通？**
需要 Apple Developer 账号（$99/年），把证书配到 CI secrets，并在 `builder.config.ts` 设置 `mac.identity`。
