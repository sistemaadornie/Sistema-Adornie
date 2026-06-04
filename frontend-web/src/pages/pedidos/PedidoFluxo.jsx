import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api } from "../../services/api";
import "./PedidoFluxo.css";

const COR_STATUS = {
  concluido:   "verde",
  agendado:    "azul",
  pre_agendado:"azul",
  andamento:   "azul",
  pendente:    "cinza",
  cancelado:   "cinza",
  atrasado:    "vermelho",
};

function corNo(status) {
  return COR_STATUS[status] || "cinza";
}

function NoFluxo({ label, status, pulsante, onClick }) {
  const cor = pulsante ? `${corNo(status)} pulsante` : corNo(status);
  return (
    <div
      className={`pf-no ${cor}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {label}
    </div>
  );
}

function Seta({ vertical }) {
  return <div className={vertical ? "pf-seta-v" : "pf-seta-h"}>
    {vertical ? "↓" : "→"}
  </div>;
}

function Tooltip({ node, onClose, onMarcar, user }) {
  if (!node) return null;

  const ehOwner = node.ownPedido;
  const temPerm = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  const podeMar = node.tipo === "manual" && !node.concluido && (temPerm || ehOwner);

  return (
    <div className="pf-tooltip-overlay" onClick={onClose}>
      <div className="pf-tooltip" onClick={(e) => e.stopPropagation()}>
        <button className="pf-tooltip-fechar" onClick={onClose}>×</button>
        <h4 className="pf-tooltip-titulo">{node.label}</h4>
        {node.status && (
          <p className="pf-tooltip-info">Status: <strong>{node.status}</strong></p>
        )}
        {node.data && (
          <p className="pf-tooltip-info">
            Data: <strong>{new Date(node.data).toLocaleDateString("pt-BR")}</strong>
          </p>
        )}
        {node.itens?.length > 0 && (
          <div className="pf-tooltip-itens">
            <p className="pf-tooltip-info">Itens:</p>
            <ul>
              {node.itens.map((i) => (
                <li key={i.pedido_item_id}>{i.descricao}</li>
              ))}
            </ul>
          </div>
        )}
        {podeMar && (
          <button
            className="pf-btn-marcar"
            onClick={() => onMarcar(node.campo)}
          >
            Marcar como concluído
          </button>
        )}
      </div>
    </div>
  );
}

export default function PedidoFluxo() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [dados,       setDados]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState(null);
  const [noSelecionado, setNoselecionado] = useState(null);

  const carregar = useCallback(() => {
    setLoading(true);
    api.get(`/pedidos/${id}/fluxo`)
      .then((res) => { setDados(res); setErro(null); })
      .catch((err) => setErro(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function marcarEtapa(campo) {
    try {
      await api.patch(`/pedidos/${id}/etapa`, { campo, valor: true });
      setNoselecionado(null);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="pf-estado">Carregando fluxo...</div>;
  if (erro)    return <div className="pf-estado pf-erro">Erro: {erro}</div>;
  if (!dados)  return null;

  const { pedido, estagio, pre_agendamentos } = dados;
  const isOwner    = Number(pedido.consultor_id) === Number(user?.id);
  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  // Determines if a base node is the "current" (next to complete)
  function isCurrent(key) {
    if (!estagio.pdf_ok          && key === "pdf")        return true;
    if (estagio.pdf_ok && !estagio.verificacao_ok  && key === "verificar")   return true;
    if (estagio.verificacao_ok && !estagio.categorizacao_ok && key === "categorizar") return true;
    if (estagio.categorizacao_ok && !estagio.vinculos_ok && key === "vincular") return true;
    return false;
  }

  const nosBase = [
    { key: "pdf",       label: "PDF",       status: estagio.pdf_ok ? "concluido" : "pendente", tipo: "auto" },
    {
      key:      "verificar",
      label:    "Verificar",
      status:   estagio.verificacao_ok ? "concluido" : "pendente",
      tipo:     "manual",
      campo:    "verificacao_ok",
      concluido: estagio.verificacao_ok,
      ownPedido: isOwner,
    },
    {
      key:      "categorizar",
      label:    "Categorizar",
      status:   estagio.categorizacao_ok ? "concluido" : "pendente",
      tipo:     "manual",
      campo:    "categorizacao_ok",
      concluido: estagio.categorizacao_ok,
      ownPedido: isOwner,
    },
    { key: "vincular", label: "Vincular", status: estagio.vinculos_ok ? "concluido" : "pendente", tipo: "auto" },
  ];

  return (
    <div className="pf-page">
      {/* Header */}
      <div className="pf-header">
        <button className="pf-btn-voltar" onClick={() => navigate("/dashboard-pedidos")}>
          ← Voltar ao Dashboard
        </button>
        <div className="pf-info">
          <h2 className="pf-titulo">Pedido #{pedido.numero_sequencial}</h2>
          <span className="pf-detalhe">{pedido.cliente_nome}</span>
          <span className="pf-detalhe">{pedido.consultor_nome}</span>
          <span className="pf-detalhe pf-valor">
            R$ {Number(pedido.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Fluxograma */}
      <div className="pf-container">
        <div className="pf-fluxo">
          {/* Base nodes */}
          {nosBase.map((no) => (
            <React.Fragment key={no.key}>
              <NoFluxo
                label={no.label}
                status={no.status}
                pulsante={isCurrent(no.key)}
                onClick={() => setNoselecionado({ ...no })}
              />
              <Seta />
            </React.Fragment>
          ))}

          {/* Fork for pre-agendamentos */}
          <div className="pf-fork">
            {pre_agendamentos.length === 0 ? (
              <NoFluxo label="Pré-ag." status="pendente" />
            ) : (
              pre_agendamentos.map((ag, idx) => {
                const isCur = estagio.vinculos_ok &&
                  (ag.status === "pre_agendado" || ag.status === "agendado") &&
                  idx === 0;
                return (
                  <div key={ag.id} className="pf-col-ag">
                    <NoFluxo
                      label={`Pré-ag. ${idx + 1}`}
                      status={ag.status}
                      pulsante={isCur || ag.status === "atrasado"}
                      onClick={() =>
                        setNoselecionado({
                          key: `preag_${ag.id}`,
                          label: `Pré-agendamento ${idx + 1}`,
                          status: ag.status,
                          data: ag.data_inicio,
                          itens: ag.itens,
                          tipo: "preag",
                        })
                      }
                    />
                    {ag.herdeiros?.map((h) => (
                      <React.Fragment key={h.id}>
                        <Seta vertical />
                        <NoFluxo
                          label={h.tipo || "Herdeiro"}
                          status={h.status}
                          pulsante={h.status === "atrasado"}
                          onClick={() =>
                            setNoselecionado({
                              key:    `herd_${h.id}`,
                              label:  h.tipo || "Herdeiro",
                              status: h.status,
                              data:   h.data_inicio,
                              tipo:   "herdeiro",
                            })
                          }
                        />
                      </React.Fragment>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <Seta />
          <NoFluxo
            label="Entrega"
            status={pedido.status === "concluido" ? "concluido" : "pendente"}
          />
        </div>
      </div>

      {noSelecionado && (
        <Tooltip
          node={noSelecionado}
          onClose={() => setNoselecionado(null)}
          onMarcar={marcarEtapa}
          user={user}
        />
      )}
    </div>
  );
}
