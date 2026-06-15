# Migração para VPS Hostinger — Design

## Contexto

Hoje o sistema está distribuído em três provedores:

- **Backend** (`backend/`, Express + PostgreSQL): hospedado no Render (`sistema-operon-api`, ver `render.yaml`), acessível em `https://operon-sistema.onrender.com`.
- **Frontend web** (`frontend-web/`, React + Vite): hospedado no Vercel, com `VITE_API_URL` apontando para o Render.
- **Frontend instalador** (`frontend-instalador/`, React + Vite, PWA): criado recentemente, ainda sem deploy.
- **Banco de dados**: Supabase (PostgreSQL), acessado via `DATABASE_URL`.

O usuário tem um VPS na Hostinger com acesso root via SSH e o domínio `adorniehomedecor.com`. O objetivo é mover backend, frontend-web e frontend-instalador para esse VPS, mantendo o Supabase como banco (sem alterações no banco).

## Objetivo

Servir as três aplicações através de subdomínios de `adorniehomedecor.com`, com Nginx fazendo proxy reverso/servindo estáticos, PM2 mantendo o processo Node do backend no ar, e HTTPS via Let's Encrypt (certbot). O Render e o Vercel continuam ativos durante a validação; o corte de DNS final e a desativação dos serviços antigos são decisões do usuário, feitas depois da validação.

## Domínios

| Subdomínio | Aplicação | Tipo |
|---|---|---|
| `api.adorniehomedecor.com` | `backend/` | Proxy reverso → Node/PM2 na porta 3001 |
| `sistema.adorniehomedecor.com` | `frontend-web/` | Estático (build Vite, SPA) |
| `campo.adorniehomedecor.com` | `frontend-instalador/` | Estático (build Vite, SPA + PWA) |

## Arquitetura

```
Internet
   |
   v
Nginx (portas 80/443, certbot)
   |-- api.adorniehomedecor.com     -> proxy_pass http://127.0.0.1:3001  (backend via PM2)
   |-- sistema.adorniehomedecor.com -> /var/www/sistema-adornie/frontend-web/dist (SPA fallback)
   \-- campo.adorniehomedecor.com   -> /var/www/sistema-adornie/frontend-instalador/dist (SPA fallback)

PM2 -> node backend/server.js (auto-restart, sobe no boot via "pm2 startup")
Supabase -> banco Postgres (sem alterações; DATABASE_URL apontando pra lá)
```

## Layout de diretórios no VPS

Um único clone do repositório, usado tanto para rodar o backend quanto para gerar os builds dos frontends:

```
/var/www/sistema-adornie/
  ├── backend/
  │   ├── .env              (criado manualmente no servidor, não vai pro git)
  │   └── ...
  ├── frontend-web/
  │   ├── .env.production.local   (criado manualmente, gitignored)
  │   └── dist/              (gerado por `npm run build`)
  └── frontend-instalador/
      ├── .env.production.local   (criado manualmente, gitignored)
      └── dist/              (gerado por `npm run build`)
```

## Setup inicial do servidor

- Usuário `deploy` com privilégios sudo (operação do dia a dia não como root).
- `apt update && apt upgrade`.
- Node.js LTS via repositório NodeSource (v22).
- Nginx (`apt install nginx`).
- PM2 global (`npm i -g pm2`).
- Certbot (via snap ou apt, plugin nginx).
- Firewall `ufw`: libera `22/tcp` (SSH), `80/tcp`, `443/tcp`; demais portas bloqueadas (inclusive a 3001, que só precisa ser acessível via `127.0.0.1`).

## Backend

- `git clone <repo> /var/www/sistema-adornie`.
- `cd backend && npm install --omit=dev`.
- Criar `backend/.env` manualmente (permissões `600`), reaproveitando os mesmos valores já usados no Render (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRY`, `TOKEN_HMAC_SECRET`, `CLOUDINARY_*`, `SMTP_*`, `GOOGLE_SA_KEY_JSON`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`), com os seguintes ajustes:
  - `PORT=3001`
  - `NODE_ENV=production`
  - `TRUST_PROXY=1` (Nginx na frente)
  - `ALLOWED_ORIGINS=https://sistema.adorniehomedecor.com,https://campo.adorniehomedecor.com`
  - `FRONTEND_URL=https://sistema.adorniehomedecor.com`
- Subir com PM2: `pm2 start server.js --name sistema-api --cwd /var/www/sistema-adornie/backend`.
- `pm2 save` + `pm2 startup` (gera o serviço systemd que religa o PM2 no boot).

## Frontends (frontend-web e frontend-instalador)

Para cada um dos dois projetos:

- `npm install`.
- Criar `.env.production.local` (prioridade sobre `.env.production` no Vite, e gitignored — não interfere no build do Vercel) contendo:
  ```
  VITE_API_URL=https://api.adorniehomedecor.com
  ```
- `npm run build` → gera `dist/`, servido estaticamente pelo Nginx.

## Configuração do Nginx

Três server blocks (um arquivo por subdomínio em `/etc/nginx/sites-available/`, com symlink em `sites-enabled/`):

- **api.adorniehomedecor.com**: `proxy_pass http://127.0.0.1:3001;` com headers padrão (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) e `client_max_body_size` aumentado (o backend recebe upload de fotos/anexos via multipart — confirmar limite atual em `uploadMemory.js`, hoje 8MB, configurar Nginx com margem, ex. `15m`).
- **sistema.adorniehomedecor.com**: `root /var/www/sistema-adornie/frontend-web/dist;` com `try_files $uri $uri/ /index.html;` (SPA).
- **campo.adorniehomedecor.com**: `root /var/www/sistema-adornie/frontend-instalador/dist;` com `try_files $uri $uri/ /index.html;` e headers para não cachear `sw.js`/`manifest.webmanifest` agressivamente (evitar problemas de atualização do service worker).

## DNS

O usuário cria, no painel de DNS do domínio, três registros A apontando para o IP público do VPS:

- `api.adorniehomedecor.com`
- `sistema.adorniehomedecor.com`
- `campo.adorniehomedecor.com`

## HTTPS

Após o DNS propagar e o Nginx responder nos três subdomínios via HTTP (porta 80), rodar:

```
certbot --nginx -d api.adorniehomedecor.com -d sistema.adorniehomedecor.com -d campo.adorniehomedecor.com
```

O certbot edita os server blocks para servir HTTPS e configura renovação automática (timer systemd).

## Deploy contínuo

Script `deploy.sh` na raiz do repo no servidor (executado manualmente via SSH quando o usuário quiser publicar uma atualização):

```bash
#!/bin/bash
set -e
cd /var/www/sistema-adornie
git pull

cd backend && npm install --omit=dev && cd ..
pm2 restart sistema-api

cd frontend-web && npm install && npm run build && cd ..
cd frontend-instalador && npm install && npm run build && cd ..
```

(Os arquivos `.env` e `.env.production.local` permanecem no servidor, não são versionados, então sobrevivem ao `git pull`.)

## Plano de corte (cutover)

1. Validar os três subdomínios em produção na Hostinger (login, navegação, upload de fotos, PWA do instalador) enquanto Render/Vercel continuam no ar.
2. Quando estiver tudo validado, o usuário decide se/quando desativar o Render e o Vercel — essa migração de DNS final do app principal (se aplicável) e a desativação dos serviços antigos não são feitas automaticamente como parte deste plano.

## Considerações de CORS

O `corsOrigin` do backend (`backend/server.js`) já permite localhost automaticamente e qualquer origem listada em `ALLOWED_ORIGINS`. Os novos domínios `sistema.` e `campo.` precisam ser adicionados a essa variável (ver seção Backend acima). Se o Vercel/Render permanecerem ativos durante a transição, suas origens também devem continuar na lista até serem desativados.

## Segurança

- `backend/.env` e os `.env.production.local` dos frontends com permissão `600`, donos do usuário `deploy`.
- Acesso SSH preferencialmente por chave (não por senha) — fora do escopo configurar isso automaticamente, mas recomendado.
- `ufw` ativo, expondo apenas 22/80/443.
- Porta 3001 do backend acessível apenas via loopback (Nginx faz o proxy).

## Testes

- `pm2 status` / `pm2 logs sistema-api` para confirmar que o backend subiu sem erros.
- `nginx -t` antes de cada `systemctl reload nginx`.
- `curl -I https://api.adorniehomedecor.com/...` (endpoint de health/login) para confirmar resposta do backend via HTTPS.
- Login completo em `sistema.adorniehomedecor.com` e `campo.adorniehomedecor.com`, testando upload de fotos/anexos (valida `client_max_body_size` e CORS).
- No instalador: confirmar que o service worker registra em `https://campo.adorniehomedecor.com` (contexto seguro) e que o manifest/ícones carregam corretamente.

## Fora do escopo

- Docker / docker-compose.
- CI/CD automático (GitHub Actions ou similar).
- Qualquer alteração no banco de dados Supabase.
- Alterações no app mobile (Flutter).
- Desativação automática do Render/Vercel.
- Configuração de e-mail/SMTP além de copiar as variáveis já existentes.
