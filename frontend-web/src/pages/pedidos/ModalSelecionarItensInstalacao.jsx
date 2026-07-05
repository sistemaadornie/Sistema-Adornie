import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { numeroPedidoCompleto } from "../../utils/numeroPedido";
import { fmtMedidas } from "../../utils/formatMedidas";
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
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div>
            <div className="pf-modal-titulo">{titulo || `Agendar Instalação — ${pedido.numero || numeroPedidoCompleto(pedido)}`}</div>
            {!loading && !erro && itens.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginTop: 2 }}>
                {itens.length === 1 ? "1 item disponível" : `${itens.length} itens disponíveis`} para agendamento
              </div>
            )}
          </div>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>

        <div className="pf-modal-body">
          {loading ? (
            <div>Carregando…</div>
          ) : erro ? (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          ) : itens.length === 0 ? (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              {textoVazio || "Todos os itens deste pedido já estão agendados para instalação."}
            </div>
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
              <div className="vim-tabela vim-fichas">
                <div className="vim-header vim-fichas">
                  <span>Item</span>
                  <span>Ambiente</span>
                  <span>Produto</span>
                  <span>Medidas</span>
                  <span></span>
                </div>
                {itens.map((it, i) => {
                  const marcado = sel.has(it.id);
                  return (
                    <div
                      key={it.id}
                      className={`vim-row vim-fichas${marcado ? " is-selecionado" : ""}`}
                      onClick={() => toggle(it.id)}
                    >
                      <span className="vim-num">{Number.isFinite(it.ordem) ? it.ordem + 1 : i + 1}</span>
                      <span className="vim-ambiente">{it.ambiente || "—"}</span>
                      <span className="vim-desc">
                        <strong>{it.descricao || `Item ${it.id}`}</strong>
                        {it.logistica_interna_dias != null && (
                          <span className="vim-desc-sub">prazo mínimo: {totalDias(it)} dias úteis</span>
                        )}
                      </span>
                      <span className="vim-medidas">{fmtMedidas(it)}</span>
                      <span className="vim-acao">
                        <span className="msi-checkbox" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={marcado} onChange={() => toggle(it.id)} />
                          <span className="msi-checkbox-marca" aria-hidden="true" />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          {!loading && !erro && itens.length > 0 ? (
            <>
              <button className="pf-btn-secondary" onClick={onClose}>Cancelar</button>
              <button className="pf-btn-primary" disabled={sel.size === 0} onClick={continuar}>
                Continuar ({sel.size})
              </button>
            </>
          ) : (
            <button className="pf-btn-primary" onClick={onClose}>Fechar</button>
          )}
        </div>
      </div>
    </div>
  );
}
