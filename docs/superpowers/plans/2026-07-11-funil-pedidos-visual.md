# Funil de Pedidos — Renome + Visual do Fluxo do Pedido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renomear a seção "Funil de produção · 8 etapas" da Dashboard do Gestor para "Funil de Pedidos" e reestilizar os 8 cards com o mesmo formato visual da tela de Fluxo do Pedido (faixa colorida no topo, ícone, conector com seta), usando as cores fixas do protótipo do fluxo em vez dos tokens de tema.

**Architecture:** Mudança isolada de frontend em dois arquivos existentes — `Dashboard.jsx` (markup/texto) e `Dashboard.css` (classes `.dash-funil-*`). Nenhuma mudança de backend, contrato de API, ou lógica de dados (contagens, gargalo, seleção de etapa continuam vindas do mesmo estado/endpoint).

**Tech Stack:** React (JSX), CSS puro (sem CSS-in-JS), Vite.

## Global Constraints

- Sem mudança de backend/endpoints (`/api/dashboard-gestor/funil`, `/funil/:numero`).
- Sem mudança na lógica de detecção de gargalo (campo `e.gargalo` continua vindo do backend, só muda como é exibido).
- Sem testes automatizados novos (página não tem suite de componente — projeto segue esse padrão para todas as páginas de Dashboard/Relatorios).
- Cores do funil ficam hardcoded no CSS (`#d97706`, `#f59e0b`, `#1e293b`, `#334155`, `#0d9488`, `#475569`, `#64748b`) — exceção deliberada de paleta só nesta seção, copiando exatamente `PedidoFluxo.css`, não os tokens `--color-*` do resto da Dashboard.
- Nome da etapa aparece **uma única vez** por card, no header colorido — não duplicar embaixo da contagem.
- Etapa selecionada não tem animação de pulso — só cor sólida laranja.

---

### Task 1: Reestruturar o JSX dos cards do funil e o título da seção

**Files:**
- Modify: `frontend-web/src/pages/Dashboard.jsx:1` (import do React)
- Modify: `frontend-web/src/pages/Dashboard.jsx:387` (título da seção)
- Modify: `frontend-web/src/pages/Dashboard.jsx:394-415` (markup dos 8 cards + conector)
- Modify: `frontend-web/src/pages/Dashboard.jsx:417-439` (círculo numerado do painel de detalhe)

**Interfaces:**
- Consumes: estado existente `funil` (`{ totalAtivos, etapas: [{ numero, nome, count, gargalo }] }`), `etapaSelecionada`, `setEtapaSelecionada`, `detalheEtapa` — todos já definidos em `Dashboard.jsx`, não mudam de forma.
- Produces: novas classes CSS consumidas pela Task 2: `.dash-funil-header`, `.dash-funil-titulo`, `.dash-funil-body`, `.dash-funil-icone`, `.dash-funil-conector`, e a classe de estado `.dash-funil-card.selecionada` (substitui a antiga `.dash-funil-card.ativa`).

- [ ] **Step 1: Adicionar o import default do `React`**

`Dashboard.jsx` hoje importa só nomes (`import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";`). O novo markup usa `<React.Fragment key={...}>` para intercalar card + conector numa lista (mesmo padrão já usado em `frontend-web/src/pages/pedidos/Pedidos.jsx:1`).

Editar a linha 1 de `Dashboard.jsx`:

```jsx
import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
```

- [ ] **Step 2: Renomear o título da seção**

Trocar (linha 387):

```jsx
<h3>Funil de produção · 8 etapas</h3>
```

por:

```jsx
<h3>Funil de Pedidos</h3>
```

- [ ] **Step 3: Adicionar o dicionário de ícones por etapa**

Logo abaixo da constante `NIVEL_LABEL` (por volta da linha 17 de `Dashboard.jsx`), adicionar:

```jsx
const FUNIL_ICONES = { 1: "📋", 2: "📐", 3: "⚙️", 4: "🔍", 5: "📅", 6: "📦", 7: "🚚", 8: "⭐" };
```

- [ ] **Step 4: Reescrever o markup dos cards do funil**

Substituir o bloco (linhas 394-415):

```jsx
              <div className="dash-funil-row">
                {funil.etapas.map((e) => {
                  const maxCount = Math.max(...funil.etapas.map((x) => x.count), 1);
                  return (
                    <div
                      key={e.numero}
                      className={`dash-funil-card${etapaSelecionada === e.numero ? " ativa" : ""}${e.gargalo ? " gargalo" : ""}`}
                      onClick={() => setEtapaSelecionada(e.numero)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="dash-funil-num">{e.numero}</span>
                        {e.gargalo && <span className="dash-funil-gargalo-badge">gargalo</span>}
                      </div>
                      <div className="dash-funil-count">{e.count}</div>
                      <div className="rel-kpi-sub">{e.nome}</div>
                      <div className="dash-funil-track">
                        <div className="dash-funil-fill" style={{ width: `${Math.max(10, Math.round((e.count / maxCount) * 100))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
```

por:

```jsx
              <div className="dash-funil-row">
                {funil.etapas.map((e, i) => {
                  const maxCount = Math.max(...funil.etapas.map((x) => x.count), 1);
                  return (
                    <React.Fragment key={e.numero}>
                      <div
                        className={`dash-funil-card${etapaSelecionada === e.numero ? " selecionada" : ""}`}
                        onClick={() => setEtapaSelecionada(e.numero)}
                      >
                        <div className="dash-funil-header">
                          <span className="dash-funil-num">{e.numero}</span>
                          <span className="dash-funil-titulo">{e.nome}</span>
                          {e.gargalo && <span className="dash-funil-gargalo-badge">gargalo</span>}
                        </div>
                        <div className="dash-funil-body">
                          <div className="dash-funil-icone">{FUNIL_ICONES[e.numero]}</div>
                          <div className="dash-funil-count">{e.count}</div>
                          <div className="dash-funil-track">
                            <div className="dash-funil-fill" style={{ width: `${Math.max(10, Math.round((e.count / maxCount) * 100))}%` }} />
                          </div>
                        </div>
                      </div>
                      {i < funil.etapas.length - 1 && <div className="dash-funil-conector" />}
                    </React.Fragment>
                  );
                })}
              </div>
```

- [ ] **Step 5: Recolorir o círculo numerado do painel de detalhe**

Trocar (linha 421):

```jsx
                      <span className="dash-funil-num" style={{ background: "var(--color-primary)", color: "var(--color-primary-btn-text)" }}>{detalheEtapa.numero}</span>
```

por:

```jsx
                      <span className="dash-funil-num" style={{ background: "#f59e0b", color: "#fff" }}>{detalheEtapa.numero}</span>
```

- [ ] **Step 6: Verificar que o projeto builda sem erros**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros (nenhum teste automatizado cobre esta página — a verificação aqui é só de compilação/lint do bundler).

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/Dashboard.jsx
git commit -m "feat(dashboard-gestor): renomeia funil de producao para Funil de Pedidos e reestrutura cards"
```

---

### Task 2: Reescrever o CSS dos cards do funil com a paleta e o formato do Fluxo do Pedido

**Files:**
- Modify: `frontend-web/src/pages/Dashboard.css:116-174` (bloco `/* ── FUNIL ── */`)

**Interfaces:**
- Consumes: classes produzidas pela Task 1 (`.dash-funil-card`, `.dash-funil-header`, `.dash-funil-num`, `.dash-funil-titulo`, `.dash-funil-gargalo-badge`, `.dash-funil-body`, `.dash-funil-icone`, `.dash-funil-count`, `.dash-funil-track`, `.dash-funil-fill`, `.dash-funil-conector`, modificador `.selecionada`).
- Produces: nada consumido por outras tasks (é a última mudança visual).

- [ ] **Step 1: Substituir o bloco `/* ── FUNIL ── */` inteiro**

Substituir as linhas 116-174 de `Dashboard.css` (do comentário `/* ── FUNIL ── */` até o fim do media query que hoje contém `.dash-funil-row { flex-wrap: wrap; }` / `.dash-funil-card { flex: 1 1 45%; }`) por:

```css
/* ── FUNIL ── */

.dash-funil-row {
  display: flex;
  align-items: stretch;
  gap: 0;
}

.dash-funil-card {
  flex: 1;
  min-width: 0;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid #334155;
  background: var(--color-surface-soft);
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.dash-funil-card:hover { transform: translateY(-3px); box-shadow: 0 8px 32px rgba(0,0,0,.35); }

.dash-funil-card.selecionada { border-color: #f59e0b; }

.dash-funil-header {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #1e293b, #334155);
}
.dash-funil-card.selecionada .dash-funil-header {
  background: linear-gradient(135deg, #d97706, #f59e0b);
}

.dash-funil-num {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: rgba(255,255,255,.2);
  color: #fff;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.dash-funil-titulo {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .4px;
  text-transform: uppercase;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-funil-gargalo-badge {
  font-size: 9px; font-weight: 700;
  color: #fff;
  background: rgba(0,0,0,.28);
  border: 1px solid rgba(255,255,255,.3);
  padding: 2px 7px;
  border-radius: 999px;
  flex-shrink: 0;
}

.dash-funil-body {
  padding: 14px;
  text-align: center;
}

.dash-funil-icone { font-size: 26px; line-height: 1; margin-bottom: 8px; }

.dash-funil-count {
  font-family: var(--font-title);
  font-size: 24px; font-weight: 700;
  color: var(--color-text);
}

.dash-funil-track {
  height: 5px;
  border-radius: 4px;
  background: var(--color-border);
  margin-top: 10px;
  overflow: hidden;
}
.dash-funil-fill { height: 100%; border-radius: 4px; background: #0d9488; }

.dash-funil-conector {
  width: 20px; height: 2px; flex-shrink: 0; align-self: center;
  background: linear-gradient(90deg, #475569, #64748b);
  position: relative;
}
.dash-funil-conector::after {
  content: '▶'; position: absolute; right: -7px; top: 50%;
  transform: translateY(-50%);
  color: #64748b; font-size: 9px;
}

@media (max-width: 900px) {
  .dash-funil-row { flex-wrap: wrap; gap: 9px; }
  .dash-funil-card { flex: 1 1 45%; }
  .dash-funil-conector { display: none; }
}
```

- [ ] **Step 2: Verificar que o projeto builda sem erros**

Run: `cd frontend-web && npm run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/Dashboard.css
git commit -m "feat(dashboard-gestor): reestiliza cards do funil de pedidos com o formato do fluxo do pedido"
```

---

### Task 3: Teste manual no navegador

**Files:** nenhum (só verificação)

**Interfaces:**
- Consumes: as Tasks 1 e 2 completas, servidor de dev rodando (`npm run dev` em `frontend-web/`) e backend rodando (`/api/dashboard-gestor/funil`).

- [ ] **Step 1: Abrir a Dashboard do Gestor no navegador**

Rodar `cd frontend-web && npm run dev`, abrir `/dashboard` logado como usuário com permissão `ADMIN_MASTER` ou `OPERADOR_AGENDA`.

- [ ] **Step 2: Conferir o título**

A seção do funil deve mostrar "Funil de Pedidos" (sem "· 8 etapas") como título.

- [ ] **Step 3: Conferir os 8 cards**

Cada card deve ter: faixa cinza escura no topo com círculo numerado + nome da etapa; ícone (📋📐⚙️🔍📅📦🚚⭐) no corpo; contagem grande; barra de progresso com preenchimento teal; seta conectando ao próximo card (exceto o último).

- [ ] **Step 4: Conferir a seleção de etapa**

Clicar em um card — o header dele deve virar laranja (sem pulsar/animar), os demais continuam cinza. O painel de detalhe abaixo deve aparecer com o círculo numerado também laranja.

- [ ] **Step 5: Conferir o badge de gargalo**

Se algum card tiver `gargalo: true` (etapa com maior contagem), o badge "gargalo" deve aparecer no header dela, independente de estar selecionada ou não (cor do header não muda por causa do gargalo, só por seleção).

- [ ] **Step 6: Conferir responsividade**

Redimensionar a janela para menos de 900px de largura — os cards devem quebrar em duas colunas (45% cada) e as setas conectoras devem desaparecer (evita layout quebrado quando os cards quebram linha).

- [ ] **Step 7: Conferir tema claro**

Alternar para o tema claro (se houver toggle) e confirmar que os cards continuam legíveis — as cores do funil são fixas (não usam tokens de tema), então devem ficar iguais em ambos os temas.

Não commitar nada nesta task — é só verificação. Se algo estiver quebrado, voltar para a Task 1 ou 2 e corrigir.
