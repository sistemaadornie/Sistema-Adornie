# Google Drive Upload — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar no backend Node.js as tabelas, serviços e endpoints necessários para upload de mídias (fotos/vídeos de OS) direto ao Google Drive, com organização automática de pastas e consulta pelo sistema web.

**Architecture:** O backend cria sessões resumíveis no Drive via Service Account e retorna a `uploadUri` para que o cliente envie os chunks diretamente ao Drive (sem trafegar pelo servidor). Após o envio, o cliente confirma com o `drive_file_id` e o backend registra a mídia permanentemente no banco. Nenhuma mídia é deletada.

**Tech Stack:** Node.js + Express 5, PostgreSQL (pg), googleapis (Drive v3), Jest + supertest (testes)

**Spec:** `docs/superpowers/specs/2026-05-24-google-drive-upload-design.md`

**Escopo deste plano:** Sprints 1 e 2 (backend + viewer web). O app React Native é Plano 2.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/src/database/migrations/google_drive_upload.sql` | Criar | DDL das 3 novas tabelas |
| `backend/src/services/googleDriveService.js` | Criar | Auth SA, criar pastas idempotentemente, iniciar sessão resumível |
| `backend/src/services/ordemServicoService.js` | Criar | CRUD de ordem_servico |
| `backend/src/services/uploadSessionService.js` | Criar | Verificar duplicata, criar sessão, confirmar, listar mídias |
| `backend/src/routes/ordemServicoRoutes.js` | Criar | POST /api/os, PATCH /api/os/:id/status, GET /api/pedidos/:id/os |
| `backend/src/routes/uploadRoutes.js` | Criar | POST /api/midias/iniciar, GET /api/midias/:id/status, POST /api/midias/:id/confirmar, GET /api/pedidos/:id/midias, GET /api/os/:id/midias |
| `backend/server.js` | Modificar | Registrar as 2 novas rotas |
| `backend/src/__tests__/googleDriveService.test.js` | Criar | Testes unitários do Drive service |
| `backend/src/__tests__/ordemServicoService.test.js` | Criar | Testes unitários do OS service |
| `backend/src/__tests__/uploadSessionService.test.js` | Criar | Testes unitários do upload session service |
| `backend/src/__tests__/uploadRoutes.test.js` | Criar | Testes de integração dos endpoints de upload |
| `backend/src/__tests__/ordemServicoRoutes.test.js` | Criar | Testes de integração dos endpoints de OS |
| `frontend-web/src/components/MidiasGaleria.jsx` | Criar | Componente de galeria de mídias por pedido/OS |
| `frontend-web/src/pages/pedidos/Pedidos.jsx` | Modificar | Adicionar aba de mídias/OS no painel de detalhe |

---

## Task 1: Instalar dependências e configurar Jest

**Files:**
- Modify: `backend/package.json`

- [ ] **Passo 1: Instalar googleapis (produção) e Jest + supertest (dev)**

```bash
cd backend
npm install googleapis
npm install --save-dev jest supertest
```

- [ ] **Passo 2: Adicionar script de teste e config do Jest no package.json**

Abrir `backend/package.json` e adicionar dentro de `"scripts"` e ao final do objeto:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --runInBand",
    "test:watch": "jest --watch"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/src/__tests__/**/*.test.js"],
    "clearMocks": true
  }
}
```

- [ ] **Passo 3: Verificar que o Jest funciona**

```bash
mkdir -p backend/src/__tests__
echo "test('setup ok', () => expect(1+1).toBe(2));" > backend/src/__tests__/setup.test.js
cd backend && npm test
```

Esperado: `1 passed`.

- [ ] **Passo 4: Remover arquivo temporário e commitar**

```bash
rm backend/src/__tests__/setup.test.js
cd backend && git add package.json package-lock.json
git commit -m "chore: adiciona googleapis, jest e supertest ao backend"
```

---

## Task 2: Migration SQL — tabelas ordem_servico, pedido_midias, upload_sessions

**Files:**
- Create: `backend/src/database/migrations/google_drive_upload.sql`

- [ ] **Passo 1: Criar arquivo de migration**

Criar `backend/src/database/migrations/google_drive_upload.sql`:

```sql
-- Ordem de Serviço: uma por item do pedido
-- Nunca deletada (sem deleted_at)
CREATE TABLE IF NOT EXISTS ordem_servico (
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

CREATE INDEX IF NOT EXISTS idx_os_pedido_item ON ordem_servico(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_os_status      ON ordem_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_responsavel ON ordem_servico(responsavel_id);

-- Mídias permanentes: nunca deletadas
CREATE TABLE IF NOT EXISTS pedido_midias (
  id                SERIAL PRIMARY KEY,
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_file_id     VARCHAR(255) NOT NULL,
  drive_url         TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_original     VARCHAR(255),
  tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('foto','video')),
  tamanho_bytes     BIGINT,
  duracao_segundos  INTEGER,
  descricao         TEXT,
  hash_md5          VARCHAR(32),
  enviado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_por       INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_midias_pedido ON pedido_midias(pedido_id);
CREATE INDEX IF NOT EXISTS idx_midias_item   ON pedido_midias(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_midias_os     ON pedido_midias(ordem_servico_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_midias_hash
  ON pedido_midias(pedido_id, hash_md5) WHERE hash_md5 IS NOT NULL;

-- Sessões de upload em andamento (transitória, mas nunca deletada)
CREATE TABLE IF NOT EXISTS upload_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_upload_uri  TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_arquivo      VARCHAR(255) NOT NULL,
  tamanho_bytes     BIGINT NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('foto','video')),
  hash_md5          VARCHAR(32),
  bytes_confirmados BIGINT NOT NULL DEFAULT 0,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_andamento','concluido','expirado','erro')),
  iniciado_por      INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em         TIMESTAMPTZ NOT NULL,
  concluido_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_pedido
  ON upload_sessions(pedido_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
  ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expira
  ON upload_sessions(expira_em) WHERE status NOT IN ('concluido','expirado');
```

- [ ] **Passo 2: Executar a migration no banco local**

```powershell
$env:PGPASSWORD = "d8ac7f394557a33c883b5bac49d93277"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d sistema_liuu -f "e:\Projetos\adorniesistema\backend\src\database\migrations\google_drive_upload.sql"
```

Esperado: `CREATE TABLE`, `CREATE INDEX` repetido para cada objeto. Nenhum `ERROR`.

- [ ] **Passo 3: Verificar tabelas criadas**

```powershell
$env:PGPASSWORD = "d8ac7f394557a33c883b5bac49d93277"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d sistema_liuu -c "\dt ordem_servico pedido_midias upload_sessions"
```

Esperado: as 3 tabelas listadas.

- [ ] **Passo 4: Commitar**

```bash
git add backend/src/database/migrations/google_drive_upload.sql
git commit -m "feat: migration para ordem_servico, pedido_midias e upload_sessions"
```

---

## Task 3: GoogleDriveService — auth, pastas e testes unitários

**Files:**
- Create: `backend/src/services/googleDriveService.js`
- Create: `backend/src/__tests__/googleDriveService.test.js`

- [ ] **Passo 1: Escrever os testes que devem falhar primeiro**

Criar `backend/src/__tests__/googleDriveService.test.js`:

```javascript
const {
  sanitizeName,
  findOrCreateFolder,
  getOrCreateOsFolder,
} = require('../services/googleDriveService');

describe('sanitizeName', () => {
  test('remove acentos', () => {
    expect(sanitizeName('Cortinão')).toBe('Cortinao');
  });
  test('substitui espaços por hífen', () => {
    expect(sanitizeName('Sala de Estar')).toBe('Sala-de-Estar');
  });
  test('remove caracteres especiais', () => {
    expect(sanitizeName('Cortinas / Sala (2024)')).toBe('Cortinas-Sala-2024');
  });
  test('trunca a 100 caracteres', () => {
    expect(sanitizeName('a'.repeat(120))).toHaveLength(100);
  });
});

describe('findOrCreateFolder', () => {
  test('retorna id existente quando pasta já existe', async () => {
    const drive = {
      files: {
        list: jest.fn().mockResolvedValue({ data: { files: [{ id: 'folder-123' }] } }),
        create: jest.fn(),
      },
    };
    const id = await findOrCreateFolder(drive, 'MinhaP', 'parent-id');
    expect(id).toBe('folder-123');
    expect(drive.files.create).not.toHaveBeenCalled();
  });

  test('cria pasta quando não existe e retorna novo id', async () => {
    const drive = {
      files: {
        list: jest.fn().mockResolvedValue({ data: { files: [] } }),
        create: jest.fn().mockResolvedValue({ data: { id: 'novo-folder-456' } }),
      },
    };
    const id = await findOrCreateFolder(drive, 'MinhaP', 'parent-id');
    expect(id).toBe('novo-folder-456');
    expect(drive.files.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: 'MinhaP',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['parent-id'],
        }),
      })
    );
  });
});
```

- [ ] **Passo 2: Rodar testes para confirmar que falham (módulo não existe)**

```bash
cd backend && npm test -- --testPathPattern=googleDriveService
```

Esperado: `Cannot find module '../services/googleDriveService'`.

- [ ] **Passo 3: Criar `backend/src/services/googleDriveService.js`**

```javascript
const { google } = require('googleapis');
const https = require('https');

function sanitizeName(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 100);
}

function _getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SA_KEY_JSON),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function findOrCreateFolder(drive, name, parentId) {
  const safe = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${safe}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

async function getOrCreateOsFolder({ empresa, pedido, item }) {
  const drive = _getDrive();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  const seq = String(item.ordem || item.id).padStart(2, '0');
  const empresaNome = sanitizeName(empresa.nome) + '_' + empresa.id;
  const pedidoNome  = 'P' + String(pedido.numero_sequencial || pedido.id).padStart(4, '0') +
                      '_' + (pedido.data_pedido || '').toString().slice(0, 10);
  const itemNome    = seq + '_' + sanitizeName(item.descricao || 'item') + '_' + item.id;

  const empresaId = await findOrCreateFolder(drive, empresaNome, rootId);
  const pedidoId  = await findOrCreateFolder(drive, pedidoNome, empresaId);
  const itemId    = await findOrCreateFolder(drive, itemNome, pedidoId);

  return itemId;
}

async function initiateResumableUpload({ folderId, fileName, mimeType, fileSize }) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SA_KEY_JSON),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const body = JSON.stringify({ name: fileName, parents: [folderId] });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/upload/drive/v3/files?uploadType=resumable',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
    };
    const req = https.request(options, (res) => {
      const location = res.headers['location'];
      if (res.statusCode === 200 && location) return resolve(location);
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => reject(new Error(`Drive API ${res.statusCode}: ${data}`)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  sanitizeName,
  findOrCreateFolder,
  getOrCreateOsFolder,
  initiateResumableUpload,
};
```

- [ ] **Passo 4: Rodar os testes e verificar que passam**

```bash
cd backend && npm test -- --testPathPattern=googleDriveService
```

Esperado: `6 passed`.

- [ ] **Passo 5: Commitar**

```bash
git add backend/src/services/googleDriveService.js backend/src/__tests__/googleDriveService.test.js
git commit -m "feat: GoogleDriveService — auth, criação de pastas e sessão resumível"
```

---

## Task 4: OrdemServicoService + testes + rotas

**Files:**
- Create: `backend/src/services/ordemServicoService.js`
- Create: `backend/src/__tests__/ordemServicoService.test.js`
- Create: `backend/src/routes/ordemServicoRoutes.js`
- Create: `backend/src/__tests__/ordemServicoRoutes.test.js`

- [ ] **Passo 1: Escrever testes do service**

Criar `backend/src/__tests__/ordemServicoService.test.js`:

```javascript
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db = require('../database/db');
const svc = require('../services/ordemServicoService');

afterEach(() => jest.clearAllMocks());

describe('criar', () => {
  test('insere e retorna a OS criada', async () => {
    const fakeOs = { id: 1, pedido_item_id: 5, status: 'aberta', responsavel_id: 2 };
    db.query.mockResolvedValueOnce({ rows: [fakeOs] });

    const result = await svc.criar({ pedidoItemId: 5, responsavelId: 2 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ordem_servico'),
      [5, 2]
    );
    expect(result).toEqual(fakeOs);
  });
});

describe('listarPorPedido', () => {
  test('retorna lista de OS com total de mídias', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'aberta', total_fotos: '2', total_videos: '1' }],
    });
    const rows = await svc.listarPorPedido(10);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('pedido_itens'), [10]);
    expect(rows[0].total_fotos).toBe('2');
  });
});

describe('atualizarStatus', () => {
  test('atualiza status e seta encerrada_em quando status=encerrada', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'encerrada', encerrada_em: new Date() }] });
    const result = await svc.atualizarStatus(1, 'encerrada');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('encerrada_em'),
      expect.arrayContaining(['encerrada', 1])
    );
    expect(result.status).toBe('encerrada');
  });

  test('não seta encerrada_em para outros status', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'em_andamento', encerrada_em: null }] });
    await svc.atualizarStatus(1, 'em_andamento');
    const sql = db.query.mock.calls[0][0];
    expect(sql).not.toContain('encerrada_em = NOW()');
  });
});
```

- [ ] **Passo 2: Rodar testes para confirmar que falham**

```bash
cd backend && npm test -- --testPathPattern=ordemServicoService
```

Esperado: `Cannot find module '../services/ordemServicoService'`.

- [ ] **Passo 3: Criar `backend/src/services/ordemServicoService.js`**

```javascript
const db = require('../database/db');

async function criar({ pedidoItemId, responsavelId }) {
  const { rows } = await db.query(
    `INSERT INTO ordem_servico (pedido_item_id, responsavel_id)
     VALUES ($1, $2)
     RETURNING *`,
    [pedidoItemId, responsavelId]
  );
  return rows[0];
}

async function listarPorPedido(pedidoId) {
  const { rows } = await db.query(
    `SELECT os.id, os.status, os.aberta_em, os.encerrada_em,
            pi.descricao AS item_descricao,
            u.nome_completo AS responsavel_nome,
            COUNT(pm.id) FILTER (WHERE pm.tipo = 'foto')  AS total_fotos,
            COUNT(pm.id) FILTER (WHERE pm.tipo = 'video') AS total_videos
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     LEFT JOIN usuarios u  ON u.id  = os.responsavel_id
     LEFT JOIN pedido_midias pm ON pm.ordem_servico_id = os.id
     WHERE pi.pedido_id = $1
     GROUP BY os.id, pi.descricao, u.nome_completo
     ORDER BY os.id`,
    [pedidoId]
  );
  return rows;
}

async function atualizarStatus(id, status) {
  const encerradaClause = status === 'encerrada' ? ', encerrada_em = NOW()' : '';
  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET status = $1, updated_at = NOW() ${encerradaClause}
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  if (!rows[0]) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  return rows[0];
}

module.exports = { criar, listarPorPedido, atualizarStatus };
```

- [ ] **Passo 4: Rodar testes do service e verificar que passam**

```bash
cd backend && npm test -- --testPathPattern=ordemServicoService
```

Esperado: `4 passed`.

- [ ] **Passo 5: Criar `backend/src/routes/ordemServicoRoutes.js`**

```javascript
const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const svc = require('../services/ordemServicoService');

const router = express.Router();

// POST /api/os — criar OS para um item do pedido
router.post('/', authMiddleware, async (req, res) => {
  const { pedido_item_id, responsavel_id } = req.body;
  if (!pedido_item_id) return res.status(400).json({ message: 'pedido_item_id obrigatório' });
  try {
    const os = await svc.criar({ pedidoItemId: pedido_item_id, responsavelId: responsavel_id });
    res.status(201).json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PATCH /api/os/:id/status — atualizar status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const STATUS_VALIDOS = ['aberta', 'em_andamento', 'aguardando_aprovacao', 'encerrada'];
  const { status } = req.body;
  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ message: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` });
  }
  try {
    const os = await svc.atualizarStatus(Number(req.params.id), status);
    res.json(os);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /api/pedidos/:pedidoId/os — listar OS de um pedido
router.get('/pedidos/:pedidoId/os', authMiddleware, async (req, res) => {
  try {
    const rows = await svc.listarPorPedido(Number(req.params.pedidoId));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
```

- [ ] **Passo 6: Escrever testes de integração das rotas**

Criar `backend/src/__tests__/ordemServicoRoutes.test.js`:

```javascript
jest.mock('../services/ordemServicoService');
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 1, empresa_id: 1 };
  next();
});

const request  = require('supertest');
const express  = require('express');
const router   = require('../routes/ordemServicoRoutes');
const svc      = require('../services/ordemServicoService');

const app = express();
app.use(express.json());
app.use('/api/os', router);
app.use('/api', router);

describe('POST /api/os', () => {
  test('201 ao criar OS com dados válidos', async () => {
    svc.criar.mockResolvedValueOnce({ id: 1, status: 'aberta' });
    const res = await request(app).post('/api/os').send({ pedido_item_id: 5, responsavel_id: 2 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('aberta');
  });

  test('400 sem pedido_item_id', async () => {
    const res = await request(app).post('/api/os').send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/os/:id/status', () => {
  test('200 ao atualizar para status válido', async () => {
    svc.atualizarStatus.mockResolvedValueOnce({ id: 1, status: 'em_andamento' });
    const res = await request(app).patch('/api/os/1/status').send({ status: 'em_andamento' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_andamento');
  });

  test('400 para status inválido', async () => {
    const res = await request(app).patch('/api/os/1/status').send({ status: 'desconhecido' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/pedidos/:pedidoId/os', () => {
  test('200 e lista de OS', async () => {
    svc.listarPorPedido.mockResolvedValueOnce([{ id: 1, status: 'aberta' }]);
    const res = await request(app).get('/api/pedidos/10/os');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
```

- [ ] **Passo 7: Rodar testes de rota e verificar que passam**

```bash
cd backend && npm test -- --testPathPattern=ordemServicoRoutes
```

Esperado: `5 passed`.

- [ ] **Passo 8: Commitar**

```bash
git add backend/src/services/ordemServicoService.js \
        backend/src/routes/ordemServicoRoutes.js \
        backend/src/__tests__/ordemServicoService.test.js \
        backend/src/__tests__/ordemServicoRoutes.test.js
git commit -m "feat: OrdemServicoService e rotas GET/POST/PATCH"
```

---

## Task 5: UploadSessionService + testes

**Files:**
- Create: `backend/src/services/uploadSessionService.js`
- Create: `backend/src/__tests__/uploadSessionService.test.js`

- [ ] **Passo 1: Escrever testes do service**

Criar `backend/src/__tests__/uploadSessionService.test.js`:

```javascript
jest.mock('../database/db', () => ({ query: jest.fn() }));
const db  = require('../database/db');
const svc = require('../services/uploadSessionService');

afterEach(() => jest.clearAllMocks());

describe('verificarDuplicata', () => {
  test('retorna null quando não há duplicata', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.verificarDuplicata(1, 'abc123');
    expect(result).toBeNull();
  });

  test('retorna a mídia existente quando hash já existe no pedido', async () => {
    const existente = { id: 5, drive_file_id: 'gdrive-abc' };
    db.query.mockResolvedValueOnce({ rows: [existente] });
    const result = await svc.verificarDuplicata(1, 'abc123');
    expect(result).toEqual(existente);
  });
});

describe('criarSessao', () => {
  test('insere sessão e retorna id UUID', async () => {
    const fakeSession = { id: 'uuid-1234', status: 'pendente' };
    db.query.mockResolvedValueOnce({ rows: [fakeSession] });

    const result = await svc.criarSessao({
      pedidoId: 1, pedidoItemId: 2, osId: 3,
      nomeArquivo: 'foto.jpg', tamanhoBytes: 500000,
      mimeType: 'image/jpeg', tipo: 'foto',
      hashMd5: 'abc123', iniciadoPor: 7,
      driveUploadUri: 'https://drive.example/upload/uuid',
      driveFolderId: 'folder-id-xyz',
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO upload_sessions'),
      expect.arrayContaining(['foto.jpg', 'image/jpeg', 'abc123'])
    );
    expect(result.id).toBe('uuid-1234');
  });
});

describe('buscarStatus', () => {
  test('retorna sessão quando pertence ao usuário', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', status: 'pendente', bytes_confirmados: 0 }],
    });
    const result = await svc.buscarStatus('uuid-1', 7);
    expect(result).not.toBeNull();
  });

  test('retorna null quando sessão não encontrada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.buscarStatus('uuid-x', 7);
    expect(result).toBeNull();
  });
});

describe('confirmar', () => {
  test('insere em pedido_midias e atualiza sessão', async () => {
    const fakeSession = {
      id: 'uuid-1', pedido_id: 1, pedido_item_id: 2, ordem_servico_id: 3,
      nome_arquivo: 'foto.jpg', tamanho_bytes: 500000, tipo: 'foto',
      iniciado_por: 7, drive_folder_id: 'folder-xyz', hash_md5: 'abc',
    };
    db.query
      .mockResolvedValueOnce({ rows: [fakeSession] })       // SELECT sessão
      .mockResolvedValueOnce({ rows: [{ id: 55 }] })         // INSERT pedido_midias
      .mockResolvedValueOnce({ rows: [] });                  // UPDATE sessão

    const result = await svc.confirmar('uuid-1', {
      driveFileId: 'file-111',
      driveUrl: 'https://drive.google.com/file/d/file-111',
      duracaoSegundos: null,
    });

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(result.midia_id).toBe(55);
  });
});
```

- [ ] **Passo 2: Rodar testes para confirmar que falham**

```bash
cd backend && npm test -- --testPathPattern=uploadSessionService
```

Esperado: `Cannot find module '../services/uploadSessionService'`.

- [ ] **Passo 3: Criar `backend/src/services/uploadSessionService.js`**

```javascript
const db = require('../database/db');

async function verificarDuplicata(pedidoId, hashMd5) {
  if (!hashMd5) return null;
  const { rows } = await db.query(
    `SELECT id, drive_file_id, drive_url FROM pedido_midias
     WHERE pedido_id = $1 AND hash_md5 = $2 LIMIT 1`,
    [pedidoId, hashMd5]
  );
  return rows[0] ?? null;
}

async function criarSessao({
  pedidoId, pedidoItemId, osId, nomeArquivo, tamanhoBytes,
  mimeType, tipo, hashMd5, iniciadoPor,
  driveUploadUri, driveFolderId,
}) {
  const { rows } = await db.query(
    `INSERT INTO upload_sessions
       (pedido_id, pedido_item_id, ordem_servico_id, drive_upload_uri, drive_folder_id,
        nome_arquivo, tamanho_bytes, mime_type, tipo, hash_md5, iniciado_por,
        expira_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + INTERVAL '7 days')
     RETURNING *`,
    [pedidoId, pedidoItemId, osId ?? null, driveUploadUri, driveFolderId,
     nomeArquivo, tamanhoBytes, mimeType, tipo, hashMd5 ?? null, iniciadoPor]
  );
  return rows[0];
}

async function buscarStatus(sessionId, userId) {
  const { rows } = await db.query(
    `SELECT id, status, bytes_confirmados, expira_em, drive_upload_uri
     FROM upload_sessions
     WHERE id = $1 AND iniciado_por = $2`,
    [sessionId, userId]
  );
  return rows[0] ?? null;
}

async function confirmar(sessionId, { driveFileId, driveUrl, duracaoSegundos }) {
  const { rows: sessionRows } = await db.query(
    `SELECT * FROM upload_sessions WHERE id = $1`, [sessionId]
  );
  const s = sessionRows[0];
  if (!s) throw Object.assign(new Error('Sessão não encontrada'), { status: 404 });

  const { rows: midiaRows } = await db.query(
    `INSERT INTO pedido_midias
       (pedido_id, pedido_item_id, ordem_servico_id, drive_file_id, drive_url,
        drive_folder_id, nome_original, tipo, tamanho_bytes, duracao_segundos,
        hash_md5, enviado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [s.pedido_id, s.pedido_item_id, s.ordem_servico_id, driveFileId, driveUrl,
     s.drive_folder_id, s.nome_arquivo, s.tipo, s.tamanho_bytes,
     duracaoSegundos ?? null, s.hash_md5, s.iniciado_por]
  );

  await db.query(
    `UPDATE upload_sessions SET status = 'concluido', concluido_em = NOW() WHERE id = $1`,
    [sessionId]
  );

  return { midia_id: midiaRows[0].id };
}

async function listarPorPedido(pedidoId, { itemId, osId, tipo } = {}) {
  const params = [pedidoId];
  const clauses = [];
  if (itemId) { params.push(itemId);  clauses.push(`pm.pedido_item_id = $${params.length}`); }
  if (osId)   { params.push(osId);    clauses.push(`pm.ordem_servico_id = $${params.length}`); }
  if (tipo)   { params.push(tipo);    clauses.push(`pm.tipo = $${params.length}`); }
  const where = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

  const { rows } = await db.query(
    `SELECT pm.id, pm.drive_file_id, pm.drive_url, pm.tipo, pm.nome_original,
            pm.tamanho_bytes, pm.duracao_segundos, pm.enviado_em,
            u.nome_completo AS enviado_por_nome
     FROM pedido_midias pm
     JOIN usuarios u ON u.id = pm.enviado_por
     WHERE pm.pedido_id = $1 ${where}
     ORDER BY pm.enviado_em`,
    params
  );
  return rows;
}

async function listarPorOs(osId) {
  const { rows } = await db.query(
    `SELECT pm.id, pm.drive_file_id, pm.drive_url, pm.tipo, pm.nome_original,
            pm.tamanho_bytes, pm.duracao_segundos, pm.enviado_em,
            u.nome_completo AS enviado_por_nome
     FROM pedido_midias pm
     JOIN usuarios u ON u.id = pm.enviado_por
     WHERE pm.ordem_servico_id = $1
     ORDER BY pm.enviado_em`,
    [osId]
  );
  return rows;
}

module.exports = {
  verificarDuplicata, criarSessao, buscarStatus,
  confirmar, listarPorPedido, listarPorOs,
};
```

- [ ] **Passo 4: Rodar testes e verificar que passam**

```bash
cd backend && npm test -- --testPathPattern=uploadSessionService
```

Esperado: `6 passed`.

- [ ] **Passo 5: Commitar**

```bash
git add backend/src/services/uploadSessionService.js \
        backend/src/__tests__/uploadSessionService.test.js
git commit -m "feat: UploadSessionService — criar, confirmar, listar, deduplicar"
```

---

## Task 6: uploadRoutes + testes de integração

**Files:**
- Create: `backend/src/routes/uploadRoutes.js`
- Create: `backend/src/__tests__/uploadRoutes.test.js`

- [ ] **Passo 1: Criar `backend/src/routes/uploadRoutes.js`**

```javascript
const express = require('express');
const authMiddleware  = require('../middlewares/authMiddleware');
const driveSvc  = require('../services/googleDriveService');
const uploadSvc = require('../services/uploadSessionService');
const db        = require('../database/db');

const router = express.Router();
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// POST /api/midias/iniciar
router.post('/iniciar', authMiddleware, async (req, res) => {
  const { pedido_id, pedido_item_id, ordem_servico_id, nome_arquivo,
          tamanho_bytes, mime_type, tipo, hash_md5 } = req.body;

  if (!pedido_id || !pedido_item_id || !nome_arquivo || !tamanho_bytes || !tipo || !mime_type) {
    return res.status(400).json({ message: 'Campos obrigatórios: pedido_id, pedido_item_id, nome_arquivo, tamanho_bytes, tipo, mime_type' });
  }
  if (!['foto', 'video'].includes(tipo)) {
    return res.status(400).json({ message: 'tipo deve ser foto ou video' });
  }

  try {
    // Verificar duplicata
    const duplicata = await uploadSvc.verificarDuplicata(pedido_id, hash_md5);
    if (duplicata) {
      return res.json({ duplicata: true, midia_id: duplicata.id, drive_url: duplicata.drive_url });
    }

    // Buscar contexto para nomenclatura de pastas
    const { rows: pedidoRows } = await db.query(
      `SELECT p.id, p.numero_sequencial, p.data_pedido, p.empresa_id,
              e.nome AS empresa_nome
       FROM pedidos p
       JOIN empresas e ON e.id = p.empresa_id
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [pedido_id, req.user.empresa_id]
    );
    if (!pedidoRows[0]) return res.status(404).json({ message: 'Pedido não encontrado' });
    const pedido = pedidoRows[0];

    const { rows: itemRows } = await db.query(
      `SELECT id, descricao, COALESCE(ordem, 0) AS ordem
       FROM pedido_itens WHERE id = $1 AND pedido_id = $2`,
      [pedido_item_id, pedido_id]
    );
    if (!itemRows[0]) return res.status(404).json({ message: 'Item não encontrado' });
    const item = itemRows[0];

    // Criar pasta no Drive
    const folderId = await driveSvc.getOrCreateOsFolder({
      empresa: { id: pedido.empresa_id, nome: pedido.empresa_nome },
      pedido:  { id: pedido.id, numero_sequencial: pedido.numero_sequencial, data_pedido: pedido.data_pedido },
      item:    { id: item.id, descricao: item.descricao, ordem: item.ordem },
    });

    // Gerar nome do arquivo no Drive
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = nome_arquivo.split('.').pop();
    const driveFileName = `${tipo}_${ts}.${ext}`;

    // Iniciar sessão resumível no Drive
    const driveUploadUri = await driveSvc.initiateResumableUpload({
      folderId,
      fileName: driveFileName,
      mimeType: mime_type,
      fileSize: tamanho_bytes,
    });

    // Salvar sessão no banco
    const sessao = await uploadSvc.criarSessao({
      pedidoId: pedido_id, pedidoItemId: pedido_item_id, osId: ordem_servico_id ?? null,
      nomeArquivo: driveFileName, tamanhoBytes: tamanho_bytes,
      mimeType: mime_type, tipo, hashMd5: hash_md5 ?? null,
      iniciadoPor: req.user.id, driveUploadUri, driveFolderId: folderId,
    });

    res.json({ upload_session_id: sessao.id, drive_upload_uri: driveUploadUri, chunk_size: CHUNK_SIZE });
  } catch (err) {
    console.error('[uploadRoutes] iniciar:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/midias/:sessionId/status
router.get('/:sessionId/status', authMiddleware, async (req, res) => {
  try {
    const sessao = await uploadSvc.buscarStatus(req.params.sessionId, req.user.id);
    if (!sessao) return res.status(404).json({ message: 'Sessão não encontrada' });
    res.json(sessao);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/midias/:sessionId/confirmar
router.post('/:sessionId/confirmar', authMiddleware, async (req, res) => {
  const { drive_file_id, drive_url, duracao_segundos } = req.body;
  if (!drive_file_id || !drive_url) {
    return res.status(400).json({ message: 'drive_file_id e drive_url obrigatórios' });
  }
  try {
    const result = await uploadSvc.confirmar(req.params.sessionId, {
      driveFileId: drive_file_id, driveUrl: drive_url,
      duracaoSegundos: duracao_segundos ?? null,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /api/pedidos/:pedidoId/midias
router.get('/pedidos/:pedidoId/midias', authMiddleware, async (req, res) => {
  try {
    const rows = await uploadSvc.listarPorPedido(Number(req.params.pedidoId), {
      itemId: req.query.item_id ? Number(req.query.item_id) : undefined,
      osId:   req.query.os_id   ? Number(req.query.os_id)   : undefined,
      tipo:   req.query.tipo,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/os/:osId/midias
router.get('/os/:osId/midias', authMiddleware, async (req, res) => {
  try {
    const rows = await uploadSvc.listarPorOs(Number(req.params.osId));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
```

- [ ] **Passo 2: Escrever testes de integração das rotas**

Criar `backend/src/__tests__/uploadRoutes.test.js`:

```javascript
jest.mock('../services/uploadSessionService');
jest.mock('../services/googleDriveService');
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 7, empresa_id: 1 };
  next();
});

const request    = require('supertest');
const express    = require('express');
const router     = require('../routes/uploadRoutes');
const uploadSvc  = require('../services/uploadSessionService');
const driveSvc   = require('../services/googleDriveService');
const db         = require('../database/db');

const app = express();
app.use(express.json());
app.use('/api/midias', router);
app.use('/api', router);

const fakePedido = { id: 1, numero_sequencial: 42, data_pedido: '2026-05-24', empresa_id: 1, empresa_nome: 'Adornies' };
const fakeItem   = { id: 5, descricao: 'Cortinas Sala', ordem: 1 };

describe('POST /api/midias/iniciar', () => {
  const body = {
    pedido_id: 1, pedido_item_id: 5, nome_arquivo: 'foto.jpg',
    tamanho_bytes: 500000, mime_type: 'image/jpeg', tipo: 'foto', hash_md5: 'abc123',
  };

  test('400 sem campos obrigatórios', async () => {
    const res = await request(app).post('/api/midias/iniciar').send({});
    expect(res.status).toBe(400);
  });

  test('200 com duplicata: retorna midia_id sem criar sessão', async () => {
    uploadSvc.verificarDuplicata.mockResolvedValueOnce({ id: 99, drive_url: 'https://drive.google.com/x' });
    const res = await request(app).post('/api/midias/iniciar').send(body);
    expect(res.status).toBe(200);
    expect(res.body.duplicata).toBe(true);
    expect(res.body.midia_id).toBe(99);
  });

  test('200 criando sessão nova', async () => {
    uploadSvc.verificarDuplicata.mockResolvedValueOnce(null);
    db.query
      .mockResolvedValueOnce({ rows: [fakePedido] })
      .mockResolvedValueOnce({ rows: [fakeItem] });
    driveSvc.getOrCreateOsFolder.mockResolvedValueOnce('folder-id');
    driveSvc.initiateResumableUpload.mockResolvedValueOnce('https://drive.example/upload/uuid');
    uploadSvc.criarSessao.mockResolvedValueOnce({ id: 'sess-uuid' });

    const res = await request(app).post('/api/midias/iniciar').send(body);
    expect(res.status).toBe(200);
    expect(res.body.upload_session_id).toBe('sess-uuid');
    expect(res.body.chunk_size).toBe(5 * 1024 * 1024);
  });
});

describe('GET /api/midias/:id/status', () => {
  test('404 quando sessão não existe', async () => {
    uploadSvc.buscarStatus.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/midias/uuid-nao-existe/status');
    expect(res.status).toBe(404);
  });

  test('200 com sessão existente', async () => {
    uploadSvc.buscarStatus.mockResolvedValueOnce({ id: 'uuid-1', status: 'pendente', bytes_confirmados: 0 });
    const res = await request(app).get('/api/midias/uuid-1/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pendente');
  });
});

describe('POST /api/midias/:id/confirmar', () => {
  test('400 sem drive_file_id', async () => {
    const res = await request(app).post('/api/midias/uuid-1/confirmar').send({ drive_url: 'x' });
    expect(res.status).toBe(400);
  });

  test('201 ao confirmar com sucesso', async () => {
    uploadSvc.confirmar.mockResolvedValueOnce({ midia_id: 42 });
    const res = await request(app)
      .post('/api/midias/uuid-1/confirmar')
      .send({ drive_file_id: 'file-id', drive_url: 'https://drive.google.com/x' });
    expect(res.status).toBe(201);
    expect(res.body.midia_id).toBe(42);
  });
});

describe('GET /api/pedidos/:id/midias', () => {
  test('200 com lista de mídias', async () => {
    uploadSvc.listarPorPedido.mockResolvedValueOnce([{ id: 1, tipo: 'foto' }]);
    const res = await request(app).get('/api/pedidos/10/midias');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/os/:id/midias', () => {
  test('200 com lista de mídias da OS', async () => {
    uploadSvc.listarPorOs.mockResolvedValueOnce([{ id: 1, tipo: 'video' }]);
    const res = await request(app).get('/api/os/3/midias');
    expect(res.status).toBe(200);
    expect(res.body[0].tipo).toBe('video');
  });
});
```

- [ ] **Passo 3: Rodar testes e verificar que passam**

```bash
cd backend && npm test -- --testPathPattern=uploadRoutes
```

Esperado: `8 passed`.

- [ ] **Passo 4: Commitar**

```bash
git add backend/src/routes/uploadRoutes.js \
        backend/src/__tests__/uploadRoutes.test.js
git commit -m "feat: uploadRoutes — iniciar, status, confirmar, listar mídias"
```

---

## Task 7: Registrar rotas no server.js

**Files:**
- Modify: `backend/server.js`

- [ ] **Passo 1: Adicionar os dois requires no bloco de ROTAS de `backend/server.js`**

Encontrar o bloco `// ROTAS` e adicionar as duas linhas novas após as existentes:

```javascript
// Adicionar junto aos outros requires de rotas:
const ordemServicoRoutes = require("./src/routes/ordemServicoRoutes");
const uploadRoutes       = require("./src/routes/uploadRoutes");
```

- [ ] **Passo 2: Adicionar os dois `app.use` junto aos outros**

Encontrar onde os outros `app.use('/api/...')` são registrados e adicionar:

```javascript
app.use("/api/os",     ordemServicoRoutes);
app.use("/api/midias", uploadRoutes);
app.use("/api",        uploadRoutes);   // para /api/pedidos/:id/midias e /api/os/:id/midias
```

- [ ] **Passo 3: Rodar o servidor e verificar que sobe sem erros**

```bash
cd backend && node -e "
process.env.JWT_SECRET='test-secret-32chars-xxxxxxxxxx-xx';
process.env.TOKEN_HMAC_SECRET='test-hmac-32chars-xxxxxxxxxx-xxx';
process.env.GOOGLE_SA_KEY_JSON='{\"type\":\"service_account\"}';
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID='fake';
require('./server.js');
console.log('OK');
setTimeout(()=>process.exit(0),500);
"
```

Esperado: sem `Error` ou `Cannot find module`. O `console.log('OK')` aparece.

- [ ] **Passo 4: Rodar todos os testes para garantir nenhuma regressão**

```bash
cd backend && npm test
```

Esperado: todos os testes passam.

- [ ] **Passo 5: Commitar**

```bash
git add backend/server.js
git commit -m "feat: registra ordemServicoRoutes e uploadRoutes no servidor"
```

---

## Task 8: Viewer de mídias no frontend web

**Files:**
- Create: `frontend-web/src/components/MidiasGaleria.jsx`
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`

- [ ] **Passo 1: Criar `frontend-web/src/components/MidiasGaleria.jsx`**

```jsx
import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export default function MidiasGaleria({ pedidoId, token }) {
  const [midias, setMidias] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!pedidoId) return;
    setCarregando(true);
    fetch(`${API_URL}/api/pedidos/${pedidoId}/midias`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setMidias(Array.isArray(data) ? data : []))
      .catch(() => setMidias([]))
      .finally(() => setCarregando(false));
  }, [pedidoId, token]);

  if (carregando) return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando mídias…</p>;
  if (!midias.length) return <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Nenhuma mídia registrada.</p>;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {midias.map((m) => (
        <a
          key={m.id}
          href={m.drive_url}
          target="_blank"
          rel="noopener noreferrer"
          title={m.nome_original || m.tipo}
          style={{
            display: "block", width: 80, height: 80, border: "1px solid var(--color-border)",
            borderRadius: 6, overflow: "hidden", background: "var(--color-bg-muted)",
            alignItems: "center", justifyContent: "center",
            fontSize: 28, textDecoration: "none",
          }}
        >
          {m.tipo === "foto" ? "🖼️" : "🎬"}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Passo 2: Adicionar a aba de mídias ao painel de detalhe em `Pedidos.jsx`**

Encontrar a função `PedidoDetalhe` (ou o componente que renderiza o painel de detalhe, a partir da linha ~318). Adicionar o import no topo do arquivo e a seção de mídias dentro do painel:

No topo de `Pedidos.jsx`, junto aos outros imports:
```javascript
import MidiasGaleria from "../../components/MidiasGaleria";
```

Dentro do JSX do painel de detalhe, após o último `<div className="pd-detalhe-section">`:
```jsx
<div className="pd-detalhe-section">
  <div className="pd-detalhe-section-title">Mídias (fotos e vídeos)</div>
  <MidiasGaleria pedidoId={pedido.id} token={localStorage.getItem("token")} />
</div>
```

- [ ] **Passo 3: Verificar visualmente no browser**

```bash
cd frontend-web && npm run dev
```

Abrir `http://localhost:5173`, navegar até Pedidos, selecionar um pedido. A seção "Mídias (fotos e vídeos)" deve aparecer no painel de detalhe, mostrando "Nenhuma mídia registrada." (esperado, pois ainda não há mídias no banco).

- [ ] **Passo 4: Commitar**

```bash
git add frontend-web/src/components/MidiasGaleria.jsx \
        frontend-web/src/pages/pedidos/Pedidos.jsx
git commit -m "feat: MidiasGaleria no painel de detalhe do pedido"
```

---

## Task 9: Rodar suite completa e commitar docs

- [ ] **Passo 1: Rodar todos os testes**

```bash
cd backend && npm test
```

Esperado: todos os testes das tasks 3–6 passam. Output final mostra `Test Suites: N passed`.

- [ ] **Passo 2: Commitar doc do plano**

```bash
git add docs/superpowers/plans/2026-05-24-google-drive-upload-backend.md
git commit -m "docs: plano de implementação do backend Google Drive upload"
```

---

## Notas para o Plano 2 (React Native)

O próximo plano cobrirá:
- Setup do app React Native com expo-sqlite, @react-native-community/netinfo, expo-image-picker
- SQLite queue local com estados: pendente → enviando → enviado → erro
- Chunk upload direto ao `drive_upload_uri` (PUT com Content-Range)
- Retomada de sessão interrompida (Fase 5 do spec)
- Background upload com react-native-background-upload
- Telas de status com badges por OS

Antes de iniciar o Plano 2, certifique-se de que os endpoints do Plano 1 estão em produção no Render e testados manualmente com Postman/curl.
