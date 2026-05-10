import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../services/api";

export default function RegisterEmpresa() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    nome_fantasia: "", razao_social: "", cnpj: "",
    email_empresa: "", telefone: "",
    nome_responsavel: "", email_responsavel: "",
    cpf_responsavel: "", senha: "",
  });

  const [msg,     setMsg]     = useState("");
  const [erro,    setErro]    = useState(false);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(""); setErro(false); setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/register-empresa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErro(true); setMsg(data.message || "Erro ao cadastrar empresa."); return; }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setMsg("Empresa cadastrada com sucesso!");
      setTimeout(() => navigate("/home"), 1000);
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

          <p className="auth-brand-tagline">Crie sua empresa agora</p>
          <p className="auth-brand-sub">
            Configure sua empresa em minutos. O responsável já recebe acesso de administrador e pode convidar a equipe imediatamente.
          </p>

          <div className="auth-brand-features">
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon">🏭</div>
              <div className="auth-brand-feature-text">
                <strong>Multi-empresa</strong>
                <span>Dados completamente isolados por empresa.</span>
              </div>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon">👤</div>
              <div className="auth-brand-feature-text">
                <strong>Admin Imediato</strong>
                <span>O responsável já recebe acesso de administrador.</span>
              </div>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon">🚀</div>
              <div className="auth-brand-feature-text">
                <strong>Pronto para Usar</strong>
                <span>Convide sua equipe e configure setores na hora.</span>
              </div>
            </div>
          </div>
        </div>

        {/* PAINEL DIREITO */}
        <div className="auth-form-panel">
          <h1 className="auth-form-title">Criar empresa</h1>
          <p className="auth-form-subtitle">Configure a empresa e o administrador principal</p>

          {msg && (
            <div className={`auth-msg ${erro ? "error" : "success"}`} style={{ marginBottom: 16 }}>
              {msg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: "8px" }}>

            <p className="auth-section-title">Dados da empresa</p>

            <div className="auth-form-grid">
              <div className="form-group">
                <label>Nome fantasia *</label>
                <input className="input-base" type="text" name="nome_fantasia"
                  value={form.nome_fantasia} onChange={handleChange}
                  placeholder="Nome da empresa" required />
              </div>

              <div className="form-group">
                <label>Razão social</label>
                <input className="input-base" type="text" name="razao_social"
                  value={form.razao_social} onChange={handleChange}
                  placeholder="Razão social (opcional)" />
              </div>

              <div className="form-group">
                <label>CNPJ *</label>
                <input className="input-base" type="text" name="cnpj"
                  value={form.cnpj} onChange={handleChange}
                  placeholder="00.000.000/0000-00" required />
              </div>

              <div className="form-group">
                <label>Email da empresa *</label>
                <input className="input-base" type="email" name="email_empresa"
                  value={form.email_empresa} onChange={handleChange}
                  placeholder="contato@empresa.com" required />
              </div>

              <div className="form-group span-2">
                <label>Telefone *</label>
                <input className="input-base" type="text" name="telefone"
                  value={form.telefone} onChange={handleChange}
                  placeholder="(00) 00000-0000" required />
              </div>
            </div>

            <p className="auth-section-title" style={{ marginTop: 8 }}>Responsável principal</p>

            <div className="auth-form-grid">
              <div className="form-group span-2">
                <label>Nome completo *</label>
                <input className="input-base" type="text" name="nome_responsavel"
                  value={form.nome_responsavel} onChange={handleChange}
                  placeholder="Nome do administrador" required />
              </div>

              <div className="form-group">
                <label>Email do responsável *</label>
                <input className="input-base" type="email" name="email_responsavel"
                  value={form.email_responsavel} onChange={handleChange}
                  placeholder="admin@empresa.com" required />
              </div>

              <div className="form-group">
                <label>CPF do responsável *</label>
                <input className="input-base" type="text" name="cpf_responsavel"
                  value={form.cpf_responsavel} onChange={handleChange}
                  placeholder="000.000.000-00" required />
              </div>

              <div className="form-group span-2">
                <label>Senha *</label>
                <input className="input-base" type="password" name="senha"
                  value={form.senha} onChange={handleChange}
                  placeholder="Crie uma senha segura" required />
              </div>
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Cadastrando..." : "Criar empresa"}
            </button>
          </form>

          <div className="auth-links">
            <span>Já tem conta? <Link to="/login">Entrar</Link></span>
            <span>Quer entrar como funcionário? <Link to="/cadastro-usuario">Solicitar acesso</Link></span>
          </div>
        </div>

      </div>
    </div>
  );
}
