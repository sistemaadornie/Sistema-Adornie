# Vínculo Controle ↔ Cortina/Persiana (manual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar a categoria "Controles" como vinculável e "Persianas" como receptora de vínculos no modal manual "Vincular Itens", sem que "Persianas" passe a participar do motor de vínculo automático da importação (subprojeto 3).

**Architecture:** Uma migration adiciona a coluna `categorias.recebe_vinculo_automatico` e ajusta os flags (`vinculavel`/`recebe_vinculos`/`recebe_vinculo_automatico`) para Controles/Persianas/Cortinas/Forros. `vinculoAutomaticoService.js` passa a usar `recebe_vinculo_automatico` (em vez de `recebe_vinculos`) para decidir quem é "principal" no motor automático. O modal manual e a rota de vínculo continuam usando `vinculavel`/`recebe_vinculos` sem alterações de código.

**Tech Stack:** Node.js, PostgreSQL, Jest.

---

### Task 1: Migration — nova coluna e flags de categorias

**Files:**
- Create: `backend/src/database/migrations/categorias_vinculo_controle_persiana.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Crie `backend/src/database/migrations/categorias_vinculo_controle_persiana.sql` com o conteúdo:

```sql
-- categorias_vinculo_controle_persiana.sql
-- Habilita Controles como vinculável e Persianas como receptora de vínculo manual.
-- Cortinas/Forros passam a ter recebe_vinculo_automatico=true explicitamente,
-- preservando o comportamento do motor automático do subprojeto 3.
BEGIN;

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculo_automatico BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET recebe_vinculo_automatico = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'controles';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) = 'persianas';

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/database/migrations/categorias_vinculo_controle_persiana.sql
git commit -m "feat(pedidos): migration habilita controles/persianas para vinculo manual"
```

---

### Task 2: `vinculoAutomaticoService` — flag `recebe_vinculo_automatico`

**Files:**
- Modify: `backend/src/services/vinculoAutomaticoService.js`
- Test: `backend/src/__tests__/vinculoAutomaticoService.test.js`

**Contexto:** `encontrarPares` hoje decide quem é "principal" (recebe vínculo automático) checando `it.recebe_vinculos`. Após a Task 1, "Persianas" também terá `recebe_vinculos=true` (para o modal manual), mas **não** deve ser elegível no motor automático. `encontrarPares` precisa passar a checar `it.recebe_vinculo_automatico` em vez de `it.recebe_vinculos`.

- [ ] **Step 1: Atualizar o helper `item()` e os fixtures existentes do teste (escreve os testes que vão falhar)**

Abra `backend/src/__tests__/vinculoAutomaticoService.test.js`. Substitua o helper `item()` (linhas 6-16) por:

```js
function item(overrides) {
  return {
    id: 1,
    ambiente: 'Sala',
    largura: '1.5000',
    vinculavel: false,
    recebe_vinculos: false,
    recebe_vinculo_automatico: false,
    ja_vinculado: false,
    ...overrides,
  };
}
```

Em seguida, dentro de `describe('encontrarPares', ...)`, atualize os itens "principal" (que hoje têm `recebe_vinculos: true`) para também terem `recebe_vinculo_automatico: true`, nos seguintes testes:

Teste `'1 acessorio + 1 principal, mesmo ambiente/largura -> 1 par'` (linhas 19-25):

```js
  test('1 acessorio + 1 principal, mesmo ambiente/largura -> 1 par', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: true }),
    ];
    expect(encontrarPares(itens)).toEqual([{ acessorioId: 1, principalId: 2 }]);
  });
```

Teste `'larguras diferentes -> nenhum par'` (linhas 27-33):

```js
  test('larguras diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: '1.5000' }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: true, largura: '2.0000' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });
```

Teste `'ambientes diferentes -> nenhum par'` (linhas 35-41):

```js
  test('ambientes diferentes -> nenhum par', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ambiente: 'Sala' }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: true, ambiente: 'Quarto' }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });
```

Teste `'2 acessorios + 1 principal, mesma largura -> nenhum par (ambiguo)'` (linhas 43-50):

```js
  test('2 acessorios + 1 principal, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, vinculavel: true }),
      item({ id: 3, recebe_vinculos: true, recebe_vinculo_automatico: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });
```

Teste `'1 acessorio + 2 principais, mesma largura -> nenhum par (ambiguo)'` (linhas 52-59):

```js
  test('1 acessorio + 2 principais, mesma largura -> nenhum par (ambiguo)', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: true }),
      item({ id: 3, recebe_vinculos: true, recebe_vinculo_automatico: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });
```

Teste `'item ja vinculado nao entra como acessorio candidato'` (linhas 61-67):

```js
  test('item ja vinculado nao entra como acessorio candidato', () => {
    const itens = [
      item({ id: 1, vinculavel: true, ja_vinculado: true }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });
```

Teste `'multiplos ambientes, cada um com par valido -> 2 pares'` (linhas 93-104):

```js
  test('multiplos ambientes, cada um com par valido -> 2 pares', () => {
    const itens = [
      item({ id: 1, ambiente: 'Sala',   largura: '1.5000', vinculavel: true }),
      item({ id: 2, ambiente: 'Sala',   largura: '1.5000', recebe_vinculos: true, recebe_vinculo_automatico: true }),
      item({ id: 3, ambiente: 'Quarto', largura: '2.2000', vinculavel: true }),
      item({ id: 4, ambiente: 'Quarto', largura: '2.2000', recebe_vinculos: true, recebe_vinculo_automatico: true }),
    ];
    expect(encontrarPares(itens)).toEqual([
      { acessorioId: 1, principalId: 2 },
      { acessorioId: 3, principalId: 4 },
    ]);
  });
```

Os testes `'ambiente nulo -> item ignorado'`, `'ambiente vazio -> item ignorado'` e `'largura nula -> item ignorado'` (linhas 69-91) **não precisam mudar** — o item ignorado nunca entra em nenhum grupo, independentemente do novo flag.

Agora adicione dois novos testes ao final de `describe('encontrarPares', ...)`, logo após o teste `'multiplos ambientes, cada um com par valido -> 2 pares'` e antes do `});` que fecha o `describe` (linha 105):

```js

  test('principal com recebe_vinculos=true mas recebe_vinculo_automatico=false (ex.: Persiana) -> nenhum par automatico', () => {
    const itens = [
      item({ id: 1, vinculavel: true }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: false }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });

  test('item vinculavel sem largura (ex.: Controle) -> ignorado mesmo com vinculavel=true', () => {
    const itens = [
      item({ id: 1, vinculavel: true, largura: null }),
      item({ id: 2, recebe_vinculos: true, recebe_vinculo_automatico: true }),
    ];
    expect(encontrarPares(itens)).toEqual([]);
  });
```

Por fim, dentro de `describe('processarPedido', ...)`, atualize os fixtures de linhas (mocked rows) para incluir o novo campo:

No teste `'cria vinculo, marca sem_vinculo=false e registra auditoria para 1 par'` (linhas 110-156), as duas rows mockadas (linhas 116-134) passam a ser:

```js
            {
              id: 11,
              ambiente: 'Sala',
              largura: '1.5000',
              descricao: 'Trilho Wave',
              vinculavel: true,
              recebe_vinculos: false,
              recebe_vinculo_automatico: false,
              ja_vinculado: false,
            },
            {
              id: 10,
              ambiente: 'Sala',
              largura: '1.5000',
              descricao: 'Cortina Wave',
              vinculavel: false,
              recebe_vinculos: true,
              recebe_vinculo_automatico: true,
              ja_vinculado: false,
            },
```

No teste `'pedido sem itens vinculaveis -> nenhuma escrita alem de BEGIN/SELECT/COMMIT'` (linhas 158-184), a row mockada (linhas 164-172) passa a ser:

```js
            {
              id: 20,
              ambiente: 'Sala',
              largura: '1.5000',
              descricao: 'Persiana Wave',
              vinculavel: false,
              recebe_vinculos: false,
              recebe_vinculo_automatico: false,
              ja_vinculado: false,
            },
```

- [ ] **Step 2: Rodar os testes e confirmar que o novo teste de Persiana falha**

Run: `cd backend && npx jest vinculoAutomaticoService.test.js`

Expected: o teste `'principal com recebe_vinculos=true mas recebe_vinculo_automatico=false (ex.: Persiana) -> nenhum par automatico'` **FALHA** (recebe `[{ acessorioId: 1, principalId: 2 }]` em vez de `[]`), porque o código atual ainda usa `it.recebe_vinculos`. Os demais testes continuam passando.

- [ ] **Step 3: Implementar a mudança em `vinculoAutomaticoService.js`**

Em `backend/src/services/vinculoAutomaticoService.js`, na função `encontrarPares`, troque a linha 19:

```js
    if (it.recebe_vinculos) grupo.principais.push(it);
```

por:

```js
    if (it.recebe_vinculo_automatico) grupo.principais.push(it);
```

Em seguida, na query dentro de `processarPedido` (linhas 44-55), adicione a coluna `recebe_vinculo_automatico` ao `SELECT`:

```js
    const itensRes = await client.query(
      `SELECT pi.id, pi.ambiente, pi.largura, pi.descricao,
              COALESCE(c.vinculavel, false)               AS vinculavel,
              COALESCE(c.recebe_vinculos, false)          AS recebe_vinculos,
              COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico,
              EXISTS (
                SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
              ) AS ja_vinculado
       FROM pedido_itens pi
       LEFT JOIN categorias c ON c.id = pi.categoria_id
       WHERE pi.pedido_id = $1`,
      [pedidoId]
    );
```

- [ ] **Step 4: Rodar os testes e confirmar que todos passam**

Run: `cd backend && npx jest vinculoAutomaticoService.test.js`

Expected: `PASS` — todos os testes (incluindo os 2 novos) passam.

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd backend && npx jest`

Expected: todos os testes passam (nenhuma regressão em `pedidoService.test.js` ou demais arquivos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/vinculoAutomaticoService.js backend/src/__tests__/vinculoAutomaticoService.test.js
git commit -m "feat(pedidos): motor de vinculo automatico usa flag recebe_vinculo_automatico"
```

---

## Self-Review Notes

- **Cobertura do spec:** coluna nova + flags (Task 1); `encontrarPares`/query (Task 2, Step 3); testes atualizados + 2 novos casos (Task 2, Steps 1-2); modal manual/rota — sem mudança, conforme spec (nenhuma task necessária).
- **Sem placeholders:** todos os blocos de código são completos e prontos para colar.
- **Consistência de tipos/nomes:** `recebe_vinculo_automatico` usado de forma idêntica na migration (coluna SQL), na query (`COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico`), em `encontrarPares` (`it.recebe_vinculo_automatico`) e nos fixtures de teste.
