import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../services/api";

export default function useAgendamentos() {
  const [agendamentos, setAgendamentos] = useState([]);
  const [equipe,       setEquipe]       = useState([]);
  const [loading,      setLoading]      = useState(true);  // só true na carga inicial
  const [erro,         setErro]         = useState(null);
  const inicializado   = useRef(false);

  /* ── carregar tudo ── */
  const carregar = useCallback(async () => {
    const isPrimeiraVez = !inicializado.current;
    try {
      if (isPrimeiraVez) setLoading(true);
      setErro(null);

      const [agRes, eqRes] = await Promise.all([
        api.get("/agendamentos"),
        api.get("/agendamentos/equipe"),
      ]);

      setAgendamentos((agRes.agendamentos || []).filter((a) => a.status !== "cancelado"));
      setEquipe(eqRes.equipe || []);
      inicializado.current = true;
    } catch (err) {
      console.error("useAgendamentos:", err);
      setErro(err.message || "Erro ao carregar agendamentos.");
    } finally {
      if (isPrimeiraVez) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /* ── criar ── */
  const criar = useCallback(async (dados) => {
    /* Remove File objects antes de serializar como JSON */
    const { anexos: _, ...resto } = dados;
    const res = await api.post("/agendamentos", resto);
    await carregar();
    return res.agendamento;
  }, [carregar]);

  /* ── adicionar anexos a um agendamento existente ── */
  const adicionarAnexos = useCallback(async (id, arquivos) => {
    if (!arquivos?.length) return [];
    const formData = new FormData();
    arquivos.forEach((f) => formData.append("arquivos", f.file || f));
    const res = await api.post(`/agendamentos/${id}/anexos`, formData, true);
    return res.anexos || [];
  }, []);

  /* ── atualizar (com reload completo) ── */
  const atualizar = useCallback(async (id, dados) => {
    const res = await api.put(`/agendamentos/${id}`, dados);
    await carregar();
    return res.agendamento;
  }, [carregar]);

  /* ── patch local (sem round-trip — para drag & drop) ── */
  const patchAgendamento = useCallback((id, changes) => {
    setAgendamentos((prev) => prev.map((a) => a.id === id ? { ...a, ...changes } : a));
  }, []);

  /* ── alterar status (com arquivos opcionais) ── */
  const alterarStatus = useCallback(async (id, status, arquivos = [], motivo = "") => {
    const formData = new FormData();
    formData.append("status", status);
    if (motivo) formData.append("motivo", motivo);
    arquivos.forEach((f) => {
      formData.append("arquivos", f.file || f);
      formData.append("nomes", f.label || "");
    });

    const res = await api.put(`/agendamentos/${id}/status`, formData, true);
    await carregar();
    return res.agendamento;
  }, [carregar]);

  /* ── excluir ── */
  const excluir = useCallback(async (id) => {
    await api.delete(`/agendamentos/${id}`);
    await carregar();
  }, [carregar]);

  /* ── sugestões ── */
  const criarSugestao = useCallback(async (agendamentoId, tipo, descricao) => {
    const res = await api.post(`/agendamentos/${agendamentoId}/sugestoes`, { tipo, descricao });
    return res.sugestao;
  }, []);

  const listarSugestoes = useCallback(async (agendamentoId) => {
    const res = await api.get(`/agendamentos/${agendamentoId}/sugestoes`);
    return res.sugestoes || [];
  }, []);

  const responderSugestao = useCallback(async (sugestaoId, status, resposta = "") => {
    const res = await api.put(`/agendamentos/sugestoes/${sugestaoId}`, { status, resposta });
    return res.sugestao;
  }, []);

  return {
    agendamentos,
    equipe,
    loading,
    erro,
    carregar,
    criar,
    adicionarAnexos,
    atualizar,
    patchAgendamento,
    alterarStatus,
    excluir,
    criarSugestao,
    listarSugestoes,
    responderSugestao,
  };
}
