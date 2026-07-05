import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import FichaConfeccaoCortina from "./FichaConfeccaoCortina";
import FichaConfeccaoForro from "./FichaConfeccaoForro";
import FichaConferenciaConsultorasPersiana from "./FichaConferenciaConsultorasPersiana";
import "./OrdemServicoModal.css";

export default function FichaConferenciaConsultoras() {
  const { osId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const voltarAgendamentoId = location.state?.voltarConferenciaAgendamentoId || null;
  const voltarPedidoFluxoId = location.state?.voltarPedidoFluxoId || null;
  const readOnly = !!location.state?.readOnly;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [osData, setOsData] = useState(null);

  useEffect(() => { carregar(); }, [osId]);

  async function carregar() {
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

  function voltar() {
    if (voltarAgendamentoId) {
      navigate("/agendamentos", { state: { reabrirConferenciaAgendamentoId: voltarAgendamentoId } });
    } else if (voltarPedidoFluxoId) {
      navigate(`/pedidos/${voltarPedidoFluxoId}/fluxo`, { state: { reabrirFichasConsultoras: true } });
    } else {
      navigate("/pedidos");
    }
  }

  if (loading) {
    return (
      <div className="ek-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="os-spinner" />
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Carregando ficha de conferência consultoras...</p>
        </div>
      </div>
    );
  }

  if (erro || !osData) {
    return (
      <div className="ek-page" style={{ padding: 24 }}>
        <div className="os-alert os-alert-danger">{erro || "Ordem de serviço não encontrada."}</div>
        <button className="os-btn os-btn-secondary" onClick={voltar}>← Voltar</button>
      </div>
    );
  }

  if (osData.tipo === "persiana") {
    return (
      <FichaConferenciaConsultorasPersiana
        osData={osData}
        onSalvar={voltar}
        onVoltar={voltar}
        readOnly={readOnly}
      />
    );
  }

  if (osData.tipo === "forro") {
    return <FichaConfeccaoForro osData={osData} modo="conferencia_consultoras" onSalvar={voltar} onVoltar={voltar} readOnly={readOnly} />;
  }
  return <FichaConfeccaoCortina osData={osData} modo="conferencia_consultoras" onSalvar={voltar} onVoltar={voltar} readOnly={readOnly} />;
}
