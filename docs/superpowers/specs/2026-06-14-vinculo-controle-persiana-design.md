# Configurar categorias vinculáveis — Controle ↔ Cortina/Persiana — Design

**Status:** Aprovado para planejamento
**Subprojeto:** 4 de 5 (ver `categorizacao-automatica-importacao`)
**Depende de:** Subprojeto 3 (vínculo automático trilho↔cortina/forro) — já implementado e em `main`.

## Contexto

Hoje, a tabela `pedido_item_vinculos` e o modal "Vincular Itens" (`VincularItensModal.jsx`) já permitem vincular manualmente um item "vinculável" (`categorias.vinculavel=true`) a um item "principal" (`categorias.recebe_vinculos=true`). O subprojeto 3 habilitou esses flags para "Trilhos e Varões" → "Cortinas"/"Forros" e, junto com isso, criou um motor de vínculo **automático** (`vinculoAutomaticoService.js`) que roda na importação e usa os mesmos flags para encontrar pares por ambiente+largura.

Este subprojeto habilita a categoria "Controles" como vinculável e "Persianas" como receptora de vínculos, para que o usuário possa relacionar manualmente um Controle a uma Cortina ou Persiana através do modal "Vincular Itens" existente.

**Decisão de produto (confirmada com o usuário):** esse vínculo Controle↔Cortina/Persiana é **sempre manual**. Em particular, "Persianas" não deve participar do motor automático do subprojeto 3 — ou seja, não deve ser possível um item de "Trilhos e Varões" ser vinculado automaticamente a uma "Persiana" só porque ambos passam a ter `recebe_vinculos=true`.

## Objetivo

- Itens da categoria "Controles" aparecem no modal "Vincular Itens" como itens vinculáveis.
- Itens da categoria "Persianas" aparecem no modal "Vincular Itens" como itens que podem receber vínculos.
- O motor de vínculo automático (`processarPedido`/`encontrarPares`, subprojeto 3) continua tratando "Cortinas"/"Forros" como receptores automáticos (comportamento já existente, preservado), mas **não** passa a tratar "Persianas" como receptor automático.
- Nenhuma mudança de UI ou de rota é necessária — o modal e a rota de vínculo manual já filtram genericamente pelos flags `vinculavel`/`recebe_vinculos`.

## Arquitetura

### Nova coluna: `categorias.recebe_vinculo_automatico`

Hoje existe um único flag `recebe_vinculos` que serve dois propósitos: (1) decidir quem aparece como "principal" no modal manual, e (2) decidir quem é candidato a receptor no motor automático do subprojeto 3. Esses dois propósitos precisam divergir para "Persianas" (deve valer (1) mas não (2)).

Introduz-se `categorias.recebe_vinculo_automatico BOOLEAN NOT NULL DEFAULT false`:

- `recebe_vinculos=true` → categoria aparece como "principal" no modal manual "Vincular Itens" (sem mudança de comportamento/código no modal).
- `recebe_vinculo_automatico=true` → categoria é elegível como "principal" dentro de `encontrarPares` (motor automático da importação).

"Cortinas"/"Forros" recebem `true` em ambos os flags (preserva exatamente o comportamento atual do subprojeto 3). "Persianas" recebe apenas `recebe_vinculos=true`.

### Migration: `categorias_vinculo_controle_persiana.sql`

Segue o padrão das migrations anteriores (`categorias_vinculo_flags.sql`, `categorias_vinculo_trilho_cortina.sql`): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `UPDATE ... WHERE LOWER(nome) IN (...)`.

```sql
-- categorias_vinculo_controle_persiana.sql
-- Habilita Controles como vinculável e Persianas como receptora de vínculo manual.
-- Cortinas/Forros passam a ter recebe_vinculo_automatico=true explicitamente,
-- preservando o comportamento do motor automático do subprojeto 3.
BEGIN;

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculo_automatico BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET recebe_vinculo_automatico = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'controles';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) = 'persianas';

COMMIT;
```

### Mudança em `backend/src/services/vinculoAutomaticoService.js`

**Query em `processarPedido`** (linha ~47): adicionar a nova coluna ao `SELECT`:

```sql
SELECT pi.id, pi.ambiente, pi.largura, pi.descricao,
       COALESCE(c.vinculavel, false)               AS vinculavel,
       COALESCE(c.recebe_vinculos, false)          AS recebe_vinculos,
       COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico,
       EXISTS (
         SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
       ) AS ja_vinculado
FROM pedido_itens pi
LEFT JOIN categorias c ON c.id = pi.categoria_id
WHERE pi.pedido_id = $1
```

**`encontrarPares`** (linha ~19): trocar o critério de inclusão em `principais`:

```js
// antes
if (it.recebe_vinculos) grupo.principais.push(it);

// depois
if (it.recebe_vinculo_automatico) grupo.principais.push(it);
```

Nenhuma outra parte de `encontrarPares` ou `processarPedido` muda — a lógica de agrupamento por ambiente, comparação exata de largura, correspondência 1:1, criação do vínculo e auditoria permanecem idênticas.

### Modal manual e rota de vínculo (sem mudanças)

Confirmado por leitura do código atual:
- `backend/src/routes/pedidosRoutes.js:648-661` já valida `item.vinculavel` e `itemVinculado.recebe_vinculos` genericamente, via flags da categoria.
- `frontend-web/src/pages/pedidos/fluxo/etapas/VincularItensModal.jsx:54-61` já filtra `principais` por `recebe_vinculos` e `vinculaveis` por `vinculavel`, genericamente.

Com os flags da migration aplicados, Controles passam a aparecer em `vinculaveis` e Persianas em `principais` automaticamente — nenhuma alteração nesses arquivos é necessária.

## Casos de borda

- **Controle sem `largura`** (caso comum — Controles normalmente não têm medidas no documento importado): o filtro existente `it.largura == null` em `encontrarPares` já ignora esses itens, então `vinculavel=true` para Controles **não** faz com que o motor automático tente vinculá-los. Permanecem disponíveis apenas no modal manual.
- **Controle com `largura` preenchida** (raro) e correspondência exata de ambiente+largura com uma Cortina/Forro (`recebe_vinculo_automatico=true`): o motor automático poderia gerar um vínculo Controle→Cortina/Forro. Esse é o mesmo comportamento já existente para qualquer item `vinculavel=true` desde o subprojeto 3 — não é uma regra nova introduzida aqui, e é aceitável.
- **Trilho + Persiana, mesmo ambiente/largura**: com `recebe_vinculo_automatico=false` para Persianas, a Persiana nunca entra em `grupo.principais` no motor automático — nenhum vínculo automático Trilho→Persiana é criado. A Persiana continua disponível como "principal" no modal manual (`recebe_vinculos=true`).
- **Reimportação**: nenhuma mudança de comportamento — `processarPedido` continua idempotente, e a alteração só afeta quais categorias entram em `grupo.principais`.

## Fora de escopo

- Qualquer mudança em `VincularItensModal.jsx` ou na rota de vínculo manual — já funcionam genericamente com os flags.
- Histórico de vínculos no `HistoricoPedidoModal.jsx` — subprojeto 5.
- Vínculo automático Controle→Cortina/Persiana — decisão de produto: esse vínculo é sempre manual.

## Testes

**`backend/src/__tests__/vinculoAutomaticoService.test.js`:**

1. Atualizar fixtures existentes que representam "Cortinas"/"Forros" como principal para incluir `recebe_vinculo_automatico: true` (mantendo os testes atuais passando com o novo critério).
2. Novo caso: item com `recebe_vinculos: true, recebe_vinculo_automatico: false` (ex.: Persiana) no mesmo ambiente e com a mesma largura de um item `vinculavel: true` (ex.: Trilho) → `encontrarPares` retorna `[]` (nenhum par automático).
3. (Opcional, reforço) Novo caso: item "Controle" com `vinculavel: true` e `largura: null` → continua sendo ignorado por `encontrarPares` independentemente do novo flag.

Nenhum teste de integração novo é necessário para o modal manual (sem mudança de código nesse caminho).

## Arquivos afetados

- **Criar:** `backend/src/database/migrations/categorias_vinculo_controle_persiana.sql`
- **Modificar:** `backend/src/services/vinculoAutomaticoService.js`
- **Modificar:** `backend/src/__tests__/vinculoAutomaticoService.test.js`
