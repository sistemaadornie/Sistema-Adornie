import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../services/api";

const Ctx = createContext(null);

export function NotificacoesProvider({ children }) {
  const [notificacoes, setNotificacoes] = useState([]);
  const [carregando,   setCarregando]   = useState(false);
  const intervalRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const res = await api.get("/notificacoes");
      setNotificacoes(res.notificacoes || []);
    } catch {
      /* silencioso — pode estar deslogado */
    }
  }, []);

  /* Polling a cada 30s — pausa quando a aba está em background */
  useEffect(() => {
    carregar();
    intervalRef.current = setInterval(carregar, 30_000);
    function onVisibility() {
      if (document.hidden) {
        clearInterval(intervalRef.current);
      } else {
        carregar();
        intervalRef.current = setInterval(carregar, 30_000);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [carregar]);

  const criar = useCallback(async (dados) => {
    try {
      const res = await api.post("/notificacoes", dados);
      setNotificacoes((prev) => [res.notificacao, ...prev]);
      return res.notificacao;
    } catch { return null; }
  }, []);

  const marcarLida = useCallback(async (id) => {
    try {
      await api.put(`/notificacoes/${id}/lida`, {});
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
    } catch { /* silencioso */ }
  }, []);

  const marcarTodasLidas = useCallback(async () => {
    try {
      await api.put("/notificacoes/lidas", {});
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    } catch { /* silencioso */ }
  }, []);

  const excluir = useCallback(async (id) => {
    try {
      await api.delete(`/notificacoes/${id}`);
      setNotificacoes((prev) => prev.filter((n) => n.id !== id));
    } catch { /* silencioso */ }
  }, []);

  const limparTodas = useCallback(async () => {
    try {
      await api.delete("/notificacoes");
      setNotificacoes([]);
    } catch { /* silencioso */ }
  }, []);

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <Ctx.Provider value={{ notificacoes, naoLidas, carregando, carregar, criar, marcarLida, marcarTodasLidas, excluir, limparTodas }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotificacoes() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotificacoes deve ser usado dentro de NotificacoesProvider");
  return ctx;
}
