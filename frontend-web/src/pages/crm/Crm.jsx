import { useState, useEffect, useMemo } from "react";
import {
  FaHandshake, FaChartLine, FaCalendarAlt, FaPlus,
  FaFileInvoiceDollar, FaShoppingCart, FaPercentage,
  FaCheckCircle, FaSpinner, FaTrash,
  FaUser, FaPhone, FaClock, FaCheck, FaDollarSign, FaTruck
} from "react-icons/fa";
import { api } from "../../services/api";
import ConfirmModal from "../../components/ConfirmModal";
import useAuth from "../../hooks/useAuth";
import "./Crm.css";

// Formata moeda Real
const fmtReal = (val) => {
  return Number(val || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

// Formata data brasileira
const fmtData = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function Crm() {
  const { user } = useAuth();
  const [ativaTab, setAtivaTab] = useState("dashboard"); // dashboard | orcamentos | financeiro | comissoes | retornos
  const [stats, setStats] = useState(null);
  const [panelData, setPanelData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // States de filtros das abas
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");

  // States de Dados
  const [orcamentos, setOrcamentos] = useState([]);
  const [financeiro, setFinanceiro] = useState([]);
  const [comissoes, setComissoes] = useState([]);
  const [retornos, setRetornos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [arquitetos, setArquitetos] = useState([]);
  const [vendedoras, setVendedoras] = useState([]);

  // Modais
  const [modalOrcamento, setModalOrcamento] = useState(null); // null | 'novo' | orcamento
  const [modalFinanceiro, setModalFinanceiro] = useState(null); // null | 'novo'
  const [modalRetorno, setModalRetorno] = useState(null); // null | 'novo'
  const [confirmDelete, setConfirmDelete] = useState(null); // null | { id, tipo }
  const [salvando, setSalvando] = useState(false);

  // Detalhes selecionados
  const [orcamentoSel, setOrcamentoSel] = useState(null);
  const [finSel, setFinSel] = useState(null);

  // Calendário navigation
  const [currentDate, setCurrentDate] = useState(new Date());

  // Carrega dados para dropdowns
  useEffect(() => {
    api.get("/clientes").then((res) => setClientes(res.clientes || [])).catch(() => {});
    api.get("/fornecedores?status=ativo").then((res) => setFornecedores(res.fornecedores || [])).catch(() => {});
    api.get("/arquitetos").then((res) => setArquitetos(res.arquitetos || [])).catch(() => {});
    api.get("/auth/admin/usuarios").then((res) => setVendedoras(res.usuarios || [])).catch(() => {});
  }, []);

  // Carrega as estatísticas do Dashboard
  const carregarStats = async () => {
    try {
      const res = await api.get("/crm/stats");
      setStats(res.stats);
    } catch (e) {
      console.error(e);
      setErro("Falha ao carregar métricas do CRM.");
    }
  };

  // Carrega dados da barra lateral
  const carregarPainel = async () => {
    try {
      const res = await api.get("/crm/dashboard");
      setPanelData(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  // Carrega todos os dados do CRM dependendo da aba ativa
  const carregarDados = async () => {
    setLoading(true);
    setErro(null);
    try {
      await Promise.all([carregarStats(), carregarPainel()]);

      if (ativaTab === "orcamentos") {
        const res = await api.get("/crm/orcamentos");
        setOrcamentos(res.orcamentos || []);
        if (res.orcamentos?.length > 0 && !orcamentoSel) {
          setOrcamentoSel(res.orcamentos[0]);
        }
      } else if (ativaTab === "financeiro") {
        const res = await api.get("/crm/financeiro");
        setFinanceiro(res.lançamentos || []);
      } else if (ativaTab === "comissoes") {
        const res = await api.get("/crm/comissoes");
        setComissoes(res.comissoes || []);
      } else if (ativaTab === "retornos") {
        const res = await api.get("/crm/retornos");
        setRetornos(res.retornos || []);
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar dados do CRM.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [ativaTab]);

  // Completar / reabrir retorno
  const handleToggleRetorno = async (id) => {
    try {
      await api.patch(`/crm/retornos/${id}/concluir`);
      carregarPainel();
      if (ativaTab === "retornos") {
        const res = await api.get("/crm/retornos");
        setRetornos(res.retornos || []);
      }
    } catch (e) {
      alert("Falha ao alterar status do retorno.");
    }
  };

  // CRUD Orcamentos
  const handleSalvarOrcamento = async (dados) => {
    setSalvando(true);
    try {
      if (modalOrcamento === "novo") {
        const novo = await api.post("/crm/orcamentos", dados);
        setOrcamentos((prev) => [novo.orcamento, ...prev]);
        setOrcamentoSel(novo.orcamento);
      } else {
        const at = await api.put(`/crm/orcamentos/${modalOrcamento.id}`, dados);
        setOrcamentos((prev) => prev.map((o) => (o.id === at.orcamento.id ? at.orcamento : o)));
        setOrcamentoSel(at.orcamento);
      }
      setModalOrcamento(null);
      carregarStats();
    } catch (e) {
      alert(e.message || "Erro ao salvar orçamento.");
    } finally {
      setSalvando(false);
    }
  };

  // Alterar status rápido orçamento
  const handleMudarStatusOrcamento = async (id, status) => {
    try {
      const at = await api.put(`/crm/orcamentos/${id}`, { status });
      setOrcamentos((prev) => prev.map((o) => (o.id === at.orcamento.id ? at.orcamento : o)));
      setOrcamentoSel(at.orcamento);
      carregarStats();
    } catch (e) {
      alert("Falha ao atualizar status do orçamento.");
    }
  };

  // CRUD Financeiro
  const handleSalvarFinanceiro = async (dados) => {
    setSalvando(true);
    try {
      const novo = await api.post("/crm/financeiro", dados);
      setFinanceiro((prev) => [novo.lançamento, ...prev]);
      setModalFinanceiro(null);
      carregarStats();
    } catch (e) {
      alert("Erro ao registrar lançamento financeiro.");
    } finally {
      setSalvando(false);
    }
  };

  // Alterar status financeiro (Pago/Recebido)
  const handlePagarFinanceiro = async (id) => {
    try {
      const lanc = financeiro.find((f) => f.id === id);
      if (!lanc) return;
      const at = await api.put(`/crm/financeiro/${id}`, {
        status: "pago",
        pagamento_em: new Date().toISOString().split("T")[0]
      });
      setFinanceiro((prev) => prev.map((f) => (f.id === at.lançamento.id ? at.lançamento : f)));
      carregarStats();
    } catch (e) {
      alert("Falha ao liquidar conta.");
    }
  };

  // CRUD Retornos
  const handleSalvarRetorno = async (dados) => {
    setSalvando(true);
    try {
      const novo = await api.post("/crm/retornos", dados);
      if (ativaTab === "retornos") {
        setRetornos((prev) => [...prev, novo.retorno]);
      }
      setModalRetorno(null);
      carregarPainel();
    } catch (e) {
      alert("Erro ao programar retorno.");
    } finally {
      setSalvando(false);
    }
  };

  // Excluir geral
  const handleConfirmarExclusao = async () => {
    if (!confirmDelete) return;
    const { id, tipo } = confirmDelete;
    try {
      if (tipo === "orcamento") {
        await api.delete(`/crm/orcamentos/${id}`);
        setOrcamentos((prev) => prev.filter((o) => o.id !== id));
        if (orcamentoSel?.id === id) setOrcamentoSel(null);
      } else if (tipo === "financeiro") {
        await api.delete(`/crm/financeiro/${id}`);
        setFinanceiro((prev) => prev.filter((f) => f.id !== id));
      } else if (tipo === "retorno") {
        await api.delete(`/crm/retornos/${id}`);
        setRetornos((prev) => prev.filter((r) => r.id !== id));
        carregarPainel();
      }
      setConfirmDelete(null);
      carregarStats();
    } catch (e) {
      alert("Erro ao excluir registro.");
    }
  };

  // Navegar métrica do Dashboard para aba específica pré-filtrada
  const navegarParaFiltro = (tab, tipo, status) => {
    setAtivaTab(tab);
    setFiltroTipo(tipo);
    setFiltroStatus(status);
  };

  // Filtros aplicados no frontend para Orçamentos
  const orcamentosFiltrados = useMemo(() => {
    return orcamentos.filter((o) => {
      const matchTipo = filtroTipo ? o.tipo === filtroTipo : true;
      const matchStatus = filtroStatus ? o.status === filtroStatus : true;
      const matchBusca = busca.trim() ? (
        o.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        o.numero.toLowerCase().includes(busca.toLowerCase()) ||
        (o.cliente_nome    || "").toLowerCase().includes(busca.toLowerCase()) ||
        (o.fornecedor_nome || "").toLowerCase().includes(busca.toLowerCase())
      ) : true;
      return matchTipo && matchStatus && matchBusca;
    });
  }, [orcamentos, filtroTipo, filtroStatus, busca]);

  // Filtros aplicados no frontend para Financeiro
  const financeiroFiltrado = useMemo(() => {
    return financeiro.filter((f) => {
      const matchTipo = filtroTipo ? f.tipo === filtroTipo : true;
      const matchStatus = filtroStatus ? f.status === filtroStatus : true;
      const matchBusca = busca.trim() ? f.descricao.toLowerCase().includes(busca.toLowerCase()) : true;
      return matchTipo && matchStatus && matchBusca;
    });
  }, [financeiro, filtroTipo, filtroStatus, busca]);

  // Calendário Computations
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const totalDaysPrev = new Date(year, month, 0).getDate();

    const days = [];

    // Dias do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, totalDaysPrev - i),
        isCurrentMonth: false,
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Dias do mês posterior (para preencher grid de 42 células)
    const nextDaysCount = 42 - days.length;
    for (let i = 1; i <= nextDaysCount; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const navMonth = (offset) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  return (
    <div className="ek-page crm-page">
      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1 style={{ fontFamily: "var(--font-title)", color: "var(--color-primary)", fontWeight: 600 }}>
            CRM & Gestão Adornie
          </h1>
          <p>Métricas de vendas, financeiro, compras e comissões integrados</p>
        </div>
        <div className="ek-head-actions">
          {ativaTab === "orcamentos" && (
            <button className="ek-btn ek-btn-primary" onClick={() => setModalOrcamento("novo")}>
              <FaPlus style={{ marginRight: 6 }} /> Novo Orçamento
            </button>
          )}
          {ativaTab === "financeiro" && (
            <button className="ek-btn ek-btn-primary" onClick={() => setModalFinanceiro(true)}>
              <FaPlus style={{ marginRight: 6 }} /> Lançamento
            </button>
          )}
          {ativaTab === "retornos" && (
            <button className="ek-btn ek-btn-primary" onClick={() => setModalRetorno(true)}>
              <FaPlus style={{ marginRight: 6 }} /> Programar Retorno
            </button>
          )}
        </div>
      </div>

      {/* ABAS (TABS) */}
      <div className="crm-tabs">
        <button className={`crm-tab-btn ${ativaTab === "dashboard" ? "active" : ""}`} onClick={() => setAtivaTab("dashboard")}>
          <FaChartLine /> Painel Geral
        </button>
        <button className={`crm-tab-btn ${ativaTab === "orcamentos" ? "active" : ""}`} onClick={() => { setAtivaTab("orcamentos"); setFiltroTipo(""); setFiltroStatus(""); setBusca(""); }}>
          <FaHandshake /> Orçamentos
        </button>
        <button className={`crm-tab-btn ${ativaTab === "financeiro" ? "active" : ""}`} onClick={() => { setAtivaTab("financeiro"); setFiltroTipo(""); setFiltroStatus(""); setBusca(""); }}>
          <FaFileInvoiceDollar /> Financeiro
        </button>
        <button className={`crm-tab-btn ${ativaTab === "comissoes" ? "active" : ""}`} onClick={() => { setAtivaTab("comissoes"); setFiltroTipo(""); setFiltroStatus(""); setBusca(""); }}>
          <FaPercentage /> Comissões
        </button>
        <button className={`crm-tab-btn ${ativaTab === "retornos" ? "active" : ""}`} onClick={() => { setAtivaTab("retornos"); setFiltroStatus(""); }}>
          <FaCheckCircle /> Retornos
        </button>
      </div>

      {loading && !stats && (
        <div className="ek-empty" style={{ padding: 60 }}>
          <FaSpinner className="spin" style={{ fontSize: 32, color: "var(--color-primary)" }} />
          <p style={{ marginTop: 14 }}>Carregando dados da central CRM...</p>
        </div>
      )}

      {!loading && erro && (
        <div className="cl-erro-banner">
          <span>⚠ {erro}</span>
          <button onClick={() => carregarDados()}>Recarregar</button>
        </div>
      )}

      {/* ── 1. ABA DASHBOARD ── */}
      {ativaTab === "dashboard" && stats && (
        <div className="crm-dashboard-grid">
          
          {/* METRIC PANELS (LEFT) */}
          <div className="crm-metrics-col">
            
            {/* VENDAS */}
            <div className="crm-panel-card">
              <div className="crm-panel-header">
                <span className="crm-panel-title">🛒 Vendas</span>
              </div>
              <div className="crm-panel-content">
                <div className="crm-metric-group">
                  <div className="crm-metric-group-title">Orçamentos</div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("orcamentos", "venda", "novo")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Novos</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.vendas.orcamentos.novos)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("orcamentos", "venda", "perdido")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Perdidos</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.vendas.orcamentos.perdidos)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("orcamentos", "venda", "aprovado")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Diário</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.vendas.orcamentos.diario)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("orcamentos", "venda", "aprovado")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Semanal</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.vendas.orcamentos.semanal)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("orcamentos", "venda", "aprovado")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Mensal</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.vendas.orcamentos.mensal)}</span>
                  </div>
                </div>

                <div className="crm-metric-group">
                  <div className="crm-metric-group-title">Pedidos</div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Novos</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.vendas.pedidos.novos)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Cancelados</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.vendas.pedidos.cancelados)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Diário</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.vendas.pedidos.diario)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Semanal</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.vendas.pedidos.semanal)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Mensal</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.vendas.pedidos.mensal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FINANCEIRO */}
            <div className="crm-panel-card">
              <div className="crm-panel-header">
                <span className="crm-panel-title">💰 Financeiro</span>
              </div>
              <div className="crm-panel-content">
                <div className="crm-metric-group">
                  <div className="crm-metric-group-title">Contas a Receber</div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "receber", "pendente")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Pendentes</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.financeiro.receber.pendentes)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "receber", "vencido")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Vencidos</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.financeiro.receber.vencidos)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "receber", "")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Diário</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.financeiro.receber.diario)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "receber", "")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Semanal</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.financeiro.receber.semanal)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "receber", "")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Mensal</span>
                    <span className="crm-metric-badge crm-badge-blue">{fmtReal(stats.financeiro.receber.mensal)}</span>
                  </div>
                </div>

                <div className="crm-metric-group">
                  <div className="crm-metric-group-title">Contas a Pagar</div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "pagar", "pendente")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Pendentes</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.financeiro.pagar.pendentes)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "pagar", "vencido")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Vencidos</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.financeiro.pagar.vencidos)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "pagar", "")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Diário</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.financeiro.pagar.diario)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "pagar", "")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Semanal</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.financeiro.pagar.semanal)}</span>
                  </div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("financeiro", "pagar", "")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Mensal</span>
                    <span className="crm-metric-badge crm-badge-green">{fmtReal(stats.financeiro.pagar.mensal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COMPRAS */}
            <div className="crm-panel-card">
              <div className="crm-panel-header">
                <span className="crm-panel-title">🛍 Compras</span>
              </div>
              <div className="crm-panel-content">
                <div className="crm-metric-group">
                  <div className="crm-metric-group-title">Orçamentos</div>
                  <div className="crm-metric-row" onClick={() => navegarParaFiltro("orcamentos", "compra", "novo")} style={{ cursor: "pointer" }}>
                    <span className="crm-metric-label">Novos</span>
                    <span className="crm-metric-badge crm-badge-warning">{fmtReal(stats.compras.orcamentos.novos)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Diário</span>
                    <span className="crm-metric-badge crm-badge-warning">{fmtReal(stats.compras.orcamentos.diario)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Semanal</span>
                    <span className="crm-metric-badge crm-badge-warning">{fmtReal(stats.compras.orcamentos.semanal)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Mensal</span>
                    <span className="crm-metric-badge crm-badge-warning">{fmtReal(stats.compras.orcamentos.mensal)}</span>
                  </div>
                </div>

                <div className="crm-metric-group">
                  <div className="crm-metric-group-title">Pedidos</div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Novos</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.compras.pedidos.novos)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Diário</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.compras.pedidos.diario)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Semanal</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.compras.pedidos.semanal)}</span>
                  </div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Mensal</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.compras.pedidos.mensal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COMISSÕES */}
            <div className="crm-panel-card">
              <div className="crm-panel-header">
                <span className="crm-panel-title">🏷 Comissões</span>
              </div>
              <div className="crm-panel-content">
                <div className="crm-metric-group" onClick={() => navegarParaFiltro("comissoes", "colaborador", "pendente")} style={{ cursor: "pointer" }}>
                  <div className="crm-metric-group-title">Colaboradores</div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Pendentes</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.comissoes.colaboradores)}</span>
                  </div>
                </div>

                <div className="crm-metric-group" onClick={() => navegarParaFiltro("comissoes", "vendedor", "pendente")} style={{ cursor: "pointer" }}>
                  <div className="crm-metric-group-title">Vendedores</div>
                  <div className="crm-metric-row">
                    <span className="crm-metric-label">Pendentes</span>
                    <span className="crm-metric-badge crm-badge-red">{fmtReal(stats.comissoes.vendedores)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* WIDGETS COLUMN (RIGHT) */}
          <div className="crm-widgets-col">
            
            {/* RETORNOS */}
            <div className="crm-widget-card">
              <div className="crm-widget-header">
                <span>⚠ Retornos</span>
              </div>
              <div className="crm-retornos-list">
                {panelData?.retornos?.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nenhum retorno pendente.</p>
                ) : (
                  panelData?.retornos?.map((ret) => (
                    <div key={ret.id} className={`crm-retorno-item ${ret.status === "concluido" ? "concluido" : ""}`}>
                      <input
                        type="checkbox"
                        className="crm-retorno-checkbox"
                        checked={ret.status === "concluido"}
                        onChange={() => handleToggleRetorno(ret.id)}
                      />
                      <div className="crm-retorno-body">
                        <div className="crm-retorno-title">{ret.titulo}</div>
                        {ret.descricao && <div className="crm-retorno-desc">{ret.descricao}</div>}
                        <div className="crm-retorno-meta">
                          <span>👤 {ret.cliente_nome || "Sem cliente"}</span>
                          <span>📅 {fmtData(ret.data_retorno)} {ret.hora_retorno && `às ${ret.hora_retorno}`}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PRÓXIMOS AGENDAMENTOS */}
            <div className="crm-widget-card">
              <div className="crm-widget-header">
                <span>📅 Agendamentos</span>
              </div>
              <div className="crm-list-widget">
                {panelData?.agendamentos?.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Sem agendamentos próximos.</p>
                ) : (
                  panelData?.agendamentos?.map((ag) => (
                    <div key={ag.id} className="crm-list-item">
                      <div className="crm-list-item-left">
                        <span className="crm-list-item-title">{ag.titulo}</span>
                        <span className="crm-list-item-sub">👤 {ag.cliente}</span>
                        <span className="crm-list-item-sub">📍 {ag.endereco || "Sem endereço"}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{ag.hora.slice(0, 5)}</span>
                        <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{fmtData(ag.data)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* PEDIDOS RECENTES */}
            <div className="crm-widget-card">
              <div className="crm-widget-header">
                <span>📦 Pedidos</span>
              </div>
              <div className="crm-list-widget">
                {panelData?.pedidos?.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Nenhum pedido recente.</p>
                ) : (
                  panelData?.pedidos?.map((ped) => (
                    <div key={ped.id} className="crm-list-item">
                      <div className="crm-list-item-left">
                        <span className="crm-list-item-title">Pedido #{ped.id}</span>
                        <span className="crm-list-item-sub">👤 {ped.cliente_nome || "Sem cliente"}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 600, color: "#4ade80" }}>{fmtReal(ped.valor_total)}</span>
                        <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Status: {ped.status}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CALENDÁRIO MENSAL */}
            <div className="crm-widget-card">
              <div className="crm-widget-header">
                <FaCalendarAlt style={{ color: "var(--color-primary)" }} />
                <span>Agendamentos</span>
              </div>
              <div className="crm-calendar-container">
                <div className="crm-calendar-header">
                  <span className="crm-calendar-month-title">
                    {currentDate.toLocaleString("pt-BR", { month: "long", year: "numeric" }).toUpperCase()}
                  </span>
                  <div className="crm-calendar-nav">
                    <button className="crm-calendar-nav-btn" onClick={() => navMonth(-1)}>{"<"}</button>
                    <button className="crm-calendar-nav-btn" onClick={() => navMonth(1)}>{">"}</button>
                  </div>
                </div>

                <div className="crm-calendar-grid">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                    <div key={d} className="crm-calendar-day-header">{d}</div>
                  ))}
                  {getCalendarDays().map(({ date, isCurrentMonth }, idx) => {
                    const isToday = new Date().toDateString() === date.toDateString();
                    // Filtra eventos para esse dia
                    const eventosDia = panelData?.calendario?.filter((e) => {
                      const eData = new Date(e.data);
                      // Ajuste timezone para comparação exata de dia
                      return eData.getUTCDate() === date.getDate() &&
                             eData.getUTCMonth() === date.getMonth() &&
                             eData.getUTCFullYear() === date.getFullYear();
                    }) || [];

                    return (
                      <div
                        key={idx}
                        className={`crm-calendar-day-cell ${isCurrentMonth ? "" : "inactive"} ${isToday ? "today" : ""}`}
                      >
                        <span className="crm-calendar-day-number">{date.getDate()}</span>
                        <div className="crm-calendar-events">
                          {eventosDia.map((ev) => (
                            <div key={ev.id} className="crm-calendar-event" title={`${ev.hora.slice(0, 5)} - ${ev.cliente}`}>
                              {ev.hora.slice(0, 5)} {ev.cliente.split(" ")[0]}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ── 2. ABA ORÇAMENTOS ── */}
      {ativaTab === "orcamentos" && (
        <div className="crm-split-layout">
          
          {/* LISTA */}
          <div>
            <div className="ek-toolbar" style={{ marginBottom: 16 }}>
              <div className="ek-toolbar-group" style={{ flex: 1 }}>
                <label>Buscar</label>
                <input
                  type="text"
                  placeholder="Número, cliente ou projeto..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div className="ek-toolbar-group">
                <label>Tipo</label>
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="venda">Vendas</option>
                  <option value="compra">Compras</option>
                </select>
              </div>
              <div className="ek-toolbar-group">
                <label>Status</label>
                <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="novo">Novo</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="perdido">Perdido</option>
                  <option value="recusado">Recusado</option>
                </select>
              </div>
            </div>

            <div className="crm-datatable-container">
              <table className="crm-datatable">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Título / Projeto</th>
                    <th>Cliente</th>
                    <th>Fornecedor</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orcamentosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlignment: "center", padding: 30, color: "var(--color-text-muted)" }}>
                        Nenhum orçamento encontrado.
                      </td>
                    </tr>
                  ) : (
                    orcamentosFiltrados.map((o) => (
                      <tr key={o.id} onClick={() => setOrcamentoSel(o)} style={{ cursor: "pointer" }} className={orcamentoSel?.id === o.id ? "active-row" : ""}>
                        <td style={{ fontWeight: 600, color: "var(--color-primary)" }}>{o.numero}</td>
                        <td>{o.titulo}</td>
                        <td>{o.cliente_nome || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td>
                        <td>{o.fornecedor_nome || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td>
                        <td style={{ textTransform: "capitalize" }}>{o.tipo}</td>
                        <td style={{ fontWeight: 600 }}>{fmtReal(o.valor)}</td>
                        <td>
                          <span className={`crm-metric-badge crm-badge-${o.status === "aprovado" ? "green" : o.status === "perdido" ? "red" : o.status === "novo" ? "blue" : "warning"}`}>
                            {o.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* DETALHES */}
          <div>
            {!orcamentoSel ? (
              <div className="ek-empty" style={{ padding: 40, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
                <p>Selecione um orçamento para ver detalhes.</p>
              </div>
            ) : (
              <div className="crm-details-panel">
                <div className="crm-details-header">
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>{orcamentoSel.numero}</span>
                    <h2 className="crm-details-title">{orcamentoSel.titulo}</h2>
                  </div>
                  <button className="ek-btn" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.2)" }} onClick={() => setConfirmDelete({ id: orcamentoSel.id, tipo: "orcamento" })}>
                    <FaTrash />
                  </button>
                </div>

                <div className="crm-details-body">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <div className="crm-details-section-title">Cliente</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                        <FaUser style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                        <span>{orcamentoSel.cliente_nome || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>Sem cliente</span>}</span>
                      </div>
                    </div>
                    <div>
                      <div className="crm-details-section-title">Fornecedor</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                        <FaTruck style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                        <span>{orcamentoSel.fornecedor_nome || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>Sem fornecedor</span>}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="crm-details-section-title">Valor do Projeto</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{fmtReal(orcamentoSel.valor)}</div>
                  </div>

                  {orcamentoSel.descricao && (
                    <div>
                      <div className="crm-details-section-title">Descrição / Escopo</div>
                      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{orcamentoSel.descricao}</p>
                    </div>
                  )}

                  <div>
                    <div className="crm-details-section-title">Ações de Status</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="ek-btn ek-btn-primary" style={{ flex: 1 }} onClick={() => handleMudarStatusOrcamento(orcamentoSel.id, "aprovado")} disabled={orcamentoSel.status === "aprovado"}>
                        Aprovar
                      </button>
                      <button
                        className="ek-btn"
                        style={{
                          flex: 1,
                          background: orcamentoSel.status === "perdido" ? "var(--color-danger, #c0392b)" : "var(--color-surface-strong)",
                          border: "1px solid var(--color-border)",
                          color: orcamentoSel.status === "perdido" ? "#fff" : undefined,
                        }}
                        onClick={() => handleMudarStatusOrcamento(orcamentoSel.id, orcamentoSel.status === "perdido" ? "novo" : "perdido")}
                      >
                        {orcamentoSel.status === "perdido" ? "Desmarcar Perdido" : "Marcar Perdido"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── 3. ABA FINANCEIRO ── */}
      {ativaTab === "financeiro" && (
        <div>
          <div className="ek-toolbar" style={{ marginBottom: 16 }}>
            <div className="ek-toolbar-group" style={{ flex: 1 }}>
              <label>Buscar Descrição</label>
              <input
                type="text"
                placeholder="Ex: Aluguel, Parcela..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="ek-toolbar-group">
              <label>Fluxo</label>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="">Todos</option>
                <option value="receber">Recebimentos (Contas a Receber)</option>
                <option value="pagar">Pagamentos (Contas a Pagar)</option>
              </select>
            </div>
            <div className="ek-toolbar-group">
              <label>Status</label>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="vencido">Vencido</option>
                <option value="pago">Pago</option>
              </select>
            </div>
          </div>

          <div className="crm-datatable-container">
            <table className="crm-datatable">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Fluxo</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {financeiroFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlignment: "center", padding: 30, color: "var(--color-text-muted)" }}>
                      Nenhum lançamento financeiro registrado.
                    </td>
                  </tr>
                ) : (
                  financeiroFiltrado.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.descricao}</div>
                        {f.fornecedor_nome && (
                          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                            Fornecedor: {f.fornecedor_nome}
                          </div>
                        )}
                      </td>
                      <td style={{ textTransform: "capitalize", color: f.tipo === "receber" ? "#60a5fa" : "#4ade80" }}>
                        {f.tipo === "receber" ? "Contas a Receber" : "Contas a Pagar"}
                      </td>
                      <td style={{ fontWeight: 700, color: f.tipo === "receber" ? "#60a5fa" : "#4ade80" }}>
                        {f.tipo === "receber" ? "+" : "-"} {fmtReal(f.valor)}
                      </td>
                      <td>{fmtData(f.vencimento_em)}</td>
                      <td>
                        <span className={`crm-metric-badge crm-badge-${f.status === "pago" ? "green" : f.status === "vencido" ? "red" : "blue"}`}>
                          {f.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {f.status !== "pago" && (
                            <button className="cl-icon-btn" title="Liquidar/Receber" onClick={() => handlePagarFinanceiro(f.id)}>
                              <FaCheck style={{ color: "#4ade80" }} />
                            </button>
                          )}
                          <button className="cl-icon-btn danger" title="Remover" onClick={() => setConfirmDelete({ id: f.id, tipo: "financeiro" })}>
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. ABA COMISSÕES ── */}
      {ativaTab === "comissoes" && (
        <div>
          <div className="crm-datatable-container">
            <table className="crm-datatable">
              <thead>
                <tr>
                  <th>Nome do Colaborador / Vendedor</th>
                  <th>Tipo</th>
                  <th>Comissão Devida</th>
                  <th>Escopo / Descrição</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {comissoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlignment: "center", padding: 30, color: "var(--color-text-muted)" }}>
                      Nenhuma comissão cadastrada.
                    </td>
                  </tr>
                ) : (
                  comissoes.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.colaborador_nome}</td>
                      <td style={{ textTransform: "capitalize" }}>{c.tipo}</td>
                      <td style={{ fontWeight: 700, color: "var(--color-primary)" }}>{fmtReal(c.valor)}</td>
                      <td>{c.descricao || "Comissão de fechamento contratual"}</td>
                      <td>
                        <span className={`crm-metric-badge crm-badge-${c.status === "pago" ? "green" : "red"}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 5. ABA RETORNOS ── */}
      {ativaTab === "retornos" && (
        <div>
          <div className="crm-datatable-container">
            <table className="crm-datatable">
              <thead>
                <tr>
                  <th>Tarefa de Retorno</th>
                  <th>Cliente</th>
                  <th>Descrição</th>
                  <th>Data Planejada</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {retornos.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlignment: "center", padding: 30, color: "var(--color-text-muted)" }}>
                      Nenhum retorno agendado.
                    </td>
                  </tr>
                ) : (
                  retornos.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.titulo}</td>
                      <td>
                        <div>{r.cliente_nome}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{r.cliente_telefone}</div>
                      </td>
                      <td>{r.descricao || "Sem observações adicionais."}</td>
                      <td>{fmtData(r.data_retorno)} {r.hora_retorno && `às ${r.hora_retorno}`}</td>
                      <td>
                        <span className={`crm-metric-badge crm-badge-${r.status === "concluido" ? "green" : "blue"}`}>
                          {r.status === "concluido" ? "CONCLUÍDO" : "PENDENTE"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="cl-icon-btn" title="Toggle Concluir" onClick={() => handleToggleRetorno(r.id)}>
                            <FaCheck />
                          </button>
                          <button className="cl-icon-btn danger" title="Remover" onClick={() => setConfirmDelete({ id: r.id, tipo: "retorno" })}>
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        open={confirmDelete !== null}
        titulo="Confirmar Remoção"
        mensagem="Tem certeza absoluta que deseja remover este item? Esta ação apagará permanentemente o registro."
        labelConfirm="Excluir"
        variante="danger"
        onConfirm={handleConfirmarExclusao}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ── MODAL: NOVO ORÇAMENTO ── */}
      {modalOrcamento && (
        <OrcamentoModal
          orcamento={modalOrcamento === "novo" ? null : modalOrcamento}
          clientes={clientes}
          fornecedores={fornecedores}
          arquitetos={arquitetos}
          vendedoras={vendedoras}
          onClose={() => setModalOrcamento(null)}
          onSalvar={handleSalvarOrcamento}
          salvando={salvando}
        />
      )}

      {/* ── MODAL: NOVO LANÇAMENTO FINANCEIRO ── */}
      {modalFinanceiro && (
        <FinanceiroModal
          fornecedores={fornecedores}
          onClose={() => setModalFinanceiro(null)}
          onSalvar={handleSalvarFinanceiro}
          salvando={salvando}
        />
      )}

      {/* ── MODAL: PROGRAMAR RETORNO ── */}
      {modalRetorno && (
        <RetornoModal
          clientes={clientes}
          onClose={() => setModalRetorno(null)}
          onSalvar={handleSalvarRetorno}
          salvando={salvando}
        />
      )}

    </div>
  );
}

// ── AUX COMPONENT: ORCAMENTO MODAL ──
function OrcamentoModal({ onClose, onSalvar, clientes, fornecedores, arquitetos, vendedoras, salvando }) {
  const [form, setForm] = useState({
    cliente_id: "", fornecedor_id: "", tipo: "venda",
    titulo: "", descricao: "", valor: "", status: "novo",
    arquiteto_id: "", vendedora_id: "",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const salvar = () => {
    if (!form.titulo || !form.valor) return alert("Título e Valor são obrigatórios.");
    onSalvar({
      ...form,
      cliente_id:    form.cliente_id    ? Number(form.cliente_id)    : null,
      fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
      arquiteto_id:  form.arquiteto_id  ? Number(form.arquiteto_id)  : null,
      vendedora_id:  form.vendedora_id  ? Number(form.vendedora_id)  : null,
      valor: Number(form.valor),
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: "var(--font-title)", color: "var(--color-primary)" }}>Novo Orçamento</h2>
            <p>Registre uma nova cotação de venda ou compra</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                <option value="venda">Vendas (Orçamento de Cliente)</option>
                <option value="compra">Compras (Pedido Fornecedor)</option>
              </select>
            </div>
            <div className="ag-form-field">
              <label>Status Inicial</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="novo">Novo</option>
                <option value="aprovado">Aprovado</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>Cliente</label>
              <select value={form.cliente_id} onChange={(e) => set("cliente_id", e.target.value)}>
                <option value="">— Sem cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="ag-form-field">
              <label>Fornecedor</label>
              <select value={form.fornecedor_id} onChange={(e) => set("fornecedor_id", e.target.value)}>
                <option value="">— Sem fornecedor —</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          {form.tipo === "venda" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="ag-form-field">
                <label>Arquiteto</label>
                <select value={form.arquiteto_id} onChange={(e) => set("arquiteto_id", e.target.value)}>
                  <option value="">— Sem arquiteto —</option>
                  {arquitetos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
              <div className="ag-form-field">
                <label>Vendedora</label>
                <select value={form.vendedora_id} onChange={(e) => set("vendedora_id", e.target.value)}>
                  <option value="">— Sem vendedora —</option>
                  {vendedoras.map((u) => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="ag-form-field">
            <label>Título / Projeto</label>
            <input type="text" placeholder="Ex: Toldos motorizados gourmet" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>Valor estimado (R$)</label>
              <input type="number" placeholder="Ex: 50000.00" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
            </div>
          </div>

          <div className="ag-form-field">
            <label>Escopo / Detalhes</label>
            <textarea placeholder="Detalhes do projeto..." rows={3} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Processando..." : "Criar Orçamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AUX COMPONENT: FINANCEIRO MODAL ──
function FinanceiroModal({ onClose, onSalvar, fornecedores, salvando }) {
  const [form, setForm] = useState({
    descricao: "",
    tipo: "receber",
    valor: "",
    status: "pendente",
    fornecedor_id: "",
    vencimento_em: new Date().toISOString().split("T")[0]
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const salvar = () => {
    if (!form.descricao || !form.valor || !form.vencimento_em) return alert("Preencha todos os campos obrigatórios.");
    onSalvar({
      ...form,
      valor: Number(form.valor),
      fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: "var(--font-title)", color: "var(--color-primary)" }}>Registrar Lançamento</h2>
            <p>Lance uma conta a pagar ou conta a receber</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ag-form-field">
            <label>Descrição do Lançamento</label>
            <input type="text" placeholder="Ex: Parcela 2/3 toldos" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>Tipo de Lançamento</label>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                <option value="receber">Recebimento (Crédito)</option>
                <option value="pagar">Pagamento (Débito)</option>
              </select>
            </div>
            <div className="ag-form-field">
              <label>Valor (R$)</label>
              <input type="number" placeholder="Ex: 1500.00" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>Data de Vencimento</label>
              <input type="date" value={form.vencimento_em} onChange={(e) => set("vencimento_em", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="pago">Liquidado/Pago</option>
              </select>
            </div>
          </div>

          {form.tipo === "pagar" && (
            <div className="ag-form-field">
              <label>Fornecedor (opcional)</label>
              <select value={form.fornecedor_id} onChange={(e) => set("fornecedor_id", e.target.value)}>
                <option value="">— Sem fornecedor —</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Lançando..." : "Confirmar Lançamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AUX COMPONENT: RETORNO MODAL ──
function RetornoModal({ onClose, onSalvar, clientes, salvando }) {
  const [form, setForm] = useState({
    cliente_id: "",
    titulo: "",
    descricao: "",
    data_retorno: new Date().toISOString().split("T")[0],
    hora_retorno: "09:00"
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const salvar = () => {
    if (!form.titulo || !form.cliente_id) return alert("Título e Cliente são obrigatórios.");
    onSalvar({ ...form, cliente_id: Number(form.cliente_id) });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: "var(--font-title)", color: "var(--color-primary)" }}>Agendar Retorno</h2>
            <p>Programe um lembrete para entrar em contato com o lead/cliente</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ag-form-field">
            <label>Cliente</label>
            <select value={form.cliente_id} onChange={(e) => set("cliente_id", e.target.value)}>
              <option value="">— Selecione o cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div className="ag-form-field">
            <label>Tarefa de Retorno</label>
            <input type="text" placeholder="Ex: Ligar para confirmar medidas das cortinas" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>Data de Retorno</label>
              <input type="date" value={form.data_retorno} onChange={(e) => set("data_retorno", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Horário</label>
              <input type="time" value={form.hora_retorno} onChange={(e) => set("hora_retorno", e.target.value)} />
            </div>
          </div>

          <div className="ag-form-field">
            <label>Instruções / Notas</label>
            <textarea placeholder="Notas adicionais sobre o que falar com o cliente..." rows={3} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Agendando..." : "Confirmar Lembrete"}
          </button>
        </div>
      </div>
    </div>
  );
}
