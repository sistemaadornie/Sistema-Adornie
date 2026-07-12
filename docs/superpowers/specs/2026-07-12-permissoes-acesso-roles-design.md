# Permissões e Acesso por Papel — Spec

## Contexto

O sistema Adornie (monorepo: `backend/` Express+Postgres, `frontend-web/` React+Vite ERP completo,
`frontend-instalador/` PWA leve para instaladores) não tem um campo `role` na tabela `usuarios`.
O controle é feito por permissões avulsas: tabela `permissoes` (catálogo) + pivot
`usuario_permissoes`, checadas via `permissionMiddleware` no backend. Hoje existem 5 códigos
canônicos: `ADMIN_MASTER`, `GESTOR_USUARIOS`, `OPERADOR_AGENDA`, `COMERCIAL`, `INSTALADOR`.

Levantamento do estado atual (ver relatório de exploração desta sessão):

- Autenticação é quase universal (`authMiddleware` na maioria das rotas), mas autorização por
  permissão é pontual — só usuários/veículos/orçamentos/dashboard-gestor checam permissão
  explicitamente.
- Escopo por "dono do registro" (row-level) existe em só 2 lugares (`dashboardService.js`,
  `pedidoService.atualizarEtapa`), via o padrão `DASHBOARD_PEDIDOS_GERAL` + `consultor_id`. Não é
  padronizado.
- `pedidos.consultor_id` e `arquitetos.consultor_id` existem mas não são usados para filtrar
  listagens. `clientes` não tem nenhuma coluna de dono. `veiculos` também não.
- O PWA (`frontend-instalador/`) usa o **mesmo** endpoint de login do site
  (`POST /api/auth/login`) e a checagem de que o usuário tem `INSTALADOR` acontece só no
  client (`AuthContext.jsx`), depois do login já ter sido bem-sucedido no backend — não é uma
  trava de segurança real, é só UX. As rotas de API que o PWA consome (agendamentos, veículos)
  são as mesmas do ERP completo, sem `permissionMiddleware("INSTALADOR")`.
- Cadastro de usuário hoje é auto-registro (`POST /api/auth/register`, status `pendente`, sem
  permissão nenhuma) seguido de aprovação manual em `frontend-web/src/pages/Usuarios.jsx`
  (protegida por `GESTOR_USUARIOS`/`ADMIN_MASTER`), onde o admin atribui empresa/setor e
  permissões.
- Existem dois módulos paralelos de orçamento: `orcamentos`/`orcamento_itens` (mais novo, com
  wizard próprio) e `crm_orcamentos` (módulo CRM legado, `crmRoutes.js`), ambos ainda ativos.

## Objetivo

1. Impedir que instaladores acessem o sistema web (só o PWA), com trava real no backend.
2. Restringir o acesso ao PWA a apenas `ADMIN_MASTER` e `INSTALADOR`.
3. Mover o cadastro de usuário instalador para dentro do PWA (auto-registro + aprovação pelo
   admin_master no site, como já acontece hoje para outros papéis).
4. Definir e aplicar (com trava no backend, não só esconder no frontend) o que consultoras
   (`COMERCIAL`) podem e não podem fazer em cada módulo do sistema.

## Não-objetivos

- Não migra o modelo de permissões para um campo `role` único — continua sendo baseado em
  permissões avulsas.
- Não altera o comportamento de `GESTOR_USUARIOS` e `OPERADOR_AGENDA` — seguem como estão hoje.
- Não força seleção única (radio button) de permissão na tela de usuários — exclusividade de
  papel continua sendo convenção operacional, não trava de dados.
- Não faz backfill automático de `consultor_id` em registros antigos (clientes/pedidos/arquitetos)
  — isso é um passo manual, feito pelo usuário antes de ativar a trava em produção.
- Não restringe rotas para `OPERADOR_AGENDA`/`ADMIN_MASTER`/`GESTOR_USUARIOS` além do que já existe
  hoje.

## Modelo de papéis

As regras abaixo operam sobre as permissões existentes, tratando-as como papéis
conceitualmente exclusivos (um usuário deve ter só uma destas 5 permissões, por convenção):

- **admin_master** = permissão `ADMIN_MASTER`
- **consultora** = permissão `COMERCIAL`
- **instalador** = permissão `INSTALADOR`
- `GESTOR_USUARIOS` e `OPERADOR_AGENDA` = fora do escopo desta spec.

Como a exclusividade não é imposta pelos dados, a lógica de acesso é defensiva (não assume que um
usuário tem exatamente uma permissão):

- **Acesso ao PWA**: permitido se o usuário tem `ADMIN_MASTER` OU `INSTALADOR` (qualquer outra
  combinação é negada).
- **Bloqueio do login web**: negado somente se o conjunto de permissões do usuário for
  exclusivamente `INSTALADOR` (sem `ADMIN_MASTER`/`GESTOR_USUARIOS`/`OPERADOR_AGENDA`/`COMERCIAL`).
- **Restrições de consultora** (seção "Permissões de consultora por módulo"): aplicam-se a quem
  tem `COMERCIAL` e não tem `ADMIN_MASTER` nem `OPERADOR_AGENDA`.

## Trava Web ↔ PWA

### Dois endpoints de login separados

- Novo endpoint `POST /api/auth/pwa/login`: mesma validação de credenciais de hoje, mas só emite
  token se o usuário tiver `ADMIN_MASTER` ou `INSTALADOR`. Caso contrário, 403 com mensagem
  ("Este aplicativo é exclusivo para administradores e instaladores.").
- `POST /api/auth/login` (existente, usado pelo site): passa a rejeitar (403) usuários cujo único
  papel operacional seja `INSTALADOR`.
- `frontend-instalador/src/context/AuthContext.jsx` passa a chamar `/api/auth/pwa/login` em vez de
  `/api/auth/login`. A checagem client-side de `permissoes.includes("INSTALADOR")` que existe hoje
  é removida (fica redundante e incompleta — não cobre `ADMIN_MASTER`).

### Claim de app no JWT

- O JWT emitido por qualquer um dos dois endpoints ganha um claim `app: "web" | "pwa"`.
- Novo middleware `pwaScopeMiddleware`, aplicado nas rotas que o PWA usa de fato (agendamentos:
  leitura/status/anexos; veículos: abastecimento; perfil): aceita a requisição se
  `req.user.app === "pwa"` OU se o usuário tem `ADMIN_MASTER`/`OPERADOR_AGENDA`/`COMERCIAL` (que
  seguem usando essas mesmas rotas pelo site). Nega (403) caso contrário.
- Rotas que o PWA não usa (clientes, pedidos fora do necessário para exibir o agendamento,
  arquitetos, orçamentos, catálogo, dashboard) ganham checagem explícita para negar acesso a
  tokens com `app === "pwa"`, exceto quando o usuário tem `ADMIN_MASTER` (que, como em todo o
  resto do sistema, sempre faz bypass total). Isso fecha a brecha de hoje, em que um token de
  instalador tecnicamente consegue chamar qualquer rota protegida só por `authMiddleware`.

## Cadastro de instalador pelo PWA

- Nova tela de cadastro em `frontend-instalador/` (`/cadastro` ou similar), com os mesmos campos
  do formulário do site (`RegisterUsuario.jsx`): nome completo, email, senha, CPF, empresa, setor
  — reaproveita o `GET /api/auth/empresas` / `GET /api/auth/setores?empresa_id=` já existentes.
- Reaproveita o endpoint existente `POST /api/auth/register` (cria usuário com
  `status = 'pendente'`), adicionando um campo `origem` (ou coluna nova `usuarios.cadastro_origem`)
  marcado como `"pwa"` quando o registro vem dessa tela.
- Aprovação continua exclusivamente em `frontend-web/src/pages/Usuarios.jsx`. A lista de
  pendentes passa a mostrar a origem do cadastro; quando `cadastro_origem = "pwa"`, a permissão
  `INSTALADOR` já vem pré-marcada/pré-selecionada nessa linha — o admin_master só confirma
  (pode trocar se for engano), sem precisar montar a seleção de permissão do zero.

## Permissões de consultora por módulo

Todas as regras abaixo têm trava obrigatória no backend (`permissionMiddleware` e/ou filtro
obrigatório dentro do service), não apenas ocultação de UI no frontend.

| Módulo | Regra |
|---|---|
| Agendamentos | Acesso total: cria, vê e edita/cancela qualquer agendamento (inclusive de outras consultoras), sem filtro de dono. Toda edição feita por uma consultora registra uma entrada de auditoria (quem alterou, o quê, valor anterior → novo). |
| Mapa / Equipes | Acesso total às ações existentes (criar/editar equipe, etc.), mesmo mecanismo de auditoria de alterações. |
| Arquitetos | Visível apenas os registros com `consultor_id = usuário logado`. Filtro obrigatório no service (não opt-in via query param). |
| Clientes | Nova coluna `clientes.consultor_id`. Visível apenas os do próprio usuário. Cliente criado por uma consultora já nasce com `consultor_id` preenchido. |
| Pedidos | Visível apenas os com `consultor_id = usuário logado`. O filtro "filtrar por consultora" desaparece da UI quando o usuário logado é consultora; o backend ignora/rejeita esse parâmetro caso uma consultora tente enviá-lo mesmo assim (sempre força o próprio `consultor_id`). |
| Veículos | Bloqueio total (403) em todas as rotas de `veiculosRoutes.js` para quem só tem `COMERCIAL`. |
| Orçamentos | Bloqueio total — tanto o módulo novo (`orcamentosRoutes.js`) quanto o legado CRM (rotas de orçamento/financeiro/comissões em `crmRoutes.js`). |
| Catálogo | Bloqueio total em `produtosRoutes.js` e `categoriasRoutes.js`. |
| Dashboard | Bloqueio total, tanto `dashboardRoutes.js` quanto `dashboardGestorRoutes.js`. Isso muda o comportamento atual (hoje uma consultora sem `DASHBOARD_PEDIDOS_GERAL` consegue ver o dashboard filtrado só com os próprios pedidos) — deixa de ver o dashboard por completo. |

### Registros sem dono (órfãos)

Registros de `clientes`/`pedidos`/`arquitetos` sem `consultor_id` preenchido ficam invisíveis para
consultoras (só `admin_master`/`OPERADOR_AGENDA` os veem e podem atribuir um dono manualmente).
Como passo de rollout, antes de ativar essa trava em produção, os registros antigos relevantes
precisam passar por um backfill manual de `consultor_id` — feito fora desta spec, pelo usuário.

## Auditoria de alterações (agendamentos + mapa/equipe)

Tabela genérica reutilizável `alteracoes_auditoria`:

```
entidade        text        -- ex: 'agendamento', 'equipe'
entidade_id     uuid/int
usuario_id      uuid        -- quem fez a alteração
campo           text
valor_anterior  text
valor_novo      text
criado_em       timestamptz default now()
```

Alimentada nos pontos de edição de agendamento (`agendamentosRoutes.js`/service correspondente) e
de equipe/mapa (`crewRoutes.js`/service correspondente) — a cada `UPDATE`, compara campo a campo o
estado anterior vs. o novo e grava uma linha por campo alterado. Para mudanças que não são colunas
escalares (ex.: membros adicionados/removidos de `agendamento_equipe`), cada adição/remoção também
vira uma linha, com `campo = "equipe"` e `valor_anterior`/`valor_novo` descrevendo quem entrou ou
saiu. A tela de detalhe do agendamento e a tela de equipe ganham uma seção "Histórico de
alterações" listando essas entradas (quem, quando, campo, de → para).

## Migrations necessárias

- `clientes.consultor_id` — nova coluna `UUID REFERENCES usuarios(id) ON DELETE SET NULL`,
  seguindo o padrão de adaptação dupla local (`INTEGER`) / Supabase (`UUID`) já usado em
  `_supabase_update*.sql` para `arquitetos.consultor_id`/`pedidos.consultor_id`.
- `usuarios.cadastro_origem` (ou coluna equivalente) para marcar cadastros vindos do PWA.
- Nova tabela `alteracoes_auditoria`.
- Nenhuma migration de schema é necessária para a lógica de login/JWT (é mudança de código:
  novo endpoint, novo claim, novo middleware).

## Plano de testes

Automatizados (backend):

- Login web rejeita usuário só com `INSTALADOR`; aceita os demais papéis normalmente.
- Login PWA (`/api/auth/pwa/login`) aceita só `ADMIN_MASTER`/`INSTALADOR`; rejeita `COMERCIAL`,
  `OPERADOR_AGENDA`, `GESTOR_USUARIOS` puros.
- Token com `app: "pwa"` sem `ADMIN_MASTER`/`OPERADOR_AGENDA`/`COMERCIAL` é rejeitado em rotas de
  clientes/pedidos/arquitetos/orçamentos/catálogo/dashboard.
- Rotas de veículos/orçamentos (ambos os módulos)/catálogo/dashboard retornam 403 para `COMERCIAL`.
- Listagens de arquitetos/clientes/pedidos filtram por `consultor_id` quando o usuário é
  `COMERCIAL`; tentativa de forçar `?consultora_id=outro` via API é ignorada/rejeitada.
- Edição de agendamento e de equipe gera entrada em `alteracoes_auditoria` com valor
  anterior/novo corretos.
- Cadastro via PWA cria usuário `pendente` com `cadastro_origem = "pwa"`; aprovação no site
  pré-marca `INSTALADOR`.

Manual (navegador + PWA, sem ferramenta de screenshot neste ambiente — fica registrado como
pendente de teste manual, como de costume):

- Login de cada papel nos dois canais (web e PWA).
- Fluxo completo de auto-cadastro de instalador pelo PWA até aprovação no site.
- Navegação de uma consultora por todos os módulos afetados, confirmando bloqueios e filtros.
- Histórico de alterações visível nas telas de agendamento e equipe/mapa.
