# Design: Flag de categoria "Necessita Conferência" + endpoint de itens pendentes

**Data:** 2026-06-14
**Status:** Aprovado

---

## Contexto

Este é o **subprojeto 1 de 3** de uma reformulação do fluxo de conclusão da Etapa 1 ("📋 Pedidos").

**Situação atual:** dentro do modal da Etapa 1 ([EtapaDadosPedido.jsx](frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx)), o botão "📅 Agendar Instalação" abre o [ModalSelecionarItensInstalacao](frontend-web/src/pages/pedidos/ModalSelecionarItensInstalacao.jsx), que cria um agendamento genitor (`tipo='Instalação'`, `status='pre_agendado'`) cobrindo os itens selecionados. O critério "Todos os itens com data de entrega definida (X/Y)" é satisfeito quando todos os itens do pedido estão cobertos por algum agendamento genitor.

Na Etapa 2 ("📐 Conferência de Medidas" — [EtapaConferencia.jsx](frontend-web/src/pages/pedidos/fluxo/etapas/EtapaConferencia.jsx)), o usuário pode "+ Agendar Conferência" para cada genitor de Instalação, criando um agendamento herdeiro `tipo='Conferência'`.

**Nova regra de negócio (visão geral dos 3 subprojetos):**

1. O botão "Agendar Instalação" da Etapa 1 será renomeado para "DEFINIR DATA DE ENTREGA" (subprojeto 2).
2. Ao clicar, se o pedido tiver itens de categorias marcadas como "necessita conferência" ainda não cobertos por uma Conferência, abre um modal de seleção desses itens → ao confirmar, redireciona para `/agendamentos` criando um agendamento genitor `tipo='Conferência'`, `status='agendado'`, com título `"Conferência - <Primeiro Nome> <Último Nome do cliente> - <numeroPedidoCompleto>"` (subprojeto 2).
3. Depois que ao menos uma Conferência estiver agendada (ou se o pedido não tiver itens que precisem de conferência), aparece o botão para o fluxo atual de pré-agendamento de Instalação/entrega com bloqueio de tempo por categoria (subprojeto 3). A Etapa 2 deixa de criar novas Conferências — passa a apenas exibir as já agendadas na Etapa 1.

**Este subprojeto (1)** entrega a base de dados e o endpoint que os subprojetos 2 e 3 vão consumir: a marcação por categoria de quais itens exigem conferência, e a lista de itens pendentes de um pedido.

## Objetivo

1. Adicionar coluna `categorias.necessita_conferencia` (boolean, default `false`).
2. Expor e permitir editar essa flag via `categoriaService` e na tela de Categorias (`Categorias.jsx`), com o mesmo padrão visual de `vinculavel` / `recebe_vinculos`.
3. Criar `GET /pedidos/:id/itens-disponiveis-conferencia-entrega`, que retorna os itens do pedido cuja categoria exige conferência e que ainda não estão cobertos por um agendamento `tipo='Conferência'` ativo (status fora de `cancelado`/`rejeitado`).

---

## 1. Migration

Novo arquivo `backend/src/database/migrations/categorias_necessita_conferencia.sql`:

```sql
-- categorias_necessita_conferencia.sql
-- Marca categorias cujos itens exigem uma visita de conferência agendada
-- antes de definir a data de entrega/instalação do pedido.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS necessita_conferencia BOOLEAN NOT NULL DEFAULT false;
```

Segue o padrão de `categorias_vinculo_flags.sql`. Precisa ser aplicada manualmente no banco local e no Supabase (conforme já registrado para outras migrations deste projeto).

## 2. Backend — `categoriaService.js`

- `listar`: adicionar `necessita_conferencia` ao `SELECT`.
- `criar`: aceitar `necessita_conferencia` em `dados`, gravar com `!!necessita_conferencia` no `INSERT`.
- `atualizar`: aceitar `necessita_conferencia` em `dados`, gravar com `!!necessita_conferencia` no `UPDATE`.

Sem mudanças em `categoriasRoutes.js` (já é pass-through de `req.body`).

## 3. Frontend — `Categorias.jsx` (CategoriaModal)

Novo estado `necessitaConferencia`, inicializado de `categoria?.necessita_conferencia ?? false`, incluído no objeto retornado por `handleSubmit` e nos payloads de `api.post`/`api.put` em `salvarCategoria`.

Novo checkbox no mesmo bloco dos existentes:

```jsx
<label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 8 }}>
  <input type="checkbox" checked={necessitaConferencia} onChange={(e) => setNecessitaConferencia(e.target.checked)} />
  Item com necessidade de conferência?
</label>
<p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0 24px" }}>
  Itens desta categoria precisam de uma visita de conferência agendada antes de definir a data de entrega.
</p>
```

## 4. Novo endpoint — `GET /pedidos/:id/itens-disponiveis-conferencia-entrega`

Em `pedidosRoutes.js`, próximo a `itens-disponiveis-instalacao`, seguindo o mesmo padrão de validação (pedido pertence à empresa, etc.):

```sql
SELECT pi.id, pi.ambiente, pi.descricao, pi.quantidade, pi.unidade,
       COALESCE(pi.categoria_id, prod.categoria_id) AS categoria_id,
       cat.nome AS categoria_nome
FROM pedido_itens pi
LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
LEFT JOIN produtos prod ON prod.id = oi.produto_id
LEFT JOIN categorias cat ON cat.id = COALESCE(pi.categoria_id, prod.categoria_id)
WHERE pi.pedido_id = $1
  AND cat.necessita_conferencia = true
  AND pi.id NOT IN (
    SELECT ai.pedido_item_id
    FROM agendamento_itens ai
    JOIN agendamentos a ON a.id = ai.agendamento_id
    WHERE ai.pedido_item_id IS NOT NULL
      AND a.tipo = 'Conferência'
      AND a.status NOT IN ('cancelado','rejeitado')
  )
ORDER BY pi.ordem ASC, pi.id ASC
```

Retorna `{ itens: [...] }`, no mesmo formato (campos) usado por `itens-disponiveis-instalacao`, para que o modal do subprojeto 2 reaproveite o mesmo componente de listagem/seleção (`ModalSelecionarItensInstalacao`).

Esse endpoint também serve para o subprojeto 2 decidir se existem itens pendentes (lista vazia ⇒ pula direto para o fluxo de pré-agendamento de entrega, subprojeto 3).

---

## Testes

- `categoriaService.test.js`: cobrir `criar`/`atualizar`/`listar` com `necessita_conferencia`.
- Novo teste de rota para `GET /pedidos/:id/itens-disponiveis-conferencia-entrega` (caso com itens pendentes, caso vazio, caso item já coberto por Conferência ativa).

## Fora de escopo (subprojetos 2 e 3)

- Renomear botão e novo modal de seleção/redirecionamento para agendar Conferência.
- Botão de pré-agendamento de entrega pós-conferência.
- Ajustes em `dashboardService.js` (`itens_cobertos` filtrado por `tipo='Instalação'`, fonte de genitores da Etapa 2).
- Mudanças em `EtapaConferencia.jsx` (remoção do "+ Agendar Conferência").
