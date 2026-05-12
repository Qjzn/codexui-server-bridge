# CX-Codex 2.2.0

Self-hosted OpenAI Codex Web UI and Android client bridge.

把本机 Codex 变成可从浏览器、手机和远程入口访问的稳定工作台，适合 Windows、Android、局域网和自托管远程访问。

## 这版适合谁升级

- Android 端遇到锁屏/切后台后“思考中”卡住、任务完成但页面不收敛的人。
- 需要更稳定的手机、折叠屏和远程浏览器入口的人。
- 想直接在技能中心发现、搜索和安装 GitHub 热门 Codex 技能的人。
- 需要 App 内文件链接可下载、会话列表更接近桌面端 Codex 的人。

## 本次版本重点

- 稳定性收口：Android 恢复前台、锁屏解锁、网络恢复和手动刷新都会重新同步运行快照与当前会话，降低“已完成但仍思考中”的误导。
- 后端运行态更稳：陈旧 active 状态会降级，计划模式完成/失败/中断后会清理残留计数，慢列表场景减少完整 turns 重读。
- 移动端阅读更顺：长回复不再被自动吸底顶到中段，手机和折叠屏会优先锚定到回复开头。
- 技能中心产品化：新增 GitHub 热门技能市场，可搜索、查看介绍/来源/热度，并直接安装。
- 文件链接体验：文档、压缩包、安装包等本地文件链接改为下载处理，Android App 接入系统下载器。
- 安全与发布：安装脚本不再输出明文密码，后台日志会脱敏密码、token、Authorization 和 URL query 中的敏感字段。

## 快速安装

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/Qjzn/CX-Codex/main/scripts/bootstrap-windows.ps1 | iex
```

## Android APK

如果本 Release 资产包含 `cx-codex-android-2.2.0.apk`，可下载后安装。

首次启动需要输入你自己的 Codex Web 服务地址；项目默认不内置任何私人地址。密钥登录成功后会保存在设备本地，用于后续无感重登。

## 文档入口

- README: [README.md](./README.md)
- 更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)
- Android 壳: [docs/android-shell.zh-CN.md](./docs/android-shell.zh-CN.md)
- 路线图: [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
- Cloudflare Tunnel: [docs/cloudflare-tunnel.zh-CN.md](./docs/cloudflare-tunnel.zh-CN.md)

## 隐私说明

Release 说明和截图只使用通用演示数据，不包含私人账号、本地密码、Token、私有 IP、个人目录、真实公网地址或私人会话内容。
