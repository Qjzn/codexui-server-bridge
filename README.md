# codexui-server-bridge

OpenAI Codex 的浏览器 UI 和桥接服务，适合 Windows、Windows Server、Linux、Android、Termux、局域网和远程自托管访问。

默认中文说明见本文件。

- 中文兼容页: [README.zh-CN.md](./README.zh-CN.md)
- 中文更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)
- 中文发版说明: [RELEASE.md](./RELEASE.md)
- 路线图: [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
- Cloudflare Tunnel: [docs/cloudflare-tunnel.zh-CN.md](./docs/cloudflare-tunnel.zh-CN.md)
- 中文部署提示词: [docs/deploy-with-codex.zh-CN.md](./docs/deploy-with-codex.zh-CN.md)
- English deploy prompt: [docs/deploy-with-codex.en.md](./docs/deploy-with-codex.en.md)

## 项目定位

这个 fork 的目标很明确：

- 给 Codex 提供一个稳定的浏览器入口
- 适合 Windows / Windows Server 上长期运行
- 适合手机浏览器、局域网、反向代理和远程访问
- 尽量减少手工配置，让新手也能部署

当前重点能力：

- 固定端口和配置文件驱动启动
- Web UI 与本地 Codex app-server 桥接
- 手机端和桌面端统一访问
- 本地文件浏览 / 编辑 / 图片查看
- 桌面端刷新辅助
- 更稳定的线程状态恢复、消息队列和移动端体验

## 最快部署方式

如果目标机器上的 Codex 已经可以执行命令，最快的方式不是手动装，而是直接让 Codex 自己部署。

仓库地址：

```text
https://github.com/Qjzn/codexui-server-bridge
```

把下面这段提示词直接给目标机器上的 Codex：

```text
打开并检查 https://github.com/Qjzn/codexui-server-bridge 这个仓库。
请在这台机器上用最简单、最稳的方式部署这个项目。

要求：
- 创建一个稳定的 Codex Web UI 服务，端口固定为 7420
- 尽量优先使用仓库里自带的 bootstrap 或 setup 脚本
- 如果这台机器已经登录过 Codex，就尽量复用现有登录态
- 尽量开启本机浏览器访问和局域网访问
- 如果机器允许，配置开机或登录后自动启动
- 完成后输出：本机访问地址、局域网访问地址、密码、重启命令

直接执行部署，不要只给步骤说明。
```

## Windows 一条命令安装

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/Qjzn/codexui-server-bridge/main/scripts/bootstrap-windows.ps1 | iex
```

安装脚本会自动完成这些事：

- 安装可用的 Node.js
- 下载仓库到本地
- 构建前端和 CLI
- 生成默认配置
- 创建启动脚本
- 尝试放通 `7420`
- 立即启动服务

安装完成后，直接在浏览器或手机里打开输出的地址即可。

## 手动运行

### 本地快速启动

```bash
npx codexapp
```

默认打开：

```text
http://localhost:18923
```

### 固定到 7420

```powershell
npx codexapp --host 0.0.0.0 --port 7420 --no-tunnel --password "change-me"
```

### 配置文件方式

优先级：

1. `--config <path>`
2. `CODEXUI_CONFIG`
3. `./codexui.config.json`
4. `~/.codexui/config.json`

示例：

```json
{
  "host": "0.0.0.0",
  "port": 7420,
  "password": "replace-with-your-password",
  "tunnel": false,
  "open": false,
  "projectPath": "C:\\Users\\your-user\\Documents\\Playground"
}
```

示例配置：

- [codexui.config.example.json](./codexui.config.example.json)

## 典型使用场景

- Windows 电脑本机跑 Codex，手机浏览器访问
- Windows Server 常驻跑 `7420`
- Linux 开发机通过浏览器访问 Codex
- Tailscale / 内网 / 反代后远程访问
- 同时使用 Web 端和官方桌面端

## 最近维护重点

当前版本主线已经覆盖这些改进：

- MCP 补充信息请求现在会显示成可理解的待输入卡片，不再暴露原始 `mcpServer/elicitation/request`
- 线程切换过程中更快响应，减少“点第二个线程还卡在第一个”的情况
- 空线程 deep link、空线程移除、空线程恢复边界收口
- 图片上传与本地图片回显链路修正
- 执行中新增消息默认进入队列，支持引用立即执行
- 队列持久化与稳定性修复，避免提前出队导致丢消息
- 会话区命令卡片只保留执行中状态，完成后不再堆积
- 侧栏新增“全部已读”
- “刷新桌面端”入口改到设置面板
- 全局 UI/UX 收口，手机端和侧栏交互更简约

详细记录见：

- [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)

## 相关文档

- Windows Server 安装: [docs/windows-server.md](./docs/windows-server.md)
- Cloudflare Tunnel 远程访问: [docs/cloudflare-tunnel.zh-CN.md](./docs/cloudflare-tunnel.zh-CN.md)
- 项目路线图: [docs/roadmap.zh-CN.md](./docs/roadmap.zh-CN.md)
- 贡献指南: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 安全策略: [SECURITY.md](./SECURITY.md)
- 发版说明: [RELEASE.md](./RELEASE.md)
- 更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)

## 反馈与贡献

- 安装部署问题请使用 `Install` Issue 模板。
- 稳定性、同步、手机端体验问题请使用 `Bug` Issue 模板。
- 新能力建议请使用 `Feature` Issue 模板。
- 提交前请先脱敏密码、Token、Cookie、真实公网地址和个人目录。

## 隐私与发布约定

发布说明和 Release 资产默认只保留通用示例，不包含：

- 私人账号
- 本地密码
- 私有 IP
- 个人目录
- 机器专属路径

## Fork 来源

[pavel-voronin/codex-web-local](https://github.com/pavel-voronin/codex-web-local)  
→ [friuns2/codexui](https://github.com/friuns2/codexui)  
→ [Qjzn/codexui-server-bridge](https://github.com/Qjzn/codexui-server-bridge)
