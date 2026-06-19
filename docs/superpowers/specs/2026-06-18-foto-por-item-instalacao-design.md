# Foto por item em Instalação/Retorno-Finalização + rótulo dinâmico de itens

## Contexto

Hoje, no agendamento (`agendamentos` + `agendamento_itens`), a lista de itens aparece com o rótulo fixo "Itens para levar" tanto no admin (`frontend-web`) quanto no PWA do instalador (`frontend-instalador`, onde hoje é só "Itens"). A validação de que um serviço foi de fato executado é feita por uma foto **geral** do agendamento (`agendamento_anexos`, tipos `foto_antes`/`foto_depois`), sem nenhuma granularidade por item.

Para agendamentos do tipo Instalação e Retorno/Finalização, queremos uma evidência por item (uma foto comprovando que aquele item específico foi instalado), e não só uma foto geral do ambiente. Aproveitamos a mesma mudança para tornar o rótulo da lista de itens contextual ao tipo do agendamento.

## Objetivo

1. O texto da lista de itens passa a refletir o que precisa ser feito, de acordo com o tipo do agendamento.
2. Para agendamentos de Instalação e Retorno/Finalização, cada item vinculado a um pedido (`pedido_item_id IS NOT NULL`) exige pelo menos uma foto antes que o agendamento possa ser marcado como Concluído ou Não concluído. Essa exigência por item **substitui** a foto geral obrigatória que hoje existe para essas duas transições nesses dois tipos — não coexistem.
3. O admin (`frontend-web`) ganha visibilidade dessas fotos por item, para conferência da equipe.

## Fora de escopo

- Remoção ou substituição de uma foto de item já enviada.
- Restringir quem pode subir a foto além do controle de acesso que `agendamento_anexos` já tem hoje (escopo por empresa).
- Exigir foto em itens sem `pedido_item_id` (itens digitados à mão, sem vínculo a um pedido).
- Mudar o comportamento de "Iniciar atendimento" (status `andamento`) — a foto geral obrigatória ao iniciar continua como está, em todos os tipos.
- Mudar o comportamento de Conferência e Manutenção — continuam com a foto geral obrigatória como hoje, em todas as transições.

## 1. Rótulo dinâmico dos itens

Texto por tipo:

| Tipo | Rótulo |
|---|---|
| Instalação | "Itens para instalar" |
| Conferência | "Itens para conferir" |
| Manutenção | "Itens para manutenção" |
| Retorno/Finalização | "Itens para verificar" |

Implementado como uma função `rotuloItens(tipo)` (com fallback para "Itens para levar"/"Itens" se o tipo for desconhecido), duplicada em cada app — `frontend-web` e `frontend-instalador` são projetos React separados, sem pacote compartilhado.

Pontos de uso a atualizar:
- `frontend-web/src/pages/agendamentos/Agendamentos.jsx:1937` — label no formulário de criação/edição.
- `frontend-web/src/pages/agendamentos/Agendamentos.jsx:2414` — label na visão de detalhe (somente leitura).
- `frontend-instalador/src/pages/AgendamentoDetalhe.jsx:262` — label "Itens" no card de detalhe.

## 2. Modelo de dados

Nova tabela, migration em `backend/src/database/migrations/agendamento_item_fotos.sql`:

```sql
CREATE TABLE IF NOT EXISTS agendamento_item_fotos (
  id                   SERIAL PRIMARY KEY,
  agendamento_item_id  INTEGER NOT NULL REFERENCES agendamento_itens(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  enviado_por          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_item_fotos_item ON agendamento_item_fotos(agendamento_item_id);
```

Precisa ser aplicada manualmente nos dois bancos (local Postgres e Supabase), como todas as migrations deste projeto.

Sem coluna de tipo/categoria — todas as fotos de item são do mesmo tipo conceitual (evidência de instalação). Sem soft-delete: uma vez enviada, a foto permanece (mesmo padrão que `agendamento_anexos` já segue hoje, que também não tem endpoint de remoção).

## 3. Backend

### 3.1 Upload de foto por item

`POST /agendamentos/:agendamentoId/itens/:itemId/fotos`

- Middleware: `authMiddleware`, `upload.array("arquivos", 5)`, `validarMagicBytes` — mesmo conjunto usado em `POST /agendamentos/:id/anexos`.
- Serviço novo `agendamentoService.adicionarFotoItem(agendamentoId, itemId, empresaId, userId, files)`:
  - Confirma que `itemId` pertence a um `agendamento_itens` cujo `agendamento_id = agendamentoId`, e que esse agendamento pertence a `empresaId` (join simples, 404 se não bater).
  - Para cada arquivo: upload pro Cloudinary em `operon/empresas/{empresaId}/agendamentos/{agendamentoId}/itens/{itemId}`, depois `INSERT INTO agendamento_item_fotos (agendamento_item_id, url, enviado_por) VALUES (...)`.
  - Retorna `{ ok: true, fotos: [{ id, url }, ...] }`.

### 3.2 Leitura — `buscar()` / GET /agendamentos/:id

A query de itens em `agendamentoService.js:127` ganha `pedido_item_id` e um agregado de fotos:

```sql
SELECT ai.id, ai.nome, ai.pedido_item_id,
       COALESCE(
         json_agg(json_build_object('id', f.id, 'url', f.url) ORDER BY f.enviado_em)
         FILTER (WHERE f.id IS NOT NULL), '[]'
       ) AS fotos
FROM agendamento_itens ai
LEFT JOIN agendamento_item_fotos f ON f.agendamento_item_id = ai.id
WHERE ai.agendamento_id = $1
GROUP BY ai.id, ai.nome, ai.pedido_item_id
ORDER BY ai.id
```

`itens_raw` passa a expor `{ id, nome, pedido_item_id, fotos }` por item. O campo `itens` (array de strings, usado hoje em vários lugares dos dois frontends) continua sendo gerado do mesmo jeito — não há quebra de compatibilidade para quem só lê `ag.itens`.

### 3.3 Validação em `alterarStatus()`

Em `agendamentoService.js`, próximo ao bloco que já existe para Conferência (linhas 688-703), nova checagem:

```js
if ((status === "concluido" || status === "nao_concluido")
    && ["Instalação", "Retorno/Finalização"].includes(existe.rows[0]?.tipo)) {
  const pendentesCheck = await db.query(
    `SELECT ai.nome
     FROM agendamento_itens ai
     WHERE ai.agendamento_id = $1 AND ai.pedido_item_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM agendamento_item_fotos f WHERE f.agendamento_item_id = ai.id)`,
    [id]
  );
  if (pendentesCheck.rows.length > 0) {
    const nomes = pendentesCheck.rows.map((r) => r.nome).join(", ");
    const e = new Error(`Falta foto de ${pendentesCheck.rows.length} item(ns): ${nomes}. Adicione uma foto de cada item antes de concluir o agendamento.`);
    e.status = 400;
    throw e;
  }
}
```

Quando não há nenhum item com `pedido_item_id` (agendamento sem itens vinculados a pedido), a checagem passa trivialmente — igual ao comportamento já existente para Conferência.

Essa validação roda dentro do serviço compartilhado (`alterarStatus`), então vale tanto para o PWA quanto para qualquer chamada futura do admin a essa mesma rota — não é possível contornar por nenhum dos dois apps.

### 3.4 Foto geral deixa de ser obrigatória nesses casos

No bloco de upload de `files` dentro de `alterarStatus` (linhas 705-723), a exigência de "pelo menos 1 arquivo" para concluir/não-concluir é responsabilidade do **frontend** hoje (o backend não rejeita uma chamada sem `files`). Então o ajuste é só no PWA (seção 4): para Instalação/Retorno-Finalização, o sheet de conclusão simplesmente não vai mais exigir/mostrar o `FilePicker` genérico — a validação que importa (por item) já é garantida pelo backend em 3.3.

## 4. PWA (frontend-instalador)

Em `AgendamentoDetalhe.jsx`:

- **Lista de itens** (linhas 257-268): enquanto `ag.status === "andamento"`, cada `<li>` ganha um botão de câmera (reaproveitando o padrão `capture="environment"` do `FilePicker` atual). Ao escolher uma foto, sobe direto via `POST /agendamentos/:id/itens/:itemId/fotos` (chamada isolada, fora do fluxo do bottom sheet) e atualiza o item localmente com a miniatura/✓. Isso resolve o problema de conexão instável em campo: cada foto já está salva no momento em que é tirada, não depende de uma única requisição grande no fim.
- **Bottom sheet de Concluir / Não concluído**: branch por tipo.
  - Instalação / Retorno-Finalização: em vez do `FilePicker` genérico, mostra a lista de itens com ✅/pendente; cada pendente tem um botão "+ foto" que dispara o mesmo upload imediato acima. O botão "Confirmar" fica desabilitado até todos os itens vinculados a pedido estarem com foto (mesmo padrão de `disabled` que já existe, só que a condição passa a vir do estado dos itens em vez de `sheetFiles.length`).
  - Conferência / Manutenção: sheet inalterado (FilePicker genérico, como é hoje).
- Itens sem `pedido_item_id` aparecem na lista normalmente, mas sem indicação de pendência (não bloqueiam nada).

## 5. Admin (frontend-web)

Em `Agendamentos.jsx`:

- Na visão de detalhe não-simplificada (linha 2412-2419), cada item da lista passa a renderizar as miniaturas de `it.fotos` (se houver) ao lado do nome.
- A visão simplificada de concluído/não-concluído (`isConcluido`, a partir da linha 2208) hoje não mostra a lista de itens — passa a mostrar, no mesmo formato, já que é a tela natural para a equipe conferir o que foi instalado depois do fato.
- Essas duas seções passam a consumir `ag.itens_raw` (já existente, agora enriquecido) em vez de `ag.itens` (array de strings) para ter acesso a `fotos`.

## Tratamento de erros

- Upload em item de agendamento de outra empresa, ou item inexistente: 404 (mesmo padrão dos demais endpoints de agendamento).
- Tentar concluir/não-concluir sem foto em algum item: 400 com mensagem listando os itens pendentes pelo nome (mesmo tom da mensagem já usada para Conferência).
- Falha de upload pro Cloudinary: erro propagado como já acontece em `adicionarAnexos`/`alterarStatus` hoje (sem tratamento novo).

## Testes

- Backend: teste do novo endpoint de upload (sucesso, 404 por item/agendamento de empresa errada); teste de `alterarStatus` bloqueando conclusão de Instalação/Retorno-Finalização com item sem foto, e permitindo quando todos têm; teste confirmando que Conferência/Manutenção não são afetados pela nova regra.
- Manual (navegador + PWA): roteiro cobrindo tirar foto de item durante "andamento", concluir com item pendente (deve bloquear, listar nome), concluir após completar todas as fotos, e confirmar que o admin mostra as miniaturas no detalhe.
