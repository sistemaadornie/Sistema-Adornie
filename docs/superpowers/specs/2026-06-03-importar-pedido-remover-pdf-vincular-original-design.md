# Design: Remover importação PDF + Vincular PDF Original ao Pedido

**Data:** 2026-06-03  
**Status:** Aprovado

---

## Contexto

O modal de importação de pedidos (`ImportarPedidoModal.jsx`) atualmente suporta dois modos: colar texto e fazer upload de PDF para extração automática de dados. O backend tem rotas e parsers pesados (`pdf-parse`, `pdfreader`, `pdfjs-dist`) para processar os PDFs.

A demanda é:
1. Remover completamente a opção de importar via PDF (extração de dados a partir de PDF).
2. Manter apenas a importação por texto.
3. Adicionar uma nova aba "Vincular PDF" no mesmo modal para anexar o PDF original do pedido (somente armazenamento, sem parsing).
4. Exibir um botão "PDF Original" nos detalhes do pedido que abre o arquivo armazenado.
5. Implementar travas de segurança para evitar spam e desperdício de memória no banco.

---

## Escopo

### O que é removido

**Backend — `pedidosRoutes.js`:**
- Rota `POST /pedidos/importar-pdf` inteira
- Funções: `lerFragmentos`, `extrairItensTabela`, `extrairItensTabelaRawText`
- Imports: `pdfParse` (pdf-parse), `PdfReader` (pdfreader)

**Backend — `package.json`:**
- Dependências: `pdf-parse`, `pdfreader`, `pdfjs-dist`

**Frontend — `ImportarPedidoModal.jsx`:**
- Modo/tab de upload de PDF (toggle texto/PDF, dropzone, `handleUpload`, chamada a `/pedidos/importar-pdf`)
- Qualquer referência ao modo PDF

### O que é adicionado

**Banco de dados:**
- Tabela `pedido_anexos` (migration nova)

**Backend:**
- `POST /pedidos/:id/anexo-pdf` — upload com validações de segurança
- `GET  /pedidos/:id/anexo-pdf` — serve o PDF para visualização
- `DELETE /pedidos/:id/anexo-pdf` — remove o PDF vinculado
- Campo `tem_anexo_pdf` (booleano) incluído no retorno da rota `GET /pedidos/:id`

**Frontend:**
- `ImportarPedidoModal.jsx` — duas abas: "Importar por Texto" e "Vincular PDF"
- Novo componente `VincularPdfTab.jsx`
- Tela de detalhes do pedido — botão "PDF Original" (condicional ao campo `tem_anexo_pdf`)

---

## Banco de Dados

### Migration: `pedido_anexos.sql`

```sql
CREATE TABLE pedido_anexos (
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

CREATE INDEX ON pedido_anexos (empresa_id);
CREATE INDEX ON pedido_anexos (created_at);
```

A constraint `UNIQUE(pedido_id)` garante no máximo 1 PDF por pedido. O upsert usa `ON CONFLICT (pedido_id) DO UPDATE` para substituir sem acumular.

---

## Backend

### Rota POST `/pedidos/:id/anexo-pdf`

**Middleware chain:** `authMiddleware → multerMemory (5 MB) → validarAnexoPdf → handler`

**Validações em ordem:**

1. **Tamanho** — `multer` rejeita automaticamente arquivos > 5 MB (`limits.fileSize`)
2. **Presença do arquivo** — retorna 400 se nenhum arquivo enviado
3. **MIME type** — `req.file.mimetype !== 'application/pdf'` → 400
4. **Magic bytes** — `buffer.slice(0, 5).toString() !== '%PDF-'` → 400 (bloqueia arquivos renomeados)
5. **Pertencimento** — query `SELECT empresa_id FROM pedidos WHERE id=$1 AND deleted_at IS NULL`; se `empresa_id !== req.user.empresa_id` → 403
6. **Rate limit** — query: `SELECT COUNT(*) FROM pedido_anexos WHERE empresa_id=$1 AND created_at > NOW() - INTERVAL '1 hour'`; se `count >= 20` → 429 com mensagem clara
7. **Upsert** — `INSERT INTO pedido_anexos (...) ON CONFLICT (pedido_id) DO UPDATE SET ...`

**Resposta:** `{ message: "PDF vinculado com sucesso.", id, nome_arquivo, tamanho_bytes }`

### Rota GET `/pedidos/:id/anexo-pdf`

- Valida pertencimento (mesma empresa)
- Retorna `Content-Type: application/pdf`, `Content-Disposition: inline; filename="..."`, body = `conteudo` (BYTEA)
- 404 se não existe PDF vinculado

### Rota DELETE `/pedidos/:id/anexo-pdf`

- Valida pertencimento
- `DELETE FROM pedido_anexos WHERE pedido_id=$1`
- 204 No Content

### Rota GET `/pedidos/:id` — campo adicional

Incluir no SELECT:

```sql
EXISTS(SELECT 1 FROM pedido_anexos WHERE pedido_id = p.id) AS tem_anexo_pdf
```

---

## Frontend

### ImportarPedidoModal.jsx — Refactor de abas

O estado `modo` (texto/pdf) é removido. O modal passa a ter duas abas controladas por um estado `abaAtiva` (`'texto' | 'pdf'`):

```
[ Importar por Texto ] [ Vincular PDF ]
```

- Aba "Importar por Texto": conteúdo atual do modo texto (sem qualquer código de PDF)
- Aba "Vincular PDF": renderiza `<VincularPdfTab />`

### Componente VincularPdfTab.jsx

**Estado local:**
- `busca` (string) — texto digitado na busca
- `pedidoSelecionado` (objeto | null)
- `arquivo` (File | null)
- `carregando` (boolean)
- `resultado` (string | null) — mensagem de sucesso/erro

**Fluxo:**
1. Campo de busca chama `GET /pedidos?q=<busca>` com debounce 300ms
2. Lista resultados (número + nome cliente + data)
3. Ao selecionar pedido, exibe card com dados do pedido
4. Dropzone aceita apenas `application/pdf`, exibe nome e tamanho do arquivo selecionado
5. Botão "Vincular PDF" habilitado somente com pedido + arquivo selecionados
6. Submete `POST /pedidos/:id/anexo-pdf` via `FormData`
7. Exibe feedback de sucesso ou erro

**Validação client-side (antes do envio):**
- Tipo do arquivo: `file.type !== 'application/pdf'` → exibe erro sem fazer request
- Tamanho: `file.size > 5 * 1024 * 1024` → exibe erro sem fazer request

### Detalhes do Pedido — Botão "PDF Original"

Na tela de detalhes do pedido (localizar o componente), adicionar condicionalmente:

```jsx
{pedido.tem_anexo_pdf && (
  <button onClick={() => setVerPdf(true)}>
    PDF Original
  </button>
)}
```

Ao clicar, abre um modal com `<iframe src="/api/pedidos/:id/anexo-pdf" />` ou abre em nova aba. Um botão "Remover PDF" (com confirmação) chama `DELETE /pedidos/:id/anexo-pdf`.

---

## Segurança — Resumo das Camadas

| Camada | O que protege |
|--------|---------------|
| `multer limits.fileSize: 5MB` | Rejeita antes de ler o buffer inteiro |
| MIME type check | Bloqueia tipos não-PDF |
| Magic bytes `%PDF-` | Bloqueia arquivos renomeados |
| Pertencimento por `empresa_id` | Isolamento multi-tenant |
| Rate limit 20 uploads/hora/empresa | Anti-spam |
| `UNIQUE(pedido_id)` + upsert | Impede acúmulo por pedido |
| `authMiddleware` em todas as rotas | Somente usuários autenticados |

---

## Arquivos Afetados

**Backend:**
- `backend/src/routes/pedidosRoutes.js` — remover rota importar-pdf e parsers; adicionar 3 rotas de anexo
- `backend/package.json` — remover pdf-parse, pdfreader, pdfjs-dist
- `backend/migrations/pedido_anexos.sql` — criar (novo)

**Frontend:**
- `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx` — refactor de abas, remover modo PDF
- `frontend-web/src/pages/pedidos/VincularPdfTab.jsx` — criar (novo)
- Tela de detalhes do pedido (identificar arquivo exato durante implementação) — botão PDF Original

---

## Fora de Escopo

- Visualização inline avançada (zoom, rotação) — iframe padrão é suficiente
- Controle de versões de PDF por pedido — 1 PDF por pedido, substituição simples
- Storage externo (S3, Supabase) — BYTEA no PostgreSQL conforme decisão
- Migração de dados existentes — não há PDFs armazenados atualmente
