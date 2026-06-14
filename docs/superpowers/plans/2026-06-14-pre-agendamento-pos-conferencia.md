# Pré-agendamento de Entrega Pós-Conferência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o cálculo de `itens_cobertos` para considerar apenas agendamentos genitores de Instalação, expor o `tipo` de cada pré-agendamento, adicionar o botão "DEFINIR PRÉ-AGENDAMENTO DE ENTREGA" na Etapa 1, e remover o fluxo obsoleto "+ Agendar Conferência" da Etapa 2 (incluindo a rota órfã de backend).

**Architecture:** Backend (`dashboardService.js`) ganha um filtro `AND a.tipo = 'Instalação'` em duas queries de `itens_cobertos` (detalhe do pedido e lista do dashboard) e passa a expor `tipo` em cada item de `pre_agendamentos`. Frontend (`EtapaDadosPedido.jsx`) usa esses dados para decidir entre dois botões mutuamente exclusivos. `EtapaConferencia.jsx` perde o botão/estado/handler/modal de criação de Conferência herdeira, que ficam obsoletos porque a Etapa 1 agora é a origem das Conferências. A rota backend que só servia esse modal é removida.

**Tech Stack:** Node.js/Express + `pg` (backend), React (frontend), Jest (testes backend).

---

## Task A: `dashboardService.js` — `itens_cobertos` do detalhe do pedido + `tipo` em `pre_agendamentos`

**Files:**
- Modify: `backend/src/services/dashboardService.js:467-476` (query `itensCobertosRows` em `buscarFluxoPedido`)
- Modify: `backend/src/services/dashboardService.js:662-668` (mapeamento `pre_agendamentos`)
- Test: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js` (depois do `describe` existente, mesmo nível):

```js
describe('buscarFluxoPedido — itens_cobertos filtra por tipo Instalação e pre_agendamentos expõe tipo', () => {
  test('query de itens_cobertos filtra a.tipo = Instalação e pre_agendamentos inclui tipo do genitor', async () => {
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
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'agendado', tipo: 'Conferência', data_inicio: '2026-06-20' }] }) // genitoresRaw
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 1, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
      .mockResolvedValueOnce({ rows: [] }) // herdeirosRaw
      .mockResolvedValueOnce({ rows: [] }); // separacaoRows

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const queryItensCobertos = db.query.mock.calls[7][0];
    expect(queryItensCobertos).toContain("a.tipo = 'Instalação'");

    expect(resultado.pre_agendamentos[0].tipo).toBe('Conferência');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido -t "itens_cobertos filtra"`
Expected: FAIL — `queryItensCobertos` não contém `"a.tipo = 'Instalação'"` (a query atual não tem esse filtro) e/ou `resultado.pre_agendamentos[0].tipo` é `undefined`.

- [ ] **Step 3: Implementar — adicionar filtro `a.tipo = 'Instalação'` na query de `itensCobertosRows`**

Em `backend/src/services/dashboardService.js:467-476`, trocar:

```js
    db.query(
      `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL`,
      [pedidoId, empresaId]
    ),
```

por:

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

- [ ] **Step 4: Implementar — repassar `tipo` no mapeamento de `pre_agendamentos`**

Em `backend/src/services/dashboardService.js:662-668`, trocar:

```js
  const pre_agendamentos = genitoresRaw.map((g) => ({
    id: g.id,
    data_inicio: g.data_inicio,
    status: g.status,
    itens: itensPorAg[g.id] || [],
    herdeiros: herdeirosporPai[g.id] || [],
  }));
```

por:

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

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest dashboardService.buscarFluxoPedido -t "itens_cobertos filtra"`
Expected: PASS

- [ ] **Step 6: Rodar a suíte completa de `dashboardService` para garantir que nada quebrou**

Run: `cd backend && npx jest dashboardService`
Expected: todos os testes PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "fix(dashboard): itens_cobertos do pedido considera apenas genitor de Instalação e expoe tipo em pre_agendamentos"
```

---

## Task B: `dashboardService.js` — `itens_cobertos` da lista do dashboard

**Files:**
- Modify: `backend/src/services/dashboardService.js:163-173` (query `itensCobertosRows` em `listarPedidosDashboard`)
- Test: `backend/src/__tests__/dashboardService.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `describe("listarPedidosDashboard", ...)` em `backend/src/__tests__/dashboardService.test.js`, como novo `test` após o teste "pedido sem itens e sem agendamentos fica na etapa 1" (antes do `});` que fecha o `describe`):

```js
  test("query de itens cobertos do dashboard filtra a.tipo = Instalação", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            numero_sequencial: 12,
            numero_origem: null,
            status: "em_andamento",
            verificacao_ok: true,
            categorizacao_ok: true,
            total: "0.00",
            criado_em: "2026-01-03T00:00:00.000Z",
            cliente_nome: "Cliente C",
            consultor_nome: "Consultora Z",
            consultor_id: 7,
            itens_count: "0",
            pdf_ok: true,
            vinculos_ok: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // preAgs
      .mockResolvedValueOnce({ rows: [] }) // total itens
      .mockResolvedValueOnce({ rows: [] }) // itens cobertos
      .mockResolvedValueOnce({ rows: [] }) // sem categoria
      .mockResolvedValueOnce({ rows: [] }) // sem vinculo
      .mockResolvedValueOnce({ rows: [] }) // conferencia
      .mockResolvedValueOnce({ rows: [] }) // confeccao
      .mockResolvedValueOnce({ rows: [] }) // genitores agendados
      .mockResolvedValueOnce({ rows: [] }) // produto_ok
      .mockResolvedValueOnce({ rows: [] }) // instalacoes
      .mockResolvedValueOnce({ rows: [] }); // separacao

    await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    const queryItensCobertos = db.query.mock.calls[3][0];
    expect(queryItensCobertos).toContain("a.tipo = 'Instalação'");
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest dashboardService.test.js -t "itens cobertos do dashboard filtra"`
Expected: FAIL — a query atual não contém `"a.tipo = 'Instalação'"`.

- [ ] **Step 3: Implementar — adicionar filtro `a.tipo = 'Instalação'` na query de `itensCobertosRows` da lista**

Em `backend/src/services/dashboardService.js:163-173`, trocar:

```js
    // Etapa 1: itens cobertos por agendamento (genitor) por pedido
    db.query(
      `SELECT a.pedido_id, COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL
       GROUP BY a.pedido_id`,
      [pedidoIds, empresaId]
    ),
```

por:

```js
    // Etapa 1: itens cobertos por agendamento (genitor) por pedido
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

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest dashboardService.test.js -t "itens cobertos do dashboard filtra"`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa de `dashboardService` para garantir que nada quebrou**

Run: `cd backend && npx jest dashboardService`
Expected: todos os testes PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "fix(dashboard): itens_cobertos da lista do dashboard considera apenas genitor de Instalacao"
```

---

## Task C: `EtapaDadosPedido.jsx` — botão condicional "DEFINIR PRÉ-AGENDAMENTO DE ENTREGA"

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

- [ ] **Step 1: Adicionar as variáveis derivadas**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`, logo após a linha:

```jsx
  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p = etapa1.progresso || {};
```

adicionar:

```jsx
  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p = etapa1.progresso || {};

  const temConferenciaAgendada = (preAgendamentos || []).some(
    (ag) => ag.tipo === "Conferência" && ag.status !== "cancelado" && ag.status !== "rejeitado"
  );
  const temItensPendentesEntrega = (p.itens_cobertos ?? 0) < (p.total_itens ?? 0);
```

- [ ] **Step 2: Substituir o botão único por renderização condicional**

Trocar:

```jsx
          <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={handleDefinirDataEntrega}>
            DEFINIR DATA DE ENTREGA
          </button>
```

por:

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

- [ ] **Step 3: Lint**

Run: `cd frontend-web && npx eslint src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
Expected: sem novos erros/warnings (arquivo já estava limpo antes desta mudança).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): botao DEFINIR PRE-AGENDAMENTO DE ENTREGA apos conferencia agendada"
```

---

## Task D: `EtapaConferencia.jsx` — remover "+ Agendar Conferência" e código morto

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`

- [ ] **Step 1: Remover o import não utilizado de `ModalSelecionarItensInstalacao`**

Trocar:

```jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalSelecionarItensInstalacao from "../../ModalSelecionarItensInstalacao";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";
```

por:

```jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";
```

(`useState` deixa de ser usado neste arquivo depois do Step 2, então sai do import do React também.)

- [ ] **Step 2: Remover o estado `agendandoConf` e a função `handleAgendarConferencia`**

Trocar:

```jsx
export default function EtapaConferencia({ pedidoId, pedido, etapas, preAgendamentos, onClose }) {
  const navigate = useNavigate();
  const [agendandoConf, setAgendandoConf] = useState(null);

  const etapa2 = etapas.find((e) => e.numero === 2) || {};
  const p = etapa2.progresso || {};

  const genitores = preAgendamentos || [];

  function handleAgendarConferencia(genitor, itensSel) {
    setAgendandoConf(null);
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:         pedido.id,
          pedido_numero:     numeroPedidoCompleto(pedido),
          cliente:           pedido.cliente_nome || "",
          cliente_id:        pedido.cliente_id || null,
          cep:               pedido.cep,
          rua:               pedido.rua,
          numero:            pedido.numero_rua,
          complemento:       pedido.complemento,
          bairro:            pedido.bairro,
          cidade:            pedido.cidade,
          estado:            pedido.estado,
          itens:             itensSel,
          agendamento_pai_id: genitor.id,
          tipo:              "Conferência",
        },
      },
    });
  }

  return (
```

por:

```jsx
export default function EtapaConferencia({ pedidoId, pedido, etapas, preAgendamentos, onClose }) {
  const navigate = useNavigate();

  const etapa2 = etapas.find((e) => e.numero === 2) || {};
  const p = etapa2.progresso || {};

  const genitores = preAgendamentos || [];

  return (
```

Nota: `pedidoId`, `pedido` e `navigate` continuam usados pelo restante do componente (navegação para "Visualizar Ficha"). Não removê-los dos parâmetros/hooks.

- [ ] **Step 3: Relabel do cabeçalho do genitor e remoção do botão "+ Agendar Conferência"**

Trocar:

```jsx
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
```

por:

```jsx
              <div style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {g.tipo === "Conferência" ? "Conferência" : "Entrega"}: {fmtData(g.data_inicio)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(g.itens || []).length} itens</div>
                </div>
              </div>
```

- [ ] **Step 4: Remover o bloco do modal `agendandoConf`**

Trocar:

```jsx
      {agendandoConf && (
        <ModalSelecionarItensInstalacao
          pedido={pedido}
          itensEndpoint={`/pedidos/${pedidoId}/itens-disponiveis-conferencia?genitor_id=${agendandoConf.id}`}
          onClose={() => setAgendandoConf(null)}
          onContinuar={(itensSel) => handleAgendarConferencia(agendandoConf, itensSel)}
        />
      )}
    </div>
  );
}
```

por:

```jsx
    </div>
  );
}
```

- [ ] **Step 5: Lint**

Run: `cd frontend-web && npx eslint src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`
Expected: sem erros/warnings (incluindo `numeroPedidoCompleto`, `pedidoId`, `pedido` ainda usados — confirmar que nenhum import/variável ficou órfão).

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx
git commit -m "refactor(pedidos): remove botao obsoleto + Agendar Conferencia da Etapa 2 e relabela cabecalho do genitor"
```

---

## Task E: Remover rota órfã `GET /pedidos/:id/itens-disponiveis-conferencia`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js:576-613`

- [ ] **Step 1: Remover a rota**

Trocar (incluindo a linha em branco final do bloco):

```js
// GET /pedidos/:id/itens-disponiveis-conferencia
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

    if (!genitorId) return res.status(400).json({ message: "Parâmetro genitor_id obrigatório." });

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

// PATCH /pedidos/:id/producao-itens
```

por:

```js
// PATCH /pedidos/:id/producao-itens
```

- [ ] **Step 2: Rodar a suíte de testes do backend para garantir que nada referencia essa rota**

Run: `cd backend && npx jest`
Expected: todos os testes PASS (nenhum teste cobre `itens-disponiveis-conferencia`, conforme confirmado no design).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "refactor(pedidos): remove rota orfa GET /pedidos/:id/itens-disponiveis-conferencia"
```

---

## Task F: Verificação manual no navegador

**Files:** nenhum (apenas roteiro de verificação — não há testes automatizados de frontend neste projeto)

- [ ] **Step 1: Subir backend e frontend localmente**

Run: `cd backend && npm run dev` (ou comando equivalente já usado no projeto)
Run: `cd frontend-web && npm run dev`

- [ ] **Step 2: Roteiro de verificação**

1. Abrir um pedido com pelo menos um item de categoria `necessita_conferencia=true` e **sem** Conferência agendada ainda:
   - Etapa 1 deve mostrar o botão **"DEFINIR DATA DE ENTREGA"**.
   - Clicar nele → deve abrir o modal "Agendar Conferência — <número do pedido>".
   - Selecionar os itens e agendar a Conferência.
2. Reabrir a Etapa 1 do mesmo pedido:
   - O critério "Todos os itens com data de entrega definida (X/Y)" deve continuar **incompleto** (a Conferência agendada não deve contar como cobertura).
   - O botão exibido agora deve ser **"DEFINIR PRÉ-AGENDAMENTO DE ENTREGA"** (não mais "DEFINIR DATA DE ENTREGA").
   - Clicar nele → deve abrir o modal padrão "Agendar Instalação — <número do pedido>" com os itens pendentes (mostrando "prazo mínimo: N dias úteis").
3. Completar o pré-agendamento de Instalação para todos os itens pendentes:
   - Reabrir a Etapa 1 → o critério "(N/N)" deve ficar ✅ e **nenhum** dos dois botões deve aparecer.
4. Abrir um pedido **sem** nenhum item de categoria `necessita_conferencia=true`:
   - Comportamento deve ficar inalterado: "DEFINIR DATA DE ENTREGA" abre direto o modal "Agendar Instalação".
5. Abrir a Etapa 2 (Conferência de Medidas) do pedido do passo 1:
   - O genitor de Conferência criado no passo 1 deve aparecer com cabeçalho **"Conferência: <data>"** e **sem** o botão "+ Agendar Conferência".
   - Se houver genitores de Instalação de pedidos antigos, eles devem continuar com cabeçalho "Entrega: <data>".

- [ ] **Step 3: Reportar resultado**

Confirmar ao usuário que os 5 passos foram verificados (ou relatar qualquer divergência encontrada) antes de considerar o Subprojeto 3 concluído.

---

## Self-Review

**Cobertura da spec** (`docs/superpowers/specs/2026-06-14-pre-agendamento-pos-conferencia-design.md`):
- Seção 1.1 (filtro `a.tipo = 'Instalação'` nas duas queries de `itens_cobertos`) → Tasks A e B.
- Seção 1.2 (`tipo` em `pre_agendamentos`) → Task A.
- Seção 2 (`temConferenciaAgendada`/`temItensPendentesEntrega` + botão condicional) → Task C.
- Seção 3.1/3.2 (remoção do "+ Agendar Conferência" + relabel do cabeçalho) → Task D.
- Seção 3.3 (remoção da rota órfã) → Task E.
- Seção "Testes" (ajuste de testes de `dashboardService` + roteiro manual de 5 passos) → Tasks A, B e F.

**Placeholder scan:** nenhum "TBD"/"TODO"/"implementar depois" — todos os steps têm código completo.

**Consistência de tipos/nomes:** `temConferenciaAgendada`, `temItensPendentesEntrega`, `tipo` (em `pre_agendamentos` e nos objetos `genitor`/`g`), e o literal `a.tipo = 'Instalação'` usados de forma consistente entre Tasks A, B, C e D.

**Fora de escopo:** nenhum item adicional — último dos 3 subprojetos.
