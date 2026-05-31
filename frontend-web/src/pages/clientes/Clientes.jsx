import { useState, useMemo, useRef, useEffect } from "react";
import useClientes from "./hooks/useClientes";
import ConfirmModal from "../../components/ConfirmModal";
import "./Clientes.css";

/* ── CONSTANTES ── */
const CATEGORIAS = [
  { value: "residencial", label: "Residencial", icon: "🏠" },
  { value: "comercial",   label: "Comercial",   icon: "🏢" },
  { value: "obra",        label: "Obra",         icon: "🏗" },
  { value: "outro",       label: "Outro",        icon: "📍" },
];

const CAT_META = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c]));

function fmtCpf(v = "") {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0,3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6)}`;
  return `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;
}

function fmtCnpj(v = "") {
  const n = v.replace(/\D/g, "").slice(0, 14);
  if (n.length <= 2)  return n;
  if (n.length <= 5)  return `${n.slice(0,2)}.${n.slice(2)}`;
  if (n.length <= 8)  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`;
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
}

function fmtTelefone(v = "") {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2)  return n;
  if (n.length <= 6)  return `(${n.slice(0,2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
}

function enderecoResumido(e) {
  const partes = [e.rua, e.numero, e.bairro, e.cidade, e.estado ? `- ${e.estado}` : ""].filter(Boolean);
  return partes.join(", ") || "Sem endereço cadastrado";
}

/* ── COMPONENTE PRINCIPAL ── */
export default function Clientes() {
  const {
    clientes, loading, erro, carregar,
    criar, atualizar, excluir,
    adicionarEndereco, atualizarEndereco, removerEndereco, definirPadrao,
  } = useClientes();

  const [busca,         setBusca]         = useState("");
  const [modalCliente,  setModalCliente]  = useState(null);  // null | "novo" | cliente
  const [clienteDetalhe, setClienteDetalhe] = useState(null);
  const [modalEndereco, setModalEndereco] = useState(null); // null | { clienteId, endereco? }
  const [salvando,      setSalvando]      = useState(false);
  const [toast,         setToast]         = useState({ texto: "", tipo: "" });
  const [excluindoId,   setExcluindoId]   = useState(null);
  const [confirmCliente, setConfirmCliente] = useState(null); // id a excluir
  const [confirmEndereco, setConfirmEndereco] = useState(null); // { clienteId, endId }

  const detalheRef = useRef(null);

  function mostrarToast(texto, tipo = "success") {
    setToast({ texto, tipo });
    setTimeout(() => setToast({ texto: "", tipo: "" }), 3500);
  }

  const clientesFiltrados = useMemo(() => {
    if (!busca.trim()) return clientes;
    const b = busca.toLowerCase();
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(b) ||
        (c.telefone || "").includes(b) ||
        (c.email || "").toLowerCase().includes(b) ||
        (c.cpf  || "").replace(/\D/g, "").includes(b.replace(/\D/g, "")) ||
        (c.cnpj || "").replace(/\D/g, "").includes(b.replace(/\D/g, ""))
    );
  }, [clientes, busca]);

  /* Manter detalhe sincronizado */
  const clienteDetalheAtual = useMemo(() => {
    if (!clienteDetalhe) return null;
    return clientes.find((c) => c.id === clienteDetalhe.id) || null;
  }, [clientes, clienteDetalhe]);

  useEffect(() => {
    if (clienteDetalheAtual?.id && window.innerWidth < 900) {
      detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [clienteDetalheAtual?.id]);

  async function handleSalvarCliente(dados) {
    setSalvando(true);
    try {
      if (modalCliente === "novo") {
        const novo = await criar(dados);
        mostrarToast("Cliente criado com sucesso!");
        setModalCliente(null);
        setClienteDetalhe(novo);
      } else {
        await atualizar(modalCliente.id, dados);
        mostrarToast("Cliente atualizado!");
        setModalCliente(null);
      }
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar cliente.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusaoCliente() {
    const id = confirmCliente;
    setConfirmCliente(null);
    setExcluindoId(id);
    try {
      await excluir(id);
      if (clienteDetalhe?.id === id) setClienteDetalhe(null);
      mostrarToast("Cliente removido.");
    } catch (e) {
      mostrarToast(e.message || "Erro ao remover.", "error");
    } finally {
      setExcluindoId(null);
    }
  }

  async function handleSalvarEndereco(dados) {
    setSalvando(true);
    try {
      if (modalEndereco.endereco) {
        await atualizarEndereco(modalEndereco.clienteId, modalEndereco.endereco.id, dados);
        mostrarToast("Endereço atualizado!");
      } else {
        await adicionarEndereco(modalEndereco.clienteId, dados);
        mostrarToast("Endereço adicionado!");
      }
      setModalEndereco(null);
    } catch (e) {
      mostrarToast(e.message || "Erro ao salvar endereço.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemocaoEndereco() {
    const { clienteId, endId } = confirmEndereco;
    setConfirmEndereco(null);
    try {
      await removerEndereco(clienteId, endId);
      mostrarToast("Endereço removido.");
    } catch (e) {
      mostrarToast(e.message || "Erro ao remover endereço.", "error");
    }
  }

  async function handleDefinirPadrao(clienteId, endId) {
    try {
      await definirPadrao(clienteId, endId);
      mostrarToast("Endereço padrão definido!");
    } catch (e) {
      mostrarToast(e.message || "Erro.", "error");
    }
  }

  return (
    <div className="ek-page">

      {/* HEADER */}
      <div className="ek-head">
        <div className="ek-head-info">
          <h1>Clientes</h1>
          <p>Gerencie clientes e seus endereços</p>
        </div>
        <div className="ek-head-actions">
          <button className="ek-btn ek-btn-primary" onClick={() => setModalCliente("novo")}>
            + Novo cliente
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="ek-toolbar" style={{ marginBottom: 20 }}>
        <div className="ek-toolbar-group" style={{ flex: 1 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Nome, telefone ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="ek-toolbar-group" style={{ alignSelf: "flex-end" }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* LAYOUT: LISTA + DETALHE */}
      <div className="cl-layout">

        {/* LISTA */}
        <div className="cl-lista">
          {loading && (
            <div className="ek-empty" style={{ padding: 40 }}>
              <div className="cl-spinner" />
              <p style={{ color: "var(--color-text-muted)", marginTop: 14 }}>Carregando clientes...</p>
            </div>
          )}

          {!loading && erro && (
            <div className="cl-erro-banner" style={{ margin: "16px 0" }}>
              <span>⚠ {erro}</span>
              <button onClick={carregar}>Tentar novamente</button>
            </div>
          )}

          {!loading && !erro && clientesFiltrados.length === 0 && (
            <div className="ek-empty" style={{ padding: 40 }}>
              <div className="ek-empty-icon">👤</div>
              <p style={{ color: "var(--color-text-muted)" }}>
                {busca ? "Nenhum cliente encontrado para esta busca." : "Nenhum cliente cadastrado ainda."}
              </p>
              {!busca && (
                <button
                  className="ek-btn ek-btn-primary"
                  style={{ marginTop: 12, fontSize: 12 }}
                  onClick={() => setModalCliente("novo")}
                >
                  + Cadastrar primeiro cliente
                </button>
              )}
            </div>
          )}

          {clientesFiltrados.map((c) => {
            const padrão = c.enderecos?.find((e) => e.is_padrao) || c.enderecos?.[0];
            const isAtivo = clienteDetalheAtual?.id === c.id;
            return (
              <div
                key={c.id}
                className={`cl-card${isAtivo ? " active" : ""}`}
                onClick={() => setClienteDetalhe(c)}
              >
                <div className="cl-card-avatar">{c.nome.trim()[0].toUpperCase()}</div>
                <div className="cl-card-body">
                  <div className="cl-card-nome">{c.nome}</div>
                  {(c.cpf || c.cnpj) && (
                    <div className="cl-card-info" style={{ fontFamily: "monospace", fontSize: 12 }}>{c.cpf || c.cnpj}</div>
                  )}
                  {c.telefone && (
                    <div className="cl-card-info">📱 {c.telefone}</div>
                  )}
                  {padrão && (
                    <div className="cl-card-info" style={{ color: "var(--color-text-muted)" }}>
                      📍 {enderecoResumido(padrão)}
                    </div>
                  )}
                  <div className="cl-card-tags">
                    <span className="cl-tag">{c.enderecos?.length || 0} endereço{c.enderecos?.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="cl-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="cl-icon-btn"
                    title="Editar"
                    onClick={() => setModalCliente(c)}
                  >✏</button>
                  <button
                    className="cl-icon-btn danger"
                    title="Excluir"
                    disabled={excluindoId === c.id}
                    onClick={() => setConfirmCliente(c.id)}
                  >🗑</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* PAINEL DE DETALHE */}
        <div className="cl-detalhe" ref={detalheRef}>
          {!clienteDetalheAtual ? (
            <div className="ek-empty" style={{ padding: 60 }}>
              <div className="ek-empty-icon">👈</div>
              <p style={{ color: "var(--color-text-muted)" }}>Selecione um cliente para ver os detalhes</p>
            </div>
          ) : (
            <DetalheCliente
              cliente={clienteDetalheAtual}
              onEditar={() => setModalCliente(clienteDetalheAtual)}
              onAdicionarEndereco={() => setModalEndereco({ clienteId: clienteDetalheAtual.id })}
              onEditarEndereco={(e) => setModalEndereco({ clienteId: clienteDetalheAtual.id, endereco: e })}
              onRemoverEndereco={(endId) => setConfirmEndereco({ clienteId: clienteDetalheAtual.id, endId })}
              onDefinirPadrao={(endId) => handleDefinirPadrao(clienteDetalheAtual.id, endId)}
            />
          )}
        </div>

      </div>

      {/* CONFIRM EXCLUIR CLIENTE */}
      <ConfirmModal
        open={confirmCliente !== null}
        titulo="Excluir cliente"
        mensagem="Esta ação não pode ser desfeita. Deseja realmente excluir este cliente?"
        labelConfirm="Excluir"
        variante="danger"
        onConfirm={confirmarExclusaoCliente}
        onCancel={() => setConfirmCliente(null)}
      />

      {/* CONFIRM REMOVER ENDEREÇO */}
      <ConfirmModal
        open={confirmEndereco !== null}
        titulo="Remover endereço"
        mensagem="Deseja realmente remover este endereço?"
        labelConfirm="Remover"
        variante="danger"
        onConfirm={confirmarRemocaoEndereco}
        onCancel={() => setConfirmEndereco(null)}
      />

      {/* TOAST */}
      {toast.texto && (
        <div
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 9999,
            padding: "12px 18px", borderRadius: "var(--radius-md)",
            background: "var(--color-surface-strong)", border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-medium)", fontSize: 13, fontWeight: 500,
            color: "var(--color-text)", maxWidth: 360,
            borderLeft: `3px solid ${toast.tipo === "error" ? "#ef4444" : "#22c55e"}`,
          }}
        >
          {toast.texto}
        </div>
      )}

      {/* MODAL: NOVO/EDITAR CLIENTE */}
      {modalCliente && (
        <ClienteModal
          cliente={modalCliente === "novo" ? null : modalCliente}
          onClose={() => setModalCliente(null)}
          onSalvar={handleSalvarCliente}
          salvando={salvando}
        />
      )}

      {/* MODAL: NOVO/EDITAR ENDEREÇO */}
      {modalEndereco && (
        <EnderecoModal
          endereco={modalEndereco.endereco || null}
          onClose={() => setModalEndereco(null)}
          onSalvar={handleSalvarEndereco}
          salvando={salvando}
        />
      )}

    </div>
  );
}

/* ── DETALHE DO CLIENTE ── */
function DetalheCliente({ cliente, onEditar, onAdicionarEndereco, onEditarEndereco, onRemoverEndereco, onDefinirPadrao }) {
  return (
    <div className="cl-detalhe-inner">
      {/* Header */}
      <div className="cl-detalhe-header">
        <div className="cl-detalhe-avatar">{cliente.nome.trim()[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h2 className="cl-detalhe-nome">{cliente.nome}</h2>
          <div className="cl-detalhe-contatos">
            {cliente.cpf && (
              <span className="cl-contato-link" style={{ fontFamily: "monospace", cursor: "default" }}>
                🪪 CPF: {cliente.cpf}
              </span>
            )}
            {cliente.cnpj && (
              <span className="cl-contato-link" style={{ fontFamily: "monospace", cursor: "default" }}>
                🪪 CNPJ: {cliente.cnpj}
              </span>
            )}
            {cliente.telefone && (
              <a href={`https://wa.me/55${cliente.telefone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="cl-contato-link">
                📱 {cliente.telefone}
              </a>
            )}
            {cliente.email && (
              <a href={`mailto:${cliente.email}`} className="cl-contato-link">
                ✉ {cliente.email}
              </a>
            )}
          </div>
        </div>
        <button className="ek-btn ek-btn-secondary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={onEditar}>
          ✏ Editar
        </button>
      </div>

      {/* Endereços */}
      <div className="cl-enderecos-section">
        <div className="cl-section-head">
          <span className="cl-section-title">Endereços</span>
          <button className="ek-btn ek-btn-primary" style={{ fontSize: 12, padding: "5px 14px" }} onClick={onAdicionarEndereco}>
            + Adicionar
          </button>
        </div>

        {cliente.enderecos?.length === 0 && (
          <div className="ek-empty" style={{ padding: 30 }}>
            <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Nenhum endereço cadastrado.</p>
          </div>
        )}

        <div className="cl-enderecos-list">
          {cliente.enderecos?.map((e) => {
            const cat = CAT_META[e.categoria] || CAT_META.outro;
            return (
              <div key={e.id} className={`cl-endereco-card${e.is_padrao ? " padrao" : ""}`}>
                <div className="cl-endereco-top">
                  <span className="cl-endereco-cat">{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div className="cl-endereco-label">
                      {e.label}
                      {e.is_padrao && <span className="cl-padrao-badge">Padrão</span>}
                    </div>
                    <div className="cl-endereco-cat-tag">{cat.label}</div>
                  </div>
                  <div className="cl-endereco-actions">
                    {!e.is_padrao && (
                      <button className="cl-icon-btn" title="Definir como padrão" onClick={() => onDefinirPadrao(e.id)}>
                        ⭐
                      </button>
                    )}
                    <button className="cl-icon-btn" title="Editar" onClick={() => onEditarEndereco(e)}>✏</button>
                    <button className="cl-icon-btn danger" title="Remover" onClick={() => onRemoverEndereco(e.id)}>🗑</button>
                  </div>
                </div>

                <div className="cl-endereco-info">
                  {[e.rua && `${e.rua}${e.numero ? ", " + e.numero : ""}${e.complemento ? " - " + e.complemento : ""}`,
                    e.bairro,
                    [e.cidade, e.estado].filter(Boolean).join(" - "),
                    e.cep ? `CEP ${e.cep}` : "",
                  ].filter(Boolean).map((linha, i) => (
                    <div key={i} className="cl-endereco-linha">{linha}</div>
                  ))}
                  {e.referencia && (
                    <div className="cl-endereco-referencia">📌 {e.referencia}</div>
                  )}
                </div>

                <div className="cl-endereco-mapa-link">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(enderecoResumido(e))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cl-link-mapa"
                  >
                    🗺 Ver no Google Maps
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── MODAL: CLIENTE ── */
function ClienteModal({ cliente, onClose, onSalvar, salvando }) {
  const [form, setForm] = useState({
    nome:     cliente?.nome     ?? "",
    cpf:      cliente?.cpf      ?? "",
    cnpj:     cliente?.cnpj     ?? "",
    telefone: cliente?.telefone ?? "",
    email:    cliente?.email    ?? "",
  });
  const [erroForm, setErroForm] = useState("");

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); if (erroForm) setErroForm(""); }

  function handleTelefone(v) { set("telefone", fmtTelefone(v)); }
  function handleCpf(v)  { set("cpf",  fmtCpf(v));  }
  function handleCnpj(v) { set("cnpj", fmtCnpj(v)); }

  function salvar() {
    if (!form.nome.trim()) { setErroForm("Nome é obrigatório."); return; }
    onSalvar(form);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{cliente ? "Editar cliente" : "Novo cliente"}</h2>
            <p>Dados de contato do cliente</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ag-form-field">
            <label>Nome *</label>
            <input
              placeholder="Nome completo ou razão social"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              style={erroForm ? { borderColor: "#ef4444" } : undefined}
            />
            {erroForm && (
              <span style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{erroForm}</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="ag-form-field">
              <label>CPF</label>
              <input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => handleCpf(e.target.value)}
                maxLength={14}
                disabled={!!form.cnpj}
                style={{ fontFamily: "monospace", opacity: form.cnpj ? 0.45 : 1 }}
              />
            </div>
            <div className="ag-form-field">
              <label>CNPJ</label>
              <input
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => handleCnpj(e.target.value)}
                maxLength={18}
                disabled={!!form.cpf}
                style={{ fontFamily: "monospace", opacity: form.cpf ? 0.45 : 1 }}
              />
            </div>
          </div>
          <div className="ag-form-field">
            <label>Telefone / WhatsApp</label>
            <input
              placeholder="(00) 00000-0000"
              value={form.telefone}
              onChange={(e) => handleTelefone(e.target.value)}
              maxLength={15}
            />
          </div>
          <div className="ag-form-field">
            <label>E-mail (opcional)</label>
            <input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : cliente ? "Salvar alterações" : "Criar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MODAL: ENDEREÇO ── */
function EnderecoModal({ endereco, onClose, onSalvar, salvando }) {
  const [erroForm, setErroForm] = useState("");
  const [form, setForm] = useState({
    label:       endereco?.label       ?? "",
    categoria:   endereco?.categoria   ?? "residencial",
    cep:         endereco?.cep         ?? "",
    rua:         endereco?.rua         ?? "",
    numero:      endereco?.numero      ?? "",
    complemento: endereco?.complemento ?? "",
    bairro:      endereco?.bairro      ?? "",
    cidade:      endereco?.cidade      ?? "",
    estado:      endereco?.estado      ?? "",
    referencia:  endereco?.referencia  ?? "",
    is_padrao:   endereco?.is_padrao   ?? false,
  });
  const [buscandoCEP,    setBuscandoCEP]    = useState(false);
  const [linhaEndereco,  setLinhaEndereco]  = useState("");
  const [geocStatus,     setGeocStatus]     = useState("idle"); // idle | buscando | encontrado | nao_encontrado
  const geocTimer = useRef(null);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function handleLinhaEndereco(valor) {
    setLinhaEndereco(valor);
    setGeocStatus("idle");
    clearTimeout(geocTimer.current);
    if (!valor.trim() || valor.trim().length < 10) return;
    geocTimer.current = setTimeout(async () => {
      setGeocStatus("buscando");
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(valor.trim())}`;
        const r = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
        const data = await r.json();
        if (!data.length) { setGeocStatus("nao_encontrado"); return; }
        const addr = data[0].address || {};
        setForm((p) => ({
          ...p,
          rua:    addr.road || addr.pedestrian || addr.footway || p.rua,
          numero: addr.house_number || p.numero,
          bairro: addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || p.bairro,
          cidade: addr.city || addr.town || addr.village || addr.municipality || p.cidade,
          estado: addr.state_code || (addr.state ? addr.state.slice(0,2).toUpperCase() : "") || p.estado,
          cep:    addr.postcode ? addr.postcode.replace(/\D/g,"").slice(0,8) : p.cep,
        }));
        setGeocStatus("encontrado");
      } catch {
        setGeocStatus("nao_encontrado");
      }
    }, 900);
  }

  function handleCEP(valor) {
    const n = valor.replace(/\D/g, "").slice(0, 8);
    const fmt = n.length > 5 ? `${n.slice(0,5)}-${n.slice(5)}` : n;
    set("cep", fmt);
    if (n.length === 8) {
      setBuscandoCEP(true);
      fetch(`https://viacep.com.br/ws/${n}/json/`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.erro) {
            setForm((p) => ({
              ...p,
              rua:    d.logradouro || p.rua,
              bairro: d.bairro     || p.bairro,
              cidade: d.localidade || p.cidade,
              estado: d.uf         || p.estado,
            }));
          }
        })
        .catch(() => {})
        .finally(() => setBuscandoCEP(false));
    }
  }

  function salvar() {
    if (!form.label.trim()) { setErroForm("Identificador é obrigatório."); return; }
    onSalvar(form);
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-box modal-lg"
        style={{ maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{endereco ? "Editar endereço" : "Novo endereço"}</h2>
            <p>Informe os dados do endereço</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Colar endereço em linha única */}
          <div className="cl-linha-endereco-wrap">
            <label className="cl-linha-endereco-label">Cole o endereço completo</label>
            <div className="cl-linha-endereco-row">
              <input
                className="cl-linha-endereco-input"
                placeholder='Ex: Rua das Flores, 123, Batel, Curitiba - PR'
                value={linhaEndereco}
                onChange={(e) => handleLinhaEndereco(e.target.value)}
              />
              {geocStatus === "buscando" && <span className="cl-geoc-status buscando">Buscando...</span>}
              {geocStatus === "encontrado" && <span className="cl-geoc-status encontrado">Encontrado</span>}
              {geocStatus === "nao_encontrado" && <span className="cl-geoc-status nao_encontrado">Não encontrado</span>}
            </div>
            {geocStatus === "encontrado" && (
              <p className="cl-geoc-hint">Campos preenchidos automaticamente. Confira e ajuste se necessário.</p>
            )}
          </div>

          <div className="cl-divider-linha">— ou preencha manualmente —</div>

          {/* Identificador + Categoria */}
          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Identificador (label) *</label>
              <input
                placeholder='Ex: "Casa Batel", "Filial Centro"'
                value={form.label}
                onChange={(e) => { set("label", e.target.value); if (erroForm) setErroForm(""); }}
                style={erroForm ? { borderColor: "#ef4444" } : undefined}
              />
              {erroForm && (
                <span style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>{erroForm}</span>
              )}
            </div>
            <div className="ag-form-field">
              <label>Categoria</label>
              <select value={form.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CEP */}
          <div className="ag-form-field" style={{ maxWidth: 200 }}>
            <label>CEP</label>
            <input
              placeholder="00000-000"
              value={form.cep}
              onChange={(e) => handleCEP(e.target.value)}
              maxLength={9}
            />
            {buscandoCEP && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Buscando...</span>}
          </div>

          {/* Rua */}
          <div className="ag-form-field">
            <label>Rua / Avenida</label>
            <input placeholder="Ex: Rua das Flores" value={form.rua} onChange={(e) => set("rua", e.target.value)} />
          </div>

          {/* Número + Complemento */}
          <div className="ag-modal-grid">
            <div className="ag-form-field">
              <label>Número</label>
              <input placeholder="123" value={form.numero} onChange={(e) => set("numero", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Complemento</label>
              <input placeholder="Apto, bloco..." value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
            </div>
          </div>

          {/* Bairro + Cidade + Estado */}
          <div className="ag-modal-grid" style={{ gridTemplateColumns: "1fr 1fr 80px" }}>
            <div className="ag-form-field">
              <label>Bairro</label>
              <input placeholder="Bairro" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>Cidade</label>
              <input placeholder="Cidade" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div className="ag-form-field">
              <label>UF</label>
              <input placeholder="PR" value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase().slice(0,2))} maxLength={2} />
            </div>
          </div>

          {/* Referência */}
          <div className="ag-form-field">
            <label>Referência (opcional)</label>
            <input placeholder="Ex: Próximo ao mercado, portão azul..." value={form.referencia} onChange={(e) => set("referencia", e.target.value)} />
          </div>

          {/* Padrão */}
          <div
            className="cl-toggle-label"
            onClick={() => set("is_padrao", !form.is_padrao)}
          >
            <div className={`ek-toggle-sw${form.is_padrao ? " on" : ""}`}>
              <div className="ek-toggle-knob" />
            </div>
            <span>Definir como endereço padrão</span>
          </div>

        </div>

        <div className="modal-actions">
          <button className="ek-btn ek-btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button className="ek-btn ek-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : endereco ? "Salvar alterações" : "Adicionar endereço"}
          </button>
        </div>
      </div>
    </div>
  );
}
