# codexui-server-bridge

把本机 Codex 变成可从手机和浏览器访问的稳定工作台，适合 Windows、Windows Server 和自托管远程访问。

## 这版适合谁升级

- 想把本机 Codex 放到手机上继续用的人
- 想在 Windows / Windows Server 上稳定跑一个浏览器入口的人
- 想用 Cloudflare Tunnel 或其他自托管方式做远程访问的人

## 本次版本重点

- 更稳同步：
  - 会话切换改为缓存优先显示，再在后台静默刷新
  - 页面回到前台、网络恢复或通知流陈旧时会主动重建实时通道并补同步
  - “同步异常”不再和普通操作错误混用，状态提示更可靠
- 更顺手：
  - 新增消息级收藏和全局收藏面板
  - 手机端语音输入支持更稳定的按住录音和音频上传回退链路
  - MCP 权限请求改为专用确认卡片，不再误显示为补充内容输入框
- 更易远程：
  - 设置面板新增 Cloudflare Tunnel 状态区和路径保存能力
  - Windows bootstrap / install 脚本可自动识别或补装 `cloudflared`
- 更好维护：
  - 技能中心清理 Firebase 残留与死入口
  - 后端开始拆分 `skillsRoutes.ts`，降低后续维护成本

## 快速安装

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/Qjzn/codexui-server-bridge/main/scripts/bootstrap-windows.ps1 | iex
```

如果你没有公网 IP，又想先从外网访问：

```powershell
& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/Qjzn/codexui-server-bridge/main/scripts/bootstrap-windows.ps1'))) -EnableCloudflareTunnel
```

## 文档入口

- 中文主文档: [README.md](./README.md)
- 更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)
- 路线图: [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
- Cloudflare Tunnel: [docs/cloudflare-tunnel.zh-CN.md](./docs/cloudflare-tunnel.zh-CN.md)
- GitHub 包装文案包: [docs/github-launch-kit.zh-CN.md](./docs/github-launch-kit.zh-CN.md)

## 隐私说明

Release 说明和资产默认只保留通用示例，不包含：

- 私人账号
- 本地密码
- 私有 IP
- 个人目录
- 机器专属路径
