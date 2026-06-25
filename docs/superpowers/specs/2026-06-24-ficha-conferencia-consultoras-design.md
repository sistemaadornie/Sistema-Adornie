# Ficha de Conferência Consultoras (Etapa 1)

## Contexto

Hoje, a Etapa 1 do fluxo do pedido (`EtapaDadosPedido.jsx`) só exige **agendar** uma visita de
Conferência (tipo `Conferência` em `agendamentos`) para os itens de categorias com
`necessita_conferencia = true` — não exige que nada tenha sido de fato preenchido. Depois, na
Etapa 2 (`EtapaConferencia.jsx`), cada item desses passa hoje por duas fichas em sequência:

1. **Ficha de Confecção** (consultora, telas `FichaConfeccaoCortina.jsx`/`FichaConfeccaoForro.jsx`,
   coluna `ordem_servico.dados_confeccao`) — bloqueia a próxima.
2. **Ficha de Conferência Técnica** (técnico, `OrdemServicoPage.jsx` no painel web e
   `FichaTecnicaInstalador.jsx` no PWA, coluna `ordem_servico.dados_tecnicos`) — só libera depois
   que (1) estiver preenchida (`ordemServicoService.salvarDadosTecnicos` bloqueia se
   `dados_confeccao IS NULL`).

Vamos inserir uma nova etapa **antes** dessas duas, ainda dentro da Etapa 1 do pedido: a
**Ficha de Conferência Consultoras**. Ela usa exatamente os mesmos campos de especificação que a
Ficha de Confecção já tem hoje (cortina feita por, espaçador, tipo wave, abertura, componente/
trilho, larguras, nome do tecido, barra, tômas, cortina lado a lado, detalhe da barra — e os
equivalentes de Forro), mas é preenchida pela consultora com as medidas que ela mesma levantou,
ainda na Etapa 1, antes de qualquer agendamento ou visita técnica.

## Objetivo

- Novo critério de conclusão da Etapa 1: todos os itens do pedido que precisam de conferência
  (`categorias.necessita_conferencia = true`) têm a Ficha de Conferência Consultoras preenchida.
- A Conferência Técnica (etapa do técnico, inalterada nos seus próprios campos) passa a só abrir
  depois que a Ficha de Conferência Consultoras daquele item estiver preenchida — o gate que hoje
  depende de `dados_confeccao` passa a depender da nova coluna.
- A Ficha de Confecção atual (tela e coluna `dados_confeccao`) **não é alterada nem removida** —
  fica temporariamente sem papel obrigatório no fluxo. Um projeto futuro (fora deste escopo) vai
  reaproveitá-la como ficha final "Confecção/Compra", preenchida depois da Conferência Técnica e
  agregando dados das duas etapas anteriores.

## Fora de escopo

- Repropósito da Ficha de Confecção em "Ficha de Confecção/Compra" (projeto futuro separado).
- Qualquer agendamento/visita ligada à Ficha de Conferência Consultoras — ela é preenchida direto
  no pedido, sem depender de `agendamentos`.
- Itens de categorias com `necessita_conferencia = true` mas sem `tipo_confeccao` definido: não
  ocorre na prática (confirmado pelo usuário) — toda categoria marcada para conferência já tem
  ficha de confecção (cortina ou forro). Não é tratado um caso de "conferência sem ficha aplicável".
- Mudar os campos/validações da Ficha de Confecção em si — a nova ficha reaproveita exatamente o
  mesmo formulário e regras de obrigatoriedade.

## 1. Modelo de dados

Migration `backend/src/database/migrations/ordem_servico_conferencia_consultoras.sql`:

```sql
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_conferencia_consultoras JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_por INTEGER REFERENCES usuarios(id);
```

Mesmo shape de `dados_confeccao` (depende de `os.tipo`, ver Ficha de Confecção atual — não muda).

## 2. Backend

### `ordemServicoService.js`

- Nova função `salvarDadosConferenciaConsultoras(id, userId, dados)`: reaproveita
  `validarDadosConfeccaoCortina`/`validarDadosConfeccaoForro` (mesmas regras de obrigatoriedade),
  salva em `dados_conferencia_consultoras`, seta
  `conferencia_consultoras_preenchido_em/por`, e `status` sai de `aberta` para `em_andamento`
  (mesma regra já aplicada em `salvarDadosConfeccao`/`salvarDadosTecnicos`).
- `salvarDadosTecnicos`: troca o check `if (!osRows[0].dados_confeccao)` por
  `if (!osRows[0].dados_conferencia_consultoras)`, com a mensagem "Ficha de Conferência
  Consultoras precisa ser preenchida antes da Conferência Técnica."
- `buscar(id)`: passa a devolver também `dados_conferencia_consultoras`,
  `conferencia_consultoras_preenchido_em`, `conferencia_consultoras_preenchido_por`.

### `ordemServicoRoutes.js`

Novo endpoint:

```js
router.put('/:id/conferencia-consultoras', authMiddleware, async (req, res) => {
  // mesmo padrão de PUT /:id/confeccao, chamando salvarDadosConferenciaConsultoras
});
```

### `pedidosRoutes.js`

Novo endpoint `GET /pedidos/:id/itens-pendentes-conferencia-consultoras`, no mesmo padrão de
`itens-disponiveis-conferencia-entrega`: itens do pedido com `cat.necessita_conferencia = true` e
`ordem_servico.dados_conferencia_consultoras IS NULL` (join `LEFT JOIN ordem_servico os ON
os.pedido_item_id = pi.id`). Usado para listar os itens pendentes na Etapa 1.

### `agendamentoService.listarConferenciaItens`

Adiciona ao SELECT: `(os.dados_conferencia_consultoras IS NOT NULL) AS
conferencia_consultoras_preenchida`.

### `dashboardService.js`

- Nova query (mesmo padrão de `itensCobertosConferenciaRows`, mas via `ordem_servico` em vez de
  `agendamento_itens`): conta itens com `necessita_conferencia = true` e
  `dados_conferencia_consultoras IS NOT NULL`, por pedido (`buscarFluxoPedido`) e em lote
  (`listarPedidosDashboard`).
- `calcularEtapaAtual`: novo parâmetro `itensComConferenciaConsultorasPreenchida` (junto com
  `totalItensConferencia`, já existente). Nova flag:
  ```js
  const conferenciaConsultorasOk = (totalItensConferencia ?? 0) === 0 ||
    (itensComConferenciaConsultorasPreenchida ?? 0) >= totalItensConferencia;
  const etapa1_ok = verificacaoOk && itensSemCategoria === 0 && itensSemVinculo === 0 &&
    totalItens > 0 && conferenciaOk && conferenciaConsultorasOk;
  ```
- Progresso da Etapa 1 (`progresso` no retorno) ganha `itens_com_conferencia_consultoras:
  itensComConferenciaConsultorasPreenchida` para o frontend montar o critério "(X/Y)".

## 3. Frontend

### Reaproveitamento dos formulários existentes

`FichaConfeccaoCortina.jsx` e `FichaConfeccaoForro.jsx` ganham um prop opcional `modo` (default
`"confeccao"`, ou `"conferencia_consultoras"`), controlando só 3 coisas — campos, validação e
cálculo permanecem idênticos:

| | `modo="confeccao"` (atual) | `modo="conferencia_consultoras"` (novo) |
|---|---|---|
| Lê dados de | `osData.dados_confeccao` | `osData.dados_conferencia_consultoras` |
| Salva em | `PUT /os/:id/confeccao` | `PUT /os/:id/conferencia-consultoras` |
| Título da página | "Ficha de Confecção" | "Ficha de Conferência Consultoras" |

`FichaConfeccao.jsx` (wrapper que escolhe Cortina/Forro por `osData.tipo`) ganha uma cópia fina
`FichaConferenciaConsultoras.jsx`, repassando `modo="conferencia_consultoras"` para os mesmos dois
componentes.

### Rota

`frontend-web/src/App.jsx`: nova rota `/pedidos/os/:osId/conferencia-consultoras` →
`FichaConferenciaConsultoras`.

### `EtapaDadosPedido.jsx` (Etapa 1)

- Novo item na lista "Critérios de conclusão": `CriterioItem` com texto "Todos os itens com
  Conferência Consultoras preenchida (X/Y)", usando o novo campo de progresso.
- Nova seção "CONFERÊNCIA CONSULTORAS" (antes da seção "DATA DE CONFERÊNCIA" existente): busca
  `GET /pedidos/:id/itens-pendentes-conferencia-consultoras`; lista os itens pendentes, cada um com
  botão "Preencher Conferência Consultoras" que chama `abrirOsDoItem` (cria a OS se não existir,
  já usado hoje em `utils/fichaConferencia.js`) e navega para
  `/pedidos/os/:osId/conferencia-consultoras`. Se não houver itens pendentes (lista vazia e
  `total_itens_conferencia > 0`), mostra "Todos os itens já têm Conferência Consultoras
  preenchida." Se `total_itens_conferencia === 0`, não mostra a seção.

### Downstream — refletir o novo gate nas telas que mostram a ação por item

- `frontend-web/src/utils/fichaConferencia.js` (`acaoFichaConferencia`): troca o check de
  `item.confeccao_preenchida` para `item.conferencia_consultoras_preenchida`. Quando ainda não
  preenchida, retorna `null` (em vez de oferecer "Preencher Ficha de Confecção" ali) — preencher
  passa a só ser possível pela Etapa 1.
- `EtapaConferencia.jsx` e `ConferenciaItensModal` (`Agendamentos.jsx`): quando `acaoFichaConferencia`
  retorna `null` para um item com `tipo_confeccao` definido, mostram "Aguardando Conferência
  Consultoras (Etapa 1)" em vez do atual "Sem ficha de confecção".
- `OrdemServicoPage.jsx` (web): o banner de bloqueio passa de "Aguardando a Ficha de Confecção...
  ainda não preenchida" para checar `dados_conferencia_consultoras` com mensagem equivalente; o
  painel de referência somente-leitura passa a exibir `dados_conferencia_consultoras` em vez de
  `dados_confeccao`.
- `FichaTecnicaInstalador.jsx` (PWA): mesma troca — `osData.dados_confeccao` vira
  `osData.dados_conferencia_consultoras` tanto no banner de bloqueio quanto na chamada
  `painelConfeccao(osData.dados_confeccao, osData.tipo)`.

## 4. Testes

- `backend/src/__tests__/ordemServicoService.test.js`: cobrir
  `salvarDadosConferenciaConsultoras` (validações reaproveitadas de cortina/forro) e o novo bloqueio
  de `salvarDadosTecnicos` por `dados_conferencia_consultoras` em vez de `dados_confeccao`.
- `backend/src/__tests__/dashboardService.buscarFluxoPedido.test.js`: cobrir o novo critério da
  Etapa 1 (`conferenciaConsultorasOk`) — pedido com itens de conferência sem a ficha preenchida não
  conclui a Etapa 1; preenchendo todos, conclui (mantendo os critérios já existentes intactos).
- Novo teste de rota para `GET /pedidos/:id/itens-pendentes-conferencia-consultoras`, seguindo o
  padrão de `pedidosRoutes.itensConferenciaEntrega.test.js`.
- Teste manual no navegador: pedido com item Cortina que precisa de conferência → Etapa 1 mostra o
  item pendente → preencher a Ficha de Conferência Consultoras → critério fica ✅ → na Etapa 2,
  abrir o item agora oferece "Conferência Técnica" (antes oferecia "Preencher Ficha de Confecção")
  → tentar preencher a Conferência Técnica de um item ainda sem Conferência Consultoras confirma o
  bloqueio (front e back).
