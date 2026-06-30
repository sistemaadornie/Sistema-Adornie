import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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

/* Lê o token do fragment (#token=...) — nunca vai ao servidor nem aparece em logs HTTP */
function lerTokenDoFragment() {
  const hash = window.location.hash.slice(1); // remove o '#'
  const params = new URLSearchParams(hash);
  return params.get("token") || "";
}

export default function ResetarSenha() {
  const navigate = useNavigate();

  const [token]        = useState(lerTokenDoFragment);
  const [novaSenha,    setNovaSenha]    = useState("");
  const [confirmar,    setConfirmar]    = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [msg,          setMsg]          = useState("");
  const [tipo,         setTipo]         = useState("");
  const [loading,      setLoading]      = useState(false);
  const [concluido,    setConcluido]    = useState(false);
  const [contador,     setContador]     = useState(5);

  useEffect(() => {
    if (!token) {
      setTipo("error");
      setMsg("Link inválido. Solicite uma nova recuperação de senha.");
    }
  }, [token]);

  /* Contagem regressiva + auto-login após sucesso */
  useEffect(() => {
    if (!concluido) return;
    if (contador <= 0) {
      navigate("/home");
      return;
    }
    const t = setTimeout(() => setContador((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [concluido, contador, navigate]);

  function validar() {
    if (novaSenha.length < 8)  return "A senha deve ter pelo menos 8 caracteres.";
    if (novaSenha !== confirmar) return "As senhas não coincidem.";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const erro = validar();
    if (erro) { setTipo("error"); setMsg(erro); return; }

    setLoading(true); setMsg(""); setTipo("");
    try {
      const res  = await fetch(`${API_BASE}/auth/resetar-senha`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, nova_senha: novaSenha }),
      });
      const data = await res.json();

      if (res.ok) {
        /* Auto-login — armazena credenciais e redireciona direto pro /home */
        if (data.token && data.user) {
          localStorage.setItem("token", data.token);
          salvarUser(data.user);
        }
        setTipo("success");
        setMsg(data.message);
        setConcluido(true);
      } else {
        setTipo("error");
        setMsg(data.message || "Não foi possível redefinir a senha.");
      }
    } catch {
      setTipo("error"); setMsg("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  const forcaSenha = (() => {
    if (!novaSenha) return null;
    if (novaSenha.length < 8) return { nivel: 1, label: "Muito curta", cor: "#ef4444" };
    const score =
      (/\d/.test(novaSenha) ? 1 : 0) +
      (/[A-Z]/.test(novaSenha) ? 1 : 0) +
      (/[^a-zA-Z0-9]/.test(novaSenha) ? 1 : 0);
    return [
      null,
      { nivel: 1, label: "Muito curta", cor: "#ef4444" },
      { nivel: 2, label: "Fraca",  cor: "#f97316" },
      { nivel: 3, label: "Média",  cor: "#eab308" },
      { nivel: 4, label: "Boa",    cor: "#22c55e" },
      { nivel: 5, label: "Forte",  cor: "#16a34a" },
    ][score + 1] ?? { nivel: 5, label: "Forte", cor: "#16a34a" };
  })();

  return (
    <div className="auth-screen">
      <div className="auth-split">

        {/* Painel esquerdo */}
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
            {concluido ? "Tudo pronto!" : "Crie uma nova senha"}
          </p>
          <p className="auth-brand-sub">
            {concluido
              ? "Sua senha foi atualizada e você já está logado. Redirecionando para o painel…"
              : "Escolha uma senha segura. Após confirmar, você será automaticamente logado no painel."}
          </p>
        </div>

        {/* Painel direito */}
        <div className="auth-form-panel">

          {!concluido ? (
            <>
              <h1 className="auth-form-title">Redefinir senha</h1>
              <p className="auth-form-subtitle">Digite e confirme sua nova senha</p>

              {msg && <div className={`auth-msg ${tipo}`}>{msg}</div>}

              {token && (
                <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: msg ? "8px" : "0" }}>

                  <div className="form-group">
                    <label>Nova senha</label>
                    <div style={{ position: "relative" }}>
                      <input
                        className="input-base"
                        type={mostrarSenha ? "text" : "password"}
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        required
                        autoFocus
                        style={{ paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha((v) => !v)}
                        tabIndex={-1}
                        style={{
                          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "var(--color-text-muted)", fontSize: 14, padding: 2,
                        }}
                      >
                        {mostrarSenha ? "🙈" : "👁"}
                      </button>
                    </div>

                    {/* Barra de força */}
                    {forcaSenha && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div
                              key={n}
                              style={{
                                flex: 1, height: 3, borderRadius: 2,
                                background: n <= forcaSenha.nivel ? forcaSenha.cor : "var(--color-border)",
                                transition: "background 0.25s",
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                          <span style={{ color: forcaSenha.cor }}>{forcaSenha.label}</span>
                          <span style={{ color: "var(--color-text-muted)" }}>
                            {!/[A-Z]/.test(novaSenha) && "· Maiúscula "}
                            {!/\d/.test(novaSenha) && "· Número "}
                            {!/[^a-zA-Z0-9]/.test(novaSenha) && "· Símbolo"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Confirmar nova senha</label>
                    <input
                      className="input-base"
                      type={mostrarSenha ? "text" : "password"}
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      placeholder="Repita a senha"
                      required
                      style={{
                        borderColor: confirmar && confirmar !== novaSenha
                          ? "var(--color-danger)"
                          : confirmar && confirmar === novaSenha
                            ? "var(--color-success)"
                            : undefined,
                      }}
                    />
                    {confirmar && confirmar !== novaSenha && (
                      <span style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 4, display: "block" }}>
                        As senhas não coincidem
                      </span>
                    )}
                  </div>

                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? "Salvando…" : "Redefinir senha"}
                  </button>
                </form>
              )}
            </>
          ) : (
            /* ── Tela de sucesso animada ── */
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
                background: "linear-gradient(135deg,rgba(34,197,94,0.15),rgba(22,163,74,0.08))",
                border: "2px solid rgba(34,197,94,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32,
                animation: "successPop 0.4s cubic-bezier(0.34,1.56,0.64,1)",
              }}>
                ✓
              </div>
              <style>{`
                @keyframes successPop {
                  from { transform: scale(0.4); opacity: 0; }
                  to   { transform: scale(1);   opacity: 1; }
                }
              `}</style>

              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "var(--color-text)" }}>
                Senha atualizada!
              </h2>
              <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                {msg}
              </p>

              <div style={{
                padding: "14px 20px", background: "var(--color-surface-soft)",
                borderRadius: 10, border: "1px solid var(--color-border)",
                marginBottom: 20,
              }}>
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Redirecionando para o painel em
                  {" "}<strong style={{ color: "var(--color-primary)", fontSize: 16 }}>{contador}s</strong>
                </p>
              </div>

              <button
                className="auth-submit"
                onClick={() => navigate("/home")}
                style={{ maxWidth: 220, margin: "0 auto" }}
              >
                Ir para o painel agora →
              </button>
            </div>
          )}

          {!concluido && (
            <div className="auth-links" style={{ marginTop: 16 }}>
              <span>
                <Link to="/login" style={{ fontSize: 13, color: "#a78bfa" }}>
                  ← Voltar para o login
                </Link>
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
