import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiMapPin, FiSearch, FiX } from "react-icons/fi";
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

const TIPOS = ["todos", ...Object.keys(TIPO_CORES)];

function horaFim(horaInicio, duracaoMin) {
  if (!horaInicio) return null;
  const [h, m] = horaInicio.split(":").map(Number);
  const total = h * 60 + m + (duracaoMin || 60);
  const hf = String(Math.floor(total / 60)).padStart(2, "0");
  const mf = String(total % 60).padStart(2, "0");
  return `${hf}:${mf}`;
}

function iniciais(nome) {
  return String(nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const MAX_AVATARES = 4;

function EquipeAvatares({ equipe }) {
  if (!equipe?.length) return null;
  const visiveis = equipe.slice(0, MAX_AVATARES);
  const resto = equipe.length - visiveis.length;

  return (
    <div className="gcal-equipe">
      {visiveis.map((m, i) => (
        <span
          key={m.id ?? i}
          className="gcal-equipe-avatar"
          title={m.nome || ""}
        >
          {m.foto_url ? <img src={m.foto_url} alt="" /> : iniciais(m.nome)}
        </span>
      ))}
      {resto > 0 && (
        <span className="gcal-equipe-avatar gcal-equipe-resto" title={`+${resto}`}>
          +{resto}
        </span>
      )}
    </div>
  );
}

function EventoCard({ ag }) {
  const cor = STATUS_CORES[ag.status] || "#888";
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

      <EquipeAvatares equipe={ag.equipe_info} />

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
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro("");

    const params = new URLSearchParams();
    if (buscaDebounced) {
      params.set("q", buscaDebounced);
    } else {
      const hoje = todayISO();
      params.set("data_inicio", hoje);
      if (filtro === "hoje")   params.set("data_fim", hoje);
      if (filtro === "semana") params.set("data_fim", addDaysISO(hoje, 7));
      if (filtro === "mes")    params.set("data_fim", addDaysISO(hoje, 30));
    }
    if (tipoFiltro !== "todos") params.set("tipo", tipoFiltro);

    api
      .get(`/agendamentos?${params.toString()}`)
      .then((data) => ativo && setAgendamentos(data.agendamentos || []))
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setLoading(false));

    return () => { ativo = false; };
  }, [filtro, tipoFiltro, buscaDebounced]);

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

        {/* Busca */}
        <div className="search-bar">
          <FiSearch className="search-bar-icon" />
          <input
            type="text"
            className="search-bar-input"
            placeholder="Buscar por título, cliente ou pedido..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button
              type="button"
              className="search-bar-clear"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
            >
              <FiX />
            </button>
          )}
        </div>

        {/* Chips de tipo */}
        <div className="field-filter">
          {TIPOS.map((t) => (
            <button
              key={t}
              className={`filter-chip${tipoFiltro === t ? " active" : ""}`}
              onClick={() => setTipoFiltro(t)}
            >
              {t === "todos" ? "Todos os tipos" : t}
            </button>
          ))}
        </div>

        {/* Filtros de data (ocultos durante busca) */}
        {!buscaDebounced && (
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
        )}

        {loading && <div className="spinner-wrap"><span className="spinner" /> Carregando...</div>}
        {erro && <div className="banner banner-danger">{erro}</div>}

        {!loading && !erro && agendamentos.length === 0 && (
          <div className="empty-state">
            {buscaDebounced
              ? `Nenhum resultado para "${buscaDebounced}".`
              : "Nenhum agendamento encontrado."}
          </div>
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
