# Vínculo Automático Trilho/Varão ↔ Cortina/Forro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durante a importação de pedidos, vincular automaticamente itens de "Trilhos e Varões" a itens de "Cortinas"/"Forros" quando houver correspondência exata de `ambiente` + `largura` (1:1), registrando o vínculo em `pedido_item_vinculos` e a ação em `pedido_auditoria`.

**Architecture:** Novo módulo `backend/src/services/vinculoAutomaticoService.js` com (1) uma função pura `encontrarPares(itens)` que decide quais pares vincular, e (2) `processarPedido(pedidoId, empresaId, userId)` que busca os itens do pedido, chama `encontrarPares`, e grava os vínculos + auditoria em sua própria transação. `pedidoService.importar()` chama `processarPedido` após salvar o pedido (criação ou reimportação), sem deixar erros dessa etapa falharem a importação. Uma migration habilita as flags `vinculavel`/`recebe_vinculos` nas categorias "Trilhos e Varões" / "Cortinas" / "Forros".

**Tech Stack:** Node.js, Express, `pg` (PostgreSQL), Jest + Supertest (testes existentes em `backend/src/__tests__`).

**Spec:** `docs/superpowers/specs/2026-06-14-vinculo-automatico-trilho-cortina-design.md`

---

### Task 1: Migration — habilitar flags de vínculo nas categorias

**Files:**
- Create: `backend/src/database/migrations/categorias_vinculo_trilho_cortina.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- categorias_vinculo_trilho_cortina.sql
-- Habilita o vínculo automático trilho/varão -> cortina/forro (subprojeto 3)
BEGIN;

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'trilhos e varões';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/database/migrations/categorias_vinculo_trilho_cortina.sql
git commit -m "feat(pedidos): migration habilita vinculo automatico trilho<->cortina/forro"
```

**Nota (não faz parte deste commit):** esta migration precisa ser executada manualmente em cada ambiente (`node backend/src/database/run-migration.js categorias_vinculo_trilho_cortina.sql`), tanto no banco local quanto no Supabase. Sem ela, `processarPedido` (Task 3) roda normalmente mas nunca encontrará categorias com `vinculavel`/`recebe_vinculos = true`, então nenhum vínculo automático será criado — o sistema continua funcionando como hoje (vínculo manual) até a migration ser aplicada.

---

### Task 2: `encontrarPares` — função pura de matching

**Files:**
- Create: `backend/src/services/vinculoAutomaticoService.js`
- Test: `backend/src/__tests__/vinculoAutomaticoService.test.js`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/src/__tests__/vinculoAutomaticoService.test.js`:

```js
const { encontrarPares } = require('../services/vinculoAutomaticoService');

function item(overrides) {
  return {
    id: 1,
    ambiente: 'Sala',
    largura: '1.5000',
    vinculavel: false,
    recebe_vinculos: false,
    ja_vinculado: false,
    ...overrides,
  };
}

describe('encontrarPares', () => {
  test('1 acessorio + 1 principal, mesmo ambiente/largura -> 1 par', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([{ acessorioId: 1, principalId: 2 }]);
  });

  test('larguras diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: '1.5000' }),
      item({ id: 2, recebe_vinculos: true, largura: '2.0000' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambientes diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: 'Sala' }),
      item({ id: 2, recebe_vinculos: true, ambiente: 'Quarto' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('2 acessorios + 1 principal, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, vinculavel: true }),
      item({ id: 3, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('1 acessorio + 2 principais, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true }),
      item({ id: 3, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('item ja vinculado nao entra como acessorio candidato', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ja_vinculado: true }),
      item({ id: 2, recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambiente nulo -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: null }),
      item({ id: 2, recebe_vinculos: true, ambiente: null }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('ambiente vazio -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: '' }),
      item({ id: 2, recebe_vinculos: true, ambiente: '' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('largura nula -> item ignorado', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: null }),
      item({ id: 2, recebe_vinculos: true, largura: null }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('multiplos ambientes, cada um com par valido -> 2 pares', () => {
    const itens = [
      item({ id: 1, ambiente: 'Sala',   largura: '1.5000', vinculavel: true }),
      item({ id: 2, ambiente: 'Sala',   largura: '1.5000', recebe_vinculos: true }),
      item({ id: 3, ambiente: 'Quarto', largura: '2.2000', vinculavel: true }),
      item({ id: 4, ambiente: 'Quarto', largura: '2.2000', recebe_vinculos: true }),
    ];
    expect(encontrarPares(itens)).toEqual([
      { acessorioId: 1, principalId: 2 },
      { acessorioId: 3, principalId: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && npx jest vinculoAutomaticoService --runInBand`
Expected: FAIL — `Cannot find module '../services/vinculoAutomaticoService'`

- [ ] **Step 3: Implementar `encontrarPares`**

Criar `backend/src/services/vinculoAutomaticoService.js`:

```js
const db = require("../database/db");
const auditSvc = require("./auditoriaService");

// Decide quais pares (acessorio -> principal) devem ser vinculados
// automaticamente: mesmo ambiente, mesma largura (exata), e
// correspondencia 1:1 (exatamente um acessorio e um principal com
// aquela largura no ambiente).
function encontrarPares(itens) {
  const grupos = new Map();

  for (const it of itens) {
    if (it.ambiente == null || it.ambiente === "" || it.largura == null) continue;

    if (!grupos.has(it.ambiente)) {
      grupos.set(it.ambiente, { acessorios: [], principais: [] });
    }
    const grupo = grupos.get(it.ambiente);
    if (it.vinculavel && !it.ja_vinculado) grupo.acessorios.push(it);
    if (it.recebe_vinculos) grupo.principais.push(it);
  }

  const pares = [];
  for (const { acessorios, principais } of grupos.values()) {
    for (const acessorio of acessorios) {
      const mesmaLarguraAcessorios = acessorios.filter(
        (a) => Number(a.largura) === Number(acessorio.largura)
      );
      const mesmaLarguraPrincipais = principais.filter(
        (p) => Number(p.largura) === Number(acessorio.largura)
      );
      if (mesmaLarguraAcessorios.length === 1 && mesmaLarguraPrincipais.length === 1) {
        pares.push({ acessorioId: acessorio.id, principalId: mesmaLarguraPrincipais[0].id });
      }
    }
  }
  return pares;
}

module.exports = { encontrarPares };
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && npx jest vinculoAutomaticoService --runInBand`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/vinculoAutomaticoService.js backend/src/__tests__/vinculoAutomaticoService.test.js
git commit -m "feat(pedidos): adiciona encontrarPares para vinculo automatico trilho/cortina"
```

---

### Task 3: `processarPedido` — busca, cria vínculos e registra auditoria

**Files:**
- Modify: `backend/src/services/vinculoAutomaticoService.js`
- Test: `backend/src/__tests__/vinculoAutomaticoService.test.js`

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar ao topo de `backend/src/__tests__/vinculoAutomaticoService.test.js`, antes do `describe('encontrarPares', ...)`:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const db = require('../database/db');
```

E trocar a primeira linha (`const { encontrarPares } = require('../services/vinculoAutomaticoService');`) por:

```js
const { encontrarPares, processarPedido } = require('../services/vinculoAutomaticoService');
```

Adicionar ao final do arquivo (novo `describe`):

```js
describe('processarPedido', () => {
  afterEach(() => jest.clearAllMocks());

  test('cria vinculo, marca sem_vinculo=false e registra auditoria para 1 par', async () => {
    const itensRows = [
      { id: 11, ambiente: 'Sala', largura: '1.5000', descricao: 'Trilho Wave',
        vinculavel: true, recebe_vinculos: false, ja_vinculado: false },
      { id: 10, ambiente: 'Sala', largura: '1.5000', descricao: 'Cortina Wave',
        vinculavel: false, recebe_vinculos: true, ja_vinculado: false },
    ];

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })          // BEGIN
      .mockResolvedValueOnce({ rows: itensRows })    // SELECT itens
      .mockResolvedValueOnce({ rows: [] })           // INSERT pedido_item_vinculos
      .mockResolvedValueOnce({ rows: [] })           // UPDATE pedido_itens sem_vinculo
      .mockResolvedValueOnce({ rows: [] })           // INSERT pedido_auditoria
      .mockResolvedValueOnce({ rows: [] });          // COMMIT
    db.connect.mockResolvedValue(client);

    await processarPedido(1, 10, 99);

    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO pedido_item_vinculos');
    expect(client.query.mock.calls[2][1]).toEqual([11, 10]);
    expect(client.query.mock.calls[3][0]).toContain('UPDATE pedido_itens');
    expect(client.query.mock.calls[3][1]).toEqual([11]);
    expect(client.query.mock.calls[4][0]).toContain('INSERT INTO pedido_auditoria');
    expect(client.query.mock.calls[5][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('pedido sem itens vinculaveis -> nenhuma escrita alem de BEGIN/SELECT/COMMIT', async () => {
    const itensRows = [
      { id: 20, ambiente: 'Sala', largura: '1.5000', descricao: 'Persiana',
        vinculavel: false, recebe_vinculos: false, ja_vinculado: false },
    ];

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })       // BEGIN
      .mockResolvedValueOnce({ rows: itensRows }) // SELECT itens
      .mockResolvedValueOnce({ rows: [] });       // COMMIT
    db.connect.mockResolvedValue(client);

    await processarPedido(1, 10, 99);

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalled();
  });

  test('rollback e propaga erro quando a busca de itens falha', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })            // BEGIN
      .mockRejectedValueOnce(new Error('boom'));      // SELECT itens falha
    db.connect.mockResolvedValue(client);

    await expect(processarPedido(1, 10, 99)).rejects.toThrow('boom');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && npx jest vinculoAutomaticoService --runInBand`
Expected: FAIL — `processarPedido is not a function` (testes do `encontrarPares` continuam passando)

- [ ] **Step 3: Implementar `processarPedido`**

Adicionar ao final de `backend/src/services/vinculoAutomaticoService.js` (antes do `module.exports`):

```js
async function processarPedido(pedidoId, empresaId, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const itensRes = await client.query(
      `SELECT pi.id, pi.ambiente, pi.largura, pi.descricao,
              COALESCE(c.vinculavel, false)      AS vinculavel,
              COALESCE(c.recebe_vinculos, false) AS recebe_vinculos,
              EXISTS (
                SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
              ) AS ja_vinculado
       FROM pedido_itens pi
       LEFT JOIN categorias c ON c.id = pi.categoria_id
       WHERE pi.pedido_id = $1`,
      [pedidoId]
    );

    const pares = encontrarPares(itensRes.rows);
    const itensPorId = new Map(itensRes.rows.map((it) => [it.id, it]));

    for (const { acessorioId, principalId } of pares) {
      const acessorio = itensPorId.get(acessorioId);
      const principal = itensPorId.get(principalId);

      await client.query(
        `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
         VALUES ($1, $2, 'acessorio')
         ON CONFLICT DO NOTHING`,
        [acessorioId, principalId]
      );
      await client.query(
        `UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1`,
        [acessorioId]
      );
      await auditSvc.registrarAuditoria(client, {
        pedidoId,
        empresaId,
        usuarioId: userId,
        etapa: "dados_pedido",
        acao: "vinculo_automatico",
        descricao: `Vínculo automático: "${acessorio.descricao}" → "${principal.descricao}" (ambiente: ${acessorio.ambiente}, largura: ${acessorio.largura}m)`,
      });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

E atualizar o `module.exports`:

```js
module.exports = { encontrarPares, processarPedido };
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `cd backend && npx jest vinculoAutomaticoService --runInBand`
Expected: PASS (13 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/vinculoAutomaticoService.js backend/src/__tests__/vinculoAutomaticoService.test.js
git commit -m "feat(pedidos): processarPedido cria vinculos automaticos e registra auditoria"
```

---

### Task 4: Integrar ao fluxo de importação (`pedidoService.importar`)

**Files:**
- Modify: `backend/src/services/pedidoService.js:1-4` (imports) e `:625-653` (`importar`)
- Test: `backend/src/__tests__/pedidoService.test.js`

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar no topo de `backend/src/__tests__/pedidoService.test.js`, junto aos outros `jest.mock`:

```js
jest.mock('../services/vinculoAutomaticoService');
const vinculoAutoSvc = require('../services/vinculoAutomaticoService');
```

(o `jest.mock('../database/db', ...)` e o `require('../services/pedidoService')` já existem no arquivo — manter como estão.)

Adicionar um novo `describe` ao final do arquivo:

```js
describe('importar', () => {
  afterEach(() => jest.clearAllMocks());

  function mockCriarPedidoNovo() {
    const pedidoRow = {
      id: 50, empresa_id: 10, status: 'pendente',
      numero_origem: null, numero_sequencial: 5,
      cliente_nome: null, cliente_telefone: null,
      consultor_nome: null, arquiteto_nome: null,
      tem_anexo_pdf: false,
    };

    db.query
      .mockResolvedValueOnce({ rows: [pedidoRow] }) // montarPedido: SELECT pedidos
      .mockResolvedValueOnce({ rows: [] })          // montarPedido: SELECT pedido_itens
      .mockResolvedValueOnce({ rows: [] })          // montarPedido: SELECT pedido_pagamentos
      .mockResolvedValueOnce({ rows: [] });         // INSERT pedido_auditoria (importacao)

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] })           // BEGIN
      .mockResolvedValueOnce({ rows: [{ seq: 5 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{ id: 50 }] }) // INSERT pedidos
      .mockResolvedValueOnce({ rows: [] })           // SELECT existing item ids
      .mockResolvedValueOnce({ rows: [] })           // DELETE pedido_pagamentos
      .mockResolvedValueOnce({ rows: [] });          // COMMIT
    db.connect.mockResolvedValue(client);
  }

  test('chama vinculoAutomaticoService.processarPedido apos criar pedido novo', async () => {
    mockCriarPedidoNovo();
    vinculoAutoSvc.processarPedido.mockResolvedValue();

    const pedido = await svc.importar(10, 99, { status: 'pendente', itens: [], pagamentos: [] });

    expect(pedido.id).toBe(50);
    expect(vinculoAutoSvc.processarPedido).toHaveBeenCalledWith(50, 10, 99);
  });

  test('nao falha a importacao quando processarPedido rejeita', async () => {
    mockCriarPedidoNovo();
    vinculoAutoSvc.processarPedido.mockRejectedValue(new Error('boom'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const pedido = await svc.importar(10, 99, { status: 'pendente', itens: [], pagamentos: [] });

    expect(pedido.id).toBe(50);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd backend && npx jest pedidoService.test.js --runInBand`
Expected: FAIL — `vinculoAutoSvc.processarPedido` nunca é chamado (os dois novos testes em `importar` falham; os demais testes do arquivo continuam passando)

- [ ] **Step 3: Importar o serviço no topo de `pedidoService.js`**

Em `backend/src/services/pedidoService.js`, linha 1-4:

```js
const db = require("../database/db");
const cliSvc = require("./clienteService");
const arqSvc = require("./arquitetoService");
const auditSvc = require("./auditoriaService");
```

Trocar por:

```js
const db = require("../database/db");
const cliSvc = require("./clienteService");
const arqSvc = require("./arquitetoService");
const auditSvc = require("./auditoriaService");
const vinculoAutoSvc = require("./vinculoAutomaticoService");
```

- [ ] **Step 4: Chamar `processarPedido` ao final de `importar()`**

Em `backend/src/services/pedidoService.js`, dentro de `importar()`:

```js
  const dadosCompletos = { ...dados, cliente_id: clienteId, arquiteto_id: arquitetoId };

  // Se já existe um pedido com este numero_origem, substitui
  if (dados.numero_origem?.trim()) {
    const existe = await db.query(
      `SELECT id FROM pedidos WHERE empresa_id=$1 AND numero_origem=$2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, dados.numero_origem.trim()]
    );
    if (existe.rows.length > 0) {
      const pedidoAtualizado = await atualizar(existe.rows[0].id, empresaId, dadosCompletos, userId);
      await db.query(
        `INSERT INTO pedido_auditoria
           (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
         VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido reimportado (substituição)')`,
        [existe.rows[0].id, empresaId, userId || null]
      );
      return pedidoAtualizado;
    }
  }

  const pedidoCriado = await criar(empresaId, userId, dadosCompletos);
  await db.query(
    `INSERT INTO pedido_auditoria
       (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
     VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido importado')`,
    [pedidoCriado.id, empresaId, userId || null]
  );
  return pedidoCriado;
}
```

Trocar por (adiciona a função auxiliar `_processarVinculoAutomatico` e as duas chamadas):

```js
  const dadosCompletos = { ...dados, cliente_id: clienteId, arquiteto_id: arquitetoId };

  // Se já existe um pedido com este numero_origem, substitui
  if (dados.numero_origem?.trim()) {
    const existe = await db.query(
      `SELECT id FROM pedidos WHERE empresa_id=$1 AND numero_origem=$2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, dados.numero_origem.trim()]
    );
    if (existe.rows.length > 0) {
      const pedidoAtualizado = await atualizar(existe.rows[0].id, empresaId, dadosCompletos, userId);
      await db.query(
        `INSERT INTO pedido_auditoria
           (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
         VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido reimportado (substituição)')`,
        [existe.rows[0].id, empresaId, userId || null]
      );
      await _processarVinculoAutomatico(existe.rows[0].id, empresaId, userId);
      return pedidoAtualizado;
    }
  }

  const pedidoCriado = await criar(empresaId, userId, dadosCompletos);
  await db.query(
    `INSERT INTO pedido_auditoria
       (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
     VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido importado')`,
    [pedidoCriado.id, empresaId, userId || null]
  );
  await _processarVinculoAutomatico(pedidoCriado.id, empresaId, userId);
  return pedidoCriado;
}

// Vínculo automático é um refinamento pós-importação: erros aqui são
// logados, mas não devem fazer a importação (já salva com sucesso) falhar.
async function _processarVinculoAutomatico(pedidoId, empresaId, userId) {
  try {
    await vinculoAutoSvc.processarPedido(pedidoId, empresaId, userId);
  } catch (err) {
    console.error("[vinculoAutomatico]", err);
  }
}
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `cd backend && npx jest pedidoService.test.js --runInBand`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos em `importar`)

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS (todos os testes, sem regressões)

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "feat(pedidos): importacao chama vinculo automatico trilho/cortina apos salvar pedido"
```

---

## Pós-implementação (fora do plano)

- Rodar a migration `categorias_vinculo_trilho_cortina.sql` manualmente no banco local e no Supabase (ver nota na Task 1) — sem isso, a feature fica "instalada mas inativa".
- Teste manual no navegador: importar um pedido de exemplo com um item "Trilhos e Varões" e um item "Cortinas"/"Forros" no mesmo ambiente e largura; verificar que `VincularItensModal` já mostra o item como vinculado e que `GET /pedidos/:id/auditoria` retorna a entrada `vinculo_automatico`.
