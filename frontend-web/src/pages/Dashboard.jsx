import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import "./Relatorios.css";
import "./Dashboard.css";

const PERIODOS = [
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "ano", label: "Ano" },
];

const NIVEL_COR = { atrasado: "var(--color-danger)", urgente: "var(--color-warning)", atencao: "var(--color-info)" };
const NIVEL_LABEL = { atrasado: "Atrasado", urgente: "Urgente", atencao: "Atenção" };

const fmtR = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");

function Skeleton() {
  return <div className="rel-skeleton" style={{ height: 90 }} />;
}

function Empty({ children = "Sem dados." }) {
  return <div className="rel-empty">{children}</div>;
}

function KpiDelta({ tipo, texto }) {
  const cls = tipo === "up" ? "up" : tipo === "down" ? "down" : "neutral";
  return <span className={`dash-kpi-delta ${cls}`}>{texto}</span>;
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState("mes");
  const [consultoraId, setConsultoraId] = useState("");
  const [cidade, setCidade] = useState("");

  const [opcoes, setOpcoes] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(true);

  const [modoMapa, setModoMapa] = useState("bairros");
  const [mapa, setMapa] = useState(null);
  const [mapaLoading, setMapaLoading] = useState(true);
  const [regiaoSelecionada, setRegiaoSelecionada] = useState(null);

  const [alertas, setAlertas] = useState(null);
  const [alertasLoading, setAlertasLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard-gestor/filtros").then(setOpcoes).catch(() => setOpcoes({ consultoras: [], cidades: [] }));
  }, []);

  const carregarKpis = useCallback(() => {
    setKpisLoading(true);
    const params = new URLSearchParams({ periodo });
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/kpis?${params}`)
      .then(setKpis)
      .catch(() => setKpis(null))
      .finally(() => setKpisLoading(false));
  }, [periodo, consultoraId, cidade]);

  useEffect(() => { carregarKpis(); }, [carregarKpis]);

  useEffect(() => {
    setMapaLoading(true);
    setRegiaoSelecionada(null);
    const params = new URLSearchParams({ periodo, modo: modoMapa });
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/mapa?${params}`)
      .then(setMapa)
      .catch(() => setMapa(null))
      .finally(() => setMapaLoading(false));
  }, [periodo, consultoraId, cidade, modoMapa]);

  useEffect(() => {
    setAlertasLoading(true);
    const params = new URLSearchParams();
    if (consultoraId) params.set("consultora_id", consultoraId);
    if (cidade) params.set("cidade", cidade);
    api.get(`/dashboard-gestor/alertas?${params}`)
      .then(setAlertas)
      .catch(() => setAlertas(null))
      .finally(() => setAlertasLoading(false));
  }, [consultoraId, cidade]);

  const hasFilters = !!(consultoraId || cidade);
  const limparFiltros = () => { setConsultoraId(""); setCidade(""); };

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

        <select className="ek-select dash-select" value={cidade} onChange={(e) => setCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {(opcoes?.cidades || []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="rel-limpar-filtros" onClick={limparFiltros}>Limpar filtros</button>
        )}
      </div>

      {kpisLoading ? (
        <div className="rel-kpis"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      ) : !kpis ? (
        <Empty>Não foi possível carregar os KPIs.</Empty>
      ) : (
        <div className="rel-kpis">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Faturamento do período</div>
            <div className="rel-kpi-value">{fmtR(kpis.faturamento.valor)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <KpiDelta tipo={kpis.faturamento.deltaPct >= 0 ? "up" : "down"} texto={`${kpis.faturamento.deltaPct >= 0 ? "+" : ""}${kpis.faturamento.deltaPct}%`} />
              <span className="rel-kpi-sub">vs. período anterior</span>
            </div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Pedidos ativos</div>
            <div className="rel-kpi-value">{fmtN(kpis.pedidosAtivos.valor)}</div>
            <div className="rel-kpi-sub">no funil</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Prazos em risco</div>
            <div className="rel-kpi-value">{fmtN(kpis.prazosEmRisco.valor)}</div>
            <div className="rel-kpi-sub">atrasados ou urgentes</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Instalações/semana</div>
            <div className="rel-kpi-value">{fmtN(kpis.instalacoesSemana.valor)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <KpiDelta tipo={kpis.instalacoesSemana.deltaAbs >= 0 ? "up" : "down"} texto={`${kpis.instalacoesSemana.deltaAbs >= 0 ? "+" : ""}${kpis.instalacoesSemana.deltaAbs}`} />
              <span className="rel-kpi-sub">vs. semana passada</span>
            </div>
          </div>
        </div>
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
                {mapa.regioes.map((r) => (
                  <button key={r.id} className="dash-mapa-no" style={{ left: `${r.x}%`, top: `${r.y}%` }} onClick={() => setRegiaoSelecionada(r)}>
                    <span className="dash-mapa-dot" />
                    <span className="dash-mapa-label">{r.nome}</span>
                  </button>
                ))}
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

        <div className="ek-section">
          <div className="ek-section-head">
            <h3>Prazos em risco</h3>
            {alertas && <span className="ek-count-badge">{alertas.total} pedidos</span>}
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {alertasLoading ? <Skeleton /> : !alertas?.alertas?.length ? <Empty>Nenhum pedido em risco com esses filtros.</Empty> : (
              alertas.alertas.map((a, i) => (
                <div key={i} className="dash-alerta-row">
                  <span className="dash-alerta-dot" style={{ background: NIVEL_COR[a.nivel] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{a.numeroPedido}</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.cliente}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{a.cidade} · {a.etapa} · {a.consultora}</div>
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

      <div className="ek-empty"><p>Funil, agenda e consultoras — em breve.</p></div>
    </div>
  );
}
