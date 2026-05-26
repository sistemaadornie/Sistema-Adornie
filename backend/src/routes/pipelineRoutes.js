const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/pipelineService");
const db = require("../database/db");

const router = express.Router();

// ─── GET /api/pipeline ────────────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const projetos = await svc.listarKanban(req.user.empresa_id, req.query);
    return res.json({ projetos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar projetos." });
  }
});

// ─── POST /api/pipeline ───────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const projeto = await svc.criarProjeto(
      req.user.empresa_id,
      req.user.id,
      req.user.nome_completo,
      req.body
    );
    return res.status(201).json({ message: "Projeto criado!", projeto });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao criar projeto." });
  }
});

// ─── GET /api/pipeline/config ─────────────────────────────────────────────────
router.get("/config", authMiddleware, async (req, res) => {
  try {
    const config = await svc.obterConfig(req.user.empresa_id);
    return res.json({ config });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao obter configuração." });
  }
});

// ─── PUT /api/pipeline/config ─────────────────────────────────────────────────
router.put("/config", authMiddleware, async (req, res) => {
  try {
    const config = await svc.salvarConfig(req.user.empresa_id, req.body);
    return res.json({ message: "Configuração salva!", config });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao salvar configuração." });
  }
});

// ─── GET /api/pipeline/:id ────────────────────────────────────────────────────
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const projeto = await svc.obterDetalhe(req.params.id, req.user.empresa_id);
    if (!projeto) {
      return res.status(404).json({ message: "Projeto não encontrado." });
    }
    return res.json({ projeto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao obter projeto." });
  }
});

// ─── POST /api/pipeline/:id/avancar ───────────────────────────────────────────
router.post("/:id/avancar", authMiddleware, async (req, res) => {
  try {
    const { etapa, observacao } = req.body;
    const projeto = await svc.avancarEtapa(
      req.params.id,
      req.user.empresa_id,
      req.user.id,
      req.user.nome_completo,
      etapa,
      observacao
    );
    return res.json({ message: "Etapa avançada!", projeto });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao avançar etapa." });
  }
});

// ─── POST /api/pipeline/:id/reencaminhar ──────────────────────────────────────
router.post("/:id/reencaminhar", authMiddleware, async (req, res) => {
  try {
    const { etapa, motivo } = req.body;
    const projeto = await svc.reencaminhar(
      req.params.id,
      req.user.empresa_id,
      req.user.id,
      req.user.nome_completo,
      etapa,
      motivo
    );
    return res.json({ message: "Projeto reencaminhado!", projeto });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao reencaminhar projeto." });
  }
});

// ─── GET /api/pipeline/:id/historico ───────────────────────────────────────────
router.get("/:id/historico", authMiddleware, async (req, res) => {
  try {
    const historico = await svc.obterHistorico(req.params.id, req.user.empresa_id);
    return res.json({ historico });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(404).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao obter histórico." });
  }
});

// ─── POST /api/pipeline/:id/itens ─────────────────────────────────────────────
router.post("/:id/itens", authMiddleware, async (req, res) => {
  try {
    const {
      produto_id,
      descricao,
      ambiente,
      quantidade,
      valor_unit,
      tipo_disponibilidade,
      fornecedor_id,
      prazo_previsto,
    } = req.body;

    if (!descricao) {
      return res.status(400).json({ message: "Descrição é obrigatória." });
    }

    // Detecta requer_confeccao para o item
    let requer_confeccao = false;
    if (produto_id) {
      const prodRes = await db.query(
        `SELECT eh_confeccao FROM produtos WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
        [produto_id, req.user.empresa_id]
      );
      if (prodRes.rows.length > 0) {
        requer_confeccao = prodRes.rows[0].eh_confeccao;
      }

      // Atualiza requer_confeccao do projeto se necessário
      if (requer_confeccao) {
        await db.query(
          `UPDATE pipeline_projetos SET requer_confeccao = TRUE, updated_at = NOW() WHERE id = $1 AND empresa_id = $2`,
          [req.params.id, req.user.empresa_id]
        );
      }
    }

    const itemRes = await db.query(
      `INSERT INTO pipeline_itens
         (projeto_id, produto_id, descricao, ambiente, quantidade, valor_unit,
          tipo_disponibilidade, requer_confeccao, fornecedor_id, prazo_previsto, status_item, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',NOW())
       RETURNING *`,
      [
        req.params.id,
        produto_id || null,
        descricao,
        ambiente || null,
        quantidade || 1,
        valor_unit || 0,
        tipo_disponibilidade || "estoque",
        requer_confeccao,
        fornecedor_id || null,
        prazo_previsto || null,
      ]
    );

    return res.status(201).json({ item: itemRes.rows[0] });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao adicionar item." });
  }
});

// ─── PATCH /api/pipeline/:id/itens/:itemId/chegou ────────────────────────────
router.patch("/:id/itens/:itemId/chegou", authMiddleware, async (req, res) => {
  try {
    const { quantidade, obs } = req.body;
    const projeto = await svc.marcarItemChegou(
      req.params.id,
      req.params.itemId,
      req.user.empresa_id,
      req.user.id,
      quantidade,
      obs
    );
    return res.json({ message: "Item marcado como chegou!", projeto });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao marcar item como chegou." });
  }
});

// ─── PATCH /api/pipeline/:id/itens/:itemId/confeccionado ──────────────────────
router.patch("/:id/itens/:itemId/confeccionado", authMiddleware, async (req, res) => {
  try {
    const item = await svc.marcarItemConfeccionado(
      req.params.id,
      req.params.itemId,
      req.user.empresa_id,
      req.user.id
    );
    return res.json({ message: "Item marcado como confeccionado!", item });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao marcar item como confeccionado." });
  }
});

// ─── PATCH /api/pipeline/:id/confirmar-agendamento ────────────────────────────
router.patch("/:id/confirmar-agendamento", authMiddleware, async (req, res) => {
  try {
    const projeto = await svc.confirmarAgendamento(
      req.params.id,
      req.user.empresa_id,
      req.user.id,
      req.user.nome_completo
    );
    return res.json({ message: "Agendamento confirmado!", projeto });
  } catch (err) {
    if (err.message && !err.code) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro ao confirmar agendamento." });
  }
});

module.exports = router;
