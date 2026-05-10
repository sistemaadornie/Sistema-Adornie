const https = require("https");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(hostname, path) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname,
        path,
        method: "GET",
        headers: {
          "User-Agent": "SistemaLiuu/1.0 (operacao@sistemaoperon.com.br)",
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, body: "" }); });
    req.end();
  });
}

// Bounding box do Brasil
const BRAZIL_BBOX = "-74,-34,-28,6";

function isInBrazil(lat, lng) {
  return lat >= -34 && lat <= 6 && lng >= -74 && lng <= -28;
}

// Sigla → nome completo para melhorar match no Nominatim
const ESTADO_NOME = {
  AC:"Acre",AM:"Amazonas",AP:"Amapá",PA:"Pará",RO:"Rondônia",RR:"Roraima",TO:"Tocantins",
  AL:"Alagoas",BA:"Bahia",CE:"Ceará",MA:"Maranhão",PB:"Paraíba",PE:"Pernambuco",
  PI:"Piauí",RN:"Rio Grande do Norte",SE:"Sergipe",DF:"Distrito Federal",
  GO:"Goiás",MS:"Mato Grosso do Sul",MT:"Mato Grosso",ES:"Espírito Santo",
  MG:"Minas Gerais",RJ:"Rio de Janeiro",SP:"São Paulo",PR:"Paraná",
  RS:"Rio Grande do Sul",SC:"Santa Catarina",
};

function estadoNome(sigla) {
  return ESTADO_NOME[sigla?.toUpperCase()] || sigla || "Brasil";
}

/* ── Photon (Komoot) — rápido, boa cobertura geral ── */
async function photon(query) {
  if (!query) return null;
  const path = `/api/?q=${encodeURIComponent(query)}&limit=1&bbox=${BRAZIL_BBOX}&lang=pt`;
  const { status, body } = await httpGet("photon.komoot.io", path);
  if (status !== 200) return null;
  try {
    const coords = JSON.parse(body).features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    const [lng, lat] = coords;
    if (!isInBrazil(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/* ── Nominatim (OSM oficial) — query estruturada, melhor para ruas brasileiras ── */
async function nominatim({ rua, numero, bairro, cidade, estado }) {
  if (!cidade) return null;

  const estadoFull = estadoNome(estado);

  // Tenta query estruturada primeiro (mais precisa)
  const estruturada = new URLSearchParams({
    ...(rua    ? { street: `${numero ? numero + " " : ""}${rua}` } : {}),
    ...(cidade ? { city: cidade } : {}),
    state:   estadoFull,
    country: "Brazil",
    format:  "json",
    limit:   "1",
    countrycodes: "br",
  });

  const { status, body } = await httpGet(
    "nominatim.openstreetmap.org",
    `/search?${estruturada.toString()}`
  );

  if (status === 200) {
    try {
      const results = JSON.parse(body);
      if (results?.length) {
        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        if (isInBrazil(lat, lng)) return { lat, lng };
      }
    } catch { /* continua */ }
  }

  await sleep(1100); // respeita o rate limit de 1 req/s do Nominatim

  // Tenta query livre como fallback
  const livre = `${rua || ""} ${numero || ""} ${cidade} ${estadoFull} Brasil`.replace(/\s+/g, " ").trim();
  const livreParams = new URLSearchParams({ q: livre, format: "json", limit: "1", countrycodes: "br" });
  const r2 = await httpGet("nominatim.openstreetmap.org", `/search?${livreParams.toString()}`);

  if (r2.status === 200) {
    try {
      const results = JSON.parse(r2.body);
      if (results?.length) {
        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        if (isInBrazil(lat, lng)) return { lat, lng };
      }
    } catch { /* continua */ }
  }

  return null;
}

// Remove prefixos de logradouro para melhorar o match no Photon
function simplificarRua(rua) {
  if (!rua) return rua;
  return rua.replace(/^(Rua|Avenida|Av\.?|Travessa|Trav\.?|Alameda|Al\.?|Estrada|Rod\.?|Rodovia|Largo|Praça|Pça\.?)\s+/i, "").trim();
}

function avaliarEndereco(ag) {
  const { rua, numero, bairro, cidade, endereco } = ag;
  const temCidade   = !!(cidade?.trim());
  const temRua      = !!(rua?.trim());
  const temBairro   = !!(bairro?.trim());
  const temEndereco = !!(endereco?.trim());

  if (!temCidade && !temEndereco) return { qualidade: "invalido", motivo: "Sem cidade nem endereço." };
  if (!temCidade)                 return { qualidade: "ruim",     motivo: "Sem cidade: resultado impreciso." };
  if (!temRua && !temBairro)      return { qualidade: "baixa",    motivo: "Sem rua nem bairro: resultado aproximado (só cidade)." };
  if (!temRua)                    return { qualidade: "media",    motivo: "Sem rua: resultado posicionado no bairro." };
  if (!numero)                    return { qualidade: "boa",      motivo: null };
  return                                  { qualidade: "otima",   motivo: null };
}

async function geocodificarAgendamento(ag) {
  const { rua, numero, bairro, cidade, estado, endereco } = ag;

  const avaliacao = avaliarEndereco(ag);
  if (avaliacao.qualidade === "invalido") return null;

  const ruaSimples = simplificarRua(rua);
  const est        = estado || "Brasil";
  const estNome    = estadoNome(estado);

  /* ── Fase 1: Photon (rápido) ── */
  const queriesPhoton = [];

  if (rua && cidade) {
    // 1. Completo: rua número bairro cidade estado
    if (bairro) queriesPhoton.push(`${rua} ${numero || ""} ${bairro} ${cidade} ${est}`.trim());
    // 2. Sem bairro
    queriesPhoton.push(`${rua} ${numero || ""} ${cidade} ${est}`.trim());
    // 3. Rua simplificada + cidade
    if (ruaSimples !== rua) queriesPhoton.push(`${ruaSimples} ${numero || ""} ${cidade} ${est}`.trim());
    // 4. Nome completo do estado
    queriesPhoton.push(`${rua} ${numero || ""} ${cidade} ${estNome}`.trim());
    // 5. Sem número
    queriesPhoton.push(`${ruaSimples} ${cidade} ${est}`.trim());
  }
  if (bairro && cidade) {
    // 6. Bairro + cidade
    queriesPhoton.push(`${bairro} ${cidade} ${est}`.trim());
  }
  if (cidade) {
    // 7. Só cidade (fallback de posição aproximada)
    queriesPhoton.push(`${cidade} ${est}`.trim());
  }
  if (endereco) {
    // 8. Campo endereço bruto
    const endLimpo = endereco.replace(/—\s*CEP[\s\d-]*/gi, "").replace(/,\s*-\s*\w{2}\b/, "").trim();
    if (endLimpo) queriesPhoton.push(endLimpo);
  }

  for (const q of queriesPhoton) {
    if (!q) continue;
    const r = await photon(q);
    if (r) return r;
    await sleep(600);
  }

  /* ── Fase 2: Nominatim — melhor cobertura para ruas brasileiras ── */
  if (rua && cidade) {
    await sleep(1100); // garante gap mínimo antes do Nominatim
    const r = await nominatim({ rua, numero, bairro, cidade, estado });
    if (r) return r;
  }

  return null;
}

async function geocodificarLote(db, empresaId) {
  const { rows } = await db.query(
    `SELECT id, endereco, rua, numero, bairro, cidade, estado
     FROM agendamentos
     WHERE empresa_id = $1 AND (lat IS NULL OR lng IS NULL) AND status != 'cancelado'
     ORDER BY id`,
    [empresaId]
  );

  let ok = 0, falhou = 0;
  const falhaIds = [];

  for (let i = 0; i < rows.length; i++) {
    const ag = rows[i];
    try {
      const coords = await geocodificarAgendamento(ag);
      if (coords) {
        await db.query(
          `UPDATE agendamentos SET lat=$1, lng=$2, geocod_falhou=FALSE WHERE id=$3`,
          [coords.lat, coords.lng, ag.id]
        );
        ok++;
      } else {
        await db.query(`UPDATE agendamentos SET geocod_falhou=TRUE WHERE id=$1`, [ag.id]);
        falhou++;
        falhaIds.push(ag.id);
      }
    } catch {
      await db.query(`UPDATE agendamentos SET geocod_falhou=TRUE WHERE id=$1`, [ag.id]).catch(() => {});
      falhou++;
      falhaIds.push(ag.id);
    }
    if (i < rows.length - 1) await sleep(1200);
  }

  return { total: rows.length, ok, falhou, falhaIds };
}

module.exports = { geocodificarAgendamento, geocodificarLote, avaliarEndereco };
