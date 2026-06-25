import { api } from "../services/api";

export function acaoFichaConferencia(item) {
  if (!item.tipo_confeccao) return null;
  if (item.ficha_preenchida) return { label: "Visualizar Ficha", rota: "tecnica" };
  if (item.conferencia_consultoras_preenchida) return { label: "Conferência Técnica", rota: "tecnica" };
  return null;
}

export async function abrirOsDoItem(item) {
  if (item.ordem_servico_id) return item.ordem_servico_id;
  const os = await api.post("/os", { pedido_item_id: item.pedido_item_id });
  return os.id;
}
