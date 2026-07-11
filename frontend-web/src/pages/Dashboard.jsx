import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import "./Relatorios.css";
import "./Dashboard.css";

const PERIODOS = [
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "ano", label: "Ano" },
];

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

      <div className="ek-empty"><p>Mapa, funil, alertas, agenda e consultoras — em breve.</p></div>
    </div>
  );
}
