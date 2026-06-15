import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API_BASE } from "../services/api";

const AuthContext = createContext(null);

function readUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    window.addEventListener("auth:unauthorized", logout);
    return () => window.removeEventListener("auth:unauthorized", logout);
  }, [logout]);

  const login = useCallback(async (email, senha) => {
    setLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoginError(data.message || "Email ou senha inválidos.");
        return false;
      }

      const permissoes = data.user?.permissoes ?? [];
      if (!permissoes.includes("INSTALADOR")) {
        setLoginError("Este aplicativo é exclusivo para a equipe de instalação.");
        return false;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch {
      setLoginError("Erro de conexão com o servidor.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    loading,
    loginError,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
