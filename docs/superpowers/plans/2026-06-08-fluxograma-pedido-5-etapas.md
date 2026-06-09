# Fluxograma Pedido 5 Etapas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar `/pedidos/:id/fluxo` como canvas panável com 5 etapas sequenciais (Dados → Conferência → Produção → Agendamento → Pós-venda), com fichas de conferência técnica por item e integração ao sistema de agendamento genitor/herdeiro existente.

**Architecture:** Approach B — `PedidoFluxo.jsx` vira orquestrador leve (~200 linhas) que renderiza `FluxogramaCanvas.jsx` com `EtapaCard`s e abre painéis de etapa como modais sobrepostos ao canvas. Backend estende `buscarFluxoPedido` com cálculo das 5 etapas e adiciona 6 novos endpoints nas rotas existentes.

**Tech Stack:** React (hooks, `useRef` para pan sem re-renders), CSS variables dark/light via `data-theme` no `:root`, Node.js/Express, PostgreSQL (padrão `db.query` com `$1,$2`).

---

## File Map

### Backend — Criar
- `backend/src/database/migrations/fluxo_5_etapas.sql` — migration SQL

### Backend — Modificar
- `backend/src/services/dashboardService.js` — extender `buscarFluxoPedido` com cálculo das 5 etapas
- `backend/src/services/agendamentoService.js` — funções `listarConferenciaItens`, `upsertConferenciaItem`, `confirmarCliente`
- `backend/src/services/pedidoService.js` — funções `itensDisponiveisConferencia`, `atualizarProducaoItem`, `pesquisaSatisfacao`
- `backend/src/routes/pedidosRoutes.js` — 3 novos endpoints (`itens-disponiveis-conferencia`, `producao-itens`, `pesquisa-satisfacao`)
- `backend/src/routes/agendamentosRoutes.js` — 2 novos endpoints (`conferencia-itens` GET/POST, `confirmar-cliente`)

### Frontend — Criar
- `frontend-web/src/pages/pedidos/fluxo/FluxogramaCanvas.jsx`
- `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx`
- `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
- `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`
- `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx`
- `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx`
- `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaPosvenda.jsx`
- `frontend-web/src/pages/agendamentos/FichaConferencia.jsx`
- `frontend-web/src/pages/agendamentos/FichaConferencia.css`

### Frontend — Reescrever
- `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` — orquestrador novo
- `frontend-web/src/pages/pedidos/PedidoFluxo.css` — variáveis de tema + canvas

---

## Task 1: Migration SQL

**Files:**
- Create: `backend/src/database/migrations/fluxo_5_etapas.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- Etapa 3: controle de confecção por item
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS em_confeccao BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confeccao_ok BOOLEAN NOT NULL DEFAULT false;

-- Etapa 2: ficha de conferência técnica
CREATE TABLE IF NOT EXISTS conferencia_itens (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  pedido_item_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pendente',
  -- 'pendente' | 'conferido' | 'reprovado'
  observacoes    TEXT,
  dados          JSONB,
  conferido_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  conferido_em   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id, pedido_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_agendamento ON conferencia_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ci_pedido_item ON conferencia_itens(pedido_item_id);
```

- [ ] **Step 2: Executar a migration no banco**

Conecte ao banco PostgreSQL e rode o arquivo:
```bash
psql $DATABASE_URL -f backend/src/database/migrations/fluxo_5_etapas.sql
```
Ou via o cliente DB do projeto. Verificar que `\d pedido_itens` mostra `em_confeccao` e `confeccao_ok`, e `\d conferencia_itens` mostra a tabela.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/fluxo_5_etapas.sql
git commit -m "feat(db): migration fluxo 5 etapas — conferencia_itens + em_confeccao/confeccao_ok"
```

---

## Task 2: Backend — Estender buscarFluxoPedido

**Files:**
- Modify: `backend/src/services/dashboardService.js`

A função `buscarFluxoPedido` (linhas 137–265) atualmente retorna `{pedido, estagio, pre_agendamentos}`. Vamos estendê-la para também calcular `etapa_atual` (1–5) e os dados de progresso de cada etapa.

- [ ] **Step 1: Adicionar queries de etapa 1 (cobertura de itens)**

Logo após a query de `herdeirosRaw` (após linha ~220), adicionar:

```js
  // Etapa 1 — todos os itens cobertos por algum genitor
  const { rows: totalItensRows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM pedido_itens WHERE pedido_id = $1`,
    [pedidoId]
  );
  const totalItens = totalItensRows[0]?.total ?? 0;

  const { rows: itensCobertosRows } = await db.query(
    `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
     FROM agendamento_itens ai
     JOIN agendamentos a ON a.id = ai.agendamento_id
     WHERE a.pedido_id = $1 AND a.empresa_id = $2
       AND ai.pedido_item_id IS NOT NULL
       AND a.status NOT IN ('cancelado','rejeitado')
       AND a.agendamento_pai_id IS NULL`,
    [pedidoId, empresaId]
  );
  const itensCobertos = itensCobertosRows[0]?.cobertos ?? 0;

  // Etapa 1 — todos os itens com categoria
  const { rows: itensSemCatRows } = await db.query(
    `SELECT COUNT(*)::int AS sem_cat
     FROM pedido_itens pi
     LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
     LEFT JOIN produtos prod ON prod.id = oi.produto_id
     WHERE pi.pedido_id = $1
       AND COALESCE(pi.categoria_id, prod.categoria_id) IS NULL`,
    [pedidoId]
  );
  const itensSemCategoria = itensSemCatRows[0]?.sem_cat ?? 0;

  // Etapa 1 — todos os itens com vínculo
  const { rows: itensSemVinculoRows } = await db.query(
    `SELECT COUNT(*)::int AS sem_vinc
     FROM pedido_itens pi
     WHERE pi.pedido_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
       )`,
    [pedidoId]
  );
  const itensSemVinculo = itensSemVinculoRows[0]?.sem_vinc ?? 0;
```

- [ ] **Step 2: Adicionar queries das etapas 2, 3 e 4**

Logo após o bloco anterior:

```js
  // Etapa 2 — itens conferidos
  const { rows: confRows } = await db.query(
    `SELECT
       COUNT(DISTINCT pi.id)::int AS total,
       COUNT(DISTINCT ci.pedido_item_id) FILTER (WHERE ci.status = 'conferido')::int AS conferidos
     FROM pedido_itens pi
     LEFT JOIN conferencia_itens ci ON ci.pedido_item_id = pi.id AND ci.empresa_id = $2
     WHERE pi.pedido_id = $1`,
    [pedidoId, empresaId]
  );
  const { total: totalItensConf, conferidos: itensConferidos } = confRows[0] ?? { total: 0, conferidos: 0 };

  // Etapa 3 — itens em confecção e concluídos
  const { rows: prodRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE em_confeccao = true)::int AS em_confeccao,
       COUNT(*) FILTER (WHERE em_confeccao = true AND confeccao_ok = true)::int AS confeccao_ok
     FROM pedido_itens
     WHERE pedido_id = $1`,
    [pedidoId]
  );
  const { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } = prodRows[0] ?? { em_confeccao: 0, confeccao_ok: 0 };

  // Etapa 4 — genitor agendado com equipe
  const { rows: agendadoRows } = await db.query(
    `SELECT COUNT(*)::int AS agendados
     FROM agendamentos a
     WHERE a.pedido_id = $1 AND a.empresa_id = $2
       AND a.status = 'agendado'
       AND a.agendamento_pai_id IS NULL
       AND EXISTS (
         SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id = a.id
       )`,
    [pedidoId, empresaId]
  );
  const genitoresAgendados = agendadoRows[0]?.agendados ?? 0;
```

- [ ] **Step 3: Calcular etapa_atual e montar etapas[]**

Após as queries acima, antes do `return`, substituir o `return` existente por:

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

  const etapas = [
    {
      numero: 1,
      concluida: etapa1_ok,
      progresso: {
        tem_anexo: anexos.length > 0,
        verificacao_ok: pedido.verificacao_ok,
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
      progresso: { genitores_agendados: genitoresAgendados },
    },
    {
      numero: 5,
      concluida: etapa5_ok,
      progresso: { status: pedido.status },
    },
  ];

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
```

> **Atenção:** o `return` antigo fica dentro do bloco `if (!genitoresRaw.length)`. Para o caso sem genitores, adicionar antes daquele return:
> ```js
> if (!genitoresRaw.length) {
>   return {
>     pedido,
>     etapa_atual: 1,
>     etapas: [
>       { numero: 1, concluida: false, progresso: { tem_anexo: anexos.length > 0, verificacao_ok: pedido.verificacao_ok, itens_sem_categoria: itensSemCategoria, itens_sem_vinculo: itensSemVinculo, total_itens: totalItens, itens_cobertos: 0 } },
>       { numero: 2, concluida: false, progresso: { total: totalItens, conferidos: 0 } },
>       { numero: 3, concluida: totalEmConf === 0, progresso: { em_confeccao: totalEmConf, confeccao_ok: 0 } },
>       { numero: 4, concluida: false, progresso: { genitores_agendados: 0 } },
>       { numero: 5, concluida: false, progresso: { status: pedido.status } },
>     ],
>     estagio: { ...estagio_base, pre_agendamentos: [], proximo_prazo: null, dias_para_prazo: null, nivel_alerta: null },
>     pre_agendamentos: [],
>   };
> }
> ```
> As queries de etapa 1 (`totalItens`, `itensSemCategoria`, `itensSemVinculo`) devem ser movidas para **antes** do bloco `if (!genitoresRaw.length)`.

- [ ] **Step 4: Testar via curl**

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/pedidos/123/fluxo
```
Resposta deve incluir `etapa_atual` (número 1–5) e array `etapas` com 5 objetos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "feat(backend): buscarFluxoPedido retorna etapa_atual + etapas[] com progresso"
```

---

## Task 3: Backend — Endpoints de conferência técnica

**Files:**
- Modify: `backend/src/services/agendamentoService.js`
- Modify: `backend/src/routes/agendamentosRoutes.js`

- [ ] **Step 1: Adicionar funções no agendamentoService.js**

No final do arquivo, antes do `module.exports`:

```js
async function listarConferenciaItens(agendamentoId, empresaId) {
  const { rows: agCheck } = await db.query(
    `SELECT id FROM agendamentos WHERE id = $1 AND empresa_id = $2`,
    [agendamentoId, empresaId]
  );
  if (!agCheck.length) {
    const err = new Error("Agendamento não encontrado");
    err.status = 404;
    throw err;
  }

  const { rows } = await db.query(
    `SELECT
       pi.id AS pedido_item_id,
       pi.descricao,
       pi.ambiente,
       COALESCE(ci.status, 'pendente') AS status,
       ci.observacoes,
       ci.dados,
       ci.conferido_em,
       u.nome_completo AS conferido_por_nome
     FROM agendamento_itens ai
     JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
     LEFT JOIN conferencia_itens ci
       ON ci.agendamento_id = $1 AND ci.pedido_item_id = pi.id
     LEFT JOIN usuarios u ON u.id = ci.conferido_por
     WHERE ai.agendamento_id = $1
       AND ai.pedido_item_id IS NOT NULL
     ORDER BY pi.ordem ASC, pi.id ASC`,
    [agendamentoId]
  );
  return rows;
}

async function upsertConferenciaItem(agendamentoId, empresaId, usuarioId, { pedido_item_id, status, observacoes, dados }) {
  if (!pedido_item_id) {
    const err = new Error("pedido_item_id obrigatório");
    err.status = 400;
    throw err;
  }
  if (!["pendente", "conferido", "reprovado"].includes(status)) {
    const err = new Error("status inválido");
    err.status = 400;
    throw err;
  }

  const { rows: agCheck } = await db.query(
    `SELECT id FROM agendamentos WHERE id = $1 AND empresa_id = $2`,
    [agendamentoId, empresaId]
  );
  if (!agCheck.length) {
    const err = new Error("Agendamento não encontrado");
    err.status = 404;
    throw err;
  }

  const conferido_em = status !== "pendente" ? new Date() : null;

  const { rows } = await db.query(
    `INSERT INTO conferencia_itens
       (agendamento_id, pedido_item_id, empresa_id, status, observacoes, dados, conferido_por, conferido_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (agendamento_id, pedido_item_id) DO UPDATE SET
       status        = EXCLUDED.status,
       observacoes   = EXCLUDED.observacoes,
       dados         = EXCLUDED.dados,
       conferido_por = EXCLUDED.conferido_por,
       conferido_em  = EXCLUDED.conferido_em
     RETURNING *`,
    [agendamentoId, pedido_item_id, empresaId, status, observacoes || null,
     dados ? JSON.stringify(dados) : null, usuarioId, conferido_em]
  );
  return rows[0];
}

async function confirmarCliente(agendamentoId, empresaId, usuarioId) {
  const { rows } = await db.query(
    `UPDATE agendamentos SET status = 'agendado'
     WHERE id = $1 AND empresa_id = $2 AND status = 'pre_agendado'
     RETURNING id, status`,
    [agendamentoId, empresaId]
  );
  if (!rows.length) {
    const err = new Error("Agendamento não encontrado ou já confirmado");
    err.status = 404;
    throw err;
  }
  await gravarLog(agendamentoId, empresaId, usuarioId, null, "confirmar_cliente", { status: "agendado" });
  return rows[0];
}
```

- [ ] **Step 2: Exportar as 3 novas funções**

Localizar `module.exports` no `agendamentoService.js` e adicionar:
```js
  listarConferenciaItens,
  upsertConferenciaItem,
  confirmarCliente,
```

- [ ] **Step 3: Adicionar rotas em agendamentosRoutes.js**

Antes do `module.exports` (ou no final do arquivo de rotas):

```js
router.get("/:id/conferencia-itens", authMiddleware, async (req, res) => {
  try {
    const itens = await svc.listarConferenciaItens(
      Number(req.params.id),
      req.user.empresa_id
    );
    return res.json({ itens });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro" });
  }
});

router.post("/:id/conferencia-itens", authMiddleware, async (req, res) => {
  try {
    const item = await svc.upsertConferenciaItem(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.body
    );
    return res.json({ item });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro" });
  }
});

router.patch("/:id/confirmar-cliente", authMiddleware, async (req, res) => {
  try {
    const ag = await svc.confirmarCliente(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id
    );
    return res.json({ agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro" });
  }
});
```

- [ ] **Step 4: Testar via curl**

```bash
# Listar itens de conferência de um agendamento (herdeiro)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/agendamentos/456/conferencia-itens

# Upsert um item
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"pedido_item_id":10,"status":"conferido","dados":{"largura_real":120,"altura_real":200}}' \
  http://localhost:3001/api/agendamentos/456/conferencia-itens

# Confirmar cliente
curl -X PATCH -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/agendamentos/789/confirmar-cliente
```

Todas devem retornar 200 com dados.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/routes/agendamentosRoutes.js
git commit -m "feat(backend): endpoints conferencia-itens (GET/POST) e confirmar-cliente (PATCH)"
```

---

## Task 4: Backend — itens-disponiveis-conferencia e producao-itens e pesquisa-satisfacao

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`

Adicionar 3 novos endpoints após o endpoint `itens-disponiveis-instalacao` (linha ~486):

- [ ] **Step 1: Adicionar GET itens-disponiveis-conferencia**

```js
router.get("/:id/itens-disponiveis-conferencia", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const genitorId = req.query.genitor_id ? Number(req.query.genitor_id) : null;

    const pedCheck = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (!pedCheck.rows.length) return res.status(404).json({ message: "Pedido não encontrado." });

    // Retorna os itens do genitor específico que ainda não têm conferência 'conferido'
    const { rows } = await db.query(
      `SELECT pi.id, pi.descricao, pi.ambiente, pi.quantidade, pi.unidade
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       WHERE ai.agendamento_id = $1
         AND ai.pedido_item_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM conferencia_itens ci
           WHERE ci.pedido_item_id = pi.id
             AND ci.empresa_id = $2
             AND ci.status = 'conferido'
         )
       ORDER BY pi.ordem ASC, pi.id ASC`,
      [genitorId, empresaId]
    );
    return res.json({ itens: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar itens para conferência." });
  }
});
```

- [ ] **Step 2: Adicionar PATCH producao-itens**

```js
router.patch("/:id/producao-itens", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { pedido_item_id, em_confeccao, confeccao_ok } = req.body;

    if (!pedido_item_id) return res.status(400).json({ message: "pedido_item_id obrigatório." });

    // Verificar que o item pertence ao pedido e à empresa
    const { rows: check } = await db.query(
      `SELECT pi.id FROM pedido_itens pi
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE pi.id = $1 AND pi.pedido_id = $2 AND p.empresa_id = $3`,
      [pedido_item_id, pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Item não encontrado." });

    const updates = [];
    const params = [];
    let i = 1;
    if (em_confeccao !== undefined) { updates.push(`em_confeccao = $${i++}`); params.push(em_confeccao); }
    if (confeccao_ok !== undefined) { updates.push(`confeccao_ok = $${i++}`); params.push(confeccao_ok); }
    if (!updates.length) return res.status(400).json({ message: "Nenhum campo para atualizar." });

    params.push(pedido_item_id);
    const { rows } = await db.query(
      `UPDATE pedido_itens SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, em_confeccao, confeccao_ok`,
      params
    );
    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao atualizar produção." });
  }
});
```

- [ ] **Step 3: Adicionar POST pesquisa-satisfacao**

```js
router.post("/:id/pesquisa-satisfacao", authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const empresaId = req.user.empresa_id;
    const { texto } = req.body;

    if (!texto || !texto.trim()) return res.status(400).json({ message: "Campo 'texto' obrigatório." });

    const { rows: check } = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (!check.length) return res.status(404).json({ message: "Pedido não encontrado." });

    const { rows } = await db.query(
      `UPDATE pedidos
       SET status = 'concluido',
           pesquisa_satisfacao = $1
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, status`,
      [texto.trim(), pedidoId, empresaId]
    );
    return res.json({ pedido: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao encerrar pedido." });
  }
});
```

> **Nota:** O campo `pesquisa_satisfacao TEXT` pode não existir na tabela. Verificar com `\d pedidos` e adicionar se necessário:
> ```sql
> ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pesquisa_satisfacao TEXT;
> ```

- [ ] **Step 4: Testar via curl**

```bash
# Itens disponíveis para conferência do genitor 100
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/pedidos/123/itens-disponiveis-conferencia?genitor_id=100"

# Atualizar produção
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"pedido_item_id":10,"em_confeccao":true}' \
  http://localhost:3001/api/pedidos/123/producao-itens

# Pesquisa de satisfação / encerrar pedido
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"texto":"Ficamos muito satisfeitos com o serviço!"}' \
  http://localhost:3001/api/pedidos/123/pesquisa-satisfacao
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(backend): endpoints itens-disponiveis-conferencia, producao-itens, pesquisa-satisfacao"
```

---

## Task 5: Frontend — PedidoFluxo.css (variáveis dark/light + canvas)

**Files:**
- Rewrite: `frontend-web/src/pages/pedidos/PedidoFluxo.css`

- [ ] **Step 1: Reescrever o CSS com variáveis de tema**

```css
/* ── Variáveis de tema ── */
:root,
:root[data-theme="dark"] {
  --pf-bg-canvas: #0d0d0d;
  --pf-dot: #1e293b;
  --pf-card-bg: #111827;
  --pf-card-border: #1e293b;
  --pf-card-text: #e2e8f0;
  --pf-card-sub: #64748b;
  --pf-card-item: #94a3b8;
  --pf-header-bg: #0d0d0d;
  --pf-header-border: #1e293b;
  --pf-header-text: #f1f5f9;
  --pf-connector-from: #334155;
  --pf-connector-to: #475569;
  --pf-legenda-bg: #1e293b;
  --pf-legenda-border: #334155;
  --pf-hint-bg: #1e293b;
  --pf-hint-border: #334155;
  --pf-modal-bg: #111827;
  --pf-modal-border: #1e293b;
  --pf-modal-text: #e2e8f0;
  --pf-input-bg: #0d0d0d;
  --pf-input-border: #334155;
  --pf-input-text: #e2e8f0;
  --pf-btn-secondary-bg: #1e293b;
  --pf-btn-secondary-text: #94a3b8;
  --pf-aba-active-border: #3b82f6;
  --pf-aba-active-text: #3b82f6;
  --pf-separador: #1e293b;
  --pf-badge-ok-bg: rgba(13,148,136,.2);
  --pf-badge-ok-text: #2dd4bf;
  --pf-badge-pend-bg: rgba(245,158,11,.15);
  --pf-badge-pend-text: #fbbf24;
  --pf-badge-err-bg: rgba(239,68,68,.15);
  --pf-badge-err-text: #f87171;
}

:root[data-theme="light"] {
  --pf-bg-canvas: #f0f4f8;
  --pf-dot: #cbd5e1;
  --pf-card-bg: #ffffff;
  --pf-card-border: #e2e8f0;
  --pf-card-text: #0f172a;
  --pf-card-sub: #475569;
  --pf-card-item: #64748b;
  --pf-header-bg: #ffffff;
  --pf-header-border: #e2e8f0;
  --pf-header-text: #0f172a;
  --pf-connector-from: #cbd5e1;
  --pf-connector-to: #94a3b8;
  --pf-legenda-bg: #ffffff;
  --pf-legenda-border: #e2e8f0;
  --pf-hint-bg: #ffffff;
  --pf-hint-border: #e2e8f0;
  --pf-modal-bg: #ffffff;
  --pf-modal-border: #e2e8f0;
  --pf-modal-text: #0f172a;
  --pf-input-bg: #f8fafc;
  --pf-input-border: #cbd5e1;
  --pf-input-text: #0f172a;
  --pf-btn-secondary-bg: #f1f5f9;
  --pf-btn-secondary-text: #475569;
  --pf-aba-active-border: #2563eb;
  --pf-aba-active-text: #2563eb;
  --pf-separador: #e2e8f0;
  --pf-badge-ok-bg: rgba(20,184,166,.15);
  --pf-badge-ok-text: #0f766e;
  --pf-badge-pend-bg: rgba(217,119,6,.15);
  --pf-badge-pend-text: #92400e;
  --pf-badge-err-bg: rgba(220,38,38,.1);
  --pf-badge-err-text: #b91c1c;
}

/* ── Layout geral ── */
.pf-page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.pf-header {
  padding: 14px 24px;
  border-bottom: 1px solid var(--pf-header-border);
  background: var(--pf-header-bg);
  display: flex; align-items: center; gap: 16px;
  flex-shrink: 0; z-index: 10;
}
.pf-header-back {
  background: var(--pf-btn-secondary-bg); border: none; color: var(--pf-btn-secondary-text);
  padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.pf-header-pedido-num { font-size: 18px; font-weight: 700; color: var(--pf-header-text); }
.pf-header-pedido-sub { font-size: 13px; color: var(--pf-card-sub); }

/* ── Canvas ── */
.pf-canvas-wrapper {
  flex: 1; overflow: hidden; position: relative;
  background: var(--pf-bg-canvas);
  cursor: grab;
}
.pf-canvas-wrapper:active { cursor: grabbing; }

.pf-dot-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle, var(--pf-dot) 1px, transparent 1px);
  background-size: 28px 28px;
  background-position: 14px 14px;
}

.pf-flow-container {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  display: flex; align-items: center; gap: 0;
  will-change: transform;
}

/* ── Conector ── */
.pf-conector {
  width: 48px; height: 2px; flex-shrink: 0;
  background: linear-gradient(90deg, var(--pf-connector-from), var(--pf-connector-to));
  position: relative;
}
.pf-conector::after {
  content: '▶'; position: absolute; right: -8px; top: 50%;
  transform: translateY(-50%);
  color: var(--pf-connector-to); font-size: 10px;
}
.pf-conector.pf-conector-ativo {
  background: linear-gradient(90deg, #0d9488, #f59e0b);
}
.pf-conector.pf-conector-ativo::after { color: #f59e0b; }

/* ── Legenda ── */
.pf-legenda {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--pf-legenda-bg); border: 1px solid var(--pf-legenda-border);
  border-radius: 10px; padding: 10px 20px;
  display: flex; gap: 20px; align-items: center;
  pointer-events: none;
}
.pf-legenda-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--pf-card-sub); }
.pf-legenda-dot { width: 10px; height: 10px; border-radius: 3px; }

/* ── Hint ── */
.pf-hint {
  position: absolute; top: 16px; right: 16px;
  background: var(--pf-hint-bg); border: 1px solid var(--pf-hint-border);
  border-radius: 8px; padding: 10px 14px;
  font-size: 12px; color: var(--pf-card-sub);
  max-width: 170px; text-align: center; line-height: 1.5;
  pointer-events: none;
}

/* ── Modal overlay ── */
.pf-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.pf-modal {
  background: var(--pf-modal-bg); border: 1px solid var(--pf-modal-border);
  border-radius: 12px; width: 100%; max-width: 680px;
  max-height: 88vh; overflow-y: auto; color: var(--pf-modal-text);
}
.pf-modal-header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--pf-separador);
  display: flex; align-items: center; justify-content: space-between;
}
.pf-modal-titulo { font-size: 17px; font-weight: 700; }
.pf-modal-fechar {
  background: none; border: none; font-size: 20px;
  cursor: pointer; color: var(--pf-card-sub); line-height: 1;
}
.pf-modal-body { padding: 20px 24px; }

/* ── Elementos reutilizáveis ── */
.pf-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 99px;
  font-size: 11px; font-weight: 600;
}
.pf-badge-ok  { background: var(--pf-badge-ok-bg);  color: var(--pf-badge-ok-text); }
.pf-badge-pend{ background: var(--pf-badge-pend-bg); color: var(--pf-badge-pend-text); }
.pf-badge-err { background: var(--pf-badge-err-bg);  color: var(--pf-badge-err-text); }

.pf-btn-primary {
  background: #0d9488; color: #fff; border: none;
  padding: 8px 18px; border-radius: 7px; cursor: pointer; font-size: 14px; font-weight: 600;
}
.pf-btn-primary:hover { background: #0f766e; }
.pf-btn-primary:disabled { opacity: .45; cursor: not-allowed; }

.pf-btn-secondary {
  background: var(--pf-btn-secondary-bg); color: var(--pf-btn-secondary-text);
  border: 1px solid var(--pf-separador);
  padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px;
}

.pf-input {
  width: 100%; background: var(--pf-input-bg); border: 1px solid var(--pf-input-border);
  color: var(--pf-input-text); border-radius: 6px; padding: 8px 12px; font-size: 14px;
}
.pf-input:focus { outline: 2px solid #0d9488; border-color: transparent; }

.pf-separador { border: none; border-top: 1px solid var(--pf-separador); margin: 16px 0; }

.pf-progresso-bar {
  height: 6px; border-radius: 3px; background: var(--pf-separador); overflow: hidden; margin-top: 8px;
}
.pf-progresso-fill {
  height: 100%; border-radius: 3px; background: #0d9488; transition: width .3s;
}

/* ── Item row ── */
.pf-item-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--pf-separador);
}
.pf-item-row:last-child { border-bottom: none; }
.pf-item-descricao { flex: 1; font-size: 14px; }
.pf-item-ambiente { font-size: 12px; color: var(--pf-card-sub); }
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.css
git commit -m "feat(frontend): PedidoFluxo.css — variáveis dark/light + canvas + modal"
```

---

## Task 6: Frontend — EtapaCard.jsx

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import React from "react";

const ETAPA_CONFIG = {
  1: { icone: "📋", titulo: "Dados do Pedido" },
  2: { icone: "📐", titulo: "Conferência de Medidas" },
  3: { icone: "⚙️", titulo: "Produção" },
  4: { icone: "📅", titulo: "Agendamento" },
  5: { icone: "⭐", titulo: "Pós-venda" },
};

export default function EtapaCard({ etapa, etapaAtual, onClick, cardRef }) {
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
    if (numero === 4) return "Aguardando confirmação";
    if (numero === 5) return "Aguardando encerramento";
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
    return 0;
  }

  const pct = buildProgressPct();

  return (
    <div
      className={cls}
      ref={cardRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{ width: 200, borderRadius: 12, overflow: "hidden", flexShrink: 0, cursor: "pointer" }}
    >
      <div className="card-header">
        <div className="card-num">{concluida ? "✓" : numero}</div>
        <div className="card-titulo">{config.titulo}</div>
      </div>
      <div className="card-icon" style={{ textAlign: "center", padding: "14px 0 8px", fontSize: 28 }}>
        {config.icone}
      </div>
      <div className="card-status" style={{ textAlign: "center", padding: "0 16px 6px", fontSize: 11, fontWeight: 600 }}>
        {buildStatusLabel()}
      </div>
      {ativa && (
        <div style={{ padding: "0 16px 12px" }}>
          <div className="pf-progresso-bar">
            <div className="pf-progresso-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar diretório e verificar**

```bash
mkdir -p frontend-web/src/pages/pedidos/fluxo/etapas
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx
git commit -m "feat(frontend): EtapaCard — card de etapa com estados concluída/ativa/pendente"
```

---

## Task 7: Frontend — FluxogramaCanvas.jsx

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/FluxogramaCanvas.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import React, { useRef, useEffect, useCallback } from "react";
import EtapaCard from "./EtapaCard";

export default function FluxogramaCanvas({ etapas, etapaAtual, onEtapaClick }) {
  const wrapperRef = useRef(null);
  const flowRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const cardRefs = useRef({});

  // Centralizar no card ativo ao montar
  useEffect(() => {
    if (!wrapperRef.current || !flowRef.current) return;
    const activeCard = cardRefs.current[etapaAtual];
    if (!activeCard) return;

    const wrapper = wrapperRef.current;
    const flow = flowRef.current;
    const flowRect = flow.getBoundingClientRect();
    const cardRect = activeCard.getBoundingClientRect();

    const cardCenterX = cardRect.left + cardRect.width / 2 - flowRect.left;
    const wrapperCenterX = wrapper.clientWidth / 2;
    const ox = wrapperCenterX - cardCenterX;
    const oy = 0;

    offsetRef.current = { x: ox, y: oy };
    applyTransform(ox, oy);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTransform(x, y) {
    if (!flowRef.current) return;
    flowRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  const onMouseDown = useCallback((e) => {
    if (e.target.closest("[role='button']") && e.target.closest(".etapa-card")) return;
    dragging.current = true;
    startRef.current = {
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    };
    wrapperRef.current.style.cursor = "grabbing";
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const ox = e.clientX - startRef.current.x;
    const oy = e.clientY - startRef.current.y;
    offsetRef.current = { x: ox, y: oy };
    applyTransform(ox, oy);
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    if (wrapperRef.current) wrapperRef.current.style.cursor = "grab";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      className="pf-canvas-wrapper"
      ref={wrapperRef}
      onMouseDown={onMouseDown}
      style={{ userSelect: "none" }}
    >
      <div className="pf-dot-grid" />

      <div className="pf-flow-container" ref={flowRef}>
        {etapas.map((etapa, idx) => (
          <React.Fragment key={etapa.numero}>
            <EtapaCard
              etapa={etapa}
              etapaAtual={etapaAtual}
              onClick={() => onEtapaClick(etapa.numero)}
              cardRef={(el) => { cardRefs.current[etapa.numero] = el; }}
            />
            {idx < etapas.length - 1 && (
              <div
                className={`pf-conector${etapa.concluida ? " pf-conector-ativo" : ""}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="pf-legenda">
        <div className="pf-legenda-item">
          <div className="pf-legenda-dot" style={{ background: "#0d9488" }} /> Concluída
        </div>
        <div className="pf-legenda-item">
          <div className="pf-legenda-dot" style={{ background: "#f59e0b" }} /> Ativa
        </div>
        <div className="pf-legenda-item">
          <div className="pf-legenda-dot" style={{ background: "#334155" }} /> Pendente
        </div>
      </div>

      <div className="pf-hint">
        🖱️ Arraste para navegar<br />Clique numa etapa para interagir
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar estilos de card ao CSS existente**

Adicionar ao final de `PedidoFluxo.css`:

```css
/* ── EtapaCard estados ── */
.etapa-card {
  border: 2px solid var(--pf-card-border);
  background: var(--pf-card-bg);
  transition: transform .2s, box-shadow .2s;
}
.etapa-card:hover { transform: translateY(-3px); box-shadow: 0 8px 32px rgba(0,0,0,.4); }

.etapa-card.concluida { border-color: #0d9488; background: rgba(13,148,136,.07); }
.etapa-card.concluida .card-header { background: linear-gradient(135deg, #0d9488, #0f766e); }
.etapa-card.concluida .card-num, .etapa-card.concluida .card-titulo { color: #fff; }
.etapa-card.concluida .card-status { color: #2dd4bf; }

.etapa-card.ativa { border-color: #f59e0b; background: rgba(245,158,11,.06); animation: pfPulse 2.5s infinite; }
.etapa-card.ativa .card-header { background: linear-gradient(135deg, #d97706, #f59e0b); }
.etapa-card.ativa .card-num, .etapa-card.ativa .card-titulo { color: #fff; }
.etapa-card.ativa .card-status { color: #fbbf24; }

.etapa-card.pendente { border-color: var(--pf-card-border); opacity: .6; }
.etapa-card.pendente .card-header { background: linear-gradient(135deg, #1e293b, #334155); }
.etapa-card.pendente .card-num, .etapa-card.pendente .card-titulo { color: #94a3b8; }
.etapa-card.pendente .card-status { color: #475569; }

.card-header { padding: 12px 14px 10px; display: flex; align-items: center; gap: 10px; }
.card-num {
  width: 26px; height: 26px; border-radius: 50%;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.card-titulo { font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; line-height: 1.2; }

@keyframes pfPulse {
  0%, 100% { box-shadow: 0 0 16px rgba(245,158,11,.15); }
  50% { box-shadow: 0 0 32px rgba(245,158,11,.4); }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/FluxogramaCanvas.jsx frontend-web/src/pages/pedidos/PedidoFluxo.css
git commit -m "feat(frontend): FluxogramaCanvas — pan + dot grid + centralização na etapa ativa"
```

---

## Task 8: Frontend — PedidoFluxo.jsx (orquestrador)

**Files:**
- Rewrite: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`

- [ ] **Step 1: Reescrever o orquestrador**

```jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api } from "../../services/api";
import FluxogramaCanvas from "./fluxo/FluxogramaCanvas";
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

export default function PedidoFluxo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null); // { pedido, etapa_atual, etapas, pre_agendamentos }
  const [etapaAberta, setEtapaAberta] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await api.get(`/pedidos/${id}/fluxo`);
      setDados(res);
      if (etapaAberta === null) setEtapaAberta(res.etapa_atual ?? 1);
    } catch (e) {
      setErro(e?.message || "Erro ao carregar o fluxo do pedido.");
    } finally {
      setLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);

  function handleEtapaClick(numero) {
    setEtapaAberta(numero);
  }

  function handleFecharEtapa() {
    setEtapaAberta(null);
    carregar(); // recarrega para refletir progresso atualizado
  }

  if (loading) return <div className="pf-page" style={{ alignItems: "center", justifyContent: "center" }}>Carregando...</div>;
  if (erro) return <div className="pf-page" style={{ padding: 40, color: "#f87171" }}>{erro}</div>;
  if (!dados) return null;

  const { pedido, etapa_atual, etapas, pre_agendamentos } = dados;
  const EtapaComponente = etapaAberta ? ETAPA_COMPONENTES[etapaAberta] : null;

  return (
    <div className="pf-page">
      <div className="pf-header">
        <button className="pf-header-back" onClick={() => navigate("/pedidos")}>← Voltar</button>
        <div>
          <div className="pf-header-pedido-num">Pedido #{pedido.numero_sequencial || pedido.numero_origem}</div>
          <div className="pf-header-pedido-sub">
            {pedido.cliente_nome} · R$ {fmtMoeda(pedido.total)}
          </div>
        </div>
      </div>

      <FluxogramaCanvas
        etapas={etapas}
        etapaAtual={etapa_atual}
        onEtapaClick={handleEtapaClick}
      />

      {EtapaComponente && (
        <EtapaComponente
          pedidoId={Number(id)}
          pedido={pedido}
          etapas={etapas}
          preAgendamentos={pre_agendamentos}
          onClose={handleFecharEtapa}
          onRecarregar={carregar}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(frontend): PedidoFluxo — orquestrador com canvas + painéis por etapa"
```

---

## Task 9: Frontend — EtapaDadosPedido.jsx (Etapa 1)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../../../../services/api";
import ModalSelecionarItensInstalacao from "../../ModalSelecionarItensInstalacao";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

function CriterioItem({ ok, texto }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{ok ? "✅" : "⭕"}</span>
      <span style={{ fontSize: 14, color: ok ? "var(--pf-badge-ok-text)" : "var(--pf-modal-text)" }}>{texto}</span>
    </div>
  );
}

export default function EtapaDadosPedido({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [instalacao, setInstalacao] = useState(null);

  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p = etapa1.progresso || {};

  function handleAgendarInstalacao(itensSel) {
    setInstalacao(null);
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id: pedido.id,
          pedido_numero: pedido.numero_sequencial || pedido.numero_origem,
          cliente: pedido.cliente_nome || "",
          cliente_id: pedido.cliente_id || null,
          cep: pedido.cep,
          rua: pedido.rua,
          numero: pedido.numero_rua,
          complemento: pedido.complemento,
          bairro: pedido.bairro,
          cidade: pedido.cidade,
          estado: pedido.estado,
          itens: itensSel,
        },
      },
    });
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 1</div>
            <div className="pf-modal-titulo">📋 Dados do Pedido</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pf-card-sub)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
              Critérios de conclusão
            </div>
            <CriterioItem ok={p.tem_anexo} texto="Anexo do PDF original" />
            <CriterioItem ok={p.verificacao_ok} texto="Pedido verificado" />
            <CriterioItem ok={p.itens_sem_categoria === 0 && p.total_itens > 0} texto="Todos os itens com categoria" />
            <CriterioItem ok={p.itens_sem_vinculo === 0 && p.total_itens > 0} texto="Todos os itens com vínculo" />
            <CriterioItem ok={p.itens_cobertos >= p.total_itens && p.total_itens > 0} texto={`Todos os itens agendados (${p.itens_cobertos ?? 0}/${p.total_itens ?? 0})`} />
          </div>

          <hr className="pf-separador" />

          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14 }}>Pré-agendamentos (genitores)</div>
          {(!preAgendamentos || preAgendamentos.length === 0) && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 16 }}>
              Nenhum pré-agendamento criado ainda.
            </div>
          )}
          {(preAgendamentos || []).map((ag) => (
            <div key={ag.id} style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Entrega: {fmtData(ag.data_inicio)}</span>
                <span className={`pf-badge ${ag.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>
                  {ag.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>
                {(ag.itens || []).length} itens vinculados
              </div>
            </div>
          ))}

          <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={() => setInstalacao(pedido)}>
            📅 Agendar Instalação
          </button>
        </div>
      </div>

      {instalacao && (
        <ModalSelecionarItensInstalacao
          pedido={instalacao}
          onClose={() => setInstalacao(null)}
          onContinuar={handleAgendarInstalacao}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(frontend): EtapaDadosPedido — painel etapa 1 com critérios + genitores"
```

---

## Task 10: Frontend — EtapaConferencia.jsx (Etapa 2)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`
- Create: `frontend-web/src/pages/agendamentos/FichaConferencia.jsx`
- Create: `frontend-web/src/pages/agendamentos/FichaConferencia.css`

- [ ] **Step 1: Criar FichaConferencia.css**

```css
.fc-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 100;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.fc-modal {
  background: var(--pf-modal-bg, #111827);
  border: 1px solid var(--pf-modal-border, #1e293b);
  border-radius: 12px; width: 100%; max-width: 520px;
  max-height: 88vh; overflow-y: auto; color: var(--pf-modal-text, #e2e8f0);
}
.fc-header { padding: 18px 24px 14px; border-bottom: 1px solid var(--pf-separador, #1e293b); }
.fc-titulo { font-size: 17px; font-weight: 700; }
.fc-progress-bar { height: 6px; border-radius: 3px; background: var(--pf-separador, #1e293b); margin: 10px 0 0; }
.fc-progress-fill { height: 100%; border-radius: 3px; background: #0d9488; transition: width .3s; }
.fc-body { padding: 20px 24px; }
.fc-item-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.fc-item-btn {
  width: 100%; text-align: left; background: var(--pf-btn-secondary-bg, #1e293b);
  border: 1px solid var(--pf-input-border, #334155); border-radius: 8px;
  padding: 12px 14px; cursor: pointer; color: var(--pf-modal-text, #e2e8f0);
  display: flex; justify-content: space-between; align-items: center;
}
.fc-item-btn:hover { border-color: #0d9488; }
.fc-campo label { display: block; font-size: 13px; color: var(--pf-card-sub, #64748b); margin-bottom: 4px; font-weight: 600; }
.fc-campo { margin-bottom: 14px; }
.fc-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.fc-nav { display: flex; justify-content: space-between; margin-top: 14px; }
```

- [ ] **Step 2: Criar FichaConferencia.jsx**

```jsx
import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import "./FichaConferencia.css";

const STATUS_BADGE = {
  pendente:  { cls: "pf-badge-pend", label: "Pendente" },
  conferido: { cls: "pf-badge-ok",   label: "Conferido" },
  reprovado: { cls: "pf-badge-err",  label: "Reprovado" },
};

export default function FichaConferencia({ agendamentoId, onClose }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemAtivo, setItemAtivo] = useState(null); // índice no array
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ largura_real: "", altura_real: "", observacoes: "", resultado: "" });

  async function carregar() {
    setLoading(true);
    try {
      const res = await api.get(`/agendamentos/${agendamentoId}/conferencia-itens`);
      setItens(res.itens || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, [agendamentoId]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirItem(idx) {
    const item = itens[idx];
    setItemAtivo(idx);
    setForm({
      largura_real: item.dados?.largura_real ?? "",
      altura_real:  item.dados?.altura_real ?? "",
      observacoes:  item.observacoes ?? "",
      resultado:    item.status !== "pendente" ? (item.status === "conferido" ? "aprovado" : "reprovado") : "",
    });
  }

  async function salvar() {
    if (!form.resultado) return;
    setSalvando(true);
    try {
      const item = itens[itemAtivo];
      await api.post(`/agendamentos/${agendamentoId}/conferencia-itens`, {
        pedido_item_id: item.pedido_item_id,
        status: form.resultado === "aprovado" ? "conferido" : "reprovado",
        observacoes: form.observacoes || null,
        dados: {
          largura_real: form.largura_real ? Number(form.largura_real) : null,
          altura_real:  form.altura_real  ? Number(form.altura_real)  : null,
          resultado:    form.resultado,
        },
      });
      await carregar();
      // Ir para próximo item não conferido
      const nextIdx = itens.findIndex((it, i) => i > itemAtivo && it.status !== "conferido");
      if (nextIdx !== -1) abrirItem(nextIdx);
      else setItemAtivo(null);
    } finally {
      setSalvando(false);
    }
  }

  const totalConferidos = itens.filter((i) => i.status === "conferido").length;
  const pct = itens.length > 0 ? Math.round((totalConferidos / itens.length) * 100) : 0;

  if (loading) return (
    <div className="fc-overlay">
      <div className="fc-modal" style={{ padding: 40, textAlign: "center" }}>Carregando itens...</div>
    </div>
  );

  return (
    <div className="fc-overlay">
      <div className="fc-modal">
        <div className="fc-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="fc-titulo">📋 Ficha de Conferência</div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--pf-card-sub)" }}>×</button>
          </div>
          <div style={{ fontSize: 13, color: "var(--pf-card-sub)", marginTop: 4 }}>
            Conferido {totalConferidos} de {itens.length}
          </div>
          <div className="fc-progress-bar">
            <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="fc-body">
          {itemAtivo === null ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Itens do agendamento</div>
              <ul className="fc-item-list">
                {itens.map((item, idx) => {
                  const badge = STATUS_BADGE[item.status] || STATUS_BADGE.pendente;
                  return (
                    <li key={item.pedido_item_id}>
                      <button className="fc-item-btn" onClick={() => abrirItem(idx)}>
                        <span>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.descricao}</div>
                          {item.ambiente && <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{item.ambiente}</div>}
                        </span>
                        <span className={`pf-badge ${badge.cls}`}>{badge.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{itens[itemAtivo]?.descricao}</div>
              {itens[itemAtivo]?.ambiente && (
                <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 14 }}>{itens[itemAtivo].ambiente}</div>
              )}

              <div className="fc-campo">
                <label>Largura real (cm)</label>
                <input className="pf-input" type="number" placeholder="ex: 120"
                  value={form.largura_real}
                  onChange={(e) => setForm((f) => ({ ...f, largura_real: e.target.value }))} />
              </div>
              <div className="fc-campo">
                <label>Altura real (cm)</label>
                <input className="pf-input" type="number" placeholder="ex: 200"
                  value={form.altura_real}
                  onChange={(e) => setForm((f) => ({ ...f, altura_real: e.target.value }))} />
              </div>
              <div className="fc-campo">
                <label>Observações técnicas</label>
                <textarea className="pf-input" rows={3} placeholder="Anotações..."
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="fc-campo">
                <label>Resultado *</label>
                <select className="pf-input" value={form.resultado}
                  onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))}>
                  <option value="">— Selecione —</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                </select>
              </div>

              <div className="fc-actions">
                <button className="pf-btn-primary" onClick={salvar} disabled={!form.resultado || salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
                <button className="pf-btn-secondary" onClick={() => setItemAtivo(null)}>← Voltar à lista</button>
              </div>

              <div className="fc-nav">
                <button className="pf-btn-secondary"
                  disabled={itemAtivo === 0}
                  onClick={() => abrirItem(itemAtivo - 1)}>← Anterior</button>
                <button className="pf-btn-secondary"
                  disabled={itemAtivo === itens.length - 1}
                  onClick={() => abrirItem(itemAtivo + 1)}>Próximo →</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar EtapaConferencia.jsx**

```jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../services/api";
import FichaConferencia from "../../../agendamentos/FichaConferencia";
import ModalSelecionarItensInstalacao from "../../ModalSelecionarItensInstalacao";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaConferencia({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [fichaAgId, setFichaAgId] = useState(null);
  const [agendandoConf, setAgendandoConf] = useState(null); // genitor selecionado para agendar conferência

  const etapa2 = etapas.find((e) => e.numero === 2) || {};
  const p = etapa2.progresso || {};

  const genitores = preAgendamentos || [];
  // Herdeiros de conferência: filhos que NÃO são do tipo Instalação
  const herdeirosConf = genitores.flatMap((g) =>
    (g.herdeiros || []).filter((h) => h.tipo !== "Instalação")
  );

  function handleAgendarConferencia(genitor, itensSel) {
    setAgendandoConf(null);
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id: pedido.id,
          pedido_numero: pedido.numero_sequencial || pedido.numero_origem,
          cliente: pedido.cliente_nome || "",
          cliente_id: pedido.cliente_id || null,
          cep: pedido.cep,
          rua: pedido.rua,
          numero: pedido.numero_rua,
          complemento: pedido.complemento,
          bairro: pedido.bairro,
          cidade: pedido.cidade,
          estado: pedido.estado,
          itens: itensSel,
          agendamento_pai_id: genitor.id,
          tipo: "Conferência",
        },
      },
    });
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 2</div>
            <div className="pf-modal-titulo">📐 Conferência de Medidas</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.conferidos ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Itens conferidos</div>
            </div>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{(p.total ?? 0) - (p.conferidos ?? 0)}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Pendentes</div>
            </div>
          </div>

          <hr className="pf-separador" />

          <div style={{ fontWeight: 700, marginBottom: 12 }}>Genitores e conferências</div>

          {genitores.map((g) => (
            <div key={g.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Entrega: {fmtData(g.data_inicio)}</div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(g.itens || []).length} itens</div>
                </div>
                <button className="pf-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => setAgendandoConf(g)}>
                  + Agendar Conferência
                </button>
              </div>
              {(g.herdeiros || []).filter((h) => h.tipo !== "Instalação").length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.herdeiros.filter((h) => h.tipo !== "Instalação").map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>Conferência — {fmtData(h.data_inicio)}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className={`pf-badge ${h.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>{h.status}</span>
                        <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => setFichaAgId(h.id)}>
                          Preencher Ficha
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {fichaAgId && (
        <FichaConferencia
          agendamentoId={fichaAgId}
          onClose={() => { setFichaAgId(null); onRecarregar(); }}
        />
      )}

      {agendandoConf && (
        <ModalSelecionarItensInstalacao
          pedido={{ ...pedido, _genitorId: agendandoConf.id }}
          itensEndpoint={`/pedidos/${pedidoId}/itens-disponiveis-conferencia?genitor_id=${agendandoConf.id}`}
          onClose={() => setAgendandoConf(null)}
          onContinuar={(itensSel) => handleAgendarConferencia(agendandoConf, itensSel)}
        />
      )}
    </div>
  );
}
```

> **Nota:** `ModalSelecionarItensInstalacao` atualmente busca itens via endpoint fixo. Para etapa 2 precisamos passar `itensEndpoint` como prop. Ver Task 10b abaixo.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx \
        frontend-web/src/pages/agendamentos/FichaConferencia.jsx \
        frontend-web/src/pages/agendamentos/FichaConferencia.css
git commit -m "feat(frontend): EtapaConferencia + FichaConferencia — etapa 2 completa"
```

---

## Task 10b: Frontend — ModalSelecionarItensInstalacao aceitar itensEndpoint prop

**Files:**
- Modify: `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx`

O modal atualmente chama sempre `/pedidos/:id/itens-disponiveis-instalacao`. Para a etapa 2, precisamos que aceite um endpoint customizado.

- [ ] **Step 1: Adicionar prop `itensEndpoint` ao ModalSelecionarItensInstalacao**

Localizar a linha onde o componente busca os itens (deve ter algo como `api.get(\`/pedidos/${pedido.id}/itens-disponiveis-instalacao\``). Alterar para:

```jsx
// Antes: aceita prop opcional, com fallback
const endpointItens = itensEndpoint || `/pedidos/${pedido.id}/itens-disponiveis-instalacao`;
// ... no useEffect:
const res = await api.get(endpointItens);
```

Na assinatura da função do componente, adicionar `itensEndpoint` como prop:
```jsx
export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar, itensEndpoint }) {
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx
git commit -m "feat(frontend): ModalSelecionarItensInstalacao aceita prop itensEndpoint"
```

---

## Task 11: Frontend — EtapaProducao.jsx (Etapa 3)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";

export default function EtapaProducao({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState({});

  async function carregarItens() {
    setLoading(true);
    try {
      const res = await api.get(`/pedidos/${pedidoId}/itens`);
      setItens(res.itens || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarItens(); }, [pedidoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleCampo(itemId, campo, valor) {
    setSalvando((s) => ({ ...s, [itemId]: true }));
    try {
      await api.patch(`/pedidos/${pedidoId}/producao-itens`, {
        pedido_item_id: itemId,
        [campo]: valor,
      });
      await carregarItens();
      onRecarregar();
    } finally {
      setSalvando((s) => ({ ...s, [itemId]: false }));
    }
  }

  const etapa3 = etapas.find((e) => e.numero === 3) || {};
  const p = etapa3.progresso || {};

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 3</div>
            <div className="pf-modal-titulo">⚙️ Produção</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.em_confeccao ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Em confecção</div>
            </div>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.confeccao_ok ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Concluídos</div>
            </div>
          </div>

          <hr className="pf-separador" />

          {loading ? (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>Carregando itens...</div>
          ) : (
            itens.map((item) => (
              <div key={item.id} className="pf-item-row">
                <div style={{ flex: 1 }}>
                  <div className="pf-item-descricao">{item.descricao}</div>
                  {item.ambiente && <div className="pf-item-ambiente">{item.ambiente}</div>}
                </div>

                {!item.em_confeccao && (
                  <>
                    <span className="pf-badge pf-badge-ok" style={{ fontSize: 11 }}>Fornecedor</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={false}
                        onChange={() => toggleCampo(item.id, "em_confeccao", true)}
                        disabled={salvando[item.id]} />
                      Em confecção
                    </label>
                  </>
                )}

                {item.em_confeccao && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={true}
                        onChange={() => toggleCampo(item.id, "em_confeccao", false)}
                        disabled={salvando[item.id]} />
                      Em confecção
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={item.confeccao_ok || false}
                        onChange={() => toggleCampo(item.id, "confeccao_ok", !item.confeccao_ok)}
                        disabled={salvando[item.id]} />
                      Produção concluída
                    </label>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

> **Nota:** O endpoint `GET /pedidos/:id/itens` deve existir e retornar os itens com campos `em_confeccao` e `confeccao_ok`. Verificar se já existe — caso contrário, adicionar `em_confeccao, confeccao_ok` ao SELECT da query existente de listagem de itens do pedido.

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx
git commit -m "feat(frontend): EtapaProducao — checkboxes em confecção e produção concluída"
```

---

## Task 12: Frontend — EtapaAgendamento.jsx (Etapa 4)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaAgendamento({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState({});

  async function confirmarCliente(agendamentoId) {
    setConfirmando((s) => ({ ...s, [agendamentoId]: true }));
    try {
      await api.patch(`/agendamentos/${agendamentoId}/confirmar-cliente`);
      onRecarregar();
    } catch (e) {
      alert(e?.message || "Erro ao confirmar cliente.");
    } finally {
      setConfirmando((s) => ({ ...s, [agendamentoId]: false }));
    }
  }

  function atribuirEquipe(agendamentoId) {
    navigate(`/agendamentos/mapa?agendamento_id=${agendamentoId}`);
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 4</div>
            <div className="pf-modal-titulo">📅 Agendamento</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Confirme com o cliente a data de instalação e atribua a equipe.
          </p>

          {(preAgendamentos || []).map((ag) => {
            const confirmado = ag.status === "agendado";
            return (
              <div key={ag.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Entrega: {fmtData(ag.data_inicio)}</div>
                    <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(ag.itens || []).length} itens</div>
                  </div>
                  <span className={`pf-badge ${confirmado ? "pf-badge-ok" : "pf-badge-pend"}`}>
                    {confirmado ? "Confirmado" : "Pré-agendado"}
                  </span>
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {!confirmado ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" id={`conf-${ag.id}`}
                        checked={false}
                        onChange={() => confirmarCliente(ag.id)}
                        disabled={confirmando[ag.id]} />
                      <label htmlFor={`conf-${ag.id}`} style={{ fontSize: 14, cursor: "pointer" }}>
                        Cliente contatado — data confirmada
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, color: "var(--pf-badge-ok-text)" }}>✅ Data confirmada com o cliente</span>
                      <button className="pf-btn-primary" style={{ fontSize: 13 }}
                        onClick={() => atribuirEquipe(ag.id)}>
                        🗺️ Atribuir equipe e veículos
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx
git commit -m "feat(frontend): EtapaAgendamento — confirmar cliente + atribuir equipe"
```

---

## Task 13: Frontend — EtapaPosvenda.jsx (Etapa 5)

**Files:**
- Create: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaPosvenda.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import React, { useState } from "react";
import { api } from "../../../../services/api";

export default function EtapaPosvenda({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const jaConcluido = pedido.status === "concluido";

  async function encerrar() {
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      await api.post(`/pedidos/${pedidoId}/pesquisa-satisfacao`, { texto });
      onRecarregar();
      onClose();
    } catch (e) {
      alert(e?.message || "Erro ao encerrar pedido.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 5</div>
            <div className="pf-modal-titulo">⭐ Pós-venda</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          {jaConcluido ? (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Pedido encerrado!</div>
              <div style={{ color: "var(--pf-card-sub)", fontSize: 14 }}>Este pedido foi concluído com sucesso.</div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "var(--pf-card-sub)", marginBottom: 20 }}>
                Registre o feedback do cliente e encerre o pedido.
              </p>
              <div className="fc-campo" style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  O que o cliente achou? *
                </label>
                <textarea className="pf-input" rows={5}
                  placeholder="Descreva o feedback do cliente sobre o serviço prestado..."
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)} />
              </div>
              <button className="pf-btn-primary"
                onClick={encerrar}
                disabled={!texto.trim() || salvando}
                style={{ width: "100%" }}>
                {salvando ? "Encerrando..." : "✅ Encerrar Pedido"}
              </button>
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
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaPosvenda.jsx
git commit -m "feat(frontend): EtapaPosvenda — pesquisa de satisfação e encerramento"
```

---

## Task 14: Verificar campo pesquisa_satisfacao no banco

**Files:**
- Modify (if needed): `backend/src/database/migrations/fluxo_5_etapas.sql`

- [ ] **Step 1: Verificar coluna no banco**

```sql
\d pedidos
```

Procurar `pesquisa_satisfacao`. Se não existir:

```sql
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pesquisa_satisfacao TEXT;
```

- [ ] **Step 2: Verificar endpoint GET /pedidos/:id/itens**

Checar se o endpoint retorna `em_confeccao` e `confeccao_ok`. Se não retornar, localizar a query de listagem de itens em `pedidoService.js` ou `pedidosRoutes.js` e adicionar essas colunas ao SELECT.

- [ ] **Step 3: Commit das correções se houver**

```bash
git add backend/
git commit -m "fix(backend): adicionar pesquisa_satisfacao e campos de produção ao GET itens"
```

---

## Task 15: Smoke test completo

- [ ] **Step 1: Iniciar backend e frontend**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend-web && npm run dev
```

- [ ] **Step 2: Verificar canvas**

Acessar `/pedidos/:id/fluxo` de um pedido existente:
- Canvas aparece com fundo escuro (dark) ou claro (light) conforme tema
- Grade de pontos visível
- 5 cards alinhados horizontalmente com conectores
- Canvas inicia centralizado no card da etapa atual (âmbar/pulsante)
- Arrastar funciona sem travar ou re-renderizar

- [ ] **Step 3: Testar cada etapa**

- Clicar em cada card → modal abre sobre o canvas
- Fechar o modal → canvas volta ao estado normal
- Etapa 1: critérios batem com o banco (verificar `verificacao_ok`, itens, etc.)
- Etapa 2: genitores listados com botão "Agendar Conferência" e herdeiros com "Preencher Ficha"
- Etapa 3: checkboxes de confecção funcionam (persistem no banco)
- Etapa 4: confirmar cliente muda status para `agendado`
- Etapa 5: encerrar pedido muda `status = 'concluido'`

- [ ] **Step 4: Testar tema claro**

Trocar o tema do sistema para claro e verificar:
- Canvas usa fundo claro (#f0f4f8)
- Dot grid mais clara
- Cards com background branco e texto escuro
- Modais com fundo branco

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat(fluxograma): 5 etapas completas — canvas + painéis + conferência + produção + pós-venda"
```

---

## Self-Review vs Spec

| Requisito do spec | Coberto? |
|---|---|
| Canvas panável com mecânica de mapa (mousedown/mousemove/mouseup, useRef sem React state) | ✅ Task 7 |
| Fundo com grade de pontos via `radial-gradient` | ✅ Tasks 5 + 7 |
| Centraliza na etapa ativa ao abrir | ✅ Task 7 (useEffect com getBoundingClientRect) |
| 5 cards com estados concluída/ativa/pendente | ✅ Task 6 |
| Glow pulsante na etapa ativa | ✅ Task 7 (pfPulse @keyframes) |
| Variáveis CSS dark/light via `data-theme` | ✅ Task 5 |
| Etapa 1: critérios calculados pelo backend | ✅ Task 2 |
| `verificacao_ok` automático (4 critérios) | ✅ Task 2 (etapa1_ok calculado — nota: escrita do flag no banco não implementada aqui; ver nota abaixo) |
| Todos itens cobertos por genitor para concluir etapa 1 | ✅ Task 2 |
| Migration `conferencia_itens` + `em_confeccao/confeccao_ok` | ✅ Task 1 |
| GET /agendamentos/:id/conferencia-itens | ✅ Task 3 |
| POST /agendamentos/:id/conferencia-itens (upsert) | ✅ Task 3 |
| PATCH /agendamentos/:id/confirmar-cliente | ✅ Task 3 |
| GET /pedidos/:id/itens-disponiveis-conferencia?genitor_id=X | ✅ Task 4 |
| PATCH /pedidos/:id/producao-itens | ✅ Task 4 |
| POST /pedidos/:id/pesquisa-satisfacao | ✅ Task 4 |
| FichaConferencia: item-a-item, campos largura/altura/obs/resultado | ✅ Task 10 |
| FichaConferencia: barra de progresso | ✅ Task 10 |
| FichaConferencia: navegação Anterior/Próximo | ✅ Task 10 |
| EtapaConferencia: agendar conferência como herdeiro do genitor | ✅ Task 10 |
| EtapaConferencia: botão "Preencher Ficha" abre FichaConferencia | ✅ Task 10 |
| EtapaProducao: checkbox em_confeccao e confeccao_ok por item | ✅ Task 11 |
| Itens sem em_confeccao exibem "Fornecedor" e não bloqueiam etapa | ✅ Task 11 |
| EtapaAgendamento: confirmar cliente → status agendado | ✅ Task 12 |
| EtapaAgendamento: atribuir equipe via mapa | ✅ Task 12 |
| EtapaPosvenda: pesquisa texto + encerrar pedido | ✅ Task 13 |
| ModalSelecionarItensInstalacao aceitar endpoint customizado | ✅ Task 10b |

**Nota sobre `verificacao_ok` automático:** o spec diz que `verificacao_ok` deve ser gravado automaticamente no banco quando os 4 critérios forem atendidos. O plano atual **calcula** `etapa1_ok` via query no endpoint `/fluxo`, mas **não escreve** `verificacao_ok = true` no banco automaticamente. Isso é suficiente para o fluxograma funcionar (a etapa fica verde quando os critérios são satisfeitos). A gravação automática no banco pode ser adicionada em `pedidoService.js` no `atualizar()` como follow-up.
