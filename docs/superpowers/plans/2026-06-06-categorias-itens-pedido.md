# Categorias em Itens de Pedido — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar categoria (FK para catálogo) a cada item de pedido, com auto-detecção na importação e dropdown de edição no PedidoModal. A importação passa a ser somente correção de dados brutos.

**Architecture:** Duas migrations SQL criam 4 novas categorias padrão e o campo `categoria_id` em `pedido_itens`. O backend detecta a categoria por keyword na extração do PDF e persiste o campo. O ImportarPedidoModal remove seleção de modelo e vinculação de itens; o PedidoModal (edição) ganha dropdown Categoria e campo Modelo.

**Tech Stack:** Node.js/Express (backend), PostgreSQL, React (frontend), API REST via `api.js`

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/src/database/migrations/categorias_padrao_v2.sql` | Criar | 4 novas categorias padrão por empresa |
| `backend/src/database/migrations/pedido_itens_categoria.sql` | Criar | Coluna `categoria_id` em `pedido_itens` |
| `backend/src/routes/pedidosRoutes.js` | Modificar | Detecção de categoria na extração + resolver id |
| `backend/src/services/pedidoService.js` | Modificar | `_salvarItens` aceita `categoria_id`; `montarPedido` traz nome/cor |
| `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx` | Modificar | Remove modelo/vinculo; adiciona dropdown categoria |
| `frontend-web/src/pages/pedidos/Pedidos.jsx` | Modificar | Editor: campos Categoria+Modelo; Visualização: coluna badge |
| `frontend-web/src/pages/pedidos/Pedidos.css` | Modificar | Grids atualizados; estilo `.pd-cat-badge` |

---

## Task 1: Migrations SQL

**Files:**
- Create: `backend/src/database/migrations/categorias_padrao_v2.sql`
- Create: `backend/src/database/migrations/pedido_itens_categoria.sql`

- [ ] **Step 1: Criar migration de novas categorias padrão**

```sql
-- categorias_padrao_v2.sql
-- Insere as 4 novas categorias para cada empresa que ainda não as tem.
INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Forros', '#7B68EE', 9
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'forros'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Motorização', '#FF6B35', 10
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'motorização'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Controles', '#20B2AA', 11
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'controles'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Almofadas', '#FF69B4', 12
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'almofadas'
);
```

- [ ] **Step 2: Criar migration do campo `categoria_id`**

```sql
-- pedido_itens_categoria.sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Executar as migrations**

```bash
# Ajuste a connection string conforme seu ambiente
psql $DATABASE_URL -f backend/src/database/migrations/categorias_padrao_v2.sql
psql $DATABASE_URL -f backend/src/database/migrations/pedido_itens_categoria.sql
```

Resultado esperado: sem erros. A tabela `pedido_itens` deve ter a coluna `categoria_id`:
```bash
psql $DATABASE_URL -c "\d pedido_itens" | grep categoria_id
# Saída esperada: categoria_id | integer | ...
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/categorias_padrao_v2.sql \
        backend/src/database/migrations/pedido_itens_categoria.sql
git commit -m "feat(db): categoria_id em pedido_itens + 4 novas categorias padrão"
```

---

## Task 2: Backend — Detecção de Categoria na Extração

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`

- [ ] **Step 1: Adicionar constante de keywords e função de detecção**

Logo após as funções auxiliares existentes no topo do arquivo (após `function limparMoeda` por exemplo), inserir:

```javascript
// ─── Detecção de categoria por keyword na descrição do item ──────────────────
const CATEGORIA_KEYWORDS_PEDIDO = [
  { keywords: ["cortina", "voil", "voile"],                                        nome: "Cortinas"         },
  { keywords: ["forro"],                                                            nome: "Forros"           },
  { keywords: ["persiana", "rolo", "roller", "roman", "double vision", "vision"],  nome: "Persianas"        },
  { keywords: ["trilho", "varão", "varao", "suporte"],                             nome: "Trilhos e Varões" },
  { keywords: ["tecido", "retalho"],                                                nome: "Tecidos"          },
  { keywords: ["tapete"],                                                           nome: "Tapetes"          },
  { keywords: ["almofada"],                                                         nome: "Almofadas"        },
  { keywords: ["motor", "motoriza", "motorizado"],                                  nome: "Motorização"      },
  { keywords: ["controle", "comando", "acionador"],                                 nome: "Controles"        },
];

function detectarNomeCategoriaPedido(descricao) {
  if (!descricao) return null;
  const lower = descricao.toLowerCase();
  for (const { keywords, nome } of CATEGORIA_KEYWORDS_PEDIDO) {
    if (keywords.some((k) => lower.includes(k))) return nome;
  }
  return null;
}
```

- [ ] **Step 2: Atualizar a rota `POST /importar-texto` para resolver `categoria_id` por item**

Localizar a rota em `pedidosRoutes.js` (aproximadamente linha 487). Substituir o bloco completo da rota pelo seguinte:

```javascript
router.post("/importar-texto", authMiddleware, async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ message: "Texto vazio." });

    const campos = parsearCamposSimples(texto);
    const itens  = parsearItensTabDelimitada(texto);

    let consultor_id = null;
    if (campos.consultor_nome) {
      const r = await db.query(
        `SELECT id FROM usuarios WHERE empresa_id=$1 AND nome_completo ILIKE $2 ORDER BY nome_completo LIMIT 1`,
        [req.user.empresa_id, `%${campos.consultor_nome}%`]
      );
      if (r.rows.length > 0) consultor_id = r.rows[0].id;
    }

    let arquiteto_id = null;
    if (campos.arquiteto_nome) {
      try {
        const r = await db.query(
          `SELECT id FROM arquitetos WHERE empresa_id=$1 AND nome ILIKE $2 AND deleted_at IS NULL ORDER BY nome LIMIT 1`,
          [req.user.empresa_id, `%${campos.arquiteto_nome}%`]
        );
        if (r.rows.length > 0) arquiteto_id = r.rows[0].id;
      } catch (_) {}
    }

    let cliente_id = null;
    try { cliente_id = await buscarClienteId(req.user.empresa_id, campos); } catch (_) {}

    // Resolve categoria_id por item a partir das keywords da descrição
    const catRes = await db.query(
      `SELECT id, LOWER(nome) AS nome_lower FROM categorias WHERE empresa_id=$1`,
      [req.user.empresa_id]
    );
    const catMap = {};
    for (const c of catRes.rows) catMap[c.nome_lower] = c.id;

    const itensComCategoria = itens.map((it) => {
      const nomeCategoria = detectarNomeCategoriaPedido(it.descricao);
      const categoria_id = nomeCategoria ? (catMap[nomeCategoria.toLowerCase()] ?? null) : null;
      return { ...it, categoria_id };
    });

    return res.json({
      extraido: { ...campos, itens: itensComCategoria, consultor_id, arquiteto_id, cliente_id },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao processar texto.", erro: err.message });
  }
});
```

- [ ] **Step 3: Verificar manualmente via curl (ou Postman)**

Colar um trecho de texto de pedido com itens de tipos variados. A resposta deve incluir `categoria_id` preenchido em cada item cujo `descricao` bata com alguma keyword.

```bash
# Exemplo de verificação (ajuste o token e o host):
curl -X POST http://localhost:3000/pedidos/importar-texto \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"texto":"#\tAmbiente\tReferencia\tCor\tProduto\tMedidas\tQtde\tUn\tPreco Unit.\tTotal\n1\tSala\t\t\tCORTINA LINHO\t2,00x3,00\t1\tUN\t500,00\t500,00\n2\tSala\t\t\tTRILHO SIMPLES\t\t1\tUN\t200,00\t200,00"}' \
  | jq '.extraido.itens[] | {descricao, categoria_id}'
# Esperado: cortina → categoria_id de "Cortinas"; trilho → categoria_id de "Trilhos e Varões"
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(import): auto-detectar categoria_id por keyword na extração de itens"
```

---

## Task 3: Backend — Persistir e Retornar Categoria

**Files:**
- Modify: `backend/src/services/pedidoService.js`

- [ ] **Step 1: Atualizar `_salvarItens` — UPDATE**

Localizar o bloco UPDATE (aproximadamente linha 150). Substituir a query e params:

```javascript
await client.query(
  `UPDATE pedido_itens
   SET ambiente=$1, referencia=$2, cor=$3, descricao=$4, medidas=$5,
       quantidade=$6, unidade=$7, preco_unitario=$8, valor=$9, ordem=$10,
       modelo=$11, especificacoes=$12, largura=$13, altura=$14,
       categoria_id=$15
   WHERE id=$16 AND pedido_id=$17`,
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
    it.categoria_id        || null,
    itemId,
    pedidoId,
  ]
);
```

- [ ] **Step 2: Atualizar `_salvarItens` — INSERT**

Localizar o bloco INSERT (aproximadamente linha 179). Substituir pela query com `categoria_id`:

```javascript
const ins = await client.query(
  `INSERT INTO pedido_itens
     (pedido_id, ambiente, referencia, cor, descricao, medidas,
      quantidade, unidade, preco_unitario, valor, ordem,
      modelo, especificacoes, largura, altura, categoria_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
    it.categoria_id        || null,
  ]
);
```

- [ ] **Step 3: Atualizar `montarPedido` — JOIN com categorias**

Localizar a query de itens dentro de `montarPedido` (aproximadamente linha 37). Substituir:

```javascript
const itensRes = await db.query(
  `SELECT pi.*,
          os.id     AS os_id,
          os.status AS os_status,
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

- [ ] **Step 4: Build para verificar erros de sintaxe**

```bash
cd frontend-web && npx vite build 2>&1 | tail -5
# Esperado: ✓ built in X.XXs (sem erros de JS no backend — verificar node sem crash)
```

Verificar que o backend inicia sem erro:
```bash
cd backend && node src/index.js &
sleep 2 && curl -s http://localhost:3000/health | head -1
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pedidoService.js
git commit -m "feat(pedidos): persistir e retornar categoria_id em itens de pedido"
```

---

## Task 4: Frontend — Simplificar ImportarPedidoModal

**Files:**
- Modify: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

- [ ] **Step 1: Atualizar imports e estado inicial**

Substituir as linhas de import no topo do arquivo:

```javascript
import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
```

(Remover: `import { detectarTipo } from "./importKeywordConfig"` e `import ModeloSelectorPanel from "./ModeloSelectorPanel"`)

Atualizar `itemVazio()`:

```javascript
function itemVazio() {
  return {
    ambiente: "", referencia: "", cor: "", descricao: "",
    largura: "", altura: "", quantidade: 1, unidade: "UN",
    preco_unitario: "", valor: "", categoria_id: null,
  };
}
```

- [ ] **Step 2: Limpar estado do componente**

Dentro de `export default function ImportarPedidoModal(...)`, substituir os estados no início:

```javascript
const pdfRef = useRef(null);
const [etapa,       setEtapa]       = useState("upload");
const [carregando,  setCarregando]  = useState(false);
const [erro,        setErro]        = useState("");
const [pdfOriginal, setPdfOriginal] = useState(null);
const [textoColar,  setTextoColar]  = useState("");
const [form,        setForm]        = useState(null);
const [itens,       setItens]       = useState([]);
const [pagamentos,  setPagamentos]  = useState([]);
const [fonteImport, setFonteImport] = useState("");
const [categorias,  setCategorias]  = useState([]);

useEffect(() => {
  api.get("/categorias").then((r) => setCategorias(r.categorias || [])).catch(() => {});
}, []);
```

(Remover: `selecoes`, `setSelecoes`, `panelAberto`, `setPanelAberto`)

- [ ] **Step 3: Simplificar `removeItem`**

Substituir a função `removeItem`:

```javascript
function removeItem(i) {
  setItens((p) => p.filter((_, idx) => idx !== i));
}
```

- [ ] **Step 4: Simplificar `aplicarExtraido`**

Na função `aplicarExtraido`, remover as linhas:
```javascript
setSelecoes({});
setPanelAberto(null);
```
(Manter todo o resto — `setForm`, `setItens`, `setPagamentos`, `setEtapa`, `preencherViaCep`)

- [ ] **Step 5: Simplificar `confirmar`**

Substituir a função `confirmar` completa:

```javascript
function confirmar() {
  const itensFinais = itens
    .filter((it) => it.descricao?.trim())
    .map((it) => {
      const { largura, altura, ...restIt } = it;
      const medidas = [largura, altura].filter(Boolean).join("x") || null;
      return {
        ...restIt,
        largura:    largura || null,
        altura:     altura  || null,
        medidas,
        categoria_id: it.categoria_id || null,
      };
    });

  const dados = {
    ...form,
    cliente_id:   form.cliente_id   ? Number(form.cliente_id)   : null,
    consultor_id: form.consultor_id ? Number(form.consultor_id) : null,
    itens:        itensFinais,
    pagamentos:   pagamentos.filter((pg) => pg.forma?.trim()),
  };
  delete dados._endereco_completo;
  onSalvar(dados, pdfOriginal);
}
```

- [ ] **Step 6: Substituir o bloco de renderização dos itens**

Localizar o bloco `{/* ITENS EXTRAÍDOS */}` (aproximadamente linha 477). Substituir o conteúdo interno (from `{(() => {` até o fechamento `})()}`) pelo seguinte:

```jsx
<div className="pd-itens-editor">
  <div className="pd-itens-editor-header">
    <span>#</span>
    <span>Ambiente</span>
    <span>Referência</span>
    <span>Cor</span>
    <span>Produto</span>
    <span>Categoria</span>
    <span>Largura</span>
    <span>Altura</span>
    <span>Qtde</span>
    <span>Un</span>
    <span>Preço Unit.</span>
    <span>Total</span>
    <span></span>
  </div>

  {itens.map((it, i) => (
    <div key={i} className="pd-itens-editor-row">
      <span className="pd-item-num">{i + 1}</span>
      <input placeholder="Sala"    value={it.ambiente   || ""} onChange={(e) => setItem(i, "ambiente",   e.target.value)} />
      <input placeholder="ADO500"  value={it.referencia || ""} onChange={(e) => setItem(i, "referencia", e.target.value)} />
      <input placeholder="Cor"     value={it.cor        || ""} onChange={(e) => setItem(i, "cor",        e.target.value)} />
      <input placeholder="Produto" value={it.descricao  || ""} onChange={(e) => setItem(i, "descricao",  e.target.value)} className="pd-item-desc" />
      <select
        value={it.categoria_id ?? ""}
        onChange={(e) => setItem(i, "categoria_id", e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— Categoria —</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </select>
      <input placeholder="2,00" value={it.largura || ""} onChange={(e) => setItem(i, "largura", e.target.value)} />
      <input placeholder="3,00" value={it.altura  || ""} onChange={(e) => setItem(i, "altura",  e.target.value)} />
      <input type="number" min="0" step="0.01" value={it.quantidade || 1} onChange={(e) => setItem(i, "quantidade",     e.target.value)} />
      <select value={it.unidade || "UN"} onChange={(e) => setItem(i, "unidade", e.target.value)}>
        {UNIDADES.map((u) => <option key={u}>{u}</option>)}
      </select>
      <input type="number" min="0" step="0.01" value={it.preco_unitario || ""} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
      <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
      <button className="pd-item-del" onClick={() => removeItem(i)}>×</button>
    </div>
  ))}
</div>
```

- [ ] **Step 7: Atualizar grid CSS do ImportarPedidoModal**

Em `Pedidos.css`, localizar o bloco `/* ── EDITOR DE ITENS (modal) ── */` (aproximadamente linha 337).

Substituir:
```css
.pd-itens-editor-header,
.pd-itens-editor-row {
  display: grid;
  /* # | Ambiente | Referência | Cor | Produto | Modelo | Largura | Altura | Qtde | Un | Preço Unit. | Total | × */
  grid-template-columns: 28px 110px 100px 90px 1fr 130px 75px 75px 58px 68px 100px 90px 28px;
  gap: 4px;
  align-items: center;
  padding: 6px 10px;
}
/* Com coluna "Vinculado a" (quando há trilho) */
.pd-itens-com-trilho .pd-itens-editor-header,
.pd-itens-com-trilho .pd-itens-editor-row {
  /* # | Ambiente | Referência | Cor | Produto | Modelo | Vinculado a | Largura | Altura | Qtde | Un | Preço Unit. | Total | × */
  grid-template-columns: 28px 110px 100px 90px 1fr 130px 150px 75px 75px 58px 68px 100px 90px 28px;
}
```

Por:
```css
.pd-itens-editor-header,
.pd-itens-editor-row {
  display: grid;
  /* # | Ambiente | Referência | Cor | Produto | Categoria | Largura | Altura | Qtde | Un | Preço Unit. | Total | × */
  grid-template-columns: 28px 110px 100px 90px 1fr 130px 75px 75px 58px 68px 100px 90px 28px;
  gap: 4px;
  align-items: center;
  padding: 6px 10px;
}
```

- [ ] **Step 8: Build para verificar**

```bash
cd frontend-web && npx vite build 2>&1 | tail -5
# Esperado: ✓ built in X.XXs
```

- [ ] **Step 9: Commit**

```bash
git add frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx \
        frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(import): simplificar ImportarPedidoModal — só dados brutos + categoria auto"
```

---

## Task 5: Frontend — Campos Categoria e Modelo no Editor de Pedido

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

- [ ] **Step 1: Buscar categorias no useEffect do PedidoModal**

Dentro de `PedidoModal` (função que contém `const [clientes, setClientes]`), localizar o useEffect de fetch (aproximadamente linha 675). Adicionar categorias:

```javascript
const [categorias,   setCategorias]   = useState([]);

useEffect(() => {
  api.get("/clientes").then((r) => setClientes(r.clientes || [])).catch(() => {});
  api.get("/auth/admin/usuarios").then((r) => setConsultores((r.usuarios || []).filter((u) => u.status === "aprovado"))).catch(() => {});
  api.get("/arquitetos").then((r) => setArquitetos(r.arquitetos || [])).catch(() => {});
  api.get("/categorias").then((r) => setCategorias(r.categorias || [])).catch(() => {});
}, []);
```

- [ ] **Step 2: Atualizar `itemVazio` no PedidoModal**

A função `itemVazio` dentro do escopo do PedidoModal (aproximadamente linha 45):

```javascript
function itemVazio() {
  return {
    ambiente: "", referencia: "", cor: "", descricao: "", medidas: "",
    quantidade: 1, unidade: "UN", preco_unitario: "", valor: "",
    item_vinculado_idx: null, categoria_id: null, modelo: "",
  };
}
```

- [ ] **Step 3: Atualizar cabeçalho do editor de itens (aba Itens)**

Localizar o `<div className="pd-itens-editor-header">` dentro de `{abaAtiva === "itens"}` (aproximadamente linha 934). Substituir os `<span>` headers:

```jsx
<div className="pd-itens-editor-header">
  <span>#</span>
  <span>Ambiente</span>
  <span>Referência</span>
  <span>Cor</span>
  <span>Produto</span>
  <span>Categoria</span>
  <span>Modelo</span>
  <span>Medidas</span>
  <span>Qtde</span>
  <span>Un</span>
  <span>Preço Unit.</span>
  <span>Total</span>
  <span>Vinculado a</span>
  <span></span>
</div>
```

- [ ] **Step 4: Adicionar campos Categoria e Modelo nas linhas do editor**

Localizar o `.map((it, i) =>` das linhas de item (após os headers, aproximadamente linha 948). Dentro de cada linha, após o `<input placeholder="Produto" ...>` e antes do `<input placeholder="2,00x3,00" ...>` (campo Medidas), inserir:

```jsx
<select
  value={it.categoria_id ?? ""}
  onChange={(e) => setItem(i, "categoria_id", e.target.value ? Number(e.target.value) : null)}
>
  <option value="">— Categoria —</option>
  {categorias.map((c) => (
    <option key={c.id} value={c.id}>{c.nome}</option>
  ))}
</select>
<input
  placeholder="Ex: Wave, Rolo/Rollo..."
  value={it.modelo || ""}
  onChange={(e) => setItem(i, "modelo", e.target.value)}
/>
```

- [ ] **Step 5: Atualizar grid CSS do PedidoModal**

Em `Pedidos.css`, localizar (aproximadamente linha 531):
```css
/* ── EDITOR DE ITENS no PedidoModal (medidas único + Vinculado a) ── */
.pd-modal-itens.pd-itens-editor .pd-itens-editor-header,
.pd-modal-itens.pd-itens-editor .pd-itens-editor-row {
  /* # | Ambiente | Ref | Cor | Produto | Medidas | Qtde | Un | Preço Unit. | Total | Vinculado a | × */
  grid-template-columns: 28px 100px 90px 80px 1fr 100px 52px 60px 90px 80px 140px 28px;
}
```

Substituir por:
```css
/* ── EDITOR DE ITENS no PedidoModal (com Categoria + Modelo) ── */
.pd-modal-itens.pd-itens-editor .pd-itens-editor-header,
.pd-modal-itens.pd-itens-editor .pd-itens-editor-row {
  /* # | Ambiente | Ref | Cor | Produto | Categoria | Modelo | Medidas | Qtde | Un | Preço Unit. | Total | Vinculado a | × */
  grid-template-columns: 28px 100px 90px 80px 1fr 120px 110px 100px 52px 60px 90px 80px 140px 28px;
}
```

- [ ] **Step 6: Build para verificar**

```bash
cd frontend-web && npx vite build 2>&1 | tail -5
# Esperado: ✓ built in X.XXs
```

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx \
        frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(pedidos): campos Categoria e Modelo no editor de itens do PedidoModal"
```

---

## Task 6: Frontend — Exibir Categoria na Visualização do Pedido

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

- [ ] **Step 1: Adicionar coluna Categoria no cabeçalho da tabela de visualização**

Localizar o `<thead>` da tabela de itens na visualização do pedido (dentro do `pedido.itens?.length > 0 && (()` block, aproximadamente linha 494). Após `<th>Produto</th>`, inserir:

```jsx
<th>Categoria</th>
```

- [ ] **Step 2: Adicionar célula de badge na linha de cada item**

No `<tbody>`, após `<td>{it.descricao}</td>`, inserir:

```jsx
<td>
  {it.categoria_nome
    ? (
      <span
        className="pd-cat-badge"
        style={{ background: it.categoria_cor || "#C9A96E" }}
      >
        {it.categoria_nome}
      </span>
    )
    : <span style={{ color: "var(--color-text-muted)" }}>—</span>
  }
</td>
```

- [ ] **Step 3: Adicionar estilo do badge em `Pedidos.css`**

Após o bloco de `.pd-item-vinculo-ref` (aproximadamente linha 525), inserir:

```css
.pd-cat-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
```

- [ ] **Step 4: Build final**

```bash
cd frontend-web && npx vite build 2>&1 | tail -5
# Esperado: ✓ built in X.XXs — sem warnings ou erros
```

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx \
        frontend-web/src/pages/pedidos/Pedidos.css
git commit -m "feat(pedidos): badge de categoria na visualização de itens do pedido"
```

---

## Checklist Final

- [ ] `pedido_itens.categoria_id` existe no banco (`\d pedido_itens | grep categoria_id`)
- [ ] 4 novas categorias visíveis no catálogo (Forros, Motorização, Controles, Almofadas)
- [ ] Importação de texto retorna `categoria_id` preenchido por keyword
- [ ] Item importado exibe categoria pré-selecionada no dropdown do ImportarPedidoModal
- [ ] Usuário pode trocar categoria antes de salvar a importação
- [ ] ImportarPedidoModal não tem mais colunas "Modelo" nem "Vinculado a"
- [ ] PedidoModal (edição) tem campos Categoria e Modelo em cada linha de item
- [ ] Visualização do pedido exibe badge colorido de categoria
- [ ] `modelo` editado no PedidoModal é salvo no banco
- [ ] Itens sem categoria exibem "—" (sem erro)
