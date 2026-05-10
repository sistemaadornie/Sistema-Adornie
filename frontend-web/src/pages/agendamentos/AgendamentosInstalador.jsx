/**
 * AgendamentosInstalador.jsx
 * Tela para pessoas em campo.
 * Mini calendário + todos os agendamentos do dia.
 * Cards do próprio usuário têm ações de status; os demais são somente leitura.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useAgendamentos from "./hooks/useAgendamentos";
import useAuth from "../../hooks/useAuth";
import { MiniCalendario } from "./MapaAgendamentos";
import { api } from "../../services/api";
import { faixaHora } from "../../utils/horario";
import "./Agendamentos.css";

/* ── helpers ── */
function diaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function detectarAtrasado(ag) {
  if (ag.status !== "agendado") return ag;
  const [y, m, d] = ag.data.split("-").map(Number);
  const [h, min]  = ag.hora.split(":").map(Number);
  if (new Date(y, m - 1, d, h, min) < new Date()) return { ...ag, status: "atrasado" };
  return ag;
}

const STATUS_META = {
  agendado:      { label: "Agendado",      cor: "#3b82f6" },
  andamento:     { label: "Em andamento",  cor: "#eab308" },
  concluido:     { label: "Concluído",     cor: "#22c55e" },
  nao_concluido: { label: "Não concluído", cor: "#f97316" },
  cancelado:     { label: "Cancelado",     cor: "#ef4444" },
  atrasado:      { label: "Atrasado",      cor: "#ef4444" },
};

const STATUS_ACOES = {
  agendado:      ["andamento"],
  atrasado:      ["andamento"],
  andamento:     ["concluido", "nao_concluido"],
  concluido:     [],
  nao_concluido: [],
  cancelado:     [],
};

const LABEL_ACAO = {
  andamento:     "▶ Iniciar",
  concluido:     "✓ Concluir",
  nao_concluido: "✗ Não concluído",
};

/* ══════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════ */
export default function AgendamentosInstalador() {
  const { user } = useAuth();
  const { agendamentos: agsDoBanco, carregar, alterarStatus: alterarStatusAPI, criarSugestao } = useAgendamentos();

  const hoje = new Date();
  const [curDia, setCurDia] = useState(hoje);
  const isoSel = useMemo(() => diaISO(curDia), [curDia]);

  /* Polling 30s — pausa quando a aba está em background */
  useEffect(() => {
    let t = setInterval(carregar, 30_000);
    function onVisibility() {
      if (document.hidden) {
        clearInterval(t);
      } else {
        carregar();
        t = setInterval(carregar, 30_000);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [carregar]);

  const ags = useMemo(() => agsDoBanco.map(detectarAtrasado), [agsDoBanco]);

  /* Todos os agendamentos do dia selecionado */
  const agsDoDia = useMemo(
    () => [...ags.filter((a) => a.data === isoSel)].sort((a, b) => a.hora.localeCompare(b.hora)),
    [ags, isoSel]
  );

  const [modalFoto,     setModalFoto]     = useState(null);
  const [modalSugestao, setModalSugestao] = useState(null);
  const [modalDetalhe,  setModalDetalhe]  = useState(null);
  const [modalAcao,     setModalAcao]     = useState(null);

  async function handleStatus(ag, novoStatus) {
    const requerFoto = ["andamento", "concluido", "nao_concluido"].includes(novoStatus);
    if (requerFoto) {
      setModalFoto({ ag, novoStatus });
    } else {
      await alterarStatusAPI(ag.id, novoStatus);
    }
  }

  const labelDia = curDia.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const ehHoje   = isoSel === diaISO(hoje);

  return (
    <div className="ek-page">
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Agenda</h1>
          <p>Visualize os agendamentos e atualize o status dos seus</p>
        </div>
      </div>

      {/* LAYOUT: calendário à esquerda, lista à direita */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>

        {/* ── COLUNA ESQUERDA: mini calendário ── */}
        <div style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          position: "sticky",
          top: 16,
        }}>
          <MiniCalendario
            dataSelecionada={curDia}
            todosAgendamentos={ags}
            onChange={setCurDia}
          />

          {/* Legenda */}
          <div style={{ marginTop: 12, borderTop: "1px solid var(--color-border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)", marginBottom: 4 }}>
              Legenda
            </div>
            {[
              ["agendado",      "Agendado"],
              ["andamento",     "Em andamento"],
              ["concluido",     "Concluído"],
              ["nao_concluido", "Não concluído"],
              ["atrasado",      "Atrasado"],
              ["cancelado",     "Cancelado"],
            ].map(([k, l]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: STATUS_META[k].cor, flexShrink: 0 }} />
                <span style={{ color: "var(--color-text-secondary)" }}>{l}</span>
              </div>
            ))}
            <div style={{ marginTop: 5, fontSize: 11, color: "var(--color-text-muted)" }}>
              Borda colorida = seus agendamentos
            </div>
          </div>
        </div>

        {/* ── COLUNA DIREITA: lista de agendamentos ── */}
        <div>
          {/* Título do dia + botão Hoje */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)", flex: 1 }}>
              {labelDia.charAt(0).toUpperCase() + labelDia.slice(1)}
            </span>
            {!ehHoje && (
              <button
                className="ek-btn ek-btn-secondary"
                style={{ fontSize: 12, padding: "5px 12px" }}
                onClick={() => setCurDia(hoje)}
              >
                Hoje
              </button>
            )}
          </div>

          {agsDoDia.length === 0 ? (
            <div className="ek-empty" style={{ padding: 60 }}>
              <p style={{ color: "var(--color-text-muted)" }}>
                Nenhum agendamento para {ehHoje ? "hoje" : "este dia"}.
              </p>
            </div>
          ) : (
            <GradeHoraria
              agsDoDia={agsDoDia}
              user={user}
              onSelect={(ag) => setModalAcao(ag)}
            />
          )}
        </div>
      </div>

      {/* MODAIS */}
      {modalFoto && createPortal(
        <ModalStatusFoto
          ag={modalFoto.ag}
          novoStatus={modalFoto.novoStatus}
          onClose={() => setModalFoto(null)}
          onConfirmar={async (arquivos, motivo) => {
            await alterarStatusAPI(modalFoto.ag.id, modalFoto.novoStatus, arquivos, motivo);
            setModalFoto(null);
          }}
        />,
        document.body
      )}

      {modalSugestao && createPortal(
        <ModalSugestao
          ag={modalSugestao}
          onClose={() => setModalSugestao(null)}
          onEnviar={async (tipo, descricao) => {
            await criarSugestao(modalSugestao.id, tipo, descricao);
            setModalSugestao(null);
          }}
        />,
        document.body
      )}

      {modalDetalhe && createPortal(
        <ModalDetalheInstalador
          ag={modalDetalhe}
          onClose={() => setModalDetalhe(null)}
        />,
        document.body
      )}

      {modalAcao && createPortal(
        <ModalAcaoInstalador
          ag={modalAcao}
          user={user}
          onClose={() => setModalAcao(null)}
          onStatus={(novoStatus) => { setModalAcao(null); handleStatus(modalAcao, novoStatus); }}
          onDetalhe={() => { setModalAcao(null); setModalDetalhe(modalAcao); }}
          onSugestao={() => { setModalAcao(null); setModalSugestao(modalAcao); }}
        />,
        document.body
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GRADE DE HORÁRIOS
══════════════════════════════════════════════════════ */
const HORA_INICIO = 6;
const HORA_FIM    = 22;
const SLOT_H      = 64; // px por hora

function GradeHoraria({ agsDoDia, user, onSelect }) {
  const containerRef = useRef(null);
  const agora = new Date();
  const horaAtualFrac = agora.getHours() + agora.getMinutes() / 60;

  useEffect(() => {
    if (!containerRef.current) return;
    const alvo = Math.max(HORA_INICIO, Math.min(horaAtualFrac - 1.5, HORA_FIM));
    containerRef.current.scrollTop = (alvo - HORA_INICIO) * SLOT_H;
  }, []); // eslint-disable-line

  const horas = Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);
  const alturaTotal = horas.length * SLOT_H;

  return (
    <div
      ref={containerRef}
      style={{
        overflowY: "auto",
        maxHeight: "calc(100vh - 200px)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ position: "relative", height: alturaTotal }}>

        {/* Linhas de hora */}
        {horas.map((h, i) => (
          <div
            key={h}
            style={{
              position: "absolute", top: i * SLOT_H, left: 0, right: 0,
              display: "flex", alignItems: "flex-start", pointerEvents: "none",
            }}
          >
            <div style={{
              width: 48, flexShrink: 0, textAlign: "right", paddingRight: 10,
              fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)",
              lineHeight: 1, marginTop: -7, userSelect: "none",
            }}>
              {String(h).padStart(2, "0")}h
            </div>
            <div style={{ flex: 1, borderTop: "1px solid var(--color-border)" }} />
          </div>
        ))}

        {/* Linhas de meia hora (tracejadas) */}
        {horas.map((h, i) => (
          <div key={`${h}-half`} style={{
            position: "absolute",
            top: i * SLOT_H + SLOT_H / 2,
            left: 52, right: 0,
            borderTop: "1px dashed color-mix(in srgb, var(--color-border) 45%, transparent)",
            pointerEvents: "none",
          }} />
        ))}

        {/* Linha da hora atual */}
        {horaAtualFrac >= HORA_INICIO && horaAtualFrac <= HORA_FIM + 1 && (
          <div style={{
            position: "absolute",
            top: (horaAtualFrac - HORA_INICIO) * SLOT_H,
            left: 42, right: 4,
            zIndex: 10, pointerEvents: "none",
            display: "flex", alignItems: "center",
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", flexShrink: 0, marginLeft: -5 }} />
            <div style={{ flex: 1, borderTop: "2px solid #ef4444" }} />
          </div>
        )}

        {/* Blocos de agendamento */}
        {agsDoDia.map((ag) => {
          const [h, m] = ag.hora.split(":").map(Number);
          const topFrac = h + m / 60;
          const top = Math.max(0, (topFrac - HORA_INICIO) * SLOT_H);
          const durMin = ag.duracao_minutos || 60;
          const altura = Math.max((durMin / 60) * SLOT_H, 36);
          const meuAg  = ag.equipe?.includes(user?.id);
          const meta   = STATUS_META[ag.status] || STATUS_META.agendado;

          return (
            <div
              key={ag.id}
              onClick={() => onSelect(ag)}
              style={{
                position: "absolute",
                top,
                left: 52,
                right: 8,
                height: altura,
                background: `color-mix(in srgb, ${meta.cor} 13%, var(--color-surface))`,
                border: `1px solid ${meta.cor}55`,
                borderLeft: `4px solid ${meta.cor}`,
                outline: meuAg ? `2px solid ${meta.cor}66` : "none",
                outlineOffset: 1,
                borderRadius: "var(--radius-sm)",
                padding: "4px 8px",
                overflow: "hidden",
                cursor: "pointer",
                zIndex: 2,
                boxShadow: "var(--shadow-sm)",
                transition: "filter .12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ""; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: meta.cor, lineHeight: 1.3 }}>
                  {ag.hora}
                </span>
                {meuAg && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, whiteSpace: "nowrap",
                    color: "var(--color-primary)",
                    background: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                    padding: "1px 5px", borderRadius: 3,
                  }}>
                    Meu
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: "var(--color-text)",
                lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {ag.titulo}
              </div>
              {altura > 50 && (
                <div style={{
                  fontSize: 11, color: "var(--color-text-secondary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {ag.cliente}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MODAL DE AÇÃO: abre ao clicar num bloco da grade
══════════════════════════════════════════════════════ */
function ModalAcaoInstalador({ ag, user, onClose, onStatus, onDetalhe, onSugestao }) {
  const meta  = STATUS_META[ag.status] || STATUS_META.agendado;
  const meuAg = ag.equipe?.includes(user?.id);
  const acoes = STATUS_ACOES[ag.status] || [];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: `3px solid ${meta.cor}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
              <h2 style={{ margin: 0 }}>{ag.titulo}</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px",
                borderRadius: "var(--radius-xs)",
                background: meta.cor + "22", color: meta.cor,
                border: `1px solid ${meta.cor}44`, whiteSpace: "nowrap",
              }}>
                {meta.label}
              </span>
              {meuAg && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: "var(--color-primary)",
                  background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                  padding: "2px 7px", borderRadius: 4,
                }}>
                  Meu
                </span>
              )}
            </div>
            <p style={{ margin: 0 }}>{ag.cliente}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)" }}>
            🕐 {faixaHora(ag.hora, ag.duracao_minutos)}
          </div>
          {ag.endereco && (
            <div
              style={{ fontSize: 13, color: "var(--color-primary)", cursor: "pointer" }}
              onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(ag.endereco)}`, "_blank")}
            >
              📍 {ag.endereco} ↗
            </div>
          )}
          {ag.equipe_info?.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              👥 {ag.equipe_info.map((e) => e.nome).join(", ")}
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ flexWrap: "wrap", gap: 8 }}>
          {acoes.map((acao) => (
            <button
              key={acao}
              className="ek-btn ek-btn-primary"
              style={{
                fontSize: 12, padding: "6px 14px",
                background: acao === "nao_concluido" ? "#ef4444" : undefined,
                borderColor: acao === "nao_concluido" ? "#ef4444" : undefined,
              }}
              onClick={() => onStatus(acao)}
            >
              {LABEL_ACAO[acao]}
            </button>
          ))}
          <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12 }} onClick={onDetalhe}>
            Ver detalhes
          </button>
          {meuAg && (
            <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12 }} onClick={onSugestao}>
              💡 Sugestão
            </button>
          )}
          <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, marginLeft: "auto" }} onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CARD DO AGENDAMENTO
   meuAg=true  → mostra ações de status e botão sugestão
   meuAg=false → somente leitura (detalhes)
══════════════════════════════════════════════════════ */
function CardInstalador({ ag, meuAg, onStatus, onDetalhe, onSugestao }) {
  const meta    = STATUS_META[ag.status] || STATUS_META.agendado;
  const acoes   = STATUS_ACOES[ag.status] || [];
  return (
    <div style={{
      background: "var(--color-surface)",
      border: `1px solid ${meuAg ? "var(--color-primary)" : "var(--color-border)"}`,
      borderLeft: `5px solid ${meta.cor}`,
      borderRadius: "var(--radius-md)",
      padding: "12px 16px",
      boxShadow: meuAg ? "0 0 0 1px var(--color-primary)22" : "var(--shadow-sm)",
    }}>
      {/* Linha superior */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--color-text)" }}>{faixaHora(ag.hora, ag.duracao_minutos)}</span>
          {meuAg && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 12%, transparent)", padding: "1px 6px", borderRadius: 4 }}>
              Meu
            </span>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px",
          borderRadius: "var(--radius-xs)",
          background: meta.cor + "22", color: meta.cor,
          border: `1px solid ${meta.cor}44`,
          whiteSpace: "nowrap",
        }}>
          {meta.label}
        </span>
      </div>

      {/* Título e cliente */}
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", marginBottom: 1 }}>{ag.titulo}</div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>{ag.cliente}</div>

      {/* Endereço */}
      {ag.endereco && (
        <div
          style={{ fontSize: 12, color: "var(--color-primary)", cursor: "pointer", marginBottom: 6 }}
          onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(ag.endereco)}`, "_blank")}
        >
          📍 {ag.endereco}
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 4 }}>(ver no mapa)</span>
        </div>
      )}

      {/* Equipe */}
      {ag.equipe_info?.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
          👥 {ag.equipe_info.map((e) => e.nome).join(", ")}
        </div>
      )}

      {/* Ações */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {acoes.map((acao) => (
          <button
            key={acao}
            className="ek-btn ek-btn-primary"
            style={{
              fontSize: 12, padding: "5px 12px",
              background: acao === "nao_concluido" ? "#ef4444" : undefined,
              borderColor: acao === "nao_concluido" ? "#ef4444" : undefined,
            }}
            onClick={() => onStatus?.(acao)}
          >
            {LABEL_ACAO[acao]}
          </button>
        ))}
        <button
          className="ek-btn ek-btn-secondary"
          style={{ fontSize: 12, padding: "5px 12px" }}
          onClick={onDetalhe}
        >
          Detalhes
        </button>
        {onSugestao && (
          <button
            className="ek-btn ek-btn-secondary"
            style={{ fontSize: 12, padding: "5px 12px" }}
            onClick={onSugestao}
            title="Enviar sugestão de melhoria"
          >
            💡 Sugestão
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MODAL: ALTERAR STATUS COM FOTO / VÍDEO
══════════════════════════════════════════════════════ */
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

function ModalStatusFoto({ ag, novoStatus, onClose, onConfirmar }) {
  const [arquivos,  setArquivos]  = useState([]);
  const [previews,  setPreviews]  = useState([]); // { url, tipo: "image"|"video" }
  const [motivo,    setMotivo]    = useState("");
  const [salvando,  setSalvando]  = useState(false);
  const [drag,      setDrag]      = useState(false);
  const [erroVideo, setErroVideo] = useState("");
  const inputRef = useRef(null);

  async function processarArquivos(files) {
    const validos = [];
    const rejeitados = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) continue;
      if (f.type.startsWith("video/")) {
        const dur = await getVideoDuration(f);
        if (dur > 60) { rejeitados.push(f.name); continue; }
      }
      validos.push(f);
    }
    if (rejeitados.length > 0) {
      setErroVideo(`Vídeo(s) rejeitado(s) — limite de 60 segundos: ${rejeitados.join(", ")}`);
    } else {
      setErroVideo("");
    }
    if (validos.length === 0) return;
    setArquivos((p) => [...p, ...validos]);
    setPreviews((p) => [
      ...p,
      ...validos.map((f) => ({
        url:  URL.createObjectURL(f),
        tipo: f.type.startsWith("video/") ? "video" : "image",
      })),
    ]);
  }

  function removerArquivo(idx) {
    setPreviews((p) => {
      URL.revokeObjectURL(p[idx].url);
      return p.filter((_, i) => i !== idx);
    });
    setArquivos((p) => p.filter((_, i) => i !== idx));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    processarArquivos(e.dataTransfer.files);
  }

  const requerMotivo = novoStatus === "nao_concluido";
  const labelStatus  = STATUS_META[novoStatus]?.label || novoStatus;
  const corStatus    = STATUS_META[novoStatus]?.cor || "var(--color-primary)";

  const AVISO_FOTO = {
    andamento: {
      icone: "📷",
      titulo: "Foto obrigatória antes de iniciar",
      texto:  "Registre o estado do local antes de tocar em qualquer coisa. Esse comprovante protege você e a empresa caso surjam questionamentos posteriores sobre danos pré-existentes — arranhões, objetos quebrados, manchas, fiações expostas e similares.",
    },
    concluido: {
      icone: "✅",
      titulo: "Foto obrigatória para concluir",
      texto:  "Registre o resultado do serviço com pelo menos uma foto. Esse comprovante documenta o trabalho entregue e serve como evidência em caso de reclamações futuras.",
    },
    nao_concluido: {
      icone: "⚠️",
      titulo: "Foto ou vídeo obrigatório ao registrar não conclusão",
      texto:  "Fotografe ou filme a situação que impediu a conclusão do serviço. Esse registro é essencial para explicar/justificar a ocorrência de não conclusão e para deixar outras equipes cientes do que deve ser feito ao retornar.",
    },
  };
  const aviso = AVISO_FOTO[novoStatus];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header" style={{ borderBottom: `3px solid ${corStatus}` }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: corStatus, flexShrink: 0 }} />
              <h2 style={{ margin: 0, color: corStatus }}>Alterar status — {labelStatus}</h2>
            </div>
            <p style={{ margin: 0 }}>{ag.titulo} — {ag.cliente}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Banner explicativo */}
          {aviso && (
            <div style={{
              background: `color-mix(in srgb, ${corStatus} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${corStatus} 35%, transparent)`,
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }}>{aviso.icone}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: corStatus, marginBottom: 3 }}>
                  {aviso.titulo}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  {aviso.texto}
                </div>
              </div>
            </div>
          )}

          {/* Zona de upload */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 8 }}>
              Fotos / Vídeos <span style={{ color: corStatus }}>*</span>
            </div>

            {/* Drop area — só aparece quando não há arquivos ou sempre */}
            {previews.length === 0 && (
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${drag ? corStatus : "var(--color-border)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: drag
                    ? `color-mix(in srgb, ${corStatus} 8%, transparent)`
                    : "transparent",
                  transition: "all 0.15s",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ fontSize: 32 }}>📎</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
                  Clique ou arraste arquivos aqui
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Fotos e vídeos · múltiplos arquivos permitidos
                </span>
              </div>
            )}

            {/* Grid de previews */}
            {previews.length > 0 && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
                gap: 8,
              }}>
                {previews.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      position: "relative", aspectRatio: "1",
                      borderRadius: "var(--radius-sm)", overflow: "hidden",
                      background: "#111",
                    }}
                  >
                    {p.tipo === "video" ? (
                      <>
                        <video src={p.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "rgba(0,0,0,.35)",
                          fontSize: 22, color: "#fff",
                        }}>▶</div>
                      </>
                    ) : (
                      <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removerArquivo(i); }}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        background: "rgba(0,0,0,.65)", border: "none", color: "#fff",
                        borderRadius: "50%", width: 20, height: 20,
                        cursor: "pointer", fontSize: 13,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >×</button>
                  </div>
                ))}

                {/* Célula "Adicionar mais" */}
                <div
                  onClick={() => inputRef.current?.click()}
                  style={{
                    aspectRatio: "1", borderRadius: "var(--radius-sm)",
                    border: "2px dashed var(--color-border)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: 3, cursor: "pointer",
                    color: "var(--color-text-muted)", fontSize: 11,
                    transition: "border-color .15s, color .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = corStatus; e.currentTarget.style.color = corStatus; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-muted)"; }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                  <span>Adicionar</span>
                </div>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => processarArquivos(e.target.files)}
              style={{ display: "none" }}
            />

            {previews.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
                {arquivos.length} arquivo{arquivos.length !== 1 ? "s" : ""} selecionado{arquivos.length !== 1 ? "s" : ""}
              </div>
            )}
            {erroVideo && (
              <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>
                ⚠ {erroVideo}
              </div>
            )}
          </div>

          {/* Motivo — só para nao_concluido */}
          {requerMotivo && (
            <div className="ag-form-field">
              <label>Motivo <span style={{ fontWeight: 400, color: "var(--color-text-muted)", textTransform: "none", fontSize: 11 }}>(opcional)</span></label>
              <textarea
                rows={3}
                placeholder="Descreva o motivo pelo qual não foi possível concluir e explique o que deve ser feito ao retornar..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </div>
          )}
        </div>

        <div style={{ padding: "0 20px" }}>
          {arquivos.length === 0 && (
            <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 10, textAlign: "center" }}>
              Adicione pelo menos uma foto ou vídeo para continuar.
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            className="ek-btn ek-btn-primary"
            onClick={async () => { setSalvando(true); await onConfirmar(arquivos, motivo); }}
            disabled={salvando || arquivos.length === 0}
            style={{ background: corStatus, borderColor: corStatus }}
          >
            {salvando ? "Salvando..." : `Confirmar — ${labelStatus}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MODAL: SUGESTÃO DE MELHORIA
══════════════════════════════════════════════════════ */
const TIPOS_SUGESTAO = [
  { value: "rota",        label: "Otimização de rota" },
  { value: "horario",     label: "Ajuste de horário" },
  { value: "material",    label: "Material/equipamento" },
  { value: "comunicacao", label: "Comunicação" },
  { value: "outro",       label: "Outro" },
];

function ModalSugestao({ ag, onClose, onEnviar }) {
  const [tipo,      setTipo]      = useState("outro");
  const [descricao, setDescricao] = useState("");
  const [enviando,  setEnviando]  = useState(false);
  const [erro,      setErro]      = useState("");

  async function enviar() {
    if (!descricao.trim()) { setErro("Descreva a sugestão."); return; }
    setEnviando(true);
    try { await onEnviar(tipo, descricao.trim()); }
    catch (e) { setErro(e.message || "Erro ao enviar."); setEnviando(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>💡 Sugestão de melhoria</h2>
            <p>{ag.titulo} — {ag.cliente}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ag-form-field">
            <label>Categoria</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_SUGESTAO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="ag-form-field">
            <label>Descrição *</label>
            <textarea
              rows={4}
              placeholder="Descreva a sugestão de melhoria..."
              value={descricao}
              onChange={(e) => { setDescricao(e.target.value); setErro(""); }}
              style={{ resize: "vertical" }}
            />
          </div>
          {erro && <div style={{ fontSize: 12, color: "#ef4444" }}>{erro}</div>}
        </div>
        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={enviando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar sugestão"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   HELPER: destaca apto / casa no endereço
══════════════════════════════════════════════════════ */
function destacarEndereco(texto) {
  // Cobre: apto, apt, apto., AP, AP., apartamento, casa — case insensitive
  const regex = /\b(apartamento|apto?\.?|ap\.?|casa)\s*[,]?\s*\d+/gi;
  const partes = [];
  let ultimo = 0;
  let m;
  while ((m = regex.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    partes.push(
      <mark key={m.index} style={{
        background: "color-mix(in srgb, #f59e0b 20%, transparent)",
        color: "#f59e0b",
        borderRadius: 4,
        padding: "1px 5px",
        fontWeight: 700,
        fontStyle: "normal",
      }}>
        {m[0]}
      </mark>
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes.length > 1 ? partes : texto;
}

/* ══════════════════════════════════════════════════════
   MODAL: DETALHE DO AGENDAMENTO
══════════════════════════════════════════════════════ */
function ModalDetalheInstalador({ ag, onClose }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.get(`/agendamentos/${ag.id}`)
      .then((r) => setDetalhe(r.agendamento))
      .catch(() => setDetalhe(ag))
      .finally(() => setCarregando(false));
  }, [ag.id]); // eslint-disable-line

  const d = detalhe || ag;
  const statusMeta = STATUS_META[d.status] || STATUS_META.agendado;

  const midias = d.anexos?.filter((a) => a.tipo?.startsWith("foto") || a.tipo?.startsWith("video")) || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto", padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: `3px solid ${statusMeta.cor}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--color-text)" }}>
                {d.titulo}
              </h2>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px",
                borderRadius: "var(--radius-xs)",
                background: statusMeta.cor + "22", color: statusMeta.cor,
                border: `1px solid ${statusMeta.cor}44`,
                whiteSpace: "nowrap",
              }}>
                {statusMeta.label}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>👤 {d.cliente}</div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ flexShrink: 0 }}>×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 0 }}>
          {carregando ? (
            <div style={{ textAlign: "center", padding: 30, color: "var(--color-text-muted)", fontSize: 13 }}>
              Carregando detalhes...
            </div>
          ) : (
            <>
              {/* Bloco: info principal */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 14 }}>
                <Row emoji="📅" label="Data"    valor={d.data?.split("-").reverse().join("/")} />
                <Row emoji="🕐" label="Horário" valor={faixaHora(d.hora, d.duracao_minutos)} />
                {d.tipo && <Row emoji="🏷️" label="Tipo" valor={d.tipo} />}
              </div>

              {/* Bloco: endereço */}
              {d.endereco && (
                <>
                  <div style={{ borderTop: "1px solid var(--color-border)", margin: "0 0 14px" }} />
                  <div style={{ paddingBottom: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                    <Row
                      emoji="📍"
                      label="Endereço"
                      valor={
                        <span>
                          <span style={{ wordBreak: "break-word" }}>
                            {destacarEndereco(d.endereco)}
                            <span
                              style={{ fontSize: 11, color: "var(--color-primary)", cursor: "pointer", marginLeft: 8, whiteSpace: "nowrap" }}
                              onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(d.endereco)}`, "_blank")}
                            >
                              🗺️ Abrir no Google Maps ↗
                            </span>
                          </span>
                        </span>
                      }
                    />
                  </div>
                </>
              )}

              {/* Bloco: descrição / observação */}
              {(d.descricao || d.observacoes) && (
                <>
                  <div style={{ borderTop: "1px solid var(--color-border)", margin: "0 0 14px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 14 }}>
                    <Row
                      emoji="📝"
                      label="Descrição / Observação"
                      valor={[d.descricao, d.observacoes].filter(Boolean).join("\n\n")}
                    />
                  </div>
                </>
              )}

              {/* Bloco: itens */}
              {d.itens?.length > 0 && (
                <>
                  <div style={{ borderTop: "1px solid var(--color-border)", margin: "0 0 14px" }} />
                  <div style={{ paddingBottom: 14 }}>
                    <Row
                      emoji="📦"
                      label="Itens"
                      valor={
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {d.itens.map((item, i) => (
                            <li key={i} style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.7 }}>{item}</li>
                          ))}
                        </ul>
                      }
                    />
                  </div>
                </>
              )}

              {/* Bloco: equipe */}
              {d.equipe_info?.length > 0 && (
                <>
                  <div style={{ borderTop: "1px solid var(--color-border)", margin: "0 0 14px" }} />
                  <div style={{ paddingBottom: 14 }}>
                    <Row
                      emoji="👥"
                      label="Equipe"
                      valor={
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {d.equipe_info.map((e) => (
                            <span key={e.id} style={{
                              fontSize: 12, padding: "2px 8px",
                              background: "var(--color-surface-2, var(--color-bg))",
                              border: "1px solid var(--color-border)",
                              borderRadius: 20,
                              color: "var(--color-text-secondary)",
                            }}>
                              {e.nome}
                            </span>
                          ))}
                        </div>
                      }
                    />
                  </div>
                </>
              )}

              {/* Bloco: mídias */}
              {midias.length > 0 && (
                <>
                  <div style={{ borderTop: "1px solid var(--color-border)", margin: "0 0 14px" }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📸</span> Fotos e vídeos
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
                      {midias.map((a) => (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ display: "block", position: "relative", aspectRatio: "1", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "#111" }}>
                          {a.tipo?.startsWith("video") ? (
                            <>
                              <video src={a.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.35)", fontSize: 20, color: "#fff" }}>▶</div>
                            </>
                          ) : (
                            <img src={a.url} alt={a.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="modal-actions" style={{ borderTop: "1px solid var(--color-border)" }}>
          <button className="ek-btn ek-btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Row({ emoji, label, valor }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "140px 1fr",
      gap: 0,
      minHeight: 36,
      alignItems: "stretch",
    }}>
      {/* Célula do label */}
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
        color: "var(--color-text-muted)",
        display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
        paddingRight: 14,
        borderRight: "2px solid var(--color-border)",
      }}>
        {emoji && <span style={{ fontSize: 14 }}>{emoji}</span>}
        {label}
      </div>
      {/* Célula do valor */}
      <div style={{
        fontSize: 13, color: "var(--color-text)",
        paddingLeft: 14,
        display: "flex", alignItems: "center",
        wordBreak: "break-word",
      }}>
        {valor}
      </div>
    </div>
  );
}
