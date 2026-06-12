import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaAgendamento({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState({});

  async function confirmarCliente(agendamentoId) {
    setConfirmando((s) => ({ ...s, [agendamentoId]: true }));
    try {
      await api.patch(`/agendamentos/${agendamentoId}/confirmar-cliente`);
      onRecarregar();
    } catch (e) {
      alert(e?.message || "Erro ao confirmar cliente.");
    } finally {
      setConfirmando((s) => ({ ...s, [agendamentoId]: false }));
    }
  }

  function atribuirEquipe(agendamentoId) {
    navigate(`/agendamentos/mapa?agendamento_id=${agendamentoId}`);
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 5</div>
            <div className="pf-modal-titulo">📅 Agendamento (Instalação)</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Confirme com o cliente a data de instalação e atribua a equipe.
          </p>

          {(!preAgendamentos || preAgendamentos.length === 0) && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>Nenhum pré-agendamento encontrado.</div>
          )}

          {(preAgendamentos || []).map((ag) => {
            const confirmado = ag.status === "agendado";
            return (
              <div key={ag.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Entrega: {fmtData(ag.data_inicio)}</div>
                    <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(ag.itens || []).length} itens</div>
                  </div>
                  <span className={`pf-badge ${confirmado ? "pf-badge-ok" : "pf-badge-pend"}`}>
                    {confirmado ? "Confirmado" : "Pré-agendado"}
                  </span>
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {!confirmado ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" id={`conf-${ag.id}`}
                        checked={false}
                        onChange={() => confirmarCliente(ag.id)}
                        disabled={!!confirmando[ag.id]} />
                      <label htmlFor={`conf-${ag.id}`} style={{ fontSize: 14, cursor: "pointer" }}>
                        Cliente contatado — data confirmada
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, color: "var(--pf-badge-ok-text)" }}>✅ Data confirmada com o cliente</span>
                      <button className="pf-btn-primary" style={{ fontSize: 13 }}
                        onClick={() => atribuirEquipe(ag.id)}>
                        🗺️ Atribuir equipe e veículos
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
