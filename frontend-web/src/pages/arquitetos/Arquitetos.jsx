import { useState, useEffect, useCallback, useMemo } from "react";
import { FaPlus, FaEdit, FaTrash, FaDraftingCompass, FaSort, FaSortUp, FaSortDown, FaFileImport } from "react-icons/fa";
import { api } from "../../services/api";
import ConfirmModal from "../../components/ConfirmModal";
import ImportarArquitetosModal from "./ImportarArquitetosModal";
import "./Arquitetos.css";

const FORM_VAZIO = { nome: "", tipo_pessoa: "PF", cpf_cnpj: "", telefone: "", outro_telefone: "", email: "", escritorio: "", cau: "", observacoes: "", consultor_id: "" };

/* ── Máscaras de input ── */
function mascaraCpfCnpj(val) {
  const d = val.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3}\.\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
    .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d{1,2})$/, "$1-$2");
}

function mascaraTelefone(val) {
  const d = val.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : "";
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/* ── Cabeçalho ordenável ── */
function Th({ label, campo, sort, onSort }) {
  const ativo = sort.campo === campo;
  const Icon = ativo ? (sort.dir === "asc" ? FaSortUp : FaSortDown) : FaSort;
  return (
    <th className={`arq-th${ativo ? " arq-th-ativo" : ""}`} onClick={() => onSort(campo)}>
      <span>{label}</span>
      <Icon className="arq-sort-icon" />
    </th>
  );
}

/* ── Modal de cadastro/edição ── */
function ArquitetoModal({ arquiteto, consultores, onClose, onSalvar, salvando }) {
  const [form, setForm] = useState(
    arquiteto
      ? {
          nome:           arquiteto.nome           || "",
          tipo_pessoa:    arquiteto.tipo_pessoa     || "PF",
          cpf_cnpj:       arquiteto.cpf_cnpj        || "",
          telefone:       arquiteto.telefone        || "",
          outro_telefone: arquiteto.outro_telefone  || "",
          email:          arquiteto.email           || "",
          escritorio:     arquiteto.escritorio      || "",
          cau:            arquiteto.cau             || "",
          observacoes:    arquiteto.observacoes     || "",
          consultor_id:   arquiteto.consultor_id    || "",
        }
      : FORM_VAZIO
  );
  const [erro, setErro] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Nome é obrigatório."); return; }
    setErro(null);
    onSalvar(form);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box arq-modal">
        <div className="modal-header">
          <h2 className="modal-title">{arquiteto ? "Editar Arquiteto" : "Novo Arquiteto"}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="arq-form-grid">
            {/* Tipo de Pessoa */}
            <div className="ag-form-field arq-span-full">
              <label>Tipo de Pessoa</label>
              <div className="arq-tipo-toggle">
                <button type="button"
                  className={`arq-tipo-btn${form.tipo_pessoa === "PF" ? " arq-tipo-ativo" : ""}`}
                  onClick={() => set("tipo_pessoa", "PF")}>PF — Pessoa Física</button>
                <button type="button"
                  className={`arq-tipo-btn${form.tipo_pessoa === "PJ" ? " arq-tipo-ativo" : ""}`}
                  onClick={() => set("tipo_pessoa", "PJ")}>PJ — Pessoa Jurídica</button>
              </div>
            </div>

            {/* Nome */}
            <div className="ag-form-field arq-span-full">
              <label>Nome / Razão Social *</label>
              <input value={form.nome} onChange={(e) => set("nome", e.target.value)}
                placeholder="Nome completo ou razão social" autoFocus />
            </div>

            {/* CPF / CNPJ */}
            <div className="ag-form-field">
              <label>{form.tipo_pessoa === "PJ" ? "CNPJ" : "CPF"}</label>
              <input
                value={form.cpf_cnpj}
                onChange={(e) => {
                  const masked = mascaraCpfCnpj(e.target.value);
                  const digits = masked.replace(/\D/g, "");
                  const updates = { cpf_cnpj: masked };
                  if (digits.length <= 11) updates.tipo_pessoa = "PF";
                  else if (digits.length >= 12) updates.tipo_pessoa = "PJ";
                  setForm((f) => ({ ...f, ...updates }));
                }}
                placeholder={form.tipo_pessoa === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"}
                maxLength={18}
              />
            </div>

            {/* CAU / CREA */}
            <div className="ag-form-field">
              <label>CAU / CREA</label>
              <input value={form.cau}
                onChange={(e) => set("cau", e.target.value.toUpperCase().slice(0, 20))}
                placeholder="A123456-7"
                maxLength={20}
              />
            </div>

            {/* Telefone Principal */}
            <div className="ag-form-field">
              <label>Telefone Principal</label>
              <input value={form.telefone}
                onChange={(e) => set("telefone", mascaraTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={15}
              />
            </div>

            {/* Outro Telefone */}
            <div className="ag-form-field">
              <label>Outro Telefone</label>
              <input value={form.outro_telefone}
                onChange={(e) => set("outro_telefone", mascaraTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={15}
              />
            </div>

            {/* E-mail */}
            <div className="ag-form-field">
              <label>E-mail</label>
              <input type="email" value={form.email}
                onChange={(e) => set("email", e.target.value.slice(0, 120))}
                placeholder="email@escritorio.com"
                maxLength={120}
              />
            </div>

            {/* Escritório */}
            <div className="ag-form-field">
              <label>Escritório / Empresa</label>
              <input value={form.escritorio} onChange={(e) => set("escritorio", e.target.value)}
                placeholder="Nome do escritório" />
            </div>

            {/* Consultor responsável */}
            <div className="ag-form-field">
              <label>Consultor Responsável</label>
              <select value={form.consultor_id} onChange={(e) => set("consultor_id", e.target.value)}>
                <option value="">— Sem consultor —</option>
                {consultores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome_completo}</option>
                ))}
              </select>
            </div>

            {/* Observações */}
            <div className="ag-form-field arq-span-full">
              <label>Observações</label>
              <textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)}
                rows={3} placeholder="Informações adicionais…" />
            </div>
          </div>

          {erro && <p className="arq-form-erro">{erro}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : arquiteto ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const POR_PAGINA_OPCOES = [10, 25, 50];

/* ── Componente principal ── */
export default function Arquitetos() {
  const [arquitetos, setArquitetos] = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState(null);
  const [busca, setBusca]           = useState("");
  const [modal, setModal]           = useState(null);
  const [salvando, setSalvando]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [sort, setSort]             = useState({ campo: "nome", dir: "asc" });
  const [modalImportar, setModalImportar] = useState(false);
  const [pagina, setPagina]         = useState(1);
  const [porPagina, setPorPagina]   = useState(10);

  const carregar = useCallback(async (q = "") => {
    setLoading(true);
    setErro(null);
    try {
      const res = await api.get(`/arquitetos${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setArquitetos(res.arquitetos || []);
    } catch {
      setErro("Falha ao carregar arquitetos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.get("/auth/admin/usuarios")
      .then((r) => setConsultores((r.usuarios || []).filter((u) => u.status === "aprovado")))
      .catch(() => {});
  }, []);

  const handleSalvar = async (dados) => {
    setSalvando(true);
    try {
      if (modal === "novo") {
        const res = await api.post("/arquitetos", dados);
        setArquitetos((prev) => [res.arquiteto, ...prev]);
      } else {
        const res = await api.put(`/arquitetos/${modal.id}`, dados);
        setArquitetos((prev) => prev.map((a) => (a.id === res.arquiteto.id ? res.arquiteto : a)));
      }
      setModal(null);
    } catch (err) {
      alert(err.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    try {
      await api.delete(`/arquitetos/${confirmDelete.id}`);
      setArquitetos((prev) => prev.filter((a) => a.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      alert(err.message || "Erro ao excluir.");
    }
  };

  const handleSort = (campo) => {
    setPagina(1);
    setSort((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { campo, dir: "asc" }
    );
  };

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    let arr = arquitetos.filter(
      (a) =>
        !busca ||
        a.nome.toLowerCase().includes(q) ||
        (a.escritorio || "").toLowerCase().includes(q) ||
        (a.telefone || "").includes(busca) ||
        (a.outro_telefone || "").includes(busca) ||
        (a.cpf_cnpj || "").includes(busca) ||
        (a.email || "").toLowerCase().includes(q) ||
        (a.consultor_nome || "").toLowerCase().includes(q)
    );

    arr = [...arr].sort((a, b) => {
      const va = (a[sort.campo] || "").toString().toLowerCase();
      const vb = (b[sort.campo] || "").toString().toLowerCase();
      return sort.dir === "asc" ? va.localeCompare(vb, "pt-BR") : vb.localeCompare(va, "pt-BR");
    });

    return arr;
  }, [arquitetos, busca, sort]);

  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const paginaAtual  = Math.min(pagina, totalPaginas);
  const slice = useMemo(() => {
    const ini = (paginaAtual - 1) * porPagina;
    return lista.slice(ini, ini + porPagina);
  }, [lista, paginaAtual, porPagina]);

  // Gera array de páginas para exibir (máximo 5 números)
  const pageNums = useMemo(() => {
    if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    const start = Math.max(1, paginaAtual - 2);
    const end   = Math.min(totalPaginas, start + 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [totalPaginas, paginaAtual]);

  return (
    <div className="ek-page">

      {/* ── CABEÇALHO ── */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Arquitetos</h1>
          <p>
            {loading ? "Carregando…" : `${lista.length} profissional${lista.length !== 1 ? "is" : ""} encontrado${lista.length !== 1 ? "s" : ""}${arquitetos.length !== lista.length ? ` (de ${arquitetos.length})` : ""}`}
          </p>
        </div>
        <div className="ek-head-actions">
          <button className="btn-secondary" onClick={() => setModalImportar(true)}>
            <FaFileImport /> Importar CSV
          </button>
          <button className="btn-primary" onClick={() => setModal("novo")}>
            <FaPlus /> Novo Arquiteto
          </button>
        </div>
      </div>

      {/* ── SEÇÃO PRINCIPAL ── */}
      <div className="ek-section">

        {/* Toolbar de busca */}
        <div className="arq-toolbar">
          <input
            className="arq-search"
            placeholder="Buscar por nome, escritório, telefone ou e-mail…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && carregar(busca)}
          />
          <button className="btn-secondary arq-btn-buscar" onClick={() => carregar(busca)}>
            Buscar
          </button>
          {busca && (
            <button className="btn-ghost arq-btn-limpar" onClick={() => { setBusca(""); carregar(); }}>
              Limpar
            </button>
          )}
        </div>

        {/* Banner de erro */}
        {erro && (
          <div className="arq-erro-banner">
            <span>{erro}</span>
            <button onClick={() => carregar()}>Tentar novamente</button>
          </div>
        )}

        {/* Conteúdo da tabela */}
        {loading ? (
          <div className="arq-loading"><span className="arq-spinner" /></div>
        ) : lista.length === 0 ? (
          <div className="ek-empty">
            <FaDraftingCompass className="ek-empty-icon" />
            <h3>{busca ? "Nenhum resultado encontrado" : "Nenhum arquiteto cadastrado"}</h3>
            <p>
              {busca
                ? `Não encontramos resultados para "${busca}".`
                : "Cadastre o primeiro arquiteto para começar."}
            </p>
            {!busca && (
              <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setModal("novo")}>
                <FaPlus /> Cadastrar arquiteto
              </button>
            )}
          </div>
        ) : (
          <>
          <div className="arq-table-wrap">
            <table className="arq-table">
              <thead>
                <tr>
                  <th className="arq-th arq-th-num">#</th>
                  <Th label="Nome / Tipo"  campo="nome"      sort={sort} onSort={handleSort} />
                  <Th label="CPF / CNPJ"   campo="cpf_cnpj"  sort={sort} onSort={handleSort} />
                  <Th label="Telefone"     campo="telefone"  sort={sort} onSort={handleSort} />
                  <Th label="E-mail"       campo="email"     sort={sort} onSort={handleSort} />
                  <Th label="Escritório"   campo="escritorio"    sort={sort} onSort={handleSort} />
                  <Th label="Consultor"    campo="consultor_nome" sort={sort} onSort={handleSort} />
                  <th className="arq-th" style={{ cursor: "default" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((arq, idx) => (
                  <tr key={arq.id} className="arq-row" onClick={() => setModal(arq)}>
                    <td className="arq-td-num">{(paginaAtual - 1) * porPagina + idx + 1}</td>
                    <td>
                      <div className="arq-td-nome">{arq.nome}</div>
                      {arq.tipo_pessoa && (
                        <span className={`arq-tipo-badge arq-tipo-${arq.tipo_pessoa.toLowerCase()}`}>
                          {arq.tipo_pessoa === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
                        </span>
                      )}
                    </td>
                    <td className="arq-td-mono">{arq.cpf_cnpj || <span className="arq-vazio">—</span>}</td>
                    <td className="arq-td-mono">{arq.telefone || arq.outro_telefone || <span className="arq-vazio">—</span>}</td>
                    <td className="arq-td-email">{arq.email || <span className="arq-vazio">—</span>}</td>
                    <td>
                      {arq.escritorio
                        ? <span className="arq-escritorio-badge">{arq.escritorio}</span>
                        : <span className="arq-vazio">—</span>}
                    </td>
                    <td>{arq.consultor_nome || <span className="arq-vazio">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="arq-row-actions">
                        <button className="arq-btn-edit" title="Editar" onClick={() => setModal(arq)}>
                          <FaEdit />
                        </button>
                        <button className="arq-btn-del" title="Excluir" onClick={() => setConfirmDelete(arq)}>
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── PAGINAÇÃO ── */}
          {totalPaginas > 1 && (
            <div className="arq-paginacao">
              <div className="arq-pag-info">
                Mostrando {(paginaAtual - 1) * porPagina + 1}–{Math.min(paginaAtual * porPagina, lista.length)} de {lista.length}
              </div>

              <div className="arq-pag-controles">
                <button className="arq-pag-btn" disabled={paginaAtual === 1}
                  onClick={() => setPagina(1)}>«</button>
                <button className="arq-pag-btn" disabled={paginaAtual === 1}
                  onClick={() => setPagina((p) => p - 1)}>‹</button>

                {pageNums.map((n) => (
                  <button key={n}
                    className={`arq-pag-btn${n === paginaAtual ? " arq-pag-ativo" : ""}`}
                    onClick={() => setPagina(n)}>
                    {n}
                  </button>
                ))}

                <button className="arq-pag-btn" disabled={paginaAtual === totalPaginas}
                  onClick={() => setPagina((p) => p + 1)}>›</button>
                <button className="arq-pag-btn" disabled={paginaAtual === totalPaginas}
                  onClick={() => setPagina(totalPaginas)}>»</button>
              </div>

              <select className="arq-pag-select"
                value={porPagina}
                onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}>
                {POR_PAGINA_OPCOES.map((n) => (
                  <option key={n} value={n}>{n} por página</option>
                ))}
              </select>
            </div>
          )}
          </>
        )}
      </div>

      {modal && (
        <ArquitetoModal
          arquiteto={modal === "novo" ? null : modal}
          consultores={consultores}
          onClose={() => setModal(null)}
          onSalvar={handleSalvar}
          salvando={salvando}
        />
      )}

      {modalImportar && (
        <ImportarArquitetosModal
          onClose={() => setModalImportar(false)}
          onImportado={() => { carregar(); setModalImportar(false); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          open={!!confirmDelete}
          titulo="Excluir arquiteto"
          mensagem={`Deseja excluir "${confirmDelete.nome}"? Esta ação não pode ser desfeita.`}
          labelConfirm="Excluir"
          onConfirm={handleExcluir}
          onCancel={() => setConfirmDelete(null)}
          variante="danger"
        />
      )}
    </div>
  );
}
