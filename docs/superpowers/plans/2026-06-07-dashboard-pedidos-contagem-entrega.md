# Dashboard de Pedidos — Contagem Regressiva de Entrega + Etapa Atual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o pill discreto "Prazo em N dias" dos cards do dashboard por um bloco de contagem regressiva (`ContagemEntrega`) que escala visualmente em urgência (cor/tamanho/animação) conforme a data de entrega se aproxima, e adicionar um texto legível "Etapa atual: X" abaixo da barra de progresso de cada card.

**Architecture:** Mudança puramente de apresentação em `DashboardPedidos.jsx` (novo componente `ContagemEntrega`, ajuste em `BarraProgresso`, troca do bloco `dp-prazo`) e `DashboardPedidos.css` (novas classes `.dp-entrega-*`, `.dp-etapa-atual-label`, `@keyframes` de pulso). Os dados (`estagio.proximo_prazo`, `estagio.dias_para_prazo`, `estagio.nivel_alerta`) já vêm prontos do backend — nenhuma mudança de API, service ou banco.

**Tech Stack:** React 18, CSS puro (sem biblioteca de animação — `@keyframes` nativo), Vite dev server.

**Spec:** `docs/superpowers/specs/2026-06-07-dashboard-pedidos-contagem-entrega-design.md`

---

## File Map

| Ação | Caminho |
|---|---|
| Modificar | `frontend-web/src/pages/dashboard/DashboardPedidos.jsx` — novo componente `ContagemEntrega`, label de etapa atual em `BarraProgresso`, troca do bloco `dp-prazo` por `<ContagemEntrega estagio={estagio} />` |
| Modificar | `frontend-web/src/pages/dashboard/DashboardPedidos.css` — novas classes `.dp-entrega`, `.dp-entrega-neutro/atencao/urgente/atrasado`, `.dp-etapa-atual-label`, `@keyframes pulso-laranja`/`pulso-vermelho` |

---

## Task 1: Componente `ContagemEntrega`

**Files:**
- Modificar: `frontend-web/src/pages/dashboard/DashboardPedidos.jsx:14` (logo após a constante `ALERTA_LABELS`, antes de `BarraProgresso`)

O componente recebe `estagio` e calcula o texto + classe CSS de acordo com `nivel_alerta` e `dias_para_prazo`. Ele só renderiza algo quando `estagio.proximo_prazo` existe — mesma condição do bloco `dp-prazo` que está sendo substituído.

- [ ] **Step 1: Adicionar o componente `ContagemEntrega` no arquivo**

Localizar a linha 14 (`const ALERTA_LABELS = ...`). Adicionar logo abaixo, antes da função `BarraProgresso`:

```jsx
function ContagemEntrega({ estagio }) {
  if (!estagio.proximo_prazo) return null;

  const dias  = estagio.dias_para_prazo;
  const nivel = estagio.nivel_alerta || "neutro";

  let texto;
  if (dias > 0) {
    texto = `Entrega em ${dias} dia${dias === 1 ? "" : "s"}`;
  } else if (dias === 0) {
    texto = "Entrega é hoje!";
  } else {
    const atraso = Math.abs(dias);
    texto = `Atrasado há ${atraso} dia${atraso === 1 ? "" : "s"}`;
  }

  const comAlerta = nivel === "urgente" || nivel === "atrasado";
  if (comAlerta) texto = `⚠ ${texto}`;

  return <div className={`dp-entrega dp-entrega-${nivel}`}>{texto}</div>;
}
```

- [ ] **Step 2: Substituir o bloco `dp-prazo` por `ContagemEntrega` dentro de `CardPedido`**

Localizar dentro de `CardPedido` (por volta da linha 97-103):

```jsx
      {estagio.proximo_prazo && (
        <div className={`dp-prazo dp-prazo-${estagio.nivel_alerta || ""}`}>
          {estagio.dias_para_prazo <= 0
            ? "Prazo vencido"
            : `Prazo em ${estagio.dias_para_prazo} dia${estagio.dias_para_prazo === 1 ? "" : "s"}`}
        </div>
      )}
```

Substituir por:

```jsx
      <ContagemEntrega estagio={estagio} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/dashboard/DashboardPedidos.jsx
git commit -m "feat(dashboard): componente ContagemEntrega substitui pill de prazo nos cards"
```

---

## Task 2: Texto "Etapa atual: X" na `BarraProgresso`

**Files:**
- Modificar: `frontend-web/src/pages/dashboard/DashboardPedidos.jsx:32-58` (função `BarraProgresso`)

A função `BarraProgresso` já calcula `atualIdx` (índice da primeira etapa não concluída). Vamos expor o rótulo dessa etapa em um texto legível abaixo da barra.

- [ ] **Step 1: Capturar a etapa atual e adicionar o texto no JSX retornado**

Localizar dentro de `BarraProgresso` (por volta da linha 32-35):

```jsx
  // Índice da etapa atual (primeira não concluída)
  let atualIdx = etapas.findIndex((e) => !e.ok);
  if (atualIdx === -1) atualIdx = etapas.length - 1;
```

Logo abaixo dessas linhas, adicionar:

```jsx
  const etapaAtual = etapas[atualIdx];
```

Em seguida, localizar o `return` da função (por volta da linha 36-58):

```jsx
  return (
    <div className="dp-barra">
      {etapas.map((etapa, idx) => {
        ...
      })}
    </div>
  );
```

Envolver o `<div className="dp-barra">` existente em um `<div>` (fragmento) e adicionar o texto da etapa atual logo abaixo dele:

```jsx
  return (
    <>
      <div className="dp-barra">
        {etapas.map((etapa, idx) => {
          let cls = "dp-etapa";
          if (idx < atualIdx) cls += " dp-ok";
          else if (idx === atualIdx) {
            cls += " dp-atual";
            if (estagio.nivel_alerta === "atrasado") cls += " dp-atrasado";
          }
          return (
            <React.Fragment key={etapa.key}>
              <div className={cls}>
                <div className="dp-ponto" />
                <span className="dp-label">{etapa.label}</span>
              </div>
              {idx < etapas.length - 1 && (
                <div className={`dp-linha ${idx < atualIdx ? "dp-ok" : ""}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className={`dp-etapa-atual-label ${estagio.nivel_alerta === "atrasado" ? "dp-etapa-atual-atrasado" : ""}`}>
        ▶ Etapa atual: <strong>{etapaAtual.label}</strong>
      </div>
    </>
  );
```

> **Nota:** o corpo do `.map()` é o mesmo já existente — a única mudança estrutural é trocar o `<div className="dp-barra">...</div>` solto por um fragmento `<>...</>` contendo a barra e o novo texto.

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/dashboard/DashboardPedidos.jsx
git commit -m "feat(dashboard): label \"Etapa atual: X\" abaixo da barra de progresso do card"
```

---

## Task 3: CSS — `.dp-entrega-*`, `.dp-etapa-atual-label` e animações de pulso

**Files:**
- Modificar: `frontend-web/src/pages/dashboard/DashboardPedidos.css:142-154` (bloco `/* ── Prazo alert ── */`)

Vamos substituir o bloco CSS antigo do `dp-prazo` (que não será mais usado) pelas novas classes de `ContagemEntrega`, e adicionar a classe do label de etapa atual perto do bloco da barra de progresso.

- [ ] **Step 1: Substituir o bloco `/* ── Prazo alert ── */` pelas novas classes de contagem**

Localizar (linhas 142-154):

```css
/* ── Prazo alert ── */
.dp-prazo {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 12px;
  display: inline-block;
}

.dp-prazo-atrasado { background: #450a0a; color: #fca5a5; }
.dp-prazo-urgente  { background: #431407; color: #fdba74; }
.dp-prazo-atencao  { background: #422006; color: #fde68a; }
```

Substituir por:

```css
/* ── Contagem regressiva de entrega ── */
.dp-entrega {
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  display: inline-block;
  transition: font-size 0.2s, color 0.2s, background 0.2s;
}

.dp-entrega-neutro {
  font-size: 13px;
  font-weight: 500;
  background: rgba(148, 163, 184, 0.08);
  color: var(--color-text-muted, #94a3b8);
}

.dp-entrega-atencao {
  font-size: 14px;
  background: #422006;
  color: #fde68a;
}

.dp-entrega-urgente {
  font-size: 16px;
  background: #431407;
  color: #fdba74;
  animation: dp-pulso-laranja 2.4s infinite;
}

.dp-entrega-atrasado {
  font-size: 18px;
  background: #450a0a;
  color: #fca5a5;
  animation: dp-pulso-vermelho 1.4s infinite;
}

@keyframes dp-pulso-laranja {
  0%, 100% { box-shadow: 0 0 0 rgba(249, 115, 22, 0); }
  50%      { box-shadow: 0 0 14px rgba(249, 115, 22, 0.55); }
}

@keyframes dp-pulso-vermelho {
  0%, 100% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); transform: scale(1); }
  50%      { box-shadow: 0 0 20px rgba(239, 68, 68, 0.7); transform: scale(1.03); }
}
```

- [ ] **Step 2: Adicionar a classe do label "Etapa atual" logo após o bloco da barra de progresso**

Localizar o final do bloco da barra de progresso — a linha (atualmente ~206):

```css
.dp-etapa.dp-atrasado .dp-label { color: #ef4444; font-weight: 600; }
```

Adicionar logo abaixo dessa linha:

```css

.dp-etapa-atual-label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

.dp-etapa-atual-label strong {
  color: var(--color-text, #f1f5f9);
  font-weight: 600;
}

.dp-etapa-atual-label.dp-etapa-atual-atrasado {
  color: #fca5a5;
}

.dp-etapa-atual-label.dp-etapa-atual-atrasado strong {
  color: #fca5a5;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/dashboard/DashboardPedidos.css
git commit -m "feat(dashboard): estilos de escalada visual para ContagemEntrega + label de etapa atual"
```

---

## Task 4: Verificação manual no navegador

**Files:** nenhum (apenas verificação)

Não há suíte de testes automatizados para componentes de página neste projeto frontend — a verificação é manual, no navegador, como já é prática estabelecida (ver plano `2026-06-04-dashboard-pedidos-fluxo.md`).

- [ ] **Step 1: Subir o backend**

```bash
cd backend && node server.js
```

Esperado: `Servidor rodando na porta...` sem erros.

- [ ] **Step 2: Subir o frontend**

```bash
cd frontend-web && npm run dev
```

Esperado: Vite expõe a URL local (ex: `http://localhost:5173`).

- [ ] **Step 3: Abrir o dashboard e verificar visualmente os 4 níveis de contagem**

Acessar `/dashboard-pedidos` no navegador autenticado. Para cobrir os 4 cenários (neutro / atenção / urgente / atrasado), pode ser necessário ajustar temporariamente a `data` de um agendamento "genitor" existente no banco (ex: via `UPDATE agendamentos SET data = CURRENT_DATE + INTERVAL '20 days' WHERE id = <id>`) e recarregar a página entre cada teste. Confirmar:

- **>14 dias** → bloco com texto `Entrega em N dias`, fundo neutro (cinza-azulado), tamanho ~13px, sem animação.
- **≤14 dias** → bloco amarelo (`#422006`/`#fde68a`), texto um pouco maior (~14px), em negrito, sem animação.
- **≤7 dias** → bloco laranja (`#431407`/`#fdba74`), texto `⚠ Entrega em N dias`, ~16px, com pulso suave (glow laranja pulsando).
- **=0 dias** → texto `⚠ Entrega é hoje!`, mesmo tratamento visual de "atrasado" (vermelho, maior, pulso forte).
- **<0 dias** → texto `⚠ Atrasado há N dias`, fundo vermelho (`#450a0a`/`#fca5a5`), ~18px, pulso forte com leve scale.

- [ ] **Step 4: Verificar o texto "Etapa atual"**

Em pelo menos 3 cards com pedidos em estágios diferentes (ex: um aguardando PDF, um aguardando verificação, um com pré-agendamento ativo), confirmar que o texto `▶ Etapa atual: <Label>` abaixo da barra de progresso corresponde exatamente à etapa destacada em azul (ou vermelho, se atrasada) na barra de pontinhos acima dele.

- [ ] **Step 5: Confirmar que cards sem pré-agendamento genitor continuam sem o bloco de contagem**

Localizar um card cujo `estagio.proximo_prazo` seja `null` (sem pré-agendamento `pre_agendado`/`agendado` vinculado a itens do pedido) e confirmar que **nenhum** bloco `ContagemEntrega` é renderizado — comportamento idêntico ao do antigo `dp-prazo`.

- [ ] **Step 6: Reverter qualquer alteração de dados feita para teste**

Se a `data` de algum agendamento foi alterada no Step 3 para fins de teste, restaurá-la ao valor original:

```sql
UPDATE agendamentos SET data = '<valor_original>' WHERE id = <id>;
```

---

## Self-Review

### Spec coverage checklist

| Requisito do spec | Implementado em |
|---|---|
| Componente `ContagemEntrega` com escalada por nível (neutro/atencao/urgente/atrasado) | Task 1 |
| Textos por nível (`Entrega em N dias`, `⚠ Entrega em N dias`, `⚠ Entrega é hoje!`, `⚠ Atrasado há N dias`) | Task 1, Step 1 |
| Substituição do bloco `dp-prazo` por `ContagemEntrega` | Task 1, Step 2 |
| Texto "Etapa atual: X" abaixo da `BarraProgresso`, derivado de `atualIdx` | Task 2 |
| Tratamento de cor especial quando etapa atual está atrasada | Task 2, Step 1 + Task 3, Step 2 |
| CSS de escalada visual (cor + tamanho) reaproveitando paleta de `dp-badge-*` | Task 3, Step 1 |
| Animação de pulso suave (urgente, ~2.4s) e forte (atrasado, ~1.4s, com leve scale) | Task 3, Step 1 |
| Verificação manual dos 4 níveis + comportamento sem genitor | Task 4 |

### Potential issues

1. **Dados de teste para os 4 níveis:** como os dados reais do dashboard variam, o Task 4 orienta ajustar temporariamente a `data` de um agendamento genitor existente via SQL para forçar cada faixa — e reverter ao final (Step 6).
2. **Fragmento `<>...</>` em `BarraProgresso`:** a função já importa `React` no topo do arquivo (`import React, ...`), então `<>...</>` (atalho de `React.Fragment`) funciona sem import adicional.
