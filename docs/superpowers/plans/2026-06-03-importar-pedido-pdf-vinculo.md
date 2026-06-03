# Remover Import PDF + Vincular PDF Original ao Pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a opção de importar pedido via PDF (extração de dados), manter somente importação por texto, e adicionar aba "Vincular PDF" no modal de importação + botão "PDF Original" nos detalhes do pedido para armazenar/visualizar o PDF original do pedido.

**Architecture:** Tabela `pedido_anexos` armazena o PDF como BYTEA no PostgreSQL (1 PDF por pedido, upsert). Três rotas novas no backend (upload, download, delete) com validações em camadas. No frontend, `ImportarPedidoModal` ganha abas e `DetalhePedido` ganha botão "PDF Original".

**Tech Stack:** Node.js/Express, multer (memoryStorage), PostgreSQL (pg), React, fetch API

---

## Mapa de Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `backend/src/database/migrations/pedido_anexos.sql` |
| Criar | `frontend-web/src/pages/pedidos/VincularPdfTab.jsx` |
| Modificar | `backend/src/routes/pedidosRoutes.js` |
| Modificar | `backend/src/services/pedidoService.js` |
| Modificar | `backend/package.json` |
| Modificar | `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx` |
| Modificar | `frontend-web/src/pages/pedidos/Pedidos.jsx` |

---

## Task 1: Migration — Tabela `pedido_anexos`

**Files:**
- Create: `backend/src/database/migrations/pedido_anexos.sql`

- [ ] **Step 1: Criar arquivo de migration**

Criar o arquivo `backend/src/database/migrations/pedido_anexos.sql`:

```sql
CREATE TABLE IF NOT EXISTS pedido_anexos (
  id             SERIAL PRIMARY KEY,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL,
  nome_arquivo   VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(50)  NOT NULL DEFAULT 'application/pdf',
  tamanho_bytes  INTEGER      NOT NULL,
  conteudo       BYTEA        NOT NULL,
  criado_por     INTEGER REFERENCES usuarios(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_pedido_anexos_empresa_id ON pedido_anexos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedido_anexos_created_at ON pedido_anexos (created_at);
```

- [ ] **Step 2: Rodar a migration no banco**

```bash
psql $DATABASE_URL -f backend/src/database/migrations/pedido_anexos.sql
```

Verificar:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'pedido_anexos';
```
Esperado: 1 linha retornada.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/pedido_anexos.sql
git commit -m "feat(db): migration tabela pedido_anexos para armazenar PDF original"
```

---

## Task 2: Adicionar `tem_anexo_pdf` ao `montarPedido`

**Files:**
- Modify: `backend/src/services/pedidoService.js`

- [ ] **Step 1: Atualizar o SELECT em `montarPedido` (linha ~19)**

Localizar o SELECT dentro de `async function montarPedido`. Substituir:

```javascript
`SELECT p.*,
        c.nome          AS cliente_nome,
        c.telefone      AS cliente_telefone,
        u.nome_completo AS consultor_nome,
        a.nome          AS arquiteto_nome
 FROM pedidos p
 LEFT JOIN clientes c  ON c.id = p.cliente_id   AND c.deleted_at IS NULL
 LEFT JOIN usuarios u  ON u.id = p.consultor_id
 LEFT JOIN arquitetos a ON a.id = p.arquiteto_id AND a.deleted_at IS NULL
 WHERE p.id=$1 AND p.empresa_id=$2 AND p.deleted_at IS NULL
 LIMIT 1`
```

Por:

```javascript
`SELECT p.*,
        c.nome          AS cliente_nome,
        c.telefone      AS cliente_telefone,
        u.nome_completo AS consultor_nome,
        a.nome          AS arquiteto_nome,
        EXISTS(SELECT 1 FROM pedido_anexos pa WHERE pa.pedido_id = p.id) AS tem_anexo_pdf
 FROM pedidos p
 LEFT JOIN clientes c  ON c.id = p.cliente_id   AND c.deleted_at IS NULL
 LEFT JOIN usuarios u  ON u.id = p.consultor_id
 LEFT JOIN arquitetos a ON a.id = p.arquiteto_id AND a.deleted_at IS NULL
 WHERE p.id=$1 AND p.empresa_id=$2 AND p.deleted_at IS NULL
 LIMIT 1`
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/pedidoService.js
git commit -m "feat(pedidos): inclui tem_anexo_pdf no retorno de buscar pedido"
```

---

## Task 3: Remover rota `importar-pdf` e funções de parse PDF do backend

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`

- [ ] **Step 1: Remover os dois imports de PDF no topo do arquivo**

Remover as linhas:
```javascript
const pdfParse = require("pdf-parse");
```
e
```javascript
const { PdfReader } = require("pdfreader");
```

- [ ] **Step 2: Substituir a instância `upload` por `uploadPdf` com limite de 5 MB**

Localizar:
```javascript
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
```

Substituir por:
```javascript
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf") return cb(null, true);
    const e = new Error("Apenas arquivos PDF são aceitos.");
    e.status = 400;
    cb(e, false);
  },
});
```

- [ ] **Step 3: Remover função `lerFragmentos` (linha 36)**

Localizar e remover o bloco completo (inclui o comentário de cabeçalho):
```javascript
// ─── Extração posicional da tabela de itens via pdfreader ────────────────────

function lerFragmentos(buffer) {
  return new Promise((resolve, reject) => {
    ...
  });
}
```

- [ ] **Step 4: Remover função `extrairItensTabela` (linha 63)**

Localizar e remover o bloco completo de `async function extrairItensTabela(buffer, _dbg = {})` até seu `}` de fechamento (por volta da linha 286).

- [ ] **Step 5: Remover função `extrairItensTabelaRawText` (linha 288)**

Localizar e remover o bloco completo de `function extrairItensTabelaRawText(texto)` até seu `}` de fechamento (por volta da linha 369).

- [ ] **Step 6: Remover a rota `POST /importar-pdf` (linha ~807)**

Localizar e remover o bloco completo:
```javascript
// Extrai dados do PDF sem salvar — retorna JSON para o usuário revisar
router.post("/importar-pdf", authMiddleware, upload.single("arquivo"), async (req, res) => {
  ...
});
```

- [ ] **Step 7: Verificar que o módulo carrega sem erros**

```bash
cd backend && node -e "require('./src/routes/pedidosRoutes')" && echo "OK"
```
Esperado: `OK`

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(pedidos): remove importacao via PDF (rota importar-pdf, parsers, imports)"
```

---

## Task 4: Adicionar rotas de anexo PDF no backend (POST / GET / DELETE)

**Files:**
- Modify: `backend/src/routes/pedidosRoutes.js`

Inserir os três blocos a seguir ANTES de `module.exports = router;`, no final do arquivo.

- [ ] **Step 1: Adicionar rota `POST /:id/anexo-pdf`**

```javascript
// Upload do PDF original do pedido (armazenamento, sem parsing)
router.post("/:id/anexo-pdf", authMiddleware, uploadPdf.single("arquivo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }

    // Magic bytes: %PDF (0x25 0x50 0x44 0x46)
    const buf = req.file.buffer;
    if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
      return res.status(400).json({ message: "Arquivo inválido: não é um PDF real." });
    }

    const pedidoId = parseInt(req.params.id, 10);
    if (isNaN(pedidoId)) return res.status(400).json({ message: "ID de pedido inválido." });

    // Valida pertencimento multi-tenant
    const pedidoRes = await db.query(
      `SELECT id FROM pedidos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [pedidoId, req.user.empresa_id]
    );
    if (pedidoRes.rows.length === 0) {
      return res.status(403).json({ message: "Pedido não encontrado ou sem permissão." });
    }

    // Rate limit: máx 20 uploads por hora por empresa
    const rateRes = await db.query(
      `SELECT COUNT(*) FROM pedido_anexos WHERE empresa_id=$1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [req.user.empresa_id]
    );
    if (parseInt(rateRes.rows[0].count, 10) >= 20) {
      return res.status(429).json({ message: "Limite de uploads atingido. Tente novamente em 1 hora." });
    }

    // Upsert — substitui se já existir PDF para este pedido
    const result = await db.query(
      `INSERT INTO pedido_anexos (pedido_id, empresa_id, nome_arquivo, mime_type, tamanho_bytes, conteudo, criado_por)
       VALUES ($1, $2, $3, 'application/pdf', $4, $5, $6)
       ON CONFLICT (pedido_id) DO UPDATE SET
         nome_arquivo  = EXCLUDED.nome_arquivo,
         tamanho_bytes = EXCLUDED.tamanho_bytes,
         conteudo      = EXCLUDED.conteudo,
         criado_por    = EXCLUDED.criado_por,
         created_at    = NOW()
       RETURNING id, nome_arquivo, tamanho_bytes`,
      [pedidoId, req.user.empresa_id, req.file.originalname, req.file.size, req.file.buffer, req.user.id]
    );

    return res.status(200).json({ message: "PDF vinculado com sucesso.", ...result.rows[0] });
  } catch (err) {
    console.error("[anexo-pdf POST]", err);
    return res.status(500).json({ message: "Erro ao vincular PDF." });
  }
});
```

- [ ] **Step 2: Adicionar rota `GET /:id/anexo-pdf`**

```javascript
// Serve o PDF original para visualização
router.get("/:id/anexo-pdf", authMiddleware, async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id, 10);
    if (isNaN(pedidoId)) return res.status(400).json({ message: "ID de pedido inválido." });

    const result = await db.query(
      `SELECT pa.nome_arquivo, pa.mime_type, pa.conteudo
       FROM pedido_anexos pa
       JOIN pedidos p ON p.id = pa.pedido_id
       WHERE pa.pedido_id=$1 AND p.empresa_id=$2 AND p.deleted_at IS NULL
       LIMIT 1`,
      [pedidoId, req.user.empresa_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Nenhum PDF vinculado a este pedido." });
    }

    const { nome_arquivo, mime_type, conteudo } = result.rows[0];
    const safeName = nome_arquivo.replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader("Content-Type", mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(conteudo);
  } catch (err) {
    console.error("[anexo-pdf GET]", err);
    return res.status(500).json({ message: "Erro ao recuperar PDF." });
  }
});
```

- [ ] **Step 3: Adicionar rota `DELETE /:id/anexo-pdf`**

```javascript
// Remove o PDF vinculado ao pedido
router.delete("/:id/anexo-pdf", authMiddleware, async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id, 10);
    if (isNaN(pedidoId)) return res.status(400).json({ message: "ID de pedido inválido." });

    const pedidoRes = await db.query(
      `SELECT id FROM pedidos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [pedidoId, req.user.empresa_id]
    );
    if (pedidoRes.rows.length === 0) {
      return res.status(403).json({ message: "Pedido não encontrado ou sem permissão." });
    }

    await db.query(`DELETE FROM pedido_anexos WHERE pedido_id=$1`, [pedidoId]);
    return res.status(204).send();
  } catch (err) {
    console.error("[anexo-pdf DELETE]", err);
    return res.status(500).json({ message: "Erro ao remover PDF." });
  }
});
```

- [ ] **Step 4: Verificar que o módulo carrega sem erros**

```bash
cd backend && node -e "require('./src/routes/pedidosRoutes')" && echo "OK"
```
Esperado: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pedidosRoutes.js
git commit -m "feat(pedidos): rotas POST/GET/DELETE /pedidos/:id/anexo-pdf com seguranca em camadas"
```

---

## Task 5: Remover dependências PDF do backend

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Desinstalar os pacotes PDF**

```bash
cd backend && npm uninstall pdf-parse pdfreader pdfjs-dist
```

- [ ] **Step 2: Verificar remoção**

```bash
cd backend && node -e "require('pdf-parse')" 2>&1
```
Esperado: `Error: Cannot find module 'pdf-parse'`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): remove dependencias pdf-parse, pdfreader e pdfjs-dist"
```

---

## Task 6: Criar componente `VincularPdfTab.jsx`

**Files:**
- Create: `frontend-web/src/pages/pedidos/VincularPdfTab.jsx`

Este componente **deve ser criado antes** da Task 7 (que o importa). Permite buscar um pedido por número/nome de cliente, selecionar um PDF e vinculá-lo.

- [ ] **Step 1: Criar o arquivo `VincularPdfTab.jsx`**

```jsx
import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export default function VincularPdfTab() {
  const [busca,             setBusca]             = useState("");
  const [resultados,        setResultados]        = useState([]);
  const [buscando,          setBuscando]          = useState(false);
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null);
  const [arquivo,           setArquivo]           = useState(null);
  const [erroArquivo,       setErroArquivo]       = useState("");
  const [enviando,          setEnviando]          = useState(false);
  const [feedback,          setFeedback]          = useState(null); // { tipo: "success"|"error", msg }
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get(`/pedidos?q=${encodeURIComponent(busca.trim())}`);
        setResultados(res.pedidos || []);
      } catch (_) {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [busca]);

  function selecionarArquivo(file) {
    setErroArquivo("");
    setFeedback(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setErroArquivo("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setErroArquivo("O arquivo excede o limite de 5 MB.");
      return;
    }
    setArquivo(file);
  }

  async function handleVincular() {
    if (!pedidoSelecionado || !arquivo) return;
    setEnviando(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      await api.post(`/pedidos/${pedidoSelecionado.id}/anexo-pdf`, fd, true);
      setFeedback({ tipo: "success", msg: `PDF vinculado ao pedido ${pedidoSelecionado.numero} com sucesso.` });
      setArquivo(null);
      setPedidoSelecionado(null);
      setBusca("");
      setResultados([]);
    } catch (e) {
      setFeedback({ tipo: "error", msg: e.message || "Erro ao vincular PDF." });
    } finally {
      setEnviando(false);
    }
  }

  function fmtData(iso) {
    if (!iso) return "";
    const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-BR");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Busca de pedido */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Buscar pedido (número ou nome do cliente)
        </label>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Ex: #00002372 ou João Silva"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPedidoSelecionado(null); }}
            style={{
              width: "100%", padding: "9px 12px", fontSize: 13,
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
              background: "var(--color-surface)", color: "var(--color-text)",
              boxSizing: "border-box",
            }}
          />
          {buscando && (
            <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-text-muted)" }}>
              ...
            </span>
          )}
        </div>

        {resultados.length > 0 && !pedidoSelecionado && (
          <div style={{
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
            marginTop: 4, background: "var(--color-surface)", maxHeight: 200, overflowY: "auto",
          }}>
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => { setPedidoSelecionado(p); setResultados([]); setBusca(""); }}
                style={{
                  width: "100%", textAlign: "left", padding: "9px 12px",
                  border: "none", borderBottom: "1px solid var(--color-border)",
                  background: "transparent", cursor: "pointer", fontSize: 13,
                  color: "var(--color-text)",
                }}
              >
                <strong>{p.numero}</strong>
                {p.cliente_nome && <span style={{ marginLeft: 8, color: "var(--color-text-muted)" }}>{p.cliente_nome}</span>}
                {p.data_pedido && <span style={{ marginLeft: 8, color: "var(--color-text-muted)", fontSize: 12 }}>{fmtData(p.data_pedido)}</span>}
              </button>
            ))}
          </div>
        )}

        {busca.trim() && resultados.length === 0 && !buscando && !pedidoSelecionado && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Nenhum pedido encontrado.</p>
        )}
      </div>

      {/* Card do pedido selecionado */}
      {pedidoSelecionado && (
        <div style={{
          padding: "10px 14px", border: "1px solid var(--color-primary)",
          borderRadius: "var(--radius-md)", background: "rgba(59,130,246,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <strong style={{ fontSize: 13 }}>{pedidoSelecionado.numero}</strong>
            {pedidoSelecionado.cliente_nome && (
              <span style={{ marginLeft: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
                {pedidoSelecionado.cliente_nome}
              </span>
            )}
          </div>
          <button
            onClick={() => setPedidoSelecionado(null)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Dropzone de PDF */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
          PDF do pedido original
        </label>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); selecionarArquivo(e.dataTransfer.files[0]); }}
          style={{
            border: "2px dashed var(--color-border)", borderRadius: "var(--radius-md)",
            padding: "24px 16px", textAlign: "center", cursor: "pointer",
            background: arquivo ? "rgba(34,197,94,0.05)" : "var(--color-surface-soft)",
            transition: "background 0.15s",
          }}
        >
          {arquivo ? (
            <>
              <div style={{ fontSize: 28 }}>📄</div>
              <p style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{arquivo.name}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                {(arquivo.size / 1024).toFixed(1)} KB
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36 }}>📎</div>
              <p style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>Clique ou arraste o PDF aqui</p>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>Apenas .pdf · máx 5 MB</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => selecionarArquivo(e.target.files[0])}
        />
        {erroArquivo && (
          <p style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>⚠ {erroArquivo}</p>
        )}
      </div>

      {feedback && (
        <div style={{
          padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: 13,
          background: feedback.tipo === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          color: feedback.tipo === "success" ? "#16a34a" : "#ef4444",
        }}>
          {feedback.tipo === "success" ? "✓" : "⚠"} {feedback.msg}
        </div>
      )}

      <button
        className="ek-btn ek-btn-primary"
        onClick={handleVincular}
        disabled={!pedidoSelecionado || !arquivo || enviando}
        style={{ alignSelf: "flex-end", minWidth: 180 }}
      >
        {enviando ? "Vinculando..." : "📎 Vincular PDF ao Pedido"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/VincularPdfTab.jsx
git commit -m "feat(pedidos): componente VincularPdfTab para vincular PDF original a pedido existente"
```

---

## Task 7: Refatorar `ImportarPedidoModal.jsx` — remover modo PDF, adicionar abas

**Files:**
- Modify: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`

- [ ] **Step 1: Remover estados e ref de PDF, adicionar `abaAtiva`**

No topo do componente (linhas ~34–39), remover:
```javascript
const inputRef = useRef(null);
```
```javascript
const [modoUpload,    setModoUpload]    = useState("texto");  // texto | pdf
```
```javascript
const [arquivo,       setArquivo]       = useState(null);
```

Adicionar em lugar de `modoUpload`:
```javascript
const [abaAtiva,      setAbaAtiva]      = useState("texto"); // "texto" | "vincular"
```

- [ ] **Step 2: Remover a função `handleUpload` (linhas 128–144)**

Localizar e remover o bloco inteiro:
```javascript
async function handleUpload(file) {
  if (!file) return;
  setArquivo(file);
  setErro("");
  setCarregando(true);
  try {
    const fd = new FormData();
    fd.append("arquivo", file);
    const res = await api.post("/pedidos/importar-pdf", fd, true);
    const ext = res.extraido;
    aplicarExtraido(ext, arquivo?.name || "PDF");
  } catch (e) {
    setErro(e.message || "Erro ao processar o PDF.");
  } finally {
    setCarregando(false);
  }
}
```

- [ ] **Step 3: Adicionar import de `VincularPdfTab` no topo do arquivo**

```javascript
import VincularPdfTab from "./VincularPdfTab";
```

- [ ] **Step 4: Substituir o seletor de modo pelas novas abas**

Localizar o bloco `{/* Seletor de modo */}` (linhas ~251–270):
```jsx
<div style={{ display: "flex", gap: 0, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
  {[
    { id: "texto", icon: "📋", label: "Colar texto (recomendado)" },
    { id: "pdf",   icon: "📄", label: "Upload PDF" },
  ].map(m => (
    <button
      key={m.id}
      onClick={() => { setModoUpload(m.id); setErro(""); }}
      style={{
        flex: 1, padding: "10px 16px", fontSize: 13, fontWeight: 600,
        border: "none", cursor: "pointer", transition: "all 0.15s",
        background: modoUpload === m.id ? "var(--color-primary)" : "var(--color-surface-soft)",
        color: modoUpload === m.id ? "#fff" : "var(--color-text-muted)",
      }}
    >
      {m.icon} {m.label}
    </button>
  ))}
</div>
```

Substituir por:
```jsx
{/* Abas: Importar Texto | Vincular PDF */}
<div style={{ display: "flex", gap: 0, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
  {[
    { id: "texto",    icon: "📋", label: "Importar por Texto" },
    { id: "vincular", icon: "📎", label: "Vincular PDF" },
  ].map(aba => (
    <button
      key={aba.id}
      onClick={() => { setAbaAtiva(aba.id); setErro(""); }}
      style={{
        flex: 1, padding: "10px 16px", fontSize: 13, fontWeight: 600,
        border: "none", cursor: "pointer", transition: "all 0.15s",
        background: abaAtiva === aba.id ? "var(--color-primary)" : "var(--color-surface-soft)",
        color: abaAtiva === aba.id ? "#fff" : "var(--color-text-muted)",
      }}
    >
      {aba.icon} {aba.label}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Remover bloco JSX do modo PDF (linhas ~302–330)**

Localizar e remover o bloco inteiro:
```jsx
{/* MODO: UPLOAD PDF */}
{modoUpload === "pdf" && (
  <div className="pd-import-upload" style={{ padding: 0 }}>
    <div
      className={`pd-import-dropzone${carregando ? " loading" : ""}`}
      onClick={() => !carregando && inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f?.type === "application/pdf") handleUpload(f);
      }}
    >
      {carregando ? (
        <><div className="pd-spinner" /><p>Processando PDF...</p></>
      ) : (
        <>
          <div style={{ fontSize: 48 }}>📄</div>
          <p style={{ fontWeight: 600, marginTop: 12 }}>Clique ou arraste o PDF aqui</p>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            Apenas arquivos .pdf do sistema edecoração
          </p>
          {arquivo && <div style={{ marginTop: 12, fontSize: 13, color: "var(--color-text-muted)" }}>📎 {arquivo.name}</div>}
        </>
      )}
    </div>
    <input ref={inputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files[0])} />
  </div>
)}
```

- [ ] **Step 6: Alterar condição do bloco de texto para `abaAtiva`**

Localizar:
```jsx
{/* MODO: COLAR TEXTO */}
{modoUpload === "texto" && (
```
Substituir por:
```jsx
{/* ABA: COLAR TEXTO */}
{abaAtiva === "texto" && (
```

- [ ] **Step 7: Adicionar aba "Vincular PDF" após o bloco de texto**

Logo após o `)}` que fecha o bloco `abaAtiva === "texto"`, e ANTES do bloco `{erro && (`, inserir:
```jsx
{/* ABA: VINCULAR PDF ORIGINAL */}
{abaAtiva === "vincular" && (
  <VincularPdfTab />
)}
```

- [ ] **Step 8: Atualizar o subtítulo do modal**

Localizar:
```jsx
<p>{etapa === "upload" ? "Cole o texto ou faça upload do PDF do edecoração" : "Revise os dados extraídos antes de salvar"}</p>
```
Substituir por:
```jsx
<p>{etapa === "upload" ? "Cole o texto do edecoração ou vincule um PDF original" : "Revise os dados extraídos antes de salvar"}</p>
```

- [ ] **Step 9: Commit**

```bash
git add frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx
git commit -m "feat(pedidos): refatora modal de importacao para abas texto e vincular PDF"
```

---

## Task 8: Botão "PDF Original" + "Remover PDF" nos detalhes do pedido

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`

O PDF é servido via rota autenticada (Bearer token). Iframes não aceitam headers customizados, por isso usamos `fetch → blob → URL.createObjectURL → window.open`.

- [ ] **Step 1: Adicionar handler `handleAbrirPdf` na função principal `Pedidos()`**

Dentro da função `Pedidos()`, antes do `return`, adicionar:
```javascript
async function handleAbrirPdf(pedidoId) {
  try {
    const token = localStorage.getItem("token");
    const apiBase = `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/api`;
    const response = await fetch(`${apiBase}/pedidos/${pedidoId}/anexo-pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) { mostrarToast("PDF não encontrado.", "error"); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (_) {
    mostrarToast("Erro ao abrir PDF.", "error");
  }
}
```

- [ ] **Step 2: Adicionar handler `handleRemoverPdf` na função principal `Pedidos()`**

```javascript
async function handleRemoverPdf(pedidoId) {
  if (!window.confirm("Remover o PDF original vinculado a este pedido?")) return;
  try {
    await api.delete(`/pedidos/${pedidoId}/anexo-pdf`);
    mostrarToast("PDF removido.");
    // Recarrega o pedido em detalhe para atualizar tem_anexo_pdf
    const res = await api.get(`/pedidos/${pedidoId}`);
    setPedidoFull(res.pedido);
  } catch (e) {
    mostrarToast(e.message || "Erro ao remover PDF.", "error");
  }
}
```

- [ ] **Step 3: Passar as props para `<DetalhePedido>`**

Localizar o uso do componente (linha ~284):
```jsx
<DetalhePedido
  pedido={pedidoFull || pedidoDetalheAtual}
  onEditar={() => setModalPedido(pedidoFull || pedidoDetalheAtual)}
  onExcluir={() => setConfirmId(pedidoDetalheAtual.id)}
  onImprimir={() => setPrintPedido(pedidoFull || pedidoDetalheAtual)}
  onGerarOS={handleGerarOS}
  onAbrirOS={(id) => navigate(`/pedidos/os/${id}`)}
```

Adicionar as duas props novas:
```jsx
  onAbrirPdf={() => handleAbrirPdf((pedidoFull || pedidoDetalheAtual).id)}
  onRemoverPdf={() => handleRemoverPdf((pedidoFull || pedidoDetalheAtual).id)}
```

- [ ] **Step 4: Atualizar a assinatura de `DetalhePedido`**

Localizar (linha ~374):
```javascript
function DetalhePedido({ pedido, onEditar, onExcluir, onImprimir, onGerarOS, onAbrirOS, onAgendarInstalacao }) {
```
Substituir por:
```javascript
function DetalhePedido({ pedido, onEditar, onExcluir, onImprimir, onGerarOS, onAbrirOS, onAgendarInstalacao, onAbrirPdf, onRemoverPdf }) {
```

- [ ] **Step 5: Adicionar botões "PDF Original" e "Remover PDF" na toolbar**

Localizar o botão de excluir (🗑) na toolbar de ações dentro de `DetalhePedido` (linha ~399):
```jsx
<button className="ek-btn" style={{ fontSize: 12, padding: "6px 12px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }} onClick={onExcluir}>
  🗑
</button>
```

Inserir ANTES desse botão:
```jsx
{pedido.tem_anexo_pdf && (
  <>
    <button
      className="ek-btn ek-btn-secondary"
      style={{ fontSize: 12, padding: "6px 12px" }}
      onClick={onAbrirPdf}
    >
      📄 PDF Original
    </button>
    <button
      className="ek-btn"
      style={{ fontSize: 12, padding: "6px 12px", background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
      onClick={onRemoverPdf}
      title="Remover PDF vinculado"
    >
      🗑 PDF
    </button>
  </>
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.jsx
git commit -m "feat(pedidos): botoes PDF Original e Remover PDF no detalhe do pedido"
```

---

## Task 9: Verificação final

- [ ] **Step 1: Iniciar backend e verificar rotas**

```bash
cd backend && npm start
```

Testar (substitua TOKEN por um token válido):
```bash
# Deve retornar 404 (pedido sem PDF)
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/pedidos/1/anexo-pdf

# Deve retornar 400 (sem arquivo)
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:3001/api/pedidos/1/anexo-pdf
```

- [ ] **Step 2: Iniciar frontend e verificar modal**

```bash
cd frontend-web && npm run dev
```

Navegar até Pedidos → Importar pedidos:
- Verificar 2 abas: "📋 Importar por Texto" e "📎 Vincular PDF"
- Verificar que não existe mais referência a "Upload PDF"
- Verificar que aba "Vincular PDF" mostra busca + dropzone

- [ ] **Step 3: Testar fluxo completo**

1. Aba "Vincular PDF" → digitar número de pedido existente
2. Selecionar o pedido na lista
3. Arrastar PDF válido (< 5 MB) para o dropzone
4. Clicar "Vincular PDF ao Pedido" → feedback de sucesso
5. Fechar o modal, abrir detalhes do pedido vinculado
6. Verificar botão "📄 PDF Original" na toolbar
7. Clicar no botão → PDF abre em nova aba
8. Clicar "🗑 PDF" → confirmar → botão some

- [ ] **Step 4: Testar travas de segurança**

```bash
# Arquivo não-PDF (magic bytes inválidos)
echo "not a pdf" > fake.pdf
curl -X POST -H "Authorization: Bearer TOKEN" \
  -F "arquivo=@fake.pdf;type=application/pdf" \
  http://localhost:3001/api/pedidos/1/anexo-pdf
# Esperado: 400 "Arquivo inválido: não é um PDF real."

# Arquivo > 5 MB
dd if=/dev/zero bs=1M count=6 > big.pdf
curl -X POST -H "Authorization: Bearer TOKEN" \
  -F "arquivo=@big.pdf;type=application/pdf" \
  http://localhost:3001/api/pedidos/1/anexo-pdf
# Esperado: 413 ou erro de multer
```

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "test(pedidos): verificacao manual do fluxo de vinculo de PDF original"
```
