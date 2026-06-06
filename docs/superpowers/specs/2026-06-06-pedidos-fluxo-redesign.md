# Redesign: Tela de Pedidos + Fluxo por Etapas

**Data:** 2026-06-06  
**Status:** Aprovado pelo usuário  

---

## Objetivo

Substituir a tela `Pedidos.jsx` (lista + painel de detalhe) pela tela `DashboardPedidos.jsx` (grid de cards) montada na rota `/pedidos`. A tela antiga deixa de existir. O fluxo do pedido (`/pedidos/:id/fluxo`) é completamente redesenhado com 2 etapas em cards grandes horizontais, cada uma abrindo um modal com abas Detalhes e Histórico. Um sistema de auditoria é criado do zero para rastrear toda ação campo a campo.

---

## Arquitetura Geral

### O que é removido
- `frontend-web/src/pages/pedidos/Pedidos.jsx` — deletado
- `frontend-web/src/pages/pedidos/Pedidos.css` — deletado
- Rota `/dashboard-pedidos` — removida do App.jsx e da Sidebar
- Botão "Novo pedido" — removido do sistema (criar pedido deixa de existir)

### Renomeações
- `DashboardPedidos.jsx` → `Pedidos.jsx`
- `DashboardPedidos.css` → `Pedidos.css`
- `useDashboardPedidos.js` → `usePedidos.js`

### Rotas finais
| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/pedidos` | `Pedidos.jsx` (renomeado) | Grid de cards — tela principal |
| `/pedidos/:id/fluxo` | `PedidoFluxo.jsx` (redesenhado) | Fluxo do pedido com 2 etapas |
| `/pedidos/os/:osId` | `OrdemServicoPage.jsx` | Sem alteração |

### Sidebar
- Link "Pedidos" (`/pedidos`) — permanece, sem mudança visual
- Link "Dashboard" (`/dashboard-pedidos`) — removido

---

## Backend: Novas Tabelas e Campos

### Nova tabela: `pedido_auditoria`
```sql
CREATE TABLE pedido_auditoria (
  id            SERIAL PRIMARY KEY,
  pedido_id     INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id    INTEGER NOT NULL,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  etapa         VARCHAR(30) NOT NULL, -- 'dados_pedido' | 'entrega'
  acao          VARCHAR(60) NOT NULL, -- 'importacao', 'edicao', 'pdf_vinculado', 'categoria_definida', 'vinculo_resolvido', 'verificacao_ok', 'pre_agendamento_criado', 'agendamento_concluido'
  descricao     TEXT,                 -- texto legível, ex: "Quantidade item 3: 2 → 3"
  dados_antes   JSONB,
  dados_depois  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pedido_auditoria_pedido ON pedido_auditoria(pedido_id);
CREATE INDEX idx_pedido_auditoria_etapa  ON pedido_auditoria(pedido_id, etapa);
```

### Novo campo: `pedido_itens.sem_vinculo`
```sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS sem_vinculo BOOLEAN NOT NULL DEFAULT false;
```
Quando `true`: o usuário marcou explicitamente que este item não precisa de vínculo. Conta como "vínculo resolvido" para fins de conclusão da etapa 1.

---

## Ciclo de Vida do Status do Pedido

| Status | Quando ocorre |
|--------|--------------|
| `pendente` | Desde a importação até a etapa 1 ser concluída |
| `em_andamento` | Quando o pré-agendamento é marcado (botão na etapa 2) |
| `atrasado` | Calculado: data do pré-agendamento vencida sem conclusão (nivel_alerta, não status no banco) |
| `concluido` | Quando todos os agendamentos genitores e seus herdeiros são concluídos |

---

## Lógica de Conclusão da Etapa 1

Etapa 1 é considerada concluída quando **todas** as condições abaixo são verdadeiras:

1. **`pdf_ok`** — existe pelo menos um anexo em `pedido_anexos` para o pedido
2. **`categorias_ok`** — todos os itens em `pedido_itens` têm `categoria_id IS NOT NULL`
3. **`vinculos_ok`** — todos os itens têm `sem_vinculo = true` OU possuem ao menos um registro em `pedido_item_vinculos`
4. **`verificacao_ok`** — o usuário clicou em "Salvar" no formulário de edição com as 3 condições acima satisfeitas (gravado como `verificacao_ok = true` na tabela `pedidos`)

O sistema **bloqueia** o avanço para a etapa 2 enquanto qualquer item tiver vínculo possível mas não resolvido (nem vinculado, nem marcado como "Nenhum").

---

## Tela `/pedidos` (Pedidos.jsx)

### Header
- Título: "Pedidos de Venda"
- Botão: "↑ Importar pedido" (abre `ImportarPedidoModal`, igual ao atual)
- Toggle visão geral / por consultora (para usuários com `DASHBOARD_PEDIDOS_GERAL`)

### Filtros (chips)
- **Todos** · **Pendente** · **Em andamento** · **Atrasado** · **Concluído**
- Remove: "Cancelados" como filtro

### Grid de cards
- Igual ao atual: número do pedido, cliente, consultora, valor, badge de status/alerta, barra de progresso
- Clicar em um card → navega para `/pedidos/:id/fluxo`

---

## Tela `/pedidos/:id/fluxo` (PedidoFluxo.jsx — redesenhado)

### Header da página
- Botão `← Voltar` → `/pedidos`
- Número do pedido, nome do cliente, consultora, valor total, badge de status

### Fluxo: 2 cards horizontais com seta

```
┌─────────────────────┐        ┌─────────────────────┐
│   DADOS DO PEDIDO   │  ───▶  │       ENTREGA        │
│   (✓ verde / cinza) │        │ (bloqueado / verde)  │
│   User · Data       │        │   User · Data        │
└─────────────────────┘        └─────────────────────┘
```

**Card 1 — "DADOS DO PEDIDO"**
- Verde + ícone ✓ quando etapa 1 concluída
- Cinza pulsante quando é a etapa atual
- Sempre clicável → abre Modal Dados do Pedido

**Card 2 — "ENTREGA"**
- Cinza/opaco enquanto etapa 1 não concluída, mas **sempre clicável** — ao abrir o modal mostra tela de bloqueio com o que falta
- Azul pulsante quando etapa 1 concluída e pré-agendamento ainda não feito
- Verde quando pedido concluído

---

## Modal "Dados do Pedido"

Modal grande (~90% da tela), fecha com X ou Esc.

### Aba: Detalhes
- **Informações gerais**: cliente, CPF/CNPJ, e-mail, consultora, arquiteto, data do pedido, endereço de entrega
- **PDF original**: botão "📄 Abrir PDF" (se existir), ou indicação "Nenhum PDF vinculado"
- **Itens do pedido**: tabela com colunas ambiente, referência, cor, produto, categoria (select inline se editando), medidas, qtde, unidade, preço, total, vínculo (select inline ou badge "Nenhum")
- **Pagamentos**: lista agrupada por forma de pagamento
- **Observações** e **Previsão de entrega**
- **Mídias**: galeria de fotos/vídeos

**Botões de ação (fora do modo edição):**
- ✏ Editar → ativa modo edição inline no próprio modal
- 🖨 Imprimir → abre `PedidoPrint`
- 📋 Gerar OS → para itens de cortina (fluxo atual)
- 📅 Agendar Instalação → fluxo atual
- 🗑 Excluir → confirma e exclui

**Modo edição (inline no modal):**
- Formulário com todos os campos editáveis (igual ao `PedidoModal` atual, mas inline)
- Campo "Vínculo" por item: select de outros itens OU opção "Nenhum (sem vínculo necessário)" → grava `sem_vinculo = true`
- Botão "Salvar": 
  - Se etapa 1 completa (pdf + categorias + vínculos) → grava `verificacao_ok = true`, registra auditoria, fecha modo edição, card 1 fica verde
  - Se etapa 1 incompleta → salva os dados mas mantém etapa 1 pendente, exibe quais condições faltam

### Aba: Histórico (escopo etapa 1)
Eventos exibidos em ordem cronológica descendente:

| Ação | Descrição exibida |
|------|------------------|
| `importacao` | "Leonardo importou o pedido" |
| `pdf_vinculado` | "Leonardo vinculou o PDF original" |
| `edicao` | "Leonardo editou o pedido — Quantidade item 3: `2` → `3`, Cor item 1: `branco` → `offwhite`" |
| `categoria_definida` | "Leonardo definiu categoria do item 2: Cortina" |
| `vinculo_resolvido` | "Leonardo marcou item 4 como sem vínculo" / "Leonardo vinculou item 4 → item 2" |
| `verificacao_ok` | "Leonardo concluiu verificação do pedido" |

Cada entrada mostra: ícone colorido + descrição + usuário + data/hora.

---

## Modal "Entrega"

Modal grande (~90% da tela), fecha com X ou Esc.

### Aba: Detalhes

**Se etapa 1 não concluída:**
- Mensagem de bloqueio: "Conclua a Etapa 1 para avançar"
- Lista do que falta (PDF, categorias pendentes, vínculos não resolvidos)

**Se etapa 1 concluída:**
- Botão "📅 Marcar pré-agendamento" → navega para `/agendamentos` com state (igual ao fluxo atual de `ModalSelecionarItensInstalacao`)
- Ao clicar: status do pedido muda para `em_andamento`, registra auditoria
- Lista de agendamentos do pedido (genitores + herdeiros), cada um com:
  - Tipo, data, status badge
  - Botão para abrir o agendamento (navega para a tela de agendamentos)
- Indicador de conclusão: quando todos genitores + herdeiros `status = 'concluido'` → banner verde "Pedido concluído" + status muda para `concluido`

### Aba: Histórico (escopo etapa 2)

| Ação | Descrição exibida |
|------|------------------|
| `pre_agendamento_criado` | "Leonardo criou pré-agendamento para 12/06/26 (3 itens)" |
| `agendamento_concluido` | "Agendamento de 12/06/26 concluído" |
| `herdeiro_criado` | "Agendamento herdeiro criado a partir de 12/06/26" |
| `pedido_concluido` | "Pedido concluído automaticamente" |

---

## Serviço de Auditoria (Backend)

### Função: `registrarAuditoria(client, dados)`
```js
// dados: { pedido_id, empresa_id, usuario_id, etapa, acao, descricao, dados_antes, dados_depois }
// Deve ser chamada DENTRO da mesma transação da ação principal (mesmo client pg)
```

### Pontos de disparo

| Onde | Ação auditada |
|------|--------------|
| `POST /pedidos/importar` | `importacao` — etapa `dados_pedido` |
| `POST /pedidos/:id/anexo-pdf` | `pdf_vinculado` — etapa `dados_pedido` |
| `PUT /pedidos/:id` | `edicao` — diff campo a campo, etapa `dados_pedido` |
| `PATCH /pedidos/:id/etapa` (verificacao_ok) | `verificacao_ok` — etapa `dados_pedido` |
| `PUT /pedidos/:id` (item com categoria) | `categoria_definida` por item alterado — etapa `dados_pedido` |
| `PUT /pedidos/:id` (item com vínculo/sem_vinculo) | `vinculo_resolvido` por item — etapa `dados_pedido` |
| `POST /agendamentos` (genitor com pedido_id) | `pre_agendamento_criado` — etapa `entrega` + muda status pedido para `em_andamento` |
| `PATCH /agendamentos/:id/status` → concluido | `agendamento_concluido` — etapa `entrega` |
| Auto-conclusão do pedido | `pedido_concluido` — etapa `entrega` |

### Endpoint novo: `GET /pedidos/:id/auditoria?etapa=dados_pedido`
Retorna os registros de auditoria filtrados por etapa para exibir nas abas Histórico.

---

## Arquivos Afetados

### Frontend — Remover
- `src/pages/pedidos/Pedidos.jsx`
- `src/pages/pedidos/Pedidos.css`

### Frontend — Renomear
- `src/pages/dashboard/DashboardPedidos.jsx` → `src/pages/pedidos/Pedidos.jsx`
- `src/pages/dashboard/DashboardPedidos.css` → `src/pages/pedidos/Pedidos.css`
- `src/pages/dashboard/hooks/useDashboardPedidos.js` → `src/pages/pedidos/hooks/usePedidos.js`

### Frontend — Redesenhar do zero
- `src/pages/pedidos/PedidoFluxo.jsx` — novo design com 2 cards + modais
- `src/pages/pedidos/PedidoFluxo.css` — novo CSS

### Frontend — Modificar
- `src/App.jsx` — rota `/pedidos` aponta para novo `Pedidos.jsx`; remove `/dashboard-pedidos`
- `src/components/Sidebar.jsx` — remove link Dashboard, mantém Pedidos apontando para `/pedidos`

### Backend — Novo
- `migrations/pedido_auditoria.sql` — tabela `pedido_auditoria` + campo `pedido_itens.sem_vinculo`
- `src/services/auditoriaService.js` — função `registrarAuditoria()`
- `src/routes/pedidosRoutes.js` — `GET /pedidos/:id/auditoria`

### Backend — Modificar
- `src/services/pedidoService.js` — lógica de `verificacao_ok` automática ao salvar; diff para auditoria
- `src/services/agendamentoService.js` — registra auditoria ao criar genitor e ao concluir
- `src/services/pedidoService.js` (importar) — registra `importacao` na auditoria
- `src/routes/pedidosRoutes.js` — novo endpoint de auditoria
