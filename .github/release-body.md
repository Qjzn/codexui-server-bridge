# codexui-server-bridge

OpenAI Codex 浏览器 UI 与桥接服务，适合 Windows、Linux、Android、Termux 与 Windows Server。

## v0.2.0-bridge.3

本次版本重点修复 MCP 补充信息请求在 Web 端显示不清晰、处理不完整的问题：

- 识别 `mcpServer/elicitation/request` 与 `elicitation/create`
- 待处理请求显示为“等待输入 / MCP 服务需要补充信息”
- 支持表单、枚举、布尔、数字和 URL 打开场景
- 按 MCP 规范返回 `action: accept / decline / cancel`
- 修正底部状态卡里的方向文案，避免提示“上方有待处理请求”
- 保持现有 7420 部署方式不变

## 快速链接

- 中文主文档: [README.md](./README.md)
- 中文更新日志: [docs/changelog.zh-CN.md](./docs/changelog.zh-CN.md)
- 中文发版说明: [RELEASE.md](./RELEASE.md)
- 中文部署提示词: [docs/deploy-with-codex.zh-CN.md](./docs/deploy-with-codex.zh-CN.md)
- English deploy prompt: [docs/deploy-with-codex.en.md](./docs/deploy-with-codex.en.md)

## 隐私说明

本次 Release 说明默认只保留通用示例，不包含：

- 私人账号
- 本地密码
- 私有 IP
- 个人目录
- 机器专属路径
