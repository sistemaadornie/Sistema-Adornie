import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";

export default function EtapaConferenciaProduto({ pedidoId, pedido, etapas, onClose, onRecarregar }) {
  const [itens, setItens] = useState(pedido?.itens || []);
  const [salvando, setSalvando] = useState({});

  useEffect(() => { setItens(pedido?.itens || []); }, [pedido]);

  async function toggleProdutoOk(itemId, valor) {
    setSalvando((s) => ({ ...s, [itemId]: true }));
    try {
      await api.patch(`/pedidos/${pedidoId}/conferencia-produto-itens`, {
        pedido_item_id: itemId,
        produto_ok: valor,
      });
      onRecarregar();
    } finally {
      setSalvando((s) => ({ ...s, [itemId]: false }));
    }
  }

  const etapa4 = etapas.find((e) => e.numero === 4) || {};
  const p = etapa4.progresso || {};

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div>
            <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 2 }}>ETAPA 4</div>
            <div className="pf-modal-titulo">🔍 Conferência do Produto</div>
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          <p style={{ fontSize: 13, color: "var(--pf-card-sub)", marginBottom: 20 }}>
            Confira a qualidade dos itens produzidos e o recebimento dos itens comprados.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{p.itens_produto_ok ?? 0}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Conferidos</div>
            </div>
            <div style={{ flex: 1, padding: "12px 16px", background: "var(--pf-btn-secondary-bg)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{(p.total_itens ?? 0) - (p.itens_produto_ok ?? 0)}</div>
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>Pendentes</div>
            </div>
          </div>

          <hr className="pf-separador" />

          {itens.map((item) => (
            <div key={item.id} className="pf-item-row">
              <div style={{ flex: 1 }}>
                <div className="pf-item-descricao">{item.descricao}</div>
                {item.ambiente && <div className="pf-item-ambiente">{item.ambiente}</div>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!item.produto_ok}
                  onChange={() => toggleProdutoOk(item.id, !item.produto_ok)}
                  disabled={!!salvando[item.id]} />
                Conferido
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
