# Plano — PWA de Instaladores

Spec: `docs/superpowers/specs/2026-06-14-pwa-instaladores-design.md`

## Passos

1. **Scaffold do pacote `frontend-instalador/`**
   - `package.json` (React 19, react-router-dom, react-leaflet+leaflet, vite, @vitejs/plugin-react, vite-plugin-pwa)
   - `vite.config.js` com `VitePWA` (manifest + workbox runtime caching)
   - `index.html`, `.env` / `.env.example` (`VITE_API_URL=http://localhost:3001`)
   - `.gitignore` (node_modules, dist, .env)

2. **CSS base**
   - `src/styles/theme.css` (subconjunto das variáveis de `frontend-web/src/styles/theme.css`, modo dark fixo)
   - `src/styles/app.css` (layout mobile-first, bottom nav, cards, botões, badges de status)

3. **Camada de API e autenticação**
   - `src/services/api.js` (igual padrão do frontend-web: GET/POST/PUT/DELETE com FormData, timeout, 401 → evento)
   - `src/context/AuthContext.jsx` (login, logout, usuário atual, valida permissão INSTALADOR)
   - `src/pages/Login.jsx`

4. **Layout e roteamento**
   - `src/components/Layout.jsx` + `src/components/BottomNav.jsx`
   - `src/components/PrivateRoute.jsx`
   - `src/App.jsx` com rotas: `/login`, `/`, `/agenda`, `/agenda/:id`, `/rotas`, `/abastecimento`, `/perfil`

5. **Página Home** (`src/pages/Home.jsx`)
   - Saudação, atalhos, resumo dos próximos agendamentos (`GET /api/agendamentos?usuario_id=`)

6. **Página Agenda** (`src/pages/Agenda.jsx`)
   - Lista + filtro de período, badges de status, navegação para detalhe

7. **Página Detalhe do Agendamento** (`src/pages/AgendamentoDetalhe.jsx`)
   - Dados do agendamento, galeria de anexos, upload de fotos, botões de status (iniciar/concluir/não concluído), link "Abrir no mapa"

8. **Página Rotas** (`src/pages/Rotas.jsx`)
   - Mapa Leaflet com marcadores dos agendamentos com lat/lng + lista de "sem localização"

9. **Página Abastecimento** (`src/pages/Abastecimento.jsx`)
   - Seleção de veículo, formulário de abastecimento, histórico recente

10. **Página Perfil** (`src/pages/Perfil.jsx`)
    - Dados do usuário + logout

11. **PWA: manifest + ícones + service worker**
    - Gerar `public/icon-192.png` e `public/icon-512.png` (fundo + logo Adornie)
    - Configurar manifest no `vite.config.js`

12. **Verificação**
    - `npm install`
    - `npm run build`
    - Corrigir erros de build/lint até passar

13. **Commit**
    - Um commit cobrindo o novo pacote `frontend-instalador/` + docs de spec/plano

## Observações

- Nenhuma alteração em `backend/` ou `frontend-web/` é necessária — todos os endpoints já existem.
- Teste manual no navegador fica pendente para o usuário (registrar em memória ao final).
