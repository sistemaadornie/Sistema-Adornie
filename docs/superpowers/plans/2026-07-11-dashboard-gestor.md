# Dashboard do Gestor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o protótipo "Dashboard Adornie" como uma página real (`/dashboard`) com dados 100% reais: KPIs, funil de produção (8 etapas), alertas de prazo, mapa de clientes por bairro/cidade, agenda da semana e faturamento por consultora, integrada ao design system atual (tema dark/dourado).

**Architecture:** Backend novo (`dashboardGestorService.js` + `dashboardGestorRoutes.js`, montado em `/api/dashboard-gestor`) que reaproveita `dashboardService.listarPedidosDashboard` (chamado com a permissão `DASHBOARD_PEDIDOS_GERAL` forçada) como fonte única de pedidos enriquecidos por etapa/alerta, filtrando e agregando o restante em memória (JS) para minimizar round-trips ao banco. Frontend novo (`Dashboard.jsx`), página única com 6 seções independentes, reaproveitando classes `ek-*`/`rel-*` já existentes.

**Tech Stack:** Node/Express + `pg` (raw SQL) no backend, Jest para testes de serviço. React + Vite no frontend, `fetch` via `services/api.js`, CSS puro com variáveis do tema (`theme.css`).

## Global Constraints

- Nenhuma permissão nova — gate `["ADMIN_MASTER", "OPERADOR_AGENDA"]` em todas as rotas (igual a `/api/relatorios`).
- `status = 'cancelado'` é excluído de todos os agregados de faturamento/contagem/funil/mapa/consultoras. Valores válidos de `pedidos.status`: `'pendente'`, `'em_andamento'`, `'concluido'`, `'cancelado'`.
- `nivel_alerta` (de `dashboardService.calcNivelAlerta`) usa os literais `"atrasado"`, `"urgente"`, `"atencao"` (sem acento) — a UI traduz para os rótulos exibidos.
- `periodo` é sempre `"mes" | "trimestre" | "ano"` (default `"mes"`), com limites de calendário civil (não janela rolante). Comparação "período anterior" é o período civil imediatamente anterior completo.
- **`periodo` filtra**: `faturamento` (KPI), `funil`, `mapa`, `consultoras`. **`periodo` NÃO filtra** (são snapshots/forward-looking): `pedidosAtivos`/`prazosEmRisco` (KPIs), `alertas`, `agenda-semana`, `instalacoesSemana` (KPI, tem sua própria janela de 7 dias fixa).
- `consultora_id`/`cidade` filtram todos os endpoints exceto `consultoras` (que ignora `consultora_id`, pois é o próprio ranking por consultora) e `filtros` (que não recebe nenhum filtro, é a fonte dos selects).
- Datas de `pedidos.data_pedido` retornadas pelo driver `pg` para colunas `DATE` são objetos `Date` em meia-noite UTC — sempre normalizar com `new Date(v).toISOString().slice(0, 10)` para comparação por string `YYYY-MM-DD`, nunca usar métodos locais (`getDate()`/`getMonth()`) nelas.

---

## File Structure

**Backend:**
- Modify: `backend/src/services/dashboardService.js` — extrai `calcularPrazoEAlerta`, adiciona 4 colunas (`cidade`, `bairro`, `data_pedido`, `cliente_id`) ao SELECT e ao objeto de retorno de `listarPedidosDashboard`.
- Create: `backend/src/utils/periodoGestor.js` — `getPeriodoAtual`/`getPeriodoAnterior`.
- Create: `backend/src/config/dashboardGestorConfig.js` — dicionário estático de etapas do funil e coordenadas curadas do mapa.
- Create: `backend/src/services/dashboardGestorService.js` — toda a lógica de agregação (8 funções exportadas).
- Create: `backend/src/routes/dashboardGestorRoutes.js` — 8 endpoints.
- Modify: `backend/server.js` — monta a rota.
- Create: `backend/src/__tests__/dashboardService.calcularPrazoEAlerta.test.js`
- Create: `backend/src/__tests__/periodoGestor.test.js`
- Create: `backend/src/__tests__/dashboardGestorService.test.js`

**Frontend:**
- Create: `frontend-web/src/pages/Dashboard.jsx`
- Create: `frontend-web/src/pages/Dashboard.css`
- Modify: `frontend-web/src/App.jsx` — rota `/dashboard`.
- Modify: `frontend-web/src/components/Sidebar.jsx` — item de navegação.

---

### Task 1: Extrair `calcularPrazoEAlerta` e adicionar colunas de endereço/data em `dashboardService.js`

**Files:**
- Modify: `backend/src/services/dashboardService.js:97-133` (SELECT), `:372-435` (map de retorno), `:919` (module.exports)
- Test: `backend/src/__tests__/dashboardService.calcularPrazoEAlerta.test.js`

**Interfaces:**
- Produces: `calcularPrazoEAlerta(preAgendamentos, hoje = new Date())` → `{ proximoPrazo: string|null, diasParaPrazo: number|null, nivelAlerta: string|null }`. Exportado de `dashboardService.js`.
- Produces: `listarPedidosDashboard` agora retorna, além dos campos existentes, `cliente_id`, `cidade`, `bairro`, `data_pedido` em cada pedido.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/__tests__/dashboardService.calcularPrazoEAlerta.test.js`:

```js
const { calcularPrazoEAlerta } = require("../services/dashboardService");

describe("calcularPrazoEAlerta", () => {
  const hoje = new Date("2026-07-11T12:00:00Z");

  test("sem pré-agendamentos futuros -> tudo null", () => {
    const r = calcularPrazoEAlerta([], hoje);
    expect(r).toEqual({ proximoPrazo: null, diasParaPrazo: null, nivelAlerta: null });
  });

  test("ignora pré-agendamentos com status diferente de pre_agendado/agendado", () => {
    const r = calcularPrazoEAlerta(
      [{ status: "concluido", data_inicio: "2026-07-12" }],
      hoje
    );
    expect(r.proximoPrazo).toBeNull();
  });

  test("pega o pré-agendamento futuro mais próximo e calcula dias/nível", () => {
    const r = calcularPrazoEAlerta(
      [
        { status: "agendado", data_inicio: "2026-07-20" },
        { status: "pre_agendado", data_inicio: "2026-07-13" },
      ],
      hoje
    );
    expect(r.proximoPrazo).toBe("2026-07-13");
    expect(r.diasParaPrazo).toBe(1);
    expect(r.nivelAlerta).toBe("urgente");
  });

  test("prazo já passado -> nivelAlerta atrasado", () => {
    const r = calcularPrazoEAlerta(
      [{ status: "agendado", data_inicio: "2026-07-05" }],
      hoje
    );
    expect(r.diasParaPrazo).toBeLessThanOrEqual(0);
    expect(r.nivelAlerta).toBe("atrasado");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardService.calcularPrazoEAlerta -v`
Expected: FAIL — `calcularPrazoEAlerta is not a function` (ainda não exportada).

- [ ] **Step 3: Extrair a função em `dashboardService.js`**

Adicionar logo após `calcNivelAlerta` (depois da linha 12, antes de `function calcularEtapaAtual`):

```js
function calcularPrazoEAlerta(preAgendamentos, hoje = new Date()) {
  const futuros = (preAgendamentos || []).filter(
    (a) => a.status === "pre_agendado" || a.status === "agendado"
  );
  futuros.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
  const proximoPrazo = futuros[0]?.data_inicio || null;
  const diasParaPrazo = proximoPrazo
    ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
    : null;
  return { proximoPrazo, diasParaPrazo, nivelAlerta: calcNivelAlerta(diasParaPrazo) };
}
```

Em `listarPedidosDashboard`, substituir o bloco (linhas ~374-383):

```js
    const preAgendamentos = preAgsPorPedido[p.id] || [];
    const futuros = preAgendamentos.filter(
      (a) => a.status === "pre_agendado" || a.status === "agendado"
    );
    futuros.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
    const proximoPrazo = futuros[0]?.data_inicio || null;
    const diasParaPrazo = proximoPrazo
      ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
      : null;
```

por:

```js
    const preAgendamentos = preAgsPorPedido[p.id] || [];
    const { proximoPrazo, diasParaPrazo, nivelAlerta } = calcularPrazoEAlerta(preAgendamentos, hoje);
```

E no objeto de retorno (linhas ~412-435), trocar `nivel_alerta: calcNivelAlerta(diasParaPrazo),` por `nivel_alerta: nivelAlerta,`.

- [ ] **Step 4: Adicionar as 4 colunas ao SELECT e ao retorno**

No SELECT de `listarPedidosDashboard` (linha ~104, logo após `p.total,`):

```js
       p.total,
       p.cliente_id,
       p.cidade,
       p.bairro,
       p.data_pedido,
       p.created_at AS criado_em,
```

No objeto de retorno (linha ~412 em diante), adicionar os 4 campos:

```js
    return {
      id: p.id,
      numero_sequencial: p.numero_sequencial,
      numero_origem: p.numero_origem,
      status: p.status,
      cliente_id: p.cliente_id,
      cliente_nome: p.cliente_nome,
      consultor_id: p.consultor_id,
      consultor_nome: p.consultor_nome,
      total: p.total,
      cidade: p.cidade,
      bairro: p.bairro,
      data_pedido: p.data_pedido,
      itens_count: Number(p.itens_count),
      criado_em: p.criado_em,
      estagio: {
        pdf_ok: p.pdf_ok,
        verificacao_ok: p.verificacao_ok,
        categorizacao_ok: p.categorizacao_ok,
        vinculos_ok: p.vinculos_ok,
        etapa_atual,
        pre_agendamentos: preAgendamentos,
        proximo_prazo: proximoPrazo,
        dias_para_prazo: diasParaPrazo,
        nivel_alerta: nivelAlerta,
      },
    };
```

Por fim, exportar a nova função (linha 919):

```js
module.exports = { listarPedidosDashboard, buscarFluxoPedido, calcularEtapaAtual, calcularPrazoEAlerta };
```

- [ ] **Step 5: Rodar o teste novamente e confirmar que passa**

Run: `cd backend && npx jest dashboardService.calcularPrazoEAlerta -v`
Expected: PASS (4/4 testes).

- [ ] **Step 6: Rodar a suíte inteira de `dashboardService` para confirmar que nada quebrou**

Run: `cd backend && npx jest dashboardService -v`
Expected: PASS em todos os testes existentes (`dashboardService.test.js` e `dashboardService.buscarFluxoPedido.test.js`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/__tests__/dashboardService.calcularPrazoEAlerta.test.js
git commit -m "refactor(dashboard): extrai calcularPrazoEAlerta e expõe endereço/data em listarPedidosDashboard"
```

---

### Task 2: `periodoGestor.js` — bucketing de calendário

**Files:**
- Create: `backend/src/utils/periodoGestor.js`
- Test: `backend/src/__tests__/periodoGestor.test.js`

**Interfaces:**
- Produces: `getPeriodoAtual(periodo, hoje = new Date())` → `{ inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }`
- Produces: `getPeriodoAnterior(periodo, hoje = new Date())` → `{ inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }`

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/__tests__/periodoGestor.test.js`:

```js
const { getPeriodoAtual, getPeriodoAnterior } = require("../utils/periodoGestor");

const HOJE = new Date(2026, 6, 11); // 11/jul/2026 (mês 6 = julho, 0-indexed)

describe("getPeriodoAtual", () => {
  test("mes -> do dia 1 do mês atual até hoje", () => {
    expect(getPeriodoAtual("mes", HOJE)).toEqual({ inicio: "2026-07-01", fim: "2026-07-11" });
  });

  test("trimestre -> do início do trimestre civil até hoje", () => {
    expect(getPeriodoAtual("trimestre", HOJE)).toEqual({ inicio: "2026-07-01", fim: "2026-07-11" });
  });

  test("ano -> de 1/jan até hoje", () => {
    expect(getPeriodoAtual("ano", HOJE)).toEqual({ inicio: "2026-01-01", fim: "2026-07-11" });
  });

  test("default é mes quando periodo é inválido/ausente", () => {
    expect(getPeriodoAtual(undefined, HOJE)).toEqual({ inicio: "2026-07-01", fim: "2026-07-11" });
  });
});

describe("getPeriodoAnterior", () => {
  test("mes -> mês civil anterior completo", () => {
    expect(getPeriodoAnterior("mes", HOJE)).toEqual({ inicio: "2026-06-01", fim: "2026-06-30" });
  });

  test("mes -> vira o ano corretamente (janeiro -> dezembro do ano anterior)", () => {
    const janeiro = new Date(2026, 0, 15);
    expect(getPeriodoAnterior("mes", janeiro)).toEqual({ inicio: "2025-12-01", fim: "2025-12-31" });
  });

  test("trimestre -> trimestre civil anterior completo (Q3 -> Q2)", () => {
    expect(getPeriodoAnterior("trimestre", HOJE)).toEqual({ inicio: "2026-04-01", fim: "2026-06-30" });
  });

  test("trimestre -> vira o ano (Q1 -> Q4 do ano anterior)", () => {
    const janeiro = new Date(2026, 0, 15);
    expect(getPeriodoAnterior("trimestre", janeiro)).toEqual({ inicio: "2025-10-01", fim: "2025-12-31" });
  });

  test("ano -> ano civil anterior completo", () => {
    expect(getPeriodoAnterior("ano", HOJE)).toEqual({ inicio: "2025-01-01", fim: "2025-12-31" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest periodoGestor -v`
Expected: FAIL — `Cannot find module '../utils/periodoGestor'`.

- [ ] **Step 3: Implementar**

Criar `backend/src/utils/periodoGestor.js`:

```js
"use strict";

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inicioMes(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function inicioTrimestre(d) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function inicioAno(d) {
  return new Date(d.getFullYear(), 0, 1);
}

function inicioDoPeriodo(periodo, hoje) {
  if (periodo === "trimestre") return inicioTrimestre(hoje);
  if (periodo === "ano") return inicioAno(hoje);
  return inicioMes(hoje);
}

function getPeriodoAtual(periodo, hoje = new Date()) {
  return { inicio: toISODate(inicioDoPeriodo(periodo, hoje)), fim: toISODate(hoje) };
}

function getPeriodoAnterior(periodo, hoje = new Date()) {
  const inicioAtual = inicioDoPeriodo(periodo, hoje);
  const fimAnterior = new Date(inicioAtual);
  fimAnterior.setDate(fimAnterior.getDate() - 1);
  const inicioAnterior = inicioDoPeriodo(periodo, fimAnterior);
  return { inicio: toISODate(inicioAnterior), fim: toISODate(fimAnterior) };
}

module.exports = { getPeriodoAtual, getPeriodoAnterior };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest periodoGestor -v`
Expected: PASS (10/10 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/periodoGestor.js backend/src/__tests__/periodoGestor.test.js
git commit -m "feat(dashboard): adiciona periodoGestor para bucketing de calendário mes/trimestre/ano"
```

---

### Task 3: Config estática — etapas do funil e coordenadas do mapa

**Files:**
- Create: `backend/src/config/dashboardGestorConfig.js`

**Interfaces:**
- Produces: `ETAPAS_FUNIL` (array de 8 `{ numero, nome, responsavel, descricao }`), `MAPA_BAIRROS`, `MAPA_BAIRROS_OUTROS`, `MAPA_CIDADES`, `MAPA_CIDADES_OUTROS` (arrays/objetos `{ id, nome, x, y }`), `buscarCoordenada(nome, lista)`.

Dados estáticos, sem lógica de negócio a testar isoladamente — a cobertura vem via os testes de `dashboardGestorService` (Task 7/9) que exercitam `buscarCoordenada` e o fallback "Outros".

- [ ] **Step 1: Criar o arquivo**

Criar `backend/src/config/dashboardGestorConfig.js`:

```js
"use strict";

const ETAPAS_FUNIL = [
  { numero: 1, nome: "Verificação",  responsavel: "Consultoras",           descricao: "Conferência do PDF, categorização dos itens e vínculos do pedido." },
  { numero: 2, nome: "Conferência",  responsavel: "Equipe de conferência", descricao: "Medição em campo e preenchimento da ficha das consultoras." },
  { numero: 3, nome: "Confecção",    responsavel: "Ateliê / fornecedores", descricao: "Produção das peças no ateliê e com fornecedores parceiros." },
  { numero: 4, nome: "Produto",      responsavel: "Estoque",               descricao: "Produto pronto e conferido, aguardando separação." },
  { numero: 5, nome: "Agendamento",  responsavel: "Coordenação",           descricao: "Definição de equipe, veículo e data da instalação." },
  { numero: 6, nome: "Separação",    responsavel: "Almoxarifado",          descricao: "Itens separados e carregados para a instalação." },
  { numero: 7, nome: "Instalação",   responsavel: "Equipes de campo",      descricao: "Execução da instalação no endereço do cliente." },
  { numero: 8, nome: "Concluído",    responsavel: "—",                     descricao: "Pedido finalizado e entregue ao cliente." },
];

const MAPA_BAIRROS = [
  { id: "batel",            nome: "Batel",            x: 44, y: 54 },
  { id: "aguaverde",        nome: "Água Verde",       x: 39, y: 69 },
  { id: "bigorrilho",       nome: "Bigorrilho",       x: 33, y: 44 },
  { id: "centro",           nome: "Centro",           x: 56, y: 39 },
  { id: "ecoville",         nome: "Ecoville",         x: 22, y: 60 },
  { id: "cabral",           nome: "Cabral",           x: 62, y: 29 },
  { id: "juveve",           nome: "Juvevê",           x: 66, y: 46 },
  { id: "portao",           nome: "Portão",           x: 47, y: 80 },
  { id: "santafelicidade",  nome: "Sta. Felicidade",  x: 26, y: 28 },
  { id: "altoxv",           nome: "Alto da XV",       x: 72, y: 60 },
];
const MAPA_BAIRROS_OUTROS = { id: "outros", nome: "Outros", x: 90, y: 88 };

const MAPA_CIDADES = [
  { id: "cwb", nome: "Curitiba",            x: 40, y: 52 },
  { id: "bc",  nome: "Balneário Camboriú",  x: 80, y: 74 },
  { id: "sjp", nome: "S. José dos Pinhais", x: 52, y: 63 },
  { id: "joi", nome: "Joinville",           x: 70, y: 56 },
  { id: "fln", nome: "Florianópolis",       x: 82, y: 86 },
  { id: "blu", nome: "Blumenau",            x: 68, y: 66 },
  { id: "pg",  nome: "Ponta Grossa",        x: 24, y: 44 },
  { id: "mga", nome: "Maringá",             x: 16, y: 30 },
];
const MAPA_CIDADES_OUTROS = { id: "outros", nome: "Outros", x: 90, y: 88 };

function buscarCoordenada(nome, lista) {
  const alvo = (nome || "").trim().toLowerCase();
  if (!alvo) return null;
  return lista.find((r) => r.nome.toLowerCase() === alvo) || null;
}

module.exports = {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada,
};
```

- [ ] **Step 2: Verificar que carrega sem erro**

Run: `cd backend && node -e "console.log(require('./src/config/dashboardGestorConfig').ETAPAS_FUNIL.length, require('./src/config/dashboardGestorConfig').buscarCoordenada('Batel', require('./src/config/dashboardGestorConfig').MAPA_BAIRROS)?.id)"`
Expected: `8 batel`

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/dashboardGestorConfig.js
git commit -m "feat(dashboard): adiciona config estática de etapas do funil e coordenadas do mapa"
```

---

### Task 4: `dashboardGestorService.js` — `buscarFiltros` e `buscarPedidosEnriquecidos`

**Files:**
- Create: `backend/src/services/dashboardGestorService.js`
- Test: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Consumes: `dashboardService.listarPedidosDashboard(empresaId, userId, permissoes, filtros)` de `backend/src/services/dashboardService.js` (Task 1).
- Consumes: `db.query` de `backend/src/database/db.js`.
- Produces: `buscarFiltros(empresaId)` → `{ consultoras: [{id, nome}], cidades: [string] }`.
- Produces (interno, não exportado): `buscarPedidosEnriquecidos(empresaId, { consultoraId })` → array de pedidos (mesmo shape de `listarPedidosDashboard`).
- Produces (interno): `filtrarPorCidade`, `filtrarPorPeriodo`, `filtrarAtivos`, `filtrarNaoCancelados` — helpers puros usados pelas demais funções (Tasks 5-9).

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/src/__tests__/dashboardGestorService.test.js`:

```js
jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../services/dashboardService", () => ({
  listarPedidosDashboard: jest.fn(),
}));
const db = require("../database/db");
const dashboardService = require("../services/dashboardService");
const svc = require("../services/dashboardGestorService");

afterEach(() => jest.clearAllMocks());

describe("buscarFiltros", () => {
  test("retorna consultoras (permissão COMERCIAL) e cidades distintas de pedidos", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: "Marina Alencar" }, { id: 2, nome: "Letícia Prado" }] })
      .mockResolvedValueOnce({ rows: [{ cidade: "Curitiba" }, { cidade: "Joinville" }] });

    const r = await svc.buscarFiltros(7);

    expect(r).toEqual({
      consultoras: [{ id: 1, nome: "Marina Alencar" }, { id: 2, nome: "Letícia Prado" }],
      cidades: ["Curitiba", "Joinville"],
    });
    expect(db.query.mock.calls[0][1]).toEqual([7]);
    expect(db.query.mock.calls[1][1]).toEqual([7]);
  });
});

describe("buscarKpis usa buscarPedidosEnriquecidos com DASHBOARD_PEDIDOS_GERAL forçado", () => {
  test("chama listarPedidosDashboard com userId null e a permissão geral", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([]);
    db.query.mockResolvedValue({ rows: [{ valor: 0 }] });

    await svc.buscarKpis(7, { periodo: "mes", consultoraId: 12, cidade: null });

    expect(dashboardService.listarPedidosDashboard).toHaveBeenCalledWith(
      7, null, ["DASHBOARD_PEDIDOS_GERAL"], { consultora_id: 12, status: null, alerta: null }
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `Cannot find module '../services/dashboardGestorService'`.

- [ ] **Step 3: Implementar o esqueleto do serviço com `buscarFiltros`, `buscarPedidosEnriquecidos` e os helpers de filtro**

Criar `backend/src/services/dashboardGestorService.js`:

```js
"use strict";
const db = require("../database/db");
const dashboardService = require("./dashboardService");
const { getPeriodoAtual, getPeriodoAnterior } = require("../utils/periodoGestor");
const {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada,
} = require("../config/dashboardGestorConfig");

async function buscarPedidosEnriquecidos(empresaId, { consultoraId } = {}) {
  return dashboardService.listarPedidosDashboard(
    empresaId,
    null,
    ["DASHBOARD_PEDIDOS_GERAL"],
    { consultora_id: consultoraId || null, status: null, alerta: null }
  );
}

function filtrarPorCidade(pedidos, cidade) {
  if (!cidade) return pedidos;
  const alvo = cidade.toLowerCase();
  return pedidos.filter((p) => (p.cidade || "").toLowerCase() === alvo);
}

function filtrarPorPeriodo(pedidos, periodoRange) {
  return pedidos.filter((p) => {
    if (!p.data_pedido) return false;
    const iso = new Date(p.data_pedido).toISOString().slice(0, 10);
    return iso >= periodoRange.inicio && iso <= periodoRange.fim;
  });
}

function filtrarAtivos(pedidos) {
  return pedidos.filter((p) => !["concluido", "cancelado"].includes(p.status));
}

function filtrarNaoCancelados(pedidos) {
  return pedidos.filter((p) => p.status !== "cancelado");
}

async function buscarFiltros(empresaId) {
  const [{ rows: consultoras }, { rows: cidadesRows }] = await Promise.all([
    db.query(
      `SELECT DISTINCT u.id, u.nome_completo AS nome
       FROM usuarios u
       JOIN usuario_permissoes up ON up.usuario_id = u.id
       JOIN permissoes perm ON perm.id = up.permissao_id
       WHERE u.empresa_id = $1 AND u.status = 'aprovado'
         AND (perm.codigo = 'COMERCIAL' OR perm.nome = 'COMERCIAL')
       ORDER BY u.nome_completo`,
      [empresaId]
    ),
    db.query(
      `SELECT DISTINCT cidade
       FROM pedidos
       WHERE empresa_id = $1 AND cidade IS NOT NULL AND cidade != '' AND status != 'cancelado'
       ORDER BY cidade`,
      [empresaId]
    ),
  ]);
  return { consultoras, cidades: cidadesRows.map((r) => r.cidade) };
}

module.exports = {
  buscarFiltros,
};

// Exporta helpers internos só para reuso entre as próximas tasks deste mesmo arquivo.
module.exports._internal = {
  buscarPedidosEnriquecidos, filtrarPorCidade, filtrarPorPeriodo, filtrarAtivos, filtrarNaoCancelados,
  getPeriodoAtual, getPeriodoAnterior, ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS, MAPA_CIDADES, MAPA_CIDADES_OUTROS, buscarCoordenada,
};
```

*(O bloco `module.exports._internal` é temporário só para este arquivo compilar de forma independente nesta task; a Task 5 vai reescrever `module.exports` para incluir todas as funções públicas de uma vez — não deixe o `_internal` na versão final.)*

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS nos 2 testes escritos até aqui (os outros `describe` serão adicionados nas próximas tasks, no mesmo arquivo de teste).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): cria dashboardGestorService com buscarFiltros e helpers de filtro"
```

---

### Task 5: `buscarKpis`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js`
- Modify: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Consumes: `buscarPedidosEnriquecidos`, `filtrarPorCidade`, `filtrarPorPeriodo`, `filtrarAtivos`, `filtrarNaoCancelados`, `getPeriodoAtual`, `getPeriodoAnterior` (Task 4).
- Produces: `buscarKpis(empresaId, { periodo, consultoraId, cidade })` → `{ faturamento: {valor, deltaPct}, pedidosAtivos: {valor}, prazosEmRisco: {valor}, instalacoesSemana: {valor, deltaAbs} }`.
- Produces (interno): `contarInstalacoesSemana(empresaId, {consultoraId, cidade}, deslocamentoSemanas)`.

- [ ] **Step 1: Adicionar os testes de `buscarKpis` (substituindo o `describe` provisório da Task 4)**

Em `backend/src/__tests__/dashboardGestorService.test.js`, substituir o `describe("buscarKpis usa buscarPedidosEnriquecidos...")` por:

```js
describe("buscarKpis", () => {
  const pedidosMock = [
    { id: 1, status: "em_andamento", total: "1000.00", data_pedido: "2026-07-05", cidade: "Curitiba", estagio: { nivel_alerta: "urgente" } },
    { id: 2, status: "concluido",    total: "2000.00", data_pedido: "2026-07-02", cidade: "Curitiba", estagio: { nivel_alerta: null } },
    { id: 3, status: "cancelado",    total: "9999.00", data_pedido: "2026-07-01", cidade: "Curitiba", estagio: { nivel_alerta: null } },
    { id: 4, status: "pendente",     total: "500.00",  data_pedido: "2026-06-15", cidade: "Curitiba", estagio: { nivel_alerta: null } },
  ];

  beforeEach(() => {
    dashboardService.listarPedidosDashboard.mockResolvedValue(pedidosMock);
    db.query.mockResolvedValue({ rows: [{ valor: 0 }] });
  });

  test("faturamento soma pedidos não cancelados dentro do período (mes = 2026-07-01..hoje)", async () => {
    const hoje = new Date(2026, 6, 11);
    const r = await svc.buscarKpis(7, { periodo: "mes", consultoraId: null, cidade: null }, hoje);
    // pedidos 1 (1000) e 2 (2000) estão em julho; pedido 3 é cancelado (excluído); pedido 4 é de junho.
    expect(r.faturamento.valor).toBe(3000);
  });

  test("pedidosAtivos conta status não concluído/cancelado, sem filtro de período", async () => {
    const r = await svc.buscarKpis(7, { periodo: "mes", consultoraId: null, cidade: null }, new Date(2026, 6, 11));
    // ativos: pedido 1 (em_andamento) e pedido 4 (pendente) = 2. pedido 2 concluido e 3 cancelado ficam de fora.
    expect(r.pedidosAtivos.valor).toBe(2);
  });

  test("prazosEmRisco conta ativos com nivel_alerta setado", async () => {
    const r = await svc.buscarKpis(7, { periodo: "mes", consultoraId: null, cidade: null }, new Date(2026, 6, 11));
    expect(r.prazosEmRisco.valor).toBe(1); // só o pedido 1
  });

  test("deltaPct é 0 quando não há faturamento em nenhum dos dois períodos", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([]);
    const r = await svc.buscarKpis(7, { periodo: "mes" }, new Date(2026, 6, 11));
    expect(r.faturamento).toEqual({ valor: 0, deltaPct: 0 });
  });

  test("deltaPct é 100 quando período anterior é zero mas o atual tem faturamento", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "500", data_pedido: "2026-07-05", cidade: "Curitiba", estagio: {} },
    ]);
    const r = await svc.buscarKpis(7, { periodo: "mes" }, new Date(2026, 6, 11));
    expect(r.faturamento).toEqual({ valor: 500, deltaPct: 100 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `svc.buscarKpis is not a function`.

- [ ] **Step 3: Implementar `buscarKpis` e `contarInstalacoesSemana`**

Em `backend/src/services/dashboardGestorService.js`, adicionar antes do `module.exports` final:

```js
async function contarInstalacoesSemana(empresaId, { consultoraId, cidade }, deslocamentoSemanas) {
  const params = [empresaId];
  const cond = [
    "a.empresa_id = $1",
    "a.tipo = 'Instalação'",
    "a.status NOT IN ('cancelado','rejeitado')",
  ];
  cond.push(
    deslocamentoSemanas === 0
      ? "a.data BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'"
      : "a.data BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE - INTERVAL '1 day'"
  );
  if (consultoraId) {
    params.push(Number(consultoraId));
    cond.push(`p.consultor_id = $${params.length}`);
  }
  if (cidade) {
    params.push(cidade);
    cond.push(`LOWER(p.cidade) = LOWER($${params.length})`);
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS valor
     FROM agendamentos a
     LEFT JOIN pedidos p ON p.id = a.pedido_id
     WHERE ${cond.join(" AND ")}`,
    params
  );
  return rows[0].valor;
}

async function buscarKpis(empresaId, filtros = {}, hoje = new Date()) {
  const { periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const periodoAnterior = getPeriodoAnterior(periodo, hoje);

  const pedidos = filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade);
  const naoCancelados = filtrarNaoCancelados(pedidos);

  const fatAtual = filtrarPorPeriodo(naoCancelados, periodoAtual).reduce((s, p) => s + Number(p.total || 0), 0);
  const fatAnterior = filtrarPorPeriodo(naoCancelados, periodoAnterior).reduce((s, p) => s + Number(p.total || 0), 0);
  const deltaPct = fatAnterior > 0
    ? Number((((fatAtual - fatAnterior) / fatAnterior) * 100).toFixed(1))
    : (fatAtual > 0 ? 100 : 0);

  const ativos = filtrarAtivos(pedidos);
  const emRisco = ativos.filter((p) => p.estagio.nivel_alerta);

  const [instalAtual, instalAnterior] = await Promise.all([
    contarInstalacoesSemana(empresaId, { consultoraId, cidade }, 0),
    contarInstalacoesSemana(empresaId, { consultoraId, cidade }, -1),
  ]);

  return {
    faturamento: { valor: fatAtual, deltaPct },
    pedidosAtivos: { valor: ativos.length },
    prazosEmRisco: { valor: emRisco.length },
    instalacoesSemana: { valor: instalAtual, deltaAbs: instalAtual - instalAnterior },
  };
}
```

Atualizar o `module.exports` final do arquivo (remover o `_internal` provisório da Task 4):

```js
module.exports = {
  buscarFiltros,
  buscarKpis,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): implementa buscarKpis"
```

---

### Task 6: `buscarFunil` e `buscarFunilDetalhe`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js`
- Modify: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Produces: `buscarFunil(empresaId, {periodo, consultoraId, cidade}, hoje)` → `{ totalAtivos, etapas: [{numero, nome, count, gargalo}] }` (8 itens, `ETAPAS_FUNIL` como base).
- Produces: `buscarFunilDetalhe(empresaId, numero, {periodo, consultoraId, cidade}, hoje)` → `{ numero, nome, descricao, responsavel, count, exemplos: [{numero, cliente}] }`, lança erro `{status:400}` se `numero` não é 1-8.

- [ ] **Step 1: Adicionar os testes**

Adicionar em `backend/src/__tests__/dashboardGestorService.test.js`:

```js
describe("buscarFunil", () => {
  test("agrupa pedidos ativos por etapa_atual e marca a de maior contagem como gargalo", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 1, estagio: { etapa_atual: 3 } },
      { id: 2, status: "pendente", total: "100", data_pedido: "2026-07-06", cidade: "Curitiba", numero_sequencial: 2, estagio: { etapa_atual: 3 } },
      { id: 3, status: "pendente", total: "100", data_pedido: "2026-07-06", cidade: "Curitiba", numero_sequencial: 3, estagio: { etapa_atual: 1 } },
      { id: 4, status: "concluido", total: "100", data_pedido: "2026-07-06", cidade: "Curitiba", numero_sequencial: 4, estagio: { etapa_atual: 8 } },
    ]);

    const r = await svc.buscarFunil(7, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.totalAtivos).toBe(3); // pedido 4 (concluido) não conta como ativo
    const etapa3 = r.etapas.find((e) => e.numero === 3);
    const etapa1 = r.etapas.find((e) => e.numero === 1);
    expect(etapa3).toEqual({ numero: 3, nome: "Confecção", count: 2, gargalo: true });
    expect(etapa1).toEqual({ numero: 1, nome: "Verificação", count: 1, gargalo: false });
    expect(r.etapas).toHaveLength(8);
  });
});

describe("buscarFunilDetalhe", () => {
  test("retorna exemplos e metadados da etapa pedida", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "100", data_pedido: "2026-07-05", cidade: "Curitiba", numero_sequencial: 42, cliente_nome: "Regina", estagio: { etapa_atual: 3 } },
    ]);

    const r = await svc.buscarFunilDetalhe(7, 3, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r).toEqual({
      numero: 3, nome: "Confecção", descricao: expect.any(String), responsavel: "Ateliê / fornecedores",
      count: 1, exemplos: [{ numero: "#42", cliente: "Regina" }],
    });
  });

  test("lança erro 400 para etapa inválida", async () => {
    await expect(svc.buscarFunilDetalhe(7, 99, {})).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `svc.buscarFunil is not a function`.

- [ ] **Step 3: Implementar**

Adicionar em `dashboardGestorService.js`:

```js
async function buscarFunil(empresaId, filtros = {}, hoje = new Date()) {
  const { periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const pedidos = filtrarPorPeriodo(
    filtrarAtivos(filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade)),
    periodoAtual
  );

  const contagem = new Map(ETAPAS_FUNIL.map((e) => [e.numero, 0]));
  for (const p of pedidos) {
    contagem.set(p.estagio.etapa_atual, (contagem.get(p.estagio.etapa_atual) || 0) + 1);
  }

  let etapaGargalo = null;
  for (const [numero, count] of contagem) {
    if (count > 0 && (etapaGargalo === null || count > contagem.get(etapaGargalo))) etapaGargalo = numero;
  }

  const etapas = ETAPAS_FUNIL.map((e) => ({
    numero: e.numero,
    nome: e.nome,
    count: contagem.get(e.numero) || 0,
    gargalo: e.numero === etapaGargalo,
  }));

  return { totalAtivos: pedidos.length, etapas };
}

async function buscarFunilDetalhe(empresaId, numero, filtros = {}, hoje = new Date()) {
  const etapa = ETAPAS_FUNIL.find((e) => e.numero === Number(numero));
  if (!etapa) {
    const err = new Error("Etapa inválida");
    err.status = 400;
    throw err;
  }
  const { periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const pedidos = filtrarPorPeriodo(
    filtrarAtivos(filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade)),
    periodoAtual
  ).filter((p) => p.estagio.etapa_atual === etapa.numero);

  return {
    numero: etapa.numero,
    nome: etapa.nome,
    descricao: etapa.descricao,
    responsavel: etapa.responsavel,
    count: pedidos.length,
    exemplos: pedidos.slice(0, 5).map((p) => ({ numero: `#${p.numero_sequencial}`, cliente: p.cliente_nome })),
  };
}
```

Atualizar `module.exports`:

```js
module.exports = {
  buscarFiltros,
  buscarKpis,
  buscarFunil,
  buscarFunilDetalhe,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): implementa buscarFunil e buscarFunilDetalhe"
```

---

### Task 7: `buscarAlertas`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js`
- Modify: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Produces: `buscarAlertas(empresaId, {consultoraId, cidade})` → `{ total, alertas: [{numeroPedido, cliente, cidade, etapa, consultora, diasParaPrazo, nivel}] }`, ordenado por `diasParaPrazo` crescente, limitado a 20, sem filtro de período.

- [ ] **Step 1: Adicionar o teste**

```js
describe("buscarAlertas", () => {
  test("filtra pedidos ativos com nivel_alerta, ordena por dias_para_prazo e ignora período", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", numero_sequencial: 10, cliente_nome: "A", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 3, nivel_alerta: "urgente", dias_para_prazo: 2 } },
      { id: 2, status: "pendente", numero_sequencial: 11, cliente_nome: "B", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 6, nivel_alerta: "atrasado", dias_para_prazo: -3 } },
      { id: 3, status: "pendente", numero_sequencial: 12, cliente_nome: "C", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 1, nivel_alerta: null, dias_para_prazo: null } },
      { id: 4, status: "concluido", numero_sequencial: 13, cliente_nome: "D", cidade: "Curitiba", consultor_nome: "Marina", estagio: { etapa_atual: 8, nivel_alerta: "atrasado", dias_para_prazo: -10 } },
    ]);

    const r = await svc.buscarAlertas(7, { consultoraId: null, cidade: null });

    expect(r.total).toBe(2);
    expect(r.alertas.map((a) => a.numeroPedido)).toEqual(["#11", "#10"]); // atrasado (-3) antes de urgente (2)
    expect(r.alertas[0]).toEqual({
      numeroPedido: "#11", cliente: "B", cidade: "Curitiba", etapa: "Separação",
      consultora: "Marina", diasParaPrazo: -3, nivel: "atrasado",
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `svc.buscarAlertas is not a function`.

- [ ] **Step 3: Implementar**

```js
async function buscarAlertas(empresaId, filtros = {}) {
  const { consultoraId, cidade } = filtros;
  const pedidos = filtrarAtivos(filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade));
  const comRisco = pedidos
    .filter((p) => p.estagio.nivel_alerta)
    .sort((a, b) => (a.estagio.dias_para_prazo ?? 0) - (b.estagio.dias_para_prazo ?? 0))
    .slice(0, 20);

  const alertas = comRisco.map((p) => ({
    numeroPedido: `#${p.numero_sequencial}`,
    cliente: p.cliente_nome,
    cidade: p.cidade,
    etapa: ETAPAS_FUNIL.find((e) => e.numero === p.estagio.etapa_atual)?.nome || "",
    consultora: p.consultor_nome,
    diasParaPrazo: p.estagio.dias_para_prazo,
    nivel: p.estagio.nivel_alerta,
  }));

  return { total: alertas.length, alertas };
}
```

Atualizar `module.exports` (adicionar `buscarAlertas`).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): implementa buscarAlertas"
```

---

### Task 8: `buscarConsultoras`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js`
- Modify: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Produces: `buscarConsultoras(empresaId, {periodo, cidade}, hoje)` → `{ totalMes, consultoras: [{id, nome, valor, deltaPct}] }`, ordenado por `valor` desc, inclui consultoras com `valor: 0`.

- [ ] **Step 1: Adicionar o teste**

```js
describe("buscarConsultoras", () => {
  test("soma faturamento por consultor no período, inclui quem não vendeu (valor 0), ordena desc", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: "Marina Alencar" }, { id: 2, nome: "Letícia Prado" }] }) // buscarFiltros: consultoras
      .mockResolvedValueOnce({ rows: [] }); // buscarFiltros: cidades
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "1000", data_pedido: "2026-07-05", cidade: "Curitiba", consultor_id: 1 },
      { id: 2, status: "cancelado", total: "9999", data_pedido: "2026-07-05", cidade: "Curitiba", consultor_id: 1 },
      { id: 3, status: "pendente", total: "300", data_pedido: "2026-06-01", cidade: "Curitiba", consultor_id: 1 }, // fora do período
    ]);

    const r = await svc.buscarConsultoras(7, { periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.consultoras).toEqual([
      { id: 1, nome: "Marina Alencar", valor: 1000, deltaPct: 100 },
      { id: 2, nome: "Letícia Prado", valor: 0, deltaPct: 0 },
    ]);
    expect(r.totalMes).toBe(1000);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `svc.buscarConsultoras is not a function`.

- [ ] **Step 3: Implementar**

```js
async function buscarConsultoras(empresaId, filtros = {}, hoje = new Date()) {
  const { periodo = "mes", cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const periodoAnterior = getPeriodoAnterior(periodo, hoje);

  const [{ consultoras: comerciais }, pedidosTodos] = await Promise.all([
    buscarFiltros(empresaId),
    buscarPedidosEnriquecidos(empresaId, {}),
  ]);

  const naoCancelados = filtrarNaoCancelados(filtrarPorCidade(pedidosTodos, cidade));

  const somaPorConsultor = (lista) => {
    const mapa = new Map();
    for (const p of lista) {
      if (!p.consultor_id) continue;
      mapa.set(p.consultor_id, (mapa.get(p.consultor_id) || 0) + Number(p.total || 0));
    }
    return mapa;
  };

  const somaAtual = somaPorConsultor(filtrarPorPeriodo(naoCancelados, periodoAtual));
  const somaAnterior = somaPorConsultor(filtrarPorPeriodo(naoCancelados, periodoAnterior));

  const consultoras = comerciais
    .map((c) => {
      const atual = somaAtual.get(c.id) || 0;
      const anterior = somaAnterior.get(c.id) || 0;
      const deltaPct = anterior > 0
        ? Number((((atual - anterior) / anterior) * 100).toFixed(1))
        : (atual > 0 ? 100 : 0);
      return { id: c.id, nome: c.nome, valor: atual, deltaPct };
    })
    .sort((a, b) => b.valor - a.valor);

  return { totalMes: consultoras.reduce((s, c) => s + c.valor, 0), consultoras };
}
```

Atualizar `module.exports` (adicionar `buscarConsultoras`).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): implementa buscarConsultoras"
```

---

### Task 9: `buscarMapa`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js`
- Modify: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Produces: `buscarMapa(empresaId, {modo, periodo, consultoraId, cidade}, hoje)` → `{ regioes: [{id, nome, x, y, clientes, pedidosAtivos, atendimentos, categoriaPredominante, mix, faturamento, pedidosLista}] }`.
- Produces (interno): `buscarCategoriasPorPedido(pedidoIds)`, `buscarAtendimentosPorPedido(empresaId, pedidoIds)`.

- [ ] **Step 1: Adicionar o teste**

```js
describe("buscarMapa", () => {
  test("modo bairros: agrupa por bairro (só Curitiba), usa coordenada curada e soma 'Outros'", async () => {
    dashboardService.listarPedidosDashboard.mockResolvedValue([
      { id: 1, status: "pendente", total: "1000", data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Batel", cliente_id: 1, numero_sequencial: 1, estagio: { etapa_atual: 3 } },
      { id: 2, status: "pendente", total: "500",  data_pedido: "2026-07-05", cidade: "Curitiba", bairro: "Bairro Desconhecido", cliente_id: 2, numero_sequencial: 2, estagio: { etapa_atual: 1 } },
      { id: 3, status: "pendente", total: "700",  data_pedido: "2026-07-05", cidade: "Joinville", bairro: "Centro", cliente_id: 3, numero_sequencial: 3, estagio: { etapa_atual: 1 } }, // fora de Curitiba, ignorado no modo bairros
    ]);
    db.query
      .mockResolvedValueOnce({ rows: [] }) // categorias por pedido
      .mockResolvedValueOnce({ rows: [] }); // atendimentos por pedido

    const r = await svc.buscarMapa(7, { modo: "bairros", periodo: "mes" }, new Date(2026, 6, 11));

    expect(r.regioes).toHaveLength(2);
    const batel = r.regioes.find((x) => x.id === "batel");
    const outros = r.regioes.find((x) => x.id === "outros");
    expect(batel).toMatchObject({ nome: "Batel", x: 44, y: 54, clientes: 1, pedidosAtivos: 1, faturamento: 1000 });
    expect(outros).toMatchObject({ nome: "Outros", clientes: 1, pedidosAtivos: 1, faturamento: 500 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `svc.buscarMapa is not a function`.

- [ ] **Step 3: Implementar**

```js
async function buscarCategoriasPorPedido(pedidoIds) {
  const mapa = new Map();
  if (!pedidoIds.length) return mapa;
  const { rows } = await db.query(
    `SELECT pi.pedido_id, cat.nome AS categoria, COUNT(*)::int AS qtd
     FROM pedido_itens pi
     JOIN categorias cat ON cat.id = pi.categoria_id
     WHERE pi.pedido_id = ANY($1)
     GROUP BY pi.pedido_id, cat.nome`,
    [pedidoIds]
  );
  for (const r of rows) {
    if (!mapa.has(r.pedido_id)) mapa.set(r.pedido_id, []);
    mapa.get(r.pedido_id).push({ categoria: r.categoria, qtd: r.qtd });
  }
  return mapa;
}

async function buscarAtendimentosPorPedido(empresaId, pedidoIds) {
  const mapa = new Map();
  if (!pedidoIds.length) return mapa;
  const { rows } = await db.query(
    `SELECT a.pedido_id, COUNT(*)::int AS atendimentos
     FROM agendamentos a
     WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2 AND a.status = 'concluido'
     GROUP BY a.pedido_id`,
    [pedidoIds, empresaId]
  );
  for (const r of rows) mapa.set(r.pedido_id, r.atendimentos);
  return mapa;
}

async function buscarMapa(empresaId, filtros = {}, hoje = new Date()) {
  const { modo = "bairros", periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);

  const todos = await buscarPedidosEnriquecidos(empresaId, { consultoraId });
  const noPeriodo = filtrarPorPeriodo(filtrarNaoCancelados(todos), periodoAtual);
  const escopoGeografico = modo === "cidades"
    ? noPeriodo
    : noPeriodo.filter((p) => (p.cidade || "").toLowerCase() === "curitiba");
  const filtrados = filtrarPorCidade(escopoGeografico, cidade);

  const chaveDe = (p) => ((modo === "cidades" ? p.cidade : p.bairro) || "").trim();
  const grupos = new Map();
  for (const p of filtrados) {
    const chave = chaveDe(p);
    if (!chave) continue;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }

  const listaCoordenadas = modo === "cidades" ? MAPA_CIDADES : MAPA_BAIRROS;
  const outrosCoord = modo === "cidades" ? MAPA_CIDADES_OUTROS : MAPA_BAIRROS_OUTROS;

  const porRegiao = new Map();
  for (const [chave, lista] of grupos) {
    const coord = buscarCoordenada(chave, listaCoordenadas) || outrosCoord;
    if (!porRegiao.has(coord.id)) porRegiao.set(coord.id, { ...coord, pedidos: [] });
    porRegiao.get(coord.id).pedidos.push(...lista);
  }

  const pedidoIds = filtrados.map((p) => p.id);
  const [categoriasPorPedido, atendimentosPorPedido] = await Promise.all([
    buscarCategoriasPorPedido(pedidoIds),
    buscarAtendimentosPorPedido(empresaId, pedidoIds),
  ]);

  const regioes = [...porRegiao.values()].map((r) => {
    const clientesUnicos = new Set(r.pedidos.map((p) => p.cliente_id).filter(Boolean));
    const ativos = filtrarAtivos(r.pedidos);
    const faturamento = r.pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
    const atendimentos = r.pedidos.reduce((s, p) => s + (atendimentosPorPedido.get(p.id) || 0), 0);

    const contagemCategorias = new Map();
    for (const p of r.pedidos) {
      for (const c of categoriasPorPedido.get(p.id) || []) {
        contagemCategorias.set(c.categoria, (contagemCategorias.get(c.categoria) || 0) + c.qtd);
      }
    }
    const totalItens = [...contagemCategorias.values()].reduce((s, v) => s + v, 0);
    const mix = [...contagemCategorias.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categoria, qtd]) => ({ categoria, pct: totalItens > 0 ? Math.round((qtd / totalItens) * 100) : 0 }));

    return {
      id: r.id, nome: r.nome, x: r.x, y: r.y,
      clientes: clientesUnicos.size,
      pedidosAtivos: ativos.length,
      atendimentos,
      categoriaPredominante: mix[0]?.categoria || null,
      mix,
      faturamento,
      pedidosLista: ativos.slice(0, 4).map((p) => ({
        numero: `#${p.numero_sequencial}`,
        etapa: ETAPAS_FUNIL.find((e) => e.numero === p.estagio.etapa_atual)?.nome || "",
      })),
    };
  });

  return { regioes };
}
```

Atualizar `module.exports` (adicionar `buscarMapa`).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): implementa buscarMapa"
```

---

### Task 10: `buscarAgendaSemana`

**Files:**
- Modify: `backend/src/services/dashboardGestorService.js`
- Modify: `backend/src/__tests__/dashboardGestorService.test.js`

**Interfaces:**
- Produces: `buscarAgendaSemana(empresaId, {consultoraId, cidade})` → `{ compromissos: [{data, hora, tipo, cliente, local, equipe, veiculo}] }`.

- [ ] **Step 1: Adicionar o teste**

```js
describe("buscarAgendaSemana", () => {
  test("monta a query com filtros de consultora/cidade e mapeia o resultado", async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 1, data: "2026-07-15", hora: "09:00:00", tipo: "Conferência",
        cliente_texto: "Ap. Batel", endereco: "Batel, Curitiba",
        cliente_nome: "Sra. Regina", veiculo_nome: "Fiorino I",
        equipe_nomes: ["Marina Alencar"],
      }],
    });

    const r = await svc.buscarAgendaSemana(7, { consultoraId: 5, cidade: "Curitiba" });

    expect(r.compromissos).toEqual([{
      data: "2026-07-15", hora: "09:00:00", tipo: "Conferência",
      cliente: "Sra. Regina", local: "Batel, Curitiba", equipe: "Marina Alencar", veiculo: "Fiorino I",
    }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/agendamentos/);
    expect(params).toEqual([7, 5, "Curitiba"]);
  });

  test("usa cliente_texto quando não há pedido/cliente vinculado", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 2, data: "2026-07-16", hora: "10:00:00", tipo: "Instalação", cliente_texto: "Obra X", endereco: "Rua Y", cliente_nome: null, veiculo_nome: null, equipe_nomes: [] }],
    });
    const r = await svc.buscarAgendaSemana(7, {});
    expect(r.compromissos[0]).toMatchObject({ cliente: "Obra X", equipe: null, veiculo: null });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: FAIL — `svc.buscarAgendaSemana is not a function`.

- [ ] **Step 3: Implementar**

```js
async function buscarAgendaSemana(empresaId, filtros = {}) {
  const { consultoraId, cidade } = filtros;
  const params = [empresaId];
  const cond = [
    "a.empresa_id = $1",
    "a.status NOT IN ('cancelado','rejeitado')",
    "a.data BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'",
  ];
  if (consultoraId) {
    params.push(Number(consultoraId));
    cond.push(`p.consultor_id = $${params.length}`);
  }
  if (cidade) {
    params.push(cidade);
    cond.push(`LOWER(p.cidade) = LOWER($${params.length})`);
  }

  const { rows } = await db.query(
    `SELECT a.id, a.data, a.hora, a.tipo, a.cliente AS cliente_texto, a.endereco,
            c.nome AS cliente_nome, v.nome AS veiculo_nome,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(ae.nome_snapshot, u2.nome_completo)), NULL) AS equipe_nomes
     FROM agendamentos a
     LEFT JOIN pedidos p ON p.id = a.pedido_id
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN agendamento_equipe ae ON ae.agendamento_id = a.id
     LEFT JOIN usuarios u2 ON u2.id = ae.usuario_id
     LEFT JOIN crew_agendamentos ca ON ca.agendamento_id = a.id
     LEFT JOIN crews cr ON cr.id = ca.crew_id
     LEFT JOIN veiculos v ON v.id = cr.veiculo_id
     WHERE ${cond.join(" AND ")}
     GROUP BY a.id, a.data, a.hora, a.tipo, a.cliente, a.endereco, c.nome, v.nome
     ORDER BY a.data, a.hora`,
    params
  );

  const compromissos = rows.map((r) => ({
    data: r.data,
    hora: r.hora,
    tipo: r.tipo,
    cliente: r.cliente_nome || r.cliente_texto,
    local: r.endereco,
    equipe: (r.equipe_nomes || []).length ? r.equipe_nomes.join(", ") : null,
    veiculo: r.veiculo_nome || null,
  }));

  return { compromissos };
}
```

Atualizar `module.exports` (adicionar `buscarAgendaSemana`), ficando:

```js
module.exports = {
  buscarFiltros,
  buscarKpis,
  buscarFunil,
  buscarFunilDetalhe,
  buscarAlertas,
  buscarConsultoras,
  buscarMapa,
  buscarAgendaSemana,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest dashboardGestorService -v`
Expected: PASS em todos os testes (essa é a última função — confirme que a suíte completa está verde).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dashboardGestorService.js backend/src/__tests__/dashboardGestorService.test.js
git commit -m "feat(dashboard-gestor): implementa buscarAgendaSemana"
```

---

### Task 11: Rotas HTTP e montagem no `server.js`

**Files:**
- Create: `backend/src/routes/dashboardGestorRoutes.js`
- Modify: `backend/server.js:50` (import), `:151` (mount)

**Interfaces:**
- Consumes: todas as 8 funções de `dashboardGestorService.js` (Tasks 4-10).
- Consumes: `authMiddleware` (`backend/src/middlewares/authMiddleware.js`), `permissionMiddleware` (`backend/src/middlewares/permissionMiddleware.js`).
- Produces: rotas montadas em `/api/dashboard-gestor/{filtros,kpis,funil,funil/:numero,alertas,mapa,agenda-semana,consultoras}`.

- [ ] **Step 1: Criar o arquivo de rotas**

Criar `backend/src/routes/dashboardGestorRoutes.js`:

```js
"use strict";
const express = require("express");
const router  = express.Router();
const authMiddleware       = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const svc = require("../services/dashboardGestorService");

const PERM_DASHBOARD_GESTOR = ["ADMIN_MASTER", "OPERADOR_AGENDA"];

router.use(authMiddleware, permissionMiddleware(PERM_DASHBOARD_GESTOR));

function filtrosDe(req) {
  return {
    periodo: req.query.periodo || "mes",
    consultoraId: req.query.consultora_id || null,
    cidade: req.query.cidade || null,
  };
}

router.get("/filtros", async (req, res) => {
  try {
    res.json(await svc.buscarFiltros(req.user.empresa_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar filtros." });
  }
});

router.get("/kpis", async (req, res) => {
  try {
    res.json(await svc.buscarKpis(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar KPIs." });
  }
});

router.get("/funil", async (req, res) => {
  try {
    res.json(await svc.buscarFunil(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar funil." });
  }
});

router.get("/funil/:numero", async (req, res) => {
  try {
    res.json(await svc.buscarFunilDetalhe(req.user.empresa_id, req.params.numero, filtrosDe(req)));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar detalhe da etapa." });
  }
});

router.get("/alertas", async (req, res) => {
  try {
    res.json(await svc.buscarAlertas(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar alertas." });
  }
});

router.get("/mapa", async (req, res) => {
  try {
    res.json(await svc.buscarMapa(req.user.empresa_id, { ...filtrosDe(req), modo: req.query.modo || "bairros" }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar mapa." });
  }
});

router.get("/agenda-semana", async (req, res) => {
  try {
    res.json(await svc.buscarAgendaSemana(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar agenda da semana." });
  }
});

router.get("/consultoras", async (req, res) => {
  try {
    res.json(await svc.buscarConsultoras(req.user.empresa_id, filtrosDe(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao buscar faturamento por consultora." });
  }
});

module.exports = router;
```

- [ ] **Step 2: Montar a rota em `server.js`**

Em `backend/server.js:50`, logo após a linha `const dashboardRoutes    = require("./src/routes/dashboardRoutes");`:

```js
const dashboardGestorRoutes = require("./src/routes/dashboardGestorRoutes");
```

Em `backend/server.js:151`, logo após `app.use("/api/dashboard",     dashboardRoutes);`:

```js
app.use("/api/dashboard-gestor", dashboardGestorRoutes);
```

- [ ] **Step 3: Subir o servidor e verificar manualmente com curl**

Run: `cd backend && npm run dev` (em background/outro terminal)

Depois, autenticado com um token válido de um usuário `ADMIN_MASTER` (pegue o token do `localStorage` do navegador logado, ou faça login via `/api/auth/login`):

```bash
curl -s http://localhost:3001/api/dashboard-gestor/filtros -H "Authorization: Bearer $TOKEN" | head -c 500
curl -s "http://localhost:3001/api/dashboard-gestor/kpis?periodo=mes" -H "Authorization: Bearer $TOKEN" | head -c 500
```

Expected: JSON 200 nos dois casos, sem stack trace no terminal do servidor. Sem token (ou com usuário sem `ADMIN_MASTER`/`OPERADOR_AGENDA`): `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/dashboard-gestor/kpis` → `401` ou `403`.

- [ ] **Step 4: Rodar toda a suíte de testes do backend para garantir que nada quebrou**

Run: `cd backend && npm test`
Expected: PASS em todos os arquivos de teste (incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/dashboardGestorRoutes.js backend/server.js
git commit -m "feat(dashboard-gestor): expõe /api/dashboard-gestor com 8 endpoints"
```

---

### Task 12: Frontend — rota, sidebar e shell da página (header, filtros, KPIs)

**Files:**
- Create: `frontend-web/src/pages/Dashboard.jsx`
- Create: `frontend-web/src/pages/Dashboard.css`
- Modify: `frontend-web/src/App.jsx:17` (import), `:86` (rota)
- Modify: `frontend-web/src/components/Sidebar.jsx:9` (ícone), `:53` (permissão), `:92-97` (nav item)

**Interfaces:**
- Consumes: `GET /api/dashboard-gestor/filtros` e `GET /api/dashboard-gestor/kpis` (Task 11), via `api.get` de `frontend-web/src/services/api.js`.
- Consumes: `useAuth` de `frontend-web/src/hooks/useAuth.js` (mesmo padrão de `Home.jsx`).
- Produces: rota `/dashboard`, item de sidebar "Dashboard", componente `Dashboard.jsx` renderizando header + filtros + 4 KPIs (as demais seções chegam nas Tasks 13-14, como placeholders `<div className="ek-empty">Em breve</div>` que serão substituídos).

- [ ] **Step 1: Adicionar a rota em `App.jsx`**

Em `frontend-web/src/App.jsx:17`, logo após `const Home = lazy(() => import("./pages/Home"));`:

```js
const Dashboard = lazy(() => import("./pages/Dashboard"));
```

Em `frontend-web/src/App.jsx:86`, logo após `<Route path="/home" element={<Home />} />`:

```jsx
                <Route element={<PermissionRoute perms={["ADMIN_MASTER","OPERADOR_AGENDA"]} />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                </Route>
```

- [ ] **Step 2: Adicionar o item de navegação em `Sidebar.jsx`**

Em `frontend-web/src/components/Sidebar.jsx:9`, adicionar `FaChartLine` aos imports de `react-icons/fa`:

```js
import {
  FaHome,
  FaChartLine,
  FaCalendarAlt,
  ...
```

Em `frontend-web/src/components/Sidebar.jsx:53`, logo após `const podeVerHome = true;`:

```js
  const podeVerDashboard    = temPerm(user, "ADMIN_MASTER","OPERADOR_AGENDA");
```

Em `frontend-web/src/components/Sidebar.jsx`, logo após o bloco do `NavLink` de "Início" (linhas 92-97):

```jsx
        {podeVerDashboard && (
          <NavLink to="/dashboard" className={navItemClass} title="Dashboard">
            <FaChartLine className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Dashboard</span>}
          </NavLink>
        )}
```

- [ ] **Step 3: Criar `Dashboard.css` (base, reaproveitando tokens do tema)**

Criar `frontend-web/src/pages/Dashboard.css`:

```css
/* ============================================================
   DASHBOARD DO GESTOR
   ============================================================ */

.dash-filtros {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.dash-select {
  min-width: 180px;
}

.dash-kpi-delta {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.dash-kpi-delta.up   { background: var(--color-success-soft); color: var(--color-success); }
.dash-kpi-delta.down { background: var(--color-danger-soft);  color: var(--color-danger); }
.dash-kpi-delta.neutral { background: rgba(148,163,184,0.12); color: var(--color-text-muted); }

@media (max-width: 900px) {
  .dash-filtros { flex-direction: column; align-items: stretch; }
  .dash-select  { min-width: 0; width: 100%; }
}
```

- [ ] **Step 4: Criar `Dashboard.jsx` com header, filtros e KPIs**

Criar `frontend-web/src/pages/Dashboard.jsx`:

```jsx
import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import "./Dashboard.css";

const PERIODOS = [
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "ano", label: "Ano" },
];

const fmtR = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");

function Skeleton() {
  return <div className="rel-skeleton" style={{ height: 90 }} />;
}

function Empty({ children = "Sem dados." }) {
  return <div className="rel-empty">{children}</div>;
}

function KpiDelta({ tipo, texto }) {
  const cls = tipo === "up" ? "up" : tipo === "down" ? "down" : "neutral";
  return <span className={`dash-kpi-delta ${cls}`}>{texto}</span>;
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState("mes");
  const [consultoraId, setConsultoraId] = useState("");
  const [cidade, setCidade] = useState("");

  const [opcoes, setOpcoes] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard-gestor/filtros").then(setOpcoes).catch(() => setOpcoes({ consultoras: [], cidades: [] }));
  }, []);

  const carregarKpis = useCallback(() => {
    setKpisLoading(true);
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/kpis?${params}`)
      .then(setKpis)
      .catch(() => setKpis(null))
      .finally(() => setKpisLoading(false));
  }, [periodo, consultoraId, cidade]);

  useEffect(() => { carregarKpis(); }, [carregarKpis]);

  const hasFilters = !!(consultoraId || cidade);
  const limparFiltros = () => { setConsultoraId(""); setCidade(""); };

  return (
    <div className="ek-page">
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Dashboard</h1>
          <p>Visão geral do ateliê — pedidos, prazos, agenda e faturamento</p>
        </div>
      </div>

      <div className="dash-filtros">
        <div className="rel-periodo-group">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              className={`rel-periodo-btn${periodo === p.value ? " active" : ""}`}
              onClick={() => setPeriodo(p.value)}
            >{p.label}</button>
          ))}
        </div>

        <select className="ek-select dash-select" value={consultoraId} onChange={(e) => setConsultoraId(e.target.value)}>
          <option value="">Todas as consultoras</option>
          {(opcoes?.consultoras || []).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <select className="ek-select dash-select" value={cidade} onChange={(e) => setCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {(opcoes?.cidades || []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="rel-limpar-filtros" onClick={limparFiltros}>Limpar filtros</button>
        )}
      </div>

      {kpisLoading ? (
        <div className="rel-kpis"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      ) : !kpis ? (
        <Empty>Não foi possível carregar os KPIs.</Empty>
      ) : (
        <div className="rel-kpis">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Faturamento do período</div>
            <div className="rel-kpi-value">{fmtR(kpis.faturamento.valor)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <KpiDelta tipo={kpis.faturamento.deltaPct >= 0 ? "up" : "down"} texto={`${kpis.faturamento.deltaPct >= 0 ? "+" : ""}${kpis.faturamento.deltaPct}%`} />
              <span className="rel-kpi-sub">vs. período anterior</span>
            </div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Pedidos ativos</div>
            <div className="rel-kpi-value">{fmtN(kpis.pedidosAtivos.valor)}</div>
            <div className="rel-kpi-sub">no funil</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Prazos em risco</div>
            <div className="rel-kpi-value">{fmtN(kpis.prazosEmRisco.valor)}</div>
            <div className="rel-kpi-sub">atrasados ou urgentes</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Instalações/semana</div>
            <div className="rel-kpi-value">{fmtN(kpis.instalacoesSemana.valor)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <KpiDelta tipo={kpis.instalacoesSemana.deltaAbs >= 0 ? "up" : "down"} texto={`${kpis.instalacoesSemana.deltaAbs >= 0 ? "+" : ""}${kpis.instalacoesSemana.deltaAbs}`} />
              <span className="rel-kpi-sub">vs. semana passada</span>
            </div>
          </div>
        </div>
      )}

      <div className="ek-empty"><p>Mapa, funil, alertas, agenda e consultoras — em breve.</p></div>
    </div>
  );
}
```

- [ ] **Step 4: Subir os dois servidores e verificar no navegador**

Run backend: `cd backend && npm run dev` (background)
Run frontend: `cd frontend-web && npm run dev` (background)

Abrir `http://localhost:5173/dashboard` logado como usuário `ADMIN_MASTER`. Verificar:
- Header "Dashboard" aparece.
- Botões de período (Mês/Trimestre/Ano) alternam e recarregam os KPIs (Network tab mostra nova chamada a `/api/dashboard-gestor/kpis`).
- Selects de Consultora/Cidade populam com dados reais e, ao selecionar, recarregam os KPIs filtrados.
- 4 cards de KPI aparecem com valores (ou skeleton enquanto carrega).
- Item "Dashboard" aparece na sidebar (entre "Início" e "Agendamentos"), só visível para `ADMIN_MASTER`/`OPERADOR_AGENDA`.

- [ ] **Step 5: Rodar o lint do frontend**

Run: `cd frontend-web && npm run lint`
Expected: sem erros novos nos arquivos tocados.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/Dashboard.jsx frontend-web/src/pages/Dashboard.css frontend-web/src/App.jsx frontend-web/src/components/Sidebar.jsx
git commit -m "feat(dashboard-gestor): adiciona rota /dashboard com header, filtros e KPIs"
```

---

### Task 13: Frontend — Mapa de clientes + Alertas de prazo

**Files:**
- Modify: `frontend-web/src/pages/Dashboard.jsx`
- Modify: `frontend-web/src/pages/Dashboard.css`

**Interfaces:**
- Consumes: `GET /api/dashboard-gestor/mapa?modo=&periodo=&consultora_id=&cidade=`, `GET /api/dashboard-gestor/alertas?consultora_id=&cidade=` (Task 11).

- [ ] **Step 1: Adicionar CSS do mapa e dos alertas**

Em `frontend-web/src/pages/Dashboard.css`, adicionar ao final:

```css
/* ── MAPA ── */

.dash-row-2 {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 16px;
}
@media (max-width: 1100px) {
  .dash-row-2 { grid-template-columns: 1fr; }
}

.dash-mapa-canvas {
  position: relative;
  height: 420px;
  border-radius: var(--radius-md);
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.dash-mapa-no {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.dash-mapa-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--color-surface);
  box-shadow: 0 3px 8px rgba(0,0,0,.35);
}

.dash-mapa-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface-strong);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  border: 1px solid var(--color-border);
}

.dash-mapa-detalhe {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dash-mapa-detalhe-card {
  width: 380px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-strong);
  padding: 18px 20px;
}

/* ── ALERTAS ── */

.dash-alerta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--color-border);
}
.dash-alerta-row:last-child { border-bottom: none; }

.dash-alerta-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Adicionar os estados/fetch de mapa e alertas em `Dashboard.jsx`**

No topo de `Dashboard.jsx`, adicionar a constante de cores de nível (logo após `PERIODOS`):

```js
const NIVEL_COR = { atrasado: "var(--color-danger)", urgente: "var(--color-warning)", atencao: "var(--color-info)" };
const NIVEL_LABEL = { atrasado: "Atrasado", urgente: "Urgente", atencao: "Atenção" };
```

Dentro do componente `Dashboard`, logo após os estados de `kpis`, adicionar:

```js
  const [modoMapa, setModoMapa] = useState("bairros");
  const [mapa, setMapa] = useState(null);
  const [mapaLoading, setMapaLoading] = useState(true);
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);

  const [alertas, setAlertas] = useState(null);
  const [alertasLoading, setAlertasLoading] = useState(true);
```

Logo após `useEffect(() => { carregarKpis(); }, [carregarKpis]);`, adicionar:

```js
  useEffect(() => {
    setMapaLoading(true);
    setRegiaoSelecionada(null);
    const params = new URLSearchParams({ periodo, modo: modoMapa });
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/mapa?${params}`)
      .then(setMapa)
      .catch(() => setMapa(null))
      .finally(() => setMapaLoading(false));
  }, [periodo, consultoraId, cidade, modoMapa]);

  useEffect(() => {
    setAlertasLoading(true);
    const params = new URLSearchParams();
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/alertas?${params}`)
      .then(setAlertas)
      .catch(() => setAlertas(null))
      .finally(() => setAlertasLoading(false));
  }, [consultoraId, cidade]);
```

- [ ] **Step 3: Substituir o placeholder final por Mapa + Alertas**

Trocar a linha `<div className="ek-empty"><p>Mapa, funil, alertas, agenda e consultoras — em breve.</p></div>` por:

```jsx
      <div className="dash-row-2">
        <div className="ek-section">
          <div className="ek-section-head">
            <div>
              <h3>Mapa de clientes</h3>
              <p>Clique numa região para ver o detalhamento</p>
            </div>
            <div className="rel-periodo-group">
              <button className={`rel-periodo-btn${modoMapa === "bairros" ? " active" : ""}`} onClick={() => setModoMapa("bairros")}>Bairros · Curitiba</button>
              <button className={`rel-periodo-btn${modoMapa === "cidades" ? " active" : ""}`} onClick={() => setModoMapa("cidades")}>Cidades</button>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {mapaLoading ? <Skeleton /> : !mapa?.regioes?.length ? <Empty>Nenhum dado com esses filtros.</Empty> : (
              <div className="dash-mapa-canvas">
                {mapa.regioes.map((r) => (
                  <button key={r.id} className="dash-mapa-no" style={{ left: `${r.x}%`, top: `${r.y}%` }} onClick={() => setRegiaoSelecionada(r)}>
                    <span className="dash-mapa-dot" />
                    <span className="dash-mapa-label">{r.nome}</span>
                  </button>
                ))}
                {regiaoSelecionada && (
                  <div className="dash-mapa-detalhe" onClick={() => setRegiaoSelecionada(null)}>
                    <div className="dash-mapa-detalhe-card" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div className="rel-section-label">{modoMapa === "bairros" ? "Bairro · Curitiba" : "Cidade"}</div>
                          <div style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 700 }}>{regiaoSelecionada.nome}</div>
                        </div>
                        <button className="ek-action-btn" onClick={() => setRegiaoSelecionada(null)}>×</button>
                      </div>
                      <div className="rel-kpis" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 14 }}>
                        <div className="rel-kpi"><div className="rel-kpi-value">{regiaoSelecionada.clientes}</div><div className="rel-kpi-label">Clientes</div></div>
                        <div className="rel-kpi"><div className="rel-kpi-value">{regiaoSelecionada.pedidosAtivos}</div><div className="rel-kpi-label">Pedidos ativos</div></div>
                        <div className="rel-kpi"><div className="rel-kpi-value">{regiaoSelecionada.atendimentos}</div><div className="rel-kpi-label">Atendimentos</div></div>
                      </div>
                      {regiaoSelecionada.mix.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div className="rel-section-label">Categoria predominante — {regiaoSelecionada.categoriaPredominante}</div>
                          {regiaoSelecionada.mix.map((m) => (
                            <div key={m.categoria} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                              <span>{m.categoria}</span><span>{m.pct}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}>
                        <span className="rel-kpi-label">Faturamento</span>
                        <strong>{fmtR(regiaoSelecionada.faturamento)}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ek-section">
          <div className="ek-section-head">
            <h3>Prazos em risco</h3>
            {alertas && <span className="ek-count-badge">{alertas.total} pedidos</span>}
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {alertasLoading ? <Skeleton /> : !alertas?.alertas?.length ? <Empty>Nenhum pedido em risco com esses filtros.</Empty> : (
              alertas.alertas.map((a, i) => (
                <div key={i} className="dash-alerta-row">
                  <span className="dash-alerta-dot" style={{ background: NIVEL_COR[a.nivel] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{a.numeroPedido}</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.cliente}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{a.cidade} · {a.etapa} · {a.consultora}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NIVEL_COR[a.nivel] }}>
                      {a.diasParaPrazo < 0 ? `${Math.abs(a.diasParaPrazo)}d atraso` : a.diasParaPrazo === 0 ? "hoje" : `em ${a.diasParaPrazo}d`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{NIVEL_LABEL[a.nivel]}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="ek-empty"><p>Funil, agenda e consultoras — em breve.</p></div>
```

- [ ] **Step 4: Verificar no navegador**

Com os dois servidores rodando, recarregar `http://localhost:5173/dashboard`:
- Mapa aparece com nós posicionados (ou "Nenhum dado com esses filtros" se não houver pedidos com bairro/cidade preenchidos).
- Alternar "Bairros · Curitiba" / "Cidades" troca os nós.
- Clicar num nó abre o card de detalhe (clientes/pedidos ativos/atendimentos/mix/faturamento); clicar fora ou no × fecha.
- Lista de alertas aparece (ou estado vazio) com cor por nível.

- [ ] **Step 5: Lint**

Run: `cd frontend-web && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/Dashboard.jsx frontend-web/src/pages/Dashboard.css
git commit -m "feat(dashboard-gestor): adiciona seção de mapa de clientes e alertas de prazo"
```

---

### Task 14: Frontend — Funil de produção

**Files:**
- Modify: `frontend-web/src/pages/Dashboard.jsx`
- Modify: `frontend-web/src/pages/Dashboard.css`

**Interfaces:**
- Consumes: `GET /api/dashboard-gestor/funil?...`, `GET /api/dashboard-gestor/funil/:numero?...` (Task 11).

- [ ] **Step 1: CSS do funil**

Adicionar ao final de `Dashboard.css`:

```css
/* ── FUNIL ── */

.dash-funil-row {
  display: flex;
  gap: 9px;
}

.dash-funil-card {
  flex: 1;
  position: relative;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.dash-funil-card:hover { transform: translateY(-2px); }
.dash-funil-card.ativa { border-color: var(--color-primary); background: var(--color-primary-soft); }
.dash-funil-card.gargalo { border-color: var(--color-warning); }

.dash-funil-num {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--color-surface-strong);
  color: var(--color-text-muted);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.dash-funil-card.ativa .dash-funil-num { background: var(--color-primary); color: var(--color-primary-btn-text); }

.dash-funil-gargalo-badge {
  font-size: 10px; font-weight: 700;
  color: var(--color-warning);
  background: var(--color-warning-soft);
  padding: 2px 8px;
  border-radius: 999px;
}

.dash-funil-count {
  font-family: var(--font-title);
  font-size: 26px; font-weight: 700;
  color: var(--color-text);
  margin-top: 12px;
}

.dash-funil-track {
  height: 5px;
  border-radius: 4px;
  background: var(--color-border);
  margin-top: 10px;
  overflow: hidden;
}
.dash-funil-fill { height: 100%; border-radius: 4px; background: var(--color-primary); }

@media (max-width: 900px) {
  .dash-funil-row { flex-wrap: wrap; }
  .dash-funil-card { flex: 1 1 45%; }
}
```

- [ ] **Step 2: Estados e fetch em `Dashboard.jsx`**

Adicionar aos estados do componente (após os de alertas):

```js
  const [funil, setFunil] = useState(null);
  const [funilLoading, setFunilLoading] = useState(true);
  const [etapaSelecionada, setEtapaSelecionada] = useState(3);
  const [detalheEtapa, setDetalheEtapa] = useState(null);
```

Adicionar os `useEffect`s (após o de alertas):

```js
  useEffect(() => {
    setFunilLoading(true);
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/funil?${params}`)
      .then(setFunil)
      .catch(() => setFunil(null))
      .finally(() => setFunilLoading(false));
  }, [periodo, consultoraId, cidade]);

  useEffect(() => {
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/funil/${etapaSelecionada}?${params}`)
      .then(setDetalheEtapa)
      .catch(() => setDetalheEtapa(null));
  }, [etapaSelecionada, periodo, consultoraId, cidade]);
```

- [ ] **Step 3: Substituir o placeholder do funil pela seção real**

Trocar `<div className="ek-empty"><p>Funil, agenda e consultoras — em breve.</p></div>` (deixado pela Task 13) por:

```jsx
      <div className="ek-section">
        <div className="ek-section-head">
          <div>
            <h3>Funil de produção · 8 etapas</h3>
            {funil && <p>{funil.totalAtivos} pedidos ativos · clique numa etapa</p>}
          </div>
        </div>
        <div style={{ padding: 18 }}>
          {funilLoading ? <Skeleton /> : !funil ? <Empty>Não foi possível carregar o funil.</Empty> : (
            <>
              <div className="dash-funil-row">
                {funil.etapas.map((e) => {
                  const maxCount = Math.max(...funil.etapas.map((x) => x.count), 1);
                  return (
                    <div
                      key={e.numero}
                      className={`dash-funil-card${etapaSelecionada === e.numero ? " ativa" : ""}${e.gargalo ? " gargalo" : ""}`}
                      onClick={() => setEtapaSelecionada(e.numero)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="dash-funil-num">{e.numero}</span>
                        {e.gargalo && <span className="dash-funil-gargalo-badge">gargalo</span>}
                      </div>
                      <div className="dash-funil-count">{e.count}</div>
                      <div className="rel-kpi-sub">{e.nome}</div>
                      <div className="dash-funil-track">
                        <div className="dash-funil-fill" style={{ width: `${Math.max(10, Math.round((e.count / maxCount) * 100))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {detalheEtapa && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--color-border)", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="dash-funil-num" style={{ background: "var(--color-primary)", color: "var(--color-primary-btn-text)" }}>{detalheEtapa.numero}</span>
                      <div style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 700 }}>{detalheEtapa.nome}</div>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 10 }}>{detalheEtapa.descricao}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div><div className="rel-section-label">Pedidos nesta etapa</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detalheEtapa.count}</div></div>
                    <div><div className="rel-section-label">Responsável</div><div style={{ fontSize: 14 }}>{detalheEtapa.responsavel}</div></div>
                  </div>
                  <div>
                    <div className="rel-section-label">Exemplos</div>
                    {detalheEtapa.exemplos.length === 0 ? <Empty>Nenhum pedido nessa etapa.</Empty> : detalheEtapa.exemplos.map((x, i) => (
                      <div key={i} style={{ display: "flex", gap: 9, fontSize: 12, marginTop: 6 }}>
                        <strong>{x.numero}</strong><span style={{ color: "var(--color-text-muted)" }}>{x.cliente}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="ek-empty"><p>Agenda da semana e faturamento por consultora — em breve.</p></div>
```

- [ ] **Step 4: Verificar no navegador**

Recarregar `/dashboard`:
- 8 cards do funil aparecem com contagem e barra de progresso; a de maior contagem mostra badge "gargalo".
- Clicar numa etapa realça o card (borda dourada) e carrega o painel de detalhe abaixo (descrição, responsável, contagem, até 5 exemplos).
- Trocar filtros (período/consultora/cidade) recarrega o funil e o detalhe da etapa selecionada.

- [ ] **Step 5: Lint**

Run: `cd frontend-web && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/Dashboard.jsx frontend-web/src/pages/Dashboard.css
git commit -m "feat(dashboard-gestor): adiciona seção de funil de produção com detalhe por etapa"
```

---

### Task 15: Frontend — Agenda da semana + Faturamento por consultora

**Files:**
- Modify: `frontend-web/src/pages/Dashboard.jsx`
- Modify: `frontend-web/src/pages/Dashboard.css`

**Interfaces:**
- Consumes: `GET /api/dashboard-gestor/agenda-semana?...`, `GET /api/dashboard-gestor/consultoras?...` (Task 11).

- [ ] **Step 1: CSS final**

Adicionar ao final de `Dashboard.css`:

```css
/* ── AGENDA ── */

.dash-agenda-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--color-border);
}
.dash-agenda-row:last-child { border-bottom: none; }

.dash-agenda-hora { text-align: center; flex: none; width: 60px; }
.dash-agenda-tipo {
  font-size: 10px; font-weight: 700;
  padding: 3px 9px; border-radius: 999px;
  flex: none;
}
.dash-agenda-tipo.instalacao { color: var(--color-primary); background: var(--color-primary-soft); }
.dash-agenda-tipo.outro      { color: var(--color-info); background: var(--color-info-soft); }

/* ── CONSULTORAS ── */

.dash-consultora-row { padding: 8px 0; }

.dash-consultora-avatar {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-primary-btn-text);
  font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex: none;
}

.dash-consultora-track {
  height: 8px;
  border-radius: 6px;
  background: var(--color-border);
  overflow: hidden;
  margin-top: 6px;
}
.dash-consultora-fill { height: 100%; border-radius: 6px; background: var(--color-primary); }
```

- [ ] **Step 2: Estados e fetch em `Dashboard.jsx`**

Adicionar aos estados do componente (após os do funil):

```js
  const [agenda, setAgenda] = useState(null);
  const [agendaLoading, setAgendaLoading] = useState(true);

  const [consultoras, setConsultoras] = useState(null);
  const [consultorasLoading, setConsultorasLoading] = useState(true);
```

Adicionar os `useEffect`s:

```js
  useEffect(() => {
    setAgendaLoading(true);
    const params = new URLSearchParams();
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/agenda-semana?${params}`)
      .then(setAgenda)
      .catch(() => setAgenda(null))
      .finally(() => setAgendaLoading(false));
  }, [consultoraId, cidade]);

  useEffect(() => {
    setConsultorasLoading(true);
    const params = new URLSearchParams({ periodo });
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/consultoras?${params}`)
      .then(setConsultoras)
      .catch(() => setConsultoras(null))
      .finally(() => setConsultorasLoading(false));
  }, [periodo, cidade]);
```

- [ ] **Step 3: Substituir o último placeholder pela seção final**

Trocar `<div className="ek-empty"><p>Agenda da semana e faturamento por consultora — em breve.</p></div>` (deixado pela Task 14) por:

```jsx
      <div className="dash-row-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="ek-section">
          <div className="ek-section-head">
            <h3>Agenda da semana</h3>
            <p>Equipes &amp; veículos</p>
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {agendaLoading ? <Skeleton /> : !agenda?.compromissos?.length ? <Empty>Nenhum compromisso com esses filtros.</Empty> : (
              agenda.compromissos.map((c, i) => (
                <div key={i} className="dash-agenda-row">
                  <div className="dash-agenda-hora">
                    <div style={{ fontWeight: 700 }}>{c.hora?.slice(0, 5)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{new Date(c.data).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</div>
                  </div>
                  <span className={`dash-agenda-tipo ${c.tipo === "Instalação" ? "instalacao" : "outro"}`}>{c.tipo}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.cliente}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.local}</div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{c.equipe || "—"}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{c.veiculo || "—"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="ek-section">
          <div className="ek-section-head">
            <h3>Faturamento por consultora</h3>
            {consultoras && <p>{fmtR(consultoras.totalMes)} no período</p>}
          </div>
          <div style={{ padding: "16px" }}>
            {consultorasLoading ? <Skeleton /> : !consultoras?.consultoras?.length ? <Empty>Nenhuma consultora cadastrada.</Empty> : (
              consultoras.consultoras.map((c) => {
                const max = Math.max(...consultoras.consultoras.map((x) => x.valor), 1);
                const iniciais = c.nome.split(" ").slice(0, 2).map((p) => p[0]).join("");
                return (
                  <div key={c.id} className="dash-consultora-row">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className="dash-consultora-avatar">{iniciais}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <strong style={{ fontSize: 13 }}>{fmtR(c.valor)}</strong>
                        <KpiDelta tipo={c.deltaPct >= 0 ? "up" : "down"} texto={`${c.deltaPct >= 0 ? "+" : ""}${c.deltaPct}%`} />
                      </div>
                    </div>
                    <div className="dash-consultora-track">
                      <div className="dash-consultora-fill" style={{ width: `${Math.round((c.valor / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Verificação final completa no navegador**

Com `backend` e `frontend-web` rodando, revisitar `http://localhost:5173/dashboard` como `ADMIN_MASTER` e conferir a página inteira, de cima para baixo:
1. Header + filtros (período, consultora, cidade, limpar filtros).
2. 4 KPIs.
3. Mapa de clientes (alternando Bairros/Cidades, clicando num nó) + Alertas de prazo.
4. Funil de 8 etapas (clicando em etapas diferentes).
5. Agenda da semana + Faturamento por consultora.

Testar também: aplicar um filtro de cidade que não tenha pedidos (todas as seções devem mostrar o estado vazio apropriado, sem quebrar a página) e verificar responsividade em ~768px de largura (DevTools).

- [ ] **Step 5: Lint e teste completo do backend**

Run: `cd frontend-web && npm run lint`
Run: `cd backend && npm test`
Expected: ambos sem erros/falhas.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/Dashboard.jsx frontend-web/src/pages/Dashboard.css
git commit -m "feat(dashboard-gestor): adiciona agenda da semana e faturamento por consultora, completando o dashboard"
```

---

## Self-Review

**Cobertura do spec:** header/permissões (Task 12), `/filtros` (Task 4), `/kpis` com as 4 métricas e regras de delta (Task 5), `/funil` + `/funil/:numero` com gargalo (Task 6), `/alertas` (Task 7), `/mapa` com fallback "Outros" (Task 9), `/agenda-semana` (Task 10), `/consultoras` (Task 8), rotas HTTP + permissões (Task 11), todas as 6 seções do frontend (Tasks 12-15), reuso de `calcularEtapaAtual`/refactor de `dashboardService` (Task 1), estilo via tokens do tema (`ek-*`/`rel-*` + CSS novo mínimo, todas as Tasks de frontend). Nenhuma lacuna encontrada.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código está completo em cada step.

**Consistência de tipos:** `buscarPedidosEnriquecidos` (Task 4) é consumida com a mesma assinatura em todas as Tasks 5-10; `ETAPAS_FUNIL`/coordenadas do mapa (Task 3) usadas com os mesmos nomes de campo (`numero`, `nome`, `x`, `y`, `id`) em todas as funções que as consomem; o shape de resposta de cada endpoint (definido nas Tasks 5-10) é consumido em `Dashboard.jsx` com os mesmos nomes de campo (`valor`, `deltaPct`, `deltaAbs`, `numeroPedido`, `diasParaPrazo`, `nivel`, etc.) — conferido campo a campo ao escrever as Tasks 12-15.
