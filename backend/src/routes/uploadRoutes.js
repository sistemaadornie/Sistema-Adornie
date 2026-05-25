const express = require('express');
const authMiddleware  = require('../middlewares/authMiddleware');
const driveSvc  = require('../services/googleDriveService');
const uploadSvc = require('../services/uploadSessionService');
const db        = require('../database/db');

const router = express.Router();
const CHUNK_SIZE = 5 * 1024 * 1024;

router.post('/iniciar', authMiddleware, async (req, res) => {
  const { pedido_id, pedido_item_id, ordem_servico_id, nome_arquivo,
          tamanho_bytes, mime_type, tipo, hash_md5 } = req.body;

  if (!pedido_id || !pedido_item_id || !nome_arquivo || !tamanho_bytes || !tipo || !mime_type) {
    return res.status(400).json({ message: 'Campos obrigatórios: pedido_id, pedido_item_id, nome_arquivo, tamanho_bytes, tipo, mime_type' });
  }
  if (!['foto', 'video'].includes(tipo)) {
    return res.status(400).json({ message: 'tipo deve ser foto ou video' });
  }

  try {
    const duplicata = await uploadSvc.verificarDuplicata(pedido_id, hash_md5);
    if (duplicata) {
      return res.json({ duplicata: true, midia_id: duplicata.id, drive_url: duplicata.drive_url });
    }

    const { rows: pedidoRows } = await db.query(
      `SELECT p.id, p.numero_sequencial, p.data_pedido, p.empresa_id,
              e.nome AS empresa_nome
       FROM pedidos p
       JOIN empresas e ON e.id = p.empresa_id
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [pedido_id, req.user.empresa_id]
    );
    if (!pedidoRows[0]) return res.status(404).json({ message: 'Pedido não encontrado' });
    const pedido = pedidoRows[0];

    const { rows: itemRows } = await db.query(
      `SELECT id, descricao, COALESCE(ordem, 0) AS ordem
       FROM pedido_itens WHERE id = $1 AND pedido_id = $2`,
      [pedido_item_id, pedido_id]
    );
    if (!itemRows[0]) return res.status(404).json({ message: 'Item não encontrado' });
    const item = itemRows[0];

    const folderId = await driveSvc.getOrCreateOsFolder({
      empresa: { id: pedido.empresa_id, nome: pedido.empresa_nome },
      pedido:  { id: pedido.id, numero_sequencial: pedido.numero_sequencial, data_pedido: pedido.data_pedido },
      item:    { id: item.id, descricao: item.descricao, ordem: item.ordem },
    });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = nome_arquivo.split('.').pop();
    const driveFileName = `${tipo}_${ts}.${ext}`;

    const driveUploadUri = await driveSvc.initiateResumableUpload({
      folderId,
      fileName: driveFileName,
      mimeType: mime_type,
      fileSize: tamanho_bytes,
    });

    const sessao = await uploadSvc.criarSessao({
      pedidoId: pedido_id, pedidoItemId: pedido_item_id, osId: ordem_servico_id ?? null,
      nomeArquivo: driveFileName, tamanhoBytes: tamanho_bytes,
      mimeType: mime_type, tipo, hashMd5: hash_md5 ?? null,
      iniciadoPor: req.user.id, driveUploadUri, driveFolderId: folderId,
    });

    res.json({ upload_session_id: sessao.id, drive_upload_uri: driveUploadUri, chunk_size: CHUNK_SIZE });
  } catch (err) {
    console.error('[uploadRoutes] iniciar:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/:sessionId/status', authMiddleware, async (req, res) => {
  try {
    const sessao = await uploadSvc.buscarStatus(req.params.sessionId, req.user.id);
    if (!sessao) return res.status(404).json({ message: 'Sessão não encontrada' });
    res.json(sessao);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:sessionId/confirmar', authMiddleware, async (req, res) => {
  const { drive_file_id, drive_url, duracao_segundos } = req.body;
  if (!drive_file_id || !drive_url) {
    return res.status(400).json({ message: 'drive_file_id e drive_url obrigatórios' });
  }
  try {
    const result = await uploadSvc.confirmar(req.params.sessionId, {
      driveFileId: drive_file_id, driveUrl: drive_url,
      duracaoSegundos: duracao_segundos ?? null,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.get('/pedidos/:pedidoId/midias', authMiddleware, async (req, res) => {
  try {
    const rows = await uploadSvc.listarPorPedido(Number(req.params.pedidoId), {
      itemId: req.query.item_id ? Number(req.query.item_id) : undefined,
      osId:   req.query.os_id   ? Number(req.query.os_id)   : undefined,
      tipo:   req.query.tipo,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/os/:osId/midias', authMiddleware, async (req, res) => {
  try {
    const rows = await uploadSvc.listarPorOs(Number(req.params.osId));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
