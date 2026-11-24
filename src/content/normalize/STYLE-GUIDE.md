# Guia editorial para documentos do wiki (para agentes LLM)

> Objetivo: padronizar docs do wiki no formato abaixo antes de importar para o Outline.
> Leia este guia inteiro antes de padronizar qualquer doc.

## 1. Regra de ouro

**Preserve 100% da informação; mude só a apresentação.** Nunca invente comandos, valores,
caminhos ou comportamentos. O que não puder confirmar vira `:::warning` ou comentário HTML —
nunca texto afirmativo.

## 2. Frontmatter — NÃO TOCAR

Preserve byte a byte: `title, date, author, collection, tags, status`.
O `title` é o H1 do Outline — o corpo **nunca** contém `# Título`.

## 3. Estrutura do corpo (nesta ordem, omita o que não se aplicar)

```markdown
## 🎯 Objetivo
(1-2 frases: o que o doc entrega e quando usar.)

## ⚡ Resumo rápido
(Tabela 2 colunas com os valores-chave: versões, paths, prazos, containers.)

## Pré-requisitos
(Lista `-`: ambiente, acessos, ferramentas.)

## 1. 📌 <Primeira etapa> / ## 2. 📌 <Segunda etapa> ...
(Passos numerados, 1 ação por item. Comando em bloco ```bash, explicação em texto curto.)

:::warning / :::info / :::tip / :::success
(Avisos de risco, observações `obs:` do original, dicas. Sintaxe `:::` do Outline:
info = azul, tip = roxo, warning = laranja, success = verde.)

## Troubleshooting (opcional)
(Tabela Sintoma | Causa | Solução, se o original tiver erros conhecidos.)

## Referências
(Todos os links do original, um por linha, com rótulo.)
```

**Headings com emoji (§3a):** todo `##` leva 1 emoji à esquerda (`## 🎯 Objetivo`,
`## 1. 🧭 Princípios`). O índice lateral do Outline vira navegação visual.
Use o mesmo emoji para a mesma ideia em todos os docs (🎯 objetivo, ⚡ resumo,
🚨 risco/procedimento especial, 📊 indicadores, ✅ checklist, 💬 comunicação,
🧭 princípios, 🗂️ rotinas, 🔧 instalação, ❌ erros).

**Checklists operacionais (§3b):** rotinas de execução individual (deploy, pré-voo,
auditoria feita por uma pessoa que duplica o doc) usam `- [ ]` em vez de `-` — no
Outline viram caixas clicáveis. Leitura coletiva usa `-`: o estado do checkbox é
compartilhado (persiste no conteúdo, gera revisão). Só para itens acionáveis,
nunca para conceitos.

## 4. Regras de bloco

| Regra | Por quê |
|---|---|
| Corpo começa em `##`, hierarquia sequencial (`##` → `###`, sem pular) | Outline gera o índice a partir dos headings |
| `##` sempre com 1 emoji à esquerda (§3a) | Índice lateral vira navegação visual |
| `==termo==` só em números/prazos críticos e proibições (ex.: ==20 dias==, ==nunca…==) | Vira highlight amarelo no Outline; excesso dilui o efeito |
| Rotinas executáveis em `- [ ]` (§3b), conceitos em `-` | Checklist clicável vs lista de leitura |
| `- [ ]` SÓ em doc de execução individual (o responsável duplica o doc); leitura coletiva usa `-` | Estado do checkbox é compartilhado (persiste no conteúdo, gera revisão): marcar vira "concluído" para o time inteiro |
| Bloco de confiança no topo: `> Dono: X · Revisado em: AAAA-MM · Vale para: escopo` | Leitor sabe se o doc vale hoje; dados vêm do frontmatter/conteúdo, nunca inventados |
| Falas/scripts de atendimento em `>` (quote), nunca em bullets aninhados | Bloco de citação com destaque próprio |
| Doc com 5+ seções ganha `## 🧭 Neste documento` (mini-índice com links-âncora) | Navegação sem scroll; painel TOC nativo continua existindo |
| Parágrafo ≤ 5 linhas; nenhuma linha > 400 chars | Paredão de PDF não renderiza |
| Listas sempre `-` (nunca `‧`, `●`, `○`) | Só `-` vira `<ul>` no Outline |
| Código sempre em bloco cercado com linguagem (` ```bash `, ` ```cpp `, ` ```ini `) | Inline solto quebra a leitura |
| Tabela máx. 3-4 colunas | Coluna do Outline tem ~46em; tabela larga estoura |
| Imagem sempre com alt descritivo: `![O que é (ilustrativo — fonte: X)](url)` | Alt vira legenda/índice |

## 5. Imagens

- Na cópia do Outline (via API): prefira same-origin (`/uploads/*` servido pelo compose) ou URL pública estável. `http://localhost:8080` quebra fora da sua máquina (localhost do leitor) e sofre mixed-content no HTTPS público.
- Marque `(ilustrativo — fonte: <nome>)` no alt quando a imagem for reconstruída. Nunca passe imagem genérica por screenshot do ambiente.
- **NUNCA recrie print de código/tela como se fosse o original.** Substitua por bloco de código reconstruído, rotulado:
  `*Exemplo ilustrativo reconstruído — o print original se perdeu; ajuste <valores> para o seu caso.*`
- Se nada puder reconstruir, deixe `<!-- screenshot original ausente em <path> -->` (invisível na leitura, recuperável).

## 6. Links

- Links internos entre docs: `/doc/<slug>-<urlId>` (funcionam no Outline; relativo `.md` só no git).

## 7. Workflow por doc (lote unitário, nunca em massa sem revisão)

1. `git status --short` (não toque em arquivos sujos de terceiros).
2. Leia o doc inteiro e confira os anexos (se houver).
3. Reescreva no padrão (seções §3, blocos §4, imagens §5).
4. Valide: `python src/content/normalize/check-links.py` + `git diff` (só o seu arquivo).
5. Atualize no Outline via API (`documents.update` com `id` do doc — descubra via `documents.search`; corpo = markdown **sem** frontmatter).
6. Confirme retorno `OK <título> <url>` e abra o doc para inspeção visual.
7. **NÃO commite sem autorização** — deixe `M` no working tree e reporte o link.

## 8. Anti-padrões (não repetir)

- `# H1` no corpo (duplica o título do Outline).
- Linha > 400 chars / parágrafo-parede (resto de extração de PDF).
- Bullets `‧ ● ○` (não renderizam como lista).
- `![](url)` sem alt, empilhado, apontando para base errada.
- Nesting > 3 níveis — achatar quando padronizar.
- Doc "parede cinza": zero callout/tabela/checklist em doc operacional.
- `==highlight==` em tudo (só prazos críticos e proibições; o resto vira ruído).
- `- [ ]` em conceitos (checklist é só para ação executável).

## 9. Templates (um por tipo de doc)

- Procedimento (tutorial, passo a passo, rotina): `normalize/DOC-TEMPLATE.md`
- Referência (tabela de consulta — erros, parâmetros, specs): `normalize/DOC-TEMPLATE-REFERENCIA.md`
- Comunicado/política (regras, avisos, conduta): `normalize/DOC-TEMPLATE-COMUNICADO.md`

Copie o do tipo correspondente como ponto de partida de cada padronização.
O template inclui o bloco `## 🧭 Neste documento` (apague se o doc tiver < 5 seções).

## 10. Âncoras do mini-índice (gerar, nunca chutar)

A âncora de cada heading é calculada pelo próprio Outline (`build/shared/editor/lib/headingToSlug.js`):
`h-` + slugify do texto. Emojis são **mantidos** no slug, pontos são removidos,
acentos transliterados.

Gere com o runtime do container (fonte da verdade, não cálculo manual):

```bash
docker compose -f src/infra/docker-compose.yml exec -T outline node -e \
  "const s=require('/opt/outline/build/shared/editor/lib/headingToSlug').default; \
   ['## 1. 🔍 Avaliação de requisitos'].forEach(h=>console.log(s({textContent:h})))"
# → h-1-🔍-avaliacao-de-requisitos
```

## 11. Validar sintaxe nova antes de usar em massa

Recurso de formatação nunca usado antes (`==`, `- [ ]`, novo callout, emoji)?
Teste num doc rascunho reversível e apague em seguida:

1. `documents.create` (collection de rascunho, título `zz-teste-formatacao`) com o trecho.
2. `documents.info` e confira se o `text` sobreviveu ao round-trip do parser.
3. `documents.delete` (a resposta não vem em `data` — confirme com `documents.search` = 0 hits).
4. Só então aplique nos docs reais e registre o recurso aqui (§4).
