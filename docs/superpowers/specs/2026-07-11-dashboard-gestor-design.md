# Dashboard do Gestor — Design

## Objetivo

Implementar o protótipo "Dashboard Adornie" (criado em claude.ai/design, projeto `Dashboard inovador Adornie`) como uma página real do sistema, com dados 100% reais do backend (sem mocks), integrada ao design system existente (tema dark/dourado, `Cormorant Garamond`/`Jost`).

Painel de visão geral para gestores: KPIs do mês, mapa de distribuição de clientes por bairro/cidade, funil de produção (8 etapas), alertas de prazo, agenda da semana e faturamento por consultora — todos filtráveis por período, consultora e cidade.

## Fora de escopo

- Geocodificação real de endereços / mapa geográfico de verdade (Leaflet/Mapbox). O "mapa" usa coordenadas x/y curadas para bairros/cidades conhecidos, no mesmo estilo visual do protótipo.
- Edição de dados a partir do dashboard — é somente leitura.
- Mudar o tema claro/escuro do resto do sistema. A página usa os tokens do tema atual (dark/dourado), não a paleta clara do protótipo original.

## Arquitetura

**Backend** (novo):
- `backend/src/services/dashboardGestorService.js` — lógica de agregação.
- `backend/src/routes/dashboardGestorRoutes.js` — monta em `/api/dashboard-gestor`, `authMiddleware` + `permissionMiddleware(["ADMIN_MASTER","OPERADOR_AGENDA"])` (mesmo gate do `relatoriosRoutes.js`).
- Registrar a rota em `backend/src/api.js` (ou onde as demais rotas são montadas — seguir o padrão de `relatoriosRoutes`).

**Frontend** (novo):
- `frontend-web/src/pages/Dashboard.jsx` + `Dashboard.css`.
- Rota `/dashboard` em `App.jsx`, dentro de `<PermissionRoute perms={["ADMIN_MASTER","OPERADOR_AGENDA"]}>`.
- Item de navegação "Dashboard" em `Sidebar.jsx`, seção "Geral" (ao lado de "Início"), ícone `FaChartLine` ou similar, condicionado a `temPerm(user, "ADMIN_MASTER","OPERADOR_AGENDA")`.
- `Home.jsx` não muda.

## Convenção de filtros

Todos os endpoints de dados aceitam os mesmos query params opcionais:
- `periodo`: `mes` | `trimestre` | `ano` (default `mes`) — bucketa por `pedidos.data_pedido`, com **limites de calendário**: `mes` = do dia 1 do mês atual até hoje; `trimestre` = do início do trimestre civil atual (Jan/Abr/Jul/Out) até hoje; `ano` = do dia 1 de janeiro até hoje.
- `consultora_id`: filtra por `pedidos.consultor_id`.
- `cidade`: filtra por `pedidos.cidade` (igualdade exata, case-insensitive — `LOWER(pedidos.cidade) = LOWER($x)`). As opções do select vêm do endpoint 0 (`/filtros`), então só existem valores que já ocorrem em `pedidos.cidade` — sem risco de digitação livre gerando resultado vazio.

**Comparação com período anterior** (usado em `deltaPct`/`deltaAbs`): o período imediatamente anterior de mesmo tipo civil — mês anterior completo, trimestre civil anterior completo, ou ano anterior completo (não truncado no mesmo dia-do-período; comparação é total-a-data-atual vs. total do período civil anterior inteiro). Ex.: hoje é 11/jul/2026, `periodo=mes` → atual = 01–11/jul/2026, anterior = 01–30/jun/2026 (mês completo).

Pedidos com `status = 'cancelado'` são excluídos de todos os agregados de faturamento/contagem (KPIs, funil, mapa, ranking de consultoras), mas **alertas de prazo** já naturalmente os exclui pois `nivel_alerta` só existe para pedidos com pré-agendamento futuro pendente.

## Endpoints

### 0. `GET /api/dashboard-gestor/filtros`
```json
{ "consultoras": [{ "id": 12, "nome": "Marina Alencar" }], "cidades": ["Curitiba", "Balneário Camboriú"] }
```
Sem filtros de período/consultora/cidade (é o que populam os próprios selects). `consultoras` = usuários com permissão `COMERCIAL`; `cidades` = `SELECT DISTINCT cidade FROM pedidos WHERE empresa_id = $1 AND cidade IS NOT NULL ORDER BY cidade`. Chamado uma vez ao montar a página, independente dos filtros ativos.

### 1. `GET /api/dashboard-gestor/kpis`
```json
{
  "faturamento": { "valor": 486200.00, "deltaPct": 14.2 },
  "pedidosAtivos": { "valor": 83, "deltaAbs": 9 },
  "prazosEmRisco": { "valor": 7, "deltaAbs": 2 },
  "instalacoesSemana": { "valor": 19 }
}
```
- `faturamento`: `SUM(pedidos.total)` no período (exclui cancelados), `deltaPct` vs. período anterior de igual duração.
- `pedidosAtivos`: `COUNT(*)` de pedidos com `status NOT IN ('concluido','cancelado')`, `deltaAbs` vs. período anterior.
- `prazosEmRisco`: reaproveita `nivel_alerta` (calculado como em `dashboardService.listarPedidosDashboard`), conta os não nulos.
- `instalacoesSemana`: `agendamentos` com `tipo = 'Instalação'`, `data` entre hoje e hoje+7, `status NOT IN ('cancelado','rejeitado')`.

### 2. `GET /api/dashboard-gestor/funil`
```json
{
  "totalAtivos": 83,
  "etapas": [
    { "numero": 1, "nome": "Verificação", "count": 12, "gargalo": false },
    { "numero": 3, "nome": "Confecção", "count": 23, "gargalo": true }
  ]
}
```
- Reaproveita a mesma lógica de `calcularEtapaAtual` de `dashboardService.js` (extrair para módulo compartilhado ou importar direto — ver "Reuso" abaixo) para classificar cada pedido ativo (exclui `concluido` e `cancelado`) em uma etapa 1–8, aplica os filtros de período/consultora/cidade, agrupa por `etapa_atual`.
- **Gargalo**: não há dado histórico de "tempo médio por etapa" no schema atual, então a definição adotada é simples e objetiva — a etapa (entre as 8) com o maior `count` absoluto de pedidos parados nela é marcada `gargalo: true` (exatamente uma etapa, a de maior contagem; em empate, a de menor número). Etapas com `count: 0` nunca são gargalo.
- Endpoint de detalhe por etapa: `GET /api/dashboard-gestor/funil/:numero` retorna `{ nome, descricao, count, responsavel, exemplos: [{numero_sequencial, cliente_nome}] }` (até 5 exemplos), usando um dicionário estático nome/descrição/responsável por etapa (mesmo texto do protótipo, ajustável).

### 3. `GET /api/dashboard-gestor/alertas`
```json
{ "total": 7, "alertas": [
  { "numeroPedido": "#1042", "cliente": "Ap. Batel — Regina", "cidade": "Curitiba",
    "etapa": "Confecção", "consultora": "Marina Alencar", "diasParaPrazo": -3, "nivel": "atrasado" }
] }
```
- Fonte: mesmo cálculo de `nivel_alerta`/`dias_para_prazo` de `dashboardService.js`, aplicando os filtros. Ordenado por `dias_para_prazo` crescente (mais atrasado primeiro). Limite de 20 itens.

### 4. `GET /api/dashboard-gestor/mapa?modo=bairros|cidades`
```json
{ "regioes": [
  { "id": "batel", "nome": "Batel", "clientes": 42, "pedidosAtivos": 8, "atendimentos": 210,
    "categoriaPredominante": "Cortinas", "mix": [{"categoria":"Cortinas","pct":58}, ...],
    "faturamento": 1240000, "pedidosLista": [{"numero":"#1042","etapa":"Confecção"}] },
  { "id": "outros", "nome": "Outros", "clientes": 5, ... }
] }
```
- Agrupa por `pedidos.bairro` (quando `modo=bairros`, implicitamente restrito a `pedidos.cidade = 'Curitiba'` como no protótipo) ou `pedidos.cidade` (quando `modo=cidades`).
- `clientes`: `COUNT(DISTINCT pedidos.cliente_id)`. `pedidosAtivos`: pedidos não concluídos/cancelados. `atendimentos`: `COUNT(*)` de `agendamentos` concluídos vinculados a esses pedidos. `categoriaPredominante`/`mix`: via `pedido_itens → categorias`, top 3 categorias por contagem de itens. `faturamento`: `SUM(pedidos.total)`.
- Bairros/cidades fora da lista curada de coordenadas (arquivo `frontend-web/src/utils/mapaCoordenadas.js`, com x/y para os bairros/cidades atendidos) somam num registro `id: "outros"` — o front usa uma posição fixa para ele.

### 5. `GET /api/dashboard-gestor/agenda-semana`
```json
{ "compromissos": [
  { "data": "2026-07-15", "hora": "09:00", "tipo": "Conferência", "cliente": "Ap. Batel — Sra. Regina",
    "local": "Batel, Curitiba", "equipe": "Equipe A", "veiculo": "Fiorino I" }
] }
```
- `agendamentos` dos próximos 7 dias (a partir de hoje), `status NOT IN ('cancelado','rejeitado')`, com `agendamento_equipe` (nomes agregados) e veículo via `crew_agendamentos → crews.veiculo_id → veiculos.nome`. Quando não há crew associada, `veiculo: null`. Ordenado por `data, hora`. Filtro `cidade`/`consultora_id` aplicado via o pedido vinculado ao agendamento (quando houver `pedido_id`); agendamentos sem pedido vinculado são incluídos apenas quando nenhum filtro de cidade/consultora está ativo.

### 6. `GET /api/dashboard-gestor/consultoras`
```json
{ "totalMes": 486200.00, "consultoras": [
  { "id": 12, "nome": "Marina Alencar", "valor": 128000.00, "deltaPct": 18.4 }
] }
```
- Base: usuários com permissão `COMERCIAL` (`usuario_permissoes` join, mesma checagem de `isComercialPuro`/permissões — aqui não precisa ser "puro", só ter `COMERCIAL`). `LEFT JOIN` com `SUM(pedidos.total)` no período (pedidos não cancelados), aparecem com `valor: 0` se não venderam. `deltaPct` vs. período anterior. Ordenado por `valor` desc. Respeita filtro `cidade` (soma só pedidos daquela cidade); ignora o próprio `consultora_id` como filtro (não faz sentido filtrar consultora dentro do card que já é por consultora).

## Reuso de `dashboardService.js`

`calcularEtapaAtual` já é exportado — reaproveitar diretamente. A parte de cálculo de `nivel_alerta`/`dias_para_prazo` por pedido está inline dentro de `listarPedidosDashboard` (não é uma função isolada); extrair essa lógica de "próximo prazo + nível de alerta" para uma função exportável (`calcularPrazoEAlerta(preAgendamentos)`) dentro de `dashboardService.js`, para não duplicar em `dashboardGestorService.js`. Isso é um pequeno refactor incluído no escopo.

## Frontend — estrutura de componentes

`Dashboard.jsx` (componente único de página, como `Relatorios.jsx`):
- Estado: `periodo`, `consultoraId`, `cidade` (filtros, disparam refetch dos endpoints 1–6); `/filtros` (endpoint 0) é buscado uma única vez ao montar.
- Sub-seções, cada uma com seu próprio loading/empty state (padrão `Skeleton`/`Empty` de `Relatorios.jsx`):
  1. **Header + filtros**: `.ek-head` com título "Dashboard" + `.rel-periodo-group` (Mês/Trimestre/Ano) + dois `.ek-select` (Consultora, Cidade, populados pelo endpoint `/filtros`) + botão "Limpar filtros" (reaproveita `.rel-limpar-filtros`).
  2. **KPIs**: `.rel-kpis` com 4 `.rel-kpi` (reaproveita `KpiCard`-like markup de `Relatorios.jsx`), estendido com um pill de delta (`+14%`/`+9`) ao lado do `sub`, no mesmo estilo do `rel-badge`.
  3. **Mapa + Alertas** (grid 1.55fr/1fr): mapa é o único componente com CSS novo pesado — nós posicionados via `left/top %` (coordenadas curadas), clique abre painel de detalhe da região (mix de categorias, pedidos em andamento, faturamento). Alertas é uma lista simples reaproveitando `.rel-table` ou lista customizada leve com `.ek-badge` para o nível.
  4. **Funil**: 8 cards horizontais com barra de progresso e chevron entre eles (CSS novo), clique numa etapa carrega o detalhe (`GET /funil/:numero`) numa área abaixo.
  5. **Agenda da semana + Faturamento por consultora** (grid 1fr/1fr): agenda é lista de linhas (hora/tipo/cliente/equipe+veículo); consultoras é lista com avatar circular (iniciais) + barra de progresso proporcional ao maior valor.
- Sem "drag/click-away overlay" complexo do protótipo (era só para fechar dropdowns) — usar `<select>` nativos (`.ek-select`) em vez de dropdowns customizados, mais simples e consistente com o resto do sistema.

## Tratamento de erros / estados vazios

Cada seção busca seu endpoint independentemente (`useEffect` separado por seção, como as abas de `Relatorios.jsx`) — falha em um endpoint não derruba o dashboard inteiro, só mostra `Empty`/erro naquela seção.

## Testes

- Backend: `dashboardGestorService.test.js` mockando `db.query` (padrão de `dashboardService.test.js`), cobrindo: cálculo de KPIs com/sem filtro, agrupamento do funil (incluindo detecção de gargalo), exclusão de cancelados, fallback "Outros" no mapa para bairro fora da lista curada, `deltaPct`/`deltaAbs` com período anterior vazio (divisão por zero).
- Frontend: sem testes automatizados novos (o projeto não tem suite de testes de componente para páginas — seguir o padrão existente, que é só teste manual no navegador).

## Permissão

Nenhuma permissão nova — reaproveita `ADMIN_MASTER` e `OPERADOR_AGENDA`, mesmo gate de `/relatorios`.
