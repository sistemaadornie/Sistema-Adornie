import React, { useState, useEffect } from "react";
import { api } from "../../../../services/api";

const ICONES_ACAO = {
  edicao: "✏️",
  verificacao_ok: "✅",
  categorizacao_ok: "🏷️",
  pdf_vinculado: "📎",
  importacao: "📥",
  vinculo_automatico: "🔗",
};

const LABELS_ACAO = {
  edicao: "Pedido editado",
  verificacao_ok: "Verificação concluída",
  categorizacao_ok: "Categorização concluída",
  pdf_vinculado: "PDF vinculado",
  importacao: "Pedido importado",
  vinculo_automatico: "Vínculo automático",
};

function labelAcao(acao) {
  if (LABELS_ACAO[acao]) return LABELS_ACAO[acao];
  return acao
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Extrai pares "Campo: "antes" → "depois"" do texto de descrição (gerado em pedidoService)
function parseDiffs(descricao) {
  if (!descricao) return null;
  const re = /(?:^|,\s*)([^:,]+): "([^"]*)" → "([^"]*)"/g;
  const partes = [];
  let m;
  while ((m = re.exec(descricao)) !== null) {
    partes.push({ campo: m[1].trim(), antes: m[2], depois: m[3] });
  }
  return partes.length ? partes : null;
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

          {!carregando && registros.map((r) => {
            const diffs = r.acao === "edicao" ? parseDiffs(r.descricao) : null;
            return (
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
                {diffs ? (
                  <div className="pf-historico-diffs">
                    {diffs.map((d, i) => (
                      <div key={i} className="pf-diff-item">
                        <span className="pf-diff-campo">{d.campo}</span>
                        <span className="pf-diff-antes">{d.antes}</span>
                        <span className="pf-diff-seta">→</span>
                        <span className="pf-diff-depois">{d.depois}</span>
                      </div>
                    ))}
                  </div>
                ) : r.descricao && (
                  <div className="pf-historico-desc">{r.descricao}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
