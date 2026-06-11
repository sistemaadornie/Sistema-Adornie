import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import "./ImportarPedidoModal.css";

const FORMAS_PAGAMENTO = ["PIX / DEPÓSITO", "CONTRA ENTREGA", "CARTÃO DE CRÉDITO", "BOLETO", "DINHEIRO", "CHEQUE"];
const UNIDADES = ["M2", "ML", "UN", "PÇ"];
const STATUS_OPCOES = [
  { value: "pendente",     label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido",    label: "Concluído" },
  { value: "cancelado",    label: "Cancelado" },
];

function fmtMoeda(v) {
  if (v == null || v === "") return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMedidas(medidas) {
  if (!medidas) return { largura: "", altura: "" };
  const parts = String(medidas).split(/[xX×]/);
  return { largura: (parts[0] || "").trim(), altura: (parts[1] || "").trim() };
}

function itemVazio() {
  return {
    ambiente: "", referencia: "", cor: "", descricao: "",
    largura: "", altura: "", quantidade: 1, unidade: "UN",
    preco_unitario: "", valor: "", categoria_id: null,
  };
}
function pagVazio() {
  return { forma: "PIX / DEPÓSITO", parcela: "1/1", vencimento: "", valor: "" };
}

export default function ImportarPedidoModal({ onClose, onSalvar, salvando }) {
  const pdfRef = useRef(null);
  const [etapa,       setEtapa]       = useState("upload");
  const [carregando,  setCarregando]  = useState(false);
  const [erro,        setErro]        = useState("");
  const [pdfOriginal, setPdfOriginal] = useState(null);
  const [textoColar,  setTextoColar]  = useState("");
  const [form,        setForm]        = useState(null);
  const [itens,       setItens]       = useState([]);
  const [pagamentos,  setPagamentos]  = useState([]);
  const [fonteImport, setFonteImport] = useState("");
  const [categorias,  setCategorias]  = useState([]);

  useEffect(() => {
    api.get("/categorias").then((r) => setCategorias(r.categorias || [])).catch(() => {});
  }, []);

  async function preencherViaCep(cepRaw) {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.erro) return;
      setForm(prev => ({
        ...prev,
        rua:    prev.rua    || data.logradouro || "",
        bairro: prev.bairro || data.bairro     || "",
        cidade: prev.cidade || data.localidade || "",
        estado: prev.estado || data.uf         || "",
      }));
    } catch (_) {}
  }

  function aplicarExtraido(ext, fonte) {
    const hoje = new Date().toISOString().slice(0, 10);
    setFonteImport(fonte);
    setForm({
      numero_origem:       ext.numero_origem       || "",
      data_pedido:         ext.data_pedido         || hoje,
      nome_cliente:        ext.nome_cliente        || "",
      telefone_cliente:    ext.telefone_cliente    || "",
      cpf:                 ext.cpf                 || "",
      cnpj:                ext.cnpj                || "",
      email_cliente:       ext.email_cliente       || "",
      status:              "pendente",
      consultor_id:        ext.consultor_id        || "",
      consultor_nome:      ext.consultor_nome      || "",
      arquiteto_id:        ext.arquiteto_id        || "",
      arquiteto_nome:      ext.arquiteto_nome      || "",
      cliente_id:          ext.cliente_id          || "",
      descricao:           "",
      observacoes:         ext.observacoes         || "",
      observacoes_entrega: ext.observacoes_entrega || "",
      cep:                 ext.cep                 || "",
      rua:                 ext.rua                 || "",
      numero:              ext.numero              || "",
      complemento:         ext.complemento         || "",
      bairro:              ext.bairro              || "",
      cidade:              ext.cidade              || "",
      estado:              ext.estado              || "",
      subtotal:            ext.subtotal            ?? "",
      desconto:            ext.desconto            ?? "",
      total:               ext.total               ?? "",
      _endereco_completo:  ext.endereco_completo   || "",
    });
    setItens(ext.itens?.length ? ext.itens.map(it => {
      const { medidas, largura, altura, ...rest } = it;
      const dims = (largura != null || altura != null)
        ? { largura: largura ?? "", altura: altura ?? "" }
        : parseMedidas(medidas);
      return { ...itemVazio(), ...rest, ...dims };
    }) : [itemVazio()]);
    setPagamentos(ext.pagamentos?.length
      ? ext.pagamentos.map(pg => ({ ...pagVazio(), ...pg, vencimento: pg.vencimento || "" }))
      : [pagVazio()]);
    setEtapa("revisao");
    // Completa endereço via ViaCEP quando campos ficaram vazios após extração
    if (ext.cep && (!ext.rua || !ext.cidade)) preencherViaCep(ext.cep);
  }

  async function handleTexto() {
    if (!textoColar.trim()) return;
    setErro(""); setCarregando(true);
    try {
      const res = await api.post("/pedidos/importar-texto", { texto: textoColar });
      aplicarExtraido(res.extraido, "texto colado");
    } catch (e) {
      setErro(e.message || "Erro ao processar o texto.");
    } finally {
      setCarregando(false);
    }
  }

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function setItem(i, k, v) {
    setItens((prev) => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      if (k === "quantidade" || k === "preco_unitario") {
        const qtde  = parseFloat(String(k === "quantidade"    ? v : novo[i].quantidade).replace(",", "."))    || 0;
        const preco = parseFloat(String(k === "preco_unitario" ? v : novo[i].preco_unitario).replace(",", ".")) || 0;
        novo[i].valor = (qtde * preco).toFixed(2);
      }
      return novo;
    });
  }
  function addItem()      { setItens((p) => [...p, itemVazio()]); }
  function removeItem(i) {
    setItens((p) => p.filter((_, idx) => idx !== i));
  }

  function setPag(i, k, v) {
    setPagamentos((prev) => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      return novo;
    });
  }
  function addPag()      { setPagamentos((p) => [...p, pagVazio()]); }
  function removePag(i)  { setPagamentos((p) => p.filter((_, idx) => idx !== i)); }

  function confirmar() {
    const itensFinais = itens
      .filter((it) => it.descricao?.trim())
      .map((it) => {
        const { largura, altura, ...restIt } = it;
        const medidas = [largura, altura].filter(Boolean).join("x") || null;
        return {
          ...restIt,
          largura:      largura || null,
          altura:       altura  || null,
          medidas,
          categoria_id: it.categoria_id || null,
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
    onSalvar(dados, pdfOriginal);
  }

  return (
    <div className="modal-overlay pd-modal-overlay">
      <div className="modal-box pd-modal-grande">
        <div className="modal-header">
          <div>
            <h2>Importar Pedido</h2>
            <p>{etapa === "upload" ? "Cole o texto do edecoração e anexe o PDF original (opcional)" : "Revise os dados extraídos antes de salvar"}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body pd-modal-body-scroll">

          {/* ─── ETAPA 1: COLAR TEXTO ─── */}
          {etapa === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                  Abra o pedido no edecoração, pressione <strong>Ctrl+A</strong> para selecionar tudo,
                  depois <strong>Ctrl+C</strong> para copiar e cole aqui abaixo:
                </div>
                <textarea
                  rows={12}
                  placeholder={"Cole o conteúdo do PDF aqui...\n\nExemplo:\nPedido de Venda\n#00002372\n29/04/2026\n..."}
                  value={textoColar}
                  onChange={(e) => setTextoColar(e.target.value)}
                  style={{
                    width: "100%", fontFamily: "monospace", fontSize: 12,
                    padding: "10px 12px", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)", background: "var(--color-surface)",
                    color: "var(--color-text)", resize: "vertical", lineHeight: 1.5,
                  }}
                />
                <button
                  className="ek-btn ek-btn-primary"
                  onClick={handleTexto}
                  disabled={carregando || !textoColar.trim()}
                  style={{ alignSelf: "flex-end", minWidth: 140 }}
                >
                  {carregando ? "Processando..." : "Processar texto →"}
                </button>
              </div>

              {/* PDF original — opcional */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 6 }}>
                  PDF original (opcional) — será vinculado ao pedido após importar
                </div>
                <div
                  onClick={() => pdfRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f?.type === "application/pdf" && f.size <= 5 * 1024 * 1024) setPdfOriginal(f);
                  }}
                  style={{
                    border: "2px dashed var(--color-border)", borderRadius: "var(--radius-md)",
                    padding: "12px 16px", textAlign: "center", cursor: "pointer",
                    background: pdfOriginal ? "rgba(34,197,94,0.05)" : "var(--color-surface-soft)",
                    fontSize: 13, color: "var(--color-text-muted)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  {pdfOriginal ? (
                    <>
                      <span>📄</span>
                      <span style={{ flex: 1, textAlign: "left" }}>{pdfOriginal.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPdfOriginal(null); if (pdfRef.current) pdfRef.current.value = ""; }}
                        style={{ border: "none", background: "transparent", cursor: "pointer", color: "#ef4444", fontSize: 16, lineHeight: 1 }}
                      >×</button>
                    </>
                  ) : (
                    <span>📎 Arraste o PDF aqui ou clique para selecionar (máx 5 MB)</span>
                  )}
                </div>
                <input
                  ref={pdfRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f?.type === "application/pdf" && f.size <= 5 * 1024 * 1024) setPdfOriginal(f);
                  }}
                />
              </div>

              {erro && (
                <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: "var(--radius-md)", color: "#ef4444", fontSize: 13 }}>
                  ⚠ {erro}
                </div>
              )}
            </div>
          )}

          {/* ─── ETAPA 2: REVISÃO ─── */}
          {etapa === "revisao" && form && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Alerta de dados extraídos */}
              <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.1)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--color-text-secondary)", border: "1px solid rgba(59,130,246,0.2)" }}>
                📋 Dados extraídos de <strong>{fonteImport}</strong>. Revise e corrija antes de salvar.
              </div>

              {/* Número de origem */}
              <div className="ag-form-field" style={{ maxWidth: 200 }}>
                <label>Número de origem (edecoração)</label>
                <input
                  value={form.numero_origem}
                  onChange={(e) => set("numero_origem", e.target.value)}
                  placeholder="#00000000"
                  style={{ fontFamily: "monospace", fontWeight: 700 }}
                />
              </div>

              {/* Cliente — indicador se já existe ou será criado */}
              {form.cliente_id ? (
                <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.08)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--color-text-secondary)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  Cliente já cadastrado no sistema — dados serão atualizados se houver diferença.
                </div>
              ) : (
                <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--color-text-secondary)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  Cliente não encontrado — será criado automaticamente com os dados abaixo.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="ag-form-field">
                  <label>Nome do Cliente *</label>
                  <input
                    value={form.nome_cliente}
                    onChange={(e) => set("nome_cliente", e.target.value)}
                    placeholder="Nome completo do cliente"
                  />
                  {form.cliente_id && (
                    <span style={{ fontSize: 11, color: "var(--color-success, #22c55e)" }}>
                      Encontrado no sistema ✓ (ID #{form.cliente_id})
                    </span>
                  )}
                </div>
                <div className="ag-form-field">
                  <label>Telefone</label>
                  <input value={form.telefone_cliente} onChange={(e) => set("telefone_cliente", e.target.value)} placeholder="(11) 99999-9999" />
                </div>
              </div>

              {/* Dados principais */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 160px", gap: 12 }}>
                <div className="ag-form-field">
                  <label>CPF</label>
                  <input
                    value={form.cpf}
                    onChange={(e) => set("cpf", e.target.value)}
                    disabled={!!form.cnpj}
                    style={{ fontFamily: "monospace", opacity: form.cnpj ? 0.45 : 1 }}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div className="ag-form-field">
                  <label>CNPJ</label>
                  <input
                    value={form.cnpj}
                    onChange={(e) => set("cnpj", e.target.value)}
                    disabled={!!form.cpf}
                    style={{ fontFamily: "monospace", opacity: form.cpf ? 0.45 : 1 }}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div className="ag-form-field">
                  <label>E-mail</label>
                  <input value={form.email_cliente} onChange={(e) => set("email_cliente", e.target.value)} />
                </div>
                <div className="ag-form-field">
                  <label>Data do Pedido</label>
                  <input type="date" value={form.data_pedido} onChange={(e) => set("data_pedido", e.target.value)} />
                </div>
              </div>

              {/* Consultora e Arquiteto */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="ag-form-field">
                  <label>Consultora</label>
                  <input
                    readOnly
                    value={form.consultor_nome || "(não detectada)"}
                    style={{ color: form.consultor_nome ? "var(--color-text)" : "var(--color-text-muted)", fontStyle: form.consultor_nome ? "normal" : "italic" }}
                  />
                  {form.consultor_nome && (
                    <span style={{ fontSize: 11, color: form.consultor_id ? "var(--color-success, #22c55e)" : "var(--color-text-muted)" }}>
                      {form.consultor_id ? "Vinculada ao sistema ✓" : "Não encontrada no sistema"}
                    </span>
                  )}
                </div>
                <div className="ag-form-field">
                  <label>Arquiteto</label>
                  <input
                    readOnly
                    value={form.arquiteto_nome || "(não detectado)"}
                    style={{ color: form.arquiteto_nome ? "var(--color-text)" : "var(--color-text-muted)", fontStyle: form.arquiteto_nome ? "normal" : "italic" }}
                  />
                  {form.arquiteto_nome && (
                    <span style={{ fontSize: 11, color: form.arquiteto_id ? "var(--color-success, #22c55e)" : "var(--color-text-muted)" }}>
                      {form.arquiteto_id ? "Vinculado ao sistema ✓" : "Não encontrado no sistema"}
                    </span>
                  )}
                </div>
              </div>

              {/* Endereço de Entrega */}
              {(form._endereco_completo || form.cep || form.rua) && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 8 }}>
                    Endereço de Entrega
                  </div>
                  {form._endereco_completo && (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10, padding: "6px 10px", background: "var(--color-surface-soft)", borderRadius: "var(--radius-sm)", fontFamily: "monospace" }}>
                      {form._endereco_completo}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 120px", gap: 10, marginBottom: 10 }}>
                    <div className="ag-form-field">
                      <label>CEP</label>
                      <input
                        value={form.cep}
                        onChange={(e) => set("cep", e.target.value)}
                        onBlur={(e) => preencherViaCep(e.target.value)}
                        placeholder="00000-000"
                        style={{ fontFamily: "monospace" }}
                      />
                    </div>
                    <div className="ag-form-field">
                      <label>Rua / Logradouro</label>
                      <input value={form.rua} onChange={(e) => set("rua", e.target.value)} placeholder="Av. Exemplo" />
                    </div>
                    <div className="ag-form-field">
                      <label>Número</label>
                      <input value={form.numero} onChange={(e) => set("numero", e.target.value)} placeholder="123" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 10 }}>
                    <div className="ag-form-field">
                      <label>Complemento</label>
                      <input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} placeholder="apto 201" />
                    </div>
                    <div className="ag-form-field">
                      <label>Bairro</label>
                      <input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} placeholder="Centro" />
                    </div>
                    <div className="ag-form-field">
                      <label>Cidade</label>
                      <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Curitiba" />
                    </div>
                    <div className="ag-form-field">
                      <label>UF</label>
                      <input value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} placeholder="PR" maxLength={2} style={{ textTransform: "uppercase" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ITENS EXTRAÍDOS */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 8 }}>
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
                      <input type="number" min="0" step="0.01" value={it.quantidade || 1} onChange={(e) => setItem(i, "quantidade",     e.target.value)} />
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
                    <span>R$ {fmtMoeda(form.subtotal || 0)}</span>
                  </div>
                  <div className="pd-totais-row">
                    <span>Desconto</span>
                    <span>R$ {fmtMoeda(form.desconto || 0)}</span>
                  </div>
                  <div className="pd-totais-row total">
                    <span>Total</span>
                    <span>R$ {fmtMoeda(form.total || 0)}</span>
                  </div>
                </div>
              </div>

              {/* PAGAMENTOS */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 8 }}>
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

        <div className="modal-actions">
          {etapa === "revisao" && (
            <button className="ek-btn ek-btn-secondary" onClick={() => setEtapa("upload")} disabled={salvando}>
              ← Voltar
            </button>
          )}
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando || carregando}>
            Cancelar
          </button>
          {etapa === "revisao" && (
            <button className="ek-btn ek-btn-primary" onClick={confirmar} disabled={salvando}>
              {salvando ? "Salvando..." : "Confirmar importação"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
