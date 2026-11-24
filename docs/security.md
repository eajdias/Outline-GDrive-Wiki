# Segurança

Modelo de ameaça: rede interna confiável. Nada aqui presume exposição pública — antes de abrir o acervo para fora, cumpra o item "Antes de expor" abaixo.

## Onde moram os segredos

`.env` fora do git (`600` no servidor), `.env.example` lista tudo sem valor. Chaves: `SECRET_KEY`/`UTILS_SECRET`, senha do Postgres, API keys do AnythingLLM, Outline e Gemini, JSON da service account (fora do repo, via `DRIVE_SA_KEY_PATH`). Rotação em [`runbook.md`](runbook.md#trocar-credencial).

## Superfície de rede

Só o edge publica porta (`127.0.0.1:8091` no local; 22/80/443 com TLS em produção). Postgres, Redis, AnythingLLM, chat e importer ficam na rede interna do compose. O AnythingLLM só fala `/v1` com API key — e a chave nunca vai ao navegador.

## Quem vê o quê

Sem autenticação por documento na v1: quem alcança o chat vê o acervo inteiro. O controle é posicional (rede restrita / página hospedeira). O que contém: rate limit, corpo máximo de 8 KB e corte por score (`CHAT_MIN_SCORE`). Logs nunca trazem `Authorization` — regra de código em `src/AGENTS.md`.

## Conteúdo não confiável

Tudo que entra no RAG pode vazar numa resposta, inclusive por paráfrase. Trate conteúdo do wiki como não confiável (prompt injection). Sem barreira de segredo na v1 (decisão registrada na ADR 0001).

## Antes de expor para fora da rede

Reintroduzir a varredura de segredos bloqueante no importador e rotacionar/redigir o que aparecer. Depois, reavaliar auth (sessão/token no edge ou no chat) — ver ADR 0003.
