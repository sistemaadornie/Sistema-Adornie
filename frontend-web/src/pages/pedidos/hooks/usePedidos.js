import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";

export default function usePedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);
  const inicializado = useRef(false);

  const carregar = useCallback(async (filtros = {}) => {
    const isPrimeira = !inicializado.current;
    try {
      if (isPrimeira) setLoading(true);
      setErro(null);
      const params = new URLSearchParams();
      if (filtros.q)      params.set("q",      filtros.q);
      if (filtros.status) params.set("status", filtros.status);
      const query = params.toString();
      const res = await api.get(`/pedidos${query ? `?${query}` : ""}`);
      setPedidos(res.pedidos || []);
      inicializado.current = true;
    } catch (err) {
      setErro(err.message || "Erro ao carregar pedidos.");
    } finally {
      if (isPrimeira) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = useCallback(async (dados) => {
    const res = await api.post("/pedidos", dados);
    await carregar();
    return res.pedido;
  }, [carregar]);

  const atualizar = useCallback(async (id, dados) => {
    const res = await api.put(`/pedidos/${id}`, dados);
    await carregar();
    return res.pedido;
  }, [carregar]);

  const excluir = useCallback(async (id) => {
    await api.delete(`/pedidos/${id}`);
    await carregar();
  }, [carregar]);

  const importar = useCallback(async (dados) => {
    const res = await api.post("/pedidos/importar", dados);
    await carregar();
    return res.pedido;
  }, [carregar]);

  return { pedidos, loading, erro, carregar, criar, atualizar, excluir, importar };
}
