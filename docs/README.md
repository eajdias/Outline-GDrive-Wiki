# Documentação

Roteador por perfil — escolha quem você é:

- **Primeira vez aqui?** → [`setup.md`](setup.md): tutorial do zero ao wiki com chat (~30 min).
- **Operando a stack?** → [`runbook.md`](runbook.md): how-tos por problema (saúde, sync, chat, backup, credencial).
- **Entendendo os porquês?** → [`architecture.md`](architecture.md): contexto, containers, importação e pergunta.
- **Ajustando segredos e rede?** → [`security.md`](security.md): onde moram, superfície, antes de expor.
- **Somando cotas de LLM?** → [`adr/0005-llm-gateway-cota.md`](adr/0005-llm-gateway-cota.md) + `apps/llm-gateway/README.md`: rotação de chaves e provedores.
- **Por que foi decidido assim?** → [`adr/`](adr/): 0001 Drive-fonte, 0002 AnythingLLM headless, 0003 edge único, 0004 infra Docker, 0005 gateway de cota.
- **Contribuindo com código?** → [`CONTRIBUTING.md`](CONTRIBUTING.md): gate, regras, PR.
- **Gerando release para a VPS?** → [`runbook.md`](runbook.md#release-gerar-o-tarball-transportável): tarball de fonte + build no alvo.

Referência rápida (espelha o código, não duplica): serviços e env em `src/infra/docker-compose.yml` + `src/infra/.env.example`; contrato do importer em `apps/importer/README.md`; contrato do chat em `apps/chat/README.md`; contrato do gateway em `apps/llm-gateway/README.md`.

Regra de sincronia: mudou comportamento, muda o doc no mesmo commit. Em divergência, o código vence e o doc é corrigido junto.
