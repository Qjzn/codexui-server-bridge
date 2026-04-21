# Cloudflare Tunnel 一键模式

Cloudflare Tunnel 适合想从手机或外网访问家里电脑 / Windows Server 上 Codex Web UI 的用户。它的优点是通常不需要公网 IP，也不需要路由器端口映射。

> 当前文档是第一期方案说明。脚本化一键接入会继续补强。

## 适合谁

- 不想配置路由器端口映射
- 没有公网 IP
- 想用一个 HTTPS 地址访问 `7420`
- 愿意使用 Cloudflare 账号和域名

## 前置条件

- 已有 Cloudflare 账号
- 域名已经托管到 Cloudflare
- 本机 `7420` 服务能正常访问
- Web UI 已设置访问密码

## 推荐架构

```text
手机浏览器
  -> Cloudflare HTTPS 域名
  -> Cloudflare Tunnel
  -> 本机 127.0.0.1:7420
  -> Codex Web UI
```

## 安装 cloudflared

Windows 可以参考 Cloudflare 官方方式安装 `cloudflared`。安装后确认：

```powershell
cloudflared --version
```

## 登录 Cloudflare

```powershell
cloudflared tunnel login
```

浏览器会打开授权页面。选择对应域名完成授权。

## 创建 Tunnel

```powershell
cloudflared tunnel create codexui
```

## 绑定域名

把下面的域名换成你自己的子域名：

```powershell
cloudflared tunnel route dns codexui codex.example.com
```

## 配置转发

创建配置目录：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cloudflared"
```

创建 `$env:USERPROFILE\.cloudflared\config.yml`：

```yaml
tunnel: codexui
credentials-file: C:\Users\your-user\.cloudflared\your-tunnel-id.json

ingress:
  - hostname: codex.example.com
    service: http://127.0.0.1:7420
  - service: http_status:404
```

把 `credentials-file` 改成 `cloudflared tunnel create` 输出的实际路径。

## 启动 Tunnel

```powershell
cloudflared tunnel run codexui
```

然后打开：

```text
https://codex.example.com
```

## 设置为后台服务

Windows：

```powershell
cloudflared service install
```

然后在 Windows 服务里确认 `cloudflared` 已启动。

## 安全建议

- Web UI 必须设置密码。
- Cloudflare 侧建议增加 Access 保护，只允许自己的邮箱登录。
- 不要把无密码的 `7420` 直接暴露到公网。
- 不要在 Issue 里粘贴真实域名、Tunnel ID、Token 或配置文件原文。

## 故障排查

- 本机打不开 `http://127.0.0.1:7420`：先修 Codex Web UI 服务。
- Cloudflare 域名打不开：检查 Tunnel 是否运行、DNS 是否绑定、配置文件路径是否正确。
- 能打开登录页但不能使用：检查反向代理是否保留 WebSocket 和 SSE 连接。
- 手机网络慢：优先确认本机网络、Cloudflare 节点和浏览器缓存。
