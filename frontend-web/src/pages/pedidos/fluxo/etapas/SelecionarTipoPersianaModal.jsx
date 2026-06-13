import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../../../services/api";
import ModeloSelectorPanel from "../../ModeloSelectorPanel";
import { KEYWORD_MODELS } from "../../importKeywordConfig";

const PERSIANA_CONFIG = KEYWORD_MODELS.find((k) => k.tipo === "persiana");

export default function SelecionarTipoPersianaModal({ pedidoId, onClose, onRecarregar }) {
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [selecionandoItemId, setSelecionandoItemId] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      api.get(`/pedidos/${pedidoId}`),
      api.get("/categorias"),
    ])
      .then(([pedidoRes, catRes]) => {
        if (!ativo) return;
        setItens(pedidoRes.pedido?.itens || []);
        setCategorias(catRes.categorias || []);
      })
      .catch((e) => { if (ativo) setErro(e?.message || "Erro ao carregar itens."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [pedidoId]);

  const categoriaPorId = useMemo(() => {
    const map = {};
    categorias.forEach((c) => { map[c.id] = c; });
    return map;
  }, [categorias]);

  const persianas = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.nome === "Persianas"),
    [itens, categoriaPorId]
  );
  const pendentes = persianas.filter((it) => !it.modelo);
  const resolvidas = persianas.filter((it) => it.modelo);

  async function salvarTipo(itemId, valor) {
    try {
      await api.patch(`/pedidos/${pedidoId}/itens/${itemId}/modelo`, valor);
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, modelo: valor.modelo, especificacoes: valor.especificacoes } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao salvar tipo de persiana.");
    } finally {
      setSelecionandoItemId(null);
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
          <div className="pf-modal-titulo">🎛️ Selecionar Tipo de Persiana</div>
          <button className="pf-modal-fechar" onClick={handleFechar}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && persianas.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum item de Persianas neste pedido.
            </div>
          )}

          {pendentes.map((item) => (
            <div key={item.id} className="vim-row vim-com-ambiente">
              <span className="vim-desc">{item.descricao}</span>
              <span className="pf-badge pf-badge-pend">Sem tipo definido</span>
              <button className="pf-btn-secondary" onClick={() => setSelecionandoItemId(item.id)}>
                + Selecionar
              </button>
              {selecionandoItemId === item.id && (
                <ModeloSelectorPanel
                  tipo="persiana"
                  config={PERSIANA_CONFIG}
                  valor={{ modelo: item.modelo, especificacoes: item.especificacoes }}
                  onChange={(valor) => salvarTipo(item.id, valor)}
                  onClose={() => setSelecionandoItemId(null)}
                />
              )}
            </div>
          ))}

          {resolvidas.map((item) => (
            <div key={item.id} className="vim-row vim-com-ambiente">
              <span className="vim-desc">
                {item.descricao}{" "}
                <small style={{ opacity: .6 }}>
                  ({item.modelo}{item.especificacoes?.tubo ? `, tubo ${item.especificacoes.tubo}` : ""}{item.especificacoes?.bando ? `, ${item.especificacoes.bando}` : ""})
                </small>
              </span>
              <span className="pf-badge pf-badge-ok">Configurada</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          <span style={{ fontSize: 13, color: "var(--pf-card-sub)" }}>
            {resolvidas.length} de {persianas.length} persianas configuradas
          </span>
          <button className="pf-btn-primary" onClick={handleFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
