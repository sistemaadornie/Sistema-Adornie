import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import usePedidos from "./hooks/usePedidos";
import ConfirmModal from "../../components/ConfirmModal";
import PedidoPrint from "./PedidoPrint";
import ImportarPedidoModal from "./ImportarPedidoModal";
import ModalSelecionarItensInstalacao from "./ModalSelecionarItensInstalacao";
import { api, API_BASE } from "../../services/api";
import MidiasGaleria from "../../components/MidiasGaleria";
import "./Pedidos.css";

const STATUS_META = {
  pendente:     { label: "Pendente",     cor: "#f59e0b" },
  em_andamento: { label: "Em andamento", cor: "#3b82f6" },
  concluido:    { label: "Concluído",    cor: "#22c55e" },
  cancelado:    { label: "Cancelado",    cor: "#ef4444" },
};
const STATUS_OPCOES = Object.entries(STATUS_META).map(([value, { label }]) => ({ value, label }));
const UNIDADES = ["M2", "ML", "UN", "PÇ"];
const FORMAS_PAGAMENTO = ["PIX / DEPÓSITO", "CONTRA ENTREGA", "CARTÃO DE CRÉDITO", "BOLETO", "DINHEIRO", "CHEQUE"];

function fmtData(iso) {
  if (!iso) return "";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoeda(v) {
  if (v == null || v === "") return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cor: "#94a3b8" };
  return (
    <span
      className="pd-status-badge"
      style={{ background: `${meta.cor}22`, color: meta.cor, borderColor: `${meta.cor}44` }}
    >
      {meta.label}
    </span>
  );
}

function itemVazio() {
  return { ambiente: "", referencia: "", cor: "", descricao: "", medidas: "", quantidade: 1, unidade: "UN", preco_unitario: "", valor: "", item_vinculado_idx: null };
}
function pagVazio() {
  return { forma: "PIX / DEPÓSITO", parcela: "1/1", vencimento: "", valor: "" };
}
function ehCortina(descricao = "", referencia = "") {
  const d = String(descricao || "").toLowerCase();
  const r = String(referencia || "").toLowerCase();
  return d.includes("cortina") || r.includes("cortina");
}

export default function Pedidos() {
  const { pedidos, loading, erro, carregar, criar, atualizar, excluir, importar } = usePedidos();

  const [busca,         setBusca]         = useState("");
  const [filtroStatus,  setFiltroStatus]  = useState("");
  const [pedidoDetalhe,     setPedidoDetalhe]     = useState(null);
  const [pedidoFull,        setPedidoFull]        = useState(null);
  const [loadingDetalhe,    setLoadingDetalhe]    = useState(false);
  const [modalPedido,       setModalPedido]       = useState(null);
  const [salvando,      setSalvando]      = useState(false);
  const [toast,         setToast]         = useState({ texto: "", tipo: "" });
  const [, setExcluindoId] = useState(null);
  const [confirmId,     setConfirmId]     = useState(null);
  const [printPedido,   setPrintPedido]   = useState(null);
  const [importarAberto, setImportarAberto] = useState(false);
  const [instalacaoPedido, setInstalacaoPedido] = useState(null);
  const navigate = useNavigate();
  const detalheRef = useRef(null);

  function mostrarToast(texto, tipo = "success") {
    setToast({ texto, tipo });
    setTimeout(() => setToast({ texto: "", tipo: "" }), 3500);
  }

  const pedidosFiltrados = useMemo(() => {
    let lista = pedidos;
    if (filtroStatus) lista = lista.filter((p) => p.status === filtroStatus);
    if (busca.trim()) {
      const b = busca.toLowerCase();
      lista = lista.filter(
        (p) =>
          (p.numero || "").toLowerCase().includes(b) ||
          (p.cliente_nome || "").toLowerCase().includes(b) ||
          (p.numero_origem || "").toLowerCase().includes(b)
      );
    }
    return lista;
  }, [pedidos, busca, filtroStatus]);

  const pedidoDetalheAtual = useMemo(
    () => pedidos.find((p) => p.id === pedidoDetalhe?.id) || null,
    [pedidos, pedidoDetalhe]
  );

  useEffect(() => {
    if (pedidoDetalheAtual?.id && window.innerWidth < 900) {
      detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pedidoDetalheAtual?.id]);

  async function selecionarPedido(p) {
    setPedidoDetalhe(p);
    setPedidoFull(null);
    setLoadingDetalhe(true);
    try {
      const res = await api.get(`/pedidos/${p.id}`);
      setPedidoFull(res.pedido);
    } catch (_) {
      setPedidoFull(p);
    } finally {
      setLoadingDetalhe(false);
    }
  }

  async function handleSalvar(dados) {
    setSalvando(true);
    try {
      if (modalPedido === "novo") {
        const novo = await criar(dados);
        mostrarToast("Pedido criado com sucesso!");
        setModalPedido(null);
        setPedidoDetalhe(novo);
      } else {
        await atualizar(modalPedido.id, dados);
        mostrarToast("Pedido atualizado!");
        setModalPedido(null);
      }
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar pedido.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    const id = confirmId;
    setConfirmId(null);
    setExcluindoId(id);
    try {
      await excluir(id);
      if (pedidoDetalhe?.id === id) setPedidoDetalhe(null);
      mostrarToast("Pedido removido.");
    } catch (e) {
      mostrarToast(e.message || "Erro ao remover.", "error");
    } finally {
      setExcluindoId(null);
    }
  }

  async function handleImportarSalvar(dados, pdfFile) {
    setSalvando(true);
    try {
      const novo = await importar(dados);
      if (pdfFile && novo?.id) {
        try {
          const fd = new FormData();
          fd.append("arquivo", pdfFile);
          await api.post(`/pedidos/${novo.id}/anexo-pdf`, fd, true);
        } catch (_) {}
      }
      setImportarAberto(false);
      mostrarToast("Pedido importado com sucesso!");
      await selecionarPedido(novo);
    } catch (e) {
      mostrarToast(e.message || "Erro ao importar.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function handleGerarOS(itemId) {
    try {
      const res = await api.post("/os", { pedido_item_id: itemId });
      navigate(`/pedidos/os/${res.id}`);
    } catch (e) {
      mostrarToast(e.response?.data?.message || e.message || "Erro ao gerar OS.", "error");
    }
  }

  async function handleAbrirPdf(pedidoId) {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/pedidos/${pedidoId}/anexo-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) { mostrarToast("PDF não encontrado.", "error"); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (_) {
      mostrarToast("Erro ao abrir PDF.", "error");
    }
  }

  async function handleRemoverPdf(pedidoId) {
    if (!window.confirm("Remover o PDF original vinculado a este pedido?")) return;
    try {
      await api.delete(`/pedidos/${pedidoId}/anexo-pdf`);
      mostrarToast("PDF removido.");
      const res = await api.get(`/pedidos/${pedidoId}`);
      setPedidoFull(res.pedido);
    } catch (e) {
      mostrarToast(e.message || "Erro ao remover PDF.", "error");
    }
  }

  return (
    <div className="ek-page">

      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Pedidos de Venda</h1>
          <p>Gerencie os pedidos dos clientes</p>
        </div>
        <div className="ek-head-actions">
          <button className="ek-btn ek-btn-secondary" onClick={() => setImportarAberto(true)}>
            ↑ Importar pedidos
          </button>
          <button className="ek-btn ek-btn-primary" onClick={() => setModalPedido("novo")}>
            + Novo pedido
          </button>
        </div>
      </div>

      <div className="ek-toolbar" style={{ marginBottom: 20 }}>
        <div className="ek-toolbar-group" style={{ flex: 1 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Número, cliente ou origem..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="ek-toolbar-group">
          <label>Status</label>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_OPCOES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="ek-toolbar-group" style={{ alignSelf: "flex-end" }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="pd-layout">
        <div className="pd-lista">
          {loading && (
            <div className="ek-empty" style={{ padding: 40 }}>
              <div className="pd-spinner" />
              <p style={{ color: "var(--color-text-muted)", marginTop: 14 }}>Carregando pedidos...</p>
            </div>
          )}

          {!loading && erro && (
            <div className="cl-erro-banner">
              <span>⚠ {erro}</span>
              <button onClick={() => carregar()}>Tentar novamente</button>
            </div>
          )}

          {!loading && !erro && pedidosFiltrados.length === 0 && (
            <div className="ek-empty" style={{ padding: 40 }}>
              <div className="ek-empty-icon">📋</div>
              <p style={{ color: "var(--color-text-muted)" }}>
                {busca || filtroStatus ? "Nenhum pedido encontrado." : "Nenhum pedido cadastrado ainda."}
              </p>
            </div>
          )}

          {pedidosFiltrados.map((p) => {
            const isAtivo = pedidoDetalheAtual?.id === p.id;
            return (
              <div key={p.id} className={`pd-card${isAtivo ? " active" : ""}`} onClick={() => selecionarPedido(p)}>
                <div className="pd-card-top">
                  <span className="pd-card-numero">{p.numero}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="pd-card-cliente">
                  {p.cliente_nome
                    ? `👤 ${p.cliente_nome}`
                    : <span style={{ color: "var(--color-text-muted)" }}>Sem cliente</span>}
                </div>
                {p.consultor_nome && (
                  <div className="pd-card-consultor">🧑‍💼 {p.consultor_nome}</div>
                )}
                {p.total != null && (
                  <div className="pd-card-total">R$ {fmtMoeda(p.total)}</div>
                )}
                <div className="pd-card-data">{fmtData(p.data_pedido || p.created_at)}</div>
              </div>
            );
          })}
        </div>

        <div className="pd-detalhe" ref={detalheRef}>
          {!pedidoDetalheAtual ? (
            <div className="ek-empty" style={{ padding: 60 }}>
              <div className="ek-empty-icon">👈</div>
              <p style={{ color: "var(--color-text-muted)" }}>Selecione um pedido para ver os detalhes</p>
            </div>
          ) : loadingDetalhe ? (
            <div className="ek-empty" style={{ padding: 60 }}>
              <div className="pd-spinner" />
            </div>
          ) : (
            <DetalhePedido
              pedido={pedidoFull || pedidoDetalheAtual}
              onEditar={() => setModalPedido(pedidoFull || pedidoDetalheAtual)}
              onExcluir={() => setConfirmId(pedidoDetalheAtual.id)}
              onImprimir={() => setPrintPedido(pedidoFull || pedidoDetalheAtual)}
              onGerarOS={handleGerarOS}
              onAbrirOS={(id) => navigate(`/pedidos/os/${id}`)}
              onAgendarInstalacao={() => setInstalacaoPedido(pedidoFull || pedidoDetalheAtual)}
              onAbrirPdf={() => handleAbrirPdf((pedidoFull || pedidoDetalheAtual).id)}
              onRemoverPdf={() => handleRemoverPdf((pedidoFull || pedidoDetalheAtual).id)}
            />
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmId !== null}
        titulo="Excluir pedido"
        mensagem="Esta ação não pode ser desfeita. Deseja realmente excluir este pedido?"
        labelConfirm="Excluir"
        variante="danger"
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirmId(null)}
      />

      {toast.texto && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 9999,
          padding: "12px 18px", borderRadius: "var(--radius-md)",
          background: "var(--color-surface-strong)", border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-medium)", fontSize: 13, fontWeight: 500,
          color: "var(--color-text)", maxWidth: 360,
          borderLeft: `3px solid ${toast.tipo === "error" ? "#ef4444" : "#22c55e"}`,
        }}>
          {toast.texto}
        </div>
      )}

      {modalPedido && (
        <PedidoModal
          pedido={modalPedido === "novo" ? null : modalPedido}
          onClose={() => setModalPedido(null)}
          onSalvar={handleSalvar}
          salvando={salvando}
        />
      )}

      {printPedido && (
        <PedidoPrint pedido={printPedido} onClose={() => setPrintPedido(null)} />
      )}

      {importarAberto && (
        <ImportarPedidoModal
          onClose={() => setImportarAberto(false)}
          onSalvar={handleImportarSalvar}
          salvando={salvando}
        />
      )}

      {instalacaoPedido && (
        <ModalSelecionarItensInstalacao
          pedido={instalacaoPedido}
          onClose={() => setInstalacaoPedido(null)}
          onContinuar={(itensSelecionados) => {
            const p = instalacaoPedido;
            setInstalacaoPedido(null);
            navigate("/agendamentos", {
              state: {
                novoInstalacao: {
                  pedido_id: p.id,
                  pedido_numero: p.numero,
                  cliente: p.cliente_nome || "",
                  cep: p.cep,
                  rua: p.rua,
                  numero: p.numero_rua,
                  complemento: p.complemento,
                  bairro: p.bairro,
                  cidade: p.cidade,
                  estado: p.estado,
                  itens: itensSelecionados,
                },
              },
            });
          }}
        />
      )}

    </div>
  );
}

/* ── DETALHE DO PEDIDO ── */
function DetalhePedido({ pedido, onEditar, onExcluir, onImprimir, onGerarOS, onAbrirOS, onAgendarInstalacao, onAbrirPdf, onRemoverPdf }) {
  return (
    <div className="pd-detalhe-inner">
      <div className="pd-detalhe-header">
        <div style={{ flex: 1 }}>
          <div className="pd-detalhe-numero">{pedido.numero}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatusBadge status={pedido.status} />
            {pedido.data_pedido && (
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {fmtData(pedido.data_pedido)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={onImprimir}>
            🖨 Imprimir
          </button>
          <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={onEditar}>
            ✏ Editar
          </button>
          <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={onAgendarInstalacao}>
            📅 Agendar Instalação
          </button>
          {pedido.tem_anexo_pdf && (
            <>
              <button
                className="ek-btn ek-btn-secondary"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={onAbrirPdf}
              >
                📄 PDF Original
              </button>
              <button
                className="ek-btn"
                style={{ fontSize: 12, padding: "6px 12px", background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                onClick={onRemoverPdf}
                title="Remover PDF vinculado"
              >
                🗑 PDF
              </button>
            </>
          )}
          <button className="ek-btn" style={{ fontSize: 12, padding: "6px 12px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }} onClick={onExcluir}>
            🗑
          </button>
        </div>
      </div>

      <div className="pd-detalhe-body">

        {/* Cliente */}
        <div className="pd-detalhe-section">
          <div className="cl-section-title">Cliente</div>
          <div className="pd-info-card">
            <div className="pd-info-nome">{pedido.cliente_nome || <em style={{ color: "var(--color-text-muted)" }}>Sem cliente</em>}</div>
            {pedido.cpf_cnpj && <div className="pd-info-sub">CPF/CNPJ: {pedido.cpf_cnpj}</div>}
            {pedido.cliente_telefone && <div className="pd-info-sub">📱 {pedido.cliente_telefone}</div>}
            {pedido.email_cliente && <div className="pd-info-sub">✉ {pedido.email_cliente}</div>}
          </div>
        </div>

        {/* Consultor + Arquiteto */}
        {(pedido.consultor_nome || pedido.arquiteto_nome) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {pedido.consultor_nome && (
              <div className="pd-detalhe-section">
                <div className="cl-section-title">Consultor(a)</div>
                <div className="pd-info-card">
                  <div className="pd-info-nome">{pedido.consultor_nome}</div>
                </div>
              </div>
            )}
            {pedido.arquiteto_nome && (
              <div className="pd-detalhe-section">
                <div className="cl-section-title">Arquiteto</div>
                <div className="pd-info-card">
                  <div className="pd-info-nome">{pedido.arquiteto_nome}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Endereço */}
        {pedido.endereco && (
          <div className="pd-detalhe-section">
            <div className="cl-section-title">Endereço de Entrega</div>
            <p className="pd-texto">{pedido.endereco}</p>
          </div>
        )}

        {/* Itens */}
        {pedido.itens?.length > 0 && (() => {
          // Monta árvore: pai → [filhos]
          const idSet = new Set(pedido.itens.map(it => it.id));
          const filhosPorPai = {};
          for (const it of pedido.itens) {
            const paiId = it.vinculos?.[0]?.item_vinculado_id;
            if (paiId && idSet.has(paiId)) {
              if (!filhosPorPai[paiId]) filhosPorPai[paiId] = [];
              filhosPorPai[paiId].push(it);
            }
          }
          const idsFilhos = new Set(Object.values(filhosPorPai).flat().map(it => it.id));
          const itensOrdenados = [];
          let seq = 1;
          for (const pai of pedido.itens.filter(it => !idsFilhos.has(it.id))) {
            itensOrdenados.push({ item: pai, nivel: 0, seq: seq++ });
            for (const filho of (filhosPorPai[pai.id] || [])) {
              itensOrdenados.push({ item: filho, nivel: 1, seq: seq++ });
            }
          }

          return (
            <div className="pd-detalhe-section">
              <div className="cl-section-title">Itens do Pedido</div>
              <div className="pd-itens-table-wrap">
                <table className="pd-itens-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ambiente</th>
                      <th>Referência</th>
                      <th>Cor</th>
                      <th>Produto</th>
                      <th>Medidas</th>
                      <th>Qtde</th>
                      <th>Un</th>
                      <th>Preço</th>
                      <th>Total</th>
                      <th>Ficha OS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensOrdenados.map(({ item: it, nivel, seq: s }) => (
                      <tr key={it.id} className={nivel > 0 ? "pd-item-filho" : ""}>
                        <td>
                          {nivel > 0 && <span className="pd-item-indent">└─</span>}
                          {s}
                        </td>
                        <td>{it.ambiente || "—"}</td>
                        <td>{it.referencia || "—"}</td>
                        <td>{it.cor || "—"}</td>
                        <td>{it.descricao}</td>
                        <td>{it.medidas || "—"}</td>
                        <td>{it.quantidade}</td>
                        <td>{it.unidade || "—"}</td>
                        <td>{it.preco_unitario != null ? `R$ ${fmtMoeda(it.preco_unitario)}` : "—"}</td>
                        <td style={{ fontWeight: 600 }}>{it.valor != null ? `R$ ${fmtMoeda(it.valor)}` : "—"}</td>
                        <td>
                          {ehCortina(it.descricao, it.referencia) ? (
                            it.os_id ? (
                              <button
                                onClick={() => onAbrirOS(it.os_id)}
                                className="ek-btn"
                                style={{
                                  fontSize: 11,
                                  padding: "4px 8px",
                                  background: it.os_status === "aberta" ? "#fef3c7" : "#d1fae5",
                                  color: it.os_status === "aberta" ? "#d97706" : "#065f46",
                                  border: `1px solid ${it.os_status === "aberta" ? "#fcd34d" : "#6ee7b7"}`,
                                  fontWeight: 600
                                }}
                              >
                                {it.os_status === "aberta" ? "📋 OS: Aberta" : "✅ OS: Preenchida"}
                              </button>
                            ) : (
                              <button
                                onClick={() => onGerarOS(it.id)}
                                className="ek-btn ek-btn-secondary"
                                style={{ fontSize: 11, padding: "4px 8px" }}
                              >
                                📋 Gerar OS
                              </button>
                            )
                          ) : (
                            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Totais */}
        {pedido.total != null && (
          <div className="pd-totais-box">
            {pedido.subtotal != null && (
              <div className="pd-totais-row"><span>SubTotal</span><span>R$ {fmtMoeda(pedido.subtotal)}</span></div>
            )}
            {pedido.desconto > 0 && (
              <div className="pd-totais-row desconto"><span>Desconto</span><span>- R$ {fmtMoeda(pedido.desconto)}</span></div>
            )}
            <div className="pd-totais-row total"><span>Total</span><span>R$ {fmtMoeda(pedido.total)}</span></div>
          </div>
        )}

        {/* Pagamentos */}
        {pedido.pagamentos?.length > 0 && (
          <div className="pd-detalhe-section">
            <div className="cl-section-title">Forma de Pagamento</div>
            <div className="pd-pagamentos-list">
              {Object.entries(
                pedido.pagamentos.reduce((acc, pg) => {
                  if (!acc[pg.forma]) acc[pg.forma] = [];
                  acc[pg.forma].push(pg);
                  return acc;
                }, {})
              ).map(([forma, pgs]) => (
                <div key={forma} className="pd-pagamento-grupo">
                  <div className="pd-pagamento-forma">{forma}</div>
                  {pgs.map((pg, i) => (
                    <div key={i} className="pd-pagamento-row">
                      <span>{pg.parcela}</span>
                      <span>{fmtData(pg.vencimento)}</span>
                      <span style={{ fontWeight: 600 }}>R$ {fmtMoeda(pg.valor)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observações */}
        {pedido.observacoes_entrega && (
          <div className="pd-detalhe-section">
            <div className="cl-section-title">Previsão de Entrega</div>
            <p className="pd-texto">{pedido.observacoes_entrega}</p>
          </div>
        )}
        {pedido.observacoes && (
          <div className="pd-detalhe-section">
            <div className="cl-section-title">Observações</div>
            <p className="pd-texto">{pedido.observacoes}</p>
          </div>
        )}

        <div className="pd-detalhe-section">
          <div className="cl-section-title">Mídias (fotos e vídeos)</div>
          <MidiasGaleria pedidoId={pedido.id} token={localStorage.getItem("token")} />
        </div>

      </div>
    </div>
  );
}

/* ── MODAL: PEDIDO COMPLETO ── */
function PedidoModal({ pedido, onClose, onSalvar, salvando }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    cliente_id:          pedido?.cliente_id          ?? "",
    cpf_cnpj:            pedido?.cpf_cnpj            ?? "",
    email_cliente:       pedido?.email_cliente        ?? "",
    status:              pedido?.status              ?? "pendente",
    data_pedido:         pedido?.data_pedido ? pedido.data_pedido.slice(0, 10) : hoje,
    consultor_id:        pedido?.consultor_id        ?? "",
    arquiteto_id:        pedido?.arquiteto_id        ?? "",
    descricao:           pedido?.descricao           ?? "",
    observacoes:         pedido?.observacoes         ?? "",
    observacoes_entrega: pedido?.observacoes_entrega ?? "",
    cep:                 pedido?.cep                 ?? "",
    rua:                 pedido?.rua                 ?? "",
    numero:              pedido?.numero_rua          ?? pedido?.numero ?? "",
    complemento:         pedido?.complemento         ?? "",
    bairro:              pedido?.bairro              ?? "",
    cidade:              pedido?.cidade              ?? "",
    estado:              pedido?.estado              ?? "",
    subtotal:            pedido?.subtotal            ?? "",
    desconto:            pedido?.desconto            ?? "",
    total:               pedido?.total               ?? "",
  });
  const [itens, setItens] = useState(() => {
    if (!pedido?.itens?.length) return [itemVazio()];
    return pedido.itens.map((it, _, arr) => {
      const vinculoId = it.vinculos?.[0]?.item_vinculado_id ?? null;
      const vinculoIdx = vinculoId != null ? arr.findIndex(other => other.id === vinculoId) : -1;
      return { ...it, item_vinculado_idx: vinculoIdx >= 0 ? vinculoIdx : null };
    });
  });
  const [pagamentos, setPagamentos] = useState(pedido?.pagamentos?.length ? pedido.pagamentos.map(pg => ({ ...pg, vencimento: pg.vencimento ? pg.vencimento.slice(0, 10) : "" })) : [pagVazio()]);

  const [clientes,     setClientes]     = useState([]);
  const [consultores,  setConsultores]  = useState([]);
  const [arquitetos,   setArquitetos]   = useState([]);
  const [buscandoCEP,  setBuscandoCEP]  = useState(false);
  const [abaAtiva,     setAbaAtiva]     = useState("dados");

  useEffect(() => {
    api.get("/clientes").then((r) => setClientes(r.clientes || [])).catch(() => {});
    api.get("/auth/admin/usuarios").then((r) => setConsultores((r.usuarios || []).filter((u) => u.status === "aprovado"))).catch(() => {});
    api.get("/arquitetos").then((r) => setArquitetos(r.arquitetos || [])).catch(() => {});
  }, []);

  // Recalcula subtotal sempre que os itens mudam
  useEffect(() => {
    const sub = itens.reduce((acc, it) => {
      const qtde = parseFloat(it.quantidade) || 0;
      const preco = parseFloat(String(it.preco_unitario).replace(",", ".")) || 0;
      const total = parseFloat(String(it.valor).replace(",", ".")) || qtde * preco;
      return acc + total;
    }, 0);
    const desc = parseFloat(String(form.desconto).replace(",", ".")) || 0;
    setForm((p) => ({
      ...p,
      subtotal: sub.toFixed(2),
      total: (sub - desc).toFixed(2),
    }));
  }, [itens, form.desconto]);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function handleCEP(valor) {
    const n = valor.replace(/\D/g, "").slice(0, 8);
    const fmt = n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
    set("cep", fmt);
    if (n.length === 8) {
      setBuscandoCEP(true);
      fetch(`https://viacep.com.br/ws/${n}/json/`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.erro) setForm((p) => ({
            ...p,
            rua: d.logradouro || p.rua,
            bairro: d.bairro || p.bairro,
            cidade: d.localidade || p.cidade,
            estado: d.uf || p.estado,
          }));
        })
        .catch(() => {})
        .finally(() => setBuscandoCEP(false));
    }
  }

  function handleClienteChange(id) {
    set("cliente_id", id);
    const c = clientes.find((x) => String(x.id) === String(id));
    if (c) {
      if (c.email && !form.email_cliente) set("email_cliente", c.email);
    }
  }

  // ── ITENS ──
  function setItem(i, k, v) {
    setItens((prev) => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      // recalcula valor do item
      if (k === "quantidade" || k === "preco_unitario") {
        const qtde = parseFloat(String(k === "quantidade" ? v : novo[i].quantidade).replace(",", ".")) || 0;
        const preco = parseFloat(String(k === "preco_unitario" ? v : novo[i].preco_unitario).replace(",", ".")) || 0;
        novo[i].valor = (qtde * preco).toFixed(2);
      }
      return novo;
    });
  }
  function addItem() { setItens((p) => [...p, itemVazio()]); }
  function removeItem(i) {
    setItens((prev) => {
      const filtered = prev.filter((_, idx) => idx !== i);
      return filtered.map((it) => {
        const v = it.item_vinculado_idx;
        if (v === null || v === undefined) return it;
        if (v === i) return { ...it, item_vinculado_idx: null };
        if (v > i) return { ...it, item_vinculado_idx: v - 1 };
        return it;
      });
    });
  }

  // ── PAGAMENTOS ──
  function setPag(i, k, v) {
    setPagamentos((prev) => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      return novo;
    });
  }
  function addPag() { setPagamentos((p) => [...p, pagVazio()]); }
  function removePag(i) { setPagamentos((p) => p.filter((_, idx) => idx !== i)); }

  function salvar() {
    // Filtra itens e remapeia item_vinculado_idx para índices pós-filtro
    const itensFiltrados = itens
      .map((it, origIdx) => ({ it, origIdx }))
      .filter(({ it }) => it.descricao?.trim());
    const origToNew = {};
    itensFiltrados.forEach(({ origIdx }, newIdx) => { origToNew[origIdx] = newIdx; });
    const itensFinais = itensFiltrados.map(({ it }) => ({
      ...it,
      item_vinculado_idx: it.item_vinculado_idx != null
        ? (origToNew[it.item_vinculado_idx] ?? null)
        : null,
    }));

    const dados = {
      ...form,
      cliente_id:   form.cliente_id   ? Number(form.cliente_id)   : null,
      consultor_id: form.consultor_id ? Number(form.consultor_id) : null,
      arquiteto_id: form.arquiteto_id ? Number(form.arquiteto_id) : null,
      itens:     itensFinais,
      pagamentos: pagamentos.filter((pg) => pg.forma?.trim()),
    };
    onSalvar(dados);
  }

  const ABAS = [
    { id: "dados",      label: "Dados gerais" },
    { id: "itens",      label: `Itens (${itens.length})` },
    { id: "pagamentos", label: "Pagamentos" },
    { id: "obs",        label: "Observações" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box pd-modal-grande" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{pedido ? `Editar pedido ${pedido.numero}` : "Novo pedido"}</h2>
            <p>Preencha todas as seções do pedido</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* ABAS */}
        <div className="pd-modal-abas">
          {ABAS.map((a) => (
            <button
              key={a.id}
              className={`pd-modal-aba${abaAtiva === a.id ? " ativa" : ""}`}
              onClick={() => setAbaAtiva(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="modal-body pd-modal-body-scroll">

          {/* ─── ABA: DADOS GERAIS ─── */}
          {abaAtiva === "dados" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Linha 1: Cliente + Status */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                <div className="ag-form-field">
                  <label>Cliente</label>
                  <select value={form.cliente_id} onChange={(e) => handleClienteChange(e.target.value)}>
                    <option value="">— Sem cliente —</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="ag-form-field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                    {STATUS_OPCOES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Linha 2: Consultora + Arquiteto */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="ag-form-field">
                  <label>Consultor(a)</label>
                  <select value={form.consultor_id} onChange={(e) => set("consultor_id", e.target.value)}>
                    <option value="">— Selecionar —</option>
                    {consultores.map((u) => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
                  </select>
                </div>
                <div className="ag-form-field">
                  <label>Arquiteto</label>
                  <select value={form.arquiteto_id} onChange={(e) => set("arquiteto_id", e.target.value)}>
                    <option value="">— Selecionar —</option>
                    {arquitetos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
              </div>

              {/* Linha 3: Data + CPF/CNPJ + Email */}
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 12 }}>
                <div className="ag-form-field">
                  <label>Data do Pedido</label>
                  <input type="date" value={form.data_pedido} onChange={(e) => set("data_pedido", e.target.value)} />
                </div>
                <div className="ag-form-field">
                  <label>CPF / CNPJ</label>
                  <input placeholder="000.000.000-00" value={form.cpf_cnpj} onChange={(e) => set("cpf_cnpj", e.target.value)} />
                </div>
                <div className="ag-form-field">
                  <label>E-mail</label>
                  <input type="email" placeholder="cliente@email.com" value={form.email_cliente} onChange={(e) => set("email_cliente", e.target.value)} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--color-text-muted)" }}>
                Endereço de Entrega
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
                <div className="ag-form-field">
                  <label>CEP</label>
                  <input placeholder="00000-000" value={form.cep} onChange={(e) => handleCEP(e.target.value)} maxLength={9} />
                  {buscandoCEP && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Buscando...</span>}
                </div>
                <div className="ag-form-field">
                  <label>Rua / Avenida</label>
                  <input placeholder="Ex: Rua das Flores" value={form.rua} onChange={(e) => set("rua", e.target.value)} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
                <div className="ag-form-field">
                  <label>Número</label>
                  <input placeholder="123" value={form.numero} onChange={(e) => set("numero", e.target.value)} />
                </div>
                <div className="ag-form-field">
                  <label>Complemento</label>
                  <input placeholder="Apto, bloco..." value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 10 }}>
                <div className="ag-form-field">
                  <label>Bairro</label>
                  <input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </div>
                <div className="ag-form-field">
                  <label>Cidade</label>
                  <input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                </div>
                <div className="ag-form-field">
                  <label>UF</label>
                  <input placeholder="PR" value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
                </div>
              </div>

              <div className="ag-form-field">
                <label>Descrição do pedido</label>
                <textarea rows={2} placeholder="Descrição geral..." value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
              </div>
            </div>
          )}

          {/* ─── ABA: ITENS ─── */}
          {abaAtiva === "itens" && (
            <div>
              <div className="pd-modal-itens pd-itens-editor">
                <div className="pd-itens-editor-header">
                  <span>#</span>
                  <span>Ambiente</span>
                  <span>Referência</span>
                  <span>Cor</span>
                  <span>Produto</span>
                  <span>Medidas</span>
                  <span>Qtde</span>
                  <span>Un</span>
                  <span>Preço Unit.</span>
                  <span>Total</span>
                  <span>Vinculado a</span>
                  <span></span>
                </div>
                {itens.map((it, i) => (
                  <div key={i} className="pd-itens-editor-row">
                    <span className="pd-item-num">{i + 1}</span>
                    <input placeholder="Sala" value={it.ambiente} onChange={(e) => setItem(i, "ambiente", e.target.value)} />
                    <input placeholder="ADO500" value={it.referencia} onChange={(e) => setItem(i, "referencia", e.target.value)} />
                    <input placeholder="Offwhite" value={it.cor} onChange={(e) => setItem(i, "cor", e.target.value)} />
                    <input placeholder="Descrição do produto" value={it.descricao} onChange={(e) => setItem(i, "descricao", e.target.value)} className="pd-item-desc" />
                    <input placeholder="2,00x3,00" value={it.medidas} onChange={(e) => setItem(i, "medidas", e.target.value)} />
                    <input type="number" min="0" step="0.01" value={it.quantidade} onChange={(e) => setItem(i, "quantidade", e.target.value)} />
                    <select value={it.unidade} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" placeholder="0,00" value={it.preco_unitario} onChange={(e) => setItem(i, "preco_unitario", e.target.value)} />
                    <input readOnly value={it.valor ? fmtMoeda(it.valor) : ""} className="pd-item-total" />
                    <select
                      value={it.item_vinculado_idx ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItem(i, "item_vinculado_idx", v === "" ? null : Number(v));
                      }}
                      style={{ fontSize: 11 }}
                    >
                      <option value="">— Nenhum —</option>
                      {itens.map((other, j) => j !== i ? (
                        <option key={j} value={j}>
                          {j + 1} – {other.descricao || "(sem desc.)"}
                        </option>
                      ) : null)}
                    </select>
                    <button className="pd-item-del" onClick={() => removeItem(i)} title="Remover item">×</button>
                  </div>
                ))}
              </div>

              <button className="pd-add-linha" onClick={addItem}>+ Adicionar item</button>

              <div className="pd-totais-editor">
                <div className="pd-totais-row">
                  <span>SubTotal</span>
                  <span>R$ {fmtMoeda(form.subtotal || 0)}</span>
                </div>
                <div className="pd-totais-row">
                  <span>Desconto</span>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="0,00"
                    value={form.desconto}
                    onChange={(e) => set("desconto", e.target.value)}
                    style={{ width: 120, textAlign: "right" }}
                  />
                </div>
                <div className="pd-totais-row total">
                  <span>Total</span>
                  <span>R$ {fmtMoeda(form.total || 0)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── ABA: PAGAMENTOS ─── */}
          {abaAtiva === "pagamentos" && (
            <div>
              <div className="pd-pag-editor">
                <div className="pd-pag-header">
                  <span>Forma de pagamento</span>
                  <span>Parcela</span>
                  <span>Vencimento</span>
                  <span>Valor (R$)</span>
                  <span></span>
                </div>
                {pagamentos.map((pg, i) => (
                  <div key={i} className="pd-pag-row">
                    <select value={pg.forma} onChange={(e) => setPag(i, "forma", e.target.value)}>
                      {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
                    </select>
                    <input placeholder="1/1" value={pg.parcela} onChange={(e) => setPag(i, "parcela", e.target.value)} />
                    <input type="date" value={pg.vencimento} onChange={(e) => setPag(i, "vencimento", e.target.value)} />
                    <input type="number" min="0" step="0.01" placeholder="0,00" value={pg.valor} onChange={(e) => setPag(i, "valor", e.target.value)} />
                    <button className="pd-item-del" onClick={() => removePag(i)}>×</button>
                  </div>
                ))}
              </div>
              <button className="pd-add-linha" onClick={addPag}>+ Adicionar pagamento</button>
            </div>
          )}

          {/* ─── ABA: OBSERVAÇÕES ─── */}
          {abaAtiva === "obs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="ag-form-field">
                <label>Previsão de entrega</label>
                <textarea
                  rows={4}
                  placeholder="Ex: CORTINAS → Entrega até 20 dias úteis após conferência técnica."
                  value={form.observacoes_entrega}
                  onChange={(e) => set("observacoes_entrega", e.target.value)}
                />
              </div>
              <div className="ag-form-field">
                <label>Observações gerais</label>
                <textarea rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
              </div>
            </div>
          )}

        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : pedido ? "Salvar alterações" : "Criar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
