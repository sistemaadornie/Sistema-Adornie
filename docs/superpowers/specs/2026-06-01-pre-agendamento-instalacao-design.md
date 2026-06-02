# Pré-Agendamento de Instalação + Aprovação de Urgência — Design

Data: 2026-06-01
Status: Aprovado (aguardando revisão do spec)
Stack: Node.js/Express + React + PostgreSQL

## Contexto

Parte do sistema já foi construída por um desenvolvedor anterior (alterações não commitadas).
A decisão de produto foi **construir sobre o modelo integrado existente** (sistema de
`agendamentos` + Ordem de Serviço + tabela `categoria_prazos`) em vez de criar as tabelas
paralelas descritas na spec original (`pre_agendamentos`, `pre_agendamento_itens`,
`conferencias_medidas`, `parametros_tempo`). Sobre essa base, adicionamos o **workflow
completo de aprovação de urgência** e completamos o **frontend faltante**.

### O que já existe (não refazer)
- Migration `categoria_prazos` — prazos por empresa+categoria: `logistica_interna_dias` (2),
  `confeccao_dias` (10), `expedicao_dias` (3), `outros_dias` (0). Cálculo em **dias úteis**.
- `prazosService.js` — `listarPrazos`, `salvarPrazo`, `validarPrazoInstalacao` (data mínima =
  **hoje + soma dos prazos em dias úteis**).
- `prazosRoutes.js` — `GET/PUT /api/pedidos/config/prazos`, `POST .../validar`. Registrado no
  `server.js`.
- `GET /pedidos/:id/itens-disponiveis-instalacao` — itens do pedido ainda não agendados p/
  Instalação (exclui itens já em agendamento `tipo='Instalação'` com `status != 'cancelado'`).
- Integração no sistema de agendamentos: `agendamento_itens.pedido_item_id`, `hora` nullable,
  status `pre_agendado`, validação de prazos no POST/PUT com bypass `ignorar_prazos` p/
  ADMIN_MASTER, e `tipo='Conferência'` que cria/atualiza Ordem de Serviço por item.
- `pedido_itens` ganhou `categoria_id`, `largura`, `altura`; import de PDF separa medidas.
- Frontend: checkbox "Pré agendamento" no `NovoAgendamentoModal` (hora opcional, status
  `pre_agendado`), transições de status, histórico de `status_alterado`, guards de `hora` nula.

### Decisões tomadas neste alinhamento
1. **Aprovação de urgência**: aba "Pendentes de aprovação" **dentro da tela de Agendamentos**.
2. **Parametrização de prazos**: editada **dentro da tela de Categorias** (catálogo).
3. **Base da data mínima**: **hoje + tempos** (dias úteis) — mantém o que já está implementado.

## Frente 0 — Hotfix (bug crítico)

No `POST /` de `backend/src/routes/agendamentosRoutes.js`, a validação de prazos usa a variável
`tipo` (linha ~127), mas `tipo` **não é desestruturada** de `req.body` (só
`titulo, cliente, data, hora, equipe, itens, status`). Como `!tipo` é o primeiro operando
avaliado no `if`, isso lança `ReferenceError` em **toda** criação de agendamento → cai no catch
→ HTTP 500. O `PUT /:id` (linha ~213) já desestrutura `tipo` corretamente.

**Correção:** adicionar `tipo` ao destructuring do `POST /`.

## Frente 1 — Workflow de aprovação de urgência

### Modelagem
Usar o próprio campo `status` do agendamento (consistente com o código que faz `switch`/checagem
em status), adicionando dois novos valores:
- `pendente_aprovacao` — aguardando decisão do ADMIN_MASTER (não é agenda real ainda)
- `rejeitado` — solicitação negada; solicitante deve reagendar com data válida

### Migration nova: `agendamentos_aprovacao.sql`
Colunas adicionadas em `agendamentos`:
| Coluna | Tipo | Uso |
|--------|------|-----|
| `status_pretendido` | VARCHAR(30) | status a aplicar quando aprovado (`agendado` ou `pre_agendado`) |
| `motivo_urgencia` | TEXT | justificativa do solicitante (obrigatória ao solicitar) |
| `motivo_rejeicao` | TEXT | justificativa do admin ao rejeitar (obrigatória) |
| `aprovado_por` | INTEGER → usuarios(id) | quem decidiu |
| `aprovacao_em` | TIMESTAMPTZ | quando foi decidido |
| `aprovacao_solicitada_em` | TIMESTAMPTZ | quando foi solicitado |
| `aprovacao_data_minima` | DATE | snapshot da data mínima no momento da solicitação |
| `aprovacao_dias_faltantes` | INTEGER | snapshot de dias úteis faltantes (exibição na aba) |

Usar `ADD COLUMN IF NOT EXISTS` (idempotente). Sem novas tabelas.

### Fluxo
1. Usuário comum tenta agendar instalação com `data < data_mínima`. Hoje o backend devolve 400.
   Passa a: se o payload trouxer `solicitar_urgencia: true` + `motivo_urgencia` não-vazio, o
   agendamento é criado com `status='pendente_aprovacao'`, gravando `status_pretendido` (o que
   seria: `agendado` ou `pre_agendado`), `motivo_urgencia`, `aprovacao_solicitada_em` e os
   snapshots `aprovacao_data_minima` / `aprovacao_dias_faltantes` (vindos de
   `validarPrazoInstalacao`).
2. **Notificação** ao ADMIN_MASTER: insere em `notificacoes` registro global (`usuario_id=NULL`,
   visível a admins/operadores) com `link:/agendamentos?aprovacoes=1`, `tipo:'aprovacao'`.
3. **Reserva de itens**: enquanto `pendente_aprovacao`, os itens permanecem reservados. A query
   de `itens-disponiveis-instalacao` hoje exclui itens em agendamento com `status != 'cancelado'`
   (logo, `pendente_aprovacao` já fica reservado). **Ajuste:** trocar para excluir
   `status NOT IN ('cancelado','rejeitado')`, de modo que itens de agendamentos rejeitados voltem
   a ficar disponíveis.
4. **Decisão (ADMIN_MASTER)** via aba:
   - **Aprovar** → `status = status_pretendido`, grava `aprovado_por` + `aprovacao_em`; notifica o
     solicitante (`usuario_id = criado_por`, `link:/agendamentos`); registra log.
   - **Rejeitar** → `status = 'rejeitado'` + `motivo_rejeicao` (obrigatório); notifica o
     solicitante; itens voltam a ficar disponíveis.
   - **Reagendamento após rejeição**: ao editar (`PUT /:id`) um agendamento `rejeitado` para uma
     data **válida** (≥ mínima), ele assume `status_pretendido` (ou `agendado`/`pre_agendado`
     conforme houver `hora`) e a pendência é encerrada. Se a nova data ainda violar o prazo, o
     usuário pode solicitar urgência de novo (volta a `pendente_aprovacao`).
5. **Bypass direto (ADMIN_MASTER)**: continua podendo enviar `ignorar_prazos: true` para criar já
   no status final (sem passar por pendência). Comportamento atual preservado.

### Backend
- `backend/src/services/agendamentoService.js`:
  - `criar` / `atualizar`: aceitar `solicitar_urgencia` + `motivo_urgencia`; quando a validação de
    prazo falhar e houver solicitação de urgência, persistir como `pendente_aprovacao` com os
    snapshots e disparar notificação aos admins.
  - `listarPendentesAprovacao(empresaId)` — agendamentos `status='pendente_aprovacao'` com dados do
    pedido, solicitante, datas e dias faltantes (para a aba).
  - `decidirAprovacao(id, empresaId, adminUser, { aprovado, motivo })` — aplica aprovação/rejeição,
    grava auditoria, notifica solicitante, grava log.
  - **Listagens normais** (`listar`, views de calendário/dia/semana, instalador, mapa, relatórios):
    excluir `status IN ('pendente_aprovacao','rejeitado')` para não poluir a agenda real.
- `backend/src/routes/agendamentosRoutes.js`:
  - Hotfix do `tipo` (Frente 0).
  - Na violação de prazo: se `solicitar_urgencia` → caminho de pendência (não 400);
    se ADMIN_MASTER + `ignorar_prazos` → bypass atual.
  - `GET /pendentes-aprovacao` (ADMIN_MASTER) — lista pendências.
  - `PATCH /:id/aprovacao` (ADMIN_MASTER) — `{ aprovado: boolean, motivo?: string }`; 400 se
    rejeição sem motivo; 404 se não existir/não estiver pendente.

## Frente 2 — Frontend faltante

1. **Pedidos** (`frontend-web/src/pages/pedidos/Pedidos.jsx`, `DetalhePedido`): botão
   "📅 Agendar Instalação" na área de ações do header. Abre **ModalSelecionarItens**:
   - consome `GET /pedidos/:id/itens-disponiveis-instalacao`;
   - lista itens com checkbox, mostra prazo total (dias úteis) por item;
   - "Continuar" (ativo com ≥1 selecionado) → abre o **NovoAgendamentoModal existente**
     pré-preenchido: cliente, pedido vinculado, endereço, itens selecionados (com
     `pedido_item_id`), `tipo='Instalação'`. Reutiliza o modal; não cria fluxo de data/conferência
     separado.
   - O botão fica visível enquanto houver itens disponíveis (mostra contagem agendados/total).
2. **NovoAgendamentoModal** (`Agendamentos.jsx`): ao receber 400 com `detalhes` (violação de
   prazo), exibir alerta com data mínima + dias faltantes e um botão "Solicitar aprovação de
   urgência" que coleta `motivo` (obrigatório) e reenvia com `solicitar_urgencia:true`. Para
   ADMIN_MASTER, exibir também um toggle "Ignorar prazo" (`ignorar_prazos:true`).
3. **Agendamentos** (`Agendamentos.jsx`): aba/filtro "Pendentes de aprovação" visível só a
   ADMIN_MASTER, com badge de contagem. Cada card: pedido, data pedida, data mínima, dias
   faltantes, motivo, solicitante; ações **Aprovar** / **Rejeitar** (rejeição abre campo de motivo
   obrigatório). Consome `GET /agendamentos/pendentes-aprovacao` e `PATCH /:id/aprovacao`.
4. **Categorias** (`frontend-web/src/pages/catalogo/Categorias.jsx`): estender `CategoriaModal` com
   seção "Prazos de instalação (dias úteis)" — 4 inputs numéricos (logística interna, confecção,
   expedição, outros). Ao abrir edição, carregar prazos atuais (de `GET /pedidos/config/prazos`).
   Ao salvar, persistir a categoria (rota atual) **e** os prazos via `PUT /pedidos/config/prazos`.
   Opcional: exibir total de dias no item da lista.

## Fora de escopo (deste round)
- Tela **dedicada** de conferência de medidas. Já é coberta pelo agendamento `tipo='Conferência'`
  (cria/atualiza OS). Permanece como está; pode virar follow-up.
- Tabelas paralelas da spec original (`pre_agendamentos` etc.) — substituídas pelo modelo
  integrado.

## Tratamento de erros
- Violação de prazo: backend devolve 400 com `{ message, detalhes }` (já existe). O frontend
  distingue esse caso e oferece o caminho de urgência.
- Rotas de aprovação: 403 se não ADMIN_MASTER; 404 se agendamento inexistente ou não-pendente;
  400 em rejeição sem motivo.
- Reserva de itens: `itens-disponiveis-instalacao` exclui `status NOT IN ('cancelado','rejeitado')`
  (pendente continua reservado; rejeitado/cancelado liberam).

## Testes
- **Unit** (`backend/src/__tests__/`): `prazosService.validarPrazoInstalacao` (matemática de dias
  úteis, data mínima, item sem categoria → defaults); transições de `decidirAprovacao`
  (aprovar/rejeitar, rejeição sem motivo, agendamento não-pendente).
- **Manual / integração**: criar instalação com itens (valida hotfix) → violar prazo → solicitar
  urgência (notificação ao admin, itens reservados) → aprovar (vira agenda real, notifica
  solicitante) e rejeitar (itens liberados, notifica solicitante) → editar prazos por categoria.

## Migrations a rodar no banco
Rodar a nova **`agendamentos_aprovacao.sql`** e as já pendentes (não aplicadas):
`categoria_prazos`, `pedido_itens_categoria_id`, `pedido_itens_v4`,
`agendamento_itens_pedido_item`, `agendamentos_hora_nullable`.
