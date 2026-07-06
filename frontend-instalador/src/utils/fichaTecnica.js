export function estadoFichaTecnica(item) {
  if (!item.tipo_confeccao) return null;
  if (!item.conferencia_consultoras_preenchida) return { acao: false, texto: "Aguardando ficha de conferência consultoras" };
  if (!item.ordem_servico_id) return { acao: false, texto: "Ficha indisponível" };
  if (item.ficha_preenchida) return { acao: true, preenchida: true, label: "Visualizar Ficha" };
  return { acao: true, preenchida: false, label: "Conferência Técnica" };
}
