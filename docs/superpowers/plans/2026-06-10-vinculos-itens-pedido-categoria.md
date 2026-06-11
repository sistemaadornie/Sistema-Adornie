# Vínculos entre Itens de Pedido via Classificação por Categoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let categories be flagged "vinculável" / "recebe vínculos", give pedidos a dedicated "Vincular Itens" modal to link accessory items to principal items, narrow Etapa 1's "todos os itens com vínculo" criterion to only vinculável categories, and stop `_salvarItens` from silently wiping `pedido_item_vinculos` on every pedido edit.

**Architecture:** Two new boolean columns on `categorias` drive client-side classification of pedido items into "principais" and "vinculáveis". Three new REST endpoints (mirroring the existing `PATCH /:id/producao-itens` ownership-check pattern) manage rows in `pedido_item_vinculos` and the `pedido_itens.sem_vinculo` flag directly — `_salvarItens` no longer touches `pedido_item_vinculos` at all. `_verificarEtapa1` and the two `itens_sem_vinculo` dashboard queries are updated to only consider items whose category has `vinculavel = true`.

**Tech Stack:** Express + `pg` (raw SQL, no ORM), Jest + Supertest for backend tests, React (function components, hooks) for frontend, no frontend test runner configured.

---

## Spec Reference

Full design: `docs/superpowers/specs/2026-06-10-vinculos-itens-pedido-categoria-design.md` (approved).

---

## Task 1: Migration — `categorias` vínculo flags

**Files:**
- Create: `backend/src/database/migrations/categorias_vinculo_flags.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- categorias_vinculo_flags.sql
-- Adiciona flags de classificação para vínculo de itens (acessório/principal)

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS vinculavel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculos BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Run the migration against the configured database**

Run: `node backend/src/database/run-migration.js categorias_vinculo_flags.sql`
Expected: `Executando categorias_vinculo_flags.sql...` then `Migration executada com sucesso.`

(If no database is reachable in this environment, leave this step for the user to run manually before deploying — the rest of the plan does not require the columns to exist for the mocked unit tests to pass, but it IS required for the feature to work end-to-end.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/categorias_vinculo_flags.sql
git commit -m "feat(db): adiciona flags vinculavel/recebe_vinculos em categorias"
```

---

## Task 2: `categoriaService.js` — CRUD inclui `vinculavel`/`recebe_vinculos`

**Files:**
- Modify: `backend/src/services/categoriaService.js`
- Test: `backend/src/__tests__/categoriaService.test.js` (new)

`buscar()` uses `SELECT *` already, so once the migration runs it automatically returns the new columns — no code change needed there.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/__tests__/categoriaService.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/categoriaService');

afterEach(() => jest.clearAllMocks());

describe('listar', () => {
  test('inclui vinculavel e recebe_vinculos na query e no retorno', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Trilhos', cor: '#000', ordem: 0, vinculavel: true, recebe_vinculos: false }],
    });
    const result = await svc.listar(10);
    expect(db.query.mock.calls[0][0]).toContain('vinculavel');
    expect(db.query.mock.calls[0][0]).toContain('recebe_vinculos');
    expect(result[0].vinculavel).toBe(true);
    expect(result[0].recebe_vinculos).toBe(false);
  });
});

describe('criar', () => {
  test('insere vinculavel e recebe_vinculos com default false quando nao informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: false }],
    });
    await svc.criar(10, { nome: 'Cortinas' });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Cortinas', '#C9A96E', 0, false, false]);
  });

  test('insere vinculavel e recebe_vinculos quando informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 2, nome: 'Trilhos', cor: '#C9A96E', ordem: 0, vinculavel: true, recebe_vinculos: false }],
    });
    await svc.criar(10, { nome: 'Trilhos', vinculavel: true, recebe_vinculos: false });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Trilhos', '#C9A96E', 0, true, false]);
  });
});

describe('atualizar', () => {
  test('atualiza vinculavel e recebe_vinculos', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: true }],
    });
    await svc.atualizar(1, 10, { nome: 'Cortinas', vinculavel: false, recebe_vinculos: true });
    expect(db.query.mock.calls[0][1]).toEqual(['Cortinas', '#C9A96E', 0, false, true, 1, 10]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest categoriaService.test.js`
Expected: FAIL — `db.query.mock.calls[0][0]` does not contain `'vinculavel'`, and the params arrays don't match (current `criar`/`atualizar` only push 4 params).

- [ ] **Step 3: Implement — update `listar`, `criar`, `atualizar`**

In `backend/src/services/categoriaService.js`, replace `listar`:

```js
async function listar(empresaId) {
  const res = await db.query(
    `SELECT id, nome, cor, ordem, vinculavel, recebe_vinculos FROM categorias
     WHERE empresa_id = $1
     ORDER BY ordem ASC, nome ASC`,
    [empresaId]
  );
  return res.rows;
}
```

Replace `criar`:

```js
async function criar(empresaId, dados) {
  const { nome, cor, ordem, vinculavel, recebe_vinculos } = dados;
  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  try {
    const res = await db.query(
      `INSERT INTO categorias (empresa_id, nome, cor, ordem, vinculavel, recebe_vinculos)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [empresaId, nome.trim(), cor || "#C9A96E", ordem ?? 0, !!vinculavel, !!recebe_vinculos]
    );
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw Object.assign(new Error("Já existe uma categoria com esse nome."), { status: 409 });
    throw e;
  }
}
```

Replace `atualizar`:

```js
async function atualizar(id, empresaId, dados) {
  const { nome, cor, ordem, vinculavel, recebe_vinculos } = dados;
  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  try {
    const res = await db.query(
      `UPDATE categorias
       SET nome=$1, cor=$2, ordem=$3, vinculavel=$4, recebe_vinculos=$5, updated_at=NOW()
       WHERE id=$6 AND empresa_id=$7 RETURNING *`,
      [nome.trim(), cor || "#C9A96E", ordem ?? 0, !!vinculavel, !!recebe_vinculos, id, empresaId]
    );
    if (!res.rows.length) throw Object.assign(new Error("Categoria não encontrada."), { status: 404 });
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw Object.assign(new Error("Já existe uma categoria com esse nome."), { status: 409 });
    throw e;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest categoriaService.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/categoriaService.js backend/src/__tests__/categoriaService.test.js
git commit -m "feat(categorias): listar/criar/atualizar incluem vinculavel e recebe_vinculos"
```

---

## Task 3: `pedidoService.js` — `_verificarEtapa1` considera só categorias vinculáveis

**Files:**
- Modify: `backend/src/services/pedidoService.js:29-50` (`_verificarEtapa1`), `backend/src/services/pedidoService.js:666` (exports)
- Test: `backend/src/__tests__/pedidoService.test.js`

`_verificarEtapa1` is currently private (not exported). To unit-test it directly with a mocked `client`, add it to `module.exports` (still prefixed `_` to signal it's an internal helper, same as its usage inside the file).

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/pedidoService.test.js`, add a new `describe` block (after the `describe('buscar (montarPedido)', ...)` block, before the `makeClient` helper):

```js
describe('_verificarEtapa1', () => {
  function makeFakeClient(respostas = []) {
    const client = { query: jest.fn() };
    respostas.forEach(r => client.query.mockResolvedValueOnce(r));
    return client;
  }

  test('retorna false quando nao ha anexo PDF', async () => {
    const client = makeFakeClient([
      { rows: [] }, // pedido_anexos
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: false }] }, // pedido_itens
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna false quando pedido nao tem itens', async () => {
    const client = makeFakeClient([
      { rows: [{}] }, // pedido_anexos
      { rows: [] },   // pedido_itens
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna false quando algum item nao tem categoria', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: null, sem_vinculo: false, vinculavel: false }] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna true quando nenhum item e de categoria vinculavel', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: false }] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(true);
  });

  test('retorna false quando item vinculavel nao tem vinculo nem sem_vinculo', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: true }] },
      { rows: [] }, // pedido_item_vinculos
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(false);
  });

  test('retorna true quando item vinculavel tem vinculo', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: false, vinculavel: true }] },
      { rows: [{ item_id: 1 }] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(true);
  });

  test('retorna true quando item vinculavel esta marcado sem_vinculo', async () => {
    const client = makeFakeClient([
      { rows: [{}] },
      { rows: [{ id: 1, categoria_id: 5, sem_vinculo: true, vinculavel: true }] },
      { rows: [] },
    ]);
    const result = await svc._verificarEtapa1(client, 1);
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest pedidoService.test.js -t "_verificarEtapa1"`
Expected: FAIL — `svc._verificarEtapa1 is not a function` (not yet exported), and once exported, the "nenhum item de categoria vinculavel" / "vinculavel" cases would fail because the current implementation reads `it.vinculavel` from a query that doesn't select it and treats every item as needing a vínculo.

- [ ] **Step 3: Implement — rewrite `_verificarEtapa1` and export it**

Replace `backend/src/services/pedidoService.js:29-50`:

```js
async function _verificarEtapa1(client, pedidoId) {
  const [pdfRes, itensRes] = await Promise.all([
    client.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id=$1 LIMIT 1`, [pedidoId]),
    client.query(
      `SELECT pi.id, pi.categoria_id, pi.sem_vinculo, COALESCE(cat.vinculavel, false) AS vinculavel
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id=$1`,
      [pedidoId]
    ),
  ]);

  if (!pdfRes.rows.length) return false;

  const itens = itensRes.rows;
  if (!itens.length) return false;

  if (!itens.every(it => it.categoria_id != null)) return false;

  const itensVinculaveis = itens.filter(it => it.vinculavel);
  if (itensVinculaveis.length === 0) return true;

  const itemIds = itensVinculaveis.map(it => it.id);
  const { rows: vinculosRows } = await client.query(
    `SELECT DISTINCT item_id FROM pedido_item_vinculos WHERE item_id = ANY($1)`,
    [itemIds]
  );
  const comVinculo = new Set(vinculosRows.map(r => r.item_id));

  return itensVinculaveis.every(it => it.sem_vinculo || comVinculo.has(it.id));
}
```

Update `backend/src/services/pedidoService.js:666` exports to include `_verificarEtapa1`:

```js
module.exports = { listar, buscar, criar, atualizar, excluir, importar, atualizarEtapa, fmtNumeroOrigem, _verificarEtapa1 };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest pedidoService.test.js -t "_verificarEtapa1"`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "feat(pedidos): etapa 1 considera vinculo apenas para categorias vinculaveis"
```

---

## Task 4: `pedidoService.js` — `_salvarItens` para de apagar `pedido_item_vinculos`

**Files:**
- Modify: `backend/src/services/pedidoService.js:251-268` (end of `_salvarItens`)
- Test: `backend/src/__tests__/pedidoService.test.js:72-113` (replace existing test)

The existing test `'criar (salva vinculos)' > 'insere em pedido_item_vinculos quando item_vinculado_idx esta definido'` validates the behavior being removed. Replace it with a test asserting `pedido_item_vinculos` is never touched by `_salvarItens`.

- [ ] **Step 1: Replace the existing test (red)**

In `backend/src/__tests__/pedidoService.test.js`, replace the entire `describe('criar (salva vinculos)', ...)` block (lines 72-114) with:

```js
describe('criar (nao mexe em pedido_item_vinculos)', () => {
  test('item_vinculado_idx legado nao gera DELETE/INSERT em pedido_item_vinculos', async () => {
    const fakeId = 99;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })   // SELECT pedido_itens (vazio)
      .mockResolvedValueOnce({ rows: [] });  // SELECT pedido_pagamentos

    const client = makeClient([
      { rows: [] },              // BEGIN
      { rows: [{ seq: 1 }] },    // nextval
      { rows: [{ id: fakeId }] }, // INSERT pedidos
      { rows: [] },              // SELECT existing ids
      { rows: [{ id: 10 }] },    // INSERT item 0 (cortina)
      { rows: [{ id: 11 }] },    // INSERT item 1 (trilho)
      { rows: [] },              // DELETE pagamentos
      { rows: [] },              // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = {
      status: 'pendente',
      itens: [
        { descricao: 'Cortina Wave', quantidade: 1, item_vinculado_idx: null },
        { descricao: 'Trilho Wave',  quantidade: 1, item_vinculado_idx: 0 },
      ],
      pagamentos: [],
    };

    await svc.criar(10, 99, dados);

    const vinculoCall = client.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('pedido_item_vinculos')
    );
    expect(vinculoCall).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest pedidoService.test.js -t "nao mexe em pedido_item_vinculos"`
Expected: FAIL — `vinculoCall` is defined (current `_salvarItens` still issues `DELETE FROM pedido_item_vinculos ...`).

- [ ] **Step 3: Implement — remove the wipe/recreate block**

In `backend/src/services/pedidoService.js`, delete lines 251-268 (the block starting with the comment `// Salva vínculos na tabela pedido_item_vinculos` through the closing `}` of the `for` loop), so `_salvarItens` ends right after the items loop closes (currently line 249's `}`) and the function's closing brace follows immediately:

```js
    } else {
      // INSERT novo item (sem item_vinculado_id ainda — resolvido depois)
      const ins = await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, ambiente, referencia, cor, descricao, medidas,
            quantidade, unidade, preco_unitario, valor, ordem,
            modelo, especificacoes, largura, altura, categoria_id, sem_vinculo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          pedidoId,
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
          toDecimal(it.largura),
          toDecimal(it.altura),
          it.categoria_id        ?? null,
          it.sem_vinculo         ?? false,
        ]
      );
      insertedIds.push(ins.rows[0].id);
    }
  }
}
```

(i.e. the function now ends with the items `for` loop's closing `}` followed directly by the function's closing `}` — `insertedIds` is computed but no longer used after the loop; that's fine, it remains as a record of inserted IDs in case future code needs it, but currently unused is acceptable here since removing it would require restructuring the loop's push calls. Actually — to avoid an unused-variable lint warning, remove the `insertedIds` array entirely along with its two `.push(...)` calls, since nothing reads it anymore.)

Concretely: also remove `const insertedIds = []; // IDs na mesma ordem do array itens` (the line before the `for` loop) and both `insertedIds.push(...)` calls inside the loop (one in the `if` branch, one in the `else` branch).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest pedidoService.test.js`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "fix(pedidos): _salvarItens nao apaga mais pedido_item_vinculos"
```

---

## Task 5: `dashboardService.js` — `itens_sem_vinculo` filtra por `vinculavel` (lista)

**Files:**
- Modify: `backend/src/services/dashboardService.js:162-173`
- Test: `backend/src/__tests__/dashboardService.test.js:91-138`

- [ ] **Step 1: Add a failing assertion to the existing test**

In `backend/src/__tests__/dashboardService.test.js`, in the test `'calcula estagio.etapa_atual em lote a partir das queries agregadas'` (the first test inside `describe("listarPedidosDashboard", ...)`), add this assertion right after the `const resultado = await listarPedidosDashboard(...)` line and before the existing `expect` calls:

```js
    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    // Etapa 1: itens sem vinculo (6ª query) deve filtrar por categoria vinculavel
    const querySemVinculo = db.query.mock.calls[5][0];
    expect(querySemVinculo).toContain("cat.vinculavel");

    expect(resultado).toHaveLength(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest dashboardService.test.js -t "calcula estagio.etapa_atual"`
Expected: FAIL — current "itens sem vinculo" query string does not contain `"cat.vinculavel"`.

- [ ] **Step 3: Implement — add `LEFT JOIN categorias` + `vinculavel` filter**

Replace `backend/src/services/dashboardService.js:162-173`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest dashboardService.test.js`
Expected: PASS (all tests, including both `listarPedidosDashboard` tests — the second test's mock for call index 5 is still `{ rows: [] }`, which is unaffected by the SQL text change)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "fix(dashboard): itens_sem_vinculo considera apenas categorias vinculaveis"
```

---

## Task 6: `dashboardService.js` — mesmo ajuste em `buscarFluxoPedido`

**Files:**
- Modify: `backend/src/services/dashboardService.js:402-411`

`buscarFluxoPedido` has no existing unit test in `dashboardService.test.js` (only `calcularEtapaAtual` and `listarPedidosDashboard` are tested). This step mirrors Task 5's fix for the single-pedido query with no new test, consistent with current coverage.

- [ ] **Step 1: Implement — apply the same `LEFT JOIN categorias` + `vinculavel` filter**

Replace `backend/src/services/dashboardService.js:402-411`:

```js
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
```

- [ ] **Step 2: Run the full backend suite as a regression check**

Run: `cd backend && npx jest`
Expected: PASS (no test exercises `buscarFluxoPedido`'s SQL text directly, so this is a no-op for the suite; confirms nothing else broke)

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "fix(dashboard): buscarFluxoPedido tambem filtra itens_sem_vinculo por vinculavel"
```

---

## Task 7: `pedidosRoutes.js` — `POST /:id/vinculos`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js` (insert after line 561, the end of `PATCH /:id/producao-itens`)
- Test: `backend/src/__tests__/pedidosRoutes.vinculos.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/src/__tests__/pedidosRoutes.vinculos.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/pedidosRoutes');
const db      = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/pedidos', router);

afterEach(() => jest.clearAllMocks());

describe('POST /api/pedidos/:id/vinculos', () => {
  test('400 quando item_id ou item_vinculado_id ausentes', async () => {
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11 });
    expect(res.status).toBe(400);
  });

  test('400 quando item_id === item_vinculado_id', async () => {
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 11 });
    expect(res.status).toBe(400);
  });

  test('404 quando os itens nao pertencem ao pedido/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });
    expect(res.status).toBe(404);
  });

  test('400 quando categoria do item filho nao e vinculavel', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 11, vinculavel: false, recebe_vinculos: false },
        { id: 10, vinculavel: false, recebe_vinculos: true },
      ],
    });
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vinculável/);
  });

  test('400 quando categoria do item principal nao recebe vinculos', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 11, vinculavel: true, recebe_vinculos: false },
        { id: 10, vinculavel: false, recebe_vinculos: false },
      ],
    });
    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/recebe vínculos/);
  });

  test('200 cria vinculo, remove vinculo anterior e limpa sem_vinculo', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 11, vinculavel: true, recebe_vinculos: false },
          { id: 10, vinculavel: false, recebe_vinculos: true },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // DELETE pedido_item_vinculos
      .mockResolvedValueOnce({ rows: [] }) // INSERT pedido_item_vinculos
      .mockResolvedValueOnce({ rows: [] }); // UPDATE sem_vinculo

    const res = await request(app).post('/api/pedidos/1/vinculos').send({ item_id: 11, item_vinculado_id: 10 });

    expect(res.status).toBe(200);
    expect(res.body.vinculo).toEqual({ item_id: 11, item_vinculado_id: 10, tipo_vinculo: 'acessorio' });
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM pedido_item_vinculos');
    expect(db.query.mock.calls[2][0]).toContain('INSERT INTO pedido_item_vinculos');
    expect(db.query.mock.calls[3][0]).toContain('UPDATE pedido_itens');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest pedidosRoutes.vinculos.test.js`
Expected: FAIL — route `POST /:id/vinculos` does not exist yet, so all requests return 404 from Express's default handler.

- [ ] **Step 3: Implement the endpoint**

In `backend/src/routes/pedidosRoutes.js`, insert after line 561 (the closing `});` of `PATCH /:id/producao-itens`), before the `// POST /pedidos/:id/pesquisa-satisfacao` comment:

```js

// POST /pedidos/:id/vinculos
router.post("/:id/vinculos", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { item_id, item_vinculado_id } = req.body;

    if (!item_id || !item_vinculado_id) {
      return res.status(400).json({ message: "item_id e item_vinculado_id são obrigatórios." });
    }
    if (Number(item_id) === Number(item_vinculado_id)) {
      return res.status(400).json({ message: "Um item não pode ser vinculado a si mesmo." });
    }

    const { rows } = await db.query(
      `SELECT pi.id, COALESCE(cat.vinculavel, false) AS vinculavel, COALESCE(cat.recebe_vinculos, false) AS recebe_vinculos
       FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.id = ANY($1) AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [[item_id, item_vinculado_id], pedidoId, empresaId]
    );
    if (rows.length !== 2) return res.status(404).json({ message: "Item não encontrado." });

    const item = rows.find((r) => Number(r.id) === Number(item_id));
    const itemVinculado = rows.find((r) => Number(r.id) === Number(item_vinculado_id));

    if (!item.vinculavel) return res.status(400).json({ message: "A categoria deste item não é vinculável." });
    if (!itemVinculado.recebe_vinculos) return res.status(400).json({ message: "A categoria do item principal não recebe vínculos." });

    await db.query(`DELETE FROM pedido_item_vinculos WHERE item_id = $1`, [item_id]);
    await db.query(
      `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
       VALUES ($1, $2, 'acessorio') ON CONFLICT DO NOTHING`,
      [item_id, item_vinculado_id]
    );
    await db.query(`UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1`, [item_id]);

    return res.json({
      vinculo: { item_id: Number(item_id), item_vinculado_id: Number(item_vinculado_id), tipo_vinculo: "acessorio" },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar vínculo." });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest pedidosRoutes.vinculos.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.vinculos.test.js
git commit -m "feat(pedidos): endpoint POST /:id/vinculos para criar vinculo entre itens"
```

---

## Task 8: `pedidosRoutes.js` — `DELETE /:id/vinculos/:itemId`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js` (insert after the `POST /:id/vinculos` block from Task 7)
- Test: `backend/src/__tests__/pedidosRoutes.vinculos.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/__tests__/pedidosRoutes.vinculos.test.js`:

```js

describe('DELETE /api/pedidos/:id/vinculos/:itemId', () => {
  test('404 quando item nao pertence ao pedido/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/pedidos/1/vinculos/11');
    expect(res.status).toBe(404);
  });

  test('200 remove o vinculo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 11 }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] });          // DELETE pedido_item_vinculos

    const res = await request(app).delete('/api/pedidos/1/vinculos/11');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Vínculo removido.');
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM pedido_item_vinculos');
    expect(db.query.mock.calls[1][1]).toEqual([11]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest pedidosRoutes.vinculos.test.js -t "DELETE"`
Expected: FAIL — route `DELETE /:id/vinculos/:itemId` does not exist yet (404 from Express default handler, but the test still fails because `res.body.message` is undefined for the 200 case and the first test gets 404 only by coincidence — to be safe, both subtests must be checked after implementation).

- [ ] **Step 3: Implement the endpoint**

In `backend/src/routes/pedidosRoutes.js`, insert immediately after the `POST /:id/vinculos` block added in Task 7:

```js

// DELETE /pedidos/:id/vinculos/:itemId
router.delete("/:id/vinculos/:itemId", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const empresaId = req.user.empresa_id;

    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [itemId, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    await db.query(`DELETE FROM pedido_item_vinculos WHERE item_id = $1`, [itemId]);
    return res.json({ message: "Vínculo removido." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao remover vínculo." });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest pedidosRoutes.vinculos.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.vinculos.test.js
git commit -m "feat(pedidos): endpoint DELETE /:id/vinculos/:itemId para remover vinculo"
```

---

## Task 9: `pedidosRoutes.js` — `PATCH /:id/itens/:itemId/sem-vinculo`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js` (insert after the `DELETE /:id/vinculos/:itemId` block from Task 8)
- Test: `backend/src/__tests__/pedidosRoutes.vinculos.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/__tests__/pedidosRoutes.vinculos.test.js`:

```js

describe('PATCH /api/pedidos/:id/itens/:itemId/sem-vinculo', () => {
  test('400 quando sem_vinculo nao e booleano', async () => {
    const res = await request(app).patch('/api/pedidos/1/itens/11/sem-vinculo').send({ sem_vinculo: 'sim' });
    expect(res.status).toBe(400);
  });

  test('404 quando item nao pertence ao pedido/empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch('/api/pedidos/1/itens/11/sem-vinculo').send({ sem_vinculo: true });
    expect(res.status).toBe(404);
  });

  test('200 atualiza sem_vinculo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })               // ownership check
      .mockResolvedValueOnce({ rows: [{ id: 11, sem_vinculo: true }] }); // UPDATE

    const res = await request(app).patch('/api/pedidos/1/itens/11/sem-vinculo').send({ sem_vinculo: true });

    expect(res.status).toBe(200);
    expect(res.body.item).toEqual({ id: 11, sem_vinculo: true });
    expect(db.query.mock.calls[1][0]).toContain('UPDATE pedido_itens');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest pedidosRoutes.vinculos.test.js -t "sem-vinculo"`
Expected: FAIL — route `PATCH /:id/itens/:itemId/sem-vinculo` does not exist yet.

- [ ] **Step 3: Implement the endpoint**

In `backend/src/routes/pedidosRoutes.js`, insert immediately after the `DELETE /:id/vinculos/:itemId` block added in Task 8:

```js

// PATCH /pedidos/:id/itens/:itemId/sem-vinculo
router.patch("/:id/itens/:itemId/sem-vinculo", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const empresaId = req.user.empresa_id;
    const { sem_vinculo } = req.body;

    if (typeof sem_vinculo !== "boolean") {
      return res.status(400).json({ message: "sem_vinculo deve ser booleano." });
    }

    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [itemId, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    const { rows } = await db.query(
      `UPDATE pedido_itens SET sem_vinculo = $1 WHERE id = $2 RETURNING id, sem_vinculo`,
      [sem_vinculo, itemId]
    );
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar item." });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest pedidosRoutes.vinculos.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.vinculos.test.js
git commit -m "feat(pedidos): endpoint PATCH /:id/itens/:itemId/sem-vinculo"
```

---

## Task 10: `Categorias.jsx` — checkboxes "Item vinculável?" / "Deve receber itens vinculados?"

**Files:**
- Modify: `frontend-web/src/pages/catalogo/Categorias.jsx`

No frontend test runner is configured for this project (no `*.test.jsx` files, no test script in `frontend-web/package.json`), so this task is verified manually (Step 4).

- [ ] **Step 1: Add state and checkboxes to `CategoriaModal`**

In `frontend-web/src/pages/catalogo/Categorias.jsx`, update the `CategoriaModal` function signature area (lines 30-37) — add two new `useState` calls after `cor`:

```jsx
function CategoriaModal({ categoria, prazos, onClose, onSalvar, salvando }) {
  const [nome, setNome] = useState(categoria?.nome || "");
  const [cor, setCor]   = useState(categoria?.cor  || "#C9A96E");
  const [vinculavel, setVinculavel] = useState(categoria?.vinculavel ?? false);
  const [recebeVinculos, setRecebeVinculos] = useState(categoria?.recebe_vinculos ?? false);
  const [erro, setErro] = useState(null);
```

Update `handleSubmit` (lines 39-49) to include the new fields:

```jsx
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome.trim()) { setErro("Nome é obrigatório."); return; }
    setErro(null);
    onSalvar({ nome, cor, vinculavel, recebe_vinculos: recebeVinculos, prazos: {
      logistica_interna_dias: Number(logistica) || 0,
      confeccao_dias: Number(confeccao) || 0,
      expedicao_dias: Number(expedicao) || 0,
      outros_dias: Number(outros) || 0,
    }});
  };
```

Insert the checkboxes block right after the color picker `<div className="ag-form-field" ...>` block, i.e. after line 80 (`</div>` that closes the color picker field) and before the `{categoria?.id && (...)}` prazos block:

```jsx
          <div className="ag-form-field" style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={vinculavel} onChange={(e) => setVinculavel(e.target.checked)} />
              Item vinculável?
            </label>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0 24px" }}>
              Itens desta categoria podem ser vinculados a um item principal (ex: Trilho → Cortina).
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 8 }}>
              <input type="checkbox" checked={recebeVinculos} onChange={(e) => setRecebeVinculos(e.target.checked)} />
              Deve receber itens vinculados?
            </label>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0 24px" }}>
              Itens desta categoria podem ser "principais" e receber outros itens vinculados a eles.
            </p>
          </div>
```

- [ ] **Step 2: Pass the new fields through `handleSalvar`**

In `frontend-web/src/pages/catalogo/Categorias.jsx`, update `handleSalvar` (lines 143-166):

```jsx
  const handleSalvar = async (dados) => {
    setSalvando(true);
    try {
      if (modal === "novo") {
        const res = await api.post("/categorias", { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos });
        setCategorias((prev) => [...prev, res.categoria]);
        onCategoriasChange?.([...categorias, res.categoria]);
      } else {
        const res = await api.put(`/categorias/${modal.id}`, { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos });
        const atualizada = categorias.map((c) => c.id === res.categoria.id ? res.categoria : c);
        setCategorias(atualizada);
        onCategoriasChange?.(atualizada);
        if (dados.prazos) {
          await api.put("/pedidos/config/prazos", { prazos: [{ categoria_id: modal.id, ...dados.prazos }] });
          await carregarPrazos();
        }
      }
      setModal(null);
    } catch (err) {
      alert(err.message || "Erro ao salvar categoria.");
    } finally {
      setSalvando(false);
    }
  };
```

- [ ] **Step 3: Run lint**

Run: `cd frontend-web && npx eslint src/pages/catalogo/Categorias.jsx`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `cd frontend-web && npm run dev`

In the browser, open Catálogo → Categorias → edit a category. Verify:
- Two new checkboxes appear below the color picker, both unchecked by default (or reflecting saved state for an existing category).
- Checking "Item vinculável?" and saving, then reopening the same category, shows it still checked (confirms the value round-trips through `PUT /categorias/:id`).
- Creating a new category with both checkboxes checked succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/catalogo/Categorias.jsx
git commit -m "feat(categorias): checkboxes item vinculavel / recebe vinculos no modal"
```

---

## Task 11: `EtapaDadosPedido.jsx` — botão "🔗 Vincular Itens"

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

This task only wires up the button and modal open/close state; `VincularItensModal` itself is built in Task 12. Do this task together with Task 12 if you want to verify the button visually before the modal renders meaningful content — otherwise the button will fail to render until Task 12's import exists.

- [ ] **Step 1: Add state and import**

In `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`, add the import near the top (after the `HistoricoPedidoModal` import on line 5):

```jsx
import HistoricoPedidoModal from "./HistoricoPedidoModal";
import VincularItensModal from "./VincularItensModal";
```

Add new state alongside `editando`/`historico` (lines 26-27):

```jsx
  const [editando, setEditando] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [vinculando, setVinculando] = useState(false);
```

- [ ] **Step 2: Add the button**

In the header buttons row (lines 62-66), add the new button before "✏️ Editar Pedido":

```jsx
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="pf-btn-secondary" onClick={() => setVinculando(true)}>🔗 Vincular Itens</button>
            <button className="pf-btn-secondary" onClick={() => setEditando(true)}>✏️ Editar Pedido</button>
            <button className="pf-btn-secondary" onClick={() => setHistorico(true)}>🕘 Histórico</button>
            <button className="pf-modal-fechar" onClick={onClose}>×</button>
          </div>
```

- [ ] **Step 3: Render the modal**

After the `{historico && (...)}` block (lines 130-135), add:

```jsx
      {vinculando && (
        <VincularItensModal
          pedidoId={pedidoId}
          onClose={() => setVinculando(false)}
          onRecarregar={onRecarregar}
        />
      )}
```

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): botao Vincular Itens na etapa 1"
```

(This commit will not build cleanly stand-alone since `VincularItensModal` doesn't exist yet — that's expected; Task 12 adds it. If executing tasks in strict isolated commits, swap the order: do Task 12 first, then Task 11. Otherwise, treat Tasks 11-12 as one logical change and commit together after Task 12's Step 4.)

---

## Task 12: `VincularItensModal.jsx` — novo modal de vinculação

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../../../services/api";

export default function VincularItensModal({ pedidoId, onClose, onRecarregar }) {
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvandoId, setSalvandoId] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      api.get(`/pedidos/${pedidoId}`),
      api.get("/categorias"),
    ])
      .then(([pedidoRes, catRes]) => {
        if (!ativo) return;
        setItens(pedidoRes.itens || []);
        setCategorias(catRes.categorias || []);
      })
      .catch((e) => { if (ativo) setErro(e?.message || "Erro ao carregar itens."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [pedidoId]);

  const categoriaPorId = useMemo(() => {
    const map = {};
    categorias.forEach((c) => { map[c.id] = c; });
    return map;
  }, [categorias]);

  const principais = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.recebe_vinculos),
    [itens, categoriaPorId]
  );
  const vinculaveis = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.vinculavel),
    [itens, categoriaPorId]
  );
  const vinculaveisPendentes = useMemo(
    () => vinculaveis.filter((v) => !v.vinculos?.length && !v.sem_vinculo),
    [vinculaveis]
  );
  const vinculaveisSemVinculoMarcado = useMemo(
    () => vinculaveis.filter((v) => !v.vinculos?.length && v.sem_vinculo),
    [vinculaveis]
  );

  const grupos = useMemo(() => {
    const porAmbiente = {};
    principais.forEach((p) => {
      const amb = p.ambiente?.trim() || "Sem ambiente";
      if (!porAmbiente[amb]) porAmbiente[amb] = [];
      porAmbiente[amb].push(p);
    });
    return porAmbiente;
  }, [principais]);

  function filhosDe(principal) {
    return vinculaveis.filter((v) => v.vinculos?.[0]?.item_vinculado_id === principal.id);
  }

  function pendentesPara(principal) {
    return [...vinculaveisPendentes].sort((a, b) => {
      const aMesmo = a.ambiente === principal.ambiente ? 0 : 1;
      const bMesmo = b.ambiente === principal.ambiente ? 0 : 1;
      return aMesmo - bMesmo;
    });
  }

  async function vincular(itemId, principalId) {
    setSalvandoId(Number(itemId));
    try {
      await api.post(`/pedidos/${pedidoId}/vinculos`, {
        item_id: Number(itemId),
        item_vinculado_id: Number(principalId),
      });
      setItens((prev) => prev.map((it) =>
        it.id === Number(itemId)
          ? { ...it, vinculos: [{ item_vinculado_id: Number(principalId), tipo_vinculo: "acessorio" }], sem_vinculo: false }
          : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao vincular item.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function remover(itemId) {
    setSalvandoId(itemId);
    try {
      await api.delete(`/pedidos/${pedidoId}/vinculos/${itemId}`);
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, vinculos: [] } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao remover vínculo.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function marcarSemVinculo(itemId, valor) {
    setSalvandoId(itemId);
    try {
      await api.patch(`/pedidos/${pedidoId}/itens/${itemId}/sem-vinculo`, { sem_vinculo: valor });
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, sem_vinculo: valor } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao atualizar item.");
    } finally {
      setSalvandoId(null);
    }
  }

  function handleFechar() {
    onRecarregar?.();
    onClose();
  }

  const totalVinculaveis = vinculaveis.length;
  const resolvidos = vinculaveis.filter((v) => v.vinculos?.length || v.sem_vinculo).length;

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">🔗 Vincular Itens</div>
          <button className="pf-modal-fechar" onClick={handleFechar}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && principais.length === 0 && vinculaveis.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum item deste pedido pertence a categorias vinculáveis.
            </div>
          )}

          {!carregando && Object.entries(grupos).map(([ambiente, lista]) => (
            <div key={ambiente} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>📦 {ambiente}</div>
              {lista.map((principal) => {
                const filhos = filhosDe(principal);
                const opcoes = pendentesPara(principal);
                return (
                  <div key={principal.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--pf-separador)", borderRadius: 6 }}>
                      <span>{principal.id}. {principal.descricao}</span>
                      <span className="pf-badge pf-badge-ok" style={{ fontSize: 10 }}>Item principal</span>
                    </div>
                    {filhos.map((filho) => (
                      <div key={filho.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 0 18px", padding: "6px 10px", border: "1px dashed #22c55e", borderRadius: 6 }}>
                        <span>↳ {filho.id}. {filho.descricao}</span>
                        <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === filho.id} onClick={() => remover(filho.id)}>
                          remover
                        </button>
                      </div>
                    ))}
                    {opcoes.length > 0 && (
                      <div style={{ margin: "6px 0 0 18px" }}>
                        <select
                          value=""
                          disabled={salvandoId != null}
                          style={{ background: "var(--pf-input-bg)", border: "1px solid var(--pf-input-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--pf-modal-text)" }}
                          onChange={(e) => { if (e.target.value) vincular(e.target.value, principal.id); }}
                        >
                          <option value="">+ Vincular item a "{principal.descricao}"</option>
                          {opcoes.map((op) => (
                            <option key={op.id} value={op.id}>{op.id}. {op.descricao}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {!carregando && vinculaveisPendentes.length > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Itens vinculáveis sem vínculo</div>
              {vinculaveisPendentes.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--pf-separador)", borderRadius: 6, marginBottom: 6 }}>
                  <span>
                    {item.id}. {item.descricao}{" "}
                    <small style={{ opacity: .6 }}>
                      ({categoriaPorId[item.categoria_id]?.nome}{item.ambiente ? ` — ${item.ambiente}` : ""})
                    </small>
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value=""
                      disabled={salvandoId != null}
                      style={{ background: "var(--pf-input-bg)", border: "1px solid var(--pf-input-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--pf-modal-text)" }}
                      onChange={(e) => { if (e.target.value) vincular(item.id, e.target.value); }}
                    >
                      <option value="">Vincular a...</option>
                      {principais.filter((p) => p.id !== item.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.id}. {p.descricao}</option>
                      ))}
                    </select>
                    <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === item.id} onClick={() => marcarSemVinculo(item.id, true)}>
                      Marcar sem vínculo
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {!carregando && vinculaveisSemVinculoMarcado.length > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Itens marcados como "sem vínculo"</div>
              {vinculaveisSemVinculoMarcado.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--pf-separador)", borderRadius: 6, marginBottom: 6, opacity: .6 }}>
                  <span>
                    {item.id}. {item.descricao}{" "}
                    <small>({categoriaPorId[item.categoria_id]?.nome}{item.ambiente ? ` — ${item.ambiente}` : ""})</small>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="pf-badge pf-badge-pend" style={{ fontSize: 10 }}>Sem vínculo</span>
                    <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === item.id} onClick={() => marcarSemVinculo(item.id, false)}>
                      desfazer
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          <span style={{ fontSize: 13, color: "var(--pf-card-sub)" }}>
            {totalVinculaveis === 0 ? "Nenhum item vinculável neste pedido." : `${resolvidos} de ${totalVinculaveis} itens vinculáveis resolvidos`}
          </span>
          <button className="pf-btn-primary" onClick={handleFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `cd frontend-web && npx eslint src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
Expected: no errors

- [ ] **Step 3: Manual verification (browser)**

Run: `cd frontend-web && npm run dev` (and ensure the backend is running with the migration from Task 1 applied)

1. In Catálogo → Categorias, mark one category (e.g. "Trilhos e Varões") as "Item vinculável?" and another (e.g. "Cortinas") as "Deve receber itens vinculados?". Make sure at least one pedido has items in both categories.
2. Open that pedido's fluxo, go to Etapa 1, click "🔗 Vincular Itens".
3. Verify:
   - Items from the "recebe vínculos" category appear as group headers with "Item principal" badge, grouped by `ambiente`.
   - Items from the "vinculável" category with no link appear under "Itens vinculáveis sem vínculo" with a "Vincular a..." select and "Marcar sem vínculo" button.
   - Selecting a principal in "Vincular a..." moves the item under that principal with a "remover" button, and the footer counter increments.
   - "remover" moves the item back to "Itens vinculáveis sem vínculo".
   - "Marcar sem vínculo" moves the item to "Itens marcados como 'sem vínculo'" (dimmed); "desfazer" moves it back.
   - Clicking "Fechar" closes the modal and the Etapa 1 "Todos os itens com vínculo" criterion reflects the current state (after `onRecarregar`).
4. Edit the pedido via "✏️ Editar Pedido" and save without touching items — reopen "🔗 Vincular Itens" and confirm previously-created vínculos are still present (regression check for the Task 4 fix).

- [ ] **Step 4: Commit (together with Task 11's changes)**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): modal Vincular Itens (arvore agrupada por ambiente)"
```

---

## Self-Review Notes

- **Spec coverage:** All 8 files from the spec's "Arquivos afetados" table are covered (Tasks 1-12, with `pedidosRoutes.js` split across Tasks 7-9 and `dashboardService.js` across Tasks 5-6). The `_salvarItens` bug fix is Task 4. The `_verificarEtapa1` rewrite is Task 3. Out-of-scope items (tipo_vinculo variants, cycle validation, other screens, drag-and-drop) are correctly not addressed.
- **Existing test conflict:** `pedidoService.test.js`'s old `'criar (salva vinculos)'` test (which validated the removed wipe/recreate behavior) is replaced in Task 4 with a test asserting the opposite.
- **`vinculos_ok` metric:** `dashboardService.js` has a separate `vinculos_ok` flag (any vínculo exists at all) that the spec doesn't address — left unchanged, out of scope.
- **Type consistency:** `_verificarEtapa1(client, pedidoId)` signature unchanged; `pedido_item_vinculos` rows use `item_id`/`item_vinculado_id`/`tipo_vinculo` consistently across Tasks 3, 4, 7-9, 12. `categorias` rows use `vinculavel`/`recebe_vinculos` consistently across Tasks 2, 3, 5, 6, 7, 9, 10, 12.
- **Frontend tests:** No test runner is configured for `frontend-web`; Tasks 10-12 use manual browser verification instead, per existing project conventions.
