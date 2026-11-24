#Requires -Version 7
<#
.SYNOPSIS
  Abre o Outline local já autenticado, sem magic link.

.DESCRIPTION
  Gera um token de transferência one-time com o próprio código do servidor
  (assinado com o jwtSecret do usuário), abre /auth/redirect no navegador padrão
  e o Outline troca o token por um cookie de sessão de 3 meses.

  Uso local/homolog. Não é um bypass de produção: exige acesso ao container do
  Outline e ao banco. O token não é impresso e o arquivo temporário é apagado.

.PARAMETER Email
  E-mail do usuário. Default: primeiro usuário com papel "admin".
#>
[CmdletBinding()]
param(
  [string]$Email = ""
)

$ErrorActionPreference = "Stop"

$composeFile = (Resolve-Path (Join-Path $PSScriptRoot "../docker-compose.yml")).Path
$container = (docker compose -f $composeFile ps -q outline).Trim()
if (-not $container) {
  throw "Serviço outline não está rodando. Suba a stack primeiro (docker compose -f src/infra/docker-compose.yml up -d)."
}

$tempDir = if ($env:ENVCTL_TEMP) { $env:ENVCTL_TEMP } else { $env:TEMP }
$stamp = "kb-outline-$PID"
$tmpJs = Join-Path $tempDir "$stamp.cjs"
$tmpUrl = Join-Path $tempDir "$stamp.url.txt"

$js = @'
const fs = require("node:fs");
const jwt = require("/opt/outline/node_modules/jsonwebtoken");
require("/opt/outline/build/server/storage/database.js");
const { User } = require("/opt/outline/build/server/models/index.js");

(async () => {
  const where = process.env.OUTLINE_LOGIN_EMAIL
    ? { email: process.env.OUTLINE_LOGIN_EMAIL }
    : { role: "admin" };
  const user = await User.findOne({ where, order: [["createdAt", "ASC"]] });
  if (!user) throw new Error("usuário não encontrado");

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const token = jwt.sign(
    { id: user.id, type: "transfer", createdAt, expiresAt },
    user.jwtSecret,
  );

  const base = (process.env.URL || "http://localhost:3000").replace(/\/+$/, "");
  fs.writeFileSync(
    "/tmp/outline-login-url.txt",
    `${base}/auth/redirect?token=${encodeURIComponent(token)}`,
    { mode: 0o600 },
  );
  console.log(user.email);
  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
'@

try {
  Set-Content -Path $tmpJs -Value $js -Encoding utf8
  docker cp $tmpJs "${container}:/tmp/mint-outline.cjs" | Out-Null

  if ($Email) {
    $userEmail = docker exec -e "OUTLINE_LOGIN_EMAIL=$Email" $container node --no-warnings /tmp/mint-outline.cjs
  } else {
    $userEmail = docker exec $container node --no-warnings /tmp/mint-outline.cjs
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar a sessão do Outline."
  }

  docker cp "${container}:/tmp/outline-login-url.txt" $tmpUrl | Out-Null
  $url = (Get-Content $tmpUrl -Raw).Trim()
  $origin = ($url -split '\?')[0]

  Write-Host "Abrindo $origin como $($userEmail.Trim()) (cookie de sessão: 3 meses)."
  Start-Process $url
} finally {
  Remove-Item $tmpJs, $tmpUrl -Force -ErrorAction SilentlyContinue
  docker exec -u 0 $container sh -c "rm -f /tmp/mint-outline.cjs /tmp/outline-login-url.txt" 2>$null | Out-Null
}
