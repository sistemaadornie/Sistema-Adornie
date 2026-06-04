import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../../../services/api";

export default function useDashboardPedidos() {
  const [pedidos, setPedidos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState(null);
  const inicializado            = useRef(false);

  const carregar = useCallback(async (filtros = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.consultora_id) params.set("consultora_id", filtros.consultora_id);
      if (filtros.status)        params.set("status",        filtros.status);
      if (filtros.alerta)        params.set("alerta",        filtros.alerta);
      const qs = params.toString();
      const res = await api.get(`/dashboard/pedidos${qs ? "?" + qs : ""}`);
      setPedidos(res.pedidos || []);
      setErro(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inicializado.current) return;
    inicializado.current = true;
    carregar();
  }, [carregar]);

  const atualizarEtapa = useCallback(async (pedidoId, campo, valor) => {
    await api.patch(`/pedidos/${pedidoId}/etapa`, { campo, valor });
  }, []);

  return { pedidos, loading, erro, carregar, atualizarEtapa };
}
