import { useState, useEffect, useCallback, useMemo } from "react";
import { FaTags, FaBoxOpen } from "react-icons/fa";
import { api } from "../../services/api";
import ConfirmModal from "../../components/ConfirmModal";
import Categorias from "./Categorias";
import ImportarDePedidosModal from "./ImportarDePedidosModal";
import "./Produtos.css";

/* ── helpers ── */
function fmtMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function fmtData(s) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

const UNIDADES = ["un", "m", "m²", "m³", "kg", "g", "L", "ml", "cx", "pc", "par", "rolo", "h"];

/* ══════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════ */
export default function Produtos() {
  const [produtos,    setProdutos]    = useState([]);
  const [marcas,      setMarcas]      = useState([]);
  const [categorias,  setCategorias]  = useState([]); // [{id, nome, cor}]
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState(null);
  const [aba,         setAba]         = useState("produtos"); // "produtos" | "categorias"

  /* filtros */
  const [busca,         setBusca]         = useState("");
  const [filTipo,       setFilTipo]       = useState("");
  const [filStatus,     setFilStatus]     = useState("ativo");
  const [filMarca,      setFilMarca]      = useState("");
  const [filCategoriaId,setFilCategoriaId]= useState("");
  const [filEstoque,    setFilEstoque]    = useState("");
  const [filDataIni,    setFilDataIni]    = useState("");
  const [filDataFim,    setFilDataFim]    = useState("");

  /* paginação */
  const [porPagina,   setPorPagina]   = useState(10);
  const [pagina,      setPagina]      = useState(1);

  /* modal + confirm */
  const [modal,         setModal]         = useState(null);
  const [confirm,       setConfirm]       = useState(null);
  const [salvando,      setSalvando]      = useState(false);
  const [toast,         setToast]         = useState({ texto: "", tipo: "" });
  const [modalImportar, setModalImportar] = useState(false);

  function mostrarToast(texto, tipo = "success") {
    setToast({ texto, tipo });
    setTimeout(() => setToast({ texto: "", tipo: "" }), 3500);
  }

  /* ── carregamento ── */
  const carregar = useCallback(async (filtros = {}) => {
    try {
      setErro(null);
      const params = new URLSearchParams();
      if (filtros.q)           params.set("q",           filtros.q);
      if (filtros.tipo)        params.set("tipo",        filtros.tipo);
      if (filtros.status)      params.set("status",      filtros.status);
      if (filtros.marca)       params.set("marca",       filtros.marca);
      if (filtros.categoria_id)params.set("categoria_id",filtros.categoria_id);
      if (filtros.estoque)     params.set("estoque",     filtros.estoque);
      if (filtros.dataInicio)  params.set("dataInicio",  filtros.dataInicio);
      if (filtros.dataFim)     params.set("dataFim",     filtros.dataFim);
      const qs = params.toString();
      const res = await api.get(`/produtos${qs ? `?${qs}` : ""}`);
      setProdutos(res.produtos || []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarFiltros = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        api.get("/produtos/marcas"),
        api.get("/categorias"),
      ]);
      setMarcas(m.marcas || []);
      setCategorias(c.categorias || []);
    } catch { /* ignora */ }
  }, []);

  useEffect(() => {
    carregar({ status: "ativo" });
    carregarFiltros();
  }, [carregar, carregarFiltros]);

  /* ── busca ── */
  function filtrosAtivos() {
    return {
      q: busca, tipo: filTipo, status: filStatus,
      marca: filMarca, categoria_id: filCategoriaId,
      estoque: filEstoque, dataInicio: filDataIni, dataFim: filDataFim,
    };
  }

  function handleBuscar() {
    setPagina(1);
    carregar(filtrosAtivos());
  }

  function handleLimpar() {
    setBusca(""); setFilTipo(""); setFilStatus("ativo");
    setFilMarca(""); setFilCategoriaId(""); setFilEstoque("");
    setFilDataIni(""); setFilDataFim("");
    setPagina(1);
    carregar({ status: "ativo" });
  }

  /* ── CRUD ── */
  async function handleSalvar(dados) {
    setSalvando(true);
    try {
      if (modal === "novo") {
        await api.post("/produtos", dados);
        mostrarToast("Produto criado com sucesso!");
      } else {
        await api.put(`/produtos/${modal.id}`, dados);
        mostrarToast("Produto atualizado!");
      }
      setModal(null);
      carregarFiltros();
      carregar(filtrosAtivos());
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    const id = confirm;
    setConfirm(null);
    try {
      await api.delete(`/produtos/${id}`);
      mostrarToast("Produto removido.");
      carregar(filtrosAtivos());
    } catch (e) {
      mostrarToast(e.message || "Erro ao remover.", "error");
    }
  }

  /* ── paginação ── */
  const totalPaginas = Math.max(1, Math.ceil(produtos.length / porPagina));
  const paginaAtual  = Math.min(pagina, totalPaginas);
  const slice        = useMemo(() => {
    const ini = (paginaAtual - 1) * porPagina;
    return produtos.slice(ini, ini + porPagina);
  }, [produtos, paginaAtual, porPagina]);

  /* ── render ── */
  return (
    <div className="ek-page">

      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Catálogo</h1>
          <p>Produtos, serviços e categorias da empresa</p>
        </div>
        <div className="ek-head-actions">
          <button
            className="btn-secondary"
            onClick={() => setModalImportar(true)}
            title="Importar produtos dos pedidos"
          >
            <FaBoxOpen /> Importar de Pedidos
          </button>
          <button className="btn-secondary" onClick={() => setAba(aba === "categorias" ? "produtos" : "categorias")}>
            <FaTags /> Categorias
          </button>
          {aba === "produtos" && (
            <button className="btn-primary" onClick={() => setModal("novo")}>
              + Novo Produto
            </button>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="prod-tabs">
        <button
          className={`prod-tab${aba === "produtos" ? " prod-tab-ativo" : ""}`}
          onClick={() => setAba("produtos")}
        >
          Produtos / Serviços
          <span className="prod-tab-count">{produtos.length}</span>
        </button>
        <button
          className={`prod-tab${aba === "categorias" ? " prod-tab-ativo" : ""}`}
          onClick={() => setAba("categorias")}
        >
          Categorias
          <span className="prod-tab-count">{categorias.length}</span>
        </button>
      </div>

      {/* ── ABA CATEGORIAS ── */}
      {aba === "categorias" && (
        <div className="ek-section">
          <Categorias onCategoriasChange={setCategorias} />
        </div>
      )}

      {/* ── ABA PRODUTOS ── */}
      {aba === "produtos" && (
        <>
          {/* TOOLBAR */}
          <div className="ek-toolbar prod-toolbar" style={{ marginBottom: 20 }}>
            <div className="ek-toolbar-group" style={{ flex: 2, minWidth: 180 }}>
              <label>Buscar</label>
              <input
                type="text"
                placeholder="Nome, código, referência ou marca..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              />
            </div>

            <div className="ek-toolbar-group">
              <label>Estoque</label>
              <select value={filEstoque} onChange={(e) => setFilEstoque(e.target.value)}>
                <option value="">Todos</option>
                <option value="com">Com estoque</option>
                <option value="sem">Sem estoque</option>
              </select>
            </div>

            <div className="ek-toolbar-group" style={{ minWidth: 140 }}>
              <label>Marca</label>
              <select value={filMarca} onChange={(e) => setFilMarca(e.target.value)}>
                <option value="">Selecione</option>
                {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="ek-toolbar-group" style={{ minWidth: 140 }}>
              <label>Categoria</label>
              <select value={filCategoriaId} onChange={(e) => setFilCategoriaId(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>

            <div className="ek-toolbar-group">
              <label>Tipo</label>
              <select value={filTipo} onChange={(e) => setFilTipo(e.target.value)}>
                <option value="">Selecione</option>
                <option value="produto">Produto</option>
                <option value="servico">Serviço</option>
              </select>
            </div>

            <div className="ek-toolbar-group">
              <label>Status</label>
              <select value={filStatus} onChange={(e) => setFilStatus(e.target.value)}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>

            <div className="ek-toolbar-group">
              <label>Data Inicial</label>
              <input type="date" value={filDataIni} onChange={(e) => setFilDataIni(e.target.value)} />
            </div>

            <div className="ek-toolbar-group">
              <label>Data Final</label>
              <input type="date" value={filDataFim} onChange={(e) => setFilDataFim(e.target.value)} />
            </div>

            <div className="ek-toolbar-group" style={{ alignSelf: "flex-end", flexDirection: "row", gap: 8 }}>
              <button className="ek-btn ek-btn-primary" onClick={handleBuscar}>Buscar</button>
              <button className="ek-btn ek-btn-secondary" onClick={handleLimpar} title="Limpar filtros">✕</button>
            </div>
          </div>

          {/* BARRA DE AÇÕES */}
          <div className="prod-action-bar">
            <button className="ek-btn ek-btn-primary ek-btn-sm" onClick={() => setModal("novo")}>
              ＋ Novo
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="prod-count">{produtos.length} item{produtos.length !== 1 ? "s" : ""}</span>
              <select
                className="prod-per-page"
                value={porPagina}
                onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} por página</option>
                ))}
              </select>
            </div>
          </div>

          {/* LOADING */}
          {loading && (
            <div className="ek-empty" style={{ padding: 60 }}>
              <div className="prod-spinner" />
              <p style={{ color: "var(--color-text-muted)", marginTop: 14 }}>Carregando produtos...</p>
            </div>
          )}

          {/* ERRO */}
          {!loading && erro && (
            <div className="prod-erro-banner">
              <span>⚠ {erro}</span>
              <button onClick={() => carregar(filtrosAtivos())}>Tentar novamente</button>
            </div>
          )}

          {/* TABELA */}
          {!loading && !erro && (
            <>
              <div className="prod-table-wrap">
                <table className="ek-table prod-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Referência</th>
                      <th>Tipo</th>
                      <th>Nome</th>
                      <th>Categoria</th>
                      <th style={{ textAlign: "right" }}>Preço de Venda</th>
                      <th style={{ textAlign: "right" }}>Estoque</th>
                      <th>Status</th>
                      <th>Atualizado</th>
                      <th style={{ width: 48 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice.length === 0 && (
                      <tr>
                        <td colSpan={10}>
                          <div className="ek-empty" style={{ padding: 40 }}>
                            <div className="ek-empty-icon">📦</div>
                            <p style={{ color: "var(--color-text-muted)" }}>
                              Nenhum produto encontrado.
                            </p>
                            <button
                              className="ek-btn ek-btn-primary"
                              style={{ marginTop: 12, fontSize: 12 }}
                              onClick={() => setModal("novo")}
                            >
                              + Cadastrar primeiro produto
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {slice.map((p) => (
                      <tr key={p.id} className="prod-row" onClick={() => setModal(p)}>
                        <td className="prod-codigo">{p.codigo || "—"}</td>
                        <td style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{p.referencia || "—"}</td>
                        <td>
                          <span className={`prod-tipo-badge ${p.tipo}`}>
                            {p.tipo === "servico" ? "Serviço" : "Produto"}
                          </span>
                        </td>
                        <td className="prod-nome">
                          {p.foto_url && (
                            <img src={p.foto_url} alt="" className="prod-thumb" onError={(e) => { e.target.style.display = "none"; }} />
                          )}
                          <div>
                            <div>{p.nome}</div>
                            {p.marca && <div className="prod-sub">{p.marca}</div>}
                          </div>
                        </td>
                        <td>
                          {p.categoria_nome ? (
                            <span className="prod-cat-badge"
                              style={{ background: (p.categoria_cor || "#C9A96E") + "22", color: p.categoria_cor || "#C9A96E", borderColor: (p.categoria_cor || "#C9A96E") + "44" }}>
                              {p.categoria_nome}
                            </span>
                          ) : p.categoria ? (
                            <span className="prod-cat-badge prod-cat-sem-cor">{p.categoria}</span>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoeda(p.preco_venda)}</td>
                        <td style={{ textAlign: "right" }}>
                          <span className={p.estoque > 0 ? "prod-estoque-ok" : "prod-estoque-zero"}>
                            {fmtNum(p.estoque)} {p.unidade}
                          </span>
                        </td>
                        <td>
                          <span className={`ek-badge ${p.status === "ativo" ? "success" : "danger"}`}>
                            {p.status === "ativo" ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{fmtData(p.updated_at)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="prod-icon-btn" title="Editar" onClick={() => setModal(p)}>✏</button>
                            <button className="prod-icon-btn danger" title="Excluir" onClick={() => setConfirm(p.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PAGINAÇÃO */}
              {totalPaginas > 1 && (
                <div className="prod-pagination">
                  <button
                    className="ek-btn ek-btn-secondary ek-btn-sm"
                    disabled={paginaAtual === 1}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    ‹ Anterior
                  </button>
                  <span className="prod-page-info">{paginaAtual} / {totalPaginas}</span>
                  <button
                    className="ek-btn ek-btn-secondary ek-btn-sm"
                    disabled={paginaAtual === totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima ›
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* CONFIRM EXCLUIR */}
      <ConfirmModal
        open={confirm !== null}
        titulo="Excluir produto"
        mensagem="Esta ação não pode ser desfeita. Deseja realmente excluir este produto?"
        labelConfirm="Excluir"
        variante="danger"
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirm(null)}
      />

      {/* TOAST */}
      {toast.texto && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 9999,
          padding: "12px 18px", borderRadius: "var(--radius-md)",
          background: "var(--color-surface-strong)", border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-medium)", fontSize: 13, fontWeight: 500,
          color: "var(--color-text)", maxWidth: 360,
          borderLeft: `3px solid ${toast.tipo === "error" ? "#ef4444" : "#22c55e"}`,
        }}>
          {toast.texto}
        </div>
      )}

      {/* MODAL NOVO / EDITAR */}
      {modal && (
        <ProdutoModal
          produto={modal === "novo" ? null : modal}
          marcasSugeridas={marcas}
          categorias={categorias}
          onClose={() => setModal(null)}
          onSalvar={handleSalvar}
          salvando={salvando}
        />
      )}

      {/* MODAL IMPORTAR DE PEDIDOS */}
      {modalImportar && (
        <ImportarDePedidosModal
          categorias={categorias}
          onClose={() => setModalImportar(false)}
          onImportado={() => {
            carregar(filtrosAtivos());
            carregarFiltros();
          }}
        />
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════
   MODAL NOVO / EDITAR PRODUTO
══════════════════════════════════════════════ */
function ProdutoModal({ produto, marcasSugeridas, categorias, onClose, onSalvar, salvando }) {
  const [form, setForm] = useState({
    tipo:        produto?.tipo        ?? "produto",
    nome:        produto?.nome        ?? "",
    referencia:  produto?.referencia  ?? "",
    marca:       produto?.marca       ?? "",
    categoria_id: produto?.categoria_id ?? "",
    descricao:   produto?.descricao   ?? "",
    unidade:     produto?.unidade     ?? "un",
    preco_custo: produto?.preco_custo ?? "",
    preco_venda: produto?.preco_venda ?? "",
    estoque:     produto?.estoque     ?? "",
    status:      produto?.status      ?? "ativo",
    foto_url:    produto?.foto_url    ?? "",
  });
  const [erro, setErro] = useState("");

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); if (erro) setErro(""); }

  function salvar() {
    if (!form.nome.trim()) { setErro("Nome é obrigatório."); return; }
    onSalvar({
      ...form,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      preco_custo:  form.preco_custo === "" ? 0 : Number(String(form.preco_custo).replace(",", ".")),
      preco_venda:  form.preco_venda === "" ? 0 : Number(String(form.preco_venda).replace(",", ".")),
      estoque:      form.estoque     === "" ? 0 : Number(String(form.estoque).replace(",", ".")),
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box prod-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div>
            <h2>{produto ? "Editar produto / serviço" : "Novo produto / serviço"}</h2>
            <p>{produto ? `Código: ${produto.codigo}` : "Preencha os dados do item"}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">

          {/* Tipo + Status */}
          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
            <div className="ag-form-field">
              <label>Tipo *</label>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                <option value="produto">Produto</option>
                <option value="servico">Serviço</option>
              </select>
            </div>
            <div className="ag-form-field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          {/* Nome */}
          <div className="ag-form-field" style={{ marginBottom: 14 }}>
            <label>Nome *</label>
            <input
              placeholder="Nome do produto ou serviço"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              style={erro ? { borderColor: "#ef4444" } : undefined}
            />
            {erro && <span style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{erro}</span>}
          </div>

          {/* Referência + Marca + Categoria */}
          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 14 }}>
            <div className="ag-form-field">
              <label>Referência</label>
              <input placeholder="Ref. externa" value={form.referencia} onChange={(e) => set("referencia", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Marca</label>
              <input
                list="prod-marcas-list"
                placeholder="Marca do produto"
                value={form.marca}
                onChange={(e) => set("marca", e.target.value)}
              />
              <datalist id="prod-marcas-list">
                {marcasSugeridas.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="ag-form-field">
              <label>Categoria</label>
              <select value={form.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Preços + Estoque + Unidade */}
          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 100px", marginBottom: 14 }}>
            <div className="ag-form-field">
              <label>Preço de Custo (R$)</label>
              <input type="number" min="0" step="0.01" placeholder="0,00"
                value={form.preco_custo} onChange={(e) => set("preco_custo", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Preço de Venda (R$)</label>
              <input type="number" min="0" step="0.01" placeholder="0,00"
                value={form.preco_venda} onChange={(e) => set("preco_venda", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Estoque</label>
              <input type="number" min="0" step="0.001" placeholder="0"
                value={form.estoque} onChange={(e) => set("estoque", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Unidade</label>
              <select value={form.unidade} onChange={(e) => set("unidade", e.target.value)}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Descrição */}
          <div className="ag-form-field" style={{ marginBottom: 14 }}>
            <label>Descrição</label>
            <textarea rows={3} placeholder="Descrição do produto ou serviço..."
              value={form.descricao} onChange={(e) => set("descricao", e.target.value)}
              style={{ resize: "vertical" }} />
          </div>

          {/* Foto URL */}
          <div className="ag-form-field">
            <label>URL da foto (opcional)</label>
            <input type="url" placeholder="https://..."
              value={form.foto_url} onChange={(e) => set("foto_url", e.target.value)} />
          </div>

        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : produto ? "Salvar alterações" : "Criar produto"}
          </button>
        </div>

      </div>
    </div>
  );
}
