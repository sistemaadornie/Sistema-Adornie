const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/produtoService");

const router = express.Router();

router.get("/marcas", authMiddleware, async (req, res) => {
  try {
    const marcas = await svc.listarMarcas(req.user.empresa_id);
    return res.json({ marcas });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar marcas." });
  }
});

router.get("/categorias", authMiddleware, async (req, res) => {
  try {
    const categorias = await svc.listarCategorias(req.user.empresa_id);
    return res.json({ categorias });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar categorias." });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const produtos = await svc.listar(req.user.empresa_id, req.query);
    return res.json({ produtos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar produtos." });
  }
});

router.get("/candidatos-de-pedidos", authMiddleware, async (req, res) => {
  try {
    const candidatos = await svc.candidatosDePedidos(req.user.empresa_id);
    return res.json({ candidatos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar candidatos." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const produto = await svc.buscar(req.params.id, req.user.empresa_id);
    if (!produto) return res.status(404).json({ message: "Produto não encontrado." });
    return res.json({ produto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar produto." });
  }
});

router.post("/importar-de-pedidos", authMiddleware, async (req, res) => {
  try {
    const { itens } = req.body;
    if (!Array.isArray(itens) || itens.length === 0)
      return res.status(400).json({ message: "Nenhum item enviado." });
    const resultado = await svc.importarDePedidos(req.user.empresa_id, req.user.id, itens);
    return res.json(resultado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || "Erro na importação." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const produto = await svc.criar(req.user.empresa_id, req.user.id, req.body);
    return res.status(201).json({ message: "Produto criado!", produto });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar produto." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const produto = await svc.atualizar(req.params.id, req.user.empresa_id, req.body);
    return res.json({ message: "Produto atualizado!", produto });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar produto." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.excluir(req.params.id, req.user.empresa_id);
    return res.json({ message: "Produto removido." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao remover produto." });
  }
});

module.exports = router;
