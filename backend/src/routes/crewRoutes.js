const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/crewService");
const { photon } = require("../utils/geocoding");
const { analisarDia } = require("../services/rotaAnaliseService");

const router = express.Router();

// ── Crews ─────────────────────────────────────────────────

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ message: "Parâmetro 'data' obrigatório (YYYY-MM-DD)." });
    const crews = await svc.listarCrew(req.user.empresa_id, data);
    return res.json({ crews });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar crews." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ message: "Campo 'data' obrigatório." });
    const crew = await svc.criarCrew(req.user.empresa_id, req.body, req.user.id, req.user.nome_completo);
    return res.status(201).json({ crew });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar crew." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const crew = await svc.atualizarCrew(req.params.id, req.user.empresa_id, req.body, req.user.id, req.user.nome_completo);
    return res.json({ crew });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar crew." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.deletarCrew(req.params.id, req.user.empresa_id, req.user.id, req.user.nome_completo);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao deletar crew." });
  }
});

router.get("/:id/logs", authMiddleware, async (req, res) => {
  try {
    const logs = await svc.getCrewLogs(req.params.id, req.user.empresa_id);
    return res.json({ logs });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar histórico." });
  }
});

// ── Análise de conflitos de rota ──────────────────────────

router.get("/analisar", authMiddleware, async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ message: "Parâmetro 'data' obrigatório (YYYY-MM-DD)." });
    const analise = await analisarDia(req.user.empresa_id, data);
    return res.json(analise);
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao analisar rotas." });
  }
});

// Resumo de conflitos do mês — retorna apenas as datas com problema
router.get("/conflitos-mes", authMiddleware, async (req, res) => {
  try {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ message: "Parâmetros 'ano' e 'mes' obrigatórios." });

    // Busca dias do mês que têm crews configuradas
    const db = require("../database/db");
    const { rows } = await db.query(
      `SELECT DISTINCT data::date::text AS data
       FROM crews
       WHERE empresa_id = $1
         AND EXTRACT(YEAR  FROM data) = $2
         AND EXTRACT(MONTH FROM data) = $3
       ORDER BY data`,
      [req.user.empresa_id, Number(ano), Number(mes)]
    );

    // Analisa cada dia em paralelo (leve: só lê DB, sem HTTP externo)
    const resultados = await Promise.all(
      rows.map(({ data }) => analisarDia(req.user.empresa_id, data))
    );

    const diasComConflito = resultados
      .filter((r) => r.tem_conflitos)
      .map((r) => r.data);

    return res.json({ diasComConflito });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao analisar mês." });
  }
});

// ── Pontos de Partida ─────────────────────────────────────

router.get("/pontos-partida", authMiddleware, async (req, res) => {
  try {
    const { veiculo_id, data } = req.query;
    if (!veiculo_id || !data)
      return res.status(400).json({ message: "Parâmetros 'veiculo_id' e 'data' obrigatórios." });
    const ponto = await svc.getPontoPartidaDia(req.user.empresa_id, veiculo_id, data);
    return res.json({ ponto });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar ponto de partida." });
  }
});

router.post("/pontos-partida", authMiddleware, async (req, res) => {
  try {
    const { veiculo_id, data, ...rest } = req.body;
    if (!veiculo_id || !data || !rest.endereco)
      return res.status(400).json({ message: "Campos obrigatórios: veiculo_id, data, endereco." });
    if ((!rest.lat || !rest.lng) && rest.endereco) {
      const coords = await photon(rest.endereco);
      if (coords) { rest.lat = coords.lat; rest.lng = coords.lng; }
    }
    const ponto = await svc.upsertPontoPartidaDia(req.user.empresa_id, veiculo_id, data, rest);
    return res.json({ ponto });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar ponto de partida." });
  }
});

router.get("/pontos-partida/padrao", authMiddleware, async (req, res) => {
  try {
    const { veiculo_id } = req.query;
    if (!veiculo_id) return res.status(400).json({ message: "Parâmetro 'veiculo_id' obrigatório." });
    const enderecos = await svc.listarEnderecosPadrao(req.user.empresa_id, veiculo_id);
    return res.json({ enderecos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar endereços padrão." });
  }
});

router.post("/pontos-partida/padrao", authMiddleware, async (req, res) => {
  try {
    const { veiculo_id, ...rest } = req.body;
    if (!veiculo_id || !rest.label || !rest.endereco)
      return res.status(400).json({ message: "Campos obrigatórios: veiculo_id, label, endereco." });
    if ((!rest.lat || !rest.lng) && rest.endereco) {
      const coords = await photon(rest.endereco);
      if (coords) { rest.lat = coords.lat; rest.lng = coords.lng; }
    }
    const endereco = await svc.criarEnderecoPadrao(req.user.empresa_id, veiculo_id, rest);
    return res.status(201).json({ endereco });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar endereço." });
  }
});

router.delete("/pontos-partida/padrao/:id", authMiddleware, async (req, res) => {
  try {
    await svc.deletarEnderecoPadrao(req.params.id, req.user.empresa_id);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao deletar endereço." });
  }
});

// ── Work Schedules ────────────────────────────────────────

router.get("/work-schedules", authMiddleware, async (req, res) => {
  try {
    const schedules = await svc.listarWorkSchedules(req.user.empresa_id);
    return res.json({ schedules });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar turnos." });
  }
});

router.post("/work-schedules", authMiddleware, async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ message: "Campo 'nome' obrigatório." });
    const schedule = await svc.criarWorkSchedule(req.user.empresa_id, req.body);
    return res.status(201).json({ schedule });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar turno." });
  }
});

router.put("/work-schedules/:id", authMiddleware, async (req, res) => {
  try {
    const schedule = await svc.atualizarWorkSchedule(req.params.id, req.user.empresa_id, req.body);
    return res.json({ schedule });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar turno." });
  }
});

router.delete("/work-schedules/:id", authMiddleware, async (req, res) => {
  try {
    await svc.deletarWorkSchedule(req.params.id, req.user.empresa_id);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir turno." });
  }
});

module.exports = router;
