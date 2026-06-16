# Categorização Automática de Modelo + Seleção de Tipo de Persiana — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durante a importação de pedidos, detectar automaticamente modelo (Cortinas/Forros) e acionamento (Cortinas/Forros/Persianas) a partir da descrição do item; e, no fluxo do pedido (Etapa 1), oferecer um botão condicional para selecionar modelo/tubo/bandô de persianas que ainda não têm modelo definido.

**Architecture:** Backend (`pedidosRoutes.js`, `dashboardService.js`) ganha funções puras de detecção por keyword + um novo endpoint `PATCH /pedidos/:id/itens/:itemId/modelo` (transação + registro em `pedido_auditoria`) + um novo campo `itens_persiana_pendentes` no `progresso` da etapa 1. Frontend (`EtapaDadosPedido.jsx`) ganha um botão condicional que abre um novo modal `SelecionarTipoPersianaModal.jsx`, reaproveitando o componente órfão `ModeloSelectorPanel.jsx` e o catálogo `importKeywordConfig.js`.

**Tech Stack:** Node.js + Express + `pg` (backend, testado com Jest + Supertest), React + Vite (frontend, sem suíte de testes — verificação manual no navegador).

**Spec:** `docs/superpowers/specs/2026-06-13-categorizacao-modelo-persiana-design.md`

---

### Task 1: Detecção automática de modelo/acionamento em `/importar-texto`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`
- Test: `backend/src/__tests__/pedidosRoutes.importarTexto.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/pedidosRoutes.importarTexto.test.js`:

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

const TEXTO = [
  "#\tAmbiente\tReferência\tCor\tProduto\tMedidas\tQtde\tUn\tPreço\tTotal",
  "1\tSala\t\t\tCORTINA WAVE COM BARRA DE 30CM - ACIONAMENTO MOTORIZADO\t2,00x2,50\t1\tM2\t100,00\t100,00",
  "2\tSala\t\t\tFORRO BLACKOUT FRANZIDO - ACIONAMENTO MANUAL\t2,00x2,50\t1\tM2\t100,00\t100,00",
  "3\tQuarto\t\t\tPERSIANA HUNTER DOUGLAS TELA SOLAR 3% - ACIONAMENTO MANUAL\t1,20x1,50\t1\tUN\t100,00\t100,00",
  "4\tQuarto\t\t\tTRILHO PARA CORTINA - 2,50M\t2,50x1,00\t1\tUN\t50,00\t50,00",
].join("\n");

describe('POST /api/pedidos/importar-texto — detecção de modelo/acionamento', () => {
  test('detecta modelo de cortina + acionamento motorizado', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, nome_lower: 'cortinas' },
        { id: 2, nome_lower: 'forros' },
        { id: 3, nome_lower: 'persianas' },
        { id: 4, nome_lower: 'trilhos e varões' },
      ],
    });

    const res = await request(app).post('/api/pedidos/importar-texto').send({ texto: TEXTO });

    expect(res.status).toBe(200);
    const [cortina, forro, persiana, trilho] = res.body.extraido.itens;

    expect(cortina.categoria_id).toBe(1);
    expect(cortina.modelo).toBe('Cortina Wave');
    expect(cortina.especificacoes).toEqual({ acionamento: 'motorizado' });

    expect(forro.categoria_id).toBe(2);
    expect(forro.modelo).toBe('Forro Franzido Blackout');
    expect(forro.especificacoes).toEqual({ acionamento: 'manual' });

    expect(persiana.categoria_id).toBe(3);
    expect(persiana.modelo).toBeNull();
    expect(persiana.especificacoes).toEqual({ acionamento: 'manual' });

    expect(trilho.categoria_id).toBe(4);
    expect(trilho.modelo).toBeNull();
    expect(trilho.especificacoes).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest pedidosRoutes.importarTexto -v`
Expected: FAIL — `cortina.modelo` is `undefined` (the route doesn't return `modelo`/`especificacoes` yet).

- [ ] **Step 3: Add detection helpers in `pedidosRoutes.js`**

In `backend/src/routes/pedidosRoutes.js`, immediately **before** the `// ─── rotas ──...` comment line (right after the closing `}` of `detectarNomeCategoriaPedido`), insert:

```js
// ─── Detecção de modelo/acionamento por keyword na descrição do item ────────
const MODELO_KEYWORDS_CORTINA = [
  { keywords: ["wave"],             modelo: "Cortina Wave"            },
  { keywords: ["prega macho"],      modelo: "Cortina Prega Macho"     },
  { keywords: ["prega americana"],  modelo: "Cortina Prega Americana" },
  { keywords: ["franzid"],          modelo: "Cortina Franzida"        },
];

const MODELO_KEYWORDS_FORRO = [
  { keywords: ["blackout"],   modelo: "Forro Franzido Blackout"   },
  { keywords: ["microfibra"], modelo: "Forro Franzido Microfibra" },
];

function detectarAcionamento(lower) {
  if (lower.includes("motoriza")) return "motorizado";
  if (lower.includes("manual"))   return "manual";
  return null;
}

function detectarModeloEEspecificacoes(descricao, nomeCategoria) {
  if (!descricao) return { modelo: null, especificacoes: null };
  const lower = descricao.toLowerCase();

  const acionamento = detectarAcionamento(lower);
  const especificacoes = acionamento ? { acionamento } : null;

  let candidatos = null;
  if (nomeCategoria === "Cortinas") candidatos = MODELO_KEYWORDS_CORTINA;
  else if (nomeCategoria === "Forros") candidatos = MODELO_KEYWORDS_FORRO;

  let modelo = null;
  if (candidatos) {
    for (const { keywords, modelo: nomeModelo } of candidatos) {
      if (keywords.some((k) => lower.includes(k))) { modelo = nomeModelo; break; }
    }
  }

  return { modelo, especificacoes };
}
```

- [ ] **Step 4: Wire detection into `itensComCategoria`**

In the same file, find the `itensComCategoria` map inside `POST /importar-texto`:

```js
    const itensComCategoria = itens.map((it) => {
      const nomeCategoria = detectarNomeCategoriaPedido(it.descricao);
      const categoria_id = nomeCategoria ? (catMap[nomeCategoria.toLowerCase()] ?? null) : null;
      return { ...it, categoria_id };
    });
```

Replace with:

```js
    const itensComCategoria = itens.map((it) => {
      const nomeCategoria = detectarNomeCategoriaPedido(it.descricao);
      const categoria_id = nomeCategoria ? (catMap[nomeCategoria.toLowerCase()] ?? null) : null;
      const { modelo, especificacoes } = detectarModeloEEspecificacoes(it.descricao, nomeCategoria);
      return { ...it, categoria_id, modelo, especificacoes };
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest pedidosRoutes.importarTexto -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.importarTexto.test.js
git commit -m "feat(pedidos): detecta modelo de cortina/forro e acionamento na importação"
```

---

### Task 2: Endpoint `PATCH /pedidos/:id/itens/:itemId/modelo`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`
- Test: `backend/src/__tests__/pedidosRoutes.modelo.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/pedidosRoutes.modelo.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
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

function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  client.query.mockResolvedValue({ rows: [] });
  return client;
}

describe('PATCH /api/pedidos/:id/itens/:itemId/modelo', () => {
  test('400 quando modelo ausente', async () => {
    const res = await request(app).patch('/api/pedidos/1/itens/11/modelo').send({});
    expect(res.status).toBe(400);
  });

  test('404 quando item nao pertence ao pedido/empresa', async () => {
    const client = makeClient([{ rows: [] }]); // ownership check vazio
    db.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/pedidos/1/itens/11/modelo')
      .send({ modelo: 'Rolo / Rollo' });

    expect(res.status).toBe(404);
    expect(client.release).toHaveBeenCalled();
  });

  test('200 atualiza modelo/especificacoes e registra auditoria', async () => {
    const client = makeClient([
      { rows: [{ id: 11, descricao: 'Persiana Sala' }] }, // ownership check
      { rows: [] },                                       // BEGIN
      { rows: [{ id: 11, modelo: 'Rolo / Rollo', especificacoes: { tubo: '38mm', bando: null } }] }, // UPDATE
      { rows: [] },                                       // INSERT pedido_auditoria
      { rows: [] },                                       // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/pedidos/1/itens/11/modelo')
      .send({ modelo: 'Rolo / Rollo', especificacoes: { tubo: '38mm', bando: null } });

    expect(res.status).toBe(200);
    expect(res.body.item).toEqual({ id: 11, modelo: 'Rolo / Rollo', especificacoes: { tubo: '38mm', bando: null } });
    expect(client.query.mock.calls[2][0]).toContain('UPDATE pedido_itens');
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO pedido_auditoria');
    expect(client.query.mock.calls[3][1]).toEqual(expect.arrayContaining(['categorizacao']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest pedidosRoutes.modelo -v`
Expected: FAIL — route `PATCH /:id/itens/:itemId/modelo` does not exist (404 "Cannot PATCH" / route not found for all three tests).

- [ ] **Step 3: Implement the endpoint**

In `backend/src/routes/pedidosRoutes.js`, immediately **after** the closing `});` of `router.patch("/:id/itens/:itemId/sem-vinculo", ...)` (and before the `// POST /pedidos/:id/pesquisa-satisfacao` comment), insert:

```js
router.patch("/:id/itens/:itemId/modelo", authMiddleware, async (req, res) => {
  const pedidoId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const empresaId = req.user.empresa_id;
  const { modelo, especificacoes } = req.body;

  if (!modelo || typeof modelo !== "string") {
    return res.status(400).json({ message: "Campo 'modelo' obrigatório." });
  }

  const client = await db.connect();
  try {
    const { rows: check } = await client.query(
      `SELECT pi.id, pi.descricao FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [itemId, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE pedido_itens SET modelo = $1, especificacoes = $2 WHERE id = $3
       RETURNING id, modelo, especificacoes`,
      [modelo, (typeof especificacoes === "object" && especificacoes !== null) ? especificacoes : null, itemId]
    );

    const partes = [`Modelo: "${modelo}"`];
    if (especificacoes?.tubo) partes.push(`Tubo: ${especificacoes.tubo}`);
    if (especificacoes?.bando) partes.push(`Bandô: ${especificacoes.bando}`);

    await auditSvc.registrarAuditoria(client, {
      pedidoId, empresaId, usuarioId: req.user.id,
      etapa: "dados_pedido",
      acao: "categorizacao",
      descricao: `${check[0].descricao} — ${partes.join(", ")}`,
    });
    await client.query("COMMIT");

    return res.json({ item: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar modelo do item." });
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest pedidosRoutes.modelo -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.modelo.test.js
git commit -m "feat(pedidos): endpoint PATCH /:id/itens/:itemId/modelo com auditoria"
```

---

### Task 3: `itens_persiana_pendentes` em `buscarFluxoPedido`

**Files:**
- Modify: `backend/src/services/dashboardService.js`
- Test: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const { buscarFluxoPedido } = require('../services/dashboardService');

afterEach(() => jest.clearAllMocks());

describe('buscarFluxoPedido — itens_persiana_pendentes', () => {
  test('inclui itens_persiana_pendentes no progresso da etapa 1', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, numero_sequencial: 1, numero_origem: null, status: 'pendente',
        verificacao_ok: false, categorizacao_ok: false, total: '0',
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
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 2 }] });           // itensPersianaPendentesRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(etapa1.progresso.itens_persiana_pendentes).toBe(2);

    const ultimaQuery = db.query.mock.calls[14][0];
    expect(ultimaQuery).toContain('Persianas');
    expect(ultimaQuery).toContain('modelo IS NULL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido -v`
Expected: FAIL — `etapa1.progresso.itens_persiana_pendentes` is `undefined`, and/or `db.query.mock.calls[14]` is `undefined` (only 14 calls happen today).

- [ ] **Step 3: Add the 9th query to the `Promise.all` in `buscarFluxoPedido`**

In `backend/src/services/dashboardService.js`, find the `Promise.all` block (8 queries: `totalItensRows` ... `produtoOkRows`) inside `buscarFluxoPedido`:

```js
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
```

Replace the destructuring with:

```js
  const [
    { rows: totalItensRows },
    { rows: itensCobertosRows },
    { rows: itensSemCatRows },
    { rows: itensSemVinculoRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
    { rows: produtoOkRows },
    { rows: itensPersianaPendentesRows },
  ] = await Promise.all([
```

Then find the closing `]);` of that same `Promise.all` — the last entry currently is:

```js
    db.query(
      `SELECT COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens
       WHERE pedido_id = $1`,
      [pedidoId]
    ),
  ]);
```

Add a new query entry right before the closing `]);`:

```js
    db.query(
      `SELECT COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens
       WHERE pedido_id = $1`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS pendentes
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = $1
         AND cat.nome = 'Persianas'
         AND pi.modelo IS NULL`,
      [pedidoId]
    ),
  ]);
```

- [ ] **Step 4: Compute `itensPersianaPendentes` and add it to both etapa-1 `progresso` objects**

Right after the line `const itensComProdutoOk = produtoOkRows[0]?.produto_ok ?? 0;`, add:

```js
  const itensPersianaPendentes = itensPersianaPendentesRows[0]?.pendentes ?? 0;
```

Then update **both** places that build the etapa-1 `progresso` object so they include `itens_persiana_pendentes`.

First, the "sem genitores" early-return branch (`etapas: [...]`, etapa `numero: 1`):

```js
        { numero: 1, concluida: etapa1_ok, progresso: { tem_anexo: anexos.length > 0, verificacao_ok: !!pedido.verificacao_ok, itens_sem_categoria: itensSemCategoria, itens_sem_vinculo: itensSemVinculo, total_itens: totalItens, itens_cobertos: itensCobertos } },
```

becomes:

```js
        { numero: 1, concluida: etapa1_ok, progresso: { tem_anexo: anexos.length > 0, verificacao_ok: !!pedido.verificacao_ok, itens_sem_categoria: itensSemCategoria, itens_sem_vinculo: itensSemVinculo, total_itens: totalItens, itens_cobertos: itensCobertos, itens_persiana_pendentes: itensPersianaPendentes } },
```

Second, the main `etapas` array further down (etapa `numero: 1`):

```js
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
```

becomes:

```js
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
        itens_persiana_pendentes: itensPersianaPendentes,
      },
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido -v`
Expected: PASS

- [ ] **Step 6: Run full backend suite to check nothing else broke**

Run: `cd backend && npx jest -v`
Expected: PASS (all existing tests, including `dashboardService.test.js`, still pass)

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "feat(pedidos): calcula itens_persiana_pendentes na etapa 1 do fluxo"
```

---

### Task 4: Novo modal `SelecionarTipoPersianaModal.jsx`

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx`

- [ ] **Step 1: Create the modal file**

Create `frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx`:

```jsx
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../../../services/api";
import ModeloSelectorPanel from "../../ModeloSelectorPanel";
import { KEYWORD_MODELS } from "../../importKeywordConfig";

const PERSIANA_CONFIG = KEYWORD_MODELS.find((k) => k.tipo === "persiana");

export default function SelecionarTipoPersianaModal({ pedidoId, onClose, onRecarregar }) {
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionandoItemId, setSelecionandoItemId] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      api.get(`/pedidos/${pedidoId}`),
      api.get("/categorias"),
    ])
      .then(([pedidoRes, catRes]) => {
        if (!ativo) return;
        setItens(pedidoRes.pedido?.itens || []);
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

  const persianas = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.nome === "Persianas"),
    [itens, categoriaPorId]
  );
  const pendentes = persianas.filter((it) => !it.modelo);
  const resolvidas = persianas.filter((it) => it.modelo);

  async function salvarTipo(itemId, valor) {
    try {
      await api.patch(`/pedidos/${pedidoId}/itens/${itemId}/modelo`, valor);
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, modelo: valor.modelo, especificacoes: valor.especificacoes } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao salvar tipo de persiana.");
    } finally {
      setSelecionandoItemId(null);
    }
  }

  function handleFechar() {
    onRecarregar?.();
    onClose();
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">🎛️ Selecionar Tipo de Persiana</div>
          <button className="pf-modal-fechar" onClick={handleFechar}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && persianas.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum item de Persianas neste pedido.
            </div>
          )}

          {pendentes.map((item) => (
            <div key={item.id} className="vim-row vim-com-ambiente">
              <span className="vim-desc">{item.descricao}</span>
              <span className="pf-badge pf-badge-pend">Sem tipo definido</span>
              <button className="pf-btn-secondary" onClick={() => setSelecionandoItemId(item.id)}>
                + Selecionar
              </button>
              {selecionandoItemId === item.id && (
                <ModeloSelectorPanel
                  tipo="persiana"
                  config={PERSIANA_CONFIG}
                  valor={{ modelo: item.modelo, especificacoes: item.especificacoes }}
                  onChange={(valor) => salvarTipo(item.id, valor)}
                  onClose={() => setSelecionandoItemId(null)}
                />
              )}
            </div>
          ))}

          {resolvidas.map((item) => (
            <div key={item.id} className="vim-row vim-com-ambiente">
              <span className="vim-desc">
                {item.descricao}{" "}
                <small style={{ opacity: .6 }}>
                  ({item.modelo}{item.especificacoes?.tubo ? `, tubo ${item.especificacoes.tubo}` : ""}{item.especificacoes?.bando ? `, ${item.especificacoes.bando}` : ""})
                </small>
              </span>
              <span className="pf-badge pf-badge-ok">Configurada</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          <span style={{ fontSize: 13, color: "var(--pf-card-sub)" }}>
            {resolvidas.length} de {persianas.length} persianas configuradas
          </span>
          <button className="pf-btn-primary" onClick={handleFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/SelecionarTipoPersianaModal.jsx
git commit -m "feat(pedidos): modal para selecionar modelo/tubo/bando de persianas pendentes"
```

(No automated frontend test suite exists in this repo — verification happens in Task 6.)

---

### Task 5: Botão condicional "🎛️ Selecionar Tipo" em `EtapaDadosPedido.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

- [ ] **Step 1: Add the import**

In `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`, find:

```js
import VincularItensModal from "./VincularItensModal";
```

Add right after it:

```js
import SelecionarTipoPersianaModal from "./SelecionarTipoPersianaModal";
```

- [ ] **Step 2: Add the new state**

Find:

```js
  const [vinculando, setVinculando] = useState(false);
```

Add right after it:

```js
  const [selecionandoTipo, setSelecionandoTipo] = useState(false);
```

- [ ] **Step 3: Add the conditional button**

Find:

```jsx
            <button className="pf-btn-secondary" onClick={() => setVinculando(true)}>🔗 Vincular Itens</button>
```

Add right after it:

```jsx
            {(p.itens_persiana_pendentes ?? 0) > 0 && (
              <button className="pf-btn-secondary" onClick={() => setSelecionandoTipo(true)}>
                🎛️ Selecionar Tipo ({p.itens_persiana_pendentes})
              </button>
            )}
```

- [ ] **Step 4: Render the new modal**

Find:

```jsx
      {vinculando && (
        <VincularItensModal
          pedidoId={pedidoId}
          onClose={() => setVinculando(false)}
          onRecarregar={onRecarregar}
        />
      )}
```

Add right after it (before the closing `</div>` of the component):

```jsx
      {selecionandoTipo && (
        <SelecionarTipoPersianaModal
          pedidoId={pedidoId}
          onClose={() => setSelecionandoTipo(false)}
          onRecarregar={onRecarregar}
        />
      )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): botão condicional Selecionar Tipo na Etapa 1 do fluxo"
```

---

### Task 6: Verificação manual no navegador

**Files:** none (manual QA only)

- [ ] **Step 1: Start backend and frontend dev servers**

Run (in two separate terminals):

```bash
cd backend && npm run dev
```

```bash
cd frontend-web && npm run dev
```

- [ ] **Step 2: Importar um pedido com cortina/forro/persiana**

No navegador, abra a tela de Pedidos → "Importar pedido". Cole um texto de pedido (formato tab-delimitado do PDF) contendo pelo menos:
- Um item de **Cortina** com "WAVE" e "ACIONAMENTO MOTORIZADO" na descrição.
- Um item de **Forro** com "BLACKOUT" e "ACIONAMENTO MANUAL" na descrição.
- Um item de **Persiana** com "ACIONAMENTO MANUAL" na descrição.

Anexe um PDF (obrigatório, subprojeto 1) e clique em "Processar texto →", revise e confirme a importação.

- [ ] **Step 3: Verificar persistência de modelo/acionamento**

Abra o pedido importado pelo fluxo (Etapa 1 "📋 Pedidos") → "✏️ Editar Pedido". Confirme que os itens de Cortina e Forro já vêm com o campo "Modelo" preenchido (ex: "Cortina Wave", "Forro Franzido Blackout").

- [ ] **Step 4: Verificar botão condicional "🎛️ Selecionar Tipo"**

Na Etapa 1 ("📋 Pedidos"), confirme que o botão **"🎛️ Selecionar Tipo (N)"** aparece ao lado de "🔗 Vincular Itens", com N = número de itens de Persianas sem modelo.

- [ ] **Step 5: Selecionar tipo de persiana**

Clique em "🎛️ Selecionar Tipo". No modal, clique em "+ Selecionar" no item de Persiana pendente. Escolha um Modelo (ex: "Rolo / Rollo"), um Tubo (ex: "38mm") e opcionalmente um Bandô/Caixa, e clique em "Aplicar".

Confirme que:
- O item migra da lista "pendentes" para "configuradas" dentro do próprio modal.
- O contador do rodapé atualiza (ex: "1 de 1 persianas configuradas").
- Ao fechar o modal, o botão "🎛️ Selecionar Tipo" desaparece da Etapa 1 (porque `itens_persiana_pendentes` voltou a 0 após `onRecarregar`).

- [ ] **Step 6: Verificar registro de auditoria**

Abra "🕘 Histórico" na Etapa 1 e confirme que existe um registro recente do tipo "categorização" mencionando a descrição do item e o modelo/tubo/bandô escolhidos.
