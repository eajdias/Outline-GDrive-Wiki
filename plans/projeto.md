# Projeto — Base de conhecimento Drive + Outline + AnythingLLM

> Estado: funcional — wiki, chat e importador operando via Compose.

O Drive é onde se cria e edita; o Outline é onde se lê; o chat responde com citações. O git guarda infra, código e documentação — nunca conteúdo.

| Decisão | Por quê |
|---|---|
| Drive = fonte (ADR 0001) | Edição por pessoas, com versão nativa |
| AnythingLLM headless + API Gemini (ADR 0002) | Sem GPU na VPS; menos superfície |
| Edge único openresty (ADR 0003) | Wiki + chat + webhook + imagens num ponto |
| Importação idempotente com `verify` (ADR 0001) | Webhook como gatilho, poll como fallback |
| Backup local com restore testado (ADR 0004) | Sem dependência de nuvem |
| Storage `local` só para anexos (ADR 0004) | Conteúdo vem do Drive |

Operação contínua em [`docs/runbook.md`](../docs/runbook.md): backup diário com restore mensal, `apply` a cada 15 min, `verify` diário com alerta. Webhook real depende de HTTPS público (`DRIVE_WEBHOOK_URL`).
