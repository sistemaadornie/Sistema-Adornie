# Remarcação após Conferência/Instalação "Não Concluído"

## Objetivo

Quando um agendamento de **Conferência** ou **Instalação** é marcado como `nao_concluido` (pelo instalador, no PWA), o sistema deve:

1. Notificar quem precisa agir, apontando direto para o fluxo do pedido.
2. Deixar de contar essa visita como "item resolvido" nos cálculos de cobertura das etapas do pedido.
3. Mostrar claramente, dentro do fluxo do pedido, que aquela visita falhou e precisa ser remarcada.
4. Permitir remarcar com um clique, sem repetir a seleção de itens.

## Contexto atual (antes da mudança)

- `agendamentos.status` já tem o valor `nao_concluido`, setado via PWA do instalador (`AgendamentoDetalhe.jsx`) → `PATCH` que chama `agendamentoService.alterarStatus`.
- Ao marcar `nao_concluido`, o backend já grava `observacoes_status`/`concluido_em`/`concluido_por` e dispara uma notificação combinada (tipo `reagendamento_pendente`), mas:
  - o link aponta para `/agendamentos?id={id}&detalhe=1`, não para o pedido;
  - o consultor responsável pelo pedido não é destinatário garantido (só equipe técnica + criador + registro global).
- As queries de "cobertura" usadas em `dashboardService.buscarFluxoPedido` e nas rotas `itens-disponiveis-instalacao` / `itens-disponiveis-conferencia-entrega` só excluem agendamentos `cancelado`/`rejeitado` — um `nao_concluido` continua contando como "item já resolvido", o que:
  - infla indevidamente `conferenciaOk` (parte do gate de `etapa1_ok`);
  - faz os itens da visita falhada não aparecerem como disponíveis para um novo agendamento.
- `EtapaConferencia.jsx` e `EtapaAgendamento.jsx` (fluxo do pedido) não diferenciam visualmente `nao_concluido` de outros status — cai no badge genérico de pendente, ou em `EtapaAgendamento.jsx` mostra erroneamente "Pré-agendado".
- As etapas 5 (`genitoresAgendados`, exige `status='agendado'`) e 7 (`instalacoesConcluidas`, exige `status='concluido'`) já se autocorrigem hoje — não precisam de mudança de query, só falta a indicação visual.

## Mudanças — Backend

### 1. Notificação e auditoria (`agendamentoService.alterarStatus`)

Quando `status` se torna `nao_concluido` e `tipo` é `Conferência` ou `Instalação`:

- Buscar `pedido_id` do agendamento e `consultor_id` do pedido (`pedidos.consultor_id`).
- Trocar o link da notificação combinada de `/agendamentos?id=...` para `/pedidos/{pedidoId}/fluxo` quando houver `pedido_id`.
- Incluir o `consultor_id` do pedido como destinatário explícito da notificação (além de equipe + criador + registro global, que continuam recebendo).
- Inserir uma linha em `pedido_auditoria` (`etapa`: `'conferencia'` para tipo Conferência, `'entrega'` para tipo Instalação; `acao`: `'agendamento_nao_concluido'`; `descricao` incluindo o motivo, se informado).

Mudança isolada dentro do bloco try/catch de notificação já existente (`agendamentoService.js:955-994`) — não altera quem já recebe hoje, só estende.

### 2. Cobertura no fluxo do pedido (`dashboardService.buscarFluxoPedido`)

Nas duas queries de cobertura (Conferência e Instalação), adicionar `'nao_concluido'` à cláusula `a.status NOT IN (...)`, junto com `cancelado`/`rejeitado`:

- Cobertura de Conferência → corrige `conferenciaOk` (gate de `etapa1_ok`).
- Cobertura de Instalação → corrige a estatística exibida em `etapa1`.progresso (`itens_cobertos`), hoje sem efeito em gate algum, mas incorreta como número informativo.

### 3. Itens disponíveis para novo agendamento (`pedidosRoutes.js`)

Nas rotas `GET /pedidos/:id/itens-disponiveis-instalacao` e `GET /pedidos/:id/itens-disponiveis-conferencia-entrega`, adicionar `'nao_concluido'` à exclusão `a.status NOT IN (...)` que determina se um item já está "coberto" por um agendamento ativo. Sem isso, itens de uma visita falhada nunca voltam a aparecer como disponíveis para um novo agendamento — nem pelo caminho normal (Etapa 1 → "Agendar Instalação") nem pelo botão Remarcar (ver abaixo, que não depende dessa rota mas se beneficia da consistência).

## Mudanças — Frontend

### 1. Badge de status

Em `EtapaConferencia.jsx` (genitores e herdeiros) e `EtapaAgendamento.jsx`: quando `status === 'nao_concluido'`, usar a classe já existente `pf-badge-err` com o texto "Não concluído — necessário remarcar", em vez do badge genérico atual. Se o agendamento tiver `observacoes_status` (motivo registrado pelo instalador), exibir abaixo do badge em texto pequeno — isso exige incluir `status` e `observacoes_status` na resposta de `buscarFluxoPedido` para genitores e herdeiros (hoje só `status` e `data_inicio` são retornados).

O card permanece na lista como histórico; não desaparece.

### 2. Botão "Remarcar"

Visível apenas quando `status === 'nao_concluido'`, ao lado do badge.

Reaproveita o padrão já usado em `EtapaDadosPedido.jsx` (`handleAgendarInstalacao` / `handleAgendarConferenciaEntrega`): monta um objeto de prefill e navega para `/agendamentos` via `state.novoInstalacao`, onde a tela já abre `NovoAgendamentoModal` pré-preenchido (faltando só data/hora e equipe).

Diferença em relação ao padrão da Etapa 1: não é necessário reabrir `ModalSelecionarItensInstalacao` para escolher itens — os itens já são conhecidos (são os mesmos do agendamento que falhou, disponíveis em `g.itens` / `ag.itens`, já retornados pelo `/pedidos/:id/fluxo`). O clique em "Remarcar" monta:

```js
itens: g.itens.map(it => ({ pedido_item_id: it.pedido_item_id, nome: it.descricao }))
```

e navega com:

```js
navigate("/agendamentos", {
  state: {
    novoInstalacao: {
      pedido_id, pedido_numero, cliente, cliente_id,
      cep, rua, numero, complemento, bairro, cidade, estado, // do pedido
      itens: itensSel,
      tipo: "Conferência" | "Instalação",
      titulo: `${tipo} - ${cliente} - ${pedido_numero}`,
    },
  },
});
```

O agendamento antigo (`nao_concluido`) não é editado nem apagado — é um registro histórico. O novo agendamento é uma entidade nova e independente (o sistema não tem, e não vai ganhar, um campo `agendamento_anterior_id` — não há necessidade funcional disso, já que a ligação se dá pelos mesmos `pedido_item_id`).

## Fora de escopo

- Tipo `Retorno/Finalização` (decisão já tomada: só Conferência e Instalação).
- Qualquer botão/fluxo de remarcação dentro do PWA do instalador — o instalador só marca `nao_concluido`; remarcar é ação da consultora/admin no fluxo web do pedido.
- Vínculo formal entre o agendamento antigo e o novo (`agendamento_anterior_id` ou similar) — não há necessidade identificada.
- Reset de `conferencia_itens` por item — já funciona corretamente hoje, pois o status por item é independente do status geral do agendamento.

## Testes

- Backend: estender `agendamentoStatusPreAgendado.test.js` / criar teste novo cobrindo: (a) notificação com link `/pedidos/{id}/fluxo` e consultor como destinatário ao marcar `nao_concluido`; (b) auditoria gravada em `pedido_auditoria`.
- Backend: estender `dashboardService.buscarFluxoPedido.test.js` cobrindo um cenário com agendamento `nao_concluido` único cobrindo um item — `conferenciaOk`/`etapa1_ok` deve ficar `false`.
- Backend: teste cobrindo `itens-disponiveis-instalacao`/`itens-disponiveis-conferencia-entrega` retornando itens de um agendamento `nao_concluido` como disponíveis.
- Frontend: teste manual no navegador (badge + botão Remarcar abrindo `/agendamentos` pré-preenchido) — sem suíte automatizada de frontend hoje neste módulo.
