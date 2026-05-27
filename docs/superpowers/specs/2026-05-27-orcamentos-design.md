# Spec: Módulo de Orçamentos

**Data:** 2026-05-27  
**Status:** Aprovado  
**Stack:** React 19 + Vite / Node.js + Express 5 / PostgreSQL (pg nativo) / JWT

---

## Visão geral

Módulo independente para criação e aprovação de orçamentos de cortinas e persianas. O fluxo é: **Orçamento (rascunho) → Aprovação → Pedido criado automaticamente**. É o elo que faltava entre o cliente e o pedido de venda.

---

## Arquitetura

### Arquivos novos

**Backend:**
- `backend/src/services/orcamentoService.js`
- `backend/src/routes/orcamentosRoutes.js`

**Frontend:**
- `frontend-web/src/pages/orcamentos/Orcamentos.jsx` — listagem
- `frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx` — wizard de criação/edição
- `frontend-web/src/pages/orcamentos/Orcamentos.css`

**App.jsx:** adicionar rota `/orcamentos` e `/orcamentos/novo` e `/orcamentos/:id/editar`

### Arquivos alterados

- `backend/src/routes/index.js` (ou onde as rotas são montadas) — registrar `orcamentosRoutes`
- `frontend-web/src/App.jsx` — adicionar imports e rotas
- `backend/src/routes/produtosRoutes.js` — adicionar `GET /busca?q=` se não existir

---

## Backend

### Rotas — `orcamentosRoutes.js`

Todas as rotas exigem `authMiddleware`. Permissões verificadas por `permissionMiddleware`.

```
GET    /api/orcamentos                → listar
POST   /api/orcamentos                → criar (com itens)
GET    /api/orcamentos/:id            → buscar (detalhe com itens)
PUT    /api/orcamentos/:id            → atualizar (só status = 'novo')
POST   /api/orcamentos/:id/aprovar    → aprovar → cria pedido → retorna pedido_id
POST   /api/orcamentos/:id/cancelar   → cancelar
```

**Permissões:**
- Criar/editar/listar: `COMERCIAL`, `OPERADOR_AGENDA`, `ADMIN_MASTER`
- Aprovar: `OPERADOR_AGENDA`, `ADMIN_MASTER`
- Cancelar: `OPERADOR_AGENDA`, `ADMIN_MASTER`

**Filtro de visibilidade (listagem):**
- `COMERCIAL` pode ver todos, mas com parâmetro `meu=true` filtra por `consultora_id = req.user.id`
- `OPERADOR_AGENDA` e `ADMIN_MASTER` sempre veem todos

### Serviço — `orcamentoService.js`

#### `listar(empresaId, filtros)`
Filtros: `{ status, q, meu, consultora_id, periodo_inicio, periodo_fim }`  
Retorna: `id, numero, cliente_nome, consultora_nome, arquiteto_nome, valor_total, status, created_at`  
Ordenação: `created_at DESC`

#### `criar(empresaId, userId, dados)`
`dados`: `{ cliente_id, arquiteto_id, observacoes, endereco_entrega (objeto, nullable), itens[] }`  
Transação:
1. Gera número sequencial via `nextval('orcamentos_numero_seq')` → formata como `ORC-00001`
2. `INSERT INTO orcamentos` com `consultora_id = userId`
3. Bulk `INSERT INTO orcamento_itens` (todos os itens de todos os ambientes)
4. Se produto não existir no catálogo: `INSERT INTO produtos` com `status = 'inativo'`, usa o `produto_id` retornado
5. Retorna orçamento completo

#### `buscar(id, empresaId)`
JOIN com `clientes`, `usuarios` (consultora), `arquitetos`, `orcamento_itens`  
Retorna itens agrupados por `ambiente` no formato `{ ambiente: string, itens: [] }`

#### `atualizar(id, empresaId, dados)`
Valida `status = 'novo'` antes de qualquer UPDATE.  
Permite atualizar cabeçalho e substituir itens (DELETE + re-INSERT em transação).

#### `aprovar(id, empresaId, userId, enderecoEntrega)`
Transação única:
1. Valida `status = 'novo'`
2. `UPDATE orcamentos SET status = 'aprovado', updated_at = NOW()`
3. `INSERT INTO pedidos` com: `empresa_id`, `cliente_id`, `consultor_id`, `arquiteto_id`, `numero_sequencial` (via sequence), endereço de entrega, `orcamento_id`
4. Copia `orcamento_itens` → `pedido_itens`: preserva `ambiente`, `produto_id`, `produto_nome`, `largura`, `altura`, `quantidade`, `unidade`, `cor`, `referencia`, `especificacoes`, `preco_unitario`, `orcamento_item_id`
5. Retorna `{ orcamento_id, pedido_id }`

#### `cancelar(id, empresaId)`
`UPDATE orcamentos SET status = 'cancelado'` — valida que não está já aprovado.

### Busca de produto para autocomplete

`GET /api/produtos/busca?q=texto` — ILIKE em `nome` e `referencia`, limit 8, só `status != 'deletado'`.  
Se não existir no catálogo e o usuário confirmar: `POST /api/produtos` com `{ nome, status: 'inativo', empresa_id }`.

---

## Frontend

### Listagem — `Orcamentos.jsx`

**Filtros:**
- Busca por texto (cliente ou número)
- Status: Todos / Novo / Aprovado / Cancelado
- Toggle: "Todos os orçamentos / Meus orçamentos" (só visível para COMERCIAL)
- Período (data início / data fim)

**Tabela:**
| Número | Cliente | Consultora | Arquiteto | Total | Status | Data | Ações |
|--------|---------|-----------|-----------|-------|--------|------|-------|

**Ações por linha:**
- Ver (abre wizard em modo leitura)
- Editar (só `status = 'novo'`)
- Aprovar (só `status = 'novo'`, permissão OPERADOR_AGENDA+)
- Cancelar (só `status = 'novo'`, permissão OPERADOR_AGENDA+)

**Botão primário:** `+ Novo orçamento` → navega para `/orcamentos/novo`

### Wizard — `OrcamentoWizard.jsx`

Rota: `/orcamentos/novo` e `/orcamentos/:id/editar`

**Barra de progresso:** `① Cliente → ② Itens → ③ Revisão`  
Estado completo do wizard em `useState` local; `PUT` só na ação "Salvar rascunho" ou "Aprovar".

#### Etapa 1 — Cliente e dados gerais

Campos:
- **Cliente** (obrigatório): autocomplete com `GET /api/clientes/busca?q=`; mostra nome + telefone
- **Consultora**: travado no usuário logado (exibe nome, não editável)
- **Arquiteto** (opcional): autocomplete com `GET /api/arquitetos?q=`
- **Observações** (opcional): textarea
- **Endereço de entrega** (opcional): bloco expansível com campos `rua, numero, complemento, bairro, cidade, estado, cep`; atalho "Usar endereço do cliente" preenche a partir de `cliente_enderecos WHERE is_padrao = true`

Validação para avançar: apenas `cliente_id` é obrigatório.

#### Etapa 2 — Itens por ambiente (acordeão)

Estado: `ambientes[]` — cada ambiente tem `{ nome: string, itens: [] }`

**Acordeão:**
- Clique no cabeçalho do ambiente expande/recolhe
- Cabeçalho mostra: nome do ambiente, contagem de itens, subtotal
- Botão "🗑 remover" no cabeçalho remove o ambiente e seus itens (com confirmação)
- Botão `+ Novo ambiente` no fim da lista abre input inline para digitar o nome

**Tabela de itens dentro de cada ambiente:**

Colunas: `Produto | QTD | Larg (m) | Alt (m) | Cor | R$ Unit | [remover]`

- **Produto**: autocomplete `GET /api/produtos/busca?q=`; ao não encontrar e confirmar → cria rascunho
- **QTD**: numérico, mínimo 1, default 1
- **Larg / Alt**: decimal com vírgula, nullable (nem todo produto tem medidas)
- **Cor**: texto livre
- **R$ Unit**: decimal, nullable
- `✕` no fim da linha remove o item

Botão `+ Adicionar item` no fim de cada ambiente adiciona linha em branco.

Validação para avançar: pelo menos 1 ambiente com pelo menos 1 item com produto preenchido.

#### Etapa 3 — Revisão

**Resumo por ambiente:** nome do ambiente, lista de itens (produto + medidas + qtd + valor), subtotal  
**Total geral:** soma de todos os itens (qtd × preco_unitario)  
**Bloco de endereço:** exibe o endereço salvo (se houver) com botão "✏ editar" que expande os campos inline

**Botões:**
- `← Voltar`
- `💾 Salvar rascunho` → `POST /api/orcamentos` (ou `PUT` se editando) → toast de sucesso → permanece na tela
- `✓ Aprovar orçamento` → abre modal de confirmação (só visível para OPERADOR_AGENDA+)

**Modal de aprovação:**
- Título: "Confirmar aprovação do orçamento"
- Exibe o endereço pré-preenchido do rascunho; todos os campos são editáveis inline
- Botões: Cancelar / "Confirmar → criar pedido"
- Ao confirmar: `POST /api/orcamentos/:id/aprovar` com `{ endereco_entrega }` → redireciona para `/pedidos/:pedido_id`

---

## Modelo de dados relevante (já migrado)

```sql
-- orcamentos: id, empresa_id, cliente_id, consultora_id, arquiteto_id,
--             numero, status ('novo'|'aprovado'|'cancelado'),
--             observacoes, valor_total, endereco_entrega (JSONB ou colunas flat),
--             criado_por, created_at, updated_at, deleted_at

-- orcamento_itens: id, orcamento_id, produto_id, produto_nome,
--                  ambiente, largura, altura, quantidade, unidade,
--                  cor, referencia, especificacoes (JSONB),
--                  preco_unitario, valor_total_item, ordem, created_at
```

**Nota — migration necessária:** adicionar `endereco_entrega JSONB` na tabela `orcamentos` (a migration `orcamentos_v1.sql` já criou a tabela mas sem este campo). Usar JSONB mantém o campo opcional e evita 6 colunas nullable. Formato: `{ rua, numero, complemento, bairro, cidade, estado, cep }`.

**`valor_total`:** calculado no serviço como `SUM(quantidade × preco_unitario)` de todos os `orcamento_itens` antes do INSERT/UPDATE.

**Endpoints de busca a verificar antes de implementar:**
- `GET /api/clientes/busca?q=` — verificar se existe em `clientesRoutes.js`; criar se não existir
- `GET /api/arquitetos?q=` — verificar se existe em `arquitetosRoutes.js`; criar se não existir
- `GET /api/produtos/busca?q=` — verificar se existe em `produtosRoutes.js`; criar se não existir

---

## Fluxo de dados resumido

```
/orcamentos/novo
  └─ Etapa 1 (cliente + endereço opcional)
  └─ Etapa 2 (ambientes + itens com qtd)
  └─ Etapa 3 (revisão)
       ├─ Salvar rascunho → POST /api/orcamentos → ORC-00001 criado
       └─ Aprovar → modal (endereço pré-preenchido, editável)
                     └─ POST /api/orcamentos/:id/aprovar
                          └─ transação: orcamento=aprovado + pedido criado
                               └─ redirect /pedidos/:pedido_id
```

---

## Fora do escopo (para fases futuras)

- Notificações por e-mail ao aprovar
- PDF de orçamento para impressão
- Histórico de versões do orçamento
- Compartilhamento de link do orçamento com o cliente
