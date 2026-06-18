# Design: Bloquear iniciar/não concluído em agendamentos pré-agendados

**Data:** 2026-06-18
**Status:** Aprovado

---

## Contexto

Agendamentos com `status='pre_agendado'` representam um compromisso ainda não confirmado (ex.: pré-agendamento de instalação criado a partir da Etapa 1 do fluxo de pedido). Eles devem ser **somente para visualização** até serem confirmados (`status='agendado'`) — não podem ser iniciados ("Em andamento") nem marcados como "Não concluído" diretamente.

**Estado atual:**

- **PWA do instalador** (`frontend-instalador/src/utils/agendamentos.js:119`): `STATUS_INSTALADOR_ACOES.podeIniciar` inclui `"pre_agendado"` na lista de status que liberam o botão "▶ Iniciar atendimento" em `AgendamentoDetalhe.jsx`. Isso é o bug — um agendamento pré-agendado mostra o botão de iniciar.
- A ação "Não concluído" só aparece quando `podeFinalizar(status)` é verdadeiro, isto é, `status === "andamento"`. Como `pre_agendado` nunca é `"andamento"`, ela já não é alcançável a partir de um pré-agendado — corrigir `podeIniciar` é suficiente no frontend da PWA.
- **Sistema web** (`frontend-web/src/pages/agendamentos/Agendamentos.jsx` e `AgendamentosInstalador.jsx`): já restringe corretamente — `STATUS_ACOES_GESTOR`, `STATUS_ACOES_COMERCIAL` e `STATUS_ACOES_INSTALADOR` só liberam `["agendado", "cancelado"]` (ou nada) a partir de `pre_agendado`. Nenhuma mudança necessária aqui.
- **Backend** (`backend/src/services/agendamentoService.js: alterarStatus`, usado pela rota `PUT /agendamentos/:id/status`): não valida o status atual do agendamento antes de aplicar a transição. Hoje, qualquer chamada à API com `status: "andamento"`, `"concluido"` ou `"nao_concluido"` é aceita independentemente do status atual ser `pre_agendado`. A única proteção existente é a UI — o que não é suficiente como garantia do sistema.
- **App mobile Flutter** (`mobile/lib/features/agendamentos/screens/agendamento_detail_screen.dart`): tem o mesmo tipo de bug (mostra os 3 botões de status sem checar o status atual), mas o app parece não ser mantido (sem commits recentes relevantes) — fora de escopo deste design.

## Objetivo

1. PWA: remover `"pre_agendado"` de `podeIniciar`, escondendo o botão "Iniciar atendimento" quando o agendamento ainda está pré-agendado.
2. Backend: rejeitar (HTTP 400) qualquer chamada a `alterarStatus` que tente mover um agendamento de `pre_agendado` para `"andamento"`, `"concluido"` ou `"nao_concluido"` — garantindo a regra no servidor, independente do cliente que chamar a API.

---

## 1. PWA — `frontend-instalador/src/utils/agendamentos.js`

```js
export const STATUS_INSTALADOR_ACOES = {
  podeIniciar:  (status) => ["agendado", "atrasado", "aguardando", "retorno"].includes(status),
  podeFinalizar:(status) => status === "andamento",
  finalizado:   (status) => ["concluido", "nao_concluido", "cancelado"].includes(status),
};
```

(Único diff: `"pre_agendado"` removido do array de `podeIniciar`.)

Efeito em `AgendamentoDetalhe.jsx`: a seção "Ação" com o botão "▶ Iniciar atendimento" (linha 308) deixa de aparecer para `ag.status === "pre_agendado"`. Nenhum outro trecho do arquivo precisa mudar — a seção "Finalizar" (não concluído/concluir) já depende de `podeFinalizar`, que continua restrita a `"andamento"`.

## 2. Backend — `backend/src/services/agendamentoService.js: alterarStatus`

Após a busca do agendamento existente (linha ~675-679, que já seleciona `status AS status_anterior`), adicionar a validação antes do bloco específico de Conferência:

```js
const ACOES_BLOQUEADAS_DE_PRE_AGENDADO = ["andamento", "concluido", "nao_concluido"];
if (existe.rows[0].status_anterior === "pre_agendado" && ACOES_BLOQUEADAS_DE_PRE_AGENDADO.includes(status)) {
  const e = new Error("Agendamentos pré-agendados são somente para visualização — confirme o agendamento antes de iniciar ou concluir.");
  e.status = 400;
  throw e;
}
```

Isso bloqueia a transição para qualquer um dos três status de execução quando o status atual é `pre_agendado`, para qualquer perfil de usuário (instalador, gestor, comercial). A transição `pre_agendado → agendado` (confirmação) e `pre_agendado → cancelado` continuam permitidas, pois não estão na lista bloqueada.

---

## Testes

**Backend:** adicionar teste em `backend/src/__tests__/` (arquivo existente de agendamentos ou novo) cobrindo:
- `alterarStatus` com status atual `pre_agendado` e novo status `"andamento"` → rejeita com erro 400.
- Idem para `"concluido"` e `"nao_concluido"`.
- `alterarStatus` com status atual `pre_agendado` e novo status `"agendado"` ou `"cancelado"` → permanece permitido (não lança).

**Frontend:** sem testes automatizados em `frontend-instalador` (não há suíte configurada) e sem testes em `frontend-web` (não precisa mudar). Verificação manual:

1. Na PWA, abrir um agendamento com status "Pré-agendado" → seção "Ação" com "Iniciar atendimento" não aparece; nenhum botão de ação é exibido (já que `podeFinalizar`/`finalizado` também são falsos para esse status).
2. Via `curl`/Postman, autenticado, chamar `PUT /api/agendamentos/<id>/status` com `status=andamento` para um agendamento `pre_agendado` → espera HTTP 400 com a mensagem de erro.
3. Confirmar que o fluxo normal de confirmação (`pre_agendado → agendado` pelo sistema web) continua funcionando sem erro.

## Fora de escopo

- App mobile Flutter (`mobile/`) — mesmo tipo de bug presente, mas o app não recebe manutenção ativa; não há frontend-web a corrigir (já está certo).
