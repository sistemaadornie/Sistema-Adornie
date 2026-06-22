# Itens mais visuais nos modais de Conferência e Pré-Agendamento

## Contexto

Dois modais do fluxo de pedidos mostram listas de itens, mas o destaque visual é fraco:

1. **`EtapaConferencia.jsx`** (Etapa 2 — "Conferência de Medidas"): cada item é uma linha de texto corrida (`Item 2 — DESCRIÇÃO (medidas)` + botão). Número do item e medidas não têm destaque.
2. **`ModalSelecionarItensInstalacao.jsx`**: usado pelos botões "DEFINIR DATA DE CONFERÊNCIA" e "DEFINIR PRÉ-AGENDAMENTO DE ENTREGA" (`EtapaDadosPedido.jsx`) para escolher quais itens entram em cada agendamento. Já tem cards com checkbox, mas não mostra número do item nem medidas — porque os endpoints que alimentam esse modal não retornam esses campos.

## Objetivo

Tornar os itens visualmente mais claros nos dois modais, com número do item e medidas em destaque, sem mudar nenhum comportamento/funcionalidade existente.

## Mudanças

### 1. Backend — `backend/src/routes/pedidosRoutes.js`

Adicionar `pi.ordem` e `pi.medidas` ao `SELECT` das duas rotas:
- `GET /:id/itens-disponiveis-instalacao`
- `GET /:id/itens-disponiveis-conferencia-entrega`

Sem mudança de filtro/ordenação — só expor campos que já existem na tabela `pedido_itens` e já são usados em `pi.ordem ASC` no `ORDER BY`.

### 2. `EtapaConferencia.jsx` + `PedidoFluxo.css`

Trocar a linha de item (hoje um `<div style={{display:"flex", justifyContent:"space-between"...}}>`) por um card:
- Badge circular numerado à esquerda (reaproveitar o padrão visual de `.vim-num`/`.card-num` já existente no CSS, nova classe `.pf-item-num`).
- Descrição do item.
- Medidas como chip em destaque (nova classe `.pf-item-medidas`), com ícone 📐, sempre visível.
- Botão de ação (Conferência Técnica / Preencher Ficha / "Sem ficha de confecção") mantém exatamente a lógica atual (`acaoFichaConferencia`, `abrirOsDoItem`, navegação) — só muda o layout em volta.

### 3. `ModalSelecionarItensInstalacao.jsx` + `.css`

No `msi-card`, adicionar:
- Badge numerado (`Item {ordem+1}`, mesmo critério de `EtapaConferencia.jsx`: `Number.isFinite(it.ordem) ? it.ordem + 1 : "—"`) ao lado do título.
- Medidas (`it.medidas`) como item de meta-informação na linha que já tem categoria e prazo (`msi-card-meta`), com o mesmo ícone 📐 usado no outro modal.

Nenhuma mudança de comportamento: seleção, "selecionar todos", contador e `continuar()` continuam iguais.

## Fora de escopo

- `VincularItensModal.jsx` e `SelecionarTipoPersianaModal.jsx` não são tocados (não foram citados no pedido e já têm número/medidas em formato tabela).
- Nenhuma migration nova — `ordem` e `medidas` já existem em `pedido_itens`.

## Teste

Build do `frontend-web` sem erros. Teste manual no navegador (abrir os dois modais num pedido com itens, confirmar número e medidas aparecendo, e que os botões de ação continuam funcionando).
