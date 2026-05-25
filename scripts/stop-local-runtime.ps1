param(
  [int[]]$Ports = @(3000, 3001),
  [string]$PrismaDevServerName = "default"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$npxPath = "C:\Program Files\nodejs\npx.cmd"

function Write-Step {
  param([string]$Message)
  Write-Host "[local-stop] $Message"
}

foreach ($port in $Ports) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if (-not $listeners) {
    Write-Step "No listener found on port $port."
    continue
  }

  foreach ($processId in $listeners) {
    if (-not $processId) {
      continue
    }

    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Step "Stopped process $processId on port $port."
    } catch {
      Write-Step "Could not stop process $processId on port ${port}: $($_.Exception.Message)"
    }
  }
}

if (Test-Path $npxPath) {
  Set-Location $repoRoot
  try {
    & $npxPath prisma dev stop $PrismaDevServerName | Out-Host
    Write-Step "Requested Prisma dev server '$PrismaDevServerName' stop."
  } catch {
    Write-Step "Could not stop Prisma dev server '$PrismaDevServerName': $($_.Exception.Message)"
  }
} else {
  Write-Step "npx was not found; skipped Prisma dev stop."
}
