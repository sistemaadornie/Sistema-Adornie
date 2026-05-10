const multer = require("multer");

const MIMES_PERMITIDOS = new Set([
  // Imagens
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif", "image/avif",
  // Vídeos
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
  "video/3gpp", "video/3gpp2", "video/x-matroska",
  // Documentos
  "application/pdf",
]);

function fileFilter(_req, file, cb) {
  if (MIMES_PERMITIDOS.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(`Tipo de arquivo não permitido: ${file.mimetype}`);
    err.status = 400;
    cb(err, false);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter,
});

/* ── Validação de magic bytes ────────────────────────────────────────────────
   O MIME informado pelo cliente (Content-Type do campo multipart) pode ser
   falsificado. Verificamos os bytes reais do arquivo após o upload em memória.
   Roda como middleware logo após upload.array() / upload.single(). */
function verificaMagicBytes(buf) {
  if (!buf || buf.length < 4) return false;

  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  // GIF: GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WebP: RIFF????WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return true;
  // MP4 / MOV / HEIC (ISO base media file): ftyp box no offset 4
  if (buf.length >= 8 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;
  // WebM / MKV: 1A 45 DF A3
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return true;
  // AVI: RIFF????AVI
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x41 && buf[9] === 0x56 && buf[10] === 0x49) return true;
  // 3GP / 3G2 (ISO base media file — mesma assinatura ftyp do MP4/HEIC/AVIF)
  // já coberto pela verificação ftyp acima

  return false;
}

function validarMagicBytes(req, res, next) {
  const arquivos = req.files || (req.file ? [req.file] : []);
  for (const file of arquivos) {
    if (!verificaMagicBytes(file.buffer)) {
      return res.status(400).json({
        message: `Arquivo com conteúdo inválido ou corrompido: ${file.originalname}`,
      });
    }
  }
  next();
}

module.exports = upload;
module.exports.validarMagicBytes = validarMagicBytes;
