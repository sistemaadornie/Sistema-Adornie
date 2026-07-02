import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../../../services/api";
import { fmtMedidas } from "../../../../utils/formatMedidas";

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

  const numeroPorItemId = useMemo(() => {
    const map = {};
    itens.forEach((it, i) => { map[it.id] = i + 1; });
    return map;
  }, [itens]);

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
            <div key={ambiente} className="vim-grupo">
              <div className="vim-grupo-titulo">🏠 {ambiente}</div>
              <div className="vim-tabela">
                <div className="vim-header">
                  <span>#</span>
                  <span>Item</span>
                  <span>Medidas</span>
                  <span></span>
                </div>
                {lista.map((principal) => {
                  const filhos = filhosDe(principal);
                  const opcoes = pendentesPara(principal);
                  return (
                    <React.Fragment key={principal.id}>
                      <div className="vim-row">
                        <span className="vim-num">{numeroPorItemId[principal.id]}</span>
                        <span className="vim-desc">{principal.descricao}</span>
                        <span className="vim-medidas">{fmtMedidas(principal)}</span>
                        <span className="vim-acao">
                          <span className="pf-badge pf-badge-ok">Item principal</span>
                        </span>
                      </div>
                      {filhos.map((filho) => (
                        <div key={filho.id} className="vim-row vim-filho">
                          <span className="vim-num">↳ {numeroPorItemId[filho.id]}</span>
                          <span className="vim-desc">{filho.descricao}</span>
                          <span className="vim-medidas">{fmtMedidas(filho)}</span>
                          <span className="vim-acao">
                            <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === filho.id} onClick={() => remover(filho.id)}>
                              remover
                            </button>
                          </span>
                        </div>
                      ))}
                      {opcoes.length > 0 && (
                        <div className="vim-row vim-add">
                          <span>
                            <select
                              value=""
                              disabled={salvandoId != null}
                              title={`Vincular item a "${principal.descricao}"`}
                              style={{ background: "var(--pf-input-bg)", border: "1px solid var(--pf-input-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--pf-modal-text)", width: 36, textAlign: "center" }}
                              onChange={(e) => { if (e.target.value) vincular(e.target.value, principal.id); }}
                            >
                              <option value="">+</option>
                              {opcoes.map((op) => (
                                <option key={op.id} value={op.id}>{numeroPorItemId[op.id]}. {op.descricao} — {fmtMedidas(op)}</option>
                              ))}
                            </select>
                          </span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ))}

          {!carregando && vinculaveisPendentes.length > 0 && (
            <div className="vim-grupo">
              <div className="vim-grupo-titulo">Itens vinculáveis sem vínculo</div>
              <div className="vim-tabela vim-com-ambiente">
                <div className="vim-header vim-com-ambiente">
                  <span>#</span>
                  <span>Item</span>
                  <span>Medidas</span>
                  <span>Ambiente</span>
                  <span></span>
                </div>
                {vinculaveisPendentes.map((item) => (
                  <div key={item.id} className="vim-row vim-com-ambiente">
                    <span className="vim-num">{numeroPorItemId[item.id]}</span>
                    <span className="vim-desc">
                      {item.descricao}{" "}
                      <small style={{ opacity: .6 }}>({categoriaPorId[item.categoria_id]?.nome})</small>
                    </span>
                    <span className="vim-medidas">{fmtMedidas(item)}</span>
                    <span className="vim-ambiente">{item.ambiente || "—"}</span>
                    <span className="vim-acao">
                      <select
                        value=""
                        disabled={salvandoId != null}
                        style={{ background: "var(--pf-input-bg)", border: "1px solid var(--pf-input-border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "var(--pf-modal-text)", width: 140, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        onChange={(e) => { if (e.target.value) vincular(item.id, e.target.value); }}
                      >
                        <option value="">Vincular a...</option>
                        {principais.filter((p) => p.id !== item.id).map((p) => (
                          <option key={p.id} value={p.id}>{numeroPorItemId[p.id]}. {p.descricao} — {fmtMedidas(p)}</option>
                        ))}
                      </select>
                      <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === item.id} onClick={() => marcarSemVinculo(item.id, true)}>
                        Marcar sem vínculo
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!carregando && vinculaveisSemVinculoMarcado.length > 0 && (
            <div className="vim-grupo">
              <div className="vim-grupo-titulo">Itens marcados como "sem vínculo"</div>
              <div className="vim-tabela vim-com-ambiente">
                <div className="vim-header vim-com-ambiente">
                  <span>#</span>
                  <span>Item</span>
                  <span>Medidas</span>
                  <span>Ambiente</span>
                  <span></span>
                </div>
                {vinculaveisSemVinculoMarcado.map((item) => (
                  <div key={item.id} className="vim-row vim-com-ambiente vim-sem-vinculo">
                    <span className="vim-num">{numeroPorItemId[item.id]}</span>
                    <span className="vim-desc">
                      {item.descricao}{" "}
                      <small>({categoriaPorId[item.categoria_id]?.nome})</small>
                    </span>
                    <span className="vim-medidas">{fmtMedidas(item)}</span>
                    <span className="vim-ambiente">{item.ambiente || "—"}</span>
                    <span className="vim-acao">
                      <span className="pf-badge pf-badge-pend">Sem vínculo</span>
                      <button className="pf-btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }} disabled={salvandoId === item.id} onClick={() => marcarSemVinculo(item.id, false)}>
                        desfazer
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
