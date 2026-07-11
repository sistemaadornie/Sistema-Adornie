# Busca na tela de Pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma barra de pesquisa na tela `Pedidos` que filtra por nome do cliente, número do pedido e nome do arquiteto.

**Architecture:** A busca é feita no servidor: um novo filtro `busca` chega em `GET /dashboard/pedidos`, é aplicado com `ILIKE` na query principal de `listarPedidosDashboard` (cliente e número diretamente, arquiteto via `EXISTS` contra a tabela `arquitetos`), e o frontend dispara a busca com debounce, combinando (AND) com os filtros de status/consultora já existentes na tela.

**Tech Stack:** Node.js/Express + pg (`backend`), React + Vite (`frontend-web`), Jest (testes de backend).

## Global Constraints

- Padrão de busca textual do projeto é `ILIKE` simples (`%termo%`), sem `unaccent` — ver `backend/src/services/pedidoService.js:187` e `backend/src/services/agendamentoService.js:295`. Não introduzir `unaccent` ou `pg_trgm`.
- `frontend-web` não tem framework de testes configurado (sem `test` script, sem arquivos `*.test.*` sob `src/pages/pedidos`) — não criar um agora; a verificação do frontend é manual/build only.
- Não exibir o nome do arquiteto nos cards de pedido — a busca por arquiteto deve funcionar, mas isso é o único ponto de contato com o dado.
- Não alterar a paginação/carregamento da lista de pedidos (continua carregando a lista completa filtrada, como hoje).
- Não remover o filtro client-side existente por `filtroAtivo`/`etapaFiltro` em `pedidosFiltrados` (`frontend-web/src/pages/pedidos/Pedidos.jsx`) — o filtro de "Atrasado" (`alerta=atrasado`) NUNCA é aplicado no backend hoje (o parâmetro `alerta` é aceito em `listarPedidosDashboard` mas nunca usado na query); é o `pedidosFiltrados` client-side que garante esse filtro. Remover essa lógica quebraria o filtro "Atrasado".

---

### Task 1: Backend — filtro `busca` em `listarPedidosDashboard` e na rota

**Files:**
- Modify: `backend/src/services/dashboardService.js:87-107` (função `listarPedidosDashboard`)
- Modify: `backend/src/routes/dashboardRoutes.js:7-13`
- Test: `backend/src/__tests__/dashboardService.test.js`

**Interfaces:**
- Consumes: nenhuma dependência de outra task.
- Produces: `listarPedidosDashboard(empresaId, userId, permissoes, filtros)` passa a aceitar `filtros.busca` (string ou `null`/`undefined`). `GET /dashboard/pedidos?busca=<texto>` passa a repassar esse filtro. Tasks 2 e 3 dependem de `usePedidos.carregar({ busca })` enviar esse mesmo query param `busca`.

- [ ] **Step 1: Escrever o teste que falha**

Abra `backend/src/__tests__/dashboardService.test.js` e adicione, dentro do `describe("listarPedidosDashboard", ...)`, logo após o teste existente (antes do fechamento do `describe`, por volta da linha 250):

```javascript
  test("filtra por busca via ILIKE em cliente, numero e arquiteto (EXISTS)", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const resultado = await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], { busca: "Maria" });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("c.nome ILIKE");
    expect(sql).toContain("p.numero_origem ILIKE");
    expect(sql).toContain("p.numero_sequencial::text ILIKE");
    expect(sql).toContain("FROM arquitetos arq");
    expect(params).toContain("%Maria%");
    expect(resultado).toEqual([]);
  });

  test("sem busca, nao adiciona condicao nem parametro extra", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await listarPedidosDashboard(1, 99, ["DASHBOARD_PEDIDOS_GERAL"], {});

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain("arquitetos");
    expect(params).toEqual([1]);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest dashboardService.test.js -t "busca"`
Expected: FAIL — o primeiro teste falha porque `sql` não contém `"FROM arquitetos arq"` (ou `params` não contém `"%Maria%"`); o segundo teste passa mesmo sem alteração (serve de guarda de regressão).

- [ ] **Step 3: Implementar o filtro `busca` em `listarPedidosDashboard`**

Em `backend/src/services/dashboardService.js`, localize:

```javascript
async function listarPedidosDashboard(empresaId, userId, permissoes, filtros = {}) {
  const { consultora_id, status, alerta } = filtros;
```

Troque por:

```javascript
async function listarPedidosDashboard(empresaId, userId, permissoes, filtros = {}) {
  const { consultora_id, status, alerta, busca } = filtros;
```

Logo abaixo, localize:

```javascript
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  const where = conditions.join(" AND ");
```

Troque por:

```javascript
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  if (busca) {
    params.push(`%${busca}%`);
    conditions.push(`(
      c.nome ILIKE $${params.length}
      OR p.numero_origem ILIKE $${params.length}
      OR p.numero_sequencial::text ILIKE $${params.length}
      OR EXISTS (
        SELECT 1 FROM arquitetos arq
        WHERE arq.id = p.arquiteto_id AND arq.nome ILIKE $${params.length}
      )
    )`);
  }

  const where = conditions.join(" AND ");
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd backend && npx jest dashboardService.test.js`
Expected: PASS (todos os testes do arquivo, incluindo os dois novos e os pré-existentes de `listarPedidosDashboard`).

- [ ] **Step 5: Repassar o filtro `busca` na rota**

Em `backend/src/routes/dashboardRoutes.js`, troque:

```javascript
    const filtros = {
      consultora_id: req.query.consultora_id || null,
      status:        req.query.status        || null,
      alerta:        req.query.alerta        || null,
    };
```

Por:

```javascript
    const filtros = {
      consultora_id: req.query.consultora_id || null,
      status:        req.query.status        || null,
      alerta:        req.query.alerta        || null,
      busca:         req.query.busca         || null,
    };
```

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npx jest`
Expected: PASS em todos os testes (nenhuma regressão fora de `dashboardService.test.js`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dashboardService.js backend/src/routes/dashboardRoutes.js backend/src/__tests__/dashboardService.test.js
git commit -m "feat(dashboard): adiciona filtro de busca por cliente, numero e arquiteto"
```

---

### Task 2: Frontend — repassar `busca` em `usePedidos`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/hooks/usePedidos.js:10-26`

**Interfaces:**
- Consumes: nenhuma (independente da Task 1 em termos de compilação; depende dela para o filtro ter efeito real no backend).
- Produces: `carregar(filtros)` aceita `filtros.busca` (string) e o inclui como query param `busca` na chamada `GET /dashboard/pedidos`. Task 3 depende de poder chamar `carregar({ ...outros, busca: "texto" })`.

- [ ] **Step 1: Adicionar o parâmetro `busca` em `carregar`**

Em `frontend-web/src/pages/pedidos/hooks/usePedidos.js`, troque:

```javascript
  const carregar = useCallback(async (filtros = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.consultora_id) params.set("consultora_id", filtros.consultora_id);
      if (filtros.status)        params.set("status",        filtros.status);
      if (filtros.alerta)        params.set("alerta",        filtros.alerta);
      const qs = params.toString();
```

Por:

```javascript
  const carregar = useCallback(async (filtros = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.consultora_id) params.set("consultora_id", filtros.consultora_id);
      if (filtros.status)        params.set("status",        filtros.status);
      if (filtros.alerta)        params.set("alerta",        filtros.alerta);
      if (filtros.busca)         params.set("busca",         filtros.busca);
      const qs = params.toString();
```

- [ ] **Step 2: Verificar que o frontend ainda builda**

Run: `cd frontend-web && npm run build`
Expected: build concluído sem erros (exit code 0).

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/hooks/usePedidos.js
git commit -m "feat(pedidos): usePedidos repassa filtro de busca para a API"
```

---

### Task 3: Frontend — campo de busca na tela de Pedidos

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx:1` (import), `Pedidos.jsx:141-251` (componente `Pedidos`)
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

**Interfaces:**
- Consumes: `carregar(filtros)` de `usePedidos` (Task 2) aceitando `filtros.busca`.
- Produces: nenhuma outra task depende desta.

- [ ] **Step 1: Importar `useRef`**

Em `frontend-web/src/pages/pedidos/Pedidos.jsx`, linha 1, troque:

```javascript
import React, { useState, useEffect, useMemo } from "react";
```

Por:

```javascript
import React, { useState, useEffect, useMemo, useRef } from "react";
```

- [ ] **Step 2: Adicionar estado `busca` e helper `buildFiltros`**

Localize o início do componente `Pedidos`:

```javascript
export default function Pedidos() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { pedidos, loading, erro, carregar } = usePedidos();
  const [filtroAtivo,    setFiltroAtivo]    = useState("todos");
  const [consultoraFiltro, setConsultoraFiltro] = useState("");
  const [importarAberto, setImportarAberto] = useState(false);
  const [salvando,       setSalvando]       = useState(false);
  const [etapaFiltro, setEtapaFiltro] = useState(null); // null = todas as etapas

  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const [consultoras, setConsultoras] = useState([]);
```

Troque por:

```javascript
export default function Pedidos() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { pedidos, loading, erro, carregar } = usePedidos();
  const [filtroAtivo,    setFiltroAtivo]    = useState("todos");
  const [consultoraFiltro, setConsultoraFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [importarAberto, setImportarAberto] = useState(false);
  const [salvando,       setSalvando]       = useState(false);
  const [etapaFiltro, setEtapaFiltro] = useState(null); // null = todas as etapas

  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const [consultoras, setConsultoras] = useState([]);

  function buildFiltros({ filtro = filtroAtivo, consultora = consultoraFiltro } = {}) {
    const f = {};
    if (consultora) f.consultora_id = consultora;
    if (filtro === "atrasados") f.alerta = "atrasado";
    else if (filtro !== "todos") f.status = filtro;
    const termo = busca.trim();
    if (termo) f.busca = termo;
    return f;
  }
```

- [ ] **Step 3: Simplificar `handleFiltro`, `handleEtapaFiltro` e o `onChange` da consultora para usar `buildFiltros`**

Localize:

```javascript
  function handleFiltro(key) {
    setFiltroAtivo(key);
    setEtapaFiltro(null);
    const f = consultoraFiltro ? { consultora_id: consultoraFiltro } : {};
    if (key === "atrasados") carregar({ ...f, alerta: "atrasado" });
    else if (key === "todos") carregar(f);
    else carregar({ ...f, status: key });
  }

  function handleEtapaFiltro(numero) {
    const proximo = etapaFiltro === numero ? null : numero;
    setEtapaFiltro(proximo);
    if (filtroAtivo !== "todos") {
      setFiltroAtivo("todos");
      const f = consultoraFiltro ? { consultora_id: consultoraFiltro } : {};
      carregar(f);
    }
  }
```

Troque por:

```javascript
  function handleFiltro(key) {
    setFiltroAtivo(key);
    setEtapaFiltro(null);
    carregar(buildFiltros({ filtro: key }));
  }

  function handleEtapaFiltro(numero) {
    const proximo = etapaFiltro === numero ? null : numero;
    setEtapaFiltro(proximo);
    if (filtroAtivo !== "todos") {
      setFiltroAtivo("todos");
      carregar(buildFiltros({ filtro: "todos" }));
    }
  }
```

Localize o `onChange` do select de consultora:

```javascript
              onChange={(e) => {
                const novaConsultora = e.target.value;
                setConsultoraFiltro(novaConsultora);
                const f = novaConsultora ? { consultora_id: novaConsultora } : {};
                if (filtroAtivo === "atrasados") f.alerta = "atrasado";
                else if (filtroAtivo !== "todos") f.status = filtroAtivo;
                carregar(f);
              }}
```

Troque por:

```javascript
              onChange={(e) => {
                const novaConsultora = e.target.value;
                setConsultoraFiltro(novaConsultora);
                carregar(buildFiltros({ consultora: novaConsultora }));
              }}
```

**Não altere `pedidosFiltrados`** (linhas ~168-175) — ele continua reaplicando `filtroAtivo`/`etapaFiltro` no cliente exatamente como hoje; isso é o que sustenta o filtro "Atrasado" (ver Global Constraints).

- [ ] **Step 4: Adicionar o efeito de busca com debounce**

Logo após a definição de `buildFiltros` (ou após os outros `useEffect`/handlers, antes do `async function handleImportarSalvar`), adicione:

```javascript
  const buscaMontada = useRef(false);
  useEffect(() => {
    if (!buscaMontada.current) {
      buscaMontada.current = true;
      return;
    }
    const timer = setTimeout(() => {
      carregar(buildFiltros());
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);
```

- [ ] **Step 5: Renderizar o campo de busca**

Localize o fechamento do `<div className="dp-header">` (linha ~251) e o início de `<div className="dp-chips">` (linha ~253):

```javascript
        </div>
      </div>

      <div className="dp-chips">
```

Troque por:

```javascript
        </div>
      </div>

      <div className="dp-busca-wrap">
        <input
          type="text"
          className="dp-busca-input"
          placeholder="Buscar por cliente, número do pedido ou arquiteto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button
            type="button"
            className="dp-busca-limpar"
            onClick={() => setBusca("")}
            aria-label="Limpar busca"
          >
            ×
          </button>
        )}
      </div>

      <div className="dp-chips">
```

- [ ] **Step 6: Adicionar os estilos do campo de busca**

Em `frontend-web/src/pages/pedidos/Pedidos.css`, adicione ao final do arquivo:

```css
/* ── Busca ── */
.dp-busca-wrap {
  position: relative;
  margin-bottom: 16px;
  max-width: 420px;
}

.dp-busca-input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #334155);
  background: var(--color-surface, #1e293b);
  color: var(--color-text, #f1f5f9);
  font-size: 13px;
  box-sizing: border-box;
}

.dp-busca-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
}

.dp-busca-limpar {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
}

.dp-busca-limpar:hover {
  color: var(--color-text, #f1f5f9);
}
```

- [ ] **Step 7: Lint e build**

Run: `cd frontend-web && npm run lint`
Expected: sem novos erros em `Pedidos.jsx` (avisos pré-existentes em outros arquivos, se houver, não são deste escopo).

Run: `cd frontend-web && npm run build`
Expected: build concluído sem erros (exit code 0).

- [ ] **Step 8: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(pedidos): adiciona barra de busca por cliente, numero e arquiteto"
```

---

### Task 4: Verificação manual no navegador

**Files:** nenhum (apenas verificação).

**Interfaces:**
- Consumes: Tasks 1-3 completas e commitadas.
- Produces: confirmação de que a feature funciona ponta a ponta (backend + frontend).

- [ ] **Step 1: Subir o backend e o frontend localmente**

Run: `cd backend && npm run dev` (ou o comando de start já usado no projeto)
Run: `cd frontend-web && npm run dev`

- [ ] **Step 2: Testar manualmente no navegador**

Abrir a tela de Pedidos e verificar:
1. Digitar um nome de cliente existente → lista filtra para pedidos daquele cliente (após ~350ms).
2. Digitar um número de pedido existente (com ou sem `#`) → lista filtra para aquele pedido.
3. Digitar o nome de um arquiteto vinculado a algum pedido → lista filtra para os pedidos daquele arquiteto.
4. Combinar um chip de status (ex.: "Concluído") com um termo de busca → lista mostra apenas pedidos que atendem aos dois critérios.
5. Limpar a busca (botão ×) → lista volta a mostrar todos os pedidos do filtro de status ativo.
6. Termo sem nenhum resultado → tela mostra "Nenhum pedido encontrado.".

Não há ferramenta de screenshot/browser automatizado neste ambiente — esta etapa deve ser feita pelo usuário.
