# Bloquear iniciar/não concluído em agendamentos pré-agendados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que um agendamento com `status='pre_agendado'` seja iniciado ("Em andamento"), concluído ou marcado como "Não concluído" — tanto na PWA do instalador quanto via chamada direta à API.

**Architecture:** Correção pontual em dois lugares independentes: (1) `frontend-instalador` remove `"pre_agendado"` da lista de status que liberam o botão "Iniciar atendimento"; (2) `backend` adiciona uma validação de transição de status em `agendamentoService.alterarStatus`, rejeitando com HTTP 400 qualquer tentativa de mover um agendamento `pre_agendado` para `andamento`/`concluido`/`nao_concluido`, independente de quem chame a API.

**Tech Stack:** React 19 + Vite (frontend-instalador); Node.js/Express + PostgreSQL (`pg`) + Jest (backend). Spec: `docs/superpowers/specs/2026-06-18-bloquear-acoes-pre-agendado-design.md`.

## Global Constraints

- A transição `pre_agendado → agendado` e `pre_agendado → cancelado` deve continuar permitida (não é "iniciar" nem "concluir").
- A validação no backend deve valer para qualquer perfil de usuário (instalador, comercial, gestor/admin) — sem exceção.
- Não tocar no app mobile Flutter (`mobile/`) nem em `frontend-web` — ambos fora de escopo (frontend-web já está correto; mobile não tem manutenção ativa).

---

## File Structure

- Modify: `frontend-instalador/src/utils/agendamentos.js` — remove `"pre_agendado"` de `STATUS_INSTALADOR_ACOES.podeIniciar`.
- Modify: `backend/src/services/agendamentoService.js` — adiciona validação de transição em `alterarStatus`.
- Create: `backend/src/__tests__/agendamentoStatusPreAgendado.test.js` — testes da nova validação.

---

## Task 1: PWA — esconder botão "Iniciar atendimento" em pré-agendados

**Files:**
- Modify: `frontend-instalador/src/utils/agendamentos.js:118-122`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `STATUS_INSTALADOR_ACOES.podeIniciar(status)` — usado por `frontend-instalador/src/pages/AgendamentoDetalhe.jsx:308` para decidir se mostra o botão "▶ Iniciar atendimento".

- [ ] **Step 1: Editar `podeIniciar`**

Em `frontend-instalador/src/utils/agendamentos.js`, trocar:

```js
export const STATUS_INSTALADOR_ACOES = {
  podeIniciar:  (status) => ["agendado", "pre_agendado", "atrasado", "aguardando", "retorno"].includes(status),
  podeFinalizar:(status) => status === "andamento",
  finalizado:   (status) => ["concluido", "nao_concluido", "cancelado"].includes(status),
};
```

por:

```js
export const STATUS_INSTALADOR_ACOES = {
  podeIniciar:  (status) => ["agendado", "atrasado", "aguardando", "retorno"].includes(status),
  podeFinalizar:(status) => status === "andamento",
  finalizado:   (status) => ["concluido", "nao_concluido", "cancelado"].includes(status),
};
```

- [ ] **Step 2: Verificação (build + manual)**

Run: `cd frontend-instalador && npm run build`
Expected: build sem erros.

Manual (`npm run dev` em `frontend-instalador`, logado como instalador): abrir um agendamento com status "Pré-agendado" → a seção "Ação" com o botão "▶ Iniciar atendimento" não aparece (nem nenhuma outra ação, já que `podeFinalizar` e `finalizado` também são falsos para esse status). Abrir um agendamento "Agendado" → o botão "Iniciar atendimento" continua aparecendo normalmente (regressão).

- [ ] **Step 3: Commit**

```bash
git add frontend-instalador/src/utils/agendamentos.js
git commit -m "fix(instalador): esconde botao Iniciar atendimento em agendamento pre-agendado"
```

---

## Task 2: Backend — rejeitar transição de pré-agendado para andamento/concluído/não concluído

**Files:**
- Modify: `backend/src/services/agendamentoService.js:675-696` (função `alterarStatus`)
- Create: `backend/src/__tests__/agendamentoStatusPreAgendado.test.js`

**Interfaces:**
- Consumes: nada de tarefas anteriores (independente da Task 1).
- Produces: `alterarStatus(id, empresaId, userId, nomeCompleto, permissoes, status, motivo, files, nomes)` continua com a mesma assinatura; passa a lançar `Error` com `.status = 400` quando a transição é bloqueada. Usado por `PUT /agendamentos/:id/status` em `backend/src/routes/agendamentosRoutes.js:221`.

- [ ] **Step 1: Escrever os testes (devem falhar — validação ainda não existe)**

Create `backend/src/__tests__/agendamentoStatusPreAgendado.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_PRE_AGENDADO = {
  id: 1, titulo: 'Instalação X', cliente: 'Cliente Y', tipo: 'Instalação',
  criado_por: 7, status_anterior: 'pre_agendado',
};

describe('alterarStatus — bloqueio de transição a partir de pre_agendado', () => {
  test('pre_agendado -> andamento é rejeitado com 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] }); // busca inicial
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'andamento', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('pre_agendado -> concluido é rejeitado com 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('pre_agendado -> nao_concluido é rejeitado com 400', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] });
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toMatchObject({ status: 400 });
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('pre_agendado -> agendado continua permitido (passa da validação)', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] }); // busca inicial
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'agendado', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('pre_agendado -> cancelado continua permitido (passa da validação)', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_PRE_AGENDADO] }); // busca inicial
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'cancelado', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });

  test('andamento -> nao_concluido (status atual não é pre_agendado) continua permitido', async () => {
    const AG_ANDAMENTO = { ...AG_PRE_AGENDADO, status_anterior: 'andamento' };
    db.query.mockResolvedValueOnce({ rows: [AG_ANDAMENTO] }); // busca inicial
    db.connect.mockRejectedValueOnce(new Error('SENTINEL_PASSOU_DA_VALIDACAO'));
    await expect(
      svc.alterarStatus(1, 1, 99, 'Admin', [], 'nao_concluido', null, [], [])
    ).rejects.toThrow('SENTINEL_PASSOU_DA_VALIDACAO');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npm test -- agendamentoStatusPreAgendado`
Expected: FAIL nos três primeiros testes (a chamada chega em `db.connect()`, que não tem mock configurado e retorna `undefined`, causando um erro diferente de `{status: 400}` — ou o teste do `db.connect` não ter sido chamado falha). Os dois últimos testes (`agendado`/`cancelado`) e o de `andamento -> nao_concluido` devem passar, já que nada bloqueia essas transições hoje.

- [ ] **Step 3: Implementar a validação**

Em `backend/src/services/agendamentoService.js`, localizar o trecho (linhas ~675-679):

```js
  const existe = await db.query(
    `SELECT id, titulo, cliente, tipo, criado_por, status AS status_anterior FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }
```

Imediatamente após a linha do 404, adicionar:

```js

  const ACOES_BLOQUEADAS_DE_PRE_AGENDADO = ["andamento", "concluido", "nao_concluido"];
  if (existe.rows[0].status_anterior === "pre_agendado" && ACOES_BLOQUEADAS_DE_PRE_AGENDADO.includes(status)) {
    const e = new Error("Agendamentos pré-agendados são somente para visualização — confirme o agendamento antes de iniciar ou concluir.");
    e.status = 400;
    throw e;
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npm test -- agendamentoStatusPreAgendado`
Expected: PASS (todos os 6 testes verdes).

- [ ] **Step 5: Rodar a suíte completa do backend (regressão)**

Run: `cd backend && npm test`
Expected: PASS — nenhum teste pré-existente quebrado (em especial `agendamentoAprovacao.test.js`, que também usa `agendamentoService`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoStatusPreAgendado.test.js
git commit -m "feat(agendamentos): bloqueia iniciar/concluir/nao-concluir a partir de pre_agendado"
```

---

## Self-Review

**1. Cobertura do spec:**
- PWA: remover `pre_agendado` de `podeIniciar` → Task 1. ✅
- Backend: rejeitar `andamento`/`concluido`/`nao_concluido` a partir de `pre_agendado`, para qualquer perfil → Task 2. ✅
- `pre_agendado → agendado` e `pre_agendado → cancelado` continuam permitidos → cobertos pelos testes "continua permitido" da Task 2. ✅
- Frontend-web e mobile Flutter: fora de escopo, nenhuma tarefa criada para eles (conforme spec). ✅

**2. Sem placeholders:** todos os passos trazem código real, comandos exatos e saída esperada. ✅

**3. Consistência de tipos/nomes:** `alterarStatus(id, empresaId, userId, nomeCompleto, permissoes, status, motivo, files, nomes)` usado de forma idêntica ao já existente na rota `PUT /:id/status` (`backend/src/routes/agendamentosRoutes.js:221`) e nos novos testes. `STATUS_INSTALADOR_ACOES.podeIniciar` mantém a mesma assinatura `(status) => boolean` consumida por `AgendamentoDetalhe.jsx`. ✅
