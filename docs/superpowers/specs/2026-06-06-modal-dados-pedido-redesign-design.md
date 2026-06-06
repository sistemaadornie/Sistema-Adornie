# Redesign do modal "Dados do Pedido" — Design

**Data:** 2026-06-06
**Escopo:** `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` (componente `ModalDadosPedido`) e `PedidoFluxo.css`

## Contexto e problema

O `ModalDadosPedido` (etapa "Dados do Pedido" do fluxo de pedidos) hoje renderiza todas as suas seções — Ações, Pendências, Informações, Endereço, Itens, Pagamentos, Observações, Previsão de Entrega e Mídias — empilhadas verticalmente dentro de uma única coluna rolável (`pf-modal-body`). Isso gera três problemas:

1. **Seções empilhadas**: a lista vertical é longa, dificultando escanear o pedido rapidamente.
2. **Pouco destaque para o essencial**: informações-chave (cliente, status, total, pendências da etapa) se misturam com o restante do conteúdo e somem ao rolar.
3. **Visual do formulário de edição genérico**: o modo de edição substitui tudo por um formulário único, voltando a empilhar campos sem hierarquia visual.

O modal "Entrega" (`ModalEntrega`) **não** faz parte deste redesign — seu conteúdo já é enxuto e não sofre do mesmo problema.

## Design

### 1. Estrutura: layout de duas colunas

O `ModalDadosPedido` passa a usar um layout interno de duas colunas dentro do corpo do modal (substituindo o atual `pf-modal-abas` + `pf-modal-body` de coluna única):

- **Coluna esquerda — `pf-modal-sidebar`** (fixa, ~220px, fundo distinto do conteúdo via `var(--color-bg)`): mostra a identidade do pedido (nome do cliente, badge de status colorido reaproveitando os tons de `STATUS_COR`, total em destaque com `pf-valor-destaque`, e badge de pendências quando a etapa não estiver completa) seguida pelos botões de ação empilhados verticalmente: ✏ Editar, 🖨 Imprimir, 📄 PDF Original (condicional), 📅 Agendar Instalação, 🕘 Histórico, 🗑 Excluir.
- **Coluna direita — `pf-modal-content`** (flexível, rola de forma independente da lateral): contém a navegação por sub-abas e o conteúdo correspondente.

O cabeçalho existente do modal (`pf-modal-header`, com título e botão fechar) permanece inalterado no topo. As abas superiores atuais `Detalhes` / `Histórico` (`pf-modal-abas`) são removidas — substituídas pela estrutura abaixo.

### 2. Sub-abas de conteúdo (`pf-subabas`)

Dentro de `pf-modal-content`, navegação em estilo "segmented control" (pílulas lado a lado, ativa em azul — visualmente distinta das antigas `pf-modal-aba` para não criar confusão de hierarquia):

- **Geral**: seção "Informações" (cliente, consultora, arquiteto, data — complementares ao que já está na lateral), "Endereço de Entrega", "Pendências para concluir esta etapa" (lista detalhada — reaproveita `pf-etapa1-pendencias`), "Observações" e "Previsão de Entrega".
- **Itens**: a tabela de itens completa (`pf-itens-table`: Produto, Categoria, Vínculo, Larg., Alt., Qtde, Preço, Total) e o bloco de totais (`pf-totais`), com a aba inteira disponível para a tabela respirar.
- **Pagamentos**: grupos por forma de pagamento (`pf-pag-grupo`), como hoje.
- **Mídias**: `MidiasGaleria`, como hoje.

Cada sub-aba renderiza apenas seu próprio conteúdo — eliminando a rolagem longa única.

### 3. Edição inline por sub-aba

Ao clicar em "✏ Editar" (na lateral):

- O botão de ação "Editar" alterna para "Cancelar" / "Salvar" — as ações de edição ficam na lateral, junto da identidade do pedido, substituindo temporariamente os demais botões de ação.
- A sub-aba **Geral** passa a exibir o formulário de edição (Cliente, Status, Data do Pedido, Consultora, Arquiteto, Observações, Previsão de Entrega) — reaproveitando `pf-form-edicao`/`pf-form-row`/`pf-form-field`.
- A sub-aba **Itens** passa a exibir o editor de Categoria/Vínculo por item — reaproveitando `pf-itens-editor-wrap`.
- As sub-abas **Pagamentos** e **Mídias** continuam somente leitura (não há edição implementada para elas hoje; fora de escopo).
- Um único botão "Salvar" (na lateral) dispara `handleSalvar`, enviando dados do formulário e itens de uma vez, como ocorre atualmente.
- "Cancelar" descarta as alterações e retorna ao modo de visualização (`setEditando(false)`), como hoje.

### 4. Histórico como painel lateral (drawer)

O botão "🕘 Histórico" na lateral abre um painel deslizante (`pf-drawer-historico`) sobreposto ao conteúdo, exibindo `AbaHistorico` (mantendo a chamada a `/pedidos/:id/auditoria?etapa=dados_pedido`). Isso evita competir por espaço com as sub-abas operacionais — o histórico é uma consulta ocasional, não parte do fluxo principal de revisão/edição.

### 5. Estilo visual e responsividade

- **Lateral**: fundo `var(--color-bg, #0f172a)` (distinto do `var(--color-surface)` do corpo do modal), com borda divisória (`border-right: 1px solid var(--color-border)`).
- **Badge de status**: usa um mapeamento de cores próprio para os status de pedido (`pendente`/`em_andamento`/`concluido`/`cancelado` — distintos dos status de agendamento em `STATUS_COR` do `ModalEntrega`), definido localmente dentro de `ModalDadosPedido` para não acoplar os dois componentes.
- **Sub-abas**: pílulas lado a lado (`pf-subabas` + `pf-subaba`), ativa com fundo azul (`var(--color-primary)`) e texto branco; inativas com fundo `var(--color-surface)` e borda `var(--color-border)`.
- **Responsividade**: abaixo de uma largura mínima (ex.: `max-width: 720px` via media query), a lateral deixa de ser uma coluna fixa lateral e passa a ficar empilhada no topo do conteúdo (`flex-direction: column`), com sub-abas e conteúdo ocupando a largura total.
- **Convenção de nomes**: novas classes seguem o prefixo `pf-*` já usado em `PedidoFluxo.css` (`pf-modal-layout`, `pf-modal-sidebar`, `pf-modal-content`, `pf-subabas`, `pf-subaba`, `pf-drawer-historico`).

## Fora de escopo

- Redesign do `ModalEntrega` (mantém o layout atual).
- Edição de pagamentos ou mídias dentro do modal (não existe hoje; não será adicionada).
- Mudanças no backend, na API de fluxo/auditoria, ou no comportamento de salvar/excluir/imprimir — apenas reorganização visual e de navegação no frontend.

## Testes / verificação

- Verificar visualmente no navegador: abrir um pedido com pendências (etapa incompleta) e um pedido completo, navegar pelas 4 sub-abas, abrir/fechar o drawer de histórico, entrar e sair do modo de edição, salvar alterações, e redimensionar a janela para checar o comportamento responsivo (lateral empilhando em telas estreitas).
- Conferir que `handleSalvar`, `handleExcluir`, `handleAbrirPdf` e a navegação para agendamento de instalação continuam funcionando sem alteração de comportamento.
