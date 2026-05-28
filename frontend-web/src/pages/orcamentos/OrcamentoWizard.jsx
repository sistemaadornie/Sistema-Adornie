import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../services/api";

// ─── Constantes de listas estáticas ──────────────────────────────────────────
const FORMAS_PAGAMENTO = [
  "DINHEIRO", "BOLETO", "PIX / DEPOSITO", "CONTRA ENTREGA", "CHEQUE",
  "PERMUTA RT", "CARTAO VISA / MASTER", "CARTAO ELO", "CARTAO AMEX / HIPER",
  "DEBITO EM CONTA",
];

const CONTAS_BANCARIAS = [
  "CAIXA ECONÔMICA ADORNIE", "CAIXA TATHY", "BRADESCO ADORNIE", "BRADESCO TGC",
  "PERMUTA", "CAIXA COMPRAS", "PAGSEGURO TGC", "PAGSEGURO ADORNIE DECORAÇÕES LTDA",
  "PAGBANK ADORNIE",
];

const CATEGORIAS_FINANCEIRAS = [
  "Receitas",
  "Receitas - RECEITAS FINANCEIRAS - JUROS RECEBIDOS",
  "Receitas - RECEITAS FINANCEIRAS - EMPRÉSTIMOS TOMADOS",
  "Receitas - Transferência",
  "Receitas - RECEITAS FINANCEIRAS - RENDIMENTO DE APLICAÇÃO FINANCEIRA",
  "Receitas - RECEITAS NÃO OPERACIONAIS - OUTRAS ENTRADAS",
  "Receitas - RECEITA OPERACIONAL",
];

const CENTROS_CUSTO = ["Centro de Custo Padrão"];

const OBS_PADRAO = `1. Içamento não está incluso no Orçamento.
2. Medidas Fornecidas pelo cliente, valores sujeitos a alterações após medida técnica.
3. Garantia conforme fornecedor.
4. Persiana lado a lado podem conter frestas como característica de cada produto variando conforme dimensão.
5. Produtos Têxteis e sob medida podem apresentar pequenas variações devido as condições de cada ambiente.
6. É de responsabilidade do cliente informar canos de água e gás onde serão instalados os produtos, pois em caso de dados não é de nossa responsabilidade os reparos.
7. A instalação pode ser reagendada em caso de mal tempo para garantir a segurança da equipe.

** Somos inspirados por ELE e tudo é para ELE **

Previsão de entrega: 1. CORTINAS --> Entrega até 30 dias úteis após conferência técnica.
2. PERSIANAS --> Entrega até 25 dias úteis após conferência técnica.
3. PAPEL DE PAREDE ESTOQUE BRASIL --> Entrega até 20 dias úteis.
4. PAPEL DE PAREDE IMPORTAÇÃO POR DEMANDA --> Entrega entre 50 à 70 dias úteis.
5. TAPETES SOB MEDIDA --> Entrega entre 50 à 70 dias úteis.
6. TAPETES MEDIDAS PADRÃO INDUSTRIALIZADOS --> Entrega entre 20 a 30 dias úteis.
7. JOGOS DE CAMA E ALMOFADAS --> Entrega até 30 dias úteis após conferência técnica.

Forma de pagamento: 1. *** PROGRAMA FIDELIDADE *** --> Em caso de existir indicação de ARQUITETO PARCEIRO nesse orçamento, será adicionado DESCONTO DE 3,50%`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoeda(v) {
  const n = parseFloat(String(v || "0").replace(",", ".")) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}
function parseMoeda(v) {
  return parseFloat(String(v || "0").replace(",", ".")) || 0;
}
function itemVazio() {
  return {
    _key: Math.random(),
    produto_id: null, produto_nome: "",
    ambiente: "",
    cor: "", quantidade: 1,
    custo_unitario: "", preco_unitario: "",
  };
}
function pagVazio() {
  return {
    _key: Math.random(),
    forma: "", condicao: "", conta_bancaria: "", categoria: "",
    centro_custo: "", num_doc: "", data_inicial: "", valor: "", taxa: "",
  };
}

// ─── Select Pesquisável ───────────────────────────────────────────────────────
function SearchSelect({ label, value, onChange, options, placeholder = "Selecione uma opção" }) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const filtradas = options.filter(o => o.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label && <label style={styles.label}>{label}</label>}
      <div
        onClick={() => setAberto(v => !v)}
        style={{
          ...styles.input,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", userSelect: "none",
          color: value ? "var(--color-text)" : "var(--color-text-muted)",
        }}
      >
        <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        <span style={{ color: "var(--color-text-muted)", fontSize: 10, marginLeft: 4, flexShrink: 0 }}>
          {aberto ? "▲" : "▼"}
        </span>
      </div>
      {aberto && (
        <div style={{
          position: "absolute", zIndex: 200, top: "100%", left: 0, right: 0,
          background: "var(--color-card)", border: "1px solid var(--color-border)",
          borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", maxHeight: 220, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>
            <input
              autoFocus
              placeholder="Buscar..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 3, padding: "3px 6px", color: "var(--color-text)", fontSize: 12 }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtradas.map((op, i) => (
              <div
                key={i}
                onMouseDown={() => { onChange(op); setAberto(false); setFiltro(""); }}
                style={{
                  padding: "7px 10px", cursor: "pointer", fontSize: 12,
                  color: op === value ? "var(--color-primary)" : "var(--color-text)",
                  background: op === value ? "rgba(var(--color-primary-rgb, 99,102,241),0.08)" : "transparent",
                  fontWeight: op === value ? 600 : 400,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg)"}
                onMouseLeave={e => e.currentTarget.style.background = op === value ? "rgba(99,102,241,0.08)" : "transparent"}
              >
                {op}
              </div>
            ))}
            {filtradas.length === 0 && (
              <div style={{ padding: "10px", fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>
                Nenhum resultado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Autocomplete genérico ────────────────────────────────────────────────────
function Autocomplete({ placeholder, value, onSelect, onClear, fetchFn, renderOption, renderValue, onCreate }) {
  const [query, setQuery] = useState("");
  const [opcoes, setOpcoes] = useState([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const buscar = useCallback(async (q) => {
    if (!q || q.length < 1) { setOpcoes([]); return; }
    try {
      const res = await fetchFn(q);
      setOpcoes(res);
      if (res.length > 0 || (onCreate && q.length >= 2)) setAberto(true);
    } catch { setOpcoes([]); }
  }, [fetchFn, onCreate]);

  useEffect(() => {
    const t = setTimeout(() => buscar(query), 250);
    return () => clearTimeout(t);
  }, [query, buscar]);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 4, minHeight: 30 }}>
        <span style={{ flex: 1, fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{renderValue(value)}</span>
        <button type="button" onClick={onClear} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 14, padding: 0, flexShrink: 0 }}>✕</button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        style={styles.input}
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => query && (opcoes.length > 0 || (onCreate && query.length >= 2)) && setAberto(true)}
      />
      {aberto && (opcoes.length > 0 || (onCreate && query.length >= 2)) && (
        <div style={{
          position: "absolute", zIndex: 200, top: "100%", left: 0, right: 0,
          background: "var(--color-card)", border: "1px solid var(--color-border)",
          borderRadius: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {opcoes.map((op, i) => (
            <div key={i}
              onMouseDown={() => { onSelect(op); setQuery(""); setAberto(false); }}
              style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, color: "var(--color-text)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {renderOption(op)}
            </div>
          ))}
          {onCreate && query.length >= 2 && (
            <div
              onMouseDown={() => { onCreate(query); setQuery(""); setAberto(false); }}
              style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, color: "var(--color-primary)", borderTop: opcoes.length > 0 ? "1px solid var(--color-border)" : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              + Criar &quot;{query}&quot; no catálogo
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estilos compartilhados ───────────────────────────────────────────────────
const styles = {
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { width: "100%", background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "5px 8px", color: "var(--color-text)", fontSize: 12, outline: "none", boxSizing: "border-box" },
  card: { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 },
  thead: { fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 6px", textAlign: "left" },
  td: { padding: "3px 4px" },
  btn: (variant = "primary") => ({
    padding: "8px 16px", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13,
    background: variant === "primary" ? "var(--color-primary)" : variant === "success" ? "#059669" : variant === "danger" ? "#ef4444" : "var(--color-card)",
    color: variant === "secondary" ? "var(--color-text)" : "#fff",
    borderWidth: variant === "secondary" ? 1 : 0,
    borderStyle: "solid",
    borderColor: variant === "secondary" ? "var(--color-border)" : "transparent",
  }),
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 4, fontSize: 14, color: "var(--color-text-muted)" },
  addRowBtn: { background: "none", border: "1px dashed var(--color-border)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: "var(--color-primary)", fontSize: 12, marginTop: 6 },
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function OrcamentoWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const podeAprovar = (user.permissoes || []).some(p => ["OPERADOR_AGENDA", "ADMIN_MASTER"].includes(p));

  // ── Estado do formulário ──────────────────────────────────────────────────
  const [orcId, setOrcId] = useState(id ? Number(id) : null);
  const [numero, setNumero] = useState("");
  const [dataCriacao] = useState(() => new Date().toLocaleDateString("pt-BR"));

  // cabeçalho
  const [taxarNf, setTaxarNf] = useState(false);
  const [deOndeVeio, setDeOndeVeio] = useState("");

  // pessoas
  const [cliente, setCliente] = useState(null);
  const [arquiteto, setArquiteto] = useState(null);
  const [vendedor, setVendedor] = useState(null);
  const [gerente, setGerente] = useState(null);
  const [clube, setClube] = useState("");

  // endereço entrega
  const [entrega, setEntrega] = useState({ cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" });
  const [faturamentoDif, setFaturamentoDif] = useState(false);

  // itens
  const [itens, setItens] = useState([itemVazio()]);

  // pagamentos
  const [pagamentos, setPagamentos] = useState([pagVazio()]);

  // observações
  const [observacoes, setObservacoes] = useState(OBS_PADRAO);

  // UI
  const [salvando, setSalvando] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [toast, setToast] = useState({ msg: "", tipo: "" });
  const [erros, setErros] = useState({});
  const [usuarios, setUsuarios] = useState([]);
  const [mostrarEndEntrega, setMostrarEndEntrega] = useState(false);
  const [mostrarEnderecos, setMostrarEnderecos] = useState(false);

  const mostrarToast = (msg, tipo = "success") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast({ msg: "", tipo: "" }), 3500);
  };

  // ── Carregar usuários ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get("/auth/admin/usuarios").then(d => setUsuarios(d.usuarios || [])).catch(() => {});
  }, []);

  // ── Carregar orçamento existente ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    api.get(`/orcamentos/${id}`).then(res => {
      const o = res.orcamento;
      setNumero(o.numero || "");
      setTaxarNf(o.taxar_nf || false);
      setDeOndeVeio(o.de_onde_veio || "");
      setClube(o.clube || "");
      setObservacoes(o.observacoes || OBS_PADRAO);
      setFaturamentoDif(o.faturamento_diferente || false);

      // cliente
      if (o.cliente_id) {
        setCliente({ id: o.cliente_id, nome: o.cliente_nome, telefone: o.cliente_telefone, enderecos: [] });
        api.get(`/clientes/${o.cliente_id}`).then(cr => {
          setCliente(prev => prev ? { ...prev, enderecos: cr.cliente?.enderecos || [] } : prev);
        }).catch(() => {});
      }
      // arquiteto
      if (o.arquiteto_id) setArquiteto({ id: o.arquiteto_id, nome: o.arquiteto_nome });
      // vendedor
      if (o.vendedor_id) setVendedor({ id: o.vendedor_id, nome_completo: o.vendedor_nome });
      // gerente
      if (o.gerente_id) setGerente({ id: o.gerente_id, nome_completo: o.gerente_nome });

      // endereço entrega
      if (o.entrega_rua || o.entrega_cep) {
        setEntrega({
          cep: o.entrega_cep || "", rua: o.entrega_rua || "", numero: o.entrega_numero || "",
          complemento: o.entrega_complemento || "", bairro: o.entrega_bairro || "",
          cidade: o.entrega_cidade || "", estado: o.entrega_estado || "",
        });
        setMostrarEndEntrega(true);
      }

      // itens agrupados
      const itensFlat = (o.ambientes || []).flatMap(a =>
        a.itens.map(it => ({
          _key: Math.random(),
          produto_id: it.produto_id,
          produto_nome: it.produto_nome || "",
          ambiente: it.ambiente || a.nome || "",
          cor: it.cor || "",
          quantidade: it.quantidade || 1,
          custo_unitario: it.custo_unitario ? String(it.custo_unitario) : "",
          preco_unitario: it.preco_unitario ? String(it.preco_unitario) : "",
        }))
      );
      if (itensFlat.length > 0) setItens(itensFlat);

      // pagamentos
      if (o.pagamentos?.length > 0) {
        setPagamentos(o.pagamentos.map(p => ({
          _key: Math.random(),
          forma: p.forma || "", condicao: p.condicao || "",
          conta_bancaria: p.conta_bancaria || "", categoria: p.categoria || "",
          centro_custo: p.centro_custo || "", num_doc: p.num_doc || "",
          data_inicial: p.data_inicial ? p.data_inicial.slice(0, 10) : "",
          valor: p.valor ? String(p.valor) : "", taxa: p.taxa ? String(p.taxa) : "",
        })));
      }
    }).catch(() => mostrarToast("Erro ao carregar orçamento.", "error"));
  }, [id]);

  // ── Busca functions ───────────────────────────────────────────────────────
  const buscarClientes = q => api.get(`/clientes/busca?q=${encodeURIComponent(q)}`).then(r => r.clientes);
  const buscarArquitetos = q => api.get(`/arquitetos?q=${encodeURIComponent(q)}`).then(r => r.arquitetos);
  const buscarProdutos = q => api.get(`/produtos/busca?q=${encodeURIComponent(q)}`).then(r => r.produtos);

  const usuariosFiltrados = (q) =>
    usuarios.filter(u => (u.nome_completo || "").toLowerCase().includes(q.toLowerCase())).slice(0, 20);

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const totalGeral = itens.reduce((s, it) => {
    return s + parseMoeda(it.preco_unitario) * (parseFloat(it.quantidade) || 1);
  }, 0);

  const totalCusto = itens.reduce((s, it) => {
    return s + parseMoeda(it.custo_unitario) * (parseFloat(it.quantidade) || 1);
  }, 0);

  // ── Itens ─────────────────────────────────────────────────────────────────
  function updItem(key, campo, valor) {
    setItens(prev => prev.map(it => it._key === key ? { ...it, [campo]: valor } : it));
  }
  function addItem() { setItens(prev => [...prev, itemVazio()]); }
  function removeItem(key) { setItens(prev => prev.filter(it => it._key !== key)); }

  async function criarProduto(key, nome) {
    try {
      const res = await api.post("/produtos", { nome: nome.trim(), status: "ativo", tipo: "produto" });
      const p = res.produto;
      updItem(key, "produto_id", p.id);
      updItem(key, "produto_nome", p.nome);
    } catch { mostrarToast("Erro ao criar produto.", "error"); }
  }

  // ── Pagamentos ────────────────────────────────────────────────────────────
  function updPag(key, campo, valor) {
    setPagamentos(prev => prev.map(p => p._key === key ? { ...p, [campo]: valor } : p));
  }
  function addPag() { setPagamentos(prev => [...prev, pagVazio()]); }
  function removePag(key) { setPagamentos(prev => prev.filter(p => p._key !== key)); }

  // ── Endereço via CEP ──────────────────────────────────────────────────────
  async function buscarCep(cep) {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${limpo}/json/`).then(r => r.json());
      if (!r.erro) {
        setEntrega(e => ({ ...e, rua: r.logradouro || e.rua, bairro: r.bairro || e.bairro, cidade: r.localidade || e.cidade, estado: r.uf || e.estado }));
      }
    } catch { /* silencioso */ }
  }

  // ── Usar endereço do cliente ──────────────────────────────────────────────
  function usarEnderecoCliente(end) {
    setEntrega({ cep: end.cep || "", rua: end.rua || "", numero: end.numero || "", complemento: end.complemento || "", bairro: end.bairro || "", cidade: end.cidade || "", estado: end.estado || "" });
    setMostrarEndEntrega(true);
    setMostrarEnderecos(false);
  }

  // ── Montar payload ────────────────────────────────────────────────────────
  function montarPayload() {
    const itensPayload = itens
      .filter(it => it.produto_nome || it.produto_id)
      .map(it => ({
        produto_id: it.produto_id || null,
        produto_nome: it.produto_nome || null,
        cor: it.cor || null,
        quantidade: parseFloat(it.quantidade) || 1,
        custo_unitario: it.custo_unitario || null,
        preco_unitario: it.preco_unitario || null,
        unidade: "un",
        ambiente: it.ambiente || "Geral",
      }));

    const pagsPayload = pagamentos
      .filter(p => p.forma || p.valor)
      .map(p => ({ ...p }));

    return {
      cliente_id: cliente?.id || null,
      arquiteto_id: arquiteto?.id || null,
      vendedor_id: vendedor?.id || null,
      gerente_id: gerente?.id || null,
      clube: clube || null,
      observacoes: observacoes || null,
      taxar_nf: taxarNf,
      de_onde_veio: deOndeVeio || null,
      faturamento_diferente: faturamentoDif,
      endereco_entrega: mostrarEndEntrega ? entrega : null,
      itens: itensPayload,
      pagamentos: pagsPayload,
    };
  }

  // ── Validação básica ──────────────────────────────────────────────────────
  function validar() {
    const e = {};
    if (!cliente) e.cliente = "Selecione um cliente.";
    const temItem = itens.some(it => it.produto_nome || it.produto_id);
    if (!temItem) e.itens = "Adicione pelo menos um produto.";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function salvar() {
    if (!validar()) { mostrarToast("Corrija os erros antes de salvar.", "error"); return; }
    setSalvando(true);
    try {
      const payload = montarPayload();
      if (orcId) {
        await api.put(`/orcamentos/${orcId}`, payload);
        mostrarToast("Orçamento salvo!");
      } else {
        const res = await api.post("/orcamentos", payload);
        const novoId = res.orcamento.id;
        setOrcId(novoId);
        setNumero(res.orcamento.numero || "");
        navigate(`/orcamentos/${novoId}/editar`, { replace: true });
        mostrarToast(`${res.orcamento.numero} criado!`);
      }
    } catch (err) {
      mostrarToast(err.message || "Erro ao salvar.", "error");
    } finally {
      setSalvando(false);
    }
  }

  // ── Aprovar ───────────────────────────────────────────────────────────────
  async function aprovar() {
    if (!orcId) { mostrarToast("Salve o orçamento antes de aprovar.", "error"); return; }
    setAprovando(true);
    try {
      await api.post(`/orcamentos/${orcId}/aprovar`, { endereco_entrega: mostrarEndEntrega ? entrega : null });
      mostrarToast("Orçamento aprovado! Pedido criado.");
      setTimeout(() => navigate("/pedidos"), 1500);
    } catch (err) {
      mostrarToast(err.message || "Erro ao aprovar.", "error");
    } finally {
      setAprovando(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const enderecos = cliente?.enderecos || [];
  const empresaNome = user.empresa_nome || "—";

  return (
    <div style={{ padding: "16px 24px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          background: toast.tipo === "error" ? "#7f1d1d" : "#065f46",
          color: "#fff", padding: "10px 18px", borderRadius: 8,
          fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          border: `1px solid ${toast.tipo === "error" ? "#ef4444" : "#059669"}`,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Cabeçalho da página */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate("/orcamentos")}
          style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: 13, padding: 0 }}>
          ← Orçamentos
        </button>
        <span style={{ color: "var(--color-text-muted)" }}>/</span>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
          {orcId ? `Editar Orçamento${numero ? ` — ${numero}` : ""}` : "Novo Orçamento"}
        </h2>
      </div>

      {/* ── SEÇÃO 1: Cabeçalho do orçamento ── */}
      <div style={styles.card}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 160px 1fr 200px", gap: 12, alignItems: "end" }}>
          <div>
            <label style={styles.label}>Código</label>
            <div style={{ ...styles.input, color: "var(--color-text-muted)", cursor: "default" }}>
              {numero || (orcId ? "..." : "Auto")}
            </div>
          </div>
          <div>
            <label style={styles.label}>Data</label>
            <div style={{ ...styles.input, color: "var(--color-text-muted)", cursor: "default" }}>
              {dataCriacao}
            </div>
          </div>
          <div>
            <label style={styles.label}>De onde veio?</label>
            <input
              style={styles.input}
              placeholder="Ex: Instagram, Indicação, Google..."
              value={deOndeVeio}
              onChange={e => setDeOndeVeio(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
            <input
              type="checkbox"
              id="taxar-nf"
              checked={taxarNf}
              onChange={e => setTaxarNf(e.target.checked)}
              style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--color-primary)" }}
            />
            <label htmlFor="taxar-nf" style={{ ...styles.label, marginBottom: 0, cursor: "pointer" }}>Taxar NF?</label>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 2: Empresa ── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Empresa</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={styles.label}>Empresa</label>
            <div style={{ ...styles.input, color: "var(--color-text-muted)", cursor: "default" }}>{empresaNome}</div>
          </div>
          <div>
            <label style={styles.label}>Clube</label>
            <input style={styles.input} placeholder="Clube / Programa..." value={clube} onChange={e => setClube(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 3: Pessoas ── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Equipe</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {/* Arquiteto */}
          <div>
            <label style={styles.label}>Arquiteto</label>
            <Autocomplete
              placeholder="Buscar arquiteto..."
              value={arquiteto}
              onSelect={a => setArquiteto(a)}
              onClear={() => setArquiteto(null)}
              fetchFn={buscarArquitetos}
              renderOption={a => a.nome}
              renderValue={a => a.nome}
            />
          </div>

          {/* Vendedor */}
          <div>
            <label style={styles.label}>Vendedor</label>
            <Autocomplete
              placeholder="Buscar vendedor..."
              value={vendedor}
              onSelect={u => setVendedor(u)}
              onClear={() => setVendedor(null)}
              fetchFn={q => Promise.resolve(usuariosFiltrados(q))}
              renderOption={u => u.nome_completo || u.nome || ""}
              renderValue={u => u.nome_completo || u.nome || ""}
            />
          </div>

          {/* Gerente */}
          <div>
            <label style={styles.label}>Gerente</label>
            <Autocomplete
              placeholder="Buscar gerente..."
              value={gerente}
              onSelect={u => setGerente(u)}
              onClear={() => setGerente(null)}
              fetchFn={q => Promise.resolve(usuariosFiltrados(q))}
              renderOption={u => u.nome_completo || u.nome || ""}
              renderValue={u => u.nome_completo || u.nome || ""}
            />
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 4: Cliente ── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Cliente</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "start" }}>
          <div>
            {erros.cliente && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 4 }}>{erros.cliente}</div>}
            <Autocomplete
              placeholder="Buscar cliente por nome ou telefone..."
              value={cliente}
              onSelect={c => { setCliente(c); setMostrarEnderecos(false); }}
              onClear={() => { setCliente(null); setMostrarEnderecos(false); }}
              fetchFn={buscarClientes}
              renderOption={c => `${c.nome}${c.telefone ? " — " + c.telefone : ""}`}
              renderValue={c => `${c.nome}${c.telefone ? " — " + c.telefone : ""}`}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {cliente && enderecos.length > 0 && (
              <button
                type="button"
                title="Usar endereço do cliente"
                onClick={() => enderecos.length === 1 ? usarEnderecoCliente(enderecos[0]) : setMostrarEnderecos(v => !v)}
                style={{ ...styles.iconBtn, color: "var(--color-primary)", border: "1px solid var(--color-border)", borderRadius: 4 }}
              >
                📍
              </button>
            )}
          </div>
        </div>

        {/* Lista de endereços do cliente */}
        {mostrarEnderecos && enderecos.length > 1 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {enderecos.map((end, i) => {
              const resumo = [end.rua, end.numero, end.bairro, end.cidade, end.estado].filter(Boolean).join(", ");
              return (
                <div key={end.id || i} onClick={() => usarEnderecoCliente(end)}
                  style={{ padding: "7px 10px", borderRadius: 4, border: "1px solid var(--color-border)", cursor: "pointer", fontSize: 12, display: "flex", gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {end.is_padrao && <span style={{ color: "#f59e0b" }}>★</span>}
                  <span><strong>{end.label}</strong>{resumo ? ` — ${resumo}` : ""}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SEÇÃO 5: Endereço de Entrega ── */}
      <div style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: mostrarEndEntrega ? 12 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={styles.sectionTitle}>Endereço de Entrega</div>
          </div>
          <button
            type="button"
            onClick={() => setMostrarEndEntrega(v => !v)}
            style={{ background: "none", border: "none", color: "var(--color-primary)", fontSize: 12, cursor: "pointer" }}
          >
            {mostrarEndEntrega ? "▲ Recolher" : "▼ Preencher endereço de entrega"}
          </button>
        </div>

        {mostrarEndEntrega && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={styles.label}>CEP</label>
                <input style={styles.input} placeholder="00000-000" value={entrega.cep}
                  onChange={e => setEntrega(v => ({ ...v, cep: e.target.value }))}
                  onBlur={e => buscarCep(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>Endereço</label>
                <input style={styles.input} placeholder="Rua / Logradouro" value={entrega.rua}
                  onChange={e => setEntrega(v => ({ ...v, rua: e.target.value }))} />
              </div>
              <div>
                <label style={styles.label}>Nº</label>
                <input style={styles.input} placeholder="123" value={entrega.numero}
                  onChange={e => setEntrega(v => ({ ...v, numero: e.target.value }))} />
              </div>
              <div>
                <label style={styles.label}>Complemento</label>
                <input style={styles.input} placeholder="Apto, Bloco..." value={entrega.complemento}
                  onChange={e => setEntrega(v => ({ ...v, complemento: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 8, marginBottom: 10 }}>
              <div>
                <label style={styles.label}>Bairro</label>
                <input style={styles.input} placeholder="Bairro" value={entrega.bairro}
                  onChange={e => setEntrega(v => ({ ...v, bairro: e.target.value }))} />
              </div>
              <div>
                <label style={styles.label}>Cidade</label>
                <input style={styles.input} placeholder="Cidade" value={entrega.cidade}
                  onChange={e => setEntrega(v => ({ ...v, cidade: e.target.value }))} />
              </div>
              <div>
                <label style={styles.label}>UF</label>
                <input style={styles.input} placeholder="PR" maxLength={2} value={entrega.estado}
                  onChange={e => setEntrega(v => ({ ...v, estado: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" id="fat-dif" checked={faturamentoDif}
                onChange={e => setFaturamentoDif(e.target.checked)}
                style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--color-primary)" }} />
              <label htmlFor="fat-dif" style={{ fontSize: 12, color: "var(--color-text-muted)", cursor: "pointer" }}>
                Endereço de faturamento diferente de entrega?
              </label>
            </div>
          </>
        )}
      </div>

      {/* ── SEÇÃO 6: Produtos / Itens ── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Produtos</div>
        {erros.itens && <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 8 }}>{erros.itens}</div>}

        {/* Cabeçalho tabela */}
        <div style={{ display: "grid", gridTemplateColumns: "22px 1.1fr 2fr 0.8fr 0.5fr 0.9fr 0.9fr 0.9fr 0.9fr 32px", gap: 4, marginBottom: 4 }}>
          {["#", "Ambiente", "Produto", "Cor", "Qtde", "Custo Unit.", "Preço Unit.", "Custo Total", "Preço Total", ""].map((h, i) => (
            <div key={i} style={styles.thead}>{h}</div>
          ))}
        </div>

        {/* Linhas */}
        {itens.map((it, idx) => {
          const qtd = parseFloat(it.quantidade) || 1;
          const custoTotal = parseMoeda(it.custo_unitario) * qtd;
          const precoTotal = parseMoeda(it.preco_unitario) * qtd;
          return (
            <div key={it._key} style={{ display: "grid", gridTemplateColumns: "22px 1.1fr 2fr 0.8fr 0.5fr 0.9fr 0.9fr 0.9fr 0.9fr 32px", gap: 4, marginBottom: 4, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textAlign: "center", paddingTop: 2 }}>{idx + 1}</div>
              <input style={styles.input} placeholder="Sala, Quarto..." value={it.ambiente} onChange={e => updItem(it._key, "ambiente", e.target.value)} />
              <Autocomplete
                placeholder="Produto..."
                value={it.produto_id ? { id: it.produto_id, nome: it.produto_nome } : null}
                onSelect={p => { updItem(it._key, "produto_id", p.id); updItem(it._key, "produto_nome", p.nome); if (p.preco_venda) updItem(it._key, "preco_unitario", String(p.preco_venda)); if (p.custo) updItem(it._key, "custo_unitario", String(p.custo)); }}
                onClear={() => { updItem(it._key, "produto_id", null); updItem(it._key, "produto_nome", ""); }}
                fetchFn={buscarProdutos}
                renderOption={p => `${p.nome}${p.referencia ? " — " + p.referencia : ""}`}
                renderValue={p => p.nome}
                onCreate={nome => criarProduto(it._key, nome)}
              />
              <input style={styles.input} placeholder="Cor" value={it.cor} onChange={e => updItem(it._key, "cor", e.target.value)} />
              <input style={styles.input} type="number" min="0.01" step="0.01" value={it.quantidade} onChange={e => updItem(it._key, "quantidade", e.target.value)} />
              <input style={styles.input} placeholder="0,00" value={it.custo_unitario} onChange={e => updItem(it._key, "custo_unitario", e.target.value)} />
              <input style={styles.input} placeholder="0,00" value={it.preco_unitario} onChange={e => updItem(it._key, "preco_unitario", e.target.value)} />
              <div style={{ ...styles.input, color: "var(--color-text-muted)", cursor: "default", fontSize: 12 }}>{fmtMoeda(custoTotal)}</div>
              <div style={{ ...styles.input, color: custoTotal > 0 ? "var(--color-primary)" : "var(--color-text-muted)", cursor: "default", fontSize: 12, fontWeight: 600 }}>{fmtMoeda(precoTotal)}</div>
              <button type="button" onClick={() => removeItem(it._key)} style={{ ...styles.iconBtn, color: "#ef4444", fontSize: 16 }}>✕</button>
            </div>
          );
        })}

        <button type="button" onClick={addItem} style={styles.addRowBtn}>+ Adicionar produto</button>

        {/* Totalizador */}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 24, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
          {totalCusto > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2 }}>CUSTO TOTAL</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text-muted)" }}>R$ {fmtMoeda(totalCusto)}</div>
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2 }}>PREÇO TOTAL</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--color-primary)" }}>R$ {fmtMoeda(totalGeral)}</div>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 7: Formas de Pagamento ── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Formas de Pagamento</div>

        {/* Cabeçalho */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1.1fr 1.2fr 0.9fr 0.7fr 0.8fr 0.7fr 0.5fr 32px", gap: 4, marginBottom: 6 }}>
          {["Forma de Pagamento", "Condição", "Conta Bancária", "Categoria", "Centro de Custo", "Nº Doc", "Data Inicial", "Valor", "Taxa %", ""].map((h, i) => (
            <div key={i} style={styles.thead}>{h}</div>
          ))}
        </div>

        {pagamentos.map(p => (
          <div key={p._key} style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1.1fr 1.2fr 0.9fr 0.7fr 0.8fr 0.7fr 0.5fr 32px", gap: 4, marginBottom: 4, alignItems: "start" }}>
            <SearchSelect value={p.forma} onChange={v => updPag(p._key, "forma", v)} options={FORMAS_PAGAMENTO} placeholder="Selecione..." />
            <input style={styles.input} placeholder="Condição" value={p.condicao} onChange={e => updPag(p._key, "condicao", e.target.value)} />
            <SearchSelect value={p.conta_bancaria} onChange={v => updPag(p._key, "conta_bancaria", v)} options={CONTAS_BANCARIAS} placeholder="Selecione..." />
            <SearchSelect value={p.categoria} onChange={v => updPag(p._key, "categoria", v)} options={CATEGORIAS_FINANCEIRAS} placeholder="Selecione..." />
            <SearchSelect value={p.centro_custo} onChange={v => updPag(p._key, "centro_custo", v)} options={CENTROS_CUSTO} placeholder="Selecione..." />
            <input style={styles.input} placeholder="Doc" value={p.num_doc} onChange={e => updPag(p._key, "num_doc", e.target.value)} />
            <input style={styles.input} type="date" value={p.data_inicial} onChange={e => updPag(p._key, "data_inicial", e.target.value)} />
            <input style={styles.input} placeholder="0,00" value={p.valor} onChange={e => updPag(p._key, "valor", e.target.value)} />
            <input style={styles.input} placeholder="0" value={p.taxa} onChange={e => updPag(p._key, "taxa", e.target.value)} />
            <button type="button" onClick={() => removePag(p._key)} style={{ ...styles.iconBtn, color: "#ef4444", fontSize: 16 }}>✕</button>
          </div>
        ))}

        <button type="button" onClick={addPag} style={styles.addRowBtn}>+ Adicionar forma de pagamento</button>
      </div>

      {/* ── SEÇÃO 8: Observações ── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>Observações</div>
        <textarea
          rows={14}
          style={{ ...styles.input, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit", fontSize: 12 }}
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
        />
      </div>

      {/* ── Rodapé / Ações ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 32, gap: 10 }}>
        <button type="button" onClick={() => navigate("/orcamentos")} style={styles.btn("secondary")}>
          ← Cancelar
        </button>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ textAlign: "right", marginRight: 8 }}>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>TOTAL GERAL</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--color-primary)" }}>R$ {fmtMoeda(totalGeral)}</div>
          </div>
          <button type="button" onClick={salvar} disabled={salvando} style={styles.btn("secondary")}>
            {salvando ? "Salvando..." : "💾 Salvar rascunho"}
          </button>
          {podeAprovar && orcId && (
            <button type="button" onClick={aprovar} disabled={aprovando} style={styles.btn("success")}>
              {aprovando ? "Aprovando..." : "✓ Aprovar orçamento"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
