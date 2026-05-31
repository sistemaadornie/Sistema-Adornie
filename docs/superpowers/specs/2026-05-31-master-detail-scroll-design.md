# Design: Painéis Master-Detail com Scroll Independente

**Data:** 2026-05-31  
**Escopo:** Telas de Pedidos e Clientes  
**Problema:** Ao rolar a lista para baixo e selecionar um item, o usuário precisa voltar ao topo da página para ver o detalhe.

---

## Contexto

Ambas as telas usam um grid de duas colunas (lista à esquerda, detalhe à direita). Atualmente a página inteira rola, e o painel de detalhe usa `position: sticky` para tentar acompanhar o scroll. Na prática, ao selecionar um item localizado no meio/fundo da lista, o detalhe fica fora do viewport visível e o usuário precisa rolar para cima para vê-lo.

---

## Solução Escolhida: Painéis Independentes (Opção A)

Cada coluna passa a ter sua própria área de scroll com altura fixa. A página em si não rola mais — apenas as colunas rolam internamente. Ao clicar qualquer item da lista, o painel de detalhe já está visível na tela, sem deslocamento.

---

## Arquitetura

### Desktop (≥ 900px)

O layout grid (`.pd-layout` / `.cl-layout`) passa a ocupar a altura restante do viewport após o cabeçalho da aplicação, o título da página e a toolbar de filtros.

```
app-header (58px, fixo)
└── ek-page
    ├── ek-head (título + botões, fixo)
    ├── ek-toolbar (busca + filtros, fixo)
    └── pd-layout / cl-layout  ← preenche restante com scroll interno
        ├── pd-lista / cl-lista     → overflow-y: auto
        └── pd-detalhe / cl-detalhe → overflow-y: auto
```

**Altura do layout:**
```css
height: calc(100vh - var(--header-height) - 250px);
```
O valor `250px` absorve: padding da ek-page (64px top+bottom), ek-head (~80px), toolbar (~50px) e gaps (56px). Esse padrão já é usado na tela de Agendamentos do mesmo projeto.

### Mobile (< 900px)

O layout permanece em coluna única (lista sobre detalhe). A mudança é comportamental: ao selecionar um item, a página rola suavemente até o painel de detalhe via `scrollIntoView({ behavior: 'smooth', block: 'start' })`.

---

## Componentes Afetados

### `Pedidos.css`

- `.pd-layout`: troca `min-height` por `height: calc(...)` e adiciona `overflow: hidden`
- `.pd-lista`: adiciona `overflow-y: auto; height: 100%`
- `.pd-detalhe`: remove `position: sticky`, `top`, `max-height`; adiciona `overflow-y: auto; height: 100%`
- `@media (max-width: 900px)`: mantém layout em coluna única

### `Clientes.css`

- `.cl-layout`: mesmas mudanças que `pd-layout`
- `.cl-lista`: adiciona `overflow-y: auto; height: 100%`
- `.cl-detalhe`: remove `position: sticky`, `top`; adiciona `overflow-y: auto; height: 100%`
- `@media (max-width: 900px)`: mantém layout em coluna única

### `Pedidos.jsx`

- Adiciona `useRef` para o container `.pd-detalhe`
- Usa `useEffect` watching `pedidoDetalheAtual` para disparar o scroll no mobile (consistente com Clientes): `useEffect(() => { if (pedidoDetalheAtual && window.innerWidth < 900) { detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }, [pedidoDetalheAtual])`

### `Clientes.jsx`

- Adiciona `useRef` para o container `.cl-detalhe`
- A seleção é feita via `onClick={() => setClienteDetalhe(c)}` direto no card — sem wrapper de função
- Usa `useEffect(() => { if (clienteDetalhe && window.innerWidth < 900) { detalheRef.current?.scrollIntoView(...) } }, [clienteDetalhe])` para disparar o scroll no mobile

---

## Comportamento Esperado

| Cenário | Desktop | Mobile |
|---|---|---|
| Clica item no topo da lista | Detalhe visível à direita, sem movimento | Detalhe aparece abaixo |
| Clica item no fundo da lista | Lista rola, detalhe permanece no lugar | Página rola suavemente até o detalhe |
| Rola lista longa | Detalhe não se move | — |
| Rola detalhe longo | Lista não se move | — |

---

## O que não muda

- Nenhum CSS global (`shared.css`, `AppLayout.css`, `theme.css`) é alterado
- A lógica de negócio das páginas (seleção, carregamento, edição) permanece intacta
- O visual dos cards, detalhe e formulários não é alterado

---

## Ajuste de Precisão

O valor `250px` pode precisar de ajuste fino após verificação visual. Se o layout ficar muito comprimido ou sobrar espaço em branco, ajusta-se o offset do `calc`. Referência: Agendamentos usa `190px` (toolbar menor) e `150px` (sem título).
