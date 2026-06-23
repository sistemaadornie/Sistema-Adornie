# Remarcação após Conferência/Instalação "Não Concluído" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um agendamento de Conferência ou Instalação é marcado `nao_concluido`, notificar o consultor do pedido com um link direto ao fluxo do pedido, parar de contar essa visita como "resolvida" nos cálculos de cobertura/itens-disponíveis, e mostrar no fluxo do pedido um badge + botão "Remarcar" que pré-preenche um novo agendamento com os mesmos itens.

**Architecture:** Mudanças cirúrgicas em código já existente — nenhuma migração de banco, nenhum componente novo. Backend: estender a query `existe` e o bloco de notificação em `agendamentoService.alterarStatus`; adicionar `'nao_concluido'` às exclusões de cobertura em `dashboardService.buscarFluxoPedido` e nas rotas `itens-disponiveis-*`; expor `observacoes_status` no retorno do fluxo. Frontend: badge `pf-badge-err` + botão que reaproveita o padrão `navigate('/agendamentos', { state: { novoInstalacao } })` já usado em `EtapaDadosPedido.jsx`.

**Tech Stack:** Node/Express + `pg` (queries SQL diretas, sem ORM), Jest + Supertest (backend), React (frontend, sem suíte de testes automatizada neste módulo).

## Global Constraints

- Escopo: apenas agendamentos de tipo `Conferência` e `Instalação` (não `Retorno/Finalização` nem `Manutenção`).
- O agendamento antigo (`nao_concluido`) nunca é editado/apagado — só perde "cobertura"; o histórico fica intacto.
- Não criar campo `agendamento_anterior_id` nem qualquer vínculo formal entre o agendamento antigo e o novo.
- Não modificar `notificarEquipe()` (usada por outros status também) — a extensão de link/destinatário é feita com inserts adicionais isolados, só dentro do branch `nao_concluido`.
- Sem migração de banco: `pedido_auditoria.etapa` é `VARCHAR(30)` livre (sem CHECK constraint) — `'conferencia'`/`'entrega'` são valores já usados em outros pontos do mesmo arquivo.
- Frontend deste módulo não tem suíte de testes automatizada — validar via execução manual no navegador (último task).

---

## Task 1: Backend — notificação com link do pedido + consultor + auditoria

**Files:**
- Modify: `backend/src/services/agendamentoService.js:701-712` (query `existe`)
- Modify: `backend/src/services/agendamentoService.js:967-991` (bloco de notificação `nao_concluido`)
- Test: `backend/src/__tests__/agendamentoNaoConcluidoNotificacao.test.js` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task).
- Produces: nenhuma interface nova consumida por outras tasks — mudança autocontida em `alterarStatus`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/__tests__/agendamentoNaoConcluidoNotificacao.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db  = require('../database/db');
const svc = require('../services/agendamentoService');

afterEach(() => jest.clearAllMocks());

const AG_CONFERENCIA = {
  id: 5, titulo: 'Conferência X', cliente: 'Cliente Y', tipo: 'Conferência',
  criado_por: 7, status_anterior: 'andamento',
  pedido_id: 42, pedido_consultor_id: 88,
};

function mockClient() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
}

function mockMontarAgendamento() {
  // 5 queries em paralelo dentro de montarAgendamento (ag, equipe, itens, itemFotos, anexos)
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 5, titulo: 'Conferência X', cliente: 'Cliente Y', pedido_id: 42 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
}

describe('alterarStatus — nao_concluido notifica pedido e consultor', () => {
  test('grava notificação com link /pedidos/{id}/fluxo, notifica consultor e grava auditoria', async () => {
    db.query.mockResolvedValueOnce({ rows: [AG_CONFERENCIA] }); // existe
    const client = mockClient();
    db.connect.mockResolvedValueOnce(client); // transação (UPDATE agendamentos + gravarLog)
    mockMontarAgendamento();
    // notificarEquipe: equipe vazia, criado_por sem time, idsAdmins vazio
    db.query
      .mockResolvedValueOnce({ rows: [] }) // agendamento_equipe (notificarEquipe)
      .mockResolvedValueOnce({ rows: [{ criado_por: 7 }] }) // criado_por (notificarEquipe)
      .mockResolvedValueOnce({ rows: [] }) // idsAdmins
      .mockResolvedValueOnce({ rows: [] }) // INSERT notificacoes global
      .mockResolvedValueOnce({ rows: [] }) // INSERT notificacoes consultor
      .mockResolvedValueOnce({ rows: [] }); // INSERT pedido_auditoria

    await svc.alterarStatus(5, 1, 99, 'Admin', [], 'nao_concluido', 'Cliente não estava em casa', [], []);

    const todasQueries = db.query.mock.calls.map((c) => c[0]);
    const insertGlobal = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === undefined
    );
    expect(insertGlobal[1][3]).toBe('/pedidos/42/fluxo'); // link

    const insertConsultor = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === 88
    );
    expect(insertConsultor).toBeTruthy();
    expect(insertConsultor[1][4]).toBe('/pedidos/42/fluxo');

    const insertAuditoria = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO pedido_auditoria'));
    expect(insertAuditoria).toBeTruthy();
    expect(insertAuditoria[1]).toEqual([42, 1, 99, 'conferencia', 'Agendamento #5 (Conferência) marcado como não concluído. Motivo: Cliente não estava em casa']);
    expect(todasQueries.some((q) => q.includes("acao", ))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd backend && npx jest agendamentoNaoConcluidoNotificacao --silent`
Expected: FAIL — `insertGlobal[1][3]` não é `/pedidos/42/fluxo` (ainda é `/agendamentos?id=5&detalhe=1`), e `insertConsultor`/`insertAuditoria` são `undefined`.

- [ ] **Step 3: Estender a query `existe` para trazer `pedido_id` e `consultor_id` do pedido**

Em `backend/src/services/agendamentoService.js`, localizar (linha ~701-704):

```js
  const existe = await db.query(
    `SELECT id, titulo, cliente, tipo, criado_por, status AS status_anterior FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
```

Substituir por:

```js
  const existe = await db.query(
    `SELECT a.id, a.titulo, a.cliente, a.tipo, a.criado_por, a.status AS status_anterior,
            a.pedido_id, p.consultor_id AS pedido_consultor_id
     FROM agendamentos a
     LEFT JOIN pedidos p ON p.id = a.pedido_id
     WHERE a.id=$1 AND a.empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
```

- [ ] **Step 4: Atualizar o bloco de notificação `nao_concluido`**

Localizar (linha ~967-979):

```js
    let notifs;
    if (status === "nao_concluido") {
      /* Caso especial: uma única notificação combinada para não duplicar */
      const tituloUnico = `Reagendar: ${titulo}`;
      const msgUnica    = `${cliente ? cliente + " — " : ""}Serviço não concluído. Reagendamento necessário.`;
      notifs = [
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1, NULL, 'reagendamento_pendente', $2, $3, $4, 'alerta', $5)`,
          [empresaId, tituloUnico, msgUnica, link, id]
        ),
        notificarEquipe(id, empresaId, tituloUnico, msgUnica, "alerta", userId),
      ];
    } else {
```

Substituir por:

```js
    let notifs;
    if (status === "nao_concluido") {
      /* Caso especial: uma única notificação combinada para não duplicar */
      const tipoAg = existe.rows[0]?.tipo;
      const dentroDoEscopoRemarcacao = ["Conferência", "Instalação"].includes(tipoAg);
      const pedidoId   = dentroDoEscopoRemarcacao ? (existe.rows[0]?.pedido_id || null) : null;
      const consultorId = dentroDoEscopoRemarcacao ? (existe.rows[0]?.pedido_consultor_id || null) : null;
      const linkReagendar = pedidoId ? `/pedidos/${pedidoId}/fluxo` : link;

      const tituloUnico = `Reagendar: ${titulo}`;
      const msgUnica    = `${cliente ? cliente + " — " : ""}Serviço não concluído. Reagendamento necessário.`;
      notifs = [
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1, NULL, 'reagendamento_pendente', $2, $3, $4, 'alerta', $5)`,
          [empresaId, tituloUnico, msgUnica, linkReagendar, id]
        ),
        notificarEquipe(id, empresaId, tituloUnico, msgUnica, "alerta", userId),
      ];

      if (consultorId) {
        notifs.push(
          db.query(
            `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
             VALUES ($1, $2, 'reagendamento_pendente', $3, $4, $5, 'alerta', $6)`,
            [empresaId, consultorId, tituloUnico, msgUnica, linkReagendar, id]
          )
        );
      }

      if (pedidoId) {
        const etapaAuditoria = tipoAg === "Conferência" ? "conferencia" : "entrega";
        const descricaoAuditoria = `Agendamento #${id} (${tipoAg}) marcado como não concluído.${motivo ? ` Motivo: ${motivo}` : ""}`;
        notifs.push(
          db.query(
            `INSERT INTO pedido_auditoria (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
             VALUES ($1, $2, $3, $4, 'agendamento_nao_concluido', $5)`,
            [pedidoId, empresaId, userId || null, etapaAuditoria, descricaoAuditoria]
          )
        );
      }
    } else {
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `cd backend && npx jest agendamentoNaoConcluidoNotificacao --silent`
Expected: PASS

- [ ] **Step 6: Rodar a suíte de regressão dos testes existentes de `agendamentoService`**

Run: `cd backend && npx jest agendamentoStatusPreAgendado agendamentoFotoPorItemValidacao --silent`
Expected: PASS (a query `existe` ganhou colunas novas, mas os mocks existentes usam objetos com chaves extras inexistentes — `pedido_id`/`pedido_consultor_id` ficam `undefined`, o que é tratado pelo `|| null` no código novo, então não deve quebrar nada).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoNaoConcluidoNotificacao.test.js
git commit -m "feat: notificar consultor com link do pedido e registrar auditoria ao marcar conferência/instalação como não concluída"
```

---

## Task 2: Backend — corrigir cobertura de Conferência/Instalação em `buscarFluxoPedido`

**Files:**
- Modify: `backend/src/services/dashboardService.js:511-541`
- Test: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js` (acrescentar describe)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nenhuma interface nova — só corrige o valor de `etapa1_ok`/`itens_cobertos` quando há agendamento `nao_concluido`.

- [ ] **Step 1: Escrever o teste que falha**

Em `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`, acrescentar ao final do arquivo:

```js
describe('buscarFluxoPedido — agendamento nao_concluido não conta como cobertura', () => {
  test('etapa1_ok fica false quando a única conferência do item está nao_concluido', async () => {
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
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // allItems
      .mockResolvedValueOnce({ rows: [{ id: 1, descricao: 'Persiana', ambiente: 'Sala', quantidade: 1, unidade: 'UN', em_confeccao: false, confeccao_ok: false, produto_ok: false }] }) // itensRows
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'nao_concluido', tipo: 'Conferência', data_inicio: '2026-06-20' }] }) // genitoresRaw
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosRows (instalação) — já deve vir 0 da query corrigida
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosConferenciaRows — já deve vir 0 da query corrigida
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 1, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
      .mockResolvedValueOnce({ rows: [] }) // herdeirosRaw
      .mockResolvedValueOnce({ rows: [] }); // separacaoRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const queryCobertura = db.query.mock.calls[9][0]; // itensCobertosConferenciaRows
    expect(queryCobertura).toContain("'cancelado','rejeitado','nao_concluido'");

    const etapa1 = resultado.etapas.find((e) => e.numero === 1);
    expect(etapa1.concluida).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido --silent`
Expected: FAIL — `queryCobertura` ainda não contém `'nao_concluido'` na exclusão.

- [ ] **Step 3: Corrigir as duas queries de cobertura**

Em `backend/src/services/dashboardService.js`, dentro de `buscarFluxoPedido` (NÃO confundir com as queries equivalentes em `listarPedidosDashboard`, linhas 170-206, que usam `a.pedido_id = ANY($1)` e ficam fora de escopo desta task).

Localizar (linha ~511-521):

```js
    db.query(
      `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL
         AND a.tipo = 'Instalação'`,
      [pedidoId, empresaId]
    ),
```

Substituir o `NOT IN` por:

```js
         AND a.status NOT IN ('cancelado','rejeitado','nao_concluido')
```

Localizar (linha ~529-541):

```js
    db.query(
      `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL
         AND a.tipo = 'Conferência'
         AND cat.necessita_conferencia = true`,
      [pedidoId, empresaId]
    ),
```

Substituir o `NOT IN` da mesma forma:

```js
         AND a.status NOT IN ('cancelado','rejeitado','nao_concluido')
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido --silent`
Expected: PASS (todos os describes do arquivo, incluindo os 3 já existentes — confirme que não regrediram).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "fix: agendamento nao_concluido deixa de contar como cobertura de conferência/instalação no fluxo do pedido"
```

---

## Task 3: Backend — expor `observacoes_status` para genitores e herdeiros do fluxo

**Files:**
- Modify: `backend/src/services/dashboardService.js:471-482` (query `genitoresRaw`)
- Modify: `backend/src/services/dashboardService.js:688-694` (query `herdeirosRaw`)
- Modify: `backend/src/services/dashboardService.js:739-758` (montagem de `herdeirosporPai` e `pre_agendamentos`)
- Test: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js` (acrescentar describe)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `pre_agendamentos[].observacoes_status` e `pre_agendamentos[].herdeiros[].observacoes_status` — consumido pelas Tasks 5 e 6 (frontend) para mostrar o motivo abaixo do badge.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`:

```js
describe('buscarFluxoPedido — expõe observacoes_status do agendamento', () => {
  test('pre_agendamentos inclui observacoes_status do genitor', async () => {
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
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'nao_concluido', tipo: 'Conferência', data_inicio: '2026-06-20', observacoes_status: 'Cliente ausente' }] }) // genitoresRaw
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] })
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] })
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
      .mockResolvedValueOnce({ rows: [{ id: 20, agendamento_pai_id: 10, tipo: 'Conferência', status: 'nao_concluido', data_inicio: '2026-06-21', observacoes_status: 'Item avariado' }] }) // herdeirosRaw
      .mockResolvedValueOnce({ rows: [] }); // separacaoRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    expect(resultado.pre_agendamentos[0].observacoes_status).toBe('Cliente ausente');
    expect(resultado.pre_agendamentos[0].herdeiros[0].observacoes_status).toBe('Item avariado');
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido --silent`
Expected: FAIL — `observacoes_status` é `undefined` nos dois pontos.

- [ ] **Step 3: Incluir a coluna nas duas queries**

Localizar (linha ~471-482):

```js
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
```

Trocar `SELECT a.id, a.status, a.tipo, a.data AS data_inicio` por:

```js
    `SELECT a.id, a.status, a.tipo, a.data AS data_inicio, a.observacoes_status
```

Localizar (linha ~688-694):

```js
    db.query(
      `SELECT id, agendamento_pai_id, tipo, status, data AS data_inicio
       FROM agendamentos
       WHERE agendamento_pai_id = ANY($1) AND empresa_id = $2
       ORDER BY data`,
      [genitoreIds, empresaId]
    ),
```

Trocar `SELECT id, agendamento_pai_id, tipo, status, data AS data_inicio` por:

```js
      `SELECT id, agendamento_pai_id, tipo, status, data AS data_inicio, observacoes_status
```

- [ ] **Step 4: Propagar o campo na montagem dos objetos**

Localizar (linha ~739-749):

```js
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
```

Adicionar `observacoes_status: h.observacoes_status,` ao objeto:

```js
  const herdeirosporPai = {};
  for (const h of herdeirosRaw) {
    if (!herdeirosporPai[h.agendamento_pai_id]) herdeirosporPai[h.agendamento_pai_id] = [];
    herdeirosporPai[h.agendamento_pai_id].push({
      id: h.id,
      tipo: h.tipo,
      status: h.status,
      data_inicio: h.data_inicio,
      observacoes_status: h.observacoes_status,
      itens: itensSeparacaoPorAg[h.id] || [],
    });
  }
```

Localizar (linha ~751-758):

```js
  const pre_agendamentos = genitoresRaw.map((g) => ({
    id: g.id,
    data_inicio: g.data_inicio,
    status: g.status,
    tipo: g.tipo,
    itens: itensPorAg[g.id] || [],
    herdeiros: herdeirosporPai[g.id] || [],
  }));
```

Adicionar `observacoes_status: g.observacoes_status,`:

```js
  const pre_agendamentos = genitoresRaw.map((g) => ({
    id: g.id,
    data_inicio: g.data_inicio,
    status: g.status,
    tipo: g.tipo,
    observacoes_status: g.observacoes_status,
    itens: itensPorAg[g.id] || [],
    herdeiros: herdeirosporPai[g.id] || [],
  }));
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido --silent`
Expected: PASS (todos os describes do arquivo).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "feat: expor observacoes_status de agendamentos no fluxo do pedido"
```

---

## Task 4: Backend — corrigir elegibilidade de itens nas rotas de novo agendamento

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js:512-519` (`itens-disponiveis-instalacao`)
- Modify: `backend/src/routes/pedidosRoutes.js:562-569` (`itens-disponiveis-conferencia-entrega`)
- Test: `backend/src/__tests__/pedidosRoutes.itensConferenciaEntrega.test.js` (acrescentar teste)
- Test: `backend/src/__tests__/pedidosRoutes.itensDisponiveisInstalacao.test.js` (novo)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nenhuma interface nova — corrige a elegibilidade de itens consultada pelo botão "Remarcar" (Tasks 5/6) e pelo fluxo normal de "Agendar Instalação"/"Definir data de entrega" (Etapa 1, já existente).

- [ ] **Step 1: Escrever o teste que falha (conferência-entrega)**

Em `backend/src/__tests__/pedidosRoutes.itensConferenciaEntrega.test.js`, acrescentar ao describe existente:

```js
  test('exclui nao_concluido da subquery de itens ja cobertos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');

    expect(db.query.mock.calls[1][0]).toContain("'cancelado','rejeitado','nao_concluido'");
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd backend && npx jest pedidosRoutes.itensConferenciaEntrega --silent`
Expected: FAIL — a query ainda contém só `'cancelado','rejeitado'`.

- [ ] **Step 3: Corrigir a query de conferência-entrega**

Em `backend/src/routes/pedidosRoutes.js`, dentro de `GET /:id/itens-disponiveis-conferencia-entrega` (linha ~562-569):

```js
        AND pi.id NOT IN (
          SELECT ai.pedido_item_id
          FROM agendamento_itens ai
          JOIN agendamentos a ON a.id = ai.agendamento_id
          WHERE ai.pedido_item_id IS NOT NULL
            AND a.tipo = 'Conferência'
            AND a.status NOT IN ('cancelado','rejeitado')
        )
```

Trocar a última linha do subselect por:

```js
            AND a.status NOT IN ('cancelado','rejeitado','nao_concluido')
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `cd backend && npx jest pedidosRoutes.itensConferenciaEntrega --silent`
Expected: PASS (incluindo os testes pré-existentes do arquivo).

- [ ] **Step 5: Escrever o teste que falha (instalação) — arquivo novo**

Criar `backend/src/__tests__/pedidosRoutes.itensDisponiveisInstalacao.test.js`:

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

describe('GET /api/pedidos/:id/itens-disponiveis-instalacao', () => {
  test('exclui nao_concluido da subquery de itens ja cobertos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-instalacao');

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toContain("'cancelado','rejeitado','nao_concluido'");
    expect(db.query.mock.calls[1][0]).toContain("a.tipo = 'Instalação'");
  });

  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-instalacao');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Rodar o teste para confirmar que falha**

Run: `cd backend && npx jest pedidosRoutes.itensDisponiveisInstalacao --silent`
Expected: FAIL — a query ainda contém só `'cancelado','rejeitado'`.

- [ ] **Step 7: Corrigir a query de instalação**

Em `backend/src/routes/pedidosRoutes.js`, dentro de `GET /:id/itens-disponiveis-instalacao` (linha ~512-519):

```js
        AND pi.id NOT IN (
          SELECT ai.pedido_item_id 
          FROM agendamento_itens ai
          JOIN agendamentos a ON a.id = ai.agendamento_id
          WHERE ai.pedido_item_id IS NOT NULL 
            AND a.tipo = 'Instalação'
            AND a.status NOT IN ('cancelado','rejeitado')
        )
```

Trocar a última linha do subselect por:

```js
            AND a.status NOT IN ('cancelado','rejeitado','nao_concluido')
```

- [ ] **Step 8: Rodar o teste para confirmar que passa**

Run: `cd backend && npx jest pedidosRoutes.itensDisponiveisInstalacao --silent`
Expected: PASS

- [ ] **Step 9: Rodar a suíte completa do backend para checar regressões**

Run: `cd backend && npx jest --silent`
Expected: PASS em todos os arquivos.

- [ ] **Step 10: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.itensConferenciaEntrega.test.js backend/src/__tests__/pedidosRoutes.itensDisponiveisInstalacao.test.js
git commit -m "fix: itens de agendamento nao_concluido voltam a ficar disponiveis para novo agendamento"
```

---

## Task 5: Frontend — badge e botão "Remarcar" em `EtapaConferencia.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`

**Interfaces:**
- Consumes: `pre_agendamentos[].observacoes_status` e `pre_agendamentos[].herdeiros[].observacoes_status` (Task 3); rota `/agendamentos` com `location.state.novoInstalacao` (já existente, usada por `EtapaDadosPedido.jsx`); classe CSS `pf-badge-err` (já existente em `PedidoFluxo.css`).
- Produces: nada consumido por outras tasks.

**Escopo desta task:** botão "Remarcar" só nos cards de **genitor** com `tipo === 'Conferência'` (onde `g.itens` é sempre confiável). Para os **herdeiros** (sub-eventos de Conferência dentro de um genitor de Entrega/Instalação), mostra-se apenas o badge — sem botão, porque hoje a API não popula `itens` para herdeiros que não são de Instalação (ver `dashboardService.js`, `itensSeparacaoPorAg` é construído só a partir de `instalacaoIds`). Adicionar essa cobertura é trabalho futuro fora do escopo aprovado.

Não há suíte de testes automatizada para este módulo — a verificação é manual (Task 7).

- [ ] **Step 1: Adicionar imports e prop `pedido`**

No topo do arquivo, trocar:

```js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { acaoFichaConferencia, abrirOsDoItem } from "../../../../utils/fichaConferencia";
```

por:

```js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { acaoFichaConferencia, abrirOsDoItem } from "../../../../utils/fichaConferencia";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";
import { primeiroEUltimoNome } from "../../../../utils/nomeCliente";
```

Trocar a assinatura da função:

```js
export default function EtapaConferencia({ etapas, preAgendamentos, onClose }) {
```

por:

```js
export default function EtapaConferencia({ pedido, etapas, preAgendamentos, onClose }) {
```

- [ ] **Step 2: Adicionar a função `remarcarConferencia`**

Depois da linha `const genitores = preAgendamentos || [];`, adicionar:

```js
  function remarcarConferencia(g) {
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:     pedido.id,
          pedido_numero: numeroPedidoCompleto(pedido),
          cliente:       pedido.cliente_nome || "",
          cliente_id:    pedido.cliente_id || null,
          cep:           pedido.cep,
          rua:           pedido.rua,
          numero:        pedido.numero_rua,
          complemento:   pedido.complemento,
          bairro:        pedido.bairro,
          cidade:        pedido.cidade,
          estado:        pedido.estado,
          itens:         (g.itens || []).map((it) => ({ pedido_item_id: it.pedido_item_id, nome: it.descricao })),
          tipo:          "Conferência",
          status:        "agendado",
          titulo:        `Conferência - ${primeiroEUltimoNome(pedido.cliente_nome)} - ${numeroPedidoCompleto(pedido)}`,
        },
      },
    });
  }
```

- [ ] **Step 3: Adicionar badge + botão no header do genitor**

Localizar o bloco do header do genitor:

```js
              <div style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {g.tipo === "Conferência" ? "Conferência" : "Entrega"}: {fmtData(g.data_inicio)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(g.itens || []).length} itens</div>
                </div>
              </div>
```

Substituir por:

```js
              <div style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {g.tipo === "Conferência" ? "Conferência" : "Entrega"}: {fmtData(g.data_inicio)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(g.itens || []).length} itens</div>
                </div>
                {g.status === "nao_concluido" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div>
                      <span className="pf-badge pf-badge-err">Não concluído — necessário remarcar</span>
                      {g.observacoes_status && (
                        <div style={{ fontSize: 11, color: "var(--pf-card-sub)", marginTop: 2, textAlign: "right" }}>
                          {g.observacoes_status}
                        </div>
                      )}
                    </div>
                    {g.tipo === "Conferência" && (
                      <button className="pf-btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => remarcarConferencia(g)}>
                        🔁 Remarcar
                      </button>
                    )}
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Adicionar badge nos herdeiros (sem botão)**

Localizar:

```js
                  {g.herdeiros.filter((h) => h.tipo !== "Instalação").map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>Conferência — {fmtData(h.data_inicio)}</div>
                      <span className={`pf-badge ${h.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>{h.status}</span>
                    </div>
                  ))}
```

Substituir por:

```js
                  {g.herdeiros.filter((h) => h.tipo !== "Instalação").map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>Conferência — {fmtData(h.data_inicio)}</div>
                      {h.status === "nao_concluido" ? (
                        <span className="pf-badge pf-badge-err" title={h.observacoes_status || ""}>Não concluído</span>
                      ) : (
                        <span className={`pf-badge ${h.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>{h.status}</span>
                      )}
                    </div>
                  ))}
```

- [ ] **Step 5: Atualizar `PedidoFluxo.jsx` para passar `pedido` à `EtapaConferencia`**

`EtapaConferencia` já recebe `pedido` hoje em `PedidoFluxo.jsx:104-113` (`<EtapaComponente pedidoId={...} pedido={pedido} ... />` é genérico para todas as etapas) — nenhuma mudança necessária aqui, é só confirmar que a prop chega. Sem alteração de código neste step.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx
git commit -m "feat: badge e botão Remarcar para conferência não concluída no fluxo do pedido"
```

---

## Task 6: Frontend — badge e botão "Remarcar" em `EtapaAgendamento.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx`

**Interfaces:**
- Consumes: `pre_agendamentos[].observacoes_status` (Task 3); mesmo padrão de navegação da Task 5.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Adicionar imports**

Trocar:

```js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../services/api";
```

por:

```js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../services/api";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";
import { primeiroEUltimoNome } from "../../../../utils/nomeCliente";
```

- [ ] **Step 2: Adicionar a função `remarcarInstalacao`**

Depois de `function atribuirEquipe(agendamentoId) { ... }`, adicionar:

```js
  function remarcarInstalacao(ag) {
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:     pedido.id,
          pedido_numero: numeroPedidoCompleto(pedido),
          cliente:       pedido.cliente_nome || "",
          cliente_id:    pedido.cliente_id || null,
          cep:           pedido.cep,
          rua:           pedido.rua,
          numero:        pedido.numero_rua,
          complemento:   pedido.complemento,
          bairro:        pedido.bairro,
          cidade:        pedido.cidade,
          estado:        pedido.estado,
          itens:         (ag.itens || []).map((it) => ({ pedido_item_id: it.pedido_item_id, nome: it.descricao })),
          titulo:        `Instalação - ${primeiroEUltimoNome(pedido.cliente_nome)} - ${numeroPedidoCompleto(pedido)}`,
        },
      },
    });
  }
```

- [ ] **Step 3: Adicionar o branch visual de `nao_concluido` no card**

Localizar:

```js
          (preAgendamentos || []).map((ag) => {
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
                        disabled={!!confirmando[ag.id]} />
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
```

Substituir por:

```js
          (preAgendamentos || []).map((ag) => {
            const confirmado   = ag.status === "agendado";
            const naoConcluido = ag.status === "nao_concluido";
            return (
              <div key={ag.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Entrega: {fmtData(ag.data_inicio)}</div>
                    <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(ag.itens || []).length} itens</div>
                  </div>
                  {naoConcluido ? (
                    <span className="pf-badge pf-badge-err">Não concluído</span>
                  ) : (
                    <span className={`pf-badge ${confirmado ? "pf-badge-ok" : "pf-badge-pend"}`}>
                      {confirmado ? "Confirmado" : "Pré-agendado"}
                    </span>
                  )}
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {naoConcluido ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--pf-badge-err-text)" }}>
                        ⚠️ Instalação não concluída — necessário remarcar.
                        {ag.observacoes_status ? ` Motivo: ${ag.observacoes_status}` : ""}
                      </span>
                      <button className="pf-btn-primary" style={{ fontSize: 13, alignSelf: "flex-start" }}
                        onClick={() => remarcarInstalacao(ag)}>
                        🔁 Remarcar
                      </button>
                    </div>
                  ) : !confirmado ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" id={`conf-${ag.id}`}
                        checked={false}
                        onChange={() => confirmarCliente(ag.id)}
                        disabled={!!confirmando[ag.id]} />
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
```

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx
git commit -m "feat: badge e botão Remarcar para instalação não concluída no fluxo do pedido"
```

---

## Task 7: Verificação manual no navegador

**Files:** nenhum (só execução).

**Interfaces:**
- Consumes: tudo das Tasks 1-6.
- Produces: confirmação de que o fluxo ponta-a-ponta funciona.

- [ ] **Step 1: Subir backend e frontend-web localmente**

Run: `cd backend && npm run dev` (em um terminal) e `cd frontend-web && npm run dev` (em outro).

- [ ] **Step 2: Preparar um cenário de teste no banco local**

Escolher (ou criar) um pedido com um agendamento de tipo `Conferência` ou `Instalação` vinculado a algum item. Via PWA do instalador (ou diretamente com um `PATCH /agendamentos/:id/status` autenticado, body `{ status: "nao_concluido", motivo: "Teste manual" }`), marcar esse agendamento como não concluído.

- [ ] **Step 3: Verificar a notificação**

Abrir o sino de notificações como o consultor do pedido (ou como admin) e confirmar: existe uma notificação tipo "Reagendar: ..." cujo link abre `/pedidos/{id}/fluxo` (não mais `/agendamentos`).

- [ ] **Step 4: Verificar o fluxo do pedido**

Abrir `/pedidos/{id}/fluxo`, clicar na etapa correspondente (Etapa 2 para Conferência, Etapa 5 para Instalação) e confirmar:
- O agendamento aparece com badge vermelho "Não concluído — necessário remarcar" (ou "Não concluído" no caso de Instalação) e o motivo informado abaixo.
- A etapa volta a aparecer como pendente no fluxograma (não mais marcada como concluída).
- O botão "🔁 Remarcar" aparece.

- [ ] **Step 5: Verificar o botão Remarcar**

Clicar em "🔁 Remarcar" e confirmar que a tela de Agendamentos abre com o modal "Novo agendamento" já aberto, pré-preenchido com cliente, endereço, tipo e os itens do agendamento antigo — faltando só escolher data/hora e equipe. Preencher e salvar; confirmar que o novo agendamento é criado e aparece na agenda.

- [ ] **Step 6: Verificar elegibilidade de itens pelo caminho normal**

Sem usar o botão Remarcar: ir até a Etapa 1 do mesmo pedido e tentar "Agendar Instalação" (ou "Definir data de entrega") normalmente — confirmar que os itens do agendamento `nao_concluido` aparecem na lista de itens disponíveis (antes da correção, eles ficariam ocultos por engano).

- [ ] **Step 7: Reportar o resultado**

Se algum passo falhar, anotar o comportamento observado vs. esperado antes de seguir para o próximo task/feature.
