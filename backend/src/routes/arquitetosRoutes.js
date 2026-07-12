const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/arquitetoService");
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");

const router = express.Router();
router.use(bloquearAppPWA);

router.get("/", authMiddleware, async (req, res) => {
  try {
    const arquitetos = await svc.listar(req.user.empresa_id, req.query.q, req.user.permissoes, req.user.id);
    return res.json({ arquitetos });
  } catch (err) {
    return res.status(500).json({ message: "Erro ao listar arquitetos." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const arq = await svc.buscar(req.params.id, req.user.empresa_id, req.user.permissoes, req.user.id);
    if (!arq) return res.status(404).json({ message: "Arquiteto não encontrado." });
    return res.json({ arquiteto: arq });
  } catch (err) {
    return res.status(500).json({ message: "Erro ao buscar arquiteto." });
  }
});

router.post("/verificar-duplicatas", authMiddleware, async (req, res) => {
  try {
    const { registros } = req.body;
    if (!Array.isArray(registros) || registros.length === 0)
      return res.json({ duplicatas: [], novos: 0, total: 0 });
    const resultado = await svc.verificarDuplicatas(req.user.empresa_id, registros);
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ message: err.message || "Erro ao verificar duplicatas." });
  }
});

router.post("/importar", authMiddleware, async (req, res) => {
  try {
    const { registros } = req.body;
    if (!Array.isArray(registros) || registros.length === 0)
      return res.status(400).json({ message: "Nenhum registro enviado." });
    const resultado = await svc.importar(req.user.empresa_id, registros);
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ message: err.message || "Erro na importação." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const arq = await svc.criar(req.user.empresa_id, req.body);
    return res.status(201).json({ message: "Arquiteto cadastrado!", arquiteto: arq });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const arq = await svc.atualizar(req.params.id, req.user.empresa_id, req.body);
    return res.json({ message: "Arquiteto atualizado!", arquiteto: arq });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.excluir(req.params.id, req.user.empresa_id);
    return res.json({ message: "Arquiteto removido." });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
