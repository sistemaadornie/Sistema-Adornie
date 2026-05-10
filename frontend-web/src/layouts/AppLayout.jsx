import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { FaBars } from "react-icons/fa";
import Sidebar from "../components/Sidebar";
import UserCard from "../components/UserCard";
import NotificacaoBell from "../components/NotificacaoBell";
import ErrorBoundary from "../components/ErrorBoundary";
import { NotificacoesProvider } from "../contexts/NotificacoesContext";
import "./AppLayout.css";

export default function AppLayout() {
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  const [sessionExpired, setSessionExpired] = useState(false);

  // Aplicar tema no <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Logout automático ao receber 401 de qualquer chamada da api
  useEffect(() => {
    function handleUnauthorized() {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setSessionExpired(true);
      setTimeout(() => {
        setSessionExpired(false);
        navigate("/login");
      }, 2200);
    }
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [navigate]);

  // Fechar sidebar mobile ao redimensionar
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <NotificacoesProvider>
    <div className="app-layout">

      {/* TOAST SESSÃO EXPIRADA */}
      {sessionExpired && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 99999, background: "#ef4444", color: "#fff",
          padding: "12px 24px", borderRadius: "var(--radius-md)",
          fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          ⚠ Sessão expirada. Redirecionando para o login...
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`app-sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </aside>

      {/* OVERLAY MOBILE */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={closeMobile} />
      )}

      {/* ÁREA PRINCIPAL */}
      <div className="app-main">

        {/* HEADER */}
        <header className="app-header">
          <div className="header-left">
            <button
              className="header-hamburger"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Abrir menu"
            >
              <FaBars />
            </button>
          </div>

          <div className="header-right">
            <NotificacaoBell />
            <UserCard theme={theme} onToggleTheme={toggleTheme} />
          </div>
        </header>

        {/* CONTEÚDO */}
        <main className="app-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

      </div>
    </div>
    </NotificacoesProvider>
  );
}
