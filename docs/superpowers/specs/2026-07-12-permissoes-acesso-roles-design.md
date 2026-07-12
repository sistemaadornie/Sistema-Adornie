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
| Agendamentos | Acesso total: cria, vê e edita/cancela qualquer agendamento (inclusive de outras consultoras), sem filtro de dono. **Nota de implementação:** hoje `agendamentoService.js` já restringe usuários "COMERCIAL puro" (`isComercialPuro()`, em `permissionService.js`) a só ver/reagendar/cancelar os próprios agendamentos (`listar`, `reagendar`, `alterarStatus`) — essas restrições precisam ser **removidas**, não adicionadas. A auditoria de edição (quem alterou, o quê, valor anterior → novo, inclusive troca de equipe) **já existe e funciona** via tabela `agendamento_logs` + função `gravarLog()` + rota `GET /agendamentos/:id/logs`, consumida pela tela `AgendamentosHistorico.jsx` ("Histórico de atividades") — nenhum trabalho novo necessário aqui. |
| Mapa / Equipes | Acesso total às ações existentes (criar/editar equipe, etc.) — já é assim hoje (`crewRoutes.js` só exige `authMiddleware`, sem restrição por dono). **Falta implementar:** não existe nenhum mecanismo de auditoria para crews hoje; precisa de uma tabela `crew_logs` nova, seguindo o mesmo padrão de `agendamento_logs`. |
| Arquitetos | Visível apenas os registros com `consultor_id = usuário logado`. Filtro obrigatório em `arquitetoService.listar`/`buscar` (não opt-in via query param) — hoje não existe filtro nenhum, é trabalho novo. |
| Clientes | Nova coluna `clientes.consultor_id`. Visível apenas os do próprio usuário. Cliente criado por uma consultora já nasce com `consultor_id` preenchido. Trabalho novo (hoje não existe filtro nem coluna). |
| Pedidos | Visível apenas os com `consultor_id = usuário logado`; filtro "filtrar por consultora" some da UI pra consultora. **Nota de implementação:** isso já está implementado hoje — a tela de Pedidos (`Pedidos.jsx`) consome `GET /api/dashboard/pedidos` (`dashboardService.listarPedidosDashboard`), que já força `consultor_id = userId` pra quem não tem a permissão avulsa `DASHBOARD_PEDIDOS_GERAL`, e o filtro de consultora na UI já só aparece pra quem tem essa permissão. Nenhuma mudança de código necessária — só um teste de regressão confirmando o comportamento e um passo de rollout: **garantir que nenhuma consultora (`COMERCIAL` puro) tenha `DASHBOARD_PEDIDOS_GERAL` atribuída hoje** (é uma permissão avulsa, hoje provavelmente atribuída manualmente via SQL a alguns usuários). |
| Veículos | Bloqueio total (403) em todas as rotas de `veiculosRoutes.js` para quem só tem `COMERCIAL`. Trabalho novo (hoje só `POST`/`PUT`/`DELETE` têm alguma restrição, e `COMERCIAL` não está nela, então nem essas rotas bloqueiam consultora hoje). |
| Orçamentos | Bloqueio total no módulo novo (`orcamentosRoutes.js` — hoje `COMERCIAL` está explicitamente liberado em `PODE_GERENCIAR`, precisa ser removido) e nas rotas de orçamento/financeiro/comissões do CRM legado (`crmRoutes.js`, paths `/orcamentos*`, `/financeiro*`, `/comissoes*` — hoje sem proteção nenhuma). Não inclui `/crm/retornos`, `/crm/stats`, `/crm/dashboard` (não são "orçamentos"). |
| Catálogo | Bloqueio total em `produtosRoutes.js` e `categoriasRoutes.js` (hoje sem proteção nenhuma). Trabalho novo. |
| Dashboard | **Já satisfeito hoje, nenhum trabalho novo.** A tela `Dashboard.jsx` (Dashboard do Gestor, KPIs) consome `dashboardGestorRoutes.js`, que já tem `router.use(authMiddleware, permissionMiddleware(["ADMIN_MASTER","OPERADOR_AGENDA"]))` no topo — `COMERCIAL` já é 403 em tudo, e o link já não aparece no `Sidebar.jsx`/`App.jsx` pra consultora. (Não confundir com `dashboardRoutes.js`, que apesar do nome é na verdade o endpoint de listagem de Pedidos — ver linha acima.) |

### Registros sem dono (órfãos)

Registros de `clientes`/`pedidos`/`arquitetos` sem `consultor_id` preenchido ficam invisíveis para
consultoras (só `admin_master`/`OPERADOR_AGENDA` os veem e podem atribuir um dono manualmente).
Como passo de rollout, antes de ativar essa trava em produção, os registros antigos relevantes
precisam passar por um backfill manual de `consultor_id` — feito fora desta spec, pelo usuário.

## Auditoria de alterações (agendamentos + mapa/equipe)

**Agendamentos:** já implementado hoje, sem nenhum trabalho necessário. `agendamentoService.js`
grava um log em `agendamento_logs` (via `gravarLog()`) a cada criação, edição, cancelamento,
exclusão, mudança de status e reagendamento — incluindo diff campo a campo (`{campo, de, para}`)
e entradas específicas para membros de equipe adicionados/removidos. `GET /agendamentos/:id/logs`
expõe isso e `frontend-web/src/pages/agendamentos/AgendamentosHistorico.jsx` já renderiza como
"Histórico de atividades". Como o registro sempre grava `usuarioId`/`usuarioNome` de quem chamou a
ação, uma consultora editando o agendamento de outra já aparece corretamente no histórico assim
que a restrição de dono for removida (ver tabela acima).

**Mapa / Equipes:** não existe hoje. Segue o mesmo padrão já estabelecido para agendamentos —
nova tabela `crew_logs`, análoga a `agendamento_logs`:

```sql
CREATE TABLE crew_logs (
  id           SERIAL PRIMARY KEY,
  crew_id      INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  usuario_id   <tipo de usuarios.id — INTEGER local / UUID Supabase>,
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL,   -- 'criado' | 'editado' | 'excluido'
  detalhes     JSONB,           -- { campos: [{ campo, de, para }, ...] }
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);
```

Alimentada em `crewService.criarCrew`/`atualizarCrew`/`deletarCrew` (compara o estado antes/depois
e grava só os campos que mudaram, igual ao bloco de diff já existente em
`agendamentoService.atualizar`). Nova rota `GET /crews/:id/logs` e uma seção "Histórico de
alterações" na tela de equipe/mapa do frontend, no mesmo estilo visual da timeline de agendamentos.

## Migrations necessárias

- `clientes.consultor_id` — nova coluna `UUID REFERENCES usuarios(id) ON DELETE SET NULL`,
  seguindo o padrão de adaptação dupla local (`INTEGER`) / Supabase (`UUID`) já usado em
  `_supabase_update*.sql` para `arquitetos.consultor_id`/`pedidos.consultor_id`.
- `usuarios.cadastro_origem` (ou coluna equivalente) para marcar cadastros vindos do PWA.
- Nova tabela `crew_logs` (ver seção de auditoria acima).
- Nenhuma migration de schema é necessária para a lógica de login/JWT (é mudança de código:
  novo endpoint, novo claim, novo middleware), nem para a auditoria de agendamentos (já existe).

## Plano de testes

Automatizados (backend):

- Login web rejeita usuário só com `INSTALADOR`; aceita os demais papéis normalmente.
- Login PWA (`/api/auth/pwa/login`) aceita só `ADMIN_MASTER`/`INSTALADOR`; rejeita `COMERCIAL`,
  `OPERADOR_AGENDA`, `GESTOR_USUARIOS` puros.
- Token com `app: "pwa"` sem `ADMIN_MASTER`/`OPERADOR_AGENDA`/`COMERCIAL` é rejeitado em rotas de
  clientes/pedidos/arquitetos/orçamentos/catálogo/dashboard.
- Rotas de veículos/orçamentos (ambos os módulos)/catálogo retornam 403 para `COMERCIAL`.
  `dashboard-gestor` já tem esse teste implícito na proteção existente — confirmar que segue
  cobrindo `COMERCIAL`.
- Listagens de arquitetos/clientes filtram por `consultor_id` quando o usuário é `COMERCIAL`.
  Pedidos (via `GET /api/dashboard/pedidos`): teste de regressão confirmando que `COMERCIAL` sem
  `DASHBOARD_PEDIDOS_GERAL` só vê os próprios e que `?consultora_id=outro` é ignorado (comportamento
  já existente).
- Edição de agendamento por uma consultora aparece em `agendamento_logs` com o nome de quem editou
  e o diff correto (comportamento já existente, só precisa de um teste novo cobrindo o caso
  consultora-edita-agendamento-de-outra, já que antes isso nem era possível). Edição de equipe gera
  entrada em `crew_logs` com valor anterior/novo corretos (mecanismo novo).
- Cadastro via PWA cria usuário `pendente` com `cadastro_origem = "pwa"`; aprovação no site
  pré-marca `INSTALADOR`.

Manual (navegador + PWA, sem ferramenta de screenshot neste ambiente — fica registrado como
pendente de teste manual, como de costume):

- Login de cada papel nos dois canais (web e PWA).
- Fluxo completo de auto-cadastro de instalador pelo PWA até aprovação no site.
- Navegação de uma consultora por todos os módulos afetados, confirmando bloqueios e filtros.
- Histórico de alterações visível nas telas de agendamento e equipe/mapa.
