const db = require("../database/db");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

function validarArquivo(file) {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    const e = new Error("Formato não permitido. Use JPG, PNG, WebP ou GIF.");
    e.status = 400; throw e;
  }
  if (file.size > MAX_FILE_BYTES) {
    const e = new Error("Arquivo muito grande. Máximo 5 MB.");
    e.status = 400; throw e;
  }
}

/* Extrai o public_id do Cloudinary a partir da URL segura.
   Ex: .../upload/v123/veiculos/abc.jpg → veiculos/abc */
function extrairPublicId(url) {
  const match = url?.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  return match ? match[1] : null;
}

function uploadToCloudinary(fileBuffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type:   "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
        quality:         "auto:good",
        fetch_format:    "auto",
      },
      (error, result) => { if (error) return reject(error); resolve(result); }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
}

async function listar(empresaId, q) {
  const params = [empresaId];
  let filtro = q ? ` AND (v.nome ILIKE $2 OR v.placa ILIKE $2)` : "";
  if (q) params.push(`%${q}%`);

  const result = await db.query(
    `SELECT v.*,
       (SELECT a.km_atual FROM abastecimentos a
        WHERE a.veiculo_id=v.id AND a.empresa_id=v.empresa_id AND a.km_atual IS NOT NULL
        ORDER BY a.data DESC, a.created_at DESC LIMIT 1) AS ultimo_km_ab,
       (SELECT a.litros FROM abastecimentos a
        WHERE a.veiculo_id=v.id AND a.empresa_id=v.empresa_id AND a.km_atual IS NOT NULL
        ORDER BY a.data DESC, a.created_at DESC LIMIT 1) AS ultimo_litros_ab,
       (SELECT MAX(a.km_atual) - MIN(a.km_atual) FROM abastecimentos a
        WHERE a.veiculo_id=v.id AND a.empresa_id=v.empresa_id AND a.km_atual IS NOT NULL
       ) AS km_rodados
     FROM veiculos v
     WHERE v.empresa_id=$1 AND v.deleted_at IS NULL${filtro}
     ORDER BY v.nome ASC`,
    params
  );
  return result.rows;
}

async function criar(empresaId, dados, arquivo) {
  const { nome, placa, tipo, combustivel, media_km_l, capacidade_tanque, observacoes } = dados;
  if (!nome?.trim()) { const e = new Error("Nome é obrigatório."); e.status = 400; throw e; }

  let foto_url = null;
  if (arquivo) {
    validarArquivo(arquivo);
    const result = await uploadToCloudinary(arquivo.buffer, "veiculos");
    foto_url = result.secure_url;
  }

  const result = await db.query(
    `INSERT INTO veiculos (empresa_id, nome, placa, tipo, combustivel, media_km_l, capacidade_tanque, foto_url, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [empresaId, nome.trim(), placa?.trim()||null, tipo||"carro", combustivel||"flex",
     media_km_l ? Number(media_km_l) : null,
     capacidade_tanque ? Number(capacidade_tanque) : null,
     foto_url, observacoes?.trim()||null]
  );
  return result.rows[0];
}

async function atualizar(id, empresaId, dados, arquivo) {
  const existing = await db.query(
    `SELECT * FROM veiculos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
    [id, empresaId]
  );
  if (existing.rows.length === 0) { const e = new Error("Veículo não encontrado."); e.status = 404; throw e; }

  const { nome, placa, tipo, combustivel, media_km_l, capacidade_tanque, observacoes } = dados;
  const atual = existing.rows[0];

  let foto_url = atual.foto_url;
  if (arquivo) {
    validarArquivo(arquivo);
    if (atual.foto_url) {
      const publicId = extrairPublicId(atual.foto_url);
      if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {});
    }
    const result = await uploadToCloudinary(arquivo.buffer, "veiculos");
    foto_url = result.secure_url;
  }

  const result = await db.query(
    `UPDATE veiculos SET nome=$1, placa=$2, tipo=$3, combustivel=$4,
        media_km_l=$5, capacidade_tanque=$6, foto_url=$7, observacoes=$8, updated_at=NOW()
     WHERE id=$9 AND empresa_id=$10 RETURNING *`,
    [nome?.trim()||atual.nome, placa?.trim()||null, tipo||atual.tipo, combustivel||atual.combustivel,
     media_km_l ? Number(media_km_l) : null,
     capacidade_tanque ? Number(capacidade_tanque) : null,
     foto_url, observacoes?.trim()||null, id, empresaId]
  );
  return result.rows[0];
}

async function excluir(id, empresaId) {
  const result = await db.query(
    `UPDATE veiculos SET deleted_at=NOW() WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL RETURNING id`,
    [id, empresaId]
  );
  if (result.rows.length === 0) { const e = new Error("Veículo não encontrado."); e.status = 404; throw e; }
}

async function listarAbastecimentos(veiculoId, empresaId) {
  const r = await db.query(
    `SELECT a.*, u.nome AS registrado_por_nome
       FROM abastecimentos a
       LEFT JOIN usuarios u ON u.id = a.registrado_por
      WHERE a.veiculo_id=$1 AND a.empresa_id=$2
      ORDER BY a.data DESC, a.created_at DESC`,
    [veiculoId, empresaId]
  );
  return r.rows;
}

async function registrarAbastecimento(veiculoId, empresaId, userId, dados) {
  const vCheck = await db.query(
    `SELECT id, nome FROM veiculos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL`,
    [veiculoId, empresaId]
  );
  if (!vCheck.rows.length) { const e = new Error("Veículo não encontrado."); e.status = 404; throw e; }

  const { data, km_atual, litros, valor_total, combustivel, posto_nome, observacoes } = dados;

  const r = await db.query(
    `INSERT INTO abastecimentos
       (empresa_id, veiculo_id, data, km_atual, litros, valor_total, combustivel, posto_nome, registrado_por, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [empresaId, veiculoId, data || new Date().toISOString().slice(0,10),
     km_atual||null, litros||null, valor_total||null, combustivel||null, posto_nome||null, userId, observacoes||null]
  );

  // atualiza odômetro do veículo com o maior km já registrado
  if (km_atual) {
    await db.query(
      `UPDATE veiculos SET km_atual = GREATEST(COALESCE(km_atual, 0), $1), updated_at = NOW() WHERE id = $2`,
      [km_atual, veiculoId]
    );
  }

  const admins = await db.query(
    `SELECT u.id FROM usuarios u
      JOIN usuario_permissoes up ON up.usuario_id = u.id
      JOIN permissoes p ON p.id = up.permissao_id
     WHERE u.empresa_id=$1 AND p.codigo IN ('ADMIN_MASTER','OPERADOR_AGENDA')
     GROUP BY u.id`,
    [empresaId]
  );
  const vNome    = vCheck.rows[0].nome;
  const valorStr = valor_total ? ` — R$ ${Number(valor_total).toFixed(2)}` : "";
  const litrosStr = litros ? ` (${litros}L)` : "";
  const tituloNotif  = `Abastecimento registrado: ${vNome}`;
  const mensagemNotif = `${litrosStr}${valorStr} em ${posto_nome||"posto não informado"}`;
  await Promise.all(
    admins.rows.map((admin) =>
      db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem)
         VALUES ($1,$2,'info',$3,$4)`,
        [empresaId, admin.id, tituloNotif, mensagemNotif]
      ).catch(() => {})
    )
  );

  return r.rows[0];
}

async function excluirAbastecimento(abId, empresaId) {
  await db.query(
    `DELETE FROM abastecimentos WHERE id=$1 AND empresa_id=$2`,
    [abId, empresaId]
  );
}

// Atualização manual do odômetro (leitura real informada pelo usuário)
async function atualizarKm(veiculoId, empresaId, kmAtual) {
  await db.query(
    `UPDATE veiculos SET km_atual = $1, updated_at = NOW()
     WHERE id = $2 AND empresa_id = $3 AND deleted_at IS NULL`,
    [kmAtual, veiculoId, empresaId]
  );
}

// Incrementa odômetro quando um agendamento é iniciado (baseado em km_rota do agendamento)
async function adicionarKmOdometro(veiculoId, empresaId, kmAdd) {
  await db.query(
    `UPDATE veiculos SET
       km_atual = GREATEST(
         COALESCE(km_atual,
           (SELECT COALESCE(MAX(a.km_atual), 0) FROM abastecimentos a
            WHERE a.veiculo_id = $2 AND a.empresa_id = $3 AND a.km_atual IS NOT NULL)
         ),
         0
       ) + $1,
       updated_at = NOW()
     WHERE id = $2 AND empresa_id = $3 AND deleted_at IS NULL`,
    [Number(kmAdd), veiculoId, empresaId]
  );
}

// Chamado pelo mapa — acumula km de rota no campo dedicado
async function incrementarKmRota(veiculoId, empresaId, kmDia) {
  await db.query(
    `UPDATE veiculos SET km_rotas = COALESCE(km_rotas, 0) + $1, updated_at = NOW()
     WHERE id = $2 AND empresa_id = $3 AND deleted_at IS NULL`,
    [kmDia, veiculoId, empresaId]
  );
}

module.exports = {
  listar, criar, atualizar, excluir,
  listarAbastecimentos, registrarAbastecimento, excluirAbastecimento,
  atualizarKm, adicionarKmOdometro, incrementarKmRota,
};
