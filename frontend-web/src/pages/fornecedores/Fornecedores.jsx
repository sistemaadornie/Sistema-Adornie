import { useState, useEffect, useCallback } from "react";
import { FaPlus, FaEdit, FaTrash, FaTruck } from "react-icons/fa";
import { api } from "../../services/api";
import ConfirmModal from "../../components/ConfirmModal";
import "./Fornecedores.css";

const PER_PAGE = 20;

const docLabel = (f) => {
  if (f.tipo === "PF") return f.cpf || "—";
  return f.cnpj || "—";
};

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [pagina, setPagina] = useState(1);

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativo");

  // Modal
  const [modal, setModal] = useState(null); // null | 'novo' | fornecedor
  const [salvando, setSalvando] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const carregar = useCallback(async (filtros = {}) => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (filtros.q)         params.set("q",         filtros.q);
      if (filtros.categoria) params.set("categoria",  filtros.categoria);
      if (filtros.tipo)      params.set("tipo",       filtros.tipo);
      if (filtros.status)    params.set("status",     filtros.status);
      const res = await api.get(`/fornecedores?${params}`);
      setFornecedores(res.fornecedores || []);
      setPagina(1);
    } catch {
      setErro("Falha ao carregar fornecedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get("/fornecedores/categorias")
      .then((r) => setCategorias(r.categorias || []))
      .catch(() => {});
    carregar({ status: "ativo" });
  }, [carregar]);

  const handleBuscar = () =>
    carregar({ q: busca, categoria: filtroCategoria, tipo: filtroTipo, status: filtroStatus });

  const handleLimpar = () => {
    setBusca("");
    setFiltroCategoria("");
    setFiltroTipo("");
    setFiltroStatus("ativo");
    carregar({ status: "ativo" });
  };

  const handleSalvar = async (dados) => {
    setSalvando(true);
    try {
      if (modal === "novo") {
        const res = await api.post("/fornecedores", dados);
        setFornecedores((prev) => [res.fornecedor, ...prev]);
      } else {
        const res = await api.put(`/fornecedores/${modal.id}`, dados);
        setFornecedores((prev) => prev.map((f) => (f.id === res.fornecedor.id ? res.fornecedor : f)));
      }
      setModal(null);
      // Atualiza lista de categorias se nova categoria foi criada
      api.get("/fornecedores/categorias").then((r) => setCategorias(r.categorias || [])).catch(() => {});
    } catch (e) {
      alert(e.message || "Erro ao salvar fornecedor.");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/fornecedores/${confirmDelete.id}`);
      setFornecedores((prev) => prev.filter((f) => f.id !== confirmDelete.id));
    } catch {
      alert("Erro ao excluir fornecedor.");
    } finally {
      setConfirmDelete(null);
    }
  };

  // Paginação
  const totalPaginas = Math.ceil(fornecedores.length / PER_PAGE) || 1;
  const paginaAtual = Math.min(pagina, totalPaginas);
  const slice = fornecedores.slice((paginaAtual - 1) * PER_PAGE, paginaAtual * PER_PAGE);

  return (
    <div className="ek-page">
      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <FaTruck style={{ color: "var(--color-primary)", fontSize: 20, marginBottom: 4 }} />
          <h1>Fornecedores</h1>
          <p>Gerencie o cadastro de fornecedores e parceiros comerciais</p>
        </div>
        <div className="ek-head-actions">
          <button className="ek-btn ek-btn-primary" onClick={() => setModal("novo")}>
            <FaPlus style={{ marginRight: 6 }} /> Novo Fornecedor
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="ek-toolbar" style={{ marginBottom: 16 }}>
        <div className="ek-toolbar-group" style={{ flex: 1 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Nome, CNPJ, CPF, e-mail ou contato..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
          />
        </div>
        <div className="ek-toolbar-group">
          <label>Categoria</label>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ek-toolbar-group">
          <label>Tipo</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="PJ">Pessoa Jurídica</option>
            <option value="PF">Pessoa Física</option>
          </select>
        </div>
        <div className="ek-toolbar-group">
          <label>Status</label>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <div className="ek-toolbar-group" style={{ alignSelf: "flex-end", flexDirection: "row", gap: 8 }}>
          <button className="ek-btn ek-btn-primary" onClick={handleBuscar}>Buscar</button>
          <button className="ek-btn ek-btn-secondary" onClick={handleLimpar}>Limpar</button>
        </div>
      </div>

      {/* BARRA DE AÇÕES */}
      <div className="forn-action-bar">
        <span className="forn-count">
          {loading ? "Carregando..." : `${fornecedores.length} fornecedor${fornecedores.length !== 1 ? "es" : ""} encontrado${fornecedores.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* ERRO */}
      {erro && (
        <div className="forn-erro-banner">
          <span>{erro}</span>
          <button onClick={handleBuscar}>Tentar novamente</button>
        </div>
      )}

      {/* TABELA */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className="forn-spinner" />
        </div>
      ) : (
        <div className="forn-table-wrap">
          <table className="ek-table forn-table">
            <thead>
              <tr>
                <th>Nome / Tipo</th>
                <th>CNPJ / CPF</th>
                <th>Contato</th>
                <th>Telefone</th>
                <th>Categoria</th>
                <th>Status</th>
                <th style={{ width: 72 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--color-text-muted)" }}>
                    Nenhum fornecedor encontrado.
                  </td>
                </tr>
              ) : (
                slice.map((f) => (
                  <tr key={f.id} className="forn-row" onClick={() => setModal(f)}>
                    <td>
                      <div className="forn-nome-cell">
                        <span style={{ fontWeight: 600 }}>{f.nome}</span>
                        <span className={`forn-tipo-badge ${f.tipo === "PF" ? "pf" : "pj"}`}>{f.tipo}</span>
                      </div>
                      {f.categoria && (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{f.categoria}</div>
                      )}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {docLabel(f)}
                    </td>
                    <td>
                      <div>{f.contato || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</div>
                      {f.email && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{f.email}</div>}
                    </td>
                    <td>{f.telefone || f.whatsapp || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td>
                    <td>{f.categoria || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td>
                    <td>
                      <span className={f.status === "ativo" ? "forn-status-ativo" : "forn-status-inativo"}>
                        {f.status === "ativo" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="forn-icon-btn"
                          title="Editar"
                          onClick={() => setModal(f)}
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="forn-icon-btn danger"
                          title="Excluir"
                          onClick={() => setConfirmDelete(f)}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINAÇÃO */}
      {totalPaginas > 1 && (
        <div className="forn-pagination">
          <button
            className="ek-btn ek-btn-secondary"
            disabled={paginaAtual <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="forn-page-info">{paginaAtual} / {totalPaginas}</span>
          <button
            className="ek-btn ek-btn-secondary"
            disabled={paginaAtual >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      {/* MODAL */}
      {modal && (
        <FornecedorModal
          fornecedor={modal === "novo" ? null : modal}
          categorias={categorias}
          onClose={() => setModal(null)}
          onSalvar={handleSalvar}
          salvando={salvando}
        />
      )}

      {/* CONFIRM DELETE */}
      <ConfirmModal
        open={confirmDelete !== null}
        titulo="Excluir Fornecedor"
        mensagem={`Tem certeza que deseja excluir "${confirmDelete?.nome}"? Esta ação não pode ser desfeita.`}
        labelConfirm="Excluir"
        variante="danger"
        onConfirm={handleExcluir}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ── MODAL CRUD ─────────────────────────────────────────────
function FornecedorModal({ fornecedor, categorias, onClose, onSalvar, salvando }) {
  const [form, setForm] = useState({
    nome:        fornecedor?.nome        || "",
    tipo:        fornecedor?.tipo        || "PJ",
    cnpj:        fornecedor?.cnpj        || "",
    cpf:         fornecedor?.cpf         || "",
    email:       fornecedor?.email       || "",
    telefone:    fornecedor?.telefone    || "",
    whatsapp:    fornecedor?.whatsapp    || "",
    contato:     fornecedor?.contato     || "",
    website:     fornecedor?.website     || "",
    categoria:   fornecedor?.categoria   || "",
    endereco:    fornecedor?.endereco    || "",
    numero:      fornecedor?.numero      || "",
    complemento: fornecedor?.complemento || "",
    bairro:      fornecedor?.bairro      || "",
    cidade:      fornecedor?.cidade      || "",
    estado:      fornecedor?.estado      || "",
    cep:         fornecedor?.cep         || "",
    observacoes: fornecedor?.observacoes || "",
    status:      fornecedor?.status      || "ativo",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const salvar = () => {
    if (!form.nome.trim()) return alert("Nome é obrigatório.");
    onSalvar({
      ...form,
      cnpj:    form.tipo === "PJ" ? form.cnpj  || null : null,
      cpf:     form.tipo === "PF" ? form.cpf   || null : null,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box forn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: "var(--font-title)", color: "var(--color-primary)" }}>
              {fornecedor ? "Editar Fornecedor" : "Novo Fornecedor"}
            </h2>
            <p>{fornecedor ? `Editando ${fornecedor.nome}` : "Cadastre um novo fornecedor ou parceiro"}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 4 }}>

          {/* SEÇÃO: Dados Principais */}
          <div className="forn-modal-section">Dados Principais</div>
          <div className="forn-grid-2">
            <div className="ag-form-field">
              <label>Nome *</label>
              <input
                type="text"
                placeholder="Razão Social ou Nome"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
              />
            </div>
            <div className="forn-grid-2" style={{ gap: 10 }}>
              <div className="ag-form-field">
                <label>Tipo</label>
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                  <option value="PJ">Pessoa Jurídica</option>
                  <option value="PF">Pessoa Física</option>
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
          </div>
          <div className="forn-grid-2">
            {form.tipo === "PJ" ? (
              <div className="ag-form-field">
                <label>CNPJ</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={form.cnpj}
                  onChange={(e) => set("cnpj", e.target.value)}
                />
              </div>
            ) : (
              <div className="ag-form-field">
                <label>CPF</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => set("cpf", e.target.value)}
                />
              </div>
            )}
            <div className="ag-form-field">
              <label>Categoria</label>
              <input
                type="text"
                list="forn-categorias-list"
                placeholder="Ex: Tecidos, Perfis, Motorização..."
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value)}
              />
              <datalist id="forn-categorias-list">
                {categorias.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {/* SEÇÃO: Contato */}
          <div className="forn-modal-section">Contato</div>
          <div className="forn-grid-3">
            <div className="ag-form-field">
              <label>Telefone</label>
              <input
                type="text"
                placeholder="(11) 99999-9999"
                value={form.telefone}
                onChange={(e) => set("telefone", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>WhatsApp</label>
              <input
                type="text"
                placeholder="(11) 99999-9999"
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>E-mail</label>
              <input
                type="email"
                placeholder="contato@empresa.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>
          <div className="forn-grid-2">
            <div className="ag-form-field">
              <label>Pessoa de Contato</label>
              <input
                type="text"
                placeholder="Nome do responsável"
                value={form.contato}
                onChange={(e) => set("contato", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>Website</label>
              <input
                type="text"
                placeholder="www.empresa.com.br"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
              />
            </div>
          </div>

          {/* SEÇÃO: Endereço */}
          <div className="forn-modal-section">Endereço</div>
          <div className="forn-grid-4">
            <div className="ag-form-field">
              <label>Rua / Logradouro</label>
              <input
                type="text"
                placeholder="Rua, Av., Alameda..."
                value={form.endereco}
                onChange={(e) => set("endereco", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>Número</label>
              <input
                type="text"
                placeholder="123"
                value={form.numero}
                onChange={(e) => set("numero", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>Complemento</label>
              <input
                type="text"
                placeholder="Sala, Apto..."
                value={form.complemento}
                onChange={(e) => set("complemento", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>CEP</label>
              <input
                type="text"
                placeholder="00000-000"
                value={form.cep}
                onChange={(e) => set("cep", e.target.value)}
              />
            </div>
          </div>
          <div className="forn-grid-3">
            <div className="ag-form-field">
              <label>Bairro</label>
              <input
                type="text"
                placeholder="Bairro"
                value={form.bairro}
                onChange={(e) => set("bairro", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>Cidade</label>
              <input
                type="text"
                placeholder="Cidade"
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
              />
            </div>
            <div className="ag-form-field">
              <label>Estado (UF)</label>
              <select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                <option value="">—</option>
                {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
          </div>

          {/* SEÇÃO: Observações */}
          <div className="forn-modal-section">Observações</div>
          <div className="ag-form-field">
            <textarea
              rows={3}
              placeholder="Notas internas, condições de pagamento, prazo de entrega..."
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              style={{
                background: "var(--color-surface-soft)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text)",
                fontSize: 14,
                padding: "8px 12px",
                width: "100%",
                fontFamily: "var(--font-body)",
                resize: "vertical",
              }}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : fornecedor ? "Salvar Alterações" : "Cadastrar Fornecedor"}
          </button>
        </div>
      </div>
    </div>
  );
}
