export function fmtMedidas(item) {
  const fmt = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (item.largura != null || item.altura != null) {
    const l = item.largura != null ? `${fmt(item.largura)}m` : "—";
    const a = item.altura != null ? `${fmt(item.altura)}m` : "—";
    return `${l} x ${a}`;
  }
  if (item.medidas) {
    const partes = item.medidas.split(/[xX×]/).map((p) => p.trim());
    if (partes.length === 2) return `${partes[0]}m x ${partes[1]}m`;
    return item.medidas;
  }
  return "—";
}

// Medida real conferida pelo técnico (Ficha de Conferência Técnica), com
// fallback pra medida original do pedido enquanto a ficha não é preenchida.
export function fmtMedidasTecnicas(item) {
  const dt = item.dados_tecnicos;
  if (dt && (dt.largura != null || dt.altura_meio != null)) {
    const fmt = (v) => Number(String(v).replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const l = dt.largura != null ? `${fmt(dt.largura)}m` : "—";
    const a = dt.altura_meio != null ? `${fmt(dt.altura_meio)}m` : "—";
    return `${l} x ${a}`;
  }
  return fmtMedidas(item);
}
