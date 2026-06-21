# Ficha de Conferência Técnica no PWA do Instalador

## Contexto

A Ficha de Conferência Técnica (medidas reais, confirmação, assinatura do técnico) foi implementada em [[project_ficha_confeccao_cortina_forro]] só no `frontend-web` (painel admin). O técnico de campo usa o `frontend-instalador` (PWA), que hoje não tem nenhuma tela de OS/ficha — só Agenda, Detalhe do Agendamento, Rotas, Abastecimento e Perfil.

A Ficha de Confecção continua sendo só da consultora, preenchida pelo painel web — isso não muda.

Durante a exploração desta spec foi encontrado um bug pré-existente, sem relação com o PWA: `criarOSSeNaoExistir` (`backend/src/services/agendamentoService.js`), chamada automaticamente sempre que um agendamento de tipo Conferência é criado/editado, insere uma `ordem_servico` para **todo** item do agendamento (inclusive Persianas, Trilhos — categorias sem ficha de confecção) com `tipo` no valor padrão da coluna (`'cortina'`), sem olhar a categoria do item. Isso pré-cria OS com `tipo` errado para itens que nunca deveriam ter ficha de confecção, e — se o item for Forro — faria a futura `salvarDadosConfeccao` validar com as regras de cortina em vez de forro. Esta spec inclui o conserto.

## Objetivo

1. O técnico, ao abrir no PWA um agendamento do tipo Conferência, vê por item o mesmo estado de ficha que já existe no painel web (sem ficha de confecção aplicável / aguardando confecção / pronto para conferência técnica / já conferido).
2. Para itens prontos para conferência técnica, o técnico preenche a Ficha de Conferência Técnica direto no PWA — medidas reais, confirmação, assinatura do técnico — usando os mesmos endpoints (`GET/PUT /os/:id`) que o painel web já usa, sem precisar trocar de aplicativo.
3. `criarOSSeNaoExistir` passa a usar `categorias.tipo_confeccao` para decidir o `tipo` correto e para **não** criar OS para itens cuja categoria não precisa de ficha de confecção.

## Fora de escopo

- Ficha de Confecção no PWA — continua sendo só do painel web, preenchida pela consultora. Item sem confecção preenchida aparece no PWA só como texto informativo, sem ação.
- Esboço técnico (canvas livre) e assinatura do cliente — só assinatura do técnico (obrigatória) nesta versão do PWA, por simplicidade de tela pequena/só toque.
- Qualquer mudança na Ficha de Confecção ou na Conferência Técnica do painel web — ambas continuam exatamente como estão.
- Mudar o comportamento de upload de foto por item (`ItemComFoto`), que já existe e continua igual.

## 1. Correção do bug em `criarOSSeNaoExistir`

`backend/src/services/agendamentoService.js`, função interna `criarOSSeNaoExistir(itens, client = db)`. Hoje:

```js
const check = await client.query(
  `SELECT id FROM ordem_servico WHERE pedido_item_id = $1 LIMIT 1`,
  [pedido_item_id]
);
if (check.rows.length === 0) {
  await client.query(
    `INSERT INTO ordem_servico (pedido_item_id, status, aberta_em, created_at, updated_at)
     VALUES ($1, 'aberta', NOW(), NOW(), NOW())`,
    [pedido_item_id]
  );
}
```

Passa a:

```js
const { rows: catRows } = await client.query(
  `SELECT cat.tipo_confeccao
   FROM pedido_itens pi
   LEFT JOIN categorias cat ON cat.id = pi.categoria_id
   WHERE pi.id = $1`,
  [pedido_item_id]
);
const tipoConfeccao = catRows[0]?.tipo_confeccao;
if (!tipoConfeccao) continue; // categoria não precisa de ficha de confecção — não cria OS

const check = await client.query(
  `SELECT id FROM ordem_servico WHERE pedido_item_id = $1 LIMIT 1`,
  [pedido_item_id]
);
if (check.rows.length === 0) {
  await client.query(
    `INSERT INTO ordem_servico (pedido_item_id, status, tipo, aberta_em, created_at, updated_at)
     VALUES ($1, 'aberta', $2, NOW(), NOW(), NOW())`,
    [pedido_item_id, tipoConfeccao]
  );
}
```

Mantém o parâmetro `client` (a função roda dentro de transações com `BEGIN`/`COMMIT` em dois call sites — não pode trocar para `ordemServicoService.criar`, que usa `db.query` direto e quebraria a atomicidade da transação). Não duplica `ordemServicoService.criar` como dependência — só replica a mesma checagem de categoria, já que a lógica é pequena e usa `client` em vez de `db`.

Efeito colateral aceito: itens de categorias sem `tipo_confeccao` (Persianas, Trilhos etc.) deixam de ganhar uma `ordem_servico` automática ao entrar num agendamento de Conferência — isso é o comportamento correto pretendido (essas categorias nunca tiveram ficha de confecção nem ficha técnica neste fluxo), mas é uma mudança de comportamento observável: hoje a tabela `ordem_servico` tem uma linha para todo item de todo agendamento de Conferência; depois, só para Cortina/Xale/Forro.

## 2. Lista de itens no Detalhe do Agendamento (PWA)

`frontend-instalador/src/pages/AgendamentoDetalhe.jsx` já carrega `ag.itens_raw` (de `GET /agendamentos/:id`). Quando `ag.tipo === "Conferência"`, a tela passa a buscar também `GET /agendamentos/:id/conferencia-itens` (mesmo endpoint que `Agendamentos.jsx` do painel web já usa — **endpoint existente, nenhuma mudança de backend**), que devolve por item: `pedido_item_id`, `tipo_confeccao`, `ordem_servico_id`, `confeccao_preenchida`, `ficha_preenchida`.

Novo util `frontend-instalador/src/utils/fichaTecnica.js`:

```js
export function estadoFichaTecnica(item) {
  if (!item.tipo_confeccao) return null;
  if (!item.confeccao_preenchida) return { acao: false, texto: "Aguardando ficha de confecção" };
  if (item.ficha_preenchida) return { acao: true, label: "Visualizar Ficha" };
  return { acao: true, label: "Conferência Técnica" };
}
```

Os resultados de `conferencia-itens` são indexados por `pedido_item_id` num mapa; cada `item` de `ag.itens_raw` (que já tem `pedido_item_id`) busca seu estado nesse mapa. Itens sem `pedido_item_id` (digitados à mão) não mostram nada relacionado a ficha — comportamento já existente para outras regras do app.

Na lista de itens (`<ItemComFoto>` em diante), cada `<li className="item-row">` ganha uma segunda linha (abaixo do nome) quando há um estado de ficha:
- sem ação → `<span className="item-row-ficha-aguardando">Aguardando ficha de confecção</span>`
- com ação → `<button className="item-row-ficha-btn" onClick={...}>Conferência Técnica</button>` (ou "Visualizar Ficha"), navegando para `/agenda/:agendamentoId/os/:ordemServicoId`.

## 3. Tela `FichaTecnicaInstalador.jsx`

Nova rota `/agenda/:agendamentoId/os/:osId`, nova página `frontend-instalador/src/pages/FichaTecnicaInstalador.jsx`. Usa os mesmos endpoints que `OrdemServicoPage.jsx` do painel web já usa, sem nenhuma mudança de backend: `GET /os/:id` e `PUT /os/:id`.

Fluxo:
1. Carrega `GET /os/:id`.
2. Se `!osData.dados_confeccao`: tela bloqueada, só `TopBar` + banner "Aguardando a Ficha de Confecção. A consultora ainda não preencheu a ficha de confecção deste item." + botão voltar (sem opção de preencher — isso é só do painel web).
3. Senão: painel somente-leitura com os campos de `dados_confeccao` (mesma função `painelConfeccao(dc, tipo)` do painel web, portada e empilhada em coluna única — cards no estilo já usado em `AgendamentoDetalhe.jsx`, `<div className="card">` com `detail-row`), seguido do formulário:
   - Medidas reais: Largura, Altura Esq./Meio/Dir. (inputs numéricos, mesmos `name`s que o painel web: `largura`, `altura_esq`, `altura_meio`, `altura_dir`).
   - Confirmação: Fixação (select: parede/teto/vão), Lado Motor (select: n/a/esquerdo/direito), Voltagem (select: sem_motor/110v/220v), Cortineiro (select: não/sim), Tamanho Cortineiro (input, habilitado só se Cortineiro=sim), Afastamento Suportes (input), Acompanhado por (input).
   - Responsável pela conferência: pré-preenchido com o nome do usuário logado (`useAuth().user.nome_completo`), editável.
   - Data da conferência: input `type="date"`, default hoje.
   - Assinatura do técnico (obrigatória): canvas por toque, sem seletor de cor/espessura (só desenhar + botão Limpar).
4. Validação antes de salvar — mesmas regras que o backend já exige em `salvarDadosTecnicos` (todas client-side antes do POST, replicando as mensagens do painel web): `largura`, `altura_esq`, `altura_meio`, `altura_dir` > 0; `responsavel_conferencia` não vazio; `data_conferencia` preenchida; `assinatura_tecnico` não vazia.
5. Salva via `PUT /os/:id` com `{ largura, altura_esq, altura_meio, altura_dir, fixacao, lado_motor, voltagem, cortineiro, tamanho_cortineiro, afastamento_suportes, responsavel_conferencia, data_conferencia, acompanhado_por, assinatura_tecnico }` — sem `esboco_tecnico` nem `assinatura_cliente` (ausentes do payload; o backend não exige nenhum dos dois).
6. Sucesso → volta para `/agenda/:agendamentoId`.

### `CanvasDraw` simplificado

Componente novo e local a este arquivo (não compartilhado com o painel web — projetos separados), só toque (`onTouchStart/Move/End`, sem handlers de mouse), sem seletor de cor (preto fixo) nem espessura (3px fixo), com botão "Limpar". Mesma técnica de `toDataURL("image/png")` para serializar.

## 4. Arquivos

- Modify: `backend/src/services/agendamentoService.js` (função `criarOSSeNaoExistir`, seção 1).
- Create: `frontend-instalador/src/utils/fichaTecnica.js`.
- Create: `frontend-instalador/src/pages/FichaTecnicaInstalador.jsx`.
- Modify: `frontend-instalador/src/pages/AgendamentoDetalhe.jsx` (busca `conferencia-itens` quando `ag.tipo === "Conferência"`; renderiza estado/ação por item).
- Modify: `frontend-instalador/src/App.jsx` (nova rota).

## 5. Testes

- Backend: teste para `criarOSSeNaoExistir` cobrindo (a) item de categoria com `tipo_confeccao` ganha OS com o tipo certo, (b) item sem `tipo_confeccao` não ganha OS, (c) item que já tem OS não duplica. Como a função não é exportada hoje, o teste exercita indiretamente via uma das funções públicas que a chamam (`criar`/a função de edição em torno da linha 593) com `db.query` mockado — seguindo o padrão de mocks já usado nos testes existentes de `agendamentoService.js`.
- Frontend: sem test runner em `frontend-instalador` (mesma limitação já documentada para `frontend-web`) — verificação é manual no navegador/celular.
