import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  FaUser, FaTag, FaUserTie, FaHome, FaGift, FaRulerCombined,
  FaCalendarAlt, FaThumbtack, FaCheckCircle, FaTimesCircle, FaBolt, FaArrowsAltH, FaUsers,
} from "react-icons/fa";
import { api } from "../../services/api";
import "./OrdemServicoModal.css";

export default function FichaConferenciaTecnicos() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const voltarAgendamentoId = location.state?.voltarConferenciaAgendamentoId || null;

  function voltar() {
    if (voltarAgendamentoId) {
      navigate("/agendamentos", { state: { reabrirConferenciaAgendamentoId: voltarAgendamentoId } });
    } else {
      navigate("/pedidos");
    }
  }

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [osData, setOsData] = useState(null);

  useEffect(() => { carregarOS(); }, [osId]);

  async function carregarOS() {
    setLoading(true);
    setErro("");
    try {
      const res = await api.get(`/os/${osId}`);
      setOsData(res);
    } catch (err) {
      setErro(err.message || "Erro ao carregar ordem de serviço.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="ek-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="os-spinner" />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando ficha técnica...</p>
        </div>
      </div>
    );
  }

  if (!osData) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger">{erro || "Ordem de serviço não encontrada."}</div>
        <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
      </div>
    );
  }

  if (!osData.dados_conferencia_consultoras) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger" style={{ marginBottom: 16 }}>
          Aguardando a Ficha de Conferência Consultoras. A conferência técnica só pode ser preenchida depois que a consultora preencher a Ficha de Conferência Consultoras deste item, na Etapa 1 do pedido.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
          <button
            className="os-btn os-btn-primary"
            onClick={() => navigate(`/pedidos/os/${osId}/conferencia-consultoras`, { state: { voltarConferenciaAgendamentoId: voltarAgendamentoId } })}
          >
            Preencher Ficha de Conferência Consultoras
          </button>
        </div>
      </div>
    );
  }

  const pedidoNumero = osData.pedido_numero || osData.pedido_id;
  const dc = osData.dados_conferencia_consultoras;
  const dt = osData.dados_tecnicos || {};
  const motorizada = osData.tipo === "persiana"
    ? dc.acionamento === "motorizado"
    : osData.tipo === "cortina"
      ? /motoriza/i.test(dc.componente || "")
      : false;
  const dataConferenciaFmt = dt.data_conferencia
    ? new Date(`${dt.data_conferencia}T12:00:00`).toLocaleDateString("pt-BR")
    : null;
  const cortineiroSim = dt.cortineiro === "sim";
  const capitalizar = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

  const IMAGEM_TIPO = {
    cortina:  { src: "/cortina.png",  alt: "Esboço da cortina",  largura: dc.larguraTrilho, altura: dc.alturaCortina },
    persiana: { src: "/persiana.png", alt: "Esboço da persiana", largura: osData.item_largura, altura: osData.item_altura },
  };
  const imagem = IMAGEM_TIPO[osData.tipo];

  return (
    <div className="ek-page os-page">
      <div className="os-page-header os-page-header-flat">
        <div className="os-page-header-left">
          <button className="os-back-btn" onClick={voltar}>← Voltar</button>
          <h1 className="os-page-title">
            Conferência Técnica
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)", color: "var(--color-text-muted, #999)" }}>
              🔒 Somente leitura
            </span>
          </h1>
        </div>
        <div className="os-page-header-right">
          <button className="os-btn os-btn-secondary" onClick={voltar}>Fechar</button>
        </div>
      </div>

      {!osData.dados_tecnicos && (
        <div className="os-alert os-alert-warning" style={{ margin: "0 0 16px" }}>
          Esta ficha ainda não foi preenchida. A Conferência Técnica só pode ser preenchida pelo técnico, pelo aplicativo, no momento do atendimento.
        </div>
      )}

      <div className="os-page-body">
        <div className="os-info-bar">
          <div className="os-info-row">
            <div className="os-info-item os-info-item-grow">
              <span className="os-info-label"><FaUser /> Cliente</span>
              <span className="os-info-value">{osData.cliente_nome || "—"}</span>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaTag /> Pedido</span>
              <span className="os-info-value tag-pedido">{pedidoNumero}</span>
            </div>
            <div className="os-info-item">
              <span className="os-info-label"><FaUserTie /> Vendedor</span>
              <span className="os-info-value">{osData.consultor_nome || "—"}</span>
            </div>
          </div>
          <div className="os-info-row">
            <div className="os-info-item">
              <span className="os-info-label"><FaHome /> Ambiente</span>
              <span className="os-info-value highlight-text">{osData.item_ambiente || "—"}</span>
            </div>
            <div className="os-info-item os-info-item-grow">
              <span className="os-info-label"><FaGift /> Produto</span>
              <span className="os-info-value">{osData.item_descricao || "—"}</span>
            </div>
          </div>
        </div>

        <div className="os-layout-img">
          <div className="os-col-left-form">
            <div className="os-form-section">
              <div className="os-section-title">Confirmação de Medida Técnica</div>

              {/* Linha de resumo: Responsável, Data, Fixação */}
              <div className="os-confirm-header-row">
                <div className="os-confirm-tile">
                  <span className="os-confirm-icon"><FaUser /></span>
                  <span className="os-confirm-label">Responsável</span>
                  <span className="os-confirm-value">{dt.responsavel_conferencia || "—"}</span>
                </div>
                <div className="os-confirm-tile">
                  <span className="os-confirm-icon"><FaCalendarAlt /></span>
                  <span className="os-confirm-label">Data</span>
                  <span className="os-confirm-value">{dataConferenciaFmt || "—"}</span>
                </div>
                <div className="os-confirm-tile">
                  <span className="os-confirm-icon"><FaThumbtack /></span>
                  <span className="os-confirm-label">Fixação</span>
                  <span className="os-confirm-value">{capitalizar(dt.fixacao) || "—"}</span>
                </div>
              </div>

              {/* Grade compacta dos demais campos */}
              <div className="os-confirm-grid">
                <div className="os-confirm-tile">
                  <span className={`os-confirm-icon ${cortineiroSim ? "ok" : "neutral"}`}>
                    {cortineiroSim ? <FaCheckCircle /> : <FaTimesCircle />}
                  </span>
                  <span className="os-confirm-label">Cortineiro</span>
                  <span className={`os-confirm-badge ${cortineiroSim ? "ok" : "neutral"}`}>
                    {cortineiroSim ? "Sim" : "Não"}
                  </span>
                </div>
                {cortineiroSim && (
                  <div className="os-confirm-tile">
                    <span className="os-confirm-icon"><FaRulerCombined /></span>
                    <span className="os-confirm-label">Tamanho Cortineiro</span>
                    <span className="os-confirm-value">{dt.tamanho_cortineiro || "—"}</span>
                  </div>
                )}
                <div className="os-confirm-tile">
                  <span className="os-confirm-icon"><FaRulerCombined /></span>
                  <span className="os-confirm-label">Afastamento Sup.</span>
                  <span className="os-confirm-value">{dt.afastamento_suportes ? `${dt.afastamento_suportes} cm` : "—"}</span>
                </div>

                {motorizada && dt.lado_motor && dt.lado_motor !== "n/a" && (
                  <div className="os-confirm-tile">
                    <span className="os-confirm-icon"><FaArrowsAltH /></span>
                    <span className="os-confirm-label">Lado Motor</span>
                    <span className="os-confirm-value">{capitalizar(dt.lado_motor)}</span>
                  </div>
                )}
                {motorizada && dt.voltagem && dt.voltagem !== "sem_motor" && (
                  <div className="os-confirm-tile">
                    <span className="os-confirm-icon"><FaBolt /></span>
                    <span className="os-confirm-label">Voltagem</span>
                    <span className="os-confirm-value">{dt.voltagem}</span>
                  </div>
                )}

                <div className="os-confirm-tile os-confirm-tile-wide">
                  <span className="os-confirm-icon"><FaUsers /></span>
                  <span className="os-confirm-label">Acompanhado por</span>
                  <span className="os-confirm-value">{dt.acompanhado_por || "—"}</span>
                </div>
              </div>
            </div>

            <div className="os-form-section">
              <div className="os-section-title">Assinatura do Técnico</div>
              <div className="os-canvas-container">
                {dt.assinatura_tecnico ? (
                  <img src={dt.assinatura_tecnico} alt="Assinatura do técnico" style={{ width: "100%", background: "#fff", borderRadius: "var(--radius-sm)" }} />
                ) : (
                  <div className="os-alert" style={{ textAlign: "center" }}>Não preenchida</div>
                )}
              </div>
            </div>
          </div>

          <div className="os-img-col">
            <div className="os-info-item">
              <span className="os-info-label"><FaRulerCombined /> Largura Real</span>
              <span className="os-info-value spec-box">{dt.largura ? `${dt.largura} m` : "—"}</span>
            </div>
            {imagem && <img src={imagem.src} alt={imagem.alt} className="os-img-cortina" />}
            <div className="os-alturas-row">
              <div className="os-info-item">
                <span className="os-info-label"><FaRulerCombined /> Esq.</span>
                <span className="os-info-value spec-box">{dt.altura_esq ? `${dt.altura_esq} m` : "—"}</span>
              </div>
              <div className="os-info-item">
                <span className="os-info-label"><FaRulerCombined /> Meio</span>
                <span className="os-info-value spec-box">{dt.altura_meio ? `${dt.altura_meio} m` : "—"}</span>
              </div>
              <div className="os-info-item">
                <span className="os-info-label"><FaRulerCombined /> Dir.</span>
                <span className="os-info-value spec-box">{dt.altura_dir ? `${dt.altura_dir} m` : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
