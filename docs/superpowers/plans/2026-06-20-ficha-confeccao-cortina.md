# Ficha de Confecção (Cortina/Xale e Forro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar a Ordem de Serviço (`ordem_servico`) em duas fichas — Ficha de Confecção (consultora, cortina/xale e forro) e Ficha de Conferência Técnica (técnico) — com o motor de cálculo da planilha portado para o frontend.

**Architecture:** Backend Express/Postgres ganha duas colunas novas em `ordem_servico` (`dados_confeccao` + timestamps) e uma em `categorias` (`tipo_confeccao`), mais um endpoint novo (`PUT /os/:id/confeccao`) e um gate no endpoint existente (`PUT /os/:id`). Frontend-web ganha um módulo de cálculo puro (`utils/calculoCortina.js`), duas telas novas de ficha de confecção e uma reescrita da tela de conferência técnica, todas reaproveitando o CSS e os padrões visuais já existentes em `OrdemServicoModal.css`/`OrdemServicoPage.jsx`.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), Jest + Supertest (backend), React 19 + Vite + react-router-dom (frontend-web, sem test runner configurado).

## Global Constraints

- Migrations são SQL puro em `backend/src/database/migrations/*.sql`, sempre `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` (idempotentes), e precisam ser aplicadas manualmente nos dois bancos (Postgres local e Supabase) via `psql` — não existe runner de migration neste projeto.
- Backend: testes com `cd backend && npm test` (Jest, `--runInBand`). Toda função de serviço alterada precisa de teste atualizado antes de implementar (TDD).
- frontend-web (`type: module`, Vite, sem Jest/Vitest): não há test runner. Arquivos de verificação manual (scripts `node`) devem ficar fora de qualquer caminho de import usado pela aplicação, para nunca entrar no bundle do Vite.
- Nomes de campo da Ficha de Confecção usam camelCase, espelhando 1:1 a spec da planilha (`larguraTrilho`, `tipoWave`, `feitaPor` etc.) — não traduzir para snake_case.
- Números digitados pelo usuário usam vírgula decimal (padrão BR); toda conversão para cálculo usa `parseFloat(String(v).replace(',', '.'))`.
- `frontend-web` e `backend` são projetos Node separados (sem workspace/monorepo) — nenhum código é compartilhado entre eles; o módulo de cálculo é escrito uma vez em `frontend-web` (onde é usado) e seu "self-test" não pode depender de Jest, que só existe no backend.

---

## Task 1: Migration — `categorias.tipo_confeccao`

**Files:**
- Create: `backend/src/database/migrations/categorias_tipo_confeccao.sql`

**Interfaces:**
- Produces: coluna `categorias.tipo_confeccao` (`'cortina' | 'forro' | NULL`), consumida pelas Tasks 3, 8 e 9.

- [ ] **Step 1: Escrever a migration**

```sql
-- categorias_tipo_confeccao.sql
-- Marca quais categorias geram Ordem de Serviço com Ficha de Confecção,
-- e qual o tipo de ficha (cortina/xale usam a mesma; forro tem a sua).
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_confeccao VARCHAR(20);

UPDATE categorias SET tipo_confeccao = 'cortina' WHERE LOWER(nome) IN ('cortinas', 'xales');
UPDATE categorias SET tipo_confeccao = 'forro'   WHERE LOWER(nome) = 'forros';

CREATE INDEX IF NOT EXISTS idx_categorias_tipo_confeccao ON categorias(tipo_confeccao);
```

- [ ] **Step 2: Aplicar no banco local e confirmar**

Run: `psql "$DATABASE_URL" -f backend/src/database/migrations/categorias_tipo_confeccao.sql` (ou as credenciais `DB_*` do `.env`, conforme o projeto já usa para os outros bancos).

Run de verificação: `psql "$DATABASE_URL" -c "SELECT nome, tipo_confeccao FROM categorias WHERE tipo_confeccao IS NOT NULL;"`
Expected: pelo menos a linha de `Cortinas` com `tipo_confeccao = cortina` e `Forros` com `forro` (a depender de quais categorias já existem nesse banco — `xales` pode não existir ainda, é esperado retornar 0 linhas para ela).

- [ ] **Step 3: Aplicar no Supabase**

Run: mesmo SQL via MCP `mcp__plugin_supabase_supabase__apply_migration` ou painel do Supabase, conforme o projeto já faz para as demais migrations (ver `[[project_db_local_vs_supabase]]` na memória do projeto).

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/categorias_tipo_confeccao.sql
git commit -m "feat(db): adiciona categorias.tipo_confeccao para a Ficha de Confecção"
```

---

## Task 2: Migration — `ordem_servico.dados_confeccao`

**Files:**
- Create: `backend/src/database/migrations/ordem_servico_dados_confeccao.sql`

**Interfaces:**
- Produces: colunas `ordem_servico.dados_confeccao` (JSONB), `confeccao_preenchido_em`, `confeccao_preenchido_por`, e índice único `idx_os_pedido_item_unico` em `pedido_item_id`. Consumidas pelas Tasks 3, 5, 6.

- [ ] **Step 1: Escrever a migration**

```sql
-- ordem_servico_dados_confeccao.sql
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_confeccao         JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_em  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_por INTEGER REFERENCES usuarios(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_os_pedido_item_unico ON ordem_servico(pedido_item_id);
```

- [ ] **Step 2: Confirmar que não há OS duplicada antes de criar o índice único**

Run: `psql "$DATABASE_URL" -c "SELECT pedido_item_id, COUNT(*) FROM ordem_servico GROUP BY pedido_item_id HAVING COUNT(*) > 1;"`
Expected: 0 linhas. Se houver alguma linha, **pare e decida manualmente** qual OS duplicada manter antes de aplicar a migration (apagar a duplicata mais antiga sem `dados_tecnicos`, por exemplo) — o índice único vai falhar na criação se houver duplicidade.

- [ ] **Step 3: Aplicar no banco local e no Supabase**

Run: `psql "$DATABASE_URL" -f backend/src/database/migrations/ordem_servico_dados_confeccao.sql`, e o mesmo SQL no Supabase (MCP `apply_migration` ou painel).

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/ordem_servico_dados_confeccao.sql
git commit -m "feat(db): adiciona ordem_servico.dados_confeccao e índice único em pedido_item_id"
```

---

## Task 3: `ordemServicoService.criar` — idempotente + tipo pela categoria

**Files:**
- Modify: `backend/src/services/ordemServicoService.js:4-12`
- Test: `backend/src/__tests__/ordemServicoService.test.js:1-20`

**Interfaces:**
- Consumes: `db.query` (mock em teste).
- Produces: `criar({ pedidoItemId, responsavelId }) -> Promise<OS>` — lança `{status:404}` se o item não existir, `{status:400}` se a categoria do item não tiver `tipo_confeccao`; nunca duplica OS para o mesmo `pedido_item_id`.

- [ ] **Step 1: Reescrever o describe `criar` no teste (vai falhar contra a implementação atual)**

Substituir todo o bloco `describe('criar', ...)` (linhas 7-20) por:

```js
describe('criar', () => {
  test('cria a OS com o tipo da categoria do item', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, pedido_item_id: 5, status: 'aberta', tipo: 'cortina' }] });

    const result = await svc.criar({ pedidoItemId: 5, responsavelId: 2 });

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO ordem_servico'),
      [5, 2, 'cortina']
    );
    expect(result.tipo).toBe('cortina');
  });

  test('retorna a OS existente em vez de duplicar (idempotente)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo_confeccao: 'forro' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9, pedido_item_id: 5, status: 'em_andamento', tipo: 'forro' }] });

    const result = await svc.criar({ pedidoItemId: 5, responsavelId: 2 });

    expect(result.id).toBe(9);
  });

  test('lança erro 400 quando a categoria do item não tem ficha de confecção', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo_confeccao: null }] });

    await expect(svc.criar({ pedidoItemId: 5, responsavelId: 2 })).rejects.toMatchObject({ status: 400 });
  });

  test('lança erro 404 quando o item do pedido não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(svc.criar({ pedidoItemId: 999, responsavelId: 2 })).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest ordemServicoService -t criar`
Expected: FAIL — a implementação atual chama `db.query` uma única vez com `[pedidoItemId, responsavelId]` e não filtra por categoria.

- [ ] **Step 3: Reescrever `criar` em `ordemServicoService.js`**

Substituir as linhas 4-12 por:

```js
async function criar({ pedidoItemId, responsavelId }) {
  const { rows: catRows } = await db.query(
    `SELECT cat.tipo_confeccao
     FROM pedido_itens pi
     LEFT JOIN categorias cat ON cat.id = pi.categoria_id
     WHERE pi.id = $1`,
    [pedidoItemId]
  );
  if (!catRows.length) {
    throw Object.assign(new Error('Item do pedido não encontrado'), { status: 404 });
  }
  const tipoConfeccao = catRows[0].tipo_confeccao;
  if (!tipoConfeccao) {
    throw Object.assign(new Error('Esta categoria não possui ficha de confecção.'), { status: 400 });
  }

  const { rows } = await db.query(
    `INSERT INTO ordem_servico (pedido_item_id, responsavel_id, tipo)
     VALUES ($1, $2, $3)
     ON CONFLICT (pedido_item_id) DO NOTHING
     RETURNING *`,
    [pedidoItemId, responsavelId, tipoConfeccao]
  );
  if (rows[0]) return rows[0];

  const { rows: existentes } = await db.query(
    `SELECT * FROM ordem_servico WHERE pedido_item_id = $1`,
    [pedidoItemId]
  );
  return existentes[0];
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest ordemServicoService -t criar`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): criar() idempotente e tipo definido pela categoria do item"
```

---

## Task 4: `ordemServicoService.buscar` — devolver `dados_confeccao`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js` (função `buscar`, SELECT)
- Test: `backend/src/__tests__/ordemServicoService.test.js` (describe `buscar`)

**Interfaces:**
- Produces: `buscar(id) -> Promise<OS|null>` — OS agora inclui `tipo`, `dados_confeccao`, `confeccao_preenchido_em`, `confeccao_preenchido_por` (além dos campos já existentes).

- [ ] **Step 1: Atualizar o teste**

Substituir o describe `buscar` por:

```js
describe('buscar', () => {
  test('retorna a OS detalhada com dados de confecção', async () => {
    const fakeOs = {
      id: 1, status: 'aberta', pedido_id: 10, pedido_numero_sequencial: 4, cliente_nome: 'Teste Cliente',
      tipo: 'cortina', dados_confeccao: { larguraTrilho: 4.92 }, confeccao_preenchido_em: '2026-06-20T10:00:00.000Z',
    };
    db.query.mockResolvedValueOnce({ rows: [fakeOs] });

    const res = await svc.buscar(1);
    expect(res.pedido_numero).toBe('SIS-00000004');
    expect(res.dados_confeccao).toEqual({ larguraTrilho: 4.92 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('os.dados_confeccao'), [1]);
  });

  test('retorna null se não existir', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await svc.buscar(999);
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest ordemServicoService -t buscar`
Expected: FAIL — a query atual não seleciona `os.dados_confeccao`.

- [ ] **Step 3: Atualizar o SELECT de `buscar`**

Trocar a linha `os.id, os.status, os.aberta_em, os.encerrada_em, os.tipo, os.dados_tecnicos,` e a linha seguinte `os.preenchido_em, os.preenchido_por,` por:

```sql
            os.id, os.status, os.aberta_em, os.encerrada_em, os.tipo,
            os.dados_tecnicos, os.preenchido_em, os.preenchido_por,
            os.dados_confeccao, os.confeccao_preenchido_em, os.confeccao_preenchido_por,
```

(mantendo o restante do SELECT — `os.pedido_item_id`, `pi.*`, `p.*`, `c.*`, `u.*`, `a.*` — inalterado.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest ordemServicoService -t buscar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): buscar() devolve dados_confeccao e timestamps de confecção"
```

---

## Task 5: `ordemServicoService.salvarDadosConfeccao` (nova função)

**Files:**
- Modify: `backend/src/services/ordemServicoService.js`
- Test: `backend/src/__tests__/ordemServicoService.test.js`

**Interfaces:**
- Consumes: nada novo (usa `db.query`).
- Produces: `salvarDadosConfeccao(id, userId, dadosConfeccao) -> Promise<OS>` — valida campos obrigatórios diferentes por `os.tipo` (`'cortina'` ou `'forro'`); lança `{status:404}` se a OS não existir, `{status:400}` em validação. Consumida pela Task 7 (rota) e pelas telas de Ficha de Confecção (Tasks 12-13).

- [ ] **Step 1: Escrever os testes (vão falhar — função não existe)**

Adicionar ao arquivo de teste, após o describe `atualizarStatus`:

```js
describe('salvarDadosConfeccao', () => {
  test('salva dados de confecção de cortina quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_confeccao: { larguraTrilho: '4,92' }, status: 'em_andamento' }] });

    const dados = { larguraTrilho: '4,92', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    const result = await svc.salvarDadosConfeccao(1, 2, dados);

    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('dados_confeccao = $1'),
      [JSON.stringify(dados), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 se largura do trilho for inválida para cortina', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'cortina' }] });
    const dados = { larguraTrilho: '0', tipoWave: 'G', espacador: '7,00', abertura: 'SEM ABERTURA', feitaPor: 'POR ALTURA' };
    await expect(svc.salvarDadosConfeccao(1, 2, dados)).rejects.toThrow('trilho');
  });

  test('salva dados de confecção de forro quando válidos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, dados_confeccao: { tecidoForro: 'Microfibra branca' }, status: 'em_andamento' }] });

    const dados = { tecidoForro: 'Microfibra branca', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    const result = await svc.salvarDadosConfeccao(2, 3, dados);

    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 se tecido do forro não for informado', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ tipo: 'forro' }] });
    const dados = { tecidoForro: '', larguraForro: '3,00', forroCosturado: 'SEPARADO' };
    await expect(svc.salvarDadosConfeccao(2, 3, dados)).rejects.toThrow('Tecido do forro');
  });

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosConfeccao(999, 2, {})).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest ordemServicoService -t salvarDadosConfeccao`
Expected: FAIL com `svc.salvarDadosConfeccao is not a function`.

- [ ] **Step 3: Implementar `salvarDadosConfeccao` e os validadores**

Adicionar em `ordemServicoService.js`, antes de `module.exports`:

```js
function validarDadosConfeccaoCortina(dados) {
  const { larguraTrilho, tipoWave, espacador, abertura, feitaPor } = dados || {};
  if (!larguraTrilho || parseFloat(String(larguraTrilho).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do trilho é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!tipoWave) throw Object.assign(new Error('Tipo wave é obrigatório.'), { status: 400 });
  if (!espacador) throw Object.assign(new Error('Espaçador é obrigatório.'), { status: 400 });
  if (!abertura) throw Object.assign(new Error('Abertura é obrigatória.'), { status: 400 });
  if (!feitaPor) throw Object.assign(new Error('Campo "Cortina feita por" é obrigatório.'), { status: 400 });
}

function validarDadosConfeccaoForro(dados) {
  const { tecidoForro, larguraForro, forroCosturado } = dados || {};
  if (!tecidoForro?.trim()) throw Object.assign(new Error('Tecido do forro é obrigatório.'), { status: 400 });
  if (!larguraForro || parseFloat(String(larguraForro).replace(',', '.')) <= 0) {
    throw Object.assign(new Error('Largura do forro é obrigatória e deve ser maior que zero.'), { status: 400 });
  }
  if (!forroCosturado) throw Object.assign(new Error('Campo "Forro costurado" é obrigatório.'), { status: 400 });
}

async function salvarDadosConfeccao(id, userId, dadosConfeccao) {
  const { rows: osRows } = await db.query(`SELECT tipo FROM ordem_servico WHERE id = $1`, [id]);
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });

  if (osRows[0].tipo === 'cortina') {
    validarDadosConfeccaoCortina(dadosConfeccao);
  } else if (osRows[0].tipo === 'forro') {
    validarDadosConfeccaoForro(dadosConfeccao);
  }

  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET dados_confeccao = $1,
         confeccao_preenchido_em = NOW(),
         confeccao_preenchido_por = $2,
         status = CASE WHEN status = 'aberta' THEN 'em_andamento' ELSE status END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(dadosConfeccao), userId, id]
  );
  return rows[0];
}
```

E atualizar `module.exports` para incluir `salvarDadosConfeccao`:

```js
module.exports = {
  criar, listarPorPedido, atualizarStatus, buscar,
  salvarDadosConfeccao, salvarDadosTecnicos,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest ordemServicoService -t salvarDadosConfeccao`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): adiciona salvarDadosConfeccao com validação por tipo (cortina/forro)"
```

---

## Task 6: `ordemServicoService.salvarDadosTecnicos` — gate em `dados_confeccao`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js` (função `salvarDadosTecnicos`)
- Test: `backend/src/__tests__/ordemServicoService.test.js` (describe `salvarDadosTecnicos`)

**Interfaces:**
- Produces: `salvarDadosTecnicos(id, userId, dadosTecnicos)` agora lança `{status:400}` se `ordem_servico.dados_confeccao` for `NULL`, antes de validar os campos técnicos.

- [ ] **Step 1: Atualizar os testes**

Substituir o describe `salvarDadosTecnicos` por:

```js
describe('salvarDadosTecnicos', () => {
  const validData = {
    largura: '4.20', altura_esq: '3.00', altura_meio: '3.00', altura_dir: '3.00',
    responsavel_conferencia: 'João Conf', data_conferencia: '2026-05-26',
    assinatura_tecnico: 'data:image/png;base64,foo'
  };

  test('salva com sucesso quando ficha de confecção já está preenchida', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ dados_confeccao: { larguraTrilho: 4.92 } }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dados_tecnicos: validData, status: 'em_andamento' }] });

    const result = await svc.salvarDadosTecnicos(1, 2, validData);
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('dados_tecnicos = $1'),
      [JSON.stringify(validData), 2, 1]
    );
    expect(result.status).toBe('em_andamento');
  });

  test('lança erro 400 quando a ficha de confecção ainda não foi preenchida', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ dados_confeccao: null }] });
    await expect(svc.salvarDadosTecnicos(1, 2, validData)).rejects.toMatchObject({ status: 400 });
  });

  test('lança erro 404 quando OS não existe', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.salvarDadosTecnicos(999, 2, validData)).rejects.toMatchObject({ status: 404 });
  });

  test('lança erro se largura técnica for inválida', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ dados_confeccao: { larguraTrilho: 4.92 } }] });
    const data = { ...validData, largura: '0' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('largura');
  });

  test('lança erro se altura esquerda for inválida', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ dados_confeccao: { larguraTrilho: 4.92 } }] });
    const data = { ...validData, altura_esq: null };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('esquerda');
  });

  test('lança erro se responsável não for preenchido', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ dados_confeccao: { larguraTrilho: 4.92 } }] });
    const data = { ...validData, responsavel_conferencia: '' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('responsável');
  });

  test('lança erro se assinatura do técnico não for fornecida', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ dados_confeccao: { larguraTrilho: 4.92 } }] });
    const data = { ...validData, assinatura_tecnico: '' };
    await expect(svc.salvarDadosTecnicos(1, 2, data)).rejects.toThrow('Assinatura');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest ordemServicoService -t salvarDadosTecnicos`
Expected: FAIL — a implementação atual não faz nenhum SELECT antes do UPDATE, então o mock de "ficha de confecção ainda não preenchida" e a contagem de chamadas (`toHaveBeenNthCalledWith(2, ...)`) não batem.

- [ ] **Step 3: Adicionar o gate no início de `salvarDadosTecnicos`**

Logo após a linha `async function salvarDadosTecnicos(id, userId, dadosTecnicos) {`, adicionar:

```js
  const { rows: osRows } = await db.query(`SELECT dados_confeccao FROM ordem_servico WHERE id = $1`, [id]);
  if (!osRows.length) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  if (!osRows[0].dados_confeccao) {
    throw Object.assign(new Error('Ficha de Confecção precisa ser preenchida antes da Conferência Técnica.'), { status: 400 });
  }

```

(mantendo o restante da função — validações de `largura`, `altura_*`, `responsavel_conferencia` etc. e o UPDATE final — exatamente como está hoje.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest ordemServicoService -t salvarDadosTecnicos`
Expected: PASS (7 testes).

- [ ] **Step 5: Rodar a suíte completa do arquivo**

Run: `cd backend && npx jest ordemServicoService`
Expected: todos os describes (`criar`, `listarPorPedido`, `atualizarStatus`, `buscar`, `salvarDadosConfeccao`, `salvarDadosTecnicos`) PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ordemServicoService.js backend/src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): salvarDadosTecnicos exige ficha de confecção preenchida antes"
```

---

## Task 7: `PUT /os/:id/confeccao` (nova rota)

**Files:**
- Modify: `backend/src/routes/ordemServicoRoutes.js:18-32` (após o `PATCH /:id/status`)
- Test: `backend/src/__tests__/ordemServicoRoutes.test.js`

**Interfaces:**
- Consumes: `svc.salvarDadosConfeccao(id, userId, body)` (Task 5).
- Produces: rota `PUT /os/:id/confeccao`, consumida pelas telas de Ficha de Confecção (Tasks 12-13) via `api.put("/os/:id/confeccao", dados)`.

- [ ] **Step 1: Escrever os testes (vão falhar — rota não existe)**

Adicionar ao final de `ordemServicoRoutes.test.js`:

```js
describe('PUT /api/os/:id/confeccao', () => {
  test('200 ao salvar dados de confecção', async () => {
    svc.salvarDadosConfeccao.mockResolvedValueOnce({ id: 1, dados_confeccao: { larguraTrilho: 4.92 } });
    const res = await request(app).put('/api/os/1/confeccao').send({ larguraTrilho: 4.92 });
    expect(res.status).toBe(200);
    expect(res.body.dados_confeccao).toEqual({ larguraTrilho: 4.92 });
  });

  test('400 quando o serviço rejeita os dados', async () => {
    const err = Object.assign(new Error('Largura do trilho é obrigatória e deve ser maior que zero.'), { status: 400 });
    svc.salvarDadosConfeccao.mockRejectedValueOnce(err);
    const res = await request(app).put('/api/os/1/confeccao').send({});
    expect(res.status).toBe(400);
  });

  test('400 para id inválido', async () => {
    const res = await request(app).put('/api/os/abc/confeccao').send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest ordemServicoRoutes`
Expected: FAIL com 404 (rota inexistente).

- [ ] **Step 3: Adicionar a rota**

Em `ordemServicoRoutes.js`, depois do bloco `router.patch('/:id/status', ...)` (linha 32) e antes de `router.get('/pedidos/:pedidoId/os', ...)`, adicionar:

```js
router.put('/:id/confeccao', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'id inválido' });
    const os = await svc.salvarDadosConfeccao(id, req.user.id, req.body);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest ordemServicoRoutes`
Expected: PASS em todos os describes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/ordemServicoRoutes.js backend/src/__tests__/ordemServicoRoutes.test.js
git commit -m "feat(os): adiciona rota PUT /os/:id/confeccao"
```

---

## Task 8: `agendamentoService.listarConferenciaItens` — expor `tipo_confeccao`/`confeccao_preenchida`

**Files:**
- Modify: `backend/src/services/agendamentoService.js:1321-1343`

**Interfaces:**
- Produces: cada item retornado por `listarConferenciaItens` (consumido por `GET /agendamentos/:id/conferencia-itens`, usado em `Agendamentos.jsx`) ganha `tipo_confeccao` e `confeccao_preenchida`, ao lado do `ficha_preenchida` já existente.

- [ ] **Step 1: Atualizar a query**

Substituir o bloco do `db.query` (linhas 1321-1343) por:

```js
  const { rows } = await db.query(
    `SELECT
       pi.id AS pedido_item_id,
       pi.descricao,
       pi.ambiente,
       cat.tipo_confeccao,
       COALESCE(ci.status, 'pendente') AS status,
       ci.observacoes,
       ci.dados,
       ci.conferido_em,
       u.nome_completo AS conferido_por_nome,
       os.id AS ordem_servico_id,
       (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
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

- [ ] **Step 2: Rodar a suíte completa do backend para garantir que nada quebrou**

Run: `cd backend && npm test`
Expected: PASS em todos os arquivos (não há teste dedicado a `listarConferenciaItens` hoje — esta é uma mudança puramente aditiva de colunas, mas precisa não regredir nada que dependa de `agendamentoService.js`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/agendamentoService.js
git commit -m "feat(conferencia): listarConferenciaItens expõe tipo_confeccao e confeccao_preenchida"
```

---

## Task 9: `dashboardService.buscarFluxoPedido` — mesma exposição para `EtapaConferencia`

**Files:**
- Modify: `backend/src/services/dashboardService.js:674-703`

**Interfaces:**
- Produces: cada item de `pre_agendamentos[].itens` (consumido por `EtapaConferencia.jsx` via `PedidoFluxo`) ganha `tipo_confeccao` e `confeccao_preenchida`.

- [ ] **Step 1: Atualizar a query e o mapeamento**

Substituir o bloco (linhas 674-703) por:

```js
  const [{ rows: itensPorGenitor }, { rows: herdeirosRaw }] = await Promise.all([
    db.query(
      `SELECT ai.agendamento_id, ai.pedido_item_id, pi.descricao,
              cat.tipo_confeccao,
              os.id AS ordem_servico_id,
              (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
              (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
      [genitoreIds]
    ),
    db.query(
      `SELECT id, agendamento_pai_id, tipo, status, data AS data_inicio
       FROM agendamentos
       WHERE agendamento_pai_id = ANY($1) AND empresa_id = $2
       ORDER BY data`,
      [genitoreIds, empresaId]
    ),
  ]);

  const itensPorAg = {};
  for (const item of itensPorGenitor) {
    if (!itensPorAg[item.agendamento_id]) itensPorAg[item.agendamento_id] = [];
    itensPorAg[item.agendamento_id].push({
      pedido_item_id: item.pedido_item_id,
      descricao: item.descricao,
      tipo_confeccao: item.tipo_confeccao,
      ordem_servico_id: item.ordem_servico_id,
      confeccao_preenchida: item.confeccao_preenchida,
      ficha_preenchida: item.ficha_preenchida,
    });
  }
```

- [ ] **Step 2: Rodar a suíte de dashboard**

Run: `cd backend && npx jest dashboardService`
Expected: PASS — os testes existentes (`dashboardService.test.js`, `dashboardService.buscarFluxoPedido.test.js`) usam `genitoresRaw` vazio nos cenários que cobrem essa área ou mockam linhas com objetos literais, então colunas novas não quebram as asserções existentes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dashboardService.js
git commit -m "feat(fluxo-pedido): EtapaConferencia recebe tipo_confeccao e confeccao_preenchida por item"
```

---

## Task 10: Portar `calculoCortina.js` para `frontend-web`

**Files:**
- Create: `frontend-web/src/utils/calculoCortina.js`
- Create: `frontend-web/src/utils/calculoCortina.selftest.js`

**Interfaces:**
- Produces: `clipesAberturaCentral`, `clipesSemAbertura`, `calcularQuantTecidoCortina`, `calcularQuantEntretela`, `calcularQuantBarrado`, `calcularSobraBarrado`, `calcularQuantForro` — todas funções puras, consumidas pelas Tasks 12 e 13.

- [ ] **Step 1: Criar o módulo de cálculo**

Conteúdo idêntico ao `calculoCortina.js` fornecido na spec (mesmas funções, mesma lógica), **sem** o bloco de self-test do final (que usa `import.meta.url`/`process.argv`, inexistentes no browser e que quebrariam o bundle do Vite se avaliados):

```js
function ceilingTo(value, significance) {
  if (!significance) return 0;
  return Math.ceil(value / significance) * significance;
}

function roundUp(value, digits = 0) {
  const f = Math.pow(10, digits);
  return Math.ceil(value * f) / f;
}

function fmt(value, digits = 2) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function passoEspacador(espacador) {
  const v = String(espacador).trim();
  if (v === '3,6' || v === '3.6') return 0.036;
  if (v === '5,00' || v === '5,0' || v === '5') return 0.05;
  if (v === '7,00' || v === '7') return 0.07;
  return null;
}

function fatorWave(tipoWave) {
  if (tipoWave === 'P') return 0.1;
  if (tipoWave === 'M') return 0.13;
  return 0.16;
}

function fatorEntretelaBase(tipoWave) {
  if (tipoWave === 'P') return 0.16;
  if (tipoWave === 'M') return 0.19;
  return 0.22;
}

function fatorEntretelaAbertura(tipoWave) {
  if (tipoWave === 'P') return 0.32;
  if (tipoWave === 'M') return 0.38;
  return 0.44;
}

function osValida(tipoOS) {
  return tipoOS === 'CORTINA' || tipoOS === 'FORRO + CORTINA';
}

function clipesAberturaCentral({ tipoOS, abertura, espacador, larguraTrilho }) {
  if (tipoOS && !osValida(tipoOS)) return '';
  const passo = passoEspacador(espacador);
  if (!(abertura === 'COM ABERTURA' && larguraTrilho > 0 && passo !== null)) return '';

  const step1 = ceilingTo(larguraTrilho / passo, 2);
  const step2 = ceilingTo(step1 / 2, 2);
  return step2 + 2;
}

function clipesSemAbertura({ tipoOS, abertura, espacador, larguraTrilho }) {
  if (tipoOS && !osValida(tipoOS)) return '';
  const passo = passoEspacador(espacador);
  if (!(abertura === 'SEM ABERTURA' && larguraTrilho > 0 && passo !== null)) return '';

  return ceilingTo(larguraTrilho / passo, 2) + 2;
}

function larguraPainelUnico({ espacador, larguraTrilho, tipoWave }) {
  const passo = passoEspacador(espacador);
  const wave = fatorWave(tipoWave);
  const a = roundUp(larguraTrilho / passo / 2, 0);
  return (a * 2 + 2) * wave + 0.3;
}

function larguraPainelAberturaLado({ espacador, larguraTrilho, tipoWave }) {
  const passo = passoEspacador(espacador);
  const wave = fatorWave(tipoWave);
  const a = roundUp(larguraTrilho / passo / 2, 0);
  const b = roundUp(((a * 2) / 2) / 2, 0);
  return (b * 2 + 2) * wave + 0.3;
}

function larguraPainelNecessaria({ espacador, larguraTrilho, tipoWave, abertura }) {
  if (abertura === 'COM ABERTURA') {
    return larguraPainelAberturaLado({ espacador, larguraTrilho, tipoWave }) * 2;
  }
  return larguraPainelUnico({ espacador, larguraTrilho, tipoWave });
}

function calcularQuantTecidoCortina({
  tipoOS, feitaPor, abertura, espacador, larguraTrilho, tipoWave, larguraTecido,
  alturaCortina, vendeuBarraAplicada, alturaBarra = 0, quantTomas = 0, tamanhoTomas = 0,
}) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (!larguraTrilho || !espacador || !tipoWave || !abertura) return '';

  const larguraPainel = larguraPainelNecessaria({ espacador, larguraTrilho, tipoWave, abertura });

  if (feitaPor === 'POR LARGURA') {
    const alturaMinima =
      vendeuBarraAplicada === 'SIM'
        ? alturaCortina + 0.11
        : alturaCortina + 0.11 + alturaBarra + quantTomas * tamanhoTomas * 2;

    if (larguraTecido >= alturaMinima) {
      return `${fmt(larguraPainel)} mts`;
    }
    return 'Faltou tecido p/ cortina';
  }

  if (feitaPor === 'POR ALTURA') {
    if (!larguraTecido) return 'Informar largura do tecido';

    const numAlturas = roundUp(larguraPainel / larguraTecido, 0);
    const alturaTotal = alturaCortina + 0.11 + alturaBarra + quantTomas * tamanhoTomas * 2;
    const totalMts = ceilingTo(numAlturas * alturaTotal, 0.5);

    return `${numAlturas} alturas x ${fmt(alturaTotal)} = ${fmt(totalMts)} mts`;
  }

  return '';
}

function calcularQuantEntretela({ tipoOS, abertura, espacador, larguraTrilho, tipoWave }) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (!larguraTrilho || !espacador || !abertura) return '';

  const passo = passoEspacador(espacador);
  const wave = fatorWave(tipoWave);
  const a = roundUp(larguraTrilho / passo / 2, 0);

  let valor;
  if (abertura === 'COM ABERTURA') {
    const b = roundUp(((a * 2) / 2) / 2, 0);
    valor = (b * 2 + 2) * wave * 2 + fatorEntretelaAbertura(tipoWave);
  } else {
    valor = (a * 2 + 2) * wave + fatorEntretelaBase(tipoWave);
  }

  return `${fmt(valor)} mts`;
}

function calcularQuantBarrado({
  tipoOS, feitaPor, abertura, espacador, larguraTrilho, tipoWave, larguraTecido,
  vendeuBarraAplicada, alturaBarra = 0, quantTomas = 0, tamanhoTomas = 0,
}) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (feitaPor === 'POR ALTURA') return '';
  if (vendeuBarraAplicada !== 'SIM') return '0,00 mts';
  if (!larguraTrilho || !espacador) return '';

  const larguraBarra = alturaBarra * 2 + 0.04 + quantTomas * tamanhoTomas * 2;

  if (larguraBarra > larguraTecido) return 'Faltou tecido p/ barrado';

  let valor;
  if (abertura === 'COM ABERTURA') {
    const ladoUnico = larguraPainelAberturaLado({ espacador, larguraTrilho, tipoWave });
    valor = larguraBarra * 2 <= larguraTecido ? ladoUnico : ladoUnico * 2;
  } else {
    valor = larguraPainelUnico({ espacador, larguraTrilho, tipoWave });
  }

  return `${fmt(valor)} mts`;
}

function calcularSobraBarrado({
  tipoOS, abertura, larguraTecido, vendeuBarraAplicada,
  alturaBarra = 0, quantTomas = 0, tamanhoTomas = 0, quantBarrado,
}) {
  if (tipoOS && !osValida(tipoOS)) return '';
  if (quantBarrado === 'NÃO PRECISA DE BARRADO') return 'SEM SOBRA DE TECIDO';
  if (vendeuBarraAplicada === 'NÃO') return 'VENDER BARRADO';
  if (!quantBarrado) return '';

  const larguraBarra = alturaBarra * 2 + 0.04 + quantTomas * tamanhoTomas * 2;
  const sobra =
    abertura === 'COM ABERTURA' ? larguraTecido - larguraBarra * 2 : larguraTecido - larguraBarra;

  if (sobra < 0) return 'não cabe na largura do tecido';
  return `${quantBarrado} x ${fmt(sobra)} mts`;
}

function calcularQuantForro({
  abertura, espacador, larguraTrilho, tipoWave, tecidoForro, larguraForro,
  alturaCortina, alturaBarraForro = 0, forroCosturado, franzimento = 0,
}) {
  if (!tecidoForro) return '';
  if (!larguraForro) return 'Informar largura do tecido do forro';

  const wave = fatorWave(tipoWave);
  const clipesCentral = clipesAberturaCentral({ abertura, espacador, larguraTrilho });
  const clipesSemAb = clipesSemAbertura({ abertura, espacador, larguraTrilho });

  let x50 = 0;
  if (forroCosturado === 'JUNTO') {
    x50 =
      abertura === 'COM ABERTURA'
        ? (clipesCentral || 0) * wave + 0.1 + ((clipesCentral || 0) * wave + 0.1)
        : (clipesSemAb || 0) * wave + 0.1;
  } else if (forroCosturado === 'SEPARADO') {
    x50 = larguraTrilho * franzimento + (abertura === 'COM ABERTURA' ? 0.2 : 0.1);
  }

  const x51 = alturaCortina + 0.07 + alturaBarraForro;
  const x52 = larguraForro > 0 ? roundUp(x50 / larguraForro, 0) : 0;

  if (larguraForro >= x51) {
    return `${fmt(x50)} mts`;
  }
  const total = ceilingTo(x52 * x51, 0.5);
  return `${x52} alturas x ${fmt(x51)} = ${fmt(total)} mts`;
}

export {
  clipesAberturaCentral,
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
  calcularQuantForro,
};
```

> Nota: nas funções `calcularQuantTecidoCortina` e `calcularQuantEntretela` foi adicionado um early-return (`if (!larguraTrilho || !espacador...) return '';`) que não existia no arquivo original da spec — necessário porque na tela real os campos chegam vazios/zerados antes do usuário preencher, e sem essa guarda `passoEspacador(espacador)` retornaria `null` e a divisão geraria `NaN` propagando para a UI. O caso de teste da Task seguinte teve todos os campos preenchidos, então esse comportamento não é coberto por ele — validar manualmente na Task 19 que os campos calculados mostram "—" (vazio) e não "NaN" antes de preencher o formulário.

- [ ] **Step 2: Criar o script de verificação standalone**

```js
import {
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
} from './calculoCortina.js';

const entrada = {
  tipoOS: 'CORTINA',
  feitaPor: 'POR ALTURA',
  espacador: '7,00',
  tipoWave: 'G',
  abertura: 'SEM ABERTURA',
  larguraTrilho: 4.92,
  larguraTecido: 3.3,
  alturaCortina: 2.84,
  vendeuBarraAplicada: 'NÃO',
  alturaBarra: 0.5,
  quantTomas: 0,
  tamanhoTomas: 0,
};

const resultado = {
  clipesSemAbertura: clipesSemAbertura(entrada),
  quantTecidoCortina: calcularQuantTecidoCortina(entrada),
  quantEntretela: calcularQuantEntretela(entrada),
  quantBarrado: calcularQuantBarrado(entrada),
};
resultado.sobraBarrado = calcularSobraBarrado({ ...entrada, quantBarrado: resultado.quantBarrado });

const esperado = {
  clipesSemAbertura: 74,
  quantTecidoCortina: '4 alturas x 3,45 = 14,00 mts',
  quantEntretela: '12,06 mts',
  quantBarrado: '',
  sobraBarrado: 'VENDER BARRADO',
};

let ok = true;
for (const chave of Object.keys(esperado)) {
  if (resultado[chave] !== esperado[chave]) {
    ok = false;
    console.error(`FALHOU [${chave}]: esperado ${JSON.stringify(esperado[chave])}, obtido ${JSON.stringify(resultado[chave])}`);
  }
}

if (ok) {
  console.log('OK: calculoCortina.js bate com o caso de teste da planilha.');
  process.exit(0);
} else {
  process.exit(1);
}
```

Este arquivo nunca é importado por nenhuma tela — fica inerte para o bundle do Vite, e é executado manualmente via `node`.

- [ ] **Step 3: Rodar o self-test**

Run: `node frontend-web/src/utils/calculoCortina.selftest.js`
Expected: `OK: calculoCortina.js bate com o caso de teste da planilha.` (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/utils/calculoCortina.js frontend-web/src/utils/calculoCortina.selftest.js
git commit -m "feat(confeccao): porta o motor de cálculo da planilha de cortina wave para o frontend"
```

---

## Task 11: util compartilhado `fichaConferencia.js`

**Files:**
- Create: `frontend-web/src/utils/fichaConferencia.js`

**Interfaces:**
- Consumes: `api` (`frontend-web/src/services/api.js`).
- Produces: `acaoFichaConferencia(item) -> {label, rota}|null` e `abrirOsDoItem(item) -> Promise<number>` (cria a OS via `POST /os` se `item.ordem_servico_id` ainda não existir, idempotente — Task 3). Consumido pelas Tasks 17 e 18.

Estado por item, decidido por `acaoFichaConferencia`:

| Condição | `label` | `rota` |
|---|---|---|
| `!item.tipo_confeccao` | (retorna `null` — sem ação) | — |
| `item.ficha_preenchida` | "Visualizar Ficha" | `"tecnica"` |
| `item.confeccao_preenchida` (e não `ficha_preenchida`) | "Conferência Técnica" | `"tecnica"` |
| nenhum dos dois | "Preencher Ficha de Confecção" | `"confeccao"` |

- [ ] **Step 1: Criar o módulo**

```js
import { api } from "../services/api";

export function acaoFichaConferencia(item) {
  if (!item.tipo_confeccao) return null;
  if (item.ficha_preenchida) return { label: "Visualizar Ficha", rota: "tecnica" };
  if (item.confeccao_preenchida) return { label: "Conferência Técnica", rota: "tecnica" };
  return { label: "Preencher Ficha de Confecção", rota: "confeccao" };
}

export async function abrirOsDoItem(item) {
  if (item.ordem_servico_id) return item.ordem_servico_id;
  const os = await api.post("/os", { pedido_item_id: item.pedido_item_id });
  return os.id;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/utils/fichaConferencia.js
git commit -m "feat(confeccao): util compartilhado de estado da ficha por item"
```

---

## Task 12: Tela `FichaConfeccaoCortina.jsx`

**Files:**
- Create: `frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx`

**Interfaces:**
- Consumes: `api` (`../../services/api`), funções de `../../utils/calculoCortina` (Task 10).
- Produces: componente `FichaConfeccaoCortina({ osData, onSalvar, onVoltar })` — `osData` é o objeto devolvido por `GET /os/:id` (Task 4: inclui `id`, `dados_confeccao`, `cliente_nome`, `pedido_numero`, `consultor_nome`, `item_ambiente`, `item_descricao`, `item_medidas`, `item_referencia`, `item_cor`). Consumido pela Task 14 (`FichaConfeccao.jsx`).

- [ ] **Step 1: Criar o componente**

```jsx
import { useMemo, useState } from "react";
import { api } from "../../services/api";
import {
  clipesAberturaCentral,
  clipesSemAbertura,
  calcularQuantTecidoCortina,
  calcularQuantEntretela,
  calcularQuantBarrado,
  calcularSobraBarrado,
} from "../../utils/calculoCortina";
import "./OrdemServicoModal.css";

const VAZIO = {
  feitaPor: "", espacador: "", tipoWave: "", abertura: "", componente: "", ladoMotor: "",
  larguraTrilho: "", larguraTecido: "", nomeTecido: "", vendeuBarraAplicada: "",
  alturaCortina: "", alturaBarra: "", quantTomas: "", tamanhoTomas: "",
  cortinaLadoALado: "", detalheBarra: "",
};

function paraNumero(valor) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function FichaConfeccaoCortina({ osData, onSalvar, onVoltar }) {
  const [dados, setDados] = useState({ ...VAZIO, ...(osData.dados_confeccao || {}) });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  const calculo = useMemo(() => {
    const entrada = {
      tipoOS: "CORTINA",
      feitaPor: dados.feitaPor,
      espacador: dados.espacador,
      tipoWave: dados.tipoWave,
      abertura: dados.abertura,
      larguraTrilho: paraNumero(dados.larguraTrilho),
      larguraTecido: paraNumero(dados.larguraTecido),
      alturaCortina: paraNumero(dados.alturaCortina),
      vendeuBarraAplicada: dados.vendeuBarraAplicada,
      alturaBarra: paraNumero(dados.alturaBarra),
      quantTomas: paraNumero(dados.quantTomas),
      tamanhoTomas: paraNumero(dados.tamanhoTomas),
    };

    const clipes =
      entrada.abertura === "COM ABERTURA"
        ? clipesAberturaCentral(entrada)
        : clipesSemAbertura(entrada);
    const quantTecidoCortina = calcularQuantTecidoCortina(entrada);
    const quantEntretela = calcularQuantEntretela(entrada);
    const quantBarrado = calcularQuantBarrado(entrada);
    const sobraBarrado = calcularSobraBarrado({ ...entrada, quantBarrado });

    return { clipes, quantTecidoCortina, quantEntretela, quantBarrado, sobraBarrado };
  }, [dados]);

  async function salvar() {
    setErro("");
    setSucesso("");

    if (!dados.feitaPor) return setErro('Campo "Cortina feita por" é obrigatório.');
    if (!dados.espacador) return setErro("Espaçador é obrigatório.");
    if (!dados.tipoWave) return setErro("Tipo wave é obrigatório.");
    if (!dados.abertura) return setErro("Abertura é obrigatória.");
    if (!dados.larguraTrilho || paraNumero(dados.larguraTrilho) <= 0) {
      return setErro("Largura do trilho é obrigatória e deve ser maior que zero.");
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/confeccao`, dados);
      setSucesso("Ficha de Confecção salva com sucesso!");
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha de confecção.");
    } finally {
      setSalvando(false);
    }
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;

  return (
    <div className="ek-page os-page">
      <div className="os-page-header">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={onVoltar}>← Voltar</button>
          <div>
            <h1 className="os-page-title">Ficha de Confecção — Cortina</h1>
            <p className="os-page-subtitle">
              {osData.cliente_nome && <span>{osData.cliente_nome}</span>}
              {pedidoNumero && <span className="os-v-value tag-pedido" style={{ marginLeft: 8 }}>{pedidoNumero}</span>}
              {osData.item_ambiente && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>· {osData.item_ambiente}</span>}
            </p>
          </div>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={onVoltar} disabled={salvando}>Cancelar</button>
          <button className="os-btn os-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar Ficha de Confecção"}
          </button>
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}
      {sucesso && <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>}

      <div className="os-page-body">
        <div className="os-layout-cols">
          <div className="os-col-left">
            <div className="os-section-title">Dados do Pedido</div>
            <div className="os-card-visual">
              <div className="os-visual-field"><span className="os-v-label">Cliente</span><span className="os-v-value">{osData.cliente_nome || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Pedido</span><span className="os-v-value tag-pedido">{pedidoNumero}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Vendedor</span><span className="os-v-value">{osData.consultor_nome || "—"}</span></div>
              <hr className="os-divider" />
              <div className="os-visual-field"><span className="os-v-label">Ambiente</span><span className="os-v-value highlight-text">{osData.item_ambiente || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Item</span><span className="os-v-value">{osData.item_descricao || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Medidas venda</span><span className="os-v-value spec-box">{osData.item_medidas || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Tecido venda</span><span className="os-v-value spec-box">{osData.item_referencia || ""}{osData.item_cor ? ` (${osData.item_cor})` : ""}</span></div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Cálculos (atualizam ao digitar)</div>
              <div className="os-field"><label>Clipes</label><div className="os-v-value spec-box">{calculo.clipes === "" ? "—" : calculo.clipes}</div></div>
              <div className="os-field"><label>Quant. tecido cortina</label><div className="os-v-value spec-box">{calculo.quantTecidoCortina || "—"}</div></div>
              <div className="os-field"><label>Quant. entretela</label><div className="os-v-value spec-box">{calculo.quantEntretela || "—"}</div></div>
              <div className="os-field"><label>Quant. para barrado</label><div className="os-v-value spec-box">{calculo.quantBarrado || "—"}</div></div>
              <div className="os-field"><label>Sobra de barrado</label><div className="os-v-value spec-box">{calculo.sobraBarrado || "—"}</div></div>
            </div>
          </div>

          <div className="os-col-right-form">
            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Especificação da Cortina (Obrigatório)</div>
              <div className="os-grid-3">
                <div className="os-field">
                  <label>Cortina feita por</label>
                  <select value={dados.feitaPor} onChange={(e) => setCampo("feitaPor", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="POR ALTURA">Por altura</option>
                    <option value="POR LARGURA">Por largura</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Espaçador</label>
                  <select value={dados.espacador} onChange={(e) => setCampo("espacador", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="3,6">3,6</option>
                    <option value="5,00">5,00</option>
                    <option value="7,00">7,00</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select value={dados.tipoWave} onChange={(e) => setCampo("tipoWave", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Abertura</label>
                  <select value={dados.abertura} onChange={(e) => setCampo("abertura", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="COM ABERTURA">Com abertura</option>
                    <option value="SEM ABERTURA">Sem abertura</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Componente (trilho)</label>
                  <select value={dados.componente} onChange={(e) => setCampo("componente", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="Trilho Simples branco">Trilho Simples branco</option>
                    <option value="Trilho Simples Preto">Trilho Simples Preto</option>
                    <option value="Trilho SLIM branco">Trilho SLIM branco</option>
                    <option value="Trilho SLIM cromado">Trilho SLIM cromado</option>
                    <option value="Trilho Motorizado SOMFY">Trilho Motorizado SOMFY</option>
                    <option value="Trilho Motorizado ADORNIE">Trilho Motorizado ADORNIE</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Lado do motor</label>
                  <input type="text" placeholder="Ex: Esquerdo" value={dados.ladoMotor} onChange={(e) => setCampo("ladoMotor", e.target.value)} />
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Largura do trilho (m)</label>
                  <input type="text" placeholder="Ex: 4,92" value={dados.larguraTrilho} onChange={(e) => setCampo("larguraTrilho", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Largura do tecido (m)</label>
                  <input type="text" placeholder="Ex: 3,30" value={dados.larguraTecido} onChange={(e) => setCampo("larguraTecido", e.target.value)} className="input-highlight" />
                </div>
              </div>

              <div className="os-field">
                <label>Nome do tecido</label>
                <input type="text" placeholder="Nome/código do tecido" value={dados.nomeTecido} onChange={(e) => setCampo("nomeTecido", e.target.value)} />
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Altura da cortina (m)</label>
                  <input type="text" placeholder="Ex: 2,84" value={dados.alturaCortina} onChange={(e) => setCampo("alturaCortina", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Vendeu barra aplicada?</label>
                  <select value={dados.vendeuBarraAplicada} onChange={(e) => setCampo("vendeuBarraAplicada", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="SIM">Sim</option>
                    <option value="NÃO">Não</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Altura da barra (m)</label>
                  <input type="text" placeholder="Ex: 0,50" value={dados.alturaBarra} onChange={(e) => setCampo("alturaBarra", e.target.value)} disabled={dados.vendeuBarraAplicada === "SIM"} />
                </div>
                <div className="os-field">
                  <label>Quant. tômas</label>
                  <input type="text" placeholder="0" value={dados.quantTomas} onChange={(e) => setCampo("quantTomas", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Tamanho da tôma (m)</label>
                  <input type="text" placeholder="0" value={dados.tamanhoTomas} onChange={(e) => setCampo("tamanhoTomas", e.target.value)} />
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Cortina lado a lado</label>
                  <select value={dados.cortinaLadoALado} onChange={(e) => setCampo("cortinaLadoALado", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="SIM">Sim</option>
                    <option value="NÃO">Não</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Detalhe da barra</label>
                  <input type="text" placeholder="Anotações sobre a barra" value={dados.detalheBarra} onChange={(e) => setCampo("detalheBarra", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx
git commit -m "feat(confeccao): tela Ficha de Confecção de Cortina/Xale com cálculo ao vivo"
```

---

## Task 13: Tela `FichaConfeccaoForro.jsx`

**Files:**
- Create: `frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx`

**Interfaces:**
- Consumes: `api`, `calcularQuantForro` (Task 10).
- Produces: componente `FichaConfeccaoForro({ osData, onSalvar, onVoltar })`, mesmo contrato de props que `FichaConfeccaoCortina`. Consumido pela Task 14.

- [ ] **Step 1: Criar o componente**

```jsx
import { useMemo, useState } from "react";
import { api } from "../../services/api";
import { calcularQuantForro } from "../../utils/calculoCortina";
import "./OrdemServicoModal.css";

const VAZIO = {
  tecidoForro: "", tecidoTipo: "", franzimento: "", forroCosturado: "",
  larguraForro: "", alturaBarraForro: "",
  espacador: "", larguraTrilho: "", tipoWave: "", abertura: "", alturaCortina: "",
};

function paraNumero(valor) {
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function FichaConfeccaoForro({ osData, onSalvar, onVoltar }) {
  const [dados, setDados] = useState({ ...VAZIO, ...(osData.dados_confeccao || {}) });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  function setCampo(chave, valor) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  const quantForro = useMemo(() => {
    return calcularQuantForro({
      abertura: dados.abertura,
      espacador: dados.espacador,
      larguraTrilho: paraNumero(dados.larguraTrilho),
      tipoWave: dados.tipoWave,
      tecidoForro: dados.tecidoForro,
      larguraForro: paraNumero(dados.larguraForro),
      alturaCortina: paraNumero(dados.alturaCortina),
      alturaBarraForro: paraNumero(dados.alturaBarraForro),
      forroCosturado: dados.forroCosturado,
      franzimento: paraNumero(dados.franzimento),
    });
  }, [dados]);

  async function salvar() {
    setErro("");
    setSucesso("");

    if (!dados.tecidoForro?.trim()) return setErro("Tecido do forro é obrigatório.");
    if (!dados.larguraForro || paraNumero(dados.larguraForro) <= 0) {
      return setErro("Largura do forro é obrigatória e deve ser maior que zero.");
    }
    if (!dados.forroCosturado) return setErro('Campo "Forro costurado" é obrigatório.');

    setSalvando(true);
    try {
      await api.put(`/os/${osData.id}/confeccao`, dados);
      setSucesso("Ficha de Confecção salva com sucesso!");
      setTimeout(onSalvar, 1200);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ficha de confecção.");
    } finally {
      setSalvando(false);
    }
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;

  return (
    <div className="ek-page os-page">
      <div className="os-page-header">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={onVoltar}>← Voltar</button>
          <div>
            <h1 className="os-page-title">Ficha de Confecção — Forro</h1>
            <p className="os-page-subtitle">
              {osData.cliente_nome && <span>{osData.cliente_nome}</span>}
              {pedidoNumero && <span className="os-v-value tag-pedido" style={{ marginLeft: 8 }}>{pedidoNumero}</span>}
              {osData.item_ambiente && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>· {osData.item_ambiente}</span>}
            </p>
          </div>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={onVoltar} disabled={salvando}>Cancelar</button>
          <button className="os-btn os-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar Ficha de Confecção"}
          </button>
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}
      {sucesso && <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>}

      <div className="os-page-body">
        <div className="os-layout-cols">
          <div className="os-col-left">
            <div className="os-section-title">Dados do Pedido</div>
            <div className="os-card-visual">
              <div className="os-visual-field"><span className="os-v-label">Cliente</span><span className="os-v-value">{osData.cliente_nome || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Pedido</span><span className="os-v-value tag-pedido">{pedidoNumero}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Ambiente</span><span className="os-v-value highlight-text">{osData.item_ambiente || "—"}</span></div>
              <div className="os-visual-field"><span className="os-v-label">Item</span><span className="os-v-value">{osData.item_descricao || "—"}</span></div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Cálculo (atualiza ao digitar)</div>
              <div className="os-field"><label>Quant. forro</label><div className="os-v-value spec-box">{quantForro || "—"}</div></div>
            </div>
          </div>

          <div className="os-col-right-form">
            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Especificação do Forro (Obrigatório)</div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>Tecido do forro</label>
                  <input type="text" placeholder="Nome/código do tecido" value={dados.tecidoForro} onChange={(e) => setCampo("tecidoForro", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Tipo de tecido</label>
                  <select value={dados.tecidoTipo} onChange={(e) => setCampo("tecidoTipo", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="Microfibra">Microfibra</option>
                    <option value="Blackout">Blackout</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Forro costurado</label>
                  <select value={dados.forroCosturado} onChange={(e) => setCampo("forroCosturado", e.target.value)} className="input-highlight">
                    <option value="">— Selecione —</option>
                    <option value="JUNTO">Junto</option>
                    <option value="SEPARADO">Separado</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Franzimento</label>
                  <input type="text" placeholder="Só se SEPARADO" value={dados.franzimento} onChange={(e) => setCampo("franzimento", e.target.value)} disabled={dados.forroCosturado !== "SEPARADO"} />
                </div>
              </div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Largura do forro (m)</label>
                  <input type="text" placeholder="Ex: 3,00" value={dados.larguraForro} onChange={(e) => setCampo("larguraForro", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Altura barra do forro (m)</label>
                  <input type="text" placeholder="0" value={dados.alturaBarraForro} onChange={(e) => setCampo("alturaBarraForro", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Referência da Cortina (para o cálculo)</div>
              <div className="os-grid-3">
                <div className="os-field">
                  <label>Espaçador</label>
                  <select value={dados.espacador} onChange={(e) => setCampo("espacador", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="3,6">3,6</option>
                    <option value="5,00">5,00</option>
                    <option value="7,00">7,00</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Tipo wave</label>
                  <select value={dados.tipoWave} onChange={(e) => setCampo("tipoWave", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="P">P</option>
                    <option value="M">M</option>
                    <option value="G">G</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Abertura</label>
                  <select value={dados.abertura} onChange={(e) => setCampo("abertura", e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="COM ABERTURA">Com abertura</option>
                    <option value="SEM ABERTURA">Sem abertura</option>
                  </select>
                </div>
              </div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>Largura do trilho (m)</label>
                  <input type="text" placeholder="Ex: 4,92" value={dados.larguraTrilho} onChange={(e) => setCampo("larguraTrilho", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Altura da cortina (m)</label>
                  <input type="text" placeholder="Ex: 2,84" value={dados.alturaCortina} onChange={(e) => setCampo("alturaCortina", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx
git commit -m "feat(confeccao): tela Ficha de Confecção de Forro com cálculo ao vivo"
```

---

## Task 14: Router `FichaConfeccao.jsx` + rota em `App.jsx`

**Files:**
- Create: `frontend-web/src/pages/pedidos/FichaConfeccao.jsx`
- Modify: `frontend-web/src/App.jsx:26` (import lazy) e `:100` (rota)

**Interfaces:**
- Consumes: `api`, `FichaConfeccaoCortina` (Task 12), `FichaConfeccaoForro` (Task 13).
- Produces: rota `/pedidos/os/:osId/confeccao`, navegada pelas Tasks 17 e 18.

- [ ] **Step 1: Criar o componente roteador**

```jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import FichaConfeccaoCortina from "./FichaConfeccaoCortina";
import FichaConfeccaoForro from "./FichaConfeccaoForro";
import "./OrdemServicoModal.css";

export default function FichaConfeccao() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const voltarAgendamentoId = location.state?.voltarConferenciaAgendamentoId || null;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [osData, setOsData] = useState(null);

  useEffect(() => { carregar(); }, [osId]);

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  function voltar() {
    if (voltarAgendamentoId) {
      navigate("/agendamentos", { state: { reabrirConferenciaAgendamentoId: voltarAgendamentoId } });
    } else {
      navigate("/pedidos");
    }
  }

  if (loading) {
    return (
      <div className="ek-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="os-spinner" />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando ficha de confecção...</p>
        </div>
      </div>
    );
  }

  if (erro || !osData) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger">{erro || "Ordem de serviço não encontrada."}</div>
        <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
      </div>
    );
  }

  if (osData.tipo === "forro") {
    return <FichaConfeccaoForro osData={osData} onSalvar={voltar} onVoltar={voltar} />;
  }
  return <FichaConfeccaoCortina osData={osData} onSalvar={voltar} onVoltar={voltar} />;
}
```

- [ ] **Step 2: Registrar a rota em `App.jsx`**

Na linha 26 (bloco de imports lazy, logo após `OrdemServicoPage`), adicionar:

```js
const FichaConfeccao         = lazy(() => import("./pages/pedidos/FichaConfeccao"));
```

Na linha 100 (logo após `<Route path="/pedidos/os/:osId" element={<OrdemServicoPage />} />`), adicionar:

```jsx
                  <Route path="/pedidos/os/:osId/confeccao" element={<FichaConfeccao />} />
```

- [ ] **Step 3: Rodar o build para garantir que não há erro de import/JSX**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros (sem warnings de import quebrado para `FichaConfeccao`, `FichaConfeccaoCortina`, `FichaConfeccaoForro`).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccao.jsx frontend-web/src/App.jsx
git commit -m "feat(confeccao): rota /pedidos/os/:osId/confeccao e roteamento cortina/forro"
```

---

## Task 15: Reescrever `OrdemServicoPage.jsx` → Ficha de Conferência Técnica

**Files:**
- Modify: `frontend-web/src/pages/pedidos/OrdemServicoPage.jsx` (reescrita completa do arquivo)

**Interfaces:**
- Produces: a rota `/pedidos/os/:osId` (já registrada em `App.jsx:100`, sem mudança de path) passa a exigir `osData.dados_confeccao` antes de exibir o formulário técnico; mostra um painel somente-leitura com os dados de confecção.

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import "./OrdemServicoModal.css";

function CanvasDraw({ title, width = 360, height = 180, onSave, value }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = value;
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => { e.preventDefault(); setIsDrawing(true); lastPos.current = getPos(e); };
  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };
  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    onSave(canvasRef.current.toDataURL("image/png"));
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onSave("");
  };

  return (
    <div className="os-canvas-container">
      <div className="os-canvas-header">
        <label>{title}</label>
        <div className="os-canvas-controls">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Cor" />
          <select value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}>
            <option value={2}>Fino</option>
            <option value={4}>Médio</option>
            <option value={8}>Grosso</option>
          </select>
          <button type="button" className="os-btn-clear" onClick={clearCanvas}>Limpar</button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

const DADOS_TECNICOS_VAZIO = {
  largura: "", altura_esq: "", altura_meio: "", altura_dir: "",
  fixacao: "parede", lado_motor: "n/a", voltagem: "sem_motor",
  cortineiro: "não", tamanho_cortineiro: "", afastamento_suportes: "",
  responsavel_conferencia: "", data_conferencia: new Date().toISOString().slice(0, 10),
  acompanhado_por: "", esboco_tecnico: "", assinatura_tecnico: "", assinatura_cliente: "",
};

function painelConfeccao(dc, tipo) {
  if (!dc) return [];
  if (tipo === "forro") {
    return [
      ["Tecido do forro", dc.tecidoForro],
      ["Tipo de tecido", dc.tecidoTipo],
      ["Forro costurado", dc.forroCosturado],
      ["Largura do forro", dc.larguraForro],
      ["Largura do trilho", dc.larguraTrilho],
      ["Tipo wave", dc.tipoWave],
      ["Espaçador", dc.espacador],
    ];
  }
  return [
    ["Cortina feita por", dc.feitaPor],
    ["Espaçador", dc.espacador],
    ["Tipo wave", dc.tipoWave],
    ["Abertura", dc.abertura],
    ["Componente", dc.componente],
    ["Largura do trilho", dc.larguraTrilho],
    ["Largura do tecido", dc.larguraTecido],
    ["Nome do tecido", dc.nomeTecido],
    ["Altura da cortina", dc.alturaCortina],
    ["Vendeu barra aplicada", dc.vendeuBarraAplicada],
  ];
}

export default function OrdemServicoPage() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const voltarAgendamentoId = location.state?.voltarConferenciaAgendamentoId || null;

  function voltar() {
    if (voltarAgendamentoId) {
      navigate("/agendamentos", { state: { reabrirConferenciaAgendamentoId: voltarAgendamentoId } });
    } else {
      navigate("/pedidos");
    }
  }

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [osData, setOsData] = useState(null);
  const [dadosTecnicos, setDadosTecnicos] = useState(DADOS_TECNICOS_VAZIO);

  useEffect(() => { carregarOS(); }, [osId]);

  async function carregarOS() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
      if (res.dados_tecnicos) {
        setDadosTecnicos((prev) => ({ ...prev, ...res.dados_tecnicos }));
      } else {
        setDadosTecnicos((prev) => ({ ...prev, responsavel_conferencia: res.consultor_nome || "" }));
      }
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setDadosTecnicos((prev) => ({ ...prev, [k]: v }));
  }

  async function salvarOS() {
    setErro("");
    setSucesso("");

    const { largura, altura_esq, altura_meio, altura_dir, responsavel_conferencia, data_conferencia, assinatura_tecnico } = dadosTecnicos;
    const parseNum = (val) => parseFloat(String(val).replace(",", "."));

    if (!largura || isNaN(parseNum(largura)) || parseNum(largura) <= 0) {
      setErro("A Largura Técnica Real é obrigatória e deve ser maior que zero.");
      return;
    }
    if (!altura_esq || isNaN(parseNum(altura_esq)) || parseNum(altura_esq) <= 0) {
      setErro("A Altura Esquerda Técnica Real é obrigatória.");
      return;
    }
    if (!altura_meio || isNaN(parseNum(altura_meio)) || parseNum(altura_meio) <= 0) {
      setErro("A Altura do Meio Técnica Real é obrigatória.");
      return;
    }
    if (!altura_dir || isNaN(parseNum(altura_dir)) || parseNum(altura_dir) <= 0) {
      setErro("A Altura Direita Técnica Real é obrigatória.");
      return;
    }
    if (!responsavel_conferencia?.trim()) {
      setErro("O Responsável pela Conferência é obrigatório.");
      return;
    }
    if (!data_conferencia) {
      setErro("A data da Conferência é obrigatória.");
      return;
    }
    if (!assinatura_tecnico?.trim()) {
      setErro("A Assinatura Digital do Técnico é obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      await api.put(`/os/${osId}`, dadosTecnicos);
      setSucesso("Ordem de serviço salva com sucesso!");
      setTimeout(voltar, 1400);
    } catch (err) {
      setErro(err.message || "Erro ao salvar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <div className="ek-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="os-spinner" />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando ficha técnica...</p>
        </div>
      </div>
    );
  }

  if (!osData) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger">{erro || "Ordem de serviço não encontrada."}</div>
        <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
      </div>
    );
  }

  if (!osData.dados_confeccao) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger" style={{ marginBottom: 16 }}>
          Aguardando a Ficha de Confecção. A conferência técnica só pode ser preenchida depois que a consultora preencher a ficha de confecção deste item.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
          <button
            className="os-btn os-btn-primary"
            onClick={() => navigate(`/pedidos/os/${osId}/confeccao`, { state: { voltarConferenciaAgendamentoId: voltarAgendamentoId } })}
          >
            Preencher Ficha de Confecção
          </button>
        </div>
      </div>
    );
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;
  const camposConfeccao = painelConfeccao(osData.dados_confeccao, osData.tipo);

  return (
    <div className="ek-page os-page">
      <div className="os-page-header">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={voltar}>← Voltar</button>
          <div>
            <h1 className="os-page-title">Conferência Técnica</h1>
            <p className="os-page-subtitle">
              {osData.cliente_nome && <span>{osData.cliente_nome}</span>}
              {pedidoNumero && <span className="os-v-value tag-pedido" style={{ marginLeft: 8 }}>{pedidoNumero}</span>}
              {osData.item_ambiente && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>· {osData.item_ambiente}</span>}
            </p>
          </div>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={voltar} disabled={salvando}>Cancelar</button>
          <button className="os-btn os-btn-primary" onClick={salvarOS} disabled={salvando}>
            {salvando ? "Salvando..." : "✓ Salvar OS"}
          </button>
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}
      {sucesso && <div className="os-alert os-alert-success" style={{ margin: "0 0 16px" }}>{sucesso}</div>}

      <div className="os-page-body">
        <div className="os-layout-cols">
          <div className="os-col-left">
            <div className="os-section-title">Ficha de Confecção (referência)</div>
            <div className="os-card-visual">
              {camposConfeccao.map(([label, valor]) => (
                <div className="os-visual-field" key={label}>
                  <span className="os-v-label">{label}</span>
                  <span className="os-v-value spec-box">{valor || "—"}</span>
                </div>
              ))}
            </div>

            <div className="os-esboco-section">
              <CanvasDraw
                title="Esboço Técnico"
                width={380}
                height={260}
                value={dadosTecnicos.esboco_tecnico}
                onSave={(val) => setField("esboco_tecnico", val)}
              />
            </div>
          </div>

          <div className="os-col-right-form">
            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Medidas Técnicas Reais (Obrigatório)</div>
              <div className="os-medidas-reais-grid">
                {[
                  { key: "largura", label: "Largura Real (m)", placeholder: "Ex: 4,19" },
                  { key: "altura_esq", label: "Altura Esq. (m)", placeholder: "Ex: 3,00" },
                  { key: "altura_meio", label: "Altura Meio (m)", placeholder: "Ex: 3,00" },
                  { key: "altura_dir", label: "Altura Dir. (m)", placeholder: "Ex: 3,00" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="os-field">
                    <label>{label}</label>
                    <input type="text" placeholder={placeholder} value={dadosTecnicos[key]} onChange={(e) => setField(key, e.target.value)} className="input-highlight" />
                  </div>
                ))}
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Confirmação de Medida Técnica (Obrigatório)</div>

              <div className="os-grid-2">
                <div className="os-field">
                  <label>Responsável Conf.</label>
                  <input type="text" placeholder="Nome" value={dadosTecnicos.responsavel_conferencia} onChange={(e) => setField("responsavel_conferencia", e.target.value)} className="input-highlight" />
                </div>
                <div className="os-field">
                  <label>Data Conferência</label>
                  <input type="date" value={dadosTecnicos.data_conferencia} onChange={(e) => setField("data_conferencia", e.target.value)} className="input-highlight" />
                </div>
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Fixação</label>
                  <select value={dadosTecnicos.fixacao} onChange={(e) => setField("fixacao", e.target.value)}>
                    <option value="parede">Parede</option>
                    <option value="teto">Teto</option>
                    <option value="vão">Vão</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Lado Motor</label>
                  <select value={dadosTecnicos.lado_motor} onChange={(e) => setField("lado_motor", e.target.value)}>
                    <option value="n/a">Sem motor</option>
                    <option value="esquerdo">Esquerdo</option>
                    <option value="direito">Direito</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Voltagem</label>
                  <select value={dadosTecnicos.voltagem} onChange={(e) => setField("voltagem", e.target.value)}>
                    <option value="sem_motor">Sem Motor</option>
                    <option value="110v">110V</option>
                    <option value="220v">220V</option>
                  </select>
                </div>
              </div>

              <div className="os-grid-3">
                <div className="os-field">
                  <label>Cortineiro</label>
                  <select value={dadosTecnicos.cortineiro} onChange={(e) => setField("cortineiro", e.target.value)}>
                    <option value="não">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>
                <div className="os-field">
                  <label>Tamanho Cortineiro</label>
                  <input type="text" placeholder="Ex: 30cm x 15cm" value={dadosTecnicos.tamanho_cortineiro} disabled={dadosTecnicos.cortineiro === "não"} onChange={(e) => setField("tamanho_cortineiro", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Afastamento Sup. (cm)</label>
                  <input type="text" placeholder="Ex: 8 cm" value={dadosTecnicos.afastamento_suportes} onChange={(e) => setField("afastamento_suportes", e.target.value)} />
                </div>
              </div>

              <div className="os-field">
                <label>Acompanhado por</label>
                <input type="text" placeholder="Nome do cliente/arquiteto que acompanhou" value={dadosTecnicos.acompanhado_por} onChange={(e) => setField("acompanhado_por", e.target.value)} />
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title mandatory-title">Assinaturas Digitais</div>
              <div className="os-signatures-layout">
                <CanvasDraw
                  title="Assinatura do Técnico (Obrigatória)"
                  width={420}
                  height={160}
                  value={dadosTecnicos.assinatura_tecnico}
                  onSave={(val) => setField("assinatura_tecnico", val)}
                />
                <CanvasDraw
                  title="Visto do Cliente (Opcional)"
                  width={420}
                  height={160}
                  value={dadosTecnicos.assinatura_cliente}
                  onSave={(val) => setField("assinatura_cliente", val)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar o build**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/OrdemServicoPage.jsx
git commit -m "refactor(os): OrdemServicoPage vira Ficha de Conferência Técnica, com gate e painel de referência"
```

---

## Task 16: Remover `OrdemServicoModal.jsx` (código morto)

**Files:**
- Delete: `frontend-web/src/pages/pedidos/OrdemServicoModal.jsx`

**Interfaces:**
- N/A — confirmado na pesquisa inicial que nenhum outro arquivo importa este componente.

- [ ] **Step 1: Confirmar que não há import ativo**

Run: `grep -rn "OrdemServicoModal" frontend-web/src --include=*.jsx --include=*.js | grep -v "pages/pedidos/OrdemServicoModal.jsx"`
Expected: nenhuma linha (se aparecer algum import em outro arquivo, **pare** — significa que o componente é usado e não deve ser removido nesta task).

- [ ] **Step 2: Remover o arquivo**

```bash
git rm frontend-web/src/pages/pedidos/OrdemServicoModal.jsx
```

(O CSS `OrdemServicoModal.css` **não** é removido — continua em uso por `OrdemServicoPage.jsx`, `FichaConfeccaoCortina.jsx`, `FichaConfeccaoForro.jsx` e `FichaConfeccao.jsx`.)

- [ ] **Step 3: Rodar o build**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros (sem import quebrado apontando para o arquivo removido).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(os): remove OrdemServicoModal.jsx (código morto, sem nenhum import ativo)"
```

---

## Task 17: `EtapaConferencia.jsx` — botão por estado da ficha

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx`

**Interfaces:**
- Consumes: `acaoFichaConferencia`, `abrirOsDoItem` (Task 11); `item.tipo_confeccao`/`item.confeccao_preenchida` (Task 9).

- [ ] **Step 1: Atualizar os imports do topo do arquivo**

Trocar a linha 1-2:

```jsx
import React from "react";
import { useNavigate } from "react-router-dom";
```

por:

```jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { acaoFichaConferencia, abrirOsDoItem } from "../../../../utils/fichaConferencia";
```

- [ ] **Step 2: Adicionar estado de loading dentro do componente**

Logo após a linha `const navigate = useNavigate();` (linha 11), adicionar:

```jsx
  const [criandoId, setCriandoId] = useState(null);
```

- [ ] **Step 3: Substituir o bloco de itens (linhas 71-87 do arquivo original)**

Trocar:

```jsx
              {(g.itens || []).length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.itens.map((item) => (
                    <div key={item.pedido_item_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>{item.descricao}</div>
                      {item.ficha_preenchida ? (
                        <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => navigate(`/pedidos/os/${item.ordem_servico_id}`)}>
                          Visualizar Ficha
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Aguardando técnico</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
```

por:

```jsx
              {(g.itens || []).length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.itens.map((item) => {
                    const acao = acaoFichaConferencia(item);
                    return (
                      <div key={item.pedido_item_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                        <div style={{ fontSize: 13 }}>{item.descricao}</div>
                        {acao ? (
                          <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                            disabled={criandoId === item.pedido_item_id}
                            onClick={async () => {
                              setCriandoId(item.pedido_item_id);
                              try {
                                const osId = await abrirOsDoItem(item);
                                navigate(acao.rota === "confeccao" ? `/pedidos/os/${osId}/confeccao` : `/pedidos/os/${osId}`);
                              } finally {
                                setCriandoId(null);
                              }
                            }}>
                            {criandoId === item.pedido_item_id ? "Abrindo..." : acao.label}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Sem ficha de confecção</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
```

- [ ] **Step 4: Rodar o build**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx
git commit -m "feat(fluxo-pedido): EtapaConferencia abre Ficha de Confecção ou Conferência Técnica por estado"
```

---

## Task 18: `Agendamentos.jsx` — `ConferenciaItensModal` com o mesmo estado

**Files:**
- Modify: `frontend-web/src/pages/agendamentos/Agendamentos.jsx`

**Interfaces:**
- Consumes: `acaoFichaConferencia`, `abrirOsDoItem` (Task 11).
- Produces: `onAbrirOS` passa a receber um terceiro argumento `rota` (`"tecnica"` ou `"confeccao"`).

- [ ] **Step 1: Adicionar o import**

Logo após a linha 8 (`import { faixaHora } from "../../utils/horario";`), adicionar:

```js
import { acaoFichaConferencia, abrirOsDoItem } from "../../utils/fichaConferencia";
```

- [ ] **Step 2: Atualizar `onAbrirOS` para decidir a rota**

Trocar (linhas 1195-1197):

```jsx
          onAbrirOS={(osId, agendamentoId) => {
            navigate(`/pedidos/os/${osId}`, { state: { voltarConferenciaAgendamentoId: agendamentoId } });
          }}
```

por:

```jsx
          onAbrirOS={(osId, agendamentoId, rota) => {
            const caminho = rota === "confeccao" ? `/pedidos/os/${osId}/confeccao` : `/pedidos/os/${osId}`;
            navigate(caminho, { state: { voltarConferenciaAgendamentoId: agendamentoId } });
          }}
```

- [ ] **Step 3: Adicionar estado de loading em `ConferenciaItensModal`**

Logo após a linha `const [loading, setLoading] = useState(true);` dentro de `ConferenciaItensModal` (linha 2764), adicionar:

```jsx
  const [criandoId, setCriandoId] = useState(null);
```

- [ ] **Step 4: Substituir o botão por item**

Trocar (linhas 2798-2819):

```jsx
            itens.map((item) => (
              <button
                key={item.pedido_item_id}
                onClick={() => item.ordem_servico_id && onAbrirOS(item.ordem_servico_id, ag.id)}
                disabled={!item.ordem_servico_id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  width: "100%", textAlign: "left", padding: "12px 14px",
                  background: "var(--color-surface-soft)", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)", cursor: item.ordem_servico_id ? "pointer" : "not-allowed",
                  opacity: item.ordem_servico_id ? 1 : 0.6, color: "var(--color-text)",
                }}
              >
                <span>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>{item.descricao}</div>
                  {item.ambiente && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.ambiente}</div>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: item.ficha_preenchida ? "#22c55e" : "#94a3b8" }}>
                  {item.ficha_preenchida ? "Conferido" : "Pendente"}
                </span>
              </button>
            ))
```

por:

```jsx
            itens.map((item) => {
              const acao = acaoFichaConferencia(item);
              const ocupado = criandoId === item.pedido_item_id;
              return (
                <button
                  key={item.pedido_item_id}
                  disabled={!acao || ocupado}
                  onClick={async () => {
                    if (!acao) return;
                    setCriandoId(item.pedido_item_id);
                    try {
                      const osId = await abrirOsDoItem(item);
                      onAbrirOS(osId, ag.id, acao.rota);
                    } finally {
                      setCriandoId(null);
                    }
                  }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    width: "100%", textAlign: "left", padding: "12px 14px",
                    background: "var(--color-surface-soft)", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)", cursor: acao && !ocupado ? "pointer" : "not-allowed",
                    opacity: acao ? 1 : 0.6, color: "var(--color-text)",
                  }}
                >
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>{item.descricao}</div>
                    {item.ambiente && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.ambiente}</div>}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.ficha_preenchida ? "#22c55e" : "#94a3b8" }}>
                    {ocupado ? "Abrindo..." : (acao ? acao.label : "Sem ficha de confecção")}
                  </span>
                </button>
              );
            })
```

- [ ] **Step 5: Rodar o build**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/agendamentos/Agendamentos.jsx
git commit -m "feat(agendamentos): ConferenciaItensModal abre Ficha de Confecção ou Conferência Técnica por estado"
```

---

## Task 19: Verificação manual no navegador

**Files:** nenhum (somente verificação).

- [ ] **Step 1: Aplicar as migrations das Tasks 1 e 2 no banco local** (se ainda não aplicadas)

- [ ] **Step 2: Subir backend e frontend-web**

Run: `cd backend && npm run dev` e, em outro terminal, `cd frontend-web && npm run dev`.

- [ ] **Step 3: Criar (ou reaproveitar) um pedido com um item de categoria "Cortinas" e um item de categoria "Forros"**

- [ ] **Step 4: Pela tela de Agendamentos → agendamento do tipo Conferência → "Itens para conferência", clicar em "Preencher Ficha de Confecção" no item de Cortina**

Expected: abre `/pedidos/os/:id/confeccao` com o formulário de Cortina; cálculos (`Clipes`, `Quant. tecido cortina` etc.) mostram "—" com os campos vazios, e atualizam ao vivo ao preencher `Largura do trilho`, `Espaçador`, `Tipo wave`, `Abertura`, `Altura da cortina`, `Largura do tecido`, `Cortina feita por`.

- [ ] **Step 5: Preencher os campos do caso de teste da planilha e confirmar os valores**

Preencher: Cortina feita por = "Por altura", Espaçador = "7,00", Tipo wave = "G", Abertura = "Sem abertura", Largura do trilho = 4,92, Largura do tecido = 3,30, Altura da cortina = 2,84, Vendeu barra aplicada = "Não", Altura da barra = 0,50.
Expected: Clipes = 74; Quant. tecido cortina = "4 alturas x 3,45 = 14,00 mts"; Quant. entretela = "12,06 mts"; Sobra de barrado = "VENDER BARRADO" — batendo com o self-test da Task 10.

- [ ] **Step 6: Salvar a Ficha de Confecção e voltar para a lista de conferência**

Expected: o item passa a mostrar o botão "Conferência Técnica" em vez de "Preencher Ficha de Confecção".

- [ ] **Step 7: Repetir os passos 4-6 para o item de Forro**, preenchendo Tecido do forro, Forro costurado, Largura do forro.

- [ ] **Step 8: Clicar em "Conferência Técnica" no item de Cortina**

Expected: abre `/pedidos/os/:id` mostrando o painel "Ficha de Confecção (referência)" com os valores salvos no passo 5, e o formulário de Medidas Técnicas Reais abaixo.

- [ ] **Step 9: Tentar acessar `/pedidos/os/:id` diretamente para uma OS sem `dados_confeccao`** (criar um terceiro item de Cortina sem preencher a ficha)

Expected: tela bloqueada com a mensagem "Aguardando a Ficha de Confecção" e o botão "Preencher Ficha de Confecção".

- [ ] **Step 10: Preencher e salvar a Conferência Técnica do item de Cortina**

Expected: salva com sucesso; reabrindo o item na lista, mostra "Visualizar Ficha".

- [ ] **Step 11: Repetir os passos 4-10 pela tela `PedidoFluxo` → Etapa 2 (Conferência)**, confirmando que os mesmos botões/estados aparecem ali.

- [ ] **Step 12: Aplicar as migrations das Tasks 1 e 2 no Supabase** (se ainda não aplicadas) e repetir um teste rápido (passos 4-6) apontando o frontend para o Supabase, para confirmar que a migration foi aplicada corretamente nesse ambiente também.

