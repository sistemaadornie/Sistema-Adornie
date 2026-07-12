# Auto-registro de cidades/bairros no mapa de clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um pedido é salvo com uma cidade/bairro que o mapa do Dashboard do Gestor ainda não conhece, descobrir a posição real via geocodificação e guardá-la num cache, pra esse pedido parar de cair no pino genérico "Outros" e passar a aparecer como uma região própria no mapa.

**Architecture:** Nova tabela `regioes_geo` funciona como cache de coordenadas. Um novo serviço `regiaoGeoService.js` sabe checar se uma cidade/bairro já é conhecida (lista fixa em código ou cache), geocodificar via os helpers `photon`/`nominatim` já existentes em `utils/geocoding.js`, e gravar o resultado. `pedidoService.criar`/`atualizar` disparam esse serviço em background (fire-and-forget) após salvar. `dashboardGestorService.buscarMapa` passa a checar lista fixa → cache → "Outros" nessa ordem. Uma rota de backfill roda esse mesmo serviço contra as cidades/bairros distintos já usados nos pedidos existentes.

**Tech Stack:** Node.js, Express, PostgreSQL (`pg`), Jest.

## Global Constraints

- Migration `regioes_geo.sql` deve ser aplicada manualmente nos dois bancos (local e Supabase), como todas as migrations deste projeto. Este plano só aplica no banco local — aplicar no Supabase fica pra você rodar depois (sem acesso MCP autorizado nesta sessão).
- Geocodificação em background nunca deve lançar erro nem atrasar a resposta HTTP de criar/atualizar pedido (fire-and-forget com `.catch()`, mesmo padrão de `agendamentoService.js:510`).
- Bairro só é geocodificado/cacheado quando a cidade normaliza para "curitiba" (único escopo que o modo "bairros" do mapa mostra).
- Cache é escopado por `empresa_id` (mesmo padrão multi-tenant do resto do schema).

---

### Task 1: Migration `regioes_geo` + aplicar no banco local

**Files:**
- Create: `backend/src/database/migrations/regioes_geo.sql`

**Interfaces:**
- Produces: tabela `regioes_geo(id, empresa_id, tipo, chave, nome, cidade, estado, lat, lng, geocod_falhou, criado_em)` com `UNIQUE (empresa_id, tipo, chave)`, usada pelas Tasks 3–7.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
CREATE TABLE regioes_geo (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('bairro','cidade')),
  chave VARCHAR(120) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  cidade VARCHAR(120),
  estado VARCHAR(2),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  geocod_falhou BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, tipo, chave)
);

CREATE INDEX idx_regioes_geo_busca ON regioes_geo (empresa_id, tipo, chave);
```

- [ ] **Step 2: Aplicar no banco local**

Rodar a partir de `backend/`:

```bash
node -e "const fs=require('fs');const db=require('./src/database/db');db.query(fs.readFileSync('./src/database/migrations/regioes_geo.sql','utf8')).then(()=>{console.log('OK');process.exit(0);}).catch((e)=>{console.error(e);process.exit(1);});"
```

Expected: imprime `OK` e sai com código 0.

- [ ] **Step 3: Verificar que a tabela existe**

```bash
node -e "const db=require('./src/database/db');db.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='regioes_geo' ORDER BY ordinal_position\").then((r)=>{console.log(r.rows.map(x=>x.column_name));process.exit(0);}).catch((e)=>{console.error(e);process.exit(1);});"
```

Expected: lista com `id, empresa_id, tipo, chave, nome, cidade, estado, lat, lng, geocod_falhou, criado_em`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/regioes_geo.sql
git commit -m "feat(mapa): adiciona tabela regioes_geo (cache de coordenadas geocodificadas)"
```

**Lembrete pro fim do projeto:** aplicar a mesma migration no Supabase manualmente (não incluso neste plano).

---

### Task 2: Exportar `nominatim` de `geocoding.js` e `normalizar` de `dashboardGestorConfig.js`

**Files:**
- Modify: `backend/src/utils/geocoding.js:240`
- Modify: `backend/src/config/dashboardGestorConfig.js:133-138`
- Test: `backend/src/__tests__/geocoding.test.js` (novo)

**Interfaces:**
- Produces: `nominatim({ rua, numero, bairro, cidade, estado })` exportado de `utils/geocoding.js` (assinatura já existente, só passa a ser pública). `normalizar(str)` exportado de `config/dashboardGestorConfig.js` (assinatura já existente). Usados pela Task 3.

- [ ] **Step 1: Escrever o teste de exportação**

Criar `backend/src/__tests__/geocoding.test.js`:

```js
const { photon, nominatim } = require("../utils/geocoding");

describe("exports públicos", () => {
  test("nominatim é exportado como função", () => {
    expect(typeof nominatim).toBe("function");
  });
  test("photon é exportado como função", () => {
    expect(typeof photon).toBe("function");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest geocoding.test.js`
Expected: FAIL — `nominatim` é `undefined`.

- [ ] **Step 3: Exportar `nominatim`**

Em `backend/src/utils/geocoding.js:240`, trocar:

```js
module.exports = { geocodificarAgendamento, geocodificarLote, avaliarEndereco, photon };
```

por:

```js
module.exports = { geocodificarAgendamento, geocodificarLote, avaliarEndereco, photon, nominatim };
```

- [ ] **Step 4: Exportar `normalizar`**

Em `backend/src/config/dashboardGestorConfig.js:133-138`, trocar:

```js
module.exports = {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada,
};
```

por:

```js
module.exports = {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada, normalizar,
};
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd backend && npx jest geocoding.test.js`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/geocoding.js backend/src/config/dashboardGestorConfig.js backend/src/__tests__/geocoding.test.js
git commit -m "refactor: exporta nominatim e normalizar para reuso no auto-registro de regioes"
```

---

### Task 3: `regiaoGeoService.registrarRegiaoSeNecessaria`

**Files:**
- Create: `backend/src/services/regiaoGeoService.js`
- Test: `backend/src/__tests__/regiaoGeoService.test.js`

**Interfaces:**
- Consumes: `photon(query)`, `nominatim({ bairro, cidade, estado })` de `utils/geocoding.js` (Task 2). `buscarCoordenada(nome, lista)`, `normalizar(str)`, `MAPA_BAIRROS`, `MAPA_CIDADES` de `config/dashboardGestorConfig.js`. `db.query(sql, params)` de `database/db`.
- Produces: `async function registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado })` — resolve sempre (nunca rejeita: erros de rede/geocodificação viram `geocod_falhou=true`; só um erro de banco na gravação propaga). Usado pelas Tasks 6, 5(backfill) e 8.

- [ ] **Step 1: Escrever os testes**

Criar `backend/src/__tests__/regiaoGeoService.test.js`:

```js
jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../utils/geocoding", () => ({ photon: jest.fn(), nominatim: jest.fn() }));

const db = require("../database/db");
const { photon, nominatim } = require("../utils/geocoding");
const { registrarRegiaoSeNecessaria } = require("../services/regiaoGeoService");

afterEach(() => jest.clearAllMocks());

describe("registrarRegiaoSeNecessaria", () => {
  test("sem cidade, nao faz nada", async () => {
    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Batel", cidade: null, estado: null });
    expect(db.query).not.toHaveBeenCalled();
    expect(photon).not.toHaveBeenCalled();
  });

  test("cidade e bairro ja conhecidos na lista fixa: nao consulta nada", async () => {
    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Batel", cidade: "Curitiba", estado: "PR" });
    expect(db.query).not.toHaveBeenCalled();
    expect(photon).not.toHaveBeenCalled();
  });

  test("cidade nova: geocodifica com photon e grava no cache", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida cidade
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    photon.mockResolvedValueOnce({ lat: -10.5, lng: -20.5 });

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: null, cidade: "Cidade Nova", estado: "XX" });

    expect(photon).toHaveBeenCalledWith("Cidade Nova XX");
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO regioes_geo/);
    expect(insertCall[1]).toEqual([7, "cidade", "cidade nova", "Cidade Nova", null, "XX", -10.5, -20.5, false]);
  });

  test("cidade nova ja em cache: nao geocodifica de novo", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // jaConhecida cidade -> ja existe

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: null, cidade: "Cidade Nova", estado: "XX" });

    expect(photon).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test("bairro novo em Curitiba (cidade ja conhecida): geocodifica so o bairro", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida bairro
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    photon.mockResolvedValueOnce({ lat: -25.1, lng: -49.1 });

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Bairro Novo XYZ", cidade: "Curitiba", estado: "PR" });

    expect(photon).toHaveBeenCalledTimes(1);
    expect(photon).toHaveBeenCalledWith("Bairro Novo XYZ Curitiba PR");
    const insertCall = db.query.mock.calls[1];
    expect(insertCall[1]).toEqual([7, "bairro", "bairro novo xyz", "Bairro Novo XYZ", "Curitiba", "PR", -25.1, -49.1, false]);
  });

  test("cidade fora de Curitiba: bairro nunca e registrado, mesmo se novo", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida cidade
      .mockResolvedValueOnce({ rows: [] }); // INSERT cidade
    photon.mockResolvedValueOnce({ lat: -1, lng: -2 });

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: "Bairro Qualquer", cidade: "Cidade Fake", estado: "XX" });

    expect(db.query).toHaveBeenCalledTimes(2); // so cidade: jaConhecida + insert
    expect(photon).toHaveBeenCalledTimes(1);
  });

  test("photon e nominatim falham: grava geocod_falhou=true", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida cidade
      .mockResolvedValueOnce({ rows: [] }); // INSERT
    photon.mockResolvedValueOnce(null);
    nominatim.mockResolvedValueOnce(null);

    await registrarRegiaoSeNecessaria({ empresaId: 7, bairro: null, cidade: "Cidade Perdida", estado: "XX" });

    const insertCall = db.query.mock.calls[1];
    expect(insertCall[1]).toEqual([7, "cidade", "cidade perdida", "Cidade Perdida", null, "XX", null, null, true]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest regiaoGeoService.test.js`
Expected: FAIL — `Cannot find module '../services/regiaoGeoService'`.

- [ ] **Step 3: Implementar `regiaoGeoService.js`**

Criar `backend/src/services/regiaoGeoService.js`:

```js
"use strict";
const db = require("../database/db");
const { photon, nominatim } = require("../utils/geocoding");
const {
  MAPA_BAIRROS, MAPA_CIDADES,
  buscarCoordenada, normalizar,
} = require("../config/dashboardGestorConfig");

async function jaConhecida(empresaId, tipo, chave) {
  const { rows } = await db.query(
    `SELECT id FROM regioes_geo WHERE empresa_id = $1 AND tipo = $2 AND chave = $3 LIMIT 1`,
    [empresaId, tipo, chave]
  );
  return rows.length > 0;
}

async function salvarRegiao({ empresaId, tipo, chave, nome, cidade, estado, coords }) {
  await db.query(
    `INSERT INTO regioes_geo (empresa_id, tipo, chave, nome, cidade, estado, lat, lng, geocod_falhou)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (empresa_id, tipo, chave) DO NOTHING`,
    [empresaId, tipo, chave, nome, cidade || null, estado || null,
      coords?.lat ?? null, coords?.lng ?? null, !coords]
  );
}

async function geocodificarCidadeOuBairro({ tipo, nome, cidade, estado }) {
  const query = tipo === "cidade"
    ? `${nome} ${estado || ""}`.trim()
    : `${nome} ${cidade} ${estado || ""}`.trim();
  const viaPhoton = await photon(query);
  if (viaPhoton) return viaPhoton;
  return tipo === "cidade"
    ? nominatim({ cidade: nome, estado })
    : nominatim({ bairro: nome, cidade, estado });
}

async function registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado }) {
  if (!cidade || !cidade.trim()) return;

  const chaveCidade = normalizar(cidade);
  let cidadeConhecida = !!buscarCoordenada(cidade, MAPA_CIDADES);
  if (!cidadeConhecida) cidadeConhecida = await jaConhecida(empresaId, "cidade", chaveCidade);
  if (!cidadeConhecida) {
    const coords = await geocodificarCidadeOuBairro({ tipo: "cidade", nome: cidade.trim(), estado });
    await salvarRegiao({
      empresaId, tipo: "cidade", chave: chaveCidade, nome: cidade.trim(),
      cidade: null, estado, coords,
    });
  }

  if (chaveCidade === "curitiba" && bairro && bairro.trim()) {
    const chaveBairro = normalizar(bairro);
    let bairroConhecido = !!buscarCoordenada(bairro, MAPA_BAIRROS);
    if (!bairroConhecido) bairroConhecido = await jaConhecida(empresaId, "bairro", chaveBairro);
    if (!bairroConhecido) {
      const coords = await geocodificarCidadeOuBairro({ tipo: "bairro", nome: bairro.trim(), cidade: cidade.trim(), estado });
      await salvarRegiao({
        empresaId, tipo: "bairro", chave: chaveBairro, nome: bairro.trim(),
        cidade: cidade.trim(), estado, coords,
      });
    }
  }
}

module.exports = { registrarRegiaoSeNecessaria };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest regiaoGeoService.test.js`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/regiaoGeoService.js backend/src/__tests__/regiaoGeoService.test.js
git commit -m "feat(mapa): adiciona regiaoGeoService.registrarRegiaoSeNecessaria"
```

---

### Task 4: `regiaoGeoService.buscarCoordenadasCache`

**Files:**
- Modify: `backend/src/services/regiaoGeoService.js`
- Test: `backend/src/__tests__/regiaoGeoService.test.js`

**Interfaces:**
- Consumes: `db.query(sql, params)`.
- Produces: `async function buscarCoordenadasCache(empresaId, tipo, chavesNormalizadas) → Promise<Map<string, {id, nome, lat, lng}>>`. Usado pela Task 7.

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `backend/src/__tests__/regiaoGeoService.test.js`:

```js
const { buscarCoordenadasCache } = require("../services/regiaoGeoService");

describe("buscarCoordenadasCache", () => {
  test("lista de chaves vazia nao consulta o banco", async () => {
    const r = await buscarCoordenadasCache(7, "bairro", []);
    expect(r.size).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  test("retorna um Map indexado por chave", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: "bairro cache", nome: "Bairro Cache", lat: -25.1, lng: -49.1 }],
    });

    const r = await buscarCoordenadasCache(7, "bairro", ["bairro cache"]);

    expect(r.get("bairro cache")).toEqual({ id: "bairro cache", nome: "Bairro Cache", lat: -25.1, lng: -49.1 });
    expect(db.query.mock.calls[0][1]).toEqual([7, "bairro", ["bairro cache"]]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest regiaoGeoService.test.js`
Expected: FAIL — `buscarCoordenadasCache is not a function`.

- [ ] **Step 3: Implementar**

Em `backend/src/services/regiaoGeoService.js`, adicionar antes de `module.exports`:

```js
async function buscarCoordenadasCache(empresaId, tipo, chavesNormalizadas) {
  if (!chavesNormalizadas.length) return new Map();
  const { rows } = await db.query(
    `SELECT chave AS id, nome, lat::float8 AS lat, lng::float8 AS lng
     FROM regioes_geo
     WHERE empresa_id = $1 AND tipo = $2 AND chave = ANY($3) AND geocod_falhou = false AND lat IS NOT NULL`,
    [empresaId, tipo, chavesNormalizadas]
  );
  const mapa = new Map();
  for (const r of rows) mapa.set(r.id, r);
  return mapa;
}
```

E atualizar `module.exports` para:

```js
module.exports = { registrarRegiaoSeNecessaria, buscarCoordenadasCache };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest regiaoGeoService.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/regiaoGeoService.js backend/src/__tests__/regiaoGeoService.test.js
git commit -m "feat(mapa): adiciona regiaoGeoService.buscarCoordenadasCache"
```

---

### Task 5: `regiaoGeoService.backfillRegioes`

**Files:**
- Modify: `backend/src/services/regiaoGeoService.js`
- Test: `backend/src/__tests__/regiaoGeoService.test.js`

**Interfaces:**
- Consumes: `registrarRegiaoSeNecessaria` (Task 3, chamada internamente), `db.query`.
- Produces: `async function backfillRegioes(empresaId, { delayMs = 1200 } = {}) → Promise<{ total, ok, falhou }>`. `ok`/`falhou` contam quantas combinações cidade/bairro terminaram sem lançar erro inesperado (não indicam se a geocodificação em si achou coordenada — isso fica registrado em `regioes_geo.geocod_falhou`). Usado pela Task 8.

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `backend/src/__tests__/regiaoGeoService.test.js`:

```js
const { backfillRegioes } = require("../services/regiaoGeoService");

describe("backfillRegioes", () => {
  test("processa cada combinacao distinta e resume ok/falhou", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [
        { cidade: "Curitiba", bairro: "Batel", estado: "PR" },        // ja conhecida (lista fixa) -> 0 queries
        { cidade: "Cidade Nova", bairro: null, estado: "XX" },        // nova -> geocodifica com sucesso
        { cidade: "Cidade Perdida", bairro: null, estado: "XX" },     // nova -> geocodificacao falha
      ] }) // SELECT DISTINCT
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida Cidade Nova
      .mockResolvedValueOnce({ rows: [] }) // INSERT Cidade Nova
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida Cidade Perdida
      .mockResolvedValueOnce({ rows: [] }); // INSERT Cidade Perdida

    photon
      .mockResolvedValueOnce({ lat: -1, lng: -2 }) // Cidade Nova
      .mockResolvedValueOnce(null);                // Cidade Perdida
    nominatim.mockResolvedValueOnce(null);          // Cidade Perdida (fallback)

    const r = await backfillRegioes(7, { delayMs: 0 });

    expect(r).toEqual({ total: 3, ok: 3, falhou: 0 });
    expect(db.query.mock.calls[0][0]).toMatch(/SELECT DISTINCT/);
    expect(db.query.mock.calls[0][1]).toEqual([7]);
  });

  test("erro inesperado numa linha nao interrompe as demais", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [
        { cidade: "Cidade Erro", bairro: null, estado: "XX" },
        { cidade: "Cidade Ok", bairro: null, estado: "XX" },
      ] }) // SELECT DISTINCT
      .mockRejectedValueOnce(new Error("db fora do ar")) // jaConhecida Cidade Erro
      .mockResolvedValueOnce({ rows: [] }) // jaConhecida Cidade Ok
      .mockResolvedValueOnce({ rows: [] }); // INSERT Cidade Ok

    photon.mockResolvedValueOnce({ lat: -3, lng: -4 }); // Cidade Ok

    const r = await backfillRegioes(7, { delayMs: 0 });

    expect(r).toEqual({ total: 2, ok: 1, falhou: 1 });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest regiaoGeoService.test.js`
Expected: FAIL — `backfillRegioes is not a function`.

- [ ] **Step 3: Implementar**

Em `backend/src/services/regiaoGeoService.js`, adicionar antes de `module.exports`:

```js
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillRegioes(empresaId, { delayMs = 1200 } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT cidade, bairro, estado FROM pedidos
     WHERE empresa_id = $1 AND deleted_at IS NULL AND cidade IS NOT NULL AND cidade != ''`,
    [empresaId]
  );

  let ok = 0, falhou = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await registrarRegiaoSeNecessaria({
        empresaId, bairro: rows[i].bairro, cidade: rows[i].cidade, estado: rows[i].estado,
      });
      ok++;
    } catch {
      falhou++;
    }
    if (i < rows.length - 1) await sleep(delayMs);
  }
  return { total: rows.length, ok, falhou };
}
```

E atualizar `module.exports` para:

```js
module.exports = { registrarRegiaoSeNecessaria, buscarCoordenadasCache, backfillRegioes };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest regiaoGeoService.test.js`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/regiaoGeoService.js backend/src/__tests__/regiaoGeoService.test.js
git commit -m "feat(mapa): adiciona regiaoGeoService.backfillRegioes"
```

---

### Task 6: Gatilho em `pedidoService.criar` e `pedidoService.atualizar`

**Files:**
- Modify: `backend/src/services/pedidoService.js:1-5` (require), `backend/src/services/pedidoService.js:383-384` (criar), `backend/src/services/pedidoService.js:532-533` (atualizar)
- Test: `backend/src/__tests__/pedidoService.test.js`

**Interfaces:**
- Consumes: `registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado })` (Task 3).
- Produces: nenhuma interface nova — efeito colateral fire-and-forget.

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `backend/src/__tests__/pedidoService.test.js` (o arquivo tem 272 linhas — este bloco fica depois de tudo que já existe, então não interfere na ordem dos testes anteriores). Reaproveita o helper `makeClient` já existente no arquivo (linha 140).

**Importante:** usar a forma com factory no `jest.mock`, com `mockResolvedValue(undefined)` como padrão — não a forma curta `jest.mock('../services/regiaoGeoService')`. Um auto-mock puro faria `registrarRegiaoSeNecessaria(...)` devolver `undefined` por padrão; como `pedidoService.js` chama `.catch()` no retorno (Step 4/5), isso quebraria `criar`/`atualizar` com `TypeError: Cannot read properties of undefined (reading 'catch')` em **todos** os testes já existentes no arquivo que chamam `svc.criar`/`svc.atualizar`, não só nos novos:

```js
jest.mock('../services/regiaoGeoService', () => ({
  registrarRegiaoSeNecessaria: jest.fn().mockResolvedValue(undefined),
}));
const regiaoGeoSvc = require('../services/regiaoGeoService');

describe('registrarRegiaoSeNecessaria e chamado ao salvar pedido', () => {
  test('criar: chama registrarRegiaoSeNecessaria com bairro/cidade/estado do pedido', async () => {
    const fakeId = 77;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const client = makeClient([
      { rows: [] },               // BEGIN
      { rows: [{ seq: 1 }] },     // nextval
      { rows: [{ id: fakeId }] }, // INSERT pedidos
      { rows: [] },               // SELECT existing ids
      { rows: [] },               // DELETE pagamentos
      { rows: [] },               // COMMIT
    ]);
    db.connect.mockResolvedValue(client);
    regiaoGeoSvc.registrarRegiaoSeNecessaria.mockResolvedValue();

    await svc.criar(10, 99, {
      status: 'pendente', bairro: 'Batel', cidade: 'Curitiba', estado: 'PR',
      itens: [], pagamentos: [],
    });

    expect(regiaoGeoSvc.registrarRegiaoSeNecessaria).toHaveBeenCalledWith({
      empresaId: 10, bairro: 'Batel', cidade: 'Curitiba', estado: 'PR',
    });
  });

  test('criar: erro em registrarRegiaoSeNecessaria nao derruba a criacao do pedido', async () => {
    const fakeId = 78;
    db.query
      .mockResolvedValueOnce({ rows: [{ id: fakeId, empresa_id: 10, status: 'pendente', numero_origem: null, numero_sequencial: 1, cliente_nome: null, cliente_telefone: null, consultor_nome: null, arquiteto_nome: null, tem_anexo_pdf: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const client = makeClient([
      { rows: [] }, { rows: [{ seq: 1 }] }, { rows: [{ id: fakeId }] },
      { rows: [] }, { rows: [] }, { rows: [] },
    ]);
    db.connect.mockResolvedValue(client);
    regiaoGeoSvc.registrarRegiaoSeNecessaria.mockRejectedValue(new Error('geocod falhou'));

    const pedido = await svc.criar(10, 99, { status: 'pendente', itens: [], pagamentos: [] });

    expect(pedido.id).toBe(fakeId);
  });
});
```

O helper `makeClient` já existe em `backend/src/__tests__/pedidoService.test.js:140` (fora de qualquer `describe`, então visível pra esse novo bloco) e preenche `{ rows: [] }` como resposta padrão pra qualquer chamada além das listadas — não precisa cobrir cada `client.query` uma a uma.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest pedidoService.test.js -t "registrarRegiaoSeNecessaria"`
Expected: FAIL — `regiaoGeoSvc.registrarRegiaoSeNecessaria` nunca foi chamado (toHaveBeenCalledWith falha).

- [ ] **Step 3: Adicionar o require**

Em `backend/src/services/pedidoService.js:1-5`, trocar:

```js
const db = require("../database/db");
const cliSvc = require("./clienteService");
const arqSvc = require("./arquitetoService");
const auditSvc = require("./auditoriaService");
const vinculoAutoSvc = require("./vinculoAutomaticoService");
```

por:

```js
const db = require("../database/db");
const cliSvc = require("./clienteService");
const arqSvc = require("./arquitetoService");
const auditSvc = require("./auditoriaService");
const vinculoAutoSvc = require("./vinculoAutomaticoService");
const regiaoGeoSvc = require("./regiaoGeoService");
```

- [ ] **Step 4: Disparar o gatilho em `criar`**

Em `backend/src/services/pedidoService.js:383-384`, trocar:

```js
    await client.query("COMMIT");
    return montarPedido(pedidoId, empresaId);
```

por:

```js
    await client.query("COMMIT");
    regiaoGeoSvc.registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado }).catch(() => {});
    return montarPedido(pedidoId, empresaId);
```

- [ ] **Step 5: Disparar o gatilho em `atualizar`**

Em `backend/src/services/pedidoService.js:532-533`, trocar:

```js
    await client.query("COMMIT");
    return montarPedido(id, empresaId);
```

por:

```js
    await client.query("COMMIT");
    regiaoGeoSvc.registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado }).catch(() => {});
    return montarPedido(id, empresaId);
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest pedidoService.test.js`
Expected: PASS (todos os testes do arquivo, incluindo os novos).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/pedidoService.js backend/src/__tests__/pedidoService.test.js
git commit -m "feat(mapa): dispara registro de regiao geografica ao criar/atualizar pedido"
```

---

### Task 7: Ler o cache no `buscarMapa`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js:6-11` (imports), `backend/src/services/dashboardGestorService.js:276-305` (buscarMapa)
- Test: `backend/src/__tests__/dashboardGestorService.test.js:228-265`

**Interfaces:**
- Consumes: `buscarCoordenadasCache(empresaId, tipo, chavesNormalizadas)` (Task 4), `normalizar(str)` (Task 2).
- Produces: `buscarMapa` passa a incluir regiões vindas do cache (id = chave normalizada, nome/lat/lng do cache) além de lista fixa e "Outros".

- [ ] **Step 1: Atualizar os testes existentes e escrever o novo**

Em `backend/src/__tests__/dashboardGestorService.test.js`, no describe `buscarMapa` (linhas 228-265), adicionar um `mockResolvedValueOnce({ rows: [] })` como a PRIMEIRA chamada de `db.query` em cada um dos dois testes existentes (a consulta ao cache passa a rodar antes das consultas de categorias/atendimentos, sempre que existir pelo menos uma chave não resolvida pela lista fixa):

No teste `"modo bairros: agrupa por bairro (só Curitiba), usa coordenada curada e soma 'Outros'"` (linha 235-237), trocar:

```js
    db.query
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido
```

por:

```js
    db.query
      .mockResolvedValueOnce({ rows: [] }) // cache de regioes (Bairro Desconhecido: sem match)
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido
```

No teste `"modo bairros: múltiplos bairros nao mapeados se fundem em um único 'Outros'"` (linha 253-255), trocar:

```js
    db.query
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido
```

por:

```js
    db.query
      .mockResolvedValueOnce({ rows: [] }) // cache de regioes (nenhum dos dois bairros tem match)
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido
```

Adicionar um terceiro teste logo após, ainda dentro do describe `buscarMapa` (antes do `});` de fechamento na linha 265):

```js
  test("modo bairros: usa coordenada do cache pra bairro nao mapeado na lista fixa", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "800", data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Bairro Cache", cliente_id: 1, numero_sequencial: 1, estagio: { etapa_atual: 1 } },
    ]);
    db.query
      .mockResolvedValueOnce({ rows: [{ id: "bairro cache", nome: "Bairro Cache", lat: -25.1, lng: -49.1 }] }) // cache de regioes
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido

    const r = await svc.buscarMapa(7, { modo: "bairros", periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.regioes).toHaveLength(1);
    expect(r.regioes[0]).toMatchObject({ id: "bairro cache", nome: "Bairro Cache", lat: -25.1, lng: -49.1, faturamento: 800 });
    expect(db.query.mock.calls[0][1]).toEqual([7, "bairro", ["bairro cache"]]);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest dashboardGestorService.test.js -t "buscarMapa"`
Expected: FAIL — os dois testes existentes ficam com os `mockResolvedValueOnce` fora de ordem (a consulta extra ainda não existe, então a 1ª resposta mockada some pra chamada de categorias) e o teste novo falha porque a região cai em "Outros" em vez de usar o cache.

- [ ] **Step 3: Atualizar os imports**

Em `backend/src/services/dashboardGestorService.js:6-11`, trocar:

```js
const {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada,
} = require("../config/dashboardGestorConfig");
```

por:

```js
const {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada, normalizar,
} = require("../config/dashboardGestorConfig");
const { buscarCoordenadasCache, backfillRegioes } = require("./regiaoGeoService");
```

- [ ] **Step 4: Atualizar `buscarMapa`**

Em `backend/src/services/dashboardGestorService.js:276-305`, trocar:

```js
  const listaCoordenadas = modo === "cidades" ? MAPA_CIDADES : MAPA_BAIRROS;
  const outrosCoord = modo === "cidades" ? MAPA_CIDADES_OUTROS : MAPA_BAIRROS_OUTROS;

  const porRegiao = new Map();
  for (const [chave, lista] of grupos) {
    const coord = buscarCoordenada(chave, listaCoordenadas) || outrosCoord;
    if (!porRegiao.has(coord.id)) porRegiao.set(coord.id, { ...coord, pedidos: [] });
    porRegiao.get(coord.id).pedidos.push(...lista);
  }
```

por:

```js
  const listaCoordenadas = modo === "cidades" ? MAPA_CIDADES : MAPA_BAIRROS;
  const outrosCoord = modo === "cidades" ? MAPA_CIDADES_OUTROS : MAPA_BAIRROS_OUTROS;
  const tipoRegiao = modo === "cidades" ? "cidade" : "bairro";

  const chavesNaoResolvidas = [...grupos.keys()]
    .filter((chave) => !buscarCoordenada(chave, listaCoordenadas))
    .map((chave) => normalizar(chave));
  const cache = await buscarCoordenadasCache(empresaId, tipoRegiao, chavesNaoResolvidas);

  const porRegiao = new Map();
  for (const [chave, lista] of grupos) {
    const coord = buscarCoordenada(chave, listaCoordenadas) || cache.get(normalizar(chave)) || outrosCoord;
    if (!porRegiao.has(coord.id)) porRegiao.set(coord.id, { ...coord, pedidos: [] });
    porRegiao.get(coord.id).pedidos.push(...lista);
  }
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest dashboardGestorService.test.js`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(mapa): buscarMapa usa cache de regioes geocodificadas antes de cair em Outros"
```

---

### Task 8: Rota de backfill + wrapper em `dashboardGestorService`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js` (nova função + export)
- Modify: `backend/src/routes/dashboardGestorRoutes.js:66-73`

**Interfaces:**
- Consumes: `backfillRegioes(empresaId)` (Task 5, já importado na Task 7).
- Produces: `POST /dashboard-gestor/mapa/backfill-regioes` → `{ total, ok, falhou }`.

Este projeto não tem testes automatizados de rota (nenhum arquivo `*Routes.test.js` em `backend/src/__tests__`) — rotas são verificadas manualmente. Este task segue o mesmo padrão: sem teste automatizado, com um passo de verificação manual no final.

- [ ] **Step 1: Adicionar `backfillRegioesMapa` em `dashboardGestorService.js`**

Adicionar, antes de `module.exports` (perto de `buscarAgendaSemana`):

```js
async function backfillRegioesMapa(empresaId) {
  return backfillRegioes(empresaId);
}
```

E adicionar `backfillRegioesMapa,` na lista de `module.exports` (junto com `buscarMapa`).

- [ ] **Step 2: Adicionar a rota**

Em `backend/src/routes/dashboardGestorRoutes.js`, depois do bloco da rota `/mapa` (linhas 66-73), adicionar:

```js
router.post("/mapa/backfill-regioes", async (req, res) => {
  try {
    res.json(await svc.backfillRegioesMapa(req.user.empresa_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao rodar backfill de regiões." });
  }
});
```

- [ ] **Step 3: Rodar a suíte completa do backend**

Run: `cd backend && npx jest`
Expected: PASS (nenhum teste quebrado pela nova rota/função — ela não tem teste próprio, mas não deve derrubar nada existente).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/routes/dashboardGestorRoutes.js
git commit -m "feat(mapa): adiciona rota de backfill das regioes geograficas de pedidos existentes"
```

- [ ] **Step 5: Verificação manual (rodar o backfill de verdade, uma vez)**

Com o backend local rodando e logado como usuário com permissão `ADMIN_MASTER` ou `OPERADOR_AGENDA`, disparar (trocando `<TOKEN>` pelo token de auth da sessão):

```bash
curl -X POST http://localhost:3000/dashboard-gestor/mapa/backfill-regioes -H "Authorization: Bearer <TOKEN>"
```

Expected: resposta JSON `{ "total": N, "ok": N, "falhou": 0 }` (algum `falhou` é aceitável se uma cidade/bairro digitado for texto sem sentido geográfico). Depois, abrir a tela do Dashboard do Gestor no navegador e conferir que o mapa não muda de comportamento pra bairros/cidades já conhecidos, e que os que antes caíam em "Outros" (se algum tiver sido geocodificado com sucesso) agora aparecem com nome próprio.

---

## Verificação final

- [ ] Rodar `cd backend && npx jest` uma última vez — suíte inteira passando.
- [ ] Testar na tela do Dashboard do Gestor: criar um pedido novo com uma cidade ou bairro inventado (que não exista nas listas fixas), esperar alguns segundos, recarregar o mapa e conferir que a região aparece com nome e posição próprios (ou, na pior hipótese, que a geocodificação não achou nada e ela continua em "Outros" sem erro no console do navegador/servidor).
- [ ] Lembrar de aplicar a migration `regioes_geo.sql` no Supabase manualmente (fora do escopo automatizável desta sessão).
