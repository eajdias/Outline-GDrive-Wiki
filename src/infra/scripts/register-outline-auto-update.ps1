#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$Time = '03:00',
    [string]$TaskName = 'Outline-AutoUpdate'
)

$ErrorActionPreference = 'Stop'

$updateScript = Join-Path $PSScriptRoot 'update-outline.ps1'
if (-not (Test-Path $updateScript)) { throw "Update script not found: $updateScript" }

$pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
$taskCommand = '"' + $pwsh + '" -NoProfile -ExecutionPolicy Bypass -File "' + $updateScript + '"'

# /F overwrites if the task already exists; runs in the current user context.
schtasks.exe /Create /TN $TaskName /SC DAILY /ST $Time /TR $taskCommand /F
if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed with exit code $LASTEXITCODE" }

Write-Host "Scheduled task '$TaskName' registered to run daily at $Time."
schtasks.exe /Query /TN $TaskName /FO LIST /V | Select-String -Pattern 'TaskName|Status|Task To Run|Schedule Type|Start Time|Last Run Time|Next Run Time|Logon Mode'
