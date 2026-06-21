export function estadoFichaTecnica(item) {
  if (!item.tipo_confeccao) return null;
  if (!item.confeccao_preenchida) return { acao: false, texto: "Aguardando ficha de confecção" };
  if (item.ficha_preenchida) return { acao: true, label: "Visualizar Ficha" };
  return { acao: true, label: "Conferência Técnica" };
}
