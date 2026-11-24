#Requires -Version 7
<#
.SYNOPSIS
  Deploy idempotente do Outline GDrive Wiki.
.DESCRIPTION
  Re-rodar é seguro: valida, faz backup, sobe com health-gate, resume no fim.
  Uso: ./deploy.ps1 [-EnvFile PATH] [-NoBackup] [-Yes] [-Timeout SECS] [-Pull|-NoPull]
#>
[CmdletBinding()]
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot ".env"),
  [switch]$NoBackup,
  [switch]$Yes,
  [int]$Timeout = 300,
  [switch]$Pull,
  [switch]$NoPull
)

$ErrorActionPreference = "Stop"

$infraDir = $PSScriptRoot
$composeBase = Join-Path $infraDir "docker-compose.yml"
$composeProd = Join-Path $infraDir "docker-compose.prod.yml"
$overlay = @()
if ((Test-Path $composeProd) -and $env:DEPLOY_ENV -eq "prod") { $overlay = @("-f", $composeProd) }

function Invoke-Compose([string[]]$ComposeArgs) {
  $output = & docker compose --env-file $EnvFile -f $composeBase @overlay @ComposeArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($ComposeArgs -join ' ') falhou:`n$output" }
  return $output
}

function Get-EnvValue([string]$Name) {
  $line = Select-String -Path $EnvFile -Pattern "^$Name=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line.Line -split "=", 2)[1].Trim()
}

Write-Output "==> phase 1/6 preflight"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "docker não encontrado" }
if (-not (Test-Path $composeBase)) { throw "compose base ausente: $composeBase" }
if (-not (Test-Path $EnvFile)) { throw "env ausente: $EnvFile (copie de .env.example)" }

Write-Output "==> phase 2/6 env-validate (fail fast, sem expor valores)"
$missing = @()
foreach ($var in @("POSTGRES_PASSWORD","SECRET_KEY","UTILS_SECRET","GEMINI_API_KEY","ANYTHINGLLM_JWT_SECRET","ANYTHINGLLM_AUTH_TOKEN","ANYTHINGLLM_API_KEY","OUTLINE_API_KEY","DRIVE_SA_KEY_PATH","DRIVE_ROOT_FOLDER_ID")) {
  if ([string]::IsNullOrWhiteSpace((Get-EnvValue $var))) { $missing += $var }
}
if ($missing.Count -gt 0) { throw "variáveis vazias no env: $($missing -join ' ')" }
if (-not (Test-Path (Get-EnvValue "DRIVE_SA_KEY_PATH"))) { throw "DRIVE_SA_KEY_PATH não existe" }
Invoke-Compose @("config", "-q") | Out-Null

Write-Output "==> phase 3/6 backup"
if (-not $NoBackup) {
  if (-not $Yes) {
    $ans = Read-Host "Rodar backup pré-deploy? [Y/n]"
    if ($ans -match "^[nN]") { $NoBackup = $true }
  }
}
if (-not $NoBackup) {
  Invoke-Compose @("--profile", "tools", "run", "--rm", "backup") | Out-Null
} else {
  Write-Output "backup pulado (-NoBackup)"
}

Write-Output "==> phase 4/6 images"
$pullMode = "missing"
if ($Pull) { $pullMode = "always" }
if ($NoPull) { $pullMode = "never" }
if ($pullMode -ne "never") {
  try { Invoke-Compose @("pull", "--policy", $pullMode) | Out-Null }
  catch { Invoke-Compose @("pull") | Out-Null }
}
Invoke-Compose @("build", "chat", "importer") | Out-Null

Write-Output "==> phase 5/6 up + health-gate (timeout ${Timeout}s)"
try {
  Invoke-Compose @("up", "-d", "--wait", "--wait-timeout", "$Timeout") | Out-Null
} catch {
  Invoke-Compose @("ps")
  Invoke-Compose @("logs", "--tail=100")
  throw "health-gate falhou — containers mantidos para diagnóstico"
}

Write-Output "==> phase 6/6 summary"
Invoke-Compose @("ps")
$edgePort = Get-EnvValue "EDGE_PORT"
if ([string]::IsNullOrWhiteSpace($edgePort)) { $edgePort = "8091" }
Write-Output "Wiki: http://127.0.0.1:$edgePort  Chat: http://127.0.0.1:$edgePort/chat/"
Write-Output "deploy OK"
