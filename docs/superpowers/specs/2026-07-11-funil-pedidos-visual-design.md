# Funil de Pedidos — renome + visual do Fluxo do Pedido — Design

## Objetivo

Na Dashboard do Gestor (`/dashboard`), a seção hoje chamada "Funil de produção · 8 etapas" passa a se chamar **"Funil de Pedidos"** e ganha o mesmo "formato de card" da tela de Fluxo do Pedido (`PedidoFluxo.jsx`/`EtapaCard.jsx`): faixa colorida no topo com círculo numerado, ícone grande no corpo, e conector com seta entre os cards — usando as mesmas cores fixas do protótipo do fluxo (teal/laranja/cinza), em vez dos tokens de tema (dourado) usados no resto da Dashboard.

## Fora de escopo

- Qualquer mudança de backend/endpoints (`/api/dashboard-gestor/funil`, `/funil/:numero`) — dado e contrato continuam iguais.
- Mudança na lógica de detecção de gargalo.
- Mudança nas outras seções da Dashboard (KPIs, mapa, alertas, agenda, consultoras).
- Testes automatizados novos (a página não tem suite de componente; segue o padrão existente de só teste manual no navegador).

## Mudanças

### 1. Renome (`Dashboard.jsx`)

Título da seção (`Dashboard.jsx:387`): "Funil de produção · 8 etapas" → **"Funil de Pedidos"**. Subtítulo dinâmico ("{total} pedidos ativos · clique numa etapa") não muda.

### 2. Estrutura do card do funil

Cada um dos 8 cards (`.dash-funil-card` em `Dashboard.jsx`) passa a ter:

- **Faixa colorida no topo** (header), com círculo numerado (ou "✓"/número) + nome curto da etapa em maiúsculas (nomes atuais do backend continuam: Verificação, Conferência, Confecção, Produto, Agendamento, Separação, Instalação, Concluído — não mudam, só o card muda de visual).
- **Ícone grande centralizado** no corpo do card, abaixo da faixa. Reaproveita o mesmo conjunto de emojis do `EtapaCard.jsx` (`ETAPA_CONFIG`), que alinham 1:1 pelo número da etapa:
  - 1 📋, 2 📐, 3 ⚙️, 4 🔍, 5 📅, 6 📦, 7 🚚, 8 ⭐
- **Contagem** (número grande) abaixo do ícone — já existe hoje, mantém.
- **Nome da etapa** abaixo da contagem — já existe hoje (`rel-kpi-sub`), mantém o texto mas ajusta estilo pra combinar com o novo card.
- **Barra de progresso** proporcional ao maior `count` entre as 8 etapas — já existe hoje (mesma lógica), preenchimento passa a usar a cor teal fixa `#0d9488` (igual ao `.pf-progresso-fill` do fluxo) em vez de `var(--color-primary)`.
- **Conector com seta** (▶) entre os cards, no lugar do `gap` simples atual em `.dash-funil-row` — reaproveita o padrão visual de `.pf-conector`/`.pf-conector::after` do `PedidoFluxo.css` (linha reta + seta `▶` na ponta).

### 3. Cores (cópia exata da paleta do Fluxo do Pedido — cores fixas, não tokens de tema)

- **Etapa selecionada** (`etapaSelecionada === numero`, ao clicar): faixa com `linear-gradient(135deg, #d97706, #f59e0b)` (igual ao estado "ativa" do fluxo), texto branco no header. **Sem animação de pulso** — só a cor sólida (decisão do usuário: aqui é seleção por clique, não uma etapa "aguardando ação", então a animação contínua seria ruído).
- **Demais etapas** (não selecionadas): faixa com `linear-gradient(135deg, #1e293b, #334155)` (igual ao estado "pendente" do fluxo), texto `#94a3b8`. Diferença importante em relação ao fluxo original: **sem `opacity: .6`** no card inteiro — os números aqui são dados reais agregados, não passos futuros de um único pedido, e precisam ficar totalmente legíveis.
- **Badge de "gargalo"**: continua existindo como badge pequeno (texto "gargalo"), sobreposto em qualquer uma das duas faixas acima — não muda de cor por causa do gargalo (mapeamento de estado já definido: só "selecionada vs. resto" muda a cor do header).
- Essas cores (`#d97706`/`#f59e0b`/`#1e293b`/`#334155`/`#0d9488`) ficam hardcoded no CSS da seção do funil (mesmo padrão do `PedidoFluxo.css`, que também hardcoda), não usam `--color-*` tokens — é uma exceção deliberada de paleta só nesta seção, igual a como o `PedidoFluxo.css` já faz.

### 4. Painel de detalhe da etapa (abaixo do funil, ao clicar)

Sem mudança estrutural (mantém grid de descrição/responsável/exemplos). Só o círculo numerado do cabeçalho do detalhe passa a usar a cor laranja de destaque (`#f59e0b`) em vez de `var(--color-primary)`, para consistência com o novo header do card selecionado.

## Arquivos afetados

- `frontend-web/src/pages/Dashboard.jsx` — título da seção, markup dos cards do funil (header/ícone/conector), círculo do painel de detalhe.
- `frontend-web/src/pages/Dashboard.css` — classes `.dash-funil-*` reescritas com o novo formato e paleta; nova classe de conector.

## Testes

Sem testes automatizados novos. Teste manual no navegador: conferir os 8 cards, clique alternando seleção (header muda pra laranja), card com gargalo mostra o badge independente de estar selecionado ou não, responsivo (`max-width: 900px` já existente, cards quebram em 45%).
