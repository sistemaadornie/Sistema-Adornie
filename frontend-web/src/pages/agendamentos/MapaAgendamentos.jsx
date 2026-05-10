import { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../../services/api";
import { faixaHora } from "../../utils/horario";
import {
  runSmartEngine,
  ENGINE_CONFIG,
} from "../../utils/smartRoutingEngine";
import InicializacaoDia, { CREW_PALETTE } from "./InicializacaoDia";
import "./MapaAgendamentos.css";

// ── Fix Leaflet default icons ────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Icon factories ───────────────────────────────────────
function markerIcon(color, label, selected = false) {
  const size = selected ? 32 : 27;
  const pulse = selected
    ? `<div class="mp-ring" style="
        position:absolute;inset:-8px;border-radius:50%;
        background:${color};
      "></div>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      ${pulse}
      <div style="
        position:relative;
        background:${color};
        width:${size}px;height:${size}px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:${Math.round(size * 0.38)}px;font-weight:800;color:#000;
        border:2px solid rgba(255,255,255,0.25);
        box-shadow:0 0 ${selected ? 14 : 8}px ${color}88,0 2px 6px rgba(0,0,0,0.5);
        font-family:inherit;
      ">${label}</div>
    </div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

function startIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:20px;height:20px;border-radius:5px;
      background:rgba(0,0,0,0.8);
      border:2px solid ${color};
      display:flex;align-items:center;justify-content:center;
      font-size:11px;
      box-shadow:0 0 8px ${color}66;
    ">🚗</div>`,
    iconSize:    [20, 20],
    iconAnchor:  [10, 10],
    popupAnchor: [0, -10],
  });
}

// ── MiniCalendario ───────────────────────────────────────
const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DIAS_ABR  = ["D","S","T","Q","Q","S","S"];
const STATUS_COR_MINI = {
  agendado: "#3b82f6", andamento: "#eab308", concluido: "#22c55e",
  nao_concluido: "#f97316", cancelado: "#ef4444", atrasado: "#ef4444",
};

export function MiniCalendario({ dataSelecionada, todosAgendamentos = [], onChange }) {
  const hoje = new Date();
  const [viewAno, setViewAno] = useState(dataSelecionada.getFullYear());
  const [viewMes, setViewMes] = useState(dataSelecionada.getMonth());

  function navMes(dir) {
    let m = viewMes + dir, a = viewAno;
    if (m > 11) { m = 0; a++; }
    if (m < 0)  { m = 11; a--; }
    setViewMes(m); setViewAno(a);
  }

  const primeiroDia = new Date(viewAno, viewMes, 1).getDay();
  const totalDias   = new Date(viewAno, viewMes + 1, 0).getDate();

  const agsPorDia = {};
  todosAgendamentos.forEach((ag) => {
    if (!agsPorDia[ag.data]) agsPorDia[ag.data] = [];
    agsPorDia[ag.data].push(ag.status);
  });

  function toISO(dia) {
    return `${viewAno}-${String(viewMes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const selISO  = dataSelecionada
    ? `${dataSelecionada.getFullYear()}-${pad(dataSelecionada.getMonth()+1)}-${pad(dataSelecionada.getDate())}`
    : null;
  const hojeISO = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;

  const cells = [];
  for (let i = 0; i < primeiroDia; i++) cells.push(null);
  for (let d = 1; d <= totalDias; d++) cells.push(d);

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => navMes(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 16, padding: "2px 6px" }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>{MESES_ABR[viewMes]} {viewAno}</span>
        <button onClick={() => navMes(1)}  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 16, padding: "2px 6px" }}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DIAS_ABR.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((dia, i) => {
          if (!dia) return <div key={`e${i}`} />;
          const iso      = toISO(dia);
          const isHoje   = iso === hojeISO;
          const isSel    = iso === selISO;
          const statuses = agsPorDia[iso] || [];
          const temAgs   = statuses.length > 0;
          const dotColor = temAgs
            ? STATUS_COR_MINI[statuses.find((s) => s === "andamento") ?? statuses[0]] ?? "#3b82f6"
            : null;
          return (
            <div
              key={iso}
              onClick={() => onChange(new Date(viewAno, viewMes, dia))}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 2, aspectRatio: "1", borderRadius: 6, cursor: "pointer",
                background: isSel ? "var(--color-primary)" : isHoje ? "color-mix(in srgb, var(--color-primary) 15%, transparent)" : "transparent",
                border: isHoje && !isSel ? "1px solid var(--color-primary)" : "1px solid transparent",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: isSel || isHoje ? 700 : 400, color: isSel ? "#fff" : isHoje ? "var(--color-primary)" : "var(--color-text)", lineHeight: 1 }}>
                {dia}
              </span>
              {temAgs && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: isSel ? "#fff" : dotColor, flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtData(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const TYPE_LABEL = { direct: "Direto", delay: "Atraso tolerável", reschedule: "Reagendamento" };


// ── Componente de voo suave no mapa ──────────────────────
function MapFly({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target?.lat && target?.lng) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 1.1,
      });
    }
  }, [target, map]);
  return null;
}

// ── Busca geometria real de rota via OSRM ────────────────
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
      legs:     route.legs.map((l) => Math.round(l.distance / 10) / 100), // km por trecho
    };
  } catch {
    return null;
  }
}

export default function MapaAgendamentos() {
  const [data,          setData]         = useState(todayStr);
  const [crews,         setCrews]        = useState([]);
  const [equipe,        setEquipe]       = useState([]);
  const [veiculos,      setVeiculos]     = useState([]);
  const [agendamentos,  setAgendamentos] = useState([]);
  const [pontos,        setPontos]       = useState({});
  const [loading,       setLoading]      = useState(true);
  const [erro,          setErro]         = useState(null);
  const [engineResult,  setEngineResult] = useState(null);
  const [runningEngine, setRunningEngine]= useState(false);
  const [selectedAg,    setSelectedAg]   = useState(null);
  const [highlightSug,  setHighlightSug] = useState(null);
  const [leftOpen,      setLeftOpen]     = useState(true);
  const [rightOpen,     setRightOpen]    = useState(true);
  const [modalInit,     setModalInit]    = useState(false);
  const [aceitando,     setAceitando]    = useState(null);
  const [geocodificando,   setGeocodificando]   = useState(false);
  const [geocodTotal,      setGeocodTotal]      = useState(0);
  const [routeGeometries,  setRouteGeometries]  = useState({}); // { [crewId]: [[lat,lng],...] }
  const [routeDistKm,      setRouteDistKm]      = useState({}); // { [crewId]: km }

  // ── Carrega dados ──────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setEngineResult(null);
    setSelectedAg(null);
    try {
      const [crewRes, eqRes, vRes, agRes] = await Promise.all([
        api.get(`/crews?data=${data}`),
        api.get("/agendamentos/equipe"),
        api.get("/veiculos"),
        api.get(`/agendamentos?data_inicio=${data}&data_fim=${data}`),
      ]);

      const crewsData = crewRes.crews || [];
      setCrews(crewsData);
      setEquipe(eqRes.equipe || []);
      setVeiculos(vRes.veiculos || []);
      setAgendamentos(agRes.agendamentos || []);

      const pontosMap = {};
      await Promise.all(
        crewsData
          .filter((c) => c.veiculo?.id)
          .map(async (c) => {
            try {
              // 1. Ponto configurado para o dia específico
              const r = await api.get(
                `/crews/pontos-partida?veiculo_id=${c.veiculo.id}&data=${data}`
              );
              if (r.ponto?.lat && r.ponto?.lng) {
                pontosMap[c.id] = { lat: r.ponto.lat, lng: r.ponto.lng, label: r.ponto.label };
                return;
              }

              // 2. Fallback: primeiro endereço padrão do veículo que tenha coordenadas
              const ep = await api.get(`/crews/pontos-partida/padrao?veiculo_id=${c.veiculo.id}`);
              const comCoords = (ep.enderecos || []).find((e) => e.lat && e.lng);
              if (comCoords) {
                pontosMap[c.id] = { lat: comCoords.lat, lng: comCoords.lng, label: comCoords.label };
              }
            } catch { /* ponto não configurado */ }
          })
      );
      setPontos(pontosMap);
    } catch (err) {
      setErro(err.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Roda o engine ──────────────────────────────────────
  const analisar = useCallback(async () => {
    if (!crews.length) return;
    setRunningEngine(true);
    // aguarda próximo frame para o React renderizar o estado de loading
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t0 = performance.now();
    try {
      const teams = crews.map((c) => ({
        id: c.id,
        membros: c.membros.map((m) => m.usuario_id),
        pontoPartida: pontos[c.id] ?? null,
      }));
      const allAgs = crews.flatMap((c) =>
        c.agendamentos.map((ag) => ({
          ...ag,
          equipe: c.membros.map((m) => m.usuario_id),
        }))
      );
      const result = runSmartEngine(teams, allAgs);
      // tempo mínimo de animação para feedback visual
      const elapsed = performance.now() - t0;
      if (elapsed < 900) await new Promise((r) => setTimeout(r, 900 - elapsed));
      setEngineResult(result);

      // busca geometria real e distância exata de cada equipe via OSRM
      const geoms = {}, dists = {};
      await Promise.all(
        crews.map(async (crew) => {
          const route      = result.optimizedRoutes?.[crew.id];
          const orderedSts = route?.stops ?? crew.agendamentos;
          const origin     = pontos[crew.id];
          const waypoints  = [
            ...(origin ? [origin] : []),
            ...orderedSts.filter((s) => s.lat && s.lng),
            ...(origin ? [origin] : []), // retorno ao ponto de partida ao final do dia
          ];
          const osrm = await fetchOsrmRoute(waypoints);
          if (osrm) {
            geoms[crew.id] = osrm.geometry;
            dists[crew.id] = osrm.distKm;
            if (crew.veiculo?.id && osrm.distKm > 0) {
              api.post(`/veiculos/${crew.veiculo.id}/km-rota`, { km_dia: osrm.distKm }).catch(() => {});
            }
            // Salva km estimado por agendamento (legs[i] = trecho do waypoint i até o i+1)
            // Com ponto de origem: legs[0] = origem→stop0, legs[1] = stop0→stop1, etc.
            if (osrm.legs?.length > 0) {
              const temOrigem = !!origin;
              orderedSts.filter((s) => s.lat && s.lng).forEach((ag, i) => {
                const legIdx = temOrigem ? i : i - 1;
                const km = legIdx >= 0 ? (osrm.legs[legIdx] ?? 0) : 0;
                if (km > 0) {
                  api.patch(`/agendamentos/${ag.id}/km-rota`, { km_rota: km }).catch(() => {});
                }
              });
            }
          }
        })
      );
      setRouteGeometries(geoms);
      setRouteDistKm(dists);
    } finally {
      setRunningEngine(false);
    }
  }, [crews, pontos]);

  // ── Geocodifica agendamentos sem coordenadas ────────────
  const geocodificar = useCallback(async () => {
    setGeocodificando(true);
    setGeocodTotal(0);
    try {
      const res = await api.post("/agendamentos/geocodificar");
      if (res.total === 0) { setGeocodificando(false); return; }
      setGeocodTotal(res.total);

      // Polling com timeout de 3 minutos para evitar loop eterno
      const TIMEOUT_MS   = 3 * 60 * 1000;
      const iniciado     = Date.now();
      const poll = setInterval(async () => {
        try {
          const status = await api.get(`/agendamentos/coords-status?data=${data}`);
          const elapsed = Date.now() - iniciado;
          if (status.sem_coords === 0 || elapsed >= TIMEOUT_MS) {
            clearInterval(poll);
            setGeocodificando(false);
            setGeocodTotal(0);
            await carregar();
          }
        } catch { /* ignora erro pontual no poll */ }
      }, 4000);
    } catch (err) {
      setErro(err.message || "Erro ao geocodificar.");
      setGeocodificando(false);
    }
  }, [carregar, data]);

  useEffect(() => {
    if (!loading && crews.length && !geocodificando) analisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Aceitar sugestão ───────────────────────────────────
  async function aceitar(sug) {
    setAceitando(sug.id);
    try {
      const src  = crews.find((c) => c.id === sug.sourceTeam);
      const dst  = crews.find((c) => c.id === sug.suggestedTeam);
      if (!src || !dst) return;
      await Promise.all([
        api.put(`/crews/${src.id}`, {
          agendamento_ids: src.agendamentos.map((a) => a.id).filter((id) => id !== sug.appointmentToMove),
        }),
        api.put(`/crews/${dst.id}`, {
          agendamento_ids: [...dst.agendamentos.map((a) => a.id), sug.appointmentToMove],
        }),
      ]);
      await carregar();
      setHighlightSug(null);
    } catch (err) {
      setErro(err.message || "Erro ao aceitar sugestão.");
    } finally {
      setAceitando(null);
    }
  }

  // ── Derived ────────────────────────────────────────────
  const metrics = engineResult?.metrics ?? null;
  const suggestions = engineResult?.suggestions ?? [];

  const agsComCrew = new Set(crews.flatMap((c) => c.agendamentos.map((a) => a.id)));
  const agsSemCrew = agendamentos.filter((a) => !agsComCrew.has(a.id));

  // Todos os agendamentos do dia (com e sem crew) que ainda não têm coordenadas
  const todosAgs = [...crews.flatMap((c) => c.agendamentos), ...agsSemCrew];
  const semCoordsList = todosAgs.filter((a) => !a.lat || !a.lng);
  const semCoordsCount = semCoordsList.length;
  // Separa os que falharam definitivamente dos que ainda não tentaram
  const geocodFalhou = semCoordsList.filter((a) => a.geocod_falhou);

  const semCoordsRef = useRef(semCoordsCount);
  semCoordsRef.current = semCoordsCount;

  // Map center
  const allCoords = [
    ...Object.values(pontos).map((p) => [p.lat, p.lng]),
    ...crews.flatMap((c) => c.agendamentos.filter((a) => a.lat && a.lng).map((a) => [a.lat, a.lng])),
  ];
  const center = allCoords.length
    ? [
        allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length,
        allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length,
      ]
    : [-15.7801, -47.9292];

  // Find selectedAg crew info + simStop
  const selectedCrewIdx = selectedAg
    ? crews.findIndex((c) => c.agendamentos.some((a) => a.id === selectedAg.id))
    : -1;
  const selectedColor = selectedCrewIdx >= 0 ? CREW_PALETTE[selectedCrewIdx % CREW_PALETTE.length] : "#38bdf8";
  const selectedCrew  = selectedCrewIdx >= 0 ? crews[selectedCrewIdx] : null;
  const selectedSim   = selectedAg && engineResult
    ? engineResult.optimizedRoutes?.[selectedCrew?.id]?.simulation?.stops?.find((s) => s.id === selectedAg.id)
    : null;

  return (
    <div className="mapa-page">

      {/* ── LEAFLET MAP ─────────────────────────────────── */}
      {!loading && (
        <MapContainer
          center={center}
          zoom={13}
          className="mapa-leaflet"
          zoomControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomControl position="bottomright" />
          <MapFly target={selectedAg} />

          {/* Dark tiles */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
          />

          {crews.map((crew, idx) => {
            const color      = CREW_PALETTE[idx % CREW_PALETTE.length];
            const route      = engineResult?.optimizedRoutes?.[crew.id];
            const orderedSts = route?.stops ?? crew.agendamentos;
            const simStops   = route?.simulation?.stops ?? [];
            const origin     = pontos[crew.id];
            const isActive   = !selectedAg || crew.agendamentos.some((a) => a.id === selectedAg?.id);

            // Build polyline points
            const pts = [
              ...(origin ? [[origin.lat, origin.lng]] : []),
              ...orderedSts.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng]),
            ];

            return (
              <span key={crew.id}>
                {/* Departure point */}
                {origin && (
                  <Marker
                    position={[origin.lat, origin.lng]}
                    icon={startIcon(color)}
                    opacity={isActive ? 1 : 0.2}
                  >
                    <Popup>
                      <strong style={{ color }}>{crew.nome}</strong>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>
                        Ponto de partida{origin.label ? ` — ${origin.label}` : ""}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Appointment markers */}
                {orderedSts
                  .filter((ag) => ag.lat && ag.lng)
                  .map((ag, i) => {
                    const isSelected = selectedAg?.id === ag.id;
                    const simSt = simStops.find((s) => s.id === ag.id);
                    return (
                      <Marker
                        key={ag.id}
                        position={[ag.lat, ag.lng]}
                        icon={markerIcon(color, i + 1, isSelected)}
                        opacity={isActive ? 1 : 0.18}
                        eventHandlers={{
                          click: () => setSelectedAg(isSelected ? null : { ...ag, _simStop: simSt }),
                        }}
                      >
                        <Popup>
                          <div style={{ minWidth: 170 }}>
                            <div style={{ fontWeight: 700, color, marginBottom: 4, fontSize: 13 }}>
                              {ag.titulo || ag.cliente}
                            </div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                              🕐 {faixaHora(ag.hora, ag.duracao_minutos)}
                            </div>
                            {ag.endereco && (
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                                📍 {ag.endereco}
                              </div>
                            )}
                            {simSt && (
                              <div style={{
                                marginTop: 8, paddingTop: 6,
                                borderTop: "1px solid rgba(255,255,255,0.07)",
                                fontSize: 12,
                              }}>
                                {simSt.travelMin > 0 && (
                                  <div style={{ color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>
                                    🚗 {simSt.travelMin} min de deslocamento
                                  </div>
                                )}
                                <span style={{ color: "rgba(255,255,255,0.4)" }}>Chegada </span>
                                <strong style={{ color: simSt.delay === 0 ? "#4ade80" : simSt.delayOk ? "#fbbf24" : "#fb7185" }}>
                                  {simSt.eta}
                                </strong>
                                {simSt.delay > 0 && (
                                  <span style={{ color: simSt.delayOk ? "#fbbf24" : "#fb7185", marginLeft: 6 }}>
                                    +{simSt.delay}min
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                {/* Rota real (OSRM) com efeito direcional animado */}
                {(() => {
                  const routePts = routeGeometries[crew.id] ?? (pts.length > 1 ? pts : null);
                  if (!routePts) return null;
                  const activeOpacity = isActive ? 1 : 0.12;
                  return (
                    <>
                      {/* Brilho de fundo */}
                      <Polyline positions={routePts} pathOptions={{ color, weight: 12, opacity: isActive ? 0.14 : 0.03 }} />
                      {/* Linha sólida principal */}
                      <Polyline positions={routePts} pathOptions={{ color, weight: 4, opacity: activeOpacity * 0.85 }} />
                      {/* Setas animadas de direção */}
                      <Polyline
                        positions={routePts}
                        pathOptions={{
                          color,
                          weight: 4,
                          opacity: activeOpacity,
                          dashArray: "1 18",
                          dashOffset: "0",
                          className: `mapa-route-flow mapa-route-flow-${idx}`,
                        }}
                      />
                    </>
                  );
                })()}

                {/* Suggestion highlight overlay */}
                {highlightSug && suggestions
                  .filter((s) => s.id === highlightSug && s.affectedAppointments.some((id) =>
                    crew.agendamentos.some((a) => a.id === id)
                  ))
                  .map((s) => {
                    const ag = crew.agendamentos.find((a) => a.id === s.appointmentToMove);
                    if (!ag?.lat || !ag?.lng) return null;
                    return (
                      <Marker
                        key={`hl-${s.id}`}
                        position={[ag.lat, ag.lng]}
                        icon={markerIcon("#c084fc", "!", true)}
                      >
                        <Popup>
                          <div style={{ minWidth: 160 }}>
                            <strong style={{ color: "#c084fc" }}>Sugestão: {TYPE_LABEL[s.type]}</strong>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                              Mover para {crews.find((c) => c.id === s.suggestedTeam)?.nome}
                            </div>
                            {s.suggestedTime && (
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                                Horário sugerido: {s.suggestedTime}
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
              </span>
            );
          })}
        </MapContainer>
      )}

      {/* Analyzing overlay */}
      {runningEngine && (
        <div className="mapa-analyzing-overlay">
          <div className="mapa-scan-line" />
          <div className="mapa-radar-center">
            <div className="mapa-radar-ring" />
            <div className="mapa-radar-ring" />
            <div className="mapa-radar-ring" />
            <div className="mapa-radar-dot" />
          </div>
          <div className="mapa-analyzing-label">
            <div className="mapa-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
            Analisando rotas…
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 900,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(6,8,16,0.92)", gap: 12, color: "rgba(255,255,255,0.4)", fontSize: 13,
        }}>
          <div className="mapa-spinner" />
          Carregando…
        </div>
      )}

      {/* ── TOP BAR ───────────────────────────────────── */}
      <div className="mapa-topbar mg">
        <span className="mapa-topbar-title">Rotas</span>

        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />

        <button className="mapa-btn" onClick={() => setModalInit(true)}>
          {crews.length ? "Editar equipes" : "Inicializar dia"}
        </button>

        <button
          className={`mapa-btn primary${runningEngine ? " analyzing" : ""}`}
          onClick={analisar}
          disabled={runningEngine || !crews.length}
        >
          {runningEngine
            ? <><div className="mapa-spinner" style={{ width: 12, height: 12, borderWidth: 1.5, display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />Analisando…</>
            : "Analisar"}
        </button>

        {metrics && (
          <>
            <div className="mapa-divider" />
            <div className="mapa-topbar-metrics">
              <span className="mapa-metric">📍 {metrics.appointmentsRouted}</span>
              <span className="mapa-metric">
                🚗 {Object.values(routeDistKm).length
                  ? `${Object.values(routeDistKm).reduce((s, v) => s + v, 0).toFixed(1)} km`
                  : `${metrics.totalKm} km`}
              </span>
              {metrics.totalDelayMin > 0 ? (
                <span className={`mapa-metric ${metrics.feasible ? "warn" : "danger"}`}>
                  ⏱ {metrics.totalDelayMin} min
                </span>
              ) : (
                <span className="mapa-metric ok">✓ Sem atraso</span>
              )}
              {suggestions.length > 0 && (
                <span className="mapa-metric" style={{ color: "#c084fc" }}>
                  💡 {suggestions.length} sugestão{suggestions.length !== 1 ? "ões" : ""}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Erro bar */}
      {erro && !loading && (
        <div className="mapa-erro-bar mg">
          ⚠ {erro}
          <button
            className="mapa-btn"
            style={{ padding: "3px 10px", fontSize: 11 }}
            onClick={carregar}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Aviso de geocodificação — exibido sempre que há agendamentos sem coords */}
      {semCoordsCount > 0 && !loading && (
        <div style={{
          position: "absolute", top: 64, left: "50%", transform: "translateX(-50%)",
          zIndex: 1001, maxWidth: 480, width: "calc(100% - 40px)",
          background: geocodFalhou.length > 0
            ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
          border: `1px solid ${geocodFalhou.length > 0 ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`,
          borderRadius: 10, padding: "10px 14px", backdropFilter: "blur(8px)",
        }}>
          {/* Cabeçalho */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: geocodFalhou.length > 0 ? "#ef4444" : "#f59e0b" }}>
              {geocodFalhou.length > 0
                ? `⛔ ${geocodFalhou.length} endereço${geocodFalhou.length > 1 ? "s" : ""} não localizado${geocodFalhou.length > 1 ? "s" : ""} — verifique os dados`
                : `⚠ ${semCoordsCount} agendamento${semCoordsCount > 1 ? "s" : ""} sem coordenadas`}
            </span>
            {!geocodFalhou.length && (
              <button
                onClick={geocodificar}
                disabled={geocodificando}
                style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 12, flexShrink: 0,
                  background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.5)",
                  color: "#f59e0b", cursor: geocodificando ? "not-allowed" : "pointer",
                  fontFamily: "inherit", opacity: geocodificando ? 0.6 : 1,
                }}
              >
                {geocodificando
                  ? <><div className="mapa-spinner" style={{ width: 10, height: 10, borderWidth: 1.5, display: "inline-block", marginRight: 4, verticalAlign: "middle", borderTopColor: "#f59e0b" }} />{geocodTotal > 0 ? `${geocodTotal} em background…` : "Iniciando…"}</>
                  : "Tentar geocodificar"}
              </button>
            )}
          </div>

          {/* Lista de agendamentos com falha */}
          {geocodFalhou.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {geocodFalhou.slice(0, 5).map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.4, flex: 1 }}>
                    <strong style={{ color: "#ef4444" }}>{a.titulo || a.cliente}</strong>
                    {" — "}
                    <span style={{ fontStyle: "italic" }}>
                      {[a.rua, a.numero, a.bairro, a.cidade, a.estado].filter(Boolean).join(", ") || "sem endereço cadastrado"}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await api.post(`/agendamentos/${a.id}/geocodificar`);
                        setTimeout(carregar, 3000);
                      } catch { /* silencioso */ }
                    }}
                    style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 8px",
                      borderRadius: 8, background: "rgba(239,68,68,0.15)",
                      border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              ))}
              {geocodFalhou.length > 5 && (
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  + {geocodFalhou.length - 5} mais…
                </div>
              )}
              <div style={{ marginTop: 2, fontSize: 11, color: "rgba(239,68,68,0.7)" }}>
                Se continuar falhando, edite o agendamento e verifique Cidade + Rua.
              </div>
            </div>
          )}

          {/* Geocodificando com spinner */}
          {geocodificando && !geocodFalhou.length && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#f59e0b" }}>
              Localizando endereços automaticamente… isso pode levar alguns segundos.
            </div>
          )}
        </div>
      )}

      {/* ── LEFT PANEL TOGGLE (visible when collapsed) ── */}
      {!leftOpen && (
        <button
          className="mapa-tab mapa-tab-left mg"
          onClick={() => setLeftOpen(true)}
          title="Mostrar equipes"
        >
          ▶
        </button>
      )}

      {/* ── LEFT PANEL — Equipes ─────────────────────── */}
      <div className={`mapa-left mg${leftOpen ? "" : " hidden"}`}>
        <div className="mapa-panel-header">
          <span className="mapa-panel-label">Equipes</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {crews.length > 0 && (
              <span className="mapa-panel-count">{crews.length}</span>
            )}
            <button
              className="mapa-btn"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={() => setLeftOpen(false)}
              title="Recolher"
            >
              ◀
            </button>
          </div>
        </div>

        <div className="mapa-panel-body">
          {!crews.length ? (
            <div className="mapa-empty">
              Nenhuma equipe para {fmtData(data)}.
              <br />
              <button
                className="mapa-btn primary"
                style={{ marginTop: 12, fontSize: 11 }}
                onClick={() => setModalInit(true)}
              >
                Inicializar dia
              </button>
            </div>
          ) : (
            crews.map((crew, idx) => {
              const color  = CREW_PALETTE[idx % CREW_PALETTE.length];
              const route  = engineResult?.optimizedRoutes?.[crew.id];
              const delay  = route?.simulation?.totalDelayMin ?? 0;
              const feasible = route?.simulation?.feasible ?? true;
              const badgeCls = !feasible ? "danger" : delay > ENGINE_CONFIG.IDEAL_DELAY_MIN ? "warn" : "ok";
              const badgeTxt = !feasible ? `${delay}min!` : delay > 0 ? `+${delay}min` : "OK";
              const isActive = selectedAg
                ? crew.agendamentos.some((a) => a.id === selectedAg.id)
                : true;
              const orderedSts = route?.stops ?? crew.agendamentos;
              const simStops   = route?.simulation?.stops ?? [];

              return (
                <div key={crew.id}>
                  <div
                    className={`mapa-crew-card${isActive && selectedAg ? " active" : ""}`}
                    style={{ borderLeft: `2px solid ${isActive ? color : "transparent"}` }}
                    onClick={() => setSelectedAg(null)}
                  >
                    <div className="mapa-crew-header">
                      <span className="mapa-crew-dot" style={{ background: color, boxShadow: `0 0 6px ${color}88` }} />
                      <span className="mapa-crew-nome">{crew.nome}</span>
                      <span className={`mapa-crew-badge ${badgeCls}`}>{badgeTxt}</span>
                    </div>
                    <div className="mapa-crew-meta" style={{ color }}>
                      {crew.veiculo
                        ? `${crew.veiculo.nome}${crew.veiculo.placa ? ` · ${crew.veiculo.placa}` : ""}`
                        : "Sem veículo"}
                    </div>
                    <div className="mapa-crew-meta">
                      {crew.membros.length
                        ? crew.membros.map((m) => m.nome).join(", ")
                        : "Sem membros"}
                    </div>
                    <div className="mapa-crew-meta">
                      {crew.agendamentos.length} agendamento{crew.agendamentos.length !== 1 ? "s" : ""}
                    </div>
                    {/* Quilometragem real da rota (OSRM) */}
                    <div className="mapa-crew-km" style={{ borderTop: `1px solid ${color}22` }}>
                      <span className="mapa-crew-km-label">Rota do dia</span>
                      <span className="mapa-crew-km-value" style={{ color }}>
                        {routeDistKm[crew.id] != null
                          ? `${routeDistKm[crew.id]} km`
                          : route
                            ? `~${route.simulation.totalKm} km`
                            : "—"}
                      </span>
                      {routeDistKm[crew.id] != null && (
                        <span className="mapa-crew-km-badge">via estrada</span>
                      )}
                    </div>
                  </div>

                  {/* Stop list */}
                  {orderedSts.length > 0 && (
                    <div className="mapa-crew-stops">
                      {orderedSts.map((ag, i) => {
                        const sim = simStops.find((s) => s.id === ag.id);
                        const delayCls = !sim ? "" : sim.delay === 0 ? "ok" : sim.delayOk ? "warn" : "danger";
                        const isSelected = selectedAg?.id === ag.id;
                        return (
                          <div key={ag.id}>
                            {/* Conector de deslocamento entre paradas */}
                            {sim?.travelMin > 0 && i > 0 && (
                              <div className="mapa-travel-connector">
                                <div className="mapa-travel-line" style={{ borderColor: `${color}40` }} />
                                <span className="mapa-travel-badge" style={{ color: `${color}bb`, borderColor: `${color}30`, background: `${color}0d` }}>
                                  🚗 {sim.travelMin} min
                                </span>
                                <div className="mapa-travel-line" style={{ borderColor: `${color}40` }} />
                              </div>
                            )}
                            <div
                              className={`mapa-stop-row${isSelected ? " selected" : ""}`}
                              style={{ cursor: "pointer", borderLeft: isSelected ? `2px solid ${color}` : "2px solid transparent" }}
                              onClick={() => setSelectedAg(isSelected ? null : { ...ag, _simStop: sim })}
                            >
                              <span className="mapa-stop-num" style={{ color }}>{i + 1}</span>
                              <div className="mapa-stop-info">
                                <div className="mapa-stop-title">{ag.hora} {ag.titulo || ag.cliente}</div>
                                {sim && (
                                  <div className="mapa-stop-eta">
                                    Chegada {sim.eta}
                                    {sim.delay > 0 && (
                                      <span className={`mapa-stop-delay ${delayCls}`}> · +{sim.delay}min</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Agendamentos sem crew */}
          {agsSemCrew.length > 0 && (
            <div className="mapa-sem-crew">
              <div className="mapa-sem-crew-header">
                <span>Sem equipe</span>
                <span>{agsSemCrew.length}</span>
              </div>
              {agsSemCrew.map((ag) => (
                <div key={ag.id} className="mapa-sem-crew-item">
                  <strong>{ag.hora}</strong> {ag.titulo || ag.cliente}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL TOGGLE ────────────────────────── */}
      {!rightOpen && (
        <button
          className="mapa-tab mapa-tab-right mg"
          onClick={() => setRightOpen(true)}
          title="Mostrar sugestões"
        >
          ◀
        </button>
      )}

      {/* ── RIGHT PANEL — Sugestões ──────────────────── */}
      <div className={`mapa-right mg${rightOpen ? "" : " hidden"}`}>
        <div className="mapa-panel-header">
          <span className="mapa-panel-label">💡 Sugestões</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {suggestions.length > 0 && (
              <span className="mapa-panel-count" style={{ background: "rgba(191,105,255,.12)", color: "#c084fc" }}>
                {suggestions.length}
              </span>
            )}
            <button
              className="mapa-btn"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={() => setRightOpen(false)}
              title="Recolher"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="mapa-panel-body">
          {runningEngine ? (
            <div className="mapa-sug-running">
              <div className="mapa-spinner" style={{ margin: "0 auto 10px" }} />
              Analisando rotas…
            </div>
          ) : !engineResult ? (
            <div className="mapa-sug-none">
              {!crews.length
                ? "Configure as equipes para ver sugestões."
                : "Clique em Analisar para ver sugestões inteligentes."}
            </div>
          ) : !suggestions.length ? (
            <div className="mapa-sug-none">
              ✓ Rotas bem distribuídas.
              <br />Nenhuma otimização encontrada.
            </div>
          ) : (
            suggestions.map((sug) => {
              const srcCrew  = crews.find((c) => c.id === sug.sourceTeam);
              const dstCrew  = crews.find((c) => c.id === sug.suggestedTeam);
              const agMover  = crews.flatMap((c) => c.agendamentos).find((a) => a.id === sug.appointmentToMove);
              const srcIdx   = crews.findIndex((c) => c.id === sug.sourceTeam);
              const dstIdx   = crews.findIndex((c) => c.id === sug.suggestedTeam);
              const srcColor = CREW_PALETTE[srcIdx % CREW_PALETTE.length];
              const dstColor = CREW_PALETTE[dstIdx % CREW_PALETTE.length];
              const barColor = sug.confidence >= 0.7 ? "#4ade80" : sug.confidence >= 0.5 ? "#fbbf24" : "#fb7185";

              return (
                <div
                  key={sug.id}
                  className={`mapa-sug-card${highlightSug === sug.id ? " highlighted" : ""}`}
                  onClick={() => setHighlightSug(highlightSug === sug.id ? null : sug.id)}
                >
                  <div className={`mapa-sug-type ${sug.type}`}>
                    {TYPE_LABEL[sug.type]}
                  </div>

                  <div className="mapa-sug-desc">
                    Mover{" "}
                    <strong style={{ color: "#e2e8f0" }}>
                      {agMover?.titulo || agMover?.cliente || `#${sug.appointmentToMove}`}
                    </strong>
                    <br />
                    <span style={{ color: srcColor }}>{srcCrew?.nome ?? "?"}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 5px" }}>→</span>
                    <span style={{ color: dstColor }}>{dstCrew?.nome ?? "?"}</span>
                  </div>

                  <div className="mapa-sug-stats">
                    <span>{sug.distanceKm} km</span>
                    {sug.distanceSaved !== 0 && (
                      <span style={{ color: sug.distanceSaved > 0 ? "#4ade80" : "#fb7185" }}>
                        {sug.distanceSaved > 0 ? `−${sug.distanceSaved}km` : `+${Math.abs(sug.distanceSaved)}km`}
                      </span>
                    )}
                    {sug.estimatedDelay > 0 && (
                      <span style={{ color: sug.type === "delay" ? "#fbbf24" : "#fb7185" }}>
                        +{sug.estimatedDelay}min
                      </span>
                    )}
                  </div>

                  {sug.suggestedTime && sug.type !== "direct" && (
                    <div className="mapa-sug-time">
                      Horário sugerido: <strong style={{ color: "#e2e8f0" }}>{sug.suggestedTime}</strong>
                    </div>
                  )}

                  <div className="mapa-sug-bar">
                    <div
                      className="mapa-sug-bar-fill"
                      style={{ width: `${Math.round(sug.confidence * 100)}%`, background: barColor }}
                    />
                  </div>
                  <div className="mapa-sug-pct">Confiança: {Math.round(sug.confidence * 100)}%</div>

                  <div className="mapa-sug-actions">
                    <button
                      className="mapa-sug-btn apply"
                      disabled={!!aceitando}
                      onClick={(e) => { e.stopPropagation(); aceitar(sug); }}
                    >
                      {aceitando === sug.id ? "Aplicando…" : "Aplicar"}
                    </button>
                    <button
                      className="mapa-sug-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHighlightSug(highlightSug === sug.id ? null : sug.id);
                      }}
                    >
                      {highlightSug === sug.id ? "Desfazer" : "Ver no mapa"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── INFO PANEL (slide-up on marker click) ─────── */}
      <div className={`mapa-info mg${selectedAg ? " visible" : ""}`}>
        {selectedAg && (
          <>
            <button className="mapa-info-close" onClick={() => setSelectedAg(null)}>✕</button>

            <div className="mapa-info-header">
              <div
                className="mapa-info-dot"
                style={{ background: selectedColor, boxShadow: `0 0 8px ${selectedColor}` }}
              />
              <div>
                <div className="mapa-info-title">{selectedAg.titulo || selectedAg.cliente}</div>
                <div className="mapa-info-sub">
                  {selectedCrew?.nome}
                  {selectedAg.endereco ? ` · ${selectedAg.endereco}` : ""}
                </div>
              </div>
            </div>

            <div className="mapa-info-grid">
              {/* Horário */}
              <div className="mapa-info-cell">
                <div className="mapa-info-cell-label">Horário</div>
                <div className="mapa-info-cell-value" style={{ fontSize: 16, color: selectedColor }}>
                  {faixaHora(selectedAg.hora, selectedAg.duracao_minutos)}
                </div>
              </div>

              {/* Chegada */}
              <div className="mapa-info-cell">
                <div className="mapa-info-cell-label">Chegada prevista</div>
                {selectedSim ? (
                  <>
                    <div className={`mapa-info-cell-value${selectedSim.delay === 0 ? " ok" : selectedSim.delayOk ? " warn" : " danger"}`}>
                      {selectedSim.eta}
                    </div>
                    <div className="mapa-info-cell-sub">
                      {selectedSim.travelMin > 0 ? `🚗 ${selectedSim.travelMin} min deslocamento` : ""}
                      {selectedSim.delay === 0 ? " · No horário ✓" : ` · +${selectedSim.delay} min atraso`}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mapa-info-cell-value" style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>—</div>
                    <div className="mapa-info-cell-sub">Sem análise</div>
                  </>
                )}
              </div>

              {/* Status */}
              <div className="mapa-info-cell">
                <div className="mapa-info-cell-label">Status</div>
                <div className={`mapa-info-cell-value${
                  selectedAg.status === "concluido" ? " ok"
                  : selectedAg.status === "cancelado" ? " danger"
                  : ""
                }`} style={{ fontSize: 13, textTransform: "capitalize" }}>
                  {selectedAg.status || "agendado"}
                </div>
                {selectedSim?.km > 0 && (
                  <div className="mapa-info-cell-sub">{selectedSim.km} km do anterior</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── MODAL DE INICIALIZAÇÃO ───────────────────── */}
      {modalInit && (
        <InicializacaoDia
          data={data}
          crewsExistentes={crews}
          agendamentos={agendamentos.filter((a) => ["agendado", "iniciado"].includes(a.status))}
          equipe={equipe}
          veiculos={veiculos}
          onClose={() => setModalInit(false)}
          onSalvo={() => { setModalInit(false); carregar(); }}
        />
      )}
    </div>
  );
}
