# ADR 0003 — Edge único openresty: wiki com snippet + chat + imagens

**Status:** aceito 

## Decisão

- Edge = **openresty único** (`src/infra/edge/nginx.conf`): `/` → wiki (Outline) com **injeção do snippet do chat** antes de `</body>` + extensão do `script-src` do CSP **preservando o nonce**; `/chat/` → chat UI; `/hooks/drive` → webhook do importador; `/drive-image/` → proxy de imagens.
- **Autenticação no app, não no edge**: o edge repassa o cookie `accessToken` e o chat valida a sessão em `POST /api/auth.info` do Outline em todas as rotas exceto `/healthz`. Rate limit, corpo máximo e `CHAT_MIN_SCORE` também ficam no app.
- Limite de corpo de **8 KB** no edge e no app (`/ask` maior responde 413).
- Em produção o mesmo `nginx.conf` ganha TLS (portas 22/80/443); mais nada publica porta no host.

## Consequências

- Acoplamento ao markup (`</body>`) e ao formato do CSP do Outline: o smoke pós-update do Outline precisa conferir a bolha.
- Expor em rede aberta exige revisar `/drive-image/`, que serve imagens por ID opaco sem checar sessão; `/chat/` já exige login do Outline.
