import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../../services/api";

const fmtR  = (v) => v != null && v !== "" ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";
const fmtL  = (v) => v != null && v !== "" ? `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L` : "—";
const fmtKm = (v) => v != null && v !== "" ? `${Number(v).toLocaleString("pt-BR")} km` : "—";
const fmtPpl = (litros, total) => {
  if (!litros || !total) return "—";
  const v = Number(total) / Number(litros);
  return `R$ ${v.toFixed(2)}`;
};

const COMB_COR = {
  gasolina: "#ef4444", etanol: "#22c55e", flex: "#3b82f6",
  diesel: "#eab308", gnv: "#a07cff", eletrico: "#06d6a0",
};
const COMB_LABEL = {
  gasolina: "Gasolina", etanol: "Etanol", flex: "Flex",
  diesel: "Diesel", gnv: "GNV", eletrico: "Elétrico",
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function mesLabel(isoDate) {
  const [y, m] = isoDate.split("-");
  return `${MESES[Number(m) - 1]}/${y}`;
}

const POR_PAGINA = 60;

export default function VeiculosHistorico() {
  const hoje = new Date();
  const defaultFim    = hoje.toISOString().split("T")[0];
  const defaultInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 3, hoje.getDate())
    .toISOString().split("T")[0];

  const [dataInicio,      setDataInicio]      = useState(defaultInicio);
  const [dataFim,         setDataFim]         = useState(defaultFim);
  const [filtroVeiculo,   setFiltroVeiculo]   = useState("");
  const [agrupamento,     setAgrupamento]     = useState("nenhum");
  const [busca,           setBusca]           = useState("");
  const [abastecimentos,  setAbastecimentos]  = useState([]);
  const [kpis,            setKpis]            = useState(null);
  const [veiculos,        setVeiculos]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [pagina,          setPagina]          = useState(1);

  const buscar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dataInicio)    params.append("data_inicio", dataInicio);
      if (dataFim)       params.append("data_fim",    dataFim);
      if (filtroVeiculo) params.append("veiculo_id",  filtroVeiculo);

      const data = await api.get(`/veiculos/historico?${params.toString()}`);
      setAbastecimentos(data.abastecimentos || []);
      setKpis(data.kpis || null);
      setVeiculos(data.veiculos || []);
    } catch (err) {
      console.error("VeiculosHistorico:", err);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, filtroVeiculo]);

  useEffect(() => { buscar(); }, [buscar]);
  useEffect(() => { setPagina(1); }, [abastecimentos, agrupamento, busca]);

  /* Filtro local por busca (veículo, posto, registrado por) */
  const filtrados = useMemo(() => {
    if (!busca.trim()) return abastecimentos;
    const b = busca.toLowerCase();
    return abastecimentos.filter((ab) =>
      (ab.veiculo_nome || "").toLowerCase().includes(b) ||
      (ab.placa || "").toLowerCase().includes(b) ||
      (ab.posto_nome || "").toLowerCase().includes(b) ||
      (ab.registrado_por_nome || "").toLowerCase().includes(b)
    );
  }, [abastecimentos, busca]);

  /* Agrupamento */
  const grupos = useMemo(() => {
    if (agrupamento === "nenhum") return null;

    const map = new Map();
    filtrados.forEach((ab) => {
      let key, label;
      if (agrupamento === "veiculo") {
        key = String(ab.veiculo_id);
        label = `${ab.veiculo_nome}${ab.placa ? ` · ${ab.placa}` : ""}`;
      } else {
        key = ab.data?.slice(0, 7) || "—";
        label = key !== "—" ? mesLabel(ab.data) : "Sem data";
      }
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key).items.push(ab);
    });
    return Array.from(map.values());
  }, [filtrados, agrupamento]);

  /* Paginação (somente na vista plana) */
  const totalPaginas = agrupamento === "nenhum" ? Math.ceil(filtrados.length / POR_PAGINA) : 1;
  const paginados    = agrupamento === "nenhum"
    ? filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
    : filtrados;

  /* Export XLSX */
  function exportarXLSX() {
    const linhas = filtrados.map((ab) => ({
      "Data":           ab.data ? new Date(ab.data + "T12:00:00").toLocaleDateString("pt-BR") : "—",
      "Veículo":        ab.veiculo_nome || "—",
      "Placa":          ab.placa || "—",
      "KM":             ab.km_atual ?? "—",
      "Litros":         ab.litros ?? "—",
      "Valor total":    ab.valor_total ?? "—",
      "R$/L":           ab.litros && ab.valor_total ? (Number(ab.valor_total) / Number(ab.litros)).toFixed(2) : "—",
      "Combustível":    COMB_LABEL[ab.combustivel] || ab.combustivel || "—",
      "Posto":          ab.posto_nome || "—",
      "Registrado por": ab.registrado_por_nome || "—",
      "Observações":    ab.observacoes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Abastecimentos");
    const d = new Date();
    XLSX.writeFile(wb, `abastecimentos_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}.xlsx`);
  }

  function limparFiltros() {
    setBusca(""); setFiltroVeiculo(""); setAgrupamento("nenhum");
    setDataInicio(defaultInicio); setDataFim(defaultFim);
  }

  return (
    <div className="ek-page">

      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Histórico de Veículos</h1>
          <p>Todos os abastecimentos registrados — filtre, agrupe e exporte</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="ek-btn ek-btn-secondary"
            onClick={exportarXLSX}
            disabled={filtrados.length === 0}
            title="Exportar para Excel"
          >
            ⬇ Exportar .xlsx
          </button>
          <Link to="/veiculos" className="ek-btn ek-btn-secondary">
            ← Voltar aos Veículos
          </Link>
        </div>
      </div>

      {/* TOOLBAR */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="ek-toolbar-group" style={{ flex: 2, minWidth: 180 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Veículo, placa, posto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="ek-toolbar-group">
          <label>Veículo</label>
          <select value={filtroVeiculo} onChange={(e) => setFiltroVeiculo(e.target.value)}>
            <option value="">Todos</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}{v.placa ? ` · ${v.placa}` : ""}
              </option>
            ))}
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
          <label>Agrupar por</label>
          <select value={agrupamento} onChange={(e) => setAgrupamento(e.target.value)}>
            <option value="nenhum">Sem agrupamento</option>
            <option value="veiculo">Veículo</option>
            <option value="mes">Mês</option>
          </select>
        </div>
        <button
          className="ek-btn ek-btn-secondary"
          style={{ padding: "8px 14px", fontSize: 12, flexShrink: 0 }}
          onClick={limparFiltros}
        >
          Limpar tudo
        </button>
      </div>

      {/* STATS */}
      {kpis && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Abastecimentos", value: filtrados.length, cor: "#3b82f6" },
            { label: "Total litros",   value: fmtL(filtrados.reduce((s, a) => s + Number(a.litros || 0), 0)), cor: "#eab308" },
            { label: "Total gasto",    value: fmtR(filtrados.reduce((s, a) => s + Number(a.valor_total || 0), 0)), cor: "#ef4444" },
            { label: "Média R$/L",     value: (() => {
                const totalL = filtrados.reduce((s, a) => s + Number(a.litros || 0), 0);
                const totalV = filtrados.reduce((s, a) => s + Number(a.valor_total || 0), 0);
                return totalL > 0 ? `R$ ${(totalV / totalL).toFixed(2)}` : "—";
              })(), cor: "#a07cff" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderTop: `3px solid ${s.cor}`,
                borderRadius: "var(--radius-md)",
                padding: "12px 20px",
                minWidth: 140,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text)", lineHeight: 1 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONTEÚDO */}
      {loading ? (
        <div className="ek-empty"><p>Carregando...</p></div>
      ) : filtrados.length === 0 ? (
        <div className="ek-empty">
          <div className="ek-empty-icon">⛽</div>
          <p>Nenhum abastecimento encontrado para os filtros selecionados.</p>
        </div>
      ) : grupos ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {grupos.map((grupo) => (
            <div key={grupo.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)" }}>
                  {grupo.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", background: "var(--color-surface-soft)", border: "1px solid var(--color-border)", padding: "1px 7px", borderRadius: 999 }}>
                  {grupo.items.length} {grupo.items.length === 1 ? "registro" : "registros"}
                  {" · "}
                  {fmtL(grupo.items.reduce((s, a) => s + Number(a.litros || 0), 0))}
                  {" · "}
                  {fmtR(grupo.items.reduce((s, a) => s + Number(a.valor_total || 0), 0))}
                </span>
              </div>
              <TabelaAbastecimentos items={grupo.items} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <TabelaAbastecimentos items={paginados} />
          {totalPaginas > 1 && (
            <div className="ag-hist-paginacao">
              <button className="ag-hist-pag-btn" disabled={pagina === 1} onClick={() => setPagina(1)}>«</button>
              <button className="ag-hist-pag-btn" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>‹</button>
              <span className="ag-hist-pag-info">
                Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
                <span className="ag-hist-pag-total"> — {filtrados.length} registros</span>
              </span>
              <button className="ag-hist-pag-btn" disabled={pagina === totalPaginas} onClick={() => setPagina((p) => p + 1)}>›</button>
              <button className="ag-hist-pag-btn" disabled={pagina === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabelaAbastecimentos({ items }) {
  return (
    <div className="hist-table-wrap">
      <div className="hist-table-scroll">
        <table className="hist-table">
          <thead>
            <tr>
              <th style={{ minWidth: 90 }}>Data</th>
              <th style={{ minWidth: 160 }}>Veículo</th>
              <th style={{ minWidth: 90 }}>KM</th>
              <th style={{ minWidth: 90 }}>Litros</th>
              <th style={{ minWidth: 100 }}>Valor total</th>
              <th style={{ minWidth: 80 }}>R$/L</th>
              <th style={{ minWidth: 90 }}>Combustível</th>
              <th style={{ minWidth: 130 }}>Posto</th>
              <th style={{ minWidth: 130 }}>Registrado por</th>
              <th style={{ minWidth: 160 }}>Observações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ab) => (
              <tr key={ab.id} className="hist-row">
                <td className="hist-td">
                  <span className="hist-cell-date">
                    {ab.data ? new Date(ab.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                  </span>
                </td>
                <td className="hist-td">
                  <span className="hist-cell-title">{ab.veiculo_nome}</span>
                  {ab.placa && <span className="hist-cell-sub">{ab.placa}</span>}
                </td>
                <td className="hist-td" style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtKm(ab.km_atual)}
                </td>
                <td className="hist-td" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtL(ab.litros)}
                </td>
                <td className="hist-td" style={{ color: ab.valor_total ? "#ef4444" : "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtR(ab.valor_total)}
                </td>
                <td className="hist-td" style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtPpl(ab.litros, ab.valor_total)}
                </td>
                <td className="hist-td">
                  {ab.combustivel ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                      background: `color-mix(in srgb, ${COMB_COR[ab.combustivel] || "#94a3b8"} 15%, transparent)`,
                      color: COMB_COR[ab.combustivel] || "#94a3b8",
                      border: `1px solid color-mix(in srgb, ${COMB_COR[ab.combustivel] || "#94a3b8"} 30%, transparent)`,
                    }}>
                      {COMB_LABEL[ab.combustivel] || ab.combustivel}
                    </span>
                  ) : <span className="hist-empty">—</span>}
                </td>
                <td className="hist-td" style={{ color: "var(--color-text-secondary)" }}>
                  {ab.posto_nome || <span className="hist-empty">—</span>}
                </td>
                <td className="hist-td" style={{ color: "var(--color-text-secondary)" }}>
                  {ab.registrado_por_nome || <span className="hist-empty">—</span>}
                </td>
                <td className="hist-td" style={{ color: "var(--color-text-muted)", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={ab.observacoes || ""}>
                  {ab.observacoes || <span className="hist-empty">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
