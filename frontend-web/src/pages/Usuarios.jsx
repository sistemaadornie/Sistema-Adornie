import { useEffect, useState, useCallback, useMemo } from "react";
import useAuth from "../hooks/useAuth";
import ConfirmModal from "../components/ConfirmModal";
import { api } from "../services/api";
import "./Usuarios.css";

/* ── helpers ─────────────────────────────────────── */

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "bloqueado") return "ek-badge danger";
  if (s === "aprovado")  return "ek-badge success";
  return "ek-badge warning";
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "bloqueado") return "Bloqueado";
  if (s === "aprovado")  return "Aprovado";
  return "Pendente";
}

function Inicial({ nome, foto }) {
  return (
    <div className="usr-avatar">
      {foto
        ? <img src={foto} alt={nome} />
        : (nome || "U").charAt(0).toUpperCase()
      }
    </div>
  );
}

/* ── componente principal ────────────────────────── */

export default function Usuarios() {
  const { user } = useAuth();

  /* Permissões do usuário atual */
  const isAdminMaster = user?.permissoes?.includes("ADMIN_MASTER");
  const podeGerenciarUsuarios = user?.permissoes?.includes("GESTOR_USUARIOS") || isAdminMaster;

  const [pendentes,        setPendentes]        = useState([]);
  const [usuarios,         setUsuarios]         = useState([]);
  const [setores,          setSetores]          = useState([]);
  const [todasPermissoes,  setTodasPermissoes]  = useState([]);
  const [solicitacoesReset,setSolicitacoesReset]= useState([]);
  const [msg,              setMsg]              = useState({ texto: "", tipo: "" });

  const [usuarioSelecionado,  setUsuarioSelecionado]  = useState(null);
  const [permissoesSel,       setPermissoesSel]       = useState([]);
  const [setorSelecionado,    setSetorSelecionado]    = useState("");
  const [modalAberto,         setModalAberto]         = useState(false);
  const [salvando,            setSalvando]            = useState(false);

  const [busca,         setBusca]         = useState("");
  const [filtroStatus,  setFiltroStatus]  = useState("todos");
  // { titulo, mensagem, labelConfirm, variante, fn }
  const [pendingAction, setPendingAction] = useState(null);

  /* ── toast ── */
  const mostrarMsg = useCallback((texto, tipo = "success") => {
    setMsg({ texto, tipo });
    setTimeout(() => setMsg({ texto: "", tipo: "" }), 3500);
  }, []);

  /* ── fechar modal ── */
  const fecharModal = useCallback(() => {
    setModalAberto(false);
    setUsuarioSelecionado(null);
    setPermissoesSel([]);
    setSetorSelecionado("");
  }, []);

  /* ── escape fecha modal ── */
  useEffect(() => {
    if (!modalAberto) return;
    const fn = (e) => { if (e.key === "Escape") fecharModal(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [modalAberto, fecharModal]);

  /* ── carregar dados ── */
  const carregarPendentes = useCallback(async () => {
    try {
      const d = await api.get("/auth/admin/usuarios-pendentes");
      setPendentes(d.usuarios || []);
    } catch { /* silencioso */ }
  }, []);

  const carregarUsuarios = useCallback(async () => {
    try {
      const d = await api.get("/auth/admin/usuarios");
      setUsuarios((d.usuarios || []).filter(
        (u) => String(u.status).toLowerCase() !== "pendente"
      ));
    } catch { /* silencioso */ }
  }, []);

  const carregarSetores = useCallback(async () => {
    if (!user?.empresa_id) return;
    try {
      const d = await api.get(`/auth/setores?empresa_id=${user.empresa_id}`);
      setSetores(d.setores || []);
    } catch { /* silencioso */ }
  }, [user?.empresa_id]);

  const carregarPermissoes = useCallback(async () => {
    try {
      const d = await api.get("/auth/admin/permissoes-disponiveis");
      setTodasPermissoes(d.permissoes || []);
    } catch { /* silencioso */ }
  }, []);

  const carregarSolicitacoesReset = useCallback(async () => {
    try {
      const d = await api.get("/auth/admin/solicitacoes-reset");
      setSolicitacoesReset(d.usuarios || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    const tarefas = [
      carregarPendentes(),
      carregarUsuarios(),
      carregarSetores(),
    ];
    /* Apenas Admin Master pode ver permissões e resets */
    if (podeGerenciarUsuarios) {
      tarefas.push(carregarPermissoes());
      tarefas.push(carregarSolicitacoesReset());
    }
    Promise.all(tarefas);
  }, [carregarPendentes, carregarUsuarios, carregarSetores, carregarPermissoes, carregarSolicitacoesReset, podeGerenciarUsuarios]);

  /* ── agrupamento de permissões ── */
  const gruposPermissoes = useMemo(() => {
    const grupos = {};
    todasPermissoes.forEach((p) => {
      const mod = p.modulo || "Outros";
      if (!grupos[mod]) grupos[mod] = [];
      grupos[mod].push(p);
    });
    return grupos;
  }, [todasPermissoes]);

  /* ── filtro de usuários ── */
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      const texto = `${u.nome_completo || ""} ${u.nome || ""} ${u.email || ""}`.toLowerCase();
      const passaBusca  = texto.includes(busca.toLowerCase());
      const passaStatus = filtroStatus === "todos" ||
        String(u.status || "").toLowerCase() === filtroStatus;
      return passaBusca && passaStatus;
    });
  }, [usuarios, busca, filtroStatus]);

  /* ── stats ── */
  const stats = useMemo(() => ({
    total:     usuarios.length + pendentes.length,
    aprovados: usuarios.filter((u) => String(u.status).toLowerCase() === "aprovado").length,
    pendentes: pendentes.length,
    bloqueados:usuarios.filter((u) => String(u.status).toLowerCase() === "bloqueado").length,
  }), [usuarios, pendentes]);

  /* ── helper para ações que requerem confirmação ── */
  function confirmar({ titulo, mensagem, labelConfirm = "Confirmar", variante = "danger", fn }) {
    setPendingAction({ titulo, mensagem, labelConfirm, variante, fn });
  }

  /* ── ações ── */
  const aprovarUsuario = useCallback(async (id) => {
    confirmar({
      titulo: "Aprovar usuário",
      mensagem: "Deseja aprovar este usuário? Ele passará a ter acesso ao sistema.",
      labelConfirm: "Aprovar",
      variante: "warning",
      fn: async () => {
        try {
          await api.put(`/auth/admin/aprovar/${id}`, {});
          mostrarMsg("Usuário aprovado com sucesso!");
          await Promise.all([carregarPendentes(), carregarUsuarios()]);
        } catch (err) { mostrarMsg(err.message || "Erro ao aprovar.", "error"); }
      },
    });
  }, [carregarPendentes, carregarUsuarios, mostrarMsg]);

  const bloquearUsuario = useCallback(async (id) => {
    confirmar({
      titulo: "Bloquear usuário",
      mensagem: "O usuário perderá o acesso ao sistema. Deseja continuar?",
      labelConfirm: "Bloquear",
      variante: "danger",
      fn: async () => {
        try {
          await api.put(`/auth/admin/bloquear/${id}`, {});
          mostrarMsg("Usuário bloqueado.");
          await carregarUsuarios();
        } catch (err) { mostrarMsg(err.message || "Erro ao bloquear.", "error"); }
      },
    });
  }, [carregarUsuarios, mostrarMsg]);

  const desbloquearUsuario = useCallback(async (id) => {
    confirmar({
      titulo: "Desbloquear usuário",
      mensagem: "O usuário voltará a ter acesso ao sistema. Deseja continuar?",
      labelConfirm: "Desbloquear",
      variante: "warning",
      fn: async () => {
        try {
          await api.put(`/auth/admin/desbloquear/${id}`, {});
          mostrarMsg("Usuário desbloqueado!");
          await carregarUsuarios();
        } catch (err) { mostrarMsg(err.message || "Erro ao desbloquear.", "error"); }
      },
    });
  }, [carregarUsuarios, mostrarMsg]);

  const excluirUsuario = useCallback(async (id) => {
    confirmar({
      titulo: "Excluir usuário",
      mensagem: "Esta ação é irreversível. O usuário será removido permanentemente do sistema.",
      labelConfirm: "Excluir",
      variante: "danger",
      fn: async () => {
        try {
          await api.delete(`/auth/admin/excluir/${id}`);
          mostrarMsg("Usuário excluído.");
          await Promise.all([carregarUsuarios(), carregarPendentes()]);
          if (usuarioSelecionado?.id === id) fecharModal();
        } catch (err) { mostrarMsg(err.message || "Erro ao excluir.", "error"); }
      },
    });
  }, [carregarUsuarios, carregarPendentes, usuarioSelecionado, fecharModal, mostrarMsg]);

  const resetarSenha = useCallback(async (id, nome) => {
    confirmar({
      titulo: "Resetar senha",
      mensagem: `A senha de "${nome}" será redefinida para o CPF cadastrado. Deseja continuar?`,
      labelConfirm: "Resetar",
      variante: "warning",
      fn: async () => {
        try {
          const d = await api.put(`/auth/admin/resetar-senha/${id}`, {});
          mostrarMsg(d.message || "Senha resetada para o CPF.");
          await carregarSolicitacoesReset();
        } catch (err) { mostrarMsg(err.message || "Erro ao resetar senha.", "error"); }
      },
    });
  }, [mostrarMsg, carregarSolicitacoesReset]);

  const alterarSetorPendente = useCallback(async (id, novoSetorId) => {
    try {
      await api.put(`/auth/admin/usuarios/${id}/setor`, { setor_id: Number(novoSetorId) });
      setPendentes((prev) =>
        prev.map((u) => u.id === id
          ? { ...u, setor_id: Number(novoSetorId),
              setor: setores.find((s) => Number(s.id) === Number(novoSetorId))?.nome || u.setor }
          : u
        )
      );
    } catch (err) { mostrarMsg(err.message || "Erro ao atualizar setor.", "error"); }
  }, [setores, mostrarMsg]);

  const abrirModal = useCallback(async (usuario) => {
    setUsuarioSelecionado(usuario);
    setSetorSelecionado(usuario?.setor_id || "");
    try {
      const d = await api.get(`/auth/admin/permissoes/${usuario.id}`);
      setPermissoesSel(d.permissoes || []);
      setModalAberto(true);
    } catch (err) { mostrarMsg(err.message || "Erro ao carregar permissões.", "error"); }
  }, [mostrarMsg]);

  const togglePermissao = useCallback((codigo) => {
    setPermissoesSel((prev) => {
      const ativando = !prev.includes(codigo);
      const novaSel  = ativando ? [...prev, codigo] : prev.filter((p) => p !== codigo);
      if (codigo === "ADMIN_MASTER" && ativando) {
        return todasPermissoes.map((p) => p.codigo);
      }
      return novaSel;
    });
  }, [todasPermissoes]);

  const salvarUsuario = useCallback(async () => {
    if (!usuarioSelecionado) return;
    setSalvando(true);
    try {
      await api.put(`/auth/admin/usuarios/${usuarioSelecionado.id}/editar`, {
        setor_id: Number(setorSelecionado),
        permissoes: permissoesSel,
      });
      mostrarMsg("Usuário atualizado com sucesso!");
      await Promise.all([carregarUsuarios(), carregarPendentes()]);
      fecharModal();
    } catch (err) { mostrarMsg(err.message || "Erro ao salvar.", "error"); }
    finally { setSalvando(false); }
  }, [usuarioSelecionado, setorSelecionado, permissoesSel,
      carregarUsuarios, carregarPendentes, fecharModal, mostrarMsg]);

  /* ── render ── */
  return (
    <div className="ek-page">

      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Gestão de usuários</h1>
          <p>
            {podeGerenciarUsuarios
              ? "Gerencie acessos, permissões e aprovações da equipe"
              : "Aprove novos usuários e gerencie setores"}
          </p>
        </div>
      </div>

      {/* STATS */}
      <div className="ek-stats ek-stats-4">
        <div className="ek-stat neutral">
          <span className="ek-stat-label">Total de usuários</span>
          <strong className="ek-stat-value">{stats.total}</strong>
        </div>
        <div className="ek-stat success">
          <span className="ek-stat-label">Aprovados</span>
          <strong className="ek-stat-value">{stats.aprovados}</strong>
        </div>
        <div className="ek-stat warning">
          <span className="ek-stat-label">Aguardando aprovação</span>
          <strong className="ek-stat-value">{stats.pendentes}</strong>
        </div>
        <div className="ek-stat danger">
          <span className="ek-stat-label">Bloqueados</span>
          <strong className="ek-stat-value">{stats.bloqueados}</strong>
        </div>
      </div>

      {/* ── SEÇÃO: SOLICITAÇÕES DE RESET ── (somente Admin Master) */}
      {podeGerenciarUsuarios && solicitacoesReset.length > 0 && (
        <div className="ek-section">
          <div className="ek-section-head">
            <div>
              <h2>Solicitações de reset de senha</h2>
              <p>Usuários que esqueceram a senha e aguardam reset pelo administrador</p>
            </div>
            <span className="ek-count-badge" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
              {solicitacoesReset.length}
            </span>
          </div>

          <div className="ek-table-wrap">
            <div className="ek-table-scroll">
              <table className="ek-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Email</th>
                    <th>Setor</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitacoesReset.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="usr-user-cell">
                          <Inicial nome={u.nome_completo || u.nome} foto={null} />
                          <div>
                            <strong>{u.nome_completo || u.nome || "—"}</strong>
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                              Solicitou reset de senha
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{u.email}</td>
                      <td style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{u.setor || "—"}</td>
                      <td>
                        <button
                          className="ek-action-btn"
                          style={{ borderColor: "rgba(239,68,68,0.4)", color: "#f87171" }}
                          onClick={() => resetarSenha(u.id, u.nome_completo || u.nome)}
                        >
                          Resetar senha para CPF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SEÇÃO: PENDENTES ── */}
      <div className="ek-section">
        <div className="ek-section-head">
          <div>
            <h2>Aguardando aprovação</h2>
            <p>Usuários que solicitaram acesso e precisam de aprovação</p>
          </div>
          <span className="ek-count-badge">{pendentes.length}</span>
        </div>

        {pendentes.length === 0 ? (
          <div className="ek-card ek-empty">
            <div className="ek-empty-icon">✓</div>
            <h3>Nenhuma solicitação pendente</h3>
            <p>Todos os acessos estão resolvidos.</p>
          </div>
        ) : (
          <div className="ek-table-wrap">
            <div className="ek-table-scroll">
              <table className="ek-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Email</th>
                    <th>Setor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pendentes.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="usr-user-cell">
                          <Inicial nome={u.nome_completo || u.nome} foto={u.foto_url || u.foto || u.imagem_url || u.avatar_url || u.avatar || u.foto_perfil} />
                          <div>
                            <strong>{u.nome_completo || u.nome || "Não informado"}</strong>
                            {u.cadastro_origem === "pwa" && (
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                                📱 Cadastro via app do instalador — ao aprovar, já recebe a permissão Instalador
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{u.email}</td>
                      <td>
                        <select
                          className="usr-select"
                          value={u.setor_id || ""}
                          onChange={(e) => alterarSetorPendente(u.id, e.target.value)}
                        >
                          <option value="">Selecionar setor</option>
                          {setores.map((s) => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="ek-row-actions">
                          <button className="ek-action-btn success" onClick={() => aprovarUsuario(u.id)}>
                            Aprovar
                          </button>
                          {podeGerenciarUsuarios && (
                            <button className="ek-action-btn danger" onClick={() => excluirUsuario(u.id)}>
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── SEÇÃO: USUÁRIOS DO SISTEMA ── */}
      <div className="ek-section">
        <div className="ek-section-head">
          <div>
            <h2>Usuários do sistema</h2>
            <p>Equipe cadastrada com acesso ativo ou bloqueado</p>
          </div>
          <span className="ek-count-badge">{usuariosFiltrados.length}</span>
        </div>

        {/* TOOLBAR */}
        <div className="ek-toolbar">
          <div className="ek-toolbar-group" style={{ flex: 2, minWidth: 200 }}>
            <label>Buscar</label>
            <input
              type="text"
              placeholder="Nome ou email..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="ek-toolbar-group">
            <label>Status</label>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="aprovado">Aprovado</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </div>
        </div>

        {usuariosFiltrados.length === 0 ? (
          <div className="ek-card ek-empty">
            <div className="ek-empty-icon">👥</div>
            <h3>Nenhum usuário encontrado</h3>
            <p>Ajuste os filtros para ver outros resultados.</p>
          </div>
        ) : (
          <div className="ek-table-wrap">
            <div className="ek-table-scroll">
              <table className="ek-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Email</th>
                    <th>Setor</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((u) => {
                    const bloqueado = String(u.status).toLowerCase() === "bloqueado";
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="usr-user-cell">
                            <Inicial nome={u.nome_completo || u.nome} foto={u.foto_url || u.foto || u.imagem_url || u.avatar_url || u.avatar || u.foto_perfil} />
                            <div>
                              <strong>{u.nome_completo || u.nome || "Não informado"}</strong>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{u.email}</td>
                        <td style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
                          {u.setor || "—"}
                        </td>
                        <td>
                          <span className={statusBadgeClass(u.status)}>
                            {statusLabel(u.status)}
                          </span>
                        </td>
                        <td>
                          <div className="ek-row-actions">
                            {podeGerenciarUsuarios && (
                              <>
                                <button className="ek-action-btn" onClick={() => abrirModal(u)}>
                                  Editar
                                </button>
                                <button className="ek-action-btn" onClick={() => resetarSenha(u.id, u.nome_completo || u.nome)}>
                                  Resetar senha
                                </button>
                                {bloqueado ? (
                                  <button className="ek-action-btn success" onClick={() => desbloquearUsuario(u.id)}>
                                    Desbloquear
                                  </button>
                                ) : (
                                  <button className="ek-action-btn danger" onClick={() => bloquearUsuario(u.id)}>
                                    Bloquear
                                  </button>
                                )}
                                <button className="ek-action-btn danger" onClick={() => excluirUsuario(u.id)}>
                                  Excluir
                                </button>
                              </>
                            )}
                                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── TOAST ── */}
      {msg.texto && (
        <div className={`usr-toast ${msg.tipo}`}>{msg.texto}</div>
      )}

      {/* ── MODAL: EDITAR USUÁRIO ── */}
      {modalAberto && (
        <div className="modal-overlay">
          <div
            className="modal-box modal-lg"
            style={{ maxWidth: 860 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Editar usuário</h2>
                <p>Altere o setor e as permissões de acesso</p>
              </div>
              <button className="modal-close" onClick={fecharModal}>×</button>
            </div>

            <div className="modal-body">
              {/* info do usuário */}
              <div className="usr-modal-info">
                <div className="usr-info-cell">
                  <label>Nome</label>
                  <strong>
                    {usuarioSelecionado?.nome_completo || usuarioSelecionado?.nome || "—"}
                  </strong>
                </div>
                <div className="usr-info-cell">
                  <label>Email</label>
                  <strong style={{ wordBreak: "break-all" }}>
                    {usuarioSelecionado?.email || "—"}
                  </strong>
                </div>
                <div className="usr-info-cell">
                  <label>Status</label>
                  <span className={statusBadgeClass(usuarioSelecionado?.status)}>
                    {statusLabel(usuarioSelecionado?.status)}
                  </span>
                </div>
                <div className="usr-info-cell">
                  <label>Setor</label>
                  <select
                    value={setorSelecionado}
                    onChange={(e) => setSetorSelecionado(e.target.value)}
                  >
                    <option value="">Selecionar setor</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* permissões */}
              <div className="usr-perms-header">
                <h3>Permissões de acesso</h3>
                <span className="usr-perms-count">
                  {permissoesSel.length} / {todasPermissoes.length} selecionadas
                </span>
              </div>

              <div className="usr-groups">
                {Object.entries(gruposPermissoes).map(([grupo, perms]) => {
                  const selecionadasNoGrupo = perms.filter((p) =>
                    permissoesSel.includes(p.codigo)
                  ).length;

                  return (
                    <div key={grupo} className="usr-group">
                      <div className="usr-group-head">
                        <h4>{grupo}</h4>
                        <span className="usr-group-count">
                          {selecionadasNoGrupo}/{perms.length}
                        </span>
                      </div>
                      <div className="usr-perms-grid">
                        {perms.map((perm) => {
                          const checked = permissoesSel.includes(perm.codigo);
                          return (
                            <div
                              key={perm.id || perm.codigo}
                              className={`usr-perm-item${checked ? " checked" : ""}`}
                              onClick={() => togglePermissao(perm.codigo)}
                            >
                              <div className={`ek-toggle-sw${checked ? " on" : ""}`}>
                                <div className="ek-toggle-knob" />
                              </div>
                              <div className="usr-perm-text">
                                <strong>{perm.nome_exibicao || perm.codigo}</strong>
                                {perm.descricao && <span>{perm.descricao}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {Object.keys(gruposPermissoes).length === 0 && (
                  <div className="ek-empty" style={{ padding: 24 }}>
                    <p style={{ color: "var(--color-text-muted)" }}>
                      Nenhuma permissão disponível.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button className="ek-btn ek-btn-secondary" onClick={fecharModal}>
                Cancelar
              </button>
              <button className="ek-btn ek-btn-primary" onClick={salvarUsuario} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM ACTION */}
      <ConfirmModal
        open={pendingAction !== null}
        titulo={pendingAction?.titulo}
        mensagem={pendingAction?.mensagem}
        labelConfirm={pendingAction?.labelConfirm}
        variante={pendingAction?.variante}
        onConfirm={async () => { const fn = pendingAction?.fn; setPendingAction(null); await fn?.(); }}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
