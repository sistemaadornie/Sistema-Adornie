import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaSun, FaMoon, FaSignOutAlt, FaCamera, FaTrash } from "react-icons/fa";
import useAuth from "../hooks/useAuth";
import ImageCropModal from "./ImageCropModal";
import ConfirmModal from "./ConfirmModal";
import { API_BASE } from "../services/api";

export default function UserCard({ theme, onToggleTheme }) {
  const { user, token } = useAuth();
  const [open, setOpen]           = useState(false);
  const [cropFile, setCropFile]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [erroFoto, setErroFoto]   = useState("");
  const [confirmRemover, setConfirmRemover] = useState(false);
  const navigate   = useNavigate();
  const wrapperRef = useRef(null);
  const fileRef    = useRef(null);

  const nome    = user?.nome_completo || user?.nome || "Usuário";
  const email   = user?.email || "";
  const foto    = user?.foto_url || null;
  const inicial = nome.charAt(0).toUpperCase();

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setOpen(false);
    e.target.value = "";
  }

  async function handleSaveFoto(blob) {
    setCropFile(null);
    setUploading(true);
    setErroFoto("");
    try {
      const formData = new FormData();
      formData.append("foto", blob, "foto.jpg");

      const res = await fetch(`${API_BASE}/auth/user/foto-upload`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        const userAtual = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...userAtual, foto_url: data.foto_url }));
        window.location.reload();
      } else {
        setErroFoto(data.message || "Erro ao salvar foto.");
        setOpen(true);
      }
    } catch {
      setErroFoto("Erro de conexão.");
      setOpen(true);
    } finally {
      setUploading(false);
    }
  }

  async function confirmarRemoverFoto() {
    setConfirmRemover(false);
    try {
      const res = await fetch(`${API_BASE}/auth/user/foto`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const userAtual = JSON.parse(localStorage.getItem("user") || "{}");
        const { foto_url: _, ...semFoto } = userAtual;
        localStorage.setItem("user", JSON.stringify(semFoto));
        window.location.reload();
      } else {
        setErroFoto("Erro ao remover foto.");
        setOpen(true);
      }
    } catch {
      setErroFoto("Erro de conexão.");
      setOpen(true);
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="user-wrapper" ref={wrapperRef}>

        <div
          className="user-box"
          onClick={() => { setOpen((v) => !v); setErroFoto(""); }}
          style={{ cursor: "pointer" }}
        >
          {foto ? (
            <img src={foto} className="avatar" alt={nome} />
          ) : (
            <div className="avatar">{inicial}</div>
          )}

          <div className="user-text">
            <strong>{nome}</strong>
            <span className="user-sub">{email}</span>
          </div>
        </div>

        {open && (
          <div className="user-dropdown">

            {erroFoto && (
              <div style={{
                padding: "6px 12px", margin: "0 0 4px",
                background: "color-mix(in srgb, #ef4444 12%, var(--color-surface-soft))",
                border: "1px solid color-mix(in srgb, #ef4444 30%, var(--color-border))",
                borderRadius: "var(--radius-xs)",
                fontSize: 12, color: "#ef4444",
              }}>
                {erroFoto}
              </div>
            )}

            {/* Trocar foto */}
            <label className="dropdown-item" style={{ cursor: "pointer" }}>
              <FaCamera />
              {uploading ? "Enviando..." : "Trocar foto"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </label>

            {/* Remover foto — só se tiver foto */}
            {foto && (
              <button className="dropdown-item danger" onClick={() => { setOpen(false); setConfirmRemover(true); }}>
                <FaTrash />
                Remover foto
              </button>
            )}

            <div className="dropdown-divider" />

            {onToggleTheme && (
              <button className="dropdown-item" onClick={() => { onToggleTheme(); setOpen(false); }}>
                {theme === "dark" ? <FaSun /> : <FaMoon />}
                {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </button>
            )}

            <button className="dropdown-item danger" onClick={handleLogout}>
              <FaSignOutAlt />
              Sair
            </button>
          </div>
        )}

      </div>

      {/* Modal de crop */}
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onClose={() => setCropFile(null)}
          onSave={handleSaveFoto}
        />
      )}

      {/* Confirm remover foto */}
      <ConfirmModal
        open={confirmRemover}
        titulo="Remover foto de perfil"
        mensagem="Sua foto de perfil será removida. Deseja continuar?"
        labelConfirm="Remover"
        variante="danger"
        onConfirm={confirmarRemoverFoto}
        onCancel={() => setConfirmRemover(false)}
      />
    </>
  );
}
