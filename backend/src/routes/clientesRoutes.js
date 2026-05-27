const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/clienteService");

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const clientes = await svc.listar(req.user.empresa_id, req.query.q);
    return res.json({ clientes });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar clientes." });
  }
});

router.get("/busca", authMiddleware, async (req, res) => {
  try {
    const clientes = await svc.busca(req.user.empresa_id, req.query.q);
    return res.json({ clientes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar clientes." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.buscar(req.params.id, req.user.empresa_id);
    if (!cli) return res.status(404).json({ message: "Cliente não encontrado." });
    return res.json({ cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar cliente." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.criar(req.user.empresa_id, req.body);
    return res.status(201).json({ message: "Cliente criado!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar cliente." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.atualizar(req.params.id, req.user.empresa_id, req.body);
    return res.json({ message: "Cliente atualizado!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar cliente." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.excluir(req.params.id, req.user.empresa_id);
    return res.json({ message: "Cliente removido." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao remover cliente." });
  }
});

router.post("/:id/enderecos", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.adicionarEndereco(req.params.id, req.user.empresa_id, req.body);
    return res.status(201).json({ message: "Endereço adicionado!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao adicionar endereço." });
  }
});

router.put("/:id/enderecos/:endId", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.atualizarEndereco(req.params.id, req.params.endId, req.user.empresa_id, req.body);
    return res.json({ message: "Endereço atualizado!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar endereço." });
  }
});

router.put("/:id/enderecos/:endId/padrao", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.definirPadrao(req.params.id, req.params.endId, req.user.empresa_id);
    return res.json({ message: "Endereço padrão definido!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao definir endereço padrão." });
  }
});

router.delete("/:id/enderecos/:endId", authMiddleware, async (req, res) => {
  try {
    const cli = await svc.removerEndereco(req.params.id, req.params.endId, req.user.empresa_id);
    return res.json({ message: "Endereço removido!", cliente: cli });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao remover endereço." });
  }
});

module.exports = router;
