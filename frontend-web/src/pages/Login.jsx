import { useState } from "react";
import { Link } from "react-router-dom";
import { FaSun, FaMoon } from "react-icons/fa";
import { API_BASE } from "../services/api";
import AdornieWordmark from "../components/AdornieWordmark";

function salvarUser(u) {
  const seguro = {
    id: u.id, email: u.email, nome_completo: u.nome_completo,
    foto_url: u.foto_url ?? null,
    setor_id: u.setor_id, setor_nome: u.setor_nome,
    empresa_id: u.empresa_id, empresa_nome: u.empresa_nome,
    status: u.status, permissoes: u.permissoes ?? [],
  };
  localStorage.setItem("user", JSON.stringify(seguro));
}

const BrandPanel = ({ forgotMode }) => (
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

    <p className="auth-brand-tagline">
      {forgotMode ? "Recupere seu acesso" : "Bem-vindo de volta"}
    </p>
    <p className="auth-brand-sub">
      {forgotMode
        ? "Informe o e-mail cadastrado e enviaremos um link para criar uma nova senha."
        : "Acesse o painel da sua empresa e gerencie toda a agenda em um único lugar."}
    </p>

    {!forgotMode && (
      <div className="auth-brand-features">
        <div className="auth-brand-feature">
          <div className="auth-brand-feature-icon">📅</div>
          <div className="auth-brand-feature-text">
            <strong>Agendamentos</strong>
            <span>Calendário, mapa e status em tempo real.</span>
          </div>
        </div>
        <div className="auth-brand-feature">
          <div className="auth-brand-feature-icon">👥</div>
          <div className="auth-brand-feature-text">
            <strong>Gestão de Equipe</strong>
            <span>Permissões e acesso por setor.</span>
          </div>
        </div>
      </div>
    )}
  </div>
);

export default function Login() {
  const [email,   setEmail]   = useState("");
  const [senha,   setSenha]   = useState("");
  const [msg,     setMsg]     = useState("");
  const [tipo,    setTipo]    = useState("");
  const [loading, setLoading] = useState(false);

  const [forgotMode,    setForgotMode]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState("");
  const [forgotMsg,     setForgotMsg]     = useState("");
  const [forgotTipo,    setForgotTipo]    = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (loading) return;
    setMsg(""); setTipo(""); setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token);
        salvarUser(data.user);
        setTipo("success"); setMsg("Login realizado!");
        setTimeout(() => { window.location.href = "/home"; }, 800);
      } else {
        setTipo("error"); setMsg(data.message || "Email ou senha inválidos.");
      }
    } catch {
      setTipo("error"); setMsg("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (forgotLoading) return;
    setForgotMsg(""); setForgotTipo(""); setForgotLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/solicitar-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setForgotTipo("success"); setForgotMsg(data.message);
      } else {
        setForgotTipo("error"); setForgotMsg(data.message || "Não foi possível registrar a solicitação.");
      }
    } catch {
      setForgotTipo("error"); setForgotMsg("Erro de conexão com o servidor.");
    } finally {
      setForgotLoading(false);
    }
  }

  function voltarParaLogin() {
    setForgotMode(false);
    setForgotEmail(""); setForgotMsg(""); setForgotTipo("");
  }

  return (
    <div className="auth-screen">
      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      >
        {theme === "dark" ? <FaSun /> : <FaMoon />}
      </button>

      <div className="auth-split">

        <BrandPanel forgotMode={forgotMode} />

        <div className="auth-form-panel">

          {!forgotMode ? (
            <>
              <h1 className="auth-form-title">Entrar na conta</h1>
              <p className="auth-form-subtitle">Acesse o painel da sua empresa</p>

              {msg && <div className={`auth-msg ${tipo}`}>{msg}</div>}

              <form onSubmit={handleLogin} className="auth-form" style={{ marginTop: msg ? "8px" : "0" }}>
                <div className="form-group">
                  <label>Email</label>
                  <input className="input-base" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com" required autoComplete="email" />
                </div>

                <div className="form-group">
                  <label>Senha</label>
                  <input className="input-base" type="password" value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password" />
                  <div className="auth-forgot-row">
                    <button type="button" className="auth-forgot-link"
                      onClick={() => setForgotMode(true)}>
                      Esqueci minha senha
                    </button>
                  </div>
                </div>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </form>

              <div className="auth-links">
                <span>Primeiro acesso? <Link to="/solicitar-acesso">Solicitar acesso</Link></span>
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-form-title">Recuperar senha</h1>
              <p className="auth-form-subtitle">
                Enviaremos um link de recuperação para o seu e-mail
              </p>

              {forgotMsg && <div className={`auth-msg ${forgotTipo}`}>{forgotMsg}</div>}

              {!forgotMsg && (
                <form onSubmit={handleForgot} className="auth-form" style={{ marginTop: "8px" }}>
                  <div className="form-group">
                    <label>E-mail cadastrado</label>
                    <input className="input-base" type="email" value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com" required autoFocus />
                  </div>
                  <button type="submit" className="auth-submit" disabled={forgotLoading}>
                    {forgotLoading ? "Enviando..." : "Enviar link de recuperação"}
                  </button>
                </form>
              )}

              <div className="auth-links" style={{ marginTop: forgotMsg ? "20px" : "16px" }}>
                <span>
                  <button type="button" className="auth-forgot-link"
                    style={{ fontSize: 13, color: "var(--color-primary)" }}
                    onClick={voltarParaLogin}>
                    ← Voltar para o login
                  </button>
                </span>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
