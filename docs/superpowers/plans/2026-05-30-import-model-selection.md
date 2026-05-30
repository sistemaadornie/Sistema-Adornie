# Seleção de Modelos e Vinculação de Itens na Importação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na etapa de revisão do modal de importação de pedidos, detectar palavras-chave na coluna produto (cortina, forro, persiana, trilho) para permitir seleção de modelos/specs e vinculação de trilhos a cortinas/forros.

**Architecture:** Detecção de keywords no frontend via arquivo de config estático; painel lateral abre ao clicar "Selecionar modelo" em linhas detectadas; dados de modelo/specs/vínculo são enviados ao backend na confirmação e persistidos em 3 novas colunas em `pedido_itens`.

**Tech Stack:** React 18, Node.js/Express, PostgreSQL (via `db.query`), inline styles (padrão do projeto)

---

## Mapa de Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `backend/src/database/migrations/pedido_itens_v3.sql` |
| Criar | `frontend-web/src/pages/pedidos/importKeywordConfig.js` |
| Criar | `frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx` |
| Modificar | `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx` |
| Modificar | `backend/src/services/pedidoService.js` (função `_salvarItens`, linhas 106–171) |

---

## Task 1: Migração SQL

**Files:**
- Create: `backend/src/database/migrations/pedido_itens_v3.sql`

- [ ] **Step 1: Criar arquivo de migração**

```sql
-- pedido_itens_v3.sql
-- Adiciona campos de modelo, especificacoes e vinculação entre itens
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS modelo             VARCHAR(120),
  ADD COLUMN IF NOT EXISTS especificacoes     JSONB,
  ADD COLUMN IF NOT EXISTS item_vinculado_id  INTEGER REFERENCES pedido_itens(id);
```

- [ ] **Step 2: Rodar a migração no banco**

Conecte ao banco de dados do projeto e execute:

```sql
\i backend/src/database/migrations/pedido_itens_v3.sql
```

Ou via psql direto:
```bash
psql $DATABASE_URL -f backend/src/database/migrations/pedido_itens_v3.sql
```

Resultado esperado: `ALTER TABLE` sem erros.

- [ ] **Step 3: Verificar colunas criadas**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pedido_itens'
  AND column_name IN ('modelo','especificacoes','item_vinculado_id');
```

Resultado esperado: 3 linhas retornadas.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/pedido_itens_v3.sql
git commit -m "feat: adiciona colunas modelo, especificacoes e item_vinculado_id em pedido_itens"
```

---

## Task 2: Arquivo de Configuração de Keywords

**Files:**
- Create: `frontend-web/src/pages/pedidos/importKeywordConfig.js`

- [ ] **Step 1: Criar o arquivo**

```js
// frontend-web/src/pages/pedidos/importKeywordConfig.js

export const KEYWORD_MODELS = [
  {
    keywords: ["cortina"],
    tipo: "cortina",
    modelos: [
      "Cortina Wave",
      "Cortina Prega Macho",
      "Cortina Prega Americana",
      "Cortina Franzida",
    ],
  },
  {
    keywords: ["forro"],
    tipo: "forro",
    modelos: ["Forro Microfibra", "Forro Blackout"],
  },
  {
    keywords: ["persiana"],
    tipo: "persiana",
    modelos: [
      {
        nome: "Meliade",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Illumine",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Lumiere / Diamond / Silouette",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Rolo / Rollo",
        tubos: ["30mm", "38mm", "45mm", "53mm", "65mm", "70mm", "88mm", "110mm"],
        caixas: ["Caixa box 90mm", "Caixa box 70mm", "Caixa box grande"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
      {
        nome: "Rolo Stilo / Shadow / Twinline / D. Vision",
        tubos: ["30mm", "38mm", "45mm", "53mm"],
        bandos: ["Bandô 32mm", "Bandô 38mm", "Bandô 53mm"],
      },
    ],
  },
  {
    keywords: ["trilho"],
    tipo: "trilho",
    modelos: [], // sem seleção de modelo — só ativa vinculação
  },
];

export function detectarTipo(descricao = "") {
  const lower = descricao.toLowerCase();
  return KEYWORD_MODELS.find((cfg) =>
    cfg.keywords.some((k) => lower.includes(k))
  ) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/importKeywordConfig.js
git commit -m "feat: config de keywords para detecção de modelos na importação"
```

---

## Task 3: Componente ModeloSelectorPanel

**Files:**
- Create: `frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx`

Este componente renderiza um painel flutuante (overlay fixo sobre o modal) com seleção de modelo. Para `cortina`/`forro`: botões simples. Para `persiana`: 3 dropdowns em cascata.

- [ ] **Step 1: Criar o componente**

```jsx
// frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx
import { useState } from "react";

const panelStyle = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 1200,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg, 10px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
  minWidth: 320,
  maxWidth: 420,
  width: "90vw",
};

const backdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1199,
  background: "rgba(0,0,0,0.35)",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 700,
  fontSize: 14,
};

const bodyStyle = {
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const fieldStyle = { display: "flex", flexDirection: "column", gap: 4 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" };

function CloseBtn({ onClose }) {
  return (
    <button
      onClick={onClose}
      style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-muted)", lineHeight: 1 }}
    >
      ×
    </button>
  );
}

function SimpleSelectorPanel({ titulo, config, valor, onChange, onClose }) {
  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>{titulo}</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={bodyStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {config.modelos.map((m) => (
              <button
                key={m}
                onClick={() => { onChange({ modelo: m, especificacoes: null }); onClose(); }}
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-md, 6px)",
                  border: valor?.modelo === m ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                  background: valor?.modelo === m ? "var(--color-primary)" : "var(--color-surface-soft)",
                  color: valor?.modelo === m ? "#fff" : "var(--color-text)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PersianaSelectorPanel({ config, valor, onChange, onClose }) {
  const [modeloSel, setModeloSel] = useState(valor?.modelo || "");
  const [tuboSel,   setTuboSel]   = useState(valor?.especificacoes?.tubo  || "");
  const [bandoSel,  setBandoSel]  = useState(valor?.especificacoes?.bando || "");

  const modeloCfg = config.modelos.find((m) => m.nome === modeloSel);
  const opcoesBandoCaixa = modeloCfg
    ? [...(modeloCfg.caixas || []), ...(modeloCfg.bandos || [])]
    : [];

  function aplicar() {
    if (!modeloSel || !tuboSel) return;
    onChange({
      modelo: modeloSel,
      especificacoes: { tubo: tuboSel, bando: bandoSel || null },
    });
    onClose();
  }

  const selectStyle = {
    padding: "6px 10px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md, 6px)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontSize: 13,
  };

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span>Especificações da persiana</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={bodyStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Modelo</label>
            <select
              value={modeloSel}
              onChange={(e) => { setModeloSel(e.target.value); setTuboSel(""); setBandoSel(""); }}
              style={selectStyle}
            >
              <option value="">— selecionar —</option>
              {config.modelos.map((m) => (
                <option key={m.nome} value={m.nome}>{m.nome}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Tubo</label>
            <select
              value={tuboSel}
              onChange={(e) => setTuboSel(e.target.value)}
              disabled={!modeloCfg}
              style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
            >
              <option value="">— selecionar —</option>
              {(modeloCfg?.tubos || []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>
              Bandô / Caixa{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
            </label>
            <select
              value={bandoSel}
              onChange={(e) => setBandoSel(e.target.value)}
              disabled={!modeloCfg}
              style={{ ...selectStyle, opacity: modeloCfg ? 1 : 0.5 }}
            >
              <option value="">— Nenhum —</option>
              {opcoesBandoCaixa.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <button
            className="ek-btn ek-btn-primary"
            onClick={aplicar}
            disabled={!modeloSel || !tuboSel}
            style={{ marginTop: 4 }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </>
  );
}

export default function ModeloSelectorPanel({ tipo, config, valor, onChange, onClose }) {
  if (tipo === "cortina") {
    return <SimpleSelectorPanel titulo="Selecionar modelo de cortina" config={config} valor={valor} onChange={onChange} onClose={onClose} />;
  }
  if (tipo === "forro") {
    return <SimpleSelectorPanel titulo="Selecionar modelo de forro" config={config} valor={valor} onChange={onChange} onClose={onClose} />;
  }
  if (tipo === "persiana") {
    return <PersianaSelectorPanel config={config} valor={valor} onChange={onChange} onClose={onClose} />;
  }
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-web/src/pages/pedidos/ModeloSelectorPanel.jsx
git commit -m "feat: componente ModeloSelectorPanel para seleção de modelos na importação"
```

---

## Task 4: Modificar ImportarPedidoModal.jsx

**Files:**
- Modify: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`

Adicionar: state para seleções e painel, colunas "Modelo" e "Vinculado a" na tabela de revisão, integração com `confirmar()`.

- [ ] **Step 1: Adicionar imports no topo do arquivo**

Arquivo: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`, linha 1

Substituir:
```js
import { useRef, useState } from "react";
import { api } from "../../services/api";
```

Por:
```js
import { useRef, useState } from "react";
import { api } from "../../services/api";
import { detectarTipo } from "./importKeywordConfig";
import ModeloSelectorPanel from "./ModeloSelectorPanel";
```

- [ ] **Step 2: Adicionar estado de seleções e painel aberto**

Arquivo: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`, após a linha do `useState` de `fonteImport` (linha 36), adicionar:

```js
  const [selecoes,     setSelecoes]     = useState({}); // { [itemIdx]: { modelo, especificacoes, item_vinculado_idx } }
  const [panelAberto,  setPanelAberto]  = useState(null); // índice do item com painel aberto, ou null
```

- [ ] **Step 3: Resetar seleções ao aplicar novo extrato**

Arquivo: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`

Na função `aplicarExtraido` (linha 56), logo após `setEtapa("revisao")` (linha 94), adicionar:

```js
    setSelecoes({});
    setPanelAberto(null);
```

- [ ] **Step 4: Substituir a função `removeItem` para manter coerência das seleções**

Substituir a função `removeItem` existente (linha 143):
```js
  function removeItem(i)  { setItens((p) => p.filter((_, idx) => idx !== i)); }
```

Por:
```js
  function removeItem(i) {
    setItens((p) => p.filter((_, idx) => idx !== i));
    setSelecoes((prev) => {
      const next = {};
      Object.entries(prev).forEach(([idxStr, sel]) => {
        const idx = Number(idxStr);
        if (idx === i) return;
        const newIdx = idx > i ? idx - 1 : idx;
        let newSel = { ...sel };
        if (sel.item_vinculado_idx === i) {
          newSel.item_vinculado_idx = null;
        } else if (sel.item_vinculado_idx != null && sel.item_vinculado_idx > i) {
          newSel.item_vinculado_idx = sel.item_vinculado_idx - 1;
        }
        next[newIdx] = newSel;
      });
      return next;
    });
    if (panelAberto === i) setPanelAberto(null);
    else if (panelAberto != null && panelAberto > i) setPanelAberto(panelAberto - 1);
  }
```

- [ ] **Step 5: Substituir a função `confirmar` para incluir seleções no payload**

Substituir a função `confirmar` existente (linhas 155–165):
```js
  function confirmar() {
    const dados = {
      ...form,
      cliente_id:   form.cliente_id   ? Number(form.cliente_id)   : null,
      consultor_id: form.consultor_id ? Number(form.consultor_id) : null,
      itens:        itens.filter((it) => it.descricao?.trim()),
      pagamentos:   pagamentos.filter((pg) => pg.forma?.trim()),
    };
    delete dados._endereco_completo;
    onSalvar(dados);
  }
```

Por:
```js
  function confirmar() {
    // Filtra itens não-vazios mantendo o índice original para resolver seleções
    const filteredWithOrigIdx = itens
      .map((it, origIdx) => ({ it, origIdx }))
      .filter(({ it }) => it.descricao?.trim());

    // Mapeia origIdx → newIdx para resolver item_vinculado_idx
    const origToNew = {};
    filteredWithOrigIdx.forEach(({ origIdx }, newIdx) => {
      origToNew[origIdx] = newIdx;
    });

    const itensFinais = filteredWithOrigIdx.map(({ it, origIdx }) => {
      const sel = selecoes[origIdx] || {};
      const vinculadoOrigIdx = sel.item_vinculado_idx ?? null;
      return {
        ...it,
        modelo:               sel.modelo              || null,
        especificacoes:       sel.especificacoes      || null,
        item_vinculado_ordem: vinculadoOrigIdx != null
          ? (origToNew[vinculadoOrigIdx] ?? null)
          : null,
      };
    });

    const dados = {
      ...form,
      cliente_id:   form.cliente_id   ? Number(form.cliente_id)   : null,
      consultor_id: form.consultor_id ? Number(form.consultor_id) : null,
      itens:        itensFinais,
      pagamentos:   pagamentos.filter((pg) => pg.forma?.trim()),
    };
    delete dados._endereco_completo;
    onSalvar(dados);
  }
```

- [ ] **Step 6: Adicionar colunas "Modelo" e "Vinculado a" no header da tabela de itens**

Arquivo: `frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx`

Localizar o bloco do header da tabela de itens (linhas 443–455):
```jsx
                  <div className="pd-itens-editor-header">
                    <span>#</span>
                    <span>Ambiente</span>
                    <span>Referência</span>
                    <span>Cor</span>
                    <span>Produto</span>
                    <span>Medidas</span>
                    <span>Qtde</span>
                    <span>Un</span>
                    <span>Preço Unit.</span>
                    <span>Total</span>
                    <span></span>
                  </div>
```

Antes desse bloco, adicionar a variável computada (dentro do bloco `{etapa === "revisao" && form && (...)}`, antes do `return` da tabela de itens):
```jsx
                {(() => {
                  const hasTrilho = itens.some(
                    (it) => detectarTipo(it.descricao)?.tipo === "trilho"
                  );
```

Substituir o bloco do header por:
```jsx
                  return (
                    <>
                  <div className="pd-itens-editor-header">
                    <span>#</span>
                    <span>Ambiente</span>
                    <span>Referência</span>
                    <span>Cor</span>
                    <span>Produto</span>
                    <span>Modelo</span>
                    {hasTrilho && <span>Vinculado a</span>}
                    <span>Medidas</span>
                    <span>Qtde</span>
                    <span>Un</span>
                    <span>Preço Unit.</span>
                    <span>Total</span>
                    <span></span>
                  </div>
```

> **Nota:** O bloco `{(() => { ... })()}` fecha logo após a tabela de itens. Veja o Step 7 para o código completo das linhas de item.

- [ ] **Step 7: Substituir o bloco completo de itens (header + rows + botão adicionar)**

Na seção `{/* ITENS EXTRAÍDOS */}` (a partir da linha 438), substituir o bloco inteiro da tabela de itens (de `<div className="pd-itens-editor">` até `<button className="pd-add-linha" onClick={addItem}>+ Adicionar item</button>`) pelo seguinte:

```jsx
                {(() => {
                  const hasTrilho = itens.some(
                    (it) => detectarTipo(it.descricao)?.tipo === "trilho"
                  );

                  const opcoesVinculo = itens
                    .map((it, idx) => {
                      const t = detectarTipo(it.descricao)?.tipo;
                      if (t !== "cortina" && t !== "forro") return null;
                      const modelo = selecoes[idx]?.modelo || it.descricao;
                      return { idx, label: `#${idx + 1} · ${it.ambiente || "—"} · ${modelo}` };
                    })
                    .filter(Boolean);

                  return (
                    <>
                      <div className="pd-itens-editor">
                        <div className="pd-itens-editor-header">
                          <span>#</span>
                          <span>Ambiente</span>
                          <span>Referência</span>
                          <span>Cor</span>
                          <span>Produto</span>
                          <span>Modelo</span>
                          {hasTrilho && <span>Vinculado a</span>}
                          <span>Medidas</span>
                          <span>Qtde</span>
                          <span>Un</span>
                          <span>Preço Unit.</span>
                          <span>Total</span>
                          <span></span>
                        </div>

                        {itens.map((it, i) => {
                          const cfg    = detectarTipo(it.descricao);
                          const tipo   = cfg?.tipo ?? null;
                          const sel    = selecoes[i] || {};
                          const temSel = !!sel.modelo;

                          return (
                            <div key={i} className="pd-itens-editor-row">
                              <span className="pd-item-num">{i + 1}</span>
                              <input placeholder="Sala"   value={it.ambiente   || ""} onChange={(e) => setItem(i, "ambiente",   e.target.value)} />
                              <input placeholder="ADO500" value={it.referencia || ""} onChange={(e) => setItem(i, "referencia", e.target.value)} />
                              <input placeholder="Cor"    value={it.cor        || ""} onChange={(e) => setItem(i, "cor",        e.target.value)} />
                              <input placeholder="Produto" value={it.descricao || ""} onChange={(e) => setItem(i, "descricao", e.target.value)} className="pd-item-desc" />

                              {/* Coluna Modelo */}
                              <div style={{ display: "flex", alignItems: "center" }}>
                                {tipo && tipo !== "trilho" ? (
                                  temSel ? (
                                    <button
                                      onClick={() => setPanelAberto(i)}
                                      style={{
                                        padding: "3px 8px",
                                        borderRadius: 4,
                                        border: "1px solid var(--color-success, #22c55e)",
                                        background: "rgba(34,197,94,0.1)",
                                        color: "var(--color-success, #22c55e)",
                                        fontSize: 12,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {sel.modelo} ✓
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setPanelAberto(i)}
                                      style={{
                                        padding: "3px 8px",
                                        borderRadius: 4,
                                        border: "1px dashed var(--color-primary)",
                                        background: "transparent",
                                        color: "var(--color-primary)",
                                        fontSize: 12,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      + Selecionar
                                    </button>
                                  )
                                ) : (
                                  <span />
                                )}
                              </div>

                              {/* Coluna Vinculado a (só renderiza se hasTrilho) */}
                              {hasTrilho && (
                                <div>
                                  {tipo === "trilho" ? (
                                    <select
                                      value={sel.item_vinculado_idx ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setSelecoes((prev) => ({
                                          ...prev,
                                          [i]: {
                                            ...prev[i],
                                            item_vinculado_idx: v === "" ? null : Number(v),
                                          },
                                        }));
                                      }}
                                      style={{
                                        padding: "3px 6px",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: 4,
                                        background: "var(--color-surface)",
                                        color: "var(--color-text)",
                                        fontSize: 12,
                                        maxWidth: 160,
                                      }}
                                    >
                                      <option value="">— Não vincular —</option>
                                      {opcoesVinculo.map(({ idx, label }) => (
                                        <option key={idx} value={idx}>{label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span />
                                  )}
                                </div>
                              )}

                              <input placeholder="2,00x3,00" value={it.medidas   || ""} onChange={(e) => setItem(i, "medidas",       e.target.value)} />
                              <input type="number" min="0" step="0.01" value={it.quantidade || 1} onChange={(e) => setItem(i, "quantidade",    e.target.value)} />
                              <select value={it.unidade || "UN"} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                                {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                              </select>
                              <input type="number" min="0" step="0.01" value={it.preco_unitario || ""} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
                              <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
                              <button className="pd-item-del" onClick={() => removeItem(i)}>×</button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Painel de seleção de modelo */}
                      {panelAberto != null && (() => {
                        const cfg = detectarTipo(itens[panelAberto]?.descricao);
                        if (!cfg || cfg.tipo === "trilho") return null;
                        return (
                          <ModeloSelectorPanel
                            tipo={cfg.tipo}
                            config={cfg}
                            valor={selecoes[panelAberto] || null}
                            onChange={(novoValor) =>
                              setSelecoes((prev) => ({ ...prev, [panelAberto]: { ...(prev[panelAberto] || {}), ...novoValor } }))
                            }
                            onClose={() => setPanelAberto(null)}
                          />
                        );
                      })()}
                    </>
                  );
                })()}
```

Logo após, manter o botão "Adicionar item":
```jsx
                <button className="pd-add-linha" onClick={addItem}>+ Adicionar item</button>
```

- [ ] **Step 8: Verificar no navegador**

Iniciar o frontend (`npm run dev` ou o script equivalente do projeto) e abrir o modal de importação. Colar um texto de teste com "CORTINA", "PERSIANA", "FORRO" e "TRILHO MOTORIZADO" na coluna produto. Na etapa de revisão:
- Linhas com "cortina" e "forro" devem mostrar botão "+ Selecionar"
- Linhas com "persiana" também devem mostrar botão "+ Selecionar"
- Linhas com "trilho" devem mostrar o dropdown "Vinculado a"
- Ao clicar em "+ Selecionar" em cortina/forro, deve abrir o painel com botões de modelos
- Ao clicar em "+ Selecionar" em persiana, deve abrir o painel com 3 dropdowns

- [ ] **Step 9: Commit**

```bash
git add frontend-web/src/pages/pedidos/ImportarPedidoModal.jsx
git commit -m "feat: seleção de modelos e vinculação de itens na revisão de importação"
```

---

## Task 5: Atualizar _salvarItens() no Backend

**Files:**
- Modify: `backend/src/services/pedidoService.js` (linhas 106–171)

Adicionar os campos `modelo`, `especificacoes` e `item_vinculado_id` no INSERT/UPDATE, e resolver `item_vinculado_ordem` após todas as inserções.

- [ ] **Step 1: Substituir a função `_salvarItens` completa**

Localizar a função em `backend/src/services/pedidoService.js` (linha 106). Substituir toda a função pelo código abaixo:

```js
async function _salvarItens(client, pedidoId, itens = []) {
  const existingRes = await client.query(
    `SELECT id FROM pedido_itens WHERE pedido_id = $1`,
    [pedidoId]
  );
  const existingIds = existingRes.rows.map((r) => r.id);
  const incomingIds = itens.map((it) => Number(it.id)).filter((id) => Number.isFinite(id) && id > 0);

  const idsParaDeletar = existingIds.filter((id) => !incomingIds.includes(id));
  if (idsParaDeletar.length > 0) {
    await client.query(`DELETE FROM ordem_servico WHERE pedido_item_id = ANY($1)`, [idsParaDeletar]);
    await client.query(`DELETE FROM pedido_itens WHERE id = ANY($1)`, [idsParaDeletar]);
  }

  const insertedIds = []; // IDs na mesma ordem do array itens

  for (let i = 0; i < itens.length; i++) {
    const it     = itens[i];
    const itemId = Number(it.id);

    if (Number.isFinite(itemId) && itemId > 0 && existingIds.includes(itemId)) {
      // UPDATE item existente
      await client.query(
        `UPDATE pedido_itens
         SET ambiente=$1, referencia=$2, cor=$3, descricao=$4, medidas=$5,
             quantidade=$6, unidade=$7, preco_unitario=$8, valor=$9, ordem=$10,
             modelo=$11, especificacoes=$12, item_vinculado_id=$13
         WHERE id=$14 AND pedido_id=$15`,
        [
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          it.especificacoes      || null,
          it.item_vinculado_id   || null,
          itemId,
          pedidoId,
        ]
      );
      insertedIds.push(itemId);
    } else {
      // INSERT novo item (sem item_vinculado_id ainda — resolvido depois)
      const ins = await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, ambiente, referencia, cor, descricao, medidas,
            quantidade, unidade, preco_unitario, valor, ordem,
            modelo, especificacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          pedidoId,
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          it.especificacoes      || null,
        ]
      );
      insertedIds.push(ins.rows[0].id);
    }
  }

  // Resolve item_vinculado_ordem → item_vinculado_id para novos itens
  for (let i = 0; i < itens.length; i++) {
    const ordem = itens[i].item_vinculado_ordem;
    if (ordem != null && Number.isFinite(Number(ordem)) && insertedIds[Number(ordem)] != null) {
      await client.query(
        `UPDATE pedido_itens SET item_vinculado_id = $1 WHERE id = $2`,
        [insertedIds[Number(ordem)], insertedIds[i]]
      );
    }
  }
}
```

- [ ] **Step 2: Verificar no banco após importação de teste**

Após fazer uma importação com cortina + trilho vinculado, executar:

```sql
SELECT id, descricao, modelo, especificacoes, item_vinculado_id
FROM pedido_itens
WHERE pedido_id = <id_do_pedido_importado>
ORDER BY ordem;
```

Resultado esperado:
- Linha da cortina: `modelo = 'Cortina Wave'`, `especificacoes = null`, `item_vinculado_id = null`
- Linha do trilho: `modelo = null`, `especificacoes = null`, `item_vinculado_id = <id_da_cortina>`
- Linha da persiana (se houver): `modelo = 'Rolo / Rollo'`, `especificacoes = {"tubo":"45mm","bando":"Bandô 38mm"}`, `item_vinculado_id = null`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/pedidoService.js
git commit -m "feat: persiste modelo, especificacoes e item_vinculado_id ao importar pedido"
```

---

## Task 6: Verificação End-to-End

- [ ] **Step 1: Preparar texto de teste**

Usar o seguinte texto no campo "Colar texto" do modal de importação (simula um pedido com os 4 tipos de item):

```
Pedido de Venda
#00009999
01/06/2026
Cliente Teste

#	Ambiente	Referência	Cor	Produto	Medidas	Qtde	Un	Preço	Total
1	Sala	ADO001		CORTINA LINHO BEGE	3,00x2,80	1	UN	850,00	850,00
2	Sala	ADO002		TRILHO MOTORIZADO 3M	3,00	1	UN	1200,00	1200,00
3	Quarto	ADO003		PERSIANA ROLO SCREEN	2,50x2,20	1	UN	980,00	980,00
4	Quarto	ADO004		FORRO MICROFIBRA	2,50x2,20	1	M2	45,00	247,50
```

- [ ] **Step 2: Testar detecção e seleção**

1. Colar o texto e clicar "Processar texto →"
2. Na revisão: verificar que as 4 linhas aparecem
3. Linha 1 (CORTINA): clicar "+ Selecionar", escolher "Cortina Wave" → badge deve aparecer
4. Linha 2 (TRILHO): dropdown "Vinculado a" deve listar "#1 · Sala · Cortina Wave" → selecionar
5. Linha 3 (PERSIANA): clicar "+ Selecionar", escolher "Rolo / Rollo", tubo "45mm", bandô "Bandô 38mm" → clicar Aplicar → badge "Rolo / Rollo ✓"
6. Linha 4 (FORRO): clicar "+ Selecionar", escolher "Forro Blackout" → badge

- [ ] **Step 3: Confirmar e verificar banco**

1. Clicar "Confirmar importação"
2. Verificar no banco que as 4 colunas novas estão preenchidas corretamente (query do Task 5, Step 2)
3. Abrir o pedido criado na tela de pedidos e verificar que ele aparece normalmente

- [ ] **Step 4: Testar caso sem seleção (opcional)**

Importar outro pedido sem selecionar nenhum modelo — confirmar que a importação funciona normalmente com `modelo = null` e sem bloqueio.

---

## Self-Review

**Cobertura da spec:**
- ✅ Migração SQL com 3 colunas
- ✅ Config de keywords (cortina/forro/persiana/trilho) com todos os modelos e specs do usuário
- ✅ Coluna "Modelo" com botão e painel lateral (simples para cortina/forro, cascata para persiana)
- ✅ Coluna "Vinculado a" condicional (somente quando há trilho), somente em linhas de trilho
- ✅ Badge após seleção com possibilidade de reabrir
- ✅ `removeItem` mantém coerência dos índices em `selecoes`
- ✅ `confirmar()` mescla seleções e resolve `item_vinculado_ordem → item_vinculado_id` no backend
- ✅ Campos opcionais (nenhum bloqueio se não selecionado)
- ✅ Verificação end-to-end descrita

**Consistência de tipos:**
- `selecoes[idx]` sempre `{ modelo?, especificacoes?, item_vinculado_idx? }` — consistente em todos os steps
- `item_vinculado_ordem` (frontend) → resolvido para `item_vinculado_id` (backend) — fluxo claro no Task 5
- `detectarTipo()` retorna `{ tipo, modelos, keywords }` ou `null` — usado consistentemente
