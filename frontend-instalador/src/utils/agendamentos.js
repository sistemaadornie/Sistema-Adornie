export const STATUS_CORES = {
  pre_agendado:  "#6B9AB8",
  agendado:      "#6B9AB8",
  aguardando:    "#D4A843",
  andamento:     "#D4A843",
  concluido:     "#7FB069",
  nao_concluido: "#C0614A",
  cancelado:     "#C0614A",
  retorno:       "#9A9080",
  atrasado:      "#C0614A",
};

export const STATUS_LABELS = {
  pre_agendado: "Pré-agendado",
  agendado: "Agendado",
  aguardando: "Aguardando",
  andamento: "Em andamento",
  concluido: "Concluído",
  nao_concluido: "Não concluído",
  cancelado: "Cancelado",
  retorno: "Retorno",
  atrasado: "Atrasado",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "YYYY-MM-DD" -> Date local (meia-noite) */
function parseDate(dataStr) {
  const [y, m, d] = dataStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateBR(dataStr) {
  if (!dataStr) return "";
  const [y, m, d] = dataStr.split("-");
  return `${d}/${m}/${y}`;
}

/** Rótulo amigável: "Hoje", "Amanhã" ou "DD/MM (Seg)" */
export function formatDateLabel(dataStr) {
  if (!dataStr) return "";
  const data = parseDate(dataStr);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  if (data.getTime() === hoje.getTime()) return "Hoje";
  if (data.getTime() === amanha.getTime()) return "Amanhã";

  return `${formatDateBR(dataStr)} (${DIAS_SEMANA[data.getDay()]})`;
}

export function todayISO() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now - tz).toISOString().slice(0, 10);
}

export function addDaysISO(baseISO, days) {
  const data = parseDate(baseISO);
  data.setDate(data.getDate() + days);
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function enderecoCompleto(ag) {
  if (!ag) return "";
  if (ag.endereco) return ag.endereco;
  const partes = [
    [ag.rua, ag.numero].filter(Boolean).join(", "),
    ag.bairro,
    ag.cidade && ag.estado ? `${ag.cidade} - ${ag.estado}` : (ag.cidade || ag.estado),
    ag.cep,
  ].filter(Boolean);
  return partes.join(", ");
}

/** Link de navegação no Google Maps (coordenadas se houver, senão endereço) */
export function mapsUrl(ag) {
  if (ag?.lat && ag?.lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${ag.lat},${ag.lng}`;
  }
  const endereco = enderecoCompleto(ag);
  if (endereco) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}`;
  }
  return null;
}

/** Status que o instalador pode escolher como próxima ação */
export const STATUS_INSTALADOR_ACOES = {
  podeIniciar: (status) => ["agendado", "pre_agendado", "atrasado", "aguardando", "retorno"].includes(status),
  podeFinalizar: (status) => status === "andamento",
  finalizado: (status) => ["concluido", "nao_concluido", "cancelado"].includes(status),
};
