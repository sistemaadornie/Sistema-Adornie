# Trava PWA/Web + Cadastro de Instalador pelo PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instaladores só conseguem entrar pelo PWA (nunca pelo site), o PWA só aceita `ADMIN_MASTER`/`INSTALADOR`, e um instalador consegue se cadastrar pelo próprio PWA em vez de precisar do site.

**Architecture:** Dois endpoints de login (`/api/auth/login` para o site, `/api/auth/pwa/login` novo, para o PWA), cada um emitindo um JWT com um claim `app: "web"|"pwa"`. Um novo middleware `bloquearAppPWA` nega, nas rotas que o PWA não usa, qualquer token `app==="pwa"` sem `ADMIN_MASTER`. O cadastro reaproveita `POST /api/auth/register` já existente, com uma nova coluna `usuarios.cadastro_origem` para saber que o cadastro veio do PWA e pré-atribuir a permissão `INSTALADOR` na aprovação.

**Tech Stack:** Node/Express + PostgreSQL (backend), React + Vite (`frontend-web` e `frontend-instalador`), Jest + Supertest para testes de rota.

## Global Constraints

- Papéis são tratados via permissões avulsas (`ADMIN_MASTER`, `COMERCIAL`, `OPERADOR_AGENDA`, `GESTOR_USUARIOS`, `INSTALADOR`), não um campo `role`. Reaproveitar `backend/src/services/permissionService.js` (`isInstaladorPuro`, `normalizar`) em vez de duplicar lógica de checagem de papel.
- Toda migration de coluna que referencia `usuarios(id)` precisa do padrão duplo local (`INTEGER`)/Supabase (`UUID`) — ver `backend/src/database/migrations/_supabase_update_3.sql` linhas 1-22. `usuarios.cadastro_origem` é `TEXT`, não referencia `usuarios(id)`, então não tem esse problema — só precisa existir nos dois bancos.
- Migrations locais rodam com `node backend/src/database/run-migration.js <arquivo.sql>` (lê `backend/src/database/migrations/<arquivo.sql>`). A versão Supabase é colada manualmente no SQL Editor a partir de `_supabase_update_3.sql` — **não é automatizável neste plano, é um passo manual do usuário** documentado no fim de cada task de migration.
- Testes de backend usam Jest + Supertest, mockando serviços/middlewares (ver `backend/src/__tests__/agendamentosRoutes.itemFotos.test.js` como referência de padrão). Rodar com `npm test` dentro de `backend/`.
- Não alterar `GESTOR_USUARIOS`/`OPERADOR_AGENDA` nem nenhuma rota que o PWA já usa hoje (`agendamentos`, `crews`, `veiculos` abastecimento, `os`, `auth/user/foto*`, `push`) — este plano não deve quebrar nenhuma dessas.
- `ADMIN_MASTER` sempre tem bypass total — todo novo middleware/checagem deste plano precisa preservar isso.

---

### Task 1: Helper `podeAcessarPWA` em `permissionService.js`

**Files:**
- Modify: `backend/src/services/permissionService.js`
- Test: `backend/src/__tests__/permissionService.test.js` (novo)

**Interfaces:**
- Produces: `podeAcessarPWA(permissoes: string[]): boolean` — `true` se o array de permissões contém `ADMIN_MASTER` ou `INSTALADOR` (usando os mesmos aliases já normalizados por `normalizar()`).

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/permissionService.test.js`:

```js
const { podeAcessarPWA, isInstaladorPuro } = require('../services/permissionService');

describe('podeAcessarPWA', () => {
  test('true para ADMIN_MASTER', () => {
    expect(podeAcessarPWA(['ADMIN_MASTER'])).toBe(true);
  });

  test('true para INSTALADOR', () => {
    expect(podeAcessarPWA(['INSTALADOR'])).toBe(true);
  });

  test('true para ADMIN_MASTER + INSTALADOR juntos', () => {
    expect(podeAcessarPWA(['ADMIN_MASTER', 'INSTALADOR'])).toBe(true);
  });

  test('false para COMERCIAL', () => {
    expect(podeAcessarPWA(['COMERCIAL'])).toBe(false);
  });

  test('false para OPERADOR_AGENDA', () => {
    expect(podeAcessarPWA(['OPERADOR_AGENDA'])).toBe(false);
  });

  test('false para GESTOR_USUARIOS', () => {
    expect(podeAcessarPWA(['GESTOR_USUARIOS'])).toBe(false);
  });

  test('false para array vazio ou undefined', () => {
    expect(podeAcessarPWA([])).toBe(false);
    expect(podeAcessarPWA(undefined)).toBe(false);
  });
});

describe('isInstaladorPuro (regressão)', () => {
  test('true só com INSTALADOR', () => {
    expect(isInstaladorPuro(['INSTALADOR'])).toBe(true);
  });

  test('false com INSTALADOR + ADMIN_MASTER', () => {
    expect(isInstaladorPuro(['INSTALADOR', 'ADMIN_MASTER'])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest permissionService.test.js`
Expected: FAIL — `podeAcessarPWA is not a function`.

- [ ] **Step 3: Implementar**

Editar `backend/src/services/permissionService.js`, adicionando a função e exportando:

```js
function podeAcessarPWA(permissoes) {
  const p = normalizar(permissoes);
  return p.has("ADMIN_MASTER") || p.has("INSTALADOR");
}

module.exports = { isInstaladorPuro, isComercialPuro, podeGerenciarAgendamentos, podeAcessarPWA };
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest permissionService.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/permissionService.js backend/src/__tests__/permissionService.test.js
git commit -m "feat(auth): adiciona helper podeAcessarPWA para gate de acesso ao PWA"
```

---

### Task 2: Migration `usuarios.cadastro_origem`

**Files:**
- Create: `backend/src/database/migrations/usuarios_cadastro_origem.sql`
- Modify: `backend/src/database/migrations/_supabase_update_3.sql`

**Interfaces:**
- Produces: coluna `usuarios.cadastro_origem TEXT` (`'web'` por padrão, `'pwa'` quando o cadastro vem do app do instalador), consumida pelas Tasks 6 e 7.

- [ ] **Step 1: Criar a migration local**

Criar `backend/src/database/migrations/usuarios_cadastro_origem.sql`:

```sql
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cadastro_origem TEXT NOT NULL DEFAULT 'web';
```

- [ ] **Step 2: Rodar a migration local**

Run: `cd backend && node src/database/run-migration.js usuarios_cadastro_origem.sql`
Expected: `Migration executada com sucesso.`

- [ ] **Step 3: Adicionar o bloco equivalente ao arquivo consolidado do Supabase**

Adicionar ao final de `backend/src/database/migrations/_supabase_update_3.sql`:

```sql

-- usuarios_cadastro_origem.sql
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cadastro_origem TEXT NOT NULL DEFAULT 'web';
```

- [ ] **Step 4: Registrar o passo manual pendente**

Este arquivo (`_supabase_update_3.sql`) precisa ser colado inteiro no SQL Editor do Supabase pelo usuário antes do deploy em produção — não é automatizável a partir daqui. Deixar isso anotado no corpo do commit (step 5).

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/usuarios_cadastro_origem.sql backend/src/database/migrations/_supabase_update_3.sql
git commit -m "$(cat <<'EOF'
feat(db): adiciona usuarios.cadastro_origem para marcar cadastros vindos do PWA

Pendente: colar _supabase_update_3.sql atualizado no SQL Editor do Supabase.
EOF
)"
```

---

### Task 3: `authMiddleware` propaga o claim `app`

**Files:**
- Modify: `backend/src/middlewares/authMiddleware.js`
- Test: `backend/src/__tests__/authMiddleware.test.js` (novo)

**Interfaces:**
- Consumes: JWT payload já pode conter `app: "web"|"pwa"` (emitido pela Task 4).
- Produces: `req.user.app` (`"web"`, `"pwa"` ou `undefined` para tokens legados sem o claim), consumido pela Task 5 (`bloquearAppPWA`).

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/authMiddleware.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');

const OLD_ENV = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_ENV; });

function mockReqRes(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('authMiddleware — claim app', () => {
  test('propaga app="pwa" de um token novo', async () => {
    const token = jwt.sign(
      { id: 1, permissoes: ['INSTALADOR'], app: 'pwa', status: 'aprovado' },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockReqRes(token);
    await authMiddleware(req, res, next);
    expect(req.user.app).toBe('pwa');
    expect(next).toHaveBeenCalled();
  });

  test('propaga app="web" de um token novo', async () => {
    const token = jwt.sign(
      { id: 1, permissoes: ['COMERCIAL'], app: 'web', status: 'aprovado' },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockReqRes(token);
    await authMiddleware(req, res, next);
    expect(req.user.app).toBe('web');
  });

  test('token legado sem claim app resulta em req.user.app undefined', async () => {
    const token = jwt.sign(
      { id: 1, permissoes: ['COMERCIAL'], status: 'aprovado' },
      process.env.JWT_SECRET
    );
    const { req, res, next } = mockReqRes(token);
    await authMiddleware(req, res, next);
    expect(req.user.app).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest authMiddleware.test.js`
Expected: FAIL — `req.user.app` é `undefined` no primeiro e segundo teste (esperado `'pwa'`/`'web'`, campo ainda não existe).

- [ ] **Step 3: Implementar**

Em `backend/src/middlewares/authMiddleware.js`, adicionar `app: decoded.app ?? null` nos dois pontos onde `req.user` é montado (token novo e legado). Trecho do bloco de token novo (linhas 22-34 hoje):

```js
    if (decoded.permissoes) {
      req.user = {
        id:            decoded.id,
        email:         decoded.email,
        nome_completo: decoded.nome_completo,
        foto_url:      decoded.foto_url ?? null,
        status:        decoded.status,
        empresa_id:    decoded.empresa_id,
        setor_id:      decoded.setor_id,
        permissoes:    decoded.permissoes,
        app:           decoded.app ?? null,
      };
      return next();
    }
```

No bloco de token legado (linhas 62-71 hoje), que não tem `app` no payload original — usar `decoded.app ?? null` também, já que esse bloco só roda quando `decoded.permissoes` está ausente, mas `decoded.app` pode não existir de qualquer forma:

```js
    req.user = {
      id:            u.id,
      email:         u.email,
      nome_completo: u.nome_completo,
      foto_url:      u.foto_url,
      status:        u.status,
      empresa_id:    u.empresa_id,
      setor_id:      u.setor_id,
      permissoes:    permRes.rows.map((p) => p.codigo),
      app:           decoded.app ?? null,
    };
    return next();
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest authMiddleware.test.js`
Expected: PASS (3 testes). No 3º teste, `req.user.app` deve ser `null` (não `undefined`) — ajustar a asserção do Step 1 para `expect(req.user.app).toBeNull();` antes de rodar, já que `?? null` normaliza para `null`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middlewares/authMiddleware.js backend/src/__tests__/authMiddleware.test.js
git commit -m "feat(auth): authMiddleware propaga claim app do JWT para req.user"
```

---

### Task 4: Refatorar `/api/auth/login` para emitir claim `app` e bloquear instalador puro

**Files:**
- Modify: `backend/src/routes/authRoutes.js`
- Test: `backend/src/__tests__/authRoutes.login.test.js` (novo)

**Interfaces:**
- Produces: função interna `autenticarCredenciais(email, senha)` (retorna `{ usuario, permissoes }` ou lança erro com `.status`), função interna `assinarToken(usuario, permissoes, app)`. Ambas reaproveitadas pela Task 5.

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/authRoutes.login.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database/db');
const router  = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

const USUARIO_COMERCIAL = {
  id: 1, email: 'consultora@x.com', senha: 'hash', nome_completo: 'Consultora X',
  status: 'aprovado', empresa_id: 10, setor_id: 3, foto_url: null,
  setor_nome: 'Comercial', empresa_nome: 'Adornie',
};
const USUARIO_INSTALADOR = { ...USUARIO_COMERCIAL, id: 2, email: 'instalador@x.com' };

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/login', () => {
  test('200 e permite login de COMERCIAL', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [USUARIO_COMERCIAL] })          // SELECT usuario
      .mockResolvedValueOnce({ rows: [{ codigo: 'COMERCIAL' }] })    // SELECT permissoes
      .mockResolvedValueOnce({ rows: [] });                          // INSERT refresh_tokens
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'consultora@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
    expect(res.body.user.permissoes).toEqual(['COMERCIAL']);
  });

  test('403 para usuário só com INSTALADOR', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [USUARIO_INSTALADOR] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'instalador@x.com', senha: '12345678' });
    expect(res.status).toBe(403);
  });

  test('200 para ADMIN_MASTER + INSTALADOR combinados (defensivo)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [USUARIO_INSTALADOR] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }, { codigo: 'ADMIN_MASTER' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'instalador@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest authRoutes.login.test.js`
Expected: FAIL no 2º teste (`403 para usuário só com INSTALADOR`) — hoje o login aceita qualquer permissão, retornaria 200.

- [ ] **Step 3: Implementar**

Em `backend/src/routes/authRoutes.js`:

1. Adicionar o import no topo (perto da linha 13, junto dos outros requires de middleware):

```js
const { isInstaladorPuro, podeAcessarPWA } = require("../services/permissionService");
```

2. Adicionar as duas funções auxiliares logo antes do bloco `LOGIN` (antes da linha `router.post("/login", ...)`):

```js
/* ── helpers compartilhados por /login e /pwa/login ── */
async function autenticarCredenciais(email, senha) {
  if (!email || !senha) {
    const e = new Error("Preencha todos os campos."); e.status = 400; throw e;
  }

  const resultado = await db.query(
    `
    SELECT 
      u.*,
      s.nome AS setor_nome,
      e.nome_fantasia AS empresa_nome
    FROM usuarios u
    LEFT JOIN setores s ON s.id = u.setor_id
    LEFT JOIN empresas e ON e.id = u.empresa_id
    WHERE u.email = $1
    `,
    [email]
  );

  if (resultado.rows.length === 0) {
    const e = new Error("Email ou senha inválidos."); e.status = 400; throw e;
  }

  const usuario = resultado.rows[0];

  if (usuario.status !== "aprovado") {
    const e = new Error("Conta ainda não aprovada. Aguarde um responsável liberar.");
    e.status = 403; throw e;
  }

  const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
  if (!senhaCorreta) {
    const e = new Error("Email ou senha inválidos."); e.status = 400; throw e;
  }

  const permissoesResult = await db.query(
    `
    SELECT COALESCE(p.codigo, p.nome) AS codigo
    FROM usuario_permissoes up
    JOIN permissoes p ON p.id = up.permissao_id
    WHERE up.usuario_id = $1
    `,
    [usuario.id]
  );

  return { usuario, permissoes: permissoesResult.rows.map((p) => p.codigo) };
}

function assinarToken(usuario, permissoes, app) {
  return jwt.sign(
    {
      id:            usuario.id,
      email:         usuario.email,
      nome_completo: usuario.nome_completo,
      foto_url:      usuario.foto_url || null,
      status:        usuario.status,
      empresa_id:    usuario.empresa_id,
      setor_id:      usuario.setor_id,
      permissoes,
      app,
      type:          "access",
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

function usuarioParaResposta(usuario, permissoes) {
  return {
    id:          usuario.id,
    email:       usuario.email,
    nome_completo: usuario.nome_completo,
    foto_url:    usuario.foto_url,
    setor_id:    usuario.setor_id,
    setor_nome:  usuario.setor_nome,
    empresa_id:  usuario.empresa_id,
    empresa_nome: usuario.empresa_nome,
    status:      usuario.status,
    permissoes,
  };
}
```

3. Substituir o corpo inteiro da rota `router.post("/login", ...)` existente por:

```js
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const { usuario, permissoes } = await autenticarCredenciais(email, senha);

    if (isInstaladorPuro(permissoes)) {
      return res.status(403).json({
        message: "Instaladores acessam pelo aplicativo do time de campo, não pelo site. Baixe o app do instalador.",
      });
    }

    const token = assinarToken(usuario, permissoes, "web");
    const refreshToken = await emitirRefreshToken(res, usuario.id);

    return res.status(200).json({
      message: "Login realizado com sucesso!",
      token,
      refreshToken,
      user: usuarioParaResposta(usuario, permissoes),
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.log(error);
    return res.status(500).json({ message: "Erro no servidor." });
  }
});
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest authRoutes.login.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado (mudança preserva o formato da resposta de `/login`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/authRoutes.js backend/src/__tests__/authRoutes.login.test.js
git commit -m "feat(auth): login web emite claim app e rejeita instalador puro"
```

---

### Task 5: Novo endpoint `POST /api/auth/pwa/login`

**Files:**
- Modify: `backend/src/routes/authRoutes.js`
- Modify: `backend/server.js`
- Test: `backend/src/__tests__/authRoutes.pwaLogin.test.js` (novo)

**Interfaces:**
- Consumes: `autenticarCredenciais`, `assinarToken`, `usuarioParaResposta`, `podeAcessarPWA` (Tasks 1 e 4).
- Produces: rota `POST /api/auth/pwa/login`, consumida pela Task 10 (frontend do PWA).

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/authRoutes.pwaLogin.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database/db');
const router  = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

const BASE = {
  id: 1, senha: 'hash', nome_completo: 'Fulano', status: 'aprovado',
  empresa_id: 10, setor_id: 3, foto_url: null, setor_nome: 'Instalação', empresa_nome: 'Adornie',
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/pwa/login', () => {
  test('200 para INSTALADOR', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'inst@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'INSTALADOR' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'inst@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
    expect(res.body.user.permissoes).toEqual(['INSTALADOR']);
  });

  test('200 para ADMIN_MASTER', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'admin@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'ADMIN_MASTER' }] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'admin@x.com', senha: '12345678' });
    expect(res.status).toBe(200);
  });

  test('403 para COMERCIAL', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'com@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'COMERCIAL' }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'com@x.com', senha: '12345678' });
    expect(res.status).toBe(403);
  });

  test('403 para OPERADOR_AGENDA', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...BASE, email: 'op@x.com' }] })
      .mockResolvedValueOnce({ rows: [{ codigo: 'OPERADOR_AGENDA' }] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'op@x.com', senha: '12345678' });
    expect(res.status).toBe(403);
  });

  test('400 com credenciais erradas', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/pwa/login').send({ email: 'x@x.com', senha: '12345678' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest authRoutes.pwaLogin.test.js`
Expected: FAIL — todas as chamadas retornam 404 (rota ainda não existe).

- [ ] **Step 3: Implementar**

Em `backend/src/routes/authRoutes.js`, adicionar logo depois da rota `/login` (feita na Task 4):

```js
/* ==========================
   LOGIN — PWA (instaladores + admin_master)
========================== */
router.post("/pwa/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const { usuario, permissoes } = await autenticarCredenciais(email, senha);

    if (!podeAcessarPWA(permissoes)) {
      return res.status(403).json({
        message: "Este aplicativo é exclusivo para administradores e instaladores.",
      });
    }

    const token = assinarToken(usuario, permissoes, "pwa");
    const refreshToken = await emitirRefreshToken(res, usuario.id);

    return res.status(200).json({
      message: "Login realizado com sucesso!",
      token,
      refreshToken,
      user: usuarioParaResposta(usuario, permissoes),
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.log(error);
    return res.status(500).json({ message: "Erro no servidor." });
  }
});
```

Em `backend/server.js`, adicionar um rate limiter dedicado (mesmo padrão do `/api/auth/login`, linhas 106-113 hoje), logo depois do bloco existente:

```js
// Limit mais restrito no login do PWA (previne brute-force)
app.use("/api/auth/pwa/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas de login. Aguarde 15 minutos." },
}));
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest authRoutes.pwaLogin.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/authRoutes.js backend/server.js backend/src/__tests__/authRoutes.pwaLogin.test.js
git commit -m "feat(auth): adiciona POST /api/auth/pwa/login restrito a admin_master e instalador"
```

---

### Task 6: Middleware `bloquearAppPWA` nas rotas que o PWA não usa

**Files:**
- Create: `backend/src/middlewares/bloquearAppPWA.js`
- Modify: `backend/src/routes/clientesRoutes.js`
- Modify: `backend/src/routes/arquitetosRoutes.js`
- Modify: `backend/src/routes/pedidosRoutes.js`
- Modify: `backend/src/routes/orcamentosRoutes.js`
- Modify: `backend/src/routes/produtosRoutes.js`
- Modify: `backend/src/routes/categoriasRoutes.js`
- Modify: `backend/src/routes/dashboardRoutes.js`
- Modify: `backend/src/routes/dashboardGestorRoutes.js`
- Modify: `backend/src/routes/crmRoutes.js`
- Test: `backend/src/__tests__/bloquearAppPWA.test.js` (novo)

**Interfaces:**
- Produces: middleware `bloquearAppPWA(req, res, next)` — decodifica o JWT do header `Authorization` de forma independente (não depende de rodar depois do `authMiddleware`); se `app === "pwa"` e a lista de permissões não contém `ADMIN_MASTER`, responde 403; caso contrário chama `next()` (inclusive se o token for inválido/ausente — quem trata isso é o `authMiddleware`, que roda depois, por rota).

- [ ] **Step 1: Escrever o teste do middleware isolado**

Criar `backend/src/__tests__/bloquearAppPWA.test.js`:

```js
const jwt = require('jsonwebtoken');
const bloquearAppPWA = require('../middlewares/bloquearAppPWA');

const OLD_ENV = process.env.JWT_SECRET;
beforeAll(() => { process.env.JWT_SECRET = 'segredo-de-teste'; });
afterAll(() => { process.env.JWT_SECRET = OLD_ENV; });

function mockReqRes(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('bloquearAppPWA', () => {
  test('403 para token app=pwa sem ADMIN_MASTER', () => {
    const token = jwt.sign({ permissoes: ['INSTALADOR'], app: 'pwa' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearAppPWA(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('passa para token app=pwa com ADMIN_MASTER', () => {
    const token = jwt.sign({ permissoes: ['ADMIN_MASTER'], app: 'pwa' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('passa para token app=web independente da permissão', () => {
    const token = jwt.sign({ permissoes: ['COMERCIAL'], app: 'web' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa quando não há token (authMiddleware trata depois)', () => {
    const { req, res, next } = mockReqRes(null);
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passa quando o token é inválido (authMiddleware trata depois)', () => {
    const { req, res, next } = mockReqRes('Bearer token-invalido');
    bloquearAppPWA(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest bloquearAppPWA.test.js`
Expected: FAIL — `Cannot find module '../middlewares/bloquearAppPWA'`.

- [ ] **Step 3: Implementar o middleware**

Criar `backend/src/middlewares/bloquearAppPWA.js`:

```js
const jwt = require("jsonwebtoken");

/**
 * Nega acesso a tokens emitidos pelo PWA do instalador (claim app==="pwa")
 * em rotas que o app não usa, exceto para ADMIN_MASTER (bypass total, como
 * em todo o resto do sistema). Roda de forma independente do authMiddleware
 * — decodifica o próprio token — porque precisa valer mesmo quando montado
 * antes dele na cadeia de middlewares da rota.
 *
 * Token ausente ou inválido: deixa passar: authMiddleware, que roda depois
 * em cada rota, é quem trata autenticação de fato.
 */
function bloquearAppPWA(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    const permissoes = decoded.permissoes || [];
    if (decoded.app === "pwa" && !permissoes.includes("ADMIN_MASTER")) {
      return res.status(403).json({
        message: "Este recurso não está disponível no aplicativo do instalador.",
      });
    }
    return next();
  } catch {
    return next();
  }
}

module.exports = bloquearAppPWA;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest bloquearAppPWA.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Montar o middleware nas 9 rotas**

Em cada um dos arquivos abaixo, adicionar o import e `router.use(bloquearAppPWA)` logo após `const router = express.Router();` (ou, para `dashboardGestorRoutes.js`, incluir dentro do `router.use(...)` já existente).

`backend/src/routes/clientesRoutes.js` — trocar:
```js
const router = express.Router();
```
por:
```js
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");

const router = express.Router();
router.use(bloquearAppPWA);
```

Repetir exatamente o mesmo padrão (import + `router.use(bloquearAppPWA);` logo após a criação do router) em:
- `backend/src/routes/arquitetosRoutes.js`
- `backend/src/routes/pedidosRoutes.js`
- `backend/src/routes/orcamentosRoutes.js`
- `backend/src/routes/produtosRoutes.js`
- `backend/src/routes/categoriasRoutes.js`

Em `backend/src/routes/dashboardRoutes.js`, que hoje não tem `router.use`, adicionar:
```js
"use strict";
const express = require("express");
const router  = express.Router();
const auth    = require("../middlewares/authMiddleware");
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");
const svc     = require("../services/dashboardService");

router.use(bloquearAppPWA);

router.get("/pedidos", auth, async (req, res) => {
```

Em `backend/src/routes/dashboardGestorRoutes.js`, trocar a linha:
```js
router.use(authMiddleware, permissionMiddleware(PERM_DASHBOARD_GESTOR));
```
por:
```js
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");

router.use(bloquearAppPWA, authMiddleware, permissionMiddleware(PERM_DASHBOARD_GESTOR));
```
(o `require` vai perto dos outros imports no topo do arquivo, não literalmente entre as duas linhas — seguir a convenção do arquivo).

Em `backend/src/routes/crmRoutes.js`, adicionar o mesmo padrão de import + `router.use(bloquearAppPWA);` logo após a criação do router (bloqueia o arquivo inteiro, incluindo `/stats`, `/dashboard` e `/retornos` — aceitável, já que nenhuma dessas rotas é usada pelo PWA de qualquer forma).

- [ ] **Step 6: Teste de integração numa das rotas afetadas**

Adicionar ao final de `backend/src/__tests__/bloquearAppPWA.test.js`:

```js
describe('bloquearAppPWA montado em clientesRoutes', () => {
  jest.resetModules();
  jest.doMock('../services/clienteService', () => ({ listar: jest.fn().mockResolvedValue([]) }));
  jest.doMock('../middlewares/authMiddleware', () => (req, _res, next) => {
    req.user = { id: 1, empresa_id: 10, permissoes: ['INSTALADOR'] };
    next();
  });

  test('GET /api/clientes com token app=pwa e sem ADMIN_MASTER retorna 403', async () => {
    const request = require('supertest');
    const express = require('express');
    const clientesRouter = require('../routes/clientesRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/clientes', clientesRouter);

    const token = jwt.sign({ permissoes: ['INSTALADOR'], app: 'pwa' }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/clientes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `cd backend && npx jest bloquearAppPWA.test.js`
Expected: PASS (6 testes).

- [ ] **Step 7: Rodar a suíte completa pra checar regressão**

Run: `cd backend && npm test`
Expected: nenhum teste pré-existente quebrado.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middlewares/bloquearAppPWA.js backend/src/routes/clientesRoutes.js backend/src/routes/arquitetosRoutes.js backend/src/routes/pedidosRoutes.js backend/src/routes/orcamentosRoutes.js backend/src/routes/produtosRoutes.js backend/src/routes/categoriasRoutes.js backend/src/routes/dashboardRoutes.js backend/src/routes/dashboardGestorRoutes.js backend/src/routes/crmRoutes.js backend/src/__tests__/bloquearAppPWA.test.js
git commit -m "feat(auth): bloqueia tokens do PWA em rotas que o app do instalador não usa"
```

---

### Task 7: Cadastro marca origem PWA e aprovação pré-atribui `INSTALADOR`

**Files:**
- Modify: `backend/src/routes/authRoutes.js`
- Test: `backend/src/__tests__/authRoutes.registerPwa.test.js` (novo)

**Interfaces:**
- Consumes: `usuarios.cadastro_origem` (Task 2).
- Produces: `POST /api/auth/register` aceita `origem: "pwa"` no body; `PUT /api/auth/admin/aprovar/:id` atribui `INSTALADOR` automaticamente quando `cadastro_origem = 'pwa'`; `GET /api/auth/admin/usuarios-pendentes` passa a incluir `cadastro_origem` na resposta (consumido pela Task 8).

- [ ] **Step 1: Escrever o teste**

Criar `backend/src/__tests__/authRoutes.registerPwa.test.js`:

```js
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn().mockResolvedValue('hash-fake') }));
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 99, empresa_id: 10, permissoes: ['GESTOR_USUARIOS'] };
  next();
});

const request = require('supertest');
const express = require('express');
const db      = require('../database/db');
const router  = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', router);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/register com origem=pwa', () => {
  test('grava cadastro_origem="pwa"', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                                   // email não existe
      .mockResolvedValueOnce({ rows: [] })                                   // cpf não existe
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                          // empresa válida
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                          // setor válido
      .mockResolvedValueOnce({ rows: [{ id: 5, email: 'i@x.com', nome_completo: 'Fulano', status: 'pendente', empresa_id: 1, setor_id: 1, cadastro_origem: 'pwa' }] });

    const res = await request(app).post('/api/auth/register').send({
      email: 'i@x.com', senha: '12345678', nome_completo: 'Fulano', cpf: '11122233344',
      setor_id: 1, empresa_id: 1, origem: 'pwa',
    });

    expect(res.status).toBe(201);
    const insertCall = db.query.mock.calls[4];
    expect(insertCall[0]).toContain('cadastro_origem');
    expect(insertCall[1]).toContain('pwa');
  });
});

describe('PUT /api/auth/admin/aprovar/:id', () => {
  test('atribui INSTALADOR quando cadastro_origem=pwa', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5, cadastro_origem: 'pwa' }] })  // UPDATE status
      .mockResolvedValueOnce({ rows: [] });                                  // INSERT usuario_permissoes

    const res = await request(app).put('/api/auth/admin/aprovar/5');
    expect(res.status).toBe(200);
    const insertPermCall = db.query.mock.calls[1];
    expect(insertPermCall[0]).toContain('usuario_permissoes');
    expect(insertPermCall[0]).toContain('INSTALADOR');
  });

  test('não insere permissão quando cadastro_origem=web', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 6, cadastro_origem: 'web' }] });

    const res = await request(app).put('/api/auth/admin/aprovar/6');
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx jest authRoutes.registerPwa.test.js`
Expected: FAIL — o INSERT de `/register` ainda não inclui `cadastro_origem`, e `/admin/aprovar/:id` nunca insere permissão.

- [ ] **Step 3: Implementar**

Em `backend/src/routes/authRoutes.js`, dentro de `router.post("/register", ...)`, trocar:
```js
    let { email, senha, nome_completo, cpf, setor_id, empresa_id } = req.body;
```
por:
```js
    let { email, senha, nome_completo, cpf, setor_id, empresa_id, origem } = req.body;
    const cadastroOrigem = origem === "pwa" ? "pwa" : "web";
```

E trocar o INSERT:
```js
    const novoUsuario = await db.query(
      `
      INSERT INTO usuarios (email, senha, nome_completo, cpf, setor_id, empresa_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendente')
      RETURNING id, email, nome_completo, status, empresa_id, setor_id
      `,
      [email, senhaCriptografada, nome_completo, cpf, setor_id, empresa_id]
    );
```
por:
```js
    const novoUsuario = await db.query(
      `
      INSERT INTO usuarios (email, senha, nome_completo, cpf, setor_id, empresa_id, status, cadastro_origem)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendente', $7)
      RETURNING id, email, nome_completo, status, empresa_id, setor_id, cadastro_origem
      `,
      [email, senhaCriptografada, nome_completo, cpf, setor_id, empresa_id, cadastroOrigem]
    );
```

No bloco `ADMIN - LISTAR PENDENTES` (`GET /admin/usuarios-pendentes`), incluir a coluna no SELECT:
```js
        SELECT u.id, u.email, u.nome_completo, u.cpf, u.status, u.setor_id, u.foto_url, u.cadastro_origem, s.nome as setor
```

No bloco `ADMIN - APROVAR` (`PUT /admin/aprovar/:id`), trocar o corpo do handler:
```js
  async (req, res) => {
    try {
      const { id } = req.params;

      const resultado = await db.query(
        `
        UPDATE usuarios
        SET status = 'aprovado'
        WHERE id = $1 AND empresa_id = $2
        RETURNING id
        `,
        [id, req.user.empresa_id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      return res.status(200).json({ message: "Usuário aprovado com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
```
por:
```js
  async (req, res) => {
    try {
      const { id } = req.params;

      const resultado = await db.query(
        `
        UPDATE usuarios
        SET status = 'aprovado'
        WHERE id = $1 AND empresa_id = $2
        RETURNING id, cadastro_origem
        `,
        [id, req.user.empresa_id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      if (resultado.rows[0].cadastro_origem === "pwa") {
        await db.query(
          `
          INSERT INTO usuario_permissoes (usuario_id, permissao_id)
          SELECT $1, id FROM permissoes WHERE codigo = 'INSTALADOR' OR nome = 'INSTALADOR'
          ON CONFLICT DO NOTHING
          `,
          [id]
        );
      }

      return res.status(200).json({ message: "Usuário aprovado com sucesso!" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Erro no servidor." });
    }
  }
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx jest authRoutes.registerPwa.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/authRoutes.js backend/src/__tests__/authRoutes.registerPwa.test.js
git commit -m "feat(auth): marca origem do cadastro e pré-atribui INSTALADOR na aprovação de cadastros do PWA"
```

---

### Task 8: Badge "Cadastro via PWA" na tela de usuários pendentes

**Files:**
- Modify: `frontend-web/src/pages/Usuarios.jsx`

**Interfaces:**
- Consumes: `u.cadastro_origem` retornado por `GET /auth/admin/usuarios-pendentes` (Task 7).

- [ ] **Step 1: Adicionar o badge na célula de nome do pendente**

Em `frontend-web/src/pages/Usuarios.jsx`, dentro do `.map((u) => (...))` da seção de pendentes (linhas 426-434 hoje), trocar:

```jsx
                      <td>
                        <div className="usr-user-cell">
                          <Inicial nome={u.nome_completo || u.nome} foto={u.foto_url || u.foto || u.imagem_url || u.avatar_url || u.avatar || u.foto_perfil} />
                          <div>
                            <strong>{u.nome_completo || u.nome || "Não informado"}</strong>
                          </div>
                        </div>
                      </td>
```

por:

```jsx
                      <td>
                        <div className="usr-user-cell">
                          <Inicial nome={u.nome_completo || u.nome} foto={u.foto_url || u.foto || u.imagem_url || u.avatar_url || u.avatar || u.foto_perfil} />
                          <div>
                            <strong>{u.nome_completo || u.nome || "Não informado"}</strong>
                            {u.cadastro_origem === "pwa" && (
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                                📱 Cadastro via app do instalador — ao aprovar, já recebe a permissão Instalador
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
```

- [ ] **Step 2: Testar manualmente**

Sem suíte de testes de frontend neste projeto para esta tela — validar visualmente depois, junto do resto do plano (ver seção de testes manuais da spec). Marcar como pendente de teste no navegador.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Usuarios.jsx
git commit -m "feat(usuarios): mostra origem PWA nos cadastros pendentes"
```

---

### Task 9: Tela de cadastro no `frontend-instalador`

**Files:**
- Create: `frontend-instalador/src/pages/Cadastro.jsx`
- Modify: `frontend-instalador/src/App.jsx`
- Modify: `frontend-instalador/src/pages/Login.jsx`

**Interfaces:**
- Consumes: `GET /api/auth/empresas`, `GET /api/auth/setores?empresa_id=`, `POST /api/auth/register` (com `origem: "pwa"`), todos já existentes/ajustados nas Tasks 2 e 7.

- [ ] **Step 1: Criar a tela**

Criar `frontend-instalador/src/pages/Cadastro.jsx`, seguindo o estilo mobile-first já usado em `Login.jsx` (classes `login-shell`, `form-group`, `input-base`, `btn btn-primary btn-block`) e a lógica de empresa/setor de `frontend-web/src/pages/RegisterUsuario.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../services/api";

function formatarCPF(valor) {
  const n = valor.replace(/\D/g, "").slice(0, 11);
  return n.replace(/^(\d{3})(\d)/, "$1.$2")
          .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
          .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export default function Cadastro() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome_completo: "", email: "", senha: "", cpf: "", empresa_id: "", setor_id: "",
  });
  const [empresas, setEmpresas] = useState([]);
  const [setores, setSetores] = useState([]);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "cpf" ? formatarCPF(value) : value,
      ...(name === "empresa_id" ? { setor_id: "" } : {}),
    }));
  }

  useEffect(() => {
    fetch(`${API_BASE}/auth/empresas`)
      .then((r) => r.json())
      .then((d) => { if (d.empresas) setEmpresas(d.empresas); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.empresa_id) { setSetores([]); return; }
    setLoadingSetores(true);
    fetch(`${API_BASE}/auth/setores?empresa_id=${form.empresa_id}`)
      .then((r) => r.json())
      .then((d) => setSetores(d.setores || []))
      .catch(() => setSetores([]))
      .finally(() => setLoadingSetores(false));
  }, [form.empresa_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(""); setErro(false); setLoading(true);

    const cpfLimpo = form.cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErro(true); setMsg("Informe um CPF válido com 11 dígitos."); setLoading(false); return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: form.nome_completo, email: form.email,
          senha: form.senha, cpf: cpfLimpo,
          empresa_id: Number(form.empresa_id), setor_id: Number(form.setor_id),
          origem: "pwa",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(true); setMsg(data.message || "Erro ao cadastrar."); return; }
      setErro(false);
      setMsg("Cadastro enviado! Aguarde a aprovação do administrador para conseguir entrar.");
      setForm({ nome_completo: "", email: "", senha: "", cpf: "", empresa_id: "", setor_id: "" });
    } catch {
      setErro(true); setMsg("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="login-glow" />
        <img src="/icon-192.png" alt="Adornie" className="login-logo" />
        <h1 className="page-title" style={{ marginBottom: 4 }}>Cadastro do instalador</h1>
        <p className="page-subtitle">Preencha os dados e aguarde a aprovação do administrador</p>
      </div>

      {msg && <div className={`banner ${erro ? "banner-danger" : "banner-success"}`}>{msg}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nome completo</label>
          <input className="input-base" type="text" name="nome_completo"
            value={form.nome_completo} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input className="input-base" type="email" name="email"
            value={form.email} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>CPF</label>
          <input className="input-base" type="text" name="cpf"
            value={form.cpf} onChange={handleChange} maxLength={14} required />
        </div>

        <div className="form-group">
          <label>Senha</label>
          <input className="input-base" type="password" name="senha"
            value={form.senha} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Empresa</label>
          <select className="input-base" name="empresa_id"
            value={form.empresa_id} onChange={handleChange} required>
            <option value="">Selecione a empresa</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nome_fantasia}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Setor</label>
          <select className="input-base" name="setor_id"
            value={form.setor_id} onChange={handleChange}
            required disabled={!form.empresa_id || loadingSetores}>
            <option value="">
              {!form.empresa_id ? "Selecione a empresa primeiro"
                : loadingSetores ? "Carregando..." : "Selecione o setor"}
            </option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Enviando..." : "Cadastrar"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 16 }}>
        <Link to="/login">Já tenho conta — entrar</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Rotear a tela**

Em `frontend-instalador/src/App.jsx`, adicionar o import e a rota pública (fora do `PrivateRoute`, ao lado de `/login`):

```jsx
import Cadastro from "./pages/Cadastro";
```

```jsx
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
```

- [ ] **Step 3: Link a partir do login**

Em `frontend-instalador/src/pages/Login.jsx`, adicionar após o `</form>`:

```jsx
      <p style={{ textAlign: "center", marginTop: 16 }}>
        Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link>
      </p>
```

E importar `Link` no topo do arquivo, trocando:
```jsx
import { useNavigate, useLocation } from "react-router-dom";
```
por:
```jsx
import { useNavigate, useLocation, Link } from "react-router-dom";
```

- [ ] **Step 4: Build**

Run: `cd frontend-instalador && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend-instalador/src/pages/Cadastro.jsx frontend-instalador/src/App.jsx frontend-instalador/src/pages/Login.jsx
git commit -m "feat(pwa): adiciona tela de autocadastro do instalador"
```

---

### Task 10: `frontend-instalador` autentica via `/api/auth/pwa/login`

**Files:**
- Modify: `frontend-instalador/src/context/AuthContext.jsx`

**Interfaces:**
- Consumes: `POST /api/auth/pwa/login` (Task 5).

- [ ] **Step 1: Trocar o endpoint e remover a checagem client-side redundante**

Em `frontend-instalador/src/context/AuthContext.jsx`, trocar:

```js
  const login = useCallback(async (email, senha) => {
    setLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(data.message || "Email ou senha inválidos.");
        return false;
      }

      const permissoes = data.user?.permissoes ?? [];
      if (!permissoes.includes("INSTALADOR")) {
        setLoginError("Este aplicativo é exclusivo para a equipe de instalação.");
        return false;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch {
      setLoginError("Erro de conexão com o servidor.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);
```

por:

```js
  const login = useCallback(async (email, senha) => {
    setLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/auth/pwa/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(data.message || "Email ou senha inválidos.");
        return false;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch {
      setLoginError("Erro de conexão com o servidor.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);
```

A checagem de `permissoes.includes("INSTALADOR")` sai do client porque agora é o backend (`podeAcessarPWA`, Task 5) quem decide — e o backend também aceita `ADMIN_MASTER`, que o código antigo rejeitava incorretamente.

- [ ] **Step 2: Build**

Run: `cd frontend-instalador && npm run build`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-instalador/src/context/AuthContext.jsx
git commit -m "feat(pwa): login do instalador passa a usar /api/auth/pwa/login"
```

---

## Testes manuais pendentes (sem ferramenta de screenshot neste ambiente)

- Login de uma consultora (`COMERCIAL`) no site → continua funcionando normalmente.
- Login de um instalador puro no site → bloqueado com a mensagem nova.
- Login de um instalador no PWA (`/pwa/login`) → funciona.
- Login de uma consultora no PWA → bloqueado.
- Login de `ADMIN_MASTER` no PWA → funciona.
- Fluxo completo: cadastro pelo PWA (`/cadastro`) → aparece em "Aguardando aprovação" no site com o badge 📱 → aprovar → usuário já loga no PWA com `INSTALADOR` sem precisar editar permissões manualmente.
