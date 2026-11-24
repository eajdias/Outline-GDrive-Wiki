#requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$SkipBackup,
    [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$infraDir = $PSScriptRoot
$repoRoot = Split-Path -Parent $infraDir
$composeFile = Join-Path $infraDir 'docker-compose.yml'
$logFile = Join-Path $infraDir 'update-outline.log'
$backupDir = Join-Path $infraDir 'backups'

function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    $line | Tee-Object -FilePath $logFile -Append
}

if (-not (Test-Path $composeFile)) { throw "Compose file not found: $composeFile" }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Write-Log "=== Outline auto-update start ==="
Push-Location $repoRoot
try {
    $outlineContainer = (docker compose -f $composeFile ps -q outline).Trim()
    $postgresContainer = (docker compose -f $composeFile ps -q postgres).Trim()
    if (-not $outlineContainer) { throw "Outline container is not running." }
    Write-Log "Current container image: $((docker inspect --format '{{.Image}}' $outlineContainer).Trim())"

    if (-not $SkipBackup) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $dumpName = "pre-update-$stamp.dump"
        $tmpPath = "/tmp/$dumpName"
        $destPath = Join-Path $backupDir $dumpName
        Write-Log "Creating pre-update DB backup: $destPath"
        docker compose -f $composeFile exec -T postgres pg_dump -U outline -Fc outline -f $tmpPath
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
        docker cp "${postgresContainer}:$tmpPath" $destPath
        if ($LASTEXITCODE -ne 0) { throw "docker cp backup failed with exit code $LASTEXITCODE" }
        docker compose -f $composeFile exec -T postgres rm -f $tmpPath | Out-Null
        Write-Log "Backup created: $destPath"
    } else {
        Write-Log "Skipping pre-update backup (-SkipBackup)"
    }

    Write-Log "Pulling outlinewiki/outline:latest"
    docker compose -f $composeFile pull outline
    if ($LASTEXITCODE -ne 0) { throw "docker compose pull outline failed with exit code $LASTEXITCODE" }

    Write-Log "Applying update (recreate outline if image changed)"
    docker compose -f $composeFile up -d --no-deps outline
    if ($LASTEXITCODE -ne 0) { throw "docker compose up -d outline failed with exit code $LASTEXITCODE" }

    Write-Log "Waiting for outline health (timeout ${HealthTimeoutSeconds}s)..."
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        $outlineContainer = (docker compose -f $composeFile ps -q outline).Trim()
        if (-not $outlineContainer) { Start-Sleep -Seconds 5; continue }
        $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $outlineContainer 2>$null
        if ($LASTEXITCODE -eq 0 -and $health -eq 'healthy') { $healthy = $true; break }
        if ($LASTEXITCODE -eq 0 -and $health -eq 'running') {
            # Accept running if the image has no healthcheck configured.
            $hasHealth = docker inspect --format '{{if .State.Health}}yes{{else}}no{{end}}' $outlineContainer 2>$null
            if ($LASTEXITCODE -eq 0 -and $hasHealth -eq 'no') { $healthy = $true; break }
        }
        Start-Sleep -Seconds 5
    }
    if (-not $healthy) {
        $outlineContainer = (docker compose -f $composeFile ps -q outline).Trim()
        $state = docker inspect --format '{{json .State}}' $outlineContainer 2>$null
        throw "Outline did not become healthy within ${HealthTimeoutSeconds}s. State: $state"
    }

    $afterImage = (docker inspect --format '{{.Image}}' $outlineContainer).Trim()
    $imageInfo = docker image inspect outlinewiki/outline:latest --format '{{.Id}} {{.Created}}' 2>$null
    Write-Log "Container image after update: $afterImage"
    Write-Log "outlinewiki/outline:latest => $imageInfo"
    Write-Log "Result: outline updated/recreated"
    Write-Log "=== Outline auto-update end (success) ==="
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    Write-Log "=== Outline auto-update end (failed) ==="
    throw
} finally {
    Pop-Location
}
