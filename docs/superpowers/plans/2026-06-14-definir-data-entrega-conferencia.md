# "DEFINIR DATA DE ENTREGA" — Agendamento de Conferência a partir da Etapa 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renomear o botão "📅 Agendar Instalação" da Etapa 1 para "DEFINIR DATA DE ENTREGA", que verifica se há itens pendentes de conferência (via endpoint do subprojeto 1) e, se houver, abre um fluxo de agendamento de Conferência (`status='agendado'`, sem `agendamento_pai_id`) em vez do pré-agendamento de Instalação atual.

**Architecture:** Reaproveita `ModalSelecionarItensInstalacao` (parametrizado com `titulo`/`textoVazio` opcionais) tanto para o fluxo existente de pré-agendamento de Instalação quanto para o novo fluxo de seleção de itens de Conferência. Um novo util `primeiroEUltimoNome` formata o nome do cliente no título do agendamento de Conferência. `NovoAgendamentoModal` (em `Agendamentos.jsx`) passa a aceitar um prefill com `status`/`titulo` explícitos, exibindo um aviso amarelo quando o agendamento é uma Conferência criada por este fluxo.

**Tech Stack:** React 19 (frontend-web), react-router-dom (navigate com `state`), sem testes automatizados de frontend (verificação manual no navegador).

---

## Contexto para quem for executar

- Spec aprovada: `docs/superpowers/specs/2026-06-14-definir-data-entrega-conferencia-design.md`.
- Subprojeto 1 (já implementado, commit `84f6b0e`) entregou `GET /pedidos/:id/itens-disponiveis-conferencia-entrega`, que retorna `{ itens: [{id, ambiente, descricao, quantidade, unidade, categoria_id, categoria_nome}] }` — itens de categorias com `necessita_conferencia=true` ainda não cobertos por uma Conferência ativa.
- `frontend-web/src` não possui nenhum arquivo `*.test.*` nem test runner configurado (ver `frontend-web/package.json` — só `vite`/`eslint`). Por isso, cada task de frontend termina com `npx eslint <arquivo>` (lint) em vez de testes automatizados, e a Task 5 cobre a verificação manual completa no navegador.
- Convenção de commits: mensagens curtas no padrão `feat(pedidos): ...` / `feat(agendamentos): ...`, em português, como nos commits recentes (`93e1d00`, `c466337`, etc).

---

### Task 1: Util `primeiroEUltimoNome`

**Files:**
- Create: `frontend-web/src/utils/nomeCliente.js`

- [ ] **Step 1: Criar o arquivo**

```js
export function primeiroEUltimoNome(nomeCompleto) {
  const partes = (nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}
```

- [ ] **Step 2: Lint**

Run (da pasta `frontend-web/`): `npx eslint src/utils/nomeCliente.js`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/utils/nomeCliente.js
git commit -m "feat(pedidos): util primeiroEUltimoNome para titulo de agendamento de conferencia"
```

---

### Task 2: Parametrizar `ModalSelecionarItensInstalacao.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx`

Adiciona props opcionais `titulo` e `textoVazio` (com defaults que reproduzem o texto atual), e torna a linha "prazo mínimo" condicional — o endpoint de conferência não retorna `logistica_interna_dias` etc.

- [ ] **Step 1: Adicionar as novas props na assinatura do componente**

Em `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx:6`, troque:

```jsx
export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar, itensEndpoint }) {
```

por:

```jsx
export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar, itensEndpoint, titulo, textoVazio }) {
```

- [ ] **Step 2: Usar `titulo` no header**

Em `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx:52`, troque:

```jsx
            <h2 className="modal-title">Agendar Instalação — {pedido.numero || numeroPedidoCompleto(pedido)}</h2>
```

por:

```jsx
            <h2 className="modal-title">{titulo || `Agendar Instalação — ${pedido.numero || numeroPedidoCompleto(pedido)}`}</h2>
```

- [ ] **Step 3: Usar `textoVazio` no estado de lista vazia**

Em `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx:67`, troque:

```jsx
            <p style={{ color: "var(--color-text-muted)" }}>Todos os itens deste pedido já estão agendados para instalação.</p>
```

por:

```jsx
            <p style={{ color: "var(--color-text-muted)" }}>
              {textoVazio || "Todos os itens deste pedido já estão agendados para instalação."}
            </p>
```

- [ ] **Step 4: Tornar a linha "prazo mínimo" condicional**

Em `frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx:92-96`, troque:

```jsx
                        <span className="msi-card-meta">
                          <span className="msi-meta-item">{it.categoria_nome || "Sem categoria"}</span>
                          <span className="msi-meta-ponto">·</span>
                          <span className="msi-meta-item">prazo mínimo: {totalDias(it)} dias úteis</span>
                        </span>
```

por:

```jsx
                        <span className="msi-card-meta">
                          <span className="msi-meta-item">{it.categoria_nome || "Sem categoria"}</span>
                          {it.logistica_interna_dias != null && (
                            <>
                              <span className="msi-meta-ponto">·</span>
                              <span className="msi-meta-item">prazo mínimo: {totalDias(it)} dias úteis</span>
                            </>
                          )}
                        </span>
```

- [ ] **Step 5: Lint**

Run (da pasta `frontend-web/`): `npx eslint src/pages/pedidos/ModalSelecionarItensInstalacao.jsx`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx
git commit -m "feat(pedidos): parametriza titulo e texto vazio do ModalSelecionarItensInstalacao"
```

---

### Task 3: Botão "DEFINIR DATA DE ENTREGA" em `EtapaDadosPedido.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

- [ ] **Step 1: Adicionar os novos imports**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx:8`, após a linha `import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";`, adicione:

```jsx
import { primeiroEUltimoNome } from "../../../../utils/nomeCliente";
import { api } from "../../../../services/api";
```

- [ ] **Step 2: Adicionar o novo estado `definindoConferencia`**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx:31`, após:

```jsx
  const [selecionandoTipo, setSelecionandoTipo] = useState(false);
```

adicione:

```jsx
  const [definindoConferencia, setDefinindoConferencia] = useState(false);
```

- [ ] **Step 3: Adicionar os handlers `handleDefinirDataEntrega` e `handleAgendarConferenciaEntrega`**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`, após o fim da função `handleAgendarInstalacao` (linha 56, `  }`), adicione:

```jsx

  async function handleDefinirDataEntrega() {
    try {
      const res = await api.get(`/pedidos/${pedidoId}/itens-disponiveis-conferencia-entrega`);
      if ((res.itens || []).length > 0) {
        setDefinindoConferencia(true);
      } else {
        setInstalacao(pedido);
      }
    } catch (e) {
      alert(e.message || "Erro ao verificar itens pendentes de conferência.");
    }
  }

  function handleAgendarConferenciaEntrega(itensSel) {
    setDefinindoConferencia(false);
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
          itens:         itensSel,
          tipo:          "Conferência",
          status:        "agendado",
          titulo:        `Conferência - ${primeiroEUltimoNome(pedido.cliente_nome)} - ${numeroPedidoCompleto(pedido)}`,
        },
      },
    });
  }
```

- [ ] **Step 4: Renomear o botão e trocar seu handler**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx:118-120`, troque:

```jsx
          <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={() => setInstalacao(pedido)}>
            📅 Agendar Instalação
          </button>
```

por:

```jsx
          <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={handleDefinirDataEntrega}>
            DEFINIR DATA DE ENTREGA
          </button>
```

- [ ] **Step 5: Adicionar o novo bloco de modal de Conferência**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`, após o bloco existente (linhas 124-130):

```jsx
      {instalacao && (
        <ModalSelecionarItensInstalacao
          pedido={instalacao}
          onClose={() => setInstalacao(null)}
          onContinuar={handleAgendarInstalacao}
        />
      )}
```

adicione, imediatamente depois:

```jsx

      {definindoConferencia && (
        <ModalSelecionarItensInstalacao
          pedido={pedido}
          itensEndpoint={`/pedidos/${pedidoId}/itens-disponiveis-conferencia-entrega`}
          titulo={`Agendar Conferência — ${numeroPedidoCompleto(pedido)}`}
          textoVazio="Todos os itens deste pedido já têm conferência agendada."
          onClose={() => setDefinindoConferencia(false)}
          onContinuar={handleAgendarConferenciaEntrega}
        />
      )}
```

- [ ] **Step 6: Lint**

Run (da pasta `frontend-web/`): `npx eslint src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(pedidos): botao DEFINIR DATA DE ENTREGA verifica itens pendentes de conferencia"
```

---

### Task 4: `NovoAgendamentoModal` em `Agendamentos.jsx`

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx`

Ajusta o `preAgendado` inicial e o `titulo` default para respeitar `prefill.status`/`prefill.titulo` quando presentes, e adiciona um aviso amarelo de confirmação para o prefill de Conferência criado pela Etapa 1.

- [ ] **Step 1: Ajustar a inicialização de `preAgendado`**

Em `frontend-web/src/pages/agendamentos/Agendamentos.jsx:1367`, troque:

```jsx
  const [preAgendado, setPreAgendado] = useState(agEditar?.status === "pre_agendado" || !!prefill);
```

por:

```jsx
  const prefillPreAgendado = prefill ? (prefill.status ?? "pre_agendado") === "pre_agendado" : false;
  const [preAgendado, setPreAgendado] = useState(agEditar?.status === "pre_agendado" || prefillPreAgendado);
```

- [ ] **Step 2: Ajustar o `titulo` default do form**

Em `frontend-web/src/pages/agendamentos/Agendamentos.jsx:1369`, troque:

```jsx
    titulo:      agEditar?.titulo      ?? (prefill ? `Instalação — ${prefill.pedido_numero || ""}`.trim() : ""),
```

por:

```jsx
    titulo:      agEditar?.titulo      ?? prefill?.titulo ?? (prefill ? `Instalação — ${prefill.pedido_numero || ""}`.trim() : ""),
```

- [ ] **Step 3: Adicionar o aviso amarelo de confirmação**

Em `frontend-web/src/pages/agendamentos/Agendamentos.jsx:1654-1656`, troque:

```jsx
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Linha 1 — Título */}
```

por:

```jsx
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {prefill?.tipo === "Conferência" && prefill?.status === "agendado" && (
            <div style={{ padding: "10px 14px", background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 8, color: "#eab308", fontSize: 13 }}>
              ⚠️ Confirme esta data e horário com o cliente antes de salvar. Este agendamento será criado como "Agendado".
            </div>
          )}

          {/* Linha 1 — Título */}
```

- [ ] **Step 4: Lint**

Run (da pasta `frontend-web/`): `npx eslint src/pages/agendamentos/Agendamentos.jsx`
Expected: 0 erros novos (mesmos warnings pré-existentes, se houver, podem permanecer).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(agendamentos): respeita status/titulo do prefill e avisa confirmacao de conferencia"
```

---

### Task 5: Verificação manual no navegador

**Pré-requisito:** garantir que pelo menos uma categoria (ex: "Persianas") tenha `necessita_conferencia = true` (tela Categorias, subprojeto 1) e que exista um pedido com pelo menos um item dessa categoria sem Conferência ativa agendada.

- [ ] **Step 1: Subir o frontend e o backend**

Run: `npm run dev` em `frontend-web/` (e o backend já rodando conforme o setup local do projeto).

- [ ] **Step 2: Fluxo COM itens pendentes de conferência**

1. Abrir o pedido com item pendente de conferência → Fluxo → Etapa 1.
2. Confirmar que o botão aparece como **"DEFINIR DATA DE ENTREGA"**.
3. Clicar no botão → confirmar que abre o modal **"Agendar Conferência — <número do pedido>"**, listando apenas os itens pendentes de conferência, **sem** a linha "prazo mínimo".
4. Selecionar item(ns) → "Continuar" → confirmar redirecionamento para `/agendamentos` com o modal "Novo Agendamento" aberto:
   - Título pré-preenchido como `"Conferência - <Primeiro Nome> <Último Nome> - <número do pedido>"`.
   - Tipo = "Conferência".
   - Toggle de pré-agendamento **desmarcado**.
   - Aviso amarelo "⚠️ Confirme esta data e horário com o cliente..." visível.
5. Preencher data/hora e salvar → confirmar que o agendamento criado aparece com status **"Agendado"** (não "Pré agendado") no calendário.

- [ ] **Step 3: Fluxo SEM itens pendentes de conferência (regressão)**

1. Abrir um pedido sem itens de categorias com `necessita_conferencia = true` (ou todos já cobertos por Conferência) → Fluxo → Etapa 1.
2. Clicar em "DEFINIR DATA DE ENTREGA".
3. Confirmar que o comportamento é o **mesmo de antes**: abre o modal "Agendar Instalação — <número>" com a linha "prazo mínimo" normal, e ao continuar cria um pré-agendamento de Instalação (`status='pre_agendado'`) como já funcionava.

- [ ] **Step 4: Regressão do fluxo de Conferência herdeiro (Etapa 2)**

1. Abrir a Etapa 2 de um pedido com Conferência genitora agendada e confirmar que o fluxo de "+ Agendar Conferência" (herdeiro, prefill sem `status`/`titulo` explícitos) continua nascendo como pré-agendado, sem o aviso amarelo — comportamento inalterado.

Se todos os passos passarem, a implementação do subprojeto 2 está completa.

---

## Self-Review (cobertura da spec)

- **Seção 1.1 (util `primeiroEUltimoNome`)** → Task 1. ✅
- **Seção 1.2 (estado `definindoConferencia` + handlers + imports)** → Task 3, Steps 1-3. ✅
- **Seção 1.3 (botão renomeado + novo bloco de modal)** → Task 3, Steps 4-5. ✅
- **Seção 2 (props `titulo`/`textoVazio` + prazo mínimo condicional)** → Task 2. ✅
- **Seção 3.1 (`preAgendado` init)** → Task 4, Step 1. ✅
- **Seção 3.2 (`titulo` default)** → Task 4, Step 2. ✅
- **Seção 3.3 (aviso amarelo)** → Task 4, Step 3. ✅
- **Seção "Testes" (verificação manual)** → Task 5, cobre os 6 itens do roteiro da spec (itens 1-6 mapeados em Steps 2-4). ✅
- **Fora de escopo (subprojeto 3)** → nenhuma task deste plano toca `dashboardService.js` ou `EtapaConferencia.jsx`. ✅

Sem placeholders pendentes; nomes (`primeiroEUltimoNome`, `definindoConferencia`, `handleDefinirDataEntrega`, `handleAgendarConferenciaEntrega`, `titulo`, `textoVazio`, `prefillPreAgendado`) consistentes entre as tasks.
