# Pedidos de Venda — Etapas corretas, filtro por etapa e select de consultoras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Pedidos de Venda" list page show the real 5-stage flow on each card (Dados do Pedido → Conferência de Medidas → Produção → Agendamento → Pós-venda), add a filter by current stage, and replace the "Visão Geral / Por Consultora" toggle with an always-visible consultora select.

**Architecture:** Extract the existing single-pedido stage-calculation formula from `buscarFluxoPedido` into a shared pure function `calcularEtapaAtual`, then add batched (`GROUP BY pedido_id`) aggregate queries to `listarPedidosDashboard` so every pedido in the list gets `estagio.etapa_atual` (1-5) without N+1 queries. The frontend then renders all 5 stages on the card, adds a stage-filter chip row (independent of the status filter), and always shows the consultora `<select>`.

**Tech Stack:** Node/Express + `pg` (backend, Jest tests), React + Vite (frontend, manual verification — no FE test runner in this repo).

**Spec:** `docs/superpowers/specs/2026-06-09-pedidos-lista-etapas-filtros-design.md`

---

## Task 1: Extract `calcularEtapaAtual` as a tested pure function

**Files:**
- Modify: `backend/src/services/dashboardService.js`
- Create: `backend/src/__tests__/dashboardService.test.js`

The current stage logic lives inline in `buscarFluxoPedido` at `backend/src/services/dashboardService.js:364-383`:

```js
  const etapa1_ok = pedido.verificacao_ok &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    itensCobertos >= totalItens;

  const etapa2_ok = totalItensConf > 0 && itensConferidos >= totalItensConf;

  const etapa3_ok = totalEmConf === 0 || totalConfOk >= totalEmConf;

  const etapa4_ok = genitoresAgendados > 0;

  const etapa5_ok = pedido.status === "concluido";

  let etapa_atual = 1;
  if (etapa1_ok) etapa_atual = 2;
  if (etapa1_ok && etapa2_ok) etapa_atual = 3;
  if (etapa1_ok && etapa2_ok && etapa3_ok) etapa_atual = 4;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok) etapa_atual = 5;
  if (etapa5_ok) etapa_atual = 5;
```

We'll lift this into a standalone exported function `calcularEtapaAtual(progresso)` so both `buscarFluxoPedido` (Task 2) and the new batch logic in `listarPedidosDashboard` (Task 3) use the exact same formula.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/__tests__/dashboardService.test.js`:

```js
const { calcularEtapaAtual } = require("../services/dashboardService");

describe("calcularEtapaAtual", () => {
  const base = {
    verificacaoOk: false,
    itensSemCategoria: 0,
    itensSemVinculo: 0,
    totalItens: 2,
    itensCobertos: 0,
    totalItensConf: 0,
    itensConferidos: 0,
    totalEmConf: 0,
    totalConfOk: 0,
    genitoresAgendados: 0,
    status: "pendente",
  };

  test("etapa 1 incompleta (verificacao pendente) -> etapa_atual 1", () => {
    const r = calcularEtapaAtual({ ...base, verificacaoOk: false });
    expect(r.etapa_atual).toBe(1);
    expect(r.etapa1_ok).toBe(false);
  });

  test("etapa 1 completa, conferencia pendente -> etapa_atual 2", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
    });
    expect(r.etapa1_ok).toBe(true);
    expect(r.etapa_atual).toBe(2);
  });

  test("etapas 1-2 completas, producao pendente -> etapa_atual 3", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 1,
    });
    expect(r.etapa2_ok).toBe(true);
    expect(r.etapa3_ok).toBe(false);
    expect(r.etapa_atual).toBe(3);
  });

  test("etapas 1-3 completas, sem genitor agendado -> etapa_atual 4", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 0,
      totalConfOk: 0,
      genitoresAgendados: 0,
    });
    expect(r.etapa3_ok).toBe(true);
    expect(r.etapa4_ok).toBe(false);
    expect(r.etapa_atual).toBe(4);
  });

  test("etapas 1-4 completas -> etapa_atual 5", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 0,
      totalConfOk: 0,
      genitoresAgendados: 1,
    });
    expect(r.etapa4_ok).toBe(true);
    expect(r.etapa_atual).toBe(5);
  });

  test("status concluido forca etapa_atual 5 mesmo com etapa 1 incompleta", () => {
    const r = calcularEtapaAtual({ ...base, verificacaoOk: false, status: "concluido" });
    expect(r.etapa5_ok).toBe(true);
    expect(r.etapa_atual).toBe(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest dashboardService -i`
Expected: FAIL — `TypeError: (0 , _dashboardService.calcularEtapaAtual) is not a function` (or similar, since the export doesn't exist yet).

- [ ] **Step 3: Add `calcularEtapaAtual` and export it**

In `backend/src/services/dashboardService.js`, add the function above `listarPedidosDashboard` (after `calcNivelAlerta`, around line 10):

```js
function calcularEtapaAtual({
  verificacaoOk,
  itensSemCategoria,
  itensSemVinculo,
  totalItens,
  itensCobertos,
  totalItensConf,
  itensConferidos,
  totalEmConf,
  totalConfOk,
  genitoresAgendados,
  status,
}) {
  const etapa1_ok = verificacaoOk &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    itensCobertos >= totalItens;

  const etapa2_ok = totalItensConf > 0 && itensConferidos >= totalItensConf;

  const etapa3_ok = totalEmConf === 0 || totalConfOk >= totalEmConf;

  const etapa4_ok = genitoresAgendados > 0;

  const etapa5_ok = status === "concluido";

  let etapa_atual = 1;
  if (etapa1_ok) etapa_atual = 2;
  if (etapa1_ok && etapa2_ok) etapa_atual = 3;
  if (etapa1_ok && etapa2_ok && etapa3_ok) etapa_atual = 4;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok) etapa_atual = 5;
  if (etapa5_ok) etapa_atual = 5;

  return { etapa_atual, etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok, etapa5_ok };
}
```

At the bottom of the file, change:

```js
module.exports = { listarPedidosDashboard, buscarFluxoPedido };
```

to:

```js
module.exports = { listarPedidosDashboard, buscarFluxoPedido, calcularEtapaAtual };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest dashboardService -i`
Expected: PASS — all 6 tests in `calcularEtapaAtual` green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "refactor(dashboard): extract calcularEtapaAtual as a shared pure function"
```

---

## Task 2: Refactor `buscarFluxoPedido` to use `calcularEtapaAtual`

**Files:**
- Modify: `backend/src/services/dashboardService.js:364-383`

This is a pure extraction (no behavior change) — `buscarFluxoPedido` already computes all the inputs (`itensSemCategoria`, `itensCobertos`, etc.) at lines 278-284. We just replace the inline formula with a call to the function from Task 1.

- [ ] **Step 1: Replace the inline calculation**

In `backend/src/services/dashboardService.js`, replace lines 364-383:

```js
  const etapa1_ok = pedido.verificacao_ok &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    itensCobertos >= totalItens;

  const etapa2_ok = totalItensConf > 0 && itensConferidos >= totalItensConf;

  const etapa3_ok = totalEmConf === 0 || totalConfOk >= totalEmConf;

  const etapa4_ok = genitoresAgendados > 0;

  const etapa5_ok = pedido.status === "concluido";

  let etapa_atual = 1;
  if (etapa1_ok) etapa_atual = 2;
  if (etapa1_ok && etapa2_ok) etapa_atual = 3;
  if (etapa1_ok && etapa2_ok && etapa3_ok) etapa_atual = 4;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok) etapa_atual = 5;
  if (etapa5_ok) etapa_atual = 5;
```

with:

```js
  const { etapa_atual, etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok, etapa5_ok } = calcularEtapaAtual({
    verificacaoOk: pedido.verificacao_ok,
    itensSemCategoria,
    itensSemVinculo,
    totalItens,
    itensCobertos,
    totalItensConf,
    itensConferidos,
    totalEmConf,
    totalConfOk,
    genitoresAgendados,
    status: pedido.status,
  });
```

The rest of `buscarFluxoPedido` (the `etapas` array construction at lines 385-418, which references `etapa1_ok`...`etapa5_ok`) is unchanged.

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS — no test directly exercises `buscarFluxoPedido`, so this just confirms nothing else broke (e.g. no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "refactor(dashboard): buscarFluxoPedido usa calcularEtapaAtual compartilhado"
```

---

## Task 3: Batch `etapa_atual` into `listarPedidosDashboard`

**Files:**
- Modify: `backend/src/services/dashboardService.js:73-135`
- Modify: `backend/src/__tests__/dashboardService.test.js`

Add 7 new aggregate queries (mirroring the per-pedido queries in `buscarFluxoPedido:215-276`, but `WHERE pedido_id = ANY($1) GROUP BY pedido_id`), run them in parallel with the existing `preAgs` query, and use `calcularEtapaAtual` to set `estagio.etapa_atual` for every pedido.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/__tests__/dashboardService.test.js` (it currently has no `db` mock — add the mock at the top of the file and a new `describe` block):

```js
jest.mock("../database/db", () => ({ query: jest.fn() }));
const db = require("../database/db");
const { calcularEtapaAtual, listarPedidosDashboard } = require("../services/dashboardService");

afterEach(() => jest.clearAllMocks());
```

(Move the existing `const { calcularEtapaAtual } = ...` line into this combined destructure — don't declare it twice.)

Then add:

```js
describe("listarPedidosDashboard", () => {
  test("calcula estagio.etapa_atual em lote a partir das queries agregadas", async () => {
    db.query
      // 1) query principal de pedidos
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            numero_sequencial: 10,
            numero_origem: null,
            status: "em_andamento",
            verificacao_ok: true,
            categorizacao_ok: true,
            total: "100.00",
            criado_em: "2026-01-01T00:00:00.000Z",
            cliente_nome: "Cliente A",
            consultor_nome: "Consultora X",
            consultor_id: 5,
            itens_count: "2",
            pdf_ok: true,
            vinculos_ok: true,
          },
        ],
      })
      // 2) preAgs
      .mockResolvedValueOnce({ rows: [] })
      // 3) total de itens por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, total: 2 }] })
      // 4) itens cobertos por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, cobertos: 2 }] })
      // 5) itens sem categoria por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 6) itens sem vinculo por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 7) conferencia por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, total: 2, conferidos: 2 }] })
      // 8) confeccao por pedido
      .mockResolvedValueOnce({ rows: [{ pedido_id: 1, em_confeccao: 2, confeccao_ok: 1 }] })
      // 9) genitores agendados por pedido
      .mockResolvedValueOnce({ rows: [] });

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    expect(resultado).toHaveLength(1);
    // etapa1_ok true (verificacao_ok + 2/2 cobertos), etapa2_ok true (2/2 conferidos),
    // etapa3_ok false (1/2 confeccao_ok) -> etapa_atual = 3
    expect(resultado[0].estagio.etapa_atual).toBe(3);
  });

  test("pedido sem itens e sem agendamentos fica na etapa 1", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            numero_sequencial: 11,
            numero_origem: null,
            status: "pendente",
            verificacao_ok: false,
            categorizacao_ok: false,
            total: "0.00",
            criado_em: "2026-01-02T00:00:00.000Z",
            cliente_nome: "Cliente B",
            consultor_nome: "Consultora Y",
            consultor_id: 6,
            itens_count: "0",
            pdf_ok: false,
            vinculos_ok: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // preAgs
      .mockResolvedValueOnce({ rows: [] }) // total itens
      .mockResolvedValueOnce({ rows: [] }) // itens cobertos
      .mockResolvedValueOnce({ rows: [] }) // sem categoria
      .mockResolvedValueOnce({ rows: [] }) // sem vinculo
      .mockResolvedValueOnce({ rows: [] }) // conferencia
      .mockResolvedValueOnce({ rows: [] }) // confeccao
      .mockResolvedValueOnce({ rows: [] }); // genitores agendados

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    expect(resultado[0].estagio.etapa_atual).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest dashboardService -i`
Expected: FAIL — `resultado[0].estagio.etapa_atual` is `undefined`, not `3` / `1`.

- [ ] **Step 3: Implement the batch queries**

In `backend/src/services/dashboardService.js`, replace the block from `if (!pedidos.length) return [];` through the end of the function (lines 71-135) with:

```js
  if (!pedidos.length) return [];

  const pedidoIds = pedidos.map((p) => p.id);

  const [
    { rows: preAgs },
    { rows: totalItensRows },
    { rows: itensCobertosRows },
    { rows: itensSemCatRows },
    { rows: itensSemVincRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
  ] = await Promise.all([
    // Genitores: agendamentos com pedido_id + itens de pedido vinculados
    db.query(
      `SELECT a.id, a.pedido_id, a.status, a.data AS data_inicio, COUNT(ai.id) AS itens_count
       FROM agendamentos a
       JOIN agendamento_itens ai ON ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
       GROUP BY a.id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 1: total de itens por pedido
    db.query(
      `SELECT pedido_id, COUNT(*)::int AS total
       FROM pedido_itens
       WHERE pedido_id = ANY($1)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
    // Etapa 1: itens cobertos por agendamento (genitor) por pedido
    db.query(
      `SELECT a.pedido_id, COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL
       GROUP BY a.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 1: itens sem categoria por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(*)::int AS sem_cat
       FROM pedido_itens pi
       LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
       LEFT JOIN produtos prod ON prod.id = oi.produto_id
       WHERE pi.pedido_id = ANY($1)
         AND COALESCE(pi.categoria_id, prod.categoria_id) IS NULL
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
    // Etapa 1: itens sem vinculo por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(*)::int AS sem_vinc
       FROM pedido_itens pi
       WHERE pi.pedido_id = ANY($1)
         AND pi.sem_vinculo = false
         AND NOT EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
         )
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
    // Etapa 2: conferencia por pedido
    db.query(
      `SELECT pi.pedido_id,
              COUNT(DISTINCT pi.id)::int AS total,
              COUNT(DISTINCT ci.pedido_item_id) FILTER (WHERE ci.status = 'conferido')::int AS conferidos
       FROM pedido_itens pi
       LEFT JOIN conferencia_itens ci ON ci.pedido_item_id = pi.id AND ci.empresa_id = $2
       WHERE pi.pedido_id = ANY($1)
       GROUP BY pi.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 3: confeccao por pedido
    db.query(
      `SELECT pedido_id,
              COUNT(*) FILTER (WHERE em_confeccao = true)::int AS em_confeccao,
              COUNT(*) FILTER (WHERE em_confeccao = true AND confeccao_ok = true)::int AS confeccao_ok
       FROM pedido_itens
       WHERE pedido_id = ANY($1)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
    // Etapa 4: genitores agendados por pedido
    db.query(
      `SELECT a.pedido_id, COUNT(*)::int AS agendados
       FROM agendamentos a
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
         AND a.status = 'agendado'
         AND a.agendamento_pai_id IS NULL
         AND EXISTS (
           SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id = a.id
         )
       GROUP BY a.pedido_id`,
      [pedidoIds, empresaId]
    ),
  ]);

  const preAgsPorPedido = {};
  for (const ag of preAgs) {
    if (!preAgsPorPedido[ag.pedido_id]) preAgsPorPedido[ag.pedido_id] = [];
    preAgsPorPedido[ag.pedido_id].push({
      id: ag.id,
      data_inicio: ag.data_inicio,
      status: ag.status,
      itens_count: Number(ag.itens_count),
    });
  }

  const totalItensPorPedido = {};
  for (const r of totalItensRows) totalItensPorPedido[r.pedido_id] = Number(r.total);

  const itensCobertosPorPedido = {};
  for (const r of itensCobertosRows) itensCobertosPorPedido[r.pedido_id] = Number(r.cobertos);

  const itensSemCatPorPedido = {};
  for (const r of itensSemCatRows) itensSemCatPorPedido[r.pedido_id] = Number(r.sem_cat);

  const itensSemVincPorPedido = {};
  for (const r of itensSemVincRows) itensSemVincPorPedido[r.pedido_id] = Number(r.sem_vinc);

  const confPorPedido = {};
  for (const r of confRows) confPorPedido[r.pedido_id] = { total: Number(r.total), conferidos: Number(r.conferidos) };

  const prodPorPedido = {};
  for (const r of prodRows) prodPorPedido[r.pedido_id] = { em_confeccao: Number(r.em_confeccao), confeccao_ok: Number(r.confeccao_ok) };

  const agendadosPorPedido = {};
  for (const r of agendadoRows) agendadosPorPedido[r.pedido_id] = Number(r.agendados);

  const hoje = new Date();

  const resultado = pedidos.map((p) => {
    const preAgendamentos = preAgsPorPedido[p.id] || [];
    const futuros = preAgendamentos.filter(
      (a) => a.status === "pre_agendado" || a.status === "agendado"
    );
    futuros.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
    const proximoPrazo = futuros[0]?.data_inicio || null;
    const diasParaPrazo = proximoPrazo
      ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
      : null;

    const conf = confPorPedido[p.id] || { total: 0, conferidos: 0 };
    const prod = prodPorPedido[p.id] || { em_confeccao: 0, confeccao_ok: 0 };

    const { etapa_atual } = calcularEtapaAtual({
      verificacaoOk: p.verificacao_ok,
      itensSemCategoria: itensSemCatPorPedido[p.id] || 0,
      itensSemVinculo: itensSemVincPorPedido[p.id] || 0,
      totalItens: totalItensPorPedido[p.id] || 0,
      itensCobertos: itensCobertosPorPedido[p.id] || 0,
      totalItensConf: conf.total,
      itensConferidos: conf.conferidos,
      totalEmConf: prod.em_confeccao,
      totalConfOk: prod.confeccao_ok,
      genitoresAgendados: agendadosPorPedido[p.id] || 0,
      status: p.status,
    });

    return {
      id: p.id,
      numero_sequencial: p.numero_sequencial,
      numero_origem: p.numero_origem,
      status: p.status,
      cliente_nome: p.cliente_nome,
      consultor_id: p.consultor_id,
      consultor_nome: p.consultor_nome,
      total: p.total,
      itens_count: Number(p.itens_count),
      criado_em: p.criado_em,
      estagio: {
        pdf_ok: p.pdf_ok,
        verificacao_ok: p.verificacao_ok,
        categorizacao_ok: p.categorizacao_ok,
        vinculos_ok: p.vinculos_ok,
        etapa_atual,
        pre_agendamentos: preAgendamentos,
        proximo_prazo: proximoPrazo,
        dias_para_prazo: diasParaPrazo,
        nivel_alerta: calcNivelAlerta(diasParaPrazo),
      },
    };
  });

  if (alerta) return resultado.filter((p) => p.estagio.nivel_alerta === alerta);
  return resultado;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest dashboardService -i`
Expected: PASS — both `listarPedidosDashboard` tests green (etapa_atual 3 and 1 respectively), plus the 6 `calcularEtapaAtual` tests from Task 1.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "feat(dashboard): calcular etapa_atual em lote na listagem de pedidos"
```

---

## Task 4: Frontend — card mostra as 5 etapas reais do fluxo

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx:1-79`

Replace the 2-stage `BarraProgresso` with one driven by `estagio.etapa_atual` and the same 5-stage labels/icons used in `fluxo/EtapaCard.jsx`.

- [ ] **Step 1: Add `ETAPA_CONFIG` and rewrite `BarraProgresso`**

In `frontend-web/src/pages/pedidos/Pedidos.jsx`, after the `ALERTA_LABELS` constant (line 16), add:

```js
const ETAPA_CONFIG = [
  { numero: 1, label: "Dados do Pedido",          labelCurto: "Pedido",      icone: "📋" },
  { numero: 2, label: "Conferência de Medidas",   labelCurto: "Medidas",     icone: "📐" },
  { numero: 3, label: "Produção",                 labelCurto: "Produção",    icone: "⚙️" },
  { numero: 4, label: "Agendamento",              labelCurto: "Agendamento", icone: "📅" },
  { numero: 5, label: "Pós-venda",                labelCurto: "Pós-venda",   icone: "⭐" },
];
```

Then replace the whole `BarraProgresso` function (lines 40-79):

```js
function BarraProgresso({ estagio, status }) {
  const etapaAtual = estagio.etapa_atual || 1;
  const concluido = status === "concluido";

  return (
    <>
      <div className="dp-barra">
        {ETAPA_CONFIG.map((etapa, idx) => {
          const ok = etapa.numero < etapaAtual || (etapa.numero === 5 && concluido);
          const atual = !ok && etapa.numero === etapaAtual;

          let cls = "dp-etapa";
          if (ok) cls += " dp-ok";
          else if (atual) {
            cls += " dp-atual";
            if (estagio.nivel_alerta === "atrasado") cls += " dp-atrasado";
          }

          return (
            <React.Fragment key={etapa.numero}>
              <div className={cls}>
                <div className="dp-ponto" />
                <span className="dp-label">{etapa.labelCurto}</span>
              </div>
              {idx < ETAPA_CONFIG.length - 1 && (
                <div className={`dp-linha ${ok ? "dp-ok" : ""}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className={`dp-etapa-atual-label ${estagio.nivel_alerta === "atrasado" ? "dp-etapa-atual-atrasado" : ""}`}>
        {concluido ? (
          "✓ Pedido concluído"
        ) : (
          <>▶ Etapa atual: <strong>{ETAPA_CONFIG[etapaAtual - 1].label}</strong></>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Manual check (visual)**

Run: `cd frontend-web && npm run dev`, open the "Pedidos de Venda" page, and confirm:
- Each card's progress bar shows 5 dots labeled `Pedido`, `Medidas`, `Produção`, `Agendamento`, `Pós-venda`.
- The dot matching the pedido's actual current stage (per the `/pedidos/:id/fluxo` page for the same pedido) is highlighted blue (`dp-atual`), earlier stages are green (`dp-ok`).
- A pedido with `status = concluido` shows all 5 dots green and the label "✓ Pedido concluído".

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx
git commit -m "feat(pedidos): card da listagem mostra as 5 etapas reais do fluxo"
```

---

## Task 5: Frontend — filtro por etapa (independente do filtro de status)

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

Add a second chip row for the 5 stages. Selecting a stage chip resets the status filter to "Todos" (and re-fetches without `status`/`alerta` if needed); selecting a status chip clears the stage filter. The stage filter itself is applied client-side via `estagio.etapa_atual`.

- [ ] **Step 1: Add `etapaFiltro` state and update `pedidosFiltrados`**

In `frontend-web/src/pages/pedidos/Pedidos.jsx`, inside `export default function Pedidos()`, after the existing `useState` declarations (around line 137-139), add:

```js
  const [etapaFiltro, setEtapaFiltro] = useState(null); // null = todas as etapas
```

Replace the `pedidosFiltrados` `useMemo` (current lines 153-157):

```js
  const pedidosFiltrados = useMemo(() => {
    if (filtroAtivo === "todos")    return pedidos;
    if (filtroAtivo === "atrasados") return pedidos.filter((p) => p.estagio.nivel_alerta === "atrasado");
    return pedidos.filter((p) => p.status === filtroAtivo);
  }, [pedidos, filtroAtivo]);
```

with:

```js
  const pedidosFiltrados = useMemo(() => {
    let lista = pedidos;
    if (filtroAtivo === "atrasados") lista = lista.filter((p) => p.estagio.nivel_alerta === "atrasado");
    else if (filtroAtivo !== "todos") lista = lista.filter((p) => p.status === filtroAtivo);

    if (etapaFiltro) lista = lista.filter((p) => p.estagio.etapa_atual === etapaFiltro);
    return lista;
  }, [pedidos, filtroAtivo, etapaFiltro]);
```

- [ ] **Step 2: Update `handleFiltro` to clear the stage filter, and add `handleEtapaFiltro`**

Replace `handleFiltro` (current lines 159-164):

```js
  function handleFiltro(key) {
    setFiltroAtivo(key);
    if (key === "atrasados") carregar({ alerta: "atrasado" });
    else if (key === "todos") carregar({});
    else carregar({ status: key });
  }
```

with:

```js
  function handleFiltro(key) {
    setFiltroAtivo(key);
    setEtapaFiltro(null);
    const f = consultoraFiltro ? { consultora_id: consultoraFiltro } : {};
    if (key === "atrasados") carregar({ ...f, alerta: "atrasado" });
    else if (key === "todos") carregar(f);
    else carregar({ ...f, status: key });
  }

  function handleEtapaFiltro(numero) {
    const proximo = etapaFiltro === numero ? null : numero;
    setEtapaFiltro(proximo);
    if (filtroAtivo !== "todos") {
      setFiltroAtivo("todos");
      const f = consultoraFiltro ? { consultora_id: consultoraFiltro } : {};
      carregar(f);
    }
  }
```

- [ ] **Step 3: Render the stage chip row**

In the JSX, after the existing `.dp-chips` block (current lines 243-253):

```jsx
      <div className="dp-chips">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            className={`dp-chip ${filtroAtivo === f.key ? "dp-chip-ativo" : ""}`}
            onClick={() => handleFiltro(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
```

add a second row right after it:

```jsx
      <div className="dp-chips dp-chips-etapas">
        {ETAPA_CONFIG.map((etapa) => (
          <button
            key={etapa.numero}
            className={`dp-chip ${etapaFiltro === etapa.numero ? "dp-chip-ativo" : ""}`}
            onClick={() => handleEtapaFiltro(etapa.numero)}
          >
            {etapa.icone} {etapa.label}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Add CSS for the second chip row**

In `frontend-web/src/pages/pedidos/Pedidos.css`, after the `.dp-chips` rule (around line 76-81), add:

```css
.dp-chips-etapas {
  margin-top: -10px;
}
```

- [ ] **Step 5: Manual check**

Run: `cd frontend-web && npm run dev`, open "Pedidos de Venda", and confirm:
- Clicking a stage chip (e.g. "⚙️ Produção") highlights it, resets the status chip to "Todos", and shows only pedidos whose current stage is Produção.
- Clicking a status chip (e.g. "Concluído") un-highlights any active stage chip and filters by status as before.
- Clicking the same active stage chip again toggles the filter off ("Todas as etapas").

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(pedidos): filtro por etapa do fluxo, independente do filtro de status"
```

---

## Task 6: Frontend — select de consultoras sempre visível, remove o toggle

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

Remove the "Visão Geral" / "Por Consultora" toggle and `visaoGeral` state. The consultora `<select>` becomes always visible (for users with `DASHBOARD_PEDIDOS_GERAL`), defaulting to "Todas as consultoras". Also fix a latent bug: today the consultora dropdown options are derived from the *currently filtered* `pedidos`, so picking a consultora collapses the dropdown to just that one option. Capture the full consultora list only from an unfiltered load.

- [ ] **Step 1: Replace the `consultoras` derivation**

Replace the `consultoras` `useMemo` (current lines 143-151):

```js
  const consultoras = useMemo(() => {
    const map = new Map();
    for (const p of pedidos) {
      if (p.consultor_id && !map.has(p.consultor_id)) {
        map.set(p.consultor_id, { id: p.consultor_id, nome: p.consultor_nome });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [pedidos]);
```

with:

```js
  const [consultoras, setConsultoras] = useState([]);

  useEffect(() => {
    if (consultoraFiltro || filtroAtivo !== "todos") return;
    const map = new Map();
    for (const p of pedidos) {
      if (p.consultor_id && !map.has(p.consultor_id)) {
        map.set(p.consultor_id, { id: p.consultor_id, nome: p.consultor_nome });
      }
    }
    if (map.size > 0) {
      setConsultoras(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
    }
  }, [pedidos, consultoraFiltro, filtroAtivo]);
```

Add `useEffect` to the React import at the top of the file (current line 1):

```js
import React, { useState, useEffect, useMemo } from "react";
```

- [ ] **Step 2: Remove `visaoGeral` state and `handleToggleVisao`**

Remove the `visaoGeral` state declaration (current line 136):

```js
  const [visaoGeral,     setVisaoGeral]     = useState(false);
```

Remove the `handleToggleVisao` function (current lines 166-170):

```js
  function handleToggleVisao(geral) {
    setVisaoGeral(geral);
    setConsultoraFiltro("");
    carregar({});
  }
```

- [ ] **Step 3: Replace the toggle JSX with an always-visible select**

Replace the `temPermGeral && (...)` block in the header (current lines 207-239):

```jsx
          {temPermGeral && (
            <div className="dp-toggle-section">
              <div className="dp-toggle">
                <button
                  className={`dp-toggle-btn ${!visaoGeral ? "dp-toggle-ativo" : ""}`}
                  onClick={() => handleToggleVisao(false)}
                >
                  Visão Geral
                </button>
                <button
                  className={`dp-toggle-btn ${visaoGeral ? "dp-toggle-ativo" : ""}`}
                  onClick={() => handleToggleVisao(true)}
                >
                  Por Consultora
                </button>
              </div>
              {visaoGeral && consultoras.length > 0 && (
                <select
                  className="dp-select-consultora"
                  value={consultoraFiltro}
                  onChange={(e) => {
                    setConsultoraFiltro(e.target.value);
                    carregar(e.target.value ? { consultora_id: e.target.value } : {});
                  }}
                >
                  <option value="">Todas as consultoras</option>
                  {consultoras.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              )}
            </div>
          )}
```

with:

```jsx
          {temPermGeral && consultoras.length > 0 && (
            <select
              className="dp-select-consultora"
              value={consultoraFiltro}
              onChange={(e) => {
                const novaConsultora = e.target.value;
                setConsultoraFiltro(novaConsultora);
                const f = novaConsultora ? { consultora_id: novaConsultora } : {};
                if (filtroAtivo === "atrasados") f.alerta = "atrasado";
                else if (filtroAtivo !== "todos") f.status = filtroAtivo;
                carregar(f);
              }}
            >
              <option value="">Todas as consultoras</option>
              {consultoras.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          )}
```

- [ ] **Step 4: Remove unused CSS**

In `frontend-web/src/pages/pedidos/Pedidos.css`, remove the now-unused toggle rules:
- `.dp-toggle` (around lines 50-56)
- `.dp-toggle-btn` (around lines 58-68)
- `.dp-toggle-btn.dp-toggle-ativo` (around lines 70-73)
- `.dp-toggle-section` (around lines 278-283)

Keep `.dp-select-consultora` (still used).

- [ ] **Step 5: Manual check**

Run: `cd frontend-web && npm run dev`, open "Pedidos de Venda" as a user with `DASHBOARD_PEDIDOS_GERAL` and confirm:
- No "Visão Geral" / "Por Consultora" buttons remain.
- The consultora select is visible by default, set to "Todas as consultoras", and shows pedidos from all consultoras.
- Selecting a consultora filters the list to that consultora's pedidos, and the select still lists **all** consultoras (not just the selected one).
- Switching back to "Todas as consultoras" restores the full list.
- Status and stage filters (Tasks 4-5) still work correctly while a consultora is selected.

As a user **without** `DASHBOARD_PEDIDOS_GERAL`, confirm the select does not appear and only the user's own pedidos are shown (unchanged from before).

- [ ] **Step 6: Lint check**

Run: `cd frontend-web && npm run lint`
Expected: no new errors in `Pedidos.jsx`.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(pedidos): select de consultoras sempre visivel, remove toggle Visao Geral/Por Consultora"
```

---

## Task 7: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start backend and frontend dev servers**

Run: `cd backend && npm run dev` (in one terminal)
Run: `cd frontend-web && npm run dev` (in another terminal)

- [ ] **Step 2: Cross-check stage display against the detail page**

For 2-3 pedidos in different real stages, open `/pedidos/:id/fluxo` (the existing 5-stage fluxograma) and compare `etapa_atual` shown there against the highlighted stage on the same pedido's card in `/pedidos`. They must match.

- [ ] **Step 3: Exercise all filter combinations**

- Status chip "Pendente" → only pendentes shown, no stage chip active.
- Stage chip "📐 Conferência de Medidas" → only pedidos currently in that stage, status chip resets to "Todos".
- Status chip "Atrasado" while a stage chip is active → stage chip deactivates, atrasados shown.
- Consultora select (if applicable) combined with an active status or stage filter → both apply correctly.

- [ ] **Step 4: Final commit check**

Run: `git status` and `git log --oneline -7` to confirm all 6 implementation commits are present and the working tree is clean (aside from any unrelated pre-existing changes noted in the original `git status`).
