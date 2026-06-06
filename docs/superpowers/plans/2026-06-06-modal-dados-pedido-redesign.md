# Redesign do modal "Dados do Pedido" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o `ModalDadosPedido` (etapa "Dados do Pedido" do `PedidoFluxo`) de uma única coluna empilhada para um layout de duas colunas — barra lateral fixa com identidade/ações + área de conteúdo navegável por sub-abas (Geral/Itens/Pagamentos/Mídias) — com edição inline e histórico em painel deslizante.

**Architecture:** Mudança puramente de frontend em `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` e `PedidoFluxo.css`. O JSX hoje empilhado dentro de `ModalDadosPedido` é extraído em sub-componentes locais focados (`SidebarPedido`, `SubAbaGeral`, `SubAbaItens`, `SubAbaPagamentos`, `FormGeralPedido`, `EditorItensPedido`), e o corpo do modal é reescrito para compor esses sub-componentes em um layout `pf-modal-layout` (sidebar + content). O `ModalEntrega` permanece inalterado — ele compartilha classes CSS (`pf-modal-abas`, `pf-acoes`, `pf-modal-body`) que continuam em uso.

**Tech Stack:** React 18 (componentes funcionais + hooks), CSS puro com variáveis (`var(--color-*)`), Vite. Sem framework de testes no frontend — verificação via `npm run lint` e checagem manual no navegador (`npm run dev`).

**Spec:** `docs/superpowers/specs/2026-06-06-modal-dados-pedido-redesign-design.md`

---

## File Map

| Ação | Caminho |
|---|---|
| Modificar | `frontend-web/src/pages/pedidos/PedidoFluxo.css` — novas classes de layout, sub-abas, badges e drawer |
| Modificar | `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` — novos sub-componentes + reescrita do corpo de `ModalDadosPedido` |

---

## Task 1: CSS — layout de duas colunas, sub-abas, badges e drawer de histórico

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.css:132-140` (bloco `.pf-modal`)
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.css:159` (antes do comentário `/* Abas */`)

- [ ] **Step 1: Adicionar `position: relative` ao `.pf-modal`**

O drawer de histórico (Task 6) usa `position: absolute; inset: 0` e precisa que `.pf-modal` seja seu contêiner de posicionamento. Localize o bloco (linha ~132) e adicione a propriedade:

```css
.pf-modal {
  position: relative;
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  border-radius: 16px;
  width: 100%; max-width: 920px;
  max-height: 92vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 2: Inserir o novo bloco de estilos antes do comentário `/* Abas */` (linha ~159)**

Adicione o bloco completo abaixo, logo antes de `/* Abas */`:

```css
/* ── Layout em duas colunas (Modal Dados do Pedido) ── */
.pf-modal-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pf-modal-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--color-bg, #0f172a);
  border-right: 1px solid var(--color-border, #334155);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.pf-sidebar-identidade { display: flex; flex-direction: column; gap: 8px; }
.pf-sidebar-cliente { font-size: 15px; font-weight: 700; color: var(--color-text, #f1f5f9); }
.pf-sidebar-total   { font-size: 18px; font-weight: 700; color: #34d399; }
.pf-sidebar-pendencia-badge {
  font-size: 11px; font-weight: 600; color: #fcd34d;
  background: rgba(252,211,77,0.12); border: 1px solid rgba(252,211,77,0.3);
  border-radius: 8px; padding: 4px 8px; align-self: flex-start;
}

.pf-status-badge {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  padding: 3px 10px; border-radius: 10px; align-self: flex-start;
}

.pf-sidebar-acoes { display: flex; flex-direction: column; gap: 8px; }
.pf-sidebar-acoes .pf-btn { width: 100%; text-align: left; }

.pf-modal-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pf-subabas {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 16px 24px 0;
  flex-shrink: 0;
}
.pf-subaba {
  padding: 8px 16px; border-radius: 8px;
  background: var(--color-surface, #1e293b);
  border: 1px solid var(--color-border, #334155);
  color: var(--color-text-muted, #94a3b8);
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pf-subaba:hover { color: var(--color-text, #f1f5f9); }
.pf-subaba.ativa {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.pf-subaba-corpo {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 720px) {
  .pf-modal-layout { flex-direction: column; overflow-y: auto; }
  .pf-modal-sidebar {
    width: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #334155);
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }
  .pf-sidebar-acoes { flex-direction: row; flex-wrap: wrap; }
  .pf-sidebar-acoes .pf-btn { width: auto; }
}

/* ── Drawer de Histórico (Modal Dados do Pedido) ── */
.pf-drawer-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; justify-content: flex-end;
  z-index: 10;
}
.pf-drawer-historico {
  width: 100%; max-width: 360px;
  background: var(--color-surface, #1e293b);
  border-left: 1px solid var(--color-border, #334155);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.pf-drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #334155);
  flex-shrink: 0;
}
.pf-drawer-titulo { font-size: 15px; font-weight: 700; color: var(--color-text, #f1f5f9); margin: 0; }
.pf-drawer-corpo  { flex: 1; overflow-y: auto; padding: 8px 20px; }

```

- [ ] **Step 3: Verificar que o lint continua passando**

Run: `cd frontend-web && npm run lint`
Expected: sem erros (CSS não é verificado pelo ESLint; este passo confirma que nada quebrou no JS/JSX já existente).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.css
git commit -m "style(pedidos): CSS do layout em duas colunas do modal Dados do Pedido"
```

---

## Task 2: Criar `SidebarPedido`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx:112` (logo antes de `/* ── MODAL DADOS DO PEDIDO ── */`)

- [ ] **Step 1: Inserir os mapas de status de pedido e o componente `SidebarPedido`**

Logo após o fechamento da função `Modal` (linha 111, `}`) e antes do comentário `/* ── MODAL DADOS DO PEDIDO ── */` (linha 113), insira:

```jsx
const STATUS_PEDIDO_LABEL = {
  pendente: "Pendente", em_andamento: "Em andamento",
  concluido: "Concluído", cancelado: "Cancelado",
};
const STATUS_PEDIDO_COR = {
  pendente: "#64748b", em_andamento: "#f59e0b",
  concluido: "#10b981", cancelado: "#ef4444",
};

/* ── SIDEBAR DO PEDIDO ── */
function SidebarPedido({
  pedido, etapa1Completa, editando, salvando,
  onEditar, onCancelarEdicao, onSalvar,
  onImprimir, onAbrirPdf, onAgendar, onHistorico, onExcluir,
}) {
  const statusCor = STATUS_PEDIDO_COR[pedido?.status] || "#64748b";

  return (
    <div className="pf-modal-sidebar">
      <div className="pf-sidebar-identidade">
        <div className="pf-sidebar-cliente">{pedido?.cliente_nome || "—"}</div>
        <span className="pf-status-badge" style={{ background: statusCor + "22", color: statusCor }}>
          {STATUS_PEDIDO_LABEL[pedido?.status] || pedido?.status}
        </span>
        <div className="pf-sidebar-total">R$ {fmtMoeda(pedido?.total)}</div>
        {!etapa1Completa && (
          <span className="pf-sidebar-pendencia-badge">⚠ Pendências na etapa</span>
        )}
      </div>

      <div className="pf-sidebar-acoes">
        {editando ? (
          <>
            <button className="pf-btn" onClick={onCancelarEdicao} disabled={salvando}>Cancelar</button>
            <button className="pf-btn pf-btn-primary" onClick={onSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "💾 Salvar"}
            </button>
          </>
        ) : (
          <>
            <button className="pf-btn pf-btn-primary" onClick={onEditar}>✏ Editar</button>
            <button className="pf-btn" onClick={onImprimir}>🖨 Imprimir</button>
            {pedido?.tem_anexo_pdf && (
              <button className="pf-btn" onClick={onAbrirPdf}>📄 PDF Original</button>
            )}
            <button className="pf-btn" onClick={onAgendar}>📅 Agendar Instalação</button>
            <button className="pf-btn" onClick={onHistorico}>🕘 Histórico</button>
            <button className="pf-btn pf-btn-danger" onClick={onExcluir}>🗑 Excluir</button>
          </>
        )}
      </div>
    </div>
  );
}

```

- [ ] **Step 2: Verificar que o lint passa (componente ainda não é usado, mas nomes em maiúscula são ignorados por `no-unused-vars`)**

Run: `cd frontend-web && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): extrair SidebarPedido do modal Dados do Pedido"
```

---

## Task 3: Criar `SubAbaGeral` e `FormGeralPedido`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` (logo após `SidebarPedido`, inserido na Task 2)

- [ ] **Step 1: Inserir `SubAbaGeral` (modo visualização)**

Logo após o fechamento de `SidebarPedido`, insira:

```jsx
/* ── SUB-ABA: GERAL (visualização) ── */
function SubAbaGeral({ pedido, etapa1Completa }) {
  return (
    <>
      {!etapa1Completa && (
        <div className="pf-etapa1-pendencias">
          <strong>Pendências para concluir esta etapa:</strong>
          <ul>
            {!pedido?.tem_anexo_pdf && <li>PDF original não vinculado</li>}
            {pedido?.itens?.some(it => !it.categoria_id) && (
              <li>Itens sem categoria: {pedido.itens.filter(it => !it.categoria_id).map(it => it.descricao || "(sem nome)").join(", ")}</li>
            )}
            {pedido?.itens?.some(it => !it.sem_vinculo && !(it.vinculos?.length)) && (
              <li>Itens sem vínculo resolvido — edite e marque "Nenhum" se não houver vínculo necessário</li>
            )}
          </ul>
        </div>
      )}

      <div className="pf-secao">
        <div className="pf-secao-titulo">Informações</div>
        <div className="pf-info-grid">
          <div><span className="pf-info-label">Consultora</span>{pedido?.consultor_nome || "—"}</div>
          <div><span className="pf-info-label">Arquiteto</span>{pedido?.arquiteto_nome || "—"}</div>
          <div><span className="pf-info-label">Data</span>{fmtData(pedido?.data_pedido)}</div>
        </div>
      </div>

      {pedido?.endereco && (
        <div className="pf-secao">
          <div className="pf-secao-titulo">Endereço de Entrega</div>
          <p className="pf-texto">{pedido.endereco}</p>
        </div>
      )}

      {pedido?.observacoes && (
        <div className="pf-secao">
          <div className="pf-secao-titulo">Observações</div>
          <p className="pf-texto">{pedido.observacoes}</p>
        </div>
      )}

      {pedido?.observacoes_entrega && (
        <div className="pf-secao">
          <div className="pf-secao-titulo">Previsão de Entrega</div>
          <p className="pf-texto">{pedido.observacoes_entrega}</p>
        </div>
      )}
    </>
  );
}

```

> **Nota de design:** "Cliente", "Status" e "Total" não aparecem mais aqui — já estão em destaque na `SidebarPedido`. A seção "Informações" passa a mostrar só os campos complementares (Consultora, Arquiteto, Data), evitando repetição.

- [ ] **Step 2: Inserir `FormGeralPedido` (modo edição)**

Logo após o fechamento de `SubAbaGeral`, insira:

```jsx
/* ── SUB-ABA: GERAL (edição) ── */
function FormGeralPedido({ form, setForm, clientes, consultores, arquitetos }) {
  return (
    <div className="pf-form-edicao">
      <div className="pf-form-row">
        <div className="pf-form-field">
          <label>Cliente</label>
          <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
            <option value="">— Sem cliente —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="pf-form-field">
          <label>Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="pf-form-field">
          <label>Data do Pedido</label>
          <input type="date" value={form.data_pedido} onChange={e => setForm(f => ({ ...f, data_pedido: e.target.value }))} />
        </div>
      </div>

      <div className="pf-form-row">
        <div className="pf-form-field">
          <label>Consultora</label>
          <select value={form.consultor_id} onChange={e => setForm(f => ({ ...f, consultor_id: e.target.value }))}>
            <option value="">— Selecionar —</option>
            {consultores.map(u => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
          </select>
        </div>
        <div className="pf-form-field">
          <label>Arquiteto</label>
          <select value={form.arquiteto_id} onChange={e => setForm(f => ({ ...f, arquiteto_id: e.target.value }))}>
            <option value="">— Selecionar —</option>
            {arquitetos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="pf-form-row">
        <div className="pf-form-field" style={{ flex: 2 }}>
          <label>Observações</label>
          <textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>
        <div className="pf-form-field" style={{ flex: 2 }}>
          <label>Previsão de Entrega</label>
          <textarea rows={2} value={form.observacoes_entrega} onChange={e => setForm(f => ({ ...f, observacoes_entrega: e.target.value }))} />
        </div>
      </div>
    </div>
  );
}

```

- [ ] **Step 3: Verificar que o lint passa**

Run: `cd frontend-web && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): extrair SubAbaGeral e FormGeralPedido do modal Dados do Pedido"
```

---

## Task 4: Criar `SubAbaItens` e `EditorItensPedido`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` (logo após `FormGeralPedido`, inserido na Task 3)

- [ ] **Step 1: Inserir `SubAbaItens` (modo visualização)**

Logo após o fechamento de `FormGeralPedido`, insira:

```jsx
/* ── SUB-ABA: ITENS (visualização) ── */
function SubAbaItens({ itens, subtotal, desconto, total }) {
  if (!itens?.length) {
    return <p className="pf-sem-ag">Nenhum item cadastrado.</p>;
  }

  return (
    <>
      <div className="pf-itens-wrap">
        <table className="pf-itens-table">
          <thead>
            <tr>
              <th>#</th><th>Produto</th><th>Categoria</th><th>Vínculo</th>
              <th>Larg.</th><th>Alt.</th><th>Qtde</th><th>Preço</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.descricao}</td>
                <td>
                  {it.categoria_nome
                    ? <span className="pf-cat-badge" style={{ background: it.categoria_cor || "#8B6914" }}>{it.categoria_nome}</span>
                    : <span className="pf-pendente">Sem categoria</span>}
                </td>
                <td>
                  {it.sem_vinculo
                    ? <span className="pf-sem-vinculo">Nenhum</span>
                    : it.vinculos?.length
                      ? <span className="pf-vinculado">Vinculado</span>
                      : <span className="pf-pendente">Pendente</span>}
                </td>
                <td>{it.largura != null ? fmtMoeda(it.largura) : (it.medidas?.split(/[xX×]/)[0]?.trim() || "—")}</td>
                <td>{it.altura  != null ? fmtMoeda(it.altura)  : (it.medidas?.split(/[xX×]/)[1]?.trim() || "—")}</td>
                <td>{it.quantidade}</td>
                <td>{it.preco_unitario != null ? `R$ ${fmtMoeda(it.preco_unitario)}` : "—"}</td>
                <td><strong>R$ {fmtMoeda(it.valor)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pf-totais">
        {subtotal != null && <div>SubTotal: R$ {fmtMoeda(subtotal)}</div>}
        {Number(desconto) > 0 && <div>Desconto: -R$ {fmtMoeda(desconto)}</div>}
        <div className="pf-total-final">Total: R$ {fmtMoeda(total)}</div>
      </div>
    </>
  );
}

```

- [ ] **Step 2: Inserir `EditorItensPedido` (modo edição)**

Logo após o fechamento de `SubAbaItens`, insira:

```jsx
/* ── SUB-ABA: ITENS (edição — categoria e vínculo) ── */
function EditorItensPedido({ itens, setItem, categorias }) {
  return (
    <div className="pf-itens-editor-wrap">
      {itens.map((it, i) => (
        <div key={i} className="pf-item-edit-row">
          <span className="pf-item-num">{i + 1}</span>
          <span className="pf-item-desc" title={it.descricao}>{it.descricao || "(sem descrição)"}</span>
          <select
            value={it.categoria_id ?? ""}
            onChange={e => setItem(i, "categoria_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Categoria —</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select
            value={it.sem_vinculo ? "__nenhum__" : (it.item_vinculado_idx != null ? String(it.item_vinculado_idx) : "")}
            onChange={e => {
              if (e.target.value === "__nenhum__") {
                setItem(i, "sem_vinculo", true);
              } else {
                setItem(i, "sem_vinculo", false);
                setItem(i, "item_vinculado_idx", e.target.value === "" ? null : Number(e.target.value));
              }
            }}
          >
            <option value="">— Vínculo —</option>
            <option value="__nenhum__">Nenhum (sem vínculo necessário)</option>
            {itens.map((other, j) => j !== i ? (
              <option key={j} value={j}>{j + 1} – {other.descricao || "(sem desc.)"}</option>
            ) : null)}
          </select>
        </div>
      ))}
    </div>
  );
}

```

- [ ] **Step 3: Verificar que o lint passa**

Run: `cd frontend-web && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): extrair SubAbaItens e EditorItensPedido do modal Dados do Pedido"
```

---

## Task 5: Criar `SubAbaPagamentos`

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` (logo após `EditorItensPedido`, inserido na Task 4)

- [ ] **Step 1: Inserir `SubAbaPagamentos`**

Logo após o fechamento de `EditorItensPedido` e antes do comentário `/* ── MODAL DADOS DO PEDIDO ── */`, insira:

```jsx
/* ── SUB-ABA: PAGAMENTOS ── */
function SubAbaPagamentos({ pagamentos }) {
  if (!pagamentos?.length) {
    return <p className="pf-sem-ag">Nenhum pagamento cadastrado.</p>;
  }

  return (
    <>
      {Object.entries(
        pagamentos.reduce((acc, pg) => {
          if (!acc[pg.forma]) acc[pg.forma] = [];
          acc[pg.forma].push(pg);
          return acc;
        }, {})
      ).map(([forma, pgs]) => (
        <div key={forma} className="pf-pag-grupo">
          <div className="pf-pag-forma">{forma}</div>
          {pgs.map((pg, i) => (
            <div key={i} className="pf-pag-row">
              <span>{pg.parcela}</span>
              <span>{fmtData(pg.vencimento)}</span>
              <span>R$ {fmtMoeda(pg.valor)}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

```

- [ ] **Step 2: Verificar que o lint passa**

Run: `cd frontend-web && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): extrair SubAbaPagamentos do modal Dados do Pedido"
```

---

## Task 6: Substituir o corpo de `ModalDadosPedido` pelo novo layout

**Files:**
- Modify: `frontend-web/src/pages/pedidos/PedidoFluxo.jsx` (dentro de `ModalDadosPedido`, definida originalmente nas linhas 114-527)

- [ ] **Step 1: Trocar o estado `aba` por `subaba` e adicionar `historicoAberto`**

Cuidado: a linha `const [aba, setAba] = useState("detalhes");` existe **tanto** em `ModalDadosPedido` quanto em `ModalEntrega` — sozinha ela não é uma âncora única. Use o trecho de 3 linhas abaixo (exclusivo de `ModalDadosPedido`, pela presença de `editando` logo em seguida):

```jsx
  const navigate = useNavigate();
  const [aba, setAba] = useState("detalhes");
  const [editando, setEditando] = useState(false);
```

Substitua por:

```jsx
  const navigate = useNavigate();
  const [subaba, setSubaba] = useState("geral");
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [editando, setEditando] = useState(false);
```

- [ ] **Step 2: Substituir todo o `return (...)` de `ModalDadosPedido` pelo novo layout**

Cuidado: a linha `const etapa1Completa = pedido?.verificacao_ok;` existe **tanto** em `ModalDadosPedido` quanto em `ModalEntrega` — não use-a como âncora de busca/substituição.

Em vez disso, use como âncora única o `return (` cujo primeiro elemento é `<Modal titulo={\`Dados do Pedido — ...\`}` — esse título com `Dados do Pedido` só existe em `ModalDadosPedido` (o `ModalEntrega` usa `titulo="Entrega"`). Substitua tudo desde esse `return (` até o `);` que o fecha, **e também o `}` seguinte que fecha a função `ModalDadosPedido`** — ou seja, vá até (mas sem incluir) o comentário `/* ── MODAL ENTREGA ── */` que vem logo depois.

Esse trecho a substituir contém: o `<Modal>` com as antigas `pf-modal-abas`/`pf-modal-body`, os blocos condicionais `aba === "detalhes" && !editando`, `aba === "detalhes" && editando`, `aba === "historico"`, e os elementos `{toast}`, `{printOpen && ...}`, `{instalacao && ...}`.

Substitua esse bloco inteiro (incluindo o `}` de fechamento da função) por:

```jsx
  return (
    <Modal titulo={`Dados do Pedido — ${pedido?.numero || `#${pedidoId}`}`} onClose={onClose}>
      <div className="pf-modal-layout">
        <SidebarPedido
          pedido={pedido}
          etapa1Completa={etapa1Completa}
          editando={editando}
          salvando={salvando}
          onEditar={() => setEditando(true)}
          onCancelarEdicao={() => setEditando(false)}
          onSalvar={handleSalvar}
          onImprimir={() => setPrintOpen(true)}
          onAbrirPdf={handleAbrirPdf}
          onAgendar={() => setInstalacao(pedido)}
          onHistorico={() => setHistoricoAberto(true)}
          onExcluir={handleExcluir}
        />

        <div className="pf-modal-content">
          <div className="pf-subabas">
            <button className={`pf-subaba${subaba === "geral" ? " ativa" : ""}`} onClick={() => setSubaba("geral")}>Geral</button>
            <button className={`pf-subaba${subaba === "itens" ? " ativa" : ""}`} onClick={() => setSubaba("itens")}>Itens ({pedido?.itens?.length ?? 0})</button>
            <button className={`pf-subaba${subaba === "pagamentos" ? " ativa" : ""}`} onClick={() => setSubaba("pagamentos")}>Pagamentos</button>
            <button className={`pf-subaba${subaba === "midias" ? " ativa" : ""}`} onClick={() => setSubaba("midias")}>Mídias</button>
          </div>

          <div className="pf-subaba-corpo">
            {subaba === "geral" && (
              editando
                ? <FormGeralPedido form={form} setForm={setForm} clientes={clientes} consultores={consultores} arquitetos={arquitetos} />
                : <SubAbaGeral pedido={pedido} etapa1Completa={etapa1Completa} />
            )}

            {subaba === "itens" && (
              editando
                ? <EditorItensPedido itens={itens} setItem={setItem} categorias={categorias} />
                : <SubAbaItens itens={pedido?.itens} subtotal={pedido?.subtotal} desconto={pedido?.desconto} total={pedido?.total} />
            )}

            {subaba === "pagamentos" && <SubAbaPagamentos pagamentos={pedido?.pagamentos} />}

            {subaba === "midias" && <MidiasGaleria pedidoId={pedidoId} token={localStorage.getItem("token")} />}
          </div>
        </div>
      </div>

      {toast && <div className="pf-toast">{toast}</div>}

      {printOpen && <PedidoPrint pedido={pedido} onClose={() => setPrintOpen(false)} />}

      {instalacao && (
        <ModalSelecionarItensInstalacao
          pedido={instalacao}
          onClose={() => setInstalacao(null)}
          onContinuar={(itensSel) => {
            setInstalacao(null);
            navigate("/agendamentos", {
              state: {
                novoInstalacao: {
                  pedido_id:     pedido.id,
                  pedido_numero: pedido.numero,
                  cliente:       pedido.cliente_nome || "",
                  cep:           pedido.cep,
                  rua:           pedido.rua,
                  numero:        pedido.numero_rua,
                  complemento:   pedido.complemento,
                  bairro:        pedido.bairro,
                  cidade:        pedido.cidade,
                  estado:        pedido.estado,
                  itens:         itensSel,
                },
              },
            });
          }}
        />
      )}

      {historicoAberto && (
        <div className="pf-drawer-overlay" onClick={() => setHistoricoAberto(false)}>
          <div className="pf-drawer-historico" onClick={e => e.stopPropagation()}>
            <div className="pf-drawer-header">
              <h3 className="pf-drawer-titulo">Histórico</h3>
              <button className="pf-modal-fechar" onClick={() => setHistoricoAberto(false)}>×</button>
            </div>
            <div className="pf-drawer-corpo">
              <AbaHistorico pedidoId={pedidoId} etapa="dados_pedido" />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

> Note que o `}` final faz parte do fechamento da função `ModalDadosPedido` — confira que não sobrou nenhum `}` duplicado nem faltando ao colar.

- [ ] **Step 3: Rodar o lint**

Run: `cd frontend-web && npm run lint`
Expected: sem erros. Se aparecer `'AbaHistorico' is not defined` ou `'fmtData' is not defined` etc., confira se as Tasks 2-5 foram aplicadas corretamente (os componentes precisam existir antes de `ModalDadosPedido` no arquivo).

- [ ] **Step 4: Iniciar o servidor de desenvolvimento e verificar visualmente**

Run: `cd frontend-web && npm run dev`

No navegador, abra um pedido em `/pedidos/:id/fluxo` e clique no card "DADOS DO PEDIDO". Confirme:
- A barra lateral mostra cliente, badge de status, total e (se houver) o aviso de pendências, com os botões de ação empilhados.
- As 4 sub-abas (Geral, Itens, Pagamentos, Mídias) trocam o conteúdo da área à direita sem recarregar a página.
- A sub-aba "Itens" mostra a tabela e os totais; "Pagamentos" mostra os grupos por forma; "Mídias" mostra a galeria.
- Clicar em "✏ Editar" troca os botões da lateral para "Cancelar"/"Salvar" e exibe o formulário em "Geral" e o editor de categoria/vínculo em "Itens".
- "Salvar" persiste as alterações e retorna ao modo de visualização (toast "Salvo com sucesso!").
- "🕘 Histórico" abre o painel deslizante sobre o conteúdo, e o × ou clique fora fecha.
- Os demais botões (Imprimir, PDF Original, Agendar Instalação, Excluir) continuam funcionando como antes.
- Redimensionar a janela para uma largura estreita (< 720px) empilha a lateral acima do conteúdo, sem cortar texto ou sobrepor elementos.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/pedidos/PedidoFluxo.jsx
git commit -m "feat(pedidos): redesign do modal Dados do Pedido — layout em colunas com sub-abas"
```

---

## Task 7: Verificação final

- [ ] **Step 1: Conferir o `ModalEntrega` (não deveria ter sido afetado)**

No mesmo navegador, abra o card "ENTREGA" do mesmo pedido (com a etapa 1 concluída, se possível) e confirme que:
- As abas superiores "Detalhes"/"Histórico" continuam funcionando normalmente.
- Os botões de ação e a lista de agendamentos aparecem como antes.

Isso confirma que as classes CSS compartilhadas (`pf-modal-abas`, `pf-modal-aba`, `pf-acoes`, `pf-modal-body`) seguem intactas para o `ModalEntrega`.

- [ ] **Step 2: Rodar o lint final**

Run: `cd frontend-web && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Revisar o diff completo**

Run: `git diff 514d339 -- frontend-web/src/pages/pedidos/PedidoFluxo.jsx frontend-web/src/pages/pedidos/PedidoFluxo.css`

Confirme que todas as mudanças correspondem ao design da spec (`docs/superpowers/specs/2026-06-06-modal-dados-pedido-redesign-design.md`) e que nada além do `ModalDadosPedido`/CSS do redesign foi alterado.
