import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import "./Orcamentos.css";

const STATUS_META = {
  novo:      { label: "Novo",      cls: "novo"      },
  aprovado:  { label: "Aprovado",  cls: "aprovado"  },
  cancelado: { label: "Cancelado", cls: "cancelado" },
};

function fmtMoeda(v) {
  if (v == null || v === "") return "—";
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function fmtData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function Orcamentos() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isCOMERCIAL = (user.permissoes || []).includes("COMERCIAL") &&
    !(user.permissoes || []).some(p => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));

  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [meuOrcamento, setMeuOrcamento] = useState(false);
  const [toast, setToast] = useState("");

  const mostrarToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      if (busca) params.set("q", busca);
      if (meuOrcamento) params.set("meu", "true");
      const data = await api.get(`/orcamentos?${params}`);
      setOrcamentos(data.orcamentos || []);
    } catch (err) {
      mostrarToast(err.message || "Erro ao carregar orçamentos.");
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, busca, meuOrcamento]);

  useEffect(() => { carregar(); }, [carregar]);

  async function cancelar(id) {
    if (!confirm("Cancelar este orçamento?")) return;
    try {
      await api.post(`/orcamentos/${id}/cancelar`, {});
      mostrarToast("Orçamento cancelado.");
      carregar();
    } catch (err) {
      mostrarToast(err.message || "Erro ao cancelar.");
    }
  }

  return (
    <div className="orc-page">
      {toast && <div style={{ position:"fixed",top:16,right:16,background:"#1f2937",color:"#fff",padding:"10px 18px",borderRadius:8,zIndex:9999 }}>{toast}</div>}

      <div className="orc-header">
        <h1>Orçamentos</h1>
        <button
          style={{ padding:"8px 18px",background:"var(--color-primary)",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:600 }}
          onClick={() => navigate("/orcamentos/novo")}
        >
          + Novo orçamento
        </button>
      </div>

      <div className="orc-filtros">
        <input
          placeholder="Buscar por cliente ou número..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="novo">Novo</option>
          <option value="aprovado">Aprovado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        {isCOMERCIAL && (
          <label className="orc-toggle-meu">
            <input type="checkbox" checked={meuOrcamento} onChange={e => setMeuOrcamento(e.target.checked)} />
            Meus orçamentos
          </label>
        )}
      </div>

      {loading ? (
        <div className="orc-empty">Carregando...</div>
      ) : orcamentos.length === 0 ? (
        <div className="orc-empty">Nenhum orçamento encontrado.</div>
      ) : (
        <div className="orc-table-wrap">
          <table className="orc-table">
            <thead>
              <tr>
                <th>Número</th><th>Cliente</th><th>Consultora</th><th>Arquiteto</th>
                <th>Total</th><th>Status</th><th>Data</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {orcamentos.map(o => {
                const meta = STATUS_META[o.status] || { label: o.status, cls: "novo" };
                const podeAprovar = (user.permissoes || []).some(p => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));
                return (
                  <tr key={o.id}>
                    <td><strong>{o.numero}</strong></td>
                    <td>{o.cliente_nome || "—"}</td>
                    <td>{o.consultora_nome || "—"}</td>
                    <td>{o.arquiteto_nome || "—"}</td>
                    <td>{fmtMoeda(o.valor_total)}</td>
                    <td><span className={`orc-badge ${meta.cls}`}>{meta.label}</span></td>
                    <td>{fmtData(o.created_at)}</td>
                    <td>
                      <div className="orc-actions">
                        <button onClick={() => navigate(`/orcamentos/${o.id}/editar`)}>
                          {o.status === "novo" ? "Editar" : "Ver"}
                        </button>
                        {o.status === "novo" && podeAprovar && (
                          <button onClick={() => navigate(`/orcamentos/${o.id}/editar?aprovar=1`)}>
                            Aprovar
                          </button>
                        )}
                        {o.status === "novo" && podeAprovar && (
                          <button className="danger" onClick={() => cancelar(o.id)}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}