import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../services/api";

function formatarCPF(valor) {
  const n = valor.replace(/\D/g, "").slice(0, 11);
  return n.replace(/^(\d{3})(\d)/, "$1.$2")
          .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
          .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export default function RegisterUsuario() {
  const [form, setForm] = useState({
    nome_completo: "", email: "", senha: "",
    cpf: "", empresa_id: "", setor_id: "",
  });

  const [empresas,       setEmpresas]       = useState([]);
  const [setores,        setSetores]        = useState([]);
  const [msg,            setMsg]            = useState("");
  const [erro,           setErro]           = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [loadingSetores, setLoadingSetores] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "cpf" ? formatarCPF(value) : value,
      ...(name === "empresa_id" ? { setor_id: "" } : {}),
    }));
  }

  useEffect(() => {
    fetch(`${API_BASE}/auth/empresas`)
      .then((r) => r.json())
      .then((d) => { if (d.empresas) setEmpresas(d.empresas); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.empresa_id) { setSetores([]); return; }
    setLoadingSetores(true);
    fetch(`${API_BASE}/auth/setores?empresa_id=${form.empresa_id}`)
      .then((r) => r.json())
      .then((d) => setSetores(d.setores || []))
      .catch(() => setSetores([]))
      .finally(() => setLoadingSetores(false));
  }, [form.empresa_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(""); setErro(false); setLoading(true);

    const cpfLimpo = form.cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      setErro(true); setMsg("Informe um CPF válido com 11 dígitos."); setLoading(false); return;
    }

    try {
      const res  = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: form.nome_completo, email: form.email,
          senha: form.senha, cpf: cpfLimpo,
          empresa_id: Number(form.empresa_id), setor_id: Number(form.setor_id),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(true); setMsg(data.message || "Erro ao cadastrar."); return; }
      setErro(false);
      setMsg("Cadastro enviado! Aguarde aprovação do administrador.");
      setForm({ nome_completo: "", email: "", senha: "", cpf: "", empresa_id: "", setor_id: "" });
      setSetores([]);
    } catch {
      setErro(true); setMsg("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-split">

        {/* PAINEL ESQUERDO */}
        <div className="auth-brand">
          <Link to="/" className="auth-back-link">← Voltar ao site</Link>

          <Link to="/" className="auth-brand-logo-link">
            <div className="auth-brand-logo">
              <img src="/logooperon.png" alt="Operon" className="auth-brand-logo-img" />
              <span className="auth-brand-logo-text">OPER<span>ON</span></span>
            </div>
          </Link>

          <p className="auth-brand-tagline">Solicite acesso à sua empresa</p>
          <p className="auth-brand-sub">
            Preencha o formulário e aguarde a aprovação do administrador para começar a usar o sistema.
          </p>

          <div className="auth-brand-features">
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon">🏢</div>
              <div className="auth-brand-feature-text">
                <strong>Vínculo por Empresa</strong>
                <span>Seu acesso é isolado por empresa e setor.</span>
              </div>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon">🔒</div>
              <div className="auth-brand-feature-text">
                <strong>Acesso Controlado</strong>
                <span>Administradores aprovam cada novo membro.</span>
              </div>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon">⚡</div>
              <div className="auth-brand-feature-text">
                <strong>Início Rápido</strong>
                <span>Após aprovação, acesse todos os módulos.</span>
              </div>
            </div>
          </div>
        </div>

        {/* PAINEL DIREITO */}
        <div className="auth-form-panel">
          <h1 className="auth-form-title">Solicitar acesso</h1>
          <p className="auth-form-subtitle">Cadastre-se na empresa e setor corretos</p>

          {msg && <div className={`auth-msg ${erro ? "error" : "success"}`}>{msg}</div>}

          <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: "16px" }}>
            <div className="auth-form-grid">
              <div className="form-group span-2">
                <label>Nome completo *</label>
                <input className="input-base" type="text" name="nome_completo"
                  value={form.nome_completo} onChange={handleChange}
                  placeholder="Seu nome completo" required />
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input className="input-base" type="email" name="email"
                  value={form.email} onChange={handleChange}
                  placeholder="seu@email.com" required />
              </div>

              <div className="form-group">
                <label>CPF *</label>
                <input className="input-base" type="text" name="cpf"
                  value={form.cpf} onChange={handleChange}
                  placeholder="000.000.000-00" maxLength={14} required />
              </div>

              <div className="form-group span-2">
                <label>Senha *</label>
                <input className="input-base" type="password" name="senha"
                  value={form.senha} onChange={handleChange}
                  placeholder="Crie uma senha segura" required />
              </div>

              <div className="form-group">
                <label>Empresa *</label>
                <select className="select-base" name="empresa_id"
                  value={form.empresa_id} onChange={handleChange} required>
                  <option value="">Selecione a empresa</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.nome_fantasia}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Setor *</label>
                <select className="select-base" name="setor_id"
                  value={form.setor_id} onChange={handleChange}
                  required disabled={!form.empresa_id || loadingSetores}>
                  <option value="">
                    {!form.empresa_id ? "Selecione a empresa primeiro"
                      : loadingSetores ? "Carregando..." : "Selecione o setor"}
                  </option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Cadastrar"}
            </button>
          </form>

          <div className="auth-links">
            <span>Já tem conta? <Link to="/login">Entrar</Link></span>
            <span>Quer cadastrar uma empresa? <Link to="/cadastro-empresa">Criar empresa</Link></span>
          </div>
        </div>

      </div>
    </div>
  );
}
