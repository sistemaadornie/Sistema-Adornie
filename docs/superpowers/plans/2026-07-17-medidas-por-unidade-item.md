# Medidas Independentes por Unidade em Itens com Quantidade > 1 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um item de pedido com `quantidade > 1` em categoria que exige conferência (`categorias.necessita_conferencia`) seja tratado, a partir do agendamento de Conferência em diante, como N unidades físicas independentes — cada uma com sua própria medida técnica, ficha de confecção, status de produção, separação e entrega — sem afetar o item de venda/orçamento original.

**Architecture:** O item original vira "pai" (visível só na venda/orçamento/PDF); no momento em que um agendamento de Conferência é criado para ele, o sistema gera N registros "filhos" em `pedido_itens` (quantidade=1 cada), cada um seguindo o ciclo de produção normal como um `pedido_item_id` comum — sem nenhuma mudança de schema em `ordem_servico`, `agendamento_itens` ou nas colunas de status por item. As telas de produção passam a excluir o pai expandido e incluir os filhos; as telas de venda continuam mostrando só o pai.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), React/Vite, Jest + Supertest.

## Global Constraints

- Nenhuma tabela nova — só colunas novas em `pedido_itens` (ver spec, seção "Modelo de dados").
- Migration deve ser aplicada manualmente nos dois bancos (local + Supabase) — ver [[project_db_local_vs_supabase]]. Rodar `node src/database/run-migration.js <arquivo>` a partir de `backend/`.
- Padrão de teste do repo: `jest.mock('../database/db', () => ({ query: jest.fn() }))` (e `connect: jest.fn()` quando a função usa transação), mocks sequenciais com `mockResolvedValueOnce`.
- Todo texto de UI em português, seguindo o padrão existente das telas tocadas.
- Spec de referência: `docs/superpowers/specs/2026-07-17-medidas-por-unidade-item-design.md`.

---

## Task 1: Migration — colunas de unidade em `pedido_itens`

**Files:**
- Create: `backend/src/database/migrations/pedido_itens_unidades.sql`

**Interfaces:**
- Produces: colunas `pedido_itens.item_pai_id`, `pedido_itens.numero_unidade`, `pedido_itens.total_unidades`, `pedido_itens.expandido` — usadas por todas as tasks seguintes.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- pedido_itens_unidades.sql
-- Suporta medidas técnicas independentes por unidade física quando um item
-- de categoria que exige conferência tem quantidade > 1.

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS item_pai_id    INTEGER REFERENCES pedido_itens(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS numero_unidade SMALLINT,
  ADD COLUMN IF NOT EXISTS total_unidades SMALLINT,
  ADD COLUMN IF NOT EXISTS expandido      BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_item_pai ON pedido_itens(item_pai_id);
```

- [ ] **Step 2: Rodar a migration no banco local**

Run (a partir de `backend/`): `node src/database/run-migration.js pedido_itens_unidades.sql`
Expected: `Migration executada com sucesso.`

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/pedido_itens_unidades.sql
git commit -m "feat(pedidos): adiciona colunas de unidade em pedido_itens"
```

---

## Task 2: `expandirItensParaConferencia` em `agendamentoService.js`

**Files:**
- Modify: `backend/src/services/agendamentoService.js`
- Test: `backend/src/__tests__/agendamentoServiceExpandirItens.test.js`

**Interfaces:**
- Consumes: `pedido_itens` (colunas da Task 1), `categorias.necessita_conferencia`.
- Produces: `async function expandirItensParaConferencia(itens, client = db)` — recebe o mesmo formato de array aceito por `inserirItens`/`criarOSSeNaoExistir` (itens de `{ nome?, descricao?, pedido_item_id?, id? }` ou string), retorna um array no mesmo formato (`{ pedido_item_id, nome }` para itens expandidos/reaproveitados; item original inalterado quando não se aplica). Exportada em `module.exports` ao lado de `criarOSSeNaoExistir`.

- [ ] **Step 1: Escrever o teste (falhando)**

```js
// backend/src/__tests__/agendamentoServiceExpandirItens.test.js
const svc = require('../services/agendamentoService');

function criarClienteFake() {
  return { query: jest.fn() };
}

describe('expandirItensParaConferencia', () => {
  test('não expande quando a categoria não exige conferência', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({
      rows: [{ id: 5, quantidade: 2, item_pai_id: null, expandido: false, necessita_conferencia: false }],
    });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 5, nome: 'Cortina' }], client);

    expect(resultado).toEqual([{ pedido_item_id: 5, nome: 'Cortina' }]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('não expande quando quantidade <= 1', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({
      rows: [{ id: 6, quantidade: 1, item_pai_id: null, expandido: false, necessita_conferencia: true }],
    });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 6 }], client);

    expect(resultado).toEqual([{ pedido_item_id: 6 }]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('não expande item que já é filho (item_pai_id preenchido)', async () => {
    const client = criarClienteFake();
    client.query.mockResolvedValueOnce({
      rows: [{ id: 61, quantidade: 1, item_pai_id: 6, expandido: false, necessita_conferencia: true }],
    });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 61 }], client);

    expect(resultado).toEqual([{ pedido_item_id: 61 }]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('cria N filhos quando quantidade > 1 e categoria exige conferência', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 5, quantidade: 2, item_pai_id: null, expandido: false, necessita_conferencia: true }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 101, descricao: 'Persiana Sala' }] })
      .mockResolvedValueOnce({ rows: [{ id: 102, descricao: 'Persiana Sala' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE expandido

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 5, nome: 'Persiana Sala' }], client);

    expect(resultado).toEqual([
      { pedido_item_id: 101, nome: 'Persiana Sala' },
      { pedido_item_id: 102, nome: 'Persiana Sala' },
    ]);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO pedido_itens');
    expect(client.query.mock.calls[1][1]).toEqual([5, 1, 2]);
    expect(client.query.mock.calls[2][1]).toEqual([5, 2, 2]);
    expect(client.query.mock.calls[3][0]).toContain('UPDATE pedido_itens SET expandido = true');
    expect(client.query.mock.calls[3][1]).toEqual([5]);
  });

  test('reaproveita filhos existentes quando já expandido (idempotente)', async () => {
    const client = criarClienteFake();
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 5, quantidade: 2, item_pai_id: null, expandido: true, necessita_conferencia: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 101, descricao: 'Persiana Sala' }, { id: 102, descricao: 'Persiana Sala' }],
      });

    const resultado = await svc.expandirItensParaConferencia([{ pedido_item_id: 5 }], client);

    expect(resultado).toEqual([
      { pedido_item_id: 101, nome: 'Persiana Sala' },
      { pedido_item_id: 102, nome: 'Persiana Sala' },
    ]);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  test('ignora item sem pedido_item_id', async () => {
    const client = criarClienteFake();
    const resultado = await svc.expandirItensParaConferencia([{ nome: 'item digitado à mão' }], client);
    expect(resultado).toEqual([{ nome: 'item digitado à mão' }]);
    expect(client.query).not.toHaveBeenCalled();
  });

  test('lista vazia retorna vazio', async () => {
    const client = criarClienteFake();
    const resultado = await svc.expandirItensParaConferencia([], client);
    expect(resultado).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest agendamentoServiceExpandirItens --no-coverage`
Expected: FAIL — `svc.expandirItensParaConferencia is not a function`

- [ ] **Step 3: Implementar `expandirItensParaConferencia`**

Em `backend/src/services/agendamentoService.js`, adicionar logo acima de `criarOSSeNaoExistir` (antes da linha `/* ── criar Ordem de Serviço (OS) se não existir para itens de conferência ── */`):

```js
/* ── expande itens com quantidade > 1 (categorias que exigem conferência) em unidades independentes ── */
async function expandirItensParaConferencia(itens, client = db) {
  if (!itens || !itens.length) return itens || [];

  const resultado = [];
  for (const it of itens) {
    const pedidoItemId = it && typeof it === "object" ? (it.pedido_item_id || it.id || null) : null;
    if (!pedidoItemId) { resultado.push(it); continue; }

    const { rows } = await client.query(
      `SELECT pi.id, pi.quantidade, pi.item_pai_id, pi.expandido,
              COALESCE(cat.necessita_conferencia, false) AS necessita_conferencia
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.id = $1`,
      [pedidoItemId]
    );
    const item = rows[0];

    if (!item || item.item_pai_id != null || !item.necessita_conferencia || Number(item.quantidade) <= 1) {
      resultado.push(it);
      continue;
    }

    if (item.expandido) {
      const { rows: filhos } = await client.query(
        `SELECT id, descricao FROM pedido_itens WHERE item_pai_id = $1 ORDER BY numero_unidade`,
        [item.id]
      );
      for (const f of filhos) resultado.push({ pedido_item_id: f.id, nome: f.descricao });
      continue;
    }

    const totalUnidades = Math.round(Number(item.quantidade));
    for (let n = 1; n <= totalUnidades; n++) {
      const { rows: ins } = await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, ambiente, descricao, categoria_id, modelo, especificacoes, unidade,
            quantidade, item_pai_id, numero_unidade, total_unidades)
         SELECT pedido_id, ambiente, descricao, categoria_id, modelo, especificacoes, unidade,
                1, id, $2, $3
         FROM pedido_itens WHERE id = $1
         RETURNING id, descricao`,
        [item.id, n, totalUnidades]
      );
      resultado.push({ pedido_item_id: ins[0].id, nome: ins[0].descricao });
    }
    await client.query(`UPDATE pedido_itens SET expandido = true WHERE id = $1`, [item.id]);
  }
  return resultado;
}
```

Adicionar `expandirItensParaConferencia` ao `module.exports` no final do arquivo (ao lado de `criarOSSeNaoExistir`).

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest agendamentoServiceExpandirItens --no-coverage`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoServiceExpandirItens.test.js
git commit -m "feat(pedidos): adiciona expandirItensParaConferencia para itens com quantidade > 1"
```

---

## Task 3: Integrar a expansão em `criar()` e `atualizar()` do agendamento

**Files:**
- Modify: `backend/src/services/agendamentoService.js:476-480` (dentro de `criar`)
- Modify: `backend/src/services/agendamentoService.js:623-627` (dentro de `atualizar`)
- Test: `backend/src/__tests__/agendamentoServiceExpandeNaCriacao.test.js`

**Interfaces:**
- Consumes: `expandirItensParaConferencia` (Task 2), `inserirItens`, `criarOSSeNaoExistir` (já existentes).

- [ ] **Step 1: Escrever o teste (falhando)**

```js
// backend/src/__tests__/agendamentoServiceExpandeNaCriacao.test.js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/clienteService', () => ({ resolverCliente: jest.fn() }));
jest.mock('../utils/geocoding', () => ({
  geocodificarAgendamento: jest.fn().mockResolvedValue(null),
  geocodificarLote: jest.fn(),
  avaliarEndereco: jest.fn(),
}));
const db = require('../database/db');
const { resolverCliente } = require('../services/clienteService');
const svc = require('../services/agendamentoService');

function mockClientPersianaX2(agendamentoId) {
  const client = {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO agendamentos')) return { rows: [{ id: agendamentoId }] };
      if (sql.includes('SELECT pi.id, pi.quantidade, pi.item_pai_id, pi.expandido')) {
        return { rows: [{ id: params[0], quantidade: 2, item_pai_id: null, expandido: false, necessita_conferencia: true }] };
      }
      if (sql.includes('INSERT INTO pedido_itens')) {
        return { rows: [{ id: 200 + params[1], descricao: 'Persiana Sala' }] };
      }
      if (sql.includes('UPDATE pedido_itens SET expandido')) return { rows: [] };
      if (sql.includes('INSERT INTO agendamento_itens')) return { rows: [] };
      if (sql.includes('SELECT cat.tipo_confeccao')) return { rows: [{ tipo_confeccao: 'persiana' }] };
      if (sql.includes('SELECT id FROM ordem_servico')) return { rows: [] };
      if (sql.includes('INSERT INTO ordem_servico')) return { rows: [] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return client;
}

beforeEach(() => {
  db.query.mockImplementation(async () => ({ rows: [{ id: 1 }] }));
  resolverCliente.mockResolvedValue({ id: 3, criado: false });
});
afterEach(() => jest.clearAllMocks());

describe('criar — expande itens de Conferência com quantidade > 1', () => {
  test('agendamento_itens recebe os ids dos filhos, não o item original', async () => {
    const client = mockClientPersianaX2(900);
    db.connect.mockResolvedValueOnce(client);

    await svc.criar(10, 1, {
      titulo: 'Conferência', cliente: 'Cliente Y', tipo: 'Conferência', data: '2026-08-01',
      itens: [{ pedido_item_id: 5, nome: 'Persiana Sala' }],
    });

    const insertsItens = client.query.mock.calls.filter((c) => c[0].includes('INSERT INTO agendamento_itens'));
    expect(insertsItens).toHaveLength(2);
    expect(insertsItens.map((c) => c[1][2])).toEqual([201, 202]);
  });
});

describe('atualizar — expande itens de Conferência com quantidade > 1', () => {
  test('agendamento_itens recebe os ids dos filhos, não o item original', async () => {
    const client = mockClientPersianaX2(900);
    db.connect.mockResolvedValueOnce(client);

    await svc.atualizar(900, 10, 1, 'Admin', {
      titulo: 'Conferência', cliente: 'Cliente Y', tipo: 'Conferência', data: '2026-08-01',
      itens: [{ pedido_item_id: 5, nome: 'Persiana Sala' }],
    });

    const insertsItens = client.query.mock.calls.filter((c) => c[0].includes('INSERT INTO agendamento_itens'));
    expect(insertsItens).toHaveLength(2);
    expect(insertsItens.map((c) => c[1][2])).toEqual([201, 202]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest agendamentoServiceExpandeNaCriacao --no-coverage`
Expected: FAIL — `insertsItens` contém o `pedido_item_id` original (5), não os filhos (201/202)

- [ ] **Step 3: Implementar a integração**

Em `criar()` (`backend/src/services/agendamentoService.js`), substituir:

```js
    await Promise.all([inserirEquipe(agId, equipe, client), inserirItens(agId, itens, client)]);

    if (tipo === "Conferência") {
      await criarOSSeNaoExistir(itens, client);
    }
```

por:

```js
    const itensParaSalvar = tipo === "Conferência"
      ? await expandirItensParaConferencia(itens, client)
      : itens;

    await Promise.all([inserirEquipe(agId, equipe, client), inserirItens(agId, itensParaSalvar, client)]);

    if (tipo === "Conferência") {
      await criarOSSeNaoExistir(itensParaSalvar, client);
    }
```

Em `atualizar()`, substituir:

```js
    await Promise.all([inserirEquipe(id, equipe, client), inserirItens(id, itens, client)]);

    if (tipo === "Conferência") {
      await criarOSSeNaoExistir(itens, client);
    }
```

por:

```js
    const itensParaSalvar = tipo === "Conferência"
      ? await expandirItensParaConferencia(itens, client)
      : itens;

    await Promise.all([inserirEquipe(id, equipe, client), inserirItens(id, itensParaSalvar, client)]);

    if (tipo === "Conferência") {
      await criarOSSeNaoExistir(itensParaSalvar, client);
    }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest agendamentoServiceExpandeNaCriacao --no-coverage`
Expected: PASS (2 testes)

- [ ] **Step 5: Rodar a suíte completa de agendamentoService para checar regressão**

Run: `npx jest agendamentoService --no-coverage`
Expected: PASS em todos os arquivos `agendamentoService*.test.js`

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoServiceExpandeNaCriacao.test.js
git commit -m "feat(pedidos): agendamento de Conferência expande itens com quantidade > 1"
```

---

## Task 4: Rótulo "Unidade X de Y" na lista de conferência

**Files:**
- Modify: `backend/src/services/agendamentoService.js:1411-1436` (`listarConferenciaItens`)
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx:2825-2857`
- Test: `backend/src/__tests__/agendamentoServiceListarConferenciaItens.test.js` (arquivo já existe — adicionar caso)

**Interfaces:**
- Produces: `listarConferenciaItens` passa a incluir `numero_unidade`, `total_unidades` em cada linha retornada.

- [ ] **Step 1: Ler o teste existente para seguir o padrão**

Ler `backend/src/__tests__/agendamentoServiceListarConferenciaItens.test.js` (já existe, cobre o formato atual da query) antes de editar.

- [ ] **Step 2: Adicionar o teste (falhando)**

Adicionar ao describe existente em `agendamentoServiceListarConferenciaItens.test.js`:

```js
test('inclui numero_unidade e total_unidades na query', async () => {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // agCheck
    .mockResolvedValueOnce({ rows: [] });

  await svc.listarConferenciaItens(1, 10);

  expect(db.query.mock.calls[1][0]).toContain('pi.numero_unidade');
  expect(db.query.mock.calls[1][0]).toContain('pi.total_unidades');
});
```

(Ajustar o mock de `agCheck`/nomes de variáveis para bater com o padrão já usado no arquivo, se diferente do trecho acima.)

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx jest agendamentoServiceListarConferenciaItens --no-coverage`
Expected: FAIL — SQL não contém `pi.numero_unidade`

- [ ] **Step 4: Adicionar as colunas na query**

Em `listarConferenciaItens` (`backend/src/services/agendamentoService.js:1411-1436`), adicionar `pi.numero_unidade` e `pi.total_unidades` ao `SELECT`:

```js
  const { rows } = await db.query(
    `SELECT
       pi.id AS pedido_item_id,
       pi.descricao,
       pi.ambiente,
       pi.numero_unidade,
       pi.total_unidades,
       cat.tipo_confeccao,
       COALESCE(ci.status, 'pendente') AS status,
       ci.observacoes,
       ci.dados,
       ci.conferido_em,
       u.nome_completo AS conferido_por_nome,
       os.id AS ordem_servico_id,
       (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
       (os.dados_conferencia_consultoras IS NOT NULL) AS conferencia_consultoras_preenchida,
       (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
     FROM agendamento_itens ai
     JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
     LEFT JOIN categorias cat ON cat.id = pi.categoria_id
     LEFT JOIN conferencia_itens ci
       ON ci.agendamento_id = $1 AND ci.pedido_item_id = pi.id
     LEFT JOIN usuarios u ON u.id = ci.conferido_por
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     WHERE ai.agendamento_id = $1
       AND ai.pedido_item_id IS NOT NULL
     ORDER BY pi.ordem ASC, pi.id ASC`,
    [agendamentoId]
  );
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest agendamentoServiceListarConferenciaItens --no-coverage`
Expected: PASS

- [ ] **Step 6: Exibir o rótulo no frontend**

Em `frontend-web/src/pages/agendamentos/Agendamentos.jsx`, dentro do `.map((item) => {...})` da lista de conferência (linha ~2850-2853), trocar:

```jsx
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>{item.descricao}</div>
                    {item.ambiente && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.ambiente}</div>}
                  </span>
```

por:

```jsx
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>
                      {item.descricao}
                      {item.total_unidades > 1 && ` — Unidade ${item.numero_unidade} de ${item.total_unidades}`}
                    </div>
                    {item.ambiente && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.ambiente}</div>}
                  </span>
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoServiceListarConferenciaItens.test.js frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(pedidos): mostra rótulo de unidade na lista de conferência"
```

---

## Task 5: Filtro de venda em `montarPedido` + correção crítica em `_salvarItens`

**Contexto crítico:** `_salvarItens` (usada ao salvar `EditarPedido.jsx`) hoje busca `existingIds` = **todos** os `pedido_itens` do pedido, sem filtrar filhos, e deleta qualquer id que não esteja no payload recebido do frontend. Como `EditarPedido.jsx` só carrega/edita os itens-pai (depois deste task), **todo filho gerado pela Task 3 seria apagado (com sua OS/medida técnica) na primeira vez que o pedido fosse salvo pela tela de venda** se essa query não for corrigida. Este task corrige as duas pontas juntas.

**Files:**
- Modify: `backend/src/services/pedidoService.js:132-145` (`montarPedido`)
- Modify: `backend/src/services/pedidoService.js:229-241` (`_salvarItens`)
- Test: `backend/src/__tests__/pedidoService.test.js`

**Interfaces:**
- Produces: `montarPedido(id, empresaId)` retorna só itens com `item_pai_id IS NULL` em `pedido.itens`. `_salvarItens` nunca inclui filhos (`item_pai_id IS NOT NULL`) no cálculo de `idsParaDeletar`.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar a `backend/src/__tests__/pedidoService.test.js`, dentro de `describe('buscar (montarPedido)', ...)`:

```js
test('filtra apenas itens-pai (item_pai_id IS NULL)', async () => {
  const pedidoRow = {
    id: 3, empresa_id: 10, status: 'pendente',
    numero_origem: null, numero_sequencial: 3,
    cliente_nome: null, cliente_telefone: null,
    consultor_nome: null, arquiteto_nome: null,
    tem_anexo_pdf: false,
  };
  db.query
    .mockResolvedValueOnce({ rows: [pedidoRow] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  await svc.buscar(3, 10);

  expect(db.query.mock.calls[1][0]).toContain('item_pai_id IS NULL');
});
```

Criar um novo describe no mesmo arquivo para `_salvarItens` (exercitada via `atualizar`):

```js
describe('atualizar — _salvarItens não deleta itens filhos (expandidos)', () => {
  test('exclui filhos da query de itens existentes, mesmo que não venham no payload', async () => {
    const pedidoAntes = {
      id: 7, empresa_id: 10, status: 'pendente', itens: [], pagamentos: [],
    };
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, empresa_id: 10, status: 'pendente' }] }) // montarPedido: pedidos
      .mockResolvedValueOnce({ rows: [] }) // montarPedido: itens
      .mockResolvedValueOnce({ rows: [] }); // montarPedido: pagamentos

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // UPDATE pedidos
      .mockResolvedValueOnce({ rows: [{ id: 40 }] }) // _salvarItens: SELECT existingIds (só pais)
      .mockResolvedValueOnce({ rows: [] }) // _salvarItens: UPDATE item 40
      .mockResolvedValueOnce({ rows: [] }) // _salvarPagamentos: DELETE
      .mockResolvedValueOnce({ rows: [] }); // _verificarEtapa1 ou próxima query
    db.connect.mockResolvedValueOnce(client);

    await svc.atualizar(7, 10, { itens: [{ id: 40, descricao: 'Persiana Sala', quantidade: 2 }] }, 1)
      .catch(() => {}); // tolera erro em passos posteriores não mockados neste teste focado

    const selectExisting = client.query.mock.calls.find((c) => c[0].includes('SELECT id FROM pedido_itens'));
    expect(selectExisting[0]).toContain('item_pai_id IS NULL');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest pedidoService --no-coverage`
Expected: FAIL — SQL não contém `item_pai_id IS NULL` em nenhuma das duas queries

- [ ] **Step 3: Corrigir `montarPedido`**

Em `backend/src/services/pedidoService.js:132-145`, trocar:

```js
  const itensRes = await db.query(
    `SELECT pi.*,
            os.id             AS os_id,
            os.status         AS os_status,
            os.dados_tecnicos AS dados_tecnicos,
            cat.nome  AS categoria_nome,
            cat.cor   AS categoria_cor
     FROM pedido_itens pi
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     LEFT JOIN categorias cat   ON cat.id = pi.categoria_id
     WHERE pi.pedido_id=$1
     ORDER BY pi.ordem, pi.id`,
    [id]
  );
```

por:

```js
  const itensRes = await db.query(
    `SELECT pi.*,
            os.id             AS os_id,
            os.status         AS os_status,
            os.dados_tecnicos AS dados_tecnicos,
            cat.nome  AS categoria_nome,
            cat.cor   AS categoria_cor
     FROM pedido_itens pi
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     LEFT JOIN categorias cat   ON cat.id = pi.categoria_id
     WHERE pi.pedido_id=$1 AND pi.item_pai_id IS NULL
     ORDER BY pi.ordem, pi.id`,
    [id]
  );
```

- [ ] **Step 4: Corrigir `_salvarItens`**

Em `backend/src/services/pedidoService.js:229-234`, trocar:

```js
async function _salvarItens(client, pedidoId, itens = []) {
  const existingRes = await client.query(
    `SELECT id FROM pedido_itens WHERE pedido_id = $1`,
    [pedidoId]
  );
```

por:

```js
async function _salvarItens(client, pedidoId, itens = []) {
  const existingRes = await client.query(
    `SELECT id FROM pedido_itens WHERE pedido_id = $1 AND item_pai_id IS NULL`,
    [pedidoId]
  );
```

(Itens filhos — `item_pai_id IS NOT NULL` — nunca aparecem no payload da tela de venda, então nunca devem entrar no cálculo de `idsParaDeletar`; ficam de fora do diffing inteiramente.)

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx jest pedidoService --no-coverage`
Expected: PASS

- [ ] **Step 6: Rodar a suíte completa do backend para checar regressão**

Run: `npx jest --no-coverage`
Expected: todos os testes passam

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "fix(pedidos): venda nunca lista nem deleta itens-filho expandidos"
```

---

## Task 6: Bloquear edição de quantidade em item já expandido

**Files:**
- Modify: `backend/src/services/pedidoService.js:229-276` (`_salvarItens`, ramo UPDATE)
- Modify: `frontend-web/src/pages/pedidos/EditarPedido.jsx:75-92` (mapeamento de itens) e `:370` (input de quantidade)
- Test: `backend/src/__tests__/pedidoService.test.js`

**Interfaces:**
- Produces: `_salvarItens` lança erro `{status: 400}` se tentar mudar `quantidade` de um item com `expandido = true`.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar a `backend/src/__tests__/pedidoService.test.js`:

```js
describe('_salvarItens — bloqueia mudança de quantidade em item expandido', () => {
  test('lança 400 ao tentar mudar quantidade de item com expandido=true', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 8, empresa_id: 10, status: 'pendente' }] }) // montarPedido: pedidos
      .mockResolvedValueOnce({ rows: [] }) // montarPedido: itens
      .mockResolvedValueOnce({ rows: [] }); // montarPedido: pagamentos

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 8 }] }) // UPDATE pedidos
      .mockResolvedValueOnce({ rows: [{ id: 50, quantidade: '2.00', expandido: true }] }); // SELECT existingIds
    db.connect.mockResolvedValueOnce(client);

    await expect(
      svc.atualizar(8, 10, { itens: [{ id: 50, descricao: 'Persiana Sala', quantidade: 3 }] }, 1)
    ).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest pedidoService --no-coverage`
Expected: FAIL — não lança erro nenhum hoje

- [ ] **Step 3: Implementar a validação**

Em `backend/src/services/pedidoService.js`, trocar a query de `existingIds` em `_salvarItens` (já ajustada na Task 5) para também trazer `quantidade` e `expandido`, e validar dentro do loop de UPDATE:

```js
async function _salvarItens(client, pedidoId, itens = []) {
  const existingRes = await client.query(
    `SELECT id, quantidade, expandido FROM pedido_itens WHERE pedido_id = $1 AND item_pai_id IS NULL`,
    [pedidoId]
  );
  const existingIds = existingRes.rows.map((r) => r.id);
  const existingById = new Map(existingRes.rows.map((r) => [r.id, r]));
  const incomingIds = itens.map((it) => Number(it.id)).filter((id) => Number.isFinite(id) && id > 0);

  const idsParaDeletar = existingIds.filter((id) => !incomingIds.includes(id));
  if (idsParaDeletar.length > 0) {
    await client.query(`DELETE FROM ordem_servico WHERE pedido_item_id = ANY($1)`, [idsParaDeletar]);
    await client.query(`DELETE FROM pedido_itens WHERE id = ANY($1)`, [idsParaDeletar]);
  }

  for (let i = 0; i < itens.length; i++) {
    const it     = itens[i];
    const itemId = Number(it.id);

    if (Number.isFinite(itemId) && itemId > 0 && existingIds.includes(itemId)) {
      const existente = existingById.get(itemId);
      const novaQuantidade = parseFloat(it.quantidade) || 1;
      if (existente.expandido && novaQuantidade !== parseFloat(existente.quantidade)) {
        const e = new Error(
          "Não é possível alterar a quantidade deste item depois que a Conferência técnica foi iniciada."
        );
        e.status = 400;
        throw e;
      }

      // UPDATE item existente
      await client.query(
```

(O restante do bloco UPDATE/INSERT permanece igual — só a checagem acima é nova, inserida antes do `await client.query(... UPDATE pedido_itens ...)` já existente.)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest pedidoService --no-coverage`
Expected: PASS

- [ ] **Step 5: Bloquear no frontend**

Em `frontend-web/src/pages/pedidos/EditarPedido.jsx:75-92`, adicionar `expandido` ao mapeamento de itens:

```js
        setItens((p.itens || []).map((it) => ({
          id:             it.id,
          ambiente:       it.ambiente || "",
          referencia:     it.referencia || "",
          cor:            it.cor || "",
          descricao:      it.descricao || "",
          largura:        it.largura ?? "",
          altura:         it.altura ?? "",
          medidas:        it.medidas ?? null,
          quantidade:     it.quantidade ?? 1,
          unidade:        it.unidade || "UN",
          preco_unitario: it.preco_unitario ?? "",
          valor:          it.valor ?? "",
          categoria_id:   it.categoria_id ?? null,
          sem_vinculo:    it.sem_vinculo ?? false,
          modelo:         it.modelo ?? null,
          especificacoes: it.especificacoes ?? null,
          expandido:      it.expandido ?? false,
        })));
```

Em `EditarPedido.jsx:370`, trocar:

```jsx
                    <input type="number" min="0" step="0.01" value={it.quantidade || 1} onChange={(e) => setItem(i, "quantidade", e.target.value)} />
```

por:

```jsx
                    <input
                      type="number" min="0" step="0.01" value={it.quantidade || 1}
                      disabled={it.expandido}
                      title={it.expandido ? "Quantidade travada: a Conferência técnica já foi iniciada para este item." : undefined}
                      onChange={(e) => setItem(i, "quantidade", e.target.value)}
                    />
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js frontend-web/src/pages/pedidos/EditarPedido.jsx
git commit -m "feat(pedidos): trava edição de quantidade após início da Conferência técnica"
```

---

## Task 7: Filtros de venda/produção em `listarPedidosDashboard`

**Files:**
- Modify: `backend/src/services/dashboardService.js:139` (itens_count)
- Modify: `backend/src/services/dashboardService.js:193-198` (total itens Etapa 1)
- Modify: `backend/src/services/dashboardService.js:213-221` (total necessita conferência)
- Modify: `backend/src/services/dashboardService.js:239-248` (itens sem categoria)
- Modify: `backend/src/services/dashboardService.js:250-261` (itens sem vínculo)
- Modify: `backend/src/services/dashboardService.js:264-273` (Conferência Técnica)
- Modify: `backend/src/services/dashboardService.js:275-283` (confecção)
- Modify: `backend/src/services/dashboardService.js:298-304` (produto_ok)
- Modify: `backend/src/services/dashboardService.js:329-338` (Conferência Consultoras)
- Test: `backend/src/__tests__/dashboardService.test.js`

**Interfaces:**
- Regra aplicada: contagens de **venda** (itens_count, sem categoria, sem vínculo) usam `pi.item_pai_id IS NULL`; contagens de **produção** (total itens Etapa 1, necessita conferência, Conferência Técnica, confecção, produto_ok, Conferência Consultoras) usam `NOT (pi.item_pai_id IS NULL AND pi.expandido = true)`, aplicado nos dois lados de cada razão total/concluído.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar a `backend/src/__tests__/dashboardService.test.js`, dentro (ou logo após) do `describe("listarPedidosDashboard", ...)` existente — reaproveitar o helper de mock de 14 chamadas já usado nos testes vizinhos desse describe (main SELECT + 13 do `Promise.all`) e então:

```js
test('aplica filtro de venda e de produção nas queries de itens', async () => {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 1, itens_count: '2' }] }) // main SELECT
    .mockResolvedValueOnce({ rows: [] }) // preAgs
    .mockResolvedValueOnce({ rows: [] }) // total itens
    .mockResolvedValueOnce({ rows: [] }) // itens cobertos (instalação)
    .mockResolvedValueOnce({ rows: [] }) // total itens conferência
    .mockResolvedValueOnce({ rows: [] }) // itens cobertos conferência
    .mockResolvedValueOnce({ rows: [] }) // sem categoria
    .mockResolvedValueOnce({ rows: [] }) // sem vinculo
    .mockResolvedValueOnce({ rows: [] }) // conferencia (etapa 2)
    .mockResolvedValueOnce({ rows: [] }) // confeccao (etapa 3)
    .mockResolvedValueOnce({ rows: [] }) // genitores agendados
    .mockResolvedValueOnce({ rows: [] }) // produto_ok
    .mockResolvedValueOnce({ rows: [] }) // instalacoes
    .mockResolvedValueOnce({ rows: [] }) // separacao
    .mockResolvedValueOnce({ rows: [] }); // conferencia consultoras

  await listarPedidosDashboard(10, 1, []);

  const calls = db.query.mock.calls.map((c) => c[0]);
  expect(calls[0]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // itens_count
  expect(calls[2]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // total itens Etapa 1
  expect(calls[4]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // necessita conferência
  expect(calls[6]).toContain('pi.item_pai_id IS NULL'); // sem categoria (venda)
  expect(calls[7]).toContain('pi.item_pai_id IS NULL'); // sem vinculo (venda)
  expect(calls[8]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // conferencia tecnica
  expect(calls[9]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // confeccao
  expect(calls[11]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // produto_ok
  expect(calls[14]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // conferencia consultoras
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest dashboardService.test --no-coverage`
Expected: FAIL — nenhuma das queries contém os filtros ainda

- [ ] **Step 3: Aplicar os filtros**

Em `backend/src/services/dashboardService.js`, editar cada bloco:

Linha 139 (`itens_count`), trocar `COUNT(pi.id)` por uma contagem filtrada e o `JOIN` para incluir a condição — como o `pi` já é usado em `GROUP BY`/`EXISTS` fora do agregado, use `COUNT(pi.id) FILTER (WHERE ...)`:

```sql
COUNT(pi.id) FILTER (WHERE NOT (pi.item_pai_id IS NULL AND pi.expandido = true)) AS itens_count,
```

Linhas 193-198 (total itens Etapa 1):

```sql
    db.query(
      `SELECT pedido_id, COUNT(*)::int AS total
       FROM pedido_itens pi
       WHERE pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
```

(Adicionar o alias `pi` — hoje a query não tem alias.)

Linhas 213-221 (necessita conferência):

```sql
    db.query(
      `SELECT pi.pedido_id, COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = ANY($1) AND cat.necessita_conferencia = true
         AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
```

Linhas 239-248 (sem categoria) — adicionar ao `WHERE`:

```sql
       WHERE pi.pedido_id = ANY($1)
         AND pi.item_pai_id IS NULL
         AND COALESCE(pi.categoria_id, prod.categoria_id) IS NULL
```

Linhas 250-261 (sem vínculo) — adicionar ao `WHERE`:

```sql
       WHERE pi.pedido_id = ANY($1)
         AND pi.item_pai_id IS NULL
         AND COALESCE(cat.vinculavel, false) = true
```

Linhas 264-273 (Conferência Técnica) — adicionar ao `WHERE`:

```sql
       WHERE pi.pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
```

Linhas 275-283 (confecção) — adicionar alias `pi` e filtro:

```sql
    db.query(
      `SELECT pedido_id,
              COUNT(*) FILTER (WHERE em_confeccao = true)::int AS em_confeccao,
              COUNT(*) FILTER (WHERE em_confeccao = true AND confeccao_ok = true)::int AS confeccao_ok
       FROM pedido_itens pi
       WHERE pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
```

Linhas 298-304 (produto_ok) — mesmo padrão (alias `pi` + filtro):

```sql
    db.query(
      `SELECT pedido_id, COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens pi
       WHERE pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
```

Linhas 329-338 (Conferência Consultoras) — adicionar ao `WHERE`:

```sql
       WHERE pi.pedido_id = ANY($1) AND cat.necessita_conferencia = true
         AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
         AND os.dados_conferencia_consultoras IS NOT NULL
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest dashboardService.test --no-coverage`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte de dashboardService para checar regressão**

Run: `npx jest dashboardService --no-coverage`
Expected: PASS em todos os arquivos `dashboardService*.test.js`

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.test.js
git commit -m "feat(dashboard): progresso do pedido considera itens expandidos por unidade"
```

---

## Task 8: Mesmos filtros + rótulo de unidade em `buscarFluxoPedido`

**Files:**
- Modify: `backend/src/services/dashboardService.js:507-508` (lista de itens do fluxo)
- Modify: `backend/src/services/dashboardService.js:552` (total itens)
- Modify: `backend/src/services/dashboardService.js:567-572` (necessita conferência)
- Modify: `backend/src/services/dashboardService.js:588-595` (sem categoria)
- Modify: `backend/src/services/dashboardService.js:597-606` (sem vínculo)
- Modify: `backend/src/services/dashboardService.js:609-616` (Conferência Técnica)
- Modify: `backend/src/services/dashboardService.js:618-624` (confecção)
- Modify: `backend/src/services/dashboardService.js:637-641` (produto_ok)
- Modify: `backend/src/services/dashboardService.js:663-670` (Conferência Consultoras)
- Modify: `backend/src/services/dashboardService.js:742-744` (itensPorGenitor — rótulo)
- Modify: `backend/src/services/dashboardService.js:792` (separacaoRows — rótulo)
- Test: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`

**Interfaces:**
- Mesma regra da Task 7 (venda vs produção), aplicada à versão "um só pedido" de cada query.
- Produces: `pedido.itens[].numero_unidade/total_unidades`, `pre_agendamentos[].itens[].numero_unidade/total_unidades`, `pre_agendamentos[].herdeiros[].itens[].numero_unidade/total_unidades` disponíveis para o frontend rotular.

- [ ] **Step 1: Adicionar o teste (falhando)**

Adicionar a `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`, seguindo exatamente a sequência de 22 chamadas já usada no describe `'buscarFluxoPedido — itens_cobertos filtra por tipo Instalação e pre_agendamentos expõe tipo'` deste arquivo (pedido com `genitoresRaw` não vazio, para exercitar também `itensPorGenitor`/`separacaoRows`):

```js
describe('buscarFluxoPedido — filtro de unidades e rótulo', () => {
  test('queries de itens usam o filtro correto (venda vs produção) e trazem numero_unidade/total_unidades', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, numero_sequencial: 1, numero_origem: null, status: 'em_andamento',
        verificacao_ok: true, categorizacao_ok: true, total: '0',
        criado_em: '2026-01-01T00:00:00.000Z',
        cliente_id: null, cep: null, rua: null, numero_rua: null, complemento: null,
        bairro: null, cidade: null, estado: null,
        cliente_nome: null, consultor_nome: 'Consultora', consultor_id: 99,
      }] }) // pedido
      .mockResolvedValueOnce({ rows: [] }) // anexos
      .mockResolvedValueOnce({ rows: [] }) // vinculos
      .mockResolvedValueOnce({ rows: [] }) // allItems
      .mockResolvedValueOnce({ rows: [] }) // itensRows
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'agendado', tipo: 'Conferência', data_inicio: '2026-06-20' }] }) // genitoresRaw
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })                // totalItensRows
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] })             // itensCobertosRows (instalação)
      .mockResolvedValueOnce({ rows: [] })                            // totalConferenciaRows
      .mockResolvedValueOnce({ rows: [] })                            // itensCobertosConferenciaRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })              // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] })             // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 1, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] })            // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] })           // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] })            // itensPersianaPendentesRows
      .mockResolvedValueOnce({ rows: [] })                            // itensControleRows
      .mockResolvedValueOnce({ rows: [] })                            // itensComConferenciaConsultorasRows
      .mockResolvedValueOnce({ rows: [] }) // itensPorGenitor
      .mockResolvedValueOnce({ rows: [] }) // herdeirosRaw
      .mockResolvedValueOnce({ rows: [] }); // separacaoRows

    await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);

    const calls = db.query.mock.calls.map((c) => c[0]);
    expect(calls[4]).toContain('pi.numero_unidade');
    expect(calls[4]).toContain('NOT (item_pai_id IS NULL AND expandido = true)'); // itensRows (sem alias)
    expect(calls[6]).toContain('NOT (item_pai_id IS NULL AND expandido = true)'); // totalItensRows
    expect(calls[8]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // totalConferenciaRows
    expect(calls[10]).toContain('pi.item_pai_id IS NULL'); // itensSemCatRows (venda)
    expect(calls[11]).toContain('pi.item_pai_id IS NULL'); // itensSemVinculoRows (venda)
    expect(calls[12]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // confRows
    expect(calls[13]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // prodRows
    expect(calls[15]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // produtoOkRows
    expect(calls[18]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)'); // itensComConferenciaConsultorasRows
    expect(calls[19]).toContain('pi.numero_unidade'); // itensPorGenitor
    expect(calls[21]).toContain('pi.numero_unidade'); // separacaoRows
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest dashboardService.buscarFluxoPedido --no-coverage`
Expected: FAIL

- [ ] **Step 3: Aplicar os filtros e as colunas de rótulo**

Linha 505-510 — lista de itens do fluxo (produção + rótulo):

```js
    db.query(
      `SELECT id, descricao, ambiente, quantidade, unidade, em_confeccao, confeccao_ok, produto_ok,
              numero_unidade, total_unidades
       FROM pedido_itens
       WHERE pedido_id = $1 AND NOT (item_pai_id IS NULL AND expandido = true)
       ORDER BY ordem ASC, id ASC`,
      [pedidoId]
    ),
```

Linha 552 (total itens):

```sql
      `SELECT COUNT(*)::int AS total FROM pedido_itens WHERE pedido_id = $1 AND NOT (item_pai_id IS NULL AND expandido = true)`,
```

Linhas 567-572 (necessita conferência) — adicionar ao `WHERE`:

```sql
       WHERE pi.pedido_id = $1 AND cat.necessita_conferencia = true
         AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
```

Linhas 588-595 (sem categoria) — adicionar `AND pi.item_pai_id IS NULL`.

Linhas 597-606 (sem vínculo) — adicionar `AND pi.item_pai_id IS NULL`.

Linhas 609-616 (Conferência Técnica) — adicionar `AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)`.

Linhas 618-624 (confecção) — adicionar alias `pi` + `AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)`.

Linhas 637-641 (produto_ok) — adicionar alias `pi` + mesmo filtro.

Linhas 663-670 (Conferência Consultoras) — adicionar mesmo filtro ao `WHERE`.

Linhas 742-744 (`itensPorGenitor`) — adicionar colunas de rótulo:

```sql
      `SELECT ai.agendamento_id, ai.pedido_item_id, pi.descricao, pi.ordem, pi.medidas,
              pi.ambiente, pi.largura, pi.altura, pi.modelo, pi.numero_unidade, pi.total_unidades,
              pi.especificacoes->>'acionamento' AS acionamento,
```

E incluir `numero_unidade`/`total_unidades` no objeto empurrado em `itensPorAg[item.agendamento_id].push({...})` logo abaixo (linhas ~769-783):

```js
    itensPorAg[item.agendamento_id].push({
      pedido_item_id: item.pedido_item_id,
      descricao: item.descricao,
      ordem: item.ordem,
      medidas: item.medidas,
      ambiente: item.ambiente,
      largura: item.largura,
      altura: item.altura,
      numero_unidade: item.numero_unidade,
      total_unidades: item.total_unidades,
      produto: labelProdutoConferencia(item.tipo_confeccao, item.modelo, item.acionamento) || item.descricao,
      tipo_confeccao: item.tipo_confeccao,
      ordem_servico_id: item.ordem_servico_id,
      confeccao_preenchida: item.confeccao_preenchida,
      conferencia_consultoras_preenchida: item.conferencia_consultoras_preenchida,
      ficha_preenchida: item.ficha_preenchida,
    });
```

Linha 792 (`separacaoRows`) — adicionar colunas de rótulo:

```sql
  const { rows: separacaoRows } = await db.query(
    `SELECT ai.agendamento_id, ai.pedido_item_id, ai.separado, pi.descricao, pi.ambiente,
            pi.numero_unidade, pi.total_unidades
     FROM agendamento_itens ai
     JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
     WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
    [instalacaoIds]
  );
```

E incluir no push de `itensSeparacaoPorAg` (linhas ~805-810):

```js
    itensSeparacaoPorAg[r.agendamento_id].push({
      pedido_item_id: r.pedido_item_id,
      descricao: r.descricao,
      ambiente: r.ambiente,
      numero_unidade: r.numero_unidade,
      total_unidades: r.total_unidades,
      separado: r.separado,
    });
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest dashboardService.buscarFluxoPedido --no-coverage`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte de dashboardService para checar regressão**

Run: `npx jest dashboardService --no-coverage`
Expected: PASS em todos os arquivos `dashboardService*.test.js`

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "feat(dashboard): fluxo do pedido considera itens expandidos e traz rótulo de unidade"
```

---

## Task 9: Filtro de produção em `itens-disponiveis-instalacao`

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js:493-524`
- Test: `backend/src/__tests__/pedidosRoutes.itensDisponiveisInstalacao.test.js`

**Interfaces:**
- Produces: a rota passa a listar os filhos (não o pai expandido) como itens disponíveis para o pré-agendamento de Instalação.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar a `backend/src/__tests__/pedidosRoutes.itensDisponiveisInstalacao.test.js`:

```js
test('exclui itens-pai já expandidos em unidades', async () => {
  db.query
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // pedCheck
    .mockResolvedValueOnce({ rows: [] });

  const res = await request(app).get('/api/pedidos/1/itens-disponiveis-instalacao');

  expect(res.status).toBe(200);
  expect(db.query.mock.calls[1][0]).toContain('NOT (pi.item_pai_id IS NULL AND pi.expandido = true)');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest pedidosRoutes.itensDisponiveisInstalacao --no-coverage`
Expected: FAIL

- [ ] **Step 3: Aplicar o filtro**

Em `backend/src/routes/pedidosRoutes.js:514`, trocar:

```sql
      WHERE pi.pedido_id = $1
        AND pi.id NOT IN (
```

por:

```sql
      WHERE pi.pedido_id = $1
        AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
        AND pi.id NOT IN (
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest pedidosRoutes.itensDisponiveisInstalacao --no-coverage`
Expected: PASS (ambos os testes do arquivo)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js backend/src/__tests__/pedidosRoutes.itensDisponiveisInstalacao.test.js
git commit -m "feat(pedidos): seleção de itens para Instalação considera unidades expandidas"
```

---

## Task 10: Rótulo "Unidade X de Y" em Conferência do Produto, Produção e Separação

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferenciaProduto.jsx`
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx`
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaSeparacao.jsx`

**Interfaces:**
- Consumes: `item.numero_unidade`/`item.total_unidades` já retornados pelo backend (Task 8).

- [ ] **Step 1: `EtapaConferenciaProduto.jsx`**

Localizar a renderização do item (dentro do `.map((item) => ...)` do corpo do modal) e envolver a descrição:

```jsx
{item.descricao}
{item.total_unidades > 1 && ` — Unidade ${item.numero_unidade} de ${item.total_unidades}`}
```

(Aplicar exatamente onde `item.descricao` é hoje renderizado sozinho, mantendo o restante do JSX ao redor inalterado.)

- [ ] **Step 2: `EtapaProducao.jsx:106`**

Trocar:

```jsx
                <span className="vim-desc">{item.descricao}</span>
```

por:

```jsx
                <span className="vim-desc">
                  {item.descricao}
                  {item.total_unidades > 1 && ` — Unidade ${item.numero_unidade} de ${item.total_unidades}`}
                </span>
```

- [ ] **Step 3: `EtapaSeparacao.jsx:76`**

Trocar:

```jsx
                        <div className="pf-item-descricao">{item.descricao}</div>
```

por:

```jsx
                        <div className="pf-item-descricao">
                          {item.descricao}
                          {item.total_unidades > 1 && ` — Unidade ${item.numero_unidade} de ${item.total_unidades}`}
                        </div>
```

- [ ] **Step 4: Rodar o build do frontend para checar erros de sintaxe**

Run: `cd frontend-web && npm run build`
Expected: build sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferenciaProduto.jsx frontend-web/src/pages/pedidos/fluxo/etapas/EtapaProducao.jsx frontend-web/src/pages/pedidos/fluxo/etapas/EtapaSeparacao.jsx
git commit -m "feat(pedidos): mostra rótulo de unidade em Produção, Conferência do Produto e Separação"
```

---

## Rollout (fora do escopo dos testes automatizados)

- Rodar `pedido_itens_unidades.sql` também no Supabase (projeto `agenda_adornie`), via `node src/database/run-migration.js pedido_itens_unidades.sql` apontando para o banco remoto — ver [[project_db_local_vs_supabase]].
- Teste manual no navegador: pedido com item de persiana `quantidade = 2`, agendar Conferência, abrir a lista de itens do agendamento e confirmar 2 entradas "Unidade 1 de 2"/"Unidade 2 de 2", preencher medida técnica diferente em cada uma (ex.: 1,48 e 1,53), seguir até Conferência do Produto/Produção/Separação confirmando status independente por unidade e o rótulo em cada tela. Confirmar que a tela de edição do pedido (venda) e a impressão continuam mostrando 1 linha com quantidade 2, e que salvar o pedido pela tela de venda não apaga as unidades já criadas. Confirmar que Fotos por Ambiente continua pedindo só 1 foto para o ambiente com as 2 unidades.

**Limitação conhecida, fora do escopo deste plano:** as queries `itensPersianaPendentesRows` (persianas sem `modelo`, `dashboardService.js` ~linha 643) e `itensControleRows` (ambientes/`distribui_canais` para vínculo automático, ~linha 651) não recebem filtro de venda nem de produção. Na prática isso não regride nada hoje: `expandirItensParaConferencia` copia `modelo`/`categoria_id` do pai pros filhos, então um item já expandido não volta a aparecer como "pendente de modelo". Se no futuro o vínculo automático por canal precisar tratar cada unidade expandida separadamente, isso é um projeto à parte.
