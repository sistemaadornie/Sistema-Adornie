import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";
import "../../ImportarPedidoModal.css";

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

export default function EditarPedidoModal({ pedidoId, onClose, onSalvo }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando,   setSalvando]   = useState(false);
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
        });
        setItens((p.itens || []).map((it) => ({
          id:             it.id,
          ambiente:       it.ambiente || "",
          referencia:     it.referencia || "",
          cor:            it.cor || "",
          descricao:      it.descricao || "",
          largura:        it.largura ?? "",
          altura:         it.altura ?? "",
          quantidade:     it.quantidade ?? 1,
          unidade:        it.unidade || "UN",
          preco_unitario: it.preco_unitario ?? "",
          valor:          it.valor ?? "",
          categoria_id:   it.categoria_id ?? null,
          sem_vinculo:    it.sem_vinculo ?? false,
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
      onSalvo?.();
    } catch (e) {
      setErro(e?.message || "Erro ao salvar pedido.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">✏️ Editar Pedido</div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13, marginBottom: 16 }}>
              ⚠ {erro}
            </div>
          )}

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

        <div className="pf-modal-header" style={{ borderTop: "1px solid var(--pf-separador)", borderBottom: "none", justifyContent: "flex-end", gap: 10 }}>
          <button className="pf-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="pf-btn-primary" onClick={salvar} disabled={salvando || carregando}>
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
