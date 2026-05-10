const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/crewService");

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
    const crew = await svc.criarCrew(req.user.empresa_id, req.body);
    return res.status(201).json({ crew });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar crew." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const crew = await svc.atualizarCrew(req.params.id, req.user.empresa_id, req.body);
    return res.json({ crew });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar crew." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.deletarCrew(req.params.id, req.user.empresa_id);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao deletar crew." });
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
