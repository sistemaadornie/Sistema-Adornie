import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import "./FichaConferencia.css";

const STATUS_BADGE = {
  pendente:  { cls: "pf-badge-pend", label: "Pendente" },
  conferido: { cls: "pf-badge-ok",   label: "Conferido" },
  reprovado: { cls: "pf-badge-err",  label: "Reprovado" },
};

export default function FichaConferencia({ agendamentoId, onClose }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemAtivo, setItemAtivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ largura_real: "", altura_real: "", observacoes: "", resultado: "" });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/agendamentos/${agendamentoId}/conferencia-itens`);
      setItens(res.itens || []);
    } finally {
      setLoading(false);
    }
  }, [agendamentoId]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirItem(idx) {
    const item = itens[idx];
    setItemAtivo(idx);
    setForm({
      largura_real: item.dados?.largura_real ?? "",
      altura_real:  item.dados?.altura_real ?? "",
      observacoes:  item.observacoes ?? "",
      resultado:    item.status === "conferido" ? "aprovado" : item.status === "reprovado" ? "reprovado" : "",
    });
  }

  async function salvar() {
    if (!form.resultado) return;
    setSalvando(true);
    try {
      const item = itens[itemAtivo];
      await api.post(`/agendamentos/${agendamentoId}/conferencia-itens`, {
        pedido_item_id: item.pedido_item_id,
        status: form.resultado === "aprovado" ? "conferido" : "reprovado",
        observacoes: form.observacoes || null,
        dados: {
          largura_real: form.largura_real ? Number(form.largura_real) : null,
          altura_real:  form.altura_real  ? Number(form.altura_real)  : null,
          resultado:    form.resultado,
        },
      });
      await carregar();
      const nextIdx = itens.findIndex((it, i) => i > itemAtivo && it.status !== "conferido");
      if (nextIdx !== -1) abrirItem(nextIdx);
      else setItemAtivo(null);
    } finally {
      setSalvando(false);
    }
  }

  const totalConferidos = itens.filter((i) => i.status === "conferido").length;
  const pct = itens.length > 0 ? Math.round((totalConferidos / itens.length) * 100) : 0;

  if (loading) return (
    <div className="fc-overlay">
      <div className="fc-modal" style={{ padding: 40, textAlign: "center" }}>Carregando itens...</div>
    </div>
  );

  return (
    <div className="fc-overlay">
      <div className="fc-modal">
        <div className="fc-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="fc-titulo">📋 Ficha de Conferência</div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--pf-card-sub)" }}>×</button>
          </div>
          <div style={{ fontSize: 13, color: "var(--pf-card-sub)", marginTop: 4 }}>
            Conferido {totalConferidos} de {itens.length}
          </div>
          <div className="fc-progress-bar">
            <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="fc-body">
          {itemAtivo === null ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Itens do agendamento</div>
              <ul className="fc-item-list">
                {itens.map((item, idx) => {
                  const badge = STATUS_BADGE[item.status] || STATUS_BADGE.pendente;
                  return (
                    <li key={item.pedido_item_id}>
                      <button className="fc-item-btn" onClick={() => abrirItem(idx)}>
                        <span>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.descricao}</div>
                          {item.ambiente && <div style={{ fontSize: 12, color: "var(--pf-card-sub)" }}>{item.ambiente}</div>}
                        </span>
                        <span className={`pf-badge ${badge.cls}`}>{badge.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{itens[itemAtivo]?.descricao}</div>
              {itens[itemAtivo]?.ambiente && (
                <div style={{ fontSize: 12, color: "var(--pf-card-sub)", marginBottom: 14 }}>{itens[itemAtivo].ambiente}</div>
              )}

              <div className="fc-campo">
                <label>Largura real (cm)</label>
                <input className="pf-input" type="number" placeholder="ex: 120"
                  value={form.largura_real}
                  onChange={(e) => setForm((f) => ({ ...f, largura_real: e.target.value }))} />
              </div>
              <div className="fc-campo">
                <label>Altura real (cm)</label>
                <input className="pf-input" type="number" placeholder="ex: 200"
                  value={form.altura_real}
                  onChange={(e) => setForm((f) => ({ ...f, altura_real: e.target.value }))} />
              </div>
              <div className="fc-campo">
                <label>Observações técnicas</label>
                <textarea className="pf-input" rows={3} placeholder="Anotações..."
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="fc-campo">
                <label>Resultado *</label>
                <select className="pf-input" value={form.resultado}
                  onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))}>
                  <option value="">— Selecione —</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                </select>
              </div>

              <div className="fc-actions">
                <button className="pf-btn-primary" onClick={salvar} disabled={!form.resultado || salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
                <button className="pf-btn-secondary" onClick={() => setItemAtivo(null)}>← Voltar à lista</button>
              </div>

              <div className="fc-nav">
                <button className="pf-btn-secondary"
                  disabled={itemAtivo === 0}
                  onClick={() => abrirItem(itemAtivo - 1)}>← Anterior</button>
                <button className="pf-btn-secondary"
                  disabled={itemAtivo === itens.length - 1}
                  onClick={() => abrirItem(itemAtivo + 1)}>Próximo →</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
