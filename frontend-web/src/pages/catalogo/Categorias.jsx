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
function CategoriaModal({ categoria, prazos, onClose, onSalvar, salvando }) {
  const [nome, setNome] = useState(categoria?.nome || "");
  const [cor, setCor]   = useState(categoria?.cor  || "#C9A96E");
  const [vinculavel, setVinculavel] = useState(categoria?.vinculavel ?? false);
  const [recebeVinculos, setRecebeVinculos] = useState(categoria?.recebe_vinculos ?? false);
  const [erro, setErro] = useState(null);
  const [logistica, setLogistica] = useState(prazos?.logistica_interna_dias ?? 2);
  const [confeccao, setConfeccao] = useState(prazos?.confeccao_dias ?? 10);
  const [expedicao, setExpedicao] = useState(prazos?.expedicao_dias ?? 3);
  const [outros,    setOutros]    = useState(prazos?.outros_dias ?? 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome.trim()) { setErro("Nome é obrigatório."); return; }
    setErro(null);
    onSalvar({ nome, cor, vinculavel, recebe_vinculos: recebeVinculos, prazos: {
      logistica_interna_dias: Number(logistica) || 0,
      confeccao_dias: Number(confeccao) || 0,
      expedicao_dias: Number(expedicao) || 0,
      outros_dias: Number(outros) || 0,
    }});
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

          <div className="ag-form-field" style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={vinculavel} onChange={(e) => setVinculavel(e.target.checked)} />
              Item vinculável?
            </label>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0 24px" }}>
              Itens desta categoria podem ser vinculados a um item principal (ex: Trilho → Cortina).
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 8 }}>
              <input type="checkbox" checked={recebeVinculos} onChange={(e) => setRecebeVinculos(e.target.checked)} />
              Deve receber itens vinculados?
            </label>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0 0 24px" }}>
              Itens desta categoria podem ser "principais" e receber outros itens vinculados a eles.
            </p>
          </div>

          {categoria?.id && (
            <div className="ag-form-field" style={{ marginTop: 12 }}>
              <label>Prazos de instalação (dias úteis)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 12 }}>Logística<input type="number" min="0" value={logistica} onChange={(e) => setLogistica(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Confecção<input type="number" min="0" value={confeccao} onChange={(e) => setConfeccao(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Expedição<input type="number" min="0" value={expedicao} onChange={(e) => setExpedicao(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Outros<input type="number" min="0" value={outros} onChange={(e) => setOutros(e.target.value)} /></label>
              </div>
            </div>
          )}

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
  const [prazosPorCat, setPrazosPorCat] = useState({});

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

  const carregarPrazos = async () => {
    try {
      const res = await api.get("/pedidos/config/prazos");
      const mapa = {};
      (res.prazos || []).forEach((p) => { mapa[p.categoria_id] = p; });
      setPrazosPorCat(mapa);
    } catch { /* silencioso */ }
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line
  useEffect(() => { carregarPrazos(); }, []); // eslint-disable-line

  const handleSalvar = async (dados) => {
    setSalvando(true);
    try {
      if (modal === "novo") {
        const res = await api.post("/categorias", { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos });
        setCategorias((prev) => [...prev, res.categoria]);
        onCategoriasChange?.([...categorias, res.categoria]);
      } else {
        const res = await api.put(`/categorias/${modal.id}`, { nome: dados.nome, cor: dados.cor, vinculavel: dados.vinculavel, recebe_vinculos: dados.recebe_vinculos });
        const atualizada = categorias.map((c) => c.id === res.categoria.id ? res.categoria : c);
        setCategorias(atualizada);
        onCategoriasChange?.(atualizada);
        if (dados.prazos) {
          await api.put("/pedidos/config/prazos", { prazos: [{ categoria_id: modal.id, ...dados.prazos }] });
          await carregarPrazos();
        }
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
          prazos={modal && modal !== "novo" ? prazosPorCat[modal.id] : null}
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
