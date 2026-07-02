import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ModalSelecionarItensInstalacao from "../../ModalSelecionarItensInstalacao";
import { api } from "../../../../services/api";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaProducao({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [itens, setItens] = useState(pedido?.itens || []);
  const [salvando, setSalvando] = useState({});
  const [instalacao, setInstalacao] = useState(null);

  useEffect(() => { setItens(pedido?.itens || []); }, [pedido]);

  async function toggleCampo(itemId, campo, valor) {
    setSalvando((s) => ({ ...s, [itemId]: true }));
    try {
      await api.patch(`/pedidos/${pedidoId}/producao-itens`, {
        pedido_item_id: itemId,
        [campo]: valor,
      });
      onRecarregar();
    } finally {
      setSalvando((s) => ({ ...s, [itemId]: false }));
    }
  }

  function handleAgendarInstalacao(itensSel) {
    setInstalacao(null);
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:     pedido.id,
          pedido_numero: numeroPedidoCompleto(pedido),
          cliente:       pedido.cliente_nome || "",
          cliente_id:    pedido.cliente_id || null,
          cep:           pedido.cep,
          rua:           pedido.rua,
          numero:        pedido.numero_rua,
          complemento:   pedido.complemento,
          bairro:        pedido.bairro,
          cidade:        pedido.cidade,
          estado:        pedido.estado,
          itens:         itensSel,
        },
      },
    });
  }

  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p1 = etapa1.progresso || {};
  const etapa2 = etapas.find((e) => e.numero === 2) || {};
  const conferenciaTecnicaConcluida = !!etapa2.concluida;
  const etapa3 = etapas.find((e) => e.numero === 3) || {};
  const p = etapa3.progresso || {};

  const temItensPendentesEntrega = (p1.itens_cobertos ?? 0) < (p1.total_itens ?? 0);
  const entregas = (preAgendamentos || []).filter(
    (ag) => ag.tipo === "Instalação" && ag.status !== "cancelado" && ag.status !== "rejeitado"
  );

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 3</div>
            <div className="pf-modal-titulo">⚙️ Produção/Compras</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.em_confeccao ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Em confecção</div>
            </div>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.confeccao_ok ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Concluídos</div>
            </div>
          </div>

          <hr className="pf-separador" />

          {itens.map((item) => (
            <div key={item.id} className="pf-item-row">
              <div style={{ flex: 1 }}>
                <div className="pf-item-descricao">{item.descricao}</div>
                {item.ambiente && <div className="pf-item-ambiente">{item.ambiente}</div>}
              </div>

              {!item.em_confeccao && (
                <>
                  <span className="pf-badge" style={{
                    fontSize: 11,
                    background: (item.categoria_cor || "#C9A96E") + "22",
                    color: item.categoria_cor || "#C9A96E",
                    border: `1px solid ${(item.categoria_cor || "#C9A96E")}44`,
                  }}>{item.categoria_nome || "Sem categoria"}</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={false}
                      onChange={() => toggleCampo(item.id, "em_confeccao", true)}
                      disabled={!!salvando[item.id]} />
                    Em confecção
                  </label>
                </>
              )}

              {item.em_confeccao && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={true}
                      onChange={() => toggleCampo(item.id, "em_confeccao", false)}
                      disabled={!!salvando[item.id]} />
                    Em confecção
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!item.confeccao_ok}
                      onChange={() => toggleCampo(item.id, "confeccao_ok", !item.confeccao_ok)}
                      disabled={!!salvando[item.id]} />
                    Produção concluída
                  </label>
                </>
              )}
            </div>
          ))}

          <hr className="pf-separador" />

          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14 }}>DATA DE ENTREGA (PRÉ AGENDAMENTO)</div>

          {!conferenciaTecnicaConcluida && (
            <div
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "8px 12px", borderRadius: 8, marginBottom: 12,
                background: "rgba(255, 160, 0, 0.12)",
                border: "1px solid rgba(255, 160, 0, 0.35)",
                fontSize: 13, color: "var(--pf-modal-text)",
              }}
            >
              <span style={{ flexShrink: 0 }}>⚠️</span>
              <span>
                A data de entrega só pode ser definida depois que a Conferência de Medidas (Etapa 2) for concluída.
              </span>
            </div>
          )}

          {conferenciaTecnicaConcluida && entregas.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 12 }}>
              Nenhum pré-agendamento de entrega criado ainda.
            </div>
          )}

          {conferenciaTecnicaConcluida && entregas.map((ag) => (
            <div key={ag.id} style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Entrega: {fmtData(ag.data_inicio)}</span>
                <span className={`pf-badge ${ag.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>
                  {ag.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>
                {(ag.itens || []).length} itens vinculados
              </div>
            </div>
          ))}

          {conferenciaTecnicaConcluida && temItensPendentesEntrega && (
            <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={() => setInstalacao(pedido)}>
              DEFINIR PRÉ-AGENDAMENTO DE ENTREGA
            </button>
          )}
        </div>
      </div>

      {instalacao && (
        <ModalSelecionarItensInstalacao
          pedido={instalacao}
          onClose={() => setInstalacao(null)}
          onContinuar={handleAgendarInstalacao}
        />
      )}
    </div>
  );
}
