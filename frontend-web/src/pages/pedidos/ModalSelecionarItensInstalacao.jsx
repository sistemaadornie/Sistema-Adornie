import { useEffect, useState } from "react";
import { api } from "../../services/api";

export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar }) {
  const [itens, setItens]   = useState([]);
  const [sel, setSel]       = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [erro, setErro]     = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await api.get(`/pedidos/${pedido.id}/itens-disponiveis-instalacao`);
        if (vivo) setItens(res.itens || []);
      } catch (e) {
        if (vivo) setErro(e.message || "Erro ao carregar itens.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [pedido.id]);

  const toggle = (id) => setSel((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const totalDias = (it) =>
    (it.logistica_interna_dias || 0) + (it.confeccao_dias || 0) + (it.expedicao_dias || 0) + (it.outros_dias || 0);

  function continuar() {
    const escolhidos = itens
      .filter((it) => sel.has(it.id))
      .map((it) => ({ pedido_item_id: it.id, nome: it.descricao || `Item ${it.id}` }));
    onContinuar(escolhidos);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="modal-header">
          <h2 className="modal-title">Agendar Instalação — {pedido.numero}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p>Carregando itens…</p>
          ) : erro ? (
            <p className="arq-form-erro">{erro}</p>
          ) : itens.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>Todos os itens deste pedido já estão agendados para instalação.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {itens.map((it) => (
                <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>
                  <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it.id)} />
                  <span style={{ flex: 1 }}>
                    <strong>{it.descricao || `Item ${it.id}`}</strong>
                    {it.ambiente ? <span style={{ color: "var(--color-text-muted)" }}> — {it.ambiente}</span> : null}
                    <br />
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {it.categoria_nome || "Sem categoria"} · prazo mínimo: {totalDias(it)} dias úteis
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={sel.size === 0} onClick={continuar}>
            Continuar ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}
