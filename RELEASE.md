# 发版说明

本仓库使用 GitHub Release 作为主发版方式，版本命名采用：

- `v0.1.59-bridge.1`
- `v0.1.59-bridge.2`

这样可以和 upstream / npm 基础版本区分开，同时保持桥接版自己的节奏。

## 本地检查清单

1. 确认 `main` 已包含本次最终代码、README、更新日志和发版说明。
2. 运行：

   ```powershell
   npm ci
   npm run build
   powershell -ExecutionPolicy Bypass -File .\scripts\package-release.ps1 -Version v0.1.59-bridge.1
   ```

3. 检查 `artifacts/` 中是否生成：
   - `codexui-server-bridge-<version>.zip`
   - `codexui-server-bridge-<version>.sha256`
4. 至少完成一轮本地 smoke：
   - `/health`
   - 首页加载
   - 线程页
   - 关键交互

## 发布方式

推送主分支和标签：

```powershell
git push publish main
git tag v0.1.59-bridge.1
git push publish v0.1.59-bridge.1
```

Release 工作流会自动完成：

1. 安装依赖
2. 构建项目
3. 打包 zip 与 sha256
4. 发布 GitHub Release

## Release 包内容

Release 压缩包默认包含：

- 已构建的前端和 CLI
- Windows 安装与启动脚本
- 源码
- README / docs / 示例配置

## 文档维护约定

当前仓库文档默认使用中文：

- `README.md` 作为中文主文档
- `README.zh-CN.md` 只保留兼容跳转
- 更新日志统一写入 `docs/changelog.zh-CN.md`
- `.github/release-body.md` 默认使用中文
