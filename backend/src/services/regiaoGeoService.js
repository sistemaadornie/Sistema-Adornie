"use strict";
const db = require("../database/db");
const { photon, nominatim } = require("../utils/geocoding");
const {
  MAPA_BAIRROS, MAPA_CIDADES,
  buscarCoordenada, normalizar,
} = require("../config/dashboardGestorConfig");

async function jaConhecida(empresaId, tipo, chave) {
  const { rows } = await db.query(
    `SELECT id FROM regioes_geo WHERE empresa_id = $1 AND tipo = $2 AND chave = $3 LIMIT 1`,
    [empresaId, tipo, chave]
  );
  return rows.length > 0;
}

async function salvarRegiao({ empresaId, tipo, chave, nome, cidade, estado, coords }) {
  await db.query(
    `INSERT INTO regioes_geo (empresa_id, tipo, chave, nome, cidade, estado, lat, lng, geocod_falhou)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (empresa_id, tipo, chave) DO NOTHING`,
    [empresaId, tipo, chave, nome, cidade || null, estado || null,
      coords?.lat ?? null, coords?.lng ?? null, !coords]
  );
}

async function geocodificarCidadeOuBairro({ tipo, nome, cidade, estado }) {
  const query = tipo === "cidade"
    ? `${nome} ${estado || ""}`.trim()
    : `${nome} ${cidade} ${estado || ""}`.trim();
  const viaPhoton = await photon(query);
  if (viaPhoton) return viaPhoton;
  return tipo === "cidade"
    ? nominatim({ cidade: nome, estado })
    : nominatim({ bairro: nome, cidade, estado });
}

async function registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado }) {
  if (!cidade || !cidade.trim()) return;

  const chaveCidade = normalizar(cidade);
  let cidadeConhecida = !!buscarCoordenada(cidade, MAPA_CIDADES);
  if (!cidadeConhecida) cidadeConhecida = await jaConhecida(empresaId, "cidade", chaveCidade);
  if (!cidadeConhecida) {
    const coords = await geocodificarCidadeOuBairro({ tipo: "cidade", nome: cidade.trim(), estado });
    await salvarRegiao({
      empresaId, tipo: "cidade", chave: chaveCidade, nome: cidade.trim(),
      cidade: null, estado, coords,
    });
  }

  if (chaveCidade === "curitiba" && bairro && bairro.trim()) {
    const chaveBairro = normalizar(bairro);
    let bairroConhecido = !!buscarCoordenada(bairro, MAPA_BAIRROS);
    if (!bairroConhecido) bairroConhecido = await jaConhecida(empresaId, "bairro", chaveBairro);
    if (!bairroConhecido) {
      const coords = await geocodificarCidadeOuBairro({ tipo: "bairro", nome: bairro.trim(), cidade: cidade.trim(), estado });
      await salvarRegiao({
        empresaId, tipo: "bairro", chave: chaveBairro, nome: bairro.trim(),
        cidade: cidade.trim(), estado, coords,
      });
    }
  }
}

async function buscarCoordenadasCache(empresaId, tipo, chavesNormalizadas) {
  if (!chavesNormalizadas.length) return new Map();
  const { rows } = await db.query(
    `SELECT chave AS id, nome, lat::float8 AS lat, lng::float8 AS lng
     FROM regioes_geo
     WHERE empresa_id = $1 AND tipo = $2 AND chave = ANY($3) AND geocod_falhou = false AND lat IS NOT NULL`,
    [empresaId, tipo, chavesNormalizadas]
  );
  const mapa = new Map();
  for (const r of rows) mapa.set(r.id, r);
  return mapa;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillRegioes(empresaId, { delayMs = 1200 } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT cidade, bairro, estado FROM pedidos
     WHERE empresa_id = $1 AND deleted_at IS NULL AND cidade IS NOT NULL AND cidade != ''`,
    [empresaId]
  );

  let ok = 0, falhou = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await registrarRegiaoSeNecessaria({
        empresaId, bairro: rows[i].bairro, cidade: rows[i].cidade, estado: rows[i].estado,
      });
      ok++;
    } catch {
      falhou++;
    }
    if (i < rows.length - 1) await sleep(delayMs);
  }
  return { total: rows.length, ok, falhou };
}

module.exports = { registrarRegiaoSeNecessaria, buscarCoordenadasCache, backfillRegioes };
