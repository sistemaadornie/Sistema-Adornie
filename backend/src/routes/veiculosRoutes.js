const express = require("express");
const multer  = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/veiculoService");

const router = express.Router();

/* ── Upload de foto: somente imagens, máx 5 MB ── */
const FOTO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!FOTO_MIMES.includes(file.mimetype)) {
      const err = new Error("Formato não permitido. Use JPG, PNG ou WebP.");
      err.code  = "INVALID_FILE_TYPE";
      return cb(err, false);
    }
    cb(null, true);
  },
});

function handleUploadErro(err, _req, res, next) {
  if (err?.code === "LIMIT_FILE_SIZE")   return res.status(400).json({ message: "Arquivo muito grande. Máximo 5 MB." });
  if (err?.code === "INVALID_FILE_TYPE") return res.status(400).json({ message: err.message });
  next(err);
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const veiculos = await svc.listar(req.user.empresa_id, req.query.q);
    return res.json({ veiculos });
  } catch (err) {
    console.error("Erro ao listar veículos:", err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar veículos." });
  }
});

router.post("/", authMiddleware, uploadFoto.single("foto"), handleUploadErro, async (req, res) => {
  try {
    const veiculo = await svc.criar(req.user.empresa_id, req.body, req.file);
    return res.status(201).json({ veiculo });
  } catch (err) {
    console.error("Erro ao criar veículo:", err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao criar veículo." });
  }
});

router.put("/:id", authMiddleware, uploadFoto.single("foto"), handleUploadErro, async (req, res) => {
  try {
    const veiculo = await svc.atualizar(req.params.id, req.user.empresa_id, req.body, req.file);
    return res.json({ veiculo });
  } catch (err) {
    console.error("Erro ao atualizar veículo:", err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar veículo." });
  }
});

router.get("/:id/abastecimentos", authMiddleware, async (req, res) => {
  try {
    const abastecimentos = await svc.listarAbastecimentos(req.params.id, req.user.empresa_id);
    return res.json({ abastecimentos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao listar abastecimentos." });
  }
});

router.post("/:id/abastecimentos", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    const abastecimento = await svc.registrarAbastecimento(req.params.id, empresa_id, userId, req.body);
    return res.status(201).json({ abastecimento });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao registrar abastecimento." });
  }
});

router.delete("/:id/abastecimentos/:abId", authMiddleware, async (req, res) => {
  try {
    await svc.excluirAbastecimento(req.params.abId, req.user.empresa_id);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao remover abastecimento." });
  }
});

// Atualização manual do odômetro pelo usuário no card do veículo
router.patch("/:id/km-manual", authMiddleware, async (req, res) => {
  try {
    const { km_atual } = req.body;
    if (km_atual === undefined || km_atual === null || isNaN(Number(km_atual)) || Number(km_atual) < 0) {
      return res.status(400).json({ message: "Valor de km inválido." });
    }
    await svc.atualizarKm(req.params.id, req.user.empresa_id, Number(km_atual));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar km." });
  }
});

// Incrementa km rodados via rotas (acumula, não sobrescreve odômetro manual)
router.post("/:id/km-rota", authMiddleware, async (req, res) => {
  try {
    const { km_dia } = req.body;
    if (!km_dia || isNaN(km_dia)) return res.status(400).json({ message: "km_dia inválido." });
    await svc.incrementarKmRota(req.params.id, req.user.empresa_id, Number(km_dia));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || "Erro ao registrar km." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.excluir(req.params.id, req.user.empresa_id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao excluir veículo:", err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir veículo." });
  }
});

module.exports = router;
