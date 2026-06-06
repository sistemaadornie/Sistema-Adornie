# Pedidos — Redesign Fluxo por Etapas + Auditoria

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir Pedidos.jsx pelo DashboardPedidos renomeado em `/pedidos`, redesenhar PedidoFluxo com 2 etapas em cards grandes + modais com abas Detalhes/Histórico, e criar sistema de auditoria campo a campo.

**Architecture:** Backend cria `pedido_auditoria` + campo `sem_vinculo`, `auditoriaService` centraliza gravação, `pedidoService.atualizar` detecta diff e seta `verificacao_ok` automaticamente. Frontend: DashboardPedidos→Pedidos em `/pedidos`, PedidoFluxo reconstruído com 2 cards horizontais + modais.

**Tech Stack:** Node.js/Express + pg pool, React 18 lazy/Suspense, react-router-dom v6, CSS puro, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-06-06-pedidos-fluxo-redesign.md`

---

## File Map

| Ação | Caminho |
|------|---------|
| Criar | `backend/src/database/migrations/pedido_auditoria.sql` |
| Criar | `backend/src/services/auditoriaService.js` |
| Modificar | `backend/src/services/pedidoService.js` |
| Modificar | `backend/src/services/agendamentoService.js` |
| Modificar | `backend/src/routes/pedidosRoutes.js` |
| Deletar | `frontend-web/src/pages/pedidos/Pedidos.jsx` |
| Deletar | `frontend-web/src/pages/pedidos/Pedidos.css` |
| Mover | `frontend-web/src/pages/dashboard/DashboardPedidos.jsx` → `frontend-web/src/pages/pedidos/Pedidos.jsx` |
| Mover | `frontend-web/src/pages/dashboard/DashboardPedidos.css` → `frontend-web/src/pages/pedidos/Pedidos.css` |
| Mover | `frontend-web/src/pages/dashboard/hooks/useDashboardPedidos.js` → `frontend-web/src/pages/pedidos/hooks/usePedidos.js` |
| Modificar | `frontend-web/src/pages/pedidos/Pedidos.jsx` (após mover) |
| Modificar | `frontend-web/src/pages/pedidos/Pedidos.css` (após mover) |
| Reconstruir | `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` |
| Reconstruir | `frontend-web/src/pages/pedidos/PedidoFluxo.css` |
| Modificar | `frontend-web/src/App.jsx` |
| Modificar | `frontend-web/src/components/Sidebar.jsx` |

---

## Task 1: Migration SQL

**Files:**
- Criar: `backend/src/database/migrations/pedido_auditoria.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- backend/src/database/migrations/pedido_auditoria.sql

-- Campo sem_vinculo em pedido_itens
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS sem_vinculo BOOLEAN NOT NULL DEFAULT false;

-- Tabela de auditoria de pedidos
CREATE TABLE IF NOT EXISTS pedido_auditoria (
  id          SERIAL PRIMARY KEY,
  pedido_id   INTEGER      NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id  INTEGER      NOT NULL,
  usuario_id  INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  etapa       VARCHAR(30)  NOT NULL,
  acao        VARCHAR(60)  NOT NULL,
  descricao   TEXT,
  dados_antes JSONB,
  dados_depois JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_auditoria_pedido ON pedido_auditoria(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_auditoria_etapa  ON pedido_auditoria(pedido_id, etapa);
```

- [ ] **Step 2: Aplicar no banco**

```bash
psql $DATABASE_URL -f backend/src/database/migrations/pedido_auditoria.sql
```

Esperado: `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX` sem erros.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/pedido_auditoria.sql
git commit -m "feat(db): migration pedido_auditoria + pedido_itens.sem_vinculo"
```

---

## Task 2: auditoriaService.js

**Files:**
- Criar: `backend/src/services/auditoriaService.js`

- [ ] **Step 1: Criar o arquivo**

```js
"use strict";
// Centraliza gravação e leitura da tabela pedido_auditoria.
// registrarAuditoria deve ser chamado DENTRO da mesma transação (mesmo client pg).

async function registrarAuditoria(client, { pedidoId, empresaId, usuarioId, etapa, acao, descricao, dadosAntes, dadosDepois }) {
  await client.query(
    `INSERT INTO pedido_auditoria
       (pedido_id, empresa_id, usuario_id, etapa, acao, descricao, dados_antes, dados_depois)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      pedidoId,
      empresaId,
      usuarioId || null,
      etapa,
      acao,
      descricao || null,
      dadosAntes  ? JSON.stringify(dadosAntes)  : null,
      dadosDepois ? JSON.stringify(dadosDepois) : null,
    ]
  );
}

async function listarAuditoria(db, pedidoId, empresaId, etapa) {
  const params = [pedidoId, empresaId];
  let etapaClause = "";
  if (etapa) {
    params.push(etapa);
    etapaClause = `AND a.etapa = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT a.id, a.etapa, a.acao, a.descricao, a.dados_antes, a.dados_depois,
            a.created_at, u.nome_completo AS usuario_nome
     FROM pedido_auditoria a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.pedido_id = $1 AND a.empresa_id = $2 ${etapaClause}
     ORDER BY a.created_at DESC`,
    params
  );
  return rows;
}

module.exports = { registrarAuditoria, listarAuditoria };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/auditoriaService.js
git commit -m "feat(backend): auditoriaService — registrar e listar auditoria de pedidos"
```

---

## Task 3: pedidoService.js — sem_vinculo + verificacao_ok automático + auditoria

**Files:**
- Modificar: `backend/src/services/pedidoService.js`

- [ ] **Step 1: Adicionar require do auditoriaService no topo do arquivo**

Localizar as linhas de require no início do arquivo e adicionar:

```js
const auditSvc = require("./auditoriaService");
```

- [ ] **Step 2: Adicionar helper `_verificarEtapa1` após a função `toDecimal`**

Localizar a função `toDecimal` e adicionar logo após:

```js
async function _verificarEtapa1(client, pedidoId) {
  const [pdfRes, itensRes] = await Promise.all([
    client.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id=$1 LIMIT 1`, [pedidoId]),
    client.query(`SELECT id, categoria_id, sem_vinculo FROM pedido_itens WHERE pedido_id=$1`, [pedidoId]),
  ]);

  if (!pdfRes.rows.length) return false;

  const itens = itensRes.rows;
  if (!itens.length) return false;

  const todasCategorizadas = itens.every(it => it.categoria_id != null);
  if (!todasCategorizadas) return false;

  // Verificar vínculos: cada item deve ter sem_vinculo=true OU ter um vínculo
  const itemIds = itens.map(it => it.id);
  const { rows: vinculosRows } = await client.query(
    `SELECT DISTINCT item_id FROM pedido_item_vinculos WHERE item_id = ANY($1)`,
    [itemIds]
  );
  const comVinculo = new Set(vinculosRows.map(r => r.item_id));

  const todosVinculosOk = itens.every(it => it.sem_vinculo || comVinculo.has(it.id));
  return todosVinculosOk;
}
```

- [ ] **Step 3: Atualizar `_salvarItens` para gravar `sem_vinculo`**

No UPDATE existente (linha ~156), adicionar `sem_vinculo=$16` à lista de colunas:

```js
await client.query(
  `UPDATE pedido_itens
   SET ambiente=$1, referencia=$2, cor=$3, descricao=$4, medidas=$5,
       quantidade=$6, unidade=$7, preco_unitario=$8, valor=$9, ordem=$10,
       modelo=$11, especificacoes=$12, largura=$13, altura=$14,
       categoria_id=$15, sem_vinculo=$16
   WHERE id=$17 AND pedido_id=$18`,
  [
    it.ambiente?.trim()    || null,
    it.referencia?.trim()  || null,
    it.cor?.trim()         || null,
    it.descricao?.trim()   || "",
    it.medidas?.trim()     || null,
    parseFloat(it.quantidade) || 1,
    it.unidade?.trim()     || null,
    toDecimal(it.preco_unitario),
    toDecimal(it.valor),
    i,
    it.modelo?.trim()      || null,
    (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
    toDecimal(it.largura),
    toDecimal(it.altura),
    it.categoria_id ?? null,
    it.sem_vinculo  ?? false,
    itemId,
    pedidoId,
  ]
);
```

No INSERT (linha ~186), adicionar `sem_vinculo` à lista de colunas e valores:

```js
const ins = await client.query(
  `INSERT INTO pedido_itens
     (pedido_id, ambiente, referencia, cor, descricao, medidas,
      quantidade, unidade, preco_unitario, valor, ordem,
      modelo, especificacoes, largura, altura, categoria_id, sem_vinculo)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
   RETURNING id`,
  [
    pedidoId,
    it.ambiente?.trim()    || null,
    it.referencia?.trim()  || null,
    it.cor?.trim()         || null,
    it.descricao?.trim()   || "",
    it.medidas?.trim()     || null,
    parseFloat(it.quantidade) || 1,
    it.unidade?.trim()     || null,
    toDecimal(it.preco_unitario),
    toDecimal(it.valor),
    i,
    it.modelo?.trim()      || null,
    (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
    toDecimal(it.largura),
    toDecimal(it.altura),
    it.categoria_id ?? null,
    it.sem_vinculo  ?? false,
  ]
);
```

- [ ] **Step 4: Modificar `atualizar` para aceitar `userId`, capturar diff e gravar auditoria**

Substituir a assinatura e o corpo de `atualizar`:

```js
async function atualizar(id, empresaId, dados, userId) {
  const {
    cliente_id, cpf_cnpj, email_cliente, status, data_pedido,
    consultor_id, arquiteto_id, descricao, observacoes, observacoes_entrega,
    cep, rua, numero, complemento, bairro, cidade, estado,
    subtotal, desconto, total,
    itens = [], pagamentos = [],
  } = dados;

  if (status && !STATUS_VALIDOS.includes(status)) {
    const e = new Error("Status inválido."); e.status = 400; throw e;
  }

  const partes = [rua, numero, complemento, bairro, cidade, estado ? `- ${estado}` : ""].filter(Boolean);
  const endereco = partes.length ? partes.join(", ") + (cep ? ` — CEP ${cep}` : "") : null;

  // Captura estado atual para diff de auditoria
  const pedidoAntes = await montarPedido(id, empresaId);
  if (!pedidoAntes) {
    const e = new Error("Pedido não encontrado."); e.status = 404; throw e;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `UPDATE pedidos SET
         cliente_id=$1, cpf_cnpj=$2, email_cliente=$3, status=$4, data_pedido=$5,
         consultor_id=$6, arquiteto_id=$7, descricao=$8, observacoes=$9, observacoes_entrega=$10,
         cep=$11, rua=$12, numero=$13, complemento=$14, bairro=$15,
         cidade=$16, estado=$17, endereco=$18,
         subtotal=$19, desconto=$20, total=$21, updated_at=NOW()
       WHERE id=$22 AND empresa_id=$23 AND deleted_at IS NULL
       RETURNING id`,
      [
        cliente_id || null, cpf_cnpj?.trim() || null, email_cliente?.trim() || null,
        status || pedidoAntes.status, data_pedido || null,
        consultor_id || null, arquiteto_id || null, descricao?.trim() || null,
        observacoes?.trim() || null, observacoes_entrega?.trim() || null,
        cep || null, rua || null, numero || null, complemento || null,
        bairro || null, cidade || null, estado || null, endereco,
        toDecimal(subtotal), toDecimal(desconto) ?? 0, toDecimal(total),
        id, empresaId,
      ]
    );

    if (upd.rows.length === 0) {
      const e = new Error("Pedido não encontrado."); e.status = 404; throw e;
    }

    await _salvarItens(client, id, itens);
    await _salvarPagamentos(client, id, pagamentos);

    // Verifica se etapa 1 foi concluída e seta verificacao_ok
    const etapa1Ok = await _verificarEtapa1(client, id);
    if (etapa1Ok && !pedidoAntes.verificacao_ok) {
      await client.query(
        `UPDATE pedidos SET verificacao_ok=true WHERE id=$1 AND empresa_id=$2`,
        [id, empresaId]
      );
    }

    // Monta diff para auditoria
    const camposAuditados = ["cliente_id","cpf_cnpj","email_cliente","status","data_pedido",
      "consultor_id","arquiteto_id","descricao","observacoes","observacoes_entrega",
      "cep","rua","numero","complemento","bairro","cidade","estado","subtotal","desconto","total"];
    const dadosDepoisAudit = { cliente_id, cpf_cnpj, email_cliente, status, data_pedido,
      consultor_id, arquiteto_id, descricao, observacoes, observacoes_entrega,
      cep, rua, numero, complemento, bairro, cidade, estado, subtotal, desconto, total };

    const diff = {};
    for (const campo of camposAuditados) {
      const antes = pedidoAntes[campo];
      const depois = dadosDepoisAudit[campo];
      if (String(antes ?? "") !== String(depois ?? "")) {
        diff[campo] = { antes, depois };
      }
    }

    const descDiff = Object.entries(diff)
      .map(([k, { antes, depois }]) => `${k}: "${antes ?? ""}" → "${depois ?? ""}"`)
      .join(", ");

    await auditSvc.registrarAuditoria(client, {
      pedidoId: id,
      empresaId,
      usuarioId: userId,
      etapa: "dados_pedido",
      acao: "edicao",
      descricao: descDiff || "Pedido editado",
      dadosAntes: pedidoAntes,
      dadosDepois: dadosDepoisAudit,
    });

    if (etapa1Ok && !pedidoAntes.verificacao_ok) {
      await auditSvc.registrarAuditoria(client, {
        pedidoId: id,
        empresaId,
        usuarioId: userId,
        etapa: "dados_pedido",
        acao: "verificacao_ok",
        descricao: "Verificação concluída — etapa 1 completa",
      });
    }

    await client.query("COMMIT");
    return montarPedido(id, empresaId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Modificar `importar` para gravar auditoria**

Localizar o trecho após `await client.query("COMMIT")` dentro de `importar` e adicionar antes do `return`:

```js
// Auditoria de importação (após COMMIT, usando db diretamente)
await db.query(
  `INSERT INTO pedido_auditoria
     (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
   VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido importado')`,
  [pedidoId, empresaId, userId]
);
```

> **Nota:** A função `importar` usa `client` mas libera com `client.release()` após o `COMMIT`. Use `db.query` para a auditoria após o `client.release()`, ou inclua a query de auditoria dentro da transação antes do `COMMIT`. Verifique a estrutura atual do `importar` e prefira incluir dentro da transação.

- [ ] **Step 6: Atualizar `montarPedido` para incluir `sem_vinculo` nos itens**

A query de itens já retorna `pi.*`, portanto `sem_vinculo` já virá automaticamente após a migration. Verificar que o campo aparece nos itens retornados.

- [ ] **Step 7: Adicionar `atualizarEtapa` com auditoria (para PDF vinculado via endpoint existente)**

Localizar a função `atualizarEtapa` existente no arquivo (adicionada em plan anterior) e garantir que ela registra auditoria:

```js
async function atualizarEtapa(pedidoId, empresaId, userId, permissoes, campo, valor) {
  const CAMPOS_VALIDOS = ["verificacao_ok", "categorizacao_ok"];
  if (!CAMPOS_VALIDOS.includes(campo)) {
    const e = new Error("Campo inválido"); e.status = 400; throw e;
  }

  const { rows } = await db.query(
    `SELECT consultor_id FROM pedidos WHERE id=$1 AND empresa_id=$2`,
    [pedidoId, empresaId]
  );
  if (!rows.length) { const e = new Error("Pedido não encontrado"); e.status = 404; throw e; }

  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  if (!temPermGeral && rows[0].consultor_id !== userId) {
    const e = new Error("Acesso negado"); e.status = 403; throw e;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE pedidos SET ${campo}=$1 WHERE id=$2 AND empresa_id=$3`,
      [valor, pedidoId, empresaId]
    );
    await auditSvc.registrarAuditoria(client, {
      pedidoId, empresaId, usuarioId: userId,
      etapa: "dados_pedido",
      acao: campo,
      descricao: `${campo} marcado como ${valor}`,
    });
    await client.query("COMMIT");
    return { [campo]: valor };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 8: Garantir que `atualizar` está exportado com a nova assinatura e que `atualizarEtapa` também**

Verificar o `module.exports` no final do arquivo:

```js
module.exports = { listar, buscar, criar, atualizar, excluir, importar, atualizarEtapa };
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/pedidoService.js
git commit -m "feat(backend): pedidoService — sem_vinculo, verificacao_ok automático, auditoria em atualizar/importar"
```

---

## Task 4: pedidosRoutes.js — passar userId para atualizar + endpoint de auditoria

**Files:**
- Modificar: `backend/src/routes/pedidosRoutes.js`

- [ ] **Step 1: Adicionar require do auditoriaService**

```js
const auditSvc = require("../services/auditoriaService");
```

- [ ] **Step 2: Atualizar a chamada de `svc.atualizar` para passar `req.user.id`**

Localizar a rota `PUT /:id` (ou `PATCH /:id`) que chama `svc.atualizar` e adicionar `req.user.id` como 4º argumento:

```js
const pedido = await svc.atualizar(Number(req.params.id), req.user.empresa_id, req.body, req.user.id);
```

- [ ] **Step 3: Adicionar endpoint de auditoria antes do `module.exports`**

```js
// GET /api/pedidos/:id/auditoria?etapa=dados_pedido
router.get("/:id/auditoria", authMiddleware, async (req, res) => {
  try {
    const { etapa } = req.query;
    const registros = await auditSvc.listarAuditoria(
      db,
      Number(req.params.id),
      req.user.empresa_id,
      etapa || null
    );
    return res.json({ auditoria: registros });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message });
  }
});
```

- [ ] **Step 4: Adicionar auditoria ao endpoint de upload de PDF**

Localizar o endpoint `POST /:id/anexo-pdf` e após salvar o anexo com sucesso, adicionar:

```js
await db.query(
  `INSERT INTO pedido_auditoria
     (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
   VALUES ($1,$2,$3,'dados_pedido','pdf_vinculado','PDF original vinculado ao pedido')`,
  [Number(req.params.id), req.user.empresa_id, req.user.id]
);
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(backend): pedidosRoutes — userId em atualizar, endpoint /auditoria, audit no upload PDF"
```

---

## Task 5: agendamentoService.js — auditoria ao criar genitor e ao concluir

**Files:**
- Modificar: `backend/src/services/agendamentoService.js`

- [ ] **Step 1: Adicionar require do auditoriaService no topo**

```js
const auditSvc = require("./auditoriaService");
```

- [ ] **Step 2: Registrar auditoria em `criar()` quando há `pedido_id` (pré-agendamento genitor)**

Localizar o trecho após `await client.query("COMMIT")` dentro de `criar()` (próximo ao bloco `// Auto-transição: pedido pendente → em_andamento`) e adicionar:

```js
// Auditoria de pré-agendamento
if (pedidoIdFinal && temItensPedido) {
  await db.query(
    `INSERT INTO pedido_auditoria
       (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
     VALUES ($1,$2,$3,'entrega','pre_agendamento_criado',$4)`,
    [
      pedidoIdFinal,
      empresaId,
      userId,
      `Pré-agendamento criado${data ? ` para ${data}` : ""}`,
    ]
  );
}
```

> **Nota:** `pedidoIdFinal`, `empresaId`, `userId`, `data` devem ser variáveis já disponíveis no escopo de `criar()`. Verifique os nomes exatos consultando o início da função.

- [ ] **Step 3: Registrar auditoria em `atualizarStatus()` quando status → 'concluido'**

Localizar o trecho após o bloco de auto-conclusão do pedido em `atualizarStatus()` e adicionar:

```js
if (status === "concluido") {
  const agInfo = await db.query(
    `SELECT pedido_id FROM agendamentos WHERE id=$1`, [id]
  );
  const pedIdAudit = agInfo.rows[0]?.pedido_id;
  if (pedIdAudit) {
    await db.query(
      `INSERT INTO pedido_auditoria
         (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
       VALUES ($1,$2,$3,'entrega','agendamento_concluido',$4)`,
      [pedIdAudit, empresaId, userId || null, `Agendamento ${id} concluído`]
    );
  }
}
```

> **Nota:** `userId` pode não existir no escopo de `atualizarStatus()` — verifique a assinatura e adicione o parâmetro se necessário. Se a função já recebe `userId`, use-o diretamente.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/agendamentoService.js
git commit -m "feat(backend): agendamentoService — auditoria ao criar pré-agendamento e ao concluir"
```

---

## Task 6: Frontend — Operações de arquivo (renomear, mover, deletar)

- [ ] **Step 1: Copiar DashboardPedidos.jsx para o novo local**

```bash
cp frontend-web/src/pages/dashboard/DashboardPedidos.jsx frontend-web/src/pages/pedidos/Pedidos.jsx
cp frontend-web/src/pages/dashboard/DashboardPedidos.css  frontend-web/src/pages/pedidos/Pedidos.css
cp frontend-web/src/pages/dashboard/hooks/useDashboardPedidos.js frontend-web/src/pages/pedidos/hooks/usePedidos.js
```

- [ ] **Step 2: Deletar arquivos antigos**

```bash
rm frontend-web/src/pages/dashboard/DashboardPedidos.jsx
rm frontend-web/src/pages/dashboard/DashboardPedidos.css
rm frontend-web/src/pages/dashboard/hooks/useDashboardPedidos.js
```

> Deletar também o antigo `Pedidos.jsx` e `Pedidos.css` que serão substituídos pelos arquivos copiados acima (a cópia sobrescreve).
> O antigo `Pedidos.jsx` (lista+painel) será completamente substituído pelo novo conteúdo — não precisa deletar explicitamente.

- [ ] **Step 3: Atualizar imports dentro de `Pedidos.jsx` (novo)**

No arquivo `frontend-web/src/pages/pedidos/Pedidos.jsx` (recém-copiado):

- Alterar `import "./DashboardPedidos.css"` → `import "./Pedidos.css"`
- Alterar `import useDashboardPedidos from "./hooks/useDashboardPedidos"` → `import usePedidos from "./hooks/usePedidos"`
- Alterar uso de `useDashboardPedidos()` → `usePedidos()`

No arquivo `frontend-web/src/pages/pedidos/hooks/usePedidos.js`:

- Verificar se tem alguma referência interna ao nome antigo — nenhuma esperada, pois o arquivo só exporta o hook.

- [ ] **Step 4: Atualizar `Pedidos.jsx` — título + botão importar + filtros**

No componente `DashboardPedidos` (agora `Pedidos`), fazer as seguintes mudanças:

**Renomear o componente:**
```jsx
export default function Pedidos() {   // era DashboardPedidos
```

**Alterar o título:**
```jsx
<h1 className="dp-titulo">Pedidos de Venda</h1>
```

**Adicionar botão Importar ao lado do título** (já existe `ImportarPedidoModal` no antigo Pedidos.jsx — importar e usar):
```jsx
import ImportarPedidoModal from "./ImportarPedidoModal";
```

Adicionar state e handlers:
```jsx
const [importarAberto, setImportarAberto] = useState(false);
const [salvando, setSalvando] = useState(false);

async function handleImportarSalvar(dados, pdfFile) {
  setSalvando(true);
  try {
    const { api, API_BASE } = await import("../../services/api");
    // importar via usePedidos não existe — chamar API diretamente
    const res = await api.post("/pedidos/importar", dados);
    const novo = res.pedido || res;
    if (pdfFile && novo?.id) {
      const fd = new FormData();
      fd.append("arquivo", pdfFile);
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/pedidos/${novo.id}/anexo-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
    }
    setImportarAberto(false);
    carregar({});
  } catch (e) {
    console.error(e);
  } finally {
    setSalvando(false);
  }
}
```

Adicionar botão no header:
```jsx
<div className="dp-header">
  <h1 className="dp-titulo">Pedidos de Venda</h1>
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <button className="dp-btn-importar" onClick={() => setImportarAberto(true)}>
      ↑ Importar pedido
    </button>
    {temPermGeral && (
      // ... toggle existente
    )}
  </div>
</div>
```

Adicionar modal no final do JSX (antes do fechamento da div principal):
```jsx
{importarAberto && (
  <ImportarPedidoModal
    onClose={() => setImportarAberto(false)}
    onSalvar={handleImportarSalvar}
    salvando={salvando}
  />
)}
```

**Atualizar filtros** — substituir o array `FILTROS`:
```jsx
const FILTROS = [
  { key: "todos",        label: "Todos" },
  { key: "pendente",     label: "Pendente" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "atrasados",    label: "Atrasado" },
  { key: "concluido",    label: "Concluído" },
];
```

**Adicionar classe CSS para o botão importar em `Pedidos.css`:**
```css
.dp-btn-importar {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #334155);
  background: var(--color-surface, #1e293b);
  color: var(--color-text, #f1f5f9);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: border-color 0.15s, color 0.15s;
}
.dp-btn-importar:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/
git add frontend-web/src/pages/dashboard/
git commit -m "feat(frontend): Pedidos.jsx — renomear DashboardPedidos, título + importar + filtros corretos"
```

---

## Task 7: App.jsx + Sidebar.jsx

**Files:**
- Modificar: `frontend-web/src/App.jsx`
- Modificar: `frontend-web/src/components/Sidebar.jsx`

- [ ] **Step 1: App.jsx — remover imports antigos e atualizar rotas**

Remover:
```jsx
const Pedidos = lazy(() => import("./pages/pedidos/Pedidos"));  // era o Pedidos antigo — agora é o mesmo arquivo mas com novo conteúdo
const DashboardPedidos = lazy(() => import("./pages/dashboard/DashboardPedidos"));
```

Manter apenas (o arquivo mudou de conteúdo, mas o import path `/pedidos/Pedidos` continua):
```jsx
const Pedidos    = lazy(() => import("./pages/pedidos/Pedidos"));
const PedidoFluxo = lazy(() => import("./pages/pedidos/PedidoFluxo"));
```

Remover a rota `/dashboard-pedidos`:
```jsx
// REMOVER esta linha:
<Route path="/dashboard-pedidos" element={<DashboardPedidos />} />
```

Garantir que as rotas de pedidos ficam assim:
```jsx
<Route element={<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]} />}>
  <Route path="/pedidos"              element={<Pedidos />} />
  <Route path="/pedidos/os/:osId"     element={<OrdemServicoPage />} />
  <Route path="/pedidos/:id/fluxo"    element={<PedidoFluxo />} />
  {/* demais rotas do bloco permanecem */}
</Route>
```

- [ ] **Step 2: Sidebar.jsx — remover link Dashboard de Pedidos**

Localizar e remover o bloco:
```jsx
{podeVerDashboardPedidos && (
  <NavLink to="/dashboard-pedidos" className={navItemClass} title="Dashboard Pedidos">
    <FaChartBar className="sidebar-icon" />
    {!collapsed && <span className="sidebar-label">Dashboard</span>}
  </NavLink>
)}
```

Remover também a variável:
```jsx
const podeVerDashboardPedidos = temPerm(user, "COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS");
```

O link de Pedidos já existente (`/pedidos`) permanece sem alteração — agora renderiza o novo componente.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/App.jsx frontend-web/src/components/Sidebar.jsx
git commit -m "feat(frontend): App + Sidebar — /pedidos aponta para novo Pedidos, remove /dashboard-pedidos"
```

---

## Task 8: PedidoFluxo.jsx — Redesign completo

**Files:**
- Reconstruir: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`
- Reconstruir: `frontend-web/src/pages/pedidos/PedidoFluxo.css`

- [ ] **Step 1: Substituir PedidoFluxo.jsx pelo novo design**

```jsx
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api, API_BASE } from "../../services/api";
import PedidoPrint from "./PedidoPrint";
import ModalSelecionarItensInstalacao from "./ModalSelecionarItensInstalacao";
import MidiasGaleria from "../../components/MidiasGaleria";
import "./PedidoFluxo.css";

const FORMAS_PAGAMENTO = ["PIX / DEPÓSITO", "CONTRA ENTREGA", "CARTÃO DE CRÉDITO", "BOLETO", "DINHEIRO", "CHEQUE"];
const UNIDADES = ["M2", "ML", "UN", "PÇ"];

function fmtData(iso) {
  if (!iso) return "";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtMoeda(v) {
  if (v == null || v === "") return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDatetime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit" });
}

/* ── CARD ETAPA ── */
function CardEtapa({ numero, titulo, concluido, ativo, onClick }) {
  let cls = "pf-card-etapa";
  if (concluido) cls += " pf-card-verde";
  else if (ativo) cls += " pf-card-azul pf-pulsante";
  else cls += " pf-card-cinza";

  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="pf-card-icone">
        {concluido ? "✓" : numero}
      </div>
      <div className="pf-card-titulo">{titulo}</div>
      {concluido && <div className="pf-card-sub">Concluído</div>}
      {!concluido && ativo && <div className="pf-card-sub">Em andamento</div>}
      {!concluido && !ativo && <div className="pf-card-sub">Aguardando</div>}
    </div>
  );
}

/* ── SETA ENTRE CARDS ── */
function SetaConector({ ativo }) {
  return <div className={`pf-seta-conector${ativo ? " pf-seta-ativa" : ""}`}>→</div>;
}

/* ── ABA HISTÓRICO ── */
function AbaHistorico({ pedidoId, etapa }) {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/pedidos/${pedidoId}/auditoria?etapa=${etapa}`)
      .then(res => setRegistros(res.auditoria || []))
      .catch(() => setRegistros([]))
      .finally(() => setLoading(false));
  }, [pedidoId, etapa]);

  if (loading) return <div className="pf-hist-loading">Carregando histórico...</div>;
  if (!registros.length) return <div className="pf-hist-vazio">Nenhum registro ainda.</div>;

  const COR_ACAO = {
    importacao: "#10b981", pdf_vinculado: "#10b981", verificacao_ok: "#10b981",
    edicao: "#f59e0b", categoria_definida: "#f59e0b", vinculo_resolvido: "#f59e0b",
    pre_agendamento_criado: "#3b82f6", agendamento_concluido: "#10b981",
    pedido_concluido: "#10b981",
  };

  return (
    <div className="pf-historico">
      {registros.map(r => (
        <div key={r.id} className="pf-hist-item">
          <div className="pf-hist-bolinha" style={{ background: COR_ACAO[r.acao] || "#64748b" }} />
          <div className="pf-hist-corpo">
            <div className="pf-hist-desc">
              <strong>{r.usuario_nome || "Sistema"}</strong> — {r.descricao}
            </div>
            <div className="pf-hist-data">{fmtDatetime(r.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── MODAL BASE ── */
function Modal({ titulo, onClose, children }) {
  return (
    <div className="pf-modal-overlay" onClick={onClose}>
      <div className="pf-modal" onClick={e => e.stopPropagation()}>
        <div className="pf-modal-header">
          <h2 className="pf-modal-titulo">{titulo}</h2>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── MODAL DADOS DO PEDIDO ── */
function ModalDadosPedido({ pedido, pedidoId, empresaId, onClose, onAtualizado, user }) {
  const navigate = useNavigate();
  const [aba, setAba]           = useState("detalhes");
  const [editando, setEditando] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [instalacao, setInstalacao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast]       = useState("");

  // Form state (para edição inline)
  const [form, setForm] = useState(() => ({
    cliente_id:          pedido?.cliente_id          ?? "",
    cpf_cnpj:            pedido?.cpf_cnpj            ?? "",
    email_cliente:       pedido?.email_cliente        ?? "",
    status:              pedido?.status              ?? "pendente",
    data_pedido:         pedido?.data_pedido ? pedido.data_pedido.slice(0,10) : "",
    consultor_id:        pedido?.consultor_id        ?? "",
    arquiteto_id:        pedido?.arquiteto_id        ?? "",
    descricao:           pedido?.descricao           ?? "",
    observacoes:         pedido?.observacoes         ?? "",
    observacoes_entrega: pedido?.observacoes_entrega ?? "",
    cep:                 pedido?.cep                 ?? "",
    rua:                 pedido?.rua                 ?? "",
    numero:              pedido?.numero_rua          ?? "",
    complemento:         pedido?.complemento         ?? "",
    bairro:              pedido?.bairro              ?? "",
    cidade:              pedido?.cidade              ?? "",
    estado:              pedido?.estado              ?? "",
    subtotal:            pedido?.subtotal            ?? "",
    desconto:            pedido?.desconto            ?? "",
    total:               pedido?.total               ?? "",
  }));
  const [itens, setItens] = useState(() =>
    pedido?.itens?.length
      ? pedido.itens.map((it, _, arr) => {
          const vinculoId = it.vinculos?.[0]?.item_vinculado_id ?? null;
          const vinculoIdx = vinculoId != null ? arr.findIndex(o => o.id === vinculoId) : -1;
          return { ...it, item_vinculado_idx: vinculoIdx >= 0 ? vinculoIdx : null };
        })
      : []
  );
  const [pagamentos, setPagamentos] = useState(() =>
    pedido?.pagamentos?.length
      ? pedido.pagamentos.map(pg => ({ ...pg, vencimento: pg.vencimento?.slice(0,10) ?? "" }))
      : []
  );
  const [clientes,    setClientes]    = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [arquitetos,  setArquitetos]  = useState([]);
  const [categorias,  setCategorias]  = useState([]);

  useEffect(() => {
    if (!editando) return;
    api.get("/clientes").then(r => setClientes(r.clientes || [])).catch(() => {});
    api.get("/auth/admin/usuarios").then(r => setConsultores((r.usuarios||[]).filter(u=>u.status==="aprovado"))).catch(() => {});
    api.get("/arquitetos").then(r => setArquitetos(r.arquitetos||[])).catch(() => {});
    api.get("/categorias").then(r => setCategorias(r.categorias||[])).catch(() => {});
  }, [editando]);

  function mostrarToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function setItem(i, k, v) {
    setItens(prev => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      if (k === "sem_vinculo" && v) novo[i].item_vinculado_idx = null;
      if ((k === "quantidade" || k === "preco_unitario")) {
        const q = parseFloat(String(k==="quantidade"?v:novo[i].quantidade).replace(",",".")) || 0;
        const p = parseFloat(String(k==="preco_unitario"?v:novo[i].preco_unitario).replace(",",".")) || 0;
        novo[i].valor = (q * p).toFixed(2);
      }
      return novo;
    });
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const itensFiltrados = itens.filter(it => it.descricao?.trim());
      const dados = {
        ...form,
        cliente_id:   form.cliente_id   ? Number(form.cliente_id)   : null,
        consultor_id: form.consultor_id ? Number(form.consultor_id) : null,
        arquiteto_id: form.arquiteto_id ? Number(form.arquiteto_id) : null,
        itens:        itensFiltrados,
        pagamentos:   pagamentos.filter(pg => pg.forma?.trim()),
      };
      await api.put(`/pedidos/${pedidoId}`, dados);
      mostrarToast("Salvo com sucesso!");
      setEditando(false);
      onAtualizado();
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!window.confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) return;
    try {
      await api.delete(`/pedidos/${pedidoId}`);
      onClose();
      onAtualizado();
    } catch (e) {
      mostrarToast(e.message || "Erro ao excluir.");
    }
  }

  async function handleAbrirPdf() {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/pedidos/${pedidoId}/anexo-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) { mostrarToast("PDF não encontrado."); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { mostrarToast("Erro ao abrir PDF."); }
  }

  const etapa1Completa = pedido?.verificacao_ok;

  return (
    <Modal titulo={`Dados do Pedido — ${pedido?.numero || `#${pedidoId}`}`} onClose={onClose}>
      {/* Abas */}
      <div className="pf-modal-abas">
        <button className={`pf-modal-aba${aba==="detalhes"?" ativa":""}`} onClick={() => setAba("detalhes")}>Detalhes</button>
        <button className={`pf-modal-aba${aba==="historico"?" ativa":""}`} onClick={() => setAba("historico")}>Histórico</button>
      </div>

      <div className="pf-modal-body">

        {aba === "detalhes" && !editando && (
          <>
            {/* Botões de ação */}
            <div className="pf-acoes">
              <button className="pf-btn pf-btn-primary" onClick={() => setEditando(true)}>✏ Editar</button>
              <button className="pf-btn" onClick={() => setPrintOpen(true)}>🖨 Imprimir</button>
              {pedido?.tem_anexo_pdf && (
                <button className="pf-btn" onClick={handleAbrirPdf}>📄 PDF Original</button>
              )}
              <button className="pf-btn" onClick={() => setInstalacao(pedido)}>📅 Agendar Instalação</button>
              <button className="pf-btn pf-btn-danger" onClick={handleExcluir}>🗑 Excluir</button>
            </div>

            {/* Status da etapa 1 */}
            {!etapa1Completa && (
              <div className="pf-etapa1-pendencias">
                <strong>Pendências para concluir esta etapa:</strong>
                <ul>
                  {!pedido?.tem_anexo_pdf && <li>PDF original não vinculado</li>}
                  {pedido?.itens?.some(it => !it.categoria_id) && <li>Itens sem categoria: {pedido.itens.filter(it=>!it.categoria_id).map(it=>it.descricao||"(sem nome)").join(", ")}</li>}
                  {pedido?.itens?.some(it => !it.sem_vinculo && !(it.vinculos?.length)) && <li>Itens sem vínculo resolvido — edite e marque "Nenhum" se não houver vínculo</li>}
                </ul>
              </div>
            )}

            {/* Informações do pedido */}
            <div className="pf-secao">
              <div className="pf-secao-titulo">Informações</div>
              <div className="pf-info-grid">
                <div><span className="pf-info-label">Cliente</span><span>{pedido?.cliente_nome || "—"}</span></div>
                <div><span className="pf-info-label">Consultora</span><span>{pedido?.consultor_nome || "—"}</span></div>
                <div><span className="pf-info-label">Arquiteto</span><span>{pedido?.arquiteto_nome || "—"}</span></div>
                <div><span className="pf-info-label">Data</span><span>{fmtData(pedido?.data_pedido)}</span></div>
                <div><span className="pf-info-label">Total</span><span className="pf-valor-destaque">R$ {fmtMoeda(pedido?.total)}</span></div>
                <div><span className="pf-info-label">Status</span><span>{pedido?.status}</span></div>
              </div>
            </div>

            {pedido?.endereco && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Endereço de Entrega</div>
                <p className="pf-texto">{pedido.endereco}</p>
              </div>
            )}

            {/* Itens */}
            {pedido?.itens?.length > 0 && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Itens ({pedido.itens.length})</div>
                <div className="pf-itens-wrap">
                  <table className="pf-itens-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Produto</th><th>Categoria</th><th>Vínculo</th>
                        <th>Medidas</th><th>Qtde</th><th>Preço</th><th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedido.itens.map((it, i) => (
                        <tr key={it.id}>
                          <td>{i+1}</td>
                          <td>{it.descricao}</td>
                          <td>
                            {it.categoria_nome
                              ? <span className="pf-cat-badge" style={{ background: it.categoria_cor || "#8B6914" }}>{it.categoria_nome}</span>
                              : <span className="pf-pendente">Sem categoria</span>}
                          </td>
                          <td>
                            {it.sem_vinculo
                              ? <span className="pf-sem-vinculo">Nenhum</span>
                              : it.vinculos?.length
                                ? <span className="pf-vinculado">Vinculado</span>
                                : <span className="pf-pendente">Pendente</span>}
                          </td>
                          <td>{it.medidas || "—"}</td>
                          <td>{it.quantidade}</td>
                          <td>{it.preco_unitario != null ? `R$ ${fmtMoeda(it.preco_unitario)}` : "—"}</td>
                          <td><strong>R$ {fmtMoeda(it.valor)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pf-totais">
                  {pedido.subtotal != null && <div>SubTotal: R$ {fmtMoeda(pedido.subtotal)}</div>}
                  {pedido.desconto > 0 && <div>Desconto: -R$ {fmtMoeda(pedido.desconto)}</div>}
                  <div className="pf-total-final">Total: R$ {fmtMoeda(pedido.total)}</div>
                </div>
              </div>
            )}

            {/* Pagamentos */}
            {pedido?.pagamentos?.length > 0 && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Pagamentos</div>
                {Object.entries(
                  pedido.pagamentos.reduce((acc,pg)=>{ if(!acc[pg.forma])acc[pg.forma]=[]; acc[pg.forma].push(pg); return acc; },{})
                ).map(([forma, pgs]) => (
                  <div key={forma} className="pf-pag-grupo">
                    <div className="pf-pag-forma">{forma}</div>
                    {pgs.map((pg,i) => (
                      <div key={i} className="pf-pag-row">
                        <span>{pg.parcela}</span>
                        <span>{fmtData(pg.vencimento)}</span>
                        <span>R$ {fmtMoeda(pg.valor)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {pedido?.observacoes && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Observações</div>
                <p className="pf-texto">{pedido.observacoes}</p>
              </div>
            )}

            {pedido?.observacoes_entrega && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Previsão de Entrega</div>
                <p className="pf-texto">{pedido.observacoes_entrega}</p>
              </div>
            )}

            <div className="pf-secao">
              <div className="pf-secao-titulo">Mídias</div>
              <MidiasGaleria pedidoId={pedidoId} token={localStorage.getItem("token")} />
            </div>
          </>
        )}

        {aba === "detalhes" && editando && (
          <div className="pf-form-edicao">
            <div className="pf-form-row">
              <div className="pf-form-field">
                <label>Cliente</label>
                <select value={form.cliente_id} onChange={e => setForm(f=>({...f,cliente_id:e.target.value}))}>
                  <option value="">— Sem cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="pf-form-field">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value}))}>
                  <option value="pendente">Pendente</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="pf-form-field">
                <label>Data do Pedido</label>
                <input type="date" value={form.data_pedido} onChange={e => setForm(f=>({...f,data_pedido:e.target.value}))} />
              </div>
            </div>
            <div className="pf-form-row">
              <div className="pf-form-field">
                <label>Consultora</label>
                <select value={form.consultor_id} onChange={e => setForm(f=>({...f,consultor_id:e.target.value}))}>
                  <option value="">— Selecionar —</option>
                  {consultores.map(u => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
                </select>
              </div>
              <div className="pf-form-field">
                <label>Arquiteto</label>
                <select value={form.arquiteto_id} onChange={e => setForm(f=>({...f,arquiteto_id:e.target.value}))}>
                  <option value="">— Selecionar —</option>
                  {arquitetos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="pf-form-row">
              <div className="pf-form-field" style={{flex:2}}>
                <label>Observações</label>
                <textarea rows={2} value={form.observacoes} onChange={e => setForm(f=>({...f,observacoes:e.target.value}))} />
              </div>
              <div className="pf-form-field" style={{flex:2}}>
                <label>Previsão de Entrega</label>
                <textarea rows={2} value={form.observacoes_entrega} onChange={e => setForm(f=>({...f,observacoes_entrega:e.target.value}))} />
              </div>
            </div>

            {/* Itens com categoria e vínculo */}
            <div className="pf-secao-titulo" style={{marginTop:16}}>Itens — Categoria e Vínculo</div>
            <div className="pf-itens-editor-wrap">
              {itens.map((it, i) => (
                <div key={i} className="pf-item-edit-row">
                  <span className="pf-item-num">{i+1}</span>
                  <span className="pf-item-desc">{it.descricao || "(sem descrição)"}</span>
                  <select
                    value={it.categoria_id ?? ""}
                    onChange={e => setItem(i, "categoria_id", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Categoria —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <select
                    value={it.sem_vinculo ? "__nenhum__" : (it.item_vinculado_idx != null ? String(it.item_vinculado_idx) : "")}
                    onChange={e => {
                      if (e.target.value === "__nenhum__") {
                        setItem(i, "sem_vinculo", true);
                      } else {
                        setItem(i, "sem_vinculo", false);
                        setItem(i, "item_vinculado_idx", e.target.value === "" ? null : Number(e.target.value));
                      }
                    }}
                  >
                    <option value="">— Vínculo —</option>
                    <option value="__nenhum__">Nenhum (sem vínculo necessário)</option>
                    {itens.map((other, j) => j !== i ? (
                      <option key={j} value={j}>{j+1} – {other.descricao || "(sem desc.)"}</option>
                    ) : null)}
                  </select>
                </div>
              ))}
            </div>

            <div className="pf-form-acoes">
              <button className="pf-btn" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</button>
              <button className="pf-btn pf-btn-primary" onClick={handleSalvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {aba === "historico" && (
          <AbaHistorico pedidoId={pedidoId} etapa="dados_pedido" />
        )}

      </div>

      {toast && <div className="pf-toast">{toast}</div>}

      {printOpen && <PedidoPrint pedido={pedido} onClose={() => setPrintOpen(false)} />}

      {instalacao && (
        <ModalSelecionarItensInstalacao
          pedido={instalacao}
          onClose={() => setInstalacao(null)}
          onContinuar={(itensSel) => {
            setInstalacao(null);
            navigate("/agendamentos", {
              state: {
                novoInstalacao: {
                  pedido_id:      pedido.id,
                  pedido_numero:  pedido.numero,
                  cliente:        pedido.cliente_nome || "",
                  cep:            pedido.cep,
                  rua:            pedido.rua,
                  numero:         pedido.numero_rua,
                  complemento:    pedido.complemento,
                  bairro:         pedido.bairro,
                  cidade:         pedido.cidade,
                  estado:         pedido.estado,
                  itens:          itensSel,
                },
              },
            });
          }}
        />
      )}
    </Modal>
  );
}

/* ── MODAL ENTREGA ── */
function ModalEntrega({ pedido, pedidoId, estagio, preAgendamentos, onClose, onAtualizado }) {
  const navigate = useNavigate();
  const [aba, setAba] = useState("detalhes");

  const etapa1Completa = pedido?.verificacao_ok;

  function handleMarcarPreAgendamento() {
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:     pedido.id,
          pedido_numero: pedido.numero,
          cliente:       pedido.cliente_nome || "",
          cep:           pedido.cep,
          rua:           pedido.rua,
          numero:        pedido.numero_rua,
          complemento:   pedido.complemento,
          bairro:        pedido.bairro,
          cidade:        pedido.cidade,
          estado:        pedido.estado,
          itens:         [],
        },
      },
    });
  }

  const STATUS_LABEL = { pendente:"Pendente", pre_agendado:"Pré-agendado", agendado:"Agendado", concluido:"Concluído", cancelado:"Cancelado" };
  const STATUS_COR   = { pendente:"#64748b", pre_agendado:"#3b82f6", agendado:"#f59e0b", concluido:"#10b981", cancelado:"#ef4444" };

  return (
    <Modal titulo="Entrega" onClose={onClose}>
      <div className="pf-modal-abas">
        <button className={`pf-modal-aba${aba==="detalhes"?" ativa":""}`} onClick={() => setAba("detalhes")}>Detalhes</button>
        <button className={`pf-modal-aba${aba==="historico"?" ativa":""}`} onClick={() => setAba("historico")}>Histórico</button>
      </div>

      <div className="pf-modal-body">
        {aba === "detalhes" && (
          <>
            {!etapa1Completa ? (
              <div className="pf-bloqueio">
                <div className="pf-bloqueio-icone">🔒</div>
                <div className="pf-bloqueio-titulo">Etapa 1 não concluída</div>
                <p className="pf-bloqueio-desc">Complete a etapa "Dados do Pedido" antes de avançar para a entrega.</p>
              </div>
            ) : (
              <>
                {pedido?.status !== "concluido" && (
                  <div className="pf-acoes">
                    <button className="pf-btn pf-btn-primary" onClick={handleMarcarPreAgendamento}>
                      📅 Marcar pré-agendamento
                    </button>
                  </div>
                )}

                {pedido?.status === "concluido" && (
                  <div className="pf-concluido-banner">✓ Pedido concluído</div>
                )}

                {preAgendamentos?.length > 0 && (
                  <div className="pf-secao">
                    <div className="pf-secao-titulo">Agendamentos</div>
                    {preAgendamentos.map(ag => (
                      <div key={ag.id} className="pf-ag-item">
                        <div className="pf-ag-header">
                          <span className="pf-ag-data">{fmtData(ag.data_inicio)}</span>
                          <span className="pf-ag-badge" style={{ background: STATUS_COR[ag.status]+"22", color: STATUS_COR[ag.status] }}>
                            {STATUS_LABEL[ag.status] || ag.status}
                          </span>
                        </div>
                        {ag.itens?.length > 0 && (
                          <ul className="pf-ag-itens">
                            {ag.itens.map(it => <li key={it.pedido_item_id}>{it.descricao}</li>)}
                          </ul>
                        )}
                        {ag.herdeiros?.map(h => (
                          <div key={h.id} className="pf-ag-herdeiro">
                            <span>↳ {h.tipo || "Herdeiro"}</span>
                            <span className="pf-ag-badge" style={{ background: STATUS_COR[h.status]+"22", color: STATUS_COR[h.status] }}>
                              {STATUS_LABEL[h.status] || h.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {preAgendamentos?.length === 0 && (
                  <p className="pf-sem-ag">Nenhum agendamento criado ainda. Use o botão acima para iniciar.</p>
                )}
              </>
            )}
          </>
        )}

        {aba === "historico" && (
          <AbaHistorico pedidoId={pedidoId} etapa="entrega" />
        )}
      </div>
    </Modal>
  );
}

/* ── COMPONENTE PRINCIPAL ── */
export default function PedidoFluxo() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dados,   setDados]   = useState(null);
  const [pedidoFull, setPedidoFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);
  const [modalAberto, setModalAberto] = useState(null); // 'dados' | 'entrega' | null

  const carregar = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/pedidos/${id}/fluxo`),
      api.get(`/pedidos/${id}`),
    ])
      .then(([fluxoRes, pedidoRes]) => {
        setDados(fluxoRes);
        setPedidoFull(pedidoRes.pedido || pedidoRes);
        setErro(null);
      })
      .catch(err => setErro(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="pf-estado">Carregando...</div>;
  if (erro)    return <div className="pf-estado pf-erro">Erro: {erro}</div>;
  if (!dados)  return null;

  const { pedido, estagio, pre_agendamentos } = dados;
  const etapa1Completa = pedidoFull?.verificacao_ok || false;
  const pedidoConcluido = pedidoFull?.status === "concluido";

  return (
    <div className="pf-page">
      {/* Header */}
      <div className="pf-header">
        <button className="pf-btn-voltar" onClick={() => navigate("/pedidos")}>← Voltar</button>
        <div className="pf-header-info">
          <span className="pf-titulo">Pedido {pedido.numero_origem
            ? `#${parseInt(pedido.numero_origem.replace(/^#+/,""),10)}`
            : `#${pedido.numero_sequencial}`}</span>
          <span className="pf-sub">{pedido.cliente_nome}</span>
          <span className="pf-sub">{pedido.consultor_nome}</span>
          <span className="pf-sub pf-valor">R$ {Number(pedido.total||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</span>
        </div>
      </div>

      {/* Cards do fluxo */}
      <div className="pf-fluxo-container">
        <div className="pf-fluxo-cards">
          <CardEtapa
            numero={1}
            titulo="DADOS DO PEDIDO"
            concluido={etapa1Completa}
            ativo={!etapa1Completa}
            onClick={() => setModalAberto("dados")}
          />
          <SetaConector ativo={etapa1Completa} />
          <CardEtapa
            numero={2}
            titulo="ENTREGA"
            concluido={pedidoConcluido}
            ativo={etapa1Completa && !pedidoConcluido}
            onClick={() => setModalAberto("entrega")}
          />
        </div>
      </div>

      {/* Modais */}
      {modalAberto === "dados" && pedidoFull && (
        <ModalDadosPedido
          pedido={pedidoFull}
          pedidoId={Number(id)}
          onClose={() => setModalAberto(null)}
          onAtualizado={() => { setModalAberto(null); carregar(); }}
          user={user}
        />
      )}

      {modalAberto === "entrega" && (
        <ModalEntrega
          pedido={pedidoFull}
          pedidoId={Number(id)}
          estagio={estagio}
          preAgendamentos={pre_agendamentos}
          onClose={() => setModalAberto(null)}
          onAtualizado={carregar}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Substituir PedidoFluxo.css pelo novo CSS**

```css
/* ── Page ── */
.pf-page {
  padding: 24px;
  min-height: 100vh;
  background: var(--color-bg, #0f172a);
}

.pf-estado {
  padding: 60px;
  text-align: center;
  color: var(--color-text-muted, #94a3b8);
  font-size: 15px;
}
.pf-erro { color: #f87171; }

/* ── Header ── */
.pf-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 40px;
  flex-wrap: wrap;
}

.pf-btn-voltar {
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}
.pf-btn-voltar:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }

.pf-header-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.pf-titulo { font-size: 20px; font-weight: 700; color: var(--color-text, #f1f5f9); }
.pf-sub    { font-size: 14px; color: var(--color-text-muted, #94a3b8); }
.pf-valor  { color: #34d399; font-weight: 600; }

/* ── Fluxo cards ── */
.pf-fluxo-container {
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  background: var(--color-surface, #1e293b);
  border-radius: 16px;
  border: 1px solid var(--color-border, #334155);
  overflow-x: auto;
}

.pf-fluxo-cards {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: max-content;
}

/* ── Card etapa ── */
.pf-card-etapa {
  width: 200px;
  padding: 28px 20px;
  border-radius: 16px;
  border: 3px solid;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  user-select: none;
}
.pf-card-etapa:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }

.pf-card-verde  { background: #0a1f17; border-color: #10b981; }
.pf-card-azul   { background: #0f1e35; border-color: #3b82f6; }
.pf-card-cinza  { background: #1a2234; border-color: #334155; }

@keyframes glow-blue {
  0%,100% { box-shadow: 0 0 8px #3b82f6; }
  50%      { box-shadow: 0 0 20px #3b82f680; }
}
.pf-pulsante { animation: glow-blue 2s infinite; }

.pf-card-icone {
  width: 52px; height: 52px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700;
  margin: 0 auto 12px;
}
.pf-card-verde .pf-card-icone  { background: #064e3b; color: #10b981; border: 2px solid #10b981; }
.pf-card-azul  .pf-card-icone  { background: #1e3a5f; color: #3b82f6; border: 2px solid #3b82f6; }
.pf-card-cinza .pf-card-icone  { background: #1e293b; color: #475569; border: 2px solid #475569; }

.pf-card-titulo {
  font-size: 13px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 1px;
  margin-bottom: 8px;
}
.pf-card-verde  .pf-card-titulo { color: #6ee7b7; }
.pf-card-azul   .pf-card-titulo { color: #93c5fd; }
.pf-card-cinza  .pf-card-titulo { color: #475569; }

.pf-card-sub { font-size: 11px; }
.pf-card-verde  .pf-card-sub { color: #34d399; }
.pf-card-azul   .pf-card-sub { color: #60a5fa; }
.pf-card-cinza  .pf-card-sub { color: #334155; }

/* ── Seta entre cards ── */
.pf-seta-conector {
  font-size: 28px;
  padding: 0 20px;
  color: #334155;
  transition: color 0.2s;
}
.pf-seta-conector.pf-seta-ativa { color: #10b981; }

/* ── Modal ── */
.pf-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}

.pf-modal {
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 16px;
  width: 100%; max-width: 900px;
  max-height: 92vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.pf-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border, #334155);
  flex-shrink: 0;
}

.pf-modal-titulo { font-size: 17px; font-weight: 700; color: var(--color-text, #f1f5f9); margin: 0; }

.pf-modal-fechar {
  background: none; border: none;
  color: var(--color-text-muted, #94a3b8);
  font-size: 24px; cursor: pointer; line-height: 1;
}
.pf-modal-fechar:hover { color: var(--color-text, #f1f5f9); }

/* Abas */
.pf-modal-abas {
  display: flex;
  border-bottom: 1px solid var(--color-border, #334155);
  flex-shrink: 0;
  background: var(--color-bg, #0f172a);
}
.pf-modal-aba {
  padding: 10px 20px;
  background: none; border: none;
  color: var(--color-text-muted, #64748b);
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.pf-modal-aba.ativa {
  color: var(--color-primary, #3b82f6);
  border-bottom-color: var(--color-primary, #3b82f6);
}

/* Corpo do modal */
.pf-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex; flex-direction: column; gap: 16px;
}

/* ── Seções ── */
.pf-secao { display: flex; flex-direction: column; gap: 8px; }
.pf-secao-titulo {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--color-text-muted, #64748b);
}
.pf-info-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.pf-info-grid > div { font-size: 13px; color: var(--color-text-muted, #94a3b8); }
.pf-info-label { font-weight: 600; color: var(--color-text, #f1f5f9); margin-right: 6px; }
.pf-valor-destaque { color: #34d399; font-weight: 700; }
.pf-texto { font-size: 13px; color: var(--color-text-muted, #94a3b8); margin: 0; }

/* Itens */
.pf-itens-wrap { overflow-x: auto; }
.pf-itens-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pf-itens-table th {
  background: var(--color-bg, #0f172a);
  color: var(--color-text-muted, #64748b);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px;
  padding: 8px 10px; text-align: left; white-space: nowrap;
}
.pf-itens-table td { padding: 8px 10px; color: var(--color-text-muted, #94a3b8); border-bottom: 1px solid var(--color-border, #1e293b); }
.pf-itens-table td strong { color: var(--color-text, #f1f5f9); }
.pf-cat-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; color: #fff; }
.pf-pendente  { font-size: 11px; color: #f59e0b; }
.pf-sem-vinculo { font-size: 11px; color: #64748b; }
.pf-vinculado   { font-size: 11px; color: #10b981; }

.pf-totais { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 13px; color: var(--color-text-muted,#94a3b8); margin-top: 8px; }
.pf-total-final { font-size: 15px; font-weight: 700; color: #34d399; }

/* Pagamentos */
.pf-pag-grupo { margin-bottom: 8px; }
.pf-pag-forma { font-size: 12px; font-weight: 700; color: var(--color-text,#f1f5f9); margin-bottom: 4px; }
.pf-pag-row { display: flex; gap: 16px; font-size: 12px; color: var(--color-text-muted,#94a3b8); padding: 3px 0; }

/* Ações */
.pf-acoes { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pf-btn {
  padding: 8px 14px; border-radius: 8px;
  background: var(--color-surface,#1e293b);
  border: 1px solid var(--color-border,#334155);
  color: var(--color-text-muted,#94a3b8);
  font-size: 12px; cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.pf-btn:hover { border-color: var(--color-primary,#3b82f6); color: var(--color-primary,#3b82f6); }
.pf-btn-primary { background: var(--color-primary,#3b82f6); border-color: var(--color-primary,#3b82f6); color: #fff; }
.pf-btn-primary:hover { opacity: 0.85; color: #fff; }
.pf-btn-danger  { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
.pf-btn-danger:hover { background: rgba(239,68,68,0.2); border-color: #ef4444; }

/* Pendências etapa 1 */
.pf-etapa1-pendencias {
  background: #1a1206; border: 1px solid #7c4a03;
  border-radius: 10px; padding: 12px 16px;
  font-size: 12px; color: #fcd34d;
}
.pf-etapa1-pendencias ul { margin: 6px 0 0; padding-left: 18px; }
.pf-etapa1-pendencias li { margin-bottom: 3px; }

/* Bloqueio etapa 2 */
.pf-bloqueio {
  text-align: center; padding: 40px 20px;
  color: var(--color-text-muted, #64748b);
}
.pf-bloqueio-icone  { font-size: 36px; margin-bottom: 12px; }
.pf-bloqueio-titulo { font-size: 16px; font-weight: 700; color: var(--color-text,#f1f5f9); margin-bottom: 8px; }
.pf-bloqueio-desc   { font-size: 13px; }

/* Concluído banner */
.pf-concluido-banner {
  background: #064e3b; border: 1px solid #10b981;
  border-radius: 10px; padding: 12px 20px;
  color: #6ee7b7; font-weight: 700; font-size: 14px;
  text-align: center; margin-bottom: 8px;
}

/* Agendamentos */
.pf-ag-item {
  background: var(--color-bg,#0f172a);
  border: 1px solid var(--color-border,#334155);
  border-radius: 10px; padding: 12px 14px;
  margin-bottom: 8px;
}
.pf-ag-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.pf-ag-data   { font-size: 13px; font-weight: 600; color: var(--color-text,#f1f5f9); }
.pf-ag-badge  { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.pf-ag-itens  { margin: 4px 0; padding-left: 16px; font-size: 12px; color: var(--color-text-muted,#94a3b8); }
.pf-ag-herdeiro { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--color-text-muted,#64748b); padding: 4px 0; }
.pf-sem-ag    { font-size: 13px; color: var(--color-text-muted,#64748b); text-align: center; padding: 20px 0; }

/* Formulário de edição */
.pf-form-edicao { display: flex; flex-direction: column; gap: 12px; }
.pf-form-row    { display: flex; gap: 12px; flex-wrap: wrap; }
.pf-form-field  { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px; }
.pf-form-field label { font-size: 11px; font-weight: 600; color: var(--color-text-muted,#64748b); text-transform: uppercase; }
.pf-form-field input,
.pf-form-field select,
.pf-form-field textarea {
  background: var(--color-bg,#0f172a);
  border: 1px solid var(--color-border,#334155);
  border-radius: 6px;
  color: var(--color-text,#f1f5f9);
  padding: 8px 10px; font-size: 13px;
}
.pf-form-field textarea { resize: vertical; min-height: 60px; }
.pf-form-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }

/* Itens editor */
.pf-itens-editor-wrap { display: flex; flex-direction: column; gap: 6px; }
.pf-item-edit-row {
  display: grid;
  grid-template-columns: 24px 1fr 160px 200px;
  gap: 8px; align-items: center;
  background: var(--color-bg,#0f172a);
  border-radius: 8px; padding: 8px 10px;
  font-size: 12px;
}
.pf-item-num  { color: var(--color-text-muted,#64748b); text-align: center; font-weight: 600; }
.pf-item-desc { color: var(--color-text,#f1f5f9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pf-item-edit-row select {
  background: var(--color-surface,#1e293b);
  border: 1px solid var(--color-border,#334155);
  border-radius: 6px; color: var(--color-text,#f1f5f9);
  padding: 6px 8px; font-size: 11px;
}

/* Histórico */
.pf-historico { display: flex; flex-direction: column; gap: 0; }
.pf-hist-loading, .pf-hist-vazio { padding: 32px; text-align: center; color: var(--color-text-muted,#64748b); font-size: 13px; }
.pf-hist-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border,#1e293b); }
.pf-hist-bolinha { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.pf-hist-corpo   { flex: 1; }
.pf-hist-desc    { font-size: 13px; color: var(--color-text-muted,#94a3b8); }
.pf-hist-desc strong { color: var(--color-text,#f1f5f9); }
.pf-hist-data    { font-size: 11px; color: var(--color-text-muted,#475569); margin-top: 3px; }

/* Toast */
.pf-toast {
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  padding: 12px 18px; border-radius: 10px;
  background: var(--color-surface,#1e293b);
  border: 1px solid var(--color-border,#334155);
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  font-size: 13px; font-weight: 500; color: var(--color-text,#f1f5f9);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx frontend-web/src/pages/pedidos/PedidoFluxo.css
git commit -m "feat(frontend): PedidoFluxo — redesign com 2 etapas, modais com abas Detalhes/Histórico"
```

---

## Self-Review

### Spec coverage checklist

| Requisito | Task |
|-----------|------|
| Migration: `pedido_auditoria` + `pedido_itens.sem_vinculo` | Task 1 |
| `auditoriaService.registrarAuditoria` e `listarAuditoria` | Task 2 |
| `_salvarItens` grava `sem_vinculo` | Task 3 |
| `_verificarEtapa1` helper | Task 3 |
| `atualizar` aceita userId + captura diff + grava audit + seta `verificacao_ok` | Task 3 |
| `importar` grava audit de importação | Task 3 |
| `GET /pedidos/:id/auditoria?etapa=` | Task 4 |
| Audit no upload de PDF | Task 4 |
| Audit ao criar pré-agendamento genitor | Task 5 |
| Audit ao concluir agendamento | Task 5 |
| Arquivo `DashboardPedidos` → `Pedidos`, rota `/pedidos` | Task 6 |
| Título "Pedidos de Venda" + botão Importar | Task 6 |
| Filtros: Todos · Pendente · Em andamento · Atrasado · Concluído | Task 6 |
| App.jsx — remove `/dashboard-pedidos`, `/pedidos` aponta para novo Pedidos | Task 7 |
| Sidebar — remove link Dashboard | Task 7 |
| 2 cards horizontais com seta, clicáveis | Task 8 |
| Card 1 verde quando etapa 1 completa | Task 8 |
| Card 2 abre modal com tela de bloqueio se etapa 1 não completa | Task 8 |
| Modal Dados do Pedido — aba Detalhes com toda info + modo edição inline | Task 8 |
| Modal Dados — campo Vínculo com opção "Nenhum" | Task 8 |
| Modal Dados — pendências visíveis quando etapa 1 incompleta | Task 8 |
| Modal Entrega — botão pré-agendamento + lista de agendamentos | Task 8 |
| Aba Histórico em ambos modais — consome `/auditoria?etapa=` | Task 8 |

### Potential Issues

1. **`importar` em `pedidoService.js`** — verificar se a auditoria cabe dentro da transação ou deve vir depois do `client.release()`. Preferir dentro da transação com o mesmo `client` para atomicidade.
2. **`atualizar` em `pedidosRoutes.js`** — confirmar que a rota PUT/PATCH passa `req.body` como segundo argumento e `req.user.id` como terceiro/quarto antes de ajustar.
3. **`atualizarStatus` em `agendamentoService.js`** — verificar se `userId` já é parâmetro da função; se não for, ele pode não estar disponível para a auditoria.
4. **`api.delete`** — confirmar que o wrapper `api` do frontend suporta DELETE; se não, usar `api.request` ou `fetch` direto.
5. **Import `ImportarPedidoModal`** em Pedidos.jsx — o path `"./ImportarPedidoModal"` está correto pois ambos ficam em `src/pages/pedidos/`.
