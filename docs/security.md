# Segurança

Modelo de ameaça: qualquer visitante com login válido no Outline. A wiki e o chat exigem sessão do Outline; não há autenticação por documento nem varredura de segredos no importador.

## Onde moram os segredos

`.env` fora do git (`600` no servidor), `.env.example` lista tudo sem valor. Chaves: `SECRET_KEY`/`UTILS_SECRET`, senha do Postgres, API keys do AnythingLLM, Outline e Gemini (`GEMINI_API_KEYS`, uma ou mais), `LLM_GATEWAY_TOKEN`, JSON da service account (fora do repo, via `DRIVE_SA_KEY_PATH`). Rotação em [`runbook.md`](runbook.md#trocar-credencial).

As chaves do provedor LLM vivem **só** no `llm-gateway`; o AnythingLLM fala com ele por `LLM_GATEWAY_TOKEN`. Rotacionar = editar `GEMINI_API_KEYS` e recriar o gateway.

## Superfície de rede

No local, o edge publica `127.0.0.1:8091` e o Outline publica `127.0.0.1:3000` para acesso direto; em host dedicado, o overlay prod remove as portas diretas e só o edge publica 22/80/443 com TLS; em host compartilhado, o overlay vps remove as portas diretas e o edge segue em `127.0.0.1:8091` atrás do reverse proxy do host (TLS no host). Postgres, Redis, AnythingLLM, llm-gateway, chat e importer ficam na rede interna do compose. O AnythingLLM só fala `/v1` com API key — e a chave nunca vai ao navegador.

O overlay de produção remove as portas de dev com `!override`; `ports: []` sozinho **não** remove (o Compose soma listas no merge). Fora do Compose, o edge só confia em `X-Real-IP`/`X-Forwarded-For` quando o peer direto é privado (o próprio edge), então o rate limit do chat não é forjável por header.

## Quem vê o quê

O chat nega qualquer rota (exceto `/healthz`) sem uma sessão válida do Outline: o edge repassa o cookie `accessToken` e o chat valida em `POST /api/auth.info` em `OUTLINE_AUTH_URL` (`http://outline:3000` por default). Qualquer usuário autenticado vê o acervo inteiro — não há auth por documento. O que contém: rate limit por IP (identidade vinda do edge, não do header forjado), corpo máximo de 8 KB e corte por score (`CHAT_MIN_SCORE`). O webhook do Drive exige `DRIVE_WEBHOOK_TOKEN`; `/drive-image/` serve imagens por ID opaco sem checar sessão. Logs nunca trazem `Authorization` ou cookies — regra de código em `src/AGENTS.md`.

## Conteúdo não confiável

Tudo que entra no RAG pode vazar numa resposta, inclusive por paráfrase. Trate conteúdo do wiki como não confiável (prompt injection). Sem varredura de segredos no importador (decisão registrada na ADR 0001).
