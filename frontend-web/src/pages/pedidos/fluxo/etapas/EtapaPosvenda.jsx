import React, { useState } from "react";
import { api } from "../../../../services/api";

export default function EtapaPosvenda({ pedidoId, pedido, etapas, preAgendamentos, onClose, onRecarregar }) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const jaConcluido = pedido.status === "concluido";

  async function encerrar() {
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      await api.post(`/pedidos/${pedidoId}/pesquisa-satisfacao`, { texto });
      onRecarregar();
      onClose();
    } catch (e) {
      alert(e?.message || "Erro ao encerrar pedido.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 5</div>
            <div className="pf-modal-titulo">⭐ Pós-venda</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          {jaConcluido ? (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Pedido encerrado!</div>
              <div style={{ color: "var(--pf-card-sub)", fontSize: 14 }}>Este pedido foi concluído com sucesso.</div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: "var(--pf-card-sub)", marginBottom: 20 }}>
                Registre o feedback do cliente e encerre o pedido.
              </p>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                  O que o cliente achou? *
                </label>
                <textarea className="pf-input" rows={5}
                  placeholder="Descreva o feedback do cliente sobre o serviço prestado..."
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)} />
              </div>
              <button className="pf-btn-primary"
                onClick={encerrar}
                disabled={!texto.trim() || salvando}
                style={{ width: "100%" }}>
                {salvando ? "Encerrando..." : "✅ Encerrar Pedido"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
