import { useNavigate } from "react-router-dom";
import { FiLogOut, FiMail, FiBriefcase, FiUser, FiSun, FiMoon } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";

export default function Perfil() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
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
          <div className="topbar-avatar" style={{ width: 64, height: 64, fontSize: 22, margin: "0 auto var(--space-2)" }}>
            {initials || "?"}
          </div>
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

        <button className="btn btn-danger btn-block" onClick={handleLogout}>
          <FiLogOut /> Sair
        </button>
      </div>
    </>
  );
}
