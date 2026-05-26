# CX-Codex 2.2.3

Self-hosted OpenAI Codex Web UI and Android client bridge.

把本机 Codex 变成可从浏览器、手机和远程入口访问的稳定工作台，适合 Windows、Android、局域网和自托管远程访问。

## 这版适合谁升级

- Android 端点击 Word、Excel、PPT、PDF 等本地文件链接无反应、打不开或无法下载的人。
- 使用手机 / 折叠屏访问本机文件链接，希望能交给系统应用打开或加入系统下载的人。
- 需要 Web 端发送任务后更容易同步到桌面 Codex 客户端的人。
- 使用技能中心和 GitHub 热门入口，希望文案更清楚的人。

## 本次版本重点

- 本地文件操作页：`/codex-local-browse` 对 Office、PDF、压缩包等文件展示专用操作页，提供打开、下载、返回目录和复制路径。
- Android 原生打开 / 下载：新增 `openFileFromUrl` 与 `downloadFileFromUrl` 桥接，下载时携带 Cookie，并调用系统应用或下载管理器处理文件。
- MIME 与下载头补齐：`/codex-local-file` 为 docx、xlsx、pptx、pdf、rtf、txt 等常见类型补齐 MIME 和附件下载头，减少 WebView 空白页和无响应。
- 失败可感知：文件操作页增加 25 秒超时与降级提示，旧 APK 或系统下载不可用时会明确提示复制路径或升级客户端，不再一直卡住。
- Web 到桌面同步提示：Web 端发送任务后会提示桌面 Codex 可能需要刷新同步，降低多端查看同一线程时的困惑。
- 技能文案统一：技能详情“描述”改为“解释”，GitHub 热门项目按钮也改为“解释”，更符合实际使用语义。
- 发布安全：Release 文案继续只使用通用说明，不包含私人地址、账号、Token、本地密码或个人目录。

## 快速安装

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/Qjzn/CX-Codex/main/scripts/bootstrap-windows.ps1 | iex
```

## Android APK

如果本 Release 资产包含 `cx-codex-android-2.2.3.apk`，这是正式签名 APK。

如果只包含 `cx-codex-android-debug-2.2.3.apk`，说明仓库尚未配置 Android 签名 secret；该包适合自托管测试和临时安装，后续正式签名 APK 可能需要先卸载 debug 包再安装。

首次启动需要输入你自己的 Codex Web 服务地址；项目默认不内置任何私人地址。密钥登录成功后会保存在设备本地，用于后续无感重登。

## 文档入口

- README: [README.md](./README.md)
- 更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)
- Android 壳: [docs/android-shell.zh-CN.md](./docs/android-shell.zh-CN.md)
- 路线图: [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
- Cloudflare Tunnel: [docs/cloudflare-tunnel.zh-CN.md](./docs/cloudflare-tunnel.zh-CN.md)

## 隐私说明

Release 说明和截图只使用通用演示数据，不包含私人账号、本地密码、Token、私有 IP、个人目录、真实公网地址或私人会话内容。
