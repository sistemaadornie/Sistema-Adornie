import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { acaoFichaConferencia, abrirOsDoItem } from "../../../../utils/fichaConferencia";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";
import { primeiroEUltimoNome } from "../../../../utils/nomeCliente";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

export default function EtapaConferencia({ pedido, etapas, preAgendamentos, onClose }) {
  const navigate = useNavigate();
  const [criandoId, setCriandoId] = useState(null);

  const etapa2 = etapas.find((e) => e.numero === 2) || {};
  const p = etapa2.progresso || {};

  const genitores = preAgendamentos || [];

  function remarcarConferencia(g) {
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
          itens:         (g.itens || []).map((it) => ({ pedido_item_id: it.pedido_item_id, nome: it.descricao })),
          tipo:          "Conferência",
          status:        "agendado",
          titulo:        `Conferência - ${primeiroEUltimoNome(pedido.cliente_nome)} - ${numeroPedidoCompleto(pedido)}`,
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
              <div style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {g.tipo === "Conferência" ? "Conferência" : "Entrega"}: {fmtData(g.data_inicio)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{(g.itens || []).length} itens</div>
                </div>
                {g.status === "nao_concluido" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div>
                      <span className="pf-badge pf-badge-err">Não concluído — necessário remarcar</span>
                      {g.observacoes_status && (
                        <div style={{ fontSize: 11, color: "var(--pf-card-sub)", marginTop: 2, textAlign: "right" }}>
                          {g.observacoes_status}
                        </div>
                      )}
                    </div>
                    {g.tipo === "Conferência" && (
                      <button className="pf-btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => remarcarConferencia(g)}>
                        🔁 Remarcar
                      </button>
                    )}
                  </div>
                )}
              </div>
              {(g.herdeiros || []).filter((h) => h.tipo !== "Instalação").length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.herdeiros.filter((h) => h.tipo !== "Instalação").map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
                      <div style={{ fontSize: 13 }}>Conferência — {fmtData(h.data_inicio)}</div>
                      {h.status === "nao_concluido" ? (
                        <span className="pf-badge pf-badge-err" title={h.observacoes_status || ""}>Não concluído</span>
                      ) : (
                        <span className={`pf-badge ${h.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>{h.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(g.itens || []).length > 0 && (
                <div style={{ padding: "10px 14px" }}>
                  {g.itens.map((item) => {
                    const acao = acaoFichaConferencia(item);
                    return (
                      <div key={item.pedido_item_id} className="pf-item-card">
                        <span className="pf-item-num">{Number.isFinite(item.ordem) ? item.ordem + 1 : "—"}</span>
                        <div className="pf-item-card-conteudo">
                          <div className="pf-item-card-desc">{item.descricao}</div>
                          {item.medidas && <span className="pf-item-medidas">📐 {item.medidas}</span>}
                        </div>
                        {acao ? (
                          <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                            disabled={criandoId === item.pedido_item_id}
                            onClick={async () => {
                              setCriandoId(item.pedido_item_id);
                              try {
                                const osId = await abrirOsDoItem(item);
                                navigate(acao.rota === "confeccao" ? `/pedidos/os/${osId}/confeccao` : `/pedidos/os/${osId}`);
                              } finally {
                                setCriandoId(null);
                              }
                            }}>
                            {criandoId === item.pedido_item_id ? "Abrindo..." : acao.label}
                          </button>
                        ) : item.tipo_confeccao ? (
                          <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Aguardando Conferência Consultoras (Etapa 1)</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Sem ficha de confecção</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
