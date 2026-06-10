import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import usePedidos from "./hooks/usePedidos";
import useAuth from "../../hooks/useAuth";
import ImportarPedidoModal from "./ImportarPedidoModal";
import { api, API_BASE } from "../../services/api";
import { numeroPedidoCurto } from "../../utils/numeroPedido";
import "./Pedidos.css";

const STATUS_LABELS = {
  pendente:     "Pendente",
  em_andamento: "Em andamento",
  concluido:    "Concluído",
  cancelado:    "Cancelado",
};

const ALERTA_LABELS = { atrasado: "Atrasado", urgente: "Urgente", atencao: "Atenção" };

const ETAPA_CONFIG = [
  { numero: 1, label: "Dados do Pedido",          labelCurto: "Pedido",      icone: "📋" },
  { numero: 2, label: "Conferência de Medidas",   labelCurto: "Medidas",     icone: "📐" },
  { numero: 3, label: "Produção",                 labelCurto: "Produção",    icone: "⚙️" },
  { numero: 4, label: "Agendamento",              labelCurto: "Agendamento", icone: "📅" },
  { numero: 5, label: "Pós-venda",                labelCurto: "Pós-venda",   icone: "⭐" },
];

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

function BarraProgresso({ estagio, status }) {
  const etapaAtual = estagio.etapa_atual || 1;
  const concluido = status === "concluido";

  return (
    <>
      <div className="dp-barra">
        {ETAPA_CONFIG.map((etapa, idx) => {
          const ok = etapa.numero < etapaAtual || (etapa.numero === 5 && concluido);
          const atual = !ok && etapa.numero === etapaAtual;

          let cls = "dp-etapa";
          if (ok) cls += " dp-ok";
          else if (atual) {
            cls += " dp-atual";
            if (estagio.nivel_alerta === "atrasado") cls += " dp-atrasado";
          }

          return (
            <React.Fragment key={etapa.numero}>
              <div className={cls}>
                <div className="dp-ponto" />
                <span className="dp-label">{etapa.labelCurto}</span>
              </div>
              {idx < ETAPA_CONFIG.length - 1 && (
                <div className={`dp-linha ${ok ? "dp-ok" : ""}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className={`dp-etapa-atual-label ${estagio.nivel_alerta === "atrasado" ? "dp-etapa-atual-atrasado" : ""}`}>
        {concluido ? (
          "✓ Pedido concluído"
        ) : (
          <>▶ Etapa atual: <strong>{ETAPA_CONFIG[etapaAtual - 1].label}</strong></>
        )}
      </div>
    </>
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
        <span className="dp-numero">#{numeroPedidoCurto(pedido)}</span>
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
      <BarraProgresso estagio={estagio} status={pedido.status} />
    </div>
  );
}

const FILTROS = [
  { key: "todos",        label: "Todos" },
  { key: "pendente",     label: "Pendente" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "atrasados",    label: "Atrasado" },
  { key: "concluido",    label: "Concluído" },
];

export default function Pedidos() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { pedidos, loading, erro, carregar } = usePedidos();
  const [filtroAtivo,    setFiltroAtivo]    = useState("todos");
  const [consultoraFiltro, setConsultoraFiltro] = useState("");
  const [importarAberto, setImportarAberto] = useState(false);
  const [salvando,       setSalvando]       = useState(false);
  const [etapaFiltro, setEtapaFiltro] = useState(null); // null = todas as etapas

  const temPermGeral = (user?.permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const [consultoras, setConsultoras] = useState([]);

  useEffect(() => {
    if (consultoraFiltro || filtroAtivo !== "todos") return;
    const map = new Map();
    for (const p of pedidos) {
      if (p.consultor_id && !map.has(p.consultor_id)) {
        map.set(p.consultor_id, { id: p.consultor_id, nome: p.consultor_nome });
      }
    }
    if (map.size > 0) {
      setConsultoras(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
    }
  }, [pedidos, consultoraFiltro, filtroAtivo]);

  const pedidosFiltrados = useMemo(() => {
    let lista = pedidos;
    if (filtroAtivo === "atrasados") lista = lista.filter((p) => p.estagio.nivel_alerta === "atrasado");
    else if (filtroAtivo !== "todos") lista = lista.filter((p) => p.status === filtroAtivo);

    if (etapaFiltro) lista = lista.filter((p) => p.estagio.etapa_atual === etapaFiltro);
    return lista;
  }, [pedidos, filtroAtivo, etapaFiltro]);

  function handleFiltro(key) {
    setFiltroAtivo(key);
    setEtapaFiltro(null);
    const f = consultoraFiltro ? { consultora_id: consultoraFiltro } : {};
    if (key === "atrasados") carregar({ ...f, alerta: "atrasado" });
    else if (key === "todos") carregar(f);
    else carregar({ ...f, status: key });
  }

  function handleEtapaFiltro(numero) {
    const proximo = etapaFiltro === numero ? null : numero;
    setEtapaFiltro(proximo);
    if (filtroAtivo !== "todos") {
      setFiltroAtivo("todos");
      const f = consultoraFiltro ? { consultora_id: consultoraFiltro } : {};
      carregar(f);
    }
  }

  async function handleImportarSalvar(dados, pdfFile) {
    setSalvando(true);
    try {
      const res = await api.post("/pedidos/importar", dados);
      const novo = res.pedido || res;
      if (pdfFile && novo?.id) {
        const fd = new FormData();
        fd.append("arquivo", pdfFile);
        const token = localStorage.getItem("token");
        await fetch(`${API_BASE}/pedidos/${novo.id}/anexo-pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }
      setImportarAberto(false);
      carregar({});
    } catch (e) {
      console.error(e);
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <div className="dp-loading">Carregando pedidos...</div>;
  if (erro)    return <div className="dp-erro">Erro ao carregar: {erro}</div>;

  return (
    <div className="dp-page">
      <div className="dp-header">
        <h1 className="dp-titulo">Pedidos de Venda</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="dp-btn-importar" onClick={() => setImportarAberto(true)}>
            ↑ Importar pedido
          </button>
          {temPermGeral && consultoras.length > 0 && (
            <select
              className="dp-select-consultora"
              value={consultoraFiltro}
              onChange={(e) => {
                const novaConsultora = e.target.value;
                setConsultoraFiltro(novaConsultora);
                const f = novaConsultora ? { consultora_id: novaConsultora } : {};
                if (filtroAtivo === "atrasados") f.alerta = "atrasado";
                else if (filtroAtivo !== "todos") f.status = filtroAtivo;
                carregar(f);
              }}
            >
              <option value="">Todas as consultoras</option>
              {consultoras.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          )}
        </div>
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

      <div className="dp-chips dp-chips-etapas">
        {ETAPA_CONFIG.map((etapa) => (
          <button
            key={etapa.numero}
            className={`dp-chip ${etapaFiltro === etapa.numero ? "dp-chip-ativo" : ""}`}
            onClick={() => handleEtapaFiltro(etapa.numero)}
          >
            {etapa.icone} {etapa.label}
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

      {importarAberto && (
        <ImportarPedidoModal
          onClose={() => setImportarAberto(false)}
          onSalvar={handleImportarSalvar}
          salvando={salvando}
        />
      )}
    </div>
  );
}
