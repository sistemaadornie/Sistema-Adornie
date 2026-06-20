# Ficha de Confecção (Cortina/Xale e Forro) separada da Conferência Técnica

## Contexto

Hoje existe uma única tela (`OrdemServicoPage.jsx` / `OrdemServicoModal.jsx`, tabela `ordem_servico`) que mistura dois papéis num formulário só: especificação de confecção (trilho, espaçador, wave, tecidos, barra) e conferência técnica (medidas reais, fixação, assinaturas). Essa tela nunca chegou a ser conectada de ponta a ponta — o `POST /os` que cria a ordem de serviço não é chamado por nenhum botão do frontend hoje; o item só aparece com "Visualizar Ficha" em `EtapaConferencia.jsx` se `dados_tecnicos` já existir.

O banco já tem, sem uso, colunas pensadas para uma dupla conferência (`conferencia_consultora_*`, `conferencia_tecnico_*`, migration `ordem_servico_conferencias.sql`) e um campo `tipo` em `ordem_servico` (default `'cortina'`).

Vamos separar em duas fichas de fato:

1. **Ficha de Confecção** — preenchida pela consultora, com as especificações de produção (trilho, tecido, wave, barra, forro) e os cálculos de metragem/clipes/entretela, a partir da planilha `O.S. CONFECÇÃO - CONSULTORAS.xlsx` (módulo `calculoCortina.js` já validado).
2. **Ficha de Conferência Técnica** — preenchida pelo técnico, com as medidas reais aferidas em campo e as assinaturas, usando a Ficha de Confecção como referência para saber o que medir.

## Objetivo

- A consultora preenche a Ficha de Confecção antes da visita técnica, por item do pedido.
- O técnico só consegue abrir a Ficha de Conferência Técnica depois que a Ficha de Confecção daquele item estiver preenchida, e vê os dados de confecção como painel de referência somente leitura.
- Itens de categoria Cortina e (futuro) Xale usam a mesma Ficha de Confecção (mesmos campos e cálculo). Itens de categoria Forro usam uma ficha própria, mais simples, com os campos de forro já presentes na spec/cálculo de cortina, extraídos para uma tela separada.
- Cada item do pedido tem sua própria OS — forro e cortina são itens distintos no pedido (sistema de vínculo já existente) e cada um gera sua própria ordem de serviço/ficha.

## Fora de escopo

- Persiana: sem spec/cálculo de confecção ainda. Fica para um próximo projeto.
- Xale como categoria própria: ainda não existe no cadastro de categorias. Quando existir, basta marcar `tipo_confeccao = 'cortina'` nela — nenhuma mudança de código adicional é necessária.
- Blackout como ficha/tipo separado: é só um valor de tecido dentro da Ficha de Forro (Microfibra/Blackout), não uma OS própria.
- Preenchimento automático de campos da Ficha de Forro a partir do item de cortina vinculado (`item_vinculado_id`). A consultora digita os campos compartilhados (espaçador, largura do trilho, tipo wave, abertura) de novo na ficha de forro.
- Edição/reabertura após a Ficha de Conferência Técnica estar concluída (status `encerrada`) — fora de escopo, mantém o comportamento atual (sem tela de "reabrir OS").
- Migração de dados de OS já existentes: dado que nenhum `ordem_servico` em produção tem `dados_tecnicos` preenchido hoje (recurso nunca foi usado de ponta a ponta), não há dados a migrar. **Confirmar isso antes de implementar** (rodar `SELECT count(*) FROM ordem_servico WHERE dados_tecnicos IS NOT NULL` nos dois bancos); se houver linhas, decidir caso a caso antes de seguir.

## 1. Modelo de dados

### `categorias` — nova coluna `tipo_confeccao`

Migration `backend/src/database/migrations/categorias_tipo_confeccao.sql`:

```sql
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_confeccao VARCHAR(20);
-- valores: 'cortina' | 'forro' | NULL (categoria sem ficha de confecção)

UPDATE categorias SET tipo_confeccao = 'cortina' WHERE LOWER(nome) IN ('cortinas', 'xales');
UPDATE categorias SET tipo_confeccao = 'forro'   WHERE LOWER(nome) = 'forros';

CREATE INDEX IF NOT EXISTS idx_categorias_tipo_confeccao ON categorias(tipo_confeccao);
```

Categorias sem `tipo_confeccao` (Trilhos e Varões, Controles, Persianas, Motorização, Almofadas) não geram OS nem botão de ficha de confecção.

### `ordem_servico` — novas colunas

Migration `backend/src/database/migrations/ordem_servico_dados_confeccao.sql`:

```sql
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_confeccao        JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_por INTEGER REFERENCES usuarios(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_os_pedido_item_unico ON ordem_servico(pedido_item_id);
```

O índice único torna `pedido_item_id` 1:1 com `ordem_servico`, permitindo que a criação da OS seja idempotente (ver seção 3).

`dados_tecnicos` (já existe) passa a guardar **só** os campos de conferência técnica — ver shape na seção 4. Os campos de confecção que hoje estão misturados ali (`espacador`, `bolsas`, `modelo`, `componente`, `abertura`, `nivel_chao`, `tipo_barra`, `modelos_barrado`, `obs_barra`, `tecido_principal*`, `forro_*`, `blackout_*`, `xale_*`, `valor_*`) deixam de ser usados nesse formato — são substituídos pelos campos novos de `dados_confeccao`, com nomes conforme a spec da planilha (`espacador`, `tipoWave`, `larguraTrilho` etc., ver seção 4).

## 2. Fluxo / gatilho

Botão por item em `EtapaConferencia.jsx` (etapa 2 do fluxo do pedido), substituindo o texto estático atual ("Visualizar Ficha" / "Aguardando técnico"):

| Estado | O que mostra |
|---|---|
| Categoria do item sem `tipo_confeccao` | Nada (item não passa por ficha de confecção) |
| `tipo_confeccao` definido, OS não existe | Botão **"Preencher Ficha de Confecção"** |
| OS existe, `dados_confeccao` nulo | Botão **"Preencher Ficha de Confecção"** (retoma) |
| `dados_confeccao` preenchido, `dados_tecnicos` nulo | Botão **"Conferência Técnica"** |
| `dados_tecnicos` preenchido | Botão **"Visualizar Ficha"** (como hoje) |

Clique em "Preencher Ficha de Confecção" sem OS ainda: chama `POST /os` (cria, idempotente) e navega para `/pedidos/os/:osId/confeccao`.
Clique em "Conferência Técnica" / "Visualizar Ficha": navega para `/pedidos/os/:osId` (rota existente).

`agendamentoService.listarConferenciaItens` (linha ~1321 de `agendamentoService.js`) precisa passar a trazer, por item:
- `cat.tipo_confeccao` (via `LEFT JOIN categorias cat ON cat.id = pi.categoria_id`)
- `os.dados_confeccao IS NOT NULL AS confeccao_preenchida` (além do `ficha_preenchida` que já existe para `dados_tecnicos`)

`dashboardService.js` (linha ~677, mesma query duplicada) recebe o mesmo ajuste para manter consistência de onde já expõe `ficha_preenchida`.

## 3. Backend

### `POST /os` — criação idempotente, tipo decidido no servidor

`ordemServicoService.criar({ pedidoItemId, responsavelId })`:
1. Busca a categoria do item (`pedido_itens.categoria_id` → `categorias.tipo_confeccao`).
2. Se `tipo_confeccao` for nulo, erro 400 ("Esta categoria não possui ficha de confecção").
3. `INSERT ... ON CONFLICT (pedido_item_id) DO NOTHING RETURNING *`; se não retornar linha (já existia), faz `SELECT` da OS existente e retorna — nunca duplica.
4. Seta `tipo = categorias.tipo_confeccao` na criação.

### `PUT /os/:id/confeccao` (novo endpoint)

Body = `dadosConfeccao` (shape depende de `os.tipo`, ver seção 4). Validações mínimas obrigatórias:
- Cortina/Xale (`tipo = 'cortina'`): `larguraTrilho`, `tipoWave`, `espacador`, `abertura` e `feitaPor` obrigatórios (são a base de todo o cálculo).
- Forro (`tipo = 'forro'`): `tecidoForro`, `larguraForro`, `forroCosturado` obrigatórios.

Salva em `dados_confeccao`, seta `confeccao_preenchido_em = NOW()`, `confeccao_preenchido_por = userId`, e `status` sai de `aberta` para `em_andamento` (mesma regra que `salvarDadosTecnicos` já aplica hoje).

### `PUT /os/:id` (existente, `salvarDadosTecnicos`)

Passa a exigir `dados_confeccao IS NOT NULL` antes de aceitar — senão, erro 400 ("Ficha de Confecção precisa ser preenchida antes da Conferência Técnica"). Os campos validados (`largura`, `altura_esq/meio/dir`, `responsavel_conferencia`, `data_conferencia`, `assinatura_tecnico`) continuam os mesmos — já são puramente técnicos.

### `GET /os/:id` (existente, `buscar`)

Passa a devolver também `tipo`, `dados_confeccao`, `confeccao_preenchido_em`, `confeccao_preenchido_por`.

## 4. Campos por ficha

### Ficha de Confecção — Cortina/Xale (`os.tipo = 'cortina'`)

Campos de entrada (nomes conforme a spec da planilha, camelCase para bater com `calculoCortina.js`): `tipoOS`, `feitaPor`, `espacador`, `tipoWave`, `abertura`, `componente`, `ladoMotor`, `larguraTrilho`, `larguraTecido`, `nomeTecido`, `vendeuBarraAplicada`, `alturaCortina`, `alturaBarra`, `quantTomas`, `tamanhoTomas`, `cortinaLadoALado` (informativo), `detalheBarra`.

Campos somente-leitura, recalculados ao vivo: `clipes` (com ou sem abertura), `quantTecidoCortina`, `quantEntretela`, `quantBarrado`, `sobraBarrado` — via `clipesAberturaCentral`/`clipesSemAbertura`/`calcularQuantTecidoCortina`/`calcularQuantEntretela`/`calcularQuantBarrado`/`calcularSobraBarrado` (porta 1:1 de `calculoCortina.js`).

Campos lidos do pedido (somente leitura, painel "Dados do Pedido", já existe no layout atual): cliente, nº pedido, vendedor, ambiente, item, medidas/tecido vendidos.

Forro **JUNTO** com a cortina (cortina costurada com forro embutido, sem ser item separado) não é tratado aqui — esse caso some da ficha de cortina; se a venda incluir forro, ele é vendido como item próprio (categoria Forro) e ganha sua própria OS/ficha (seção abaixo). `calcularQuantForro` deste módulo não é usado na ficha de cortina.

### Ficha de Confecção — Forro (`os.tipo = 'forro'`)

Campos de entrada: `tecidoForro`, `tecidoTipo` (`Microfibra` | `Blackout`), `franzimento`, `forroCosturado` (`JUNTO` | `SEPARADO`), `larguraForro`, `alturaBarraForro`, e os 4 campos compartilhados que a fórmula de forro também usa: `espacador`, `larguraTrilho`, `tipoWave`, `abertura`, `alturaCortina` (a consultora digita de novo — ver "Fora de escopo").

Campo somente-leitura: `quantForro`, via `calcularQuantForro()` (porta 1:1 da função já existente em `calculoCortina.js`).

### Ficha de Conferência Técnica (`dados_tecnicos`, ambos os tipos)

Shape novo, só os campos realmente técnicos (remove os de confecção do shape atual de `OrdemServicoPage.jsx`):

```js
{
  largura: "", altura_esq: "", altura_meio: "", altura_dir: "",
  fixacao: "parede", lado_motor: "n/a", voltagem: "sem_motor",
  cortineiro: "não", tamanho_cortineiro: "", afastamento_suportes: "",
  responsavel_conferencia: "", data_conferencia: "", acompanhado_por: "",
  esboco_tecnico: "", assinatura_tecnico: "", assinatura_cliente: "",
}
```

Acima do formulário técnico, painel somente-leitura mostrando `dados_confeccao` (reaproveita o estilo visual do painel "Dados do Pedido" já existente em `OrdemServicoPage.jsx`).

## 5. Frontend — telas e arquivos

- `frontend-web/src/utils/calculoCortina.js` (novo) — porta de `calculoCortina.js`, sem o bloco de self-test (`process.argv` não existe no browser).
- `frontend-web/src/pages/pedidos/FichaConfeccaoCortina.jsx` (novo) — rota `/pedidos/os/:osId/confeccao` quando `os.tipo === 'cortina'`.
- `frontend-web/src/pages/pedidos/FichaConfeccaoForro.jsx` (novo) — mesma rota quando `os.tipo === 'forro'`.
- Um componente roteador simples decide qual dos dois renderizar, com base no `GET /os/:id` (campo `tipo`).
- `frontend-web/src/pages/pedidos/OrdemServicoPage.jsx` (reescrito) — vira a Ficha de Conferência Técnica: bloqueia com aviso se `dados_confeccao` for nulo; senão mostra painel de referência + formulário técnico (sem as seções de Especificação de Confecção / Tecidos & Forros / Blackout / Xale / Valores Internos, que saem deste arquivo).
- `OrdemServicoModal.jsx` — mesmo tratamento do `Page` ou remoção, a confirmar na fase de implementação (verificar se ainda é usado em algum lugar; pela exploração inicial não foi encontrado nenhum import ativo fora do próprio arquivo).
- `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx` — botão por item conforme tabela da seção 2.
- `frontend-web/src/App.jsx` — nova rota `/pedidos/os/:osId/confeccao`.

## 6. Testes

- `backend/src/__tests__/ordemServicoService.test.js` (já existe) — atualizar para a nova assinatura de `criar` (idempotência + erro quando categoria sem `tipo_confeccao`) e cobrir `salvarDadosConfeccao`/regra de bloqueio em `salvarDadosTecnicos`.
- Self-test de `calculoCortina.js` (caso real da planilha) migra para um teste unitário de verdade (Jest) no frontend-web, em vez do bloco `if (import.meta.url === ...)`.
- Teste manual no navegador: criar pedido com item Cortina + item Forro vinculado, preencher as duas fichas de confecção, confirmar que a Conferência Técnica fica bloqueada até lá, preencher e validar os cálculos contra o caso de teste da planilha.
