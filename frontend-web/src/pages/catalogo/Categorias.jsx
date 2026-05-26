import { useState, useEffect } from "react";
import { FaPlus, FaEdit, FaTrash, FaTags } from "react-icons/fa";
import { api } from "../../services/api";
import ConfirmModal from "../../components/ConfirmModal";

const CORES_PREDEFINIDAS = [
  "#C9A96E", // gold (padrão)
  "#1E6BC4", // azul
  "#4CAF7D", // verde
  "#E07B54", // laranja
  "#9B59B6", // roxo
  "#E74C3C", // vermelho
  "#2E86AB", // azul petróleo
  "#6C757D", // cinza
];

const CATEGORIAS_PADRAO = [
  { nome: "Persianas",        cor: "#1E6BC4" },
  { nome: "Cortinas",         cor: "#9B59B6" },
  { nome: "Trilhos e Varões", cor: "#2E86AB" },
  { nome: "Tecidos",          cor: "#E07B54" },
  { nome: "Papel de Parede",  cor: "#4CAF7D" },
  { nome: "Tapetes",          cor: "#C9A96E" },
  { nome: "Serviços",         cor: "#6C757D" },
  { nome: "Acessórios",       cor: "#E74C3C" },
  { nome: "Outros",           cor: "#6C757D" },
];

/* ── Modal de criação/edição ── */
function CategoriaModal({ categoria, onClose, onSalvar, salvando }) {
  const [nome, setNome] = useState(categoria?.nome || "");
  const [cor, setCor]   = useState(categoria?.cor  || "#C9A96E");
  const [erro, setErro] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome.trim()) { setErro("Nome é obrigatório."); return; }
    setErro(null);
    onSalvar({ nome, cor });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">{categoria ? "Editar Categoria" : "Nova Categoria"}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="ag-form-field">
            <label>Nome *</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Persianas" autoFocus />
          </div>

          <div className="ag-form-field" style={{ marginTop: 12 }}>
            <label>Cor do badge</label>
            <div className="cat-cores-grid">
              {CORES_PREDEFINIDAS.map((c) => (
                <button key={c} type="button"
                  className={`cat-cor-btn${cor === c ? " cat-cor-ativa" : ""}`}
                  style={{ background: c }}
                  onClick={() => setCor(c)}
                  title={c}
                />
              ))}
            </div>
            <div className="cat-preview-badge" style={{ background: cor + "22", color: cor, borderColor: cor + "44" }}>
              {nome || "Prévia"}
            </div>
          </div>

          {erro && <p className="arq-form-erro">{erro}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : categoria ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Componente principal ── */
export default function Categorias({ onCategoriasChange }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null); // null | "novo" | objeto
  const [salvando, setSalvando]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [populando, setPopulando]   = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await api.get("/categorias");
      setCategorias(res.categorias || []);
      onCategoriasChange?.(res.categorias || []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line

  const handleSalvar = async (dados) => {
    setSalvando(true);
    try {
      if (modal === "novo") {
        const res = await api.post("/categorias", dados);
        setCategorias((prev) => [...prev, res.categoria]);
        onCategoriasChange?.([...categorias, res.categoria]);
      } else {
        const res = await api.put(`/categorias/${modal.id}`, dados);
        const atualizada = categorias.map((c) => c.id === res.categoria.id ? res.categoria : c);
        setCategorias(atualizada);
        onCategoriasChange?.(atualizada);
      }
      setModal(null);
    } catch (err) {
      alert(err.message || "Erro ao salvar categoria.");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    try {
      await api.delete(`/categorias/${confirmDelete.id}`);
      const atualizada = categorias.filter((c) => c.id !== confirmDelete.id);
      setCategorias(atualizada);
      onCategoriasChange?.(atualizada);
      setConfirmDelete(null);
    } catch (err) {
      alert(err.message || "Erro ao excluir.");
      setConfirmDelete(null);
    }
  };

  const handlePopularPadrao = async () => {
    setPopulando(true);
    try {
      for (const cat of CATEGORIAS_PADRAO) {
        try { await api.post("/categorias", cat); } catch { /* ignora duplicatas */ }
      }
      await carregar();
    } finally {
      setPopulando(false);
    }
  };

  return (
    <div className="cat-section">
      <div className="cat-header">
        <div>
          <h3 className="cat-title"><FaTags /> Categorias</h3>
          <p className="cat-sub">{categorias.length} categoria{categorias.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="cat-actions">
          {categorias.length === 0 && !loading && (
            <button className="btn-ghost" onClick={handlePopularPadrao} disabled={populando}>
              {populando ? "Criando…" : "Criar padrão"}
            </button>
          )}
          <button className="btn-primary" onClick={() => setModal("novo")}>
            <FaPlus /> Nova
          </button>
        </div>
      </div>

      {loading ? (
        <div className="cat-loading"><span className="arq-spinner" /></div>
      ) : categorias.length === 0 ? (
        <div className="cat-empty">
          <p>Nenhuma categoria criada.</p>
          <button className="btn-secondary" onClick={handlePopularPadrao} disabled={populando}>
            {populando ? "Criando…" : "Criar categorias padrão"}
          </button>
        </div>
      ) : (
        <div className="cat-lista">
          {categorias.map((cat) => (
            <div key={cat.id} className="cat-item">
              <span className="cat-badge" style={{ background: cat.cor + "22", color: cat.cor, borderColor: cat.cor + "44" }}>
                {cat.nome}
              </span>
              <div className="cat-item-actions">
                <button className="arq-btn-edit" title="Editar" onClick={() => setModal(cat)}>
                  <FaEdit />
                </button>
                <button className="arq-btn-del" title="Excluir" onClick={() => setConfirmDelete(cat)}>
                  <FaTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CategoriaModal
          categoria={modal === "novo" ? null : modal}
          onClose={() => setModal(null)}
          onSalvar={handleSalvar}
          salvando={salvando}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          open={!!confirmDelete}
          titulo="Excluir categoria"
          mensagem={`Deseja excluir "${confirmDelete.nome}"? Produtos vinculados perderão esta categoria.`}
          labelConfirm="Excluir"
          onConfirm={handleExcluir}
          onCancel={() => setConfirmDelete(null)}
          variante="danger"
        />
      )}
    </div>
  );
}
