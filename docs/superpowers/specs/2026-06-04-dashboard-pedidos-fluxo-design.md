# Dashboard de Pedidos + Fluxo Visual — Design

**Data:** 2026-06-04  
**Status:** Aprovado

---

## Visão Geral

Adicionar duas novas telas ao sistema:

1. **`/dashboard-pedidos`** — lista de pedidos com barra de progresso por etapas, filtros e toggle de visão (geral / por consultora).
2. **`/pedidos/:id/fluxo`** — fluxograma horizontal interativo mostrando a jornada completa de um pedido específico, do PDF à entrega final.

Ao mesmo tempo, introduzir os conceitos de **agendamento genitor** e **agendamento herdeiro**, automatizar a transição de status do pedido, e adicionar as etapas manuais de verificação e categorização.

---

## Conceitos Centrais

### Agendamento Genitor

Um agendamento é considerado **genitor** quando:
- `agendamentos.pedido_id IS NOT NULL`
- Existe ao menos um registro em `agendamento_itens` com `pedido_item_id IS NOT NULL` vinculado a esse agendamento

O genitor representa um **pré-agendamento de instalação de um lote de itens** do pedido. Um pedido pode ter múltiplos genitores — um por lote de itens entregues em datas diferentes.

O termo "genitor" é **interno ao sistema** e não deve aparecer na interface para o usuário. Na UI, esses agendamentos são chamados de **"Pré-agendamento"**.

### Agendamento Herdeiro

Um agendamento é **herdeiro** quando possui `agendamento_pai_id` preenchido apontando para um genitor. Herdeiros representam conferências, retornos e qualquer atendimento posterior vinculado a um pré-agendamento específico.

---

## Mudanças no Banco de Dados

Todas as alterações vão em `backend/src/database/migrations/dashboard_pedidos.sql`.

### `pedidos` — novas colunas

```sql
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS verificacao_ok   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categorizacao_ok BOOLEAN NOT NULL DEFAULT false;
```

- `verificacao_ok`: marcado manualmente quando a importação do PDF foi conferida
- `categorizacao_ok`: marcado manualmente quando todos os itens foram categorizados/identificados

### `agendamento_itens` — nova coluna (crítico para detecção de genitores)

A tabela atual só tem `id`, `agendamento_id` e `nome`. Para vincular itens do pedido a um agendamento (o que define um genitor), é necessário:

```sql
ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_pedido_item ON agendamento_itens(pedido_item_id);
```

### `agendamentos` — nova coluna

```sql
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS agendamento_pai_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pai ON agendamentos(agendamento_pai_id);
```

O campo `tipo` já existe em `agendamentos` (`VARCHAR(80) DEFAULT 'Instalação'`). Herdeiros usam esse campo naturalmente — ex: `'Conferência'`, `'Retorno'`.

### Permissão

```sql
INSERT INTO permissoes (nome, descricao) VALUES
  ('DASHBOARD_PEDIDOS_GERAL', 'Visualiza dashboard com pedidos de todas as consultoras')
ON CONFLICT DO NOTHING;
```

---

## Cálculo do Estágio do Pedido

Para cada pedido, o backend calcula um objeto de estágio com os seguintes campos:

| Campo | Fonte | Tipo |
|---|---|---|
| `pdf_ok` | `EXISTS pedido_anexos WHERE pedido_id = ?` | Auto |
| `verificacao_ok` | `pedidos.verificacao_ok` | Manual |
| `categorizacao_ok` | `pedidos.categorizacao_ok` | Manual |
| `vinculos_ok` | `EXISTS pedido_item_vinculos WHERE pedido_id = ?` — se não houver itens vinculáveis, considera `true` | Auto |
| `pre_agendamentos[]` | agendamentos com `pedido_id` + itens de pedido vinculados | Auto |
| `herdeiros_por_pai` | mapa `agendamento_pai_id → agendamento[]` | Auto |
| `proximo_prazo` | data do próximo pré-agendamento com status `pre_agendado` ou `agendado` | Auto |
| `dias_para_prazo` | `proximo_prazo - hoje` | Derivado |

### Regras de alerta de prazo

| Condição | Nível | Cor |
|---|---|---|
| `dias_para_prazo <= 0` | `atrasado` | Vermelho |
| `1–7 dias` | `urgente` | Laranja |
| `8–14 dias` | `atencao` | Amarelo |
| `> 14 dias` ou sem prazo | nenhum | — |

---

## Backend — Novos Endpoints

### `GET /api/dashboard/pedidos`

Parâmetros de query:
- `consultora_id` — filtra por consultora (apenas para quem tem `DASHBOARD_PEDIDOS_GERAL`)
- `status` — filtra por status do pedido
- `alerta` — filtra por nível de prazo (`atrasado`, `urgente`, `atencao`)

Resposta: array de pedidos com campos:
```json
{
  "id": 1843,
  "numero_sequencial": 1843,
  "status": "em_andamento",
  "cliente_nome": "Ana Silva",
  "consultor_nome": "Fernanda",
  "total": 4200.00,
  "itens_count": 3,
  "estagio": {
    "pdf_ok": true,
    "verificacao_ok": true,
    "categorizacao_ok": true,
    "vinculos_ok": true,
    "pre_agendamentos": [
      { "id": 55, "data_inicio": "2026-06-15", "status": "agendado", "itens_count": 2 }
    ],
    "proximo_prazo": "2026-06-15",
    "dias_para_prazo": 5,
    "nivel_alerta": "urgente"
  }
}
```

Acesso: requer autenticação. Sem `DASHBOARD_PEDIDOS_GERAL`, retorna apenas pedidos onde `consultor_id = usuário logado`.

---

### `GET /api/pedidos/:id/fluxo`

Retorna o grafo completo do pedido:
```json
{
  "pedido": { "id": 1843, "status": "em_andamento", ... },
  "estagio": { ... },
  "pre_agendamentos": [
    {
      "id": 55,
      "data_inicio": "2026-06-15",
      "status": "agendado",
      "itens": [ { "pedido_item_id": 10, "descricao": "Cortina Voil" } ],
      "herdeiros": [
        { "id": 60, "tipo": "conferencia", "data_inicio": "2026-06-20", "status": "agendado" }
      ]
    }
  ]
}
```

---

### `PATCH /api/pedidos/:id/etapa`

Body: `{ "campo": "verificacao_ok" | "categorizacao_ok", "valor": true | false }`

Atualiza a etapa manual no pedido. Apenas consultora do pedido ou usuário com `DASHBOARD_PEDIDOS_GERAL` pode executar.

---

## Automação de Status do Pedido

No `agendamentoService.criar()`, após persistir o agendamento e seus itens, adicionar lógica:

```js
// Detecta se o agendamento recém-criado é genitor
const temItensPedido = itens.some(i => i.pedido_item_id != null);
if (dados.pedido_id && temItensPedido) {
  await db.query(
    `UPDATE pedidos SET status = 'em_andamento'
     WHERE id = $1 AND status = 'pendente'`,
    [dados.pedido_id]
  );
}
```

**Conclusão automática:** quando todos os agendamentos genitores de um pedido atingirem `status = 'concluido'`, o pedido muda para `status = 'concluido'`. Esse check é executado ao concluir um agendamento em `agendamentoService.atualizarStatus()`.

---

## Frontend — Dashboard `/dashboard-pedidos`

### Controles

- **Toggle "Visão Geral / Por Consultora":** visível apenas para usuários com `DASHBOARD_PEDIDOS_GERAL`. No modo "Por Consultora" com permissão geral, exibe dropdown para selecionar qualquer consultora.
- **Sem permissão:** só exibe pedidos do usuário logado, sem toggle.
- **Chips de filtro:** Todos / Pendentes / Em andamento / Atrasados / Concluídos.

### Card de Pedido

Cada card exibe:
- Número do pedido + nome da consultora
- Data de criação
- Badge de status (Aguardando / Em andamento / Atrasado / Concluído)
- Campos: Cliente, Valor, Itens
- Alerta de prazo inline (quando aplicável)
- **Barra de progresso** com etapas: `PDF → Verif. → Categ. → Pré-ag. 1 → [Pré-ag. 2…N] → Entrega`
  - O número de segmentos Pré-ag. se ajusta ao total de pré-agendamentos reais
  - Ponto indicador mostra a etapa atual
  - Etapas concluídas: verde; etapa atual: azul; pendentes: cinza; atrasada: vermelho
- Lista de itens do pedido (nome, qtd, valor)
- Clicar no card navega para `/pedidos/:id/fluxo`

---

## Frontend — Fluxo `/pedidos/:id/fluxo`

### Header

Número do pedido, cliente, consultora, valor total, botão "← Voltar ao Dashboard".

### Fluxograma Horizontal

Nós conectados da esquerda para a direita. Pré-agendamentos com herdeiros exibem os herdeiros abaixo como ramificação:

```
[PDF] → [Verificar] → [Categorizar] → [Vincular] ─┬─→ [Pré-ag. 1] ──→ [Entrega]
                                                   │        ↓
                                                   │   [Conf. 1]
                                                   │   [Retorno 1]
                                                   └─→ [Pré-ag. 2]
                                                            ↓
                                                        [Conf. 2]
```

### Cores dos nós

| Estado | Cor | Efeito |
|---|---|---|
| Pendente | Cinza escuro | — |
| Concluído | Verde | — |
| Em andamento / próximo | Azul | Glow pulsante |
| Atrasado | Vermelho | Glow vermelho |

### Clique em um nó

Abre tooltip expandido com:
- **Nós PDF / Verificar / Categorizar / Vincular:** data de conclusão, quem marcou, botão de ação (ex: "Marcar como verificado")
- **Nós de pré-agendamento:** data, itens incluídos, status, link para o agendamento
- **Nós herdeiros:** data, tipo, status, link para o agendamento

### Nós de etapas manuais

"Verificar" e "Categorizar" exibem um botão "Marcar como concluído" quando pendentes. O clique chama `PATCH /api/pedidos/:id/etapa`. Apenas consultora do pedido ou admin pode acionar.

---

## Arquivos a Criar / Modificar

### Novos
- `frontend-web/src/pages/dashboard/DashboardPedidos.jsx`
- `frontend-web/src/pages/dashboard/DashboardPedidos.css`
- `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`
- `frontend-web/src/pages/pedidos/PedidoFluxo.css`
- `backend/src/routes/dashboardRoutes.js`
- `backend/src/services/dashboardService.js`
- `backend/src/database/migrations/dashboard_pedidos.sql`

### Modificados
- `backend/src/services/agendamentoService.js` — automação de status em `criar()` e `atualizarStatus()`; persistência de `pedido_item_id` em `agendamento_itens`
- `backend/src/routes/pedidosRoutes.js` — adiciona `PATCH /:id/etapa`
- `backend/src/services/pedidoService.js` — adiciona `atualizarEtapa()`
- `frontend-web/src/App.jsx` (ou router) — adiciona rotas `/dashboard-pedidos` e `/pedidos/:id/fluxo`
- `frontend-web/src/components/Sidebar.jsx` (ou nav) — adiciona link Dashboard
