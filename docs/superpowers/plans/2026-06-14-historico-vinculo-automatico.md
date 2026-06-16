# Histórico de vínculos automáticos no modal de fluxo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir corretamente, no `HistoricoPedidoModal.jsx`, os registros de auditoria com `acao = "vinculo_automatico"` (criados pelo subprojeto 3) — ícone/label apropriados e descrição completa, sem que `parseDiffs` descarte o sufixo `(ambiente: ..., largura: ...)`.

**Architecture:** Mudança isolada em `frontend-web/src/pages/pedidos/fluxo/etapas/HistoricoPedidoModal.jsx`: adicionar entradas para `vinculo_automatico` em `ICONES_ACAO`/`LABELS_ACAO`, e restringir a chamada de `parseDiffs` a `acao === "edicao"` (o único tipo de ação cujo formato de descrição é compatível com essa função). Sem mudanças de backend, rota, schema ou migration.

**Tech Stack:** React (Vite), JavaScript (JSX).

---

### Task 1: Mapear `vinculo_automatico` e restringir `parseDiffs` em `HistoricoPedidoModal.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/HistoricoPedidoModal.jsx`

**Contexto:** Hoje, `ICONES_ACAO` e `LABELS_ACAO` (linhas 4-17) não têm entrada para `vinculo_automatico`, então o registro cai no fallback (ícone 🔧, label "Vinculo Automatico" via `labelAcao`). Além disso, `parseDiffs(r.descricao)` (linha ~74, dentro do `.map`) é chamado para TODOS os tipos de `acao`, e sua regex `/(?:^|,\s*)([^:,]+): "([^"]*)" → "([^"]*)"/g` casa acidentalmente com a descrição de `vinculo_automatico` (formato `Vínculo automático: "Trilho Wave" → "Cortina Wave" (ambiente: Sala, largura: 1.5m)`), produzindo um diff que descarta o sufixo `(ambiente: ..., largura: ...)`.

- [ ] **Step 1: Adicionar `vinculo_automatico` a `ICONES_ACAO` e `LABELS_ACAO`**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/HistoricoPedidoModal.jsx`, localize:

```jsx
const ICONES_ACAO = {
  edicao: "✏️",
  verificacao_ok: "✅",
  categorizacao_ok: "🏷️",
  pdf_vinculado: "📎",
  importacao: "📥",
};

const LABELS_ACAO = {
  edicao: "Pedido editado",
  verificacao_ok: "Verificação concluída",
  categorizacao_ok: "Categorização concluída",
  pdf_vinculado: "PDF vinculado",
  importacao: "Pedido importado",
};
```

Substitua por:

```jsx
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

- [ ] **Step 2: Restringir `parseDiffs` a `acao === "edicao"`**

No mesmo arquivo, dentro de `{!carregando && registros.map((r) => {`, localize:

```jsx
              {!carregando && registros.map((r) => {
                const diffs = parseDiffs(r.descricao);
                return (
```

Substitua por:

```jsx
              {!carregando && registros.map((r) => {
                const diffs = r.acao === "edicao" ? parseDiffs(r.descricao) : null;
                return (
```

Com `diffs === null`, o bloco `else if (r.descricao && ...)` já existente (mais abaixo no mesmo `.map`) renderiza `r.descricao` integralmente em `pf-historico-desc` — caminho já usado hoje para `categorizacao`, `importacao` etc., e que agora também cobre `vinculo_automatico`.

- [ ] **Step 3: Lint**

Run: `cd frontend-web && npm run lint`

Expected: sem novos erros/warnings relacionados a `HistoricoPedidoModal.jsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/HistoricoPedidoModal.jsx
git commit -m "feat(pedidos): historico exibe vinculo automatico com icone/label e descricao completa"
```

---

## Verificação manual (pós-implementação, não bloqueante)

Conforme a seção "Testes" da spec — este componente não tem suíte automatizada. Roteiro manual no navegador (pode ser feito junto com o roteiro pendente dos subprojetos 3/4):

1. Importar um pedido que gere ao menos um vínculo automático (Trilho/Varão ↔ Cortina/Forro, mesmo ambiente e largura).
2. Abrir o modal "Histórico do Pedido" (🕘) na etapa "Dados do Pedido".
3. Confirmar que o registro de vínculo automático aparece com ícone 🔗, label "Vínculo automático", e a descrição completa (incluindo `ambiente` e `largura`) como texto — sem caixas de diff.
4. Confirmar que registros `acao = "edicao"` (ex.: editar um campo do pedido) continuam exibidos como diffs (`Campo: antes → depois`).

---

## Self-Review Notes

- **Cobertura do spec:** `ICONES_ACAO`/`LABELS_ACAO` (Step 1) e restrição de `parseDiffs` (Step 2) cobrem os dois pontos da seção "Arquitetura" da spec. Casos de borda (edicao inalterado, categorizacao/outros inalterados) são consequência direta da mudança — nenhuma lógica adicional necessária.
- **Sem placeholders:** blocos de código completos, prontos para colar.
- **Escopo:** 1 arquivo, 2 edições pontuais — sem necessidade de decomposição em múltiplas tasks.
