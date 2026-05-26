import { useState, useRef, useEffect, useCallback } from "react";
import { FaTimes, FaPlus, FaTrash, FaCheck } from "react-icons/fa";
import { api } from "../../services/api";
import "./EtiquetasConfig.css";

/* ─────────────────────────────────────────
   Hook — logos persistidas via API + Cloudinary
───────────────────────────────────────── */
export function useLogos() {
  const [logos,      setLogos]      = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const data = await api.get("/etiqueta-logos");
      setLogos(data);
    } catch {
      // erro de rede — mantém lista vazia silenciosamente
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(nome, file) {
    const fd = new FormData();
    fd.append("nome", nome);
    fd.append("arquivo", file);
    const nova = await api.post("/etiqueta-logos", fd, true /* isFormData */);
    setLogos(prev => [nova, ...prev]);
    return nova.id;
  }

  async function remover(id) {
    await api.delete(`/etiqueta-logos/${id}`);
    setLogos(prev => prev.filter(l => l.id !== id));
  }

  return { logos, carregando, salvar, remover };
}

/* ─────────────────────────────────────────
   Modal de configuração
───────────────────────────────────────── */
export default function EtiquetasConfig({ open, onClose, logos, carregando, onSalvar, onRemover }) {
  // pendente: { file: File, previewUrl: string } | null
  const [pendente,         setPendente]         = useState(null);
  const [nome,             setNome]             = useState("");
  const [salvando,         setSalvando]         = useState(false);
  const [erroUpload,       setErroUpload]       = useState(null);
  const [confirmarRemover, setConfirmarRemover] = useState(null);

  const fileRef = useRef();
  const nomeRef = useRef();

  /* Fecha com Escape */
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (e.key === "Escape") fechar(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  /* Foca input de nome ao selecionar arquivo */
  useEffect(() => {
    if (pendente) setTimeout(() => nomeRef.current?.focus(), 50);
  }, [pendente]);

  /* Limpa preview URL ao desmontar para não vazar memória */
  useEffect(() => {
    return () => { if (pendente?.previewUrl) URL.revokeObjectURL(pendente.previewUrl); };
  }, [pendente]);

  if (!open) return null;

  function fechar() {
    if (salvando) return;
    limparPendente();
    setConfirmarRemover(null);
    onClose();
  }

  function limparPendente() {
    if (pendente?.previewUrl) URL.revokeObjectURL(pendente.previewUrl);
    setPendente(null);
    setNome("");
    setErroUpload(null);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    limparPendente();
    const previewUrl = URL.createObjectURL(file);
    setPendente({ file, previewUrl });
    setNome(file.name.replace(/\.[^/.]+$/, "")); // sugere nome sem extensão
    e.target.value = "";
  }

  async function handleSalvar() {
    if (!pendente || !nome.trim() || salvando) return;
    setSalvando(true);
    setErroUpload(null);
    try {
      await onSalvar(nome.trim(), pendente.file);
      limparPendente();
    } catch (e) {
      setErroUpload(e.message || "Erro ao fazer upload. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  function handleRemover(id) {
    if (confirmarRemover === id) {
      onRemover(id);
      setConfirmarRemover(null);
    } else {
      setConfirmarRemover(id);
    }
  }

  return (
    <div className="etqcfg-overlay" onClick={fechar}>
      <div className="etqcfg-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        {/* Header */}
        <div className="etqcfg-header">
          <span className="etqcfg-title">Configurações de Etiquetas</span>
          <button className="etqcfg-close" onClick={fechar} title="Fechar" disabled={salvando}>
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div className="etqcfg-body">
          <div className="etqcfg-section">
            <div className="etqcfg-section-label">Logos salvas</div>
            <p className="etqcfg-section-desc">
              Logos cadastradas ficam disponíveis para uso em qualquer tipo de etiqueta e são salvas permanentemente.
            </p>

            {/* Lista de logos */}
            {carregando ? (
              <div className="etqcfg-loading">Carregando logos...</div>
            ) : logos.length === 0 && !pendente ? (
              <div className="etqcfg-empty">Nenhuma logo cadastrada ainda.</div>
            ) : (
              <div className="etqcfg-logos-list">
                {logos.map(logo => (
                  <div key={logo.id} className="etqcfg-logo-item">
                    <img src={logo.url} alt={logo.nome} className="etqcfg-logo-thumb" />
                    <span className="etqcfg-logo-nome">{logo.nome}</span>
                    <button
                      className={`etqcfg-logo-del${confirmarRemover === logo.id ? " confirmar" : ""}`}
                      onClick={() => handleRemover(logo.id)}
                      title={confirmarRemover === logo.id ? "Clique novamente para confirmar" : "Remover logo"}
                    >
                      {confirmarRemover === logo.id
                        ? <><FaCheck /> Confirmar</>
                        : <FaTrash />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulário de upload pendente */}
            {pendente && (
              <div className="etqcfg-upload-form">
                <img src={pendente.previewUrl} alt="Preview" className="etqcfg-upload-preview" />
                <div className="etqcfg-upload-fields">
                  <label className="etqcfg-upload-label">Nome da logo</label>
                  <input
                    ref={nomeRef}
                    className="etqcfg-input"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Logo principal"
                    disabled={salvando}
                    onKeyDown={e => {
                      if (e.key === "Enter")  handleSalvar();
                      if (e.key === "Escape") limparPendente();
                    }}
                  />
                  {erroUpload && (
                    <span className="etqcfg-erro">{erroUpload}</span>
                  )}
                  <div className="etqcfg-upload-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleSalvar}
                      disabled={!nome.trim() || salvando}
                    >
                      {salvando ? "Salvando..." : <><FaCheck /> Salvar logo</>}
                    </button>
                    <button className="btn btn-secondary" onClick={limparPendente} disabled={salvando}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Botão adicionar — oculto enquanto há upload pendente */}
            {!pendente && (
              <button className="etqcfg-add-btn" onClick={() => fileRef.current?.click()}>
                <FaPlus /> Adicionar logo
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={handleFile}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
