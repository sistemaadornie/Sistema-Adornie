# Ficha de Conferência Consultoras (Etapa 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Ficha de Conferência Consultoras" step to Etapa 1 of the pedido flow — filled by the consultora with the same fields as today's Ficha de Confecção — that gates both a new Etapa 1 completion criterion and the existing Conferência Técnica.

**Architecture:** Reuse the existing `ordem_servico` row and the existing `FichaConfeccaoCortina.jsx`/`FichaConfeccaoForro.jsx` form components (parameterized by a `modo` prop) against a new pair of columns (`dados_conferencia_consultoras`, etc.). The Conferência Técnica's existing block-on-`dados_confeccao` gate is repointed to the new column. `dados_confeccao` itself is untouched — it is repurposed in a future, separate project.

**Tech Stack:** Node/Express + PostgreSQL (backend), React + react-router (frontend-web), Jest + supertest (backend tests only — frontend-web has no test runner configured).

## Global Constraints

- Reuse `validarDadosConfeccaoCortina`/`validarDadosConfeccaoForro` validation rules verbatim for the new ficha — do not duplicate or alter the obrigatoriedade rules.
- The new Etapa 1 criterion only applies to items where `categorias.necessita_conferencia = true` (confirmed: in practice this is always a subset with `tipo_confeccao` set too).
- Append new SQL queries to the **end** of existing `Promise.all([...])` arrays in `dashboardService.js`, never insert in the middle — existing tests assert on positional `db.query.mock.calls[N]`, and inserting in the middle would silently shift those indices.
- `dados_confeccao` / `FichaConfeccaoCortina.jsx` / `FichaConfeccaoForro.jsx` (the "Confecção" mode) are not removed and keep their current behavior unless this plan explicitly says otherwise.
- No new frontend automated tests — `frontend-web` has no test runner configured (verified: no `*.test.jsx` files, no test script in `package.json`). Frontend changes are verified by the manual browser pass in the final task.

---

### Task 1: Migration — novas colunas em `ordem_servico`

**Files:**
- Create: `backend/src/database/migrations/ordem_servico_conferencia_consultoras.sql`

**Interfaces:**
- Produces: columns `ordem_servico.dados_conferencia_consultoras` (JSONB), `ordem_servico.conferencia_consultoras_preenchido_em` (TIMESTAMPTZ), `ordem_servico.conferencia_consultoras_preenchido_por` (INTEGER FK `usuarios.id`) — consumed by Task 2 onward.

- [ ] **Step 1: Write the migration file**

```sql
-- ordem_servico_conferencia_consultoras.sql
-- Ficha de Conferência Consultoras: preenchida pela consultora na Etapa 1,
-- antes de qualquer agendamento/visita técnica. Mesmos campos da Ficha de
-- Confecção (dados_confeccao), só que numa etapa anterior.
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_conferencia_consultoras JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_por INTEGER REFERENCES usuarios(id);
```

- [ ] **Step 2: Run the migration against the local database**

Run: `node backend/src/database/run-migration.js ordem_servico_conferencia_consultoras.sql`
Expected: `Migration executada com sucesso.`

- [ ] **Step 3: Apply the same migration to the Supabase project**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with the project id from `[[project_db_local_vs_supabase]]` memory (project `agenda_adornie`, id `zexexngoujgtnlvydrjh`), name `ordem_servico_conferencia_consultoras`, and the exact SQL from Step 1.
Expected: tool returns success; confirm with `mcp__plugin_supabase_supabase__list_migrations` that the new migration appears.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/ordem_servico_conferencia_consultoras.sql
git commit -m "feat(db): colunas de Ficha de Conferência Consultoras em ordem_servico"
```

---

### Task 2: Backend — salvar Conferência Consultoras + repontar o gate da Técnica

**Files:**
- Modify: `backend/src/services/ordemServicoService.js`
- Modify: `backend/src/routes/ordemServicoRoutes.js`
- Test: `backend/src/__tests__/ordemServicoService.test.js`

**Interfaces:**
- Produces: `ordemServicoService.salvarDadosConferenciaConsultoras(id, userId, dados) -> Promise<OsRow>`, consumed by the new route in this task and indirectly by the frontend in Task 8.
- Produces: `PUT /os/:id/conferencia-consultoras` (body = mesmo shape de `dados_confeccao`), consumed by `FichaConfeccaoCortina.jsx`/`FichaConfeccaoForro.jsx` in Task 7.
- Modifies: `ordemServicoService.salvarDadosTecnicos` now requires `dados_conferencia_consultoras` instead of `dados_confeccao`.
- Modifies: `ordemServicoService.buscar(id)` now also returns `dados_conferencia_consultoras`, `conferencia_consultoras_preenchido_em`, `conferencia_consultoras_preenchido_por`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/ordemServicoService.test.js`, add a new `describe` block right after `describe('salvarDadosConfeccao', ...)` (before `describe('salvarDadosTecnicos', ...)`):

```js
describe('salvarDadosConferenciaConsultoras', () => {
  test('salva dados de conferência consultoras de cortina quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_conferencia_consultoras: { larguraTrilho: '4,92' }, status: 'em_andamento' }] });

    const dados = { larguraTrilho: '4,92', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    const result = await svc.salvarDadosConferenciaConsultoras(1, 2, dados);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('dados_conferencia_consultoras = $1'),
      [JSON.stringify(dados), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 se largura do trilho for inválida para cortina', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] });
    const dados = { larguraTrilho: '0', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    await expect(svc.salvarDadosConferenciaConsultoras(1, 2, dados)).rejects.toThrow('trilho');
  });

  test('salva dados de conferência consultoras de forro quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_conferencia_consultoras: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConferenciaConsultoras(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosConferenciaConsultoras(999, 2, {})).rejects.toMatchObject({ status: 404 });
  });
});
```

Then update `describe('salvarDadosTecnicos', ...)` — replace the mocked column name in the two tests that reference it:

```js
  test('salva com sucesso quando ficha de confecção já está preenchida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_conferencia_consultoras: { larguraTrilho: 4.92 } }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_tecnicos: validData, status: 'em_andamento' }] });
    // ... resto do teste inalterado
```

(apply the same `dados_confeccao` → `dados_conferencia_consultoras` swap in the mocked `rows` of every other test inside this `describe` block: `'lança erro 400 quando a ficha de confecção ainda não foi preenchida'`, `'lança erro se largura técnica for inválida'`, `'lança erro se altura esquerda for inválida'`, `'lança erro se responsável não for preenchido'`, `'lança erro se assinatura do técnico não for fornecida'` — every `{ rows: [{ dados_confeccao: ... }] }` becomes `{ rows: [{ dados_conferencia_consultoras: ... }] }`).

Finally, in `describe('buscar', ...)`, add one more assertion to the first test:

```js
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('os.dados_conferencia_consultoras'), [1]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest ordemServicoService.test.js`
Expected: FAIL — `svc.salvarDadosConferenciaConsultoras is not a function`, plus failures in `salvarDadosTecnicos`/`buscar` from the mock/assertion mismatches.

- [ ] **Step 3: Implement in `ordemServicoService.js`**

Modify `buscar`'s SELECT (after the `os.dados_confeccao, os.confeccao_preenchido_em, os.confeccao_preenchido_por,` line):

```js
            os.dados_confeccao, os.confeccao_preenchido_em, os.confeccao_preenchido_por,
            os.dados_conferencia_consultoras, os.conferencia_consultoras_preenchido_em, os.conferencia_consultoras_preenchido_por,
```

Modify `salvarDadosTecnicos`'s gate (replace the `SELECT`/check at the top of the function):

```js
async function salvarDadosTecnicos(id, userId, dadosTecnicos) {
  const { rows: osRows } = await db.query(`SELECT dados_conferencia_consultoras FROM ordem_servico WHERE id = $1`, [id]);
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  if (!osRows[0].dados_conferencia_consultoras) {
    throw Object.assign(new Error('Ficha de Conferência Consultoras precisa ser preenchida antes da Conferência Técnica.'), { status: 400 });
  }
```

Add the new function (right after `salvarDadosConfeccao`, before `salvarDadosTecnicos`):

```js
async function salvarDadosConferenciaConsultoras(id, userId, dados) {
  const { rows: osRows } = await db.query(`SELECT tipo FROM ordem_servico WHERE id = $1`, [id]);
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });

  if (osRows[0].tipo === 'cortina') {
    validarDadosConfeccaoCortina(dados);
  } else if (osRows[0].tipo === 'forro') {
    validarDadosConfeccaoForro(dados);
  }

  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_conferencia_consultoras = $1,
         conferencia_consultoras_preenchido_em = NOW(),
         conferencia_consultoras_preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dados), userId, id]
  );
  return rows[0];
}
```

Update `module.exports` to include `salvarDadosConferenciaConsultoras`.

- [ ] **Step 4: Add the route**

In `backend/src/routes/ordemServicoRoutes.js`, add (right after the `router.put('/:id/confeccao', ...)` block):

```js
router.put('/:id/conferencia-consultoras', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
    const os = await svc.salvarDadosConferenciaConsultoras(id, req.user.id, req.body);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest ordemServicoService.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && npm test`
Expected: PASS — no other suite references `dados_confeccao` as the Técnica gate.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/routes/ordemServicoRoutes.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): salvar Ficha de Conferência Consultoras e repontar gate da Técnica"
```

---

### Task 3: Backend — endpoint de itens pendentes de Conferência Consultoras

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`
- Test: `backend/src/__tests__/pedidosRoutes.itensPendentesConferenciaConsultoras.test.js` (new)

**Interfaces:**
- Produces: `GET /pedidos/:id/itens-pendentes-conferencia-consultoras -> { itens: [{ pedido_item_id, ordem, ambiente, descricao, medidas, ordem_servico_id }] }`, consumed by `EtapaDadosPedido.jsx` in Task 11.

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/pedidosRoutes.itensPendentesConferenciaConsultoras.test.js`:

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

describe('GET /api/pedidos/:id/itens-pendentes-conferencia-consultoras', () => {
  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');
    expect(res.status).toBe(404);
  });

  test('200 retorna itens pendentes de conferencia consultoras', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({
        rows: [
          { pedido_item_id: 11, ordem: 0, ambiente: 'Sala', descricao: 'Cortina Wave', medidas: '3,16x2,88', ordem_servico_id: null },
        ],
      });

    const res = await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([
      { pedido_item_id: 11, ordem: 0, ambiente: 'Sala', descricao: 'Cortina Wave', medidas: '3,16x2,88', ordem_servico_id: null },
    ]);
    expect(db.query.mock.calls[1][0]).toContain('necessita_conferencia');
    expect(db.query.mock.calls[1][0]).toContain('dados_conferencia_consultoras IS NULL');
  });

  test('200 retorna lista vazia quando nao ha itens pendentes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-pendentes-conferencia-consultoras');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest pedidosRoutes.itensPendentesConferenciaConsultoras.test.js`
Expected: FAIL with 404 (route doesn't exist yet, Express returns its default 404 handler).

- [ ] **Step 3: Implement the route**

In `backend/src/routes/pedidosRoutes.js`, add right after the `itens-disponiveis-conferencia-entrega` route block:

```js
// GET /pedidos/:id/itens-pendentes-conferencia-consultoras
router.get("/:id/itens-pendentes-conferencia-consultoras", authMiddleware, async (req, res) => {
  try {
    const pedidoId = req.params.id;
    const empresaId = req.user.empresa_id;

    const pedCheck = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (pedCheck.rows.length === 0) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const query = `
      SELECT
        pi.id AS pedido_item_id,
        pi.ordem,
        pi.ambiente,
        pi.descricao,
        pi.medidas,
        os.id AS ordem_servico_id
      FROM pedido_itens pi
      LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
      LEFT JOIN produtos prod ON prod.id = oi.produto_id
      LEFT JOIN categorias cat ON cat.id = COALESCE(pi.categoria_id, prod.categoria_id)
      LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
      WHERE pi.pedido_id = $1
        AND cat.necessita_conferencia = true
        AND (os.id IS NULL OR os.dados_conferencia_consultoras IS NULL)
      ORDER BY pi.ordem ASC, pi.id ASC
    `;

    const { rows } = await db.query(query, [pedidoId]);
    return res.json({ itens: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar itens pendentes de Conferência Consultoras." });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest pedidosRoutes.itensPendentesConferenciaConsultoras.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.itensPendentesConferenciaConsultoras.test.js
git commit -m "feat(pedidos): endpoint de itens pendentes de Ficha de Conferência Consultoras"
```

---

### Task 4: Backend — expor `conferencia_consultoras_preenchida` em `listarConferenciaItens`

**Files:**
- Modify: `backend/src/services/agendamentoService.js:1352-1387` (function `listarConferenciaItens`)
- Test: `backend/src/__tests__/agendamentoServiceListarConferenciaItens.test.js` (new)

**Interfaces:**
- Modifies: each item returned by `listarConferenciaItens` now also has a `conferencia_consultoras_preenchida` boolean, consumed by `utils/fichaConferencia.js` (Task 9) via `Agendamentos.jsx`'s `ConferenciaItensModal` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/agendamentoServiceListarConferenciaItens.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

describe('listarConferenciaItens', () => {
  test('expõe conferencia_consultoras_preenchida por item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // agCheck
      .mockResolvedValueOnce({ rows: [{
        pedido_item_id: 1, descricao: 'Cortina', ambiente: 'Sala', tipo_confeccao: 'cortina',
        status: 'pendente', observacoes: null, dados: null, conferido_em: null, conferido_por_nome: null,
        ordem_servico_id: 9, confeccao_preenchida: false, ficha_preenchida: false,
        conferencia_consultoras_preenchida: true,
      }] });

    const itens = await svc.listarConferenciaItens(5, 10);

    expect(itens[0].conferencia_consultoras_preenchida).toBe(true);
    expect(db.query.mock.calls[1][0]).toContain('dados_conferencia_consultoras');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest agendamentoServiceListarConferenciaItens.test.js`
Expected: FAIL — `conferencia_consultoras_preenchida` is `undefined` and the SQL string doesn't contain `dados_conferencia_consultoras`.

- [ ] **Step 3: Implement**

In `backend/src/services/agendamentoService.js`, in `listarConferenciaItens`'s SELECT, add a line right after `(os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,`:

```js
       (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
       (os.dados_conferencia_consultoras IS NOT NULL) AS conferencia_consultoras_preenchida,
       (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest agendamentoServiceListarConferenciaItens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoServiceListarConferenciaItens.test.js
git commit -m "feat(agendamentos): expor conferencia_consultoras_preenchida em listarConferenciaItens"
```

---

### Task 5: Backend — novo critério da Etapa 1 em `dashboardService.js`

**Files:**
- Modify: `backend/src/services/dashboardService.js`
- Modify: `backend/src/__tests__/dashboardService.test.js`
- Modify: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`

**Interfaces:**
- Consumes: nothing new (reads `ordem_servico.dados_conferencia_consultoras` directly via SQL).
- Modifies: `calcularEtapaAtual(...)` now takes `itensComConferenciaConsultorasPreenchida` and factors it into `etapa1_ok`.
- Produces: `etapas[0].progresso.itens_com_conferencia_consultoras` in both `listarPedidosDashboard` and `buscarFluxoPedido`, consumed by `EtapaDadosPedido.jsx` (Task 11).

- [ ] **Step 1: Write the failing unit tests for `calcularEtapaAtual`**

In `backend/src/__tests__/dashboardService.test.js`, inside `describe("calcularEtapaAtual", ...)`, add `itensComConferenciaConsultorasPreenchida: 0` and `totalItensConferencia: 0` to the `base` object (line 8-25):

```js
  const base = {
    verificacaoOk: false,
    itensSemCategoria: 0,
    itensSemVinculo: 0,
    totalItens: 2,
    itensCobertos: 0,
    totalItensConferencia: 0,
    itensCobertosConferencia: 0,
    itensComConferenciaConsultorasPreenchida: 0,
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
```

Then add a new test right after `test("etapa 1 incompleta (verificacao pendente) -> etapa_atual 1", ...)`:

```js
  test("etapa 1 com itens de conferência sem Ficha de Conferência Consultoras -> etapa1_ok false", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConferencia: 1,
      itensCobertosConferencia: 1,
      itensComConferenciaConsultorasPreenchida: 0,
    });
    expect(r.etapa1_ok).toBe(false);
  });

  test("etapa 1 com todos os itens de conferência com Ficha de Conferência Consultoras preenchida -> etapa1_ok true", () => {
    const r = calcularEtapaAtual({
      ...base,
      verificacaoOk: true,
      itensCobertos: 2,
      totalItensConferencia: 1,
      itensCobertosConferencia: 1,
      itensComConferenciaConsultorasPreenchida: 1,
    });
    expect(r.etapa1_ok).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest dashboardService.test.js -t "calcularEtapaAtual"`
Expected: FAIL — the first new test expects `etapa1_ok` to be `false` but today's `calcularEtapaAtual` ignores `itensComConferenciaConsultorasPreenchida` entirely, so it currently computes `true`.

- [ ] **Step 3: Implement in `calcularEtapaAtual`**

In `backend/src/services/dashboardService.js`, update the function signature (around line 13-32) to add the new param, and update `etapa1_ok` (around line 33-39):

```js
function calcularEtapaAtual({
  verificacaoOk,
  itensSemCategoria,
  itensSemVinculo,
  totalItens,
  itensCobertos,
  totalItensConferencia,
  itensCobertosConferencia,
  itensComConferenciaConsultorasPreenchida,
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
  const conferenciaOk = (totalItensConferencia ?? 0) === 0 ||
                        (itensCobertosConferencia ?? 0) >= totalItensConferencia;
  const conferenciaConsultorasOk = (totalItensConferencia ?? 0) === 0 ||
                        (itensComConferenciaConsultorasPreenchida ?? 0) >= totalItensConferencia;
  const etapa1_ok = verificacaoOk &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    conferenciaOk &&
                    conferenciaConsultorasOk;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest dashboardService.test.js -t "calcularEtapaAtual"`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `listarPedidosDashboard`'s wiring**

In `backend/src/__tests__/dashboardService.test.js`, in each of the 3 existing `listarPedidosDashboard` tests, add one more `.mockResolvedValueOnce({ rows: [] })` right after the comment `// 14) separacao por pedido` mock (and rename that comment block to note the new 15th query):

For test `"calcula estagio.etapa_atual em lote a partir das queries agregadas"` (ends at line 209 `.mockResolvedValueOnce({ rows: [] });`), change to:

```js
      // 14) separacao por pedido
      .mockResolvedValueOnce({ rows: [] })
      // 15) itens com Ficha de Conferência Consultoras preenchida por pedido
      .mockResolvedValueOnce({ rows: [] });
```

Apply the identical change (replace the final `.mockResolvedValueOnce({ rows: [] }); // separacao` line with the two lines above) to the other two tests: `"pedido sem itens e sem agendamentos fica na etapa 1"` and `"query de itens cobertos do dashboard filtra a.tipo = Instalação"`.

- [ ] **Step 6: Run test to verify it fails for the right reason**

Run: `cd backend && npx jest dashboardService.test.js -t "listarPedidosDashboard"`
Expected: PASS already at this point (an extra mocked value with no corresponding query doesn't break anything — `Promise.all` just doesn't consume it). This step exists to confirm that; no implementation needed yet for these 3 tests to keep passing, but the next step adds real coverage of the new query being issued.

- [ ] **Step 7: Add a dedicated test asserting the new query is issued**

Add this test inside `describe("listarPedidosDashboard", ...)`, after the existing 3:

```js
  test("inclui itens_com_conferencia_consultoras no progresso (via dashboardService futuro consumidor)", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 4, numero_sequencial: 13, numero_origem: null, status: "pendente",
          verificacao_ok: true, categorizacao_ok: true, total: "0.00",
          criado_em: "2026-01-04T00:00:00.000Z", cliente_nome: "Cliente D",
          consultor_nome: "Consultora W", consultor_id: 8, itens_count: "1",
          pdf_ok: true, vinculos_ok: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // preAgs
      .mockResolvedValueOnce({ rows: [{ pedido_id: 4, total: 1 }] }) // total itens
      .mockResolvedValueOnce({ rows: [] }) // itens cobertos (instalação)
      .mockResolvedValueOnce({ rows: [{ pedido_id: 4, total: 1 }] }) // total itens conferência
      .mockResolvedValueOnce({ rows: [] }) // itens cobertos conferência (agendamento) — não usado pelo novo critério
      .mockResolvedValueOnce({ rows: [] }) // sem categoria
      .mockResolvedValueOnce({ rows: [] }) // sem vinculo
      .mockResolvedValueOnce({ rows: [] }) // conferencia (etapa 2)
      .mockResolvedValueOnce({ rows: [] }) // confeccao (etapa 3)
      .mockResolvedValueOnce({ rows: [] }) // genitores agendados
      .mockResolvedValueOnce({ rows: [] }) // produto_ok
      .mockResolvedValueOnce({ rows: [] }) // instalacoes
      .mockResolvedValueOnce({ rows: [] }) // separacao
      .mockResolvedValueOnce({ rows: [{ pedido_id: 4, total: 1 }] }); // itens com conferencia consultoras preenchida

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    // 1 item necessita conferência, 0 cobertos por agendamento (etapa1 não fecharia por aí),
    // mas 1/1 com Ficha de Conferência Consultoras preenchida -> esse critério novo não bloqueia.
    const ultimaQuery = db.query.mock.calls[14][0];
    expect(ultimaQuery).toContain("necessita_conferencia");
    expect(ultimaQuery).toContain("dados_conferencia_consultoras IS NOT NULL");
    expect(resultado[0].id).toBe(4);
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd backend && npx jest dashboardService.test.js -t "inclui itens_com_conferencia_consultoras"`
Expected: FAIL — `db.query.mock.calls[14]` is `undefined` (only 14 queries are issued today).

- [ ] **Step 9: Implement in `listarPedidosDashboard`**

In `backend/src/services/dashboardService.js`, add the new query as the last element of the `Promise.all([...])` array (right after the "Etapa 6: itens de separacao..." query, before the closing `]);`):

```js
    // Etapa 1: itens com Ficha de Conferência Consultoras preenchida por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE pi.pedido_id = ANY($1) AND cat.necessita_conferencia = true
         AND os.dados_conferencia_consultoras IS NOT NULL
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
  ]);
```

Add `{ rows: itensComConferenciaConsultorasRows },` to the destructuring tuple (after `{ rows: separacaoRows },`).

After the `separacaoPorPedido` build loop, add:

```js
  const itensComConferenciaConsultorasPorPedido = {};
  for (const r of itensComConferenciaConsultorasRows) itensComConferenciaConsultorasPorPedido[r.pedido_id] = Number(r.total);
```

In the `.map((p) => {...})` block's `calcularEtapaAtual({...})` call, add (right after `itensCobertosConferencia: itensCobertosConferenciaPorPedido[p.id] || 0,`):

```js
      itensComConferenciaConsultorasPreenchida: itensComConferenciaConsultorasPorPedido[p.id] || 0,
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd backend && npx jest dashboardService.test.js`
Expected: PASS (all `listarPedidosDashboard` and `calcularEtapaAtual` tests).

- [ ] **Step 11: Write the failing tests for `buscarFluxoPedido`'s wiring**

In `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`, every test's mock chain needs one more `.mockResolvedValueOnce(...)` inserted right after the `itensControleRows` mock and before whatever comes next (`itensPorGenitor` if the test has genitores, or the closing `;` if it returns early). Apply this to all 5 tests in the file:

For `"inclui itens_persiana_pendentes no progresso da etapa 1"` (no genitores), change:
```js
      .mockResolvedValueOnce({ rows: [{ pendentes: 2 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] });                           // itensControleRows
```
to:
```js
      .mockResolvedValueOnce({ rows: [{ pendentes: 2 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [] });                           // itensComConferenciaConsultorasRows
```

For `"query de itens_cobertos filtra a.tipo = Instalação..."` (has genitores), change:
```js
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
```
to:
```js
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [] })                            // itensComConferenciaConsultorasRows
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
```

Apply the same pattern (insert `.mockResolvedValueOnce({ rows: [] })  // itensComConferenciaConsultorasRows` immediately after the `itensControleRows` mock, before whatever follows) to the remaining 3 tests: `"inclui ambientes_canais_insuficientes..."` (no genitores — append before the final `;`), `"agendamento nao_concluido não conta como cobertura"` (has genitores), and `"expõe observacoes_status do agendamento"` (has genitores).

Then add a new dedicated test at the end of the file:

```js
describe('buscarFluxoPedido — itens_com_conferencia_consultoras bloqueia etapa1_ok', () => {
  test('etapa1_ok fica false quando item de conferência não tem Ficha de Conferência Consultoras preenchida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, numero_sequencial: 1, numero_origem: null, status: 'em_andamento',
        verificacao_ok: true, categorizacao_ok: true, total: '0',
        criado_em: '2026-01-01T00:00:00.000Z',
        cliente_id: null, cep: null, rua: null, numero_rua: null, complemento: null,
        bairro: null, cidade: null, estado: null,
        cliente_nome: null, consultor_nome: 'Consultora', consultor_id: 99,
      }] }) // pedido
      .mockResolvedValueOnce({ rows: [] }) // anexos
      .mockResolvedValueOnce({ rows: [] }) // vinculos
      .mockResolvedValueOnce({ rows: [] }) // allItems
      .mockResolvedValueOnce({ rows: [] }) // itensRows
      .mockResolvedValueOnce({ rows: [] }) // genitoresRaw (vazio -> branch sem genitores)
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 1 }] })             // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 1 }] })             // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });               // itensComConferenciaConsultorasRows (0/1 preenchida)

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const etapa1 = resultado.etapas.find((e) => e.numero === 1);
    expect(etapa1.progresso.itens_com_conferencia_consultoras).toBe(0);
    expect(etapa1.concluida).toBe(false);
  });
});
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido.test.js`
Expected: FAIL — the new test fails because `etapas[0].progresso.itens_com_conferencia_consultoras` is `undefined`; the 5 pre-existing tests should still PASS at this point (the extra mock is harmless until the implementation issues the query — `Promise.all` ignores unused queued mocks).

- [ ] **Step 13: Implement in `buscarFluxoPedido`**

In `backend/src/services/dashboardService.js`, add the new query as the last element of the Promise.all array that starts the "Etapas 1-4 — queries independentes em paralelo" block (right after the `itensControleRows` query, before the closing `]);`):

```js
    db.query(
      `SELECT COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE pi.pedido_id = $1 AND cat.necessita_conferencia = true
         AND os.dados_conferencia_consultoras IS NOT NULL`,
      [pedidoId]
    ),
  ]);
```

Add `{ rows: itensComConferenciaConsultorasRows },` to the destructuring tuple (after `{ rows: itensControleRows },`).

After the `encontrarVinculosControle` line, add:

```js
  const itensComConferenciaConsultorasPreenchida = itensComConferenciaConsultorasRows[0]?.total ?? 0;
```

In **both** `calcularEtapaAtual({...})` calls (the no-genitores branch and the with-genitores branch), add (right after `itensCobertosConferencia,`):

```js
      itensComConferenciaConsultorasPreenchida,
```

In **both** `etapas` arrays' `numero: 1` `progresso` object, add:

```js
        itens_com_conferencia_consultoras: itensComConferenciaConsultorasPreenchida,
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido.test.js`
Expected: PASS (all 6 tests).

- [ ] **Step 15: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "feat(dashboard): novo critério da Etapa 1 — Ficha de Conferência Consultoras preenchida"
```

---

### Task 6: Backend — expor `conferencia_consultoras_preenchida` em `itensPorGenitor`

**Files:**
- Modify: `backend/src/services/dashboardService.js` (function `buscarFluxoPedido`, `itensPorGenitor` query and mapping)

**Interfaces:**
- Modifies: each item in `pre_agendamentos[].itens` now also has `conferencia_consultoras_preenchida`, consumed by `EtapaConferencia.jsx`'s `acaoFichaConferencia` call (Task 9/10).

This is a column addition to an already-tested query path (no test currently asserts on the exact shape of `itensPorGenitor` rows beyond what's already covered), so this task is implementation-only, verified by the existing suite staying green.

- [ ] **Step 1: Modify the query**

In `backend/src/services/dashboardService.js`, inside `buscarFluxoPedido`, the `itensPorGenitor` query (in `const [{ rows: itensPorGenitor }, { rows: herdeirosRaw }] = await Promise.all([...])`) currently selects:

```js
              (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
              (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
```

Change to:

```js
              (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
              (os.dados_conferencia_consultoras IS NOT NULL) AS conferencia_consultoras_preenchida,
              (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
```

- [ ] **Step 2: Modify the row mapping**

In the loop right below (`for (const item of itensPorGenitor) { itensPorAg[...].push({...}) }`), add a field:

```js
    itensPorAg[item.agendamento_id].push({
      pedido_item_id: item.pedido_item_id,
      descricao: item.descricao,
      ordem: item.ordem,
      medidas: item.medidas,
      tipo_confeccao: item.tipo_confeccao,
      ordem_servico_id: item.ordem_servico_id,
      confeccao_preenchida: item.confeccao_preenchida,
      conferencia_consultoras_preenchida: item.conferencia_consultoras_preenchida,
      ficha_preenchida: item.ficha_preenchida,
    });
```

- [ ] **Step 3: Run the full backend suite to confirm no regression**

Run: `cd backend && npm test`
Expected: PASS — no existing test asserts on the absence of this field.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "feat(dashboard): expor conferencia_consultoras_preenchida em itensPorGenitor"
```

---

### Task 7: Frontend — parameterizar `FichaConfeccaoCortina.jsx`/`FichaConfeccaoForro.jsx` com `modo`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx`
- Modify: `frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: both components now accept an optional `modo` prop (`"confeccao"` default | `"conferencia_consultoras"`), consumed by the new wrapper in Task 8.

No automated tests (frontend-web has no test runner). Verified manually in Task 14.

- [ ] **Step 1: Update `FichaConfeccaoCortina.jsx`**

Change the function signature and the 3 spots that hardcode "confecção":

```js
export default function FichaConfeccaoCortina({ osData, modo = "confeccao", onSalvar, onVoltar }) {
  const campoDados = modo === "conferencia_consultoras" ? "dados_conferencia_consultoras" : "dados_confeccao";
  const endpointSalvar = modo === "conferencia_consultoras" ? "conferencia-consultoras" : "confeccao";
  const tituloPagina = modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras — Cortina" : "Ficha de Confecção — Cortina";
  const labelSalvar = modo === "conferencia_consultoras" ? "Salvar Ficha de Conferência Consultoras" : "Salvar Ficha de Confecção";

  const [dados, setDados] = useState(() => {
    const salvos = osData[campoDados] || {};
    const alturaPadrao = osData.item_altura != null && osData.item_altura !== ""
      ? formatNumeroBR(osData.item_altura)
      : (partesMedidas(osData.item_medidas)[1] || "");
    const nomeTecidoPadrao = `${osData.item_referencia || ""}${osData.item_cor ? ` (${osData.item_cor})` : ""}`.trim();
    return { ...VAZIO, alturaCortina: alturaPadrao, nomeTecido: nomeTecidoPadrao, ...salvos };
  });
```

Update `salvar()`'s API call and success message:

```js
    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/${endpointSalvar}`, dados);
      setSucesso(`${modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras" : "Ficha de Confecção"} salva com sucesso!`);
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha.");
    } finally {
      setSalvando(false);
    }
```

Update the header markup:

```jsx
            <h1 className="os-page-title">{tituloPagina}</h1>
```

```jsx
          <button className="os-btn os-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : `✓ ${labelSalvar}`}
          </button>
```

- [ ] **Step 2: Update `FichaConfeccaoForro.jsx`** (mirrors Step 1)

```js
export default function FichaConfeccaoForro({ osData, modo = "confeccao", onSalvar, onVoltar }) {
  const campoDados = modo === "conferencia_consultoras" ? "dados_conferencia_consultoras" : "dados_confeccao";
  const endpointSalvar = modo === "conferencia_consultoras" ? "conferencia-consultoras" : "confeccao";
  const tituloPagina = modo === "conferencia_consultoras" ? "Ficha de Conferência Consultoras — Forro" : "Ficha de Confecção — Forro";
  const labelSalvar = modo === "conferencia_consultoras" ? "Salvar Ficha de Conferência Consultoras" : "Salvar Ficha de Confecção";

  const [dados, setDados] = useState({ ...VAZIO, ...(osData[campoDados] || {}) });
```

Same `salvar()`, title and button label changes as Step 1, applied to this file's equivalent lines.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx
git commit -m "feat(pedidos): parametrizar FichaConfeccaoCortina/Forro com modo conferencia_consultoras"
```

---

### Task 8: Frontend — nova página `FichaConferenciaConsultoras` + rota

**Files:**
- Create: `frontend-web/src/pages/pedidos/FichaConferenciaConsultoras.jsx`
- Modify: `frontend-web/src/App.jsx`

**Interfaces:**
- Consumes: `FichaConfeccaoCortina`/`FichaConfeccaoForro` with `modo="conferencia_consultoras"` (Task 7).
- Produces: route `/pedidos/os/:osId/conferencia-consultoras`, consumed by `EtapaDadosPedido.jsx` (Task 11) and `OrdemServicoPage.jsx`/`FichaTecnicaInstalador.jsx` banners (Tasks 12-13).

- [ ] **Step 1: Create the wrapper component**

```jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import FichaConfeccaoCortina from "./FichaConfeccaoCortina";
import FichaConfeccaoForro from "./FichaConfeccaoForro";
import "./OrdemServicoModal.css";

export default function FichaConferenciaConsultoras() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const voltarAgendamentoId = location.state?.voltarConferenciaAgendamentoId || null;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [osData, setOsData] = useState(null);

  useEffect(() => { carregar(); }, [osId]);

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  function voltar() {
    if (voltarAgendamentoId) {
      navigate("/agendamentos", { state: { reabrirConferenciaAgendamentoId: voltarAgendamentoId } });
    } else {
      navigate("/pedidos");
    }
  }

  if (loading) {
    return (
      <div className="ek-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="os-spinner" />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando ficha de conferência consultoras...</p>
        </div>
      </div>
    );
  }

  if (erro || !osData) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger">{erro || "Ordem de serviço não encontrada."}</div>
        <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
      </div>
    );
  }

  if (osData.tipo === "forro") {
    return <FichaConfeccaoForro osData={osData} modo="conferencia_consultoras" onSalvar={voltar} onVoltar={voltar} />;
  }
  return <FichaConfeccaoCortina osData={osData} modo="conferencia_consultoras" onSalvar={voltar} onVoltar={voltar} />;
}
```

- [ ] **Step 2: Register the route**

In `frontend-web/src/App.jsx`, add the lazy import (right after `const FichaConfeccao = lazy(() => import("./pages/pedidos/FichaConfeccao"));`):

```js
const FichaConferenciaConsultoras = lazy(() => import("./pages/pedidos/FichaConferenciaConsultoras"));
```

Add the route (right after `<Route path="/pedidos/os/:osId/confeccao" element={<FichaConfeccao />} />`, inside the same `PermissionRoute` block):

```jsx
                  <Route path="/pedidos/os/:osId/conferencia-consultoras" element={<FichaConferenciaConsultoras />} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConferenciaConsultoras.jsx frontend-web/src/App.jsx
git commit -m "feat(pedidos): página e rota da Ficha de Conferência Consultoras"
```

---

### Task 9: Frontend — `utils/fichaConferencia.js` usa o novo gate

**Files:**
- Modify: `frontend-web/src/utils/fichaConferencia.js`

**Interfaces:**
- Modifies: `acaoFichaConferencia(item)` now reads `item.conferencia_consultoras_preenchida` instead of `item.confeccao_preenchida`, and returns `null` (instead of a "Preencher Ficha de Confecção" action) when it isn't filled yet.
- Consumed by: `EtapaConferencia.jsx` and `Agendamentos.jsx`'s `ConferenciaItensModal` (Task 10).

- [ ] **Step 1: Update the function**

```js
export function acaoFichaConferencia(item) {
  if (!item.tipo_confeccao) return null;
  if (item.ficha_preenchida) return { label: "Visualizar Ficha", rota: "tecnica" };
  if (item.conferencia_consultoras_preenchida) return { label: "Conferência Técnica", rota: "tecnica" };
  return null;
}
```

(`abrirOsDoItem` stays unchanged.)

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/utils/fichaConferencia.js
git commit -m "feat(pedidos): acaoFichaConferencia depende de conferencia_consultoras_preenchida"
```

---

### Task 10: Frontend — mensagens de "aguardando Conferência Consultoras"

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx` (`ConferenciaItensModal`)

**Interfaces:**
- Consumes: `acaoFichaConferencia` (Task 9) returning `null`, plus the raw `item.tipo_confeccao` field already present on both items' shapes.

- [ ] **Step 1: Update `EtapaConferencia.jsx`**

Replace the existing fallback span (currently `<span ...>Sem ficha de confecção</span>` inside the `{acao ? (...) : (...)}` ternary) with:

```jsx
                        {acao ? (
                          <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                            disabled={criandoId === item.pedido_item_id}
                            onClick={async () => {
                              setCriandoId(item.pedido_item_id);
                              try {
                                const osId = await abrirOsDoItem(item);
                                navigate(acao.rota === "confeccao" ? `/pedidos/os/${osId}/confeccao` : `/pedidos/os/${osId}`);
                              } finally {
                                setCriandoId(null);
                              }
                            }}>
                            {criandoId === item.pedido_item_id ? "Abrindo..." : acao.label}
                          </button>
                        ) : item.tipo_confeccao ? (
                          <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Aguardando Conferência Consultoras (Etapa 1)</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Sem ficha de confecção</span>
                        )}
```

- [ ] **Step 2: Update `Agendamentos.jsx`'s `ConferenciaItensModal`**

Change the label ternary inside the items list button:

```jsx
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.ficha_preenchida ? "#22c55e" : "#94a3b8" }}>
                    {ocupado ? "Abrindo..." : (acao ? acao.label : (item.tipo_confeccao ? "Aguardando Conferência Consultoras (Etapa 1)" : "Sem ficha de confecção"))}
                  </span>
```

- [ ] **Step 3: Commit**

```bash
git add "frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx" "frontend-web/src/pages/agendamentos/Agendamentos.jsx"
git commit -m "feat(pedidos): mensagem de aguardando Conferência Consultoras na Etapa 2"
```

---

### Task 11: Frontend — Etapa 1 ganha o novo critério e a seção de preenchimento

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

**Interfaces:**
- Consumes: `GET /pedidos/:id/itens-pendentes-conferencia-consultoras` (Task 3), `etapas[0].progresso.itens_com_conferencia_consultoras`/`total_itens_conferencia` (Task 5), `abrirOsDoItem` (existing util, already imported indirectly — see Step 2).

- [ ] **Step 1: Add state + fetch for pending items**

Add `useEffect` to the import line, import `abrirOsDoItem` (already used the same way in `EtapaConferencia.jsx`), and add new state plus the fetch function:

```js
import React, { useState, useEffect } from "react";
import { abrirOsDoItem } from "../../../../utils/fichaConferencia";
```

```js
  const [definindoConferencia, setDefinindoConferencia] = useState(false);
  const [pendentesConsultoras, setPendentesConsultoras] = useState([]);
  const [carregandoPendentes, setCarregandoPendentes] = useState(true);
  const [abrindoItemId, setAbrindoItemId] = useState(null);

  useEffect(() => {
    let ativo = true;
    setCarregandoPendentes(true);
    api.get(`/pedidos/${pedidoId}/itens-pendentes-conferencia-consultoras`)
      .then((res) => { if (ativo) setPendentesConsultoras(res.itens || []); })
      .finally(() => { if (ativo) setCarregandoPendentes(false); });
    return () => { ativo = false; };
  }, [pedidoId]);
```

- [ ] **Step 2: Add the navigation handler**

```js
  async function preencherConferenciaConsultoras(item) {
    setAbrindoItemId(item.pedido_item_id);
    try {
      const osId = await abrirOsDoItem(item);
      navigate(`/pedidos/os/${osId}/conferencia-consultoras`);
    } finally {
      setAbrindoItemId(null);
    }
  }
```

(`abrirOsDoItem` reads `item.ordem_servico_id` first and falls back to `POST /os` with `item.pedido_item_id` — exactly the two fields the new endpoint from Task 3 returns.)

- [ ] **Step 3: Add the new criterion to "Critérios de conclusão"**

Right after the existing `CriterioItem` for `todasConferenciasFeitasOuDesnecessarias` (inside the `<div style={{ marginBottom: 20 }}>` block), add:

```jsx
            <CriterioItem
              ok={(p.total_itens_conferencia ?? 0) === 0 || (p.itens_com_conferencia_consultoras ?? 0) >= (p.total_itens_conferencia ?? 0)}
              texto={`Todos os itens com Conferência Consultoras preenchida (${p.itens_com_conferencia_consultoras ?? 0}/${p.total_itens_conferencia ?? 0})`}
            />
```

- [ ] **Step 4: Add the new "CONFERÊNCIA CONSULTORAS" section**

Right before the existing `<hr className="pf-separador" />` that precedes "DATA DE CONFERÊNCIA" (the one right after the `ambientes_canais_insuficientes` block), add:

```jsx
          {(p.total_itens_conferencia ?? 0) > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14 }}>CONFERÊNCIA CONSULTORAS</div>

              {!carregandoPendentes && pendentesConsultoras.length === 0 && (
                <div style={{ color: "var(--pf-badge-ok-text)", fontSize: 13, marginBottom: 12 }}>
                  Todos os itens já têm Conferência Consultoras preenchida.
                </div>
              )}

              {pendentesConsultoras.map((item) => (
                <div key={item.pedido_item_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.descricao}</div>
                    {item.ambiente && <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{item.ambiente}</div>}
                  </div>
                  <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                    disabled={abrindoItemId === item.pedido_item_id}
                    onClick={() => preencherConferenciaConsultoras(item)}>
                    {abrindoItemId === item.pedido_item_id ? "Abrindo..." : "Preencher Conferência Consultoras"}
                  </button>
                </div>
              ))}
            </>
          )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): Etapa 1 ganha critério e seção de Ficha de Conferência Consultoras"
```

---

### Task 12: Frontend — `OrdemServicoPage.jsx` (Conferência Técnica web) usa o novo gate

**Files:**
- Modify: `frontend-web/src/pages/pedidos/OrdemServicoPage.jsx`

- [ ] **Step 1: Update the blocking banner**

Replace the block that checks `!osData.dados_confeccao` (currently navigates to `/pedidos/os/${osId}/confeccao` with label "Preencher Ficha de Confecção"):

```jsx
  if (!osData.dados_conferencia_consultoras) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger" style={{ marginBottom: 16 }}>
          Aguardando a Ficha de Conferência Consultoras. A conferência técnica só pode ser preenchida depois que a consultora preencher a Ficha de Conferência Consultoras deste item, na Etapa 1 do pedido.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
          <button
            className="os-btn os-btn-primary"
            onClick={() => navigate(`/pedidos/os/${osId}/conferencia-consultoras`, { state: { voltarConferenciaAgendamentoId: voltarAgendamentoId } })}
          >
            Preencher Ficha de Conferência Consultoras
          </button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Update the reference panel**

```js
  const camposConfeccao = painelConfeccao(osData.dados_conferencia_consultoras, osData.tipo);
```

```jsx
            <div className="os-section-title">Ficha de Conferência Consultoras (referência)</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/OrdemServicoPage.jsx
git commit -m "feat(pedidos): Conferência Técnica web bloqueia por dados_conferencia_consultoras"
```

---

### Task 13: Frontend — `FichaTecnicaInstalador.jsx` (PWA) usa o novo gate

**Files:**
- Modify: `frontend-instalador/src/pages/FichaTecnicaInstalador.jsx`

- [ ] **Step 1: Update the blocking banner**

Replace the `!osData.dados_confeccao` block:

```jsx
  if (!osData.dados_conferencia_consultoras) {
    return (
      <>
        <TopBar title="Conferência Técnica" back />
        <div className="page">
          <div className="banner banner-warning">
            Aguardando a Ficha de Conferência Consultoras. A consultora ainda não preencheu a Ficha de Conferência Consultoras deste item, na Etapa 1 do pedido.
          </div>
        </div>
      </>
    );
  }
```

- [ ] **Step 2: Update the reference panel**

```js
  const campos = painelConfeccao(osData.dados_conferencia_consultoras, osData.tipo);
```

```jsx
          <h3 style={{ marginTop: 0 }}>Ficha de Conferência Consultoras (referência)</h3>
```

- [ ] **Step 3: Commit**

```bash
git add frontend-instalador/src/pages/FichaTecnicaInstalador.jsx
git commit -m "feat(instalador): Conferência Técnica do PWA bloqueia por dados_conferencia_consultoras"
```

---

### Task 14: Verificação manual no navegador

No automated test covers the end-to-end UI flow (frontend-web has no test runner). Before considering this feature done:

- [ ] **Step 1: Start the backend and frontend-web dev servers**

Run: `cd backend && npm run dev` (in one terminal) and `cd frontend-web && npm run dev` (in another).

- [ ] **Step 2: Walk the flow on a pedido with an item that needs conferência**

1. Open a pedido whose item's categoria has `necessita_conferencia = true` (e.g. Cortina) at Etapa 1.
2. Confirm the new criterion "Todos os itens com Conferência Consultoras preenchida (0/1)" shows ⭕, and the new "CONFERÊNCIA CONSULTORAS" section lists the item with a "Preencher Conferência Consultoras" button.
3. Click it, fill the form (same fields as Ficha de Confecção), save. Confirm it navigates back to Etapa 1 and the criterion now shows ✅ "(1/1)" and the section says "Todos os itens já têm Conferência Consultoras preenchida."
4. Go to Etapa 2 (or open the agendamento's "Itens para conferência" modal) for that item — confirm it now offers "Conferência Técnica" (not "Preencher Ficha de Confecção").
5. Open the Conferência Técnica for that item and confirm the reference panel shows the data just filled, then save the técnica fields.
6. As a regression check: pick a pedido item that still has `conferencia_consultoras` unfilled and confirm Etapa 2 shows "Aguardando Conferência Consultoras (Etapa 1)" instead of a clickable action, and that `PUT /os/:id` (Conferência Técnica) returns 400 if called directly against that OS.

- [ ] **Step 3: Report results to the user**

Summarize pass/fail for each of the 6 checks above before declaring the feature complete.
