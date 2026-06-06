import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { api, API_BASE } from "../../services/api";
import PedidoPrint from "./PedidoPrint";
import ModalSelecionarItensInstalacao from "./ModalSelecionarItensInstalacao";
import MidiasGaleria from "../../components/MidiasGaleria";
import "./PedidoFluxo.css";

function fmtData(iso) {
  if (!iso) return "";
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtMoeda(v) {
  if (v == null || v === "") return "0,00";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDatetime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ── CARD ETAPA ── */
function CardEtapa({ numero, titulo, concluido, ativo, onClick }) {
  let cls = "pf-card-etapa";
  if (concluido) cls += " pf-card-verde";
  else if (ativo) cls += " pf-card-azul pf-pulsante";
  else cls += " pf-card-cinza";

  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="pf-card-icone">
        {concluido ? "✓" : numero}
      </div>
      <div className="pf-card-titulo">{titulo}</div>
      {concluido && <div className="pf-card-sub">Concluído</div>}
      {!concluido && ativo && <div className="pf-card-sub">Em andamento</div>}
      {!concluido && !ativo && <div className="pf-card-sub">Aguardando</div>}
    </div>
  );
}

function SetaConector({ ativo }) {
  return <div className={`pf-seta-conector${ativo ? " pf-seta-ativa" : ""}`}>→</div>;
}

/* ── ABA HISTÓRICO ── */
function AbaHistorico({ pedidoId, etapa }) {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/pedidos/${pedidoId}/auditoria?etapa=${etapa}`)
      .then(res => setRegistros(res.auditoria || []))
      .catch(() => setRegistros([]))
      .finally(() => setLoading(false));
  }, [pedidoId, etapa]);

  if (loading) return <div className="pf-hist-loading">Carregando histórico...</div>;
  if (!registros.length) return <div className="pf-hist-vazio">Nenhum registro ainda.</div>;

  const COR_ACAO = {
    importacao: "#10b981", pdf_vinculado: "#10b981", verificacao_ok: "#10b981",
    edicao: "#f59e0b", categoria_definida: "#f59e0b", vinculo_resolvido: "#f59e0b",
    pre_agendamento_criado: "#3b82f6", agendamento_concluido: "#10b981",
    pedido_concluido: "#10b981",
  };

  return (
    <div className="pf-historico">
      {registros.map(r => (
        <div key={r.id} className="pf-hist-item">
          <div className="pf-hist-bolinha" style={{ background: COR_ACAO[r.acao] || "#64748b" }} />
          <div className="pf-hist-corpo">
            <div className="pf-hist-desc">
              <strong>{r.usuario_nome || "Sistema"}</strong> — {r.descricao}
            </div>
            <div className="pf-hist-data">{fmtDatetime(r.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── MODAL BASE ── */
function Modal({ titulo, onClose, children }) {
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="pf-modal-overlay" onClick={onClose}>
      <div className="pf-modal" onClick={e => e.stopPropagation()}>
        <div className="pf-modal-header">
          <h2 className="pf-modal-titulo">{titulo}</h2>
          <button className="pf-modal-fechar" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── MODAL DADOS DO PEDIDO ── */
function ModalDadosPedido({ pedido, pedidoId, onClose, onAtualizado, user }) {
  const navigate = useNavigate();
  const [aba, setAba] = useState("detalhes");
  const [editando, setEditando] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [instalacao, setInstalacao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");

  const [form, setForm] = useState(() => ({
    cliente_id:          pedido?.cliente_id          ?? "",
    cpf_cnpj:            pedido?.cpf_cnpj            ?? "",
    email_cliente:       pedido?.email_cliente        ?? "",
    status:              pedido?.status              ?? "pendente",
    data_pedido:         pedido?.data_pedido ? pedido.data_pedido.slice(0, 10) : "",
    consultor_id:        pedido?.consultor_id        ?? "",
    arquiteto_id:        pedido?.arquiteto_id        ?? "",
    descricao:           pedido?.descricao           ?? "",
    observacoes:         pedido?.observacoes         ?? "",
    observacoes_entrega: pedido?.observacoes_entrega ?? "",
    cep:                 pedido?.cep                 ?? "",
    rua:                 pedido?.rua                 ?? "",
    numero:              pedido?.numero_rua          ?? "",
    complemento:         pedido?.complemento         ?? "",
    bairro:              pedido?.bairro              ?? "",
    cidade:              pedido?.cidade              ?? "",
    estado:              pedido?.estado              ?? "",
    subtotal:            pedido?.subtotal            ?? "",
    desconto:            pedido?.desconto            ?? "",
    total:               pedido?.total               ?? "",
  }));

  const [itens, setItens] = useState(() =>
    pedido?.itens?.length
      ? pedido.itens.map((it, _, arr) => {
          const vinculoId = it.vinculos?.[0]?.item_vinculado_id ?? null;
          const vinculoIdx = vinculoId != null ? arr.findIndex(o => o.id === vinculoId) : -1;
          return { ...it, item_vinculado_idx: vinculoIdx >= 0 ? vinculoIdx : null };
        })
      : []
  );

  const [pagamentos, setPagamentos] = useState(() =>
    pedido?.pagamentos?.length
      ? pedido.pagamentos.map(pg => ({ ...pg, vencimento: pg.vencimento?.slice(0, 10) ?? "" }))
      : []
  );

  const [clientes, setClientes]       = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [arquitetos, setArquitetos]   = useState([]);
  const [categorias, setCategorias]   = useState([]);

  useEffect(() => {
    if (!editando) return;
    api.get("/clientes").then(r => setClientes(r.clientes || [])).catch(() => {});
    api.get("/auth/admin/usuarios").then(r => setConsultores((r.usuarios || []).filter(u => u.status === "aprovado"))).catch(() => {});
    api.get("/arquitetos").then(r => setArquitetos(r.arquitetos || [])).catch(() => {});
    api.get("/categorias").then(r => setCategorias(r.categorias || [])).catch(() => {});
  }, [editando]);

  function mostrarToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function setItem(i, k, v) {
    setItens(prev => {
      const novo = [...prev];
      novo[i] = { ...novo[i], [k]: v };
      if (k === "sem_vinculo" && v) novo[i].item_vinculado_idx = null;
      if (k === "quantidade" || k === "preco_unitario") {
        const q = parseFloat(String(k === "quantidade" ? v : novo[i].quantidade).replace(",", ".")) || 0;
        const p = parseFloat(String(k === "preco_unitario" ? v : novo[i].preco_unitario).replace(",", ".")) || 0;
        novo[i].valor = (q * p).toFixed(2);
      }
      return novo;
    });
  }

  async function handleSalvar() {
    setSalvando(true);
    try {
      const dados = {
        ...form,
        cliente_id:   form.cliente_id   ? Number(form.cliente_id)   : null,
        consultor_id: form.consultor_id ? Number(form.consultor_id) : null,
        arquiteto_id: form.arquiteto_id ? Number(form.arquiteto_id) : null,
        itens:        itens.filter(it => it.descricao?.trim()),
        pagamentos:   pagamentos.filter(pg => pg.forma?.trim()),
      };
      await api.put(`/pedidos/${pedidoId}`, dados);
      mostrarToast("Salvo com sucesso!");
      setEditando(false);
      onAtualizado();
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!window.confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/pedidos/${pedidoId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onClose();
      onAtualizado();
    } catch (e) {
      mostrarToast(e.message || "Erro ao excluir.");
    }
  }

  async function handleAbrirPdf() {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/pedidos/${pedidoId}/anexo-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) { mostrarToast("PDF não encontrado."); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { mostrarToast("Erro ao abrir PDF."); }
  }

  const etapa1Completa = pedido?.verificacao_ok;

  return (
    <Modal titulo={`Dados do Pedido — ${pedido?.numero || `#${pedidoId}`}`} onClose={onClose}>
      <div className="pf-modal-abas">
        <button className={`pf-modal-aba${aba === "detalhes" ? " ativa" : ""}`} onClick={() => setAba("detalhes")}>Detalhes</button>
        <button className={`pf-modal-aba${aba === "historico" ? " ativa" : ""}`} onClick={() => setAba("historico")}>Histórico</button>
      </div>

      <div className="pf-modal-body">

        {aba === "detalhes" && !editando && (
          <>
            <div className="pf-acoes">
              <button className="pf-btn pf-btn-primary" onClick={() => setEditando(true)}>✏ Editar</button>
              <button className="pf-btn" onClick={() => setPrintOpen(true)}>🖨 Imprimir</button>
              {pedido?.tem_anexo_pdf && (
                <button className="pf-btn" onClick={handleAbrirPdf}>📄 PDF Original</button>
              )}
              <button className="pf-btn" onClick={() => setInstalacao(pedido)}>📅 Agendar Instalação</button>
              <button className="pf-btn pf-btn-danger" onClick={handleExcluir}>🗑 Excluir</button>
            </div>

            {!etapa1Completa && (
              <div className="pf-etapa1-pendencias">
                <strong>Pendências para concluir esta etapa:</strong>
                <ul>
                  {!pedido?.tem_anexo_pdf && <li>PDF original não vinculado</li>}
                  {pedido?.itens?.some(it => !it.categoria_id) && (
                    <li>Itens sem categoria: {pedido.itens.filter(it => !it.categoria_id).map(it => it.descricao || "(sem nome)").join(", ")}</li>
                  )}
                  {pedido?.itens?.some(it => !it.sem_vinculo && !(it.vinculos?.length)) && (
                    <li>Itens sem vínculo resolvido — edite e marque "Nenhum" se não houver vínculo necessário</li>
                  )}
                </ul>
              </div>
            )}

            <div className="pf-secao">
              <div className="pf-secao-titulo">Informações</div>
              <div className="pf-info-grid">
                <div><span className="pf-info-label">Cliente</span>{pedido?.cliente_nome || "—"}</div>
                <div><span className="pf-info-label">Consultora</span>{pedido?.consultor_nome || "—"}</div>
                <div><span className="pf-info-label">Arquiteto</span>{pedido?.arquiteto_nome || "—"}</div>
                <div><span className="pf-info-label">Data</span>{fmtData(pedido?.data_pedido)}</div>
                <div><span className="pf-info-label">Total</span><span className="pf-valor-destaque">R$ {fmtMoeda(pedido?.total)}</span></div>
                <div><span className="pf-info-label">Status</span>{pedido?.status}</div>
              </div>
            </div>

            {pedido?.endereco && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Endereço de Entrega</div>
                <p className="pf-texto">{pedido.endereco}</p>
              </div>
            )}

            {pedido?.itens?.length > 0 && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Itens ({pedido.itens.length})</div>
                <div className="pf-itens-wrap">
                  <table className="pf-itens-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Produto</th><th>Categoria</th><th>Vínculo</th>
                        <th>Medidas</th><th>Qtde</th><th>Preço</th><th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedido.itens.map((it, i) => (
                        <tr key={it.id}>
                          <td>{i + 1}</td>
                          <td>{it.descricao}</td>
                          <td>
                            {it.categoria_nome
                              ? <span className="pf-cat-badge" style={{ background: it.categoria_cor || "#8B6914" }}>{it.categoria_nome}</span>
                              : <span className="pf-pendente">Sem categoria</span>}
                          </td>
                          <td>
                            {it.sem_vinculo
                              ? <span className="pf-sem-vinculo">Nenhum</span>
                              : it.vinculos?.length
                                ? <span className="pf-vinculado">Vinculado</span>
                                : <span className="pf-pendente">Pendente</span>}
                          </td>
                          <td>{it.medidas || "—"}</td>
                          <td>{it.quantidade}</td>
                          <td>{it.preco_unitario != null ? `R$ ${fmtMoeda(it.preco_unitario)}` : "—"}</td>
                          <td><strong>R$ {fmtMoeda(it.valor)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pf-totais">
                  {pedido.subtotal != null && <div>SubTotal: R$ {fmtMoeda(pedido.subtotal)}</div>}
                  {Number(pedido.desconto) > 0 && <div>Desconto: -R$ {fmtMoeda(pedido.desconto)}</div>}
                  <div className="pf-total-final">Total: R$ {fmtMoeda(pedido.total)}</div>
                </div>
              </div>
            )}

            {pedido?.pagamentos?.length > 0 && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Pagamentos</div>
                {Object.entries(
                  pedido.pagamentos.reduce((acc, pg) => {
                    if (!acc[pg.forma]) acc[pg.forma] = [];
                    acc[pg.forma].push(pg);
                    return acc;
                  }, {})
                ).map(([forma, pgs]) => (
                  <div key={forma} className="pf-pag-grupo">
                    <div className="pf-pag-forma">{forma}</div>
                    {pgs.map((pg, i) => (
                      <div key={i} className="pf-pag-row">
                        <span>{pg.parcela}</span>
                        <span>{fmtData(pg.vencimento)}</span>
                        <span>R$ {fmtMoeda(pg.valor)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {pedido?.observacoes && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Observações</div>
                <p className="pf-texto">{pedido.observacoes}</p>
              </div>
            )}

            {pedido?.observacoes_entrega && (
              <div className="pf-secao">
                <div className="pf-secao-titulo">Previsão de Entrega</div>
                <p className="pf-texto">{pedido.observacoes_entrega}</p>
              </div>
            )}

            <div className="pf-secao">
              <div className="pf-secao-titulo">Mídias</div>
              <MidiasGaleria pedidoId={pedidoId} token={localStorage.getItem("token")} />
            </div>
          </>
        )}

        {aba === "detalhes" && editando && (
          <div className="pf-form-edicao">
            <div className="pf-form-row">
              <div className="pf-form-field">
                <label>Cliente</label>
                <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                  <option value="">— Sem cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="pf-form-field">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="pendente">Pendente</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="pf-form-field">
                <label>Data do Pedido</label>
                <input type="date" value={form.data_pedido} onChange={e => setForm(f => ({ ...f, data_pedido: e.target.value }))} />
              </div>
            </div>

            <div className="pf-form-row">
              <div className="pf-form-field">
                <label>Consultora</label>
                <select value={form.consultor_id} onChange={e => setForm(f => ({ ...f, consultor_id: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {consultores.map(u => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
                </select>
              </div>
              <div className="pf-form-field">
                <label>Arquiteto</label>
                <select value={form.arquiteto_id} onChange={e => setForm(f => ({ ...f, arquiteto_id: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {arquitetos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>

            <div className="pf-form-row">
              <div className="pf-form-field" style={{ flex: 2 }}>
                <label>Observações</label>
                <textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="pf-form-field" style={{ flex: 2 }}>
                <label>Previsão de Entrega</label>
                <textarea rows={2} value={form.observacoes_entrega} onChange={e => setForm(f => ({ ...f, observacoes_entrega: e.target.value }))} />
              </div>
            </div>

            <div className="pf-secao-titulo" style={{ marginTop: 16 }}>Itens — Categoria e Vínculo</div>
            <div className="pf-itens-editor-wrap">
              {itens.map((it, i) => (
                <div key={i} className="pf-item-edit-row">
                  <span className="pf-item-num">{i + 1}</span>
                  <span className="pf-item-desc" title={it.descricao}>{it.descricao || "(sem descrição)"}</span>
                  <select
                    value={it.categoria_id ?? ""}
                    onChange={e => setItem(i, "categoria_id", e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Categoria —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <select
                    value={it.sem_vinculo ? "__nenhum__" : (it.item_vinculado_idx != null ? String(it.item_vinculado_idx) : "")}
                    onChange={e => {
                      if (e.target.value === "__nenhum__") {
                        setItem(i, "sem_vinculo", true);
                      } else {
                        setItem(i, "sem_vinculo", false);
                        setItem(i, "item_vinculado_idx", e.target.value === "" ? null : Number(e.target.value));
                      }
                    }}
                  >
                    <option value="">— Vínculo —</option>
                    <option value="__nenhum__">Nenhum (sem vínculo necessário)</option>
                    {itens.map((other, j) => j !== i ? (
                      <option key={j} value={j}>{j + 1} – {other.descricao || "(sem desc.)"}</option>
                    ) : null)}
                  </select>
                </div>
              ))}
            </div>

            <div className="pf-form-acoes">
              <button className="pf-btn" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</button>
              <button className="pf-btn pf-btn-primary" onClick={handleSalvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {aba === "historico" && (
          <AbaHistorico pedidoId={pedidoId} etapa="dados_pedido" />
        )}

      </div>

      {toast && <div className="pf-toast">{toast}</div>}

      {printOpen && <PedidoPrint pedido={pedido} onClose={() => setPrintOpen(false)} />}

      {instalacao && (
        <ModalSelecionarItensInstalacao
          pedido={instalacao}
          onClose={() => setInstalacao(null)}
          onContinuar={(itensSel) => {
            setInstalacao(null);
            navigate("/agendamentos", {
              state: {
                novoInstalacao: {
                  pedido_id:     pedido.id,
                  pedido_numero: pedido.numero,
                  cliente:       pedido.cliente_nome || "",
                  cep:           pedido.cep,
                  rua:           pedido.rua,
                  numero:        pedido.numero_rua,
                  complemento:   pedido.complemento,
                  bairro:        pedido.bairro,
                  cidade:        pedido.cidade,
                  estado:        pedido.estado,
                  itens:         itensSel,
                },
              },
            });
          }}
        />
      )}
    </Modal>
  );
}

/* ── MODAL ENTREGA ── */
function ModalEntrega({ pedido, pedidoId, preAgendamentos, onClose }) {
  const navigate = useNavigate();
  const [aba, setAba] = useState("detalhes");

  const etapa1Completa = pedido?.verificacao_ok;

  function handleMarcarPreAgendamento() {
    navigate("/agendamentos", {
      state: {
        novoInstalacao: {
          pedido_id:     pedido.id,
          pedido_numero: pedido.numero,
          cliente:       pedido.cliente_nome || "",
          cep:           pedido.cep,
          rua:           pedido.rua,
          numero:        pedido.numero_rua,
          complemento:   pedido.complemento,
          bairro:        pedido.bairro,
          cidade:        pedido.cidade,
          estado:        pedido.estado,
          itens:         [],
        },
      },
    });
  }

  const STATUS_LABEL = {
    pendente: "Pendente", pre_agendado: "Pré-agendado",
    agendado: "Agendado", concluido: "Concluído", cancelado: "Cancelado",
  };
  const STATUS_COR = {
    pendente: "#64748b", pre_agendado: "#3b82f6",
    agendado: "#f59e0b", concluido: "#10b981", cancelado: "#ef4444",
  };

  return (
    <Modal titulo="Entrega" onClose={onClose}>
      <div className="pf-modal-abas">
        <button className={`pf-modal-aba${aba === "detalhes" ? " ativa" : ""}`} onClick={() => setAba("detalhes")}>Detalhes</button>
        <button className={`pf-modal-aba${aba === "historico" ? " ativa" : ""}`} onClick={() => setAba("historico")}>Histórico</button>
      </div>

      <div className="pf-modal-body">
        {aba === "detalhes" && (
          <>
            {!etapa1Completa ? (
              <div className="pf-bloqueio">
                <div className="pf-bloqueio-icone">🔒</div>
                <div className="pf-bloqueio-titulo">Etapa 1 não concluída</div>
                <p className="pf-bloqueio-desc">Complete a etapa "Dados do Pedido" antes de avançar para a entrega. Clique no card "DADOS DO PEDIDO" para ver o que falta.</p>
              </div>
            ) : (
              <>
                {pedido?.status !== "concluido" && (
                  <div className="pf-acoes">
                    <button className="pf-btn pf-btn-primary" onClick={handleMarcarPreAgendamento}>
                      📅 Marcar pré-agendamento
                    </button>
                  </div>
                )}

                {pedido?.status === "concluido" && (
                  <div className="pf-concluido-banner">✓ Pedido concluído</div>
                )}

                {preAgendamentos?.length > 0 ? (
                  <div className="pf-secao">
                    <div className="pf-secao-titulo">Agendamentos ({preAgendamentos.length})</div>
                    {preAgendamentos.map(ag => (
                      <div key={ag.id} className="pf-ag-item">
                        <div className="pf-ag-header">
                          <span className="pf-ag-data">{fmtData(ag.data_inicio || ag.data)}</span>
                          <span className="pf-ag-badge" style={{
                            background: (STATUS_COR[ag.status] || "#64748b") + "22",
                            color: STATUS_COR[ag.status] || "#64748b",
                          }}>
                            {STATUS_LABEL[ag.status] || ag.status}
                          </span>
                        </div>
                        {ag.itens?.length > 0 && (
                          <ul className="pf-ag-itens">
                            {ag.itens.map(it => <li key={it.pedido_item_id || it.id}>{it.descricao}</li>)}
                          </ul>
                        )}
                        {ag.herdeiros?.map(h => (
                          <div key={h.id} className="pf-ag-herdeiro">
                            <span>↳ {h.tipo || "Herdeiro"}</span>
                            <span className="pf-ag-badge" style={{
                              background: (STATUS_COR[h.status] || "#64748b") + "22",
                              color: STATUS_COR[h.status] || "#64748b",
                            }}>
                              {STATUS_LABEL[h.status] || h.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pf-sem-ag">Nenhum agendamento criado ainda. Use o botão acima para iniciar.</p>
                )}
              </>
            )}
          </>
        )}

        {aba === "historico" && (
          <AbaHistorico pedidoId={pedidoId} etapa="entrega" />
        )}
      </div>
    </Modal>
  );
}

/* ── COMPONENTE PRINCIPAL ── */
export default function PedidoFluxo() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dados,      setDados]      = useState(null);
  const [pedidoFull, setPedidoFull] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState(null);
  const [modalAberto, setModalAberto] = useState(null); // 'dados' | 'entrega' | null

  const carregar = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/pedidos/${id}/fluxo`),
      api.get(`/pedidos/${id}`),
    ])
      .then(([fluxoRes, pedidoRes]) => {
        setDados(fluxoRes);
        setPedidoFull(pedidoRes.pedido || pedidoRes);
        setErro(null);
      })
      .catch(err => setErro(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="pf-estado">Carregando...</div>;
  if (erro)    return <div className="pf-estado pf-erro">Erro: {erro}</div>;
  if (!dados)  return null;

  const { pedido, pre_agendamentos } = dados;
  const etapa1Completa  = pedidoFull?.verificacao_ok || false;
  const pedidoConcluido = pedidoFull?.status === "concluido";

  const numeroDisplay = pedido.numero_origem
    ? `#${parseInt(pedido.numero_origem.replace(/^#+/, ""), 10)}`
    : `#${pedido.numero_sequencial}`;

  return (
    <div className="pf-page">
      <div className="pf-header">
        <button className="pf-btn-voltar" onClick={() => navigate("/pedidos")}>← Voltar</button>
        <div className="pf-header-info">
          <span className="pf-titulo">Pedido {numeroDisplay}</span>
          <span className="pf-sub">{pedido.cliente_nome}</span>
          {pedido.consultor_nome && <span className="pf-sub">{pedido.consultor_nome}</span>}
          <span className="pf-sub pf-valor">
            R$ {Number(pedido.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="pf-fluxo-container">
        <div className="pf-fluxo-cards">
          <CardEtapa
            numero={1}
            titulo="DADOS DO PEDIDO"
            concluido={etapa1Completa}
            ativo={!etapa1Completa}
            onClick={() => setModalAberto("dados")}
          />
          <SetaConector ativo={etapa1Completa} />
          <CardEtapa
            numero={2}
            titulo="ENTREGA"
            concluido={pedidoConcluido}
            ativo={etapa1Completa && !pedidoConcluido}
            onClick={() => setModalAberto("entrega")}
          />
        </div>
      </div>

      {modalAberto === "dados" && pedidoFull && (
        <ModalDadosPedido
          pedido={pedidoFull}
          pedidoId={Number(id)}
          onClose={() => setModalAberto(null)}
          onAtualizado={() => { setModalAberto(null); carregar(); }}
          user={user}
        />
      )}

      {modalAberto === "entrega" && (
        <ModalEntrega
          pedido={pedidoFull}
          pedidoId={Number(id)}
          preAgendamentos={pre_agendamentos}
          onClose={() => setModalAberto(null)}
          onAtualizado={carregar}
        />
      )}
    </div>
  );
}
