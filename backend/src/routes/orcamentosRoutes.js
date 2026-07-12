const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const svc = require("../services/orcamentoService");
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");

const router = express.Router();
router.use(bloquearAppPWA);

const PODE_GERENCIAR = ["COMERCIAL", "OPERADOR_AGENDA", "ADMIN_MASTER"];
const PODE_APROVAR   = ["OPERADOR_AGENDA", "ADMIN_MASTER"];

router.get("/", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const { status, q, meu } = req.query;
    const filtros = { status, q };
    if (meu === "true") filtros.consultora_id = req.user.id;
    const orcamentos = await svc.listar(req.user.empresa_id, filtros);
    return res.json({ orcamentos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar orçamentos." });
  }
});

router.get("/:id", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const orc = await svc.buscar(Number(req.params.id), req.user.empresa_id);
    if (!orc) return res.status(404).json({ message: "Orçamento não encontrado." });
    return res.json({ orcamento: orc });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar orçamento." });
  }
});

router.post("/", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const orc = await svc.criar(req.user.empresa_id, req.user.id, req.body);
    return res.status(201).json({ message: "Orçamento criado!", orcamento: orc });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar orçamento." });
  }
});

router.put("/:id", authMiddleware, permissionMiddleware(PODE_GERENCIAR), async (req, res) => {
  try {
    const orc = await svc.atualizar(Number(req.params.id), req.user.empresa_id, req.user.id, req.body);
    return res.json({ message: "Orçamento atualizado!", orcamento: orc });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar orçamento." });
  }
});

router.post("/:id/aprovar", authMiddleware, permissionMiddleware(PODE_APROVAR), async (req, res) => {
  try {
    const result = await svc.aprovar(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.body.endereco_entrega || null
    );
    return res.json({ message: "Orçamento aprovado!", ...result });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao aprovar orçamento." });
  }
});

router.post("/:id/cancelar", authMiddleware, permissionMiddleware(PODE_APROVAR), async (req, res) => {
  try {
    await svc.cancelar(Number(req.params.id), req.user.empresa_id);
    return res.json({ message: "Orçamento cancelado." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao cancelar orçamento." });
  }
});

module.exports = router;
