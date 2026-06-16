export const STATUS_CORES = {
  pre_agendado:  "#94a3b8",
  agendado:      "#3b82f6",
  aguardando:    "#eab308",
  andamento:     "#eab308",
  concluido:     "#22c55e",
  nao_concluido: "#f97316",
  cancelado:     "#ef4444",
  retorno:       "#a855f7",
  atrasado:      "#ef4444",
};

export const STATUS_LABELS = {
  pre_agendado:  "Pré-agendado",
  agendado:      "Agendado",
  aguardando:    "Aguardando",
  andamento:     "Em andamento",
  concluido:     "Concluído",
  nao_concluido: "Não concluído",
  cancelado:     "Cancelado",
  retorno:       "Retorno",
  atrasado:      "Atrasado",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

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

/** Retorna { diaSemana, dia, mes, isHoje, isAmanha } para cabeçalho estilo Google */
export function parseDateInfo(dataStr) {
  if (!dataStr) return {};
  const data = parseDate(dataStr);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  return {
    diaSemana: DIAS_SEMANA[data.getDay()],
    diaSemanaFull: DIAS_SEMANA_FULL[data.getDay()],
    dia: data.getDate(),
    mes: MESES[data.getMonth()],
    isHoje: data.getTime() === hoje.getTime(),
    isAmanha: data.getTime() === amanha.getTime(),
  };
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

/** Link de navegação no Google Maps */
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

export const STATUS_INSTALADOR_ACOES = {
  podeIniciar:  (status) => ["agendado", "pre_agendado", "atrasado", "aguardando", "retorno"].includes(status),
  podeFinalizar:(status) => status === "andamento",
  finalizado:   (status) => ["concluido", "nao_concluido", "cancelado"].includes(status),
};
