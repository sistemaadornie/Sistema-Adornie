import { Link, useNavigate } from "react-router-dom";
import { FiChevronLeft } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

export default function TopBar({ title, back = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const initials = (user?.nome_completo || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <header className="topbar">
      {back ? (
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <FiChevronLeft size={20} /> Voltar
        </button>
      ) : (
        <h1>{title}</h1>
      )}
      {back && <h1 style={{ fontSize: 16 }}>{title}</h1>}
      <Link to="/perfil" className="topbar-avatar" title="Perfil">
        {user?.foto_url ? <img src={user.foto_url} alt="" /> : (initials || "?")}
      </Link>
    </header>
  );
}
