# Vínculo Automático — Controle por Canais — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular Controles a itens motorizados por ambiente/canal, exibir aviso informativo na Etapa 1 quando canais insuficientes, e corrigir o bug de `Cortinas.vinculavel=true`.

**Architecture:** Nova flag `distribui_canais` em `categorias` identifica Controles. A função pura `encontrarVinculosControle(itens)` (exportada de `vinculoAutomaticoService`) é reutilizada em dois contextos: (1) `processarPedido` para criar vínculos no banco, (2) `dashboardService.buscarFluxoPedido` para calcular o aviso da Etapa 1 em tempo real.

**Tech Stack:** Node.js/Express, PostgreSQL, React (JSX). Testes com Jest. Supabase MCP para banco remoto.

## Global Constraints

- Arquivos de teste em `backend/src/__tests__/`
- Rodar testes: `cd backend && npm test -- --testPathPattern=<arquivo> --no-coverage`
- Funções puras não podem importar `db` nem `auditSvc`
- `tipo_vinculo='controle_canal'` é o novo valor — distinto de `'acessorio'` (Trilho→Cortina/Forro)
- Aviso na Etapa 1 é **informativo** — não bloqueia conclusão
- `ON CONFLICT DO NOTHING` em todos os INSERTs em `pedido_item_vinculos`

---

### Task 1: Migration `categorias_distribui_canais`

**Files:**
- Create: `backend/src/database/migrations/categorias_distribui_canais.sql`

**Interfaces:**
- Produces: coluna `distribui_canais BOOLEAN DEFAULT false` em `categorias`; `Controles.distribui_canais = true`; `Cortinas.vinculavel = false`

- [ ] **Step 1: Criar o arquivo de migration**

Conteúdo exato de `backend/src/database/migrations/categorias_distribui_canais.sql`:

```sql
-- Adiciona flag distribui_canais: quando true, item distribui canais aos motorizados do ambiente
-- em vez de usar lógica de largura. Corrige também bug Cortinas.vinculavel=true.
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS distribui_canais BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET distribui_canais = true WHERE LOWER(nome) = 'controles';

-- Bugfix: Cortinas não deve ser vinculavel (causava falha no matching por largura)
UPDATE categorias SET vinculavel = false WHERE LOWER(nome) = 'cortinas';
```

- [ ] **Step 2: Aplicar no Supabase (projeto zexexngoujgtnlvydrjh)**

Usar a ferramenta `mcp__plugin_supabase_supabase__apply_migration` com:
- `project_id`: `zexexngoujgtnlvydrjh`
- `name`: `categorias_distribui_canais`
- `query`: conteúdo do arquivo acima

- [ ] **Step 3: Aplicar no banco local**

Rodar via Node no diretório `backend/`:

```js
// Salvar como script temporário e rodar: node script_tmp.js
const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', user:'postgres', password:'d8ac7f394557a33c883b5bac49d93277', database:'sistema_liuu', port:5432 });
const q = `
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS distribui_canais BOOLEAN NOT NULL DEFAULT false;
UPDATE categorias SET distribui_canais = true WHERE LOWER(nome) = 'controles';
UPDATE categorias SET vinculavel = false WHERE LOWER(nome) = 'cortinas';
`;
pool.query(q).then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
```

Esperado: `OK`

- [ ] **Step 4: Verificar no Supabase**

```sql
SELECT nome, vinculavel, distribui_canais FROM categorias
WHERE LOWER(nome) IN ('cortinas','controles')
ORDER BY empresa_id, nome;
```

Esperado: `Controles → distribui_canais=true`, `Cortinas → vinculavel=false`

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/categorias_distribui_canais.sql
git commit -m "feat(vinculo): migration distribui_canais + bugfix cortinas vinculavel"
```

---

### Task 2: Função pura `encontrarVinculosControle` (TDD)

**Files:**
- Modify: `backend/src/services/vinculoAutomaticoService.js`
- Modify: `backend/src/__tests__/vinculoAutomaticoService.test.js`

**Interfaces:**
- Consumes: array de itens com campos `{ id, ambiente, descricao, distribui_canais, recebe_vinculo_automatico, acionamento, ja_vinculado }`
- Produces: `encontrarVinculosControle(itens)` → `{ pares: [{acessorioId, principalId}], insuficientes: [{ambiente, motorizados, canais}] }`

- [ ] **Step 1: Escrever os testes com falha**

Adicionar ao final do `describe('encontrarPares', ...)` em `backend/src/__tests__/vinculoAutomaticoService.test.js`, após os testes existentes:

```js
const { encontrarVinculosControle } = require('../services/vinculoAutomaticoService');

function itemControle(overrides) {
  return {
    id: 99,
    ambiente: 'Sala',
    descricao: 'Controle 5 canais',
    distribui_canais: true,
    recebe_vinculo_automatico: false,
    acionamento: null,
    ja_vinculado: false,
    ...overrides,
  };
}

function itemMotorizado(overrides) {
  return {
    id: 1,
    ambiente: 'Sala',
    descricao: 'Cortina Wave Motorizada',
    distribui_canais: false,
    recebe_vinculo_automatico: true,
    acionamento: 'motorizado',
    ja_vinculado: false,
    ...overrides,
  };
}

describe('encontrarVinculosControle', () => {
  test('1 controle 5 canais + 3 motorizados -> 3 pares, sem insuficientes', () => {
    const itens = [
      itemControle({ id: 10, descricao: 'Controle 5 canais' }),
      itemMotorizado({ id: 1 }),
      itemMotorizado({ id: 2 }),
      itemMotorizado({ id: 3 }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toHaveLength(3);
    expect(pares.every(p => p.acessorioId === 10)).toBe(true);
    expect(pares.map(p => p.principalId).sort()).toEqual([1, 2, 3]);
    expect(insuficientes).toEqual([]);
  });

  test('1 controle 2 canais + 5 motorizados -> 0 pares, 1 insuficiente', () => {
    const itens = [
      itemControle({ id: 10, descricao: 'Controle 2 canais' }),
      itemMotorizado({ id: 1 }),
      itemMotorizado({ id: 2 }),
      itemMotorizado({ id: 3 }),
      itemMotorizado({ id: 4 }),
      itemMotorizado({ id: 5 }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([]);
    expect(insuficientes).toEqual([{ ambiente: 'Sala', motorizados: 5, canais: 2 }]);
  });

  test('controle sem "N canais" na descricao -> ignorado, sem pares nem insuficientes', () => {
    const itens = [
      itemControle({ id: 10, descricao: 'Controle remoto' }),
      itemMotorizado({ id: 1 }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([]);
    expect(insuficientes).toEqual([]);
  });

  test('ambiente sem controle mas com motorizados -> nenhum insuficiente', () => {
    const itens = [
      itemMotorizado({ id: 1 }),
      itemMotorizado({ id: 2 }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([]);
    expect(insuficientes).toEqual([]);
  });

  test('controle exato 1 canal + 1 motorizado -> 1 par', () => {
    const itens = [
      itemControle({ id: 10, descricao: 'Controle 1 canal' }),
      itemMotorizado({ id: 1 }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([{ acessorioId: 10, principalId: 1 }]);
    expect(insuficientes).toEqual([]);
  });

  test('dois ambientes independentes: Sala ok, Quarto insuficiente', () => {
    const itens = [
      itemControle({ id: 10, ambiente: 'Sala',   descricao: 'Controle 3 canais' }),
      itemMotorizado({ id: 1, ambiente: 'Sala' }),
      itemMotorizado({ id: 2, ambiente: 'Sala' }),
      itemControle({ id: 20, ambiente: 'Quarto', descricao: 'Controle 1 canal' }),
      itemMotorizado({ id: 3, ambiente: 'Quarto' }),
      itemMotorizado({ id: 4, ambiente: 'Quarto' }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toHaveLength(2);
    expect(insuficientes).toEqual([{ ambiente: 'Quarto', motorizados: 2, canais: 1 }]);
  });

  test('item motorizado nao-vinculavel (recebe_vinculo_automatico=false) -> ignorado', () => {
    const itens = [
      itemControle({ id: 10, descricao: 'Controle 5 canais' }),
      itemMotorizado({ id: 1, recebe_vinculo_automatico: false }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([]);
    expect(insuficientes).toEqual([]);
  });

  test('item com acionamento=manual -> nao entra como motorizado', () => {
    const itens = [
      itemControle({ id: 10, descricao: 'Controle 5 canais' }),
      itemMotorizado({ id: 1, acionamento: 'manual' }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([]);
    expect(insuficientes).toEqual([]);
  });

  test('ambiente nulo/vazio -> item ignorado', () => {
    const itens = [
      itemControle({ id: 10, ambiente: '', descricao: 'Controle 5 canais' }),
      itemMotorizado({ id: 1, ambiente: '' }),
    ];
    const { pares, insuficientes } = encontrarVinculosControle(itens);
    expect(pares).toEqual([]);
    expect(insuficientes).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
cd backend && npm test -- --testPathPattern=vinculoAutomaticoService --no-coverage
```

Esperado: todos os novos testes FAIL com `encontrarVinculosControle is not a function` ou similar.

- [ ] **Step 3: Implementar `encontrarVinculosControle` em `vinculoAutomaticoService.js`**

Adicionar após a função `encontrarPares` (antes de `processarPedido`):

```js
const RE_CANAIS = /(\d+)\s*canais?/i;

function encontrarVinculosControle(itens) {
  const grupos = new Map();

  for (const it of itens) {
    if (!it.ambiente) continue;
    if (!grupos.has(it.ambiente)) grupos.set(it.ambiente, { controles: [], motorizados: [] });
    const g = grupos.get(it.ambiente);
    if (it.distribui_canais) g.controles.push(it);
    if (it.recebe_vinculo_automatico && it.acionamento === 'motorizado') g.motorizados.push(it);
  }

  const pares = [];
  const insuficientes = [];

  for (const [ambiente, { controles, motorizados }] of grupos) {
    if (motorizados.length === 0) continue;
    for (const controle of controles) {
      const match = RE_CANAIS.exec(controle.descricao || '');
      if (!match) continue;
      const canais = parseInt(match[1], 10);
      if (motorizados.length <= canais) {
        for (const mot of motorizados) {
          pares.push({ acessorioId: controle.id, principalId: mot.id });
        }
      } else {
        insuficientes.push({ ambiente, motorizados: motorizados.length, canais });
      }
    }
  }

  return { pares, insuficientes };
}
```

Atualizar a linha de exports no final do arquivo:

```js
module.exports = { encontrarPares, encontrarVinculosControle, processarPedido };
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
cd backend && npm test -- --testPathPattern=vinculoAutomaticoService --no-coverage
```

Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/vinculoAutomaticoService.js backend/src/__tests__/vinculoAutomaticoService.test.js
git commit -m "feat(vinculo): encontrarVinculosControle — vínculo controle por canais"
```

---

### Task 3: Integrar `encontrarVinculosControle` em `processarPedido`

**Files:**
- Modify: `backend/src/services/vinculoAutomaticoService.js`
- Modify: `backend/src/__tests__/vinculoAutomaticoService.test.js`

**Interfaces:**
- Consumes: `encontrarVinculosControle` (Task 2)
- Produces: `processarPedido` agora cria vínculos `tipo_vinculo='controle_canal'` e retorna `{ ambientesInsuficientes }`

- [ ] **Step 1: Escrever testes para `processarPedido` com Controle**

Adicionar no `describe('processarPedido', ...)` existente:

```js
test('cria vinculo controle_canal para 1 controle 2 canais + 2 motorizados', async () => {
  const client = {
    query: jest.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10, ambiente: 'Sala', largura: null, descricao: 'Controle 2 canais',
            distribui_canais: true, recebe_vinculo_automatico: false,
            acionamento: null, vinculavel: false, recebe_vinculos: false,
            ja_vinculado: false,
          },
          {
            id: 1, ambiente: 'Sala', largura: '2.0000', descricao: 'Cortina Wave Motorizada',
            distribui_canais: false, recebe_vinculo_automatico: true,
            acionamento: 'motorizado', vinculavel: false, recebe_vinculos: true,
            ja_vinculado: false,
          },
          {
            id: 2, ambiente: 'Sala', largura: '1.5000', descricao: 'Forro Blackout Motorizado',
            distribui_canais: false, recebe_vinculo_automatico: true,
            acionamento: 'motorizado', vinculavel: false, recebe_vinculos: true,
            ja_vinculado: false,
          },
        ],
      }) // SELECT itens
      // encontrarPares: nenhum par (sem Trilho)
      // encontrarVinculosControle: 2 pares (controle→cortina, controle→forro)
      .mockResolvedValueOnce(undefined) // INSERT controle_canal 1
      .mockResolvedValueOnce(undefined) // UPDATE sem_vinculo controle 1
      .mockResolvedValueOnce(undefined) // INSERT auditoria 1
      .mockResolvedValueOnce(undefined) // INSERT controle_canal 2
      .mockResolvedValueOnce(undefined) // UPDATE sem_vinculo controle 2
      .mockResolvedValueOnce(undefined) // INSERT auditoria 2
      .mockResolvedValueOnce(undefined), // COMMIT
    release: jest.fn(),
  };
  db.connect.mockResolvedValue(client);

  const result = await processarPedido(1, 10, 99);

  // Dois INSERTs de controle_canal
  const inserts = client.query.mock.calls.filter(c => c[0]?.includes?.('controle_canal'));
  expect(inserts).toHaveLength(2);
  expect(inserts[0][1]).toEqual([10, 1]);
  expect(inserts[1][1]).toEqual([10, 2]);
  expect(result.ambientesInsuficientes).toEqual([]);
});

test('processarPedido retorna ambientesInsuficientes quando canais insuficientes', async () => {
  const client = {
    query: jest.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 10, ambiente: 'Sala', largura: null, descricao: 'Controle 1 canal',
            distribui_canais: true, recebe_vinculo_automatico: false,
            acionamento: null, vinculavel: false, recebe_vinculos: false,
            ja_vinculado: false,
          },
          {
            id: 1, ambiente: 'Sala', largura: '2.0000', descricao: 'Cortina Motorizada',
            distribui_canais: false, recebe_vinculo_automatico: true,
            acionamento: 'motorizado', vinculavel: false, recebe_vinculos: true,
            ja_vinculado: false,
          },
          {
            id: 2, ambiente: 'Sala', largura: '1.5000', descricao: 'Forro Motorizado',
            distribui_canais: false, recebe_vinculo_automatico: true,
            acionamento: 'motorizado', vinculavel: false, recebe_vinculos: true,
            ja_vinculado: false,
          },
        ],
      }) // SELECT itens
      .mockResolvedValueOnce(undefined), // COMMIT
    release: jest.fn(),
  };
  db.connect.mockResolvedValue(client);

  const result = await processarPedido(1, 10, 99);

  expect(result.ambientesInsuficientes).toEqual([{ ambiente: 'Sala', motorizados: 2, canais: 1 }]);
  // Nenhum INSERT de vinculos
  const inserts = client.query.mock.calls.filter(c => c[0]?.includes?.('controle_canal'));
  expect(inserts).toHaveLength(0);
});
```

- [ ] **Step 2: Rodar testes — confirmar que falham**

```bash
cd backend && npm test -- --testPathPattern=vinculoAutomaticoService --no-coverage
```

Esperado: os 2 novos testes FAIL.

- [ ] **Step 3: Atualizar a query SQL em `processarPedido`**

Substituir o SELECT de itens dentro de `processarPedido` (começa em `SELECT pi.id, pi.ambiente, pi.largura`):

```js
const itensRes = await client.query(
  `SELECT pi.id, pi.ambiente, pi.largura, pi.descricao,
          COALESCE(c.vinculavel, false)                AS vinculavel,
          COALESCE(c.recebe_vinculos, false)           AS recebe_vinculos,
          COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico,
          COALESCE(c.distribui_canais, false)          AS distribui_canais,
          pi.especificacoes->>'acionamento'            AS acionamento,
          EXISTS (
            SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
          ) AS ja_vinculado
   FROM pedido_itens pi
   LEFT JOIN categorias c ON c.id = pi.categoria_id
   WHERE pi.pedido_id = $1`,
  [pedidoId]
);
```

- [ ] **Step 4: Atualizar o corpo de `processarPedido` para rodar a nova função e criar vínculos `controle_canal`**

Substituir o bloco após `const itensPorId = ...` e antes de `await client.query("COMMIT")`:

```js
// ─── Vínculos Trilho → Cortina/Forro (por largura) ───────────────────────────
const pares = encontrarPares(itensRes.rows);
const itensPorId = new Map(itensRes.rows.map((it) => [it.id, it]));

for (const { acessorioId, principalId } of pares) {
  const acessorio = itensPorId.get(acessorioId);
  const principal = itensPorId.get(principalId);
  await client.query(
    `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
     VALUES ($1, $2, 'acessorio') ON CONFLICT DO NOTHING`,
    [acessorioId, principalId]
  );
  await client.query(`UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1`, [acessorioId]);
  await auditSvc.registrarAuditoria(client, {
    pedidoId, empresaId, usuarioId: userId,
    etapa: "dados_pedido", acao: "vinculo_automatico",
    descricao: `Vínculo automático: "${acessorio.descricao}" → "${principal.descricao}" (ambiente: ${acessorio.ambiente}, largura: ${acessorio.largura}m)`,
  });
}

// ─── Vínculos Controle → Itens Motorizados (por canal) ───────────────────────
const { pares: paresControle, insuficientes: ambientesInsuficientes } =
  encontrarVinculosControle(itensRes.rows);

for (const { acessorioId, principalId } of paresControle) {
  const acessorio = itensPorId.get(acessorioId);
  const principal = itensPorId.get(principalId);
  await client.query(
    `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
     VALUES ($1, $2, 'controle_canal') ON CONFLICT DO NOTHING`,
    [acessorioId, principalId]
  );
  await client.query(`UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1`, [acessorioId]);
  await auditSvc.registrarAuditoria(client, {
    pedidoId, empresaId, usuarioId: userId,
    etapa: "dados_pedido", acao: "vinculo_automatico",
    descricao: `Vínculo automático (controle): "${acessorio.descricao}" → "${principal.descricao}" (ambiente: ${acessorio.ambiente})`,
  });
}

await client.query("COMMIT");
// ... (fora do try)
```

E a função deve retornar `ambientesInsuficientes` após o `finally`:

```js
// No final de processarPedido, após client.release():
return { ambientesInsuficientes };
```

- [ ] **Step 5: Rodar todos os testes do serviço**

```bash
cd backend && npm test -- --testPathPattern=vinculoAutomaticoService --no-coverage
```

Esperado: todos passam (incluindo os testes existentes de `encontrarPares` e `processarPedido`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/vinculoAutomaticoService.js backend/src/__tests__/vinculoAutomaticoService.test.js
git commit -m "feat(vinculo): processarPedido cria vínculos controle_canal"
```

---

### Task 4: Aviso de canais insuficientes na Etapa 1 (`dashboardService`)

**Files:**
- Modify: `backend/src/services/dashboardService.js`
- Modify: `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`

**Interfaces:**
- Consumes: `encontrarVinculosControle` (Task 2); query SQL para buscar itens com `distribui_canais`/`acionamento`
- Produces: `etapa1.progresso.ambientes_canais_insuficientes: [{ambiente, motorizados, canais}]`

- [ ] **Step 1: Escrever teste que verifica `ambientes_canais_insuficientes` no progresso**

Adicionar ao final de `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`:

```js
describe('buscarFluxoPedido — ambientes_canais_insuficientes', () => {
  test('inclui ambientes_canais_insuficientes no progresso da etapa 1', async () => {
    // Re-use existing mock pattern: add the new query result at the expected position.
    // The new query is the LAST in the Promise.all block (after itensPersianaPendentes).
    // We mock all previous queries returning minimal valid data, then the new one.
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, numero_sequencial: 1, numero_origem: null, status: 'pendente', verificacao_ok: false, categorizacao_ok: false, total: '0', subtotal: '0', desconto: '0', cliente_nome: 'Test', cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false, instalacao_status: null }] }) // pedido
      .mockResolvedValueOnce({ rows: [] })  // vinculos
      .mockResolvedValueOnce({ rows: [] })  // anexos
      .mockResolvedValueOnce({ rows: [] })  // conferencia
      .mockResolvedValueOnce({ rows: [] })  // itensSemCat
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] }) // itensSemVinculo
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] }) // itensCobertos
      .mockResolvedValueOnce({ rows: [] })  // itensRows (pedido.itens)
      .mockResolvedValueOnce({ rows: [] })  // genitoresRaw
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })  // totalItens
      .mockResolvedValueOnce({ rows: [{ cobertos: 0 }] }) // itensCobertosRows
      .mockResolvedValueOnce({ rows: [{ sem_cat: 0 }] })  // itensSemCatRows
      .mockResolvedValueOnce({ rows: [{ sem_vinc: 0 }] }) // itensSemVinculoRows
      .mockResolvedValueOnce({ rows: [{ total: 0, conferidos: 0 }] }) // confRows
      .mockResolvedValueOnce({ rows: [{ em_confeccao: 0, confeccao_ok: 0 }] }) // prodRows
      .mockResolvedValueOnce({ rows: [{ agendados: 0 }] }) // agendadoRows
      .mockResolvedValueOnce({ rows: [{ produto_ok: 0 }] }) // produtoOkRows
      .mockResolvedValueOnce({ rows: [{ pendentes: 0 }] }) // itensPersianaPendentes
      // Nova query: itens para encontrarVinculosControle
      .mockResolvedValueOnce({ rows: [
        { id: 10, ambiente: 'Sala', descricao: 'Controle 1 canal', distribui_canais: true, recebe_vinculo_automatico: false, acionamento: null },
        { id: 1,  ambiente: 'Sala', descricao: 'Cortina Motorizada', distribui_canais: false, recebe_vinculo_automatico: true, acionamento: 'motorizado' },
        { id: 2,  ambiente: 'Sala', descricao: 'Forro Motorizado', distribui_canais: false, recebe_vinculo_automatico: true, acionamento: 'motorizado' },
      ]});

    const resultado = await buscarFluxoPedido(1, 10, 99, ['DASHBOARD_PEDIDOS_GERAL']);
    const etapa1 = resultado.etapas.find(e => e.numero === 1);
    expect(etapa1.progresso.ambientes_canais_insuficientes).toEqual([
      { ambiente: 'Sala', motorizados: 2, canais: 1 }
    ]);
  });
});
```

- [ ] **Step 2: Rodar o teste — confirmar que falha**

```bash
cd backend && npm test -- --testPathPattern=dashboardService.buscarFluxoPedido --no-coverage
```

Esperado: novo teste FAIL.

- [ ] **Step 3: Importar `encontrarVinculosControle` no topo de `dashboardService.js`**

Após os outros requires no topo do arquivo, adicionar:

```js
const { encontrarVinculosControle } = require('./vinculoAutomaticoService');
```

- [ ] **Step 4: Adicionar a query de itens para controle no `Promise.all` de etapas 1-4**

No bloco `Promise.all` que começa com `const [{ rows: totalItensRows }, ...]` em `dashboardService.js`, adicionar como **último elemento**:

```js
db.query(
  `SELECT pi.id, pi.ambiente, pi.descricao,
          COALESCE(c.distribui_canais, false)          AS distribui_canais,
          COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico,
          pi.especificacoes->>'acionamento'            AS acionamento
   FROM pedido_itens pi
   LEFT JOIN categorias c ON c.id = pi.categoria_id
   WHERE pi.pedido_id = $1
     AND pi.ambiente IS NOT NULL AND pi.ambiente <> ''`,
  [pedidoId]
),
```

E na desestruturação do resultado do Promise.all, adicionar `{ rows: itensControleRows }` como último elemento.

- [ ] **Step 5: Computar `ambientesCanaisInsuficientes` e adicionar ao progresso**

Após a linha `const itensPersianaPendentes = ...`, adicionar:

```js
const { insuficientes: ambientesCanaisInsuficientes } = encontrarVinculosControle(itensControleRows);
```

Nos dois objetos de progresso da Etapa 1 (o que está dentro do `if (!genitoresRaw.length)` e o da array `etapas`), adicionar:

```js
ambientes_canais_insuficientes: ambientesCanaisInsuficientes,
```

- [ ] **Step 6: Rodar todos os testes do dashboard**

```bash
cd backend && npm test -- --testPathPattern=dashboardService --no-coverage
```

Esperado: todos passam.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js
git commit -m "feat(etapa1): aviso de canais insuficientes no progresso"
```

---

### Task 5: Aviso visual na Etapa 1 (frontend)

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`

**Interfaces:**
- Consumes: `p.ambientes_canais_insuficientes: [{ambiente, motorizados, canais}]` (Task 4)

- [ ] **Step 1: Adicionar bloco de aviso após os critérios de conclusão**

Em `EtapaDadosPedido.jsx`, localizar o trecho após `</div>` que fecha a div de `Critérios de conclusão` (após o `CriterioItem` de "Todos os itens com data de entrega") e antes do `<hr className="pf-separador" />`.

Inserir:

```jsx
{(p.ambientes_canais_insuficientes?.length ?? 0) > 0 && (
  <div style={{ margin: "12px 0 0 0" }}>
    {p.ambientes_canais_insuficientes.map((a) => (
      <div
        key={a.ambiente}
        style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "8px 12px", borderRadius: 8, marginBottom: 6,
          background: "rgba(255, 160, 0, 0.12)",
          border: "1px solid rgba(255, 160, 0, 0.35)",
          fontSize: 13, color: "var(--pf-modal-text)",
        }}
      >
        <span style={{ flexShrink: 0 }}>⚠️</span>
        <span>
          <strong>{a.ambiente}</strong>: {a.motorizados}{" "}
          {a.motorizados === 1 ? "item motorizado" : "itens motorizados"}, apenas{" "}
          {a.canais} {a.canais === 1 ? "canal" : "canais"} no controle.
          Verifique o controle ou adicione outro.
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: Verificar no navegador**

Com o servidor rodando, abrir um pedido que tenha:
- Um item de categoria "Controles" com descrição contendo "N canais"
- Mais itens motorizados do que N canais no mesmo ambiente

Confirmar que o aviso aparece na Etapa 1 e que não bloqueia a conclusão da etapa.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx
git commit -m "feat(etapa1): aviso visual de canais de controle insuficientes"
```

---

## Self-Review

**Cobertura do spec:**
- ✅ Nova flag `distribui_canais` → Task 1
- ✅ Bugfix `Cortinas.vinculavel=false` → Task 1
- ✅ `encontrarVinculosControle` pura → Task 2
- ✅ `processarPedido` cria `controle_canal` vinculos → Task 3
- ✅ Aviso `ambientes_canais_insuficientes` em `_verificarEtapa1` → Task 4 (via dashboardService, que é o ponto de entrada do frontend)
- ✅ Aviso visual na Etapa 1 → Task 5
- ✅ Forro Motorizado: sem mudança necessária — já tem `recebe_vinculo_automatico=true` e `acionamento='motorizado'` via `detectarModeloEEspecificacoes`

**Consistência de tipos:**
- `encontrarVinculosControle(itens)` → `{ pares: [{acessorioId, principalId}], insuficientes: [{ambiente, motorizados, canais}] }` — consistente em Tasks 2, 3, 4
- `ambientes_canais_insuficientes` — nome consistente entre dashboardService (Task 4) e frontend (Task 5)
- `tipo_vinculo='controle_canal'` — consistente em Task 3

**Placeholder scan:** Nenhum TBD/TODO presente.
