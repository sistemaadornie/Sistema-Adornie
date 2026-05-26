const db          = require("../database/db");
const cloudinary  = require("../config/cloudinary");
const streamifier = require("streamifier");

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES     = 5 * 1024 * 1024; // 5 MB

function validarArquivo(file) {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    const e = new Error("Formato não permitido. Use JPG, PNG, WebP ou GIF.");
    e.status = 400; throw e;
  }
  if (file.size > MAX_BYTES) {
    const e = new Error("Arquivo muito grande. Máximo 5 MB.");
    e.status = 400; throw e;
  }
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:          "etiqueta-logos",
        resource_type:   "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
        quality:         "auto:good",
        fetch_format:    "auto",
      },
      (error, result) => { if (error) return reject(error); resolve(result); }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

async function listar(empresa_id) {
  const { rows } = await db.query(
    `SELECT id, nome, url
       FROM etiqueta_logos
      WHERE empresa_id = $1
      ORDER BY created_at DESC`,
    [empresa_id]
  );
  return rows;
}

async function criar(empresa_id, nome, file) {
  validarArquivo(file);
  const result = await uploadToCloudinary(file.buffer);
  const { rows } = await db.query(
    `INSERT INTO etiqueta_logos (empresa_id, nome, url, public_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, url`,
    [empresa_id, nome, result.secure_url, result.public_id]
  );
  return rows[0];
}

async function remover(empresa_id, id) {
  const { rows } = await db.query(
    `DELETE FROM etiqueta_logos
      WHERE id = $1 AND empresa_id = $2
     RETURNING public_id`,
    [id, empresa_id]
  );
  if (rows.length === 0) {
    const e = new Error("Logo não encontrada.");
    e.status = 404; throw e;
  }
  if (rows[0].public_id) {
    await cloudinary.uploader.destroy(rows[0].public_id).catch(() => {});
  }
}

module.exports = { listar, criar, remover };
