# Fluxograma de Pedido — 5 Etapas + Ficha de Conferência

**Data:** 2026-06-08
**Status:** Aprovado pelo usuário

---

## Objetivo

Redesenhar a tela `/pedidos/:id/fluxo` como um **canvas panável** (mecânica de mapa) exibindo 5 etapas sequenciais com cards visuais estilizados. Cada etapa possui critérios claros de conclusão, painel de interação próprio, e compatibilidade com os dois temas do sistema (dark/light).

Criar a funcionalidade de **agendamento de conferências por item** (herdeiros do genitor de instalação) e a **ficha de conferência técnica** item a item, integradas ao fluxo da etapa 2.

---

## As 5 Etapas

| # | Nome | Conclui quando |
|---|---|---|
| 1 | Dados do Pedido | `verificacao_ok` + todos itens com categoria + todos com vínculo + todos cobertos por genitor |
| 2 | Conferência de Medidas | Todos os itens do pedido têm `conferencia_itens.status = 'conferido'` |
| 3 | Produção | Todos itens com `em_confeccao = true` têm `confeccao_ok = true` (ou nenhum item em confecção) |
| 4 | Agendamento | Ao menos um genitor com `status = 'agendado'` e equipe atribuída |
| 5 | Pós-venda | `pedidos.status = 'concluido'` |

**Gating:** sequencial — etapa N só fica acessível quando N-1 está concluída. Exceção: itens sem `em_confeccao` passam automaticamente pela etapa 3.

---

## Arquitetura

### Abordagem: Canvas orquestrado + componente por etapa (Abordagem B)

`PedidoFluxo.jsx` torna-se um orquestrador leve. O canvas e cada etapa ganham componentes próprios.

### Estrutura de arquivos (frontend)

```
src/pages/pedidos/
  PedidoFluxo.jsx                  ← orquestrador (~200 linhas): carrega dados, gerencia etapa aberta
  PedidoFluxo.css                  ← variáveis CSS dark/light, layout canvas
  fluxo/
    FluxogramaCanvas.jsx           ← canvas panável: dot grid, drag, centralização na etapa ativa
    EtapaCard.jsx                  ← card reutilizável (concluído / ativo / pendente)
    etapas/
      EtapaDadosPedido.jsx         ← painel modal etapa 1
      EtapaConferencia.jsx         ← painel modal etapa 2
      EtapaProducao.jsx            ← painel modal etapa 3
      EtapaAgendamento.jsx         ← painel modal etapa 4
      EtapaPosvenda.jsx            ← painel modal etapa 5

src/pages/agendamentos/
  FichaConferencia.jsx             ← fluxo item-a-item de conferência técnica
  FichaConferencia.css
```

### Rota
`/pedidos/:id/fluxo` — sem mudança de rota. Apenas o conteúdo do componente é substituído.

---

## Canvas Visual

### Comportamento do canvas
- Fundo preto (`#0d0d0d` no dark, `#f0f4f8` no light) com grade de pontos via `background-image: radial-gradient`
- Drag/pan via `mousedown + mousemove` usando `useRef` para o offset — sem React state durante o movimento (mesmo padrão do calendário de agendamentos, evita re-renders)
- Na abertura: canvas centraliza automaticamente na etapa com `ativo = true` calculando o offset do card ativo via `getBoundingClientRect`
- Clicar num card chama `onEtapaClick(numero)` no orquestrador → abre o painel da etapa como modal sobreposto

### Estados visuais dos cards

| Estado | Borda | Background | Efeito |
|---|---|---|---|
| Concluída | `#0d9488` (teal) | tom esverdeado | sombra sutil |
| Ativa | `#f59e0b` (âmbar) | tom amarelado | glow pulsante via `@keyframes` |
| Pendente | `#1e293b` | base escura | opacidade 55% |

### Conteúdo de cada card
- Número da etapa (ou ✓ quando concluída)
- Ícone representativo
- Título em caixa alta
- Label de status (`Concluído / Em andamento X de Y / Aguardando`)
- Barra de progresso (apenas no card ativo)
- Lista de sub-itens com ícone por estado (✓ feito, ○ pendente, · bloqueado)

### Compatibilidade de temas
Todas as cores declaradas como variáveis CSS em `PedidoFluxo.css`:

```css
:root[data-theme="dark"]  { --pf-bg-canvas: #0d0d0d; --pf-dot: #1e293b; ... }
:root[data-theme="light"] { --pf-bg-canvas: #f0f4f8; --pf-dot: #cbd5e1; ... }
```

O tema já é aplicado globalmente pelo sistema — os cards herdam automaticamente.

---

## Modelo de Dados

### Novas colunas em `pedido_itens`

```sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS em_confeccao  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confeccao_ok  BOOLEAN NOT NULL DEFAULT false;
```

### Nova tabela: `conferencia_itens`

```sql
CREATE TABLE conferencia_itens (
  id                SERIAL PRIMARY KEY,
  agendamento_id    INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  empresa_id        INTEGER NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pendente',
    -- 'pendente' | 'conferido' | 'reprovado'
  observacoes       TEXT,
  dados             JSONB,   -- largura_real, altura_real, resultado, campos livres
  conferido_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  conferido_em      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id, pedido_item_id)
);

CREATE INDEX idx_ci_agendamento  ON conferencia_itens(agendamento_id);
CREATE INDEX idx_ci_pedido_item  ON conferencia_itens(pedido_item_id);
```

### Sem campo `etapa_atual` no banco

A etapa atual é **calculada** pelo endpoint `/pedidos/:id/fluxo` a partir dos dados existentes — nenhum campo extra em `pedidos`.

---

## Comportamento de Cada Etapa

### Etapa 1 — Dados do Pedido

**Card sub-itens:**
1. Importação do Pedido (pdf existe em `pedido_anexos`)
2. Anexo do PDF original (`pedido.tem_anexo_pdf`)
3. Data de entrega definida (ao menos um genitor existe com itens vinculados)
4. Todos os itens agendados (cada `pedido_item` coberto por `agendamento_itens.pedido_item_id`)

**Painel (modal):**
- Sub-abas: Geral (edição), Itens (categoria + vínculo), Pagamentos
- Seção **Pré-agendamentos**: lista genitores criados + itens cobertos por cada um. Botão "📅 Agendar Instalação" (já existente via `ModalSelecionarItensInstalacao`) para criar novos genitores. Badge por item indicando se está coberto ou não.

**Conclusão:** quando os 4 critérios são satisfeitos simultaneamente → `verificacao_ok = true` gravado automaticamente → card fica verde.

> **Mudança em relação ao sistema atual:** `verificacao_ok` era gravado manualmente via botão "Salvar". No novo design passa a ser calculado e gravado automaticamente pelo backend sempre que os 4 critérios forem atendidos (ao salvar o pedido ou ao criar um genitor).

---

### Etapa 2 — Conferência de Medidas

**Pré-requisito:** etapa 1 concluída. Requer que ao menos um genitor exista (criado na etapa 1).

**Card sub-itens:**
1. Conferências agendadas por item
2. Fichas de conferência preenchidas (`X de Y itens conferidos`)

**Painel:**
- Lista os genitores. Por genitor: botão **"Agendar Conferência"** → reutiliza `ModalSelecionarItensInstalacao` com `tipo = 'Conferência'` → cria herdeiro (`agendamento_pai_id = genitor.id`) com os itens selecionados. O modal usará novo endpoint `GET /pedidos/:id/itens-disponiveis-conferencia?genitor_id=X` que retorna apenas os itens do genitor que ainda não têm conferência `status = 'conferido'`
- Lista os agendamentos de conferência (herdeiros) com status e botão **"Preencher Ficha"** → abre `FichaConferencia.jsx`
- Badge por item: `Pendente / Conferido / Reprovado`

**Conclusão:** todos os `pedido_itens` do pedido têm ao menos um registro em `conferencia_itens` com `status = 'conferido'`.

---

### Etapa 3 — Produção

**Pré-requisito:** etapa 2 concluída.

**Card sub-itens:**
1. Itens em confecção marcados
2. Produção concluída

**Painel:**
- Lista todos os itens do pedido
- Checkbox **"Em confecção"** por item → grava `em_confeccao = true` via `PATCH /pedidos/:id/producao-itens`
- Itens com `em_confeccao = true` exibem checkbox adicional **"Produção concluída"** → grava `confeccao_ok = true`
- Itens com `em_confeccao = false` exibem badge **"Fornecedor — pronto"** e não bloqueiam a etapa

**Conclusão:** todos os itens com `em_confeccao = true` têm `confeccao_ok = true`. Se nenhum item tiver `em_confeccao = true`, a etapa é concluída automaticamente.

---

### Etapa 4 — Agendamento

**Pré-requisito:** etapa 3 concluída.

**Card sub-itens:**
1. Cliente contatado e data confirmada
2. Equipe e veículos atribuídos

**Painel:**
- Exibe o(s) genitor(es) com data pré-agendada
- **Passo 1:** Checkbox **"Cliente contatado — data confirmada"** → `PATCH /agendamentos/:id/confirmar-cliente` → status muda para `agendado`
- **Passo 2** (liberado após passo 1): botão **"Atribuir equipe e veículos"** → navega para a tela do mapa (fluxo existente) passando `agendamento_id`

**Conclusão:** ao menos um genitor com `status = 'agendado'` e `equipe.length > 0`.

---

### Etapa 5 — Pós-venda

**Pré-requisito:** etapa 4 concluída.

**Card sub-itens:**
1. Pesquisa de satisfação preenchida
2. Pedido encerrado

**Painel:**
- Campo de texto **"O que o cliente achou?"**
- Botão **"Encerrar Pedido"** — habilitado somente após preencher o campo → `POST /pedidos/:id/pesquisa-satisfacao` → grava texto + `pedidos.status = 'concluido'`

**Conclusão:** `pedidos.status = 'concluido'`.

---

## Ficha de Conferência (FichaConferencia.jsx)

### Acesso
Modal aberto a partir do painel da Etapa 2 clicando em **"Preencher Ficha"** num agendamento de conferência.

### Fluxo

```
Abrir ficha
    ↓
Lista dos itens do agendamento com badges (Pendente / Conferido / Reprovado)
    ↓
Clicar num item → formulário de conferência
    ↓
Preencher campos → Salvar → POST /agendamentos/:id/conferencia-itens (upsert)
    ↓
Badge do item atualiza → voltar para lista
    ↓
Repetir até todos conferidos
    ↓
Toast "Todos os itens conferidos!" → modal fecha automaticamente
```

### Campos do formulário por item

| Campo | Tipo | Obrigatório |
|---|---|---|
| Largura real | Número | Não |
| Altura real | Número | Não |
| Observações técnicas | Texto livre | Não |
| Resultado | Select: Aprovado / Reprovado | **Sim** |

`Aprovado` → `status = 'conferido'` · `Reprovado` → `status = 'reprovado'` (registra sem bloquear o fluxo nesta versão)

### Navegação
- Botões **"← Anterior"** / **"Próximo →"** navegam entre itens sem fechar o modal
- Barra de progresso no topo: `Conferido X de Y`
- Botão **"Fechar"** sempre disponível — progresso parcial salvo

### Efeito na Etapa 2
Ao fechar a ficha, o painel da Etapa 2 re-busca os dados. Se todos os itens de todos os agendamentos de conferência estiverem `conferido`, a etapa 2 conclui e o card fica verde no canvas.

---

## Endpoints Backend

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/pedidos/:id/fluxo` | Estender com dados das 5 etapas + `etapa_atual` calculado |
| `GET` | `/pedidos/:id/itens-disponiveis-conferencia` | Itens do genitor ainda sem conferência `conferido` (para o modal de agendamento) |
| `GET` | `/agendamentos/:id/conferencia-itens` | Lista itens + status de conferência |
| `POST` | `/agendamentos/:id/conferencia-itens` | Upsert ficha de um item em `conferencia_itens` |
| `PATCH` | `/pedidos/:id/producao-itens` | Atualiza `em_confeccao` / `confeccao_ok` de um item |
| `PATCH` | `/agendamentos/:id/confirmar-cliente` | Muda status do agendamento para `agendado` |
| `POST` | `/pedidos/:id/pesquisa-satisfacao` | Salva pesquisa + encerra pedido (`status = 'concluido'`) |

---

## Migration SQL

Arquivo: `backend/src/database/migrations/fluxo_5_etapas.sql`

```sql
-- Etapa 3: controle de confecção por item
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS em_confeccao  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confeccao_ok  BOOLEAN NOT NULL DEFAULT false;

-- Etapa 2: ficha de conferência técnica
CREATE TABLE IF NOT EXISTS conferencia_itens (
  id                SERIAL PRIMARY KEY,
  agendamento_id    INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  empresa_id        INTEGER NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pendente',
  observacoes       TEXT,
  dados             JSONB,
  conferido_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  conferido_em      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id, pedido_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_agendamento ON conferencia_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ci_pedido_item ON conferencia_itens(pedido_item_id);
```

---

## Arquivos Afetados

### Frontend — Substituir/reescrever
- `src/pages/pedidos/PedidoFluxo.jsx` — orquestrador novo
- `src/pages/pedidos/PedidoFluxo.css` — variáveis de tema + canvas

### Frontend — Criar
- `src/pages/pedidos/fluxo/FluxogramaCanvas.jsx`
- `src/pages/pedidos/fluxo/EtapaCard.jsx`
- `src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
- `src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`
- `src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx`
- `src/pages/pedidos/fluxo/etapas/EtapaAgendamento.jsx`
- `src/pages/pedidos/fluxo/etapas/EtapaPosvenda.jsx`
- `src/pages/agendamentos/FichaConferencia.jsx`
- `src/pages/agendamentos/FichaConferencia.css`

### Frontend — Manter/reaproveitar
- `src/pages/pedidos/ModalSelecionarItensInstalacao.jsx` — reutilizado na etapa 2 com `tipo = 'Conferência'`
- Todos os sub-componentes de edição de pedido (formulários, tabelas de itens, pagamentos)

### Backend — Criar
- `backend/src/database/migrations/fluxo_5_etapas.sql`
- `backend/src/routes/conferenciaRoutes.js` (ou adicionar em `pedidosRoutes.js` / `agendamentosRoutes.js`)

### Backend — Modificar
- `backend/src/services/pedidoService.js` — cálculo das 5 etapas + `etapa_atual` + novos endpoints
- `backend/src/services/agendamentoService.js` — `confirmar-cliente`, leitura de `conferencia_itens`
- `backend/src/routes/pedidosRoutes.js` — novos endpoints de produção e pós-venda
- `backend/src/routes/agendamentosRoutes.js` — endpoints de conferencia-itens e confirmar-cliente
