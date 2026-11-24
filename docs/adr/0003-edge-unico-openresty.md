# ADR 0003 — Edge único openresty: wiki com snippet + chat + imagens

**Status:** aceito 

## Decisão

- Edge = **openresty único** (`src/infra/edge/nginx.conf`): `/` → wiki (Outline) com **injeção do snippet do chat** antes de `</body>` + extensão do `script-src` do CSP **preservando o nonce**; `/chat/` → chat UI; `/hooks/drive` → webhook do importador; `/drive-image/` → proxy de imagens.
- **Sem autenticação no edge**: o controle de acesso é posicional (rede restrita / página hospedeira que já exige login). Quem alcança a URL vê o acervo inteiro; rate limit, corpo máximo e `CHAT_MIN_SCORE` ficam no app.
- Limite de corpo de **8 KB** no edge e no app (`/ask` maior responde 413).
- Em produção o mesmo `nginx.conf` ganha TLS (portas 22/80/443); mais nada publica porta no host.

## Consequências

- Acoplamento ao markup (`</body>`) e ao formato do CSP do Outline: o smoke pós-update do Outline precisa conferir a bolha.
- Se o chat for exposto em rede aberta, reintroduzir auth (sessão/token) antes.
