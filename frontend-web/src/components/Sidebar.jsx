import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FaHome,
  FaCalendarAlt,
  FaUsers,
  FaUserFriends,
  FaCar,
  FaChartBar,
  FaBusinessTime,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaSun,
  FaMoon,
} from "react-icons/fa";
import useAuth from "../hooks/useAuth";

function temPerm(user, ...perms) {
  return perms.some((p) => user?.permissoes?.includes(p));
}

function isInstaladorPuro(user) {
  const altas = ["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"];
  return temPerm(user, "INSTALADOR") && !altas.some((p) => user?.permissoes?.includes(p));
}

export default function Sidebar({ collapsed, onToggle, theme, onToggleTheme }) {
  const { user } = useAuth();
  const [agendamentosOpen, setAgendamentosOpen] = useState(true);

  const instaladorPuro       = isInstaladorPuro(user);
  const podeVerHome          = true;
  const podeVerClientes      = temPerm(user, "COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS");
  const podeVerVeiculos      = temPerm(user, "INSTALADOR","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS");
  const podeVerCalendario    = true;
  const podeVerHistorico     = !instaladorPuro;
  const podeVerMapa          = true;
  const podeVerUsuarios      = temPerm(user, "GESTOR_USUARIOS","ADMIN_MASTER");
  const podeVerRelatorios    = temPerm(user, "OPERADOR_AGENDA", "ADMIN_MASTER");
  const podeVerConfiguracoes = temPerm(user, "ADMIN_MASTER");

  const navItemClass = ({ isActive }) =>
    `sidebar-item${isActive ? " active" : ""}`;

  const subItemClass = ({ isActive }) =>
    `sidebar-sub-item${isActive ? " active" : ""}`;

  return (
    <>
      {/* LOGO + TOGGLE */}
      <div className="sidebar-header">
        {collapsed ? (
          <img src="/logo-adornie.png" alt="Adornie" className="sidebar-logo-icon" />
        ) : (
          <div className="sidebar-logo">
            <img src="/logo-adornie.png" alt="Adornie" className="sidebar-logo-icon" />
            <div className="sidebar-logo-adornie">
              <span className="sidebar-logo-sub">agenda</span>
              <span className="sidebar-logo-main">Adornie</span>
            </div>
          </div>
        )}
        <button
          className="sidebar-toggle-btn"
          onClick={onToggle}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          style={collapsed ? { margin: "0 auto", marginTop: 6 } : undefined}
        >
          {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
        </button>
      </div>

      {/* NAVEGAÇÃO */}
      <nav className="sidebar-nav">

        {podeVerHome && !collapsed && <span className="sidebar-section-label">Geral</span>}

        {podeVerHome && (
          <NavLink to="/home" className={navItemClass} title="Início">
            <FaHome className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Início</span>}
          </NavLink>
        )}

        {!collapsed && <span className="sidebar-section-label">Módulos</span>}
        {collapsed && <div className="sidebar-divider" />}

        <button
          className={`sidebar-item sidebar-group-header${
            agendamentosOpen && !collapsed ? " active" : ""
          }`}
          onClick={() => !collapsed && setAgendamentosOpen((v) => !v)}
          title={collapsed ? "Agendamentos" : undefined}
        >
          <FaCalendarAlt className="sidebar-icon" />
          {!collapsed && (
            <>
              <span className="sidebar-label">Agendamentos</span>
              <FaChevronDown
                className={`sidebar-chevron${agendamentosOpen ? " open" : ""}`}
              />
            </>
          )}
        </button>

        {!collapsed && agendamentosOpen && (
          <div className="sidebar-sub">
            {podeVerCalendario && (
              <NavLink to="/agendamentos" end className={subItemClass}>
                <span className="sidebar-sub-dot" />
                Calendário
              </NavLink>
            )}
            {podeVerHistorico && (
              <NavLink to="/agendamentos/historico" className={subItemClass}>
                <span className="sidebar-sub-dot" />
                Histórico
              </NavLink>
            )}
            {podeVerMapa && (
              <NavLink to="/agendamentos/mapa" className={subItemClass}>
                <span className="sidebar-sub-dot" />
                Mapa
              </NavLink>
            )}
          </div>
        )}

        {podeVerVeiculos && (
          <NavLink to="/veiculos" className={navItemClass} title="Veículos">
            <FaCar className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Veículos</span>}
          </NavLink>
        )}

        {podeVerClientes && (
          <>
            {collapsed && <div className="sidebar-divider" />}
            <NavLink to="/clientes" className={navItemClass} title="Clientes">
              <FaUserFriends className="sidebar-icon" />
              {!collapsed && <span className="sidebar-label">Clientes</span>}
            </NavLink>
          </>
        )}

        {podeVerRelatorios && (
          <NavLink to="/relatorios" className={navItemClass} title="Relatórios">
            <FaChartBar className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Relatórios</span>}
          </NavLink>
        )}

        {(podeVerUsuarios || podeVerConfiguracoes) && (
          <>
            {!collapsed && <span className="sidebar-section-label">Administração</span>}
            {collapsed && <div className="sidebar-divider" />}
          </>
        )}

        {podeVerUsuarios && (
          <NavLink to="/usuarios" className={navItemClass} title="Usuários">
            <FaUsers className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Usuários</span>}
          </NavLink>
        )}

        {podeVerConfiguracoes && (
          <NavLink to="/expediente" className={navItemClass} title="Expediente">
            <FaBusinessTime className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">Expediente</span>}
          </NavLink>
        )}

      </nav>

      {/* FOOTER — TEMA */}
      <div className="sidebar-footer">
        <button
          className="sidebar-item"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
        >
          {theme === "dark" ? (
            <FaSun className="sidebar-icon" />
          ) : (
            <FaMoon className="sidebar-icon" />
          )}
          {!collapsed && (
            <span className="sidebar-label">
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
