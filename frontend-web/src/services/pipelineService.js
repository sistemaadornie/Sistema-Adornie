import { api } from "./api";

export const pipelineService = {
  listar: (filtros = {}) => {
    const params = Object.fromEntries(
      Object.entries(filtros).filter(([, v]) => v !== null && v !== undefined)
    );
    const q = new URLSearchParams(params).toString();
    return api.get(`/pipeline${q ? `?${q}` : ""}`);
  },

  criar: (body) => api.post("/pipeline", body),

  obter: (id) => api.get(`/pipeline/${id}`),

  avancar: (id, etapa, observacao) =>
    api.post(`/pipeline/${id}/avancar`, { etapa, observacao }),

  reencaminhar: (id, etapa, motivo) =>
    api.post(`/pipeline/${id}/reencaminhar`, { etapa, motivo }),

  historico: (id) => api.get(`/pipeline/${id}/historico`),

  adicionarItem: (id, body) => api.post(`/pipeline/${id}/itens`, body),

  itemChegou: (id, itemId, quantidade, obs) =>
    api.patch(`/pipeline/${id}/itens/${itemId}/chegou`, { quantidade, obs }),

  itemConfeccionado: (id, itemId) =>
    api.patch(`/pipeline/${id}/itens/${itemId}/confeccionado`, {}),

  confirmarAgendamento: (id) =>
    api.patch(`/pipeline/${id}/confirmar-agendamento`, {}),

  obterConfig: () => api.get("/pipeline/config"),

  salvarConfig: (body) => api.put("/pipeline/config", body),
};
