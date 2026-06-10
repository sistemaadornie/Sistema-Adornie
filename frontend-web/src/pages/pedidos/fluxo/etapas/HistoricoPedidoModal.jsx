import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";

const ICONES_ACAO = {
  edicao: "✏️",
  verificacao_ok: "✅",
  pdf_vinculado: "📎",
};

const LABELS_ACAO = {
  edicao: "Pedido editado",
  verificacao_ok: "Verificação concluída",
  pdf_vinculado: "PDF vinculado",
};

function labelAcao(acao) {
  if (LABELS_ACAO[acao]) return LABELS_ACAO[acao];
  return acao
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function HistoricoPedidoModal({ pedidoId, onClose }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [registros, setRegistros] = useState([]);

  useEffect(() => {
    let ativo = true;
    api.get(`/pedidos/${pedidoId}/auditoria`)
      .then((res) => { if (ativo) setRegistros(res.auditoria || []); })
      .catch((e) => { if (ativo) setErro(e?.message || "Erro ao carregar histórico."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [pedidoId]);

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">🕘 Histórico do Pedido</div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && registros.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum registro de histórico para este pedido ainda.
            </div>
          )}

          {!carregando && registros.map((r) => (
            <div key={r.id} className="pf-historico-item">
              <div className="pf-historico-topo">
                <span className="pf-historico-acao">
                  {ICONES_ACAO[r.acao] || "🔧"} {labelAcao(r.acao)}
                </span>
                <span className="pf-historico-meta">{fmtDataHora(r.created_at)}</span>
              </div>
              <div className="pf-historico-meta">
                {r.usuario_nome || "Sistema"}
              </div>
              {r.descricao && (
                <div className="pf-historico-desc">{r.descricao}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
