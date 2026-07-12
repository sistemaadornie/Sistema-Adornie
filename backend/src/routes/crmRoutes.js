const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const crmService = require("../services/crmService");
const bloquearAppPWA = require("../middlewares/bloquearAppPWA");

const router = express.Router();
router.use(bloquearAppPWA);

// ── DASHBOARD E STATS ────────────────────────────────────

router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const stats = await crmService.obterEstatisticas(req.user.empresa_id);
    return res.json({ stats });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar estatísticas do CRM." });
  }
});

router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const data = await crmService.obterDadosPainel(req.user.empresa_id);
    return res.json({ data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar painel lateral do CRM." });
  }
});

// ── ORÇAMENTOS ──────────────────────────────────────────

router.get("/orcamentos", authMiddleware, async (req, res) => {
  try {
    const orcamentos = await crmService.listarOrcamentos(req.user.empresa_id, req.query);
    return res.json({ orcamentos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar orçamentos." });
  }
});

router.get("/orcamentos/:id", authMiddleware, async (req, res) => {
  try {
    const orcamento = await crmService.buscarOrcamento(req.params.id, req.user.empresa_id);
    if (!orcamento) return res.status(404).json({ message: "Orçamento não encontrado." });
    return res.json({ orcamento });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar orçamento." });
  }
});

router.post("/orcamentos", authMiddleware, async (req, res) => {
  try {
    const orcamento = await crmService.criarOrcamento(req.user.empresa_id, req.user.id, req.user.nome_completo, req.body);
    return res.status(201).json({ message: "Orçamento criado com sucesso!", orcamento });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar orçamento." });
  }
});

router.put("/orcamentos/:id", authMiddleware, async (req, res) => {
  try {
    const orcamento = await crmService.atualizarOrcamento(req.params.id, req.user.empresa_id, req.body, req.user.id, req.user.nome_completo);
    return res.json({ message: "Orçamento atualizado!", orcamento });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar orçamento." });
  }
});

router.delete("/orcamentos/:id", authMiddleware, async (req, res) => {
  try {
    await crmService.excluirOrcamento(req.params.id, req.user.empresa_id);
    return res.json({ message: "Orçamento removido." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir orçamento." });
  }
});

// ── FINANCEIRO ──────────────────────────────────────────

router.get("/financeiro", authMiddleware, async (req, res) => {
  try {
    const lançamentos = await crmService.listarFinanceiro(req.user.empresa_id, req.query);
    return res.json({ lançamentos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar lançamentos financeiros." });
  }
});

router.get("/financeiro/:id", authMiddleware, async (req, res) => {
  try {
    const lançamento = await crmService.buscarFinanceiro(req.params.id, req.user.empresa_id);
    if (!lançamento) return res.status(404).json({ message: "Lançamento não encontrado." });
    return res.json({ lançamento });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar lançamento financeiro." });
  }
});

router.post("/financeiro", authMiddleware, async (req, res) => {
  try {
    const lançamento = await crmService.criarFinanceiro(req.user.empresa_id, req.body);
    return res.status(201).json({ message: "Lançamento registrado!", lançamento });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao registrar lançamento financeiro." });
  }
});

router.put("/financeiro/:id", authMiddleware, async (req, res) => {
  try {
    const lançamento = await crmService.atualizarFinanceiro(req.params.id, req.user.empresa_id, req.body);
    return res.json({ message: "Lançamento financeiro atualizado!", lançamento });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar lançamento." });
  }
});

router.delete("/financeiro/:id", authMiddleware, async (req, res) => {
  try {
    await crmService.excluirFinanceiro(req.params.id, req.user.empresa_id);
    return res.json({ message: "Lançamento financeiro excluído." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir lançamento." });
  }
});

// ── COMISSÕES ──────────────────────────────────────────

router.get("/comissoes", authMiddleware, async (req, res) => {
  try {
    const comissoes = await crmService.listarComissoes(req.user.empresa_id, req.query);
    return res.json({ comissoes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar comissões." });
  }
});

router.post("/comissoes", authMiddleware, async (req, res) => {
  try {
    const comissao = await crmService.criarComissao(req.user.empresa_id, req.body);
    return res.status(201).json({ message: "Comissão criada!", comissao });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar comissão." });
  }
});

router.put("/comissoes/:id", authMiddleware, async (req, res) => {
  try {
    const comissao = await crmService.atualizarComissao(req.params.id, req.user.empresa_id, req.body);
    return res.json({ message: "Comissão atualizada!", comissao });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar comissão." });
  }
});

// ── RETORNOS ───────────────────────────────────────────

router.get("/retornos", authMiddleware, async (req, res) => {
  try {
    const retornos = await crmService.listarRetornos(req.user.empresa_id, req.query);
    return res.json({ retornos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar retornos." });
  }
});

router.post("/retornos", authMiddleware, async (req, res) => {
  try {
    const retorno = await crmService.criarRetorno(req.user.empresa_id, req.body);
    return res.status(201).json({ message: "Retorno programado!", retorno });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao agendar retorno." });
  }
});

router.patch("/retornos/:id/concluir", authMiddleware, async (req, res) => {
  try {
    const retorno = await crmService.concluirRetorno(req.params.id, req.user.empresa_id);
    return res.json({ message: "Status do retorno alterado!", retorno });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao alterar status do retorno." });
  }
});

router.delete("/retornos/:id", authMiddleware, async (req, res) => {
  try {
    await crmService.excluirRetorno(req.params.id, req.user.empresa_id);
    return res.json({ message: "Lembrete de retorno excluído." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir retorno." });
  }
});

module.exports = router;
