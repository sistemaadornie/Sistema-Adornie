# Spec: Upload de Mídias para Google Drive via Ordem de Serviço

**Data:** 2026-05-24  
**Status:** Aprovado  
**Contexto:** Sistema Adornies — módulo de registro fotográfico/vídeo de instalações em campo

---

## 1. Contexto e Motivação

O sistema já possui `agendamento_anexos` com upload via Cloudinary limitado a 8MB. Para o fluxo de campo real — técnicos instaladores fotografando e filmando ordens de serviço — é necessário:

- Suporte a vídeos de até 100MB
- Upload resiliente em rede móvel instável
- Fila offline: salva localmente, envia quando houver sinal
- Organização automática no Google Drive por pedido/item
- Consulta pelo sistema web via `drive_file_id`

O app de campo será **React Native** (novo, separado do sistema web React existente).

---

## 2. Modelo de Domínio

```
orcamento → (aprovado) → pedido → pedido_itens → ordem_servico
                                               └──── pedido_midias
```

- Cada `pedido_item` gera exatamente uma `ordem_servico`
- Mídias são vinculadas ao pedido + item + OS
- **Mídias e OS nunca são deletadas** — sem `deleted_at`, sem soft delete

---

## 3. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                    REACT NATIVE APP (técnico)                   │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Câmera  │  │  SQLite      │  │   Upload Queue          │  │
│  │  Picker  │─▶│  Queue local │─▶│   Processor             │  │
│  └──────────┘  │  (offline)   │  │ (foreground+background) │  │
│                └──────────────┘  └────────┬────────────────┘  │
│                                            │  NetInfo          │
└────────────────────────────────────────────┼───────────────────┘
                                             │ tem sinal?
                    ┌────────────────────────┼────────────────────┐
                    │     BACKEND Node.js    │                    │
                    │                        ▼                    │
                    │  POST /midias/iniciar                       │
                    │  ┌─────────────────────────────────────┐   │
                    │  │  GoogleDriveService                  │   │
                    │  │  - Service Account JWT auth          │   │
                    │  │  - Cria pastas idempotentemente      │   │
                    │  │  - Inicia sessão resumível (7 dias)  │   │
                    │  │  - Retorna uploadUri ao app          │   │
                    │  └──────────────┬──────────────────────┘   │
                    │                 │ uploadUri                  │
                    │  upload_sessions (PostgreSQL)               │
                    │  pedido_midias  (PostgreSQL)                │
                    └─────────────────┼──────────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────────────┐
                    │        App envia chunks direto ao Drive     │
                    │   PUT {uploadUri}                           │
                    │   Content-Range: bytes 0-5242879/total      │
                    └────────────────────────┬───────────────────┘
                                             │ drive_file_id
                    ┌────────────────────────▼───────────────────┐
                    │  POST /midias/:id/confirmar → Backend       │
                    │  → grava pedido_midias com drive_file_id    │
                    └────────────────────────────────────────────┘
```

**Decisão arquitetural chave:** credenciais da Service Account ficam **apenas no servidor**. O app recebe somente o `uploadUri` (URL de sessão sem credencial embutida). Chunks vão direto ao Drive sem sobrecarregar o servidor de banda.

---

## 4. Modelagem do Banco de Dados

### 4.1 `ordem_servico`

```sql
CREATE TABLE ordem_servico (
  id               SERIAL PRIMARY KEY,
  pedido_item_id   INTEGER NOT NULL REFERENCES pedido_itens(id),
  status           VARCHAR(30) NOT NULL DEFAULT 'aberta',
  -- aberta | em_andamento | aguardando_aprovacao | encerrada
  responsavel_id   INTEGER REFERENCES usuarios(id),
  aberta_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_os_pedido_item ON ordem_servico(pedido_item_id);
CREATE INDEX idx_os_status      ON ordem_servico(status);
CREATE INDEX idx_os_responsavel ON ordem_servico(responsavel_id);
```

### 4.2 `pedido_midias`

```sql
CREATE TABLE pedido_midias (
  id                SERIAL PRIMARY KEY,
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_file_id     VARCHAR(255) NOT NULL,
  drive_url         TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_original     VARCHAR(255),
  tipo              VARCHAR(10)  NOT NULL,  -- foto | video
  tamanho_bytes     BIGINT,
  duracao_segundos  INTEGER,               -- só para vídeos
  descricao         TEXT,
  hash_md5          VARCHAR(32),
  enviado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_por       INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX idx_midias_pedido ON pedido_midias(pedido_id);
CREATE INDEX idx_midias_item   ON pedido_midias(pedido_item_id);
CREATE INDEX idx_midias_os     ON pedido_midias(ordem_servico_id);
CREATE UNIQUE INDEX idx_midias_hash ON pedido_midias(pedido_id, hash_md5)
  WHERE hash_md5 IS NOT NULL;
```

### 4.3 `upload_sessions`

```sql
CREATE TABLE upload_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_upload_uri  TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_arquivo      VARCHAR(255) NOT NULL,
  tamanho_bytes     BIGINT NOT NULL,
  tipo              VARCHAR(10)  NOT NULL,
  hash_md5          VARCHAR(32),
  bytes_confirmados BIGINT NOT NULL DEFAULT 0,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendente',
  -- pendente | em_andamento | concluido | expirado | erro
  iniciado_por      INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em         TIMESTAMPTZ NOT NULL,  -- criado_em + 7 dias
  concluido_em      TIMESTAMPTZ
);

CREATE INDEX idx_upload_sessions_pedido ON upload_sessions(pedido_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX idx_upload_sessions_expira ON upload_sessions(expira_em)
  WHERE status NOT IN ('concluido', 'expirado');
```

**Relacionamentos:**
```
pedidos (1) ──── (N) pedido_itens (1) ──── (1) ordem_servico
pedidos (1) ──── (N) pedido_midias
pedido_itens (1) ── (N) pedido_midias
ordem_servico (1) ─ (N) pedido_midias
```

---

## 5. Estrutura de Pastas no Google Drive

```
📁 Adornies (raiz — compartilhada com a Service Account)
└── 📁 {empresa_nome}_{empresa_id}          ex: "Adornies_1"
    └── 📁 P{numero_pedido:04d}_{YYYY-MM-DD} ex: "P0042_2026-05-24"
        ├── 📁 {seq:02d}_{descricao_item}_{item_id}  ex: "01_Cortinas-Sala_17"
        │   ├── 📷 foto_001_2026-05-24T14-32-00.jpg
        │   └── 🎬 video_001_2026-05-24T15-00-00.mp4
        └── 📁 02_Persianas-Quarto_18
            └── 📷 foto_001_2026-05-24T16-10-00.jpg
```

| Nível | Formato | Exemplo |
|---|---|---|
| Empresa | `{nome_sanitizado}_{empresa_id}` | `Adornies_1` |
| Pedido | `P{numero:04d}_{data_pedido}` | `P0042_2026-05-24` |
| Item/OS | `{seq:02d}_{descricao_sanitizada}_{item_id}` | `01_Cortinas-Sala_17` |
| Arquivo | `{tipo}_{seq:03d}_{iso8601}.{ext}` | `foto_001_2026-05-24T14-32-00.jpg` |

**Sanitização:** remove acentos, substitui espaços por `-`, remove caracteres especiais. `"Cortinas / Sala de Estar"` → `"Cortinas-Sala-de-Estar"`.

**Criação idempotente:** `files.list` antes de `files.create`. Se pasta já existe, reutiliza o ID existente. Isso previne duplicatas em uploads simultâneos da mesma OS.

---

## 6. Fluxo de Upload

### Fase 1 — Captura (sempre offline-first)
1. Técnico tira foto/vídeo
2. App salva no armazenamento local do dispositivo
3. App insere na SQLite local: `{local_path, pedido_id, pedido_item_id, os_id, tipo, status: 'pendente', bytes_confirmados: 0}`
4. UI exibe badge: ⏳ Pendente

### Fase 2 — Iniciar sessão (quando há sinal)
5. NetInfo detecta conectividade → Queue Processor acorda
6. Processor pega próximo item `status IN ('pendente', 'interrompido')`
7. Calcula hash MD5 do arquivo local
8. `POST /api/midias/iniciar` com `{pedido_id, pedido_item_id, os_id, nome_arquivo, tamanho_bytes, tipo, hash_md5}`
9. Backend:
   - Verifica duplicata por `(pedido_id, hash_md5)` — se existe, retorna `{duplicata: true, midia_id}`
   - Cria/encontra pasta no Drive (idempotente): empresa → pedido → item
   - Inicia sessão resumível no Drive via Service Account
   - Salva em `upload_sessions` com `expira_em = NOW() + 7 days`
   - Retorna `{upload_session_id, drive_upload_uri, chunk_size: 5242880}`
10. App atualiza SQLite: `{status: 'enviando', upload_session_id}`
11. UI exibe badge: 📤 Enviando

### Fase 3 — Envio em chunks (direto ao Drive)
12. App divide arquivo em chunks de 5MB (último pode ser menor)
13. Para cada chunk:
    - `PUT {drive_upload_uri}` com `Content-Range: bytes {start}-{end}/{total}`
    - Drive responde `308` (continua) → próximo chunk
    - Drive responde `200/201` (completo) → extrai `{id, webViewLink}`
    - `5xx` / timeout → exponential backoff (1s, 2s, 4s, 8s, max 60s)
    - `404` → sessão expirada → volta à Fase 2
    - Após cada `308`: atualiza `bytes_confirmados` na SQLite local

### Fase 4 — Confirmar no backend
14. `POST /api/midias/{session_id}/confirmar` com `{drive_file_id, drive_url, duracao_segundos?}`
15. Backend insere em `pedido_midias`, marca sessão como `concluido`
16. App marca item na SQLite como `enviado`
17. UI exibe badge: ✅ Enviado

### Fase 5 — Retomada após interrupção
18. App reinicia / conexão volta
19. Queue Processor encontra item `status = 'enviando'` com `bytes_confirmados > 0`
20. `GET /api/midias/{session_id}/status` → verifica estado no backend
21. Se `expira_em < NOW()`: reseta para `pendente`, recomeça Fase 2
22. Se ainda válido: retoma PUT a partir de `bytes_confirmados`

---

## 7. Endpoints da API

```
POST   /api/midias/iniciar
  Body: { pedido_id, pedido_item_id, ordem_servico_id, nome_arquivo,
          tamanho_bytes, tipo, hash_md5 }
  200:  { upload_session_id, drive_upload_uri, chunk_size }
  409:  { duplicata: true, midia_id }

GET    /api/midias/:session_id/status
  200:  { status, bytes_confirmados, expira_em, drive_upload_uri }

POST   /api/midias/:session_id/confirmar
  Body: { drive_file_id, drive_url, duracao_segundos? }
  201:  { midia_id }

GET    /api/pedidos/:pedido_id/midias
  Query: ?item_id=&os_id=&tipo=foto|video
  200:  [{ id, drive_url, drive_file_id, tipo, nome_original,
            tamanho_bytes, enviado_em, enviado_por_nome }]

GET    /api/os/:os_id/midias
  200:  [ ...mesmo formato... ]

POST   /api/os
  Body: { pedido_item_id, responsavel_id }
  201:  { id, status: "aberta" }

PATCH  /api/os/:id/status
  Body: { status }
  200:  { id, status, encerrada_em? }

GET    /api/pedidos/:pedido_id/os
  200:  [{ id, pedido_item_id, status, responsavel_nome,
            aberta_em, encerrada_em, total_fotos, total_videos }]
```

**Permissões:** técnico vê/cria mídias em OS onde é `responsavel_id`. Consultor vê tudo do pedido. Admin vê tudo.

---

## 8. Configuração da Service Account

1. Google Cloud Console → criar projeto `adornies-drive`
2. APIs → habilitar **Google Drive API**
3. IAM → Service Accounts → criar `adornies-upload`
4. Chave JSON → download → variável de ambiente `GOOGLE_SA_KEY_JSON`
5. Google Drive: criar pasta raiz `Adornies` → compartilhar com o email da SA como **Editor**
6. Copiar ID da pasta raiz → variável `GOOGLE_DRIVE_ROOT_FOLDER_ID`

```env
GOOGLE_SA_KEY_JSON={"type":"service_account","project_id":...}
GOOGLE_DRIVE_ROOT_FOLDER_ID=1aBcDeFgHiJkLmNoPqRsTu
```

```js
// GoogleDriveService.js
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SA_KEY_JSON),
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });
```

**Pacote:** `googleapis`. Token da Service Account renovado automaticamente pela lib.  
**Segurança:** `GOOGLE_SA_KEY_JSON` nunca commitado — adicionar ao `.gitignore` e usar `.env.example` sem o valor real.

---

## 9. Ordem de Implementação

### Sprint 1 — Base backend
1. Migrations: `ordem_servico`, `pedido_midias`, `upload_sessions`
2. `GoogleDriveService`: auth + criar pasta idempotente + iniciar sessão resumível
3. Endpoints: `POST /iniciar`, `GET /status`, `POST /confirmar`
4. Teste manual com Postman

### Sprint 2 — Endpoints de consulta + OS
5. Endpoints de listagem: `/pedidos/:id/midias`, `/os/:id/midias`, `/pedidos/:id/os`
6. Endpoints de OS: `POST /os`, `PATCH /os/:id/status`
7. Viewer de mídias no sistema web (iframe/thumbnail por `drive_url`)

### Sprint 3 — React Native app
8. Setup SQLite local (`expo-sqlite` ou `react-native-quick-sqlite`)
9. NetInfo + Queue Processor básico
10. Camera/Gallery picker (`expo-image-picker`)
11. Chunk upload para `drive_upload_uri`
12. Telas de status com badges

### Sprint 4 — Resiliência
13. Retomada de sessão interrompida (Fase 5)
14. Background upload (`react-native-background-upload`)
15. Deduplicação por MD5
16. Job noturno: marcar sessões expiradas
17. Testes de campo simulando 3G intermitente

---

## 10. Riscos e Mitigações

| # | Risco | Mitigação |
|---|---|---|
| 1 | Sessão Drive expira em 7 dias | Detectar 404 no uploadUri → criar nova sessão e reiniciar |
| 2 | Pastas duplicadas no Drive | `files.list` antes de `files.create` (idempotente) |
| 3 | iOS mata background upload | Usar `react-native-background-upload` (URLSession nativo) |
| 4 | 100MB em 3G fraco (~14min contínuos) | Chunk size configurável (fallback 1MB); retomada automática |
| 5 | Credencial JSON commitada | `.gitignore` + `git-secrets` no CI |
| 6 | Arquivo corrompido no device | Recalcular MD5 antes do chunk 1; alertar técnico se divergir |
| 7 | `numero_sequencial` vazio no pedido | Garantir geração antes de criar OS (validar no `POST /os`) |
| 8 | Upload simultâneo para mesma OS | Idempotência de pasta + UNIQUE na sessão por arquivo (hash_md5) |
