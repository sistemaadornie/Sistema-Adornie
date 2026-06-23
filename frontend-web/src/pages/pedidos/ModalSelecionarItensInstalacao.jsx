import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { numeroPedidoCompleto } from "../../utils/numeroPedido";
import "./ModalSelecionarItensInstalacao.css";

export default function ModalSelecionarItensInstalacao({ pedido, onClose, onContinuar, itensEndpoint, titulo, textoVazio }) {
  const [itens, setItens]   = useState([]);
  const [sel, setSel]       = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [erro, setErro]     = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const endpoint = itensEndpoint || `/pedidos/${pedido.id}/itens-disponiveis-instalacao`;
        const res = await api.get(endpoint);
        if (vivo) setItens(res.itens || []);
      } catch (e) {
        if (vivo) setErro(e.message || "Erro ao carregar itens.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [pedido.id, itensEndpoint]);

  const toggle = (id) => setSel((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const selecionarTodos = () => setSel(new Set(itens.map((it) => it.id)));
  const limparSelecao   = () => setSel(new Set());

  const totalDias = (it) =>
    (it.logistica_interna_dias || 0) + (it.confeccao_dias || 0) + (it.expedicao_dias || 0) + (it.outros_dias || 0);

  function continuar() {
    const escolhidos = itens
      .filter((it) => sel.has(it.id))
      .map((it) => ({ pedido_item_id: it.id, nome: it.descricao || `Item ${it.id}` }));
    onContinuar(escolhidos);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box msi-modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{titulo || `Agendar Instalação — ${pedido.numero || numeroPedidoCompleto(pedido)}`}</h2>
            {!loading && !erro && itens.length > 0 && (
              <p className="msi-subtitle">
                {itens.length === 1 ? "1 item disponível" : `${itens.length} itens disponíveis`} para agendamento
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p>Carregando itens…</p>
          ) : erro ? (
            <p className="arq-form-erro">{erro}</p>
          ) : itens.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>
              {textoVazio || "Todos os itens deste pedido já estão agendados para instalação."}
            </p>
          ) : (
            <>
              <div className="msi-toolbar">
                <div className="msi-toolbar-acoes">
                  <button type="button" className="msi-link-btn" onClick={selecionarTodos}>Selecionar todos</button>
                  <span className="msi-toolbar-sep">·</span>
                  <button type="button" className="msi-link-btn" onClick={limparSelecao} disabled={sel.size === 0}>Limpar seleção</button>
                </div>
                <span className="msi-contador">{sel.size} de {itens.length} selecionados</span>
              </div>
              <div className="msi-lista">
                {itens.map((it) => {
                  const marcado = sel.has(it.id);
                  return (
                    <label key={it.id} className={`msi-card${marcado ? " is-selecionado" : ""}`}>
                      <span className="msi-checkbox">
                        <input type="checkbox" checked={marcado} onChange={() => toggle(it.id)} />
                        <span className="msi-checkbox-marca" aria-hidden="true" />
                      </span>
                      <span className="msi-card-conteudo">
                        <span className="msi-card-topo">
                          <span className="msi-card-num">{Number.isFinite(it.ordem) ? it.ordem + 1 : "—"}</span>
                          <strong className="msi-card-titulo">{it.descricao || `Item ${it.id}`}</strong>
                          {it.ambiente && <span className="msi-badge">{it.ambiente}</span>}
                        </span>
                        <span className="msi-card-meta">
                          {it.medidas && (
                            <>
                              <span className="msi-meta-medidas">📐 {it.medidas}</span>
                              <span className="msi-meta-ponto">·</span>
                            </>
                          )}
                          <span className="msi-meta-item">{it.categoria_nome || "Sem categoria"}</span>
                          {it.logistica_interna_dias != null && (
                            <>
                              <span className="msi-meta-ponto">·</span>
                              <span className="msi-meta-item">prazo mínimo: {totalDias(it)} dias úteis</span>
                            </>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
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
