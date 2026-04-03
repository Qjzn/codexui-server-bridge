# Windows Server Setup

This project now supports a config-driven Windows deployment flow that works well for LAN access, reverse proxies, and fixed browser ports.

## 1. One-command install

For most users, this is the easiest path:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/Qjzn/codexui-server-bridge/main/scripts/bootstrap-windows.ps1 | iex
```

Default behavior:

- installs Node.js automatically if needed
- downloads the latest repo to `%LOCALAPPDATA%\codexui-server-bridge`
- creates `%USERPROFILE%\CodexWorkspace`
- creates `%USERPROFILE%\.local\bin\codexui-start.cmd`
- creates an auto-start task at logon
- attempts to open firewall port `7420`
- starts the service immediately

You can rerun the same command later to change the port, password, or workspace. The installer updates the same config and launcher, then restarts the managed instance with the new settings.

If you want custom options such as a fixed password:

```powershell
& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/Qjzn/codexui-server-bridge/main/scripts/bootstrap-windows.ps1'))) `
  -Port 7420 `
  -Password 'change-me'
```

## 2. Build from source

```powershell
cd .\codexui
npm install
npm run build
```

## 3. Generate config + launcher

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-server.ps1 `
  -ProjectPath "C:\Users\SW\Documents\Playground" `
  -CreateProjectPath `
  -Port 7420 `
  -Password "change-me" `
  -CreateStartupTask `
  -EnsureCodexLogin `
  -OpenFirewall `
  -StartNow
```

The script writes:

- a stable JSON config file at `%USERPROFILE%\.codexui\config.json`
- a launcher at `%USERPROFILE%\.local\bin\codexui-start.cmd`

By default the installer writes `tunnel: false` and `open: false`, which is usually the right choice for Windows server usage.

## 4. Health checks

- Basic health: `http://<host>:<port>/health`
- Detailed bridge health: `http://<host>:<port>/codex-api/health`

`/health` is intentionally lightweight so it can be used by reverse proxies and process monitors.

## 5. Optional config locations

`codexui` will automatically load config from the first file it finds:

1. `--config <path>`
2. `CODEXUI_CONFIG`
3. `./codexui.config.json`
4. `%USERPROFILE%\.codexui\config.json`

See [codexui.config.example.json](../codexui.config.example.json) for the supported keys.

## 6. Reverse proxy notes

- Bind with `0.0.0.0` for LAN or reverse-proxy access.
- Keep `/health`, `/codex-api/events`, and `/codex-api/ws` reachable through the proxy.
- If you use an external tunnel or port mapping, prefer `--no-tunnel` and let your own ingress handle exposure.
