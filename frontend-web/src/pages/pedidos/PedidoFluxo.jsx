import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api } from "../../services/api";
import FluxogramaCanvas from "./fluxo/FluxogramaCanvas";
import EtapaDadosPedido from "./fluxo/etapas/EtapaDadosPedido";
import EtapaConferencia from "./fluxo/etapas/EtapaConferencia";
import EtapaProducao from "./fluxo/etapas/EtapaProducao";
import EtapaAgendamento from "./fluxo/etapas/EtapaAgendamento";
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
  4: EtapaAgendamento,
  5: EtapaPosvenda,
};

export default function PedidoFluxo() {
  const { id } = useParams();
  const navigate = useNavigate();
  useAuth();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);
  const [etapaAberta, setEtapaAberta] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await api.get(`/pedidos/${id}/fluxo`);
      setDados(res);
      if (etapaAberta === null) setEtapaAberta(res.etapa_atual ?? 1);
    } catch (e) {
      setErro(e?.message || "Erro ao carregar o fluxo do pedido.");
    } finally {
      setLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);

  function handleEtapaClick(numero) {
    setEtapaAberta(numero);
  }

  function handleFecharEtapa() {
    setEtapaAberta(null);
    carregar();
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
            Pedido #{pedido.numero_sequencial || pedido.numero_origem}
          </div>
          <div className="pf-header-pedido-sub">
            {pedido.cliente_nome} · R$ {fmtMoeda(pedido.total)}
          </div>
        </div>
      </div>

      <FluxogramaCanvas
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
        />
      )}
    </div>
  );
}
