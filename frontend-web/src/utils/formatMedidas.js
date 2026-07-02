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
