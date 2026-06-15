import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  FiMapPin, FiClock, FiUser, FiFileText, FiCamera,
  FiExternalLink, FiUsers, FiPackage, FiTag,
} from "react-icons/fi";
import { api } from "../services/api";
import TopBar from "../components/TopBar";
import {
  statusLabel, formatDateBR, enderecoCompleto, mapsUrl, STATUS_INSTALADOR_ACOES,
} from "../utils/agendamentos";

const ANEXO_LABELS = {
  foto_antes: "Antes",
  foto_depois: "Depois",
  video_antes: "Vídeo (antes)",
  video_depois: "Vídeo (depois)",
  video: "Vídeo",
  documento: "Documento",
};

function FilePicker({ files, setFiles, label }) {
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
        <div className="photo-thumb" key={idx} onClick={() => remover(idx)}>
          <img src={URL.createObjectURL(file)} alt={file.name} />
          <span className="photo-tag">Remover</span>
        </div>
      ))}
      <label className="upload-btn">
        <FiCamera />
        {label}
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

export default function AgendamentoDetalhe() {
  const { id } = useParams();
  const [ag, setAg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [actionFiles, setActionFiles] = useState([]);
  const [anexoFiles, setAnexoFiles] = useState([]);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    setErro("");
    api.get(`/agendamentos/${id}`)
      .then((data) => setAg(data.agendamento))
      .catch((err) => setErro(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function alterarStatus(status) {
    if (status === "nao_concluido" && !motivo.trim()) {
      setActionMsg("Informe o motivo para marcar como não concluído.");
      return;
    }
    setEnviando(true);
    setActionMsg("");
    try {
      const fd = new FormData();
      fd.append("status", status);
      if (motivo.trim()) fd.append("motivo", motivo.trim());
      actionFiles.forEach((f) => fd.append("arquivos", f));
      await api.put(`/agendamentos/${id}/status`, fd, true);
      setActionFiles([]);
      setMotivo("");
      carregar();
    } catch (err) {
      setActionMsg(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function enviarAnexos() {
    if (!anexoFiles.length) return;
    setEnviandoAnexo(true);
    setActionMsg("");
    try {
      const fd = new FormData();
      anexoFiles.forEach((f) => fd.append("arquivos", f));
      await api.post(`/agendamentos/${id}/anexos`, fd, true);
      setAnexoFiles([]);
      carregar();
    } catch (err) {
      setActionMsg(err.message);
    } finally {
      setEnviandoAnexo(false);
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
        <div className="page"><div className="banner banner-danger">{erro || "Agendamento não encontrado."}</div></div>
      </>
    );
  }

  const endereco = enderecoCompleto(ag);
  const link = mapsUrl(ag);

  return (
    <>
      <TopBar title={ag.cliente} back />
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2 className="page-title" style={{ fontSize: 22 }}>{ag.titulo}</h2>
          <span className={`badge badge-${ag.status}`}>{statusLabel(ag.status)}</span>
        </div>
        {ag.pedido_numero && <p className="page-subtitle">Pedido {ag.pedido_numero}</p>}

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

        {ag.itens?.length > 0 && (
          <div className="card">
            <div className="detail-row" style={{ marginBottom: 6 }}>
              <FiPackage className="detail-icon" />
              <span className="detail-label">Itens</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              {ag.itens.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}

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

        {/* Fotos existentes */}
        {ag.anexos?.length > 0 && (
          <>
            <h3 className="section-title">Fotos e anexos</h3>
            <div className="photo-grid">
              {ag.anexos.map((a) => (
                <a className="photo-thumb" href={a.url} target="_blank" rel="noreferrer" key={a.id}>
                  {a.url?.match(/\.(mp4|mov|webm|mkv|3gp)$/i)
                    ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: "var(--color-text-secondary)" }}>Vídeo</div>
                    : <img src={a.url} alt={a.nome} />}
                  <span className="photo-tag">{ANEXO_LABELS[a.tipo] || a.tipo}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {/* Anexar novas fotos */}
        <h3 className="section-title">Anexar fotos</h3>
        <FilePicker files={anexoFiles} setFiles={setAnexoFiles} label="Adicionar foto" />
        {anexoFiles.length > 0 && (
          <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={enviandoAnexo} onClick={enviarAnexos}>
            {enviandoAnexo ? "Enviando..." : `Enviar ${anexoFiles.length} foto(s)`}
          </button>
        )}

        {actionMsg && <div className="banner banner-danger" style={{ marginTop: 12 }}>{actionMsg}</div>}

        {/* Ações de status */}
        {STATUS_INSTALADOR_ACOES.podeIniciar(ag.status) && (
          <>
            <h3 className="section-title">Iniciar atendimento</h3>
            <p className="list-item-meta">Tire fotos do local antes de começar (opcional).</p>
            <FilePicker files={actionFiles} setFiles={setActionFiles} label="Foto antes" />
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={enviando} onClick={() => alterarStatus("andamento")}>
              {enviando ? "Enviando..." : "Iniciar atendimento"}
            </button>
          </>
        )}

        {STATUS_INSTALADOR_ACOES.podeFinalizar(ag.status) && (
          <>
            <h3 className="section-title">Finalizar atendimento</h3>
            <p className="list-item-meta">Tire fotos do resultado final (opcional).</p>
            <FilePicker files={actionFiles} setFiles={setActionFiles} label="Foto depois" />
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Motivo (obrigatório se não concluído)</label>
              <textarea
                className="input-base"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: cliente ausente, falta de material..."
              />
            </div>
            <div className="btn-row">
              <button className="btn btn-success" disabled={enviando} onClick={() => alterarStatus("concluido")}>
                {enviando ? "Enviando..." : "Concluir"}
              </button>
              <button className="btn btn-danger" disabled={enviando} onClick={() => alterarStatus("nao_concluido")}>
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
    </>
  );
}
