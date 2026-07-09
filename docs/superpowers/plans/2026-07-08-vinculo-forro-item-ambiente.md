# Vínculo Forro → Item (mesmo ambiente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When "Forro costurado" = `JUNTO` on the Forro ficha (confecção and conferência
consultoras), let the user pick which item in the same ambiente the forro is sewn onto, and
persist that link.

**Architecture:** Reuse the existing `pedido_item_vinculos` table (already used for
trilho→cortina/forro and controle→motor vínculos) with a new `tipo_vinculo = 'forro_cortina'`
value — no schema migration needed. Backend gets one new read endpoint (list sibling items in
the same ambiente) and the existing save endpoints (`PUT /os/:id/confeccao` and
`PUT /os/:id/conferencia-consultoras`) gain validation + a sync step that keeps
`pedido_item_vinculos` in step with the `JUNTO`/`SEPARADO` choice. Frontend adds one
conditionally-rendered select to `FichaConfeccaoForro.jsx`.

**Tech Stack:** Node/Express + `pg` (backend), React + Vite (frontend), Jest + Supertest
(backend tests, `db.query` mocked).

## Global Constraints

- No new database migration — `pedido_item_vinculos.tipo_vinculo` is a free `VARCHAR(40)`
  (no CHECK/enum), so `'forro_cortina'` is a valid value with zero schema changes.
- The feature must work identically in both consumers of `FichaConfeccaoForro.jsx`:
  `modo="confeccao"` and `modo="conferencia_consultoras"`.
- Select shows **all** items in the same ambiente/pedido (any category), not just Cortina items.
- Selecting an item is **mandatory** when `forroCosturado === "JUNTO"` — enforced both in the
  backend (400 on save) and in the frontend (inline error before calling the API).
- Do not touch `dashboardService.js` or any etapa/critério logic — this vínculo is purely
  informational/operational, it does not gate any pipeline stage.
- Error message strings (Portuguese) must match exactly what's specified in each task — other
  code in this repo asserts on these strings via `toThrow('substring')`.
- Frontend has no unit test runner configured (`frontend-web/package.json` has no `test`
  script and no `*.test.jsx` files exist) — frontend verification is `npx eslint` +
  `npx vite build`, not automated tests.

---

## Task 1: Backend — list items in the same ambiente

**Files:**
- Modify: `backend/src/services/ordemServicoService.js` (add `listarItensMesmoAmbiente`, update `module.exports` at the end of the file)
- Test: `backend/src/__tests__/ordemServicoService.test.js` (new `describe('listarItensMesmoAmbiente', ...)` block, add at the end of the file)

**Interfaces:**
- Produces: `listarItensMesmoAmbiente(osId: number, empresaId: number) => Promise<Array<{ id: number, descricao: string, cor: string|null, categoria_nome: string|null }>>` — exported from `ordemServicoService.js`. Task 2 (route) calls this.

- [ ] **Step 1: Write the failing tests**

Add to the end of `backend/src/__tests__/ordemServicoService.test.js`:

```js
describe('listarItensMesmoAmbiente', () => {
  test('retorna itens do mesmo pedido e ambiente, excluindo o próprio item', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 8, descricao: 'Cortina Blackout', cor: 'Branca', categoria_nome: 'Cortina' }],
    });

    const rows = await svc.listarItensMesmoAmbiente(2, 1);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('pi2.id <> pi.id'), [2, 1]);
    expect(rows).toEqual([{ id: 8, descricao: 'Cortina Blackout', cor: 'Branca', categoria_nome: 'Cortina' }]);
  });

  test('retorna lista vazia quando não há outros itens no ambiente', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const rows = await svc.listarItensMesmoAmbiente(2, 1);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest ordemServicoService.test.js -t "listarItensMesmoAmbiente"`
Expected: FAIL with `svc.listarItensMesmoAmbiente is not a function`

- [ ] **Step 3: Implement `listarItensMesmoAmbiente`**

In `backend/src/services/ordemServicoService.js`, add this function right after
`buscarLarguraTecidoConhecida` (i.e., right before the final `module.exports` line):

```js
async function listarItensMesmoAmbiente(osId, empresaId) {
  const { rows } = await db.query(
    `SELECT pi2.id, pi2.descricao, pi2.cor, cat.nome AS categoria_nome
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     JOIN pedido_itens pi2 ON pi2.pedido_id = pi.pedido_id
       AND pi2.ambiente = pi.ambiente
       AND pi2.id <> pi.id
     LEFT JOIN categorias cat ON cat.id = pi2.categoria_id
     WHERE os.id = $1 AND p.empresa_id = $2
     ORDER BY pi2.id`,
    [osId, empresaId]
  );
  return rows;
}
```

Then update the `module.exports` line at the bottom of the file:

```js
module.exports = { criar, listarPorPedido, atualizarStatus, buscar, salvarDadosConfeccao, salvarDadosConferenciaConsultoras, salvarDadosTecnicos, buscarLarguraTecidoConhecida, listarItensMesmoAmbiente };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest ordemServicoService.test.js -t "listarItensMesmoAmbiente"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): adiciona listarItensMesmoAmbiente para vinculo forro-item"
```

---

## Task 2: Backend — route `GET /os/:id/itens-ambiente`

**Files:**
- Modify: `backend/src/routes/ordemServicoRoutes.js`
- Test: `backend/src/__tests__/ordemServicoRoutes.test.js` (new `describe` block)

**Interfaces:**
- Consumes: `svc.listarItensMesmoAmbiente(osId, empresaId)` from Task 1.
- Produces: `GET /api/os/:id/itens-ambiente` → 200 with the array from `listarItensMesmoAmbiente`, or 400 for a non-numeric `:id`. Task 6 (frontend) calls this via `api.get('/os/${osData.id}/itens-ambiente')`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `backend/src/__tests__/ordemServicoRoutes.test.js`:

```js
describe('GET /api/os/:id/itens-ambiente', () => {
  test('200 com lista de itens do mesmo ambiente', async () => {
    svc.listarItensMesmoAmbiente.mockResolvedValueOnce([
      { id: 8, descricao: 'Cortina Blackout', cor: 'Branca', categoria_nome: 'Cortina' },
    ]);
    const res = await request(app).get('/api/os/2/itens-ambiente');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(svc.listarItensMesmoAmbiente).toHaveBeenCalledWith(2, 1);
  });

  test('400 para id inválido', async () => {
    const res = await request(app).get('/api/os/abc/itens-ambiente');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest ordemServicoRoutes.test.js -t "itens-ambiente"`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Add the route**

In `backend/src/routes/ordemServicoRoutes.js`, insert this new route right after the
`PUT /:id/conferencia-consultoras` block (after line 54, before `router.get('/pedidos/:pedidoId/os', ...)`):

```js
router.get('/:id/itens-ambiente', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
    const itens = await svc.listarItensMesmoAmbiente(id, req.user.empresa_id);
    res.json(itens);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest ordemServicoRoutes.test.js -t "itens-ambiente"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/ordemServicoRoutes.js backend/src/__tests__/ordemServicoRoutes.test.js
git commit -m "feat(os): adiciona rota GET /os/:id/itens-ambiente"
```

---

## Task 3: Backend — validação + sincronização do vínculo em `salvarDadosConfeccao`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js:129-176` (`validarDadosConfeccaoForro`, `salvarDadosConfeccao`; new `sincronizarVinculoForroCortina` inserted between them)
- Test: `backend/src/__tests__/ordemServicoService.test.js:149-164` (modify existing forro tests in the `salvarDadosConfeccao` describe block, add new ones)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `sincronizarVinculoForroCortina(pedidoItemId: number, dados: object) => Promise<void>` (internal, not exported — used by Task 4 too, in the same file). Throws `{ status: 400 }` when `dados.itemVinculadoId` doesn't belong to the same pedido as `pedidoItemId`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/ordemServicoService.test.js`, replace the existing test (lines 149-158)

```js
  test('salva dados de confecção de forro quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_confeccao: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConfeccao(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });
```

with:

```js
  test('salva dados de confecção de forro SEPARADO e limpa vínculo forro_cortina antigo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 5 }] }) // SELECT tipo
      .mockResolvedValueOnce({ rows: [] }) // DELETE vinculo forro_cortina (limpeza)
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_confeccao: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] }); // UPDATE

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConfeccao(2, 3, dados);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining("DELETE FROM pedido_item_vinculos"),
      [5]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('salva forro JUNTO com item vinculado válido e insere vínculo forro_cortina', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 5 }] }) // SELECT tipo
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })                    // SELECT ownership (existe)
      .mockResolvedValueOnce({ rows: [] })                                     // DELETE vinculo antigo diferente
      .mockResolvedValueOnce({ rows: [] })                                     // INSERT vinculo novo
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_confeccao: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] }); // UPDATE

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'JUNTO', itemVinculadoId: '12' };
    const result = await svc.salvarDadosConfeccao(2, 3, dados);

    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('DELETE FROM pedido_item_vinculos'),
      [5, 12]
    );
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('INSERT INTO pedido_item_vinculos'),
      [5, 12]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 quando forro é JUNTO mas item vinculado não foi selecionado', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 5 }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'JUNTO' };
    await expect(svc.salvarDadosConfeccao(2, 3, dados)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Selecione o item'),
    });
  });

  test('lança erro 400 quando item vinculado não pertence ao mesmo pedido do forro', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 5 }] }) // SELECT tipo
      .mockResolvedValueOnce({ rows: [] });                                    // SELECT ownership -> não encontrado

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'JUNTO', itemVinculadoId: '999' };
    await expect(svc.salvarDadosConfeccao(2, 3, dados)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Item vinculado inválido'),
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest ordemServicoService.test.js -t "forro"`
Expected: FAIL (new tests fail because validation/sync don't exist yet; the modified SEPARADO test fails because `db.query` isn't called a 2nd time with a DELETE)

- [ ] **Step 3: Implement the validation and sync function**

In `backend/src/services/ordemServicoService.js`, replace `validarDadosConfeccaoForro` (lines 129-136):

```js
function validarDadosConfeccaoForro(dados) {
  const { tecidoForro, larguraForro, forroCosturado, itemVinculadoId } = dados || {};
  if (!tecidoForro?.trim()) throw Object.assign(new Error('Tecido do forro é obrigatório.'), { status: 400 });
  if (!larguraForro || parseFloat(String(larguraForro).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do forro é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!forroCosturado) throw Object.assign(new Error('Campo "Forro costurado" é obrigatório.'), { status: 400 });
  if (forroCosturado === 'JUNTO' && !itemVinculadoId) {
    throw Object.assign(new Error('Selecione o item em que este forro será costurado.'), { status: 400 });
  }
}
```

Right after `validarDadosConferenciaConsultorasPersiana` (before `salvarDadosConfeccao`), add:

```js
async function sincronizarVinculoForroCortina(pedidoItemId, dados) {
  if (dados.forroCosturado === 'JUNTO' && dados.itemVinculadoId) {
    const itemVinculadoId = Number(dados.itemVinculadoId);
    const { rows } = await db.query(
      `SELECT 1 FROM pedido_itens pi_forro
       JOIN pedido_itens pi_alvo ON pi_alvo.pedido_id = pi_forro.pedido_id
       WHERE pi_forro.id = $1 AND pi_alvo.id = $2`,
      [pedidoItemId, itemVinculadoId]
    );
    if (!rows.length) {
      throw Object.assign(new Error('Item vinculado inválido para este pedido.'), { status: 400 });
    }
    await db.query(
      `DELETE FROM pedido_item_vinculos
       WHERE item_id = $1 AND tipo_vinculo = 'forro_cortina' AND item_vinculado_id <> $2`,
      [pedidoItemId, itemVinculadoId]
    );
    await db.query(
      `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
       VALUES ($1, $2, 'forro_cortina') ON CONFLICT DO NOTHING`,
      [pedidoItemId, itemVinculadoId]
    );
  } else {
    await db.query(
      `DELETE FROM pedido_item_vinculos WHERE item_id = $1 AND tipo_vinculo = 'forro_cortina'`,
      [pedidoItemId]
    );
  }
}
```

Then update `salvarDadosConfeccao` (lines 147-176) — change the `SELECT` to include
`os.pedido_item_id` and call the sync function for forro:

```js
async function salvarDadosConfeccao(id, userId, dadosConfeccao, empresaId) {
  const { rows: osRows } = await db.query(
    `SELECT os.tipo, os.pedido_item_id
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE os.id = $1 AND p.empresa_id = $2`,
    [id, empresaId]
  );
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });

  if (osRows[0].tipo === 'cortina') {
    validarDadosConfeccaoCortina(dadosConfeccao);
  } else if (osRows[0].tipo === 'forro') {
    validarDadosConfeccaoForro(dadosConfeccao);
  }

  if (osRows[0].tipo === 'forro') {
    await sincronizarVinculoForroCortina(osRows[0].pedido_item_id, dadosConfeccao);
  }

  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_confeccao = $1,
         confeccao_preenchido_em = NOW(),
         confeccao_preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dadosConfeccao), userId, id]
  );
  return rows[0];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest ordemServicoService.test.js -t "forro"`
Expected: PASS (all forro-related tests, including the pre-existing ones for confecção/cortina)

Then run the full backend suite to make sure nothing else broke:

Run: `cd backend && npx jest ordemServicoService.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): valida e sincroniza vinculo forro_cortina em salvarDadosConfeccao"
```

---

## Task 4: Backend — sincronização do vínculo em `salvarDadosConferenciaConsultoras`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js:178-248` (`salvarDadosConferenciaConsultoras`)
- Test: `backend/src/__tests__/ordemServicoService.test.js:194-203` (modify existing forro test, add new one)

**Interfaces:**
- Consumes: `sincronizarVinculoForroCortina(pedidoItemId, dados)` from Task 3, `validarDadosConfeccaoForro(dados)` (already updated in Task 3).
- Produces: same forro-linking behavior as Task 3, now also active on `PUT /os/:id/conferencia-consultoras`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/ordemServicoService.test.js`, replace the existing test (lines 194-203)

```js
  test('salva dados de conferência consultoras de forro quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_conferencia_consultoras: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConferenciaConsultoras(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });
```

with:

```js
  test('salva dados de conferência consultoras de forro SEPARADO e limpa vínculo forro_cortina antigo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 6 }] }) // SELECT tipo
      .mockResolvedValueOnce({ rows: [] }) // DELETE vinculo forro_cortina (limpeza)
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_conferencia_consultoras: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] }); // UPDATE

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConferenciaConsultoras(2, 3, dados);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('DELETE FROM pedido_item_vinculos'),
      [6]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('salva forro JUNTO (conferência consultoras) e insere vínculo forro_cortina', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro', pedido_item_id: 6 }] }) // SELECT tipo
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })                    // SELECT ownership
      .mockResolvedValueOnce({ rows: [] })                                     // DELETE vinculo antigo diferente
      .mockResolvedValueOnce({ rows: [] })                                     // INSERT vinculo novo
      .mockResolvedValueOnce({ rows: [{ id: 3, dados_conferencia_consultoras: { tecidoForro: 'Blackout' }, status: 'em_andamento' }] }); // UPDATE

    const dados = { tecidoForro: 'Blackout', larguraForro: '3,00', forroCosturado: 'JUNTO', itemVinculadoId: '20' };
    const result = await svc.salvarDadosConferenciaConsultoras(3, 1, dados);

    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('INSERT INTO pedido_item_vinculos'),
      [6, 20]
    );
    expect(result.status).toBe('em_andamento');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest ordemServicoService.test.js -t "conferência consultoras de forro"`
Expected: FAIL (modified SEPARADO test fails because no DELETE is issued yet; new JUNTO test fails the same way)

- [ ] **Step 3: Wire the sync call into `salvarDadosConferenciaConsultoras`**

In `backend/src/services/ordemServicoService.js`, inside `salvarDadosConferenciaConsultoras`,
right after the validation block and before the `if (tipo === 'persiana') { ... }` block, add:

```js
  if (tipo === 'cortina') {
    validarDadosConfeccaoCortina(dados);
  } else if (tipo === 'forro') {
    validarDadosConfeccaoForro(dados);
  } else if (tipo === 'persiana') {
    validarDadosConferenciaConsultorasPersiana(dados);
  }

  if (tipo === 'forro') {
    await sincronizarVinculoForroCortina(osRows[0].pedido_item_id, dados);
  }

  if (tipo === 'persiana') {
```

(the `if (tipo === 'persiana') {` line already exists — this step just adds the two new lines
between the validation block and it; `osRows[0].pedido_item_id` is already selected by the
existing query in this function, no SELECT change needed here).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest ordemServicoService.test.js`
Expected: PASS (full file, all describe blocks)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): sincroniza vinculo forro_cortina em salvarDadosConferenciaConsultoras"
```

---

## Task 5: Frontend — select de vínculo em `FichaConfeccaoForro.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx`

**Interfaces:**
- Consumes: `GET /os/:id/itens-ambiente` (Task 2), returning `Array<{ id, descricao, cor, categoria_nome }>`.
- Produces: `dados.itemVinculadoId` sent as part of the existing `PUT /os/:id/confeccao` /
  `PUT /os/:id/conferencia-consultoras` request bodies (no new request shape — it's just one
  more key in the same JSON already being sent).

- [ ] **Step 1: Add `useEffect` import and `itemVinculadoId` to `VAZIO`**

Change line 1 of `frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx` from:

```js
import { useMemo, useState } from "react";
```

to:

```js
import { useEffect, useMemo, useState } from "react";
```

Change the `VAZIO` object (lines 7-11) from:

```js
const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", abertura: "", alturaCortina: "",
};
```

to:

```js
const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "", itemVinculadoId: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", abertura: "", alturaCortina: "",
};
```

- [ ] **Step 2: Fetch the sibling items on mount**

Right after the `[dados, setDados]` state declaration (currently `const [dados, setDados] = useState({ ...VAZIO, ...(osData[campoDados] || {}) });`), add a new state and effect:

```js
  const [itensAmbiente, setItensAmbiente] = useState([]);

  useEffect(() => {
    api.get(`/os/${osData.id}/itens-ambiente`)
      .then((res) => setItensAmbiente(res || []))
      .catch(() => setItensAmbiente([]));
  }, [osData.id]);
```

- [ ] **Step 3: Add the frontend validation**

In the `salvar()` function, right after the line
`if (!dados.forroCosturado) return setErro('Campo "Forro costurado" é obrigatório.');`, add:

```js
    if (dados.forroCosturado === "JUNTO" && !dados.itemVinculadoId) {
      return setErro("Selecione o item em que este forro será costurado.");
    }
```

- [ ] **Step 4: Clear the field when switching away from JUNTO, and render the conditional select**

Change the "Forro costurado" select's `onChange` from:

```jsx
                  <select value={dados.forroCosturado} onChange={(e) => setCampo("forroCosturado", e.target.value)} className="input-highlight">
```

to:

```jsx
                  <select
                    value={dados.forroCosturado}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setDados((prev) => ({ ...prev, forroCosturado: valor, itemVinculadoId: valor === "JUNTO" ? prev.itemVinculadoId : "" }));
                    }}
                    className="input-highlight"
                  >
```

Then, right after the `os-grid-2` block containing "Forro costurado"/"Franzimento" and before
the `os-grid-2` block containing "Largura do forro (m)"/"Altura barra do forro (m)", add:

```jsx
              {dados.forroCosturado === "JUNTO" && (
                <div className="os-field">
                  <label>Vincular a qual item deste ambiente?</label>
                  <select
                    value={dados.itemVinculadoId}
                    onChange={(e) => setCampo("itemVinculadoId", e.target.value)}
                    className="input-highlight"
                  >
                    <option value="">— Selecione —</option>
                    {itensAmbiente.map((it) => (
                      <option key={it.id} value={it.id}>
                        {[it.categoria_nome, it.descricao, it.cor].filter(Boolean).join(" — ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
```

- [ ] **Step 5: Verify with lint and build**

Run: `cd frontend-web && npx eslint src/pages/pedidos/FichaConfeccaoForro.jsx`
Expected: no output (no errors)

Run: `cd frontend-web && npx vite build --logLevel warn`
Expected: build completes with no errors (only the pre-existing `PLUGIN_TIMINGS` warning is fine)

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx
git commit -m "feat(forro): permite vincular forro a um item do mesmo ambiente quando costurado junto"
```

---

## Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx jest`
Expected: all suites PASS, including `ordemServicoService.test.js` and `ordemServicoRoutes.test.js`

- [ ] **Step 2: Confirm frontend build is clean**

Run: `cd frontend-web && npx vite build --logLevel warn`
Expected: build completes with no errors

- [ ] **Step 3: Manual browser test (cannot be automated in this environment — no screenshot tool)**

Document for the user, do not skip reporting this as pending:

1. Pedido com 1 forro + 1 cortina no mesmo ambiente → abrir Ficha de Conferência Consultoras
   do Forro, marcar "Forro costurado" = Junto → o select "Vincular a qual item deste
   ambiente?" aparece com a cortina do ambiente listada.
2. Tentar salvar sem escolher o item → erro de validação exibido inline.
3. Escolher a cortina, salvar → sucesso; conferir no banco que `pedido_item_vinculos` tem uma
   linha `(forro_item_id, cortina_item_id, 'forro_cortina')`.
4. Reabrir a ficha → select vem pré-selecionado com a cortina escolhida.
5. Trocar para "Separado" e salvar → linha em `pedido_item_vinculos` é removida.
6. Repetir o fluxo na Ficha de Confecção (`modo="confeccao"`) do mesmo item — mesmo
   comportamento.

- [ ] **Step 4: Report status to the user**

State explicitly that automated tests + build pass, and that step 3 (manual browser test)
still needs to be done by a human before considering this fully verified — consistent with
how every other frontend feature in this project has been shipped (see `MEMORY.md` project
notes: every prior UI feature landed with "falta teste navegador").
