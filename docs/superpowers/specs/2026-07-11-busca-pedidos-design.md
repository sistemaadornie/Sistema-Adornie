# Busca na tela de Pedidos — Design

## Objetivo
Adicionar uma barra de pesquisa na tela `Pedidos` (`frontend-web/src/pages/pedidos/Pedidos.jsx`) que permita buscar pedidos por:
- Nome do cliente
- Número do pedido (origem importado ou sequencial interno)
- Nome do arquiteto vinculado ao pedido

## Comportamento
- A busca é feita no servidor (nova consulta à API a cada termo digitado, com debounce de ~350ms para não disparar uma requisição por tecla).
- A busca combina (AND) com os filtros já existentes na tela (chip de status/atraso e select de consultora). Ex.: filtrar "Concluído" + buscar "João" retorna só pedidos concluídos cujo cliente/número/arquiteto batem com "João".
- O filtro de etapa (`etapaFiltro`) continua sendo aplicado no cliente, como já é hoje, sobre o resultado vindo do servidor.
- Campo de texto com placeholder "Buscar por cliente, número do pedido ou arquiteto..." e botão de limpar (×) quando há texto digitado.
- Não exibe o nome do arquiteto nos cards — a busca por arquiteto é possível, mas o dado não é mostrado (fora do escopo pedido).

## Backend

### `backend/src/routes/dashboardRoutes.js`
Adicionar `busca: req.query.busca || null` ao objeto `filtros` passado para `listarPedidosDashboard`.

### `backend/src/services/dashboardService.js` — `listarPedidosDashboard`
Aceitar `busca` em `filtros`. Quando presente, adicionar à cláusula `WHERE` (mesmo padrão `ILIKE` já usado em `pedidoService.js` e `agendamentoService.js`, sem `unaccent`):

```sql
(
  c.nome ILIKE $N
  OR p.numero_origem ILIKE $N
  OR p.numero_sequencial::text ILIKE $N
  OR EXISTS (
    SELECT 1 FROM arquitetos arq
    WHERE arq.id = p.arquiteto_id AND arq.nome ILIKE $N
  )
)
```

`c` (clientes) já está `LEFT JOIN`ado na query atual — não é necessário alterar `GROUP BY` nem adicionar novo `JOIN`, o `EXISTS` cobre o arquiteto sem afetar a agregação.

## Frontend

### `frontend-web/src/pages/pedidos/hooks/usePedidos.js`
`carregar(filtros)` passa a aceitar `filtros.busca` e incluir `busca` no `URLSearchParams` quando presente.

### `frontend-web/src/pages/pedidos/Pedidos.jsx`
- Novo estado `busca` (string).
- Função única `buildFiltros()` que monta o objeto de filtros a partir do estado atual (`filtroAtivo`, `consultoraFiltro`, `busca`) — reusada por `handleFiltro`, pelo `onChange` do select de consultora e pelo efeito de busca, para garantir que os filtros sempre se combinem (AND) corretamente.
- `useEffect` com debounce (~350ms) que dispara `carregar(buildFiltros())` quando `busca` muda.
- Novo input de texto renderizado entre o header e os chips de status, com botão de limpar quando `busca` não está vazio.

### `frontend-web/src/pages/pedidos/Pedidos.css`
Novas classes para o campo de busca (`dp-busca-wrap`, `dp-busca-input`, `dp-busca-limpar` ou nomes equivalentes), seguindo o tema escuro já usado em `.dp-select-consultora`.

## Testes
- Backend: teste em `dashboardGestorService.test.js` (ou novo teste dedicado) cobrindo busca por cliente, por número (origem e sequencial) e por arquiteto.
- Frontend: verificação manual no navegador (build/lint automatizado não cobre comportamento de UI de busca).

## Fora do escopo
- Não exibir nome do arquiteto nos cards de pedido.
- Não paginar a listagem de pedidos (segue carregando lista completa filtrada, como hoje).
