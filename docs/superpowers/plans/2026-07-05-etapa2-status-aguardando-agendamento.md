# Card da Etapa 2 — "Aguardando definir data de conferência" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando as fichas de consultora da Etapa 1 já estiverem 100% preenchidas mas ainda faltar agendar a conferência de medidas, o card da Etapa 2 (enquanto "pendente" no fluxograma do pedido) mostra "Aguardando definir data de conferência" em vez do "Aguardando" genérico.

**Architecture:** O backend (`dashboardService.js`) já calcula, em `buscarFluxoPedido`, os três valores necessários (`totalItensConferencia`, `itensComConferenciaConsultorasPreenchida`, `itensCobertosConferencia`) — só falta expor a combinação deles como um novo campo booleano `aguardando_agendamento_conferencia` na `progresso` da etapa 2, nos dois pontos onde o array `etapas` é montado. O frontend (`EtapaCard.jsx`) lê esse campo pronto no estado "pendente" da etapa 2, sem recalcular a regra de negócio.

**Tech Stack:** Node/Express + `pg` (backend, `backend/src`), React (frontend, `frontend-web/src`), Jest para testes de backend.

## Global Constraints

- Nenhuma mudança nos critérios de conclusão de qualquer etapa (`etapa1_ok`, `etapa2_ok`, etc.) — só o texto exibido no card muda.
- Só a Etapa 2 ganha tratamento especial no estado "pendente" — as demais etapas continuam mostrando "Aguardando" genérico.
- A condição exata: `total_itens_conferencia > 0 && itens_com_conferencia_consultoras >= total_itens_conferencia && itens_cobertos_conferencia < total_itens_conferencia`.
- Sem testes automatizados de frontend neste projeto (nenhum `*.test.jsx` existe) — verificação via build + lint, e teste manual no navegador na última task.

---

### Task 1: Backend — expor `aguardando_agendamento_conferencia` na Etapa 2

**Files:**
- Modify: `backend/src/services/dashboardService.js`
- Test: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`

**Interfaces:**
- Produces: campo `aguardando_agendamento_conferencia: boolean` dentro de `progresso` do objeto da etapa `{ numero: 2, ... }`, retornado por `buscarFluxoPedido(pedidoId, empresaId, userId, permissoes)`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`:

```js
describe('buscarFluxoPedido — aguardando_agendamento_conferencia na etapa 2', () => {
  function mockPedidoBase() {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, numero_sequencial: 1, numero_origem: null, status: 'pendente',
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
      .mockResolvedValueOnce({ rows: [] }); // genitoresRaw (vazio -> branch sem genitores)
  }

  test('true quando fichas de consultora 100% preenchidas mas conferência ainda não agendada', async () => {
    mockPedidoBase();
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })               // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })              // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] })  // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })             // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })            // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })             // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                             // itensControleRows
      .mockResolvedValueOnce({ rows: [{ total: 2 }] });                // itensComConferenciaConsultorasRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);
    const etapa2 = resultado.etapas.find(e => e.numero === 2);
    expect(etapa2.progresso.aguardando_agendamento_conferencia).toBe(true);
  });

  test('false quando fichas de consultora 100% preenchidas E conferência já agendada para todos os itens', async () => {
    mockPedidoBase();
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 2 }] })              // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })               // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })              // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] })  // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })             // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })            // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })             // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                             // itensControleRows
      .mockResolvedValueOnce({ rows: [{ total: 2 }] });                // itensComConferenciaConsultorasRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);
    const etapa2 = resultado.etapas.find(e => e.numero === 2);
    expect(etapa2.progresso.aguardando_agendamento_conferencia).toBe(false);
  });

  test('false quando nenhum item precisa de conferência', async () => {
    mockPedidoBase();
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })                 // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })               // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })              // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] })  // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })             // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })            // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })             // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                             // itensControleRows
      .mockResolvedValueOnce({ rows: [] });                            // itensComConferenciaConsultorasRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);
    const etapa2 = resultado.etapas.find(e => e.numero === 2);
    expect(etapa2.progresso.aguardando_agendamento_conferencia).toBe(false);
  });

  test('false quando as fichas de consultora ainda não estão todas preenchidas', async () => {
    mockPedidoBase();
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })                 // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })              // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })               // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })              // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] })  // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })             // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })            // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })             // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                             // itensControleRows
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });                // itensComConferenciaConsultorasRows (só 1 de 2)

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);
    const etapa2 = resultado.etapas.find(e => e.numero === 2);
    expect(etapa2.progresso.aguardando_agendamento_conferencia).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest src/__tests__/dashboardService.buscarFluxoPedido.test.js -t "aguardando_agendamento_conferencia"`
Expected: FAIL — os 4 testes falham porque `etapa2.progresso.aguardando_agendamento_conferencia` é `undefined`, não `true`/`false`.

- [ ] **Step 3: Implementar a mudança**

Em `backend/src/services/dashboardService.js`, no branch **sem** pré-agendamentos (dentro de `if (!genitoresRaw.length) { ... }`), localizar a linha do objeto da etapa 2:

```js
        { numero: 2, concluida: etapa2_ok, progresso: { total: totalItensConf, conferidos: itensConferidos } },
```

Substituir por:

```js
        {
          numero: 2,
          concluida: etapa2_ok,
          progresso: {
            total: totalItensConf,
            conferidos: itensConferidos,
            aguardando_agendamento_conferencia:
              totalItensConferencia > 0 &&
              itensComConferenciaConsultorasPreenchida >= totalItensConferencia &&
              itensCobertosConferencia < totalItensConferencia,
          },
        },
```

Mais abaixo na mesma função, no branch **com** pré-agendamentos, localizar:

```js
    {
      numero: 2,
      concluida: etapa2_ok,
      progresso: { total: totalItensConf, conferidos: itensConferidos },
    },
```

Substituir por:

```js
    {
      numero: 2,
      concluida: etapa2_ok,
      progresso: {
        total: totalItensConf,
        conferidos: itensConferidos,
        aguardando_agendamento_conferencia:
          totalItensConferencia > 0 &&
          itensComConferenciaConsultorasPreenchida >= totalItensConferencia &&
          itensCobertosConferencia < totalItensConferencia,
      },
    },
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest src/__tests__/dashboardService.buscarFluxoPedido.test.js -t "aguardando_agendamento_conferencia"`
Expected: PASS — 4 testes passando

- [ ] **Step 5: Rodar a suíte inteira do arquivo para checar regressão**

Run: `cd backend && npx jest src/__tests__/dashboardService.buscarFluxoPedido.test.js`
Expected: PASS — todos os testes do arquivo (os novos + os já existentes)

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npx jest --silent`
Expected: PASS — nenhuma regressão em outros arquivos de teste

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/services/dashboardService.js src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "feat(fluxo): expoe aguardando_agendamento_conferencia no progresso da etapa 2"
```

---

### Task 2: Frontend — mensagem específica no card da Etapa 2

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx`

**Interfaces:**
- Consumes: `etapa.progresso.aguardando_agendamento_conferencia` (Task 1), disponível na etapa de número 2 retornada por `GET /pedidos/:id/fluxo`.

- [ ] **Step 1: Alterar `buildStatusLabel()`**

Em `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx`, trocar:

```jsx
  function buildStatusLabel() {
    if (concluida) return "Concluído";
    if (pendente) return "Aguardando";
```

por:

```jsx
  function buildStatusLabel() {
    if (concluida) return "Concluído";
    if (pendente) {
      if (numero === 2 && progresso.aguardando_agendamento_conferencia) {
        return "Aguardando definir data de conferência";
      }
      return "Aguardando";
    }
```

- [ ] **Step 2: Lint**

Run: `cd frontend-web && npx eslint src/pages/pedidos/fluxo/EtapaCard.jsx`
Expected: sem erros/warnings novos.

- [ ] **Step 3: Build**

Run: `cd frontend-web && npx vite build`
Expected: build conclui sem erros.

- [ ] **Step 4: Verificar manualmente no navegador**

Run: `cd frontend-web && npm run dev` (se ainda não estiver rodando)

1. Abrir um pedido com todas as fichas de consultora preenchidas mas sem conferência agendada para nenhum item — na tela de fluxo do pedido, confirmar que o card da Etapa 2 mostra "Aguardando definir data de conferência" em vez de "Aguardando".
2. Na Etapa 2, clicar "Definir Data de Conferência" e agendar cobrindo todos os itens que precisam — recarregar/reabrir o fluxo e confirmar que a Etapa 1 passa a "Concluída" e a Etapa 2 vira "ativa", mostrando `${conferidos} de ${total} conferidos` (não mais a mensagem de agendamento).
3. Abrir um pedido sem nenhum item que precise de conferência — confirmar que o card da Etapa 2 continua mostrando "Aguardando" genérico (comportamento inalterado).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx
git commit -m "feat(fluxo): card da etapa 2 indica quando falta agendar a conferencia"
```

---

## Self-Review Notes

- **Cobertura da spec:** Backend (campo `aguardando_agendamento_conferencia` nos dois pontos de montagem de `etapas`) coberto na Task 1; frontend (texto customizado no estado "pendente" da etapa 2) coberto na Task 2. Escopo "fora" (outras etapas, estado "ativa" da etapa 2, critérios de conclusão) não implementado, como definido na spec.
- **Consistência de tipos:** nome do campo (`aguardando_agendamento_conferencia`, boolean) idêntico no backend (Task 1) e no consumo do frontend (Task 2).
- **Sem placeholders:** todos os steps têm código completo, testes completos e comandos exatos.
