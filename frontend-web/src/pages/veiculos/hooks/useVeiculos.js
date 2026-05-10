import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";

export default function useVeiculos() {
  const [veiculos,  setVeiculos]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [erro,      setErro]      = useState(null);
  const inicializado = useRef(false);

  const carregar = useCallback(async (q = "") => {
    const isPrimeira = !inicializado.current;
    try {
      if (isPrimeira) setLoading(true);
      setErro(null);
      const path = q ? `/veiculos?q=${encodeURIComponent(q)}` : "/veiculos";
      const res = await api.get(path);
      setVeiculos(res.veiculos || []);
      inicializado.current = true;
    } catch (err) {
      setErro(err.message || "Erro ao carregar veículos.");
    } finally {
      if (isPrimeira) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = useCallback(async (formData) => {
    const res = await api.post("/veiculos", formData, true);
    await carregar();
    return res.veiculo;
  }, [carregar]);

  const atualizar = useCallback(async (id, formData) => {
    const res = await api.put(`/veiculos/${id}`, formData, true);
    await carregar();
    return res.veiculo;
  }, [carregar]);

  const excluir = useCallback(async (id) => {
    await api.delete(`/veiculos/${id}`);
    await carregar();
  }, [carregar]);

  return { veiculos, loading, erro, carregar, criar, atualizar, excluir };
}
