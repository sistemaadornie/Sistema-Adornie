# Dashboard de Pedidos + Fluxo Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar telas `/dashboard-pedidos` e `/pedidos/:id/fluxo`, novos endpoints de API com cálculo de estágio por pedido, e automação de status do pedido via agendamentos.

**Architecture:** Backend: `dashboardService.js` centraliza a lógica de estágio; novas rotas montadas em `dashboardRoutes.js` (GET /dashboard/pedidos) e em `pedidosRoutes.js` (GET /:id/fluxo, PATCH /:id/etapa). Frontend: hook `useDashboardPedidos` + páginas React com CSS puro para cards com barra de progresso e fluxograma horizontal com ramificações.

**Tech Stack:** Node.js/Express + pg pool, React 18 (lazy + Suspense), react-router-dom v6, CSS puro (sem biblioteca de gráficos), PostgreSQL migrations.

---

## File Map

| Ação | Caminho |
|---|---|
| Criar | `backend/src/database/migrations/dashboard_pedidos.sql` |
| Criar | `backend/src/services/dashboardService.js` |
| Criar | `backend/src/routes/dashboardRoutes.js` |
| Modificar | `backend/src/services/pedidoService.js` — adicionar `atualizarEtapa()` |
| Modificar | `backend/src/routes/pedidosRoutes.js` — GET /:id/fluxo + PATCH /:id/etapa |
| Modificar | `backend/src/services/agendamentoService.js` — automação em `criar()` + `atualizarStatus()` + suporte a `agendamento_pai_id` |
| Modificar | `backend/server.js` — registrar dashboardRoutes |
| Criar | `frontend-web/src/pages/dashboard/hooks/useDashboardPedidos.js` |
| Criar | `frontend-web/src/pages/dashboard/DashboardPedidos.jsx` |
| Criar | `frontend-web/src/pages/dashboard/DashboardPedidos.css` |
| Criar | `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` |
| Criar | `frontend-web/src/pages/pedidos/PedidoFluxo.css` |
| Modificar | `frontend-web/src/App.jsx` — lazy imports + rotas novas |
| Modificar | `frontend-web/src/components/Sidebar.jsx` — link Dashboard |

---

## Task 1: Migration SQL

**Files:**
- Criar: `backend/src/database/migrations/dashboard_pedidos.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- backend/src/database/migrations/dashboard_pedidos.sql

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS verificacao_ok   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categorizacao_ok BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_pedido_item ON agendamento_itens(pedido_item_id);

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS agendamento_pai_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pai ON agendamentos(agendamento_pai_id);

INSERT INTO permissoes (nome, descricao) VALUES
  ('DASHBOARD_PEDIDOS_GERAL', 'Visualiza dashboard com pedidos de todas as consultoras')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Aplicar a migration no banco**

```bash
psql $DATABASE_URL -f backend/src/database/migrations/dashboard_pedidos.sql
```

Esperado: `ALTER TABLE`, `CREATE INDEX`, `INSERT 0 1` (ou `INSERT 0 0` se permissão já existir). Sem erros.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/dashboard_pedidos.sql
git commit -m "feat(db): migration dashboard_pedidos — colunas verificacao_ok, categorizacao_ok, agendamento_pai_id, pedido_item_id"
```

---

## Task 2: dashboardService.js

**Files:**
- Criar: `backend/src/services/dashboardService.js`

- [ ] **Step 1: Criar o arquivo**

```js
"use strict";
const db = require("../database/db");

function calcNivelAlerta(diasParaPrazo) {
  if (diasParaPrazo == null) return null;
  if (diasParaPrazo <= 0)  return "atrasado";
  if (diasParaPrazo <= 7)  return "urgente";
  if (diasParaPrazo <= 14) return "atencao";
  return null;
}

async function listarPedidosDashboard(empresaId, userId, permissoes, filtros = {}) {
  const { consultora_id, status, alerta } = filtros;
  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const params = [empresaId];
  const conditions = ["p.empresa_id = $1"];

  if (!temPermGeral) {
    params.push(userId);
    conditions.push(`p.usuario_id = $${params.length}`);
  } else if (consultora_id) {
    params.push(Number(consultora_id));
    conditions.push(`p.usuario_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  const where = conditions.join(" AND ");

  const { rows: pedidos } = await db.query(
    `SELECT
       p.id,
       p.numero_sequencial,
       p.status,
       p.verificacao_ok,
       p.categorizacao_ok,
       p.total,
       p.criado_em,
       c.nome_completo                                          AS cliente_nome,
       u.nome_completo                                          AS consultor_nome,
       u.id                                                     AS consultor_id,
       COUNT(pi.id)                                             AS itens_count,
       EXISTS (
         SELECT 1 FROM pedido_anexos pa WHERE pa.pedido_id = p.id
       )                                                        AS pdf_ok,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pedido_itens pi_check WHERE pi_check.pedido_id = p.id)
           THEN true
         WHEN EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv
           JOIN pedido_itens pi2 ON pi2.id = piv.pedido_item_id
           WHERE pi2.pedido_id = p.id
         ) THEN true
         ELSE false
       END                                                      AS vinculos_ok
     FROM pedidos p
     LEFT JOIN clientes    c  ON c.id  = p.cliente_id
     LEFT JOIN usuarios    u  ON u.id  = p.usuario_id
     LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
     WHERE ${where}
     GROUP BY p.id, c.nome_completo, u.nome_completo, u.id
     ORDER BY p.criado_em DESC`,
    params
  );

  if (!pedidos.length) return [];

  const pedidoIds = pedidos.map((p) => p.id);

  // Genitores: agendamentos com pedido_id + itens de pedido vinculados
  const { rows: preAgs } = await db.query(
    `SELECT a.id, a.pedido_id, a.status, a.data_inicio, COUNT(ai.id) AS itens_count
     FROM agendamentos a
     JOIN agendamento_itens ai ON ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
     WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
     GROUP BY a.id`,
    [pedidoIds, empresaId]
  );

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

    return {
      id: p.id,
      numero_sequencial: p.numero_sequencial,
      status: p.status,
      cliente_nome: p.cliente_nome,
      consultor_nome: p.consultor_nome,
      total: p.total,
      itens_count: Number(p.itens_count),
      criado_em: p.criado_em,
      estagio: {
        pdf_ok: p.pdf_ok,
        verificacao_ok: p.verificacao_ok,
        categorizacao_ok: p.categorizacao_ok,
        vinculos_ok: p.vinculos_ok,
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

async function buscarFluxoPedido(pedidoId, empresaId, userId, permissoes) {
  const { rows: pedidos } = await db.query(
    `SELECT p.id, p.numero_sequencial, p.status, p.verificacao_ok, p.categorizacao_ok,
            p.total, p.criado_em,
            c.nome_completo AS cliente_nome,
            u.nome_completo AS consultor_nome,
            u.id            AS consultor_id
     FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN usuarios u ON u.id = p.usuario_id
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
  if (!temPermGeral && pedido.consultor_id !== userId) {
    const err = new Error("Acesso negado");
    err.status = 403;
    throw err;
  }

  const [{ rows: anexos }, { rows: vinculos }, { rows: allItems }] = await Promise.all([
    db.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
    db.query(
      `SELECT 1 FROM pedido_item_vinculos piv
       JOIN pedido_itens pi ON pi.id = piv.pedido_item_id
       WHERE pi.pedido_id = $1 LIMIT 1`,
      [pedidoId]
    ),
    db.query(`SELECT 1 FROM pedido_itens WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
  ]);

  const { rows: genitoresRaw } = await db.query(
    `SELECT a.id, a.status, a.tipo, a.data_inicio
     FROM agendamentos a
     WHERE a.pedido_id = $1 AND a.empresa_id = $2
       AND EXISTS (
         SELECT 1 FROM agendamento_itens ai
         WHERE ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
       )
     ORDER BY a.data_inicio`,
    [pedidoId, empresaId]
  );

  const vinculos_ok = allItems.length === 0 || vinculos.length > 0;
  const estagio_base = {
    pdf_ok: anexos.length > 0,
    verificacao_ok: pedido.verificacao_ok,
    categorizacao_ok: pedido.categorizacao_ok,
    vinculos_ok,
  };

  if (!genitoresRaw.length) {
    return {
      pedido,
      estagio: { ...estagio_base, pre_agendamentos: [], proximo_prazo: null, dias_para_prazo: null, nivel_alerta: null },
      pre_agendamentos: [],
    };
  }

  const genitoreIds = genitoresRaw.map((g) => g.id);

  const [{ rows: itensPorGenitor }, { rows: herdeirosRaw }] = await Promise.all([
    db.query(
      `SELECT ai.agendamento_id, ai.pedido_item_id, pi.descricao
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
      [genitoreIds]
    ),
    db.query(
      `SELECT id, agendamento_pai_id, tipo, status, data_inicio
       FROM agendamentos
       WHERE agendamento_pai_id = ANY($1) AND empresa_id = $2
       ORDER BY data_inicio`,
      [genitoreIds, empresaId]
    ),
  ]);

  const itensPorAg = {};
  for (const item of itensPorGenitor) {
    if (!itensPorAg[item.agendamento_id]) itensPorAg[item.agendamento_id] = [];
    itensPorAg[item.agendamento_id].push({ pedido_item_id: item.pedido_item_id, descricao: item.descricao });
  }

  const herdeirosporPai = {};
  for (const h of herdeirosRaw) {
    if (!herdeirosporPai[h.agendamento_pai_id]) herdeirosporPai[h.agendamento_pai_id] = [];
    herdeirosporPai[h.agendamento_pai_id].push({ id: h.id, tipo: h.tipo, status: h.status, data_inicio: h.data_inicio });
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

  return {
    pedido,
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

module.exports = { listarPedidosDashboard, buscarFluxoPedido };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "feat(backend): dashboardService — listarPedidosDashboard + buscarFluxoPedido"
```

---

## Task 3: dashboardRoutes.js

**Files:**
- Criar: `backend/src/routes/dashboardRoutes.js`

- [ ] **Step 1: Criar o arquivo de rota**

```js
"use strict";
const express = require("express");
const router  = express.Router();
const auth    = require("../middlewares/authMiddleware");
const svc     = require("../services/dashboardService");

router.get("/pedidos", auth, async (req, res) => {
  try {
    const filtros = {
      consultora_id: req.query.consultora_id || null,
      status:        req.query.status        || null,
      alerta:        req.query.alerta        || null,
    };
    const result = await svc.listarPedidosDashboard(
      req.user.empresa_id, req.user.id, req.user.permissoes, filtros
    );
    return res.json({ pedidos: result });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar dashboard" });
  }
});

module.exports = router;
```

> **Nota:** o nome do arquivo de middleware pode ser `authMiddleware.js` ou `auth.js`. Verifique o caminho exato em `backend/src/middlewares/` e ajuste o `require` se necessário.

- [ ] **Step 2: Verificar nome do middleware de autenticação**

```bash
ls backend/src/middlewares/
```

Ajuste o `require` na linha 4 para o nome correto encontrado.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/dashboardRoutes.js
git commit -m "feat(backend): dashboardRoutes — GET /api/dashboard/pedidos"
```

---

## Task 4: Registrar dashboardRoutes em server.js

**Files:**
- Modificar: `backend/server.js`

- [ ] **Step 1: Adicionar require após a última linha de requires de rotas (linha ~49)**

Localizar o bloco de requires de rotas (termina em `const prazosRoutes = require("./src/routes/prazosRoutes");`) e adicionar logo abaixo:

```js
const dashboardRoutes    = require("./src/routes/dashboardRoutes");
```

- [ ] **Step 2: Adicionar montagem da rota após linha `app.use("/api/pedidos", pedidosRoutes)` (~linha 148)**

```js
app.use("/api/dashboard",     dashboardRoutes);
```

- [ ] **Step 3: Verificar que o servidor reinicia sem erros**

```bash
cd backend && node server.js
```

Esperado: `Servidor rodando na porta...` sem erros de require.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): registra dashboardRoutes em server.js"
```

---

## Task 5: pedidoService.atualizarEtapa()

**Files:**
- Modificar: `backend/src/services/pedidoService.js`

- [ ] **Step 1: Localizar o final do arquivo onde ficam os exports**

```bash
grep -n "module.exports" backend/src/services/pedidoService.js
```

- [ ] **Step 2: Adicionar função `atualizarEtapa` ANTES do module.exports**

```js
async function atualizarEtapa(pedidoId, empresaId, userId, permissoes, campo, valor) {
  const CAMPOS_VALIDOS = ["verificacao_ok", "categorizacao_ok"];
  if (!CAMPOS_VALIDOS.includes(campo)) {
    const err = new Error("Campo inválido");
    err.status = 400;
    throw err;
  }

  const { rows } = await db.query(
    `SELECT usuario_id FROM pedidos WHERE id = $1 AND empresa_id = $2`,
    [pedidoId, empresaId]
  );
  if (!rows.length) {
    const err = new Error("Pedido não encontrado");
    err.status = 404;
    throw err;
  }

  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  if (!temPermGeral && rows[0].usuario_id !== userId) {
    const err = new Error("Acesso negado");
    err.status = 403;
    throw err;
  }

  await db.query(
    `UPDATE pedidos SET ${campo} = $1 WHERE id = $2 AND empresa_id = $3`,
    [valor, pedidoId, empresaId]
  );

  return { [campo]: valor };
}
```

- [ ] **Step 3: Adicionar `atualizarEtapa` ao module.exports**

Localizar a linha do `module.exports = { ... }` no final do arquivo e adicionar `atualizarEtapa` à lista.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/pedidoService.js
git commit -m "feat(backend): pedidoService.atualizarEtapa — toggle verificacao_ok / categorizacao_ok"
```

---

## Task 6: pedidosRoutes.js — GET /:id/fluxo + PATCH /:id/etapa

**Files:**
- Modificar: `backend/src/routes/pedidosRoutes.js`

- [ ] **Step 1: Adicionar require do dashboardService e pedidoService no topo do arquivo**

Localizar os `require` existentes no topo de `pedidosRoutes.js` e adicionar:

```js
const dashboardSvc = require("../services/dashboardService");
```

O `pedidoService` já deve estar importado; confirme com:

```bash
grep -n "pedidoService\|pedidoSvc\|svc" backend/src/routes/pedidosRoutes.js | head -5
```

Use o mesmo nome de variável que o arquivo já usa para o service.

- [ ] **Step 2: Adicionar as duas novas rotas ANTES da linha `module.exports = router`**

```js
// GET /api/pedidos/:id/fluxo
router.get("/:id/fluxo", auth, async (req, res) => {
  try {
    const result = await dashboardSvc.buscarFluxoPedido(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.user.permissoes
    );
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar fluxo" });
  }
});

// PATCH /api/pedidos/:id/etapa
router.patch("/:id/etapa", auth, async (req, res) => {
  try {
    const { campo, valor } = req.body;
    if (!campo || valor === undefined) {
      return res.status(400).json({ message: "campo e valor são obrigatórios" });
    }
    const result = await pedidoSvc.atualizarEtapa(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.user.permissoes,
      campo,
      valor
    );
    return res.json({ message: "Etapa atualizada", ...result });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar etapa" });
  }
});
```

> **Nota:** substitua `pedidoSvc` pelo nome exato que o arquivo usa para referenciar o pedidoService (verificado no Step 1).

> **Nota:** `auth` é a variável do authMiddleware — confirme o nome exato que o arquivo já usa nas outras rotas.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(backend): pedidosRoutes — GET /:id/fluxo + PATCH /:id/etapa"
```

---

## Task 7: agendamentoService.js — Automação de Status

**Files:**
- Modificar: `backend/src/services/agendamentoService.js`

### 7a — Suporte a `agendamento_pai_id` no INSERT de `criar()`

- [ ] **Step 1: Localizar o INSERT de agendamentos dentro de `criar()` (~linha 386)**

Encontrar o bloco:
```js
const result = await client.query(
  `
  INSERT INTO agendamentos
    (empresa_id, titulo, cliente, tipo, data, hora, endereco, cep, rua, numero, complemento,
     bairro, cidade, estado, descricao, observacoes, status, criado_por, duracao_minutos, pessoa_obrigatoria_id)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$20,$17,$18,$19)
  RETURNING id
  `,
```

- [ ] **Step 2: Substituir pelo INSERT que inclui `agendamento_pai_id`**

Adicionar `agendamento_pai_id` à lista de colunas e valores. Localizar a desestruturação de `dados` no início de `criar()` e adicionar `agendamento_pai_id`:

```js
// Na desestruturação no início de criar() (~linha 330), adicionar:
agendamento_pai_id = null,
```

Alterar o INSERT para:
```js
const result = await client.query(
  `
  INSERT INTO agendamentos
    (empresa_id, titulo, cliente, tipo, data, hora, endereco, cep, rua, numero, complemento,
     bairro, cidade, estado, descricao, observacoes, status, criado_por, duracao_minutos,
     pessoa_obrigatoria_id, agendamento_pai_id)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$20,$17,$18,$19,$21)
  RETURNING id
  `,
  [empresaId, titulo, cliente, tipo||"Instalação", data, hora||null,
   endereco||null, cep||null, rua||null, numero||null, complemento||null,
   bairro||null, cidade||null, estado||null, descricao||null, observacoes||null,
   userId, duracao_minutos||null, pessoa_obrigatoria_id||null, statusFinal,
   agendamento_pai_id||null]
);
```

### 7b — Auto-update de pedido para `em_andamento` ao criar genitor

- [ ] **Step 3: Adicionar lógica após `await client.query("COMMIT")` em `criar()` (~linha 419)**

Localizar:
```js
    await client.query("COMMIT");

    if (aprovacao) {
```

Inserir entre o COMMIT e o bloco `if (aprovacao)`:

```js
    await client.query("COMMIT");

    // Auto-transição: pedido pendente → em_andamento ao criar pré-agendamento genitor
    const temItensPedido = (itens || []).some((i) => i.pedido_item_id != null);
    if (pedidoIdFinal && temItensPedido) {
      await db.query(
        `UPDATE pedidos SET status = 'em_andamento' WHERE id = $1 AND status = 'pendente'`,
        [pedidoIdFinal]
      );
    }

    if (aprovacao) {
```

### 7c — Auto-conclusão do pedido ao concluir todos os genitores

- [ ] **Step 4: Adicionar lógica após o bloco try/catch/finally de `atualizarStatus()` (~linha 807)**

Localizar o trecho:
```js
  } finally {
    client.release();
  }

  const ag = await montarAgendamento(id, empresaId);
```

Inserir entre o `client.release()` e o `montarAgendamento`:

```js
  } finally {
    client.release();
  }

  // Auto-conclusão: se todos os genitores do pedido foram concluídos, conclui o pedido
  if (status === "concluido") {
    const agInfo = await db.query(
      `SELECT pedido_id FROM agendamentos WHERE id = $1`, [id]
    );
    const pedidoId = agInfo.rows[0]?.pedido_id;
    if (pedidoId) {
      const isGenitor = await db.query(
        `SELECT 1 FROM agendamento_itens
         WHERE agendamento_id = $1 AND pedido_item_id IS NOT NULL LIMIT 1`,
        [id]
      );
      if (isGenitor.rows.length > 0) {
        const pendentes = await db.query(
          `SELECT a.id FROM agendamentos a
           WHERE a.pedido_id = $1 AND a.empresa_id = $2
             AND EXISTS (
               SELECT 1 FROM agendamento_itens ai
               WHERE ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
             )
             AND a.status != 'concluido'
             AND a.id != $3`,
          [pedidoId, empresaId, id]
        );
        if (pendentes.rows.length === 0) {
          await db.query(
            `UPDATE pedidos SET status = 'concluido'
             WHERE id = $1 AND status NOT IN ('cancelado', 'concluido')`,
            [pedidoId]
          );
        }
      }
    }
  }

  const ag = await montarAgendamento(id, empresaId);
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agendamentoService.js
git commit -m "feat(backend): agendamentoService — agendamento_pai_id no INSERT, auto-status pedido em criar() e atualizarStatus()"
```

---

## Task 8: Hook useDashboardPedidos.js

**Files:**
- Criar: `frontend-web/src/pages/dashboard/hooks/useDashboardPedidos.js`

- [ ] **Step 1: Criar o diretório e o arquivo**

```bash
mkdir -p frontend-web/src/pages/dashboard/hooks
```

Conteúdo do arquivo:

```js
import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../../../services/api";

export default function useDashboardPedidos() {
  const [pedidos, setPedidos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(null);
  const inicializado            = useRef(false);

  const carregar = useCallback(async (filtros = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.consultora_id) params.set("consultora_id", filtros.consultora_id);
      if (filtros.status)        params.set("status",        filtros.status);
      if (filtros.alerta)        params.set("alerta",        filtros.alerta);
      const qs = params.toString();
      const res = await api.get(`/dashboard/pedidos${qs ? "?" + qs : ""}`);
      setPedidos(res.pedidos || []);
      setErro(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inicializado.current) return;
    inicializado.current = true;
    carregar();
  }, [carregar]);

  const atualizarEtapa = useCallback(async (pedidoId, campo, valor) => {
    await api.patch(`/pedidos/${pedidoId}/etapa`, { campo, valor });
  }, []);

  return { pedidos, loading, erro, carregar, atualizarEtapa };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/dashboard/hooks/useDashboardPedidos.js
git commit -m "feat(frontend): hook useDashboardPedidos"
```

---

## Task 9: DashboardPedidos.jsx + DashboardPedidos.css

**Files:**
- Criar: `frontend-web/src/pages/dashboard/DashboardPedidos.jsx`
- Criar: `frontend-web/src/pages/dashboard/DashboardPedidos.css`

- [ ] **Step 1: Criar DashboardPedidos.jsx**

```jsx
import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useDashboardPedidos from "./hooks/useDashboardPedidos";
import useAuth from "../../hooks/useAuth";
import "./DashboardPedidos.css";

const STATUS_LABELS = {
  pendente:     "Aguardando",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  cancelado:    "Cancelado",
};

const ALERTA_LABELS = { atrasado: "Atrasado", urgente: "Urgente", atencao: "Atenção" };

function BarraProgresso({ estagio }) {
  const preAgs = estagio.pre_agendamentos || [];

  const etapas = [
    { key: "pdf",      label: "PDF",     ok: estagio.pdf_ok },
    { key: "verif",    label: "Verif.",   ok: estagio.verificacao_ok },
    { key: "categ",    label: "Categ.",   ok: estagio.categorizacao_ok },
    { key: "vinculos", label: "Vínculos", ok: estagio.vinculos_ok },
    ...preAgs.map((ag, i) => ({
      key: `preag_${ag.id}`,
      label: `Pré-ag. ${i + 1}`,
      ok: ag.status === "concluido",
      status: ag.status,
    })),
    { key: "entrega", label: "Entrega", ok: false },
  ];

  // Índice da etapa atual (primeira não concluída)
  let atualIdx = etapas.findIndex((e) => !e.ok);
  if (atualIdx === -1) atualIdx = etapas.length - 1;

  return (
    <div className="dp-barra">
      {etapas.map((etapa, idx) => {
        let cls = "dp-etapa";
        if (idx < atualIdx) cls += " dp-ok";
        else if (idx === atualIdx) {
          cls += " dp-atual";
          if (estagio.nivel_alerta === "atrasado") cls += " dp-atrasado";
        }
        return (
          <React.Fragment key={etapa.key}>
            <div className={cls}>
              <div className="dp-ponto" />
              <span className="dp-label">{etapa.label}</span>
            </div>
            {idx < etapas.length - 1 && (
              <div className={`dp-linha ${idx < atualIdx ? "dp-ok" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BadgeStatus({ status, nivelAlerta }) {
  const label = nivelAlerta ? ALERTA_LABELS[nivelAlerta] : (STATUS_LABELS[status] || status);
  return <span className={`dp-badge dp-badge-${nivelAlerta || status}`}>{label}</span>;
}

function CardPedido({ pedido, onVerFluxo }) {
  const { estagio } = pedido;
  return (
    <div
      className={`dp-card ${estagio.nivel_alerta ? "dp-card-" + estagio.nivel_alerta : ""}`}
      onClick={() => onVerFluxo(pedido.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onVerFluxo(pedido.id)}
    >
      <div className="dp-card-header">
        <span className="dp-numero">#{pedido.numero_sequencial}</span>
        <span className="dp-consultora">{pedido.consultor_nome}</span>
        <BadgeStatus status={pedido.status} nivelAlerta={estagio.nivel_alerta} />
      </div>
      <div className="dp-card-info">
        <span className="dp-cliente">{pedido.cliente_nome}</span>
        <span className="dp-valor">
          R$ {Number(pedido.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        <span className="dp-itens">
          {pedido.itens_count} {pedido.itens_count === 1 ? "item" : "itens"}
        </span>
      </div>
      {estagio.proximo_prazo && (
        <div className={`dp-prazo dp-prazo-${estagio.nivel_alerta || ""}`}>
          {estagio.dias_para_prazo <= 0
            ? "Prazo vencido"
            : `Prazo em ${estagio.dias_para_prazo} dia${estagio.dias_para_prazo === 1 ? "" : "s"}`}
        </div>
      )}
      <BarraProgresso estagio={estagio} />
    </div>
  );
}

const FILTROS = [
  { key: "todos",       label: "Todos" },
  { key: "pendente",    label: "Pendentes" },
  { key: "em_andamento",label: "Em andamento" },
  { key: "atrasados",   label: "Atrasados" },
  { key: "concluido",   label: "Concluídos" },
];

export default function DashboardPedidos() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { pedidos, loading, erro, carregar } = useDashboardPedidos();
  const [filtroAtivo, setFiltroAtivo] = useState("todos");
  const [visaoGeral,  setVisaoGeral]  = useState(false);

  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const pedidosFiltrados = useMemo(() => {
    if (filtroAtivo === "todos")    return pedidos;
    if (filtroAtivo === "atrasados") return pedidos.filter((p) => p.estagio.nivel_alerta === "atrasado");
    return pedidos.filter((p) => p.status === filtroAtivo);
  }, [pedidos, filtroAtivo]);

  function handleFiltro(key) {
    setFiltroAtivo(key);
    if (key === "atrasados") carregar({ alerta: "atrasado" });
    else if (key === "todos") carregar({});
    else carregar({ status: key });
  }

  function handleToggleVisao(geral) {
    setVisaoGeral(geral);
    carregar(geral ? {} : { consultora_id: user?.id });
  }

  if (loading) return <div className="dp-loading">Carregando pedidos...</div>;
  if (erro)    return <div className="dp-erro">Erro ao carregar: {erro}</div>;

  return (
    <div className="dp-page">
      <div className="dp-header">
        <h1 className="dp-titulo">Dashboard de Pedidos</h1>
        {temPermGeral && (
          <div className="dp-toggle">
            <button
              className={`dp-toggle-btn ${!visaoGeral ? "dp-toggle-ativo" : ""}`}
              onClick={() => handleToggleVisao(false)}
            >
              Meus Pedidos
            </button>
            <button
              className={`dp-toggle-btn ${visaoGeral ? "dp-toggle-ativo" : ""}`}
              onClick={() => handleToggleVisao(true)}
            >
              Visão Geral
            </button>
          </div>
        )}
      </div>

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

      {pedidosFiltrados.length === 0 ? (
        <p className="dp-vazio">Nenhum pedido encontrado.</p>
      ) : (
        <div className="dp-grid">
          {pedidosFiltrados.map((p) => (
            <CardPedido
              key={p.id}
              pedido={p}
              onVerFluxo={(id) => navigate(`/pedidos/${id}/fluxo`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar DashboardPedidos.css**

```css
/* ── Page ── */
.dp-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.dp-loading, .dp-erro, .dp-vazio {
  padding: 48px;
  text-align: center;
  color: var(--color-text-muted, #9ca3af);
}

/* ── Header ── */
.dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.dp-titulo {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text, #f1f5f9);
  margin: 0;
}

/* ── Toggle Visão ── */
.dp-toggle {
  display: flex;
  background: var(--color-surface, #1e293b);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.dp-toggle-btn {
  padding: 7px 16px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
}

.dp-toggle-btn.dp-toggle-ativo {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}

/* ── Chips de filtro ── */
.dp-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.dp-chip {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--color-border, #334155);
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.dp-chip:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.dp-chip.dp-chip-ativo { background: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); color: #fff; }

/* ── Grid de cards ── */
.dp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

/* ── Card ── */
.dp-card {
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 12px;
  padding: 18px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.dp-card:hover { border-color: var(--color-primary, #3b82f6); box-shadow: 0 4px 16px rgba(59,130,246,0.15); }
.dp-card.dp-card-atrasado { border-color: #ef4444; }
.dp-card.dp-card-urgente  { border-color: #f97316; }
.dp-card.dp-card-atencao  { border-color: #eab308; }

.dp-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.dp-numero      { font-weight: 700; font-size: 15px; color: var(--color-text, #f1f5f9); }
.dp-consultora  { font-size: 13px; color: var(--color-text-muted, #94a3b8); flex: 1; }

/* ── Badge ── */
.dp-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  white-space: nowrap;
}

.dp-badge-pendente       { background: #1e3a5f; color: #93c5fd; }
.dp-badge-em_andamento   { background: #1c3354; color: #60a5fa; }
.dp-badge-concluido      { background: #064e3b; color: #6ee7b7; }
.dp-badge-cancelado      { background: #1f2937; color: #6b7280; }
.dp-badge-atrasado       { background: #450a0a; color: #fca5a5; }
.dp-badge-urgente        { background: #431407; color: #fdba74; }
.dp-badge-atencao        { background: #422006; color: #fde68a; }

/* ── Info ── */
.dp-card-info {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.dp-cliente { font-weight: 500; color: var(--color-text, #f1f5f9); }
.dp-valor   { color: #34d399; }

/* ── Prazo alert ── */
.dp-prazo {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 12px;
  display: inline-block;
}

.dp-prazo-atrasado { background: #450a0a; color: #fca5a5; }
.dp-prazo-urgente  { background: #431407; color: #fdba74; }
.dp-prazo-atencao  { background: #422006; color: #fde68a; }

/* ── Barra de progresso ── */
.dp-barra {
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 4px 0;
  gap: 0;
}

.dp-etapa {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 48px;
}

.dp-ponto {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-border, #334155);
  border: 2px solid var(--color-border, #475569);
  transition: all 0.2s;
}

.dp-etapa.dp-ok     .dp-ponto { background: #10b981; border-color: #10b981; }
.dp-etapa.dp-atual  .dp-ponto { background: #3b82f6; border-color: #3b82f6; box-shadow: 0 0 8px #3b82f6; }
.dp-etapa.dp-atrasado .dp-ponto { background: #ef4444; border-color: #ef4444; box-shadow: 0 0 8px #ef4444; }

.dp-label {
  font-size: 10px;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}

.dp-etapa.dp-ok    .dp-label  { color: #10b981; }
.dp-etapa.dp-atual .dp-label  { color: #3b82f6; font-weight: 600; }

.dp-linha {
  flex: 1;
  height: 2px;
  background: var(--color-border, #334155);
  min-width: 12px;
  margin-bottom: 16px;
  transition: background 0.2s;
}

.dp-linha.dp-ok { background: #10b981; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/dashboard/DashboardPedidos.jsx frontend-web/src/pages/dashboard/DashboardPedidos.css
git commit -m "feat(frontend): DashboardPedidos — cards com barra de progresso e filtros"
```

---

## Task 10: PedidoFluxo.jsx + PedidoFluxo.css

**Files:**
- Criar: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`
- Criar: `frontend-web/src/pages/pedidos/PedidoFluxo.css`

- [ ] **Step 1: Criar PedidoFluxo.jsx**

```jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api } from "../../services/api";
import "./PedidoFluxo.css";

const COR_STATUS = {
  concluido:   "verde",
  agendado:    "azul",
  pre_agendado:"azul",
  andamento:   "azul",
  pendente:    "cinza",
  cancelado:   "cinza",
  atrasado:    "vermelho",
};

function corNo(status) {
  return COR_STATUS[status] || "cinza";
}

function NoFluxo({ label, status, pulsante, onClick }) {
  const cor = pulsante ? `${corNo(status)} pulsante` : corNo(status);
  return (
    <div
      className={`pf-no ${cor}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {label}
    </div>
  );
}

function Seta({ vertical }) {
  return <div className={vertical ? "pf-seta-v" : "pf-seta-h"}>
    {vertical ? "↓" : "→"}
  </div>;
}

function Tooltip({ node, onClose, onMarcar, user }) {
  if (!node) return null;

  const ehOwner = node.ownPedido;
  const temPerm = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  const podeMar = node.tipo === "manual" && !node.concluido && (temPerm || ehOwner);

  return (
    <div className="pf-tooltip-overlay" onClick={onClose}>
      <div className="pf-tooltip" onClick={(e) => e.stopPropagation()}>
        <button className="pf-tooltip-fechar" onClick={onClose}>×</button>
        <h4 className="pf-tooltip-titulo">{node.label}</h4>
        {node.status && (
          <p className="pf-tooltip-info">Status: <strong>{node.status}</strong></p>
        )}
        {node.data && (
          <p className="pf-tooltip-info">
            Data: <strong>{new Date(node.data).toLocaleDateString("pt-BR")}</strong>
          </p>
        )}
        {node.itens?.length > 0 && (
          <div className="pf-tooltip-itens">
            <p className="pf-tooltip-info">Itens:</p>
            <ul>
              {node.itens.map((i) => (
                <li key={i.pedido_item_id}>{i.descricao}</li>
              ))}
            </ul>
          </div>
        )}
        {podeMar && (
          <button
            className="pf-btn-marcar"
            onClick={() => onMarcar(node.campo)}
          >
            Marcar como concluído
          </button>
        )}
      </div>
    </div>
  );
}

export default function PedidoFluxo() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [dados,       setDados]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState(null);
  const [noSelecionado, setNoselecionado] = useState(null);

  const carregar = useCallback(() => {
    setLoading(true);
    api.get(`/pedidos/${id}/fluxo`)
      .then((res) => { setDados(res); setErro(null); })
      .catch((err) => setErro(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function marcarEtapa(campo) {
    try {
      await api.patch(`/pedidos/${id}/etapa`, { campo, valor: true });
      setNoselecionado(null);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="pf-estado">Carregando fluxo...</div>;
  if (erro)    return <div className="pf-estado pf-erro">Erro: {erro}</div>;
  if (!dados)  return null;

  const { pedido, estagio, pre_agendamentos } = dados;
  const isOwner    = pedido.consultor_id === user?.id;
  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  // Determina se um nó base é o "atual" (próximo a concluir)
  function isCurrent(key) {
    if (!estagio.pdf_ok          && key === "pdf")      return true;
    if (estagio.pdf_ok && !estagio.verificacao_ok && key === "verificar")   return true;
    if (estagio.verificacao_ok && !estagio.categorizacao_ok && key === "categorizar") return true;
    if (estagio.categorizacao_ok && !estagio.vinculos_ok && key === "vincular") return true;
    return false;
  }

  const nosBase = [
    { key: "pdf",       label: "PDF",       status: estagio.pdf_ok ? "concluido" : "pendente", tipo: "auto" },
    {
      key:      "verificar",
      label:    "Verificar",
      status:   estagio.verificacao_ok ? "concluido" : "pendente",
      tipo:     "manual",
      campo:    "verificacao_ok",
      concluido: estagio.verificacao_ok,
      ownPedido: isOwner,
    },
    {
      key:      "categorizar",
      label:    "Categorizar",
      status:   estagio.categorizacao_ok ? "concluido" : "pendente",
      tipo:     "manual",
      campo:    "categorizacao_ok",
      concluido: estagio.categorizacao_ok,
      ownPedido: isOwner,
    },
    { key: "vincular", label: "Vincular", status: estagio.vinculos_ok ? "concluido" : "pendente", tipo: "auto" },
  ];

  return (
    <div className="pf-page">
      {/* Header */}
      <div className="pf-header">
        <button className="pf-btn-voltar" onClick={() => navigate("/dashboard-pedidos")}>
          ← Voltar ao Dashboard
        </button>
        <div className="pf-info">
          <h2 className="pf-titulo">Pedido #{pedido.numero_sequencial}</h2>
          <span className="pf-detalhe">{pedido.cliente_nome}</span>
          <span className="pf-detalhe">{pedido.consultor_nome}</span>
          <span className="pf-detalhe pf-valor">
            R$ {Number(pedido.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Fluxograma */}
      <div className="pf-container">
        <div className="pf-fluxo">
          {/* Nós base */}
          {nosBase.map((no, idx) => (
            <React.Fragment key={no.key}>
              <NoFluxo
                label={no.label}
                status={no.status}
                pulsante={isCurrent(no.key)}
                onClick={() => setNoselecionado({ ...no })}
              />
              <Seta />
            </React.Fragment>
          ))}

          {/* Fork de pré-agendamentos */}
          <div className="pf-fork">
            {pre_agendamentos.length === 0 ? (
              <NoFluxo label="Pré-ag." status="pendente" />
            ) : (
              pre_agendamentos.map((ag, idx) => {
                const isCur = (estagio.vinculos_ok || !estagio.vinculos_ok) &&
                  (ag.status === "pre_agendado" || ag.status === "agendado") &&
                  idx === 0;
                return (
                  <div key={ag.id} className="pf-col-ag">
                    <NoFluxo
                      label={`Pré-ag. ${idx + 1}`}
                      status={ag.status}
                      pulsante={isCur && estagio.vinculos_ok}
                      onClick={() =>
                        setNoselecionado({
                          key: `preag_${ag.id}`,
                          label: `Pré-agendamento ${idx + 1}`,
                          status: ag.status,
                          data: ag.data_inicio,
                          itens: ag.itens,
                          tipo: "preag",
                        })
                      }
                    />
                    {ag.herdeiros?.map((h) => (
                      <React.Fragment key={h.id}>
                        <Seta vertical />
                        <NoFluxo
                          label={h.tipo || "Herdeiro"}
                          status={h.status}
                          onClick={() =>
                            setNoselecionado({
                              key:    `herd_${h.id}`,
                              label:  h.tipo || "Herdeiro",
                              status: h.status,
                              data:   h.data_inicio,
                              tipo:   "herdeiro",
                            })
                          }
                        />
                      </React.Fragment>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <Seta />
          <NoFluxo
            label="Entrega"
            status={pedido.status === "concluido" ? "concluido" : "pendente"}
          />
        </div>
      </div>

      {noSelecionado && (
        <Tooltip
          node={noSelecionado}
          onClose={() => setNoselecionado(null)}
          onMarcar={marcarEtapa}
          user={user}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar PedidoFluxo.css**

```css
/* ── Page ── */
.pf-page {
  padding: 24px;
  min-height: 100vh;
  background: var(--color-bg, #0f172a);
}

.pf-estado {
  padding: 48px;
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
}

.pf-erro { color: #f87171; }

/* ── Header ── */
.pf-header {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

.pf-btn-voltar {
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.pf-btn-voltar:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }

.pf-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.pf-titulo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, #f1f5f9);
  margin: 0;
}

.pf-detalhe {
  font-size: 14px;
  color: var(--color-text-muted, #94a3b8);
}

.pf-valor { color: #34d399; font-weight: 600; }

/* ── Fluxograma container ── */
.pf-container {
  overflow-x: auto;
  padding: 32px 16px;
  background: var(--color-surface, #1e293b);
  border-radius: 16px;
  border: 1px solid var(--color-border, #334155);
}

.pf-fluxo {
  display: flex;
  align-items: flex-start;
  gap: 0;
  min-width: max-content;
}

/* ── Nó ── */
.pf-no {
  min-width: 90px;
  padding: 12px 16px;
  border-radius: 10px;
  text-align: center;
  cursor: pointer;
  border: 2px solid;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: transform 0.15s, box-shadow 0.15s;
  user-select: none;
}

.pf-no:hover { transform: translateY(-2px); }

.pf-no.cinza    { background: #1e293b; border-color: #475569; color: #94a3b8; }
.pf-no.verde    { background: #064e3b; border-color: #10b981; color: #6ee7b7; }
.pf-no.azul     { background: #1e3a5f; border-color: #3b82f6; color: #93c5fd; }
.pf-no.vermelho { background: #450a0a; border-color: #ef4444; color: #fca5a5; }

@keyframes glow-blue {
  0%, 100% { box-shadow: 0 0 6px #3b82f6; }
  50%       { box-shadow: 0 0 18px #3b82f6; }
}

@keyframes glow-red {
  0%, 100% { box-shadow: 0 0 6px #ef4444; }
  50%       { box-shadow: 0 0 18px #ef4444; }
}

.pf-no.azul.pulsante     { animation: glow-blue 2s infinite; }
.pf-no.vermelho.pulsante { animation: glow-red  2s infinite; }

/* ── Setas ── */
.pf-seta-h, .pf-seta-v {
  color: #475569;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  align-self: center;
}

.pf-seta-v {
  padding: 4px 0;
  align-self: stretch;
  writing-mode: initial;
}

/* ── Fork de pré-agendamentos ── */
.pf-fork {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-self: flex-start;
}

.pf-col-ag {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* ── Tooltip ── */
.pf-tooltip-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pf-tooltip {
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 14px;
  padding: 24px;
  min-width: 280px;
  max-width: 420px;
  position: relative;
}

.pf-tooltip-fechar {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: var(--color-text-muted, #94a3b8);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.pf-tooltip-titulo {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #f1f5f9);
  margin: 0 0 12px;
}

.pf-tooltip-info {
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
  margin: 4px 0;
}

.pf-tooltip-info strong { color: var(--color-text, #f1f5f9); }

.pf-tooltip-itens ul {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
}

.pf-btn-marcar {
  margin-top: 16px;
  width: 100%;
  padding: 10px;
  background: var(--color-primary, #3b82f6);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.pf-btn-marcar:hover { opacity: 0.85; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx frontend-web/src/pages/pedidos/PedidoFluxo.css
git commit -m "feat(frontend): PedidoFluxo — fluxograma horizontal com nós interativos e tooltip"
```

---

## Task 11: App.jsx + Sidebar.jsx

**Files:**
- Modificar: `frontend-web/src/App.jsx`
- Modificar: `frontend-web/src/components/Sidebar.jsx`

### 11a — App.jsx: lazy imports e rotas

- [ ] **Step 1: Adicionar lazy imports em App.jsx (~linha 34, após `OrcamentoWizard`)**

```js
const DashboardPedidos   = lazy(() => import("./pages/dashboard/DashboardPedidos"));
const PedidoFluxo        = lazy(() => import("./pages/pedidos/PedidoFluxo"));
```

- [ ] **Step 2: Adicionar rotas dentro do bloco de permissões existente que já tem `/pedidos` (~linha 97)**

Localizar:
```jsx
<Route element={<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
  <Route path="/pedidos" element={<Pedidos />} />
  <Route path="/pedidos/os/:osId" element={<OrdemServicoPage />} />
```

Adicionar as duas novas rotas logo após a rota `/pedidos/os/:osId`:

```jsx
  <Route path="/pedidos/:id/fluxo"    element={<PedidoFluxo />} />
  <Route path="/dashboard-pedidos"    element={<DashboardPedidos />} />
```

### 11b — Sidebar.jsx: link Dashboard

- [ ] **Step 3: Adicionar import de ícone em Sidebar.jsx**

Verificar se `FaChartBar` já está importado de `react-icons/fa` (linha ~4). Se não estiver, adicionar `FaChartBar` à lista de imports existente.

- [ ] **Step 4: Adicionar variável de permissão logo abaixo das outras (~linha 53)**

```js
const podeVerDashboardPedidos = temPerm(user, "COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS");
```

- [ ] **Step 5: Adicionar NavLink no JSX, após o bloco de Pedidos (~linha 185)**

Localizar:
```jsx
{podeVerPedidos && (
  <NavLink to="/pedidos" className={navItemClass} title="Pedidos">
    <FaClipboardList className="sidebar-icon" />
    {!collapsed && <span className="sidebar-label">Pedidos</span>}
  </NavLink>
)}
```

Adicionar logo após:
```jsx
{podeVerDashboardPedidos && (
  <NavLink to="/dashboard-pedidos" className={navItemClass} title="Dashboard Pedidos">
    <FaChartBar className="sidebar-icon" />
    {!collapsed && <span className="sidebar-label">Dashboard</span>}
  </NavLink>
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/App.jsx frontend-web/src/components/Sidebar.jsx
git commit -m "feat(frontend): rotas /dashboard-pedidos e /pedidos/:id/fluxo + link no Sidebar"
```

---

## Self-Review

### Spec coverage checklist

| Requisito do spec | Implementado em |
|---|---|
| Migration: verificacao_ok, categorizacao_ok | Task 1 |
| Migration: agendamento_itens.pedido_item_id | Task 1 |
| Migration: agendamentos.agendamento_pai_id | Task 1 |
| Migration: permissão DASHBOARD_PEDIDOS_GERAL | Task 1 |
| GET /api/dashboard/pedidos com filtros + estagio | Task 2 + 3 |
| GET /api/pedidos/:id/fluxo com pre_agendamentos + herdeiros | Task 2 + 6 |
| PATCH /api/pedidos/:id/etapa | Task 5 + 6 |
| Automação: pendente→em_andamento ao criar genitor | Task 7b |
| Automação: conclusão do pedido quando todos genitores concluídos | Task 7c |
| agendamento_pai_id no INSERT de criar() | Task 7a |
| Hook useDashboardPedidos | Task 8 |
| Dashboard com toggle visão geral / meus pedidos | Task 9 |
| Cards com barra de progresso dinâmica | Task 9 |
| Chips de filtro: status + alerta | Task 9 |
| Fluxo /pedidos/:id/fluxo | Task 10 |
| Nós coloridos por status com glow pulsante | Task 10 |
| Tooltip com botão "Marcar como concluído" | Task 10 |
| Rotas no App.jsx | Task 11 |
| Link no Sidebar | Task 11 |

### Potential issues

1. **Nome do authMiddleware:** Task 3 nota que o arquivo pode se chamar `authMiddleware.js` ou similar — verificar em `backend/src/middlewares/`.
2. **Nome da variável do service em pedidosRoutes.js:** Task 6 orienta a verificar o nome exato antes de usar `pedidoSvc`.
3. **FaChartBar no Sidebar:** já estava importado na linha 13 (`import { ... FaChartBar ... }`) — confirmar antes de adicionar.
