# Design: Vínculos entre Itens de Pedido via Classificação por Categoria

**Data:** 2026-06-10
**Status:** Aprovado

---

## Contexto

A tabela `pedido_item_vinculos` (`item_id` = filho/acessório, `item_vinculado_id` = pai/principal, `tipo_vinculo` default `'acessorio'`) já existe e é retornada por `montarPedido` (cada item ganha `vinculos: []`), mas **não há nenhuma UI funcional** para o usuário criar/editar esses vínculos. O critério "Todos os itens com vínculo" da Etapa 1 (`_verificarEtapa1` em `pedidoService.js`) hoje exige que **todo** item do pedido tenha um vínculo ou esteja marcado `sem_vinculo = true`, mas nada na UI permite marcar `sem_vinculo` nem criar o vínculo em si.

**Bug existente:** `_salvarItens` (chamado por `PUT /pedidos/:id`) apaga e recria `pedido_item_vinculos` com base em `item_vinculado_idx`/`item_vinculado_ordem` — campos que nenhum frontend envia hoje. Isso significa que qualquer "Salvar alterações" no `EditarPedidoModal` apagaria silenciosamente vínculos criados por outro fluxo.

## Objetivo

1. Permitir classificar **categorias de produto** como "vinculável" (pode ser item filho/acessório) e/ou "recebe vínculos" (pode ser item principal/pai).
2. Criar um modal dedicado para o usuário vincular itens de um pedido entre si, deixando nítido visualmente quem está vinculado a quem.
3. Ajustar o critério da Etapa 1 para considerar apenas itens de categorias "vinculáveis".
4. Corrigir o bug de `_salvarItens` que apaga vínculos indevidamente.

---

## 1. Banco de Dados

### Categorias — novos campos

Nova migration `backend/src/database/migrations/categorias_vinculo_flags.sql`:

```sql
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS vinculavel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculos BOOLEAN NOT NULL DEFAULT false;
```

`pedido_item_vinculos` não muda de estrutura.

---

## 2. Backend

### 2.1 `categoriaService.js`

- `listar`, `buscar`, `criar`, `atualizar`: incluir/aceitar/retornar `vinculavel` e `recebe_vinculos` (boolean, default `false`).

### 2.2 Critério Etapa 1 (`_verificarEtapa1`)

Passa a considerar **apenas itens cuja categoria tem `vinculavel = true`**:

```js
async function _verificarEtapa1(client, pedidoId) {
  const [pdfRes, itensRes] = await Promise.all([
    client.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id=$1 LIMIT 1`, [pedidoId]),
    client.query(
      `SELECT pi.id, pi.categoria_id, pi.sem_vinculo, COALESCE(cat.vinculavel, false) AS vinculavel
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id=$1`,
      [pedidoId]
    ),
  ]);

  if (!pdfRes.rows.length) return false;

  const itens = itensRes.rows;
  if (!itens.length) return false;

  if (!itens.every(it => it.categoria_id != null)) return false;

  const itensVinculaveis = itens.filter(it => it.vinculavel);
  if (itensVinculaveis.length === 0) return true; // nada a vincular

  const itemIds = itensVinculaveis.map(it => it.id);
  const { rows: vinculosRows } = await client.query(
    `SELECT DISTINCT item_id FROM pedido_item_vinculos WHERE item_id = ANY($1)`,
    [itemIds]
  );
  const comVinculo = new Set(vinculosRows.map(r => r.item_id));

  return itensVinculaveis.every(it => it.sem_vinculo || comVinculo.has(it.id));
}
```

A checagem "todos os itens com categoria" (`itens.every(it => it.categoria_id != null)`) **permanece inalterada** — continua valendo para todos os itens, não só os vinculáveis.

### 2.3 `dashboardService.js` (`itens_sem_vinculo`, ~linha 550)

Mesmo ajuste de filtro: contar como pendente apenas itens cuja categoria tem `vinculavel = true` e que não têm vínculo nem `sem_vinculo = true`.

### 2.4 Corrigir `_salvarItens` (remover bug de wipe)

Remover por completo o bloco que apaga/recria `pedido_item_vinculos` com base em `item_vinculado_idx`/`item_vinculado_ordem`:

```js
// REMOVER:
if (insertedIds.length > 0) {
  await client.query(`DELETE FROM pedido_item_vinculos WHERE item_id = ANY($1)`, [insertedIds]);
}
for (let i = 0; i < itens.length; i++) {
  const idx = itens[i].item_vinculado_idx ?? itens[i].item_vinculado_ordem ?? null;
  // ...
}
```

A partir de agora, `pedido_item_vinculos` é gerido **exclusivamente** pelos novos endpoints abaixo. Confirmado: nenhum frontend (incluindo `ImportarPedidoModal`) envia `item_vinculado_idx`/`item_vinculado_ordem` hoje, então a remoção é segura.

> **Atenção ao excluir item:** se um item com vínculos for removido do pedido (via `EditarPedidoModal` → `removeItem`), `ON DELETE CASCADE` em `pedido_item_vinculos` já cuida de remover as linhas órfãs (tanto como `item_id` quanto `item_vinculado_id`).

### 2.5 Novos endpoints (`pedidosRoutes.js`)

Seguindo o padrão de `PATCH /:id/producao-itens` (verificação de posse via JOIN com `pedidos` + `empresa_id`):

**`POST /pedidos/:id/vinculos`** — body `{ item_id, item_vinculado_id }`
- Valida que ambos os itens pertencem ao pedido/empresa.
- Valida `item_id !== item_vinculado_id`.
- Valida que a categoria de `item_id` tem `vinculavel = true` e a categoria de `item_vinculado_id` tem `recebe_vinculos = true`. Erro 400 com mensagem clara caso contrário.
- `DELETE FROM pedido_item_vinculos WHERE item_id = $1` (um item só pode ter um vínculo "pai" por vez) seguido de `INSERT ... ON CONFLICT DO NOTHING`.
- `UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1` (criar vínculo limpa a marcação manual).
- Retorna `{ vinculo: { item_id, item_vinculado_id, tipo_vinculo } }`.

**`DELETE /pedidos/:id/vinculos/:itemId`**
- Valida posse do item.
- `DELETE FROM pedido_item_vinculos WHERE item_id = $1`.
- Retorna `{ message: "Vínculo removido." }`.

**`PATCH /pedidos/:id/itens/:itemId/sem-vinculo`** — body `{ sem_vinculo: boolean }`
- Valida posse do item.
- `UPDATE pedido_itens SET sem_vinculo = $1 WHERE id = $2`.
- Retorna `{ item: { id, sem_vinculo } }`.

Todos os três endpoints, ao final, podem opcionalmente recalcular e retornar o status da Etapa 1 (mesma lógica usada em `PATCH /:id/etapa`), mas **não é obrigatório** — o frontend chama `onRecarregar` ao fechar o modal.

---

## 3. Frontend — Categorias.jsx

No `CategoriaModal` ([Categorias.jsx:30-106](frontend-web/src/pages/catalogo/Categorias.jsx)), abaixo do seletor de cor, dois novos checkboxes:

```jsx
<div className="ag-form-field" style={{ marginTop: 12 }}>
  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
    <input type="checkbox" checked={vinculavel} onChange={(e) => setVinculavel(e.target.checked)} />
    Item vinculável?
  </label>
  <p className="cat-campo-hint">Itens desta categoria podem ser vinculados a um item principal (ex: Trilho → Cortina).</p>

  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 8 }}>
    <input type="checkbox" checked={recebeVinculos} onChange={(e) => setRecebeVinculos(e.target.checked)} />
    Deve receber itens vinculados?
  </label>
  <p className="cat-campo-hint">Itens desta categoria podem ser "principais" e receber outros itens vinculados a eles.</p>
</div>
```

- Estado novo: `vinculavel` (de `categoria?.vinculavel ?? false`), `recebeVinculos` (de `categoria?.recebe_vinculos ?? false`).
- `handleSubmit` inclui `vinculavel` e `recebe_vinculos` no objeto passado a `onSalvar`.
- `Categorias.jsx` → `handleSalvar`: `api.post`/`api.put` em `/categorias` incluem `vinculavel` e `recebe_vinculos` no body.
- Os dois podem ficar marcados simultaneamente (ex: "Cortina" pode ser vinculável a um "Bandô" e também receber um "Trilho").

---

## 4. Frontend — Modal "Vincular Itens"

### 4.1 Acesso

Novo botão **"🔗 Vincular Itens"** em [EtapaDadosPedido.jsx:62-66](frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx#L62-L66), ao lado de "✏️ Editar Pedido" / "🕘 Histórico". Abre `VincularItensModal` (novo arquivo `frontend-web/src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx`).

### 4.2 Carregamento e classificação

Ao abrir, busca `GET /pedidos/:id` (itens com `categoria_id`, `vinculos[]`, `sem_vinculo`, `ambiente`, `descricao`) e `GET /categorias` (com `vinculavel`/`recebe_vinculos`). No client:

- `categoriaPorId` = mapa `id → categoria`.
- `principais` = itens cuja `categoriaPorId[item.categoria_id]?.recebe_vinculos === true`.
- `vinculaveis` = itens cuja `categoriaPorId[item.categoria_id]?.vinculavel === true`.
- Itens sem categoria, ou cuja categoria não é `vinculavel` nem `recebe_vinculos`, **não aparecem** no modal.
- Para cada `principal`, `filhos = vinculaveis.filter(v => v.vinculos[0]?.item_vinculado_id === principal.id)`.
- `vinculaveisPendentes = vinculaveis.filter(v => !v.vinculos.length && !v.sem_vinculo)`.
- `vinculaveisSemVinculoMarcado = vinculaveis.filter(v => !v.vinculos.length && v.sem_vinculo)`.

### 4.3 Layout (árvore agrupada por ambiente)

```
Sala
┌─────────────────────────────────────────────┐
│ 1. Cortina Wave              [Item principal]│
│    └─ 2. Trilho Wave              [remover]  │
│    [+ Vincular item a "Cortina Wave" ▾]      │
└─────────────────────────────────────────────┘

Quarto
┌─────────────────────────────────────────────┐
│ 3. Persiana Rolô             [Item principal]│
│    [+ Vincular item ▾]                       │
└─────────────────────────────────────────────┘

────────────────────────────────────────────────
Itens vinculáveis sem vínculo
┌─────────────────────────────────────────────┐
│ 4. Bandô Liso (Acessórios — Sala)            │
│    [Vincular a... ▾]   [Marcar sem vínculo]  │
└─────────────────────────────────────────────┘

Itens marcados como "sem vínculo"
┌─────────────────────────────────────────────┐
│ 5. Persiana Avulsa (Persianas — Quarto)      │
│    [Sem vínculo]              [desfazer]     │
└─────────────────────────────────────────────┘
```

- Agrupa `principais` por `ambiente` (fallback "Sem ambiente"). Cada card mostra o item principal com badge `[Item principal]`, seus `filhos` indentados com "└─" e botão **remover**, e um seletor inline **"+ Vincular item"**.
- O `<select>` do "+ Vincular item" lista `vinculaveisPendentes` (excluindo o próprio item), ordenado com itens do mesmo `ambiente` primeiro.
- Seção **"Itens vinculáveis sem vínculo"**: lista `vinculaveisPendentes`, cada um com select **"Vincular a..."** (lista `principais`) e botão **"Marcar sem vínculo"**.
- Seção **"Itens marcados como 'sem vínculo'"**: lista `vinculaveisSemVinculoMarcado`, esmaecidos, com botão **"desfazer"**.
- Um item com `vinculavel = true` **e** `recebe_vinculos = true` pode aparecer simultaneamente como cabeçalho de grupo (com seus próprios filhos) **e** como filho dentro de outro grupo — reflete corretamente o papel duplo. Sem aninhamento recursivo além de 1 nível por grupo.

### 4.4 Ações (sem refetch completo — atualiza estado local + chama `onRecarregar` ao fechar)

- Selecionar item no "+ Vincular item" / "Vincular a..." → `POST /pedidos/:id/vinculos`
- "remover" → `DELETE /pedidos/:id/vinculos/:itemId`
- "Marcar sem vínculo" / "desfazer" → `PATCH /pedidos/:id/itens/:itemId/sem-vinculo`

### 4.5 Rodapé

Contador `"X de Y itens vinculáveis resolvidos"` (com vínculo ou marcados "sem vínculo"), espelhando o critério da Etapa 1, e botão "Fechar". Ao fechar, chama `onRecarregar?.()` para atualizar os critérios exibidos na Etapa 1.

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `backend/src/database/migrations/categorias_vinculo_flags.sql` | Novo — adiciona `vinculavel`/`recebe_vinculos` em `categorias` |
| `backend/src/services/categoriaService.js` | `listar`/`buscar`/`criar`/`atualizar` incluem novos campos |
| `backend/src/services/pedidoService.js` | `_verificarEtapa1` filtra por `vinculavel`; `_salvarItens` remove bloco de wipe de vínculos |
| `backend/src/services/dashboardService.js` | `itens_sem_vinculo` filtra por `vinculavel` |
| `backend/src/routes/pedidosRoutes.js` | Novos endpoints: `POST /:id/vinculos`, `DELETE /:id/vinculos/:itemId`, `PATCH /:id/itens/:itemId/sem-vinculo` |
| `frontend-web/src/pages/catalogo/Categorias.jsx` | Checkboxes "Item vinculável?" / "Deve receber itens vinculados?" no `CategoriaModal` |
| `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx` | Novo botão "🔗 Vincular Itens" |
| `frontend-web/src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx` | Novo — modal de vinculação (árvore agrupada) |

---

## Fora do escopo

- Tipos de vínculo além de `'acessorio'` (campo existe na tabela, UI não expõe).
- Validação de ciclos (item A → item B → item A) — segue como antes, fora do escopo.
- Vínculos em outras telas (orçamentos, OS).
- Edição em massa / drag-and-drop.
