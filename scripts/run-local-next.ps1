param(
  [ValidateSet("dev", "start")]
  [string]$Mode = "dev",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NextArgs = @()
)

$ErrorActionPreference = "Stop"

if ($env:PLC_ALLOW_LOCAL_RUNTIME -ne "1") {
  throw "Local PLC Crosswalk runtime is disabled. Use https://plc.thecnc.network. Set PLC_ALLOW_LOCAL_RUNTIME=1 only for an explicit emergency local run."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$nextPath = Join-Path $repoRoot "node_modules\.bin\next.cmd"

if (-not (Test-Path $nextPath)) {
  throw "Next.js binary was not found. Run npm install before using the emergency local runtime override."
}

Set-Location $repoRoot
& $nextPath $Mode @NextArgs
exit $LASTEXITCODE
