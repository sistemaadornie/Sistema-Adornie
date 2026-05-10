import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";

const LETRAS = ["A","B","C","D","E","F","G","H"];

export const CREW_PALETTE = [
  "#38bdf8","#4ade80","#fbbf24","#c084fc",
  "#fb923c","#2dd4bf","#f472b6","#818cf8",
];

function crewVazio(data, idx) {
  return {
    _tempId: Date.now() + idx,
    id: null, data,
    nome: `Equipe ${LETRAS[idx] ?? idx + 1}`,
    veiculo_id: "",
    membros: [],
    agendamento_ids: [],
    ponto_partida: null, // { label, endereco, lat, lng }
  };
}

function iniciais(nome) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("");
}

function formatData(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function InicializacaoDia({
  data,
  crewsExistentes = [],
  agendamentos = [],
  equipe = [],
  veiculos = [],
  onClose,
  onSalvo,
}) {
  const [crews, setCrews] = useState(() =>
    crewsExistentes.length
      ? crewsExistentes.map((c) => ({
          ...c,
          veiculo_id: c.veiculo?.id ?? "",
          membros: c.membros.map((m) => m.usuario_id),
          agendamento_ids: c.agendamentos.map((a) => a.id),
          ponto_partida: null,
        }))
      : [crewVazio(data, 0)]
  );
  const [salvando,            setSalvando]            = useState(false);
  const [erro,                setErro]                = useState(null);
  const [enderecosPorVeiculo, setEnderecosPorVeiculo] = useState({});

  /* ── Carrega endereços padrão salvos para um veículo ── */
  const carregarEnderecos = useCallback(async (veiculoId) => {
    if (!veiculoId || enderecosPorVeiculo[veiculoId] !== undefined) return;
    try {
      const res = await api.get(`/crews/pontos-partida/padrao?veiculo_id=${veiculoId}`);
      setEnderecosPorVeiculo((prev) => ({ ...prev, [veiculoId]: res.enderecos || [] }));
    } catch {
      setEnderecosPorVeiculo((prev) => ({ ...prev, [veiculoId]: [] }));
    }
  }, [enderecosPorVeiculo]);

  /* ── Em modo edição: pré-carrega ponto do dia + endereços de cada veículo ── */
  useEffect(() => {
    if (!crewsExistentes.length) return;
    async function preCarregar() {
      for (const c of crewsExistentes) {
        if (!c.veiculo?.id) continue;
        const vid = c.veiculo.id;
        try {
          const [pontoRes, endRes] = await Promise.all([
            api.get(`/crews/pontos-partida?veiculo_id=${vid}&data=${data}`),
            api.get(`/crews/pontos-partida/padrao?veiculo_id=${vid}`),
          ]);
          if (pontoRes.ponto) {
            setCrews((prev) => prev.map((crew) =>
              crew.id === c.id ? { ...crew, ponto_partida: pontoRes.ponto } : crew
            ));
          }
          setEnderecosPorVeiculo((prev) => ({ ...prev, [vid]: endRes.enderecos || [] }));
        } catch { /* ignora — ponto pode simplesmente não existir */ }
      }
    }
    preCarregar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mutações de estado ── */
  const addCrew = () =>
    setCrews((prev) => [...prev, crewVazio(data, prev.length)]);

  const removeCrew = (key) =>
    setCrews((prev) => prev.filter((c) => (c.id ?? c._tempId) !== key));

  const updateCrew = (key, campo, valor) =>
    setCrews((prev) =>
      prev.map((c) => (c.id ?? c._tempId) === key ? { ...c, [campo]: valor } : c)
    );

  const updateVeiculo = (key, veiculoId) => {
    updateCrew(key, "veiculo_id", veiculoId);
    updateCrew(key, "ponto_partida", null);
    if (veiculoId) carregarEnderecos(veiculoId);
  };

  const toggleMembro = (key, uid) =>
    setCrews((prev) =>
      prev.map((c) => {
        if ((c.id ?? c._tempId) !== key) return c;
        const membros = new Set(c.membros);
        if (membros.has(uid)) { membros.delete(uid); return { ...c, membros: [...membros] }; }
        membros.add(uid);
        const jaEmOutra = new Set(prev.filter((o) => (o.id ?? o._tempId) !== key).flatMap((o) => o.agendamento_ids));
        const agIds = new Set(c.agendamento_ids);
        agendamentos.forEach((ag) => {
          if ((ag.equipe ?? []).includes(uid) && !jaEmOutra.has(ag.id)) agIds.add(ag.id);
        });
        return { ...c, membros: [...membros], agendamento_ids: [...agIds] };
      })
    );

  const toggleAg = (key, agId) =>
    setCrews((prev) =>
      prev.map((c) => {
        if ((c.id ?? c._tempId) !== key) return c;
        const s = new Set(c.agendamento_ids);
        s.has(agId) ? s.delete(agId) : s.add(agId);
        return { ...c, agendamento_ids: [...s] };
      })
    );

  /* ── Salvar ── */
  async function salvar() {
    setSalvando(true); setErro(null);
    try {
      const mantidos = new Set(crews.filter((c) => c.id).map((c) => c.id));
      await Promise.all(
        crewsExistentes.filter((c) => !mantidos.has(c.id)).map((c) => api.delete(`/crews/${c.id}`))
      );

      await Promise.all(
        crews.map((c) => {
          const payload = {
            data, nome: c.nome,
            veiculo_id: c.veiculo_id || null,
            membros: c.membros,
            agendamento_ids: c.agendamento_ids,
          };
          return c.id ? api.put(`/crews/${c.id}`, payload) : api.post("/crews", payload);
        })
      );

      // Salva o ponto de partida de cada equipe que tem veículo definido
      await Promise.all(
        crews
          .filter((c) => c.veiculo_id && c.ponto_partida?.endereco?.trim())
          .map((c) =>
            api.post("/crews/pontos-partida", {
              veiculo_id: c.veiculo_id,
              data,
              label:    c.ponto_partida.label   || c.ponto_partida.endereco.split(",")[0],
              endereco: c.ponto_partida.endereco,
              lat:      c.ponto_partida.lat  ?? null,
              lng:      c.ponto_partida.lng  ?? null,
            })
          )
      );

      onSalvo?.();
    } catch (err) {
      setErro(err.message || "Erro ao salvar equipes.");
    } finally {
      setSalvando(false);
    }
  }

  const todosDistribuidos = new Set(crews.flatMap((c) => c.agendamento_ids));
  const semEquipe = agendamentos.filter((a) => !todosDistribuidos.has(a.id));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 740, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div className="modal-header">
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0 }}>Equipes do Dia — {formatData(data)}</h2>
            <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {crews.length} equipe{crews.length !== 1 ? "s" : ""}
              </span>
              {agendamentos.length > 0 && (
                <span style={{ fontSize: 12, color: semEquipe.length > 0 ? "var(--color-warning)" : "var(--color-success)", fontWeight: 600 }}>
                  {semEquipe.length > 0 ? `⚠ ${semEquipe.length} sem equipe` : "✓ Todos distribuídos"}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
          {crews.map((crew, idx) => {
            const key        = crew.id ?? crew._tempId;
            const cor        = CREW_PALETTE[idx % CREW_PALETTE.length];
            const endSalvos  = enderecosPorVeiculo[crew.veiculo_id] || [];
            const pontoAtual = crew.ponto_partida?.endereco || "";

            return (
              <div key={key} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", borderTop: `3px solid ${cor}`, background: "var(--color-surface-soft)", marginBottom: 16, overflow: "hidden" }}>

                {/* Nome da equipe */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--color-border)", background: `color-mix(in srgb, ${cor} 5%, transparent)` }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: cor, boxShadow: `0 0 8px ${cor}88`, flexShrink: 0 }} />
                  <input
                    className="input-base"
                    value={crew.nome}
                    onChange={(e) => updateCrew(key, "nome", e.target.value)}
                    style={{ flex: 1, fontWeight: 600, fontSize: 14, minHeight: 34, padding: "5px 10px" }}
                  />
                  {crews.length > 1 && (
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-danger)", fontSize: 12, padding: "4px 10px" }} onClick={() => removeCrew(key)}>
                      Remover
                    </button>
                  )}
                </div>

                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Veículo */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 6 }}>
                      Veículo
                    </div>
                    <select
                      className="input-base"
                      style={{ minHeight: 36, padding: "6px 10px" }}
                      value={crew.veiculo_id}
                      onChange={(e) => updateVeiculo(key, e.target.value)}
                    >
                      <option value="">— Sem veículo —</option>
                      {veiculos
                        .filter((v) => {
                          const emOutra = crews.some((c) => (c.id ?? c._tempId) !== key && String(c.veiculo_id) === String(v.id));
                          return !emOutra || String(crew.veiculo_id) === String(v.id);
                        })
                        .map((v) => (
                          <option key={v.id} value={v.id}>{v.nome}{v.placa ? ` (${v.placa})` : ""}</option>
                        ))}
                    </select>
                  </div>

                  {/* ── Ponto de Partida ── */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      Ponto de Partida
                      {pontoAtual && (
                        <span style={{ fontSize: 10, background: `color-mix(in srgb, ${cor} 18%, transparent)`, color: cor, padding: "1px 6px", borderRadius: 10, fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
                          definido
                        </span>
                      )}
                    </div>

                    {!crew.veiculo_id ? (
                      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                        Selecione um veículo para configurar o ponto de partida.
                      </p>
                    ) : (
                      <>
                        {/* Atalhos: endereços salvos para este veículo */}
                        {endSalvos.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                            <button
                              onClick={() => updateCrew(key, "ponto_partida", null)}
                              style={{
                                padding: "3px 10px", borderRadius: 12, fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                                border: `1px solid ${!pontoAtual ? cor : "var(--color-border)"}`,
                                background: !pontoAtual ? `color-mix(in srgb, ${cor} 14%, transparent)` : "transparent",
                                color: !pontoAtual ? cor : "var(--color-text-muted)",
                              }}
                            >
                              Nenhum
                            </button>
                            {endSalvos.map((end) => {
                              const ativo = pontoAtual === end.endereco;
                              return (
                                <button
                                  key={end.id}
                                  title={end.endereco}
                                  onClick={() => updateCrew(key, "ponto_partida", { label: end.label, endereco: end.endereco, lat: end.lat, lng: end.lng })}
                                  style={{
                                    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                                    maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    border: `1px solid ${ativo ? cor : "var(--color-border)"}`,
                                    background: ativo ? `color-mix(in srgb, ${cor} 14%, transparent)` : "transparent",
                                    color: ativo ? cor : "var(--color-text-secondary)",
                                  }}
                                >
                                  📍 {end.label || end.endereco}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Campo de endereço livre */}
                        <input
                          className="input-base"
                          placeholder={endSalvos.length ? "Ou digite outro endereço…" : "Ex: Rua das Flores, 100 — Curitiba"}
                          value={pontoAtual}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCrew(key, "ponto_partida", val.trim() ? { label: val.split(",")[0].trim(), endereco: val, lat: null, lng: null } : null);
                          }}
                          style={{ fontSize: 13, minHeight: 34, padding: "5px 10px" }}
                        />
                        {pontoAtual && (
                          <button
                            onClick={() => updateCrew(key, "ponto_partida", null)}
                            style={{ marginTop: 4, fontSize: 11, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                          >
                            ✕ limpar
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Membros */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      Membros
                      {crew.membros.length > 0 && (
                        <span style={{ fontSize: 10, background: `color-mix(in srgb, ${cor} 18%, transparent)`, color: cor, padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>
                          {crew.membros.length}
                        </span>
                      )}
                    </div>
                    {equipe.length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nenhum instalador disponível.</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {equipe.map((u) => {
                          const sel = crew.membros.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              onClick={() => toggleMembro(key, u.id)}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "4px 10px 4px 4px", borderRadius: 20,
                                border: `1px solid ${sel ? cor : "var(--color-border)"}`,
                                background: sel ? `color-mix(in srgb, ${cor} 14%, transparent)` : "transparent",
                                color: sel ? cor : "var(--color-text-secondary)",
                                fontSize: 13, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                              }}
                            >
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: sel ? cor : "var(--color-border-strong)", color: sel ? "#000" : "var(--color-text-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                                {iniciais(u.nome)}
                              </div>
                              {u.nome}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Agendamentos */}
                  {agendamentos.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        Agendamentos
                        {crew.agendamento_ids.length > 0 && (
                          <span style={{ fontSize: 10, background: `color-mix(in srgb, ${cor} 18%, transparent)`, color: cor, padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>
                            {crew.agendamento_ids.length}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {agendamentos.map((ag) => {
                          const sel         = crew.agendamento_ids.includes(ag.id);
                          const emOutra     = !sel && crews.some((c) => (c.id ?? c._tempId) !== key && c.agendamento_ids.includes(ag.id));
                          const bloqueado   = sel && crew.membros.some((uid) => (ag.equipe ?? []).includes(uid));
                          const desabilitado = emOutra || bloqueado;
                          return (
                            <label
                              key={ag.id}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "7px 10px", borderRadius: "var(--radius-sm)",
                                border: `1px solid ${sel ? cor : "var(--color-border)"}`,
                                background: sel ? `color-mix(in srgb, ${cor} 10%, var(--color-surface))` : "var(--color-surface)",
                                opacity: emOutra ? 0.4 : 1,
                                cursor: desabilitado ? "not-allowed" : "pointer",
                                transition: "all 0.15s",
                              }}
                            >
                              <input type="checkbox" checked={sel} disabled={desabilitado} onChange={() => !desabilitado && toggleAg(key, ag.id)} style={{ accentColor: cor, flexShrink: 0, width: 14, height: 14 }} />
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, flexShrink: 0, background: sel ? `color-mix(in srgb, ${cor} 22%, transparent)` : "var(--color-border)", color: sel ? cor : "var(--color-text-muted)" }}>
                                {ag.hora}
                              </span>
                              <span style={{ fontSize: 13, color: "var(--color-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ag.titulo || ag.cliente}
                              </span>
                              {ag.endereco && !desabilitado && (
                                <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ag.endereco.split(",")[0]}
                                </span>
                              )}
                              {emOutra  && <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>em outra equipe</span>}
                              {bloqueado && <span style={{ fontSize: 10, color: cor, flexShrink: 0, opacity: 0.7 }}>🔒</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            );
          })}

          <button className="btn btn-ghost btn-sm" onClick={addCrew} style={{ fontSize: 13, marginTop: 4 }}>
            + Adicionar equipe
          </button>
        </div>

        {/* ── Erro ── */}
        {erro && (
          <div style={{ padding: "9px 20px", fontSize: 13, fontWeight: 500, color: "var(--color-danger)", background: "var(--color-danger-soft)", borderTop: "1px solid var(--color-border)" }}>
            ⚠ {erro}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar equipes"}
          </button>
        </div>

      </div>
    </div>
  );
}
