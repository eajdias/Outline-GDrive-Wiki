# Segurança

Modelo de ameaça: rede interna confiável. Nada aqui presume exposição pública — antes de abrir o acervo para fora, cumpra o item "Antes de expor" abaixo.

## Onde moram os segredos

`.env` fora do git (`600` no servidor), `.env.example` lista tudo sem valor. Chaves: `SECRET_KEY`/`UTILS_SECRET`, senha do Postgres, API keys do AnythingLLM, Outline e Gemini (`GEMINI_API_KEYS`, uma ou mais), `LLM_GATEWAY_TOKEN`, JSON da service account (fora do repo, via `DRIVE_SA_KEY_PATH`). Rotação em [`runbook.md`](runbook.md#trocar-credencial).

As chaves do provedor LLM vivem **só** no `llm-gateway`; o AnythingLLM fala com ele por `LLM_GATEWAY_TOKEN`. Rotacionar = editar `GEMINI_API_KEYS` e recriar o gateway.

## Superfície de rede

Só o edge publica porta (`127.0.0.1:8091` no local; 22/80/443 com TLS em produção). Postgres, Redis, AnythingLLM, llm-gateway, chat e importer ficam na rede interna do compose. O AnythingLLM só fala `/v1` com API key — e a chave nunca vai ao navegador.

O overlay de produção remove as portas de dev com `!override`; `ports: []` sozinho **não** remove (o Compose soma listas no merge). Fora do Compose, o edge só confia em `X-Real-IP`/`X-Forwarded-For` quando o peer direto é privado (o próprio edge), então o rate limit do chat não é forjável por header.

## Quem vê o quê

Sem autenticação por documento na v1: quem alcança o chat vê o acervo inteiro. O controle é posicional (rede restrita / página hospedeira). O que contém: rate limit por IP (com a identidade vinda do edge, não do header forjado), corpo máximo de 8 KB e corte por score (`CHAT_MIN_SCORE`). O webhook do Drive é fechado: sem `DRIVE_WEBHOOK_TOKEN` configurado, toda notificação é recusada. Logs nunca trazem `Authorization` — regra de código em `src/AGENTS.md`.

## Conteúdo não confiável

Tudo que entra no RAG pode vazar numa resposta, inclusive por paráfrase. Trate conteúdo do wiki como não confiável (prompt injection). Sem barreira de segredo na v1 (decisão registrada na ADR 0001).

## Antes de expor para fora da rede

Reintroduzir a varredura de segredos bloqueante no importador e rotacionar/redigir o que aparecer. Depois, reavaliar auth (sessão/token no edge ou no chat) — ver ADR 0003.
