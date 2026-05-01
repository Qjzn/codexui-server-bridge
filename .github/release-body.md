# codexui-server-bridge 2.1.16

Self-hosted OpenAI Codex Web UI and Android client bridge.

把本机 Codex 变成可从浏览器、手机和远程入口访问的稳定工作台，适合 Windows、Android、局域网和自托管远程访问。

## 这版适合谁升级

- Android 手机端侧边栏、会话列表、搜索或重命名操作不顺的人。
- 折叠屏设备上点击搜索框后侧边栏自动收起的人。
- 希望移动端会话记录、置顶状态和桌面端 Codex 更一致的人。
- 想通过 GitHub Release 获取最新版 Web 包和 Android APK 的人。

## 本次版本重点

- Android 侧边栏更稳：
  - 重命名、删除、会话菜单等弹层阻止点击穿透，减少弹窗闪现和侧栏异常关闭。
  - 折叠屏双栏模式保持侧边栏固定，不再因搜索框聚焦或键盘变化自动收起。
  - 侧边栏支持拖拽调整宽度，宽度本机保存。
- 会话记录更接近桌面端 Codex：
  - 分页加载完整会话记录，减少 Android 缺少历史线程的问题。
  - 恢复线程目录模块，并保留展开/收起。
  - 置顶状态从服务端刷新同步，触屏端也可直接置顶/取消置顶。
- 手机端阅读更紧凑：
  - 降低字体、卡片、列表和顶部区域占用。
  - 会话搜索仅匹配标题，列表只展示单行标题，不展示正文预览。
- 连接地址体验更清晰：
  - 服务地址不可访问时提示此前地址失败，并引导重新输入新地址。

## 快速安装

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/Qjzn/codexui-server-bridge/main/scripts/bootstrap-windows.ps1 | iex
```

## Android APK

如果本 Release 资产包含 `cx-codex-android-2.1.16.apk`，可下载后安装。

首次启动需要输入你自己的 Codex Web 服务地址；项目默认不内置任何私人地址。密钥登录成功后会保存在设备本地，用于后续无感重登。

## 文档入口

- README: [README.md](./README.md)
- 更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)
- Android 壳: [docs/android-shell.zh-CN.md](./docs/android-shell.zh-CN.md)
- 路线图: [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
- Cloudflare Tunnel: [docs/cloudflare-tunnel.zh-CN.md](./docs/cloudflare-tunnel.zh-CN.md)

## 隐私说明

Release 说明和截图只使用通用演示数据，不包含私人账号、本地密码、Token、私有 IP、个人目录、真实公网地址或私人会话内容。
