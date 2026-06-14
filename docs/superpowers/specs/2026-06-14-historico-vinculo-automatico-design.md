# Histórico de vínculos automáticos no modal de fluxo — Design

**Status:** Aprovado para planejamento
**Subprojeto:** 5 de 5 (ver `categorizacao-automatica-importacao`)
**Depende de:** Subprojeto 3 (vínculo automático trilho↔cortina/forro) — já implementado e em `main`.

## Contexto

O subprojeto 3 já registra, em `pedido_auditoria`, um registro com `acao = "vinculo_automatico"` para cada vínculo criado automaticamente durante a importação (`vinculoAutomaticoService.js:75-82`), com `descricao` no formato:

```
Vínculo automático: "Trilho Wave" → "Cortina Wave" (ambiente: Sala, largura: 1.5m)
```

Esses registros já são retornados por `GET /pedidos/:id/auditoria` (sem filtro de `etapa`) e já aparecem em `HistoricoPedidoModal.jsx`, mas com dois problemas de exibição:

1. **Ícone/label genéricos:** `acao = "vinculo_automatico"` não está em `ICONES_ACAO` nem em `LABELS_ACAO`, então cai no fallback: ícone 🔧 e label "Vinculo Automatico" (sem acento, via title-case do nome bruto da ação).
2. **Perda de contexto:** `parseDiffs` usa a regex `/(?:^|,\s*)([^:,]+): "([^"]*)" → "([^"]*)"/g`, criada para o formato de `acao = "edicao"` (`Campo: "antes" → "depois"`). Essa regex também "casa" acidentalmente com a descrição de `vinculo_automatico` (que tem o mesmo padrão `"X" → "Y"`), produzindo um diff `{campo: "Vínculo automático", antes: "Trilho Wave", depois: "Cortina Wave"}` e **descartando silenciosamente** o sufixo `(ambiente: Sala, largura: 1.5m)`.

Confirmado por leitura do código: `acao = "edicao"` (gerado em `pedidoService.js`, linhas 485/494/504/515) é o único tipo de ação cujas descrições são compostas inteiramente por segmentos `Campo: "antes" → "depois"`. `acao = "categorizacao"` (`pedidosRoutes.js:768`) usa outro formato e não é afetado pelo bug.

A rota manual de vínculo (`POST /pedidos/:id/vinculos`, `pedidosRoutes.js:634-674`) **não** registra auditoria — não gera nenhum registro a ser exibido, então está fora de escopo.

## Objetivo

- Registros `acao = "vinculo_automatico"` aparecem no histórico com ícone e label apropriados (🔗 "Vínculo automático").
- A descrição completa, incluindo `(ambiente: ..., largura: ...)`, é exibida integralmente como texto.
- Nenhuma regressão na exibição de `acao = "edicao"` (que continua usando `parseDiffs` normalmente).

## Arquitetura

Mudança isolada em `frontend-web/src/pages/pedidos/fluxo/etapas/HistoricoPedidoModal.jsx` — sem alterações de backend, rota, migration ou schema.

### 1. Novas entradas em `ICONES_ACAO` e `LABELS_ACAO`

```js
const ICONES_ACAO = {
  edicao: "✏️",
  verificacao_ok: "✅",
  categorizacao_ok: "🏷️",
  pdf_vinculado: "📎",
  importacao: "📥",
  vinculo_automatico: "🔗",
};

const LABELS_ACAO = {
  edicao: "Pedido editado",
  verificacao_ok: "Verificação concluída",
  categorizacao_ok: "Categorização concluída",
  pdf_vinculado: "PDF vinculado",
  importacao: "Pedido importado",
  vinculo_automatico: "Vínculo automático",
};
```

### 2. Restringir `parseDiffs` a `acao === "edicao"`

No `.map((r) => ...)` do componente, trocar:

```js
const diffs = parseDiffs(r.descricao);
```

por:

```js
const diffs = r.acao === "edicao" ? parseDiffs(r.descricao) : null;
```

Com `diffs === null`, o bloco `else if (r.descricao && ...)` já existente renderiza a `descricao` completa em `pf-historico-desc` — caminho já usado hoje para `categorizacao`, `importacao`, etc.

A função `parseDiffs` em si não muda (continua útil e correta para `edicao`).

## Casos de borda

- **`acao = "vinculo_automatico"` com descrição contendo `(ambiente: ..., largura: ...)`:** renderizada integralmente como texto, com ícone 🔗 e label "Vínculo automático".
- **`acao = "edicao"`:** comportamento inalterado — `parseDiffs` continua aplicado, diffs renderizados como `pf-diff-item`.
- **`acao = "categorizacao"` ou outros tipos sem entrada em `LABELS_ACAO`:** comportamento inalterado (fallback de `labelAcao`, ícone 🔧, descrição em texto) — já funcionava corretamente porque essas descrições nunca casavam com a regex de `parseDiffs`.

## Fora de escopo

- Qualquer mudança em `vinculoAutomaticoService.js`, `auditoriaService.js`, `pedido_auditoria` ou rotas — formato de `descricao` e schema permanecem como estão.
- Histórico de vínculos manuais (`POST /pedidos/:id/vinculos`) — essa rota não registra auditoria; não há registro a exibir.
- Filtro de `etapa` na chamada de `GET /pedidos/:id/auditoria` feita por `EtapaDadosPedido.jsx` — já retorna todos os registros, incluindo `vinculo_automatico`, o que é o comportamento desejado.

## Testes

`HistoricoPedidoModal.jsx` não possui testes automatizados hoje (componente puramente de apresentação, sem suíte de frontend configurada para este diretório). A verificação é manual no navegador:

1. Importar um pedido que gere ao menos um vínculo automático (Trilho/Varão ↔ Cortina/Forro, mesmo ambiente e largura).
2. Abrir o modal "Histórico do Pedido" (🕘) na etapa "Dados do Pedido".
3. Confirmar que o registro de vínculo automático aparece com ícone 🔗, label "Vínculo automático", e a descrição completa (incluindo `ambiente` e `largura`) visível como texto — sem caixas de diff.
4. Confirmar que registros `acao = "edicao"` (se houver, ex.: editar um campo do pedido) continuam exibidos como diffs (`Campo: antes → depois`).

Essa verificação faz parte do roteiro de teste manual já pendente para os subprojetos 3/4 (ver memória `project_categorizacao_automatica_importacao`).

## Arquivos afetados

- **Modificar:** `frontend-web/src/pages/pedidos/fluxo/etapas/HistoricoPedidoModal.jsx`
