import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl } from "react-leaflet";
import L from "leaflet";
import { FiChevronLeft, FiChevronRight, FiUsers } from "react-icons/fi";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import { useAuth } from "../context/AuthContext";
import { mapsUrl, todayISO, addDaysISO, formatDateLabel } from "../utils/agendamentos";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ROUTE_COLOR = "var(--color-primary)";

function markerIcon(num) {
  return L.divIcon({
    className: "",
    html: `<div style="
        width:26px;height:26px;border-radius:50%;
        background:${ROUTE_COLOR};
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:800;color:#1a1408;
        border:2px solid rgba(255,255,255,0.3);
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
      ">${num}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });
}

function homeIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:36px;height:42px">
        <div style="
          width:36px;height:36px;border-radius:8px;
          background:#0E0D0B;border:2.5px solid ${ROUTE_COLOR};
          box-shadow:0 2px 8px rgba(0,0,0,0.6);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12L12 3L21 12" stroke="${ROUTE_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 10V20C5 20.55 5.45 21 6 21H9V15H15V21H18C18.55 21 19 20.55 19 20V10" stroke="${ROUTE_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="
          width:0;height:0;margin:0 auto;
          border-left:5px solid transparent;border-right:5px solid transparent;
          border-top:6px solid ${ROUTE_COLOR};
        "></div>
      </div>`,
    iconSize: [36, 42],
    iconAnchor: [18, 42],
    popupAnchor: [0, -44],
  });
}

// ── Busca geometria real da rota pelas ruas (OSRM) ───────
async function fetchOsrmRoute(waypoints) {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    if (data.code !== "Ok") return null;
    const route = data.routes[0];
    return {
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distKm:   Math.round(route.distance / 10) / 100,
    };
  } catch {
    return null;
  }
}

export default function Rotas() {
  const { user } = useAuth();
  const [data,      setData]      = useState(todayISO);
  const [loading,   setLoading]   = useState(true);
  const [erro,      setErro]      = useState("");

  const [crew,          setCrew]          = useState(null);
  const [origem,         setOrigem]        = useState(null);
  const [routeGeom,      setRouteGeom]     = useState(null);
  const [routeDistKm,    setRouteDistKm]   = useState(null);
  const [calculandoRota, setCalculandoRota] = useState(false);

  // ── Carrega a equipe e o ponto de partida do dia selecionado ──
  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setErro("");
    setCrew(null);
    setOrigem(null);

    (async () => {
      try {
        const crewRes = await api.get(`/crews?data=${data}`);
        if (!ativo) return;
        const minhaCrew = (crewRes.crews || []).find((c) =>
          c.membros?.some((m) => m.usuario_id === user?.id)
        ) || null;
        setCrew(minhaCrew);

        if (minhaCrew?.veiculo?.id) {
          try {
            const r = await api.get(`/crews/pontos-partida?veiculo_id=${minhaCrew.veiculo.id}&data=${data}`);
            if (!ativo) return;
            if (r.ponto?.lat && r.ponto?.lng) {
              setOrigem({ lat: r.ponto.lat, lng: r.ponto.lng, label: r.ponto.label });
            } else {
              const ep = await api.get(`/crews/pontos-partida/padrao?veiculo_id=${minhaCrew.veiculo.id}`);
              if (!ativo) return;
              const comCoordsPadrao = (ep.enderecos || []).find((e) => e.lat && e.lng);
              setOrigem(comCoordsPadrao ? { lat: comCoordsPadrao.lat, lng: comCoordsPadrao.lng, label: comCoordsPadrao.label } : null);
            }
          } catch {
            if (ativo) setOrigem(null);
          }
        }
      } catch (err) {
        if (ativo) setErro(err.message || "Erro ao carregar a rota do dia.");
      } finally {
        if (ativo) setLoading(false);
      }
    })();

    return () => { ativo = false; };
  }, [data, user?.id]);

  // ── Paradas do dia, na ordem do horário ──────────────────
  const stops = useMemo(() => {
    if (!crew) return [];
    return [...(crew.agendamentos || [])].sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  }, [crew]);

  const stopsComCoords = useMemo(() => stops.filter((s) => s.lat && s.lng), [stops]);
  const stopsSemCoords = useMemo(() => stops.filter((s) => !s.lat || !s.lng), [stops]);

  const temEquipe = !!crew;

  // ── Busca a rota real pelas ruas (OSRM) quando há paradas ──
  useEffect(() => {
    if (!stopsComCoords.length) { setRouteGeom(null); setRouteDistKm(null); return; }
    let ativo = true;
    setCalculandoRota(true);
    (async () => {
      const waypoints = [
        ...(origem ? [origem] : []),
        ...stopsComCoords,
        ...(origem ? [origem] : []),
      ];
      const osrm = await fetchOsrmRoute(waypoints);
      if (!ativo) return;
      setRouteGeom(osrm?.geometry || null);
      setRouteDistKm(osrm?.distKm ?? null);
      setCalculandoRota(false);
    })();
    return () => { ativo = false; };
  }, [origem, stopsComCoords]);

  const pontosRotaFallback = [
    ...(origem ? [[origem.lat, origem.lng]] : []),
    ...stopsComCoords.map((s) => [s.lat, s.lng]),
    ...(origem ? [[origem.lat, origem.lng]] : []),
  ];

  const center = (() => {
    const coordsList = [
      ...(origem ? [[origem.lat, origem.lng]] : []),
      ...stopsComCoords.map((s) => [s.lat, s.lng]),
    ];
    if (!coordsList.length) return [-23.5505, -46.6333];
    return [
      coordsList.reduce((s, c) => s + c[0], 0) / coordsList.length,
      coordsList.reduce((s, c) => s + c[1], 0) / coordsList.length,
    ];
  })();

  const isHoje = data === todayISO();

  return (
    <>
      <TopBar title="Rotas" />
      <div className="rotas-shell">
        <div className="rotas-filtros">
          <div className="rotas-date-nav">
            <button className="rotas-date-btn" onClick={() => setData((d) => addDaysISO(d, -1))} title="Dia anterior">
              <FiChevronLeft />
            </button>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <button className="rotas-date-btn" onClick={() => setData((d) => addDaysISO(d, 1))} title="Próximo dia">
              <FiChevronRight />
            </button>
            {!isHoje && (
              <button className="filter-chip" onClick={() => setData(todayISO())}>Hoje</button>
            )}
          </div>
          {temEquipe && stopsComCoords.length > 0 && (
            <span className="rotas-resumo">
              🚗 {routeDistKm != null ? `${routeDistKm} km` : calculandoRota ? "calculando…" : "—"}
            </span>
          )}
        </div>

        {loading && <div className="spinner-wrap"><span className="spinner" /> Carregando...</div>}
        {erro && !loading && <div className="banner banner-danger" style={{ margin: "0 16px" }}>{erro}</div>}

        {!loading && !erro && !temEquipe && (
          <div className="rotas-sem-equipe">
            <FiUsers size={28} />
            <strong>Equipe ainda não foi montada</strong>
            <span>Nenhuma equipe foi definida para {formatDateLabel(data).toLowerCase()}. Fale com o operador de agenda para montar a equipe deste dia.</span>
          </div>
        )}

        {!loading && !erro && temEquipe && (
          <>
            <div className="rotas-map-wrap">
              <MapContainer center={center} zoom={12} zoomControl={false} style={{ width: "100%", height: "100%" }}>
                <ZoomControl position="bottomright" />
                <TileLayer url={TILE_DARK} attribution='&copy; OpenStreetMap &copy; CARTO' />

                {origem && (
                  <Marker position={[origem.lat, origem.lng]} icon={homeIcon()} zIndexOffset={500}>
                    <Popup>
                      <strong>🏠 {origem.label || "Ponto de partida"}</strong><br />
                      Início e retorno da rota
                    </Popup>
                  </Marker>
                )}

                {stopsComCoords.map((ag, i) => (
                  <Marker key={ag.id} position={[ag.lat, ag.lng]} icon={markerIcon(i + 1)}>
                    <Popup>
                      <strong>{ag.titulo || ag.cliente}</strong><br />
                      🕐 {ag.hora}<br />
                      {ag.endereco && <>📍 {ag.endereco}<br /></>}
                      <div className="popup-actions">
                        <Link to={`/agenda/${ag.id}`}>Detalhes</Link>
                        {mapsUrl(ag) && (
                          <a href={mapsUrl(ag)} target="_blank" rel="noreferrer">Navegar</a>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {(() => {
                  const positions = routeGeom || (pontosRotaFallback.length > 1 ? pontosRotaFallback : null);
                  if (!positions) return null;
                  return (
                    <>
                      <Polyline positions={positions} pathOptions={{ color: ROUTE_COLOR, weight: 10, opacity: 0.16 }} />
                      <Polyline positions={positions} pathOptions={{ color: ROUTE_COLOR, weight: 4, opacity: 0.85 }} />
                      <Polyline
                        positions={positions}
                        pathOptions={{ color: ROUTE_COLOR, weight: 4, opacity: 0.95, dashArray: "1 18", className: "rotas-route-flow" }}
                      />
                    </>
                  );
                })()}
              </MapContainer>

              {stops.length === 0 && (
                <div className="rotas-map-banner">Equipe montada, mas sem atendimentos para este dia.</div>
              )}
              {stopsSemCoords.length > 0 && (
                <div className="rotas-map-banner" style={{ bottom: 10, top: "auto" }}>
                  {stopsSemCoords.length} atendimento{stopsSemCoords.length > 1 ? "s" : ""} sem localização (fora da rota)
                </div>
              )}
            </div>

            {stops.length > 0 && (() => {
              let numero = 0;
              return (
                <div className="rotas-stops-strip">
                  {origem && <span className="rotas-stop-chip">🏠 {origem.label || "Partida"}</span>}
                  {stops.map((ag) => {
                    const temCoords = ag.lat && ag.lng;
                    if (temCoords) numero += 1;
                    return (
                      <Link key={ag.id} to={`/agenda/${ag.id}`} className="rotas-stop-chip">
                        <strong>{temCoords ? numero : "–"}</strong> {ag.hora} · {ag.titulo || ag.cliente}
                      </Link>
                    );
                  })}
                  {origem && <span className="rotas-stop-chip">🏠 Retorno</span>}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </>
  );
}
