# Card da Etapa 2 indica "Aguardando definir data de conferência"

**Data:** 2026-07-05
**Status:** Aprovado

---

## Contexto

No fluxograma do pedido (`FluxogramaCanvas.jsx` → `EtapaCard.jsx`), quando uma etapa ainda não é a
etapa ativa (`pendente = !concluida && !ativa`), o card sempre mostra o texto genérico "Aguardando",
independente do número da etapa (`EtapaCard.jsx:27`).

A Etapa 1 só é considerada concluída (`etapa1_ok`, em `dashboardService.js:39-44`) quando, entre
outros critérios, `conferenciaOk` for `true` — ou seja, todos os itens que precisam de conferência
já estarem cobertos por um agendamento do tipo "Conferência" (`itens_cobertos_conferencia >=
total_itens_conferencia`). Isso é independente de `conferenciaConsultorasOk` (fichas de consultora
preenchidas). Na prática, um pedido pode ter 100% das fichas de consultora preenchidas — e o card da
Etapa 1 mostrar "8 de 8 fichas preenchidas" com a barra cheia — e ainda assim a Etapa 1 continuar
"ativa" (não concluída) só porque falta agendar a conferência. Nesse cenário, o card da Etapa 2
mostra apenas "Aguardando", sem indicar que a ação pendente é justamente agendar essa conferência.

Como a Etapa 2 só passa a ser "ativa" quando a Etapa 1 é concluída (e a conclusão da Etapa 1 exige
que a conferência já esteja agendada), a Etapa 2 nunca chega a ficar "ativa" nesse cenário — ela
permanece "pendente" até o agendamento existir. Por isso o problema só se manifesta no estado
"pendente" do card, nunca no estado "ativa".

## Objetivo

Quando todos os itens da Etapa 1 que precisam de conferência já tiverem a ficha de consultora
preenchida, mas ainda faltar agendar a conferência (cobrir todos com um agendamento tipo
"Conferência"), o card da Etapa 2 — enquanto "pendente" — mostra "Aguardando definir data de
conferência" em vez do "Aguardando" genérico.

## Fora de escopo

- Mudanças no comportamento/critérios de conclusão de qualquer etapa (`etapa1_ok`, `etapa2_ok`,
  etc.) — só muda o texto exibido no card.
- Mensagens customizadas para o estado "pendente" de outras etapas (3 a 8) — só a Etapa 2 ganha
  tratamento especial neste projeto.
- Mudanças no estado "ativa" do card da Etapa 2 (`${conferidos} de ${total} conferidos`) — este
  cenário nunca ocorre com a Etapa 2 ativa, conforme explicado no Contexto.

## 1. Backend

### `dashboardService.js`

Nos dois pontos onde o array `etapas` é montado (branch sem pré-agendamentos, dentro do
`if (!genitoresRaw.length)`, e branch com pré-agendamentos, mais abaixo na mesma função
`buscarFluxoPedido`), adicionar ao objeto `progresso` da etapa de número 2 o campo:

```js
aguardando_agendamento_conferencia:
  totalItensConferencia > 0 &&
  itensComConferenciaConsultorasPreenchida >= totalItensConferencia &&
  itensCobertosConferencia < totalItensConferencia,
```

As três variáveis (`totalItensConferencia`, `itensComConferenciaConsultorasPreenchida`,
`itensCobertosConferencia`) já existem e são calculadas antes dos dois pontos de montagem —
nenhuma query nova é necessária.

Objeto da etapa 2 final, em ambos os locais:

```js
{
  numero: 2,
  concluida: etapa2_ok,
  progresso: {
    total: totalItensConf,
    conferidos: itensConferidos,
    aguardando_agendamento_conferencia:
      totalItensConferencia > 0 &&
      itensComConferenciaConsultorasPreenchida >= totalItensConferencia &&
      itensCobertosConferencia < totalItensConferencia,
  },
},
```

## 2. Frontend

### `EtapaCard.jsx`

Em `buildStatusLabel()`, o branch `if (pendente) return "Aguardando";` passa a tratar a etapa 2 como
caso especial, antes do retorno genérico:

```js
if (pendente) {
  if (numero === 2 && progresso.aguardando_agendamento_conferencia) {
    return "Aguardando definir data de conferência";
  }
  return "Aguardando";
}
```

Nenhuma mudança em `FluxogramaCanvas.jsx` — já repassa o objeto `etapa` (com `progresso`) inteiro
para `EtapaCard`.

## 3. Testes

### Backend — `dashboardService.buscarFluxoPedido.test.js`

Novo `describe`, seguindo o padrão de mocks posicionais já usado nesse arquivo (branch sem
pré-agendamentos — `genitoresRaw` vazio):

| Cenário | Expectativa |
|---|---|
| Fichas de consultora 100% preenchidas, conferência ainda não agendada (`itensCobertosConferencia < total`) | `etapas[1].progresso.aguardando_agendamento_conferencia === true` |
| Fichas de consultora 100% preenchidas E conferência já agendada para todos os itens | `false` |
| Nenhum item precisa de conferência (`total_itens_conferencia === 0`) | `false` |
| Fichas de consultora incompletas (nem todas preenchidas ainda) | `false` |

### Teste manual no navegador

1. Abrir um pedido com todas as fichas de consultora preenchidas mas sem conferência agendada —
   confirmar que o card da Etapa 2 mostra "Aguardando definir data de conferência" em vez de
   "Aguardando".
2. Agendar a conferência para todos os itens (Etapa 2 → "Definir Data de Conferência") — confirmar
   que, após recarregar o fluxo, o card volta a refletir o novo estado (a Etapa 1 fica concluída e a
   Etapa 2 passa a "ativa", mostrando `${conferidos} de ${total} conferidos`).
3. Abrir um pedido sem nenhum item que precise de conferência — confirmar que o card da Etapa 2
   continua mostrando "Aguardando" genérico (comportamento inalterado).
