# Vínculo automático Trilho/Varão ↔ Cortina/Forro — Design

**Status:** Aprovado para planejamento
**Subprojeto:** 3 de 5 (ver `categorizacao-automatica-importacao`)
**Depende de:** Subprojeto 2 (categorização automática na importação) — já implementado e em `main`.

## Contexto

Hoje, ao importar um pedido (`POST /pedidos/importar-texto` → `POST /pedidos/importar`), os itens já são categorizados automaticamente (Cortinas, Forros, Persianas, Trilhos e Varões, etc.) e recebem `largura`/`altura` a partir do campo `medidas`. Itens de acessório (ex.: trilhos) ainda precisam ser vinculados manualmente a um item principal (ex.: cortina) através do modal "Vincular Itens" (`VincularItensModal.jsx`), usando a tabela `pedido_item_vinculos` e as flags `categorias.vinculavel` / `categorias.recebe_vinculos` — hoje `false` para todas as categorias.

Este subprojeto cria vínculos automaticamente durante a importação para os casos óbvios: um item de "Trilhos e Varões" e um item de "Cortinas"/"Forros" no **mesmo ambiente** com a **mesma largura**. Casos sem correspondência exata 1:1 continuam pendentes para o vínculo manual existente — nenhum comportamento do modal manual muda.

## Objetivo

Ao final de `pedidoService.importar()`, para cada pedido importado:
- Itens vinculáveis (categoria com `vinculavel=true`) que tenham exatamente um item correspondente (categoria com `recebe_vinculos=true`, mesmo `ambiente`, mesma `largura`) recebem um registro em `pedido_item_vinculos` automaticamente, com `tipo_vinculo='acessorio'`, e `pedido_itens.sem_vinculo` é marcado `false` para o item vinculável.
- Cada vínculo automático criado gera um registro em `pedido_auditoria` (etapa `dados_pedido`, ação `vinculo_automatico`).
- Itens sem correspondência exata, ou com múltiplas correspondências possíveis, **não** são vinculados automaticamente e seguem disponíveis no modal "Vincular Itens" como hoje.

## Arquitetura

### Novo módulo: `backend/src/services/vinculoAutomaticoService.js`

Exporta uma única função pública:

```js
async function processarPedido(pedidoId, empresaId, userId)
```

- Roda em sua própria transação (`db.connect()` → `BEGIN`/`COMMIT`/`ROLLBACK`).
- Não recebe nem retorna a lista de itens do chamador — busca tudo que precisa via `pedidoId`/`empresaId`. Isso o torna testável isoladamente (basta um pedido já persistido no banco).
- É **idempotente**: nunca cria um vínculo para um item que já tenha uma linha em `pedido_item_vinculos` como `item_id`. Re-executar para o mesmo pedido não duplica nem altera vínculos existentes (inclusive os criados manualmente).

### Função interna pura: matching

Separar a lógica de "quais pares vincular" em uma função pura, sem I/O, para facilitar testes unitários:

```js
function encontrarPares(itens)
// itens: [{ id, categoria_id, ambiente, largura, vinculavel, recebe_vinculos, ja_vinculado }]
// retorna: [{ acessorioId, principalId }]
```

Algoritmo:
1. Filtra itens com `ambiente` não nulo e `largura` não nula.
2. Agrupa por `ambiente` (comparação exata de string, mesmo valor já gravado em `pedido_itens.ambiente`).
3. Em cada grupo, separa:
   - `acessorios`: itens com `vinculavel=true` e `ja_vinculado=false`.
   - `principais`: itens com `recebe_vinculos=true`.
4. Para cada `acessorio`, encontra `principais` do mesmo grupo com `largura` **exatamente igual** (comparação numérica direta — sem tolerância).
5. Se exatamente 1 acessório casa com exatamente 1 principal (correspondência 1:1 dentro do subconjunto "mesma largura, mesmo ambiente"), gera o par `{ acessorioId, principalId }`.
6. Se houver 0 ou ≥2 candidatos de qualquer lado para uma dada largura, nenhum par é gerado para esses itens — permanecem pendentes.

Um item principal só pode aparecer em **um** par por execução (não recebe dois trilhos automaticamente). Um acessório que já tenha 1:1 não compete por outro principal.

### Query de itens (dentro de `processarPedido`)

```sql
SELECT pi.id, pi.ambiente, pi.largura, c.vinculavel, c.recebe_vinculos,
       pi.descricao,
       EXISTS (SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id) AS ja_vinculado
FROM pedido_itens pi
LEFT JOIN categorias c ON c.id = pi.categoria_id
WHERE pi.pedido_id = $1
```

(`empresaId` não precisa entrar na query — `pedidoId` já é validado pelo chamador via `montarPedido`/`criar`.)

### Criação do vínculo + auditoria

Para cada par `{ acessorioId, principalId }` retornado por `encontrarPares`:

```sql
INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
VALUES ($1, $2, 'acessorio')
ON CONFLICT DO NOTHING

UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1
```

E via `auditoriaService.registrarAuditoria(client, {...})`:

```js
{
  pedidoId, empresaId, usuarioId: userId,
  etapa: "dados_pedido",
  acao: "vinculo_automatico",
  descricao: `Vínculo automático: "${acessorio.descricao}" → "${principal.descricao}" (ambiente: ${ambiente}, largura: ${largura}m)`,
}
```

### Integração em `pedidoService.importar()`

Em `backend/src/services/pedidoService.js`, dentro de `importar()`, após `criar(...)` (ou após o `atualizar(...)` no caminho de reimportação por `numero_origem`) retornar com sucesso:

```js
await vinculoAutomaticoSvc.processarPedido(pedidoCriado.id, empresaId, userId);
```

Chamado **fora** da transação principal de `criar`/`atualizar` (transação própria, conforme decidido). Se `processarPedido` lançar erro, ele é capturado e logado, mas **não** deve fazer o `importar()` falhar — o pedido já foi salvo com sucesso; vínculos automáticos são um refinamento, não um requisito de salvamento. (`try/catch` ao redor da chamada, com `console.error`.)

### Migration: `categorias_vinculo_trilho_cortina.sql`

Segue o padrão de `categorias_padrao_v2.sql` (uma categoria pode não existir para alguma empresa — usar `UPDATE ... WHERE LOWER(nome) IN (...)`, sem `NOT EXISTS`, pois as categorias já existem):

```sql
-- categorias_vinculo_trilho_cortina.sql
-- Habilita o vínculo automático trilho/varão -> cortina/forro
BEGIN;

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'trilhos e varões';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

COMMIT;
```

## Casos de borda

- **Pedido sem itens de "Trilhos e Varões"**: `encontrarPares` retorna `[]`, `processarPedido` não faz nenhuma escrita (nem auditoria).
- **Ambiente vazio/nulo** em qualquer item: item ignorado no matching (não entra em nenhum grupo).
- **Largura nula** (medida não numérica/ausente): item ignorado no matching.
- **Dois trilhos, uma cortina, mesma largura/ambiente**: ambíguo → nenhum vínculo automático; ambos os trilhos seguem com `sem_vinculo` no valor que já tinham, disponíveis no modal manual.
- **Reimportação (`numero_origem` já existe)**: `atualizar()` já apaga itens removidos e atualiza/insere os demais; `processarPedido` roda de novo e respeita `ja_vinculado` — não duplica vínculos já existentes (manuais ou automáticos de uma importação anterior).
- **Erro inesperado em `processarPedido`**: logado via `console.error`, não propaga — `importar()` retorna sucesso normalmente.

## Fora de escopo (outros subprojetos)

- Flags `vinculavel`/`recebe_vinculos` para "Controles" (relação Controle → Cortina/Persiana) — subprojeto 4.
- Exibir o histórico de vínculos automáticos no `HistoricoPedidoModal.jsx` — subprojeto 5 (a auditoria criada aqui já alimenta `GET /pedidos/:id/auditoria`, que o modal consome; nenhuma mudança de UI é feita neste subprojeto).
- Qualquer tolerância de arredondamento na comparação de `largura` (decidido: comparação exata).
- Vínculo automático fora do fluxo de importação (ex.: ao editar um pedido manualmente pela UI) — fora de escopo; `processarPedido` só é chamado por `importar()`.

## Testes

1. **Unitário — `encontrarPares`** (`backend/src/services/__tests__/vinculoAutomaticoService.test.js` ou arquivo equivalente ao padrão de testes existente):
   - 1 acessório + 1 principal, mesmo ambiente/largura → 1 par.
   - Larguras diferentes → nenhum par.
   - Ambientes diferentes → nenhum par.
   - 2 acessórios + 1 principal, mesma largura → nenhum par (ambíguo).
   - 1 acessório + 2 principais, mesma largura → nenhum par (ambíguo).
   - Item já `ja_vinculado=true` → não entra como acessório candidato.
   - `ambiente`/`largura` nulos → item ignorado.

2. **Integração — `processarPedido`**:
   - Importa um pedido com 1 item "Trilhos e Varões" e 1 item "Cortinas", mesmo ambiente e largura → verifica linha criada em `pedido_item_vinculos` com `tipo_vinculo='acessorio'`, `pedido_itens.sem_vinculo=false` no trilho, e linha em `pedido_auditoria` com `acao='vinculo_automatico'`.
   - Re-chama `processarPedido` para o mesmo pedido → nenhuma linha duplicada (idempotência).
   - Pedido sem itens vinculáveis → nenhuma linha criada em `pedido_item_vinculos`/`pedido_auditoria`.

## Arquivos afetados

- **Criar:** `backend/src/database/migrations/categorias_vinculo_trilho_cortina.sql`
- **Criar:** `backend/src/services/vinculoAutomaticoService.js`
- **Criar:** teste unitário/integração para `vinculoAutomaticoService`
- **Modificar:** `backend/src/services/pedidoService.js` — `importar()` chama `vinculoAutomaticoSvc.processarPedido(...)` após sucesso de `criar`/`atualizar`.
