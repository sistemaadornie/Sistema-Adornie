# Dashboard de Pedidos — Contagem Regressiva de Entrega + Etapa Atual — Design

**Data:** 2026-06-07
**Escopo:** Frontend apenas (sem mudanças de backend, banco ou API)

## Contexto

A tela `/dashboard-pedidos` (`DashboardPedidos.jsx`) já exibe, em cada `CardPedido`:
- Uma `BarraProgresso` com pontinhos representando as etapas (PDF → Verif. → Categ. → Pré-ag. N → Entrega), destacando a etapa atual em azul.
- Um pill discreto `dp-prazo` com o texto "Prazo em N dias", exibido somente quando existe um pré-agendamento "genitor" (agendamento com itens de pedido vinculados) com status `pre_agendado` ou `agendado`.

O backend (`dashboardService.js`) já calcula tudo que é necessário:
- `estagio.proximo_prazo`: data do genitor pre_agendado/agendado mais próximo (= "data de entrega").
- `estagio.dias_para_prazo`: dias restantes até essa data (pode ser negativo).
- `estagio.nivel_alerta`: `null` (>14 dias), `"atencao"` (≤14 dias), `"urgente"` (≤7 dias), `"atrasado"` (≤0 dias) — calculado por `calcNivelAlerta`.

A contagem **já começa** no momento em que um pré-agendamento genitor é criado (com status `pre_agendado` ou `agendado`) — esse comportamento permanece inalterado.

## Objetivo

1. Tornar a etapa atual do pedido claramente legível no card (hoje só um ponto azul pequeno na barra).
2. Redesenhar o indicador de prazo de entrega para ser **muito mais chamativo e escalar visualmente em urgência** conforme a data se aproxima — cor, tamanho e animação aumentam de intensidade — para criar uma sensação crescente de urgência em quem olha o dashboard.

Nenhuma mudança de modelo de dados, regra de negócio ou endpoint é necessária — é puramente uma camada de apresentação sobre dados que a API já retorna.

## 1. Texto "Etapa atual: X"

Abaixo da `BarraProgresso` existente (sem alterar os pontinhos), adicionar uma linha de texto legível identificando a etapa atual, derivada do mesmo `atualIdx` que a barra já calcula (primeira etapa não concluída):

```
▶ Etapa atual: Verificação
```

- Classe CSS: `.dp-etapa-atual-label`
- Estilo: texto pequeno (12-13px), cor que acompanha o nível de alerta quando houver atraso (mesma lógica de destaque que a barra já usa via `nivel_alerta === "atrasado"`), caso contrário cor neutra com o nome da etapa em negrito.
- Quando `atualIdx` aponta para a última etapa (tudo concluído), exibir "Etapa atual: Entrega" normalmente — sem tratamento especial.

## 2. Componente `ContagemEntrega` (substitui o bloco `dp-prazo`)

Novo componente que recebe `estagio` e renderiza um bloco de contagem regressiva com **escalada visual progressiva**, reaproveitando os 3 níveis de alerta já calculados no backend (`null`/`atencao`/`urgente`/`atrasado` — sem adicionar nenhum nível novo).

### Textos por nível

| Nível (`nivel_alerta`) | Faixa | Texto exibido |
|---|---|---|
| `null` (neutro) | > 14 dias | `Entrega em 24 dias` |
| `atencao` | ≤ 14 dias | `Entrega em 12 dias` |
| `urgente` | ≤ 7 dias | `⚠ Entrega em 5 dias` |
| `atrasado`, dias = 0 | hoje | `⚠ Entrega é hoje!` |
| `atrasado`, dias < 0 | atrasado | `⚠ Atrasado há 3 dias` |

Singular/plural tratado como já é feito hoje (`dia`/`dias`).

### Escalada visual por nível (cor + tamanho + animação)

| Nível | Classe CSS | Cor/fundo | Tamanho de fonte | Animação |
|---|---|---|---|---|
| neutro | `.dp-entrega-neutro` | tom neutro (cinza-azulado, mesma paleta de `dp-prazo` atual) | 13px | nenhuma (estático) |
| atencao | `.dp-entrega-atencao` | amarelo (`#422006` / `#fde68a`, igual à paleta `dp-badge-atencao` já existente) | 14px, negrito | nenhuma (estático) |
| urgente | `.dp-entrega-urgente` | laranja (`#431407` / `#fdba74`, igual à paleta `dp-badge-urgente`) | 16px, negrito | pulso suave (glow laranja, ciclo ~2.4s) |
| atrasado | `.dp-entrega-atrasado` | vermelho (`#450a0a` / `#fca5a5`, igual à paleta `dp-badge-atrasado`) | 18px, negrito | pulso forte (glow vermelho + leve scale, ciclo ~1.4s) |

As animações seguem o mesmo padrão visual (`@keyframes` de `box-shadow`/glow) já usado em `pf-no.pulsante` (`PedidoFluxo.css`), mantendo consistência com o restante do app — apenas com paletas de cor e velocidades diferentes por nível, conforme a tabela acima.

### Comportamento

- O bloco só é renderizado quando `estagio.proximo_prazo` existe (mesma condição de hoje).
- Não há novo nível "crítico" — os 3 níveis existentes (`atencao`/`urgente`/`atrasado`) cobrem toda a escalada.
- O bloco substitui completamente o `<div className="dp-prazo ...">` atual dentro de `CardPedido`.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Modificar | `frontend-web/src/pages/dashboard/DashboardPedidos.jsx` — novo componente `ContagemEntrega`, label de etapa atual em `BarraProgresso`, substituição do bloco `dp-prazo` |
| Modificar | `frontend-web/src/pages/dashboard/DashboardPedidos.css` — novas classes `.dp-entrega-*`, `.dp-etapa-atual-label`, `@keyframes` de pulso laranja/vermelho |

Nenhuma migration, endpoint ou service precisa ser alterado.

## Testes / Verificação

- Testar manualmente no navegador com pedidos em diferentes faixas de `dias_para_prazo` (>14, ≤14, ≤7, =0, <0) e confirmar que:
  - O texto e a cor mudam corretamente em cada faixa.
  - As animações de pulso aparecem somente nos níveis `urgente` e `atrasado`, com velocidades diferentes.
  - O texto "Etapa atual: X" reflete corretamente a primeira etapa não concluída em cada card.
- Confirmar que cards sem `proximo_prazo` (sem genitor agendado ainda) não exibem o bloco de contagem — comportamento inalterado.
