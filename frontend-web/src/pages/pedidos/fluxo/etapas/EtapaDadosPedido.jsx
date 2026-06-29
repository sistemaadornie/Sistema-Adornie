import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import EditarPedidoModal from "./EditarPedidoModal";
import HistoricoPedidoModal from "./HistoricoPedidoModal";
import VincularItensModal from "./VincularItensModal";
import SelecionarTipoPersianaModal from "./SelecionarTipoPersianaModal";
import { api } from "../../../../services/api";
import { abrirOsDoItem } from "../../../../utils/fichaConferencia";

function CriterioItem({ ok, texto }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{ok ? "✅" : "⭕"}</span>
      <span style={{ fontSize: 14, color: ok ? "var(--pf-badge-ok-text)" : "var(--pf-modal-text)" }}>{texto}</span>
    </div>
  );
}

export default function EtapaDadosPedido({ pedidoId, etapas, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [selecionandoTipo, setSelecionandoTipo] = useState(false);
  const [pendentesConsultoras, setPendentesConsultoras] = useState([]);
  const [carregandoPendentes, setCarregandoPendentes] = useState(true);
  const [abrindoItemId, setAbrindoItemId] = useState(null);

  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p = etapa1.progresso || {};

  useEffect(() => {
    let ativo = true;
    setCarregandoPendentes(true);
    api.get(`/pedidos/${pedidoId}/itens-pendentes-conferencia-consultoras`)
      .then((res) => { if (ativo) setPendentesConsultoras(res.itens || []); })
      .finally(() => { if (ativo) setCarregandoPendentes(false); });
    return () => { ativo = false; };
  }, [pedidoId]);

  const todasConferenciasFeitasOuDesnecessarias =
    (p.total_itens_conferencia ?? 0) === 0 ||
    (p.itens_cobertos_conferencia ?? 0) >= (p.total_itens_conferencia ?? 1);

  async function preencherConferenciaConsultoras(item) {
    setAbrindoItemId(item.pedido_item_id);
    try {
      const osId = await abrirOsDoItem(item);
      navigate(`/pedidos/os/${osId}/conferencia-consultoras`);
    } finally {
      setAbrindoItemId(null);
    }
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
            <CriterioItem ok={p.verificacao_ok} texto="Pedido verificado" />
            <CriterioItem
              ok={(p.total_itens_conferencia ?? 0) === 0 || (p.itens_com_conferencia_consultoras ?? 0) >= (p.total_itens_conferencia ?? 0)}
              texto={`Todos os itens com Conferência Consultoras preenchida (${p.itens_com_conferencia_consultoras ?? 0}/${p.total_itens_conferencia ?? 0})`}
            />
          </div>

          {(p.itens_sem_categoria ?? 0) > 0 && (
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
                {p.itens_sem_categoria} {p.itens_sem_categoria === 1 ? "item está" : "itens estão"} sem categoria definida.
                Defina a categoria de cada item para concluir esta etapa.
              </span>
            </div>
          )}

          {(p.itens_sem_vinculo ?? 0) > 0 && (
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
                {p.itens_sem_vinculo} {p.itens_sem_vinculo === 1 ? "item está" : "itens estão"} sem vínculo.
                Vincule cada item para concluir esta etapa.
              </span>
            </div>
          )}

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

          {(p.total_itens_conferencia ?? 0) > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14 }}>CONFERÊNCIA CONSULTORAS</div>

              {!carregandoPendentes && pendentesConsultoras.length === 0 && (
                <div style={{ color: "var(--pf-badge-ok-text)", fontSize: 13, marginBottom: 12 }}>
                  Todos os itens já têm Conferência Consultoras preenchida.
                </div>
              )}

              {pendentesConsultoras.map((item) => (
                <div key={item.pedido_item_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.descricao}</div>
                    {item.ambiente && <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{item.ambiente}</div>}
                  </div>
                  <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                    disabled={abrindoItemId === item.pedido_item_id}
                    onClick={() => preencherConferenciaConsultoras(item)}>
                    {abrindoItemId === item.pedido_item_id ? "Abrindo..." : "Preencher Conferência Consultoras"}
                  </button>
                </div>
              ))}
            </>
          )}

          {!todasConferenciasFeitasOuDesnecessarias && (p.total_itens_conferencia ?? 0) > 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 12 }}>
              A data de conferência é definida na Etapa 2 — Conferência de Medidas.
            </div>
          )}
        </div>
      </div>

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
