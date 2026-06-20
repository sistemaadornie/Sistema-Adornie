const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const upload = require("../middlewares/uploadMemory");
const { validarMagicBytes } = require("../middlewares/uploadMemory");
const svc = require("../services/agendamentoService");
const prazosService = require("../services/prazosService");

const router = express.Router();

router.get("/equipe", authMiddleware, async (req, res) => {
  try {
    const equipe = await svc.getEquipe(req.user.empresa_id);
    return res.json({ equipe });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar equipe." });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId, permissoes } = req.user;
    const agendamentos = await svc.listar(empresa_id, userId, permissoes, req.query);
    return res.json({ agendamentos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar agendamentos." });
  }
});

router.get("/coords-status", authMiddleware, async (req, res) => {
  try {
    const db = require("../database/db");
    const { data } = req.query;
    const where = data
      ? `empresa_id=$1 AND data=$2 AND (lat IS NULL OR lng IS NULL) AND status != 'cancelado'`
      : `empresa_id=$1 AND (lat IS NULL OR lng IS NULL) AND status != 'cancelado'`;
    const params = data ? [req.user.empresa_id, data] : [req.user.empresa_id];
    const { rows } = await db.query(`SELECT COUNT(*)::int AS sem_coords FROM agendamentos WHERE ${where}`, params);
    return res.json({ sem_coords: rows[0].sem_coords });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/geocodificar", authMiddleware, async (req, res) => {
  try {
    const db = require("../database/db");
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM agendamentos
       WHERE empresa_id=$1 AND (lat IS NULL OR lng IS NULL) AND status != 'cancelado'`,
      [req.user.empresa_id]
    );
    const total = rows[0].total;
    if (total === 0) return res.json({ ok: true, total: 0 });

    svc.geocodificarTodos(req.user.empresa_id).catch(() => {});

    return res.json({ ok: true, total });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao geocodificar." });
  }
});

/* Reseta flag de falha e dispara retry para UM agendamento específico */
router.post("/:id/geocodificar", authMiddleware, async (req, res) => {
  try {
    const db = require("../database/db");
    await db.query(
      `UPDATE agendamentos SET geocod_falhou=FALSE, lat=NULL, lng=NULL
       WHERE id=$1 AND empresa_id=$2`,
      [req.params.id, req.user.empresa_id]
    );
    svc.geocodificarTodos(req.user.empresa_id).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || "Erro." });
  }
});

// GET /pendentes-aprovacao — lista solicitações de urgência (ADMIN_MASTER)
router.get("/pendentes-aprovacao", authMiddleware, permissionMiddleware("ADMIN_MASTER"), async (req, res) => {
  try {
    const pendentes = await svc.listarPendentesAprovacao(req.user.empresa_id);
    return res.json({ pendentes });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar solicitações de urgência." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const ag = await svc.buscar(req.params.id, req.user.empresa_id);
    if (!ag) return res.status(404).json({ message: "Agendamento não encontrado." });
    return res.json({ agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar agendamento." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const { titulo, cliente, data, hora, equipe, itens, status, tipo } = req.body;
    const isPreAgendado = status === "pre_agendado";
    if (!titulo || !cliente || !data || (!isPreAgendado && !hora)) {
      return res.status(400).json({ message: isPreAgendado
        ? "Campos obrigatórios: título, cliente e data."
        : "Campos obrigatórios: título, cliente, data e horário." });
    }
    if (typeof titulo === "string" && titulo.length > 200) {
      return res.status(400).json({ message: "Título muito longo (máx. 200 caracteres)." });
    }
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ message: "Data inválida. Use o formato AAAA-MM-DD." });
    }
    if (hora && !/^\d{2}:\d{2}$/.test(hora)) {
      return res.status(400).json({ message: "Hora inválida. Use o formato HH:MM." });
    }
    if (!isPreAgendado && !hora) {
      return res.status(400).json({ message: "Hora inválida. Use o formato HH:MM." });
    }
    if (equipe !== undefined && (!Array.isArray(equipe) || equipe.length > 50)) {
      return res.status(400).json({ message: "Campo equipe inválido (máx. 50 membros)." });
    }
    if (itens !== undefined && (!Array.isArray(itens) || itens.length > 200)) {
      return res.status(400).json({ message: "Campo itens inválido (máx. 200 itens)." });
    }

    // Validação de prazos mínimos para agendamentos do tipo Instalação
    const itemIds = (itens || [])
      .map((it) => (it && typeof it === "object" ? (it.pedido_item_id || it.id) : null))
      .filter(Boolean);

    if ((!tipo || tipo === "Instalação") && itemIds.length > 0) {
      const validacao = await prazosService.validarPrazoInstalacao(empresa_id, data, itemIds);
      if (!validacao.valido) {
        const isAdmin = req.user.permissoes.includes("ADMIN_MASTER");
        const solicitouUrgencia = req.body.solicitar_urgencia === true && String(req.body.motivo_urgencia || "").trim();
        if (isAdmin && req.body.ignorar_prazos === true) {
          // bypass do admin — segue criação normal
        } else if (solicitouUrgencia) {
          req.body.aprovacao = {
            motivo: String(req.body.motivo_urgencia).trim(),
            data_minima: validacao.detalhes?.data_minima || null,
            dias_faltantes: validacao.detalhes?.dias_uteis_faltantes || null,
          };
        } else {
          return res.status(400).json({ message: validacao.mensagem, detalhes: validacao.detalhes });
        }
      }
    }

    const ag = await svc.criar(empresa_id, userId, req.body);
    return res.status(201).json({ message: "Agendamento criado!", agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar agendamento." });
  }
});

/* PATCH — salva distância estimada do trecho desse agendamento na rota do dia */
router.patch("/:id/km-rota", authMiddleware, async (req, res) => {
  try {
    const db = require("../database/db");
    const { km_rota } = req.body;
    if (!km_rota || isNaN(Number(km_rota))) return res.status(400).json({ message: "km_rota inválido." });
    await db.query(
      `UPDATE agendamentos SET km_rota=$1 WHERE id=$2 AND empresa_id=$3`,
      [Number(km_rota), req.params.id, req.user.empresa_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar km_rota." });
  }
});

/* PATCH leve — apenas reagendamento via drag & drop */
router.patch("/:id/reagendar", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId, permissoes, nome_completo } = req.user;
    const { data, hora, duracao_minutos } = req.body;
    if (!data || !hora) return res.status(400).json({ message: "data e hora são obrigatórios." });
    await svc.reagendar(req.params.id, empresa_id, userId, nome_completo, permissoes, { data, hora, duracao_minutos });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao reagendar." });
  }
});

// PATCH /:id/aprovacao — aprova ou rejeita solicitação de urgência (ADMIN_MASTER)
router.patch("/:id/aprovacao", authMiddleware, permissionMiddleware("ADMIN_MASTER"), async (req, res) => {
  try {
    const { aprovado, motivo } = req.body;
    if (typeof aprovado !== "boolean") {
      return res.status(400).json({ message: "Campo 'aprovado' (boolean) é obrigatório." });
    }
    const ag = await svc.decidirAprovacao(req.params.id, req.user.empresa_id, req.user, { aprovado, motivo });
    return res.json({ message: aprovado ? "Urgência aprovada." : "Solicitação rejeitada.", agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao decidir aprovação." });
  }
});

router.put("/:id/status", authMiddleware, upload.array("arquivos", 10), validarMagicBytes, async (req, res) => {
  try {
    const { empresa_id, id: userId, nome_completo, permissoes } = req.user;
    const { status, motivo } = req.body || {};
    if (!status) {
      console.error("[PUT /:id/status] status ausente — body:", req.body, "content-type:", req.headers["content-type"]);
      return res.status(400).json({ message: "Campo 'status' é obrigatório." });
    }
    const nomesRaw = req.body.nomes;
    const nomes = Array.isArray(nomesRaw) ? nomesRaw : (nomesRaw ? [nomesRaw] : []);
    const ag = await svc.alterarStatus(
      req.params.id, empresa_id, userId, nome_completo, permissoes,
      status, motivo, req.files, nomes
    );
    return res.json({ message: "Status atualizado!", agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao alterar status." });
  }
});

router.post("/:id/anexos", authMiddleware, upload.array("arquivos", 20), validarMagicBytes, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const anexos = await svc.adicionarAnexos(req.params.id, empresa_id, userId, req.files);
    return res.status(201).json({ ok: true, anexos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar anexos." });
  }
});

router.post("/:id/itens/:itemId/fotos", authMiddleware, upload.array("arquivos", 5), validarMagicBytes, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const fotos = await svc.adicionarFotoItem(req.params.id, req.params.itemId, empresa_id, userId, req.files);
    return res.status(201).json({ ok: true, fotos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar foto do item." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId, nome_completo } = req.user;
    const { tipo, data, itens } = req.body;

    // Validação de prazos mínimos para agendamentos do tipo Instalação
    const itemIds = (itens || [])
      .map((it) => (it && typeof it === "object" ? (it.pedido_item_id || it.id) : null))
      .filter(Boolean);

    if ((!tipo || tipo === "Instalação") && itemIds.length > 0 && data) {
      const validacao = await prazosService.validarPrazoInstalacao(empresa_id, data, itemIds);
      if (!validacao.valido) {
        const isAdmin = req.user.permissoes.includes("ADMIN_MASTER");
        const solicitouUrgencia = req.body.solicitar_urgencia === true && String(req.body.motivo_urgencia || "").trim();
        if (isAdmin && req.body.ignorar_prazos === true) {
          // bypass do admin
        } else if (solicitouUrgencia) {
          req.body.aprovacao = {
            motivo: String(req.body.motivo_urgencia).trim(),
            data_minima: validacao.detalhes?.data_minima || null,
            dias_faltantes: validacao.detalhes?.dias_uteis_faltantes || null,
          };
        } else {
          return res.status(400).json({ message: validacao.mensagem, detalhes: validacao.detalhes });
        }
      }
    }

    const ag = await svc.atualizar(req.params.id, empresa_id, userId, nome_completo, req.body);
    return res.json({ message: "Agendamento atualizado!", agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar agendamento." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId, nome_completo, permissoes } = req.user;
    await svc.excluir(req.params.id, empresa_id, userId, nome_completo, permissoes);
    return res.json({ message: "Agendamento excluído." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir agendamento." });
  }
});

router.get("/:id/logs", authMiddleware, async (req, res) => {
  try {
    const logs = await svc.getLogs(req.params.id, req.user.empresa_id);
    return res.json({ logs });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar logs." });
  }
});

router.post("/:id/sugestoes", authMiddleware, async (req, res) => {
  try {
    const { id: userId, empresa_id } = req.user;
    const { tipo, descricao } = req.body;
    const sugestao = await svc.criarSugestao(req.params.id, empresa_id, userId, tipo, descricao);
    return res.status(201).json({ sugestao });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar sugestão." });
  }
});

router.get("/:id/sugestoes", authMiddleware, async (req, res) => {
  try {
    const sugestoes = await svc.listarSugestoes(req.params.id, req.user.empresa_id);
    return res.json({ sugestoes });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao buscar sugestões." });
  }
});

router.put("/sugestoes/:sid", authMiddleware, async (req, res) => {
  try {
    const { id: userId, empresa_id } = req.user;
    const { status, resposta } = req.body;
    const sugestao = await svc.responderSugestao(req.params.sid, userId, empresa_id, status, resposta);
    return res.json({ sugestao });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao responder sugestão." });
  }
});

router.get("/:id/conferencia-itens", authMiddleware, async (req, res) => {
  try {
    const itens = await svc.listarConferenciaItens(
      Number(req.params.id),
      req.user.empresa_id
    );
    return res.json({ itens });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro" });
  }
});

router.post("/:id/conferencia-itens", authMiddleware, async (req, res) => {
  try {
    const item = await svc.upsertConferenciaItem(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id,
      req.body
    );
    return res.json({ item });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro" });
  }
});

router.patch("/:id/confirmar-cliente", authMiddleware, async (req, res) => {
  try {
    const ag = await svc.confirmarCliente(
      Number(req.params.id),
      req.user.empresa_id,
      req.user.id
    );
    return res.json({ agendamento: ag });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro" });
  }
});

// PATCH /agendamentos/:id/itens/:itemId/separado
router.patch("/:id/itens/:itemId/separado", authMiddleware, async (req, res) => {
  try {
    const db = require("../database/db");
    const agendamentoId = Number(req.params.id);
    const pedidoItemId = Number(req.params.itemId);
    const { empresa_id } = req.user;
    const { separado } = req.body;

    if (typeof separado !== "boolean") {
      return res.status(400).json({ message: "Campo 'separado' (boolean) é obrigatório." });
    }

    const check = await db.query(
      `SELECT id FROM agendamentos WHERE id = $1 AND empresa_id = $2 AND tipo = 'Instalação'`,
      [agendamentoId, empresa_id]
    );
    if (!check.rows.length) return res.status(404).json({ message: "Agendamento de instalação não encontrado." });

    const { rows } = await db.query(
      `UPDATE agendamento_itens SET separado = $1
       WHERE agendamento_id = $2 AND pedido_item_id = $3
       RETURNING id, pedido_item_id, separado`,
      [separado, agendamentoId, pedidoItemId]
    );
    if (!rows.length) return res.status(404).json({ message: "Item não encontrado neste agendamento." });

    return res.json({ item: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar separação." });
  }
});

/* Error handler para erros do multer (tipo/tamanho de arquivo) que escapam do try/catch */
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, _next) => {
  console.error("[agendamentosRoutes] erro de upload:", err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || "Erro no upload do arquivo." });
});

module.exports = router;
