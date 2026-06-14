# Flag de Categoria "Necessita Conferência" + Endpoint de Itens Pendentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a flag `categorias.necessita_conferencia`, expô-la no CRUD de categorias (backend + tela Categorias) e criar o endpoint `GET /pedidos/:id/itens-disponiveis-conferencia-entrega` que lista os itens de um pedido cuja categoria exige conferência e que ainda não estão cobertos por uma Conferência ativa.

**Architecture:** Segue exatamente o padrão já existente de `vinculavel` / `recebe_vinculos`: uma coluna boolean em `categorias`, exposta em `categoriaService.listar/criar/atualizar`, um checkbox no `CategoriaModal` em `Categorias.jsx`, e uma nova rota em `pedidosRoutes.js` modelada em `itens-disponiveis-instalacao` (mesmos campos de retorno, para reaproveitamento futuro do `ModalSelecionarItensInstalacao`).

**Tech Stack:** Node.js/Express, PostgreSQL (Supabase + banco local), Jest + Supertest para testes de backend, React (frontend-web) sem testes automatizados nessa camada.

---

### Task 1: Migration `categorias_necessita_conferencia.sql`

**Files:**
- Create: `backend/src/database/migrations/categorias_necessita_conferencia.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- categorias_necessita_conferencia.sql
-- Marca categorias cujos itens exigem uma visita de conferência agendada
-- antes de definir a data de entrega/instalação do pedido.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS necessita_conferencia BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Rodar a migration no banco local**

Run (a partir da pasta `backend`):
```bash
node src/database/run-migration.js categorias_necessita_conferencia.sql
```
Expected: `Executando categorias_necessita_conferencia.sql...` seguido de `Migration executada com sucesso.`

- [ ] **Step 3: Aplicar a mesma migration no Supabase**

Use a tool MCP do Supabase `apply_migration` (nome `categorias_necessita_conferencia`, query igual ao Step 1) para aplicar no projeto remoto.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/categorias_necessita_conferencia.sql
git commit -m "feat(categorias): adiciona coluna necessita_conferencia"
```

---

### Task 2: `categoriaService.js` — listar/criar/atualizar com `necessita_conferencia`

**Files:**
- Modify: `backend/src/services/categoriaService.js`
- Test: `backend/src/__tests__/categoriaService.test.js`

- [ ] **Step 1: Escrever os testes (substituir o conteúdo do arquivo de teste)**

Substitua todo o conteúdo de `backend/src/__tests__/categoriaService.test.js` por:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/categoriaService');

afterEach(() => jest.clearAllMocks());

describe('listar', () => {
  test('inclui vinculavel, recebe_vinculos e necessita_conferencia na query e no retorno', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Trilhos', cor: '#000', ordem: 0, vinculavel: true, recebe_vinculos: false, necessita_conferencia: true }],
    });
    const result = await svc.listar(10);
    expect(db.query.mock.calls[0][0]).toContain('vinculavel');
    expect(db.query.mock.calls[0][0]).toContain('recebe_vinculos');
    expect(db.query.mock.calls[0][0]).toContain('necessita_conferencia');
    expect(result[0].vinculavel).toBe(true);
    expect(result[0].recebe_vinculos).toBe(false);
    expect(result[0].necessita_conferencia).toBe(true);
  });
});

describe('criar', () => {
  test('insere vinculavel, recebe_vinculos e necessita_conferencia com default false quando nao informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: false, necessita_conferencia: false }],
    });
    await svc.criar(10, { nome: 'Cortinas' });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Cortinas', '#C9A96E', 0, false, false, false]);
  });

  test('insere vinculavel, recebe_vinculos e necessita_conferencia quando informados', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 2, nome: 'Trilhos', cor: '#C9A96E', ordem: 0, vinculavel: true, recebe_vinculos: false, necessita_conferencia: true }],
    });
    await svc.criar(10, { nome: 'Trilhos', vinculavel: true, recebe_vinculos: false, necessita_conferencia: true });
    expect(db.query.mock.calls[0][1]).toEqual([10, 'Trilhos', '#C9A96E', 0, true, false, true]);
  });
});

describe('atualizar', () => {
  test('atualiza vinculavel, recebe_vinculos e necessita_conferencia', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Cortinas', cor: '#C9A96E', ordem: 0, vinculavel: false, recebe_vinculos: true, necessita_conferencia: true }],
    });
    await svc.atualizar(1, 10, { nome: 'Cortinas', vinculavel: false, recebe_vinculos: true, necessita_conferencia: true });
    expect(db.query.mock.calls[0][1]).toEqual(['Cortinas', '#C9A96E', 0, false, true, true, 1, 10]);
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run (a partir da pasta `backend`):
```bash
npx jest categoriaService.test.js
```
Expected: FAIL — `result[0].necessita_conferencia` é `undefined`, e os arrays passados a `db.query` não têm o 7º/8º elemento esperado.

- [ ] **Step 3: Implementar `listar`, `criar` e `atualizar` em `categoriaService.js`**

Substitua as funções `listar`, `criar` e `atualizar` em `backend/src/services/categoriaService.js`:

```js
async function listar(empresaId) {
  const res = await db.query(
    `SELECT id, nome, cor, ordem, vinculavel, recebe_vinculos, necessita_conferencia FROM categorias
     WHERE empresa_id = $1
     ORDER BY ordem ASC, nome ASC`,
    [empresaId]
  );
  return res.rows;
}
```

```js
async function criar(empresaId, dados) {
  const { nome, cor, ordem, vinculavel, recebe_vinculos, necessita_conferencia } = dados;
  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  try {
    const res = await db.query(
      `INSERT INTO categorias (empresa_id, nome, cor, ordem, vinculavel, recebe_vinculos, necessita_conferencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [empresaId, nome.trim(), cor || "#C9A96E", ordem ?? 0, !!vinculavel, !!recebe_vinculos, !!necessita_conferencia]
    );
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw Object.assign(new Error("Já existe uma categoria com esse nome."), { status: 409 });
    throw e;
  }
}
```

```js
async function atualizar(id, empresaId, dados) {
  const { nome, cor, ordem, vinculavel, recebe_vinculos, necessita_conferencia } = dados;
  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  try {
    const res = await db.query(
      `UPDATE categorias
       SET nome=$1, cor=$2, ordem=$3, vinculavel=$4, recebe_vinculos=$5, necessita_conferencia=$6, updated_at=NOW()
       WHERE id=$7 AND empresa_id=$8 RETURNING *`,
      [nome.trim(), cor || "#C9A96E", ordem ?? 0, !!vinculavel, !!recebe_vinculos, !!necessita_conferencia, id, empresaId]
    );
    if (!res.rows.length) throw Object.assign(new Error("Categoria não encontrada."), { status: 404 });
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw Object.assign(new Error("Já existe uma categoria com esse nome."), { status: 409 });
    throw e;
  }
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run (a partir da pasta `backend`):
```bash
npx jest categoriaService.test.js
```
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/categoriaService.js backend/src/__tests__/categoriaService.test.js
git commit -m "feat(categorias): expoe necessita_conferencia em listar/criar/atualizar"
```

---

### Task 3: Checkbox "Item com necessidade de conferência?" em `Categorias.jsx`

**Files:**
- Modify: `frontend-web/src/pages/catalogo/Categorias.jsx`

Não há testes de frontend no projeto (`frontend-web/src` não possui nenhum arquivo `*.test.*`), então este task não inclui passo de teste automatizado.

- [ ] **Step 1: Adicionar estado `necessitaConferencia` no `CategoriaModal`**

Em `frontend-web/src/pages/catalogo/Categorias.jsx:33-34`, após a linha do `recebeVinculos`:

```jsx
  const [vinculavel, setVinculavel] = useState(categoria?.vinculavel ?? false);
  const [recebeVinculos, setRecebeVinculos] = useState(categoria?.recebe_vinculos ?? false);
  const [necessitaConferencia, setNecessitaConferencia] = useState(categoria?.necessita_conferencia ?? false);
```

- [ ] **Step 2: Incluir o campo no objeto retornado por `handleSubmit`**

Em `frontend-web/src/pages/catalogo/Categorias.jsx:45`, o `onSalvar` atual é:

```jsx
    onSalvar({ nome, cor, vinculavel, recebe_vinculos: recebeVinculos, prazos: {
```

Substitua por:

```jsx
    onSalvar({ nome, cor, vinculavel, recebe_vinculos: recebeVinculos, necessita_conferencia: necessitaConferencia, prazos: {
```

- [ ] **Step 3: Adicionar o checkbox na UI**

Em `frontend-web/src/pages/catalogo/Categorias.jsx:93-100`, após o bloco do checkbox "Deve receber itens vinculados?", adicione (ainda dentro da mesma `div.ag-form-field`, antes do `</div>` de fechamento na linha 100):

```jsx
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 8 }}>
              <input type="checkbox" checked={necessitaConferencia} onChange={(e) => setNecessitaConferencia(e.target.checked)} />
              Item com necessidade de conferência?
            </label>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0 24px" }}>
              Itens desta categoria precisam de uma visita de conferência agendada antes de definir a data de entrega.
            </p>
```

- [ ] **Step 4: Incluir `necessita_conferencia` nos payloads de `handleSalvar`**

Em `frontend-web/src/pages/catalogo/Categorias.jsx:167` (criação):

```jsx
        const res = await api.post("/categorias", { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos });
```

Substitua por:

```jsx
        const res = await api.post("/categorias", { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos, necessita_conferencia: dados.necessita_conferencia });
```

Em `frontend-web/src/pages/catalogo/Categorias.jsx:171` (edição):

```jsx
        const res = await api.put(`/categorias/${modal.id}`, { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos });
```

Substitua por:

```jsx
        const res = await api.put(`/categorias/${modal.id}`, { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos, necessita_conferencia: dados.necessita_conferencia });
```

- [ ] **Step 5: Verificação manual no navegador**

Run (a partir da pasta `frontend-web`):
```bash
npm run dev
```
Abrir a tela Categorias (Catálogo → Categorias), editar uma categoria (ex: "Persianas"), marcar "Item com necessidade de conferência?", salvar, reabrir o modal de edição da mesma categoria e confirmar que o checkbox permanece marcado (persistência via backend).

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/catalogo/Categorias.jsx
git commit -m "feat(categorias): adiciona checkbox necessita_conferencia na tela de categorias"
```

---

### Task 4: Endpoint `GET /pedidos/:id/itens-disponiveis-conferencia-entrega`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`
- Create: `backend/src/__tests__/pedidosRoutes.itensConferenciaEntrega.test.js`

- [ ] **Step 1: Escrever o arquivo de teste**

Crie `backend/src/__tests__/pedidosRoutes.itensConferenciaEntrega.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 10 };
  next();
});

const request = require('supertest');
const express = require('express');
const router  = require('../routes/pedidosRoutes');
const db      = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/pedidos', router);

afterEach(() => jest.clearAllMocks());

describe('GET /api/pedidos/:id/itens-disponiveis-conferencia-entrega', () => {
  test('404 quando o pedido nao pertence a empresa', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');
    expect(res.status).toBe(404);
  });

  test('200 retorna itens pendentes de conferencia', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({
        rows: [
          { id: 11, ambiente: 'Sala', descricao: 'Persiana Rolo', quantidade: 1, unidade: 'UN', categoria_id: 5, categoria_nome: 'Persianas' },
        ],
      });

    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([
      { id: 11, ambiente: 'Sala', descricao: 'Persiana Rolo', quantidade: 1, unidade: 'UN', categoria_id: 5, categoria_nome: 'Persianas' },
    ]);
    expect(db.query.mock.calls[1][0]).toContain('necessita_conferencia');
    expect(db.query.mock.calls[1][0]).toContain("a.tipo = 'Conferência'");
  });

  test('200 retorna lista vazia quando nao ha itens pendentes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/pedidos/1/itens-disponiveis-conferencia-entrega');

    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run (a partir da pasta `backend`):
```bash
npx jest pedidosRoutes.itensConferenciaEntrega.test.js
```
Expected: FAIL — rota retorna 404 para todas as requisições (rota inexistente).

- [ ] **Step 3: Implementar a rota em `pedidosRoutes.js`**

Em `backend/src/routes/pedidosRoutes.js`, logo após o bloco `itens-disponiveis-instalacao` (depois da linha 526, antes do comentário `// GET /pedidos/:id/itens-disponiveis-conferencia`), adicione:

```js
// GET /pedidos/:id/itens-disponiveis-conferencia-entrega
router.get("/:id/itens-disponiveis-conferencia-entrega", authMiddleware, async (req, res) => {
  try {
    const pedidoId = req.params.id;
    const empresaId = req.user.empresa_id;

    const pedCheck = await db.query(
      `SELECT id FROM pedidos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [pedidoId, empresaId]
    );
    if (pedCheck.rows.length === 0) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }

    const query = `
      SELECT
        pi.id,
        pi.ambiente,
        pi.descricao,
        pi.quantidade,
        pi.unidade,
        COALESCE(pi.categoria_id, prod.categoria_id) AS categoria_id,
        cat.nome AS categoria_nome
      FROM pedido_itens pi
      LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
      LEFT JOIN produtos prod ON prod.id = oi.produto_id
      LEFT JOIN categorias cat ON cat.id = COALESCE(pi.categoria_id, prod.categoria_id)
      WHERE pi.pedido_id = $1
        AND cat.necessita_conferencia = true
        AND pi.id NOT IN (
          SELECT ai.pedido_item_id
          FROM agendamento_itens ai
          JOIN agendamentos a ON a.id = ai.agendamento_id
          WHERE ai.pedido_item_id IS NOT NULL
            AND a.tipo = 'Conferência'
            AND a.status NOT IN ('cancelado','rejeitado')
        )
      ORDER BY pi.ordem ASC, pi.id ASC
    `;

    const { rows } = await db.query(query, [pedidoId, empresaId]);
    return res.json({ itens: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar itens pendentes de conferência." });
  }
});
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run (a partir da pasta `backend`):
```bash
npx jest pedidosRoutes.itensConferenciaEntrega.test.js
```
Expected: PASS (3 testes)

- [ ] **Step 5: Rodar a suíte completa do backend**

Run (a partir da pasta `backend`):
```bash
npx jest
```
Expected: PASS — nenhum teste existente quebrado.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.itensConferenciaEntrega.test.js
git commit -m "feat(pedidos): endpoint de itens pendentes de conferencia para definicao de entrega"
```
