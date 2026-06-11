# Fluxo do Pedido — expansão de 5 para 8 etapas

## Motivação

O fluxo do pedido (`PedidoFluxo.jsx`) hoje tem 5 etapas: Dados do Pedido, Conferência de
Medidas, Produção, Agendamento e Pós-venda. O processo real da empresa tem passos
adicionais entre "Produção" e "Agendamento" e entre "Agendamento" e "Pós-venda", que hoje
não são representados nem rastreados no sistema. Esta spec reestrutura o fluxo para 8
etapas, renomeando algumas e adicionando 3 novas, com seus respectivos critérios de
conclusão, dados e telas.

## Visão geral — renumeração

| # | Hoje | Novo título | Ícone | Mudança |
|---|------|------------|-------|---------|
| 1 | Dados do Pedido | **Pedidos** | 📋 | Renomeia (lógica igual) |
| 2 | Conferência de Medidas | Conferência de Medidas | 📐 | Sem mudança |
| 3 | Produção | **Produção/Compras** | ⚙️ | Renomeia (lógica igual) |
| 4 | — | **Conferência do Produto** | 🔍 | **NOVO** |
| 5 | Agendamento (era 4) | **Agendamento (Instalação)** | 📅 | Renomeia (lógica igual, novo número) |
| 6 | — | **Separação** | 📦 | **NOVO** |
| 7 | — | **Entrega** | 🚚 | **NOVO** |
| 8 | Pós-venda (era 5) | Pós-venda | ⭐ | Sem mudança (novo número) |

A ordem do `pf-flow-container` (canvas) e dos chips de filtro em `Pedidos.jsx` segue essa
nova numeração 1-8.

## Mudanças no banco de dados

Duas novas colunas, seguindo o padrão já usado por `em_confeccao`/`confeccao_ok`:

```sql
-- pedido_itens_produto_ok.sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS produto_ok BOOLEAN NOT NULL DEFAULT false;
```

```sql
-- agendamento_itens_separado.sql
ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS separado BOOLEAN NOT NULL DEFAULT false;
```

A etapa 7 (Entrega) **não precisa de coluna nova**: reaproveita
`agendamentos.status = 'concluido'` dos agendamentos herdeiros do tipo "Instalação",
já gravado pelo endpoint existente `PUT /agendamentos/:id/status`.

## Critérios de conclusão por etapa

`calcularEtapaAtual` (em `dashboardService.js`) passa a calcular 8 flags. As etapas
1-3 mantêm a lógica atual (`etapa1_ok`, `etapa2_ok`, `etapa3_ok` sem mudanças).
Novas/renumeradas:

- **`etapa4_ok`** (Conferência do Produto) = `totalItens > 0 && itensComProdutoOk >= totalItens`
  — todos os itens do pedido (produzidos ou comprados) marcados como conferidos.
- **`etapa5_ok`** (Agendamento/Instalação) = `genitoresAgendados > 0`
  — mesma condição da antiga `etapa4_ok`, sem mudança de lógica.
- **`etapa6_ok`** (Separação) = `instalacoesTotal > 0 && totalItensInstalacao > 0 && itensSeparados >= totalItensInstalacao`
  — existe ao menos uma instalação agendada e todos os itens dela estão marcados
  como separados.
- **`etapa7_ok`** (Entrega) = `instalacoesTotal > 0 && instalacoesConcluidas >= instalacoesTotal`
  — todos os agendamentos herdeiros do tipo "Instalação" estão com `status = 'concluido'`.
- **`etapa8_ok`** (Pós-venda) = `pedido.status === 'concluido'`
  — mesma condição da antiga `etapa5_ok`, sem mudança.

Onde:
- `itensComProdutoOk` = `COUNT(pedido_itens) WHERE produto_ok = true`.
- `instalacoesTotal` / `instalacoesConcluidas` = contagem de agendamentos herdeiros
  (`agendamento_pai_id` não nulo) com `tipo = 'Instalação'`, total e com
  `status = 'concluido'`.
- `totalItensInstalacao` / `itensSeparados` = contagem de `agendamento_itens` desses
  herdeiros de Instalação (com `pedido_item_id` não nulo), total e com `separado = true`.

`etapa_atual` passa a ser a primeira etapa (1-8) cujo `_ok` é falso, em cascata
(`etapa1_ok && etapa2_ok && ... ` igual ao padrão atual). `etapa8_ok` continua
forçando `etapa_atual = 8` independentemente das demais (igual ao comportamento
atual da etapa 5).

### `buscarFluxoPedido`

- Adiciona query para `itensComProdutoOk` (contagem simples em `pedido_itens`).
- Reutiliza `herdeirosRaw` (já buscado) para derivar `instalacoesTotal` e
  `instalacoesConcluidas` filtrando `tipo === 'Instalação'`.
- Adiciona query para `agendamento_itens` dos herdeiros de Instalação
  (`agendamento_id = ANY(instalacaoIds)`), retornando `pedido_item_id`, `descricao`
  e `separado`, para alimentar `totalItensInstalacao`/`itensSeparados` e a tela da
  etapa 6.
- O array `etapas` retornado passa a ter 8 entradas (`numero: 1..8`), cada uma com
  `concluida` e um objeto `progresso` próprio:
  - `4`: `{ total_itens, itens_produto_ok }`
  - `5`: `{ genitores_agendados }` (igual à antiga etapa 4)
  - `6`: `{ total_itens_instalacao, itens_separados }`
  - `7`: `{ instalacoes_total, instalacoes_concluidas }`
  - `8`: `{ status }` (igual à antiga etapa 5)
- O branch "sem genitores" (early return) é estendido para preencher as 8 etapas
  com `concluida: false` e progresso zerado nas novas etapas (4, 6, 7), mantendo
  `etapa4_ok`/`etapa3_ok` calculáveis normalmente (etapa 4 não depende de
  agendamentos).

### `listarPedidosDashboard`

Usado pela listagem `Pedidos.jsx` para os chips de filtro por etapa. Recebe os
mesmos novos agregados, em lote por `pedido_id`, seguindo o padrão das queries
`prodRows`/`agendadoRows` já existentes:
- `produtoOkRows`: `total` e `produto_ok` por pedido (`pedido_itens`).
- `instalacaoRows`: `instalacoes_total` e `instalacoes_concluidas` por pedido.
- `separacaoRows`: `total_itens_instalacao` e `itens_separados` por pedido.

Esses valores alimentam a mesma `calcularEtapaAtual` para calcular `etapa_atual`
(1-8) por pedido na listagem.

## Novos endpoints

- `PATCH /pedidos/:id/conferencia-produto-itens`
  Body: `{ pedido_item_id, produto_ok }`. Atualiza `pedido_itens.produto_ok`
  (mesmo padrão de `producao-itens`, validando que o item pertence ao pedido/empresa).

- `PATCH /agendamentos/:id/itens/:itemId/separado`
  Body: `{ separado }`. Atualiza `agendamento_itens.separado` para o item
  `itemId` do agendamento `:id` (valida que o agendamento é do tipo "Instalação"
  e pertence à empresa).

- Etapa 7 não precisa de endpoint novo: o botão "Marcar como concluída" reutiliza
  `PUT /agendamentos/:id/status` com `{ status: 'concluido' }`.

## Mudanças no frontend

### Configuração de etapas (duas cópias a manter em sincronia)

- `frontend-web/src/pages/pedidos/fluxo/EtapaCard.jsx` — `ETAPA_CONFIG` (1-8,
  ícone + título, usados no canvas do fluxo). `buildStatusLabel`/`buildProgressPct`
  ganham ramos para `numero === 4`, `6`, `7` (e os ramos antigos de 4/5 são
  renumerados para 5/8).
- `frontend-web/src/pages/pedidos/Pedidos.jsx` — `ETAPA_CONFIG` (1-8, com
  `label`/`labelCurto`/`icone`) usado nos chips de filtro da listagem.

Labels curtos sugeridos para os novos: "Conf. Produto" (4), "Separação" (6),
"Entrega" (7).

### `PedidoFluxo.jsx`

`ETAPA_COMPONENTES` passa a mapear 1-8:

```js
const ETAPA_COMPONENTES = {
  1: EtapaDadosPedido,         // título "Pedidos"
  2: EtapaConferencia,         // sem mudança
  3: EtapaProducao,            // título "Produção/Compras"
  4: EtapaConferenciaProduto,  // NOVO
  5: EtapaAgendamento,         // título "Agendamento (Instalação)"
  6: EtapaSeparacao,           // NOVO
  7: EtapaEntrega,             // NOVO
  8: EtapaPosvenda,
};
```

Os componentes existentes só precisam atualizar o cabeçalho ("ETAPA N" e título);
a lógica interna de `EtapaDadosPedido`, `EtapaConferencia`, `EtapaProducao`,
`EtapaAgendamento` e `EtapaPosvenda` não muda.

### Novo componente: `EtapaConferenciaProduto.jsx` (etapa 4)

Modelo igual ao `EtapaProducao.jsx`:
- Cabeçalho "ETAPA 4 — 🔍 Conferência do Produto".
- Dois cards de resumo: "X conferidos" / "Y pendentes" (`itens_produto_ok` /
  `total_itens - itens_produto_ok`).
- Lista de **todos** os itens do pedido (`pedido.itens`), cada um com checkbox
  "Conferido ✓" que chama `PATCH /pedidos/:id/conferencia-produto-itens`.

### Novo componente: `EtapaSeparacao.jsx` (etapa 6)

- Cabeçalho "ETAPA 6 — 📦 Separação".
- Se não houver agendamento de Instalação (`instalacoes_total === 0`): mensagem
  "Nenhuma instalação agendada. Conclua a etapa 5 primeiro."
- Caso contrário, lista os itens vinculados ao(s) agendamento(s) de Instalação
  (descrição + ambiente), cada um com checkbox "Separado ✓" que chama
  `PATCH /agendamentos/:id/itens/:itemId/separado`.
- Card de resumo: "X de Y itens separados" (`itens_separados` / `total_itens_instalacao`).

### Novo componente: `EtapaEntrega.jsx` (etapa 7)

- Cabeçalho "ETAPA 7 — 🚚 Entrega".
- Se não houver agendamento de Instalação: mensagem "Nenhuma instalação agendada."
- Caso contrário, lista cada agendamento de Instalação com data e badge de status
  (`pf-badge-ok` se `concluido`, `pf-badge-pend` caso contrário).
- Para agendamentos ainda não `concluido`, botão "✅ Marcar como concluída" que
  chama `PUT /agendamentos/:id/status` com `{ status: 'concluido' }` e recarrega.

## Casos de borda

- Pedido sem itens (`totalItens === 0`): `etapa4_ok` permanece `false` (segue a
  mesma convenção de `etapa1_ok`, que também exige `totalItens > 0`).
- Pedido sem nenhum agendamento de Instalação ainda: etapas 6 e 7 ficam
  pendentes (`false`), e suas telas mostram mensagem orientando a concluir a
  etapa 5 primeiro.
- Pedido com múltiplas instalações (múltiplos ambientes/entregas): etapas 6 e 7
  exigem que **todas** as instalações estejam com itens separados / status
  concluído, respectivamente.

## Testes

- `dashboardService.test.js`: estender `calcularEtapaAtual` com os novos
  parâmetros (`itensComProdutoOk`, `instalacoesTotal`, `instalacoesConcluidas`,
  `totalItensInstalacao`, `itensSeparados`) e novos casos para `etapa_atual`
  4, 6, 7 e 8 (renumerado de 5).
- `pedidoService.test.js` / rotas: testes para os dois novos endpoints PATCH.
