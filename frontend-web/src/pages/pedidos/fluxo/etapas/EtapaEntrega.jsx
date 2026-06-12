import React, { useState } from "react";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaEntrega({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [concluindo, setConcluindo] = useState({});

  const instalacoes = (preAgendamentos || [])
    .flatMap((g) => g.herdeiros || [])
    .filter((h) => h.tipo === "Instalação");

  async function marcarConcluida(agendamentoId) {
    setConcluindo((s) => ({ ...s, [agendamentoId]: true }));
    try {
      const fd = new FormData();
      fd.append("status", "concluido");
      await api.put(`/agendamentos/${agendamentoId}/status`, fd, true);
      onRecarregar();
    } catch (e) {
      alert(e?.message || "Erro ao marcar entrega como concluída.");
    } finally {
      setConcluindo((s) => ({ ...s, [agendamentoId]: false }));
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 7</div>
            <div className="pf-modal-titulo">🚚 Entrega</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Confirme a entrega/instalação dos itens no cliente.
          </p>

          {instalacoes.length === 0 ? (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhuma instalação agendada.
            </div>
          ) : (
            instalacoes.map((inst) => {
              const concluida = inst.status === "concluido";
              return (
                <div key={inst.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>Instalação — {fmtData(inst.data_inicio)}</div>
                  </div>
                  {concluida ? (
                    <span className="pf-badge pf-badge-ok">Concluída</span>
                  ) : (
                    <button className="pf-btn-primary" style={{ fontSize: 13 }}
                      onClick={() => marcarConcluida(inst.id)}
                      disabled={!!concluindo[inst.id]}>
                      ✅ Marcar como concluída
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
