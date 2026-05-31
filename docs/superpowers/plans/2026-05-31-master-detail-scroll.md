# Layout Master-Detail com Scroll Independente — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as colunas de lista e detalhe nas telas de Pedidos e Clientes scrollarem de forma independente, garantindo que ao clicar qualquer item da lista o painel de detalhe seja imediatamente visível sem precisar rolar a página.

**Architecture:** Substituir `position: sticky` e scroll da página inteira por dois painéis de altura fixa com `overflow-y: auto` cada. O `.pd-layout` / `.cl-layout` passa a ter `height: calc(100vh - var(--header-height) - 260px)` e cada coluna `height: 100%; overflow-y: auto`. No mobile (< 900px) o layout reverte para coluna única e usa `scrollIntoView` ao selecionar.

**Tech Stack:** React (JSX), CSS por página (Pedidos.css / Clientes.css), Vite

---

## Arquivos modificados

| Arquivo | O que muda |
|---|---|
| `frontend-web/src/pages/pedidos/Pedidos.css` | `.pd-layout` height fixa + overflow; `.pd-lista` scroll; `.pd-detalhe` remove sticky |
| `frontend-web/src/pages/pedidos/Pedidos.jsx` | `useRef` + `useEffect` para scroll mobile |
| `frontend-web/src/pages/clientes/Clientes.css` | Mesmo padrão para `.cl-layout`, `.cl-lista`, `.cl-detalhe` |
| `frontend-web/src/pages/clientes/Clientes.jsx` | `useEffect` + `useRef` para scroll mobile |

Nenhum CSS global é alterado.

---

## Task 1: Pedidos.css — layout grid com altura fixa e colunas com scroll

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.css`

- [ ] **Step 1: Substituir `.pd-layout` e seu media query**

Localizar linhas 18–27 em `Pedidos.css`:

```css
.pd-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 20px;
  align-items: start;
  min-height: calc(100vh - 220px);
}
@media (max-width: 900px) {
  .pd-layout { grid-template-columns: 1fr; }
}
```

Substituir pelo bloco completo:

```css
.pd-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 20px;
  height: calc(100vh - var(--header-height) - 260px);
  overflow: hidden;
}
@media (max-width: 900px) {
  .pd-layout {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }
}
```

- [ ] **Step 2: Adicionar scroll independente à `.pd-lista`**

Localizar linhas 30–34 em `Pedidos.css`:

```css
.pd-lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

Substituir por:

```css
.pd-lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
  padding: 2px;
}
@media (max-width: 900px) {
  .pd-lista {
    height: auto;
    overflow-y: visible;
  }
}
```

- [ ] **Step 3: Remover sticky de `.pd-detalhe` e adicionar scroll próprio**

Localizar linhas 117–126 em `Pedidos.css`:

```css
.pd-detalhe {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  min-height: 400px;
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
```

Substituir por:

```css
.pd-detalhe {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  height: 100%;
  overflow-y: auto;
}
@media (max-width: 900px) {
  .pd-detalhe {
    height: auto;
    overflow-y: visible;
    min-height: 200px;
  }
}
```

> **Nota:** `.pd-detalhe-header { position: sticky; top: 0; }` (linha 128) **não muda** — o header interno do painel continua fixo dentro do scroll da coluna.

- [ ] **Step 4: Verificar visualmente — Pedidos (desktop)**

```bash
cd frontend-web && npm run dev
```

Abrir `http://localhost:5173` → tela **Pedidos**. Confirmar:
- [ ] As duas colunas têm a mesma altura, preenchendo a tela abaixo da toolbar
- [ ] A coluna esquerda (lista) tem sua própria scrollbar quando há muitos pedidos
- [ ] A coluna direita (detalhe) tem sua própria scrollbar quando o conteúdo é extenso
- [ ] Ao clicar um pedido que está no fundo da lista, o detalhe aparece imediatamente à direita sem deslocar a página

> **Ajuste do offset:** se o layout aparecer cortado verticalmente, aumente o valor `260px`; se sobrar espaço em branco excessivo abaixo, diminua. Referência: `Agendamentos.css` usa `190px` com toolbar menor.

---

## Task 2: Pedidos.jsx — scroll automático no mobile ao selecionar item

**Files:**
- Modify: `frontend-web/src/pages/pedidos/Pedidos.jsx`

- [ ] **Step 1: Adicionar `useRef` ao import**

Localizar linha 1:

```javascript
import { useEffect, useMemo, useState } from "react";
```

Substituir por:

```javascript
import { useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Declarar ref do painel de detalhe**

Após `const navigate = useNavigate();` (linha ~71), adicionar:

```javascript
const detalheRef = useRef(null);
```

- [ ] **Step 3: Adicionar useEffect para scroll mobile**

Após o `useMemo` de `pedidoDetalheAtual` (linhas 93–96), adicionar:

```javascript
useEffect(() => {
  if (pedidoDetalheAtual && window.innerWidth < 900) {
    detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}, [pedidoDetalheAtual]);
```

- [ ] **Step 4: Conectar ref ao elemento `.pd-detalhe`**

Localizar linha 264:

```jsx
<div className="pd-detalhe">
```

Substituir por:

```jsx
<div className="pd-detalhe" ref={detalheRef}>
```

- [ ] **Step 5: Verificar comportamento mobile**

No browser com DevTools aberto, ativar modo responsivo e definir largura < 900px. Selecionar um pedido da lista: a página deve rolar suavemente até o painel de detalhe.

---

## Task 3: Commit — Pedidos

- [ ] **Step 1: Commit**

```bash
git add frontend-web/src/pages/pedidos/Pedidos.css frontend-web/src/pages/pedidos/Pedidos.jsx
git commit -m "feat(pedidos): painéis lista e detalhe com scroll independente"
```

---

## Task 4: Clientes.css — mesmo padrão de layout

**Files:**
- Modify: `frontend-web/src/pages/clientes/Clientes.css`

- [ ] **Step 1: Substituir `.cl-layout` e seu media query**

Localizar linhas 54–66 em `Clientes.css`:

```css
.cl-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  align-items: start;
  min-height: calc(100vh - 220px);
}

@media (max-width: 900px) {
  .cl-layout {
    grid-template-columns: 1fr;
  }
}
```

Substituir por:

```css
.cl-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  height: calc(100vh - var(--header-height) - 260px);
  overflow: hidden;
}

@media (max-width: 900px) {
  .cl-layout {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }
}
```

- [ ] **Step 2: Adicionar scroll independente à `.cl-lista`**

Localizar linhas 69–73 em `Clientes.css`:

```css
.cl-lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

Substituir por:

```css
.cl-lista {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
  padding: 2px;
}
@media (max-width: 900px) {
  .cl-lista {
    height: auto;
    overflow-y: visible;
  }
}
```

- [ ] **Step 3: Remover sticky de `.cl-detalhe` e adicionar scroll próprio**

Localizar linhas 193–200 em `Clientes.css`:

```css
.cl-detalhe {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  min-height: 400px;
  position: sticky;
  top: 24px;
}
```

Substituir por:

```css
.cl-detalhe {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  height: 100%;
  overflow-y: auto;
}
@media (max-width: 900px) {
  .cl-detalhe {
    height: auto;
    overflow-y: visible;
    min-height: 200px;
  }
}
```

- [ ] **Step 4: Verificar visualmente — Clientes (desktop)**

Abrir `http://localhost:5173` → tela **Clientes**. Confirmar:
- [ ] Colunas com altura uniforme abaixo da toolbar
- [ ] Scrollbar própria em cada coluna
- [ ] Clicar cliente no fundo da lista → detalhe imediatamente visível sem mover a página

Ajustar `260px` em `.cl-layout` se necessário (mesma lógica do Task 1).

---

## Task 5: Clientes.jsx — scroll automático no mobile ao selecionar cliente

**Files:**
- Modify: `frontend-web/src/pages/clientes/Clientes.jsx`

- [ ] **Step 1: Adicionar `useEffect` ao import**

Localizar linha 1:

```javascript
import { useState, useMemo, useRef } from "react";
```

Substituir por:

```javascript
import { useState, useMemo, useRef, useEffect } from "react";
```

- [ ] **Step 2: Declarar ref do painel de detalhe**

Após as declarações de estado (`useState`) na função `Clientes()` (por volta da linha 62), adicionar:

```javascript
const detalheRef = useRef(null);
```

- [ ] **Step 3: Adicionar useEffect para scroll mobile**

Após o `useMemo` de `clienteDetalheAtual` (linhas 83–86), adicionar:

```javascript
useEffect(() => {
  if (clienteDetalheAtual && window.innerWidth < 900) {
    detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}, [clienteDetalheAtual]);
```

- [ ] **Step 4: Conectar ref ao elemento `.cl-detalhe`**

Localizar linha 278:

```jsx
<div className="cl-detalhe">
```

Substituir por:

```jsx
<div className="cl-detalhe" ref={detalheRef}>
```

- [ ] **Step 5: Verificar comportamento mobile**

Ativar modo responsivo no DevTools com largura < 900px. Selecionar um cliente: a página deve rolar suavemente até o painel de detalhe.

---

## Task 6: Commit — Clientes

- [ ] **Step 1: Commit**

```bash
git add frontend-web/src/pages/clientes/Clientes.css frontend-web/src/pages/clientes/Clientes.jsx
git commit -m "feat(clientes): painéis lista e detalhe com scroll independente"
```
