import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  FaBell, FaTimes, FaRoute, FaClock, FaCheckCircle,
  FaExclamationTriangle, FaTimesCircle, FaInfoCircle, FaCog, FaTrash,
} from "react-icons/fa";
import { useNotificacoes } from "../contexts/NotificacoesContext";
import "./Notificacoes.css";

/* ── Ícone por tipo ── */
const ICONE_MAP = {
  rota:     { el: <FaRoute />,              classe: "rota"     },
  atrasado: { el: <FaClock />,              classe: "atrasado" },
  sucesso:  { el: <FaCheckCircle />,        classe: "sucesso"  },
  alerta:   { el: <FaExclamationTriangle />,classe: "alerta"   },
  erro:     { el: <FaTimesCircle />,        classe: "erro"     },
  info:     { el: <FaInfoCircle />,         classe: "info"     },
  sistema:  { el: <FaCog />,               classe: "sistema"  },
};

function getIcone(icone) {
  return ICONE_MAP[icone] || ICONE_MAP.info;
}

/* ── Tempo relativo ── */
function tempoRelativo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(min / 60);
  const d    = Math.floor(h / 24);
  if (min < 1)  return "agora";
  if (min < 60) return `${min}min atrás`;
  if (h < 24)   return `${h}h atrás`;
  if (d === 1)  return "ontem";
  return `${d} dias atrás`;
}

function isMesmaData(isoStr) {
  const d = new Date(isoStr);
  const hoje = new Date();
  return d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate();
}

export default function NotificacoesDrawer({ onClose }) {
  const { notificacoes, naoLidas, marcarLida, marcarTodasLidas, excluir, limparTodas } = useNotificacoes();
  const navigate = useNavigate();
  const [confirmLimpar, setConfirmLimpar] = useState(false);

  /* Fechar com Escape */
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleClick(n) {
    if (!n.lida) await marcarLida(n.id);
    // Aceita somente rotas internas (começam com /) — previne open redirect
    if (n.link && n.link.startsWith("/")) { navigate(n.link); onClose(); }
  }

  const hoje    = notificacoes.filter((n) =>  isMesmaData(n.criado_em));
  const antigas = notificacoes.filter((n) => !isMesmaData(n.criado_em));

  const conteudo = (
    <>
      {/* overlay com blur */}
      <div className="notif-overlay" onClick={onClose} />

      <div className="notif-drawer">

        {/* HEADER */}
        <div className="notif-drawer-header">
          <div className="notif-drawer-title">
            <div className="notif-drawer-title-icon">
              <FaBell />
            </div>
            <div className="notif-drawer-title-text">
              <div className="notif-drawer-title-row">
                <span className="notif-drawer-title-main">Notificações</span>
                {naoLidas > 0 && (
                  <span className="notif-drawer-count">{naoLidas} nova{naoLidas > 1 ? "s" : ""}</span>
                )}
              </div>
              <span className="notif-drawer-title-sub">
                {notificacoes.length === 0
                  ? "Nenhuma notificação"
                  : `${notificacoes.length} notificaç${notificacoes.length === 1 ? "ão" : "ões"}`}
              </span>
            </div>
          </div>
          <div className="notif-drawer-actions">
            {naoLidas > 0 && (
              <button className="notif-btn-text" onClick={marcarTodasLidas}>
                Marcar todas como lidas
              </button>
            )}
            <button className="notif-close-btn" onClick={onClose} title="Fechar">
              <FaTimes />
            </button>
          </div>
        </div>

        {/* LISTA */}
        <div className="notif-list">
          {notificacoes.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-icon"><FaBell /></div>
              <p className="notif-empty-text">Tudo em dia!</p>
              <p className="notif-empty-sub">Nenhuma notificação por enquanto.</p>
            </div>
          ) : (
            <>
              {hoje.length > 0 && (
                <>
                  <div className="notif-section-label">Hoje</div>
                  {hoje.map((n) => (
                    <ItemNotificacao key={n.id} n={n} onClick={handleClick} onDel={excluir} />
                  ))}
                </>
              )}
              {antigas.length > 0 && (
                <>
                  <div className="notif-section-label">Anteriores</div>
                  {antigas.map((n) => (
                    <ItemNotificacao key={n.id} n={n} onClick={handleClick} onDel={excluir} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* RODAPÉ */}
        {notificacoes.length > 0 && (
          <div className="notif-drawer-footer">
            <span className="notif-footer-info">
              <strong>{notificacoes.length}</strong> notificaç{notificacoes.length === 1 ? "ão" : "ões"}
              {naoLidas > 0 && <> · <strong>{naoLidas}</strong> não lida{naoLidas > 1 ? "s" : ""}</>}
            </span>

            {confirmLimpar ? (
              <div className="notif-confirm-wrap">
                <span className="notif-confirm-label">Limpar tudo?</span>
                <button
                  className="notif-confirm-btn notif-confirm-sim"
                  onClick={() => { limparTodas(); setConfirmLimpar(false); }}
                >
                  Sim
                </button>
                <button
                  className="notif-confirm-btn notif-confirm-nao"
                  onClick={() => setConfirmLimpar(false)}
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                className="notif-btn-limpar"
                onClick={() => setConfirmLimpar(true)}
                title="Remover todas as notificações"
              >
                <FaTrash style={{ fontSize: 10 }} />
                Limpar tudo
              </button>
            )}
          </div>
        )}

      </div>
    </>
  );

  return createPortal(conteudo, document.body);
}

function ItemNotificacao({ n, onClick, onDel }) {
  const iconeData = getIcone(n.icone);
  return (
    <div
      className={`notif-item${!n.lida ? " nao-lida" : ""}`}
      onClick={() => onClick(n)}
    >
      <div className={`notif-item-icon ${iconeData.classe}`}>
        {iconeData.el}
      </div>
      <div className="notif-item-body">
        <div className="notif-item-header">
          <div className="notif-item-title">{n.titulo}</div>
          <div className="notif-item-time">{tempoRelativo(n.criado_em)}</div>
        </div>
        {n.mensagem && <div className="notif-item-msg">{n.mensagem}</div>}
      </div>
      <button
        className="notif-item-del"
        title="Remover"
        onClick={(e) => { e.stopPropagation(); onDel(n.id); }}
      >
        <FaTimes />
      </button>
    </div>
  );
}
