import { useState } from "react";
import { FaBell } from "react-icons/fa";
import { useNotificacoes } from "../contexts/NotificacoesContext";
import NotificacoesDrawer from "./NotificacoesDrawer";
import "./Notificacoes.css";

export default function NotificacaoBell() {
  const { naoLidas } = useNotificacoes();
  const [open, setOpen] = useState(false);

  return (
    <div className="notif-bell-wrap">
      <button
        className="header-icon-btn"
        title="Notificações"
        aria-label={`Notificações${naoLidas > 0 ? ` (${naoLidas} não lidas)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        style={naoLidas > 0 ? { color: "var(--sidebar-text-active)" } : undefined}
      >
        <FaBell />
      </button>

      {naoLidas > 0 && (
        <span className="notif-badge">{naoLidas > 99 ? "99+" : naoLidas}</span>
      )}

      {open && <NotificacoesDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}
