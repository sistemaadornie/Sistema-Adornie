# Push Notifications no PWA do Instalador — Spec

## Contexto

O backend já tem um sistema de notificações in-app completo:

- Tabela `notificacoes` (`empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, lida, agendamento_id, criado_em`).
- `GET/POST/PUT/DELETE /api/notificacoes` (`backend/src/routes/notificacoesRoutes.js`), já com filtro correto
  para instaladores (só veem notificações endereçadas a eles, nunca as globais de admin).
- `agendamentoService.js` já dispara notificações em ~9 pontos (criação de agendamento, mudança de status,
  aprovação, etc.), via `notificarEquipe()`, `notificarAdminsAprovacao()` e alguns `INSERT INTO notificacoes`
  inline — todos escrevendo direto na tabela, sem nenhum canal além do polling in-app.
- `frontend-web` já consome isso com sino + badge + drawer (`NotificacaoBell.jsx`, `NotificacoesDrawer.jsx`,
  `NotificacoesContext.jsx`, polling de 30s).
- `frontend-instalador` (PWA, ver `2026-06-14-pwa-instaladores-design.md`) **não tem nenhuma UI de notificação**
  e seu service worker (`public/sw.js`, registrado manualmente em `main.jsx` só em build de produção) só faz
  cache/offline — sem listener de `push`.

Problema: o instalador só fica sabendo de um agendamento novo/alterado se abrir o app e a tela atualizar
(polling). Fora do app, nada o avisa.

## Objetivo

Adicionar **push notifications reais (Web Push API)** no PWA do instalador, reaproveitando os mesmos
gatilhos que já alimentam a tabela `notificacoes` — sem inventar lógica de negócio nova. Quando um evento
hoje gera uma notificação in-app para um instalador, ele também recebe uma notificação do sistema operacional,
mesmo com o app fechado/em segundo plano.

## Não-objetivos

- Push para `frontend-web` (admins/operadores/vendedores) — fora de escopo agora; eles continuam só com a
  central in-app por polling que já existe.
- Notificações globais (`usuario_id = NULL`, exclusivas de admin) não geram push.
- Central de notificações in-app (sino/lista) dentro do `frontend-instalador` — não faz parte deste escopo;
  o instalador recebe a notificação do SO e, ao tocar, é levado para a tela relevante do app.
- Fila/retry sofisticado de envio — falha de push é best-effort (log + segue), sem reenvio automático.

## Arquitetura

### Backend

**Nova tabela** `push_subscriptions`:

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

Uma linha por dispositivo/navegador. Um instalador com celular + tablet tem duas linhas.

**Nova dependência:** `web-push` (npm, backend). VAPID keypair gerado uma vez (script local), guardado em
env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ex: `mailto:suporte@adornie.com`).

**`backend/src/services/pushService.js`:**
- `enviarPush(usuarioId, payload)` — busca todas as subscriptions de `usuarioId`, chama
  `webpush.sendNotification(subscription, JSON.stringify(payload))` para cada uma em paralelo
  (`Promise.allSettled`). `payload` = `{ titulo, mensagem, link, icone, agendamentoId }`.
- Se o envio falhar com status `404` ou `410` (subscription expirada/revogada), apaga a linha
  correspondente de `push_subscriptions`. Outros erros só são logados (best-effort).

**`backend/src/services/notificacaoService.js`** (novo arquivo, centraliza o que hoje está espalhado):
- `criarNotificacao({ empresaId, usuarioId, tipo, titulo, mensagem, link, icone, agendamentoId })`:
  insere em `notificacoes` (mesmo INSERT que já existe hoje, repetido ~9x) e, se `usuarioId` não for nulo,
  chama `enviarPush(usuarioId, { titulo, mensagem, link, icone, agendamentoId })` sem bloquear a resposta
  (fire-and-forget com `.catch()` para log).
- Refatorar `agendamentoService.js`: todos os pontos que hoje fazem `INSERT INTO notificacoes` direto
  (em `notificarEquipe()`, `notificarAdminsAprovacao()`, e os inline) passam a chamar `criarNotificacao()`.
  Notificações com `usuario_id = NULL` (broadcast admin) continuam só com INSERT, sem push.
- Refatorar o `POST /api/notificacoes` em `notificacoesRoutes.js` para usar a mesma função.

**Novas rotas `backend/src/routes/pushRoutes.js`** (registradas em `server.js` como `/api/push`):
- `GET /api/push/vapid-public-key` — público (sem `authMiddleware`, é só a chave pública) — retorna
  `{ publicKey: VAPID_PUBLIC_KEY }`.
- `POST /api/push/subscribe` (`authMiddleware`) — body `{ endpoint, keys: { p256dh, auth } }` — upsert
  (`ON CONFLICT (endpoint) DO UPDATE`) vinculado a `req.user.id` e `req.user.empresa_id`.
- `DELETE /api/push/subscribe` (`authMiddleware`) — body `{ endpoint }` — remove a subscription
  (chamado quando o instalador desativa o toggle, ou no logout).

### Frontend (`frontend-instalador`)

**`public/sw.js`** — adicionar (mantendo o cache/offline existente intacto):

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.titulo || "Adornie", {
      body: data.mensagem || "",
      icon: "/icons/icon-192.png",
      data: { link: data.link || "/agenda" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/agenda";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(link); return; }
      return self.clients.openWindow(link);
    })
  );
});
```

**Novo `src/services/push.js`:**
- `getPushStatus()` — retorna `'unsupported' | 'default' | 'denied' | 'subscribed' | 'not-subscribed'`
  combinando `Notification.permission` com `navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription())`.
- `subscribeToPush()` — pede permissão (`Notification.requestPermission()`); se concedida, busca a chave
  pública em `GET /push/vapid-public-key`, chama `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  e envia o resultado para `POST /push/subscribe`.
- `unsubscribeFromPush()` — `subscription.unsubscribe()` + `DELETE /push/subscribe`.

**`Perfil.jsx`** — novo botão abaixo do toggle de tema, mesmo estilo (`btn btn-block`):
- "Ativar notificações" (estado `not-subscribed`/`default`) → chama `subscribeToPush()`.
- "Desativar notificações" (estado `subscribed`) → chama `unsubscribeFromPush()`.
- Estado `denied` → botão desabilitado com texto "Notificações bloqueadas pelo navegador" (sem tentar
  reprompt, que o navegador ignora).
- Estado `unsupported` (navegador sem suporte a Push API) → botão nem aparece.

### Ambiente

- Service worker só é registrado em build de produção (`import.meta.env.PROD`, já existente em `main.jsx`)
  — então testar push localmente exige `npm run build` + `npm run preview` no `frontend-instalador`, não
  `npm run dev`.
- Migration roda manualmente nos dois bancos (local + Supabase), como já é o padrão neste projeto.

## Edge cases

- **Múltiplos dispositivos**: cada subscription é independente; falha em um não afeta os outros
  (`Promise.allSettled`).
- **Subscription expirada/revogada**: limpa automaticamente ao detectar 404/410 no envio.
- **Permissão negada**: UI reflete e não tenta repetir (impossível via API do navegador).
- **Notificação chega com app aberto em foreground**: o SO ainda mostra a notificação (comportamento
  padrão do `showNotification`); não há lógica extra para suprimir nesse caso (fora de escopo).
- **Logout**: ao deslogar, `AuthContext` chama `unsubscribeFromPush()` best-effort (não bloqueia o logout
  se falhar).

## Testes

- `backend/src/__tests__/pushService.test.js` — mocka `web-push`; valida envio para múltiplas subscriptions
  e remoção automática quando o mock retorna erro 410.
- `backend/src/__tests__/notificacaoService.test.js` — valida que `criarNotificacao` insere em `notificacoes`
  e só chama `enviarPush` quando `usuario_id` não é nulo.
- `backend/src/__tests__/pushRoutes.test.js` — testa `GET /vapid-public-key`, `POST /subscribe` (upsert),
  `DELETE /subscribe`.
- Fluxo de browser (permissão, service worker, push real) **não é testável via Jest** — validação manual
  num build de produção, idealmente num celular Android com o PWA instalado.
