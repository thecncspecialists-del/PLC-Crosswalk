param(
  [Parameter(Mandatory = $true)]
  [string]$PrimaryEmail,
  [Parameter(Mandatory = $true)]
  [string]$CoworkerEmail,
  [string]$PrimaryName = "Primary Admin",
  [string]$CoworkerName = "Coworker Admin",
  [string]$TempPassword = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TempPassword)) {
  $TempPassword = [Convert]::ToBase64String((1..18 | ForEach-Object { Get-Random -Minimum 33 -Maximum 126 } | ForEach-Object { [byte]$_ }))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$npmPath = "C:\Program Files\nodejs\npm.cmd"

Set-Location $repoRoot

Write-Host "[provision-admins] Creating/updating primary admin: $PrimaryEmail"
& $npmPath run user:create-admin -- --email $PrimaryEmail --name $PrimaryName --temp-password $TempPassword

Write-Host "[provision-admins] Creating/updating coworker admin: $CoworkerEmail"
& $npmPath run user:create-admin -- --email $CoworkerEmail --name $CoworkerName --temp-password $TempPassword

Write-Host "[provision-admins] Done. Share the temporary password via a secure channel: $TempPassword"
