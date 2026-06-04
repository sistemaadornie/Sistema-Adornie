# Vínculos entre Itens de Pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a coluna `item_vinculado_id` em `pedido_itens` por uma tabela `pedido_item_vinculos`, exibir os vínculos em hierarquia aninhada no detalhe do pedido, e adicionar a coluna "Vinculado a" editável no modal de edição.

**Architecture:** Migration SQL migra dados existentes para nova tabela e remove a coluna antiga. Backend (`pedidoService.js`) passa a ler e salvar vínculos via a nova tabela. Frontend exibe itens em árvore no detalhe e permite edição via select no modal.

**Tech Stack:** Node.js/Express, PostgreSQL, React (JSX), CSS Grid. Testes com Jest + mocks de `db`.

---

## Arquivos afetados

| Arquivo | Operação |
|---|---|
| `backend/src/database/migrations/pedido_item_vinculos.sql` | Criar |
| `backend/src/services/pedidoService.js` | Modificar — `montarPedido` + `_salvarItens` |
| `backend/src/__tests__/pedidoService.test.js` | Criar |
| `frontend-web/src/pages/pedidos/Pedidos.jsx` | Modificar — `DetalhePedido` + `PedidoModal` |
| `frontend-web/src/pages/pedidos/Pedidos.css` | Modificar — adicionar classes de tree view e modal grid |

`ImportarPedidoModal.jsx` **não é alterado** — o backend absorve a mudança de estrutura.

---

## Task 1: Migration SQL

**Files:**
- Create: `backend/src/database/migrations/pedido_item_vinculos.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- pedido_item_vinculos.sql
-- Cria tabela de vínculos entre itens de pedido e migra dados de item_vinculado_id

CREATE TABLE IF NOT EXISTS pedido_item_vinculos (
  id                SERIAL PRIMARY KEY,
  item_id           INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  item_vinculado_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  tipo_vinculo      VARCHAR(40) NOT NULL DEFAULT 'acessorio',
  UNIQUE (item_id, item_vinculado_id)
);

CREATE INDEX IF NOT EXISTS idx_piv_item           ON pedido_item_vinculos(item_id);
CREATE INDEX IF NOT EXISTS idx_piv_item_vinculado ON pedido_item_vinculos(item_vinculado_id);

-- Migra vínculos existentes (se a coluna ainda existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedido_itens' AND column_name = 'item_vinculado_id'
  ) THEN
    INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
    SELECT id, item_vinculado_id, 'acessorio'
    FROM pedido_itens
    WHERE item_vinculado_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE pedido_itens DROP COLUMN item_vinculado_id;
  END IF;
END $$;
```

- [ ] **Step 2: Executar a migration**

```bash
cd backend
node src/database/run-migration.js pedido_item_vinculos.sql
```

Saída esperada:
```
Executando pedido_item_vinculos.sql...
Migration executada com sucesso.
```

- [ ] **Step 3: Verificar no banco**

Conectar ao banco e rodar:
```sql
SELECT COUNT(*) FROM pedido_item_vinculos;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pedido_itens' AND column_name = 'item_vinculado_id';
-- deve retornar 0 linhas (coluna removida)
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/pedido_item_vinculos.sql
git commit -m "feat(db): tabela pedido_item_vinculos — migra item_vinculado_id"
```

---

## Task 2: Backend — `montarPedido` retorna vinculos

**Files:**
- Modify: `backend/src/services/pedidoService.js` (função `montarPedido`, linhas ~37-57)
- Create: `backend/src/__tests__/pedidoService.test.js`

- [ ] **Step 1: Escrever o teste que vai falhar**

Criar `backend/src/__tests__/pedidoService.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/pedidoService');

afterEach(() => jest.clearAllMocks());

describe('buscar (montarPedido)', () => {
  test('inclui vinculos nos itens', async () => {
    const pedidoRow = {
      id: 1, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 1,
      cliente_nome: 'Ana', cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };
    const itensRows = [
      { id: 10, pedido_id: 1, descricao: 'Cortina Wave', ordem: 0, os_id: null, os_status: null },
      { id: 11, pedido_id: 1, descricao: 'Trilho Wave',  ordem: 1, os_id: null, os_status: null },
    ];
    const vinculosRows = [
      { item_id: 11, item_vinculado_id: 10, tipo_vinculo: 'acessorio' },
    ];

    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] })   // SELECT pedidos
      .mockResolvedValueOnce({ rows: itensRows })      // SELECT pedido_itens
      .mockResolvedValueOnce({ rows: [] })             // SELECT pedido_pagamentos
      .mockResolvedValueOnce({ rows: vinculosRows });  // SELECT pedido_item_vinculos

    const result = await svc.buscar(1, 10);

    expect(result.itens).toHaveLength(2);
    expect(result.itens[0].vinculos).toEqual([]);
    expect(result.itens[1].vinculos).toEqual([
      { item_vinculado_id: 10, tipo_vinculo: 'acessorio' },
    ]);
  });

  test('retorna vinculos vazio quando nao ha vinculos', async () => {
    const pedidoRow = {
      id: 2, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 2,
      cliente_nome: null, cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };
    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] })
      .mockResolvedValueOnce({ rows: [{ id: 20, pedido_id: 2, descricao: 'Persiana', ordem: 0, os_id: null, os_status: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await svc.buscar(2, 10);

    expect(result.itens[0].vinculos).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd backend
npx jest pedidoService.test.js --no-coverage
```

Saída esperada: FAIL — `result.itens[0].vinculos is not iterable` ou `undefined`.

- [ ] **Step 3: Alterar `montarPedido` em `pedidoService.js`**

Localizar a função `montarPedido` (linha ~18). Substituir o bloco que monta `itens` e retorna o resultado:

**Antes (linhas ~37-57):**
```js
  const itensRes = await db.query(
    `SELECT pi.*, os.id AS os_id, os.status AS os_status
     FROM pedido_itens pi
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     WHERE pi.pedido_id=$1
     ORDER BY pi.ordem, pi.id`,
    [id]
  );

  const pagRes = await db.query(
    `SELECT * FROM pedido_pagamentos WHERE pedido_id=$1 ORDER BY forma, ordem, id`,
    [id]
  );

  return {
    ...p,
    numero_rua: p.numero,
    numero: p.numero_origem || fmtNumero(p.numero_sequencial || p.id),
    itens: itensRes.rows,
    pagamentos: pagRes.rows,
  };
```

**Depois:**
```js
  const itensRes = await db.query(
    `SELECT pi.*, os.id AS os_id, os.status AS os_status
     FROM pedido_itens pi
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     WHERE pi.pedido_id=$1
     ORDER BY pi.ordem, pi.id`,
    [id]
  );

  const pagRes = await db.query(
    `SELECT * FROM pedido_pagamentos WHERE pedido_id=$1 ORDER BY forma, ordem, id`,
    [id]
  );

  const itemIds = itensRes.rows.map(r => r.id);
  let vinculosPorItem = {};
  if (itemIds.length > 0) {
    const vinculosRes = await db.query(
      `SELECT item_id, item_vinculado_id, tipo_vinculo
       FROM pedido_item_vinculos
       WHERE item_id = ANY($1)`,
      [itemIds]
    );
    for (const v of vinculosRes.rows) {
      if (!vinculosPorItem[v.item_id]) vinculosPorItem[v.item_id] = [];
      vinculosPorItem[v.item_id].push({
        item_vinculado_id: v.item_vinculado_id,
        tipo_vinculo: v.tipo_vinculo,
      });
    }
  }

  return {
    ...p,
    numero_rua: p.numero,
    numero: p.numero_origem || fmtNumero(p.numero_sequencial || p.id),
    itens: itensRes.rows.map(it => ({
      ...it,
      vinculos: vinculosPorItem[it.id] || [],
    })),
    pagamentos: pagRes.rows,
  };
```

- [ ] **Step 4: Rodar os testes**

```bash
cd backend
npx jest pedidoService.test.js --no-coverage
```

Saída esperada: PASS (2 testes passando).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "feat(backend): montarPedido inclui vinculos de pedido_item_vinculos"
```

---

## Task 3: Backend — `_salvarItens` persiste vínculos

**Files:**
- Modify: `backend/src/services/pedidoService.js` (função `_salvarItens`, linhas ~107-201)
- Modify: `backend/src/__tests__/pedidoService.test.js`

- [ ] **Step 1: Escrever o teste que vai falhar**

Adicionar ao final de `pedidoService.test.js`:

```js
// helper para criar cliente de transação mockado
function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  // resposta padrão para qualquer chamada extra
  client.query.mockResolvedValue({ rows: [] });
  return client;
}

describe('criar (salva vinculos)', () => {
  test('insere em pedido_item_vinculos quando item_vinculado_idx esta definido', async () => {
    const fakeId = 99;
    // Sem cliente_id no payload → a validação de cliente é pulada (sem db.query extra)
    // db.query usado apenas por montarPedido após commit (itens retornado é vazio → sem 4ª chamada)
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })   // SELECT pedido_itens (vazio)
      .mockResolvedValueOnce({ rows: [] });  // SELECT pedido_pagamentos

    const client = makeClient([
      { rows: [] },                           // BEGIN
      { rows: [{ seq: 1 }] },                // nextval
      { rows: [{ id: fakeId }] },            // INSERT pedidos
      { rows: [] },                           // SELECT existing ids
      { rows: [{ id: 10 }] },               // INSERT item 0 (cortina)
      { rows: [{ id: 11 }] },               // INSERT item 1 (trilho)
      { rows: [] },                           // DELETE pedido_item_vinculos
      { rows: [] },                           // INSERT vínculo trilho→cortina
      { rows: [] },                           // DELETE pagamentos
      { rows: [] },                           // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = {
      status: 'pendente',
      itens: [
        { descricao: 'Cortina Wave', quantidade: 1, item_vinculado_idx: null },
        { descricao: 'Trilho Wave',  quantidade: 1, item_vinculado_idx: 0 },
      ],
      pagamentos: [],
    };

    await svc.criar(10, 99, dados);

    // Verifica INSERT em pedido_item_vinculos
    const insertVinculoCall = client.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO pedido_item_vinculos')
    );
    expect(insertVinculoCall).toBeDefined();
    expect(insertVinculoCall[1]).toEqual([11, 10, 'acessorio']);
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd backend
npx jest pedidoService.test.js --no-coverage
```

Saída esperada: FAIL — o INSERT em `pedido_item_vinculos` não é chamado.

- [ ] **Step 3: Alterar o UPDATE em `_salvarItens`**

Localizar o UPDATE existente (linha ~133). Remover `item_vinculado_id = COALESCE($13, item_vinculado_id),` e renumerar os parâmetros seguintes:

**Antes:**
```js
      await client.query(
        `UPDATE pedido_itens
         SET ambiente=$1, referencia=$2, cor=$3, descricao=$4, medidas=$5,
             quantidade=$6, unidade=$7, preco_unitario=$8, valor=$9, ordem=$10,
             modelo=$11, especificacoes=$12, item_vinculado_id = COALESCE($13, item_vinculado_id),
             largura=$16, altura=$17
         WHERE id=$14 AND pedido_id=$15`,
        [
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
          it.item_vinculado_id   || null,
          itemId,
          pedidoId,
          toDecimal(it.largura),
          toDecimal(it.altura),
        ]
      );
```

**Depois:**
```js
      await client.query(
        `UPDATE pedido_itens
         SET ambiente=$1, referencia=$2, cor=$3, descricao=$4, medidas=$5,
             quantidade=$6, unidade=$7, preco_unitario=$8, valor=$9, ordem=$10,
             modelo=$11, especificacoes=$12,
             largura=$13, altura=$14
         WHERE id=$15 AND pedido_id=$16`,
        [
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
          toDecimal(it.largura),
          toDecimal(it.altura),
          itemId,
          pedidoId,
        ]
      );
```

- [ ] **Step 4: Substituir o loop de resolução de `item_vinculado_ordem` no final de `_salvarItens`**

Localizar o bloco (linha ~192):
```js
  // Resolve item_vinculado_ordem → item_vinculado_id para novos itens
  for (let i = 0; i < itens.length; i++) {
    const ordem = itens[i].item_vinculado_ordem;
    if (ordem != null && Number.isFinite(Number(ordem)) && Number(ordem) !== i && insertedIds[Number(ordem)] != null) {
      await client.query(
        `UPDATE pedido_itens SET item_vinculado_id = $1 WHERE id = $2`,
        [insertedIds[Number(ordem)], insertedIds[i]]
      );
    }
  }
```

**Substituir por:**
```js
  // Salva vínculos na tabela pedido_item_vinculos
  // Suporta item_vinculado_idx (PedidoModal) e item_vinculado_ordem (ImportarPedidoModal — compat)
  if (insertedIds.length > 0) {
    await client.query(
      `DELETE FROM pedido_item_vinculos WHERE item_id = ANY($1)`,
      [insertedIds]
    );
  }
  for (let i = 0; i < itens.length; i++) {
    const idx = itens[i].item_vinculado_idx ?? itens[i].item_vinculado_ordem ?? null;
    if (idx != null && Number.isFinite(Number(idx)) && insertedIds[Number(idx)] != null) {
      await client.query(
        `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [insertedIds[i], insertedIds[Number(idx)], itens[i].tipo_vinculo || 'acessorio']
      );
    }
  }
```

- [ ] **Step 5: Rodar todos os testes do backend**

```bash
cd backend
npx jest --no-coverage
```

Saída esperada: todos os testes passando (incluindo os testes existentes de `orcamentoService`, `prazosService`, etc.).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "feat(backend): _salvarItens persiste vinculos em pedido_item_vinculos"
```

---

## Task 4: Frontend — Visualização em árvore no detalhe do pedido

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx` (função `DetalhePedido`)
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

- [ ] **Step 1: Adicionar CSS para os itens filhos**

Em `Pedidos.css`, adicionar ao final do arquivo:

```css
/* ── TREE VIEW — itens vinculados no detalhe ── */
.pd-item-filho {
  background: rgba(0, 0, 0, 0.025);
}
.pd-item-filho td {
  border-top: none;
}
.pd-item-indent {
  color: var(--color-text-muted);
  margin-right: 4px;
  font-size: 11px;
  user-select: none;
}
```

- [ ] **Step 2: Atualizar `DetalhePedido` para renderizar em árvore**

Localizar a função `DetalhePedido` em `Pedidos.jsx`. Substituir o bloco da seção "Itens" (linha ~504):

**Antes:**
```jsx
        {/* Itens */}
        {pedido.itens?.length > 0 && (
          <div className="pd-detalhe-section">
            <div className="cl-section-title">Itens do Pedido</div>
            <div className="pd-itens-table-wrap">
              <table className="pd-itens-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ambiente</th>
                    <th>Referência</th>
                    <th>Cor</th>
                    <th>Produto</th>
                    <th>Medidas</th>
                    <th>Qtde</th>
                    <th>Un</th>
                    <th>Preço</th>
                    <th>Total</th>
                    <th>Ficha OS</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map((it, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{it.ambiente || "—"}</td>
                      <td>{it.referencia || "—"}</td>
                      <td>{it.cor || "—"}</td>
                      <td>{it.descricao}</td>
                      <td>{it.medidas || "—"}</td>
                      <td>{it.quantidade}</td>
                      <td>{it.unidade || "—"}</td>
                      <td>{it.preco_unitario != null ? `R$ ${fmtMoeda(it.preco_unitario)}` : "—"}</td>
                      <td style={{ fontWeight: 600 }}>{it.valor != null ? `R$ ${fmtMoeda(it.valor)}` : "—"}</td>
                      <td>
                        {ehCortina(it.descricao, it.referencia) ? (
                          it.os_id ? (
                            <button
                              onClick={() => onAbrirOS(it.os_id)}
                              className="ek-btn"
                              style={{
                                fontSize: 11,
                                padding: "4px 8px",
                                background: it.os_status === "aberta" ? "#fef3c7" : "#d1fae5",
                                color: it.os_status === "aberta" ? "#d97706" : "#065f46",
                                border: `1px solid ${it.os_status === "aberta" ? "#fcd34d" : "#6ee7b7"}`,
                                fontWeight: 600
                              }}
                            >
                              {it.os_status === "aberta" ? "📋 OS: Aberta" : "✅ OS: Preenchida"}
                            </button>
                          ) : (
                            <button
                              onClick={() => onGerarOS(it.id)}
                              className="ek-btn ek-btn-secondary"
                              style={{ fontSize: 11, padding: "4px 8px" }}
                            >
                              📋 Gerar OS
                            </button>
                          )
                        ) : (
                          <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
```

**Depois:**
```jsx
        {/* Itens */}
        {pedido.itens?.length > 0 && (() => {
          // Monta árvore: pai → [filhos]
          const idSet = new Set(pedido.itens.map(it => it.id));
          const filhosPorPai = {};
          for (const it of pedido.itens) {
            const paiId = it.vinculos?.[0]?.item_vinculado_id;
            if (paiId && idSet.has(paiId)) {
              if (!filhosPorPai[paiId]) filhosPorPai[paiId] = [];
              filhosPorPai[paiId].push(it);
            }
          }
          const idsFilhos = new Set(Object.values(filhosPorPai).flat().map(it => it.id));
          const itensOrdenados = [];
          let seq = 1;
          for (const pai of pedido.itens.filter(it => !idsFilhos.has(it.id))) {
            itensOrdenados.push({ item: pai, nivel: 0, seq: seq++ });
            for (const filho of (filhosPorPai[pai.id] || [])) {
              itensOrdenados.push({ item: filho, nivel: 1, seq: seq++ });
            }
          }

          return (
            <div className="pd-detalhe-section">
              <div className="cl-section-title">Itens do Pedido</div>
              <div className="pd-itens-table-wrap">
                <table className="pd-itens-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ambiente</th>
                      <th>Referência</th>
                      <th>Cor</th>
                      <th>Produto</th>
                      <th>Medidas</th>
                      <th>Qtde</th>
                      <th>Un</th>
                      <th>Preço</th>
                      <th>Total</th>
                      <th>Ficha OS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensOrdenados.map(({ item: it, nivel, seq: s }) => (
                      <tr key={it.id} className={nivel > 0 ? "pd-item-filho" : ""}>
                        <td>
                          {nivel > 0 && <span className="pd-item-indent">└─</span>}
                          {s}
                        </td>
                        <td>{it.ambiente || "—"}</td>
                        <td>{it.referencia || "—"}</td>
                        <td>{it.cor || "—"}</td>
                        <td>{it.descricao}</td>
                        <td>{it.medidas || "—"}</td>
                        <td>{it.quantidade}</td>
                        <td>{it.unidade || "—"}</td>
                        <td>{it.preco_unitario != null ? `R$ ${fmtMoeda(it.preco_unitario)}` : "—"}</td>
                        <td style={{ fontWeight: 600 }}>{it.valor != null ? `R$ ${fmtMoeda(it.valor)}` : "—"}</td>
                        <td>
                          {ehCortina(it.descricao, it.referencia) ? (
                            it.os_id ? (
                              <button
                                onClick={() => onAbrirOS(it.os_id)}
                                className="ek-btn"
                                style={{
                                  fontSize: 11,
                                  padding: "4px 8px",
                                  background: it.os_status === "aberta" ? "#fef3c7" : "#d1fae5",
                                  color: it.os_status === "aberta" ? "#d97706" : "#065f46",
                                  border: `1px solid ${it.os_status === "aberta" ? "#fcd34d" : "#6ee7b7"}`,
                                  fontWeight: 600
                                }}
                              >
                                {it.os_status === "aberta" ? "📋 OS: Aberta" : "✅ OS: Preenchida"}
                              </button>
                            ) : (
                              <button
                                onClick={() => onGerarOS(it.id)}
                                className="ek-btn ek-btn-secondary"
                                style={{ fontSize: 11, padding: "4px 8px" }}
                              >
                                📋 Gerar OS
                              </button>
                            )
                          ) : (
                            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(frontend): detalhe do pedido exibe itens vinculados em arvore aninhada"
```

---

## Task 5: Frontend — Coluna "Vinculado a" no modal de edição

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx` (função `PedidoModal` e `itemVazio`)
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

- [ ] **Step 1: Adicionar CSS para o grid do modal com a nova coluna**

Em `Pedidos.css`, adicionar ao final do arquivo:

```css
/* ── EDITOR DE ITENS no PedidoModal (medidas único + Vinculado a) ── */
.pd-modal-itens.pd-itens-editor .pd-itens-editor-header,
.pd-modal-itens.pd-itens-editor .pd-itens-editor-row {
  /* # | Ambiente | Ref | Cor | Produto | Medidas | Qtde | Un | Preço Unit. | Total | Vinculado a | × */
  grid-template-columns: 28px 100px 90px 80px 1fr 100px 52px 60px 90px 80px 140px 28px;
}
```

- [ ] **Step 2: Atualizar `itemVazio` para incluir `item_vinculado_idx`**

Localizar (linha ~46):
```js
function itemVazio() {
  return { ambiente: "", referencia: "", cor: "", descricao: "", medidas: "", quantidade: 1, unidade: "UN", preco_unitario: "", valor: "" };
}
```

**Depois:**
```js
function itemVazio() {
  return { ambiente: "", referencia: "", cor: "", descricao: "", medidas: "", quantidade: 1, unidade: "UN", preco_unitario: "", valor: "", item_vinculado_idx: null };
}
```

- [ ] **Step 3: Resolver vinculos ao inicializar o estado de itens no `PedidoModal`**

Localizar (linha ~665):
```js
  const [itens,     setItens]     = useState(pedido?.itens?.length ? pedido.itens.map(it => ({ ...it })) : [itemVazio()]);
```

**Depois:**
```js
  const [itens, setItens] = useState(() => {
    if (!pedido?.itens?.length) return [itemVazio()];
    return pedido.itens.map((it, _, arr) => {
      const vinculoId = it.vinculos?.[0]?.item_vinculado_id ?? null;
      const vinculoIdx = vinculoId != null ? arr.findIndex(other => other.id === vinculoId) : -1;
      return { ...it, item_vinculado_idx: vinculoIdx >= 0 ? vinculoIdx : null };
    });
  });
```

- [ ] **Step 4: Atualizar o header da aba Itens no `PedidoModal`**

Localizar o bloco `{/* ─── ABA: ITENS ─── */}` (linha ~906). Substituir o header e o wrapper do editor:

**Antes:**
```jsx
              <div className="pd-itens-editor">
                <div className="pd-itens-editor-header">
                  <span>#</span>
                  <span>Ambiente</span>
                  <span>Referência</span>
                  <span>Cor</span>
                  <span>Produto</span>
                  <span>Medidas</span>
                  <span>Qtde</span>
                  <span>Un</span>
                  <span>Preço Unit.</span>
                  <span>Total</span>
                  <span></span>
                </div>
```

**Depois:**
```jsx
              <div className="pd-modal-itens pd-itens-editor">
                <div className="pd-itens-editor-header">
                  <span>#</span>
                  <span>Ambiente</span>
                  <span>Referência</span>
                  <span>Cor</span>
                  <span>Produto</span>
                  <span>Medidas</span>
                  <span>Qtde</span>
                  <span>Un</span>
                  <span>Preço Unit.</span>
                  <span>Total</span>
                  <span>Vinculado a</span>
                  <span></span>
                </div>
```

- [ ] **Step 5: Adicionar o select "Vinculado a" em cada linha de item**

Localizar as linhas de item no `PedidoModal` (linha ~922):

**Antes:**
```jsx
                {itens.map((it, i) => (
                  <div key={i} className="pd-itens-editor-row">
                    <span className="pd-item-num">{i + 1}</span>
                    <input placeholder="Sala" value={it.ambiente} onChange={(e) => setItem(i, "ambiente", e.target.value)} />
                    <input placeholder="ADO500" value={it.referencia} onChange={(e) => setItem(i, "referencia", e.target.value)} />
                    <input placeholder="Offwhite" value={it.cor} onChange={(e) => setItem(i, "cor", e.target.value)} />
                    <input placeholder="Descrição do produto" value={it.descricao} onChange={(e) => setItem(i, "descricao", e.target.value)} className="pd-item-desc" />
                    <input placeholder="2,00x3,00" value={it.medidas} onChange={(e) => setItem(i, "medidas", e.target.value)} />
                    <input type="number" min="0" step="0.01" value={it.quantidade} onChange={(e) => setItem(i, "quantidade", e.target.value)} />
                    <select value={it.unidade} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" placeholder="0,00" value={it.preco_unitario} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
                    <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
                    <button className="pd-item-del" onClick={() => removeItem(i)} title="Remover item">×</button>
                  </div>
                ))}
```

**Depois:**
```jsx
                {itens.map((it, i) => (
                  <div key={i} className="pd-itens-editor-row">
                    <span className="pd-item-num">{i + 1}</span>
                    <input placeholder="Sala" value={it.ambiente} onChange={(e) => setItem(i, "ambiente", e.target.value)} />
                    <input placeholder="ADO500" value={it.referencia} onChange={(e) => setItem(i, "referencia", e.target.value)} />
                    <input placeholder="Offwhite" value={it.cor} onChange={(e) => setItem(i, "cor", e.target.value)} />
                    <input placeholder="Descrição do produto" value={it.descricao} onChange={(e) => setItem(i, "descricao", e.target.value)} className="pd-item-desc" />
                    <input placeholder="2,00x3,00" value={it.medidas} onChange={(e) => setItem(i, "medidas", e.target.value)} />
                    <input type="number" min="0" step="0.01" value={it.quantidade} onChange={(e) => setItem(i, "quantidade", e.target.value)} />
                    <select value={it.unidade} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" placeholder="0,00" value={it.preco_unitario} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
                    <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
                    <select
                      value={it.item_vinculado_idx ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItem(i, "item_vinculado_idx", v === "" ? null : Number(v));
                      }}
                      style={{ fontSize: 11 }}
                    >
                      <option value="">— Nenhum —</option>
                      {itens.map((other, j) => j !== i ? (
                        <option key={j} value={j}>
                          {j + 1} – {other.descricao || "(sem desc.)"}
                        </option>
                      ) : null)}
                    </select>
                    <button className="pd-item-del" onClick={() => removeItem(i)} title="Remover item">×</button>
                  </div>
                ))}
```

- [ ] **Step 6: Iniciar o servidor e verificar manualmente**

```bash
# Terminal 1 — backend
cd backend && npm start

# Terminal 2 — frontend
cd frontend-web && npm start
```

Fluxo a verificar:
1. Abrir um pedido com itens trilho+cortina (importado anteriormente)
2. Verificar que o detalhe exibe o trilho indentado abaixo da cortina com `└─`
3. Clicar em "Editar" → aba Itens → verificar que a coluna "Vinculado a" aparece
4. Verificar que o trilho já mostra o select apontando para a cortina
5. Alterar o vínculo, salvar e reabrir — verificar que o novo vínculo persiste
6. Criar um pedido novo, adicionar 2 itens, vincular um ao outro, salvar, verificar detalhe

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(frontend): coluna Vinculado a editavel no modal de pedido"
```

---

## Checklist de verificação final

- [ ] `npx jest --no-coverage` no backend: todos passando
- [ ] Detalhe do pedido: trilhos aparecem indentados com `└─` abaixo das cortinas
- [ ] Modal de edição: select "Vinculado a" exibe e persiste vínculos corretamente
- [ ] Pedido importado via `ImportarPedidoModal`: vínculo salvo na nova tabela (sem mudança na UI de importação)
- [ ] Excluir um item pai: item filho vira raiz na próxima abertura (ON DELETE CASCADE limpa o vínculo)
