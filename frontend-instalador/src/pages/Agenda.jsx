import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiClock, FiMapPin } from "react-icons/fi";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { statusLabel, formatDateLabel, todayISO, addDaysISO } from "../utils/agendamentos";

const FILTROS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Próximos 7 dias" },
  { id: "todos", label: "Todos" },
];

export default function Agenda() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState("hoje");
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro("");

    const hoje = todayISO();
    let query = `usuario_id=${user.id}&data_inicio=${hoje}`;
    if (filtro === "hoje") query += `&data_fim=${hoje}`;
    if (filtro === "semana") query += `&data_fim=${addDaysISO(hoje, 7)}`;

    api
      .get(`/agendamentos?${query}`)
      .then((data) => ativo && setAgendamentos(data.agendamentos || []))
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setLoading(false));

    return () => { ativo = false; };
  }, [filtro, user.id]);

  const grupos = useMemo(() => {
    const porData = new Map();
    for (const ag of agendamentos) {
      if (!porData.has(ag.data)) porData.set(ag.data, []);
      porData.get(ag.data).push(ag);
    }
    return Array.from(porData.entries());
  }, [agendamentos]);

  return (
    <>
      <TopBar title="Agenda" />
      <div className="page">
        <div className="field-filter">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              className={`filter-chip${filtro === f.id ? " active" : ""}`}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <div className="spinner-wrap">Carregando...</div>}
        {erro && <div className="banner banner-danger">{erro}</div>}

        {!loading && !erro && agendamentos.length === 0 && (
          <div className="empty-state">Nenhum agendamento encontrado.</div>
        )}

        {grupos.map(([data, itens]) => (
          <div key={data}>
            <h3 className="section-title">{formatDateLabel(data)}</h3>
            {itens.map((ag) => (
              <Link to={`/agenda/${ag.id}`} key={ag.id} className="list-item">
                <div className="list-item-top">
                  <div className="list-item-title">{ag.cliente}</div>
                  <span className="list-item-time">{ag.hora}</span>
                </div>
                <div className="list-item-meta">{ag.titulo}</div>
                {ag.endereco || ag.cidade ? (
                  <div className="list-item-meta">
                    <FiMapPin style={{ verticalAlign: "-2px" }} /> {ag.endereco || `${ag.cidade} - ${ag.estado}`}
                  </div>
                ) : null}
                <div className="list-item-meta" style={{ marginTop: 6 }}>
                  <span className={`badge badge-${ag.status}`}>{statusLabel(ag.status)}</span>
                  {" "}
                  {ag.tipo && <span style={{ marginLeft: 6 }}><FiClock style={{ verticalAlign: "-2px" }} /> {ag.tipo}</span>}
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
