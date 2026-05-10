import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import "./Configuracoes.css";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function diasPadrão() {
  return [0,1,2,3,4,5,6].map((d) => ({
    diaSemana: d,
    ativo: d >= 1 && d <= 5,
    periodos: d >= 1 && d <= 5
      ? [{ inicio: "08:00", fim: "12:00" }, { inicio: "13:00", fim: "18:00" }]
      : [],
  }));
}

function fmtHora(val) {
  const n = val.replace(/\D/g, "").slice(0, 4);
  if (n.length <= 2) return n;
  return `${n.slice(0,2)}:${n.slice(2)}`;
}

export default function Configuracoes() {
  const [schedules, setSchedules]   = useState([]);
  const [sel,       setSel]         = useState(null);   // id selecionado
  const [form,      setForm]        = useState(null);   // jornada em edição
  const [loading,   setLoading]     = useState(true);
  const [salvando,  setSalvando]    = useState(false);
  const [toast,     setToast]       = useState({ texto: "", tipo: "" });

  function mostrarToast(texto, tipo = "success") {
    setToast({ texto, tipo });
    setTimeout(() => setToast({ texto: "", tipo: "" }), 3500);
  }

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const r = await api.get("/crews/work-schedules");
      const lista = r.schedules || [];
      setSchedules(lista);
      if (lista.length && !sel) {
        setSel(lista[0].id);
        setForm(JSON.parse(JSON.stringify(lista[0])));
      }
    } catch { mostrarToast("Erro ao carregar configurações.", "error"); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { carregar(); }, [carregar]);

  function selecionarSchedule(s) {
    setSel(s.id);
    setForm(JSON.parse(JSON.stringify(s)));
  }

  async function novaJornada() {
    const nome = (prompt("Nome da jornada:") || "").trim();
    if (!nome) return;
    if (nome.length < 2 || nome.length > 60) {
      alert("O nome deve ter entre 2 e 60 caracteres.");
      return;
    }
    try {
      const r = await api.post("/crews/work-schedules", { nome, dias: diasPadrão() });
      await carregar();
      setSel(r.schedule.id);
      setForm(JSON.parse(JSON.stringify(r.schedule)));
      mostrarToast("Jornada criada!");
    } catch { mostrarToast("Erro ao criar.", "error"); }
  }

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    try {
      await api.put(`/crews/work-schedules/${form.id}`, { nome: form.nome, descricao: form.descricao, dias: form.dias });
      mostrarToast("Configurações salvas!");
      await carregar();
    } catch { mostrarToast("Erro ao salvar.", "error"); }
    finally { setSalvando(false); }
  }

  async function excluirJornada() {
    if (!form || !window.confirm(`Excluir a jornada "${form.nome}"?`)) return;
    try {
      await api.delete(`/crews/work-schedules/${form.id}`);
      setForm(null); setSel(null);
      await carregar();
      mostrarToast("Jornada removida.");
    } catch { mostrarToast("Erro ao excluir.", "error"); }
  }

  function setDia(diaSemana, campo, valor) {
    setForm((p) => ({
      ...p,
      dias: p.dias.map((d) => d.diaSemana === diaSemana ? { ...d, [campo]: valor } : d),
    }));
  }

  function setPeriodo(diaSemana, idx, campo, valor) {
    setForm((p) => ({
      ...p,
      dias: p.dias.map((d) => {
        if (d.diaSemana !== diaSemana) return d;
        const periodos = d.periodos.map((per, i) => i === idx ? { ...per, [campo]: valor } : per);
        return { ...d, periodos };
      }),
    }));
  }

  function adicionarPeriodo(diaSemana) {
    setForm((p) => ({
      ...p,
      dias: p.dias.map((d) => d.diaSemana === diaSemana
        ? { ...d, periodos: [...d.periodos, { inicio: "08:00", fim: "18:00" }] }
        : d),
    }));
  }

  function removerPeriodo(diaSemana, idx) {
    setForm((p) => ({
      ...p,
      dias: p.dias.map((d) => d.diaSemana === diaSemana
        ? { ...d, periodos: d.periodos.filter((_, i) => i !== idx) }
        : d),
    }));
  }

  return (
    <div className="ek-page">
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Expediente</h1>
          <p>Defina horários de expediente e padrões da empresa</p>
        </div>
      </div>

      {toast.texto && (
        <div className={`ek-toast ek-toast-${toast.tipo}`}>{toast.texto}</div>
      )}

      <div className="cfg-layout">

        {/* ── LISTA DE JORNADAS ── */}
        <aside className="cfg-aside">
          <div className="cfg-aside-header">
            <span className="cfg-aside-title">Jornadas de trabalho</span>
            <button className="ek-btn ek-btn-primary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={novaJornada}>+ Nova</button>
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", padding: 12 }}>Carregando...</p>
          ) : schedules.length === 0 ? (
            <div className="ek-empty" style={{ padding: 24 }}>
              <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Nenhuma jornada criada.</p>
            </div>
          ) : (
            <div className="cfg-aside-list">
              {schedules.map((s) => (
                <button
                  key={s.id}
                  className={`cfg-jornada-item${sel === s.id ? " active" : ""}`}
                  onClick={() => selecionarSchedule(s)}
                >
                  <strong>{s.nome}</strong>
                  {s.descricao && <span>{s.descricao}</span>}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── EDITOR DE JORNADA ── */}
        <main className="cfg-main">
          {!form ? (
            <div className="ek-empty" style={{ padding: 80 }}>
              <p style={{ color: "var(--color-text-muted)" }}>Selecione ou crie uma jornada para editar.</p>
            </div>
          ) : (
            <>
              <div className="cfg-form-header">
                <div style={{ flex: 1 }}>
                  <input
                    className="cfg-nome-input"
                    value={form.nome}
                    onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Nome da jornada"
                  />
                  <input
                    className="cfg-desc-input"
                    value={form.descricao || ""}
                    onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                    placeholder="Descrição (opcional)"
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ek-btn ek-btn-danger-outline" style={{ fontSize: 12 }} onClick={excluirJornada}>Excluir</button>
                  <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>

              <div className="cfg-info-banner">
                ℹ️ Os horários abaixo são apenas <strong>informativos</strong> — não limitam o sistema. Futuramente servirão para avisar quando alguém trabalhar fora do expediente.
              </div>

              <div className="cfg-dias-grid">
                {(form.dias || []).sort((a, b) => a.diaSemana - b.diaSemana).map((dia) => (
                  <div key={dia.diaSemana} className={`cfg-dia-card${dia.ativo ? " ativo" : ""}`}>
                    <div className="cfg-dia-header">
                      <div
                        className={`ek-toggle-sw${dia.ativo ? " on" : ""}`}
                        style={{ width: 30, height: 17, cursor: "pointer" }}
                        onClick={() => setDia(dia.diaSemana, "ativo", !dia.ativo)}
                      >
                        <div className="ek-toggle-knob" style={{ width: 11, height: 11, top: 3, left: 3 }} />
                      </div>
                      <span className="cfg-dia-nome">{DIAS_FULL[dia.diaSemana]}</span>
                      <span className="cfg-dia-abrev">{DIAS[dia.diaSemana]}</span>
                    </div>

                    {dia.ativo && (
                      <div className="cfg-periodos">
                        {dia.periodos.map((per, idx) => (
                          <div key={idx} className="cfg-periodo-row">
                            <input
                              className="cfg-hora-input"
                              value={per.inicio}
                              onChange={(e) => setPeriodo(dia.diaSemana, idx, "inicio", fmtHora(e.target.value))}
                              placeholder="08:00"
                              maxLength={5}
                            />
                            <span className="cfg-periodo-sep">até</span>
                            <input
                              className="cfg-hora-input"
                              value={per.fim}
                              onChange={(e) => setPeriodo(dia.diaSemana, idx, "fim", fmtHora(e.target.value))}
                              placeholder="18:00"
                              maxLength={5}
                            />
                            <button
                              className="cfg-periodo-del"
                              onClick={() => removerPeriodo(dia.diaSemana, idx)}
                              title="Remover período"
                            >×</button>
                          </div>
                        ))}
                        <button
                          className="cfg-add-periodo"
                          onClick={() => adicionarPeriodo(dia.diaSemana)}
                        >+ período</button>
                        {dia.periodos.length === 2 && (
                          <div className="cfg-almoco-hint">
                            💡 Intervalo de almoço: {dia.periodos[0].fim} – {dia.periodos[1].inicio}
                          </div>
                        )}
                      </div>
                    )}

                    {!dia.ativo && (
                      <div className="cfg-dia-folga">Folga</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
