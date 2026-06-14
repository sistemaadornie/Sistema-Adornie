# Design: "DEFINIR DATA DE ENTREGA" — agendamento de Conferência a partir da Etapa 1

**Data:** 2026-06-14
**Status:** Aprovado

---

## Contexto

Este é o **subprojeto 2 de 3** da reformulação do fluxo de conclusão da Etapa 1 ("📋 Pedidos"), descrita em [2026-06-14-flag-categoria-conferencia-design.md](2026-06-14-flag-categoria-conferencia-design.md) (subprojeto 1, já implementado).

O subprojeto 1 entregou:
- `categorias.necessita_conferencia` (boolean, configurável na tela de Categorias).
- `GET /pedidos/:id/itens-disponiveis-conferencia-entrega` — lista os itens do pedido cujas categorias exigem conferência e que ainda não estão cobertos por uma Conferência ativa.

**Situação atual:** no modal da Etapa 1 ([EtapaDadosPedido.jsx](../../../frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx)), o botão "📅 Agendar Instalação" abre o [ModalSelecionarItensInstalacao](../../../frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx) (endpoint `itens-disponiveis-instalacao`) e, ao confirmar, navega para `/agendamentos` criando um agendamento genitor `tipo='Instalação'`, `status='pre_agendado'`.

**Nova regra de negócio (este subprojeto):**

1. O botão é renomeado para **"DEFINIR DATA DE ENTREGA"**.
2. Ao clicar, o sistema consulta `GET /pedidos/:id/itens-disponiveis-conferencia-entrega`:
   - Se a lista vier **vazia**, mantém o comportamento atual (fluxo de pré-agendamento de Instalação, inalterado).
   - Se vier **com itens**, abre um modal de seleção desses itens (reaproveitando o `ModalSelecionarItensInstalacao`).
3. Ao confirmar a seleção, redireciona para `/agendamentos` criando um agendamento genitor `tipo='Conferência'`, `status='agendado'` (sem `agendamento_pai_id`), com título `"Conferência - <Primeiro Nome> <Último Nome do cliente> - <numeroPedidoCompleto>"`.
4. A tela de Agendamentos deixa explícito, para esse caso, que a data/horário precisa ser confirmada com o cliente antes de salvar.

## Objetivo

1. Renomear o botão e implementar a ramificação (vazio → fluxo atual; com itens → novo fluxo de Conferência) em `EtapaDadosPedido.jsx`.
2. Parametrizar `ModalSelecionarItensInstalacao.jsx` (título e texto de lista vazia) para reaproveitá-lo na seleção de itens de conferência, sem alterar o comportamento dos usos existentes.
3. Criar util `primeiroEUltimoNome` para montar o título do agendamento de Conferência.
4. Ajustar `NovoAgendamentoModal` (em `Agendamentos.jsx`) para: (a) iniciar `status='agendado'` quando o prefill indicar isso explicitamente, (b) usar um título pré-formatado vindo do prefill quando presente, e (c) exibir um aviso de confirmação com o cliente para agendamentos de Conferência criados por este fluxo.

---

## 1. `EtapaDadosPedido.jsx`

### 1.1 Novo util de nome do cliente

Novo arquivo `frontend-web/src/utils/nomeCliente.js`:

```js
export function primeiroEUltimoNome(nomeCompleto) {
  const partes = (nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}
```

### 1.2 Novo estado e handlers

```jsx
const [definindoConferencia, setDefinindoConferencia] = useState(false);

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

Import necessário no topo do arquivo:
```js
import { primeiroEUltimoNome } from "../../../../utils/nomeCliente";
```
e `api` (já não importado hoje — adicionar `import { api } from "../../../../services/api";`).

### 1.3 Botão e modais

Substituir:
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

E adicionar, junto ao bloco `{instalacao && (...)}` existente:
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

O bloco existente `{instalacao && (<ModalSelecionarItensInstalacao pedido={instalacao} onClose={...} onContinuar={handleAgendarInstalacao} />)}` permanece sem alterações (continua sendo o fluxo "sem itens pendentes de conferência").

---

## 2. `ModalSelecionarItensInstalacao.jsx`

Duas novas props opcionais, `titulo` e `textoVazio`, com defaults que reproduzem o texto atual:

```jsx
export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar, itensEndpoint, titulo, textoVazio }) {
  ...
  <h2 className="modal-title">{titulo || `Agendar Instalação — ${pedido.numero || numeroPedidoCompleto(pedido)}`}</h2>
  ...
  ) : itens.length === 0 ? (
    <p style={{ color: "var(--color-text-muted)" }}>
      {textoVazio || "Todos os itens deste pedido já estão agendados para instalação."}
    </p>
  ) : (
```

Na linha de metadados de cada item, a parte de "prazo mínimo" só é renderizada quando o item traz esses campos (o endpoint de conferência não os retorna):

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

Usos existentes (Etapa 1 instalação, Etapa 2 conferência) não passam `titulo`/`textoVazio`, então mantêm o texto atual sem alteração visual.

---

## 3. `Agendamentos.jsx` — `NovoAgendamentoModal`

### 3.1 Status inicial (`preAgendado`)

Hoje: `useState(agEditar?.status === "pre_agendado" || !!prefill)` — qualquer prefill nasce pré-agendado.

Novo:
```js
const prefillPreAgendado = prefill ? (prefill.status ?? "pre_agendado") === "pre_agendado" : false;
const [preAgendado, setPreAgendado] = useState(agEditar?.status === "pre_agendado" || prefillPreAgendado);
```

Prefills existentes (Instalação da Etapa 1 via `handleAgendarInstalacao`, Conferência herdeira da Etapa 2 via `EtapaConferencia.jsx`) não incluem `status`, então `prefill.status ?? "pre_agendado"` resolve para `"pre_agendado"` — comportamento inalterado. O novo prefill de Conferência (seção 1.2) inclui `status: "agendado"`, resultando em `prefillPreAgendado = false`.

### 3.2 Título default

Hoje: `titulo: agEditar?.titulo ?? (prefill ? \`Instalação — ${prefill.pedido_numero || ""}\`.trim() : "")`.

Novo:
```js
titulo: agEditar?.titulo ?? prefill?.titulo ?? (prefill ? `Instalação — ${prefill.pedido_numero || ""}`.trim() : ""),
```

Quando o prefill já traz `titulo` formatado (caso da Conferência da Etapa 1), ele é usado como valor inicial do campo (o usuário ainda pode editá-lo antes de salvar).

### 3.3 Aviso de confirmação com o cliente

Quando `prefill?.tipo === "Conferência" && prefill?.status === "agendado"`, exibir no topo do formulário (antes do campo "Título"):

```jsx
{prefill?.tipo === "Conferência" && prefill?.status === "agendado" && (
  <div style={{ padding: "10px 14px", background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.35)", borderRadius: 8, color: "#eab308", fontSize: 13, marginBottom: 12 }}>
    ⚠️ Confirme esta data e horário com o cliente antes de salvar. Este agendamento será criado como "Agendado".
  </div>
)}
```

---

## Testes

Não há testes automatizados de frontend neste projeto (`frontend-web/src` não possui arquivos `*.test.*`). A verificação é manual no navegador:

1. Em uma categoria com `necessita_conferencia = true` (ex: "Persianas", configurada no subprojeto 1), garantir que um pedido tenha pelo menos um item dessa categoria sem conferência ativa.
2. Abrir o pedido na tela Fluxo → Etapa 1 → clicar em "DEFINIR DATA DE ENTREGA".
3. Confirmar que abre o modal "Agendar Conferência — ..." listando apenas os itens pendentes (sem a linha "prazo mínimo").
4. Selecionar item(ns) e continuar → confirmar redirecionamento para `/agendamentos` com o modal "Novo Agendamento" aberto, título pré-preenchido como `"Conferência - <Primeiro> <Último> - <pedido>"`, tipo "Conferência", toggle de pré-agendamento **desmarcado**, e o aviso amarelo de confirmação visível.
5. Salvar e confirmar que o agendamento criado tem `status='agendado'` (não aparece como "Pré agendado" no calendário).
6. Repetir o fluxo em um pedido sem itens de categorias com `necessita_conferencia` (ou todos já cobertos) e confirmar que o comportamento permanece o atual (modal "Agendar Instalação", pré-agendamento).

---

## Fora de escopo (subprojeto 3)

- Botão de pré-agendamento de entrega/instalação que aparece *após* uma Conferência ser agendada (para os itens que precisavam de conferência).
- Ajustes em `dashboardService.js` (`itens_cobertos` filtrado por `tipo='Instalação'`).
- Mudanças em `EtapaConferencia.jsx` (remoção do "+ Agendar Conferência", já que a Etapa 1 passa a ser a origem das Conferências).
