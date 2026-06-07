import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useDashboardPedidos from "./hooks/useDashboardPedidos";
import useAuth from "../../hooks/useAuth";
import "./DashboardPedidos.css";

const STATUS_LABELS = {
  pendente:     "Aguardando",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  cancelado:    "Cancelado",
};

const ALERTA_LABELS = { atrasado: "Atrasado", urgente: "Urgente", atencao: "Atenção" };

function ContagemEntrega({ estagio }) {
  if (!estagio.proximo_prazo) return null;

  const dias  = estagio.dias_para_prazo;
  const nivel = estagio.nivel_alerta || "neutro";

  let texto;
  if (dias > 0) {
    texto = `Entrega em ${dias} dia${dias === 1 ? "" : "s"}`;
  } else if (dias === 0) {
    texto = "Entrega é hoje!";
  } else {
    const atraso = Math.abs(dias);
    texto = `Atrasado há ${atraso} dia${atraso === 1 ? "" : "s"}`;
  }

  const comAlerta = nivel === "urgente" || nivel === "atrasado";
  if (comAlerta) texto = `⚠ ${texto}`;

  return <div className={`dp-entrega dp-entrega-${nivel}`}>{texto}</div>;
}

function BarraProgresso({ estagio }) {
  const preAgs = estagio.pre_agendamentos || [];

  const etapas = [
    { key: "pdf",   label: "PDF",   ok: estagio.pdf_ok },
    { key: "verif", label: "Verif.", ok: estagio.verificacao_ok },
    { key: "categ", label: "Categ.", ok: estagio.categorizacao_ok },
    ...preAgs.map((ag, i) => ({
      key: `preag_${ag.id}`,
      label: `Pré-ag. ${i + 1}`,
      ok: ag.status === "concluido",
      status: ag.status,
    })),
    { key: "entrega", label: "Entrega", ok: false },
  ];

  // Índice da etapa atual (primeira não concluída)
  let atualIdx = etapas.findIndex((e) => !e.ok);
  if (atualIdx === -1) atualIdx = etapas.length - 1;

  return (
    <div className="dp-barra">
      {etapas.map((etapa, idx) => {
        let cls = "dp-etapa";
        if (idx < atualIdx) cls += " dp-ok";
        else if (idx === atualIdx) {
          cls += " dp-atual";
          if (estagio.nivel_alerta === "atrasado") cls += " dp-atrasado";
        }
        return (
          <React.Fragment key={etapa.key}>
            <div className={cls}>
              <div className="dp-ponto" />
              <span className="dp-label">{etapa.label}</span>
            </div>
            {idx < etapas.length - 1 && (
              <div className={`dp-linha ${idx < atualIdx ? "dp-ok" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BadgeStatus({ status, nivelAlerta }) {
  const label = nivelAlerta ? ALERTA_LABELS[nivelAlerta] : (STATUS_LABELS[status] || status);
  return <span className={`dp-badge dp-badge-${nivelAlerta || status}`}>{label}</span>;
}

function CardPedido({ pedido, onVerFluxo }) {
  const { estagio } = pedido;
  return (
    <div
      className={`dp-card ${estagio.nivel_alerta ? "dp-card-" + estagio.nivel_alerta : ""}`}
      onClick={() => onVerFluxo(pedido.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onVerFluxo(pedido.id)}
    >
      <div className="dp-card-header">
        <span className="dp-numero">#{pedido.numero_origem
          ? parseInt(pedido.numero_origem.replace(/^#+/, ""), 10)
          : pedido.numero_sequencial}</span>
        <span className="dp-consultora">{pedido.consultor_nome}</span>
        <BadgeStatus status={pedido.status} nivelAlerta={estagio.nivel_alerta} />
      </div>
      <div className="dp-card-info">
        <span className="dp-cliente">{pedido.cliente_nome}</span>
        <span className="dp-valor">
          R$ {Number(pedido.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        <span className="dp-itens">
          {pedido.itens_count} {pedido.itens_count === 1 ? "item" : "itens"}
        </span>
        {pedido.criado_em && (
          <span className="dp-data">
            {new Date(pedido.criado_em).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
      <ContagemEntrega estagio={estagio} />
      <BarraProgresso estagio={estagio} />
    </div>
  );
}

const FILTROS = [
  { key: "todos",       label: "Todos" },
  { key: "pendente",    label: "Pendentes" },
  { key: "em_andamento",label: "Em andamento" },
  { key: "atrasados",   label: "Atrasados" },
  { key: "concluido",   label: "Concluídos" },
];

export default function DashboardPedidos() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { pedidos, loading, erro, carregar } = useDashboardPedidos();
  const [filtroAtivo,    setFiltroAtivo]    = useState("todos");
  const [visaoGeral,     setVisaoGeral]     = useState(false);
  const [consultoraFiltro, setConsultoraFiltro] = useState("");

  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  // Acumula consultoras já vistas — ao filtrar por uma específica, a lista de
  // pedidos carregada passa a conter só aquela consultora, então não pode ser
  // a única fonte das opções do seletor (senão as demais somem dele).
  const [consultoras, setConsultoras] = useState([]);
  useEffect(() => {
    setConsultoras((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      let mudou = false;
      for (const p of pedidos) {
        if (p.consultor_id && !map.has(p.consultor_id)) {
          map.set(p.consultor_id, { id: p.consultor_id, nome: p.consultor_nome });
          mudou = true;
        }
      }
      if (!mudou) return prev;
      return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    });
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    if (filtroAtivo === "todos")    return pedidos;
    if (filtroAtivo === "atrasados") return pedidos.filter((p) => p.estagio.nivel_alerta === "atrasado");
    return pedidos.filter((p) => p.status === filtroAtivo);
  }, [pedidos, filtroAtivo]);

  function handleFiltro(key) {
    setFiltroAtivo(key);
    if (key === "atrasados") carregar({ alerta: "atrasado" });
    else if (key === "todos") carregar({});
    else carregar({ status: key });
  }

  function handleToggleVisao(geral) {
    setVisaoGeral(geral);
    setConsultoraFiltro("");
    carregar({});
  }

  if (loading) return <div className="dp-loading">Carregando pedidos...</div>;
  if (erro)    return <div className="dp-erro">Erro ao carregar: {erro}</div>;

  return (
    <div className="dp-page">
      <div className="dp-header">
        <h1 className="dp-titulo">Dashboard de Pedidos</h1>
        {temPermGeral && (
          <div className="dp-toggle-section">
            <div className="dp-toggle">
              <button
                className={`dp-toggle-btn ${!visaoGeral ? "dp-toggle-ativo" : ""}`}
                onClick={() => handleToggleVisao(false)}
              >
                Visão Geral
              </button>
              <button
                className={`dp-toggle-btn ${visaoGeral ? "dp-toggle-ativo" : ""}`}
                onClick={() => handleToggleVisao(true)}
              >
                Por Consultora
              </button>
            </div>
            {visaoGeral && consultoras.length > 0 && (
              <select
                className="dp-select-consultora"
                value={consultoraFiltro}
                onChange={(e) => {
                  setConsultoraFiltro(e.target.value);
                  carregar(e.target.value ? { consultora_id: e.target.value } : {});
                }}
              >
                <option value="">Todas as consultoras</option>
                {consultoras.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="dp-chips">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            className={`dp-chip ${filtroAtivo === f.key ? "dp-chip-ativo" : ""}`}
            onClick={() => handleFiltro(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {pedidosFiltrados.length === 0 ? (
        <p className="dp-vazio">Nenhum pedido encontrado.</p>
      ) : (
        <div className="dp-grid">
          {pedidosFiltrados.map((p) => (
            <CardPedido
              key={p.id}
              pedido={p}
              onVerFluxo={(id) => navigate(`/pedidos/${id}/fluxo`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
