import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiCalendar, FiMap, FiDroplet, FiClock, FiMapPin } from "react-icons/fi";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { statusLabel, formatDateLabel, todayISO } from "../utils/agendamentos";

export default function Home() {
  const { user } = useAuth();
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    api
      .get(`/agendamentos?data_inicio=${todayISO()}`)
      .then((data) => {
        if (!ativo) return;
        setAgendamentos((data.agendamentos || []).slice(0, 4));
      })
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setLoading(false));
    return () => { ativo = false; };
  }, []);

  const hoje = agendamentos.filter((a) => a.data === todayISO());
  const primeiroNome = (user?.nome_completo || "").split(" ")[0];

  return (
    <>
      <TopBar title="Adornie Instalador" />
      <div className="page">
        <h2 className="page-title">Olá, {primeiroNome || "instalador"}</h2>
        <p className="page-subtitle">
          {hoje.length === 0
            ? "Nenhum atendimento agendado para hoje."
            : `${hoje.length} atendimento${hoje.length > 1 ? "s" : ""} agendado${hoje.length > 1 ? "s" : ""} para hoje.`}
        </p>

        <div className="shortcut-grid">
          <Link to="/agenda" className="shortcut-card">
            <FiCalendar className="shortcut-icon" />
            <strong>Agenda</strong>
            <span>Todos os agendamentos</span>
          </Link>
          <Link to="/rotas" className="shortcut-card">
            <FiMap className="shortcut-icon" />
            <strong>Rotas</strong>
            <span>Mapa do dia</span>
          </Link>
          <Link to="/abastecimento" className="shortcut-card">
            <FiDroplet className="shortcut-icon" />
            <strong>Abastecimento</strong>
            <span>Registrar combustível</span>
          </Link>
          <Link to="/perfil" className="shortcut-card">
            <FiClock className="shortcut-icon" />
            <strong>Perfil</strong>
            <span>Conta e sessão</span>
          </Link>
        </div>

        <h3 className="section-title">Próximos atendimentos</h3>

        {loading && <div className="spinner-wrap">Carregando...</div>}
        {erro && <div className="banner banner-danger">{erro}</div>}

        {!loading && !erro && agendamentos.length === 0 && (
          <div className="empty-state">Nenhum atendimento agendado.</div>
        )}

        {agendamentos.map((ag) => (
          <Link to={`/agenda/${ag.id}`} key={ag.id} className="list-item">
            <div className="list-item-top">
              <div className="list-item-title">{ag.cliente}</div>
              <span className={`badge badge-${ag.status}`}>{statusLabel(ag.status)}</span>
            </div>
            <div className="list-item-meta">
              <FiClock style={{ verticalAlign: "-2px" }} /> {formatDateLabel(ag.data)} · {ag.hora}
            </div>
            {ag.endereco || ag.cidade ? (
              <div className="list-item-meta">
                <FiMapPin style={{ verticalAlign: "-2px" }} /> {ag.endereco || `${ag.cidade} - ${ag.estado}`}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
    </>
  );
}
