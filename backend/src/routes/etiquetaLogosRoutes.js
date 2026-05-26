const express    = require("express");
const multer     = require("multer");
const authMiddleware       = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const svc = require("../services/etiquetaLogoService");

const PERM = ["COMERCIAL", "OPERADOR_AGENDA", "ADMIN_MASTER", "GESTOR_USUARIOS"];

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (MIMES.includes(file.mimetype)) return cb(null, true);
    const err = new Error("Formato não permitido. Use JPG, PNG, WebP ou GIF.");
    err.status = 400;
    cb(err, false);
  },
});

/* GET /api/etiqueta-logos */
router.get("/", authMiddleware, permissionMiddleware(PERM), async (req, res) => {
  try {
    const logos = await svc.listar(req.user.empresa_id);
    res.json(logos);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

/* POST /api/etiqueta-logos */
router.post(
  "/",
  authMiddleware,
  permissionMiddleware(PERM),
  upload.single("arquivo"),
  async (req, res) => {
    try {
      const { nome } = req.body;
      if (!nome?.trim())
        return res.status(400).json({ message: "Nome é obrigatório." });
      if (!req.file)
        return res.status(400).json({ message: "Arquivo é obrigatório." });

      const logo = await svc.criar(req.user.empresa_id, nome.trim(), req.file);
      res.status(201).json(logo);
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message });
    }
  }
);

/* DELETE /api/etiqueta-logos/:id */
router.delete("/:id", authMiddleware, permissionMiddleware(PERM), async (req, res) => {
  try {
    await svc.remover(req.user.empresa_id, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

module.exports = router;
