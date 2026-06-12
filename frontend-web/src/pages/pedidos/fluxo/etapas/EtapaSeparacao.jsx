import React, { useState } from "react";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaSeparacao({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [salvando, setSalvando] = useState({});

  const etapa6 = etapas.find((e) => e.numero === 6) || {};
  const p = etapa6.progresso || {};

  const instalacoes = (preAgendamentos || [])
    .flatMap((g) => g.herdeiros || [])
    .filter((h) => h.tipo === "Instalação");

  async function toggleSeparado(agendamentoId, pedidoItemId, valor) {
    const key = `${agendamentoId}-${pedidoItemId}`;
    setSalvando((s) => ({ ...s, [key]: true }));
    try {
      await api.patch(`/agendamentos/${agendamentoId}/itens/${pedidoItemId}/separado`, {
        separado: valor,
      });
      onRecarregar();
    } finally {
      setSalvando((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 6</div>
            <div className="pf-modal-titulo">📦 Separação</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Separe os itens do pedido na bancada para a equipe de instalação.
          </p>

          {instalacoes.length === 0 ? (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhuma instalação agendada. Conclua a etapa 5 primeiro.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{p.itens_separados ?? 0}</div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Separados</div>
                </div>
                <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{(p.total_itens_instalacao ?? 0) - (p.itens_separados ?? 0)}</div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Pendentes</div>
                </div>
              </div>

              <hr className="pf-separador" />

              {instalacoes.map((inst) => (
                <div key={inst.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    Instalação — {fmtData(inst.data_inicio)}
                  </div>
                  {(inst.itens || []).map((item) => (
                    <div key={item.pedido_item_id} className="pf-item-row">
                      <div style={{ flex: 1 }}>
                        <div className="pf-item-descricao">{item.descricao}</div>
                        {item.ambiente && <div className="pf-item-ambiente">{item.ambiente}</div>}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!item.separado}
                          onChange={() => toggleSeparado(inst.id, item.pedido_item_id, !item.separado)}
                          disabled={!!salvando[`${inst.id}-${item.pedido_item_id}`]} />
                        Separado
                      </label>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
