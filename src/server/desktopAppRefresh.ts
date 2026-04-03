import { spawn } from 'node:child_process'

export type DesktopAppRefreshStatus = {
  available: boolean
  platform: string
  appInstalled: boolean
  appRunning: boolean
  appUserModelId: string
  reason: string
}

export type DesktopAppRefreshRequestResult = {
  requested: boolean
  message: string
}

type PowerShellCommandResult = {
  stdout: string
  stderr: string
  exitCode: number | null
}

const WINDOWS_PLATFORM = 'win32'
const DEFAULT_REFRESH_DELAY_MS = 1200

function getUnavailableStatus(reason: string): DesktopAppRefreshStatus {
  return {
    available: false,
    platform: process.platform,
    appInstalled: false,
    appRunning: false,
    appUserModelId: '',
    reason,
  }
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function runPowerShell(script: string): Promise<PowerShellCommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)],
      {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode })
    })
  })
}

function launchDetachedPowerShell(script: string): void {
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)],
    {
      detached: true,
      env: process.env,
      stdio: 'ignore',
      windowsHide: true,
    },
  )
  proc.unref()
}

function buildDesktopStatusScript(): string {
  return `
$ErrorActionPreference = "Stop"
try {
  $package = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
  if (-not $package) {
    [pscustomobject]@{
      available = $false
      platform = "win32"
      appInstalled = $false
      appRunning = $false
      appUserModelId = ""
      reason = "Official Codex desktop app is not installed."
    } | ConvertTo-Json -Compress
    exit 0
  }

  $installLocation = [System.IO.Path]::GetFullPath($package.InstallLocation).TrimEnd('\\')
  $processes = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.ExecutablePath -and
        ([System.IO.Path]::GetFullPath($_.ExecutablePath)).StartsWith(
          $installLocation,
          [System.StringComparison]::OrdinalIgnoreCase
        )
      }
  )

  [pscustomobject]@{
    available = $true
    platform = "win32"
    appInstalled = $true
    appRunning = ($processes.Count -gt 0)
    appUserModelId = "$($package.PackageFamilyName)!App"
    reason = ""
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{
    available = $false
    platform = "win32"
    appInstalled = $false
    appRunning = $false
    appUserModelId = ""
    reason = $_.Exception.Message
  } | ConvertTo-Json -Compress
}
`.trim()
}

function buildDesktopRefreshScript(delayMs: number): string {
  return `
param(
  [int]$DelayMs = ${String(delayMs)}
)

$ErrorActionPreference = "Stop"

function Get-CodexPackageInfo {
  $package = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
  if (-not $package) {
    throw "Official Codex app package was not found."
  }

  [pscustomobject]@{
    PackageFamilyName = $package.PackageFamilyName
    InstallLocation = $package.InstallLocation
    AppUserModelId = "$($package.PackageFamilyName)!App"
  }
}

function Get-OfficialCodexProcesses {
  param([string]$InstallLocation)

  $normalizedInstall = [System.IO.Path]::GetFullPath($InstallLocation).TrimEnd('\\')
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.ExecutablePath -and
      ([System.IO.Path]::GetFullPath($_.ExecutablePath)).StartsWith(
        $normalizedInstall,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    } |
    Sort-Object ProcessId -Descending
}

function Stop-OfficialCodexProcesses {
  param([string]$InstallLocation)

  $processes = @(Get-OfficialCodexProcesses -InstallLocation $InstallLocation)
  if (-not $processes) {
    return
  }

  foreach ($processInfo in $processes) {
    Stop-Process -Id $processInfo.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Wait-UntilStopped {
  param(
    [string]$InstallLocation,
    [int]$TimeoutMs = 10000
  )

  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    $remaining = @(Get-OfficialCodexProcesses -InstallLocation $InstallLocation)
    if (-not $remaining) {
      return
    }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $deadline)
}

$packageInfo = Get-CodexPackageInfo
Stop-OfficialCodexProcesses -InstallLocation $packageInfo.InstallLocation
Wait-UntilStopped -InstallLocation $packageInfo.InstallLocation
Start-Sleep -Milliseconds $DelayMs
Start-Process explorer.exe "shell:AppsFolder\\$($packageInfo.AppUserModelId)" | Out-Null
`.trim()
}

function normalizeDesktopStatus(payload: unknown): DesktopAppRefreshStatus {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return getUnavailableStatus('Desktop app status returned an invalid payload.')
  }

  const record = payload as Record<string, unknown>
  return {
    available: record.available === true,
    platform: typeof record.platform === 'string' && record.platform.length > 0 ? record.platform : process.platform,
    appInstalled: record.appInstalled === true,
    appRunning: record.appRunning === true,
    appUserModelId: typeof record.appUserModelId === 'string' ? record.appUserModelId : '',
    reason: typeof record.reason === 'string' ? record.reason : '',
  }
}

export async function getDesktopAppRefreshStatus(): Promise<DesktopAppRefreshStatus> {
  if (process.platform !== WINDOWS_PLATFORM) {
    return getUnavailableStatus('Desktop refresh is only available on Windows.')
  }

  const result = await runPowerShell(buildDesktopStatusScript())
  if (result.exitCode !== 0) {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n')
    return getUnavailableStatus(details || 'Failed to query the official Codex desktop app.')
  }

  try {
    return normalizeDesktopStatus(JSON.parse(result.stdout.trim()))
  } catch {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n')
    return getUnavailableStatus(details || 'Desktop app status returned invalid JSON.')
  }
}

export async function requestDesktopAppRefresh(): Promise<DesktopAppRefreshRequestResult> {
  const status = await getDesktopAppRefreshStatus()
  if (!status.available) {
    throw new Error(status.reason || 'Official Codex desktop app refresh is unavailable on this machine.')
  }

  launchDetachedPowerShell(buildDesktopRefreshScript(DEFAULT_REFRESH_DELAY_MS))
  return {
    requested: true,
    message: 'Official Codex desktop app refresh requested. The app will close and reopen shortly.',
  }
}
