import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiMapPin, FiUsers } from "react-icons/fi";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import {
  statusLabel, formatDateBR, todayISO, addDaysISO,
  STATUS_CORES, TIPO_CORES, parseDateInfo,
} from "../utils/agendamentos";

const FILTROS = [
  { id: "hoje",   label: "Hoje" },
  { id: "semana", label: "7 dias" },
  { id: "mes",    label: "30 dias" },
  { id: "todos",  label: "Todos" },
];

function horaFim(horaInicio, duracaoMin) {
  if (!horaInicio) return null;
  const [h, m] = horaInicio.split(":").map(Number);
  const total = h * 60 + m + (duracaoMin || 60);
  const hf = String(Math.floor(total / 60)).padStart(2, "0");
  const mf = String(total % 60).padStart(2, "0");
  return `${hf}:${mf}`;
}

function EventoCard({ ag }) {
  const cor = STATUS_CORES[ag.status] || "#888";
  const equipe = ag.equipe?.map((m) => m.nome || m).join(", ");
  const fim = ag.hora_fim || horaFim(ag.hora, ag.duracao_minutos);

  return (
    <Link
      to={`/agenda/${ag.id}`}
      className="gcal-evento"
      style={{ backgroundColor: `${cor}18`, borderLeft: `3px solid ${cor}` }}
    >
      {ag.tipo && (
        <span className="tipo-corner" style={{ background: TIPO_CORES[ag.tipo] || "var(--color-text-secondary)" }}>
          {ag.tipo}
        </span>
      )}

      <div className="gcal-evento-titulo">{ag.titulo || ag.cliente}</div>

      {ag.hora && (
        <div className="gcal-evento-hora">
          {ag.hora}{fim ? ` – ${fim}` : ""}
        </div>
      )}

      {ag.titulo && ag.cliente && (
        <div className="gcal-evento-sub">{ag.cliente}</div>
      )}

      {ag.endereco && (
        <div className="gcal-evento-sub">
          <FiMapPin size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {ag.endereco}
        </div>
      )}

      {equipe && (
        <div className="gcal-evento-sub">
          <FiUsers size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
          {equipe}
        </div>
      )}

      <span
        className="gcal-evento-status"
        style={{ color: cor }}
      >
        {statusLabel(ag.status)}
      </span>
    </Link>
  );
}

function GrupoData({ data, itens }) {
  const info = parseDateInfo(data);

  return (
    <div className="gcal-grupo">
      {/* Coluna esquerda: data estilo Google */}
      <div className="gcal-data-col">
        <span className="gcal-dia-semana">{info.diaSemana}</span>
        <span
          className={`gcal-dia-num${info.isHoje ? " gcal-hoje" : ""}`}
        >
          {info.dia}
        </span>
        {!info.isHoje && !info.isAmanha && (
          <span className="gcal-mes">{info.mes}</span>
        )}
        {info.isHoje && <span className="gcal-label-dia">Hoje</span>}
        {info.isAmanha && <span className="gcal-label-dia">Amanhã</span>}
      </div>

      {/* Coluna direita: lista de eventos */}
      <div className="gcal-eventos-col">
        {itens.map((ag) => (
          <EventoCard key={ag.id} ag={ag} />
        ))}
      </div>
    </div>
  );
}

export default function Agenda() {
  const [filtro, setFiltro] = useState("semana");
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro("");

    const hoje = todayISO();
    let query = `data_inicio=${hoje}`;
    if (filtro === "hoje")   query += `&data_fim=${hoje}`;
    if (filtro === "semana") query += `&data_fim=${addDaysISO(hoje, 7)}`;
    if (filtro === "mes")    query += `&data_fim=${addDaysISO(hoje, 30)}`;

    api
      .get(`/agendamentos?${query}`)
      .then((data) => ativo && setAgendamentos(data.agendamentos || []))
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setLoading(false));

    return () => { ativo = false; };
  }, [filtro]);

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

        {/* Filtros */}
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

        {loading && <div className="spinner-wrap"><span className="spinner" /> Carregando...</div>}
        {erro && <div className="banner banner-danger">{erro}</div>}

        {!loading && !erro && agendamentos.length === 0 && (
          <div className="empty-state">Nenhum agendamento encontrado.</div>
        )}

        {/* Lista estilo Google Calendar */}
        <div className="gcal-lista">
          {grupos.map(([data, itens]) => (
            <GrupoData key={data} data={data} itens={itens} />
          ))}
        </div>

      </div>
    </>
  );
}
