/**
 * Formata o intervalo de horário de um agendamento.
 * Ex: hora="08:00", duracao=300 → "08:00 – 13:00"
 * Se não houver duração, retorna apenas a hora de início.
 */
export function faixaHora(hora, duracaoMinutos) {
  if (!hora) return "—";
  if (!duracaoMinutos) return hora;
  const [h, m] = hora.split(":").map(Number);
  const totalMins = h * 60 + m + duracaoMinutos;
  const fimH = String(Math.floor(totalMins / 60) % 24).padStart(2, "0");
  const fimM = String(totalMins % 60).padStart(2, "0");
  return `${hora} – ${fimH}:${fimM}`;
}
