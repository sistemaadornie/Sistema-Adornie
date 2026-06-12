# Fluxo do Pedido — Expansão para 8 Etapas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the "fluxo do pedido" from 5 to 8 stages (Pedidos, Conferência de Medidas, Produção/Compras, Conferência do Produto, Agendamento (Instalação), Separação, Entrega, Pós-venda), per the approved spec at `docs/superpowers/specs/2026-06-11-fluxo-pedido-8-etapas-design.md`.

**Architecture:** Two new boolean columns (`pedido_itens.produto_ok`, `agendamento_itens.separado`) back the two new item-level checklists. `calcularEtapaAtual` (backend/src/services/dashboardService.js) is extended to compute 8 cascading `etapaN_ok` flags from aggregated counts; `buscarFluxoPedido` and `listarPedidosDashboard` compute those counts (per-pedido and batched, respectively) and feed them in. Two new PATCH endpoints toggle the new booleans; etapa 7 reuses the existing `PUT /agendamentos/:id/status`. Frontend gets 3 new etapa modal components and renumbered config in `EtapaCard.jsx`, `Pedidos.jsx`, and `PedidoFluxo.jsx`.

**Tech Stack:** Node.js/Express backend with `pg` (node-postgres), Jest for backend tests, React frontend, PostgreSQL via Supabase (project `agenda_adornie`, id `zexexngoujgtnlvydrjh`).

---

### Task 1: Create migration `pedido_itens_produto_ok.sql`

**Files:**
- Create: `backend/src/database/migrations/pedido_itens_produto_ok.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- pedido_itens_produto_ok.sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS produto_ok BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/database/migrations/pedido_itens_produto_ok.sql
git commit -m "feat(pedidos): adiciona coluna produto_ok em pedido_itens"
```

---

### Task 2: Create migration `agendamento_itens_separado.sql`

**Files:**
- Create: `backend/src/database/migrations/agendamento_itens_separado.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- agendamento_itens_separado.sql
ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS separado BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/database/migrations/agendamento_itens_separado.sql
git commit -m "feat(agendamentos): adiciona coluna separado em agendamento_itens"
```

---

### Task 3: Apply both migrations to Supabase

**Files:** none (database operation only)

- [ ] **Step 1: Apply `pedido_itens_produto_ok.sql`**

Use the Supabase MCP `apply_migration` tool with:
- `project_id`: `zexexngoujgtnlvydrjh`
- `name`: `pedido_itens_produto_ok`
- `query`:
```sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS produto_ok BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply `agendamento_itens_separado.sql`**

Use the Supabase MCP `apply_migration` tool with:
- `project_id`: `zexexngoujgtnlvydrjh`
- `name`: `agendamento_itens_separado`
- `query`:
```sql
ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS separado BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Verify both columns exist**

Use the Supabase MCP `list_tables` tool (project_id `zexexngoujgtnlvydrjh`, schema `public`) and confirm `pedido_itens.produto_ok` and `agendamento_itens.separado` are present as `boolean NOT NULL DEFAULT false`.

---

### Task 4: Rewrite `calcularEtapaAtual` for 8 etapas (TDD)

**Files:**
- Modify: `backend/src/services/dashboardService.js:12-47`
- Test: `backend/src/__tests__/dashboardService.test.js:7-89`

- [ ] **Step 1: Replace the `calcularEtapaAtual` describe block with the new 8-etapa tests**

Replace lines 7-89 of `backend/src/__tests__/dashboardService.test.js` (the entire `describe("calcularEtapaAtual", ...)` block) with:

```js
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
    itensComProdutoOk: 0,
    genitoresAgendados: 0,
    instalacoesTotal: 0,
    instalacoesConcluidas: 0,
    totalItensInstalacao: 0,
    itensSeparados: 0,
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

  test("etapas 1-3 completas, conferencia do produto pendente -> etapa_atual 4", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 2,
      itensComProdutoOk: 1,
    });
    expect(r.etapa3_ok).toBe(true);
    expect(r.etapa4_ok).toBe(false);
    expect(r.etapa_atual).toBe(4);
  });

  test("etapas 1-4 completas, sem agendamento de instalacao -> etapa_atual 5", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 2,
      itensComProdutoOk: 2,
      genitoresAgendados: 0,
    });
    expect(r.etapa4_ok).toBe(true);
    expect(r.etapa5_ok).toBe(false);
    expect(r.etapa_atual).toBe(5);
  });

  test("etapas 1-5 completas, instalacao agendada sem separacao -> etapa_atual 6", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 2,
      itensComProdutoOk: 2,
      genitoresAgendados: 1,
      instalacoesTotal: 1,
      totalItensInstalacao: 2,
      itensSeparados: 0,
    });
    expect(r.etapa5_ok).toBe(true);
    expect(r.etapa6_ok).toBe(false);
    expect(r.etapa_atual).toBe(6);
  });

  test("etapas 1-6 completas, instalacao nao concluida -> etapa_atual 7", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 2,
      itensComProdutoOk: 2,
      genitoresAgendados: 1,
      instalacoesTotal: 1,
      instalacoesConcluidas: 0,
      totalItensInstalacao: 2,
      itensSeparados: 2,
    });
    expect(r.etapa6_ok).toBe(true);
    expect(r.etapa7_ok).toBe(false);
    expect(r.etapa_atual).toBe(7);
  });

  test("etapas 1-7 completas, pos-venda pendente -> etapa_atual 8", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConf: 2,
      itensConferidos: 2,
      totalEmConf: 2,
      totalConfOk: 2,
      itensComProdutoOk: 2,
      genitoresAgendados: 1,
      instalacoesTotal: 1,
      instalacoesConcluidas: 1,
      totalItensInstalacao: 2,
      itensSeparados: 2,
    });
    expect(r.etapa7_ok).toBe(true);
    expect(r.etapa8_ok).toBe(false);
    expect(r.etapa_atual).toBe(8);
  });

  test("status concluido forca etapa_atual 8 mesmo com etapa 1 incompleta", () => {
    const r = calcularEtapaAtual({ ...base, verificacaoOk: false, status: "concluido" });
    expect(r.etapa8_ok).toBe(true);
    expect(r.etapa_atual).toBe(8);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest dashboardService.test.js -t calcularEtapaAtual`
Expected: FAIL — tests for etapa 4-8 fail because `calcularEtapaAtual` doesn't return `etapa4_ok`..`etapa8_ok` yet, and `etapa_atual` doesn't reach 4-8.

- [ ] **Step 3: Replace `calcularEtapaAtual` implementation**

Replace lines 12-47 of `backend/src/services/dashboardService.js` with:

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
  itensComProdutoOk,
  genitoresAgendados,
  instalacoesTotal,
  instalacoesConcluidas,
  totalItensInstalacao,
  itensSeparados,
  status,
}) {
  const etapa1_ok = verificacaoOk &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    itensCobertos >= totalItens;

  const etapa2_ok = totalItensConf > 0 && itensConferidos >= totalItensConf;

  const etapa3_ok = totalEmConf === 0 || totalConfOk >= totalEmConf;

  const etapa4_ok = totalItens > 0 && itensComProdutoOk >= totalItens;

  const etapa5_ok = genitoresAgendados > 0;

  const etapa6_ok = instalacoesTotal > 0 &&
                    totalItensInstalacao > 0 &&
                    itensSeparados >= totalItensInstalacao;

  const etapa7_ok = instalacoesTotal > 0 && instalacoesConcluidas >= instalacoesTotal;

  const etapa8_ok = status === "concluido";

  let etapa_atual = 1;
  if (etapa1_ok) etapa_atual = 2;
  if (etapa1_ok && etapa2_ok) etapa_atual = 3;
  if (etapa1_ok && etapa2_ok && etapa3_ok) etapa_atual = 4;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok) etapa_atual = 5;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok && etapa5_ok) etapa_atual = 6;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok && etapa5_ok && etapa6_ok) etapa_atual = 7;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok && etapa5_ok && etapa6_ok && etapa7_ok) etapa_atual = 8;
  if (etapa8_ok) etapa_atual = 8;

  return {
    etapa_atual,
    etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok,
    etapa5_ok, etapa6_ok, etapa7_ok, etapa8_ok,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest dashboardService.test.js -t calcularEtapaAtual`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "feat(dashboard): calcularEtapaAtual passa a calcular 8 etapas"
```

---

### Task 5: Update `listarPedidosDashboard` for 8 etapas

**Files:**
- Modify: `backend/src/services/dashboardService.js:49-301` (function `listarPedidosDashboard`)
- Test: `backend/src/__tests__/dashboardService.test.js` (the `describe("listarPedidosDashboard", ...)` block — now starting after the block replaced in Task 4)

- [ ] **Step 1: Update the `listarPedidosDashboard` test mocks**

Replace the entire `describe("listarPedidosDashboard", ...)` block (the two tests after `calcularEtapaAtual`) with:

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
      .mockResolvedValueOnce({ rows: [] })
      // 10) produto_ok por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 11) instalacoes por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 12) separacao por pedido
      .mockResolvedValueOnce({ rows: [] });

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    // Etapa 1: itens sem vinculo (6ª query) deve filtrar por categoria vinculavel
    const querySemVinculo = db.query.mock.calls[5][0];
    expect(querySemVinculo).toContain("cat.vinculavel");

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
      .mockResolvedValueOnce({ rows: [] }) // genitores agendados
      .mockResolvedValueOnce({ rows: [] }) // produto_ok
      .mockResolvedValueOnce({ rows: [] }) // instalacoes
      .mockResolvedValueOnce({ rows: [] }); // separacao

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    expect(resultado[0].estagio.etapa_atual).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest dashboardService.test.js -t listarPedidosDashboard`
Expected: FAIL — `db.query` is called only 9 times by the current implementation but the mock queue now has 12 entries queued per test; the 10th-12th queued mocks for the first test will be consumed by the *second* test's first calls (mocks are a shared queue), producing wrong/undefined rows and likely a thrown error or wrong `etapa_atual`.

- [ ] **Step 3: Add the 3 new batched queries and pass new fields to `calcularEtapaAtual`**

In `backend/src/services/dashboardService.js`, in `listarPedidosDashboard`, replace the `Promise.all` destructuring and array (lines ~112-210) with:

```js
  const [
    { rows: preAgs },
    { rows: totalItensRows },
    { rows: itensCobertosRows },
    { rows: itensSemCatRows },
    { rows: itensSemVincRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
    { rows: produtoOkRows },
    { rows: instalacaoRows },
    { rows: separacaoRows },
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
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = ANY($1)
         AND COALESCE(cat.vinculavel, false) = true
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
    // Etapa 5: genitores agendados por pedido
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
    // Etapa 4: itens com produto_ok por pedido
    db.query(
      `SELECT pedido_id, COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens
       WHERE pedido_id = ANY($1)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
    // Etapa 6/7: instalacoes (herdeiros tipo Instalacao) por pedido, via genitor
    db.query(
      `SELECT g.pedido_id,
              COUNT(*)::int AS instalacoes_total,
              COUNT(*) FILTER (WHERE h.status = 'concluido')::int AS instalacoes_concluidas
       FROM agendamentos h
       JOIN agendamentos g ON g.id = h.agendamento_pai_id
       WHERE g.pedido_id = ANY($1) AND h.empresa_id = $2 AND h.tipo = 'Instalação'
       GROUP BY g.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 6: itens de separacao das instalacoes por pedido
    db.query(
      `SELECT g.pedido_id,
              COUNT(ai.id)::int AS total_itens_instalacao,
              COUNT(ai.id) FILTER (WHERE ai.separado = true)::int AS itens_separados
       FROM agendamentos h
       JOIN agendamentos g ON g.id = h.agendamento_pai_id
       JOIN agendamento_itens ai ON ai.agendamento_id = h.id AND ai.pedido_item_id IS NOT NULL
       WHERE g.pedido_id = ANY($1) AND h.empresa_id = $2 AND h.tipo = 'Instalação'
       GROUP BY g.pedido_id`,
      [pedidoIds, empresaId]
    ),
  ]);
```

- [ ] **Step 4: Build lookup maps and pass new fields to `calcularEtapaAtual`**

Immediately after the existing lookup-map block (after `for (const r of agendadoRows) agendadosPorPedido[r.pedido_id] = Number(r.agendados);`), add:

```js
  const produtoOkPorPedido = {};
  for (const r of produtoOkRows) produtoOkPorPedido[r.pedido_id] = Number(r.produto_ok);

  const instalacaoPorPedido = {};
  for (const r of instalacaoRows) {
    instalacaoPorPedido[r.pedido_id] = {
      total: Number(r.instalacoes_total),
      concluidas: Number(r.instalacoes_concluidas),
    };
  }

  const separacaoPorPedido = {};
  for (const r of separacaoRows) {
    separacaoPorPedido[r.pedido_id] = {
      total: Number(r.total_itens_instalacao),
      separados: Number(r.itens_separados),
    };
  }
```

Then update the `calcularEtapaAtual` call inside `resultado = pedidos.map((p) => { ... })`. Replace:

```js
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
```

with:

```js
    const conf = confPorPedido[p.id] || { total: 0, conferidos: 0 };
    const prod = prodPorPedido[p.id] || { em_confeccao: 0, confeccao_ok: 0 };
    const inst = instalacaoPorPedido[p.id] || { total: 0, concluidas: 0 };
    const sep = separacaoPorPedido[p.id] || { total: 0, separados: 0 };

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
      itensComProdutoOk: produtoOkPorPedido[p.id] || 0,
      genitoresAgendados: agendadosPorPedido[p.id] || 0,
      instalacoesTotal: inst.total,
      instalacoesConcluidas: inst.concluidas,
      totalItensInstalacao: sep.total,
      itensSeparados: sep.separados,
      status: p.status,
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest dashboardService.test.js`
Expected: PASS (all tests in both describe blocks)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "feat(dashboard): listarPedidosDashboard calcula agregados das novas etapas"
```

---

### Task 6: Update `buscarFluxoPedido` for 8 etapas

**Files:**
- Modify: `backend/src/services/dashboardService.js` (function `buscarFluxoPedido`, currently lines ~303-596)

There are no existing automated tests for `buscarFluxoPedido` (verified — no test file references it). This task replaces the whole function body. Manual verification happens in Task 16.

- [ ] **Step 1: Replace the `buscarFluxoPedido` function**

Replace the entire `buscarFluxoPedido` function (from `async function buscarFluxoPedido(pedidoId, empresaId, userId, permissoes) {` to its closing `}` before `module.exports`) with:

```js
async function buscarFluxoPedido(pedidoId, empresaId, userId, permissoes) {
  const { rows: pedidos } = await db.query(
    `SELECT p.id, p.numero_sequencial, p.numero_origem, p.status, p.verificacao_ok, p.categorizacao_ok,
            p.total, p.created_at AS criado_em,
            p.cliente_id,
            p.cep, p.rua, p.numero AS numero_rua, p.complemento, p.bairro, p.cidade, p.estado,
            c.nome          AS cliente_nome,
            u.nome_completo AS consultor_nome,
            u.id            AS consultor_id
     FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN usuarios u ON u.id = p.consultor_id
     WHERE p.id = $1 AND p.empresa_id = $2`,
    [pedidoId, empresaId]
  );

  if (!pedidos.length) {
    const err = new Error("Pedido não encontrado");
    err.status = 404;
    throw err;
  }

  const pedido = pedidos[0];
  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  if (!temPermGeral && Number(pedido.consultor_id) !== Number(userId)) {
    const err = new Error("Acesso negado");
    err.status = 403;
    throw err;
  }

  const [{ rows: anexos }, { rows: vinculos }, { rows: allItems }, { rows: itensRows }] = await Promise.all([
    db.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
    db.query(
      `SELECT 1 FROM pedido_item_vinculos piv
       JOIN pedido_itens pi ON pi.id = piv.item_id
       WHERE pi.pedido_id = $1 LIMIT 1`,
      [pedidoId]
    ),
    db.query(`SELECT 1 FROM pedido_itens WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
    db.query(
      `SELECT id, descricao, ambiente, quantidade, unidade, em_confeccao, confeccao_ok, produto_ok
       FROM pedido_itens WHERE pedido_id = $1 ORDER BY ordem ASC, id ASC`,
      [pedidoId]
    ),
  ]);
  pedido.itens = itensRows;

  const { rows: genitoresRaw } = await db.query(
    `SELECT a.id, a.status, a.tipo, a.data AS data_inicio
     FROM agendamentos a
     WHERE a.pedido_id = $1 AND a.empresa_id = $2
       AND a.agendamento_pai_id IS NULL
       AND EXISTS (
         SELECT 1 FROM agendamento_itens ai
         WHERE ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
       )
     ORDER BY a.data`,
    [pedidoId, empresaId]
  );

  const vinculos_ok = allItems.length === 0 || vinculos.length > 0;
  const estagio_base = {
    pdf_ok: anexos.length > 0,
    verificacao_ok: pedido.verificacao_ok,
    categorizacao_ok: pedido.categorizacao_ok,
    vinculos_ok,
  };

  // Etapas 1-4 — queries independentes em paralelo
  const [
    { rows: totalItensRows },
    { rows: itensCobertosRows },
    { rows: itensSemCatRows },
    { rows: itensSemVinculoRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
    { rows: produtoOkRows },
  ] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM pedido_itens WHERE pedido_id = $1`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL`,
      [pedidoId, empresaId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS sem_cat
       FROM pedido_itens pi
       LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
       LEFT JOIN produtos prod ON prod.id = oi.produto_id
       WHERE pi.pedido_id = $1
         AND COALESCE(pi.categoria_id, prod.categoria_id) IS NULL`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS sem_vinc
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = $1
         AND COALESCE(cat.vinculavel, false) = true
         AND pi.sem_vinculo = false
         AND NOT EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
         )`,
      [pedidoId]
    ),
    db.query(
      `SELECT
         COUNT(DISTINCT pi.id)::int AS total,
         COUNT(DISTINCT ci.pedido_item_id) FILTER (WHERE ci.status = 'conferido')::int AS conferidos
       FROM pedido_itens pi
       LEFT JOIN conferencia_itens ci ON ci.pedido_item_id = pi.id AND ci.empresa_id = $2
       WHERE pi.pedido_id = $1`,
      [pedidoId, empresaId]
    ),
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE em_confeccao = true)::int AS em_confeccao,
         COUNT(*) FILTER (WHERE em_confeccao = true AND confeccao_ok = true)::int AS confeccao_ok
       FROM pedido_itens
       WHERE pedido_id = $1`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS agendados
       FROM agendamentos a
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND a.status = 'agendado'
         AND a.agendamento_pai_id IS NULL
         AND EXISTS (
           SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id = a.id
         )`,
      [pedidoId, empresaId]
    ),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens
       WHERE pedido_id = $1`,
      [pedidoId]
    ),
  ]);

  const totalItens = totalItensRows[0]?.total ?? 0;
  const itensCobertos = itensCobertosRows[0]?.cobertos ?? 0;
  const itensSemCategoria = itensSemCatRows[0]?.sem_cat ?? 0;
  const itensSemVinculo = itensSemVinculoRows[0]?.sem_vinc ?? 0;
  const { total: totalItensConf, conferidos: itensConferidos } = confRows[0] ?? { total: 0, conferidos: 0 };
  const { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } = prodRows[0] ?? { em_confeccao: 0, confeccao_ok: 0 };
  const genitoresAgendados = agendadoRows[0]?.agendados ?? 0;
  const itensComProdutoOk = produtoOkRows[0]?.produto_ok ?? 0;

  if (!genitoresRaw.length) {
    const { etapa_atual, etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok } = calcularEtapaAtual({
      verificacaoOk: pedido.verificacao_ok,
      itensSemCategoria,
      itensSemVinculo,
      totalItens,
      itensCobertos,
      totalItensConf,
      itensConferidos,
      totalEmConf,
      totalConfOk,
      itensComProdutoOk,
      genitoresAgendados: 0,
      instalacoesTotal: 0,
      instalacoesConcluidas: 0,
      totalItensInstalacao: 0,
      itensSeparados: 0,
      status: pedido.status,
    });
    return {
      pedido,
      etapa_atual,
      etapas: [
        { numero: 1, concluida: etapa1_ok, progresso: { tem_anexo: anexos.length > 0, verificacao_ok: !!pedido.verificacao_ok, itens_sem_categoria: itensSemCategoria, itens_sem_vinculo: itensSemVinculo, total_itens: totalItens, itens_cobertos: itensCobertos } },
        { numero: 2, concluida: etapa2_ok, progresso: { total: totalItensConf, conferidos: itensConferidos } },
        { numero: 3, concluida: etapa3_ok, progresso: { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } },
        { numero: 4, concluida: etapa4_ok, progresso: { total_itens: totalItens, itens_produto_ok: itensComProdutoOk } },
        { numero: 5, concluida: false, progresso: { genitores_agendados: 0 } },
        { numero: 6, concluida: false, progresso: { total_itens_instalacao: 0, itens_separados: 0 } },
        { numero: 7, concluida: false, progresso: { instalacoes_total: 0, instalacoes_concluidas: 0 } },
        { numero: 8, concluida: false, progresso: { status: pedido.status } },
      ],
      estagio: { ...estagio_base, pre_agendamentos: [], proximo_prazo: null, dias_para_prazo: null, nivel_alerta: null },
      pre_agendamentos: [],
    };
  }

  const genitoreIds = genitoresRaw.map((g) => g.id);

  const [{ rows: itensPorGenitor }, { rows: herdeirosRaw }] = await Promise.all([
    db.query(
      `SELECT ai.agendamento_id, ai.pedido_item_id, pi.descricao,
              os.id AS ordem_servico_id,
              (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
      [genitoreIds]
    ),
    db.query(
      `SELECT id, agendamento_pai_id, tipo, status, data AS data_inicio
       FROM agendamentos
       WHERE agendamento_pai_id = ANY($1) AND empresa_id = $2
       ORDER BY data`,
      [genitoreIds, empresaId]
    ),
  ]);

  const itensPorAg = {};
  for (const item of itensPorGenitor) {
    if (!itensPorAg[item.agendamento_id]) itensPorAg[item.agendamento_id] = [];
    itensPorAg[item.agendamento_id].push({
      pedido_item_id: item.pedido_item_id,
      descricao: item.descricao,
      ordem_servico_id: item.ordem_servico_id,
      ficha_preenchida: item.ficha_preenchida,
    });
  }

  const instalacaoHerdeiros = herdeirosRaw.filter((h) => h.tipo === "Instalação");
  const instalacaoIds = instalacaoHerdeiros.map((h) => h.id);
  const instalacoesTotal = instalacaoHerdeiros.length;
  const instalacoesConcluidas = instalacaoHerdeiros.filter((h) => h.status === "concluido").length;

  const { rows: separacaoRows } = await db.query(
    `SELECT ai.agendamento_id, ai.pedido_item_id, ai.separado, pi.descricao, pi.ambiente
     FROM agendamento_itens ai
     JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
     WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
    [instalacaoIds]
  );

  const totalItensInstalacao = separacaoRows.length;
  const itensSeparados = separacaoRows.filter((r) => r.separado).length;

  const itensSeparacaoPorAg = {};
  for (const r of separacaoRows) {
    if (!itensSeparacaoPorAg[r.agendamento_id]) itensSeparacaoPorAg[r.agendamento_id] = [];
    itensSeparacaoPorAg[r.agendamento_id].push({
      pedido_item_id: r.pedido_item_id,
      descricao: r.descricao,
      ambiente: r.ambiente,
      separado: r.separado,
    });
  }

  const herdeirosporPai = {};
  for (const h of herdeirosRaw) {
    if (!herdeirosporPai[h.agendamento_pai_id]) herdeirosporPai[h.agendamento_pai_id] = [];
    herdeirosporPai[h.agendamento_pai_id].push({
      id: h.id,
      tipo: h.tipo,
      status: h.status,
      data_inicio: h.data_inicio,
      itens: itensSeparacaoPorAg[h.id] || [],
    });
  }

  const pre_agendamentos = genitoresRaw.map((g) => ({
    id: g.id,
    data_inicio: g.data_inicio,
    status: g.status,
    itens: itensPorAg[g.id] || [],
    herdeiros: herdeirosporPai[g.id] || [],
  }));

  const hoje = new Date();
  const futuros = pre_agendamentos
    .filter((a) => a.status === "pre_agendado" || a.status === "agendado")
    .sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
  const proximoPrazo = futuros[0]?.data_inicio || null;
  const diasParaPrazo = proximoPrazo
    ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
    : null;

  const { etapa_atual, etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok, etapa5_ok, etapa6_ok, etapa7_ok, etapa8_ok } = calcularEtapaAtual({
    verificacaoOk: pedido.verificacao_ok,
    itensSemCategoria,
    itensSemVinculo,
    totalItens,
    itensCobertos,
    totalItensConf,
    itensConferidos,
    totalEmConf,
    totalConfOk,
    itensComProdutoOk,
    genitoresAgendados,
    instalacoesTotal,
    instalacoesConcluidas,
    totalItensInstalacao,
    itensSeparados,
    status: pedido.status,
  });

  const etapas = [
    {
      numero: 1,
      concluida: etapa1_ok,
      progresso: {
        tem_anexo: anexos.length > 0,
        verificacao_ok: !!pedido.verificacao_ok,
        itens_sem_categoria: itensSemCategoria,
        itens_sem_vinculo: itensSemVinculo,
        total_itens: totalItens,
        itens_cobertos: itensCobertos,
      },
    },
    {
      numero: 2,
      concluida: etapa2_ok,
      progresso: { total: totalItensConf, conferidos: itensConferidos },
    },
    {
      numero: 3,
      concluida: etapa3_ok,
      progresso: { em_confeccao: totalEmConf, confeccao_ok: totalConfOk },
    },
    {
      numero: 4,
      concluida: etapa4_ok,
      progresso: { total_itens: totalItens, itens_produto_ok: itensComProdutoOk },
    },
    {
      numero: 5,
      concluida: etapa5_ok,
      progresso: { genitores_agendados: genitoresAgendados },
    },
    {
      numero: 6,
      concluida: etapa6_ok,
      progresso: { total_itens_instalacao: totalItensInstalacao, itens_separados: itensSeparados },
    },
    {
      numero: 7,
      concluida: etapa7_ok,
      progresso: { instalacoes_total: instalacoesTotal, instalacoes_concluidas: instalacoesConcluidas },
    },
    {
      numero: 8,
      concluida: etapa8_ok,
      progresso: { status: pedido.status },
    },
  ];

  return {
    pedido,
    etapa_atual,
    etapas,
    estagio: {
      ...estagio_base,
      pre_agendamentos: pre_agendamentos.map((a) => ({
        id: a.id, data_inicio: a.data_inicio, status: a.status, itens_count: a.itens.length,
      })),
      proximo_prazo: proximoPrazo,
      dias_para_prazo: diasParaPrazo,
      nivel_alerta: calcNivelAlerta(diasParaPrazo),
    },
    pre_agendamentos,
  };
}
```

- [ ] **Step 2: Run the backend test suite to confirm nothing else broke**

Run: `cd backend && npx jest dashboardService.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "feat(dashboard): buscarFluxoPedido calcula as 8 etapas e retorna progresso/itens das novas etapas"
```

---

### Task 7: Add `PATCH /pedidos/:id/conferencia-produto-itens`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js` (insert after the `producao-itens` route, currently ending at line 561)

- [ ] **Step 1: Add the new route**

In `backend/src/routes/pedidosRoutes.js`, immediately after the closing `});` of `router.patch("/:id/producao-itens", ...)` (line 561), insert:

```js

// PATCH /pedidos/:id/conferencia-produto-itens
router.patch("/:id/conferencia-produto-itens", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { pedido_item_id, produto_ok } = req.body;

    if (!pedido_item_id) return res.status(400).json({ message: "pedido_item_id obrigatório." });
    if (typeof produto_ok !== "boolean") return res.status(400).json({ message: "produto_ok (boolean) obrigatório." });

    // Verificar que o item pertence ao pedido e à empresa
    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [pedido_item_id, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    const { rows } = await db.query(
      `UPDATE pedido_itens SET produto_ok = $1 WHERE id = $2 RETURNING id, produto_ok`,
      [produto_ok, pedido_item_id]
    );
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar conferência do produto." });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(pedidos): adiciona endpoint PATCH conferencia-produto-itens"
```

---

### Task 8: Add `PATCH /agendamentos/:id/itens/:itemId/separado`

**Files:**
- Modify: `backend/src/routes/agendamentosRoutes.js` (insert after the `confirmar-cliente` route, currently ending at line 375)

- [ ] **Step 1: Add the new route**

In `backend/src/routes/agendamentosRoutes.js`, immediately after the closing `});` of `router.patch("/:id/confirmar-cliente", ...)` (line 375), insert:

```js

// PATCH /agendamentos/:id/itens/:itemId/separado
router.patch("/:id/itens/:itemId/separado", authMiddleware, async (req, res) => {
  try {
    const db = require("../database/db");
    const agendamentoId = Number(req.params.id);
    const pedidoItemId = Number(req.params.itemId);
    const { empresa_id } = req.user;
    const { separado } = req.body;

    if (typeof separado !== "boolean") {
      return res.status(400).json({ message: "Campo 'separado' (boolean) é obrigatório." });
    }

    const check = await db.query(
      `SELECT id FROM agendamentos WHERE id = $1 AND empresa_id = $2 AND tipo = 'Instalação'`,
      [agendamentoId, empresa_id]
    );
    if (!check.rows.length) return res.status(404).json({ message: "Agendamento de instalação não encontrado." });

    const { rows } = await db.query(
      `UPDATE agendamento_itens SET separado = $1
       WHERE agendamento_id = $2 AND pedido_item_id = $3
       RETURNING id, pedido_item_id, separado`,
      [separado, agendamentoId, pedidoItemId]
    );
    if (!rows.length) return res.status(404).json({ message: "Item não encontrado neste agendamento." });

    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar separação." });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/agendamentosRoutes.js
git commit -m "feat(agendamentos): adiciona endpoint PATCH itens/:itemId/separado"
```

---

### Task 9: Update `EtapaCard.jsx` for 8 etapas

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx`

- [ ] **Step 1: Replace `ETAPA_CONFIG` and the status/progress functions**

Replace lines 3-59 of `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx` with:

```js
const ETAPA_CONFIG = {
  1: { icone: "📋", titulo: "Pedidos" },
  2: { icone: "📐", titulo: "Conferência de Medidas" },
  3: { icone: "⚙️", titulo: "Produção/Compras" },
  4: { icone: "🔍", titulo: "Conferência do Produto" },
  5: { icone: "📅", titulo: "Agendamento (Instalação)" },
  6: { icone: "📦", titulo: "Separação" },
  7: { icone: "🚚", titulo: "Entrega" },
  8: { icone: "⭐", titulo: "Pós-venda" },
};

export default function EtapaCard({ etapa, etapaAtual, onClick }) {
  const { numero, concluida, progresso } = etapa;
  const config = ETAPA_CONFIG[numero];
  const ativa = !concluida && numero === etapaAtual;
  const pendente = !concluida && !ativa;

  let cls = "etapa-card";
  if (concluida) cls += " concluida";
  else if (ativa) cls += " ativa";
  else cls += " pendente";

  function buildStatusLabel() {
    if (concluida) return "Concluído";
    if (pendente) return "Aguardando";
    if (numero === 1) {
      const { itens_cobertos = 0, total_itens = 0 } = progresso;
      return `${itens_cobertos} de ${total_itens} itens agendados`;
    }
    if (numero === 2) {
      const { conferidos = 0, total = 0 } = progresso;
      return `${conferidos} de ${total} conferidos`;
    }
    if (numero === 3) {
      const { em_confeccao = 0, confeccao_ok = 0 } = progresso;
      if (em_confeccao === 0) return "Sem itens em confecção";
      return `${confeccao_ok} de ${em_confeccao} concluídos`;
    }
    if (numero === 4) {
      const { itens_produto_ok = 0, total_itens = 0 } = progresso;
      return `${itens_produto_ok} de ${total_itens} conferidos`;
    }
    if (numero === 5) return "Aguardando confirmação";
    if (numero === 6) {
      const { total_itens_instalacao = 0, itens_separados = 0 } = progresso;
      if (total_itens_instalacao === 0) return "Nenhuma instalação agendada";
      return `${itens_separados} de ${total_itens_instalacao} separados`;
    }
    if (numero === 7) {
      const { instalacoes_total = 0, instalacoes_concluidas = 0 } = progresso;
      if (instalacoes_total === 0) return "Nenhuma instalação agendada";
      return `${instalacoes_concluidas} de ${instalacoes_total} concluídas`;
    }
    if (numero === 8) return "Aguardando encerramento";
    return "Em andamento";
  }

  function buildProgressPct() {
    if (concluida) return 100;
    if (numero === 1) {
      const { itens_cobertos = 0, total_itens = 1 } = progresso;
      return Math.round((itens_cobertos / total_itens) * 100);
    }
    if (numero === 2) {
      const { conferidos = 0, total = 1 } = progresso;
      return Math.round((conferidos / total) * 100);
    }
    if (numero === 3) {
      const { em_confeccao = 0, confeccao_ok = 0 } = progresso;
      if (em_confeccao === 0) return 100;
      return Math.round((confeccao_ok / em_confeccao) * 100);
    }
    if (numero === 4) {
      const { itens_produto_ok = 0, total_itens = 0 } = progresso;
      if (total_itens === 0) return 0;
      return Math.round((itens_produto_ok / total_itens) * 100);
    }
    if (numero === 6) {
      const { total_itens_instalacao = 0, itens_separados = 0 } = progresso;
      if (total_itens_instalacao === 0) return 0;
      return Math.round((itens_separados / total_itens_instalacao) * 100);
    }
    if (numero === 7) {
      const { instalacoes_total = 0, instalacoes_concluidas = 0 } = progresso;
      if (instalacoes_total === 0) return 0;
      return Math.round((instalacoes_concluidas / instalacoes_total) * 100);
    }
    return 0;
  }
```

The remaining function body (the `const pct = ...` line and the `return (...)` JSX block, lines 61-91 of the original file) stays unchanged.

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx
git commit -m "feat(pedidos): EtapaCard suporta as 8 etapas do fluxo"
```

---

### Task 10: Update `ETAPA_CONFIG` in `Pedidos.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx:19-25`

- [ ] **Step 1: Replace `ETAPA_CONFIG`**

Replace lines 19-25 of `frontend-web/src/pages/pedidos/Pedidos.jsx`:

```js
const ETAPA_CONFIG = [
  { numero: 1, label: "Dados do Pedido",          labelCurto: "Pedido",      icone: "📋" },
  { numero: 2, label: "Conferência de Medidas",   labelCurto: "Medidas",     icone: "📐" },
  { numero: 3, label: "Produção",                 labelCurto: "Produção",    icone: "⚙️" },
  { numero: 4, label: "Agendamento",              labelCurto: "Agendamento", icone: "📅" },
  { numero: 5, label: "Pós-venda",                labelCurto: "Pós-venda",   icone: "⭐" },
];
```

with:

```js
const ETAPA_CONFIG = [
  { numero: 1, label: "Pedidos",                  labelCurto: "Pedidos",       icone: "📋" },
  { numero: 2, label: "Conferência de Medidas",   labelCurto: "Medidas",       icone: "📐" },
  { numero: 3, label: "Produção/Compras",         labelCurto: "Produção",      icone: "⚙️" },
  { numero: 4, label: "Conferência do Produto",   labelCurto: "Conf. Produto", icone: "🔍" },
  { numero: 5, label: "Agendamento (Instalação)", labelCurto: "Agendamento",   icone: "📅" },
  { numero: 6, label: "Separação",                labelCurto: "Separação",     icone: "📦" },
  { numero: 7, label: "Entrega",                  labelCurto: "Entrega",       icone: "🚚" },
  { numero: 8, label: "Pós-venda",                labelCurto: "Pós-venda",     icone: "⭐" },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx
git commit -m "feat(pedidos): chips de filtro da listagem cobrem as 8 etapas"
```

---

### Task 11: Rename headers in existing etapa components

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx:61-62`
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx:31-32`
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx:36-37`
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaPosvenda.jsx:29-30`

No logic changes — only header text/number.

- [ ] **Step 1: `EtapaDadosPedido.jsx`**

Replace:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 1</div>
            <div className="pf-modal-titulo">📋 Dados do Pedido</div>
```
with:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 1</div>
            <div className="pf-modal-titulo">📋 Pedidos</div>
```

- [ ] **Step 2: `EtapaProducao.jsx`**

Replace:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 3</div>
            <div className="pf-modal-titulo">⚙️ Produção</div>
```
with:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 3</div>
            <div className="pf-modal-titulo">⚙️ Produção/Compras</div>
```

- [ ] **Step 3: `EtapaAgendamento.jsx`**

Replace:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 4</div>
            <div className="pf-modal-titulo">📅 Agendamento</div>
```
with:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 5</div>
            <div className="pf-modal-titulo">📅 Agendamento (Instalação)</div>
```

- [ ] **Step 4: `EtapaPosvenda.jsx`**

Replace:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 5</div>
            <div className="pf-modal-titulo">⭐ Pós-venda</div>
```
with:
```jsx
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 8</div>
            <div className="pf-modal-titulo">⭐ Pós-venda</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx frontend-web/src/pages/pedidos/fluxo/etapas/EtapaPosvenda.jsx
git commit -m "feat(pedidos): renomeia cabecalhos das etapas existentes para o fluxo de 8 etapas"
```

---

### Task 12: Create `EtapaConferenciaProduto.jsx` (etapa 4)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferenciaProduto.jsx`

Modeled on `EtapaProducao.jsx`. Uses `pedido.itens[].produto_ok` (now returned by `buscarFluxoPedido`, Task 6) and calls `PATCH /pedidos/:id/conferencia-produto-itens` (Task 7).

- [ ] **Step 1: Create the component**

```jsx
import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";

export default function EtapaConferenciaProduto({ pedidoId, pedido, etapas, onClose, onRecarregar }) {
  const [itens, setItens] = useState(pedido?.itens || []);
  const [salvando, setSalvando] = useState({});

  useEffect(() => { setItens(pedido?.itens || []); }, [pedido]);

  async function toggleProdutoOk(itemId, valor) {
    setSalvando((s) => ({ ...s, [itemId]: true }));
    try {
      await api.patch(`/pedidos/${pedidoId}/conferencia-produto-itens`, {
        pedido_item_id: itemId,
        produto_ok: valor,
      });
      onRecarregar();
    } finally {
      setSalvando((s) => ({ ...s, [itemId]: false }));
    }
  }

  const etapa4 = etapas.find((e) => e.numero === 4) || {};
  const p = etapa4.progresso || {};

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 4</div>
            <div className="pf-modal-titulo">🔍 Conferência do Produto</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Confira a qualidade dos itens produzidos e o recebimento dos itens comprados.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.itens_produto_ok ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Conferidos</div>
            </div>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{(p.total_itens ?? 0) - (p.itens_produto_ok ?? 0)}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Pendentes</div>
            </div>
          </div>

          <hr className="pf-separador" />

          {itens.map((item) => (
            <div key={item.id} className="pf-item-row">
              <div style={{ flex: 1 }}>
                <div className="pf-item-descricao">{item.descricao}</div>
                {item.ambiente && <div className="pf-item-ambiente">{item.ambiente}</div>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!item.produto_ok}
                  onChange={() => toggleProdutoOk(item.id, !item.produto_ok)}
                  disabled={!!salvando[item.id]} />
                Conferido
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferenciaProduto.jsx
git commit -m "feat(pedidos): cria componente da etapa 4 (Conferência do Produto)"
```

---

### Task 13: Create `EtapaSeparacao.jsx` (etapa 6)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaSeparacao.jsx`

Reads "Instalação" herdeiros (with their `.itens` array, populated by Task 6) from `preAgendamentos`, calls `PATCH /agendamentos/:id/itens/:itemId/separado` (Task 8).

- [ ] **Step 1: Create the component**

```jsx
import React, { useState } from "react";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaSeparacao({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [salvando, setSalvando] = useState({});

  const etapa6 = etapas.find((e) => e.numero === 6) || {};
  const p = etapa6.progresso || {};

  const instalacoes = (preAgendamentos || [])
    .flatMap((g) => g.herdeiros || [])
    .filter((h) => h.tipo === "Instalação");

  async function toggleSeparado(agendamentoId, pedidoItemId, valor) {
    const key = `${agendamentoId}-${pedidoItemId}`;
    setSalvando((s) => ({ ...s, [key]: true }));
    try {
      await api.patch(`/agendamentos/${agendamentoId}/itens/${pedidoItemId}/separado`, {
        separado: valor,
      });
      onRecarregar();
    } finally {
      setSalvando((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 6</div>
            <div className="pf-modal-titulo">📦 Separação</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Separe os itens do pedido na bancada para a equipe de instalação.
          </p>

          {instalacoes.length === 0 ? (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhuma instalação agendada. Conclua a etapa 5 primeiro.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{p.itens_separados ?? 0}</div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Separados</div>
                </div>
                <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{(p.total_itens_instalacao ?? 0) - (p.itens_separados ?? 0)}</div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Pendentes</div>
                </div>
              </div>

              <hr className="pf-separador" />

              {instalacoes.map((inst) => (
                <div key={inst.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    Instalação — {fmtData(inst.data_inicio)}
                  </div>
                  {(inst.itens || []).map((item) => (
                    <div key={item.pedido_item_id} className="pf-item-row">
                      <div style={{ flex: 1 }}>
                        <div className="pf-item-descricao">{item.descricao}</div>
                        {item.ambiente && <div className="pf-item-ambiente">{item.ambiente}</div>}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!item.separado}
                          onChange={() => toggleSeparado(inst.id, item.pedido_item_id, !item.separado)}
                          disabled={!!salvando[`${inst.id}-${item.pedido_item_id}`]} />
                        Separado
                      </label>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaSeparacao.jsx
git commit -m "feat(pedidos): cria componente da etapa 6 (Separação)"
```

---

### Task 14: Create `EtapaEntrega.jsx` (etapa 7)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaEntrega.jsx`

Lists "Instalação" herdeiros from `preAgendamentos` and lets the user mark them `concluido` via the existing `PUT /agendamentos/:id/status` (multipart endpoint — must be called with `isFormData = true`).

- [ ] **Step 1: Create the component**

```jsx
import React, { useState } from "react";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaEntrega({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [concluindo, setConcluindo] = useState({});

  const instalacoes = (preAgendamentos || [])
    .flatMap((g) => g.herdeiros || [])
    .filter((h) => h.tipo === "Instalação");

  async function marcarConcluida(agendamentoId) {
    setConcluindo((s) => ({ ...s, [agendamentoId]: true }));
    try {
      const fd = new FormData();
      fd.append("status", "concluido");
      await api.put(`/agendamentos/${agendamentoId}/status`, fd, true);
      onRecarregar();
    } catch (e) {
      alert(e?.message || "Erro ao marcar entrega como concluída.");
    } finally {
      setConcluindo((s) => ({ ...s, [agendamentoId]: false }));
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 7</div>
            <div className="pf-modal-titulo">🚚 Entrega</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Confirme a entrega/instalação dos itens no cliente.
          </p>

          {instalacoes.length === 0 ? (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhuma instalação agendada.
            </div>
          ) : (
            instalacoes.map((inst) => {
              const concluida = inst.status === "concluido";
              return (
                <div key={inst.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Instalação — {fmtData(inst.data_inicio)}</div>
                  </div>
                  {concluida ? (
                    <span className="pf-badge pf-badge-ok">Concluída</span>
                  ) : (
                    <button className="pf-btn-primary" style={{ fontSize: 13 }}
                      onClick={() => marcarConcluida(inst.id)}
                      disabled={!!concluindo[inst.id]}>
                      ✅ Marcar como concluída
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaEntrega.jsx
git commit -m "feat(pedidos): cria componente da etapa 7 (Entrega)"
```

---

### Task 15: Update `ETAPA_COMPONENTES` map in `PedidoFluxo.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx:7-25`

- [ ] **Step 1: Add imports and update the map**

Replace lines 7-25 of `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`:

```js
import EtapaDadosPedido from "./fluxo/etapas/EtapaDadosPedido";
import EtapaConferencia from "./fluxo/etapas/EtapaConferencia";
import EtapaProducao from "./fluxo/etapas/EtapaProducao";
import EtapaAgendamento from "./fluxo/etapas/EtapaAgendamento";
import EtapaPosvenda from "./fluxo/etapas/EtapaPosvenda";
import "./PedidoFluxo.css";

function fmtMoeda(v) {
  if (v == null || v === "") return "0,00";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ETAPA_COMPONENTES = {
  1: EtapaDadosPedido,
  2: EtapaConferencia,
  3: EtapaProducao,
  4: EtapaAgendamento,
  5: EtapaPosvenda,
};
```

with:

```js
import EtapaDadosPedido from "./fluxo/etapas/EtapaDadosPedido";
import EtapaConferencia from "./fluxo/etapas/EtapaConferencia";
import EtapaProducao from "./fluxo/etapas/EtapaProducao";
import EtapaConferenciaProduto from "./fluxo/etapas/EtapaConferenciaProduto";
import EtapaAgendamento from "./fluxo/etapas/EtapaAgendamento";
import EtapaSeparacao from "./fluxo/etapas/EtapaSeparacao";
import EtapaEntrega from "./fluxo/etapas/EtapaEntrega";
import EtapaPosvenda from "./fluxo/etapas/EtapaPosvenda";
import "./PedidoFluxo.css";

function fmtMoeda(v) {
  if (v == null || v === "") return "0,00";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ETAPA_COMPONENTES = {
  1: EtapaDadosPedido,
  2: EtapaConferencia,
  3: EtapaProducao,
  4: EtapaConferenciaProduto,
  5: EtapaAgendamento,
  6: EtapaSeparacao,
  7: EtapaEntrega,
  8: EtapaPosvenda,
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): PedidoFluxo mapeia as 8 etapas para seus componentes"
```

---

### Task 16: Full backend test run + manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx jest`
Expected: PASS (no regressions)

- [ ] **Step 2: Start backend and frontend dev servers**

Run (in `backend/`): `npm run dev` (or the project's usual dev script)
Run (in `frontend-web/`): `npm run dev`

- [ ] **Step 3: Manual walkthrough in the browser**

Open a pedido's fluxo page (`/pedidos/:id/fluxo`) and verify:
- The canvas shows 8 cards in order: Pedidos, Conferência de Medidas, Produção/Compras, Conferência do Produto, Agendamento (Instalação), Separação, Entrega, Pós-venda.
- Etapa 1 ("Pedidos") opens with the renamed title and existing behavior intact.
- Etapa 3 ("Produção/Compras") opens with the renamed title and existing behavior intact.
- Etapa 4 ("Conferência do Produto") lists all pedido items with a "Conferido" checkbox; toggling it persists after reload (calls `PATCH /pedidos/:id/conferencia-produto-itens`).
- Etapa 5 ("Agendamento (Instalação)") shows "ETAPA 5" and the existing confirm-cliente/atribuir-equipe flow.
- For a pedido with no "Instalação" agendamento: etapa 6 and 7 show "Nenhuma instalação agendada..." messages and remain pending.
- For a pedido with an "Instalação" herdeiro agendamento containing items: etapa 6 lists those items with "Separado" checkboxes; toggling persists (calls `PATCH /agendamentos/:id/itens/:itemId/separado`).
- Etapa 7 shows the Instalação agendamento(s) with a "Marcar como concluída" button when not yet `concluido`; clicking it calls `PUT /agendamentos/:id/status` and updates the badge to "Concluída".
- Etapa 8 ("Pós-venda") shows "ETAPA 8" and the existing encerrar-pedido flow.
- On the `/pedidos` listing page, the etapa filter chips show all 8 etapas with the new labels ("Conf. Produto", "Separação", "Entrega") and filtering by each chip works.

- [ ] **Step 4: Fix any issues found, then final commit if needed**

If manual testing reveals bugs, fix them with small targeted edits and commit:

```bash
git add -A
git commit -m "fix(pedidos): ajustes encontrados na verificacao manual do fluxo de 8 etapas"
```

---

## Self-Review Notes

- **Spec coverage:** All sections of `2026-06-11-fluxo-pedido-8-etapas-design.md` are covered — DB migrations (Tasks 1-3), `calcularEtapaAtual`/`buscarFluxoPedido`/`listarPedidosDashboard` (Tasks 4-6), new endpoints (Tasks 7-8), `EtapaCard`/`Pedidos.jsx` config (Tasks 9-10), renamed headers (Task 11), new components `EtapaConferenciaProduto`/`EtapaSeparacao`/`EtapaEntrega` (Tasks 12-14), `PedidoFluxo.jsx` map (Task 15), edge cases (no-itens, no-instalação, multiple instalações — all handled by the `calcularEtapaAtual` formulas and the "Nenhuma instalação agendada" UI branches), and testing (Task 4/5 TDD + Task 16 manual pass).
- **Placeholder scan:** No TBD/TODO/"add appropriate X" remain — every step has complete code, exact file paths, and exact commands.
- **Type consistency:** `calcularEtapaAtual`'s new param names (`itensComProdutoOk`, `instalacoesTotal`, `instalacoesConcluidas`, `totalItensInstalacao`, `itensSeparados`) are used identically across Task 4 (function + tests), Task 5 (`listarPedidosDashboard`), and Task 6 (`buscarFluxoPedido`). The `progresso` object shapes for etapas 4/6/7 (`total_itens`/`itens_produto_ok`, `total_itens_instalacao`/`itens_separados`, `instalacoes_total`/`instalacoes_concluidas`) match between Task 6 (backend) and Tasks 9/12/13/14 (frontend consumers).
