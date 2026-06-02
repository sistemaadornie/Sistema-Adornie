# Pré-Agendamento de Instalação + Aprovação de Urgência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o pré-agendamento de instalação sobre o sistema de agendamentos existente, adicionando o workflow de aprovação de urgência (ADMIN_MASTER) e o frontend que falta, e corrigir o bug que quebra a criação de agendamentos.

**Architecture:** Modelo integrado — sem tabelas paralelas. A aprovação de urgência vive no próprio `agendamentos.status` (novos valores `pendente_aprovacao` e `rejeitado`) + colunas de controle. Validação de prazo permanece na rota; persistência e notificação no service. Frontend reusa o `NovoAgendamentoModal` via navegação com estado.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), Jest + Supertest (backend); React 19 + Vite + react-router-dom 7 (frontend). Spec: `docs/superpowers/specs/2026-06-01-pre-agendamento-instalacao-design.md`.

---

## File Structure

**Backend**
- Create: `backend/src/database/migrations/agendamentos_aprovacao.sql` — colunas de aprovação.
- Modify: `backend/src/services/agendamentoService.js` — `criar`/`atualizar` (urgência), `listar` (exclusão), novos `decidirAprovacao`, `listarPendentesAprovacao`, helper `notificarAdminsAprovacao`.
- Modify: `backend/src/routes/agendamentosRoutes.js` — hotfix `tipo`; roteamento de urgência no POST/PUT; rotas `GET /pendentes-aprovacao` e `PATCH /:id/aprovacao`.
- Create: `backend/src/__tests__/prazosService.test.js` — testes das funções de dias úteis e validação.
- Create: `backend/src/__tests__/agendamentoAprovacao.test.js` — testes de `decidirAprovacao`.

**Frontend**
- Create: `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx` — seleção de itens.
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx` — botão "Agendar Instalação" + navegação.
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx` — prefill a partir de pedido, UI de urgência no modal, aba "Pendentes de aprovação".
- Modify: `frontend-web/src/pages/catalogo/Categorias.jsx` — edição de prazos no `CategoriaModal`.

**Convenções de verificação**
- Backend: `cd backend && npm test` (Jest). Rodar um arquivo: `npm test -- prazosService`.
- Frontend: `cd frontend-web && npm run build` (compila/erros de sintaxe) e `npm run lint`. Verificação funcional: `npm run dev` e seguir os passos manuais descritos.

---

## Phase 1 — Migration + Hotfix

### Task 1: Migration de colunas de aprovação

**Files:**
- Create: `backend/src/database/migrations/agendamentos_aprovacao.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- agendamentos_aprovacao.sql
-- Workflow de aprovação de urgência para agendamentos de Instalação.
-- Usa o próprio agendamentos.status (novos valores 'pendente_aprovacao' e 'rejeitado').
-- Idempotente.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS status_pretendido        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS motivo_urgencia          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao          TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_em             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovacao_solicitada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovacao_data_minima    DATE,
  ADD COLUMN IF NOT EXISTS aprovacao_dias_faltantes INTEGER;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pendente_aprovacao
  ON agendamentos(empresa_id)
  WHERE status = 'pendente_aprovacao';
```

- [ ] **Step 2: Rodar a migration no banco**

Execute o conteúdo do arquivo no SQL Editor do Postgres/Supabase do projeto. Confirme com:
`\d agendamentos` (ou consulta a `information_schema.columns`) — devem existir as 8 colunas novas.
Expected: as colunas aparecem; rodar de novo não dá erro (idempotente).

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/agendamentos_aprovacao.sql
git commit -m "feat(agendamentos): migration de colunas de aprovacao de urgencia"
```

### Task 2: Hotfix do `tipo` indefinido no POST de agendamentos

**Files:**
- Modify: `backend/src/routes/agendamentosRoutes.js:96`

- [ ] **Step 1: Reproduzir o bug (teste manual)**

Com o backend rodando, faça `POST /api/agendamentos` autenticado com body `{ "titulo":"x","cliente":"y","data":"2026-07-01","hora":"10:00","itens":[{"id":1,"nome":"Item"}] }`.
Expected (bug): HTTP 500 "Erro ao criar agendamento." (porque `tipo` lança ReferenceError).

- [ ] **Step 2: Adicionar `tipo` ao destructuring**

Em `backend/src/routes/agendamentosRoutes.js`, no handler `router.post("/", ...)`, trocar a linha:

```js
    const { titulo, cliente, data, hora, equipe, itens, status } = req.body;
```

por:

```js
    const { titulo, cliente, data, hora, equipe, itens, status, tipo } = req.body;
```

- [ ] **Step 3: Verificar a correção (teste manual)**

Repetir o POST do Step 1.
Expected: HTTP 201 "Agendamento criado!" (ou 400 de prazo se o item violar prazo — o que também prova que não é mais 500).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/agendamentosRoutes.js
git commit -m "fix(agendamentos): declara 'tipo' no POST (corrige 500 ao criar agendamento)"
```

---

## Phase 2 — Testes do prazosService (caracterização)

### Task 3: Testes das funções de dias úteis e validação de prazo

**Files:**
- Create: `backend/src/__tests__/prazosService.test.js`

Contexto: `2026-06-01` é segunda-feira; logo `2026-06-05` é sexta, `2026-06-08` e `2026-06-15` são segundas. `validarPrazoInstalacao` usa `db.query` (sem `db.connect`), então é mockável.

- [ ] **Step 1: Escrever os testes**

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/prazosService');

afterEach(() => jest.clearAllMocks());

describe('adicionarDiasUteis', () => {
  test('0 dias retorna a própria data', () => {
    const base = new Date('2026-06-08T12:00:00'); // segunda
    expect(svc.adicionarDiasUteis(base, 0).getTime()).toBe(base.getTime());
  });

  test('1 dia útil a partir de sexta cai na segunda (pula fim de semana)', () => {
    const sexta = new Date('2026-06-05T12:00:00');
    expect(svc.adicionarDiasUteis(sexta, 1).getDay()).toBe(1); // segunda
  });

  test('nunca retorna sábado nem domingo', () => {
    const base = new Date('2026-06-08T12:00:00');
    for (let n = 1; n <= 10; n++) {
      const d = svc.adicionarDiasUteis(base, n).getDay();
      expect(d).not.toBe(0);
      expect(d).not.toBe(6);
    }
  });
});

describe('calcularDiferencaDiasUteis', () => {
  test('uma semana (segunda a segunda) = 5 dias úteis', () => {
    expect(svc.calcularDiferencaDiasUteis('2026-06-08', '2026-06-15')).toBe(5);
  });

  test('data fim <= início retorna 0', () => {
    expect(svc.calcularDiferencaDiasUteis('2026-06-15', '2026-06-08')).toBe(0);
  });
});

describe('validarPrazoInstalacao', () => {
  test('sem itens passa direto (valido)', async () => {
    const r = await svc.validarPrazoInstalacao(1, '2026-06-10', []);
    expect(r).toEqual({ valido: true });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('data muito futura é válida mesmo com prazos padrão', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ item_id: 1, item_descricao: 'X', categoria_id: 7, categoria_nome: 'Cortinas' }] })
      .mockResolvedValueOnce({ rows: [] }); // sem prazos cadastrados → usa defaults
    const r = await svc.validarPrazoInstalacao(1, '2999-12-31', [1]);
    expect(r.valido).toBe(true);
  });

  test('data de hoje viola o prazo padrão (15 dias úteis)', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    db.query
      .mockResolvedValueOnce({ rows: [{ item_id: 1, item_descricao: 'X', categoria_id: 7, categoria_nome: 'Cortinas' }] })
      .mockResolvedValueOnce({ rows: [] });
    const r = await svc.validarPrazoInstalacao(1, hoje, [1]);
    expect(r.valido).toBe(false);
    expect(r.detalhes).toBeDefined();
    expect(r.detalhes.dias_uteis_faltantes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e verificar que passam**

Run: `cd backend && npm test -- prazosService`
Expected: PASS (todos os testes verdes). Se algum falhar, é regressão real no `prazosService` — investigar antes de prosseguir.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/prazosService.test.js
git commit -m "test(prazos): cobre dias uteis e validacao de prazo de instalacao"
```

---

## Phase 3 — Service de aprovação

### Task 4: `decidirAprovacao` + `listarPendentesAprovacao` + notificação a admins

**Files:**
- Modify: `backend/src/services/agendamentoService.js`
- Test: `backend/src/__tests__/agendamentoAprovacao.test.js`

- [ ] **Step 1: Escrever os testes (falham — funções não existem)**

Create `backend/src/__tests__/agendamentoAprovacao.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const adminUser = { id: 99, nome_completo: 'Admin' };

describe('decidirAprovacao', () => {
  test('404 quando não há agendamento pendente', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // busca inicial
    await expect(
      svc.decidirAprovacao(1, 1, adminUser, { aprovado: true })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('rejeição sem motivo lança 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T', cliente: 'C', criado_por: 7, status_pretendido: 'agendado' }] });
    await expect(
      svc.decidirAprovacao(1, 1, adminUser, { aprovado: false, motivo: '   ' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('aprovação aplica o status_pretendido', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, status: 'agendado' }] }); // fallback p/ todas as queries
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T', cliente: 'C', criado_por: 7, status_pretendido: 'pre_agendado' }] }); // busca inicial
    await svc.decidirAprovacao(1, 1, adminUser, { aprovado: true });
    const updateCall = db.query.mock.calls.find(([sql]) =>
      /UPDATE agendamentos[\s\S]*status=\$1/.test(sql)
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe('pre_agendado'); // status final
    expect(updateCall[1][1]).toBe(99);             // aprovado_por
  });
});

describe('listarPendentesAprovacao', () => {
  test('consulta status pendente_aprovacao da empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: 'T' }] });
    const rows = await svc.listarPendentesAprovacao(5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'pendente_aprovacao'");
    expect(params).toEqual([5]);
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npm test -- agendamentoAprovacao`
Expected: FAIL ("svc.decidirAprovacao is not a function" etc.).

- [ ] **Step 3: Implementar as funções no service**

Em `backend/src/services/agendamentoService.js`, adicionar antes do bloco `module.exports`:

```js
/* ── notifica admins/operadores sobre solicitação de urgência (global) ── */
async function notificarAdminsAprovacao(empresaId, agId, titulo, cliente) {
  await db.query(
    `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
     VALUES ($1, NULL, 'aprovacao_urgencia', $2, $3, $4, 'alerta', $5)`,
    [empresaId,
     `Aprovação de urgência: ${titulo || `#${agId}`}`,
     `${cliente ? cliente + " — " : ""}Solicitação de instalação antes do prazo mínimo aguardando aprovação.`,
     `/agendamentos?aprovacoes=1`,
     agId]
  ).catch((e) => console.warn("Erro ao notificar admins (aprovação):", e.message));
}

/* ── lista solicitações de urgência pendentes (para a aba do ADMIN_MASTER) ── */
async function listarPendentesAprovacao(empresaId) {
  const result = await db.query(
    `SELECT a.id, a.titulo, a.cliente, a.tipo,
            TO_CHAR(a.data,'YYYY-MM-DD') AS data, TO_CHAR(a.hora,'HH24:MI') AS hora,
            a.motivo_urgencia, a.aprovacao_solicitada_em,
            TO_CHAR(a.aprovacao_data_minima,'YYYY-MM-DD') AS aprovacao_data_minima,
            a.aprovacao_dias_faltantes,
            a.criado_por, u.nome_completo AS criado_por_nome,
            CASE WHEN ped.id IS NOT NULL
              THEN COALESCE(ped.numero_origem, 'SIS-' || LPAD(COALESCE(ped.numero_sequencial, ped.id)::TEXT, 8, '0'))
              ELSE NULL END AS pedido_numero
     FROM agendamentos a
     LEFT JOIN usuarios u   ON u.id = a.criado_por
     LEFT JOIN pedidos   ped ON ped.id = a.pedido_id AND ped.deleted_at IS NULL
     WHERE a.empresa_id = $1 AND a.status = 'pendente_aprovacao'
     ORDER BY a.aprovacao_solicitada_em ASC NULLS LAST, a.id ASC`,
    [empresaId]
  );
  return result.rows;
}

/* ── aprova ou rejeita uma solicitação de urgência (ADMIN_MASTER) ── */
async function decidirAprovacao(id, empresaId, adminUser, { aprovado, motivo }) {
  const existe = await db.query(
    `SELECT id, titulo, cliente, criado_por, status_pretendido
     FROM agendamentos
     WHERE id=$1 AND empresa_id=$2 AND status='pendente_aprovacao' LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) {
    const e = new Error("Solicitação de urgência não encontrada ou já decidida."); e.status = 404; throw e;
  }
  const ag = existe.rows[0];

  if (aprovado) {
    const statusFinal = ag.status_pretendido || "agendado";
    await db.query(
      `UPDATE agendamentos
       SET status=$1, aprovado_por=$2, aprovacao_em=NOW(), motivo_rejeicao=NULL, atualizado_em=NOW()
       WHERE id=$3 AND empresa_id=$4`,
      [statusFinal, adminUser.id, id, empresaId]
    );
    await gravarLog(id, empresaId, adminUser.id, adminUser.nome_completo, "urgencia_aprovada", { status_novo: statusFinal });
  } else {
    if (!motivo || !String(motivo).trim()) {
      const e = new Error("Motivo da rejeição é obrigatório."); e.status = 400; throw e;
    }
    await db.query(
      `UPDATE agendamentos
       SET status='rejeitado', aprovado_por=$1, aprovacao_em=NOW(), motivo_rejeicao=$2, atualizado_em=NOW()
       WHERE id=$3 AND empresa_id=$4`,
      [adminUser.id, String(motivo).trim(), id, empresaId]
    );
    await gravarLog(id, empresaId, adminUser.id, adminUser.nome_completo, "urgencia_rejeitada", { motivo: String(motivo).trim() });
  }

  if (ag.criado_por) {
    const titulo  = ag.titulo || `Agendamento #${id}`;
    const tituloN = aprovado ? `Urgência aprovada: ${titulo}` : `Urgência rejeitada: ${titulo}`;
    const msgN    = aprovado
      ? `Sua solicitação de instalação urgente foi aprovada.`
      : `Sua solicitação de instalação urgente foi rejeitada. Motivo: ${String(motivo).trim()}`;
    await db.query(
      `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
       VALUES ($1,$2,'aprovacao_urgencia',$3,$4,$5,$6,$7)`,
      [empresaId, ag.criado_por, tituloN, msgN, `/agendamentos?id=${id}&detalhe=1`, aprovado ? "sucesso" : "erro", id]
    ).catch((e) => console.warn("Erro ao notificar solicitante:", e.message));
  }

  return montarAgendamento(id, empresaId);
}
```

E no `module.exports`, adicionar as três funções exportáveis (`decidirAprovacao`, `listarPendentesAprovacao`) — `notificarAdminsAprovacao` é interna mas pode ficar exportada também:

```js
module.exports = {
  getEquipe, listar, buscar, criar, atualizar, reagendar,
  alterarStatus, adicionarAnexos, excluir,
  getLogs, criarSugestao, listarSugestoes, responderSugestao,
  geocodificarTodos,
  decidirAprovacao, listarPendentesAprovacao, notificarAdminsAprovacao,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npm test -- agendamentoAprovacao`
Expected: PASS. (O teste de aprovação tolera as chamadas extras de log/notificação via `mockResolvedValue` de fallback.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoAprovacao.test.js
git commit -m "feat(agendamentos): decidirAprovacao e listarPendentesAprovacao"
```

---

## Phase 4 — Urgência em criar/atualizar + exclusão nas listagens

### Task 5: `criar` aceita solicitação de urgência

**Files:**
- Modify: `backend/src/services/agendamentoService.js` (função `criar`, ~linhas 328-426)

- [ ] **Step 1: Calcular status final a partir de `dados.aprovacao`**

Logo após a linha `const statusCriacao = statusInput === "pre_agendado" ? "pre_agendado" : "agendado";`, adicionar:

```js
  const aprovacao = dados.aprovacao || null;            // { motivo, data_minima, dias_faltantes }
  const statusFinal = aprovacao ? "pendente_aprovacao" : statusCriacao;
  const statusPretendido = aprovacao ? statusCriacao : null;
```

- [ ] **Step 2: Inserir `statusFinal` em vez de `statusCriacao`**

No `INSERT INTO agendamentos`, o último parâmetro do array (`statusCriacao`) corresponde ao `status` ($20). Trocar `statusCriacao` por `statusFinal`:

```js
       userId, duracao_minutos||null, pessoa_obrigatoria_id||null, statusFinal]
```

- [ ] **Step 3: Persistir colunas de aprovação e notificar admins**

Logo após `const agId = result.rows[0].id;` e os dois `UPDATE` de `cliente_id`/`pedido_id`, adicionar dentro da transação (usando `client`):

```js
    if (aprovacao) {
      await client.query(
        `UPDATE agendamentos
         SET status_pretendido=$1, motivo_urgencia=$2, aprovacao_solicitada_em=NOW(),
             aprovacao_data_minima=$3, aprovacao_dias_faltantes=$4
         WHERE id=$5`,
        [statusPretendido, aprovacao.motivo || null, aprovacao.data_minima || null, aprovacao.dias_faltantes || null, agId]
      );
    }
```

E logo após `await client.query("COMMIT");` (antes do geocode em background), adicionar:

```js
    if (aprovacao) {
      notificarAdminsAprovacao(empresaId, agId, titulo, cliente);
    }
```

- [ ] **Step 4: Verificação (build + teste de fumaça manual)**

Run: `cd backend && npm test` (garante que nada quebrou; testes existentes continuam verdes).
Manual: criar instalação com data inválida e `solicitar_urgencia:true` + `motivo_urgencia` → resposta 201 e o agendamento criado fica com `status='pendente_aprovacao'` (conferir no banco).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agendamentoService.js
git commit -m "feat(agendamentos): criar suporta solicitacao de urgencia (pendente_aprovacao)"
```

### Task 6: `atualizar` aceita urgência e limpa pendência ao reagendar

**Files:**
- Modify: `backend/src/services/agendamentoService.js` (função `atualizar`, ~linhas 428-515)

- [ ] **Step 1: Calcular `novoStatus` considerando urgência**

Após a linha `const novoStatus = STATUSES_EDICAO.includes(statusInput) ? statusInput : statusAtual;`, adicionar:

```js
  const aprovacao = dados.aprovacao || null;
  const statusFinal = aprovacao ? "pendente_aprovacao" : novoStatus;
```

- [ ] **Step 2: Usar `statusFinal` no UPDATE principal**

No `UPDATE agendamentos ... status=$18 ...`, trocar o parâmetro `novoStatus` por `statusFinal` no array de params (posição do `status`):

```js
       duracao_minutos||null, pessoa_obrigatoria_id||null, statusFinal, id, empresaId]
```

- [ ] **Step 3: Gravar/limpar colunas de aprovação**

Logo após esse UPDATE principal (e antes do `DELETE FROM agendamento_equipe`), adicionar:

```js
    if (aprovacao) {
      await client.query(
        `UPDATE agendamentos
         SET status_pretendido=$1, motivo_urgencia=$2, aprovacao_solicitada_em=NOW(),
             aprovacao_data_minima=$3, aprovacao_dias_faltantes=$4, motivo_rejeicao=NULL, aprovado_por=NULL, aprovacao_em=NULL
         WHERE id=$5 AND empresa_id=$6`,
        [STATUSES_EDICAO.includes(statusInput) ? statusInput : "agendado",
         aprovacao.motivo || null, aprovacao.data_minima || null, aprovacao.dias_faltantes || null, id, empresaId]
      );
    } else if (["rejeitado", "pendente_aprovacao"].includes(statusAtual)) {
      // reagendamento limpo após rejeição: data agora válida → encerra a pendência
      await client.query(
        `UPDATE agendamentos
         SET status_pretendido=NULL, motivo_urgencia=NULL, motivo_rejeicao=NULL,
             aprovacao_data_minima=NULL, aprovacao_dias_faltantes=NULL
         WHERE id=$1 AND empresa_id=$2`,
        [id, empresaId]
      );
    }
```

- [ ] **Step 4: Notificar admins quando vira pendência**

Ao final da função, logo antes de `return ag;`, adicionar:

```js
  if (aprovacao) {
    notificarAdminsAprovacao(empresaId, id, ag?.titulo, ag?.cliente);
  }
```

- [ ] **Step 5: Verificação**

Run: `cd backend && npm test` → tudo verde.
Manual: editar um agendamento `rejeitado` para uma data válida → `status` volta para `agendado`/`pre_agendado` e colunas de aprovação ficam nulas (conferir no banco).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agendamentoService.js
git commit -m "feat(agendamentos): atualizar trata urgencia e limpa pendencia ao reagendar"
```

### Task 7: Excluir `pendente_aprovacao`/`rejeitado` das listagens normais

**Files:**
- Modify: `backend/src/services/agendamentoService.js` (função `listar`, ~linha 232)

- [ ] **Step 1: Adicionar a exclusão padrão**

Na função `listar`, trocar a linha do filtro de status:

```js
  if (status)      { params.push(status);      wheres.push(`a.status = $${params.length}`); }
```

por:

```js
  if (status)      { params.push(status);      wheres.push(`a.status = $${params.length}`); }
  else             { wheres.push(`a.status NOT IN ('pendente_aprovacao','rejeitado')`); }
```

(Assim a agenda normal — calendário, instalador, mapa — não mostra pendências/rejeitados; quem filtrar por um status específico continua vendo o que pediu.)

- [ ] **Step 2: Verificação**

Run: `cd backend && npm test` → verde.
Manual: `GET /api/agendamentos` (sem filtro de status) não retorna agendamentos `pendente_aprovacao`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/agendamentoService.js
git commit -m "feat(agendamentos): oculta pendentes/rejeitados das listagens normais"
```

### Task 7b: Liberar itens de instalações rejeitadas

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js` (subquery de `itens-disponiveis-instalacao`, ~linha 760)

- [ ] **Step 1: Ajustar a subquery de reserva de itens**

Em `GET /:id/itens-disponiveis-instalacao`, na subquery `NOT IN (...)`, trocar:

```js
            AND a.tipo = 'Instalação'
            AND a.status != 'cancelado'
```

por:

```js
            AND a.tipo = 'Instalação'
            AND a.status NOT IN ('cancelado','rejeitado')
```

(Assim itens de agendamentos `pendente_aprovacao` continuam reservados, mas os de instalações `rejeitado` voltam a ficar disponíveis.)

- [ ] **Step 2: Verificação (manual)**

Reinicie o backend. Crie uma solicitação de urgência (item reservado: some de `itens-disponiveis-instalacao`). Rejeite-a (Task 13). O item volta a aparecer em `GET /pedidos/:id/itens-disponiveis-instalacao`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "fix(pedidos): libera itens de instalacoes rejeitadas"
```

---

## Phase 5 — Rotas de aprovação

### Task 8: Rotas `GET /pendentes-aprovacao` e `PATCH /:id/aprovacao` + roteamento de urgência

**Files:**
- Modify: `backend/src/routes/agendamentosRoutes.js`

- [ ] **Step 1: Importar o permissionMiddleware (se ainda não estiver)**

No topo do arquivo, garantir o import:

```js
const permissionMiddleware = require("../middlewares/permissionMiddleware");
```

(Se já existir, não duplicar.)

- [ ] **Step 2: Adicionar `GET /pendentes-aprovacao` ANTES da rota `GET /:id`**

Localize `router.get("/:id", authMiddleware, ...)` e insira imediatamente ACIMA dela (para o path literal não ser capturado por `:id`):

```js
// GET /pendentes-aprovacao — lista solicitações de urgência (ADMIN_MASTER)
router.get("/pendentes-aprovacao", authMiddleware, permissionMiddleware("ADMIN_MASTER"), async (req, res) => {
  try {
    const pendentes = await svc.listarPendentesAprovacao(req.user.empresa_id);
    return res.json({ pendentes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar solicitações de urgência." });
  }
});
```

- [ ] **Step 3: Adicionar `PATCH /:id/aprovacao` (junto às outras rotas PATCH `/:id/...`)**

Após `router.patch("/:id/reagendar", ...)`, adicionar:

```js
// PATCH /:id/aprovacao — aprova ou rejeita solicitação de urgência (ADMIN_MASTER)
router.patch("/:id/aprovacao", authMiddleware, permissionMiddleware("ADMIN_MASTER"), async (req, res) => {
  try {
    const { aprovado, motivo } = req.body;
    if (typeof aprovado !== "boolean") {
      return res.status(400).json({ message: "Campo 'aprovado' (boolean) é obrigatório." });
    }
    const ag = await svc.decidirAprovacao(req.params.id, req.user.empresa_id, req.user, { aprovado, motivo });
    return res.json({ message: aprovado ? "Urgência aprovada." : "Solicitação rejeitada.", agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao decidir aprovação." });
  }
});
```

- [ ] **Step 4: Rotear violação de prazo no POST `/` para o caminho de urgência**

No handler `POST /`, substituir o bloco de validação de prazo atual:

```js
    if ((!tipo || tipo === "Instalação") && itemIds.length > 0) {
      const validacao = await prazosService.validarPrazoInstalacao(empresa_id, data, itemIds);
      if (!validacao.valido) {
        const temBypass = req.user.permissoes.includes("ADMIN_MASTER") && req.body.ignorar_prazos === true;
        if (!temBypass) {
          return res.status(400).json({ 
            message: validacao.mensagem,
            detalhes: validacao.detalhes
          });
        }
      }
    }
```

por:

```js
    if ((!tipo || tipo === "Instalação") && itemIds.length > 0) {
      const validacao = await prazosService.validarPrazoInstalacao(empresa_id, data, itemIds);
      if (!validacao.valido) {
        const isAdmin = req.user.permissoes.includes("ADMIN_MASTER");
        const solicitouUrgencia = req.body.solicitar_urgencia === true && String(req.body.motivo_urgencia || "").trim();
        if (isAdmin && req.body.ignorar_prazos === true) {
          // bypass do admin — segue criação normal
        } else if (solicitouUrgencia) {
          req.body.aprovacao = {
            motivo: String(req.body.motivo_urgencia).trim(),
            data_minima: validacao.detalhes?.data_minima || null,
            dias_faltantes: validacao.detalhes?.dias_uteis_faltantes || null,
          };
        } else {
          return res.status(400).json({ message: validacao.mensagem, detalhes: validacao.detalhes });
        }
      }
    }
```

- [ ] **Step 5: Mesmo roteamento no PUT `/:id`**

No handler `PUT /:id`, substituir o bloco análogo (que hoje só faz bypass/400) pelo mesmo padrão do Step 4, mantendo a condição extra `&& data` que já existe:

```js
    if ((!tipo || tipo === "Instalação") && itemIds.length > 0 && data) {
      const validacao = await prazosService.validarPrazoInstalacao(empresa_id, data, itemIds);
      if (!validacao.valido) {
        const isAdmin = req.user.permissoes.includes("ADMIN_MASTER");
        const solicitouUrgencia = req.body.solicitar_urgencia === true && String(req.body.motivo_urgencia || "").trim();
        if (isAdmin && req.body.ignorar_prazos === true) {
          // bypass do admin
        } else if (solicitouUrgencia) {
          req.body.aprovacao = {
            motivo: String(req.body.motivo_urgencia).trim(),
            data_minima: validacao.detalhes?.data_minima || null,
            dias_faltantes: validacao.detalhes?.dias_uteis_faltantes || null,
          };
        } else {
          return res.status(400).json({ message: validacao.mensagem, detalhes: validacao.detalhes });
        }
      }
    }
```

- [ ] **Step 6: Verificação (manual)**

Reinicie o backend. Teste com `curl`/Postman autenticado:
- `GET /api/agendamentos/pendentes-aprovacao` como ADMIN_MASTER → 200 `{ pendentes: [...] }`; como não-admin → 403.
- POST instalação com data inválida + `solicitar_urgencia:true` + `motivo_urgencia` → 201; sem esses campos → 400 com `detalhes`.
- `PATCH /api/agendamentos/<id>/aprovacao` `{ "aprovado": true }` como ADMIN_MASTER → 200 e status vira o pretendido.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/agendamentosRoutes.js
git commit -m "feat(agendamentos): rotas de aprovacao e roteamento de urgencia no POST/PUT"
```

---

## Phase 6 — Frontend: seleção de itens em Pedidos

### Task 9: Componente `ModalSelecionarItensInstalacao`

**Files:**
- Create: `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import { useEffect, useState } from "react";
import { api } from "../../services/api";

export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar }) {
  const [itens, setItens]   = useState([]);
  const [sel, setSel]       = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [erro, setErro]     = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await api.get(`/pedidos/${pedido.id}/itens-disponiveis-instalacao`);
        if (vivo) setItens(res.itens || []);
      } catch (e) {
        if (vivo) setErro(e.message || "Erro ao carregar itens.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [pedido.id]);

  const toggle = (id) => setSel((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const totalDias = (it) =>
    (it.logistica_interna_dias || 0) + (it.confeccao_dias || 0) + (it.expedicao_dias || 0) + (it.outros_dias || 0);

  function continuar() {
    const escolhidos = itens
      .filter((it) => sel.has(it.id))
      .map((it) => ({ pedido_item_id: it.id, nome: it.descricao || `Item ${it.id}` }));
    onContinuar(escolhidos);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="modal-header">
          <h2 className="modal-title">Agendar Instalação — {pedido.numero}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p>Carregando itens…</p>
          ) : erro ? (
            <p className="arq-form-erro">{erro}</p>
          ) : itens.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>Todos os itens deste pedido já estão agendados para instalação.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {itens.map((it) => (
                <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>
                  <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it.id)} />
                  <span style={{ flex: 1 }}>
                    <strong>{it.descricao || `Item ${it.id}`}</strong>
                    {it.ambiente ? <span style={{ color: "var(--color-text-muted)" }}> — {it.ambiente}</span> : null}
                    <br />
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {it.categoria_nome || "Sem categoria"} · prazo mínimo: {totalDias(it)} dias úteis
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={sel.size === 0} onClick={continuar}>
            Continuar ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

Run: `cd frontend-web && npm run build`
Expected: build sem erros (o componente compila; ainda não está em uso).

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx
git commit -m "feat(pedidos): modal de selecao de itens para instalacao"
```

### Task 10: Botão "Agendar Instalação" no detalhe do pedido + navegação

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`

- [ ] **Step 1: Importar o modal e o useNavigate (já usado na página)**

No topo de `Pedidos.jsx`, adicionar o import:

```js
import ModalSelecionarItensInstalacao from "./ModalSelecionarItensInstalacao";
```

(`useNavigate` já é usado na página — confirme que `navigate` está disponível no componente principal; é, pois há `navigate('/pedidos/os/${res.id}')`.)

- [ ] **Step 2: Estado para o modal de instalação no componente principal**

No componente principal de `Pedidos` (onde está `pedidoFull`/`pedidoDetalheAtual` e o `navigate`), adicionar um estado:

```js
  const [instalacaoPedido, setInstalacaoPedido] = useState(null);
```

- [ ] **Step 3: Passar handler ao `DetalhePedido` e renderizar o modal**

Onde o `DetalhePedido` é renderizado (~linha 284), adicionar a prop:

```jsx
              onAgendarInstalacao={() => setInstalacaoPedido(pedidoFull || pedidoDetalheAtual)}
```

E, ao final do JSX da página (junto aos outros modais/print), adicionar:

```jsx
      {instalacaoPedido && (
        <ModalSelecionarItensInstalacao
          pedido={instalacaoPedido}
          onClose={() => setInstalacaoPedido(null)}
          onContinuar={(itensSelecionados) => {
            const p = instalacaoPedido;
            setInstalacaoPedido(null);
            navigate("/agendamentos", {
              state: {
                novoInstalacao: {
                  pedido_id: p.id,
                  pedido_numero: p.numero,
                  cliente: p.cliente_nome || p.cliente || "",
                  cep: p.cep, rua: p.rua, numero: p.numero_rua || p.numero,
                  complemento: p.complemento, bairro: p.bairro, cidade: p.cidade, estado: p.estado,
                  itens: itensSelecionados,
                },
              },
            });
          }}
        />
      )}
```

(Nota: o campo do número da rua do pedido é `numero_rua` na origem — confira no objeto `pedido`; ajuste `p.numero_rua || p.numero` conforme o nome real, validando no Step 5.)

- [ ] **Step 4: Adicionar o botão no header de `DetalhePedido`**

Na função `DetalhePedido` (~linha 343), incluir `onAgendarInstalacao` nos parâmetros:

```js
function DetalhePedido({ pedido, onEditar, onExcluir, onImprimir, onGerarOS, onAbrirOS, onAgendarInstalacao }) {
```

E no header de ações (junto aos botões 🖨 Imprimir / ✏ Editar, ~linha 359), adicionar:

```jsx
          <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={onAgendarInstalacao}>
            📅 Agendar Instalação
          </button>
```

- [ ] **Step 5: Verificação (build + manual)**

Run: `cd frontend-web && npm run build` → sem erros.
Manual (`npm run dev`): abrir um pedido → clicar "Agendar Instalação" → modal lista itens disponíveis → selecionar itens → "Continuar" navega para `/agendamentos` (a abertura do modal pré-preenchido vem na Task 11). Confirme no console que `location.state.novoInstalacao` chega com os itens e endereço corretos.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx
git commit -m "feat(pedidos): botao Agendar Instalacao abre selecao de itens e navega para agenda"
```

---

## Phase 7 — Frontend: prefill e UI de urgência no modal de agendamento

### Task 11: Abrir `NovoAgendamentoModal` pré-preenchido a partir do pedido

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx`

- [ ] **Step 1: Ler o estado de navegação e abrir o modal**

No componente principal da página (o que tem `modalNovo`, `salvarNovoAg`, `useSearchParams`), importar `useLocation` e adicionar o efeito:

```js
import { useSearchParams, useLocation } from "react-router-dom";
```

```js
  const location = useLocation();
  const [prefillInstalacao, setPrefillInstalacao] = useState(null);

  useEffect(() => {
    const pre = location.state?.novoInstalacao;
    if (pre) {
      setPrefillInstalacao(pre);
      setModalNovo(true);
      // limpa o state para não reabrir ao navegar/refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
```

- [ ] **Step 2: Passar o prefill e `user` ao modal de novo agendamento**

Na renderização de `<NovoAgendamentoModal ... />` do bloco "MODAL: NOVO AGENDAMENTO" (~linha 965), adicionar as props e limpar o prefill ao fechar:

```jsx
        <NovoAgendamentoModal
          onClose={() => { setModalNovo(false); setPrefillInstalacao(null); }}
          onSalvar={salvarNovoAg}
          equipe={equipeDisponivel}
          salvando={salvando}
          agendamentos={ags}
          user={user}
          prefill={prefillInstalacao}
          dataInicial={`${curDia.getFullYear()}-${String(curDia.getMonth()+1).padStart(2,"0")}-${String(curDia.getDate()).padStart(2,"0")}`}
        />
```

Também adicionar `user={user}` ao `<NovoAgendamentoModal>` do bloco "EDITAR AGENDAMENTO" (~linha 999) para a UI de urgência funcionar na edição.

- [ ] **Step 3: Inicializar o form do modal a partir do prefill**

Na assinatura de `NovoAgendamentoModal` (~linha 1142), adicionar `prefill` e `user`:

```js
function NovoAgendamentoModal({ onClose, onSalvar, equipe, salvando, agendamentos, agEditar, dataInicial, prefill, user }) {
```

No `useState` do `form` (~linha 1145), usar o prefill como base quando presente (mantendo os defaults atuais para os demais campos). Ajustar os campos iniciais:

```js
  const [form, setForm] = useState({
    titulo:      agEditar?.titulo ?? (prefill ? `Instalação — ${prefill.pedido_numero || ""}`.trim() : ""),
    cliente:     agEditar?.cliente ?? prefill?.cliente ?? "",
    tipo:        agEditar?.tipo ?? "Instalação",
    data:        agEditar?.data ?? dataInicial ?? "",
    hora:        agEditar?.hora ?? "",
    // ...manter os demais campos existentes...
    pedido_id:   agEditar?.pedido_id ?? (prefill?.pedido_id ? String(prefill.pedido_id) : ""),
    cep:         agEditar?.cep ?? prefill?.cep ?? "",
    rua:         agEditar?.rua ?? prefill?.rua ?? "",
    numero:      agEditar?.numero ?? prefill?.numero ?? "",
    complemento: agEditar?.complemento ?? prefill?.complemento ?? "",
    bairro:      agEditar?.bairro ?? prefill?.bairro ?? "",
    cidade:      agEditar?.cidade ?? prefill?.cidade ?? "",
    estado:      agEditar?.estado ?? prefill?.estado ?? "",
  });
```

> Importante: preserve TODOS os campos que já existiam no objeto `form` original; acima só estão os que recebem prefill. Não remova campos existentes.

E inicializar a lista `itens` do modal a partir do prefill (localize o `useState` de `itens`; hoje deriva de `agEditar`). Ajustar para:

```js
  const [itens, setItens] = useState(
    agEditar?.itens_raw?.length
      ? agEditar.itens_raw.map((i) => ({ pedido_item_id: i.pedido_item_id ?? null, nome: i.nome }))
      : (prefill?.itens ?? [])
  );
```

> Se o estado atual de `itens` guarda apenas strings, mantenha compatibilidade: o backend (`inserirItens`) já aceita tanto string quanto `{ nome, pedido_item_id }`. O payload em `onSalvar` já envia `itens`.

- [ ] **Step 4: Verificação (build + manual)**

Run: `cd frontend-web && npm run build` → sem erros.
Manual: repetir o fluxo da Task 10; ao navegar para `/agendamentos`, o modal abre já com cliente, endereço, pedido e itens preenchidos, tipo "Instalação".

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(agendamentos): abre modal pre-preenchido a partir do pedido"
```

### Task 12: UI de urgência quando o prazo é violado

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx`

- [ ] **Step 1: Propagar o erro de prazo dos handlers da página**

Em `salvarNovoAg` (~linha 645) e `editarAg` (~linha 631), re-lançar o erro para o modal tratar e evitar toast redundante no caso de prazo. Em `salvarNovoAg`, trocar o `catch`:

```js
    } catch (e) {
      if (!e?.data?.detalhes) mostrarToast(e.message || "Erro ao criar agendamento.", "error");
      throw e;
    } finally {
```

Em `editarAg`, trocar o `catch`:

```js
    } catch (e) {
      if (!e?.data?.detalhes) mostrarToast(e.message || "Erro ao editar agendamento.", "error");
      throw e;
    } finally {
```

- [ ] **Step 2: Tornar `salvar()` do modal assíncrono e capturar o erro de prazo**

No modal, adicionar estado:

```js
  const [erroPrazo, setErroPrazo] = useState(null); // { message, detalhes }
```

Localize a função `salvar()` (~linha 1308). Extrair o objeto enviado para uma const `payload` e trocar a chamada `onSalvar({...})` por um envio com tratamento. Substituir o trecho final `onSalvar({ ...form, ... });` por:

```js
    const payload = {
      ...form,
      observacoes: null,
      endereco,
      equipe: equipeSelec,
      itens,
      anexos,
      duracao_minutos: duracaoMinutos,
      pessoa_obrigatoria_id: pessoaObrigatoria,
      pedido_id: form.pedido_id ? Number(form.pedido_id) : null,
      status: preAgendado ? "pre_agendado" : "agendado",
      cliente_novo: !clienteSel,
      cliente_telefone: clienteTel || undefined,
      cliente_email: clienteEmail || undefined,
    };
    enviar(payload);
  }

  async function enviar(payload) {
    setErroPrazo(null);
    setErroForm("");
    try {
      await onSalvar(payload);
    } catch (err) {
      if (err?.data?.detalhes) {
        setErroPrazo({ message: err.message, detalhes: err.data.detalhes });
      } else {
        setErroForm(err?.message || "Erro ao salvar agendamento.");
      }
    }
  }
```

> A função `salvar()` mantém todas as validações locais já existentes; apenas o envio final muda.

- [ ] **Step 3: Renderizar o alerta de urgência**

Localize onde `erroForm` é renderizado (~linha 1759). Logo acima dele, adicionar o bloco de urgência:

```jsx
        {erroPrazo && (
          <div style={{ background: "color-mix(in srgb, #ef4444 10%, var(--color-surface))", border: "1px solid #ef4444", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>⏰ Prazo mínimo não atendido</div>
            <div style={{ fontSize: 13 }}>{erroPrazo.message}</div>
            {erroPrazo.detalhes?.data_minima && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                Data mínima: {erroPrazo.detalhes.data_minima.split("-").reverse().join("/")}
                {typeof erroPrazo.detalhes.dias_uteis_faltantes === "number" ? ` · faltam ${erroPrazo.detalhes.dias_uteis_faltantes} dias úteis` : ""}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Motivo da urgência</label>
              <textarea
                value={motivoUrgencia}
                onChange={(e) => setMotivoUrgencia(e.target.value)}
                rows={2}
                placeholder="Ex: cliente VIP, evento em data fixa…"
                style={{ width: "100%", marginTop: 4 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                className="ek-btn ek-btn-primary"
                disabled={salvando || !motivoUrgencia.trim()}
                onClick={() => enviarComUrgencia()}
              >
                Solicitar aprovação de urgência
              </button>
              {(user?.permissoes || []).includes("ADMIN_MASTER") && (
                <button className="ek-btn ek-btn-secondary" disabled={salvando} onClick={() => enviarIgnorandoPrazo()}>
                  Ignorar prazo (admin)
                </button>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Adicionar estado e funções de reenvio**

Junto aos demais `useState` do modal, adicionar:

```js
  const [motivoUrgencia, setMotivoUrgencia] = useState("");
```

E perto da função `enviar`, adicionar:

```js
  function montarPayloadAtual() {
    const partes = [form.rua, form.numero, form.complemento, form.bairro, form.cidade, form.estado ? `- ${form.estado}` : ""].filter(Boolean);
    const endereco = partes.length ? partes.join(", ") + (form.cep ? ` — CEP ${form.cep}` : "") : (agEditar?.endereco || null);
    return {
      ...form, observacoes: null, endereco, equipe: equipeSelec, itens, anexos,
      duracao_minutos: form.hora && form.hora_fim ? undefined : 0, // duração recalculada no salvar normal; aqui mantemos itens/dados
      pessoa_obrigatoria_id: pessoaObrigatoria,
      pedido_id: form.pedido_id ? Number(form.pedido_id) : null,
      status: preAgendado ? "pre_agendado" : "agendado",
      cliente_novo: !clienteSel,
      cliente_telefone: clienteTel || undefined,
      cliente_email: clienteEmail || undefined,
    };
  }

  function enviarComUrgencia() {
    enviar({ ...montarPayloadAtual(), solicitar_urgencia: true, motivo_urgencia: motivoUrgencia.trim() });
  }

  function enviarIgnorandoPrazo() {
    enviar({ ...montarPayloadAtual(), ignorar_prazos: true });
  }
```

> Simplificação: para evitar duplicar o cálculo de `duracao_minutos`, refatore `salvar()` para montar o payload via `montarPayloadAtual()` e então `enviar(payload)`, calculando `duracao_minutos` dentro de `montarPayloadAtual` a partir de `form.hora`/`form.hora_fim` (replique a lógica que já existe em `salvar()`). Assim `salvar`, `enviarComUrgencia` e `enviarIgnorandoPrazo` usam o mesmo builder. Garanta que `duracao_minutos` final seja o número calculado (não `undefined`).

- [ ] **Step 5: Verificação (build + manual)**

Run: `cd frontend-web && npm run build` → sem erros.
Manual: criar instalação com data antes do prazo → aparece o alerta de urgência; sem motivo, o botão fica desabilitado; com motivo, "Solicitar aprovação" cria o agendamento (toast de sucesso) e ele some da agenda (status pendente). Como ADMIN_MASTER, "Ignorar prazo" cria direto.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(agendamentos): UI de solicitacao de urgencia e bypass admin no modal"
```

---

## Phase 8 — Frontend: aba de aprovações em Agendamentos

### Task 13: Aba "Pendentes de aprovação" (ADMIN_MASTER)

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx`

- [ ] **Step 1: Estado e carregamento das pendências**

No componente principal da página, adicionar:

```js
  const [abaAprovacoes, setAbaAprovacoes] = useState(false);
  const [pendentes, setPendentes] = useState([]);
  const isAdminMaster = (user?.permissoes || []).includes("ADMIN_MASTER");

  async function carregarPendentes() {
    if (!isAdminMaster) return;
    try {
      const res = await api.get("/agendamentos/pendentes-aprovacao");
      setPendentes(res.pendentes || []);
    } catch { /* silencioso */ }
  }

  useEffect(() => { carregarPendentes(); }, [isAdminMaster]); // eslint-disable-line
```

(Confirme que `api` está importado no arquivo; se a página usa apenas o hook `useAgendamentos`, importe `import { api } from "../../services/api";`.)

- [ ] **Step 2: Abrir a aba quando vier `?aprovacoes=1`**

No efeito que já lê `searchParams`, ou em um novo efeito:

```js
  useEffect(() => {
    if (searchParams.get("aprovacoes") === "1" && isAdminMaster) setAbaAprovacoes(true);
  }, [searchParams, isAdminMaster]);
```

- [ ] **Step 3: Botão/badge para abrir a aba**

Próximo aos controles de cabeçalho da página (onde ficam filtros/troca de visão), adicionar — só para admin:

```jsx
        {isAdminMaster && (
          <button className="ek-btn ek-btn-secondary" onClick={() => { setAbaAprovacoes(true); carregarPendentes(); }}>
            Pendentes de aprovação{pendentes.length ? ` (${pendentes.length})` : ""}
          </button>
        )}
```

- [ ] **Step 4: Painel/aba com a lista e ações**

Adicionar, junto aos outros modais da página, o painel:

```jsx
      {abaAprovacoes && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setAbaAprovacoes(false)}>
          <div className="modal-box" style={{ maxWidth: 680, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h2 className="modal-title">Pendentes de aprovação</h2>
              <button className="modal-close" onClick={() => setAbaAprovacoes(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendentes.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>Nenhuma solicitação pendente.</p>
              ) : pendentes.map((p) => (
                <CartaoAprovacao key={p.id} p={p} onDecidir={decidirAprovacao} />
              ))}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Função `decidirAprovacao` na página**

```js
  async function decidirAprovacao(id, aprovado, motivo) {
    setSalvando(true);
    try {
      await api.patch(`/agendamentos/${id}/aprovacao`, { aprovado, motivo });
      mostrarToast(aprovado ? "Urgência aprovada!" : "Solicitação rejeitada.");
      await carregarPendentes();
      // recarrega a agenda para refletir o agendamento aprovado
      if (typeof recarregar === "function") recarregar();
    } catch (e) {
      mostrarToast(e.message || "Erro ao decidir aprovação.", "error");
    } finally {
      setSalvando(false);
    }
  }
```

(Use o nome real da função de recarregar agendamentos do hook `useAgendamentos` — localize-a; se não houver, omita essa linha.)

- [ ] **Step 6: Componente `CartaoAprovacao`**

Adicionar no mesmo arquivo (junto aos outros componentes auxiliares):

```jsx
function CartaoAprovacao({ p, onDecidir }) {
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <div style={{ fontWeight: 600 }}>{p.titulo} {p.pedido_numero ? <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>· {p.pedido_numero}</span> : null}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{p.cliente}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
        Solicitada: {p.data ? p.data.split("-").reverse().join("/") : "—"}
        {p.aprovacao_data_minima ? ` · mínima: ${p.aprovacao_data_minima.split("-").reverse().join("/")}` : ""}
        {typeof p.aprovacao_dias_faltantes === "number" ? ` · faltam ${p.aprovacao_dias_faltantes} dias úteis` : ""}
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}><strong>Motivo:</strong> {p.motivo_urgencia || "—"}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>Solicitante: {p.criado_por_nome || "—"}</div>

      {!rejeitando ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="ek-btn ek-btn-primary" onClick={() => onDecidir(p.id, true)}>✅ Aprovar</button>
          <button className="ek-btn ek-btn-secondary" onClick={() => setRejeitando(true)}>❌ Rejeitar</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo da rejeição (obrigatório)" style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="ek-btn ek-btn-primary" disabled={!motivo.trim()} onClick={() => onDecidir(p.id, false, motivo.trim())}>Confirmar rejeição</button>
            <button className="ek-btn ek-btn-secondary" onClick={() => { setRejeitando(false); setMotivo(""); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verificação (build + manual)**

Run: `cd frontend-web && npm run build` → sem erros.
Manual: como ADMIN_MASTER, criar uma solicitação de urgência (Task 12) → o badge "Pendentes de aprovação (1)" aparece; abrir a aba → ver o cartão com motivo/datas; Aprovar → o agendamento aparece na agenda; criar outra e Rejeitar com motivo → solicitante recebe notificação e o item volta a ficar disponível em "Agendar Instalação".

- [ ] **Step 8: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(agendamentos): aba de pendentes de aprovacao com aprovar/rejeitar"
```

---

## Phase 9 — Frontend: prazos por categoria

### Task 14: Editar prazos de instalação dentro do `CategoriaModal`

**Files:**
- Modify: `frontend-web/src/pages/catalogo/Categorias.jsx`

- [ ] **Step 1: Carregar os prazos atuais ao montar a tela**

No componente `Categorias`, adicionar um estado e carregamento dos prazos (mapa por `categoria_id`):

```js
  const [prazosPorCat, setPrazosPorCat] = useState({});

  const carregarPrazos = async () => {
    try {
      const res = await api.get("/pedidos/config/prazos");
      const mapa = {};
      (res.prazos || []).forEach((p) => { mapa[p.categoria_id] = p; });
      setPrazosPorCat(mapa);
    } catch { /* silencioso */ }
  };

  useEffect(() => { carregarPrazos(); }, []); // eslint-disable-line
```

- [ ] **Step 2: Passar os prazos da categoria ao modal**

Onde o `CategoriaModal` é renderizado, passar a prop `prazos`:

```jsx
        <CategoriaModal
          categoria={modal === "novo" ? null : modal}
          prazos={modal && modal !== "novo" ? prazosPorCat[modal.id] : null}
          onClose={() => setModal(null)}
          onSalvar={handleSalvar}
          salvando={salvando}
        />
```

- [ ] **Step 3: Campos de prazo no `CategoriaModal`**

Em `CategoriaModal`, receber `prazos` e adicionar estados (defaults coerentes com o backend: 2/10/3/0):

```js
function CategoriaModal({ categoria, prazos, onClose, onSalvar, salvando }) {
  const [nome, setNome] = useState(categoria?.nome || "");
  const [cor, setCor]   = useState(categoria?.cor  || "#C9A96E");
  const [logistica, setLogistica] = useState(prazos?.logistica_interna_dias ?? 2);
  const [confeccao, setConfeccao] = useState(prazos?.confeccao_dias ?? 10);
  const [expedicao, setExpedicao] = useState(prazos?.expedicao_dias ?? 3);
  const [outros,    setOutros]    = useState(prazos?.outros_dias ?? 0);
  const [erro, setErro] = useState(null);
```

No `handleSubmit`, passar também os prazos:

```js
    onSalvar({ nome, cor, prazos: {
      logistica_interna_dias: Number(logistica) || 0,
      confeccao_dias: Number(confeccao) || 0,
      expedicao_dias: Number(expedicao) || 0,
      outros_dias: Number(outros) || 0,
    }});
```

E adicionar a seção de inputs no formulário (após o seletor de cor), apenas quando editando (há `categoria?.id`):

```jsx
          {categoria?.id && (
            <div className="ag-form-field" style={{ marginTop: 12 }}>
              <label>Prazos de instalação (dias úteis)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 12 }}>Logística<input type="number" min="0" value={logistica} onChange={(e) => setLogistica(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Confecção<input type="number" min="0" value={confeccao} onChange={(e) => setConfeccao(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Expedição<input type="number" min="0" value={expedicao} onChange={(e) => setExpedicao(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Outros<input type="number" min="0" value={outros} onChange={(e) => setOutros(e.target.value)} /></label>
              </div>
            </div>
          )}
```

- [ ] **Step 4: Persistir os prazos no `handleSalvar`**

Em `handleSalvar` (componente `Categorias`), após salvar a categoria (POST/PUT existentes), persistir os prazos quando vierem e for edição. Ajustar o ramo de edição:

```js
      } else {
        const res = await api.put(`/categorias/${modal.id}`, { nome: dados.nome, cor: dados.cor });
        const atualizada = categorias.map((c) => c.id === res.categoria.id ? res.categoria : c);
        setCategorias(atualizada);
        onCategoriasChange?.(atualizada);
        if (dados.prazos) {
          await api.put("/pedidos/config/prazos", { prazos: [{ categoria_id: modal.id, ...dados.prazos }] });
          await carregarPrazos();
        }
      }
```

(O ramo "novo" continua só criando a categoria; prazos são editados depois, na edição.)

- [ ] **Step 5: Verificação (build + manual)**

Run: `cd frontend-web && npm run build` → sem erros.
Manual: editar uma categoria → ajustar os 4 prazos → salvar → reabrir e confirmar que os valores persistiram (vêm de `GET /pedidos/config/prazos`). Conferir no banco a linha em `categoria_prazos`.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/catalogo/Categorias.jsx
git commit -m "feat(catalogo): edicao de prazos de instalacao por categoria"
```

---

## Self-Review (preenchido pelo autor do plano)

**1. Cobertura do spec:**
- Hotfix `tipo` → Task 2. ✅
- Migration de aprovação → Task 1. ✅
- `pendente_aprovacao`/`rejeitado` no status + colunas → Tasks 1, 4, 5, 6. ✅
- Solicitar urgência (motivo, snapshots) + notificar admins → Tasks 5/6 (service), 8 (rota), 12 (UI). ✅
- Reserva de itens (excluir cancelado+rejeitado) → Task 7b. ✅
- Decisão admin (aprovar/rejeitar, notificar solicitante, auditoria) → Tasks 4, 8, 13. ✅
- Reagendamento após rejeição → Task 6 Step 3. ✅
- Ocultar pendentes/rejeitados das listagens → Task 7. ✅
- Botão "Agendar Instalação" + seleção de itens → Tasks 9, 10. ✅
- Prefill do modal → Task 11. ✅
- Aba de aprovações → Task 13. ✅
- Prazos por categoria (Categorias) → Task 14. ✅
- Base da data mínima = hoje (mantido) → nenhuma mudança no `prazosService` (já é assim). ✅
- Testes unitários (prazos, aprovação) → Tasks 3, 4. ✅

**2. Reserva de itens:** resolvida na Task 7b (subquery de `itens-disponiveis-instalacao` passa a excluir `cancelado` e `rejeitado`, mantendo `pendente_aprovacao` reservado).

**3. Sem placeholders:** todos os passos de código trazem o código real. ✅

**4. Consistência de tipos/nomes:** `decidirAprovacao(id, empresaId, adminUser, { aprovado, motivo })`, `listarPendentesAprovacao(empresaId)`, `notificarAdminsAprovacao(...)`, `dados.aprovacao = { motivo, data_minima, dias_faltantes }`, colunas `status_pretendido`/`aprovacao_*` — usados de forma idêntica em service, rotas e testes. ✅
