# Redesign visual da tela de Editar Pedido

**Data:** 2026-07-05
**Status:** Aprovado

---

## Contexto

`EditarPedido.jsx` (tela própria desde a feature "Editar Pedido como Tela + PDF", 2026-07-05) usa
divs soltas com estilo inline e a classe `pf-form-field` (emprestada de `PedidoFluxo.css`, pensada
para campos dentro de modais simples). O resultado é visualmente "cru": sem cartões, sem hierarquia
entre seções, sem contexto do pedido (cliente, número) visível na tela, e destoa das telas de Ficha
de Confecção/Conferência (`FichaConfeccaoCortina.jsx`, `FichaConferenciaConsultorasPersiana.jsx`),
que já usam um sistema visual mais elaborado definido em `OrdemServicoModal.css`
(`os-form-section`, `os-info-bar`, `os-field`) — CSS que `EditarPedido.jsx` já importa mas não usa.

## Objetivo

Reestruturar a tela para usar as classes já existentes em `OrdemServicoModal.css`, dando à tela de
Editar Pedido a mesma hierarquia visual (cartões com título, barra de contexto no topo, campos com
foco destacado) que as Fichas já têm. Nenhuma mudança de comportamento do formulário — mesmos
campos, mesma validação (nenhuma, aliás — o formulário atual não valida antes de salvar, isso
continua igual), mesmo fluxo de salvar/cancelar/voltar.

## Fora de escopo

- Redesenho interno das tabelas de Itens (`pd-itens-editor`) e Pagamentos (`pd-pag-editor`) — só
  ganham um cartão (`os-form-section`) ao redor; linhas, colunas e inputs internos não mudam.
- Novo CSS — a spec usa exclusivamente classes já definidas em `OrdemServicoModal.css`.
- Mudanças no botão de PDF, na navegação de volta (`voltar()`), ou em qualquer lógica de
  carregamento/salvamento.

## 1. Novo dado carregado

Em `carregar()`, o `setForm(...)` passa a incluir mais dois campos, lidos do mesmo
`resPedido.pedido` já buscado (nenhuma chamada de API nova):

```js
cliente_nome:  p.cliente_nome || "",
pedido_numero: p.numero || "",
```

(`p.numero` é o número formatado do pedido, ex. `"SIS-00000004"`, já calculado pelo backend em
`pedidoService.montarPedido` — não confundir com o campo `numero` já existente no form, que guarda
o número da rua do endereço de entrega, lido de `p.numero_rua`.)

## 2. Estrutura visual (de cima para baixo)

### 2.1 Barra de contexto

Logo abaixo do `os-page-header`, antes do bloco de erro/`os-page-body`, uma `os-info-bar` (mesmo
padrão de `FichaConfeccaoCortina.jsx`), com uma única `os-info-row` de 4 `os-info-item`:

- Cliente (`form.cliente_nome`, `os-info-item-grow`)
- Pedido (`form.pedido_numero`, classe `tag-pedido` no `os-info-value`)
- Vendedor (`form.consultor_nome`)
- Arquiteto (`form.arquiteto_nome`)

Só renderiza quando `form` já carregou (mesma condição `!carregando && form` do restante do corpo).

### 2.2 Seção "Dados do Pedido"

`os-form-section` com `os-section-title` = "Dados do Pedido". Dentro:
- `os-grid-2`: Status, Data do Pedido
- `os-grid-2`: CPF/CNPJ, E-mail

Cada campo usa `className="os-field"` no wrapper (em vez de `pf-form-field`), mantendo
`<label>` + `<input>`/`<select>` exatamente como hoje.

Os campos "Consultora"/"Arquiteto" (hoje somente leitura dentro do formulário) são removidos daqui —
já aparecem na barra de contexto (2.1).

### 2.3 Seção "Endereço de Entrega"

`os-form-section` com `os-section-title` = "Endereço de Entrega". Mantém exatamente os dois grids
atuais (`style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", ... }}` para
CEP/Rua/Número, e `"1fr 1fr 1fr 80px"` para Complemento/Bairro/Cidade/UF) — são grids com larguras
assimétricas, não um dos grids padronizados (`os-grid-2`/`os-grid-3`), então ficam como estão, só
com `className="os-field"` em cada campo em vez de `pf-form-field`.

### 2.4 Seção "Observações"

`os-form-section` com `os-section-title` = "Observações". `os-grid-2`: Observações, Observações de
Entrega. As duas `<textarea>` passam a usar `className="os-textarea"` (classe já definida, não usada
hoje) em vez de textarea sem classe.

### 2.5 Seção "Itens (N)"

`os-form-section` com `os-section-title` = "Itens (N)" (N = `itens.length`, dinâmico). Todo o
conteúdo interno (`pd-itens-editor`, linhas, botão "+ Adicionar item", bloco de totais
`pd-totais-editor`) permanece idêntico — só ganha o cartão ao redor.

### 2.6 Seção "Pagamentos (N)"

`os-form-section` com `os-section-title` = "Pagamentos (N)" (N = `pagamentos.length`). Mesmo
tratamento: cartão ao redor, conteúdo interno (`pd-pag-editor`, botão "+ Adicionar pagamento")
inalterado.

## 3. Testes

Sem testes automatizados de frontend neste projeto (nenhum `*.test.jsx` existe). Verificação via
build + lint, e teste manual no navegador.

### Teste manual no navegador

1. Abrir a tela de Editar Pedido de um pedido existente — confirmar que aparece a barra de contexto
   no topo com Cliente, Pedido, Vendedor e Arquiteto preenchidos corretamente.
2. Confirmar que os campos de "Dados do Pedido", "Endereço de Entrega" e "Observações" aparecem
   dentro de cartões com título, com o mesmo visual das Fichas de Confecção (bordas, fundo, foco
   destacado ao clicar num campo).
3. Confirmar que "Itens (N)" e "Pagamentos (N)" mostram a contagem correta no título e que a edição
   das linhas (adicionar, remover, editar valores) continua funcionando exatamente como antes.
4. Editar um campo e salvar — confirmar que volta para o fluxo do pedido com o dado atualizado
   (comportamento de salvamento inalterado).
5. Conferir em tema claro e escuro (o app tem os dois) que os cartões/campos têm contraste adequado.
