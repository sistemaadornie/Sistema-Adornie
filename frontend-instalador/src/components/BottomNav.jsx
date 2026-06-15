import { NavLink } from "react-router-dom";
import { FiHome, FiCalendar, FiMap, FiDroplet } from "react-icons/fi";

const ITEMS = [
  { to: "/", label: "Início", icon: FiHome, end: true },
  { to: "/agenda", label: "Agenda", icon: FiCalendar },
  { to: "/rotas", label: "Rotas", icon: FiMap },
  { to: "/abastecimento", label: "Combustível", icon: FiDroplet },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
