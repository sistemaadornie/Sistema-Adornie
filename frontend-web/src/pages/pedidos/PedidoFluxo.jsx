import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api } from "../../services/api";
import { numeroPedidoCurto } from "../../utils/numeroPedido";
import FluxogramaCanvas from "./fluxo/FluxogramaCanvas";
import EtapaDadosPedido from "./fluxo/etapas/EtapaDadosPedido";
import EtapaConferencia from "./fluxo/etapas/EtapaConferencia";
import EtapaProducao from "./fluxo/etapas/EtapaProducao";
import EtapaConferenciaProduto from "./fluxo/etapas/EtapaConferenciaProduto";
import EtapaAgendamento from "./fluxo/etapas/EtapaAgendamento";
import EtapaSeparacao from "./fluxo/etapas/EtapaSeparacao";
import EtapaEntrega from "./fluxo/etapas/EtapaEntrega";
import EtapaPosvenda from "./fluxo/etapas/EtapaPosvenda";
import "./PedidoFluxo.css";

function fmtMoeda(v) {
  if (v == null || v === "") return "0,00";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ETAPA_COMPONENTES = {
  1: EtapaDadosPedido,
  2: EtapaConferencia,
  3: EtapaProducao,
  4: EtapaConferenciaProduto,
  5: EtapaAgendamento,
  6: EtapaSeparacao,
  7: EtapaEntrega,
  8: EtapaPosvenda,
};

export default function PedidoFluxo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  useAuth();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [etapaAberta, setEtapaAberta] = useState(null);
  const [abrirFichasConsultoras, setAbrirFichasConsultoras] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await api.get(`/pedidos/${id}/fluxo`);
      setDados(res);
    } catch (e) {
      setErro(e?.message || "Erro ao carregar o fluxo do pedido.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  /* Reabrir a Etapa 1 com a modal de Fichas de Consultoras ao voltar de uma ficha */
  useEffect(() => {
    if (location.state?.reabrirFichasConsultoras) {
      setEtapaAberta(1);
      setAbrirFichasConsultoras(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  /* Reabrir a Etapa 1 ao voltar da tela de Editar Pedido */
  useEffect(() => {
    if (location.state?.reabrirEtapa) {
      setEtapaAberta(location.state.reabrirEtapa);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  function handleEtapaClick(numero) {
    setEtapaAberta(numero);
  }

  function handleFecharEtapa() {
    setEtapaAberta(null);
    setAbrirFichasConsultoras(false);
    carregar();
  }

  function handleFichasConsultorasAbertas() {
    setAbrirFichasConsultoras(false);
  }

  if (loading) {
    return (
      <div className="pf-page" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
        Carregando...
      </div>
    );
  }
  if (erro) {
    return (
      <div className="pf-page" style={{ padding: 40, color: "#f87171" }}>{erro}</div>
    );
  }
  if (!dados) return null;

  const { pedido, etapa_atual, etapas, pre_agendamentos } = dados;
  const EtapaComponente = etapaAberta ? ETAPA_COMPONENTES[etapaAberta] : null;

  return (
    <div className="pf-page">
      <div className="pf-header">
        <button className="pf-header-back" onClick={() => navigate("/pedidos")}>← Voltar</button>
        <div>
          <div className="pf-header-pedido-num">
            Pedido #{numeroPedidoCurto(pedido)}
          </div>
          <div className="pf-header-pedido-sub">
            {pedido.cliente_nome} · R$ {fmtMoeda(pedido.total)}
          </div>
        </div>
      </div>

      <FluxogramaCanvas
        key={id}
        etapas={etapas}
        etapaAtual={etapa_atual}
        onEtapaClick={handleEtapaClick}
      />

      {EtapaComponente && (
        <EtapaComponente
          pedidoId={Number(id)}
          pedido={pedido}
          etapas={etapas}
          preAgendamentos={pre_agendamentos}
          onClose={handleFecharEtapa}
          onRecarregar={carregar}
          abrirFichasConsultorasInicial={abrirFichasConsultoras}
          onFichasConsultorasAbertas={handleFichasConsultorasAbertas}
        />
      )}
    </div>
  );
}
