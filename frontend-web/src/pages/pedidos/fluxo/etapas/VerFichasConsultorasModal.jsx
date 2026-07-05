import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../services/api";
import { abrirOsDoItem } from "../../../../utils/fichaConferencia";
import { fmtMedidas } from "../../../../utils/formatMedidas";

export default function VerFichasConsultorasModal({ pedidoId, onClose, onRecarregar }) {
  const navigate = useNavigate();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [abrindoId, setAbrindoId] = useState(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.get(`/pedidos/${pedidoId}/itens-conferencia-consultoras`)
      .then((res) => { if (ativo) setItens(res.itens || []); })
      .catch((e) => { if (ativo) setErro(e?.message || "Erro ao carregar fichas."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [pedidoId]);

  function verFicha(item) {
    navigate(`/pedidos/os/${item.ordem_servico_id}/conferencia-consultoras`, {
      state: { readOnly: true, voltarPedidoFluxoId: pedidoId },
    });
  }

  async function preencherFicha(item) {
    setAbrindoId(item.pedido_item_id);
    try {
      const osId = await abrirOsDoItem(item);
      navigate(`/pedidos/os/${osId}/conferencia-consultoras`, {
        state: { voltarPedidoFluxoId: pedidoId },
      });
    } finally {
      setAbrindoId(null);
    }
  }

  function handleFechar() {
    onRecarregar?.();
    onClose();
  }

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">👁 Fichas de Conferência Consultoras</div>
          <button className="pf-modal-fechar" onClick={handleFechar}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && itens.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum item deste pedido precisa de Conferência Consultoras.
            </div>
          )}

          {!carregando && !erro && itens.length > 0 && (
            <div className="vim-tabela vim-fichas">
              <div className="vim-header vim-fichas">
                <span>Item</span>
                <span>Ambiente</span>
                <span>Produto</span>
                <span>Medidas</span>
                <span></span>
              </div>
              {itens.map((item, i) => (
                <div key={item.pedido_item_id} className="vim-row vim-fichas">
                  <span className="vim-num">{i + 1}</span>
                  <span className="vim-ambiente">{item.ambiente || "—"}</span>
                  <span className="vim-desc">{item.produto}</span>
                  <span className="vim-medidas">{fmtMedidas(item)}</span>
                  <span className="vim-acao">
                    {item.preenchida ? (
                      <button className="pf-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => verFicha(item)}>
                        👁 Ver Ficha
                      </button>
                    ) : (
                      <button
                        className="pf-btn-secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        disabled={abrindoId === item.pedido_item_id}
                        onClick={() => preencherFicha(item)}
                      >
                        {abrindoId === item.pedido_item_id ? "Abrindo..." : "📝 Preencher Ficha"}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          <button className="pf-btn-primary" onClick={handleFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
