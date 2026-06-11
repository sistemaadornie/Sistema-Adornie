import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../../../services/api";

export default function VincularItensModal({ pedidoId, onClose, onRecarregar }) {
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvandoId, setSalvandoId] = useState(null);

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

  const principais = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.recebe_vinculos),
    [itens, categoriaPorId]
  );
  const vinculaveis = useMemo(
    () => itens.filter((it) => categoriaPorId[it.categoria_id]?.vinculavel),
    [itens, categoriaPorId]
  );
  const vinculaveisPendentes = useMemo(
    () => vinculaveis.filter((v) => !v.vinculos?.length && !v.sem_vinculo),
    [vinculaveis]
  );
  const vinculaveisSemVinculoMarcado = useMemo(
    () => vinculaveis.filter((v) => !v.vinculos?.length && v.sem_vinculo),
    [vinculaveis]
  );

  const grupos = useMemo(() => {
    const porAmbiente = {};
    principais.forEach((p) => {
      const amb = p.ambiente?.trim() || "Sem ambiente";
      if (!porAmbiente[amb]) porAmbiente[amb] = [];
      porAmbiente[amb].push(p);
    });
    return porAmbiente;
  }, [principais]);

  function filhosDe(principal) {
    return vinculaveis.filter((v) => v.vinculos?.[0]?.item_vinculado_id === principal.id);
  }

  function pendentesPara(principal) {
    return [...vinculaveisPendentes].sort((a, b) => {
      const aMesmo = a.ambiente === principal.ambiente ? 0 : 1;
      const bMesmo = b.ambiente === principal.ambiente ? 0 : 1;
      return aMesmo - bMesmo;
    });
  }

  async function vincular(itemId, principalId) {
    setSalvandoId(Number(itemId));
    try {
      await api.post(`/pedidos/${pedidoId}/vinculos`, {
        item_id: Number(itemId),
        item_vinculado_id: Number(principalId),
      });
      setItens((prev) => prev.map((it) =>
        it.id === Number(itemId)
          ? { ...it, vinculos: [{ item_vinculado_id: Number(principalId), tipo_vinculo: "acessorio" }], sem_vinculo: false }
          : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao vincular item.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function remover(itemId) {
    setSalvandoId(itemId);
    try {
      await api.delete(`/pedidos/${pedidoId}/vinculos/${itemId}`);
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, vinculos: [] } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao remover vínculo.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function marcarSemVinculo(itemId, valor) {
    setSalvandoId(itemId);
    try {
      await api.patch(`/pedidos/${pedidoId}/itens/${itemId}/sem-vinculo`, { sem_vinculo: valor });
      setItens((prev) => prev.map((it) =>
        it.id === itemId ? { ...it, sem_vinculo: valor } : it
      ));
    } catch (e) {
      alert(e?.message || "Erro ao atualizar item.");
    } finally {
      setSalvandoId(null);
    }
  }

  function handleFechar() {
    onRecarregar?.();
    onClose();
  }

  const totalVinculaveis = vinculaveis.length;
  const resolvidos = vinculaveis.filter((v) => v.vinculos?.length || v.sem_vinculo).length;

  return (
    <div className="pf-modal-overlay">
      <div className="pf-modal pf-modal-grande">
        <div className="pf-modal-header">
          <div className="pf-modal-titulo">🔗 Vincular Itens</div>
          <button className="pf-modal-fechar" onClick={handleFechar}>×</button>
        </div>

        <div className="pf-modal-body">
          {carregando && <div>Carregando...</div>}

          {erro && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && principais.length === 0 && vinculaveis.length === 0 && (
            <div style={{ color: "var(--pf-card-sub)", fontSize: 13 }}>
              Nenhum item deste pedido pertence a categorias vinculáveis.
            </div>
          )}

          {!carregando && Object.entries(grupos).map(([ambiente, lista]) => (
            <div key={ambiente} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>📦 {ambiente}</div>
              {lista.map((principal) => {
                const filhos = filhosDe(principal);
                const opcoes = pendentesPara(principal);
                return (
                  <div key={principal.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--pf-separador)", borderRadius: 6 }}>
                      <span>{principal.id}. {principal.descricao}</span>
                      <span className="pf-badge pf-badge-ok" style={{ fontSize: 10 }}>Item principal</span>
                    </div>
                    {filhos.map((filho) => (
                      <div key={filho.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 0 18px", padding: "6px 10px", border: "1px dashed #22c55e", borderRadius: 6 }}>
                        <span>↳ {filho.id}. {filho.descricao}</span>
                        <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === filho.id} onClick={() => remover(filho.id)}>
                          remover
                        </button>
                      </div>
                    ))}
                    {opcoes.length > 0 && (
                      <div style={{ margin: "6px 0 0 18px" }}>
                        <select
                          value=""
                          disabled={salvandoId != null}
                          style={{ background: "var(--pf-input-bg)", border: "1px solid var(--pf-input-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--pf-modal-text)" }}
                          onChange={(e) => { if (e.target.value) vincular(e.target.value, principal.id); }}
                        >
                          <option value="">+ Vincular item a "{principal.descricao}"</option>
                          {opcoes.map((op) => (
                            <option key={op.id} value={op.id}>{op.id}. {op.descricao}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {!carregando && vinculaveisPendentes.length > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Itens vinculáveis sem vínculo</div>
              {vinculaveisPendentes.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--pf-separador)", borderRadius: 6, marginBottom: 6 }}>
                  <span>
                    {item.id}. {item.descricao}{" "}
                    <small style={{ opacity: .6 }}>
                      ({categoriaPorId[item.categoria_id]?.nome}{item.ambiente ? ` — ${item.ambiente}` : ""})
                    </small>
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value=""
                      disabled={salvandoId != null}
                      style={{ background: "var(--pf-input-bg)", border: "1px solid var(--pf-input-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--pf-modal-text)" }}
                      onChange={(e) => { if (e.target.value) vincular(item.id, e.target.value); }}
                    >
                      <option value="">Vincular a...</option>
                      {principais.filter((p) => p.id !== item.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.id}. {p.descricao}</option>
                      ))}
                    </select>
                    <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === item.id} onClick={() => marcarSemVinculo(item.id, true)}>
                      Marcar sem vínculo
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {!carregando && vinculaveisSemVinculoMarcado.length > 0 && (
            <>
              <hr className="pf-separador" />
              <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Itens marcados como "sem vínculo"</div>
              {vinculaveisSemVinculoMarcado.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--pf-separador)", borderRadius: 6, marginBottom: 6, opacity: .6 }}>
                  <span>
                    {item.id}. {item.descricao}{" "}
                    <small>({categoriaPorId[item.categoria_id]?.nome}{item.ambiente ? ` — ${item.ambiente}` : ""})</small>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="pf-badge pf-badge-pend" style={{ fontSize: 10 }}>Sem vínculo</span>
                    <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === item.id} onClick={() => marcarSemVinculo(item.id, false)}>
                      desfazer
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: "1px solid var(--pf-separador)" }}>
          <span style={{ fontSize: 13, color: "var(--pf-card-sub)" }}>
            {totalVinculaveis === 0 ? "Nenhum item vinculável neste pedido." : `${resolvidos} de ${totalVinculaveis} itens vinculáveis resolvidos`}
          </span>
          <button className="pf-btn-primary" onClick={handleFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
