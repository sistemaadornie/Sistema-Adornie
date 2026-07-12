import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, loginError, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = await login(email, senha);
    if (ok) {
      const from = location.state?.from?.pathname || "/";
      navigate(from, { replace: true });
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="login-glow" />
        <img src="/icon-192.png" alt="Adornie" className="login-logo" />
        <h1 className="page-title" style={{ marginBottom: 4 }}>Sistema Adornie</h1>
        <p className="page-subtitle">Acesse com seu login da equipe de campo</p>
      </div>

      {loginError && (
        <div className="banner banner-danger">{loginError}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email</label>
          <input
            className="input-base"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="form-group">
          <label>Senha</label>
          <input
            className="input-base"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 16 }}>
        Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link>
      </p>
    </div>
  );
}
