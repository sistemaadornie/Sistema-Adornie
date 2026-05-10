import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import "./Relatorios.css";

/* ── helpers ── */
const fmtR = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtL = (v) => `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L`;
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const STATUS_COR = {
  agendado:      "#3b82f6",
  andamento:     "#eab308",
  concluido:     "#22c55e",
  nao_concluido: "#f97316",
  cancelado:     "#ef4444",
  atrasado:      "#ef4444",
  retorno:       "#a07cff",
};
const STATUS_LABEL = {
  agendado:      "Agendado",
  andamento:     "Em andamento",
  concluido:     "Concluído",
  nao_concluido: "Não concluído",
  cancelado:     "Cancelado",
  atrasado:      "Atrasado",
  retorno:       "Retorno",
};
const CATEGORIA_LABEL = { residencial:"Residencial", comercial:"Comercial", obra:"Obra", outro:"Outro" };
const CATEGORIA_COR   = { residencial:"#3b82f6", comercial:"#a07cff", obra:"#f97316", outro:"#94a3b8" };
const COMB_COR = { gasolina:"#ef4444", etanol:"#22c55e", flex:"#3b82f6", diesel:"#eab308", gnv:"#a07cff", eletrico:"#06d6a0" };

const PERIODOS = [
  { value:"7d",  label:"7 dias" },
  { value:"30d", label:"30 dias" },
  { value:"90d", label:"90 dias" },
  { value:"6m",  label:"6 meses" },
  { value:"1a",  label:"1 ano" },
];

/* ═══════════════════════════════════════════════════
   COMPONENTES VISUAIS REUTILIZÁVEIS
═══════════════════════════════════════════════════ */

function KpiCard({ label, value, sub, cor, icon }) {
  return (
    <div className="rel-kpi" style={{ borderTopColor: cor || "var(--color-primary,#6B4EFF)" }}>
      {icon && <div className="rel-kpi-icon" style={{ color: cor }}>{icon}</div>}
      <div className="rel-kpi-value">{value}</div>
      <div className="rel-kpi-label">{label}</div>
      {sub && <div className="rel-kpi-sub">{sub}</div>}
    </div>
  );
}

function BarraHorizontal({ label, value, max, cor = "#6B4EFF", suffix = "" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="rel-barra-row">
      <div className="rel-barra-label">{label}</div>
      <div className="rel-barra-track">
        <div className="rel-barra-fill" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <div className="rel-barra-val">{fmtN(value)}{suffix}</div>
    </div>
  );
}

function GraficoBarras({ dados, corFn, labelFn, valFn, titulo, height = 160 }) {
  if (!dados?.length) return <Empty />;
  const max = Math.max(...dados.map(valFn), 1);
  return (
    <div className="rel-grafico-barras">
      {titulo && <div className="rel-section-label">{titulo}</div>}
      <div className="rel-barras-wrap" style={{ height }}>
        {dados.map((d, i) => {
          const h = Math.max((valFn(d) / max) * height, 2);
          return (
            <div key={i} className="rel-bar-col">
              <div className="rel-bar-tooltip">{valFn(d)}</div>
              <div
                className="rel-bar"
                style={{ height: h, background: corFn ? corFn(d) : "var(--color-primary,#6B4EFF)" }}
              />
              <div className="rel-bar-lbl">{labelFn(d)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GraficoLinha({ dados, cor = "#22c55e", altura = 100 }) {
  if (!dados?.length) return <Empty />;
  const vals = dados.map((d) => Number(d.total));
  const max = Math.max(...vals, 1);
  const w = 600, h = altura, pad = 8;
  const pts = dados.map((d, i) => {
    const x = pad + (i / (dados.length - 1 || 1)) * (w - pad * 2);
    const y = h - pad - ((Number(d.total) / max) * (h - pad * 2));
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;

  return (
    <div className="rel-linha-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width:"100%", height: altura }}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={cor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lg)" />
        <path d={d} fill="none" stroke={cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill={cor} stroke="#1a1d2e" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="rel-linha-labels">
        {dados.map((d, i) => (
          <span key={i}>{d.mes ? MESES[Number(d.mes.slice(5)) - 1] : d.label}</span>
        ))}
      </div>
    </div>
  );
}

function GraficoLinhaDupla({ dados, altura = 120 }) {
  if (!dados?.length) return <Empty />;
  const totals = dados.map((d) => Number(d.total));
  const concls = dados.map((d) => Number(d.concluidos));
  const max = Math.max(...totals, 1);
  const w = 600, h = altura, pad = 10;

  function makePts(vals) {
    return vals.map((v, i) => [
      pad + (i / (vals.length - 1 || 1)) * (w - pad * 2),
      h - pad - (v / max) * (h - pad * 2),
    ]);
  }

  const ptsT = makePts(totals);
  const ptsC = makePts(concls);
  const dT = ptsT.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const dC = ptsC.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaT = `${dT} L${ptsT.at(-1)[0].toFixed(1)},${h} L${ptsT[0][0].toFixed(1)},${h} Z`;

  return (
    <div className="rel-linha-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: altura }}>
        <defs>
          <linearGradient id="lgT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaT} fill="url(#lgT)" />
        <path d={dT} fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={dC} fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {ptsT.map(([x, y], i) => <circle key={`t${i}`} cx={x} cy={y} r="3" fill="#3b82f6" stroke="#1a1d2e" strokeWidth="1.5" />)}
        {ptsC.map(([x, y], i) => <circle key={`c${i}`} cx={x} cy={y} r="3" fill="#22c55e" stroke="#1a1d2e" strokeWidth="1.5" />)}
      </svg>
      <div className="rel-linha-labels">
        {dados.map((d, i) => <span key={i}>{MESES[Number(d.mes.slice(5)) - 1]}</span>)}
      </div>
      <div className="rel-linha-legenda">
        <span className="rel-linha-leg-item"><em style={{ background: "#3b82f6" }} />Total</span>
        <span className="rel-linha-leg-item"><em style={{ background: "#22c55e" }} />Concluídos</span>
      </div>
    </div>
  );
}

function PizzaSimples({ dados, corFn, labelFn, valFn }) {
  if (!dados?.length) return <Empty />;
  const total = dados.reduce((s, d) => s + valFn(d), 0);
  let acum = 0;
  const fatias = dados.map((d) => {
    const pct = total > 0 ? valFn(d) / total : 0;
    const ini = acum;
    acum += pct;
    return { ...d, pct, ini };
  });

  function fatia(ini, fim) {
    const r = 40, cx = 50, cy = 50;
    const a1 = ini * 2 * Math.PI - Math.PI / 2;
    const a2 = fim * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = fim - ini > 0.5 ? 1 : 0;
    return `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r},0,${large},1,${x2.toFixed(2)},${y2.toFixed(2)} Z`;
  }

  return (
    <div className="rel-pizza-wrap">
      <svg viewBox="0 0 100 100" style={{ width: 120, height: 120, flexShrink: 0 }}>
        {fatias.map((d, i) => (
          <path key={i} d={fatia(d.ini, d.ini + d.pct)} fill={corFn(d)} stroke="#1a1d2e" strokeWidth="0.5" />
        ))}
        <circle cx="50" cy="50" r="22" fill="var(--color-surface)" />
      </svg>
      <div className="rel-pizza-legend">
        {fatias.map((d, i) => (
          <div key={i} className="rel-pizza-item">
            <span className="rel-pizza-dot" style={{ background: corFn(d) }} />
            <span className="rel-pizza-lbl">{labelFn(d)}</span>
            <span className="rel-pizza-pct">{(d.pct * 100).toFixed(1)}%</span>
            <span className="rel-pizza-n">{fmtN(valFn(d))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="rel-empty">Sem dados no período</div>;
}

function Skeleton() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {[1,2,3].map((i) => <div key={i} className="rel-skeleton" />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ABAS
═══════════════════════════════════════════════════ */

/* ── ABA: AGENDAMENTOS ── */
function AbaAgendamentos({ periodo }) {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/relatorios/agendamentos?periodo=${periodo}`)
      .then((r) => setDados(r))
      .catch(() => setDados(null))
      .finally(() => setLoading(false));
  }, [periodo]);

  if (loading) return <Skeleton />;
  if (!dados)  return <Empty />;

  const { kpis, porStatus, porMes, porTipo, porDia } = dados;
  const maxTipo = Math.max(...(porTipo?.map((t) => t.total) || [1]), 1);
  const taxa    = Number(kpis.taxa_conclusao || 0);
  const taxaCor = taxa >= 80 ? "#22c55e" : taxa >= 50 ? "#eab308" : "#ef4444";

  const diasComDados = DIAS_SEMANA.map((lbl, i) => ({
    label: lbl,
    total: porDia?.find((d) => d.dow === i)?.total || 0,
  }));

  const totalMes    = porMes?.reduce((s, m) => s + Number(m.total), 0) || 0;
  const conclusoesMes = porMes?.reduce((s, m) => s + Number(m.concluidos), 0) || 0;

  return (
    <div className="rel-aba-content">

      {/* KPIs — 6 cards */}
      <div className="rel-kpis rel-kpis-6">
        <KpiCard label="Total no período"   value={fmtN(kpis.total)}           cor="#3b82f6" icon="📋" />
        <KpiCard label="Concluídos"         value={fmtN(kpis.concluidos)}      cor="#22c55e" icon="✅" />
        <KpiCard label="Em andamento"       value={fmtN(kpis.em_andamento)}    cor="#eab308" icon="🔄" />
        <KpiCard label="Agendados"          value={fmtN(kpis.agendados)}       cor="#6B4EFF" icon="📅" />
        <KpiCard label="Não concluídos"     value={fmtN(kpis.nao_concluidos)} cor="#f97316" icon="⚠️" />
        <KpiCard label="Cancelados"         value={fmtN(kpis.cancelados)}      cor="#ef4444" icon="❌" />
      </div>

      {/* Taxa de conclusão destacada */}
      <div className="rel-card rel-taxa-wrap">
        <div className="rel-taxa-label">Taxa de conclusão do período</div>
        <div className="rel-taxa-valor" style={{ color: taxaCor }}>{fmtPct(taxa)}</div>
        <div className="rel-taxa-track">
          <div className="rel-taxa-fill" style={{ width: `${Math.min(taxa, 100)}%`, background: taxaCor }} />
        </div>
        <div className="rel-taxa-meta">
          <span>{fmtN(kpis.concluidos)} concluídos de {fmtN(kpis.total)} agendamentos</span>
          <span style={{ color: taxaCor, fontWeight: 700 }}>
            {taxa >= 80 ? "Excelente" : taxa >= 60 ? "Bom" : taxa >= 40 ? "Regular" : "Atenção"}
          </span>
        </div>
      </div>

      {/* Status (pizza) + Tipo (barras com %) */}
      <div className="rel-row-2">
        <div className="rel-card">
          <div className="rel-card-title">Distribuição por status</div>
          {porStatus?.length ? (
            <PizzaSimples
              dados={porStatus}
              valFn={(d) => d.total}
              labelFn={(d) => STATUS_LABEL[d.status] || d.status}
              corFn={(d) => STATUS_COR[d.status] || "#94a3b8"}
            />
          ) : <Empty />}
        </div>

        <div className="rel-card">
          <div className="rel-card-title">Por tipo de serviço</div>
          {porTipo?.length ? (
            <div className="rel-barras">
              {porTipo.slice(0, 8).map((t, i) => (
                <BarraHorizontal
                  key={t.tipo}
                  label={t.tipo}
                  value={t.total}
                  max={maxTipo}
                  cor={["#6B4EFF","#3b82f6","#22c55e","#f97316","#eab308","#a07cff","#ef4444","#06d6a0"][i % 8]}
                  suffix={` · ${((t.total / (kpis.total || 1)) * 100).toFixed(0)}%`}
                />
              ))}
            </div>
          ) : <Empty />}
        </div>
      </div>

      {/* Tendência mensal dupla */}
      <div className="rel-card">
        <div className="rel-card-title">Tendência mensal — últimos 12 meses</div>
        {porMes?.length ? (
          <>
            <GraficoLinhaDupla dados={porMes} altura={130} />
            <div className="rel-linha-meta">
              <span>Total 12 meses</span>
              <strong>{fmtN(totalMes)}</strong>
              <span style={{ marginLeft: 16 }}>Concluídos</span>
              <strong style={{ color: "#22c55e" }}>{fmtN(conclusoesMes)}</strong>
              <span style={{ marginLeft: 16 }}>Taxa média</span>
              <strong style={{ color: taxaCor }}>
                {totalMes > 0 ? ((conclusoesMes / totalMes) * 100).toFixed(1) : "0"}%
              </strong>
            </div>
          </>
        ) : <Empty />}
      </div>

      {/* Por dia da semana */}
      <div className="rel-card">
        <div className="rel-card-title">Volume por dia da semana</div>
        <GraficoBarras
          dados={diasComDados}
          valFn={(d) => d.total}
          labelFn={(d) => d.label}
          corFn={(d) => d.total > 0 ? "#6B4EFF" : "var(--color-border-strong)"}
          height={130}
        />
      </div>

    </div>
  );
}

/* ── ABA: EQUIPE ── */
function AbaEquipe({ periodo }) {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/relatorios/equipe?periodo=${periodo}`)
      .then((r) => setDados(r))
      .catch(() => setDados(null))
      .finally(() => setLoading(false));
  }, [periodo]);

  if (loading) return <Skeleton />;
  if (!dados)  return <Empty />;

  const { kpis, porInstalador } = dados;
  const maxTotal = Math.max(...(porInstalador?.map((i) => i.total) || [1]), 1);

  return (
    <div className="rel-aba-content">

      <div className="rel-kpis">
        <KpiCard label="Instaladores ativos" value={fmtN(kpis.total_instaladores)} cor="#6B4EFF" icon="👷" />
        <KpiCard label="Serviços no período" value={fmtN(kpis.total_servicos)}     cor="#3b82f6" icon="🔧" />
        <KpiCard label="Média por instalador" value={kpis.media_por_instalador || "0"} cor="#22c55e" icon="📊" />
      </div>

      {/* Gráfico de barras por instalador */}
      <div className="rel-card">
        <div className="rel-card-title">Serviços por instalador</div>
        {porInstalador?.length ? (
          <GraficoBarras
            dados={porInstalador.slice(0, 12)}
            valFn={(d) => d.total}
            labelFn={(d) => (d.nome || "").split(" ")[0]}
            corFn={() => "#6B4EFF"}
            height={140}
          />
        ) : <Empty />}
      </div>

      {/* Tabela detalhada */}
      <div className="rel-card">
        <div className="rel-card-title">Desempenho individual</div>
        {porInstalador?.length ? (
          <div className="rel-table-wrap">
            <table className="rel-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Instalador</th>
                  <th>Total</th>
                  <th>Concluídos</th>
                  <th>Não concluídos</th>
                  <th>Cancelados</th>
                  <th>Taxa de conclusão</th>
                  <th>Progresso</th>
                </tr>
              </thead>
              <tbody>
                {porInstalador.map((inst, idx) => (
                  <tr key={inst.id}>
                    <td className="rel-td-muted">{idx + 1}</td>
                    <td><strong>{inst.nome}</strong></td>
                    <td>{fmtN(inst.total)}</td>
                    <td style={{ color:"#22c55e" }}>{fmtN(inst.concluidos)}</td>
                    <td style={{ color:"#f97316" }}>{fmtN(inst.nao_concluidos)}</td>
                    <td style={{ color:"#ef4444" }}>{fmtN(inst.cancelados)}</td>
                    <td>
                      <span className="rel-badge" style={{
                        background: inst.taxa_conclusao >= 80 ? "rgba(34,197,94,.15)" : inst.taxa_conclusao >= 50 ? "rgba(234,179,8,.15)" : "rgba(239,68,68,.15)",
                        color:      inst.taxa_conclusao >= 80 ? "#22c55e" : inst.taxa_conclusao >= 50 ? "#ca8a04" : "#ef4444",
                      }}>
                        {fmtPct(inst.taxa_conclusao)}
                      </span>
                    </td>
                    <td style={{ width: 100 }}>
                      <div style={{ height: 6, borderRadius: 3, background:"var(--color-border)", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(inst.total / maxTotal * 100, 100)}%`, background:"#6B4EFF", borderRadius:3 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </div>

    </div>
  );
}

/* ── ABA: CLIENTES ── */
function AbaClientes({ periodo }) {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/relatorios/clientes?periodo=${periodo}`)
      .then((r) => setDados(r))
      .catch(() => setDados(null))
      .finally(() => setLoading(false));
  }, [periodo]);

  if (loading) return <Skeleton />;
  if (!dados)  return <Empty />;

  const { kpis, topClientes, porCategoria } = dados;
  const maxAgs = Math.max(...(topClientes?.map((c) => c.agendamentos) || [1]), 1);

  return (
    <div className="rel-aba-content">

      <div className="rel-kpis">
        <KpiCard label="Clientes ativos"       value={fmtN(kpis.ativos)}          cor="#3b82f6" icon="👥" />
        <KpiCard label="Novos no período"       value={fmtN(kpis.novos_periodo)}   cor="#22c55e" icon="✨" />
        <KpiCard label="Endereços cadastrados"  value={fmtN(kpis.total_enderecos)} cor="#6B4EFF" icon="📍" />
        <KpiCard label="Sem atendimento"        value={fmtN(kpis.sem_agendamento)} cor="#94a3b8" icon="💤"
          sub="Sem agendamento no período" />
      </div>

      <div className="rel-row-2">

        {/* Top clientes */}
        <div className="rel-card">
          <div className="rel-card-title">Top 10 clientes mais atendidos no período</div>
          {topClientes?.filter((c) => c.agendamentos > 0).length ? (
            <div className="rel-barras">
              {topClientes.filter((c) => c.agendamentos > 0).map((c, i) => (
                <BarraHorizontal
                  key={c.nome}
                  label={c.nome}
                  value={c.agendamentos}
                  max={maxAgs}
                  cor={["#6B4EFF","#3b82f6","#22c55e","#f97316","#eab308","#a07cff","#ef4444","#06d6a0","#58f3b1","#ff6f91"][i % 10]}
                />
              ))}
            </div>
          ) : <Empty />}
        </div>

        {/* Por categoria de endereço */}
        <div className="rel-card">
          <div className="rel-card-title">Endereços por categoria</div>
          {porCategoria?.length ? (
            <PizzaSimples
              dados={porCategoria}
              valFn={(d) => d.total}
              labelFn={(d) => CATEGORIA_LABEL[d.categoria] || d.categoria}
              corFn={(d) => CATEGORIA_COR[d.categoria] || "#94a3b8"}
            />
          ) : <Empty />}
        </div>
      </div>

      {/* Tabela completa top clientes */}
      <div className="rel-card">
        <div className="rel-card-title">Lista de clientes e atendimentos no período</div>
        <div className="rel-table-wrap">
          <table className="rel-table">
            <thead>
              <tr><th>#</th><th>Cliente</th><th>Agendamentos</th><th>Relevância</th></tr>
            </thead>
            <tbody>
              {topClientes?.map((c, i) => (
                <tr key={c.nome}>
                  <td className="rel-td-muted">{i + 1}</td>
                  <td><strong>{c.nome}</strong></td>
                  <td>{fmtN(c.agendamentos)}</td>
                  <td style={{ width: 140 }}>
                    <div style={{ height: 6, borderRadius: 3, background:"var(--color-border)", overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.min(c.agendamentos / maxAgs * 100, 100)}%`, background:"#3b82f6", borderRadius:3 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

/* ── ABA: VEÍCULOS ── */
function AbaVeiculos({ periodo }) {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/relatorios/veiculos?periodo=${periodo}`)
      .then((r) => setDados(r))
      .catch(() => setDados(null))
      .finally(() => setLoading(false));
  }, [periodo]);

  if (loading) return <Skeleton />;
  if (!dados)  return <Empty />;

  const { kpis, porVeiculo, recentes } = dados;
  const maxGasto = Math.max(...(porVeiculo?.map((v) => Number(v.gasto)) || [1]), 1);

  return (
    <div className="rel-aba-content">

      <div className="rel-kpis">
        <KpiCard label="Veículos cadastrados"  value={fmtN(kpis.total_veiculos)}       cor="#3b82f6" icon="🚗" />
        <KpiCard label="Total abastecido"      value={fmtL(kpis.total_litros)}          cor="#eab308" icon="⛽" />
        <KpiCard label="Gasto total"           value={fmtR(kpis.total_gasto)}           cor="#ef4444" icon="💰" />
        <KpiCard label="Preço médio/litro"     value={fmtR(kpis.preco_medio_litro)}     cor="#a07cff" icon="📊"
          sub={`${fmtN(kpis.total_abastecimentos)} abastecimentos`} />
      </div>

      <div className="rel-row-2">

        {/* Por veículo — gasto */}
        <div className="rel-card">
          <div className="rel-card-title">Gasto com combustível por veículo</div>
          {porVeiculo?.filter((v) => v.abastecimentos > 0).length ? (
            <div className="rel-barras">
              {porVeiculo.filter((v) => v.abastecimentos > 0).map((v) => (
                <BarraHorizontal
                  key={v.nome}
                  label={`${v.nome}${v.placa ? ` (${v.placa})` : ""}`}
                  value={Number(v.gasto)}
                  max={maxGasto}
                  cor={COMB_COR[v.combustivel] || "#3b82f6"}
                />
              ))}
            </div>
          ) : <Empty />}
        </div>

        {/* Tabela por veículo */}
        <div className="rel-card">
          <div className="rel-card-title">Resumo por veículo</div>
          <div className="rel-table-wrap">
            <table className="rel-table">
              <thead>
                <tr>
                  <th>Veículo</th>
                  <th>Abastes.</th>
                  <th>Litros</th>
                  <th>Gasto total</th>
                  <th>R$/L médio</th>
                </tr>
              </thead>
              <tbody>
                {porVeiculo?.map((v) => (
                  <tr key={v.nome}>
                    <td>
                      <strong>{v.nome}</strong>
                      {v.placa && <span className="rel-td-muted"> · {v.placa}</span>}
                    </td>
                    <td>{fmtN(v.abastecimentos)}</td>
                    <td>{fmtL(v.litros)}</td>
                    <td style={{ color: Number(v.gasto) > 0 ? "#ef4444" : "var(--color-text-muted)" }}>
                      {fmtR(v.gasto)}
                    </td>
                    <td>{Number(v.preco_medio) > 0 ? fmtR(v.preco_medio) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Histórico recente */}
      <div className="rel-card">
        <div className="rel-card-title">Últimos abastecimentos registrados</div>
        {recentes?.length ? (
          <div className="rel-table-wrap">
            <table className="rel-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Veículo</th>
                  <th>Litros</th>
                  <th>Valor total</th>
                  <th>R$/L</th>
                  <th>Posto</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((ab, i) => {
                  const ppl = ab.litros && ab.valor_total ? Number(ab.valor_total) / Number(ab.litros) : null;
                  return (
                    <tr key={i}>
                      <td className="rel-td-muted">{ab.data?.slice(0,10)}</td>
                      <td>
                        <strong>{ab.veiculo}</strong>
                        {ab.placa && <span className="rel-td-muted"> · {ab.placa}</span>}
                      </td>
                      <td>{ab.litros ? fmtL(ab.litros) : "—"}</td>
                      <td style={{ color:"#ef4444" }}>{ab.valor_total ? fmtR(ab.valor_total) : "—"}</td>
                      <td className="rel-td-muted">{ppl ? `R$ ${ppl.toFixed(2)}` : "—"}</td>
                      <td>{ab.posto_nome || <span className="rel-td-muted">—</span>}</td>
                      <td className="rel-td-muted">{ab.registrado_por || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════ */
const ABAS = [
  { id:"agendamentos", label:"📋 Agendamentos", temPeriodo: true },
  { id:"equipe",       label:"👷 Equipe",        temPeriodo: true },
  { id:"clientes",     label:"👥 Clientes",       temPeriodo: true },
  { id:"veiculos",     label:"🚗 Veículos",       temPeriodo: true },
];

export default function Relatorios() {
  const [aba,     setAba]     = useState("agendamentos");
  const [periodo, setPeriodo] = useState("30d");

  const abaAtual = ABAS.find((a) => a.id === aba);

  return (
    <div className="ek-page">
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Relatórios</h1>
          <p>Análises e indicadores de desempenho do sistema</p>
        </div>
        {abaAtual?.temPeriodo && (
          <div className="ek-head-actions">
            <div className="rel-periodo-group">
              {PERIODOS.map((p) => (
                <button
                  key={p.value}
                  className={`rel-periodo-btn${periodo === p.value ? " active" : ""}`}
                  onClick={() => setPeriodo(p.value)}
                >{p.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="rel-tabs">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={`rel-tab${aba === a.id ? " active" : ""}`}
            onClick={() => setAba(a.id)}
          >{a.label}</button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ marginTop: 20 }}>
        {aba === "agendamentos" && <AbaAgendamentos periodo={periodo} />}
        {aba === "equipe"       && <AbaEquipe       periodo={periodo} />}
        {aba === "clientes"     && <AbaClientes     periodo={periodo} />}
        {aba === "veiculos"     && <AbaVeiculos     periodo={periodo} />}
      </div>
    </div>
  );
}
