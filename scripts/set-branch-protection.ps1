param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,
  [Parameter(Mandatory = $true)]
  [string]$Repo,
  [Parameter(Mandatory = $true)]
  [string]$Token,
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$uri = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection"
$headers = @{
  Accept = "application/vnd.github+json"
  Authorization = "Bearer $Token"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$body = @{
  required_status_checks = @{
    strict = $true
    checks = @(
      @{ context = "validate" }
    )
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
    require_last_push_approval = $false
  }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
  required_conversation_resolution = $true
  lock_branch = $false
  allow_fork_syncing = $true
}

Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -ContentType "application/json" | Out-Null
Write-Host "Branch protection applied to $Owner/$Repo ($Branch)."
