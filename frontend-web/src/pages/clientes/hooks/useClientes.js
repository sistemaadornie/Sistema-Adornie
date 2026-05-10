import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";

export default function useClientes() {
  const [clientes,  setClientes]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [erro,      setErro]      = useState(null);
  const inicializado = useRef(false);

  const carregar = useCallback(async (q = "") => {
    const isPrimeira = !inicializado.current;
    try {
      if (isPrimeira) setLoading(true);
      setErro(null);
      const path = q ? `/clientes?q=${encodeURIComponent(q)}` : "/clientes";
      const res = await api.get(path);
      setClientes(res.clientes || []);
      inicializado.current = true;
    } catch (err) {
      setErro(err.message || "Erro ao carregar clientes.");
    } finally {
      if (isPrimeira) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = useCallback(async (dados) => {
    const res = await api.post("/clientes", dados);
    await carregar();
    return res.cliente;
  }, [carregar]);

  const atualizar = useCallback(async (id, dados) => {
    const res = await api.put(`/clientes/${id}`, dados);
    await carregar();
    return res.cliente;
  }, [carregar]);

  const excluir = useCallback(async (id) => {
    await api.delete(`/clientes/${id}`);
    await carregar();
  }, [carregar]);

  const adicionarEndereco = useCallback(async (clienteId, dados) => {
    const res = await api.post(`/clientes/${clienteId}/enderecos`, dados);
    setClientes((p) => p.map((c) => c.id === clienteId ? res.cliente : c));
    return res.cliente;
  }, []);

  const atualizarEndereco = useCallback(async (clienteId, endId, dados) => {
    const res = await api.put(`/clientes/${clienteId}/enderecos/${endId}`, dados);
    setClientes((p) => p.map((c) => c.id === clienteId ? res.cliente : c));
    return res.cliente;
  }, []);

  const removerEndereco = useCallback(async (clienteId, endId) => {
    const res = await api.delete(`/clientes/${clienteId}/enderecos/${endId}`);
    setClientes((p) => p.map((c) => c.id === clienteId ? res.cliente : c));
    return res.cliente;
  }, []);

  const definirPadrao = useCallback(async (clienteId, endId) => {
    const res = await api.put(`/clientes/${clienteId}/enderecos/${endId}/padrao`, {});
    setClientes((p) => p.map((c) => c.id === clienteId ? res.cliente : c));
    return res.cliente;
  }, []);

  return {
    clientes,
    loading,
    erro,
    carregar,
    criar,
    atualizar,
    excluir,
    adicionarEndereco,
    atualizarEndereco,
    removerEndereco,
    definirPadrao,
  };
}
