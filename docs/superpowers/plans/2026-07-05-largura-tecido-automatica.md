# Auto-preenchimento da Largura do Tecido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a consultora/técnico digitar, na Ficha de Confecção/Conferência Consultoras de Cortina, um nome de tecido já usado antes na empresa, preencher automaticamente o campo "Largura do tecido no rolo" com a última largura registrada para aquele tecido — mas só se o campo estiver vazio.

**Architecture:** Novo endpoint `GET /api/os/tecidos/largura?nome=...` no backend, que busca em `ordem_servico.dados_confeccao`/`dados_conferencia_consultoras` (JSONB) o registro mais recente com `nomeTecido` batendo (case/espaço-insensitive) e `larguraTecido` não vazio, escopado por `empresa_id`. No frontend, `FichaConfeccaoCortina.jsx` observa mudanças em `dados.nomeTecido` com debounce de 500ms e chama o endpoint, preenchendo `larguraTecido` só se ainda estiver vazio quando a resposta chegar.

**Tech Stack:** Node/Express + `pg` (backend, `backend/src`), React (frontend, `frontend-web/src`), Jest + Supertest para testes de backend.

## Global Constraints

- Match de `nomeTecido` é sempre exato após `trim()` + `lower()` — sem fuzzy/autocomplete.
- Nunca sobrescrever um `larguraTecido` que já tenha algum valor no momento em que a resposta da busca chega.
- Escopo por `empresa_id` (multi-tenant) em toda consulta.
- Só aplica a fichas de tipo `cortina` (Forro não tem esses campos).
- Falha de rede na busca é silenciosa — não bloqueia o preenchimento manual nem mostra erro.
- Endpoint retorna `{ largura: null }` quando não encontra (não é um erro 404).

---

### Task 1: Service — `buscarLarguraTecidoConhecida`

**Files:**
- Modify: `backend/src/services/ordemServicoService.js`
- Test: `backend/src/__tests__/ordemServicoService.test.js`

**Interfaces:**
- Produces: `async function buscarLarguraTecidoConhecida(nomeTecido, empresaId)` → retorna `string|null` (a largura salva, ou `null` se não encontrada/nome vazio). Exportada em `module.exports` junto das demais funções do arquivo.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/__tests__/ordemServicoService.test.js`, antes da última linha do arquivo:

```js
describe('buscarLarguraTecidoConhecida', () => {
  test('retorna a largura salva quando o nome bate ignorando maiúsculas/espaços', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ largura: '3,30' }] });

    const result = await svc.buscarLarguraTecidoConhecida('  ado016 ', 1);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("lower(trim(os.dados_confeccao->>'nomeTecido'))"),
      [1, 'ado016']
    );
    expect(result).toBe('3,30');
  });

  test('retorna null quando não encontra nenhum registro', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await svc.buscarLarguraTecidoConhecida('ADO999', 1);

    expect(result).toBeNull();
  });

  test('retorna null sem consultar o banco quando o nome é vazio ou só espaços', async () => {
    const result = await svc.buscarLarguraTecidoConhecida('   ', 1);

    expect(result).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest src/__tests__/ordemServicoService.test.js -t "buscarLarguraTecidoConhecida"`
Expected: FAIL — `svc.buscarLarguraTecidoConhecida is not a function`

- [ ] **Step 3: Implementar a função**

Em `backend/src/services/ordemServicoService.js`, adicionar antes da linha `module.exports = { ... }`:

```js
async function buscarLarguraTecidoConhecida(nomeTecido, empresaId) {
  const nome = String(nomeTecido || '').trim();
  if (!nome) return null;

  const { rows } = await db.query(
    `SELECT largura FROM (
       SELECT os.dados_confeccao->>'larguraTecido' AS largura, os.updated_at
       FROM ordem_servico os
       JOIN pedido_itens pi ON pi.id = os.pedido_item_id
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE p.empresa_id = $1
         AND os.tipo = 'cortina'
         AND lower(trim(os.dados_confeccao->>'nomeTecido')) = lower(trim($2))
       UNION ALL
       SELECT os.dados_conferencia_consultoras->>'larguraTecido' AS largura, os.updated_at
       FROM ordem_servico os
       JOIN pedido_itens pi ON pi.id = os.pedido_item_id
       JOIN pedidos p ON p.id = pi.pedido_id
       WHERE p.empresa_id = $1
         AND os.tipo = 'cortina'
         AND lower(trim(os.dados_conferencia_consultoras->>'nomeTecido')) = lower(trim($2))
     ) t
     WHERE NULLIF(trim(largura), '') IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresaId, nome]
  );
  return rows[0]?.largura || null;
}
```

E atualizar a linha final do arquivo para incluir a nova função:

```js
module.exports = { criar, listarPorPedido, atualizarStatus, buscar, salvarDadosConfeccao, salvarDadosConferenciaConsultoras, salvarDadosTecnicos, buscarLarguraTecidoConhecida };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest src/__tests__/ordemServicoService.test.js -t "buscarLarguraTecidoConhecida"`
Expected: PASS — 3 testes passando

- [ ] **Step 5: Rodar a suíte inteira do arquivo para checar regressão**

Run: `cd backend && npx jest src/__tests__/ordemServicoService.test.js`
Expected: PASS — todos os testes do arquivo (os novos + os já existentes)

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/services/ordemServicoService.js src/__tests__/ordemServicoService.test.js
git commit -m "feat(os): adiciona busca da ultima largura de tecido conhecida"
```

---

### Task 2: Rota — `GET /os/tecidos/largura`

**Files:**
- Modify: `backend/src/routes/ordemServicoRoutes.js`
- Test: `backend/src/__tests__/ordemServicoRoutes.test.js`

**Interfaces:**
- Consumes: `svc.buscarLarguraTecidoConhecida(nomeTecido, empresaId)` de `backend/src/services/ordemServicoService.js` (Task 1).
- Produces: `GET /api/os/tecidos/largura?nome=<string>` → `200 { largura: string|null }`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `backend/src/__tests__/ordemServicoRoutes.test.js`:

```js
describe('GET /api/os/tecidos/largura', () => {
  test('200 com a largura encontrada', async () => {
    svc.buscarLarguraTecidoConhecida.mockResolvedValueOnce('3,30');
    const res = await request(app).get('/api/os/tecidos/largura').query({ nome: 'ADO016' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ largura: '3,30' });
    expect(svc.buscarLarguraTecidoConhecida).toHaveBeenCalledWith('ADO016', 1);
  });

  test('200 com largura null quando não encontra', async () => {
    svc.buscarLarguraTecidoConhecida.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/os/tecidos/largura').query({ nome: 'DESCONHECIDO' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ largura: null });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest src/__tests__/ordemServicoRoutes.test.js -t "tecidos/largura"`
Expected: FAIL — 404 (rota não existe) em vez de 200

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/ordemServicoRoutes.js`, adicionar antes de `router.get('/:id', ...)` (linha 67 no arquivo atual):

```js
router.get('/tecidos/largura', authMiddleware, async (req, res) => {
  try {
    const largura = await svc.buscarLarguraTecidoConhecida(req.query.nome, req.user.empresa_id);
    res.json({ largura });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest src/__tests__/ordemServicoRoutes.test.js -t "tecidos/largura"`
Expected: PASS — 2 testes passando

- [ ] **Step 5: Rodar a suíte inteira do arquivo para checar regressão**

Run: `cd backend && npx jest src/__tests__/ordemServicoRoutes.test.js`
Expected: PASS — todos os testes do arquivo

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/ordemServicoRoutes.js src/__tests__/ordemServicoRoutes.test.js
git commit -m "feat(os): expoe rota de busca da largura de tecido conhecida"
```

---

### Task 3: Frontend — auto-preenchimento em `FichaConfeccaoCortina.jsx`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx`

**Interfaces:**
- Consumes: `GET /os/tecidos/largura?nome=...` → `{ largura: string|null }` (Task 2), via `api.get(path, { signal })` de `frontend-web/src/services/api.js`.

- [ ] **Step 1: Importar `useEffect` e ajustar o import de React**

Em `frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx`, trocar a linha 1:

```jsx
import { useState } from "react";
```

por:

```jsx
import { useEffect, useState } from "react";
```

- [ ] **Step 2: Adicionar o efeito de busca com debounce**

Logo após a declaração dos states (após a linha `const [sucesso, setSucesso] = useState("");`, antes de `function setCampo(...)`), adicionar:

```jsx
  useEffect(() => {
    if (readOnly) return;
    const nome = dados.nomeTecido?.trim();
    if (!nome) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.get(`/os/tecidos/largura?nome=${encodeURIComponent(nome)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.largura) return;
          setDados((prev) => (prev.larguraTecido ? prev : { ...prev, larguraTecido: res.largura }));
        })
        .catch(() => {});
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dados.nomeTecido, readOnly]);
```

- [ ] **Step 3: Verificar visualmente no navegador**

Run: `cd frontend-web && npm run dev` (se ainda não estiver rodando)

1. Abrir uma ordem de serviço de Cortina (Ficha de Confecção ou Conferência Consultoras) que ainda não tenha tecido salvo.
2. Digitar o nome de um tecido que **já foi salvo com largura** em outra ficha antes (ex: "ADO016").
3. Aguardar ~500ms sem digitar — confirmar que "Largura do tecido no rolo" preenche sozinho.
4. Repetir em outra ficha, mas digitando primeiro manualmente um valor em "Largura do tecido no rolo" antes de digitar o nome do tecido conhecido — confirmar que o valor manual **não** é sobrescrito.
5. Digitar um nome de tecido que nunca foi usado — confirmar que nada acontece (campo largura continua vazio, sem erro na tela).
6. Abrir uma ficha em modo `readOnly` (via "👁 Ver Ficha") — confirmar que não há chamada de rede ao endpoint (aba Network do DevTools).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx
git commit -m "feat(pedidos): auto-preenche largura do tecido ja conhecido"
```

---

## Self-Review Notes

- **Cobertura da spec:** Backend (service + rota) coberto na Task 1 e 2; frontend (debounce, guard de não sobrescrever, silêncio em erro, `readOnly`) coberto na Task 3. Escopo "fora" (Forro, autocomplete, sobrescrita) não implementado, como definido na spec.
- **Consistência de tipos:** `buscarLarguraTecidoConhecida(nomeTecido, empresaId)` retorna `string|null` em todas as camadas (service → rota `{ largura }` → frontend `res.largura`).
- **Sem placeholders:** todos os steps têm código completo e comandos exatos.
