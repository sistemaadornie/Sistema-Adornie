# Pedidos de Venda — Etapas corretas, filtro por etapa e select de consultoras — Design

**Data:** 2026-06-09
**Escopo:** `backend/src/services/dashboardService.js` + `frontend-web/src/pages/pedidos/Pedidos.jsx` (e `Pedidos.css`)

## Contexto

A tela "Pedidos de Venda" (`Pedidos.jsx`, endpoint `GET /dashboard/pedidos`) já existe e mostra, por pedido:
- Chips de filtro por status (`Todos`, `Pendente`, `Em andamento`, `Atrasado`, `Concluído`).
- Toggle "Visão Geral" / "Por Consultora" (só para quem tem `DASHBOARD_PEDIDOS_GERAL`), que ao ativar "Por Consultora" exibe um `<select>` de consultoras.
- Um `CardPedido` com `BarraProgresso`, que hoje só conhece **2 etapas**: "Dados do Pedido" (`estagio.verificacao_ok`) e "Entrega" (`status === 'concluido'`).

A tela de fluxo do pedido (`PedidoFluxo.jsx` → `buscarFluxoPedido`) já modela o fluxo real com **5 etapas**: Dados do Pedido, Conferência de Medidas, Produção, Agendamento, Pós-venda — e calcula `etapa_atual` (1-5) com várias queries por pedido (`backend/src/services/dashboardService.js:364-383`). Esse cálculo não existe na listagem (`listarPedidosDashboard`), que só retorna `verificacao_ok`/`categorizacao_ok`/`vinculos_ok`/`pdf_ok`/`nivel_alerta`.

## Objetivo

1. O card da listagem deve mostrar a barra com as **5 etapas reais do fluxo**, destacando corretamente a etapa atual.
2. Adicionar um filtro por etapa do fluxo (5 opções), independente dos filtros de status existentes.
3. Remover o toggle "Visão Geral" / "Por Consultora"; o `<select>` de consultoras fica sempre visível (para quem tem permissão) e filtra a listagem diretamente.

## 1. Backend — `etapa_atual` em lote em `listarPedidosDashboard`

Hoje `buscarFluxoPedido` calcula, para **um** pedido, 6 indicadores via queries `WHERE pedido_id = $1` e deriva `etapa1_ok..etapa5_ok → etapa_atual` (linhas 364-383). Vamos:

1. **Extrair** essa derivação para uma função pura compartilhada:
   ```js
   function calcularEtapaAtual({
     verificacaoOk, itensSemCategoria, itensSemVinculo, totalItens, itensCobertos,
     totalItensConf, itensConferidos, totalEmConf, totalConfOk, genitoresAgendados, status,
   }) {
     // mesma lógica das linhas 364-383, retorna { etapa_atual, etapas_ok: [bool x5] }
   }
   ```
   Usada tanto por `listarPedidosDashboard` quanto por `buscarFluxoPedido` (sem mudar o comportamento/retorno atual de `buscarFluxoPedido`).

2. **Adicionar 6 queries agregadas em lote** (rodando em `Promise.all` junto com a query `preAgs` já existente), todas no formato `WHERE pedido_id = ANY($1) ... GROUP BY pedido_id` — espelhando exatamente as queries por-pedido de `buscarFluxoPedido`:
   - total de itens por pedido
   - itens cobertos por agendamento (genitor) por pedido
   - itens sem categoria por pedido
   - itens sem vínculo por pedido
   - conferência (total/conferidos) por pedido
   - confecção (em_confeccao/confeccao_ok) por pedido
   - genitores agendados por pedido

3. Para cada pedido do resultado, montar o objeto de progresso (default 0 quando o pedido não aparece num map, ex.: pedido sem itens) e chamar `calcularEtapaAtual(...)`.

4. Adicionar `etapa_atual` (1-5) dentro de `estagio` no retorno de `listarPedidosDashboard`. Nenhum campo existente é removido; `pedido.status` continua disponível para o frontend decidir se a etapa 5 está "concluída".

Sem mudanças de rota/contrato além do novo campo `estagio.etapa_atual`.

## 2. Frontend — Card com as 5 etapas corretas

Novo `ETAPA_CONFIG` em `Pedidos.jsx` (espelha `fluxo/EtapaCard.jsx`):

| nº | Label completo (filtro) | Label curto (card) | Ícone |
|---|---|---|---|
| 1 | Dados do Pedido | Pedido | 📋 |
| 2 | Conferência de Medidas | Medidas | 📐 |
| 3 | Produção | Produção | ⚙️ |
| 4 | Agendamento | Agendamento | 📅 |
| 5 | Pós-venda | Pós-venda | ⭐ |

`BarraProgresso` passa a renderizar as 5 etapas (em vez de 2), usando `estagio.etapa_atual` e `status`:
- etapa `numero < etapa_atual` → classe `dp-ok` (concluída)
- etapa `numero === etapa_atual` → classe `dp-atual` (e `dp-atrasado` se `nivel_alerta === 'atrasado'`, igual hoje)
- etapa `numero === 5 && status === 'concluido'` → tratada como `dp-ok` mesmo que `etapa_atual === 5` (replica a regra de `EtapaCard.jsx` onde a etapa 5 só fica "concluída" com `status === 'concluido'`)
- demais etapas → pendente (estilo neutro atual)

Rótulo abaixo da barra:
- `status === 'concluido'` → `✓ Pedido concluído`
- caso contrário → `▶ Etapa atual: <label completo da etapa etapa_atual>` (mesma classe `dp-etapa-atual-atrasado` quando `nivel_alerta === 'atrasado'`)

A barra usa os labels **curtos** (cabe melhor no card de 320px); o rótulo abaixo e os chips de filtro usam os labels **completos**.

## 3. Frontend — Filtro por etapa (independente do filtro de status)

Nova linha de chips abaixo dos chips de status existentes, com as 5 etapas (label completo + ícone) + opção "Todas as etapas" (estado inicial/limpo).

Comportamento (filtros independentes — só um ativo por vez, conforme decidido):

- **Selecionar uma etapa**: zera o filtro de status para "Todos" (chama `carregar({...consultora})` sem `status`/`alerta`) e aplica um filtro client-side sobre a lista carregada: `pedidos.filter(p => p.estagio.etapa_atual === numero)`.
- **Selecionar um chip de status** (incluindo "Todos"): zera o filtro de etapa (`etapaFiltro = null`) e segue o comportamento atual (`carregar({status|alerta, ...consultora})`).
- O filtro de etapa **não** dispara nova etapa de `etapa_atual` — esse campo já vem calculado para todos os pedidos retornados (seção 1), então o filtro é puramente de exibição sobre o array já carregado.

## 4. Frontend — Select de consultoras substitui o toggle

- Remove os botões "Visão Geral" / "Por Consultora" e o estado `visaoGeral`.
- O `<select className="dp-select-consultora">` (gated por `temPermGeral`, igual hoje) fica **sempre visível** no header, com "Todas as consultoras" como opção padrão — que reproduz o comportamento atual de "Visão Geral" (sem `consultora_id`, backend retorna todos os pedidos da empresa para quem tem `DASHBOARD_PEDIDOS_GERAL`).
- Trocar a consultora chama `carregar({consultora_id, ...filtros de status/alerta atuais})`, preservando o filtro de status ativo (e mantendo o filtro de etapa client-side, já que a lista recarregada também traz `etapa_atual`).

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Modificar | `backend/src/services/dashboardService.js` — extrair `calcularEtapaAtual`, adicionar queries em lote e `estagio.etapa_atual` em `listarPedidosDashboard` |
| Modificar | `frontend-web/src/pages/pedidos/Pedidos.jsx` — `ETAPA_CONFIG`, `BarraProgresso` com 5 etapas, chips de filtro por etapa, remoção do toggle Visão Geral/Por Consultora, select sempre visível |
| Modificar | `frontend-web/src/pages/pedidos/Pedidos.css` — ajustes em `.dp-barra`/`.dp-etapa`/`.dp-label` se necessário para 5 itens, novas classes para a linha de chips de etapa, remoção de `.dp-toggle*`/`.dp-toggle-section` (ou reaproveitamento) |

## Testes / Verificação

- Pedidos em diferentes etapas reais (1 a 5) mostram a etapa correta destacada na barra do card e no rótulo "Etapa atual".
- Pedido com `status = 'concluido'` mostra todas as 5 etapas como concluídas e o rótulo "✓ Pedido concluído".
- Filtro por etapa retorna exatamente os pedidos cujo `etapa_atual` corresponde, e zera o filtro de status (visualmente o chip "Todos" fica ativo).
- Selecionar um filtro de status zera o filtro de etapa.
- Usuário sem `DASHBOARD_PEDIDOS_GERAL` não vê o select de consultoras (igual hoje) e continua vendo só seus próprios pedidos.
- Usuário com `DASHBOARD_PEDIDOS_GERAL`: por padrão vê todos os pedidos (equivalente à antiga "Visão Geral"); ao escolher uma consultora, a lista filtra e os filtros de status/etapa continuam funcionando sobre o resultado filtrado.
