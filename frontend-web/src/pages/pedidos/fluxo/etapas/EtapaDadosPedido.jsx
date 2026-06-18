import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalSelecionarItensInstalacao from "../../ModalSelecionarItensInstalacao";
import EditarPedidoModal from "./EditarPedidoModal";
import HistoricoPedidoModal from "./HistoricoPedidoModal";
import VincularItensModal from "./VincularItensModal";
import SelecionarTipoPersianaModal from "./SelecionarTipoPersianaModal";
import { numeroPedidoCompleto } from "../../../../utils/numeroPedido";
import { primeiroEUltimoNome } from "../../../../utils/nomeCliente";
import { api } from "../../../../services/api";

function fmtData(iso) {
  if (!iso) return "—";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

function CriterioItem({ ok, texto }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{ok ? "✅" : "⭕"}</span>
      <span style={{ fontSize: 14, color: ok ? "var(--pf-badge-ok-text)" : "var(--pf-modal-text)" }}>{texto}</span>
    </div>
  );
}

export default function EtapaDadosPedido({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [instalacao, setInstalacao] = useState(null);
  const [editando, setEditando] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [selecionandoTipo, setSelecionandoTipo] = useState(false);
  const [definindoConferencia, setDefinindoConferencia] = useState(false);

  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p = etapa1.progresso || {};

  const todasConferenciasFeitasOuDesnecessarias =
    (p.total_itens_conferencia ?? 0) === 0 ||
    (p.itens_cobertos_conferencia ?? 0) >= (p.total_itens_conferencia ?? 1);

  const temItensPendentesEntrega = (p.itens_cobertos ?? 0) < (p.total_itens ?? 0);

  const conferencias = (preAgendamentos || []).filter(
    (ag) => ag.tipo === "Conferência" && ag.status !== "cancelado" && ag.status !== "rejeitado"
  );
  const entregas = (preAgendamentos || []).filter(
    (ag) => ag.tipo === "Instalação" && ag.status !== "cancelado" && ag.status !== "rejeitado"
  );

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

  async function handleDefinirDataEntrega() {
    try {
      const res = await api.get(`/pedidos/${pedidoId}/itens-disponiveis-conferencia-entrega`);
      if ((res.itens || []).length > 0) {
        setDefinindoConferencia(true);
      } else {
        setInstalacao(pedido);
      }
    } catch (e) {
      alert(e.message || "Erro ao verificar itens pendentes de conferência.");
    }
  }

  function handleAgendarConferenciaEntrega(itensSel) {
    setDefinindoConferencia(false);
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
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 1</div>
            <div className="pf-modal-titulo">📋 Pedidos</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="pf-btn-secondary" onClick={() => setVinculando(true)}>🔗 Vincular Itens</button>
            {(p.itens_persiana_pendentes ?? 0) > 0 && (
              <button className="pf-btn-secondary" onClick={() => setSelecionandoTipo(true)}>
                🎛️ Selecionar Tipo ({p.itens_persiana_pendentes})
              </button>
            )}
            <button className="pf-btn-secondary" onClick={() => setEditando(true)}>✏️ Editar Pedido</button>
            <button className="pf-btn-secondary" onClick={() => setHistorico(true)}>🕘 Histórico</button>
            <button className="pf-modal-fechar" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="pf-modal-body">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pf-card-sub)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
              Critérios de conclusão
            </div>
            <CriterioItem ok={p.tem_anexo} texto="Anexo do PDF original" />
            <CriterioItem ok={(p.itens_sem_categoria ?? 1) === 0 && (p.total_itens ?? 0) > 0} texto="Todos os itens com categoria" />
            <CriterioItem ok={(p.itens_sem_vinculo ?? 1) === 0 && (p.total_itens ?? 0) > 0} texto="Todos os itens com vínculo" />
            <CriterioItem ok={p.verificacao_ok} texto="Pedido verificado" />
            <CriterioItem
              ok={todasConferenciasFeitasOuDesnecessarias}
              texto={`Todos os itens com data de conferência definida (${p.itens_cobertos_conferencia ?? 0}/${p.total_itens_conferencia ?? 0})`}
            />
          </div>

          {(p.ambientes_canais_insuficientes?.length ?? 0) > 0 && (
            <div style={{ margin: "12px 0 0 0" }}>
              {p.ambientes_canais_insuficientes.map((a) => (
                <div
                  key={a.ambiente}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "8px 12px", borderRadius: 8, marginBottom: 6,
                    background: "rgba(255, 160, 0, 0.12)",
                    border: "1px solid rgba(255, 160, 0, 0.35)",
                    fontSize: 13, color: "var(--pf-modal-text)",
                  }}
                >
                  <span style={{ flexShrink: 0 }}>⚠️</span>
                  <span>
                    <strong>{a.ambiente}</strong>: {a.motorizados}{" "}
                    {a.motorizados === 1 ? "item motorizado" : "itens motorizados"}, apenas{" "}
                    {a.canais} {a.canais === 1 ? "canal" : "canais"} no controle.
                    Verifique o controle ou adicione outro.
                  </span>
                </div>
              ))}
            </div>
          )}

          <hr className="pf-separador" />

          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14 }}>DATA DE CONFERÊNCIA</div>

          {conferencias.length === 0 && (p.total_itens_conferencia ?? 0) > 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 12 }}>
              Nenhuma conferência agendada ainda.
            </div>
          )}
          {(p.total_itens_conferencia ?? 0) === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 12 }}>
              Nenhum item deste pedido necessita de conferência.
            </div>
          )}

          {conferencias.map((ag) => (
            <div key={ag.id} style={{ padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Conferência: {fmtData(ag.data_inicio)}</span>
                <span className={`pf-badge ${ag.status === "agendado" ? "pf-badge-ok" : "pf-badge-pend"}`}>
                  {ag.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>
                {(ag.itens || []).length} itens vinculados
              </div>
            </div>
          ))}

          {!todasConferenciasFeitasOuDesnecessarias && (
            <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={handleDefinirDataEntrega}>
              DEFINIR DATA DE CONFERÊNCIA
            </button>
          )}

          {todasConferenciasFeitasOuDesnecessarias && (
            <>
              <hr className="pf-separador" style={{ marginTop: 16 }} />
              <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14 }}>DATA DE ENTREGA (PRÉ AGENDAMENTO)</div>

              {entregas.length === 0 && (
                <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 12 }}>
                  Nenhum pré-agendamento de entrega criado ainda.
                </div>
              )}

              {entregas.map((ag) => (
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

              {temItensPendentesEntrega && (
                <button className="pf-btn-primary" style={{ marginTop: 8 }} onClick={() => setInstalacao(pedido)}>
                  DEFINIR PRÉ-AGENDAMENTO DE ENTREGA
                </button>
              )}
            </>
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

      {definindoConferencia && (
        <ModalSelecionarItensInstalacao
          pedido={pedido}
          itensEndpoint={`/pedidos/${pedidoId}/itens-disponiveis-conferencia-entrega`}
          titulo={`Agendar Conferência — ${numeroPedidoCompleto(pedido)}`}
          textoVazio="Todos os itens deste pedido já têm conferência agendada."
          onClose={() => setDefinindoConferencia(false)}
          onContinuar={handleAgendarConferenciaEntrega}
        />
      )}

      {editando && (
        <EditarPedidoModal
          pedidoId={pedidoId}
          onClose={() => setEditando(false)}
          onSalvo={() => { setEditando(false); onRecarregar?.(); }}
        />
      )}

      {historico && (
        <HistoricoPedidoModal
          pedidoId={pedidoId}
          onClose={() => setHistorico(false)}
        />
      )}

      {vinculando && (
        <VincularItensModal
          pedidoId={pedidoId}
          onClose={() => setVinculando(false)}
          onRecarregar={onRecarregar}
        />
      )}

      {selecionandoTipo && (
        <SelecionarTipoPersianaModal
          pedidoId={pedidoId}
          onClose={() => setSelecionandoTipo(false)}
          onRecarregar={onRecarregar}
        />
      )}
    </div>
  );
}
