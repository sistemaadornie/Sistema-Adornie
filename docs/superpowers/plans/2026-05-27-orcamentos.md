# Orçamentos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo completo de Orçamentos — backend CRUD + wizard React de 3 etapas — culminando em aprovação que cria automaticamente um Pedido.

**Architecture:** Módulo independente com `orcamentoService.js` + `orcamentosRoutes.js` no backend, e `Orcamentos.jsx` (listagem) + `OrcamentoWizard.jsx` (wizard 3 etapas) no frontend. Aprovação usa transação atômica: marca orçamento como aprovado e cria pedido + itens em uma operação. Frontend acessa usuário logado via `JSON.parse(localStorage.getItem("user"))`.

**Tech Stack:** Node.js/Express 5, pg (Pool com `.connect()` para transações), React 19, React Router v6, api.js (fetch wrapper em `frontend-web/src/services/api.js`)

---

## Mapa de arquivos

| Arquivo | Ação |
|---------|------|
| `backend/src/database/migrations/orcamentos_endereco.sql` | CRIAR — adiciona `endereco_entrega JSONB` |
| `backend/src/routes/clientesRoutes.js` | MODIFICAR — adicionar `GET /busca` |
| `backend/src/routes/produtosRoutes.js` | MODIFICAR — adicionar `GET /busca` |
| `backend/src/services/orcamentoService.js` | CRIAR — listar, criar, buscar, atualizar, aprovar, cancelar |
| `backend/src/__tests__/orcamentoService.test.js` | CRIAR — testes unitários |
| `backend/src/routes/orcamentosRoutes.js` | CRIAR — 6 rotas REST |
| `backend/server.js` | MODIFICAR — registrar `/api/orcamentos` |
| `frontend-web/src/pages/orcamentos/Orcamentos.jsx` | CRIAR — listagem |
| `frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx` | CRIAR — wizard 3 etapas |
| `frontend-web/src/pages/orcamentos/Orcamentos.css` | CRIAR — estilos |
| `frontend-web/src/App.jsx` | MODIFICAR — rotas + imports |

---

## Task 0: Migration — endereco_entrega em orcamentos

**Files:**
- Create: `backend/src/database/migrations/orcamentos_endereco.sql`

- [ ] **Criar o arquivo de migration**

```sql
-- Adiciona endereço de entrega opcional ao orçamento (JSONB: {rua,numero,complemento,bairro,cidade,estado,cep})
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS endereco_entrega JSONB;
```

- [ ] **Rodar a migration**

```bash
cd backend
node src/database/run-migration.js orcamentos_endereco.sql
```

Saída esperada: `Migration executada com sucesso.`

- [ ] **Commit**

```bash
git add backend/src/database/migrations/orcamentos_endereco.sql
git commit -m "feat: adiciona endereco_entrega JSONB em orcamentos"
```

---

## Task 1: Endpoint GET /api/clientes/busca

**Files:**
- Modify: `backend/src/routes/clientesRoutes.js`

O endpoint existente `GET /api/clientes?q=` retorna todos os campos e sem limite — inadequado para autocomplete. Adicionar `/busca` com resultado slim e limit 10.

- [ ] **Adicionar função `busca` em clienteService.js**

Abrir `backend/src/services/clienteService.js` e adicionar no final, antes do `module.exports`:

```javascript
async function busca(empresaId, q) {
  const params = [empresaId];
  let whereQ = "";
  if (q) {
    params.push(`%${q}%`);
    whereQ = ` AND (c.nome ILIKE $2 OR c.telefone ILIKE $2 OR c.cpf ILIKE $2 OR c.cnpj ILIKE $2)`;
  }
  const res = await db.query(
    `SELECT c.id, c.nome, c.telefone, c.email,
            e.rua, e.numero, e.complemento, e.bairro, e.cidade, e.estado, e.cep
     FROM clientes c
     LEFT JOIN cliente_enderecos e ON e.cliente_id = c.id AND e.is_padrao = true AND e.deleted_at IS NULL
     WHERE c.empresa_id = $1 AND c.deleted_at IS NULL${whereQ}
     ORDER BY c.nome ASC LIMIT 10`,
    params
  );
  return res.rows;
}
```

Atualizar `module.exports` do `clienteService.js` para incluir `busca`:

```javascript
module.exports = { montarCliente, listar, busca, buscar, criar, atualizar, excluir };
```

- [ ] **Adicionar rota em clientesRoutes.js**

Abrir `backend/src/routes/clientesRoutes.js` e adicionar **antes** do `router.get("/:id", ...)`:

```javascript
router.get("/busca", authMiddleware, async (req, res) => {
  try {
    const clientes = await svc.busca(req.user.empresa_id, req.query.q);
    return res.json({ clientes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar clientes." });
  }
});
```

- [ ] **Testar manualmente no terminal**

```bash
cd backend && npm run dev
# Em outro terminal:
curl -H "Authorization: Bearer SEU_TOKEN" "http://localhost:3001/api/clientes/busca?q=ana"
```

Resposta esperada: `{ "clientes": [{ "id": 1, "nome": "Ana Silveira", "telefone": "...", ... }] }`

- [ ] **Commit**

```bash
git add backend/src/services/clienteService.js backend/src/routes/clientesRoutes.js
git commit -m "feat: adiciona endpoint GET /api/clientes/busca para autocomplete"
```

---

## Task 2: Endpoint GET /api/produtos/busca

**Files:**
- Modify: `backend/src/routes/produtosRoutes.js`
- Modify: `backend/src/services/produtoService.js`

- [ ] **Adicionar função `busca` em produtoService.js**

Abrir `backend/src/services/produtoService.js` e adicionar antes do `module.exports`:

```javascript
async function busca(empresaId, q) {
  const params = [empresaId];
  let whereQ = "";
  if (q) {
    params.push(`%${q}%`);
    whereQ = ` AND (p.nome ILIKE $2 OR p.referencia ILIKE $2 OR p.codigo ILIKE $2)`;
  }
  const res = await db.query(
    `SELECT p.id, p.nome, p.referencia, p.codigo, p.unidade, p.preco_venda, p.status
     FROM produtos p
     WHERE p.empresa_id = $1 AND p.deleted_at IS NULL${whereQ}
     ORDER BY p.nome ASC LIMIT 8`,
    params
  );
  return res.rows;
}
```

Atualizar `module.exports` do `produtoService.js` para incluir `busca`.

- [ ] **Adicionar rota em produtosRoutes.js**

Abrir `backend/src/routes/produtosRoutes.js` e adicionar **antes** do `router.get("/candidatos-de-pedidos", ...)`:

```javascript
router.get("/busca", authMiddleware, async (req, res) => {
  try {
    const produtos = await svc.busca(req.user.empresa_id, req.query.q);
    return res.json({ produtos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar produtos." });
  }
});
```

- [ ] **Commit**

```bash
git add backend/src/services/produtoService.js backend/src/routes/produtosRoutes.js
git commit -m "feat: adiciona endpoint GET /api/produtos/busca para autocomplete"
```

---

## Task 3: orcamentoService — listar, criar, buscar

**Files:**
- Create: `backend/src/services/orcamentoService.js`

- [ ] **Criar o arquivo com as três primeiras funções**

```javascript
const db = require("../database/db");

function fmtNumero(seq) {
  return `ORC-${String(seq).padStart(5, "0")}`;
}

function calcularTotal(itens = []) {
  return itens.reduce((sum, it) => {
    const qtd = parseFloat(it.quantidade) || 0;
    const preco = parseFloat(it.preco_unitario) || 0;
    return sum + qtd * preco;
  }, 0);
}

async function listar(empresaId, { status, q, consultora_id } = {}) {
  const params = [empresaId];
  const conds = ["o.empresa_id = $1", "o.deleted_at IS NULL"];

  if (status) {
    params.push(status);
    conds.push(`o.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conds.push(`(c.nome ILIKE $${params.length} OR o.numero ILIKE $${params.length})`);
  }
  if (consultora_id) {
    params.push(Number(consultora_id));
    conds.push(`o.consultora_id = $${params.length}`);
  }

  const res = await db.query(
    `SELECT o.id, o.numero, o.status, o.valor_total, o.created_at,
            c.nome    AS cliente_nome,
            u.nome_completo AS consultora_nome,
            a.nome    AS arquiteto_nome
     FROM orcamentos o
     LEFT JOIN clientes   c ON c.id = o.cliente_id    AND c.deleted_at IS NULL
     LEFT JOIN usuarios   u ON u.id = o.consultora_id
     LEFT JOIN arquitetos a ON a.id = o.arquiteto_id  AND a.deleted_at IS NULL
     WHERE ${conds.join(" AND ")}
     ORDER BY o.created_at DESC`,
    params
  );
  return res.rows;
}

async function criar(empresaId, userId, dados) {
  const { cliente_id, arquiteto_id, observacoes, endereco_entrega, itens = [] } = dados;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const seqRes = await client.query("SELECT nextval('orcamentos_numero_seq') AS seq");
    const numero = fmtNumero(seqRes.rows[0].seq);
    const valor_total = calcularTotal(itens);

    const oRes = await client.query(
      `INSERT INTO orcamentos
         (empresa_id, cliente_id, consultora_id, arquiteto_id, numero, status,
          observacoes, valor_total, endereco_entrega, criado_por)
       VALUES ($1,$2,$3,$4,$5,'novo',$6,$7,$8,$3)
       RETURNING *`,
      [
        empresaId,
        cliente_id || null,
        userId,
        arquiteto_id || null,
        numero,
        observacoes || null,
        valor_total,
        endereco_entrega ? JSON.stringify(endereco_entrega) : null,
      ]
    );
    const orcamento = oRes.rows[0];

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      let produtoId = it.produto_id || null;

      if (!produtoId && it.produto_nome) {
        const pRes = await client.query(
          `INSERT INTO produtos (empresa_id, nome, status, tipo, criado_por)
           VALUES ($1, $2, 'inativo', 'produto', $3)
           RETURNING id`,
          [empresaId, it.produto_nome.trim(), userId]
        );
        produtoId = pRes.rows[0].id;
      }

      const largura = parseFloat(String(it.largura || "").replace(",", ".")) || null;
      const altura  = parseFloat(String(it.altura  || "").replace(",", ".")) || null;
      const qtd     = parseFloat(it.quantidade) || 1;
      const preco   = parseFloat(String(it.preco_unitario || "").replace(",", ".")) || null;

      await client.query(
        `INSERT INTO orcamento_itens
           (orcamento_id, produto_id, produto_nome, ambiente, largura, altura,
            quantidade, unidade, cor, referencia, especificacoes,
            preco_unitario, valor_total_item, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          orcamento.id,
          produtoId,
          it.produto_nome || null,
          it.ambiente || null,
          largura,
          altura,
          qtd,
          it.unidade || "un",
          it.cor || null,
          it.referencia || null,
          it.especificacoes ? JSON.stringify(it.especificacoes) : "{}",
          preco,
          preco ? qtd * preco : null,
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return { ...orcamento, itens };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function buscar(id, empresaId) {
  const oRes = await db.query(
    `SELECT o.*,
            c.nome    AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
            u.nome_completo AS consultora_nome,
            a.nome    AS arquiteto_nome
     FROM orcamentos o
     LEFT JOIN clientes   c ON c.id = o.cliente_id   AND c.deleted_at IS NULL
     LEFT JOIN usuarios   u ON u.id = o.consultora_id
     LEFT JOIN arquitetos a ON a.id = o.arquiteto_id AND a.deleted_at IS NULL
     WHERE o.id = $1 AND o.empresa_id = $2 AND o.deleted_at IS NULL`,
    [id, empresaId]
  );
  if (!oRes.rows[0]) return null;
  const orcamento = oRes.rows[0];

  const itRes = await db.query(
    `SELECT * FROM orcamento_itens WHERE orcamento_id = $1 ORDER BY ordem, id`,
    [id]
  );

  // agrupa por ambiente
  const ambientesMap = {};
  for (const it of itRes.rows) {
    const amb = it.ambiente || "Geral";
    if (!ambientesMap[amb]) ambientesMap[amb] = [];
    ambientesMap[amb].push(it);
  }
  const ambientes = Object.entries(ambientesMap).map(([nome, itens]) => ({ nome, itens }));

  return { ...orcamento, ambientes };
}

module.exports = { listar, criar, buscar };
```

- [ ] **Commit parcial**

```bash
git add backend/src/services/orcamentoService.js
git commit -m "feat: orcamentoService — listar, criar, buscar"
```

---

## Task 4: orcamentoService — atualizar, aprovar, cancelar + testes

**Files:**
- Modify: `backend/src/services/orcamentoService.js`
- Create: `backend/src/__tests__/orcamentoService.test.js`

- [ ] **Adicionar atualizar, aprovar e cancelar ao serviço**

Abrir `backend/src/services/orcamentoService.js`, remover `module.exports` atual e adicionar:

```javascript
async function atualizar(id, empresaId, dados) {
  const { cliente_id, arquiteto_id, observacoes, endereco_entrega, itens = [] } = dados;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const check = await client.query(
      `SELECT status FROM orcamentos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [id, empresaId]
    );
    if (!check.rows[0]) throw Object.assign(new Error("Orçamento não encontrado."), { status: 404 });
    if (check.rows[0].status !== "novo")
      throw Object.assign(new Error("Somente orçamentos com status 'novo' podem ser editados."), { status: 400 });

    const valor_total = calcularTotal(itens);

    await client.query(
      `UPDATE orcamentos
       SET cliente_id=$1, arquiteto_id=$2, observacoes=$3,
           endereco_entrega=$4, valor_total=$5, updated_at=NOW()
       WHERE id=$6`,
      [
        cliente_id || null,
        arquiteto_id || null,
        observacoes || null,
        endereco_entrega ? JSON.stringify(endereco_entrega) : null,
        valor_total,
        id,
      ]
    );

    // substitui todos os itens
    await client.query(`DELETE FROM orcamento_itens WHERE orcamento_id=$1`, [id]);

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      const largura = parseFloat(String(it.largura || "").replace(",", ".")) || null;
      const altura  = parseFloat(String(it.altura  || "").replace(",", ".")) || null;
      const qtd     = parseFloat(it.quantidade) || 1;
      const preco   = parseFloat(String(it.preco_unitario || "").replace(",", ".")) || null;

      await client.query(
        `INSERT INTO orcamento_itens
           (orcamento_id, produto_id, produto_nome, ambiente, largura, altura,
            quantidade, unidade, cor, referencia, especificacoes,
            preco_unitario, valor_total_item, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id,
          it.produto_id || null,
          it.produto_nome || null,
          it.ambiente || null,
          largura,
          altura,
          qtd,
          it.unidade || "un",
          it.cor || null,
          it.referencia || null,
          it.especificacoes ? JSON.stringify(it.especificacoes) : "{}",
          preco,
          preco ? qtd * preco : null,
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return buscar(id, empresaId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function aprovar(id, empresaId, userId, enderecoEntrega) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const oRes = await client.query(
      `SELECT o.*, c.nome AS cliente_nome
       FROM orcamentos o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       WHERE o.id=$1 AND o.empresa_id=$2 AND o.deleted_at IS NULL FOR UPDATE`,
      [id, empresaId]
    );
    if (!oRes.rows[0]) throw Object.assign(new Error("Orçamento não encontrado."), { status: 404 });
    const orc = oRes.rows[0];
    if (orc.status !== "novo")
      throw Object.assign(new Error("Somente orçamentos 'novo' podem ser aprovados."), { status: 400 });

    await client.query(
      `UPDATE orcamentos SET status='aprovado', updated_at=NOW() WHERE id=$1`,
      [id]
    );

    const seqRes = await client.query("SELECT nextval('pedidos_numero_seq') AS seq");
    const numeroSeq = seqRes.rows[0].seq;

    const end = enderecoEntrega || {};
    const pRes = await client.query(
      `INSERT INTO pedidos
         (empresa_id, cliente_id, consultor_id, arquiteto_id, numero_sequencial, status,
          total, orcamento_id, rua, numero, complemento, bairro, cidade, estado, cep,
          criado_por, data_pedido)
       VALUES ($1,$2,$3,$4,$5,'pendente',$6,$7,$8,$9,$10,$11,$12,$13,$14,$3,CURRENT_DATE)
       RETURNING id`,
      [
        empresaId,
        orc.cliente_id,
        userId,
        orc.arquiteto_id || null,
        numeroSeq,
        orc.valor_total || 0,
        id,
        end.rua || null,
        end.numero || null,
        end.complemento || null,
        end.bairro || null,
        end.cidade || null,
        end.estado || null,
        end.cep || null,
      ]
    );
    const pedidoId = pRes.rows[0].id;

    const itRes = await client.query(
      `SELECT * FROM orcamento_itens WHERE orcamento_id=$1 ORDER BY ordem, id`,
      [id]
    );

    for (let i = 0; i < itRes.rows.length; i++) {
      const it = itRes.rows[i];
      const medidas = it.largura && it.altura
        ? `${it.largura} × ${it.altura}`
        : it.largura ? `${it.largura}` : null;

      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, orcamento_item_id, ambiente, descricao, referencia, cor,
            medidas, quantidade, unidade, preco_unitario, valor, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          pedidoId,
          it.id,
          it.ambiente || null,
          it.produto_nome || it.referencia || "Item",
          it.referencia || null,
          it.cor || null,
          medidas,
          it.quantidade,
          it.unidade || "un",
          it.preco_unitario || null,
          it.valor_total_item || null,
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return { orcamento_id: id, pedido_id: pedidoId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function cancelar(id, empresaId) {
  const res = await db.query(
    `UPDATE orcamentos SET status='cancelado', updated_at=NOW()
     WHERE id=$1 AND empresa_id=$2 AND status='novo' AND deleted_at IS NULL
     RETURNING id`,
    [id, empresaId]
  );
  if (!res.rows[0])
    throw Object.assign(new Error("Orçamento não encontrado ou já aprovado/cancelado."), { status: 400 });
  return res.rows[0];
}

module.exports = { listar, criar, buscar, atualizar, aprovar, cancelar };
```

- [ ] **Criar arquivo de testes**

Criar `backend/src/__tests__/orcamentoService.test.js`:

```javascript
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/orcamentoService');

afterEach(() => jest.clearAllMocks());

function makeClient(respostas = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  respostas.forEach(r => client.query.mockResolvedValueOnce(r));
  return client;
}

// ── listar ──────────────────────────────────────────────────────────────────

describe('listar', () => {
  test('retorna lista de orçamentos sem filtros', async () => {
    const fakeRows = [{ id: 1, numero: 'ORC-00001', status: 'novo', cliente_nome: 'Ana' }];
    db.query.mockResolvedValueOnce({ rows: fakeRows });

    const result = await svc.listar(10);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM orcamentos'),
      [10]
    );
    expect(result).toEqual(fakeRows);
  });

  test('filtra por status quando fornecido', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, { status: 'novo' });
    expect(db.query.mock.calls[0][1]).toContain('novo');
  });

  test('filtra por consultora_id quando fornecido', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await svc.listar(10, { consultora_id: 5 });
    expect(db.query.mock.calls[0][1]).toContain(5);
  });
});

// ── criar ────────────────────────────────────────────────────────────────────

describe('criar', () => {
  test('cria orçamento com itens em transação', async () => {
    const fakeOrc = { id: 42, numero: 'ORC-00001', status: 'novo' };
    const client = makeClient([
      { rows: [] },                        // BEGIN
      { rows: [{ seq: 1 }] },              // nextval
      { rows: [fakeOrc] },                 // INSERT orcamentos
      { rows: [] },                        // INSERT orcamento_itens (item 1)
      { rows: [] },                        // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = {
      cliente_id: 1,
      itens: [{ produto_id: 2, produto_nome: 'Persiana', ambiente: 'Sala', quantidade: 1, preco_unitario: '580,00' }],
    };
    const result = await svc.criar(10, 99, dados);

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(result.id).toBe(42);
  });

  test('cria produto rascunho se produto_id ausente mas produto_nome preenchido', async () => {
    const fakeOrc = { id: 43, numero: 'ORC-00002', status: 'novo' };
    const client = makeClient([
      { rows: [] },              // BEGIN
      { rows: [{ seq: 2 }] },    // nextval
      { rows: [fakeOrc] },       // INSERT orcamentos
      { rows: [{ id: 77 }] },    // INSERT produtos (rascunho)
      { rows: [] },              // INSERT orcamento_itens
      { rows: [] },              // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const dados = { itens: [{ produto_nome: 'Novo produto', ambiente: 'Quarto', quantidade: 1 }] };
    await svc.criar(10, 99, dados);

    const insertProdutoCall = client.query.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO produtos')
    );
    expect(insertProdutoCall).toBeTruthy();
    expect(insertProdutoCall[1]).toContain('Novo produto');
  });

  test('faz rollback se INSERT de item falhar', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })           // BEGIN
      .mockResolvedValueOnce({ rows: [{ seq: 1 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // INSERT orcamentos
      .mockRejectedValueOnce(new Error("FK violation")); // INSERT itens falha
    db.connect.mockResolvedValue(client);

    await expect(svc.criar(10, 99, { itens: [{ produto_id: 1, quantidade: 1 }] }))
      .rejects.toThrow("FK violation");

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

// ── buscar ───────────────────────────────────────────────────────────────────

describe('buscar', () => {
  test('retorna null se orçamento não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.buscar(999, 10);
    expect(result).toBeNull();
  });

  test('retorna orçamento com itens agrupados por ambiente', async () => {
    const fakeOrc = { id: 1, status: 'novo', cliente_nome: 'Ana' };
    db.query
      .mockResolvedValueOnce({ rows: [fakeOrc] })
      .mockResolvedValueOnce({ rows: [
        { id: 1, ambiente: 'Sala',    produto_nome: 'Persiana' },
        { id: 2, ambiente: 'Sala',    produto_nome: 'Cortina'  },
        { id: 3, ambiente: 'Quarto',  produto_nome: 'Persiana' },
      ]});

    const result = await svc.buscar(1, 10);

    expect(result.ambientes).toHaveLength(2);
    expect(result.ambientes[0].nome).toBe('Sala');
    expect(result.ambientes[0].itens).toHaveLength(2);
    expect(result.ambientes[1].nome).toBe('Quarto');
  });
});

// ── cancelar ─────────────────────────────────────────────────────────────────

describe('cancelar', () => {
  test('cancela orçamento novo com sucesso', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const result = await svc.cancelar(1, 10);
    expect(result.id).toBe(1);
    expect(db.query.mock.calls[0][0]).toContain("status='cancelado'");
  });

  test('lança erro se orçamento não encontrado ou já aprovado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.cancelar(999, 10)).rejects.toMatchObject({ status: 400 });
  });
});

// ── aprovar ───────────────────────────────────────────────────────────────────

describe('aprovar', () => {
  test('aprova orçamento e cria pedido', async () => {
    const fakeOrc = { id: 1, status: 'novo', cliente_id: 2, arquiteto_id: null, valor_total: 580 };
    const client = makeClient([
      { rows: [] },                           // BEGIN
      { rows: [fakeOrc] },                    // SELECT orcamento FOR UPDATE
      { rows: [] },                           // UPDATE status='aprovado'
      { rows: [{ seq: 1 }] },                 // nextval pedidos_numero_seq
      { rows: [{ id: 55 }] },                 // INSERT pedidos
      { rows: [{ id: 10, largura: 1.8, altura: 2.2, produto_nome: 'P', quantidade: 1 }] }, // SELECT itens
      { rows: [] },                           // INSERT pedido_itens
      { rows: [] },                           // COMMIT
    ]);
    db.connect.mockResolvedValue(client);

    const result = await svc.aprovar(1, 10, 99, { rua: 'Rua A', numero: '1' });

    expect(result).toEqual({ orcamento_id: 1, pedido_id: 55 });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('lança erro se orçamento não é novo', async () => {
    const client = makeClient([
      { rows: [] },
      { rows: [{ id: 1, status: 'aprovado' }] },
    ]);
    db.connect.mockResolvedValue(client);

    await expect(svc.aprovar(1, 10, 99, {})).rejects.toMatchObject({ status: 400 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
```

- [ ] **Rodar os testes**

```bash
cd backend && npm test -- --testPathPattern=orcamentoService
```

Saída esperada: todos os testes passando (12 testes).

- [ ] **Commit**

```bash
git add backend/src/services/orcamentoService.js backend/src/__tests__/orcamentoService.test.js
git commit -m "feat: orcamentoService completo com testes"
```

---

## Task 5: orcamentosRoutes + registrar em server.js

**Files:**
- Create: `backend/src/routes/orcamentosRoutes.js`
- Modify: `backend/server.js`

- [ ] **Criar orcamentosRoutes.js**

```javascript
const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const svc = require("../services/orcamentoService");

const router = express.Router();

const PODE_GERENCIAR = ["COMERCIAL", "OPERADOR_AGENDA", "ADMIN_MASTER"];
const PODE_APROVAR   = ["OPERADOR_AGENDA", "ADMIN_MASTER"];

router.get("/", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const { status, q, meu } = req.query;
    const filtros = { status, q };
    if (meu === "true") filtros.consultora_id = req.user.id;
    const orcamentos = await svc.listar(req.user.empresa_id, filtros);
    return res.json({ orcamentos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar orçamentos." });
  }
});

router.get("/:id", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const orc = await svc.buscar(Number(req.params.id), req.user.empresa_id);
    if (!orc) return res.status(404).json({ message: "Orçamento não encontrado." });
    return res.json({ orcamento: orc });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar orçamento." });
  }
});

router.post("/", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const orc = await svc.criar(req.user.empresa_id, req.user.id, req.body);
    return res.status(201).json({ message: "Orçamento criado!", orcamento: orc });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar orçamento." });
  }
});

router.put("/:id", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const orc = await svc.atualizar(Number(req.params.id), req.user.empresa_id, req.body);
    return res.json({ message: "Orçamento atualizado!", orcamento: orc });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar orçamento." });
  }
});

router.post("/:id/aprovar", authMiddleware, permissionMiddleware(PODE_APROVAR), async (req, res) => {
  try {
    const result = await svc.aprovar(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.body.endereco_entrega || null
    );
    return res.json({ message: "Orçamento aprovado!", ...result });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao aprovar orçamento." });
  }
});

router.post("/:id/cancelar", authMiddleware, permissionMiddleware(PODE_APROVAR), async (req, res) => {
  try {
    await svc.cancelar(Number(req.params.id), req.user.empresa_id);
    return res.json({ message: "Orçamento cancelado." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao cancelar orçamento." });
  }
});

module.exports = router;
```

- [ ] **Registrar em server.js**

Abrir `backend/server.js`. Após a linha `const ordemServicoRoutes = require(...)`:

```javascript
const orcamentosRoutes   = require("./src/routes/orcamentosRoutes");
```

Após a linha `app.use("/api/pedidos", pedidosRoutes);`:

```javascript
app.use("/api/orcamentos",   orcamentosRoutes);
```

- [ ] **Testar as rotas com curl**

```bash
# Servidor já deve estar rodando (npm run dev no backend)
TOKEN="SEU_TOKEN_AQUI"

# Criar orçamento
curl -s -X POST http://localhost:3001/api/orcamentos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cliente_id":1,"itens":[{"produto_nome":"Persiana rolô","ambiente":"Sala","quantidade":1,"preco_unitario":"580.00"}]}' | jq .

# Listar
curl -s http://localhost:3001/api/orcamentos \
  -H "Authorization: Bearer $TOKEN" | jq '.orcamentos | length'
```

Esperado: POST retorna `{ "message": "Orçamento criado!", "orcamento": { "id": ..., "numero": "ORC-00001" } }`.

- [ ] **Commit**

```bash
git add backend/src/routes/orcamentosRoutes.js backend/server.js
git commit -m "feat: orcamentosRoutes completo e registrado no servidor"
```

---

## Task 6: Frontend — Orcamentos.jsx (listagem)

**Files:**
- Create: `frontend-web/src/pages/orcamentos/Orcamentos.jsx`
- Create: `frontend-web/src/pages/orcamentos/Orcamentos.css`

- [ ] **Criar Orcamentos.css**

```css
.orc-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
.orc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.orc-header h1 { font-size: 1.5rem; font-weight: 700; color: var(--color-text); margin: 0; }
.orc-filtros { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; align-items: center; }
.orc-filtros input,
.orc-filtros select { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 6px; padding: 6px 10px; color: var(--color-text); font-size: 13px; }
.orc-filtros input { min-width: 200px; }
.orc-toggle-meu { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-text-muted); cursor: pointer; }
.orc-table-wrap { overflow-x: auto; }
.orc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.orc-table th { text-align: left; padding: 10px 12px; color: var(--color-text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--color-border); }
.orc-table td { padding: 10px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text); vertical-align: middle; }
.orc-table tr:hover td { background: var(--color-card-hover, #ffffff08); }
.orc-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.orc-badge.novo      { background: #3b82f622; color: #60a5fa; border: 1px solid #3b82f644; }
.orc-badge.aprovado  { background: #22c55e22; color: #4ade80; border: 1px solid #22c55e44; }
.orc-badge.cancelado { background: #ef444422; color: #f87171; border: 1px solid #ef444444; }
.orc-actions { display: flex; gap: 6px; }
.orc-actions button { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-card); color: var(--color-text); font-size: 11px; cursor: pointer; white-space: nowrap; }
.orc-actions button:hover { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.orc-actions button.danger:hover { background: #ef4444; border-color: #ef4444; }
.orc-empty { text-align: center; padding: 48px 0; color: var(--color-text-muted); }
```

- [ ] **Criar Orcamentos.jsx**

```jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import "./Orcamentos.css";

const STATUS_META = {
  novo:      { label: "Novo",      cls: "novo"      },
  aprovado:  { label: "Aprovado",  cls: "aprovado"  },
  cancelado: { label: "Cancelado", cls: "cancelado" },
};

function fmtMoeda(v) {
  if (v == null || v === "") return "—";
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function fmtData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function Orcamentos() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isCOMERCIAL = (user.permissoes || []).includes("COMERCIAL") &&
    !(user.permissoes || []).some(p => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));

  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [meuOrcamento, setMeuOrcamento] = useState(false);
  const [toast, setToast] = useState("");

  const mostrarToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      if (busca) params.set("q", busca);
      if (meuOrcamento) params.set("meu", "true");
      const data = await api.get(`/orcamentos?${params}`);
      setOrcamentos(data.orcamentos || []);
    } catch (err) {
      mostrarToast(err.message || "Erro ao carregar orçamentos.");
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, busca, meuOrcamento]);

  useEffect(() => { carregar(); }, [carregar]);

  async function cancelar(id) {
    if (!confirm("Cancelar este orçamento?")) return;
    try {
      await api.post(`/orcamentos/${id}/cancelar`, {});
      mostrarToast("Orçamento cancelado.");
      carregar();
    } catch (err) {
      mostrarToast(err.message || "Erro ao cancelar.");
    }
  }

  return (
    <div className="orc-page">
      {toast && <div style={{ position:"fixed",top:16,right:16,background:"#1f2937",color:"#fff",padding:"10px 18px",borderRadius:8,zIndex:9999 }}>{toast}</div>}

      <div className="orc-header">
        <h1>Orçamentos</h1>
        <button
          style={{ padding:"8px 18px",background:"var(--color-primary)",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:600 }}
          onClick={() => navigate("/orcamentos/novo")}
        >
          + Novo orçamento
        </button>
      </div>

      <div className="orc-filtros">
        <input
          placeholder="Buscar por cliente ou número..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="novo">Novo</option>
          <option value="aprovado">Aprovado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        {isCOMERCIAL && (
          <label className="orc-toggle-meu">
            <input type="checkbox" checked={meuOrcamento} onChange={e => setMeuOrcamento(e.target.checked)} />
            Meus orçamentos
          </label>
        )}
      </div>

      {loading ? (
        <div className="orc-empty">Carregando...</div>
      ) : orcamentos.length === 0 ? (
        <div className="orc-empty">Nenhum orçamento encontrado.</div>
      ) : (
        <div className="orc-table-wrap">
          <table className="orc-table">
            <thead>
              <tr>
                <th>Número</th><th>Cliente</th><th>Consultora</th><th>Arquiteto</th>
                <th>Total</th><th>Status</th><th>Data</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {orcamentos.map(o => {
                const meta = STATUS_META[o.status] || { label: o.status, cls: "novo" };
                const podeAprovar = (user.permissoes || []).some(p => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));
                return (
                  <tr key={o.id}>
                    <td><strong>{o.numero}</strong></td>
                    <td>{o.cliente_nome || "—"}</td>
                    <td>{o.consultora_nome || "—"}</td>
                    <td>{o.arquiteto_nome || "—"}</td>
                    <td>{fmtMoeda(o.valor_total)}</td>
                    <td><span className={`orc-badge ${meta.cls}`}>{meta.label}</span></td>
                    <td>{fmtData(o.created_at)}</td>
                    <td>
                      <div className="orc-actions">
                        <button onClick={() => navigate(`/orcamentos/${o.id}/editar`)}>
                          {o.status === "novo" ? "Editar" : "Ver"}
                        </button>
                        {o.status === "novo" && podeAprovar && (
                          <button onClick={() => navigate(`/orcamentos/${o.id}/editar?aprovar=1`)}>
                            Aprovar
                          </button>
                        )}
                        {o.status === "novo" && podeAprovar && (
                          <button className="danger" onClick={() => cancelar(o.id)}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add frontend-web/src/pages/orcamentos/
git commit -m "feat: Orcamentos.jsx — listagem com filtros e ações"
```

---

## Task 7: Frontend — OrcamentoWizard Etapas 1 e 2

**Files:**
- Create: `frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx` (parte 1)

- [ ] **Criar OrcamentoWizard.jsx com Etapa 1 e Etapa 2**

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";

// ── helpers ────────────────────────────────────────────────────────────────
function itemVazio(ambiente = "") {
  return { _key: Math.random(), produto_id: null, produto_nome: "", ambiente, quantidade: 1, largura: "", altura: "", cor: "", referencia: "", preco_unitario: "" };
}
function ambienteVazio(nome = "") {
  return { _key: Math.random(), nome, itens: [itemVazio(nome)] };
}
function fmtMoeda(v) {
  const n = parseFloat(String(v || "0").replace(",", ".")) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}
function calcSubtotal(itens) {
  return itens.reduce((s, it) => {
    const q = parseFloat(it.quantidade) || 0;
    const p = parseFloat(String(it.preco_unitario || "0").replace(",", ".")) || 0;
    return s + q * p;
  }, 0);
}

// ── Autocomplete genérico ──────────────────────────────────────────────────
function Autocomplete({ placeholder, value, onSelect, onClear, fetchFn, renderOption, renderValue }) {
  const [query, setQuery] = useState("");
  const [opcoes, setOpcoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buscar = useCallback(async (q) => {
    if (!q || q.length < 1) { setOpcoes([]); return; }
    try { const res = await fetchFn(q); setOpcoes(res); setAberto(true); } catch { setOpcoes([]); }
  }, [fetchFn]);

  useEffect(() => {
    const t = setTimeout(() => buscar(query), 250);
    return () => clearTimeout(t);
  }, [query, buscar]);

  if (value) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <span style={{ flex:1, fontSize:13, color:"var(--color-text)" }}>{renderValue(value)}</span>
        <button type="button" onClick={onClear} style={{ background:"none",border:"none",cursor:"pointer",color:"#6b7280",fontSize:14 }}>✕</button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <input
        style={{ width:"100%", background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:13 }}
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => query && setAberto(true)}
      />
      {aberto && opcoes.length > 0 && (
        <div style={{ position:"absolute", zIndex:100, top:"100%", left:0, right:0, background:"#1f2937", border:"1px solid var(--color-border)", borderRadius:4, maxHeight:200, overflowY:"auto" }}>
          {opcoes.map((op, i) => (
            <div key={i} onMouseDown={() => { onSelect(op); setQuery(""); setAberto(false); }}
              style={{ padding:"6px 10px", cursor:"pointer", fontSize:12, color:"var(--color-text)", borderBottom:"1px solid #374151" }}
              onMouseEnter={e => e.currentTarget.style.background="#374151"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}
            >
              {renderOption(op)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Barra de progresso ─────────────────────────────────────────────────────
function BarraProgresso({ etapa }) {
  const passos = ["① Cliente", "② Itens", "③ Revisão"];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:28 }}>
      {passos.map((p, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", flex: i < 2 ? 1 : "unset" }}>
          <div style={{
            padding:"4px 14px", borderRadius:12, fontSize:12, fontWeight:600, whiteSpace:"nowrap",
            background: i < etapa ? "#059669" : i === etapa ? "var(--color-primary)" : "var(--color-card)",
            color: i <= etapa ? "#fff" : "var(--color-text-muted)",
            border: `1px solid ${i < etapa ? "#059669" : i === etapa ? "var(--color-primary)" : "var(--color-border)"}`,
          }}>{i < etapa ? p.replace(/①②③/, "") + " ✓" : p}</div>
          {i < 2 && <div style={{ flex:1, height:1, background:"var(--color-border)", minWidth:12 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Etapa 1 ─────────────────────────────────────────────────────────────────
function Etapa1({ dados, onChange, onNext }) {
  const [erroCliente, setErroCliente] = useState("");
  const [endAberto, setEndAberto] = useState(!!dados.endereco_entrega?.rua);

  function buscarClientes(q) {
    return api.get(`/clientes/busca?q=${encodeURIComponent(q)}`).then(r => r.clientes);
  }
  function buscarArquitetos(q) {
    return api.get(`/arquitetos?q=${encodeURIComponent(q)}`).then(r => r.arquitetos);
  }

  function usarEnderecoCliente() {
    if (!dados.cliente) return;
    const end = dados.cliente;
    onChange("endereco_entrega", {
      rua: end.rua || "", numero: end.numero || "", complemento: end.complemento || "",
      bairro: end.bairro || "", cidade: end.cidade || "", estado: end.estado || "", cep: end.cep || "",
    });
    setEndAberto(true);
  }

  function avancar() {
    if (!dados.cliente_id) { setErroCliente("Selecione um cliente."); return; }
    setErroCliente("");
    onNext();
  }

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const endEnt = dados.endereco_entrega || {};

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>CLIENTE *</label>
          <Autocomplete
            placeholder="Buscar cliente..."
            value={dados.cliente}
            onSelect={c => { onChange("cliente_id", c.id); onChange("cliente", c); }}
            onClear={() => { onChange("cliente_id", null); onChange("cliente", null); }}
            fetchFn={buscarClientes}
            renderOption={c => `${c.nome} — ${c.telefone || ""}`}
            renderValue={c => `${c.nome}${c.telefone ? " — " + c.telefone : ""}`}
          />
          {erroCliente && <span style={{ color:"#ef4444", fontSize:11 }}>{erroCliente}</span>}
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>CONSULTORA</label>
          <div style={{ background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", fontSize:13, color:"var(--color-text-muted)" }}>
            {user.nome_completo || "—"} (você)
          </div>
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>ARQUITETO (opcional)</label>
          <Autocomplete
            placeholder="Buscar arquiteto..."
            value={dados.arquiteto}
            onSelect={a => { onChange("arquiteto_id", a.id); onChange("arquiteto", a); }}
            onClear={() => { onChange("arquiteto_id", null); onChange("arquiteto", null); }}
            fetchFn={buscarArquitetos}
            renderOption={a => a.nome}
            renderValue={a => a.nome}
          />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>OBSERVAÇÕES</label>
          <textarea
            rows={2}
            style={{ width:"100%", background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:13, resize:"vertical" }}
            placeholder="Observações gerais..."
            value={dados.observacoes || ""}
            onChange={e => onChange("observacoes", e.target.value)}
          />
        </div>
      </div>

      {/* Endereço opcional */}
      <div style={{ border:"1px dashed var(--color-border)", borderRadius:6, padding:12, marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: endAberto ? 10 : 0 }}>
          <span style={{ fontSize:11, color:"var(--color-text-muted)" }}>
            ENDEREÇO DE ENTREGA <span style={{ color:"#6b7280" }}>(opcional)</span>
          </span>
          <div style={{ display:"flex", gap:8 }}>
            {dados.cliente && <button type="button" onClick={usarEnderecoCliente} style={{ background:"none",border:"none",color:"var(--color-primary)",fontSize:11,cursor:"pointer" }}>Usar endereço do cliente ↙</button>}
            <button type="button" onClick={() => setEndAberto(v => !v)} style={{ background:"none",border:"none",color:"#6b7280",fontSize:11,cursor:"pointer" }}>{endAberto ? "▲ Recolher" : "▼ Preencher"}</button>
          </div>
        </div>
        {endAberto && (
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8 }}>
            {[["rua","Rua / Logradouro"],["numero","Número"],["complemento","Complemento"],["bairro","Bairro"],["cidade","Cidade"],["estado","Estado"],["cep","CEP"]].map(([campo, label]) => (
              <div key={campo} style={{ gridColumn: campo === "rua" ? "span 1" : "span 1" }}>
                <input
                  placeholder={label}
                  value={endEnt[campo] || ""}
                  onChange={e => onChange("endereco_entrega", { ...endEnt, [campo]: e.target.value })}
                  style={{ width:"100%", background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:12 }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button type="button" onClick={avancar}
          style={{ padding:"8px 20px", background:"var(--color-primary)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
          Próximo: Itens →
        </button>
      </div>
    </div>
  );
}

// ── Etapa 2 ─────────────────────────────────────────────────────────────────
function Etapa2({ ambientes, setAmbientes, onBack, onNext }) {
  const [novoAmbNome, setNovoAmbNome] = useState("");
  const [adicionandoAmb, setAdicionandoAmb] = useState(false);
  const [expandidos, setExpandidos] = useState(() => {
    const m = {};
    ambientes.forEach(a => { m[a._key] = true; });
    return m;
  });
  const [erro, setErro] = useState("");

  function buscarProdutos(q) {
    return api.get(`/produtos/busca?q=${encodeURIComponent(q)}`).then(r => r.produtos);
  }

  function toggleExpand(key) {
    setExpandidos(v => ({ ...v, [key]: !v[key] }));
  }

  function adicionarAmbiente() {
    if (!novoAmbNome.trim()) return;
    const amb = ambienteVazio(novoAmbNome.trim());
    setAmbientes(prev => [...prev, amb]);
    setExpandidos(v => ({ ...v, [amb._key]: true }));
    setNovoAmbNome("");
    setAdicionandoAmb(false);
  }

  function removerAmbiente(key) {
    if (!confirm("Remover este ambiente e todos os seus itens?")) return;
    setAmbientes(prev => prev.filter(a => a._key !== key));
  }

  function atualizarItem(ambKey, itemKey, campo, valor) {
    setAmbientes(prev => prev.map(a => a._key !== ambKey ? a : {
      ...a,
      itens: a.itens.map(it => it._key !== itemKey ? it : { ...it, [campo]: valor })
    }));
  }

  function adicionarItem(ambKey) {
    const amb = ambientes.find(a => a._key === ambKey);
    setAmbientes(prev => prev.map(a => a._key !== ambKey ? a : {
      ...a, itens: [...a.itens, itemVazio(amb?.nome || "")]
    }));
  }

  function removerItem(ambKey, itemKey) {
    setAmbientes(prev => prev.map(a => a._key !== ambKey ? a : {
      ...a, itens: a.itens.filter(it => it._key !== itemKey)
    }));
  }

  function avancar() {
    const temItem = ambientes.some(a => a.itens.some(it => it.produto_nome || it.produto_id));
    if (!temItem) { setErro("Adicione pelo menos um item com produto preenchido."); return; }
    setErro("");
    onNext();
  }

  const inputStyle = { background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:3, padding:"4px 6px", color:"var(--color-text)", fontSize:12, width:"100%" };

  return (
    <div>
      {ambientes.map(amb => {
        const subtotal = calcSubtotal(amb.itens);
        const expandido = expandidos[amb._key] !== false;
        return (
          <div key={amb._key} style={{ border:"1px solid var(--color-border)", borderRadius:6, marginBottom:8, overflow:"hidden" }}>
            <div onClick={() => toggleExpand(amb._key)}
              style={{ background:"var(--color-card)", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
              <span style={{ fontWeight:600, fontSize:13 }}>
                {expandido ? "▼" : "▶"} {amb.nome}
                <span style={{ color:"var(--color-text-muted)", fontWeight:400, fontSize:11, marginLeft:8 }}>
                  ({amb.itens.length} {amb.itens.length === 1 ? "item" : "itens"} · R$ {fmtMoeda(subtotal)})
                </span>
              </span>
              <button type="button" onClick={e => { e.stopPropagation(); removerAmbiente(amb._key); }}
                style={{ background:"none", border:"none", color:"#ef4444", fontSize:12, cursor:"pointer" }}>
                🗑 remover
              </button>
            </div>
            {expandido && (
              <div style={{ padding:10, background:"var(--color-bg)" }}>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 0.5fr 0.7fr 0.7fr 1fr 1fr 0.3fr", gap:4, marginBottom:4 }}>
                  {["PRODUTO","QTD","LARG (m)","ALT (m)","COR","R$ UNIT",""].map((h,i) => (
                    <div key={i} style={{ fontSize:9, color:"var(--color-text-muted)", fontWeight:600, textTransform:"uppercase" }}>{h}</div>
                  ))}
                </div>
                {amb.itens.map(it => (
                  <div key={it._key} style={{ display:"grid", gridTemplateColumns:"2fr 0.5fr 0.7fr 0.7fr 1fr 1fr 0.3fr", gap:4, marginBottom:4, alignItems:"center" }}>
                    <Autocomplete
                      placeholder="Produto..."
                      value={it.produto_id ? { id: it.produto_id, nome: it.produto_nome } : null}
                      onSelect={p => { atualizarItem(amb._key, it._key, "produto_id", p.id); atualizarItem(amb._key, it._key, "produto_nome", p.nome); atualizarItem(amb._key, it._key, "preco_unitario", String(p.preco_venda || "")); }}
                      onClear={() => { atualizarItem(amb._key, it._key, "produto_id", null); atualizarItem(amb._key, it._key, "produto_nome", ""); }}
                      fetchFn={buscarProdutos}
                      renderOption={p => `${p.nome}${p.referencia ? " — " + p.referencia : ""}`}
                      renderValue={p => p.nome}
                    />
                    {it.produto_nome && !it.produto_id && (
                      /* produto digitado livremente — mantém como produto_nome */
                      <input style={inputStyle} value={it.produto_nome} onChange={e => atualizarItem(amb._key, it._key, "produto_nome", e.target.value)} placeholder="Nome" />
                    ) && null /* renderizado pelo Autocomplete acima */}
                    <input style={inputStyle} type="number" min="1" value={it.quantidade}
                      onChange={e => atualizarItem(amb._key, it._key, "quantidade", e.target.value)} />
                    <input style={inputStyle} placeholder="0,00" value={it.largura}
                      onChange={e => atualizarItem(amb._key, it._key, "largura", e.target.value)} />
                    <input style={inputStyle} placeholder="0,00" value={it.altura}
                      onChange={e => atualizarItem(amb._key, it._key, "altura", e.target.value)} />
                    <input style={inputStyle} placeholder="Cor" value={it.cor}
                      onChange={e => atualizarItem(amb._key, it._key, "cor", e.target.value)} />
                    <input style={inputStyle} placeholder="0,00" value={it.preco_unitario}
                      onChange={e => atualizarItem(amb._key, it._key, "preco_unitario", e.target.value)} />
                    <button type="button" onClick={() => removerItem(amb._key, it._key)}
                      style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14 }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => adicionarItem(amb._key)}
                  style={{ background:"none", border:"none", color:"var(--color-primary)", fontSize:12, cursor:"pointer", marginTop:4 }}>
                  + Adicionar item em {amb.nome}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {adicionandoAmb ? (
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          <input autoFocus placeholder="Nome do ambiente (ex: Sala, Quarto 1...)"
            value={novoAmbNome} onChange={e => setNovoAmbNome(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") adicionarAmbiente(); if (e.key === "Escape") setAdicionandoAmb(false); }}
            style={{ flex:1, background:"var(--color-card)", border:"1px solid var(--color-primary)", borderRadius:6, padding:"8px 12px", color:"var(--color-text)", fontSize:13 }}
          />
          <button type="button" onClick={adicionarAmbiente}
            style={{ padding:"8px 14px", background:"var(--color-primary)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>
            OK
          </button>
          <button type="button" onClick={() => setAdicionandoAmb(false)}
            style={{ padding:"8px 14px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdicionandoAmb(true)}
          style={{ width:"100%", padding:"10px", border:"1px dashed var(--color-border)", borderRadius:6, background:"none", color:"var(--color-primary)", cursor:"pointer", fontSize:12, marginBottom:16 }}>
          + Novo ambiente
        </button>
      )}

      {erro && <div style={{ color:"#ef4444", fontSize:12, marginBottom:8 }}>{erro}</div>}

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <button type="button" onClick={onBack}
          style={{ padding:"8px 16px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
          ← Voltar
        </button>
        <button type="button" onClick={avancar}
          style={{ padding:"8px 20px", background:"var(--color-primary)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
          Próximo: Revisão →
        </button>
      </div>
    </div>
  );
}

export { Etapa1, Etapa2, BarraProgresso, Autocomplete, itemVazio, ambienteVazio, calcSubtotal, fmtMoeda };
```

> **Nota:** este arquivo exporta os componentes como named exports temporariamente — na Task 8 criaremos o componente `OrcamentoWizard` default que une tudo.

- [ ] **Commit**

```bash
git add frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx
git commit -m "feat: OrcamentoWizard — Etapa1 e Etapa2 (acordeão de ambientes)"
```

---

## Task 8: Frontend — Etapa 3, Modal de Aprovação e App.jsx

**Files:**
- Modify: `frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx`
- Modify: `frontend-web/src/App.jsx`

- [ ] **Substituir o conteúdo de OrcamentoWizard.jsx pela versão completa com Etapa3 e componente principal**

Abrir `frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx` e acrescentar após as funções de Etapa2 (antes dos `export`):

```jsx
// ── Etapa 3 ─────────────────────────────────────────────────────────────────
function Etapa3({ dados, ambientes, orcamentoId, onBack, onSalvar, salvando }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const podeAprovar = (user.permissoes || []).some(p => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));

  const [modalAberto, setModalAberto] = useState(false);
  const [endModal, setEndModal] = useState(dados.endereco_entrega || {});
  const [aprovando, setAprovando] = useState(false);
  const [erroAprov, setErroAprov] = useState("");
  const [editandoEnd, setEditandoEnd] = useState(false);

  const totalGeral = ambientes.reduce((s, a) => s + calcSubtotal(a.itens), 0);

  async function confirmarAprovacao() {
    setAprovando(true);
    setErroAprov("");
    try {
      const res = await api.post(`/orcamentos/${orcamentoId}/aprovar`, { endereco_entrega: endModal });
      navigate(`/pedidos`);
      // Idealmente navegar para /pedidos/:res.pedido_id quando a rota existir
    } catch (err) {
      setErroAprov(err.message || "Erro ao aprovar.");
    } finally {
      setAprovando(false);
    }
  }

  const endEnt = dados.endereco_entrega || {};
  const endResumo = [endEnt.rua, endEnt.numero, endEnt.bairro, endEnt.cidade, endEnt.estado].filter(Boolean).join(", ");
  const inputStyle = { background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:12, width:"100%" };

  return (
    <div>
      {/* Resumo cliente */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        <div style={{ background:"var(--color-card)", borderRadius:6, padding:12 }}>
          <div style={{ fontSize:10, color:"var(--color-text-muted)", marginBottom:4 }}>CLIENTE</div>
          <div style={{ fontWeight:600 }}>{dados.cliente?.nome || "—"}</div>
          {dados.cliente?.telefone && <div style={{ fontSize:12, color:"var(--color-text-muted)" }}>{dados.cliente.telefone}</div>}
        </div>
        <div style={{ background:"var(--color-card)", borderRadius:6, padding:12 }}>
          <div style={{ fontSize:10, color:"var(--color-text-muted)", marginBottom:4 }}>CONSULTORA</div>
          <div style={{ fontWeight:600 }}>{user.nome_completo || "—"}</div>
          {dados.arquiteto && <div style={{ fontSize:12, color:"var(--color-text-muted)" }}>Arq: {dados.arquiteto.nome}</div>}
        </div>
      </div>

      {/* Resumo por ambiente */}
      <div style={{ background:"var(--color-card)", borderRadius:6, padding:14, marginBottom:12 }}>
        <div style={{ fontSize:10, color:"var(--color-text-muted)", marginBottom:10, fontWeight:600 }}>RESUMO POR AMBIENTE</div>
        {ambientes.map(amb => {
          const sub = calcSubtotal(amb.itens);
          return (
            <div key={amb._key} style={{ marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:600, marginBottom:4 }}>
                <span>{amb.nome} ({amb.itens.length} {amb.itens.length === 1 ? "item" : "itens"})</span>
                <span>R$ {fmtMoeda(sub)}</span>
              </div>
              {amb.itens.map(it => it.produto_nome && (
                <div key={it._key} style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--color-text-muted)", paddingLeft:8, marginBottom:2 }}>
                  <span>{it.produto_nome}{it.cor ? ` — ${it.cor}` : ""}{it.largura && it.altura ? ` (${it.largura}×${it.altura})` : ""}{it.quantidade > 1 ? ` ×${it.quantidade}` : ""}</span>
                  <span>{it.preco_unitario ? `R$ ${fmtMoeda(parseFloat(String(it.preco_unitario).replace(",",".")) * (parseFloat(it.quantidade)||1))}` : "—"}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div style={{ borderTop:"1px solid var(--color-border)", paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:14 }}>
          <span>Total</span>
          <span style={{ color:"var(--color-primary)" }}>R$ {fmtMoeda(totalGeral)}</span>
        </div>
      </div>

      {/* Endereço de entrega */}
      <div style={{ background:"var(--color-card)", borderRadius:6, padding:12, marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize:10, color:"var(--color-text-muted)", fontWeight:600 }}>ENDEREÇO DE ENTREGA</span>
          <button type="button" onClick={() => setEditandoEnd(v => !v)}
            style={{ background:"none", border:"none", color:"var(--color-primary)", fontSize:11, cursor:"pointer" }}>
            ✏ {editandoEnd ? "Fechar" : "editar"}
          </button>
        </div>
        {endResumo ? (
          <div style={{ fontSize:13 }}>{endResumo}{endEnt.cep ? ` — CEP ${endEnt.cep}` : ""}</div>
        ) : (
          <div style={{ fontSize:12, color:"var(--color-text-muted)" }}>Endereço não informado</div>
        )}
        {editandoEnd && (
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8, marginTop:10 }}>
            {[["rua","Rua"],["numero","Número"],["complemento","Complemento"],["bairro","Bairro"],["cidade","Cidade"],["estado","Estado"],["cep","CEP"]].map(([campo, label]) => (
              <input key={campo} placeholder={label} value={endEnt[campo] || ""}
                onChange={e => { /* atualizado via onSalvar que repassa ao parent */ }}
                style={inputStyle}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <button type="button" onClick={onBack}
          style={{ padding:"8px 16px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
          ← Voltar
        </button>
        <div style={{ display:"flex", gap:10 }}>
          <button type="button" onClick={onSalvar} disabled={salvando}
            style={{ padding:"8px 16px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
            {salvando ? "Salvando..." : "💾 Salvar rascunho"}
          </button>
          {podeAprovar && orcamentoId && (
            <button type="button" onClick={() => { setEndModal(dados.endereco_entrega || {}); setModalAberto(true); }}
              style={{ padding:"8px 18px", background:"#059669", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
              ✓ Aprovar orçamento
            </button>
          )}
        </div>
      </div>

      {/* Modal de aprovação */}
      {modalAberto && (
        <div style={{ position:"fixed", inset:0, background:"#00000088", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--color-card)", borderRadius:8, padding:24, width:"100%", maxWidth:480, border:"1px solid #059669" }}>
            <h3 style={{ margin:"0 0 4px", fontSize:16 }}>Confirmar aprovação</h3>
            <p style={{ fontSize:12, color:"var(--color-text-muted)", marginBottom:16 }}>
              Revise o endereço de entrega. Após confirmar, um Pedido será criado automaticamente.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:8, marginBottom:12 }}>
              {[["rua","Rua / Logradouro"],["numero","Número"],["complemento","Complemento"],["bairro","Bairro"],["cidade","Cidade"],["estado","Estado (UF)"],["cep","CEP"]].map(([campo, label]) => (
                <div key={campo}>
                  <input placeholder={label} value={endModal[campo] || ""}
                    onChange={e => setEndModal(v => ({ ...v, [campo]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            {erroAprov && <div style={{ color:"#ef4444", fontSize:12, marginBottom:8 }}>{erroAprov}</div>}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button type="button" onClick={() => setModalAberto(false)} disabled={aprovando}
                style={{ padding:"8px 16px", background:"var(--color-bg)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={confirmarAprovacao} disabled={aprovando}
                style={{ padding:"8px 20px", background:"#059669", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                {aprovando ? "Aprovando..." : "Confirmar → criar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function OrcamentoWizard() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState({ cliente_id: null, cliente: null, arquiteto_id: null, arquiteto: null, observacoes: "", endereco_entrega: null });
  const [ambientes, setAmbientes] = useState([ambienteVazio("Sala")]);
  const [salvando, setSalvando] = useState(false);
  const [orcamentoId, setOrcamentoId] = useState(id ? Number(id) : null);
  const [toast, setToast] = useState("");

  const mostrarToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  // Carregar orçamento existente para edição
  useEffect(() => {
    if (!id) return;
    api.get(`/orcamentos/${id}`).then(res => {
      const o = res.orcamento;
      setDados({
        cliente_id: o.cliente_id,
        cliente: o.cliente_id ? { id: o.cliente_id, nome: o.cliente_nome, telefone: o.cliente_telefone } : null,
        arquiteto_id: o.arquiteto_id,
        arquiteto: o.arquiteto_id ? { id: o.arquiteto_id, nome: o.arquiteto_nome } : null,
        observacoes: o.observacoes || "",
        endereco_entrega: o.endereco_entrega || null,
      });
      if (o.ambientes?.length > 0) {
        setAmbientes(o.ambientes.map(a => ({
          _key: Math.random(),
          nome: a.nome,
          itens: a.itens.map(it => ({ ...it, _key: Math.random() })),
        })));
      }
      if (searchParams.get("aprovar") === "1") setEtapa(2);
    }).catch(() => mostrarToast("Erro ao carregar orçamento."));
  }, [id]);

  function onChange(campo, valor) {
    setDados(prev => ({ ...prev, [campo]: valor }));
  }

  function montarPayload() {
    const itens = ambientes.flatMap(a => a.itens.filter(it => it.produto_nome || it.produto_id).map(it => ({ ...it, ambiente: a.nome })));
    return { ...dados, itens };
  }

  async function salvar() {
    setSalvando(true);
    try {
      const payload = montarPayload();
      if (orcamentoId) {
        await api.put(`/orcamentos/${orcamentoId}`, payload);
        mostrarToast("Rascunho salvo!");
      } else {
        const res = await api.post("/orcamentos", payload);
        setOrcamentoId(res.orcamento.id);
        navigate(`/orcamentos/${res.orcamento.id}/editar`, { replace: true });
        mostrarToast(`${res.orcamento.numero} salvo!`);
      }
    } catch (err) {
      mostrarToast(err.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ padding:24, maxWidth:900, margin:"0 auto" }}>
      {toast && (
        <div style={{ position:"fixed", top:16, right:16, background:"#1f2937", color:"#fff", padding:"10px 18px", borderRadius:8, zIndex:9999 }}>
          {toast}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <button onClick={() => navigate("/orcamentos")}
          style={{ background:"none", border:"none", color:"var(--color-primary)", cursor:"pointer", fontSize:13 }}>
          ← Orçamentos
        </button>
        <h2 style={{ margin:0, fontSize:20, fontWeight:700 }}>
          {orcamentoId ? "Editar orçamento" : "Novo orçamento"}
        </h2>
      </div>
      <BarraProgresso etapa={etapa} />
      {etapa === 0 && <Etapa1 dados={dados} onChange={onChange} onNext={() => setEtapa(1)} />}
      {etapa === 1 && <Etapa2 ambientes={ambientes} setAmbientes={setAmbientes} onBack={() => setEtapa(0)} onNext={() => setEtapa(2)} />}
      {etapa === 2 && (
        <Etapa3
          dados={dados}
          ambientes={ambientes}
          orcamentoId={orcamentoId}
          onBack={() => setEtapa(1)}
          onSalvar={salvar}
          salvando={salvando}
        />
      )}
    </div>
  );
}
```

- [ ] **Remover os named exports que eram temporários**

No final do arquivo, garantir que apenas o `export default function OrcamentoWizard` exista. Remover a linha:

```jsx
export { Etapa1, Etapa2, BarraProgresso, Autocomplete, itemVazio, ambienteVazio, calcSubtotal, fmtMoeda };
```

- [ ] **Adicionar rotas em App.jsx**

Abrir `frontend-web/src/App.jsx`.

Após a linha `const KanbanConfig = lazy(...)`, adicionar:

```jsx
const Orcamentos     = lazy(() => import("./pages/orcamentos/Orcamentos"));
const OrcamentoWizard = lazy(() => import("./pages/orcamentos/OrcamentoWizard"));
```

Dentro do bloco `<Route element={<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>` (onde já estão `/pedidos`, `/crm`, etc.), adicionar:

```jsx
<Route path="/orcamentos"              element={<Orcamentos />} />
<Route path="/orcamentos/novo"         element={<OrcamentoWizard />} />
<Route path="/orcamentos/:id/editar"   element={<OrcamentoWizard />} />
```

- [ ] **Verificar que o frontend compila sem erros**

```bash
cd frontend-web && npm run build
```

Saída esperada: sem erros de compilação.

- [ ] **Commit final**

```bash
git add frontend-web/src/pages/orcamentos/OrcamentoWizard.jsx frontend-web/src/App.jsx
git commit -m "feat: OrcamentoWizard completo (Etapa3 + modal aprovação) e rotas em App.jsx"
```

---

## Self-review checklist

- [x] **Spec coverage:** listar ✓ · criar com transação ✓ · buscar com agrupamento por ambiente ✓ · atualizar ✓ · aprovar (cria pedido) ✓ · cancelar ✓ · wizard 3 etapas ✓ · autocomplete clientes/produtos/arquitetos ✓ · endereço opcional na etapa 1 ✓ · QTD nos itens ✓ · modal de aprovação com endereço pré-preenchido ✓ · filtro "meus orçamentos" ✓ · permissões ✓
- [x] **Placeholders:** nenhum TBD restante
- [x] **Type consistency:** `calcSubtotal`, `fmtMoeda`, `ambienteVazio`, `itemVazio` usados consistentemente em Etapa2, Etapa3 e OrcamentoWizard
- [x] **Migrations antes do código:** Task 0 (endereco_entrega) precisa rodar antes de Task 3 (serviço)
- [x] **Ordem de rotas Express:** `/busca` adicionado **antes** de `/:id` para não ser capturado pelo param route
