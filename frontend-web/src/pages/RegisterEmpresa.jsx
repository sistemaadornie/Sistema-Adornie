import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../services/api";
import AdornieWordmark from "../components/AdornieWordmark";

// ── Máscaras ──────────────────────────────────────────────────────────────────
function maskCNPJ(v) {
  v = v.replace(/\D/g, "").slice(0, 14);
  if (v.length <= 2)  return v;
  if (v.length <= 5)  return `${v.slice(0,2)}.${v.slice(2)}`;
  if (v.length <= 8)  return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5)}`;
  if (v.length <= 12) return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8)}`;
  return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12)}`;
}

function maskCPF(v) {
  v = v.replace(/\D/g, "").slice(0, 11);
  if (v.length <= 3)  return v;
  if (v.length <= 6)  return `${v.slice(0,3)}.${v.slice(3)}`;
  if (v.length <= 9)  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
}

function maskPhone(v) {
  v = v.replace(/\D/g, "").slice(0, 11);
  if (v.length <= 2)  return `(${v}`;
  if (v.length <= 6)  return `(${v.slice(0,2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
}

// ── Validações ────────────────────────────────────────────────────────────────
function validarCNPJ(cnpj) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n, weights) =>
    weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
  const r1 = calc(0, [5,4,3,2,9,8,7,6,5,4,3,2]);
  const dig1 = (r1 % 11 < 2) ? 0 : 11 - (r1 % 11);
  const r2 = calc(0, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  const dig2 = (r2 % 11 < 2) ? 0 : 11 - (r2 % 11);
  return Number(d[12]) === dig1 && Number(d[13]) === dig2;
}

function validarCPF(cpf) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const soma = (n) =>
    Array.from({ length: n }, (_, i) => Number(d[i]) * (n + 1 - i)).reduce((a, b) => a + b, 0);
  const dig1 = (soma(9) * 10) % 11 % 10;
  const dig2 = (soma(10) * 10) % 11 % 10;
  return Number(d[9]) === dig1 && Number(d[10]) === dig2;
}

function Field({ name, label, required, children, span, erros }) {
  return (
    <div className={`form-group${span ? ` span-${span}` : ""}`}>
      <label>{label}{required && " *"}</label>
      {children}
      {erros?.[name] && <span className="field-error">{erros[name]}</span>}
    </div>
  );
}

const INITIAL_FORM = {
  nome_fantasia: "", razao_social: "", cnpj: "",
  email_empresa: "", telefone: "",
  nome_responsavel: "", email_responsavel: "",
  cpf_responsavel: "", senha: "", confirmar_senha: "",
};

export default function RegisterEmpresa() {
  const navigate = useNavigate();

  const [form,       setForm]       = useState(INITIAL_FORM);
  const [erros,      setErros]      = useState({});
  const [msg,        setMsg]        = useState("");
  const [erroGeral,  setErroGeral]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [showSenha,  setShowSenha]  = useState(false);
  const [showConf,   setShowConf]   = useState(false);

  function handleChange(e) {
    let { name, value } = e.target;
    if (name === "cnpj")          value = maskCNPJ(value);
    if (name === "cpf_responsavel") value = maskCPF(value);
    if (name === "telefone")      value = maskPhone(value);
    setForm((f) => ({ ...f, [name]: value }));
    setErros((er) => ({ ...er, [name]: "" }));
  }

  function validar() {
    const e = {};

    if (!form.nome_fantasia.trim())
      e.nome_fantasia = "Nome fantasia é obrigatório.";

    const cnpjDigits = form.cnpj.replace(/\D/g, "");
    if (!cnpjDigits)
      e.cnpj = "CNPJ é obrigatório.";
    else if (!validarCNPJ(form.cnpj))
      e.cnpj = "CNPJ inválido.";

    if (!form.email_empresa.trim())
      e.email_empresa = "Email da empresa é obrigatório.";

    const telDigits = form.telefone.replace(/\D/g, "");
    if (!telDigits)
      e.telefone = "Telefone é obrigatório.";
    else if (telDigits.length < 10)
      e.telefone = "Telefone incompleto.";

    if (!form.nome_responsavel.trim())
      e.nome_responsavel = "Nome do responsável é obrigatório.";

    if (!form.email_responsavel.trim())
      e.email_responsavel = "Email do responsável é obrigatório.";

    const cpfDigits = form.cpf_responsavel.replace(/\D/g, "");
    if (!cpfDigits)
      e.cpf_responsavel = "CPF é obrigatório.";
    else if (!validarCPF(form.cpf_responsavel))
      e.cpf_responsavel = "CPF inválido.";

    if (!form.senha)
      e.senha = "Senha é obrigatória.";
    else if (form.senha.length < 8)
      e.senha = "Mínimo de 8 caracteres.";

    if (!form.confirmar_senha)
      e.confirmar_senha = "Confirme a senha.";
    else if (form.senha !== form.confirmar_senha)
      e.confirmar_senha = "As senhas não coincidem.";

    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(""); setErroGeral(false);

    const errosForm = validar();
    if (Object.keys(errosForm).length > 0) {
      setErros(errosForm);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        cnpj:          form.cnpj.replace(/\D/g, ""),
        telefone:      form.telefone.replace(/\D/g, ""),
        cpf_responsavel: form.cpf_responsavel.replace(/\D/g, ""),
      };
      delete payload.confirmar_senha;

      const res  = await fetch(`${API_BASE}/auth/register-empresa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroGeral(true);
        setMsg(data.message || "Erro ao cadastrar empresa.");
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setMsg("Empresa cadastrada com sucesso!");
      setTimeout(() => navigate("/home"), 1000);
    } catch {
      setErroGeral(true);
      setMsg("Erro de conexão com o servidor.");
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
              <img src="/logo-adornie.png" alt="Adornie" className="auth-brand-logo-img" />
              <span className="auth-logo-sub">agenda</span>
              <AdornieWordmark className="auth-logo-main-img" />
              <div className="auth-logo-rule" />
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
            <div className={`auth-msg ${erroGeral ? "error" : "success"}`} style={{ marginBottom: 16 }}>
              {msg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate style={{ marginTop: "8px" }}>

            <p className="auth-section-title">Dados da empresa</p>

            <div className="auth-form-grid">
              <Field name="nome_fantasia" label="Nome fantasia" required erros={erros}>
                <input className={`input-base${erros.nome_fantasia ? " input-error" : ""}`}
                  type="text" name="nome_fantasia"
                  value={form.nome_fantasia} onChange={handleChange}
                  placeholder="Nome comercial da empresa" />
              </Field>

              <Field name="razao_social" label="Razão social" erros={erros}>
                <input className="input-base" type="text" name="razao_social"
                  value={form.razao_social} onChange={handleChange}
                  placeholder="Razão social (opcional)" />
              </Field>

              <Field name="cnpj" label="CNPJ" required erros={erros}>
                <input className={`input-base${erros.cnpj ? " input-error" : ""}`}
                  type="text" name="cnpj" inputMode="numeric"
                  value={form.cnpj} onChange={handleChange}
                  placeholder="00.000.000/0000-00" />
              </Field>

              <Field name="email_empresa" label="Email da empresa" required erros={erros}>
                <input className={`input-base${erros.email_empresa ? " input-error" : ""}`}
                  type="email" name="email_empresa"
                  value={form.email_empresa} onChange={handleChange}
                  placeholder="contato@empresa.com" />
              </Field>

              <Field name="telefone" label="Telefone" required span={2} erros={erros}>
                <input className={`input-base${erros.telefone ? " input-error" : ""}`}
                  type="text" name="telefone" inputMode="numeric"
                  value={form.telefone} onChange={handleChange}
                  placeholder="(00) 00000-0000" />
              </Field>
            </div>

            <p className="auth-section-title" style={{ marginTop: 8 }}>Responsável principal</p>

            <div className="auth-form-grid">
              <Field name="nome_responsavel" label="Nome completo" required span={2} erros={erros}>
                <input className={`input-base${erros.nome_responsavel ? " input-error" : ""}`}
                  type="text" name="nome_responsavel"
                  value={form.nome_responsavel} onChange={handleChange}
                  placeholder="Nome do administrador" />
              </Field>

              <Field name="email_responsavel" label="Email do responsável" required erros={erros}>
                <input className={`input-base${erros.email_responsavel ? " input-error" : ""}`}
                  type="email" name="email_responsavel"
                  value={form.email_responsavel} onChange={handleChange}
                  placeholder="admin@empresa.com" />
              </Field>

              <Field name="cpf_responsavel" label="CPF do responsável" required erros={erros}>
                <input className={`input-base${erros.cpf_responsavel ? " input-error" : ""}`}
                  type="text" name="cpf_responsavel" inputMode="numeric"
                  value={form.cpf_responsavel} onChange={handleChange}
                  placeholder="000.000.000-00" />
              </Field>

              <Field name="senha" label="Senha" required erros={erros}>
                <div className="input-password-wrap">
                  <input className={`input-base${erros.senha ? " input-error" : ""}`}
                    type={showSenha ? "text" : "password"} name="senha"
                    value={form.senha} onChange={handleChange}
                    placeholder="Mínimo 8 caracteres" />
                  <button type="button" className="input-eye" onClick={() => setShowSenha((v) => !v)}
                    tabIndex={-1} aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}>
                    {showSenha ? "🙈" : "👁️"}
                  </button>
                </div>
              </Field>

              <Field name="confirmar_senha" label="Confirmar senha" required erros={erros}>
                <div className="input-password-wrap">
                  <input className={`input-base${erros.confirmar_senha ? " input-error" : ""}`}
                    type={showConf ? "text" : "password"} name="confirmar_senha"
                    value={form.confirmar_senha} onChange={handleChange}
                    placeholder="Repita a senha" />
                  <button type="button" className="input-eye" onClick={() => setShowConf((v) => !v)}
                    tabIndex={-1} aria-label={showConf ? "Ocultar senha" : "Mostrar senha"}>
                    {showConf ? "🙈" : "👁️"}
                  </button>
                </div>
              </Field>
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
