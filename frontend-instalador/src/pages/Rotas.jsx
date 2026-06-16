import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { FiExternalLink, FiMapPin } from "react-icons/fi";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import { statusLabel, mapsUrl, todayISO, addDaysISO } from "../utils/agendamentos";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const FILTROS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Próximos 7 dias" },
];

export default function Rotas() {
  const [filtro, setFiltro] = useState("hoje");
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro("");

    const hoje = todayISO();
    const dataFim = filtro === "hoje" ? hoje : addDaysISO(hoje, 7);

    api
      .get(`/agendamentos?data_inicio=${hoje}&data_fim=${dataFim}`)
      .then((data) => ativo && setAgendamentos(data.agendamentos || []))
      .catch((err) => ativo && setErro(err.message))
      .finally(() => ativo && setLoading(false));

    return () => { ativo = false; };
  }, [filtro]);

  const comCoords = useMemo(() => agendamentos.filter((a) => a.lat && a.lng), [agendamentos]);
  const semCoords = useMemo(() => agendamentos.filter((a) => !a.lat || !a.lng), [agendamentos]);

  const center = comCoords.length
    ? [Number(comCoords[0].lat), Number(comCoords[0].lng)]
    : [-23.5505, -46.6333];

  return (
    <>
      <TopBar title="Rotas" />
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

        {!loading && !erro && (
          <>
            {comCoords.length > 0 ? (
              <div className="map-container">
                <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
                  <TileLayer url={TILE_DARK} attribution='&copy; OpenStreetMap &copy; CARTO' />
                  {comCoords.map((ag) => (
                    <Marker key={ag.id} position={[Number(ag.lat), Number(ag.lng)]}>
                      <Popup>
                        <strong>{ag.cliente}</strong><br />
                        {ag.hora} · {statusLabel(ag.status)}<br />
                        {ag.endereco || `${ag.cidade || ""} ${ag.estado || ""}`}
                        <div className="popup-actions">
                          <Link to={`/agenda/${ag.id}`}>Detalhes</Link>
                          {mapsUrl(ag) && (
                            <a href={mapsUrl(ag)} target="_blank" rel="noreferrer">Navegar</a>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <div className="empty-state">Nenhum agendamento com localização no período.</div>
            )}

            {semCoords.length > 0 && (
              <>
                <h3 className="section-title">Sem localização no mapa</h3>
                {semCoords.map((ag) => (
                  <Link to={`/agenda/${ag.id}`} key={ag.id} className="list-item">
                    <div className="list-item-top">
                      <div className="list-item-title">{ag.cliente}</div>
                      <span className="list-item-time">{ag.hora}</span>
                    </div>
                    <div className="list-item-meta">
                      <FiMapPin style={{ verticalAlign: "-2px" }} /> {ag.endereco || "Endereço não informado"}
                    </div>
                    {mapsUrl(ag) && (
                      <a
                        href={mapsUrl(ag)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6 }}
                      >
                        <FiExternalLink /> Navegar pelo endereço
                      </a>
                    )}
                  </Link>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
