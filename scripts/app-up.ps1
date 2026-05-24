param(
  [ValidateSet("start", "dev")]
  [string]$Mode = "start",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$npmPath = "C:\Program Files\nodejs\npm.cmd"
$npxPath = "C:\Program Files\nodejs\npx.cmd"

function Write-Step {
  param([string]$Message)
  Write-Host "[app-up] $Message"
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$Attempts = 45
  )

  for ($i = 1; $i -le $Attempts; $i += 1) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      # keep waiting
    }
    Start-Sleep -Milliseconds 800
  }

  return $false
}

Set-Location $repoRoot

Write-Step "Ensuring Prisma local service is running..."
& $npxPath prisma dev start default | Out-Null

Write-Step "Cleaning up any listener already bound to port $Port..."
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $listeners) {
  if ($processId) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Step "Stopped process $processId on port $Port."
    } catch {
      Write-Step "Could not stop process $processId (continuing)."
    }
  }
}

if ($Mode -eq "start") {
  $buildIdPath = Join-Path $repoRoot ".next\BUILD_ID"
  if (-not (Test-Path $buildIdPath)) {
    Write-Step "No production build found. Running npm run build..."
    & $npmPath run build
  }
}

Write-Step "Starting Next.js ($Mode) on port $Port..."
$cmd = "cd /d `"$repoRoot`" && `"$npmPath`" run $Mode -- --port $Port"
$proc = Start-Process -FilePath "C:\Windows\System32\cmd.exe" -ArgumentList "/c", $cmd -WindowStyle Hidden -PassThru

if (-not (Wait-ForHttp -Url "http://localhost:$Port/sign-in")) {
  throw "Server process started (PID $($proc.Id)) but health check failed for http://localhost:$Port/sign-in."
}

Write-Step "Server is up at http://localhost:$Port"
Write-Step "Sign in with the ADMIN_EMAIL and ADMIN_PASSWORD values from .env."
