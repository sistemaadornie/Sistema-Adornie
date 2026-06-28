import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiLogOut, FiMail, FiBriefcase, FiUser, FiSun, FiMoon, FiCamera, FiBell, FiBellOff } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../services/api";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "../services/push";
import TopBar from "../components/TopBar";

export default function Perfil() {
  const { user, logout, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  const [pushStatus, setPushStatus] = useState("default");
  const [pushErro, setPushErro] = useState("");
  const [pushCarregando, setPushCarregando] = useState(false);

  useEffect(() => {
    getPushStatus().then(setPushStatus).catch(() => setPushStatus("unsupported"));
  }, []);

  async function handleTogglePush() {
    setPushErro("");
    setPushCarregando(true);
    try {
      if (pushStatus === "subscribed") {
        await unsubscribeFromPush();
        setPushStatus("not-subscribed");
      } else {
        await subscribeToPush();
        setPushStatus("subscribed");
      }
    } catch (err) {
      setPushErro(err.message || "Erro ao atualizar notificações.");
      const status = await getPushStatus().catch(() => "unsupported");
      setPushStatus(status);
    } finally {
      setPushCarregando(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  async function handleFotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setEnviandoFoto(true);
    setErroFoto("");
    try {
      const fd = new FormData();
      fd.append("foto", file);
      const data = await api.put("/auth/user/foto-upload", fd, true);
      updateUser({ foto_url: data.foto_url });
    } catch (err) {
      setErroFoto(err.message || "Erro ao enviar foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  const initials = (user?.nome_completo || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <TopBar title="Perfil" />
      <div className="page">
        <div className="card" style={{ textAlign: "center" }}>
          <div className="perfil-avatar-wrap">
            <div className="topbar-avatar perfil-avatar" style={{ opacity: enviandoFoto ? 0.5 : 1 }}>
              {user?.foto_url ? <img src={user.foto_url} alt="" /> : (initials || "?")}
            </div>
            <label className="perfil-avatar-cam" title="Alterar foto">
              <FiCamera size={14} />
              <input type="file" accept="image/*" onChange={handleFotoChange} disabled={enviandoFoto} style={{ display: "none" }} />
            </label>
          </div>
          {erroFoto && <p style={{ color: "var(--color-danger)", fontSize: 12, margin: "0 0 8px" }}>{erroFoto}</p>}
          <h2 style={{ margin: "0 0 4px" }}>{user?.nome_completo}</h2>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>Instalador</p>
        </div>

        <div className="card">
          <div className="detail-row">
            <FiMail className="detail-icon" />
            <div>
              <span className="detail-label">Email</span>
              {user?.email}
            </div>
          </div>
          {user?.setor_nome && (
            <div className="detail-row">
              <FiUser className="detail-icon" />
              <div>
                <span className="detail-label">Setor</span>
                {user.setor_nome}
              </div>
            </div>
          )}
          {user?.empresa_nome && (
            <div className="detail-row" style={{ marginBottom: 0 }}>
              <FiBriefcase className="detail-icon" />
              <div>
                <span className="detail-label">Empresa</span>
                {user.empresa_nome}
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-block" style={{ marginBottom: "var(--space-1)" }} onClick={toggleTheme}>
          {theme === "dark" ? <FiSun /> : <FiMoon />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>

        {pushStatus !== "unsupported" && (
          <>
            {pushErro && <p style={{ color: "var(--color-danger)", fontSize: 12, margin: "0 0 8px" }}>{pushErro}</p>}
            <button
              className="btn btn-block"
              style={{ marginBottom: "var(--space-1)" }}
              onClick={handleTogglePush}
              disabled={pushCarregando || pushStatus === "denied"}
            >
              {pushStatus === "subscribed" ? <FiBellOff /> : <FiBell />}
              {pushStatus === "denied"
                ? "Notificações bloqueadas pelo navegador"
                : pushStatus === "subscribed"
                ? "Desativar notificações"
                : "Ativar notificações"}
            </button>
          </>
        )}

        <button className="btn btn-danger btn-block" onClick={handleLogout}>
          <FiLogOut /> Sair
        </button>
      </div>
    </>
  );
}
