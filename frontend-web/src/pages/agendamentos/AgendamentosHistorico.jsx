import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../../services/api";
import "./Agendamentos.css";
import FiltroStatus from "./FiltroStatus";
import { faixaHora } from "../../utils/horario";

/* ── CONSTANTES ── */
const STATUS_META = {
  pre_agendado:  { label: "Pré agendado",   cor: "#94a3b8", classe: "pre_agendado"  },
  agendado:      { label: "Agendado",       cor: "#3b82f6", classe: "agendado"      },
  andamento:     { label: "Em andamento",   cor: "#eab308", classe: "andamento"     },
  concluido:     { label: "Concluído",      cor: "#22c55e", classe: "concluido"     },
  nao_concluido: { label: "Não concluído",  cor: "#f97316", classe: "nao_concluido" },
  cancelado:     { label: "Cancelado",      cor: "#ef4444", classe: "cancelado"     },
  atrasado:      { label: "Atrasado",       cor: "#ef4444", classe: "atrasado"      },
};

const TIPOS = ["Instalação", "Manutenção", "Retorno/Finalização", "Conferência"];
const POR_PAGINA = 60;

function isoParaDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function detectarAtrasado(ag) {
  if (ag.status !== "agendado") return ag; // pre_agendado, concluido, etc. não viram atrasado
  const [y, m, d] = ag.data.split("-").map(Number);
  const [h, mi]   = ag.hora.split(":").map(Number);
  if (new Date(y, m - 1, d, h, mi) < new Date()) return { ...ag, status: "atrasado" };
  return ag;
}

function isoParaLabel(iso) {
  return isoParaDate(iso).toLocaleDateString("pt-BR");
}

function semanaLabel(iso) {
  const d = isoParaDate(iso);
  const seg = new Date(d);
  seg.setDate(d.getDate() - d.getDay() + 1);
  const sab = new Date(seg);
  sab.setDate(seg.getDate() + 6);
  return `${seg.toLocaleDateString("pt-BR")} – ${sab.toLocaleDateString("pt-BR")}`;
}

function mesLabel(iso) {
  const [y, m] = iso.split("-").map(Number);
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[m-1]}/${y}`;
}

function chaveAgrupamento(ag, tipo) {
  if (tipo === "data")   return ag.data;
  if (tipo === "semana") {
    const d = isoParaDate(ag.data);
    const seg = new Date(d); seg.setDate(d.getDate() - d.getDay() + 1);
    return `${seg.getFullYear()}-${String(seg.getMonth()+1).padStart(2,"0")}-${String(seg.getDate()).padStart(2,"0")}`;
  }
  if (tipo === "mes") return ag.data.slice(0, 7);
  return null;
}

/* ── COMPONENTE PRINCIPAL ── */
export default function AgendamentosHistorico() {
  const hoje = new Date();
  const defaultFim    = new Date(hoje.getFullYear() + 1, hoje.getMonth(), hoje.getDate())
    .toISOString().split("T")[0];
  const defaultInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 3, hoje.getDate())
    .toISOString().split("T")[0];

  const [busca,         setBusca]         = useState("");
  const [filtrosStatus, setFiltrosStatus] = useState([]);
  const [filtroTipo,    setFiltroTipo]    = useState("todos");
  const [filtroEquipe,  setFiltroEquipe]  = useState("todos");
  const [dataInicio,    setDataInicio]    = useState(defaultInicio);
  const [dataFim,       setDataFim]       = useState(defaultFim);
  const [agrupamento,   setAgrupamento]   = useState("nenhum");
  const [agendamentos,  setAgendamentos]  = useState([]);
  const [equipe,        setEquipe]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [agDetalhe,     setAgDetalhe]     = useState(null);
  const [pagina,        setPagina]        = useState(1);

  useEffect(() => {
    api.get("/agendamentos/equipe").then((r) => setEquipe(r.equipe || [])).catch(() => {});
  }, []);

  const buscar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dataInicio)             params.append("data_inicio", dataInicio);
      if (dataFim)                params.append("data_fim",    dataFim);
      if (filtroTipo !== "todos") params.append("tipo",        filtroTipo);

      const data = await api.get(`/agendamentos?${params.toString()}`);
      setAgendamentos((data.agendamentos || []).map(detectarAtrasado));
    } catch (err) {
      console.error("AgendamentosHistorico:", err);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [dataInicio, dataFim, filtroTipo]);

  useEffect(() => { buscar(); }, [buscar]);

  /* atualização a cada 2 min — dados históricos mudam raramente */
  useEffect(() => {
    let id = setInterval(() => buscar(true), 120_000);
    function onVisibility() {
      if (document.hidden) {
        clearInterval(id);
      } else {
        buscar(true);
        id = setInterval(() => buscar(true), 120_000);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [buscar]);

  /* Stats — baseado em todos os agendamentos do período */
  const statsRes = agendamentos.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  /* Filtro client-side: busca + status + equipe */
  const agsFiltrados = useMemo(() => {
    let result = agendamentos;
    if (busca) {
      const b = busca.toLowerCase();
      result = result.filter((a) =>
        a.titulo.toLowerCase().includes(b) || a.cliente.toLowerCase().includes(b)
      );
    }
    if (filtrosStatus.length > 0) {
      result = result.filter((a) => filtrosStatus.includes(a.status));
    }
    if (filtroEquipe !== "todos") {
      result = result.filter((a) =>
        (a.equipe_info || []).some((m) => String(m.id) === filtroEquipe)
      );
    }
    return result;
  }, [agendamentos, busca, filtrosStatus, filtroEquipe]);

  /* Ordenação */
  const agsOrdenados = useMemo(
    () => [...agsFiltrados].sort((a, b) => b.data.localeCompare(a.data) || b.hora.localeCompare(a.hora)),
    [agsFiltrados]
  );

  /* Reset de página quando filtros mudam */
  useEffect(() => { setPagina(1); }, [agsFiltrados, agrupamento]);

  /* Paginação (só para vista plana) */
  const totalPaginas = agrupamento === "nenhum" ? Math.ceil(agsOrdenados.length / POR_PAGINA) : 1;
  const agsPaginados = agrupamento === "nenhum"
    ? agsOrdenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
    : agsOrdenados;

  /* Agrupamento */
  const grupos = useMemo(() => {
    if (agrupamento === "nenhum") return null;

    if (agrupamento === "instalador") {
      const map = new Map();
      agsOrdenados.forEach((ag) => {
        const equipeInfo = ag.equipe_info || [];
        if (equipeInfo.length === 0) {
          const key = "__sem_equipe__";
          if (!map.has(key)) map.set(key, { label: "Sem equipe atribuída", items: [] });
          map.get(key).items.push({ ag, parceiros: [] });
        } else {
          equipeInfo.forEach((membro) => {
            const key = String(membro.id);
            if (!map.has(key)) map.set(key, { label: membro.nome, items: [] });
            const parceiros = equipeInfo.filter((m) => m.id !== membro.id).map((m) => m.nome);
            map.get(key).items.push({ ag, parceiros });
          });
        }
      });
      return Array.from(map.entries()).map(([, v]) => v);
    }

    const map = new Map();
    agsOrdenados.forEach((ag) => {
      const key = chaveAgrupamento(ag, agrupamento);
      if (!map.has(key)) {
        let label = key;
        if (agrupamento === "data")   label = isoParaLabel(key);
        if (agrupamento === "semana") label = semanaLabel(key);
        if (agrupamento === "mes")    label = mesLabel(key);
        map.set(key, { key, label, items: [] });
      }
      map.get(key).items.push({ ag, parceiros: [] });
    });
    return Array.from(map.values());
  }, [agsOrdenados, agrupamento]);

  /* ── EXPORTAR XLSX ── */
  function exportarXLSX() {
    const linhas = [];

    if (agrupamento === "instalador" && grupos) {
      grupos.forEach((grupo) => {
        grupo.items.forEach(({ ag, parceiros }) => {
          const meta = STATUS_META[ag.status] || {};
          linhas.push({
            "Instalador":            grupo.label,
            "Data":                  ag.data ? isoParaDate(ag.data).toLocaleDateString("pt-BR") : "",
            "Horário":               faixaHora(ag.hora, ag.duracao_minutos),
            "Título":                ag.titulo,
            "Cliente":               ag.cliente,
            "Tipo":                  ag.tipo,
            "Status":                meta.label || ag.status,
            "Trabalhou com":         parceiros.join(", ") || "—",
            "Endereço":              ag.endereco || "",
            "Descrição / Observação": [ag.descricao, ag.observacoes].filter(Boolean).join("\n") || "",
          });
        });
      });
    } else {
      agsOrdenados.forEach((ag) => {
        const meta     = STATUS_META[ag.status] || {};
        const equipe   = (ag.equipe_info || []).map((m) => m.nome).join(", ");
        linhas.push({
          "Data":                   ag.data ? isoParaDate(ag.data).toLocaleDateString("pt-BR") : "",
          "Horário":                faixaHora(ag.hora, ag.duracao_minutos),
          "Título":                 ag.titulo,
          "Cliente":                ag.cliente,
          "Tipo":                   ag.tipo,
          "Status":                 meta.label || ag.status,
          "Equipe":                 equipe || "—",
          "Endereço":               ag.endereco || "",
          "Descrição / Observação": [ag.descricao, ag.observacoes].filter(Boolean).join("\n") || "",
        });
      });
    }

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");

    const hoje = new Date();
    const nome = `agendamentos_${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,"0")}${String(hoje.getDate()).padStart(2,"0")}.xlsx`;
    XLSX.writeFile(wb, nome);
  }

  return (
    <div className="ek-page">

      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Histórico de Agendamentos</h1>
          <p>Filtre, agrupe e exporte relatórios</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="ek-btn ek-btn-secondary"
            onClick={exportarXLSX}
            disabled={agendamentos.length === 0}
            title="Exportar para Excel"
          >
            ⬇ Exportar .xlsx
          </button>
          <Link to="/agendamentos" className="ek-btn ek-btn-secondary">
            ← Voltar ao calendário
          </Link>
        </div>
      </div>

      {/* TOOLBAR — busca, datas, tipo, agrupamento */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
        <div className="ek-toolbar-group" style={{ flex: 2, minWidth: 180 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Título ou cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="ek-toolbar-group">
          <label>Tipo</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="todos">Todos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="ek-toolbar-group">
          <label>De</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="ek-toolbar-group">
          <label>Até</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <div className="ek-toolbar-group">
          <label>Equipe</label>
          <select value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)}>
            <option value="todos">Todos</option>
            {equipe.map((m) => <option key={m.id} value={String(m.id)}>{m.nome}</option>)}
          </select>
        </div>
        <div className="ek-toolbar-group">
          <label>Agrupar por</label>
          <select value={agrupamento} onChange={(e) => setAgrupamento(e.target.value)}>
            <option value="nenhum">Sem agrupamento</option>
            <option value="data">Dia</option>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
            <option value="instalador">Instalador</option>
          </select>
        </div>
        <button
          className="ek-btn ek-btn-secondary"
          style={{ padding: "8px 14px", fontSize: 12, flexShrink: 0 }}
          onClick={() => {
            setBusca(""); setFiltrosStatus([]); setFiltroTipo("todos"); setFiltroEquipe("todos");
            setDataInicio(defaultInicio); setDataFim(defaultFim); setAgrupamento("nenhum");
          }}
        >
          Limpar tudo
        </button>
      </div>

      {/* STATS + FILTRO STATUS EM LINHA */}
      <div className="ag-hist-topbar">
        <div className="ag-hist-stats">
          <div className="ag-hist-stat">
            <strong>{agendamentos.length}</strong>
            <span>Total</span>
          </div>
          {Object.entries(STATUS_META).map(([key, meta]) =>
            statsRes[key] ? (
              <div key={key} className="ag-hist-stat" style={{ borderTopColor: meta.cor }}>
                <strong>{statsRes[key]}</strong>
                <span>{meta.label}</span>
              </div>
            ) : null
          )}
        </div>

        <div className="ag-hist-filtro-inline">
          <span className="ag-hist-filtro-label">Status:</span>
          <div className="ag-hist-status-chips">
            {/* Todos */}
            <button
              className={`ag-hist-chip${filtrosStatus.length === 0 ? " active" : ""}`}
              onClick={() => setFiltrosStatus([])}
            >
              Todos
              <span className="ag-hist-chip-count ag-hist-chip-count--neutral">
                {agendamentos.length}
              </span>
            </button>

            {Object.entries(STATUS_META).map(([key, meta]) =>
              statsRes[key] ? (
                <button
                  key={key}
                  className={`ag-hist-chip${filtrosStatus.includes(key) ? " active" : ""}`}
                  style={{
                    color: meta.cor,
                    borderColor: `color-mix(in srgb, ${meta.cor} ${filtrosStatus.includes(key) ? "55%" : "28%"}, transparent)`,
                    background: `color-mix(in srgb, ${meta.cor} ${filtrosStatus.includes(key) ? "18%" : "9%"}, var(--color-surface))`,
                  }}
                  onClick={() => setFiltrosStatus((prev) =>
                    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                  )}
                >
                  <span className="ag-hist-chip-dot" style={{ background: meta.cor }} />
                  {meta.label}
                  <span
                    className="ag-hist-chip-count"
                    style={{ background: `color-mix(in srgb, ${meta.cor} 22%, transparent)`, color: meta.cor }}
                  >
                    {statsRes[key]}
                  </span>
                </button>
              ) : null
            )}

            {filtrosStatus.length > 0 && (
              <button className="ag-hist-chip ag-hist-chip-clear" onClick={() => setFiltrosStatus([])}>
                × Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      {loading ? (
        <div className="ek-empty" style={{ padding: 48 }}>
          <p style={{ color: "var(--color-text-muted)" }}>Carregando...</p>
        </div>
      ) : agsOrdenados.length === 0 ? (
        <div className="ek-empty" style={{ padding: 48, textAlign: "center" }}>
          <div className="ek-empty-icon">📅</div>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            Nenhum agendamento encontrado para os filtros selecionados.
          </p>
        </div>
      ) : grupos ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {grupos.map((grupo, gi) => (
            <div key={gi}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)" }}>
                  {grupo.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", background: "var(--color-surface-soft)", border: "1px solid var(--color-border)", padding: "1px 7px", borderRadius: 999 }}>
                  {grupo.items.length}
                </span>
              </div>
              <TabelaAgendamentos
                items={grupo.items}
                mostrarParceiros={agrupamento === "instalador"}
                onDetalhe={setAgDetalhe}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <TabelaAgendamentos
            items={agsPaginados.map((ag) => ({ ag, parceiros: [] }))}
            mostrarParceiros={false}
            onDetalhe={setAgDetalhe}
          />
          {totalPaginas > 1 && (
            <div className="ag-hist-paginacao">
              <button className="ag-hist-pag-btn" disabled={pagina === 1} onClick={() => setPagina(1)}>«</button>
              <button className="ag-hist-pag-btn" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>‹</button>
              <span className="ag-hist-pag-info">
                Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
                <span className="ag-hist-pag-total"> — {agsOrdenados.length} registros</span>
              </span>
              <button className="ag-hist-pag-btn" disabled={pagina === totalPaginas} onClick={() => setPagina((p) => p + 1)}>›</button>
              <button className="ag-hist-pag-btn" disabled={pagina === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
            </div>
          )}
        </>
      )}

      {/* MODAL DETALHE */}
      {agDetalhe && (
        <HistoricoDetalheModal ag={agDetalhe} onClose={() => setAgDetalhe(null)} />
      )}
    </div>
  );
}

/* ── TABELA REUTILIZÁVEL ── */
function TabelaAgendamentos({ items, mostrarParceiros, onDetalhe }) {
  return (
    <div className="hist-table-wrap">
      <div className="hist-table-scroll">
        <table className="hist-table">
          <thead>
            <tr>
              <th style={{ minWidth: 190 }}>Agendamento</th>
              <th style={{ minWidth: 110 }}>Tipo</th>
              <th style={{ minWidth: 115 }}>Data / Horário</th>
              <th style={{ minWidth: 115 }}>Status</th>
              <th style={{ minWidth: 140 }}>{mostrarParceiros ? "Trabalhou com" : "Equipe"}</th>
              <th style={{ minWidth: 130 }}>Endereço</th>
              <th style={{ minWidth: 135 }}>
                <span className="hist-th-audit">
                  <span className="hist-th-dot" style={{ background: "#3b82f6" }} />
                  Criado por
                </span>
              </th>
              <th style={{ minWidth: 135 }}>
                <span className="hist-th-audit">
                  <span className="hist-th-dot" style={{ background: "#8b5cf6" }} />
                  Última edição
                </span>
              </th>
              <th style={{ minWidth: 135 }}>
                <span className="hist-th-audit">
                  <span className="hist-th-dot" style={{ background: "#eab308" }} />
                  Iniciado por
                </span>
              </th>
              <th style={{ minWidth: 135 }}>
                <span className="hist-th-audit">
                  <span className="hist-th-dot" style={{ background: "#22c55e" }} />
                  Finalizado por
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ ag, parceiros }, i) => {
              const meta    = STATUS_META[ag.status] || STATUS_META.agendado;
              const membros = mostrarParceiros
                ? parceiros
                : (ag.equipe_info || []).map((m) => m.nome);
              const corFinal = ag.status === "nao_concluido" ? "#f97316" : "#22c55e";

              return (
                <tr
                  key={`${ag.id}-${i}`}
                  className={`hist-row hist-row--${ag.status}`}
                  onClick={() => onDetalhe(ag)}
                >
                  <td className="hist-td">
                    <span className="hist-cell-title">{ag.titulo}</span>
                    <span className="hist-cell-sub">{ag.cliente}</span>
                  </td>

                  <td className="hist-td">
                    <span className="hist-tipo-badge">{ag.tipo}</span>
                  </td>

                  <td className="hist-td">
                    <span className="hist-cell-date">
                      {ag.data ? isoParaDate(ag.data).toLocaleDateString("pt-BR") : "—"}
                    </span>
                    <span className="hist-cell-time">{faixaHora(ag.hora, ag.duracao_minutos)}</span>
                  </td>

                  <td className="hist-td">
                    <span className={`ag-badge ${meta.classe}`}>{meta.label}</span>
                  </td>

                  <td className="hist-td">
                    {(ag.equipe_info || []).length === 0
                      ? <span className="hist-empty">—</span>
                      : <div className="hist-equipe-list">
                          {(ag.equipe_info || []).map((m, j) => (
                            <span key={j} className="hist-equipe-chip" title={m.nome} style={m.inativo ? { opacity: 0.6 } : undefined}>
                              <span className="hist-equipe-initial">
                                {(m.nome || "?").trim()[0]?.toUpperCase() ?? "?"}
                              </span>
                              <span className="hist-equipe-nome">
                                {m.nome}
                                {m.inativo && <span style={{ fontSize: 10, color: "#f97316", marginLeft: 3 }}>(inativo)</span>}
                              </span>
                            </span>
                          ))}
                        </div>
                    }
                  </td>

                  <td className="hist-td hist-td--addr" title={ag.endereco || ""}>
                    {ag.endereco || <span className="hist-empty">—</span>}
                  </td>

                  <td className="hist-td">
                    <AuditCell nome={ag.criado_por_nome} ts={ag.criado_em} cor="#3b82f6" />
                  </td>

                  <td className="hist-td">
                    <AuditCell nome={ag.editado_por_nome} ts={ag.editado_em} cor="#8b5cf6" />
                  </td>

                  <td className="hist-td">
                    <AuditCell nome={ag.iniciado_por_nome} ts={ag.iniciado_em} cor="#eab308" />
                  </td>

                  <td className="hist-td">
                    <AuditCell nome={ag.concluido_por_nome} ts={ag.concluido_em} cor={corFinal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditCell({ nome, ts, cor }) {
  if (!nome) return <span className="hist-empty">—</span>;
  return (
    <div className="hist-audit-wrap">
      <span className="hist-audit-dot" style={{ background: cor }} />
      <div className="hist-audit-info">
        <span className="hist-audit-nome">{nome}</span>
        <span className="hist-audit-dt">{fmtDatetime(ts)}</span>
      </div>
    </div>
  );
}

/* ── helpers de data/hora ── */
function fmtDatetime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function duracaoReal(iniciado, concluido) {
  if (!iniciado || !concluido) return null;
  const diff = Math.round((new Date(concluido) - new Date(iniciado)) / 60000);
  if (diff < 1) return "menos de 1 min";
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/* ── MODAL DE DETALHE (read-only) ── */
function HistoricoDetalheModal({ ag: agResumido, onClose }) {
  const [ag, setAg] = useState(agResumido);
  const [loadingDetalhe, setLoadingDetalhe] = useState(true);
  const [logs, setLogs] = useState([]);

  // Carrega o agendamento completo e os logs em paralelo
  useEffect(() => {
    Promise.all([
      api.get(`/agendamentos/${agResumido.id}`),
      api.get(`/agendamentos/${agResumido.id}/logs`),
    ])
      .then(([resAg, resLogs]) => {
        setAg(resAg.agendamento);
        setLogs(resLogs.logs || []);
      })
      .catch(() => {})
      .finally(() => setLoadingDetalhe(false));
  }, [agResumido.id]);

  const meta = STATUS_META[ag.status] || STATUS_META.agendado;
  const equipeNomes = (ag.equipe_info || []).map((m) => m.nome).join(", ");
  const anexos = ag.anexos || [];
  const fotos  = anexos.filter((a) => a.tipo === "foto_antes" || a.tipo === "foto_depois");
  const videos = anexos.filter((a) => a.tipo === "video");
  const docs   = anexos.filter((a) => a.tipo === "documento");

  const TIPO_LABEL = { foto_antes: "Antes", foto_depois: "Depois", video: "Vídeo", documento: "Doc" };

  return (
    <div className="modal-overlay">
      <div
        className="modal-box modal-lg"
        style={{ maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: meta.cor, flexShrink: 0 }} />
            <div>
              <h2>{ag.titulo}</h2>
              <p>{ag.cliente} · {ag.tipo}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Grid de info principal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-border)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {[
              ["Status",  <span key="s" className={`ag-badge ${meta.classe}`}>{meta.label}</span>],
              ["Horário agendado", faixaHora(ag.hora, ag.duracao_minutos) || "—"],
              ["Data",    ag.data ? isoParaDate(ag.data).toLocaleDateString("pt-BR") : "—"],
              ["Tipo",    ag.tipo],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: "var(--color-surface-soft)", padding: "12px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 4 }}>{lbl}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Linha do tempo de execução */}
          {(ag.iniciado_em || ag.concluido_em) && (
            <div style={{
              background: "var(--color-surface-soft)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)" }}>
                Execução
              </div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {ag.iniciado_em && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: "color-mix(in srgb, #6366f1 15%, var(--color-surface))",
                      border: "1.5px solid #6366f1",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, flexShrink: 0,
                    }}>▶</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.5px" }}>Início</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{fmtDatetime(ag.iniciado_em)}</div>
                      {ag.iniciado_por_nome && (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{ag.iniciado_por_nome}</div>
                      )}
                    </div>
                  </div>
                )}
                {ag.concluido_em && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: ag.status === "nao_concluido"
                        ? "color-mix(in srgb, #f97316 15%, var(--color-surface))"
                        : "color-mix(in srgb, #22c55e 15%, var(--color-surface))",
                      border: `1.5px solid ${ag.status === "nao_concluido" ? "#f97316" : "#22c55e"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, flexShrink: 0,
                    }}>{ag.status === "nao_concluido" ? "✗" : "✓"}</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: ag.status === "nao_concluido" ? "#f97316" : "#22c55e" }}>
                        {ag.status === "nao_concluido" ? "Não concluído" : "Conclusão"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{fmtDatetime(ag.concluido_em)}</div>
                      {ag.concluido_por_nome && (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{ag.concluido_por_nome}</div>
                      )}
                    </div>
                  </div>
                )}
                {duracaoReal(ag.iniciado_em, ag.concluido_em) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: "var(--color-surface-soft)",
                      border: "1.5px solid var(--color-border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, flexShrink: 0,
                    }}>⏱</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Duração real</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{duracaoReal(ag.iniciado_em, ag.concluido_em)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fotos e vídeos */}
          {loadingDetalhe ? (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", padding: 8 }}>Carregando mídias...</div>
          ) : fotos.length + videos.length > 0 ? (
            <div className="ag-form-field">
              <label>Fotos e vídeos</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                {[...fotos, ...videos].map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", flexDirection: "column", gap: 4, textDecoration: "none" }}
                    title={a.nome}
                  >
                    <div style={{
                      width: "100%", aspectRatio: "1 / 1",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      overflow: "hidden",
                      background: "var(--color-surface-soft)",
                      position: "relative",
                    }}>
                      {a.tipo === "video" ? (
                        <>
                          <video
                            src={a.url}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            muted preload="metadata" playsInline
                          />
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(0,0,0,0.3)",
                            color: "#fff", fontSize: 22,
                          }}>▶</div>
                        </>
                      ) : (
                        <img
                          src={a.url}
                          alt={a.nome}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      color: a.tipo === "foto_depois" ? "#22c55e" : a.tipo === "video" ? "#6366f1" : "var(--color-text-muted)",
                    }}>
                      {TIPO_LABEL[a.tipo] || a.tipo}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Documentos */}
          {!loadingDetalhe && docs.length > 0 && (
            <div className="ag-form-field">
              <label>Documentos</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {docs.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                      background: "var(--color-surface-soft)", borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)", fontSize: 13,
                      color: "var(--color-text)", textDecoration: "none",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>📄</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</span>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Endereço */}
          {(ag.rua || ag.endereco) && (
            <div className="ag-form-field">
              <label>Endereço</label>
              <div
                style={{ fontSize: 13, color: "var(--color-text)", display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer", flexDirection: "column" }}
                onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(ag.endereco || [ag.rua, ag.numero, ag.bairro, ag.cidade, ag.estado].filter(Boolean).join(", "))}`, "_blank")}
              >
                {ag.rua ? (
                  <span>
                    📍 {ag.rua}{ag.numero ? `, ${ag.numero}` : ""}{ag.complemento ? ` – ${ag.complemento}` : ""}
                    {ag.bairro ? `, ${ag.bairro}` : ""}{ag.cidade ? `, ${ag.cidade}` : ""}{ag.estado ? ` – ${ag.estado}` : ""}
                    {ag.cep ? ` – CEP ${ag.cep}` : ""}
                  </span>
                ) : (
                  <span>📍 {ag.endereco}</span>
                )}
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>(abrir no mapa)</span>
              </div>
            </div>
          )}

          {equipeNomes && (
            <div className="ag-form-field">
              <label>Equipe</label>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>{equipeNomes}</p>
            </div>
          )}

          {(ag.descricao || ag.observacoes) && (
            <div className="ag-form-field">
              <label>Descrição / Observação</label>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>
                {[ag.descricao, ag.observacoes].filter(Boolean).join("\n\n")}
              </p>
            </div>
          )}

          {ag.itens?.length > 0 && (
            <div className="ag-form-field">
              <label>Itens levados</label>
              <div className="ag-itens-list">
                {ag.itens.map((it, i) => (
                  <div key={i} className="ag-item-tag" style={{ cursor: "default" }}>📦 {it}</div>
                ))}
              </div>
            </div>
          )}


          {ag.observacoes_status && (
            <div className="ag-form-field">
              <label>Motivo de não conclusão</label>
              <p style={{ fontSize: 13, color: "#f97316", margin: 0 }}>{ag.observacoes_status}</p>
            </div>
          )}

          {/* ── Linha do tempo de eventos ── */}
          {logs.length > 0 && (
            <div className="ag-form-field">
              <label>Histórico de atividades</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {logs.map((log, i) => (
                  <LogEvento key={i} log={log} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const ACAO_CFG = {
  editado:         { icon: "✏", cor: "#8b5cf6", label: "Editou" },
  cancelado:       { icon: "■", cor: "#ef4444", label: "Cancelou" },
  excluido:        { icon: "✗", cor: "#6b7280", label: "Excluiu" },
  status_alterado: { icon: "↺", cor: "#3b82f6", label: "Alterou status" },
};

const STATUS_LABEL = {
  pre_agendado:  "Pré agendado",
  agendado:      "Agendado",
  andamento:     "Em andamento",
  concluido:     "Concluído",
  nao_concluido: "Não concluído",
  cancelado:     "Cancelado",
  atrasado:      "Atrasado",
  aguardando:    "Aguardando",
};
function fmtStatus(s) { return STATUS_LABEL[s] || s; }

function LogEvento({ log }) {
  const d    = log.detalhes || {};
  const cfg  = ACAO_CFG[log.acao] || { icon: "•", cor: "#94a3b8", label: log.acao };

  /* Itens de campo alterado (edição por formulário ou drag/resize) */
  let itens = [];
  if (log.acao === "editado") {
    if (d.origem === "drag_resize") {
      if (d.data_anterior !== d.data_nova)
        itens.push({ campo: "Data", de: fmtData(d.data_anterior), para: fmtData(d.data_nova) });
      if (d.hora_anterior !== d.hora_nova || d.duracao_anterior !== d.duracao_nova)
        itens.push({ campo: "Horário", de: faixaHora(d.hora_anterior, d.duracao_anterior), para: faixaHora(d.hora_nova, d.duracao_nova) });
    } else {
      itens = (d.campos || []).map((item) =>
        item.campo === "Status"
          ? { ...item, de: item.de ? fmtStatus(item.de) : item.de, para: item.para ? fmtStatus(item.para) : item.para }
          : item
      );
    }
  }

  const origem = d.origem === "drag_resize" ? "Arrastar / redimensionar" : log.acao === "editado" ? "Formulário" : null;

  return (
    <div style={{
      background: "var(--color-surface-soft)",
      border: "1px solid var(--color-border)",
      borderLeft: `3px solid ${cfg.cor}`,
      borderRadius: "var(--radius-md)",
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%",
            background: `color-mix(in srgb, ${cfg.cor} 18%, var(--color-surface))`,
            border: `1.5px solid ${cfg.cor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, flexShrink: 0, color: cfg.cor, fontWeight: 700,
          }}>{cfg.icon}</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
              {log.usuario_nome || "Sistema"}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 6 }}>
              {cfg.label}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {origem && (
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px",
              color: "var(--color-text-muted)",
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              borderRadius: 999, padding: "2px 8px",
            }}>{origem}</span>
          )}
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{fmtDatetime(log.criado_em)}</span>
        </div>
      </div>

      {/* Motivo (cancelamento) */}
      {log.acao === "cancelado" && d.motivo && (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 32 }}>
          Motivo: <em>{d.motivo}</em>
        </div>
      )}

      {/* Transição de status */}
      {log.acao === "status_alterado" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 32, fontSize: 12 }}>
          <span style={{
            background: "color-mix(in srgb, #94a3b8 18%, var(--color-surface))",
            color: "var(--color-text-secondary)", borderRadius: 4, padding: "2px 8px", fontWeight: 600,
          }}>{fmtStatus(d.status_anterior)}</span>
          <span style={{ color: "var(--color-text-muted)" }}>→</span>
          <span style={{
            background: "color-mix(in srgb, #3b82f6 18%, var(--color-surface))",
            color: "#3b82f6", borderRadius: 4, padding: "2px 8px", fontWeight: 600,
          }}>{fmtStatus(d.status_novo)}</span>
        </div>
      )}

      {/* Campos alterados (edição) */}
      {itens.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 32 }}>
          {itens.map((item, j) => (
            <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--color-text-secondary)", minWidth: 90, flexShrink: 0 }}>
                {item.campo}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {item.de != null && (
                  <span style={{
                    background: "color-mix(in srgb, #ef4444 12%, var(--color-surface))",
                    color: "#ef4444", borderRadius: 4, padding: "1px 6px",
                    textDecoration: "line-through", fontFamily: "monospace",
                  }}>{item.de}</span>
                )}
                {item.de != null && item.para != null && (
                  <span style={{ color: "var(--color-text-muted)" }}>→</span>
                )}
                {item.para != null && (
                  <span style={{
                    background: "color-mix(in srgb, #22c55e 12%, var(--color-surface))",
                    color: "#22c55e", borderRadius: 4, padding: "1px 6px",
                    fontFamily: "monospace",
                  }}>{item.para}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtData(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
