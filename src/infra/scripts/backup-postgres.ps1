#Requires -Version 7
<#
.SYNOPSIS
  Backup do Postgres (dump) + teste de restore em banco scratch.
.DESCRIPTION
  1) pg_dump -Fc dentro do container para /tmp e copia para src/backups/.
  2) Restaura o dump num banco scratch (outline_restore_test), conta os
     documentos vivos e compara com o banco real. Diferença = falha.
  O backup é local; não há upload de nuvem.
  Equivalente Linux no runbook (docs/runbook.md).
#>
[CmdletBinding()]
param(
  [string]$ProjectDir = (Split-Path $PSScriptRoot -Parent),
  [string]$OutDir = "backups"
)

$ErrorActionPreference = "Stop"

function Invoke-Compose([string[]]$ComposeArgs) {
  $output = & docker compose -f (Join-Path $ProjectDir "docker-compose.yml") @ComposeArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($ComposeArgs -join ' ') falhou:`n$output" }
  return $output
}

$stamp = Get-Date -Format yyyyMMdd-HHmm
$destDir = Join-Path (Split-Path $ProjectDir -Parent) $OutDir
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir "outline-$stamp.dump"

Write-Output "== dump =="
Invoke-Compose @("exec", "-T", "postgres", "pg_dump", "-U", "outline", "-Fc", "outline", "-f", "/tmp/outline-backup.dump") | Out-Null
Invoke-Compose @("cp", "postgres:/tmp/outline-backup.dump", $dest) | Out-Null
Write-Output "dump em $dest ($((Get-Item $dest).Length) bytes)"

Write-Output "== restore test =="
Invoke-Compose @("exec", "-T", "postgres", "psql", "-U", "outline", "-d", "postgres", "-c", "DROP DATABASE IF EXISTS outline_restore_test;") | Out-Null
Invoke-Compose @("exec", "-T", "postgres", "psql", "-U", "outline", "-d", "postgres", "-c", "CREATE DATABASE outline_restore_test;") | Out-Null
Invoke-Compose @("exec", "-T", "postgres", "pg_restore", "-U", "outline", "-d", "outline_restore_test", "--no-owner", "/tmp/outline-backup.dump") | Out-Null

$live = (Invoke-Compose @("exec", "-T", "postgres", "psql", "-U", "outline", "-d", "outline", "-tA", "-c", 'select count(*) from documents where "deletedAt" is null and "archivedAt" is null;')).Trim()
$restored = (Invoke-Compose @("exec", "-T", "postgres", "psql", "-U", "outline", "-d", "outline_restore_test", "-tA", "-c", 'select count(*) from documents where "deletedAt" is null and "archivedAt" is null;')).Trim()
Write-Output "vivos: real=$live restore=$restored"

Invoke-Compose @("exec", "-T", "postgres", "psql", "-U", "outline", "-d", "postgres", "-c", "DROP DATABASE outline_restore_test;") | Out-Null
Invoke-Compose @("exec", "-T", "postgres", "rm", "/tmp/outline-backup.dump") | Out-Null

if ($live -ne $restored) { throw "restore divergente: real=$live restore=$restored" }
Write-Output "restore OK ($restored documentos vivos)"
