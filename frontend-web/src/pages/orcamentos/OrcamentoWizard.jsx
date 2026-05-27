import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";

// ── helpers ────────────────────────────────────────────────────────────────
function itemVazio(ambiente = "") {
  return { _key: Math.random(), produto_id: null, produto_nome: "", ambiente, quantidade: 1, largura: "", altura: "", cor: "", referencia: "", preco_unitario: "" };
}
function ambienteVazio(nome = "") {
  return { _key: Math.random(), nome, itens: [itemVazio(nome)] };
}
function fmtMoeda(v) {
  const n = parseFloat(String(v || "0").replace(",", ".")) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}
function calcSubtotal(itens) {
  return itens.reduce((s, it) => {
    const q = parseFloat(it.quantidade) || 0;
    const p = parseFloat(String(it.preco_unitario || "0").replace(",", ".")) || 0;
    return s + q * p;
  }, 0);
}

// ── Autocomplete genérico ──────────────────────────────────────────────────
function Autocomplete({ placeholder, value, onSelect, onClear, fetchFn, renderOption, renderValue }) {
  const [query, setQuery] = useState("");
  const [opcoes, setOpcoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buscar = useCallback(async (q) => {
    if (!q || q.length < 1) { setOpcoes([]); return; }
    try { const res = await fetchFn(q); setOpcoes(res); setAberto(true); } catch { setOpcoes([]); }
  }, [fetchFn]);

  useEffect(() => {
    const t = setTimeout(() => buscar(query), 250);
    return () => clearTimeout(t);
  }, [query, buscar]);

  if (value) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <span style={{ flex:1, fontSize:13, color:"var(--color-text)" }}>{renderValue(value)}</span>
        <button type="button" onClick={onClear} style={{ background:"none",border:"none",cursor:"pointer",color:"#6b7280",fontSize:14 }}>✕</button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <input
        style={{ width:"100%", background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:13 }}
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => query && setAberto(true)}
      />
      {aberto && opcoes.length > 0 && (
        <div style={{ position:"absolute", zIndex:100, top:"100%", left:0, right:0, background:"#1f2937", border:"1px solid var(--color-border)", borderRadius:4, maxHeight:200, overflowY:"auto" }}>
          {opcoes.map((op, i) => (
            <div key={i} onMouseDown={() => { onSelect(op); setQuery(""); setAberto(false); }}
              style={{ padding:"6px 10px", cursor:"pointer", fontSize:12, color:"var(--color-text)", borderBottom:"1px solid #374151" }}
              onMouseEnter={e => e.currentTarget.style.background="#374151"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}
            >
              {renderOption(op)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Barra de progresso ─────────────────────────────────────────────────────
function BarraProgresso({ etapa }) {
  const passos = ["① Cliente", "② Itens", "③ Revisão"];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:28 }}>
      {passos.map((p, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", flex: i < 2 ? 1 : "unset" }}>
          <div style={{
            padding:"4px 14px", borderRadius:12, fontSize:12, fontWeight:600, whiteSpace:"nowrap",
            background: i < etapa ? "#059669" : i === etapa ? "var(--color-primary)" : "var(--color-card)",
            color: i <= etapa ? "#fff" : "var(--color-text-muted)",
            border: `1px solid ${i < etapa ? "#059669" : i === etapa ? "var(--color-primary)" : "var(--color-border)"}`,
          }}>{i < etapa ? p + " ✓" : p}</div>
          {i < 2 && <div style={{ flex:1, height:1, background:"var(--color-border)", minWidth:12 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Etapa 1 ─────────────────────────────────────────────────────────────────
function Etapa1({ dados, onChange, onNext }) {
  const [erroCliente, setErroCliente] = useState("");
  const [endAberto, setEndAberto] = useState(!!dados.endereco_entrega?.rua);
  const [mostrarEnderecos, setMostrarEnderecos] = useState(false);

  function buscarClientes(q) {
    return api.get(`/clientes/busca?q=${encodeURIComponent(q)}`).then(r => r.clientes);
  }
  function buscarArquitetos(q) {
    return api.get(`/arquitetos?q=${encodeURIComponent(q)}`).then(r => r.arquitetos);
  }

  function usarEndereco(end) {
    onChange("endereco_entrega", {
      rua: end.rua || "", numero: end.numero || "", complemento: end.complemento || "",
      bairro: end.bairro || "", cidade: end.cidade || "", estado: end.estado || "", cep: end.cep || "",
    });
    setEndAberto(true);
    setMostrarEnderecos(false);
  }

  function avancar() {
    if (!dados.cliente_id) { setErroCliente("Selecione um cliente."); return; }
    setErroCliente("");
    onNext();
  }

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const endEnt = dados.endereco_entrega || {};
  const enderecos = dados.cliente?.enderecos || [];

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>CLIENTE *</label>
          <Autocomplete
            placeholder="Buscar cliente..."
            value={dados.cliente}
            onSelect={c => { onChange("cliente_id", c.id); onChange("cliente", c); setMostrarEnderecos(false); }}
            onClear={() => { onChange("cliente_id", null); onChange("cliente", null); setMostrarEnderecos(false); }}
            fetchFn={buscarClientes}
            renderOption={c => `${c.nome} — ${c.telefone || ""}`}
            renderValue={c => `${c.nome}${c.telefone ? " — " + c.telefone : ""}`}
          />
          {erroCliente && <span style={{ color:"#ef4444", fontSize:11 }}>{erroCliente}</span>}
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>CONSULTORA</label>
          <div style={{ background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", fontSize:13, color:"var(--color-text-muted)" }}>
            {user.nome_completo || "—"} (você)
          </div>
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>ARQUITETO (opcional)</label>
          <Autocomplete
            placeholder="Buscar arquiteto..."
            value={dados.arquiteto}
            onSelect={a => { onChange("arquiteto_id", a.id); onChange("arquiteto", a); }}
            onClear={() => { onChange("arquiteto_id", null); onChange("arquiteto", null); }}
            fetchFn={buscarArquitetos}
            renderOption={a => a.nome}
            renderValue={a => a.nome}
          />
        </div>
        <div>
          <label style={{ display:"block", fontSize:11, color:"var(--color-text-muted)", marginBottom:4 }}>OBSERVAÇÕES</label>
          <textarea
            rows={2}
            style={{ width:"100%", background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:13, resize:"vertical" }}
            placeholder="Observações gerais..."
            value={dados.observacoes || ""}
            onChange={e => onChange("observacoes", e.target.value)}
          />
        </div>
      </div>

      {/* Endereço opcional */}
      <div style={{ border:"1px dashed var(--color-border)", borderRadius:6, padding:12, marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:(endAberto || mostrarEnderecos) ? 10 : 0 }}>
          <span style={{ fontSize:11, color:"var(--color-text-muted)" }}>
            ENDEREÇO DE ENTREGA <span style={{ color:"#6b7280" }}>(opcional)</span>
          </span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {dados.cliente && enderecos.length === 1 && (
              <button type="button" onClick={() => usarEndereco(enderecos[0])} style={{ background:"none",border:"none",color:"var(--color-primary)",fontSize:11,cursor:"pointer" }}>
                Usar endereço do cliente ↙
              </button>
            )}
            {dados.cliente && enderecos.length > 1 && (
              <button type="button" onClick={() => setMostrarEnderecos(v => !v)} style={{ background:"none",border:"none",color:"var(--color-primary)",fontSize:11,cursor:"pointer" }}>
                {mostrarEnderecos ? "▲" : "▼"} Endereços do cliente ({enderecos.length})
              </button>
            )}
            <button type="button" onClick={() => setEndAberto(v => !v)} style={{ background:"none",border:"none",color:"#6b7280",fontSize:11,cursor:"pointer" }}>
              {endAberto ? "▲ Recolher" : "▼ Preencher manualmente"}
            </button>
          </div>
        </div>

        {mostrarEnderecos && enderecos.length > 1 && (
          <div style={{ marginBottom:10, display:"flex", flexDirection:"column", gap:4 }}>
            {enderecos.map((end, i) => {
              const resumo = [end.rua, end.numero, end.bairro, end.cidade, end.estado].filter(Boolean).join(", ");
              return (
                <div key={end.id || i} onClick={() => usarEndereco(end)}
                  style={{ padding:"7px 10px", borderRadius:4, border:"1px solid var(--color-border)", cursor:"pointer", fontSize:12, display:"flex", gap:8, alignItems:"flex-start", background:"transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background="var(--color-card)"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >
                  {end.is_padrao && <span style={{ color:"#f59e0b", fontSize:11, flexShrink:0 }}>★</span>}
                  <span>
                    <strong>{end.label}</strong>
                    {resumo ? ` — ${resumo}` : ""}
                    {end.cep ? ` · CEP ${end.cep}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {endAberto && (
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8 }}>
            {[["rua","Rua / Logradouro"],["numero","Número"],["complemento","Complemento"],["bairro","Bairro"],["cidade","Cidade"],["estado","Estado"],["cep","CEP"]].map(([campo, label]) => (
              <div key={campo}>
                <input
                  placeholder={label}
                  value={endEnt[campo] || ""}
                  onChange={e => onChange("endereco_entrega", { ...endEnt, [campo]: e.target.value })}
                  style={{ width:"100%", background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:12 }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button type="button" onClick={avancar}
          style={{ padding:"8px 20px", background:"var(--color-primary)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
          Próximo: Itens →
        </button>
      </div>
    </div>
  );
}

// ── Etapa 2 ─────────────────────────────────────────────────────────────────
function Etapa2({ ambientes, setAmbientes, onBack, onNext }) {
  const [novoAmbNome, setNovoAmbNome] = useState("");
  const [adicionandoAmb, setAdicionandoAmb] = useState(false);
  const [expandidos, setExpandidos] = useState(() => {
    const m = {};
    ambientes.forEach(a => { m[a._key] = true; });
    return m;
  });
  const [erro, setErro] = useState("");

  function buscarProdutos(q) {
    return api.get(`/produtos/busca?q=${encodeURIComponent(q)}`).then(r => r.produtos);
  }

  function toggleExpand(key) {
    setExpandidos(v => ({ ...v, [key]: !v[key] }));
  }

  function adicionarAmbiente() {
    if (!novoAmbNome.trim()) return;
    const amb = ambienteVazio(novoAmbNome.trim());
    setAmbientes(prev => [...prev, amb]);
    setExpandidos(v => ({ ...v, [amb._key]: true }));
    setNovoAmbNome("");
    setAdicionandoAmb(false);
  }

  function removerAmbiente(key) {
    if (!confirm("Remover este ambiente e todos os seus itens?")) return;
    setAmbientes(prev => prev.filter(a => a._key !== key));
  }

  function atualizarItem(ambKey, itemKey, campo, valor) {
    setAmbientes(prev => prev.map(a => a._key !== ambKey ? a : {
      ...a,
      itens: a.itens.map(it => it._key !== itemKey ? it : { ...it, [campo]: valor })
    }));
  }

  function adicionarItem(ambKey) {
    const amb = ambientes.find(a => a._key === ambKey);
    setAmbientes(prev => prev.map(a => a._key !== ambKey ? a : {
      ...a, itens: [...a.itens, itemVazio(amb?.nome || "")]
    }));
  }

  function removerItem(ambKey, itemKey) {
    setAmbientes(prev => prev.map(a => a._key !== ambKey ? a : {
      ...a, itens: a.itens.filter(it => it._key !== itemKey)
    }));
  }

  function avancar() {
    const temItem = ambientes.some(a => a.itens.some(it => it.produto_nome || it.produto_id));
    if (!temItem) { setErro("Adicione pelo menos um item com produto preenchido."); return; }
    setErro("");
    onNext();
  }

  const inputStyle = { background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:3, padding:"4px 6px", color:"var(--color-text)", fontSize:12, width:"100%" };

  return (
    <div>
      {ambientes.map(amb => {
        const subtotal = calcSubtotal(amb.itens);
        const expandido = expandidos[amb._key] !== false;
        return (
          <div key={amb._key} style={{ border:"1px solid var(--color-border)", borderRadius:6, marginBottom:8, overflow:"hidden" }}>
            <div onClick={() => toggleExpand(amb._key)}
              style={{ background:"var(--color-card)", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
              <span style={{ fontWeight:600, fontSize:13 }}>
                {expandido ? "▼" : "▶"} {amb.nome}
                <span style={{ color:"var(--color-text-muted)", fontWeight:400, fontSize:11, marginLeft:8 }}>
                  ({amb.itens.length} {amb.itens.length === 1 ? "item" : "itens"} · R$ {fmtMoeda(subtotal)})
                </span>
              </span>
              <button type="button" onClick={e => { e.stopPropagation(); removerAmbiente(amb._key); }}
                style={{ background:"none", border:"none", color:"#ef4444", fontSize:12, cursor:"pointer" }}>
                🗑 remover
              </button>
            </div>
            {expandido && (
              <div style={{ padding:10, background:"var(--color-bg)" }}>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 0.5fr 0.7fr 0.7fr 1fr 1fr 0.3fr", gap:4, marginBottom:4 }}>
                  {["PRODUTO","QTD","LARG (m)","ALT (m)","COR","R$ UNIT",""].map((h,i) => (
                    <div key={i} style={{ fontSize:9, color:"var(--color-text-muted)", fontWeight:600, textTransform:"uppercase" }}>{h}</div>
                  ))}
                </div>
                {amb.itens.map(it => (
                  <div key={it._key} style={{ display:"grid", gridTemplateColumns:"2fr 0.5fr 0.7fr 0.7fr 1fr 1fr 0.3fr", gap:4, marginBottom:4, alignItems:"center" }}>
                    <Autocomplete
                      placeholder="Produto..."
                      value={it.produto_id ? { id: it.produto_id, nome: it.produto_nome } : null}
                      onSelect={p => { atualizarItem(amb._key, it._key, "produto_id", p.id); atualizarItem(amb._key, it._key, "produto_nome", p.nome); atualizarItem(amb._key, it._key, "preco_unitario", String(p.preco_venda || "")); }}
                      onClear={() => { atualizarItem(amb._key, it._key, "produto_id", null); atualizarItem(amb._key, it._key, "produto_nome", ""); }}
                      fetchFn={buscarProdutos}
                      renderOption={p => `${p.nome}${p.referencia ? " — " + p.referencia : ""}`}
                      renderValue={p => p.nome}
                    />
                    <input style={inputStyle} type="number" min="1" value={it.quantidade}
                      onChange={e => atualizarItem(amb._key, it._key, "quantidade", e.target.value)} />
                    <input style={inputStyle} placeholder="0,00" value={it.largura}
                      onChange={e => atualizarItem(amb._key, it._key, "largura", e.target.value)} />
                    <input style={inputStyle} placeholder="0,00" value={it.altura}
                      onChange={e => atualizarItem(amb._key, it._key, "altura", e.target.value)} />
                    <input style={inputStyle} placeholder="Cor" value={it.cor}
                      onChange={e => atualizarItem(amb._key, it._key, "cor", e.target.value)} />
                    <input style={inputStyle} placeholder="0,00" value={it.preco_unitario}
                      onChange={e => atualizarItem(amb._key, it._key, "preco_unitario", e.target.value)} />
                    <button type="button" onClick={() => removerItem(amb._key, it._key)}
                      style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14 }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => adicionarItem(amb._key)}
                  style={{ background:"none", border:"none", color:"var(--color-primary)", fontSize:12, cursor:"pointer", marginTop:4 }}>
                  + Adicionar item em {amb.nome}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {adicionandoAmb ? (
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          <input autoFocus placeholder="Nome do ambiente (ex: Sala, Quarto 1...)"
            value={novoAmbNome} onChange={e => setNovoAmbNome(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") adicionarAmbiente(); if (e.key === "Escape") setAdicionandoAmb(false); }}
            style={{ flex:1, background:"var(--color-card)", border:"1px solid var(--color-primary)", borderRadius:6, padding:"8px 12px", color:"var(--color-text)", fontSize:13 }}
          />
          <button type="button" onClick={adicionarAmbiente}
            style={{ padding:"8px 14px", background:"var(--color-primary)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>
            OK
          </button>
          <button type="button" onClick={() => setAdicionandoAmb(false)}
            style={{ padding:"8px 14px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdicionandoAmb(true)}
          style={{ width:"100%", padding:"10px", border:"1px dashed var(--color-border)", borderRadius:6, background:"none", color:"var(--color-primary)", cursor:"pointer", fontSize:12, marginBottom:16 }}>
          + Novo ambiente
        </button>
      )}

      {erro && <div style={{ color:"#ef4444", fontSize:12, marginBottom:8 }}>{erro}</div>}

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <button type="button" onClick={onBack}
          style={{ padding:"8px 16px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
          ← Voltar
        </button>
        <button type="button" onClick={avancar}
          style={{ padding:"8px 20px", background:"var(--color-primary)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
          Próximo: Revisão →
        </button>
      </div>
    </div>
  );
}

// ── Etapa 3 ─────────────────────────────────────────────────────────────────
function Etapa3({ dados, ambientes, orcamentoId, onBack, onSalvar, salvando }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const podeAprovar = (user.permissoes || []).some(p => ["OPERADOR_AGENDA","ADMIN_MASTER"].includes(p));

  const [modalAberto, setModalAberto] = useState(false);
  const [endModal, setEndModal] = useState(dados.endereco_entrega || {});
  const [aprovando, setAprovando] = useState(false);
  const [erroAprov, setErroAprov] = useState("");

  const totalGeral = ambientes.reduce((s, a) => s + calcSubtotal(a.itens), 0);

  async function confirmarAprovacao() {
    setAprovando(true);
    setErroAprov("");
    try {
      await api.post(`/orcamentos/${orcamentoId}/aprovar`, { endereco_entrega: endModal });
      navigate("/pedidos");
    } catch (err) {
      setErroAprov(err.message || "Erro ao aprovar.");
    } finally {
      setAprovando(false);
    }
  }

  const endEnt = dados.endereco_entrega || {};
  const endResumo = [endEnt.rua, endEnt.numero, endEnt.bairro, endEnt.cidade, endEnt.estado].filter(Boolean).join(", ");
  const inputStyle = { background:"var(--color-card)", border:"1px solid var(--color-border)", borderRadius:4, padding:"5px 8px", color:"var(--color-text)", fontSize:12, width:"100%" };

  return (
    <div>
      {/* Resumo cliente */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        <div style={{ background:"var(--color-card)", borderRadius:6, padding:12 }}>
          <div style={{ fontSize:10, color:"var(--color-text-muted)", marginBottom:4 }}>CLIENTE</div>
          <div style={{ fontWeight:600 }}>{dados.cliente?.nome || "—"}</div>
          {dados.cliente?.telefone && <div style={{ fontSize:12, color:"var(--color-text-muted)" }}>{dados.cliente.telefone}</div>}
        </div>
        <div style={{ background:"var(--color-card)", borderRadius:6, padding:12 }}>
          <div style={{ fontSize:10, color:"var(--color-text-muted)", marginBottom:4 }}>CONSULTORA</div>
          <div style={{ fontWeight:600 }}>{user.nome_completo || "—"}</div>
          {dados.arquiteto && <div style={{ fontSize:12, color:"var(--color-text-muted)" }}>Arq: {dados.arquiteto.nome}</div>}
        </div>
      </div>

      {/* Resumo por ambiente */}
      <div style={{ background:"var(--color-card)", borderRadius:6, padding:14, marginBottom:12 }}>
        <div style={{ fontSize:10, color:"var(--color-text-muted)", marginBottom:10, fontWeight:600 }}>RESUMO POR AMBIENTE</div>
        {ambientes.map(amb => {
          const sub = calcSubtotal(amb.itens);
          return (
            <div key={amb._key} style={{ marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:600, marginBottom:4 }}>
                <span>{amb.nome} ({amb.itens.length} {amb.itens.length === 1 ? "item" : "itens"})</span>
                <span>R$ {fmtMoeda(sub)}</span>
              </div>
              {amb.itens.map(it => it.produto_nome && (
                <div key={it._key} style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--color-text-muted)", paddingLeft:8, marginBottom:2 }}>
                  <span>{it.produto_nome}{it.cor ? ` — ${it.cor}` : ""}{it.largura && it.altura ? ` (${it.largura}×${it.altura})` : ""}{it.quantidade > 1 ? ` ×${it.quantidade}` : ""}</span>
                  <span>{it.preco_unitario ? `R$ ${fmtMoeda(parseFloat(String(it.preco_unitario).replace(",",".")) * (parseFloat(it.quantidade)||1))}` : "—"}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div style={{ borderTop:"1px solid var(--color-border)", paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:14 }}>
          <span>Total</span>
          <span style={{ color:"var(--color-primary)" }}>R$ {fmtMoeda(totalGeral)}</span>
        </div>
      </div>

      {/* Endereço de entrega */}
      <div style={{ background:"var(--color-card)", borderRadius:6, padding:12, marginBottom:20 }}>
        <div style={{ fontSize:10, color:"var(--color-text-muted)", fontWeight:600, marginBottom:6 }}>ENDEREÇO DE ENTREGA</div>
        {endResumo ? (
          <div style={{ fontSize:13 }}>{endResumo}{endEnt.cep ? ` — CEP ${endEnt.cep}` : ""}</div>
        ) : (
          <div style={{ fontSize:12, color:"var(--color-text-muted)" }}>Endereço não informado</div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <button type="button" onClick={onBack}
          style={{ padding:"8px 16px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
          ← Voltar
        </button>
        <div style={{ display:"flex", gap:10 }}>
          <button type="button" onClick={onSalvar} disabled={salvando}
            style={{ padding:"8px 16px", background:"var(--color-card)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
            {salvando ? "Salvando..." : "💾 Salvar rascunho"}
          </button>
          {podeAprovar && orcamentoId && (
            <button type="button" onClick={() => { setEndModal(dados.endereco_entrega || {}); setModalAberto(true); }}
              style={{ padding:"8px 18px", background:"#059669", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
              ✓ Aprovar orçamento
            </button>
          )}
        </div>
      </div>

      {/* Modal de aprovação */}
      {modalAberto && (
        <div style={{ position:"fixed", inset:0, background:"#00000088", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--color-card)", borderRadius:8, padding:24, width:"100%", maxWidth:480, border:"1px solid #059669" }}>
            <h3 style={{ margin:"0 0 4px", fontSize:16 }}>Confirmar aprovação</h3>
            <p style={{ fontSize:12, color:"var(--color-text-muted)", marginBottom:16 }}>
              Revise o endereço de entrega. Após confirmar, um Pedido será criado automaticamente.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:8, marginBottom:12 }}>
              {[["rua","Rua / Logradouro"],["numero","Número"],["complemento","Complemento"],["bairro","Bairro"],["cidade","Cidade"],["estado","Estado (UF)"],["cep","CEP"]].map(([campo, label]) => (
                <div key={campo}>
                  <input placeholder={label} value={endModal[campo] || ""}
                    onChange={e => setEndModal(v => ({ ...v, [campo]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            {erroAprov && <div style={{ color:"#ef4444", fontSize:12, marginBottom:8 }}>{erroAprov}</div>}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button type="button" onClick={() => setModalAberto(false)} disabled={aprovando}
                style={{ padding:"8px 16px", background:"var(--color-bg)", color:"var(--color-text)", border:"1px solid var(--color-border)", borderRadius:6, cursor:"pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={confirmarAprovacao} disabled={aprovando}
                style={{ padding:"8px 20px", background:"#059669", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                {aprovando ? "Aprovando..." : "Confirmar → criar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function OrcamentoWizard() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState({ cliente_id: null, cliente: null, arquiteto_id: null, arquiteto: null, observacoes: "", endereco_entrega: null });
  const [ambientes, setAmbientes] = useState([ambienteVazio("Sala")]);
  const [salvando, setSalvando] = useState(false);
  const [orcamentoId, setOrcamentoId] = useState(id ? Number(id) : null);
  const [toast, setToast] = useState("");

  const mostrarToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  useEffect(() => {
    if (!id) return;
    api.get(`/orcamentos/${id}`).then(res => {
      const o = res.orcamento;
      const clienteBase = o.cliente_id ? { id: o.cliente_id, nome: o.cliente_nome, telefone: o.cliente_telefone, enderecos: [] } : null;
      setDados({
        cliente_id: o.cliente_id,
        cliente: clienteBase,
        arquiteto_id: o.arquiteto_id,
        arquiteto: o.arquiteto_id ? { id: o.arquiteto_id, nome: o.arquiteto_nome } : null,
        observacoes: o.observacoes || "",
        endereco_entrega: o.endereco_entrega || null,
      });
      if (o.cliente_id) {
        api.get(`/clientes/${o.cliente_id}`).then(cr => {
          const enderecos = cr.cliente?.enderecos || [];
          setDados(prev => prev.cliente ? { ...prev, cliente: { ...prev.cliente, enderecos } } : prev);
        }).catch(() => {});
      }
      if (o.ambientes?.length > 0) {
        setAmbientes(o.ambientes.map(a => ({
          _key: Math.random(),
          nome: a.nome,
          itens: a.itens.map(it => ({ ...it, _key: Math.random() })),
        })));
      }
      if (searchParams.get("aprovar") === "1") setEtapa(2);
    }).catch(() => mostrarToast("Erro ao carregar orçamento."));
  }, [id, searchParams]);

  function onChange(campo, valor) {
    setDados(prev => ({ ...prev, [campo]: valor }));
  }

  function montarPayload() {
    const itens = ambientes.flatMap(a => a.itens.filter(it => it.produto_nome || it.produto_id).map(it => ({ ...it, ambiente: a.nome })));
    return { ...dados, itens };
  }

  async function salvar() {
    setSalvando(true);
    try {
      const payload = montarPayload();
      if (orcamentoId) {
        await api.put(`/orcamentos/${orcamentoId}`, payload);
        mostrarToast("Rascunho salvo!");
      } else {
        const res = await api.post("/orcamentos", payload);
        setOrcamentoId(res.orcamento.id);
        navigate(`/orcamentos/${res.orcamento.id}/editar`, { replace: true });
        mostrarToast(`${res.orcamento.numero} salvo!`);
      }
    } catch (err) {
      mostrarToast(err.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ padding:24, maxWidth:900, margin:"0 auto" }}>
      {toast && (
        <div style={{ position:"fixed", top:16, right:16, background:"#1f2937", color:"#fff", padding:"10px 18px", borderRadius:8, zIndex:9999 }}>
          {toast}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <button onClick={() => navigate("/orcamentos")}
          style={{ background:"none", border:"none", color:"var(--color-primary)", cursor:"pointer", fontSize:13 }}>
          ← Orçamentos
        </button>
        <h2 style={{ margin:0, fontSize:20, fontWeight:700 }}>
          {orcamentoId ? "Editar orçamento" : "Novo orçamento"}
        </h2>
      </div>
      <BarraProgresso etapa={etapa} />
      {etapa === 0 && <Etapa1 dados={dados} onChange={onChange} onNext={() => setEtapa(1)} />}
      {etapa === 1 && <Etapa2 ambientes={ambientes} setAmbientes={setAmbientes} onBack={() => setEtapa(0)} onNext={() => setEtapa(2)} />}
      {etapa === 2 && (
        <Etapa3
          dados={dados}
          ambientes={ambientes}
          orcamentoId={orcamentoId}
          onBack={() => setEtapa(1)}
          onSalvar={salvar}
          salvando={salvando}
        />
      )}
    </div>
  );
}

export { Etapa1, Etapa2, BarraProgresso, Autocomplete, itemVazio, ambienteVazio, calcSubtotal, fmtMoeda };
