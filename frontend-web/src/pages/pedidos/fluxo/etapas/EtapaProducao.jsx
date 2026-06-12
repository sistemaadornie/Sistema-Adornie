import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";

export default function EtapaProducao({ pedidoId, pedido, etapas, onClose, onRecarregar }) {
  const [itens, setItens] = useState(pedido?.itens || []);
  const [salvando, setSalvando] = useState({});

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

  const etapa3 = etapas.find((e) => e.numero === 3) || {};
  const p = etapa3.progresso || {};

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
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
        </div>
      </div>
    </div>
  );
}
