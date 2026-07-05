# Editar Pedido como Tela + Visualizar PDF Original — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o modal "Editar Pedido" (aberto de dentro da Etapa 1 do fluxo) em uma tela própria com rota dedicada, e adicionar um botão para abrir o PDF original do pedido (quando existir) em uma nova aba.

**Architecture:** `EditarPedidoModal.jsx` é reescrito como uma página `EditarPedido.jsx` em rota própria (`/pedidos/:id/editar`), reaproveitando o formulário/lógica existente sem alterá-los — só troca o invólucro de modal para o layout de página cheia já usado nas fichas de confecção. Ao salvar/cancelar, navega de volta para `/pedidos/:id/fluxo` com um flag de state (`reabrirEtapa: 1`) que reabre a Etapa 1. O PDF é buscado via `fetch` autenticado (novo `api.getBlob`), convertido em `Blob`, e aberto em nova aba via `URL.createObjectURL` + `window.open`.

**Tech Stack:** React + react-router-dom (frontend, `frontend-web/src`). Sem mudanças de backend — os dois endpoints usados (`GET /pedidos/:id` com `tem_anexo_pdf`, `GET /pedidos/:id/anexo-pdf`) já existem.

## Global Constraints

- Nenhuma mudança de comportamento no formulário em si (campos, validação, itens, pagamentos) — comportamento idêntico ao modal atual.
- Nenhuma mudança de backend.
- O botão "Ver Pedido Original (PDF)" só aparece quando `tem_anexo_pdf` for `true`.
- O PDF abre em nova aba do navegador (não em iframe/visualizador embutido).
- Ao salvar ou cancelar, a tela sempre volta para `/pedidos/:id/fluxo` com a Etapa 1 reaberta (`state: { reabrirEtapa: 1 }`).
- Sem testes automatizados de frontend neste projeto (nenhum `*.test.jsx` existe) — verificação via build + lint limpos, e um passo de teste manual no navegador na última task.

---

### Task 1: `api.getBlob` — busca autenticada de conteúdo binário

**Files:**
- Modify: `frontend-web/src/services/api.js`

**Interfaces:**
- Produces: `api.getBlob(path: string): Promise<Blob>` — faz `GET` autenticado (mesmo header `Authorization` dos outros métodos) e retorna o corpo da resposta como `Blob` em vez de fazer `.json()`. Lança `Error` com mensagem em português se a resposta não for `ok`, e dispara o evento `auth:unauthorized` em 401 (mesmo comportamento de `handleResponse`).

- [ ] **Step 1: Ler o arquivo atual para confirmar o ponto de inserção**

Abrir `frontend-web/src/services/api.js` e confirmar que o objeto `api` termina com o método `delete` (linhas 87-95 na versão atual) antes de `};` no fechamento do objeto.

- [ ] **Step 2: Adicionar o método `getBlob`**

Em `frontend-web/src/services/api.js`, dentro do objeto `api`, adicionar `getBlob` logo após o método `delete` (antes do `};` de fechamento do objeto `api`):

```js
  getBlob: async (path) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers: getHeaders(),
      })
    );
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText || "Requisição falhou"}`);
    }
    return response.blob();
  },
```

O objeto `api` completo deve ficar assim (últimos métodos, para conferência):

```js
  delete: async (path) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: getHeaders(),
      })
    );
    return handleResponse(response);
  },

  getBlob: async (path) => {
    const response = await withTimeout(
      fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers: getHeaders(),
      })
    );
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!response.ok) {
      throw new Error(`Erro ${response.status}: ${response.statusText || "Requisição falhou"}`);
    }
    return response.blob();
  },
};
```

- [ ] **Step 3: Lint**

Run: `cd frontend-web && npx eslint src/services/api.js`
Expected: sem erros/warnings novos.

- [ ] **Step 4: Build**

Run: `cd frontend-web && npx vite build`
Expected: build conclui sem erros (`✓ built in ...`).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/services/api.js
git commit -m "feat(api): adiciona getBlob para buscar conteudo binario autenticado"
```

---

### Task 2: Página `EditarPedido.jsx` + rota `/pedidos/:id/editar`

**Files:**
- Create: `frontend-web/src/pages/pedidos/EditarPedido.jsx`
- Modify: `frontend-web/src/App.jsx`

**Interfaces:**
- Consumes: `api.getBlob(path)` de `frontend-web/src/services/api.js` (Task 1); `api.get`/`api.put` já existentes.
- Produces: rota `/pedidos/:id/editar` renderizando `EditarPedido`, componente sem props (lê `id` via `useParams()`).

- [ ] **Step 1: Criar a nova página**

Criar `frontend-web/src/pages/pedidos/EditarPedido.jsx` com o conteúdo abaixo — é uma adaptação de `frontend-web/src/pages/pedidos/fluxo/etapas/EditarPedidoModal.jsx`: mesma lógica de carregamento/edição/salvamento (idêntica, sem mudanças de comportamento), só troca o invólucro de modal (`pf-modal-overlay`/`pf-modal`) para o layout de página cheia (`os-page`/`os-page-header`, já usado em `FichaConfeccaoCortina.jsx`), adiciona `useParams`/`useNavigate` no lugar das props `pedidoId`/`onClose`/`onSalvo`, e adiciona o botão de PDF:

```jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import "./PedidoFluxo.css";
import "./ImportarPedidoModal.css";
import "./OrdemServicoModal.css";

const STATUS_OPCOES = [
  { value: "pendente",     label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido",    label: "Concluído" },
  { value: "cancelado",    label: "Cancelado" },
];
const FORMAS_PAGAMENTO = ["PIX / DEPÓSITO", "CONTRA ENTREGA", "CARTÃO DE CRÉDITO", "BOLETO", "DINHEIRO", "CHEQUE"];
const UNIDADES = ["M2", "ML", "UN", "PÇ"];

function fmtMoeda(v) {
  if (v == null || v === "") return "0,00";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(v) {
  if (v == null || v === "") return 0;
  return parseFloat(String(v).replace(",", ".")) || 0;
}

export default function EditarPedido() {
  const { id: pedidoId } = useParams();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [abrindoPdf, setAbrindoPdf] = useState(false);
  const [erro,       setErro]       = useState("");
  const [categorias, setCategorias] = useState([]);
  const [form,       setForm]       = useState(null);
  const [itens,      setItens]      = useState([]);
  const [pagamentos, setPagamentos] = useState([]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const [resPedido, resCat] = await Promise.all([
          api.get(`/pedidos/${pedidoId}`),
          api.get("/categorias").catch(() => ({ categorias: [] })),
        ]);
        if (!ativo) return;
        const p = resPedido.pedido;
        setForm({
          cliente_id:          p.cliente_id,
          consultor_id:        p.consultor_id,
          arquiteto_id:        p.arquiteto_id,
          consultor_nome:      p.consultor_nome || "",
          arquiteto_nome:      p.arquiteto_nome || "",
          status:              p.status || "pendente",
          data_pedido:         p.data_pedido ? String(p.data_pedido).slice(0, 10) : "",
          cpf_cnpj:            p.cpf_cnpj || "",
          email_cliente:       p.email_cliente || "",
          descricao:           p.descricao || "",
          observacoes:         p.observacoes || "",
          observacoes_entrega: p.observacoes_entrega || "",
          cep:                 p.cep || "",
          rua:                 p.rua || "",
          numero:              p.numero_rua || "",
          complemento:         p.complemento || "",
          bairro:              p.bairro || "",
          cidade:              p.cidade || "",
          estado:              p.estado || "",
          desconto:            p.desconto ?? "",
          tem_anexo_pdf:       !!p.tem_anexo_pdf,
        });
        setItens((p.itens || []).map((it) => ({
          id:             it.id,
          ambiente:       it.ambiente || "",
          referencia:     it.referencia || "",
          cor:            it.cor || "",
          descricao:      it.descricao || "",
          largura:        it.largura ?? "",
          altura:         it.altura ?? "",
          medidas:        it.medidas ?? null,
          quantidade:     it.quantidade ?? 1,
          unidade:        it.unidade || "UN",
          preco_unitario: it.preco_unitario ?? "",
          valor:          it.valor ?? "",
          categoria_id:   it.categoria_id ?? null,
          sem_vinculo:    it.sem_vinculo ?? false,
          modelo:         it.modelo ?? null,
          especificacoes: it.especificacoes ?? null,
        })));
        setPagamentos((p.pagamentos || []).map((pg) => ({
          forma:      pg.forma || "PIX / DEPÓSITO",
          parcela:    pg.parcela || "",
          vencimento: pg.vencimento ? String(pg.vencimento).slice(0, 10) : "",
          valor:      pg.valor ?? "",
        })));
        setCategorias(resCat.categorias || []);
      } catch (e) {
        if (ativo) setErro(e?.message || "Erro ao carregar pedido.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    carregar();
    return () => { ativo = false; };
  }, [pedidoId]);

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function setItem(i, k, v) {
    setItens((prev) => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      if (k === "quantidade" || k === "preco_unitario") {
        const qtde  = num(k === "quantidade"     ? v : novo[i].quantidade);
        const preco = num(k === "preco_unitario" ? v : novo[i].preco_unitario);
        novo[i].valor = (qtde * preco).toFixed(2);
      }
      return novo;
    });
  }
  function addItem()      { setItens((p) => [...p, {
    ambiente: "", referencia: "", cor: "", descricao: "",
    largura: "", altura: "", quantidade: 1, unidade: "UN",
    preco_unitario: "", valor: "", categoria_id: null, sem_vinculo: false,
  }]); }
  function removeItem(i)  { setItens((p) => p.filter((_, idx) => idx !== i)); }

  function setPag(i, k, v) {
    setPagamentos((prev) => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      return novo;
    });
  }
  function addPag()     { setPagamentos((p) => [...p, { forma: "PIX / DEPÓSITO", parcela: "1/1", vencimento: "", valor: "" }]); }
  function removePag(i) { setPagamentos((p) => p.filter((_, idx) => idx !== i)); }

  const subtotal = itens.reduce((s, it) => s + num(it.valor), 0);
  const desconto = num(form?.desconto);
  const total    = subtotal - desconto;

  function voltar() {
    navigate(`/pedidos/${pedidoId}/fluxo`, { state: { reabrirEtapa: 1 } });
  }

  async function abrirPdf() {
    setAbrindoPdf(true);
    try {
      const blob = await api.getBlob(`/pedidos/${pedidoId}/anexo-pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      setErro(e?.message || "Erro ao abrir o PDF do pedido.");
    } finally {
      setAbrindoPdf(false);
    }
  }

  async function salvar() {
    setErro("");
    setSalvando(true);
    try {
      const itensFinais = itens
        .filter((it) => it.descricao?.trim())
        .map((it) => ({
          ...it,
          largura: it.largura || null,
          altura:  it.altura  || null,
        }));

      const dados = {
        cliente_id:          form.cliente_id,
        consultor_id:        form.consultor_id,
        arquiteto_id:        form.arquiteto_id,
        status:              form.status,
        data_pedido:         form.data_pedido || null,
        cpf_cnpj:            form.cpf_cnpj?.trim() || null,
        email_cliente:       form.email_cliente?.trim() || null,
        descricao:           form.descricao?.trim() || null,
        observacoes:         form.observacoes?.trim() || null,
        observacoes_entrega: form.observacoes_entrega?.trim() || null,
        cep:                 form.cep || null,
        rua:                 form.rua || null,
        numero:              form.numero || null,
        complemento:         form.complemento || null,
        bairro:              form.bairro || null,
        cidade:              form.cidade || null,
        estado:              form.estado || null,
        subtotal:            subtotal.toFixed(2),
        desconto:            desconto.toFixed(2),
        total:               total.toFixed(2),
        itens:               itensFinais,
        pagamentos:          pagamentos.filter((pg) => pg.forma?.trim()),
      };

      await api.put(`/pedidos/${pedidoId}`, dados);
      voltar();
    } catch (e) {
      setErro(e?.message || "Erro ao salvar pedido.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="ek-page os-page">
      <div className="os-page-header os-page-header-flat">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={voltar}>← Voltar</button>
          <h1 className="os-page-title">✏️ Editar Pedido</h1>
        </div>
        <div className="os-page-header-right">
          {form?.tem_anexo_pdf && (
            <button className="os-btn os-btn-secondary" onClick={abrirPdf} disabled={abrindoPdf}>
              {abrindoPdf ? "Abrindo..." : "📄 Ver Pedido Original (PDF)"}
            </button>
          )}
          <button className="os-btn os-btn-secondary" onClick={voltar} disabled={salvando}>Cancelar</button>
          <button className="os-btn os-btn-primary" onClick={salvar} disabled={salvando || carregando}>
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      {erro && <div className="os-alert os-alert-danger" style={{ margin: "0 0 16px" }}>{erro}</div>}

      <div className="os-page-body">
        {carregando && <div>Carregando...</div>}

        {!carregando && form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Dados principais */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div className="pf-form-field">
                <label>Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUS_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="pf-form-field">
                <label>Data do Pedido</label>
                <input type="date" value={form.data_pedido} onChange={(e) => set("data_pedido", e.target.value)} />
              </div>
              <div className="pf-form-field">
                <label>CPF/CNPJ</label>
                <input value={form.cpf_cnpj} onChange={(e) => set("cpf_cnpj", e.target.value)} />
              </div>
              <div className="pf-form-field">
                <label>E-mail</label>
                <input value={form.email_cliente} onChange={(e) => set("email_cliente", e.target.value)} />
              </div>
            </div>

            {/* Consultora / Arquiteto (somente leitura) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="pf-form-field">
                <label>Consultora</label>
                <input readOnly value={form.consultor_nome || "—"} style={{ opacity: .6 }} />
              </div>
              <div className="pf-form-field">
                <label>Arquiteto</label>
                <input readOnly value={form.arquiteto_nome || "—"} style={{ opacity: .6 }} />
              </div>
            </div>

            {/* Endereço de entrega */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Endereço de Entrega</div>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 10, marginBottom: 10 }}>
                <div className="pf-form-field">
                  <label>CEP</label>
                  <input value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
                </div>
                <div className="pf-form-field">
                  <label>Rua / Logradouro</label>
                  <input value={form.rua} onChange={(e) => set("rua", e.target.value)} />
                </div>
                <div className="pf-form-field">
                  <label>Número</label>
                  <input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 10 }}>
                <div className="pf-form-field">
                  <label>Complemento</label>
                  <input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
                </div>
                <div className="pf-form-field">
                  <label>Bairro</label>
                  <input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </div>
                <div className="pf-form-field">
                  <label>Cidade</label>
                  <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                </div>
                <div className="pf-form-field">
                  <label>UF</label>
                  <input value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} maxLength={2} style={{ textTransform: "uppercase" }} />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="pf-form-field">
                <label>Observações</label>
                <textarea rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
              </div>
              <div className="pf-form-field">
                <label>Observações de Entrega</label>
                <textarea rows={3} value={form.observacoes_entrega} onChange={(e) => set("observacoes_entrega", e.target.value)} />
              </div>
            </div>

            {/* ITENS */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Itens ({itens.length})
              </div>
              <div className="pd-itens-editor">
                <div className="pd-itens-editor-header">
                  <span>#</span>
                  <span>Ambiente</span>
                  <span>Cor</span>
                  <span>Produto</span>
                  <span>Categoria</span>
                  <span>Largura</span>
                  <span>Altura</span>
                  <span>Qtde</span>
                  <span>Un</span>
                  <span>Preço Unit.</span>
                  <span>Total</span>
                  <span></span>
                </div>

                {itens.map((it, i) => (
                  <div key={i} className="pd-itens-editor-row">
                    <span className="pd-item-num">{i + 1}</span>
                    <input placeholder="Sala"    value={it.ambiente   || ""} onChange={(e) => setItem(i, "ambiente",   e.target.value)} />
                    <input placeholder="Cor"     value={it.cor        || ""} onChange={(e) => setItem(i, "cor",        e.target.value)} />
                    <input placeholder="Produto" value={it.descricao  || ""} onChange={(e) => setItem(i, "descricao",  e.target.value)} className="pd-item-desc" />
                    <select
                      value={it.categoria_id ?? ""}
                      onChange={(e) => setItem(i, "categoria_id", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— Categoria —</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <input placeholder="2,00" title="Largura (m)" value={it.largura || ""} onChange={(e) => setItem(i, "largura", e.target.value)} />
                    <input placeholder="3,00" title="Altura (m)"  value={it.altura  || ""} onChange={(e) => setItem(i, "altura",  e.target.value)} />
                    <input type="number" min="0" step="0.01" value={it.quantidade || 1} onChange={(e) => setItem(i, "quantidade", e.target.value)} />
                    <select value={it.unidade || "UN"} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={it.preco_unitario || ""} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
                    <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
                    <button className="pd-item-del" onClick={() => removeItem(i)}>×</button>
                  </div>
                ))}
              </div>
              <button className="pd-add-linha" onClick={addItem}>+ Adicionar item</button>

              {/* Totais */}
              <div className="pd-totais-editor" style={{ marginTop: 12 }}>
                <div className="pd-totais-row">
                  <span>SubTotal</span>
                  <span>R$ {fmtMoeda(subtotal)}</span>
                </div>
                <div className="pd-totais-row">
                  <span>Desconto</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.desconto}
                    onChange={(e) => set("desconto", e.target.value)}
                    style={{ width: 100, textAlign: "right" }}
                  />
                </div>
                <div className="pd-totais-row total">
                  <span>Total</span>
                  <span>R$ {fmtMoeda(total)}</span>
                </div>
              </div>
            </div>

            {/* PAGAMENTOS */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Pagamentos ({pagamentos.length})
              </div>
              <div className="pd-pag-editor">
                <div className="pd-pag-header">
                  <span>Forma</span>
                  <span>Parcela</span>
                  <span>Vencimento</span>
                  <span>Valor (R$)</span>
                  <span></span>
                </div>
                {pagamentos.map((pg, i) => (
                  <div key={i} className="pd-pag-row">
                    <select value={pg.forma} onChange={(e) => setPag(i, "forma", e.target.value)}>
                      {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
                    </select>
                    <input placeholder="1/1" value={pg.parcela || ""} onChange={(e) => setPag(i, "parcela", e.target.value)} />
                    <input type="date" value={pg.vencimento || ""} onChange={(e) => setPag(i, "vencimento", e.target.value)} />
                    <input type="number" min="0" step="0.01" value={pg.valor || ""} onChange={(e) => setPag(i, "valor", e.target.value)} />
                    <button className="pd-item-del" onClick={() => removePag(i)}>×</button>
                  </div>
                ))}
              </div>
              <button className="pd-add-linha" onClick={addPag}>+ Adicionar pagamento</button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Registrar a rota em `App.jsx`**

Em `frontend-web/src/App.jsx`, adicionar o lazy import junto aos demais de pedidos (linha 28, logo após `FichaConferenciaConsultoras`):

```jsx
const FichaConferenciaConsultoras = lazy(() => import("./pages/pedidos/FichaConferenciaConsultoras"));
const EditarPedido = lazy(() => import("./pages/pedidos/EditarPedido"));
```

E adicionar a rota logo após `/pedidos/:id/fluxo` (linha 105 no arquivo atual), dentro do mesmo bloco `<PermissionRoute perms={["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"]}>`:

```jsx
                  <Route path="/pedidos/:id/fluxo"    element={<PedidoFluxo />} />
                  <Route path="/pedidos/:id/editar"   element={<EditarPedido />} />
```

- [ ] **Step 3: Lint**

Run: `cd frontend-web && npx eslint src/pages/pedidos/EditarPedido.jsx src/App.jsx`
Expected: sem erros/warnings novos.

- [ ] **Step 4: Build**

Run: `cd frontend-web && npx vite build`
Expected: build conclui sem erros, novo chunk `EditarPedido-*.js` aparece na saída.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/EditarPedido.jsx frontend-web/src/App.jsx
git commit -m "feat(pedidos): adiciona tela de Editar Pedido com visualizacao de PDF original"
```

---

### Task 3: Trocar o modal pela navegação + reabrir Etapa 1 + remover código morto

**Files:**
- Modify: `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`
- Delete: `frontend-web/src/pages/pedidos/fluxo/etapas/EditarPedidoModal.jsx`

**Interfaces:**
- Consumes: rota `/pedidos/:id/editar` (Task 2).
- Produces: nenhuma interface nova consumida por outra task — esta é a última task do plano.

- [ ] **Step 1: `EtapaDadosPedido.jsx` — trocar o modal por navegação**

Em `frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx`:

O arquivo já tem `useEffect` no import de `react` (de uma correção de bug anterior nesta mesma sessão de trabalho — não remover). Trocar:

```jsx
import React, { useEffect, useState } from "react";
```

por (adiciona `useNavigate`):

```jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
```

Remover a linha do import de `EditarPedidoModal`:

```jsx
import EditarPedidoModal from "./EditarPedidoModal";
```

Na assinatura do componente, adicionar `useNavigate()` e remover o state `editando`. O `useEffect` logo abaixo (que consome `abrirFichasConsultorasInicial`) já existe e **não muda** — só a linha do state `editando` é removida e a linha `const navigate = useNavigate();` é adicionada. O trecho completo (do início do componente até o `useEffect`) deve ficar assim:

```jsx
export default function EtapaDadosPedido({ pedidoId, etapas, onClose, onRecarregar, abrirFichasConsultorasInicial, onFichasConsultorasAbertas }) {
  const navigate = useNavigate();
  const [historico, setHistorico] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [vendoFichas, setVendoFichas] = useState(!!abrirFichasConsultorasInicial);

  useEffect(() => {
    if (abrirFichasConsultorasInicial) onFichasConsultorasAbertas?.();
    // Consome a flag uma única vez no mount — evita que um remount posterior
    // (disparado pelo próprio onRecarregar do modal de fichas) reabra o modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(a linha `const [editando, setEditando] = useState(false);`, que existia antes de `historico`, é removida — não é mais necessária)

Trocar o botão "✏️ Editar Pedido":

```jsx
<button className="pf-btn-secondary" onClick={() => setEditando(true)}>✏️ Editar Pedido</button>
```

por:

```jsx
<button className="pf-btn-secondary" onClick={() => navigate(`/pedidos/${pedidoId}/editar`)}>✏️ Editar Pedido</button>
```

Remover o bloco de render do modal (perto do final do arquivo):

```jsx
      {editando && (
        <EditarPedidoModal
          pedidoId={pedidoId}
          onClose={() => setEditando(false)}
          onSalvo={() => { setEditando(false); onRecarregar?.(); }}
        />
      )}

```

(remover esse bloco inteiro; os blocos `{historico && (...)}`, `{vinculando && (...)}` e `{vendoFichas && (...)}` continuam exatamente como estão)

- [ ] **Step 2: `PedidoFluxo.jsx` — reabrir a Etapa 1 ao voltar da edição**

Em `frontend-web/src/pages/pedidos/PedidoFluxo.jsx`, adicionar um novo `useEffect` logo após o já existente para `reabrirFichasConsultoras`:

```jsx
  /* Reabrir a Etapa 1 com a modal de Fichas de Consultoras ao voltar de uma ficha */
  useEffect(() => {
    if (location.state?.reabrirFichasConsultoras) {
      setEtapaAberta(1);
      setAbrirFichasConsultoras(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  /* Reabrir a Etapa 1 ao voltar da tela de Editar Pedido */
  useEffect(() => {
    if (location.state?.reabrirEtapa) {
      setEtapaAberta(location.state.reabrirEtapa);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
```

- [ ] **Step 3: Apagar `EditarPedidoModal.jsx`**

```bash
git rm frontend-web/src/pages/pedidos/fluxo/etapas/EditarPedidoModal.jsx
```

- [ ] **Step 4: Lint**

Run: `cd frontend-web && npx eslint src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx src/pages/pedidos/PedidoFluxo.jsx`
Expected: sem erros/warnings novos.

- [ ] **Step 5: Build**

Run: `cd frontend-web && npx vite build`
Expected: build conclui sem erros; o chunk de `EditarPedidoModal` não aparece mais na saída.

- [ ] **Step 6: Verificar manualmente no navegador**

Run: `cd frontend-web && npm run dev` (se ainda não estiver rodando)

1. Abrir o fluxo de um pedido (`/pedidos/:id/fluxo`) que tenha PDF importado → Etapa 1 → clicar "✏️ Editar Pedido" → confirmar que a URL muda para `/pedidos/:id/editar` e que o botão "← Voltar do navegador" funciona.
2. Confirmar que o botão "📄 Ver Pedido Original (PDF)" aparece; clicar nele abre o PDF em nova aba.
3. Editar um campo (ex: Status) → "Salvar alterações" → confirmar que volta para `/pedidos/:id/fluxo` com a Etapa 1 já reaberta, mostrando o dado atualizado.
4. Repetir abrindo a tela de novo e clicando em "Cancelar" (ou "← Voltar") em vez de salvar → mesma navegação de volta, sem alterar nada.
5. Abrir um pedido **sem** PDF importado (cadastro manual, sem `tem_anexo_pdf`) → confirmar que o botão de PDF não aparece.
6. Na Etapa 1, confirmar que "🔗 Vincular Itens", "👁 Ver Fichas de Consultoras" e "🕘 Histórico" continuam abrindo como modais normalmente (não afetados por esta mudança).

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/pedidos/fluxo/etapas/EtapaDadosPedido.jsx frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): troca modal de Editar Pedido pela navegacao para tela propria"
```

---

## Self-Review Notes

- **Cobertura da spec:** `api.getBlob` (Task 1) cobre a seção 2.1; página + rota (Task 2) cobre 2.2/2.3; navegação/reabertura/remoção do modal (Task 3) cobre 2.4/2.5/2.6. Teste manual (Task 3, Step 6) cobre todos os 6 passos da spec.
- **Consistência de tipos:** `voltar()` sempre navega para `/pedidos/${pedidoId}/fluxo` com `{ state: { reabrirEtapa: 1 } }`; `PedidoFluxo.jsx` lê `location.state.reabrirEtapa` e usa o mesmo valor em `setEtapaAberta(...)` — consistente ponta a ponta.
- **Sem placeholders:** todos os steps têm código completo e comandos exatos.
- **Nota de arquitetura:** ao contrário do fluxo de `reabrirFichasConsultoras` (que precisou de um prop "consumível" `abrirFichasConsultorasInicial`/`onFichasConsultorasAbertas` para evitar reabertura indevida de um modal *aninhado* após um remount — bug corrigido nesta mesma sessão), aqui não há esse risco: `reabrirEtapa` só reabre a própria Etapa 1 diretamente, sem nenhum estado "consumível" que possa ficar starving após um remount.
