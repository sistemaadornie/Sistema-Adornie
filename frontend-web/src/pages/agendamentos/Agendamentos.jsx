import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import "./Agendamentos.css";
import useAgendamentos from "./hooks/useAgendamentos";
import { api } from "../../services/api";
import useAuth from "../../hooks/useAuth";
import FiltroStatus from "./FiltroStatus";
import { faixaHora } from "../../utils/horario";

/* ── qualidade do endereço para geocodificação ── */
function qualidadeEndereco({ rua, bairro, cidade, estado }) {
  if (!cidade?.trim()) return { nivel: "invalido", cor: "#ef4444", msg: "Cidade obrigatória para posicionar no mapa." };
  if (!rua?.trim() && !bairro?.trim()) return { nivel: "baixa", cor: "#f59e0b", msg: "Sem rua nem bairro: será posicionado apenas na cidade, não no endereço exato." };
  if (!rua?.trim()) return { nivel: "media", cor: "#f59e0b", msg: "Sem rua: será posicionado no bairro, não no endereço exato." };
  return null; // endereço suficiente
}

/* ── helpers de perfil (frontend) ── */
function temPerm(user, ...perms) {
  return perms.some((p) => user?.permissoes?.includes(p));
}
function isInstaladorPuro(user) {
  const altas = ["COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"];
  return temPerm(user, "INSTALADOR") && !altas.some((p) => user?.permissoes?.includes(p));
}
function isComercialPuro(user) {
  const altas = ["OPERADOR_AGENDA","ADMIN_MASTER","GESTOR_USUARIOS"];
  return temPerm(user, "COMERCIAL") && !altas.some((p) => user?.permissoes?.includes(p));
}
function podeGerenciar(user) {
  return temPerm(user, "OPERADOR_AGENDA","ADMIN_MASTER");
}
function podeCriarAgendamento(user) {
  return temPerm(user, "COMERCIAL","OPERADOR_AGENDA","ADMIN_MASTER");
}
function podeEditarAgendamento(user, ag) {
  if (podeGerenciar(user)) return true;
  if (isComercialPuro(user)) return ag?.criado_por === user?.id;
  return false;
}
function podeCancelarAgendamento(user, ag) {
  if (podeGerenciar(user)) return true;
  if (isComercialPuro(user)) return ag?.criado_por === user?.id;
  return false;
}
function podeExcluirAgendamento(user, ag) {
  if (podeGerenciar(user)) return true;
  if (isComercialPuro(user)) return ag?.criado_por === user?.id;
  return false;
}

/* ── CONSTANTES ──────────────────────────────────── */

const DIAS_SEMANA_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_FULL  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const HORAS_DIA = Array.from({ length: 14 }, (_, i) => i + 7); // 07h–20h

const STATUS_META = {
  pre_agendado:  { label: "Pré agendado",    cor: "#94a3b8", classe: "pre_agendado"  },
  agendado:      { label: "Agendado",        cor: "#3b82f6", classe: "agendado"      },
  andamento:     { label: "Em andamento",    cor: "#eab308", classe: "andamento"     },
  concluido:     { label: "Concluído",       cor: "#22c55e", classe: "concluido"     },
  nao_concluido: { label: "Não concluído",   cor: "#f97316", classe: "nao_concluido" },
  cancelado:     { label: "Cancelado",       cor: "#ef4444", classe: "cancelado"     },
  atrasado:      { label: "Atrasado",        cor: "#ef4444", classe: "atrasado"      },
};

const TIPOS = ["Instalação", "Manutenção", "Retorno/Finalização", "Conferência"];

const TIPO_COR = {
  "Pré Agendamento": "var(--ag-tipo-pre)",
  "Conferência":     "var(--ag-tipo-conferencia)",
};

/* ── EQUIPE_MOCK (fallback quando API não retorna ninguém) ── */
const EQUIPE_MOCK = [];

/* ── HELPERS ─────────────────────────────────────── */

function iniciais(nome = "") {
  return nome.trim().split(" ").slice(0,2).map(p => p[0]).join("").toUpperCase();
}

function avatarContent(m) {
  return m?.foto_url
    ? <img src={m.foto_url} alt={m.nome} />
    : iniciais(m.nome);
}

function isoParaDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function detectarAtrasado(ag) {
  if (ag.status === "concluido" || ag.status === "nao_concluido" || ag.status === "cancelado" || ag.status === "atrasado" || ag.status === "pre_agendado") {
    return ag;
  }
  const agora   = new Date();
  const dataAg  = isoParaDate(ag.data);
  const [h, mi] = ag.hora.split(":").map(Number);
  dataAg.setHours(h, mi, 0, 0);
  if (dataAg < agora && ag.status !== "andamento") {
    return { ...ag, status: "atrasado" };
  }
  return ag;
}

function diasNoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function primeiroDiaDaSemana(ano, mes) {
  return new Date(ano, mes, 1).getDay();
}

function semanaDoMes(data) {
  const seg = new Date(data);
  seg.setDate(data.getDate() - data.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(seg);
    d.setDate(seg.getDate() + i);
    return d;
  });
}

function mesLabel(ano, mes) {
  return `${MESES[mes]} de ${ano}`;
}

/* ── DRAG HELPERS ─────────────────────────────────── */
const HORA_INICIO_GRID = 7;
const SLOT_PX = 56;
function minsToTop(totalMins) {
  return (totalMins - HORA_INICIO_GRID * 60) / 60 * SLOT_PX;
}
function snapMins(m, step = 15) {
  return Math.round(m / step) * step;
}
function minsToHora(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}
function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function corEvento(ev) {
  if (ev.tipo === "Conferência") return "#8b5cf6";
  return STATUS_META[ev.status]?.cor || "#888";
}

function metaEvento(ev) {
  return STATUS_META[ev.status] || STATUS_META.agendado;
}

/* ── COMPONENTE PRINCIPAL ────────────────────────── */

export default function Agendamentos() {
  return <AgendamentosOperador />;
}

function AgendamentosOperador() {
  const { user } = useAuth();
  const hoje = new Date();
  const [searchParams, setSearchParams] = useSearchParams();

  const instaladorPuro = false;
  const podeCriar = podeCriarAgendamento(user);

  const [view,       setView]       = useState("mes");
  const [curAno,     setCurAno]     = useState(hoje.getFullYear());
  const [curMes,     setCurMes]     = useState(hoje.getMonth());
  const [curDia,     setCurDia]     = useState(hoje);
  const [diasComConflito, setDiasComConflito] = useState(new Set());

  const {
    agendamentos: agsDoBanco,
    equipe: equipeDoBanco,
    loading,
    erro,
    carregar,
    criar,
    adicionarAnexos,
    atualizar,
    patchAgendamento,
    alterarStatus: alterarStatusAPI,
    excluir,
    criarSugestao,
    listarSugestoes,
    responderSugestao,
  } = useAgendamentos();

  const equipeDisponivel = equipeDoBanco.length > 0 ? equipeDoBanco : EQUIPE_MOCK;

  /* Busca conflitos do mês sempre que curAno/curMes mudam */
  useEffect(() => {
    let cancelled = false;
    async function buscarConflitos() {
      try {
        const { api } = await import("../../services/api");
        const res = await api.get(`/crews/conflitos-mes?ano=${curAno}&mes=${curMes + 1}`);
        if (!cancelled) setDiasComConflito(new Set(res.diasComConflito || []));
      } catch { /* silencioso */ }
    }
    buscarConflitos();
    return () => { cancelled = true; };
  }, [curAno, curMes]);

  /* Polling: recarrega a cada 30s — pausa quando a aba está em background */
  useEffect(() => {
    let timer = setInterval(carregar, 30_000);
    function onVisibility() {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        carregar();
        timer = setInterval(carregar, 30_000);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [carregar]);

  const [busca,        setBusca]        = useState("");
  const [filtrosStatus, setFiltrosStatus] = useState([]);
  const [filtroTipo,   setFiltroTipo]   = useState("todos");
  const [filtroEquipe, setFiltroEquipe] = useState("todos");

  const location = useLocation();
  const [prefillInstalacao, setPrefillInstalacao] = useState(null);

  const [modalNovo,           setModalNovo]           = useState(false);
  const [modalStatus,         setModalStatus]         = useState(null);
  const [agDetalhe,           setAgDetalhe]           = useState(null);
  const [agEditar,            setAgEditar]            = useState(null);
  const [salvando,            setSalvando]            = useState(false);
  const [toastMsg,            setToastMsg]            = useState({ texto: "", tipo: "" });
  const [abaAprovacoes,       setAbaAprovacoes]       = useState(false);
  const [pendentes,           setPendentes]           = useState([]);
  const isAdminMaster = (user?.permissoes || []).includes("ADMIN_MASTER");

  async function carregarPendentes() {
    if (!isAdminMaster) return;
    try {
      const res = await api.get("/agendamentos/pendentes-aprovacao");
      setPendentes(res.pendentes || []);
    } catch { /* silencioso */ }
  }

  useEffect(() => { carregarPendentes(); }, [isAdminMaster]); // eslint-disable-line

  useEffect(() => {
    if (searchParams.get("aprovacoes") === "1" && isAdminMaster) setAbaAprovacoes(true);
  }, [searchParams, isAdminMaster]);

  async function decidirAprovacao(id, aprovado, motivo) {
    setSalvando(true);
    try {
      await api.patch(`/agendamentos/${id}/aprovacao`, { aprovado, motivo });
      mostrarToast(aprovado ? "Urgência aprovada!" : "Solicitação rejeitada.");
      await carregarPendentes();
      await carregar();
    } catch (e) {
      mostrarToast(e.message || "Erro ao decidir aprovação.", "error");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    const pre = location.state?.novoInstalacao;
    if (pre) {
      setPrefillInstalacao(pre);
      setModalNovo(true);
      window.history.replaceState({}, document.title); // limpa o state p/ não reabrir
    }
  }, [location.state]); // eslint-disable-line

  /* drag & drop — sem setState durante o movimento */
  const dragRef     = useRef(null);   // estado vivo do drag (não-React)
  const ghostRef    = useRef(null);   // tooltip flutuante (DOM direto)
  const moverRef    = useRef(null);
  const weekGridRef = useRef(null);
  const dayGridRef  = useRef(null);
  const [draggingId, setDraggingId] = useState(null);   // só para opacidade
  const [ghost,      setGhost]      = useState(null);   // renderiza o tooltip
  function mostrarToast(texto, tipo = "success") {
    setToastMsg({ texto, tipo });
    setTimeout(() => setToastMsg({ texto: "", tipo: "" }), 3500);
  }

  /* Detectar atrasos automaticamente */
  const ags = useMemo(
    () => agsDoBanco.map(detectarAtrasado),
    [agsDoBanco]
  );

  /* ISO do dia selecionado */
  const isoSelecionado = useMemo(() => {
    const d = curDia;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }, [curDia]);

  /* Manter agDetalhe sincronizado quando ags atualiza */
  useEffect(() => {
    if (!agDetalhe) return;
    const atualizado = ags.find((a) => a.id === agDetalhe.id);
    if (atualizado) {
      // Fechar detalhe quando o agendamento for cancelado
      if (atualizado.status === "cancelado") setAgDetalhe(null);
      else setAgDetalhe(atualizado);
    } else {
      setAgDetalhe(null);
    }
  }, [ags]); // eslint-disable-line

  /* Abrir detalhe direto via ?id=...&detalhe=1 (notificação de status) */
  useEffect(() => {
    const idParam     = searchParams.get("id");
    const detalheParam = searchParams.get("detalhe");
    if (!idParam || detalheParam !== "1" || ags.length === 0) return;

    const ag = ags.find((a) => String(a.id) === String(idParam));
    if (ag) {
      setAgDetalhe(ag);
      /* Navegar até o dia do agendamento */
      const [y, m, d] = ag.data.split("-").map(Number);
      const dataAg = new Date(y, m - 1, d);
      setCurDia(dataAg);
      setCurAno(y);
      setCurMes(m - 1);
      setView("dia");
    }
    /* Limpa params da URL */
    setSearchParams({}, { replace: true });
  }, [ags, searchParams]); // eslint-disable-line

  /* Filtrados (para calendário) */
  const agsFiltrados = useMemo(() => {
    return ags.filter((a) => {
      const texto = `${a.titulo} ${a.cliente} ${a.tipo}`.toLowerCase();
      const passaBusca  = !busca || texto.includes(busca.toLowerCase());
      const passaStatus = filtrosStatus.length === 0 || filtrosStatus.includes(a.status);
      const passaTipo   = filtroTipo   === "todos" || a.tipo === filtroTipo;
      const passaEquipe = filtroEquipe === "todos" || a.equipe.includes(Number(filtroEquipe));
      return passaBusca && passaStatus && passaTipo && passaEquipe;
    });
  }, [ags, busca, filtrosStatus, filtroTipo, filtroEquipe]);

  /* Contagem por status */
  const contagem = useMemo(() => {
    const c = {};
    Object.keys(STATUS_META).forEach((k) => { c[k] = 0; });
    ags.forEach((a) => { if (c[a.status] !== undefined) c[a.status]++; });
    return c;
  }, [ags]);

  /* Agendamentos do período visível no calendário (sem filtros de status/busca/tipo/equipe) */
  const agsDoView = useMemo(() => {
    if (view === "dia") {
      return ags.filter((a) => a.data === isoSelecionado);
    }
    if (view === "semana") {
      const dias = semanaDoMes(curDia);
      function dISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
      const ini = dISO(dias[0]);
      const fim = dISO(dias[6]);
      return ags.filter((a) => a.data >= ini && a.data <= fim);
    }
    const prefixo = `${curAno}-${String(curMes + 1).padStart(2, "0")}`;
    return ags.filter((a) => a.data.startsWith(prefixo));
  }, [ags, view, isoSelecionado, curDia, curAno, curMes]);

  /* Contagem por status restrita ao período visível */
  const contagemDoView = useMemo(() => {
    const c = {};
    Object.keys(STATUS_META).forEach((k) => { c[k] = 0; });
    agsDoView.forEach((a) => { if (c[a.status] !== undefined) c[a.status]++; });
    return c;
  }, [agsDoView]);

  /* Auto-limpar filtros de status que deixaram de existir no período */
  useEffect(() => {
    setFiltrosStatus((prev) => prev.filter((s) => (contagemDoView[s] ?? 0) > 0));
  }, [contagemDoView]);

  /* Navegação mês */
  function navMes(dir) {
    let m = curMes + dir;
    let a = curAno;
    if (m > 11) { m = 0; a++; }
    if (m < 0)  { m = 11; a--; }
    setCurMes(m); setCurAno(a);
  }

  /* Navegação semana */
  function navSemana(dir) {
    const d = new Date(curDia);
    d.setDate(d.getDate() + dir * 7);
    setCurDia(d);
  }

  /* Navegação dia */
  function navDia(dir) {
    const d = new Date(curDia);
    d.setDate(d.getDate() + dir);
    setCurDia(d);
  }

  function irHoje() {
    const h = new Date();
    setCurAno(h.getFullYear()); setCurMes(h.getMonth()); setCurDia(new Date(h));
  }

  function agsDoDia(data) {
    const iso = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,"0")}-${String(data.getDate()).padStart(2,"0")}`;
    return agsFiltrados.filter((a) => a.data === iso);
  }

  /* ── CALENDÁRIO MÊS ─────────────── */
  function renderMes() {
    const totalDias = diasNoMes(curAno, curMes);
    const primeiroDS = primeiroDiaDaSemana(curAno, curMes);
    const diasAnt = primeiroDS;
    const totalCells = Math.ceil((totalDias + diasAnt) / 7) * 7;
    const diaAnterior = new Date(curAno, curMes, 0);
    const diasAntTotal = diaAnterior.getDate();

    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      let dia, mes, ano, outroMes = false;
      if (i < diasAnt) {
        dia = diasAntTotal - diasAnt + i + 1;
        mes = curMes - 1; ano = curAno;
        if (mes < 0) { mes = 11; ano--; }
        outroMes = true;
      } else if (i < diasAnt + totalDias) {
        dia = i - diasAnt + 1;
        mes = curMes; ano = curAno;
      } else {
        dia = i - diasAnt - totalDias + 1;
        mes = curMes + 1; ano = curAno;
        if (mes > 11) { mes = 0; ano++; }
        outroMes = true;
      }

      const dataCell = new Date(ano, mes, dia);
      const isHoje = dataCell.toDateString() === hoje.toDateString();
      const iso = `${ano}-${String(mes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
      const eventos = agsFiltrados.filter((a) => a.data === iso);
      const temConflito = diasComConflito.has(iso);
      const MAX_VIS = 3;

      cells.push(
        <div
          key={i}
          className={`ag-cal-cell${isHoje ? " today" : ""}${outroMes ? " other-month" : ""}${temConflito ? " has-conflict" : ""}`}
          onClick={() => {
            setCurDia(dataCell);
            if (eventos.length === 0 && podeCriar) setModalNovo(true);
            else setView("dia");
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const evId = Number(e.dataTransfer.getData("agEvId"));
            const ag = ags.find((a) => a.id === evId);
            if (ag && iso !== ag.data) moverAgendamento(ag, iso, ag.hora, ag.duracao_minutos);
          }}
        >
          <span className="ag-cal-day-num">
            {dia}
            {temConflito && <span className="ag-cal-conflict-badge" title="Conflitos de rota detectados">⚠</span>}
          </span>
          {eventos.slice(0, MAX_VIS).map((ev) => (
            <div
              key={ev.id}
              className="ag-cal-event"
              style={{ background: corEvento(ev), cursor: podeEditarAgendamento(user, ev) ? "grab" : "pointer" }}
              draggable={podeEditarAgendamento(user, ev)}
              onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("agEvId", String(ev.id)); }}
              onClick={(e) => { e.stopPropagation(); setAgDetalhe(ev); }}
            >
              <span className="ag-cal-event-time">{ev.hora}</span>
              <span className="ag-cal-event-title">{ev.titulo}</span>
            </div>
          ))}
          {eventos.length > MAX_VIS && (
            <span className="ag-cal-more">+{eventos.length - MAX_VIS} mais</span>
          )}
        </div>
      );
    }
    return cells;
  }

  /* ── CALENDÁRIO SEMANA ───────────── */
  function renderSemana() {
    const diasSemana = semanaDoMes(curDia);
    return (
      <div style={{ overflowX: "auto" }}>
        {/* Header dias */}
        <div className="ag-week-header" style={{ minWidth: 700 }}>
          <div className="ag-week-header-cell" />
          {diasSemana.map((d, i) => (
            <div
              key={i}
              className={`ag-week-header-cell${d.toDateString() === hoje.toDateString() ? " today" : ""}`}
              onClick={() => { setCurDia(d); setView("dia"); }}
              style={{ cursor: "pointer" }}
            >
              <div className="ag-week-dow">{DIAS_SEMANA_ABREV[d.getDay()]}</div>
              <div className="ag-week-day-num">{d.getDate()}</div>
            </div>
          ))}
        </div>
        {/* Grade horas */}
        <div className="ag-week-grid" style={{ minWidth: 700 }} ref={weekGridRef}>
          <div className="ag-week-time-col">
            {HORAS_DIA.map((h) => (
              <div key={h} className="ag-week-time-slot">{String(h).padStart(2,"0")}:00</div>
            ))}
          </div>
          {diasSemana.map((d, di) => {
            const iso = dateToISO(d);
            const evsDia = agsFiltrados.filter((a) => a.data === iso);
            return (
              <div key={di} className="ag-week-day-col" style={{ position: "relative" }}>
                {HORAS_DIA.map((h) => <div key={h} className="ag-week-slot" />)}
                {evsDia.map((ev) => {
                  if (!ev.hora) return null;
                  const [eh, em] = ev.hora.split(":").map(Number);
                  const topOffset  = minsToTop(eh * 60 + em) + 2;
                  const durMin     = ev.duracao_minutos ?? 60;
                  const alturaBase = Math.max(28, durMin / 60 * SLOT_PX);
                  const isDragging = draggingId === ev.id;
                  const canEdit    = podeEditarAgendamento(user, ev);
                  return (
                    <div
                      key={ev.id}
                      className="ag-week-event"
                      style={{
                        top: topOffset, height: alturaBase,
                        background: corEvento(ev),
                        cursor: canEdit ? (isDragging ? "grabbing" : "grab") : "pointer",
                        opacity: isDragging ? 0.35 : 1,
                        userSelect: "none",
                      }}
                      onClick={() => !isDragging && setAgDetalhe(ev)}
                      onMouseDown={canEdit ? (e) => startGridDrag(ev, "move", e, true) : undefined}
                    >
                      <span className="ag-week-event-time">{faixaHora(ev.hora, ev.duracao_minutos)}</span>
                      <span className="ag-week-event-title">{ev.titulo}</span>
                      {alturaBase >= 72 && ev.cliente && (
                        <span className="ag-week-event-client">{ev.cliente}</span>
                      )}
                      {canEdit && (
                        <div
                          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 7, cursor: "ns-resize", background: "rgba(0,0,0,0.18)", borderRadius: "0 0 3px 3px" }}
                          onMouseDown={(e) => { e.stopPropagation(); startGridDrag(ev, "resize", e, true); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── CALENDÁRIO DIA ──────────────── */
  function renderDia() {
    const isoDay = isoSelecionado;
    const evsDia = agsFiltrados.filter((a) => a.data === isoDay);
    return (
      <div>
        <div className="ag-day-header">
          <strong>{curDia.getDate()}</strong>
          <span>{DIAS_SEMANA_FULL[curDia.getDay()]}, {MESES[curDia.getMonth()]} de {curDia.getFullYear()}</span>
        </div>
        <div style={{ display: "flex" }} ref={dayGridRef}>
          <div className="ag-week-time-col">
            {HORAS_DIA.map((h) => (
              <div key={h} className="ag-week-time-slot">{String(h).padStart(2,"0")}:00</div>
            ))}
          </div>
          <div className="ag-week-day-col" style={{ flex: 1, position: "relative" }}>
            {HORAS_DIA.map((h) => <div key={h} className="ag-week-slot" />)}
            {evsDia.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📅</div>
                  Nenhum agendamento para este dia.
                </div>
              </div>
            )}
            {evsDia.map((ev) => {
              if (!ev.hora) return null;
              const [eh, em]   = ev.hora.split(":").map(Number);
              const topOffset  = minsToTop(eh * 60 + em) + 2;
              const durMin     = ev.duracao_minutos ?? 60;
              const alturaBase = Math.max(28, durMin / 60 * SLOT_PX);
              const isDragging = draggingId === ev.id;
              const canEdit    = podeEditarAgendamento(user, ev);
              return (
                <div
                  key={ev.id}
                  className="ag-week-event"
                  style={{
                    top: topOffset, height: alturaBase,
                    background: corEvento(ev),
                    cursor: canEdit ? (isDragging ? "grabbing" : "grab") : "pointer",
                    opacity: isDragging ? 0.35 : 1,
                    userSelect: "none",
                    left: 2, right: 2,
                  }}
                  onClick={() => !isDragging && setAgDetalhe(ev)}
                  onMouseDown={canEdit ? (e) => startGridDrag(ev, "move", e, false) : undefined}
                >
                  <span className="ag-week-event-time">{faixaHora(ev.hora, ev.duracao_minutos)}</span>
                  <span className="ag-week-event-title">{ev.titulo}</span>
                  {alturaBase >= 60 && ev.cliente && (
                    <span className="ag-week-event-client">{ev.cliente}</span>
                  )}
                  {canEdit && (
                    <div
                      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 7, cursor: "ns-resize", background: "rgba(0,0,0,0.18)", borderRadius: "0 0 3px 3px" }}
                      onMouseDown={(e) => { e.stopPropagation(); startGridDrag(ev, "resize", e, false); }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ── TÍTULO NAVEGAÇÃO ────────────── */
  function tituloNav() {
    if (view === "mes")    return mesLabel(curAno, curMes);
    if (view === "semana") {
      const dias = semanaDoMes(curDia);
      return `${dias[0].getDate()} – ${dias[6].getDate()} ${MESES[dias[0].getMonth()]}`;
    }
    return `${curDia.getDate()} de ${MESES[curDia.getMonth()]} de ${curDia.getFullYear()}`;
  }

  function navAnterior() {
    if (view === "mes")    navMes(-1);
    if (view === "semana") navSemana(-1);
    if (view === "dia")    navDia(-1);
  }
  function navProximo() {
    if (view === "mes")    navMes(1);
    if (view === "semana") navSemana(1);
    if (view === "dia")    navDia(1);
  }

  /* ── AÇÕES ───────────────────────── */
  async function editarAg(dados) {
    setSalvando(true);
    try {
      await atualizar(agEditar.id, dados);
      setAgEditar(null);
      setAgDetalhe(null);
      mostrarToast("Agendamento atualizado com sucesso!");
    } catch (e) {
      if (!e?.data?.detalhes) mostrarToast(e.message || "Erro ao editar agendamento.", "error");
      throw e;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarNovoAg(dados) {
    setSalvando(true);
    try {
      const ag = await criar(dados); // `criar` já remove os File objects
      /* Upload de anexos após criação */
      if (dados.anexos?.length > 0 && ag?.id) {
        await adicionarAnexos(ag.id, dados.anexos);
      }
      setModalNovo(false);
      mostrarToast("Agendamento criado com sucesso!");
    } catch (e) {
      if (!e?.data?.detalhes) mostrarToast(e.message || "Erro ao criar agendamento.", "error");
      throw e;
    } finally {
      setSalvando(false);
    }
  }

  async function alterarStatus(id, novoStatus, arquivos = [], motivo = "") {
    setSalvando(true);
    try {
      await alterarStatusAPI(id, novoStatus, arquivos, motivo);
      mostrarToast("Status atualizado!");
    } catch (e) {
      mostrarToast(e.message || "Erro ao alterar status.", "error");
    } finally {
      setSalvando(false);
      setModalStatus(null);
      setAgDetalhe(null);
    }
  }

  /* Otimista: atualiza a UI imediatamente, PATCH leve no servidor em background */
  const moveAbortRef = useRef(null);

  async function moverAgendamento(ev, novaData, novaHora, novaDuracao) {
    const data            = novaData    ?? ev.data;
    const hora            = novaHora    ?? ev.hora;
    const duracao_minutos = novaDuracao ?? ev.duracao_minutos;

    patchAgendamento(ev.id, { data, hora, duracao_minutos }); // instantâneo na UI

    // Cancela requisição anterior deste mesmo evento se ainda estiver em voo
    moveAbortRef.current?.abort();
    const controller = new AbortController();
    moveAbortRef.current = controller;

    try {
      await api.patch(`/agendamentos/${ev.id}/reagendar`, { data, hora, duracao_minutos }, { signal: controller.signal });
    } catch (e) {
      if (e.name === "AbortError") return; // cancelado por novo drag, ignora
      mostrarToast(e.message || "Erro ao mover agendamento.", "error");
      patchAgendamento(ev.id, { data: ev.data, hora: ev.hora, duracao_minutos: ev.duracao_minutos });
    }
  }

  moverRef.current = moverAgendamento;

  function startGridDrag(ev, type, e, isWeek) {
    if (!podeEditarAgendamento(user, ev)) return;
    e.preventDefault();
    e.stopPropagation();
    const gridEl = isWeek ? weekGridRef.current : dayGridRef.current;
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    if (!ev.hora) return;
    const [h, m] = ev.hora.split(":").map(Number);
    let startColIndex = 0;
    let weekDays = null;
    if (isWeek) {
      weekDays = semanaDoMes(curDia);
      const tcw = (gridEl.querySelector(".ag-week-time-col")?.offsetWidth) || 50;
      const colW = (rect.width - tcw) / 7;
      startColIndex = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left - tcw) / colW)));
    }
    dragRef.current = {
      ev, type,
      startY: e.clientY, startX: e.clientX,
      startMinutes: h * 60 + m,
      startDuration: ev.duracao_minutos || 60,
      startColIndex, weekDays, gridEl, gridRect: rect,
      preview: { data: ev.data, hora: ev.hora, duracao_minutos: ev.duracao_minutos || 60 },
    };
    setDraggingId(ev.id);
    setGhost({ x: e.clientX, y: e.clientY, hora: ev.hora, durMin: ev.duracao_minutos || 60, color: corEvento(ev), type });
  }

  /* Handlers globais — zero setState no mousemove */
  useEffect(() => {
    function onMove(e) {
      const d = dragRef.current;
      if (!d || !ghostRef.current) return;

      // Mover tooltip via DOM direto (sem re-render)
      ghostRef.current.style.left = e.clientX + "px";
      ghostRef.current.style.top  = e.clientY + "px";

      const deltaY    = e.clientY - d.startY;
      const deltaMins = snapMins(deltaY / SLOT_PX * 60);
      let newHora = d.ev.hora;
      let newDur  = d.startDuration;
      let newData = d.ev.data;

      if (d.type === "move") {
        const clamped = Math.max(HORA_INICIO_GRID * 60, Math.min(23 * 60, d.startMinutes + deltaMins));
        newHora = minsToHora(clamped);
        if (d.weekDays) {
          const rect = d.gridEl.getBoundingClientRect();
          const tcw  = (d.gridEl.querySelector(".ag-week-time-col")?.offsetWidth) || 50;
          const colW = (rect.width - tcw) / d.weekDays.length;
          const dc   = Math.round((e.clientX - d.startX) / colW);
          const ci   = Math.max(0, Math.min(d.weekDays.length - 1, d.startColIndex + dc));
          newData = dateToISO(d.weekDays[ci]);
        }
      } else {
        newDur = Math.max(15, snapMins(d.startDuration + deltaMins));
      }

      // Atualiza texto do tooltip via DOM (sem setState)
      ghostRef.current.textContent = d.type === "resize"
        ? faixaHora(d.ev.hora, newDur)
        : faixaHora(newHora, d.ev.duracao_minutos) + (newData !== d.ev.data ? ` — ${newData.split("-").reverse().join("/")}` : "");

      d.preview = { data: newData, hora: newHora, duracao_minutos: newDur };
    }

    function onUp() {
      const d = dragRef.current;
      if (d) {
        const p = d.preview;
        if (p.hora !== d.ev.hora || p.data !== d.ev.data || p.duracao_minutos !== d.startDuration) {
          moverRef.current(d.ev, p.data, p.hora, p.duracao_minutos);
        }
      }
      dragRef.current = null;
      setDraggingId(null);
      setGhost(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []); // eslint-disable-line

  /* ── RENDER ───────────────────────── */
  return (
    <div className="ek-page">

      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Calendário</h1>
          <p>{isInstaladorPuro(user) ? "Visualize os agendamentos e atualize o status dos seus serviços" : "Gerencie suas instalações"}</p>
        </div>
        <div className="ek-head-actions">
          {isAdminMaster && (
            <button className="ek-btn ek-btn-secondary" onClick={() => { setAbaAprovacoes(true); carregarPendentes(); }}>
              Pendentes de aprovação{pendentes.length ? ` (${pendentes.length})` : ""}
            </button>
          )}
          {podeCriar && (
            <button className="ek-btn ek-btn-primary" onClick={() => setModalNovo(true)}>
              + Novo agendamento
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="ek-toolbar" style={{ marginBottom: 20 }}>
        <div className="ek-toolbar-group" style={{ flex: 2, minWidth: 180 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Título, cliente ou tipo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="ek-toolbar-group">
          <label>Tipo</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="todos">Todos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="ek-toolbar-group">
          <label>Equipe</label>
          <select value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)}>
            <option value="todos">Todos</option>
            {equipeDisponivel.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      </div>

      {/* ERRO */}
      {erro && !loading && (
        <div className="ag-erro-banner">
          <span>⚠ {erro}</span>
          <button onClick={carregar}>Tentar novamente</button>
        </div>
      )}

      {/* BARRA DE NAVEGAÇÃO COM FILTROS INLINE */}
      <div className="ag-nav-toolbar">
        <div className="ag-cal-nav">
          <button className="ag-cal-nav-btn" onClick={navAnterior}>‹</button>
          <button className="ag-cal-nav-btn today" onClick={irHoje}>Hoje</button>
          <button className="ag-cal-nav-btn" onClick={navProximo}>›</button>
          <span className="ag-cal-title" style={{ marginLeft: 8 }}>{tituloNav()}</span>
        </div>

        {/* Filtros de status inline */}
        <div className="ag-status-pills">
          <button
            className={`ag-status-pill${filtrosStatus.length === 0 ? " active" : ""}`}
            onClick={() => setFiltrosStatus([])}
          >
            Todos
            <span className="ag-status-pill-count">{agsDoView.length}</span>
          </button>
          {Object.entries(STATUS_META)
            .filter(([key]) => key !== "cancelado" && (contagemDoView[key] ?? 0) > 0)
            .map(([key, meta]) => {
              const ativo = filtrosStatus.includes(key);
              return (
                <button
                  key={key}
                  className={`ag-status-pill${ativo ? " active" : ""}`}
                  style={ativo ? { background: `color-mix(in srgb, ${meta.cor} 18%, var(--color-surface))`, borderColor: meta.cor, color: meta.cor } : {}}
                  onClick={() => setFiltrosStatus(ativo ? filtrosStatus.filter(k => k !== key) : [...filtrosStatus, key])}
                >
                  <span className="ag-status-pill-dot" style={{ background: meta.cor }} />
                  {meta.label}
                  <span className="ag-status-pill-count" style={ativo ? { color: meta.cor } : {}}>{contagemDoView[key]}</span>
                </button>
              );
            })}
        </div>

        <div className="ag-view-tabs">
          {[["dia","Dia"],["semana","Semana"],["mes","Mês"]].map(([v, l]) => (
            <button
              key={v}
              className={`ag-view-tab${view === v ? " active" : ""}`}
              onClick={() => setView(v)}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* CALENDÁRIO — largura total */}
      <div className="ag-cal-grid-wrap">
              {view === "mes" && (
                <>
                  <div className="ag-cal-month-grid">
                    {DIAS_SEMANA_ABREV.map((d) => (
                      <div key={d} className="ag-cal-dow-cell">{d}</div>
                    ))}
                    {renderMes()}
                  </div>
                  {agsFiltrados.length === 0 && !loading && (
                    <div className="ek-empty" style={{ padding: "28px 16px", textAlign: "center" }}>
                      <div className="ek-empty-icon" style={{ fontSize: 28 }}>📅</div>
                      <p style={{ color: "var(--color-text-muted)", marginTop: 8, fontSize: 13 }}>
                        {busca || filtrosStatus.length > 0 || filtroEquipe !== "todos" || filtroTipo !== "todos"
                          ? "Nenhum agendamento com os filtros aplicados."
                          : "Nenhum agendamento neste mês."}
                      </p>
                      {podeCriar && !busca && filtrosStatus.length === 0 && filtroEquipe === "todos" && filtroTipo === "todos" && (
                        <button
                          className="ek-btn ek-btn-primary"
                          style={{ marginTop: 10, fontSize: 12 }}
                          onClick={() => setModalNovo(true)}
                        >
                          + Criar agendamento
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {view === "semana" && renderSemana()}
              {view === "dia"    && renderDia()}
            </div>

      {/* ── GHOST DRAG TOOLTIP ── */}
      {ghost && (
        <div
          ref={ghostRef}
          style={{
            position: "fixed", pointerEvents: "none", zIndex: 9999,
            left: ghost.x, top: ghost.y,
            transform: "translate(-50%, -130%)",
            background: ghost.color, color: "#000",
            borderRadius: 6, padding: "4px 10px",
            fontSize: 12, fontWeight: 700,
            boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          {ghost.type === "resize" ? faixaHora(ghost.hora, ghost.durMin) : faixaHora(ghost.hora, ghost.durMin)}
        </div>
      )}

      {/* ── TOAST ── */}
      {toastMsg.texto && (
        <div
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 9999,
            padding: "12px 18px", borderRadius: "var(--radius-md)",
            background: "var(--color-surface-strong)", border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-medium)", fontSize: 13, fontWeight: 500,
            color: "var(--color-text)", maxWidth: 360,
            borderLeft: `3px solid ${toastMsg.tipo === "error" ? "var(--ag-cancelado)" : "var(--ag-concluido)"}`,
          }}
        >
          {toastMsg.texto}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && <div className="ag-loading-bar" />}

      {/* ── MODAL: NOVO AGENDAMENTO ── */}
      {modalNovo && (
        <NovoAgendamentoModal
          onClose={() => { setModalNovo(false); setPrefillInstalacao(null); }}
          onSalvar={salvarNovoAg}
          equipe={equipeDisponivel}
          salvando={salvando}
          agendamentos={ags}
          dataInicial={`${curDia.getFullYear()}-${String(curDia.getMonth()+1).padStart(2,"0")}-${String(curDia.getDate()).padStart(2,"0")}`}
          user={user}
          prefill={prefillInstalacao}
        />
      )}

      {/* ── MODAL: DETALHE DO AGENDAMENTO ── */}
      {agDetalhe && !agEditar && (
        <DetalheModal
          ag={agDetalhe}
          equipe={equipeDisponivel}
          user={user}
          onClose={() => setAgDetalhe(null)}
          onEditar={() => setAgEditar(agDetalhe)}
          onAlterarStatus={(novoStatus) => {
            const requerFoto = ["andamento","concluido","nao_concluido"].includes(novoStatus);
            if (requerFoto) {
              setModalStatus({ ag: agDetalhe, novoStatus });
            } else {
              alterarStatus(agDetalhe.id, novoStatus);
            }
          }}
          criarSugestao={criarSugestao}
          listarSugestoes={listarSugestoes}
          responderSugestao={responderSugestao}
        />
      )}

      {/* ── MODAL: EDITAR AGENDAMENTO ── */}
      {agEditar && (
        <NovoAgendamentoModal
          agEditar={agEditar}
          onClose={() => setAgEditar(null)}
          onSalvar={editarAg}
          equipe={equipeDisponivel}
          salvando={salvando}
          agendamentos={ags}
          user={user}
        />
      )}

      {/* ── MODAL: ALTERAR STATUS (com foto obrigatória) ── */}
      {modalStatus && (
        <StatusModal
          ag={modalStatus.ag}
          novoStatus={modalStatus.novoStatus}
          onClose={() => setModalStatus(null)}
          salvando={salvando}
          onConfirmar={(arquivos, motivo) =>
            alterarStatus(modalStatus.ag.id, modalStatus.novoStatus, arquivos, motivo)
          }
        />
      )}

      {/* ── PAINEL: PENDENTES DE APROVAÇÃO (ADMIN_MASTER) ── */}
      {abaAprovacoes && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setAbaAprovacoes(false)}>
          <div className="modal-box" style={{ maxWidth: 680, maxHeight: "85vh", overflowY: "auto" }}>
            <div className="modal-header">
              <h2 className="modal-title">Pendentes de aprovação</h2>
              <button className="modal-close" onClick={() => setAbaAprovacoes(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendentes.length === 0 ? (
                <p style={{ color: "var(--color-text-muted)" }}>Nenhuma solicitação pendente.</p>
              ) : pendentes.map((p) => (
                <CartaoAprovacao key={p.id} p={p} onDecidir={decidirAprovacao} />
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


/* ── CARTÃO DE APROVAÇÃO DE URGÊNCIA ─────────────── */
function CartaoAprovacao({ p, onDecidir }) {
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <div style={{ fontWeight: 600 }}>{p.titulo} {p.pedido_numero ? <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>· {p.pedido_numero}</span> : null}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{p.cliente}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
        Solicitada: {p.data ? p.data.split("-").reverse().join("/") : "—"}
        {p.aprovacao_data_minima ? ` · mínima: ${p.aprovacao_data_minima.split("-").reverse().join("/")}` : ""}
        {typeof p.aprovacao_dias_faltantes === "number" ? ` · faltam ${p.aprovacao_dias_faltantes} dias úteis` : ""}
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}><strong>Motivo:</strong> {p.motivo_urgencia || "—"}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>Solicitante: {p.criado_por_nome || "—"}</div>
      {!rejeitando ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="ek-btn ek-btn-primary" onClick={() => onDecidir(p.id, true)}>✅ Aprovar</button>
          <button className="ek-btn ek-btn-secondary" onClick={() => setRejeitando(true)}>❌ Rejeitar</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo da rejeição (obrigatório)" style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="ek-btn ek-btn-primary" disabled={!motivo.trim()} onClick={() => onDecidir(p.id, false, motivo.trim())}>Confirmar rejeição</button>
            <button className="ek-btn ek-btn-secondary" onClick={() => { setRejeitando(false); setMotivo(""); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   COMPONENTES INTERNOS
   ============================================================ */

/* ── EVENT CARD (lista dia) ──────────────────────── */
function EventCard({ ev, equipe, onClick }) {
  const meta = metaEvento(ev);
  const corBorda = TIPO_COR[ev.tipo] ?? meta.cor;
  return (
    <div
      className="ag-event-card"
      style={{ borderLeftColor: corBorda, borderLeftWidth: 5 }}
      onClick={onClick}
    >
      <div className="ag-event-card-time">
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text)" }}>{faixaHora(ev.hora, ev.duracao_minutos)}</span>
      </div>
      <div className="ag-event-card-body">
        <div className="ag-event-card-title">{ev.titulo}</div>
        <div className="ag-event-card-sub">
          <span>{ev.cliente}</span>
          <span>·</span>
          <span>{ev.tipo}</span>
          <span className={`ag-badge ${meta.classe}`}>{meta.label}</span>
        </div>
        {ev.status === "nao_concluido" && (
          <div className="ag-pendente-reagendar">⚠ Reagendamento pendente</div>
        )}
        {ev.geocod_falhou && !ev.lat && (
          <div title="Endereço não pôde ser localizado no mapa — verifique cidade, rua e número" style={{
            fontSize: 10, color: "#f59e0b", marginTop: 2,
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <span>⚠</span> Endereço não localizado
          </div>
        )}
        {ev.endereco && (
          <div
            className="ag-event-card-address"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`https://maps.google.com/?q=${encodeURIComponent(ev.endereco)}`, "_blank");
            }}
          >
            📍 {ev.endereco}
          </div>
        )}
        {ev.equipe?.length > 0 && (
          <div className="ag-event-card-team">
            {ev.equipe.slice(0,4).map((id) => {
              const m = (equipe || []).find((e) => e.id === id);
              return m ? (
                <div
                  key={id}
                  className="ag-team-avatar"
                  title={`${m.nome}${ev.pessoa_obrigatoria_id === id ? " (obrigatório)" : ""}`}
                  style={ev.pessoa_obrigatoria_id === id ? { outline: "2px solid var(--color-primary)", outlineOffset: 1 } : undefined}
                >
                  {avatarContent(m)}
                </div>
              ) : null;
            })}
            {ev.equipe.length > 4 && (
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                +{ev.equipe.length - 4}
              </span>
            )}
          </div>
        )}
        {ev.pessoa_obrigatoria_id && (() => {
          const m = (equipe || []).find((e) => e.id === ev.pessoa_obrigatoria_id);
          return m ? (
            <div style={{ fontSize: 10, color: "var(--color-primary)", marginTop: 3, display: "flex", alignItems: "center", gap: 3 }}>
              🔒 Obrigatório: {m.nome}
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

/* ── HELPER: duração de vídeo (segundos) via metadata ── */
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

/* ── HELPER: ícone do arquivo pelo tipo/extensão ─── */
function iconeArquivo(f) {
  const mime = (f?.type || "");
  const ext  = ((f?.name || "").split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || /^(jpg|jpeg|png|gif|webp|avif)$/.test(ext)) return "🖼";
  if (mime.startsWith("video/") || /^(mp4|webm|mov|avi|mkv|m4v|3gp|ogg)$/.test(ext)) return "🎬";
  if (/^pdf$/.test(ext)) return "📑";
  return "📄";
}

/* ── MODAL: NOVO / EDITAR AGENDAMENTO ───────────── */

function horaFimFromDuracao(hora, duracaoMin) {
  if (!hora || !duracaoMin) return "";
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + Number(duracaoMin);
  const fh = Math.floor(total / 60);
  const fm = total % 60;
  if (fh >= 24) return "";
  return `${String(fh).padStart(2, "0")}:${String(fm).padStart(2, "0")}`;
}

function NovoAgendamentoModal({ onClose, onSalvar, equipe, salvando, agendamentos, agEditar, dataInicial, prefill, user }) {
  const modoEditar = !!agEditar;
  const [preAgendado, setPreAgendado] = useState(agEditar?.status === "pre_agendado");
  const [form, setForm] = useState({
    titulo:      agEditar?.titulo      ?? (prefill ? `Instalação — ${prefill.pedido_numero || ""}`.trim() : ""),
    cliente:     agEditar?.cliente     ?? prefill?.cliente    ?? "",
    tipo:        agEditar?.tipo        ?? "Instalação",
    data:        agEditar?.data        ?? dataInicial ?? "",
    hora:        agEditar?.hora        ?? "",
    hora_fim:    horaFimFromDuracao(agEditar?.hora, agEditar?.duracao_minutos),
    cep:         agEditar?.cep         ?? prefill?.cep         ?? "",
    rua:         agEditar?.rua         ?? prefill?.rua         ?? "",
    numero:      agEditar?.numero      ?? prefill?.numero      ?? "",
    complemento: agEditar?.complemento ?? prefill?.complemento ?? "",
    bairro:      agEditar?.bairro      ?? prefill?.bairro      ?? "",
    cidade:      agEditar?.cidade      ?? prefill?.cidade      ?? "",
    estado:      agEditar?.estado      ?? prefill?.estado      ?? "",
    descricao: [agEditar?.descricao, agEditar?.observacoes].filter(Boolean).join("\n\n"),
    pedido_id:   agEditar?.pedido_id   ?? (prefill?.pedido_id ? String(prefill.pedido_id) : ""),
  });
  const [pessoaObrigatoria, setPessoaObrigatoria] = useState(agEditar?.pessoa_obrigatoria_id ?? null);
  const [buscandoCEP,  setBuscandoCEP]  = useState(false);
  const [equipeSelec,  setEquipeSelec]  = useState(agEditar?.equipe ?? []);
  const [itens,        setItens]        = useState(agEditar?.itens  ?? prefill?.itens ?? []);
  const [novoItem,     setNovoItem]     = useState("");
  const [anexos,       setAnexos]       = useState([]);
  const [dragOver,     setDragOver]     = useState(false);
  const [erroForm,     setErroForm]     = useState("");
  const [erroPrazo,    setErroPrazo]    = useState(null); // { message, detalhes }
  const [motivoUrgencia, setMotivoUrgencia] = useState("");
  const [pedidosLista, setPedidosLista] = useState([]);
  const [clienteTel,   setClienteTel]   = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const fileRef = useRef();

  /* Autocomplete de clientes */
  const [clientesSug,  setClientesSug]  = useState([]);
  const [mostrarSug,   setMostrarSug]   = useState(false);
  const [clienteSel,   setClienteSel]   = useState(
    agEditar?.cliente_id ? { id: agEditar.cliente_id, nome: agEditar.cliente } : null
  );
  const [enderecoSel,  setEnderecoSel]  = useState("");
  const buscarTimerRef = useRef(null);
  const buscarAbortRef = useRef(null);

  /* Carrega pedidos sempre que o cliente selecionado muda */
  useEffect(() => {
    if (clienteSel?.id) {
      api.get(`/pedidos?cliente_id=${clienteSel.id}`)
        .then((r) => setPedidosLista(r.pedidos || []))
        .catch(() => {});
    } else {
      setPedidosLista([]);
    }
  }, [clienteSel?.id]); // eslint-disable-line

  /* Derivado: indica se o cliente que será salvo já existe no cadastro */
  const clienteExistente = clienteSel !== null;
  const clienteNovo      = form.cliente.trim().length >= 2 && !clienteExistente && !mostrarSug;

  function buscarClientes(q) {
    clearTimeout(buscarTimerRef.current);
    buscarAbortRef.current?.abort();
    if (!q.trim() || q.length < 2) { setClientesSug([]); setMostrarSug(false); return; }
    buscarTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      buscarAbortRef.current = controller;
      try {
        const res = await api.get(`/clientes?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        setClientesSug(res.clientes || []);
        setMostrarSug(true);
      } catch (e) {
        if (e.name !== "AbortError") setClientesSug([]);
      }
    }, 280);
  }

  function selecionarCliente(c) {
    setForm((p) => ({ ...p, cliente: c.nome }));
    setClienteSel(c);
    setMostrarSug(false);
    setClientesSug([]);
    const pad = c.enderecos?.find((e) => e.is_padrao) || c.enderecos?.[0];
    if (pad) aplicarEndereco(pad, String(pad.id));
  }

  function aplicarEndereco(e, endId) {
    setEnderecoSel(endId);
    setForm((p) => ({
      ...p,
      cep:        e.cep         || p.cep,
      rua:        e.rua         || p.rua,
      numero:     e.numero      || p.numero,
      complemento:e.complemento || p.complemento,
      bairro:     e.bairro      || p.bairro,
      cidade:     e.cidade      || p.cidade,
      estado:     e.estado      || p.estado,
    }));
  }

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function toggleEquipe(id) {
    setEquipeSelec((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  function handlePessoaObrigatoria(idStr) {
    const id = idStr ? Number(idStr) : null;
    setPessoaObrigatoria(id);
    // Garantir que a pessoa obrigatória esteja na equipe
    if (id) setEquipeSelec((p) => p.includes(id) ? p : [...p, id]);
  }

  function adicionarItem() {
    if (!novoItem.trim()) return;
    setItens((p) => [...p, novoItem.trim()]);
    setNovoItem("");
  }

  async function handleFiles(files) {
    const validos = [];
    const rejeitados = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("video/")) {
        const dur = await getVideoDuration(f);
        if (dur > 60) { rejeitados.push(f.name); continue; }
      }
      validos.push(f);
    }
    if (rejeitados.length > 0) {
      setErroForm(`Vídeo(s) rejeitado(s) — limite de 60 segundos: ${rejeitados.join(", ")}`);
    } else {
      setErroForm("");
    }
    if (validos.length > 0) {
      setAnexos((p) => [...p, ...validos.map((f) => ({ name: f.name, size: f.size, file: f }))]);
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleCEP(valor) {
    const n = valor.replace(/\D/g, "").slice(0, 8);
    const fmt = n.length > 5 ? `${n.slice(0,5)}-${n.slice(5)}` : n;
    set("cep", fmt);
    if (n.length === 8) {
      setBuscandoCEP(true);
      fetch(`https://viacep.com.br/ws/${n}/json/`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.erro) {
            setForm((p) => ({
              ...p,
              rua:    d.logradouro || p.rua,
              bairro: d.bairro     || p.bairro,
              cidade: d.localidade || p.cidade,
              estado: d.uf         || p.estado,
            }));
          }
        })
        .catch(() => {})
        .finally(() => setBuscandoCEP(false));
    }
  }

  function calcularDuracao() {
    let novoInicio = 0;
    let duracaoMinutos = 0;
    let novoFim = 0;
    if (form.hora) {
      const [nh, nm] = form.hora.split(":").map(Number);
      novoInicio = nh * 60 + nm;
      novoFim = novoInicio;
      if (form.hora_fim) {
        const [fh, fm] = form.hora_fim.split(":").map(Number);
        novoFim = fh * 60 + fm;
        duracaoMinutos = novoFim > novoInicio ? novoFim - novoInicio : 0;
      }
    }
    return { novoInicio, novoFim, duracaoMinutos };
  }

  function montarPayload(duracaoMinutos) {
    const partes = [form.rua, form.numero, form.complemento, form.bairro, form.cidade, form.estado ? `- ${form.estado}` : ""].filter(Boolean);
    const endereco = partes.length ? partes.join(", ") + (form.cep ? ` — CEP ${form.cep}` : "") : (agEditar?.endereco || null);
    return {
      ...form,
      observacoes: null,
      endereco,
      equipe: equipeSelec,
      itens,
      anexos,
      duracao_minutos: duracaoMinutos,
      pessoa_obrigatoria_id: pessoaObrigatoria,
      pedido_id: form.pedido_id ? Number(form.pedido_id) : null,
      status: preAgendado ? "pre_agendado" : "agendado",
      cliente_novo: !clienteSel,
      cliente_telefone: clienteTel || undefined,
      cliente_email: clienteEmail || undefined,
    };
  }

  async function enviar(payload) {
    setErroPrazo(null);
    setErroForm("");
    try {
      await onSalvar(payload);
    } catch (err) {
      if (err?.data?.detalhes) {
        setErroPrazo({ message: err.message, detalhes: err.data.detalhes });
      } else {
        setErroForm(err?.message || "Erro ao salvar agendamento.");
      }
    }
  }

  function enviarComUrgencia() {
    const { duracaoMinutos } = calcularDuracao();
    enviar({ ...montarPayload(duracaoMinutos), solicitar_urgencia: true, motivo_urgencia: motivoUrgencia.trim() });
  }

  function enviarIgnorandoPrazo() {
    const { duracaoMinutos } = calcularDuracao();
    enviar({ ...montarPayload(duracaoMinutos), ignorar_prazos: true });
  }

  function salvar() {
    if (!form.titulo || !form.cliente || !form.data || (!preAgendado && !form.hora)) {
      setErroForm(preAgendado
        ? "Preencha os campos obrigatórios: título, cliente e data."
        : "Preencha os campos obrigatórios: título, cliente, data e horário.");
      return;
    }

    const { novoInicio, novoFim, duracaoMinutos } = calcularDuracao();

    if (form.hora && form.hora_fim) {
      const [fh, fm] = form.hora_fim.split(":").map(Number);
      const novoFimCheck = fh * 60 + fm;
      if (novoFimCheck <= novoInicio) {
        setErroForm("O horário de término deve ser após o horário de início.");
        return;
      }
    }

    if (form.hora && duracaoMinutos > 0 && equipeSelec.length > 0) {
      const conflito = agendamentos.find((ag) => {
        if (ag.id === agEditar?.id) return false;
        if (ag.data !== form.data) return false;
        const instaladorComum = (ag.equipe ?? []).some((uid) => equipeSelec.includes(uid));
        if (!instaladorComum) return false;
        if (!ag.hora) return false;
        const [ah, am] = ag.hora.split(":").map(Number);
        const agInicio = ah * 60 + am;
        const agFim = agInicio + (ag.duracao_minutos || 0);
        if (agFim === agInicio) return false;
        return novoInicio < agFim && novoFim > agInicio;
      });
      if (conflito) {
        const fimConflito = horaFimFromDuracao(conflito.hora, conflito.duracao_minutos);
        setErroForm(`Conflito com "${conflito.titulo}" (${conflito.hora}${fimConflito ? ` – ${fimConflito}` : ""}). Escolha outro horário.`);
        return;
      }
    }

    enviar(montarPayload(duracaoMinutos));
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-box modal-lg"
        style={{ maxWidth: 780, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{modoEditar ? "Editar agendamento" : "Novo agendamento"}</h2>
            <p>{modoEditar ? "Altere os dados da visita" : "Preencha os dados da visita"}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Linha 1 — Título */}
          <div className="ag-modal-grid">
            <div className="ag-form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Título *</label>
              <input placeholder="Ex: Instalação câmeras - Cliente X" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} />
            </div>
          </div>

          {/* Linha 2 — Cliente | Pedido */}
          <div className="ag-modal-grid">
            <div className="ag-form-field" style={{ position: "relative" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Cliente *
                {clienteExistente && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                    background: "color-mix(in srgb,#22c55e 14%,transparent)",
                    color: "#16a34a", border: "1px solid color-mix(in srgb,#22c55e 30%,transparent)",
                  }}>
                    ✓ Cadastrado
                  </span>
                )}
                {clienteNovo && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                    background: "color-mix(in srgb,#f59e0b 14%,transparent)",
                    color: "#b45309", border: "1px solid color-mix(in srgb,#f59e0b 30%,transparent)",
                  }}>
                    + Novo cliente
                  </span>
                )}
              </label>
              <input
                placeholder="Nome do cliente"
                value={form.cliente}
                onChange={(e) => {
                  set("cliente", e.target.value);
                  set("pedido_id", "");
                  buscarClientes(e.target.value);
                  setClienteSel(null);
                  setClienteTel("");
                  setClienteEmail("");
                }}
                onFocus={() => form.cliente.length >= 2 && setMostrarSug(clientesSug.length > 0)}
                onBlur={() => setTimeout(() => setMostrarSug(false), 180)}
                autoComplete="off"
                style={clienteExistente ? { borderColor: "#22c55e" } : clienteNovo ? { borderColor: "#f59e0b" } : undefined}
              />
              {mostrarSug && clientesSug.length > 0 && (
                <div className="ag-cliente-dropdown">
                  {clientesSug.map((c) => (
                    <div key={c.id} className="ag-cliente-opt" onMouseDown={() => selecionarCliente(c)}>
                      <strong>{c.nome}</strong>
                      {c.telefone && <span>{c.telefone}</span>}
                    </div>
                  ))}
                </div>
              )}
              {clienteSel && clienteSel.enderecos?.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <select
                    value={enderecoSel}
                    onChange={(e) => {
                      const end = clienteSel.enderecos.find((x) => String(x.id) === e.target.value);
                      if (end) aplicarEndereco(end, e.target.value);
                    }}
                    style={{ fontSize: 12, padding: "5px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", width: "100%" }}
                  >
                    {clienteSel.enderecos.map((e) => (
                      <option key={e.id} value={String(e.id)}>
                        {e.label}{e.is_padrao ? " ★" : ""} — {[e.rua, e.numero, e.cidade].filter(Boolean).join(", ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="ag-form-field">
              <label>Pedido vinculado <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(opcional)</span></label>
              <select
                value={form.pedido_id}
                onChange={(e) => {
                  const pid = e.target.value;
                  set("pedido_id", pid);
                  if (pid) {
                    const ped = pedidosLista.find((p) => String(p.id) === pid);
                    if (ped && (ped.rua || ped.cidade || ped.cep)) {
                      setForm((prev) => ({
                        ...prev,
                        pedido_id:   pid,
                        cep:         ped.cep         || prev.cep,
                        rua:         ped.rua         || prev.rua,
                        numero:      ped.numero_rua  || prev.numero,
                        complemento: ped.complemento || prev.complemento,
                        bairro:      ped.bairro      || prev.bairro,
                        cidade:      ped.cidade      || prev.cidade,
                        estado:      ped.estado      || prev.estado,
                      }));
                    }
                  }
                }}
                disabled={!clienteSel && !clienteNovo}
                title={!clienteSel && !clienteNovo ? "Selecione um cliente primeiro" : undefined}
              >
                <option value="">— Nenhum —</option>
                {pedidosLista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero}{p.descricao ? ` — ${p.descricao.slice(0, 40)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Campos extras para novo cliente */}
          {clienteNovo && !modoEditar && (
            <div className="ag-modal-grid">
              <div className="ag-form-field">
                <label>Telefone <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(opcional)</span></label>
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={clienteTel}
                  onChange={(e) => setClienteTel(e.target.value)}
                />
              </div>
              <div className="ag-form-field">
                <label>E-mail <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(opcional)</span></label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={clienteEmail}
                  onChange={(e) => setClienteEmail(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Linha 3 — Tipo | Pré agendamento */}
          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ag-form-field" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  border: `1.5px solid ${preAgendado ? "#94a3b8" : "var(--color-border)"}`,
                  background: preAgendado ? "rgba(148,163,184,0.08)" : "var(--color-surface-soft)",
                  cursor: "pointer", userSelect: "none",
                  transition: "all 0.15s",
                  height: "38px",
                }}
              >
                <input
                  type="checkbox"
                  checked={preAgendado}
                  onChange={(e) => setPreAgendado(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "#94a3b8", cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: preAgendado ? "#94a3b8" : "var(--color-text-secondary)" }}>
                  Pré agendamento
                </span>
              </label>
            </div>
          </div>

          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div className="ag-form-field">
              <label>Data *</label>
              <input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Início {preAgendado ? <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(opcional)</span> : "*"}</label>
              <input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Término</label>
              <input
                type="time"
                value={form.hora_fim}
                min={form.hora || undefined}
                onChange={(e) => set("hora_fim", e.target.value)}
              />
            </div>
          </div>

          {/* Endereço estruturado */}
          <div className="ag-section-divider">Endereço</div>

          <div className="ag-form-field" style={{ maxWidth: 200 }}>
            <label>CEP</label>
            <input
              placeholder="00000-000"
              value={form.cep}
              onChange={(e) => handleCEP(e.target.value)}
              maxLength={9}
            />
          </div>

          {buscandoCEP && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "-8px 0 0" }}>
              Buscando CEP...
            </p>
          )}

          <div className="ag-modal-grid">
            <div className="ag-form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Rua / Avenida</label>
              <input placeholder="Ex: Rua das Flores" value={form.rua} onChange={(e) => set("rua", e.target.value)} />
            </div>
          </div>

          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Número</label>
              <input placeholder="123" value={form.numero} onChange={(e) => set("numero", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Complemento</label>
              <input placeholder="Apto, bloco, casa..." value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
            </div>
          </div>

          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr 80px" }}>
            <div className="ag-form-field">
              <label>Bairro</label>
              <input placeholder="Bairro" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Cidade *</label>
              <input
                placeholder="Cidade"
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                style={!form.cidade?.trim() ? { borderColor: "#f59e0b" } : undefined}
              />
            </div>
            <div className="ag-form-field">
              <label>Estado</label>
              <input placeholder="SP" value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase().slice(0,2))} maxLength={2} />
            </div>
          </div>

          {/* Aviso de qualidade do endereço */}
          {(() => {
            const q = qualidadeEndereco(form);
            if (!q) return null;
            return (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "8px 12px", borderRadius: 8,
                background: q.nivel === "invalido" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                border: `1px solid ${q.nivel === "invalido" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
                fontSize: 12, color: q.cor, lineHeight: 1.4,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{q.nivel === "invalido" ? "⛔" : "⚠"}</span>
                <span>{q.msg} O agendamento será salvo, mas <strong>não aparecerá no mapa</strong> sem um endereço completo.</span>
              </div>
            );
          })()}

          <div className="ag-form-field">
            <label>Descrição / Observação</label>
            <textarea placeholder="Detalhe o serviço e adicione observações relevantes..." value={form.descricao} onChange={(e) => set("descricao", e.target.value)} rows={4} />
          </div>

          {/* Itens para levar */}
          <div className="ag-form-field">
            <label>Itens para levar</label>
            <div className="ag-itens-list">
              {itens.map((it, i) => (
                <div key={i} className="ag-item-tag">
                  📦 {typeof it === "string" ? it : it.nome}
                  <button onClick={() => setItens((p) => p.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
            <div className="ag-add-item-row" style={{ marginTop: itens.length ? 8 : 0 }}>
              <input
                placeholder="Adicionar item..."
                value={novoItem}
                onChange={(e) => setNovoItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && adicionarItem()}
              />
              <button className="ek-btn ek-btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={adicionarItem}>
                + Adicionar
              </button>
            </div>
          </div>

          {/* Equipe */}
          <div className="ag-form-field">
            <label>Selecionar equipe</label>
            <div className="ag-team-list">
              {equipe.map((m) => (
                <div
                  key={m.id}
                  className={`ag-team-item${equipeSelec.includes(m.id) ? " selected" : ""}`}
                  onClick={() => toggleEquipe(m.id)}
                >
                  <div className="ag-team-avatar">{avatarContent(m)}</div>
                  <div className="ag-team-info">
                    <strong>{m.nome}</strong>
                    <span>{m.setor}</span>
                  </div>
                  <span className="ag-team-check">{equipeSelec.includes(m.id) ? "✓" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pessoa obrigatória */}
          <div className="ag-form-field">
            <label>Pessoa obrigatória <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(opcional)</span></label>
            <select
              value={pessoaObrigatoria ?? ""}
              onChange={(e) => handlePessoaObrigatoria(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {equipe.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
            {pessoaObrigatoria && (
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, display: "block" }}>
                Esta pessoa será adicionada à equipe automaticamente e deve estar presente no agendamento.
              </span>
            )}
          </div>


          {/* Anexos */}
          <div className="ag-form-field">
            <label>Anexos (PDF, imagens, vídeos)</label>
            <div
              className={`ag-upload-zone${dragOver ? " drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="ag-upload-zone-icon">📎</div>
              Arraste arquivos ou clique para selecionar
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
            {anexos.length > 0 && (
              <div className="ag-upload-list">
                {anexos.map((a, i) => (
                  <div key={i} className="ag-upload-item">
                    <span>{iconeArquivo(a.file || a)}</span>
                    <span className="ag-upload-item-name">{a.name}</span>
                    <button className="ag-upload-remove" onClick={() => setAnexos((p) => p.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {erroPrazo && (
          <div style={{ background: "color-mix(in srgb, #ef4444 10%, var(--color-surface))", border: "1px solid #ef4444", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 10, margin: "0 24px 10px" }}>
            <div style={{ fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>⏰ Prazo mínimo não atendido</div>
            <div style={{ fontSize: 13 }}>{erroPrazo.message}</div>
            {erroPrazo.detalhes?.data_minima && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                Data mínima: {erroPrazo.detalhes.data_minima.split("-").reverse().join("/")}
                {typeof erroPrazo.detalhes.dias_uteis_faltantes === "number" ? ` · faltam ${erroPrazo.detalhes.dias_uteis_faltantes} dias úteis` : ""}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Motivo da urgência</label>
              <textarea value={motivoUrgencia} onChange={(e) => setMotivoUrgencia(e.target.value)} rows={2}
                placeholder="Ex: cliente VIP, evento em data fixa…" style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="ek-btn ek-btn-primary" disabled={salvando || !motivoUrgencia.trim()} onClick={enviarComUrgencia}>
                Solicitar aprovação de urgência
              </button>
              {(user?.permissoes || []).includes("ADMIN_MASTER") && (
                <button className="ek-btn ek-btn-secondary" disabled={salvando} onClick={enviarIgnorandoPrazo}>
                  Ignorar prazo (admin)
                </button>
              )}
            </div>
          </div>
        )}

        {erroForm && (
          <div style={{
            margin: "0 24px 0", padding: "10px 14px",
            background: "color-mix(in srgb, #ef4444 10%, var(--color-surface-soft))",
            border: "1px solid color-mix(in srgb, #ef4444 35%, var(--color-border))",
            borderRadius: "var(--radius-sm)", fontSize: 13, color: "#ef4444", fontWeight: 500,
          }}>
            ⚠ {erroForm}
          </div>
        )}

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? (modoEditar ? "Salvando..." : "Criando...") : (modoEditar ? "Salvar alterações" : "Criar agendamento")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MODAL: DETALHE ──────────────────────────────── */
function DetalheModal({ ag, equipe, user, onClose, onAlterarStatus, onEditar, criarSugestao, listarSugestoes, responderSugestao }) {
  const meta = metaEvento(ag);
  const instaladorPuro = isInstaladorPuro(user);

  /* Carregar dados completos (incluindo anexos) */
  const [detalhe, setDetalhe] = useState(null);
  useEffect(() => {
    api.get(`/agendamentos/${ag.id}`)
      .then((r) => setDetalhe(r.agendamento))
      .catch(() => {});
  }, [ag.id]);

  const anexos = detalhe?.anexos || ag.anexos || [];

  /* Sugestões */
  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSug, setLoadingSug] = useState(true);
  const [novaSug, setNovaSug] = useState({ tipo: "melhoria", descricao: "" });
  const [enviandoSug, setEnviandoSug] = useState(false);
  const [tabSug, setTabSug] = useState("listar"); // "listar" | "nova"
  const [respondendoId, setRespondendoId] = useState(null);
  const [respostaTexto, setRespostaTexto] = useState("");
  const [erroResposta, setErroResposta] = useState("");

  useEffect(() => {
    if (!listarSugestoes) return;
    listarSugestoes(ag.id)
      .then(setSugestoes)
      .catch(() => {})
      .finally(() => setLoadingSug(false));
  }, [ag.id]); // eslint-disable-line

  async function enviarSugestao() {
    if (!novaSug.descricao.trim()) return;
    setEnviandoSug(true);
    try {
      const s = await criarSugestao(ag.id, novaSug.tipo, novaSug.descricao);
      setSugestoes((p) => [s, ...p]);
      setNovaSug({ tipo: "melhoria", descricao: "" });
      setTabSug("listar");
    } catch (e) { /* ignore */ }
    finally { setEnviandoSug(false); }
  }

  async function responder(sid, status) {
    if (status === "rejeitada" && !respostaTexto.trim()) {
      setErroResposta("Informe o motivo da rejeição."); return;
    }
    setErroResposta("");
    try {
      const s = await responderSugestao(sid, status, respostaTexto);
      setSugestoes((p) => p.map((x) => x.id === sid ? s : x));
      setRespondendoId(null);
      setRespostaTexto("");
    } catch (e) { /* ignore */ }
  }

  /* Ações disponíveis por perfil */
  const STATUS_ACOES_GESTOR = {
    pre_agendado: ["agendado", "cancelado"],
    agendado:     ["andamento", "cancelado"],
    andamento:    ["concluido", "nao_concluido"],
    atrasado:     ["andamento", "cancelado"],
  };
  const STATUS_ACOES_INSTALADOR = {
    agendado:   ["andamento"],
    andamento:  ["concluido", "nao_concluido"],
    atrasado:   ["andamento"],
  };
  const STATUS_ACOES_COMERCIAL = {
    pre_agendado: ["agendado", "cancelado"],
    agendado:     ["andamento", "cancelado"],
    andamento:    ["concluido", "nao_concluido"],
    atrasado:     ["andamento", "cancelado"],
  };

  let acoesBase;
  if (instaladorPuro) {
    const estaNaEquipe = ag.equipe?.includes(user?.id);
    acoesBase = estaNaEquipe ? (STATUS_ACOES_INSTALADOR[ag.status] || []) : [];
  } else if (isComercialPuro(user)) {
    /* Comercial só pode cancelar agendamento que ele criou */
    const acoesBruto = STATUS_ACOES_COMERCIAL[ag.status] || [];
    acoesBase = acoesBruto.filter((s) =>
      s !== "cancelado" || ag.criado_por === user?.id
    );
  } else {
    acoesBase = STATUS_ACOES_GESTOR[ag.status] || [];
  }
  const acoes = acoesBase;

  const ACAO_META = {
    andamento:     { label: "Iniciar agendamento",     icon: "▶", bg: "#6366f1" },
    agendado:      { label: "Confirmar agendamento",   icon: "✓", bg: "#3b82f6" },
    concluido:     { label: "Marcar como concluído",   icon: "✓", bg: "#22c55e" },
    cancelado:     { label: "Cancelar agendamento",    icon: "■", bg: "#ef4444" },
    nao_concluido: { label: "Não concluído",           icon: "✗", bg: "#f97316" },
  };

  const TIPO_ANEXO_LABEL = { foto_antes: "Antes", foto_depois: "Depois", video: "Vídeo", documento: "Documento" };

  function tipoArquivo(a) {
    const url  = a.url || "";
    const ext  = url.split("?")[0].split(".").pop().toLowerCase();
    const mime = a.mime || "";
    if (a.tipo === "video" || /^(mp4|webm|mov|avi|mkv|m4v|3gp|ogg)$/.test(ext) || url.includes("/video/upload/")) return "video";
    if (a.tipo === "foto_antes" || a.tipo === "foto_depois" || /^(jpg|jpeg|png|gif|webp|avif|svg)$/.test(ext)) return "imagem";
    return "documento";
  }
  const SUG_TIPO_LABEL = { melhoria: "Melhoria", problema: "Problema", material: "Material", outro: "Outro" };
  const SUG_STATUS_COR = { pendente: "#f59e0b", aprovada: "#22c55e", rejeitada: "#ef4444" };

  const isConcluido = ag.status === "concluido" || ag.status === "nao_concluido";

  /* ── VIEW SIMPLIFICADA (concluído / não concluído) ── */
  if (isConcluido) {
    return (
      <div className="modal-overlay">
        <div
          className="modal-box modal-lg"
          style={{ maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 4, height: 36, borderRadius: 2, background: meta.cor, flexShrink: 0 }} />
              <div>
                <h2>{ag.titulo}</h2>
                <p>{ag.cliente} · {ag.tipo}</p>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Info resumida */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-border)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              {[
                ["Status",  <span key="s" className={`ag-badge ${meta.classe}`}>{meta.label}</span>],
                ["Horário", faixaHora(ag.hora, ag.duracao_minutos) || "—"],
                ["Data",    ag.data ? isoParaDate(ag.data).toLocaleDateString("pt-BR") : "—"],
                ["Tipo",    ag.tipo],
                ...(ag.pedido_numero ? [["Pedido", ag.pedido_numero]] : []),
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ background: "var(--color-surface-soft)", padding: "12px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 4 }}>{lbl}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Responsáveis */}
            {detalhe && (detalhe.iniciado_por_nome || detalhe.concluido_por_nome) && (
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                background: "var(--color-surface-soft)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
              }}>
                {detalhe.iniciado_por_nome && (
                  <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="ag-team-avatar" style={{ flexShrink: 0 }}>
                      {detalhe.iniciado_por_foto
                        ? <img src={detalhe.iniciado_por_foto} alt={detalhe.iniciado_por_nome} />
                        : iniciais(detalhe.iniciado_por_nome)}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#6366f1" }}>Iniciou</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{detalhe.iniciado_por_nome}</div>
                    </div>
                  </div>
                )}
                {detalhe.concluido_por_nome && (
                  <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="ag-team-avatar" style={{ flexShrink: 0 }}>
                      {detalhe.concluido_por_foto
                        ? <img src={detalhe.concluido_por_foto} alt={detalhe.concluido_por_nome} />
                        : iniciais(detalhe.concluido_por_nome)}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: ag.status === "nao_concluido" ? "#f97316" : "#22c55e" }}>
                        {ag.status === "nao_concluido" ? "Não concluiu" : "Finalizou"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{detalhe.concluido_por_nome}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Motivo não concluído */}
            {ag.status === "nao_concluido" && (detalhe?.observacoes_status || ag.observacoes_status) && (
              <div className="ag-form-field">
                <label style={{ color: "#f97316" }}>⚠ Motivo da não conclusão</label>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, padding: "10px 12px", background: "rgba(249,115,22,0.08)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid #f97316" }}>
                  {detalhe?.observacoes_status || ag.observacoes_status}
                </p>
              </div>
            )}

            {/* Endereço — só exibe se preenchido (cliente com múltiplos endereços) */}
            {ag.endereco && (
              <div className="ag-form-field">
                <label>Endereço</label>
                <div
                  style={{ fontSize: 13, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(ag.endereco)}`, "_blank")}
                >
                  📍 {ag.endereco}
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>(abrir no mapa)</span>
                </div>
              </div>
            )}

            {/* Anexos — seções Antes / Depois */}
            {!detalhe ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Carregando anexos...</p>
            ) : anexos.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nenhum anexo enviado.</p>
            ) : (
              <AnexosSecoes anexos={anexos} tipoArquivo={tipoArquivo} TIPO_ANEXO_LABEL={TIPO_ANEXO_LABEL} statusAg={ag.status} />
            )}

          </div>
        </div>
      </div>
    );
  }

  /* ── VIEW COMPLETA (demais status) ── */
  return (
    <div className="modal-overlay">
      <div
        className="modal-box modal-lg"
        style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: meta.cor, flexShrink: 0 }} />
            <div>
              <h2>{ag.titulo}</h2>
              <p>{ag.cliente} · {ag.tipo}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!instaladorPuro && !["andamento", "concluido", "nao_concluido", "cancelado"].includes(ag.status) && podeEditarAgendamento(user, ag) && (
              <button
                className="ek-btn ek-btn-secondary"
                style={{ fontSize: 12, padding: "5px 14px", display: "flex", alignItems: "center", gap: 5 }}
                onClick={onEditar}
              >
                ✏ Editar
              </button>
            )}
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-border)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {[
              ["Status",  <span key="s" className={`ag-badge ${meta.classe}`}>{meta.label}</span>],
              ["Horário", faixaHora(ag.hora, ag.duracao_minutos) || "—"],
              ["Data",    ag.data ? isoParaDate(ag.data).toLocaleDateString("pt-BR") : "—"],
              ["Tipo",    ag.tipo],
              ...(ag.pedido_numero ? [["Pedido", ag.pedido_numero]] : []),
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: "var(--color-surface-soft)", padding: "12px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 4 }}>{lbl}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Motivo (não concluído ou retorno) */}
          {["nao_concluido","retorno"].includes(ag.status) && (detalhe?.observacoes_status || ag.observacoes_status) && (
            <div className="ag-form-field">
              <label style={{ color: ag.status === "retorno" ? "#a855f7" : "#f97316" }}>
                {ag.status === "retorno" ? "↩ Motivo do retorno" : "⚠ Motivo da não conclusão"}
              </label>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, padding: "10px 12px",
                background: ag.status === "retorno" ? "rgba(168,85,247,0.08)" : "rgba(249,115,22,0.08)",
                borderRadius: "var(--radius-sm)",
                borderLeft: `3px solid ${ag.status === "retorno" ? "#a855f7" : "#f97316"}` }}>
                {detalhe?.observacoes_status || ag.observacoes_status}
              </p>
            </div>
          )}

          {/* Endereço */}
          {ag.endereco && (
            <div className="ag-form-field">
              <label>Endereço</label>
              <div
                style={{ fontSize: 13, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(ag.endereco)}`, "_blank")}
              >
                📍 {ag.endereco}
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>(abrir no mapa)</span>
              </div>
            </div>
          )}

          {/* Descrição / Observação */}
          {(ag.descricao || ag.observacoes) && (
            <div className="ag-form-field">
              <label>Descrição / Observação</label>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>
                {[ag.descricao, ag.observacoes].filter(Boolean).join("\n\n")}
              </p>
            </div>
          )}

          {/* Itens */}
          {ag.itens?.length > 0 && (
            <div className="ag-form-field">
              <label>Itens para levar</label>
              <div className="ag-itens-list">
                {ag.itens.map((it, i) => (
                  <div key={i} className="ag-item-tag" style={{ cursor: "default" }}>📦 {it}</div>
                ))}
              </div>
            </div>
          )}

          {/* Equipe */}
          {ag.equipe?.length > 0 && (
            <div className="ag-form-field">
              <label>Equipe</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ag.equipe.map((id) => {
                  const m = equipe.find((e) => e.id === id);
                  return m ? (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="ag-team-avatar">{avatarContent(m)}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{m.nome}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{m.setor || ""}</div>
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}


          {/* ── ANEXOS ── */}
          <div className="ag-form-field">
            <label>Anexos {detalhe ? `(${anexos.length})` : "..."}</label>
            {anexos.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>Nenhum anexo enviado.</p>
            ) : (
              <div className="ag-anexos-grid">
                {anexos.map((a) => {
                  const tipo = tipoArquivo(a);
                  return (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="ag-anexo-item" title={a.nome}>
                      {tipo === "imagem" ? (
                        <img src={a.url} alt={a.nome} className="ag-anexo-thumb" />
                      ) : tipo === "video" ? (
                        <div className="ag-anexo-video-wrap">
                          <video
                            src={a.url}
                            className="ag-anexo-thumb"
                            muted
                            preload="metadata"
                            playsInline
                            onClick={(e) => e.preventDefault()}
                          />
                          <div className="ag-anexo-play">▶</div>
                        </div>
                      ) : (
                        <div className="ag-anexo-icon">📄</div>
                      )}
                      <div className="ag-anexo-meta">
                        <span className="ag-anexo-tipo">{TIPO_ANEXO_LABEL[a.tipo] || a.tipo}</span>
                        <span className="ag-anexo-nome">{a.nome}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── SUGESTÕES ── */}
          {listarSugestoes && (
            <div className="ag-form-field">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ margin: 0 }}>Sugestões {!loadingSug ? `(${sugestoes.length})` : ""}</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className={`ag-sug-tab${tabSug === "listar" ? " active" : ""}`}
                    onClick={() => setTabSug("listar")}
                  >Ver</button>
                  <button
                    className={`ag-sug-tab${tabSug === "nova" ? " active" : ""}`}
                    onClick={() => setTabSug("nova")}
                  >+ Nova</button>
                </div>
              </div>

              {tabSug === "nova" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: "var(--color-surface-soft)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                  <select
                    value={novaSug.tipo}
                    onChange={(e) => setNovaSug((p) => ({ ...p, tipo: e.target.value }))}
                    style={{ padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
                  >
                    {Object.entries(SUG_TIPO_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Descreva sua sugestão..."
                    value={novaSug.descricao}
                    onChange={(e) => setNovaSug((p) => ({ ...p, descricao: e.target.value }))}
                    style={{ minHeight: 72, padding: "8px 10px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setTabSug("listar")}>Cancelar</button>
                    <button className="ek-btn ek-btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={enviarSugestao} disabled={enviandoSug}>
                      {enviandoSug ? "Enviando..." : "Enviar sugestão"}
                    </button>
                  </div>
                </div>
              )}

              {tabSug === "listar" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {loadingSug && <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>Carregando...</p>}
                  {!loadingSug && sugestoes.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>Nenhuma sugestão ainda.</p>
                  )}
                  {sugestoes.map((s) => (
                    <div key={s.id} className="ag-sugestao-card">
                      <div className="ag-sugestao-header">
                        <span className="ag-sug-tipo-badge">{SUG_TIPO_LABEL[s.tipo] || s.tipo}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: SUG_STATUS_COR[s.status] || "#888" }}>
                          {s.status === "pendente" ? "Pendente" : s.status === "aprovada" ? "Aprovada" : "Rejeitada"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>{s.usuario_nome}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>{s.descricao}</p>
                      {s.resposta && (
                        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0", borderLeft: "2px solid var(--color-border)", paddingLeft: 8 }}>
                          Resposta: {s.resposta}
                        </p>
                      )}
                      {s.status === "pendente" && responderSugestao && (
                        <div style={{ marginTop: 8 }}>
                          {respondendoId === s.id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input
                                placeholder="Resposta (obrigatória para rejeitar)..."
                                value={respostaTexto}
                                onChange={(e) => { setRespostaTexto(e.target.value); if (erroResposta) setErroResposta(""); }}
                                style={{ padding: "6px 10px", fontSize: 12, borderRadius: "var(--radius-sm)", border: `1px solid ${erroResposta ? "#ef4444" : "var(--color-border)"}`, background: "var(--color-surface)", color: "var(--color-text)" }}
                              />
                              {erroResposta && (
                                <span style={{ fontSize: 11, color: "#ef4444" }}>{erroResposta}</span>
                              )}
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="ek-btn" style={{ flex: 1, fontSize: 11, padding: "4px 8px", background: "#22c55e", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }} onClick={() => responder(s.id, "aprovada")}>✓ Aprovar</button>
                                <button className="ek-btn" style={{ flex: 1, fontSize: 11, padding: "4px 8px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }} onClick={() => responder(s.id, "rejeitada")}>✗ Rejeitar</button>
                                <button className="ek-btn ek-btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => { setRespondendoId(null); setRespostaTexto(""); }}>Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button className="ag-sug-responder-btn" onClick={() => setRespondendoId(s.id)}>Responder</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ações de status */}
          {acoes.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
              {acoes.map((s) => {
                const am = ACAO_META[s];
                return am ? (
                  <button
                    key={s}
                    style={{
                      flex: 1, minWidth: 140, padding: "11px 16px",
                      background: am.bg, color: "#fff", border: "none",
                      borderRadius: "var(--radius-md)", cursor: "pointer",
                      fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 7, justifyContent: "center",
                    }}
                    onClick={() => onAlterarStatus(s)}
                  >
                    <span style={{ fontSize: 14 }}>{am.icon}</span> {am.label}
                  </button>
                ) : null;
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── GRADE DE ANEXOS POR SEÇÃO (Antes / Depois) ──── */
function AnexosSecoes({ anexos, tipoArquivo, TIPO_ANEXO_LABEL, statusAg }) {
  const antes  = anexos.filter((a) => a.tipo === "foto_antes"  || a.tipo === "video_antes");
  const depois = anexos.filter((a) => a.tipo === "foto_depois" || a.tipo === "video_depois");
  const outros = anexos.filter((a) => !["foto_antes","video_antes","foto_depois","video_depois"].includes(a.tipo));
  const isNaoConcluido = statusAg === "nao_concluido";
  const depoisLabel = isNaoConcluido ? "Situação encontrada" : "Depois";
  const depoisCor   = isNaoConcluido ? "#f97316" : "#22c55e";
  const depoisIcon  = isNaoConcluido ? "⚠" : "✓";

  function GradeAnexos({ items, cor }) {
    if (items.length === 0) return (
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>Nenhum arquivo nesta etapa.</p>
    );
    return (
      <div className="ag-anexos-grid" style={{ marginTop: 8 }}>
        {items.map((a) => {
          const tipo = tipoArquivo(a);
          return (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="ag-anexo-item" title={a.nome}>
              {tipo === "imagem" ? (
                <img src={a.url} alt={a.nome} className="ag-anexo-thumb" />
              ) : tipo === "video" ? (
                <div className="ag-anexo-video-wrap">
                  <video src={a.url} className="ag-anexo-thumb" muted preload="metadata" playsInline onClick={(e) => e.preventDefault()} />
                  <div className="ag-anexo-play">▶</div>
                </div>
              ) : (
                <div className="ag-anexo-icon">📄</div>
              )}
              <div className="ag-anexo-meta">
                <span className="ag-anexo-nome" style={{ color: "var(--color-text)", fontWeight: 600 }}>{a.nome}</span>
                {a.enviado_por_nome && (
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{a.enviado_por_nome}</span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ANTES */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
          color: "#6366f1", marginBottom: 2,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: "50%",
            background: "color-mix(in srgb, #6366f1 15%, var(--color-surface))",
            border: "1.5px solid #6366f1",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 10,
          }}>▶</span>
          Antes ({antes.length})
        </div>
        <GradeAnexos items={antes} cor="#6366f1" />
      </div>

      {/* DEPOIS / SITUAÇÃO ENCONTRADA */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
          color: depoisCor, marginBottom: 2,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: "50%",
            background: `color-mix(in srgb, ${depoisCor} 15%, var(--color-surface))`,
            border: `1.5px solid ${depoisCor}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 10,
          }}>{depoisIcon}</span>
          {depoisLabel} ({depois.length})
        </div>
        <GradeAnexos items={depois} cor={depoisCor} />
      </div>

      {/* Outros (documentos, video legado sem tipo direcional) */}
      {outros.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 2 }}>
            Outros ({outros.length})
          </div>
          <GradeAnexos items={outros} cor="var(--color-text-muted)" />
        </div>
      )}
    </div>
  );
}

/* ── MODAL: STATUS COM FOTO OBRIGATÓRIA ──────────── */
function StatusModal({ ag, novoStatus, onClose, onConfirmar, salvando }) {
  const meta = STATUS_META[novoStatus] || {};
  const [anexos,       setAnexos]       = useState([]);
  const [motivo,       setMotivo]       = useState("");
  const [dragOver,     setDragOver]     = useState(false);
  const [erroModal,    setErroModal]    = useState("");
  const [inputKeyCam,  setInputKeyCam]  = useState(0);
  const [inputKeyFile, setInputKeyFile] = useState(0);

  const mensagens = {
    andamento:     { titulo: "Iniciar atendimento", req: "Anexe pelo menos uma foto ou vídeo do ambiente ANTES da instalação.", obrigatorio: true, pedirMotivo: false },
    concluido:     { titulo: "Marcar como concluído", req: "Anexe fotos ou vídeo do resultado final.", obrigatorio: true, pedirMotivo: false },
    nao_concluido: { titulo: "Marcar como não concluído", req: "Informe o motivo e anexe uma foto ou vídeo da situação atual. Um aviso de reagendamento será enviado.", obrigatorio: true, pedirMotivo: true },
  };
  const info = mensagens[novoStatus] || { titulo: "Alterar status", req: "", obrigatorio: false, pedirMotivo: false };

  async function handleFiles(files) {
    const validos = [];
    const rejeitados = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("video/")) {
        const dur = await getVideoDuration(f);
        if (dur > 60) { rejeitados.push(f.name); continue; }
      }
      validos.push(f);
    }
    if (rejeitados.length > 0) {
      setErroModal(`Vídeo(s) rejeitado(s) — limite de 60 segundos: ${rejeitados.join(", ")}`);
    }
    if (validos.length > 0) {
      setAnexos((p) => [...p, ...validos.map((f) => ({ name: f.name, type: f.type, file: f, label: "" }))]);
    }
  }

  function setLabel(i, valor) {
    setAnexos((p) => p.map((a, j) => j === i ? { ...a, label: valor } : a));
  }

  function confirmar() {
    if (info.obrigatorio && anexos.length === 0) {
      setErroModal("É obrigatório anexar pelo menos um arquivo antes de continuar.");
      return;
    }
    if (info.pedirMotivo && !motivo.trim()) {
      setErroModal("Informe o motivo antes de continuar.");
      return;
    }
    setErroModal("");
    onConfirmar(anexos, motivo);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{info.titulo}</h2>
            <p>{ag.titulo}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div className="ag-status-modal-info">
            <strong style={{ color: meta.cor }}>{meta.label}</strong>
            {info.req}
          </div>

          {info.obrigatorio && (
            <p className="ag-status-required">⚠ Obrigatório: você deve anexar um arquivo para continuar.</p>
          )}

          {/* Botões de origem */}
          <div style={{ display: "flex", gap: 8 }}>
            <label
              className="ek-btn ek-btn-secondary"
              style={{ flex: 1, padding: "12px 8px", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRadius: "var(--radius-md)", cursor: "pointer" }}
            >
              <span style={{ fontSize: 22 }}>📷</span>
              Abrir câmera
              <input
                key={inputKeyCam}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => { handleFiles(e.target.files); setInputKeyCam((k) => k + 1); }}
              />
            </label>
            <label
              className="ek-btn ek-btn-secondary"
              style={{ flex: 1, padding: "12px 8px", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRadius: "var(--radius-md)", cursor: "pointer" }}
            >
              <span style={{ fontSize: 22 }}>🗂</span>
              Escolher da galeria
              <input
                key={inputKeyFile}
                type="file"
                multiple
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={(e) => { handleFiles(e.target.files); setInputKeyFile((k) => k + 1); }}
              />
            </label>
            <div
              className={`ek-btn ek-btn-secondary${dragOver ? " drag-over" : ""}`}
              style={{ flex: 1, padding: "12px 8px", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRadius: "var(--radius-md)", cursor: "default", userSelect: "none", borderStyle: "dashed" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              <span style={{ fontSize: 22 }}>{dragOver ? "⬇" : "📂"}</span>
              {dragOver ? "Soltar aqui" : "Arrastar arquivo"}
            </div>
          </div>

          {anexos.length > 0 && (
            <div className="ag-upload-list">
              {anexos.map((a, i) => (
                <div key={i} className="ag-upload-item" style={{ alignItems: "flex-start", gap: 8 }}>
                  <span style={{ paddingTop: 8 }}>{iconeArquivo(a.file || a)}</span>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <input
                      type="text"
                      value={a.label}
                      onChange={(e) => setLabel(i, e.target.value)}
                      placeholder="Nome / identificação do arquivo..."
                      style={{
                        width: "100%", padding: "5px 10px", fontSize: 13,
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        color: "var(--color-text)",
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{a.name}</span>
                  </div>
                  <button className="ag-upload-remove" style={{ marginTop: 6 }} onClick={() => setAnexos((p) => p.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}

          {info.pedirMotivo && (
            <div className="ag-form-field">
              <label>
                {novoStatus === "nao_concluido"
                  ? "Motivo da não conclusão *"
                  : "Motivo do retorno *"}
              </label>
              <textarea
                placeholder={
                  novoStatus === "nao_concluido"
                    ? "Ex: Cliente ausente, Problema técnico, Material faltando..."
                    : "Ex: Material insuficiente, cliente solicitou segunda visita..."
                }
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                style={{ minHeight: 80 }}
              />
            </div>
          )}

        </div>

        {erroModal && (
          <div style={{
            margin: "0 24px 0", padding: "10px 14px",
            background: "color-mix(in srgb, #ef4444 10%, var(--color-surface-soft))",
            border: "1px solid color-mix(in srgb, #ef4444 35%, var(--color-border))",
            borderRadius: "var(--radius-sm)", fontSize: 13, color: "#ef4444", fontWeight: 500,
          }}>
            ⚠ {erroModal}
          </div>
        )}

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
