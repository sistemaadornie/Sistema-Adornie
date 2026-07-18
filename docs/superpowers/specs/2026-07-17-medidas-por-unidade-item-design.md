# Medidas Independentes por Unidade em Itens com Quantidade > 1 — Spec

## Contexto

Hoje `pedido_itens` guarda `quantidade`, `largura` e `altura` como um único par de medidas por
linha, e a Ordem de Serviço (`ordem_servico`) guarda uma "medida técnica" (`dados_tecnicos`:
`largura`, `altura_esq`, `altura_meio`, `altura_dir`) também única por item, garantida por
`UNIQUE INDEX idx_os_pedido_item_unico ON ordem_servico(pedido_item_id)`
(`backend/src/database/migrations/ordem_servico_dados_confeccao.sql:7`). Não existe hoje nenhum
lugar do banco que suporte duas medidas diferentes para o mesmo item.

Na prática, quando um item tem `quantidade > 1` (ex.: uma persiana de 1,50m em duas unidades para
duas janelas do mesmo ambiente), cada unidade física pode ter uma medida real diferente
(ex.: 1,48m e 1,53m), apurada pelo técnico durante o agendamento de Conferência
(`tipo='Conferência'`, ver [[project_etapa1_conferencia_entrega]]) — a etapa em que o técnico vai
até o cliente medir antes de comprometer a produção. Esse agendamento roda antes da Etapa
"Produção/Compras" para toda categoria marcada `necessita_conferencia = true`, então é o ponto
único e confiável em que a divergência de medida por unidade precisa ser capturada.

O ponto de disparo hoje é `abrirOsDoItem` (`frontend-web/src/utils/fichaConferencia.js:10`),
chamado a partir da lista de itens do agendamento de Conferência
(`Agendamentos.jsx:2825`/`VerFichasConsultorasModal.jsx`), que cria a OS sob demanda via
`POST /api/os` (`ordemServicoService.criar`, `backend/src/services/ordemServicoService.js:4`).

## Objetivo

Permitir que itens de categorias que exigem conferência (`categorias.necessita_conferencia`) com
`quantidade > 1` sejam tratados, a partir do agendamento de Conferência em diante, como N unidades
completamente independentes — cada uma com sua própria medida técnica, ficha de
confecção/conferência, status de produção, separação e entrega — em vez de um único bloco.

## Não-objetivos

- Não altera a tela de Venda/Orçamento: o item continua aparecendo como uma linha só
  (`quantidade`, `valor` total), sem pedir medida por unidade nesse momento.
- Não altera itens de categorias sem `necessita_conferencia` — continuam como hoje, sempre um
  bloco único independente da quantidade.
- Não migra pedidos já em produção (OS/confecção já criada como bloco único) para o novo modelo —
  vale só para itens cuja OS/Conferência Técnica ainda não foi criada.
- Não muda a exigência de "Fotos por Ambiente" (continua 1 foto por `ambiente` distinto,
  independente de quantas unidades existam nele).
- Não suporta editar `quantidade` de um item depois de já expandido em unidades (ver "Casos de
  borda").

## Modelo de dados

Nenhuma tabela nova. Quatro colunas novas em `pedido_itens`:

```sql
ALTER TABLE pedido_itens
  ADD COLUMN item_pai_id    INTEGER REFERENCES pedido_itens(id) ON DELETE CASCADE,
  ADD COLUMN numero_unidade SMALLINT,
  ADD COLUMN total_unidades SMALLINT,
  ADD COLUMN expandido      BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_item_pai ON pedido_itens(item_pai_id);
```

- **Item original (pai)**: quando expandido, `expandido = true`, `item_pai_id = NULL`. Mantém
  `quantidade` (ex.: 2) e `valor` total — é o registro de venda/orçamento/PDF, intocado.
- **Itens filhos**: um registro por unidade física. `item_pai_id` = id do pai,
  `numero_unidade` = 1..N, `total_unidades` = N, `quantidade = 1`, `expandido = false`. Copiam
  `descricao`, `ambiente`, `categoria_id` do pai; `valor = NULL` (o valor de venda vive só no pai,
  evitando dupla contagem em somas de `valor`). Cada filho é um `pedido_item_id` comum: ganha sua
  própria linha em `ordem_servico` pela lógica existente (`ON CONFLICT (pedido_item_id) DO
  NOTHING`), sem nenhuma mudança em `ordem_servico`, `dados_tecnicos`, `dados_confeccao`,
  `dados_conferencia_consultoras`, `produto_ok` ou `agendamento_itens`.

Regra de filtro usada em todo o sistema a partir daqui:

- **Linhas de venda/orçamento/impressão** = `WHERE item_pai_id IS NULL` (pais e itens nunca
  expandidos; nunca filhos).
- **Linhas de produção/conferência/entrega** = `WHERE NOT (item_pai_id IS NULL AND expandido =
  true)` (tudo exceto pais já expandidos — inclui itens nunca expandidos e todos os filhos).

## Fluxo de expansão

Nova função em `pedidoItemService` (ou dentro de `agendamentoService.js`), `explodirEmUnidades(pedidoItemId, empresaId)`:

1. Busca o item e sua categoria. Se `!categoria.necessita_conferencia || quantidade <= 1`, retorna
   `[item]` sem alterar nada (comportamento atual preservado).
2. Se `item.expandido === true`, retorna os filhos já existentes (`WHERE item_pai_id = $1 ORDER BY
   numero_unidade`) — **idempotente**, cobre reagendamento após cancelamento.
3. Caso contrário, dentro de uma transação: cria `quantidade` filhos (`numero_unidade` 1..N,
   `total_unidades = N`), marca o pai `expandido = true`, retorna os filhos criados.

Ponto de disparo: `agendamentoService.js:251`, na criação dos `agendamento_itens` do agendamento de
Conferência. Antes do `INSERT INTO agendamento_itens (...)` por item selecionado, chama
`explodirEmUnidades` para cada `pedido_item_id`; insere um `agendamento_itens` por filho retornado
(em vez de um por item original quando há expansão).

A partir daí, a lista de itens do agendamento (`GET /agendamentos/:id/conferencia-itens`, consumida
por `Agendamentos.jsx:2825`) já mostra "Unidade 1 de 2" / "Unidade 2 de 2" como duas entradas
distintas — rótulo derivado de `numero_unidade`/`total_unidades`, concatenado à `descricao`
existente (ex.: `"${descricao} — Unidade ${numero_unidade} de ${total_unidades}"`). Cada entrada
abre sua própria Ficha de Conferência Técnica via `abrirOsDoItem`, sem nenhuma mudança nesse
utilitário.

## Impacto por tela/serviço

Etapas posteriores já operam por `pedido_item_id`/`JOIN pedido_itens`; passam a listar os filhos
automaticamente desde que apliquem o filtro "produção" (exclua pais expandidos). Pontos a ajustar:

- **`dashboardService.js`**: cálculo de etapa/progresso do pedido, listagem de itens do pedido
  (linha ~507), contagem total de itens (linha ~552), e todos os `JOIN`/`SELECT` usados para
  `calcularEtapaAtual`/`listarPedidosDashboard`/`buscarFluxoPedido` que hoje fazem
  `FROM pedido_itens` sem esse filtro (~10 pontos identificados nas linhas 195–664) — aplicar o
  filtro de produção.
- **Conferência do Produto** (`pedidosRoutes.js:714`, `EtapaConferenciaProduto.jsx`): listagem de
  itens para exibir/marcar `produto_ok` — aplicar filtro de produção.
- **Separação** (`EtapaSeparacao.jsx` + rota correspondente) e **Entrega**
  (`EtapaEntrega.jsx` + rota correspondente): mesma alteração.
- **Venda/Orçamento** (`EditarPedido.jsx`, `PedidoPrint.jsx`): aplicar filtro de venda
  (`item_pai_id IS NULL`) explicitamente onde a query hoje só filtra por `pedido_id`, para garantir
  que filhos nunca apareçam ali mesmo que a query original não tivesse ordenação/filtro adicional.
- **Fotos por Ambiente** (`agendamentoService.js:769-785`, `AgendamentoDetalhe.jsx:398-402`):
  nenhuma mudança — `DISTINCT ambiente`/`new Set(...)` já deduplicam corretamente porque os filhos
  herdam o mesmo `ambiente` do pai.
- **Importação de PDF** (`ImportarPedidoModal.jsx`): nenhuma mudança — expansão só acontece depois,
  no agendamento de Conferência.

## Casos de borda

- **Editar `quantidade` depois de expandido**: bloquear no formulário de edição do item
  (`EditarPedido.jsx`) com aviso, quando `expandido = true` — mudar quantidade depois de já existir
  produção por unidade não é suportado nesta versão; precisa de tratamento manual.
- **Excluir o item pai**: cascateia para os filhos via `ON DELETE CASCADE` em `item_pai_id`; cada
  filho segue a mesma rotina de limpeza de OS/agendamento que já existe hoje para qualquer exclusão
  de item.
- **Cancelar o agendamento de Conferência antes de confirmar**: filhos continuam existindo, órfãos
  de agendamento; um novo agendamento de Conferência para o mesmo item reaproveita os filhos
  existentes (passo 2 da expansão).
- **Item cuja categoria muda para `necessita_conferencia = true` depois do pedido criado**: sem
  tratamento especial — a expansão usa o estado da categoria no momento em que o agendamento de
  Conferência é criado, então passa a valer a partir do próximo agendamento.

## Migrations necessárias

- `pedido_itens`: `item_pai_id`, `numero_unidade`, `total_unidades`, `expandido` (ver seção
  "Modelo de dados"). Aplicar nos dois bancos (local + Supabase), seguindo o padrão de
  [[project_db_local_vs_supabase]].

## Plano de testes

Automatizados (backend):

- `explodirEmUnidades`: não faz nada quando categoria não exige conferência ou `quantidade <= 1`;
  cria N filhos corretos na primeira chamada; é idempotente (segunda chamada não duplica);
  `ON DELETE CASCADE` remove filhos ao excluir o pai.
- Criação de agendamento de Conferência com item de `quantidade > 1` em categoria que exige
  conferência gera N `agendamento_itens` (um por filho), não um.
- `ordem_servico`: cada filho consegue ter sua própria OS/`dados_tecnicos` independente
  (regressão do `UNIQUE INDEX` já existente, agora exercitado com múltiplos `pedido_item_id`
  irmãos).
- Filtro de produção exclui pai expandido e inclui filhos em: cálculo de etapa do dashboard,
  listagem de itens do pedido, Conferência do Produto, Separação, Entrega.
- Filtro de venda (`EditarPedido`, impressão do pedido) mostra só o pai, com `quantidade`/`valor`
  originais, mesmo depois de expandido.
- Fotos por Ambiente: item expandido em 2 unidades no mesmo ambiente continua exigindo só 1 foto.

Manual (navegador, sem ferramenta de screenshot neste ambiente — fica pendente como de costume):

- Pedido com item de persiana `quantidade = 2` em categoria `necessita_conferencia`: agendar
  Conferência, abrir a lista de itens do agendamento e confirmar 2 entradas "Unidade 1 de 2"/"Unidade
  2 de 2", preencher medida técnica diferente em cada uma, seguir até Conferência do Produto/
  Separação/Entrega confirmando que cada unidade tem status independente.
- Tela de Pedido (venda) e impressão do pedido continuam mostrando 1 linha com quantidade 2.
- Fotos por Ambiente segue pedindo 1 foto só para o ambiente com as 2 unidades.
