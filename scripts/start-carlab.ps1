# CARLAB Windows launcher: exactly two persistent local services.
# Workbench: 5173. Agent command center: 5174. Logs on F:.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = 'E:\ARUANJIAN\node\node.exe'
if (-not (Test-Path $node)) {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { throw 'Cannot find Node.js. Check E:\ARUANJIAN\node\node.exe' }
  $node = $command.Source
}
$logDir = 'F:\tmp\carlab_services'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Ensure-Service([int]$port, [string]$script, [string]$tag) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
    $line = [string]$existing.CommandLine
    if (-not $line.Contains($script)) {
      throw "Port $port is used by a different process (PID $($conn.OwningProcess)); CARLAB did not replace it."
    }
    Write-Host "[CARLAB] $tag already running on $port; PID $($conn.OwningProcess)"
    return
  }
  $stdout = Join-Path $logDir "$tag.stdout.log"
  $stderr = Join-Path $logDir "$tag.stderr.log"
  $proc = Start-Process -FilePath $node -ArgumentList $script -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 250
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { break }
  }
  if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
    throw "$tag failed to start on $port. See $stderr"
  }
  Write-Host "[CARLAB] $tag started on $port; PID $($proc.Id)"
}

Ensure-Service 5173 'server.mjs' 'workbench'
Ensure-Service 5174 'command-center/server.mjs' 'dashboard'
foreach ($url in @('http://127.0.0.1:5173/','http://127.0.0.1:5174/api/dashboard')) {
  $reply = Invoke-WebRequest -UseBasicParsing -TimeoutSec 12 -Uri $url
  if ($reply.StatusCode -ne 200) { throw "Unhealthy service: $url" }
}
Write-Host '[CARLAB] Both web services are healthy.'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (Test-Path $chrome) {
  Start-Process -FilePath $chrome -ArgumentList @('http://127.0.0.1:5174/#dispatch','http://127.0.0.1:5173/') | Out-Null
} else {
  Start-Process 'http://127.0.0.1:5174/#dispatch'
  Start-Process 'http://127.0.0.1:5173/'
}
Write-Host 'Command center: http://localhost:5174/#dispatch'
Write-Host 'Vehicle workbench: http://localhost:5173/'
