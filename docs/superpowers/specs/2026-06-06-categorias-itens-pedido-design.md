# Design: Categorias em Itens de Pedido

**Data:** 2026-06-06  
**Status:** Aprovado

---

## Contexto

Atualmente `pedido_itens` não possui categoria. A categorização e a seleção de modelo ocorriam durante a importação (ImportarPedidoModal), acoplando dados brutos e dados de configuração no mesmo fluxo.

O objetivo é separar responsabilidades:
- **Importação:** corrigir dados brutos (descrição, medidas, valores). Auto-detecta categoria.
- **Edição do pedido:** vincular itens, selecionar modelo e confirmar/trocar categoria.

---

## Decisões de Design

- **Armazenamento:** `categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL` adicionado a `pedido_itens` (Opção A aprovada).
- **Novas categorias:** Forros, Motorização, Controles, Almofadas — inseridas como padrão se não existirem.
- **Detecção:** keyword matching no backend; retorna `categoria_id` já resolvido na extração do PDF.
- **Modelo:** mantido, movido para a edição do pedido (não mais na importação).
- **Vinculação:** sem mudança — já funciona na edição.

---

## Banco de Dados

### Migration 1 — Novas categorias padrão

Inserção condicional (ON CONFLICT DO NOTHING por nome+empresa_id não é possível sem unique; usar `WHERE NOT EXISTS`):

```sql
-- Para cada empresa, inserir as 4 novas categorias se não existirem
INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Forros',       '#7B68EE', 9  FROM empresas e WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND c.nome = 'Forros');
INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Motorização',  '#FF6B35', 10 FROM empresas e WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND c.nome = 'Motorização');
INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Controles',    '#20B2AA', 11 FROM empresas e WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND c.nome = 'Controles');
INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Almofadas',    '#FF69B4', 12 FROM empresas e WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND c.nome = 'Almofadas');
```

### Migration 2 — Campo `categoria_id` em `pedido_itens`

```sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
```

---

## Auto-detecção de Categoria

### Tabela de Mapeamento (keywords → nome da categoria)

| Keywords (case-insensitive, busca parcial) | Nome da categoria |
|---|---|
| cortina, voil, voile | Cortinas |
| forro | Forros |
| persiana, rolo, roller, roman, double vision, vision | Persianas |
| trilho, varão, varao, suporte | Trilhos e Varões |
| tecido, retalho | Tecidos |
| tapete | Tapetes |
| almofada | Almofadas |
| motor, motorização, motorizado | Motorização |
| controle, controles, comando, acionador | Controles |
| (fallback) | Outros |

### Backend — `resolverCategoriaItem(descricao, empresaId, client)`

Nova função utilitária em `pedidoService.js` (ou arquivo separado):
1. Aplica tabela acima para obter nome da categoria.
2. Faz `SELECT id FROM categorias WHERE empresa_id=$1 AND LOWER(nome)=LOWER($2)`.
3. Retorna `categoria_id` ou `null`.

### Onde é chamada

- `parsearItensTabDelimitada()` (backend, rota `POST /importar-texto`): retorna campo `categoria_id` em cada item.
- `_salvarItens()`: aceita e persiste `categoria_id` recebido do frontend.

---

## ImportarPedidoModal — Simplificado

### O que é removido

- Todo o estado `selecoes` (modelo, especificações, item_vinculado_idx).
- `ModeloSelectorPanel` — componente não é mais renderizado aqui.
- Coluna "Vinculado a" da tabela de itens.
- Função `confirmar()`: remover remapeamento de `item_vinculado_ordem`.

### O que é adicionado

- Coluna **Categoria** na tabela de itens (dropdown `<select>`).
- Preenchida automaticamente com `categoria_id` vindo do backend.
- Editável pelo usuário antes de salvar.
- Requer que o modal receba a lista de categorias da empresa (nova prop ou fetch interno).

### Dados enviados ao salvar

```js
{
  ...dadosBrutos,
  itens: [
    {
      ambiente, referencia, cor, descricao, medidas,
      largura, altura, quantidade, unidade,
      preco_unitario, valor,
      categoria_id: Number | null   // ← novo
    }
  ]
}
```

---

## PedidoModal (Edição) — Adições

### Cada linha de item recebe

| Campo | Tipo | Comportamento |
|---|---|---|
| `categoria_id` | dropdown | Categorias da empresa; nullable |
| `modelo` | campo texto/select | Já existe; agora editável aqui (não mais na importação) |

### Estado inicial

Ao abrir edição de um pedido existente, `categoria_id` e `modelo` são carregados do item.

### Salvamento

`salvar()` já chama `_salvarItens()`; basta incluir `categoria_id` no payload.

---

## Exibição do Pedido (`Pedidos.jsx`)

### Coluna nova na tabela de itens

Adicionar coluna **Categoria** com badge colorido:

```jsx
<td>
  {it.categoria_nome
    ? <span className="pd-cat-badge" style={{ background: it.categoria_cor }}>
        {it.categoria_nome}
      </span>
    : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  }
</td>
```

### Backend — `montarPedido()`

JOIN com `categorias` para trazer `categoria_nome` e `categoria_cor`:

```sql
SELECT pi.*,
       os.id AS os_id, os.status AS os_status,
       cat.nome AS categoria_nome,
       cat.cor  AS categoria_cor
FROM pedido_itens pi
LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
LEFT JOIN categorias cat   ON cat.id = pi.categoria_id
WHERE pi.pedido_id=$1
ORDER BY pi.ordem, pi.id
```

---

## Componentes Afetados

| Arquivo | Mudança |
|---|---|
| `backend/src/database/migrations/pedido_itens_categorias.sql` | Novo — migration categoria_id |
| `backend/src/database/migrations/categorias_padrao_v2.sql` | Novo — 4 novas categorias |
| `backend/src/services/pedidoService.js` | `montarPedido` JOIN, `_salvarItens` aceita categoria_id, nova fn detecção |
| `backend/src/routes/pedidosRoutes.js` | `/importar-texto` resolve categoria_id por item |
| `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx` | Remover selecoes/modelo/vinculo; adicionar dropdown categoria |
| `frontend-web/src/pages/pedidos/Pedidos.jsx` | Nova coluna Categoria com badge |
| `frontend-web/src/pages/pedidos/Pedidos.css` | Estilo `.pd-cat-badge` |
| `frontend-web/src/pages/pedidos/PedidoModal` ou `Pedidos.jsx` (edit) | Adicionar campos categoria_id e modelo na edição de item |

---

## Fora do Escopo

- Alterar como `ModeloSelectorPanel` funciona internamente (não é mais usado aqui).
- Migração de dados históricos (itens existentes ficam com `categoria_id = null`).
- Mudanças na tela de Catálogo/Produtos.
