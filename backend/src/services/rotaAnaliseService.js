const db = require("../database/db");

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimativa conservadora de tempo de viagem considerando trânsito urbano e paradas
function tempoViagem(distKm) {
  if (distKm < 3)   return Math.ceil(distKm / 20 * 60) + 8;   // urbano denso
  if (distKm < 15)  return Math.ceil(distKm / 30 * 60) + 8;   // urbano
  if (distKm < 60)  return Math.ceil(distKm / 60 * 60) + 10;  // semi-urbano / BR
  return Math.ceil(distKm / 80 * 60) + 15;                     // rodovia
}

function toMin(hora) {
  const str = String(hora).slice(0, 5);
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min) {
  if (min < 0) min = 0;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

async function analisarDia(empresaId, data) {
  // Carrega crews do dia com seus agendamentos
  const { rows: crews } = await db.query(
    `SELECT c.id, c.nome, c.veiculo_id,
       COALESCE(
         json_agg(
           json_build_object(
             'id',            a.id,
             'titulo',        a.titulo,
             'cliente',       a.cliente,
             'hora',          a.hora::text,
             'duracao_min',   COALESCE(a.duracao_minutos, 120),
             'lat',           a.lat,
             'lng',           a.lng,
             'cidade',        a.cidade,
             'rua',           a.rua,
             'bairro',        a.bairro
           ) ORDER BY a.hora
         ) FILTER (WHERE a.id IS NOT NULL AND a.status NOT IN ('concluido', 'cancelado')),
         '[]'
       ) AS agendamentos
     FROM crews c
     LEFT JOIN crew_agendamentos ca ON ca.crew_id = c.id
     LEFT JOIN agendamentos a       ON a.id = ca.agendamento_id
     WHERE c.empresa_id = $1 AND c.data = $2
     GROUP BY c.id, c.nome, c.veiculo_id`,
    [empresaId, data]
  );

  const conflitos = [];

  for (const crew of crews) {
    const ags = (crew.agendamentos || []).filter(Boolean);
    if (ags.length === 0) continue;

    ags.sort((a, b) => a.hora.localeCompare(b.hora));

    const problemas = [];

    // ── 1. Sobreposições de horário ───────────────────────
    for (let i = 0; i < ags.length; i++) {
      for (let j = i + 1; j < ags.length; j++) {
        const a = ags[i], b = ags[j];
        const aIni = toMin(a.hora), aFim = aIni + a.duracao_min;
        const bIni = toMin(b.hora), bFim = bIni + b.duracao_min;
        if (aIni < bFim && bIni < aFim) {
          const overlap = Math.min(aFim, bFim) - Math.max(aIni, bIni);
          problemas.push({
            tipo: "sobreposicao",
            severidade: overlap >= 60 ? "critica" : "alta",
            agendamento_ids: [a.id, b.id],
            descricao: `"${a.cliente || a.titulo}" (${toHHMM(aIni)}–${toHHMM(aFim)}) e "${b.cliente || b.titulo}" (${toHHMM(bIni)}–${toHHMM(bFim)}) ocorrem ao mesmo tempo — sobreposição de ${overlap} min`,
            overlap_min: overlap,
          });
        }
      }
    }

    // ── 2. Deslocamento impossível entre agendamentos consecutivos ──
    for (let i = 0; i < ags.length - 1; i++) {
      const a = ags[i], b = ags[i + 1];
      if (!a.lat || !a.lng || !b.lat || !b.lng) continue;

      const distKm       = haversine(a.lat, a.lng, b.lat, b.lng);
      const precisaMin   = tempoViagem(distKm);
      const aFim         = toMin(a.hora) + a.duracao_min;
      const bIni         = toMin(b.hora);
      const disponivel   = bIni - aFim;

      if (disponivel < precisaMin) {
        const falta = precisaMin - disponivel;
        problemas.push({
          tipo: "deslocamento_inviavel",
          severidade: falta >= 60 ? "critica" : "alta",
          agendamento_ids: [a.id, b.id],
          de:   { id: a.id, nome: a.cliente || a.titulo, cidade: a.cidade, hora_fim: toHHMM(aFim) },
          para: { id: b.id, nome: b.cliente || b.titulo, cidade: b.cidade, hora_ini: b.hora.slice(0, 5) },
          distancia_km:       Math.round(distKm),
          tempo_viagem_min:   precisaMin,
          tempo_disponivel_min: disponivel,
          falta_min:          falta,
          descricao: `Após "${a.cliente || a.titulo}" (termina ${toHHMM(aFim)}), a equipe precisa de ~${precisaMin} min para chegar em ${b.cidade} (${Math.round(distKm)} km), mas "${b.cliente || b.titulo}" começa às ${b.hora.slice(0, 5)} — faltam ${falta} min`,
        });
      }
    }

    if (problemas.length === 0) continue;

    // ── 3. Gerar sugestões ────────────────────────────────
    const sugestoes = [];

    // Agrupa agendamentos por cidade
    const porCidade = {};
    ags.forEach((ag) => {
      const c = ag.cidade || "Sem cidade";
      if (!porCidade[c]) porCidade[c] = [];
      porCidade[c].push(ag);
    });
    const cidades = Object.keys(porCidade);

    if (cidades.length > 1) {
      // Identifica a cidade com problema de deslocamento
      const comDeslocamento = problemas.filter((p) => p.tipo === "deslocamento_inviavel");
      const cidadesDistantes = new Set(comDeslocamento.flatMap((p) => [p.de.cidade, p.para.cidade].filter(Boolean)));

      cidadesDistantes.forEach((cidade) => {
        const agsNaCidade = porCidade[cidade] || [];
        if (agsNaCidade.length > 0) {
          sugestoes.push({
            tipo: "criar_equipe_cidade",
            prioridade: "alta",
            titulo: `Criar equipe separada para ${cidade}`,
            descricao: `Mova ${agsNaCidade.length > 1 ? `os ${agsNaCidade.length} agendamentos` : `o agendamento "${agsNaCidade[0].cliente || agsNaCidade[0].titulo}"`} de ${cidade} para uma equipe com veículo próprio, partindo dessa cidade`,
            agendamento_ids: agsNaCidade.map((a) => a.id),
          });
        }
      });
    }

    // Para sobreposições: sugere reagendar o agendamento com mais conflitos
    const sobreposicoes = problemas.filter((p) => p.tipo === "sobreposicao");
    if (sobreposicoes.length > 0) {
      const contagem = {};
      sobreposicoes.forEach((p) => p.agendamento_ids.forEach((id) => { contagem[id] = (contagem[id] || 0) + 1; }));
      const [piorId] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
      const piorAg = ags.find((a) => String(a.id) === String(piorId));
      if (piorAg) {
        sugestoes.push({
          tipo: "reagendar",
          prioridade: "media",
          titulo: `Reagendar "${piorAg.cliente || piorAg.titulo}"`,
          descricao: `Este agendamento conflita com ${contagem[piorId]} outro(s) no mesmo período. Considere movê-lo para outro dia ou redistribuir entre equipes`,
          agendamento_ids: [piorAg.id],
        });
      }
    }

    // Sugestão geral de divisão se mais de 3 agendamentos simultâneos
    if (ags.length >= 4 && problemas.length >= 2) {
      sugestoes.push({
        tipo: "dividir_equipe",
        prioridade: "alta",
        titulo: `Dividir carga da ${crew.nome}`,
        descricao: `A equipe tem ${ags.length} agendamentos com ${problemas.length} conflito(s). Divida em 2 equipes menores, cada uma com veículo e rota próprios`,
        agendamento_ids: ags.map((a) => a.id),
      });
    }

    conflitos.push({
      crew_id:            crew.id,
      crew_nome:          crew.nome,
      total_agendamentos: ags.length,
      problemas,
      sugestoes,
    });
  }

  return {
    data,
    tem_conflitos: conflitos.length > 0,
    total_problemas: conflitos.reduce((s, c) => s + c.problemas.length, 0),
    conflitos,
  };
}

module.exports = { analisarDia };
