import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../services/api";
import { CREW_PALETTE } from "../constants/crewPalette";
import "./Relatorios.css";
import "./Dashboard.css";

const PERIODOS = [
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "ano", label: "Ano" },
];

const NIVEL_COR = { atrasado: "var(--color-danger)", urgente: "var(--color-warning)", atencao: "var(--color-info)" };
const NIVEL_LABEL = { atrasado: "Atrasado", urgente: "Urgente", atencao: "Atenção" };
const FUNIL_ICONES = { 1: "📋", 2: "📐", 3: "⚙️", 4: "🔍", 5: "📅", 6: "📦", 7: "🚚", 8: "⭐" };

// ── Tema do mapa (mesmo esquema da tela de Agendamentos) ──
function getTheme() { return document.documentElement.dataset.theme || "dark"; }
const themeListeners = new Set();
if (typeof window !== "undefined") {
  new MutationObserver(() => themeListeners.forEach((fn) => fn())).observe(
    document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }
  );
}
function useMapTheme() {
  return useSyncExternalStore(
    (cb) => { themeListeners.add(cb); return () => themeListeners.delete(cb); },
    getTheme
  );
}
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function regiaoIcon(color, selected) {
  const size = selected ? 24 : 18;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2px solid rgba(255,255,255,0.35);
      box-shadow:0 0 ${selected ? 16 : 10}px ${color}aa, 0 0 ${selected ? 28 : 18}px ${color}55, 0 2px 6px rgba(0,0,0,0.5);
      transition:width .15s,height .15s;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitRegioes({ regioes }) {
  const map = useMap();
  useEffect(() => {
    const pontos = (regioes || []).filter((r) => r.lat && r.lng).map((r) => [r.lat, r.lng]);
    if (pontos.length === 0) return;
    if (pontos.length === 1) { map.setView(pontos[0], 13); return; }
    map.fitBounds(L.latLngBounds(pontos), { padding: [36, 36], maxZoom: 13 });
  }, [regioes, map]);
  return null;
}

const fmtR = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");

function Skeleton({ height = 90 }) {
  return <div className="rel-skeleton" style={{ height }} />;
}

function Empty({ children = "Sem dados." }) {
  return <div className="rel-empty">{children}</div>;
}

function KpiDelta({ tipo, texto }) {
  const cls = tipo === "up" ? "up" : tipo === "down" ? "down" : "neutral";
  return <span className={`dash-kpi-delta ${cls}`}>{texto}</span>;
}

function IconTrendUp({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 6" />
      <polyline points="15 6 21 6 21 12" />
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="13" y2="18" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </svg>
  );
}
function IconAlertTriangle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <line x1="12" y1="9.5" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconRefresh({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.6-4.4M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.4M20 20v-4h-4" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function formatRelativo(date) {
  if (!date) return "agora";
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "agora há pouco";
  if (diffMin === 1) return "há 1 minuto";
  if (diffMin < 60) return `há ${diffMin} minutos`;
  const diffH = Math.floor(diffMin / 60);
  return diffH === 1 ? "há 1 hora" : `há ${diffH} horas`;
}

const DIAS_LETRA = ["D", "S", "T", "Q", "Q", "S", "S"];
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState("mes");
  const [consultoraId, setConsultoraId] = useState("");

  const [opcoes, setOpcoes] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisAtualizadoEm, setKpisAtualizadoEm] = useState(null);
  const [, setTick] = useState(0);

  const [modoMapa, setModoMapa] = useState("bairros");
  const [mapa, setMapa] = useState(null);
  const [mapaLoading, setMapaLoading] = useState(true);
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);

  const [alertas, setAlertas] = useState(null);
  const [alertasLoading, setAlertasLoading] = useState(true);
  const [alertasErro, setAlertasErro] = useState(false);

  const [funil, setFunil] = useState(null);
  const [funilLoading, setFunilLoading] = useState(true);
  const [etapaSelecionada, setEtapaSelecionada] = useState(3);
  const [detalheEtapa, setDetalheEtapa] = useState(null);

  const [agenda, setAgenda] = useState(null);
  const [agendaLoading, setAgendaLoading] = useState(true);

  const [consultoras, setConsultoras] = useState(null);
  const [consultorasLoading, setConsultorasLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard-gestor/filtros").then(setOpcoes).catch(() => setOpcoes({ consultoras: [] }));
  }, []);

  const carregarKpis = useCallback(() => {
    setKpisLoading(true);
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    api.get(`/dashboard-gestor/kpis?${params}`)
      .then((data) => { setKpis(data); setKpisAtualizadoEm(new Date()); })
      .catch(() => setKpis(null))
      .finally(() => setKpisLoading(false));
  }, [periodo, consultoraId]);

  useEffect(() => { carregarKpis(); }, [carregarKpis]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setMapaLoading(true);
    setRegiaoSelecionada(null);
    const params = new URLSearchParams({ periodo, modo: modoMapa });
    if (consultoraId) params.set("consultora_id", consultoraId);
    api.get(`/dashboard-gestor/mapa?${params}`)
      .then(setMapa)
      .catch(() => setMapa(null))
      .finally(() => setMapaLoading(false));
  }, [periodo, consultoraId, modoMapa]);

  const carregarAlertas = useCallback(() => {
    setAlertasLoading(true);
    setAlertasErro(false);
    const params = new URLSearchParams();
    if (consultoraId) params.set("consultora_id", consultoraId);
    api.get(`/dashboard-gestor/alertas?${params}`)
      .then(setAlertas)
      .catch(() => { setAlertas(null); setAlertasErro(true); })
      .finally(() => setAlertasLoading(false));
  }, [consultoraId]);

  useEffect(() => { carregarAlertas(); }, [carregarAlertas]);

  useEffect(() => {
    setFunilLoading(true);
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    api.get(`/dashboard-gestor/funil?${params}`)
      .then(setFunil)
      .catch(() => setFunil(null))
      .finally(() => setFunilLoading(false));
  }, [periodo, consultoraId]);

  useEffect(() => {
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    api.get(`/dashboard-gestor/funil/${etapaSelecionada}?${params}`)
      .then(setDetalheEtapa)
      .catch(() => setDetalheEtapa(null));
  }, [etapaSelecionada, periodo, consultoraId]);

  useEffect(() => {
    setAgendaLoading(true);
    const params = new URLSearchParams();
    if (consultoraId) params.set("consultora_id", consultoraId);
    api.get(`/dashboard-gestor/agenda-semana?${params}`)
      .then(setAgenda)
      .catch(() => setAgenda(null))
      .finally(() => setAgendaLoading(false));
  }, [consultoraId]);

  useEffect(() => {
    setConsultorasLoading(true);
    const params = new URLSearchParams({ periodo });
    api.get(`/dashboard-gestor/consultoras?${params}`)
      .then(setConsultoras)
      .catch(() => setConsultoras(null))
      .finally(() => setConsultorasLoading(false));
  }, [periodo]);

  const semanaInstalacoes = useMemo(() => {
    const hoje = new Date();
    const hojeIso = isoLocal(hoje);
    const porDia = new Map();
    for (const c of agenda?.compromissos || []) {
      if (c.tipo !== "Instalação") continue;
      const iso = isoLocal(new Date(c.data));
      porDia.set(iso, (porDia.get(iso) || 0) + 1);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      const iso = isoLocal(d);
      return { letra: DIAS_LETRA[d.getDay()], count: porDia.get(iso) || 0, hoje: iso === hojeIso };
    });
  }, [agenda]);
  const semanaMax = Math.max(...semanaInstalacoes.map((d) => d.count), 1);

  const hasFilters = !!consultoraId;
  const limparFiltros = () => { setConsultoraId(""); };

  const mapTheme = useMapTheme();
  const tileUrl = mapTheme === "light" ? TILE_LIGHT : TILE_DARK;
  const mapCenter = useMemo(() => [-25.4284, -49.2733], []);

  return (
    <div className="ek-page">
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Dashboard</h1>
          <p>Visão geral do ateliê — pedidos, prazos, agenda e faturamento</p>
        </div>
      </div>

      <div className="dash-filtros">
        <div className="rel-periodo-group">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              className={`rel-periodo-btn${periodo === p.value ? " active" : ""}`}
              onClick={() => setPeriodo(p.value)}
            >{p.label}</button>
          ))}
        </div>

        <select className="ek-select dash-select" value={consultoraId} onChange={(e) => setConsultoraId(e.target.value)}>
          <option value="">Todas as consultoras</option>
          {(opcoes?.consultoras || []).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="rel-limpar-filtros" onClick={limparFiltros}>Limpar filtros</button>
        )}
      </div>

      {kpisLoading ? (
        <div className="rel-kpis dash-kpis"><Skeleton height={188} /><Skeleton height={188} /><Skeleton height={188} /><Skeleton height={188} /></div>
      ) : !kpis ? (
        <Empty>Não foi possível carregar os KPIs.</Empty>
      ) : (
        <>
          <div className="rel-kpis dash-kpis">
            <div className="rel-kpi dash-kpi-card dash-kpi-featured">
              <div className="dash-kpi-icon"><IconTrendUp /></div>
              <div className="rel-kpi-label">Faturamento<br />do período</div>
              <div className="rel-kpi-value">{fmtR(kpis.faturamento.valor)}</div>
              <div className="dash-kpi-divider" />
              <div className="dash-kpi-foot">
                <KpiDelta tipo={kpis.faturamento.deltaPct >= 0 ? "up" : "down"} texto={`${kpis.faturamento.deltaPct >= 0 ? "+" : ""}${kpis.faturamento.deltaPct}%`} />
                <span className="rel-kpi-sub">vs. período anterior</span>
              </div>
            </div>

            <div className="rel-kpi dash-kpi-card">
              <div className="dash-kpi-icon"><IconClipboard /></div>
              <div className="rel-kpi-label">Pedidos<br />ativos</div>
              <div className="rel-kpi-value">{fmtN(kpis.pedidosAtivos.valor)}</div>
              <div className="rel-kpi-sub">no funil</div>
              <button
                type="button"
                className="dash-kpi-pill"
                onClick={() => document.getElementById("dash-funil-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <IconInfo /> Acompanhamento em tempo real
              </button>
            </div>

            <div className="rel-kpi dash-kpi-card">
              <div className="dash-kpi-icon dash-kpi-icon-alert"><IconClock /></div>
              <div className="rel-kpi-label">Prazos em<br />risco</div>
              <div className="rel-kpi-value">{fmtN(kpis.prazosEmRisco.valor)}</div>
              <div className="rel-kpi-sub">atrasados ou urgentes</div>
              {kpis.prazosEmRisco.valor > 0 && (
                <button
                  type="button"
                  className="dash-kpi-alert-box"
                  onClick={() => document.getElementById("dash-prazos-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  <IconAlertTriangle />
                  <div>
                    <strong>Atenção necessária</strong>
                    <p>Esses pedidos precisam de ação imediata.</p>
                  </div>
                </button>
              )}
            </div>

            <div className="rel-kpi dash-kpi-card">
              <div className="dash-kpi-icon"><IconCalendar /></div>
              <div className="rel-kpi-label">Instalações<br />/semana</div>
              <div className="rel-kpi-value">{fmtN(kpis.instalacoesSemana.valor)}</div>
              <div className="dash-kpi-foot">
                <span className={`dash-kpi-badge ${kpis.instalacoesSemana.deltaAbs >= 0 ? "up" : "down"}`}>
                  {kpis.instalacoesSemana.deltaAbs >= 0 ? "+" : ""}{kpis.instalacoesSemana.deltaAbs}
                </span>
                <span className="rel-kpi-sub">vs. semana passada</span>
              </div>
              <div className="dash-kpi-week">
                {semanaInstalacoes.map((d, i) => (
                  <div key={i} className="dash-kpi-week-col">
                    <div
                      className={`dash-kpi-week-bar${d.hoje ? " hoje" : ""}`}
                      style={{ height: `${Math.max(10, Math.round((d.count / semanaMax) * 100))}%` }}
                      title={`${d.count} instalação(ões)`}
                    />
                    <span className="dash-kpi-week-lbl">{d.letra}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dash-kpi-summary">
            <div className="dash-kpi-summary-left">
              <span className="dash-kpi-summary-icon"><IconTrendUp /></span>
              <span>Visão geral do desempenho do período.</span>
            </div>
            <button type="button" className="dash-kpi-summary-refresh" onClick={carregarKpis} disabled={kpisLoading}>
              <IconRefresh className={kpisLoading ? "spin" : ""} /> Atualizado {formatRelativo(kpisAtualizadoEm)}
            </button>
          </div>
        </>
      )}

      <div className="dash-row-2">
        <div className="ek-section">
          <div className="ek-section-head">
            <div>
              <h3>Mapa de clientes</h3>
              <p>Clique numa região para ver o detalhamento</p>
            </div>
            <div className="rel-periodo-group">
              <button className={`rel-periodo-btn${modoMapa === "bairros" ? " active" : ""}`} onClick={() => setModoMapa("bairros")}>Bairros · Curitiba</button>
              <button className={`rel-periodo-btn${modoMapa === "cidades" ? " active" : ""}`} onClick={() => setModoMapa("cidades")}>Cidades</button>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {mapaLoading ? <Skeleton /> : !mapa?.regioes?.length ? <Empty>Nenhum dado com esses filtros.</Empty> : (
              <div className="dash-mapa-canvas">
                <MapContainer
                  center={mapCenter}
                  zoom={12}
                  className="dash-mapa-leaflet"
                  zoomControl={false}
                  style={{ width: "100%", height: "100%" }}
                >
                  <FitRegioes regioes={mapa.regioes} />
                  <TileLayer
                    key={tileUrl}
                    url={tileUrl}
                    attribution='&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    subdomains="abcd"
                    maxZoom={19}
                  />
                  {mapa.regioes.map((r) => {
                    if (!r.lat || !r.lng) return null;
                    const cor = CREW_PALETTE[r.corIndex % CREW_PALETTE.length];
                    const selecionada = regiaoSelecionada?.id === r.id;
                    return (
                      <Marker
                        key={r.id}
                        position={[r.lat, r.lng]}
                        icon={regiaoIcon(cor, selecionada)}
                        eventHandlers={{ click: () => setRegiaoSelecionada(r) }}
                      >
                        <Tooltip permanent direction="bottom" offset={[0, 4]} className="dash-mapa-label">
                          {r.nome}
                        </Tooltip>
                      </Marker>
                    );
                  })}
                </MapContainer>
                {regiaoSelecionada && (
                  <div className="dash-mapa-detalhe" onClick={() => setRegiaoSelecionada(null)}>
                    <div className="dash-mapa-detalhe-card" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div className="rel-section-label">{modoMapa === "bairros" ? "Bairro · Curitiba" : "Cidade"}</div>
                          <div style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 700 }}>{regiaoSelecionada.nome}</div>
                        </div>
                        <button className="ek-action-btn" onClick={() => setRegiaoSelecionada(null)}>×</button>
                      </div>
                      <div className="rel-kpis" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 14 }}>
                        <div className="rel-kpi"><div className="rel-kpi-value">{regiaoSelecionada.clientes}</div><div className="rel-kpi-label">Clientes</div></div>
                        <div className="rel-kpi"><div className="rel-kpi-value">{regiaoSelecionada.pedidosAtivos}</div><div className="rel-kpi-label">Pedidos ativos</div></div>
                        <div className="rel-kpi"><div className="rel-kpi-value">{regiaoSelecionada.atendimentos}</div><div className="rel-kpi-label">Atendimentos</div></div>
                      </div>
                      {regiaoSelecionada.mix.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div className="rel-section-label">Categoria predominante — {regiaoSelecionada.categoriaPredominante}</div>
                          {regiaoSelecionada.mix.map((m) => (
                            <div key={m.categoria} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                              <span>{m.categoria}</span><span>{m.pct}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}>
                        <span className="rel-kpi-label">Faturamento</span>
                        <strong>{fmtR(regiaoSelecionada.faturamento)}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ek-section" id="dash-prazos-section">
          <div className="ek-section-head">
            <h3>Prazos em risco</h3>
            {alertas && <span className="ek-count-badge">{alertas.total} pedidos</span>}
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {alertasLoading ? <Skeleton /> : alertasErro ? (
              <div className="rel-empty">
                Não foi possível carregar os prazos em risco.{" "}
                <button type="button" className="dash-inline-retry" onClick={carregarAlertas}>Tentar novamente</button>
              </div>
            ) : !alertas?.alertas?.length ? <Empty>Nenhum pedido em risco com esses filtros.</Empty> : (
              alertas.alertas.map((a, i) => (
                <div
                  key={i}
                  className="dash-alerta-row"
                  onClick={() => a.pedidoId && navigate(`/pedidos/${a.pedidoId}/fluxo`)}
                >
                  <span className="dash-alerta-dot" style={{ background: NIVEL_COR[a.nivel] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{a.numeroPedido}</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.cliente}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      {a.cidade} · {a.etapa} · <span className="dash-alerta-consultora">{a.consultora}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: NIVEL_COR[a.nivel] }}>
                      {a.diasParaPrazo < 0 ? `${Math.abs(a.diasParaPrazo)}d atraso` : a.diasParaPrazo === 0 ? "hoje" : `em ${a.diasParaPrazo}d`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{NIVEL_LABEL[a.nivel]}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="ek-section" id="dash-funil-section">
        <div className="ek-section-head">
          <div>
            <h3>Funil de Pedidos</h3>
            {funil && <p>{funil.totalAtivos} pedidos ativos · clique numa etapa</p>}
          </div>
        </div>
        <div style={{ padding: 18 }}>
          {funilLoading ? <Skeleton /> : !funil ? <Empty>Não foi possível carregar o funil.</Empty> : (
            <>
              <div className="dash-funil-row">
                {funil.etapas.map((e, i) => {
                  const maxCount = Math.max(...funil.etapas.map((x) => x.count), 1);
                  return (
                    <React.Fragment key={e.numero}>
                      <div
                        className={`dash-funil-card${etapaSelecionada === e.numero ? " selecionada" : ""}`}
                        onClick={() => setEtapaSelecionada(e.numero)}
                      >
                        <div className="dash-funil-header">
                          <span className="dash-funil-num">{e.numero}</span>
                          <span className="dash-funil-titulo">{e.nome}</span>
                          {e.gargalo && <span className="dash-funil-gargalo-badge">gargalo</span>}
                        </div>
                        <div className="dash-funil-body">
                          <div className="dash-funil-icone">{FUNIL_ICONES[e.numero]}</div>
                          <div className="dash-funil-count">{e.count}</div>
                          <div className="dash-funil-track">
                            <div className="dash-funil-fill" style={{ width: `${Math.max(10, Math.round((e.count / maxCount) * 100))}%` }} />
                          </div>
                        </div>
                      </div>
                      {i < funil.etapas.length - 1 && <div className="dash-funil-conector" />}
                    </React.Fragment>
                  );
                })}
              </div>

              {detalheEtapa && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--color-border)", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="dash-funil-num" style={{ background: "#f59e0b", color: "#fff" }}>{detalheEtapa.numero}</span>
                      <div style={{ fontFamily: "var(--font-title)", fontSize: 19, fontWeight: 700 }}>{detalheEtapa.nome}</div>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 10 }}>{detalheEtapa.descricao}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div><div className="rel-section-label">Pedidos nesta etapa</div><div style={{ fontSize: 20, fontWeight: 700 }}>{detalheEtapa.count}</div></div>
                    <div><div className="rel-section-label">Responsável</div><div style={{ fontSize: 14 }}>{detalheEtapa.responsavel}</div></div>
                  </div>
                  <div>
                    <div className="rel-section-label">Exemplos</div>
                    {detalheEtapa.exemplos.length === 0 ? <Empty>Nenhum pedido nessa etapa.</Empty> : detalheEtapa.exemplos.map((x, i) => (
                      <div key={i} style={{ display: "flex", gap: 9, fontSize: 12, marginTop: 6 }}>
                        <strong>{x.numero}</strong><span style={{ color: "var(--color-text-muted)" }}>{x.cliente}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="dash-row-2 dash-row-2-agenda">
        <div className="ek-section">
          <div className="ek-section-head">
            <h3>Agenda da semana</h3>
            <p>Equipes &amp; veículos</p>
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {agendaLoading ? <Skeleton /> : !agenda?.compromissos?.length ? <Empty>Nenhum compromisso com esses filtros.</Empty> : (
              agenda.compromissos.map((c, i) => (
                <div
                  key={i}
                  className="dash-agenda-row dash-agenda-row-clicavel"
                  onClick={() => navigate(`/agendamentos?id=${c.id}&detalhe=1`)}
                >
                  <div className="dash-agenda-hora">
                    <div style={{ fontWeight: 700 }}>{c.hora?.slice(0, 5)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{new Date(c.data).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</div>
                  </div>
                  <span className={`dash-agenda-tipo ${c.tipo === "Instalação" ? "instalacao" : "outro"}`}>{c.tipo}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.cliente}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.local}</div>
                  </div>
                  <div className="dash-agenda-equipe">
                    <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.equipe || "—"}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.veiculo || "—"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="ek-section">
          <div className="ek-section-head">
            <h3>Faturamento por consultora</h3>
            {consultoras && <p>{fmtR(consultoras.totalMes)} no período</p>}
          </div>
          <div style={{ padding: "16px" }}>
            {consultorasLoading ? <Skeleton /> : !consultoras?.consultoras?.length ? <Empty>Nenhuma consultora cadastrada.</Empty> : (
              consultoras.consultoras.map((c) => {
                const max = Math.max(...consultoras.consultoras.map((x) => x.valor), 1);
                const iniciais = c.nome.split(" ").slice(0, 2).map((p) => p[0]).join("");
                return (
                  <div key={c.id} className="dash-consultora-row">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className="dash-consultora-avatar">{iniciais}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <strong style={{ fontSize: 13 }}>{fmtR(c.valor)}</strong>
                        <KpiDelta tipo={c.deltaPct >= 0 ? "up" : "down"} texto={`${c.deltaPct >= 0 ? "+" : ""}${c.deltaPct}%`} />
                      </div>
                    </div>
                    <div className="dash-consultora-track">
                      <div className="dash-consultora-fill" style={{ width: `${Math.round((c.valor / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
