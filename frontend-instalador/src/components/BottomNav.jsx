import { NavLink } from "react-router-dom";
import { FiCalendar, FiMap, FiDroplet } from "react-icons/fi";

const ITEMS = [
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
