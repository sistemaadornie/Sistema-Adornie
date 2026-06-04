# Design: Vínculos entre Itens de Pedido

**Data:** 2026-06-04  
**Status:** Aprovado

---

## Contexto

`pedido_itens` possui uma coluna `item_vinculado_id INTEGER` (auto-referencial) adicionada em `pedido_itens_v3.sql`. Ela é usada exclusivamente no fluxo de importação (`ImportarPedidoModal`) para ligar um item trilho ao item cortina/forro que ele sustenta.

**Problemas atuais:**
- O vínculo não aparece na visualização do detalhe do pedido
- O vínculo não é editável fora do fluxo de importação
- A coluna suporta apenas um único vínculo por item

---

## Objetivo

1. Tornar os vínculos visíveis no detalhe do pedido (hierarquia aninhada)
2. Tornar os vínculos editáveis no modal de edição do pedido
3. Migrar a estrutura para suportar múltiplos vínculos por item no futuro
4. Manter foco em trilho → cortina/forro por enquanto, estruturado para generalização

---

## 1. Banco de Dados

### Nova tabela

```sql
CREATE TABLE pedido_item_vinculos (
  id                SERIAL PRIMARY KEY,
  item_id           INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  item_vinculado_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  tipo_vinculo      VARCHAR(40) NOT NULL DEFAULT 'acessorio',
  UNIQUE (item_id, item_vinculado_id)
);

CREATE INDEX idx_piv_item           ON pedido_item_vinculos(item_id);
CREATE INDEX idx_piv_item_vinculado ON pedido_item_vinculos(item_vinculado_id);
```

**Semântica:** `item_id` = filho/acessório (ex: trilho); `item_vinculado_id` = pai/principal (ex: cortina).

### Migração dos dados existentes

```sql
-- Migra vínculos existentes
INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
SELECT id, item_vinculado_id, 'acessorio'
FROM pedido_itens
WHERE item_vinculado_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Remove coluna antiga
ALTER TABLE pedido_itens DROP COLUMN IF EXISTS item_vinculado_id;
```

---

## 2. Backend (`pedidoService.js`)

### `montarPedido` — incluir vínculos nos itens

Após buscar `pedido_itens`, busca `pedido_item_vinculos` para o pedido e associa ao item correspondente:

```js
const vinculosRes = await db.query(
  `SELECT item_id, item_vinculado_id, tipo_vinculo
   FROM pedido_item_vinculos
   WHERE item_id = ANY($1)`,
  [itensRes.rows.map(r => r.id)]
);

// Agrupa por item_id
const vinculosPorItem = {};
for (const v of vinculosRes.rows) {
  if (!vinculosPorItem[v.item_id]) vinculosPorItem[v.item_id] = [];
  vinculosPorItem[v.item_id].push({ item_vinculado_id: v.item_vinculado_id, tipo_vinculo: v.tipo_vinculo });
}

// Cada item retorna com campo vinculos: []
itens = itensRes.rows.map(it => ({
  ...it,
  vinculos: vinculosPorItem[it.id] || [],
}));
```

Cada item retornado terá:
```json
{
  "id": 42,
  "descricao": "Trilho Wave",
  "vinculos": [{ "item_vinculado_id": 38, "tipo_vinculo": "acessorio" }]
}
```

### `_salvarItens` — persistir vínculos

Ao final do save de itens (após todos os INSERTs/UPDATEs), apaga e recria os vínculos do pedido:

```js
// Apaga vínculos existentes dos itens do pedido
await client.query(
  `DELETE FROM pedido_item_vinculos WHERE item_id = ANY($1)`,
  [insertedIds]
);

// Recria a partir do campo item_vinculado_idx (frontend) → ID real
for (let i = 0; i < itens.length; i++) {
  const idx = itens[i].item_vinculado_idx;
  if (idx != null && Number.isFinite(Number(idx)) && insertedIds[Number(idx)] != null) {
    await client.query(
      `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [insertedIds[i], insertedIds[Number(idx)], itens[i].tipo_vinculo || 'acessorio']
    );
  }
}
```

O campo `item_vinculado_ordem` (usado pelo fluxo de importação) é mantido como alias de `item_vinculado_idx` para compatibilidade.

### `ImportarPedidoModal` — sem mudança de lógica

O modal de importação já envia `item_vinculado_ordem` por item. O backend simplesmente passa a salvar na nova tabela em vez da coluna antiga. Nenhuma mudança no frontend de importação.

---

## 3. Frontend — Visualização (`DetalhePedido` em `Pedidos.jsx`)

Antes de renderizar a tabela de itens, monta uma árvore:

```
itensRaiz = itens sem nenhum vínculo de entrada (não são filhos de ninguém)
filhosPorPai = Map<item_vinculado_id → [item_filho, ...]>
```

Renderização:
```
#  Ambiente   Referência  Produto              Medidas    Qtde  Total
1  Sala        ADO500      Cortina Wave         2,00x3,00   2    R$ 800,00
   └─ 2  Sala  ADO-T01     Trilho Wave          2,00        2    R$ 120,00
3  Quarto      ADO200      Persiana Rolo         1,50x2,20  1    R$ 350,00
```

- Item filho: indentado com símbolo `└─`, fundo `rgba(var(--color-primary-rgb), 0.04)`
- Numeração sequencial contínua (pai = 1, filho = 2, próximo pai = 3)
- Se pai for excluído do pedido, filho perde vínculo e vira item raiz

---

## 4. Frontend — Edição (`PedidoModal` em `Pedidos.jsx`)

Na aba **Itens**, cada linha ganha uma coluna **"Vinculado a"**:

```
#  Ambiente  Ref   Produto       Medidas  Qtde  Un  Preço   Total    Vinculado a        ×
1  Sala      ...   Cortina Wave  ...       2    UN  400,00  800,00   — Nenhum —         ×
2  Sala      ...   Trilho Wave   ...       2    UN   60,00  120,00   1 – Cortina Wave   ×
```

- `<select>` com opções: `— Nenhum —` + `{índice+1} – {descrição}` para cada outro item
- Um item não pode se vincular a si mesmo (opção filtrada)
- Estado: `item_vinculado_idx` (índice posicional, 0-based) por item
- Ao carregar pedido para edição: resolve `vinculos[0].item_vinculado_id` → índice posicional via `itens.findIndex(it => it.id === v.item_vinculado_id)` *(vinculos[0] é intencional: a UI de edição suporta apenas um vínculo por item por enquanto; múltiplos serão abordados em iteração futura)*
- Ao salvar: envia `item_vinculado_idx` junto com cada item

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `backend/src/database/migrations/pedido_item_vinculos.sql` | Novo — cria tabela e migra dados |
| `backend/src/services/pedidoService.js` | `montarPedido` + `_salvarItens` |
| `frontend-web/src/pages/pedidos/Pedidos.jsx` | `DetalhePedido` (árvore) + `PedidoModal` (coluna Vinculado a) |

`ImportarPedidoModal.jsx` **não muda** — o backend absorve a mudança de estrutura.

---

## Fora do escopo

- Tipos de vínculo além de `'acessorio'` (campo existe, UI não expõe)
- Vínculos em outras telas (orçamentos, OS)
- Validação de ciclos (item A → item B → item A)
