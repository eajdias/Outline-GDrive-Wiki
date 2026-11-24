# ADR 0002 — AnythingLLM headless, consumido somente via API

**Status:** aceito

## Decisão

- O AnythingLLM **não expõe porta pública**; fica apenas na rede interna do compose. Toda integração é via `/v1` com API key (só no backend).
- A experiência do usuário é uma **UI própria** (`apps/chat`) que consome `POST /v1/workspace/kb-drive/chat` e exibe `textResponse` + `sources[]` (título, link para Drive/Outline, score). Workspace único: **`kb-drive`**.
- O widget/embed nativo está **descartado como caminho de produto** (testado em 1.16.1: o stream não devolve `sources`), porque confirmação de fonte é requisito.
- IA **100% remota via API Gemini** (chat + embeddings). Nenhum modelo local: a VPS não tem GPU nem folga para isso.

## Consequências

- Perdemos os recursos da UI nativa (gestão visual de workspaces) — aceitável, pois a autoria é no Drive.
- A API key do AnythingLLM é segredo crítico, com rotação documentada no runbook.
