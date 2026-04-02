[CmdletBinding()]
param(
  [string]$ProjectPath = "",
  [int]$Port = 7420,
  [string]$BindHost = "0.0.0.0",
  [string]$Password = "",
  [switch]$NoPassword,
  [switch]$Tunnel,
  [switch]$OpenBrowser,
  [string]$ConfigPath = "$env:USERPROFILE\.codexui\config.json",
  [string]$LauncherPath = "$env:USERPROFILE\.local\bin\codexui-start.cmd",
  [string]$CodexCommand = "",
  [string]$RipgrepCommand = "",
  [switch]$OpenFirewall,
  [string]$FirewallRuleName = "",
  [switch]$SkipNpmInstall,
  [switch]$SkipBuild,
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"

function New-StablePassword {
  $alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  $chars = for ($i = 0; $i -lt 16; $i++) {
    $alphabet[(Get-Random -Minimum 0 -Maximum $alphabet.Length)]
  }
  -join $chars
}

function Resolve-OptionalPath {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }
  if (Test-Path -LiteralPath $Value) {
    return (Resolve-Path -LiteralPath $Value).Path
  }
  return $Value
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodeCommand = Get-Command node -ErrorAction Stop
$npmCommand = Get-Command npm -ErrorAction Stop

Write-Host "Using repo root: $repoRoot"
Write-Host "Using node: $($nodeCommand.Source)"
Write-Host "Using npm:  $($npmCommand.Source)"

if (-not $SkipNpmInstall) {
  Write-Host ""
  Write-Host "Installing npm dependencies..."
  & $npmCommand.Source install --no-fund
}

if (-not $SkipBuild) {
  Write-Host ""
  Write-Host "Building codexui..."
  & $npmCommand.Source run build
}

$resolvedProjectPath = Resolve-OptionalPath -Value $ProjectPath
$resolvedCodexCommand = Resolve-OptionalPath -Value $CodexCommand
$resolvedRipgrepCommand = Resolve-OptionalPath -Value $RipgrepCommand

if ($NoPassword) {
  $passwordValue = $false
} elseif ([string]::IsNullOrWhiteSpace($Password)) {
  $passwordValue = New-StablePassword
} else {
  $passwordValue = $Password
}

$configDir = Split-Path -Parent $ConfigPath
if (-not [string]::IsNullOrWhiteSpace($configDir)) {
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$config = [ordered]@{
  host = $BindHost
  port = $Port
  password = $passwordValue
  tunnel = $Tunnel.IsPresent
  open = $OpenBrowser.IsPresent
}

if ($resolvedProjectPath) {
  $config.projectPath = $resolvedProjectPath
}
if ($resolvedCodexCommand) {
  $config.codexCommand = $resolvedCodexCommand
}
if ($resolvedRipgrepCommand) {
  $config.ripgrepCommand = $resolvedRipgrepCommand
}

$configJson = $config | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $ConfigPath -Value $configJson -Encoding UTF8

$launcherDir = Split-Path -Parent $LauncherPath
if (-not [string]::IsNullOrWhiteSpace($launcherDir)) {
  New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null
}

$launcherContent = @"
@echo off
setlocal
cd /d "$repoRoot"
"$($nodeCommand.Source)" "$repoRoot\dist-cli\index.js" --config "$ConfigPath"
"@
Set-Content -LiteralPath $LauncherPath -Value $launcherContent -Encoding ASCII

if ($OpenFirewall) {
  $ruleName = if ([string]::IsNullOrWhiteSpace($FirewallRuleName)) { "codexui-$Port" } else { $FirewallRuleName }
  try {
    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existingRule) {
      Remove-NetFirewallRule -DisplayName $ruleName | Out-Null
    }
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
    Write-Host "Firewall rule created: $ruleName"
  } catch {
    Write-Warning "Could not update firewall rule. Run PowerShell as Administrator if you want to open the port automatically."
  }
}

Write-Host ""
Write-Host "Install complete."
Write-Host "Config:   $ConfigPath"
Write-Host "Launcher: $LauncherPath"
Write-Host "Browse:   http://localhost:$Port/"
Write-Host "Health:   http://localhost:$Port/health"
if ($passwordValue -is [string]) {
  Write-Host "Password: $passwordValue"
} elseif ($passwordValue -eq $false) {
  Write-Host "Password: disabled"
}

if ($StartNow) {
  Write-Host ""
  Write-Host "Starting codexui..."
  Start-Process -FilePath $LauncherPath
}
