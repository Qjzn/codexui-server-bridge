param(
  [int]$DurationSeconds = 7200,
  [int]$IntervalSeconds = 15,
  [string]$LocalBaseUrl = "http://127.0.0.1:7420",
  [string]$PublicBaseUrl = "http://116.62.234.104:17420",
  [string]$OutputDir = "output\soak-7420",
  [int]$MaxQueuedRpc = 3,
  [int]$MaxPendingRpc = 3,
  [int]$MaxConsecutiveFailures = 2,
  [switch]$SkipPublic
)

$ErrorActionPreference = "Stop"

if ($DurationSeconds -lt 1) {
  throw "DurationSeconds must be greater than 0"
}
if ($IntervalSeconds -lt 1) {
  throw "IntervalSeconds must be greater than 0"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$startedAt = Get-Date
$startedAtIso = $startedAt.ToUniversalTime().ToString("o")
$deadline = $startedAt.AddSeconds($DurationSeconds)
$samples = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]
$consecutiveLocalFailures = 0
$consecutiveApiFailures = 0
$consecutivePublicFailures = 0
$maxQueuedObserved = 0
$maxPendingObserved = 0
$newTimeoutCount = 0
$slowThreadListCount = 0

function Invoke-JsonHealth {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 12
  )

  try {
    $value = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds
    return [pscustomobject]@{
      ok = $true
      value = $value
      error = $null
    }
  } catch {
    return [pscustomobject]@{
      ok = $false
      value = $null
      error = $_.Exception.Message
    }
  }
}

function Read-DateOrNull {
  param([object]$Value)
  if ($null -eq $Value) {
    return $null
  }
  try {
    return [DateTime]::Parse([string]$Value).ToUniversalTime()
  } catch {
    return $null
  }
}

Write-Host "[7420-soak] start duration=${DurationSeconds}s interval=${IntervalSeconds}s local=$LocalBaseUrl public=$PublicBaseUrl"

while ((Get-Date) -lt $deadline) {
  $now = Get-Date
  $local = Invoke-JsonHealth -Url "$LocalBaseUrl/health" -TimeoutSeconds 8
  $api = Invoke-JsonHealth -Url "$LocalBaseUrl/codex-api/health" -TimeoutSeconds 20
  $public = if ($SkipPublic) {
    [pscustomobject]@{ ok = $true; value = $null; error = $null }
  } else {
    Invoke-JsonHealth -Url "$PublicBaseUrl/health" -TimeoutSeconds 12
  }

  if ($local.ok) { $consecutiveLocalFailures = 0 } else { $consecutiveLocalFailures += 1 }
  if ($api.ok) { $consecutiveApiFailures = 0 } else { $consecutiveApiFailures += 1 }
  if ($public.ok) { $consecutivePublicFailures = 0 } else { $consecutivePublicFailures += 1 }

  $appServer = $api.value.data.appServer
  $diagnostics = $appServer.rpcDiagnostics
  $queuedRpcCount = if ($null -ne $appServer.queuedRpcCount) { [int]$appServer.queuedRpcCount } else { 0 }
  $pendingRpcCount = if ($null -ne $appServer.pendingRpcCount) { [int]$appServer.pendingRpcCount } else { 0 }
  $maxQueuedObserved = [Math]::Max($maxQueuedObserved, $queuedRpcCount)
  $maxPendingObserved = [Math]::Max($maxPendingObserved, $pendingRpcCount)

  $recentTimeouts = @()
  if ($null -ne $diagnostics -and $null -ne $diagnostics.recentTimeouts) {
    $recentTimeouts = @($diagnostics.recentTimeouts)
  }
  $newTimeouts = @($recentTimeouts | Where-Object {
    $timeoutAt = Read-DateOrNull $_.atIso
    $null -ne $timeoutAt -and $timeoutAt -ge $startedAt.ToUniversalTime()
  })
  $newTimeoutCount = [Math]::Max($newTimeoutCount, $newTimeouts.Count)

  $recentSlowRpc = @()
  if ($null -ne $diagnostics -and $null -ne $diagnostics.recentSlowRpc) {
    $recentSlowRpc = @($diagnostics.recentSlowRpc)
  }
  $slowThreadLists = @($recentSlowRpc | Where-Object {
    $slowAt = Read-DateOrNull $_.atIso
    $null -ne $slowAt -and $slowAt -ge $startedAt.ToUniversalTime() -and $_.method -eq "thread/list"
  })
  $slowThreadListCount = [Math]::Max($slowThreadListCount, $slowThreadLists.Count)

  $sample = [pscustomobject]@{
    atIso = $now.ToUniversalTime().ToString("o")
    localOk = [bool]$local.ok
    apiOk = [bool]$api.ok
    publicOk = [bool]$public.ok
    appServerRunning = [bool]$appServer.running
    appServerInitialized = [bool]$appServer.initialized
    pendingRpcCount = $pendingRpcCount
    queuedRpcCount = $queuedRpcCount
    activeRpcCalls = if ($null -ne $diagnostics.activeRpcCalls) { [int]$diagnostics.activeRpcCalls } else { 0 }
    queuePeakCount = if ($null -ne $diagnostics.queuePeakCount) { [int]$diagnostics.queuePeakCount } else { 0 }
    newTimeoutCount = $newTimeouts.Count
    slowThreadListCount = $slowThreadLists.Count
    localError = $local.error
    apiError = $api.error
    publicError = $public.error
  }
  $samples.Add($sample) | Out-Null

  Write-Host ("[7420-soak] {0} local={1} api={2} public={3} pending={4} queued={5} timeouts={6} slowThreadList={7}" -f `
    $sample.atIso, $sample.localOk, $sample.apiOk, $sample.publicOk, $sample.pendingRpcCount, $sample.queuedRpcCount, $sample.newTimeoutCount, $sample.slowThreadListCount)

  if ($consecutiveLocalFailures -gt $MaxConsecutiveFailures) {
    $failures.Add("local health failed $consecutiveLocalFailures times in a row") | Out-Null
  }
  if ($consecutiveApiFailures -gt $MaxConsecutiveFailures) {
    $failures.Add("codex-api health failed $consecutiveApiFailures times in a row") | Out-Null
  }
  if (-not $SkipPublic -and $consecutivePublicFailures -gt $MaxConsecutiveFailures) {
    $failures.Add("public health failed $consecutivePublicFailures times in a row") | Out-Null
  }
  if ($queuedRpcCount -gt $MaxQueuedRpc) {
    $failures.Add("queuedRpcCount $queuedRpcCount exceeded $MaxQueuedRpc") | Out-Null
  }
  if ($pendingRpcCount -gt $MaxPendingRpc) {
    $failures.Add("pendingRpcCount $pendingRpcCount exceeded $MaxPendingRpc") | Out-Null
  }
  if ($newTimeouts.Count -gt 0) {
    $failures.Add("new RPC timeout detected") | Out-Null
  }

  if ($failures.Count -gt 0) {
    break
  }

  $remaining = [Math]::Max(0, [int][Math]::Ceiling(($deadline - (Get-Date)).TotalSeconds))
  if ($remaining -le 0) {
    break
  }
  Start-Sleep -Seconds ([Math]::Min($IntervalSeconds, $remaining))
}

$completedAt = Get-Date
$passed = $failures.Count -eq 0
$publicReportUrl = $PublicBaseUrl
if ($SkipPublic) {
  $publicReportUrl = $null
}
$summary = [pscustomobject]@{
  passed = $passed
  startedAtIso = $startedAtIso
  completedAtIso = $completedAt.ToUniversalTime().ToString("o")
  durationSeconds = [int][Math]::Round(($completedAt - $startedAt).TotalSeconds)
  sampleCount = $samples.Count
  maxQueuedRpcCount = $maxQueuedObserved
  maxPendingRpcCount = $maxPendingObserved
  newTimeoutCount = $newTimeoutCount
  slowThreadListCount = $slowThreadListCount
  failures = @($failures.ToArray())
  localBaseUrl = $LocalBaseUrl
  publicBaseUrl = $publicReportUrl
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $OutputDir "soak-$stamp.json"
[pscustomobject]@{
  summary = $summary
  samples = @($samples.ToArray())
} | ConvertTo-Json -Depth 12 | Set-Content -Path $reportPath -Encoding UTF8

Write-Host "[7420-soak] report: $reportPath"
if ($passed) {
  Write-Host "[7420-soak] passed samples=$($samples.Count) maxPending=$maxPendingObserved maxQueued=$maxQueuedObserved timeouts=$newTimeoutCount slowThreadList=$slowThreadListCount"
  exit 0
}

Write-Host "[7420-soak] failed: $($failures -join '; ')"
exit 1
