# Push Notifications no PWA do Instalador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar push notifications reais (Web Push API) ao PWA do instalador (`frontend-instalador`), reaproveitando os mesmos gatilhos que hoje já alimentam a tabela `notificacoes` no backend.

**Architecture:** Backend ganha uma tabela `push_subscriptions` (1 linha por dispositivo) e um `pushService` que envia via `web-push`/VAPID. Um novo `notificacaoService.criarNotificacao()` centraliza toda criação de notificação (substitui ~9 `INSERT INTO notificacoes` espalhados em `agendamentoService.js` e o de `notificacoesRoutes.js`) e dispara o push automaticamente quando há um `usuario_id`. No frontend, `public/sw.js` ganha listeners de `push`/`notificationclick`, e a tela Perfil ganha um toggle para ativar/desativar.

**Tech Stack:** Node/Express + `pg` (backend), `web-push` (novo), React + Vite (frontend-instalador), Jest + Supertest (testes backend).

## Global Constraints

- Push é exclusivo do `frontend-instalador` — `frontend-web` continua só com a central in-app por polling que já existe (não tocar nela).
- Notificações globais (`usuario_id = NULL`, destinadas a admins) nunca disparam push.
- O link enviado no payload do push é **sempre** derivado de `agendamento_id` como `/agenda/${agendamentoId}` (rota real do `frontend-instalador`, ver `frontend-instalador/src/App.jsx:31`) — nunca o `link` salvo na tabela `notificacoes`, que usa o formato de rotas do `frontend-web` (ex: `/agendamentos?id=5&detalhe=1`) e não existe no instalador.
- Migrations rodam manualmente nos dois bancos (local + Supabase) — este plano só aplica no banco local; aplicar no Supabase é um passo manual fora deste plano.
- O service worker do `frontend-instalador` só é registrado em build de produção (`frontend-instalador/src/main.jsx:19`, `import.meta.env.PROD`). Testar push manualmente exige `npm run build && npm run preview`, não `npm run dev`.
- Envio de push é best-effort: falha de envio nunca deve derrubar a criação da notificação in-app nem qualquer fluxo de agendamento.

---

### Task 1: Migration `push_subscriptions`

**Files:**
- Create: `backend/src/database/migrations/push_subscriptions.sql`

**Interfaces:**
- Produces: tabela `push_subscriptions(id, usuario_id, empresa_id, endpoint UNIQUE, p256dh, auth, criado_em, ultimo_uso)` — consumida pelas Tasks 3 e 7.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id  INTEGER NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_sub_usuario ON push_subscriptions(usuario_id);
```

- [ ] **Step 2: Aplicar no banco local**

Rode a partir de `backend/`:

```bash
node -e "require('dotenv').config(); const db=require('./src/database/db'); const fs=require('fs'); db.query(fs.readFileSync('./src/database/migrations/push_subscriptions.sql','utf8')).then(()=>{console.log('ok'); process.exit(0);}).catch((e)=>{console.error(e); process.exit(1);});"
```

Expected: imprime `ok` e sai com código 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/push_subscriptions.sql
git commit -m "feat(push): cria tabela push_subscriptions"
```

---

### Task 2: Dependência `web-push` e chaves VAPID

**Files:**
- Modify: `backend/package.json` (via `npm install`)
- Modify: `backend/.env.example`
- Modify: `backend/.env` (local, não commitado)

**Interfaces:**
- Produces: env vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — consumidas pela Task 3 (`pushService.js`) e pela Task 7 (`GET /push/vapid-public-key`).

- [ ] **Step 1: Instalar a dependência**

A partir de `backend/`:

```bash
npm install web-push
```

Expected: `web-push` aparece em `backend/package.json` → `dependencies`.

- [ ] **Step 2: Gerar o par de chaves VAPID**

```bash
npx web-push generate-vapid-keys
```

Expected: imprime um `Public Key` e um `Private Key`.

- [ ] **Step 3: Adicionar os placeholders em `.env.example`**

Adicione ao final de `backend/.env.example`:

```
# ── Push notifications (Web Push) ─────────────────────────────
# Gere com: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:suporte@adornie.com
```

- [ ] **Step 4: Adicionar os valores reais em `backend/.env` (local, não commitado)**

Copie os valores gerados no Step 2 para `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` em `backend/.env`, e defina `VAPID_SUBJECT=mailto:suporte@adornie.com`.

- [ ] **Step 5: Commit (apenas o `.env.example` e o `package.json`/`package-lock.json` — nunca o `.env` real)**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example
git commit -m "chore(push): adiciona dependência web-push e placeholders de VAPID"
```

---

### Task 3: `pushService.js` — envio de push

**Files:**
- Create: `backend/src/services/pushService.js`
- Test: `backend/src/__tests__/pushService.test.js`

**Interfaces:**
- Consumes: tabela `push_subscriptions` (Task 1), env vars `VAPID_*` (Task 2).
- Produces: `enviarPush(usuarioId: number, payload: { titulo, mensagem, link, icone }): Promise<void>` — consumido pela Task 4 (`notificacaoService.js`).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `backend/src/__tests__/pushService.test.js`:

```js
jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
jest.mock("../database/db", () => ({ query: jest.fn() }));

const webpush = require("web-push");
const db = require("../database/db");
const { enviarPush } = require("../services/pushService");

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = "chave-publica-teste";
  process.env.VAPID_PRIVATE_KEY = "chave-privada-teste";
  process.env.VAPID_SUBJECT = "mailto:teste@adornie.com";
});

afterEach(() => jest.clearAllMocks());

describe("enviarPush", () => {
  test("envia para todas as subscriptions do usuário", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, endpoint: "https://push.example/a", p256dh: "key-a", auth: "auth-a" },
        { id: 2, endpoint: "https://push.example/b", p256dh: "key-b", auth: "auth-b" },
      ],
    });
    webpush.sendNotification.mockResolvedValue({});

    await enviarPush(7, { titulo: "Novo agendamento", mensagem: "Você tem uma nova instalação." });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification.mock.calls[0][0]).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "key-a", auth: "auth-a" },
    });
  });

  test("remove subscription expirada (410) sem lançar erro", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, endpoint: "https://push.example/a", p256dh: "key-a", auth: "auth-a" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    webpush.sendNotification.mockRejectedValueOnce(err);

    await expect(enviarPush(7, { titulo: "X" })).resolves.toBeUndefined();

    expect(db.query).toHaveBeenCalledWith(
      "DELETE FROM push_subscriptions WHERE id = $1",
      [1]
    );
  });

  test("não consulta nem envia nada se VAPID não está configurado", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await enviarPush(7, { titulo: "X" });
    expect(db.query).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test("não faz nada se o usuário não tem subscriptions", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await enviarPush(7, { titulo: "X" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

A partir de `backend/`:

```bash
npx jest pushService -v
```

Expected: FAIL — `Cannot find module '../services/pushService'`.

- [ ] **Step 3: Implementar `pushService.js`**

Crie `backend/src/services/pushService.js`:

```js
const webpush = require("web-push");
const db = require("../database/db");

async function enviarPush(usuarioId, payload) {
  if (!process.env.VAPID_PRIVATE_KEY) return;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const { rows } = await db.query(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE usuario_id = $1",
    [usuarioId]
  );
  if (!rows.length) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
        } else {
          console.warn("Erro ao enviar push:", err.message);
        }
      }
    })
  );
}

module.exports = { enviarPush };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npx jest pushService -v
```

Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pushService.js backend/src/__tests__/pushService.test.js
git commit -m "feat(push): adiciona pushService.enviarPush"
```

---

### Task 4: `notificacaoService.js` — criação centralizada de notificações

**Files:**
- Create: `backend/src/services/notificacaoService.js`
- Test: `backend/src/__tests__/notificacaoService.test.js`

**Interfaces:**
- Consumes: `enviarPush` (Task 3).
- Produces: `criarNotificacao({ empresaId, usuarioId?, tipo, titulo, mensagem?, link?, icone?, agendamentoId? }): Promise<NotificacaoRow>` — consumido pelas Tasks 5 e 6.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `backend/src/__tests__/notificacaoService.test.js`:

```js
jest.mock("../database/db", () => ({ query: jest.fn() }));
jest.mock("../services/pushService", () => ({
  enviarPush: jest.fn().mockResolvedValue(undefined),
}));

const db = require("../database/db");
const { enviarPush } = require("../services/pushService");
const { criarNotificacao } = require("../services/notificacaoService");

afterEach(() => jest.clearAllMocks());

describe("criarNotificacao", () => {
  test("insere a notificação com os 8 parâmetros e retorna a linha criada", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, titulo: "Oi" }] });

    const result = await criarNotificacao({
      empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi",
      mensagem: "Mensagem", link: "/agendamentos?id=5", icone: "info", agendamentoId: 5,
    });

    expect(result).toEqual({ id: 1, titulo: "Oi" });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO notificacoes"),
      [1, 7, "sistema", "Oi", "Mensagem", "/agendamentos?id=5", "info", 5]
    );
  });

  test("dispara push com link reescrito para a rota do PWA do instalador", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

    await criarNotificacao({
      empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi",
      link: "/agendamentos?id=5&detalhe=1", agendamentoId: 5,
    });

    expect(enviarPush).toHaveBeenCalledWith(7, {
      titulo: "Oi", mensagem: null, link: "/agenda/5", icone: "info",
    });
  });

  test("usa link genérico /agenda quando não há agendamento_id", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 6 }] });

    await criarNotificacao({ empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi" });

    expect(enviarPush).toHaveBeenCalledWith(7, {
      titulo: "Oi", mensagem: null, link: "/agenda", icone: "info",
    });
  });

  test("não dispara push quando usuarioId é nulo (notificação global)", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });

    await criarNotificacao({ empresaId: 1, usuarioId: null, tipo: "sistema", titulo: "Oi" });

    expect(enviarPush).not.toHaveBeenCalled();
  });

  test("erro ao enviar push não rejeita a criação da notificação", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 4 }] });
    enviarPush.mockRejectedValueOnce(new Error("falhou"));

    await expect(
      criarNotificacao({ empresaId: 1, usuarioId: 7, tipo: "sistema", titulo: "Oi" })
    ).resolves.toEqual({ id: 4 });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npx jest notificacaoService -v
```

Expected: FAIL — `Cannot find module '../services/notificacaoService'`.

- [ ] **Step 3: Implementar `notificacaoService.js`**

Crie `backend/src/services/notificacaoService.js`:

```js
const db = require("../database/db");
const { enviarPush } = require("./pushService");

async function criarNotificacao({
  empresaId,
  usuarioId = null,
  tipo,
  titulo,
  mensagem = null,
  link = null,
  icone = "info",
  agendamentoId = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [empresaId, usuarioId, tipo, titulo, mensagem, link, icone, agendamentoId]
  );
  const notificacao = rows[0];

  if (usuarioId != null) {
    const pushLink = agendamentoId ? `/agenda/${agendamentoId}` : "/agenda";
    enviarPush(usuarioId, { titulo, mensagem, link: pushLink, icone }).catch((e) =>
      console.warn("Erro ao enviar push:", e.message)
    );
  }

  return notificacao;
}

module.exports = { criarNotificacao };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npx jest notificacaoService -v
```

Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/notificacaoService.js backend/src/__tests__/notificacaoService.test.js
git commit -m "feat(push): adiciona notificacaoService.criarNotificacao"
```

---

### Task 5: Refatorar `agendamentoService.js` para usar `criarNotificacao`

**Files:**
- Modify: `backend/src/services/agendamentoService.js`
- Modify: `backend/src/__tests__/agendamentoNaoConcluidoNotificacao.test.js`
- Modify: `backend/src/__tests__/agendamentoCanceladoLimpaItens.test.js`
- Modify: `backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js`
- Modify: `backend/src/__tests__/agendamentoStatusPreAgendado.test.js`
- Modify: `backend/src/__tests__/agendamentoAprovacao.test.js`

**Interfaces:**
- Consumes: `criarNotificacao` (Task 4).

Este arquivo tem 9 pontos que hoje fazem `INSERT INTO notificacoes` direto. Todos passam a usar `criarNotificacao`, que sempre parametriza `usuario_id` (8 posições fixas: `empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id`) — antes, alguns INSERTs fixavam `usuario_id = NULL` direto no SQL (5 ou 6 parâmetros). Isso muda a posição do `link` nos parâmetros de algumas chamadas, por isso dois testes existentes precisam de ajuste.

- [ ] **Step 1: Adicionar o import no topo do arquivo**

Em `backend/src/services/agendamentoService.js`, depois da linha:

```js
const { resolverCliente } = require("./clienteService");
```

adicione:

```js
const { criarNotificacao } = require("./notificacaoService");
```

- [ ] **Step 2: Refatorar `notificarEquipe` (linhas ~64-70)**

Troque:

```js
    const link = `/agendamentos?id=${agId}&detalhe=1`;
    const uids = [...destinatarios];
    await db.query(
      `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
       SELECT $1, unnest($2::integer[]), 'status_agendamento', $3, $4, $5, $6, $7`,
      [empresaId, uids, tituloNotif, mensagemNotif, link, icone, agId]
    );
```

por:

```js
    const link = `/agendamentos?id=${agId}&detalhe=1`;
    await Promise.all(
      [...destinatarios].map((uid) =>
        criarNotificacao({
          empresaId, usuarioId: uid, tipo: "status_agendamento",
          titulo: tituloNotif, mensagem: mensagemNotif, link, icone, agendamentoId: agId,
        })
      )
    );
```

- [ ] **Step 3: Refatorar o INSERT global de edição de agendamento**

Troque:

```js
    await Promise.all([
      db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
         VALUES ($1, NULL, 'sistema', $2, $3, $4, 'info', $5)`,
        [empresaId, tituloN, mensagemN, `/agendamentos?id=${id}&detalhe=1`, id]
      ),
      notificarEquipe(id, empresaId, tituloN, mensagemN, "info", userId),
    ]);
```

por:

```js
    await Promise.all([
      criarNotificacao({
        empresaId, usuarioId: null, tipo: "sistema",
        titulo: tituloN, mensagem: mensagemN, link: `/agendamentos?id=${id}&detalhe=1`, icone: "info", agendamentoId: id,
      }),
      notificarEquipe(id, empresaId, tituloN, mensagemN, "info", userId),
    ]);
```

- [ ] **Step 4: Refatorar o branco `nao_concluido` em `alterarStatus`**

Troque:

```js
      notifs = [
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1, NULL, 'reagendamento_pendente', $2, $3, $4, 'alerta', $5)`,
          [empresaId, tituloUnico, msgUnica, linkReagendar, id]
        ),
        notificarEquipe(id, empresaId, tituloUnico, msgUnica, "alerta", userId),
      ];

      if (consultorId) {
        notifs.push(
          db.query(
            `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
             VALUES ($1, $2, 'reagendamento_pendente', $3, $4, $5, 'alerta', $6)`,
            [empresaId, consultorId, tituloUnico, msgUnica, linkReagendar, id]
          )
        );
      }
```

por:

```js
      notifs = [
        criarNotificacao({
          empresaId, usuarioId: null, tipo: "reagendamento_pendente",
          titulo: tituloUnico, mensagem: msgUnica, link: linkReagendar, icone: "alerta", agendamentoId: id,
        }),
        notificarEquipe(id, empresaId, tituloUnico, msgUnica, "alerta", userId),
      ];

      if (consultorId) {
        notifs.push(
          criarNotificacao({
            empresaId, usuarioId: consultorId, tipo: "reagendamento_pendente",
            titulo: tituloUnico, mensagem: msgUnica, link: linkReagendar, icone: "alerta", agendamentoId: id,
          })
        );
      }
```

- [ ] **Step 5: Refatorar o branch padrão (else) em `alterarStatus`**

Troque:

```js
    } else {
      notifs = [
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1, NULL, 'status_agendamento', $2, $3, $4, $5, $6)`,
          [empresaId, tituloN, mensagemN, link, icone, id]
        ),
        notificarEquipe(id, empresaId, tituloN, mensagemN, icone, userId),
      ];
    }
```

por:

```js
    } else {
      notifs = [
        criarNotificacao({
          empresaId, usuarioId: null, tipo: "status_agendamento",
          titulo: tituloN, mensagem: mensagemN, link, icone, agendamentoId: id,
        }),
        notificarEquipe(id, empresaId, tituloN, mensagemN, icone, userId),
      ];
    }
```

- [ ] **Step 6: Refatorar a notificação de reagendamento por drag & drop (dentro de `reagendar`)**

Troque:

```js
    await Promise.all([
      // Global — admins/operadores
      db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
         VALUES ($1, NULL, 'sistema', $2, $3, $4, 'info', $5)`,
        [empresaId, tituloN, msgN, link, id]
      ),
      // Individuais — criador + equipe (exceto admins e quem arrastou)
      ...[...destinatarios].map((uid) =>
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1,$2,'status_agendamento',$3,$4,$5,'info',$6)`,
          [empresaId, uid, tituloN, msgN, link, id]
        )
      ),
    ]);
```

por:

```js
    await Promise.all([
      // Global — admins/operadores
      criarNotificacao({
        empresaId, usuarioId: null, tipo: "sistema",
        titulo: tituloN, mensagem: msgN, link, icone: "info", agendamentoId: id,
      }),
      // Individuais — criador + equipe (exceto admins e quem arrastou)
      ...[...destinatarios].map((uid) =>
        criarNotificacao({
          empresaId, usuarioId: uid, tipo: "status_agendamento",
          titulo: tituloN, mensagem: msgN, link, icone: "info", agendamentoId: id,
        })
      ),
    ]);
```

- [ ] **Step 7: Refatorar `notificarAdminsAprovacao`**

Troque:

```js
async function notificarAdminsAprovacao(empresaId, agId, titulo, cliente) {
  await db.query(
    `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
     VALUES ($1, NULL, 'aprovacao_urgencia', $2, $3, $4, 'alerta', $5)`,
    [empresaId,
     `Aprovação de urgência: ${titulo || `#${agId}`}`,
     `${cliente ? cliente + " — " : ""}Solicitação de instalação antes do prazo mínimo aguardando aprovação.`,
     `/agendamentos?aprovacoes=1`,
     agId]
  ).catch((e) => console.warn("Erro ao notificar admins (aprovação):", e.message));
}
```

por:

```js
async function notificarAdminsAprovacao(empresaId, agId, titulo, cliente) {
  await criarNotificacao({
    empresaId,
    usuarioId: null,
    tipo: "aprovacao_urgencia",
    titulo: `Aprovação de urgência: ${titulo || `#${agId}`}`,
    mensagem: `${cliente ? cliente + " — " : ""}Solicitação de instalação antes do prazo mínimo aguardando aprovação.`,
    link: `/agendamentos?aprovacoes=1`,
    icone: "alerta",
    agendamentoId: agId,
  }).catch((e) => console.warn("Erro ao notificar admins (aprovação):", e.message));
}
```

- [ ] **Step 8: Refatorar a notificação ao solicitante em `decidirAprovacao`**

Troque:

```js
    await db.query(
      `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
       VALUES ($1,$2,'aprovacao_urgencia',$3,$4,$5,$6,$7)`,
      [empresaId, ag.criado_por, tituloN, msgN, `/agendamentos?id=${id}&detalhe=1`, aprovado ? "sucesso" : "erro", id]
    ).catch((e) => console.warn("Erro ao notificar solicitante:", e.message));
```

por:

```js
    await criarNotificacao({
      empresaId,
      usuarioId: ag.criado_por,
      tipo: "aprovacao_urgencia",
      titulo: tituloN,
      mensagem: msgN,
      link: `/agendamentos?id=${id}&detalhe=1`,
      icone: aprovado ? "sucesso" : "erro",
      agendamentoId: id,
    }).catch((e) => console.warn("Erro ao notificar solicitante:", e.message));
```

- [ ] **Step 9: Atualizar `agendamentoNaoConcluidoNotificacao.test.js`**

Adicione o mock de `pushService` logo após o mock de `../database/db` (primeira linha do arquivo):

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
```

E troque o bloco final do teste (que assume `usuario_id = NULL` fixo no SQL, sem parâmetro):

```js
    const todasQueries = db.query.mock.calls.map((c) => c[0]);
    // INSERT global: usuario_id é NULL fixo no SQL (não é parâmetro), então os params
    // têm 5 posições: [empresaId, titulo, mensagem, link, agendamentoId].
    const insertGlobal = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1].length === 5
    );
    expect(insertGlobal[1][3]).toBe('/pedidos/42/fluxo'); // link

    const insertConsultor = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === 88
    );
    expect(insertConsultor).toBeTruthy();
    expect(insertConsultor[1][4]).toBe('/pedidos/42/fluxo');
```

por (agora `criarNotificacao` sempre parametriza as 8 posições: `empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id`):

```js
    const todasQueries = db.query.mock.calls.map((c) => c[0]);
    // criarNotificacao() sempre parametriza usuario_id (8 posições fixas):
    // [empresaId, usuarioId, tipo, titulo, mensagem, link, icone, agendamentoId].
    const insertGlobal = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === null
    );
    expect(insertGlobal[1][5]).toBe('/pedidos/42/fluxo'); // link

    const insertConsultor = db.query.mock.calls.find(
      (c) => c[0].includes('INSERT INTO notificacoes') && c[1][1] === 88
    );
    expect(insertConsultor).toBeTruthy();
    expect(insertConsultor[1][5]).toBe('/pedidos/42/fluxo');
```

- [ ] **Step 10: Adicionar o mock de `pushService` nos outros 4 testes que exercitam caminhos de notificação**

Em cada um dos arquivos abaixo, adicione a linha `jest.mock('../services/pushService', ...)` logo após a linha `jest.mock('../database/db', ...)` (idêntica nos 4 arquivos):

`backend/src/__tests__/agendamentoCanceladoLimpaItens.test.js`, `backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js`, `backend/src/__tests__/agendamentoStatusPreAgendado.test.js`, `backend/src/__tests__/agendamentoAprovacao.test.js`:

Troque (a primeira linha do arquivo, em cada um):

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
```

por:

```js
jest.mock('../database/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue(undefined) }));
```

- [ ] **Step 11: Rodar a suíte completa do backend e confirmar que passa**

A partir de `backend/`:

```bash
npx jest
```

Expected: todos os test suites passam (nenhuma regressão). Se algum teste fora desta lista falhar por causa da refatoração, identifique a asserção que quebrou e ajuste-a seguindo o mesmo padrão do Step 9 (a SQL agora sempre tem 8 parâmetros posicionais).

- [ ] **Step 12: Commit**

```bash
git add backend/src/services/agendamentoService.js backend/src/__tests__/agendamentoNaoConcluidoNotificacao.test.js backend/src/__tests__/agendamentoCanceladoLimpaItens.test.js backend/src/__tests__/agendamentoFotoPorItemValidacao.test.js backend/src/__tests__/agendamentoStatusPreAgendado.test.js backend/src/__tests__/agendamentoAprovacao.test.js
git commit -m "refactor(push): agendamentoService usa criarNotificacao em todos os gatilhos"
```

---

### Task 6: Refatorar `notificacoesRoutes.js` para usar `criarNotificacao`

**Files:**
- Modify: `backend/src/routes/notificacoesRoutes.js`

**Interfaces:**
- Consumes: `criarNotificacao` (Task 4).

- [ ] **Step 1: Adicionar o import**

No topo de `backend/src/routes/notificacoesRoutes.js`, troque:

```js
const express = require("express");
const db = require("../database/db");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const { isInstaladorPuro, isComercialPuro } = require("../services/permissionService");
```

por:

```js
const express = require("express");
const db = require("../database/db");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const { isInstaladorPuro, isComercialPuro } = require("../services/permissionService");
const { criarNotificacao } = require("../services/notificacaoService");
```

- [ ] **Step 2: Substituir o INSERT manual na rota POST**

Troque:

```js
      const result = await db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresa_id, usuario_id, tipo, titulo, mensagem || null, link || null, icone]
      );
      return res.status(201).json({ notificacao: result.rows[0] });
```

por:

```js
      const notificacao = await criarNotificacao({
        empresaId: empresa_id,
        usuarioId: usuario_id,
        tipo,
        titulo,
        mensagem: mensagem || null,
        link: link || null,
        icone,
      });
      return res.status(201).json({ notificacao });
```

- [ ] **Step 3: Rodar a suíte do backend e confirmar que continua passando**

```bash
npx jest
```

Expected: sem regressões (não há teste dedicado a esta rota hoje).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/notificacoesRoutes.js
git commit -m "refactor(push): notificacoesRoutes usa criarNotificacao"
```

---

### Task 7: Rotas `/api/push/*`

**Files:**
- Create: `backend/src/routes/pushRoutes.js`
- Test: `backend/src/__tests__/pushRoutes.test.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: tabela `push_subscriptions` (Task 1), `authMiddleware`.
- Produces: `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `DELETE /api/push/subscribe` — consumidos pela Task 10 (`frontend-instalador/src/services/push.js`).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `backend/src/__tests__/pushRoutes.test.js`:

```js
jest.mock('../middlewares/authMiddleware', () => (req, _res, next) => {
  req.user = { id: 7, empresa_id: 1 };
  next();
});
jest.mock('../database/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../database/db');
const router = require('../routes/pushRoutes');

const app = express();
app.use(express.json());
app.use('/api/push', router);

afterEach(() => jest.clearAllMocks());

describe('GET /api/push/vapid-public-key', () => {
  test('retorna a chave pública configurada', async () => {
    process.env.VAPID_PUBLIC_KEY = 'chave-publica-teste';
    const res = await request(app).get('/api/push/vapid-public-key');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('chave-publica-teste');
  });
});

describe('POST /api/push/subscribe', () => {
  test('400 sem endpoint/keys', async () => {
    const res = await request(app).post('/api/push/subscribe').send({});
    expect(res.status).toBe(400);
  });

  test('201 e grava subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/push/subscribe').send({
      endpoint: 'https://push.example/a',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    expect(res.status).toBe(201);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO push_subscriptions'),
      [7, 1, 'https://push.example/a', 'key', 'auth']
    );
  });
});

describe('DELETE /api/push/subscribe', () => {
  test('400 sem endpoint', async () => {
    const res = await request(app).delete('/api/push/subscribe').send({});
    expect(res.status).toBe(400);
  });

  test('200 e remove subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/push/subscribe').send({ endpoint: 'https://push.example/a' });
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM push_subscriptions'),
      ['https://push.example/a', 7]
    );
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npx jest pushRoutes -v
```

Expected: FAIL — `Cannot find module '../routes/pushRoutes'`.

- [ ] **Step 3: Implementar `pushRoutes.js`**

Crie `backend/src/routes/pushRoutes.js`:

```js
const express = require("express");
const db = require("../database/db");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

router.post("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "Subscription inválida." });
    }
    await db.query(
      `INSERT INTO push_subscriptions (usuario_id, empresa_id, endpoint, p256dh, auth, ultimo_uso)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (endpoint) DO UPDATE
         SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, ultimo_uso = NOW()`,
      [userId, empresa_id, endpoint, keys.p256dh, keys.auth]
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao salvar subscription." });
  }
});

router.delete("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: "endpoint obrigatório." });
    await db.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND usuario_id = $2`,
      [endpoint, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao remover subscription." });
  }
});

module.exports = router;
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npx jest pushRoutes -v
```

Expected: PASS — 4 testes.

- [ ] **Step 5: Registrar a rota em `server.js`**

Troque:

```js
const notificacoesRoutes = require("./src/routes/notificacoesRoutes");
```

por:

```js
const notificacoesRoutes = require("./src/routes/notificacoesRoutes");
const pushRoutes         = require("./src/routes/pushRoutes");
```

E troque:

```js
app.use("/api/notificacoes",  notificacoesRoutes);
```

por:

```js
app.use("/api/notificacoes",  notificacoesRoutes);
app.use("/api/push",          pushRoutes);
```

- [ ] **Step 6: Rodar a suíte completa do backend**

```bash
npx jest
```

Expected: todos os testes passam.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/pushRoutes.js backend/src/__tests__/pushRoutes.test.js backend/server.js
git commit -m "feat(push): adiciona rotas /api/push/vapid-public-key e /api/push/subscribe"
```

---

### Task 8: Service worker — listeners de `push` e `notificationclick`

**Files:**
- Modify: `frontend-instalador/public/sw.js`

**Interfaces:**
- Consumes: payload `{ titulo, mensagem, link, icone }` enviado por `pushService.enviarPush` (Task 3).

- [ ] **Step 1: Adicionar os listeners**

Em `frontend-instalador/public/sw.js`, depois do bloco:

```js
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_API_CACHE") {
    caches.delete(CACHE_API);
  }
});
```

adicione:

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.titulo || "Adornie", {
      body: data.mensagem || "",
      icon: "/icon-192.png",
      data: { link: data.link || "/agenda" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/agenda";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsList) => {
      const existing = clientsList.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        if ("navigate" in existing) existing.navigate(link);
        return;
      }
      return self.clients.openWindow(link);
    })
  );
});
```

- [ ] **Step 2: Verificar manualmente (sem build ainda)**

Abra `frontend-instalador/public/sw.js` e confirme visualmente que os dois `addEventListener` novos estão presentes e sintaticamente corretos (sem testes automatizados para Service Worker neste projeto).

- [ ] **Step 3: Commit**

```bash
git add frontend-instalador/public/sw.js
git commit -m "feat(push): service worker do instalador trata push e notificationclick"
```

---

### Task 9: `api.js` — método `delete`

**Files:**
- Modify: `frontend-instalador/src/services/api.js`

**Interfaces:**
- Produces: `api.delete(path: string, body?: object): Promise<any>` — consumido pela Task 10.

- [ ] **Step 1: Adicionar o método `delete`**

Em `frontend-instalador/src/services/api.js`, depois do método `put` (antes do `};` final de `export const api = {`), troque:

```js
  put: async (path, body, isFormData = false) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: getHeaders(isFormData),
        body: isFormData ? body : JSON.stringify(body),
      }),
      isFormData ? 60_000 : TIMEOUT_MS
    );
    return handleResponse(response);
  },
};
```

por:

```js
  put: async (path, body, isFormData = false) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: getHeaders(isFormData),
        body: isFormData ? body : JSON.stringify(body),
      }),
      isFormData ? 60_000 : TIMEOUT_MS
    );
    return handleResponse(response);
  },

  delete: async (path, body) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })
    );
    return handleResponse(response);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend-instalador/src/services/api.js
git commit -m "feat(api): adiciona api.delete ao client do instalador"
```

---

### Task 10: `services/push.js` — subscribe/unsubscribe no frontend

**Files:**
- Create: `frontend-instalador/src/services/push.js`

**Interfaces:**
- Consumes: `api.get/post/delete` (`./api.js`), `GET /push/vapid-public-key`, `POST /push/subscribe`, `DELETE /push/subscribe` (Task 7).
- Produces: `isPushSupported(): boolean`, `getPushStatus(): Promise<'unsupported'|'denied'|'default'|'subscribed'|'not-subscribed'>`, `subscribeToPush(): Promise<PushSubscription>`, `unsubscribeFromPush(): Promise<void>` — consumidos pelas Tasks 11 e 12.

- [ ] **Step 1: Criar o arquivo**

Crie `frontend-instalador/src/services/push.js`:

```js
import { api } from "./api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushStatus() {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "not-subscribed";
}

export async function subscribeToPush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação negada.");

  const { publicKey } = await api.get("/push/vapid-public-key");
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const raw = subscription.toJSON();
  await api.post("/push/subscribe", { endpoint: raw.endpoint, keys: raw.keys });
  return subscription;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.delete("/push/subscribe", { endpoint });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-instalador/src/services/push.js
git commit -m "feat(push): adiciona services/push.js (subscribe/unsubscribe)"
```

---

### Task 11: Toggle de notificações na tela Perfil

**Files:**
- Modify: `frontend-instalador/src/pages/Perfil.jsx`

**Interfaces:**
- Consumes: `getPushStatus`, `subscribeToPush`, `unsubscribeFromPush` (Task 10).

- [ ] **Step 1: Atualizar os imports**

Em `frontend-instalador/src/pages/Perfil.jsx`, troque:

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiLogOut, FiMail, FiBriefcase, FiUser, FiSun, FiMoon, FiCamera } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
```

por:

```jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiLogOut, FiMail, FiBriefcase, FiUser, FiSun, FiMoon, FiCamera, FiBell, FiBellOff } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../services/api";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "../services/push";
import TopBar from "../components/TopBar";
```

- [ ] **Step 2: Adicionar estado e efeito de carregamento do status**

Troque:

```jsx
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState("");

  function handleLogout() {
```

por:

```jsx
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  const [pushStatus, setPushStatus] = useState("default");
  const [pushErro, setPushErro] = useState("");
  const [pushCarregando, setPushCarregando] = useState(false);

  useEffect(() => {
    getPushStatus().then(setPushStatus).catch(() => setPushStatus("unsupported"));
  }, []);

  async function handleTogglePush() {
    setPushErro("");
    setPushCarregando(true);
    try {
      if (pushStatus === "subscribed") {
        await unsubscribeFromPush();
        setPushStatus("not-subscribed");
      } else {
        await subscribeToPush();
        setPushStatus("subscribed");
      }
    } catch (err) {
      setPushErro(err.message || "Erro ao atualizar notificações.");
      const status = await getPushStatus().catch(() => "unsupported");
      setPushStatus(status);
    } finally {
      setPushCarregando(false);
    }
  }

  function handleLogout() {
```

- [ ] **Step 3: Adicionar o botão de toggle na tela**

Troque:

```jsx
        <button className="btn btn-block" style={{ marginBottom: "var(--space-1)" }} onClick={toggleTheme}>
          {theme === "dark" ? <FiSun /> : <FiMoon />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>

        <button className="btn btn-danger btn-block" onClick={handleLogout}>
          <FiLogOut /> Sair
        </button>
```

por:

```jsx
        <button className="btn btn-block" style={{ marginBottom: "var(--space-1)" }} onClick={toggleTheme}>
          {theme === "dark" ? <FiSun /> : <FiMoon />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>

        {pushStatus !== "unsupported" && (
          <>
            {pushErro && <p style={{ color: "var(--color-danger)", fontSize: 12, margin: "0 0 8px" }}>{pushErro}</p>}
            <button
              className="btn btn-block"
              style={{ marginBottom: "var(--space-1)" }}
              onClick={handleTogglePush}
              disabled={pushCarregando || pushStatus === "denied"}
            >
              {pushStatus === "subscribed" ? <FiBellOff /> : <FiBell />}
              {pushStatus === "denied"
                ? "Notificações bloqueadas pelo navegador"
                : pushStatus === "subscribed"
                ? "Desativar notificações"
                : "Ativar notificações"}
            </button>
          </>
        )}

        <button className="btn btn-danger btn-block" onClick={handleLogout}>
          <FiLogOut /> Sair
        </button>
```

- [ ] **Step 4: Commit**

```bash
git add frontend-instalador/src/pages/Perfil.jsx
git commit -m "feat(push): toggle de notificações na tela Perfil"
```

---

### Task 12: Limpar subscription no logout

**Files:**
- Modify: `frontend-instalador/src/context/AuthContext.jsx`

**Interfaces:**
- Consumes: `unsubscribeFromPush` (Task 10).

- [ ] **Step 1: Importar e chamar no logout**

Em `frontend-instalador/src/context/AuthContext.jsx`, troque:

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API_BASE } from "../services/api";
```

por:

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API_BASE } from "../services/api";
import { unsubscribeFromPush } from "../services/push";
```

E troque:

```jsx
  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
  }, []);
```

por:

```jsx
  const logout = useCallback(() => {
    unsubscribeFromPush().catch(() => {});
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add frontend-instalador/src/context/AuthContext.jsx
git commit -m "feat(push): remove subscription de push ao deslogar"
```

---

### Task 13: Verificação manual end-to-end

Não há como testar Web Push real via Jest (depende de Service Worker + permissão do navegador). Esta etapa é manual.

- [ ] **Step 1: Build de produção do instalador**

```bash
cd frontend-instalador
npm run build
npm run preview
```

Expected: serve a build em `http://localhost:4173` (ou porta indicada).

- [ ] **Step 2: Subir o backend com as chaves VAPID configuradas**

```bash
cd backend
npm run dev
```

Confirme nos logs que não há erro relacionado a `web-push`.

- [ ] **Step 3: Ativar notificações**

No navegador, acesse o preview, faça login como instalador, vá em Perfil → "Ativar notificações" → aceite a permissão do navegador.

Expected: botão muda para "Desativar notificações"; uma linha aparece em `push_subscriptions` no banco local (`SELECT * FROM push_subscriptions;`).

- [ ] **Step 4: Disparar um evento real**

Como admin/operador (no `frontend-web`), altere o status de um agendamento em que esse instalador esteja na equipe (ou crie um novo agendamento com ele).

Expected: uma notificação do sistema operacional aparece (mesmo com a aba do instalador em segundo plano ou fechada). Clicar nela abre/foca o app na rota `/agenda/<id>` do agendamento correspondente.

- [ ] **Step 5: Testar desativação**

Em Perfil, clique em "Desativar notificações".

Expected: a linha correspondente é removida de `push_subscriptions`; novas mudanças no mesmo agendamento não geram mais push (mas continuam aparecendo normalmente no `frontend-web`).

- [ ] **Step 6: Registrar o resultado**

Depois do teste manual, relate ao usuário se tudo funcionou como esperado ou o que precisou de ajuste — não há commit nesta etapa.

---

### Task 14: Migrar `crewService.js` e `veiculoService.js` para `criarNotificacao`

> Adicionada após a revisão final de branch das Tasks 1-12: a revisão encontrou dois pontos fora do escopo original do plano que ainda inserem notificação direto em `notificacoes` (sem passar por `criarNotificacao`), logo sem disparar push. `crewService.notificarMembrosCrew` notifica cada instalador quando é colocado numa equipe — público-alvo direto deste recurso. `veiculoService` notifica admins/operadores sobre abastecimento — público menos relevante para push, mas migrado por consistência (mesmo padrão, mesmo arquivo central). Execute esta task antes do teste manual da Task 13, para que o teste manual já cubra o comportamento final.

**Files:**
- Modify: `backend/src/services/crewService.js`
- Modify: `backend/src/services/veiculoService.js`

**Interfaces:**
- Consumes: `criarNotificacao` (Task 4).

- [ ] **Step 1: Refatorar `crewService.notificarMembrosCrew`**

Em `backend/src/services/crewService.js`, troque:

```js
const db = require("../database/db");
```

por:

```js
const db = require("../database/db");
const { criarNotificacao } = require("./notificacaoService");
```

E troque:

```js
    await db.query(
      `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone)
       VALUES ($1,$2,'info',$3,$4,'/agendamentos/mapa','🚗')`,
      [empresaId, membro.usuario_id, `Equipe formada — ${dataFmt}`, mensagem]
    ).catch(() => {});
```

por:

```js
    await criarNotificacao({
      empresaId,
      usuarioId: membro.usuario_id,
      tipo: "info",
      titulo: `Equipe formada — ${dataFmt}`,
      mensagem,
      link: "/agendamentos/mapa",
      icone: "🚗",
    }).catch(() => {});
```

- [ ] **Step 2: Refatorar a notificação de abastecimento em `veiculoService.js`**

Em `backend/src/services/veiculoService.js`, troque:

```js
const db = require("../database/db");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
```

por:

```js
const db = require("../database/db");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { criarNotificacao } = require("./notificacaoService");
```

E troque:

```js
  await Promise.all(
    admins.rows.map((admin) =>
      db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem)
         VALUES ($1,$2,'info',$3,$4)`,
        [empresaId, admin.id, tituloNotif, mensagemNotif]
      ).catch(() => {})
    )
  );
```

por:

```js
  await Promise.all(
    admins.rows.map((admin) =>
      criarNotificacao({
        empresaId,
        usuarioId: admin.id,
        tipo: "info",
        titulo: tituloNotif,
        mensagem: mensagemNotif,
      }).catch(() => {})
    )
  );
```

- [ ] **Step 3: Rodar a suíte completa do backend**

A partir de `backend/`:

```bash
npx jest
```

Expected: todos os testes continuam passando (não há teste dedicado a `notificarMembrosCrew` ou à notificação de abastecimento hoje).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/crewService.js backend/src/services/veiculoService.js
git commit -m "refactor(push): crewService e veiculoService usam criarNotificacao"
```
