# Deploy VPS Hostinger — Plano de Implementação

> **Runbook manual:** este plano é executado pelo **usuário via SSH no VPS da Hostinger**, não por um agente. Marque cada checkbox conforme for executando. Claude está disponível nesta sessão para ajudar se algo der errado — basta colar a mensagem de erro.

**Goal:** Deploy de backend (Express), frontend-web (React/Vite) e frontend-instalador (PWA React/Vite) no VPS Hostinger, acessíveis via `api.adorniehomedecor.com`, `sistema.adorniehomedecor.com` e `campo.adorniehomedecor.com`, com HTTPS automático via Let's Encrypt.

**Architecture:** Nginx como proxy reverso e servidor de arquivos estáticos; PM2 gerencia o processo Node do backend na porta local 3001 (não exposta); builds Vite de ambos os frontends servidos como arquivos estáticos com fallback SPA; banco permanece no Supabase (sem alterações).

**Tech Stack:** Ubuntu 22/24 LTS, Node 22 (NodeSource), Nginx, PM2, Certbot (snap), ufw, git, Vite.

**Spec de referência:** `docs/superpowers/specs/2026-06-15-deploy-hostinger-vps-design.md`

---

## Task 1: Criar registros DNS

> Feito no **painel web** do seu provedor de DNS (Hostinger hPanel → Domains → adorniehomedecor.com → DNS Zone Editor — ou Cloudflare/outro, onde quer que o DNS do domínio esteja gerenciado). Sem SSH neste passo.

- [ ] No hPanel da Hostinger → VPS → visão geral, anote o **IP público do VPS** (formato `xxx.xxx.xxx.xxx`).

- [ ] No gerenciador de DNS do domínio, crie **3 registros do tipo A** com TTL 300 (ou o mínimo disponível), todos apontando para o mesmo IP:

  | Hostname  | Tipo | Valor          |
  |-----------|------|----------------|
  | `api`     | A    | `<IP_DO_VPS>`  |
  | `sistema` | A    | `<IP_DO_VPS>`  |
  | `campo`   | A    | `<IP_DO_VPS>`  |

- [ ] Verificar propagação no terminal **local** (não no VPS):

  ```bash
  nslookup api.adorniehomedecor.com
  # Expected: retorna o IP do VPS
  ```

  Pode levar de segundos a alguns minutos. **Só avance para a Task 6 (certbot) depois que isso resolver.**

---

## Task 2: Setup inicial do servidor

> Todos os comandos a seguir são executados **no VPS via SSH**. Conecte como root:
> ```bash
> ssh root@<IP_DO_VPS>
> ```

- [ ] Atualizar pacotes do sistema:

  ```bash
  apt update && apt upgrade -y
  ```

  Expected: processo longo sem erros críticos. Reinicie se pedir: `reboot`, reconecte.

- [ ] Criar usuário `deploy` com sudo (operação do dia a dia sem root):

  ```bash
  adduser deploy
  # Pede senha — defina uma forte e guarde
  usermod -aG sudo deploy
  ```

- [ ] Instalar Node.js 22 LTS via NodeSource:

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  apt-get install -y nodejs
  node -v
  # Expected: v22.x.x
  npm -v
  # Expected: 10.x.x ou superior
  ```

- [ ] Instalar PM2 globalmente:

  ```bash
  npm install -g pm2
  pm2 -v
  # Expected: 5.x.x ou superior
  ```

- [ ] Instalar Nginx:

  ```bash
  apt install -y nginx
  systemctl enable nginx
  systemctl start nginx
  systemctl status nginx
  # Expected: "active (running)"
  ```

- [ ] Instalar Certbot via snap:

  ```bash
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
  certbot --version
  # Expected: certbot 2.x.x ou superior
  ```

- [ ] Configurar firewall ufw:

  ```bash
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable
  ufw status
  # Expected: Status: active
  # 22/tcp   ALLOW
  # 80/tcp   ALLOW
  # 443/tcp  ALLOW
  ```

---

## Task 3: Clonar repositório e configurar backend

- [ ] Clonar o repositório no VPS:

  ```bash
  mkdir -p /var/www/sistema-adornie
  git clone https://github.com/sistemaadornie/Sistema-Adornie.git /var/www/sistema-adornie
  cd /var/www/sistema-adornie
  git log --oneline -3
  # Expected: últimos commits incluindo o da PWA
  ```

- [ ] Instalar dependências do backend (somente produção):

  ```bash
  cd /var/www/sistema-adornie/backend
  npm install --omit=dev
  ```

  Expected: sem erros; warnings de `npm fund` podem ser ignorados.

- [ ] Criar o arquivo `.env` do backend com os valores de produção:

  ```bash
  nano /var/www/sistema-adornie/backend/.env
  ```

  Cole e preencha cada variável (copie os valores do painel Render → Environment Variables):

  ```env
  PORT=3001
  NODE_ENV=production
  TRUST_PROXY=1

  # — Copiar do Render (Environment Variables) —
  DATABASE_URL=
  JWT_SECRET=
  JWT_EXPIRY=1d
  TOKEN_HMAC_SECRET=
  CLOUDINARY_CLOUD_NAME=
  CLOUDINARY_API_KEY=
  CLOUDINARY_API_SECRET=
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=
  SMTP_PASS=
  SMTP_FROM=

  # — Google Drive (JSON da Service Account) —
  # Se o valor contiver aspas/quebras de linha, envolva com aspas simples:
  # GOOGLE_SA_KEY_JSON='{"type":"service_account","project_id":"...","private_key":"...",...}'
  GOOGLE_SA_KEY_JSON=
  GOOGLE_DRIVE_ROOT_FOLDER_ID=

  # — Valores específicos para Hostinger —
  ALLOWED_ORIGINS=https://sistema.adorniehomedecor.com,https://campo.adorniehomedecor.com
  FRONTEND_URL=https://sistema.adorniehomedecor.com
  ```

  Salvar: `Ctrl+O` → `Enter` → `Ctrl+X`.

- [ ] Restringir permissões do `.env`:

  ```bash
  chmod 600 /var/www/sistema-adornie/backend/.env
  ls -la /var/www/sistema-adornie/backend/.env
  # Expected: -rw------- 1 root root ...
  ```

- [ ] Iniciar o backend com PM2:

  ```bash
  cd /var/www/sistema-adornie/backend
  pm2 start server.js --name sistema-api
  pm2 status
  # Expected: sistema-api | online
  ```

- [ ] Confirmar que o backend subiu sem erros:

  ```bash
  pm2 logs sistema-api --lines 30 --nostream
  # Expected: "Servidor rodando na porta 3001"
  # Se aparecer erro de DATABASE_URL ou variável faltando — corrija o .env e reinicie:
  # pm2 restart sistema-api
  ```

- [ ] Salvar estado e configurar reinício automático no boot:

  ```bash
  pm2 save
  pm2 startup systemd
  ```

  O comando `pm2 startup` imprime uma linha começando com `sudo env PATH=...`. **Copie essa linha exata e execute-a no terminal.**

  ```bash
  # Expected após executar a linha copiada:
  # [PM2] Init System found: systemd
  # [PM2] To setup the Startup Script, copy/paste the following command:
  # [PM2] Freeze a process list on reboot via:
  # $ pm2 save
  ```

---

## Task 4: Build dos frontends

- [ ] Build do frontend-web:

  ```bash
  cd /var/www/sistema-adornie/frontend-web
  npm install
  echo "VITE_API_URL=https://api.adorniehomedecor.com" > .env.production.local
  npm run build
  ls dist/
  # Expected: index.html  assets/
  ```

- [ ] Build do frontend-instalador (PWA):

  ```bash
  cd /var/www/sistema-adornie/frontend-instalador
  npm install
  echo "VITE_API_URL=https://api.adorniehomedecor.com" > .env.production.local
  npm run build
  ls dist/
  # Expected: index.html  assets/  sw.js  manifest.webmanifest  icon-192.png  icon-512.png
  ```

---

## Task 5: Configurar Nginx

- [ ] Config do `api.adorniehomedecor.com`:

  ```bash
  cat > /etc/nginx/sites-available/api.adorniehomedecor.com << 'EOF'
  server {
      listen 80;
      server_name api.adorniehomedecor.com;

      client_max_body_size 15m;

      location / {
          proxy_pass http://127.0.0.1:3001;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_read_timeout 120s;
      }
  }
  EOF
  ```

- [ ] Config do `sistema.adorniehomedecor.com`:

  ```bash
  cat > /etc/nginx/sites-available/sistema.adorniehomedecor.com << 'EOF'
  server {
      listen 80;
      server_name sistema.adorniehomedecor.com;

      root /var/www/sistema-adornie/frontend-web/dist;
      index index.html;

      location / {
          try_files $uri $uri/ /index.html;
      }

      location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
          expires 1y;
          add_header Cache-Control "public, immutable";
      }
  }
  EOF
  ```

- [ ] Config do `campo.adorniehomedecor.com`:

  ```bash
  cat > /etc/nginx/sites-available/campo.adorniehomedecor.com << 'EOF'
  server {
      listen 80;
      server_name campo.adorniehomedecor.com;

      root /var/www/sistema-adornie/frontend-instalador/dist;
      index index.html;

      location / {
          try_files $uri $uri/ /index.html;
      }

      # Service worker e manifest sem cache agressivo (permite atualização do PWA)
      location ~* (sw\.js|manifest\.webmanifest)$ {
          add_header Cache-Control "no-cache";
          expires 0;
      }

      location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
          expires 1y;
          add_header Cache-Control "public, immutable";
      }
  }
  EOF
  ```

- [ ] Ativar as configs e remover o default do Nginx:

  ```bash
  ln -s /etc/nginx/sites-available/api.adorniehomedecor.com /etc/nginx/sites-enabled/
  ln -s /etc/nginx/sites-available/sistema.adorniehomedecor.com /etc/nginx/sites-enabled/
  ln -s /etc/nginx/sites-available/campo.adorniehomedecor.com /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  ```

- [ ] Testar sintaxe e recarregar Nginx:

  ```bash
  nginx -t
  # Expected: nginx: configuration file /etc/nginx/nginx.conf test is successful
  systemctl reload nginx
  ```

- [ ] Verificar que os 3 subdomínios respondem via HTTP (DNS já deve ter propagado):

  ```bash
  curl -sI http://api.adorniehomedecor.com
  # Expected: HTTP/1.1 400 ou similar (backend respondendo, rota /api/ não existe direto)

  curl -sI http://sistema.adorniehomedecor.com
  # Expected: HTTP/1.1 200 com Content-Type: text/html

  curl -sI http://campo.adorniehomedecor.com
  # Expected: HTTP/1.1 200 com Content-Type: text/html
  ```

  Se algum retornar `000` (sem resposta) ou `502`, ver seção de troubleshooting abaixo.

---

## Task 6: HTTPS com Let's Encrypt

> **Pré-requisito:** DNS da Task 1 precisa ter propagado. Confirme com `nslookup api.adorniehomedecor.com` retornando o IP do VPS antes de continuar.

- [ ] Emitir certificado SSL para os 3 subdomínios de uma vez:

  ```bash
  certbot --nginx \
    -d api.adorniehomedecor.com \
    -d sistema.adorniehomedecor.com \
    -d campo.adorniehomedecor.com \
    --email SEU_EMAIL@exemplo.com \
    --agree-tos \
    --non-interactive
  ```

  Substitua `SEU_EMAIL@exemplo.com` pelo seu e-mail real (recebe avisos de renovação).

  Expected:
  ```
  Congratulations! Your certificate and chain have been saved at:
  /etc/letsencrypt/live/api.adorniehomedecor.com/fullchain.pem
  ```

  O certbot edita automaticamente os server blocks do Nginx para HTTPS e redirecionar HTTP → HTTPS.

- [ ] Confirmar HTTPS funcionando nos 3:

  ```bash
  curl -sI https://api.adorniehomedecor.com
  # Expected: HTTP/2 400 (backend vivo, sem SSL error)

  curl -sI https://sistema.adorniehomedecor.com
  # Expected: HTTP/2 200

  curl -sI https://campo.adorniehomedecor.com
  # Expected: HTTP/2 200
  ```

- [ ] Testar renovação automática (simulação — não altera nada):

  ```bash
  certbot renew --dry-run
  # Expected: "Congratulations, all simulated renewals succeeded"
  ```

---

## Task 7: Verificação completa

- [ ] Checar PM2 e logs do backend:

  ```bash
  pm2 status
  # Expected: sistema-api | online | 0 restarts (ou poucos, de boot)
  pm2 logs sistema-api --lines 50 --nostream
  # Procurar por erros de banco, JWT ou Cloudinary
  ```

- [ ] Abrir `https://sistema.adorniehomedecor.com` no navegador: tela de login do sistema deve carregar. Fazer login com uma conta válida e navegar pelas telas principais.

- [ ] Abrir `https://campo.adorniehomedecor.com` no navegador (ou celular): tela de login do PWA instalador deve aparecer. Fazer login com uma conta que tenha permissão **INSTALADOR**.

- [ ] Testar upload de foto/anexo num agendamento no PWA do instalador — confirma CORS (`ALLOWED_ORIGINS`) e `client_max_body_size` 15m no Nginx.

- [ ] No **celular**, em `https://campo.adorniehomedecor.com`:
  - Chrome (Android): botão "Adicionar à tela inicial" ou banner de instalação deve aparecer.
  - DevTools → Application → Service Workers → confirmar que `sw.js` está registrado e ativo.
  - DevTools → Application → Manifest → confirmar nome "Adornie Instalador" e ícones.

---

## Task 8: Script de deploy para atualizações futuras

Toda vez que houver um novo commit na branch `main`, você vai:
1. SSHar no VPS
2. Rodar o script abaixo

- [ ] Criar o script `/var/www/sistema-adornie/deploy.sh` no servidor:

  ```bash
  cat > /var/www/sistema-adornie/deploy.sh << 'EOF'
  #!/bin/bash
  set -e

  echo "[1/5] Atualizando código..."
  cd /var/www/sistema-adornie
  git pull

  echo "[2/5] Backend..."
  cd /var/www/sistema-adornie/backend
  npm install --omit=dev
  pm2 restart sistema-api

  echo "[3/5] Build frontend-web..."
  cd /var/www/sistema-adornie/frontend-web
  npm install
  npm run build

  echo "[4/5] Build frontend-instalador..."
  cd /var/www/sistema-adornie/frontend-instalador
  npm install
  npm run build

  echo "[5/5] Recarregando Nginx..."
  nginx -t && systemctl reload nginx

  echo ""
  echo "Deploy concluído! $(date)"
  pm2 status
  EOF

  chmod +x /var/www/sistema-adornie/deploy.sh
  ```

- [ ] Testar o script (seguro: apenas faz git pull + rebuild do que já está no servidor):

  ```bash
  /var/www/sistema-adornie/deploy.sh
  ```

  Expected: sequência `[1/5]` até `[5/5]`, `"Deploy concluído!"`, tabela do `pm2 status` sem erros.

- [ ] Para deploys futuros, o fluxo é sempre:

  ```bash
  # Na máquina local: commitar e dar push
  git push origin main

  # No VPS via SSH:
  /var/www/sistema-adornie/deploy.sh
  ```

---

## Troubleshooting rápido

| Sintoma | Diagnóstico | Correção |
|---------|-------------|----------|
| `curl` retorna `502 Bad Gateway` na api | PM2 caiu ou não iniciou | `pm2 status`, `pm2 logs sistema-api` |
| `curl` retorna `000` (connection refused) | Nginx não carregou a config | `nginx -t`, `systemctl status nginx` |
| Erro de CORS no browser (XMLHttpRequest) | `ALLOWED_ORIGINS` incorreto no `.env` | Editar `.env`, `pm2 restart sistema-api` |
| Certbot falha com "Could not bind to port 80" | Nginx bloqueando certbot | `systemctl stop nginx`, rodar certbot standalone, `systemctl start nginx` |
| `npm run build` falha no frontend | Faltou `.env.production.local` | Confirmar que o arquivo existe com `cat .env.production.local` |
| Service worker não registra no campo. | Acesso via HTTP, não HTTPS | Confirmar que está em `https://`, não `http://` |
