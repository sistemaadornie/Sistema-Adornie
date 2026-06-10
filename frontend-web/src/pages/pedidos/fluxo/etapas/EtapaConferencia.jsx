import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalSelecionarItensInstalacao from "../../ModalSelecionarItensInstalacao";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaConferencia({ pedidoId, pedido, etapas, preAgendamentos, onClose }) {
  const navigate = useNavigate();
  const [agendandoConf, setAgendandoConf] = useState(null);

  const etapa2 = etapas.find((e) => e.numero === 2) || {};
  const p = etapa2.progresso || {};

  const genitores = preAgendamentos || [];

  function handleAgendarConferencia(genitor, itensSel) {
    setAgendandoConf(null);
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:         pedido.id,
          pedido_numero:     pedido.numero_sequencial || pedido.numero_origem,
          cliente:           pedido.cliente_nome || "",
          cliente_id:        pedido.cliente_id || null,
          cep:               pedido.cep,
          rua:               pedido.rua,
          numero:            pedido.numero_rua,
          complemento:       pedido.complemento,
          bairro:            pedido.bairro,
          cidade:            pedido.cidade,
          estado:            pedido.estado,
          itens:             itensSel,
          agendamento_pai_id: genitor.id,
          tipo:              "Conferência",
        },
      },
    });
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 2</div>
            <div className="pf-modal-titulo">📐 Conferência de Medidas</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.conferidos ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Itens conferidos</div>
            </div>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{(p.total ?? 0) - (p.conferidos ?? 0)}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Pendentes</div>
            </div>
          </div>

          <hr className="pf-separador" />

          <div style={{ fontWeight: 700, marginBottom: 12 }}>Genitores e conferências</div>

          {genitores.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum pré-agendamento criado. Crie um na Etapa 1 primeiro.
            </div>
          )}

          {genitores.map((g) => (
            <div key={g.id} style={{ border: "1px solid var(--pf-separador)", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Entrega: {fmtData(g.data_inicio)}</div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(g.itens || []).length} itens</div>
                </div>
                <button className="pf-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => setAgendandoConf(g)}>
                  + Agendar Conferência
                </button>
              </div>
              {(g.herdeiros || []).filter((h) => h.tipo !== "Instalação").length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.herdeiros.filter((h) => h.tipo !== "Instalação").map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>Conferência — {fmtData(h.data_inicio)}</div>
                      <span className={`pf-badge ${h.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>{h.status}</span>
                    </div>
                  ))}
                </div>
              )}
              {(g.itens || []).length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.itens.map((item) => (
                    <div key={item.pedido_item_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>{item.descricao}</div>
                      {item.ficha_preenchida ? (
                        <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => navigate(`/pedidos/os/${item.ordem_servico_id}`)}>
                          Visualizar Ficha
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Aguardando técnico</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {agendandoConf && (
        <ModalSelecionarItensInstalacao
          pedido={pedido}
          itensEndpoint={`/pedidos/${pedidoId}/itens-disponiveis-conferencia?genitor_id=${agendandoConf.id}`}
          onClose={() => setAgendandoConf(null)}
          onContinuar={(itensSel) => handleAgendarConferencia(agendandoConf, itensSel)}
        />
      )}
    </div>
  );
}
