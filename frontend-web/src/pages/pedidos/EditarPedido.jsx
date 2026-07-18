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
          cliente_nome:        p.cliente_nome || "",
          pedido_numero:       p.numero || "",
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
          expandido:      it.expandido ?? false,
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

            <div className="os-info-bar">
              <div className="os-info-row">
                <div className="os-info-item os-info-item-grow">
                  <span className="os-info-label">Cliente</span>
                  <span className="os-info-value">{form.cliente_nome || "—"}</span>
                </div>
                <div className="os-info-item">
                  <span className="os-info-label">Pedido</span>
                  <span className="os-info-value tag-pedido">{form.pedido_numero || "—"}</span>
                </div>
                <div className="os-info-item">
                  <span className="os-info-label">Vendedor</span>
                  <span className="os-info-value">{form.consultor_nome || "—"}</span>
                </div>
                <div className="os-info-item">
                  <span className="os-info-label">Arquiteto</span>
                  <span className="os-info-value">{form.arquiteto_nome || "—"}</span>
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Dados do Pedido</div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                    {STATUS_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="os-field">
                  <label>Data do Pedido</label>
                  <input type="date" value={form.data_pedido} onChange={(e) => set("data_pedido", e.target.value)} />
                </div>
              </div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>CPF/CNPJ</label>
                  <input type="text" value={form.cpf_cnpj} onChange={(e) => set("cpf_cnpj", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>E-mail</label>
                  <input type="text" value={form.email_cliente} onChange={(e) => set("email_cliente", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Endereço de Entrega</div>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 10 }}>
                <div className="os-field">
                  <label>CEP</label>
                  <input type="text" value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
                </div>
                <div className="os-field">
                  <label>Rua / Logradouro</label>
                  <input type="text" value={form.rua} onChange={(e) => set("rua", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Número</label>
                  <input type="text" value={form.numero} onChange={(e) => set("numero", e.target.value)} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 10 }}>
                <div className="os-field">
                  <label>Complemento</label>
                  <input type="text" value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Bairro</label>
                  <input type="text" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Cidade</label>
                  <input type="text" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>UF</label>
                  <input type="text" value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} maxLength={2} style={{ textTransform: "uppercase" }} />
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Observações</div>
              <div className="os-grid-2">
                <div className="os-field">
                  <label>Observações</label>
                  <textarea className="os-textarea" rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
                </div>
                <div className="os-field">
                  <label>Observações de Entrega</label>
                  <textarea className="os-textarea" rows={3} value={form.observacoes_entrega} onChange={(e) => set("observacoes_entrega", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Itens ({itens.length})</div>
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
                    <input
                      type="number" min="0" step="0.01" value={it.quantidade || 1}
                      disabled={it.expandido}
                      title={it.expandido ? "Quantidade travada: a Conferência técnica já foi iniciada para este item." : undefined}
                      onChange={(e) => setItem(i, "quantidade", e.target.value)}
                    />
                    <select value={it.unidade || "UN"} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={it.preco_unitario || ""} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
                    <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
                    <button
                      className="pd-item-del"
                      onClick={() => removeItem(i)}
                      disabled={it.expandido}
                      title={it.expandido ? "Não é possível excluir: a Conferência técnica já foi iniciada para este item." : undefined}
                    >×</button>
                  </div>
                ))}
              </div>
              <button className="pd-add-linha" onClick={addItem}>+ Adicionar item</button>

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

            <div className="os-form-section">
              <div className="os-section-title">Pagamentos ({pagamentos.length})</div>
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
