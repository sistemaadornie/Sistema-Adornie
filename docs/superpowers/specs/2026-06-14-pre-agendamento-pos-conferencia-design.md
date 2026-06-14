# Design: Pré-agendamento de entrega após Conferência agendada (Subprojeto 3)

**Data:** 2026-06-14
**Status:** Aprovado

---

## Contexto

Este é o **subprojeto 3 de 3** da reformulação do fluxo de conclusão da Etapa 1 ("📋 Pedidos"), iniciada em [2026-06-14-flag-categoria-conferencia-design.md](2026-06-14-flag-categoria-conferencia-design.md) (subprojeto 1) e [2026-06-14-definir-data-entrega-conferencia-design.md](2026-06-14-definir-data-entrega-conferencia-design.md) (subprojeto 2).

O subprojeto 2 entregou:
- Botão **"DEFINIR DATA DE ENTREGA"** em [EtapaDadosPedido.jsx](../../../frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx), que verifica `GET /pedidos/:id/itens-disponiveis-conferencia-entrega` e, se houver itens pendentes de conferência, abre um modal para agendar uma **Conferência genitora** (`tipo='Conferência'`, `status='agendado'`, sem `agendamento_pai_id`).

**Problemas remanescentes:**

1. `itens_cobertos` (usado no critério "Todos os itens com data de entrega definida" da Etapa 1 e no cálculo de `etapa1_ok`) conta itens cobertos por **qualquer** agendamento genitor, sem filtrar por `tipo`. Depois do subprojeto 2, um genitor `tipo='Conferência'` passa a contar como "data de entrega definida" — o que está errado: agendar uma conferência não define a data de entrega.
2. Depois de agendar a Conferência, o usuário precisa clicar de novo no mesmo botão "DEFINIR DATA DE ENTREGA" para então cair no fluxo de pré-agendamento de Instalação/entrega. Mecanicamente funciona, mas a UI não deixa esse segundo passo explícito.
3. Em [EtapaConferencia.jsx](../../../frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx) (Etapa 2), o botão "+ Agendar Conferência" (que cria uma Conferência **herdeira** de um genitor) fica obsoleto — a Etapa 1 passa a ser a origem das Conferências (genitor `tipo='Conferência'`).

## Objetivo

1. Corrigir `itens_cobertos` em `dashboardService.js` para considerar apenas agendamentos genitores `tipo='Instalação'`, e expor `tipo` em cada item de `pre_agendamentos`.
2. Em `EtapaDadosPedido.jsx`, exibir um segundo botão **"DEFINIR PRÉ-AGENDAMENTO DE ENTREGA"** quando já existe uma Conferência genitora agendada e ainda há itens sem pré-agendamento de Instalação — substituindo o re-clique ambíguo no botão "DEFINIR DATA DE ENTREGA".
3. Remover o botão "+ Agendar Conferência" (e código morto associado) de `EtapaConferencia.jsx`, e a rota de backend `GET /pedidos/:id/itens-disponiveis-conferencia` que só era usada por ele.

---

## 1. `dashboardService.js`

### 1.1 `itens_cobertos` filtrado por `tipo='Instalação'`

Duas queries precisam do filtro `AND a.tipo = 'Instalação'`:

**Detalhe do pedido** (`backend/src/services/dashboardService.js:467-476`):

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

**Lista do dashboard** (`backend/src/services/dashboardService.js:163-173`):

```js
db.query(
  `SELECT a.pedido_id, COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
   FROM agendamento_itens ai
   JOIN agendamentos a ON a.id = ai.agendamento_id
   WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
     AND ai.pedido_item_id IS NOT NULL
     AND a.status NOT IN ('cancelado','rejeitado')
     AND a.agendamento_pai_id IS NULL
     AND a.tipo = 'Instalação'
   GROUP BY a.pedido_id`,
  [pedidoIds, empresaId]
),
```

Com isso, `p.itens_cobertos < p.total_itens` passa a significar "ainda há itens sem pré-agendamento de Instalação/entrega" — independente de já existir uma Conferência agendada para eles.

### 1.2 `tipo` em `pre_agendamentos`

`genitoresRaw` (`backend/src/services/dashboardService.js:430-441`) já seleciona `a.tipo`. O mapeamento para `pre_agendamentos` (`backend/src/services/dashboardService.js:662-668`) precisa repassar esse campo:

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

---

## 2. `EtapaDadosPedido.jsx`

Novas variáveis derivadas, calculadas a partir de `preAgendamentos` e `p` (progresso da etapa 1):

```jsx
const temConferenciaAgendada = (preAgendamentos || []).some(
  (ag) => ag.tipo === "Conferência" && ag.status !== "cancelado" && ag.status !== "rejeitado"
);
const temItensPendentesEntrega = (p.itens_cobertos ?? 0) < (p.total_itens ?? 0);
```

Substituir o botão único atual:

```jsx
<button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={handleDefinirDataEntrega}>
  DEFINIR DATA DE ENTREGA
</button>
```

por uma renderização condicional:

```jsx
{!temConferenciaAgendada && (
  <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={handleDefinirDataEntrega}>
    DEFINIR DATA DE ENTREGA
  </button>
)}

{temConferenciaAgendada && temItensPendentesEntrega && (
  <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={() => setInstalacao(pedido)}>
    DEFINIR PRÉ-AGENDAMENTO DE ENTREGA
  </button>
)}
```

Comportamento resultante:
- **Sem Conferência agendada** (`!temConferenciaAgendada`): mostra "DEFINIR DATA DE ENTREGA", com o `handleDefinirDataEntrega` do subprojeto 2 inalterado (verifica itens pendentes de conferência → abre modal de Conferência, ou cai direto no pré-agendamento de Instalação se não houver pendências). Cobre tanto pedidos sem nenhum item que precise de conferência (comportamento 100% atual) quanto o primeiro clique de pedidos que precisam.
- **Conferência já agendada e ainda há itens sem pré-agendamento de Instalação**: mostra "DEFINIR PRÉ-AGENDAMENTO DE ENTREGA", que abre `ModalSelecionarItensInstalacao` padrão (`setInstalacao(pedido)`, sem `itensEndpoint`/`titulo`/`textoVazio` customizados) via `itens-disponiveis-instalacao` (já filtra por `tipo='Instalação'`) e segue o fluxo existente `handleAgendarInstalacao`.
- **Conferência agendada e nada pendente**: nenhum dos dois botões aparece — o critério "Todos os itens com data de entrega definida (N/N)" já está ✅.

Nenhuma mudança em `handleDefinirDataEntrega`, `handleAgendarConferenciaEntrega`, `handleAgendarInstalacao` ou nos blocos de modal — só a renderização condicional dos botões.

---

## 3. `EtapaConferencia.jsx` + rota órfã

### 3.1 Remoção do "+ Agendar Conferência"

Remover de `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`:
- O botão "+ Agendar Conferência" (linhas 85-88).
- O estado `agendandoConf` (linha 14) e a função `handleAgendarConferencia` (linhas 21-43).
- O bloco `{agendandoConf && (<ModalSelecionarItensInstalacao ... />)}` (linhas 122-129).
- O import `ModalSelecionarItensInstalacao` (linha 3), que fica sem uso.

### 3.2 Rótulo do cabeçalho do genitor

No card de cada genitor (linha 82), trocar:

```jsx
<div style={{ fontWeight: 600, fontSize: 14 }}>Entrega: {fmtData(g.data_inicio)}</div>
```

por:

```jsx
<div style={{ fontWeight: 600, fontSize: 14 }}>
  {g.tipo === "Conferência" ? "Conferência" : "Entrega"}: {fmtData(g.data_inicio)}
</div>
```

O restante do card (lista de itens com "Visualizar Ficha"/"Aguardando técnico" e a sub-lista de herdeiros não-Instalação) permanece igual.

### 3.3 Remoção da rota órfã no backend

Remover `GET /pedidos/:id/itens-disponiveis-conferencia` (`backend/src/routes/pedidosRoutes.js:576-612`) — só era usada pelo botão removido em 3.1, não tem testes próprios e não é referenciada em mais nenhum lugar do projeto.

---

## Testes

Não há testes automatizados de frontend (`frontend-web/src` não possui `*.test.*`). Backend: ajustar/adicionar testes de `dashboardService` para a query de `itens_cobertos` (verificar que o filtro `a.tipo = 'Instalação'` está presente e que um genitor `tipo='Conferência'` não conta como cobertura), e remover (se existirem) testes da rota `itens-disponiveis-conferencia`.

Verificação manual no navegador:

1. Pedido com item de categoria `necessita_conferencia=true`, sem Conferência agendada ainda:
   - Etapa 1 mostra "DEFINIR DATA DE ENTREGA". Clicar → abre "Agendar Conferência". Agendar.
2. Reabrir a Etapa 1 do mesmo pedido:
   - Critério "Todos os itens com data de entrega definida (X/Y)" continua **incompleto** (a Conferência não contou como cobertura).
   - Botão agora é **"DEFINIR PRÉ-AGENDAMENTO DE ENTREGA"** (não mais "DEFINIR DATA DE ENTREGA"). Clicar → abre "Agendar Instalação" com os itens pendentes (sem a linha de prazo mínimo ausente — este modal usa o endpoint padrão, que traz `logistica_interna_dias` etc).
3. Completar o pré-agendamento de Instalação para todos os itens → reabrir Etapa 1 → critério "(N/N)" fica ✅ e nenhum dos dois botões aparece.
4. Pedido sem nenhum item de categoria `necessita_conferencia=true`: comportamento inalterado — "DEFINIR DATA DE ENTREGA" abre direto "Agendar Instalação".
5. Etapa 2 do pedido do passo 1: o genitor de Conferência aparece com cabeçalho "Conferência: <data>" e **sem** o botão "+ Agendar Conferência". Genitores de Instalação (se houver, de pedidos antigos) continuam com cabeçalho "Entrega: <data>".

---

## Fora de escopo

Nenhum item adicional identificado — este é o último dos 3 subprojetos da reformulação da Etapa 1.
