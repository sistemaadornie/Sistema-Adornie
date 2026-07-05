# Editar Pedido como Tela + Visualizar PDF Original

**Data:** 2026-07-05
**Status:** Aprovado

---

## Contexto

Na Etapa 1 do fluxo do pedido (`EtapaDadosPedido.jsx`), o botão "✏️ Editar Pedido" abre
`EditarPedidoModal.jsx` como um modal sobreposto à própria Etapa 1 (modal dentro de modal). O
formulário edita dados do pedido, itens e pagamentos via `PUT /pedidos/:id`.

Separadamente, o backend já guarda o PDF original do pedido (importado via
`POST /pedidos/:id/anexo-pdf`, tabela `pedido_anexos`) e já expõe `GET /pedidos/:id/anexo-pdf`
(retorna o arquivo com `Content-Disposition: inline`) e um flag `tem_anexo_pdf` (boolean) dentro da
resposta de `GET /pedidos/:id` — mas nenhuma tela hoje oferece um jeito de visualizar esse PDF.

## Objetivo

- "Editar Pedido" deixa de ser modal e passa a ser uma tela própria, com rota dedicada, no mesmo
  padrão das fichas de confecção/conferência (navega para fora do fluxo, volta com a Etapa 1
  reaberta).
- Nessa tela, um botão abre o PDF original do pedido (quando existir) em uma nova aba.

## Fora de escopo

- Alterações no formulário em si (campos, validação, itens, pagamentos) — comportamento idêntico ao
  modal atual, só muda o invólucro visual.
- Upload/substituição do PDF nesta tela (isso já existe em `VincularPdfTab.jsx`/import).
- Visualizador de PDF embutido (iframe) — abre em nova aba do navegador.
- Alterações no backend — os dois endpoints (`GET /pedidos/:id` com `tem_anexo_pdf`,
  `GET /pedidos/:id/anexo-pdf`) já existem e não mudam.

## 1. Backend

Nenhuma mudança. Confirmado que:
- `pedidoService.montarPedido` (usado por `GET /pedidos/:id`) já retorna
  `tem_anexo_pdf: boolean` (`backend/src/services/pedidoService.js:119`).
- `GET /pedidos/:id/anexo-pdf` (`backend/src/routes/pedidosRoutes.js:1085`) já retorna o PDF com
  `Content-Type` e `Content-Disposition: inline`, autenticado via `authMiddleware` (Bearer token).

## 2. Frontend

### 2.1 `services/api.js` — novo `getBlob`

O endpoint do PDF exige o header `Authorization`, então não dá para usar `<a href>`/`window.open`
direto na URL — precisa buscar com `fetch` autenticado e converter para `Blob`. Novo método,
seguindo o padrão dos demais (`get`, `post`, `put`...):

```js
export const api = {
  // ...métodos existentes (get, post, put, patch, delete)...

  getBlob: async (path) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, { method: "GET", headers: getHeaders() })
    );
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!response.ok) {
      const msg = `Erro ${response.status}: ${response.statusText || "Requisição falhou"}`;
      throw new Error(msg);
    }
    return response.blob();
  },
};
```

### 2.2 Nova rota `/pedidos/:id/editar`

`App.jsx`: adicionar, próximo à rota de fluxo:

```jsx
const EditarPedido = lazy(() => import("./pages/pedidos/EditarPedido"));
// ...
<Route path="/pedidos/:id/editar" element={<EditarPedido />} />
```

### 2.3 Nova página `EditarPedido.jsx`

Novo arquivo `frontend-web/src/pages/pedidos/EditarPedido.jsx`. Reaproveita integralmente a lógica
de carregamento/edição/salvamento hoje em `EditarPedidoModal.jsx` (states `form`, `itens`,
`pagamentos`, `categorias`, funções `set`, `setItem`, `addItem`, `removeItem`, `setPag`, `addPag`,
`removePag`, `salvar`) — só troca:

- **Wrapper:** de `<div className="pf-modal-overlay"><div className="pf-modal pf-modal-grande">`
  para o padrão de página cheia já usado nas fichas (`ek-page os-page`, `os-page-header
  os-page-header-flat`, `os-page-header-left`/`os-page-header-right`, `os-back-btn`,
  `os-page-title`, `os-page-body`) — importar `OrdemServicoModal.css` além de
  `ImportarPedidoModal.css` (que já fornece as classes `pd-*` do editor de itens/pagamentos,
  reaproveitadas sem mudança).
- **Navegação:** em vez de receber `pedidoId`/`onClose`/`onSalvo` como props, lê `id` via
  `useParams()` (rota `/pedidos/:id/editar`). Uma função `voltar()` compartilhada por
  cancelar/salvar:

```jsx
function voltar() {
  navigate(`/pedidos/${id}/fluxo`, { state: { reabrirEtapa: 1 } });
}
```

  `salvar()` chama `voltar()` no lugar de `onSalvo?.()` após o `PUT` bem-sucedido. O botão "×"/
  "Cancelar" chama `voltar()` diretamente (sem salvar).

- **Botão "Ver Pedido Original (PDF)":** no `os-page-header-right`, ao lado de
  Cancelar/Salvar. Só renderiza quando `form?.tem_anexo_pdf` for `true` (adicionar
  `tem_anexo_pdf: p.tem_anexo_pdf` ao montar o `form` no `useEffect` de carregamento, junto dos
  demais campos já mapeados de `resPedido.pedido`).

```jsx
const [abrindoPdf, setAbrindoPdf] = useState(false);

async function abrirPdf() {
  setAbrindoPdf(true);
  try {
    const blob = await api.getBlob(`/pedidos/${id}/anexo-pdf`);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (e) {
    setErro(e?.message || "Erro ao abrir o PDF do pedido.");
  } finally {
    setAbrindoPdf(false);
  }
}
```

```jsx
{form?.tem_anexo_pdf && (
  <button className="os-btn os-btn-secondary" onClick={abrirPdf} disabled={abrindoPdf}>
    {abrindoPdf ? "Abrindo..." : "📄 Ver Pedido Original (PDF)"}
  </button>
)}
```

Não chama `URL.revokeObjectURL` — a aba aberta continua usando a URL; o navegador libera a memória
ao fechar a aba/reload, consistente com o padrão de "abre e esquece" já usado no app para blobs
(ex.: crop de imagem).

### 2.4 `EtapaDadosPedido.jsx`

- Remove o estado `editando`/`setEditando` e o render condicional de `<EditarPedidoModal>`.
- Remove o import de `EditarPedidoModal`.
- Botão "✏️ Editar Pedido" passa a navegar:

```jsx
import { useNavigate } from "react-router-dom";
// ...
const navigate = useNavigate();
// ...
<button className="pf-btn-secondary" onClick={() => navigate(`/pedidos/${pedidoId}/editar`)}>
  ✏️ Editar Pedido
</button>
```

### 2.5 `PedidoFluxo.jsx` — reabrir a Etapa 1 ao voltar

Novo `useEffect`, ao lado do já existente para `reabrirFichasConsultoras` (mesmo arquivo, mesmo
padrão — `window.history.replaceState` para não reabrir de novo em reload/voltar do navegador):

```jsx
useEffect(() => {
  if (location.state?.reabrirEtapa) {
    setEtapaAberta(location.state.reabrirEtapa);
    window.history.replaceState({}, document.title);
  }
}, [location.state]);
```

Sem novo state nem novo prop — diferente do fluxo de `reabrirFichasConsultoras` (que precisou do
prop `abrirFichasConsultorasInicial`/`onFichasConsultorasAbertas` para reabrir um modal *aninhado*
dentro da Etapa 1), aqui só é preciso reabrir a própria Etapa 1 — `setEtapaAberta(1)` já basta, sem
efeito colateral de remount reabrindo algo indevidamente (não há flag "consumível" envolvida).

### 2.6 Remoção de `EditarPedidoModal.jsx`

Arquivo deletado — único consumidor (`EtapaDadosPedido.jsx`) passa a usar a rota.

## 3. Testes

Sem testes automatizados de frontend neste código (nenhum `*.test.jsx` existe no projeto). Sem
mudanças de backend, sem novos testes de backend.

### Teste manual no navegador

1. Abrir um pedido com PDF importado → Etapa 1 → "✏️ Editar Pedido" → navega para
   `/pedidos/:id/editar` (URL muda, botão voltar do navegador funciona).
2. Confirmar que o botão "📄 Ver Pedido Original (PDF)" aparece; clicar nele abre o PDF em nova aba.
3. Editar um campo, "Salvar alterações" → volta para `/pedidos/:id/fluxo` com a Etapa 1 já reaberta,
   mostrando o dado atualizado.
4. Repetir clicando em "Cancelar"/"×" em vez de salvar → mesma navegação de volta, sem alterar nada.
5. Abrir um pedido **sem** PDF importado (cadastro manual) → confirmar que o botão de PDF não
   aparece.
6. Confirmar que "Vincular Itens", "Ver Fichas de Consultoras" e "Histórico" continuam funcionando
   normalmente a partir da Etapa 1 (não afetados por esta mudança).
