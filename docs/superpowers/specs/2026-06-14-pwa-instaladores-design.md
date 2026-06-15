# PWA de Instaladores — Spec

## Contexto

O sistema Adornie (monorepo: `backend/` Express+Postgres, `frontend-web/` React+Vite ERP completo,
`mobile/` Flutter) já modela o perfil **INSTALADOR** com permissões e endpoints prontos:
agendamentos (com lat/lng), veículos/abastecimentos, anexos de fotos via Cloudinary.

Falta uma interface leve, instalável (PWA), focada apenas nas tarefas de campo do instalador —
sem expor o restante do ERP.

## Objetivo

Criar um novo app **`frontend-instalador/`** (Vite + React + vite-plugin-pwa), consumindo a mesma
API do backend, com 5 funcionalidades:

1. **Login** — autenticação com a mesma API (`/api/auth/login`), restrito a usuários com permissão `INSTALADOR`.
2. **Ver agendamentos** — lista dos agendamentos do instalador (equipe), agrupados por data, com detalhe.
3. **Ver rotas** — mapa (Leaflet) com os agendamentos do dia/futuros que possuem lat/lng, com link para navegação externa (Google Maps).
4. **Abastecer veículos** — formulário para registrar abastecimento (km, litros, valor, posto) + histórico recente.
5. **Iniciar/concluir demandas + anexar fotos** — no detalhe do agendamento: botões "Iniciar atendimento", "Concluir" e "Não foi possível concluir" (usando `PUT /api/agendamentos/:id/status`), e anexar fotos a qualquer momento (`POST /api/agendamentos/:id/anexos`).

## Não-objetivos

- Sem CRUD de clientes, pedidos, produtos, kanban, relatórios.
- Sem sincronização offline de escrita (fila de ações offline). O PWA cacheia leituras (agenda, mapa)
  via service worker para visualização offline, mas ações (abastecimento, status, fotos) exigem rede.
- Sem app nativo separado — é um PWA instalável via navegador (Add to Home Screen).

## Arquitetura

- Novo pacote `frontend-instalador/` no monorepo, independente do `frontend-web/` (não compartilha
  build, mas reaproveita as mesmas variáveis de tema/cores via `theme.css` copiado e reduzido).
- Stack: React 19 + Vite + `react-router-dom` + `vite-plugin-pwa` (manifest + service worker via
  `generateSW`, `registerType: 'autoUpdate'`).
- Auth: mesmo fluxo do frontend-web — `POST /api/auth/login` → `localStorage` (`token`, `user`).
  Após login, valida `user.permissoes.includes("INSTALADOR")`; caso contrário, bloqueia acesso com
  mensagem ("Este aplicativo é exclusivo para a equipe de instalação.") e oferece logout.
- API base: `import.meta.env.VITE_API_URL` (mesmo padrão do frontend-web), default
  `http://localhost:3001`.

## Telas e fluxo

### Layout
- Mobile-first, largura máxima ~480px centralizada em telas maiores.
- `BottomNav` fixo com 4 itens: Início, Agenda, Rotas, Abastecimento (+ acesso a Perfil/Logout pelo header).
- Header simples com título da página + avatar/nome (toque abre Perfil/Logout).

### Login (`/login`)
- Formulário email/senha → `POST /api/auth/login`.
- Verifica permissão `INSTALADOR`; se ausente, exibe aviso e bloqueia.
- Persiste token/usuário em `localStorage` (mesmas chaves do frontend-web: `token`, `user`).

### Home (`/`)
- Saudação + data.
- Cards de atalho: "Agenda de hoje" (contagem), "Ver rotas", "Abastecer veículo".
- Lista resumida dos próximos 3 agendamentos.

### Agenda (`/agenda`)
- `GET /api/agendamentos?usuario_id=<user.id>`, ordenado por data/hora.
- Filtro simples por período: Hoje / Próximos 7 dias / Todos.
- Cada item: data/hora, título, cliente, endereço, badge de status (cores conforme `theme.css`).
- Toque → `/agenda/:id`.

### Detalhe do Agendamento (`/agenda/:id`)
- `GET /api/agendamentos/:id`.
- Exibe: cliente, endereço completo, descrição, observações, itens, equipe.
- Botão "Abrir no mapa" → deep link Google Maps (`https://www.google.com/maps/dir/?api=1&destination=...`)
  usando lat/lng (ou endereço como fallback).
- Galeria de anexos existentes (fotos).
- Upload de fotos via `<input type="file" accept="image/*" capture="environment" multiple>` →
  `POST /api/agendamentos/:id/anexos` (FormData `arquivos`).
- Ações de status (somente os status permitidos a INSTALADOR: `andamento`, `concluido`, `nao_concluido`):
  - status atual `agendado|pre_agendado|atrasado` → botão **"Iniciar atendimento"** → `PUT /:id/status` com `status=andamento` (FormData, fotos opcionais).
  - status atual `andamento` → botões **"Concluir"** (`status=concluido`) e **"Não foi possível concluir"** (`status=nao_concluido`, exige campo `motivo`), ambos podem anexar fotos no mesmo request.
  - status `concluido|nao_concluido|cancelado` → somente leitura (sem botões de ação, exceto anexar fotos).

### Rotas (`/rotas`)
- Reaproveita `react-leaflet` (já usado no frontend-web).
- `GET /api/agendamentos?usuario_id=<user.id>` filtrando por `data_inicio=hoje` (e opção "próximos 7 dias").
- Marcadores para agendamentos com `lat`/`lng`; popup com título/cliente/endereço/horário e botão "Navegar" (deep link Google Maps) + botão "Detalhes" (→ `/agenda/:id`).
- Agendamentos sem coordenadas aparecem em lista abaixo do mapa com aviso "sem localização".

### Abastecimento (`/abastecimento`)
- Seletor de veículo (`GET /api/veiculos`).
- Formulário: data (default hoje), km atual, litros, valor total, combustível, posto, observações →
  `POST /api/veiculos/:id/abastecimentos`.
- Histórico recente do veículo selecionado (`GET /api/veiculos/:id/abastecimentos`, últimos 5).

### Perfil (`/perfil`)
- Nome, e-mail, empresa (se disponível em `user`), botão "Sair" (limpa `localStorage` e volta ao login).

## PWA / Offline

- `vite-plugin-pwa` com `manifest`:
  - `name`: "Adornie Instalador", `short_name`: "Instalador"
  - `theme_color`: `#0E0D0B`, `background_color`: `#0E0D0B`
  - `display`: `standalone`, `orientation`: `portrait`
  - ícones 192x192 e 512x512 gerados a partir do logo Adornie (fundo escuro + logo centralizado).
- Service worker (`generateSW`):
  - Cache estático dos assets do app shell (padrão do plugin).
  - Runtime caching `NetworkFirst` para `GET /api/agendamentos*` e `GET /api/veiculos*` (permite ver
    agenda/veículos offline com dados da última sincronização).
  - Tiles do Leaflet/OSM com `CacheFirst` (expiração razoável) para o mapa funcionar parcialmente offline.

## Tratamento de erros

- Reaproveita o padrão do `frontend-web/src/services/api.js` (timeout, 401 → evento `auth:unauthorized`
  → redireciona para `/login`).
- Erros de rede em telas com cache (Agenda, Rotas) mostram banner "Mostrando dados salvos — sem conexão".
- Erros em ações de escrita (abastecimento, status, fotos) mostram mensagem inline e não navegam.

## Testes / verificação

- `npm run build` no novo pacote precisa concluir sem erros.
- Teste manual no navegador (login com usuário INSTALADOR, navegar pelas 5 telas) — a ser feito pelo
  usuário, registrado como pendência (igual outros módulos recentes do projeto).

## Escopo de implementação

Um único pacote novo (`frontend-instalador/`), sem alterações no backend (todos os endpoints
necessários já existem) e sem alterações no `frontend-web/`. Plano de implementação cobre todas as
telas listadas acima em uma única fase, dado o tamanho moderado e a forte reutilização de padrões já
existentes no `frontend-web/`.
