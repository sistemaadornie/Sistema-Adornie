import React, { useEffect, useState } from "react";
import EditarPedidoModal from "./EditarPedidoModal";
import HistoricoPedidoModal from "./HistoricoPedidoModal";
import VincularItensModal from "./VincularItensModal";
import VerFichasConsultorasModal from "./VerFichasConsultorasModal";

function CriterioItem({ ok, texto }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--pf-separador)" }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{ok ? "✅" : "⭕"}</span>
      <span style={{ fontSize: 14, color: ok ? "var(--pf-badge-ok-text)" : "var(--pf-modal-text)" }}>{texto}</span>
    </div>
  );
}

export default function EtapaDadosPedido({ pedidoId, etapas, onClose, onRecarregar, abrirFichasConsultorasInicial, onFichasConsultorasAbertas }) {
  const [editando, setEditando] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [vendoFichas, setVendoFichas] = useState(!!abrirFichasConsultorasInicial);

  useEffect(() => {
    if (abrirFichasConsultorasInicial) onFichasConsultorasAbertas?.();
    // Consome a flag uma única vez no mount — evita que um remount posterior
    // (disparado pelo próprio onRecarregar do modal de fichas) reabra o modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const etapa1 = etapas.find((e) => e.numero === 1) || {};
  const p = etapa1.progresso || {};

  const todasConferenciasFeitasOuDesnecessarias =
    (p.total_itens_conferencia ?? 0) === 0 ||
    (p.itens_cobertos_conferencia ?? 0) >= (p.total_itens_conferencia ?? 1);

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 1</div>
            <div className="pf-modal-titulo">📋 Pedidos</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="pf-btn-secondary" onClick={() => setVinculando(true)}>🔗 Vincular Itens</button>
            <button className="pf-btn-secondary" onClick={() => setVendoFichas(true)}>👁 Ver Fichas de Consultoras</button>
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

          {!todasConferenciasFeitasOuDesnecessarias && (p.total_itens_conferencia ?? 0) > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ color: "var(--pf-card-sub)", fontSize: 13, marginBottom: 12 }}>
                A data de conferência é definida na Etapa 2 — Conferência de Medidas.
              </div>
            </>
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

      {vendoFichas && (
        <VerFichasConsultorasModal
          pedidoId={pedidoId}
          onClose={() => setVendoFichas(false)}
          onRecarregar={onRecarregar}
        />
      )}
    </div>
  );
}
