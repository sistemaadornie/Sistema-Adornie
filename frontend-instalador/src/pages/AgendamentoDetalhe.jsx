import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  FiMapPin, FiClock, FiUser, FiFileText, FiCamera,
  FiExternalLink, FiUsers, FiPackage, FiTag, FiX,
} from "react-icons/fi";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import {
  statusLabel, formatDateBR, enderecoCompleto, mapsUrl,
  STATUS_INSTALADOR_ACOES, STATUS_CORES,
} from "../utils/agendamentos";

const ANEXO_LABELS = {
  foto_antes:   "Antes",
  foto_depois:  "Depois",
  video_antes:  "Vídeo (antes)",
  video_depois: "Vídeo (depois)",
  video:        "Vídeo",
  documento:    "Documento",
};

const ROTULO_ITENS = {
  "Instalação":          "Itens para instalar",
  "Conferência":         "Itens para conferir",
  "Manutenção":          "Itens para manutenção",
  "Retorno/Finalização": "Itens para verificar",
};
function rotuloItens(tipo) {
  return ROTULO_ITENS[tipo] || "Itens";
}

const AVISO_FOTO = {
  andamento: {
    titulo: "📷 Foto obrigatória antes de iniciar",
    texto: "Registre o estado do local antes de tocar em qualquer coisa. Esse comprovante protege você e a empresa caso surjam questionamentos sobre danos pré-existentes.",
  },
  concluido: {
    titulo: "✅ Foto obrigatória para concluir",
    texto: "Registre o resultado final do serviço com pelo menos uma foto. Esse comprovante documenta o trabalho entregue.",
  },
  nao_concluido: {
    titulo: "⚠️ Foto obrigatória ao registrar não conclusão",
    texto: "Fotografe a situação que impediu a conclusão. Esse registro é essencial para explicar a ocorrência e orientar o retorno.",
  },
};

const STATUS_SHEET_LABEL = {
  andamento:     "Iniciar atendimento",
  concluido:     "Concluir atendimento",
  nao_concluido: "Não concluído",
};

/* ── FilePicker ── */
function FilePicker({ files, setFiles }) {
  function onChange(e) {
    const novos = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...novos]);
    e.target.value = "";
  }
  function remover(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }
  return (
    <div className="photo-grid">
      {files.map((file, idx) => (
        <div className="photo-thumb" key={idx} style={{ cursor: "pointer" }} onClick={() => remover(idx)}>
          <img src={URL.createObjectURL(file)} alt={file.name} />
          <span className="photo-tag">✕ Remover</span>
        </div>
      ))}
      <label className="upload-btn">
        <FiCamera />
        Adicionar foto
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onChange}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}

/* ── ItemComFoto ── */
function ItemComFoto({ agendamentoId, item, podeFotografar, onFotoEnviada }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function onChange(e) {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (!arquivos.length) return;
    setEnviando(true);
    setErro("");
    try {
      const fd = new FormData();
      arquivos.forEach((f) => fd.append("arquivos", f));
      const data = await api.post(`/agendamentos/${agendamentoId}/itens/${item.id}/fotos`, fd, true);
      onFotoEnviada(item.id, data.fotos);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <li className="item-row">
      <span className="item-row-nome">{item.nome}</span>
      {item.fotos?.length > 0 && (
        <div className="item-row-fotos">
          {item.fotos.map((f) => (
            <img key={f.id} src={f.url} alt="" className="item-row-foto-mini" />
          ))}
        </div>
      )}
      {podeFotografar && (
        <label
          className="item-row-cam-btn"
          title="Adicionar foto"
          style={{ opacity: enviando ? 0.5 : 1, pointerEvents: enviando ? "none" : "auto" }}
        >
          <FiCamera size={14} />
          <input type="file" accept="image/*" capture="environment" multiple onChange={onChange} style={{ display: "none" }} />
        </label>
      )}
      {erro && <span className="item-row-erro">{erro}</span>}
    </li>
  );
}

/* ── BottomSheet ── */
function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div className="bs-overlay" onClick={onClose} />
      <div className="bottom-sheet">
        <div className="bs-handle" />
        {children}
      </div>
    </>
  );
}

/* ── Página principal ── */
export default function AgendamentoDetalhe() {
  const { id } = useParams();
  const [ag, setAg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [sheetStatus,   setSheetStatus]   = useState(null);
  const [sheetFiles,    setSheetFiles]    = useState([]);
  const [sheetMotivo,   setSheetMotivo]   = useState("");
  const [sheetEnviando, setSheetEnviando] = useState(false);
  const [sheetMsg,      setSheetMsg]      = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    setErro("");
    api.get(`/agendamentos/${id}`)
      .then((data) => setAg(data.agendamento))
      .catch((err) => setErro(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  function atualizarFotosItem(itemId, novasFotos) {
    setAg((prev) => ({
      ...prev,
      itens_raw: (prev.itens_raw || []).map((it) =>
        it.id === itemId ? { ...it, fotos: [...(it.fotos || []), ...novasFotos] } : it
      ),
    }));
  }

  function abrirSheet(status) {
    setSheetStatus(status);
    setSheetFiles([]);
    setSheetMotivo("");
    setSheetMsg("");
  }

  function fecharSheet() {
    if (sheetEnviando) return;
    setSheetStatus(null);
  }

  async function confirmarAcao() {
    if (exigeFotoPorItem) {
      if (itensSemFoto.length > 0) {
        setSheetMsg("Adicione uma foto em cada item antes de continuar.");
        return;
      }
    } else if (!sheetFiles.length) {
      setSheetMsg("Adicione pelo menos uma foto para continuar.");
      return;
    }
    setSheetEnviando(true);
    setSheetMsg("");
    try {
      const fd = new FormData();
      fd.append("status", sheetStatus);
      if (sheetMotivo.trim()) fd.append("motivo", sheetMotivo.trim());
      if (!exigeFotoPorItem) sheetFiles.forEach((f) => fd.append("arquivos", f));
      await api.put(`/agendamentos/${id}/status`, fd, true);
      setSheetStatus(null);
      carregar();
    } catch (err) {
      setSheetMsg(err.message);
    } finally {
      setSheetEnviando(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Agendamento" back />
        <div className="page"><div className="spinner-wrap">Carregando...</div></div>
      </>
    );
  }

  if (erro || !ag) {
    return (
      <>
        <TopBar title="Agendamento" back />
        <div className="page">
          <div className="banner banner-danger">{erro || "Agendamento não encontrado."}</div>
        </div>
      </>
    );
  }

  const endereco  = enderecoCompleto(ag);
  const link      = mapsUrl(ag);
  const statusCor = STATUS_CORES[ag.status] || "var(--color-border)";

  const exigeFotoPorItem = sheetStatus !== "andamento"
    && (ag.tipo === "Instalação" || ag.tipo === "Retorno/Finalização");
  const itensSemFoto = (ag.itens_raw || []).filter(
    (it) => it.pedido_item_id != null && !(it.fotos?.length)
  );

  return (
    <>
      <TopBar title={ag.cliente} back />
      <div className="page">

        {/* Header com cor do status */}
        <div className="ag-header" style={{ borderLeft: `4px solid ${statusCor}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <h2 className="page-title" style={{ fontSize: 20, margin: 0 }}>{ag.titulo}</h2>
            <span className={`badge badge-${ag.status}`}>{statusLabel(ag.status)}</span>
          </div>
          {ag.pedido_numero && (
            <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
              Pedido {ag.pedido_numero}
            </p>
          )}
        </div>

        {/* Info principal */}
        <div className="card">
          <div className="detail-row">
            <FiUser className="detail-icon" />
            <div>
              <span className="detail-label">Cliente</span>
              {ag.cliente}
            </div>
          </div>
          <div className="detail-row">
            <FiClock className="detail-icon" />
            <div>
              <span className="detail-label">Data e horário</span>
              {formatDateBR(ag.data)} às {ag.hora}
            </div>
          </div>
          {ag.tipo && (
            <div className="detail-row">
              <FiTag className="detail-icon" />
              <div>
                <span className="detail-label">Tipo</span>
                {ag.tipo}
              </div>
            </div>
          )}
          {endereco && (
            <div className="detail-row">
              <FiMapPin className="detail-icon" />
              <div>
                <span className="detail-label">Endereço</span>
                {endereco}
              </div>
            </div>
          )}
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="btn btn-block" style={{ marginTop: 8 }}>
              <FiExternalLink /> Abrir no mapa
            </a>
          )}
        </div>

        {/* Descrição / observações */}
        {(ag.descricao || ag.observacoes) && (
          <div className="card">
            {ag.descricao && (
              <div className="detail-row">
                <FiFileText className="detail-icon" />
                <div>
                  <span className="detail-label">Descrição</span>
                  {ag.descricao}
                </div>
              </div>
            )}
            {ag.observacoes && (
              <div className="detail-row" style={{ marginBottom: 0 }}>
                <FiFileText className="detail-icon" />
                <div>
                  <span className="detail-label">Observações</span>
                  {ag.observacoes}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Itens */}
        {ag.itens_raw?.length > 0 && (
          <div className="card">
            <div className="detail-row" style={{ marginBottom: 6 }}>
              <FiPackage className="detail-icon" />
              <span className="detail-label">{rotuloItens(ag.tipo)}</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {ag.itens_raw.map((item) => (
                <ItemComFoto
                  key={item.id}
                  agendamentoId={ag.id}
                  item={item}
                  podeFotografar={ag.status === "andamento"}
                  onFotoEnviada={atualizarFotosItem}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Equipe */}
        {ag.equipe?.length > 0 && (
          <div className="card">
            <div className="detail-row" style={{ marginBottom: 6 }}>
              <FiUsers className="detail-icon" />
              <span className="detail-label">Equipe</span>
            </div>
            <div style={{ fontSize: 14 }}>
              {ag.equipe.map((m) => m.nome).join(", ")}
            </div>
          </div>
        )}

        {/* Fotos e anexos existentes */}
        {ag.anexos?.length > 0 && (
          <>
            <h3 className="section-title">Fotos e anexos</h3>
            <div className="photo-grid">
              {ag.anexos.map((a) => (
                <a className="photo-thumb" href={a.url} target="_blank" rel="noreferrer" key={a.id}>
                  {a.url?.match(/\.(mp4|mov|webm|mkv|3gp)$/i) ? (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      height: "100%", fontSize: 12, color: "var(--color-text-secondary)",
                    }}>
                      Vídeo
                    </div>
                  ) : (
                    <img src={a.url} alt={a.nome} />
                  )}
                  <span className="photo-tag">{ANEXO_LABELS[a.tipo] || a.tipo}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {/* Ações de status */}
        {STATUS_INSTALADOR_ACOES.podeIniciar(ag.status) && (
          <>
            <h3 className="section-title">Ação</h3>
            <button className="btn btn-primary btn-block" onClick={() => abrirSheet("andamento")}>
              ▶ Iniciar atendimento
            </button>
          </>
        )}

        {STATUS_INSTALADOR_ACOES.podeFinalizar(ag.status) && (
          <>
            <h3 className="section-title">Finalizar</h3>
            <div className="btn-row">
              <button className="btn btn-success" onClick={() => abrirSheet("concluido")}>
                ✓ Concluir
              </button>
              <button className="btn btn-danger" onClick={() => abrirSheet("nao_concluido")}>
                Não concluído
              </button>
            </div>
          </>
        )}

        {STATUS_INSTALADOR_ACOES.finalizado(ag.status) && (
          <div className="banner banner-info" style={{ marginTop: 12 }}>
            Atendimento finalizado: {statusLabel(ag.status)}.
          </div>
        )}
      </div>

      {/* Bottom Sheet — mudança de status com foto obrigatória */}
      <BottomSheet open={!!sheetStatus} onClose={fecharSheet}>
        {sheetStatus && (
          <div className="bs-content">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span className="bs-title">{STATUS_SHEET_LABEL[sheetStatus]}</span>
              <button className="bs-close" onClick={fecharSheet}><FiX /></button>
            </div>

            {exigeFotoPorItem ? (
              <>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 8,
                }}>
                  Foto de cada item <span style={{ color: "var(--color-danger)" }}>*</span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {(ag.itens_raw || [])
                    .filter((it) => it.pedido_item_id != null)
                    .map((item) => (
                      <ItemComFoto
                        key={item.id}
                        agendamentoId={ag.id}
                        item={item}
                        podeFotografar
                        onFotoEnviada={atualizarFotosItem}
                      />
                    ))}
                </ul>
                {itensSemFoto.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "8px 0 0", textAlign: "center" }}>
                    Falta foto em {itensSemFoto.length} item(ns): {itensSemFoto.map((it) => it.nome).join(", ")}.
                  </p>
                )}
              </>
            ) : (
              <>
                {AVISO_FOTO[sheetStatus] && (
                  <div className="bs-aviso">
                    <strong>{AVISO_FOTO[sheetStatus].titulo}</strong>
                    <p>{AVISO_FOTO[sheetStatus].texto}</p>
                  </div>
                )}

                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.5px", color: "var(--color-text-muted)", marginBottom: 8,
                }}>
                  Fotos <span style={{ color: "var(--color-danger)" }}>*</span>
                </div>
                <FilePicker files={sheetFiles} setFiles={setSheetFiles} />

                {sheetFiles.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "8px 0 0", textAlign: "center" }}>
                    Adicione pelo menos uma foto para continuar.
                  </p>
                )}
              </>
            )}

            {sheetStatus === "nao_concluido" && (
              <div className="form-group" style={{ marginTop: 14 }}>
                <label>Motivo (opcional)</label>
                <textarea
                  className="input-base"
                  value={sheetMotivo}
                  onChange={(e) => setSheetMotivo(e.target.value)}
                  placeholder="Descreva o motivo pelo qual não foi possível concluir..."
                  rows={3}
                />
              </div>
            )}

            {sheetMsg && (
              <div className="banner banner-danger" style={{ marginTop: 8 }}>{sheetMsg}</div>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={sheetEnviando || (exigeFotoPorItem ? itensSemFoto.length > 0 : sheetFiles.length === 0)}
              onClick={confirmarAcao}
            >
              {sheetEnviando ? "Enviando..." : `Confirmar — ${statusLabel(sheetStatus)}`}
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
