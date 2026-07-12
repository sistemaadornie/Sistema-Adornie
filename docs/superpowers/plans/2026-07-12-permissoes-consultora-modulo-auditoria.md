# Permissões de Consultora por Módulo + Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar, com trava real no backend, o que consultoras (`COMERCIAL`) podem e não podem ver/fazer em cada módulo — acesso total a agendamentos/mapa (com auditoria de alterações), visão restrita ao próprio em arquitetos/clientes, e bloqueio total em veículos/orçamentos/catálogo.

**Architecture:** Reaproveita o helper `isComercialPuro()` já existente em `backend/src/services/permissionService.js` (mesmo padrão usado hoje em `agendamentoService.js` e `dashboardService.js`) para aplicar filtros de dono nos services de arquitetos/clientes, e um novo middleware `bloquearComercialPuro` (decodifica o próprio JWT, não depende de ordem com `authMiddleware`) para bloquear módulos inteiros (veículos, catálogo, parte do CRM legado). Auditoria de equipe/mapa segue o mesmo padrão já usado em `agendamento_logs` (tabela dedicada + rota de leitura + timeline no frontend).

**Tech Stack:** Node/Express + PostgreSQL (backend), React + Vite (`frontend-web`), Jest + Supertest.

## Global Constraints

- **Depende do plano `2026-07-12-trava-pwa-web-cadastro-instalador.md` já estar mergeado antes de começar** — ambos tocam `veiculosRoutes.js`, `produtosRoutes.js`, `categoriasRoutes.js`, `orcamentosRoutes.js`, `crmRoutes.js`, `dashboardRoutes.js`/`dashboardGestorRoutes.js` (esse último não é tocado aqui) e `clientesRoutes.js`/`arquitetosRoutes.js`/`pedidosRoutes.js`. Rodar este plano depois do outro evita colisão de linhas entre os dois.
- Reaproveitar `isComercialPuro(permissoes)` de `backend/src/services/permissionService.js` — não duplicar a lógica de "papel exclusivo" em nenhum arquivo novo.
- `ADMIN_MASTER` e `OPERADOR_AGENDA` sempre têm bypass total nas regras deste plano — nenhuma trava nova pode afetá-los.
- Toda migration de coluna que referencia `usuarios(id)` precisa do padrão duplo local (`INTEGER`)/Supabase (`UUID`) — ver `backend/src/database/migrations/_supabase_update_3.sql`. Migrations locais rodam com `node backend/src/database/run-migration.js <arquivo.sql>`; a versão Supabase é colada manualmente pelo usuário no SQL Editor a partir do arquivo consolidado — não automatizável aqui.
- Registros antigos sem `consultor_id` (clientes/pedidos/arquitetos) ficam invisíveis para consultoras até um backfill manual — **fora do escopo deste plano**, o usuário faz isso separadamente antes de ativar a trava em produção.
- Testes de backend usam Jest + Supertest (`backend/src/__tests__/*.test.js`, ver padrão em `agendamentosRoutes.itemFotos.test.js`). Rodar com `npm test` dentro de `backend/`.

---

### Task 1: Migration `clientes.consultor_id`

**Files:**
- Create: `backend/src/database/migrations/clientes_consultor_id.sql`
- Modify: `backend/src/database/migrations/_supabase_update_3.sql`

**Interfaces:**
- Produces: coluna `clientes.consultor_id` (`INTEGER` local / `UUID` Supabase, `REFERENCES usuarios(id) ON DELETE SET NULL`) + índice `idx_clientes_consultor`, consumida pela Task 6.

- [ ] **Step 1: Criar a migration local**

Criar `backend/src/database/migrations/clientes_consultor_id.sql`, seguindo exatamente o padrão de `arquitetos_consultor_id.sql`:

```sql
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS consultor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_consultor ON clientes (consultor_id);
```

- [ ] **Step 2: Rodar a migration local**

Run: `cd backend && node src/database/run-migration.js clientes_consultor_id.sql`
Expected: `Migration executada com sucesso.`

- [ ] **Step 3: Adicionar o bloco equivalente ao arquivo consolidado do Supabase**

Adicionar ao final de `backend/src/database/migrations/_supabase_update_3.sql`:

```sql

-- clientes_consultor_id.sql
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_consultor ON clientes (consultor_id);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/clientes_consultor_id.sql backend/src/database/migrations/_supabase_update_3.sql
git commit -m "$(cat <<'EOF'
feat(db): adiciona clientes.consultor_id para escopo de acesso de consultoras

Pendente: colar _supabase_update_3.sql atualizado no SQL Editor do Supabase.
EOF
)"
```

---

### Task 2: Agendamentos — remover restrições de "COMERCIAL puro" (acesso passa a ser total)

**Files:**
- Modify: `backend/src/services/agendamentoService.js`
- Test: `backend/src/__tests__/agendamentoService.comercialTotal.test.js` (novo)

**Interfaces:**
- Consumes: `isComercialPuro` (já importado no topo do arquivo).
- Produces: `listar()`, `reagendar()`, `alterarStatus()` deixam de restringir consultoras aos próprios agendamentos.

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/agendamentoService.comercialTotal.test.js`:

```js
jest.mock('../database/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const db = require('../database/db');
const svc = require('../services/agendamentoService');

beforeEach(() => jest.clearAllMocks());

describe('listar — COMERCIAL vê tudo', () => {
  test('não adiciona filtro de criado_por/equipe para permissoes COMERCIAL', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, 5, ['COMERCIAL'], {});
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('a.criado_por=$');
    expect(params).not.toContain(5);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest agendamentoService.comercialTotal.test.js`
Expected: FAIL — hoje `listar()` adiciona `a.criado_por=$N` para `isComercialPuro`.

- [ ] **Step 3: Implementar**

Em `backend/src/services/agendamentoService.js`:

1. Na função `listar` (linhas 280-304 hoje), remover o bloco:
```js
  if (isComercialPuro(permissoes)) {
    params.push(userId);
    wheres.push(`(a.criado_por=$${params.length} OR EXISTS (SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id=a.id AND ae.usuario_id=$${params.length}))`);
  }
```
(o restante da função continua igual — `userId` segue sendo parâmetro da função, só deixa de ser usado nesse bloco específico; outros usos de `userId` na função, se houver, permanecem).

2. Na função `alterarStatus` (linhas 709-726 hoje), remover o bloco que restringe cancelamento:
```js
  if (status === "cancelado" && isComercialPuro(permissoes)) {
    const criadorCheck = await db.query(
      `SELECT criado_por FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
      [id, empresaId]
    );
    if (criadorCheck.rows[0]?.criado_por !== userId) {
      const e = new Error("Vendedores só podem cancelar agendamentos que criaram."); e.status = 403; throw e;
    }
  }
```
(manter o bloco logo acima, `if (isInstaladorPuro(permissoes) && !STATUS_INSTALADOR.includes(status))`, intocado — instaladores continuam restritos aos status de execução).

3. Na função `reagendar` (linhas 1239-1259 hoje), trocar:
```js
  const podeGer = podeGerenciarAgendamentos(permissoes);
  const ehVend  = isComercialPuro(permissoes);
  if (!podeGer && !(ehVend && ag.criado_por === userId)) {
    const e = new Error("Sem permissão para reagendar este agendamento."); e.status = 403; throw e;
  }
```
por:
```js
  const podeGer = podeGerenciarAgendamentos(permissoes);
  const ehVend  = isComercialPuro(permissoes);
  if (!podeGer && !ehVend) {
    const e = new Error("Sem permissão para reagendar este agendamento."); e.status = 403; throw e;
  }
```
(consultora continua precisando ser `COMERCIAL` — ou ter permissão de gerenciar — pra reagendar, só deixa de precisar ser especificamente quem criou aquele agendamento).

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest agendamentoService.comercialTotal.test.js`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado (checar com atenção testes que hoje validam "vendedor só cancela/reagenda os próprios" — se existirem, precisam ser atualizados pra refletir a nova regra, não removidos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoService.comercialTotal.test.js
git commit -m "feat(agendamentos): consultora passa a ver, cancelar e reagendar qualquer agendamento"
```

---

### Task 3: Auditoria de alterações em equipe/mapa (`crew_logs`)

**Files:**
- Create: `backend/src/database/migrations/crew_logs.sql`
- Modify: `backend/src/database/migrations/_supabase_update_3.sql`
- Modify: `backend/src/services/crewService.js`
- Modify: `backend/src/routes/crewRoutes.js`
- Test: `backend/src/__tests__/crewService.logs.test.js` (novo)

**Interfaces:**
- Produces: tabela `crew_logs`; `crewService.criarCrew(empresaId, dados, userId, nomeCompleto)`, `atualizarCrew(id, empresaId, dados, userId, nomeCompleto)`, `deletarCrew(id, empresaId, userId, nomeCompleto)` (assinaturas ganham 2 parâmetros novos no final); `getCrewLogs(id, empresaId)`; rota `GET /crews/:id/logs`.

- [ ] **Step 1: Migration da tabela**

Criar `backend/src/database/migrations/crew_logs.sql`:

```sql
CREATE TABLE IF NOT EXISTS crew_logs (
  id           SERIAL PRIMARY KEY,
  crew_id      INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL,
  detalhes     JSONB,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crew_logs_crew ON crew_logs (crew_id, criado_em DESC);
```

Run: `cd backend && node src/database/run-migration.js crew_logs.sql`
Expected: `Migration executada com sucesso.`

Adicionar ao final de `backend/src/database/migrations/_supabase_update_3.sql`:

```sql

-- crew_logs.sql
CREATE TABLE IF NOT EXISTS crew_logs (
  id           SERIAL PRIMARY KEY,
  crew_id      INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL,
  detalhes     JSONB,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crew_logs_crew ON crew_logs (crew_id, criado_em DESC);
```

- [ ] **Step 2: Escrever o teste do service**

Criar `backend/src/__tests__/crewService.logs.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../services/notificacaoService', () => ({ criarNotificacao: jest.fn().mockResolvedValue() }));

const db  = require('../database/db');
const svc = require('../services/crewService');

beforeEach(() => jest.clearAllMocks());

describe('atualizarCrew — grava diff em crew_logs', () => {
  test('grava campos alterados quando nome e veículo mudam', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ data: '2026-07-20', nome_ant: 'Equipe A', veiculo_ant: 1 }] }) // SELECT existing (data, nome_ant, veiculo_ant)
      .mockResolvedValueOnce({ rows: [] })   // SELECT membrosAntRes (crew_membros)
      .mockResolvedValueOnce({ rows: [] })   // UPDATE crews
      .mockResolvedValueOnce({ rows: [] })   // INSERT crew_logs (gravarLogCrew)
      .mockResolvedValueOnce({ rows: [] });  // listarCrew: SELECT crews (vazio, encerra listarCrew ali)

    await svc.atualizarCrew(7, 10, { nome: 'Equipe B', veiculo_id: 2 }, 3, 'Fulano');

    const insertLogCall = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO crew_logs'));
    expect(insertLogCall).toBeDefined();
    expect(insertLogCall[1]).toEqual([7, 10, 3, 'Fulano', 'editado', expect.stringContaining('Equipe B')]);
  });
});

describe('getCrewLogs', () => {
  test('retorna os logs do crew', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, acao: 'editado', detalhes: {}, criado_em: '2026-07-20' }] });
    const logs = await svc.getCrewLogs(7, 10);
    expect(logs).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd backend && npx jest crewService.logs.test.js`
Expected: FAIL — `atualizarCrew` ainda não grava log, `getCrewLogs` não existe.

- [ ] **Step 4: Implementar no service**

Em `backend/src/services/crewService.js`, adicionar logo após os imports do topo:

```js
async function gravarLogCrew(crewId, empresaId, usuarioId, usuarioNome, acao, detalhes) {
  await db.query(
    `INSERT INTO crew_logs (crew_id, empresa_id, usuario_id, usuario_nome, acao, detalhes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [crewId, empresaId, usuarioId || null, usuarioNome || "—", acao, detalhes ? JSON.stringify(detalhes) : null]
  ).catch((e) => console.warn("Erro ao gravar log de crew:", e.message));
}

async function getCrewLogs(crewId, empresaId) {
  const { rows } = await db.query(
    `SELECT id, acao, detalhes, criado_em, usuario_nome
     FROM crew_logs WHERE crew_id=$1 AND empresa_id=$2 ORDER BY criado_em DESC LIMIT 200`,
    [crewId, empresaId]
  );
  return rows;
}
```

Trocar a assinatura e o corpo de `criarCrew` (linha 88 hoje):
```js
async function criarCrew(empresaId, { data, nome, veiculo_id, membros = [], agendamento_ids = [] }, userId, nomeCompleto) {
  const { rows } = await db.query(
    `INSERT INTO crews (empresa_id, data, nome, veiculo_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [empresaId, data, nome || null, veiculo_id || null]
  );
  const crewId = rows[0].id;

  await Promise.all([
    ...membros.map((uid) =>
      db.query(
        `INSERT INTO crew_membros (crew_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [crewId, uid]
      )
    ),
    ...agendamento_ids.map((aid) =>
      db.query(
        `INSERT INTO crew_agendamentos (crew_id, agendamento_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [crewId, aid]
      )
    ),
  ]);

  await gravarLogCrew(crewId, empresaId, userId, nomeCompleto, "criado", { nome: nome || null, membros: membros.length, agendamentos: agendamento_ids.length });

  const lista = await listarCrew(empresaId, data);
  const crew = lista.find((c) => c.id === crewId);
  await notificarMembrosCrew(crew, empresaId);
  return crew;
}
```

Trocar a assinatura e o corpo de `atualizarCrew` (linha 117 hoje):
```js
async function atualizarCrew(id, empresaId, { nome, veiculo_id, membros, agendamento_ids }, userId, nomeCompleto) {
  const existing = await db.query(
    `SELECT data, nome AS nome_ant, veiculo_id AS veiculo_ant FROM crews WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (!existing.rows.length) {
    const err = new Error("Crew não encontrado.");
    err.status = 404;
    throw err;
  }
  const { data, nome_ant, veiculo_ant } = existing.rows[0];

  const membrosAntRes = await db.query(`SELECT usuario_id FROM crew_membros WHERE crew_id=$1`, [id]);
  const membrosAntIds = membrosAntRes.rows.map((r) => String(r.usuario_id));

  await db.query(
    `UPDATE crews SET nome=$1, veiculo_id=$2 WHERE id=$3`,
    [nome || null, veiculo_id || null, id]
  );

  if (membros !== undefined) {
    await db.query(`DELETE FROM crew_membros WHERE crew_id=$1`, [id]);
    await Promise.all(
      membros.map((uid) =>
        db.query(
          `INSERT INTO crew_membros (crew_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, uid]
        )
      )
    );
  }

  if (agendamento_ids !== undefined) {
    await db.query(`DELETE FROM crew_agendamentos WHERE crew_id=$1`, [id]);
    await Promise.all(
      agendamento_ids.map((aid) =>
        db.query(
          `INSERT INTO crew_agendamentos (crew_id, agendamento_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, aid]
        )
      )
    );
  }

  const campos = [];
  if ((nome || null) !== (nome_ant || null)) campos.push({ campo: "Nome", de: nome_ant, para: nome });
  if ((veiculo_id || null) !== (veiculo_ant || null)) campos.push({ campo: "Veículo", de: veiculo_ant, para: veiculo_id });
  if (membros !== undefined) {
    const novosIds = membros.map(String);
    const removidos = membrosAntIds.filter((m) => !novosIds.includes(m));
    const adicionados = novosIds.filter((m) => !membrosAntIds.includes(m));
    if (removidos.length) campos.push({ campo: "Membros removidos", de: removidos.join(", "), para: null });
    if (adicionados.length) campos.push({ campo: "Membros adicionados", de: null, para: adicionados.join(", ") });
  }
  if (campos.length > 0) {
    await gravarLogCrew(id, empresaId, userId, nomeCompleto, "editado", { campos });
  }

  const lista = await listarCrew(empresaId, data);
  const crew = lista.find((c) => c.id === id);
  await notificarMembrosCrew(crew, empresaId);
  return crew;
}
```

Trocar a assinatura e o corpo de `deletarCrew` (linha 164 hoje):
```js
async function deletarCrew(id, empresaId, userId, nomeCompleto) {
  const { rowCount } = await db.query(
    `DELETE FROM crews WHERE id=$1 AND empresa_id=$2`,
    [id, empresaId]
  );
  if (!rowCount) {
    const err = new Error("Crew não encontrado.");
    err.status = 404;
    throw err;
  }
  await gravarLogCrew(id, empresaId, userId, nomeCompleto, "excluido", null);
}
```

Atualizar o `module.exports` (linha 284-289 hoje) incluindo `getCrewLogs`:
```js
module.exports = {
  listarCrew, criarCrew, atualizarCrew, deletarCrew, getCrewLogs,
  listarWorkSchedules, criarWorkSchedule, atualizarWorkSchedule, deletarWorkSchedule,
  getPontoPartidaDia, upsertPontoPartidaDia,
  listarEnderecosPadrao, criarEnderecoPadrao, deletarEnderecoPadrao,
};
```

- [ ] **Step 5: Atualizar as rotas pra passar `userId`/`nomeCompleto` e expor `GET /:id/logs`**

Em `backend/src/routes/crewRoutes.js`, trocar as 3 rotas existentes:
```js
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ message: "Campo 'data' obrigatório." });
    const crew = await svc.criarCrew(req.user.empresa_id, req.body, req.user.id, req.user.nome_completo);
    return res.status(201).json({ crew });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar crew." });
  }
});
```
```js
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const crew = await svc.atualizarCrew(req.params.id, req.user.empresa_id, req.body, req.user.id, req.user.nome_completo);
    return res.json({ crew });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar crew." });
  }
});
```
```js
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.deletarCrew(req.params.id, req.user.empresa_id, req.user.id, req.user.nome_completo);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao deletar crew." });
  }
});
```

E adicionar a nova rota de leitura, logo após a rota `DELETE /:id`:
```js
router.get("/:id/logs", authMiddleware, async (req, res) => {
  try {
    const logs = await svc.getCrewLogs(req.params.id, req.user.empresa_id);
    return res.json({ logs });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar histórico." });
  }
});
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `cd backend && npx jest crewService.logs.test.js`
Expected: PASS.

- [ ] **Step 7: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado.

- [ ] **Step 8: Commit**

```bash
git add backend/src/database/migrations/crew_logs.sql backend/src/database/migrations/_supabase_update_3.sql backend/src/services/crewService.js backend/src/routes/crewRoutes.js backend/src/__tests__/crewService.logs.test.js
git commit -m "$(cat <<'EOF'
feat(mapa): adiciona auditoria de alterações em equipes (crew_logs)

Pendente: colar _supabase_update_3.sql atualizado no SQL Editor do Supabase.
EOF
)"
```

---

### Task 4: Frontend — histórico de alterações na tela de equipes

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/InicializacaoDia.jsx`

**Interfaces:**
- Consumes: `GET /crews/:id/logs` (Task 3).

- [ ] **Step 1: Adicionar estado e função de carregamento**

Em `frontend-web/src/pages/agendamentos/InicializacaoDia.jsx`, dentro do componente `InicializacaoDia`, logo após a declaração de `enderecosPorVeiculo` (linha 53 hoje):

```jsx
  const [enderecosPorVeiculo, setEnderecosPorVeiculo] = useState({});
  const [historicoAberto, setHistoricoAberto] = useState(null); // id do crew com histórico expandido
  const [historicoPorCrew, setHistoricoPorCrew] = useState({});
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const toggleHistorico = useCallback(async (crewId) => {
    if (historicoAberto === crewId) { setHistoricoAberto(null); return; }
    setHistoricoAberto(crewId);
    if (historicoPorCrew[crewId] !== undefined) return;
    setCarregandoHistorico(true);
    try {
      const res = await api.get(`/crews/${crewId}/logs`);
      setHistoricoPorCrew((prev) => ({ ...prev, [crewId]: res.logs || [] }));
    } catch {
      setHistoricoPorCrew((prev) => ({ ...prev, [crewId]: [] }));
    } finally {
      setCarregandoHistorico(false);
    }
  }, [historicoAberto, historicoPorCrew]);
```

- [ ] **Step 2: Adicionar o botão e o painel na renderização de cada equipe**

Trocar o bloco do cabeçalho da equipe (linhas 216-229 hoje):

```jsx
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--color-border)", background: `color-mix(in srgb, ${cor} 5%, transparent)` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: cor, boxShadow: `0 0 8px ${cor}88`, flexShrink: 0 }} />
                  <input
                    className="input-base"
                    value={crew.nome}
                    onChange={(e) => updateCrew(key, "nome", e.target.value)}
                    style={{ flex: 1, fontWeight: 600, fontSize: 14, minHeight: 34, padding: "5px 10px" }}
                  />
                  {crews.length > 1 && (
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-danger)", fontSize: 12, padding: "4px 10px" }} onClick={() => removeCrew(key)}>
                      Remover
                    </button>
                  )}
                </div>
```

por:

```jsx
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--color-border)", background: `color-mix(in srgb, ${cor} 5%, transparent)` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: cor, boxShadow: `0 0 8px ${cor}88`, flexShrink: 0 }} />
                  <input
                    className="input-base"
                    value={crew.nome}
                    onChange={(e) => updateCrew(key, "nome", e.target.value)}
                    style={{ flex: 1, fontWeight: 600, fontSize: 14, minHeight: 34, padding: "5px 10px" }}
                  />
                  {crew.id && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => toggleHistorico(crew.id)}>
                      {historicoAberto === crew.id ? "Ocultar histórico" : "Histórico"}
                    </button>
                  )}
                  {crews.length > 1 && (
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-danger)", fontSize: 12, padding: "4px 10px" }} onClick={() => removeCrew(key)}>
                      Remover
                    </button>
                  )}
                </div>

                {crew.id && historicoAberto === crew.id && (
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
                    {carregandoHistorico && !historicoPorCrew[crew.id] ? (
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Carregando...</span>
                    ) : (historicoPorCrew[crew.id] || []).length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nenhuma alteração registrada.</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(historicoPorCrew[crew.id] || []).map((log) => (
                          <div key={log.id} style={{ fontSize: 12 }}>
                            <strong>{log.usuario_nome}</strong>{" "}
                            {log.acao === "criado" ? "criou a equipe" : log.acao === "excluido" ? "excluiu a equipe" : "editou a equipe"}
                            {log.detalhes?.campos?.map((c, i) => (
                              <div key={i} style={{ color: "var(--color-text-muted)", marginLeft: 8 }}>
                                {c.campo}: {c.de ?? "—"} → {c.para ?? "—"}
                              </div>
                            ))}
                            <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                              {new Date(log.criado_em).toLocaleString("pt-BR")}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Step 3: Build**

Run: `cd frontend-web && npm run build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/agendamentos/InicializacaoDia.jsx
git commit -m "feat(mapa): exibe histórico de alterações por equipe"
```

---

### Task 5: Arquitetos — filtro por `consultor_id`

**Files:**
- Modify: `backend/src/services/arquitetoService.js`
- Modify: `backend/src/services/pedidoService.js`
- Modify: `backend/src/routes/arquitetosRoutes.js`
- Test: `backend/src/__tests__/arquitetoService.escopo.test.js` (novo)

**Interfaces:**
- Consumes: `isComercialPuro` de `./permissionService`.
- Produces: `listar(empresaId, q, permissoes, userId)`, `buscar(id, empresaId, permissoes, userId)` — ambos com 2 novos parâmetros opcionais no final; se omitidos, comportamento é o de hoje (sem filtro).

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/arquitetoService.escopo.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));

const db  = require('../database/db');
const svc = require('../services/arquitetoService');

beforeEach(() => jest.clearAllMocks());

describe('listar — escopo por consultor', () => {
  test('COMERCIAL puro: filtra por consultor_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['COMERCIAL'], 5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('a.consultor_id');
    expect(params).toContain(5);
  });

  test('ADMIN_MASTER: não filtra', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['ADMIN_MASTER'], 5);
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('a.consultor_id =');
  });
});

describe('buscar — bloqueia arquiteto de outra consultora', () => {
  test('retorna null quando consultor_id não bate', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, consultor_id: 99 }] });
    const arq = await svc.buscar(1, 10, ['COMERCIAL'], 5);
    expect(arq).toBeNull();
  });

  test('retorna o registro quando consultor_id bate', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, consultor_id: 5 }] });
    const arq = await svc.buscar(1, 10, ['COMERCIAL'], 5);
    expect(arq).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest arquitetoService.escopo.test.js`
Expected: FAIL — `listar`/`buscar` ainda não aceitam `permissoes`/`userId`.

- [ ] **Step 3: Implementar**

Em `backend/src/services/arquitetoService.js`, adicionar o import no topo:
```js
const { isComercialPuro } = require("./permissionService");
```

Trocar `listar` (linhas 90-104 hoje):
```js
async function listar(empresaId, q, permissoes, userId) {
  const params = [empresaId];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (a.nome ILIKE $${params.length} OR a.escritorio ILIKE $${params.length} OR e.nome ILIKE $${params.length} OR a.email ILIKE $${params.length} OR a.telefone ILIKE $${params.length} OR a.cpf_cnpj ILIKE $${params.length} OR u.nome_completo ILIKE $${params.length})`;
  }
  if (isComercialPuro(permissoes)) {
    params.push(userId);
    where += ` AND a.consultor_id = $${params.length}`;
  }
  const res = await db.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE a.empresa_id = $1 AND a.deleted_at IS NULL${where}
     ORDER BY a.nome ASC`,
    params
  );
  return res.rows;
}
```

Trocar `buscar` (linhas 106-113 hoje):
```js
async function buscar(id, empresaId, permissoes, userId) {
  const res = await db.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE a.id = $1 AND a.empresa_id = $2 AND a.deleted_at IS NULL`,
    [id, empresaId]
  );
  const arq = res.rows[0] || null;
  if (arq && isComercialPuro(permissoes) && String(arq.consultor_id) !== String(userId)) {
    return null;
  }
  return arq;
}
```

Em `backend/src/routes/arquitetosRoutes.js`, trocar as 2 rotas de leitura:
```js
router.get("/", authMiddleware, async (req, res) => {
  try {
    const arquitetos = await svc.listar(req.user.empresa_id, req.query.q, req.user.permissoes, req.user.id);
    return res.json({ arquitetos });
  } catch (err) {
    return res.status(500).json({ message: "Erro ao listar arquitetos." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const arq = await svc.buscar(req.params.id, req.user.empresa_id, req.user.permissoes, req.user.id);
    if (!arq) return res.status(404).json({ message: "Arquiteto não encontrado." });
    return res.json({ arquiteto: arq });
  } catch (err) {
    return res.status(500).json({ message: "Erro ao buscar arquiteto." });
  }
});
```

Em `backend/src/services/pedidoService.js`, na função `importar` (por volta da linha 634 hoje), o auto-cadastro de arquiteto por nome passa a herdar o consultor de quem importou:
```js
        const novoArq = await arqSvc.criar(empresaId, { nome: dados.arquiteto_nome.trim(), consultor_id: userId });
```
(trocar a linha que hoje é `const novoArq = await arqSvc.criar(empresaId, { nome: dados.arquiteto_nome.trim() });`).

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest arquitetoService.escopo.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/arquitetoService.js backend/src/services/pedidoService.js backend/src/routes/arquitetosRoutes.js backend/src/__tests__/arquitetoService.escopo.test.js
git commit -m "feat(arquitetos): consultora só vê os próprios arquitetos"
```

---

### Task 6: Clientes — coluna, atribuição e filtro por `consultor_id`

**Files:**
- Modify: `backend/src/services/clienteService.js`
- Modify: `backend/src/services/agendamentoService.js`
- Modify: `backend/src/services/pedidoService.js`
- Modify: `backend/src/routes/clientesRoutes.js`
- Test: `backend/src/__tests__/clienteService.escopo.test.js` (novo)

**Interfaces:**
- Consumes: `clientes.consultor_id` (Task 1), `isComercialPuro`.
- Produces: `listar(empresaId, q, permissoes, userId)`, `buscar(id, empresaId, permissoes, userId)`, `criar(empresaId, dados, criadoPorId)`, `atualizar(id, empresaId, dados, permissoes, userId)`, `resolverCliente(empresaId, nomeRaw, extras)` — `extras.criadoPorId` agora é lido e persistido.

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/clienteService.escopo.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));

const db  = require('../database/db');
const svc = require('../services/clienteService');

beforeEach(() => jest.clearAllMocks());

describe('listar — escopo por consultor', () => {
  test('COMERCIAL puro: filtra por consultor_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['COMERCIAL'], 5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('c.consultor_id');
    expect(params).toContain(5);
  });

  test('OPERADOR_AGENDA: não filtra', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, null, ['OPERADOR_AGENDA'], 5);
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('c.consultor_id =');
  });
});

describe('criar — grava consultor_id de quem criou', () => {
  test('passa criadoPorId pro INSERT', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                 // INSERT
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                 // montarCliente: SELECT cliente
      .mockResolvedValueOnce({ rows: [] });                         // montarCliente: SELECT enderecos
    await svc.criar(10, { nome: 'Cliente X' }, 5);
    const insertCall = db.query.mock.calls[0];
    expect(insertCall[0]).toContain('consultor_id');
    expect(insertCall[1]).toContain(5);
  });
});

describe('resolverCliente — grava consultor_id no cliente novo', () => {
  test('extras.criadoPorId vai pro INSERT quando cliente é criado', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                          // match por nome: nenhum
      .mockResolvedValueOnce({ rows: [{ id: 2 }] });                 // INSERT novo cliente

    const resultado = await svc.resolverCliente(10, 'Cliente Novo', { criadoPorId: 7 });
    expect(resultado.criado).toBe(true);
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[0]).toContain('consultor_id');
    expect(insertCall[1]).toContain(7);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest clienteService.escopo.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar em `clienteService.js`**

Adicionar o import no topo:
```js
const { isComercialPuro } = require("./permissionService");
```

Trocar `listar` (linhas 17-48 hoje):
```js
async function listar(empresaId, q, permissoes, userId) {
  const params = [empresaId];
  let whereExtra = "";
  if (q) {
    params.push(`%${q}%`);
    whereExtra += ` AND (c.nome ILIKE $${params.length} OR c.telefone ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.cpf ILIKE $${params.length} OR c.cnpj ILIKE $${params.length})`;
  }
  if (isComercialPuro(permissoes)) {
    params.push(userId);
    whereExtra += ` AND c.consultor_id = $${params.length}`;
  }

  const result = await db.query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM cliente_enderecos e WHERE e.cliente_id=c.id AND e.deleted_at IS NULL) AS total_enderecos
     FROM clientes c
     WHERE c.empresa_id=$1 AND c.deleted_at IS NULL${whereExtra}
     ORDER BY c.nome ASC`,
    params
  );

  const ids = result.rows.map((r) => r.id);
  let endPorId = {};
  if (ids.length > 0) {
    const eRes = await db.query(
      `SELECT * FROM cliente_enderecos WHERE cliente_id=ANY($1) AND deleted_at IS NULL ORDER BY is_padrao DESC, created_at ASC`,
      [ids]
    );
    eRes.rows.forEach((e) => {
      if (!endPorId[e.cliente_id]) endPorId[e.cliente_id] = [];
      endPorId[e.cliente_id].push(e);
    });
  }

  return result.rows.map((c) => ({ ...c, enderecos: endPorId[c.id] || [] }));
}
```

Trocar `buscar` (linhas 50-52 hoje):
```js
async function buscar(id, empresaId, permissoes, userId) {
  const cliente = await montarCliente(id, empresaId);
  if (cliente && isComercialPuro(permissoes) && String(cliente.consultor_id) !== String(userId)) {
    return null;
  }
  return cliente;
}
```

Trocar `criar` (linhas 54-63 hoje):
```js
async function criar(empresaId, dados, criadoPorId = null) {
  const { nome, telefone, email, cpf, cnpj, arquiteto_id } = dados;
  if (!nome) { const e = new Error("Nome é obrigatório."); e.status = 400; throw e; }

  const result = await db.query(
    `INSERT INTO clientes (empresa_id, nome, telefone, email, cpf, cnpj, arquiteto_id, consultor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [empresaId, nome.trim(), telefone?.trim()||null, email?.trim()||null, cpf?.trim()||null, cnpj?.trim()||null, arquiteto_id||null, criadoPorId || null]
  );
  return montarCliente(result.rows[0].id, empresaId);
}
```

Trocar `atualizar` (linhas 65-76 hoje):
```js
async function atualizar(id, empresaId, dados, permissoes, userId) {
  const { nome, telefone, email, cpf, cnpj, arquiteto_id } = dados;
  if (!nome) { const e = new Error("Nome é obrigatório."); e.status = 400; throw e; }

  const params = [nome.trim(), telefone?.trim()||null, email?.trim()||null, cpf?.trim()||null, cnpj?.trim()||null, arquiteto_id||null, id, empresaId];
  let whereExtra = "";
  if (isComercialPuro(permissoes)) {
    params.push(userId);
    whereExtra = ` AND consultor_id = $${params.length}`;
  }

  const result = await db.query(
    `UPDATE clientes SET nome=$1, telefone=$2, email=$3, cpf=$4, cnpj=$5, arquiteto_id=$6, updated_at=NOW()
     WHERE id=$7 AND empresa_id=$8 AND deleted_at IS NULL${whereExtra} RETURNING id`,
    params
  );
  if (result.rows.length === 0) { const e = new Error("Cliente não encontrado."); e.status = 404; throw e; }
  return montarCliente(id, empresaId);
}
```

Na função `resolverCliente` (linhas 178-243 hoje), trocar o passo 4 (criar novo cliente):
```js
  // 4. Criar novo cliente
  const novo = await db.query(
    `INSERT INTO clientes (empresa_id, nome, telefone, email, cpf, cnpj, consultor_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [empresaId, nome, extras.telefone?.trim()||null, extras.email?.trim()||null, cpf, cnpj, extras.criadoPorId || null]
  );
  return { id: novo.rows[0].id, criado: true };
```

- [ ] **Step 4: Encadear `userId` nos pontos que chamam `resolverCliente`/`criar`**

Em `backend/src/services/agendamentoService.js`, na função `criar` (linha 413-416 hoje):
```js
  const { id: clienteId, criado: clienteCriado } = await resolverCliente(
    empresaId, cliente,
    { telefone: cliente_telefone, email: cliente_email, criadoPorId: userId }
  );
```

Na função `atualizar` (linha 578 hoje):
```js
  const { id: clienteId } = await resolverCliente(empresaId, cliente, { criadoPorId: userId });
```

Em `backend/src/services/pedidoService.js`, na função `importar` (linha 559-564 hoje):
```js
    const { id } = await cliSvc.resolverCliente(empresaId, dados.nome_cliente, {
      telefone: dados.telefone_cliente,
      email:    dados.email_cliente,
      cpf:      dados.cpf,
      cnpj:     dados.cnpj,
      criadoPorId: userId,
    });
```

- [ ] **Step 5: Atualizar `clientesRoutes.js`**

```js
router.get("/", authMiddleware, async (req, res) => {
  try {
    const clientes = await svc.listar(req.user.empresa_id, req.query.q, req.user.permissoes, req.user.id);
    return res.json({ clientes });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar clientes." });
  }
});
```
```js
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.buscar(req.params.id, req.user.empresa_id, req.user.permissoes, req.user.id);
    if (!cli) return res.status(404).json({ message: "Cliente não encontrado." });
    return res.json({ cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar cliente." });
  }
});
```
```js
router.post("/", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.criar(req.user.empresa_id, req.body, req.user.id);
    return res.status(201).json({ message: "Cliente criado!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar cliente." });
  }
});
```
```js
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.atualizar(req.params.id, req.user.empresa_id, req.body, req.user.permissoes, req.user.id);
    return res.json({ message: "Cliente atualizado!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar cliente." });
  }
});
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `cd backend && npx jest clienteService.escopo.test.js`
Expected: PASS (4 testes).

- [ ] **Step 7: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/clienteService.js backend/src/services/agendamentoService.js backend/src/services/pedidoService.js backend/src/routes/clientesRoutes.js backend/src/__tests__/clienteService.escopo.test.js
git commit -m "feat(clientes): consultora só vê os próprios clientes; novo cliente já nasce vinculado a quem criou"
```

---

### Task 7: Middleware `bloquearComercialPuro` — veículos e catálogo bloqueados por completo

**Files:**
- Create: `backend/src/middlewares/bloquearComercialPuro.js`
- Modify: `backend/src/routes/veiculosRoutes.js`
- Modify: `backend/src/routes/produtosRoutes.js`
- Modify: `backend/src/routes/categoriasRoutes.js`
- Test: `backend/src/__tests__/bloquearComercialPuro.test.js` (novo)

**Interfaces:**
- Produces: middleware `bloquearComercialPuro(req, res, next)` — decodifica o JWT independentemente (mesmo padrão de `bloquearAppPWA` do outro plano); nega com 403 se `isComercialPuro(decoded.permissoes)` for `true`.

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/bloquearComercialPuro.test.js`:

```js
const jwt = require('jsonwebtoken');
const bloquearComercialPuro = require('../middlewares/bloquearComercialPuro');

const OLD_ENV = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_ENV; });

function mockReqRes(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('bloquearComercialPuro', () => {
  test('403 para COMERCIAL puro', () => {
    const token = jwt.sign({ permissoes: ['COMERCIAL'] }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearComercialPuro(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passa para COMERCIAL + OPERADOR_AGENDA', () => {
    const token = jwt.sign({ permissoes: ['COMERCIAL', 'OPERADOR_AGENDA'] }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearComercialPuro(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa para INSTALADOR', () => {
    const token = jwt.sign({ permissoes: ['INSTALADOR'] }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearComercialPuro(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa quando não há token', () => {
    const { req, res, next } = mockReqRes(null);
    bloquearComercialPuro(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest bloquearComercialPuro.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `backend/src/middlewares/bloquearComercialPuro.js`:

```js
const jwt = require("jsonwebtoken");
const { isComercialPuro } = require("../services/permissionService");

/**
 * Nega acesso a usuários "COMERCIAL puro" (consultoras, sem nenhuma permissão
 * mais ampla) em módulos totalmente fora do alcance delas. Decodifica o
 * próprio token — não depende de rodar depois do authMiddleware — pra poder
 * ser montado com router.use() antes de qualquer rota do arquivo.
 */
function bloquearComercialPuro(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (isComercialPuro(decoded.permissoes || [])) {
      return res.status(403).json({ message: "Consultoras não têm acesso a este módulo." });
    }
    return next();
  } catch {
    return next();
  }
}

module.exports = bloquearComercialPuro;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest bloquearComercialPuro.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Montar nas 3 rotas**

Em `backend/src/routes/veiculosRoutes.js`, trocar:
```js
const router = express.Router();
```
por:
```js
const bloquearComercialPuro = require("../middlewares/bloquearComercialPuro");

const router = express.Router();
router.use(bloquearComercialPuro);
```

Repetir o mesmo padrão em `backend/src/routes/produtosRoutes.js` e `backend/src/routes/categoriasRoutes.js` (import + `router.use(bloquearComercialPuro);` logo após a criação do router).

- [ ] **Step 6: Teste de integração numa das rotas**

Adicionar ao final de `backend/src/__tests__/bloquearComercialPuro.test.js`:

```js
describe('bloquearComercialPuro montado em veiculosRoutes', () => {
  jest.resetModules();
  jest.doMock('../services/veiculoService', () => ({ listar: jest.fn().mockResolvedValue([]) }));
  jest.doMock('../middlewares/authMiddleware', () => (req, _res, next) => {
    req.user = { id: 1, empresa_id: 10, permissoes: ['COMERCIAL'] };
    next();
  });

  test('GET /api/veiculos com token COMERCIAL puro retorna 403', async () => {
    const request = require('supertest');
    const express = require('express');
    const veiculosRouter = require('../routes/veiculosRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/veiculos', veiculosRouter);

    const token = jwt.sign({ permissoes: ['COMERCIAL'] }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/veiculos').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `cd backend && npx jest bloquearComercialPuro.test.js`
Expected: PASS (5 testes).

- [ ] **Step 7: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middlewares/bloquearComercialPuro.js backend/src/routes/veiculosRoutes.js backend/src/routes/produtosRoutes.js backend/src/routes/categoriasRoutes.js backend/src/__tests__/bloquearComercialPuro.test.js
git commit -m "feat(permissoes): bloqueia consultoras nos módulos de veículos e catálogo"
```

---

### Task 8: Orçamentos — bloqueio total (módulo novo e CRM legado)

**Files:**
- Modify: `backend/src/routes/orcamentosRoutes.js`
- Modify: `backend/src/routes/crmRoutes.js`
- Test: `backend/src/__tests__/orcamentosRoutes.bloqueioComercial.test.js` (novo)

**Interfaces:**
- Consumes: `bloquearComercialPuro` (Task 7).

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/orcamentosRoutes.bloqueioComercial.test.js`:

```js
jest.mock('../services/orcamentoService', () => ({ listar: jest.fn().mockResolvedValue([]) }));
jest.mock('../services/crmService', () => ({
  listarOrcamentos: jest.fn().mockResolvedValue([]),
  listarFinanceiro: jest.fn().mockResolvedValue([]),
  listarComissoes:  jest.fn().mockResolvedValue([]),
  listarRetornos:   jest.fn().mockResolvedValue([]),
}));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10, permissoes: ['COMERCIAL'] };
  next();
});

const request = require('supertest');
const express = require('express');
const orcamentosRouter = require('../routes/orcamentosRoutes');
const crmRouter = require('../routes/crmRoutes');

const app = express();
app.use(express.json());
app.use('/api/orcamentos', orcamentosRouter);
app.use('/api/crm', crmRouter);

describe('Bloqueio de orçamentos pra COMERCIAL', () => {
  test('GET /api/orcamentos retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/orcamentos');
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/orcamentos retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/crm/orcamentos');
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/financeiro retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/crm/financeiro');
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/comissoes retorna 403 pra COMERCIAL puro', async () => {
    const res = await request(app).get('/api/crm/comissoes');
    expect(res.status).toBe(403);
  });

  test('GET /api/crm/retornos NÃO é bloqueado (fora do escopo de "orçamentos")', async () => {
    const res = await request(app).get('/api/crm/retornos');
    expect(res.status).not.toBe(403);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest orcamentosRoutes.bloqueioComercial.test.js`
Expected: FAIL — hoje `COMERCIAL` tem acesso a `/api/orcamentos` e nada bloqueia `/api/crm/*`.

- [ ] **Step 3: Implementar em `orcamentosRoutes.js`**

Trocar:
```js
const PODE_GERENCIAR = ["COMERCIAL", "OPERADOR_AGENDA", "ADMIN_MASTER"];
```
por:
```js
const PODE_GERENCIAR = ["OPERADOR_AGENDA", "ADMIN_MASTER"];
```

- [ ] **Step 4: Implementar em `crmRoutes.js`**

Adicionar o import no topo (junto dos outros requires) e aplicar `bloquearComercialPuro` como segundo middleware nas 12 rotas de orçamento/financeiro/comissões (não em `/stats`, `/dashboard`, `/retornos`):

```js
const bloquearComercialPuro = require("../middlewares/bloquearComercialPuro");
```

```js
router.get("/orcamentos", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.get("/orcamentos/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.post("/orcamentos", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.put("/orcamentos/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.delete("/orcamentos/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.get("/financeiro", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.get("/financeiro/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.post("/financeiro", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.put("/financeiro/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.delete("/financeiro/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.get("/comissoes", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.post("/comissoes", authMiddleware, bloquearComercialPuro, async (req, res) => {
router.put("/comissoes/:id", authMiddleware, bloquearComercialPuro, async (req, res) => {
```

(trocar cada uma dessas 13 linhas — a lista tem 13 porque `/comissoes` tem GET/POST/PUT — de `authMiddleware, async (req, res) => {` para `authMiddleware, bloquearComercialPuro, async (req, res) => {`; as rotas `/stats`, `/dashboard`, `/retornos*` ficam exatamente como estão).

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd backend && npx jest orcamentosRoutes.bloqueioComercial.test.js`
Expected: PASS (5 testes).

- [ ] **Step 6: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/orcamentosRoutes.js backend/src/routes/crmRoutes.js backend/src/__tests__/orcamentosRoutes.bloqueioComercial.test.js
git commit -m "feat(orcamentos): bloqueia consultoras no módulo novo e no CRM legado"
```

---

### Task 9: Frontend — Sidebar e rotas refletem os bloqueios

**Files:**
- Modify: `frontend-web/src/components/Sidebar.jsx`
- Modify: `frontend-web/src/App.jsx`

**Interfaces:**
- Nenhuma nova — só ajusta quais permissões dão acesso a cada item de menu/rota, espelhando o backend.

- [ ] **Step 1: Sidebar — remover `COMERCIAL` de Orçamentos e Catálogo**

Em `frontend-web/src/components/Sidebar.jsx`, trocar:
```js
  const podeVerCatalogo      = temPerm(user, "COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS");
```
por:
```js
  const podeVerCatalogo      = temPerm(user, "OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS");
```

E trocar:
```js
  const podeVerOrcamentos    = temPerm(user, "COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER");
```
por:
```js
  const podeVerOrcamentos    = temPerm(user, "OPERADOR_AGENDA","ADMIN_MASTER");
```

(`podeVerVeiculos` e `podeVerDashboard` já excluem `COMERCIAL` hoje — não mexer.)

- [ ] **Step 2: App.jsx — separar Orçamentos e Catálogo do grupo de Pedidos/Arquitetos/Fornecedores**

Em `frontend-web/src/App.jsx`, o bloco atual (linhas ~106-119 hoje) agrupa `/pedidos*`, `/catalogo/produtos`, `/fornecedores`, `/arquitetos`, `/orcamentos*` sob um único `<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]}>`. Trocar por 3 grupos separados:

```jsx
<Route element={<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
  <Route path="/pedidos" element={<Pedidos />} />
  <Route path="/pedidos/os/:osId" element={<FichaConferenciaTecnicos />} />
  <Route path="/pedidos/os/:osId/confeccao" element={<FichaConfeccao />} />
  <Route path="/pedidos/os/:osId/conferencia-consultoras" element={<FichaConferenciaConsultoras />} />
  <Route path="/pedidos/:id/fluxo"    element={<PedidoFluxo />} />
  <Route path="/pedidos/:id/editar"   element={<EditarPedido />} />
  <Route path="/fornecedores" element={<Fornecedores />} />
  <Route path="/arquitetos"  element={<Arquitetos />} />
</Route>

<Route element={<PermissionRoute perms={["OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
  <Route path="/catalogo/produtos" element={<Produtos />} />
</Route>

<Route element={<PermissionRoute perms={["OPERADOR_AGENDA","ADMIN_MASTER"]} />}>
  <Route path="/orcamentos"              element={<Orcamentos />} />
  <Route path="/orcamentos/novo"         element={<OrcamentoWizard />} />
  <Route path="/orcamentos/:id/editar"   element={<OrcamentoWizard />} />
</Route>
```

- [ ] **Step 2: Build**

Run: `cd frontend-web && npm run build`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/components/Sidebar.jsx frontend-web/src/App.jsx
git commit -m "feat(permissoes): esconde Orçamentos e Catálogo do menu/rotas pra consultoras"
```

---

### Task 10: Regressão — Pedidos e Dashboard já ficam corretamente escopados

**Files:**
- Test: `backend/src/__tests__/dashboardService.escopoComercial.test.js` (novo)

**Interfaces:**
- Consumes: `dashboardService.listarPedidosDashboard` (já existente, sem alteração de código nesta task — só confirma o comportamento).

Esta task não muda código de produção: `GET /api/dashboard/pedidos` (usado tanto pela tela de Pedidos quanto seria pelo Dashboard, ver spec) já força `consultor_id = userId` para quem não tem `DASHBOARD_PEDIDOS_GERAL`, e a UI do filtro de consultora já só aparece para quem tem essa permissão — ambos os requisitos "Pedidos" e "Dashboard" da spec já estavam satisfeitos antes deste plano. Esta task só adiciona um teste de regressão pra travar esse comportamento.

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/dashboardService.escopoComercial.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));

const db  = require('../database/db');
const svc = require('../services/dashboardService');

beforeEach(() => jest.clearAllMocks());

describe('listarPedidosDashboard — escopo de consultora (regressão)', () => {
  test('COMERCIAL sem DASHBOARD_PEDIDOS_GERAL: força consultor_id = userId', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listarPedidosDashboard(10, 5, ['COMERCIAL'], {});
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('p.consultor_id');
    expect(params).toContain(5);
  });

  test('COMERCIAL sem DASHBOARD_PEDIDOS_GERAL: ignora consultora_id vindo da query', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listarPedidosDashboard(10, 5, ['COMERCIAL'], { consultora_id: 999 });
    const [, params] = db.query.mock.calls[0];
    expect(params).not.toContain(999);
    expect(params).toContain(5);
  });

  test('ADMIN_MASTER com DASHBOARD_PEDIDOS_GERAL: consultora_id da query é respeitado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listarPedidosDashboard(10, 1, ['ADMIN_MASTER', 'DASHBOARD_PEDIDOS_GERAL'], { consultora_id: 999 });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(999);
  });
});
```

- [ ] **Step 2: Rodar o teste**

Run: `cd backend && npx jest dashboardService.escopoComercial.test.js`
Expected: PASS de primeira (comportamento já existe hoje — se algum teste falhar, é sinal de que o entendimento do comportamento atual estava errado, e a implementação de `listarPedidosDashboard` precisa ser revisada, não o teste).

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/dashboardService.escopoComercial.test.js
git commit -m "test(dashboard): trava regressão do escopo de pedidos por consultora"
```

---

## Passo de rollout manual (fora do escopo de código)

Antes de ativar esta trava em produção:

1. **Backfill de `consultor_id`** em `clientes`/`pedidos`/`arquitetos` já existentes — feito manualmente pelo usuário (fora deste plano).
2. **Auditar quem tem a permissão avulsa `DASHBOARD_PEDIDOS_GERAL`** — nenhuma consultora (`COMERCIAL` puro) deveria tê-la, senão ela passa a ver pedidos de todo mundo e o filtro de consultora reaparece pra ela. Rodar:
   ```sql
   SELECT u.id, u.nome_completo, u.email
   FROM usuarios u
   JOIN usuario_permissoes up1 ON up1.usuario_id = u.id
   JOIN permissoes p1 ON p1.id = up1.permissao_id AND (p1.codigo = 'DASHBOARD_PEDIDOS_GERAL' OR p1.nome = 'DASHBOARD_PEDIDOS_GERAL')
   JOIN usuario_permissoes up2 ON up2.usuario_id = u.id
   JOIN permissoes p2 ON p2.id = up2.permissao_id AND (p2.codigo = 'COMERCIAL' OR p2.nome = 'COMERCIAL')
   WHERE NOT EXISTS (
     SELECT 1 FROM usuario_permissoes up3
     JOIN permissoes p3 ON p3.id = up3.permissao_id
     WHERE up3.usuario_id = u.id AND (p3.codigo IN ('OPERADOR_AGENDA','ADMIN_MASTER','GESTOR_USUARIOS') OR p3.nome IN ('OPERADOR_AGENDA','ADMIN_MASTER','GESTOR_USUARIOS'))
   );
   ```
   Se retornar alguma linha, remover `DASHBOARD_PEDIDOS_GERAL` desses usuários pela tela de Usuários.

## Testes manuais pendentes (sem ferramenta de screenshot neste ambiente)

- Consultora navega por Agendamentos (vê/edita/cancela de outras), Mapa (cria/edita equipe, vê histórico), Arquitetos (só os próprios), Clientes (só os próprios), Pedidos (só os próprios, sem filtro de consultora).
- Consultora tenta acessar Veículos, Orçamentos, Catálogo, Dashboard diretamente pela URL → tela de "Acesso restrito".
- Histórico de alterações aparece corretamente em Agendamentos e em Equipes/Mapa.
